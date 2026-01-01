// Layout strategies for positioning resources on the canvas

import type { IResource } from './types';

// Base layout strategy class
export abstract class LayoutStrategy {
  abstract getName(): string;
  abstract layout(resources: IResource[], gridWidth: number, gridHeight: number): void;
}

// Linear layout grouped by hostname
export class HostnameHierarchyLayout extends LayoutStrategy {
  getName(): string {
    return 'LINEAR';
  }

  layout(resources: IResource[], gridWidth: number, _gridHeight: number): void {
    const hostGroups = new Map<string, IResource[]>();
    resources.forEach((resource) => {
      if (!hostGroups.has(resource.hostname)) {
        hostGroups.set(resource.hostname, []);
      }
      hostGroups.get(resource.hostname)!.push(resource);
    });

    const sortedHostnames = Array.from(hostGroups.keys()).sort();

    let x = 0;
    let y = 0;
    const maxWidth = gridWidth;

    sortedHostnames.forEach((hostname) => {
      const hostResources = hostGroups.get(hostname)!;

      hostResources.forEach((resource) => {
        resource.x = x;
        resource.y = y;

        x++;
        if (x >= maxWidth) {
          x = 0;
          y++;
        }
      });
    });
  }
}

// Rack topology layout - maps hostnames to physical rack positions
export class RackTopologyLayout extends LayoutStrategy {
  getName(): string {
    return 'RACK';
  }

  parseHostname(hostname: string): { row: string; unit: number } | null {
    const match = hostname.match(/^([a-z]+\d+)u(\d+)$/i);
    if (match) {
      return { row: match[1].toLowerCase(), unit: parseInt(match[2]) };
    }
    return null;
  }

  layout(resources: IResource[], _gridWidth: number, _gridHeight: number): void {
    const hostGroups = new Map<string, IResource[]>();
    resources.forEach((resource) => {
      if (!hostGroups.has(resource.hostname)) {
        hostGroups.set(resource.hostname, []);
      }
      hostGroups.get(resource.hostname)!.push(resource);
    });

    interface HostEntry {
      hostname: string;
      unit: number;
      resources: IResource[];
    }

    const rowMap = new Map<string, HostEntry[]>();
    hostGroups.forEach((hostResources, hostname) => {
      const parsed = this.parseHostname(hostname);
      if (parsed) {
        if (!rowMap.has(parsed.row)) {
          rowMap.set(parsed.row, []);
        }
        rowMap.get(parsed.row)!.push({
          hostname,
          unit: parsed.unit,
          resources: hostResources,
        });
      } else {
        if (!rowMap.has('other')) {
          rowMap.set('other', []);
        }
        rowMap.get('other')!.push({
          hostname,
          unit: 0,
          resources: hostResources,
        });
      }
    });

    const sortedRows = Array.from(rowMap.keys()).sort();

    let maxCpuSlots = 0;
    let maxGpuSlots = 0;
    hostGroups.forEach((hostResources) => {
      const cpuCount = hostResources.filter((r) => r.type === 'cpu').length;
      const gpuCount = hostResources.filter((r) => r.type === 'gpu').length;
      maxCpuSlots = Math.max(maxCpuSlots, cpuCount);
      maxGpuSlots = Math.max(maxGpuSlots, gpuCount);
    });

    const hostWidth = maxGpuSlots + maxCpuSlots;

    const rackHeights = sortedRows.map((rowName) => rowMap.get(rowName)!.length);
    const totalHosts = rackHeights.reduce((a, b) => a + b, 0);

    const numRacks = sortedRows.length;
    const avgRackHeight = totalHosts / numRacks;
    const racksPerRow = Math.max(
      1,
      Math.ceil(Math.sqrt(numRacks * (avgRackHeight / hostWidth)))
    );

    const rowHeights: number[] = [];
    const rackPositions: { gridCol: number; gridRow: number }[] = [];

    sortedRows.forEach((_rowName, rackIndex) => {
      const gridCol = rackIndex % racksPerRow;
      const gridRow = Math.floor(rackIndex / racksPerRow);
      rackPositions.push({ gridCol, gridRow });

      const rackHeight = rackHeights[rackIndex];
      if (!rowHeights[gridRow]) rowHeights[gridRow] = 0;
      rowHeights[gridRow] = Math.max(rowHeights[gridRow], rackHeight);
    });

    const rowYOffsets: number[] = [0];
    for (let i = 0; i < rowHeights.length - 1; i++) {
      rowYOffsets.push(rowYOffsets[i] + rowHeights[i]);
    }

    sortedRows.forEach((rowName, rackIndex) => {
      const hosts = rowMap.get(rowName)!;
      hosts.sort((a, b) => a.unit - b.unit);

      const { gridCol, gridRow } = rackPositions[rackIndex];
      const rackX = gridCol * hostWidth;
      const rackY = rowYOffsets[gridRow];

      hosts.forEach((host, hostIndex) => {
        const cpuResources = host.resources.filter((r) => r.type === 'cpu');
        const gpuResources = host.resources.filter((r) => r.type === 'gpu');

        gpuResources.forEach((resource, idx) => {
          resource.x = rackX + idx;
          resource.y = rackY + hostIndex;
        });

        cpuResources.forEach((resource, idx) => {
          resource.x = rackX + maxGpuSlots + idx;
          resource.y = rackY + hostIndex;
        });
      });
    });
  }
}

