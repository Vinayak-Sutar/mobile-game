// THE FACES — built out of flowing forms, not stacked shapes.
//
// Everything here is a ribbon or a rosette (see savi-gond.js), which means the
// pattern runs ALONG each part instead of sitting behind it: dots chasing each
// other down an arm, rings closing round a head, scales following the curve of
// a buffalo's shoulder. Bend the spine and the pattern bends too.
//
// Colour is bright acrylic on near-black, which is what Jangarh Kalam looks
// like, and each figure gets three or four hues that fight rather than blend.
// Nothing is symmetrical: an arm is longer than the other, the hair falls to
// one side, forms lean. Attributes grow out of the figures - Savitri's braid
// becomes a flowering branch, Satyavan's shoulders put out leaves, Yama sits on
// his buffalo - because in this worldview everything is joined to everything.

import { G, paint, ribbon, rosette, lens, blob, limb, leaf, eye, disc, bird, motif } from './savi-gond.js';

const TAU = Math.PI * 2;
const W = 220, H = 300;
export const FACE = { w: W, h: H };

function blinkAt(t, seed) {
  const cycle = 4.6 + seed * 1.7;
  const k = (t + seed * 3.1) % cycle;
  return k < 0.17 ? Math.sin((k / 0.17) * Math.PI) : 0;
}

const GROUND = {
  savitri: '#15071c', satyavan: '#07160e', yama: '#16060c', narada: '#1a0f04', keeper: '#120c0a',
};

export function drawPortrait(ctx, who, x, y, s, t, k = 1, emph = 0) {
  ctx.save();
  ctx.translate(x, y + (1 - k) * 30);
  ctx.scale(s / W, s / W);
  ctx.globalAlpha = k;

  ctx.fillStyle = GROUND[who] || GROUND.keeper;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  motif(ctx, { x: -8, y: -8, w: W + 16, h: H + 16 }, 'dots', 'rgba(255,243,220,0.07)', 13);
  ctx.restore();

  const breath = Math.sin(t * 1.3) * 2.2;
  const lean = emph * emph;
  ctx.translate(W / 2, H);
  ctx.scale(1 + lean * 0.028, 1 + lean * 0.042);
  ctx.rotate(Math.sin(t * 0.7) * 0.009 + lean * 0.014);
  ctx.translate(-W / 2, -H + breath);

  ({ savitri, satyavan, yama, narada }[who] || keeper)(ctx, t, emph);
  ctx.restore();
}

// --- the shared parts -------------------------------------------------------------

/**
 * A head. The rings of the rosette close round it, which is what a Gond face
 * does - the pattern circles the cheek rather than lying across it.
 */
function head(c, cx, cy, rx, ry, skin, on) {
  blob(c, cx, cy, rx, ry, 0, {
    fill: skin, mark: 'dot', on: on || 'rgba(120,45,15,0.3)',
    rows: 4, along: 30, ms: 2.2, lw: 2.6,
  });
}

/** Brows, nose, mouth. Two eyes do most of the work. */
function features(c, cx, cy, sc, t, emph, o = {}) {
  const bl = blinkAt(t, o.seed || 1);
  eye(c, cx - 17 * sc, cy, 13 * sc, 9.5 * sc, Math.sin(t * 0.33) * 0.4, bl);
  eye(c, cx + 17 * sc, cy, 13 * sc, 9.5 * sc, Math.sin(t * 0.33) * 0.4, bl);
  c.strokeStyle = G.soot; c.lineWidth = 2.6 * sc; c.lineCap = 'round';
  c.beginPath();
  c.moveTo(cx - 33 * sc, cy - 14 * sc); c.quadraticCurveTo(cx - 17 * sc, cy - 22 * sc, cx - 3 * sc, cy - 13 * sc);
  c.moveTo(cx + 33 * sc, cy - 14 * sc); c.quadraticCurveTo(cx + 17 * sc, cy - 22 * sc, cx + 3 * sc, cy - 13 * sc);
  c.stroke();
  c.lineWidth = 1.9 * sc;
  c.beginPath();
  c.moveTo(cx - 1 * sc, cy - 4 * sc); c.lineTo(cx - 2.5 * sc, cy + 18 * sc);
  c.quadraticCurveTo(cx + 1.5 * sc, cy + 21 * sc, cx + 5 * sc, cy + 17 * sc);
  c.stroke();
  const open = (o.open || 1.4) + emph * 2.6;
  c.lineWidth = 2.2 * sc;
  c.strokeStyle = o.lip || '#b02a2a';
  c.beginPath();
  c.moveTo(cx - 10 * sc, cy + 30 * sc);
  c.quadraticCurveTo(cx, cy + (30 + open * 2) * sc, cx + 10 * sc, cy + 30 * sc);
  c.stroke();
  c.lineCap = 'butt';
}

