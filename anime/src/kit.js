// THE PROP KIT. A dozen primitives, so a street can be written as data.
//
// One person cannot hand-draw a street. One person can write down a street -
// a list of boxes, posts, awnings and banners with a position, a size and a
// hue - if the primitives underneath are good enough. That is what this is.
// Every one of them obeys the same light and goes through view.js to project,
// so they agree with each other for free.
//
// Measured off the ED and not negotiable:
//   - light comes from the screen upper right, so a solid's down-right face is
//     lit and its down-left face is in shade;
//   - architecture carries NO outline, only face shading and a contact shadow;
//     actors and loose props do carry one;
//   - shadows are soft-edged and warm, never hard and never blue.

import { toScreen, poly, camera, GROUND } from './view.js';
import { faces, shade, lift, W, SLABS, INK } from './palette.js';

const TAU = Math.PI * 2;

/** Deterministic noise, so a street looks scattered but is the same every run. */
export function hash(i, j, seed = 1) {
  let h = (i * 374761393 + j * 668265263 + seed * 1442695040) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// --- shadow -----------------------------------------------------------------

/**
 * A soft contact shadow. The ED never draws a hard one: a character sits on a
 * blurred ellipse and a tree throws a blurred blob. The offset is toward world
 * +y because the light is up and to the screen's right, so everything's shadow
 * falls down and to the left.
 */
export function contact(ctx, x, y, r, k = 0.30) {
  const p = toScreen(x - r * 0.22, y + r * 0.22, 0);
  const rx = r * camera.scale * 1.35, ry = rx * GROUND * 1.15;
  if (rx < 0.4) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0.00, 'rgba(108,92,110,' + k + ')');
  g.addColorStop(0.55, 'rgba(108,92,110,' + k * 0.74 + ')');
  g.addColorStop(1.00, 'rgba(108,92,110,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill();
  ctx.restore();
}

/**
 * The long soft shadow a standing thing throws across the ground.
 *
 * The direction is not a choice. The footage says the lit face of a box is the
 * one pointing down-right (+x) and the shaded face is the one pointing
 * down-left (+y), so the light sits over +x and -y - and a shadow therefore
 * reaches toward -x and +y at once, which on screen is dead LEFT. That is
 * exactly where the characters' shadows fall in the reference.
 */
export function castShadow(ctx, x, y, w, d, h, k = 0.22) {
  const reach = h * 0.40;
  ctx.save();
  poly(ctx, [
    [x, y, 0], [x + w, y, 0],
    [x + w - reach, y + d + reach, 0], [x - reach, y + d + reach, 0],
  ]);
  ctx.filter = 'blur(7px)';
  ctx.fillStyle = 'rgba(108,92,110,' + k + ')';
  ctx.fill();
  ctx.restore();
}

// --- flat ground ------------------------------------------------------------

/** A coloured strip of ground: road, bike lane, a painted line. */
export function band(ctx, x0, x1, y0, y1, color) {
  poly(ctx, [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]]);
  ctx.fillStyle = color;
  ctx.fill();
}

/**
 * PAVING. A diamond grid where every slab picks one of four near-whites, with
 * weeds at the joints. This is the single best value in the whole kit: it costs
 * four lines and it carries the entire ground plane, which is most of what the
 * eye reads as "a real place".
 */
export function slabs(ctx, { x0, y0, x1, y1, t = 45, seed = 1, weeds = 0.07 }) {
  band(ctx, x0, x1, y0, y1, shade(W.slab, 0.962));       // the joints, underneath
  const gap = 1.6;
  for (let x = x0; x < x1; x += t) {
    for (let y = y0; y < y1; y += t) {
      const r = hash(Math.round(x / t), Math.round(y / t), seed);
      poly(ctx, [
        [x + gap, y + gap, 0], [Math.min(x + t, x1) - gap, y + gap, 0],
        [Math.min(x + t, x1) - gap, Math.min(y + t, y1) - gap, 0],
        [x + gap, Math.min(y + t, y1) - gap, 0],
      ]);
      ctx.fillStyle = SLABS[(r * SLABS.length) | 0];
      ctx.fill();
    }
  }
  if (!weeds) return;
  ctx.fillStyle = shade('#97aa34', 0.95);
  for (let x = x0; x < x1; x += t) {
    for (let y = y0; y < y1; y += t) {
      const r = hash(Math.round(x / t), Math.round(y / t), seed + 77);
      if (r > weeds) continue;
      const p = toScreen(x, y, 0);
      for (let b = 0; b < 4; b++) {
        const a = hash(x, y + b, seed) * TAU;
        ctx.beginPath();
        ctx.ellipse(p.x + Math.cos(a) * 4, p.y + Math.sin(a) * 2.2, 2.4, 1.3, a, 0, TAU);
        ctx.fill();
      }
    }
  }
}

