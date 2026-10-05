// Enemy rigs and clips.
//
// Every clip is chosen by the enemy's own state machine, so the animation and
// the hitbox always agree. The important ones are the telegraph poses: a brute
// raising both arms or a wretch opening its jaws is the player's cue to dodge,
// and that cue has to be legible at 25px.
//
// Rigs are authored at each type's reference radius (ENEMY_DEFS[type].r) and
// scaled by e.r / ref at draw time, so elites and splitter spawns just work.

import { makeSkeleton, makeClip, Animator, resolvePose, drawSkeleton } from './anim.js';
import { clamp } from './util.js';
import { BOSS_RIGS } from './boss-rigs.js';

const K = (t, v, ease) => ({ t, ...v, ease });

/** Lighten (amt > 0) or darken (amt < 0) a hex colour. */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) =>
    clamp(Math.round(c + amt * 255), 0, 255));
  return `#${((ch[0] << 16) | (ch[1] << 8) | ch[2]).toString(16).padStart(6, '0')}`;
}

// Bone colours are written as role names and resolved per-instance, so each
// enemy keeps the palette the gameplay already trained the player on.
const ROLE = { MAIN: 'main', DARK: 'dark', LIGHT: 'light', ACCENT: 'accent' };

function paletteFor(rig, e) {
  const base = e.tint || e.color;
  const out = {};
  for (const b of rig.skeleton.bones) {
    switch (b.color) {
      case ROLE.MAIN: out[b.name] = base; break;
      case ROLE.DARK: out[b.name] = shade(e.color, -0.22); break;
      case ROLE.LIGHT: out[b.name] = shade(e.color, 0.22); break;
      case ROLE.ACCENT: out[b.name] = '#fff2b0'; break;
      default: break;
    }
  }
  return out;
}

// --- wretch: skittering biter ---------------------------------------------
// The jaws are the whole telegraph — wide open means a lunge is coming.

const wretch = {
  ref: 15,
  skeleton: makeSkeleton([
    { name: 'root', shape: 'none' },
    { name: 'legL', parent: 'root', x: -3, y: -4, angle: -2.3, len: 6, thick: 1.7, color: ROLE.DARK, z: -1 },
    { name: 'legR', parent: 'root', x: -3, y: 4, angle: 2.3, len: 6, thick: 1.7, color: ROLE.DARK, z: -1 },
    { name: 'body', parent: 'root', x: -7, len: 12, thick: 6.6, shape: 'blob', color: ROLE.MAIN, z: 0 },
    { name: 'jawT', parent: 'root', x: 2.5, y: -1.5, angle: -0.3, len: 7.5, thick: 2.2, color: ROLE.MAIN, z: 1 },
    { name: 'jawB', parent: 'root', x: 2.5, y: 1.5, angle: 0.3, len: 7.5, thick: 2.2, color: ROLE.MAIN, z: 1 },
    { name: 'eye', parent: 'root', x: -1, shape: 'circle', thick: 1.7, color: ROLE.ACCENT, z: 2 },
  ]),
  clips: {
    move: makeClip({
      name: 'move', duration: 0.26,
      tracks: {
        legL: [K(0, { angle: 0.5 }), K(0.13, { angle: -0.5 }), K(0.26, { angle: 0.5 })],
        legR: [K(0, { angle: -0.5 }), K(0.13, { angle: 0.5 }), K(0.26, { angle: -0.5 })],
        body: [K(0, { sy: 1 }), K(0.13, { sy: 1.08, sx: 0.96 }), K(0.26, { sy: 1 })],
        jawT: [K(0, { angle: 0 }), K(0.13, { angle: -0.12 }), K(0.26, { angle: 0 })],
        jawB: [K(0, { angle: 0 }), K(0.13, { angle: 0.12 }), K(0.26, { angle: 0 })],
      },
    }),
    windup: makeClip({
      name: 'windup', duration: 0.34, loop: false,
      tracks: {
        // Jaws gape and the body coils back: unmissable, and it lasts exactly
        // as long as the state does.
        jawT: [K(0, { angle: 0 }), K(0.34, { angle: -0.95 }, 'outBack')],
        jawB: [K(0, { angle: 0 }), K(0.34, { angle: 0.95 }, 'outBack')],
        body: [K(0, { sx: 1 }), K(0.34, { sx: 0.82, sy: 1.16 }, 'outQuad')],
        legL: [K(0, { angle: 0 }), K(0.34, { angle: 0.7 }, 'outQuad')],
        legR: [K(0, { angle: 0 }), K(0.34, { angle: -0.7 }, 'outQuad')],
        eye: [K(0, { sx: 1, sy: 1 }), K(0.34, { sx: 1.7, sy: 1.7 }, 'outQuad')],
      },
    }),
    lunge: makeClip({
      name: 'lunge', duration: 0.26, loop: false,
      tracks: {
        jawT: [K(0, { angle: -0.95 }), K(0.07, { angle: 0.12 }, 'outQuad'), K(0.26, { angle: 0 })],
        jawB: [K(0, { angle: 0.95 }), K(0.07, { angle: -0.12 }, 'outQuad'), K(0.26, { angle: 0 })],
        body: [K(0, { sx: 0.82, sy: 1.16 }), K(0.07, { sx: 1.3, sy: 0.85 }, 'outQuad'), K(0.26, { sx: 1, sy: 1 })],
        legL: [K(0, { angle: 0.7 }), K(0.26, { angle: -0.4 }, 'outQuad')],
        legR: [K(0, { angle: -0.7 }), K(0.26, { angle: 0.4 }, 'outQuad')],
      },
    }),
  },
  clipFor: (e) => (e.state === 'windup' ? 'windup' : e.state === 'lunge' ? 'lunge' : 'move'),
};

