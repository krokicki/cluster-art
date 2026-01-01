// API response types from the backend

export interface HostLoad {
  r15s?: number;
  r1m?: number;
  r15m?: number;
  ut?: number;
  mem?: number;
  io?: number;
  pg?: number;
  tmp?: number;
  swp?: number;
  load_status?: string;
}

export interface HostDetail {
  hostname: string;
  status: string;
  cpus: { total: number; used: number; idle: number };
  gpus: { total: number; used: number; idle: number };
  utilization: number;
  users: string[];
  gpu_type: string | null;
  hardwareGroup: string;
  cpuSlots: Record<string, string> | string[];
  gpuSlots: Record<string, string> | string[];
  load: HostLoad;
}

export interface Job {
  job_id: string;
  job_name: string;
  user: string;
  status: string;
  exec_host: string;
  resource_requirements: string;
  start_time: string;
  submit_time: string;
  run_time_seconds: number;
}

export interface GpuAttribution {
  hostname: string;
  gpu_id: number;
  job_id: string;
  job_name: string;
  user: string;
  status: string;
}

export interface UserStats {
  jobs: number;
  cpus: number;
  gpus: number;
}

export interface ClusterStatus {
  hostDetails: HostDetail[];
  activeUsers: number;
  userJobStats: Record<string, UserStats>;
  motd: string;
  fetchedAt: string;
  raw: {
    jobs: { all: Job[] };
    gpu_attribution: GpuAttribution[];
  };
}

export interface TimePointsResponse {
  count: number;
  timestamps: number[];
  available_range?: {
    earliest: number;
    latest: number;
  };
}
