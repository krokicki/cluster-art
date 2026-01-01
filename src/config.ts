// Configuration constants

export const PIXEL_SIZE = 8 as const;

// Zoom and canvas limits
export const MIN_ZOOM = 0.1 as const;
export const MAX_ZOOM = 3.0 as const;
export const ZOOM_STEP = 0.1 as const;
export const MIN_CANVAS_SIZE = 200 as const;

// Time travel
export const PRELOAD_BUFFER = 3 as const;
export const SNAPSHOT_CACHE_SIZE = 200 as const;

// Color mode descriptions
export const MODE_DESCRIPTIONS = [
  'By User',
  'By Hostname',
  'By Row',
  'By Hardware',
  'By GPU Type',
  'By Utilization',
  'By Slot Status',
  'By Host Status',
  'By Free Memory',
] as const;

// Pre-generated palette of visually distinct colors for users
export const DISTINCT_USER_COLORS: readonly string[] = [
  '#e6194b', // red
  '#3cb44b', // green
  '#ffe119', // yellow
  '#4363d8', // blue
  '#f58231', // orange
  '#911eb4', // purple
  '#42d4f4', // cyan
  '#f032e6', // magenta
  '#bfef45', // lime
  '#fabed4', // pink
  '#469990', // teal
  '#dcbeff', // lavender
  '#9a6324', // brown
  '#fffac8', // beige
  '#800000', // maroon
  '#aaffc3', // mint
  '#808000', // olive
  '#ffd8b1', // apricot
  '#000075', // navy
  '#a9a9a9', // grey
  '#e6beff', // light purple
  '#aa6e28', // chocolate
  '#00ff00', // lime green
  '#ff00ff', // fuchsia
  '#00ffff', // aqua
  '#ff6347', // tomato
  '#7b68ee', // medium slate blue
  '#ffa500', // orange2
  '#20b2aa', // light sea green
  '#ff1493', // deep pink
] as const;

// Static colors for known host statuses
export const STATIC_STATUS_COLORS: Record<string, string> = {
  'ok': '#44ff44',
  'closed_Full': '#e6194b',
  'closed_Adm': '#f58231',
  'closed_Excl': '#911eb4',
};

// Palette for dynamic status colors
export const DISTINCT_STATUS_COLORS: readonly string[] = [
  '#4363d8', // blue
  '#42d4f4', // cyan
  '#f032e6', // magenta
  '#ffe119', // yellow
  '#bfef45', // lime
  '#fabed4', // pink
  '#469990', // teal
  '#dcbeff', // lavender
  '#9a6324', // brown
  '#800000', // maroon
  '#aaffc3', // mint
  '#808000', // olive
  '#000075', // navy
] as const;
