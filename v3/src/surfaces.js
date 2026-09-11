// Ground surfaces: puddles of water, sheets of ice, burning patches, toxic
// clouds, oil slicks, electrified water, steam and mud.
//
// Surfaces are the physical half of the element system: they sit on the floor,
// affect whoever stands in them (elements.js applies that), and *change* when
// an element touches them — lightning electrifies water, frost freezes it,
// fire boils it to steam or ignites oil. This module owns the data and the
// transformations; it returns "events" for anything that needs damage, so it
// never has to import combat or elements.

import { world } from './state.js';
import { TAU, dist, rand, clamp } from './util.js';
import { burst } from './fx.js';

export const SURFACE_TYPES = {
  water:       { color: '#3f8fe0', life: 12, element: 'water', label: 'Water' },
  ice:         { color: '#c4f0ff', life: 10, element: 'frost', label: 'Ice' },
  fire:        { color: '#ff7a3d', life: 5,  element: 'fire',  label: 'Fire' },
  toxic:       { color: '#8fd13f', life: 7,  element: 'toxic', label: 'Toxic cloud', cloud: true },
  oil:         { color: '#3a2a4a', life: 18, element: null,    label: 'Oil' },
  electrified: { color: '#c58bff', life: 5,  element: 'storm', label: 'Electrified water' },
  steam:       { color: '#e8eef5', life: 4,  element: null,    label: 'Steam', cloud: true },
  mud:         { color: '#7a5a3a', life: 10, element: null,    label: 'Mud' },
};

const CAP = 24;
const MAX_R = 190;

/**
 * Place a surface. Overlapping surfaces of the same type merge (grow and
 * refresh) instead of stacking, so spamming one spell can't flood the list.
 * owner: 'player' | 'enemy' — the player's own surfaces never hurt them.
 */
export function spawnSurface(type, x, y, r, owner = 'player', life = null) {
  const def = SURFACE_TYPES[type];
  if (!def) return null;
  for (const s of world.surfaces) {
    if (s.type === type && s.owner === owner && dist(s.x, s.y, x, y) < s.r * 0.6 + r * 0.6) {
      // Merge: grow toward the new centre and refresh.
      const nr = Math.min(MAX_R, Math.max(s.r, r) + Math.min(s.r, r) * 0.25);
      s.x = (s.x * s.r + x * r) / (s.r + r);
      s.y = (s.y * s.r + y * r) / (s.r + r);
      s.r = nr;
      s.t = Math.max(s.t, life ?? def.life);
      s.maxT = Math.max(s.maxT, s.t);
      return s;
    }
  }
  const s = {
    type, x, y, r: Math.min(MAX_R, r), owner,
    t: life ?? def.life, maxT: life ?? def.life,
    seed: rand(0, 100), tickT: 0,
  };
  world.surfaces.push(s);
  if (world.surfaces.length > CAP) world.surfaces.shift();
  return s;
}

export function surfacesAt(x, y, pad = 0) {
  const out = [];
  for (const s of world.surfaces) if (dist(s.x, s.y, x, y) < s.r + pad) out.push(s);
  return out;
}

export function clearSurfaces() { world.surfaces.length = 0; }

/**
 * An element touching the floor around (x, y). Transforms surfaces and returns
 * events { name, x, y, r, owner } for elements.js to resolve (damage, fx,
 * codex). `dir` is the push direction for wind.
 */
