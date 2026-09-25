// Making a browser page behave like an app: real fullscreen, an orientation
// lock, and a screen that doesn't dim mid-fight.
//
// All three APIs are gesture-gated and partially supported, so every call is
// wrapped — a browser that refuses any of them still plays the game fine, just
// windowed.

export const screenState = {
  fullscreen: false,
  wakeLock: null,
  orientationLocked: false,
  supported: false,
};

function el() { return document.documentElement; }

/**
 * Plenty of Android browsers report `pointer: coarse` as false - a phone with a
 * mouse attached, a desktop-mode tab, some webviews - and gating the fullscreen
 * and the orientation lock on that one query alone meant neither ever ran.
 */
export function touchLike() {
  return window.matchMedia('(pointer: coarse)').matches
    || (navigator.maxTouchPoints || 0) > 0
    || 'ontouchstart' in window;
}

export function fullscreenSupported() {
  const d = document;
  return !!(el().requestFullscreen || el().webkitRequestFullscreen ||
            d.fullscreenEnabled || d.webkitFullscreenEnabled);
}

export function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

export async function enterFullscreen() {
  if (isFullscreen()) return true;
  const e = el();
  const req = e.requestFullscreen || e.webkitRequestFullscreen || e.mozRequestFullScreen;
  if (!req) return false;
  try {
    // navigationUI:'hide' is a hint; Safari ignores the options bag entirely.
    await req.call(e, { navigationUI: 'hide' });
    await lockOrientation();
    await requestWakeLock();
    return true;
  } catch {
    return false;
  }
}

export async function exitFullscreen() {
  if (!isFullscreen()) return;
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  try {
    if (exit) await exit.call(document);
  } catch {
    // Already out, or the browser refused. Nothing to do either way.
  }
  releaseWakeLock();
}

export async function toggleFullscreen() {
  if (isFullscreen()) { await exitFullscreen(); return false; }
  return enterFullscreen();
}

/**
 * Gameplay is landscape-only. On Android this turns the screen for the player
 * the moment fullscreen is granted; the lock is only honoured in fullscreen.
 */
async function lockOrientation() {
  const so = screen.orientation;
  if (!so || !so.lock) return;
  if (!touchLike()) return;
  try {
    await so.lock('landscape');
    screenState.orientationLocked = true;
  } catch {
    // Desktop Chrome and every iOS browser reject this. The rotate prompt in
    // game.js covers those.
  }
}

function unlockOrientation() {
  try {
    if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
  } catch { /* not supported */ }
  screenState.orientationLocked = false;
}

/** Keep the screen awake — a phone dimming mid-boss is a lost run. */
export async function requestWakeLock() {
  if (!('wakeLock' in navigator) || screenState.wakeLock) return;
  try {
    screenState.wakeLock = await navigator.wakeLock.request('screen');
    screenState.wakeLock.addEventListener('release', () => { screenState.wakeLock = null; });
  } catch {
    // Denied (often when the tab is backgrounded); harmless.
  }
}

export function releaseWakeLock() {
  if (!screenState.wakeLock) return;
  try { screenState.wakeLock.release(); } catch { /* already gone */ }
  screenState.wakeLock = null;
}

export function initFullscreen({ onChange } = {}) {
  screenState.supported = fullscreenSupported();

  const sync = () => {
    screenState.fullscreen = isFullscreen();
    if (!screenState.fullscreen) unlockOrientation();
    if (onChange) onChange(screenState.fullscreen);
  };
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);

  // A wake lock is dropped whenever the tab is hidden; take it back on return.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && screenState.fullscreen) requestWakeLock();
  });

  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'f' || ev.key === 'F') {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      toggleFullscreen();
    }
  });
}

// --- PWA -------------------------------------------------------------------

/**
 * Register the service worker so the game is installable and works offline.
 * Only meaningful over http(s); the bundled single-file build runs from
 * file:// where service workers are unavailable.
 */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // No service worker means no offline play. Everything else is fine.
    });
  });
}

/** True when launched from a home-screen icon rather than a browser tab. */
export function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true;
}
