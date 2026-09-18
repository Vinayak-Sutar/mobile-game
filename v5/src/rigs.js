// Character rigs and their animation clips.
//
// The view is straight top-down, so the whole rig rotates with the character's
// facing and limbs swing in that local frame: +X is "forward", -Y is the
// character's left. Everything is authored at roughly the player's 17px body
// radius; at that size fewer, chunkier bones read far better than an anatomical
// skeleton.

import { makeSkeleton, makeClip, Animator, resolvePose, drawSkeleton, Ease, boneAt } from './anim.js';
import { TAU, clamp, lerp, angleDiff } from './util.js';

const INK = '#ece0ff';      // lit body mass
const SHADE = '#3b2b52';    // limbs, kept darker than the torso
const DARK = '#241633';     // hood
const CLOAK = '#38234f';   // readable against the floor, still clearly shadow

// --- player ----------------------------------------------------------------

export const PLAYER_SKELETON = makeSkeleton([
  { name: 'root', shape: 'none' },

  // Cloak: deliberately narrower and shorter than the torso. Any bigger and
  // it stops reading as a garment and becomes a second body.
  { name: 'cloakA', parent: 'root', x: -7, angle: Math.PI, len: 8, thick: 7, taper: 0.8, shape: 'cloak', color: CLOAK, z: -4 },
  { name: 'cloakB', parent: 'cloakA', x: 8, len: 7, thick: 5.6, taper: 0.25, shape: 'cloak', color: '#271738', z: -5 },

  // Legs sit behind the body mass: from directly above you only catch them
  // swinging past the silhouette, which is exactly what sells a stride.
  { name: 'legL', parent: 'root', x: -5, y: -4, angle: -2.7, len: 6, thick: 2.6, color: SHADE, z: -1 },
  { name: 'legR', parent: 'root', x: -5, y: 4, angle: 2.7, len: 6, thick: 2.6, color: SHADE, z: -1 },

  // The dominant read: one big lit oval for the cloaked shoulders.
  { name: 'torso', parent: 'root', x: -8, len: 17, thick: 10.5, shape: 'blob', color: INK, z: 0 },

  { name: 'armL', parent: 'root', x: 0.5, y: -6.8, angle: -0.3, len: 7, thick: 2.6, color: SHADE, z: 1 },
  { name: 'armR', parent: 'root', x: 0.5, y: 6.8, angle: 0.3, len: 7.5, thick: 2.8, color: SHADE, z: 3 },

  // Hood opening: small enough that a thick lit ring survives all the way
  // round, which is what makes the figure read as a body and not a crescent.
  { name: 'head', parent: 'root', x: 1.5, shape: 'circle', thick: 3.8, color: DARK, z: 2 },
  { name: 'visor', parent: 'head', x: 2.0, len: 3.6, thick: 1.6, color: '#ff9a5a', z: 4 },
]);

const K = (t, v, ease) => ({ t, ...v, ease });

