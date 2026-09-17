// Gamepad support. Standard Gamepad API only — this layer works with any
// controller (DualSense, Xbox, Switch Pro). The DualSense-only extras
// (lightbar, adaptive triggers) live in dualsense.js and are optional.

import { fx } from './fx.js';
import { world } from './state.js';
import { clamp, normalize } from './util.js';
import { dualsense, setLightbar, setTriggers, TRIGGER } from './dualsense.js';

// DualSense / standard-mapping button indices.
const BTN = {
  CROSS: 0, CIRCLE: 1, SQUARE: 2, TRIANGLE: 3,
  L1: 4, R1: 5, L2: 6, R2: 7,
  CREATE: 8, OPTIONS: 9, L3: 10, R3: 11,
  UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
  PS: 16, TOUCHPAD: 17,
};

const MOVE_DEAD = 0.22;
const AIM_DEAD = 0.30;      // larger: a drifting right stick must not steal aim
const TRIGGER_PULL = 0.35;

export const pad = {
  connected: false,
  index: -1,
  id: '',
  isDualSense: false,

  move: { x: 0, y: 0 },
  aim: { x: 1, y: 0 },
  aimActive: false,

  attack: false, attackPressed: false,
  spellPressed: null,      // slot 0-3 cast this frame (hold R1 + a face button)
  special: false, specialPressed: false,
  dash: false, dashPressed: false,
  grenade: false, grenadePressed: false,
  aimPush: 0,
  pausePressed: false,
  mutePressed: false,
  confirmPressed: false,
  backPressed: false,
};

let prev = [];
let lastTrauma = 0;
let lastRumbleAt = 0;
let navRepeat = 0;
let focusIndex = 0;
let onPause = null;
let onMute = null;

export function initGamepad({ pause, mute } = {}) {
  onPause = pause;
  onMute = mute;
  window.addEventListener('gamepadconnected', (e) => {
    pad.connected = true;
    pad.index = e.gamepad.index;
    pad.id = e.gamepad.id;
    pad.isDualSense = /dualsense|054c.*0ce6|0ce6|dualshock/i.test(e.gamepad.id);
    rumble(0.5, 0.3, 140);   // "I see you" handshake
  });
  window.addEventListener('gamepaddisconnected', (e) => {
    if (e.gamepad.index === pad.index) {
      pad.connected = false;
      pad.index = -1;
      clearPad();
    }
  });
}

function clearPad() {
  pad.move.x = pad.move.y = 0;
  pad.aimActive = false;
  pad.attack = pad.special = pad.dash = pad.grenade = false;
  prev = [];
}

function activeGamepad() {
  if (!navigator.getGamepads) return null;
  const list = navigator.getGamepads();
  if (!list) return null;
  // Prefer the pad that fired gamepadconnected, else the first live one.
  if (pad.index >= 0 && list[pad.index]) return list[pad.index];
  for (const gp of list) {
    if (gp && gp.connected) {
      pad.index = gp.index;
      pad.id = gp.id;
      pad.isDualSense = /dualsense|0ce6|dualshock/i.test(gp.id);
      pad.connected = true;
      return gp;
    }
  }
  return null;
}

function stick(gp, ax, ay, dead) {
  const x = gp.axes[ax] || 0;
  const y = gp.axes[ay] || 0;
  const m = Math.hypot(x, y);
  if (m < dead) return [0, 0, 0];
  // Radial deadzone with rescaling, so the first degree past the deadzone is
  // a small input rather than a jump to 0.22.
  const scaled = clamp((m - dead) / (1 - dead), 0, 1);
  const [nx, ny] = normalize(x, y);
  return [nx * scaled, ny * scaled, scaled];
}

function held(gp, i) {
  const b = gp.buttons[i];
  if (!b) return false;
  return typeof b === 'object' ? (b.pressed || b.value > TRIGGER_PULL) : b > TRIGGER_PULL;
}

function pressed(gp, i) {
  return held(gp, i) && !prev[i];
}

