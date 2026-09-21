// The Wanderer: a second look for the player, drawn for The Wilds' art.
//
// The Hooded One is drawn straight from above and turns bodily with your
// aim, which suits the chambers' flat floors. The Wilds are drawn in a 3/4
// view - cliff faces from the front, pines standing up - so the Wanderer
// stands up too: feet on the ground, head above them, and drawn at eight
// angles - profile, front, back and the diagonals - as characters in 3/4
// games are.
//
// Nothing about how the player moves or fights changes. The Wanderer is a
// different drawing of the same animation: the same skeleton and clips
// (rigs.js) are sampled every frame, and their values are read off here -
// the legs' swing becomes the stride, the torso's squash the breath, the
// dash stretch and the hurt jolt; the death clip topples the figure; the
// cloak's flutter blows the scarf. The weapon arm reaches for the same hand
// the weapons are drawn at, lifted to chest height, so every swing still
// lines up with its hitbox.
//
// Look: a traveller in a wide straw hat, a rust coat over dark trousers, a
// bedroll across the back, and a scarf in the weapon's colour. Earthy warm
// colours that stand out on green, grey and snow, lit from the upper left
// like the ground, with a dark outline so it reads on any terrain.

import { TAU, clamp, lerp, angleDiff } from './util.js';
import { boneAt } from './anim.js';
import { PLAYER_SKELETON } from './rigs.js';

/** Which look is drawn: 'hooded' | 'wanderer' (set by game.js). */
export const look = { skin: 'hooded' };

// How far above the ground the hands are: the weapons are drawn this high.
export const WANDERER_LIFT = 14;

const OUT = '#1b130f';
const C = {
  boot: '#2e2119', trouser: '#3b3444', trouserShade: '#2c2733',
  coat: '#a24e2d', coatShade: '#7a3620', coatLight: '#c8683e',
  belt: '#3a2a1c', buckle: '#e0b050',
  skin: '#e2b489', skinShade: '#b98a62', hair: '#3a2616',
  straw: '#dcbd6e', strawShade: '#9c7a3a', strawLight: '#f0d88e',
  roll: '#c9b48a', rollShade: '#9a8660', strap: '#5a3a24',
  glove: '#4a3526',
};

/** A copy of the rig's pose lifted to chest height, for the weapon. */
export function liftWorld(world) {
  return world.map((w) => ({ ...w, y: w.y - WANDERER_LIFT }));
}

/** Is the Wanderer facing away (the weapon goes behind the body)? */
export function wandererFacingAway(p) {
  const o = p.wOct ?? 0;
  return o === 5 || o === 6 || o === 7;
}

// --- which way the body faces --------------------------------------------------
// The body faces the way it WALKS. It turns to the aim only while it is
// actually fighting - swinging, drawing the bow, winding up the maul, scoped,
// fanning the hammer, channelling - and holds that for a moment afterwards, so
// a burst of swings does not flick the figure back and forth between blows.
// (This is drawing only: the hitboxes still go wherever p.aimAngle says.)
//
// The facing is one of eight directions, the way top-down sprites are drawn,
// and a turn steps through the directions in between - turning from right to
// left passes through facing the camera for a beat - instead of snapping.
// Octants, in screen terms: 0 right, 1 down-right, 2 down (toward the camera),
// 3 down-left, 4 left, 5 up-left, 6 up (away), 7 up-right.
const LINGER = 0.45;          // seconds the aim facing is held after fighting
const TURN_STEP = 0.05;       // seconds each in-between direction is shown
const OCT = Math.PI / 4;

/** Is the Wanderer doing something that points the weapon at the aim? */
function fighting(p) {
  return !!(p.attack || p.charging || p.aiming || p.holding || p.fan || p.channel);
}

const octOf = (a) => ((Math.round(a / OCT) % 8) + 8) % 8;