function beads(c, x0, y0, x1, y1, n, r, col) {
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0.5 : i / (n - 1);
    const x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k + Math.sin(k * Math.PI) * 5;
    c.fillStyle = col;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.strokeStyle = G.soot; c.lineWidth = 1.1; c.stroke();
  }
}

/** A torso as a ribbon from the hips up to the shoulders: it can lean. */
function torso(c, cx, tilt, o) {
  const spine = [
    [cx + tilt * 10, H + 10], [cx + tilt * 6, 262], [cx + tilt * 2, 224], [cx, 190], [cx - tilt * 3, 168],
  ];
  paint(c, ribbon(spine, 86, 40, 0.06), {
    mark: 'dot', rows: 5, along: 26, ms: 2.4, lw: 2.8, ...o,
  });
}

// --- SAVITRI ----------------------------------------------------------------------

function savitri(c, t, emph) {
  const cx = W / 2 - 4, cy = 108;
  const sway = Math.sin(t * 0.8) * 3;

  disc(c, cx + 6, cy - 12, 72, {
    fill: G.haldi, fill2: G.kesar, band: 0.55,
    mark: 'dot', on: 'rgba(150,40,10,0.5)', rows: 4, along: 34, ms: 2.6,
    rays: 26, spin: t * 0.04, rayCol: G.kesar, lw: 2,
  });

  // The sari: a leaning ribbon of geru with a pink band running up it.
  torso(c, cx, 0.9, {
    fill: G.geru, fill2: G.gulabi, band: 0.2,
    mark: 'dot', on: 'rgba(255,243,220,0.9)', rows: 6, along: 30, ms: 2.4,
  });
  // The pallu, thrown across and over the left shoulder: its own ribbon.
  paint(c, ribbon([[cx - 74, H + 8], [cx - 60, 250], [cx - 34, 208], [cx + 4, 182], [cx + 40, 176]], 26, 12), {
    fill: G.jamun, mark: 'crescent', on: 'rgba(255,222,122,0.9)',
    rows: 3, along: 22, ms: 3.4, mlw: 1.6, lw: 2.4,
  });
  // The hem, as a band of scales running round the bottom.
  paint(c, ribbon([[cx - 92, 288], [cx, 280], [cx + 92, 290]], 12, 12), {
    fill: G.haldi, mark: 'scale', on: 'rgba(160,40,10,0.8)', rows: 2, along: 20, ms: 4, mlw: 1.6, lw: 2.2,
  });

  // Arms: one down, one open. They are not the same length.
  const lift = emph * 9;
  limb(c, [[cx - 40, 196], [cx - 72, 228], [cx - 82, 272]], 10, 7,
    { fill: G.skin, mark: 'dot', on: 'rgba(120,45,15,0.4)', rows: 2, along: 14, ms: 2, lw: 2.2 });
  limb(c, [[cx + 40, 194], [cx + 80, 214 - lift], [cx + 92, 172 - lift]], 10, 7,
    { fill: G.skin, mark: 'dot', on: 'rgba(120,45,15,0.4)', rows: 2, along: 14, ms: 2, lw: 2.2 });
  blob(c, cx + 94, 160 - lift, 13, 16, -0.15,
    { fill: G.skin, mark: 'dot', on: 'rgba(120,45,15,0.4)', rows: 2, along: 12, ms: 1.8, lw: 2.2 });
  beads(c, cx + 74, 204 - lift, cx + 86, 186 - lift, 3, 3.6, G.hara);
  beads(c, cx - 76, 254, cx - 82, 266, 3, 3.6, G.hara);

  limb(c, [[cx, 146], [cx, 184]], 15, 22,
    { fill: G.skinDark, mark: 'dot', on: 'rgba(120,45,15,0.35)', rows: 2, along: 8, ms: 2, lw: 2.2 });
  head(c, cx, cy, 45, 52, G.skin);

  // Hair: a rosette cap of crescents, and a braid that keeps going and flowers.
  paint(c, { closed: false, at: (u, v) => {
    const a = Math.PI + u * Math.PI;
    return [cx + Math.cos(a) * 48 * (0.72 + 0.28 * v), cy + Math.sin(a) * 54 * (0.72 + 0.28 * v) - 6];
  } }, {
    fill: '#160d16', mark: 'crescent', on: 'rgba(224,65,126,0.75)',
    rows: 3, along: 24, ms: 3.6, mlw: 1.6, lw: 2.4,
  });
  paint(c, ribbon([
    [cx + 38, cy + 4], [cx + 66, cy + 48], [cx + 74 + sway, cy + 106], [cx + 58 + sway, cy + 156], [cx + 40 + sway, cy + 186],
  ], 11, 4), {
    fill: '#160d16', mark: 'crescent', on: 'rgba(224,65,126,0.7)', rows: 2, along: 22, ms: 3, mlw: 1.5, lw: 2.2,
  });
  for (let i = 0; i < 5; i++) {                  // the braid puts out leaves
    const yy = cy + 58 + i * 28;
    const s2 = i & 1 ? 1 : -1;
    leaf(c, cx + 78 + sway + s2 * 13, yy, 14, 7, 0.5 * s2 + 0.3, {
      fill: i % 2 ? G.patta : G.hara, mark: 'tick', on: 'rgba(255,243,220,0.8)', rows: 1, along: 6, ms: 2.4, mlw: 1.3, lw: 1.6,
    });
  }
  blob(c, cx + 40 + sway, cy + 196, 9, 9, 0, { fill: G.gulabi, mark: 'dot', on: 'rgba(255,243,220,0.9)', rows: 1, along: 7, ms: 1.8, lw: 1.8 });

  features(c, cx, cy + 2, 1, t, emph, { seed: 1.3, lip: '#c02040' });

  // Ornament.
  c.fillStyle = G.gulabi;
  c.beginPath(); c.arc(cx, cy - 30, 5, 0, TAU); c.fill();
  c.strokeStyle = G.haldi; c.lineWidth = 2.2;
  c.beginPath(); c.arc(cx - 13, cy + 19, 10, -0.5, 2.5); c.stroke();
  blob(c, cx - 48, cy + 15, 9, 13, 0, { fill: G.haldi, mark: 'dot', on: 'rgba(160,40,10,0.6)', rows: 1, along: 8, ms: 1.7, lw: 1.8 });
  blob(c, cx + 48, cy + 15, 9, 13, 0, { fill: G.haldi, mark: 'dot', on: 'rgba(160,40,10,0.6)', rows: 1, along: 8, ms: 1.7, lw: 1.8 });
  beads(c, cx - 36, 172, cx + 36, 172, 11, 4, G.hara);
  beads(c, cx - 26, 188, cx + 26, 188, 8, 3.2, G.haldi);
}