// Hardware group islands layout - clusters by hardware type
export class HardwareGroupLayout extends LayoutStrategy {
  getName(): string {
    return 'HARDWARE';
  }

  layout(resources: IResource[], _gridWidth: number, _gridHeight: number): void {
    const groupMap = new Map<string, Map<string, IResource[]>>();
    resources.forEach((resource) => {
      const group = resource.hardwareGroup || 'Unknown';
      if (!groupMap.has(group)) {
        groupMap.set(group, new Map());
      }
      const hostMap = groupMap.get(group)!;
      if (!hostMap.has(resource.hostname)) {
        hostMap.set(resource.hostname, []);
      }
      hostMap.get(resource.hostname)!.push(resource);
    });

    const sortedGroups = Array.from(groupMap.keys()).sort();

    let maxCpuSlots = 0;
    let maxGpuSlots = 0;
    groupMap.forEach((hostMap) => {
      hostMap.forEach((hostResources) => {
        const cpuCount = hostResources.filter((r) => r.type === 'cpu').length;
        const gpuCount = hostResources.filter((r) => r.type === 'gpu').length;
        maxCpuSlots = Math.max(maxCpuSlots, cpuCount);
        maxGpuSlots = Math.max(maxGpuSlots, gpuCount);
      });
    });

    const hostWidth = maxGpuSlots + maxCpuSlots;

    const groupHeights = sortedGroups.map((group) => groupMap.get(group)!.size);
    const totalHosts = groupHeights.reduce((a, b) => a + b, 0);

    const numGroups = sortedGroups.length;
    const avgGroupHeight = totalHosts / numGroups;
    const groupsPerRow = Math.max(
      1,
      Math.ceil(Math.sqrt(numGroups * (avgGroupHeight / hostWidth)))
    );

    const rowHeights: number[] = [];
    const groupPositions: { gridCol: number; gridRow: number }[] = [];

    sortedGroups.forEach((_groupName, groupIndex) => {
      const gridCol = groupIndex % groupsPerRow;
      const gridRow = Math.floor(groupIndex / groupsPerRow);
      groupPositions.push({ gridCol, gridRow });

      const groupHeight = groupHeights[groupIndex];
      if (!rowHeights[gridRow]) rowHeights[gridRow] = 0;
      rowHeights[gridRow] = Math.max(rowHeights[gridRow], groupHeight);
    });

    const rowYOffsets: number[] = [0];
    for (let i = 0; i < rowHeights.length - 1; i++) {
      rowYOffsets.push(rowYOffsets[i] + rowHeights[i]);
    }

    sortedGroups.forEach((groupName, groupIndex) => {
      const hostMap = groupMap.get(groupName)!;
      const sortedHostnames = Array.from(hostMap.keys()).sort();

      const { gridCol, gridRow } = groupPositions[groupIndex];
      const groupX = gridCol * hostWidth;
      const groupY = rowYOffsets[gridRow];

      sortedHostnames.forEach((hostname, hostIndex) => {
        const hostResources = hostMap.get(hostname)!;
        const cpuResources = hostResources.filter((r) => r.type === 'cpu');
        const gpuResources = hostResources.filter((r) => r.type === 'gpu');

        gpuResources.forEach((resource, idx) => {
          resource.x = groupX + idx;
          resource.y = groupY + hostIndex;
        });

        cpuResources.forEach((resource, idx) => {
          resource.x = groupX + maxGpuSlots + idx;
          resource.y = groupY + hostIndex;
        });
      });
    });
  }
}

