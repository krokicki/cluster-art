#!/usr/bin/env python3
"""
Simple backend server using FastAPI that:
1. Periodically fetches cluster status from upstream API
2. Saves each fetch to disk with timestamp filename
3. Serves the latest cached file with CORS support
4. Serves the index.html frontend
"""

import asyncio
import gzip
import json
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic_settings import BaseSettings
import httpx


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    upstream_url: str = "https://cluster-status.int.janelia.org/api/cluster-status"
    fetch_interval: int = 120  # seconds
    cache_folder: Path = Path("cache")

    model_config = {
        "env_prefix": "CLUSTER_",
        "env_file": ".env",
    }


settings = Settings()

# Global state
last_fetch_time: Optional[datetime] = None
fetch_error: Optional[str] = None


def ensure_cache_folder():
    """Ensure the cache folder exists"""
    settings.cache_folder.mkdir(parents=True, exist_ok=True)


def transform_to_optimized(data: Dict[str, Any]) -> Dict[str, Any]:
    """Transform upstream data to optimized format.

    Optimizations:
    - Remove redundant data (raw.hosts, summaries, raw.metadata, raw.jobs.gpu_jobs)
    - Convert slot arrays to sparse format
    - Embed hardwareGroup directly in hostDetails
    """
    # Build hostname -> hardwareGroup mapping
    hostname_to_group = {}
    for group_name, hostnames in data.get('hardwareGroups', {}).items():
        for hostname in hostnames:
            hostname_to_group[hostname] = group_name

    # Transform hostDetails
    optimized_host_details = []
    for host in data.get('hostDetails', []):
        # Convert slot arrays to sparse format (only non-empty slots)
        cpu_slots_sparse = {
            str(i): user
            for i, user in enumerate(host.get('cpuSlots', []))
            if user
        }
        gpu_slots_sparse = {
            str(i): user
            for i, user in enumerate(host.get('gpuSlots', []))
            if user
        }

        optimized_host = {
            **host,
            'cpuSlots': cpu_slots_sparse,
            'gpuSlots': gpu_slots_sparse,
            'hardwareGroup': hostname_to_group.get(host['hostname'], 'Unknown')
        }
        optimized_host_details.append(optimized_host)

    # Build optimized structure (removed: hosts, cpus, gpus, hardwareGroups, raw.hosts, raw.metadata, raw.jobs.gpu_jobs)
    return {
        'hostDetails': optimized_host_details,
        'activeUsers': data.get('activeUsers'),
        'userJobStats': data.get('userJobStats'),
        'motd': data.get('motd'),
        'fetchedAt': data.get('fetchedAt'),
        'raw': {
            'jobs': {
                'all': data.get('raw', {}).get('jobs', {}).get('all', [])
            },
            'gpu_attribution': data.get('raw', {}).get('gpu_attribution', [])
        }
    }


def get_latest_cached_file() -> Optional[Path]:
    """Get the most recent cached JSON file (gzipped or plain)"""
    if not settings.cache_folder.exists():
        return None

    # Check for gzipped files first, then plain JSON for backwards compatibility
    gz_files = list(settings.cache_folder.glob("*.json.gz"))
    json_files = list(settings.cache_folder.glob("*.json"))

    all_files = gz_files + json_files
    if not all_files:
        return None

    # Extract timestamp from filename (handles both .json and .json.gz)
    def get_timestamp(p: Path) -> int:
        stem = p.stem
        if stem.endswith('.json'):  # Handle .json.gz case
            stem = stem[:-5]
        try:
            return int(stem)
        except ValueError:
            return 0

    return max(all_files, key=get_timestamp)


def load_cached_data() -> Optional[Dict[str, Any]]:
    """Load data from the latest cached file (gzip or plain)"""
    latest_file = get_latest_cached_file()
    if latest_file is None:
        return None

    try:
        if latest_file.suffix == '.gz':
            with gzip.open(latest_file, 'rt', encoding='utf-8') as f:
                return json.load(f)
        else:
            with open(latest_file, 'r') as f:
                return json.load(f)
    except Exception as e:
        print(f"Error loading cached file {latest_file}: {e}")
        return None


