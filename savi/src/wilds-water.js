// Live water for The Wilds: the same idea as the arenas' water engine
// (water-engine.js - the Mire's and the Drowned Vault's), made to work in a
// world far too big to simulate whole.
//
// The surface is a height field on a coarse grid, stepped with the 2D wave
// equation: every cell is pulled toward the average of its neighbours and
// overshoots, so a push becomes rings that travel, fade and reflect off the
// shore (land cells are pinned). But the grid only covers the screen and a
// margin round it, and slides along with the camera - cells scrolling in from
// the edge start calm, cells scrolling out are forgotten. Where there is no
// water in view it does nothing at all.
//
// What stirs it: you and anything else wading through the shallows, waves
// lapping in at the shore, a fish rising or a drip now and then, and a slow
// swell running across open water. It is drawn as light only - crests
// catching the sun, troughs in shadow, rings spreading - laid over the water
// the ground painter already coloured, so shallows stay clear and deep water
// stays dark underneath the movement.

import { world, camera, view } from './state.js';
import { TAU, rand } from './util.js';
import { TT } from './terrain.js';

const CELL = 12;
const PAD = 200;            // the grid reaches this far past the screen
const C2 = 0.22;            // wave speed (stable below 0.5)
const DAMP = 0.982;         // energy lost each step
// The light, as calm as the Drowned Vault's and the Mire's (journal 16.10):
// the owner found white crests read as glare - and as attacks. So the slope
// light is gentle, crests are capped glints tinted with the water's own
// colour, troughs only darken a little, and the rings are muted.
const LIGHT = 0.8;          // how strongly a slope catches the light
const GLINT_CAP = 0.7;      // the brightest a crest may get
// The water's own tint: blue-teal, or swamp green in the Mire.
const TINTS = {
  clear: { glint: [120, 176, 196], ring: '143,184,200' },
  swamp: { glint: [96, 150, 120], ring: '143,196,168' },
};