// User territories layout - treemap-style by user
export class UserTerritoriesLayout extends LayoutStrategy {
  getName(): string {
    return 'USERS';
  }

  layout(resources: IResource[], gridWidth: number, _gridHeight: number): void {
    const idleResources: IResource[] = [];
    const userMap = new Map<string, IResource[]>();

    resources.forEach((resource) => {
      if (!resource.user || resource.user === '') {
        idleResources.push(resource);
      } else {
        if (!userMap.has(resource.user)) {
          userMap.set(resource.user, []);
        }
        userMap.get(resource.user)!.push(resource);
      }
    });

    const sortedUsers = Array.from(userMap.keys()).sort((a, b) => {
      return userMap.get(b)!.length - userMap.get(a)!.length;
    });

    const targetWidth = gridWidth;

    let currentX = 0;
    let currentY = 0;
    let rowHeight = 0;

    sortedUsers.forEach((user) => {
      const userResources = userMap.get(user)!;
      const slotCount = userResources.length;

      const userWidth = Math.ceil(Math.sqrt(slotCount * 1.5));

      if (currentX + userWidth > targetWidth && currentX > 0) {
        currentX = 0;
        currentY += rowHeight;
        rowHeight = 0;
      }

      let localX = 0;
      let localY = 0;
      userResources.forEach((resource) => {
        resource.x = currentX + localX;
        resource.y = currentY + localY;

        localX++;
        if (localX >= userWidth) {
          localX = 0;
          localY++;
        }
      });

      const actualHeight = Math.ceil(slotCount / userWidth);
      rowHeight = Math.max(rowHeight, actualHeight);
      currentX += userWidth;
    });

    const idleStartY = currentY + rowHeight;
    let idleX = 0;
    let idleY = idleStartY;

    const idleRowWidth = gridWidth;

    idleResources.forEach((resource) => {
      resource.x = idleX;
      resource.y = idleY;

      idleX++;
      if (idleX >= idleRowWidth) {
        idleX = 0;
        idleY++;
      }
    });
  }
}

// Job grouping layout - groups by job_id to show job footprints
export class JobGroupingLayout extends LayoutStrategy {
  getName(): string {
    return 'JOBS';
  }

  layout(resources: IResource[], gridWidth: number, _gridHeight: number): void {
    const jobMap = new Map<string, IResource[]>();
    const idleResources: IResource[] = [];

    resources.forEach((resource) => {
      if (!resource.jobId || resource.jobId === '') {
        idleResources.push(resource);
      } else {
        if (!jobMap.has(resource.jobId)) {
          jobMap.set(resource.jobId, []);
        }
        jobMap.get(resource.jobId)!.push(resource);
      }
    });

    const sortedJobs = Array.from(jobMap.keys()).sort((a, b) => {
      return jobMap.get(b)!.length - jobMap.get(a)!.length;
    });

    const targetWidth = gridWidth;

    let currentX = 0;
    let currentY = 0;
    let rowHeight = 0;

    sortedJobs.forEach((jobId) => {
      const jobResources = jobMap.get(jobId)!;
      const slotCount = jobResources.length;

      const jobWidth = Math.ceil(Math.sqrt(slotCount * 1.5));

      if (currentX + jobWidth > targetWidth && currentX > 0) {
        currentX = 0;
        currentY += rowHeight;
        rowHeight = 0;
      }

      let localX = 0;
      let localY = 0;
      jobResources.forEach((resource) => {
        resource.x = currentX + localX;
        resource.y = currentY + localY;

        localX++;
        if (localX >= jobWidth) {
          localX = 0;
          localY++;
        }
      });

      const actualHeight = Math.ceil(slotCount / jobWidth);
      rowHeight = Math.max(rowHeight, actualHeight);
      currentX += jobWidth;
    });

    const idleStartY = currentY + rowHeight;
    let idleX = 0;
    let idleY = idleStartY;

    idleResources.forEach((resource) => {
      resource.x = idleX;
      resource.y = idleY;

      idleX++;
      if (idleX >= gridWidth) {
        idleX = 0;
        idleY++;
      }
    });
  }
}

// Idle compression layout - active slots dense at top, idle compressed below
export class IdleCompressionLayout extends LayoutStrategy {
  getName(): string {
    return 'IDLE COMPRESSION';
  }

