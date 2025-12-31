// Application state - all mutable state lives here

// Canvas container state
export let canvasX = 0;
export let canvasY = 0;
export let canvasWidth = 1200;    // Default size
export let canvasHeight = 800;

// Zoom and pan
export let zoomLevel = 1.0;
export let panOffsetX = 0;
export let panOffsetY = 0;

// Interaction state
export let isDragging = false;
export let isResizing = false;
export let dragStartX = 0;
export let dragStartY = 0;
export let dragStartCanvasX = 0;
export let dragStartCanvasY = 0;
export let dragStartCanvasWidth = 0;
export let dragStartCanvasHeight = 0;
export let resizeHandle = null;
export let clickStartX = 0;
export let clickStartY = 0;
export let lastTouchDistance = 0;

// Time travel state
export let timeTravelMode = false;
export let timeTravelTimestamp = null;
export let timeTravelPlaying = false;
export let timeTravelPlayOnLoad = false;
export let timeTravelSpeed = 1000;
export let timeTravelExpanded = false;
export let availableTimepoints = null;
export let currentTimepointIndex = 0;
export let preloadedSnapshots = new Map();
export let playbackAnimationId = null;
export let lastPlaybackTime = 0;

// Date picker state
export let windowStartDate = null;  // Unix timestamp for window start
export let datePicker = null;       // Flatpickr instance
export let availableRange = null;   // {earliest, latest} from backend

// Grid dimensions
export let gridWidth = 0;
export let gridHeight = 0;

// Resources and data
export let resources = [];
export let rawData = null;
export let userColorMap = new Map();

// Mode state
export let currentColorMode = 1;
export let colorStrategies = [];
export let currentLayoutMode = 1;
export let layoutStrategies = [];

// Panel state
export let legendExpanded = false;
export let helpExpanded = false;

// Hover state for tooltip refresh
export let lastHoverX = null;
export let lastHoverY = null;

// State setters (ES modules can't reassign imports directly)
export function setCanvasX(v) { canvasX = v; }
export function setCanvasY(v) { canvasY = v; }
export function setCanvasWidth(v) { canvasWidth = v; }
export function setCanvasHeight(v) { canvasHeight = v; }
export function setZoomLevel(v) { zoomLevel = v; }
export function setPanOffsetX(v) { panOffsetX = v; }
export function setPanOffsetY(v) { panOffsetY = v; }
export function setIsDragging(v) { isDragging = v; }
export function setIsResizing(v) { isResizing = v; }
export function setDragStartX(v) { dragStartX = v; }
export function setDragStartY(v) { dragStartY = v; }
export function setDragStartCanvasX(v) { dragStartCanvasX = v; }
export function setDragStartCanvasY(v) { dragStartCanvasY = v; }
export function setDragStartCanvasWidth(v) { dragStartCanvasWidth = v; }
export function setDragStartCanvasHeight(v) { dragStartCanvasHeight = v; }
export function setResizeHandle(v) { resizeHandle = v; }
export function setClickStartX(v) { clickStartX = v; }
export function setClickStartY(v) { clickStartY = v; }
export function setLastTouchDistance(v) { lastTouchDistance = v; }
export function setTimeTravelMode(v) { timeTravelMode = v; }
export function setTimeTravelTimestamp(v) { timeTravelTimestamp = v; }
export function setTimeTravelPlaying(v) { timeTravelPlaying = v; }
export function setTimeTravelPlayOnLoad(v) { timeTravelPlayOnLoad = v; }
export function setTimeTravelSpeed(v) { timeTravelSpeed = v; }
export function setTimeTravelExpanded(v) { timeTravelExpanded = v; }
export function setAvailableTimepoints(v) { availableTimepoints = v; }
export function setCurrentTimepointIndex(v) { currentTimepointIndex = v; }
export function setPreloadedSnapshots(v) { preloadedSnapshots = v; }
export function setPlaybackAnimationId(v) { playbackAnimationId = v; }
export function setLastPlaybackTime(v) { lastPlaybackTime = v; }
export function setWindowStartDate(v) { windowStartDate = v; }
export function setDatePicker(v) { datePicker = v; }
export function setAvailableRange(v) { availableRange = v; }
export function setGridWidth(v) { gridWidth = v; }
export function setGridHeight(v) { gridHeight = v; }
export function setResources(v) { resources = v; }
export function setRawData(v) { rawData = v; }
export function setCurrentColorMode(v) { currentColorMode = v; }
export function setColorStrategies(v) { colorStrategies = v; }
export function setCurrentLayoutMode(v) { currentLayoutMode = v; }
export function setLayoutStrategies(v) { layoutStrategies = v; }
export function setLegendExpanded(v) { legendExpanded = v; }
export function setHelpExpanded(v) { helpExpanded = v; }
export function setLastHoverX(v) { lastHoverX = v; }
export function setLastHoverY(v) { lastHoverY = v; }
export function setUserColorMap(v) { userColorMap = v; }

// URL State Management
export function saveStateToURL() {
    const state = {
        x: Math.round(canvasX),
        y: Math.round(canvasY),
        w: Math.round(canvasWidth),
        ht: Math.round(canvasHeight),
        z: zoomLevel.toFixed(2),
        m: currentColorMode,
        ly: currentLayoutMode,
        l: legendExpanded ? 1 : 0,
        h: helpExpanded ? 1 : 0,
        te: timeTravelExpanded ? 1 : 0,
        ts: timeTravelSpeed
    };

    // Only add time travel state if not in LIVE mode
    if (timeTravelMode && timeTravelTimestamp) {
        state.tt = timeTravelTimestamp;
    }

    // Add playing state
    if (timeTravelPlaying) {
        state.tp = 1;
    }

    // Add window start date if set
    if (windowStartDate) {
        state.ws = windowStartDate;
    }

    const hash = Object.entries(state)
        .map(([key, value]) => `${key}=${value}`)
        .join('&');

    // Update URL without triggering page reload
    history.replaceState(null, '', `#${hash}`);
}

export function loadStateFromURL() {
    const hash = window.location.hash.substring(1); // Remove '#'
    if (!hash) return false;

    const params = new URLSearchParams(hash);

    if (params.has('x')) canvasX = parseFloat(params.get('x'));
    if (params.has('y')) canvasY = parseFloat(params.get('y'));
    if (params.has('w')) canvasWidth = parseFloat(params.get('w'));
    if (params.has('ht')) canvasHeight = parseFloat(params.get('ht'));
    if (params.has('z')) zoomLevel = parseFloat(params.get('z'));
    if (params.has('m')) currentColorMode = parseInt(params.get('m'));
    if (params.has('ly')) currentLayoutMode = parseInt(params.get('ly'));
    if (params.has('l')) legendExpanded = params.get('l') === '1';
    if (params.has('h')) helpExpanded = params.get('h') === '1';
    if (params.has('te')) timeTravelExpanded = params.get('te') === '1';
    if (params.has('tt')) {
        timeTravelTimestamp = parseInt(params.get('tt'));
        timeTravelMode = true;
    }
    if (params.has('ts')) timeTravelSpeed = parseInt(params.get('ts'));
    if (params.has('tp')) timeTravelPlayOnLoad = params.get('tp') === '1';
    if (params.has('ws')) windowStartDate = parseInt(params.get('ws'));

    return true;
}
