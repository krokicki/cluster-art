// Zustand store for application state (vanilla, no React)
import { createStore } from 'zustand/vanilla';
import type { ClusterStatus, TimePointsResponse } from './types/api';
import type { IResource, ResizeHandle, ColorStrategy, LayoutStrategy } from './types';

// Flatpickr instance type (external library)
interface FlatpickrInstance {
  setDate(date: Date | string | number, triggerChange?: boolean): void;
  destroy(): void;
}

interface CanvasState {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface InteractionState {
  isDragging: boolean;
  isResizing: boolean;
  dragStartX: number;
  dragStartY: number;
  dragStartCanvas: CanvasState;
  resizeHandle: ResizeHandle | null;
  clickStartX: number;
  clickStartY: number;
  lastTouchDistance: number;
}

interface TimeTravelState {
  mode: boolean;
  timestamp: number | null;
  playing: boolean;
  playOnLoad: boolean;
  speed: number;
  expanded: boolean;
  currentIndex: number;
  availableTimepoints: TimePointsResponse | null;
  preloadedSnapshots: Map<number, ClusterStatus>;
  playbackAnimationId: number | null;
  lastPlaybackTime: number;
  windowStartDate: number | null;
  availableRange: { earliest: number; latest: number } | null;
}

interface AppState {
  // Canvas positioning
  canvas: CanvasState;
  zoom: number;
  pan: { x: number; y: number };

  // Interaction
  interaction: InteractionState;

  // Time travel
  timeTravel: TimeTravelState;
  datePicker: FlatpickrInstance | null;

  // Grid dimensions
  grid: { width: number; height: number };

  // Data
  resources: IResource[];
  rawData: ClusterStatus | null;
  userColorMap: Map<string, string>;

  // Visualization modes
  colorMode: number;
  layoutMode: number;
  colorStrategies: ColorStrategy[];
  layoutStrategies: LayoutStrategy[];

  // UI panels
  legendExpanded: boolean;
  helpExpanded: boolean;
  uiHidden: boolean;

  // Hover state
  lastHover: { x: number | null; y: number | null };

  // Modal state (-1 means closed)
  modalIndex: number;

  // Actions
  setCanvas: (canvas: Partial<CanvasState>) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: Partial<{ x: number; y: number }>) => void;
  setInteraction: (interaction: Partial<InteractionState>) => void;
  setTimeTravel: (timeTravel: Partial<TimeTravelState>) => void;
  setDatePicker: (picker: FlatpickrInstance | null) => void;
  setGrid: (grid: Partial<{ width: number; height: number }>) => void;
  setResources: (resources: IResource[]) => void;
  setRawData: (data: ClusterStatus | null) => void;
  setUserColorMap: (map: Map<string, string>) => void;
  setColorMode: (mode: number) => void;
  setLayoutMode: (mode: number) => void;
  setColorStrategies: (strategies: ColorStrategy[]) => void;
  setLayoutStrategies: (strategies: LayoutStrategy[]) => void;
  setLegendExpanded: (expanded: boolean) => void;
  setHelpExpanded: (expanded: boolean) => void;
  setUiHidden: (hidden: boolean) => void;
  setLastHover: (hover: { x: number | null; y: number | null }) => void;
  setModalIndex: (index: number) => void;
  saveToURL: () => void;
  loadFromURL: () => boolean;
}

