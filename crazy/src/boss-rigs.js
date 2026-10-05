// Skeletons and clips for the four creature bosses.
//
// Seen from above, each has to read as its animal at a glance on a phone:
// the turtle is a patterned shell with a head poking out; the crocodile a long
// body with a V of jaws and a three-segment tail; the gorilla a dark mass with
// a silver saddle and two huge knuckled arms; the peacock a small blue bird
// in front of a wheel of eyed feathers.
//
// Clips are picked from the boss's action and sub-step (`clipFor`). Telegraph
// clips are authored at a nominal length and time-stretched to whatever the
// move asks for (`speedFor` + e.clipTime), so the pose always peaks exactly
// when the attack lands — the rule that the telegraph and the hitbox agree.

import { makeSkeleton, makeClip } from './anim.js';
import { clamp } from './util.js';

const PI = Math.PI;
const MAIN = 'main', DARK = 'dark', LIGHT = 'light', ACCENT = 'accent';

/**
 * Build a clip from whole poses: `keys` is [[t, { bone: {angle,x,y,sx,sy} }, ease]].
 * Any bone named in some pose but missing from another is at rest there, so
 * poses read like drawings of the creature rather than per-bone tracks.
 */
function poseClip(name, duration, loop, keys) {
  const bones = new Set();
  for (const [, pose] of keys) for (const b of Object.keys(pose)) bones.add(b);
  const tracks = {};
  for (const b of bones) {
    tracks[b] = keys.map(([t, pose, ease]) => ({ t, ...(pose[b] || {}), ease }));
  }
  return makeClip({ name, duration, loop, tracks });
}

/** Merge several pose maps (later ones win per bone, fields merged). */
function mix(...poses) {
  const out = {};
  for (const p of poses) {
    for (const [b, v] of Object.entries(p)) out[b] = { ...(out[b] || {}), ...v };
  }
  return out;
}

/** Non-looping telegraph clips stretch to the move's timer; loops run at 1x. */
function speedFor(e, clip) {
  if (clip.loop || !e.clipTime) return 1;
  return clamp(clip.duration / e.clipTime, 0.25, 4);
}

// ============================================================================
// TURTLE — Gravemaw the Shellback
// ============================================================================

const SKIN = '#a9bd8c', BEAK = '#eadca8', SPIKE = '#eef6dc';

function turtleBones() {
  const bones = [
    { name: 'root', shape: 'none' },
    { name: 'tail', parent: 'root', x: -44, angle: PI, len: 12, thick: 5, color: SKIN, z: -2 },
    { name: 'legBL', parent: 'root', x: -22, y: -30, angle: -2.3, len: 18, thick: 8, color: SKIN, z: -2 },
    { name: 'legBR', parent: 'root', x: -22, y: 30, angle: 2.3, len: 18, thick: 8, color: SKIN, z: -2 },
    { name: 'legFL', parent: 'root', x: 20, y: -30, angle: -0.85, len: 22, thick: 8.5, color: SKIN, z: -2 },
    { name: 'legFR', parent: 'root', x: 20, y: 30, angle: 0.85, len: 22, thick: 8.5, color: SKIN, z: -2 },
    { name: 'neck', parent: 'root', x: 30, len: 18, thick: 9, color: SKIN, z: -1 },
    { name: 'head', parent: 'neck', x: 18, shape: 'circle', thick: 12.5, color: SKIN, z: 0 },
    { name: 'beak', parent: 'head', x: 8, len: 7, thick: 4.5, color: BEAK, z: 1 },
    { name: 'eyeL', parent: 'head', x: 4, y: -7, shape: 'circle', thick: 2.8, color: ACCENT, z: 2 },
    { name: 'eyeR', parent: 'head', x: 4, y: 7, shape: 'circle', thick: 2.8, color: ACCENT, z: 2 },
    { name: 'shell', parent: 'root', x: -46, len: 92, thick: 42, shape: 'blob', color: MAIN, z: 3 },
    { name: 'scute', parent: 'root', shape: 'circle', thick: 13, color: LIGHT, z: 4 },
  ];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * PI * 2 + PI / 6;
    bones.push({
      name: `sc${k}`, parent: 'root', x: Math.cos(a) * 25, y: Math.sin(a) * 23,
      shape: 'circle', thick: 8.5, color: LIGHT, z: 4,
    });
  }
  // Spines along the rim: stubs in phase 1, full length once enraged.
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * PI * 2 + PI / 5;
    bones.push({
      name: `sp${k}`, parent: 'root', x: Math.cos(a) * 30, y: Math.sin(a) * 28, angle: a,
      len: 9, thick: 3.2, color: SPIKE, z: 5,
    });
  }
  return bones;
}

// Everything soft pulled under the shell.
const TUCK = {
  legFL: { x: -12, sx: 0.25 }, legFR: { x: -12, sx: 0.25 },
  legBL: { x: 10, sx: 0.25 }, legBR: { x: 10, sx: 0.25 },
  neck: { x: -16, sx: 0.2 }, head: { x: -22 }, tail: { x: 8, sx: 0.3 },
};
const SPINES_UP = { sp0: { sx: 1.7 }, sp1: { sx: 1.7 }, sp2: { sx: 1.7 }, sp3: { sx: 1.7 }, sp4: { sx: 1.7 } };

