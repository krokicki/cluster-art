// Color strategies for visualizing resources

import {
  DISTINCT_USER_COLORS,
  STATIC_STATUS_COLORS,
  DISTINCT_STATUS_COLORS,
} from './config';
import type { IResource, LegendItem } from './types';

// Persistent cache for user colors (survives across data refreshes)
export const userColorCache = new Map<string, string>();
let userColorIndex = 0;

// Persistent cache for host status colors
export const hostStatusColorCache = new Map<string, string>();
let hostStatusColorIndex = 0;

// Base color strategy class
export abstract class ColorStrategy {
  colorMap: Map<string | null, string> = new Map();

  abstract getColor(resource: IResource): string;
  abstract getLegendItems(resources: IResource[]): LegendItem[];

  initialize(_resources: IResource[]): void {
    // Override if needed to pre-compute colors
  }
}

// Mode 1: By User
export class UserColorStrategy extends ColorStrategy {
  initialize(resources: IResource[]): void {
    const users = resources
      .map((r) => r.user)
      .filter((u): u is string => u !== null && u !== '');
    const uniqueUsers = Array.from(new Set(users));

    uniqueUsers.forEach((user) => {
      if (!userColorCache.has(user)) {
        const color = DISTINCT_USER_COLORS[userColorIndex % DISTINCT_USER_COLORS.length];
        userColorCache.set(user, color);
        userColorIndex++;
      }
      this.colorMap.set(user, userColorCache.get(user)!);
    });
    this.colorMap.set(null, '#2a2a2a');
    this.colorMap.set('', '#2a2a2a');
  }

  getColor(resource: IResource): string {
    if (resource.user && userColorCache.has(resource.user)) {
      return userColorCache.get(resource.user)!;
    }
    return this.colorMap.get(resource.user) || this.colorMap.get(null) || '#2a2a2a';
  }