export const PLAYER_CLIPS = {
  idle: makeClip({
    name: 'idle',
    duration: 2.4,
    tracks: {
      torso: [K(0, { sy: 1 }), K(1.2, { sy: 1.05, sx: 0.99 }), K(2.4, { sy: 1 })],
      head: [K(0, { x: 0 }), K(1.2, { x: 0.6 }), K(2.4, { x: 0 })],
      armL: [K(0, { angle: 0 }), K(1.2, { angle: 0.09 }), K(2.4, { angle: 0 })],
      armR: [K(0, { angle: 0 }), K(1.2, { angle: -0.09 }), K(2.4, { angle: 0 })],
      cloakA: [K(0, { angle: 0 }), K(0.8, { angle: 0.06 }), K(1.7, { angle: -0.06 }), K(2.4, { angle: 0 })],
      cloakB: [K(0, { angle: 0 }), K(0.9, { angle: -0.09 }), K(1.8, { angle: 0.09 }), K(2.4, { angle: 0 })],
      legL: [K(0, { angle: 0 }), K(1.2, { angle: 0.04 }), K(2.4, { angle: 0 })],
      legR: [K(0, { angle: 0 }), K(1.2, { angle: -0.04 }), K(2.4, { angle: 0 })],
    },
  }),

  // One full stride. Legs alternate forward/back, arms counter-swing, and the
  // body bobs twice per cycle — once per footfall.
  run: makeClip({
    name: 'run',
    duration: 0.54,
    tracks: {
      legL: [
        K(0, { angle: 0.75 }, 'inOutQuad'),
        K(0.27, { angle: -0.75 }, 'inOutQuad'),
        K(0.54, { angle: 0.75 }, 'inOutQuad'),
      ],
      legR: [
        K(0, { angle: -0.75 }, 'inOutQuad'),
        K(0.27, { angle: 0.75 }, 'inOutQuad'),
        K(0.54, { angle: -0.75 }, 'inOutQuad'),
      ],
      armL: [
        K(0, { angle: -0.45 }, 'inOutQuad'),
        K(0.27, { angle: 0.5 }, 'inOutQuad'),
        K(0.54, { angle: -0.45 }, 'inOutQuad'),
      ],
      armR: [
        K(0, { angle: 0.45 }, 'inOutQuad'),
        K(0.27, { angle: -0.5 }, 'inOutQuad'),
        K(0.54, { angle: 0.45 }, 'inOutQuad'),
      ],
      torso: [
        K(0, { y: 0, sy: 1 }),
        K(0.135, { y: -0.9, sy: 1.04 }),
        K(0.27, { y: 0, sy: 1 }),
        K(0.405, { y: 0.9, sy: 1.04 }),
        K(0.54, { y: 0, sy: 1 }),
      ],
      head: [K(0, { y: 0 }), K(0.135, { y: -0.5 }), K(0.27, { y: 0 }), K(0.405, { y: 0.5 }), K(0.54, { y: 0 })],
      cloakA: [
        K(0, { angle: 0.16 }, 'inOutQuad'),
        K(0.27, { angle: -0.16 }, 'inOutQuad'),
        K(0.54, { angle: 0.16 }, 'inOutQuad'),
      ],
      cloakB: [
        K(0, { angle: -0.24 }, 'inOutQuad'),
        K(0.27, { angle: 0.24 }, 'inOutQuad'),
        K(0.54, { angle: -0.24 }, 'inOutQuad'),
      ],
    },
  }),

  dash: makeClip({
    name: 'dash',
    duration: 0.3,
    loop: false,
    tracks: {
      torso: [K(0, { sx: 1, sy: 1 }), K(0.06, { sx: 1.28, sy: 0.82 }, 'outQuad'), K(0.3, { sx: 1, sy: 1 }, 'outCubic')],
      // Limbs sweep back into the slipstream.
      legL: [K(0, { angle: 0 }), K(0.06, { angle: 0.85 }, 'outQuad'), K(0.3, { angle: 0 }, 'outCubic')],
      legR: [K(0, { angle: 0 }), K(0.06, { angle: -0.85 }, 'outQuad'), K(0.3, { angle: 0 }, 'outCubic')],
      armL: [K(0, { angle: 0 }), K(0.06, { angle: 0.9 }, 'outQuad'), K(0.3, { angle: 0 }, 'outCubic')],
      armR: [K(0, { angle: 0 }), K(0.06, { angle: -0.9 }, 'outQuad'), K(0.3, { angle: 0 }, 'outCubic')],
      cloakA: [K(0, { angle: 0, sx: 1 }), K(0.08, { angle: 0, sx: 1.5 }, 'outQuad'), K(0.3, { angle: 0, sx: 1 }, 'outCubic')],
      cloakB: [K(0, { angle: 0, sx: 1 }), K(0.08, { angle: 0, sx: 1.6 }, 'outQuad'), K(0.3, { angle: 0, sx: 1 }, 'outCubic')],
      head: [K(0, { x: 0 }), K(0.06, { x: 1.6 }, 'outQuad'), K(0.3, { x: 0 }, 'outCubic')],
    },
  }),

  hurt: makeClip({
    name: 'hurt',
    duration: 0.34,
    loop: false,
    tracks: {
      torso: [K(0, { sx: 1, sy: 1 }), K(0.05, { sx: 0.82, sy: 1.22 }, 'outQuad'), K(0.34, { sx: 1, sy: 1 }, 'outElastic')],
      head: [K(0, { x: 0 }), K(0.05, { x: -2.2 }, 'outQuad'), K(0.34, { x: 0 }, 'outElastic')],
      armL: [K(0, { angle: 0 }), K(0.05, { angle: -0.8 }, 'outQuad'), K(0.34, { angle: 0 }, 'outCubic')],
      armR: [K(0, { angle: 0 }), K(0.05, { angle: 0.8 }, 'outQuad'), K(0.34, { angle: 0 }, 'outCubic')],
      cloakA: [K(0, { angle: 0 }), K(0.06, { angle: 0.3 }, 'outQuad'), K(0.34, { angle: 0 }, 'outElastic')],
    },
  }),

  death: makeClip({
    name: 'death',
    duration: 0.9,
    loop: false,
    tracks: {
      torso: [K(0, { sx: 1, sy: 1 }), K(0.18, { sx: 1.3, sy: 1.3 }, 'outQuad'), K(0.9, { sx: 0.5, sy: 0.5 }, 'inCubic')],
      head: [K(0, { x: 0, sx: 1 }), K(0.9, { x: -4, sx: 0.4 }, 'inCubic')],
      armL: [K(0, { angle: 0 }), K(0.25, { angle: -1.6 }, 'outQuad'), K(0.9, { angle: -2.4, sx: 0.4 }, 'inCubic')],
      armR: [K(0, { angle: 0 }), K(0.25, { angle: 1.6 }, 'outQuad'), K(0.9, { angle: 2.4, sx: 0.4 }, 'inCubic')],
      legL: [K(0, { angle: 0 }), K(0.9, { angle: -1.1, sx: 0.4 }, 'inCubic')],
      legR: [K(0, { angle: 0 }), K(0.9, { angle: 1.1, sx: 0.4 }, 'inCubic')],
      cloakA: [K(0, { sx: 1 }), K(0.9, { sx: 0.3 }, 'inCubic')],
      cloakB: [K(0, { sx: 1 }), K(0.9, { sx: 0.2 }, 'inCubic')],
    },
  }),
};