const turtle = {
  ref: 50,
  skeleton: makeSkeleton(turtleBones()),
  clips: {
    walk: poseClip('walk', 1.1, true, [
      [0, { legFL: { angle: 0.35 }, legFR: { angle: 0.35 }, legBL: { angle: -0.3 }, legBR: { angle: -0.3 }, head: { angle: -0.08 } }],
      [0.55, { legFL: { angle: -0.35 }, legFR: { angle: -0.35 }, legBL: { angle: 0.3 }, legBR: { angle: 0.3 }, head: { angle: 0.08 }, shell: { sy: 1.02 } }],
      [1.1, { legFL: { angle: 0.35 }, legFR: { angle: 0.35 }, legBL: { angle: -0.3 }, legBR: { angle: -0.3 }, head: { angle: -0.08 } }],
    ]),
    biteWind: poseClip('biteWind', 0.5, false, [
      [0, {}],
      [0.5, { neck: { x: -7, sx: 0.6 }, head: { x: -4 }, beak: { sx: 1.4 }, shell: { sx: 0.97 },
        eyeL: { sx: 1.5, sy: 1.5 }, eyeR: { sx: 1.5, sy: 1.5 } }, 'outQuad'],
    ]),
    bite: poseClip('bite', 0.3, false, [
      [0, { neck: { x: -7, sx: 0.6 }, head: { x: -4 }, beak: { sx: 1.4 } }],
      [0.06, { neck: { x: 10, sx: 1.7 }, head: { x: 8 }, beak: { sx: 0.7 } }, 'outQuad'],
      [0.3, {}, 'outCubic'],
    ]),
    stompWind: poseClip('stompWind', 0.85, false, [
      [0, {}],
      [0.85, { shell: { sx: 1.13, sy: 1.13, x: -3 }, scute: { sx: 1.13, sy: 1.13 },
        legFL: { angle: -0.9, sx: 1.25 }, legFR: { angle: 0.9, sx: 1.25 }, neck: { sx: 1.2 },
        head: { x: 3 }, eyeL: { sx: 1.6, sy: 1.6 }, eyeR: { sx: 1.6, sy: 1.6 } }, 'outQuad'],
    ]),
    stompSlam: poseClip('stompSlam', 0.7, false, [
      [0, { shell: { sx: 1.13, sy: 1.13 }, legFL: { angle: -0.9, sx: 1.25 }, legFR: { angle: 0.9, sx: 1.25 } }],
      [0.07, { shell: { sx: 0.88, sy: 0.88 }, legFL: { angle: 0.3 }, legFR: { angle: -0.3 } }, 'outQuad'],
      [0.7, {}, 'outElastic'],
    ]),
    hide: poseClip('hide', 0.8, false, [
      [0, {}],
      [0.8, mix(TUCK, { shell: { sx: 1.05, sy: 1.05 } }), 'outQuad'],
    ]),
    spin: poseClip('spin', 0.3, true, [
      [0, mix(TUCK, { shell: { sx: 1.05, sy: 1.05 } })],
      [0.3, mix(TUCK, { shell: { sx: 1.05, sy: 1.05 } })],
    ]),
    mortar: poseClip('mortar', 0.55, true, [
      [0, { neck: { sx: 1.1 }, sp0: { sx: 1 }, sp1: { sx: 1 }, sp2: { sx: 1 }, sp3: { sx: 1 }, sp4: { sx: 1 } }],
      [0.2, mix(SPINES_UP, { shell: { sx: 1.05, sy: 1.05 }, neck: { sx: 1.1 } }), 'outQuad'],
      [0.55, { neck: { sx: 1.1 }, sp0: { sx: 1 }, sp1: { sx: 1 }, sp2: { sx: 1 }, sp3: { sx: 1 }, sp4: { sx: 1 } }],
    ]),
    tide: poseClip('tide', 0.42, true, [
      [0, mix(TUCK, { shell: { sx: 1.03, sy: 1.03 } })],
      [0.1, mix(TUCK, { shell: { sx: 1.12, sy: 1.12 }, scute: { sx: 1.3, sy: 1.3 } }), 'outQuad'],
      [0.42, mix(TUCK, { shell: { sx: 1.03, sy: 1.03 } })],
    ]),
    dazed: poseClip('dazed', 1.0, true, [
      [0, { neck: { angle: 0.5, sx: 1.2 }, head: { angle: 0.3 }, legFL: { angle: 0.6 }, legFR: { angle: -0.2 },
        legBL: { angle: 0.4 }, legBR: { angle: -0.4 }, shell: { sy: 0.96 }, eyeL: { sx: 0.4 }, eyeR: { sx: 0.4 } }],
      [0.5, { neck: { angle: -0.5, sx: 1.2 }, head: { angle: -0.3 }, legFL: { angle: 0.2 }, legFR: { angle: -0.6 },
        legBL: { angle: -0.4 }, legBR: { angle: 0.4 }, shell: { sy: 1 }, eyeL: { sx: 0.4 }, eyeR: { sx: 0.4 } }],
      [1.0, { neck: { angle: 0.5, sx: 1.2 }, head: { angle: 0.3 }, legFL: { angle: 0.6 }, legFR: { angle: -0.2 },
        legBL: { angle: 0.4 }, legBR: { angle: -0.4 }, shell: { sy: 0.96 }, eyeL: { sx: 0.4 }, eyeR: { sx: 0.4 } }],
    ]),
    roar: poseClip('roar', 1.3, false, [
      [0, {}],
      [0.3, mix(SPINES_UP, { neck: { x: 6, sx: 1.5 }, head: { x: 4 }, beak: { sx: 1.4 }, legFL: { angle: -0.5 }, legFR: { angle: 0.5 },
        legBL: { angle: 0.4 }, legBR: { angle: -0.4 }, shell: { sx: 1.1, sy: 1.1 },
        eyeL: { sx: 2, sy: 2 }, eyeR: { sx: 2, sy: 2 } }), 'outBack'],
      [1.3, mix(SPINES_UP, { neck: { x: 4, sx: 1.4 }, head: { x: 3 }, legFL: { angle: -0.4 }, legFR: { angle: 0.4 },
        shell: { sx: 1.06, sy: 1.06 }, eyeL: { sx: 1.8, sy: 1.8 }, eyeR: { sx: 1.8, sy: 1.8 } })],
    ]),
  },
  clipFor(e) {
    switch (e.action) {
      case 'bite': return e.sub === 'wind' ? 'biteWind' : e.sub === 'snap' ? 'bite' : 'walk';
      case 'stomp': return e.sub === 'wind' ? 'stompWind' : 'stompSlam';
      case 'spin': return e.sub === 'wind' ? 'hide' : 'spin';
      case 'mortar': return 'mortar';
      case 'tide': return e.sub === 'wind' ? 'hide' : 'tide';
      case 'exposed': return 'dazed';
      case 'phase': return 'roar';
      default: return 'walk';
    }
  },
  speedFor,
  post(e, anim) {
    // Enraged: spines stay up for the rest of the fight.
    if (e.phase >= 2) for (let k = 0; k < 5; k++) anim.offset(`sp${k}`, { sx: 1.5 });
    else for (let k = 0; k < 5; k++) anim.offset(`sp${k}`, { sx: 0.7 });
    if (e.action === 'spin' || (e.action === 'tide' && e.sub !== 'wind')) {
      anim.offset('root', { angle: e.spinA || 0 });
    }
  },
};