  getLegendItems(resources: IResource[]): LegendItem[] {
    const counts = new Map<string, number>();
    resources.forEach((r) => {
      const key = r.user || 'idle';
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    return Array.from(counts.keys())
      .sort((a, b) => {
        if (a === 'idle') return 1;
        if (b === 'idle') return -1;
        return (counts.get(b) || 0) - (counts.get(a) || 0);
      })
      .map((key) => ({
        label: key === 'idle' ? 'IDLE' : key,
        color: this.getColor({ user: key === 'idle' ? null : key } as IResource),
        count: counts.get(key) || 0,
      }));
  }
}

// Mode 2: By Hostname
export class HostnameColorStrategy extends ColorStrategy {
  initialize(resources: IResource[]): void {
    const hostnames = Array.from(new Set(resources.map((r) => r.hostname))).sort();
    hostnames.forEach((hostname) => {
      this.colorMap.set(hostname, hashStringToColor(hostname));
    });
  }

  getColor(resource: IResource): string {
    return this.colorMap.get(resource.hostname) || '#2a2a2a';
  }

  getLegendItems(resources: IResource[]): LegendItem[] {
    const counts = new Map<string, number>();
    resources.forEach((r) => {
      counts.set(r.hostname, (counts.get(r.hostname) || 0) + 1);
    });

    return Array.from(counts.keys())
      .sort()
      .map((hostname) => ({
        label: hostname,
        color: this.colorMap.get(hostname) || '#2a2a2a',
        count: counts.get(hostname) || 0,
      }));
  }
}

// Mode 3: By Row
export class RowColorStrategy extends ColorStrategy {
  initialize(resources: IResource[]): void {
    const rows = Array.from(new Set(resources.map((r) => r.row))).sort();
    const distinctColors = [
      '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231',
      '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#fabed4',
      '#469990', '#dcbeff', '#9a6324', '#fffac8', '#800000',
      '#aaffc3', '#808000', '#ffd8b1', '#000075', '#a9a9a9',
    ];
    rows.forEach((row, i) => {
      this.colorMap.set(row, distinctColors[i % distinctColors.length]);
    });
  }

  getColor(resource: IResource): string {
    return this.colorMap.get(resource.row) || '#2a2a2a';
  }

  getLegendItems(resources: IResource[]): LegendItem[] {
    const counts = new Map<string, number>();
    resources.forEach((r) => {
      counts.set(r.row, (counts.get(r.row) || 0) + 1);
    });

    return Array.from(counts.keys())
      .sort()
      .map((row) => ({
        label: row,
        color: this.colorMap.get(row) || '#2a2a2a',
        count: counts.get(row) || 0,
      }));
  }
}

// Mode 4: By Hardware Group
export class TypeColorStrategy extends ColorStrategy {
  constructor() {
    super();
    const hardwareGroups = [
      'CPU + T4', 'CPU + L4', 'CPU + 8GPU L4', '8GPU L4',
      '4GPU A100', '8GPU H100', '8GPU H200', 'GH200',
      '7GPU L4', 'Unknown',
    ];

    const colors = generateDistinctColors(hardwareGroups.length);
    hardwareGroups.forEach((group, idx) => {
      this.colorMap.set(group, colors[idx]);
    });
  }

  getColor(resource: IResource): string {
    return this.colorMap.get(resource.hardwareGroup) || '#2a2a2a';
  }

  getLegendItems(resources: IResource[]): LegendItem[] {
    const counts = new Map<string, number>();
    resources.forEach((r) => {
      counts.set(r.hardwareGroup, (counts.get(r.hardwareGroup) || 0) + 1);
    });

    return Array.from(counts.keys())
      .sort()
      .map((group) => ({
        label: group,
        color: this.colorMap.get(group) || '#2a2a2a',
        count: counts.get(group) || 0,
      }));
  }
}

// Mode 5: By GPU Type
export class GpuTypeColorStrategy extends ColorStrategy {
  initialize(resources: IResource[]): void {
    const gpuTypes = Array.from(
      new Set(resources.map((r) => r.gpuType).filter((t): t is string => t !== null))
    );
    const colors = generateDistinctColors(gpuTypes.length + 1);

    gpuTypes.forEach((type, i) => {
      this.colorMap.set(type, colors[i]);
    });
    this.colorMap.set(null, colors[gpuTypes.length]);
  }

  getColor(resource: IResource): string {
    return this.colorMap.get(resource.gpuType) || this.colorMap.get(null) || '#2a2a2a';
  }

  getLegendItems(resources: IResource[]): LegendItem[] {
    const counts = new Map<string, number>();
    resources.forEach((r) => {
      const key = r.gpuType || 'CPU';
      counts.set(key, (counts.get(key) || 0) + 1);
    });

    return Array.from(counts.keys())
      .sort((a, b) => {
        if (a === 'CPU') return 1;
        if (b === 'CPU') return -1;
        return a.localeCompare(b);
      })
      .map((key) => ({
        label: key,
        color: this.getColor({ gpuType: key === 'CPU' ? null : key } as IResource),
        count: counts.get(key) || 0,
      }));
  }
}

// Mode 6: By Utilization (Heat Map)
export class UtilizationColorStrategy extends ColorStrategy {
  private min = 0;
  private max = 100;

  initialize(resources: IResource[]): void {
    const utils = resources.map((r) => r.utilization);
    this.min = Math.min(...utils);
    this.max = Math.max(...utils);
  }

  getColor(resource: IResource): string {
    return getHeatMapColor(resource.utilization, this.min, this.max);
  }

  getLegendItems(resources: IResource[]): LegendItem[] {
    const ranges = [
      { label: '0-20%', min: 0, max: 20 },
      { label: '21-40%', min: 21, max: 40 },
      { label: '41-60%', min: 41, max: 60 },
      { label: '61-80%', min: 61, max: 80 },
      { label: '81-100%', min: 81, max: 100 },
    ];

    return ranges.map((range) => {
      const count = resources.filter(
        (r) => r.utilization >= range.min && r.utilization <= range.max
      ).length;
      return {
        label: range.label,
        color: getHeatMapColor((range.min + range.max) / 2, 0, 100),
        count,
      };
    });
  }
}

// Mode 7: By Slot Status (Idle vs In-Use)
export class StatusColorStrategy extends ColorStrategy {
  private statusColors = new Map<boolean, string>();

  constructor() {
    super();
    this.statusColors.set(true, '#2a2a2a');  // Idle
    this.statusColors.set(false, '#44ff44'); // In-use
  }

  getColor(resource: IResource): string {
    return this.statusColors.get(resource.isIdle) || '#2a2a2a';
  }

  getLegendItems(resources: IResource[]): LegendItem[] {
    const idleCount = resources.filter((r) => r.isIdle).length;
    const inUseCount = resources.length - idleCount;

    return [
      { label: 'IN-USE', color: this.statusColors.get(false)!, count: inUseCount },
      { label: 'IDLE', color: this.statusColors.get(true)!, count: idleCount },
    ];
  }
}

// Mode 8: By Host Status
export class HostStatusColorStrategy extends ColorStrategy {
  initialize(resources: IResource[]): void {
    const statuses = Array.from(new Set(resources.map((r) => r.status)));
    statuses.forEach((status) => {
      if (!hostStatusColorCache.has(status)) {
        if (STATIC_STATUS_COLORS[status]) {
          hostStatusColorCache.set(status, STATIC_STATUS_COLORS[status]);
        } else {
          const color = DISTINCT_STATUS_COLORS[hostStatusColorIndex % DISTINCT_STATUS_COLORS.length];
          hostStatusColorCache.set(status, color);
          hostStatusColorIndex++;
        }
      }
      this.colorMap.set(status, hostStatusColorCache.get(status)!);
    });
  }

  getColor(resource: IResource): string {
    if (resource.status && hostStatusColorCache.has(resource.status)) {
      return hostStatusColorCache.get(resource.status)!;
    }
    return this.colorMap.get(resource.status) || '#2a2a2a';
  }

  getLegendItems(resources: IResource[]): LegendItem[] {
    const counts = new Map<string, number>();
    resources.forEach((r) => {
      counts.set(r.status, (counts.get(r.status) || 0) + 1);
    });

    return Array.from(counts.keys())
      .sort((a, b) => (counts.get(b) || 0) - (counts.get(a) || 0))
      .map((status) => ({
        label: status,
        color: this.colorMap.get(status) || '#2a2a2a',
        count: counts.get(status) || 0,
      }));
  }
}

// Mode 9: By Free Memory
export class MemoryLoadColorStrategy extends ColorStrategy {
  private min = 0;
  private max = 1;

  initialize(resources: IResource[]): void {
    const mems = resources.map((r) => r.load?.mem || 0);
    this.min = 0;
    this.max = Math.max(...mems);
  }

  getColor(resource: IResource): string {
    const mem = resource.load?.mem || 0;
    const normalized = Math.max(0, Math.min(1, (mem - this.min) / (this.max - this.min)));
    const hue = normalized * 240;
    return `hsl(${hue}, 80%, 50%)`;
  }

  getLegendItems(resources: IResource[]): LegendItem[] {
    const mems = resources.map((r) => r.load?.mem || 0);
    const max = Math.max(...mems);
    const step = max / 5;

    const ranges: LegendItem[] = [];
    for (let i = 0; i < 5; i++) {
      const rangeMin = step * i;
      const rangeMax = step * (i + 1);
      const count = resources.filter((r) => {
        const mem = r.load?.mem || 0;
        return mem >= rangeMin && mem < (i === 4 ? rangeMax + 1 : rangeMax);
      }).length;

      const normalized = ((rangeMin + rangeMax) / 2) / max;
      const hue = normalized * 240;

      ranges.push({
        label: `${formatMemoryGB(rangeMin)}-${formatMemoryGB(rangeMax)} GB`,
        color: `hsl(${hue}, 80%, 50%)`,
        count,
      });
    }

    return ranges;
  }
}

// Helper color generation functions
export function generateDistinctColors(count: number): string[] {
  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    const hue = (i * 360 / count) % 360;
    const saturation = 70;
    const lightness = 60;
    colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
  }
  return colors;
}

export function hashStringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  const hue = Math.abs(hash % 360);
  const saturation = 60 + Math.abs((hash >> 8) % 20);
  const lightness = 50 + Math.abs((hash >> 16) % 20);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

export function getHeatMapColor(value: number, min: number, max: number): string {
  if (max === min) return 'hsl(120, 70%, 50%)';
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const hue = (1 - normalized) * 240;
  return `hsl(${hue}, 80%, 50%)`;
}

export function formatMemoryGB(memMB: number, decimals = 1): string {
  return (memMB / 1024).toFixed(decimals);
}

// Convert sparse slot format to array
export function sparseToArray(
  sparseSlots: Record<string, string> | string[] | undefined,
  totalCount: number
): string[] {
  const array = new Array<string>(totalCount).fill('');
  if (sparseSlots && typeof sparseSlots === 'object' && !Array.isArray(sparseSlots)) {
    for (const [index, user] of Object.entries(sparseSlots)) {
      const idx = parseInt(index, 10);
      if (!isNaN(idx) && idx < totalCount) {
        array[idx] = user;
      }
    }
  } else if (Array.isArray(sparseSlots)) {
    return sparseSlots;
  }
  return array;
}

// Export all strategy classes for initialization
export const allColorStrategies = [
  UserColorStrategy,
  HostnameColorStrategy,
  RowColorStrategy,
  TypeColorStrategy,
  GpuTypeColorStrategy,
  UtilizationColorStrategy,
  StatusColorStrategy,
  HostStatusColorStrategy,
  MemoryLoadColorStrategy,
];
