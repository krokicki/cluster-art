# Cluster Visualization

Artistic HPC cluster visualization with a vintage video game aesthetic. Prioritizes visual appeal over utility.

## Quick Start

```bash
pixi run serve   # Starts server at http://localhost:8000
pixi run fetch   # Manual fetch (for cron jobs)
```

## Project Structure

```
cluster-art/
├── cluster_art/           # Python package
│   ├── __init__.py        # Package marker
│   ├── app.py             # FastAPI backend
│   ├── fetch_cache.py     # Data fetching, caching, and settings
│   └── migrate_cache.py   # Cache migration utility (flat → hierarchical)
├── static/                # Frontend assets
│   ├── css/
│   │   └── styles.css     # Retro CRT styling
│   └── js/
│       ├── main.js        # Application entry point
│       ├── models.js      # Resource class
│       ├── config.js      # Constants and palettes
│       ├── layouts.js     # 9 layout strategies
│       ├── colors.js      # 9 color strategies
│       ├── state.js       # Global state management
│       └── timetravel.js  # Historical playback
├── schemas/               # JSON schema documentation
│   ├── original.schema.json
│   └── optimized.schema.json
├── cache/                 # Cached gzipped JSON files (gitignored)
│   └── YYYYMM/DD/<timestamp>.json.gz
├── index.html             # Frontend SPA shell
├── pixi.toml              # Project config and dependencies
├── .env                   # Local config overrides (optional, gitignored)
└── CLAUDE.md              # This file
```

## Architecture Overview

```
Browser                           FastAPI (cluster_art/)      Upstream
┌───────────────────────┐        ┌──────────────────┐       ┌─────────────┐
│ Canvas 2D API         │◄──────►│ /api/cluster-    │◄─────►│ cluster-    │
│ 9 color modes         │  JSON  │ status (cached)  │ every │ status.int. │
│ 9 layout modes        │        │                  │ 2min  │ janelia.org │
│ Pan/zoom/time-travel  │        └──────────────────┘       └─────────────┘
└───────────────────────┘
     static/js modules
```

## Backend (cluster_art/)

- **Framework**: FastAPI with Uvicorn
- **Endpoints**:
  - `GET /` - Serves index.html
  - `GET /api/cluster-status` - Returns latest cached file (fetches if none exists)
  - `GET /api/cluster-status/{timestamp}` - Returns cached file at or nearest to given unix timestamp
  - `GET /api/health` - Health check with cache info
  - `GET /api/timepoints` - Returns `{first, last, count, timestamps[]}` for all cached files within optional date window
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
- **Hierarchical structure**: `YYYYMM/DD/<unix_timestamp>.json.gz`
- Backwards compatible with legacy flat structure (`<timestamp>.json.gz`)
- Data is optimized before saving (redundant fields removed, slots sparsified)
- Latest file served on API request with `Content-Encoding: gzip`
- On startup, uses existing cache if available

### Cache Migration

To migrate from flat to hierarchical cache structure:
```bash
python -m cluster_art.migrate_cache           # Run migration
python -m cluster_art.migrate_cache --dry-run # Preview only
```

## Frontend (static/)

Modular ES6 JavaScript application with separated CSS.

### Module Structure

| Module | Purpose |
|--------|---------|
| `main.js` | Application entry, canvas rendering, event handling |
| `models.js` | Resource class representing CPU/GPU slots |
| `config.js` | Constants, color palettes, configuration |
| `layouts.js` | 9 layout strategy implementations |
| `colors.js` | 9 color strategy implementations |
| `state.js` | Global state management with setters |
| `timetravel.js` | Historical playback with date range picker |

### Key Classes

**Resource** (`models.js`) - Represents a single CPU or GPU slot:
```javascript
class Resource {
  hostname, type, index, user, x, y, gpuType, hardwareGroup,
  utilization, status, load, jobId, jobName

  get isIdle()  // true if user is null or empty
  get row()     // extracts prefix like "h04" from "h04u08"
}
```

### Layout Strategies (`layouts.js`)

9 topology modes (Shift+N to switch):