// --- slinger: kiting shooter ----------------------------------------------

const slinger = {
  ref: 15,
  skeleton: makeSkeleton([
    { name: 'root', shape: 'none' },
    { name: 'finL', parent: 'root', x: -4, y: -3, angle: -2.5, len: 8, thick: 2.2, color: ROLE.DARK, z: -1 },
    { name: 'finR', parent: 'root', x: -4, y: 3, angle: 2.5, len: 8, thick: 2.2, color: ROLE.DARK, z: -1 },
    { name: 'body', parent: 'root', x: -7, len: 13, thick: 6.4, shape: 'blob', color: ROLE.MAIN, z: 0 },
    { name: 'barrel', parent: 'root', x: 2, len: 9, thick: 2.6, color: ROLE.LIGHT, z: 1 },
    { name: 'muzzle', parent: 'barrel', x: 9, shape: 'circle', thick: 2.2, color: ROLE.ACCENT, z: 2 },
  ]),
  clips: {
    move: makeClip({
      name: 'move', duration: 0.9,
      tracks: {
        finL: [K(0, { angle: 0 }), K(0.45, { angle: 0.3 }), K(0.9, { angle: 0 })],
        finR: [K(0, { angle: 0 }), K(0.45, { angle: -0.3 }), K(0.9, { angle: 0 })],
        body: [K(0, { sy: 1 }), K(0.45, { sy: 1.05 }), K(0.9, { sy: 1 })],
        muzzle: [K(0, { sx: 0.7, sy: 0.7 }), K(0.9, { sx: 0.7, sy: 0.7 })],
      },
    }),
    aim: makeClip({
      name: 'aim', duration: 0.42, loop: false,
      tracks: {
        // Barrel draws back and the muzzle swells as the shot charges.
        barrel: [K(0, { x: 0 }), K(0.42, { x: -3 }, 'outQuad')],
        muzzle: [K(0, { sx: 0.7, sy: 0.7 }), K(0.42, { sx: 1.9, sy: 1.9 }, 'outQuad')],
        body: [K(0, { sx: 1 }), K(0.42, { sx: 0.94, sy: 1.08 }, 'outQuad')],
        finL: [K(0, { angle: 0 }), K(0.42, { angle: -0.5 }, 'outQuad')],
        finR: [K(0, { angle: 0 }), K(0.42, { angle: 0.5 }, 'outQuad')],
      },
    }),
    fire: makeClip({
      name: 'fire', duration: 0.4, loop: false,
      tracks: {
        barrel: [K(0, { x: -3 }), K(0.05, { x: 3 }, 'outQuad'), K(0.4, { x: 0 }, 'outCubic')],
        muzzle: [K(0, { sx: 1.9, sy: 1.9 }), K(0.4, { sx: 0.7, sy: 0.7 }, 'outCubic')],
        body: [K(0, { sx: 0.94, sy: 1.08 }), K(0.4, { sx: 1, sy: 1 }, 'outElastic')],
      },
    }),
  },
  clipFor: (e) => (e.state === 'aim' ? 'aim' : e.state === 'fire' ? 'fire' : 'move'),
};

// --- brute: telegraphed slam ----------------------------------------------

