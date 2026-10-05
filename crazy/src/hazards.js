// Ground hazards: telegraphed attacks that aren't projectiles.
//
//   blast      a marked circle that detonates after `delay`
//   lob        a shell arcing to a marked landing spot, then a blast (+ shards)
//   shockring  an expanding ring with gaps; walk through a gap or dash through
//   beam       a warning line, then a damaging (optionally sweeping) beam
//   cone       a telegraph-only wedge; the owner applies the hit itself
//   charge     a lobbed bomb that lands, fizzes on a fuse, then blows; a hit
//              kicks it away, and a kicked charge blows up on enemies instead
//
// Everything here is drawn *before* it can hurt, and all damage goes through
// damagePlayer (rule 1), so dash i-frames and hit invulnerability apply.

import { world } from './state.js';
import { TAU, clamp, dist, angleTo, angleDiff } from './util.js';
import { damagePlayer, explode, nearestEnemy } from './combat.js';
import { spawnProjectile } from './spawn.js';
import { burst, ring, shake } from './fx.js';
import { sfx } from './audio.js';

// The player's hurtbox against hazards is smaller than their body: getting
// clipped by the very edge of a marker reads as unfair.
const HURT = 0.6;

export function spawnHazard(o) {
  const h = {
    kind: 'blast',
    x: 0, y: 0,
    r: 60,
    delay: 0.8,
    t: 0,
    damage: 10,
    color: '#ff9a4d',
    source: 'unknown',
    owner: null,
    follow: null,
    dead: false,
    ...o,
  };
  if (h.kind === 'lob') {
    h.x = h.x1; h.y = h.y1;
    h.delay = h.flight;
  }
  if (h.kind === 'charge') {
    h.x = h.x1; h.y = h.y1;
    h.delay = h.flight + h.fuse;    // the floor marker fills until it blows
  }
  if (h.kind === 'shockring') {
    h.radius = h.r0 || 0;
    h.hit = false;
  }
  if (h.kind === 'beam') {
    h.total = h.warn + h.active;
  }
  world.hazards.push(h);
  return h;
}

/** Remove every hazard an owner created (used on phase change and death). */
export function clearHazards(owner = null) {
  for (const h of world.hazards) {
    if (!owner || h.owner === owner) h.dead = true;
  }
}

function hitPlayer(h, amount, sx, sy) {
  const p = world.player;
  if (!p || p.dead || amount <= 0) return false;
  return damagePlayer(amount, sx, sy, h.source);
}

export function updateHazards(dt) {
  const p = world.player;
  for (let i = world.hazards.length - 1; i >= 0; i--) {
    const h = world.hazards[i];
    if (h.dead || (h.owner && h.owner.dead && h.kind !== 'lob' && h.kind !== 'charge')) {
      world.hazards.splice(i, 1);
      continue;
    }
    h.t += dt;
    if (h.follow) { h.x = h.follow.x; h.y = h.follow.y; }

    switch (h.kind) {
      case 'blast':
      case 'lob': {
        if (h.t >= h.delay) {
          detonate(h, p);
          world.hazards.splice(i, 1);
        }
        break;
      }
      case 'charge': {
        // Landing: a bounce of dust, then the fuse fizzes where it sits.
        if (!h.landed && h.t >= h.flight) {
          h.landed = true;
          burst(h.x, h.y, { count: 6, color: '#b8a58a', speed: 90, size: 3, life: 0.3, drag: 5 });
          sfx.thud();
        }
        if (h.landed && Math.random() < dt * 30) {
          burst(h.x + 4, h.y - 12, { count: 1, color: '#ffd45e', speed: 60, size: 2.4, life: 0.25, gravity: -60, drag: 2, shape: 'spark' });
        }
        if (h.t >= h.delay) {
          if (h.friendly) {
            explode(h.x, h.y, h.r, h.kickDamage, null, '#ffd45e', false, 'charge');
          } else {
            detonate(h, p);
          }
          world.hazards.splice(i, 1);
        }
        break;
      }
      case 'cone':
      case 'lane': {
        if (h.track) h.track(h);
        if (h.t >= h.delay) world.hazards.splice(i, 1);
        break;
      }
      case 'shockring': {
        if (h.t < (h.wait || 0)) break;   // a queued second ring
        h.radius += h.speed * dt;
        if (!h.hit && p && !p.dead) {
          const d = dist(h.x, h.y, p.x, p.y);
          const band = h.width / 2 + p.r * HURT;
          if (Math.abs(d - h.radius) < band && !inGap(h, angleTo(h.x, h.y, p.x, p.y))) {
            if (hitPlayer(h, h.damage, h.x, h.y)) h.hit = true;
          }
        }
        if (h.radius > h.maxR) world.hazards.splice(i, 1);
        break;
      }
      case 'beam': {
        const live = h.t >= h.warn;
        if (live && !h.fired) {
          h.fired = true;
          sfx.beam();
          shake(0.25);
        }
        if (live) {
          h.angle += (h.spin || 0) * dt;
          if (p && !p.dead && pointNearBeam(h, p.x, p.y, h.width / 2 + p.r * HURT)) {
            hitPlayer(h, h.damage, p.x - Math.cos(h.angle) * 10, p.y - Math.sin(h.angle) * 10);
          }
          if (Math.random() < dt * 40) {
            const k = Math.random();
            burst(h.x + Math.cos(h.angle) * h.len * k, h.y + Math.sin(h.angle) * h.len * k, {
              count: 1, color: h.color, speed: 80, size: 3, life: 0.25, drag: 4, shape: 'spark',
            });
          }
        } else if (h.track) {
          // Warning lines may drift with their owner's aim until they lock.
          h.track(h);
        }
        if (h.t >= h.total) world.hazards.splice(i, 1);
        break;
      }
    }
  }
}

