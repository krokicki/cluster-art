# Cluster Visualization - JSON Schema

This is an artistic cluster visualization for HPC clusters. It prioritizes art over usefulness. The data comes from a JSON file that is reserved by the backend in order to add CORS headers. It has a vintage video game aesthetic, and is easy to use.

The project is managed using Pixi, and all commands should be executed using Pixi. Running the server can be done by `pixi run serve`.

## JSON Structure

```typescript
interface ClusterStatus {
  // Summary statistics
  hosts: {
    total: number;
    active: number;
  };
  cpus: {
    total: number;
    used: number;
    idle: number;
  };
  gpus: {
    total: number;
    used: number;
    idle: number;
  };

  // Detailed host information
  hostDetails: HostDetail[];

  // Hardware groupings
  hardwareGroups: {
    [groupName: string]: string[]; // group name -> array of hostnames
    // Known groups:
    // "CPU + T4", "CPU + L4", "CPU + 8GPU L4", "8GPU L4",
    // "4GPU A100", "8GPU H100", "8GPU H200", "GH200", "7GPU L4"
  };

  // User statistics
  activeUsers: number;
  userJobStats: {
    [username: string]: {
      run: number;
      pending: number;
      suspended: number;
      slots: number;
      gpus: number;
    };
  };

  // Metadata
  motd: string;
  fetchedAt: string; // ISO 8601 timestamp

  // Raw data from LSF
  raw: {
    jobs: {
      all: Job[];
      gpu_jobs: GpuJob[];
    };
    hosts: RawHost[];
    metadata: {
      generated_at: string;
      total_jobs: number;
      running_jobs: number;
      pending_jobs: number;
      suspended_jobs: number;
      total_hosts: number;
      gpu_jobs: number;
    };
    gpu_attribution: GpuAttribution[];
  };
}

interface HostDetail {
  hostname: string;          // e.g., "h04u08"
  status: string;            // e.g., "closed_Full", "ok"
  cpus: {
    total: number;
    used: number;
    idle: number;
  };
  gpus: {
    total: number;
    used: number;
    idle: number;
  };
  utilization: number;       // 0-100 percentage
  users: string[];           // unique users on this host
  gpu_type: string;          // e.g., "NVIDIAH200", "TeslaT4", "NVIDIAL4"
  cpuSlots: string[];        // array of usernames (or "" for idle)
  gpuSlots: string[];        // array of usernames (or "" for idle)
  load: {
    r15s: number;            // load average 15 seconds
    r1m: number;             // load average 1 minute
    r15m: number;            // load average 15 minutes
    ut: number;              // CPU utilization percentage
    mem: number;             // memory usage in MB
    io: number;              // disk I/O in KB/s
    pg: number;              // paging
    tmp: number;             // temp space in MB
    swp: number;             // swap usage
    load_status: string;     // e.g., "ok"
  };
}

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

interface GpuJob {
  job_id: string;
  job_name: string;
  user: string;
  status: string;
  host: string;
  num_gpus: number;
  gpu_ids: number[];
  assignment_method: string;
}

interface RawHost {
  hostname: string;
  max_slots: number;
  status: string;
  gpus: any[];
  load_status: string;
  r15s: number;
  r1m: number;
  r15m: number;
  ut: number;
  pg: number;
  io: number;
  tmp: number;
  swp: number;
  mem: number;
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

## Usage Notes

- `cpuSlots` and `gpuSlots` arrays contain username strings for allocated slots, or empty string `""` for idle slots
- Memory (`load.mem`) is in MB
- Disk I/O (`load.io`) is in KB/s
- Temp space (`load.tmp`) is in MB and is unbounded (can exceed 100GB)
- To find which hardware group a host belongs to, search through `hardwareGroups` values
