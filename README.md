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
- **9 layout modes** - Multiple topology views from linear to radial sunburst (Shift+1-9)
- **Time travel** - Scrub through historical snapshots with playback controls
- **Interactive canvas** - Pan, zoom, and click for details
- **Retro aesthetic** - Green phosphor CRT look with pixel font

## Controls

| Action | Key/Mouse |
|--------|-----------|
| Change color mode | 1-9 |
| Change layout mode | Shift+1-9 |
| Toggle legend | L |
| Toggle time travel | T |
| Toggle help | ? |
| Pan | Click + drag |
| Zoom | +/- or scroll |

## Layout Topologies

Nine layout strategies map cluster resources to spatial positions, each revealing different patterns in the data.

### 1. Linear (Shift+1)
Groups resources by hostname and rasterizes linearly across the canvas, wrapping at edges. Hostnames are sorted alphabetically, so hosts that are physically near (e.g., h04u07, h04u08) appear near each other. Simple and predictable.

### 2. Rack (Shift+2)
Parses hostnames (e.g., "h04u08" → row h04, unit 8) to create a 2D grid matching physical rack positions. Each row forms a column of hosts, with hosts on separate lines. GPUs placed on left, CPUs on right within each host. Racks arranged in a grid targeting square aspect ratio.

### 3. Hardware (Shift+3)
Clusters hosts by hardware group ("8GPU H200", "4GPU L4", etc.) into distinct rectangular regions. Groups sorted alphabetically and arranged in a grid. Good for comparing utilization across different hardware tiers at a glance.

### 4. Users (Shift+4)
Treemap-style layout where each user gets a contiguous rectangular region sized proportionally to their slot count. Users sorted by slot count (largest first) for efficient packing. Idle slots fill remaining space at bottom. Instantly shows who's using the most resources.

### 5. Hilbert (Shift+5)
Space-filling Hilbert curve that preserves locality better than linear rasterization. Resources sorted by hostname, then type (GPU first), then index, so hosts that are "near" in the list stay visually near. The curve folds back on itself to keep neighbors close.

### 6. Spiral (Shift+6)
Starts from center and spirals outward. Resources sorted by utilization—highest utilization (hot) slots in the center, lowest (cool/idle) at the edges. Creates a dramatic focal point showing cluster activity.

### 7. Jobs (Shift+7)
Groups slots by job_id to show job "footprints" across the cluster. Jobs sorted by slot count (largest first) and arranged as rectangular blocks. Reveals which jobs span multiple hosts and their relative sizes. Idle slots fill remaining space.

### 8. Radial Sunburst (Shift+8)
Circular layout with concentric rings organized by hierarchy. Angular segments represent hardware groups (sized by slot count), with hosts as sub-segments within each group. GPUs placed in inner rings, CPUs in outer rings. Creates a striking non-rectangular visualization.

### 9. Idle Compression (Shift+9)
Active slots packed densely at top using full canvas width. Idle slots compressed into a sparser region below with gaps (2x spacing). Emphasizes active usage by making idle resources visually subdued. Clear visual separation between busy and available resources.

## Configuration

Create a `.env` file to override defaults:

```bash
CLUSTER_UPSTREAM_URL=https://your-cluster-api/status
CLUSTER_FETCH_INTERVAL=60
CLUSTER_CACHE_FOLDER=/var/cache/cluster-viz
```

## Requirements

- [Pixi](https://pixi.sh) package manager