export const useStore = createStore<AppState>((set, get) => ({
  // Initial state
  canvas: { x: 0, y: 0, width: 1200, height: 800 },
  zoom: 1.0,
  pan: { x: 0, y: 0 },

  interaction: {
    isDragging: false,
    isResizing: false,
    dragStartX: 0,
    dragStartY: 0,
    dragStartCanvas: { x: 0, y: 0, width: 0, height: 0 },
    resizeHandle: null,
    clickStartX: 0,
    clickStartY: 0,
    lastTouchDistance: 0,
  },

  timeTravel: {
    mode: false,
    timestamp: null,
    playing: false,
    playOnLoad: false,
    speed: 1000,
    expanded: false,
    currentIndex: 0,
    availableTimepoints: null,
    preloadedSnapshots: new Map(),
    playbackAnimationId: null,
    lastPlaybackTime: 0,
    windowStartDate: null,
    availableRange: null,
  },
  datePicker: null,

  grid: { width: 0, height: 0 },

  resources: [],
  rawData: null,
  userColorMap: new Map(),

  colorMode: 1,
  layoutMode: 1,
  colorStrategies: [],
  layoutStrategies: [],

  legendExpanded: false,
  helpExpanded: false,
  uiHidden: false,

  lastHover: { x: null, y: null },

  modalIndex: -1,

  // Actions
  setCanvas: (canvas) => set((state) => ({
    canvas: { ...state.canvas, ...canvas }
  })),

  setZoom: (zoom) => set({ zoom }),

  setPan: (pan) => set((state) => ({
    pan: { ...state.pan, ...pan }
  })),

  setInteraction: (interaction) => set((state) => ({
    interaction: { ...state.interaction, ...interaction }
  })),

  setTimeTravel: (timeTravel) => set((state) => ({
    timeTravel: { ...state.timeTravel, ...timeTravel }
  })),

  setDatePicker: (datePicker) => set({ datePicker }),

  setGrid: (grid) => set((state) => ({
    grid: { ...state.grid, ...grid }
  })),

  setResources: (resources) => set({ resources }),

  setRawData: (rawData) => set({ rawData }),

  setUserColorMap: (userColorMap) => set({ userColorMap }),

  setColorMode: (colorMode) => set({ colorMode }),

  setLayoutMode: (layoutMode) => set({ layoutMode }),

  setColorStrategies: (colorStrategies) => set({ colorStrategies }),

  setLayoutStrategies: (layoutStrategies) => set({ layoutStrategies }),

  setLegendExpanded: (legendExpanded) => set({ legendExpanded }),

  setHelpExpanded: (helpExpanded) => set({ helpExpanded }),

  setUiHidden: (uiHidden) => set({ uiHidden }),

  setLastHover: (lastHover) => set({ lastHover }),

  setModalIndex: (modalIndex) => set({ modalIndex }),

  saveToURL: () => {
    const state = get();
    const urlState: Record<string, string | number> = {
      x: Math.round(state.canvas.x),
      y: Math.round(state.canvas.y),
      w: Math.round(state.canvas.width),
      ht: Math.round(state.canvas.height),
      z: parseFloat(state.zoom.toFixed(2)),
      m: state.colorMode,
      ly: state.layoutMode,
      l: state.legendExpanded ? 1 : 0,
      h: state.helpExpanded ? 1 : 0,
      te: state.timeTravel.expanded ? 1 : 0,
      ts: state.timeTravel.speed,
    };

    if (state.timeTravel.mode && state.timeTravel.timestamp) {
      urlState.tt = state.timeTravel.timestamp;
    }

    if (state.timeTravel.playing) {
      urlState.tp = 1;
    }

    if (state.timeTravel.windowStartDate) {
      urlState.ws = state.timeTravel.windowStartDate;
    }

    if (state.modalIndex >= 0) {
      urlState.mi = state.modalIndex;
    }

    const hash = Object.entries(urlState)
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    history.replaceState(null, '', `#${hash}`);
  },

  loadFromURL: () => {
    const hash = window.location.hash.substring(1);
    if (!hash) return false;

    const params = new URLSearchParams(hash);

    set((state) => {
      const newState: Partial<AppState> = {};

      // Canvas
      if (params.has('x') || params.has('y') || params.has('w') || params.has('ht')) {
        newState.canvas = {
          x: params.has('x') ? parseFloat(params.get('x')!) : state.canvas.x,
          y: params.has('y') ? parseFloat(params.get('y')!) : state.canvas.y,
          width: params.has('w') ? parseFloat(params.get('w')!) : state.canvas.width,
          height: params.has('ht') ? parseFloat(params.get('ht')!) : state.canvas.height,
        };
      }

      if (params.has('z')) {
        newState.zoom = parseFloat(params.get('z')!);
      }

      if (params.has('m')) {
        newState.colorMode = parseInt(params.get('m')!);
      }

      if (params.has('ly')) {
        newState.layoutMode = parseInt(params.get('ly')!);
      }

      if (params.has('l')) {
        newState.legendExpanded = params.get('l') === '1';
      }

      if (params.has('h')) {
        newState.helpExpanded = params.get('h') === '1';
      }

      // Time travel
      const newTimeTravel: Partial<TimeTravelState> = {};

      if (params.has('te')) {
        newTimeTravel.expanded = params.get('te') === '1';
      }

      if (params.has('tt')) {
        newTimeTravel.timestamp = parseInt(params.get('tt')!);
        newTimeTravel.mode = true;
      }

      if (params.has('ts')) {
        newTimeTravel.speed = parseInt(params.get('ts')!);
      }

      if (params.has('tp')) {
        newTimeTravel.playOnLoad = params.get('tp') === '1';
      }

      if (params.has('ws')) {
        newTimeTravel.windowStartDate = parseInt(params.get('ws')!);
      }

      if (Object.keys(newTimeTravel).length > 0) {
        newState.timeTravel = { ...state.timeTravel, ...newTimeTravel };
      }

      if (params.has('mi')) {
        newState.modalIndex = parseInt(params.get('mi')!);
      }

      return newState;
    });

    return true;
  },
}));

// Convenience hook for accessing store outside of React
export const getState = useStore.getState;
export const setState = useStore.setState;