export function createPlayerAnimator() {
  const a = new Animator(PLAYER_SKELETON);
  a.play(PLAYER_CLIPS.idle, { fade: 0 });
  return a;
}

/**
 * Choose the clip for this frame and layer procedural motion on top:
 * the weapon arm is driven by the attack state machine, not by keyframes,
 * so it always lines up with the hitbox that actually deals damage.
 */
export function updatePlayerAnim(p, dt) {
  const a = p.anim;
  if (!a) return;

  const moving = Math.hypot(p.vx, p.vy) > 4 || p.moveMag > 0.08;

  if (p.dead) {
    if (a.clip !== PLAYER_CLIPS.death) a.play(PLAYER_CLIPS.death, { fade: 0.05 });
  } else if (p.dashing) {
    if (a.clip !== PLAYER_CLIPS.dash) a.play(PLAYER_CLIPS.dash, { fade: 0.04, restart: true });
  } else if (p.hurtFlash > 0.24) {
    if (a.clip !== PLAYER_CLIPS.hurt) a.play(PLAYER_CLIPS.hurt, { fade: 0.03, restart: true });
  } else if (moving) {
    // Stride rate follows actual speed so the feet never skate.
    a.play(PLAYER_CLIPS.run, { fade: 0.11, speed: clamp(0.7 + p.moveMag * 0.7, 0.7, 1.6) });
  } else if (a.clip === PLAYER_CLIPS.run || a.clip === PLAYER_CLIPS.idle || a.finished) {
    a.play(PLAYER_CLIPS.idle, { fade: 0.16 });
  }

  a.update(dt);

  // --- procedural layer ---------------------------------------------------
  // Body faces the aim; strafing leans the torso into the movement.
  const lean = p.moveMag > 0.05 ? angleDiff(p.aimAngle, p.moveAngle) : 0;
  a.offset('torso', { angle: clamp(lean, -0.5, 0.5) * 0.28 });
  a.offset('cloakA', { angle: clamp(lean, -0.7, 0.7) * -0.3 });

  // Weapon arm follows the swing arc computed by the attack state machine.
  const swing = weaponArmAngle(p);
  a.set('armR', { angle: swing.angle });
  a.offset('armR', { sx: swing.reach });
  if (p.charging) a.offset('armL', { angle: -0.35 });
}

/** Local angle for the weapon arm, in the root's (aim-aligned) frame. */
function weaponArmAngle(p) {
  const at = p.attack;
  if (!at) {
    return { angle: p.charging ? 0.12 : 0.5, reach: p.charging ? 1.15 : 1 };
  }
  const total = (at.step[at.phase] || 0.001) / p.stats.attackSpeed;
  const k = clamp(1 - at.t / total, 0, 1);
  // Local frame is already rotated to aimAngle, so only the offset from the
  // attack's own angle matters.
  const base = angleDiff(p.aimAngle, at.angle);

  if (at.phase === 'windup') return { angle: base + 1.1 - k * 0.5, reach: 0.85 + k * 0.1 };
  if (at.phase === 'active') return { angle: base + 0.6 - k * 1.5, reach: 1.18 };
  return { angle: base - 0.8 + k * 1.2, reach: 1.12 - k * 0.12 };
}

// Drawn slightly larger than the 17px collision radius. A visual that reads a
// touch bigger than its hitbox is standard and forgiving.
const RIG_SCALE = 1.18;

export function drawPlayerRig(p, ctx, { bob = 0 } = {}) {
  const root = { x: p.x, y: p.y + bob, angle: p.aimAngle, scale: RIG_SCALE };
  const world = resolvePose(PLAYER_SKELETON, p.anim.pose, root);

  const flashing = p.hurtFlash > 0 && Math.sin(performance.now() * 0.06) > 0;
  const palette = { visor: p.weapon.color };
  const alpha = p.invuln > 0 && !p.dashing ? 0.62 : 1;

  // Dark rim first, so the silhouette holds against any floor tone.
  drawSkeleton(ctx, world, { tint: '#0b0712', grow: 1.5, alpha: alpha * 0.9 });
  drawSkeleton(ctx, world, { tint: flashing ? '#ffffff' : null, alpha, palette });

  return world;
}

/** The rig's pose in world space without drawing it (the Wanderer reads it). */
export function playerWorld(p, bob = 0) {
  return resolvePose(PLAYER_SKELETON, p.anim.pose, { x: p.x, y: p.y + bob, angle: p.aimAngle, scale: RIG_SCALE });
}

export function playerHandTransform(p, world) {
  return boneAt(world, PLAYER_SKELETON, 'armR');
}
