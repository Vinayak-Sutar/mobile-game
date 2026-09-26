// GOND — the drawing grammar.
//
// Pardhan Gond painting comes from the Gond people of central India, around
// Patangarh in Madhya Pradesh. It began as digna (geometric patterns on the mud
// floors and walls of a house) and bhittichitra (wall murals), painted at
// festivals in earth pigments. The form that reached paper and canvas is barely
// forty years old: Jangarh Singh Shyam took it there in the early 1980s after
// Jagdish Swaminathan found him and brought him to Bharat Bhavan in Bhopal, and
// the school that followed him is called Jangarh Kalam - Jangarh's hand. Durga
// Bai Vyam, Bhajju Shyam, Venkat Raman Singh Shyam and Ram Singh Urveti carried
// it on. It is a living tradition with living artists, and this file is a
// respectful imitation of its GRAMMAR, not a copy of anybody's work.
//
// Three things make it, and all three are things code is good at:
//
//   1. A BOLD SOOT-BLACK OUTLINE around every form. Charcoal and wood-fire
//      soot, traditionally. Nothing is soft-edged and nothing is shaded.
//
//   2. FLAT FIELDS of pigment inside that outline. No modelling, no light
//      source, no perspective. A form is read by its contour, not its volume.
//      The old colours: geru, the red ochre dug from riverbanks; turmeric
//      yellow; green from crushed leaves; white from rice paste or limestone;
//      black from soot; indigo, rarely, from the plant. They are not literal -
//      a deer is painted red because of what a deer IS, not what colour it is.
//
//   3. THE INFILL. This is the signature of the whole form. Every field is
//      filled with a repeated micro-motif: rows of fine dots (Jangarh's own,
//      drawn from Gond tattooing), comb-lines, dashes, fish scales, crescents,
//      seeds, water droplets (Durga Bai's), young shoots, ears of corn, waves.
//      An established artist's infill is their identifying mark, the way a
//      signature is. Colour shifts WITHIN a form through the infill - a feather
//      going from green to yellow across a run of little dashes - rather than
//      through blending, because there is no blending.
//
// So the primitive here is not "draw a shape". It is: take a path, flood it
// flat, clip to it, comb a motif across it, and ink the edge. Everything in the
// game's art is built out of that one move.
//
// Nothing here uses Math.random at draw time. A motif is a function of position,
// so a form looks identical every frame and the patterns never crawl.

const TAU = Math.PI * 2;

/** The pigments, by their own names. */
export const G = {
  soot: '#150f14',        // wood-fire soot and charcoal: every outline
  geru: '#b8402a',        // red ochre from the riverbank
  geruDark: '#8b2a1c',
  haldi: '#e2a129',       // turmeric
  haldiPale: '#f0c866',
  patta: '#4f8b3f',       // crushed leaf
  pattaDark: '#33632c',
  neel: '#2d4f9e',        // indigo, used sparingly
  neelDark: '#1b3068',
  chuna: '#f0e3c8',       // limestone and rice paste
  mitti: '#8a5a2b',       // earth
  mittiPale: '#b8834a',
  skin: '#c07a46',
  skinDark: '#94572e',
  ash: '#6d6459',
};

// --- the infills -------------------------------------------------------------
//
// Each one combs a motif across a box. They are called AFTER a clip, so they
// only ever show inside the form they are filling. `p` is the pitch: how far
// apart the marks sit, which is the main thing that separates a coarse hand
// from a fine one.

function dots(c, b, col, p = 9, r = 1.7) {
  c.fillStyle = col;
  for (let y = b.y, row = 0; y < b.y + b.h; y += p, row++) {
    for (let x = b.x + (row & 1 ? p / 2 : 0); x < b.x + b.w; x += p) {
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    }
  }
}

/** Jangarh's own: lines of dots that shape the form rather than just fill it. */
function dotLines(c, b, col, p = 10, r = 1.6) {
  c.fillStyle = col;
  for (let y = b.y; y < b.y + b.h; y += p) {
    for (let x = b.x; x < b.x + b.w; x += 3.4) {
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    }
  }
}