function updateFacing(p, dt) {
  const combat = fighting(p);
  p.wLinger = combat ? LINGER : Math.max(0, (p.wLinger || 0) - dt);

  let want = p.wFace ?? p.aimAngle;
  if (combat || p.wLinger > 0) want = p.aimAngle;
  else if (p.dashing) want = p.dashDir;
  else if (p.moveMag > 0.08 && !p.dead) want = p.moveAngle;
  p.wFace = want;

  // Quantise to an octant, with a little hysteresis so a heading that sits on
  // a boundary does not flicker between two drawings.
  if (p.wOct === undefined) p.wOct = octOf(want);
  let target = p.wOct;
  if (Math.abs(angleDiff(p.wOct * OCT, want)) > OCT / 2 + 0.14) target = octOf(want);

  // Step toward it the short way round, one direction at a time.
  p.wTurnT = Math.max(0, (p.wTurnT || 0) - dt);
  if (target !== p.wOct && p.wTurnT <= 0) {
    const d = (target - p.wOct + 8) % 8;
    p.wOct = (p.wOct + (d <= 4 ? 1 : 7)) % 8;
    p.wTurnT = combat ? TURN_STEP * 0.4 : TURN_STEP;   // a fight turns you faster
  }

  // Left or right, for the drawing's mirror. Straight up or down keep
  // whichever side the figure was last turned to.
  const o = p.wOct;
  if (o === 0 || o === 1 || o === 7) p.wS = 1;
  else if (o === 3 || o === 4 || o === 5) p.wS = -1;
  else if (!p.wS) p.wS = 1;

  // How far the weapon is raised toward the aim: up fast (even the bow's
  // 50 ms draw gets there), down slowly once the fight has passed.
  const up = combat || p.wLinger > 0;
  p.wCombat = up
    ? Math.min(1, (p.wCombat || 0) + dt / 0.06)
    : Math.max(0, (p.wCombat || 0) - dt / 0.25);
}

/**
 * Everything the Wanderer's drawing needs this frame, worked out once before
 * any of it is drawn (the weapon may be drawn behind the body, before it).
 */
export function prepareWanderer(p) {
  const now = performance.now() * 0.001;
  const dt = Math.min(0.05, Math.max(0, now - (p.wT ?? now)));
  p.wT = now;
  updateFacing(p, dt);
  p.wG = gait(p, p.wS, dt);
  p.wBodyY = p.wG.bodyY;
}

// --- how the figure is turned for the camera -----------------------------------
// One figure, drawn at eight angles - the way 8-direction sprites are made: five
// distinct views (profile, front, back, and the two diagonals), mirrored for the
// other three. Rather than five separate drawings, every part is placed from two
// numbers, so the views always agree with each other:
//   side   1 in profile, 0.71 on a diagonal, 0 facing or leaving the camera;
//   depth  +1 facing the camera (walking down the screen), -1 facing away.
// In profile the legs overlap and the stride runs across the screen; seen from
// the front or back they stand side by side and the stride runs up and down it,
// foreshortened.
function viewOf(p) {
  const a = (p.wOct ?? 0) * OCT;
  const side = Math.round(Math.abs(Math.cos(a)) * 100) / 100;
  const depth = Math.round(Math.sin(a) * 100) / 100;
  return { side, depth, front: depth > 0.3, back: depth < -0.3 };
}

// --- the weapon at rest ----------------------------------------------------------
// Walking about, a person carries a weapon; they do not point it. Each weapon
// has a resting carry in the figure's own frame (x toward the way it faces,
// y up from the feet): where the hand is and which way the weapon points.
// `a` is the canvas angle in profile, facing right (positive is downward);
// `front` is the angle seen from the front or back, where "ahead" is toward or
// away from the camera and the weapon hangs at the figure's side instead.
const CARRY = {
  blade: { x: 6, y: -17, a: 0.62, front: 1.3 },      // low, point down and ahead
  spear: { x: 6, y: -18, a: -1.92, front: -1.72 },   // upright, butt by the heel
  maul: { x: 7, y: -16, a: -2.3, front: -2.05 },     // head resting on the shoulder
  bow: { x: 6, y: -18, a: 0.15, front: 0.15 },       // held low, limbs up and down
  gun: { x: 6, y: -17, a: 0.9, front: 1.3 },         // muzzle down
  longarm: { x: 6, y: -17, a: 0.8, front: 1.25 },
  shield: { x: 7, y: -19, a: 1.2, front: 1.4 },      // on the forearm at the side
};
const SIDE_HAND_X = 8.6;      // seen from the front or back: the hand at the hip