export function elementOnArea(el, x, y, r, owner = 'player', dir = 0) {
  const events = [];
  for (let i = world.surfaces.length - 1; i >= 0; i--) {
    const s = world.surfaces[i];
    if (dist(s.x, s.y, x, y) > s.r + r) continue;
    switch (el) {
      case 'storm':
        if (s.type === 'water') { turn(s, 'electrified', 6); events.push(ev('electrify', s)); }
        break;
      case 'frost':
        if (s.type === 'water' || s.type === 'electrified') { turn(s, 'ice', 10); events.push(ev('freezeWater', s)); }
        else if (s.type === 'fire') { turn(s, 'steam', 3); events.push(ev('quench', s)); }
        break;
      case 'fire':
        if (s.type === 'water' || s.type === 'electrified') { turn(s, 'steam', 4); events.push(ev('boil', s)); }
        else if (s.type === 'oil') { turn(s, 'fire', 7); s.r = Math.min(MAX_R, s.r * 1.3); events.push(ev('inferno', s)); }
        else if (s.type === 'toxic') { world.surfaces.splice(i, 1); events.push(ev('gasBlast', s)); }
        else if (s.type === 'ice') { turn(s, 'water', 8); events.push(ev('thawIce', s)); }
        break;
      case 'water':
        if (s.type === 'fire') { turn(s, 'steam', 3); events.push(ev('quench', s)); }
        else if (s.type === 'toxic') { world.surfaces.splice(i, 1); events.push(ev('dilute', s)); }
        break;
      case 'wind':
        if (s.type === 'toxic' || s.type === 'steam') { world.surfaces.splice(i, 1); events.push(ev('disperse', s)); }
        else if (s.type === 'fire') {
          // Fire is blown downwind: a line of new patches.
          for (let k = 1; k <= 3; k++) {
            spawnSurface('fire', s.x + Math.cos(dir) * s.r * 0.9 * k, s.y + Math.sin(dir) * s.r * 0.9 * k,
              s.r * 0.7, s.owner, 4);
          }
          events.push(ev('firestormArea', s));
        }
        break;
      case 'earth':
        if (s.type === 'water') { turn(s, 'mud', 10); events.push(ev('bogArea', s)); }
        else if (s.type === 'electrified') { turn(s, 'water', 6); events.push(ev('groundArea', s)); }
        break;
      default: break;
    }
  }
  return events;
}

function turn(s, type, life) {
  s.type = type;
  s.t = life;
  s.maxT = life;
}

function ev(name, s) { return { name, x: s.x, y: s.y, r: s.r, owner: s.owner }; }

export function updateSurfaces(dt) {
  for (let i = world.surfaces.length - 1; i >= 0; i--) {
    const s = world.surfaces[i];
    s.t -= dt;
    if (s.t <= 0) {
      // Electrified water settles back into plain water.
      if (s.type === 'electrified') { turn(s, 'water', 6); continue; }
      world.surfaces.splice(i, 1);
      continue;
    }
    // Cheap life: embers off fire, sparks off electrified water, bubbles off toxic.
    const rate = s.type === 'fire' ? 10 : s.type === 'electrified' ? 8 : s.type === 'toxic' ? 4 : 0;
    if (rate && Math.random() < dt * rate * (s.r / 80)) {
      const a = rand(0, TAU), d = Math.sqrt(Math.random()) * s.r;
      const px = s.x + Math.cos(a) * d, py = s.y + Math.sin(a) * d;
      if (s.type === 'fire') burst(px, py, { count: 1, color: Math.random() < 0.5 ? '#ffb35e' : '#ff5e3d', speed: 40, size: 3.5, life: 0.5, dir: -Math.PI / 2, spread: 0.8, gravity: -80, drag: 1 });
      else if (s.type === 'electrified') burst(px, py, { count: 2, color: '#e9d8ff', speed: 160, size: 2, life: 0.12, drag: 6, shape: 'spark' });
      else burst(px, py, { count: 1, color: '#b6ef6a', speed: 16, size: 4, life: 0.8, gravity: -20, drag: 1 });
    }
  }
}

// --- drawing -------------------------------------------------------------------