// Standing with your centre inside a gap is safe, even if your shoulder
// overlaps the drawn ring. Gaps are authored wide (0.6+ rad), so at any
// reachable distance the whole body fits through what's drawn.
function inGap(h, a) {
  if (!h.gaps) return false;
  for (const g of h.gaps) {
    if (Math.abs(angleDiff(g.a, a)) < g.w / 2) return true;
  }
  return false;
}

function pointNearBeam(h, px, py, pad) {
  const c = Math.cos(h.angle), s = Math.sin(h.angle);
  const dx = px - h.x, dy = py - h.y;
  const along = dx * c + dy * s;
  if (along < 0 || along > h.len) return false;
  const across = Math.abs(-dx * s + dy * c);
  return across < pad;
}

function detonate(h, p) {
  ring(h.x, h.y, { r0: 6, r1: h.r, color: h.color, life: 0.3, width: 6 });
  burst(h.x, h.y, { count: 14, color: h.color, speed: 300, size: 4.5, life: 0.4, drag: 4, shape: 'shard' });
  if (h.r > 90) shake(0.35); else shake(0.14);
  if (h.quiet) sfx.thud(); else sfx.explode();
  if (p && !p.dead && dist(h.x, h.y, p.x, p.y) < h.r + p.r * HURT) hitPlayer(h, h.damage, h.x, h.y);

  if (h.shards) {
    const { n, speed, color, r = 7, offset = Math.random() * TAU } = h.shards;
    for (let k = 0; k < n; k++) {
      const a = offset + (k / n) * TAU;
      spawnProjectile({
        x: h.x + Math.cos(a) * 8, y: h.y + Math.sin(a) * 8,
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        r, damage: h.shardDamage ?? h.damage * 0.5, color: color || h.color,
        shape: h.shardShape || 'rock', life: 3, srcType: h.source, quiet: true, trailEvery: 999,
      });
    }
  }
  if (h.onDetonate) h.onDetonate(h);
}

/** Where a charge is on the floor right now (in flight: under its shell). */
function chargePos(h) {
  if (h.t >= h.flight) return { x: h.x1, y: h.y1 };
  const k = clamp(h.t / h.flight, 0, 1);
  return { x: h.x0 + (h.x1 - h.x0) * k, y: h.y0 + (h.y1 - h.y0) * k };
}

/**
 * Strike every hostile charge `hits` accepts: each one is kicked, flying off
 * to the nearest foe along the strike (or straight on) and blowing up there,
 * on enemies and not on the player. Returns how many were kicked.
 */