export function createWildsWater() {
  const S = {
    gx0: 0, gy0: 0, w: 0, h: 0,
    hgt: null, vel: null, wet: null,
    canvas: null, cx: null, img: null,
    ripples: [], lapT: 0, dripT: 0, stepT: 0, lastP: null,
    any: false, t: 0, tint: TINTS.clear, calm: 1,
  };

  const isWet = (t) => t === TT.WATER || t === TT.SHALLOW;

  function fill(terrain, i0, j0, i1, j1) {
    for (let j = j0; j < j1; j++) {
      for (let i = i0; i < i1; i++) {
        const k = j * S.w + i;
        S.wet[k] = isWet(terrain.typeAt((S.gx0 + i) * CELL + CELL / 2, (S.gy0 + j) * CELL + CELL / 2)) ? 1 : 0;
        S.hgt[k] = 0; S.vel[k] = 0;
      }
    }
  }

  function countWet() {
    let n = 0;
    for (let k = 0; k < S.wet.length; k++) n += S.wet[k];
    S.any = n > 0;
  }

  /** Keep the grid over the screen: allocate it, or slide it along. */
  function follow(terrain) {
    const gx0 = Math.floor((camera.x - PAD) / CELL), gy0 = Math.floor((camera.y - PAD) / CELL);
    const w = Math.ceil((view.w + PAD * 2) / CELL) + 1, h = Math.ceil((view.h + PAD * 2) / CELL) + 1;
    if (!S.hgt || w !== S.w || h !== S.h) {
      S.w = w; S.h = h; S.gx0 = gx0; S.gy0 = gy0;
      S.hgt = new Float32Array(w * h); S.vel = new Float32Array(w * h); S.wet = new Uint8Array(w * h);
      if (typeof document !== 'undefined') {
        S.canvas = document.createElement('canvas');
        S.canvas.width = w; S.canvas.height = h;
        S.cx = S.canvas.getContext('2d');
        S.img = S.cx.createImageData(w, h);
      }
      fill(terrain, 0, 0, w, h);
      countWet();
      return;
    }
    const dx = gx0 - S.gx0, dy = gy0 - S.gy0;
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
    if (Math.abs(dx) >= w || Math.abs(dy) >= h) {
      S.gx0 = gx0; S.gy0 = gy0;
      fill(terrain, 0, 0, w, h);
      countWet();
      return;
    }
    // Slide what is kept; the strips that scroll in are filled fresh.
    const H = new Float32Array(w * h), V = new Float32Array(w * h), Wt = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) {
      const sj = j + dy;
      if (sj < 0 || sj >= h) continue;
      for (let i = 0; i < w; i++) {
        const si = i + dx;
        if (si < 0 || si >= w) continue;
        const a = j * w + i, b = sj * w + si;
        H[a] = S.hgt[b]; V[a] = S.vel[b]; Wt[a] = S.wet[b];
      }
    }
    S.hgt = H; S.vel = V; S.wet = Wt;
    S.gx0 = gx0; S.gy0 = gy0;
    if (dx > 0) fill(terrain, w - dx, 0, w, h); else if (dx < 0) fill(terrain, 0, 0, -dx, h);
    if (dy > 0) fill(terrain, 0, h - dy, w, h); else if (dy < 0) fill(terrain, 0, 0, w, -dy);
    countWet();
  }

  /** Push on the surface: negative presses it down, positive throws it up. */
  function disturb(x, y, r, amt) {
    if (!S.hgt) return;
    const cx = x / CELL - S.gx0, cy = y / CELL - S.gy0;
    const cr = Math.max(1.3, r / CELL);
    const xa = Math.max(1, Math.floor(cx - cr)), xb = Math.min(S.w - 2, Math.ceil(cx + cr));
    const ya = Math.max(1, Math.floor(cy - cr)), yb = Math.min(S.h - 2, Math.ceil(cy + cr));
    for (let yy = ya; yy <= yb; yy++) {
      for (let xx = xa; xx <= xb; xx++) {
        const d = Math.hypot(xx - cx, yy - cy);
        if (d > cr) continue;
        const i = yy * S.w + xx;
        if (!S.wet[i]) continue;
        S.vel[i] += amt * (0.5 + 0.5 * Math.cos(Math.PI * d / cr));
      }
    }
  }

  function ripple(x, y, r0, r1, life, alpha) {
    // Eighteen, not forty. Over a lake this size they were stacking into a
    // moire and the surface never once held still.
    if (S.ripples.length > 18) S.ripples.shift();
    S.ripples.push({ x, y, r0, r1, t: 0, life, alpha });
  }

  const wetAt = (x, y) => {
    const i = Math.floor(x / CELL) - S.gx0, j = Math.floor(y / CELL) - S.gy0;
    return i >= 0 && j >= 0 && i < S.w && j < S.h && S.wet[j * S.w + i] === 1;
  };

  /** A random wet cell in view, optionally one that touches land (the shore). */
  function randomCell(shore) {
    for (let tries = 0; tries < 30; tries++) {
      const i = 2 + Math.floor(Math.random() * (S.w - 4)), j = 2 + Math.floor(Math.random() * (S.h - 4));
      const k = j * S.w + i;
      if (!S.wet[k]) continue;
      const edge = !S.wet[k - 1] || !S.wet[k + 1] || !S.wet[k - S.w] || !S.wet[k + S.w];
      if (shore !== edge) continue;
      return { x: (S.gx0 + i) * CELL + CELL / 2, y: (S.gy0 + j) * CELL + CELL / 2 };
    }
    return null;
  }

  function step() {
    const { w, h, hgt, vel, wet } = S;
    for (let y = 1; y < h - 1; y++) {
      let i = y * w + 1;
      for (let x = 1; x < w - 1; x++, i++) {
        if (!wet[i]) { vel[i] = 0; hgt[i] = 0; continue; }
        const lap = hgt[i - 1] + hgt[i + 1] + hgt[i - w] + hgt[i + w] - 4 * hgt[i];
        vel[i] = (vel[i] + lap * C2) * DAMP;
      }
    }
    for (let i = 0; i < hgt.length; i++) hgt[i] += vel[i];
  }

  function update(dt, terrain) {
    S.t += dt;
    follow(terrain);
    for (let i = S.ripples.length - 1; i >= 0; i--) {
      const r = S.ripples[i];
      r.t += dt;
      if (r.t >= r.life) S.ripples.splice(i, 1);
    }
    if (!S.any) return;

    // You, wading: every step presses the water; a dash or a ghost ploughs it.
    const p = world.player;
    if (p && !p.dead && wetAt(p.x, p.y + p.r * 0.5)) {
      if (S.lastP) {
        const sp = Math.hypot(p.x - S.lastP.x, p.y - S.lastP.y) / Math.max(dt, 1e-4);
        if (sp > 25) {
          disturb(p.x, p.y + p.r * 0.5, p.r, -Math.min(sp, 1400) * 0.0009);
          S.stepT -= dt;
          if (S.stepT <= 0) {
            ripple(p.x, p.y + p.r * 0.5, p.r * 0.5, p.r * 2.6, 0.8, p.dashing || p.ghost ? 0.42 : 0.28);
            // A dash used to throw a ring every three frames.
            S.stepT = p.dashing || p.ghost ? 0.14 : 0.34;
          }
        }
      }
    }
    if (p) S.lastP = { x: p.x, y: p.y };
    // Anything else in the water leaves a wake too.
    for (const e of world.enemies) {
      if (e.dead || e.spawning || (e.z || 0) > 4 || !wetAt(e.x, e.y)) continue;
      const sp = Math.hypot(e.mvx || e.vx || 0, e.mvy || e.vy || 0);
      if (sp > 20) disturb(e.x, e.y, e.r, -Math.min(sp, 900) * 0.0007);
    }

    // Waves lapping in at the shore.
    S.lapT -= dt;
    if (S.lapT <= 0) {
      S.lapT = rand(0.18, 0.4) * S.calm;
      const c = randomCell(true);
      if (c) disturb(c.x, c.y, 26, rand(0.35, 0.7));
    }
    // A fish rising, a drip - something now and then out on the open water.
    S.dripT -= dt;
    if (S.dripT <= 0) {
      S.dripT = rand(0.25, 0.9) * S.calm;
      const c = randomCell(false);
      if (c) { disturb(c.x, c.y, 14, -rand(0.6, 1.1)); ripple(c.x, c.y, 2, rand(18, 36), 1, 0.3); }
    }
    step();
  }

  function draw(ctx) {
    if (!S.any || !S.img) return;
    const { w, h, hgt, wet } = S;
    const d = S.img.data;
    const t = S.t;
    const tint = S.tint.glint;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = j * w + i, o = k * 4;
        if (!wet[k] || i === 0 || j === 0 || i === w - 1 || j === h - 1) { d[o + 3] = 0; continue; }
        // Lit by its slope from the upper left, as in the arenas' engine, with
        // a faint slow swell so open water is never glassy.
        const wx = S.gx0 + i, wy = S.gy0 + j;
        let light = (hgt[k - 1] - hgt[k + 1] + hgt[k - w] - hgt[k + w]) * LIGHT
          + Math.sin(wx * 0.55 + t * 0.9) * Math.sin(wy * 0.7 - t * 0.6) * 0.05;
        if (light > 1.3) light = 1.3; else if (light < -1.3) light = -1.3;
        if (light > 0) {
          // A capped glint in the water's own colour - never a white crest.
          const q = Math.min(light, GLINT_CAP);
          d[o] = tint[0]; d[o + 1] = tint[1]; d[o + 2] = tint[2]; d[o + 3] = q * 120;
        } else {
          // Troughs darken a little.
          d[o] = 0; d[o + 1] = 14; d[o + 2] = 22; d[o + 3] = Math.min(90, -light * 0.5 * 160);
        }
      }
    }
    S.cx.putImageData(S.img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(S.canvas, 1, 1, w - 2, h - 2, (S.gx0 + 1) * CELL, (S.gy0 + 1) * CELL, (w - 2) * CELL, (h - 2) * CELL);
    ctx.restore();

    // Rings spreading from every splash and step: crisp, but muted and at
    // 40% (the arenas' rippleAlpha).
    ctx.lineWidth = 1.4;
    for (const r of S.ripples) {
      const k = r.t / r.life;
      const rad = r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k));
      ctx.strokeStyle = `rgba(${S.tint.ring},${(r.alpha * 0.4 * (1 - k)).toFixed(3)})`;
      ctx.beginPath(); ctx.ellipse(r.x, r.y, rad, rad * 0.62, 0, 0, TAU); ctx.stroke();
    }
  }

  return {
    update, draw, disturb,
    /** 'clear' or 'swamp': the colour its glints and rings take. */
    setTint(name) { S.tint = TINTS[name] || TINTS.clear; },
    splash(x, y, r, amt) { disturb(x, y, r, amt); ripple(x, y, r * 0.4, r * 2.4, 1, 0.5); },
    /**
     * How still the water is when nothing is touching it. The lapping and the
     * drips fire on timers tuned for a pond a few hundred units across; over a
     * lake two thousand wide there is several times as much shore on screen at
     * once, so at calm 1 it never stops twitching. Higher is quieter.
     */
    setCalm(k) { S.calm = Math.max(0.2, k); },
    wetAt,
    /** For tests: how much of the grid is water. */
    stats: () => ({ w: S.w, h: S.h, any: S.any }),
  };
}
