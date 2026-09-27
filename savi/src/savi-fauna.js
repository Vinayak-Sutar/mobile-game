// WHAT ELSE LIVES HERE.
//
// The valley had a girl, an old woman and a tree in it, and nothing else that
// moved. That is a very quiet way to say "dying", but it is also a very quiet
// way to say "empty", and a cozy game cannot afford to read as empty.
//
// So: sambar deer and their fawns on the grass, peacocks on the road and round
// the shrine, hares in the scrub, cranes standing in the shallows, and birds
// in the air. They are decoration with one job - the valley should feel lived
// in - and they are wired to the healing, which is the second job:
//
//   at the start   nothing. An empty valley, which is the problem.
//   as she works    one or two come back to EACH ROOT SHE FREES, and only
//                   there - the ground she has not got to yet stays empty
//   at the end      the tree blooms and the whole place fills up at once
//
// That curve is the whole point, and the middle of it is the part that says
// something. An animal standing on ground she cleared an hour ago is the
// valley answering her; the same animal standing on ground she has not
// touched is decoration. So they are grouped by ROOT, and a root's animals
// do not exist until that root is awake. Nothing has to be said about it and
// nothing in the HUD counts it; you walk back past the thorn a day later and
// there is a deer in it.
//
// None of it collides with anything. There is nothing here to get stuck on,
// nothing to push her off a ledge, and nothing that can wander into the river.
// Everything checks the ground it is about to stand on against the same
// `classify` the terrain painter uses, and turns round if it does not like it.

import { TT } from './terrain.js';

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Where each of them will stand, how fast it goes, and how far it strays. */
const DRY = [TT.GRASS, TT.TALL, TT.MOSS, TT.DIRT];
const KINDS = {
  deer: { sp: 44, run: 130, roam: 240, r: 13, ground: DRY },
  fawn: { sp: 42, run: 138, roam: 150, r: 9, ground: DRY },
  peacock: { sp: 32, run: 94, roam: 160, r: 10, ground: [...DRY, TT.PAVE, TT.GRAVEL] },
  hare: { sp: 38, run: 158, roam: 130, r: 6, ground: DRY },
  crane: { sp: 22, run: 66, roam: 90, r: 11, ground: [TT.SHALLOW, TT.MUD] },
};

const A = [];        // everything that walks
const F = [];        // the flocks
const R = [];        // the regions they belong to
let VW = 0, VH = 0;
let ok = null;       // (x, y, kind) -> may something of that kind stand here

/** What each region gets, in the order it gets it. The first two show early. */
const MIX = ['deer', 'hare', 'peacock', 'fawn', 'deer', 'hare', 'crane', 'peacock'];

/**
 * Scatter them BY REGION - one cluster per root, and one round the tree.
 *
 * They used to be sown anywhere in five thousand by three thousand, which put
 * most of them in corners of the valley she never walks through and made the
 * count meaningless: "more animals as it heals" is nothing if you cannot tell
 * where the extra ones went. Grouped round the roots, the same animals say
 * something specific - this ground is alive again, and that ground is not.
 *
 * Each one still gets a HOME it wanders around inside its region, because an
 * animal that can end up anywhere ends up nowhere in particular.
 */
export function initFauna(V, classify, regions) {
  VW = V.w; VH = V.h;
  ok = (x, y, k) => {
    if (x < 60 || y < 60 || x > VW - 60 || y > VH - 60) return false;
    return KINDS[k].ground.includes(classify(x, y));
  };
  A.length = 0; F.length = 0; R.length = 0;
  for (let g = 0; g < regions.length; g++) {
    const G = regions[g];
    // One region gets a single animal early and the next gets two, so the
    // valley does not come back in a pattern.
    const reg = { id: G.id, x: G.x, y: G.y, few: G.hub ? 0 : 1 + (g & 1), n: 0 };
    R.push(reg);
    for (const k of MIX) {
      // Try honestly for a spot inside the region, and if there is nowhere in
      // it this one likes - a crane wants water and most regions have none -
      // it simply never exists. Better a missing crane than a crane in a cliff.
      let hx = 0, hy = 0, got = false;
      for (let tr = 0; tr < 400 && !got; tr++) {
        const a = rand(0, TAU), d = rand(150, G.r || 560);
        hx = G.x + Math.cos(a) * d; hy = G.y + Math.sin(a) * d;
        got = ok(hx, hy, k);
      }
      if (!got) continue;
      A.push({
        k, region: reg, rank: reg.n++, hx, hy, x: hx, y: hy, tx: hx, ty: hy,
        dir: Math.random() < 0.5 ? -1 : 1, mode: 'graze', t: rand(0, 4),
        ph: rand(0, TAU), seed: Math.random() * 1000, head: 0, buck: Math.random() < 0.45,
        sp: 0, on: false,
      });
    }
    // A flock over the same ground, on the same terms.
    F.push({
      region: reg, x: G.x, y: G.y, a: rand(0, TAU), h: rand(46, 96),
      n: 3 + (g % 5), t: rand(0, 9), sp: rand(30, 52), on: false,
    });
  }
  return A.length;
}