// --- solids -----------------------------------------------------------------

/** A circle lying flat on the ground. It is an ellipse on screen, and the
 *  squash is the camera's, so it comes from view.js rather than from a number
 *  typed in by hand - which is exactly the mistake check-view.mjs hunts for. */
export function groundCircle(ctx, x, y, r) {
  const p = toScreen(x, y, 0);
  const rr = r * camera.scale * 1.414;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, rr, rr * GROUND, 0, 0, TAU);
}

/** A quad on a plane of constant x - used to put things ON the lit face. */
export function quadX(ctx, x, y0, y1, z0, z1) {
  poly(ctx, [[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]]);
}
/** A quad on a plane of constant y - the shaded face. */
export function quadY(ctx, y, x0, x1, z0, z1) {
  poly(ctx, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]]);
}

/**
 * THE BOX. Three flat faces and a light that never moves - the whole of
 * "looks 3D, is 2D". Everything rectangular in the street is this.
 */
export function box(ctx, o) {
  const { x, y, z = 0, w, d, h } = o;
  const f = o.faces || faces(o.color);
  const x1 = x + w, y1 = y + d, z1 = z + h;
  poly(ctx, [[x, y1, z], [x1, y1, z], [x1, y1, z1], [x, y1, z1]]);
  ctx.fillStyle = o.dim || f.dim; ctx.fill();
  poly(ctx, [[x1, y, z], [x1, y1, z], [x1, y1, z1], [x1, y, z1]]);
  ctx.fillStyle = o.lit || f.lit; ctx.fill();
  poly(ctx, [[x, y, z1], [x1, y, z1], [x1, y1, z1], [x, y1, z1]]);
  ctx.fillStyle = o.top || f.top; ctx.fill();
  if (o.ink) {
    ctx.strokeStyle = o.ink === true ? INK : o.ink;
    ctx.lineWidth = o.inkWidth || 2.2;
    ctx.lineJoin = 'round';
    poly(ctx, [
      [x, y1, z], [x1, y1, z], [x1, y, z], [x1, y, z1], [x1, y1, z1], [x, y1, z1],
    ]);
    ctx.stroke();
  }
}

/**
 * A CYLINDER - poles, bollards, tree trunks. Cel shading wants hard bands, not
 * a soft ramp, so it gets three: shade, body, and a narrow lit strip down the
 * right-hand side where the light is.
 */
export function post(ctx, { x, y, z = 0, h, r, color, cap = true }) {
  const f = faces(color);
  const b = toScreen(x, y, z), t = toScreen(x, y, z + h);
  const hw = r * camera.scale * 1.414;
  const bands = [[-1.00, -0.30, f.dim], [-0.30, 0.52, color], [0.52, 1.00, f.top]];
  for (const [a, c, col] of bands) {
    ctx.fillStyle = col;
    ctx.fillRect(b.x + a * hw, t.y, (c - a) * hw + 0.5, b.y - t.y);
  }
  if (cap) {
    ctx.fillStyle = f.top;
    ctx.beginPath();
    ctx.ellipse(t.x, t.y, hw, hw * GROUND, 0, 0, TAU);
    ctx.fill();
  }
}

/**
 * AN AWNING. A sloped plane out from a wall with a scalloped fringe hanging
 * off its lip - the pink one in the ED is the single most recognisable thing
 * on that street.
 */
