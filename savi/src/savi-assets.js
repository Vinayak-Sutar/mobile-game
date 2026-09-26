// The painted art, and what to do while it is not there yet.
//
// The portraits and the murals are files in savi/ASSETS now. They are loaded
// lazily, cached, and every drawing call falls back to the code-drawn art if a
// file is missing or has not arrived yet - so the game is never blank, never
// waits, and still runs if the folder is deleted.
//
// The folder is ASSETS in capitals, and GitHub Pages is case-sensitive, so the
// case here has to match the case on disk exactly.

const BASE = 'ASSETS/';
const cache = new Map();

/** The image if it is loaded and good, otherwise null. Starts the load. */
export function img(name) {
  if (!name) return null;
  let e = cache.get(name);
  if (e === undefined) {
    e = typeof Image === 'undefined' ? null : new Image();
    if (e) {
      e.decoding = 'async';
      e.addEventListener('load', () => { e.ok = e.naturalWidth > 0; });
      e.addEventListener('error', () => { e.bad = true; });
      e.src = `${BASE}${name}.png`;
    }
    cache.set(name, e);
  }
  return e && e.ok ? e : null;
}

/** Ask for them early, so the first line of dialogue is not the fallback. */
export function preload(names) { for (const n of names) img(n); }

/** How many of the asked-for files have arrived. For a loading line, if wanted. */
export function loaded(names) {
  let n = 0;
  for (const k of names) { const e = cache.get(k); if (e && e.ok) n++; }
  return n;
}

/**
 * Draw an image to COVER a box, centred, cropping the overflow rather than
 * squashing it. The portraits are 3:4 and their panel is a little narrower;
 * the murals are 16:9 and their panel a little wider. Squashing either would
 * show, and cropping a few per cent off an edge does not.
 */
export function cover(ctx, im, x, y, w, h) {
  const s = Math.max(w / im.naturalWidth, h / im.naturalHeight);
  const dw = im.naturalWidth * s, dh = im.naturalHeight * s;
  ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/** Every file the game will want, so they can all be asked for at boot. */
export const PORTRAITS = [
  'savitri-resolute', 'savitri-grieving', 'savitri-clever', 'savitri-pleading', 'savitri-joy',
  'satyavan-warm', 'satyavan-tired', 'satyavan-gone', 'satyavan-waking',
  'yama-proud', 'yama-stern', 'yama-caught', 'yama-respect', 'yama-approving',
  'narada-grave', 'narada-wry',
  'keeper-weary', 'keeper-speaking', 'keeper-hopeful', 'keeper-pleased', 'keeper-moved',
];
export const MURALS = [
  'mural-choice', 'mural-fall', 'mural-pursuit', 'mural-steps', 'mural-boon', 'mural-bloom',
];

/**
 * The face to show when a line does not name one. Every line in savi-story.js
 * carries its own mood; this is what the keeper's own conversation uses, and
 * the safety net for anything that slips through.
 */
export const DEFAULT_MOOD = {
  savitri: 'resolute', satyavan: 'warm', yama: 'proud', narada: 'grave', keeper: 'speaking',
};

/** The keeper's face changes with how much of the tree has come back. */
export function keeperMood(count, total, ended) {
  if (ended) return 'moved';
  if (count === 0) return 'weary';
  if (count >= total) return 'moved';
  return count === 1 ? 'hopeful' : 'pleased';
}