| Key | Strategy | Description |
|-----|----------|-------------|
| Shift+1 | HostnameHierarchyLayout | Linear layout grouped by hostname (default) |
| Shift+2 | RackTopologyLayout | Physical rack positions from hostname parsing |
| Shift+3 | HardwareGroupLayout | Clusters hosts by hardware type |
| Shift+4 | UserTerritoriesLayout | Treemap-style with rectangular regions per user |
| Shift+5 | JobGroupingLayout | Groups slots by job_id as rectangular blocks |
| Shift+6 | IdleCompressionLayout | Active slots dense, idle compressed below |
| Shift+7 | HilbertCurveLayout | Space-filling curve for better locality |
| Shift+8 | SpiralLayout | Center spiral, sorted by utilization |
| Shift+9 | RadialSunburstLayout | Circular with concentric rings by hardware |

### Color Strategies (`colors.js`)

9 visualization modes:

| Key | Strategy | Description |
|-----|----------|-------------|
| 1 | UserColorStrategy | Distinct color per user (30-color palette) |
| 2 | HostnameColorStrategy | Hash-based color per hostname |
| 3 | RowColorStrategy | Color by row prefix (e.g. "h04") |
| 4 | TypeColorStrategy | Color by hardware group |
| 5 | GpuTypeColorStrategy | Color by GPU type |
| 6 | UtilizationColorStrategy | Heat map by CPU utilization |
| 7 | StatusColorStrategy | Green=in-use, gray=idle |
| 8 | HostStatusColorStrategy | Color by host status |
| 9 | MemoryLoadColorStrategy | Heat map by available memory |

### Key Frontend Constants (`config.js`)

```javascript
const PIXEL_SIZE = 8;        // Base square size in pixels
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3.0;
const ZOOM_STEP = 0.1;
const MIN_CANVAS_SIZE = 200;
const PRELOAD_BUFFER = 3;    // Adjacent snapshots to preload
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
- Layout mode (1-9)
- Panel visibility (help, legend)
- Time travel state (`tt=timestamp`, `ts=speed`, `te=expanded`)

### Adding a New Color Strategy

1. Create class in `colors.js` implementing:
   ```javascript
   class MyColorStrategy {
     initialize(resources) { /* precompute colors */ }
     getColor(resource) { /* return {r, g, b} */ }
     getLegendItems(resources) { /* return [{color, label, count}] */ }
   }
   ```
2. Add to `colorStrategies` array
3. Update `COLOR_MODES` count in `config.js`
4. Add keyboard handler in `handleKeyDown` in `main.js`

### Adding a New Layout Strategy

1. Create class in `layouts.js` extending `LayoutStrategy`:
   ```javascript
   class MyLayout extends LayoutStrategy {
     getName() { return 'MY LAYOUT'; }
     layout(resources, gridWidth, gridHeight) {
       // Set resource.x and resource.y for each resource
     }
   }
   ```
2. Add to `layoutStrategies` array in `initializeLayoutStrategies()`
3. Update help panel in `index.html` with new Shift+N key

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
| +/- buttons or scroll | Zoom (0.1x - 3.0x) |
| Hover resource | Show tooltip |
| Click resource | Open detail modal |
| Arrow keys (in modal) | Navigate resources |
| Keys 1-9 | Change color mode |
| Shift+1-9 | Change layout mode |
| L | Toggle legend panel |
| T | Toggle time travel panel |
| P | Toggle all panels |
| ? | Toggle help panel |
| Space | Play/pause time travel playback |

## Time Travel Feature

View and playback historical cluster states. Located at top-center of the screen.

### Controls

- **Title bar**: Click to expand/collapse panel (or press 'T')
- **Date range**: Flatpickr-based date picker to filter timestamps
- **Slider**: Scrub through available timestamps
- **|< / >|**: Step to previous/next snapshot
- **Play button**: Start/stop playback animation
- **Speed selector**: 100x to 10,000,000x realtime
- **LIVE button**: Return to real-time mode (resumes auto-refresh)

### State Management

- When in time travel mode, auto-refresh is paused
- State persists in URL hash (`tt=timestamp`, `ts=speed`, `te=expanded`)
- Preloads ±3 adjacent snapshots for smooth playback
- Playback speed relative to 120s fetch interval (e.g., 1000x = 0.12 seconds per snapshot)
