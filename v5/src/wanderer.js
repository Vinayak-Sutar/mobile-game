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
import { OUT, resolveOutfit } from './outfits.js';

/** Which look is drawn: 'hooded' | 'wanderer' (set by game.js). */
export const look = { skin: 'hooded' };

// How far above the ground the hands are: the weapons are drawn this high.
export const WANDERER_LIFT = 14;

// The Wanderer's clothes are an outfit (outfits.js): the default one is the
// traveller above; the wardrobe on the title screen changes any part of it.
const M_FUR = '#b89a78';

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
  armDrag(p, dt);
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
  // The carrying arm counter-swings the legs, foreshortened and tucked the same
  // way as the off arm (handAt).
  const u = G && !p.dead ? (p.wArm ? p.wArm.wep : 0) : 0;
  const hand = handAt(u, V, SIDE_HAND_X);
  const x = p.x + s * lerp(hand.x, c.x + u * 0.8, V.side);
  const y = p.y + 12 + bob + (p.wBodyY || 0) + c.y + lerp(hand.y - SHOULDER_Y - HAND_DROP, 0, V.side);
  const a = lerp(c.front, c.a, V.side) + hand.fwd * 0.1;
  const angle = s > 0 ? a : Math.PI - a;
  // Face on (or turned away), the hand swung toward the viewer passes in front
  // of the body and the one swung away passes behind it; in profile the weapon
  // arm is the near one unless the figure has its back to us.
  const near = hand.fwd * V.depth;
  const swung = V.side <= 0.6 && near < 0;
  const shown = V.side <= 0.6 && near > 0;
  if (!rig || k <= 0.001) return { x, y, angle, behind: (behind && !shown) || swung, fwd: hand.fwd };

  const e = k * k * (3 - 2 * k);
  return {
    x: lerp(x, rig.x, e),
    y: lerp(y, rig.y, e),
    angle: angle + angleDiff(angle, rig.angle) * e,   // the short way round
    behind: e < 0.5 ? ((behind && !shown) || swung) : behind,
    fwd: hand.fwd * (1 - e),
  };
}

// --- the arms ----------------------------------------------------------------
// The arms were the weakest part of the walk seen head on (the owner, 2026-09-23:
// "the hand movements when the character is coming forward don't feel right").
// They swung a third as far as the legs, were single straight lines with no
// elbow, hung at the same spot on the hip whichever way the figure faced, and
// were always drawn on the same side of the body - so face on the hands moved
// under two pixels and read as sticks pinned to the hips.
//
// What animators do instead (Animation Mentor, Envato's front-view walk, Adobe):
//   - the arm swings about as far as the leg, OPPOSITE it, along an arc;
//   - FOLLOW-THROUGH: the elbow drags behind the shoulder and the hand behind
//     the elbow, so a hand reaches the end of its swing after the foot does;
//   - FORESHORTENING: an arm swinging toward the viewer looks shorter, its hand
//     lower on the screen and a touch bigger; swinging away, longer and higher;
//   - face on the swing also reads ACROSS the body: the hand tucks in toward
//     the hip as it comes forward and hangs out as it goes back;
//   - the arm coming toward the viewer passes IN FRONT of the body while the
//     other passes behind it - the clearest depth cue of the lot.
const ARM = 6.4;                  // upper arm and forearm, each
const ARM_SWING = 0.95;           // how far a hand swings, against the foot's stride
const SHOULDER_Y = -27;
const HAND_DROP = 8;              // the hand hangs this far below the shoulder

/** The hands' swing, smoothed so they drag a little behind the legs. */
function armDrag(p, dt) {
  const G = p.wG;
  const off = -G.far.x * ARM_SWING, wep = -G.near.x * ARM_SWING;
  if (!p.wArm) p.wArm = { off, wep };
  const k = dt > 0 ? 1 - Math.exp(-dt / 0.055) : 1;      // about three frames behind
  p.wArm.off += (off - p.wArm.off) * k;
  p.wArm.wep += (wep - p.wArm.wep) * k;
}

