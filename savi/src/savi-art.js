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
export function drawCanopy(ctx, T, bloom, time) {
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

  const pal = [['#7d6b33', '#94803a'], ['#c08a34', '#a8702a'], ['#e6ac45', '#c98a33'], ['#f2c65e', '#db9c3c']];
  for (let layer = 0; layer < 3; layer++) {
    const spread = 1 - layer * 0.2;
    const n = 30 - layer * 6;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU + layer * 0.8 + rnd(i + layer * 31) * 0.5;
      const r = (120 + rnd(i * 3 + layer) * 250) * spread;
      const sway = Math.sin(time * 0.55 + i + layer) * (3 + layer);
      const size = (56 + rnd(i * 5 + layer) * 66) * (0.62 + bloom * 0.38);
      ctx.fillStyle = pal[Math.min(3, Math.floor(bloom * 3) + (i & 1))][layer % 2];
      ctx.globalAlpha = 0.88;
      ctx.beginPath();
      ctx.ellipse(T.x + Math.cos(a0) * r + sway, T.y - 150 - layer * 26 + Math.sin(a0) * r * 0.55, size, size * 0.72, a0, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const lg = ctx.createRadialGradient(T.x - 140, T.y - 250, 20, T.x - 140, T.y - 250, 330);
  lg.addColorStop(0, `rgba(255,214,140,${0.16 * bloom})`);
  lg.addColorStop(1, 'rgba(255,190,110,0)');
  ctx.fillStyle = lg;
  ctx.beginPath();
  ctx.arc(T.x - 140, T.y - 250, 330, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/**
 * A young banyan, risen where a Great Root was freed: one slim braided stem,
 * a first aerial root already reaching down, a small crown - and the beat of
 * the legend carved into its bark, which is why it is there.
 */
export function drawYoungTree(ctx, o, time) {
  const g = clamp01(o.grow), x = o.x, y = o.y;
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
    ctx.fillStyle = ['#e0a443', '#c8802f', '#f0bf5c'][i % 3];
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
export function drawTree(ctx, o, time, warmth) {
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
    ctx.strokeStyle = '#3d3229';
    ctx.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i - 2.5) * 0.42;
      ctx.lineWidth = 4.5 * s;
      ctx.beginPath();
      ctx.moveTo(x, y - 22 * s);
      ctx.quadraticCurveTo(x + Math.cos(a) * 24 * s, y - 42 * s, x + Math.cos(a) * 44 * s + sway, y - 52 * s + Math.sin(a) * 12 * s);
      ctx.stroke();
    }
    return;
  }
  const hues = warmth > 0.55
    ? ['#d98f2f', '#e8b148', '#c46c25', '#f0c65e']
    : ['#8f7a3a', '#a8893c', '#7a6330', '#bd9a45'];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + o.seed;
    const r = (26 + rnd(o.seed + i) * 16) * s;
    ctx.fillStyle = hues[(o.seed + i) % hues.length];
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * 17 * s + sway, y - 34 * s + Math.sin(a) * 11 * s, r, r * 0.8, a, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,230,180,0.14)';
  ctx.beginPath();
  ctx.ellipse(x - 12 * s + sway, y - 46 * s, 22 * s, 14 * s, 0, 0, TAU);
  ctx.fill();
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
  ctx.restore();
}

// --- the Old Woman and her fire ------------------------------------------------------

export function drawWoman(ctx, o, time) {
  const sway = Math.sin(time * 0.9) * 1.1;
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.beginPath(); ctx.ellipse(o.x + 2, o.y + 5, 15, 6, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#6a5f74';                       // her blanket
  ctx.beginPath();
  ctx.moveTo(o.x - 15, o.y + 3);
  ctx.quadraticCurveTo(o.x - 17 + sway, o.y - 18, o.x - 8, o.y - 27);
  ctx.lineTo(o.x + 8, o.y - 27);
  ctx.quadraticCurveTo(o.x + 17 + sway, o.y - 18, o.x + 15, o.y + 3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.fillRect(o.x + 2, o.y - 26, 13, 29);
  ctx.fillStyle = '#5b5166';                       // her hood
  ctx.beginPath(); ctx.arc(o.x, o.y - 31, 9, 0, TAU); ctx.fill();
  ctx.fillStyle = '#cfa27a';
  ctx.beginPath(); ctx.ellipse(o.x + 1, o.y - 30, 5, 5.4, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(o.x + 1, o.y - 33.5, 5.4, 3, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#e8e0d6';                       // white hair at the edge
  ctx.beginPath(); ctx.ellipse(o.x - 7, o.y - 28, 3.4, 5, 0.4, 0, TAU); ctx.fill();
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
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2a1a1e');
  g.addColorStop(0.55, '#4a2a22');
  g.addColorStop(1, '#1a1114');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  glow(ctx, W / 2, H * 0.62, W * 0.5, 'rgba(255,150,60,0.24)');

  const S = Math.min(W / 420, H / 240);
  ctx.save();
  ctx.translate(W / 2, H * 0.5);
  ctx.scale(S, S);
  ctx.fillStyle = '#1a1014';
  const F = (x, y, s, o = {}) => figure(ctx, x, y, s, o);

  if (id === 'choice') {
    F(-70, 40, 1.15, { skirt: 1, crown: 1, warm: 1 });    // Savitri in silks
    F(48, 42, 1.05, { plain: 1 });                        // Satyavan in the dust
    ctx.globalAlpha = 0.35;
    F(130, 36, 0.9, { staff: 1 });                        // Narada, at the edge
    ctx.globalAlpha = 1;
  } else if (id === 'fall') {
    tree(ctx, 0, -6, 1.4);
    F(-26, 46, 1.05, { skirt: 1, kneel: 1 });
    ctx.save();                                            // Satyavan, fallen
    ctx.translate(6, 44); ctx.rotate(-1.35);
    F(0, 0, 1, { plain: 1 });
    ctx.restore();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#0b0710';
    ctx.beginPath(); ctx.ellipse(96, 6, 46, 78, 0, 0, TAU); ctx.fill();   // the shadow
    ctx.globalAlpha = 1;
  } else if (id === 'pursuit') {
    yama(ctx, 74, 36, 1.3);
    F(-52, 44, 1, { skirt: 1, bark: 1 });
    ctx.strokeStyle = 'rgba(255,170,80,0.5)';              // the soul on his noose
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(30, -12, 11, 0, TAU); ctx.stroke();
  } else if (id === 'steps') {
    ctx.fillStyle = 'rgba(210,225,240,0.13)';
    ctx.fillRect(-220, 46, 440, 60);                       // frozen ground
    yama(ctx, 62, 44, 1.22);
    F(-30, 46, 1, { skirt: 1, bark: 1 });
    ctx.fillStyle = 'rgba(230,240,250,0.3)';               // seven footprints
    for (let i = 0; i < 7; i++) ctx.fillRect(-140 + i * 22, 52 + (i % 2) * 7, 9, 5);
  } else if (id === 'boon') {
    ctx.strokeStyle = 'rgba(150,180,230,0.35)';            // the gate
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(120, 60); ctx.lineTo(120, -46);
    ctx.quadraticCurveTo(166, -80, 212, -46); ctx.lineTo(212, 60);
    ctx.stroke();
    yama(ctx, 76, 40, 1.2, 1);
    F(-46, 44, 1, { skirt: 1, bark: 1 });
  } else if (id === 'bloom') {
    ctx.fillStyle = '#2a1a14';
    tree(ctx, 0, 10, 2.5);
    ctx.globalAlpha = 0.9;
    for (let i = 0; i < 40; i++) {
      const a = rnd(i) * TAU, r = 40 + rnd(i * 3) * 130;
      ctx.fillStyle = ['#e8a343', '#f2c25c', '#d3762e'][i % 3];
      ctx.beginPath();
      ctx.ellipse(Math.cos(a) * r, -30 + Math.sin(a) * r * 0.66, 12, 9, a, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    F(-96, 52, 1, { skirt: 1, warm: 1 });
    F(-60, 52, 1, { plain: 1 });
  }
  ctx.restore();

  // A carved border, so it reads as cut into the root.
  ctx.strokeStyle = 'rgba(255,190,120,0.3)';
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 6, W - 12, H - 12);
}

function figure(ctx, x, y, s, o) {
  const c = ctx;
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.fillStyle = o.warm ? '#c76a32' : o.bark ? '#5c4632' : '#181016';
  if (o.kneel) {
    c.beginPath();
    c.moveTo(-16, 0); c.quadraticCurveTo(-20, -22, -6, -34);
    c.lineTo(10, -34); c.quadraticCurveTo(20, -18, 22, 0);
    c.closePath(); c.fill();
  } else {
    c.beginPath();
    c.moveTo(-13, 0);
    c.quadraticCurveTo(-15, -30, -8, -52);
    c.lineTo(8, -52);
    c.quadraticCurveTo(15, -30, 13, 0);
    c.closePath(); c.fill();
  }
  const hy = o.kneel ? -42 : -60;
  c.beginPath(); c.arc(0, hy, 9, 0, TAU); c.fill();
  if (o.crown) {
    c.fillStyle = '#e8b45c';
    c.beginPath();
    c.moveTo(-9, hy - 8); c.lineTo(-5, hy - 16); c.lineTo(0, hy - 9);
    c.lineTo(5, hy - 16); c.lineTo(9, hy - 8);
    c.closePath(); c.fill();
  }
  if (o.staff) {
    c.strokeStyle = '#3a2a1e'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(13, 2); c.lineTo(17, -70); c.stroke();
  }
  c.restore();
}

function tree(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = '#20141a';
  ctx.fillRect(-13, -50, 26, 50);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI - 0.1;
    ctx.save();
    ctx.translate(0, -48);
    ctx.rotate(a - Math.PI / 2);
    ctx.fillRect(-3, -46, 6, 46);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.ellipse(0, -62, 62, 30, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function yama(ctx, x, y, s, calm = 0) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = calm ? '#241826' : '#0d080f';
  ctx.beginPath();
  ctx.moveTo(-28, 0);
  ctx.quadraticCurveTo(-34, -44, -18, -76);
  ctx.lineTo(18, -76);
  ctx.quadraticCurveTo(34, -44, 28, 0);
  ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -88, 15, 0, TAU); ctx.fill();
  ctx.beginPath();                                   // his crown
  ctx.moveTo(-15, -98); ctx.lineTo(-9, -116); ctx.lineTo(0, -100);
  ctx.lineTo(9, -116); ctx.lineTo(15, -98);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = calm ? 'rgba(255,190,110,0.9)' : 'rgba(255,90,50,0.95)';
  ctx.fillRect(-8, -91, 5, 3.4);
  ctx.fillRect(3, -91, 5, 3.4);
  ctx.restore();
}

// --- helpers ---------------------------------------------------------------------------

export function mixHex(a, b, k) {
  k = clamp01(k);
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  return `rgb(${Math.round(mix(pa[0], pb[0], k))},${Math.round(mix(pa[1], pb[1], k))},${Math.round(mix(pa[2], pb[2], k))})`;
}