// --- SATYAVAN ---------------------------------------------------------------------

function satyavan(c, t, emph) {
  const cx = W / 2 + 4, cy = 112;
  const sway = Math.sin(t * 0.6) * 0.04;

  // The banyan behind him: he is a year from the forest and a year from the
  // ground, so the tree is drawn first and he stands inside it.
  c.save();
  c.translate(cx - 6, 262); c.rotate(sway * 0.3);
  paint(c, ribbon([[0, 0], [-5, -62], [3, -126]], 16, 8), {
    fill: G.mitti, mark: 'dash', on: 'rgba(255,243,220,0.6)', rows: 3, along: 18, ms: 3.4, mlw: 1.4, lw: 2.4,
  });
  for (let i = 0; i < 7; i++) {
    const a = -2.8 + i * 0.44;
    const ex = Math.cos(a) * 92, ey = -120 + Math.sin(a) * 62;
    paint(c, ribbon([[0, -118], [ex * 0.5, ey * 0.55 - 44], [ex, ey]], 6, 3), {
      fill: G.mitti, mark: 'dot', on: 'rgba(255,243,220,0.5)', rows: 1, along: 10, ms: 1.6, lw: 1.8,
    });
    for (let j = 0; j < 2; j++) {
      const b = a + (j - 0.5) * 0.52;
      leaf(c, ex + Math.cos(b) * 16, ey + Math.sin(b) * 14, 16, 8, b, {
        fill: j ? G.patta : G.hara, mark: 'tick', on: 'rgba(255,243,220,0.8)',
        rows: 1, along: 7, ms: 2.6, mlw: 1.3, lw: 1.6,
      });
    }
  }
  c.restore();

  // Bare chest of shoots, a green dhoti, a saffron sash across it.
  torso(c, cx, -0.8, {
    fill: G.skin, fill2: G.skinDark, band: 0.1,
    mark: 'shoot', on: 'rgba(82,184,74,0.75)', rows: 4, along: 16, ms: 4, mlw: 1.4,
  });
  paint(c, ribbon([[cx - 88, H + 10], [cx, 264], [cx + 88, H + 10]], 26, 26), {
    fill: G.patta, mark: 'dash', on: 'rgba(255,243,220,0.8)', rows: 3, along: 26, ms: 3.2, mlw: 1.5, lw: 2.6,
  });
  paint(c, ribbon([[cx - 66, 192], [cx - 10, 232], [cx + 48, 268]], 11, 11), {
    fill: G.kesar, mark: 'seed', on: 'rgba(60,25,5,0.65)', rows: 2, along: 16, ms: 3, lw: 2.2,
  });

  // Arms: the right one up holding the axe over his shoulder.
  limb(c, [[cx - 40, 198], [cx - 74, 232], [cx - 66, 274]], 11, 7,
    { fill: G.skin, mark: 'dot', on: 'rgba(120,45,15,0.4)', rows: 2, along: 14, ms: 2, lw: 2.2 });
  limb(c, [[cx + 40, 196], [cx + 78, 208], [cx + 72 - emph * 5, 168]], 11, 7,
    { fill: G.skin, mark: 'dot', on: 'rgba(120,45,15,0.4)', rows: 2, along: 14, ms: 2, lw: 2.2 });
  paint(c, ribbon([[cx + 70, 178], [cx + 90, 86]], 5, 4.5), {
    fill: G.mitti, mark: 'dash', on: 'rgba(255,243,220,0.6)', rows: 1, along: 12, ms: 2.6, mlw: 1.3, lw: 2,
  });
  paint(c, lens(cx + 112, 82, 26, 15, -0.5), {
    fill: G.ash, mark: 'scale', on: 'rgba(255,255,255,0.6)', rows: 2, along: 8, ms: 3.2, mlw: 1.4, lw: 2.2,
  });

  limb(c, [[cx, 150], [cx, 188]], 16, 23,
    { fill: G.skinDark, mark: 'dot', on: 'rgba(120,45,15,0.35)', rows: 2, along: 8, ms: 2, lw: 2.2 });
  head(c, cx, cy, 45, 52, G.skin);

  // Hair up in a knot with a leaf through it.
  paint(c, { closed: false, at: (u, v) => {
    const a = Math.PI + u * Math.PI;
    return [cx + Math.cos(a) * 48 * (0.74 + 0.26 * v), cy + Math.sin(a) * 53 * (0.74 + 0.26 * v) - 6];
  } }, {
    fill: '#160f0c', mark: 'seed', on: 'rgba(82,184,74,0.7)', rows: 3, along: 20, ms: 2.6, lw: 2.4,
  });
  blob(c, cx - 4, cy - 68, 21, 17, -0.2, { fill: '#160f0c', mark: 'dash', on: 'rgba(82,184,74,0.6)', rows: 2, along: 12, ms: 2.6, mlw: 1.3, lw: 2.2 });
  leaf(c, cx + 16, cy - 78, 19, 8, -0.55, { fill: G.patta, mark: 'tick', on: 'rgba(255,243,220,0.85)', rows: 1, along: 7, ms: 2.6, mlw: 1.3, lw: 1.6 });

  features(c, cx, cy + 2, 1, t, emph, { seed: 2.1, lip: '#8a3a24' });

  for (let i = 0; i < 4; i++) {                   // leaves out of his shoulders
    const a = -1 - i * 0.34;
    leaf(c, cx - 58 + Math.cos(a) * 26, 188 + Math.sin(a) * 28, 18, 8, a + 0.5, {
      fill: i & 1 ? G.patta : G.hara, mark: 'tick', on: 'rgba(255,243,220,0.8)', rows: 1, along: 7, ms: 2.8, mlw: 1.3, lw: 1.6,
    });
  }
  beads(c, cx - 32, 176, cx + 32, 176, 9, 3.8, G.haldi);
}

