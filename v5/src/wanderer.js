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

import { TAU, clamp } from './util.js';
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
  return Math.sin(p.aimAngle) < -0.25;
}

export function drawWanderer(p, ctx, world, bob) {
  const pose = p.anim.pose;
  const flashing = p.hurtFlash > 0 && Math.sin(performance.now() * 0.06) > 0;
  const alpha = p.invuln > 0 && !p.dashing ? 0.62 : 1;
  const col = (c) => (flashing ? '#ffffff' : c);
  const accent = col(p.weapon.color);

  const s = Math.cos(p.aimAngle) >= 0 ? 1 : -1;        // facing right or left
  const back = wandererFacingAway(p);
  const torso = pose.torso || {};
  const tsx = torso.sx ?? 1, tsy = torso.sy ?? 1;

  // The death clip collapses the torso; read it as a fall onto one side.
  const fall = p.dead ? clamp((1.3 - tsy) / 0.8, 0, 1) : 0;
  const moving = p.moveMag > 0.08 && !p.dead;
  const step = moving ? Math.abs(torso.y || 0) * 1.4 : 0;   // a bob per footfall
  const lean = moving ? 0.07 * p.moveMag : 0;
  const dashLean = (tsx - 1) * 0.8;                        // the dash stretch tips it forward

  ctx.save();
  ctx.globalAlpha = alpha;
  // Stand on the feet: everything below is drawn with y up from the ground.
  ctx.translate(p.x, p.y + 12 + bob);
  ctx.rotate(s * (lean + dashLean + fall * 1.3));
  // Squash and stretch from the rig (breathing, dash, hurt), about the feet.
  const sx = 1 + (tsx - 1) * 0.6, sy = 1 + (tsy - 1) * 0.7;
  ctx.scale(s * (p.dead ? 1 : sx), p.dead ? 1 - fall * 0.2 : sy);
  ctx.translate(0, -step);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const fillOut = (color, w = 1.6) => { ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = w; ctx.stroke(); };
  const limb = (x0, y0, x1, y1, width, color) => {
    ctx.strokeStyle = OUT; ctx.lineWidth = width + 3;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  };

  // --- the scarf, streaming behind (drawn over the back when facing away) --
  const cloakA = pose.cloakA || {}, cloakB = pose.cloakB || {};
  const scarfLen = 12 * (cloakA.sx ?? 1) + (moving ? 4 : 0);
  const t = performance.now() * 0.001;
  const wave = Math.sin(t * 6 + p.x * 0.01) * 2 + (cloakB.angle || 0) * 8;
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

  // --- legs: the rig's stride, as steps -------------------------------------
  // The rig's legs are mirrored bones, so legL's angle and legR's angle
  // negated are both "how far forward": read that way they swing in opposite
  // phase, a real stride. Which foot is in the air comes from the run clip's
  // own clock (legL swings forward in the clip's second half, legR in its
  // first), so it never flickers between frames. The stride follows the way
  // you walk: backing away steps backwards, walking up or down the screen
  // takes shorter side-on steps.
  const legL = pose.legL || {}, legR = pose.legR || {};
  const aL = legL.angle || 0, aR = -(legR.angle || 0);
  const run = p.anim.clip && p.anim.clip.name === 'run';
  const ph = run ? (p.anim.time % p.anim.clip.duration) / p.anim.clip.duration : 0;
  const liftL = run ? Math.max(0, Math.sin((ph - 0.5) * TAU)) : 0;
  const liftR = run ? Math.max(0, Math.sin(ph * TAU)) : 0;
  const along = moving ? Math.cos(p.moveAngle) * s : 1;
  const dir = along < -0.2 ? -1 : 1;
  const reach = moving ? Math.max(0.4, Math.abs(Math.cos(p.moveAngle))) : 1;
  const leg = (a, lift, hipX, width, color) => {
    const fx = hipX + clamp(a, -1.2, 1.2) * 7 * dir * reach;
    const up = lift * 3.6;
    const fy = -2.5 - up;
    const kx = (hipX + fx) / 2 + (1 + up * 0.8) * dir, ky = (-14 + fy) / 2;
    // Both outlines first, then both fills, so the knee shows no seam.
    ctx.strokeStyle = OUT; ctx.lineWidth = width + 3;
    ctx.beginPath(); ctx.moveTo(hipX, -14); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(hipX, -14); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(fx + 1.3, fy + 0.9, 3.7, 2.2, 0, 0, TAU); fillOut(col(C.boot), 1.4);
  };
  leg(aR, liftR, -2, 4.2, col(C.trouserShade));     // the far leg, in shade
  leg(aL, liftL, 2, 4.4, col(C.trouser));           // the near leg

  // --- the bedroll, peeking over a shoulder from the front ------------------
  const drawRoll = (y) => {
    ctx.beginPath(); ctx.ellipse(-2, y, 9.5, 3.4, -0.08, 0, TAU); fillOut(col(C.roll), 1.4);
    ctx.fillStyle = col(C.rollShade); ctx.fillRect(-5, y - 3, 1.6, 6.4); ctx.fillRect(2, y - 3, 1.6, 6.4);
  };
  if (!back) drawRoll(-31);

  // --- the far arm (the off hand), counter-swinging -------------------------
  const armL = pose.armL || {};
  const offSwing = clamp(armL.angle || 0, -1.6, 1.6);
  const offHand = { x: -5 - Math.sin(offSwing) * 5, y: -19 + Math.abs(Math.sin(offSwing)) * 1.5 };
  if (!back) limb(-4.5, -27, offHand.x, offHand.y, 3.6, col(C.coatShade));

  // --- the coat -----------------------------------------------------------------
  const hem = aL * 1.4;
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
  const head = pose.head || {};
  const hx = (head.x || 0) * 0.6 + 0.5, hy = -36;
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
 * (the rig's hand, lifted). In world space, since the hand swings all round.
 */
export function drawWandererArm(p, ctx, lifted, bob, behind) {
  const hand = boneAt(lifted, PLAYER_SKELETON, 'armR');
  if (!hand || p.dead) return;
  const reach = (p.anim.pose.armR && p.anim.pose.armR.sx) || 1;
  const hx = hand.x + Math.cos(hand.angle) * reach * 11;
  const hy = hand.y + Math.sin(hand.angle) * reach * 11;
  const s = Math.cos(p.aimAngle) >= 0 ? 1 : -1;
  const sx0 = p.x + s * 5, sy0 = p.y + 12 + bob - 27;
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