function comb(c, b, col, p = 6, w = 1.2, ang = 0) {
  c.strokeStyle = col; c.lineWidth = w;
  c.save();
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, r = Math.hypot(b.w, b.h);
  c.translate(cx, cy); c.rotate(ang);
  c.beginPath();
  for (let y = -r; y < r; y += p) { c.moveTo(-r, y); c.lineTo(r, y); }
  c.stroke();
  c.restore();
}

function dashes(c, b, col, p = 9, len = 4, ang = 0) {
  c.strokeStyle = col; c.lineWidth = 1.5; c.lineCap = 'round';
  c.save();
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, r = Math.hypot(b.w, b.h);
  c.translate(cx, cy); c.rotate(ang);
  c.beginPath();
  for (let y = -r, row = 0; y < r; y += p, row++) {
    for (let x = -r + (row & 1 ? p / 2 : 0); x < r; x += p) { c.moveTo(x, y); c.lineTo(x + len, y); }
  }
  c.stroke();
  c.lineCap = 'butt';
}

function scales(c, b, col, p = 11) {
  c.strokeStyle = col; c.lineWidth = 1.3;
  c.beginPath();
  for (let y = b.y, row = 0; y < b.y + b.h + p; y += p * 0.62, row++) {
    for (let x = b.x + (row & 1 ? p / 2 : 0); x < b.x + b.w + p; x += p) {
      c.moveTo(x - p / 2, y);
      c.arc(x, y, p / 2, Math.PI, TAU, true);
    }
  }
  c.stroke();
}

function crescents(c, b, col, p = 12) {
  c.strokeStyle = col; c.lineWidth = 1.6; c.lineCap = 'round';
  c.beginPath();
  for (let y = b.y, row = 0; y < b.y + b.h + p; y += p, row++) {
    for (let x = b.x + (row & 1 ? p / 2 : 0); x < b.x + b.w + p; x += p) {
      c.moveTo(x - p * 0.3, y - p * 0.26);
      c.quadraticCurveTo(x + p * 0.26, y, x - p * 0.3, y + p * 0.26);
    }
  }
  c.stroke();
  c.lineCap = 'butt';
}

/** Durga Bai's water droplets, and the seed shape they grow out of. */
function seeds(c, b, col, p = 11) {
  c.fillStyle = col;
  for (let y = b.y, row = 0; y < b.y + b.h + p; y += p, row++) {
    for (let x = b.x + (row & 1 ? p / 2 : 0); x < b.x + b.w + p; x += p) {
      c.beginPath();
      c.moveTo(x, y - p * 0.34);
      c.quadraticCurveTo(x + p * 0.2, y, x, y + p * 0.3);
      c.quadraticCurveTo(x - p * 0.2, y, x, y - p * 0.34);
      c.fill();
    }
  }
}

function waves(c, b, col, p = 9) {
  c.strokeStyle = col; c.lineWidth = 1.4;
  c.beginPath();
  for (let y = b.y; y < b.y + b.h + p; y += p) {
    c.moveTo(b.x, y);
    for (let x = b.x; x < b.x + b.w; x += 8) c.quadraticCurveTo(x + 2, y - 3, x + 4, y);
  }
  c.stroke();
}

function hatch(c, b, col, p = 7) {
  comb(c, b, col, p, 1, 0.7);
  comb(c, b, col, p, 1, -0.7);
}

/** Young shoots, the kind that come up in a flooded paddy field. */
function shoots(c, b, col, p = 13) {
  c.strokeStyle = col; c.lineWidth = 1.5; c.lineCap = 'round';
  c.beginPath();
  for (let y = b.y, row = 0; y < b.y + b.h + p; y += p, row++) {
    for (let x = b.x + (row & 1 ? p / 2 : 0); x < b.x + b.w + p; x += p) {
      c.moveTo(x, y + p * 0.34);
      c.lineTo(x, y - p * 0.1);
      c.moveTo(x, y - p * 0.05);
      c.quadraticCurveTo(x + p * 0.26, y - p * 0.2, x + p * 0.16, y - p * 0.4);
      c.moveTo(x, y - p * 0.05);
      c.quadraticCurveTo(x - p * 0.26, y - p * 0.2, x - p * 0.16, y - p * 0.4);
    }
  }
  c.stroke();
  c.lineCap = 'butt';
}

