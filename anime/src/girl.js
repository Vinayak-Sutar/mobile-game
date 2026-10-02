// HER: the rig, the eight directions, the walk and the idle.
//
// She is a 2D cel drawing standing up from a point on the ground, the way the
// ED composites its characters into a 3D street. The world tells her where her
// feet are and how near she is; everything else happens in her own local
// space, where her feet are y = 0 and the top of her hair is y = -100.
//
// SHE IS OURS, NOT A COPY. The first pass chased the show's character and got
// a figure that was too tall for the street and read as a doll. This one is
// shorter - 136 cm, about four and a third heads - rounder, and built out of
// shapes we can actually draw and animate: a big soft bob with two knots, two
// long strands, hoop earrings, and four blocks of colour. What matters at a
// hundred and twenty pixels is the silhouette and whether you can tell which
// way she is facing; everything else is detail nobody can see.
//
// EIGHT DIRECTIONS OUT OF FIVE DRAWINGS. front, front-three-quarter, side,
// back-three-quarter and back, with the left-facing four being the right ones
// mirrored. The mirror happens EXACTLY ONCE, in drawGirl, from a flip that
// comes from exactly one table - because the one bug this project keeps
// rediscovering is a thing mirrored twice.
//
// The views are not five separate drawings either. They are one drawing with
// a `turn` dial from 0 (facing the camera) to 1 (full profile) and a `back`
// flag, so a change to her hair is one edit rather than five.

import { INK, shade } from './palette.js';
import { screenDir } from './view.js';

const TAU = Math.PI * 2;

/** How tall she is in the world. The ED's girl measured 155 cm and looked
 *  wrong against our street; this is a deliberate step down. */
export const HEIGHT_CM = 136;

/** Her landmarks, as percentages of her height from the ground up. */
const L = {
  crown: -100, skull: -93, brow: -87, eyes: -82.5, chin: -77,
  shoulder: -71, chest: -63, waist: -51, hip: -47, hem: -38,
  knee: -25, sock: -24, ankle: -5, foot: 0,
};

/** The far arm and the far leg are drawn one step down. Without it the two
 *  legs merge into one at the passing position of every stride and she reads
 *  as hopping - which is exactly what the first walk looked like. */
const FAR = (hex) => shade(hex, 0.90);

export const SKIN = {
  hair: '#f0a0b4', hairLit: '#fbd2da', hairDim: '#d2788f',
  skin: '#fce3da', shirt: '#fcf8f3',
  collar: '#2d3a5b', scarf: '#bcd94a', clip: '#e8629a',
  skirt: '#3a4a6e', skirtDim: '#2a3654',
  // Knee socks in cream, not black. The reference has them dark, but two
  // near-black columns are the heaviest thing on a screen whose world sits at
  // 77% value - she read as bottom-heavy and the eye went straight to her
  // shins. Cream keeps her light and the navy band keeps the stripe.
  sock: '#f4eee4', sockBand: '#3a4a6e', shoe: '#e86f8e', sole: '#fdfdfd',
  ear: '#e0405a', eye: '#3c4030', white: '#ffffff', blush: '#f7aeb2',
  bag: '#e9e3d6',
};

/**
 * WHICH DRAWING FOR WHICH WAY SHE FACES.
 *
 * Index is the world octant: k = round(angle / 45 deg) mod 8, measured from
 * +x. The comments say where each one goes on the screen, and
 * tools/check-girl.mjs asserts every one of them against the real projection
 * rather than trusting the comment.
 *
 * This is the ONLY place a mirror is decided.
 */
export const OCTANTS = [
  { view: 'fquart', flip:  1 },   // 0    +x     screen down-right
  { view: 'front',  flip:  1 },   // 45   +x +y  straight down, toward the camera
  { view: 'fquart', flip: -1 },   // 90   +y     screen down-left
  { view: 'side',   flip: -1 },   // 135  -x +y  screen left
  { view: 'bquart', flip: -1 },   // 180  -x     screen up-left
  { view: 'back',   flip:  1 },   // 225  -x -y  straight up, away from the camera
  { view: 'bquart', flip:  1 },   // 270  -y     screen up-right
  { view: 'side',   flip:  1 },   // 315  +x -y  screen right
];

