// Figures: the enemies drawn as little people and beasts, for the Wanderer's art.
//
// The old enemies are abstract shapes seen from straight above - which suits
// the Hooded One's flat chambers. With the Wanderer, the world is seen in a
// 3/4 view and everything stands up: so do the enemies. Each is a small
// figure - a goblin, a skeleton archer, a boar-folk brute, a kappa - with a
// walk, and a pose for every step of its fight, so its wind-up reads at a
// glance (the fairness rule: nothing hurts you without a tell).
//
// How it is drawn. Every figure is one PUPPET, built in its own 3D frame:
//   f  forward (the way it faces), r  to its right, h  up from the ground.
// The puppet is turned to one of eight directions (like 8-direction sprites)
// and projected to the screen: the ground plane squashed to half height, up
// drawn straight up. Because every part is placed in the same 3D frame, the
// eight views always agree with one another, and limbs are drawn far side
// first so a figure turned away shows its back.
//   - Legs are hip -> knee -> foot with the knee bent forward by two-bone IK;
//     the walk is the Wanderer's: stepped key poses ("on twos"), driven by the
//     ground actually covered, the planted foot sliding back under the body.
//   - Arms are shoulder -> elbow -> hand, the elbow bending back and out; a
//     pose puts the hands where the fight needs them and the weapon follows.
//   - A creature is a set of numbers (its build), a palette, a head, a
//     weapon, and a POSE function reading the enemy's own state machine -
//     so the drawing and the hitboxes never disagree, and nothing about how
//     any enemy fights is changed here.
//
// Only drawn when the Wanderer's look is in use (the Wilds, or a chamber run
// with the Wanderer): the Hooded One keeps the old top-down shapes.

import { world } from './state.js';
import { TAU, clamp, lerp, angleDiff } from './util.js';
import { look } from './wanderer.js';

const OUT = '#1b130f';
const OCT = Math.PI / 4;
const REF = 17;                 // an enemy of this radius is drawn at scale 1
const FRAMES = 8;
const BOB = [0, 0.8, -0.8, -0.8, 0, 0.8, -0.8, -0.8];

/** Lighten (amt > 0) or darken (amt < 0) a hex colour. */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => clamp(Math.round(c + amt * 255), 0, 255));
  return `#${((ch[0] << 16) | (ch[1] << 8) | ch[2]).toString(16).padStart(6, '0')}`;
}

const BODY = {
  legL: 12, hipW: 3, torsoH: 12, torsoW: 12, torsoD: 8, shW: 5.5, armL: 11, neck: 1.5, headR: 6,
  legW: 3.6, armW: 3.2, legs: true, arms: true, cycle: 80, stride: 4,
};

// --- facing and the walk -------------------------------------------------------------

const octOf = (a) => ((Math.round(a / OCT) % 8) + 8) % 8;

function footAt(u, R, L) {
  if (u < 0.5) return { f: R - (u / 0.5) * 2 * R, lift: 0 };
  const v = (u - 0.5) / 0.5, e = v * v * (3 - 2 * v);
  return { f: -R + e * 2 * R, lift: Math.sin(v * Math.PI) * L };
}

function prepare(e, F) {
  const now = world.runTime || 0;
  const dt = clamp(now - (e.gT ?? now), 0, 0.05);
  e.gT = now;
  const dx = e.x - (e.gLX ?? e.x), dy = e.y - (e.gLY ?? e.y);
  e.gLX = e.x; e.gLY = e.y;
  const moved = Math.hypot(dx, dy);
  const step = moved < 90 ? moved : 0;
  const speed = dt > 0 ? step / dt : 0;
  e.gSpeed = lerp(e.gSpeed || 0, speed, 0.35);
  const moving = e.gSpeed > 14;
  if (step > 0.3) e.gMove = Math.atan2(dy, dx);
  const B = F.B;
  if (moving) e.gPhase = ((e.gPhase || 0) + step / B.cycle) % 1;

  // Which way it faces: at you while it fights, the way it goes while it walks.
  const p = world.player;
  const toP = p ? Math.atan2(p.y - e.y, p.x - e.x) : (e.face || 0);
  let want;
  if (F.aimAt && F.aimAt(e)) want = e.aim ?? toP;
  else if (moving && e.gMove !== undefined) want = e.gMove;
  else want = toP;
  if (e.gOct === undefined) e.gOct = octOf(want);
  let target = e.gOct;
  if (Math.abs(angleDiff(e.gOct * OCT, want)) > OCT / 2 + 0.12) target = octOf(want);
  e.gTurn = Math.max(0, (e.gTurn || 0) - dt);
  if (target !== e.gOct && e.gTurn <= 0) {
    const d = (target - e.gOct + 8) % 8;
    e.gOct = (e.gOct + (d <= 4 ? 1 : 7)) % 8;
    e.gTurn = F.aimAt && F.aimAt(e) ? 0.02 : 0.05;
  }

  // The legs: a stepped stride, or feet at rest.
  const frame = Math.floor((e.gPhase || 0) * FRAMES) % FRAMES;
  const R = B.stride * clamp(e.gSpeed / 150, 0.6, 1.4);
  let near, far, bob = 0;
  if (moving) {
    const u = frame / FRAMES;
    near = footAt(u, R, 3.2); far = footAt((u + 0.5) % 1, R, 3.2);
    bob = BOB[frame];
  } else {
    const w = Math.floor((now + (e.seed || 0)) / 2.8) % 2;
    near = { f: w ? 1.2 : 0.6, lift: 0 }; far = { f: w ? -1 : -1.6, lift: 0 };
    bob = Math.floor((now + (e.seed || 0)) / 0.9) % 2 ? 0.4 : 0;
  }
  return { near, far, bob, moving, frame, now, R };
}

// --- the puppet ------------------------------------------------------------------------

/**
 * Draw one figure. Returns false (and draws nothing) when this enemy has no
 * figure, the Hooded One's look is in use, or the moment is one its old
 * drawing shows better (a swarm of sparks, a burial mound).
 */
