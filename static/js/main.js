// Main application entry point
import { PIXEL_SIZE, MIN_ZOOM, MAX_ZOOM, ZOOM_STEP, MIN_CANVAS_SIZE, MODE_DESCRIPTIONS } from './config.js';
import * as state from './state.js';
import { Resource } from './models.js';
import {
    HostnameHierarchyLayout, RackTopologyLayout, HardwareGroupLayout,
    UserTerritoriesLayout, HilbertCurveLayout, SpiralLayout,
    JobGroupingLayout, RadialSunburstLayout, IdleCompressionLayout
} from './layouts.js';
import {
    UserColorStrategy, HostnameColorStrategy, RowColorStrategy,
    TypeColorStrategy, GpuTypeColorStrategy, UtilizationColorStrategy,
    StatusColorStrategy, HostStatusColorStrategy, MemoryLoadColorStrategy,
    sparseToArray, generateDistinctColors
} from './colors.js';
import * as timetravel from './timetravel.js';

// DOM elements
const canvas = document.getElementById('grid');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('tooltip');
const help = document.getElementById('help');
const legend = document.getElementById('legend');
const modalOverlay = document.getElementById('modal-overlay');
const modal = document.getElementById('modal');

// Local UI state
let currentResource = null;
let hoverGridX = null;
let hoverGridY = null;
let currentResourceIndex = -1;

// Color strategies array (local reference)
let colorStrategies = [];
let layoutStrategies = [];

// Generate user colors
function generateUserColors(users) {
    const colors = new Map();
    const uniqueUsers = Array.from(new Set(users)).filter(u => u && u !== '');

    uniqueUsers.forEach((user, i) => {
        const hue = (i * 360 / uniqueUsers.length) % 360;
        const saturation = 65 + Math.random() * 15;
        const lightness = 55 + Math.random() * 15;
        colors.set(user, `hsl(${hue}, ${saturation}%, ${lightness}%)`);
    });

    colors.set(null, '#2a2a2a');
    colors.set('', '#2a2a2a');

    return colors;
}

// Process cluster data (used by time travel)
function processClusterData(data) {
    const allResources = [];
    const allUsers = [];

    data.hostDetails.forEach(host => {
        const hardwareGroup = host.hardwareGroup || 'Unknown';
        const cpuSlotsArray = sparseToArray(host.cpuSlots, host.cpus.total);
        const gpuSlotsArray = sparseToArray(host.gpuSlots, host.gpus.total);

        cpuSlotsArray.forEach((user, idx) => {
            const resource = new Resource(host.hostname, 'cpu', idx, user, host, hardwareGroup);
            if (user && data.raw?.jobs?.all) {
                const cpuJob = data.raw.jobs.all.find(job =>
                    job.user === user &&
                    job.status === 'RUN' &&
                    job.exec_host && job.exec_host.includes(host.hostname)
                );
                if (cpuJob) {
                    resource.jobId = cpuJob.job_id;
                    resource.jobName = cpuJob.job_name;
                }
            }
            allResources.push(resource);
            if (user && user !== '') allUsers.push(user);
        });

        gpuSlotsArray.forEach((user, idx) => {
            const resource = new Resource(host.hostname, 'gpu', idx, user, host, hardwareGroup);
            if (data.raw?.gpu_attribution) {
                const gpuAttr = data.raw.gpu_attribution.find(attr =>
                    attr.hostname === host.hostname && attr.gpu_id === idx
                );
                if (gpuAttr) {
                    resource.jobId = gpuAttr.job_id;
                    resource.jobName = gpuAttr.job_name;
                }
            }
            allResources.push(resource);
            if (user && user !== '') allUsers.push(user);
        });
    });

    state.setResources(allResources);
    state.setUserColorMap(generateUserColors(allUsers));

    initializeColorStrategies();
    initializeLayoutStrategies();
    reflowLayout();
    updateCurrentModeDisplay();
    updateCurrentLayoutDisplay();
    populateLegend();
    refreshTooltip();
}

