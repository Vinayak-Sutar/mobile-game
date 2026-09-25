// The opening: eleven shots that say what this world is and what you are in it.
//
// Painted, not filmed - flat ember-and-ink silhouettes with ash blowing through
// them, which is the game's own palette and costs nothing to draw. Only the
// Wanderer is the real thing: the same `drawPlayer` the game uses, so the
// figure who stands up at the lamp in the last third is the figure you then
// walk out of it with, cape and all.
//
// The beats, in order: a fire, its fall, what the ash took, the lamps that are
// left, the promise a lamp makes, the thirteen that hold the rest, the gate
// they lock, you waking under one of those lamps, what a fallen thing leaves,
// the road out, and the name of the game.

import { createPlayer, drawPlayer } from './player.js';
import { updatePlayerAnim } from './rigs.js';
import { WEAPONS } from './weapons.js';
import { look, prepareWanderer } from './wanderer.js';
import { sfx, setAmbientTheme, setMusicIntensity } from './audio.js';
import { OPENING_MUSIC } from './music-regions.js';
import { FILM } from './cinema.js';

const TAU = Math.PI * 2;
// Painted wider than the film, so a push or a drift never shows an edge.
const BG = { x: -220, y: -180, w: 1440, h: 920 };
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (k) => k * k * (3 - 2 * k);
const mix = (a, b, k) => a + (b - a) * k;
/** The same speck in the same place every time the film is watched. */
const rnd = (i) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const wrap = (v, n) => ((v % n) + n) % n;

// --- the vocabulary ---------------------------------------------------------

/** A sky, given as stops down the whole painted height. */
function sky(ctx, stops) {
  const g = ctx.createLinearGradient(0, BG.y, 0, BG.y + BG.h);
  for (const [at, col] of stops) g.addColorStop(at, col);
  ctx.fillStyle = g;
  ctx.fillRect(BG.x, BG.y, BG.w, BG.h);
}