export function drawFigure(e, ctx) {
  if (look.skin !== 'wanderer') return false;
  const F = FIGS[e.type];
  if (!F || (F.skip && F.skip(e))) return false;
  F.B = F.B || { ...BODY, ...F.body };
  const B = F.B;
  const G = prepare(e, F);
  const a = e.gOct * OCT;
  const ca = Math.cos(a), sa = Math.sin(a);
  const sc = (e.r / REF) * (F.scale || 1);
  const flash = e.flash > 0;
  const tinted = !flash && e.tint && e.tint !== e.color;
  const C = F.c;
  const col = (c) => (flash ? '#ffffff' : c);
  const main = flash ? '#ffffff' : tinted ? e.tint : C.main;

  const P = { crouch: 0, lean: 0, float: 0, alpha: 1, air: false, sit: false, shake: 0, ...F.pose(e, G, B) };
  const hipH = B.legL - P.crouch + G.bob * (B.legs ? 1 : 0.5) + (P.sit ? -B.legL * 0.45 : 0);
  const shH = hipH + B.torsoH;
  const lean = P.lean;
  // Body frame: everything above the hips leans forward with the torso.
  const bodyF = (f, h) => f + lean * Math.max(0, h - hipH);
  const shake = P.shake ? Math.sin((world.runTime || 0) * 60) * P.shake : 0;
  const pr = (f, r, h) => [f * ca - r * sa + shake, (f * sa + r * ca) * 0.5 - h];
  const depth = (f, r) => f * sa + r * ca;

  ctx.save();
  const feetY = e.y + e.r * 0.72;
  // Climbing out of the ground: nothing below the ground line shows.
  if (P.rise !== undefined) { ctx.beginPath(); ctx.rect(e.x - 200, feetY - 400, 400, 402); ctx.clip(); }
  ctx.translate(e.x, feetY - (e.z || 0) - P.float * sc);
  ctx.scale(sc, sc);
  ctx.globalAlpha = P.alpha;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const limb = (pts, w, color) => {
    ctx.strokeStyle = OUT; ctx.lineWidth = w + 2.6;
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = w;
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
  };
  const fillOut = (color, w = 1.4) => { ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = w; ctx.stroke(); };
  const joint = (A, Bp, L, bend) => {
    const d = Math.hypot(Bp[0] - A[0], Bp[1] - A[1], Bp[2] - A[2]);
    const off = d < L ? Math.sqrt(Math.max(0, (L / 2) ** 2 - (d / 2) ** 2)) : 0;
    return [(A[0] + Bp[0]) / 2 + bend[0] * off, (A[1] + Bp[1]) / 2 + bend[1] * off, (A[2] + Bp[2]) / 2 + bend[2] * off];
  };
  const clampReach = (A, Bp, L) => {
    const d = Math.hypot(Bp[0] - A[0], Bp[1] - A[1], Bp[2] - A[2]);
    if (d <= L) return Bp;
    const k = L / d;
    return [A[0] + (Bp[0] - A[0]) * k, A[1] + (Bp[1] - A[1]) * k, A[2] + (Bp[2] - A[2]) * k];
  };

  // Everything the head and the decorations need.
  const g = {
    e, F, C, B, P, G, ca, sa, sc, col, main, flash, fillOut, limb, pr, depth, hipH, shH,
    toward: sa, away: sa < -0.3, front: sa > 0.3, t: world.runTime || 0,
    body: (f, r, h) => pr(bodyF(f, h), r, h),
  };

  // --- the parts, each with a depth: far ones first --------------------------------
  const parts = [];

  // Legs.
  if (B.legs) {
    for (const [side, foot, dark] of [[1, G.near, false], [-1, G.far, true]]) {
      let ff = foot.f, lift = foot.lift;
      if (P.air) { ff = side > 0 ? 2 : -1.5; lift = 3.5; }
      if (P.stance === 'wide') ff = side > 0 ? 4.5 : -4;
      if (P.sit) { ff = 4; lift = 0; }
      if (P.feet) { ff = P.feet[side > 0 ? 0 : 1]; }
      const hip = [0, side * B.hipW, hipH];
      const foot3 = clampReach(hip, [ff, side * B.hipW * 0.95, lift], B.legL + 0.5);
      const knee = joint(hip, foot3, B.legL, [1, 0, 0]);
      const color = col(dark ? shade(C.leg || C.main, -0.12) : (C.leg || C.main));
      parts.push({
        d: depth(0, side * B.hipW) - 0.01,
        draw: () => {
          limb([pr(...hip), pr(...knee), pr(...foot3)], B.legW, color);
          const [fx, fy] = pr(foot3[0] + 1.2, foot3[1], foot3[2]);
          ctx.beginPath(); ctx.ellipse(fx, fy + 0.6, 2.2 + 1.2 * Math.abs(ca), 1.8, 0, 0, TAU);
          fillOut(col(C.foot || shade(C.leg || C.main, -0.25)), 1.2);
        },
      });
    }
  }

  // Arms, and what the hands hold.
  const hands = {};
  if (B.arms) {
    for (const side of [1, -1]) {
      const key = side > 0 ? 'R' : 'L';
      const sh = [bodyF(0, shH - 1), side * B.shW, shH - 1];
      const want = P[`hand${key}`] || [G.moving ? (side > 0 ? -G.far.f : -G.near.f) * 0.6 : 0.5, side * (B.shW + 1), shH - B.armL * 0.92];
      const hand = clampReach(sh, [bodyF(want[0], want[2]), want[1], want[2]], B.armL);
      const elbow = joint(sh, hand, B.armL, [-0.55, side * 0.55, -0.35]);
      hands[key] = { sh, elbow, hand };
      parts.push({
        d: depth(hand[0] * 0.5, side * B.shW) + (P[`front${key}`] ? 5 : 0),
        draw: () => {
          const wpn = P[`w${key}`];
          const before = wpn && F.weapon && F.weaponBehind && F.weaponBehind(g, key);
          if (before) F.weapon(ctx, g, key, hand, wpn);
          limb([pr(...sh), pr(...elbow), pr(...hand)], B.armW, col(side > 0 ? (C.arm || C.main) : shade(C.arm || C.main, -0.1)));
          const [hx, hy] = pr(...hand);
          ctx.beginPath(); ctx.arc(hx, hy, B.armW * 0.62, 0, TAU); fillOut(col(C.hand || shade(C.arm || C.main, -0.05)), 1.1);
          if (wpn && F.weapon && !before) F.weapon(ctx, g, key, hand, wpn);
        },
      });
    }
  }
  g.hands = hands;

  // Things carried on the back or out front (a quiver, a shell, a sack, a keg).
  for (const it of F.items ? F.items(g) : []) {
    parts.push({ d: depth(it.f ?? 0, it.r ?? 0) + (it.bias || 0), draw: () => it.draw(ctx, g) });
  }

  // The torso, and the head on top of it.
  const torso = {
    d: 0,
    draw: () => {
      if (F.torso && F.torso.replace) { F.torso(ctx, g); return; }
      const hwB = 0.5 * (Math.abs(sa) * B.torsoW * 0.86 + Math.abs(ca) * B.torsoD * 0.9);
      const hwT = 0.5 * (Math.abs(sa) * B.torsoW + Math.abs(ca) * B.torsoD);
      const [bx, by] = pr(0, 0, hipH - 1);
      const [tx, ty] = pr(lean * B.torsoH, 0, shH);
      ctx.beginPath();
      ctx.moveTo(bx - hwB, by);
      ctx.lineTo(tx - hwT, ty + 2);
      ctx.quadraticCurveTo(tx, ty - 2.5, tx + hwT, ty + 2);
      ctx.lineTo(bx + hwB, by);
      ctx.quadraticCurveTo(bx, by + 2, bx - hwB, by);
      ctx.closePath();
      fillOut(main, 1.5);
      if (!flash) {
        ctx.save(); ctx.clip();
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(tx + hwT * 0.25, ty - 4, hwT * 2, by - ty + 8);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(tx - hwT - 2, ty - 4, hwT * 0.45, by - ty + 8);
        ctx.restore();
      }
      if (F.torso) F.torso(ctx, g, { bx, by, tx, ty, hwB, hwT });
    },
  };
  const headAt = pr(bodyF(0, shH + B.neck + B.headR), 0, shH + B.neck + B.headR);
  g.head = { x: headAt[0], y: headAt[1], R: B.headR };
  g.hp = (f, r, h) => [headAt[0] + (f * ca - r * sa), headAt[1] + (f * sa + r * ca) * 0.5 - h];
  g.vis = (f, r) => depth(f, r) > -0.25 * B.headR;
  const head = {
    d: 0.001,
    draw: () => {
      if (B.neck > 2) {
        const [nx, ny] = pr(bodyF(0, shH), 0, shH);
        limb([[nx, ny], headAt], B.armW, col(C.skin || C.main));
      }
      F.head(ctx, g);
    },
  };

  parts.sort((p1, p2) => p1.d - p2.d);
  for (const q of parts) if (q.d < 0) q.draw();
  torso.draw();
  head.draw();
  for (const q of parts) if (q.d >= 0) q.draw();
  if (F.over) F.over(ctx, g);

  ctx.restore();
  // Where the top of the head is on screen: for health bars, names and stars.
  e.figTop = feetY - (e.z || 0) - P.float * sc - (shH + B.neck + B.headR * 2 + (F.crown || 0)) * sc;
  return true;
}

// --- heads and weapons -------------------------------------------------------------------

/** A round head, shaded from the upper left. */
function headBall(ctx, g, color, R = g.head.R) {
  const { x, y } = g.head;
  ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); g.fillOut(g.col(color), 1.4);
  if (!g.flash) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.arc(x + R * 0.35, y + R * 0.3, R * 0.75, -0.6, 2.2); ctx.fill();
  }
}

/** Two eyes on the face, only where the face is turned to the camera. */
function eyes(ctx, g, color, spread = 2.4, up = 0.6, size = 1.5, glow = false) {
  if (g.flash) return;
  const R = g.head.R;
  for (const s of [1, -1]) {
    if (!g.vis(R * 0.85, s * spread)) continue;
    const [x, y] = g.hp(R * 0.8, s * spread, up);
    if (glow) { ctx.fillStyle = color; ctx.globalAlpha *= 0.35; ctx.beginPath(); ctx.arc(x, y, size * 2.2, 0, TAU); ctx.fill(); ctx.globalAlpha /= 0.35; }
    ctx.fillStyle = color;
    ctx.fillRect(x - size / 2, y - size / 2, size, size * 1.3);
  }
}

