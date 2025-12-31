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

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, Response
from fastapi.middleware.cors import CORSMiddleware

from fetch_cache import Settings, get_settings, fetch_and_cache_async, get_cache_path_for_timestamp

settings = get_settings()

# Global state
last_fetch_time: Optional[datetime] = None
fetch_error: Optional[str] = None


def get_timestamp_from_path(p: Path) -> int:
    """Extract unix timestamp from cache file path"""
    stem = p.stem
    if stem.endswith('.json'):  # Handle .json.gz case
        stem = stem[:-5]
    try:
        return int(stem)
    except ValueError:
        return 0


def get_latest_cached_file() -> Optional[Path]:
    """Get the most recent cached JSON file (gzipped or plain)"""
    if not settings.cache_folder.exists():
        return None

    # Check for gzipped files first (hierarchical and flat), then plain JSON for backwards compatibility
    gz_files = list(settings.cache_folder.glob("**/*.json.gz"))
    json_files = list(settings.cache_folder.glob("**/*.json"))

    all_files = gz_files + json_files
    if not all_files:
        return None

    return max(all_files, key=get_timestamp_from_path)


def get_all_cache_timestamps() -> list[int]:
    """Get all available cache timestamps, sorted ascending"""
    if not settings.cache_folder.exists():
        return []

    # Search hierarchical and flat structure
    gz_files = list(settings.cache_folder.glob("**/*.json.gz"))
    json_files = list(settings.cache_folder.glob("**/*.json"))
    all_files = gz_files + json_files

    timestamps = [get_timestamp_from_path(f) for f in all_files if get_timestamp_from_path(f) > 0]
    return sorted(timestamps)


def get_cache_file_by_timestamp(timestamp: int) -> Optional[Path]:
    """Get cache file for a specific timestamp, or closest available"""
    timestamps = get_all_cache_timestamps()
    if not timestamps:
        return None

    # Find exact match first
    if timestamp in timestamps:
        target_ts = timestamp
    else:
        # Find closest timestamp
        closest = min(timestamps, key=lambda t: abs(t - timestamp))
        target_ts = closest

    # Try hierarchical path first (gzipped)
    gz_path = get_cache_path_for_timestamp(target_ts, settings.cache_folder)
    if gz_path.exists():
        return gz_path

    # Fall back to flat structure for backwards compatibility
    flat_gz_path = settings.cache_folder / f"{target_ts}.json.gz"
    if flat_gz_path.exists():
        return flat_gz_path

    flat_json_path = settings.cache_folder / f"{target_ts}.json"
    if flat_json_path.exists():
        return flat_json_path

    return None


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


async def fetch_and_cache() -> Optional[Path]:
    """Fetch cluster status from upstream API and save to cache"""
    global last_fetch_time, fetch_error

    result = await fetch_and_cache_async(settings)

    if result is not None:
        last_fetch_time = datetime.now()
        fetch_error = None
    else:
        fetch_error = "Fetch failed"

    return result


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


@app.get("/api/cluster-status/{timestamp}")
async def get_cluster_status_at(timestamp: int):
    """Serve cluster status at or nearest to the given timestamp"""
    cache_file = get_cache_file_by_timestamp(timestamp)

    if cache_file is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "No cached data available", "requested_timestamp": timestamp}
        )

    # Serve gzipped file directly with Content-Encoding header
    if cache_file.suffix == '.gz':
        with open(cache_file, 'rb') as f:
            content = f.read()
        return Response(
            content=content,
            media_type='application/json',
            headers={'Content-Encoding': 'gzip'}
        )
    else:
        with open(cache_file, 'r') as f:
            content = f.read()
        return Response(
            content=content,
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


@app.get("/api/timepoints")
async def get_timepoints(
    start: Optional[int] = None,  # Unix timestamp for window start
    days: int = Query(default=7, ge=1, le=365)  # Window size in days
):
    """Return metadata about available cached timepoints within a date range.

    Args:
        start: Unix timestamp for window start. Defaults to (now - days).
        days: Number of days in window. Defaults to 7, max 365.
    """
    all_timestamps = get_all_cache_timestamps()

    if not all_timestamps:
        return {
            "first": None, "last": None, "count": 0, "timestamps": [],
            "window_start": None, "window_end": None, "available_range": None
        }

    # Calculate window bounds
    now = int(datetime.now().timestamp())
    window_seconds = days * 86400

    if start is None:
        start = now - window_seconds

    end = start + window_seconds

    # Filter timestamps to window
    filtered = [ts for ts in all_timestamps if start <= ts <= end]

    return {
        "first": filtered[0] if filtered else None,
        "last": filtered[-1] if filtered else None,
        "count": len(filtered),
        "timestamps": filtered,
        "window_start": start,
        "window_end": end,
        "available_range": {
            "earliest": all_timestamps[0],
            "latest": all_timestamps[-1]
        }
    }


if __name__ == "__main__":
    import uvicorn
    print("Starting FastAPI server on http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
