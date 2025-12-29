# Cluster Visualization

Artistic HPC cluster visualization with a vintage video game aesthetic. Prioritizes visual appeal over utility.

## Quick Start

```bash
pixi run serve   # Starts server at http://localhost:8000
```

## Project Structure

```
cluster-art/
├── app.py         # FastAPI backend
├── index.html     # Frontend SPA with all CSS/JS
├── pixi.toml      # Project config and dependencies
├── .env           # Local config overrides (optional, gitignored)
├── cache/         # Cached gzipped JSON files (gitignored)
│   └── <unix_timestamp>.json.gz
└── CLAUDE.md      # This file
```

## Architecture Overview

```
Browser (index.html)          FastAPI (app.py)           Upstream
┌─────────────────┐          ┌──────────────────┐       ┌─────────────┐
│ Canvas 2D API   │◄────────►│ /api/cluster-    │◄─────►│ cluster-    │
│ 9 color modes   │  JSON    │ status (cached)  │ every │ status.int. │
│ Pan/zoom/modal  │          │                  │ 2min  │ janelia.org │
└─────────────────┘          └──────────────────┘       └─────────────┘
```

## Backend (app.py)

- **Framework**: FastAPI with Uvicorn
- **Endpoints**:
  - `GET /` - Serves index.html
  - `GET /api/cluster-status` - Returns latest cached file (fetches if none exists)
  - `GET /api/health` - Health check with cache info
- **Background task**: Fetches upstream data periodically, optimizes and saves to disk
- **File caching**: Each fetch transformed, gzipped, and saved as `<timestamp>.json.gz`
- **Gzip serving**: Files served with `Content-Encoding: gzip` for automatic browser decompression
- **CORS**: Enabled for all origins

### Configuration (Pydantic Settings)

Settings loaded from environment variables with `CLUSTER_` prefix, or from `.env` file:

| Setting | Env Variable | Default |
|---------|--------------|---------|
| `upstream_url` | `CLUSTER_UPSTREAM_URL` | `https://cluster-status.int.janelia.org/api/cluster-status` |
| `fetch_interval` | `CLUSTER_FETCH_INTERVAL` | `120` (seconds) |
| `cache_folder` | `CLUSTER_CACHE_FOLDER` | `cache` |

Example `.env` file:
```bash
CLUSTER_UPSTREAM_URL=https://my-cluster.example.com/api/status
CLUSTER_FETCH_INTERVAL=60
CLUSTER_CACHE_FOLDER=/var/cache/cluster-viz
```

### Cache Files

- Stored in `cache/` folder (configurable)
- Filename format: `<unix_timestamp>.json.gz` (timestamp from `fetchedAt` field)
- Data is optimized before saving (redundant fields removed, slots sparsified)
- Latest file served on API request with `Content-Encoding: gzip`
- On startup, uses existing cache if available

## Frontend (index.html)

Single-file SPA with HTML, CSS, and JavaScript combined.

### Key Classes

**Resource** - Represents a single CPU or GPU slot:
```javascript
class Resource {
  hostname, type, index, user, x, y, gpuType, hardwareGroup,
  utilization, status, load, jobId, jobName
}
```

**Layout Strategies** - Calculate grid positions:
- `HostnameHierarchyLayout` - Groups by hostname (default)
- `UserGroupLayout` - Groups by user (alternative)

**Color Strategies** - 9 visualization modes:
| Key | Strategy               | Description                      |
|-----|------------------------|----------------------------------|
| 1   | UserColorStrategy      | Distinct color per user          |
| 2   | HostnameColorStrategy  | Random color per hostname        |
| 3   | RowColorStrategy       | Color by row prefix (e.g. "h04") |
| 4   | TypeColorStrategy      | Color by hardware group          |
| 5   | GpuTypeColorStrategy   | Color by GPU type                |
| 6   | UtilizationColorStrategy | Heat map by CPU utilization    |
| 7   | StatusColorStrategy    | Green=in-use, gray=idle          |
| 8   | HostStatusColorStrategy | Color by host status            |
| 9   | MemoryLoadColorStrategy | Heat map by available memory    |

### Key Frontend Constants

```javascript
const PIXEL_SIZE = 8;        // Base square size in pixels
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3.0;
const ZOOM_STEP = 0.1;
const MIN_CANVAS_SIZE = 200;
// Default canvas: 1200x800
```

### Data Flow

1. `init()` parses URL state, sets up canvas, calls `loadClusterData()`
2. `loadClusterData()` fetches `/api/cluster-status`
3. Response processed into `Resource` objects from `hostDetails`
4. Job info looked up from `raw.jobs` and `raw.gpu_attribution`
5. Color strategies initialized with resources
6. Layout strategy calculates x,y positions
7. `draw()` renders to canvas using current color strategy

### State Persistence

All UI state saved to URL hash:
- Canvas position and size
- Zoom level
- Color mode (1-9)
- Panel visibility (help, legend)

### Adding a New Color Strategy

