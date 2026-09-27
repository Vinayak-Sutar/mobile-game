// Savi — one place that knows what the keys are.
//
// Every binding used to be a literal, scattered through two functions:
// `keys.has('e')`, `k === 'shift'`, `k === 'tab'`, `keys.has('arrowleft')`.
// Nine of them, in eleven places, with no table anywhere. That means three
// things a submission needs are impossible: you cannot SHOW a player what the
// buttons are, you cannot let them CHANGE one, and you cannot write a hint
// that stays true after they have.
//
// So the keys live here, the game asks `kdown('jump')` instead of
// `keys.has(' ')`, and the prompt at the foot of the screen asks
// `keyLabel('use')` rather than spelling a key out by hand.
//
// WHAT COUNTS AS A KEY. The raw `e.key.toLowerCase()` the browser hands us,
// so ' ' is the space bar and 'arrowup' is an arrow - and the one pseudo-key
// 'mouse1', which savi.js puts in the held set on a left click. A mouse
// button is a binding like any other as far as this table is concerned.
//
// WHAT IS NOT IN HERE. Escape and Enter. Cancel and confirm are how a player
// gets out of a menu they have got themselves stuck in, and a game that lets
// you rebind them is a game that can lock you out of its own options screen.

/**
 * The nine things she can be told to do, in the order the controls page
 * shows them. `keys` is the default, and `what` is the line beside it.
 */
export const ACTIONS = [
  { id: 'up', name: 'Walk up', keys: ['w', 'arrowup'], pad: 'stick / d-pad' },
  { id: 'down', name: 'Walk down', keys: ['s', 'arrowdown'], pad: 'stick / d-pad' },
  { id: 'left', name: 'Walk left', keys: ['a', 'arrowleft'], pad: 'stick / d-pad' },
  { id: 'right', name: 'Walk right', keys: ['d', 'arrowright'], pad: 'stick / d-pad' },
  { id: 'jump', name: 'Jump', keys: [' '], pad: 'cross' },
  { id: 'dash', name: 'Dash', keys: ['shift', 'x'], pad: 'circle' },
  { id: 'interact', name: 'Interact', keys: ['e'], pad: 'square', what: 'talk, read a mural, lift a stone' },
  { id: 'use', name: 'Use what she holds', keys: ['mouse1'], pad: 'square', what: 'sweep, raise the lantern' },
  { id: 'belt', name: 'Her belt', keys: ['tab'], pad: 'L1', what: 'change what is in her hands' },
];

// --- WHAT THE BUTTONS ON A PAD ARE CALLED -------------------------------------------
//
// The mapping is the same either way - the browser hands every standard pad
// the same numbers, and 0 is the bottom face button whatever is printed on it.
// What is NOT the same is what it SAYS. Telling an Xbox player to press circle
// is telling them nothing, and the game said exactly that everywhere.
//
// So the numbers stay where they are and only the words change, off the pad's
// own id. Anything that is not obviously Sony gets the Xbox names, because a
// generic pad on Windows arrives through XInput and is Xbox-shaped.

export const PAD_STYLES = {
  ps: {
    name: 'PlayStation', move: 'the left stick', jump: 'cross', dash: 'circle',
    act: 'square', belt: 'L1', menu: 'options',
  },
  xbox: {
    name: 'Xbox', move: 'the left stick', jump: 'A', dash: 'B',
    act: 'X', belt: 'LB', menu: 'menu',
  },
};

let padStyle = 'xbox';

/** Called whenever a pad turns up, with whatever string it calls itself. */
export function setPadStyle(id) {
  padStyle = /dualsense|dualshock|playstation|054c|0ce6|sony/i.test(String(id || ''))
    ? 'ps' : 'xbox';
  return padStyle;
}

/** What to call that button out loud, on the pad that is plugged in. */
export function padName(what) {
  return PAD_STYLES[padStyle][what] || what;
}

/** Keys the game keeps for itself, whatever a player would like. */
export const RESERVED_KEYS = ['escape', 'enter'];

const DEFAULTS = {};
for (const a of ACTIONS) DEFAULTS[a.id] = a.keys.slice();

const SAVED = 'savi.keys.v1';

/** What is bound right now: action id -> array of key names. */
export const BINDS = {};

/** The keys held down this instant, raw and lowercased. savi.js fills it. */
export const keys = new Set();