  layout(resources: IResource[], gridWidth: number, _gridHeight: number): void {
    const activeSlots: IResource[] = [];
    const idleSlots: IResource[] = [];

    resources.forEach((resource) => {
      if (resource.user && resource.user !== '') {
        activeSlots.push(resource);
      } else {
        idleSlots.push(resource);
      }
    });

    let x = 0;
    let y = 0;

    activeSlots.forEach((resource) => {
      resource.x = x;
      resource.y = y;
      x++;
      if (x >= gridWidth) {
        x = 0;
        y++;
      }
    });

    const activeEndY = x > 0 ? y + 1 : y;

    const idleStartY = activeEndY + 1;
    const compressionFactor = 2;

    let idleX = 0;
    let idleY = idleStartY;

    idleSlots.forEach((resource) => {
      resource.x = idleX;
      resource.y = idleY;

      idleX += compressionFactor;

      if (idleX >= gridWidth) {
        idleX = 0;
        idleY++;
      }
    });
  }
}

// Hilbert curve layout - space-filling curve preserving locality
export class HilbertCurveLayout extends LayoutStrategy {
  getName(): string {
    return 'HILBERT';
  }

  hilbertD2xy(n: number, d: number): { x: number; y: number } {
    let x = 0;
    let y = 0;
    let s = 1;
    let t = d;

    while (s < n) {
      const rx = 1 & Math.floor(t / 2);
      const ry = 1 & (t ^ rx);

      if (ry === 0) {
        if (rx === 1) {
          x = s - 1 - x;
          y = s - 1 - y;
        }
        [x, y] = [y, x];
      }

      x += s * rx;
      y += s * ry;
      t = Math.floor(t / 4);
      s *= 2;
    }

    return { x, y };
  }

  layout(resources: IResource[], _gridWidth: number, _gridHeight: number): void {
    if (resources.length === 0) return;

    const sortedResources = [...resources].sort((a, b) => {
      if (a.hostname !== b.hostname) {
        return a.hostname.localeCompare(b.hostname);
      }
      if (a.type !== b.type) {
        return a.type === 'gpu' ? -1 : 1;
      }
      return a.index - b.index;
    });

    const n = Math.pow(2, Math.ceil(Math.log2(Math.sqrt(resources.length))));

    sortedResources.forEach((resource, idx) => {
      const { x, y } = this.hilbertD2xy(n, idx);
      resource.x = x;
      resource.y = y;
    });
  }
}

// Spiral layout - center outward, ordered by utilization
export class SpiralLayout extends LayoutStrategy {
  getName(): string {
    return 'SPIRAL';
  }

  layout(resources: IResource[], _gridWidth: number, _gridHeight: number): void {
    if (resources.length === 0) return;

    const sortedResources = [...resources].sort((a, b) => {
      const utilA = a.user ? a.utilization || 100 : 0;
      const utilB = b.user ? b.utilization || 100 : 0;
      return utilB - utilA;
    });

    const size = Math.ceil(Math.sqrt(resources.length));
    const centerX = Math.floor(size / 2);
    const centerY = Math.floor(size / 2);

    let x = centerX;
    let y = centerY;
    let dx = 1;
    let dy = 0;
    let segmentLength = 1;
    let segmentPassed = 0;
    let turnsMade = 0;

    sortedResources.forEach((resource) => {
      resource.x = x;
      resource.y = y;

      x += dx;
      y += dy;
      segmentPassed++;

      if (segmentPassed === segmentLength) {
        segmentPassed = 0;
        [dx, dy] = [-dy, dx];
        turnsMade++;
        if (turnsMade % 2 === 0) {
          segmentLength++;
        }
      }
    });

    let minX = Infinity;
    let minY = Infinity;
    sortedResources.forEach((r) => {
      minX = Math.min(minX, r.x);
      minY = Math.min(minY, r.y);
    });
    sortedResources.forEach((r) => {
      r.x -= minX;
      r.y -= minY;
    });
  }
}

// Radial sunburst layout - concentric rings by hierarchy
export class RadialSunburstLayout extends LayoutStrategy {
  getName(): string {
    return 'RADIAL SUNBURST';
  }

