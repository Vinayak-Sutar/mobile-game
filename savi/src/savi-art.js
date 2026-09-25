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

/**
 * The tree, from above. A knot of trunks with aerial roots hanging round it and
 * a canopy that comes back as the valley wakes: bare and grey at `bloom` 0,
 * full and gold at 1.
 */
export function drawBanyan(ctx, T, bloom, time) {
  const { x, y } = T;
  // Its shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.beginPath();
  ctx.ellipse(x + 14, y + 26, 236, 160, 0, 0, TAU);
  ctx.fill();

  // The aerial roots: a ring of props round the trunk.
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * TAU + 0.3;
    const rr = 118 + rnd(i) * 66;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.72;
    ctx.strokeStyle = mixHex('#463126', PAL.barkLit, bloom * 0.6);
    ctx.lineWidth = 9 + rnd(i * 3) * 11;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * 46, y + Math.sin(a) * 30 - 10);
    ctx.quadraticCurveTo(px + Math.cos(a) * 12, py - 24, px, py);
    ctx.stroke();
  }

  // The trunk: several fused stems.
  ctx.fillStyle = mixHex('#3a2a21', PAL.bark, bloom * 0.7);
  ctx.beginPath();
  ctx.ellipse(x, y, 96, 70, 0, 0, TAU);
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.7;
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * 52, y + Math.sin(a) * 36, 34, 27, a, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,220,170,0.1)';
  ctx.beginPath();
  ctx.ellipse(x - 22, y - 18, 44, 30, 0, 0, TAU);
  ctx.fill();

  // The canopy, drawn over everything else in the overhead pass.
  T.canopy = bloom;
}

/** The leaves, drawn above the player so she walks under them. */
export function drawCanopy(ctx, T, bloom, time) {
  if (bloom <= 0.01) {
    // Bare: a scribble of branches.
    ctx.strokeStyle = 'rgba(58,44,38,0.5)';
    ctx.lineWidth = 5;
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU;
      const r = 150 + rnd(i) * 180;
      ctx.beginPath();
      ctx.moveTo(T.x, T.y - 8);
      ctx.quadraticCurveTo(T.x + Math.cos(a) * r * 0.6, T.y + Math.sin(a) * r * 0.45 - 30, T.x + Math.cos(a) * r, T.y + Math.sin(a) * r * 0.7);
      ctx.stroke();
    }
    return;
  }
  const n = Math.round(30 + bloom * 42);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU * 3.1 + i * 0.7;
    const r = (60 + rnd(i) * 250) * (0.55 + bloom * 0.45);
    const px = T.x + Math.cos(a) * r, py = T.y + Math.sin(a) * r * 0.72;
    const s = (44 + rnd(i * 3) * 54) * (0.6 + bloom * 0.4);
    const sway = Math.sin(time * 0.7 + i) * 4 * bloom;
    ctx.globalAlpha = 0.5 + rnd(i * 5) * 0.4;
    ctx.fillStyle = [['#8a7a3e', '#a08a42'], ['#e0a443', '#c8802f'], ['#f0bf5c', '#d99138']][Math.min(2, Math.floor(bloom * 3))][i % 2];
    ctx.beginPath();
    ctx.ellipse(px + sway, py, s, s * 0.74, a, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** One Great Root, reaching out from the tree to its trouble. */
export function drawRoot(ctx, T, R, woken, time) {
  const pts = rootPath(T, R);
  const glow = woken ? 1 : 0;
  // The root itself.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 30;
  stroke(ctx, pts, 4, 6);
  ctx.strokeStyle = woken ? mixHex('#6b4c36', '#b9813f', 0.6) : '#5b5750';
  ctx.lineWidth = 26;
  stroke(ctx, pts, 0, 0);
  ctx.strokeStyle = woken ? 'rgba(255,190,120,0.85)' : 'rgba(150,146,138,0.5)';
  ctx.lineWidth = 7;
  stroke(ctx, pts, -4, -5);

  // Awake: a pulse of memory running home to the tree.
  if (glow) {
    const k = (time * 0.22 + R.seed) % 1;
    const p = along(pts, 1 - k);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, 70);
    g.addColorStop(0, 'rgba(255,175,80,0.55)');
    g.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 70, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // The tip: a knot you can stand on, and its mural once it is awake.
  const tip = pts[pts.length - 1];
  ctx.fillStyle = woken ? '#7a5533' : '#56524b';
  ctx.beginPath();
  ctx.ellipse(tip.x, tip.y, 46, 34, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = woken ? 'rgba(255,190,120,0.9)' : 'rgba(120,116,110,0.6)';
  ctx.lineWidth = 3;
  ctx.stroke();
  if (woken) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(tip.x, tip.y, 4, tip.x, tip.y, 120);
    g.addColorStop(0, `rgba(255,170,70,${0.3 + Math.sin(time * 1.6 + R.seed) * 0.06})`);
    g.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 120, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

/** The line a root takes from the trunk to its tip, bent so it never runs straight. */
export function rootPath(T, R) {
  if (R._pts) return R._pts;
  const n = 7, out = [];
  const dx = R.x - T.x, dy = R.y - T.y;
  const nx = -dy, ny = dx;
  const len = Math.hypot(dx, dy) || 1;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const bend = Math.sin(k * Math.PI) * (R.bend || 90) * (rnd(R.seed + i) - 0.35);
    out.push({ x: T.x + dx * k + (nx / len) * bend, y: T.y + dy * k + (ny / len) * bend });
  }
  R._pts = out;
  return out;
}

function stroke(ctx, pts, ox, oy) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x + ox, pts[0].y + oy);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x + ox, pts[i].y + oy);
  ctx.stroke();
}
function along(pts, k) {
  const f = clamp01(k) * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(f)), u = f - i;
  return { x: mix(pts[i].x, pts[i + 1].x, u), y: mix(pts[i].y, pts[i + 1].y, u) };
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

  ctx.save();
  ctx.translate(p.x, p.y + bob);

  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(1, 5, 12, 5, 0, 0, TAU);
  ctx.fill();

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

  // Head and hair.
  ctx.fillStyle = '#2a1c18';
  ctx.beginPath(); ctx.arc(0, -25.5, 7.4, 0, TAU); ctx.fill();
  if (!away) {
    ctx.fillStyle = '#d9a06e';
    ctx.beginPath(); ctx.ellipse(fx * 1.4, -24.6, 5.2, 5.6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a1c18';
    ctx.beginPath(); ctx.ellipse(fx * 1.4, -28.4, 5.6, 3.4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1b120f';
    ctx.fillRect(fx * 1.4 - 2.6, -25.4, 1.5, 1.9);
    ctx.fillRect(fx * 1.4 + 1.1, -25.4, 1.5, 1.9);
  }
  // A braid that swings behind her.
  const bx = -fx * 7, by = -fy * 5 + (walking ? Math.sin(ph) * 1.8 : Math.sin(time * 1.3) * 0.8);
  ctx.strokeStyle = '#2a1c18';
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -26);
  ctx.quadraticCurveTo(bx * 0.6, -22 + by, bx, -16 + by);
  ctx.stroke();
  ctx.fillStyle = '#c94f6d';
  ctx.beginPath(); ctx.arc(bx, -16 + by, 1.8, 0, TAU); ctx.fill();

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