// ============================================================================
// CROCODILE — Mawgrim, the Mire King
// ============================================================================

const CROC_EYE = '#ffd45e';

function crocBones() {
  const bones = [
    { name: 'root', shape: 'none' },
    { name: 'tail1', parent: 'root', x: -36, angle: PI, len: 28, thick: 12, color: MAIN, z: -1 },
    { name: 'tail2', parent: 'tail1', x: 28, len: 26, thick: 8, color: MAIN, z: -1 },
    { name: 'tail3', parent: 'tail2', x: 26, len: 22, thick: 4.5, color: DARK, z: -1 },
    { name: 'legBL', parent: 'root', x: -22, y: -18, angle: -2.1, len: 17, thick: 5.5, color: DARK, z: -2 },
    { name: 'legBR', parent: 'root', x: -22, y: 18, angle: 2.1, len: 17, thick: 5.5, color: DARK, z: -2 },
    { name: 'legFL', parent: 'root', x: 18, y: -18, angle: -1.1, len: 16, thick: 5.5, color: DARK, z: -2 },
    { name: 'legFR', parent: 'root', x: 18, y: 18, angle: 1.1, len: 16, thick: 5.5, color: DARK, z: -2 },
    { name: 'body', parent: 'root', x: -40, len: 78, thick: 23, shape: 'blob', color: MAIN, z: 0 },
    { name: 'head', parent: 'root', x: 34, shape: 'circle', thick: 15, color: MAIN, z: 1 },
    { name: 'jawB', parent: 'head', x: 2, y: 4, angle: 0.06, len: 36, thick: 6.5, color: DARK, z: 1 },
    { name: 'jawT', parent: 'head', x: 2, y: -4, angle: -0.06, len: 38, thick: 7.5, color: LIGHT, z: 2 },
    { name: 'eyeL', parent: 'head', x: -3, y: -9, shape: 'circle', thick: 3.8, color: CROC_EYE, z: 3 },
    { name: 'eyeR', parent: 'head', x: -3, y: 9, shape: 'circle', thick: 3.8, color: CROC_EYE, z: 3 },
  ];
  // Two rows of armoured plates down the back.
  for (const [k, x] of [-24, -8, 8].entries()) {
    bones.push({ name: `plL${k}`, parent: 'root', x, y: -7, shape: 'circle', thick: 3.8, color: DARK, z: 1 });
    bones.push({ name: `plR${k}`, parent: 'root', x, y: 7, shape: 'circle', thick: 3.8, color: DARK, z: 1 });
  }
  return bones;
}

const JAWS = (open) => ({ jawT: { angle: -open }, jawB: { angle: open } });
const LEGS_TUCK = (s) => ({ legFL: { sx: s }, legFR: { sx: s }, legBL: { sx: s }, legBR: { sx: s } });

