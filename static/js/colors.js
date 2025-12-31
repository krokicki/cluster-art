// Color strategies for visualizing resources
import {
    DISTINCT_USER_COLORS,
    STATIC_STATUS_COLORS,
    DISTINCT_STATUS_COLORS
} from './config.js';

// Persistent cache for user colors (survives across data refreshes)
export const userColorCache = new Map();
let userColorIndex = 0;

// Persistent cache for host status colors
export const hostStatusColorCache = new Map();
let hostStatusColorIndex = 0;

// Base color strategy class
export class ColorStrategy {
    constructor() {
        this.colorMap = new Map();
    }

    getColor(resource) {
        throw new Error('getColor() must be implemented');
    }

    getLegendItems(resources) {
        throw new Error('getLegendItems() must be implemented');
    }

    initialize(resources) {
        // Override if needed to pre-compute colors
    }
}

// Mode 1: By User
export class UserColorStrategy extends ColorStrategy {
    initialize(resources) {
        // Only assign colors to new users, keeping existing colors stable
        const users = resources.map(r => r.user).filter(u => u && u !== '');
        const uniqueUsers = Array.from(new Set(users));

        uniqueUsers.forEach(user => {
            if (!userColorCache.has(user)) {
                // Assign next distinct color from palette
                const color = DISTINCT_USER_COLORS[userColorIndex % DISTINCT_USER_COLORS.length];
                userColorCache.set(user, color);
                userColorIndex++;
            }
            this.colorMap.set(user, userColorCache.get(user));
        });
        this.colorMap.set(null, '#2a2a2a');
        this.colorMap.set('', '#2a2a2a');
    }

    getColor(resource) {
        // Check persistent cache first for users not in current colorMap
        if (resource.user && userColorCache.has(resource.user)) {
            return userColorCache.get(resource.user);
        }
        return this.colorMap.get(resource.user) || this.colorMap.get(null);
    }

    getLegendItems(resources) {
        const counts = new Map();
        resources.forEach(r => {
            const key = r.user || 'idle';
            counts.set(key, (counts.get(key) || 0) + 1);
        });

        return Array.from(counts.keys())
            .sort((a, b) => {
                if (a === 'idle') return 1;
                if (b === 'idle') return -1;
                return counts.get(b) - counts.get(a);
            })
            .map(key => ({
                label: key === 'idle' ? 'IDLE' : key,
                color: this.getColor({ user: key === 'idle' ? null : key }),
                count: counts.get(key)
            }));
    }
}

// Mode 2: By Hostname
export class HostnameColorStrategy extends ColorStrategy {
    initialize(resources) {
        const hostnames = Array.from(new Set(resources.map(r => r.hostname))).sort();
        hostnames.forEach((hostname) => {
            this.colorMap.set(hostname, hashStringToColor(hostname));
        });
    }

    getColor(resource) {
        return this.colorMap.get(resource.hostname) || '#2a2a2a';
    }

    getLegendItems(resources) {
        const counts = new Map();
        resources.forEach(r => {
            counts.set(r.hostname, (counts.get(r.hostname) || 0) + 1);
        });

        return Array.from(counts.keys())
            .sort()
            .map(hostname => ({
                label: hostname,
                color: this.colorMap.get(hostname),
                count: counts.get(hostname)
            }));
    }
}