const MOTIF = { dots, dotLines, comb, dashes, scales, crescents, seeds, waves, hatch, shoots };

/** Comb one motif across a box by name, for backgrounds and washes. */
export function motif(c, box, name, col, pitch) {
  (MOTIF[name] || dots)(c, box, col, pitch);
}

// --- the one move -------------------------------------------------------------

/**
 * A FIELD: flood a path flat, comb a motif through it, ink the edge.
 *
 * This is the whole of the style in one function. Everything else in the art is
 * a matter of which path, which pigment and which motif.
 *
 *   path   a function that lays the path down (no fill, no stroke)
 *   o.fill the flat pigment underneath
 *   o.motif  which infill, o.on its colour, o.pitch how fine
 *   o.ink  the outline colour (soot unless told otherwise), o.lw its weight
 */
export function field(c, path, o) {
  const b = o.box;
  c.save();
  c.beginPath();
  path(c);
  if (o.fill) { c.fillStyle = o.fill; c.fill(); }
  if (o.motif && b) {
    c.save();
    c.clip();
    MOTIF[o.motif](c, b, o.on || 'rgba(20,15,20,0.5)', o.pitch, o.arg1, o.arg2);
    c.restore();
  }
  if (o.ink !== false) {
    c.strokeStyle = o.ink || G.soot;
    c.lineWidth = o.lw || 2.4;
    c.lineJoin = 'round';
    c.beginPath();
    path(c);
    c.stroke();
  }
  c.restore();
}

/** An ellipse as a field. The commonest shape in the whole tradition. */
export function blob(c, x, y, rx, ry, rot, o) {
  field(c, (g) => g.ellipse(x, y, rx, ry, rot || 0, 0, TAU),
    { ...o, box: { x: x - rx - ry, y: y - rx - ry, w: (rx + ry) * 2, h: (rx + ry) * 2 } });
}

/**
 * A LIMB: a tapering ribbon down a line of points, which is how arms, roots,
 * branches, tails and necks are all drawn. Gond figures are made of these.
 */
export function limb(c, pts, w0, w1, o) {
  const n = pts.length;
  const nx = [], ny = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b2 = pts[Math.min(n - 1, i + 1)];
    const dx = b2[0] - a[0], dy = b2[1] - a[1], d = Math.hypot(dx, dy) || 1;
    nx.push(-dy / d); ny.push(dx / d);
  }
  const wide = (i) => w0 + (w1 - w0) * (i / (n - 1));
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  const m = Math.max(w0, w1);
  const path = (g) => {
    g.moveTo(pts[0][0] + nx[0] * wide(0), pts[0][1] + ny[0] * wide(0));
    for (let i = 1; i < n; i++) g.lineTo(pts[i][0] + nx[i] * wide(i), pts[i][1] + ny[i] * wide(i));
    for (let i = n - 1; i >= 0; i--) g.lineTo(pts[i][0] - nx[i] * wide(i), pts[i][1] - ny[i] * wide(i));
    g.closePath();
  };
  field(c, path, { ...o, box: { x: x0 - m, y: y0 - m, w: x1 - x0 + m * 2, h: y1 - y0 + m * 2 } });
}

/** A leaf, pointed at both ends, with its midrib. The unit of the green world. */
export function leaf(c, x, y, len, wid, rot, o) {
  c.save();
  c.translate(x, y); c.rotate(rot);
  field(c, (g) => {
    g.moveTo(-len, 0);
    g.quadraticCurveTo(0, -wid, len, 0);
    g.quadraticCurveTo(0, wid, -len, 0);
    g.closePath();
  }, { ...o, box: { x: -len, y: -wid, w: len * 2, h: wid * 2 } });
  c.strokeStyle = o.ink || G.soot;
  c.lineWidth = 1.2;
  c.beginPath(); c.moveTo(-len * 0.8, 0); c.lineTo(len * 0.8, 0); c.stroke();
  c.restore();
}