// --- YAMA -------------------------------------------------------------------------
//
// Dharmaraja, on his buffalo, with the noose in one hand and the rod in the
// other. The buffalo is drawn as one long form so the scales run round its
// shoulder the way they should.

function yama(c, t, emph) {
  const cx = W / 2;
  const sway = Math.sin(t * 0.55) * 3;
  const by = 252;

  // The buffalo: a single ribbon from one flank, over the shoulders, to the
  // other, so the pattern curves over its back.
  paint(c, ribbon([
    [cx - 118, H + 12], [cx - 96, by - 6], [cx - 40, by - 30], [cx + 40, by - 30], [cx + 96, by - 6], [cx + 118, H + 12],
  ], 22, 22, 0.3), {
    fill: '#2b1c30', fill2: '#3c2742', band: 0.3,
    mark: 'scale', on: 'rgba(110,150,225,0.6)', rows: 3, along: 30, ms: 4.4, mlw: 1.5, lw: 2.8,
  });
  // Its horns, each a tapering ribbon that sweeps out and up.
  for (const sgn of [-1, 1]) {
    paint(c, ribbon([
      [cx + sgn * 42, by - 14], [cx + sgn * 80, by - 34], [cx + sgn * 106, by - 6], [cx + sgn * 98, by + 30],
    ], 14, 3), {
      fill: G.chuna, mark: 'tick', on: 'rgba(60,30,20,0.6)', rows: 1, along: 14, ms: 3.4, mlw: 1.3, lw: 2.4,
    });
  }
  blob(c, cx, by + 12, 44, 32, 0, {
    fill: '#3c2742', mark: 'dot', on: 'rgba(130,165,235,0.5)', rows: 3, along: 22, ms: 2.4, lw: 2.6,
  });
  c.fillStyle = G.chuna;
  c.beginPath(); c.arc(cx - 29, by + 4, 8.5, 0, TAU); c.arc(cx + 29, by + 4, 8.5, 0, TAU); c.fill();
  c.strokeStyle = G.soot; c.lineWidth = 1.8;
  c.beginPath(); c.arc(cx - 29, by + 4, 8.5, 0, TAU); c.stroke();
  c.beginPath(); c.arc(cx + 29, by + 4, 8.5, 0, TAU); c.stroke();
  c.fillStyle = G.soot;
  c.beginPath(); c.arc(cx - 29, by + 4, 3.8, 0, TAU); c.arc(cx + 29, by + 4, 3.8, 0, TAU); c.fill();
  c.beginPath(); c.ellipse(cx - 11, by + 28, 5, 4, 0, 0, TAU); c.ellipse(cx + 11, by + 28, 5, 4, 0, 0, TAU); c.fill();
  c.strokeStyle = G.kesar; c.lineWidth = 3;
  c.beginPath(); c.arc(cx, by + 38, 12, 0, Math.PI); c.stroke();

  // Yama above it.
  const cy = 92;
  disc(c, cx, cy - 6, 68, {
    fill: '#1d0a16', mark: 'scale', on: 'rgba(224,74,44,0.4)', rows: 3, along: 26, ms: 4.4, mlw: 1.4, rays: 0, lw: 2,
  });
  c.strokeStyle = 'rgba(224,74,44,0.55)'; c.lineWidth = 2;
  for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(cx, cy - 6, 74 + i * 11, 0, TAU); c.stroke(); }

  paint(c, ribbon([[cx - 2, by - 20], [cx, 200], [cx + 2, 158]], 76, 44), {
    fill: G.geruDark, fill2: G.geru, band: 0.25,
    mark: 'scale', on: 'rgba(255,222,122,0.65)', rows: 4, along: 22, ms: 4.2, mlw: 1.5, lw: 2.8,
  });
  paint(c, ribbon([[cx - 56, 178], [cx + 56, 178]], 13, 13), {
    fill: G.neelDark, mark: 'dot', on: 'rgba(130,175,255,0.8)', rows: 2, along: 18, ms: 2.2, lw: 2.2,
  });

  // The rod in his right hand, the noose in his left.
  limb(c, [[cx - 44, 178], [cx - 84, 192], [cx - 96, 156 - emph * 6]], 11, 7,
    { fill: '#4e3a68', mark: 'dot', on: 'rgba(150,185,255,0.45)', rows: 2, along: 12, ms: 2, lw: 2.2 });
  paint(c, ribbon([[cx - 96, 150], [cx - 88, 50]], 5.5, 5), {
    fill: G.mitti, mark: 'dash', on: 'rgba(255,222,122,0.7)', rows: 1, along: 14, ms: 2.8, mlw: 1.3, lw: 2,
  });
  blob(c, cx - 88, 42, 12, 12, 0, { fill: G.haldi, mark: 'dot', on: 'rgba(160,40,10,0.6)', rows: 1, along: 9, ms: 1.8, lw: 2 });

  limb(c, [[cx + 44, 178], [cx + 86, 190], [cx + 98, 154 - emph * 6]], 11, 7,
    { fill: '#4e3a68', mark: 'dot', on: 'rgba(150,185,255,0.45)', rows: 2, along: 12, ms: 2, lw: 2.2 });
  c.strokeStyle = G.kesar; c.lineWidth = 3.6;
  c.beginPath();
  c.moveTo(cx + 98, 148);
  c.quadraticCurveTo(cx + 126, 116 + sway, cx + 106, 86 + sway);
  c.stroke();
  paint(c, rosette(cx + 96, 68 + sway, 25, 18), { fill: null, ink: G.kesar, lw: 3.6 });

  limb(c, [[cx, 136], [cx, 172]], 18, 25,
    { fill: '#3e2f56', mark: 'dot', on: 'rgba(150,185,255,0.4)', rows: 2, along: 9, ms: 2, lw: 2.2 });
  head(c, cx, cy, 47, 54, '#4e3a68', 'rgba(150,185,255,0.5)');

  // A crown of five points, scaled, not horns.
  paint(c, { closed: false, at: (u, v) => {
    const a = Math.PI * 1.06 + u * Math.PI * 0.88;
    const spike = 1 + 0.34 * Math.abs(Math.sin(u * Math.PI * 2.5));
    return [cx + Math.cos(a) * 48 * (0.66 + 0.34 * v * spike), cy + Math.sin(a) * 58 * (0.66 + 0.34 * v * spike) - 8];
  } }, {
    fill: G.geru, mark: 'scale', on: 'rgba(255,222,122,0.85)', rows: 2, along: 22, ms: 3.4, mlw: 1.5, lw: 2.4,
  });
  beads(c, cx - 38, cy - 38, cx + 38, cy - 38, 9, 4, G.haldi);

  features(c, cx, cy + 2, 1.06, t, emph, { seed: 2.8, lip: G.kesar, open: 2 });
  c.strokeStyle = G.soot; c.lineWidth = 3.2; c.lineCap = 'round';
  c.beginPath();
  c.moveTo(cx - 18, cy + 25); c.quadraticCurveTo(cx, cy + 21, cx + 18, cy + 25);
  c.moveTo(cx - 18, cy + 25); c.quadraticCurveTo(cx - 28, cy + 27, cx - 30, cy + 17);
  c.moveTo(cx + 18, cy + 25); c.quadraticCurveTo(cx + 28, cy + 27, cx + 30, cy + 17);
  c.stroke();
  c.lineCap = 'butt';
  c.strokeStyle = G.haldi; c.lineWidth = 2.4;
  c.beginPath();
  for (let i = -1; i <= 1; i++) { c.moveTo(cx + i * 10, cy - 42); c.lineTo(cx + i * 10, cy - 30); }
  c.stroke();
  blob(c, cx - 50, cy + 13, 9, 13, 0, { fill: G.haldi, mark: 'dot', on: 'rgba(160,40,10,0.6)', rows: 1, along: 8, ms: 1.7, lw: 1.8 });
  blob(c, cx + 50, cy + 13, 9, 13, 0, { fill: G.haldi, mark: 'dot', on: 'rgba(160,40,10,0.6)', rows: 1, along: 8, ms: 1.7, lw: 1.8 });
}

