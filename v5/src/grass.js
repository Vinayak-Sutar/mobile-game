// A live grass field for The Wilds, built the way the water is: many small
// things that each obey one simple rule, so the whole reads as alive.
//
// Every tuft is a little damped spring. Wind leans it: gusts are waves that
// roll across the region, and a tuft under a gust leans further and turns
// to its lighter shade, so bands of light sweep over a field (the look Ghost
// of Tsushima made famous). Anything moving through - you, the enemies, a
// dash - pushes the blades flat away from it and they spring back after.
// Your blows cut tall grass down to stubble; clippings fly, it grows back
// in half a minute, and now and then something was hiding in it.
//
// Only tufts near the camera are simulated or drawn. A tuft at rest - only
// the wind on it - is drawn as a small ready-made picture from an ATLAS (one
// per shade, blade pattern and lean, made once), because copying thousands
// of little pictures a frame is cheap for any browser, where stroking
// thousands of curved blades is not: that cost grows with the screen's
// pixels and was what dragged a big PC screen down to under 20 frames a
// second in the grass. Only tufts being pushed aside or growing back after a
// cut - a handful at a time - are stroked blade by blade.
//
// A field covers one rectangle (opts.x0, opts.y0, W, H). The big Wilds grow
// one per sector as you approach and let it go when you leave.

import { world } from './state.js';
import { TT } from './terrain.js';
import { rand, clamp, angleDiff, circleOrientedRect, dist } from './util.js';
import { burst } from './fx.js';
import { spawnPickup } from './spawn.js';

const BUCKET = 128;
const K = 46, DAMP = 7;              // the spring: stiffness, damping
const SHADES_TALL = ['#3d5731', '#4c6a39', '#628243', '#83a056'];
const SHADES_SHORT = ['#4a6536', '#56733e', '#6c8a48', '#8aa65a'];
const LEAN = [-0.4, 0.05, 0.42];
const OFF = [-3.2, 0.4, 3.4];
const REST_BY = -0.04;               // where the spring holds a tuft upright

// --- the atlas of tufts at rest ---------------------------------------------------------
// One picture for every (tall or short) x shade (4) x blade pattern (3) x
// lean in the wind (NB steps of BSTEP from BX0), drawn at a reference height
// and scaled to each tuft's own. It is drawn at the screen's own resolution
// and made again if that changes.
const BX0 = 0.02, BSTEP = 0.04, NB = 15;
const KINDS = [
  // tall: reference height, the cell round the root (world units), blade width
  { ref: 22, x0: -10, y0: -26, w: 34, h: 30, width: 2.1, shades: SHADES_TALL, off: 1 },
  { ref: 9, x0: -5, y0: -12, w: 16, h: 15, width: 1.5, shades: SHADES_SHORT, off: 0.7 },
];
let atlas = null;                    // { canvas, scale, kinds: [{ oy, cw, ch }] }

/** The blades of one tuft, from its root at (x, y), into path p. */
function tuftPath(p, x, y, hh, bx, by, pattern, off) {
  const flat = Math.min(1, Math.abs(bx) + Math.abs(by) * 0.5);
  for (let j = 0; j < (off === 1 ? 3 : 2); j++) {
    const lean = LEAN[(j + pattern) % 3];
    const ox = x + OFF[j] * off;
    const tx = ox + lean * hh * 0.45 + bx * hh;
    const ty = y - hh * (1 - flat * 0.45) + by * hh * 0.55;
    p.moveTo(ox, y);
    p.quadraticCurveTo(ox + (tx - ox) * 0.2, y - hh * 0.55, tx, ty);
  }
}

