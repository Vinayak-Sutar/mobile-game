// Savi, drawn the way a Pahari miniature draws a girl.
//
// THE TONE THIS HAS TO SERVE, which I had never written down and so kept
// designing against nothing: Savi is not a cute game. It is tender and it is
// sad. An endless autumn, a valley going under the frost, a tree dying of
// forgetting, and an old woman telling a child the story of a girl who followed
// Death down the road and out-argued him. A chibi with blush dots is the wrong
// body for that. She should look like she belongs in a painting.
//
// So: Pahari and Rajasthani miniature convention, which is also where Raji gets
// its look, and which happens to suit flat canvas drawing exactly -
//
//   FLAT COLOUR. One fill, one shade on the turned side. No gradients.
//   A CONTOUR. Everything carries a dark warm line round it, heavier on the
//     outside of the figure and finer inside it. This is the single thing that
//     makes flat colour look painted rather than cheap.
//   THE ALMOND EYE. Not a big round anime eye - an elongated almond with a
//     heavy upper lash that runs on PAST the corner. It is the most recognisable
//     mark in the whole tradition.
//   ORNAMENT, in gold: at the hem, the cuffs, the ear, the parting.
//   PROPORTION. A child, so about a fifth of her height is head - slim and
//     upright, carrying herself well. Not a mascot.
//
// The five differ by SHAPE first: a wide triangle, a tall column with a sash
// across it, a bell with a hood, a narrow working shape, a soft round one.

const TAU = Math.PI * 2;
const INK = '#3a2118';            // the contour, a warm dark brown, never black

export const LOOKS = [
  {
    id: 'frock',
    name: 'The Frock',
    note: 'Crimson with a cream border and small white dots, two braids bound in red. Everyday, and the humblest of the five.',
    skin: '#c88b5a', shade: '#a86f44', hair: '#251519',
    skirt: { col: '#b02f3c', col2: '#8b2029', flare: 11, dots: '#f2e6d8', hemband: '#e8c877' },
    top: { col: '#b02f3c', collar: '#f2e6d8' },
    wrap: null,
    hair2: { kind: 'twin', tie: '#d8443c' },
  },
  {
    id: 'langa',
    name: 'The Langa',
    note: 'A long green pavadai with a gold zari border, a saffron choli, a dupatta across one shoulder. One heavy plait and a jasmine gajra.',
    skin: '#c4854f', shade: '#a26a39', hair: '#1f1317',
    skirt: { col: '#2f6047', col2: '#1f4433', flare: 8, hemband: '#e3ba63' },
    top: { col: '#e09a35', collar: null },
    wrap: { kind: 'dupatta', col: '#d9542f' },
    hair2: { kind: 'plait', tie: '#1f1317', flower: '#f7f3e3' },
  },
  {
    id: 'ghagra',
    name: 'The Ghagra',
    note: 'An indigo bell with mirrorwork at the hem and a saffron odhni drawn over her head. Rajasthani, and the warmest to look at.',
    skin: '#c88a5c', shade: '#a66c3f', hair: '#21151a',
    skirt: { col: '#2b3f73', col2: '#1c2c53', flare: 15, mirror: '#eee6c8', hemband: '#dcb45f' },
    top: { col: '#9d2f4f', collar: null },
    wrap: { kind: 'odhni', col: '#e0752f' },
    hair2: { kind: 'hidden', tie: '#21151a' },
  },
  {
    id: 'kurta',
    name: 'The Kurta',
    note: 'An ochre kurta over churidar, a grey wool shawl knotted across her, two short braids. She came to work, and it shows.',
    skin: '#c08048', shade: '#9c6332', hair: '#2a1d19',
    skirt: { col: '#8f8055', col2: '#6d6140', flare: 5, trousers: '#6f6e64' },
    top: { col: '#c9973f', collar: null },
    wrap: { kind: 'shawl', col: '#82808b' },
    hair2: { kind: 'twin', tie: '#43301f', short: 1 },
  },
  {
    id: 'bloom',
    name: 'The Bloom',
    note: 'A long leaf-green frock with a broad gold sash and a cardigan the colour of dry grass. Her hair up, with a marigold in it.',
    skin: '#cf9962', shade: '#ac7940', hair: '#2e1e1a',
    skirt: { col: '#4e7d3d', col2: '#3a5f2d', flare: 10, sash: '#e5b85a' },
    top: { col: '#4e7d3d', collar: null },
    wrap: { kind: 'cardigan', col: '#c6ab7c' },
    hair2: { kind: 'bun', tie: '#2e1e1a', flower: '#f0991f' },
  },
];

