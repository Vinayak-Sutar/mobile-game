// Unified input: a floating virtual stick plus action buttons on touch,
// WASD + mouse on desktop. Both feed the same `input` object.

import { view } from './state.js';
import { clamp, dist, normalize } from './util.js';
import { pad } from './gamepad.js';

export const input = {
  move: { x: 0, y: 0 },
  aim: { x: 1, y: 0 },
  aimActive: false,
  attack: false, attackPressed: false,
  special: false, specialPressed: false,
  dash: false, dashPressed: false,
  grenade: false, grenadePressed: false,
  // How a held throw is aimed. `grenadeVec` is a direction plus how far it
  // is pushed (stick or drag); `grenadeAbs` is an absolute point (mouse).
  grenadeVec: { x: 0, y: 0 },
  grenadeAbs: null,
  pausePressed: false,
  touchMode: false,
  padMode: false,
  anyPressed: false,
};

// Held state per source, composed in updateInput. Keeping these apart means a
// gamepad button release can't be undone by a stale keyboard flag, and vice
// versa.
const srcHeld = {
  key: { attack: false, special: false, dash: false, grenade: false },
  touch: { attack: false, special: false, dash: false, grenade: false },
};

export const controls = {
  stick: { active: false, id: null, ox: 0, oy: 0, x: 0, y: 0, radius: 76, knob: 34 },
  attack: { x: 0, y: 0, r: 52, label: 'ATK', pressed: false },
  dash: { x: 0, y: 0, r: 40, label: 'DASH', pressed: false },
  special: { x: 0, y: 0, r: 38, label: 'SPEC', pressed: false },
  grenade: { x: 0, y: 0, r: 36, label: 'BOMB', pressed: false },
  pause: { x: 0, y: 0, r: 20, label: '', pressed: false },
};

// Drag distance, in world units, that pushes a throw out to full range.
const GRENADE_DRAG = 78;
let grenadeDrag = null;

const keys = new Set();
const pointers = new Map();     // pointerId -> role
let canvasEl = null;
let mouseWorld = { x: 0, y: 0 };
let mouseSeen = false;

export function layoutControls() {
  const { w, h } = view;
  if (view.portrait) {
    // Bottom-right cluster inside the reserved thumb band.
    controls.attack.x = w - 96;   controls.attack.y = h - 122;
    controls.dash.x = w - 202;    controls.dash.y = h - 92;
    controls.special.x = w - 118; controls.special.y = h - 232;
    controls.grenade.x = w - 218; controls.grenade.y = h - 196;
    controls.pause.x = w - 32;    controls.pause.y = 32;
    return;
  }
  controls.attack.x = w - 104;
  controls.attack.y = h - 100;
  controls.dash.x = w - 212;
  controls.dash.y = h - 142;
  controls.special.x = w - 124;
  controls.special.y = h - 224;
  controls.grenade.x = w - 232;
  controls.grenade.y = h - 256;
  controls.pause.x = w - 32;
  controls.pause.y = 32;
}

function toWorld(clientX, clientY) {
  const rect = canvasEl.getBoundingClientRect();
  return {
    x: (clientX - rect.left) / view.scale,
    y: (clientY - rect.top) / view.scale,
  };
}

function hitButton(btn, wx, wy, pad = 14) {
  return dist(wx, wy, btn.x, btn.y) <= btn.r + pad;
}