/** Rolling land, cut off flat at the bottom of the frame. */
function ridge(ctx, y, amp, seed, fill, jag = 0) {
  ctx.beginPath();
  ctx.moveTo(BG.x, BG.y + BG.h);
  for (let x = BG.x; x <= BG.x + BG.w; x += 16) {
    const n = Math.sin((x + seed * 133) * 0.0042) * 0.6
      + Math.sin((x + seed * 71) * 0.011) * 0.3
      + Math.sin((x + seed * 29) * 0.026) * 0.1;
    const spike = jag ? Math.abs(Math.sin((x + seed * 17) * 0.009)) ** 3 * jag : 0;
    ctx.lineTo(x, y + n * amp - spike);
  }
  ctx.lineTo(BG.x + BG.w, BG.y + BG.h);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** A warm edge along the top of a ridge: the same line, lit, drawn under it. */
function rimRidge(ctx, y, amp, seed, fill, rim, lift = 3, jag = 0) {
  ridge(ctx, y - lift, amp, seed, rim, jag);
  ridge(ctx, y, amp, seed, fill, jag);
}

/** Light with no edge to it. */
function glow(ctx, x, y, r, col, a = 1) {
  const g = ctx.createRadialGradient(x, y, r * 0.04, x, y, r);
  g.addColorStop(0, col);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = a;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/**
 * Ash on the wind. Flakes, not dots: little squares tumbling down and across,
 * the same ones every time. `fall` upward is what a fire throws instead.
 */
function ash(ctx, t, o = {}) {
  const n = o.n || 150, fall = o.fall === undefined ? 30 : o.fall, wind = o.wind === undefined ? 16 : o.wind;
  const size = o.size || 2.4, alpha = o.alpha === undefined ? 0.5 : o.alpha, col = o.col || '#cfc4b8';
  ctx.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const sp = 0.35 + rnd(i) * 1.5;
    const x = wrap(rnd(i * 3 + 1) * BG.w + t * wind * sp + Math.sin(t * 0.6 + i) * 16, BG.w) + BG.x;
    const y = wrap(rnd(i * 5 + 2) * BG.h + t * fall * sp, BG.h) + BG.y;
    const s = size * (0.45 + rnd(i * 7 + 3) * 1.1);
    ctx.globalAlpha = alpha * (0.3 + rnd(i * 11 + 5) * 0.7);
    ctx.fillRect(x, y, s, s);
  }
  ctx.globalAlpha = 1;
}

/** An Ashlamp: a post, a hook, a lantern, and the pool it makes. */
function lamp(ctx, x, y, s, lit = 1, t = 0) {
  const h = 108 * s;
  if (lit > 0) {
    glow(ctx, x + 9 * s, y - h + 6 * s, 150 * s, `rgba(255,168,74,${0.5 * lit})`, 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x + 6 * s, y, 2, x + 6 * s, y, 120 * s);
    g.addColorStop(0, `rgba(255,150,60,${0.34 * lit})`);
    g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x + 6 * s, y, 120 * s, 34 * s, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#0a0709';
  ctx.fillRect(x - 3 * s, y - h, 6 * s, h);
  ctx.fillRect(x - 10 * s, y - 3 * s, 20 * s, 5 * s);
  ctx.fillRect(x - 2 * s, y - h - 4 * s, 20 * s, 4 * s);      // the hook
  const lx = x + 15 * s, ly = y - h + 2 * s;
  ctx.fillRect(lx - 9 * s, ly, 18 * s, 22 * s);
  if (lit > 0) {
    const flick = 0.82 + Math.sin(t * 7.3) * 0.1 + Math.sin(t * 3.1) * 0.08;
    ctx.fillStyle = `rgba(255,196,110,${lit * flick})`;
    ctx.fillRect(lx - 6 * s, ly + 3 * s, 12 * s, 16 * s);
    ctx.fillStyle = `rgba(255,246,214,${lit * flick})`;
    ctx.fillRect(lx - 3 * s, ly + 7 * s, 6 * s, 9 * s);
  }
}

/** A tower: a shaft, battlements, and sometimes a broken top. */
function tower(ctx, x, base, w, h, col, broken = 0) {
  ctx.fillStyle = col;
  if (!broken) {
    ctx.fillRect(x - w / 2, base - h, w, h);
    for (let i = -1; i <= 1; i++) ctx.fillRect(x - w / 2 + (i + 1) * (w / 3) + 1, base - h - w * 0.22, w / 3 - 2, w * 0.24);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x - w / 2, base);
  ctx.lineTo(x - w / 2, base - h * 0.92);
  ctx.lineTo(x - w * 0.16, base - h * 0.62);
  ctx.lineTo(x + w * 0.1, base - h * 0.78);
  ctx.lineTo(x + w / 2, base - h * 0.5);
  ctx.lineTo(x + w / 2, base);
  ctx.closePath();
  ctx.fill();
}

/** A hooded figure, flat: cloak, hood, and a staff if it carries one. */
function hooded(ctx, x, y, s, col, o = {}) {
  const sway = o.sway || 0;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x - 13 * s, y);
  ctx.quadraticCurveTo(x - 16 * s + sway, y - 30 * s, x - 9 * s, y - 52 * s);
  ctx.lineTo(x + 9 * s, y - 52 * s);
  ctx.quadraticCurveTo(x + 16 * s + sway, y - 30 * s, x + 13 * s, y);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y - 58 * s, 11 * s, 0, TAU);
  ctx.fill();
  ctx.beginPath();                                   // the hood's peak
  ctx.moveTo(x - 11 * s, y - 56 * s);
  ctx.quadraticCurveTo(x - 2 * s, y - 78 * s, x + 10 * s, y - 60 * s);
  ctx.closePath();
  ctx.fill();
  if (o.reach) {                                     // an arm up to the lantern
    ctx.save();
    ctx.lineWidth = 6 * s;
    ctx.strokeStyle = col;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + 6 * s, y - 46 * s);
    ctx.lineTo(x + 22 * s, y - 74 * s);
    ctx.stroke();
    ctx.restore();
  }
  if (o.staff) {
    ctx.save();
    ctx.lineWidth = 4 * s;
    ctx.strokeStyle = col;
    ctx.beginPath();
    ctx.moveTo(x + 15 * s, y + 3 * s);
    ctx.lineTo(x + 19 * s, y - 76 * s);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * A guardian, in shadow. Enough of a shape to know one from another: the ape's
 * shoulders, the serpent's coil, the peacock's fan, the cat's tails, the
 * knight's helm. Two embers where the eyes are.
 */
function beast(ctx, kind, x, base, s, t, eye = 1) {
  ctx.fillStyle = '#05040a';
  const b = ctx.beginPath.bind(ctx);
  let ex = x, ey = base - 60 * s, gap = 9 * s;
  if (kind === 'ape') {
    b(); ctx.ellipse(x, base - 34 * s, 34 * s, 34 * s, 0, 0, TAU); ctx.fill();
    b(); ctx.ellipse(x, base - 66 * s, 30 * s, 22 * s, 0, 0, TAU); ctx.fill();
    b(); ctx.ellipse(x, base - 86 * s, 14 * s, 13 * s, 0, 0, TAU); ctx.fill();
    ctx.lineWidth = 19 * s; ctx.strokeStyle = '#05040a'; ctx.lineCap = 'round';
    b();
    ctx.moveTo(x - 26 * s, base - 72 * s);
    ctx.quadraticCurveTo(x - 58 * s, base - 46 * s, x - 56 * s, base - 4 * s);
    ctx.stroke();
    b();
    ctx.moveTo(x + 26 * s, base - 72 * s);
    ctx.quadraticCurveTo(x + 58 * s, base - 46 * s, x + 56 * s, base - 4 * s);
    ctx.stroke();
    ey = base - 88 * s; gap = 6 * s;
  } else if (kind === 'serpent') {
    ctx.lineWidth = 17 * s; ctx.strokeStyle = '#05040a'; ctx.lineCap = 'round';
    b(); ctx.moveTo(x - 40 * s, base - 4 * s);
    ctx.quadraticCurveTo(x + 46 * s, base - 22 * s, x - 8 * s, base - 54 * s);
    ctx.quadraticCurveTo(x - 40 * s, base - 76 * s, x + 6 * s, base - 96 * s);
    ctx.stroke();
    b(); ctx.ellipse(x + 14 * s, base - 100 * s, 15 * s, 10 * s, -0.2, 0, TAU); ctx.fill();
    b();                                              // the hood
    ctx.moveTo(x - 4 * s, base - 96 * s);
    ctx.quadraticCurveTo(x + 4 * s, base - 128 * s, x + 30 * s, base - 108 * s);
    ctx.quadraticCurveTo(x + 22 * s, base - 92 * s, x - 4 * s, base - 96 * s);
    ctx.fill();
    ex = x + 18 * s; ey = base - 102 * s; gap = 6 * s;
  } else if (kind === 'peacock') {
    // The fan is one shape with a scalloped edge - drawn as spokes it reads as
    // a candelabra, which is not the bird we want.
    b();
    ctx.moveTo(x, base - 18 * s);
    for (let i = 0; i <= 26; i++) {
      const a = Math.PI * (1.04 - 1.08 * (i / 26));
      const r = (92 + (i % 2 ? 0 : 9)) * s;
      ctx.lineTo(x + Math.cos(a) * r * 1.16, base - 26 * s - Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    // The bird stands clear of its own fan, or it is only a fan.
    const bx = x - 86 * s;
    b(); ctx.ellipse(bx, base - 26 * s, 21 * s, 29 * s, 0.12, 0, TAU); ctx.fill();
    ctx.lineWidth = 9 * s; ctx.strokeStyle = '#05040a'; ctx.lineCap = 'round';
    b();                                               // neck
    ctx.moveTo(bx - 4 * s, base - 44 * s);
    ctx.quadraticCurveTo(bx - 30 * s, base - 70 * s, bx - 22 * s, base - 96 * s);
    ctx.stroke();
    b(); ctx.ellipse(bx - 23 * s, base - 104 * s, 11 * s, 9 * s, -0.3, 0, TAU); ctx.fill();
    b();                                               // beak
    ctx.moveTo(bx - 33 * s, base - 104 * s); ctx.lineTo(bx - 50 * s, base - 100 * s); ctx.lineTo(bx - 33 * s, base - 97 * s);
    ctx.closePath(); ctx.fill();
    ctx.lineWidth = 2.6 * s;
    for (let i = -1; i <= 1; i++) {                    // the crest
      b();
      ctx.moveTo(bx - 23 * s + i * 4 * s, base - 112 * s);
      ctx.lineTo(bx - 23 * s + i * 8 * s, base - 128 * s);
      ctx.stroke();
      b(); ctx.arc(bx - 23 * s + i * 8 * s, base - 130 * s, 3.4 * s, 0, TAU); ctx.fill();
    }
    ey = base - 105 * s; ex = bx - 26 * s; gap = 4 * s;
  } else if (kind === 'cat') {
    ctx.lineWidth = 6 * s; ctx.strokeStyle = '#05040a'; ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const a = -0.5 - i * 0.22 + Math.sin(t * 1.4 + i) * 0.07;
      b();
      ctx.moveTo(x + 22 * s, base - 42 * s);
      ctx.quadraticCurveTo(x + 60 * s, base - 62 * s - i * 6 * s, x + 46 * s + Math.cos(a) * 34 * s, base - 78 * s + Math.sin(a) * 22 * s);
      ctx.stroke();
    }
    b(); ctx.ellipse(x, base - 36 * s, 27 * s, 19 * s, 0, 0, TAU); ctx.fill();
    b(); ctx.ellipse(x - 24 * s, base - 58 * s, 13 * s, 12 * s, 0, 0, TAU); ctx.fill();
    b();
    ctx.moveTo(x - 34 * s, base - 66 * s); ctx.lineTo(x - 30 * s, base - 84 * s); ctx.lineTo(x - 24 * s, base - 66 * s);
    ctx.moveTo(x - 20 * s, base - 66 * s); ctx.lineTo(x - 15 * s, base - 84 * s); ctx.lineTo(x - 11 * s, base - 66 * s);
    ctx.fill();
    ex = x - 26 * s; ey = base - 58 * s; gap = 6 * s;
  } else if (kind === 'croc') {
    b(); ctx.ellipse(x + 10 * s, base - 26 * s, 50 * s, 22 * s, 0, 0, TAU); ctx.fill();
    ctx.lineWidth = 14 * s; ctx.strokeStyle = '#05040a'; ctx.lineCap = 'round';
    b();                                               // a tail out behind it
    ctx.moveTo(x + 52 * s, base - 28 * s);
    ctx.quadraticCurveTo(x + 104 * s, base - 22 * s, x + 118 * s, base - 62 * s);
    ctx.stroke();
    b(); ctx.ellipse(x - 34 * s, base - 40 * s, 26 * s, 18 * s, -0.12, 0, TAU); ctx.fill();
    b();                                               // upper jaw, open
    ctx.moveTo(x - 46 * s, base - 48 * s);
    ctx.lineTo(x - 122 * s, base - 76 * s);
    ctx.lineTo(x - 120 * s, base - 62 * s);
    ctx.lineTo(x - 44 * s, base - 40 * s);
    ctx.closePath(); ctx.fill();
    b();                                               // lower jaw
    ctx.moveTo(x - 46 * s, base - 34 * s);
    ctx.lineTo(x - 116 * s, base - 34 * s);
    ctx.lineTo(x - 114 * s, base - 24 * s);
    ctx.lineTo(x - 44 * s, base - 26 * s);
    ctx.closePath(); ctx.fill();
    for (let i = 0; i < 7; i++) {                      // the ridge of its back
      b();
      ctx.moveTo(x + 44 * s - i * 15 * s, base - 44 * s);
      ctx.lineTo(x + 37 * s - i * 15 * s, base - 62 * s);
      ctx.lineTo(x + 30 * s - i * 15 * s, base - 44 * s);
      ctx.fill();
    }
    ex = x - 40 * s; ey = base - 48 * s; gap = 0;
    glow(ctx, ex, ey, 18 * s, `rgba(255,120,40,${0.75 * eye})`);
    ctx.fillStyle = `rgba(255,214,150,${eye})`;
    ctx.fillRect(ex - 3 * s, ey - 2 * s, 6 * s, 4 * s);
  } else {                                            // a knight
    b();
    ctx.moveTo(x - 20 * s, base);
    ctx.lineTo(x - 15 * s, base - 62 * s);
    ctx.lineTo(x + 15 * s, base - 62 * s);
    ctx.lineTo(x + 20 * s, base);
    ctx.closePath(); ctx.fill();
    b(); ctx.ellipse(x, base - 74 * s, 13 * s, 14 * s, 0, 0, TAU); ctx.fill();
    b();                                              // a crest
    ctx.moveTo(x - 3 * s, base - 84 * s);
    ctx.quadraticCurveTo(x + 2 * s, base - 112 * s, x + 16 * s, base - 104 * s);
    ctx.quadraticCurveTo(x + 6 * s, base - 92 * s, x + 5 * s, base - 84 * s);
    ctx.fill();
    ctx.lineWidth = 7 * s; ctx.strokeStyle = '#05040a'; ctx.lineCap = 'butt';
    b(); ctx.moveTo(x + 22 * s, base - 54 * s); ctx.lineTo(x + 34 * s, base - 128 * s); ctx.stroke();
    ey = base - 76 * s; gap = 5 * s;
  }
  if (eye > 0 && gap > 0) {
    glow(ctx, ex - gap, ey, 14 * s, `rgba(255,120,40,${0.75 * eye})`);
    glow(ctx, ex + gap, ey, 14 * s, `rgba(255,120,40,${0.75 * eye})`);
    ctx.fillStyle = `rgba(255,214,150,${eye})`;
    ctx.fillRect(ex - gap - 2 * s, ey - 1.6 * s, 4 * s, 3.2 * s);
    ctx.fillRect(ex + gap - 2 * s, ey - 1.6 * s, 4 * s, 3.2 * s);
  }
}

/** The Ashen Gate: two piers, an arch, and thirteen sockets waiting to be lit. */
function ashenGate(ctx, x, base, s, lit = 0) {
  const pw = 62 * s;              // how thick a pier is
  const inner = 118 * s;          // half the opening
  const spring = base - 250 * s;  // where the arch begins to turn
  const crown = base - 348 * s;

  const way = () => {
    ctx.beginPath();
    ctx.moveTo(x - inner, base);
    ctx.lineTo(x - inner, spring);
    ctx.quadraticCurveTo(x, crown, x + inner, spring);
    ctx.lineTo(x + inner, base);
    ctx.closePath();
  };

  // What is through it: a cold light, and a step up to a dais.
  const g = ctx.createLinearGradient(0, crown, 0, base);
  g.addColorStop(0, 'rgba(140,175,225,0.05)');
  g.addColorStop(0.55, 'rgba(150,185,235,0.3)');
  g.addColorStop(1, 'rgba(190,215,255,0.5)');
  ctx.fillStyle = g;
  way();
  ctx.fill();
  glow(ctx, x, base - 120 * s, 230 * s, 'rgba(150,190,245,0.4)');
  ctx.fillStyle = 'rgba(10,12,22,0.75)';
  ctx.fillRect(x - 54 * s, base - 108 * s, 108 * s, 14 * s);
  ctx.fillRect(x - 36 * s, base - 128 * s, 72 * s, 22 * s);

  // The gate itself, cut out of the wall it stands in.
  ctx.save();
  ctx.fillStyle = '#0b0912';
  ctx.beginPath();
  ctx.moveTo(x - inner - pw - 260 * s, base);
  ctx.lineTo(x - inner - pw - 260 * s, base - 150 * s);
  ctx.lineTo(x - inner - pw, base - 210 * s);
  ctx.lineTo(x - inner - pw, spring - 34 * s);
  ctx.quadraticCurveTo(x, crown - 58 * s, x + inner + pw, spring - 34 * s);
  ctx.lineTo(x + inner + pw, base - 210 * s);
  ctx.lineTo(x + inner + pw + 260 * s, base - 150 * s);
  ctx.lineTo(x + inner + pw + 260 * s, base);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  way();
  ctx.fill();
  ctx.restore();

  // A cold edge round the opening, so the way through reads as deep.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(150,190,245,0.4)';
  ctx.lineWidth = 3 * s;
  way();
  ctx.stroke();
  ctx.restore();

  // Thirteen sockets over the arch, waiting for thirteen Remnants.
  for (let i = 0; i < 13; i++) {
    const a = Math.PI * (0.08 + 0.84 * (i / 12));
    const rx = x - Math.cos(a) * (inner + pw * 0.55);
    const ry = spring - 26 * s - Math.sin(a) * 118 * s;
    const on = i < lit * 13;
    if (on) glow(ctx, rx, ry, 30 * s, 'rgba(255,150,60,0.85)');
    ctx.fillStyle = on ? '#ffc271' : '#1b1622';
    ctx.beginPath();
    ctx.arc(rx, ry, 8 * s, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,110,140,0.35)';
    ctx.lineWidth = 1.6 * s;
    ctx.stroke();
  }
}

// --- the Wanderer -----------------------------------------------------------
//
// The game's own figure, posed the way the preview page poses it: set where it
// faces, run the rig on, then draw. Nothing about it is redrawn here.

let hero = null;
let heroT = 0;

function theHero() {
  if (!hero) hero = createPlayer(WEAPONS[0], {});
  return hero;
}

/** Face, walk, strike - whatever this shot wants, settled over a few frames. */
function poseHero(t, o = {}) {
  const p = theHero();
  let dt = t - heroT;
  if (dt < 0 || dt > 0.4) { dt = 1 / 60; heroT = t; }
  heroT = t;
  const face = o.face === undefined ? Math.PI / 2 : o.face;
  p.aimAngle = face; p.wFace = face; p.moveAngle = face;
  p.moveMag = o.walk ? 1 : 0;
  p.hurtFlash = 0; p.invuln = 0;
  if (o.walk) { p.x += Math.cos(face) * 150 * dt; p.y += Math.sin(face) * 150 * dt; }
  if (o.phase) {
    const step = p.weapon.combo[0];
    p.attack = { step, index: 0, isSpecial: false, power: 1, phase: o.phase, angle: face, t: (step[o.phase] || 0.08) * 0.45 };
  } else p.attack = null;
  updatePlayerAnim(p, dt);
  prepareWanderer(p);
  return p;
}

/** A few frames at once, so a figure never appears mid-settle at a cut. */
function settleHero(o) {
  for (let i = 0; i < 24; i++) { heroT = i / 60; poseHero((i + 1) / 60, o); }
  heroT = 0;
}

function drawHero(ctx, p, x, y, s) {
  const was = look.skin;
  look.skin = 'wanderer';
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.translate(-p.x, -p.y);
  try { drawPlayer(p, ctx); } finally { ctx.restore(); look.skin = was; }
}

// --- the film ---------------------------------------------------------------

const HALF = FILM.w / 2;

export function openingFilm() {
  return [
    // 1 - there was a fire ---------------------------------------------------
    {
      hold: 4.3,
      say: 'There was a fire once. It warmed the whole of the world.',
      cam: { z0: 1, z1: 1.09 },
      cue: () => { setMusicIntensity(0); setAmbientTheme(OPENING_MUSIC.ash); },
      draw(ctx, t) {
        sky(ctx, [[0, '#07050c'], [0.4, '#1d0a12'], [0.6, '#5d1c12'], [0.66, '#b4491a'], [0.72, '#2a1010'], [1, '#08060a']]);
        glow(ctx, HALF, 396, 330, 'rgba(255,140,50,0.55)');
        ctx.fillStyle = '#ffcf7a';
        ctx.beginPath();
        ctx.arc(HALF, 400, 118, 0, TAU);
        ctx.fill();
        glow(ctx, HALF, 400, 150, 'rgba(255,210,140,0.85)');
        ash(ctx, t, { n: 90, fall: -34, wind: 9, alpha: 0.75, size: 2.6, col: '#ffb15e' });
        rimRidge(ctx, 406, 26, 3, '#0d0710', 'rgba(255,146,60,0.75)', 3);
        rimRidge(ctx, 470, 34, 11, '#070409', 'rgba(255,120,48,0.4)', 2);
        ridge(ctx, 540, 22, 23, '#030206');
      },
    },

    // 2 - and it fell --------------------------------------------------------
    {
      hold: 4.6,
      say: 'Then it fell. The sky has been coming down ever since.',
      sayAt: 1.5,
      cam: { z0: 1.12, z1: 1 },
      cue: () => sfx.thunder(),
      beats: [{ at: 1.05, run: () => { sfx.explode(); sfx.bossRoar(); } }],
      draw(ctx, t) {
        const hit = clamp01((t - 1.05) / 0.5);
        sky(ctx, [[0, '#2a0a0a'], [0.3, '#180810'], [0.62, '#3a1210'], [0.68, '#6a2412'], [1, '#06050a']]);
        glow(ctx, 300, 120, 420, `rgba(220,60,30,${0.3 + 0.25 * hit})`);
        // The thing that came down, and the flash when it landed.
        if (t < 1.1) {
          const f = clamp01((t - 0.25) / 0.85);
          const sx = mix(140, 470, f), sy = mix(-170, 356, f);
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = 'rgba(255,220,170,0.75)';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(sx - 120, sy - 140);
          ctx.lineTo(sx, sy);
          ctx.stroke();
          ctx.restore();
          glow(ctx, sx, sy, 90, 'rgba(255,240,200,0.95)');
        }
        rimRidge(ctx, 372, 30, 5, '#0a0610', `rgba(255,120,50,${0.35 + 0.5 * hit})`, 4, 64);
        // A city big enough to be worth losing, and one tower going over.
        const base = 470;
        if (hit > 0) {                       // the fire it is burning with
          glow(ctx, 500, 430, 340 * hit, `rgba(255,150,60,${0.5 * (1 - hit * 0.35)})`);
          ctx.save();
          ctx.globalAlpha = 0.45 * hit;
          ctx.fillStyle = '#17101a';
          ctx.beginPath();
          ctx.moveTo(470, base - 190);
          ctx.quadraticCurveTo(390, 150, 470, -190);
          ctx.lineTo(700, -190);
          ctx.quadraticCurveTo(600, 170, 540, base - 170);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = '#05040a';
        ctx.fillRect(318, base - 74, 372, 74);
        tower(ctx, 360, base, 40, 150, '#05040a');
        tower(ctx, 424, base, 30, 106, '#05040a');
        tower(ctx, 500, base, 52, 214, '#05040a', hit > 0.2 ? 1 : 0);
        tower(ctx, 576, base, 30, 120, '#05040a');
        tower(ctx, 646, base, 38, 164, '#05040a');
        ridge(ctx, 492, 26, 11, '#060409');
        ash(ctx, t * 1.6, { n: 170, fall: 62, wind: 34, alpha: 0.42 * hit, size: 3 });
        if (t > 1.05 && t < 1.28) {
          ctx.fillStyle = `rgba(255,236,206,${(1 - (t - 1.05) / 0.23) * 0.8})`;
          ctx.fillRect(BG.x, BG.y, BG.w, BG.h);
        }
      },
    },

    // 3 - what it took -------------------------------------------------------
    {
      hold: 4.3,
      say: 'It took the towns, then the roads, then the names.',
      cam: { z0: 1.06, z1: 1.14, x0: -60, x1: 60 },
      cue: () => sfx.hiss(),
      draw(ctx, t) {
        sky(ctx, [[0, '#0d0b0e'], [0.5, '#1d1a1a'], [0.68, '#342c26'], [1, '#100d0b']]);
        ridge(ctx, 250, 16, 31, 'rgba(64,55,48,0.75)');
        ridge(ctx, 316, 22, 7, '#2b241f');
        ridge(ctx, 392, 26, 19, '#1d1815');
        // One ember left in all of it, and it goes out while you watch.
        const life = clamp01(1 - t / 3.6);
        if (life > 0) glow(ctx, 520, 430, 210 * life, `rgba(255,130,50,${0.35 * life})`);
        // Drifts, and what is under them.
        ctx.fillStyle = '#4e4339';
        ctx.beginPath();
        ctx.moveTo(BG.x, 740);
        for (let x = BG.x; x < BG.x + BG.w; x += 20) ctx.lineTo(x, 388 + Math.sin(x * 0.006) * 28 + Math.sin(x * 0.019) * 12);
        ctx.lineTo(BG.x + BG.w, 740);
        ctx.closePath();
        ctx.fill();
        // A helmet, half buried, its crown still catching the last of the light.
        ctx.fillStyle = '#0c0a10';
        ctx.beginPath();
        ctx.ellipse(356, 392, 78, 70, 0.08, Math.PI, TAU);
        ctx.fill();
        ctx.fillRect(278, 382, 156, 22);
        ctx.fillStyle = '#3a3132';
        ctx.fillRect(300, 358, 92, 11);
        ctx.fillStyle = '#080609';
        ctx.fillRect(316, 372, 64, 12);
        // A spear, broken, and a lantern gone out.
        ctx.save();
        ctx.strokeStyle = '#100c15';
        ctx.lineWidth = 15;
        ctx.beginPath();
        ctx.moveTo(604, 404);
        ctx.lineTo(700, 148);
        ctx.stroke();
        ctx.fillStyle = '#100c15';
        ctx.beginPath();
        ctx.moveTo(700, 148);
        ctx.lineTo(722, 88);
        ctx.lineTo(682, 104);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#0c0a10';
        ctx.fillRect(790, 352, 62, 46);
        ctx.fillStyle = '#332c39';
        ctx.fillRect(803, 364, 36, 23);
        if (life > 0) glow(ctx, 520, 384, 64 * life, `rgba(255,150,70,${0.65 * life})`);
        ash(ctx, t, { n: 220, fall: 26, wind: 26, alpha: 0.5, size: 2.2, col: '#b9ada0' });
      },
    },

    // 4 - the lamps ----------------------------------------------------------
    {
      hold: 4.4,
      say: 'But someone still walks the road, and keeps the lamps lit.',
      cam: { z0: 1.04, z1: 1.1, x0: 90, x1: -60 },
      cue: () => sfx.bell(),
      draw(ctx, t) {
        sky(ctx, [[0, '#070912'], [0.45, '#0d1220'], [0.66, '#1b2436'], [1, '#05060c']]);
        glow(ctx, 760, 150, 200, 'rgba(150,180,230,0.18)');
        ctx.fillStyle = 'rgba(206,220,245,0.5)';
        ctx.beginPath();
        ctx.arc(760, 150, 26, 0, TAU);
        ctx.fill();
        ridge(ctx, 372, 34, 41, '#0c1018', 34);
        ridge(ctx, 412, 26, 13, '#080b12');
        ridge(ctx, 520, 30, 3, '#04050a');
        // The road, and the lamps along it going away into the dark.
        ctx.save();
        ctx.strokeStyle = 'rgba(120,110,100,0.16)';
        ctx.lineWidth = 46;
        ctx.beginPath();
        ctx.moveTo(180, 620);
        ctx.quadraticCurveTo(470, 520, 690, 408);
        ctx.stroke();
        ctx.restore();
        const spots = [[236, 574, 0.95], [372, 528, 0.7], [486, 490, 0.5], [576, 458, 0.36], [648, 432, 0.26], [700, 414, 0.19]];
        for (let i = spots.length - 1; i >= 0; i--) {
          const [x, y, s] = spots[i];
          lamp(ctx, x, y, s, 1, t + i * 1.7);
        }
        ash(ctx, t, { n: 150, fall: 24, wind: 14, alpha: 0.3, size: 2.2, col: '#b6c2d4' });
        ash(ctx, t * 1.1, { n: 40, fall: 18, wind: 10, alpha: 0.5, size: 2.4, col: '#ffbe78' });
      },
    },

    // 5 - what a lamp is for -------------------------------------------------
    {
      hold: 4.4,
      say: 'A lamp is a promise: rest at one, and you will wake at it.',
      cam: { z0: 1.16, z1: 1.04, y0: 10, y1: -10 },
      cue: () => sfx.chime(),
      draw(ctx, t) {
        sky(ctx, [[0, '#06070e'], [0.55, '#0b0d16'], [1, '#030408']]);
        ridge(ctx, 446, 18, 17, '#070810');
        const lit = clamp01((t - 1.1) / 1.2);
        lamp(ctx, 580, 486, 2.1, lit, t);
        // Lit down the side facing the lamp, so the figure is a shape and not a hole.
        hooded(ctx, 440, 486, 1.9, `rgba(255,150,70,${0.16 + 0.34 * lit})`, { reach: true });
        hooded(ctx, 434, 486, 1.9, '#0b0910', { reach: true });
        if (lit > 0) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = lit;
          ash(ctx, t * 0.7, { n: 60, fall: 12, wind: 6, alpha: 0.55, size: 2.6, col: '#ffca8a' });
          ctx.restore();
        }
        ash(ctx, t, { n: 90, fall: 22, wind: 12, alpha: 0.22, size: 2.2, col: '#a9a196' });
      },
    },

    // 6 - the thirteen -------------------------------------------------------
    {
      hold: 5,
      say: 'Thirteen things hold what is left of it. They do not sleep.',
      sayAt: 1.2,
      cam: { z0: 1.02, z1: 1.12 },
      cue: () => sfx.bossRoar(),
      draw(ctx, t) {
        sky(ctx, [[0, '#0a0508'], [0.45, '#1d0910'], [0.66, '#4d1613'], [0.72, '#180a0c'], [1, '#050308']]);
        glow(ctx, HALF, 448, 430, 'rgba(210,58,32,0.5)');
        // The land is kept LOW here: every guardian has to stand against the
        // sky, or a black shape on a black hill is all anyone sees.
        ridge(ctx, 496, 18, 29, '#0a0510');
        // Five of them, standing at five distances so that the shapes stay
        // apart: a row of one black mass says nothing about any of them.
        const row = [
          ['croc', 118, 512, 1.4], ['peacock', 356, 496, 1.25], ['ape', 566, 520, 1.8],
          ['knight', 764, 494, 1.4], ['serpent', 930, 510, 1.5],
        ];
        row.forEach(([kind, x, base, s], i) => {
          const up = ease(clamp01((t - 0.3 - i * 0.2) / 1.5));
          const eye = clamp01((t - 1.6 - i * 0.3) / 0.7);
          ctx.save();
          ctx.translate(0, (1 - up) * 170);
          beast(ctx, kind, x, base, s, t, eye);
          ctx.restore();
        });
        ridge(ctx, 556, 14, 47, '#030206');
        ash(ctx, t, { n: 140, fall: 34, wind: 20, alpha: 0.32, size: 2.4, col: '#b09a92' });
      },
    },

    // 7 - the gate -----------------------------------------------------------
    {
      hold: 4.6,
      say: 'Behind the Ashen Gate, the Warden waits for all thirteen to fall.',
      cam: { z0: 1, z1: 1.1, y0: 20, y1: -12 },
      cue: () => sfx.thud(),
      draw(ctx, t) {
        sky(ctx, [[0, '#05060c'], [0.5, '#0a0c16'], [0.7, '#14161f'], [1, '#040509']]);
        ridge(ctx, 356, 26, 37, '#080a10', 40);
        ashenGate(ctx, HALF, 486, 1, 0);
        // Braziers either side of the way in.
        for (const bx of [268, 732]) {
          const f = 0.8 + Math.sin(t * 6 + bx) * 0.12;
          glow(ctx, bx, 430, 110 * f, 'rgba(255,140,50,0.55)');
          ctx.fillStyle = '#0a0810';
          ctx.fillRect(bx - 13, 432, 26, 56);
          ctx.fillStyle = `rgba(255,170,80,${f})`;
          ctx.beginPath();
          ctx.ellipse(bx, 426, 12, 18 * f, 0, 0, TAU);
          ctx.fill();
        }
        // Someone small at the foot of it, for the size of the thing.
        hooded(ctx, 420, 488, 0.75, '#07060c', { staff: true });
        ridge(ctx, 516, 12, 5, '#03040a');
        ash(ctx, t, { n: 150, fall: 30, wind: 16, alpha: 0.3, size: 2.4, col: '#a8a49e' });
      },
    },

    // 8 - and you ------------------------------------------------------------
    {
      hold: 5.2,
      say: 'You woke with your name still on you. That is rare.',
      sayAt: 1.8,
      cam: { z0: 1.14, z1: 1.03, x0: -20, x1: 10 },
      cue: () => { settleHero({ face: Math.PI / 2 }); sfx.heal(); },
      // The turn: the piece changes under the shot where you stand up. The
      // swap takes 1.4 s to cross, so it is asked for before the moment.
      beats: [{ at: 1.5, run: () => { setAmbientTheme(OPENING_MUSIC.road); sfx.spawn(); } }],
      draw(ctx, t) {
        sky(ctx, [[0, '#06070e'], [0.55, '#0a0c15'], [1, '#040509']]);
        ridge(ctx, 372, 16, 61, '#070810');
        lamp(ctx, 292, 414, 1.7, 1, t);
        const up = ease(clamp01((t - 0.8) / 1.9));
        const p = poseHero(t, { face: Math.PI / 2 });
        ctx.save();
        ctx.translate(602, 410);
        ctx.rotate(mix(-0.38, 0, up));      // down on one knee, then up
        ctx.translate(0, mix(26, 0, up));
        drawHero(ctx, p, 0, 0, mix(2.6, 3.2, up));
        ctx.restore();
        ash(ctx, t, { n: 110, fall: 22, wind: 11, alpha: 0.3, size: 2.3, col: '#a9a196' });
      },
    },

    // 9 - what the fallen leave ----------------------------------------------
    {
      hold: 4.4,
      say: 'What a fallen thing leaves is warmth. Take it, and grow.',
      cam: { z0: 1.08, z1: 1.16, x0: 20, x1: -24 },
      cue: () => { settleHero({ face: 0, phase: 'active' }); sfx.swing(1.2); },
      beats: [{ at: 0.42, run: () => sfx.hit(1.4) }],
      draw(ctx, t) {
        sky(ctx, [[0, '#0a0610'], [0.5, '#170a14'], [0.7, '#3a1418'], [1, '#050308']]);
        glow(ctx, 700, 430, 300, 'rgba(180,50,40,0.4)');
        ridge(ctx, 392, 18, 71, '#08050e');
        beast(ctx, 'ape', 764, 442, 1.85, t, 1);
        const p = poseHero(t, { face: 0, phase: 'active' });
        drawHero(ctx, p, 336, 424, 3.1);
        // The arc the blade leaves, and what comes off the thing it lands on.
        const cut = clamp01((t - 0.25) / 0.95);
        if (cut > 0 && cut < 1) {
          glow(ctx, 660, 400, 180 * (1 - cut), `rgba(255,190,110,${0.5 * (1 - cut)})`);
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = `rgba(255,228,180,${(1 - cut) * 0.85})`;
          ctx.lineWidth = 10 * (1 - cut) + 2;
          ctx.beginPath();
          ctx.arc(440, 372, 150, -1.1 + cut * 0.5, 0.5 + cut * 0.5);
          ctx.stroke();
          ctx.restore();
        }
        const flow = clamp01((t - 0.5) / 3.6);
        for (let i = 0; i < 46; i++) {
          const f = wrap(rnd(i) + t * 0.32, 1);
          const x = mix(730 + rnd(i * 3) * 100 - 50, 366, ease(f));
          const y = mix(352 - rnd(i * 5) * 130, 388 - rnd(i * 7) * 44, ease(f)) + Math.sin(t * 2 + i) * 9;
          ctx.globalAlpha = (1 - f) * 0.9 * flow;
          ctx.fillStyle = '#ffc070';
          ctx.fillRect(x, y, 3, 3);
        }
        ctx.globalAlpha = 1;
        ash(ctx, t, { n: 120, fall: 40, wind: 24, alpha: 0.28, size: 2.4, col: '#b09a92' });
      },
    },

    // 10 - the road out ------------------------------------------------------
    {
      hold: 5.4,
      say: 'Thirteen guardians. One road. Go and be the fire for a while.',
      sayAt: 1.4,
      cam: { z0: 1.3, z1: 1 },
      cue: () => { settleHero({ face: -Math.PI / 2, walk: true }); sfx.door(); },
      draw(ctx, t) {
        sky(ctx, [[0, '#120e1c'], [0.42, '#2e1a22'], [0.62, '#7a3a22'], [0.68, '#d98a3e'], [0.73, '#3a2018'], [1, '#0a0810']]);
        glow(ctx, 640, 386, 300, 'rgba(255,150,60,0.4)');
        rimRidge(ctx, 388, 30, 43, '#150e18', 'rgba(255,150,70,0.5)', 3, 46);
        rimRidge(ctx, 418, 22, 9, '#0e0a12', 'rgba(255,130,60,0.3)', 2);
        // Water catching the last of the light.
        ctx.fillStyle = 'rgba(190,120,70,0.35)';
        ctx.beginPath();
        ctx.ellipse(250, 452, 150, 18, 0, 0, TAU);
        ctx.fill();
        ridge(ctx, 470, 24, 27, '#090610');
        tower(ctx, 830, 424, 26, 92, '#0b0712');
        tower(ctx, 862, 424, 18, 62, '#0b0712');
        // The road down the middle, and the lamps that mark it.
        ctx.save();
        ctx.strokeStyle = 'rgba(180,140,100,0.2)';
        ctx.lineWidth = 64;
        ctx.beginPath();
        ctx.moveTo(420, 600);
        ctx.quadraticCurveTo(468, 500, 566, 442);
        ctx.stroke();
        ctx.restore();
        lamp(ctx, 306, 470, 0.85, 1, t);
        lamp(ctx, 556, 452, 0.42, 1, t + 2);
        const p = poseHero(t, { face: -Math.PI / 2, walk: true });
        drawHero(ctx, p, 438, 444, 2.1);
        ash(ctx, t, { n: 150, fall: 34, wind: 20, alpha: 0.4, size: 2.6, col: '#e8b784' });
      },
    },

    // 11 - the name of it ----------------------------------------------------
    {
      hold: 4.4,
      cam: { z0: 1, z1: 1.06 },
      draw(ctx, t) {
        ctx.fillStyle = '#07060b';
        ctx.fillRect(BG.x, BG.y, BG.w, BG.h);
        glow(ctx, HALF, 300, 340, 'rgba(120,50,30,0.35)');
        ash(ctx, t, { n: 120, fall: -18, wind: 8, alpha: 0.4, size: 2.4, col: '#c08a5e' });
        const em = 0.7 + Math.sin(t * 2.2) * 0.12;
        glow(ctx, HALF, 372 - t * 16, 40 * em, 'rgba(255,150,60,0.9)');

        const g = ctx.createLinearGradient(0, 210, 0, 300);
        g.addColorStop(0, '#fff5e0');
        g.addColorStop(0.6, '#ff9a4d');
        g.addColorStop(1, '#c8354f');
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = '800 92px "Segoe UI", Roboto, system-ui, sans-serif';
        ctx.globalAlpha = clamp01((t - 0.3) / 1.1);
        ctx.fillStyle = g;
        ctx.fillText('ASHFALL', HALF, 292);
        ctx.globalAlpha = clamp01((t - 1.3) / 1.1) * 0.75;
        ctx.fillStyle = '#d8ccbc';
        ctx.font = '600 15px "Segoe UI", Roboto, system-ui, sans-serif';
        ctx.fillText('AN OPEN WORLD OF ASH AND LAMPLIGHT', HALF, 330);
        ctx.restore();
      },
    },
  ];
}