/** How far round she has turned, and whether we are behind her. */
const VIEWS = {
  front:  { turn: 0.00, back: 0 },
  fquart: { turn: 0.55, back: 0 },
  side:   { turn: 1.00, back: 0 },
  bquart: { turn: 0.55, back: 1 },
  back:   { turn: 0.00, back: 1 },
};

export const OCTANT_NAMES = [
  'down-right', 'toward you', 'down-left', 'left',
  'up-left', 'away', 'up-right', 'right',
];

// --- the rig ----------------------------------------------------------------

/** How she moves. Centimetres and seconds. */
export const GAIT = {
  speed: 142,        // a brisk walk for someone 136 cm tall
  accel: 0.11,       // seconds to get going
  brake: 0.17,       // and to stop - starting and stopping should have weight
  stride: 58,        // centimetres per step, so the cycle follows the ground
  turn: 15,          // radians per second she swings round to a new heading
};

export function createGirl(x = 0, y = 0, face = Math.PI / 4) {
  return {
    x, y, vx: 0, vy: 0, speed: 0,
    face,                       // world angle she is facing
    oct: 1,                     // which of the eight, with hysteresis
    phase: 0,                   // the walk cycle, driven by distance
    t: 0,                       // her own clock, for idle
    moving: 0,                  // 0..1, how much of the walk pose is showing
    hairX: 0, hairVX: 0,        // springs
    hairY: 0, hairVY: 0,
    earL: 0, earLV: 0, earR: 0, earRV: 0,
    skirt: 0, skirtV: 0,
    blink: 0, nextBlink: 2.4,
  };
}

/** One damped spring step. The whole of why she feels alive rather than
 *  stamped out: hair, earrings and skirt all lag what her body just did. */
function spring(p, v, target, dt, k = 170, damp = 11) {
  const a = (target - p) * k - v * damp;
  const nv = v + a * dt;
  return [p + nv * dt, nv];
}

/**
 * Advance her. `move` is a WORLD direction with a magnitude of 0..1 - the
 * caller has already turned whatever the player did into world terms through
 * view.js, because nothing else is allowed to know how the camera works.
 */