const brute = {
  ref: 27,
  skeleton: makeSkeleton([
    { name: 'root', shape: 'none' },
    { name: 'legL', parent: 'root', x: -6, y: -8, angle: -2.4, len: 9, thick: 3.4, color: ROLE.DARK, z: -1 },
    { name: 'legR', parent: 'root', x: -6, y: 8, angle: 2.4, len: 9, thick: 3.4, color: ROLE.DARK, z: -1 },
    { name: 'body', parent: 'root', x: -13, len: 25, thick: 14, shape: 'blob', color: ROLE.MAIN, z: 0 },
    { name: 'armL', parent: 'root', x: 1, y: -12, angle: -0.5, len: 13, thick: 4.4, color: ROLE.DARK, z: 1 },
    { name: 'armR', parent: 'root', x: 1, y: 12, angle: 0.5, len: 13, thick: 4.4, color: ROLE.DARK, z: 1 },
    { name: 'fistL', parent: 'armL', x: 13, shape: 'circle', thick: 5.2, color: ROLE.LIGHT, z: 2 },
    { name: 'fistR', parent: 'armR', x: 13, shape: 'circle', thick: 5.2, color: ROLE.LIGHT, z: 2 },
    { name: 'core', parent: 'root', x: 2, shape: 'circle', thick: 5, color: ROLE.DARK, z: 3 },
  ]),
  clips: {
    walk: makeClip({
      name: 'walk', duration: 0.9,
      tracks: {
        legL: [K(0, { angle: 0.4 }), K(0.45, { angle: -0.4 }), K(0.9, { angle: 0.4 })],
        legR: [K(0, { angle: -0.4 }), K(0.45, { angle: 0.4 }), K(0.9, { angle: -0.4 })],
        armL: [K(0, { angle: -0.15 }), K(0.45, { angle: 0.2 }), K(0.9, { angle: -0.15 })],
        armR: [K(0, { angle: 0.15 }), K(0.45, { angle: -0.2 }), K(0.9, { angle: 0.15 })],
        body: [K(0, { y: 0, sy: 1 }), K(0.225, { y: -1.6, sy: 1.03 }), K(0.45, { y: 0, sy: 1 }),
               K(0.675, { y: 1.6, sy: 1.03 }), K(0.9, { y: 0, sy: 1 })],
      },
    }),
    wind: makeClip({
      name: 'wind', duration: 0.78, loop: false,
      tracks: {
        // Both fists sweep up and out over the full 0.78s telegraph, then the
        // body coils. This is the single most important read in the game.
        armL: [K(0, { angle: -0.15 }), K(0.78, { angle: -1.5, sx: 1.15 }, 'outQuad')],
        armR: [K(0, { angle: 0.15 }), K(0.78, { angle: 1.5, sx: 1.15 }, 'outQuad')],
        fistL: [K(0, { sx: 1, sy: 1 }), K(0.78, { sx: 1.5, sy: 1.5 }, 'outQuad')],
        fistR: [K(0, { sx: 1, sy: 1 }), K(0.78, { sx: 1.5, sy: 1.5 }, 'outQuad')],
        body: [K(0, { sx: 1, sy: 1 }), K(0.78, { sx: 0.9, sy: 1.14 }, 'outQuad')],
        core: [K(0, { sx: 1, sy: 1 }), K(0.78, { sx: 1.8, sy: 1.8 }, 'inQuad')],
      },
    }),
    recover: makeClip({
      name: 'recover', duration: 0.85, loop: false,
      tracks: {
        armL: [K(0, { angle: -1.5 }), K(0.09, { angle: 0.5 }, 'outQuad'), K(0.85, { angle: -0.15 }, 'outCubic')],
        armR: [K(0, { angle: 1.5 }), K(0.09, { angle: -0.5 }, 'outQuad'), K(0.85, { angle: 0.15 }, 'outCubic')],
        fistL: [K(0, { sx: 1.5, sy: 1.5 }), K(0.85, { sx: 1, sy: 1 }, 'outCubic')],
        fistR: [K(0, { sx: 1.5, sy: 1.5 }), K(0.85, { sx: 1, sy: 1 }, 'outCubic')],
        body: [K(0, { sx: 0.9, sy: 1.14 }), K(0.09, { sx: 1.22, sy: 0.84 }, 'outQuad'),
               K(0.85, { sx: 1, sy: 1 }, 'outElastic')],
        core: [K(0, { sx: 1.8, sy: 1.8 }), K(0.85, { sx: 1, sy: 1 }, 'outCubic')],
      },
    }),
  },
  clipFor: (e) => (e.state === 'wind' ? 'wind' : e.state === 'recover' ? 'recover' : 'walk'),
};

// --- charger: line charge --------------------------------------------------

