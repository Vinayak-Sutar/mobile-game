
import {
  G, field as gField, blob as gBlob, limb as gLimb, leaf as gLeafShape,
  disc as gDisc, bird as gBird, band as gBand, frame as gFrame, motif as gMotif,
} from './savi-gond.js';
import { img as assetImg, cover as assetCover } from './savi-assets.js';
// Savi — everything that gets drawn.
//
// Flat shapes, warm palette, no images: the same way the rest of this repo
// draws, so it costs nothing to load and scales to any screen. The valley is
// autumn gold going grey at the edges; the Banyan is the one thing in it with
// any weight.

const TAU = Math.PI * 2;
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const mix = (a, b, k) => a + (b - a) * k;
const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/**
 * WHAT THE VALLEY TURNS INTO. The payoff of the whole game used to arrive the
 * same colour as the problem: every tree still autumn gold, which is the exact
 * shade the valley is dying of. These are the greens the Banyan's own canopy
 * blooms in (see drawCanopy), so when the tree comes back the whole valley
 * comes back WITH it rather than standing around it in gold.
 */
export const NEW_LEAF = ['#2f6b2c', '#387a33', '#4d9a3a', '#63b148'];

export const PAL = {
  ink: '#23181b',
  grass: '#6f7a44',
  grassDead: '#5a5646',
  road: '#7b6a4e',
  leaf: ['#d98f3a', '#c96f2e', '#e0ae52', '#a85a2c'],
  snow: '#e6ecf2',
  thorn: '#241c26',
  ash: '#4a4646',
  bark: '#4a3528',
  barkLit: '#6b4c36',
  amber: '#ffb35e',
  cold: '#8fa6c4',
};

// --- the valley floor ---------------------------------------------------------------

/** The bare ground under everything: grass going dead toward the edges. */
export function drawFloor(ctx, V, warmth, time) {
  const g = ctx.createLinearGradient(0, 0, 0, V.h);
  g.addColorStop(0, mixHex('#4c4a42', '#6f7a44', warmth * 0.9));
  g.addColorStop(0.5, mixHex('#585444', '#7c8a4c', warmth));
  g.addColorStop(1, mixHex('#4a4740', '#6a7644', warmth * 0.8));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, V.w, V.h);

  // Patches, so it is not a flat field.
  for (let i = 0; i < 150; i++) {
    const x = rnd(i) * V.w, y = rnd(i * 3 + 1) * V.h, r = 40 + rnd(i * 7) * 130;
    ctx.globalAlpha = 0.06 + rnd(i * 5) * 0.06;
    ctx.fillStyle = rnd(i * 11) < 0.5 ? '#8a9455' : '#40382e';
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.6, rnd(i * 13) * TAU, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // The road up to the tree, worn pale.
  ctx.strokeStyle = 'rgba(150,126,92,0.22)';
  ctx.lineWidth = 132;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(1500, V.h - 60);
  ctx.quadraticCurveTo(1560, 1240, 1500, 900);
  ctx.stroke();
  ctx.lineWidth = 1;
}

// --- the Great Banyan ---------------------------------------------------------------
//
// A banyan is not a tree with a trunk. It is a tree that WALKS: it drops aerial
// roots from its limbs, they touch down, thicken, and become trunks of their
// own, until one tree is a colonnade you can stand inside. That is the whole
// silhouette, and from straight above you would see none of it - only canopy.
//
// So it is drawn in the game's three-quarter view, in four layers back to
// front: the buttress roots spread flat on the ground, the braided main trunk,
// the forest of PROP TRUNKS marching out from under the southern half of the
// canopy with light between them, and the hanging roots that have not reached
// down yet, swaying. The canopy itself is drawn last, over the player's head,
// so she walks under it and among the props.

const PROPS = [];
const LIMBS = [];
const CURTAIN = [];

function banyanBones(T) {
  if (LIMBS.length) return;
  // The framework: heavy limbs curving out and down from the crown. Everything
  // else in a banyan hangs off these.
  for (let i = 0; i < 9; i++) {
    const a0 = (i / 9) * TAU + 0.35;
    const reach = 210 + rnd(i * 5) * 190;
    LIMBS.push({
      a: a0, reach,
      x1: T.x + Math.cos(a0) * reach,
      y1: T.y - 96 + Math.sin(a0) * reach * 0.58,
      mx: T.x + Math.cos(a0) * reach * 0.5,
      my: T.y - 132 + Math.sin(a0) * reach * 0.26,
      w: 24 - (i % 3) * 5,
    });
  }
  // The curtain. This is the whole silhouette of the tree: strands hanging off
  // the limbs, most of them stopping in mid-air, a few reaching the ground and
  // thickening into a trunk of their own.
  for (let i = 0; i < 96; i++) {
    const L = LIMBS[i % LIMBS.length];
    const k = 0.22 + rnd(i * 3) * 0.78;
    const x = T.x + (L.x1 - T.x) * k + (rnd(i * 7) - 0.5) * 34;
    const y = T.y - 96 + (L.y1 - (T.y - 96)) * k + (rnd(i * 11) - 0.5) * 22;
    const ground = T.y + 30 + Math.sin(i) * 26;
    const full = rnd(i * 13) < 0.24;           // this one made it down
    CURTAIN.push({
      x, y,
      len: full ? ground - y : 40 + rnd(i * 17) * 190,
      w: full ? 5 + rnd(i * 19) * 9 : 1.4 + rnd(i * 23) * 3.2,
      full, seed: i,
      front: y > T.y - 130,                     // hangs in front of her, or behind
    });
  }
  for (let i = 0; i < 22; i++) {
    const a0 = rnd(i) * Math.PI + 0.05;
    const r = 110 + rnd(i * 3) * 250;
    PROPS.push({
      x: T.x + Math.cos(a0) * r,
      y: T.y + 30 + Math.sin(a0) * r * 0.6,
      w: 9 + rnd(i * 5) * 21,
      h: 58 + rnd(i * 7) * 70,
      lean: (rnd(i * 11) - 0.5) * 0.28,
      seed: i,
    });
  }
  PROPS.sort((p, q) => p.y - q.y);
}

/** One hanging root: tapering, curved, and swaying at its free end. */
function strand(ctx, c, time, col) {
  const sway = Math.sin(time * 0.7 + c.seed) * (c.full ? 1.4 : 4 + c.len * 0.03);
  ctx.strokeStyle = col;
  ctx.lineWidth = c.w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(c.x, c.y);
  ctx.quadraticCurveTo(c.x + sway * 0.4, c.y + c.len * 0.55, c.x + sway, c.y + c.len);
  ctx.stroke();
  if (!c.full) {                                // a blunt growing tip
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(c.x + sway, c.y + c.len, c.w * 0.85, 0, TAU);
    ctx.fill();
  }
}

