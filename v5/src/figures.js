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
  const F = e.type === 'foxclone' && e.look ? FIGS[e.look] : FIGS[e.type];
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

/** A skull: bone white, dark sockets with a point of light, a row of teeth. */
function skull(ctx, g, light = '#5ee0c8') {
  headBall(ctx, g, '#e8e0cc');
  if (g.flash) return;
  const R = g.head.R;
  for (const s of [1, -1]) {
    if (!g.vis(R * 0.8, s * 2.3)) continue;
    const [x, y] = g.hp(R * 0.75, s * 2.3, 0.8);
    ctx.fillStyle = '#1a1210'; ctx.beginPath(); ctx.ellipse(x, y, 1.6, 1.9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = light; ctx.fillRect(x - 0.5, y - 0.4, 1, 1);
  }
  if (g.vis(R * 0.8, 0)) {
    const [x, y] = g.hp(R * 0.7, 0, -3);
    ctx.fillStyle = '#1a1210';
    for (let k = -1; k <= 1; k++) ctx.fillRect(x + k * 1.4 - 0.4, y, 0.8, 1.6);
  }
}

/** A hood over the head: a dark cowl, the face in shadow inside it. */
function hood(ctx, g, color, face, eyeColor, glow = false) {
  const { x, y, R } = g.head;
  ctx.beginPath(); ctx.arc(x, y, R + 1.6, 0, TAU); g.fillOut(g.col(color), 1.4);
  if (g.away || g.flash) return;
  const [fx, fy] = g.hp(R * 0.55, 0, -0.5);
  ctx.fillStyle = face; ctx.beginPath(); ctx.ellipse(fx, fy, R * 0.62, R * 0.72, 0, 0, TAU); ctx.fill();
  eyes(ctx, g, eyeColor, 1.9, 0.2, 1.4, glow);
}

/** A robe to the ground (no legs showing), ragged or plain at the hem. */
function robe(color, ragged) {
  return Object.assign((ctx, g) => {
    const { B, sa, ca, pr } = g;
    const hw = 0.5 * (Math.abs(sa) * B.torsoW + Math.abs(ca) * B.torsoD);
    const [tx, ty] = g.body(0, 0, g.shH);
    const [bx, by] = pr(0, 0, g.P.float ? -g.P.float * 0.2 : 0);
    ctx.beginPath();
    ctx.moveTo(tx - hw * 0.8, ty + 1);
    ctx.quadraticCurveTo(tx, ty - 3, tx + hw * 0.8, ty + 1);
    ctx.lineTo(bx + hw * 1.2, by);
    if (ragged) for (let k = 1; k <= 5; k++) ctx.lineTo(bx + hw * 1.2 - (k / 5) * hw * 2.4, by - (k % 2 ? 3 : 0) + Math.sin(g.t * 5 + k) * 0.8);
    else ctx.quadraticCurveTo(bx, by + 2, bx - hw * 1.2, by);
    ctx.closePath();
    g.fillOut(g.flash ? '#ffffff' : (g.main !== g.C.main ? g.main : color), 1.5);
    if (!g.flash) {
      ctx.save(); ctx.clip();
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(tx + hw * 0.2, ty - 4, hw * 2, by - ty + 8);
      ctx.restore();
    }
  }, { replace: true });
}

function drawSpear(ctx, g, hand, dir, len, back = 8, head = '#c8ccd0') {
  const tip = along(g, hand, dir, len), butt = along(g, hand, dir, -back);
  g.limb([g.pr(...butt), g.pr(...tip)], 1.8, g.col('#6a4a2c'));
  const [x, y] = g.pr(...tip), [bx, by] = g.pr(...along(g, hand, dir, len - 4));
  ctx.beginPath(); ctx.moveTo(x + (x - bx) * 0.9, y + (y - by) * 0.9); ctx.lineTo(bx - 2, by); ctx.lineTo(bx + 2, by); ctx.closePath();
  g.fillOut(g.col(head), 1);
}

/** A katana: a long thin blade, a dark wrapped hilt. */
function drawKatana(ctx, g, hand, dir, len = 15) {
  drawBlade(ctx, g, hand, dir, len, '#e8eef4', '#1e1a24', 2);
}

/** A straw hat (kasa): a wide shallow cone. */
function kasa(ctx, g, color = '#c8a860', w = 1) {
  const { x, y, R } = g.head;
  ctx.beginPath(); ctx.moveTo(x - (R + 7) * w, y - R * 0.35); ctx.lineTo(x, y - R * 1.7); ctx.lineTo(x + (R + 7) * w, y - R * 0.35);
  ctx.quadraticCurveTo(x, y - R * 0.1, x - (R + 7) * w, y - R * 0.35); ctx.closePath();
  g.fillOut(g.col(color), 1.3);
  if (!g.flash) { ctx.strokeStyle = 'rgba(80,60,30,0.4)'; ctx.lineWidth = 0.8; for (const k of [-0.5, 0, 0.5]) { ctx.beginPath(); ctx.moveTo(x, y - R * 1.7); ctx.lineTo(x + k * (R + 7) * w, y - R * 0.3); ctx.stroke(); } }
}

/** A fox's head: orange, white cheeks and muzzle, tall ears. */
function foxHead(ctx, g, fur = '#e8843a', mask = false) {
  spikes(ctx, g, [-0.5, 3.4, 3.5], [-1, 4.6, 9.5], 2.2, mask ? '#f4ece0' : fur);
  headBall(ctx, g, mask ? '#f4ece0' : fur);
  nub(ctx, g, 6, 0, -1.5, 3, 2, '#f4ece0');
  nub(ctx, g, 8.4, 0, -1.3, 1, 0.9, '#1a1210');
  if (!g.flash && g.vis(g.head.R, 0)) {
    for (const s2 of [1, -1]) {
      if (!g.vis(g.head.R * 0.8, s2 * 2.3)) continue;
      const [x, y] = g.hp(g.head.R * 0.8, s2 * 2.3, 1);
      ctx.strokeStyle = mask ? '#c8302a' : '#1a1210'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x - 1.6, y + 0.6); ctx.lineTo(x + 1.6, y - 0.6); ctx.stroke();
    }
  }
}

