# Docker Deployment

For production deployments, use Docker with an external crontab handling cache population.

## Prerequisites

- Docker and Docker Compose
- A crontab running `pixi run fetch` to populate the cache directory
- Cache directory accessible to the container

## Running

```bash
# Copy and configure environment
cp env.template .env
# Edit .env to configure ports, cache directory, and TLS certificates

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
| `SERVICE_PORT` | `8000` | Host port for direct Python service access |
| `NGINX_PORT` | `9443` | Host port for HTTPS access via Nginx |
| `CACHE_FOLDER` | - | Path to cache directory on host |
| `CERT_FILE` | - | Path to TLS certificate |
| `KEY_FILE` | - | Path to TLS private key |

The container runs with `CLUSTER_DISABLE_FETCH=true` and mounts the cache directory as read-only. All cache writes are handled by an external crontab.

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
cd docker/
export VERSION=<version>
docker buildx build --platform linux/amd64,linux/arm64 --build-arg GIT_TAG=$VERSION -t ghcr.io/krokicki/cluster-art:$VERSION -t ghcr.io/krokicki/cluster-art:latest --push .
```