/** Buttresses, the braided trunk, the limbs, the back of the curtain, the props. */
export function drawBanyan(ctx, T, bloom, time) {
  banyanBones(T);
  const bark = mixHex('#38281e', '#5e4430', bloom * 0.8);
  const lit = mixHex('#4a3627', '#8a6442', bloom * 0.8);

  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(T.x + 16, T.y + 56, 350, 218, 0, 0, TAU);
  ctx.fill();

  for (let i = 0; i < 18; i++) {                // buttress roots, flat and wide
    const a0 = (i / 18) * TAU + 0.2;
    const r = 150 + rnd(i * 13) * 220;
    ctx.strokeStyle = bark;
    ctx.lineWidth = 11 + rnd(i) * 21;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(T.x, T.y + 20);
    ctx.quadraticCurveTo(T.x + Math.cos(a0) * r * 0.55, T.y + 20 + Math.sin(a0) * r * 0.4,
      T.x + Math.cos(a0) * r, T.y + 24 + Math.sin(a0) * r * 0.66);
    ctx.stroke();
  }

  // The limbs: drawn before the trunk so they appear to leave it.
  for (const L of LIMBS) {
    ctx.strokeStyle = bark;
    ctx.lineWidth = L.w;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(T.x, T.y - 70);
    ctx.quadraticCurveTo(L.mx, L.my, L.x1, L.y1);
    ctx.stroke();
    ctx.strokeStyle = lit;
    ctx.lineWidth = L.w * 0.34;
    ctx.beginPath();
    ctx.moveTo(T.x, T.y - 76);
    ctx.quadraticCurveTo(L.mx, L.my - 5, L.x1, L.y1 - 4);
    ctx.stroke();
  }

  for (const c of CURTAIN) if (!c.front) strand(ctx, c, time, bark);

  // The trunk: many stems fused, with the channels between them.
  for (let i = 0; i < 9; i++) {
    const a0 = (i / 9) * TAU;
    const rr = i ? 34 + rnd(i * 17) * 26 : 0;
    ctx.fillStyle = i % 2 ? bark : lit;
    ctx.beginPath();
    ctx.ellipse(T.x + Math.cos(a0) * rr, T.y + Math.sin(a0) * rr * 0.6, 48 - i * 1.8, 64 - i * 2.2, a0 * 0.3, 0, TAU);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.32)';
  ctx.lineWidth = 3.4;
  for (let i = 0; i < 8; i++) {
    const x = T.x - 52 + i * 15;
    ctx.beginPath();
    ctx.moveTo(x, T.y - 60);
    ctx.quadraticCurveTo(x + (rnd(i) - 0.5) * 24, T.y, x + (rnd(i * 3) - 0.5) * 20, T.y + 48);
    ctx.stroke();
  }

  for (const p of PROPS) {                      // the ones that made it to the ground
    const sway = Math.sin(time * 0.5 + p.seed) * 1.2;
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    ctx.beginPath();
    ctx.ellipse(p.x + 4, p.y + 3, p.w * 0.9, p.w * 0.42, 0, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.lean);
    const g = ctx.createLinearGradient(-p.w / 2, 0, p.w / 2, 0);
    g.addColorStop(0, lit);
    g.addColorStop(0.45, bark);
    g.addColorStop(1, '#241a13');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-p.w * 0.36 + sway, -p.h);
    ctx.quadraticCurveTo(-p.w * 0.5, -p.h * 0.4, -p.w * 0.62, 0);
    ctx.lineTo(p.w * 0.62, 0);
    ctx.quadraticCurveTo(p.w * 0.5, -p.h * 0.4, p.w * 0.36 + sway, -p.h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/** The front of the curtain — she walks inside it — and then the leaves. */
/**
 * THE CROWN, and when the tree comes back it comes back GREEN.
 *
 * The bloom used to arrive in exactly the colours of the problem - the palette
 * was #7d6b33 through #f2c65e, gold on gold, the same dying autumn the whole
 * valley is made of - so the payoff of the game looked like more of the thing
 * it was supposed to be curing. Nothing about it said "alive".
 *
 * So: green, in three depths, reading as one lit mass rather than a scatter of
 * same-coloured blobs. The gold stays, but as LIGHT through the leaves rather
 * than as the leaves, which is what makes green look sunlit instead of flat.
 * Blossom through it, new aerial roots coming down - a banyan coming back puts
 * roots down - and the birds return.
 *
 * `see` fades the crown when she is standing under it, since the shrine, the
 * fire and the keeper are all beneath this thing.
 */
export function drawCanopy(ctx, T, bloom, time, see = 1) {
  banyanBones(T);
  const bark = mixHex('#33241b', '#543c2a', bloom * 0.7);
  for (const c of CURTAIN) if (c.front) strand(ctx, c, time, bark);

  if (bloom <= 0.02) {
    ctx.strokeStyle = 'rgba(44,32,26,0.5)';
    ctx.lineCap = 'round';
    for (let i = 0; i < 30; i++) {
      const a0 = (i / 30) * TAU;
      const r = 200 + rnd(i) * 200;
      ctx.lineWidth = 5 - (i % 3) * 1.2;
      ctx.beginPath();
      ctx.moveTo(T.x, T.y - 96);
      ctx.quadraticCurveTo(T.x + Math.cos(a0) * r * 0.55, T.y - 150 + Math.sin(a0) * r * 0.34,
        T.x + Math.cos(a0) * r, T.y - 110 + Math.sin(a0) * r * 0.58);
      ctx.stroke();
    }
    return;
  }

  // Three depths of green: a dark mass underneath, mid leaf over it, and new
  // growth catching the light on top. Drawn deepest first so the crown builds
  // into one body instead of a ring of separate blobs.
  const LAYERS = [
    { col: ['#20401f', '#27492a'], dy: 118, spread: 1.0, n: 34, size: 92 },
    { col: ['#2f6b2c', '#387a33'], dy: 152, spread: 0.88, n: 28, size: 84 },
    { col: ['#4d9a3a', '#63b148'], dy: 186, spread: 0.7, n: 20, size: 70 },
  ];
  for (let layer = 0; layer < 3; layer++) {
    const L = LAYERS[layer];
    // Still bare at the start of the bloom, so it fills in as she finishes.
    const grown = clamp01((bloom - layer * 0.12) / 0.7);
    if (grown <= 0.01) continue;
    for (let i = 0; i < L.n; i++) {
      const a0 = (i / L.n) * TAU + layer * 0.8 + rnd(i + layer * 31) * 0.5;
      const r = (110 + rnd(i * 3 + layer) * 250) * L.spread;
      const sway = Math.sin(time * 0.55 + i + layer) * (3 + layer);
      const size = (L.size * 0.62 + rnd(i * 5 + layer) * L.size * 0.6) * (0.55 + grown * 0.45);
      ctx.fillStyle = L.col[i & 1];
      ctx.globalAlpha = 0.92 * see;
      ctx.beginPath();
      ctx.ellipse(T.x + Math.cos(a0) * r + sway, T.y - L.dy + Math.sin(a0) * r * 0.55, size, size * 0.72, a0, 0, TAU);
      ctx.fill();
    }
  }

  // Blossom through it, and new figs.
  ctx.globalAlpha = see;
  for (let i = 0; i < 46; i++) {
    const k = clamp01((bloom - 0.25) / 0.6);
    if (k <= 0.01) break;
    const a0 = rnd(i * 7) * TAU, r = (90 + rnd(i * 11) * 270);
    const x = T.x + Math.cos(a0) * r + Math.sin(time * 0.6 + i) * 3;
    const y = T.y - 150 + Math.sin(a0) * r * 0.55 - rnd(i * 5) * 40;
    ctx.fillStyle = i % 5 ? '#eef0d8' : '#d9607a';
    const sz = (2.6 + rnd(i * 3) * 2.6) * k;
    ctx.beginPath(); ctx.arc(x, y, sz, 0, TAU); ctx.fill();
  }

  // New aerial roots coming down out of it, because that is what a banyan does
  // when it is well.
  if (bloom > 0.3) {
    ctx.strokeStyle = `rgba(90,66,40,${(bloom - 0.3) * 0.9 * see})`;
    ctx.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const a0 = rnd(i * 17) * TAU, r = 120 + rnd(i * 23) * 230;
      const x = T.x + Math.cos(a0) * r, y = T.y - 150 + Math.sin(a0) * r * 0.55;
      const len = (40 + rnd(i * 31) * 90) * clamp01((bloom - 0.3) / 0.7);
      ctx.lineWidth = 2 + rnd(i) * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.sin(time * 0.5 + i) * 6, y + len * 0.6, x + Math.sin(time * 0.5 + i) * 9, y + len);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
  // And the gold, as LIGHT coming through the leaves rather than as the leaves.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const lg = ctx.createRadialGradient(T.x - 140, T.y - 250, 20, T.x - 140, T.y - 250, 360);
  lg.addColorStop(0, `rgba(255,228,150,${0.22 * bloom * see})`);
  lg.addColorStop(0.5, `rgba(190,230,140,${0.1 * bloom * see})`);
  lg.addColorStop(1, 'rgba(255,190,110,0)');
  ctx.fillStyle = lg;
  ctx.beginPath();
  ctx.arc(T.x - 140, T.y - 250, 360, 0, TAU);
  ctx.fill();
  ctx.restore();

  // Birds back in it.
  if (bloom > 0.45) {
    const n = Math.round((bloom - 0.45) * 16);
    for (let i = 0; i < n; i++) {
      const a0 = time * 0.24 + i * 1.7;
      const r = 200 + (i % 4) * 60;
      gBird(ctx, T.x + Math.cos(a0) * r, T.y - 300 + Math.sin(a0 * 1.3) * 70 - (i % 3) * 30, 11, {
        fill: i & 1 ? G.chuna : G.kesar, mark: 'dot', on: 'rgba(60,40,20,0.5)',
        rows: 1, along: 5, ms: 1.5, lw: 1.6,
      });
    }
  }
}

/**
 * A young banyan, risen where a Great Root was freed: one slim braided stem,
 * a first aerial root already reaching down, a small crown - and the beat of
 * the legend carved into its bark, which is why it is there.
 */
export function drawYoungTree(ctx, o, time, bloom = 0) {
  const g = clamp01(o.grow), x = o.x, y = o.y;
  const bl = clamp01(bloom);
  if (g <= 0.01) return;
  const h = 128 * g;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(x + 6, y + 6, 46 * g, 20 * g, 0, 0, TAU); ctx.fill();

  for (let i = 0; i < 5; i++) {              // roots gripping the old one
    const a = (i / 5) * TAU + 0.4;
    ctx.strokeStyle = '#4a3323';
    ctx.lineWidth = 7 * g;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y - 6);
    ctx.quadraticCurveTo(x + Math.cos(a) * 26 * g, y + Math.sin(a) * 14 * g, x + Math.cos(a) * 48 * g, y + 6 + Math.sin(a) * 26 * g);
    ctx.stroke();
  }
  const bg = ctx.createLinearGradient(x - 16, 0, x + 16, 0);
  bg.addColorStop(0, '#7b5838');
  bg.addColorStop(0.5, '#523a26');
  bg.addColorStop(1, '#2f2118');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(x - 15 * g, y);
  ctx.quadraticCurveTo(x - 11 * g, y - h * 0.5, x - 9 * g, y - h);
  ctx.lineTo(x + 9 * g, y - h);
  ctx.quadraticCurveTo(x + 11 * g, y - h * 0.5, x + 15 * g, y);
  ctx.closePath();
  ctx.fill();
  // The first aerial root, already on its way down.
  ctx.strokeStyle = '#4a3323';
  ctx.lineWidth = 3.4 * g;
  ctx.beginPath();
  ctx.moveTo(x + 22 * g, y - h * 0.86);
  ctx.quadraticCurveTo(x + 34 * g + Math.sin(time) * 3, y - h * 0.4, x + 30 * g, y - h * 0.06);
  ctx.stroke();

  for (let i = 0; i < 9; i++) {              // its small crown
    const a = (i / 9) * TAU;
    const r = 34 * g;
    const gold = ['#e0a443', '#c8802f', '#f0bf5c'][i % 3];
    ctx.fillStyle = bl < 0.02 ? gold : mixHex(gold, NEW_LEAF[i % NEW_LEAF.length], bl);
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * r + Math.sin(time * 0.7 + i) * 2, y - h - 12 * g + Math.sin(a) * r * 0.6, 26 * g, 20 * g, a, 0, TAU);
    ctx.fill();
  }

  // The carving, lit, on the south face of the stem.
  if (g > 0.75) {
    const k = (g - 0.75) / 0.25;
    ctx.save();
    ctx.globalAlpha = k;
    glow(ctx, x, y - h * 0.55, 92, 'rgba(255,170,80,0.3)');
    ctx.fillStyle = '#1d140f';
    roundRect(ctx, x - 13, y - h * 0.72, 26, h * 0.42, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,196,130,0.85)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,190,120,0.75)';
    for (let i = 0; i < 4; i++) ctx.fillRect(x - 8, y - h * 0.66 + i * (h * 0.09), 16, 2.4);
    ctx.restore();
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** The broom, leaning where it was left. */
export function drawBroom(ctx, o, time) {
  const bob = Math.sin(time * 1.4) * 1.2;
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.beginPath(); ctx.ellipse(o.x + 3, o.y + 3, 13, 5, 0, 0, TAU); ctx.fill();
  ctx.save();
  ctx.translate(o.x, o.y + bob);
  ctx.rotate(-0.42);
  ctx.strokeStyle = '#6b4a2c';
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, -46); ctx.stroke();
  ctx.strokeStyle = '#c8a05a';
  ctx.lineWidth = 1.8;
  for (let i = -4; i <= 4; i++) {
    ctx.beginPath(); ctx.moveTo(i * 0.6, 0); ctx.lineTo(i * 2.6, 15 - Math.abs(i) * 0.8); ctx.stroke();
  }
  ctx.strokeStyle = '#8a5f34';
  ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(-3.4, 0); ctx.lineTo(3.4, 0); ctx.stroke();
  ctx.restore();
  glow(ctx, o.x, o.y - 20, 70, 'rgba(255,190,120,0.16)');
}