// Load cluster data from API
async function loadClusterData() {
    try {
        const response = await fetch('/api/cluster-status');
        const data = await response.json();

        processClusterData(data);
        return true;
    } catch (error) {
        console.error('Failed to load cluster data:', error);
        return false;
    }
}

// Apply layout strategy
function applyLayout(strategy) {
    strategy.layout(state.resources, state.gridWidth, state.gridHeight);
}

// Initialize color strategies
function initializeColorStrategies() {
    colorStrategies = [
        new UserColorStrategy(),
        new HostnameColorStrategy(),
        new RowColorStrategy(),
        new TypeColorStrategy(),
        new GpuTypeColorStrategy(),
        new UtilizationColorStrategy(),
        new StatusColorStrategy(),
        new HostStatusColorStrategy(),
        new MemoryLoadColorStrategy()
    ];

    colorStrategies.forEach(strategy => strategy.initialize(state.resources));
    state.setColorStrategies(colorStrategies);
}

// Initialize layout strategies
function initializeLayoutStrategies() {
    layoutStrategies = [
        new HostnameHierarchyLayout(),
        new RackTopologyLayout(),
        new HardwareGroupLayout(),
        new UserTerritoriesLayout(),
        new JobGroupingLayout(),
        new IdleCompressionLayout(),
        new HilbertCurveLayout(),
        new SpiralLayout(),
        new RadialSunburstLayout()
    ];
    state.setLayoutStrategies(layoutStrategies);
}

// Update current layout display
function updateCurrentLayoutDisplay() {
    const layoutDisplay = document.getElementById('current-layout');
    if (layoutDisplay && layoutStrategies.length > 0) {
        const strategy = layoutStrategies[state.currentLayoutMode - 1];
        layoutDisplay.textContent = 'LAYOUT: ' + strategy.getName();
    }
}

// Switch layout mode
function switchLayoutMode(mode) {
    if (mode >= 1 && mode <= layoutStrategies.length) {
        state.setCurrentLayoutMode(mode);
        updateCurrentLayoutDisplay();
        reflowLayout();
        state.saveStateToURL();
    }
}

// Populate legend
function populateLegend() {
    const legendItems = document.getElementById('legend-items');
    legendItems.innerHTML = '';

    if (colorStrategies.length === 0) return;

    const colorStrategy = colorStrategies[state.currentColorMode - 1];
    const items = colorStrategy.getLegendItems(state.resources);

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'legend-item';
        div.innerHTML = `
            <div class="legend-color" style="background-color: ${item.color}"></div>
            <span class="legend-user">${item.label}</span>
            <span class="legend-count">${item.count}</span>
        `;
        legendItems.appendChild(div);
    });
}

// Draw the grid
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (colorStrategies.length === 0) return;

    const colorStrategy = colorStrategies[state.currentColorMode - 1];
    const effectivePixelSize = PIXEL_SIZE * state.zoomLevel;

    state.resources.forEach(resource => {
        const color = colorStrategy.getColor(resource);
        ctx.fillStyle = color;
        ctx.fillRect(
            Math.floor(resource.x * effectivePixelSize),
            Math.floor(resource.y * effectivePixelSize),
            Math.ceil(effectivePixelSize) + 1,
            Math.ceil(effectivePixelSize) + 1
        );

        if (currentResource && resource === currentResource) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.strokeRect(
                resource.x * effectivePixelSize + 0.5,
                resource.y * effectivePixelSize + 0.5,
                effectivePixelSize - 1,
                effectivePixelSize - 1
            );
        }
    });
}

// Canvas positioning
function centerCanvas() {
    state.setCanvasX((window.innerWidth - state.canvasWidth) / 2);
    state.setCanvasY((window.innerHeight - state.canvasHeight) / 2);
    updateCanvasPosition();
}