const charger = {
  ref: 20,
  skeleton: makeSkeleton([
    { name: 'root', shape: 'none' },
    { name: 'legL', parent: 'root', x: -5, y: -5, angle: -2.4, len: 7, thick: 2.4, color: ROLE.DARK, z: -1 },
    { name: 'legR', parent: 'root', x: -5, y: 5, angle: 2.4, len: 7, thick: 2.4, color: ROLE.DARK, z: -1 },
    { name: 'body', parent: 'root', x: -11, len: 20, thick: 9, shape: 'blob', color: ROLE.MAIN, z: 0 },
    { name: 'hornL', parent: 'root', x: 5, y: -5, angle: -0.42, len: 11, thick: 2.4, color: ROLE.LIGHT, z: 1 },
    { name: 'hornR', parent: 'root', x: 5, y: 5, angle: 0.42, len: 11, thick: 2.4, color: ROLE.LIGHT, z: 1 },
    { name: 'eye', parent: 'root', x: 2, shape: 'circle', thick: 2.4, color: ROLE.ACCENT, z: 2 },
  ]),
  clips: {
    walk: makeClip({
      name: 'walk', duration: 0.7,
      tracks: {
        legL: [K(0, { angle: 0.45 }), K(0.35, { angle: -0.45 }), K(0.7, { angle: 0.45 })],
        legR: [K(0, { angle: -0.45 }), K(0.35, { angle: 0.45 }), K(0.7, { angle: -0.45 })],
        body: [K(0, { sy: 1 }), K(0.35, { sy: 1.05, sx: 0.98 }), K(0.7, { sy: 1 })],
      },
    }),
    aim: makeClip({
      name: 'aim', duration: 0.62, loop: false,
      tracks: {
        // Horns drop and converge, body pulls back — it visibly loads up.
        hornL: [K(0, { angle: 0 }), K(0.62, { angle: 0.34, sx: 1.2 }, 'outQuad')],
        hornR: [K(0, { angle: 0 }), K(0.62, { angle: -0.34, sx: 1.2 }, 'outQuad')],
        body: [K(0, { x: 0, sx: 1 }), K(0.62, { x: -3, sx: 0.88, sy: 1.12 }, 'outQuad')],
        eye: [K(0, { sx: 1, sy: 1 }), K(0.62, { sx: 1.6, sy: 1.6 }, 'inQuad')],
        legL: [K(0, { angle: 0 }), K(0.31, { angle: 0.6 }), K(0.62, { angle: 0.2 })],
        legR: [K(0, { angle: 0 }), K(0.31, { angle: -0.6 }), K(0.62, { angle: -0.2 })],
      },
    }),
    charge: makeClip({
      name: 'charge', duration: 0.35,
      tracks: {
        body: [K(0, { x: 0, sx: 1.35, sy: 0.85 }), K(0.35, { x: 0, sx: 1.35, sy: 0.85 })],
        hornL: [K(0, { angle: 0.34 }), K(0.35, { angle: 0.34 })],
        hornR: [K(0, { angle: -0.34 }), K(0.35, { angle: -0.34 })],
        legL: [K(0, { angle: 0.9 }), K(0.175, { angle: -0.9 }), K(0.35, { angle: 0.9 })],
        legR: [K(0, { angle: -0.9 }), K(0.175, { angle: 0.9 }), K(0.35, { angle: -0.9 })],
      },
    }),
    stun: makeClip({
      name: 'stun', duration: 1.05, loop: false,
      tracks: {
        // Horns droop and the whole body wobbles: the "hit me now" window.
        hornL: [K(0, { angle: 0.34 }), K(0.2, { angle: -0.5 }, 'outBack'), K(1.05, { angle: -0.4 })],
        hornR: [K(0, { angle: -0.34 }), K(0.2, { angle: 0.5 }, 'outBack'), K(1.05, { angle: 0.4 })],
        body: [K(0, { sx: 1.35, sy: 0.85 }), K(0.15, { sx: 0.86, sy: 1.16 }, 'outQuad'),
               K(0.5, { sx: 1.06, sy: 0.95 }), K(1.05, { sx: 1, sy: 1 }, 'outElastic')],
        eye: [K(0, { sx: 1.6, sy: 1.6 }), K(0.2, { sx: 0.4, sy: 0.4 }, 'outQuad'), K(1.05, { sx: 0.4, sy: 0.4 })],
        legL: [K(0, { angle: 0 }), K(0.3, { angle: -0.8 }), K(1.05, { angle: -0.6 })],
        legR: [K(0, { angle: 0 }), K(0.3, { angle: 0.8 }), K(1.05, { angle: 0.6 })],
      },
    }),
  },
  clipFor: (e) => (e.state === 'aim' ? 'aim' : e.state === 'charge' ? 'charge'
    : e.state === 'stun' ? 'stun' : 'walk'),
};

// --- bomber: suicide blast -------------------------------------------------

const bomber = {
  ref: 16,
  skeleton: makeSkeleton([
    { name: 'root', shape: 'none' },
    { name: 'finL', parent: 'root', x: -2, y: -6, angle: -1.9, len: 8, thick: 2, color: ROLE.DARK, z: -1 },
    { name: 'finR', parent: 'root', x: -2, y: 6, angle: 1.9, len: 8, thick: 2, color: ROLE.DARK, z: -1 },
    { name: 'body', parent: 'root', shape: 'circle', thick: 8.4, color: ROLE.MAIN, z: 0 },
    { name: 'core', parent: 'root', shape: 'circle', thick: 3.4, color: ROLE.ACCENT, z: 1 },
  ]),
  clips: {
    float: makeClip({
      name: 'float', duration: 1.1,
      tracks: {
        finL: [K(0, { angle: 0 }), K(0.55, { angle: 0.45 }), K(1.1, { angle: 0 })],
        finR: [K(0, { angle: 0 }), K(0.55, { angle: -0.45 }), K(1.1, { angle: 0 })],
        body: [K(0, { sx: 1, sy: 1 }), K(0.55, { sx: 1.05, sy: 0.96 }), K(1.1, { sx: 1, sy: 1 })],
        core: [K(0, { sx: 0.9, sy: 0.9 }), K(0.55, { sx: 1.15, sy: 1.15 }), K(1.1, { sx: 0.9, sy: 0.9 })],
      },
    }),
    fuse: makeClip({
      name: 'fuse', duration: 0.82, loop: false,
      tracks: {
        // Swells while the core throbs faster and faster toward detonation.
        body: [K(0, { sx: 1, sy: 1 }), K(0.3, { sx: 1.18, sy: 1.18 }), K(0.55, { sx: 1.06, sy: 1.06 }),
               K(0.7, { sx: 1.34, sy: 1.34 }), K(0.82, { sx: 1.5, sy: 1.5 }, 'inQuad')],
        core: [K(0, { sx: 1, sy: 1 }), K(0.2, { sx: 2.0, sy: 2.0 }), K(0.36, { sx: 1.1, sy: 1.1 }),
               K(0.5, { sx: 2.3, sy: 2.3 }), K(0.62, { sx: 1.2, sy: 1.2 }),
               K(0.72, { sx: 2.6, sy: 2.6 }), K(0.82, { sx: 3.2, sy: 3.2 }, 'inQuad')],
        finL: [K(0, { angle: 0 }), K(0.82, { angle: -0.9 }, 'outQuad')],
        finR: [K(0, { angle: 0 }), K(0.82, { angle: 0.9 }, 'outQuad')],
      },
    }),
  },
  clipFor: (e) => (e.state === 'fuse' ? 'fuse' : 'float'),
};