export function updateGirl(g, dt, move) {
  g.t += dt;

  const mag = Math.min(1, Math.hypot(move.x, move.y));
  const want = GAIT.speed * mag;
  const wx = mag > 0.02 ? (move.x / Math.hypot(move.x, move.y)) * want : 0;
  const wy = mag > 0.02 ? (move.y / Math.hypot(move.x, move.y)) * want : 0;

  // Accelerating takes longer than it looks and stopping takes longer still;
  // that difference is most of what makes a walk read as weight.
  const tau = mag > 0.02 ? GAIT.accel : GAIT.brake;
  const k = 1 - Math.exp(-dt / tau);
  g.vx += (wx - g.vx) * k;
  g.vy += (wy - g.vy) * k;

  g.speed = Math.hypot(g.vx, g.vy);
  g.x += g.vx * dt;
  g.y += g.vy * dt;

  // She turns to face where she is going, quickly but not instantly.
  if (g.speed > 6) {
    const want2 = Math.atan2(g.vy, g.vx);
    let d = ((want2 - g.face + Math.PI * 3) % TAU) - Math.PI;
    const step = GAIT.turn * dt;
    g.face += Math.abs(d) < step ? d : Math.sign(d) * step;
    g.face = ((g.face + Math.PI) % TAU + TAU) % TAU - Math.PI;
  }

  // The octant, with hysteresis so a diagonal does not flicker between two
  // drawings. 28 degrees of slack against an octant half-width of 22.5.
  const a = ((g.face + TAU) % TAU) / (Math.PI / 4);
  const want3 = Math.round(a) % 8;
  if (want3 !== g.oct) {
    let d = ((want3 - g.oct + 12) % 8) - 4;
    const off = Math.abs(((g.face - g.oct * Math.PI / 4 + Math.PI * 3) % TAU) - Math.PI);
    if (off > 28 * Math.PI / 180) g.oct = (g.oct + Math.sign(d) + 8) % 8;
  }

  // The cycle is driven by DISTANCE, not by time, so her feet never skate:
  // half a cycle is one stride, whatever speed she is going.
  g.phase = (g.phase + (g.speed * dt / GAIT.stride) * Math.PI) % TAU;
  const target = g.speed / GAIT.speed;
  g.moving += (Math.min(1, target * 1.4) - g.moving) * Math.min(1, dt * 11);

  // The springs. Hair trails whichever way she is accelerating on screen, and
  // bounces against the body's bob.
  const sd = screenDir(g.vx, g.vy);
  const sp = g.speed / GAIT.speed;
  [g.hairX, g.hairVX] = spring(g.hairX, g.hairVX, -sd.x * sp * 2.4, dt, 150, 10);
  [g.hairY, g.hairVY] = spring(g.hairY, g.hairVY, bobOf(g) * 0.8, dt, 240, 13);
  [g.earL, g.earLV] = spring(g.earL, g.earLV, -sd.x * sp * 1.7, dt, 320, 9);
  [g.earR, g.earRV] = spring(g.earR, g.earRV, -sd.x * sp * 1.7, dt, 290, 9);
  [g.skirt, g.skirtV] = spring(g.skirt, g.skirtV, -sd.x * sp * 2.0, dt, 120, 9);

  // A blink on a slow, slightly irregular clock. A character who never blinks
  // is the deadest thing on a screen.
  g.blink -= dt;
  g.nextBlink -= dt;
  if (g.nextBlink <= 0) { g.blink = 0.11; g.nextBlink = 2.6 + (g.t * 7919 % 1) * 3.4; }
}

/** The body's bob: it rises at the middle of each step and drops at contact. */
function bobOf(g) {
  return -(0.5 - 0.5 * Math.cos(g.phase * 2)) * 1.7 * g.moving;
}

// --- the drawing -------------------------------------------------------------

/** Her outline weight in local units. She carries the thickest line on screen
 *  on purpose: architecture has none, props have a thin one, she has this. */
const LW = 3.6;

/**
 * Draw her. (sx, sy) is where her feet meet the ground - the caller gets that
 * from view.js, which is the only thing allowed to know where the ground is.
 */