/**
 * IS THIS ONE OUT TODAY?
 *
 * Before the tree blooms: only if its root is awake, and only the first one
 * or two of that root's animals. After: all of them, everywhere, fading in
 * over the bloom - including the ones round the tree, which is a region with
 * `few: 0` and therefore exists only for the ending.
 */
function present(a, woken, bloom) {
  const reg = a.region;
  const base = woken && woken[reg.id] ? reg.few : 0;
  return a.rank < base + Math.round(bloom * (reg.n - base));
}

/**
 * A step. Four moods and nothing cleverer: graze, walk somewhere, freeze
 * because something is coming, and run. The distance at which they freeze and
 * run SHRINKS as the valley comes back, which is how the tameness is done -
 * the same animals, standing their ground a little longer each time.
 */
export function stepFauna(dt, S, st) {
  const bloom = clamp01(st.bloomK || 0);
  const flee = 128 - bloom * 60;
  const wary = flee + 66;
  // Who is out, worked out once and read by both draw passes, so the two can
  // never disagree about whether something exists.
  for (const a of A) a.on = present(a, st.woken, bloom);
  for (const f of F) f.on = !!(st.woken && st.woken[f.region.id]) || bloom > 0.35;
  for (const a of A) {
    if (!a.on) continue;
    const K = KINDS[a.k];
    // Off-screen and far away, they do not need thinking about every frame.
    const d = Math.hypot(S.x - a.x, S.y - a.y);
    if (d > 1400) continue;
    a.t -= dt;

    if (d < flee && a.mode !== 'flee') { a.mode = 'flee'; a.t = rand(1.1, 2.3); }
    else if (d < wary && (a.mode === 'graze' || a.mode === 'walk')) { a.mode = 'alert'; a.t = rand(0.5, 1.3); }

    if (a.t <= 0) {
      if (a.mode === 'alert') { a.mode = d < wary ? 'flee' : 'graze'; a.t = rand(1, 2.4); }
      else if (a.mode === 'flee') { a.mode = 'graze'; a.t = rand(1.4, 4.5); }
      else if (a.mode === 'graze') { a.mode = 'walk'; a.t = rand(1.6, 4.6); aim(a, K); }
      else { a.mode = 'graze'; a.t = rand(2, 6); }
    }

    // Where it wants to be, and how fast.
    let want = 0;
    if (a.mode === 'flee') {
      const ang = Math.atan2(a.y - S.y, a.x - S.x);
      a.tx = clamp(S.x + Math.cos(ang) * 340, 80, VW - 80);
      a.ty = clamp(S.y + Math.sin(ang) * 340, 80, VH - 80);
      want = K.run;
    } else if (a.mode === 'walk') {
      want = K.sp;
    }
    a.sp += (want - a.sp) * Math.min(1, dt * 6);

    if (a.sp > 1) {
      const ang = Math.atan2(a.ty - a.y, a.tx - a.x);
      const nx = a.x + Math.cos(ang) * a.sp * dt;
      const ny = a.y + Math.sin(ang) * a.sp * dt;
      // THE GROUND IT IS ABOUT TO STAND ON. Checked one step ahead, so nothing
      // ever ends up in the river, up a cliff, or in the thorn.
      if (ok(nx, ny, a.k)) {
        a.x = nx; a.y = ny;
        if (Math.abs(Math.cos(ang)) > 0.12) a.dir = Math.cos(ang) < 0 ? -1 : 1;
        a.ph += a.sp * dt * 0.16;
      } else {
        aim(a, K);                       // turned back by the ground itself
        if (a.mode === 'flee') { a.mode = 'walk'; a.t = rand(0.6, 1.4); }
      }
      if (Math.hypot(a.tx - a.x, a.ty - a.y) < 8) { a.mode = 'graze'; a.t = rand(2, 6); }
    }
    // The head: down to eat, up the moment anything is near.
    const up = a.mode === 'graze' ? 0 : 1;
    a.head += (up - a.head) * Math.min(1, dt * 7);
  }

  // The flocks drift and turn. Nothing up there has to avoid anything.
  for (const f of F) {
    f.t += dt;
    f.a += Math.sin(f.t * 0.24 + f.n) * dt * 0.5;
    f.x += Math.cos(f.a) * f.sp * dt;
    f.y += Math.sin(f.a) * f.sp * dt;
    if (f.x < 200 || f.x > VW - 200) { f.a = Math.PI - f.a; f.x = clamp(f.x, 200, VW - 200); }
    if (f.y < 200 || f.y > VH - 200) { f.a = -f.a; f.y = clamp(f.y, 200, VH - 200); }
  }
}