function updateCanvasPosition() {
    const container = document.getElementById('canvas-container');
    container.style.left = state.canvasX + 'px';
    container.style.top = state.canvasY + 'px';
    container.style.width = state.canvasWidth + 'px';
    container.style.height = state.canvasHeight + 'px';
}

function updateCanvasSize() {
    canvas.width = state.canvasWidth;
    canvas.height = state.canvasHeight;

    state.setGridWidth(Math.floor(state.canvasWidth / PIXEL_SIZE));
    state.setGridHeight(Math.floor(state.canvasHeight / PIXEL_SIZE));
}

function updateZoomDisplay() {
    const zoomDisplay = document.getElementById('zoom-level');
    zoomDisplay.textContent = Math.round(state.zoomLevel * 100) + '%';
}

function reflowLayout() {
    const effectivePixelSize = PIXEL_SIZE * state.zoomLevel;
    state.setGridWidth(Math.floor(state.canvasWidth / effectivePixelSize));
    state.setGridHeight(Math.floor(state.canvasHeight / effectivePixelSize));

    if (state.resources.length > 0 && layoutStrategies.length > 0) {
        const layoutStrategy = layoutStrategies[state.currentLayoutMode - 1];
        applyLayout(layoutStrategy);
        draw();
    }
}

// Tooltip functions
function showTooltip(resource) {
    const userText = resource.isIdle
        ? '<span class="idle">IDLE</span>'
        : `<span class="value">${resource.user}</span>`;

    tooltip.innerHTML = `
        <span class="label">HOST:</span> <span class="value">${resource.hostname}</span> |
        <span class="label">TYPE:</span> <span class="value">${resource.type.toUpperCase()}</span> |
        <span class="label">SLOT:</span> <span class="value">#${resource.index}</span> |
        <span class="label">USER:</span> ${userText}
    `;

    tooltip.classList.add('visible');
    draw();
}

function hideTooltip() {
    currentResource = null;
    tooltip.classList.remove('visible');
    draw();
}

function refreshTooltip() {
    if (hoverGridX !== null && hoverGridY !== null) {
        const resource = state.resources.find(r => r.x === hoverGridX && r.y === hoverGridY);
        if (resource) {
            currentResource = resource;
            showTooltip(resource);
        } else {
            hideTooltip();
        }
    }
}

// Mode display
function updateCurrentModeDisplay() {
    const currentModeDisplay = document.getElementById('current-mode');
    if (currentModeDisplay) {
        currentModeDisplay.textContent = `Color ${MODE_DESCRIPTIONS[state.currentColorMode - 1]}`;
    }
}

function switchColorMode(mode) {
    if (mode >= 1 && mode <= 9 && colorStrategies.length > 0) {
        state.setCurrentColorMode(mode);
        updateCurrentModeDisplay();
        populateLegend();
        draw();
        state.saveStateToURL();
    }
}

// Panel toggles
function toggleHelp() {
    state.setHelpExpanded(!state.helpExpanded);
    if (state.helpExpanded) {
        help.classList.add('expanded');
    } else {
        help.classList.remove('expanded');
    }
    state.saveStateToURL();
}

function toggleLegend() {
    state.setLegendExpanded(!state.legendExpanded);
    if (state.legendExpanded) {
        legend.classList.add('expanded');
    } else {
        legend.classList.remove('expanded');
    }
    state.saveStateToURL();
}

function toggleAllPanels() {
    const anyOpen = state.legendExpanded || state.helpExpanded || state.timeTravelExpanded;

    if (anyOpen) {
        state.setLegendExpanded(false);
        state.setHelpExpanded(false);
        state.setTimeTravelExpanded(false);
        legend.classList.remove('expanded');
        help.classList.remove('expanded');
        document.getElementById('time-travel').classList.remove('expanded');
    } else {
        state.setLegendExpanded(true);
        state.setHelpExpanded(true);
        state.setTimeTravelExpanded(true);
        legend.classList.add('expanded');
        help.classList.add('expanded');
        document.getElementById('time-travel').classList.add('expanded');
    }
    state.saveStateToURL();
}