export function drawGirl(ctx, g, sx, sy, height) {
  const o = OCTANTS[g.oct];
  const v = VIEWS[o.view];
  const s = height / 100;

  ctx.save();
  ctx.translate(sx, sy);
  // THE ONE MIRROR. Everything below is drawn facing right; flip comes from
  // OCTANTS and from nowhere else.
  ctx.scale(s * o.flip, s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const P = pose(g, v, o.flip);
  parts(ctx, P, true);
  parts(ctx, P, false);
  face(ctx, P);
  ctx.restore();
}

/** Everything the drawing needs, worked out once. */
function pose(g, v, flip) {
  const m = g.moving;
  const swing = Math.sin(g.phase);
  const idle = 1 - m;
  return {
    turn: v.turn,
    back: v.back,
    bw: 1 - 0.26 * v.turn,                       // the body narrows in profile
    shift: v.turn * 2.6,                         // the face slides round
    bob: bobOf(g),
    lean: v.turn * 1.5 * m,
    breath: Math.sin(g.t * 1.7) * 0.9 * idle,
    sway: Math.sin(g.t * 0.55) * 0.55 * idle,
    legA: leg(g.phase, v.turn, m),
    legB: leg(g.phase + Math.PI, v.turn, m),
    arm: -swing * (1.4 + 4.6 * v.turn) * m,
    armLift: Math.sin(g.t * 1.7) * 0.4 * idle,
    hairX: g.hairX * flip,                       // the spring is in screen terms
    hairY: g.hairY,
    earL: g.earL * flip, earR: g.earR * flip,
    skirtX: g.skirt * flip - swing * 1.1 * v.turn * m,
    blink: g.blink > 0,
    m,
  };
}

/** One foot, on the flattened loop a walk cycle actually traces. */
function leg(p, turn, m) {
  const fwd = Math.sin(p);
  const lift = Math.max(0, Math.cos(p));
  return {
    x: fwd * (1.5 + 5.2 * turn) * m,
    y: (-lift * 3.0 + fwd * 0.9 * (1 - turn)) * m,
    fwd,
  };
}

function parts(ctx, P, ink) {
  const put = (color) => {
    if (ink) {
      ctx.fillStyle = INK; ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = LW; ctx.stroke();
    } else {
      ctx.fillStyle = color; ctx.fill();
    }
  };
  const ell = (x, y, rx, ry, rot, color) => {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); put(color);
  };
  const quad = (pts, color) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath(); put(color);
  };

  const b = P.bw, sh = P.shift, bob = P.bob, sway = P.sway + P.lean;
  const A = P.legA, B = P.legB;

  // --- the far arm, behind her ---------------------------------------------
  if (P.turn < 0.92) {
    const ax = (-8.8 * b) + sway - P.arm * 0.8;
    quad([[ax - 1.7, -68 + bob], [ax + 1.7, -68 + bob],
          [ax + 1.5, -52 + bob], [ax - 1.9, -52 + bob]], FAR(SKIN.skin));
    ell(ax - 0.2, -50.4 + bob, 2.5, 2.7, 0, FAR(SKIN.skin));
  }

  // --- the fall of hair behind her -----------------------------------------
  backHair(ctx, P); put(SKIN.hairDim);

  // --- legs -----------------------------------------------------------------
  for (const [lg, far] of [[B, true], [A, false]]) {
    const cx = (far ? -3.4 : 3.4) * b + sway * 0.4 + lg.x;
    const tone = far ? 0.92 : 1;
    quad([[cx - 2.9, L.hip + bob], [cx + 2.9, L.hip + bob],
          [cx + 2.6, L.ankle + lg.y], [cx - 2.6, L.ankle + lg.y]], SKIN.skin);
    quad([[cx - 3.1, L.sock + lg.y * 0.6], [cx + 3.1, L.sock + lg.y * 0.6],
          [cx + 2.4, -3.4 + lg.y], [cx - 2.4, -3.4 + lg.y]], SKIN.sock);
    ell(cx + 1.1 + P.turn * 1.9 + lg.fwd * 0.8 * P.m, -2.3 + lg.y, 5.0, 2.7, -0.07,
      SKIN.shoe);
    void tone;
  }

  // --- the skirt -------------------------------------------------------------
  quad([
    [-7.0 * b + sway + P.skirtX * 0.3, L.waist + bob],
    [7.0 * b + sway + P.skirtX * 0.3, L.waist + bob],
    [12.2 * b + sway + P.skirtX, L.hem + bob * 0.4],
    [-12.2 * b + sway + P.skirtX, L.hem + bob * 0.4],
  ], SKIN.skirt);

  // --- the torso -------------------------------------------------------------
  const sw = 8.6 * b, ww = 6.6 * b;
  quad([
    [-sw + sway, L.shoulder + bob - P.breath * 0.3],
    [sw + sway, L.shoulder + bob - P.breath * 0.3],
    [ww + sway + P.skirtX * 0.2, L.waist + 1 + bob],
    [-ww + sway + P.skirtX * 0.2, L.waist + 1 + bob],
  ], SKIN.shirt);
  ell(-sw + 0.6 + sway, -67.4 + bob, 4.2 * b + 0.8, 4.4, 0.2, FAR(SKIN.shirt));
  ell(sw - 0.6 + sway, -67.4 + bob, 4.2 * b + 0.8, 4.4, -0.2, SKIN.shirt);

  // --- the near arm ----------------------------------------------------------
  {
    const ax = (8.8 * b) + sway + P.arm;
    quad([[ax - 1.7, -68 + bob + P.armLift], [ax + 1.7, -68 + bob + P.armLift],
          [ax + 1.9, -52 + bob], [ax - 1.5, -52 + bob]], SKIN.skin);
    ell(ax + 0.2, -50.4 + bob, 2.5, 2.7, 0, SKIN.skin);
  }

  // --- neck and head ---------------------------------------------------------
  quad([[-2.1 + sh * 0.7 + sway, L.chin + 1 + bob], [2.6 + sh * 0.7 + sway, L.chin + 1 + bob],
        [2.6 + sh * 0.7 + sway, -73 + bob], [-2.1 + sh * 0.7 + sway, -73 + bob]], SKIN.skin);
  if (!P.back) {
    ell(sh + sway, -85 + bob + P.hairY * 0.3, 8.0, 9.4, 0, SKIN.skin);
    if (P.turn > 0.45) {                       // the profile grows a nose
      ell(7.4 + sh * 0.55 + sway, -84.2 + bob, 1.6 * P.turn, 1.3 * P.turn, 0, SKIN.skin);
      ell(6.6 + sh * 0.55 + sway, -79.0 + bob, 1.3 * P.turn, 1.1 * P.turn, 0, SKIN.skin);
    }
  }

  // --- the hair in front ------------------------------------------------------
  frontHair(ctx, P, put, ell, sway);
}