/** Somewhere new to stand, inside its own patch and on ground it likes. */
function aim(a, K) {
  for (let tr = 0; tr < 12; tr++) {
    const ang = rand(0, TAU), r = rand(20, K.roam);
    const tx = a.hx + Math.cos(ang) * r, ty = a.hy + Math.sin(ang) * r;
    if (ok(tx, ty, a.k)) { a.tx = tx; a.ty = ty; return; }
  }
  a.tx = a.hx; a.ty = a.hy;
}

// --- drawing ------------------------------------------------------------------------
//
// Everything walking is drawn in the SAME y-sorted pass the scenery uses, so
// a deer in front of her covers her and a deer behind her does not. The caller
// hands over the band of y it wants.

export function drawFauna(ctx, time, cam, view, y0, y1) {
  for (const a of A) {
    if (!a.on) continue;
    if (a.y < y0 || a.y >= y1) continue;
    if (a.x < cam.x - 90 || a.x > cam.x + view.w + 90 || a.y < cam.y - 110 || a.y > cam.y + view.h + 90) continue;
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.scale(a.dir, 1);
    DRAW[a.k](ctx, a, time);
    ctx.restore();
  }
}

/** The birds, over the top of everything, with their shadows on the ground. */
export function drawSkyFauna(ctx, time, cam, view) {
  for (const f of F) {
    if (!f.on) continue;
    if (f.x < cam.x - 200 || f.x > cam.x + view.w + 200 || f.y < cam.y - 200 || f.y > cam.y + view.h + 200) continue;
    for (let k = 0; k < f.n; k++) {
      const o = k * 1.9 + f.n;
      const bx = f.x + Math.cos(f.a + Math.PI) * k * 15 + Math.sin(time * 0.8 + o) * 13;
      const by = f.y + Math.sin(f.a + Math.PI) * k * 9 + Math.cos(time * 0.7 + o) * 9;
      ctx.fillStyle = 'rgba(0,0,0,0.13)';
      ctx.beginPath(); ctx.ellipse(bx + 7, by + 6, 4.5, 2, 0, 0, TAU); ctx.fill();
      // Two beats of wing, and the fold at the top of the stroke.
      const w = Math.sin(time * 9 + o);
      const y = by - f.h;
      ctx.strokeStyle = '#2b2620';
      ctx.lineWidth = 1.7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bx - 6, y + w * 2.2);
      ctx.quadraticCurveTo(bx - 2.4, y - 2 - w * 1.4, bx, y);
      ctx.quadraticCurveTo(bx + 2.4, y - 2 - w * 1.4, bx + 6, y + w * 2.2);
      ctx.stroke();
    }
  }
}

// --- who they are -------------------------------------------------------------------
//
// All of them face +x and are drawn at the origin; the caller has already
// translated and flipped. Colours are the acrylic Gond pigments the rest of
// the valley is painted in.

function legs(ctx, a, n, x0, gap, len, col, w) {
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  const moving = a.sp > 3;
  for (let i = 0; i < n; i++) {
    const sw = moving ? Math.sin(a.ph * 2 + i * 2.1) * 3.4 : Math.sin(a.seed + i) * 0.3;
    ctx.beginPath();
    ctx.moveTo(x0 + i * gap, -len);
    ctx.lineTo(x0 + i * gap + sw, 0);
    ctx.stroke();
  }
}

