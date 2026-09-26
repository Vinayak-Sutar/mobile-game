// GOND — the drawing grammar, third attempt, and this time the right one.
//
// The two before this failed for one reason, and it is worth being exact about
// it because it is the whole difference between the thing and a pastiche of it.
//
// I was stamping a rectangular grid of dots and clipping it to a silhouette.
// That is a texture behind a cut-out, and the eye reads it instantly as
// wallpaper with a shape punched in it. In an actual Gond painting the marks
// CHASE EACH OTHER ALONG THE FORM - the dots run down the length of a limb, the
// dashes follow the curve of an animal's back, the rings close round a head.
// The infill is not inside the shape, it IS the shape's own motion, and that is
// why a Gond tiger looks like it is breathing and mine looked like lino.
//
// So nothing here is a clip. A form is a parametric patch:
//
//     f(u, v) -> a point, where u runs ALONG the form and v runs ACROSS it
//
// The outline is traced from it, the flat colour is flooded into that outline,
// and then the marks are laid on a grid in (u, v) - which means they follow the
// form automatically, and they are turned to face the way the form is going.
// Bend the spine and the pattern bends with it. That is the whole trick.
//
// The other thing I had wrong was colour. I built the palette out of the
// traditional earth pigments - geru dug from a riverbank, turmeric, soot, lime -
// which is correct history and the wrong picture. The Gond that people actually
// know is Jangarh Kalam, made since the 1980s in ACRYLIC, and it is brilliant:
// bright, unconventional, high-contrast colour on a dark ground, with the infill
// in a lighter tone over it. So the pigments keep their names and get their
// modern brightness.
//
// Pardhan Gond painting belongs to the Gond people of central India, around
// Patangarh in Madhya Pradesh. Jangarh Singh Shyam took it from the mud wall to
// canvas; Durga Bai Vyam, Bhajju Shyam, Venkat Raman Singh Shyam and Ram Singh
// Urveti carried it on. This is an imitation of its grammar by someone outside
// it, and the tradition should be named wherever this art is shown.

const TAU = Math.PI * 2;

/** The pigments: their old names, their acrylic brightness. */
export const G = {
  soot: '#120c12',
  geru: '#e04a2c', geruDark: '#a82a1c',
  haldi: '#f5c02a', haldiPale: '#ffde7a',
  patta: '#52b84a', pattaDark: '#2c7d3c',
  neel: '#2f74d8', neelDark: '#16357e',
  chuna: '#fff3dc',
  mitti: '#a8652c', mittiPale: '#d1924a',
  kesar: '#f5822a',      // saffron orange
  jamun: '#8a45c4',      // the purple of a jamun
  gulabi: '#e0417e',     // the pink that turns up in every modern Gond panel
  hara: '#16a89c',       // a teal green
  skin: '#d08a4c', skinDark: '#a8622c',
  ash: '#7d7368',
  night: '#0e0a10',
};

// --- the marks ------------------------------------------------------------------
//
// Each one is drawn at a point, TURNED TO THE FORM. `a` is the direction the
// form is running at that point, which is what makes a row of them read as one
// moving line rather than a scatter.

const MARK = {
  dot(c, x, y, a, s) { c.beginPath(); c.arc(x, y, s * 0.5, 0, TAU); c.fill(); },
  dash(c, x, y, a, s) {
    c.beginPath();
    c.moveTo(x - Math.cos(a) * s, y - Math.sin(a) * s);
    c.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
    c.stroke();
  },
  tick(c, x, y, a, s) {                       // across the flow, not along it
    const b = a + Math.PI / 2;
    c.beginPath();
    c.moveTo(x - Math.cos(b) * s, y - Math.sin(b) * s);
    c.lineTo(x + Math.cos(b) * s, y + Math.sin(b) * s);
    c.stroke();
  },
  crescent(c, x, y, a, s) {
    c.beginPath();
    c.arc(x, y, s, a - 2.1, a + 2.1);
    c.stroke();
  },
  scale(c, x, y, a, s) {
    c.beginPath();
    c.arc(x, y, s, a + Math.PI * 0.15, a + Math.PI * 0.85);
    c.stroke();
  },
  seed(c, x, y, a, s) {
    c.save(); c.translate(x, y); c.rotate(a);
    c.beginPath();
    c.moveTo(-s, 0);
    c.quadraticCurveTo(0, -s * 0.72, s, 0);
    c.quadraticCurveTo(0, s * 0.72, -s, 0);
    c.fill();
    c.restore();
  },
  eyeDot(c, x, y, a, s) {                     // a dot with a ring round it
    c.beginPath(); c.arc(x, y, s * 0.42, 0, TAU); c.fill();
    c.beginPath(); c.arc(x, y, s * 0.95, 0, TAU); c.stroke();
  },
  shoot(c, x, y, a, s) {
    c.save(); c.translate(x, y); c.rotate(a);
    c.beginPath();
    c.moveTo(0, s); c.lineTo(0, -s * 0.3);
    c.moveTo(0, -s * 0.2); c.quadraticCurveTo(s * 0.7, -s * 0.5, s * 0.45, -s);
    c.moveTo(0, -s * 0.2); c.quadraticCurveTo(-s * 0.7, -s * 0.5, -s * 0.45, -s);
    c.stroke();
    c.restore();
  },
};
const STROKED = { dash: 1, tick: 1, crescent: 1, scale: 1, shoot: 1, eyeDot: 1 };