export function awning(ctx, { x, y0, y1, out, zHigh, zLow, drop = 46, color, teeth = 16 }) {
  const xo = x + out;
  // Three bands across the slope. A flat fill reads as cardboard; three steps
  // read as the barrel the real thing is.
  const steps = [lift(color, 1.045), lift(color, 1.005), shade(color, 0.978)];
  for (let i = 0; i < 3; i++) {
    const a = x + out * (i / 3), b = x + out * ((i + 1) / 3);
    const za = zHigh + (zLow - zHigh) * (i / 3), zb = zHigh + (zLow - zHigh) * ((i + 1) / 3);
    poly(ctx, [[a, y0, za], [a, y1, za], [b, y1, zb], [b, y0, zb]]);
    ctx.fillStyle = steps[i];
    ctx.fill();
  }
  const pts = [[xo, y0, zLow]];
  const n = Math.max(2, teeth);
  for (let i = 0; i <= n; i++) {
    const yy = y0 + (y1 - y0) * (i / n);
    pts.push([xo, yy, zLow - (i % 2 ? drop : drop * 0.52)]);
  }
  pts.push([xo, y1, zLow]);
  poly(ctx, pts);
  ctx.fillStyle = shade(color, 0.88);
  ctx.fill();
}

/**
 * A NOBORI - the tall thin banner outside every Japanese shop. A pole and a
 * cloth panel hanging along one ground axis. Loud on purpose: it is one of the
 * three or four saturated things a screen is allowed.
 */
export function banner(ctx, { x, y, h = 210, w = 46, color, pole = '#cfc8bd' }) {
  contact(ctx, x, y + w * 0.4, 26, 0.22);
  post(ctx, { x, y, h, r: 3.2, color: pole, cap: false });
  const top = h * 0.94, bot = h * 0.30;
  poly(ctx, [[x, y, top], [x, y + w, top], [x, y + w, bot], [x, y, bot]]);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = shade(color, 0.72);
  ctx.lineWidth = 1.6;
  ctx.stroke();
  poly(ctx, [[x, y + w * 0.14, top - 14], [x, y + w * 0.86, top - 14],
             [x, y + w * 0.86, top - 24], [x, y + w * 0.14, top - 24]]);
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.fill();
}

/**
 * FOLIAGE. Overlapping blobs, no outline, a darker underside. The ED's leaves
 * are the most saturated thing in the frame at 69% - greenery is where the
 * colour budget goes.
 */
export function bush(ctx, { x, y, r = 60, h = 70, color = '#97aa34', seed = 3, n = 9 }) {
  contact(ctx, x, y, r * 0.9, 0.24);
  const blobs = [];
  for (let i = 0; i < n; i++) {
    const a = hash(seed, i, 5) * TAU, u = Math.sqrt(hash(seed, i, 9));
    blobs.push({
      bx: x + Math.cos(a) * r * u * 0.8,
      by: y + Math.sin(a) * r * u * 0.8,
      bz: h * (0.22 + hash(seed, i, 13) * 0.78),
      br: r * (0.34 + hash(seed, i, 17) * 0.30),
    });
  }
  blobs.sort((p, q) => (p.bx + p.by) - (q.bx + q.by));
  for (let i = 0; i < blobs.length; i++) {
    const b = blobs[i];
    const p = toScreen(b.bx, b.by, b.bz);
    const rr = b.br * camera.scale * 1.3;
    const ph = hash(seed, i, 31) * TAU;
    cloud(ctx, p.x, p.y + rr * 0.20, rr, rr * 0.88, 8, ph, 1.26);
    ctx.fillStyle = shade(color, 0.72); ctx.fill();
    cloud(ctx, p.x, p.y - rr * 0.06, rr * 0.93, rr * 0.80, 8, ph + 0.4, 1.26);
    ctx.fillStyle = color; ctx.fill();
    cloud(ctx, p.x + rr * 0.24, p.y - rr * 0.30, rr * 0.44, rr * 0.34, 6, ph + 1.1, 1.3);
    ctx.fillStyle = lift(color, 1.16); ctx.fill();
  }
}