/** Poll once per frame, before the sim tick. */
export function pollGamepad(overlayOpen) {
  pad.attackPressed = pad.specialPressed = pad.dashPressed = false;
  pad.grenadePressed = false;
  pad.pausePressed = pad.mutePressed = false;
  pad.confirmPressed = pad.backPressed = false;

  const gp = activeGamepad();
  if (!gp) {
    if (pad.connected) { pad.connected = false; clearPad(); }
    return;
  }
  pad.connected = true;

  const [mx, my] = stick(gp, 0, 1, MOVE_DEAD);
  pad.move.x = mx;
  pad.move.y = my;

  const [axx, axy, amag] = stick(gp, 2, 3, AIM_DEAD);
  pad.aimPush = amag;
  if (amag > 0) {
    const [nx, ny] = normalize(axx, axy);
    pad.aim.x = nx;
    pad.aim.y = ny;
    pad.aimActive = true;
  } else {
    pad.aimActive = false;
  }

  // D-pad also moves, for players who prefer it.
  if (!mx && !my) {
    let dx = 0, dy = 0;
    if (held(gp, BTN.LEFT)) dx -= 1;
    if (held(gp, BTN.RIGHT)) dx += 1;
    if (held(gp, BTN.UP)) dy -= 1;
    if (held(gp, BTN.DOWN)) dy += 1;
    if (dx || dy) {
      const [nx, ny] = normalize(dx, dy);
      pad.move.x = nx;
      pad.move.y = ny;
    }
  }

  // Version 4, Avowed's grimoire layout: hold R1 and the face buttons cast
  // the four spells (✕ ○ □ △ = slots 1-4) instead of their usual actions.
  // Dash is ✕ or L1.
  const grimoire = held(gp, BTN.R1);
  pad.attack = held(gp, BTN.R2) || (!grimoire && held(gp, BTN.SQUARE));
  pad.special = held(gp, BTN.L2) || (!grimoire && held(gp, BTN.TRIANGLE));
  pad.dash = held(gp, BTN.L1) || (!grimoire && held(gp, BTN.CROSS));
  pad.grenade = !grimoire && held(gp, BTN.CIRCLE);

  pad.attackPressed = pressed(gp, BTN.R2) || (!grimoire && pressed(gp, BTN.SQUARE));
  pad.specialPressed = pressed(gp, BTN.L2) || (!grimoire && pressed(gp, BTN.TRIANGLE));
  pad.dashPressed = pressed(gp, BTN.L1) || (!grimoire && pressed(gp, BTN.CROSS));
  pad.grenadePressed = !grimoire && pressed(gp, BTN.CIRCLE);
  if (grimoire) {
    const face = [BTN.CROSS, BTN.CIRCLE, BTN.SQUARE, BTN.TRIANGLE];
    for (let i = 0; i < face.length; i++) if (pressed(gp, face[i])) pad.spellPressed = i;
  }
  pad.pausePressed = pressed(gp, BTN.OPTIONS);
  pad.mutePressed = pressed(gp, BTN.CREATE);
  pad.confirmPressed = pressed(gp, BTN.CROSS);
  pad.backPressed = pressed(gp, BTN.CIRCLE);

  // Snapshot for edge detection next frame.
  prev = gp.buttons.map((b) => (typeof b === 'object' ? (b.pressed || b.value > TRIGGER_PULL) : b > TRIGGER_PULL));

  if (overlayOpen) {
    // In a menu the sticks drive focus, not the character.
    navigateMenu(gp);
    pad.move.x = pad.move.y = 0;
    pad.attack = pad.special = pad.dash = pad.grenade = false;
    pad.attackPressed = pad.specialPressed = pad.dashPressed = pad.grenadePressed = false;
    pad.spellPressed = null;
  } else {
    focusIndex = 0;
    if (pad.pausePressed && onPause) onPause();
    if (pad.mutePressed && onMute) onMute();
  }

  autoRumble(gp);
}

// --- menu navigation -------------------------------------------------------

function menuItems() {
  return [...document.querySelectorAll('#overlay [data-act]')];
}