export function initInput(canvas) {
  canvasEl = canvas;
  layoutControls();

  canvas.addEventListener('pointerdown', (ev) => {
    canvas.setPointerCapture?.(ev.pointerId);
    const { x, y } = toWorld(ev.clientX, ev.clientY);
    input.anyPressed = true;

    if (ev.pointerType === 'touch') {
      input.touchMode = true;
      input.aimActive = false;

      // Checked first and with a tight margin: it sits in a corner, and a
      // stray pause mid-fight is worse than a missed one.
      if (hitButton(controls.pause, x, y, 6)) { input.pausePressed = true; return; }
      if (hitButton(controls.attack, x, y)) return assign(ev.pointerId, 'attack');
      if (hitButton(controls.dash, x, y)) return assign(ev.pointerId, 'dash');
      if (hitButton(controls.special, x, y)) return assign(ev.pointerId, 'special');
      if (hitButton(controls.grenade, x, y)) {
        // The grenade button doubles as a mini-stick: drag from it to aim.
        grenadeDrag = { id: ev.pointerId, ox: x, oy: y };
        input.grenadeVec.x = 0;
        input.grenadeVec.y = 0;
        input.grenadeAbs = null;
        return assign(ev.pointerId, 'grenade');
      }

      // Anything on the left half becomes the movement stick.
      if (x < view.w * 0.52 && !controls.stick.active) {
        controls.stick.active = true;
        controls.stick.id = ev.pointerId;
        controls.stick.ox = x;
        controls.stick.oy = y;
        controls.stick.x = x;
        controls.stick.y = y;
        pointers.set(ev.pointerId, 'stick');
        return;
      }
      return;
    }

    // Mouse / pen
    mouseWorld = { x, y };
    mouseSeen = true;
    input.aimActive = true;
    if (ev.button === 2) press('special', 'key');
    else press('attack', 'key');
    pointers.set(ev.pointerId, ev.button === 2 ? 'special' : 'attack');
    ev.preventDefault();
  }, { passive: false });

  canvas.addEventListener('pointermove', (ev) => {
    const { x, y } = toWorld(ev.clientX, ev.clientY);
    if (ev.pointerType !== 'touch') {
      mouseWorld = { x, y };
      mouseSeen = true;
      if (!input.touchMode) input.aimActive = true;
      return;
    }
    const role = pointers.get(ev.pointerId);
    if (role === 'stick') {
      controls.stick.x = x;
      controls.stick.y = y;
    } else if (role === 'grenade' && grenadeDrag && grenadeDrag.id === ev.pointerId) {
      const dx = x - grenadeDrag.ox;
      const dy = y - grenadeDrag.oy;
      const m = Math.hypot(dx, dy);
      const k = Math.min(1, m / GRENADE_DRAG);
      input.grenadeVec.x = m > 0.001 ? (dx / m) * k : 0;
      input.grenadeVec.y = m > 0.001 ? (dy / m) * k : 0;
    }
  }, { passive: true });

  const release = (ev) => {
    const role = pointers.get(ev.pointerId);
    if (role === 'stick') {
      controls.stick.active = false;
      controls.stick.id = null;
    } else if (role) {
      controls[role] && (controls[role].pressed = false);
      unpress(role, 'touch');
      unpress(role, 'key');       // mouse buttons register under the key source
      if (role === 'grenade') {
        grenadeDrag = null;
        input.grenadeVec.x = 0;
        input.grenadeVec.y = 0;
      }
    }
    pointers.delete(ev.pointerId);
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', (ev) => {
    if (ev.pointerType === 'touch') release(ev);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (ev) => {
    if (ev.repeat) return;
    const k = ev.key.toLowerCase();
    keys.add(k);
    input.anyPressed = true;
    input.touchMode = false;
    if (k === ' ' || k === 'shift') ev.preventDefault();
    if (k === ' ') press('dash', 'key');
    if (k === 'j' || k === 'e') press('attack', 'key');
    if (k === 'k' || k === 'q' || k === 'shift') press('special', 'key');
    if (k === 'g') press('grenade', 'key');
  });
  window.addEventListener('keyup', (ev) => {
    const k = ev.key.toLowerCase();
    keys.delete(k);
    if (k === ' ') unpress('dash', 'key');
    if (k === 'j' || k === 'e') unpress('attack', 'key');
    if (k === 'k' || k === 'q' || k === 'shift') unpress('special', 'key');
    if (k === 'g') unpress('grenade', 'key');
  });
  window.addEventListener('blur', () => {
    keys.clear();
    pointers.clear();
    controls.stick.active = false;
    clearHeld();
  });
}

function assign(id, role) {
  pointers.set(id, role);
  press(role, 'touch');
  controls[role].pressed = true;
}

function press(role, source) {
  if (!srcHeld[source] || !(role in srcHeld[source])) return;
  srcHeld[source][role] = true;
  if (role === 'attack') input.attackPressed = true;
  if (role === 'special') input.specialPressed = true;
  if (role === 'dash') input.dashPressed = true;
  if (role === 'grenade') input.grenadePressed = true;
}

function unpress(role, source) {
  if (!srcHeld[source] || !(role in srcHeld[source])) return;
  srcHeld[source][role] = false;
}

