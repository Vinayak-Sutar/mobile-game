// Phone vibration for the moments that should be felt: a perfect parry, a
// posture break, getting hurt, a boss going down. Android Chrome supports
// navigator.vibrate; iOS and desktop quietly ignore it.

export const haptics = { enabled: true };

let lastAt = 0;

/** pattern: milliseconds, or an array of on/off milliseconds. */
export function haptic(pattern) {
  if (!haptics.enabled) return;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  // Rate-limit so a flurry of hits doesn't turn into one long buzz.
  const now = performance.now();
  if (now - lastAt < 45) return;
  lastAt = now;
  try { navigator.vibrate(pattern); } catch { /* not allowed right now */ }
}

export function setHaptics(on) { haptics.enabled = !!on; }
