// Savi, five ways.
//
// Each is a different SHAPE, not a repaint: at the size she is actually drawn
// you read her by outline long before colour. A wide triangle, a tall column
// with a sash across it, a bell with a hood, a narrow working shape, a soft
// round one. Pick by silhouette first.
//
// The small true things are shared, because every Indian child has them and
// they are what makes her a child rather than a small adult: kajal round the
// eyes, a KALA TEEKA - the little black smudge a mother puts on a cheek to turn
// away the evil eye - and payal, anklets with a bell in them.

const TAU = Math.PI * 2;

export const LOOKS = [
  {
    id: 'frock',
    name: 'The Frock',
    note: 'Madder red with white dots, a peter-pan collar, two braids and red ribbons. Everyday, and the one every Indian schoolgirl owns.',
    skin: '#c98a5e', hair: '#241619',
    skirt: { col: '#b8323f', col2: '#8f2531', len: 13, flare: 11, dots: '#f3e4dc' },
    top: { col: '#b8323f', collar: '#f3e4dc', puff: 1 },
    wrap: null,
    hair2: { kind: 'twin', tie: '#e8433f' },
  },
  {
    id: 'langa',
    name: 'The Langa',
    note: 'A long green pavadai to the ankle with a gold border, a mustard choli, and a dupatta over one shoulder. One thick plait and a jasmine gajra.',
    skin: '#bd8256', hair: '#1c1116',
    skirt: { col: '#2f6146', col2: '#204634', len: 17, flare: 7, border: '#e2b95c' },
    top: { col: '#d9a13c', collar: null, puff: 0 },
    wrap: { kind: 'dupatta', col: '#e05a3c' },
    hair2: { kind: 'plait', tie: '#1c1116', flower: '#f6f2e4' },
  },
  {
    id: 'ghagra',
    name: 'The Ghagra',
    note: 'An indigo bell of a skirt with mirrors round the hem, and an orange odhni pulled up over her head like a hood. Rajasthani, and warm.',
    skin: '#c5845a', hair: '#20141a',
    skirt: { col: '#2b3f75', col2: '#1d2c55', len: 14, flare: 15, mirror: '#e8e2c8' },
    top: { col: '#9c2f52', collar: null, puff: 0 },
    wrap: { kind: 'odhni', col: '#e2702c' },
    hair2: { kind: 'hidden', tie: '#20141a' },
  },
  {
    id: 'kurta',
    name: 'The Kurta',
    note: 'An ochre kurta to the knee over churidar, a grey wool shawl knotted across her. Two short braids. The practical one - she came to work.',
    skin: '#bf8050', hair: '#241a18',
    skirt: { col: '#8a7a56', col2: '#6c5f42', len: 10, flare: 3, trousers: '#6b6a63' },
    top: { col: '#c89440', collar: null, puff: 0 },
    wrap: { kind: 'shawl', col: '#7d7b84' },
    hair2: { kind: 'twin', tie: '#3a2a22', short: 1 },
  },
  {
    id: 'bloom',
    name: 'The Bloom',
    note: 'A long leaf-green frock with a wide sash and a cardigan the colour of dry grass. A topknot with a marigold in it.',
    skin: '#caa06f', hair: '#2a1b18',
    skirt: { col: '#4d7a3a', col2: '#395c2b', len: 16, flare: 9, sash: '#e8b45c' },
    top: { col: '#4d7a3a', collar: null, puff: 1 },
    wrap: { kind: 'cardigan', col: '#c2a878' },
    hair2: { kind: 'bun', tie: '#2a1b18', flower: '#f0a02c' },
  },
];

export const lookById = (id) => LOOKS.find((l) => l.id === id) || LOOKS[0];

/**
 * Savi herself. `p` carries x, y, face, phase, speed, act, sweep and broom.
 * Drawn in her own axes and mirrored in exactly one place, so nothing can come
 * out reversed.
 */