// Mode 3: By Row
export class RowColorStrategy extends ColorStrategy {
    initialize(resources) {
        const rows = Array.from(new Set(resources.map(r => r.row))).sort();
        // Distinct colors that are easily distinguishable
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

    getColor(resource) {
        return this.colorMap.get(resource.row) || '#2a2a2a';
    }

    getLegendItems(resources) {
        const counts = new Map();
        resources.forEach(r => {
            counts.set(r.row, (counts.get(r.row) || 0) + 1);
        });

        return Array.from(counts.keys())
            .sort()
            .map(row => ({
                label: row,
                color: this.colorMap.get(row),
                count: counts.get(row)
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
            '7GPU L4', 'Unknown'
        ];

        const colors = generateDistinctColors(hardwareGroups.length);
        hardwareGroups.forEach((group, idx) => {
            this.colorMap.set(group, colors[idx]);
        });
    }

    getColor(resource) {
        return this.colorMap.get(resource.hardwareGroup) || '#2a2a2a';
    }

    getLegendItems(resources) {
        const counts = new Map();
        resources.forEach(r => {
            counts.set(r.hardwareGroup, (counts.get(r.hardwareGroup) || 0) + 1);
        });

        return Array.from(counts.keys())
            .sort()
            .map(group => ({
                label: group,
                color: this.colorMap.get(group),
                count: counts.get(group)
            }));
    }
}

// Mode 5: By GPU Type
export class GpuTypeColorStrategy extends ColorStrategy {
    initialize(resources) {
        const gpuTypes = Array.from(new Set(resources.map(r => r.gpuType).filter(t => t)));
        const colors = generateDistinctColors(gpuTypes.length + 1);

        gpuTypes.forEach((type, i) => {
            this.colorMap.set(type, colors[i]);
        });
        this.colorMap.set(null, colors[gpuTypes.length]); // CPU color
    }

    getColor(resource) {
        return this.colorMap.get(resource.gpuType) || this.colorMap.get(null);
    }

    getLegendItems(resources) {
        const counts = new Map();
        resources.forEach(r => {
            const key = r.gpuType || 'CPU';
            counts.set(key, (counts.get(key) || 0) + 1);
        });

        return Array.from(counts.keys())
            .sort((a, b) => {
                if (a === 'CPU') return 1;
                if (b === 'CPU') return -1;
                return a.localeCompare(b);
            })
            .map(key => ({
                label: key,
                color: this.getColor({ gpuType: key === 'CPU' ? null : key }),
                count: counts.get(key)
            }));
    }
}

// Mode 6: By Utilization (Heat Map)
export class UtilizationColorStrategy extends ColorStrategy {
    initialize(resources) {
        const utils = resources.map(r => r.utilization);
        this.min = Math.min(...utils);
        this.max = Math.max(...utils);
    }

    getColor(resource) {
        return getHeatMapColor(resource.utilization, this.min, this.max);
    }

    getLegendItems(resources) {
        const ranges = [
            { label: '0-20%', min: 0, max: 20 },
            { label: '21-40%', min: 21, max: 40 },
            { label: '41-60%', min: 41, max: 60 },
            { label: '61-80%', min: 61, max: 80 },
            { label: '81-100%', min: 81, max: 100 }
        ];

        return ranges.map(range => {
            const count = resources.filter(r =>
                r.utilization >= range.min && r.utilization <= range.max
            ).length;
            return {
                label: range.label,
                color: getHeatMapColor((range.min + range.max) / 2, 0, 100),
                count: count
            };
        });
    }
}

// Mode 7: By Slot Status (Idle vs In-Use)
export class StatusColorStrategy extends ColorStrategy {
    constructor() {
        super();
        this.colorMap.set(true, '#2a2a2a');  // Idle
        this.colorMap.set(false, '#44ff44'); // In-use
    }

    getColor(resource) {
        return this.colorMap.get(resource.isIdle);
    }

    getLegendItems(resources) {
        const idleCount = resources.filter(r => r.isIdle).length;
        const inUseCount = resources.length - idleCount;

        return [
            { label: 'IN-USE', color: this.colorMap.get(false), count: inUseCount },
            { label: 'IDLE', color: this.colorMap.get(true), count: idleCount }
        ];
    }
}

// Mode 8: By Host Status
export class HostStatusColorStrategy extends ColorStrategy {
    initialize(resources) {
        const statuses = Array.from(new Set(resources.map(r => r.status)));
        statuses.forEach(status => {
            if (!hostStatusColorCache.has(status)) {
                // Check for static color first
                if (STATIC_STATUS_COLORS[status]) {
                    hostStatusColorCache.set(status, STATIC_STATUS_COLORS[status]);
                } else {
                    // Assign next distinct color from palette
                    const color = DISTINCT_STATUS_COLORS[hostStatusColorIndex % DISTINCT_STATUS_COLORS.length];
                    hostStatusColorCache.set(status, color);
                    hostStatusColorIndex++;
                }
            }
            this.colorMap.set(status, hostStatusColorCache.get(status));
        });
    }

    getColor(resource) {
        if (resource.status && hostStatusColorCache.has(resource.status)) {
            return hostStatusColorCache.get(resource.status);
        }
        return this.colorMap.get(resource.status) || '#2a2a2a';
    }

    getLegendItems(resources) {
        const counts = new Map();
        resources.forEach(r => {
            counts.set(r.status, (counts.get(r.status) || 0) + 1);
        });

        return Array.from(counts.keys())
            .sort((a, b) => counts.get(b) - counts.get(a))
            .map(status => ({
                label: status,
                color: this.colorMap.get(status),
                count: counts.get(status)
            }));
    }
}

// Mode 9: By Free Memory
export class MemoryLoadColorStrategy extends ColorStrategy {
    initialize(resources) {
        const mems = resources.map(r => r.load?.mem || 0);
        this.min = 0;
        this.max = Math.max(...mems);
    }

    getColor(resource) {
        const mem = resource.load?.mem || 0;
        // Inverted: low memory (0) = red, high memory = blue
        const normalized = Math.max(0, Math.min(1, (mem - this.min) / (this.max - this.min)));
        const hue = normalized * 240;
        return `hsl(${hue}, 80%, 50%)`;
    }

    getLegendItems(resources) {
        const mems = resources.map(r => r.load?.mem || 0);
        const min = 0;
        const max = Math.max(...mems);
        const range = max - min;
        const step = range / 5;

        const ranges = [];
        for (let i = 0; i < 5; i++) {
            const rangeMin = min + (step * i);
            const rangeMax = min + (step * (i + 1));
            const count = resources.filter(r => {
                const mem = r.load?.mem || 0;
                return mem >= rangeMin && mem < (i === 4 ? rangeMax + 1 : rangeMax);
            }).length;

            const normalized = ((rangeMin + rangeMax) / 2) / max;
            const hue = normalized * 240;

            ranges.push({
                label: `${formatMemoryGB(rangeMin)}-${formatMemoryGB(rangeMax)} GB`,
                color: `hsl(${hue}, 80%, 50%)`,
                count: count
            });
        }

        return ranges;
    }
}

// Helper color generation functions
export function generateDistinctColors(count) {
    const colors = [];
    for (let i = 0; i < count; i++) {
        const hue = (i * 360 / count) % 360;
        const saturation = 70;
        const lightness = 60;
        colors.push(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
    }
    return colors;
}

export function hashStringToColor(str) {
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

export function getHeatMapColor(value, min, max) {
    if (max === min) return 'hsl(120, 70%, 50%)';
    const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
    const hue = (1 - normalized) * 240;
    return `hsl(${hue}, 80%, 50%)`;
}

export function formatMemoryGB(memMB, decimals = 1) {
    return (memMB / 1024).toFixed(decimals);
}

// Convert sparse slot format to array
export function sparseToArray(sparseSlots, totalCount) {
    const array = new Array(totalCount).fill('');
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