// --- NARADA -----------------------------------------------------------------------

function narada(c, t, emph) {
  const cx = W / 2 - 2, cy = 112;

  disc(c, cx, cy - 10, 62, {
    fill: 'rgba(245,192,42,0.35)', mark: 'dot', on: 'rgba(255,222,122,0.5)',
    rows: 3, along: 28, ms: 2.2, rays: 14, spin: -t * 0.05, rayCol: G.haldi, lw: 1.8,
  });

  torso(c, cx, -0.5, {
    fill: G.haldi, fill2: G.kesar, band: 0.3,
    mark: 'seed', on: 'rgba(70,35,5,0.6)', rows: 4, along: 20, ms: 3.2,
  });
  paint(c, ribbon([[cx - 88, 292], [cx, 284], [cx + 88, 294]], 13, 13), {
    fill: G.hara, mark: 'crescent', on: 'rgba(255,243,220,0.85)', rows: 2, along: 20, ms: 3.6, mlw: 1.5, lw: 2.2,
  });

  // The veena across him.
  paint(c, ribbon([[cx - 88, 272], [cx + 6, 198], [cx + 90, 136]], 8, 8), {
    fill: G.mitti, mark: 'dash', on: 'rgba(255,243,220,0.7)', rows: 2, along: 22, ms: 3, mlw: 1.4, lw: 2.4,
  });
  blob(c, cx - 90, 276, 27, 27, 0, { fill: G.jamun, mark: 'scale', on: 'rgba(255,222,122,0.7)', rows: 3, along: 18, ms: 3.6, mlw: 1.5, lw: 2.4 });
  blob(c, cx + 94, 130, 17, 17, 0, { fill: G.jamun, mark: 'dot', on: 'rgba(255,222,122,0.7)', rows: 2, along: 12, ms: 2, lw: 2.2 });
  c.strokeStyle = G.chuna; c.lineWidth = 1.1;
  for (let i = -1; i <= 1; i++) {
    c.beginPath(); c.moveTo(cx - 86 + i * 3.5, 270 + i * 3.5); c.lineTo(cx + 90 + i * 3.5, 134 + i * 3.5); c.stroke();
  }

  limb(c, [[cx - 42, 200], [cx - 74, 238], [cx - 60, 272]], 11, 7,
    { fill: G.skin, mark: 'dot', on: 'rgba(120,45,15,0.4)', rows: 2, along: 12, ms: 2, lw: 2.2 });
  limb(c, [[cx + 42, 198], [cx + 76, 184 - emph * 5], [cx + 88, 152 - emph * 5]], 11, 7,
    { fill: G.skin, mark: 'dot', on: 'rgba(120,45,15,0.4)', rows: 2, along: 12, ms: 2, lw: 2.2 });

  limb(c, [[cx, 150], [cx, 186]], 16, 22,
    { fill: G.skinDark, mark: 'dot', on: 'rgba(120,45,15,0.35)', rows: 2, along: 8, ms: 2, lw: 2.2 });
  head(c, cx, cy, 44, 51, G.skin);

  paint(c, { closed: false, at: (u, v) => {
    const a = Math.PI + u * Math.PI;
    return [cx + Math.cos(a) * 47 * (0.74 + 0.26 * v), cy + Math.sin(a) * 52 * (0.74 + 0.26 * v) - 6];
  } }, {
    fill: '#f2ead8', mark: 'dash', on: 'rgba(130,100,60,0.65)', rows: 3, along: 24, ms: 3, mlw: 1.3, lw: 2.4,
  });
  paint(c, ribbon([[cx + 2, cy - 54], [cx + 12, cy - 88]], 7, 3), { fill: '#f2ead8', lw: 2 });

  features(c, cx, cy + 2, 1, t, emph, { seed: 3.4, open: 3.2, lip: '#8a4a24' });
  paint(c, lens(cx, cy + 56, 30, 30, Math.PI / 2), {
    fill: '#f2ead8', mark: 'dash', on: 'rgba(130,100,60,0.6)', rows: 3, along: 14, ms: 3, mlw: 1.3, lw: 2.2,
  });

  for (let i = 0; i < 4; i++) {
    const a = t * 0.45 + i * 1.7;
    bird(c, cx - 70 + i * 16 + Math.cos(a) * 18, 46 + Math.sin(a) * 13, 13, {
      fill: i & 1 ? G.chuna : G.hara, mark: 'dot', on: 'rgba(60,35,10,0.6)', rows: 1, along: 5, ms: 1.6, lw: 1.8,
    });
  }
}