/** The rig's weapon hand, where every swing has always been drawn from. */
function rigHand(p, lifted) {
  const hand = boneAt(lifted, PLAYER_SKELETON, 'armR');
  if (!hand) return null;
  const reach = (p.anim.pose.armR && p.anim.pose.armR.sx) || 1;
  return {
    x: hand.x + Math.cos(hand.angle) * reach * 11,
    y: hand.y + Math.sin(hand.angle) * reach * 11,
    angle: hand.angle,
  };
}

/**
 * Where the weapon hand is and which way the weapon points: the resting carry,
 * blended into the rig's aimed hand as the Wanderer starts to fight. Fully
 * raised it IS the rig's hand, so every swing still lines up with its hitbox.
 */
export function wandererHold(p, lifted, bob) {
  const rig = rigHand(p, lifted);
  const behind = wandererFacingAway(p);
  const k = p.wCombat || 0;
  if (rig && k >= 0.999) return { ...rig, behind };

  const s = p.wS || 1;
  const V = viewOf(p);
  const c = CARRY[p.weapon.id] || CARRY.blade;
  const G = p.wG;
  // The carrying arm counter-swings the legs: across the screen in profile,
  // toward and away from the camera (so up and down it) seen from the front.
  const swing = G && !p.dead ? G.far.x * 0.35 : 0;
  const x = p.x + s * (lerp(SIDE_HAND_X, c.x, V.side) + swing * V.side);
  const y = p.y + 12 + bob + (p.wBodyY || 0) + c.y + swing * 0.6 * V.depth * (1 - V.side);
  const a = lerp(c.front, c.a, V.side);
  const angle = s > 0 ? a : Math.PI - a;
  if (!rig || k <= 0.001) return { x, y, angle, behind };

  const e = k * k * (3 - 2 * k);
  return {
    x: lerp(x, rig.x, e),
    y: lerp(y, rig.y, e),
    angle: angle + angleDiff(angle, rig.angle) * e,   // the short way round
    behind,
  };
}

// --- the walk ----------------------------------------------------------------
// Built the way hand-drawn and pixel-art walks are, not as a smooth wiggle:
//   - A stride is a handful of KEY POSES, each HELD for a moment (animating
//     "on twos"): contact (heel down, legs apart), down (weight lands, body
//     lowest), passing (the free leg swings under the body, knee up) and up
//     (pushing off, body highest) - then the same on the other leg.
//   - The rise and fall is UNEVEN: down a unit, down again, then up two at the
//     passing pose. The rise is quicker than the fall, and that unevenness is
//     what stops a walk reading as a machine (SLYNYRD's top-down guides).
//   - The head rides with the body (a lag behind it read as the head
//     wobbling under the hat), and the hips shift over whichever foot is
//     carrying them.
//   - The cadence is driven by GROUND COVERED, not by a clock: a slow, the
//     speed setting, stairs, slowing to swing - the steps always match.
//   - The planted foot stays put and slides back under the body; only the
//     swinging foot leaves the ground, in an arc. Each leg is a thigh and a
//     shin of fixed length placed by two-bone IK, so a knee bends like a knee.
//   - Stopping mid-stride brings the feet together for a beat before idling.
const FRAMES = 8;
// contact, down, passing, up - twice. (+ is lower.)
const BOB = [0, 1, -1, -1, 0, 1, -1, -1];
const THIGH = 6.2, SHIN = 6.2, HIP_Y = -14, ANKLE_Y = -2.5;   // legs straight at contact, soft at rest
// Ground covered per full cycle (two steps). At the default speed that is a
// little over two strides a second - brisk, not scurrying.
const CYCLE = 108;
const SETTLE = 0.14;          // seconds the feet take to come together on stopping

