// Time travel functionality for historical playback

import { PRELOAD_BUFFER } from './config';
import { useStore, getState } from './store';
import type { ClusterStatus } from './types/api';

// Declare flatpickr as global (loaded from CDN)
declare const flatpickr: (
  element: HTMLElement | string,
  options: Record<string, unknown>
) => { setDate: (date: Date, triggerChange?: boolean) => void; destroy: () => void };

// Callbacks that will be set by main.ts to avoid circular imports
let onDataLoaded: ((data: ClusterStatus) => void) | null = null;
let onLoadClusterData: (() => Promise<unknown>) | null = null;

export interface TimeTravelCallbacks {
  onDataLoaded: (data: ClusterStatus) => void;
  onLoadClusterData: () => Promise<unknown>;
}

export function setTimeTravelCallbacks(callbacks: TimeTravelCallbacks): void {
  onDataLoaded = callbacks.onDataLoaded;
  onLoadClusterData = callbacks.onLoadClusterData;
}

export function formatTimestamp(unixTimestamp: number): string {
  const date = new Date(unixTimestamp * 1000);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeTime(unixTimestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - unixTimestamp;

  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hrs ago`;
  return `${Math.floor(diff / 86400)} days ago`;
}

export function updateTimeTravelDisplay(): void {
  const displayEl = document.getElementById('time-travel-timestamp');
  if (!displayEl) return;

  const state = getState();

  if (!state.timeTravel.mode || !state.timeTravel.timestamp) {
    displayEl.textContent = 'LIVE';
    displayEl.classList.add('live');
  } else {
    const formatted = formatTimestamp(state.timeTravel.timestamp);
    const relative = formatRelativeTime(state.timeTravel.timestamp);
    displayEl.textContent = `${formatted} (${relative})`;
    displayEl.classList.remove('live');
  }
}

export async function initTimeTravel(): Promise<void> {
  const store = useStore.getState();

  try {
    // Default window start to 7 days ago if not set
    if (!store.timeTravel.windowStartDate) {
      store.setTimeTravel({
        windowStartDate: Math.floor(Date.now() / 1000) - 7 * 86400,
      });
    }

    const windowStartDate = useStore.getState().timeTravel.windowStartDate;

    // Fetch timepoints for the 7-day window
    const response = await fetch(`/api/timepoints?start=${windowStartDate}&days=7`);
    if (!response.ok) {
      console.error('Failed to fetch timepoints:', response.status);
      return;
    }
    const data = await response.json();
    store.setTimeTravel({
      availableTimepoints: data,
      availableRange: data.available_range,
    });

    console.log('Time travel initialized with', data.count, 'timepoints');
    const availableRange = useStore.getState().timeTravel.availableRange;
    if (availableRange) {
      console.log(
        'Available range:',
        new Date(availableRange.earliest * 1000),
        'to',
        new Date(availableRange.latest * 1000)
      );
    }

    // Initialize date picker
    initDatePicker();

    if (data.timestamps && data.timestamps.length > 0) {
      const slider = document.getElementById('time-travel-slider') as HTMLInputElement;
      if (slider) {
        slider.min = '0';
        slider.max = String(data.timestamps.length - 1);
        slider.value = slider.max;
      }
      store.setTimeTravel({ currentIndex: data.timestamps.length - 1 });

      updateTimeTravelDisplay();
    } else {
      console.log('No timepoints available for time travel in this window');
    }
  } catch (error) {
    console.error('Failed to initialize time travel:', error);
  }
}

export function initDatePicker(): void {
  const startDateInput = document.getElementById('time-travel-start-date');
  if (!startDateInput) return;

  const state = getState();
  const availableRange = state.timeTravel.availableRange;
  const minDate = availableRange ? new Date(availableRange.earliest * 1000) : null;
  const windowStartDate = state.timeTravel.windowStartDate;

  const picker = flatpickr(startDateInput, {
    dateFormat: 'M j',
    defaultDate: windowStartDate ? new Date(windowStartDate * 1000) : new Date(),
    minDate: minDate,
    maxDate: new Date(),
    disableMobile: true,
    onChange: function (selectedDates: Date[]) {
      if (selectedDates.length > 0) {
        const newStart = Math.floor(selectedDates[0].getTime() / 1000);
        changeWindowStart(newStart);
      }
    },
  });
  useStore.getState().setDatePicker(picker);

  updateDateDisplay();
}

export function updateDateDisplay(): void {
  const startInput = document.getElementById('time-travel-start-date') as HTMLInputElement;
  const endSpan = document.getElementById('time-travel-end-date');
  if (!startInput || !endSpan) return;

  const windowStartDate = getState().timeTravel.windowStartDate;

  if (windowStartDate) {
    const startDate = new Date(windowStartDate * 1000);
    const endDate = new Date((windowStartDate + 7 * 86400) * 1000);

    startInput.value = startDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    endSpan.textContent = endDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }
}

export async function changeWindowStart(
  newStartTimestamp: number,
  skipEnterTimeTravel = false,
  sliderPosition: 'start' | 'end' = 'start'
): Promise<void> {
  const store = useStore.getState();
  store.setTimeTravel({ windowStartDate: newStartTimestamp });

  // Stop playback if active
  stopPlayback();

  // Fetch new timepoints for the window
  const response = await fetch(`/api/timepoints?start=${newStartTimestamp}&days=7`);
  if (!response.ok) {
    console.error('Failed to fetch timepoints for new window');
    return;
  }

  const data = await response.json();
  store.setTimeTravel({ availableTimepoints: data });

  // Update slider
  const slider = document.getElementById('time-travel-slider') as HTMLInputElement;
  if (slider) {
    slider.min = '0';
    slider.max = String(Math.max(0, data.timestamps.length - 1));

    if (sliderPosition === 'end') {
      slider.value = slider.max;
      store.setTimeTravel({ currentIndex: data.timestamps.length - 1 });
    } else {
      slider.value = '0';
      store.setTimeTravel({ currentIndex: 0 });
    }
  }

  updateDateDisplay();

  // Clear preloaded cache since window changed
  store.setTimeTravel({ preloadedSnapshots: new Map() });

  // Load the first timestamp in new window (enter time travel mode)
  // Skip if returning to LIVE mode
  if (!skipEnterTimeTravel && data.timestamps.length > 0) {
    const firstInWindow = data.timestamps[0];
    enterTimeTravelMode(firstInWindow, 0);
  }

  store.saveToURL();
}

export async function loadClusterDataAt(timestamp: number): Promise<boolean> {
  const state = getState();

  // Check preloaded cache first
  if (state.timeTravel.preloadedSnapshots.has(timestamp)) {
    const data = state.timeTravel.preloadedSnapshots.get(timestamp)!;
    if (onDataLoaded) onDataLoaded(data);
    return true;
  }

  try {
    const response = await fetch(`/api/cluster-status/${timestamp}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data: ClusterStatus = await response.json();

    // Cache for potential replay
    const newCache = new Map(state.timeTravel.preloadedSnapshots);
    newCache.set(timestamp, data);

    // Limit cache size
    if (newCache.size > 20) {
      const oldestKey = newCache.keys().next().value;
      if (oldestKey !== undefined) {
        newCache.delete(oldestKey);
      }
    }

    useStore.getState().setTimeTravel({ preloadedSnapshots: newCache });

    if (onDataLoaded) onDataLoaded(data);
    return true;
  } catch (error) {
    console.error(`Failed to load data for ${timestamp}:`, error);
    return false;
  }
}