export function strikeCharges(hits, angle) {
  let n = 0;
  for (const h of world.hazards) {
    if (h.kind !== 'charge' || h.friendly || h.dead) continue;
    const at = chargePos(h);
    if (!hits(at.x, at.y, 14)) continue;
    const t = nearestEnemy(at.x, at.y, 420);
    const aim = t && Math.abs(angleDiff(angle, angleTo(at.x, at.y, t.x, t.y))) < 1.2 ? t : null;
    h.x0 = at.x;
    h.y0 = at.y;
    h.x1 = aim ? aim.x : at.x + Math.cos(angle) * 260;
    h.y1 = aim ? aim.y : at.y + Math.sin(angle) * 260;
    h.x = h.x1;
    h.y = h.y1;
    h.t = 0;
    h.flight = 0.42;
    h.fuse = 0;
    h.delay = h.flight;
    h.landed = false;
    h.friendly = true;
    h.height = 90;
    h.color = '#ffd45e';
    h.kickDamage = Math.max(30, Math.round(h.damage * 2.5));
    ring(at.x, at.y, { r0: 4, r1: 40, color: '#ffd45e', life: 0.25, width: 3 });
    burst(at.x, at.y, { count: 10, color: '#ffd45e', speed: 260, size: 3, life: 0.3, drag: 5, shape: 'spark' });
    sfx.block();
    n++;
  }
  return n;
}

// --- drawing -----------------------------------------------------------------

/** Floor markers: drawn under every entity so they never hide an attacker. */
export function drawHazardsBelow(ctx, time) {
  for (const h of world.hazards) {
    switch (h.kind) {
      case 'blast':
      case 'lob':
      case 'charge': drawMarker(ctx, h, time); break;
      case 'cone': drawCone(ctx, h); break;
      case 'lane': drawLane(ctx, h, time); break;
      case 'shockring': drawShockring(ctx, h); break;
      case 'beam': if (h.t < h.warn) drawBeamWarning(ctx, h, time); break;
      default: break;
    }
  }
  ctx.globalAlpha = 1;
}

/** Things in the air: lobbed shells and live beams, above every entity. */
export function drawHazardsAbove(ctx) {
  for (const h of world.hazards) {
    if (h.kind === 'lob') drawShell(ctx, h);
    else if (h.kind === 'charge') drawCharge(ctx, h);
    else if (h.kind === 'beam' && h.t >= h.warn) drawBeam(ctx, h);
  }
  ctx.globalAlpha = 1;
}