// Zoom functions
function zoomIn() {
    if (state.zoomLevel < MAX_ZOOM) {
        state.setZoomLevel(Math.min(MAX_ZOOM, state.zoomLevel + ZOOM_STEP));
        updateZoomDisplay();
        reflowLayout();
        state.saveStateToURL();
    }
}

function zoomOut() {
    if (state.zoomLevel > MIN_ZOOM) {
        state.setZoomLevel(Math.max(MIN_ZOOM, state.zoomLevel - ZOOM_STEP));
        updateZoomDisplay();
        reflowLayout();
        state.saveStateToURL();
    }
}

// Modal functions
function createBarGraph(label, value, max) {
    const percentage = max > 0 ? (value / max) * 100 : 0;
    return `
        <div class="bar-row">
            <div class="bar-label">${label}</div>
            <div class="bar-container">
                <div class="bar-fill" style="width: ${percentage}%"></div>
            </div>
            <div class="bar-value">${value.toFixed(1)}</div>
        </div>
    `;
}

function showModal(resource) {
    currentResourceIndex = state.resources.indexOf(resource);

    const modalTitle = document.getElementById('modal-title');
    const modalStatus = document.getElementById('modal-status');
    const modalContent = document.getElementById('modal-content');

    modalTitle.innerHTML = `
        <span class="modal-hostname">${resource.hostname}</span>
        <span class="modal-type ${resource.type}">${resource.type.toUpperCase()} #${resource.index}</span>
    `;

    const statusClass = resource.isIdle ? 'idle' : 'active';
    modalStatus.innerHTML = `<span class="${statusClass}">${resource.isIdle ? 'IDLE' : 'IN USE'}</span>`;

    let jobInfo = '';
    if (resource.jobId) {
        jobInfo = `
            <div class="modal-section">
                <div class="modal-section-title">JOB INFO</div>
                <div class="detail-row">
                    <span class="detail-label">Job ID:</span>
                    <span class="detail-value">${resource.jobId}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Job Name:</span>
                    <span class="detail-value">${resource.jobName || 'N/A'}</span>
                </div>
            </div>
        `;
    }

    let loadGraphs = '';
    if (resource.load && Object.keys(resource.load).length > 0) {
        const load = resource.load;
        loadGraphs = `
            <div class="modal-section">
                <div class="modal-section-title">HOST LOAD</div>
                ${createBarGraph('15s avg', load.r15s || 0, 100)}
                ${createBarGraph('1m avg', load.r1m || 0, 100)}
                ${createBarGraph('15m avg', load.r15m || 0, 100)}
                ${createBarGraph('CPU %', load.ut || 0, 100)}
                ${createBarGraph('Memory GB', (load.mem || 0) / 1024, 512)}
                ${createBarGraph('I/O KB/s', load.io || 0, 10000)}
            </div>
        `;
    }

    modalContent.innerHTML = `
        <div class="modal-section">
            <div class="modal-section-title">RESOURCE DETAILS</div>
            <div class="detail-row">
                <span class="detail-label">User:</span>
                <span class="detail-value">${resource.user || 'None'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Hardware:</span>
                <span class="detail-value">${resource.hardwareGroup}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">GPU Type:</span>
                <span class="detail-value">${resource.gpuType || 'N/A'}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Status:</span>
                <span class="detail-value">${resource.status}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">Utilization:</span>
                <span class="detail-value">${resource.utilization}%</span>
            </div>
        </div>
        ${jobInfo}
        ${loadGraphs}
    `;

    modalOverlay.classList.add('visible');
    updateNavigationArrows();
}