def save_to_cache(data: Dict[str, Any]) -> Path:
    """Save optimized, gzipped data to cache with unix timestamp filename"""
    ensure_cache_folder()

    # Parse fetchedAt ISO timestamp and convert to unix timestamp
    fetched_at = data.get("fetchedAt", "")
    try:
        dt = datetime.fromisoformat(fetched_at.replace("Z", "+00:00"))
        timestamp = int(dt.timestamp())
    except (ValueError, AttributeError):
        # Fallback to current time if fetchedAt is missing or invalid
        timestamp = int(datetime.now().timestamp())

    # Transform to optimized format
    optimized_data = transform_to_optimized(data)

    # Save as gzipped JSON
    filepath = settings.cache_folder / f"{timestamp}.json.gz"

    with gzip.open(filepath, 'wt', encoding='utf-8') as f:
        json.dump(optimized_data, f)

    return filepath


async def fetch_and_cache() -> Optional[Dict[str, Any]]:
    """Fetch cluster status from upstream API and save to cache"""
    global last_fetch_time, fetch_error

    try:
        print(f"[{datetime.now().isoformat()}] Fetching cluster status from {settings.upstream_url}...")
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(settings.upstream_url)
            response.raise_for_status()

            data = response.json()
            filepath = save_to_cache(data)
            last_fetch_time = datetime.now()
            fetch_error = None

            print(f"[{datetime.now().isoformat()}] Saved to {filepath}")
            return data

    except Exception as e:
        fetch_error = str(e)
        print(f"[{datetime.now().isoformat()}] Error fetching cluster status: {e}")
        return None


async def periodic_fetch():
    """Periodically fetch cluster status from upstream API"""
    while True:
        await fetch_and_cache()
        await asyncio.sleep(settings.fetch_interval)


async def initial_fetch():
    """Perform initial fetch on startup if no cached data exists"""
    global last_fetch_time

    # Check if we have cached data already
    cached = load_cached_data()
    if cached is not None:
        latest_file = get_latest_cached_file()
        if latest_file:
            # Parse unix timestamp from filename
            try:
                unix_ts = int(latest_file.stem)
                last_fetch_time = datetime.fromtimestamp(unix_ts)
                print(f"[{datetime.now().isoformat()}] Using cached file: {latest_file}")
                return
            except ValueError:
                pass

    # No valid cache, fetch fresh data
    print("No cached data found, performing initial fetch...")
    await fetch_and_cache()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager for startup and shutdown events"""
    print(f"Configuration:")
    print(f"  Upstream URL: {settings.upstream_url}")
    print(f"  Fetch interval: {settings.fetch_interval}s")
    print(f"  Cache folder: {settings.cache_folder.absolute()}")

    # Startup: perform initial fetch and start background task
    await initial_fetch()
    task = asyncio.create_task(periodic_fetch())

    yield

    # Shutdown: cancel background task
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


# Create FastAPI app with lifespan manager
app = FastAPI(
    title="Cluster Visualization Backend",
    description="Backend API for cluster status visualization",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def index():
    """Serve the index.html file"""
    return FileResponse("index.html")


@app.get("/api/cluster-status")
async def get_cluster_status():
    """Serve the latest cached cluster status with gzip compression"""
    latest_file = get_latest_cached_file()

    if latest_file is None:
        # No cache exists, try to fetch now
        await fetch_and_cache()
        latest_file = get_latest_cached_file()

    if latest_file is None:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Data not available",
                "last_error": fetch_error,
                "message": "Could not fetch or load cluster data. Please try again."
            }
        )

    # Serve gzipped file directly with Content-Encoding header
    if latest_file.suffix == '.gz':
        with open(latest_file, 'rb') as f:
            content = f.read()
        return Response(
            content=content,
            media_type='application/json',
            headers={'Content-Encoding': 'gzip'}
        )
    else:
        # Fallback for old non-gzipped files
        data = load_cached_data()
        if data is None:
            raise HTTPException(status_code=503, detail="Could not load cached data")
        return Response(
            content=json.dumps(data),
            media_type='application/json'
        )


@app.get("/api/health")
async def health():
    """Health check endpoint"""
    latest_file = get_latest_cached_file()
    return {
        "status": "ok",
        "last_fetch": last_fetch_time.isoformat() if last_fetch_time else None,
        "latest_cache_file": str(latest_file) if latest_file else None,
        "cache_folder": str(settings.cache_folder.absolute()),
        "last_error": fetch_error
    }


if __name__ == "__main__":
    import uvicorn
    print("Starting FastAPI server on http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
