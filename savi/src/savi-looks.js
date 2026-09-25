// Savi, five ways — and a child's proportions under all of them.
//
// The last figure was a small adult: little head, little eyes, limbs like wire,
// and braids drawn as thin STROKES out of her skull, which is antennae and not
// hair. A child reads as a child by proportion, and the numbers are not subtle:
//
//   the head is nearly half her height, and round
//   the eyes are enormous, set low and wide, with a highlight in each
//   the cheeks are round and flushed
//   the limbs are short and thick and end in something
//   the hair is solid MASS with an outline round it - never a line
//
// The five differ by SHAPE, not paint: at the size she is drawn you read her by
// outline long before colour. A wide triangle, a tall column with a sash across
// it, a bell with a hood, a narrow working shape, a soft round one.
//
// Shared, because every Indian child has them: kajal along the top of the eye,
// a bindi, payal at the ankles, and the KALA TEEKA - the little black smudge a
// mother puts on a cheek to turn away the evil eye.

const TAU = Math.PI * 2;

export const LOOKS = [
  {
    id: 'frock',
    name: 'The Frock',
    note: 'Madder red with white dots, a peter-pan collar, puff sleeves, two fat braids and red ribbons. The one every Indian schoolgirl owns.',
    skin: '#dda274', hair: '#2b1a1d',
    skirt: { col: '#c43a47', col2: '#9a2b36', flare: 11, dots: '#f6ebe4' },
    top: { col: '#c43a47', collar: '#f6ebe4', puff: 1 },
    wrap: null,
    hair2: { kind: 'twin', tie: '#f0564f' },
  },
  {
    id: 'langa',
    name: 'The Langa',
    note: 'A long green pavadai with a gold border, a mustard choli, and a dupatta over one shoulder. One thick plait and a jasmine gajra.',
    skin: '#d2955f', hair: '#231519',
    skirt: { col: '#356c4e', col2: '#24503a', flare: 8, border: '#e8c168' },
    top: { col: '#e0a842', collar: null, puff: 0 },
    wrap: { kind: 'dupatta', col: '#e66242' },
    hair2: { kind: 'plait', tie: '#231519', flower: '#f8f4e6' },
  },
  {
    id: 'ghagra',
    name: 'The Ghagra',
    note: 'An indigo bell with mirrors round the hem, and an orange odhni pulled up over her head like a hood. Rajasthani, and the warmest of them.',
    skin: '#d99a68', hair: '#26171c',
    skirt: { col: '#31477f', col2: '#22335f', flare: 15, mirror: '#f0ead2' },
    top: { col: '#ab3459', collar: null, puff: 0 },
    wrap: { kind: 'odhni', col: '#e87b34' },
    hair2: { kind: 'hidden', tie: '#26171c' },
  },
  {
    id: 'kurta',
    name: 'The Kurta',
    note: 'An ochre kurta over churidar and a grey wool shawl knotted across her, with two short braids. The practical one — she came to work.',
    skin: '#d1904f', hair: '#2b1f1c',
    skirt: { col: '#9a8a60', col2: '#786a4a', flare: 5, trousers: '#767569' },
    top: { col: '#d6a047', collar: null, puff: 0 },
    wrap: { kind: 'shawl', col: '#8a8892' },
    hair2: { kind: 'twin', tie: '#463227', short: 1 },
  },
  {
    id: 'bloom',
    name: 'The Bloom',
    note: 'A long leaf-green frock with a wide sash and a cardigan the colour of dry grass. A topknot with a marigold in it.',
    skin: '#e0b07e', hair: '#31201c',
    skirt: { col: '#578844', col2: '#416733', flare: 10, sash: '#eec063' },
    top: { col: '#578844', collar: null, puff: 1 },
    wrap: { kind: 'cardigan', col: '#cdb384' },
    hair2: { kind: 'bun', tie: '#31201c', flower: '#f5a623' },
  },
];

export const lookById = (id) => LOOKS.find((l) => l.id === id) || LOOKS[0];