/** Where a foot is at a point of its own cycle: planted, then swinging. */
function footAt(u, R, L) {
  if (u < 0.5) return { x: R - (u / 0.5) * 2 * R, lift: 0 };          // stance: slides back
  const v = (u - 0.5) / 0.5, e = v * v * (3 - 2 * v);
  return { x: -R + e * 2 * R, lift: Math.sin(v * Math.PI) * L };      // swing: arcs forward
}

/** The knee, from hip and foot, with thigh and shin of fixed length. */
function ik(hx, hy, fx, fy) {
  let dx = fx - hx, dy = fy - hy;
  let d = Math.hypot(dx, dy);
  const max = THIGH + SHIN - 0.05;
  if (d > max) { fx = hx + (dx / d) * max; fy = hy + (dy / d) * max; dx = fx - hx; dy = fy - hy; d = max; }
  const a = Math.atan2(dy, dx);
  const b = Math.acos(clamp((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * Math.max(d, 0.01)), -1, 1));
  // Knees point forward (local +x is always the way the figure faces).
  return { kx: hx + Math.cos(a - b) * THIGH, ky: hy + Math.sin(a - b) * THIGH, fx, fy };
}

/**
 * This frame's pose for the legs and the body. Feet are given along the
 * figure's own line of travel (`x`, + ahead) and off the ground (`lift`); the
 * drawing turns that into the screen for whichever view the figure is in.
 */
function gait(p, s, dt) {
  const now = performance.now() * 0.001;
  const air = !!(p.hop || p.leap || (p.z || 0) > 0.5);
  const walking = p.moveMag > 0.08 && !p.dead && !p.dashing && !air;

  // Ground actually covered since the last frame (a teleport does not count).
  const moved = Math.hypot(p.x - (p.wLX ?? p.x), p.y - (p.wLY ?? p.y));
  p.wLX = p.x; p.wLY = p.y;
  const step = moved < 60 ? moved : 0;
  if (walking) p.wPhase = ((p.wPhase || 0) + step / CYCLE) % 1;
  const frame = Math.floor((p.wPhase || 0) * FRAMES) % FRAMES;

  // Stopping mid-stride: hold a feet-together pose for a beat.
  if (p.wWalked && !walking && !air && !p.dashing && !p.dead) p.wSettle = SETTLE;
  p.wWalked = walking;
  p.wSettle = Math.max(0, (p.wSettle || 0) - dt);

  // Walking against the way the body faces (mid-fight) steps backwards;
  // sidling across it takes short steps rather than full strides.
  const along = Math.cos(angleDiff(p.wFace ?? p.moveAngle, p.moveAngle));
  const dir = along < -0.2 ? -1 : 1;
  // Longer steps at speed, shorter when slowed.
  const speed = dt > 0 ? step / dt : 0;
  const R = 4.5 * clamp(speed / 228, 0.6, 1.15) * Math.max(0.45, Math.abs(along));

  let near, far, bodyY = 0, lean = 0, shift = 0;
  if (p.dead) {
    near = { x: 1.5, lift: 0 }; far = { x: -1.5, lift: 0 };
  } else if (air) {
    near = { x: 3, lift: 4.5 }; far = { x: -2, lift: 5.5 };           // tucked in the air
  } else if (p.dashing) {
    const d = Math.cos(angleDiff(p.wFace ?? p.dashDir, p.dashDir)) < -0.2 ? -1 : 1;
    near = { x: 7 * d, lift: 0 }; far = { x: -7 * d, lift: 2.5 };     // a held lunge
    bodyY = 1; lean = 0.12 * d;
  } else if (walking) {
    const u = frame / FRAMES;
    const a = footAt(u, R, 4), b = footAt((u + 0.5) % 1, R, 4);
    near = { x: a.x * dir, lift: a.lift };
    far = { x: b.x * dir, lift: b.lift };
    bodyY = BOB[frame];
    lean = 0.04 * dir;
    shift = u < 0.5 ? 0.8 : -0.8;                        // over the planted foot
  } else if (p.wSettle > 0) {
    near = { x: 1.2, lift: 0.8 }; far = { x: -1, lift: 0 };          // feet coming together
    bodyY = 1;
  } else {
    // At rest: a stepped breath, and every few seconds the weight moves from
    // one foot to the other.
    const w = Math.floor(now / 3.2) % 2;
    near = { x: w ? 1.8 : 1.2, lift: 0 }; far = { x: w ? -1.6 : -2.2, lift: 0 };
    bodyY = Math.floor(now / 0.9) % 2 ? 0.5 : 0;
    shift = w ? 0.5 : -0.5;
  }
  return { near, far, bodyY, lean, shift };
}

