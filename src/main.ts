// Main application entry point

import {
  PIXEL_SIZE,
  MIN_ZOOM,
  MAX_ZOOM,
  ZOOM_STEP,
  MIN_CANVAS_SIZE,
  MODE_DESCRIPTIONS,
} from './config';
import { useStore, getState } from './store';
import { Resource } from './models';
import {
  HostnameHierarchyLayout,
  RackTopologyLayout,
  HardwareGroupLayout,
  UserTerritoriesLayout,
  HilbertCurveLayout,
  SpiralLayout,
  JobGroupingLayout,
  RadialSunburstLayout,
  IdleCompressionLayout,
  LayoutStrategy,
} from './layouts';
import {
  UserColorStrategy,
  HostnameColorStrategy,
  RowColorStrategy,
  TypeColorStrategy,
  GpuTypeColorStrategy,
  UtilizationColorStrategy,
  StatusColorStrategy,
  HostStatusColorStrategy,
  MemoryLoadColorStrategy,
  sparseToArray,
  ColorStrategy,
} from './colors';
import * as timetravel from './timetravel';
import type { ClusterStatus } from './types/api';
import type { IResource } from './types';

// DOM elements
const canvas = document.getElementById('grid') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const tooltip = document.getElementById('tooltip')!;
const help = document.getElementById('help')!;
const legend = document.getElementById('legend')!;
const modalOverlay = document.getElementById('modal-overlay')!;
const modeToast = document.getElementById('mode-toast')!;

// Local UI state
let currentResource: IResource | null = null;
let hoverGridX: number | null = null;
let hoverGridY: number | null = null;
let toastTimeout: number | null = null;

// Local reference to strategies
let colorStrategies: ColorStrategy[] = [];
let layoutStrategies: LayoutStrategy[] = [];

// Generate user colors
function generateUserColors(users: (string | null)[]): Map<string, string> {
  const colors = new Map<string, string>();
  const uniqueUsers = Array.from(new Set(users)).filter(
    (u): u is string => u !== null && u !== ''
  );

  uniqueUsers.forEach((user, i) => {
    const hue = ((i * 360) / uniqueUsers.length) % 360;
    const saturation = 65 + Math.random() * 15;
    const lightness = 55 + Math.random() * 15;
    colors.set(user, `hsl(${hue}, ${saturation}%, ${lightness}%)`);
  });

  return colors;
}