/**
 * Put the table back to the defaults. Also the fallback for every kind of
 * broken saved data, which is the point: an action with no key at all is a
 * player who cannot jump and has no way to find out why.
 */
export function resetKeys() {
  for (const a of ACTIONS) BINDS[a.id] = DEFAULTS[a.id].slice();
}

resetKeys();

/** Read whatever the last session left, one action at a time, trusting none of it. */
export function loadKeys() {
  resetKeys();
  let raw = null;
  try { raw = localStorage.getItem(SAVED); } catch (e) { return; }
  if (!raw) return;
  let saved = null;
  try { saved = JSON.parse(raw); } catch (e) { return; }
  if (!saved || typeof saved !== 'object') return;
  for (const a of ACTIONS) {
    const v = saved[a.id];
    if (!Array.isArray(v)) continue;
    // Strings only, nothing reserved, no duplicates - and if what is left of
    // it is nothing, the default stands rather than the action going dark.
    const clean = [];
    for (const k of v) {
      if (typeof k !== 'string' || !k) continue;
      const lk = k.toLowerCase();
      if (RESERVED_KEYS.includes(lk)) continue;
      if (!clean.includes(lk)) clean.push(lk);
    }
    if (clean.length) BINDS[a.id] = clean.slice(0, 3);
  }
}

function saveKeys() {
  try { localStorage.setItem(SAVED, JSON.stringify(BINDS)); } catch (e) { /* a private window */ }
}

/** Is this action being held? */
export function kdown(id) {
  const b = BINDS[id];
  if (!b) return false;
  for (const k of b) if (keys.has(k)) return true;
  return false;
}

/** Which action, if any, that raw key belongs to. One key, one action. */
export function actionFor(key) {
  const k = String(key).toLowerCase();
  for (const a of ACTIONS) if (BINDS[a.id].includes(k)) return a.id;
  return null;
}

const PRETTY = {
  ' ': 'space', arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→',
  mouse1: 'left click', mouse2: 'right click', shift: 'shift', tab: 'tab',
  control: 'ctrl', alt: 'alt', capslock: 'caps', backspace: 'backspace',
};

/** A key as a player would say it out loud. */
export function prettyKey(k) {
  if (!k) return '';
  const lk = String(k).toLowerCase();
  if (PRETTY[lk]) return PRETTY[lk];
  return lk.length === 1 ? lk.toUpperCase() : lk;
}

/** The one key to name in a hint: the first thing bound to that action. */
export function keyLabel(id) {
  const b = BINDS[id];
  return b && b.length ? prettyKey(b[0]) : '';
}

/** Everything bound to it, for the controls page. */
export function keyLabels(id) {
  const b = BINDS[id];
  return b && b.length ? b.map(prettyKey).join(' / ') : 'unbound';
}

/**
 * Give an action a key.
 *
 * ONE KEY BELONGS TO ONE ACTION. If that key was doing something else it is
 * TAKEN from it, and the id it was taken from comes back so the menu can say
 * so out loud - a silent steal is how a player ends up unable to dash and
 * with no idea what they did. And if taking it would leave that other action
 * with nothing at all, it keeps its default instead of going dark.
 *
 * @returns {{ took: string|null, refused: string|null }}
 */
export function rebindKey(id, key) {
  if (!BINDS[id]) return { took: null, refused: 'no such action' };
  const k = String(key).toLowerCase();
  if (!k) return { took: null, refused: 'no key' };
  if (RESERVED_KEYS.includes(k)) return { took: null, refused: `${prettyKey(k)} is how you get out of here` };
  let took = null;
  for (const a of ACTIONS) {
    if (a.id === id) continue;
    const at = BINDS[a.id].indexOf(k);
    if (at < 0) continue;
    took = a.id;
    BINDS[a.id] = BINDS[a.id].filter((x) => x !== k);
    if (!BINDS[a.id].length) BINDS[a.id] = DEFAULTS[a.id].filter((x) => x !== k);
    if (!BINDS[a.id].length) BINDS[a.id] = DEFAULTS[a.id].slice();
  }
  BINDS[id] = [k];
  saveKeys();
  return { took, refused: null };
}

/** Back to how it shipped, and remembered as such. */
export function defaultKeys() {
  resetKeys();
  saveKeys();
}

/** For the checker: the defaults, untouched. */
export const KEY_DEFAULTS = DEFAULTS;