/** Something sticking out of the head at (f, r, h): a snout, a beak, a nose. */
function nub(ctx, g, f, r, h, rx, ry, color) {
  if (!g.vis(f, r)) return;
  const [x, y] = g.hp(f, r, h);
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); g.fillOut(g.col(color), 1.1);
}

/** Pointed ears or horns: from the side of the head out to a tip. */
function spikes(ctx, g, base, tip, width, color) {
  for (const s of [1, -1]) {
    const [bx, by] = g.hp(base[0], s * base[1], base[2]);
    const [tx, ty] = g.hp(tip[0], s * tip[1], tip[2]);
    const nx = -(ty - by), ny = tx - bx, n = Math.hypot(nx, ny) || 1;
    ctx.beginPath();
    ctx.moveTo(bx + (nx / n) * width, by + (ny / n) * width);
    ctx.lineTo(tx, ty);
    ctx.lineTo(bx - (nx / n) * width, by - (ny / n) * width);
    ctx.closePath();
    g.fillOut(g.col(color), 1.1);
  }
}

/** A straight weapon from the hand along a direction (f, r, h): blade, haft, bow. */
function along(g, hand, dir, len) {
  const n = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  return [hand[0] + (dir[0] / n) * len, hand[1] + (dir[1] / n) * len, hand[2] + (dir[2] / n) * len];
}

function drawBlade(ctx, g, hand, dir, len, blade, grip = '#4a3424', width = 2.6) {
  const tip = along(g, hand, dir, len);
  const hilt = along(g, hand, dir, -2);
  const a = g.pr(...hilt), b = g.pr(...hand), c = g.pr(...tip);
  g.limb([a, b], 2.4, g.col(grip));
  g.limb([b, c], width, g.col(blade));
}

function drawMaul(ctx, g, hand, dir, len, head = '#6a6a72') {
  const tip = along(g, hand, dir, len);
  const butt = along(g, hand, dir, -4);
  g.limb([g.pr(...butt), g.pr(...tip)], 2.6, g.col('#5a3a22'));
  const [x, y] = g.pr(...tip);
  ctx.beginPath(); ctx.ellipse(x, y, 5.2, 4.2, 0, 0, TAU); g.fillOut(g.col(head), 1.4);
  if (!g.flash) { ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(x - 3.5, y - 3, 3, 2); }
}

function drawAxe(ctx, g, hand, dir, len) {
  const tip = along(g, hand, dir, len);
  g.limb([g.pr(...along(g, hand, dir, -3)), g.pr(...tip)], 2.2, g.col('#5a3a22'));
  const [x, y] = g.pr(...tip);
  const [bx, by] = g.pr(...along(g, hand, dir, len - 5));
  const nx = -(y - by), ny = x - bx, n = Math.hypot(nx, ny) || 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + (nx / n) * 6 + (x - bx) * 0.3, y + (ny / n) * 6 + (y - by) * 0.3);
  ctx.lineTo(bx + (nx / n) * 6, by + (ny / n) * 6);
  ctx.lineTo(bx, by);
  ctx.closePath();
  g.fillOut(g.col('#9aa4a8'), 1.2);
}

/** A flat thing held facing forward: a shield, seen at its angle. */
function drawPlate(ctx, g, center, halfW, halfH, color, trim) {
  const [cf, cr, chh] = center;
  const pts = [[cf, cr - halfW, chh + halfH], [cf, cr + halfW, chh + halfH], [cf, cr + halfW, chh - halfH], [cf, cr - halfW, chh - halfH]].map((q) => g.pr(...q));
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
  g.fillOut(g.col(color), 1.5);
  if (trim && !g.flash) {
    ctx.strokeStyle = trim; ctx.lineWidth = 1.4;
    const [x, y] = g.pr(cf, cr, chh);
    ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, halfH * 0.35), 0, TAU); ctx.stroke();
  }
}

// --- helpers for poses --------------------------------------------------------------------

const kOf = (e, total) => clamp(1 - (e.t || 0) / total, 0, 1);
const ease = (k) => k * k * (3 - 2 * k);

// --- the roster ----------------------------------------------------------------------------
// Each creature: its build (body), palette (c), head, weapon, pose - and which
// states turn it to face you (aimAt).

