#!/usr/bin/env python3
"""
Simple backend server using FastAPI that:
1. Periodically fetches cluster status from upstream API (every 2 minutes)
2. Caches the response locally
3. Serves the cached data with CORS support
4. Serves the index.html frontend
"""

import asyncio
from datetime import datetime
from typing import Optional, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import httpx

# Configuration
UPSTREAM_URL = "https://cluster-status.int.janelia.org/api/cluster-status"
FETCH_INTERVAL = 120  # 2 minutes in seconds

# Global cache
cached_data: Optional[Dict[str, Any]] = None
last_fetch_time: Optional[datetime] = None
fetch_error: Optional[str] = None


async def fetch_cluster_status():
    """Periodically fetch cluster status from upstream API and cache it"""
    global cached_data, last_fetch_time, fetch_error

    async with httpx.AsyncClient(timeout=30.0) as client:
        while True:
            try:
                print(f"[{datetime.now().isoformat()}] Fetching cluster status...")
                response = await client.get(UPSTREAM_URL)
                response.raise_for_status()

                cached_data = response.json()
                last_fetch_time = datetime.now()
                fetch_error = None

                print(f"[{datetime.now().isoformat()}] Successfully fetched and cached cluster status")

            except Exception as e:
                fetch_error = str(e)
                print(f"[{datetime.now().isoformat()}] Error fetching cluster status: {e}")

            # Wait for next fetch interval
            await asyncio.sleep(FETCH_INTERVAL)


async def initial_fetch():
    """Perform initial fetch on startup"""
    global cached_data, last_fetch_time, fetch_error

    try:
        print("Performing initial fetch...")
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(UPSTREAM_URL)
            response.raise_for_status()
            cached_data = response.json()
            last_fetch_time = datetime.now()
            print(f"[{datetime.now().isoformat()}] Initial fetch successful")
    except Exception as e:
        fetch_error = str(e)
        print(f"[{datetime.now().isoformat()}] Initial fetch failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager for startup and shutdown events"""
    # Startup: perform initial fetch and start background task
    await initial_fetch()
    task = asyncio.create_task(fetch_cluster_status())

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
    allow_origins=["*"],  # Allow all origins
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
    """Serve the cached cluster status with CORS support"""
    if cached_data is None:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Data not yet available",
                "last_error": fetch_error,
                "message": "Backend is still fetching initial data. Please try again in a moment."
            }
        )

    return JSONResponse(content=cached_data)


@app.get("/api/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "ok",
        "last_fetch": last_fetch_time.isoformat() if last_fetch_time else None,
        "has_data": cached_data is not None,
        "last_error": fetch_error
    }


if __name__ == "__main__":
    import uvicorn
    print("Starting FastAPI server on http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)