export async function preloadAdjacentSnapshots(centerIndex: number): Promise<void> {
  const state = getState();
  const timestamps = state.timeTravel.availableTimepoints?.timestamps;
  if (!timestamps) return;

  const preloadPromises: Promise<void>[] = [];

  for (let offset = -PRELOAD_BUFFER; offset <= PRELOAD_BUFFER; offset++) {
    if (offset === 0) continue;

    const idx = centerIndex + offset;
    if (idx < 0 || idx >= timestamps.length) continue;

    const ts = timestamps[idx];
    if (state.timeTravel.preloadedSnapshots.has(ts)) continue;

    preloadPromises.push(
      fetch(`/api/cluster-status/${ts}`)
        .then((r) => r.json())
        .then((data: ClusterStatus) => {
          const currentState = getState();
          const newCache = new Map(currentState.timeTravel.preloadedSnapshots);
          newCache.set(ts, data);
          useStore.getState().setTimeTravel({ preloadedSnapshots: newCache });
        })
        .catch(() => {
          /* ignore preload failures */
        })
    );
  }

  await Promise.all(preloadPromises);
}

export function startPlayback(): void {
  const state = getState();
  if (state.timeTravel.playing) return;

  const store = useStore.getState();
  store.setTimeTravel({
    playing: true,
    lastPlaybackTime: performance.now(),
  });

  const playBtn = document.getElementById('time-travel-play');
  if (playBtn) {
    playBtn.innerHTML = '\u275A\u275A';
    playBtn.classList.add('active');
  }

  store.saveToURL();
  playbackLoop();
}

