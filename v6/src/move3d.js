// Ground movement, jumping and the dodge roll.
//
// The feel is taken from the owner's Godot controller (D:\Gadot\test\player.gd)
// and kept in its terms: walk and sprint speeds, an acceleration you can feel,
// the body turning toward where it is travelling, a jump you can cut short by
// letting go, coyote time after walking off an edge, a buffered press that
// fires on landing, and reduced steering in the air.
//
// The simulation is untouched. Two tricks do it:
//   - Acceleration is applied to the *input vector* rather than to a velocity.
//     `updatePlayer` multiplies `input.move` by the walking speed, so easing
//     that vector from nothing up to full length gives the same curve as
//     easing a velocity would. The vector cannot go past one - the simulation
//     clamps it - so the sprint rides on `tuning.speed` instead, eased the
//     same way, which every other speed in the game already respects.
//   - Height is this module's own: the simulation's `p.z` already exists for
//     the maul's leap and the hop down a ledge, so a jump is gravity on `p.z`,
//     and the collisions stay flat and two-dimensional as they were.

import { input } from '../../v5/src/input.js';
import { tuning } from '../../v5/src/state.js';
import { clamp } from '../../v5/src/util.js';
import { burst } from '../../v5/src/fx.js';
import { sfx } from '../../v5/src/audio.js';

// Godot metres, at this game's scale: the player is 17 units across, so a
// 1.8 m person is about 54 units tall and a metre is about 30 units.
const M = 30;

export const MOVE = {
  walk: 2.9 * M,            // the Godot walk, a touch quicker
  sprint: 6.0 * M,
  accel: 12,                // how fast the input vector reaches its target
  turn: 12,                 // how fast the body turns toward travel
  jump: 8.2 * M,
  gravity: 9.81 * 2.04 * M, // the Godot gravity scale: a 1.6 m hop, 0.8 s of air
  jumpCut: 0.45,            // let go early and the rise is cut short
  airControl: 0.75,
  airDrag: 1.6,
  coyote: 0.12,
  buffer: 0.15,
};

const BASE = 268;              // player.js's BASE_SPEED

export function createMover() {
  return {
    vz: 0,                  // vertical speed, in units a second
    grounded: true,
    coyote: 0,
    buffer: 0,
    sprinting: false,
    ix: 0, iy: 0,           // the eased input direction, never longer than one
    speed: MOVE.walk,       // the eased speed, walk to sprint
    face: -Math.PI / 2,     // the way the body is turned
    ground: 0,              // the height of the ground under the feet
    landedAt: 0,
    jumpedAt: 0,
    // What the body should feel, for the animation: how hard it is speeding up
    // or braking, how fast it is turning, how hard it last landed, and how
    // recently it pushed off.
    accel: 0,
    turn: 0,
    impact: 0,
    pushOff: 0,
    lastSpeed: 0,
  };
}

/**
 * Called every tick, after the camera has written `input.move`.
 * want: { x, y } the raw camera-relative direction, magnitude 0..1.
 * keys: { jump, jumpHeld, sprint }
 */