// Process cluster data (used by time travel)
function processClusterData(data: ClusterStatus): void {
  const store = useStore.getState();
  const allResources: Resource[] = [];
  const allUsers: (string | null)[] = [];

  data.hostDetails.forEach((host) => {
    const hardwareGroup = host.hardwareGroup || 'Unknown';
    const cpuSlotsArray = sparseToArray(host.cpuSlots, host.cpus.total);
    const gpuSlotsArray = sparseToArray(host.gpuSlots, host.gpus.total);

    cpuSlotsArray.forEach((user, idx) => {
      const resource = new Resource(host.hostname, 'cpu', idx, user || null, host, hardwareGroup);
      if (user && data.raw?.jobs?.all) {
        const cpuJob = data.raw.jobs.all.find(
          (job) =>
            job.user === user &&
            job.status === 'RUN' &&
            job.exec_host &&
            job.exec_host.includes(host.hostname)
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
      const resource = new Resource(host.hostname, 'gpu', idx, user || null, host, hardwareGroup);
      if (data.raw?.gpu_attribution) {
        const gpuAttr = data.raw.gpu_attribution.find(
          (attr) => attr.hostname === host.hostname && attr.gpu_id === idx
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

  store.setResources(allResources);
  store.setUserColorMap(generateUserColors(allUsers));

  initializeColorStrategies();
  initializeLayoutStrategies();
  reflowLayout();
  updateCurrentModeDisplay();
  updateCurrentLayoutDisplay();
  populateLegend();
  refreshTooltip();
}

// Load cluster data from API
async function loadClusterData(): Promise<boolean> {
  try {
    const response = await fetch('/api/cluster-status');
    const data: ClusterStatus = await response.json();

    processClusterData(data);
    return true;
  } catch (error) {
    console.error('Failed to load cluster data:', error);
    return false;
  }
}

// Apply layout strategy
function applyLayout(strategy: LayoutStrategy): void {
  const state = getState();
  strategy.layout(state.resources, state.grid.width, state.grid.height);
}

// Initialize color strategies
function initializeColorStrategies(): void {
  const state = getState();
  colorStrategies = [
    new UserColorStrategy(),
    new HostnameColorStrategy(),
    new RowColorStrategy(),
    new TypeColorStrategy(),
    new GpuTypeColorStrategy(),
    new UtilizationColorStrategy(),
    new StatusColorStrategy(),
    new HostStatusColorStrategy(),
    new MemoryLoadColorStrategy(),
  ];

  colorStrategies.forEach((strategy) => strategy.initialize(state.resources));
  useStore.getState().setColorStrategies(colorStrategies);
}

// Initialize layout strategies
function initializeLayoutStrategies(): void {
  layoutStrategies = [
    new HostnameHierarchyLayout(),
    new RackTopologyLayout(),
    new HardwareGroupLayout(),
    new UserTerritoriesLayout(),
    new JobGroupingLayout(),
    new IdleCompressionLayout(),
    new HilbertCurveLayout(),
    new SpiralLayout(),
    new RadialSunburstLayout(),
  ];
  useStore.getState().setLayoutStrategies(layoutStrategies);
}

// Update current layout display
function updateCurrentLayoutDisplay(): void {
  const state = getState();
  const layoutDisplay = document.getElementById('current-layout');
  if (layoutDisplay && layoutStrategies.length > 0) {
    const strategy = layoutStrategies[state.layoutMode - 1];
    layoutDisplay.textContent = 'LAYOUT: ' + strategy.getName();
  }
}

// Show toast notification
function showToast(label: string, value: string): void {
  if (toastTimeout !== null) {
    clearTimeout(toastTimeout);
  }

  modeToast.innerHTML = `<span class="toast-label">${label}</span><span class="toast-value">${value}</span>`;
  modeToast.classList.add('visible');

  toastTimeout = window.setTimeout(() => {
    modeToast.classList.remove('visible');
    toastTimeout = null;
  }, 1500);
}

// Switch layout mode
function switchLayoutMode(mode: number): void {
  if (mode >= 1 && mode <= layoutStrategies.length) {
    const store = useStore.getState();
    store.setLayoutMode(mode);
    updateCurrentLayoutDisplay();
    reflowLayout();
    store.saveToURL();
    const strategy = layoutStrategies[mode - 1];
    showToast('LAYOUT', strategy.getName());
  }
}

// Populate legend
function populateLegend(): void {
  const state = getState();
  const legendItems = document.getElementById('legend-items');
  if (!legendItems) return;

  legendItems.innerHTML = '';

  if (colorStrategies.length === 0) return;

  const colorStrategy = colorStrategies[state.colorMode - 1];
  const items = colorStrategy.getLegendItems(state.resources);

  items.forEach((item) => {
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
function draw(): void {
  const state = getState();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (colorStrategies.length === 0) return;

  const colorStrategy = colorStrategies[state.colorMode - 1];
  const effectivePixelSize = PIXEL_SIZE * state.zoom;

  state.resources.forEach((resource) => {
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
function updateCanvasPosition(): void {
  const state = getState();
  const container = document.getElementById('canvas-container');
  if (!container) return;

  container.style.left = state.canvas.x + 'px';
  container.style.top = state.canvas.y + 'px';
  container.style.width = state.canvas.width + 'px';
  container.style.height = state.canvas.height + 'px';
}

function updateCanvasSize(): void {
  const state = getState();
  const store = useStore.getState();

  canvas.width = state.canvas.width;
  canvas.height = state.canvas.height;

  store.setGrid({
    width: Math.floor(state.canvas.width / PIXEL_SIZE),
    height: Math.floor(state.canvas.height / PIXEL_SIZE),
  });
}

function updateZoomDisplay(): void {
  const state = getState();
  const zoomDisplay = document.getElementById('zoom-level');
  if (zoomDisplay) {
    zoomDisplay.textContent = Math.round(state.zoom * 100) + '%';
  }
}

function reflowLayout(): void {
  const state = getState();
  const store = useStore.getState();
  const effectivePixelSize = PIXEL_SIZE * state.zoom;

  store.setGrid({
    width: Math.floor(state.canvas.width / effectivePixelSize),
    height: Math.floor(state.canvas.height / effectivePixelSize),
  });

  if (state.resources.length > 0 && layoutStrategies.length > 0) {
    const layoutStrategy = layoutStrategies[state.layoutMode - 1];
    applyLayout(layoutStrategy);
    draw();
  }
}

// Tooltip functions
function showTooltip(resource: IResource): void {
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

function hideTooltip(): void {
  currentResource = null;
  tooltip.classList.remove('visible');
  draw();
}

function refreshTooltip(): void {
  const state = getState();
  if (hoverGridX !== null && hoverGridY !== null) {
    const resource = state.resources.find((r) => r.x === hoverGridX && r.y === hoverGridY);
    if (resource) {
      currentResource = resource;
      showTooltip(resource);
    } else {
      hideTooltip();
    }
  }
}

// Mode display
function updateCurrentModeDisplay(): void {
  const state = getState();
  const currentModeDisplay = document.getElementById('current-mode');
  if (currentModeDisplay) {
    currentModeDisplay.textContent = `Color ${MODE_DESCRIPTIONS[state.colorMode - 1]}`;
  }
}

function switchColorMode(mode: number): void {
  if (mode >= 1 && mode <= 9 && colorStrategies.length > 0) {
    const store = useStore.getState();
    store.setColorMode(mode);
    updateCurrentModeDisplay();
    populateLegend();
    draw();
    store.saveToURL();
    showToast('COLOR', MODE_DESCRIPTIONS[mode - 1]);
  }
}

// Panel toggles
function toggleHelp(): void {
  const store = useStore.getState();
  const state = getState();
  const newExpanded = !state.helpExpanded;

  store.setHelpExpanded(newExpanded);
  if (newExpanded) {
    help.classList.add('expanded');
  } else {
    help.classList.remove('expanded');
  }
  store.saveToURL();
}

function toggleLegend(): void {
  const store = useStore.getState();
  const state = getState();
  const newExpanded = !state.legendExpanded;

  store.setLegendExpanded(newExpanded);
  if (newExpanded) {
    legend.classList.add('expanded');
  } else {
    legend.classList.remove('expanded');
  }
  store.saveToURL();
}

function toggleAllPanels(): void {
  const store = useStore.getState();
  const state = getState();
  const anyOpen = state.legendExpanded || state.helpExpanded || state.timeTravel.expanded;

  const timeTravelPanel = document.getElementById('time-travel');

  if (anyOpen) {
    store.setLegendExpanded(false);
    store.setHelpExpanded(false);
    store.setTimeTravel({ expanded: false });
    legend.classList.remove('expanded');
    help.classList.remove('expanded');
    timeTravelPanel?.classList.remove('expanded');
  } else {
    store.setLegendExpanded(true);
    store.setHelpExpanded(true);
    store.setTimeTravel({ expanded: true });
    legend.classList.add('expanded');
    help.classList.add('expanded');
    timeTravelPanel?.classList.add('expanded');
  }
  store.saveToURL();
}

function toggleUI(): void {
  const store = useStore.getState();
  const state = getState();
  const newHidden = !state.uiHidden;

  store.setUiHidden(newHidden);

  if (newHidden) {
    document.body.classList.add('ui-hidden');
    // Request fullscreen
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {
        // Fullscreen request may fail (e.g., not triggered by user gesture)
      });
    }
  } else {
    document.body.classList.remove('ui-hidden');
    // Exit fullscreen
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }
}

// Sync UI state when user exits fullscreen via Escape or browser controls
document.addEventListener('fullscreenchange', () => {
  const store = useStore.getState();
  const state = getState();

  // If we exited fullscreen but UI is still hidden, restore UI
  if (!document.fullscreenElement && state.uiHidden) {
    store.setUiHidden(false);
    document.body.classList.remove('ui-hidden');
  }
});

// Zoom functions
function zoomIn(): void {
  const store = useStore.getState();
  const state = getState();

  if (state.zoom < MAX_ZOOM) {
    store.setZoom(Math.min(MAX_ZOOM, state.zoom + ZOOM_STEP));
    updateZoomDisplay();
    reflowLayout();
    store.saveToURL();
  }
}

function zoomOut(): void {
  const store = useStore.getState();
  const state = getState();

  if (state.zoom > MIN_ZOOM) {
    store.setZoom(Math.max(MIN_ZOOM, state.zoom - ZOOM_STEP));
    updateZoomDisplay();
    reflowLayout();
    store.saveToURL();
  }
}

// Modal functions
function createBarGraph(label: string, value: number, max: number): string {
  const percentage = max > 0 ? (value / max) * 100 : 0;
  return `
        <div class="bar-graph-row">
            <div class="bar-graph-label">${label}:</div>
            <div class="bar-graph-container">
                <div class="bar-graph-fill" style="width: ${percentage}%"></div>
            </div>
            <div class="bar-graph-value">${value.toFixed(1)}</div>
        </div>
    `;
}

function showModal(resource: IResource): void {
  const state = getState();
  const store = useStore.getState();
  const resourceIndex = state.resources.indexOf(resource);
  store.setModalIndex(resourceIndex);

  const modalTitle = document.getElementById('modal-title');
  const modalStatus = document.getElementById('modal-status');
  const modalContent = document.getElementById('modal-content');

  if (!modalTitle || !modalStatus || !modalContent) return;

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
                <div class="modal-info-row">
                    <span class="modal-label">Job ID:</span>
                    <span class="modal-value">${resource.jobId}</span>
                </div>
                <div class="modal-info-row">
                    <span class="modal-label">Job Name:</span>
                    <span class="modal-value">${resource.jobName || 'N/A'}</span>
                </div>
                <div class="modal-info-row">
                    <span class="modal-label">User:</span>
                    <span class="modal-value">${resource.user || 'None'}</span>
                </div>
            </div>
        `;
  }

  let loadGraphs = '';
  if (resource.load && Object.keys(resource.load).length > 0) {
    const load = resource.load;
    const memoryGB = ((load.mem || 0) / 1024).toFixed(1);
    const ioKBs = (load.io || 0).toFixed(1);
    loadGraphs = `
            <div class="modal-section">
                <div class="modal-section-title">HOST LOAD</div>
                <div class="bar-graph">
                ${createBarGraph('15s avg', load.r15s || 0, 100)}
                ${createBarGraph('1m avg', load.r1m || 0, 100)}
                ${createBarGraph('15m avg', load.r15m || 0, 100)}
                ${createBarGraph('CPU %', load.ut || 0, 100)}
                <div class="bar-graph-row">
                    <div class="bar-graph-label">Memory:</div>
                    <div class="bar-graph-value">${memoryGB} GB</div>
                </div>
                <div class="bar-graph-row">
                    <div class="bar-graph-label">I/O:</div>
                    <div class="bar-graph-value">${ioKBs} KB/s</div>
                </div>
                </div>
            </div>
        `;
  }

  // Left column: Resource details + Job info
  // Right column: Host load graphs
  modalContent.innerHTML = `
        <div>
            <div class="modal-section">
                <div class="modal-section-title">RESOURCE DETAILS</div>
                <div class="modal-info-row">
                    <span class="modal-label">Hardware:</span>
                    <span class="modal-value">${resource.hardwareGroup}</span>
                </div>
                <div class="modal-info-row">
                    <span class="modal-label">GPU Type:</span>
                    <span class="modal-value">${resource.gpuType || 'N/A'}</span>
                </div>
                <div class="modal-info-row">
                    <span class="modal-label">Status:</span>
                    <span class="modal-value">${resource.status}</span>
                </div>
                <div class="modal-info-row">
                    <span class="modal-label">Utilization:</span>
                    <span class="modal-value">${resource.utilization}%</span>
                </div>
            </div>
            ${jobInfo}
        </div>
        <div>
            ${loadGraphs}
        </div>
    `;

  modalOverlay.classList.add('visible');
  updateNavigationArrows();
  store.saveToURL();
}

function updateNavigationArrows(): void {
  const state = getState();
  const modalIndex = state.modalIndex;
  const leftArrow = document.getElementById('modal-nav-left');
  const rightArrow = document.getElementById('modal-nav-right');

  if (leftArrow) {
    if (modalIndex > 0) {
      leftArrow.classList.add('visible');
    } else {
      leftArrow.classList.remove('visible');
    }
  }
  if (rightArrow) {
    if (modalIndex < state.resources.length - 1) {
      rightArrow.classList.add('visible');
    } else {
      rightArrow.classList.remove('visible');
    }
  }
}

function navigateToPrevious(): void {
  const state = getState();
  if (state.modalIndex > 0) {
    showModal(state.resources[state.modalIndex - 1]);
  }
}

function navigateToNext(): void {
  const state = getState();
  if (state.modalIndex < state.resources.length - 1) {
    showModal(state.resources[state.modalIndex + 1]);
  }
}

function closeModal(): void {
  const store = useStore.getState();
  modalOverlay.classList.remove('visible');
  store.setModalIndex(-1);
  store.saveToURL();

  // Hide navigation arrows
  document.getElementById('modal-nav-left')?.classList.remove('visible');
  document.getElementById('modal-nav-right')?.classList.remove('visible');
}

// Refresh data periodically
async function refreshData(): Promise<void> {
  const state = getState();
  if (state.timeTravel.mode) return;

  const loaded = await loadClusterData();
  if (loaded) {
    initializeColorStrategies();
    reflowLayout();
    populateLegend();
    refreshTooltip();
  }
}

// Set up time travel event handlers
function setupTimeTravelEventHandlers(): void {
  document.getElementById('time-travel-title')?.addEventListener('click', timetravel.toggleTimeTravel);

  // Track slider dragging state to prevent external updates while scrubbing
  let sliderDragging = false;
  let wasPlayingBeforeScrub = false;
  let scrubDebounceTimeout: number | null = null;
  const slider = document.getElementById('time-travel-slider') as HTMLInputElement;

  if (slider) {
    // Stop playback and mark dragging on mousedown
    slider.addEventListener('mousedown', () => {
      const state = getState();
      wasPlayingBeforeScrub = state.timeTravel.playing;
      sliderDragging = true;
      timetravel.stopPlayback();
    });

    // Update display and load data with debounce while dragging
    slider.addEventListener('input', () => {
      const state = getState();
      if (!state.timeTravel.availableTimepoints?.timestamps?.length) return;

      const index = parseInt(slider.value);
      if (index >= 0 && index < state.timeTravel.availableTimepoints.timestamps.length) {
        const timestamp = state.timeTravel.availableTimepoints.timestamps[index];
        // Update store state for display immediately
        const store = useStore.getState();
        store.setTimeTravel({
          mode: true,
          timestamp: timestamp,
          currentIndex: index,
        });
        timetravel.updateTimeTravelDisplay();

        // Debounce data loading while scrubbing (150ms delay)
        if (scrubDebounceTimeout !== null) {
          clearTimeout(scrubDebounceTimeout);
        }
        scrubDebounceTimeout = window.setTimeout(() => {
          timetravel.loadClusterDataAt(timestamp);
          scrubDebounceTimeout = null;
        }, 150);
      }
    });

    // Load data immediately when user releases the slider
    slider.addEventListener('mouseup', () => {
      sliderDragging = false;
      // Cancel pending debounce and load immediately
      if (scrubDebounceTimeout !== null) {
        clearTimeout(scrubDebounceTimeout);
        scrubDebounceTimeout = null;
      }
      const state = getState();
      if (!state.timeTravel.availableTimepoints?.timestamps?.length) return;

      const index = parseInt(slider.value);
      if (index >= 0 && index < state.timeTravel.availableTimepoints.timestamps.length) {
        const timestamp = state.timeTravel.availableTimepoints.timestamps[index];
        timetravel.enterTimeTravelMode(timestamp, index);
        // Resume playback if it was playing before scrub
        if (wasPlayingBeforeScrub) {
          timetravel.startPlayback();
        }
      }
    });

    // Handle case where mouse is released outside the slider
    document.addEventListener('mouseup', () => {
      if (sliderDragging) {
        sliderDragging = false;
        if (scrubDebounceTimeout !== null) {
          clearTimeout(scrubDebounceTimeout);
          scrubDebounceTimeout = null;
        }
        const state = getState();
        if (!state.timeTravel.availableTimepoints?.timestamps?.length) return;

        const index = parseInt(slider.value);
        if (index >= 0 && index < state.timeTravel.availableTimepoints.timestamps.length) {
          const timestamp = state.timeTravel.availableTimepoints.timestamps[index];
          timetravel.enterTimeTravelMode(timestamp, index);
          // Resume playback if it was playing before scrub
          if (wasPlayingBeforeScrub) {
            timetravel.startPlayback();
          }
        }
      }
    });
  }

  document.getElementById('time-travel-play')?.addEventListener('click', () => {
    const state = getState();
    if (!state.timeTravel.availableTimepoints?.timestamps?.length) return;
    if (state.timeTravel.playing) {
      timetravel.stopPlayback();
    } else {
      if (!state.timeTravel.mode) {
        timetravel.enterTimeTravelMode(state.timeTravel.availableTimepoints.timestamps[0], 0);
      }
      timetravel.startPlayback();
    }
  });

  document.getElementById('time-travel-prev')?.addEventListener('click', () => {
    const state = getState();
    const store = useStore.getState();
    if (!state.timeTravel.availableTimepoints?.timestamps?.length) return;
    if (state.timeTravel.currentIndex > 0) {
      const newIndex = state.timeTravel.currentIndex - 1;
      store.setTimeTravel({ currentIndex: newIndex });
      const timestamp = state.timeTravel.availableTimepoints.timestamps[newIndex];
      const slider = document.getElementById('time-travel-slider') as HTMLInputElement;
      if (slider) {
        slider.value = String(newIndex);
      }
      timetravel.enterTimeTravelMode(timestamp, newIndex);
    }
  });

  document.getElementById('time-travel-next')?.addEventListener('click', () => {
    const state = getState();
    const store = useStore.getState();
    if (!state.timeTravel.availableTimepoints?.timestamps?.length) return;
    if (state.timeTravel.currentIndex < state.timeTravel.availableTimepoints.timestamps.length - 1) {
      const newIndex = state.timeTravel.currentIndex + 1;
      store.setTimeTravel({ currentIndex: newIndex });
      const timestamp = state.timeTravel.availableTimepoints.timestamps[newIndex];
      const slider = document.getElementById('time-travel-slider') as HTMLInputElement;
      if (slider) {
        slider.value = String(newIndex);
      }
      timetravel.enterTimeTravelMode(timestamp, newIndex);
    }
  });

  // Custom dropdown for speed
  const speedDropdown = document.getElementById('time-travel-speed');
  const speedToggle = speedDropdown?.querySelector('.dropdown-toggle') as HTMLElement;
  const speedMenu = speedDropdown?.querySelector('.dropdown-menu') as HTMLElement;
  const timeTravel = document.getElementById('time-travel');
  const timeTravelContent = document.getElementById('time-travel-content');

  if (speedToggle) {
    speedToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = speedDropdown?.classList.toggle('open');

      // Allow overflow when dropdown is open
      if (isOpen) {
        if (timeTravel) timeTravel.style.overflow = 'visible';
        if (timeTravelContent) timeTravelContent.style.overflow = 'visible';
      } else {
        if (timeTravel) timeTravel.style.overflow = '';
        if (timeTravelContent) timeTravelContent.style.overflow = '';
      }
    });
  }

  if (speedMenu) {
    speedMenu.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('dropdown-item')) {
        const value = target.dataset.value;
        if (value) {
          const store = useStore.getState();
          store.setTimeTravel({ speed: parseFloat(value) });
          store.saveToURL();

          if (speedToggle) {
            speedToggle.textContent = target.textContent;
          }
          speedMenu.querySelectorAll('.dropdown-item').forEach((item) => {
            item.classList.remove('selected');
          });
          target.classList.add('selected');
        }
        speedDropdown?.classList.remove('open');
        if (timeTravel) timeTravel.style.overflow = '';
        if (timeTravelContent) timeTravelContent.style.overflow = '';
      }
    });
  }

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (speedDropdown?.classList.contains('open') && !speedDropdown.contains(e.target as Node)) {
      speedDropdown.classList.remove('open');
      if (timeTravel) timeTravel.style.overflow = '';
      if (timeTravelContent) timeTravelContent.style.overflow = '';
    }
  });

  document.getElementById('time-travel-live')?.addEventListener('click', timetravel.returnToLive);
}

// Initialize the application
async function init(): Promise<void> {
  const store = useStore.getState();

  // Set up time travel callbacks
  timetravel.setTimeTravelCallbacks({
    onDataLoaded: processClusterData,
    onLoadClusterData: loadClusterData,
  });

  const hasURLState = store.loadFromURL();

  if (!hasURLState) {
    const topMargin = 85;
    const bottomMargin = 85;
    const sideMargin = window.innerWidth * 0.025;

    store.setCanvas({
      width: Math.floor(window.innerWidth * 0.95),
      height: Math.floor(window.innerHeight - topMargin - bottomMargin),
      x: sideMargin,
      y: topMargin,
    });
  }

  updateCanvasPosition();
  updateCanvasSize();
  updateZoomDisplay();

  const loaded = await loadClusterData();

  if (loaded) {
    const state = getState();
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

    // Restore speed dropdown state
    const speedDropdown = document.getElementById('time-travel-speed');
    const currentSpeed = getState().timeTravel.speed;
    if (speedDropdown) {
      const selectedItem = speedDropdown.querySelector(`.dropdown-item[data-value="${currentSpeed}"]`);
      if (selectedItem) {
        const toggle = speedDropdown.querySelector('.dropdown-toggle');
        if (toggle) {
          toggle.textContent = selectedItem.textContent;
        }
        speedDropdown.querySelectorAll('.dropdown-item').forEach((item) => {
          item.classList.remove('selected');
        });
        selectedItem.classList.add('selected');
      }
    }

    const currentState = getState();
    if (currentState.timeTravel.timestamp && currentState.timeTravel.availableTimepoints?.timestamps) {
      const index = currentState.timeTravel.availableTimepoints.timestamps.indexOf(
        currentState.timeTravel.timestamp
      );
      if (index !== -1) {
        store.setTimeTravel({ currentIndex: index });
        const slider = document.getElementById('time-travel-slider') as HTMLInputElement;
        if (slider) {
          slider.value = String(index);
        }
        timetravel.enterTimeTravelMode(currentState.timeTravel.timestamp, index);
      }
    }

    if (currentState.timeTravel.expanded) {
      document.getElementById('time-travel')?.classList.add('expanded');
    }

    if (currentState.timeTravel.playOnLoad && currentState.timeTravel.availableTimepoints?.timestamps?.length) {
      if (!currentState.timeTravel.mode) {
        timetravel.enterTimeTravelMode(currentState.timeTravel.availableTimepoints.timestamps[0], 0);
      }
      timetravel.startPlayback();
    }

    // Restore modal state from URL
    if (currentState.modalIndex >= 0 && currentState.modalIndex < currentState.resources.length) {
      showModal(currentState.resources[currentState.modalIndex]);
    }

    store.saveToURL();
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
document.getElementById('help-title')?.addEventListener('click', toggleHelp);
document.getElementById('legend-title')?.addEventListener('click', toggleLegend);
document.getElementById('zoom-in')?.addEventListener('click', zoomIn);
document.getElementById('zoom-out')?.addEventListener('click', zoomOut);
document.getElementById('zoom-level')?.addEventListener('click', () => {
  const store = useStore.getState();
  store.setZoom(1.0);
  updateZoomDisplay();
  reflowLayout();
  store.saveToURL();
});

// Mouse events for canvas
canvas.addEventListener('mousemove', (e) => {
  const state = getState();
  const store = useStore.getState();
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const effectivePixelSize = PIXEL_SIZE * state.zoom;
  hoverGridX = Math.floor(x / effectivePixelSize);
  hoverGridY = Math.floor(y / effectivePixelSize);
  store.setLastHover({ x: hoverGridX, y: hoverGridY });

  const resource = state.resources.find((r) => r.x === hoverGridX && r.y === hoverGridY);
  if (resource) {
    currentResource = resource;
    showTooltip(resource);
  } else {
    hideTooltip();
  }
});

canvas.addEventListener('mouseleave', () => {
  const store = useStore.getState();
  hoverGridX = null;
  hoverGridY = null;
  store.setLastHover({ x: null, y: null });
  hideTooltip();
});

canvas.addEventListener('click', (e) => {
  const state = getState();

  // Ignore click if it was a drag (moved more than 5 pixels)
  const dx = e.clientX - state.interaction.clickStartX;
  const dy = e.clientY - state.interaction.clickStartY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  if (distance > 5) return;

  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const effectivePixelSize = PIXEL_SIZE * state.zoom;
  const gridX = Math.floor(x / effectivePixelSize);
  const gridY = Math.floor(y / effectivePixelSize);

  const resource = state.resources.find((r) => r.x === gridX && r.y === gridY);
  if (resource) {
    showModal(resource);
  }
});

// Canvas dragging
const container = document.getElementById('canvas-container');
container?.addEventListener('mousedown', (e) => {
  const store = useStore.getState();
  const state = getState();
  const target = e.target as HTMLElement;

  // Always record click start position
  store.setInteraction({
    clickStartX: e.clientX,
    clickStartY: e.clientY,
  });

  if (target.classList.contains('resize-handle')) {
    store.setInteraction({
      isResizing: true,
      resizeHandle: target.dataset.corner as 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right',
      dragStartX: e.clientX,
      dragStartY: e.clientY,
      dragStartCanvas: { ...state.canvas },
    });
  } else {
    store.setInteraction({
      isDragging: true,
      dragStartX: e.clientX,
      dragStartY: e.clientY,
      dragStartCanvas: { ...state.canvas },
    });
    container.classList.add('dragging');
  }
});

document.addEventListener('mousemove', (e) => {
  const store = useStore.getState();
  const state = getState();

  if (state.interaction.isDragging) {
    store.setCanvas({
      x: state.interaction.dragStartCanvas.x + (e.clientX - state.interaction.dragStartX),
      y: state.interaction.dragStartCanvas.y + (e.clientY - state.interaction.dragStartY),
    });
    updateCanvasPosition();
  } else if (state.interaction.isResizing && state.interaction.resizeHandle) {
    const dx = e.clientX - state.interaction.dragStartX;
    const dy = e.clientY - state.interaction.dragStartY;

    let newX = state.interaction.dragStartCanvas.x;
    let newY = state.interaction.dragStartCanvas.y;
    let newWidth = state.interaction.dragStartCanvas.width;
    let newHeight = state.interaction.dragStartCanvas.height;

    if (state.interaction.resizeHandle.includes('right')) {
      newWidth = Math.max(MIN_CANVAS_SIZE, state.interaction.dragStartCanvas.width + dx);
    }
    if (state.interaction.resizeHandle.includes('left')) {
      newWidth = Math.max(MIN_CANVAS_SIZE, state.interaction.dragStartCanvas.width - dx);
      newX = state.interaction.dragStartCanvas.x + (state.interaction.dragStartCanvas.width - newWidth);
    }
    if (state.interaction.resizeHandle.includes('bottom')) {
      newHeight = Math.max(MIN_CANVAS_SIZE, state.interaction.dragStartCanvas.height + dy);
    }
    if (state.interaction.resizeHandle.includes('top')) {
      newHeight = Math.max(MIN_CANVAS_SIZE, state.interaction.dragStartCanvas.height - dy);
      newY = state.interaction.dragStartCanvas.y + (state.interaction.dragStartCanvas.height - newHeight);
    }

    store.setCanvas({ x: newX, y: newY, width: newWidth, height: newHeight });
    updateCanvasPosition();
    updateCanvasSize();
    reflowLayout();
  }
});

document.addEventListener('mouseup', () => {
  const store = useStore.getState();
  const state = getState();

  if (state.interaction.isDragging || state.interaction.isResizing) {
    store.setInteraction({ isDragging: false, isResizing: false });
    container?.classList.remove('dragging');
    store.saveToURL();
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
  else if (e.key === 'h') toggleUI();
  else if (e.key === ' ') {
    e.preventDefault();
    const state = getState();
    if (state.timeTravel.availableTimepoints?.timestamps?.length) {
      if (state.timeTravel.playing) {
        timetravel.stopPlayback();
      } else {
        if (!state.timeTravel.mode) {
          timetravel.enterTimeTravelMode(state.timeTravel.availableTimepoints.timestamps[0], 0);
        }
        timetravel.startPlayback();
      }
    }
  } else if (e.key === 'Escape') closeModal();
  else if (modalOverlay.classList.contains('visible')) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      navigateToPrevious();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      navigateToNext();
    }
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
document.getElementById('modal-nav-left')?.addEventListener('click', navigateToPrevious);
document.getElementById('modal-nav-right')?.addEventListener('click', navigateToNext);

// UI exit button
document.getElementById('ui-exit-button')?.addEventListener('click', toggleUI);

// Scroll wheel zoom
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    if (e.deltaY < 0) zoomIn();
    else zoomOut();
  },
  { passive: false }
);

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);