export function drawSaviLook(ctx, p, time, L) {
  const a = p.face;
  const walking = p.speed > 12;
  const ph = p.phase;
  const bob = walking ? Math.sin(ph * 2) * 1.6 : Math.sin(time * 1.6) * 0.7;
  const fx = Math.cos(a), fy = Math.sin(a);
  const away = fy < -0.25;
  const S = L.skirt, T = L.top;

  ctx.save();
  ctx.translate(p.x, p.y + bob);

  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(1, 5, 12, 5, 0, 0, TAU);
  ctx.fill();

  // Feet, and the payal on them.
  const st = walking ? Math.sin(ph) * 5 : 0;
  if (S.trousers) {
    ctx.fillStyle = S.trousers;
    ctx.fillRect(-7, -6 + st * 0.4, 5.4, 9);
    ctx.fillRect(2, -6 - st * 0.4, 5.4, 9);
  }
  ctx.fillStyle = L.skin;
  ctx.beginPath(); ctx.ellipse(-4.5 + fx * st * 0.5, 1 + st * 0.5, 3.4, 4.2, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(4.5 - fx * st * 0.5, 1 - st * 0.5, 3.4, 4.2, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#d8c48a';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-7, -1 + st * 0.5); ctx.lineTo(-2, -1 + st * 0.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(2, -1 - st * 0.5); ctx.lineTo(7, -1 - st * 0.5); ctx.stroke();

  // The skirt: its flare and length are the whole silhouette.
  const sway = walking ? Math.sin(ph) * 2.2 : 0;
  const hem = 2.5, top = -S.len - 8;
  ctx.fillStyle = S.col;
  ctx.beginPath();
  ctx.moveTo(-6.5, top);
  ctx.quadraticCurveTo(-S.flare + sway, top * 0.4, -S.flare * 0.86 + sway, hem);
  ctx.lineTo(S.flare * 0.86 + sway, hem);
  ctx.quadraticCurveTo(S.flare + sway, top * 0.4, 6.5, top);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = S.col2;                       // the shaded side
  ctx.beginPath();
  ctx.moveTo(1, top);
  ctx.quadraticCurveTo(S.flare + sway, top * 0.4, S.flare * 0.86 + sway, hem);
  ctx.lineTo(1, hem);
  ctx.closePath();
  ctx.fill();
  if (S.dots) {
    ctx.fillStyle = S.dots;
    for (let i = 0; i < 9; i++) {
      const dx = -S.flare * 0.7 + (i % 3) * S.flare * 0.7 + sway * 0.6;
      const dy = top + 4 + Math.floor(i / 3) * ((hem - top) / 3.4);
      ctx.beginPath(); ctx.arc(dx, dy, 1.15, 0, TAU); ctx.fill();
    }
  }
  if (S.border) {
    ctx.strokeStyle = S.border; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-S.flare * 0.86 + sway, hem - 1); ctx.lineTo(S.flare * 0.86 + sway, hem - 1); ctx.stroke();
  }
  if (S.mirror) {
    ctx.fillStyle = S.mirror;
    for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.arc(i * (S.flare / 3.6) + sway, hem - 2.4, 0.95, 0, TAU); ctx.fill(); }
  }
  if (S.sash) {
    ctx.fillStyle = S.sash;
    ctx.fillRect(-7.5, top + 1, 15, 3);
  }

  // The bodice.
  ctx.fillStyle = T.col;
  ctx.beginPath();
  ctx.moveTo(-7, top + 2);
  ctx.quadraticCurveTo(-8.6, -14, -6.6, -20);
  ctx.lineTo(6.6, -20);
  ctx.quadraticCurveTo(8.6, -14, 7, top + 2);
  ctx.closePath();
  ctx.fill();
  if (T.puff) {
    ctx.beginPath(); ctx.arc(-7.6, -17.5, 3.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(7.6, -17.5, 3.4, 0, TAU); ctx.fill();
  }
  if (T.collar && !away) {
    ctx.fillStyle = T.collar;
    ctx.beginPath();
    ctx.moveTo(-5, -19.5); ctx.quadraticCurveTo(0, -15.5, 5, -19.5);
    ctx.quadraticCurveTo(0, -18, -5, -19.5);
    ctx.closePath(); ctx.fill();
  }

  // What she has over it.
  const W = L.wrap;
  if (W && W.kind === 'shawl') {
    ctx.fillStyle = W.col;
    ctx.beginPath();
    ctx.moveTo(-9, -20); ctx.quadraticCurveTo(-11, -11, -6.5, -7);
    ctx.lineTo(6.5, -7); ctx.quadraticCurveTo(11, -11, 9, -20);
    ctx.quadraticCurveTo(0, -23, -9, -20);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.fillRect(1, -21, 8, 14);
  } else if (W && W.kind === 'cardigan') {
    ctx.fillStyle = W.col;
    ctx.fillRect(-9.4, -20.5, 4.4, 15);
    ctx.fillRect(5, -20.5, 4.4, 15);
    ctx.beginPath(); ctx.arc(-8.2, -18.5, 3.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(8.2, -18.5, 3.2, 0, TAU); ctx.fill();
  } else if (W && W.kind === 'dupatta') {
    ctx.fillStyle = W.col;                      // across one shoulder, fluttering
    ctx.beginPath();
    ctx.moveTo(-7.5, -21);
    ctx.quadraticCurveTo(2, -14, 7 + sway * 0.7, top + 3);
    ctx.lineTo(10.5 + sway, top + 4);
    ctx.quadraticCurveTo(5, -13, -4.5, -21);
    ctx.closePath(); ctx.fill();
  } else if (W && W.kind === 'odhni') {
    ctx.fillStyle = W.col;                      // over the head, falling behind
    ctx.beginPath();
    ctx.moveTo(-10, -20);
    ctx.quadraticCurveTo(-12, -30, 0, -34);
    ctx.quadraticCurveTo(12, -30, 10, -20);
    ctx.quadraticCurveTo(4, -23, 0, -23);
    ctx.quadraticCurveTo(-4, -23, -10, -20);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.moveTo(2, -33); ctx.quadraticCurveTo(12, -30, 10, -20); ctx.lineTo(3, -22);
    ctx.closePath(); ctx.fill();
  }

  // Working: her arms go across her.
  if ((p.act || 0) > 0) {
    const sw = p.sweep || 0;
    const ax = Math.cos(a + sw * 0.8), ay = Math.sin(a + sw * 0.8);
    ctx.strokeStyle = L.skin;
    ctx.lineWidth = 4.2;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-5, -15); ctx.quadraticCurveTo(ax * 8, -14 + ay * 5, ax * 15, -11 + ay * 9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(5, -15); ctx.quadraticCurveTo(ax * 10, -13 + ay * 5, ax * 17, -9 + ay * 9); ctx.stroke();
  }

  // The broom, when she has it.
  if (p.broom) {
    const sweeping = (p.act || 0) > 0;
    ctx.save();
    if (sweeping) {
      ctx.translate(Math.cos(a) * 9, Math.sin(a) * 6 - 8);
      ctx.rotate(a + (p.sweep || 0) * 0.72 - Math.PI / 2);
    } else {
      ctx.translate(-fx * 3, -12);
      ctx.rotate(-0.72);
    }
    ctx.strokeStyle = '#6b4a2c'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, sweeping ? -14 : -13); ctx.lineTo(0, sweeping ? 16 : 15); ctx.stroke();
    ctx.strokeStyle = '#c8a05a'; ctx.lineWidth = 1.5;
    for (let i = -4; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 0.5, sweeping ? 13 : 12);
      ctx.lineTo(i * 1.9, (sweeping ? 24 : 22) - Math.abs(i) * 0.5);
      ctx.stroke();
    }
    ctx.strokeStyle = '#8a5f34'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(-2.6, sweeping ? 12 : 11); ctx.lineTo(2.6, sweeping ? 12 : 11); ctx.stroke();
    ctx.restore();
  }

  // Hair behind the head, and which side of it depends on her facing.
  const swing = walking ? Math.sin(ph) * 1.7 : Math.sin(time * 1.2) * 0.7;
  const toward = Math.max(0, Math.min(1, (fy + 1) / 2));
  const H = L.hair2;
  const behind = () => {
    if (H.kind === 'hidden' || H.kind === 'bun') return;
    ctx.strokeStyle = L.hair;
    ctx.lineCap = 'round';
    const tipY = H.short ? -18 - toward * 9 : -12 - toward * 21;
    if (H.kind === 'twin') {
      ctx.lineWidth = 2.9;
      for (const side of [-1, 1]) {
        const tx = side * 7.5 - fx * 3 + swing * 0.6;
        ctx.beginPath();
        ctx.moveTo(side * 5.4 - fx * 2, -27);
        ctx.quadraticCurveTo(tx * 1.1, (tipY - 27) * 0.45 - 21, tx, tipY);
        ctx.stroke();
        ctx.fillStyle = H.tie;
        ctx.beginPath(); ctx.arc(tx, tipY, 1.8, 0, TAU); ctx.fill();
      }
    } else {
      ctx.lineWidth = 4;
      const tx = -fx * 8.5 + swing;
      ctx.beginPath();
      ctx.moveTo(-fx * 3, -27.5);
      ctx.quadraticCurveTo(tx * 0.55, (tipY - 27.5) * 0.45 - 21.5, tx, tipY);
      ctx.stroke();
      ctx.fillStyle = H.tie;
      ctx.beginPath(); ctx.arc(tx, tipY, 2, 0, TAU); ctx.fill();
    }
  };
  if (!away) behind();

  // Head.
  ctx.fillStyle = L.hair;
  ctx.beginPath(); ctx.arc(0, -25.5, 7.4, 0, TAU); ctx.fill();
  if (!away) {
    ctx.fillStyle = L.skin;
    ctx.beginPath(); ctx.ellipse(fx * 1.4, -24.6, 5.2, 5.6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = L.hair;                     // the fringe, and a centre parting
    ctx.beginPath(); ctx.ellipse(fx * 1.4, -28.4, 5.6, 3.4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1b120f';                  // kajal
    ctx.fillRect(fx * 1.4 - 2.7, -25.5, 1.7, 2);
    ctx.fillRect(fx * 1.4 + 1.1, -25.5, 1.7, 2);
    ctx.fillStyle = '#b8323f';                  // a small bindi
    ctx.beginPath(); ctx.arc(fx * 1.4, -27.4, 0.8, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(20,14,12,0.85)';      // the kala teeka, to turn the eye
    ctx.beginPath(); ctx.arc(fx * 1.4 - 3.9, -23.2, 0.85, 0, TAU); ctx.fill();
  }
  if (H.kind === 'bun') {
    ctx.fillStyle = L.hair;
    ctx.beginPath(); ctx.arc(-fx * 2, -32.5, 4.2, 0, TAU); ctx.fill();
    if (H.flower) {
      ctx.fillStyle = H.flower;
      for (let i = 0; i < 5; i++) {
        const an = (i / 5) * TAU;
        ctx.beginPath(); ctx.arc(-fx * 2 + Math.cos(an) * 3.1, -32.5 + Math.sin(an) * 3.1, 1.5, 0, TAU); ctx.fill();
      }
    }
  }
  if (H.flower && H.kind === 'plait') {         // a gajra round the crown
    ctx.fillStyle = H.flower;
    for (let i = 0; i < 6; i++) {
      const an = Math.PI + (i / 5) * Math.PI;
      ctx.beginPath(); ctx.arc(Math.cos(an) * 7.2, -25.5 + Math.sin(an) * 7.2, 1.3, 0, TAU); ctx.fill();
    }
  }
  if (away) behind();

  ctx.restore();
}
