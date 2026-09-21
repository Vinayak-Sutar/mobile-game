// The Wilds' save: one journey, kept in localStorage.
//
// Written at every Ashlamp (kindling, resting, levelling, travelling), when
// you wake after a fall, when you take back your smoulder, every half minute
// while you play, and whenever the page is hidden or closed - so nothing you
// have done is lost. Where you STAND is not kept: like any souls-like, you
// come back at the last Ashlamp you rested at.
//
// The fog of war (which 100-unit cells you have seen) is one bit a cell,
// packed and base64'd - about 18 KB for the whole world.

const KEY = 'ashfall.v5.wilds';
const VERSION = 1;

/** Pack a 0/1 byte array into a base64 bitset. */
export function packBits(bytes) {
  const out = new Uint8Array(Math.ceil(bytes.length / 8));
  for (let i = 0; i < bytes.length; i++) if (bytes[i]) out[i >> 3] |= 1 << (i & 7);
  let bin = '';
  for (let i = 0; i < out.length; i += 4096) bin += String.fromCharCode.apply(null, out.subarray(i, i + 4096));
  return btoa(bin);
}

/** Unpack a base64 bitset into a 0/1 byte array of the given length. */
export function unpackBits(b64, length) {
  const bytes = new Uint8Array(length);
  if (!b64) return bytes;
  const bin = atob(b64);
  for (let i = 0; i < length; i++) {
    const c = bin.charCodeAt(i >> 3);
    if (c & (1 << (i & 7))) bytes[i] = 1;
  }
  return bytes;
}

export function loadJourney() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    return j && j.v === VERSION ? j : null;
  } catch {
    return null;
  }
}

export function saveJourney(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, at: Date.now(), ...data }));
    return true;
  } catch {
    return false;                 // private mode, or storage full: play on without it
  }
}

export function clearJourney() {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