/**
 * THE EYE. Gond faces are mostly eye: a wide almond, a round black iris, and
 * the lid inked heavily over it. They look straight out at you.
 */
export function eye(c, x, y, w, h, look = 0, lid = 0) {
  field(c, (g) => g.ellipse(x, y, w, h, 0, 0, TAU), { fill: G.chuna, lw: 2 });
  c.fillStyle = G.soot;
  c.beginPath(); c.arc(x + look * w * 0.3, y, h * 0.62, 0, TAU); c.fill();
  if (lid > 0.02) {                       // blinking: the lid comes down as a field
    field(c, (g) => {
      g.moveTo(x - w - 1, y - h - 1);
      g.lineTo(x + w + 1, y - h - 1);
      g.lineTo(x + w + 1, y - h + h * 2 * lid);
      g.quadraticCurveTo(x, y - h + h * 2 * lid + h * 0.5, x - w - 1, y - h + h * 2 * lid);
      g.closePath();
    }, { fill: G.skinDark, ink: false });
    c.strokeStyle = G.soot; c.lineWidth = 1.8;
    c.beginPath();
    c.moveTo(x - w, y - h + h * 2 * lid);
    c.quadraticCurveTo(x, y - h + h * 2 * lid + h * 0.5, x + w, y - h + h * 2 * lid);
    c.stroke();
  }
}

// --- the furniture of the world --------------------------------------------------

/** A sun or moon disc with rays, which sits behind or above almost everything. */
export function disc(c, x, y, r, o) {
  const rays = o.rays === undefined ? 16 : o.rays;
  c.strokeStyle = o.ink || G.soot;
  c.lineWidth = o.lw || 2;
  if (rays) {
    c.beginPath();
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * TAU + (o.spin || 0);
      c.moveTo(x + Math.cos(a) * r * 1.08, y + Math.sin(a) * r * 1.08);
      c.lineTo(x + Math.cos(a) * r * (i & 1 ? 1.42 : 1.28), y + Math.sin(a) * r * (i & 1 ? 1.42 : 1.28));
    }
    c.stroke();
  }
  blob(c, x, y, r, r, 0, o);
}

/** A bird: two strokes and a seed. They fill the sky in every Gond painting. */
export function bird(c, x, y, s, o) {
  field(c, (g) => {
    g.moveTo(x - s, y);
    g.quadraticCurveTo(x - s * 0.3, y - s * 0.9, x, y - s * 0.15);
    g.quadraticCurveTo(x + s * 0.3, y - s * 0.9, x + s, y);
    g.quadraticCurveTo(x, y + s * 0.5, x - s, y);
    g.closePath();
  }, { ...o, box: { x: x - s, y: y - s, w: s * 2, h: s * 2 } });
}

/** A fish, for water. */
export function fish(c, x, y, s, o) {
  field(c, (g) => {
    g.moveTo(x - s, y);
    g.quadraticCurveTo(x, y - s * 0.52, x + s * 0.8, y);
    g.quadraticCurveTo(x, y + s * 0.52, x - s, y);
    g.closePath();
    g.moveTo(x - s, y);
    g.lineTo(x - s * 1.45, y - s * 0.38);
    g.lineTo(x - s * 1.45, y + s * 0.38);
    g.closePath();
  }, { ...o, box: { x: x - s * 1.5, y: y - s * 0.6, w: s * 3, h: s * 1.2 } });
}

/**
 * A BAND of pattern, for borders and hems. Gond panels are nearly always edged,
 * the way a digna floor pattern is edged before it is filled.
 */
export function band(c, x, y, w, h, o) {
  field(c, (g) => g.rect(x, y, w, h), { ...o, box: { x, y, w, h } });
}

/** The corner-to-corner border of a panel, with a motif running round it. */
export function frame(c, w, h, m, o) {
  band(c, 0, 0, w, m, o);
  band(c, 0, h - m, w, m, o);
  band(c, 0, m, m, h - m * 2, o);
  band(c, w - m, m, m, h - m * 2, o);
}