function navigateMenu(gp) {
  const items = menuItems();
  if (items.length === 0) return;

  focusIndex = clamp(focusIndex, 0, items.length - 1);

  let dx = 0, dy = 0;
  const lx = gp.axes[0] || 0, ly = gp.axes[1] || 0;
  if (Math.abs(lx) > 0.6) dx = Math.sign(lx);
  if (Math.abs(ly) > 0.6) dy = Math.sign(ly);
  if (held(gp, BTN.LEFT)) dx = -1;
  if (held(gp, BTN.RIGHT)) dx = 1;
  if (held(gp, BTN.UP)) dy = -1;
  if (held(gp, BTN.DOWN)) dy = 1;

  const step = dx || dy;
  if (step === 0) {
    navRepeat = 0;
  } else {
    navRepeat -= 1 / 60;
    if (navRepeat <= 0) {
      navRepeat = 0.18;
      focusIndex = (focusIndex + step + items.length) % items.length;
      rumble(0.12, 0.06, 25);
    }
  }

  items.forEach((el, i) => el.classList.toggle('padfocus', i === focusIndex));

  if (pad.confirmPressed) {
    rumble(0.4, 0.25, 60);
    items[focusIndex].click();
    focusIndex = 0;
  }
}

export function resetMenuFocus() {
  focusIndex = 0;
  navRepeat = 0;
}

// --- rumble ----------------------------------------------------------------

export function rumble(strong, weak, ms) {
  const gp = activeGamepad();
  if (!gp) return;
  const act = gp.vibrationActuator;
  if (!act || !act.playEffect) return;
  try {
    act.playEffect('dual-rumble', {
      startDelay: 0,
      duration: clamp(ms, 10, 900),
      strongMagnitude: clamp(strong, 0, 1),
      weakMagnitude: clamp(weak, 0, 1),
    }).catch(() => {});
  } catch {
    // Older Chrome exposes a different actuator shape; not worth branching on.
  }
}

// Screen shake and rumble want exactly the same impulses, so rather than
// touching every call site we read the trauma the fx system already tracks.
function autoRumble(gp) {
  const now = performance.now();
  const t = fx.trauma;
  const jump = t - lastTrauma;
  lastTrauma = t;
  if (jump > 0.04 && now - lastRumbleAt > 45) {
    lastRumbleAt = now;
    rumble(clamp(jump * 1.7, 0, 1), clamp(jump * 0.9, 0, 1), 55 + jump * 150);
  }
}

// --- DualSense feedback (no-ops unless the HID device is connected) ---------

let lastLight = '';
let lastTrigger = '';

export function updateDualSenseFeedback() {
  if (!dualsense.connected) return;

  const p = world.player;
  let color;

  if (!p || p.dead) {
    color = [40, 6, 12];
  } else {
    const frac = p.hp / p.stats.maxHp;
    if (p.hurtFlash > 0) {
      color = [255, 30, 50];
    } else if (frac < 0.35) {
      // Heartbeat pulse when badly hurt — the same signal as the red vignette.
      const k = 0.45 + Math.sin(world.runTime * 7) * 0.35;
      color = [Math.round(200 * k + 55), 12, 24];
    } else {
      color = hexToRgb(p.weapon.color);
    }
  }

  const key = color.join(',');
  if (key !== lastLight) {
    lastLight = key;
    setLightbar(color[0], color[1], color[2]);
  }

  // R2 resistance is the weapon's weight; L2 goes slack while the special is
  // recharging, so the cooldown is something you feel rather than read.
  if (p && !p.dead) {
    const right = WEAPON_TRIGGER[p.weapon.id] || TRIGGER.feedback(3, 4);
    const left = p.specialCd > 0 ? TRIGGER.off() : TRIGGER.feedback(5, 6);
    const tkey = `${p.weapon.id}:${p.specialCd > 0 ? 0 : 1}`;
    if (tkey !== lastTrigger) {
      lastTrigger = tkey;
      setTriggers(left, right);
    }
  }
}

const WEAPON_TRIGGER = {
  blade: TRIGGER.feedback(2, 3),          // light, fast
  spear: TRIGGER.feedback(4, 5),          // firmer thrust
  shield: TRIGGER.feedback(3, 8),         // heavy bash
  bow: TRIGGER.weapon(2, 7, 6),           // draw resistance, then a release click
};

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function resetDualSenseFeedback() {
  lastLight = '';
  lastTrigger = '';
}
