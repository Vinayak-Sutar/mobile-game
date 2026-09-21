// The Wanderer: a second look for the player, drawn for The Wilds' art.
//
// The Hooded One is drawn straight from above and turns bodily with your
// aim, which suits the chambers' flat floors. The Wilds are drawn in a 3/4
// view - cliff faces from the front, pines standing up - so the Wanderer
// stands up too: feet on the ground, head above them, turning left or right
// and showing the face or the back, as characters in 3/4 games do.
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
import { tuning } from './state.js';

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

// --- the weapon at rest ----------------------------------------------------------
// Walking about, a person carries a weapon; they do not point it. Each weapon
// has a resting carry in the figure's own frame (x toward the way it faces,
// y up from the feet): where the hand is and which way the weapon points.
// Angles are canvas angles for a figure facing right (positive is downward).
const CARRY = {
  blade: { x: 6, y: -17, a: 0.62 },      // low at the side, point down and ahead
  spear: { x: 6, y: -18, a: -1.92 },     // upright, slanted back, butt by the heel
  maul: { x: 7, y: -16, a: -2.3 },       // haft in the fist, head on the shoulder
  bow: { x: 6, y: -18, a: 0.15 },        // held low, limbs up and down
  gun: { x: 6, y: -17, a: 0.9 },         // muzzle down, ahead of the feet
  longarm: { x: 6, y: -17, a: 0.8 },
  shield: { x: 7, y: -19, a: 1.2 },      // on the forearm at the side
};

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
  const c = CARRY[p.weapon.id] || CARRY.blade;
  const G = p.wG;
  // The carrying arm counter-swings the legs, a little.
  const swing = G && !p.dead ? G.far.x * 0.35 : 0;
  const x = p.x + s * (c.x + swing);
  const y = p.y + 12 + bob + (p.wBodyY || 0) + c.y;
  const angle = s > 0 ? c.a : Math.PI - c.a;
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
//     (pushing off, body highest) - then the same on the other leg. Eight
//     poses per stride, about twenty pose changes a second at a run.
//   - The planted foot stays put on the ground and slides back under the
//     body; only the swinging foot leaves the ground, in an arc.
//   - Each leg is a thigh and a shin of fixed length, placed by two-bone IK
//     from the hip to where the foot must be, so the knee bends like a knee
//     and a leg never stretches or wobbles.
//   - The body does not squash, stretch or rock: it drops a unit on "down"
//     and rises a unit on "up", and the hips carry it. That small, stepped
//     rise and fall is what reads as weight.
const FRAMES = 8;
const BOB = [0, 1, 0, -1, 0, 1, 0, -1];      // contact, down, passing, up (x2)
const THIGH = 6.2, SHIN = 6.2, HIP_Y = -14, ANKLE_Y = -2.5;   // legs straight at contact, soft at rest

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

/** This frame's pose for the legs and the body (all in the figure's frame). */
function gait(p, s, dt) {
  const now = performance.now() * 0.001;
  const air = !!(p.hop || p.leap || (p.z || 0) > 0.5);
  const walking = p.moveMag > 0.08 && !p.dead && !p.dashing && !air;
  // Steps come quicker the faster you move (the speed setting too), so the
  // feet keep up with the ground instead of skating over it.
  if (walking) p.wPhase = ((p.wPhase || 0) + dt * (1.5 + 0.8 * p.moveMag) * (p.groundMult || 1) * (0.4 + 0.6 * tuning.speed / 0.85)) % 1;
  const frame = Math.floor((p.wPhase || 0) * FRAMES) % FRAMES;

  // The way you walk, in the figure's frame: backing away steps backwards;
  // walking up or down the screen takes shorter, deeper steps.
  const mx = Math.cos(p.moveAngle), my = Math.sin(p.moveAngle);
  const dir = mx * s < -0.2 ? -1 : 1;
  const R = 4.5 * Math.max(0.3, Math.abs(mx));            // half a step

  let near, far, bodyY = 0, lean = 0;
  if (p.dead) {
    near = { x: 1.5, lift: 0 }; far = { x: -1.5, lift: 0 };
  } else if (air) {
    near = { x: 3, lift: 4.5 }; far = { x: -2, lift: 5.5 };           // tucked in the air
  } else if (p.dashing) {
    const d = Math.cos(p.dashDir) * s < -0.2 ? -1 : 1;
    near = { x: 7 * d, lift: 0 }; far = { x: -7 * d, lift: 2.5 };     // a held lunge
    bodyY = 1; lean = 0.12 * d;
  } else if (walking) {
    const u = frame / FRAMES;
    const a = footAt(u, R, 4), b = footAt((u + 0.5) % 1, R, 4);
    near = { x: a.x * dir, lift: a.lift, y: a.x * my * 0.45 };
    far = { x: b.x * dir, lift: b.lift, y: b.x * my * 0.45 };
    bodyY = BOB[frame];
    lean = 0.04 * dir;
  } else {
    near = { x: 1.8, lift: 0 }; far = { x: -1.6, lift: 0 };
    bodyY = Math.floor(now / 0.9) % 2 ? 0.5 : 0;                        // breathing, stepped
  }
  return { near, far, bodyY, lean };
}