/** Fox tails, fanned up behind: n of them, tipped white (glowing blue as it casts). */
function foxTails(g, n, glow) {
  return { f: -4, r: 0, bias: -3, draw: (ctx) => {
    const [bx, by] = g.body(-3, 0, g.hipH + 2);
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (n === 1 ? 0.9 : (k / (n - 1) - 0.5) * 2.2) + Math.sin(g.t * 2 + k) * 0.08;
      const len = 13 + (k % 2) * 3;
      const tx = bx + Math.cos(a) * len - g.ca * 3, ty = by + Math.sin(a) * len * 0.9;
      ctx.beginPath(); ctx.ellipse((bx + tx) / 2, (by + ty) / 2, len * 0.55, 3.4, a, 0, TAU); g.fillOut(g.col('#e8843a'), 1.1);
      ctx.beginPath(); ctx.ellipse(tx - Math.cos(a) * 2, ty - Math.sin(a) * 2, 3.2, 2.6, a, 0, TAU);
      g.fillOut(g.col(glow ? '#bfe8ff' : '#f8f0e8'), 1);
      if (glow && !g.flash) { ctx.fillStyle = 'rgba(160,220,255,0.35)'; ctx.beginPath(); ctx.arc(tx, ty, 6, 0, TAU); ctx.fill(); }
    }
  } };
}

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
  // --- the Crossbowman: a masked bandit; the crossbow comes up to the shoulder.
  crossbow: {
    scale: 1.2,
    body: { legL: 11, torsoH: 11, torsoW: 11, torsoD: 7.5, shW: 5.2, armL: 10, headR: 5.8, legW: 3.2, armW: 2.8 },
    c: { main: '#6a4a30', leg: '#3a3440', arm: '#7a5a3a', hand: '#e2b489', skin: '#e2b489', foot: '#2a1e16' },
    aimAt: (e) => e.state === 'aim',
    pose(e, G, B) {
      const shH = B.legL + B.torsoH;
      if (e.state === 'aim') return { stance: 'wide', handR: [5, 2, shH - 1], handL: [B.armL - 1, -1, shH - 1], frontL: true, wR: [1, 0, 0] };
      if (e.state === 'reload') return { handR: [4, 3, shH - 7], handL: [5, -2, shH - 6], wR: [0.6, 0, -0.8], crank: true };
      return { handR: [2, 5, shH - 7], handL: [3, -3, shH - 6], wR: [0.7, -0.2, -0.6] };
    },
    weapon(ctx, g, key, hand, dir) {
      if (key !== 'R') return;
      // The stock along the aim, the bow across its end.
      const tip = along(g, hand, dir, 12), butt = along(g, hand, dir, -3);
      g.limb([g.pr(...butt), g.pr(...tip)], 2.4, g.col('#5a3a22'));
      const side = [-dir[1] || 0.001, dir[0], 0];
      const n = Math.hypot(side[0], side[1]) || 1;
      const a = g.pr(tip[0] + side[0] / n * 6, tip[1] + side[1] / n * 6, tip[2] - 1);
      const b = g.pr(tip[0] - side[0] / n * 6, tip[1] - side[1] / n * 6, tip[2] - 1);
      const c = g.pr(tip[0] - dir[0] * 2, tip[1], tip[2]);
      ctx.strokeStyle = OUT; ctx.lineWidth = 3.6;
      ctx.beginPath(); ctx.moveTo(...a); ctx.quadraticCurveTo(...c, ...b); ctx.stroke();
      ctx.strokeStyle = g.col('#8a6a44'); ctx.lineWidth = 1.8; ctx.stroke();
      if (g.e.state === 'aim' && !g.flash) {
        const [x, y] = g.pr(...tip);
        ctx.fillStyle = g.e.t <= 0.28 ? '#ff5a3c' : '#ffb070'; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, TAU); ctx.fill();
      }
    },
    torso(ctx, g, T) {
      if (!T || g.flash) return;
      ctx.strokeStyle = '#2a1e14'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(T.tx - T.hwT, T.ty + 2); ctx.lineTo(T.bx + T.hwB, T.by - 2); ctx.stroke();
    },
    head(ctx, g) {
      headBall(ctx, g, '#e2b489');
      eyes(ctx, g, '#1a1210', 2.2, 1.2, 1.3);
      // A bandana over the mouth and a hood over the head.
      const { x, y, R } = g.head;
      if (!g.away && g.vis(R, 0)) {
        const [mx, my] = g.hp(R * 0.6, 0, -2);
        ctx.fillStyle = g.col('#8a2a24'); ctx.beginPath(); ctx.ellipse(mx, my, R * 0.9, R * 0.5, 0, 0, Math.PI); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(x, y - 0.5, R + 0.8, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); g.fillOut(g.col('#4a3a2a'), 1.2);
    },
  },

  // --- the Necromancer: a hooded cultist with a skull staff; arms up for the rite.
  necro: {
    scale: 1.15,
    body: { legL: 11, torsoH: 13, torsoW: 12, torsoD: 9, shW: 5.2, armL: 11, headR: 5.8, legs: false, armW: 2.8 },
    c: { main: '#4a2a5a', arm: '#4a2a5a', hand: '#c8b8a0', skin: '#c8b8a0' },
    crown: 4,
    aimAt: (e) => e.state === 'rite',
    pose(e, G, B) {
      const shH = B.legL + B.torsoH;
      if (e.state === 'rite') return { handR: [3, 7, shH + 8], handL: [3, -7, shH + 8], wR: [0.1, 0.1, 1], glow: 1 - (e.t || 0) / 1.3 };
      if (e.state === 'reel') return { shake: 0.5, lean: -0.2, handR: [1, 7, shH - 8], wR: [0.3, 0.3, 1] };
      return { handR: [3, 6, shH - 5], wR: [0.15, 0, 1] };
    },
    torso: robe('#4a2a5a', true),
    weapon(ctx, g, key, hand, dir) {
      if (key !== 'R') return;
      const top = along(g, hand, dir, 14), bot = along(g, hand, dir, -10);
      g.limb([g.pr(...bot), g.pr(...top)], 2, g.col('#3a2a1c'));
      const [x, y] = g.pr(...top);
      const glow = g.P.glow || 0;
      if (!g.flash) { ctx.fillStyle = `rgba(140,255,160,${(0.25 + 0.5 * glow).toFixed(2)})`; ctx.beginPath(); ctx.arc(x, y - 2, 5 + glow * 5, 0, TAU); ctx.fill(); }
      ctx.beginPath(); ctx.arc(x, y - 2, 3, 0, TAU); g.fillOut(g.col('#e8e0cc'), 1);
    },
    head(ctx, g) { hood(ctx, g, '#2e1a3a', '#1a1020', '#8cffa0', true); },
  },

  // --- the Boneling: a little skeleton with a rusty blade.
  boneling: {
    scale: 1.2,
    body: { legL: 8, torsoH: 8, torsoW: 8, torsoD: 5, shW: 4, armL: 8, headR: 5.4, legW: 2, armW: 1.8, neck: 2, cycle: 55 },
    c: { main: '#d8d0bc', leg: '#d8d0bc', arm: '#e0d8c4', hand: '#e8e0cc', skin: '#d8d0bc', foot: '#b8b0a0' },
    aimAt: (e) => e.state === 'windup' || e.state === 'swipe',
    pose(e, G, B) {
      const shH = B.legL + B.torsoH;
      if (e.state === 'windup') return { lean: -0.1, handR: [-2, 4, shH + 3], wR: [-0.3, 0.2, 1] };
      if (e.state === 'swipe') return { lean: 0.3, handR: [B.armL, -1, shH - 3], wR: [1, -0.6, -0.2] };
      return { lean: 0.1, handR: [3, 4, shH - 6], wR: [0.8, 0.2, -0.5] };
    },
    weapon(ctx, g, key, hand, dir) { if (key === 'R') drawBlade(ctx, g, hand, dir, 7, '#a08a6a', '#3a2818', 2); },
    head(ctx, g) { skull(ctx, g, '#8cffa0'); },
  },

  // --- the Jiangshi: a hopping corpse in an official's robe, arms held out stiff.
  jiangshi: {
    scale: 1.15,
    body: { legL: 11, hipW: 2, torsoH: 13, torsoW: 12, torsoD: 8, shW: 5.2, armL: 11, headR: 5.8, legW: 3.4, armW: 3 },
    c: { main: '#2a3a6a', leg: '#1e2a4a', arm: '#2a3a6a', hand: '#b8d0c0', skin: '#b8d0c0', foot: '#141414' },
    crown: 5,
    aimAt: () => true,
    pose(e, G, B) {
      const shH = B.legL + B.torsoH;
      const set = e.state === 'set' ? 1 - (e.t || 0) / 0.42 : 0;
      return {
        crouch: set * 2.5, feet: [0.5, 0.3], air: e.state === 'hop',
        handR: [B.armL, 2.5, shH - 1], handL: [B.armL, -2.5, shH - 1], frontR: true, frontL: true,
      };
    },
    torso(ctx, g, T) {
      if (!T || g.flash || g.away) return;
      // The rank badge: a square of gold on the chest.
      ctx.fillStyle = '#c8a040'; ctx.fillRect(T.tx - 2.8, T.ty + 3.5, 5.6, 5.6);
      ctx.fillStyle = '#8a2a24'; ctx.fillRect(T.tx - 1.2, T.ty + 5, 2.4, 2.4);
    },
    head(ctx, g) {
      headBall(ctx, g, '#b8d0c0');
      eyes(ctx, g, '#1a1210', 2.2, 1, 1.3);
      // A round official's hat, and the paper charm hanging over the face.
      const { x, y, R } = g.head;
      ctx.beginPath(); ctx.ellipse(x, y - R * 0.55, R + 1.5, R * 0.55, 0, Math.PI, TAU); ctx.closePath(); g.fillOut(g.col('#1a1a24'), 1.2);
      ctx.beginPath(); ctx.ellipse(x, y - R * 0.55, R + 3, 1.6, 0, 0, TAU); g.fillOut(g.col('#1a1a24'), 1);
      if (!g.away && g.vis(R, 0)) {
        const [cx, cy] = g.hp(R * 0.95, 0, R * 0.2);
        const sway = Math.sin(g.t * 4) * 0.6;
        ctx.fillStyle = g.col('#f0d060'); ctx.fillRect(cx - 1.8 + sway, cy - 3, 3.6, 9);
        if (!g.flash) { ctx.fillStyle = '#c83020'; ctx.fillRect(cx - 0.6 + sway, cy - 1.5, 1.2, 6); }
      }
    },
  },

  // --- the Zealot: a masked cultist in gold and white, swinging a censer.
  zealot: {
    scale: 1.15,
    body: { legL: 10, torsoH: 12, torsoW: 11, torsoD: 8, shW: 5, armL: 10, headR: 5.6, legs: false, armW: 2.6 },
    c: { main: '#e8dcc0', arm: '#e8dcc0', hand: '#e2b489', skin: '#e2b489' },
    crown: 4,
    pose(e, G, B) {
      const shH = B.legL + B.torsoH;
      const swing = Math.sin((world.runTime || 0) * 3 + (e.seed || 0)) * 3;
      if (e.state === 'flee') return { lean: 0.25, handR: [-3, 5, shH - 3], handL: [-3, -5, shH - 3] };
      return { handR: [5 + swing, 5, shH - 3], handL: [2, -5, shH - 7] };
    },
    torso: robe('#e8dcc0', false),
    over(ctx, g) {
      // The censer on its chain, smoking gold.
      const h = g.hands.R;
      if (!h) return;
      const [x, y] = g.pr(...h.hand);
      ctx.strokeStyle = g.col('#8a7a5a'); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 7); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y + 9, 2.6, 0, TAU); g.fillOut(g.col('#c8a040'), 1);
      if (!g.flash) { ctx.fillStyle = 'rgba(255,214,110,0.35)'; ctx.beginPath(); ctx.arc(x + Math.sin(g.t * 2) * 2, y + 3, 4, 0, TAU); ctx.fill(); }
    },
    head(ctx, g) {
      const { x, y, R } = g.head;
      ctx.beginPath(); ctx.arc(x, y, R + 1.4, 0, TAU); g.fillOut(g.col('#c8b890'), 1.3);
      if (!g.away && !g.flash) {
        const [mx, my] = g.hp(R * 0.6, 0, 0);
        ctx.fillStyle = '#e8c050'; ctx.beginPath(); ctx.ellipse(mx, my, R * 0.6, R * 0.72, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#2a1e10';
        for (const s of [1, -1]) { const [ex, ey] = g.hp(R * 0.95, s * 1.8, 0.6); ctx.fillRect(ex - 0.8, ey - 0.3, 1.6, 0.9); }
      }
      // A tall pointed cowl.
      ctx.beginPath(); ctx.moveTo(x - R, y - R * 0.3); ctx.lineTo(x, y - R * 2.3); ctx.lineTo(x + R, y - R * 0.3); ctx.closePath(); g.fillOut(g.col('#c8b890'), 1.2);
    },
  },

  // --- the Wolf-folk: grey fur, a long muzzle, a tail; they howl to rouse the pack.
  wolf: {
    scale: 1.15,
    body: { legL: 11, hipW: 3, torsoH: 11, torsoW: 12, torsoD: 9, shW: 5.5, armL: 10, headR: 5.8, legW: 3.4, armW: 3, cycle: 70, stride: 4.4 },
    c: { main: '#6a6a74', leg: '#5a5a64', arm: '#7a7a84', hand: '#4a4a54', skin: '#8a8a94', foot: '#3a3a44' },
    crown: 4,
    aimAt: (e) => e.state === 'crouch' || e.state === 'pounce' || e.state === 'howl',
    pose(e, G, B) {
      const shH = B.legL + B.torsoH;
      if (e.state === 'howl') return { lean: -0.3, handR: [0, 7, shH - 10], handL: [0, -7, shH - 10], howl: true };
      if (e.state === 'crouch') { const k = ease(kOf(e, 0.32)); return { crouch: 4 * k, lean: 0.3 * k, stance: 'wide', handR: [-3, 6, shH - 6], handL: [-3, -6, shH - 6] }; }
      if (e.state === 'pounce') return { air: true, lean: 0.5, handR: [B.armL, 4, shH], handL: [B.armL, -4, shH], frontR: true, frontL: true };
      if (e.state === 'recover') return { lean: 0.15, crouch: 1.5 };
      return { lean: e.hasteT > 0 ? 0.3 : 0.18, crouch: 1 };
    },
    items(g) {
      return [{ f: -4, r: 0, bias: -2, draw: (ctx) => {
        const [x, y] = g.body(-3, 0, g.hipH + 1);
        const w = Math.sin(g.t * 7) * 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - g.ca * 7 + w, y + 2, x - g.ca * 11 + w, y + 6);
        ctx.strokeStyle = OUT; ctx.lineWidth = 5.4; ctx.stroke(); ctx.strokeStyle = g.col('#8a8a94'); ctx.lineWidth = 3.6; ctx.stroke();
      } }];
    },
    head(ctx, g) {
      spikes(ctx, g, [-0.5, 3.4, 3.5], [-1, 4.4, 8.5], 2, '#6a6a74');
      headBall(ctx, g, '#8a8a94');
      // The muzzle: raised to the sky when it howls.
      const up = g.P.howl ? 3 : 0;
      nub(ctx, g, 6.5, 0, -1.5 + up, 3.4, 2.2, '#9a9aa4');
      nub(ctx, g, 9.2, 0, -1.2 + up, 1.1, 1, '#1a1210');
      eyes(ctx, g, g.e.hasteT > 0 ? '#ff5a3c' : '#ffd45e', 2.3, 1.4, 1.4, true);
    },
  },

  // --- the Tengu: a crow-winged goblin with a red face and a long nose.
  tengu: {
    scale: 1.15,
    body: { legL: 10, torsoH: 11, torsoW: 11, torsoD: 8, shW: 5, armL: 10, headR: 5.8, legW: 2.8, armW: 2.6 },
    c: { main: '#2a2a3a', leg: '#e8dcc0', arm: '#2a2a3a', hand: '#c84a3a', skin: '#c84a3a', foot: '#c8a040' },
    crown: 3,
    aimAt: (e) => e.state !== 'chase',
    pose(e, G, B) {
      const shH = B.legL + B.torsoH;
      if (e.state === 'rise' || e.state === 'sky') return { air: true, handR: [0, 7, shH + 2], handL: [0, -7, shH + 2], wings: 1 };
      if (e.state === 'dive') return { air: true, lean: 0.2, handR: [2, 4, shH - 2], handL: [2, -4, shH - 2], wings: 0.2 };
      if (e.state === 'dazed') return { crouch: 3, shake: 0.4, handR: [2, 6, shH - 11], handL: [2, -6, shH - 11], wings: 0.4 };
      return { handR: [3, 5, shH - 6], wR: [0.3, 0, 1], wings: 0.3 };
    },
    weapon(ctx, g, key, hand, dir) {
      if (key !== 'R') return;
      // A monk's staff with rings.
      const top = along(g, hand, dir, 12), bot = along(g, hand, dir, -9);
      g.limb([g.pr(...bot), g.pr(...top)], 1.8, g.col('#6a4a2c'));
      const [x, y] = g.pr(...top);
      ctx.strokeStyle = g.col('#c8a040'); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y - 2, 2.6, 0, TAU); ctx.stroke();
    },
    items(g) {
      const k = g.P.wings ?? 0.3;
      return [{ f: -4, r: 0, bias: -3, draw: (ctx) => {
        // Black wings: folded along the back, or spread and beating.
        const beat = k > 0.8 ? Math.sin(g.t * 22) * 0.4 : 0;
        for (const s of [1, -1]) {
          const [x, y] = g.body(-3, s * 3, g.shH - 1);
          const span = 6 + 12 * k;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + s * span * 0.6 * (g.away ? -1 : 1) * Math.abs(g.sa) - g.ca * span * 0.6, y - span * (0.5 + beat), x + s * span * Math.abs(g.sa) * (g.away ? -1 : 1) - g.ca * span, y - 2 - span * 0.2);
          ctx.lineTo(x - g.ca * 3, y + 9);
          ctx.closePath();
          g.fillOut(g.col('#1e1e2a'), 1.2);
        }
      } }];
    },
    head(ctx, g) {
      headBall(ctx, g, '#c84a3a');
      // The long nose, and white brows.
      nub(ctx, g, 7.5, 0, -0.5, 3.6, 1.4, '#d85a4a');
      eyes(ctx, g, '#1a1210', 2.2, 1.2, 1.3);
      const { x, y, R } = g.head;
      ctx.beginPath(); ctx.ellipse(x, y - R * 0.75, 3, 2, 0, 0, TAU); g.fillOut(g.col('#1a1a24'), 1);
    },
  },

  // --- the Banshee: a pale woman in a tattered dress, long dark hair, drifting.
  banshee: {
    scale: 1.15,
    body: { legL: 10, torsoH: 12, torsoW: 10, torsoD: 7, shW: 4.6, armL: 10, headR: 5.4, legs: false, armW: 2.2, neck: 2 },
    c: { main: '#cfe0ff', arm: '#dfe8ff', hand: '#eef4ff', skin: '#dfe8ff' },
    aimAt: (e) => e.state === 'wail',
    pose(e, G, B) {
      const shH = B.legL + B.torsoH;
      const bob = Math.sin((world.runTime || 0) * 2 + (e.seed || 0)) * 2.5;
      if (e.state === 'wail') { const k = kOf(e, 0.85); return { float: 6 + bob, lean: -0.2 * k, handR: [-3, 8, shH + 3 * k], handL: [-3, -8, shH + 3 * k], wail: k, alpha: 0.92 }; }
      return { float: 6 + bob, handR: [2, 4, shH - 1], handL: [2, -4, shH - 1], frontR: true, frontL: true, alpha: 0.85 };
    },
    torso: robe('#cfe0ff', true),
    head(ctx, g) {
      const { x, y, R } = g.head;
      // Long hair falling behind.
      ctx.beginPath(); ctx.ellipse(x - g.ca * 1.5, y + R * 0.8, R + 1.8, R * 1.8, 0, 0, TAU); g.fillOut(g.col('#2a2a3a'), 1.2);
      headBall(ctx, g, '#eef4ff');
      eyes(ctx, g, '#3a4a6a', 2, 0.8, 1.4);
      if (!g.flash && g.vis(R, 0)) {
        const [mx, my] = g.hp(R * 0.9, 0, -2.4);
        const k = g.P.wail || 0;
        ctx.fillStyle = '#1a1a2a'; ctx.beginPath(); ctx.ellipse(mx, my, 1 + k * 1.2, 0.7 + k * 2, 0, 0, TAU); ctx.fill();
      }
    },
  },

  // --- the Skeleton Spearman: a helmeted skeleton; the spear drawn back, then two thrusts.
  spearman: {
    scale: 1.25,
    body: { legL: 12, torsoH: 11, torsoW: 9, torsoD: 6, shW: 5, armL: 11, headR: 5.8, legW: 2.4, armW: 2.2, neck: 2.5 },
    c: { main: '#d8d0bc', leg: '#d8d0bc', arm: '#e0d8c4', hand: '#e8e0cc', skin: '#d8d0bc', foot: '#b8b0a0' },
    crown: 2,
    aimAt: (e) => e.state === 'draw' || e.state === 'thrust',
    pose(e, G, B) {
      const shH = B.legL + B.torsoH;
      if (e.state === 'draw') return { stance: 'wide', lean: -0.1, handR: [-5, 3, shH - 3], handL: [3, -2, shH - 3], wR: [1, -0.05, 0.02] };
      if (e.state === 'thrust') return { stance: 'wide', lean: 0.3, handR: [B.armL - 1, 1, shH - 2], handL: [B.armL - 4, -1, shH - 2], wR: [1, 0, 0] };
      if (e.state === 'recover') return { lean: 0.2, handR: [4, 4, shH - 8], wR: [0.8, 0, -0.7] };
      return { handR: [2, 5, shH - 7], wR: [0.2, 0, 1] };
    },
    weapon(ctx, g, key, hand, dir) { if (key === 'R') drawSpear(ctx, g, hand, dir, 18, 10); },
    head(ctx, g) {
      skull(ctx, g, '#ffd45e');
      const { x, y, R } = g.head;
      ctx.beginPath(); ctx.ellipse(x, y - R * 0.35, R + 1, R * 0.75, 0, Math.PI, TAU); ctx.closePath(); g.fillOut(g.col('#8a7a5a'), 1.2);
    },
  },
  // --- the Ronin: a masterless swordsman, hand on the hilt.
  ronin: {
    scale: 1.2,
    body: { legL: 11, torsoH: 12, torsoW: 12, torsoD: 8, shW: 5.4, armL: 10.5, headR: 5.6, legW: 3.6, armW: 3 },
    c: { main: '#5a5a6a', leg: '#3a3a48', arm: '#5a5a6a', hand: '#e2b489', skin: '#e2b489', foot: '#1e1a1a' },
    crown: 3,
    aimAt: (e) => e.state === 'stance' || e.state === 'draw',
    pose(e, G, B) {
      const shH = B.legL + B.torsoH;
      if (e.state === 'stance') return { crouch: 3, stance: 'wide', lean: 0.2, handR: [1, 2, shH - 9], handL: [2, -2, shH - 9], wR: [-0.6, 0.3, -0.5] };
      if (e.state === 'draw') return { lean: 0.5, stance: 'wide', handR: [B.armL, 2, shH - 2], wR: [1, 0.1, 0.05] };
      if (e.state === 'sheathe') return { lean: 0.1, handR: [2, 3, shH - 8], wR: [-0.4, 0.2, -0.8] };
      return { lean: 0.08, handR: [1, 5, shH - 9], wR: [-0.5, 0.2, -0.7] };
    },
    weapon(ctx, g, key, hand, dir) { if (key === 'R') drawKatana(ctx, g, hand, dir, 15); },
    torso(ctx, g, T) {
      if (!T || g.flash || g.away) return;
      ctx.strokeStyle = '#e8e0cc'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(T.tx - 3, T.ty + 1); ctx.lineTo(T.tx + 1, T.ty + 7); ctx.lineTo(T.tx + 3, T.ty + 1); ctx.stroke();
      ctx.fillStyle = '#2a2a34'; ctx.fillRect(T.bx - T.hwB, T.by - 5, T.hwB * 2, 2.6);
    },
    head(ctx, g) {
      headBall(ctx, g, '#e2b489');
      eyes(ctx, g, '#1a1210', 2.2, 1, 1.3);
      const { x, y, R } = g.head;
      ctx.beginPath(); ctx.arc(x, y - 0.5, R + 0.4, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); g.fillOut(g.col('#1a1414'), 1.1);
      ctx.beginPath(); ctx.ellipse(x - g.ca * 1.5, y - R - 1.5, 2.2, 1.6, 0, 0, TAU); g.fillOut(g.col('#1a1414'), 1);
    },
  },

  // --- the Kitsune: a fox spirit in a white robe, a fox mask, one tail.
  kitsune: {
    scale: 1.15,
    body: { legL: 10, torsoH: 12, torsoW: 10, torsoD: 7, shW: 4.8, armL: 10, headR: 5.4, legs: false, armW: 2.4 },
    c: { main: '#f4ece0', arm: '#f4ece0', hand: '#f0d8c0', skin: '#f0d8c0' },
    crown: 5,
    aimAt: (e) => e.state === 'wind',
    pose(e, G, B) {
      const shH = B.legL + B.torsoH;
      if (e.state === 'wind') return { handR: [B.armL - 1, 3, shH], frontR: true, handL: [2, -5, shH - 7], fire: 1 };
      return { handR: [3, 5, shH - 6], handL: [3, -5, shH - 6], fire: 0.3 };
    },
    torso: robe('#f4ece0', false),
    items(g) {
      const out = [foxTails(g, 1, false)];
      const h = g.hands.R;
      if (h) out.push({ f: h.hand[0], r: h.hand[1], bias: 4, draw: (ctx) => {
        if (g.flash) return;
        const [x, y] = g.pr(...h.hand);
        const k = g.P.fire || 0;
        ctx.fillStyle = `rgba(160,220,255,${(0.3 * k).toFixed(2)})`; ctx.beginPath(); ctx.arc(x, y - 4, 7 * k + 2, 0, TAU); ctx.fill();
        ctx.fillStyle = '#e8f6ff'; ctx.beginPath(); ctx.ellipse(x, y - 4, 2 * k + 1, 3.5 * k + 1, 0, 0, TAU); ctx.fill();
      } });
      return out;
    },
    over(ctx, g) {
      // A red sash across the robe.
      if (g.flash || g.away) return;
      const [x, y] = g.body(0, 0, g.hipH + g.B.torsoH * 0.45);
      ctx.fillStyle = '#c8302a'; ctx.fillRect(x - 5, y - 1.5, 10, 3);
    },
    head(ctx, g) { foxHead(ctx, g, '#e8843a', true); },
  },

  // --- the Ninja: black-clad, masked, a red scarf; three stars from behind you.
  ninja: {
    scale: 1.2,
    body: { legL: 10, torsoH: 10, torsoW: 10, torsoD: 7, shW: 4.6, armL: 9.5, headR: 5.2, legW: 2.8, armW: 2.4, cycle: 55, stride: 4.4 },
    c: { main: '#2a2a34', leg: '#22222c', arm: '#2a2a34', hand: '#22222c', skin: '#e2b489', foot: '#141418' },
    aimAt: (e) => e.state === 'throw',
    pose(e, G, B) {
      const shH = B.legL + B.torsoH;
      if (e.state === 'smoke') return { crouch: 3, handR: [2, 2, shH], handL: [2, -2, shH], frontR: true };
      if (e.state === 'throw') { const k = kOf(e, 0.28); return { stance: 'wide', lean: 0.2, handR: [-3 + k * (B.armL + 3), 3, shH + 2 - k * 3], star: true }; }
      if (e.state === 'recover') return { lean: 0.3, handR: [B.armL, 2, shH - 2] };
      return { lean: 0.3, crouch: 1.5, handR: [-3, 5, shH - 5], handL: [-3, -5, shH - 5] };
    },
    items(g) {
      return [{ f: -3, r: 0, bias: -2, draw: (ctx) => {
        // The scarf, streaming out behind.
        const [x, y] = g.body(-1, 0, g.shH + 1);
        const w = Math.sin(g.t * 9) * 2;
        ctx.strokeStyle = OUT; ctx.lineWidth = 4.4;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - g.ca * 8, y + w, x - g.ca * 14, y + 3 - w); ctx.stroke();
        ctx.strokeStyle = g.col('#c8302a'); ctx.lineWidth = 2.6; ctx.stroke();
      } }];
    },
    over(ctx, g) {
      const h = g.hands.R;
      if (!h || !g.P.star || g.flash) return;
      const [x, y] = g.pr(...h.hand);
      ctx.save(); ctx.translate(x, y - 2); ctx.rotate(g.t * 20);
      ctx.fillStyle = '#c8ccd8';
      for (let k = 0; k < 4; k++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(4, 1); ctx.lineTo(0, 1.6); ctx.fill(); }
      ctx.restore();
    },
    head(ctx, g) {
      headBall(ctx, g, '#2a2a34');
      if (!g.away && !g.flash && g.vis(g.head.R, 0)) {
        const [x, y] = g.hp(g.head.R * 0.7, 0, 1);
        ctx.fillStyle = '#e2b489'; ctx.fillRect(x - 3.4, y - 1.2, 6.8, 2.6);
      }
      eyes(ctx, g, '#1a1210', 1.8, 1, 1.1);
    },
  },

  // --- Kyubi, the Nine-Tailed: a fox spirit in white and red, nine tails fanned.
  kyubi: {
    scale: 1.1,
    body: { legL: 11, torsoH: 13, torsoW: 12, torsoD: 9, shW: 5.4, armL: 11, headR: 5.8, legs: false, armW: 2.8 },
    c: { main: '#f4ece0', arm: '#c83a2a', hand: '#f0d8c0', skin: '#f0d8c0' },
    crown: 6,
    aimAt: (e) => e.action !== 'idle',
    pose(e, G, B) {
      const shH = B.legL + B.torsoH;
      const a = e.action, s2 = e.sub;
      if (a === 'foxfire' && s2 === 'wind') return { handR: [B.armL - 1, 4, shH + 1], handL: [B.armL - 1, -4, shH + 1], frontR: true, frontL: true, glow: true };
      if (a === 'illusion') return { handR: [0, 7, shH + 5], handL: [0, -7, shH + 5], glow: true, shake: 0.3 };
      if (a === 'sweep') return s2 === 'crouch' ? { lean: 0.35, crouch: 2, handR: [-3, 6, shH - 6], handL: [-3, -6, shH - 6] } : { lean: 0.45, handR: [-4, 7, shH - 2], handL: [-4, -7, shH - 2] };
      if (a === 'exposed') return { shake: 0.4, lean: -0.15, handR: [1, 7, shH - 11], handL: [1, -7, shH - 11] };
      if (a === 'phase') return { handR: [0, 8, shH + 6], handL: [0, -8, shH + 6], glow: true, shake: 0.5 };
      return { handR: [3, 5, shH - 5], handL: [3, -5, shH - 5] };
    },
    torso: robe('#f4ece0', false),
    items(g) { return [foxTails(g, 9, !!g.P.glow)]; },
    over(ctx, g) {
      if (g.flash || g.away) return;
      const [x, y] = g.body(0, 0, g.hipH + g.B.torsoH * 0.45);
      ctx.fillStyle = '#c8302a'; ctx.fillRect(x - 6, y - 2, 12, 4);
    },
    head(ctx, g) { foxHead(ctx, g, '#e8843a', false); },
  },

  // --- Sasaki, the Wandering Blade: a ronin master in blue, a straw hat, a long katana.
  sasaki: {
    scale: 1.2,
    body: { legL: 12, torsoH: 13, torsoW: 12, torsoD: 8, shW: 5.6, armL: 11.5, headR: 5.6, legW: 3.8, armW: 3 },
    c: { main: '#2a3a5a', leg: '#1e2a44', arm: '#2a3a5a', hand: '#e2b489', skin: '#e2b489', foot: '#141418' },
    crown: 6,
    aimAt: (e) => e.action !== 'idle',
    pose(e, G, B) {
      const shH = B.legL + B.torsoH, a = e.action, s2 = e.sub;
      if (a === 'iaido' && s2 === 'stance') return { crouch: 3.5, stance: 'wide', lean: 0.25, handR: [1, 2, shH - 9], handL: [2, -2, shH - 9], wR: [-0.6, 0.3, -0.5] };
      if (a === 'iaido' && s2 === 'dash') return { lean: 0.55, stance: 'wide', handR: [B.armL, 2, shH - 2], wR: [1, 0.1, 0.05] };
      if (a === 'combo') { const side = e.cutSide || 1; return s2 === 'wind' ? { stance: 'wide', handR: [-1, 4 * side, shH + 5], wR: [-0.3, side * 0.6, 1] } : { stance: 'wide', lean: 0.3, handR: [B.armL - 1, -3 * side, shH - 5], wR: [0.6, -side, -0.4] }; }
      if (a === 'wave') return s2 === 'wind' ? { handR: [-2, 3, shH + 7], wR: [-0.4, 0, 1] } : { lean: 0.3, handR: [B.armL, 1, shH - 6], wR: [1, 0, -0.5] };
      if (a === 'parry') return { stance: 'wide', handR: [5, 1, shH - 3], handL: [5, -1, shH - 3], wR: [0.1, 0, 1], guard: true };
      if (a === 'exposed') return { lean: 0.1, shake: 0.3, handR: [2, 5, shH - 10], wR: [0.3, 0.3, -1] };
      return { lean: 0.05, handR: [1, 5, shH - 9], wR: [-0.5, 0.2, -0.7] };
    },
    weapon(ctx, g, key, hand, dir) {
      if (key !== 'R') return;
      drawKatana(ctx, g, hand, dir, 19);
      if (g.P.guard && !g.flash) {
        const [x, y] = g.pr(...along(g, hand, dir, 10));
        ctx.fillStyle = 'rgba(190,224,255,0.35)'; ctx.beginPath(); ctx.arc(x, y, 10, 0, TAU); ctx.fill();
      }
    },
    torso(ctx, g, T) {
      if (!T || g.flash || g.away) return;
      ctx.strokeStyle = '#e8e0cc'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(T.tx - 3.5, T.ty + 1); ctx.lineTo(T.tx + 1, T.ty + 8); ctx.lineTo(T.tx + 3.5, T.ty + 1); ctx.stroke();
      ctx.fillStyle = '#e8e0cc'; ctx.fillRect(T.bx - T.hwB, T.by - 5, T.hwB * 2, 2.6);
    },
    head(ctx, g) {
      headBall(ctx, g, '#e2b489');
      eyes(ctx, g, '#1a1210', 2.2, 0.8, 1.3);
      kasa(ctx, g, '#c8a860', 1.1);
    },
  },

  // --- the Oni Warlord: red-skinned, horned, a tiger-skin wrap, an iron club.
  oni: {
    scale: 1,
    body: { legL: 11, hipW: 4.2, torsoH: 14, torsoW: 17, torsoD: 12, shW: 8, armL: 12, headR: 6.6, legW: 5, armW: 4.8, cycle: 95, stride: 3.4 },
    c: { main: '#c83a2a', leg: '#b8342a', arm: '#c83a2a', hand: '#b8342a', skin: '#c83a2a', foot: '#3a1a14' },
    crown: 6,
    aimAt: (e) => e.action !== 'idle',
    pose(e, G, B) {
      const shH = B.legL + B.torsoH, a = e.action, s2 = e.sub;
      const rage = e.phase >= 2 ? 0.3 : 0;
      if (a === 'smash' && s2 === 'raise') return { lean: -0.18, stance: 'wide', handR: [-2, 3, shH + 12], handL: [-1, -3, shH + 11], wR: [-0.8, 0, 1], shake: rage };
      if (a === 'smash') return { lean: 0.35, crouch: 3, stance: 'wide', handR: [B.armL, 2, shH - 9], handL: [B.armL - 1, -2, shH - 9], wR: [1, 0, -0.9] };
      if (a === 'sweep') return s2 === 'wind' ? { crouch: 2, handR: [-3, 9, shH - 2], handL: [-2, 5, shH - 3], wR: [-0.8, 0.8, 0.1] } : { crouch: 2, handR: [3, -9, shH - 2], handL: [2, -5, shH - 3], wR: [0.6, -1, 0.1] };
      if (a === 'charge') return { lean: 0.5, crouch: 2, handR: [-3, 7, shH - 3], wR: [-0.6, 0.3, 0.6] };
      if (a === 'exposed') return { lean: -0.1, shake: 0.5, handR: [3, 8, shH - 12], wR: [0.6, 0.3, -1] };
      return { lean: 0.08, handR: [2, 7, shH - 3], wR: [-0.6, 0.2, 1], shake: rage * 0.3 };
    },
    weapon(ctx, g, key, hand, dir) {
      if (key !== 'R') return;
      // The kanabo: a long club, thicker to the end, studded with iron.
      const tip = along(g, hand, dir, 22), butt = along(g, hand, dir, -3);
      const a = g.pr(...butt), b = g.pr(...tip);
      g.limb([a, g.pr(...along(g, hand, dir, 8))], 3, g.col('#3a3a42'));
      g.limb([g.pr(...along(g, hand, dir, 8)), b], 6.5, g.col('#4a4a54'));
      if (!g.flash) {
        ctx.fillStyle = '#9a9aa8';
        for (let k = 10; k < 22; k += 3) { const [x, y] = g.pr(...along(g, hand, dir, k)); ctx.beginPath(); ctx.arc(x + 1.5, y - 1, 1.1, 0, TAU); ctx.fill(); }
      }
    },
    torso(ctx, g, T) {
      if (!T || g.flash) return;
      // The tiger-skin wrap at the hips.
      ctx.fillStyle = '#e8b040'; ctx.fillRect(T.bx - T.hwB - 0.5, T.by - 6, T.hwB * 2 + 1, 6);
      ctx.fillStyle = '#1a1210';
      for (let k = -2; k <= 2; k++) ctx.fillRect(T.bx + k * T.hwB * 0.38 - 0.8, T.by - 6, 1.6, 6);
    },
    head(ctx, g) {
      // Wild white hair, horns, fangs.
      const { x, y, R } = g.head;
      ctx.beginPath(); ctx.ellipse(x - g.ca * 1.2, y - 1, R + 3, R + 2.5, 0, 0, TAU); g.fillOut(g.col('#e8e4dc'), 1.2);
      spikes(ctx, g, [0.5, 3, 4.5], [1, 5, 11], 1.8, '#e8dcc0');
      headBall(ctx, g, '#c83a2a');
      eyes(ctx, g, g.e.phase >= 2 ? '#ffe24a' : '#ffd45e', 2.4, 1.2, 1.6, true);
      if (!g.flash && g.vis(R, 0)) {
        for (const s2 of [1, -1]) { const [fx, fy] = g.hp(R * 0.85, s2 * 1.8, -2.6); ctx.fillStyle = '#f4f0e8'; ctx.beginPath(); ctx.moveTo(fx - 0.8, fy); ctx.lineTo(fx, fy + 2.4); ctx.lineTo(fx + 0.8, fy); ctx.fill(); }
      }
    },
  },

  // --- the Bone Captain: a skeleton knight - breastplate, plumed helm, sword and shield.
  captain: {
    scale: 1.15,
    body: { legL: 12, torsoH: 12, torsoW: 11, torsoD: 7, shW: 5.6, armL: 11, headR: 5.8, legW: 2.6, armW: 2.4, neck: 2.5 },
    c: { main: '#8a8a94', leg: '#d8d0bc', arm: '#e0d8c4', hand: '#e8e0cc', skin: '#d8d0bc', foot: '#b8b0a0' },
    crown: 7,
    aimAt: (e) => e.action !== 'idle',
    pose(e, G, B) {
      const shH = B.legL + B.torsoH, a = e.action, s2 = e.sub;
      const shield = { handL: [6, -3, shH - 5], frontL: true };
      if (a === 'combo') { const side = e.cutSide || 1; return s2 === 'wind' ? { ...shield, handR: [-1, 4 * side, shH + 5], wR: [-0.3, side * 0.6, 1] } : { ...shield, lean: 0.3, handR: [B.armL - 1, -3 * side, shH - 5], wR: [0.6, -side, -0.4] }; }
      if (a === 'rush') return { ...shield, lean: 0.4, stance: 'wide', handL: [B.armL, -1, shH - 3], handR: [-3, 6, shH - 6], wR: [-0.4, 0.3, 1] };
      if (a === 'raise') return { handR: [2, 5, shH + 6], wR: [0, 0, 1], handL: [3, -6, shH - 6], rite: true };
      if (a === 'exposed') return { shake: 0.4, lean: -0.1, handR: [2, 6, shH - 10], wR: [0.5, 0.3, -1], handL: [2, -8, shH - 11] };
      return { ...shield, handR: [2, 5, shH - 7], wR: [0.3, 0.1, 1] };
    },
    weapon(ctx, g, key, hand, dir) { if (key === 'R') drawBlade(ctx, g, hand, dir, 14, '#c8ccd0', '#6a4a2c', 2.6); },
    items(g) {
      const h = g.hands.L;
      if (!h) return [];
      const c = [h.hand[0] + 1.5, h.hand[1], h.hand[2] - 1];
      return [{ f: c[0] + 3, r: c[1], bias: g.P.rite ? -6 : 4, draw: (ctx) => drawPlate(ctx, g, c, 5.5, 5.5, '#6a5a4a', '#c8a050') }];
    },
    torso(ctx, g, T) {
      if (!T || g.flash) return;
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(T.tx - T.hwT * 0.6, T.ty + 2, T.hwT * 0.5, 7);
      ctx.strokeStyle = '#c8a050'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(T.tx - T.hwT, T.ty + 1.5); ctx.lineTo(T.tx + T.hwT, T.ty + 1.5); ctx.stroke();
    },
    head(ctx, g) {
      skull(ctx, g, '#ff5a3c');
      const { x, y, R } = g.head;
      ctx.beginPath(); ctx.ellipse(x, y - R * 0.35, R + 1, R * 0.8, 0, Math.PI, TAU); ctx.closePath(); g.fillOut(g.col('#7a7a84'), 1.2);
      ctx.beginPath(); ctx.moveTo(x, y - R * 1.1); ctx.quadraticCurveTo(x - g.ca * 8, y - R * 2.2, x - g.ca * 11, y - R * 0.9); ctx.lineTo(x - g.ca * 2, y - R * 1.1); ctx.closePath();
      g.fillOut(g.col('#c8302a'), 1);
    },
  },

  // --- the Bandit Queen: a red cloak, a wide feathered hat, a crossbow.
  queen: {
    scale: 1.2,
    body: { legL: 11, torsoH: 11, torsoW: 11, torsoD: 7.5, shW: 5.2, armL: 10, headR: 5.6, legW: 3.2, armW: 2.6 },
    c: { main: '#5a3a2a', leg: '#2a2430', arm: '#6a4a34', hand: '#e2b489', skin: '#e2b489', foot: '#1e1612' },
    crown: 7,
    aimAt: (e) => e.action !== 'idle',
    pose(e, G, B) {
      const shH = B.legL + B.torsoH, a = e.action, s2 = e.sub;
      if (a === 'fan' && s2 === 'aim') return { stance: 'wide', handR: [5, 2, shH - 1], handL: [B.armL - 1, -1, shH - 1], frontL: true, wR: [1, 0, 0] };
      if (a === 'knives') return s2 === 'wind' ? { crouch: 2, lean: 0.25, handR: [-3, 5, shH - 4], wR: [0.2, 0.3, 1] } : { lean: 0.5, handR: [B.armL, 2, shH - 3], wR: [1, 0, 0] };
      if (a === 'smoke') return { crouch: 2, handR: [2, 2, shH], handL: [2, -2, shH] };
      if (a === 'exposed') return { shake: 0.4, handR: [2, 6, shH - 9], wR: [0.6, 0, -0.8] };
      return { handR: [2, 5, shH - 7], handL: [3, -3, shH - 6], wR: [0.7, -0.2, -0.6] };
    },
    weapon(ctx, g, key, hand, dir) { FIGS.crossbow.weapon(ctx, g, key, hand, dir); },
    items(g) {
      return [{ f: -4, r: 0, bias: -2, draw: (ctx) => {
        // The red cloak, hanging from the shoulders.
        const [x0, y0] = g.body(-2, 5, g.shH);
        const [x1, y1] = g.body(-2, -5, g.shH);
        const [x2, y2] = g.pr(-5, -6, 1), [x3, y3] = g.pr(-5, 6, 1);
        const w = Math.sin(g.t * 4) * 1.5;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2 + w, y2); ctx.lineTo(x3 + w, y3); ctx.closePath();
        g.fillOut(g.col('#a8282a'), 1.2);
      } }];
    },
    head(ctx, g) {
      headBall(ctx, g, '#e2b489');
      eyes(ctx, g, '#1a1210', 2.2, 1, 1.3);
      const { x, y, R } = g.head;
      // Dark hair, and a wide hat with a feather.
      ctx.beginPath(); ctx.ellipse(x - g.ca * 2, y + R * 0.5, R * 0.9, R * 1.1, 0, 0, TAU); g.fillOut(g.col('#3a2418'), 1);
      headBall(ctx, g, '#e2b489', R * 0.92);
      eyes(ctx, g, '#1a1210', 2.1, 1, 1.3);
      ctx.beginPath(); ctx.ellipse(x, y - R * 0.6, R + 6, 2.6, 0, 0, TAU); g.fillOut(g.col('#3a2a22'), 1.2);
      ctx.beginPath(); ctx.ellipse(x, y - R * 0.95, R * 0.8, R * 0.6, 0, Math.PI, TAU); ctx.closePath(); g.fillOut(g.col('#3a2a22'), 1.1);
      ctx.beginPath(); ctx.moveTo(x + 2, y - R * 1.1); ctx.quadraticCurveTo(x + 10 - g.ca * 4, y - R * 2.4, x + 13 - g.ca * 6, y - R * 1.3); ctx.quadraticCurveTo(x + 8, y - R * 1.5, x + 2, y - R * 1.1);
      g.fillOut(g.col('#e8e0cc'), 1);
    },
  },

  // --- the Bog Hag: hunched in a green shawl, a long nose, a lantern-staff.
  hag: {
    scale: 1.15,
    body: { legL: 9, torsoH: 12, torsoW: 12, torsoD: 9, shW: 5.2, armL: 10, headR: 5.6, legs: false, armW: 2.6 },
    c: { main: '#6a7a44', arm: '#7a8a4e', hand: '#b0c890', skin: '#b0c890' },
    crown: 3,
    aimAt: (e) => e.action !== 'idle',
    pose(e, G, B) {
      const shH = B.legL + B.torsoH, a = e.action, s2 = e.sub;
      if (a === 'globs' && s2 === 'wind') return { lean: 0.15, handR: [-3, 6, shH + 5], wR: [-0.2, 0.2, 1], handL: [B.armL - 1, -3, shH], frontL: true };
      if (a === 'frogs') return { lean: 0.35, handR: [4, 6, shH - 8], handL: [5, -6, shH - 8], wR: [0.3, 0.2, 1] };
      if (a === 'leap') return s2 === 'crouch' ? { lean: 0.4, crouch: 2, handR: [2, 6, shH - 6], wR: [0.2, 0.2, 1] } : { lean: 0.2, handR: [2, 7, shH + 2], wR: [0, 0.2, 1] };
      if (a === 'exposed') return { shake: 0.4, lean: 0.1, handR: [2, 6, shH - 10], wR: [0.6, 0.3, -1] };
      return { lean: 0.3, handR: [4, 6, shH - 6], wR: [0.1, 0.05, 1] };
    },
    torso: robe('#6a7a44', true),
    weapon(ctx, g, key, hand, dir) {
      if (key !== 'R') return;
      const top = along(g, hand, dir, 15), bot = along(g, hand, dir, -9);
      g.limb([g.pr(...bot), g.pr(...top)], 2, g.col('#4a3624'));
      const [x, y] = g.pr(...top);
      if (!g.flash) { ctx.fillStyle = 'rgba(160,230,120,0.35)'; ctx.beginPath(); ctx.arc(x, y + 5, 9, 0, TAU); ctx.fill(); }
      ctx.fillStyle = g.col('#c8f08a'); ctx.fillRect(x - 2.5, y + 2, 5, 6);
    },
    head(ctx, g) {
      hood(ctx, g, '#7a8a4e', '#2a3420', '#c8f08a', true);
      nub(ctx, g, 6.8, 0, -1, 2.6, 1.4, '#9ab080');
    },
  },

  // --- the Hierophant: tall in gold and white, a mitre, a halo, a sun on her staff.
  hierophant: {
    scale: 1.15,
    body: { legL: 11, torsoH: 14, torsoW: 12, torsoD: 9, shW: 5.4, armL: 11, headR: 5.6, legs: false, armW: 2.6 },
    c: { main: '#f0e8d0', arm: '#e8c050', hand: '#f0d8c0', skin: '#f0d8c0' },
    crown: 11,
    aimAt: (e) => e.action !== 'idle',
    pose(e, G, B) {
      const shH = B.legL + B.torsoH, a = e.action;
      if (a === 'halo') return { handR: [1, 8, shH + 5], handL: [1, -8, shH + 5], wR: [0, 0.3, 1], glow: true };
      if (a === 'lance') return { handR: [B.armL - 1, 2, shH], frontR: true, wR: [1, 0, 0.4], handL: [2, -6, shH - 6], glow: true };
      if (a === 'wardens' || a === 'phase') return { handR: [1, 7, shH + 6], handL: [1, -7, shH + 6], wR: [0, 0.2, 1], glow: true };
      if (a === 'blink') return { alpha: 0.5, handR: [2, 5, shH - 5], wR: [0, 0.1, 1] };
      if (a === 'exposed') return { shake: 0.4, handR: [2, 6, shH - 10], wR: [0.5, 0.3, -1] };
      return { handR: [3, 6, shH - 4], wR: [0.05, 0.05, 1] };
    },
    torso: robe('#f0e8d0', false),
    weapon(ctx, g, key, hand, dir) {
      if (key !== 'R') return;
      const top = along(g, hand, dir, 16), bot = along(g, hand, dir, -10);
      g.limb([g.pr(...bot), g.pr(...top)], 2, g.col('#c8a040'));
      const [x, y] = g.pr(...top);
      if (!g.flash && g.P.glow) { ctx.fillStyle = 'rgba(255,224,138,0.4)'; ctx.beginPath(); ctx.arc(x, y - 2, 10, 0, TAU); ctx.fill(); }
      ctx.beginPath(); ctx.arc(x, y - 2, 3.4, 0, TAU); g.fillOut(g.col('#ffe08a'), 1);
      if (!g.flash) { ctx.strokeStyle = '#e8c050'; ctx.lineWidth = 1; for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 4.5, y - 2 + Math.sin(a) * 4.5); ctx.lineTo(x + Math.cos(a) * 7, y - 2 + Math.sin(a) * 7); ctx.stroke(); } }
    },
    items(g) {
      return [{ f: -2, r: 0, bias: -4, draw: (ctx) => {
        // The halo, behind the head.
        if (g.flash) return;
        const { x, y, R } = g.head;
        ctx.strokeStyle = g.P.glow ? '#ffe08a' : 'rgba(255,224,138,0.7)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(x, y - 2, R + 6, R + 6, 0, 0, TAU); ctx.stroke();
      } }];
    },
    over(ctx, g) {
      if (g.flash || g.away) return;
      const [x, y] = g.body(0, 0, g.hipH + g.B.torsoH * 0.55);
      ctx.fillStyle = '#e8c050'; ctx.fillRect(x - 1.2, y - 7, 2.4, 14); ctx.fillRect(x - 5, y - 3, 10, 2.4);
    },
    head(ctx, g) {
      headBall(ctx, g, '#f0d8c0');
      eyes(ctx, g, '#3a2a1a', 2, 0.6, 1.2);
      const { x, y, R } = g.head;
      ctx.beginPath(); ctx.moveTo(x - R * 0.9, y - R * 0.5); ctx.lineTo(x - R * 0.7, y - R * 2.4); ctx.lineTo(x, y - R * 2.9); ctx.lineTo(x + R * 0.7, y - R * 2.4); ctx.lineTo(x + R * 0.9, y - R * 0.5); ctx.closePath();
      g.fillOut(g.col('#f4ecd8'), 1.2);
      if (!g.flash) { ctx.fillStyle = '#e8c050'; ctx.fillRect(x - 1, y - R * 2.5, 2, R * 1.9); ctx.fillRect(x - R * 0.9, y - R * 0.75, R * 1.8, 1.6); }
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

// The Alpha: a wolf-folk grown huge and grey-black, its moves read off the boss brain.
FIGS.alpha = {
  ...FIGS.wolf,
  scale: 1,
  c: { main: '#3a3a44', leg: '#2e2e38', arm: '#4a4a54', hand: '#2a2a34', skin: '#5a5a66', foot: '#1e1e26' },
  aimAt: (e) => e.action !== 'idle',
  pose(e, G, B) {
    const shH = B.legL + B.torsoH, a = e.action, s2 = e.sub;
    if (a === 'howl') return { lean: -0.3, handR: [0, 7, shH - 10], handL: [0, -7, shH - 10], howl: true };
    if (a === 'pounce') return s2 === 'crouch' ? { crouch: 4, lean: 0.35, stance: 'wide', handR: [-3, 6, shH - 6], handL: [-3, -6, shH - 6] }
      : { air: true, lean: 0.5, handR: [B.armL, 4, shH], handL: [B.armL, -4, shH], frontR: true, frontL: true };
    if (a === 'exposed') return { shake: 0.4, crouch: 2, lean: 0.1 };
    return { lean: 0.2, crouch: 1 };
  },
};

// Illusions look like whoever cast them.
FIGS.foxclone = { ...FIGS.kitsune, skip: () => false };

/** The types that have a figure (for tests). */
export const FIGURE_TYPES = Object.keys(FIGS);