/**
 * A VENDING MACHINE. Japan's street furniture, and the one place the lighting
 * rule is broken on purpose: the product display is BACKLIT, so its front face
 * is brighter than the light direction says it should be. (This is what fooled
 * the first reading of the footage - the machine looked lit from the wrong
 * side until it turned out to be lit from inside.)
 */
export function vending(ctx, { x, y, w = 80, d = 104, h = 183, color = '#17929e' }) {
  castShadow(ctx, x, y, w, d, h, 0.24);
  contact(ctx, x + w / 2, y + d / 2, w * 0.82, 0.34);
  box(ctx, { x, y, w, d, h, color, lit: lift(color, 1.18) });

  const x1 = x + w;                           // the face toward the street
  ctx.save();
  quadX(ctx, x1 + 0.4, y + 8, y + d - 8, h * 0.40, h * 0.93);
  ctx.fillStyle = '#f4f7f3'; ctx.fill();      // the glass
  ctx.clip();
  for (let row = 0; row < 4; row++) {
    const z0 = h * 0.42 + row * h * 0.125;
    for (let c = 0; c < 9; c++) {
      const yy = y + 12 + c * ((d - 24) / 9);
      quadX(ctx, x1 + 0.6, yy + 1.5, yy + (d - 24) / 9 - 1.5, z0, z0 + h * 0.082);
      const t = hash(row, c, 21);
      ctx.fillStyle = ['#b05070', '#4890b8', '#97aa34', '#b89040', '#58b8a8', '#b85890'][(t * 6) | 0];
      ctx.fill();
    }
    quadX(ctx, x1 + 0.7, y + 8, y + d - 8, z0 - h * 0.012, z0);
    ctx.fillStyle = shade('#f4f7f3', 0.86); ctx.fill();
  }
  ctx.restore();

  quadX(ctx, x1 + 0.4, y + 14, y + d * 0.52, h * 0.20, h * 0.36);
  ctx.fillStyle = lift(color, 1.30); ctx.fill();          // the lit price panel
  quadX(ctx, x1 + 0.4, y + 16, y + d - 16, h * 0.085, h * 0.115);
  ctx.fillStyle = shade(color, 0.52); ctx.fill();         // the delivery slot
  quadX(ctx, x1 + 0.4, y + d * 0.62, y + d - 18, h * 0.22, h * 0.30);
  ctx.fillStyle = '#ded9d1'; ctx.fill();                  // the coin plate
}

/** A plain street bin, outlined, because small loose things are actors. */
export function bin(ctx, { x, y, w = 44, d = 54, h = 76, color = '#5070b8' }) {
  contact(ctx, x + w / 2, y + d / 2, 34, 0.32);
  box(ctx, { x, y, w, d, h, color, ink: true, inkWidth: 2 });
  quadX(ctx, x + w + 0.4, y + 10, y + d - 10, h * 0.62, h * 0.82);
  ctx.fillStyle = shade(color, 0.50); ctx.fill();
}

/** A window on a shopfront's street-facing wall. Dark, but never black. */
export function shopWindow(ctx, { x, y0, y1, z0, z1, frame = '#cfa978' }) {
  quadX(ctx, x, y0, y1, z0, z1);
  ctx.fillStyle = '#4a4f5e'; ctx.fill();
  ctx.strokeStyle = frame; ctx.lineWidth = 3; ctx.stroke();
  quadX(ctx, x + 0.3, y0 + (y1 - y0) * 0.08, y0 + (y1 - y0) * 0.40,
        z0 + (z1 - z0) * 0.22, z1 - (z1 - z0) * 0.08);
  ctx.fillStyle = 'rgba(236,243,247,0.30)'; ctx.fill();   // one sheet of sky
}

// --- the air ----------------------------------------------------------------
//
// Flat fills and hard edges are most of cel shading, but a scene made only of
// them reads as vector art, not as a drawing. The three things below are what
// the ED has and a naive flat render does not: a sun that falls across the
// whole frame, a little grain in every surface, and foliage with edges rather
// than ellipses. This is the one place the rules allow a gradient - it is in
// the air, not on a surface.

