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

// PARKED UNTIL THE GAME IS THE GAME.
//
// Only the play clock is wired up. The Data module, the platform's own mute,
// loading events, happytime and banners all come later, deliberately: none of
// them changes how the game plays, and all of them are easier to get right
// against a finished build than a moving one.
//
// What matters until then is that this file is SILENT and INERT off-platform.

/**
 * The SDK object once it exists, else null.
 *
 * Deliberately does NOT touch `.game`. The v3 SDK installs this global
 * asynchronously and complains loudly - "CrazySDK is not initialized yet" - if
 * a module is read before `init()` resolves. Since frame() asks the clock about
 * itself sixty times a second, probing `.game` here printed that error on a
 * loop. Checking only for the global is enough, and says nothing.
 */
function sdk() {
  try {
    return (window.CrazyGames && window.CrazyGames.SDK) || null;
  } catch { return null; }
}

let started = false;   // what we have told the platform
let ready = false;     // init() has resolved and the modules are safe to call

/**
 * Called once at boot. Safe to call when the script never loaded.
 *
 * v3 requires init() and resolves it asynchronously. We do not wait: nothing
 * downstream depends on it, and a blocked or slow CDN must never hold up a
 * game that plays perfectly well without any of this.
 */
export function initPortal() {
  const s = sdk();
  if (!s || typeof s.init !== 'function') return;
  try {
    const p = s.init();
    if (p && p.then) p.then(() => { ready = true; }).catch(() => {});
    else ready = true;
  } catch { /* off-platform, or blocked: play on */ }
}

/**
 * A run has begun, or resumed. Idempotent.
 *
 * `started` tracks what the platform has been told, so it only moves when we
 * actually tell it something. Setting it before `ready` would mean a session
 * that starts playing during init is never reported at all.
 */
export function gameplayStart() {
  if (started || !ready) return;
  const s = sdk();
  if (!s) return;
  try { s.game.gameplayStart(); started = true; } catch { /* never let telemetry break play */ }
}

/** The player is in a menu, paused, dead, or looking at a results screen. */
export function gameplayStop() {
  if (!started) return;
  const s = sdk();
  if (!s || !ready) return;
  try { s.game.gameplayStop(); started = false; } catch { /* same */ }
}

/**
 * Where the SDK thinks we are: 'crazygames', 'local', 'disabled', or null
 * while init() is still resolving.
 *
 * v3 exposes this as a plain property rather than v2's async getter, but only
 * once init() has resolved - hence the `ready` check and the null.
 */
export function environment() {
  const s = sdk();
  if (!s || !ready) return null;
  try { return s.environment || null; } catch { return null; }
}

/**
 * Actually inside the portal.
 *
 * This used to be `!!sdk()` - "did the SDK script load" - which is true on
 * localhost too, since the script loads fine from anywhere. Anything built on
 * it was therefore wrong off-platform as well as on: the `?dev` door checked
 * `!onPortal()` and never opened.
 *
 * STILL NOT A GATE FOR WHAT SHIPS. It is null until init resolves, and false
 * whenever an ad blocker stops the SDK, so hiding something behind it would
 * show that thing on the portal. flags.js owns that decision with a constant.
 */
export const onPortal = () => environment() === 'crazygames';
