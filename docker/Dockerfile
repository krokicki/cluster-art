# Cluster Art production server using Pixi
# Clones from GitHub and builds a specific version tag

ARG VERSION=1.0.0

FROM ghcr.io/prefix-dev/pixi:latest AS builder

ARG VERSION

WORKDIR /app

# Install git and clone repo
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*

# Clone repo and checkout version tag
RUN git clone --branch $VERSION --depth 1 https://github.com/krokicki/cluster-art.git .

# Install dependencies and build frontend
RUN pixi install && \
    pixi run install && \
    pixi run build


# Production stage
FROM ghcr.io/prefix-dev/pixi:latest

WORKDIR /app

# Copy built application from builder
COPY --from=builder /app/pixi.toml /app/pixi.lock ./
COPY --from=builder /app/cluster_art/ ./cluster_art/
COPY --from=builder /app/static/ ./static/
COPY --from=builder /app/index.html ./
COPY --from=builder /app/dist ./dist

# Install runtime dependencies
RUN pixi install

# Create non-root user
RUN useradd --create-home --shell /bin/bash appuser && \
    chown -R appuser:appuser /app

USER appuser

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD pixi run python -c "import httpx; httpx.get('http://localhost:8000/api/health').raise_for_status()"

# Run server
CMD ["pixi", "run", "serve"]