export function updateInput(playerPos) {
  // --- movement ---
  let mx = 0, my = 0;
  if (controls.stick.active) {
    const dx = controls.stick.x - controls.stick.ox;
    const dy = controls.stick.y - controls.stick.oy;
    const d = Math.hypot(dx, dy);
    const dead = 8;
    if (d > dead) {
      const mag = Math.min(1, (d - dead) / (controls.stick.radius - dead));
      const [nx, ny] = normalize(dx, dy);
      mx = nx * mag;
      my = ny * mag;
    }
  } else {
    if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
    if (keys.has('d') || keys.has('arrowright')) mx += 1;
    if (keys.has('w') || keys.has('arrowup')) my -= 1;
    if (keys.has('s') || keys.has('arrowdown')) my += 1;
    const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }
  }
  // A gamepad stick outranks the keyboard when it is actually being pushed.
  const padMoving = pad.connected && Math.hypot(pad.move.x, pad.move.y) > 0.01;
  if (padMoving) {
    mx = pad.move.x;
    my = pad.move.y;
  }
  input.move.x = mx;
  input.move.y = my;

  // --- held buttons, composed across every source ---
  const padOn = pad.connected;
  input.attack = srcHeld.key.attack || srcHeld.touch.attack || (padOn && pad.attack);
  input.special = srcHeld.key.special || srcHeld.touch.special || (padOn && pad.special);
  input.dash = srcHeld.key.dash || srcHeld.touch.dash || (padOn && pad.dash);
  input.grenade = srcHeld.key.grenade || srcHeld.touch.grenade || (padOn && pad.grenade);

  // Aim source, in priority order: pad stick, touch drag, mouse.
  if (padOn && pad.grenade && pad.aimActive) {
    input.grenadeVec.x = pad.aim.x * pad.aimPush;
    input.grenadeVec.y = pad.aim.y * pad.aimPush;
    input.grenadeAbs = null;
  } else if (!grenadeDrag && !input.touchMode && mouseSeen) {
    input.grenadeAbs = { x: mouseWorld.x, y: mouseWorld.y };
  } else if (!grenadeDrag && !padOn) {
    input.grenadeAbs = null;
  }

  // Consume the pad's press edges here rather than in the poll, so an edge
  // fires exactly once even when the loop runs several fixed steps per frame.
  if (padOn) {
    if (pad.attackPressed) { input.attackPressed = true; pad.attackPressed = false; }
    if (pad.specialPressed) { input.specialPressed = true; pad.specialPressed = false; }
    if (pad.dashPressed) { input.dashPressed = true; pad.dashPressed = false; }
    if (pad.grenadePressed) { input.grenadePressed = true; pad.grenadePressed = false; }
  }

  if (padOn && (padMoving || pad.attack || pad.special || pad.dash || pad.aimActive)) {
    input.padMode = true;
    input.touchMode = false;
  }

  // --- aim ---
  if (padOn && pad.aimActive) {
    // Right stick wins: twin-stick aiming is the whole point of a controller.
    input.aim.x = pad.aim.x;
    input.aim.y = pad.aim.y;
    input.aimActive = true;
  } else if (!input.touchMode && !input.padMode && mouseSeen && playerPos) {
    const dx = mouseWorld.x - playerPos.x;
    const dy = mouseWorld.y - playerPos.y;
    if (Math.hypot(dx, dy) > 6) {
      const [nx, ny] = normalize(dx, dy);
      input.aim.x = nx;
      input.aim.y = ny;
      input.aimActive = true;
    }
  } else {
    // No explicit aim -> player.js falls back to auto-aim at the nearest foe.
    input.aimActive = false;
  }
}

function clearHeld() {
  for (const src of Object.values(srcHeld)) {
    src.attack = src.special = src.dash = src.grenade = false;
  }
  input.attack = input.special = input.dash = input.grenade = false;
  grenadeDrag = null;
  input.grenadeVec.x = 0;
  input.grenadeVec.y = 0;
}

/** Clear one-frame edge flags. Call at the very end of the frame. */
export function endFrameInput() {
  input.attackPressed = false;
  input.specialPressed = false;
  input.dashPressed = false;
  input.grenadePressed = false;
  input.pausePressed = false;
  input.anyPressed = false;
}

export function isKeyDown(k) { return keys.has(k); }

export function resetInput() {
  keys.clear();
  pointers.clear();
  controls.stick.active = false;
  clearHeld();
  endFrameInput();
}