const croc = {
  ref: 42,
  skeleton: makeSkeleton(crocBones()),
  clips: {
    walk: poseClip('walk', 0.8, true, [
      [0, { legFL: { angle: 0.45 }, legFR: { angle: -0.45 }, legBL: { angle: -0.45 }, legBR: { angle: 0.45 },
        tail1: { angle: 0.18 }, tail2: { angle: -0.2 }, tail3: { angle: 0.25 }, head: { angle: -0.05 } }],
      [0.4, { legFL: { angle: -0.45 }, legFR: { angle: 0.45 }, legBL: { angle: 0.45 }, legBR: { angle: -0.45 },
        tail1: { angle: -0.18 }, tail2: { angle: 0.2 }, tail3: { angle: -0.25 }, head: { angle: 0.05 } }],
      [0.8, { legFL: { angle: 0.45 }, legFR: { angle: -0.45 }, legBL: { angle: -0.45 }, legBR: { angle: 0.45 },
        tail1: { angle: 0.18 }, tail2: { angle: -0.2 }, tail3: { angle: 0.25 }, head: { angle: -0.05 } }],
    ]),
    snapWind: poseClip('snapWind', 0.55, false, [
      [0, {}],
      [0.55, mix(JAWS(0.62), { head: { x: -6 }, body: { x: -4, sx: 0.94 }, tail1: { angle: 0.3 },
        legFL: { angle: 0.3 }, legFR: { angle: -0.3 }, eyeL: { sx: 1.4, sy: 1.4 }, eyeR: { sx: 1.4, sy: 1.4 } }), 'outQuad'],
    ]),
    snap: poseClip('snap', 0.35, false, [
      [0, mix(JAWS(0.62), { head: { x: -6 } })],
      [0.06, mix(JAWS(-0.04), { head: { x: 9 }, body: { sx: 1.1 } }), 'outQuad'],
      [0.35, {}, 'outCubic'],
    ]),
    tailWind: poseClip('tailWind', 0.6, false, [
      [0, {}],
      [0.6, { tail1: { angle: 0.95 }, tail2: { angle: 0.75 }, tail3: { angle: 0.6 }, head: { angle: -0.3 },
        body: { sx: 0.95 } }, 'outQuad'],
    ]),
    tailSpin: poseClip('tailSpin', 0.45, false, [
      [0, { tail1: { angle: 0.95 }, tail2: { angle: 0.75 }, tail3: { angle: 0.6 } }],
      [0.2, { tail1: { angle: -1.0 }, tail2: { angle: -0.8 }, tail3: { angle: -0.6 } }, 'outQuad'],
      [0.45, {}, 'outCubic'],
    ]),
    rollWind: poseClip('rollWind', 0.8, false, [
      [0, {}],
      [0.8, mix(LEGS_TUCK(0.55), { body: { sx: 0.92, sy: 1.1 }, head: { x: -3 }, tail1: { angle: 0.2 },
        eyeL: { sx: 1.5, sy: 1.5 }, eyeR: { sx: 1.5, sy: 1.5 } }), 'outQuad'],
    ]),
    roll: poseClip('roll', 0.3, true, [
      [0, mix(LEGS_TUCK(0.45), { tail1: { angle: 0.1 } })],
      [0.15, mix(LEGS_TUCK(0.45), { tail1: { angle: -0.1 } })],
      [0.3, mix(LEGS_TUCK(0.45), { tail1: { angle: 0.1 } })],
    ]),
    sink: poseClip('sink', 0.6, false, [
      [0, {}],
      [0.6, mix(LEGS_TUCK(0.2), { body: { sx: 0.75, sy: 0.7 }, head: { sx: 0.7, sy: 0.7 }, tail1: { sx: 0.6 },
        tail2: { sx: 0.5 }, tail3: { sx: 0.4 }, jawT: { sx: 0.7 }, jawB: { sx: 0.7 } }), 'inQuad'],
    ]),
    emerge: poseClip('emerge', 0.5, false, [
      [0, mix(JAWS(0.95), { head: { x: 8, sx: 1.2, sy: 1.2 }, body: { sx: 1.1 } })],
      [0.5, mix(JAWS(0.5), { head: { x: 3 } }), 'outCubic'],
    ]),
    sprayWind: poseClip('sprayWind', 0.7, false, [
      [0, {}],
      [0.7, mix(JAWS(0.35), { head: { x: 4, sx: 1.25, sy: 1.25 }, body: { sy: 1.1 } }), 'outQuad'],
    ]),
    spray: poseClip('spray', 0.2, true, [
      [0, mix(JAWS(0.45), { head: { x: 4, sx: 1.15, sy: 1.15 } })],
      [0.1, mix(JAWS(0.38), { head: { x: 5, sx: 1.2, sy: 1.2 } })],
      [0.2, mix(JAWS(0.45), { head: { x: 4, sx: 1.15, sy: 1.15 } })],
    ]),
    dazed: poseClip('dazed', 1.0, true, [
      [0, mix(JAWS(0.3), { legFL: { angle: -0.4 }, legFR: { angle: 0.4 }, legBL: { angle: 0.4 }, legBR: { angle: -0.4 },
        head: { angle: 0.2 }, eyeL: { sx: 0.35 }, eyeR: { sx: 0.35 } })],
      [0.5, mix(JAWS(0.3), { legFL: { angle: -0.4 }, legFR: { angle: 0.4 }, legBL: { angle: 0.4 }, legBR: { angle: -0.4 },
        head: { angle: -0.2 }, body: { sy: 1.05 }, eyeL: { sx: 0.35 }, eyeR: { sx: 0.35 } })],
      [1.0, mix(JAWS(0.3), { legFL: { angle: -0.4 }, legFR: { angle: 0.4 }, legBL: { angle: 0.4 }, legBR: { angle: -0.4 },
        head: { angle: 0.2 }, eyeL: { sx: 0.35 }, eyeR: { sx: 0.35 } })],
    ]),
    roar: poseClip('roar', 1.3, false, [
      [0, {}],
      [0.25, mix(JAWS(1.0), { head: { x: 8, sx: 1.2, sy: 1.2 }, tail1: { angle: 0.8 }, tail2: { angle: 0.5 } }), 'outBack'],
      [0.6, mix(JAWS(1.0), { head: { x: 8, sx: 1.2, sy: 1.2 }, tail1: { angle: -0.8 }, tail2: { angle: -0.5 } })],
      [0.95, mix(JAWS(1.0), { head: { x: 8, sx: 1.2, sy: 1.2 }, tail1: { angle: 0.8 }, tail2: { angle: 0.5 } })],
      [1.3, mix(JAWS(0.6), { head: { x: 5 } })],
    ]),
  },
  clipFor(e) {
    switch (e.action) {
      case 'snap': return e.sub === 'wind' ? 'snapWind' : e.sub === 'bite' ? 'snap' : 'walk';
      case 'tail': return e.sub === 'wind' ? 'tailWind' : 'tailSpin';
      case 'roll': return e.sub === 'wind' ? 'rollWind' : 'roll';
      case 'submerge': return e.sub === 'rise' ? 'emerge' : 'sink';
      case 'spray': return e.sub === 'wind' ? 'sprayWind' : 'spray';
      case 'hatch': return 'roar';
      case 'exposed': return 'dazed';
      case 'phase': return 'roar';
      default: return 'walk';
    }
  },
  speedFor,
  post(e, anim) {
    if (e.action === 'roll' && e.sub === 'go') {
      // A death roll seen from above: the body flattens and the legs flick
      // from side to side as it turns over.
      const c = Math.cos(e.rollA || 0);
      anim.offset('body', { sy: 0.7 + 0.3 * Math.abs(c) });
      for (const b of ['legFL', 'legFR', 'legBL', 'legBR']) anim.offset(b, { sx: Math.abs(c) });
      if (c < 0) { anim.set('eyeL', { sx: 0 }); anim.set('eyeR', { sx: 0 }); }
    }
    if (e.action === 'tail' && e.sub === 'spin') anim.offset('root', { angle: e.spinA || 0 });
  },
};