// --- the one move -----------------------------------------------------------------

/**
 * PAINT A FORM.
 *
 *   F.at(u, v)  a point;  u 0..1 along the form, v -1..1 across it
 *   F.closed    true if u wraps (a head, a disc) rather than running end to end
 *
 * The outline comes from the form, the colour is flooded into it, and the marks
 * are laid out in (u, v) so they run with it. `o.rows` is how many lines of
 * marks across the form, `o.along` how many marks down each line.
 */
export function paint(c, F, o) {
  const N = o.steps || 44;
  const trace = (g) => {
    g.moveTo(...F.at(0, 1));
    for (let i = 1; i <= N; i++) g.lineTo(...F.at(i / N, 1));
    if (F.closed) { g.closePath(); return; }
    for (let i = N; i >= 0; i--) g.lineTo(...F.at(i / N, -1));
    g.closePath();
  };

  c.save();
  if (o.fill) {
    c.beginPath(); trace(c);
    c.fillStyle = o.fill;
    c.fill();
  }

  // A second colour laid ALONG the form, the way a Gond body changes colour
  // down its length rather than across a gradient.
  if (o.fill2) {
    c.save();
    c.beginPath(); trace(c); c.clip();
    c.fillStyle = o.fill2;
    c.beginPath();
    const m = o.band === undefined ? 0.45 : o.band;
    c.moveTo(...F.at(0, m));
    for (let i = 1; i <= N; i++) c.lineTo(...F.at(i / N, m));
    for (let i = N; i >= 0; i--) c.lineTo(...F.at(i / N, F.closed ? 0 : -1));
    c.closePath();
    c.fill();
    c.restore();
  }

  if (o.mark) {
    const rows = o.rows || 3, along = o.along || 16;
    const fn = MARK[o.mark] || MARK.dot;
    const stroked = STROKED[o.mark];
    c.fillStyle = o.on || 'rgba(255,243,220,0.85)';
    c.strokeStyle = o.on || 'rgba(255,243,220,0.85)';
    c.lineWidth = o.mlw || 1.5;
    c.lineCap = 'round';
    const s = o.ms || 2.1;
    const v0 = F.closed ? 0.18 : -0.72, v1 = F.closed ? 0.92 : 0.72;
    for (let r = 0; r < rows; r++) {
      const v = rows === 1 ? (v0 + v1) / 2 : v0 + (v1 - v0) * (r / (rows - 1));
      // Every other line of marks is offset half a step, so they interlock
      // instead of lining up into a grid.
      const off = (r & 1) ? 0.5 / along : 0;
      const n = F.closed ? along : along;
      for (let i = 0; i < n; i++) {
        const u = (i / n + off + (o.phase || 0)) % 1;
        const p = F.at(u, v);
        const q = F.at((u + 0.012) % 1, v);
        const a = Math.atan2(q[1] - p[1], q[0] - p[0]);
        const sz = typeof s === 'function' ? s(u, v) : s;
        fn(c, p[0], p[1], a, sz);
      }
    }
    if (stroked) c.fill?.call(c);   // no-op guard for shape-only marks
  }

  if (o.ink !== false) {
    c.beginPath(); trace(c);
    c.strokeStyle = o.ink || G.soot;
    c.lineWidth = o.lw || 2.6;
    c.lineJoin = 'round';
    c.stroke();
  }
  c.restore();
}

// --- the forms --------------------------------------------------------------------