/** Floor surfaces (under everything but the floor itself). */
export function drawSurfaces(ctx, time) {
  for (const s of world.surfaces) {
    const def = SURFACE_TYPES[s.type];
    if (def.cloud) continue;
    const fade = clamp(s.t / 0.6, 0, 1) * clamp((s.maxT - s.t) / 0.25 + 0.3, 0, 1);
    ctx.save();
    ctx.globalAlpha = fade;
    blob(ctx, s, time, 0);
    switch (s.type) {
      case 'water':
      case 'electrified': {
        ctx.fillStyle = s.type === 'water' ? 'rgba(63,143,224,0.34)' : 'rgba(120,110,230,0.36)';
        ctx.fill();
        ctx.strokeStyle = s.type === 'water' ? 'rgba(160,210,255,0.55)' : 'rgba(233,216,255,0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
        // A ripple ring drifting outward.
        const ph = (time * 0.6 + s.seed) % 1;
        ctx.globalAlpha = fade * (1 - ph) * 0.5;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * (0.3 + ph * 0.6), 0, TAU);
        ctx.stroke();
        if (s.type === 'electrified') drawArcs(ctx, s, time, fade);
        break;
      }
      case 'ice': {
        ctx.fillStyle = 'rgba(196,240,255,0.32)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Frost cracks.
        ctx.globalAlpha = fade * 0.55;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let k = 0; k < 5; k++) {
          const a = s.seed + k * 1.3;
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x + Math.cos(a) * s.r * 0.8, s.y + Math.sin(a) * s.r * 0.8);
        }
        ctx.stroke();
        break;
      }
      case 'fire': {
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
        g.addColorStop(0, 'rgba(255,220,120,0.55)');
        g.addColorStop(0.6, 'rgba(255,110,50,0.38)');
        g.addColorStop(1, 'rgba(255,60,30,0)');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.globalAlpha = fade * (0.5 + Math.sin(time * 14 + s.seed) * 0.2);
        ctx.strokeStyle = '#ff9a4d';
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
      }
      case 'oil': {
        ctx.fillStyle = 'rgba(30,20,42,0.62)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(160,120,220,0.35)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // A glossy highlight.
        ctx.globalAlpha = fade * 0.25;
        ctx.fillStyle = '#b89cff';
        ctx.beginPath();
        ctx.ellipse(s.x - s.r * 0.25, s.y - s.r * 0.2, s.r * 0.3, s.r * 0.12, -0.4, 0, TAU);
        ctx.fill();
        break;
      }
      case 'mud': {
        ctx.fillStyle = 'rgba(122,90,58,0.55)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(60,40,25,0.7)';
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
      }
      default: break;
    }
    ctx.restore();
  }
}

/** Clouds (toxic, steam) drift over everything, drawn above entities. */
export function drawClouds(ctx, time) {
  for (const s of world.surfaces) {
    const def = SURFACE_TYPES[s.type];
    if (!def.cloud) continue;
    const fade = clamp(s.t / 0.8, 0, 1);
    const base = s.type === 'toxic' ? [143, 209, 63] : [232, 238, 245];
    for (let k = 0; k < 5; k++) {
      const a = s.seed + k * 1.25 + time * 0.25 * (k % 2 ? 1 : -1);
      const d = s.r * 0.38;
      const cx = s.x + Math.cos(a) * d, cy = s.y + Math.sin(a) * d;
      ctx.globalAlpha = fade * (s.type === 'toxic' ? 0.2 : 0.26);
      ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
      ctx.beginPath();
      ctx.arc(cx, cy, s.r * 0.62, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = fade * 0.5;
    ctx.strokeStyle = s.type === 'toxic' ? '#b6ef6a' : '#ffffff';
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = 1;
}

/** A slightly lumpy circle, so puddles don't look like decals. */
function blob(ctx, s, time, wobble) {
  ctx.beginPath();
  const n = 14;
  for (let k = 0; k <= n; k++) {
    const a = (k / n) * TAU;
    const rr = s.r * (0.9 + 0.1 * Math.sin(a * 3 + s.seed) + wobble * Math.sin(time * 3 + a));
    const px = s.x + Math.cos(a) * rr, py = s.y + Math.sin(a) * rr * 0.92;
    if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawArcs(ctx, s, time, fade) {
  ctx.globalAlpha = fade * 0.9;
  ctx.strokeStyle = '#f2e6ff';
  ctx.lineWidth = 1.6;
  const seed = Math.floor(time * 18);
  for (let k = 0; k < 3; k++) {
    let a = ((seed * 7 + k * 13) % 17) / 17 * TAU;
    let px = s.x + Math.cos(a) * s.r * 0.2, py = s.y + Math.sin(a) * s.r * 0.2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    for (let j = 0; j < 4; j++) {
      a += ((seed + j * 5 + k) % 5 - 2) * 0.4;
      px += Math.cos(a) * s.r * 0.2;
      py += Math.sin(a) * s.r * 0.2;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
}