// ============================================================================
// GORILLA — Kharn, the Ashen Silverback
// ============================================================================

// Fur is kept well above the floor's brightness: a dark-on-dark gorilla
// vanished against the Emberfall basalt in the first screenshot.
const FUR = '#5d5672', SILVER = '#e2ddee', FACE = '#8e83a0', FIST = '#3b3448', BROW = '#2a2433', ROCK = '#a39683';

const gorilla = {
  ref: 48,
  skeleton: makeSkeleton([
    { name: 'root', shape: 'none' },
    { name: 'legL', parent: 'root', x: -20, y: -15, angle: -2.5, len: 18, thick: 8, color: FUR, z: -2 },
    { name: 'legR', parent: 'root', x: -20, y: 15, angle: 2.5, len: 18, thick: 8, color: FUR, z: -2 },
    { name: 'body', parent: 'root', x: -30, len: 58, thick: 29, shape: 'blob', color: FUR, z: 0 },
    { name: 'saddle', parent: 'root', x: -26, len: 36, thick: 15, shape: 'blob', color: SILVER, z: 1 },
    { name: 'armL', parent: 'root', x: 6, y: -28, angle: -0.35, len: 22, thick: 10, color: FUR, z: 1 },
    { name: 'foreL', parent: 'armL', x: 22, angle: 0.35, len: 22, thick: 9, color: FUR, z: 1 },
    { name: 'fistL', parent: 'foreL', x: 22, shape: 'circle', thick: 11.5, color: FIST, z: 2 },
    { name: 'armR', parent: 'root', x: 6, y: 28, angle: 0.35, len: 22, thick: 10, color: FUR, z: 1 },
    { name: 'foreR', parent: 'armR', x: 22, angle: -0.35, len: 22, thick: 9, color: FUR, z: 1 },
    { name: 'fistR', parent: 'foreR', x: 22, shape: 'circle', thick: 11.5, color: FIST, z: 2 },
    { name: 'head', parent: 'root', x: 24, shape: 'circle', thick: 14, color: FUR, z: 3 },
    { name: 'muzzle', parent: 'head', x: 8, shape: 'circle', thick: 7.5, color: FACE, z: 4 },
    { name: 'brow', parent: 'head', x: 6, y: -9, angle: PI / 2, len: 18, thick: 4, color: BROW, z: 5 },
    { name: 'eyeL', parent: 'head', x: 4, y: -5, shape: 'circle', thick: 2.6, color: ACCENT, z: 6 },
    { name: 'eyeR', parent: 'head', x: 4, y: 5, shape: 'circle', thick: 2.6, color: ACCENT, z: 6 },
    { name: 'boulder', parent: 'root', x: 34, shape: 'circle', thick: 19, color: ROCK, z: 7 },
  ]),
  clips: {
    walk: poseClip('walk', 0.75, true, [
      [0, { armL: { angle: 0.25 }, armR: { angle: 0.25 }, legL: { angle: 0.3 }, legR: { angle: 0.3 }, head: { angle: -0.06 } }],
      [0.375, { armL: { angle: -0.25 }, armR: { angle: -0.25 }, legL: { angle: -0.3 }, legR: { angle: -0.3 },
        head: { angle: 0.06 }, body: { sy: 1.03 } }],
      [0.75, { armL: { angle: 0.25 }, armR: { angle: 0.25 }, legL: { angle: 0.3 }, legR: { angle: 0.3 }, head: { angle: -0.06 } }],
    ]),
    crouch: poseClip('crouch', 0.45, false, [
      [0, {}],
      [0.45, { body: { sx: 0.88, sy: 1.12 }, saddle: { sx: 0.88, sy: 1.1 }, armL: { angle: -0.5 }, armR: { angle: 0.5 },
        head: { x: -4 }, legL: { angle: 0.4 }, legR: { angle: -0.4 } }, 'outQuad'],
    ]),
    air: poseClip('air', 0.9, false, [
      [0, { body: { sx: 0.88, sy: 1.12 } }],
      [0.25, { armL: { angle: -1.2 }, armR: { angle: 1.2 }, foreL: { angle: 0.8 }, foreR: { angle: -0.8 },
        body: { sx: 1.05, sy: 1.05 } }, 'outQuad'],
      [0.9, { armL: { angle: -1.3 }, armR: { angle: 1.3 }, foreL: { angle: 0.9 }, foreR: { angle: -0.9 },
        fistL: { sx: 1.3, sy: 1.3 }, fistR: { sx: 1.3, sy: 1.3 } }],
    ]),
    land: poseClip('land', 0.5, false, [
      [0, { armL: { angle: 0.3 }, armR: { angle: -0.3 }, fistL: { sx: 1.45, sy: 1.45 }, fistR: { sx: 1.45, sy: 1.45 },
        body: { sx: 1.2, sy: 0.85 } }],
      [0.5, {}, 'outElastic'],
    ]),
    lift: poseClip('lift', 0.7, false, [
      [0, { boulder: { sx: 0, sy: 0 } }],
      [0.2, { boulder: { sx: 0.8, sy: 0.8 }, armL: { angle: -0.4 }, armR: { angle: 0.4 } }, 'outQuad'],
      [0.7, { boulder: { x: -40, sx: 1.15, sy: 1.15 }, armL: { angle: -1.3 }, foreL: { angle: 1.7 },
        armR: { angle: 1.3 }, foreR: { angle: -1.7 }, body: { sy: 1.08 } }, 'outQuad'],
    ]),
    throw: poseClip('throw', 0.4, false, [
      [0, { boulder: { sx: 0, sy: 0 }, armL: { angle: 0.15 }, armR: { angle: -0.15 }, body: { x: 6, sx: 1.1 } }],
      [0.4, { boulder: { sx: 0, sy: 0 } }, 'outCubic'],
    ]),
    rushWind: poseClip('rushWind', 0.6, false, [
      [0, {}],
      [0.6, { body: { sx: 0.9 }, head: { x: -4 }, armL: { angle: -0.2 }, armR: { angle: 0.2 },
        fistL: { sx: 1.25, sy: 1.25 }, fistR: { sx: 1.25, sy: 1.25 }, legL: { angle: 0.4 }, legR: { angle: -0.4 },
        eyeL: { sx: 1.5, sy: 1.5 }, eyeR: { sx: 1.5, sy: 1.5 } }, 'outQuad'],
    ]),
    rush: poseClip('rush', 0.3, true, [
      [0, { armL: { angle: 0.4 }, armR: { angle: 0.4 }, legL: { angle: 0.5 }, legR: { angle: 0.5 } }],
      [0.15, { armL: { angle: -0.4 }, armR: { angle: -0.4 }, legL: { angle: -0.5 }, legR: { angle: -0.5 }, body: { sy: 1.05 } }],
      [0.3, { armL: { angle: 0.4 }, armR: { angle: 0.4 }, legL: { angle: 0.5 }, legR: { angle: 0.5 } }],
    ]),
    chest: poseClip('chest', 0.9, false, [
      [0, {}],
      [0.15, { armL: { angle: 0.7 }, foreL: { angle: 1.2 }, armR: { angle: -0.2 }, head: { x: 3 }, body: { sy: 1.08 } }],
      [0.3, { armL: { angle: -0.2 }, armR: { angle: -0.7 }, foreR: { angle: -1.2 }, head: { x: 3 }, body: { sy: 1.1 } }],
      [0.45, { armL: { angle: 0.7 }, foreL: { angle: 1.2 }, armR: { angle: -0.2 }, head: { x: 3 }, body: { sy: 1.1 } }],
      [0.6, { armL: { angle: -0.2 }, armR: { angle: -0.7 }, foreR: { angle: -1.2 }, head: { x: 3 }, body: { sy: 1.12 } }],
      [0.9, { armL: { angle: -0.9 }, armR: { angle: 0.9 }, head: { x: 5, sx: 1.15, sy: 1.15 }, body: { sx: 1.08, sy: 1.12 },
        eyeL: { sx: 1.6, sy: 1.6 }, eyeR: { sx: 1.6, sy: 1.6 } }, 'outBack'],
    ]),
    poundL: poseClip('poundL', 0.3, false, [
      [0, { armL: { angle: -0.6 }, armR: { angle: 0.9 } }],
      [0.05, { armL: { angle: 0.25 }, fistL: { sx: 1.5, sy: 1.5 }, armR: { angle: 0.9 }, body: { sx: 0.95 } }, 'outQuad'],
      [0.3, { armL: { angle: 0.1 }, armR: { angle: 0.9 } }],
    ]),
    poundR: poseClip('poundR', 0.3, false, [
      [0, { armR: { angle: 0.6 }, armL: { angle: -0.9 } }],
      [0.05, { armR: { angle: -0.25 }, fistR: { sx: 1.5, sy: 1.5 }, armL: { angle: -0.9 }, body: { sx: 0.95 } }, 'outQuad'],
      [0.3, { armR: { angle: -0.1 }, armL: { angle: -0.9 } }],
    ]),
    clapWind: poseClip('clapWind', 0.55, false, [
      [0, {}],
      [0.55, { armL: { angle: -1.35 }, foreL: { angle: -0.3 }, armR: { angle: 1.35 }, foreR: { angle: 0.3 },
        body: { sy: 1.1 }, head: { x: -3 } }, 'outQuad'],
    ]),
    clap: poseClip('clap', 0.35, false, [
      [0, { armL: { angle: -1.35 }, armR: { angle: 1.35 } }],
      [0.06, { armL: { angle: 0.45 }, armR: { angle: -0.45 }, body: { x: 5 }, fistL: { sx: 1.3, sy: 1.3 },
        fistR: { sx: 1.3, sy: 1.3 } }, 'outQuad'],
      [0.35, {}, 'outCubic'],
    ]),
    dazed: poseClip('dazed', 1.1, true, [
      [0, { armL: { angle: -1.5 }, foreL: { angle: 0.6 }, armR: { angle: 1.5 }, foreR: { angle: -0.6 },
        head: { angle: 0.3 }, body: { sy: 1 }, eyeL: { sx: 0.4 }, eyeR: { sx: 0.4 } }],
      [0.55, { armL: { angle: -1.4 }, foreL: { angle: 0.6 }, armR: { angle: 1.4 }, foreR: { angle: -0.6 },
        head: { angle: -0.3 }, body: { sy: 1.07 }, saddle: { sy: 1.05 }, eyeL: { sx: 0.4 }, eyeR: { sx: 0.4 } }],
      [1.1, { armL: { angle: -1.5 }, foreL: { angle: 0.6 }, armR: { angle: 1.5 }, foreR: { angle: -0.6 },
        head: { angle: 0.3 }, body: { sy: 1 }, eyeL: { sx: 0.4 }, eyeR: { sx: 0.4 } }],
    ]),
    roar: poseClip('roar', 1.3, false, [
      [0, {}],
      [0.3, { armL: { angle: -1.6 }, armR: { angle: 1.6 }, fistL: { sx: 1.4, sy: 1.4 }, fistR: { sx: 1.4, sy: 1.4 },
        head: { x: 6, sx: 1.2, sy: 1.2 }, body: { sx: 1.12, sy: 1.12 }, eyeL: { sx: 2, sy: 2 }, eyeR: { sx: 2, sy: 2 } }, 'outBack'],
      [1.3, { armL: { angle: -1.5 }, armR: { angle: 1.5 }, head: { x: 5, sx: 1.15, sy: 1.15 }, body: { sx: 1.1, sy: 1.1 },
        eyeL: { sx: 1.8, sy: 1.8 }, eyeR: { sx: 1.8, sy: 1.8 } }],
    ]),
  },
  clipFor(e) {
    switch (e.action) {
      case 'leap': return e.sub === 'crouch' ? 'crouch' : e.sub === 'air' ? 'air' : 'land';
      case 'boulder': return e.sub === 'lift' ? 'lift' : 'throw';
      case 'rush': return e.sub === 'wind' ? 'rushWind' : 'rush';
      case 'pound': return e.sub === 'wind' ? 'chest' : e.sub === 'L' ? 'poundL' : 'poundR';
      case 'clap': return e.sub === 'wind' ? 'clapWind' : 'clap';
      case 'exposed': return 'dazed';
      case 'phase': return 'roar';
      default: return 'walk';
    }
  },
  speedFor,
  post(e, anim) {
    // The boulder only exists while it's being lifted.
    if (!(e.action === 'boulder' && e.sub === 'lift')) anim.set('boulder', { sx: 0, sy: 0 });
  },
};

