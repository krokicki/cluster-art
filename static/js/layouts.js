// Layout strategies for positioning resources on the canvas

// Layout strategy interface
export class LayoutStrategy {
    getName() {
        throw new Error('getName() must be implemented');
    }
    layout(resources, gridWidth, gridHeight) {
        throw new Error('layout() must be implemented');
    }
}

// Linear layout grouped by hostname
export class HostnameHierarchyLayout extends LayoutStrategy {
    getName() {
        return 'LINEAR';
    }
    layout(resources, gridWidth, gridHeight) {
        // Group resources by hostname
        const hostGroups = new Map();
        resources.forEach(resource => {
            if (!hostGroups.has(resource.hostname)) {
                hostGroups.set(resource.hostname, []);
            }
            hostGroups.get(resource.hostname).push(resource);
        });

        // Sort hostnames alphabetically for spatial proximity
        const sortedHostnames = Array.from(hostGroups.keys()).sort();

        // Calculate positions
        let x = 0, y = 0;
        const maxWidth = gridWidth;

        sortedHostnames.forEach(hostname => {
            const hostResources = hostGroups.get(hostname);

            // Place all resources from this host together
            hostResources.forEach((resource, idx) => {
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

// User-based layout
export class UserGroupLayout extends LayoutStrategy {
    getName() {
        return 'BY USER';
    }
    layout(resources, gridWidth, gridHeight) {
        // Group resources by user
        const userGroups = new Map();
        resources.forEach(resource => {
            const user = resource.user || 'idle';
            if (!userGroups.has(user)) {
                userGroups.set(user, []);
            }
            userGroups.get(user).push(resource);
        });

        // Sort users alphabetically
        const sortedUsers = Array.from(userGroups.keys()).sort();

        // Calculate positions
        let x = 0, y = 0;
        const maxWidth = gridWidth;

        sortedUsers.forEach(user => {
            const userResources = userGroups.get(user);

            userResources.forEach(resource => {
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
    getName() {
        return 'RACK';
    }

    parseHostname(hostname) {
        // Parse "h04u08" -> { row: "h04", unit: 8 }
        const match = hostname.match(/^([a-z]+\d+)u(\d+)$/i);
        if (match) {
            return { row: match[1].toLowerCase(), unit: parseInt(match[2]) };
        }
        return null;
    }

    layout(resources, gridWidth, gridHeight) {
        // Group resources by hostname
        const hostGroups = new Map();
        resources.forEach(resource => {
            if (!hostGroups.has(resource.hostname)) {
                hostGroups.set(resource.hostname, []);
            }
            hostGroups.get(resource.hostname).push(resource);
        });

        // Parse hostnames and group by row
        const rowMap = new Map(); // row -> [{hostname, unit, resources}]
        hostGroups.forEach((hostResources, hostname) => {
            const parsed = this.parseHostname(hostname);
            if (parsed) {
                if (!rowMap.has(parsed.row)) {
                    rowMap.set(parsed.row, []);
                }
                rowMap.get(parsed.row).push({
                    hostname,
                    unit: parsed.unit,
                    resources: hostResources
                });
            } else {
                // Fallback for unparseable hostnames
                if (!rowMap.has('other')) {
                    rowMap.set('other', []);
                }
                rowMap.get('other').push({
                    hostname,
                    unit: 0,
                    resources: hostResources
                });
            }
        });

        // Sort rows alphabetically
        const sortedRows = Array.from(rowMap.keys()).sort();

        // Find max slots per host and max units per row
        let maxCpuSlots = 0;
        let maxGpuSlots = 0;
        hostGroups.forEach(hostResources => {
            const cpuCount = hostResources.filter(r => r.type === 'cpu').length;
            const gpuCount = hostResources.filter(r => r.type === 'gpu').length;
            maxCpuSlots = Math.max(maxCpuSlots, cpuCount);
            maxGpuSlots = Math.max(maxGpuSlots, gpuCount);
        });

        // Each host is one row: GPU slots first, then CPU slots
        const hostWidth = maxGpuSlots + maxCpuSlots;

        // Calculate actual height of each rack (number of hosts)
        const rackHeights = sortedRows.map(rowName => rowMap.get(rowName).length);
        const totalHosts = rackHeights.reduce((a, b) => a + b, 0);

        // Aim for roughly square aspect ratio
        const numRacks = sortedRows.length;
        const avgRackHeight = totalHosts / numRacks;
        const racksPerRow = Math.max(1, Math.ceil(Math.sqrt(numRacks * (avgRackHeight / hostWidth))));

        // Layout racks in a grid, tracking actual heights per row
        const rowHeights = []; // Track max height of each grid row
        const rackPositions = []; // Store {gridCol, gridRow} for each rack

        sortedRows.forEach((rowName, rackIndex) => {
            const gridCol = rackIndex % racksPerRow;
            const gridRow = Math.floor(rackIndex / racksPerRow);
            rackPositions.push({ gridCol, gridRow });

            // Track max height for this grid row
            const rackHeight = rackHeights[rackIndex];
            if (!rowHeights[gridRow]) rowHeights[gridRow] = 0;
            rowHeights[gridRow] = Math.max(rowHeights[gridRow], rackHeight);
        });

        // Calculate cumulative Y offsets for each grid row
        const rowYOffsets = [0];
        for (let i = 0; i < rowHeights.length - 1; i++) {
            rowYOffsets.push(rowYOffsets[i] + rowHeights[i]);
        }

        // Layout each rack
        sortedRows.forEach((rowName, rackIndex) => {
            const hosts = rowMap.get(rowName);
            hosts.sort((a, b) => a.unit - b.unit);

            const { gridCol, gridRow } = rackPositions[rackIndex];
            const rackX = gridCol * hostWidth;
            const rackY = rowYOffsets[gridRow];

            hosts.forEach((host, hostIndex) => {
                const cpuResources = host.resources.filter(r => r.type === 'cpu');
                const gpuResources = host.resources.filter(r => r.type === 'gpu');

                // Place GPU slots first (left side of host line)
                gpuResources.forEach((resource, idx) => {
                    resource.x = rackX + idx;
                    resource.y = rackY + hostIndex;
                });

                // Place CPU slots after GPUs (right side of host line)
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
    getName() {
        return 'HARDWARE';
    }

    layout(resources, gridWidth, gridHeight) {
        // Group resources by hardware group, then by hostname
        const groupMap = new Map(); // hardwareGroup -> hostname -> resources[]
        resources.forEach(resource => {
            const group = resource.hardwareGroup || 'Unknown';
            if (!groupMap.has(group)) {
                groupMap.set(group, new Map());
            }
            const hostMap = groupMap.get(group);
            if (!hostMap.has(resource.hostname)) {
                hostMap.set(resource.hostname, []);
            }
            hostMap.get(resource.hostname).push(resource);
        });

        // Sort groups by name
        const sortedGroups = Array.from(groupMap.keys()).sort();

        // Find max slots per host
        let maxCpuSlots = 0;
        let maxGpuSlots = 0;
        groupMap.forEach(hostMap => {
            hostMap.forEach(hostResources => {
                const cpuCount = hostResources.filter(r => r.type === 'cpu').length;
                const gpuCount = hostResources.filter(r => r.type === 'gpu').length;
                maxCpuSlots = Math.max(maxCpuSlots, cpuCount);
                maxGpuSlots = Math.max(maxGpuSlots, gpuCount);
            });
        });

        const hostWidth = maxGpuSlots + maxCpuSlots;

        // Calculate heights for each group
        const groupHeights = sortedGroups.map(group => groupMap.get(group).size);
        const totalHosts = groupHeights.reduce((a, b) => a + b, 0);

        // Aim for roughly square aspect ratio
        const numGroups = sortedGroups.length;
        const avgGroupHeight = totalHosts / numGroups;
        const groupsPerRow = Math.max(1, Math.ceil(Math.sqrt(numGroups * (avgGroupHeight / hostWidth))));

        // Layout groups in a grid, tracking actual heights per row
        const rowHeights = [];
        const groupPositions = [];

        sortedGroups.forEach((groupName, groupIndex) => {
            const gridCol = groupIndex % groupsPerRow;
            const gridRow = Math.floor(groupIndex / groupsPerRow);
            groupPositions.push({ gridCol, gridRow });

            const groupHeight = groupHeights[groupIndex];
            if (!rowHeights[gridRow]) rowHeights[gridRow] = 0;
            rowHeights[gridRow] = Math.max(rowHeights[gridRow], groupHeight);
        });

        // Calculate cumulative Y offsets
        const rowYOffsets = [0];
        for (let i = 0; i < rowHeights.length - 1; i++) {
            rowYOffsets.push(rowYOffsets[i] + rowHeights[i]);
        }

        // Layout each group
        sortedGroups.forEach((groupName, groupIndex) => {
            const hostMap = groupMap.get(groupName);
            const sortedHostnames = Array.from(hostMap.keys()).sort();

            const { gridCol, gridRow } = groupPositions[groupIndex];
            const groupX = gridCol * hostWidth;
            const groupY = rowYOffsets[gridRow];

            sortedHostnames.forEach((hostname, hostIndex) => {
                const hostResources = hostMap.get(hostname);
                const cpuResources = hostResources.filter(r => r.type === 'cpu');
                const gpuResources = hostResources.filter(r => r.type === 'gpu');

                // Place GPU slots first
                gpuResources.forEach((resource, idx) => {
                    resource.x = groupX + idx;
                    resource.y = groupY + hostIndex;
                });

                // Place CPU slots after GPUs
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
    getName() {
        return 'USERS';
    }

    layout(resources, gridWidth, gridHeight) {
        // Separate idle and active resources
        const idleResources = [];
        const userMap = new Map(); // user -> resources[]

        resources.forEach(resource => {
            if (!resource.user || resource.user === '') {
                idleResources.push(resource);
            } else {
                if (!userMap.has(resource.user)) {
                    userMap.set(resource.user, []);
                }
                userMap.get(resource.user).push(resource);
            }
        });

        // Sort users by slot count (descending) for better packing
        const sortedUsers = Array.from(userMap.keys()).sort((a, b) => {
            return userMap.get(b).length - userMap.get(a).length;
        });

        // Use full canvas width
        const targetWidth = gridWidth;

        // Simple row-based treemap: fill rows left to right
        let currentX = 0;
        let currentY = 0;
        let rowHeight = 0;
        let maxX = 0;

        sortedUsers.forEach(user => {
            const userResources = userMap.get(user);
            const slotCount = userResources.length;

            // Calculate rectangle dimensions for this user
            const userWidth = Math.ceil(Math.sqrt(slotCount * 1.5));

            // Check if we need to wrap to next row
            if (currentX + userWidth > targetWidth && currentX > 0) {
                currentX = 0;
                currentY += rowHeight;
                rowHeight = 0;
            }

            // Place resources in a rectangle for this user
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

            // Update position for next user
            const actualHeight = Math.ceil(slotCount / userWidth);
            rowHeight = Math.max(rowHeight, actualHeight);
            maxX = Math.max(maxX, currentX + userWidth);
            currentX += userWidth;
        });

        // Place idle slots at the end, filling horizontally across full canvas width
        // Start after the last row of active users
        const idleStartY = currentY + rowHeight;
        let idleX = 0;
        let idleY = idleStartY;

        // Use full canvas width for idle slots
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

// Hilbert curve layout - space-filling curve preserving locality
export class HilbertCurveLayout extends LayoutStrategy {
    getName() {
        return 'HILBERT';
    }

    // Convert 1D index to 2D Hilbert curve coordinates
    hilbertD2xy(n, d) {
        let x = 0, y = 0;
        let s = 1;
        let rx, ry, t = d;

        while (s < n) {
            rx = 1 & (t / 2);
            ry = 1 & (t ^ rx);

            // Rotate quadrant
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

    layout(resources, gridWidth, gridHeight) {
        if (resources.length === 0) return;

        // Sort resources by hostname to keep hosts together
        const sortedResources = [...resources].sort((a, b) => {
            if (a.hostname !== b.hostname) {
                return a.hostname.localeCompare(b.hostname);
            }
            // Within same host, GPUs first, then CPUs
            if (a.type !== b.type) {
                return a.type === 'gpu' ? -1 : 1;
            }
            return a.index - b.index;
        });

        // Calculate Hilbert curve order (must be power of 2)
        const n = Math.pow(2, Math.ceil(Math.log2(Math.sqrt(resources.length))));

        // Map each resource to Hilbert curve position
        sortedResources.forEach((resource, idx) => {
            const { x, y } = this.hilbertD2xy(n, idx);
            resource.x = x;
            resource.y = y;
        });
    }
}

// Spiral layout - center outward, ordered by utilization
export class SpiralLayout extends LayoutStrategy {
    getName() {
        return 'SPIRAL';
    }

    layout(resources, gridWidth, gridHeight) {
        if (resources.length === 0) return;

        // Sort by utilization (highest first - hot center)
        const sortedResources = [...resources].sort((a, b) => {
            const utilA = a.user ? (a.utilization || 100) : 0;
            const utilB = b.user ? (b.utilization || 100) : 0;
            return utilB - utilA;
        });

        // Generate spiral coordinates
        const size = Math.ceil(Math.sqrt(resources.length));
        const centerX = Math.floor(size / 2);
        const centerY = Math.floor(size / 2);

        // Spiral outward from center
        let x = centerX, y = centerY;
        let dx = 1, dy = 0;
        let segmentLength = 1;
        let segmentPassed = 0;
        let turnsMade = 0;

        sortedResources.forEach((resource, idx) => {
            resource.x = x;
            resource.y = y;

            // Move to next position
            x += dx;
            y += dy;
            segmentPassed++;

            // Check if we need to turn
            if (segmentPassed === segmentLength) {
                segmentPassed = 0;
                // Rotate direction 90 degrees counter-clockwise
                [dx, dy] = [-dy, dx];
                turnsMade++;
                // Increase segment length every 2 turns
                if (turnsMade % 2 === 0) {
                    segmentLength++;
                }
            }
        });

        // Normalize coordinates to start from 0
        let minX = Infinity, minY = Infinity;
        sortedResources.forEach(r => {
            minX = Math.min(minX, r.x);
            minY = Math.min(minY, r.y);
        });
        sortedResources.forEach(r => {
            r.x -= minX;
            r.y -= minY;
        });
    }
}

// Job grouping layout - groups by job_id to show job footprints
export class JobGroupingLayout extends LayoutStrategy {
    getName() {
        return 'JOBS';
    }

    layout(resources, gridWidth, gridHeight) {
        // Separate resources by job
        const jobMap = new Map(); // jobId -> resources[]
        const idleResources = [];

        resources.forEach(resource => {
            if (!resource.jobId || resource.jobId === '') {
                idleResources.push(resource);
            } else {
                if (!jobMap.has(resource.jobId)) {
                    jobMap.set(resource.jobId, []);
                }
                jobMap.get(resource.jobId).push(resource);
            }
        });

        // Sort jobs by slot count (descending)
        const sortedJobs = Array.from(jobMap.keys()).sort((a, b) => {
            return jobMap.get(b).length - jobMap.get(a).length;
        });

        // Use full canvas width
        const targetWidth = gridWidth;

        // Layout jobs as rectangular blocks
        let currentX = 0;
        let currentY = 0;
        let rowHeight = 0;

        sortedJobs.forEach(jobId => {
            const jobResources = jobMap.get(jobId);
            const slotCount = jobResources.length;

            // Calculate rectangle dimensions for this job
            const jobWidth = Math.ceil(Math.sqrt(slotCount * 1.5));

            // Check if we need to wrap to next row
            if (currentX + jobWidth > targetWidth && currentX > 0) {
                currentX = 0;
                currentY += rowHeight;
                rowHeight = 0;
            }

            // Place resources in a rectangle for this job
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

            // Update position for next job
            const actualHeight = Math.ceil(slotCount / jobWidth);
            rowHeight = Math.max(rowHeight, actualHeight);
            currentX += jobWidth;
        });

        // Place idle slots at the end
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

// Radial sunburst layout - concentric rings by hierarchy
export class RadialSunburstLayout extends LayoutStrategy {
    getName() {
        return 'RADIAL SUNBURST';
    }

    layout(resources, gridWidth, gridHeight) {
        // Center of the sunburst
        const centerX = Math.floor(gridWidth / 2);
        const centerY = Math.floor(gridHeight / 2);
        const maxRadius = Math.min(centerX, centerY) - 1;

        // Group by hardware group -> host -> slots
        const hwGroups = new Map(); // hwGroup -> Map(host -> resources[])

        resources.forEach(resource => {
            const hwGroup = resource.hardwareGroup || 'Unknown';
            const host = resource.hostname;

            if (!hwGroups.has(hwGroup)) {
                hwGroups.set(hwGroup, new Map());
            }
            const hostMap = hwGroups.get(hwGroup);
            if (!hostMap.has(host)) {
                hostMap.set(host, []);
            }
            hostMap.get(host).push(resource);
        });

        // Sort hardware groups by total slot count (largest first)
        const sortedHwGroups = Array.from(hwGroups.entries())
            .map(([name, hostMap]) => {
                let totalSlots = 0;
                hostMap.forEach(slots => totalSlots += slots.length);
                return { name, hostMap, totalSlots };
            })
            .sort((a, b) => b.totalSlots - a.totalSlots);

        const totalSlots = resources.length;

        // Assign angular spans to each hardware group
        let currentAngle = -Math.PI / 2; // Start at top

        sortedHwGroups.forEach(hwGroup => {
            const groupAngleSpan = (hwGroup.totalSlots / totalSlots) * 2 * Math.PI;

            // Sort hosts within group by slot count
            const sortedHosts = Array.from(hwGroup.hostMap.entries())
                .map(([hostname, slots]) => ({ hostname, slots }))
                .sort((a, b) => b.slots.length - a.slots.length);

            // Assign angular spans to each host within the group
            let hostAngle = currentAngle;

            sortedHosts.forEach(({ hostname, slots }) => {
                const hostAngleSpan = (slots.length / hwGroup.totalSlots) * groupAngleSpan;

                // Separate GPUs and CPUs
                const gpus = slots.filter(s => s.type === 'gpu');
                const cpus = slots.filter(s => s.type === 'cpu');

                // GPUs in inner ring, CPUs in outer ring
                const innerRadius = maxRadius * 0.3;
                const outerRadius = maxRadius * 0.95;

                // Place GPUs in inner portion
                if (gpus.length > 0) {
                    const gpuRadiusStart = innerRadius;
                    const gpuRadiusEnd = innerRadius + (outerRadius - innerRadius) * 0.4;
                    this.placeInArc(gpus, hostAngle, hostAngleSpan, gpuRadiusStart, gpuRadiusEnd, centerX, centerY);
                }

                // Place CPUs in outer portion
                if (cpus.length > 0) {
                    const cpuRadiusStart = innerRadius + (outerRadius - innerRadius) * 0.45;
                    const cpuRadiusEnd = outerRadius;
                    this.placeInArc(cpus, hostAngle, hostAngleSpan, cpuRadiusStart, cpuRadiusEnd, centerX, centerY);
                }

                hostAngle += hostAngleSpan;
            });

            currentAngle += groupAngleSpan;
        });
    }

    placeInArc(slots, startAngle, angleSpan, innerRadius, outerRadius, centerX, centerY) {
        if (slots.length === 0) return;

        // Calculate how many rings and slots per ring we need
        const radiusRange = outerRadius - innerRadius;
        const circumference = 2 * Math.PI * ((innerRadius + outerRadius) / 2) * (angleSpan / (2 * Math.PI));

        // Estimate slots that fit in one ring within our angle span
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

// Idle compression layout - active slots dense at top, idle compressed below
export class IdleCompressionLayout extends LayoutStrategy {
    getName() {
        return 'IDLE COMPRESSION';
    }

    layout(resources, gridWidth, gridHeight) {
        // Separate active and idle slots
        const activeSlots = [];
        const idleSlots = [];

        resources.forEach(resource => {
            if (resource.user && resource.user !== '') {
                activeSlots.push(resource);
            } else {
                idleSlots.push(resource);
            }
        });

        // Active slots: pack densely at top, filling full width
        let x = 0;
        let y = 0;

        activeSlots.forEach(resource => {
            resource.x = x;
            resource.y = y;
            x++;
            if (x >= gridWidth) {
                x = 0;
                y++;
            }
        });

        // Calculate where active section ends
        const activeEndY = (x > 0) ? y + 1 : y;

        // Idle slots: compressed into fewer rows with gaps
        // Use wider spacing to make them visually smaller/less prominent
        const idleStartY = activeEndY + 1; // Gap between sections
        const compressionFactor = 2; // Pack idle slots with gaps

        let idleX = 0;
        let idleY = idleStartY;
        let idleCol = 0;

        idleSlots.forEach((resource, i) => {
            resource.x = idleX;
            resource.y = idleY;

            idleCol++;
            idleX += compressionFactor; // Skip pixels for compression effect

            if (idleX >= gridWidth) {
                idleX = 0;
                idleCol = 0;
                idleY++;
            }
        });
    }
}