/**
 * One hand, in the figure's own frame (+x the way it faces). `u` is how far it
 * is swung ahead (+) or behind (-); `baseX` where the arm hangs at the hip.
 */
function handAt(u, V, baseX) {
  const fwd = clamp(u / 4.5, -1, 1);
  // Face on, a true projection of the swing would be two pixels: at this size
  // that reads as nothing, so the depth is exaggerated (as sprite animators do)
  // and the hand crosses well in toward the hip as it comes forward.
  const tuck = 1 - 0.52 * Math.max(0, fwd) + 0.12 * Math.max(0, -fwd);
  // Kept inside the arm's reach, so the swing eases off at the bottom instead
  // of the elbow locking straight and the hand stopping dead.
  const drop = clamp(HAND_DROP + u * V.depth * 1.3 * (1 - V.side * 0.55), 2.5, ARM * 2 - 0.6);
  return {
    x: baseX * lerp(tuck, 1, V.side) + u * V.side,
    y: SHOULDER_Y + drop - Math.abs(fwd) * 0.9,
    fwd,
  };
}

/** The elbow, from shoulder and hand: two bones of equal length, bowing `out`. */
function armIk(sx, sy, hx, hy, out) {
  let dx = hx - sx, dy = hy - sy;
  let d = Math.hypot(dx, dy) || 0.01;
  const max = ARM * 2 - 0.05;
  if (d > max) { const f = max / d; hx = sx + dx * f; hy = sy + dy * f; dx = hx - sx; dy = hy - sy; d = max; }
  const bend = Math.sqrt(Math.max(0, ARM * ARM - (d / 2) * (d / 2)));
  const nx = -dy / d, ny = dx / d;
  return { ex: sx + dx * 0.5 + nx * bend * out, ey: sy + dy * 0.5 + ny * bend * out, hx, hy };
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
  const alpha = p.ghost ? 0.45 : p.invuln > 0 && !p.dashing ? 0.62 : 1;
  const col = (c) => (flashing ? '#ffffff' : c);
  // What the Wanderer is wearing (outfits.js): each part below is drawn by
  // the piece in its slot, in the outfit's dyes.
  const O = resolveOutfit();
  const P = O.P;
  const accent = col(P.accent || p.weapon.color);
  const hairCol = O.hair.bald ? P.skin[0] : P.hair;

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

  const diagonal = !profile && !square;
  const t = performance.now() * 0.001;
  const wave = Math.sin(t * (moving ? 7 : 3) + p.x * 0.01) * (moving ? 1.6 : 0.8);
  // Where the front opens: down the middle facing the camera, turned toward
  // the way the figure faces on a diagonal, near the front edge in profile.
  const openX = square ? 0 : profile ? 1 : 2.6;
  const cloakA = p.anim.pose.cloakA || {};
  const hx = (profile ? 0.5 : diagonal ? 1.2 : 0), hy = -36;
  // Everything a piece of the outfit needs to draw itself.
  const h = {
    ctx, V, s, back, profile, square, diagonal, flashing, col, fill: fillOut, accent, P, t, wave, moving, openX,
    hx, hy, faceX: square ? hx : profile ? hx + 2.8 : hx + 1.4,
    scarfLen: (12 * (cloakA.sx ?? 1) + (moving ? 4 : 0)) * lerp(0.55, 1, V.side),
  };
  const capeLen = O.back.cape || 0;
  const drawCape = (over) => {
    // Seen from the front a cape shows as a panel behind the body; turned
    // sideways it streams out behind, the more so walking.
    const sd = V.side, L = capeLen;
    const trail = (moving ? 5 : 2) * sd + wave * sd * 0.8;
    const bottom = -30 + L - sd * (moving ? L * 0.18 : L * 0.06);
    ctx.beginPath();
    ctx.moveTo(lerp(-7.4, -3.4, sd), -30.5);
    ctx.lineTo(lerp(7.4, 2.4, sd), -30.5);
    ctx.quadraticCurveTo(lerp(9.6, 1, sd), -30 + L * 0.5, lerp(10.4, 0, sd) + wave * 0.3 * (1 - sd), bottom);
    ctx.lineTo(lerp(-10.4, -6 - L * 0.35, sd) - trail, bottom + sd * 1.5);
    ctx.quadraticCurveTo(lerp(-9.6, -5 - trail, sd), -30 + L * 0.45, lerp(-7.4, -3.4, sd), -30.5);
    ctx.closePath();
    fillOut(col(over ? P.cloth[0] : P.cloth[1]), 1.5);
    if (over && !flashing) {
      ctx.strokeStyle = P.cloth[1]; ctx.lineWidth = 1;
      for (const x of [-4, 0.5, 5]) { ctx.beginPath(); ctx.moveTo(x * 0.6, -27); ctx.lineTo(x + wave * 0.3, bottom - 1); ctx.stroke(); }
    }
  };
  if (capeLen && !back) drawCape(false);

  // --- legs: hips ride with the body, feet stay on the ground -----------------
  // Seen in profile the legs nearly overlap; turned toward or away from the
  // camera - diagonals included - they stand apart.
  const hipY = HIP_Y + G.bodyY;
  const spread = 1.8 + 1.5 * Math.abs(V.depth);
  // Boots point the way the figure faces: along the ground in profile, down
  // or up the screen on a diagonal, toe-on (round) straight at the camera.
  const toe = diagonal ? 0.5 * Math.sign(V.depth) : 0;
  const Lg = O.legs, Ft = O.feet;
  const leg = (f, hipX, near) => {
    const hx0 = hipX + jolt + shift;
    // The stride runs across the screen in profile and up and down it
    // (foreshortened) facing the camera or away: a step toward the camera
    // lands lower on the screen.
    const fx = hipX + shift + f.x * V.side;
    const fy = ANKLE_Y - f.lift + f.x * V.depth * 0.5;
    const L = ik(hx0, hipY, fx, fy);
    // A knee bends toward the way the figure faces. Facing the camera that is
    // straight out of the screen, so it shows as the leg shortening rather
    // than bowing sideways.
    const mx = (hx0 + L.fx) / 2, my = (hipY + L.fy) / 2;
    const kx = lerp(mx, L.kx, V.side), ky = lerp(my, L.ky, V.side);
    const w = (Lg.width || 4.4) - (near ? 0 : 0.2);
    const ci = near ? 0 : 1;
    const thigh = col(Lg.c(P)[ci]);
    const shin = Lg.shin ? col(Lg.shin(P)[ci]) : thigh;
    if (Lg.flare) {
      // Wide trousers: one panel from the hip, flaring to the ankle.
      const dx = L.fx - hx0, dy = L.fy - hipY, d = Math.hypot(dx, dy) || 1;
      const nx = -dy / d, ny = dx / d;
      const a = w / 2, b = w / 2 + Lg.flare;
      ctx.beginPath();
      ctx.moveTo(hx0 + nx * a, hipY + ny * a); ctx.lineTo(L.fx + nx * b, L.fy - 0.6 + ny * b);
      ctx.lineTo(L.fx - nx * b, L.fy - 0.6 - ny * b); ctx.lineTo(hx0 - nx * a, hipY - ny * a);
      ctx.closePath();
      fillOut(thigh, 1.4);
      if (!flashing) { ctx.strokeStyle = Lg.c(P)[1]; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(hx0, hipY + 1); ctx.lineTo(L.fx, L.fy - 1); ctx.stroke(); }
    } else {
      ctx.strokeStyle = OUT; ctx.lineWidth = w + 3;
      ctx.beginPath(); ctx.moveTo(hx0, hipY); ctx.lineTo(kx, ky); ctx.lineTo(L.fx, L.fy); ctx.stroke();
      ctx.lineWidth = w;
      ctx.strokeStyle = thigh; ctx.beginPath(); ctx.moveTo(hx0, hipY); ctx.lineTo(kx, ky); ctx.stroke();
      ctx.strokeStyle = shin; ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(L.fx, L.fy); ctx.stroke();
      if (!flashing) {
        if (Lg.mail) {
          ctx.setLineDash([0.8, 1.2]); ctx.strokeStyle = Lg.c(P)[1]; ctx.lineWidth = w * 0.5;
          ctx.beginPath(); ctx.moveTo(hx0, hipY); ctx.lineTo(kx, ky); ctx.lineTo(L.fx, L.fy); ctx.stroke();
          ctx.setLineDash([]);
        }
        if (Lg.stripes) {
          ctx.strokeStyle = Lg.stripes; ctx.lineWidth = 0.8;
          const dx = L.fx - kx, dy = L.fy - ky, d = Math.hypot(dx, dy) || 1;
          const nx = -dy / d * w * 0.5, ny = dx / d * w * 0.5;
          ctx.beginPath();
          for (let u = 0.15; u < 0.9; u += 0.18) { const x = kx + dx * u, y = ky + dy * u; ctx.moveTo(x - nx, y - ny - 0.6); ctx.lineTo(x + nx, y + ny + 0.6); }
          ctx.stroke();
        }
        if (Lg.knee) { ctx.fillStyle = Lg.knee(P); ctx.beginPath(); ctx.arc(kx, ky, 1.6, 0, TAU); ctx.fill(); }
      }
      if (Lg.cop) { ctx.beginPath(); ctx.arc(kx, ky, 2.1, 0, TAU); fillOut(col(Lg.cop(P)), 1); }
    }
    // Tall footwear covers the lower shin.
    if (Ft.shin) {
      const x0 = lerp(kx, L.fx, 1 - Ft.shin), y0 = lerp(ky, L.fy, 1 - Ft.shin);
      limb(x0, y0, L.fx, L.fy, w + 0.6, col(Ft.shinC(P)));
    }
    // The foot: long with the toe forward in profile, short and round seen
    // toe-on or heel-on; tipped up a little in the air.
    Ft.draw(h, L.fx, L.fy, toe, f.lift > 0.5 ? -0.25 * V.side : 0);
  };
  leg(G.far, -spread, false);        // the far leg, in shade
  leg(G.near, spread, true);         // the near leg

  // Everything above the hips rides the body's rise and fall, the weight
  // shift, and a slight lean into the walk (only visible in profile).
  ctx.translate(jolt + shift * 0.6, G.bodyY);
  ctx.rotate(G.lean * V.side);

  const hatHides = O.hat.hair === 'hide';
  // Facing the camera: the scarf streaming behind, long hair and what is
  // carried on the back peeking past the body.
  if (!back && O.neck.behind) O.neck.behind(h);
  if (!back && !hatHides && O.hair.behind) O.hair.behind(h);
  if (!back && O.back.peek) O.back.peek(h);

  // --- the off hand, counter-swinging ---------------------------------------
  // Arms swing against the legs: the off hand forward as the far leg goes
  // back. In profile it is the far arm, behind the body; turned toward or away
  // from the camera it hangs at the figure's other side, in plain view, and
  // its swing is toward and away from the viewer - up and down the screen.
  const B = O.body;
  const coatC = B.c(P);
  const sleeve = B.sleeve ? B.sleeve(P) : [coatC[0], coatC[1]];
  const sleeveW = B.sleeveW || 4;
  const shX = lerp(-7.2, -4.5, V.side);
  const uOff = p.dead ? 0 : (p.wArm ? p.wArm.off : 0);
  const offHand = handAt(uOff, V, -SIDE_HAND_X + (profile ? 4.1 : 0));
  const drawOffArm = () => {
    // Shoulder, elbow, hand: the elbow bows away from the body, so the arm
    // bends like an arm and shortens as the hand comes toward the viewer.
    const A = armIk(shX, SHOULDER_Y, offHand.x, offHand.y, 1);
    const w = sleeveW * 0.9;
    ctx.strokeStyle = OUT; ctx.lineWidth = w + 3;
    ctx.beginPath(); ctx.moveTo(shX, SHOULDER_Y); ctx.lineTo(A.ex, A.ey); ctx.lineTo(A.hx, A.hy); ctx.stroke();
    ctx.strokeStyle = col(sleeve[1]); ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(shX, SHOULDER_Y); ctx.lineTo(A.ex, A.ey); ctx.lineTo(A.hx, A.hy); ctx.stroke();
    // A hand nearer the viewer is drawn a little bigger.
    ctx.beginPath(); ctx.arc(A.hx, A.hy, O.hands.r * (0.85 + 0.22 * offHand.fwd * V.depth), 0, TAU); fillOut(col(O.hands.c(P)), 1);
  };
  const offInFront = profile ? back : offHand.fwd * V.depth >= 0;
  if (!offInFront) drawOffArm();

  // --- the body: a coat, armour, a robe -----------------------------------------
  const swing = G.near.x * 0.25 * V.side;
  const hem = B.hem ?? -11, fl = B.flare || 0;
  ctx.beginPath();
  ctx.moveTo(-6.5, -30);
  ctx.quadraticCurveTo(-8.5, -21, -9 - fl + swing * 0.3, hem);
  ctx.lineTo(9 + fl + swing * 0.3, hem);
  ctx.quadraticCurveTo(8.5, -21, 6.5, -30);
  ctx.quadraticCurveTo(0, -33, -6.5, -30);
  ctx.closePath();
  fillOut(col(coatC[0]));
  if (!flashing) {
    ctx.save(); ctx.clip();
    // Lit from the upper left: a light edge on the left, shade on the right.
    // (The figure is mirrored when facing left; the light is not.)
    ctx.fillStyle = back ? coatC[1] : coatC[2];
    ctx.globalAlpha = alpha * 0.55;
    ctx.fillRect(s > 0 ? -10 - fl : 5.5, -34, 4.5 + (s > 0 ? 0 : fl), 34);
    ctx.fillStyle = coatC[1];
    ctx.globalAlpha = alpha * 0.8;
    ctx.fillRect(s > 0 ? 3.5 : -11.5 - fl, -34, 8 + fl, 34);
    ctx.globalAlpha = alpha;
    if (B.pattern) B.pattern(h);
    ctx.strokeStyle = coatC[1]; ctx.lineWidth = 1.2;
    const op = B.open;
    if (!back) {
      if (op === 'lapel' || op === 'laces' || op === 'buttons' || op === 'fur') {
        ctx.beginPath(); ctx.moveTo(openX, -29); ctx.lineTo(openX + 0.5 + swing * 0.2, hem); ctx.stroke();
      }
      if (op === 'lapel' && !profile) {
        // The lapels: a V down from the collar, centred facing the camera and
        // swung toward the facing side on a diagonal - the clearest sign, at
        // this size, of which way the chest is turned.
        const wl = square ? 3.2 : 4.2, wr = square ? 3.2 : 1.6;
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(openX - wl, -30.5); ctx.lineTo(openX, -23.5); ctx.lineTo(openX + wr, -30.5); ctx.stroke();
      }
      if (op === 'laces') {
        ctx.strokeStyle = P.leather[2]; ctx.lineWidth = 0.7; ctx.beginPath();
        for (let y = -28.5; y < -20; y += 2) { ctx.moveTo(openX - 1.4, y); ctx.lineTo(openX + 1.4, y + 1.6); ctx.moveTo(openX + 1.4, y); ctx.lineTo(openX - 1.4, y + 1.6); }
        ctx.stroke();
      }
      if (op === 'buttons') { ctx.fillStyle = P.metal[2]; for (let y = -28; y < -14; y += 2.8) { ctx.beginPath(); ctx.arc(openX + 1.4, y, 0.8, 0, TAU); ctx.fill(); } }
      if (op === 'wrap') {
        // A wrapped front: the collar crosses from the far shoulder to the
        // waist, a pale under-collar showing beside it.
        ctx.strokeStyle = '#e8e0cc'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(openX - 4.2, -30.6); ctx.lineTo(openX + 2.6, -19.5); ctx.stroke();
        ctx.strokeStyle = P.cloth2[0]; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(openX - 2.4, -30.8); ctx.lineTo(openX + 3.8, -20.4); ctx.stroke();
      }
      if (op === 'fur') { ctx.fillStyle = M_FUR; ctx.fillRect(openX - 1.4, -30, 2.8, hem + 30); }
    } else if (square && op !== 'none') {
      // From straight behind: the seam down the back.
      ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(0, hem); ctx.stroke();
    }
    ctx.restore();
    if (B.open === 'fur') {
      ctx.fillStyle = M_FUR;
      for (let x = -9 - fl; x <= 9 + fl; x += 2.6) { ctx.beginPath(); ctx.arc(x + swing * 0.3, hem, 1.7, 0, TAU); ctx.fill(); }
    }
  }
  O.belt.draw(h);
  // Facing the camera, the scarf's knot shows at the throat.
  if (O.neck.knot && !back) { ctx.fillStyle = accent; ctx.fillRect((square ? 0 : openX) - 2.3, -31, 4.4, 2.6); }

  if (back) {
    // From behind: long hair, what is carried, and a cape over them all.
    if (!hatHides && O.hair.behind) O.hair.behind(h);
    if (O.back.back) O.back.back(h);
    if (capeLen) drawCape(true);
  } else if (O.back.strapsFront) O.back.strapsFront(h);
  if (O.neck.front) O.neck.front(h);

  // Shoulder pieces: the near one always, the far one unless in profile.
  if (O.shoulders.draw) {
    if (!profile) O.shoulders.draw(h, shX, -1);
    O.shoulders.draw(h, lerp(7.2, 5, V.side), 1);
  }
  if (offInFront) drawOffArm();

  // --- the head -----------------------------------------------------------------
  // Turned toward the camera, how much of the head is face and how much is
  // hair says which way it looks: all face straight on, hair over the back
  // third on a diagonal, the back half in profile - with the ear where the
  // two meet.
  const showFace = O.hat.face !== false;
  const bareTop = O.hat.hair === 'show' && !O.hair.bald;
  ctx.beginPath(); ctx.arc(hx, hy, 6.2, 0, TAU); fillOut(col(back ? hairCol : P.skin[0]), 1.5);
  if (!back && !square && !flashing) {
    const edge = profile ? hx - 1 : hx - 3.2;         // where the hair begins
    ctx.save();
    ctx.beginPath(); ctx.arc(hx, hy, 5.5, 0, TAU); ctx.clip();
    ctx.fillStyle = hairCol;
    ctx.fillRect(hx - 7, hy - 7, edge - (hx - 7), 9.5);
    ctx.restore();
    ctx.fillStyle = P.skin[1];
    ctx.beginPath(); ctx.arc(edge + 0.6, hy + 1, 1.5, 0, TAU); ctx.fill();   // the ear
  }
  if (back && !square && !flashing) {
    // Three-quarters from behind: a sliver of cheek and ear on the facing side.
    ctx.fillStyle = P.skin[0];
    ctx.beginPath(); ctx.arc(hx + 4.4, hy + 1, 2, -1.2, 1.6); ctx.fill();
  }
  if (bareTop && !back && !flashing) {
    // No hat: the hair over the crown and a fringe.
    ctx.save();
    ctx.beginPath(); ctx.arc(hx, hy, 5.6, 0, TAU); ctx.clip();
    ctx.fillStyle = hairCol;
    ctx.fillRect(hx - 7, hy - 7, 14, square ? 3.6 : 3);
    ctx.restore();
  }
  if (!back && !flashing && showFace) {
    if (square) {
      // Straight at the camera: shade under the chin, two eyes either side
      // of the middle.
      ctx.fillStyle = P.skin[1];
      ctx.beginPath(); ctx.ellipse(hx, hy + 3.6, 4.4, 2, 0, 0, Math.PI); ctx.fill();
      ctx.fillStyle = OUT;
      ctx.fillRect(hx - 3, hy - 0.6, 1.5, 2);
      ctx.fillRect(hx + 1.5, hy - 0.6, 1.5, 2);
    } else {
      ctx.fillStyle = P.skin[1];
      if (s > 0) { ctx.beginPath(); ctx.arc(hx + 2.2, hy + 1, 4.4, -0.9, 1.9); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(hx - 2.2, hy + 1, 4.4, 1.25, 4.05); ctx.fill(); }
      // Eyes looking the way you face. On a diagonal both show, spaced across
      // the turned face, the far one narrower.
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
  if (!back && showFace) O.face.draw(h);
  if (bareTop && O.hair.top) O.hair.top(h);
  if (back && O.neck.behind) O.neck.behind(h);

  // --- the hat ------------------------------------------------------------------
  O.hat.draw(h);

  ctx.restore();
  ctx.globalAlpha = 1;
}

/**
 * The weapon arm, drawn from the shoulder to the hand the weapon is held in
 * (`wandererHold`). In world space, since the hand swings all round. The
 * shoulder moves out to the edge of the coat as the figure turns to face the
 * camera or away from it. Its sleeve and glove come from the outfit.
 */
export function drawWandererArm(p, ctx, hold, bob, behind) {
  if (!hold || p.dead) return;
  const hx = hold.x, hy = hold.y;
  const s = p.wS || 1;
  const V = viewOf(p);
  const G = p.wG;
  const O = resolveOutfit();
  const P = O.P;
  const coatC = O.body.c(P);
  const sleeve = O.body.sleeve ? O.body.sleeve(P) : [coatC[0], coatC[1]];
  const sleeveW = O.body.sleeveW || 4;
  const shift = G ? G.shift * (1 - V.side) * 0.6 : 0;
  const sx0 = p.x + s * (lerp(7.2, 5, V.side) + shift);
  const sy0 = p.y + 12 + bob - 27 + (p.wBodyY || 0);
  const flashing = p.hurtFlash > 0 && Math.sin(performance.now() * 0.06) > 0;
  const col = (c) => (flashing ? '#fff' : c);
  ctx.globalAlpha = p.ghost ? 0.45 : p.invuln > 0 && !p.dashing ? 0.62 : 1;
  ctx.lineCap = 'round';
  // Shoulder, elbow, hand: the elbow bows away from the body.
  const A = armIk(sx0, sy0, hx, hy, -s);
  ctx.strokeStyle = OUT; ctx.lineWidth = sleeveW + 3;
  ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(A.ex, A.ey); ctx.lineTo(A.hx, A.hy); ctx.stroke();
  ctx.strokeStyle = col(behind ? sleeve[1] : sleeve[0]); ctx.lineWidth = sleeveW;
  ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(A.ex, A.ey); ctx.lineTo(A.hx, A.hy); ctx.stroke();
  const Hd = O.hands;
  // A bracer or a gauntlet's cuff along the forearm, near the hand.
  if (Hd.bracer || Hd.cuff || Hd.band) {
    const u = Hd.bracer ? 0.15 : 0.55;
    const bx = lerp(A.ex, hx, u), by = lerp(A.ey, hy, u);
    ctx.strokeStyle = OUT; ctx.lineWidth = sleeveW + 2.6;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(lerp(A.ex, hx, 0.92), lerp(A.ey, hy, 0.92)); ctx.stroke();
    ctx.strokeStyle = col(Hd.bracer ? Hd.bracer(P) : Hd.cuff ? Hd.cuff(P) : Hd.band); ctx.lineWidth = sleeveW + 0.2;
    ctx.stroke();
  }
  ctx.fillStyle = col(Hd.c(P));
  ctx.beginPath(); ctx.arc(hx, hy, Hd.r * (1 + 0.22 * (hold.fwd || 0) * V.depth), 0, TAU); ctx.fill();
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.globalAlpha = 1;
}