export function updateMove(mv, p, dt, want, keys, heights, time) {
  if (!p || p.dead) return;

  const moving = Math.hypot(want.x, want.y) > 0.1;
  // Sprinting stops the moment you stop pushing, so it never silently resumes.
  if (!moving) mv.sprinting = false;
  else if (keys.sprint) mv.sprinting = true;
  else if (!keys.sprintHeld) mv.sprinting = false;

  // Acceleration, and much less authority in the air.
  const rate = (mv.grounded ? MOVE.accel : MOVE.accel * MOVE.airControl) * dt;
  const drag = mv.grounded ? MOVE.accel * dt : MOVE.airDrag * dt;
  mv.ix = moving ? approach(mv.ix, want.x, rate) : approach(mv.ix, 0, drag);
  mv.iy = moving ? approach(mv.iy, want.y, rate) : approach(mv.iy, 0, drag);

  // The walk-to-sprint change is eased too, so breaking into a run has weight.
  const wantSpeed = mv.sprinting ? MOVE.sprint : MOVE.walk;
  mv.speed = approach(mv.speed, wantSpeed, MOVE.accel * 26 * dt);
  tuning.speed = mv.speed / BASE;

  // How hard the body is speeding up or slowing down, 0..1 either way: the
  // travelled speed is the eased input vector times the eased speed.
  const travelling = Math.hypot(mv.ix, mv.iy) * mv.speed;
  const change = (travelling - mv.lastSpeed) / Math.max(dt, 1e-4);
  mv.lastSpeed = travelling;
  mv.accel += (clamp(change / 900, -1, 1) - mv.accel) * Math.min(1, dt * 9);

  // An attack plants the feet, exactly as the Godot controller does.
  const plant = p.attack && mv.grounded ? 0.15 : 1;
  input.move.x = mv.ix * plant;
  input.move.y = mv.iy * plant;

  // --- the body turns toward where it is going ------------------------------
  // The turn is not instant: the figure leans into it, and how sharply it is
  // turning is handed to the animation so it can bank.
  const before = mv.face;
  if (Math.hypot(mv.ix, mv.iy) > 0.12) {
    const wantFace = Math.atan2(mv.iy, mv.ix);
    mv.face = turnToward(mv.face, wantFace, MOVE.turn * dt);
  }
  let spun = mv.face - before;
  while (spun > Math.PI) spun -= Math.PI * 2;
  while (spun < -Math.PI) spun += Math.PI * 2;
  mv.turn += (clamp(spun / Math.max(dt, 1e-4) / MOVE.turn, -1, 1) - mv.turn) * Math.min(1, dt * 10);
  mv.pushOff = Math.max(0, mv.pushOff - dt * 7);
  mv.impact = Math.max(0, mv.impact - dt * 3.5);

  // --- height: jumping, falling, landing ------------------------------------
  const ground = heights.at(p.x, p.y);
  mv.ground = ground;
  const wasGrounded = mv.grounded;

  // The maul's leap and the hop down a ledge own `p.z` while they run.
  if (p.leap || p.hop) {
    mv.vz = 0;
    mv.grounded = false;
    mv.coyote = 0;
    return;
  }

  mv.coyote = mv.grounded ? MOVE.coyote : Math.max(0, mv.coyote - dt);
  mv.buffer = Math.max(0, mv.buffer - dt);
  if (keys.jump) mv.buffer = MOVE.buffer;

  if (mv.buffer > 0 && mv.coyote > 0 && !p.dashing) {
    mv.vz = MOVE.jump;
    mv.buffer = 0;
    mv.coyote = 0;
    mv.grounded = false;
    mv.jumpedAt = time;
    mv.pushOff = 1;                 // the legs drive the body up for a moment
    sfx.dash();
    burst(p.x, p.y, { count: 8, color: '#cfc6b4', speed: 130, size: 3, life: 0.35, drag: 5 });
  }

  if (!mv.grounded) {
    // Variable height: let go of the button while still rising and the jump is
    // cut short - once, on the release, as the Godot controller does it.
    if (mv.vz > 0 && keys.jumpCut) mv.vz *= MOVE.jumpCut;
    mv.vz -= MOVE.gravity * dt;
    p.z = (p.z || 0) + mv.vz * dt;
    if (p.z <= 0) {
      p.z = 0;
      const hard = mv.vz < -MOVE.jump * 0.7;
      // How hard this landing was, for the animation's absorb.
      mv.impact = clamp(-mv.vz / MOVE.jump, 0, 1.4);
      mv.vz = 0;
      mv.grounded = true;
      mv.landedAt = time;
      if (!wasGrounded) {
        sfx.thud();
        burst(p.x, p.y, {
          count: hard ? 12 : 6, color: '#cfc6b4', speed: hard ? 190 : 120,
          size: 3, life: 0.4, drag: 5,
        });
      }
    }
  } else {
    p.z = 0;
    // Walking off an edge: fall rather than float.
    mv.grounded = true;
  }

  // Stepping off a height (the plateau's side, or a slope's lip) starts a fall.
  if (mv.grounded && !p.hop && !p.leap) {
    const drop = mv.lastGround === undefined ? 0 : mv.lastGround - ground;
    if (drop > 14) {
      mv.grounded = false;
      mv.vz = 0;
      p.z = drop;                 // step out into the air at the old height
    }
  }
  mv.lastGround = ground;
}

function approach(v, target, step) {
  if (v < target) return Math.min(v + step, target);
  if (v > target) return Math.max(v - step, target);
  return v;
}

function turnToward(from, to, step) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return from + clamp(d, -step, step);
}
