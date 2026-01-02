# Cluster Art

Artistic HPC cluster visualization with a vintage video game aesthetic.

<img width="3022" height="1720" alt="Screenshot 2025-12-31 at 12-43-35 Cluster Resource Visualization" src="https://github.com/user-attachments/assets/56adb541-1079-492a-882a-78d666a56a2f" />


## Quick Start

```bash
pixi install
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

## Color Modes

Nine color strategies visualize different attributes of cluster resources. Press L to toggle the legend panel.

### 1. User (Key 1)
Assigns a distinct color to each active user using evenly-spaced hues around the HSL color wheel. Idle slots appear dark gray (#2a2a2a). Legend shows users sorted by slot count (highest first). Best for seeing who's using what.

### 2. Hostname (Key 2)
Deterministic hash-based coloring where each hostname maps to a consistent HSL color derived from its string hash. Same hostname always gets the same color across sessions. Useful for tracking specific hosts.

### 3. Row (Key 3)
Colors slots by rack row prefix (e.g., "h04" from "h04u08"). Uses a curated palette of 20 visually distinct colors (red, green, yellow, blue, orange, purple, cyan, magenta, etc.) cycling for additional rows. Shows physical rack groupings.

### 4. Hardware Group (Key 4)
Pre-defined colors for hardware configurations like "CPU + T4", "8GPU H200", "4GPU A100", etc. Quickly identifies different hardware tiers and their distribution across the cluster.

### 5. GPU Type (Key 5)
Distinct color per GPU model (H200, H100, A100, L4, T4, etc.). CPU-only slots get a separate color. Shows GPU diversity and where specific accelerators are located.

### 6. Utilization (Key 6)
Heat map based on CPU utilization percentage. Blue (0%) → cyan → green → yellow → red (100%). Immediately shows hot spots and underutilized resources.

### 7. Status (Key 7)
Binary coloring: bright green (#44ff44) for in-use slots, dark gray (#2a2a2a) for idle. Simplest view of cluster occupancy—just busy vs. available.

### 8. Host Status (Key 8)
Colors by host status string (e.g., "ok", "closed_Full", "closed_Excl"). Each unique status gets a distinct color. Sorted by count in legend. Useful for identifying problematic or reserved hosts.

### 9. Memory Load (Key 9)
Heat map by available memory (from host load metrics). Red (low/constrained) → yellow → green → cyan → blue (high/available). Inverted from utilization—blue means healthy memory headroom.

## Configuration

Create a `.env` file to override defaults:

```bash
CLUSTER_UPSTREAM_URL=https://your-cluster-api/status
CLUSTER_FETCH_INTERVAL=60
CLUSTER_CACHE_FOLDER=/var/cache/cluster-viz
```

## Running the Cache Fetcher via Cron

The cache fetcher can run independently of the web server, useful for populating the cache on a schedule.

### Standalone Fetcher

```bash
pixi run fetch
```

### Crontab Configuration

To fetch every 2 minutes (matching the default interval):

```bash
# Edit crontab
crontab -e

# Add this line (adjust path as needed):
*/2 * * * * cd /path/to/cluster-art && pixi run fetch >> /var/log/cluster-fetch.log 2>&1
```

When using cron, disable the server's background fetcher by setting a very long interval:

```bash
# .env
CLUSTER_FETCH_INTERVAL=999999
```

## Docker Deployment

See [docker/README.md](docker/README.md) for production deployment with Docker and GCR.

## Requirements

- [Pixi](https://pixi.sh) package manager