/** A tapering ribbon down a spine. Arms, roots, branches, tails, braids. */
export function ribbon(spine, w0, w1, bulge) {
  const n = spine.length;
  const pt = (u) => {
    const f = u * (n - 1), i = Math.min(n - 2, Math.floor(f)), k = f - i;
    const a = spine[i], b = spine[i + 1];
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  };
  return {
    closed: false,
    at(u, v) {
      const p = pt(Math.max(0, Math.min(1, u)));
      const q = pt(Math.max(0, Math.min(1, u + 0.02)));
      const dx = q[0] - p[0], dy = q[1] - p[1], d = Math.hypot(dx, dy) || 1;
      let w = w0 + (w1 - w0) * u;
      if (bulge) w *= 1 + bulge * Math.sin(u * Math.PI);
      return [p[0] - (dy / d) * w * v, p[1] + (dx / d) * w * v];
    },
  };
}

/** A closed radial form: a head, a disc, a body. Infill closes in rings. */
export function rosette(cx, cy, rx, ry, wob) {
  return {
    closed: true,
    at(u, v) {
      const a = u * TAU;
      const w = wob ? 1 + wob(a) : 1;
      return [cx + Math.cos(a) * rx * w * v, cy + Math.sin(a) * ry * w * v];
    },
  };
}

/** A leaf, a petal, a fish body: pointed at both ends. */
export function lens(cx, cy, len, wid, rot) {
  const co = Math.cos(rot || 0), si = Math.sin(rot || 0);
  return {
    closed: false,
    at(u, v) {
      const x = -len + 2 * len * u;
      const y = Math.sin(u * Math.PI) * wid * v;
      return [cx + x * co - y * si, cy + x * si + y * co];
    },
  };
}

// --- shorthands, and the old names the rest of the game calls ----------------------

export function blob(c, x, y, rx, ry, rot, o) {
  const F = rot
    ? { closed: true, at: (u, v) => {
      const a = u * TAU, px = Math.cos(a) * rx * v, py = Math.sin(a) * ry * v;
      return [x + px * Math.cos(rot) - py * Math.sin(rot), y + px * Math.sin(rot) + py * Math.cos(rot)];
    } }
    : rosette(x, y, rx, ry);
  paint(c, F, o);
}

export function limb(c, spine, w0, w1, o) {
  paint(c, ribbon(spine, w0, w1), o);
}

export function leaf(c, x, y, len, wid, rot, o) {
  paint(c, lens(x, y, len, wid, rot), { rows: 2, along: 9, ms: 1.6, ...o });
  const co = Math.cos(rot), si = Math.sin(rot);
  c.strokeStyle = o.ink || G.soot;
  c.lineWidth = 1.3;
  c.beginPath();
  c.moveTo(x - len * 0.86 * co, y - len * 0.86 * si);
  c.lineTo(x + len * 0.86 * co, y + len * 0.86 * si);
  c.stroke();
}

/**
 * An arbitrary path, flooded and inked, for the things that are not a ribbon or
 * a rosette. It takes a mark grid in its own bounding box - use it sparingly,
 * because this is the old wallpaper trick and it is only honest on a flat
 * background band, never on a body.
 */
export function field(c, path, o) {
  c.save();
  c.beginPath(); path(c);
  if (o.fill) { c.fillStyle = o.fill; c.fill(); }
  if (o.motif && o.box) {
    c.save(); c.clip();
    motif(c, o.box, o.motif, o.on, o.pitch);
    c.restore();
  }
  if (o.ink !== false) {
    c.strokeStyle = o.ink || G.soot;
    c.lineWidth = o.lw || 2.4;
    c.lineJoin = 'round';
    c.beginPath(); path(c); c.stroke();
  }
  c.restore();
}

/** Straight rows of marks in a box. Only for flat bands and grounds. */
export function motif(c, b, name, col, pitch = 9) {
  const fn = MARK[({ dots: 'dot', dotLines: 'dot', comb: 'dash', dashes: 'dash', scales: 'scale',
    crescents: 'crescent', seeds: 'seed', waves: 'crescent', hatch: 'dash', shoots: 'shoot' })[name] || name] || MARK.dot;
  c.save();
  c.fillStyle = col || 'rgba(255,243,220,0.6)';
  c.strokeStyle = col || 'rgba(255,243,220,0.6)';
  c.lineWidth = 1.4;
  c.lineCap = 'round';
  const s = name === 'dots' || name === 'dotLines' ? 3 : pitch * 0.32;
  for (let y = b.y, row = 0; y < b.y + b.h + pitch; y += pitch, row++) {
    for (let x = b.x + (row & 1 ? pitch / 2 : 0); x < b.x + b.w + pitch; x += pitch) {
      fn(c, x, y, 0, s);
    }
  }
  c.restore();
}