  layout(resources: IResource[], gridWidth: number, gridHeight: number): void {
    const centerX = Math.floor(gridWidth / 2);
    const centerY = Math.floor(gridHeight / 2);
    const maxRadius = Math.min(centerX, centerY) - 1;

    const hwGroups = new Map<string, Map<string, IResource[]>>();

    resources.forEach((resource) => {
      const hwGroup = resource.hardwareGroup || 'Unknown';
      const host = resource.hostname;

      if (!hwGroups.has(hwGroup)) {
        hwGroups.set(hwGroup, new Map());
      }
      const hostMap = hwGroups.get(hwGroup)!;
      if (!hostMap.has(host)) {
        hostMap.set(host, []);
      }
      hostMap.get(host)!.push(resource);
    });

    interface GroupEntry {
      name: string;
      hostMap: Map<string, IResource[]>;
      totalSlots: number;
    }

    const sortedHwGroups: GroupEntry[] = Array.from(hwGroups.entries())
      .map(([name, hostMap]) => {
        let totalSlots = 0;
        hostMap.forEach((slots) => (totalSlots += slots.length));
        return { name, hostMap, totalSlots };
      })
      .sort((a, b) => b.totalSlots - a.totalSlots);

    const totalSlots = resources.length;

    let currentAngle = -Math.PI / 2;

    sortedHwGroups.forEach((hwGroup) => {
      const groupAngleSpan = (hwGroup.totalSlots / totalSlots) * 2 * Math.PI;

      const sortedHosts = Array.from(hwGroup.hostMap.entries())
        .map(([hostname, slots]) => ({ hostname, slots }))
        .sort((a, b) => b.slots.length - a.slots.length);

      let hostAngle = currentAngle;

      sortedHosts.forEach(({ slots }) => {
        const hostAngleSpan = (slots.length / hwGroup.totalSlots) * groupAngleSpan;

        const gpus = slots.filter((s) => s.type === 'gpu');
        const cpus = slots.filter((s) => s.type === 'cpu');

        const innerRadius = maxRadius * 0.3;
        const outerRadius = maxRadius * 0.95;

        if (gpus.length > 0) {
          const gpuRadiusStart = innerRadius;
          const gpuRadiusEnd = innerRadius + (outerRadius - innerRadius) * 0.4;
          this.placeInArc(
            gpus,
            hostAngle,
            hostAngleSpan,
            gpuRadiusStart,
            gpuRadiusEnd,
            centerX,
            centerY
          );
        }

        if (cpus.length > 0) {
          const cpuRadiusStart = innerRadius + (outerRadius - innerRadius) * 0.45;
          const cpuRadiusEnd = outerRadius;
          this.placeInArc(
            cpus,
            hostAngle,
            hostAngleSpan,
            cpuRadiusStart,
            cpuRadiusEnd,
            centerX,
            centerY
          );
        }

        hostAngle += hostAngleSpan;
      });

      currentAngle += groupAngleSpan;
    });
  }

  private placeInArc(
    slots: IResource[],
    startAngle: number,
    angleSpan: number,
    innerRadius: number,
    outerRadius: number,
    centerX: number,
    centerY: number
  ): void {
    if (slots.length === 0) return;

    const radiusRange = outerRadius - innerRadius;
    const circumference =
      2 * Math.PI * ((innerRadius + outerRadius) / 2) * (angleSpan / (2 * Math.PI));

    const slotsPerRing = Math.max(1, Math.floor(circumference));
    const numRings = Math.ceil(slots.length / slotsPerRing);
    const ringSpacing = numRings > 1 ? radiusRange / (numRings - 1) : 0;

    let slotIndex = 0;
    for (let ring = 0; ring < numRings && slotIndex < slots.length; ring++) {
      const radius = innerRadius + ring * ringSpacing;
      const slotsInThisRing = Math.min(slotsPerRing, slots.length - slotIndex);
      const angleStep = slotsInThisRing > 1 ? angleSpan / slotsInThisRing : 0;
      const angleOffset = slotsInThisRing > 1 ? angleStep / 2 : angleSpan / 2;

      for (let i = 0; i < slotsInThisRing && slotIndex < slots.length; i++) {
        const angle = startAngle + angleOffset + i * angleStep;
        const resource = slots[slotIndex];
        resource.x = Math.round(centerX + radius * Math.cos(angle));
        resource.y = Math.round(centerY + radius * Math.sin(angle));
        slotIndex++;
      }
    }
  }
}

// Export all strategy classes for initialization
export const allLayoutStrategies = [
  HostnameHierarchyLayout,
  RackTopologyLayout,
  HardwareGroupLayout,
  UserTerritoriesLayout,
  JobGroupingLayout,
  IdleCompressionLayout,
  HilbertCurveLayout,
  SpiralLayout,
  RadialSunburstLayout,
];