export function drawWanderer(p, ctx, world, bob) {
  const flashing = p.hurtFlash > 0 && Math.sin(performance.now() * 0.06) > 0;
  const alpha = p.invuln > 0 && !p.dashing ? 0.62 : 1;
  const col = (c) => (flashing ? '#ffffff' : c);
  const accent = col(p.weapon.color);

  const s = p.wS || 1;                                  // facing right or left
  const V = viewOf(p);
  const back = V.back;
  const profile = V.side > 0.9;                         // straight across the screen
  const square = V.side < 0.1;                          // straight at or away from the camera
  const torso = p.anim.pose.torso || {};
  // The death clip collapses the torso; read it as a fall onto one side.
  const fall = p.dead ? clamp((1.3 - (torso.sy ?? 1)) / 0.8, 0, 1) : 0;
  const moving = p.moveMag > 0.08 && !p.dead;
  const G = p.wG || gait(p, s, 0);
  // Knocked back a step when hit: a held jolt, not a squash.
  const jolt = p.hurtFlash > 0.2 && !p.dead ? -1.5 : 0;
  // The weight shift only shows side to side when the figure faces the camera
  // or away from it; in profile it would be toward the viewer.
  const shift = G.shift * (1 - V.side);

  ctx.save();
  ctx.globalAlpha = alpha;
  // Stand on the feet: everything below is drawn with y up from the ground.
  ctx.translate(p.x, p.y + 12 + bob);
  ctx.rotate(s * (fall * 1.3));
  ctx.scale(s, p.dead ? 1 - fall * 0.2 : 1);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const fillOut = (color, w = 1.6) => { ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = w; ctx.stroke(); };
  const limb = (x0, y0, x1, y1, width, color) => {
    ctx.strokeStyle = OUT; ctx.lineWidth = width + 3;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  };

  // --- legs: hips ride with the body, feet stay on the ground -----------------
  // Seen in profile the legs nearly overlap; turned toward or away from the
  // camera - diagonals included - they stand apart.
  const hipY = HIP_Y + G.bodyY;
  const spread = 1.8 + 1.5 * Math.abs(V.depth);
  // Boots point the way the figure faces: along the ground in profile, down
  // or up the screen on a diagonal, toe-on (round) straight at the camera.
  const diagonal = !profile && !square;
  const toe = diagonal ? 0.5 * Math.sign(V.depth) : 0;
  const leg = (f, hipX, width, color) => {
    const hx = hipX + jolt + shift;
    // The stride runs across the screen in profile and up and down it
    // (foreshortened) facing the camera or away: a step toward the camera
    // lands lower on the screen.
    const fx = hipX + shift + f.x * V.side;
    const fy = ANKLE_Y - f.lift + f.x * V.depth * 0.5;
    const L = ik(hx, hipY, fx, fy);
    // A knee bends toward the way the figure faces. Facing the camera that is
    // straight out of the screen, so it shows as the leg shortening rather
    // than bowing sideways.
    const mx = (hx + L.fx) / 2, my = (hipY + L.fy) / 2;
    const kx = lerp(mx, L.kx, V.side), ky = lerp(my, L.ky, V.side);
    ctx.strokeStyle = OUT; ctx.lineWidth = width + 3;
    ctx.beginPath(); ctx.moveTo(hx, hipY); ctx.lineTo(kx, ky); ctx.lineTo(L.fx, L.fy); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(hx, hipY); ctx.lineTo(kx, ky); ctx.lineTo(L.fx, L.fy); ctx.stroke();
    // The boot: long with the toe forward in profile, short and round seen
    // toe-on or heel-on; tipped up a little in the air.
    ctx.beginPath();
    ctx.ellipse(L.fx + 1.4 * V.side, L.fy + 1 + 0.8 * toe, 2.5 + 1.3 * V.side, 2.1, toe + (f.lift > 0.5 ? -0.25 * V.side : 0), 0, TAU);
    fillOut(col(C.boot), 1.4);
  };
  leg(G.far, -spread, 4.2, col(C.trouserShade));       // the far leg, in shade
  leg(G.near, spread, 4.4, col(C.trouser));            // the near leg

  // Everything above the hips rides the body's rise and fall, the weight
  // shift, and a slight lean into the walk (only visible in profile).
  ctx.translate(jolt + shift * 0.6, G.bodyY);
  ctx.rotate(G.lean * V.side);

  // --- the scarf, streaming behind (drawn over the back when facing away) --
  const cloakA = p.anim.pose.cloakA || {};
  const scarfLen = (12 * (cloakA.sx ?? 1) + (moving ? 4 : 0)) * lerp(0.55, 1, V.side);
  const t = performance.now() * 0.001;
  const wave = Math.sin(t * (moving ? 7 : 3) + p.x * 0.01) * (moving ? 1.6 : 0.8);
  const drawScarf = () => {
    const nx = -1 * V.side, ny = -29;
    ctx.strokeStyle = OUT; ctx.lineWidth = 6.5;
    ctx.beginPath(); ctx.moveTo(nx, ny); ctx.quadraticCurveTo(nx - scarfLen * 0.5, ny + 1 + wave * 0.4, nx - scarfLen, ny + 4 + wave); ctx.stroke();
    ctx.strokeStyle = accent; ctx.lineWidth = 3.8;
    ctx.beginPath(); ctx.moveTo(nx, ny); ctx.quadraticCurveTo(nx - scarfLen * 0.5, ny + 1 + wave * 0.4, nx - scarfLen, ny + 4 + wave); ctx.stroke();
    ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(nx, ny + 1); ctx.quadraticCurveTo(nx - scarfLen * 0.4, ny + 5 - wave * 0.3, nx - scarfLen * 0.8, ny + 9 - wave * 0.5); ctx.stroke();
  };
  if (!back) drawScarf();

  // --- the bedroll, peeking over the shoulders from the front ---------------
  const drawRoll = (y, x) => {
    ctx.beginPath(); ctx.ellipse(x, y, 9.5, 3.4, -0.08 * V.side, 0, TAU); fillOut(col(C.roll), 1.4);
    ctx.fillStyle = col(C.rollShade); ctx.fillRect(x - 3, y - 3, 1.6, 6.4); ctx.fillRect(x + 4, y - 3, 1.6, 6.4);
  };
  if (!back) drawRoll(-31, -2 * V.side);

  // --- the off hand, counter-swinging ---------------------------------------
  // Arms swing against the legs: the off hand forward as the far leg goes
  // back. In profile it is the far arm, behind the body; turned toward or away
  // from the camera it hangs at the figure's other side, in plain view, and
  // its swing is toward and away from the viewer - up and down the screen.
  const shX = lerp(-7.2, -4.5, V.side);
  const offHand = {
    x: lerp(-SIDE_HAND_X, -4.5, V.side) - G.far.x * 0.5 * V.side,
    y: -19 - G.far.x * 0.35 * V.depth * (1 - V.side),
  };
  const offInFront = !profile || back;
  if (!offInFront) limb(shX, -27, offHand.x, offHand.y, 3.6, col(C.coatShade));

  // --- the coat -----------------------------------------------------------------
  const hem = G.near.x * 0.25 * V.side;
  ctx.beginPath();
  ctx.moveTo(-6.5, -30);
  ctx.quadraticCurveTo(-8.5, -21, -9 + hem * 0.3, -11);
  ctx.lineTo(9 + hem * 0.3, -11);
  ctx.quadraticCurveTo(8.5, -21, 6.5, -30);
  ctx.quadraticCurveTo(0, -33, -6.5, -30);
  ctx.closePath();
  fillOut(col(C.coat));
  // Where the coat opens: down the middle facing the camera, turned toward
  // the way the figure faces on a diagonal, near the front edge in profile.
  const openX = square ? 0 : profile ? 1 : 2.6;
  // Lit from the upper left: a light edge on the left, shade on the right.
  if (!flashing) {
    ctx.save(); ctx.clip();
    ctx.fillStyle = back ? C.coatShade : C.coatLight;
    ctx.globalAlpha = alpha * 0.55;
    // (The figure is mirrored when facing left; the light is not.)
    ctx.fillRect(s > 0 ? -10 : 5.5, -34, 4.5, 24);
    ctx.fillStyle = C.coatShade;
    ctx.globalAlpha = alpha * 0.8;
    ctx.fillRect(s > 0 ? 3.5 : -11.5, -34, 8, 24);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = C.coatShade; ctx.lineWidth = 1.2;
    if (!back) {
      ctx.beginPath(); ctx.moveTo(openX, -29); ctx.lineTo(openX + 0.5 + hem * 0.2, -11); ctx.stroke();
      if (!profile) {
        // The lapels: a V down from the collar, centred facing the camera and
        // swung toward the facing side on a diagonal - the clearest sign, at
        // this size, of which way the chest is turned.
        const wl = square ? 3.2 : 4.2, wr = square ? 3.2 : 1.6;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(openX - wl, -30.5); ctx.lineTo(openX, -23.5); ctx.lineTo(openX + wr, -30.5);
        ctx.stroke();
      }
    } else if (square) {
      // From straight behind: the seam down the back.
      ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(0, -11); ctx.stroke();
    }
    ctx.restore();
  }
  // The belt and its buckle.
  ctx.fillStyle = col(C.belt); ctx.fillRect(-8.2, -18.5, 16.4, 2.6);
  if (!back) { ctx.fillStyle = col(C.buckle); ctx.fillRect(openX - 1.5, -18.8, 3, 3.2); }
  // Facing the camera, the scarf's knot shows at the throat.
  if (V.front && !square) { ctx.fillStyle = accent; ctx.fillRect(openX - 2.4, -31, 4.4, 2.6); }
  else if (square && !back) { ctx.fillStyle = accent; ctx.fillRect(-2.2, -31, 4.4, 2.6); }

  if (back) {
    // From behind: the bedroll across the shoulders, strapped on.
    drawRoll(-28, -2 * V.side);
    ctx.strokeStyle = col(C.strap); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-6, -31); ctx.lineTo(5, -17); ctx.stroke();
  }
  if (offInFront) limb(shX, -27, offHand.x, offHand.y, 3.6, col(C.coatShade));

  // --- the head -----------------------------------------------------------------
  // Turned toward the camera, how much of the head is face and how much is
  // hair says which way it looks: all face straight on, hair over the back
  // third on a diagonal, the back half in profile - with the ear where the
  // two meet.
  const hx = (profile ? 0.5 : diagonal ? 1.2 : 0), hy = -36;
  ctx.beginPath(); ctx.arc(hx, hy, 6.2, 0, TAU); fillOut(col(back ? C.hair : C.skin), 1.5);
  if (!back && !square && !flashing) {
    const edge = profile ? hx - 1 : hx - 3.2;         // where the hair begins
    ctx.save();
    ctx.beginPath(); ctx.arc(hx, hy, 5.5, 0, TAU); ctx.clip();
    ctx.fillStyle = C.hair;
    ctx.fillRect(hx - 7, hy - 7, edge - (hx - 7), 9.5);
    ctx.restore();
    ctx.fillStyle = C.skinShade;
    ctx.beginPath(); ctx.arc(edge + 0.6, hy + 1, 1.5, 0, TAU); ctx.fill();   // the ear
  }
  if (back && !square && !flashing) {
    // Three-quarters from behind: a sliver of cheek and ear on the facing side.
    ctx.fillStyle = C.skin;
    ctx.beginPath(); ctx.arc(hx + 4.4, hy + 1, 2, -1.2, 1.6); ctx.fill();
  }
  if (!back && !flashing) {
    if (square) {
      // Straight at the camera: shade under the chin, two eyes either side
      // of the middle.
      ctx.fillStyle = C.skinShade;
      ctx.beginPath(); ctx.ellipse(hx, hy + 3.6, 4.4, 2, 0, 0, Math.PI); ctx.fill();
      ctx.fillStyle = OUT;
      ctx.fillRect(hx - 3, hy - 0.6, 1.5, 2);
      ctx.fillRect(hx + 1.5, hy - 0.6, 1.5, 2);
    } else {
      ctx.fillStyle = C.skinShade;
      if (s > 0) { ctx.beginPath(); ctx.arc(hx + 2.2, hy + 1, 4.4, -0.9, 1.9); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(hx - 2.2, hy + 1, 4.4, 1.25, 4.05); ctx.fill(); }
      // Eyes in the hat's shade, looking the way you face. On a diagonal
      // both show, spaced across the turned face, the far one narrower.
      ctx.fillStyle = OUT;
      if (profile) {
        ctx.fillRect(hx + 1.2, hy - 0.6, 1.5, 2);
        ctx.fillRect(hx + 4, hy - 0.6, 1.4, 2);
      } else {
        ctx.fillRect(hx - 0.8, hy - 0.6, 1.5, 2);
        ctx.fillRect(hx + 3.1, hy - 0.6, 1.2, 2);
      }
    }
  }
  if (back) drawScarf();

  // --- the hat: a wide straw brim and a low crown -------------------------------
  ctx.beginPath(); ctx.ellipse(hx, hy - 3.2, 13.5, 4.6, 0, 0, TAU); fillOut(col(C.strawShade), 1.6);
  ctx.beginPath(); ctx.ellipse(hx, hy - 4.2, 13, 3.8, 0, Math.PI, TAU); ctx.fillStyle = col(C.straw); ctx.fill();
  ctx.beginPath(); ctx.ellipse(hx, hy - 7.2, 6.6, 5.2, 0, Math.PI, TAU); ctx.lineTo(hx + 6.6, hy - 5.4); ctx.lineTo(hx - 6.6, hy - 5.4); ctx.closePath();
  fillOut(col(C.straw), 1.5);
  ctx.fillStyle = accent; ctx.fillRect(hx - 6.6, hy - 7.4, 13.2, 2);   // the band, in the weapon's colour
  if (!flashing) {
    ctx.fillStyle = C.strawLight;
    ctx.beginPath(); ctx.ellipse(hx - 2.6, hy - 9.6, 2.4, 1.2, -0.3, 0, TAU); ctx.fill();
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

/**
 * The weapon arm, drawn from the shoulder to the hand the weapon is held in
 * (`wandererHold`). In world space, since the hand swings all round. The
 * shoulder moves out to the edge of the coat as the figure turns to face the
 * camera or away from it.
 */
export function drawWandererArm(p, ctx, hold, bob, behind) {
  if (!hold || p.dead) return;
  const hx = hold.x, hy = hold.y;
  const s = p.wS || 1;
  const V = viewOf(p);
  const G = p.wG;
  const shift = G ? G.shift * (1 - V.side) * 0.6 : 0;
  const sx0 = p.x + s * (lerp(7.2, 5, V.side) + shift);
  const sy0 = p.y + 12 + bob - 27 + (p.wBodyY || 0);
  const flashing = p.hurtFlash > 0 && Math.sin(performance.now() * 0.06) > 0;
  ctx.globalAlpha = p.invuln > 0 && !p.dashing ? 0.62 : 1;
  ctx.lineCap = 'round';
  ctx.strokeStyle = OUT; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(hx, hy); ctx.stroke();
  ctx.strokeStyle = flashing ? '#fff' : behind ? C.coatShade : C.coat; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(hx, hy); ctx.stroke();
  ctx.fillStyle = flashing ? '#fff' : C.glove;
  ctx.beginPath(); ctx.arc(hx, hy, 2.8, 0, TAU); ctx.fill();
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.globalAlpha = 1;
}
