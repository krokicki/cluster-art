// Time travel functionality for historical playback
import { PRELOAD_BUFFER } from './config.js';
import * as state from './state.js';

// Callbacks that will be set by main.js to avoid circular imports
let onDataLoaded = null;
let onLoadClusterData = null;

export function setTimeTravelCallbacks(callbacks) {
    onDataLoaded = callbacks.onDataLoaded;
    onLoadClusterData = callbacks.onLoadClusterData;
}

export function formatTimestamp(unixTimestamp) {
    const date = new Date(unixTimestamp * 1000);
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

export function formatRelativeTime(unixTimestamp) {
    const now = Date.now() / 1000;
    const diff = now - unixTimestamp;

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hrs ago`;
    return `${Math.floor(diff / 86400)} days ago`;
}

export function updateTimeTravelDisplay() {
    const displayEl = document.getElementById('time-travel-timestamp');

    if (!state.timeTravelMode || !state.timeTravelTimestamp) {
        displayEl.textContent = 'LIVE';
        displayEl.classList.add('live');
    } else {
        const formatted = formatTimestamp(state.timeTravelTimestamp);
        const relative = formatRelativeTime(state.timeTravelTimestamp);
        displayEl.textContent = `${formatted} (${relative})`;
        displayEl.classList.remove('live');
    }
}

export async function initTimeTravel() {
    try {
        // Default window start to 7 days ago if not set
        if (!state.windowStartDate) {
            state.setWindowStartDate(Math.floor(Date.now() / 1000) - (7 * 86400));
        }

        // Fetch timepoints for the 7-day window
        const response = await fetch(`/api/timepoints?start=${state.windowStartDate}&days=7`);
        if (!response.ok) {
            console.error('Failed to fetch timepoints:', response.status);
            return;
        }
        const data = await response.json();
        state.setAvailableTimepoints(data);
        state.setAvailableRange(data.available_range);

        console.log('Time travel initialized with', data.count, 'timepoints');
        if (state.availableRange) {
            console.log('Available range:', new Date(state.availableRange.earliest * 1000),
                        'to', new Date(state.availableRange.latest * 1000));
        }

        // Initialize date picker
        initDatePicker();

        if (data.timestamps && data.timestamps.length > 0) {
            const slider = document.getElementById('time-travel-slider');
            slider.min = 0;
            slider.max = data.timestamps.length - 1;
            slider.value = slider.max;
            state.setCurrentTimepointIndex(data.timestamps.length - 1);

            updateTimeTravelDisplay();
        } else {
            console.log('No timepoints available for time travel in this window');
        }
    } catch (error) {
        console.error('Failed to initialize time travel:', error);
    }
}

export function initDatePicker() {
    const startDateInput = document.getElementById('time-travel-start-date');
    const minDate = state.availableRange ? new Date(state.availableRange.earliest * 1000) : null;

    const picker = flatpickr(startDateInput, {
        dateFormat: 'M j',
        defaultDate: new Date(state.windowStartDate * 1000),
        minDate: minDate,
        maxDate: new Date(),
        disableMobile: true,
        onChange: function(selectedDates) {
            if (selectedDates.length > 0) {
                const newStart = Math.floor(selectedDates[0].getTime() / 1000);
                changeWindowStart(newStart);
            }
        }
    });
    state.setDatePicker(picker);

    updateDateDisplay();
}

export function updateDateDisplay() {
    const startInput = document.getElementById('time-travel-start-date');
    const endSpan = document.getElementById('time-travel-end-date');

    if (state.windowStartDate) {
        const startDate = new Date(state.windowStartDate * 1000);
        const endDate = new Date((state.windowStartDate + 7 * 86400) * 1000);

        startInput.value = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        endSpan.textContent = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
}

export async function changeWindowStart(newStartTimestamp, skipEnterTimeTravel = false, sliderPosition = 'start') {
    state.setWindowStartDate(newStartTimestamp);

    // Stop playback if active
    stopPlayback();

    // Fetch new timepoints for the window
    const response = await fetch(`/api/timepoints?start=${state.windowStartDate}&days=7`);
    if (!response.ok) {
        console.error('Failed to fetch timepoints for new window');
        return;
    }

    const data = await response.json();
    state.setAvailableTimepoints(data);

    // Update slider
    const slider = document.getElementById('time-travel-slider');
    slider.min = 0;
    slider.max = Math.max(0, data.timestamps.length - 1);

    if (sliderPosition === 'end') {
        slider.value = slider.max;
        state.setCurrentTimepointIndex(data.timestamps.length - 1);
    } else {
        slider.value = 0;
        state.setCurrentTimepointIndex(0);
    }

    updateDateDisplay();

    // Clear preloaded cache since window changed
    state.preloadedSnapshots.clear();

    // Load the first timestamp in new window (enter time travel mode)
    // Skip if returning to LIVE mode
    if (!skipEnterTimeTravel && data.timestamps.length > 0) {
        const firstInWindow = data.timestamps[0];
        enterTimeTravelMode(firstInWindow, 0);
    }

    state.saveStateToURL();
}

export async function loadClusterDataAt(timestamp) {
    // Check preloaded cache first
    if (state.preloadedSnapshots.has(timestamp)) {
        const data = state.preloadedSnapshots.get(timestamp);
        if (onDataLoaded) onDataLoaded(data);
        return true;
    }

    try {
        const response = await fetch(`/api/cluster-status/${timestamp}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();

        // Cache for potential replay
        state.preloadedSnapshots.set(timestamp, data);

        // Limit cache size
        if (state.preloadedSnapshots.size > 20) {
            const oldestKey = state.preloadedSnapshots.keys().next().value;
            state.preloadedSnapshots.delete(oldestKey);
        }

        if (onDataLoaded) onDataLoaded(data);
        return true;
    } catch (error) {
        console.error(`Failed to load data for ${timestamp}:`, error);
        return false;
    }
}