function updateNavigationArrows() {
    const leftArrow = document.getElementById('modal-nav-left');
    const rightArrow = document.getElementById('modal-nav-right');

    leftArrow.style.visibility = currentResourceIndex > 0 ? 'visible' : 'hidden';
    rightArrow.style.visibility = currentResourceIndex < state.resources.length - 1 ? 'visible' : 'hidden';
}

function navigateToPrevious() {
    if (currentResourceIndex > 0) {
        currentResourceIndex--;
        showModal(state.resources[currentResourceIndex]);
    }
}

function navigateToNext() {
    if (currentResourceIndex < state.resources.length - 1) {
        currentResourceIndex++;
        showModal(state.resources[currentResourceIndex]);
    }
}

function closeModal() {
    modalOverlay.classList.remove('visible');
    currentResourceIndex = -1;
}

// Refresh data periodically
async function refreshData() {
    if (state.timeTravelMode) return;

    const loaded = await loadClusterData();
    if (loaded) {
        initializeColorStrategies();
        reflowLayout();
        populateLegend();
        refreshTooltip();
    }
}

// Set up time travel event handlers
function setupTimeTravelEventHandlers() {
    document.getElementById('time-travel-title').addEventListener('click', timetravel.toggleTimeTravel);

    document.getElementById('time-travel-slider').addEventListener('input', (e) => {
        if (!state.availableTimepoints?.timestamps?.length) return;
        const index = parseInt(e.target.value);
        if (index >= 0 && index < state.availableTimepoints.timestamps.length) {
            const timestamp = state.availableTimepoints.timestamps[index];
            timetravel.enterTimeTravelMode(timestamp, index);
        }
    });

    document.getElementById('time-travel-play').addEventListener('click', () => {
        if (!state.availableTimepoints?.timestamps?.length) return;
        if (state.timeTravelPlaying) {
            timetravel.stopPlayback();
        } else {
            if (!state.timeTravelMode) {
                timetravel.enterTimeTravelMode(state.availableTimepoints.timestamps[0], 0);
            }
            timetravel.startPlayback();
        }
    });

    document.getElementById('time-travel-prev').addEventListener('click', () => {
        if (!state.availableTimepoints?.timestamps?.length) return;
        if (state.currentTimepointIndex > 0) {
            state.setCurrentTimepointIndex(state.currentTimepointIndex - 1);
            const timestamp = state.availableTimepoints.timestamps[state.currentTimepointIndex];
            document.getElementById('time-travel-slider').value = state.currentTimepointIndex;
            timetravel.enterTimeTravelMode(timestamp, state.currentTimepointIndex);
        }
    });

    document.getElementById('time-travel-next').addEventListener('click', () => {
        if (!state.availableTimepoints?.timestamps?.length) return;
        if (state.currentTimepointIndex < state.availableTimepoints.timestamps.length - 1) {
            state.setCurrentTimepointIndex(state.currentTimepointIndex + 1);
            const timestamp = state.availableTimepoints.timestamps[state.currentTimepointIndex];
            document.getElementById('time-travel-slider').value = state.currentTimepointIndex;
            timetravel.enterTimeTravelMode(timestamp, state.currentTimepointIndex);
        }
    });

    document.getElementById('time-travel-speed').addEventListener('change', (e) => {
        state.setTimeTravelSpeed(parseFloat(e.target.value));
        state.saveStateToURL();
    });

    document.getElementById('time-travel-live').addEventListener('click', timetravel.returnToLive);
}

