# Cluster Art

Artistic HPC cluster visualization with a vintage video game aesthetic.

![Retro CRT style](https://img.shields.io/badge/style-retro%20CRT-00ff00?style=flat-square)

## Quick Start

```bash
pixi run serve
```

Then open http://localhost:8000

## Features

- **9 color modes** - View by user, hostname, GPU type, utilization, and more (keys 1-9)
- **Layout modes** - Switch between linear and rack topology views (Shift+1-2)
- **Time travel** - Scrub through historical snapshots with playback controls
- **Interactive canvas** - Pan, zoom, and click for details
- **Retro aesthetic** - Green phosphor CRT look with pixel font

## Controls

| Action | Key/Mouse |
|--------|-----------|
| Change color mode | 1-9 |
| Change layout mode | Shift+1-2 |
| Toggle legend | L |
| Toggle time travel | T |
| Toggle help | ? |
| Pan | Click + drag |
| Zoom | +/- or scroll |

## Configuration

Create a `.env` file to override defaults:

```bash
CLUSTER_UPSTREAM_URL=https://your-cluster-api/status
CLUSTER_FETCH_INTERVAL=60
CLUSTER_CACHE_FOLDER=/var/cache/cluster-viz
```

## Requirements

- [Pixi](https://pixi.sh) package manager
