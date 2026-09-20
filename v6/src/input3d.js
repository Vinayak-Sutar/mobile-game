// Input for the 3D game, written into Version 5's `input` object.
//
// This is the whole trick of the port. The simulation reads only four things
// from input - `move`, `aim`, `aimActive` and `grenadeAbs` - plus the button
// flags. So nothing in player.js, weapons.js, spells.js or grenade.js has to
// change: this module simply writes those fields from a camera-relative point
// of view instead of a top-down one.
//
// Version 5's own `initInput`/`updateInput` are never called; they measure the
// mouse against a 2D canvas, which has no meaning here. `endFrameInput` is
// reused, since all it does is clear one-frame edges.
//
// Note: `input.aimActive` is true every frame, which permanently bypasses the
// soft auto-aim inside `aimAngle()` (player.js). That branch exists for touch
// steering; 3D aims with the camera and, later, with lock-on.

import { input } from '../../v5/src/input.js';
import { pad } from '../../v5/src/gamepad.js';
import { normalize } from '../../v5/src/util.js';

const keys = new Set();
let rig = null;
let canvasEl = null;
let locked = false;
let lookDX = 0, lookDY = 0;
let wheel = 0;

export const state3d = {
  /** Set while the right mouse button (or L2) is held: aim down the weapon. */
  aiming: false,
  lockPressed: false,
  switchTarget: 0,
  pointerLocked: () => locked,
};

// Keyboard roles. Space is the jump now, and the dodge roll moved onto Shift:
// a tap rolls, holding it sprints - the way a soulslike puts both on one
// button, so the hand never leaves the movement keys.
const KEY_ROLE = {
  j: 'attack', e: 'attack',
  k: 'special',
  q: 'grenade',
};
const SHIFT_TAP = 0.22;          // held shorter than this: a roll, not a sprint

/** What the mover needs to know each tick. */
export const keys3d = { jump: false, jumpHeld: false, jumpCut: false, sprint: false, sprintHeld: false };
/** The held keys, exposed for the console handle. */
export const heldKeys = keys;
let shiftDown = 0;

export function initInput3d(canvas, cameraRig, hooks = {}) {
  canvasEl = canvas;
  rig = cameraRig;

  canvas.addEventListener('mousedown', (ev) => {
    if (!locked) { canvas.requestPointerLock?.(); return; }
    if (ev.button === 0) press('attack');
    if (ev.button === 2) { state3d.aiming = true; press('special'); }
    if (ev.button === 1) { state3d.lockPressed = true; ev.preventDefault(); }
  });
  canvas.addEventListener('mouseup', (ev) => {
    if (ev.button === 0) release('attack');
    if (ev.button === 2) { state3d.aiming = false; release('special'); }
  });
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
  canvas.addEventListener('wheel', (ev) => { wheel += Math.sign(ev.deltaY); ev.preventDefault(); }, { passive: false });

  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvasEl;
    if (!locked && hooks.onUnlock) hooks.onUnlock();
  });
  document.addEventListener('mousemove', (ev) => {
    if (!locked) return;
    lookDX += ev.movementX;
    lookDY += ev.movementY;
  });

  window.addEventListener('keydown', (ev) => {
    if (ev.repeat) return;
    const k = ev.key.toLowerCase();
    keys.add(k);
    input.anyPressed = true;
    if (k === ' ' || k === 'tab') ev.preventDefault();
    const role = KEY_ROLE[k];
    if (role) press(role);
    if (k === ' ') { keys3d.jump = true; keys3d.jumpHeld = true; }
    if (k === 'shift') shiftDown = performance.now() * 0.001;
    if (k === 'r') input.reloadPressed = true;
    if (k === 'tab') state3d.lockPressed = true;
    if (k >= '1' && k <= '4') input.spellCast = Number(k) - 1;
    if (k === 'escape' || k === 'p') input.pausePressed = true;
    if (hooks.onKey) hooks.onKey(k);
  });
  window.addEventListener('keyup', (ev) => {
    const k = ev.key.toLowerCase();
    keys.delete(k);
    const role = KEY_ROLE[k];
    if (role) release(role);
    // Godot cuts the rise on release, once - not every frame the key is up.
    if (k === ' ') { keys3d.jumpHeld = false; keys3d.jumpCut = true; }
    if (k === 'shift') {
      // Let go quickly and it was a roll; held, it was a sprint that has ended.
      if (performance.now() * 0.001 - shiftDown < SHIFT_TAP) press('dash');
      shiftDown = 0;
    }
  });
  window.addEventListener('blur', () => {
    keys.clear();
    shiftDown = 0;
    keys3d.jumpHeld = false;
    for (const role of ['attack', 'special', 'dash', 'grenade']) release(role);
  });
}