// ============================================================================
// PEACOCK — Solenne, the Hundred-Eyed
// ============================================================================

const FEATHER = '#1fb58a', EYE_GOLD = '#ffd45e', EYE_BLUE = '#2446c8', CREST = '#9fe8ff', PBEAK = '#f4c34a';
const NF = 9;

function peacockBones() {
  const bones = [{ name: 'root', shape: 'none' }];
  for (let k = 0; k < NF; k++) {
    bones.push({ name: `f${k}`, parent: 'root', x: -12, angle: PI + (k - 4) * 0.07, len: 50, thick: 4.6, color: FEATHER, z: -4 });
    bones.push({ name: `eo${k}`, parent: `f${k}`, x: 50, shape: 'circle', thick: 7, color: EYE_GOLD, z: -3 });
    bones.push({ name: `ei${k}`, parent: `f${k}`, x: 50, shape: 'circle', thick: 4.2, color: EYE_BLUE, z: -2 });
  }
  bones.push(
    { name: 'wingL', parent: 'root', x: 2, y: -8, angle: -2.7, len: 24, thick: 7.5, color: DARK, z: 0 },
    { name: 'wingR', parent: 'root', x: 2, y: 8, angle: 2.7, len: 24, thick: 7.5, color: DARK, z: 0 },
    { name: 'body', parent: 'root', x: -16, len: 34, thick: 12.5, shape: 'blob', color: MAIN, z: 1 },
    { name: 'neck', parent: 'root', x: 10, len: 12, thick: 5, color: MAIN, z: 2 },
    { name: 'head', parent: 'neck', x: 12, shape: 'circle', thick: 7, color: LIGHT, z: 3 },
    { name: 'beak', parent: 'head', x: 5, len: 6, thick: 2.2, color: PBEAK, z: 4 },
  );
  for (let k = 0; k < 3; k++) {
    bones.push({ name: `cr${k}`, parent: 'head', x: -2, angle: PI + (k - 1) * 0.5, len: 10, thick: 1.4, color: CREST, z: 4 });
    bones.push({ name: `ct${k}`, parent: `cr${k}`, x: 10, shape: 'circle', thick: 2.3, color: EYE_GOLD, z: 5 });
  }
  return bones;
}