// --- THE KEEPER -------------------------------------------------------------------

function keeper(c, t, emph) {
  const cx = W / 2 + 2, cy = 116;

  disc(c, cx, cy - 10, 58, {
    fill: 'rgba(168,101,44,0.35)', mark: 'dot', on: 'rgba(255,243,220,0.35)', rows: 2, along: 22, ms: 2, rays: 0, lw: 1.8,
  });

  torso(c, cx, 0.6, {
    fill: G.mitti, fill2: '#7a4620', band: 0.25,
    mark: 'dash', on: 'rgba(255,243,220,0.6)', rows: 5, along: 22, ms: 3, mlw: 1.4,
  });
  paint(c, ribbon([[cx - 90, 290], [cx, 282], [cx + 90, 292]], 13, 13), {
    fill: G.geruDark, mark: 'tick', on: 'rgba(255,243,220,0.7)', rows: 2, along: 20, ms: 3.4, mlw: 1.4, lw: 2.2,
  });

  limb(c, [[cx - 42, 200], [cx - 72, 234], [cx - 60, 270]], 11, 7,
    { fill: G.mittiPale, mark: 'dot', on: 'rgba(90,50,20,0.45)', rows: 2, along: 12, ms: 2, lw: 2.2 });
  limb(c, [[cx + 42, 200], [cx + 74, 224], [cx + 66 - emph * 4, 260]], 11, 7,
    { fill: G.mittiPale, mark: 'dot', on: 'rgba(90,50,20,0.45)', rows: 2, along: 12, ms: 2, lw: 2.2 });
  paint(c, ribbon([[cx + 70, 276], [cx + 84, 86]], 5.5, 4.5), {
    fill: G.mitti, mark: 'dash', on: 'rgba(255,243,220,0.55)', rows: 1, along: 20, ms: 2.6, mlw: 1.3, lw: 2,
  });

  limb(c, [[cx, 154], [cx, 190]], 15, 21,
    { fill: '#b07a4e', mark: 'dot', on: 'rgba(90,50,20,0.4)', rows: 2, along: 8, ms: 2, lw: 2.2 });
  head(c, cx, cy, 43, 50, G.mittiPale, 'rgba(90,50,20,0.35)');

  // The shawl drawn up over her head, which is how an old woman wears one.
  paint(c, { closed: false, at: (u, v) => {
    const a = Math.PI * 0.94 + u * Math.PI * 1.12;
    return [cx + Math.cos(a) * 56 * (0.78 + 0.22 * v), cy + Math.sin(a) * 62 * (0.78 + 0.22 * v) + 4];
  } }, {
    fill: G.chuna, mark: 'dash', on: 'rgba(120,80,45,0.6)', rows: 3, along: 26, ms: 3.2, mlw: 1.4, lw: 2.4,
  });

  features(c, cx, cy + 2, 0.96, t, emph, { seed: 4.2, open: 2.4, lip: '#7a4a30' });
  c.strokeStyle = 'rgba(70,40,20,0.55)'; c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(cx - 33, cy + 16); c.quadraticCurveTo(cx - 25, cy + 25, cx - 21, cy + 35);
  c.moveTo(cx + 33, cy + 16); c.quadraticCurveTo(cx + 25, cy + 25, cx + 21, cy + 35);
  c.stroke();
  c.fillStyle = G.geru;
  c.beginPath(); c.arc(cx, cy - 26, 4, 0, TAU); c.fill();
  beads(c, cx - 28, 180, cx + 28, 180, 7, 3.6, G.chuna);
}