function press(role) {
  input[role] = true;
  input[`${role}Pressed`] = true;
}
function release(role) {
  input[role] = false;
}

/**
 * Called at the top of every tick, before the simulation runs.
 * `reticle()` returns the ground point the camera is looking at, or null.
 */
export const want = { x: 0, y: 0 };

export function updateInput3d(p, reticle) {
  // --- the camera: mouse look, stick look, zoom -------------------------------
  if (lookDX || lookDY) { rig.look(lookDX, lookDY); lookDX = 0; lookDY = 0; }
  if (pad.connected) {
    // The right stick looks; its own deadzone is already applied in gamepad.js.
    if (pad.aimActive) rig.look(pad.aim.x * pad.aimPush * 13, pad.aim.y * pad.aimPush * 13);
    if (pad.attack) press('attack'); else if (input.attack && !keys.has('j')) release('attack');
    if (pad.attackPressed) { input.attackPressed = true; pad.attackPressed = false; }
    if (pad.specialPressed) { input.specialPressed = true; pad.specialPressed = false; }
    if (pad.dashPressed) { input.dashPressed = true; pad.dashPressed = false; }
    if (pad.jumpPressed) { keys3d.jump = true; pad.jumpPressed = false; }
    keys3d.jumpHeld = keys3d.jumpHeld || !!pad.jump;
    if (pad.grenadePressed) { input.grenadePressed = true; pad.grenadePressed = false; }
    if (pad.reloadPressed) { input.reloadPressed = true; pad.reloadPressed = false; }
    if (pad.spellPressed !== null) { input.spellCast = pad.spellPressed; pad.spellPressed = null; }
  }
  if (wheel) { rig.zoom(wheel * 18); wheel = 0; }

  // --- movement, in the camera's frame ---------------------------------------
  const b = rig.basis();
  let fwd = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0);
  let side = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
  // The keyboard always wins. A stick that rests off-centre (this project's
  // own test pad sits at -0.51) would otherwise fight every key press and make
  // the controls feel reversed, so the pad is only read when no key is held
  // and the stick is pushed well past any plausible drift.
  const onKeys = fwd !== 0 || side !== 0;
  if (!onKeys && pad.connected && Math.hypot(pad.move.x, pad.move.y) > 0.5) {
    side += pad.move.x;
    fwd -= pad.move.y;
  }
  let mx = b.fx * fwd + b.rx * side;
  let my = b.fy * fwd + b.ry * side;
  const mag = Math.hypot(mx, my);
  if (mag > 1) { mx /= mag; my /= mag; }
  // move3d.js turns this into the eased, sprinting vector the simulation reads.
  want.x = mx;
  want.y = my;
  keys3d.sprintHeld = shiftDown > 0 && performance.now() * 0.001 - shiftDown >= SHIFT_TAP;
  keys3d.sprint = keys3d.sprintHeld;

  // --- aim: the way the camera looks, on the ground ---------------------------
  // (Lock-on will override this in a later milestone.)
  const [ax, ay] = normalize(b.fx, b.fy);
  input.aim.x = ax;
  input.aim.y = ay;
  input.aimActive = true;

  // Where a placed throw or spell lands: the point the camera is pointing at.
  const at = reticle ? reticle() : null;
  input.grenadeAbs = at ? { x: at.x, y: at.y } : null;
  input.grenadeVec.x = 0;
  input.grenadeVec.y = 0;
  input.specialVec.x = 0;
  input.specialVec.y = 0;
  // Reticle-placed spells are refused when padMode is set (spells.js), and the
  // touch layout is not in play at all here.
  input.touchMode = false;
  input.padMode = false;
}

/** Clear the one-frame edges this module owns, at the end of a tick. */
export function endFrame3d() {
  keys3d.jump = false;
  keys3d.jumpCut = false;
}

export function requestLook() {
  if (!locked) canvasEl?.requestPointerLock?.();
}

export function releaseLook() {
  if (locked) document.exitPointerLock?.();
}