const FIGS = {
  // --- Goblin Cutthroat (the wretch): darts in, crouches, lunges with a knife.
  wretch: {
    scale: 1.12,
    body: { legL: 9, torsoH: 9, torsoW: 10, torsoD: 7, shW: 4.6, armL: 9, headR: 6.2, legW: 3, armW: 2.6, cycle: 60, stride: 3.6 },
    c: { main: '#6a4a2e', leg: '#4a3a2a', arm: '#78a044', hand: '#78a044', skin: '#78a044', foot: '#3a2a1c' },
    aimAt: (e) => e.state === 'windup' || e.state === 'lunge',
    pose(e, G, B) {
      const shH = B.legL + B.torsoH;
      if (e.state === 'windup') {
        const k = ease(kOf(e, 0.34));
        return { crouch: 3 * k, lean: -0.1 * k, stance: 'wide', handR: [-4 * k, 3, shH + 1], wR: [0.3, 0, 1], handL: [4, -4, shH - 5] };
      }
      if (e.state === 'lunge') return { lean: 0.38, stance: 'wide', crouch: 1, handR: [B.armL, 1, shH - 1], wR: [1, 0, 0.1], handL: [-3, -5, shH - 4] };
      return { lean: 0.12, crouch: 1, handR: [3, 4, shH - 7], wR: [1, 0.2, -0.6] };
    },
    weapon(ctx, g, key, hand, dir) { if (key === 'R') drawBlade(ctx, g, hand, dir, 8, '#c8ccd0', '#3a2818', 2.2); },
    head(ctx, g) {
      spikes(ctx, g, [0, 5, 1.5], [-2, 11, 4], 2.2, '#78a044');
      headBall(ctx, g, '#78a044');
      // A rag hood.
      const { x, y, R } = g.head;
      if (!g.flash) {
        ctx.fillStyle = '#5a3a24';
        ctx.beginPath(); ctx.arc(x, y - 1, R + 0.6, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
      }
      eyes(ctx, g, '#ffe24a', 2.4, 0.4, 1.8, true);
      nub(ctx, g, 6.2, 0, -1, 1.6, 1.3, '#6a9038');
    },
  },

  // --- Skeleton Archer (the slinger): holds a band, draws, looses three arrows.
  slinger: {
    scale: 1.3,
    body: { legL: 12, torsoH: 11, torsoW: 9, torsoD: 6, shW: 5, armL: 11, headR: 5.8, legW: 2.4, armW: 2.2, neck: 2.5 },
    c: { main: '#d8d0bc', leg: '#d8d0bc', arm: '#e0d8c4', hand: '#e8e0cc', skin: '#d8d0bc', foot: '#b8b0a0' },
    aimAt: (e) => e.state === 'aim' || e.state === 'fire',
    pose(e, G, B) {
      const shH = B.legL + B.torsoH;
      if (e.state === 'aim' || e.state === 'fire') {
        const k = e.state === 'aim' ? ease(kOf(e, 0.42)) : (e.t > 0.07 ? 0.2 : 1);
        return { stance: 'wide', handL: [B.armL, -1.5, shH - 1], wL: [0, 0, 1], frontL: true, handR: [B.armL - 3 - 7 * k, 1, shH - 1], draw: k };
      }
      return { handL: [2, -6, shH - 8], wL: [0.2, 0, 1] };
    },
    weapon(ctx, g, key, hand) {
      if (key !== 'L') return;
      // The bow: a curve through the hand, across the line of aim.
      const top = [hand[0] - 2, hand[1], hand[2] + 9], bot = [hand[0] - 2, hand[1], hand[2] - 9];
      const a = g.pr(...top), b = g.pr(...hand), c = g.pr(...bot);
      ctx.strokeStyle = OUT; ctx.lineWidth = 4.4;
      ctx.beginPath(); ctx.moveTo(...a); ctx.quadraticCurveTo(b[0] * 2 - (a[0] + c[0]) / 2, b[1] * 2 - (a[1] + c[1]) / 2, ...c); ctx.stroke();
      ctx.strokeStyle = g.col('#7a5230'); ctx.lineWidth = 2.2; ctx.stroke();
      const draw = g.P.draw || 0;
      const nock = g.hands.R ? g.hands.R.hand : hand;
      const n = draw > 0.05 ? g.pr(...nock) : null;
      ctx.strokeStyle = 'rgba(240,235,220,0.8)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(...a); if (n) ctx.lineTo(...n); ctx.lineTo(...c); ctx.stroke();
      if (n) {
        // The arrow on the string, its head glowing as the draw fills.
        const tip = g.pr(hand[0] + 4, hand[1], hand[2]);
        g.limb([n, tip], 1.2, g.col('#caa070'));
        if (!g.flash) {
          ctx.fillStyle = `rgba(94,224,200,${(0.3 + 0.7 * draw).toFixed(2)})`;
          ctx.beginPath(); ctx.arc(tip[0], tip[1], 1.6 + draw * 2.4, 0, TAU); ctx.fill();
        }
      }
    },
    torso(ctx, g, T) {
      if (!T || g.flash || g.away) return;
      // Ribs.
      ctx.strokeStyle = 'rgba(40,30,24,0.55)'; ctx.lineWidth = 1;
      for (let k = 0; k < 3; k++) {
        const y = T.ty + 3 + k * 2.6;
        ctx.beginPath(); ctx.moveTo(T.tx - T.hwT * 0.7, y); ctx.lineTo(T.tx + T.hwT * 0.7, y); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(T.tx, T.ty + 1); ctx.lineTo(T.bx, T.by - 1); ctx.stroke();
    },
    items(g) {
      return [{ f: -4, r: 2, draw: (ctx) => {
        const [x, y] = g.body(-4, 2, g.shH - 2);
        const [x2, y2] = g.body(-5, 3, g.shH + 7);
        g.limb([[x, y], [x2, y2]], 3.6, g.col('#6a4a2c'));
        if (!g.flash) { ctx.fillStyle = '#e8e0cc'; ctx.fillRect(x2 - 1.5, y2 - 2.5, 1, 3); ctx.fillRect(x2 + 0.5, y2 - 2, 1, 3); }
      } }];
    },
    head(ctx, g) {
      headBall(ctx, g, '#e8e0cc');
      if (g.flash) return;
      const R = g.head.R;
      for (const s of [1, -1]) {
        if (!g.vis(R * 0.8, s * 2.3)) continue;
        const [x, y] = g.hp(R * 0.75, s * 2.3, 0.8);
        ctx.fillStyle = '#1a1210'; ctx.beginPath(); ctx.ellipse(x, y, 1.6, 1.9, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#5ee0c8'; ctx.fillRect(x - 0.5, y - 0.4, 1, 1);
      }
      if (g.vis(R * 0.8, 0)) {
        const [x, y] = g.hp(R * 0.7, 0, -3);
        ctx.fillStyle = '#1a1210';
        for (let k = -1; k <= 1; k++) ctx.fillRect(x + k * 1.4 - 0.4, y, 0.8, 1.6);
      }
    },
  },

  // --- Boar-folk Brute (the brute): a maul on the shoulder; up overhead; down.
  brute: {
    body: { legL: 11, hipW: 4, torsoH: 14, torsoW: 17, torsoD: 12, shW: 8, armL: 12, headR: 6.4, legW: 5, armW: 4.6, cycle: 90, stride: 3.4 },
    c: { main: '#5a4030', leg: '#3e2e22', arm: '#8a6a58', hand: '#8a6a58', skin: '#8a6a58', foot: '#2a1e16' },
    aimAt: (e) => e.state === 'wind' || e.state === 'recover',
    pose(e, G, B) {
      const shH = B.legL + B.torsoH;
      if (e.state === 'wind') {
        const k = ease(kOf(e, 0.78));
        return { crouch: 1.5 * k, lean: -0.18 * k, stance: 'wide', handR: [-2 * k, 3, shH + 6 + 5 * k], handL: [-1 * k, -3, shH + 5 + 5 * k], wR: [-0.4 - 0.6 * k, 0, 1] };
      }
      if (e.state === 'recover') return { crouch: 3, lean: 0.32, stance: 'wide', handR: [B.armL, 2, shH - 9], handL: [B.armL - 1, -2, shH - 9], wR: [1, 0, -0.9] };
      return { handR: [3, 5, shH - 2], handL: [2, 2, shH - 5], wR: [-0.7, 0.1, 1] };
    },
    weapon(ctx, g, key, hand, dir) { if (key === 'R') drawMaul(ctx, g, hand, dir, 16); },
    torso(ctx, g, T) {
      if (!T || g.flash) return;
      // A fur mantle over the shoulders, and a belt.
      ctx.fillStyle = '#7a6250';
      ctx.beginPath(); ctx.ellipse(T.tx, T.ty + 2, T.hwT + 1.5, 4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2a1e16'; ctx.fillRect(T.bx - T.hwB, T.by - 4, T.hwB * 2, 2.4);
    },
    head(ctx, g) {
      spikes(ctx, g, [-1, 4.5, 3], [-2, 7, 7], 1.8, '#6a5040');
      headBall(ctx, g, '#8a6a58');
      nub(ctx, g, 6.4, 0, -1.5, 2.8, 2.2, '#b08a7a');
      if (!g.flash && g.vis(6, 0)) {
        for (const s of [1, -1]) {
          const [x, y] = g.hp(6, s * 2.2, -3);
          ctx.fillStyle = '#f0e8d0'; ctx.beginPath(); ctx.moveTo(x - 1, y); ctx.lineTo(x + s * 0.5, y - 4); ctx.lineTo(x + 1, y); ctx.fill();
        }
      }
      eyes(ctx, g, '#ff7a3a', 2.6, 1.6, 1.4);
    },
  },

  // --- Bull Raider (the charger): paws the ground, lowers its horns, charges.
  charger: {
    body: { legL: 12, hipW: 3.4, torsoH: 13, torsoW: 14, torsoD: 10, shW: 6.5, armL: 11, headR: 6.4, legW: 4.2, armW: 4, cycle: 80 },
    c: { main: '#8a5a38', leg: '#3a2a20', arm: '#6a4430', hand: '#5a3a28', skin: '#6a4430', foot: '#1e1612' },
    aimAt: (e) => e.state === 'aim' || e.state === 'charge',
    pose(e, G, B) {
      const shH = B.legL + B.torsoH;
      if (e.state === 'aim') {
        const scrape = Math.sin((world.runTime || 0) * 18) * 3;
        return { crouch: 2.5, lean: 0.3, feet: [2 + scrape, -3], handR: [-2, 6, shH - 6], handL: [-2, -6, shH - 6] };
      }
      if (e.state === 'charge') return { lean: 0.5, crouch: 1.5, handR: [-4, 6, shH - 4], handL: [-4, -6, shH - 4] };
      if (e.state === 'stun') return { lean: -0.12, shake: 0.6, handR: [1, 7, shH - 11], handL: [1, -7, shH - 11] };
      return { lean: 0.1 };
    },
    torso(ctx, g, T) {
      if (!T || g.flash) return;
      // A leather harness across the chest.
      ctx.strokeStyle = '#3a2618'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(T.tx - T.hwT, T.ty + 3); ctx.lineTo(T.bx + T.hwB, T.by - 3); ctx.stroke();
    },
    head(ctx, g) {
      // Horns sweeping out and forward.
      spikes(ctx, g, [1, 4.5, 3], [5, 11, 7], 2, '#e8dcc0');
      headBall(ctx, g, '#6a4430');
      nub(ctx, g, 6.2, 0, -1.5, 3, 2.4, '#8a6048');
      if (!g.flash && g.vis(7, 0)) {
        const [x, y] = g.hp(7.5, 0, -2.5);
        ctx.strokeStyle = '#e0b050'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y + 1, 1.6, 0, TAU); ctx.stroke();
      }
      eyes(ctx, g, g.e.state === 'aim' ? '#ff4a2a' : '#1a1210', 2.8, 1.8, 1.4, g.e.state === 'aim');
    },
  },

  // --- Imp Firebrand (the bomber): runs in with a lit keg over its head.
  bomber: {
    body: { legL: 8, torsoH: 8, torsoW: 9, torsoD: 7, shW: 4.6, armL: 12, headR: 6, legW: 2.8, armW: 2.4, cycle: 55, stride: 3.4 },
    c: { main: '#b8402a', leg: '#8a2a1e', arm: '#c8503a', hand: '#c8503a', skin: '#c8503a', foot: '#3a1a14' },
    crown: 15,
    pose(e, G, B) {
      const shH = B.legL + B.torsoH;
      const fuse = e.state === 'fuse' ? kOf(e, 0.82) : 0;
      const blink = fuse > 0 ? (Math.sin((world.runTime || 0) * (12 + fuse * 46)) > 0 ? 1 : 0.4) : 1;
      return { lean: 0.05, shake: fuse * 0.8, alpha: blink, handR: [0, 6, shH + 10], handL: [0, -6, shH + 10], fuse };
    },
    over(ctx, g) {
      // The keg, held up over the head, its fuse fizzing.
      const [x, y] = g.body(0, 0, g.shH + g.B.neck + g.B.headR * 2 + 7);
      ctx.beginPath(); ctx.ellipse(x, y, 8.5, 6.5, 0, 0, TAU); g.fillOut(g.col('#7a5230'), 1.4);
      if (!g.flash) {
        ctx.fillStyle = '#3a3a3a'; ctx.fillRect(x - 8, y - 3, 16, 1.5); ctx.fillRect(x - 8, y + 2, 16, 1.5);
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x - 6, y - 5, 4, 2);
        const k = g.P.fuse || 0;
        const f = 0.6 + Math.sin(g.t * 30) * 0.4;
        ctx.fillStyle = k > 0 ? '#ff4d9d' : '#ffd45e';
        ctx.beginPath(); ctx.arc(x + 4, y - 8 - k * 2, 1.6 + f * 1.4 + k * 2, 0, TAU); ctx.fill();
      }
    },
    head(ctx, g) {
      spikes(ctx, g, [0, 3, 4.5], [-1, 4.5, 9], 1.4, '#3a1a14');
      headBall(ctx, g, '#c8503a');
      eyes(ctx, g, '#ffe24a', 2.4, 1, 1.6, true);
      if (!g.flash && g.vis(6, 0)) {
        const [x, y] = g.hp(5.8, 0, -2.2);
        ctx.strokeStyle = '#2a0e0a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y - 1, 2.6, 0.3, Math.PI - 0.3); ctx.stroke();
      }
    },
  },

  // --- Mushroom-folk (the splitter): waddles at you; cut down, it bursts into sprouts.
  splitter: {
    body: { legL: 6, hipW: 2.6, torsoH: 9, torsoW: 10, torsoD: 9, shW: 5, armL: 6, headR: 5, legW: 3.4, armW: 2.8, cycle: 50, stride: 3 },
    c: { main: '#e8dcc0', leg: '#cfc0a0', arm: '#e0d4b8', hand: '#e0d4b8', skin: '#e8dcc0', foot: '#a89878' },
    crown: 4,
    pose(e, G, B) {
      const shH = B.legL + B.torsoH;
      const wave = Math.sin((world.runTime || 0) * 9 + (e.seed || 0)) * 2;
      return { handR: [2, 6, shH + wave], handL: [2, -6, shH - wave], lean: 0.05 };
    },
    head(ctx, g) {
      // The cap: wide and spotted, over a face on the stem.
      const { x, y } = g.head;
      eyes(ctx, g, '#1a1210', 2, -4.5, 1.6);
      const cap = g.e.isSpawn ? '#d8804a' : '#b8402a';
      ctx.beginPath(); ctx.ellipse(x, y - 2, 12, 7, 0, Math.PI, TAU); ctx.lineTo(x + 12, y); ctx.quadraticCurveTo(x, y + 3, x - 12, y); ctx.closePath();
      g.fillOut(g.col(cap), 1.5);
      if (!g.flash) {
        ctx.fillStyle = '#f4ecd8';
        for (const [dx, dy, r] of [[-6, -4, 1.8], [1, -6, 2.2], [6, -3, 1.6], [-2, -2, 1.2]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, TAU); ctx.fill(); }
      }
    },
  },

  // --- Frog Shaman (the spitter): squats in place, swells its throat, spits a ring.
  spitter: {
    body: { legL: 7, hipW: 4.5, torsoH: 10, torsoW: 16, torsoD: 13, shW: 7, armL: 9, headR: 7.5, legW: 4.4, armW: 3.4, neck: 0 },
    c: { main: '#4a8a4a', leg: '#3a7040', arm: '#4a8a4a', hand: '#6ab06a', skin: '#4a8a4a', foot: '#2a5030' },
    pose(e, G, B) {
      const shH = B.legL + B.torsoH;
      const k = e.state === 'wind' ? ease(kOf(e, 0.5)) : 0;
      return { sit: true, handR: [4, 8, shH - 2 + k * 6], handL: [5, -6, shH - 6], wR: [0.1, 0, 1], lean: -0.05 * k, puff: k };
    },
    weapon(ctx, g, key, hand, dir) {
      if (key !== 'R') return;
      // A staff with a skull on top.
      const top = along(g, hand, dir, 12), bot = along(g, hand, dir, -8);
      g.limb([g.pr(...bot), g.pr(...top)], 2, g.col('#6a4a2c'));
      const [x, y] = g.pr(...top);
      ctx.beginPath(); ctx.arc(x, y - 2, 3, 0, TAU); g.fillOut(g.col('#e8e0cc'), 1);
      if (!g.flash) { ctx.fillStyle = '#ff7ad6'; ctx.fillRect(x - 1.8, y - 3, 1.2, 1.2); ctx.fillRect(x + 0.6, y - 3, 1.2, 1.2); }
    },
    head(ctx, g) {
      const { x, y, R } = g.head;
      // The throat swells pink before it spits.
      const k = g.P.puff || 0;
      if (g.vis(R * 0.6, 0)) {
        const [tx, ty] = g.hp(R * 0.5, 0, -R * 0.7);
        ctx.beginPath(); ctx.ellipse(tx, ty, 3 + k * 5, 2 + k * 4, 0, 0, TAU); g.fillOut(g.col('#e8a0c0'), 1);
      }
      ctx.beginPath(); ctx.ellipse(x, y, R + 1.5, R * 0.8, 0, 0, TAU); g.fillOut(g.col('#4a8a4a'), 1.4);
      // Eyes on top, bulging.
      for (const s of [1, -1]) {
        const [ex, ey] = g.hp(1.5, s * 4, R * 0.7);
        ctx.beginPath(); ctx.arc(ex, ey, 2.6, 0, TAU); g.fillOut(g.col('#e8e070'), 1);
        if (!g.flash && g.vis(3, s * 4)) { ctx.fillStyle = '#1a1210'; ctx.fillRect(ex - 0.6, ey - 1, 1.2, 2); }
      }
      if (!g.flash && g.vis(R, 0)) {
        const [mx, my] = g.hp(R * 0.9, 0, -1);
        ctx.strokeStyle = '#1e3a20'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(mx - 4, my); ctx.quadraticCurveTo(mx, my + 1.5, mx + 4, my); ctx.stroke();
      }
    },
  },

  // --- Lion Guard (the chinthe): a stone-lion temple guard behind a tower shield.
  chinthe: {
    body: { legL: 12, hipW: 3.4, torsoH: 13, torsoW: 14, torsoD: 10, shW: 6.5, armL: 11, headR: 6.2, legW: 4.2, armW: 3.8 },
    c: { main: '#b89a5a', leg: '#6a5a40', arm: '#c8aa6a', hand: '#d8c090', skin: '#d8c090', foot: '#4a3a28' },
    aimAt: (e) => e.state === 'wind' || e.state === 'bash',
    pose(e, G, B) {
      const shH = B.legL + B.torsoH;
      if (e.state === 'open') return { lean: -0.15, shake: 0.3, handL: [2, -8, shH - 11], handR: [1, 7, shH - 10], shield: 'down', wR: [0.4, 0.3, -1] };
      if (e.state === 'wind') {
        const k = ease(kOf(e, 0.55));
        return { crouch: 2 * k, lean: -0.05, stance: 'wide', handL: [6 + 2 * k, -2, shH - 3 + 3 * k], frontL: true, handR: [-2, 6, shH - 6], shield: 'up', wR: [0.2, 0, 1] };
      }
      if (e.state === 'bash') return { lean: 0.35, stance: 'wide', handL: [B.armL, -1, shH - 2], frontL: true, handR: [-3, 6, shH - 6], shield: 'up', wR: [0.3, 0, 1] };
      return { handL: [6, -3, shH - 5], frontL: true, shield: 'up', handR: [1, 6, shH - 8], wR: [0.1, 0, 1] };
    },
    weapon(ctx, g, key, hand, dir) {
      if (key !== 'R') return;
      // A temple spear, held upright.
      const tip = along(g, hand, dir, 16), butt = along(g, hand, dir, -9);
      g.limb([g.pr(...butt), g.pr(...tip)], 1.8, g.col('#6a4a2c'));
      const [x, y] = g.pr(...tip), [bx, by] = g.pr(...along(g, hand, dir, 12));
      ctx.beginPath(); ctx.moveTo(x + (x - bx) * 0.8, y + (y - by) * 0.8); ctx.lineTo(bx - 2, by); ctx.lineTo(bx + 2, by); ctx.closePath();
      g.fillOut(g.col('#d8c070'), 1);
    },
    items(g) {
      const h = g.hands.L;
      if (!h) return [];
      const down = g.P.shield === 'down';
      const c = down ? [h.hand[0], h.hand[1] - 1, h.hand[2] - 2] : [h.hand[0] + 2, h.hand[1] + 1, h.hand[2] - 1];
      return [{ f: c[0] + 3, r: c[1], bias: down ? -8 : 4, draw: (ctx) => {
        if (down) drawPlate(ctx, g, [c[0], c[1] - 3, 5], 1, 5, '#8a7a5a', null);
        else drawPlate(ctx, g, c, 6, 9, '#c8a050', '#6a4a20');
      } }];
    },
    head(ctx, g) {
      // A mane, then the lion's face.
      const { x, y, R } = g.head;
      ctx.beginPath(); ctx.arc(x, y, R + 3.2, 0, TAU); g.fillOut(g.col('#a8702a'), 1.4);
      headBall(ctx, g, '#e0c890');
      nub(ctx, g, R * 0.9, 0, -1.5, 2.4, 1.8, '#c8a878');
      eyes(ctx, g, '#1a1210', 2.4, 1, 1.4);
    },
  },

  // --- Firefly Imp (the adze): sparks on the wind - only a body while it feeds.
  adze: {
    body: { legL: 5, hipW: 1.8, torsoH: 6, torsoW: 6, torsoD: 5, shW: 3, armL: 5.5, headR: 4.4, legW: 2, armW: 1.8, cycle: 40 },
    c: { main: '#5a4a2a', leg: '#4a3a22', arm: '#5a4a2a', hand: '#6a5a32', skin: '#6a5a32' },
    skip: (e) => e.state !== 'gather' && e.state !== 'feed',
    aimAt: () => true,
    pose(e, G, B) {
      const shH = B.legL + B.torsoH;
      const bite = e.state === 'feed' ? Math.sin((world.runTime || 0) * 16) * 1.5 : 0;
      return { air: true, float: 10 + Math.sin((world.runTime || 0) * 7 + (e.seed || 0)) * 2, lean: 0.3, handR: [B.armL + bite, 2, shH - 1], handL: [B.armL - bite, -2, shH - 1] };
    },
    items(g) {
      return [{ f: -3, r: 0, bias: -1, draw: (ctx) => {
        // Beating wings, and the glowing tail.
        const flap = Math.sin(g.t * 40) * 0.5 + 0.5;
        for (const s of [1, -1]) {
          const [x, y] = g.body(-2, s * 2, g.shH - 1);
          ctx.fillStyle = 'rgba(230,240,255,0.45)';
          ctx.beginPath(); ctx.ellipse(x - s * 4, y - 4 - flap * 3, 6, 2.2 + flap * 2, s * 0.6, 0, TAU); ctx.fill();
        }
        const [tx, ty] = g.body(-3, 0, g.hipH - 1);
        ctx.fillStyle = 'rgba(255,226,122,0.35)'; ctx.beginPath(); ctx.arc(tx, ty, 7, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.ellipse(tx, ty, 3.4, 4, 0, 0, TAU); g.fillOut(g.col('#ffe27a'), 1);
      } }];
    },
    head(ctx, g) {
      headBall(ctx, g, '#6a5a32');
      spikes(ctx, g, [1, 1.5, 3.5], [3, 3, 8], 0.6, '#3a2a18');
      eyes(ctx, g, '#ffe27a', 1.8, 0.5, 1.4, true);
    },
  },

  // --- the Vetala: a hooded corpse-spirit that rides the bodies of your kills.
  vetala: {
    body: { legL: 9, torsoH: 13, torsoW: 12, torsoD: 9, shW: 5.5, armL: 11, headR: 5.8, legs: false, armW: 2.6 },
    c: { main: '#3a5a50', arm: '#9df0c8', hand: '#c8ffe8', skin: '#9df0c8' },
    aimAt: (e) => e.state === 'aim',
    pose(e, G, B) {
      const shH = B.legL + B.torsoH;
      const bob = Math.sin((world.runTime || 0) * 2.4 + (e.seed || 0)) * 2;
      const P = { float: 4 + bob, handR: [3, 6, shH - 9], handL: [3, -6, shH - 9] };
      if (e.state === 'ride' || e.state === 'toBody') Object.assign(P, { lean: 0.45, handR: [B.armL, 3, shH - 12], handL: [B.armL, -3, shH - 12] });
      if (e.state === 'aim') Object.assign(P, { handR: [B.armL, 3, shH], handL: [B.armL, -3, shH], frontR: true, frontL: true, glow: kOf(e, 0.55) });
      if (e.state === 'blink') P.alpha = 0.25 + 0.75 * Math.abs(Math.cos((e.t || 0) * 12));
      if (e.state === 'stun') Object.assign(P, { shake: 0.5, lean: -0.2 });
      return P;
    },
    torso: Object.assign((ctx, g) => {
      // A long ragged robe to the ground, and no feet under it.
      const { B, sa, ca, pr } = g;
      const hw = 0.5 * (Math.abs(sa) * B.torsoW + Math.abs(ca) * B.torsoD);
      const [tx, ty] = g.body(0, 0, g.shH);
      const [bx, by] = pr(0, 0, 0);
      ctx.beginPath();
      ctx.moveTo(tx - hw * 0.8, ty + 1);
      ctx.quadraticCurveTo(tx, ty - 3, tx + hw * 0.8, ty + 1);
      ctx.lineTo(bx + hw * 1.25, by);
      for (let k = 1; k <= 5; k++) ctx.lineTo(bx + hw * 1.25 - (k / 5) * hw * 2.5, by - (k % 2 ? 3 : 0) + Math.sin(g.t * 5 + k) * 0.8);
      ctx.closePath();
      g.fillOut(g.main, 1.5);
      if (!g.flash) {
        ctx.save(); ctx.clip();
        ctx.fillStyle = 'rgba(157,240,200,0.18)'; ctx.fillRect(bx - hw * 1.3, by - 8, hw * 2.6, 8);
        ctx.restore();
      }
    }, { replace: true }),
    over(ctx, g) {
      // Spirit threads down to the body it is working on.
      const e = g.e;
      if (e.state !== 'ride' || !e.body || g.flash) return;
      ctx.strokeStyle = 'rgba(157,240,200,0.6)'; ctx.lineWidth = 1;
      const bx = (e.body.x - e.x) / g.sc, by = (e.body.y + e.body.r * 0.3 - (e.y + e.r * 0.72)) / g.sc + 4;
      for (const h of [g.hands.R, g.hands.L]) {
        if (!h) continue;
        const [x, y] = g.pr(...h.hand);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo((x + bx) / 2 + Math.sin(g.t * 6) * 3, (y + by) / 2, bx, by); ctx.stroke();
      }
    },
    head(ctx, g) {
      // A deep hood, and a pale mask glowing in it.
      const { x, y, R } = g.head;
      ctx.beginPath(); ctx.arc(x, y, R + 1.5, 0, TAU); g.fillOut(g.col('#2a4a40'), 1.4);
      if (!g.away && !g.flash) {
        const [mx, my] = g.hp(R * 0.5, 0, -0.5);
        ctx.fillStyle = '#c8ffe8'; ctx.beginPath(); ctx.ellipse(mx, my, R * 0.6, R * 0.75, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#1a2a24';
        const glow = g.P.glow || 0;
        for (const s of [1, -1]) { const [ex, ey] = g.hp(R * 0.9, s * 1.8, 0.4); ctx.fillRect(ex - 0.8, ey - 0.8, 1.6, 2); }
        if (glow > 0) { ctx.fillStyle = `rgba(157,240,200,${(0.5 * glow).toFixed(2)})`; ctx.beginPath(); ctx.arc(mx, my, R * 1.4, 0, TAU); ctx.fill(); }
      }
    },
  },

  // --- Rat-folk Sapper (the kobold): lobs lit blasting charges, hops away.
  sapper: {
    scale: 1.15,
    body: { legL: 9, torsoH: 10, torsoW: 10, torsoD: 8, shW: 5, armL: 9, headR: 5.6, legW: 3, armW: 2.6, cycle: 60 },
    c: { main: '#6a5a3a', leg: '#5a4a32', arm: '#9a9088', hand: '#c8a0a0', skin: '#9a9088', foot: '#3a2e22' },
    crown: 3,
    aimAt: (e) => e.state === 'wind',
    pose(e, G, B) {
      const shH = B.legL + B.torsoH;
      if (e.state === 'wind') {
        const k = ease(kOf(e, 0.55));
        return { stance: 'wide', lean: -0.1 * k, handR: [-4 * k, 4, shH + 4 * k], handL: [5, -4, shH - 3], charge: k };
      }
      if (e.state === 'hop') return { air: true, float: 6, handR: [2, 6, shH], handL: [2, -6, shH] };
      return { lean: 0.15, handR: [2, 5, shH - 6], charge: 0.001 };
    },
    weapon() {},
    items(g) {
      const out = [{ f: -4, r: 0, bias: -2, draw: (ctx) => {
        // A long tail.
        const [x, y] = g.body(-3, 0, g.hipH);
        const w = Math.sin(g.t * 6) * 3;
        ctx.strokeStyle = OUT; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - g.ca * 8 + w, y + 4, x - g.ca * 14, y + 2 + w * 0.5); ctx.stroke();
        ctx.strokeStyle = g.col('#c8a0a0'); ctx.lineWidth = 1.4; ctx.stroke();
      } }];
      const h = g.hands.R;
      if (h && g.P.charge) {
        out.push({ f: h.hand[0], r: h.hand[1], bias: 3, draw: (ctx) => {
          // The charge: a bundle of sticks and a sputtering fuse.
          const [x, y] = g.pr(...h.hand);
          ctx.save(); ctx.translate(x, y - 2); ctx.rotate(-0.4);
          ctx.fillStyle = g.col('#c8402a'); ctx.strokeStyle = OUT; ctx.lineWidth = 1;
          for (let k = -1; k <= 1; k++) { ctx.fillRect(k * 2.2 - 1, -4, 2, 8); ctx.strokeRect(k * 2.2 - 1, -4, 2, 8); }
          ctx.restore();
          if (!g.flash && g.P.charge > 0.01) {
            ctx.fillStyle = '#ffd45e'; ctx.beginPath(); ctx.arc(x + 2, y - 8, 1 + Math.random() * 1.6 * g.P.charge + 0.6, 0, TAU); ctx.fill();
          }
        } });
      }
      return out;
    },
    head(ctx, g) {
      spikes(ctx, g, [-0.5, 3.5, 4], [-1.5, 5, 8], 2.4, '#b89898');
      headBall(ctx, g, '#9a9088');
      nub(ctx, g, 6.5, 0, -1.5, 2.6, 1.8, '#a89890');
      nub(ctx, g, 8.6, 0, -1.6, 1, 1, '#2a1a1a');
      eyes(ctx, g, '#1a1210', 2, 0.8, 1.3);
      // A miner's helmet with a lamp.
      const { x, y, R } = g.head;
      ctx.beginPath(); ctx.ellipse(x, y - R * 0.45, R + 1, R * 0.62, 0, Math.PI, TAU); ctx.closePath(); g.fillOut(g.col('#8a7a4a'), 1.2);
      if (!g.flash && g.vis(R, 0)) {
        const [lx, ly] = g.hp(R * 0.9, 0, R * 0.6);
        ctx.fillStyle = 'rgba(255,230,150,0.35)'; ctx.beginPath(); ctx.arc(lx, ly, 4, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff2b0'; ctx.beginPath(); ctx.arc(lx, ly, 1.5, 0, TAU); ctx.fill();
      }
    },
  },

  // --- the Kappa: a river imp with a shell and a dish of water on its head.
  kappa: {
    scale: 1.12,
    body: { legL: 9, hipW: 3.2, torsoH: 10, torsoW: 12, torsoD: 10, shW: 5.5, armL: 10, headR: 6, legW: 3.4, armW: 3, cycle: 65 },
    c: { main: '#6fbf73', leg: '#5aa060', arm: '#6fbf73', hand: '#8ad08a', skin: '#6fbf73', foot: '#3a7040' },
    crown: 2,
    aimAt: (e) => e.state === 'crouch' || e.state === 'leap' || e.state === 'grab',
    pose(e, G, B) {
      const shH = B.legL + B.torsoH;
      if (e.state === 'crouch') { const k = ease(kOf(e, 0.5)); return { crouch: 4 * k, lean: 0.2 * k, stance: 'wide', handR: [-3, 6, shH - 5], handL: [-3, -6, shH - 5] }; }
      if (e.state === 'leap') return { air: true, lean: 0.35, handR: [B.armL, 5, shH + 2], handL: [B.armL, -5, shH + 2], frontR: true, frontL: true };
      if (e.state === 'grab') return { lean: 0.3, handR: [B.armL - 1, 3, shH - 3], handL: [B.armL - 1, -3, shH - 3], frontR: true, frontL: true };
      if (e.state === 'spill' || e.state === 'reel') return { sit: true, shake: e.state === 'reel' ? 0.4 : 0, handR: [1, 7, shH - 13], handL: [1, -7, shH - 13], spilled: true };
      return { lean: 0.12 };
    },
    items(g) {
      // The shell on its back.
      return [{ f: -g.B.torsoD * 0.5, r: 0, draw: (ctx) => {
        const [x, y] = g.body(-g.B.torsoD * 0.55, 0, g.hipH + g.B.torsoH * 0.55);
        ctx.beginPath(); ctx.ellipse(x, y, 7.5, 8, 0, 0, TAU); g.fillOut(g.col('#6a5a3a'), 1.4);
        if (!g.flash) { ctx.strokeStyle = '#4a3e26'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x + 5, y); ctx.moveTo(x, y - 6); ctx.lineTo(x, y + 6); ctx.stroke(); }
      } }];
    },
    head(ctx, g) {
      headBall(ctx, g, '#6fbf73');
      nub(ctx, g, 6, 0, -1.2, 2.6, 1.6, '#e0c050');
      eyes(ctx, g, '#1a1210', 2.4, 1.2, 1.4);
      // The dish: full of water, or spilled and empty.
      const { x, y, R } = g.head;
      const spilled = g.P.spilled;
      ctx.beginPath(); ctx.ellipse(x, y - R + 0.5, 4.5, 1.8, spilled ? 0.5 : 0, 0, TAU); g.fillOut(g.col('#d8d0b8'), 1);
      if (!g.flash && !spilled) { ctx.fillStyle = '#7ac8ff'; ctx.beginPath(); ctx.ellipse(x, y - R + 0.4, 3.2, 1, 0, 0, TAU); ctx.fill(); }
      if (!g.flash) { ctx.fillStyle = '#2a4a30'; ctx.beginPath(); ctx.arc(x, y - R * 0.3, R * 0.95, Math.PI * 1.1, Math.PI * 1.9); ctx.lineWidth = 2; ctx.strokeStyle = '#2a4a30'; ctx.stroke(); }
    },
  },

  // --- the Preta: a hungry ghost - a gaunt figure, a swollen belly, a tiny mouth.
  preta: {
    body: { legL: 12, hipW: 2.6, torsoH: 12, torsoW: 9, torsoD: 7, shW: 5, armL: 12, headR: 4.6, neck: 5, legW: 2.2, armW: 2, cycle: 70, stride: 3 },
    c: { main: '#b8a8d8', leg: '#a898c8', arm: '#b8a8d8', hand: '#c8b8e8', skin: '#b8a8d8', foot: '#8878a8' },
    aimAt: (e) => e.state === 'bloat' || e.state === 'heave',
    pose(e, G, B) {
      const shH = B.legL + B.torsoH;
      const full = (e.belly && e.belly.length) || 0;
      if (e.state === 'bloat') { const k = kOf(e, 0.7); return { shake: 0.8 * k, handR: [3, 7, shH - 4], handL: [3, -7, shH - 4], belly: 0.8 + full * 0.2 + k }; }
      if (e.state === 'heave') return { lean: 0.35, handR: [2, 7, shH - 10], handL: [2, -7, shH - 10], belly: 0.4, mouth: true };
      return { lean: 0.08, handR: [4, 5, shH - 11], handL: [4, -5, shH - 11], belly: 0.4 + full * 0.2 };
    },
    items(g) {
      const k = g.P.belly ?? 0.4;
      return [{ f: g.B.torsoD * 0.4, r: 0, bias: 0.5, draw: (ctx) => {
        // The swollen belly, showing what it has swallowed.
        const [x, y] = g.body(g.B.torsoD * 0.45, 0, g.hipH + g.B.torsoH * 0.35);
        ctx.beginPath(); ctx.ellipse(x, y, 3.4 + k * 2.4, 3 + k * 2.2, 0, 0, TAU); g.fillOut(g.col('#c8b8e8'), 1.3);
        const belly = g.e.belly || [];
        if (!g.flash) belly.slice(0, 6).forEach((c, i) => { ctx.fillStyle = c; ctx.globalAlpha *= 0.7; ctx.beginPath(); ctx.arc(x - 3 + (i % 3) * 3, y - 1 + Math.floor(i / 3) * 3, 1.3, 0, TAU); ctx.fill(); ctx.globalAlpha /= 0.7; });
      } }];
    },
    head(ctx, g) {
      headBall(ctx, g, '#c8b8e8');
      eyes(ctx, g, '#2a1a3a', 1.8, 0.8, 1.6);
      if (!g.flash && g.vis(g.head.R, 0)) {
        const [x, y] = g.hp(g.head.R * 0.9, 0, -2);
        ctx.fillStyle = '#2a1a3a'; ctx.beginPath(); ctx.arc(x, y, g.P.mouth ? 1.8 : 0.7, 0, TAU); ctx.fill();
      }
    },
  },

  // --- the Draugr: a Norse dead-walker in rusted mail, with an axe. Rises again.
  draugr: {
    body: { legL: 12, hipW: 3.4, torsoH: 13, torsoW: 13, torsoD: 9, shW: 6, armL: 11, headR: 5.8, legW: 3.8, armW: 3.4, cycle: 85, stride: 3.4 },
    c: { main: '#5e6a68', leg: '#3e4644', arm: '#7a8a80', hand: '#9aa8a0', skin: '#8a9a90', foot: '#2a2e2c' },
    skip: (e) => e.state === 'grave',
    aimAt: (e) => e.state === 'wind' || e.state === 'recover',
    pose(e, G, B) {
      const shH = B.legL + B.torsoH;
      const P = {};
      if (e.state === 'rise') P.rise = kOf(e, 0.6);
      if (e.state === 'wind') { const k = ease(kOf(e, 0.6)); Object.assign(P, { lean: -0.12 * k, stance: 'wide', handR: [-2, 4, shH + 5 * k + 3], wR: [-0.5 - 0.5 * k, 0, 1] }); }
      else if (e.state === 'recover') Object.assign(P, { lean: 0.3, crouch: 2, stance: 'wide', handR: [B.armL, 2, shH - 8], wR: [1, 0, -0.8] });
      else Object.assign(P, { lean: 0.06, handR: [2, 6, shH - 9], wR: [0.6, 0.2, -1] });
      return P;
    },
    weapon(ctx, g, key, hand, dir) { if (key === 'R') drawAxe(ctx, g, hand, dir, 13); },
    torso(ctx, g, T) {
      if (!T || g.flash) return;
      // Mail rings, and a torn cloak edge.
      ctx.strokeStyle = 'rgba(20,24,22,0.35)'; ctx.lineWidth = 0.8;
      for (let y = T.ty + 3; y < T.by - 1; y += 2.4) { ctx.beginPath(); ctx.moveTo(T.tx - T.hwT * 0.8, y); ctx.lineTo(T.tx + T.hwT * 0.8, y); ctx.stroke(); }
    },
    head(ctx, g) {
      headBall(ctx, g, '#8a9a90');
      eyes(ctx, g, '#bfe8ff', 2.2, 0.8, 1.6, true);
      // A nasal helm.
      const { x, y, R } = g.head;
      ctx.beginPath(); ctx.ellipse(x, y - R * 0.3, R + 0.8, R * 0.85, 0, Math.PI, TAU); ctx.closePath(); g.fillOut(g.col('#6a6258'), 1.2);
      if (!g.flash && g.vis(R, 0)) { const [nx, ny] = g.hp(R * 0.95, 0, 0); ctx.fillStyle = '#6a6258'; ctx.fillRect(nx - 0.8, ny - 4, 1.6, 5); }
    },
  },

  // --- the Duende: a little trickster with a pointed hat and a sack for your gold.
  duende: {
    scale: 1.1,
    body: { legL: 7, torsoH: 8, torsoW: 9, torsoD: 7, shW: 4.2, armL: 7.5, headR: 5.4, legW: 2.6, armW: 2.2, cycle: 45, stride: 3.6 },
    c: { main: '#3a6a3a', leg: '#5a3a24', arm: '#3a6a3a', hand: '#e2b489', skin: '#e2b489', foot: '#2a1e14' },
    crown: 9,
    pose(e, G, B) {
      const shH = B.legL + B.torsoH;
      if (e.state === 'flee') return { lean: 0.3, handR: [-2, 4, shH + 2], handL: [4, -5, shH - 5], sack: 1 + Math.min(1, (e.loot || 0) / 40) };
      return { lean: 0.2, crouch: 1.5, handR: [-1, 5, shH], handL: [3, -5, shH - 5], sack: 0.6 };
    },
    items(g) {
      const k = g.P.sack || 0.6;
      return [{ f: -3, r: 3, bias: -1, draw: (ctx) => {
        const [x, y] = g.body(-3, 3, g.shH + 2);
        const bounce = g.e.state === 'flee' ? Math.sin(g.t * 20) * 1.2 : 0;
        ctx.beginPath(); ctx.ellipse(x, y + bounce, 4 + k * 2.4, 3.6 + k * 2.2, 0.3, 0, TAU); g.fillOut(g.col('#b89a6a'), 1.2);
        if (!g.flash && k > 1) { ctx.fillStyle = '#ffd45e'; ctx.beginPath(); ctx.arc(x + 1, y - 3 + bounce, 1.4, 0, TAU); ctx.fill(); }
      } }];
    },
    head(ctx, g) {
      headBall(ctx, g, '#e2b489');
      nub(ctx, g, 5.6, 0, -0.5, 2, 1.6, '#d89a70');
      eyes(ctx, g, '#1a1210', 2, 1, 1.3);
      // A white beard and a tall red hat.
      const { x, y, R } = g.head;
      if (!g.away) nub(ctx, g, R * 0.7, 0, -R * 0.7, 3.4, 2.8, '#f0ece0');
      ctx.beginPath(); ctx.moveTo(x - R - 0.5, y - R * 0.2); ctx.quadraticCurveTo(x - 1, y - R * 2.8, x + 4 - g.ca * 4, y - R * 2.6); ctx.lineTo(x + R + 0.5, y - R * 0.2); ctx.closePath();
      g.fillOut(g.col('#c8302a'), 1.3);
    },
  },
};

// Rising from the grave: the draugr is drawn climbing out of the ground.
const drawDraugr = FIGS.draugr;
const basePose = drawDraugr.pose;
drawDraugr.pose = (e, G, B) => {
  const P = basePose(e, G, B);
  if (P.rise !== undefined) P.float = -(1 - P.rise) * 26;
  return P;
};

/** The types that have a figure (for tests). */
export const FIGURE_TYPES = Object.keys(FIGS);