function deer(ctx, a, time, small) {
  const s = small ? 0.62 : 1;
  const bob = a.sp > 3 ? Math.abs(Math.sin(a.ph * 2)) * 1.6 * s : Math.sin(time * 1.1 + a.seed) * 0.5;
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.beginPath(); ctx.ellipse(1, 1, 13 * s, 4.6 * s, 0, 0, TAU); ctx.fill();
  ctx.save();
  ctx.translate(0, -bob);
  legs(ctx, a, 4, -8 * s, 5.4 * s, 13 * s, '#6b4526', 2.3 * s);
  ctx.fillStyle = '#9a6231';                                // the body
  ctx.beginPath(); ctx.ellipse(0, -17 * s, 12 * s, 7 * s, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#b5763f';                                // its lit back
  ctx.beginPath(); ctx.ellipse(-1 * s, -19.5 * s, 10 * s, 3.6 * s, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#efe4d2';                                // the rump
  ctx.beginPath(); ctx.ellipse(-11 * s, -17 * s, 3 * s, 3.6 * s, 0, 0, TAU); ctx.fill();
  if (small) {                                              // a fawn is spotted
    ctx.fillStyle = 'rgba(255,243,220,0.8)';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc((-7 + i * 2.7) * s, (-19 + (i % 2) * 3.6) * s, 0.9 * s, 0, TAU);
      ctx.fill();
    }
  }
  // Neck and head. Down in the grass while it grazes, up the moment she comes.
  const up = a.head;
  const nx = 12 * s, ny = (-22 - up * 5) * s + (1 - up) * 10 * s;
  ctx.strokeStyle = '#9a6231';
  ctx.lineWidth = 4.4 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(8 * s, -20 * s);
  ctx.quadraticCurveTo(12 * s, (-24 - up * 3) * s + (1 - up) * 6 * s, nx, ny);
  ctx.stroke();
  ctx.fillStyle = '#a86c37';
  ctx.beginPath(); ctx.ellipse(nx + 1.6 * s, ny, 4.2 * s, 2.7 * s, 0.2 - up * 0.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#120c12';
  ctx.beginPath(); ctx.arc(nx + 1.4 * s, ny - 0.8 * s, 0.75 * s, 0, TAU); ctx.fill();
  ctx.fillStyle = '#7e5028';                                // an ear, swivelling
  ctx.beginPath(); ctx.ellipse(nx - 2.4 * s, ny - 2.4 * s, 2.2 * s, 1.3 * s, -0.8 + up * 0.4, 0, TAU); ctx.fill();
  if (a.buck && !small) {                                   // and the antlers
    ctx.strokeStyle = '#d9c8a4';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(nx - 1.4, ny - 2.6);
      ctx.quadraticCurveTo(nx - 1 + d * 1.6, ny - 9, nx + 1 + d * 4.4, ny - 12);
      ctx.moveTo(nx - 0.6 + d * 1.4, ny - 7.6);
      ctx.lineTo(nx - 3 + d * 2, ny - 11.6);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** The peacock, which is the one worth putting in an Indian valley at all. */
function peacock(ctx, a, time) {
  const bob = a.sp > 3 ? Math.abs(Math.sin(a.ph * 2)) * 1.3 : Math.sin(time * 1.4 + a.seed) * 0.4;
  // It fans, now and then, when nothing is frightening it.
  const fan = a.mode === 'graze' ? clamp01(Math.sin(time * 0.33 + a.seed) * 3 - 2.1) : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.beginPath(); ctx.ellipse(-2, 1, 10, 4, 0, 0, TAU); ctx.fill();
  ctx.save();
  ctx.translate(0, -bob);
  // The train: a long drag behind it, or a fan when it is showing off.
  if (fan > 0.02) {
    for (let i = -6; i <= 6; i++) {
      const ang = Math.PI * 0.5 + i * 0.13 * fan + Math.PI * 0.5;
      const r = 26 * fan;
      const ex = -6 + Math.cos(ang) * r, ey = -14 + Math.sin(ang) * r * 0.9;
      ctx.strokeStyle = '#16a89c';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-6, -12); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.fillStyle = '#2f74d8';
      ctx.beginPath(); ctx.arc(ex, ey, 2.1, 0, TAU); ctx.fill();
      ctx.fillStyle = '#f5c02a';
      ctx.beginPath(); ctx.arc(ex, ey, 0.9, 0, TAU); ctx.fill();
    }
  } else {
    ctx.strokeStyle = '#16a89c';
    ctx.lineWidth = 4.2;
    ctx.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(-6, -12);
      ctx.quadraticCurveTo(-16, -10 + i * 2, -26 + Math.sin(time * 1.6 + i) * 2, -5 + i * 3);
      ctx.stroke();
    }
    ctx.fillStyle = '#2f74d8';
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.arc(-25 + Math.sin(time * 1.6 + i) * 2, -5 + i * 3, 1.8, 0, TAU); ctx.fill();
    }
  }
  legs(ctx, a, 2, -2, 4.4, 8, '#8a7a52', 1.6);
  ctx.fillStyle = '#16355e';                                // the body
  ctx.beginPath(); ctx.ellipse(-2, -12, 8, 6, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#2f74d8';                                // the blue breast
  ctx.beginPath(); ctx.ellipse(1, -12.5, 5.4, 4.6, 0, 0, TAU); ctx.fill();
  const up = 0.5 + a.head * 0.5;
  const hy = -22 - up * 3;
  ctx.strokeStyle = '#2f74d8';                              // that neck
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(3, -15);
  ctx.quadraticCurveTo(7, -19, 6, hy);
  ctx.stroke();
  ctx.fillStyle = '#2f74d8';
  ctx.beginPath(); ctx.ellipse(6.4, hy, 2.8, 2.4, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#120c12';
  ctx.beginPath(); ctx.arc(7.4, hy - 0.4, 0.7, 0, TAU); ctx.fill();
  ctx.fillStyle = '#f5c02a';                                // the beak
  ctx.beginPath(); ctx.moveTo(9, hy); ctx.lineTo(12, hy + 0.6); ctx.lineTo(9, hy + 1.4); ctx.fill();
  ctx.strokeStyle = '#16a89c';                              // and the crest
  ctx.lineWidth = 0.9;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(6 + i * 0.9, hy - 2.2);
    ctx.lineTo(6 + i * 2.2, hy - 5.4);
    ctx.stroke();
    ctx.fillStyle = '#2f74d8';
    ctx.beginPath(); ctx.arc(6 + i * 2.2, hy - 5.6, 0.85, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function hare(ctx, a, time) {
  // A hare does not walk. It sits, and then it is somewhere else.
  const hop = a.sp > 3 ? Math.abs(Math.sin(a.ph * 3.2)) * 5 : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(0, 1, 7 - hop * 0.3, 3, 0, 0, TAU); ctx.fill();
  ctx.save();
  ctx.translate(0, -hop);
  ctx.fillStyle = '#9a8460';
  ctx.beginPath(); ctx.ellipse(-1, -6, 7, 5.2, -0.16, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fff3dc';
  ctx.beginPath(); ctx.ellipse(-7, -6.4, 2.2, 2, 0, 0, TAU); ctx.fill();
  const up = 0.35 + a.head * 0.65;
  ctx.fillStyle = '#a89070';
  ctx.beginPath(); ctx.ellipse(4.6, -9 - up * 1.6, 3.6, 3.2, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#9a8460';                                 // the ears
  for (const d of [-0.5, 0.35]) {
    ctx.save();
    ctx.translate(4.2, -11.4 - up * 1.6);
    ctx.rotate(d - up * 0.3 + Math.sin(time * 1.7 + a.seed + d) * 0.09);
    ctx.beginPath(); ctx.ellipse(0, -4, 1.4, 4.6, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = '#120c12';
  ctx.beginPath(); ctx.arc(6, -9.6 - up * 1.6, 0.8, 0, TAU); ctx.fill();
  ctx.restore();
}

function crane(ctx, a, time) {
  const stab = a.mode === 'graze' ? clamp01(Math.sin(time * 0.7 + a.seed) * 4 - 3) : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(0, 1, 9, 3.4, 0, 0, TAU); ctx.fill();
  legs(ctx, a, 2, -1, 4, 20, '#3a3128', 1.6);
  ctx.fillStyle = '#efe8dc';                                 // the body
  ctx.beginPath(); ctx.ellipse(0, -25, 9, 6, -0.1, 0, TAU); ctx.fill();
  ctx.fillStyle = '#cfc6b6';
  ctx.beginPath(); ctx.ellipse(-7, -25, 4.4, 3.4, 0.4, 0, TAU); ctx.fill();
  const hy = -38 + stab * 15;
  ctx.strokeStyle = '#efe8dc';                               // the neck
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(4, -28);
  ctx.quadraticCurveTo(9, -34 + stab * 8, 8, hy);
  ctx.stroke();
  ctx.fillStyle = '#efe8dc';
  ctx.beginPath(); ctx.ellipse(8.4, hy, 2.6, 2.1, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e04a2c';                                 // the red crown
  ctx.beginPath(); ctx.ellipse(8.4, hy - 1.8, 1.8, 1, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#120c12';
  ctx.beginPath(); ctx.arc(9.4, hy - 0.2, 0.6, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#3a3128';                               // and the bill
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(10.6, hy + 0.4); ctx.lineTo(17, hy + 2 + stab * 2); ctx.stroke();
}

const DRAW = {
  deer: (c, a, t) => deer(c, a, t, false),
  fawn: (c, a, t) => deer(c, a, t, true),
  peacock,
  hare,
  crane,
};

/** For the offline check: everything, as it stands right now. */
export const fauna = () => A;

/** One of each, drawn at the origin, for the review page. */
export const FIGURE = DRAW;