// Initialize the application
async function init() {
    // Set up time travel callbacks
    timetravel.setTimeTravelCallbacks({
        onDataLoaded: processClusterData,
        onLoadClusterData: loadClusterData
    });

    const hasURLState = state.loadStateFromURL();

    if (!hasURLState) {
        const topMargin = 85;
        const bottomMargin = 85;
        const sideMargin = window.innerWidth * 0.025;

        state.setCanvasWidth(Math.floor(window.innerWidth * 0.95));
        state.setCanvasHeight(Math.floor(window.innerHeight - topMargin - bottomMargin));
        state.setCanvasX(sideMargin);
        state.setCanvasY(topMargin);
    }

    updateCanvasPosition();
    updateCanvasSize();
    updateZoomDisplay();

    const loaded = await loadClusterData();

    if (loaded) {
        initializeColorStrategies();
        initializeLayoutStrategies();
        reflowLayout();
        updateCurrentModeDisplay();
        updateCurrentLayoutDisplay();
        populateLegend();

        if (hasURLState) {
            if (state.legendExpanded) legend.classList.add('expanded');
            if (state.helpExpanded) help.classList.add('expanded');
        }

        await timetravel.initTimeTravel();

        document.getElementById('time-travel-speed').value = state.timeTravelSpeed;

        if (state.timeTravelTimestamp && state.availableTimepoints?.timestamps) {
            const index = state.availableTimepoints.timestamps.indexOf(state.timeTravelTimestamp);
            if (index !== -1) {
                state.setCurrentTimepointIndex(index);
                document.getElementById('time-travel-slider').value = index;
                timetravel.enterTimeTravelMode(state.timeTravelTimestamp, index);
            }
        }

        if (state.timeTravelExpanded) {
            document.getElementById('time-travel').classList.add('expanded');
        }

        if (state.timeTravelPlayOnLoad && state.availableTimepoints?.timestamps?.length) {
            if (!state.timeTravelMode) {
                timetravel.enterTimeTravelMode(state.availableTimepoints.timestamps[0], 0);
            }
            timetravel.startPlayback();
        }

        state.saveStateToURL();
    } else {
        ctx.fillStyle = '#ffffff';
        ctx.font = '16px monospace';
        ctx.fillText('Failed to load cluster-status.json', 20, 30);
    }

    setupTimeTravelEventHandlers();

    // Set up periodic refresh
    setInterval(refreshData, 120000);
}

// Event listeners
document.getElementById('help-title').addEventListener('click', toggleHelp);
document.getElementById('legend-title').addEventListener('click', toggleLegend);
document.getElementById('zoom-in').addEventListener('click', zoomIn);
document.getElementById('zoom-out').addEventListener('click', zoomOut);
document.getElementById('zoom-level').addEventListener('click', () => {
    state.setZoomLevel(1.0);
    updateZoomDisplay();
    reflowLayout();
    state.saveStateToURL();
});

// Mouse events for canvas
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const effectivePixelSize = PIXEL_SIZE * state.zoomLevel;
    hoverGridX = Math.floor(x / effectivePixelSize);
    hoverGridY = Math.floor(y / effectivePixelSize);
    state.setLastHoverX(hoverGridX);
    state.setLastHoverY(hoverGridY);

    const resource = state.resources.find(r => r.x === hoverGridX && r.y === hoverGridY);
    if (resource) {
        currentResource = resource;
        showTooltip(resource);
    } else {
        hideTooltip();
    }
});

canvas.addEventListener('mouseleave', () => {
    hoverGridX = null;
    hoverGridY = null;
    state.setLastHoverX(null);
    state.setLastHoverY(null);
    hideTooltip();
});

canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const effectivePixelSize = PIXEL_SIZE * state.zoomLevel;
    const gridX = Math.floor(x / effectivePixelSize);
    const gridY = Math.floor(y / effectivePixelSize);

    const resource = state.resources.find(r => r.x === gridX && r.y === gridY);
    if (resource) {
        showModal(resource);
    }
});

// Canvas dragging
const container = document.getElementById('canvas-container');
container.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('resize-handle')) {
        state.setIsResizing(true);
        state.setResizeHandle(e.target.dataset.corner);
        state.setDragStartX(e.clientX);
        state.setDragStartY(e.clientY);
        state.setDragStartCanvasX(state.canvasX);
        state.setDragStartCanvasY(state.canvasY);
        state.setDragStartCanvasWidth(state.canvasWidth);
        state.setDragStartCanvasHeight(state.canvasHeight);
    } else {
        state.setIsDragging(true);
        state.setDragStartX(e.clientX);
        state.setDragStartY(e.clientY);
        state.setDragStartCanvasX(state.canvasX);
        state.setDragStartCanvasY(state.canvasY);
        container.classList.add('dragging');
    }
});

