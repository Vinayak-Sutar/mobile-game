// Juice layer: particles, shockwaves, slash arcs, damage numbers, screen shake
// and hitstop. This is the cheapest polish in the whole project, so it gets a
// real system rather than ad-hoc effects at call sites.

import { TAU, rand, clamp, easeOutCubic, easeOutQuad, polygon } from './util.js';

const MAX_PARTICLES = 420;

export const fx = {
  particles: [],
  rings: [],
  slashes: [],
  texts: [],
  trails: [],
  cues: [],        // parry cues: white glint = parryable, red ⚠ = unparryable
  trauma: 0,       // 0..1, shake magnitude is trauma^2 so small hits stay subtle
  shakeX: 0,
  shakeY: 0,
  hitstop: 0,      // seconds of frozen simulation
  flash: 0,
  flashColor: '#ffffff',
  vignette: 0,
};

export function shake(amount) {
  fx.trauma = clamp(fx.trauma + amount, 0, 1);
}

export function hitstop(seconds) {
  fx.hitstop = Math.max(fx.hitstop, seconds);
}

export function flash(alpha, color = '#ffffff') {
  fx.flash = Math.max(fx.flash, alpha);
  fx.flashColor = color;
}

export function burst(x, y, opts = {}) {
  const {
    count = 8, color = '#fff', speed = 180, speedVar = 0.6,
    size = 4, sizeVar = 0.5, life = 0.4, lifeVar = 0.4,
    dir = null, spread = TAU, drag = 4, gravity = 0, shape = 'circle', glowing = false,
  } = opts;

  for (let i = 0; i < count; i++) {
    if (fx.particles.length >= MAX_PARTICLES) break;
    const a = dir === null ? rand(0, TAU) : dir + rand(-spread / 2, spread / 2);
    const sp = speed * rand(1 - speedVar, 1 + speedVar);
    const l = life * rand(1 - lifeVar, 1 + lifeVar);
    fx.particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: l, maxLife: l,
      size: size * rand(1 - sizeVar, 1 + sizeVar),
      color, drag, gravity, shape, glowing,
      spin: rand(-8, 8), rot: rand(0, TAU),
    });
  }
}

export function ring(x, y, opts = {}) {
  const { r0 = 6, r1 = 80, color = '#fff', life = 0.35, width = 4, fill = false } = opts;
  fx.rings.push({ x, y, r0, r1, color, life, maxLife: life, width, fill });
}

export function slash(x, y, angle, arc, radius, color = '#fff', life = 0.18, thickness = 16) {
  fx.slashes.push({ x, y, angle, arc, radius, color, life, maxLife: life, thickness });
}

export function damageText(x, y, text, opts = {}) {
  const { color = '#fff', crit = false, size = 17 } = opts;
  fx.texts.push({
    x: x + rand(-8, 8), y: y - 8, text, color, crit,
    size: crit ? size * 1.5 : size,
    vx: rand(-24, 24), vy: rand(-96, -66),
    life: crit ? 0.85 : 0.62, maxLife: crit ? 0.85 : 0.62,
  });
}

/**
 * The fairness tell for parry. 'white': a glint ~0.15 s before a parryable
 * hit lands. 'red': a ⚠ at the start of an unparryable wind-up (dash instead).
 * Follows the entity while it lasts.
 */
export function parryCue(ent, kind = 'white') {
  if (!ent) return;
  const life = kind === 'white' ? 0.24 : 0.55;
  fx.cues.push({ ent, kind, life, maxLife: life });
}

export function trail(x, y, opts = {}) {
  const { color = '#fff', radius = 14, life = 0.28 } = opts;
  fx.trails.push({ x, y, color, radius, life, maxLife: life });
}

export function updateFx(dt) {
  // Screen shake — trauma decays linearly, offset is randomised each frame.
  fx.trauma = Math.max(0, fx.trauma - dt * 1.9);
  const mag = fx.trauma * fx.trauma * 26;
  fx.shakeX = rand(-mag, mag);
  fx.shakeY = rand(-mag, mag);
  fx.flash = Math.max(0, fx.flash - dt * 4.2);
  fx.vignette = Math.max(0, fx.vignette - dt * 2);

  for (let i = fx.particles.length - 1; i >= 0; i--) {
    const p = fx.particles[i];
    p.life -= dt;
    if (p.life <= 0) { fx.particles.splice(i, 1); continue; }
    const d = Math.exp(-p.drag * dt);
    p.vx *= d;
    p.vy = p.vy * d + p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.spin * dt;
  }

  for (let i = fx.rings.length - 1; i >= 0; i--) {
    const r = fx.rings[i];
    r.life -= dt;
    if (r.life <= 0) fx.rings.splice(i, 1);
  }
  for (let i = fx.slashes.length - 1; i >= 0; i--) {
    const s = fx.slashes[i];
    s.life -= dt;
    if (s.life <= 0) fx.slashes.splice(i, 1);
  }
  for (let i = fx.trails.length - 1; i >= 0; i--) {
    const t = fx.trails[i];
    t.life -= dt;
    if (t.life <= 0) fx.trails.splice(i, 1);
  }
  for (let i = fx.cues.length - 1; i >= 0; i--) {
    const c = fx.cues[i];
    c.life -= dt;
    if (c.life <= 0 || c.ent.dead) fx.cues.splice(i, 1);
  }
  for (let i = fx.texts.length - 1; i >= 0; i--) {
    const t = fx.texts[i];
    t.life -= dt;
    if (t.life <= 0) { fx.texts.splice(i, 1); continue; }
    t.x += t.vx * dt;
    t.y += t.vy * dt;
    t.vy += 210 * dt;
    t.vx *= 0.94;
  }
}