/** The eye: the one feature a Gond face really has. */
export function eye(c, x, y, w, h, look = 0, lid = 0) {
  paint(c, rosette(x, y, w, h), { fill: G.chuna, lw: 2.2, ink: G.soot });
  c.fillStyle = G.soot;
  c.beginPath(); c.arc(x + look * w * 0.28, y, h * 0.6, 0, TAU); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.85)';
  c.beginPath(); c.arc(x + look * w * 0.28 - h * 0.2, y - h * 0.22, h * 0.17, 0, TAU); c.fill();
  if (lid > 0.02) {
    c.save();
    c.beginPath(); c.ellipse(x, y, w + 1.4, h + 1.4, 0, 0, TAU); c.clip();
    c.fillStyle = G.skinDark;
    c.fillRect(x - w - 2, y - h - 2, w * 2 + 4, (h * 2 + 4) * lid);
    c.restore();
    c.strokeStyle = G.soot; c.lineWidth = 1.8;
    c.beginPath();
    c.moveTo(x - w, y - h + h * 2 * lid);
    c.quadraticCurveTo(x, y - h + h * 2 * lid + h * 0.45, x + w, y - h + h * 2 * lid);
    c.stroke();
  }
}

/** A sun or a moon: a ringed disc with rays. */
export function disc(c, x, y, r, o) {
  const rays = o.rays === undefined ? 16 : o.rays;
  if (rays) {
    c.strokeStyle = o.rayCol || o.ink || G.soot;
    c.lineWidth = o.lw || 2;
    c.lineCap = 'round';
    c.beginPath();
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * TAU + (o.spin || 0);
      const l = i & 1 ? 1.44 : 1.24;
      c.moveTo(x + Math.cos(a) * r * 1.04, y + Math.sin(a) * r * 1.04);
      c.lineTo(x + Math.cos(a) * r * l, y + Math.sin(a) * r * l);
      if (!(i & 1)) {
        c.moveTo(x + Math.cos(a) * r * l, y + Math.sin(a) * r * l);
        c.arc(x + Math.cos(a) * r * l, y + Math.sin(a) * r * l, 2.4, 0, TAU);
      }
    }
    c.stroke();
    c.lineCap = 'butt';
  }
  blob(c, x, y, r, r, 0, { rows: 3, along: 26, ms: 2.4, ...o });
}

/** A bird. Two wings and a seed, and they fill the sky of every Gond panel. */
export function bird(c, x, y, s, o) {
  paint(c, lens(x - s * 0.5, y - s * 0.2, s * 0.62, s * 0.5, -0.6), { rows: 1, along: 5, ms: 1.4, ...o });
  paint(c, lens(x + s * 0.5, y - s * 0.2, s * 0.62, s * 0.5, 0.6), { rows: 1, along: 5, ms: 1.4, ...o });
  blob(c, x, y, s * 0.42, s * 0.3, 0, { ...o, rows: 1, along: 6, ms: 1.4 });
  c.fillStyle = o.ink || G.soot;
  c.beginPath(); c.arc(x, y - s * 0.05, s * 0.09, 0, TAU); c.fill();
}

/** A fish, for water. */
export function fish(c, x, y, s, o) {
  paint(c, lens(x, y, s, s * 0.46, 0), { rows: 3, along: 12, ms: 1.8, ...o });
  paint(c, lens(x - s * 1.3, y, s * 0.36, s * 0.38, 0), { rows: 1, along: 4, ms: 1.4, ...o });
  c.fillStyle = G.soot;
  c.beginPath(); c.arc(x + s * 0.5, y - s * 0.06, s * 0.07, 0, TAU); c.fill();
}

export function band(c, x, y, w, h, o) {
  field(c, (g) => g.rect(x, y, w, h), { ...o, box: { x, y, w, h } });
}

export function frame(c, w, h, m, o) {
  band(c, 0, 0, w, m, o);
  band(c, 0, h - m, w, m, o);
  band(c, 0, m, m, h - m * 2, o);
  band(c, w - m, m, m, h - m * 2, o);
}