function buildAtlas(scale) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  const kinds = [];
  let oy = 0, width = 0;
  for (const K of KINDS) {
    const cw = Math.ceil(K.w * scale), ch = Math.ceil(K.h * scale);
    kinds.push({ oy, cw, ch });
    oy += ch * 12;
    width = Math.max(width, cw * NB);
  }
  canvas.width = width; canvas.height = oy;
  const g = canvas.getContext('2d');
  g.lineCap = 'round';
  KINDS.forEach((K, t) => {
    const { oy: top, cw, ch } = kinds[t];
    g.lineWidth = K.width;
    for (let s = 0; s < 4; s++) {
      g.strokeStyle = K.shades[s];
      for (let pat = 0; pat < 3; pat++) {
        for (let b = 0; b < NB; b++) {
          g.setTransform(scale, 0, 0, scale, b * cw - K.x0 * scale, top + (s * 3 + pat) * ch - K.y0 * scale);
          g.beginPath();
          tuftPath(g, 0, 0, K.ref, BX0 + b * BSTEP, REST_BY, pat, K.off);
          g.stroke();
        }
      }
    }
  });
  return { canvas, scale, kinds };
}

export function createGrass(terrain, opts) {
  const { W, H } = opts;
  const OX = opts.x0 || 0, OY = opts.y0 || 0;      // where this field starts
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const xs = [], ys = [], hs = [], hues = [], tall = [];

  // Sow: dense tall grass, a lighter scatter of short grass.
  const sow = (step, want, isTall, hMin, hMax) => {
    for (let gy = OY; gy < OY + H; gy += step) {
      for (let gx = OX; gx < OX + W; gx += step) {
        const x = gx + rand(0, step), y = gy + rand(0, step);
        if (terrain.typeAt(x, y) !== want) continue;
        if (terrain.roadAt(x, y) < 32) continue;
        if (opts.blocked(x, y)) continue;
        xs.push(x); ys.push(y); hs.push(rand(hMin, hMax));
        hues.push((Math.random() * 3) | 0); tall.push(isTall ? 1 : 0);
      }
    }
  };
  sow(coarse ? 21 : 17, TT.TALL, true, 17, 27);
  sow(coarse ? 44 : 34, TT.GRASS, false, 7, 11);

  const n = xs.length;
  // Sort into buckets so a patch of the world is a contiguous run of tufts.
  const nbx = Math.ceil(W / BUCKET), nby = Math.ceil(H / BUCKET);
  const order = [...Array(n).keys()].sort((a, b) => {
    const ka = Math.floor((ys[a] - OY) / BUCKET) * nbx + Math.floor((xs[a] - OX) / BUCKET);
    const kb = Math.floor((ys[b] - OY) / BUCKET) * nbx + Math.floor((xs[b] - OX) / BUCKET);
    return ka - kb || ys[a] - ys[b];
  });
  const X = new Float32Array(n), Y = new Float32Array(n), Hh = new Float32Array(n);
  const HUE = new Uint8Array(n), TALL = new Uint8Array(n);
  const BX = new Float32Array(n), BY = new Float32Array(n), VX = new Float32Array(n), VY = new Float32Array(n);
  const GUST = new Float32Array(n);
  const CUT = new Float32Array(n).fill(-1e9);
  const start = new Int32Array(nbx * nby + 1);
  order.forEach((src, i) => {
    X[i] = xs[src]; Y[i] = ys[src]; Hh[i] = hs[src]; HUE[i] = hues[src]; TALL[i] = tall[src];
    start[clamp(Math.floor((Y[i] - OY) / BUCKET), 0, nby - 1) * nbx + clamp(Math.floor((X[i] - OX) / BUCKET), 0, nbx - 1) + 1]++;
  });
  for (let k = 1; k < start.length; k++) start[k] += start[k - 1];

  const range = (x0, y0, x1, y1) => ({
    i0: clamp(Math.floor((x0 - OX) / BUCKET), 0, nbx - 1), i1: clamp(Math.floor((x1 - OX) / BUCKET), 0, nbx - 1),
    j0: clamp(Math.floor((y0 - OY) / BUCKET), 0, nby - 1), j1: clamp(Math.floor((y1 - OY) / BUCKET), 0, nby - 1),
  });
  function each(x0, y0, x1, y1, fn) {
    if (x1 < OX || y1 < OY || x0 > OX + W || y0 > OY + H) return;
    const r = range(x0, y0, x1, y1);
    for (let j = r.j0; j <= r.j1; j++) {
      for (let i = r.i0; i <= r.i1; i++) {
        const b = j * nbx + i;
        for (let k = start[b]; k < start[b + 1]; k++) fn(k);
      }
    }
  }

  /** How far a gust leans the grass here, 0..1. */
  const gustAt = (x, y, t) => clamp(
    0.5 + Math.sin(x * 0.0045 + y * 0.0022 - t * 1.25) * 0.36 + Math.sin(x * 0.012 - y * 0.006 - t * 2.3) * 0.16, 0, 1);

  const heightOf = (k, t) => {
    const since = t - CUT[k];
    if (since > 30) return Hh[k];
    return 3.5 + (Hh[k] - 3.5) * clamp((since - 8) / 22, 0, 1);
  };

  /**
   * movers: [{ x, y, r, push }]; cutters: the friendly hitboxes this frame.
   * view: { x, y, w, h } in world units.
   */
  function update(dt, t, view, movers, cutters) {
    const pad = 40;
    each(view.x - pad, view.y - pad, view.x + view.w + pad, view.y + view.h + pad, (k) => {
      const g = gustAt(X[k], Y[k], t);
      GUST[k] = g;
      const tx = 0.12 + g * 0.42, ty = -0.04;
      VX[k] += (-(BX[k] - tx) * K - VX[k] * DAMP) * dt;
      VY[k] += (-(BY[k] - ty) * K - VY[k] * DAMP) * dt;
      BX[k] += VX[k] * dt;
      BY[k] += VY[k] * dt;
    });

    // Pressed flat by whatever walks through.
    for (const m of movers) {
      const R = m.r + 16;
      each(m.x - R, m.y - R, m.x + R, m.y + R, (k) => {
        const dx = X[k] - m.x, dy = Y[k] - m.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > R * R) return;
        const d = Math.sqrt(d2) || 1;
        const f = (1 - d / R) * m.push;
        const blend = Math.min(1, dt * 20);
        BX[k] += ((dx / d) * 1.15 * f - BX[k]) * blend * f;
        BY[k] += ((dy / d) * 1.15 * f - BY[k]) * blend * f;
        if (m.rustle && TALL[k] && Math.random() < dt * 1.2 * f) {
          burst(X[k], Y[k] - 10, { count: 1, color: '#6c8a48', speed: 60, size: 2, life: 0.4, drag: 3, gravity: 60, shape: 'shard' });
        }
      });
    }

    // Cut by your blows: tall grass only.
    for (const h of cutters) {
      const reach = (h.radius || 0) + (h.len || 0) + 10;
      let shown = 0;
      each(h.x - reach, h.y - reach, h.x + reach, h.y + reach, (k) => {
        if (!TALL[k] || t - CUT[k] < 30) return;
        let hit;
        if (h.shape === 'arc') {
          hit = dist(h.x, h.y, X[k], Y[k]) < h.radius + 4
            && Math.abs(angleDiff(h.angle, Math.atan2(Y[k] - h.y, X[k] - h.x))) < h.arc / 2 + 0.15;
        } else if (h.shape === 'rect') {
          hit = circleOrientedRect(X[k], Y[k], 4, h.x, h.y, h.angle, h.len, h.wid);
        } else hit = dist(h.x, h.y, X[k], Y[k]) < (h.radius || 30) + 4;
        if (!hit) return;
        CUT[k] = t;
        if (shown++ < 5) {
          burst(X[k], Y[k] - 8, { count: 3, color: SHADES_TALL[1 + (k % 3)], speed: 150, size: 2.5, life: 0.5, drag: 3, gravity: 120, shape: 'shard' });
        }
        // Something was hiding in it.
        const roll = Math.random();
        if (roll < 0.025) spawnPickup({ x: X[k], y: Y[k], type: 'gold', value: 3 });
        else if (roll < 0.035) spawnPickup({ x: X[k], y: Y[k], type: 'heal', value: 6 });
      });
    }
  }

  // --- drawing ------------------------------------------------------------------------
  const shadeOf = (k) => clamp(Math.round(HUE[k] * 0.5 + GUST[k] * 2.3 - 0.4), 0, 3);

  function blades(k, t, pt, ps) {
    const idx = shadeOf(k);
    tuftPath(TALL[k] ? pt[idx] : ps[idx], X[k], Y[k], heightOf(k, t), BX[k], BY[k], HUE[k], TALL[k] ? 1 : 0.7);
  }

  function strokeAll(ctx, pt, ps) {
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) { ctx.strokeStyle = SHADES_SHORT[i]; ctx.stroke(ps[i]); }
    ctx.lineWidth = 2.1;
    for (let i = 0; i < 4; i++) { ctx.strokeStyle = SHADES_TALL[i]; ctx.stroke(pt[i]); }
  }

  /**
   * Every tuft in view (under the characters): the ones at rest from the
   * atlas, the few being pushed or growing back stroked blade by blade.
   */
  function draw(ctx, t, view) {
    const pt = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    const ps = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    // The atlas is drawn at the screen's resolution (device pixels per world unit).
    const m = ctx.getTransform ? ctx.getTransform() : null;
    const want = m ? Math.min(3, Math.max(1, Math.round(Math.hypot(m.a, m.b) * 4) / 4)) : 0;
    if (want && (!atlas || atlas.scale !== want)) atlas = buildAtlas(want);
    const A = atlas;
    let stroked = 0;
    each(view.x - 30, view.y - 10, view.x + view.w + 30, view.y + view.h + 40, (k) => {
      const hh = heightOf(k, t);
      const b = Math.round((BX[k] - BX0) / BSTEP);
      if (!A || hh !== Hh[k] || b < -1 || b > NB || Math.abs(BY[k] - REST_BY) > 0.06) {
        blades(k, t, pt, ps);
        stroked++;
        return;
      }
      const T = TALL[k] ? 0 : 1, K = KINDS[T], C = A.kinds[T];
      const s = hh / K.ref;
      const sx = clamp(b, 0, NB - 1) * C.cw, sy = C.oy + (shadeOf(k) * 3 + HUE[k]) * C.ch;
      ctx.drawImage(A.canvas, sx, sy, C.cw, C.ch, X[k] + K.x0 * s, Y[k] + K.y0 * s, K.w * s, K.h * s);
    });
    if (stroked) strokeAll(ctx, pt, ps);
  }

  /** Tall blades just in front of someone, drawn again over them: waist-deep. */
  function drawFront(ctx, t, e) {
    const pt = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    const ps = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    let any = false;
    each(e.x - 30, e.y - 4, e.x + 30, e.y + 26, (k) => {
      if (!TALL[k] || Y[k] < e.y + 2 || Y[k] > e.y + e.r + 12 || Math.abs(X[k] - e.x) > e.r + 10) return;
      if (heightOf(k, t) < 8) return;
      blades(k, t, pt, ps);
      any = true;
    });
    if (any) strokeAll(ctx, pt, ps);
  }

  /** Is this spot in standing tall grass? */
  function inTall(x, y, t) {
    let found = false;
    each(x - 12, y - 12, x + 12, y + 12, (k) => {
      if (!found && TALL[k] && heightOf(k, t) > 8 && Math.abs(X[k] - x) < 12 && Math.abs(Y[k] - y) < 12) found = true;
    });
    return found;
  }

  return { update, draw, drawFront, inTall, count: n };
}

export function grassMovers() {
  const out = [];
  const p = world.player;
  if (p && !p.dead) out.push({ x: p.x, y: p.y + p.r * 0.5, r: p.r, push: p.dashing ? 1.4 : 1, rustle: true });
  for (const e of world.enemies) {
    if (e.dead || e.z) continue;
    out.push({ x: e.x, y: e.y + e.r * 0.4, r: e.r, push: 0.9, rustle: false });
  }
  return out;
}