// --- splitter: oozing blob -------------------------------------------------

const splitter = {
  ref: 23,
  skeleton: makeSkeleton([
    { name: 'root', shape: 'none' },
    { name: 'podA', parent: 'root', x: -4, y: -7, angle: -2.2, len: 9, thick: 3.4, color: ROLE.DARK, z: -1 },
    { name: 'podB', parent: 'root', x: -4, y: 7, angle: 2.2, len: 9, thick: 3.4, color: ROLE.DARK, z: -1 },
    { name: 'podC', parent: 'root', x: 6, y: -6, angle: -0.7, len: 8, thick: 3, color: ROLE.DARK, z: -1 },
    { name: 'podD', parent: 'root', x: 6, y: 6, angle: 0.7, len: 8, thick: 3, color: ROLE.DARK, z: -1 },
    { name: 'body', parent: 'root', shape: 'circle', thick: 11.5, color: ROLE.MAIN, z: 0 },
    { name: 'nucleus', parent: 'root', x: 1, shape: 'circle', thick: 4.6, color: ROLE.DARK, z: 1 },
  ]),
  clips: {
    ooze: makeClip({
      name: 'ooze', duration: 1.0,
      tracks: {
        // Asymmetric wobble: the body never returns to a circle at the same
        // moment on both axes, which is what makes it read as fluid.
        body: [K(0, { sx: 1.08, sy: 0.94 }), K(0.25, { sx: 0.94, sy: 1.1 }),
               K(0.5, { sx: 1.1, sy: 0.92 }), K(0.75, { sx: 0.96, sy: 1.06 }),
               K(1.0, { sx: 1.08, sy: 0.94 })],
        nucleus: [K(0, { x: 0, y: 0 }), K(0.33, { x: 1.6, y: -1.2 }), K(0.66, { x: -1.2, y: 1.4 }), K(1.0, { x: 0, y: 0 })],
        podA: [K(0, { angle: 0 }), K(0.5, { angle: 0.35 }), K(1.0, { angle: 0 })],
        podB: [K(0, { angle: 0 }), K(0.5, { angle: -0.35 }), K(1.0, { angle: 0 })],
        podC: [K(0, { angle: 0.25 }), K(0.5, { angle: -0.2 }), K(1.0, { angle: 0.25 })],
        podD: [K(0, { angle: -0.25 }), K(0.5, { angle: 0.2 }), K(1.0, { angle: -0.25 })],
      },
    }),
  },
  clipFor: () => 'ooze',
};

// --- spitter: stationary radial turret --------------------------------------

const spitter = {
  ref: 21,
  skeleton: makeSkeleton([
    { name: 'root', shape: 'none' },
    { name: 'p0', parent: 'root', angle: 0, x: 5, len: 9, thick: 3, color: ROLE.MAIN, z: 0 },
    { name: 'p1', parent: 'root', angle: 1.2566, x: 5, len: 9, thick: 3, color: ROLE.MAIN, z: 0 },
    { name: 'p2', parent: 'root', angle: 2.5133, x: 5, len: 9, thick: 3, color: ROLE.MAIN, z: 0 },
    { name: 'p3', parent: 'root', angle: 3.7699, x: 5, len: 9, thick: 3, color: ROLE.MAIN, z: 0 },
    { name: 'p4', parent: 'root', angle: 5.0265, x: 5, len: 9, thick: 3, color: ROLE.MAIN, z: 0 },
    { name: 'hub', parent: 'root', shape: 'circle', thick: 7.4, color: ROLE.DARK, z: 1 },
    { name: 'core', parent: 'root', shape: 'circle', thick: 3.2, color: ROLE.ACCENT, z: 2 },
  ]),
  clips: {
    idle: makeClip({
      name: 'idle', duration: 2.0,
      tracks: {
        core: [K(0, { sx: 0.8, sy: 0.8 }), K(1.0, { sx: 1.05, sy: 1.05 }), K(2.0, { sx: 0.8, sy: 0.8 })],
        p0: [K(0, { x: 0 }), K(1.0, { x: 1.2 }), K(2.0, { x: 0 })],
        p1: [K(0, { x: 0 }), K(1.0, { x: 1.2 }), K(2.0, { x: 0 })],
        p2: [K(0, { x: 0 }), K(1.0, { x: 1.2 }), K(2.0, { x: 0 })],
        p3: [K(0, { x: 0 }), K(1.0, { x: 1.2 }), K(2.0, { x: 0 })],
        p4: [K(0, { x: 0 }), K(1.0, { x: 1.2 }), K(2.0, { x: 0 })],
      },
    }),
    wind: makeClip({
      name: 'wind', duration: 0.5, loop: false,
      tracks: {
        // Petals suck inward, then flare — the inhale before the volley.
        p0: [K(0, { x: 0 }), K(0.32, { x: -3.5 }, 'outQuad'), K(0.5, { x: 3 }, 'inQuad')],
        p1: [K(0, { x: 0 }), K(0.32, { x: -3.5 }, 'outQuad'), K(0.5, { x: 3 }, 'inQuad')],
        p2: [K(0, { x: 0 }), K(0.32, { x: -3.5 }, 'outQuad'), K(0.5, { x: 3 }, 'inQuad')],
        p3: [K(0, { x: 0 }), K(0.32, { x: -3.5 }, 'outQuad'), K(0.5, { x: 3 }, 'inQuad')],
        p4: [K(0, { x: 0 }), K(0.32, { x: -3.5 }, 'outQuad'), K(0.5, { x: 3 }, 'inQuad')],
        core: [K(0, { sx: 0.8, sy: 0.8 }), K(0.5, { sx: 2.4, sy: 2.4 }, 'inQuad')],
        hub: [K(0, { sx: 1, sy: 1 }), K(0.32, { sx: 0.9, sy: 0.9 }), K(0.5, { sx: 1.2, sy: 1.2 }, 'inQuad')],
      },
    }),
  },
  clipFor: (e) => (e.state === 'wind' ? 'wind' : 'idle'),
};