export function stopPlayback(): void {
  const store = useStore.getState();
  const state = getState();

  store.setTimeTravel({ playing: false });

  if (state.timeTravel.playbackAnimationId) {
    cancelAnimationFrame(state.timeTravel.playbackAnimationId);
    store.setTimeTravel({ playbackAnimationId: null });
  }

  const playBtn = document.getElementById('time-travel-play');
  if (playBtn) {
    playBtn.innerHTML = '&#9654;';
    playBtn.classList.remove('active');
  }

  store.saveToURL();
}

function playbackLoop(): void {
  const state = getState();
  if (!state.timeTravel.playing) return;
  if (!state.timeTravel.availableTimepoints?.timestamps?.length) {
    stopPlayback();
    return;
  }

  const store = useStore.getState();
  const now = performance.now();
  const elapsed = now - state.timeTravel.lastPlaybackTime;

  // Real-time interval between snapshots (based on fetch interval = 120s)
  const realInterval = 120 * 1000;
  const adjustedInterval = realInterval / state.timeTravel.speed;

  if (elapsed >= adjustedInterval) {
    store.setTimeTravel({ lastPlaybackTime: now });

    const timestamps = state.timeTravel.availableTimepoints.timestamps;
    const currentIndex = state.timeTravel.currentIndex;

    if (currentIndex < timestamps.length - 1) {
      const newIndex = currentIndex + 1;
      const nextTimestamp = timestamps[newIndex];

      const slider = document.getElementById('time-travel-slider') as HTMLInputElement;
      if (slider) {
        slider.value = String(newIndex);
      }

      store.setTimeTravel({
        currentIndex: newIndex,
        timestamp: nextTimestamp,
      });
      loadClusterDataAt(nextTimestamp);
      updateTimeTravelDisplay();

      preloadAdjacentSnapshots(newIndex);
    } else {
      // Reached end - loop back to beginning
      const firstTimestamp = timestamps[0];
      const slider = document.getElementById('time-travel-slider') as HTMLInputElement;
      if (slider) {
        slider.value = '0';
      }
      store.setTimeTravel({
        currentIndex: 0,
        timestamp: firstTimestamp,
      });
      loadClusterDataAt(firstTimestamp);
      updateTimeTravelDisplay();
      preloadAdjacentSnapshots(0);
    }
  }

  const animId = requestAnimationFrame(playbackLoop);
  store.setTimeTravel({ playbackAnimationId: animId });
}

export async function returnToLive(): Promise<void> {
  stopPlayback();

  const store = useStore.getState();
  store.setTimeTravel({
    mode: false,
    timestamp: null,
  });

  // Reset window to last 7 days (ending now)
  const newStart = Math.floor(Date.now() / 1000) - 7 * 86400;
  store.setTimeTravel({ windowStartDate: newStart });

  // Update date picker
  const datePicker = getState().datePicker;
  if (datePicker) {
    datePicker.setDate(new Date(newStart * 1000), false);
  }

  // Refresh timepoints for new window (skip time travel, slider at end for LIVE)
  await changeWindowStart(newStart, true, 'end');

  const liveBtn = document.getElementById('time-travel-live');
  if (liveBtn) {
    liveBtn.classList.add('active');
  }
  updateTimeTravelDisplay();
  store.saveToURL();

  // Resume with fresh data
  if (onLoadClusterData) {
    await onLoadClusterData();
  }
}

export function enterTimeTravelMode(timestamp: number, index: number): void {
  const store = useStore.getState();
  store.setTimeTravel({
    mode: true,
    timestamp: timestamp,
    currentIndex: index,
  });

  const liveBtn = document.getElementById('time-travel-live');
  if (liveBtn) {
    liveBtn.classList.remove('active');
  }
  updateTimeTravelDisplay();

  loadClusterDataAt(timestamp);
  preloadAdjacentSnapshots(index);

  store.saveToURL();
}

export function toggleTimeTravel(): void {
  const store = useStore.getState();
  const state = getState();
  const newExpanded = !state.timeTravel.expanded;

  store.setTimeTravel({ expanded: newExpanded });

  const panel = document.getElementById('time-travel');
  if (panel) {
    if (newExpanded) {
      panel.classList.add('expanded');
    } else {
      panel.classList.remove('expanded');
    }
  }
  store.saveToURL();
}