1. Create class implementing:
   ```javascript
   class MyColorStrategy {
     initialize(resources) { /* precompute colors */ }
     getColor(resource) { /* return {r, g, b} */ }
     getLegendItems(resources) { /* return [{color, label, count}] */ }
   }
   ```
2. Add to `colorStrategies` array
3. Update `COLOR_MODES` count
4. Add keyboard handler in `handleKeyDown`

### Adding a New Layout Strategy

1. Create class implementing:
   ```javascript
   class MyLayout {
     apply(resources, canvasWidth, canvasHeight) {
       // Set resource.x and resource.y for each resource
       return { width, height }; // required grid dimensions
     }
   }
   ```
2. Replace `currentLayoutStrategy` assignment

## JSON Schema (Optimized)

The cached JSON is optimized for size (~96% reduction via gzip + schema optimization).

### Primary Data Structure

```typescript
interface OptimizedClusterStatus {
  hostDetails: HostDetail[];
  activeUsers: number;
  userJobStats: { [username: string]: UserStats };
  motd: string;
  fetchedAt: string; // ISO 8601
  raw: {
    jobs: { all: Job[] };       // gpu_jobs removed (redundant)
    gpu_attribution: GpuAttribution[];
  };
  // Removed: hosts, cpus, gpus (computable from hostDetails)
  // Removed: hardwareGroups (embedded in hostDetails)
  // Removed: raw.hosts, raw.metadata (redundant)
}
```

### HostDetail (main visualization data)

```typescript
interface HostDetail {
  hostname: string;          // e.g., "h04u08"
  status: string;            // e.g., "closed_Full", "ok"
  cpus: { total: number; used: number; idle: number };
  gpus: { total: number; used: number; idle: number };
  utilization: number;       // 0-100 percentage
  users: string[];           // unique users on this host
  gpu_type: string;          // e.g., "NVIDIAH200", "TeslaT4", "NVIDIAL4"
  hardwareGroup: string;     // e.g., "8GPU H200" (embedded, not looked up)
  cpuSlots: { [index: string]: string };  // Sparse: {"0": "user1", "5": "user2"}
  gpuSlots: { [index: string]: string };  // Sparse: only occupied slots
  load: {
    r15s: number;            // load average 15 seconds
    r1m: number;             // load average 1 minute
    r15m: number;            // load average 15 minutes
    ut: number;              // CPU utilization percentage
    mem: number;             // memory in MB
    io: number;              // disk I/O in KB/s
    pg: number;              // paging
    tmp: number;             // temp space in MB
    swp: number;             // swap usage
    load_status: string;     // e.g., "ok"
  };
}
```

### Job Info (for modal details)

```typescript
interface Job {
  job_id: string;
  job_name: string;
  user: string;
  status: string;            // "RUN", "PEND", etc.
  exec_host: string;
  resource_requirements: string;
  start_time: string;
  submit_time: string;
  run_time_seconds: number;
}

interface GpuAttribution {
  hostname: string;
  gpu_id: number;
  job_id: string;
  job_name: string;
  user: string;
  status: string;
}
```

### Schema Optimization Summary

JSON Schema files are available in `schemas/`:
- `original.schema.json` - Upstream API format
- `optimized.schema.json` - Cached/served format

#### Fields Removed (redundant/computable)

| Field | Reason |
|-------|--------|
| `hosts` | Computable: `total` = hostDetails.length |
| `cpus` | Computable: sum of hostDetails[].cpus |
| `gpus` | Computable: sum of hostDetails[].gpus |
| `hardwareGroups` | Embedded as `hardwareGroup` in each hostDetail |
| `raw.hosts` | Exact duplicate of hostDetails load metrics |
| `raw.metadata` | Only contains derivable counts |
| `raw.jobs.gpu_jobs` | Redundant with `gpu_attribution` |

#### Fields Modified

| Field | Original | Optimized |
|-------|----------|-----------|
| `cpuSlots` | `string[]` with empty strings for idle | `{[index]: string}` sparse object |
| `gpuSlots` | `string[]` with empty strings for idle | `{[index]: string}` sparse object |

#### Fields Added

| Field | Location | Description |
|-------|----------|-------------|
| `hardwareGroup` | `hostDetails[]` | Hardware group name (was top-level lookup) |

#### Size Impact

| Stage | Size |
|-------|------|
| Original JSON | ~600 KB |
| Schema optimization | ~510 KB |
| + gzip compression | ~23 KB |
| **Total reduction** | **~96%** |

## Styling

- **Theme**: Retro CRT monitor (green on black with glow)
- **Font**: "Press Start 2P" (Google Fonts)
- **Primary colors**: Lime (#00ff00), Cyan (#00ffff), Yellow (#ffff00), Magenta (#ff00ff)
- **Shadow**: 8px offset black

## User Interactions

| Action | Effect |
|--------|--------|
| Drag canvas | Pan view |
| Drag corners | Resize canvas |
| +/- buttons or scroll | Zoom (0.5x - 3.0x) |
| Hover resource | Show tooltip |
| Click resource | Open detail modal |
| Arrow keys (in modal) | Navigate resources |
| Keys 1-9 | Change color mode |
| ? | Toggle help panel |