// --- warden: the boss ------------------------------------------------------

const warden = {
  ref: 46,
  skeleton: makeSkeleton([
    { name: 'root', shape: 'none' },
    { name: 'cloakA', parent: 'root', x: -14, angle: Math.PI, len: 18, thick: 17, taper: 0.8, shape: 'cloak', color: ROLE.DARK, z: -5 },
    { name: 'cloakB', parent: 'cloakA', x: 18, len: 16, thick: 13.6, taper: 0.3, shape: 'cloak', color: ROLE.DARK, z: -6 },
    { name: 'legL', parent: 'root', x: -10, y: -12, angle: -2.4, len: 14, thick: 5, color: ROLE.DARK, z: -1 },
    { name: 'legR', parent: 'root', x: -10, y: 12, angle: 2.4, len: 14, thick: 5, color: ROLE.DARK, z: -1 },
    { name: 'body', parent: 'root', x: -20, len: 40, thick: 22, shape: 'blob', color: ROLE.MAIN, z: 0 },
    { name: 'armL', parent: 'root', x: 2, y: -19, angle: -0.45, len: 20, thick: 6.4, color: ROLE.DARK, z: 1 },
    { name: 'armR', parent: 'root', x: 2, y: 19, angle: 0.45, len: 20, thick: 6.4, color: ROLE.DARK, z: 1 },
    { name: 'fistL', parent: 'armL', x: 20, shape: 'circle', thick: 7.6, color: ROLE.LIGHT, z: 2 },
    { name: 'fistR', parent: 'armR', x: 20, shape: 'circle', thick: 7.6, color: ROLE.LIGHT, z: 2 },
    { name: 'crown', parent: 'root', x: 8, shape: 'circle', thick: 10, color: ROLE.DARK, z: 3 },
    { name: 'eyeL', parent: 'crown', x: 3, y: -4, shape: 'circle', thick: 2.6, color: ROLE.ACCENT, z: 4 },
    { name: 'eyeR', parent: 'crown', x: 3, y: 4, shape: 'circle', thick: 2.6, color: ROLE.ACCENT, z: 4 },
  ]),
  clips: {
    idle: makeClip({
      name: 'idle', duration: 1.6,
      tracks: {
        body: [K(0, { sy: 1 }), K(0.8, { sy: 1.05, sx: 0.98 }), K(1.6, { sy: 1 })],
        armL: [K(0, { angle: 0 }), K(0.8, { angle: 0.12 }), K(1.6, { angle: 0 })],
        armR: [K(0, { angle: 0 }), K(0.8, { angle: -0.12 }), K(1.6, { angle: 0 })],
        legL: [K(0, { angle: 0.3 }), K(0.8, { angle: -0.3 }), K(1.6, { angle: 0.3 })],
        legR: [K(0, { angle: -0.3 }), K(0.8, { angle: 0.3 }), K(1.6, { angle: -0.3 })],
        cloakA: [K(0, { angle: 0.05 }), K(0.8, { angle: -0.05 }), K(1.6, { angle: 0.05 })],
        cloakB: [K(0, { angle: -0.08 }), K(0.8, { angle: 0.08 }), K(1.6, { angle: -0.08 })],
      },
    }),
    slam: makeClip({
      name: 'slam', duration: 0.8, loop: false,
      tracks: {
        armL: [K(0, { angle: 0 }), K(0.8, { angle: -1.45, sx: 1.15 }, 'outQuad')],
        armR: [K(0, { angle: 0 }), K(0.8, { angle: 1.45, sx: 1.15 }, 'outQuad')],
        fistL: [K(0, { sx: 1, sy: 1 }), K(0.8, { sx: 1.55, sy: 1.55 }, 'outQuad')],
        fistR: [K(0, { sx: 1, sy: 1 }), K(0.8, { sx: 1.55, sy: 1.55 }, 'outQuad')],
        body: [K(0, { sx: 1, sy: 1 }), K(0.8, { sx: 0.9, sy: 1.16 }, 'outQuad')],
        crown: [K(0, { sx: 1, sy: 1 }), K(0.8, { sx: 1.2, sy: 1.2 }, 'inQuad')],
      },
    }),
    volley: makeClip({
      name: 'volley', duration: 0.38,
      tracks: {
        body: [K(0, { sx: 1, sy: 1 }), K(0.12, { sx: 1.14, sy: 1.14 }, 'outQuad'), K(0.38, { sx: 1, sy: 1 }, 'outCubic')],
        armL: [K(0, { angle: 0 }), K(0.12, { angle: -0.7 }, 'outQuad'), K(0.38, { angle: 0 }, 'outCubic')],
        armR: [K(0, { angle: 0 }), K(0.12, { angle: 0.7 }, 'outQuad'), K(0.38, { angle: 0 }, 'outCubic')],
        eyeL: [K(0, { sx: 1, sy: 1 }), K(0.12, { sx: 1.9, sy: 1.9 }), K(0.38, { sx: 1, sy: 1 })],
        eyeR: [K(0, { sx: 1, sy: 1 }), K(0.12, { sx: 1.9, sy: 1.9 }), K(0.38, { sx: 1, sy: 1 })],
      },
    }),
    aim: makeClip({
      name: 'aim', duration: 0.7, loop: false,
      tracks: {
        body: [K(0, { x: 0, sx: 1 }), K(0.7, { x: -6, sx: 0.86, sy: 1.16 }, 'outQuad')],
        armL: [K(0, { angle: 0 }), K(0.7, { angle: 0.75 }, 'outQuad')],
        armR: [K(0, { angle: 0 }), K(0.7, { angle: -0.75 }, 'outQuad')],
        crown: [K(0, { x: 0 }), K(0.7, { x: 4 }, 'outQuad')],
        eyeL: [K(0, { sx: 1, sy: 1 }), K(0.7, { sx: 1.8, sy: 1.8 }, 'inQuad')],
        eyeR: [K(0, { sx: 1, sy: 1 }), K(0.7, { sx: 1.8, sy: 1.8 }, 'inQuad')],
      },
    }),
    charge: makeClip({
      name: 'charge', duration: 0.3,
      tracks: {
        body: [K(0, { sx: 1.3, sy: 0.86 }), K(0.3, { sx: 1.3, sy: 0.86 })],
        armL: [K(0, { angle: 0.9 }), K(0.3, { angle: 0.9 })],
        armR: [K(0, { angle: -0.9 }), K(0.3, { angle: -0.9 })],
        legL: [K(0, { angle: 0.9 }), K(0.15, { angle: -0.9 }), K(0.3, { angle: 0.9 })],
        legR: [K(0, { angle: -0.9 }), K(0.15, { angle: 0.9 }), K(0.3, { angle: -0.9 })],
        cloakA: [K(0, { sx: 1.5 }), K(0.3, { sx: 1.5 })],
      },
    }),
    stun: makeClip({
      name: 'stun', duration: 1.15, loop: false,
      tracks: {
        body: [K(0, { sx: 1.3, sy: 0.86 }), K(0.15, { sx: 0.88, sy: 1.16 }, 'outQuad'), K(1.15, { sx: 1, sy: 1 }, 'outElastic')],
        armL: [K(0, { angle: 0.9 }), K(0.3, { angle: -1.5 }, 'outQuad'), K(1.15, { angle: -1.2 })],
        armR: [K(0, { angle: -0.9 }), K(0.3, { angle: 1.5 }, 'outQuad'), K(1.15, { angle: 1.2 })],
        crown: [K(0, { x: 4 }), K(1.15, { x: -3 }, 'outCubic')],
        eyeL: [K(0, { sx: 1.8, sy: 1.8 }), K(0.2, { sx: 0.4, sy: 0.4 }), K(1.15, { sx: 0.5, sy: 0.5 })],
        eyeR: [K(0, { sx: 1.8, sy: 1.8 }), K(0.2, { sx: 0.4, sy: 0.4 }), K(1.15, { sx: 0.5, sy: 0.5 })],
      },
    }),
    roar: makeClip({
      name: 'roar', duration: 1.5, loop: false,
      tracks: {
        // Phase transition: rears up, arms wide, eyes blazing.
        body: [K(0, { sx: 1, sy: 1 }), K(0.3, { sx: 1.22, sy: 1.22 }, 'outBack'), K(1.5, { sx: 1.1, sy: 1.1 })],
        armL: [K(0, { angle: 0 }), K(0.3, { angle: -1.8, sx: 1.2 }, 'outBack'), K(1.5, { angle: -1.6, sx: 1.2 })],
        armR: [K(0, { angle: 0 }), K(0.3, { angle: 1.8, sx: 1.2 }, 'outBack'), K(1.5, { angle: 1.6, sx: 1.2 })],
        crown: [K(0, { sx: 1, sy: 1 }), K(0.3, { sx: 1.5, sy: 1.5 }, 'outBack'), K(1.5, { sx: 1.4, sy: 1.4 })],
        eyeL: [K(0, { sx: 1, sy: 1 }), K(0.3, { sx: 2.4, sy: 2.4 }), K(1.5, { sx: 2.2, sy: 2.2 })],
        eyeR: [K(0, { sx: 1, sy: 1 }), K(0.3, { sx: 2.4, sy: 2.4 }), K(1.5, { sx: 2.2, sy: 2.2 })],
        cloakA: [K(0, { sx: 1 }), K(0.3, { sx: 1.35 }, 'outBack'), K(1.5, { sx: 1.3 })],
      },
    }),
    summon: makeClip({
      name: 'summon', duration: 0.5, loop: false,
      tracks: {
        armL: [K(0, { angle: 0 }), K(0.25, { angle: -1.2 }, 'outQuad'), K(0.5, { angle: -0.3 }, 'outQuad')],
        armR: [K(0, { angle: 0 }), K(0.25, { angle: 1.2 }, 'outQuad'), K(0.5, { angle: 0.3 }, 'outQuad')],
        body: [K(0, { sy: 1 }), K(0.25, { sy: 1.12, sx: 0.94 }), K(0.5, { sy: 1 })],
        eyeL: [K(0, { sx: 1, sy: 1 }), K(0.25, { sx: 2, sy: 2 }), K(0.5, { sx: 1, sy: 1 })],
        eyeR: [K(0, { sx: 1, sy: 1 }), K(0.25, { sx: 2, sy: 2 }), K(0.5, { sx: 1, sy: 1 })],
      },
    }),
  },
  clipFor: (e) => {
    switch (e.action) {
      case 'phase': return 'roar';
      case 'slam': return 'slam';
      case 'volley': return 'volley';
      case 'aim': return 'aim';
      case 'charge': return 'charge';
      case 'stun': return 'stun';
      case 'summon': return 'summon';
      case 'spiral': return 'volley';
      default: return 'idle';
    }
  },
};

