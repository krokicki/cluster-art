// Resource model - represents a single CPU or GPU slot

import type { HostLoad } from './types/api';
import type { ResourceType, HostData, IResource } from './types/domain';

export class Resource implements IResource {
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

  constructor(
    hostname: string,
    type: ResourceType,
    index: number,
    user: string | null,
    hostData: HostData | undefined,
    hardwareGroup: string
  ) {
    this.hostname = hostname;
    this.type = type;
    this.index = index;
    this.user = user || null;
    this.x = 0;
    this.y = 0;

    // Additional metadata from host
    this.gpuType = hostData?.gpu_type || null;
    this.utilization = hostData?.utilization || 0;
    this.status = hostData?.status || 'unknown';
    this.load = hostData?.load || {};
    this.hardwareGroup = hardwareGroup || 'Unknown';

    // Job info (populated later from raw data)
    this.jobId = null;
    this.jobName = null;
  }

  get isIdle(): boolean {
    return !this.user || this.user === '';
  }

  get row(): string {
    // Extract row prefix (e.g., "h04" from "h04u08")
    const match = this.hostname.match(/^([a-z]+\d+)/);
    return match ? match[1] : this.hostname;
  }
}