/** The long fall of hair behind her: a soft bob that widens past the shoulders
 *  and breaks into four ringlet ends. This silhouette is the character. */
function backHair(ctx, P) {
  const d = P.hairX, y = P.hairY + P.bob * 0.5;
  // Narrower than her shoulders are wide, and it stops at the chest. A first
  // pass had it reaching past the hem of her skirt and she read as a pink
  // blob with legs: big hair is a silhouette, not a cloak.
  const b = 0.55 + 0.45 * (1 - P.turn);        // seen edge-on it is thinner
  const W = 11.4 * b;
  ctx.beginPath();
  ctx.moveTo(-6.4 + d * 0.3, -94 + y);
  ctx.bezierCurveTo(-W - 1.4 + d * 0.6, -91 + y, -W + d, -80 + y, -W + d, -70 + y);
  ctx.bezierCurveTo(-W + d, -66 + y, -W - 0.5 + d, -64 + y, -W + d, -61 + y);
  for (let i = 0; i < 3; i++) {
    const x0 = -W + d + i * (W * 2 / 3), x1 = x0 + W * 2 / 3;
    ctx.quadraticCurveTo((x0 + x1) / 2, -55.5 + y, x1, -61 + y);
  }
  ctx.bezierCurveTo(W + 0.5 + d, -64 + y, W + d, -66 + y, W + d, -70 + y);
  ctx.bezierCurveTo(W + d, -80 + y, W + 1.4 + d * 0.6, -91 + y, 6.4 + d * 0.3, -94 + y);
  ctx.closePath();
}

function frontHair(ctx, P, put, ell, sway) {
  const sh = P.shift, d = P.hairX * 0.45, y = P.hairY * 0.5 + P.bob;
  if (P.back) {
    // From behind, the hair is the whole head.
    ell(sway + d, -87 + y, 10.6, 11.2, 0, SKIN.hair);
  } else {
    ell(sh + sway + d * 0.6, -90.2 + y, 9.6, 6.8, 0, SKIN.hair);      // crown
    ell(sh + sway + d * 0.6, -92.0 + y, 9.0, 4.6, 0, SKIN.hair);      // fringe
    if (P.turn < 0.62) {                                                   // strands
      ell(-7.6 + sh * 0.5 + sway + d, -78 + y, 3.4 * P.bw, 10.0, 0.13, SKIN.hair);
    }
    ell(8.2 * P.bw + sh * 0.5 + sway + d, -78 + y, 3.4, 10.0, -0.13, SKIN.hair);
  }
  ell(-5.0 + sh * 0.6 + sway + d, -94.8 + y, 4.3, 2.8, -0.12, SKIN.hair);  // two knots
  ell(5.8 + sh * 0.6 + sway + d, -94.6 + y, 4.3, 2.8, 0.12, SKIN.hair);
}

