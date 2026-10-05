// THE PORTAL: CrazyGames, kept at arm's length.
//
// The platform needs to know when the player is actually playing, because
// that is what it measures the game on. Three numbers decide whether a game
// gets promoted out of Basic Launch:
//
//   conversion    80%+ of players still there after one minute
//   play time     10+ minutes in a session
//   D1 retention  10-15% come back the next day
//
// The SDK reports the first two, and it can only do that if gameplayStart and
// gameplayStop are called honestly - start when a level begins, stop the
// moment the player is in a menu, dead, or paused. Reporting menu time as
// gameplay would flatter the numbers into a game that never gets promoted,
// because the platform would compare our inflated play time against other
// games' real one and wonder why nobody comes back.
//
// EVERYTHING HERE IS OPTIONAL AT RUNTIME. The game has to run identically
// from a local server, from GitHub Pages, and inside the portal's iframe, so
// every call is feature-detected and wrapped. If the SDK is missing, blocked
// by an ad blocker, or throws, the game does not notice.

/** Resolved once: the SDK object, or null everywhere that is not the portal. */
function sdk() {
  try {
    const s = window.CrazyGames && window.CrazyGames.SDK;
    return s && s.game ? s : null;
  } catch { return null; }
}

let started = false;
let ready = false;

/**
 * Called once at boot. Safe to call when the script never loaded.
 *
 * The SDK's own init is async and may reject off-platform; we neither wait
 * for it nor care if it fails, because nothing downstream depends on it.
 */
export function initPortal() {
  const s = sdk();
  if (!s) return;
  try {
    const p = s.init && s.init();
    if (p && p.then) p.then(() => { ready = true; }).catch(() => {});
    else ready = true;
  } catch { /* off-platform, or blocked: play on */ }
}

/** A level has begun, or resumed after a pause. Idempotent. */
export function gameplayStart() {
  if (started) return;
  started = true;
  const s = sdk();
  if (!s || !ready) return;
  try { s.game.gameplayStart(); } catch { /* never let telemetry break play */ }
}

/** The player is in a menu, paused, dead, or looking at a results screen. */
export function gameplayStop() {
  if (!started) return;
  started = false;
  const s = sdk();
  if (!s || !ready) return;
  try { s.game.gameplayStop(); } catch { /* same */ }
}

/** True only inside the portal - for anything we want to show or hide there. */
export const onPortal = () => !!sdk();
