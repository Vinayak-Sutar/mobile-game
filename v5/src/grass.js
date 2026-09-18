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
// Only tufts near the camera are simulated or drawn; the blades of a frame
// go into a few batched paths (one per shade), so it is cheap to stroke.

import { world } from './state.js';
import { TT } from './terrain.js';
import { rand, clamp, angleDiff, circleOrientedRect, dist } from './util.js';
import { burst } from './fx.js';
import { spawnPickup } from './spawn.js';

const BUCKET = 128;
const K = 46, DAMP = 7;              // the spring: stiffness, damping
const SHADES_TALL = ['#3d5731', '#4c6a39', '#628243', '#83a056'];
const SHADES_SHORT = ['#4a6536', '#56733e', '#6c8a48', '#8aa65a'];

export function createGrass(terrain, opts) {
  const { W, H } = opts;
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const xs = [], ys = [], hs = [], hues = [], tall = [];

  // Sow: dense tall grass, a lighter scatter of short grass.
  const sow = (step, want, isTall, hMin, hMax) => {
    for (let gy = 0; gy < H; gy += step) {
      for (let gx = 0; gx < W; gx += step) {
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
    const ka = Math.floor(ys[a] / BUCKET) * nbx + Math.floor(xs[a] / BUCKET);
    const kb = Math.floor(ys[b] / BUCKET) * nbx + Math.floor(xs[b] / BUCKET);
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
    start[Math.floor(Y[i] / BUCKET) * nbx + Math.floor(X[i] / BUCKET) + 1]++;
  });
  for (let k = 1; k < start.length; k++) start[k] += start[k - 1];

  const range = (x0, y0, x1, y1) => ({
    i0: clamp(Math.floor(x0 / BUCKET), 0, nbx - 1), i1: clamp(Math.floor(x1 / BUCKET), 0, nbx - 1),
    j0: clamp(Math.floor(y0 / BUCKET), 0, nby - 1), j1: clamp(Math.floor(y1 / BUCKET), 0, nby - 1),
  });
  function each(x0, y0, x1, y1, fn) {
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
  const LEAN = [-0.4, 0.05, 0.42];
  const OFF = [-3.2, 0.4, 3.4];

  function blades(k, t, pt, ps) {
    const hh = heightOf(k, t);
    const idx = clamp(Math.round(HUE[k] * 0.5 + GUST[k] * 2.3 - 0.4), 0, 3);
    const p = TALL[k] ? pt[idx] : ps[idx];
    const x = X[k], y = Y[k], bx = BX[k], by = BY[k];
    const nb = TALL[k] ? 3 : 2;
    const flat = Math.min(1, Math.abs(bx) + Math.abs(by) * 0.5);
    for (let j = 0; j < nb; j++) {
      const lean = LEAN[(j + HUE[k]) % 3];
      const ox = x + OFF[j] * (TALL[k] ? 1 : 0.7);
      const tx = ox + lean * hh * 0.45 + bx * hh;
      const ty = y - hh * (1 - flat * 0.45) + by * hh * 0.55;
      p.moveTo(ox, y);
      p.quadraticCurveTo(ox + (tx - ox) * 0.2, y - hh * 0.55, tx, ty);
    }
  }

  function strokeAll(ctx, pt, ps) {
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) { ctx.strokeStyle = SHADES_SHORT[i]; ctx.stroke(ps[i]); }
    ctx.lineWidth = 2.1;
    for (let i = 0; i < 4; i++) { ctx.strokeStyle = SHADES_TALL[i]; ctx.stroke(pt[i]); }
  }

  /** Every tuft in view (under the characters). */
  function draw(ctx, t, view) {
    const pt = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    const ps = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    each(view.x - 30, view.y - 10, view.x + view.w + 30, view.y + view.h + 40, (k) => blades(k, t, pt, ps));
    strokeAll(ctx, pt, ps);
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
