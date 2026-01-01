# Docker Deployment

For production deployments, use Docker with an external crontab handling cache population.

## Prerequisites

- Docker and Docker Compose
- A crontab running `pixi run fetch` to populate the cache directory
- Cache directory accessible to the container

## Running

```bash
# Copy and configure environment
cp .env.example .env
# Edit .env to set CLUSTER_CACHE_FOLDER to your cache directory

# Start
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

## Configuration

Edit `.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8000` | Host port to expose |
| `CLUSTER_CACHE_FOLDER` | `./cache` | Path to cache directory on host |

The container mounts the cache directory as read-only since the crontab handles all cache writes.

## Crontab Setup (on host)

The cache fetcher runs separately from the Docker container:

```bash
# Fetch every 2 minutes
*/2 * * * * cd /path/to/cluster-art && pixi run fetch >> /var/log/cluster-fetch.log 2>&1
```

Make sure `CLUSTER_CACHE_FOLDER` in your crontab environment matches the path in `.env`.

## Building and Pushing to GCR

The Dockerfile clones the repo from GitHub and builds a specific version tag.

```bash
# Authenticate with GCR
gcloud auth configure-docker

# Build a specific version (clones from GitHub)
docker build -t gcr.io/krokicki/cluster-art:v1.0.0 \
    --build-arg VERSION=v1.0.0 \
    .

# Push to GCR
docker push gcr.io/krokicki/cluster-art:v1.0.0

# Optionally tag as latest
docker tag gcr.io/krokicki/cluster-art:v1.0.0 gcr.io/krokicki/cluster-art:latest
docker push gcr.io/krokicki/cluster-art:latest
```

The `VERSION` build arg accepts any git ref (tag, branch, or commit SHA).