/** The things that sit ON her: the collar, the scarf, the pleats, a face if we
 *  can see one, a bag if we cannot, and the earrings. */
function face(ctx, P) {
  const sh = P.shift, sway = P.sway + P.lean, bob = P.bob, b = P.bw;
  const ell = (x, y, rx, ry, c, rot = 0) => {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
    ctx.fillStyle = c; ctx.fill();
  };
  const shape = (pts, c) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath(); ctx.fillStyle = c; ctx.fill();
  };

  // The sailor collar, over the shoulders both ways round.
  const sw = 8.6 * b;
  shape([[-sw + sway, L.shoulder + bob], [sw + sway, L.shoulder + bob],
         [sw - 0.8 + sway, -67.6 + bob], [sway + sh * 0.4, -65.4 + bob],
         [-sw + 0.8 + sway, -67.6 + bob]], SKIN.collar);

  if (P.back) {
    // From behind: the collar's square flap, and the bag she carries.
    shape([[-5.4 * b + sway, -68 + bob], [5.4 * b + sway, -68 + bob],
           [5.0 * b + sway, -58 + bob], [-5.0 * b + sway, -58 + bob]], SKIN.collar);
    ell(6.8 * b + sway, -56 + bob, 4.4, 5.0, SKIN.bag);
    ctx.strokeStyle = INK; ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(-4.2 * b + sway, -69 + bob); ctx.lineTo(6.0 * b + sway, -59 + bob);
    ctx.stroke();
  } else {
    // The neckerchief - lime, and one of very few loud things on her.
    shape([[-2.4 + sh * 0.4 + sway, -66.6 + bob], [sh * 0.4 + sway, -65.2 + bob],
           [3.6 + sh * 0.4 + sway, -66.6 + bob], [2.2 + sh * 0.4 + sway, -58.6 + bob],
           [-0.6 + sh * 0.4 + sway, -58.6 + bob]], SKIN.scarf);
    ell(sh * 0.4 + sway + 0.4, -65.6 + bob, 1.1, 0.9, SKIN.clip);
  }

  // Pleats. Three wedges is all a skirt needs at this size.
  for (const u of [-0.55, 0.0, 0.55]) {
    shape([[u * 7.0 * b + sway - 0.8 + P.skirtX * 0.3, L.waist + bob],
           [u * 7.0 * b + sway + 0.8 + P.skirtX * 0.3, L.waist + bob],
           [u * 12.2 * b + sway + 1.5 + P.skirtX, L.hem + bob * 0.4],
           [u * 12.2 * b + sway - 1.5 + P.skirtX, L.hem + bob * 0.4]], SKIN.skirtDim);
  }

  const hy = P.hairY * 0.5 + bob, hx = P.hairX * 0.45;

  // Hard white bands in the hair. The cheapest anime tell there is.
  if (!P.back) {
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(sh + sway + hx * 0.6, -92.0 + hy, 9.0, 4.6, 0, 0, TAU);
    ctx.clip();
    ell(sh - 1.4 + sway, -93.4 + hy, 6.8, 1.3, SKIN.hairLit, -0.10);
    ctx.restore();
  }
  ell(-5.0 + sh * 0.6 + sway + hx, -95.6 + hy, 2.0, 0.7, SKIN.hairLit, -0.16);
  ell(5.8 + sh * 0.6 + sway + hx, -95.4 + hy, 2.0, 0.7, SKIN.hairLit, -0.16);

  if (!P.back) {
    const near = 3.4 + sh, far = -2.6 + sh;
    const fade = Math.max(0, 1 - P.turn * 1.35);          // the far eye turns away
    if (P.blink) {
      ctx.strokeStyle = SKIN.eye; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
      const line = (x) => {
        ctx.beginPath();
        ctx.moveTo(x - 1.4 + sway, L.eyes + bob); ctx.lineTo(x + 1.4 + sway, L.eyes + bob);
        ctx.stroke();
      };
      line(near);
      if (fade > 0.2) line(far);
    } else {
      ell(near + sway, L.eyes + bob, 1.5, 2.0, SKIN.eye);
      ell(near - 0.3 + sway, L.eyes - 0.8 + bob, 0.55, 0.7, SKIN.white);
      if (fade > 0.2) {
        ell(far + sway, L.eyes + bob, 1.5 * fade, 2.0, SKIN.eye);
        ell(far - 0.3 + sway, L.eyes - 0.8 + bob, 0.5 * fade, 0.65, SKIN.white);
      }
    }
    ell(1.4 + sh + sway, -78.4 + bob, 1.0, 0.6, '#c4707e');
    ell(6.4 + sh * 0.8 + sway, -80.2 + bob, 1.5, 0.75, SKIN.blush);
    if (P.turn < 0.7) ell(-4.2 + sh * 0.8 + sway, -80.2 + bob, 1.5, 0.75, SKIN.blush);
  }

  // The few lines cel art actually draws inside a figure: the arms against
  // the body, the hem, the tops of the socks, and a sole under each shoe.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.95;
  ctx.lineCap = 'round';
  const line = (ax, ay, bx, by) => {
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  };
  const near = 8.6 * b + sway + P.arm;
  line(near - 1.9, -67 + bob, near - 2.1, -52.4 + bob);
  if (P.turn < 0.92) {
    const far = -8.6 * b + sway - P.arm * 0.8;
    line(far + 1.9, -67 + bob, far + 2.1, -52.4 + bob);
  }
  line(-7.0 * b + sway, L.waist + bob, 7.0 * b + sway, L.waist + bob);
  for (const lg of [P.legB, P.legA]) {
    const isFar = lg === P.legB;
    const legX = (isFar ? -3.4 : 3.4) * b + sway * 0.4 + lg.x;
    const tint = isFar ? FAR : ((c) => c);
    ctx.strokeStyle = tint(SKIN.sockBand);                 // the sock's turnover
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(legX - 3.0, L.sock + lg.y * 0.6 + 0.9);
    ctx.lineTo(legX + 3.0, L.sock + lg.y * 0.6 + 0.3);
    ctx.stroke();
    ctx.fillStyle = tint(SKIN.sole);                       // and a sole, so the
    ctx.beginPath();                                       // shoes are not pebbles
    ctx.ellipse(legX + 1.1 + P.turn * 1.9 + lg.fwd * 0.8 * P.m, -1.1 + lg.y,
      4.6, 1.0, -0.07, 0, TAU);
    ctx.fill();
  }

  // The earrings: hoops, small, and they swing. The owner asked
  // for them and a specific small thing is what makes a figure a person.
  ctx.lineWidth = 1.0;
  ctx.strokeStyle = SKIN.ear;
  ctx.lineWidth = 0.9;
  const hoop = (x, off) => {
    ctx.beginPath();
    ctx.ellipse(x + sway + off * 0.5, -78.2 + bob + Math.abs(off) * 0.1,
      1.0, 1.3, off * 0.14, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = SKIN.ear;
    ctx.beginPath();
    ctx.ellipse(x + sway + off * 0.2, -79.8 + bob, 0.55, 0.55, 0, 0, TAU);
    ctx.fill();
  };
  if (!P.back) {
    hoop(7.6 + sh * 0.7, P.earR);
    if (P.turn < 0.78) hoop(-5.6 + sh * 0.7, P.earL);
  } else if (P.turn > 0.3) {
    hoop(7.0, P.earR);
  }
}