/**
 * One Great Root, reaching out from the tree to its trouble.
 *
 * Not a line. A root is a thing that TAPERS and FORKS: it leaves the trunk as
 * thick as a person, wanders, throws off rootlets that go nowhere, swells into
 * knots, and arrives thin. Drawn as a chain of tapering segments with the bark
 * lit along the top, and when it wakes the sap comes back up it in amber.
 */
export function drawRoot(ctx, T, R, woken, time, isCurrent) {
  const pts = rootPath(T, R);
  const n = pts.length;

  // Its shadow on the ground, offset down.
  ctx.save();
  ctx.translate(5, 9);
  ribbon(ctx, pts, 34, 7, 'rgba(0,0,0,0.22)');
  ctx.restore();

  // The rootlets first, so the main root lies over them.
  for (let i = 2; i < n - 1; i++) {
    if ((R.seed + i) % 3) continue;
    const a = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
    for (const side of [-1, 1]) {
      const sp = a + side * (0.8 + rnd(R.seed + i * 3) * 0.7);
      const len = 40 + rnd(R.seed + i * 7) * 90;
      const w = 9 * (1 - i / n) + 3;
      ctx.strokeStyle = woken ? '#5e4129' : '#514d46';
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.quadraticCurveTo(
        pts[i].x + Math.cos(sp) * len * 0.6 + 14, pts[i].y + Math.sin(sp) * len * 0.6,
        pts[i].x + Math.cos(sp + 0.5) * len, pts[i].y + Math.sin(sp + 0.5) * len,
      );
      ctx.stroke();
    }
  }

  // The root, thick at the trunk and thin at the tip.
  ribbon(ctx, pts, 36, 8, woken ? '#6b4a2e' : '#57534b');
  ribbon(ctx, pts, 22, 4, woken ? '#7d5936' : '#615c54', -5);
  // Bark, lit along the upper edge.
  ribbon(ctx, pts, 8, 2, woken ? 'rgba(255,196,130,0.5)' : 'rgba(168,164,156,0.35)', -10);

  // Knots along it.
  for (let i = 1; i < n - 1; i++) {
    if ((R.seed + i * 2) % 4) continue;
    const w = (36 - (36 - 8) * (i / (n - 1))) * 0.62;
    ctx.fillStyle = woken ? '#5b3e26' : '#4c4841';
    ctx.beginPath();
    ctx.ellipse(pts[i].x, pts[i].y, w, w * 0.72, i, 0, TAU);
    ctx.fill();
  }

  // Awake: sap running home, and the knot at the end lit like a coal.
  const tip = pts[n - 1];
  if (woken) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) {
      const f = ((time * 0.2 + R.seed * 0.3 + k / 3) % 1);
      const p = along(pts, 1 - f);
      const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 80);
      g.addColorStop(0, 'rgba(255,175,80,0.5)');
      g.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, 80, 0, TAU); ctx.fill();
    }
    ctx.restore();
    glow(ctx, tip.x, tip.y, 170, `rgba(255,168,72,${0.26 + Math.sin(time * 1.6 + R.seed) * 0.06})`);
  }

  // The one the tree is reaching with: a coal under ash, all the way out, so
  // there is never a question about which root the valley wants next.
  if (!woken && isCurrent) {
    const pulse = 0.2 + Math.sin(time * 1.9) * 0.08;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ribbon(ctx, pts, 14, 4, `rgba(255,150,60,${pulse})`, -6);
    ctx.restore();
    const run = along(pts, (time * 0.24) % 1);
    glow(ctx, run.x, run.y, 60, 'rgba(255,160,70,0.30)');
  }

  // The knot at the tip, where the mural is cut.
  ctx.fillStyle = woken ? '#7a5533' : isCurrent ? '#5d5548' : '#4a4a52';
  ctx.beginPath();
  ctx.ellipse(tip.x, tip.y, 52, 38, 0, 0, TAU);
  ctx.fill();
  if (!woken && !isCurrent) {                 // rimed over: not this one, not yet
    ctx.fillStyle = 'rgba(214,230,246,0.5)';
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9;
      ctx.beginPath();
      ctx.ellipse(tip.x + Math.cos(a) * 26, tip.y + Math.sin(a) * 18, 9, 5, a, 0, TAU);
      ctx.fill();
    }
  }
  ctx.strokeStyle = woken ? 'rgba(255,196,130,0.9)' : 'rgba(126,122,116,0.7)';
  ctx.lineWidth = 3.5;
  ctx.stroke();
  for (let i = 0; i < 5; i++) {           // rings in the cut face
    ctx.strokeStyle = woken ? `rgba(255,190,120,${0.3 - i * 0.05})` : `rgba(140,136,130,${0.24 - i * 0.04})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(tip.x, tip.y, 46 - i * 9, 33 - i * 6.5, 0, 0, TAU);
    ctx.stroke();
  }
}

/** A tapering band down a path. `w0` at the trunk, `w1` at the tip. */
function ribbon(ctx, pts, w0, w1, fill, lift = 0) {
  const n = pts.length;
  const side = (sgn) => {
    for (let i = 0; i < n; i++) {
      const k = sgn > 0 ? i : n - 1 - i;
      const p = pts[k];
      const a = pts[Math.min(n - 1, k + 1)], b = pts[Math.max(0, k - 1)];
      const ang = Math.atan2(a.y - b.y, a.x - b.x) + Math.PI / 2;
      const w = (w0 + (w1 - w0) * (k / (n - 1))) / 2;
      const x = p.x + Math.cos(ang) * w * sgn, y = p.y + Math.sin(ang) * w * sgn + lift;
      if (i === 0 && sgn > 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  };
  ctx.beginPath();
  side(1); side(-1);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** The wandering line a root takes from the trunk out to its tip. */
export function rootPath(T, R) {
  if (R._pts) return R._pts;
  const to = R.at || R;
  const n = 11, out = [];
  const dx = to.x - T.x, dy = to.y - T.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    // Two waves of different lengths, so it wanders instead of bowing.
    const bend = Math.sin(k * Math.PI) * 190 * (rnd(R.seed) - 0.5)
      + Math.sin(k * Math.PI * 2.7 + R.seed) * 62
      + Math.sin(k * Math.PI * 5.3 + R.seed * 2) * 20;
    out.push({ x: T.x + dx * k + nx * bend, y: T.y + dy * k + ny * bend });
  }
  R._pts = out;
  return out;
}

function along(pts, k) {
  const f = clamp01(k) * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(f)), u = f - i;
  return { x: mix(pts[i].x, pts[i + 1].x, u), y: mix(pts[i].y, pts[i + 1].y, u) };
}

// --- the valley's own trees and stones ---------------------------------------------------

/** An autumn tree from above: a trunk and a few overlapping crowns. */
export function drawTree(ctx, o, time, warmth, bloom = 0) {
  const bl = clamp01(bloom);
  const s = o.s, x = o.x, y = o.y;
  const sway = Math.sin(time * 0.6 + o.seed) * 2.4 * s;
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.beginPath();
  ctx.ellipse(x + 8 * s, y + 8 * s, 34 * s, 16 * s, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#3d2c20';
  ctx.beginPath();
  ctx.moveTo(x - 6 * s, y);
  ctx.lineTo(x - 4 * s, y - 26 * s);
  ctx.lineTo(x + 4 * s, y - 26 * s);
  ctx.lineTo(x + 6 * s, y);
  ctx.closePath();
  ctx.fill();
  if (o.dead) {
    // The bare ones: the trees standing over the ash and over the snow. They
    // have been sticks for two winters and they stay sticks for the whole
    // game - and then the Banyan blooms and THEY COME BACK TOO, which is the
    // one that will actually be noticed, because those two are the ground she
    // had to burn and thaw to reach.
    const tip = [];
    ctx.strokeStyle = mixHex('#3d3229', '#54402c', bl);
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * 0.42;
      const ex = x + Math.cos(a) * 44 * s + sway, ey = y - 52 * s + Math.sin(a) * 12 * s;
      ctx.lineWidth = 4.5 * s;
      ctx.beginPath();
      ctx.moveTo(x, y - 22 * s);
      ctx.quadraticCurveTo(x + Math.cos(a) * 24 * s, y - 42 * s, ex, ey);
      ctx.stroke();
      tip.push([ex, ey, a]);
    }
    if (bl > 0.02) {
      for (let i = 0; i < tip.length; i++) {
        const [ex, ey, a] = tip[i];
        ctx.fillStyle = NEW_LEAF[(o.seed + i) % NEW_LEAF.length];
        const r = (7 + rnd(o.seed + i) * 7) * s * bl;
        ctx.beginPath();
        ctx.ellipse(ex, ey, r * 1.5, r, a, 0, TAU);
        ctx.fill();
        // A second clump back along the branch, so it is a tree leafing out
        // and not six pom-poms on six sticks.
        ctx.beginPath();
        ctx.ellipse((x + ex) / 2 + Math.cos(a) * 4 * s, (y - 30 * s + ey) / 2, r * 1.1, r * 0.8, a, 0, TAU);
        ctx.fill();
      }
    }
    return;
  }
  // Autumn until the tree remembers, then new leaf. mixHex per channel rather
  // than a swap, so the whole valley turns in one movement over the ending.
  const gold = warmth > 0.55
    ? ['#d98f2f', '#e8b148', '#c46c25', '#f0c65e']
    : ['#8f7a3a', '#a8893c', '#7a6330', '#bd9a45'];
  const hues = bl < 0.02 ? gold : gold.map((c, i) => mixHex(c, NEW_LEAF[i], bl));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + o.seed;
    const r = (26 + rnd(o.seed + i) * 16) * s;
    ctx.fillStyle = hues[(o.seed + i) % hues.length];
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * 17 * s + sway, y - 34 * s + Math.sin(a) * 11 * s, r, r * 0.8, a, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = `rgba(255,${230 + bl * 18},${180 + bl * 40},0.14)`;
  ctx.beginPath();
  ctx.ellipse(x - 12 * s + sway, y - 46 * s, 22 * s, 14 * s, 0, 0, TAU);
  ctx.fill();
  // And blossom on it at the very end, the same as the Banyan's.
  if (bl > 0.55) {
    ctx.fillStyle = `rgba(255,236,242,${(bl - 0.55) * 1.6})`;
    for (let i = 0; i < 7; i++) {
      const a = rnd(o.seed * 3 + i) * TAU;
      const d = (10 + rnd(o.seed + i * 5) * 26) * s;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * d + sway, y - 36 * s + Math.sin(a) * d * 0.7, 1.7 * s, 0, TAU);
      ctx.fill();
    }
  }
}

/** A stone, and its own small shadow. */
export function drawRock(ctx, o, time, warmth) {
  const s = o.s, x = o.x, y = o.y;
  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.beginPath(); ctx.ellipse(x + 4 * s, y + 4 * s, 20 * s, 10 * s, 0, 0, TAU); ctx.fill();
  for (let i = 0; i < 3; i++) {
    const a = o.seed + i * 2.1;
    ctx.fillStyle = ['#6a655e', '#7b756c', '#57524c'][i];
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * 6 * s, y - 4 * s + Math.sin(a) * 4 * s, (16 - i * 3) * s, (12 - i * 2.4) * s, a, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,240,210,0.16)';
  ctx.beginPath(); ctx.ellipse(x - 5 * s, y - 9 * s, 8 * s, 4.4 * s, -0.4, 0, TAU); ctx.fill();
}

/** The cold standing over a root the valley is not ready for. */
export function drawVeil(ctx, at, time) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(at.x, at.y, 40, at.x, at.y, 300);
  g.addColorStop(0, 'rgba(150,180,225,0.05)');
  g.addColorStop(0.72, 'rgba(120,155,205,0.16)');
  g.addColorStop(1, 'rgba(90,120,170,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(at.x, at.y, 300, 0, TAU); ctx.fill();
  ctx.restore();
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU + time * 0.16 * (i % 2 ? 1 : -1);
    const r = 210 + Math.sin(time * 0.8 + i) * 52;
    ctx.globalAlpha = 0.16 + Math.sin(time + i) * 0.07;
    ctx.strokeStyle = '#cfe0f2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(at.x, at.y, r, a, a + 0.34);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}


/**
 * The shrine at the foot of the Banyan: a low stone platform with steps up to
 * it, an oil lamp at each corner and a bell on a post. Someone kept this once.
 * The lamps are dead until the courtyard is swept, and then they are not.
 */
export function drawShrine(ctx, S, time, lit) {
  const x = S.x, y = S.y;
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.beginPath(); ctx.ellipse(x + 8, y + 16, 286, 132, 0, 0, TAU); ctx.fill();

  // The platform, and a course of stone round its edge.
  ctx.fillStyle = '#8d8272';
  ctx.beginPath(); ctx.ellipse(x, y, 272, 124, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#7a705f';
  ctx.beginPath(); ctx.ellipse(x, y - 8, 262, 116, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(52,44,34,0.5)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(x, y - 8, 262, 116, 0, 0, TAU); ctx.stroke();
  // Flagstones, so it is paving and not a disc.
  ctx.strokeStyle = 'rgba(52,44,34,0.24)'; ctx.lineWidth = 1.8;
  for (let i = -5; i <= 5; i++) {
    ctx.beginPath(); ctx.moveTo(x + i * 46, y - 112); ctx.lineTo(x + i * 46, y + 102); ctx.stroke();
  }
  for (let j = -2; j <= 2; j++) {
    ctx.beginPath(); ctx.ellipse(x, y - 8, 262 - Math.abs(j) * 52, 116 - Math.abs(j) * 26, 0, 0, TAU); ctx.stroke();
  }

  // Three steps up, on the side she comes from.
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = ['#9b907e', '#8d8272', '#7f7565'][i];
    ctx.beginPath();
    ctx.ellipse(x, y + 104 + i * 13, 128 - i * 16, 22 - i * 3, 0, 0, Math.PI);
    ctx.fill();
  }

  // A lamp at each corner, and the bell.
  const lamps = [[-224, -48], [224, -48], [-150, 86], [150, 86]];
  for (const [dx, dy] of lamps) {
    const lx = x + dx, ly = y + dy;
    ctx.fillStyle = '#6e6454';
    ctx.beginPath(); ctx.ellipse(lx, ly, 13, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#857a67';
    ctx.fillRect(lx - 4, ly - 26, 8, 26);
    ctx.fillStyle = '#9a8f79';
    ctx.beginPath(); ctx.ellipse(lx, ly - 29, 11, 6, 0, 0, TAU); ctx.fill();
    if (lit > 0.02) {
      const f = 0.8 + Math.sin(time * 6 + dx) * 0.16;
      glow(ctx, lx, ly - 32, 96 * lit * f, `rgba(255,158,70,${0.42 * lit})`);
      ctx.fillStyle = `rgba(255,206,130,${lit * f})`;
      ctx.beginPath(); ctx.ellipse(lx, ly - 34, 4, 7 * f, 0, 0, TAU); ctx.fill();
    }
  }
  const bx = x + 250, by = y + 30;
  ctx.strokeStyle = '#6a5a44'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by - 74); ctx.lineTo(bx - 34, by - 74); ctx.stroke();
  ctx.fillStyle = lit > 0.5 ? '#c9a24a' : '#8b8272';
  ctx.beginPath();
  ctx.moveTo(bx - 44, by - 64);
  ctx.quadraticCurveTo(bx - 46, by - 42, bx - 34, by - 38);
  ctx.lineTo(bx - 14, by - 38);
  ctx.quadraticCurveTo(bx - 22, by - 42, bx - 24, by - 64);
  ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(bx - 29, by - 33, 3.4, 0, TAU); ctx.fill();
}

/**
 * The torana over the road where she comes in: two carved posts and a lintel,
 * leaning a little, with a bell on a chain and the last of its marigolds. It
 * says "someone used to come here" before a word is spoken.
 */
export function drawGate(ctx, G, time, warmth) {
  const x = G.x, y = G.y;
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.beginPath(); ctx.ellipse(x, y + 10, 150, 26, 0, 0, TAU); ctx.fill();

  for (const side of [-1, 1]) {
    const px = x + side * 116, lean = side * 0.035;
    ctx.save();
    ctx.translate(px, y);
    ctx.rotate(lean);
    ctx.fillStyle = '#7b6a52';
    ctx.fillRect(-15, -128, 30, 128);
    ctx.fillStyle = '#8d7c62';
    ctx.fillRect(-15, -128, 11, 128);
    ctx.fillStyle = '#5f5340';                       // carved bands
    for (let i = 0; i < 4; i++) ctx.fillRect(-17, -112 + i * 30, 34, 6);
    ctx.fillStyle = '#6d5f49';
    ctx.fillRect(-21, -4, 42, 10);
    ctx.restore();
  }
  ctx.fillStyle = '#7b6a52';                          // the lintel, sagging
  ctx.beginPath();
  ctx.moveTo(x - 132, y - 128);
  ctx.quadraticCurveTo(x, y - 116, x + 132, y - 128);
  ctx.lineTo(x + 132, y - 150);
  ctx.quadraticCurveTo(x, y - 138, x - 132, y - 150);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#8d7c62';
  ctx.beginPath();
  ctx.moveTo(x - 132, y - 150);
  ctx.quadraticCurveTo(x, y - 138, x + 132, y - 150);
  ctx.lineTo(x + 132, y - 156);
  ctx.quadraticCurveTo(x, y - 144, x - 132, y - 156);
  ctx.closePath();
  ctx.fill();

  // A string of marigolds, most of them gone brown.
  for (let i = 0; i < 15; i++) {
    const k = i / 14;
    const mx = x - 120 + k * 240;
    const my = y - 124 + Math.sin(k * Math.PI) * 22 + Math.sin(time * 0.7 + i) * 1.4;
    const fresh = warmth > 0.5 && i % 3 === 0;
    ctx.fillStyle = fresh ? '#e8a32a' : '#8a6a34';
    ctx.beginPath(); ctx.arc(mx, my, fresh ? 5 : 4, 0, TAU); ctx.fill();
  }
  // And a bell on a chain in the middle.
  const bx = x, by = y - 116 + Math.sin(time * 0.9) * 0.8;
  ctx.strokeStyle = '#5a5040'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(bx, y - 122); ctx.lineTo(bx, by + 4); ctx.stroke();
  ctx.fillStyle = warmth > 0.5 ? '#c9a24a' : '#867c6a';
  ctx.beginPath();
  ctx.moveTo(bx - 9, by + 4);
  ctx.quadraticCurveTo(bx - 10, by + 20, bx - 6, by + 24);
  ctx.lineTo(bx + 6, by + 24);
  ctx.quadraticCurveTo(bx + 10, by + 20, bx + 9, by + 4);
  ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(bx, by + 27, 2.6, 0, TAU); ctx.fill();
}

// --- Savi ----------------------------------------------------------------------------

/**
 * A little girl in a warm shawl, seen from above and a little behind. Drawn by
 * hand rather than borrowed from the knight: she has to read as a child.
 */
export function drawSavi(ctx, p, time) {
  const a = p.face;
  const walking = p.speed > 12;
  const ph = p.phase;
  const bob = walking ? Math.sin(ph * 2) * 1.6 : Math.sin(time * 1.6) * 0.7;
  const fx = Math.cos(a), fy = Math.sin(a);
  const away = fy < -0.25;                 // facing away from the camera

  // How high off the ground she is. The shadow stays behind on the ground and
  // shrinks, which is the only thing that says "in the air" from straight above.
  const z = p.z || 0;

  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${0.3 - Math.min(0.16, z * 0.0042)})`;
  ctx.beginPath();
  ctx.ellipse(p.x + 1, p.y + 5, 12 - Math.min(4.5, z * 0.1), 5 - Math.min(2, z * 0.045), 0, 0, TAU);
  ctx.fill();
  ctx.translate(p.x, p.y + bob - z);

  // Boots, stepping.
  const st = walking ? Math.sin(ph) * 5 : 0;
  ctx.fillStyle = '#3a2b22';
  ctx.beginPath(); ctx.ellipse(-4.5 + fx * st * 0.5, 1 + st * 0.5, 3.6, 4.4, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(4.5 - fx * st * 0.5, 1 - st * 0.5, 3.6, 4.4, 0, 0, TAU); ctx.fill();

  // Skirt, swaying with the step.
  const sway = walking ? Math.sin(ph) * 2.2 : 0;
  ctx.fillStyle = '#7b4b52';
  ctx.beginPath();
  ctx.moveTo(-6.5, -10);
  ctx.quadraticCurveTo(-10 + sway, -2, -8.5 + sway, 2.5);
  ctx.lineTo(8.5 + sway, 2.5);
  ctx.quadraticCurveTo(10 + sway, -2, 6.5, -10);
  ctx.closePath();
  ctx.fill();

  // The shawl: a warm triangle over her shoulders, the one bright thing out here.
  ctx.fillStyle = '#d8702f';
  ctx.beginPath();
  ctx.moveTo(-9, -20);
  ctx.quadraticCurveTo(-11.5, -11, -7.5, -6);
  ctx.lineTo(7.5, -6);
  ctx.quadraticCurveTo(11.5, -11, 9, -20);
  ctx.quadraticCurveTo(0, -23, -9, -20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.13)';
  ctx.beginPath();
  ctx.moveTo(1, -21); ctx.lineTo(9, -20);
  ctx.quadraticCurveTo(11.5, -11, 7.5, -6); ctx.lineTo(1, -6);
  ctx.closePath();
  ctx.fill();
  // Its fringe.
  ctx.strokeStyle = '#efb76a';
  ctx.lineWidth = 1.1;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 2.6, -6);
    ctx.lineTo(i * 2.6 + sway * 0.4, -3.4);
    ctx.stroke();
  }

  // The broom. On her back when she is walking; across her, sweeping, when she
  // is working. A child with a jhadu is the most ordinary thing in a village,
  // and it is exactly what clearing a drift of leaves IS.
  const sweeping = (p.act || 0) > 0;
  if (p.broom) {
  ctx.save();
  if (sweeping) {
    const sw = p.sweep || 0;
    ctx.translate(Math.cos(a) * 9, Math.sin(a) * 6 - 8);
    ctx.rotate(a + sw * 0.72 - Math.PI / 2);   // twigs forward, not the handle
  } else {
    ctx.translate(-fx * 3, -12);
    ctx.rotate(-0.72);
  }
  ctx.strokeStyle = '#6b4a2c';                 // the handle
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, sweeping ? -14 : -13);
  ctx.lineTo(0, sweeping ? 16 : 15);
  ctx.stroke();
  ctx.strokeStyle = '#c8a05a';                 // the twigs
  ctx.lineWidth = 1.5;
  for (let i = -4; i <= 4; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 0.5, sweeping ? 13 : 12);
    ctx.lineTo(i * 1.9, (sweeping ? 24 : 22) + Math.abs(i) * -0.5);
    ctx.stroke();
  }
  ctx.strokeStyle = '#8a5f34';                 // the binding
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-2.6, sweeping ? 12 : 11);
  ctx.lineTo(2.6, sweeping ? 12 : 11);
  ctx.stroke();
  ctx.restore();
  }

  // Her braid hangs BEHIND her, and which side of the head that is depends on
  // which way she is facing. Coming toward the camera it is on the far side, so
  // it has to be drawn before the head - drawn after, it lay across her face,
  // which is exactly what it was doing.
  const swing = walking ? Math.sin(ph) * 1.7 : Math.sin(time * 1.2) * 0.7;
  const toward = clamp01((fy + 1) / 2);        // 0 facing away, 1 facing us
  const tipX = -fx * 8.5 + swing;
  const tipY = mix(-12, -33, toward);          // down her back, or up behind her
  const braid = () => {
    ctx.strokeStyle = '#2a1c18';
    ctx.lineWidth = 3.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-fx * 3, -27.5);
    ctx.quadraticCurveTo(tipX * 0.55, (tipY - 27.5) * 0.45 - 27.5 + 6, tipX, tipY);
    ctx.stroke();
    ctx.fillStyle = '#c94f6d';                 // the thread tied at the end
    ctx.beginPath(); ctx.arc(tipX, tipY, 1.9, 0, TAU); ctx.fill();
  };
  if (!away) braid();

  // Head and hair. The face IS the head - a full dark circle behind a SMALLER
  // face ellipse left a ring of dark showing below her chin all the way round,
  // which is exactly the beard it looked like. The hair is a cap on top now.
  const hx = fx * 0.9;
  if (away) {
    ctx.fillStyle = '#2a1c18';
    ctx.beginPath(); ctx.ellipse(0, -25.4, 7, 7.3, 0, 0, TAU); ctx.fill();
  } else {
    ctx.fillStyle = '#d9a06e';
    ctx.beginPath(); ctx.ellipse(hx, -25.2, 6.5, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a1c18';                 // the cap, over the crown only
    ctx.beginPath();
    ctx.ellipse(hx, -25.2, 6.8, 7.2, 0, Math.PI, TAU);
    ctx.quadraticCurveTo(hx + 3.2, -27.4, hx + 0.4, -28.4);
    ctx.quadraticCurveTo(hx - 3.4, -27.2, hx - 6.8, -25.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1b120f';
    ctx.fillRect(hx - 2.9, -25.2, 1.6, 2);
    ctx.fillRect(hx + 1.3, -25.2, 1.6, 2);
  }
  if (away) braid();                           // her back is to us: it is in front

  // THE LAMP. She has been carrying it since the second root as a flag on a
  // state object and nothing else - no lamp, no coal, just a patch of glow on
  // the ground and some sparks. It is the tool three of the five roots are
  // cleared with, so it ought to be a thing you can see in her hand.
  //
  // It is a small hanging lantern: a brass bowl on a wire hoop with the COAL
  // sitting in it. The coal is the fuel and it burns down - `p.ember` runs 1
  // to 0 - so the lamp tells you how much heat is left without the HUD.
  if (p.lamp) {
    const em = clamp01(p.ember || 0);
    const out = (p.act || 0) > 0;
    // WHICH HAND, ON THE SCREEN. She is a billboard sprite seen from three
    // quarters, so the hand has to be found in SCREEN space, not by taking the
    // perpendicular of her facing in the world. The perpendicular is correct
    // on the ground and useless here: turned to face left or right it points
    // straight up the screen, and the lamp ends up hanging in the middle of
    // her ribs. In profile it goes on her leading side; face on or away, it
    // hangs on her left, and it swings against her stride.
    const side = Math.abs(fx) > 0.3 ? (fx > 0 ? 1 : -1) : -1;
    const swg = walking ? Math.sin(ph) * 1.9 : Math.sin(time * 1.1) * 0.7;
    const hx = out ? fx * 16 : side * 9.5 + fx * 2 + swg;
    const hy = out ? fy * 9 - 15 : -12.5 + fy * 1.5 + (walking ? Math.abs(Math.sin(ph)) * 1.2 : 0);
    // Her arm, so the lamp is being held rather than floating beside her.
    ctx.strokeStyle = '#c08a5a';
    ctx.lineWidth = 2.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(side * 5.5, -16);
    ctx.quadraticCurveTo((side * 5.5 + hx) / 2 + side * 1.6, (-16 + hy) / 2, hx, hy);
    ctx.stroke();
    // The hoop it hangs from. Drawn in soot as well as brass, because at the
    // size she is on a phone a gold line on a gold skirt is nothing at all -
    // everything else in this valley is outlined and so is this.
    ctx.strokeStyle = '#2a2018';
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(hx, hy + 3.6, 5, Math.PI * 1.04, Math.PI * 1.96); ctx.stroke();
    ctx.strokeStyle = '#9a8656';
    ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.arc(hx, hy + 3.6, 5, Math.PI * 1.04, Math.PI * 1.96); ctx.stroke();
    // The bowl: shallow brass, a rim, and the light of the coal caught on it.
    const lit = 0.25 + em * 0.75;
    ctx.fillStyle = mixHex('#6b5836', '#d7a24a', lit);
    ctx.beginPath();
    ctx.moveTo(hx - 5.6, hy + 3.4);
    ctx.quadraticCurveTo(hx, hy + 12, hx + 5.6, hy + 3.4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#2a2018';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.strokeStyle = mixHex('#4a3c26', '#f0c473', lit);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(hx - 6, hy + 3.4); ctx.lineTo(hx + 6, hy + 3.4); ctx.stroke();
    // The coal in it. Gold while it is full, a dull red ember near the end,
    // and a black cinder when it has gone out.
    if (em > 0.005) {
      const flick = 0.82 + Math.sin(time * 9.1 + p.x) * 0.12 + Math.sin(time * 4.3) * 0.06;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(hx, hy + 4, 0, hx, hy + 4, (11 + em * 16) * flick);
      g.addColorStop(0, `rgba(255,214,150,${0.5 * (0.35 + em * 0.65)})`);
      g.addColorStop(0.4, `rgba(255,150,60,${0.26 * (0.3 + em * 0.7)})`);
      g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(hx, hy + 4, (11 + em * 16) * flick, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.fillStyle = mixHex('#7e2410', '#ffd07a', em * flick);
      ctx.beginPath(); ctx.ellipse(hx, hy + 4.4, 3.4, 2.4, 0, 0, TAU); ctx.fill();
    } else {
      ctx.fillStyle = '#2a2320';
      ctx.beginPath(); ctx.ellipse(hx, hy + 4.4, 3.2, 2.2, 0, 0, TAU); ctx.fill();
    }
    // The pierced lid over it, so it is a lamp and not a cup of fire.
    ctx.fillStyle = mixHex('#5d4e33', '#a98a52', lit);
    ctx.beginPath();
    ctx.moveTo(hx - 6, hy + 3.4);
    ctx.quadraticCurveTo(hx, hy - 3.2, hx + 6, hy + 3.4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#2a2018';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.fillStyle = `rgba(255,190,110,${0.25 + em * 0.6})`;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.arc(hx + i * 2.9, hy + 1.4 - Math.abs(i) * 0.7, 0.85, 0, TAU); ctx.fill();
    }
  }
  ctx.restore();
}

/**
 * THE BREATH OF THE LAMP - the fire she holds out at the thorn.
 *
 * This is Ashfall's Dragon's Breath (see spells.js): a translucent wedge along
 * the aim with a stream of embers running down it. Two things are different
 * here. It comes out of a lamp rather than a mouth, so there is a hot flare at
 * the lamp's lip and the tongues of flame LEAVE from there and lie down onto
 * the ground. And the wedge is drawn from `o`, which is the SAME object the
 * carve reads its reach and arc from - so the fire can never be drawn over
 * ground it does not clear, which would read as a bug the first time a thorn
 * just inside the glow refused to move.
 *
 * Snow gets the same cone in white-blue: a plume of steam, not a plume of fire.
 */
export function drawBreath(ctx, p, o, time) {
  const a = p.face, fx = Math.cos(a), fy = Math.sin(a);
  const ox = p.x, oy = p.y + 6;              // exactly where carve() starts
  const half = o.arc / 2;
  const cold = !!o.steam;
  const fl = 0.88 + Math.sin(time * 19.7) * 0.09 + Math.sin(time * 33.1) * 0.05;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Three wedges stacked: a wide dim breath, an orange body, and a narrow
  // white core at the mouth. Each breathes on its own clock, which is the
  // whole difference between fire and a coloured triangle.
  const LAY = cold
    ? [[1, 1, 'rgba(140,200,225,'], [0.72, 0.78, 'rgba(200,232,244,'], [0.4, 0.46, 'rgba(255,255,255,']]
    : [[1, 1, 'rgba(255,104,38,'], [0.7, 0.76, 'rgba(255,164,58,'], [0.38, 0.44, 'rgba(255,240,196,']];
  const ALPHA = cold ? [0.15, 0.18, 0.22] : [0.16, 0.2, 0.25];
  for (let i = 0; i < 3; i++) {
    const r = o.reach * LAY[i][0] * (0.92 + Math.sin(time * (13 + i * 6)) * 0.06) * fl;
    // EACH WEDGE FADES IN FROM THE ORIGIN rather than being a flat triangle of
    // colour. Flat, it was brightest right where she is standing and it
    // swallowed her whole - she disappeared inside her own fire. Fading in
    // also happens to be the truth of it: the origin is her feet, because that
    // is where the carve starts, but the fire is coming out of a lamp held at
    // her chest and only reaches the ground a little way in front of her.
    // The near stop is a FIXED THIRTY-FOUR PIXELS, not a fraction of the
    // reach - she is the same height whichever of the three she is burning,
    // and on the thorn's short reach a fraction put full brightness across
    // her shoulders.
    const near = Math.min(0.5, 34 / r);
    const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
    g.addColorStop(0, `${LAY[i][2]}0)`);
    g.addColorStop(near * 0.5, `${LAY[i][2]}${(ALPHA[i] * 0.16).toFixed(3)})`);
    g.addColorStop(near, `${LAY[i][2]}${(ALPHA[i] * 0.5).toFixed(3)})`);
    g.addColorStop(0.78, `${LAY[i][2]}${ALPHA[i]})`);
    g.addColorStop(1, `${LAY[i][2]}${(ALPHA[i] * 0.3).toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.arc(ox, oy, r, a - half * LAY[i][1], a + half * LAY[i][1]);
    ctx.closePath();
    ctx.fill();
  }

  // The lamp's lip, where it all leaves from.
  const z = p.z || 0;
  const mx = p.x + fx * 16, my = p.y - 15 + fy * 9 - z + 4;
  // Small, and not very strong. A big bright disc here sat exactly on her head
  // whenever she faced away from the camera and rubbed her out of her own
  // picture; what is wanted is a lamp that is clearly alight, not a flashbulb.
  const fr = 15 * fl;
  const fg = ctx.createRadialGradient(mx, my, 0, mx, my, fr);
  fg.addColorStop(0, 'rgba(255,248,214,0.52)');
  fg.addColorStop(0.42, cold ? 'rgba(190,228,246,0.24)' : 'rgba(255,148,52,0.26)');
  fg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fg;
  ctx.beginPath(); ctx.arc(mx, my, fr, 0, TAU); ctx.fill();

  // And the tongues, leaving the lip and lying down along the ground.
  ctx.lineCap = 'round';
  for (let k = 0; k < 7; k++) {
    const ph = k * 1.73 + time * 5.5;
    const ta = a + Math.sin(ph) * half * 0.82;
    const len = o.reach * (0.44 + ((Math.sin(ph * 1.7) + 1) / 2) * 0.56);
    const ex = ox + Math.cos(ta) * len, ey = oy + Math.sin(ta) * len;
    const bx = (mx + ex) / 2 + Math.sin(ph * 2.3) * 8;
    const by = (my + ey) / 2 + Math.cos(ph * 2.1) * 8;
    const j = k % 3;
    ctx.strokeStyle = cold
      ? `rgba(${210 + j * 15},${236 + j * 6},250,${0.09 + j * 0.05})`
      : `rgba(255,${148 + j * 44},${52 + j * 56},${0.12 + j * 0.05})`;
    ctx.lineWidth = 6.4 - j * 1.9;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.quadraticCurveTo(bx, by, ex, ey);
    ctx.stroke();
  }
  ctx.restore();

  // The light it throws on what it is burning.
  glow(ctx, ox + fx * o.reach * 0.4, oy + fy * o.reach * 0.4, o.reach * 1.5,
    cold ? 'rgba(170,215,240,0.16)' : 'rgba(255,150,60,0.22)');
}

// --- the Old Woman and her fire ------------------------------------------------------

/**
 * THE KEEPER, and she is the woman in the dialogue box.
 *
 * She used to be a grey-purple hood on a grey-purple blanket, which is nobody.
 * The painted portrait the interaction box shows - ASSETS/keeper-speaking.png -
 * is a specific woman: a BROWN SARI DRAWN OVER HER HEAD, a red pallu with
 * orange dots and a white edge running down both sides of her face, a cream
 * blouse stitched in rings, a red waistband, white hair at the crown, and the
 * heavy brows every Gond face is drawn with.
 *
 * So that is what sits by the fire now, in the pigments of savi-gond.js, and
 * the red of the pallu is what makes her findable from right across the
 * valley. She sits cross-legged, she breathes, and she turns her face toward
 * Savi when Savi comes near (`o.look`, -1 to 1).
 */
export function drawWoman(ctx, o, time) {
  const x = o.x, y = o.y;
  const breath = Math.sin(time * 0.9) * 0.8;       // she is alive, barely
  const look = clamp01((o.look === undefined ? 0 : o.look) * 0.5 + 0.5) * 2 - 1;
  const lx = look * 2.2;

  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(x + 2, y + 5, 19, 7.5, 0, 0, TAU); ctx.fill();

  // --- the sari, worn as one piece from the knees to over the head ---------
  // Her lap first: sitting cross-legged is a wide low triangle, not a cylinder.
  ctx.fillStyle = '#8a5426';                        // mitti, in shadow
  ctx.beginPath();
  ctx.moveTo(x - 19, y + 4);
  ctx.quadraticCurveTo(x, y - 2, x + 19, y + 4);
  ctx.quadraticCurveTo(x + 14, y + 8, x, y + 8);
  ctx.quadraticCurveTo(x - 14, y + 8, x - 19, y + 4);
  ctx.closePath();
  ctx.fill();
  // The body of the drape, up to the shoulders.
  ctx.fillStyle = '#a8652c';                        // mitti
  ctx.beginPath();
  ctx.moveTo(x - 18, y + 5);
  ctx.quadraticCurveTo(x - 15, y - 14, x - 11, y - 24 + breath);
  ctx.lineTo(x + 11, y - 24 + breath);
  ctx.quadraticCurveTo(x + 15, y - 14, x + 18, y + 5);
  ctx.closePath();
  ctx.fill();
  // The weave, which is what a Gond panel would fill it with.
  ctx.strokeStyle = 'rgba(64,34,14,0.3)';
  ctx.lineWidth = 0.8;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * 4.6, y - 21 + breath);
    ctx.quadraticCurveTo(x + i * 5.6, y - 8, x + i * 6.4, y + 4);
    ctx.stroke();
  }

  // --- the blouse, stitched in rings --------------------------------------
  ctx.fillStyle = '#fff3dc';                        // chuna
  ctx.beginPath();
  ctx.ellipse(x, y - 13 + breath, 9.5, 8.5, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,108,70,0.34)';
  ctx.lineWidth = 0.6;
  for (let i = 1; i <= 2; i++) {
    ctx.beginPath();
    ctx.ellipse(x, y - 13 + breath, 2.8 * i, 2.4 * i, 0, 0, TAU);
    ctx.stroke();
  }
  // --- the waistband: red with its row of dots ----------------------------
  ctx.fillStyle = '#e04a2c';                        // geru
  ctx.beginPath();
  ctx.moveTo(x - 10.5, y - 6 + breath);
  ctx.quadraticCurveTo(x, y - 3.4 + breath, x + 10.5, y - 6 + breath);
  ctx.lineTo(x + 10.5, y - 2.4 + breath);
  ctx.quadraticCurveTo(x, y + 0.2 + breath, x - 10.5, y - 2.4 + breath);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#f5c02a';                        // haldi
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath(); ctx.arc(x + i * 2.9, y - 3.6 + breath + Math.abs(i) * 0.22, 0.7, 0, TAU); ctx.fill();
  }

  // --- her arms, hands folded in her lap ----------------------------------
  // The sleeves are the DARKER brown. Drawn in the same brown as the drape
  // they were invisible against it, which is why she had no arms at all.
  ctx.strokeStyle = '#74441d';
  ctx.lineWidth = 5.2;
  ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + s * 9, y - 17 + breath);
    ctx.quadraticCurveTo(x + s * 14, y - 10 + breath, x + s * 9.5, y - 4.5 + breath);
    ctx.stroke();
  }
  ctx.strokeStyle = '#fff3dc';                      // the cuff
  ctx.lineWidth = 1.6;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + s * 11.4, y - 6.6 + breath);
    ctx.lineTo(x + s * 7.8, y - 5 + breath);
    ctx.stroke();
  }
  ctx.strokeStyle = '#b5763f';                      // skin, the forearms
  ctx.lineWidth = 3.6;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + s * 9, y - 5 + breath);
    ctx.quadraticCurveTo(x + s * 6, y - 1 + breath, x + s * 1.6, y - 1.2 + breath);
    ctx.stroke();
  }
  ctx.fillStyle = '#c08a52';
  ctx.beginPath(); ctx.ellipse(x, y - 1 + breath, 3.4, 2.4, 0, 0, TAU); ctx.fill();

  // --- the head, with the sari over it ------------------------------------
  const hy = y - 30 + breath;
  ctx.fillStyle = '#8a5426';                        // the drape, behind
  ctx.beginPath();
  ctx.moveTo(x - 12, y - 19);
  ctx.quadraticCurveTo(x - 13.5, hy - 10, x, hy - 11.5);
  ctx.quadraticCurveTo(x + 13.5, hy - 10, x + 12, y - 19);
  ctx.closePath();
  ctx.fill();
  // The face.
  ctx.fillStyle = '#c08a52';                        // skin
  ctx.beginPath(); ctx.ellipse(x + lx, hy, 6.4, 7.4, 0, 0, TAU); ctx.fill();
  // White hair, parted, showing under the drape across her forehead. It goes
  // on TOP of the face, not behind it - behind it, nothing of it showed.
  ctx.fillStyle = '#ece4d8';
  ctx.beginPath();
  ctx.moveTo(x + lx - 6.2, hy - 2.6);
  ctx.quadraticCurveTo(x + lx, hy - 9.4, x + lx + 6.2, hy - 2.6);
  ctx.quadraticCurveTo(x + lx, hy - 5.4, x + lx - 6.2, hy - 2.6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(150,140,126,0.55)';
  ctx.lineWidth = 0.5;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(x + lx + i * 1.1, hy - 7.4 + Math.abs(i) * 0.9);
    ctx.lineTo(x + lx + i * 2.3, hy - 3.6 + Math.abs(i) * 0.3);
    ctx.stroke();
  }
  // Brows ABOVE the eyes with daylight between them. They used to sit a
  // millimetre off the pupils and the two ran together into a pair of goggles.
  ctx.strokeStyle = '#2a1a10';
  ctx.lineWidth = 0.95;
  ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + lx + s * 0.9, hy - 2.5);
    ctx.quadraticCurveTo(x + lx + s * 2.6, hy - 3.5, x + lx + s * 4.1, hy - 2.3);
    ctx.stroke();
  }
  // And the eyes the way a Gond face draws them: a white almond with a black
  // iris sitting in it, not a black dot.
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#fff3dc';
    ctx.beginPath(); ctx.ellipse(x + lx + s * 2.5, hy - 0.2, 2, 1.45, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#120c12';
    ctx.beginPath(); ctx.arc(x + lx + s * 2.5 + lx * 0.25, hy - 0.2, 1.05, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#3b291c';
    ctx.lineWidth = 0.45;
    ctx.beginPath(); ctx.ellipse(x + lx + s * 2.5, hy - 0.2, 2, 1.45, 0, 0, TAU); ctx.stroke();
  }
  ctx.strokeStyle = '#8a5a34';                      // the lines two winters put there
  ctx.lineWidth = 0.7;
  ctx.beginPath(); ctx.moveTo(x + lx - 1.6, hy + 3.2); ctx.quadraticCurveTo(x + lx, hy + 4, x + lx + 1.6, hy + 3.2); ctx.stroke();

  // --- THE PALLU. Red, dotted, white-edged, down both sides of her face ---
  // This is the detail the portrait is recognisable by, and it is what makes
  // her findable from across the valley without a marker over her head.
  for (const s of [-1, 1]) {
    ctx.strokeStyle = '#fff3dc';                    // the white edge
    ctx.lineWidth = 5.4;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(x + s * 11.5, y - 18);
    ctx.quadraticCurveTo(x + s * 11.2, hy - 6, x + s * 3.4, hy - 9.6);
    ctx.stroke();
    ctx.strokeStyle = '#e04a2c';                    // geru
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(x + s * 11.5, y - 18);
    ctx.quadraticCurveTo(x + s * 11.2, hy - 6, x + s * 3.4, hy - 9.6);
    ctx.stroke();
    ctx.fillStyle = '#f5c02a';                      // haldi, the dots on it
    for (let i = 0; i <= 5; i++) {
      const u = i / 5, v = 1 - u;
      const px = v * v * (x + s * 11.5) + 2 * v * u * (x + s * 11.2) + u * u * (x + s * 3.4);
      const py = v * v * (y - 18) + 2 * v * u * (hy - 6) + u * u * (hy - 9.6);
      ctx.beginPath(); ctx.arc(px, py, 0.75, 0, TAU); ctx.fill();
    }
  }
  ctx.lineCap = 'round';

  // The fire is on her east side and always has been, so it is on that side of
  // her that the light lands.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(x - 6, 0, x + 20, 0);
  g.addColorStop(0, 'rgba(255,150,60,0)');
  g.addColorStop(1, `rgba(255,150,60,${0.1 + Math.sin(time * 7.1) * 0.02})`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - 18, y + 5);
  ctx.quadraticCurveTo(x - 15, y - 16, x, hy - 11);
  ctx.quadraticCurveTo(x + 15, y - 16, x + 18, y + 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawFire(ctx, f, time, alive = 1) {
  if (alive <= 0.02) return;
  const flick = 0.78 + Math.sin(time * 8.3) * 0.13 + Math.sin(time * 3.7) * 0.09;
  glow(ctx, f.x, f.y - 6, 150 * alive * flick, `rgba(255,150,60,${0.4 * alive})`);
  ctx.fillStyle = '#3a2a20';
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.rotate(a);
    ctx.fillRect(-11, -2, 22, 4);
    ctx.restore();
  }
  ctx.fillStyle = `rgba(255,164,72,${alive * flick})`;
  ctx.beginPath(); ctx.ellipse(f.x, f.y - 8, 7, 12 * flick, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = `rgba(255,240,190,${alive * flick})`;
  ctx.beginPath(); ctx.ellipse(f.x, f.y - 6, 3.2, 6 * flick, 0, 0, TAU); ctx.fill();
}

export function glow(ctx, x, y, r, col) {
  const g = ctx.createRadialGradient(x, y, r * 0.03, x, y, r);
  g.addColorStop(0, col);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// --- the murals -----------------------------------------------------------------------
//
// One panel per root, drawn into the overlay: flat silhouettes, warm on cold,
// the same language as the game's own opening film.

export function drawMural(ctx, id, W, H, time) {
  // The painted panel, if it is here. These are bhittichitra proportions with
  // their own digna border already on them, so they fill the frame edge to edge
  // and the drawn border below would only fight with it.
  const painted = assetImg(`mural-${id}`);
  if (painted) { assetCover(ctx, painted, 0, 0, W, H); return; }

  // A GOND PANEL. Flat ground colour, a border band of pattern round the edge
  // the way a digna floor is edged before it is filled, and inside it the beat
  // of the legend told in outlined, infilled shapes. No perspective, no
  // modelling, no depth - the figures stand on the same line and the story is
  // read across, which is how these panels are read.
  ctx.save();
  ctx.fillStyle = '#efe0c0';                       // the wall, limed
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.5;
  gMotif(ctx, { x: 0, y: 0, w: W, h: H }, 'dots', 'rgba(140,105,60,0.35)', 13);
  ctx.globalAlpha = 1;

  const m = Math.max(7, Math.round(Math.min(W, H) * 0.035));
  gFrame(ctx, W, H, m, { fill: G.geru, motif: 'crescents', on: 'rgba(245,225,190,0.8)', pitch: 11, lw: 2 });

  const S = Math.min((W - m * 2) / 430, (H - m * 2) / 250);
  ctx.save();
  ctx.translate(W / 2, H * 0.54);
  ctx.scale(S, S);

  const ground = () => {
    gBand(ctx, -215, 86, 430, 16, { fill: G.mitti, motif: 'waves', on: 'rgba(245,225,190,0.55)', pitch: 7, lw: 2 });
  };
  const sun = (x, y, r) => gDisc(ctx, x, y, r, {
    fill: G.haldi, motif: 'dots', on: 'rgba(120,60,20,0.45)', pitch: 10, rays: 18, spin: time * 0.04, lw: 1.8,
  });

  if (id === 'choice') {
    // She chooses him, and is told he has a year. Narada at the edge of it.
    sun(-150, -66, 26);
    ground();
    gFigure(ctx, -66, 0, 1, 'savitri', time);
    gFigure(ctx, 42, 0, 1, 'satyavan', time);
    gFigure(ctx, 146, 4, 0.82, 'narada', time);
    // The garland she puts on him: a chain of seeds between them.
    ctx.strokeStyle = G.geru; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(-40, -18); ctx.quadraticCurveTo(-4, 6, 22, -18); ctx.stroke();
    for (let i = 0; i < 7; i++) {
      const k = i / 6, x = -40 + k * 62, y = -18 + Math.sin(k * Math.PI) * 22;
      ctx.fillStyle = i % 2 ? G.haldi : G.chuna;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, TAU); ctx.fill();
    }
  } else if (id === 'fall') {
    // The year is up. He lies down in the forest with his head in her lap.
    gTree(ctx, -120, 10, 1.15, time);
    gTree(ctx, 150, 6, 0.9, time);
    ground();
    gFigure(ctx, -30, 0, 1, 'savitri', time, { kneel: 1 });
    ctx.save();
    ctx.translate(58, 62); ctx.rotate(-1.42);
    gFigure(ctx, 0, 0, 0.94, 'satyavan', time, { lying: 1 });
    ctx.restore();
    // The axe, put down.
    gLimb(ctx, [[96, 78], [124, 70]], 3, 3, { fill: G.mitti, ink: true });
  } else if (id === 'pursuit') {
    // Yama takes him south, and she will not stop walking.
    ground();
    gFigure(ctx, 96, -6, 1.24, 'yama', time);
    gFigure(ctx, -104, 2, 0.98, 'savitri', time, { walk: 1 });
    // The soul on the noose: a small bright seed drawn along behind him.
    ctx.strokeStyle = G.geru; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(52, -14); ctx.lineTo(-4, 2); ctx.stroke();
    gBlob(ctx, -10, 4, 11, 11, 0, { fill: G.haldiPale, motif: 'dots', on: 'rgba(140,70,20,0.5)', pitch: 6, lw: 2 });
    for (let i = 0; i < 5; i++) {
      gBird(ctx, -170 + i * 26, -72 + (i % 2) * 14, 8,
        { fill: G.soot, motif: null, lw: 1.6 });
    }
  } else if (id === 'steps') {
    // Seven steps, and after seven steps you are friends. So he keeps talking.
    ground();
    gFigure(ctx, 78, -4, 1.2, 'yama', time);
    gFigure(ctx, -96, 2, 0.98, 'savitri', time, { walk: 1 });
    // The seven footprints, as seeds pressed into the road.
    for (let i = 0; i < 7; i++) {
      const x = -60 + i * 20;
      ctx.fillStyle = i % 2 ? G.geru : G.mitti;
      ctx.beginPath();
      ctx.ellipse(x, 92 + (i % 2) * 6, 5, 7, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = G.soot; ctx.lineWidth = 1.2; ctx.stroke();
    }
  } else if (id === 'boon') {
    // Ask for anything but his life. So she asks for sons by Satyavan.
    ground();
    gFigure(ctx, 86, -4, 1.2, 'yama', time, { giving: 1 });
    gFigure(ctx, -92, 2, 0.98, 'savitri', time);
    // The boon passing between them: a run of dots that becomes a sun.
    for (let i = 0; i < 9; i++) {
      const k = i / 8, x = 34 - k * 96, y = -22 - Math.sin(k * Math.PI) * 18;
      ctx.fillStyle = G.haldi;
      ctx.beginPath(); ctx.arc(x, y, 2 + k * 2.6, 0, TAU); ctx.fill();
    }
    sun(-92, -74, 20);
  } else if (id === 'bloom') {
    // The tree remembers all of it at once.
    sun(0, -78, 34);
    ground();
    gTree(ctx, 0, 14, 1.9, time);
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * TAU + time * 0.05;
      const r = 58 + ((i * 37) % 11) * 7;
      gLeafShape(ctx, Math.cos(a) * r, -26 + Math.sin(a) * r * 0.62, 11, 6, a,
        { fill: i % 3 ? G.patta : G.haldi, motif: null, lw: 1.4 });
    }
    gFigure(ctx, -118, 6, 0.9, 'savitri', time);
    gFigure(ctx, -54, 6, 0.9, 'satyavan', time);
  }
  ctx.restore();
  ctx.restore();
}

/** A Gond figure at mural scale: the same grammar as the portraits, smaller. */
function gFigure(ctx, x, y, s, who, time, o = {}) {
  const P = {
    savitri: { cloth: G.geru, motif: 'dotLines', on: 'rgba(245,225,190,0.8)', hair: '#160f12' },
    satyavan: { cloth: G.patta, motif: 'shoots', on: 'rgba(240,235,200,0.6)', hair: '#1a1410' },
    narada: { cloth: G.haldi, motif: 'seeds', on: 'rgba(70,40,20,0.5)', hair: '#efe7d6' },
    yama: { cloth: G.neelDark, motif: 'scales', on: 'rgba(150,180,235,0.5)', hair: '#0d0912' },
  }[who] || { cloth: G.mitti, motif: 'comb', on: 'rgba(240,227,200,0.5)', hair: '#ded6c6' };
  const big = who === 'yama';
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  if (o.lying) ctx.scale(1, 0.92);

  const hy = o.kneel ? -18 : -52;
  const foot = 86;
  // Body: one field, hem to shoulder.
  gField(ctx, (g) => {
    const w = big ? 40 : 30, wl = big ? 34 : 24;
    g.moveTo(-w, foot);
    g.quadraticCurveTo(-wl - 4, hy + 34, -wl, hy + 22);
    g.lineTo(wl, hy + 22);
    g.quadraticCurveTo(wl + 4, hy + 34, w, foot);
    g.closePath();
  }, { fill: P.cloth, motif: P.motif, on: P.on, pitch: big ? 11 : 9, lw: 2, box: { x: -46, y: hy, w: 92, h: foot - hy + 6 } });

  // Arms.
  const reach = o.giving ? 44 : o.walk ? 20 : 26;
  gLimb(ctx, [[-22, hy + 28], [-34, hy + 52], [-30 - (o.walk ? 8 : 0), hy + 74]], 5, 4,
    { fill: G.skin, motif: null, lw: 1.8 });
  gLimb(ctx, [[22, hy + 28], [30, hy + 46], [18 + reach, hy + 52]], 5, 4,
    { fill: G.skin, motif: null, lw: 1.8 });
  // Legs, if she is walking.
  if (o.walk) {
    gLimb(ctx, [[-8, foot - 6], [-20, foot + 14]], 5, 4, { fill: G.skin, lw: 1.8 });
    gLimb(ctx, [[10, foot - 6], [24, foot + 14]], 5, 4, { fill: G.skin, lw: 1.8 });
  }
  // Head.
  gBlob(ctx, 0, hy, big ? 24 : 20, big ? 26 : 22, 0,
    { fill: big ? '#4a3f63' : G.skin, motif: big ? 'dots' : null, on: 'rgba(150,180,235,0.35)', pitch: 9, lw: 2 });
  gField(ctx, (g) => {
    g.moveTo(-20, hy - 2);
    g.quadraticCurveTo(-22, hy - 28, 0, hy - 28);
    g.quadraticCurveTo(22, hy - 28, 20, hy - 2);
    g.quadraticCurveTo(12, hy - 14, 0, hy - 14);
    g.quadraticCurveTo(-12, hy - 14, -20, hy - 2);
    g.closePath();
  }, { fill: P.hair, motif: 'crescents', on: 'rgba(210,190,220,0.4)', pitch: 7, lw: 1.6, box: { x: -24, y: hy - 30, w: 48, h: 34 } });
  // Two eyes and a mouth, and that is a face.
  ctx.fillStyle = G.chuna;
  ctx.beginPath(); ctx.arc(-7, hy, 4.4, 0, TAU); ctx.arc(7, hy, 4.4, 0, TAU); ctx.fill();
  ctx.fillStyle = G.soot;
  ctx.beginPath(); ctx.arc(-7, hy, 2.2, 0, TAU); ctx.arc(7, hy, 2.2, 0, TAU); ctx.fill();
  ctx.strokeStyle = G.soot; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(0, hy + 5); ctx.lineTo(0, hy + 10); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-5, hy + 14); ctx.quadraticCurveTo(0, hy + 17, 5, hy + 14); ctx.stroke();

  if (big) {
    for (const sgn of [-1, 1]) {
      gLimb(ctx, [[sgn * 20, hy - 16], [sgn * 38, hy - 26], [sgn * 47, hy - 10]], 6, 2,
        { fill: G.chuna, motif: null, lw: 1.8 });
    }
  }
  if (who === 'savitri') {
    gLimb(ctx, [[18, hy - 4], [28, hy + 20], [24, hy + 52]], 5, 3,
      { fill: P.hair, motif: null, lw: 1.6 });
  }
  ctx.restore();
}

/** A Gond tree: a trunk of limbs with leaves on every branch end. */
function gTree(ctx, x, y, s, time) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  gLimb(ctx, [[0, 88], [-4, 40], [0, -4]], 13, 8,
    { fill: G.mitti, motif: 'comb', on: 'rgba(245,225,190,0.45)', pitch: 6, lw: 2 });
  for (let i = 0; i < 6; i++) {
    const a = -2.5 + i * 0.5;
    const ex = Math.cos(a) * 54, ey = -10 + Math.sin(a) * 40;
    gLimb(ctx, [[0, -2], [ex * 0.55, ey * 0.7], [ex, ey]], 5, 3,
      { fill: G.mitti, motif: null, lw: 1.8 });
    for (let k = 0; k < 3; k++) {
      const b = a + (k - 1) * 0.42 + Math.sin(time * 0.4 + i) * 0.04;
      gLeafShape(ctx, ex + Math.cos(b) * 16, ey + Math.sin(b) * 13, 13, 7, b,
        { fill: k === 1 ? G.patta : G.pattaDark, motif: 'comb', on: 'rgba(240,240,200,0.45)', pitch: 4, lw: 1.4 });
    }
  }
  ctx.restore();
}

export function mixHex(a, b, k) {
  k = clamp01(k);
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  return `rgb(${Math.round(mix(pa[0], pb[0], k))},${Math.round(mix(pa[1], pb[1], k))},${Math.round(mix(pa[2], pb[2], k))})`;
}
