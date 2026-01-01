// Domain types for the visualization

import type { HostLoad } from './api';

export type ResourceType = 'cpu' | 'gpu';

export type ResizeHandle = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export type ColorMode = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type LayoutMode = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface LegendItem {
  label: string;
  color: string;
  count: number;
}

// Interface matching the Resource class structure
export interface IResource {
  hostname: string;
  type: ResourceType;
  index: number;
  user: string | null;
  x: number;
  y: number;
  gpuType: string | null;
  utilization: number;
  status: string;
  load: HostLoad;
  hardwareGroup: string;
  jobId: string | null;
  jobName: string | null;
  readonly isIdle: boolean;
  readonly row: string;
}

// Host data passed to Resource constructor
export interface HostData {
  gpu_type?: string | null;
  utilization?: number;
  status?: string;
  load?: HostLoad;
}