export async function preloadAdjacentSnapshots(centerIndex) {
    if (!state.availableTimepoints?.timestamps) return;

    const timestamps = state.availableTimepoints.timestamps;
    const preloadPromises = [];

    for (let offset = -PRELOAD_BUFFER; offset <= PRELOAD_BUFFER; offset++) {
        if (offset === 0) continue;

        const idx = centerIndex + offset;
        if (idx < 0 || idx >= timestamps.length) continue;

        const ts = timestamps[idx];
        if (state.preloadedSnapshots.has(ts)) continue;

        preloadPromises.push(
            fetch(`/api/cluster-status/${ts}`)
                .then(r => r.json())
                .then(data => state.preloadedSnapshots.set(ts, data))
                .catch(() => {})
        );
    }

    await Promise.all(preloadPromises);
}

export function startPlayback() {
    if (state.timeTravelPlaying) return;

    state.setTimeTravelPlaying(true);
    state.setLastPlaybackTime(performance.now());

    document.getElementById('time-travel-play').innerHTML = '\u275A\u275A';
    document.getElementById('time-travel-play').classList.add('active');

    state.saveStateToURL();
    playbackLoop();
}

export function stopPlayback() {
    state.setTimeTravelPlaying(false);

    if (state.playbackAnimationId) {
        cancelAnimationFrame(state.playbackAnimationId);
        state.setPlaybackAnimationId(null);
    }

    document.getElementById('time-travel-play').innerHTML = '&#9654;';
    document.getElementById('time-travel-play').classList.remove('active');

    state.saveStateToURL();
}

function playbackLoop() {
    if (!state.timeTravelPlaying) return;
    if (!state.availableTimepoints?.timestamps?.length) {
        stopPlayback();
        return;
    }

    const now = performance.now();
    const elapsed = now - state.lastPlaybackTime;

    // Real-time interval between snapshots (based on fetch interval = 120s)
    const realInterval = 120 * 1000;
    const adjustedInterval = realInterval / state.timeTravelSpeed;

    if (elapsed >= adjustedInterval) {
        state.setLastPlaybackTime(now);

        if (state.currentTimepointIndex < state.availableTimepoints.timestamps.length - 1) {
            state.setCurrentTimepointIndex(state.currentTimepointIndex + 1);
            const nextTimestamp = state.availableTimepoints.timestamps[state.currentTimepointIndex];

            document.getElementById('time-travel-slider').value = state.currentTimepointIndex;

            state.setTimeTravelTimestamp(nextTimestamp);
            loadClusterDataAt(nextTimestamp);
            updateTimeTravelDisplay();

            preloadAdjacentSnapshots(state.currentTimepointIndex);
        } else {
            // Reached end - loop back to beginning
            state.setCurrentTimepointIndex(0);
            const firstTimestamp = state.availableTimepoints.timestamps[0];
            document.getElementById('time-travel-slider').value = 0;
            state.setTimeTravelTimestamp(firstTimestamp);
            loadClusterDataAt(firstTimestamp);
            updateTimeTravelDisplay();
            preloadAdjacentSnapshots(0);
        }
    }

    state.setPlaybackAnimationId(requestAnimationFrame(playbackLoop));
}

export async function returnToLive() {
    stopPlayback();

    state.setTimeTravelMode(false);
    state.setTimeTravelTimestamp(null);

    // Reset window to last 7 days (ending now)
    const newStart = Math.floor(Date.now() / 1000) - (7 * 86400);
    state.setWindowStartDate(newStart);

    // Update date picker
    if (state.datePicker) {
        state.datePicker.setDate(new Date(state.windowStartDate * 1000), false);
    }

    // Refresh timepoints for new window (skip time travel, slider at end for LIVE)
    await changeWindowStart(newStart, true, 'end');

    document.getElementById('time-travel-live').classList.add('active');
    updateTimeTravelDisplay();
    state.saveStateToURL();

    // Resume with fresh data
    if (onLoadClusterData) {
        await onLoadClusterData();
    }
}

export function enterTimeTravelMode(timestamp, index) {
    state.setTimeTravelMode(true);
    state.setTimeTravelTimestamp(timestamp);
    state.setCurrentTimepointIndex(index);

    document.getElementById('time-travel-live').classList.remove('active');
    updateTimeTravelDisplay();

    loadClusterDataAt(timestamp);
    preloadAdjacentSnapshots(index);

    state.saveStateToURL();
}

export function toggleTimeTravel() {
    state.setTimeTravelExpanded(!state.timeTravelExpanded);
    const panel = document.getElementById('time-travel');
    if (state.timeTravelExpanded) {
        panel.classList.add('expanded');
    } else {
        panel.classList.remove('expanded');
    }
    state.saveStateToURL();
}