/** The tail as one pose: spread per feather (rad), length and eye size. */
function fan(spread, sx = 1, eye = 1, jitter = 0) {
  const out = {};
  for (let k = 0; k < NF; k++) {
    out[`f${k}`] = { angle: (k - 4) * spread + (k % 2 ? jitter : -jitter), sx };
    out[`eo${k}`] = { sx: eye, sy: eye };
    out[`ei${k}`] = { sx: eye, sy: eye };
  }
  return out;
}
const WINGS = (open) => ({ wingL: { angle: open }, wingR: { angle: -open } });
const CREST_UP = (s) => ({ cr0: { angle: -s }, cr2: { angle: s } });

const peacock = {
  ref: 36,
  skeleton: makeSkeleton(peacockBones()),
  clips: {
    glide: poseClip('glide', 1.2, true, [
      [0, mix(fan(0.02, 1, 1, -0.04), WINGS(0.08), { neck: { x: 0 }, head: { angle: -0.1 } })],
      [0.6, mix(fan(0.02, 1, 1, 0.04), WINGS(-0.04), { neck: { x: 1.5 }, head: { angle: 0.1 } })],
      [1.2, mix(fan(0.02, 1, 1, -0.04), WINGS(0.08), { neck: { x: 0 }, head: { angle: -0.1 } })],
    ]),
    fanOpen: poseClip('fanOpen', 0.9, false, [
      [0, fan(0.02)],
      [0.9, mix(fan(0.36, 1.15, 1.3), WINGS(0.8), CREST_UP(0.4), { head: { x: 2 } }), 'outBack'],
    ]),
    display: poseClip('display', 0.5, true, [
      [0, mix(fan(0.36, 1.15, 1.2, 0.03), WINGS(0.8), CREST_UP(0.4), { head: { x: 2 } })],
      [0.25, mix(fan(0.36, 1.15, 1.45, -0.03), WINGS(0.85), CREST_UP(0.45), { head: { x: 2 } })],
      [0.5, mix(fan(0.36, 1.15, 1.2, 0.03), WINGS(0.8), CREST_UP(0.4), { head: { x: 2 } })],
    ]),
    dartWind: poseClip('dartWind', 0.45, false, [
      [0, fan(0.02)],
      [0.45, mix(fan(0.12, 1.05, 1.2), CREST_UP(0.5), { neck: { x: -4, sx: 0.8 }, head: { sx: 1.25, sy: 1.25 } }), 'outQuad'],
    ]),
    dart: poseClip('dart', 0.3, false, [
      [0, mix(fan(0.12, 1.05), { neck: { x: -4, sx: 0.8 } })],
      [0.05, mix(fan(0.08), WINGS(0.3), { neck: { x: 5, sx: 1.3 } }), 'outQuad'],
      [0.3, fan(0.02), 'outCubic'],
    ]),
    swoopWind: poseClip('swoopWind', 0.6, false, [
      [0, fan(0.02)],
      [0.6, mix(fan(0.0, 1.1), WINGS(1.4), { body: { sx: 1.05 }, neck: { x: 2 } }), 'outQuad'],
    ]),
    swoop: poseClip('swoop', 0.25, true, [
      [0, mix(fan(0.0, 1.2), WINGS(1.4))],
      [0.12, mix(fan(0.0, 1.2), WINGS(0.95))],
      [0.25, mix(fan(0.0, 1.2), WINGS(1.4))],
    ]),
    dazed: poseClip('dazed', 1.1, true, [
      [0, mix(fan(0.1, 0.85, 0.8), WINGS(0.3), { neck: { x: -3 }, head: { angle: 0.35 } })],
      [0.55, mix(fan(0.1, 0.82, 0.8), WINGS(0.25), { neck: { x: -3 }, head: { angle: -0.35 } })],
      [1.1, mix(fan(0.1, 0.85, 0.8), WINGS(0.3), { neck: { x: -3 }, head: { angle: 0.35 } })],
    ]),
    roar: poseClip('roar', 1.3, false, [
      [0, fan(0.02)],
      [0.25, mix(fan(0.4, 1.2, 1.5), WINGS(1.2), CREST_UP(0.6), { neck: { sx: 1.4 }, head: { x: 3 } }), 'outBack'],
      [0.5, mix(fan(0.38, 1.2, 1.3, 0.05), WINGS(1.1), CREST_UP(0.6), { neck: { sx: 1.4 }, head: { x: 3 } })],
      [0.75, mix(fan(0.4, 1.2, 1.5, -0.05), WINGS(1.2), CREST_UP(0.6), { neck: { sx: 1.4 }, head: { x: 3 } })],
      [1.3, mix(fan(0.36, 1.15, 1.2), WINGS(0.8), CREST_UP(0.4))],
    ]),
  },
  clipFor(e) {
    switch (e.action) {
      case 'darts': return e.sub === 'wind' ? 'dartWind' : 'dart';
      case 'swoop': return e.sub === 'wind' ? 'swoopWind' : e.sub === 'go' ? 'swoop' : 'glide';
      case 'display': return e.sub === 'move' ? 'glide' : e.sub === 'wind' ? 'fanOpen' : 'display';
      case 'beams': return e.sub === 'wind' ? 'fanOpen' : 'display';
      case 'eyes': return 'fanOpen';
      case 'exposed': return 'dazed';
      case 'phase': return 'roar';
      default: return 'glide';
    }
  },
  speedFor,
};

export const BOSS_RIGS = { turtle, croc, gorilla, peacock };