// Drawn beneath entities: ghost trails and expanding shockwaves.
export function drawFxBelow(ctx) {
  for (const t of fx.trails) {
    const k = t.life / t.maxLife;
    ctx.globalAlpha = k * 0.34;
    ctx.fillStyle = t.color;
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.radius * (0.45 + k * 0.55), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  for (const r of fx.rings) {
    const k = 1 - r.life / r.maxLife;
    const radius = r.r0 + (r.r1 - r.r0) * easeOutCubic(k);
    ctx.globalAlpha = (1 - k) * 0.85;
    if (r.fill) {
      ctx.fillStyle = r.color;
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, TAU);
      ctx.fill();
    } else {
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - k * 0.65);
      ctx.beginPath();
      ctx.arc(r.x, r.y, radius, 0, TAU);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

// Drawn above entities: sparks, slash arcs and floating numbers.
export function drawFxAbove(ctx) {
  for (const s of fx.slashes) {
    const k = 1 - s.life / s.maxLife;
    ctx.globalAlpha = (1 - k) * 0.9;
    ctx.strokeStyle = s.color;
    ctx.lineCap = 'round';
    // The arc sweeps outward and thins as it fades, reading as a blade trail.
    const r = s.radius * (0.72 + easeOutQuad(k) * 0.34);
    ctx.lineWidth = s.thickness * (1 - k);
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, s.angle - s.arc / 2, s.angle + s.arc / 2);
    ctx.stroke();
    ctx.globalAlpha = (1 - k) * 0.45;
    ctx.lineWidth = s.thickness * (1 - k) * 0.35;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, s.angle - s.arc / 2, s.angle + s.arc / 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';

  for (const p of fx.particles) {
    const k = p.life / p.maxLife;
    ctx.globalAlpha = Math.min(1, k * 1.6);
    ctx.fillStyle = p.color;
    const s = p.size * (p.shape === 'spark' ? k : 0.35 + k * 0.65);
    if (p.shape === 'square') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillRect(-s, -s, s * 2, s * 2);
      ctx.restore();
    } else if (p.shape === 'spark') {
      const len = Math.min(26, Math.hypot(p.vx, p.vy) * 0.045);
      const a = Math.atan2(p.vy, p.vx);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(1, s);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - Math.cos(a) * len, p.y - Math.sin(a) * len);
      ctx.stroke();
    } else if (p.shape === 'shard') {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      polygon(ctx, 0, 0, s, 3, 0);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, s, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  drawCues(ctx);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const t of fx.texts) {
    const k = t.life / t.maxLife;
    // Pop in, then fade out over the last 45%.
    const grow = k > 0.8 ? 1 + (1 - k) * 3.4 : 1;
    ctx.globalAlpha = Math.min(1, k / 0.45);
    ctx.font = `900 ${t.size * grow}px "Segoe UI", Roboto, system-ui, sans-serif`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

function drawCues(ctx) {
  for (const c of fx.cues) {
    const e = c.ent;
    const k = c.life / c.maxLife;
    const x = e.x, y = e.y - (e.z || 0);
    if (c.kind === 'white') {
      // A four-point star glint that blooms and fades: "parry this now".
      const s = (e.r * 0.9 + 10) * (0.6 + (1 - k) * 0.7);
      const gx = x - e.r * 0.35, gy = y - e.r * 0.55;
      ctx.globalAlpha = Math.min(1, k * 2.2);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(gx, gy - s);
      ctx.lineTo(gx + s * 0.16, gy - s * 0.16);
      ctx.lineTo(gx + s, gy);
      ctx.lineTo(gx + s * 0.16, gy + s * 0.16);
      ctx.lineTo(gx, gy + s);
      ctx.lineTo(gx - s * 0.16, gy + s * 0.16);
      ctx.lineTo(gx - s, gy);
      ctx.lineTo(gx - s * 0.16, gy - s * 0.16);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = Math.min(1, k * 2.2) * 0.4;
      ctx.beginPath();
      ctx.arc(gx, gy, s * 0.45, 0, TAU);
      ctx.fill();
    } else {
      // Red warning triangle above the head: "can't parry — dash".
      const r = 11;
      const gy = y - e.r - 22 - (1 - k) * 4;
      ctx.globalAlpha = Math.min(1, k * 3);
      ctx.fillStyle = '#0b0712';
      polygon(ctx, x, gy, r + 3, 3, -Math.PI / 2);
      ctx.fill();
      ctx.fillStyle = '#ff3d4a';
      polygon(ctx, x, gy, r, 3, -Math.PI / 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x - 1.5, gy - 5, 3, 6);
      ctx.fillRect(x - 1.5, gy + 3, 3, 2.5);
    }
  }
  ctx.globalAlpha = 1;
}

export function clearFx() {
  fx.cues.length = 0;
  fx.particles.length = 0;
  fx.rings.length = 0;
  fx.slashes.length = 0;
  fx.texts.length = 0;
  fx.trails.length = 0;
  fx.trauma = 0;
  fx.hitstop = 0;
  fx.flash = 0;
}
