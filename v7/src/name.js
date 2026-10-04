// WHAT THIS GAME IS CALLED, and the one place it is written down.
//
// The owner has not named the game yet, and naming it later should cost one
// edit rather than a hunt through the codebase and a broken save for everyone
// who already played. So:
//
//   SLUG is PERMANENT and never shown to a player. It is the cache prefix and
//   the save key. Changing it would orphan every save on every phone, so it
//   does not change, ever - not even when the game is named.
//
//   NAME and SHORT are what a player sees: the title screen, the app icon's
//   label, the store listing. Changing them is free.
//
// Two files cannot import this one - manifest.json is static JSON and
// index.html's <title> is static markup - so they carry copies, and
// tools/check-version.mjs fails the build if either drifts out of step.
// That is the whole trick: one constant, and a checker that keeps the two
// places it cannot reach honest.

/** Permanent, invisible, and the reason a rename is cheap. Do not change. */
export const SLUG = 'v7';

/** The displayed title. A working title until the owner picks the real one. */
export const NAME = 'Ashfall';

/** For the app icon, where long names are truncated by the launcher. */
export const SHORT = 'Ashfall';

/** The storage key this version owns. Nothing else may read or write it. */
export const SAVE_KEY = `ashfall.${SLUG}.save`;

/** The offline cache prefix. A worker only ever deletes its own, so versions
 *  cannot wipe each other's offline copy - which savi/ got wrong. */
export const CACHE_PREFIX = `ashfall-${SLUG}-`;