let grainPattern = null;

/** A fine, fixed grain over the whole frame. One 96 px tile, repeated. */
export function grain(ctx, w, h, alpha = 0.05) {
  if (!grainPattern) {
    const n = 96, c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d');
    const img = g.createImageData(n, n);
    for (let i = 0; i < n * n; i++) {
      const v = 128 + (hash(i % n, (i / n) | 0, 99) - 0.5) * 150;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    grainPattern = ctx.createPattern(c, 'repeat');
  }
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = grainPattern;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** The sun, coming from the screen's upper right the way everything else in
 *  this folder assumes, and the cool bounce it leaves in the lower left. */
export function sunWash(ctx, w, h) {
  const g = ctx.createLinearGradient(w, -h * 0.2, w * 0.1, h);
  g.addColorStop(0.00, 'rgba(255,230,190,0.30)');
  g.addColorStop(0.42, 'rgba(255,241,221,0.09)');
  g.addColorStop(0.78, 'rgba(146,126,150,0.05)');
  g.addColorStop(1.00, 'rgba(132,112,140,0.13)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** A scalloped blob. Foliage drawn as plain ellipses reads as grapes; the same
 *  blob with eight bulges reads as leaves, for the price of one curve each. */
export function cloud(ctx, cx, cy, rx, ry, lobes = 9, phase = 0, bump = 1.3) {
  ctx.beginPath();
  for (let i = 0; i <= lobes; i++) {
    const a0 = phase + (i / lobes) * TAU;
    const a1 = phase + ((i + 1) / lobes) * TAU;
    const am = (a0 + a1) / 2;
    const x1 = cx + Math.cos(a1) * rx, y1 = cy + Math.sin(a1) * ry;
    if (i === 0) ctx.moveTo(cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry);
    ctx.quadraticCurveTo(
      cx + Math.cos(am) * rx * bump, cy + Math.sin(am) * ry * bump, x1, y1,
    );
  }
  ctx.closePath();
}

/**
 * A PARKED CAR. The ED's street has one, and an empty road reads as paper -
 * this is the single prop that makes the carriageway look like a road. Built
 * the same way as everything else: boxes, one light, three faces.
 *
 * It lies along y, which is the direction the street runs.
 */
export function car(ctx, { x, y, w = 172, d = 430, h = 66, color = '#eceae6' }) {
  const wheel = (wx, wy) => {
    const p = toScreen(wx, wy, 26);
    ctx.fillStyle = '#2f2f36';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 15, 20, 0, 0, TAU); ctx.fill();
  };
  castShadow(ctx, x, y, w, d, h * 0.9, 0.20);
  contact(ctx, x + w / 2, y + d / 2, w * 1.05, 0.26);
  wheel(x + w, y + 86); wheel(x + w, y + d - 86);

  box(ctx, { x, y, w, d, h, z: 26, color });                      // the body
  const cw = w - 30, cd = d * 0.40;
  box(ctx, {
    x: x + 15, y: y + d * 0.26, w: cw, d: cd, h: 46, z: 26 + h, color,
  });

  // Glass on the three faces you can see, dark but never black.
  const gx = x + 15 + cw;
  quadX(ctx, gx + 0.5, y + d * 0.28, y + d * 0.26 + cd - 8, 26 + h + 7, 26 + h + 40);
  ctx.fillStyle = '#5c6472'; ctx.fill();
  quadY(ctx, y + d * 0.26 + cd - 0.5, x + 22, x + 15 + cw - 7, 26 + h + 7, 26 + h + 40);
  ctx.fillStyle = '#4e5664'; ctx.fill();

  // Lights, and the one place a hard white dot is allowed.
  quadX(ctx, x + w + 0.5, y + d - 44, y + d - 14, 40, 60);
  ctx.fillStyle = '#e8625e'; ctx.fill();
  quadX(ctx, x + w + 0.5, y + 14, y + 44, 40, 60);
  ctx.fillStyle = '#f6efd8'; ctx.fill();
}
