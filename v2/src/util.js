// Small math / helper library. No dependencies.

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (lo, hi) => lo + Math.random() * (hi - lo);
export const randInt = (lo, hi) => Math.floor(lo + Math.random() * (hi - lo + 1));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const chance = (p) => Math.random() < p;

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const dist2 = (ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay;
  return dx * dx + dy * dy;
};
export const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);

// Signed shortest distance between two angles, in (-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function normalize(x, y) {
  const m = Math.hypot(x, y);
  return m > 1e-6 ? [x / m, y / m] : [0, 0];
}

// Move `cur` toward `target` by at most `step`.
export function approach(cur, target, step) {
  if (cur < target) return Math.min(cur + step, target);
  return Math.max(cur - step, target);
}

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
export const easeInQuad = (t) => t * t;
export const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutElastic = (t) => {
  if (t === 0 || t === 1) return t;
  return Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1;
};

// --- collision -------------------------------------------------------------

export function circleRect(cx, cy, cr, r) {
  const nx = clamp(cx, r.x, r.x + r.w);
  const ny = clamp(cy, r.y, r.y + r.h);
  return dist2(cx, cy, nx, ny) < cr * cr;
}

// Push a circular entity out of an axis-aligned rect along the shallowest axis.
export function resolveCircleRect(ent, r) {
  const nx = clamp(ent.x, r.x, r.x + r.w);
  const ny = clamp(ent.y, r.y, r.y + r.h);
  let dx = ent.x - nx, dy = ent.y - ny;
  let d = Math.hypot(dx, dy);

  if (d > ent.r) return false;

  if (d > 1e-4) {
    // Outside the rect but overlapping a face or corner.
    ent.x = nx + (dx / d) * ent.r;
    ent.y = ny + (dy / d) * ent.r;
  } else {
    // Centre is inside the rect: eject along the nearest face.
    const left = ent.x - r.x, right = r.x + r.w - ent.x;
    const top = ent.y - r.y, bottom = r.y + r.h - ent.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) ent.x = r.x - ent.r;
    else if (m === right) ent.x = r.x + r.w + ent.r;
    else if (m === top) ent.y = r.y - ent.r;
    else ent.y = r.y + r.h + ent.r;
  }
  return true;
}

// Circle vs oriented rectangle whose local origin is at (x,y), extending
// `len` along `angle` and `wid` across it.
export function circleOrientedRect(cx, cy, cr, x, y, angle, len, wid) {
  const c = Math.cos(-angle), s = Math.sin(-angle);
  const dx = cx - x, dy = cy - y;
  const lx = dx * c - dy * s;
  const ly = dx * s + dy * c;
  const hw = wid / 2;
  const qx = clamp(lx, 0, len);
  const qy = clamp(ly, -hw, hw);
  return dist2(lx, ly, qx, qy) < cr * cr;
}

// Circle vs arc (cone) centred on `angle` with total spread `arc`.
export function circleArc(cx, cy, cr, x, y, angle, arc, radius) {
  const d = dist(x, y, cx, cy);
  if (d > radius + cr) return false;
  if (d < 1e-3) return true;
  const a = Math.atan2(cy - y, cx - x);
  const spread = Math.abs(angleDiff(angle, a));
  // A fat target subtends extra angle at close range.
  const widen = Math.asin(clamp(cr / Math.max(d, cr), 0, 1));
  return spread <= arc / 2 + widen;
}

// --- canvas helpers --------------------------------------------------------

export function polygon(ctx, x, y, radius, sides, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * TAU;
    const px = x + Math.cos(a) * radius;
    const py = y + Math.sin(a) * radius;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// Fake glow without shadowBlur, which is very slow on mobile GPUs.
export function glow(ctx, x, y, radius, color, alpha = 0.5, layers = 3) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let i = layers; i >= 1; i--) {
    ctx.globalAlpha = (alpha * (layers - i + 1)) / (layers * layers);
    ctx.beginPath();
    ctx.arc(x, y, radius * (i / layers) * 1.9, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