document.addEventListener('mousemove', (e) => {
    if (state.isDragging) {
        state.setCanvasX(state.dragStartCanvasX + (e.clientX - state.dragStartX));
        state.setCanvasY(state.dragStartCanvasY + (e.clientY - state.dragStartY));
        updateCanvasPosition();
    } else if (state.isResizing) {
        const dx = e.clientX - state.dragStartX;
        const dy = e.clientY - state.dragStartY;

        let newX = state.dragStartCanvasX;
        let newY = state.dragStartCanvasY;
        let newWidth = state.dragStartCanvasWidth;
        let newHeight = state.dragStartCanvasHeight;

        if (state.resizeHandle.includes('right')) newWidth = Math.max(MIN_CANVAS_SIZE, state.dragStartCanvasWidth + dx);
        if (state.resizeHandle.includes('left')) {
            newWidth = Math.max(MIN_CANVAS_SIZE, state.dragStartCanvasWidth - dx);
            newX = state.dragStartCanvasX + (state.dragStartCanvasWidth - newWidth);
        }
        if (state.resizeHandle.includes('bottom')) newHeight = Math.max(MIN_CANVAS_SIZE, state.dragStartCanvasHeight + dy);
        if (state.resizeHandle.includes('top')) {
            newHeight = Math.max(MIN_CANVAS_SIZE, state.dragStartCanvasHeight - dy);
            newY = state.dragStartCanvasY + (state.dragStartCanvasHeight - newHeight);
        }

        state.setCanvasX(newX);
        state.setCanvasY(newY);
        state.setCanvasWidth(newWidth);
        state.setCanvasHeight(newHeight);
        updateCanvasPosition();
        updateCanvasSize();
        reflowLayout();
    }
});

document.addEventListener('mouseup', () => {
    if (state.isDragging || state.isResizing) {
        state.setIsDragging(false);
        state.setIsResizing(false);
        container.classList.remove('dragging');
        state.saveStateToURL();
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === '+' || e.key === '=') zoomIn();
    else if (e.key === '-' || e.key === '_') zoomOut();
    else if (e.key === 'l' || e.key === 'L') toggleLegend();
    else if (e.key === '?') toggleHelp();
    else if (e.key === 't' || e.key === 'T') timetravel.toggleTimeTravel();
    else if (e.key === 'p' || e.key === 'P') toggleAllPanels();
    else if (e.key === ' ') {
        e.preventDefault();
        if (state.availableTimepoints?.timestamps?.length) {
            if (state.timeTravelPlaying) {
                timetravel.stopPlayback();
            } else {
                if (!state.timeTravelMode) {
                    timetravel.enterTimeTravelMode(state.availableTimepoints.timestamps[0], 0);
                }
                timetravel.startPlayback();
            }
        }
    }
    else if (e.key === 'Escape') closeModal();
    else if (modalOverlay.classList.contains('visible')) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); navigateToPrevious(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); navigateToNext(); }
    }

    const digitMatch = e.code?.match(/^Digit(\d)$/);
    if (digitMatch) {
        const key = parseInt(digitMatch[1]);
        if (e.shiftKey) switchLayoutMode(key);
        else switchColorMode(key);
    }
});

// Modal events
modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
});
document.getElementById('modal-nav-left').addEventListener('click', navigateToPrevious);
document.getElementById('modal-nav-right').addEventListener('click', navigateToNext);

// Scroll wheel zoom
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.deltaY < 0) zoomIn();
    else zoomOut();
}, { passive: false });

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);
