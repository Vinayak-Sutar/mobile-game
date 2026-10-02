// A move vector, from a keyboard, a thumb or a stick.
//
// Small on purpose. Ashfall's input.js is four hundred lines because it also
// carries fourteen touch buttons and nine combat verbs; this version has one
// verb - walk - so it gets the forty lines that actually do that.
//
// EVERYTHING IS READ IN SCREEN TERMS AND CONVERTED ONCE. Push the stick up and
// she should walk up the screen, which under an isometric camera is diagonally
// away in world terms. The player must never have to think in world x and y,
// and the conversion lives in view.js with the projection it inverts - so
// there is still exactly one piece of code that knows how the camera works.

import { worldDir } from './view.js';

export const input = {
  move: { x: 0, y: 0 },   // WORLD direction, already converted
  mag: 0,                 // 0..1
  screen: { x: 0, y: 0 }, // the raw screen-space push, for drawing the stick
  stick: null,            // { ox, oy, x, y } while a thumb is down
  pad: false,             // a gamepad was seen this frame
};

const keys = new Set();
const KEYS = {
  w: [0, -1], a: [-1, 0], s: [0, 1], d: [1, 0],
  arrowup: [0, -1], arrowleft: [-1, 0], arrowdown: [0, 1], arrowright: [1, 0],
};

const STICK_MAX = 58;     // pixels of drag for a full push
const DEAD = 0.22;        // gamepad deadzone

let target = null;

export function initInput(canvas) {
  target = canvas;
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
}

export function stopInput() {
  if (!target) return;
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('keyup', onKey);
  target.removeEventListener('pointerdown', onDown);
  target.removeEventListener('pointermove', onMove);
  target.removeEventListener('pointerup', onUp);
  target.removeEventListener('pointercancel', onUp);
  keys.clear();
  input.stick = null;
  target = null;
}

function onKey(ev) {
  const k = ev.key.toLowerCase();
  if (!(k in KEYS)) return;
  ev.preventDefault();
  if (ev.type === 'keydown') keys.add(k); else keys.delete(k);
}

/** A floating thumbstick: it appears wherever the thumb lands, which beats a
 *  fixed one on a phone because you never have to look for it. */
function onDown(ev) {
  if (ev.pointerType === 'mouse' && ev.button !== 0) return;
  target.setPointerCapture?.(ev.pointerId);
  input.stick = { id: ev.pointerId, ox: ev.clientX, oy: ev.clientY, x: 0, y: 0 };
}
function onMove(ev) {
  if (!input.stick || input.stick.id !== ev.pointerId) return;
  input.stick.x = ev.clientX - input.stick.ox;
  input.stick.y = ev.clientY - input.stick.oy;
}
function onUp(ev) {
  if (input.stick && input.stick.id !== ev.pointerId) return;
  input.stick = null;
}

/** Call once at the top of every tick, before anything reads `input`. */
export function updateInput() {
  let sx = 0, sy = 0;
  input.pad = false;

  for (const k of keys) { sx += KEYS[k][0]; sy += KEYS[k][1]; }
  if (sx || sy) {
    const m = Math.hypot(sx, sy);
    sx /= m; sy /= m;
  }

  if (!sx && !sy && input.stick) {
    const m = Math.hypot(input.stick.x, input.stick.y);
    if (m > 6) {
      const u = Math.min(1, m / STICK_MAX);
      sx = (input.stick.x / m) * u;
      sy = (input.stick.y / m) * u;
    }
  }

  if (!sx && !sy) {
    for (const p of navigator.getGamepads?.() || []) {
      if (!p || !p.axes) continue;
      input.pad = true;
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      const m = Math.hypot(ax, ay);
      if (m > DEAD) {
        const u = Math.min(1, (m - DEAD) / (1 - DEAD));
        sx = (ax / m) * u; sy = (ay / m) * u;
      }
      // The d-pad, for a controller held like a controller.
      const dp = [[14, -1, 0], [15, 1, 0], [12, 0, -1], [13, 0, 1]];
      for (const [i, bx, by] of dp) if (p.buttons?.[i]?.pressed) { sx += bx; sy += by; }
      break;
    }
    const m = Math.hypot(sx, sy);
    if (m > 1) { sx /= m; sy /= m; }
  }

  input.screen.x = sx;
  input.screen.y = sy;
  input.mag = Math.min(1, Math.hypot(sx, sy));
  if (input.mag > 0.02) {
    const w = worldDir(sx, sy);
    input.move.x = w.x * input.mag;
    input.move.y = w.y * input.mag;
  } else {
    input.move.x = 0;
    input.move.y = 0;
  }
}