export const ENEMY_RIGS = {
  wretch, slinger, brute, charger, bomber, splitter, spitter, warden,
  ...BOSS_RIGS,
};

// --- runtime ---------------------------------------------------------------

export function createEnemyAnimator(type) {
  const rig = ENEMY_RIGS[type];
  if (!rig) return null;
  const a = new Animator(rig.skeleton);
  a.play(rig.clips[Object.keys(rig.clips)[0]], { fade: 0 });
  return a;
}

export function updateEnemyAnim(e, dt) {
  const rig = ENEMY_RIGS[e.type];
  if (!rig || !e.anim) return;

  const wanted = rig.clips[rig.clipFor(e)];
  // Bosses bump animSerial whenever a step begins, so a repeated step (the
  // second snap of a double snap, each fist of a pound barrage) replays its
  // clip even though the clip itself hasn't changed.
  const restep = e.animSerial !== undefined && e.anim.serial !== e.animSerial;
  if (wanted && (e.anim.clip !== wanted || (restep && !wanted.loop))) {
    // Non-looping clips restart, because they map onto a state that just
    // began; looping locomotion cross-fades instead.
    e.anim.play(wanted, { fade: wanted.loop ? 0.12 : 0.05, restart: !wanted.loop });
  }
  if (restep) e.anim.serial = e.animSerial;
  // Locomotion speed tracks how fast the thing is actually moving.
  if (wanted && wanted.loop && (e.state === 'chase' || e.action === 'idle')) {
    e.anim.speed = clamp(0.7 + (e.speed / 160), 0.6, 1.8);
  }
  if (wanted && rig.speedFor && !(wanted.loop && e.action === 'idle')) e.anim.speed = rig.speedFor(e, wanted);
  e.anim.update(dt);
  // Procedural layers on top of the clip (a spinning shell, a rolling croc).
  if (rig.post) rig.post(e, e.anim);
}

export function drawEnemyRig(e, ctx) {
  const rig = ENEMY_RIGS[e.type];
  if (!rig || !e.anim) return false;

  // Height (a leaping gorilla) lifts the body off its shadow and draws it a
  // little larger, as if closer to the camera.
  const z = e.z || 0;
  const scale = (e.r / rig.ref) * (1 + z / 320);
  // The spitter never turns to face anything; it just rotates on the spot.
  const angle = e.type === 'spitter' ? (e.spin || 0) : (e.face || 0);
  const world = resolvePose(rig.skeleton, e.anim.pose, { x: e.x, y: e.y - z, angle, scale });

  const flashing = e.flash > 0;
  drawSkeleton(ctx, world, { tint: '#0b0712', grow: 1.6 * scale, alpha: 0.9 });
  drawSkeleton(ctx, world, {
    tint: flashing ? '#ffffff' : null,
    palette: flashing ? null : paletteFor(rig, e),
  });
  return true;
}
