// WHAT THIS GAME IS CALLED, and the one place it is written down.
//
// SLUG is PERMANENT and never shown to a player. It is the cache prefix and
// the save key, so changing it would orphan every save. It does not change,
// not even when the game is named.
//
// NAME and SHORT are what a player sees. Free to change.
//
// manifest.json and index.html's <title> cannot import a module, so they
// carry copies, and tools/check-version.mjs fails if either drifts.

/** Permanent, invisible, and the reason a rename is cheap. Do not change. */
export const SLUG = 'crazy';

/** The displayed title. A working title until the real one is picked. */
export const NAME = 'Ashfall';

/** For anywhere a long name would be truncated. */
export const SHORT = 'Ashfall';

/** The storage key this version owns. Nothing else may read or write it. */
export const SAVE_KEY = `ashfall.${SLUG}.save`;

/** The offline cache prefix. A worker only deletes its own. */
export const CACHE_PREFIX = `ashfall-${SLUG}-`;