export function drawWanderer(p, ctx, world, bob) {
  const flashing = p.hurtFlash > 0 && Math.sin(performance.now() * 0.06) > 0;
  const alpha = p.invuln > 0 && !p.dashing ? 0.62 : 1;
  const col = (c) => (flashing ? '#ffffff' : c);
  const accent = col(p.weapon.color);

  const s = p.wS || 1;                                  // facing right or left
  const back = wandererFacingAway(p);
  const torso = p.anim.pose.torso || {};
  // The death clip collapses the torso; read it as a fall onto one side.
  const fall = p.dead ? clamp((1.3 - (torso.sy ?? 1)) / 0.8, 0, 1) : 0;
  const moving = p.moveMag > 0.08 && !p.dead;
  const G = p.wG || gait(p, s, 0);
  // Knocked back a step when hit: a held jolt, not a squash.
  const jolt = p.hurtFlash > 0.2 && !p.dead ? -1.5 : 0;

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
  const hipY = HIP_Y + G.bodyY;
  const leg = (f, hipX, width, color) => {
    const L = ik(hipX + jolt, hipY, hipX + f.x, ANKLE_Y - f.lift + (f.y || 0));
    ctx.strokeStyle = OUT; ctx.lineWidth = width + 3;
    ctx.beginPath(); ctx.moveTo(hipX + jolt, hipY); ctx.lineTo(L.kx, L.ky); ctx.lineTo(L.fx, L.fy); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(hipX + jolt, hipY); ctx.lineTo(L.kx, L.ky); ctx.lineTo(L.fx, L.fy); ctx.stroke();
    // The boot: flat on the ground, toe forward; tipped up a little in the air.
    ctx.beginPath(); ctx.ellipse(L.fx + 1.4, L.fy + 1, 3.8, 2.1, f.lift > 0.5 ? -0.25 : 0, 0, TAU); fillOut(col(C.boot), 1.4);
  };
  leg(G.far, -1.8, 4.2, col(C.trouserShade));       // the far leg, in shade
  leg(G.near, 1.8, 4.4, col(C.trouser));            // the near leg

  // Everything above the hips rides the body's rise and fall, and a slight
  // forward lean while walking or dashing.
  ctx.translate(jolt, G.bodyY);
  ctx.rotate(G.lean);

  // --- the scarf, streaming behind (drawn over the back when facing away) --
  const cloakA = p.anim.pose.cloakA || {};
  const scarfLen = 12 * (cloakA.sx ?? 1) + (moving ? 4 : 0);
  const t = performance.now() * 0.001;
  const wave = Math.sin(t * (moving ? 7 : 3) + p.x * 0.01) * (moving ? 1.6 : 0.8);
  const drawScarf = () => {
    const nx = -1, ny = -29;
    ctx.strokeStyle = OUT; ctx.lineWidth = 6.5;
    ctx.beginPath(); ctx.moveTo(nx, ny); ctx.quadraticCurveTo(nx - scarfLen * 0.5, ny + 1 + wave * 0.4, nx - scarfLen, ny + 4 + wave); ctx.stroke();
    ctx.strokeStyle = accent; ctx.lineWidth = 3.8;
    ctx.beginPath(); ctx.moveTo(nx, ny); ctx.quadraticCurveTo(nx - scarfLen * 0.5, ny + 1 + wave * 0.4, nx - scarfLen, ny + 4 + wave); ctx.stroke();
    ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(nx, ny + 1); ctx.quadraticCurveTo(nx - scarfLen * 0.4, ny + 5 - wave * 0.3, nx - scarfLen * 0.8, ny + 9 - wave * 0.5); ctx.stroke();
  };
  if (!back) drawScarf();

  // --- the bedroll, peeking over a shoulder from the front ------------------
  const drawRoll = (y) => {
    ctx.beginPath(); ctx.ellipse(-2, y, 9.5, 3.4, -0.08, 0, TAU); fillOut(col(C.roll), 1.4);
    ctx.fillStyle = col(C.rollShade); ctx.fillRect(-5, y - 3, 1.6, 6.4); ctx.fillRect(2, y - 3, 1.6, 6.4);
  };
  if (!back) drawRoll(-31);

  // --- the far arm (the off hand), counter-swinging -------------------------
  // Arms swing against the legs: the far arm forward as the far leg goes back.
  const offHand = { x: -4.5 - G.far.x * 0.5, y: -19 };
  if (!back) limb(-4.5, -27, offHand.x, offHand.y, 3.6, col(C.coatShade));

  // --- the coat -----------------------------------------------------------------
  const hem = G.near.x * 0.25;
  ctx.beginPath();
  ctx.moveTo(-6.5, -30);
  ctx.quadraticCurveTo(-8.5, -21, -9 + hem * 0.3, -11);
  ctx.lineTo(9 + hem * 0.3, -11);
  ctx.quadraticCurveTo(8.5, -21, 6.5, -30);
  ctx.quadraticCurveTo(0, -33, -6.5, -30);
  ctx.closePath();
  fillOut(col(C.coat));
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
    // The coat's opening and its hem line.
    if (!back) { ctx.strokeStyle = C.coatShade; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(1, -29); ctx.lineTo(1.5 + hem * 0.2, -11); ctx.stroke(); }
    ctx.restore();
  }
  // The belt and its buckle.
  ctx.fillStyle = col(C.belt); ctx.fillRect(-8.2, -18.5, 16.4, 2.6);
  if (!back) { ctx.fillStyle = col(C.buckle); ctx.fillRect(0, -18.8, 3, 3.2); }

  if (back) {
    // From behind: the bedroll across the shoulders, strapped on.
    drawRoll(-28);
    ctx.strokeStyle = col(C.strap); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-6, -31); ctx.lineTo(5, -17); ctx.stroke();
    limb(-4.5, -27, offHand.x, offHand.y, 3.6, col(C.coatShade));
  }

  // --- the head -----------------------------------------------------------------
  const hx = 0.5, hy = -36;
  ctx.beginPath(); ctx.arc(hx, hy, 6.2, 0, TAU); fillOut(col(back ? C.hair : C.skin), 1.5);
  if (!back && !flashing) {
    ctx.fillStyle = C.skinShade;
    if (s > 0) { ctx.beginPath(); ctx.arc(hx + 2.2, hy + 1, 4.4, -0.9, 1.9); ctx.fill(); }
    else { ctx.beginPath(); ctx.arc(hx - 2.2, hy + 1, 4.4, 1.25, 4.05); ctx.fill(); }
    // Eyes in the hat's shade, looking the way you face.
    ctx.fillStyle = OUT;
    ctx.fillRect(hx + 1.2, hy - 0.6, 1.5, 2);
    ctx.fillRect(hx + 4, hy - 0.6, 1.4, 2);
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
 * (`wandererHold`). In world space, since the hand swings all round.
 */
export function drawWandererArm(p, ctx, hold, bob, behind) {
  if (!hold || p.dead) return;
  const hx = hold.x, hy = hold.y;
  const s = p.wS || 1;
  const sx0 = p.x + s * 5, sy0 = p.y + 12 + bob - 27 + (p.wBodyY || 0);
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
