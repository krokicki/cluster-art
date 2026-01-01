#!/usr/bin/env python3
"""
Standalone cache fetcher for cluster status data.

Can be run directly via cron or imported by app.py.

Usage:
    python fetch_cache.py           # Fetch once and exit
    python fetch_cache.py --help    # Show options
"""

import gzip
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, Any

import httpx
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""
    upstream_url: str = "https://cluster-status.int.janelia.org/api/cluster-status"
    fetch_interval: int = 120  # seconds
    cache_folder: Path = Path("cache")
    disable_fetch: bool = False  # Set to True for read-only cache deployments

    model_config = {
        "env_prefix": "CLUSTER_",
        "env_file": ".env",
    }


def get_settings() -> Settings:
    """Get settings instance (allows for testing with different settings)"""
    return Settings()


def ensure_cache_folder(settings: Settings):
    """Ensure the cache folder exists"""
    settings.cache_folder.mkdir(parents=True, exist_ok=True)


def get_cache_path_for_timestamp(timestamp: int, cache_folder: Path) -> Path:
    """Get the hierarchical cache path for a given unix timestamp.

    Returns path in format: <cache_folder>/YYYYMM/DD/<timestamp>.json.gz
    Uses UTC to ensure consistent paths regardless of local timezone.
    """
    dt = datetime.fromtimestamp(timestamp, timezone.utc)
    year_month = dt.strftime("%Y%m")
    day = dt.strftime("%d")
    return cache_folder / year_month / day / f"{timestamp}.json.gz"


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


def save_to_cache(data: Dict[str, Any], settings: Settings) -> Path:
    """Save optimized, gzipped data to cache with unix timestamp filename.

    Files are stored in hierarchical structure: <cache_folder>/YYYYMM/DD/<timestamp>.json.gz
    """
    ensure_cache_folder(settings)

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

    # Get hierarchical path and ensure parent directories exist
    filepath = get_cache_path_for_timestamp(timestamp, settings.cache_folder)
    filepath.parent.mkdir(parents=True, exist_ok=True)

    with gzip.open(filepath, 'wt', encoding='utf-8') as f:
        json.dump(optimized_data, f)

    return filepath


def fetch_and_cache(settings: Optional[Settings] = None) -> Optional[Path]:
    """Fetch cluster status from upstream API and save to cache.

    This is a synchronous function suitable for cron jobs.

    Returns:
        Path to the saved cache file, or None if fetch failed.
    """
    if settings is None:
        settings = get_settings()

    try:
        print(f"[{datetime.now().isoformat()}] Fetching cluster status from {settings.upstream_url}...")

        with httpx.Client(timeout=30.0) as client:
            response = client.get(settings.upstream_url)
            response.raise_for_status()

            data = response.json()
            filepath = save_to_cache(data, settings)

            print(f"[{datetime.now().isoformat()}] Saved to {filepath}")
            return filepath

    except Exception as e:
        print(f"[{datetime.now().isoformat()}] Error fetching cluster status: {e}", file=sys.stderr)
        return None


async def fetch_and_cache_async(settings: Optional[Settings] = None) -> Optional[Path]:
    """Async version of fetch_and_cache for use in FastAPI.

    Returns:
        Path to the saved cache file, or None if fetch failed.
    """
    if settings is None:
        settings = get_settings()

    try:
        print(f"[{datetime.now().isoformat()}] Fetching cluster status from {settings.upstream_url}...")

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(settings.upstream_url)
            response.raise_for_status()

            data = response.json()
            filepath = save_to_cache(data, settings)

            print(f"[{datetime.now().isoformat()}] Saved to {filepath}")
            return filepath

    except Exception as e:
        print(f"[{datetime.now().isoformat()}] Error fetching cluster status: {e}", file=sys.stderr)
        return None


def main():
    """Main entry point for standalone execution."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Fetch cluster status and save to cache"
    )
    parser.add_argument(
        "--cache-folder",
        type=Path,
        help="Override cache folder location"
    )
    parser.add_argument(
        "--upstream-url",
        help="Override upstream API URL"
    )
    args = parser.parse_args()

    # Load settings and apply overrides
    settings = get_settings()
    if args.cache_folder:
        settings.cache_folder = args.cache_folder
    if args.upstream_url:
        settings.upstream_url = args.upstream_url

    print(f"Configuration:")
    print(f"  Upstream URL: {settings.upstream_url}")
    print(f"  Cache folder: {settings.cache_folder.absolute()}")

    result = fetch_and_cache(settings)

    if result is None:
        sys.exit(1)

    sys.exit(0)


if __name__ == "__main__":
    main()