/** A rounded box, for the browsers that still have not got roundRect. */
function box(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Savi. `p` carries x, y, face, phase, speed, act, sweep, broom and look.
 * Drawn in her own axes and mirrored in exactly one place, so nothing can come
 * out reversed.
 */
export function drawSaviLook(ctx, p, time, L) {
  const HEAD = 10.6;              // head radius — nearly half her height
  const HY = -27;                 // where its centre sits
  const BODY = -16;               // the top of the dress, under her chin
  const a = p.face;
  const walking = p.speed > 12;
  const ph = p.phase;
  const bob = walking ? Math.sin(ph * 2) * 1.5 : Math.sin(time * 1.7) * 0.6;
  const fx = Math.cos(a), fy = Math.sin(a);
  const away = fy < -0.3;
  const S = L.skirt, T = L.top, W = L.wrap, H = L.hair2;
  const sway = walking ? Math.sin(ph) * 2 : 0;
  const swing = walking ? Math.sin(ph) * 2.2 : Math.sin(time * 1.3) * 0.9;
  const ink = 'rgba(40,24,20,0.5)';

  ctx.save();
  ctx.translate(p.x, p.y + bob);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(1, 4, 11, 4.4, 0, 0, TAU); ctx.fill();

  // --- hair that hangs behind her: solid masses, never strokes ---------------
  const braid = (side) => {
    const x = side * (HEAD - 1.6), tipY = H.short ? -15 : -8, drift = swing * 0.5 * side;
    ctx.fillStyle = L.hair;
    ctx.beginPath();
    ctx.moveTo(x - 3.8, HY - 3);
    ctx.quadraticCurveTo(x - 4.8 + drift, HY + 8, x - 2.8 + drift, tipY);
    ctx.quadraticCurveTo(x + drift, tipY + 2.6, x + 2.8 + drift, tipY);
    ctx.quadraticCurveTo(x + 4.8 + drift, HY + 8, x + 3.8, HY - 3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = 0.9; ctx.stroke();
    ctx.fillStyle = H.tie;
    ctx.beginPath(); ctx.ellipse(x - 0.6 + drift * 0.3, HY - 1.4, 3.6, 2.3, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + drift, tipY - 1, 2.3, 1.6, 0, 0, TAU); ctx.fill();
  };
  const hairBehind = () => {
    if (H.kind === 'twin') { braid(-1); braid(1); return; }
    if (H.kind !== 'plait') return;
    const x = -fx * 6, tipY = -9, drift = swing * 0.5;
    ctx.fillStyle = L.hair;
    ctx.beginPath();
    ctx.moveTo(x - 4.4, HY - 2);
    ctx.quadraticCurveTo(x - 5.2 + drift, HY + 10, x - 3.2 + drift, tipY);
    ctx.quadraticCurveTo(x + drift, tipY + 2.8, x + 3.2 + drift, tipY);
    ctx.quadraticCurveTo(x + 5.2 + drift, HY + 10, x + 4.4, HY - 2);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = 0.9; ctx.stroke();
    ctx.fillStyle = H.tie;
    ctx.beginPath(); ctx.ellipse(x + drift, tipY - 1, 2.5, 1.7, 0, 0, TAU); ctx.fill();
  };
  if (!away) hairBehind();

  // --- short round legs, little shoes, payal ---------------------------------
  const st = walking ? Math.sin(ph) * 3.4 : 0;
  ctx.fillStyle = S.trousers || L.skin;
  box(ctx, -6.4, -6 + st * 0.5, 5, 8, 2.5); ctx.fill();
  box(ctx, 1.4, -6 - st * 0.5, 5, 8, 2.5); ctx.fill();
  ctx.fillStyle = '#4a3327';
  ctx.beginPath(); ctx.ellipse(-3.9, 2 + st * 0.5, 4.1, 2.9, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(3.9, 2 - st * 0.5, 4.1, 2.9, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#e0cb92'; ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.moveTo(-6.4, -1 + st * 0.5); ctx.lineTo(-1.4, -1 + st * 0.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(1.4, -1 - st * 0.5); ctx.lineTo(6.4, -1 - st * 0.5); ctx.stroke();

  // --- the dress -------------------------------------------------------------
  const flare = 3 + S.flare * 0.62, hem = -3.5;
  ctx.fillStyle = S.col;
  ctx.beginPath();
  ctx.moveTo(-7, BODY);
  ctx.quadraticCurveTo(-flare - 1 + sway, -10, -flare + sway, hem);
  ctx.quadraticCurveTo(sway, hem + 2.6, flare + sway, hem);
  ctx.quadraticCurveTo(flare + 1 + sway, -10, 7, BODY);
  ctx.closePath();
  ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = S.col2;
  ctx.fillRect(1.5, BODY - 2, flare + 5, 22);
  ctx.restore();
  ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.stroke();

  if (S.dots) {
    ctx.fillStyle = S.dots;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(-flare * 0.6 + (i % 3) * flare * 0.6 + sway * 0.7, -12 + Math.floor(i / 3) * 5.5, 1.25, 0, TAU);
      ctx.fill();
    }
  }
  if (S.border) {
    ctx.strokeStyle = S.border; ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-flare + 1 + sway, hem - 0.6);
    ctx.quadraticCurveTo(sway, hem + 1.8, flare - 1 + sway, hem - 0.6);
    ctx.stroke();
  }
  if (S.mirror) {
    ctx.fillStyle = S.mirror;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.arc(i * (flare / 2.6) + sway, hem - 1.2, 1.05, 0, TAU); ctx.fill(); }
  }
  if (S.sash) { ctx.fillStyle = S.sash; ctx.fillRect(-7, BODY + 1, 14, 2.8); }

  ctx.fillStyle = T.col;
  ctx.beginPath();
  ctx.moveTo(-6.6, BODY + 3);
  ctx.quadraticCurveTo(-7.4, -21, -4.8, -22.5);
  ctx.lineTo(4.8, -22.5);
  ctx.quadraticCurveTo(7.4, -21, 6.6, BODY + 3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.stroke();
  if (T.collar && !away) {
    ctx.fillStyle = T.collar;
    ctx.beginPath();
    ctx.moveTo(-4.4, -22); ctx.quadraticCurveTo(0, -18, 4.4, -22);
    ctx.quadraticCurveTo(0, -20.4, -4.4, -22);
    ctx.closePath(); ctx.fill();
  }

  // --- arms: short, thick, and they end in a hand ----------------------------
  const working = (p.act || 0) > 0;
  if (T.puff) {
    ctx.fillStyle = T.col;
    ctx.beginPath(); ctx.arc(-6.4, -20.6, 3.8, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(6.4, -20.6, 3.8, 0, TAU); ctx.fill();
  }
  for (const side of [-1, 1]) {
    const sa = working ? (p.sweep || 0) * 0.8 * side : (walking ? Math.sin(ph) * 0.42 * side : 0.06 * side);
    const sx = side * 6.2, sy = -20.5;
    const ex = sx + side * 3 + Math.cos(a + sa) * (working ? 9 : 2.4);
    const ey = sy + 8 + Math.sin(a + sa) * (working ? 5 : 1.4);
    ctx.strokeStyle = L.skin; ctx.lineWidth = 4.4;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + side * 2.6, sy + 5, ex, ey); ctx.stroke();
    ctx.fillStyle = L.skin;
    ctx.beginPath(); ctx.arc(ex, ey, 2.7, 0, TAU); ctx.fill();
  }

  if (W && W.kind === 'shawl') {
    ctx.fillStyle = W.col;
    ctx.beginPath();
    ctx.moveTo(-9.4, -22); ctx.quadraticCurveTo(-11, -13, -7, -9);
    ctx.lineTo(7, -9); ctx.quadraticCurveTo(11, -13, 9.4, -22);
    ctx.quadraticCurveTo(0, -25, -9.4, -22);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.stroke();
  } else if (W && W.kind === 'cardigan') {
    ctx.fillStyle = W.col;
    box(ctx, -9.6, -22.5, 4.6, 14, 2.2); ctx.fill();
    box(ctx, 5, -22.5, 4.6, 14, 2.2); ctx.fill();
  } else if (W && W.kind === 'dupatta') {
    ctx.fillStyle = W.col;
    ctx.beginPath();
    ctx.moveTo(-6.6, -22.5);
    ctx.quadraticCurveTo(2, -16, 7 + sway * 0.8, hem - 1);
    ctx.lineTo(10.6 + sway, hem);
    ctx.quadraticCurveTo(5.4, -15, -3.6, -22.5);
    ctx.closePath(); ctx.fill();
  }

  // --- the head, which is most of the charm ----------------------------------
  ctx.fillStyle = L.skin;
  ctx.beginPath(); ctx.arc(0, HY, HEAD, 0, TAU); ctx.fill();
  ctx.strokeStyle = ink; ctx.lineWidth = 1.1; ctx.stroke();

  ctx.fillStyle = L.hair;                        // a cap, with a fringe under it
  ctx.beginPath();
  if (away) {
    ctx.arc(0, HY, HEAD + 0.4, 0, TAU);
  } else {
    ctx.arc(0, HY, HEAD + 0.4, Math.PI * 1.02, Math.PI * 1.98);
    ctx.quadraticCurveTo(HEAD * 0.52, HY - 2.2, HEAD * 0.18, HY - 4.8);
    ctx.quadraticCurveTo(-HEAD * 0.18, HY - 0.6, -HEAD * 0.56, HY - 4.6);
    ctx.quadraticCurveTo(-HEAD * 0.84, HY - 6.2, -HEAD - 0.4, HY - 2.4);
  }
  ctx.closePath();
  ctx.fill();

  if (W && W.kind === 'odhni') {
    ctx.fillStyle = W.col;
    ctx.beginPath();
    ctx.moveTo(-HEAD - 1.8, HY + 3.5);
    ctx.quadraticCurveTo(-HEAD - 3, HY - HEAD - 4.4, 0, HY - HEAD - 4.8);
    ctx.quadraticCurveTo(HEAD + 3, HY - HEAD - 4.4, HEAD + 1.8, HY + 3.5);
    ctx.quadraticCurveTo(HEAD * 0.5, HY - 3.4, 0, HY - 3.6);
    ctx.quadraticCurveTo(-HEAD * 0.5, HY - 3.4, -HEAD - 1.8, HY + 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.stroke();
  }

  if (!away) {
    const ex = fx * 1.2;
    for (const side of [-1, 1]) {                // big eyes, low and wide
      const x = ex + side * 4.1, y = HY + 2.2;
      ctx.fillStyle = '#fdf6ee';
      ctx.beginPath(); ctx.ellipse(x, y, 3.1, 3.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#2b1a1c';
      ctx.beginPath(); ctx.ellipse(x + ex * 0.3, y + 0.35, 2.25, 2.7, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x - 0.85 + ex * 0.3, y - 1.05, 1, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#2b1a1c'; ctx.lineWidth = 0.95;     // kajal along the top
      ctx.beginPath(); ctx.arc(x, y, 3.35, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(228,124,112,0.42)';                // round cheeks
    ctx.beginPath(); ctx.ellipse(ex - 6.5, HY + 4.8, 2.6, 1.8, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(ex + 6.5, HY + 4.8, 2.6, 1.8, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#8a4b3c'; ctx.lineWidth = 1;          // a small happy mouth
    ctx.beginPath(); ctx.arc(ex, HY + 5.2, 2.1, 0.22 * Math.PI, 0.78 * Math.PI); ctx.stroke();
    ctx.fillStyle = '#b8323f';
    ctx.beginPath(); ctx.arc(ex, HY - 4.6, 0.95, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(28,18,16,0.78)';                   // the kala teeka
    ctx.beginPath(); ctx.arc(ex - 7.5, HY + 1.2, 1, 0, TAU); ctx.fill();
  }

  if (H.kind === 'bun') {
    ctx.fillStyle = L.hair;
    ctx.beginPath(); ctx.arc(-fx * 2.5, HY - HEAD - 1.4, 5, 0, TAU); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = 0.9; ctx.stroke();
    if (H.flower) {
      ctx.fillStyle = H.flower;
      for (let i = 0; i < 6; i++) {
        const an = (i / 6) * TAU;
        ctx.beginPath(); ctx.arc(-fx * 2.5 + Math.cos(an) * 3.4, HY - HEAD - 1.4 + Math.sin(an) * 3.4, 1.7, 0, TAU); ctx.fill();
      }
      ctx.fillStyle = '#c96a1e';
      ctx.beginPath(); ctx.arc(-fx * 2.5, HY - HEAD - 1.4, 1.7, 0, TAU); ctx.fill();
    }
  }
  if (H.flower && H.kind === 'plait') {
    ctx.fillStyle = H.flower;
    for (let i = 0; i < 7; i++) {
      const an = Math.PI * (1.08 + (i / 6) * 0.84);
      ctx.beginPath(); ctx.arc(Math.cos(an) * (HEAD - 0.4), HY + Math.sin(an) * (HEAD - 0.4), 1.5, 0, TAU); ctx.fill();
    }
  }
  if (away) hairBehind();

  if (p.broom) {
    ctx.save();
    if (working) {
      ctx.translate(Math.cos(a) * 10, Math.sin(a) * 6 - 10);
      ctx.rotate(a + (p.sweep || 0) * 0.72 - Math.PI / 2);
    } else {
      ctx.translate(-fx * 4, -14);
      ctx.rotate(-0.7);
    }
    ctx.strokeStyle = '#6b4a2c'; ctx.lineWidth = 2.8;
    ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(0, 15); ctx.stroke();
    ctx.fillStyle = '#c8a05a';                   // the head of it, as a mass
    ctx.beginPath();
    ctx.moveTo(-3.2, 12);
    ctx.quadraticCurveTo(-5.6, 20, -4.4, 24);
    ctx.lineTo(4.4, 24);
    ctx.quadraticCurveTo(5.6, 20, 3.2, 12);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#8a5f34'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-3.4, 12.5); ctx.lineTo(3.4, 12.5); ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}