export const lookById = (id) => LOOKS.find((l) => l.id === id) || LOOKS[0];

/** Fill, then run the contour round it. Every shape in a miniature has one. */
function ink(ctx, fill, w = 1.1) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = w;
  ctx.stroke();
}

/**
 * Savi. `p` carries x, y, face, phase, speed, act, sweep, broom and look.
 * Drawn in her own axes and mirrored in exactly one place.
 */
export function drawSaviLook(ctx, p, time, L) {
  const HEAD = 7.6;               // a child's head, about a fifth of her height
  const HY = -33;
  const SHOULD = -25;             // the shoulder line
  const WAIST = -17;
  const a = p.face;
  const walking = p.speed > 12;
  const ph = p.phase;
  const bob = walking ? Math.sin(ph * 2) * 1.3 : Math.sin(time * 1.5) * 0.5;
  const fx = Math.cos(a), fy = Math.sin(a);
  const away = fy < -0.3;
  const S = L.skirt, T = L.top, W = L.wrap, H = L.hair2;
  const sway = walking ? Math.sin(ph) * 1.9 : 0;
  const swing = walking ? Math.sin(ph) * 2 : Math.sin(time * 1.2) * 0.8;
  const GOLD = '#e8c877';

  ctx.save();
  ctx.translate(p.x, p.y + bob);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.beginPath(); ctx.ellipse(1, 4, 10, 4, 0, 0, TAU); ctx.fill();

  // --- what hangs behind her -------------------------------------------------
  const braid = (side) => {
    const x = side * (HEAD - 1), tipY = H.short ? -20 : -12, drift = swing * 0.45 * side;
    ctx.beginPath();
    ctx.moveTo(x - 2.5, HY - 1);
    ctx.quadraticCurveTo(x - 3.3 + drift, HY + 8, x - 1.8 + drift, tipY);
    ctx.quadraticCurveTo(x + drift, tipY + 2, x + 1.8 + drift, tipY);
    ctx.quadraticCurveTo(x + 3.3 + drift, HY + 8, x + 2.5, HY - 1);
    ctx.closePath();
    ink(ctx, L.hair, 0.9);
    ctx.fillStyle = H.tie;
    ctx.beginPath(); ctx.ellipse(x + drift, tipY - 0.6, 1.8, 1.2, 0, 0, TAU); ctx.fill();
  };
  const hairBehind = () => {
    if (H.kind === 'twin') { braid(-1); braid(1); return; }
    if (H.kind !== 'plait') return;
    const x = -fx * 4.5, tipY = -13, drift = swing * 0.45;
    ctx.beginPath();
    ctx.moveTo(x - 3.1, HY);
    ctx.quadraticCurveTo(x - 3.9 + drift, HY + 10, x - 2.1 + drift, tipY);
    ctx.quadraticCurveTo(x + drift, tipY + 2.2, x + 2.1 + drift, tipY);
    ctx.quadraticCurveTo(x + 3.9 + drift, HY + 10, x + 3.1, HY);
    ctx.closePath();
    ink(ctx, L.hair, 0.9);
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.ellipse(x + drift, tipY - 0.6, 1.9, 1.3, 0, 0, TAU); ctx.fill();
  };
  if (!away) hairBehind();

  // --- legs ------------------------------------------------------------------
  const st = walking ? Math.sin(ph) * 3 : 0;
  for (const side of [-1, 1]) {
    const o = side * st * 0.5;
    ctx.beginPath();
    ctx.moveTo(side * 1.4, -9);
    ctx.lineTo(side * 4.6 + o * 0.4, -9);
    ctx.lineTo(side * 4.2 + o, 0.5);
    ctx.lineTo(side * 1.6 + o, 0.5);
    ctx.closePath();
    ink(ctx, S.trousers || L.skin, 0.9);
    ctx.beginPath();
    ctx.ellipse(side * 3 + o, 1.8, 3.4, 2.2, 0, 0, TAU);
    ink(ctx, '#4a3327', 0.9);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 0.8;   // payal
    ctx.beginPath(); ctx.moveTo(side * 1.5 + o, -0.6); ctx.lineTo(side * 4.4 + o, -0.6); ctx.stroke();
  }

  // --- the skirt: flat colour, a shaded side, a gold border ------------------
  const flare = 3 + S.flare * 0.6, hem = -7.5;
  ctx.beginPath();
  ctx.moveTo(-5.4, WAIST);
  ctx.quadraticCurveTo(-flare - 0.8 + sway, -13, -flare + sway, hem);
  ctx.quadraticCurveTo(sway, hem + 2.2, flare + sway, hem);
  ctx.quadraticCurveTo(flare + 0.8 + sway, -13, 5.4, WAIST);
  ctx.closePath();
  ink(ctx, S.col, 1.2);
  ctx.save(); ctx.clip();
  ctx.fillStyle = S.col2;
  ctx.fillRect(1.2, WAIST - 2, flare + 5, 22);
  ctx.restore();
  if (S.dots) {
    ctx.fillStyle = S.dots;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(-flare * 0.55 + (i % 3) * flare * 0.55 + sway * 0.7, -15 + Math.floor(i / 3) * 4.4, 0.95, 0, TAU);
      ctx.fill();
    }
  }
  if (S.hemband) {
    ctx.strokeStyle = S.hemband; ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-flare + 0.8 + sway, hem - 0.4);
    ctx.quadraticCurveTo(sway, hem + 1.6, flare - 0.8 + sway, hem - 0.4);
    ctx.stroke();
  }
  if (S.mirror) {
    ctx.fillStyle = S.mirror;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(i * (flare / 2.6) + sway, hem - 2, 0.85, 0, TAU); ctx.fill(); }
  }
  if (S.sash) { ctx.fillStyle = S.sash; ctx.fillRect(-5.6, WAIST - 0.5, 11.2, 2.4); }

  // --- the bodice ------------------------------------------------------------
  ctx.beginPath();
  ctx.moveTo(-5.2, WAIST + 1);
  ctx.quadraticCurveTo(-5.8, SHOULD - 1, -4, SHOULD - 2.4);
  ctx.lineTo(4, SHOULD - 2.4);
  ctx.quadraticCurveTo(5.8, SHOULD - 1, 5.2, WAIST + 1);
  ctx.closePath();
  ink(ctx, T.col, 1.1);
  if (T.collar && !away) {
    ctx.fillStyle = T.collar;
    ctx.beginPath();
    ctx.moveTo(-3.4, SHOULD - 2); ctx.quadraticCurveTo(0, SHOULD + 1.6, 3.4, SHOULD - 2);
    ctx.quadraticCurveTo(0, SHOULD - 0.6, -3.4, SHOULD - 2);
    ctx.closePath(); ctx.fill();
  }

  // --- arms, with a gold bangle at each wrist --------------------------------
  const working = (p.act || 0) > 0;
  for (const side of [-1, 1]) {
    const sa = working ? (p.sweep || 0) * 0.8 * side : (walking ? Math.sin(ph) * 0.4 * side : 0.05 * side);
    const sx = side * 4.6, sy = SHOULD - 1;
    const ex = sx + side * 2.6 + Math.cos(a + sa) * (working ? 9 : 2);
    const ey = sy + 9 + Math.sin(a + sa) * (working ? 5 : 1.2);
    ctx.strokeStyle = INK; ctx.lineWidth = 4.4;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + side * 2, sy + 5, ex, ey); ctx.stroke();
    ctx.strokeStyle = L.skin; ctx.lineWidth = 2.9;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + side * 2, sy + 5, ex, ey); ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.beginPath(); ctx.arc(ex - (ex - sx) * 0.2, ey - (ey - sy) * 0.2, 1.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(ex, ey, 1.9, 0, TAU); ink(ctx, L.skin, 0.8);
  }

  if (W && W.kind === 'shawl') {
    ctx.beginPath();
    ctx.moveTo(-7, SHOULD - 2); ctx.quadraticCurveTo(-8.4, WAIST - 2, -5.4, WAIST + 1);
    ctx.lineTo(5.4, WAIST + 1); ctx.quadraticCurveTo(8.4, WAIST - 2, 7, SHOULD - 2);
    ctx.quadraticCurveTo(0, SHOULD - 4.6, -7, SHOULD - 2);
    ctx.closePath();
    ink(ctx, W.col, 1.1);
  } else if (W && W.kind === 'cardigan') {
    ctx.fillStyle = W.col;
    ctx.fillRect(-7.2, SHOULD - 2.4, 3.2, 10);
    ctx.fillRect(4, SHOULD - 2.4, 3.2, 10);
  } else if (W && W.kind === 'dupatta') {
    ctx.beginPath();
    ctx.moveTo(-4.6, SHOULD - 2.6);
    ctx.quadraticCurveTo(1.6, WAIST, 5.6 + sway * 0.8, hem + 1);
    ctx.lineTo(8.4 + sway, hem + 2);
    ctx.quadraticCurveTo(4.2, WAIST - 1, -2.4, SHOULD - 2.6);
    ctx.closePath();
    ink(ctx, W.col, 1);
  }

  // --- the head --------------------------------------------------------------
  ctx.beginPath();
  ctx.ellipse(0, HY, HEAD * 0.92, HEAD, 0, 0, TAU);
  ink(ctx, L.skin, 1.2);
  ctx.save();                                    // the turned side, flat
  ctx.clip();
  ctx.fillStyle = L.shade;
  ctx.fillRect(fx * 2.4, HY - HEAD, HEAD, HEAD * 2);
  ctx.restore();

  ctx.beginPath();                               // hair: a smooth cap, centre-parted
  if (away) {
    ctx.ellipse(0, HY, HEAD * 0.96, HEAD * 1.04, 0, 0, TAU);
  } else {
    ctx.moveTo(-HEAD * 0.95, HY + 0.6);
    ctx.quadraticCurveTo(-HEAD, HY - HEAD * 1.35, 0, HY - HEAD * 1.12);
    ctx.quadraticCurveTo(HEAD, HY - HEAD * 1.35, HEAD * 0.95, HY + 0.6);
    ctx.quadraticCurveTo(HEAD * 0.7, HY - HEAD * 0.4, fx * 0.6, HY - HEAD * 0.52);
    ctx.quadraticCurveTo(-HEAD * 0.7, HY - HEAD * 0.42, -HEAD * 0.95, HY + 0.6);
  }
  ctx.closePath();
  ink(ctx, L.hair, 1);

  if (W && W.kind === 'odhni') {
    ctx.beginPath();
    ctx.moveTo(-HEAD - 1.4, HY + 4);
    ctx.quadraticCurveTo(-HEAD - 2.2, HY - HEAD * 1.9, 0, HY - HEAD * 1.95);
    ctx.quadraticCurveTo(HEAD + 2.2, HY - HEAD * 1.9, HEAD + 1.4, HY + 4);
    ctx.quadraticCurveTo(HEAD * 0.5, HY - HEAD * 0.5, 0, HY - HEAD * 0.55);
    ctx.quadraticCurveTo(-HEAD * 0.5, HY - HEAD * 0.5, -HEAD - 1.4, HY + 4);
    ctx.closePath();
    ink(ctx, W.col, 1.1);
  }

  if (!away) {
    const ex = fx * 1.1;
    // THE ALMOND EYE. Elongated, heavy upper lash carried past the corner - the
    // one line that says miniature rather than cartoon.
    for (const side of [-1, 1]) {
      const x = ex + side * 2.9, y = HY + 0.8;
      ctx.beginPath();
      ctx.moveTo(x - 2.5, y);
      ctx.quadraticCurveTo(x, y - 2.1, x + 2.5, y);
      ctx.quadraticCurveTo(x, y + 1.5, x - 2.5, y);
      ctx.closePath();
      ctx.fillStyle = '#f6efe4';
      ctx.fill();
      ctx.fillStyle = '#26161a';
      ctx.beginPath(); ctx.ellipse(x + ex * 0.4, y - 0.1, 1.05, 1.25, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#26161a'; ctx.lineWidth = 1.05;
      ctx.beginPath();
      ctx.moveTo(x - 2.9, y - 0.3);
      ctx.quadraticCurveTo(x, y - 2.5, x + 3.4, y - 0.5);      // the lash, running on
      ctx.stroke();
      ctx.strokeStyle = L.hair; ctx.lineWidth = 0.9;           // a fine brow above it
      ctx.beginPath();
      ctx.moveTo(x - 2.6, y - 3.2);
      ctx.quadraticCurveTo(x, y - 4.4, x + 2.6, y - 3.1);
      ctx.stroke();
    }
    ctx.strokeStyle = INK; ctx.lineWidth = 0.8;                // nose, one small line
    ctx.beginPath();
    ctx.moveTo(ex + fx * 0.8, HY + 1.4);
    ctx.quadraticCurveTo(ex + fx * 1.6, HY + 3.4, ex + fx * 0.4, HY + 3.8);
    ctx.stroke();
    ctx.strokeStyle = '#8d4a3a'; ctx.lineWidth = 0.95;         // a calm mouth
    ctx.beginPath();
    ctx.moveTo(ex - 1.5, HY + 5.4);
    ctx.quadraticCurveTo(ex, HY + 6.3, ex + 1.5, HY + 5.4);
    ctx.stroke();
    ctx.fillStyle = '#a8202e';                                 // bindi
    ctx.beginPath(); ctx.arc(ex, HY - 3.1, 0.8, 0, TAU); ctx.fill();
    ctx.fillStyle = GOLD;                                      // maang tikka on the parting
    ctx.beginPath(); ctx.arc(ex * 0.6, HY - HEAD * 0.86, 0.9, 0, TAU); ctx.fill();
    ctx.strokeStyle = GOLD; ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(ex * 0.6, HY - HEAD * 1.12); ctx.lineTo(ex * 0.6, HY - HEAD * 0.9); ctx.stroke();
    for (const side of [-1, 1]) {                              // earrings
      ctx.fillStyle = GOLD;
      ctx.beginPath(); ctx.arc(side * HEAD * 0.88, HY + 1.6, 1.2, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = 'rgba(30,18,16,0.7)';                      // the kala teeka
    ctx.beginPath(); ctx.arc(ex - 5.2, HY + 2.6, 0.85, 0, TAU); ctx.fill();
  }

  if (H.kind === 'bun') {
    ctx.beginPath(); ctx.arc(-fx * 1.8, HY - HEAD * 1.15, 3.6, 0, TAU);
    ink(ctx, L.hair, 0.9);
    if (H.flower) {
      ctx.fillStyle = H.flower;
      for (let i = 0; i < 6; i++) {
        const an = (i / 6) * TAU;
        ctx.beginPath(); ctx.arc(-fx * 1.8 + Math.cos(an) * 2.5, HY - HEAD * 1.15 + Math.sin(an) * 2.5, 1.25, 0, TAU); ctx.fill();
      }
    }
  }
  if (H.flower && H.kind === 'plait') {
    ctx.fillStyle = H.flower;
    for (let i = 0; i < 7; i++) {
      const an = Math.PI * (1.1 + (i / 6) * 0.8);
      ctx.beginPath(); ctx.arc(Math.cos(an) * HEAD, HY + Math.sin(an) * HEAD, 1.15, 0, TAU); ctx.fill();
    }
  }
  if (away) hairBehind();

  if (p.broom) {
    ctx.save();
    if (working) {
      ctx.translate(Math.cos(a) * 10, Math.sin(a) * 6 - 12);
      ctx.rotate(a + (p.sweep || 0) * 0.72 - Math.PI / 2);
    } else {
      ctx.translate(-fx * 4, -18);
      ctx.rotate(-0.7);
    }
    ctx.strokeStyle = INK; ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(0, 15); ctx.stroke();
    ctx.strokeStyle = '#7d5730'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(0, 15); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-3, 12);
    ctx.quadraticCurveTo(-5.2, 19, -4, 23);
    ctx.lineTo(4, 23);
    ctx.quadraticCurveTo(5.2, 19, 3, 12);
    ctx.closePath();
    ink(ctx, '#c39a52', 1);
    ctx.strokeStyle = '#8a5f34'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-3.2, 12.4); ctx.lineTo(3.2, 12.4); ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}