function drawMarker(ctx, h, time) {
  const k = clamp(h.t / h.delay, 0, 1);
  // Fill grows to the rim exactly as it detonates: the timing is on the floor.
  ctx.globalAlpha = 0.14 + k * 0.14;
  ctx.fillStyle = h.color;
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.r * k, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.55 + Math.sin(time * 26) * 0.2 * k;
  ctx.strokeStyle = h.color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.r, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawCone(ctx, h) {
  const k = clamp(h.t / h.delay, 0, 1);
  ctx.globalAlpha = 0.12 + k * 0.2;
  ctx.fillStyle = h.color;
  ctx.beginPath();
  ctx.moveTo(h.x, h.y);
  ctx.arc(h.x, h.y, h.r, h.angle - h.arc / 2, h.angle + h.arc / 2);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.6;
  ctx.strokeStyle = h.color;
  ctx.lineWidth = 2;
  ctx.stroke();
  // Leading edge sweeps out with the timer.
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.arc(h.x, h.y, h.r * k, h.angle - h.arc / 2, h.angle + h.arc / 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/** A charge lane: where a rush / roll / swoop is about to travel. */
function drawLane(ctx, h, time) {
  const k = clamp(h.t / h.delay, 0, 1);
  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(h.angle);
  const w = h.width;
  ctx.globalAlpha = 0.1 + k * 0.14;
  ctx.fillStyle = h.color;
  ctx.fillRect(0, -w / 2, h.len, w);
  ctx.globalAlpha = 0.55 + Math.sin(time * 24) * 0.15;
  ctx.strokeStyle = h.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -w / 2); ctx.lineTo(h.len, -w / 2);
  ctx.moveTo(0, w / 2); ctx.lineTo(h.len, w / 2);
  ctx.stroke();
  // Arrowheads marching along the lane show direction and fill with the timer.
  ctx.globalAlpha = 0.35 + k * 0.45;
  ctx.fillStyle = h.color;
  const step = 70;
  const drift = (time * 160) % step;
  for (let d = drift; d < h.len * k; d += step) {
    ctx.beginPath();
    ctx.moveTo(d + 12, 0);
    ctx.lineTo(d - 6, -w * 0.28);
    ctx.lineTo(d - 6, w * 0.28);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawShockring(ctx, h) {
  if (h.t < (h.wait || 0)) return;
  const fade = clamp(1 - h.radius / h.maxR, 0, 1);
  ctx.strokeStyle = h.color;
  const segs = gapSegments(h);
  for (const [a0, a1] of segs) {
    ctx.globalAlpha = 0.25 * fade + 0.1;
    ctx.lineWidth = h.width + 8;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.radius, a0, a1);
    ctx.stroke();
    ctx.globalAlpha = 0.85 * fade + 0.15;
    ctx.lineWidth = h.width * 0.55;
    ctx.beginPath();
    ctx.arc(h.x, h.y, h.radius, a0, a1);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** The drawn arcs of a ring, i.e. the full circle minus its gaps. */
function gapSegments(h) {
  if (!h.gaps || h.gaps.length === 0) return [[0, TAU]];
  const cuts = h.gaps
    .map((g) => [g.a - g.w / 2, g.a + g.w / 2])
    .sort((a, b) => a[0] - b[0]);
  const out = [];
  for (let i = 0; i < cuts.length; i++) {
    const end = cuts[i][1];
    const next = i + 1 < cuts.length ? cuts[i + 1][0] : cuts[0][0] + TAU;
    if (next > end) out.push([end, next]);
  }
  return out;
}

function drawBeamWarning(ctx, h, time) {
  const k = clamp(h.t / h.warn, 0, 1);
  ctx.globalAlpha = 0.3 + k * 0.5 + Math.sin(time * 40) * 0.1;
  ctx.strokeStyle = h.color;
  ctx.lineWidth = 1.5 + k * 3;
  ctx.setLineDash([14, 10]);
  ctx.beginPath();
  ctx.moveTo(h.x, h.y);
  ctx.lineTo(h.x + Math.cos(h.angle) * h.len, h.y + Math.sin(h.angle) * h.len);
  ctx.stroke();
  ctx.setLineDash([]);
  // Chevrons show which way the beam will sweep once it fires.
  if (h.spin) {
    const dir = Math.sign(h.spin);
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = h.color;
    for (let d = 140; d < h.len; d += 170) {
      const bx = h.x + Math.cos(h.angle) * d, by = h.y + Math.sin(h.angle) * d;
      const na = h.angle + (Math.PI / 2) * dir;
      ctx.save();
      ctx.translate(bx + Math.cos(na) * 14, by + Math.sin(na) * 14);
      ctx.rotate(na);
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(-5, -6);
      ctx.lineTo(-5, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

function drawBeam(ctx, h) {
  const left = h.total - h.t;
  const fade = left < 0.18 ? left / 0.18 : 1;
  const grow = clamp((h.t - h.warn) / 0.08, 0, 1);
  const ex = h.x + Math.cos(h.angle) * h.len, ey = h.y + Math.sin(h.angle) * h.len;
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.3 * fade;
  ctx.strokeStyle = h.color;
  ctx.lineWidth = h.width * 1.9 * grow;
  ctx.beginPath();
  ctx.moveTo(h.x, h.y);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.globalAlpha = 0.95 * fade;
  ctx.lineWidth = h.width * grow;
  ctx.stroke();
  ctx.globalAlpha = 0.9 * fade;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = h.width * 0.35 * grow;
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.globalAlpha = 1;
}

/** A blasting charge: a shell in the air, then a bomb with a lit fuse. */
function drawCharge(ctx, h) {
  if (h.t < h.flight) { drawShell(ctx, h); return; }
  const fuseK = h.fuse > 0 ? clamp((h.t - h.flight) / h.fuse, 0, 1) : 1;
  const blink = Math.sin(h.t * (14 + fuseK * 40)) > 0;
  ctx.fillStyle = '#0b0712';
  ctx.beginPath();
  ctx.arc(h.x, h.y - 6, 13, 0, TAU);
  ctx.fill();
  ctx.fillStyle = blink ? '#ff5e3d' : '#6a4a3a';
  ctx.beginPath();
  ctx.arc(h.x, h.y - 6, 11, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#d8c8a8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(h.x + 4, h.y - 15);
  ctx.quadraticCurveTo(h.x + 9, h.y - 22, h.x + 5, h.y - 26 + fuseK * 8);
  ctx.stroke();
}

function drawShell(ctx, h) {
  const k = clamp(h.t / h.flight, 0, 1);
  const x = h.x0 + (h.x1 - h.x0) * k;
  const gy = h.y0 + (h.y1 - h.y0) * k;
  const z = Math.sin(k * Math.PI) * (h.height || 150);
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(x, gy + 4, 9, 4, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#0b0712';
  ctx.beginPath();
  ctx.arc(x, gy - z, (h.shellR || 10) + 2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = h.color;
  ctx.beginPath();
  ctx.arc(x, gy - z, h.shellR || 10, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.arc(x - 3, gy - z - 3, (h.shellR || 10) * 0.35, 0, TAU);
  ctx.fill();
}
