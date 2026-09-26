// THE FACES, in the Gond manner.
//
// Hades puts the speaker at the edge of the screen, large, with the world still
// running behind, and animates them while they talk. This is that, drawn in the
// grammar of Pardhan Gond painting (see savi-gond.js): soot outline, flat
// pigment, and every field combed with its own infill.
//
// Gond has no tradition of portraiture and no interest in likeness. A figure is
// an assembly of flat patterned parts, frontal, wide-eyed, identified by its
// ATTRIBUTES - what it carries, what animal stands with it, what grows out of
// it - rather than by its features. So each of these is built the same way and
// told apart by pigment, infill and attribute:
//
//   SAVITRI   geru red, dot-lines. The sun disc behind her head: she is named
//             for Savitr, and she was a boon of the sun. A long braid of
//             crescents. She looks straight out, level, and does not blink much.
//   SATYAVAN  leaf green, young shoots. Leaves growing out of his shoulders,
//             because he is a year from the forest and a year from the ground.
//             The axe he went up the hill with.
//   YAMA      indigo and soot, fish scales. Buffalo horns, because the buffalo
//             carries him. The noose. A crown of dots. He is the largest of
//             them and the only one drawn with no white in his cloth.
//   NARADA    turmeric yellow, seeds. His veena, and birds - he goes between
//             the worlds carrying news, and news in Gond painting has wings.
//   KEEPER    earth and limestone, comb-lines. An old woman of this valley,
//             not of the legend, so she is the plainest of them.
//
// Everything is a function of position and time. Nothing is random per frame.

import { G, field, blob, limb, leaf, eye, disc, bird } from './savi-gond.js';

const TAU = Math.PI * 2;
const W = 220, H = 300;
export const FACE = { w: W, h: H };

const P = {
  savitri: {
    cloth: G.geru, cloth2: G.geruDark, motif: 'dotLines', on: 'rgba(245,225,190,0.75)',
    trim: G.haldi, hair: '#160f12', halo: '#e2a129', pitch: 9,
  },
  satyavan: {
    cloth: G.patta, cloth2: G.pattaDark, motif: 'shoots', on: 'rgba(240,235,200,0.6)',
    trim: G.haldiPale, hair: '#1a1410', halo: '#4f8b3f', pitch: 14,
  },
  yama: {
    cloth: G.neelDark, cloth2: '#120c22', motif: 'scales', on: 'rgba(150,180,235,0.5)',
    trim: G.geru, hair: '#0d0912', halo: '#2d4f9e', pitch: 12,
  },
  narada: {
    cloth: G.haldi, cloth2: '#b0742a', motif: 'seeds', on: 'rgba(70,40,20,0.55)',
    trim: G.chuna, hair: '#efe7d6', halo: '#e2a129', pitch: 12,
  },
  keeper: {
    cloth: G.mitti, cloth2: '#5f4022', motif: 'comb', on: 'rgba(240,227,200,0.5)',
    trim: G.chuna, hair: '#ded6c6', halo: '#8a5a2b', pitch: 7,
  },
};

/** A blink that is a fact of the clock, not a coin toss: never twitchy. */
function blink(t, seed) {
  const cycle = 4.4 + seed * 1.7;
  const k = (t + seed * 3.1) % cycle;
  return k < 0.16 ? Math.sin((k / 0.16) * Math.PI) : 0;
}

/**
 * One portrait, in a 220 x 300 box.
 *
 *   k     0..1, the entry: she slides up and opens out as she arrives
 *   emph  0..1, the beat on a new line - Hades leans its portraits into the
 *         words, and a still picture with a voice is a slideshow
 */
export function drawPortrait(ctx, who, x, y, s, t, k = 1, emph = 0) {
  const p = P[who] || P.keeper;
  const big = who === 'yama';

  ctx.save();
  ctx.translate(x, y + (1 - k) * 30);
  ctx.scale(s / W, s / W);
  ctx.globalAlpha = k;

  // The breath, and the lean into a new line.
  const breath = Math.sin(t * 1.35) * 2.6;
  const lean = emph * emph;
  ctx.translate(W / 2, H);
  ctx.scale(1 + lean * 0.035, 1 + lean * 0.05 - breath * 0.0012);
  ctx.rotate(Math.sin(t * 0.7) * 0.012 + lean * 0.02);
  ctx.translate(-W / 2, -H + breath);

  // The wash behind, which in a Gond panel would be the flat ground colour.
  const bg = ctx.createRadialGradient(W / 2, H * 0.44, 10, W / 2, H * 0.44, W * 0.8);
  bg.addColorStop(0, hexA(p.halo, 0.42));
  bg.addColorStop(1, hexA(p.halo, 0));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  if (big) yama(ctx, p, t, emph);
  else bust(ctx, p, who, t, emph);

  ctx.restore();
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// --- the common bust ---------------------------------------------------------

function bust(c, p, who, t, emph) {
  const cx = W / 2, cy = H * 0.42;
  const fill = { fill: p.cloth, motif: p.motif, on: p.on, pitch: p.pitch };
  const sway = Math.sin(t * 0.9) * 2;

  // A disc behind the head. Savitri's is the sun itself; for the others it is
  // the plain moon of a Gond sky.
  disc(c, cx, cy - 18, who === 'savitri' ? 62 : 54, {
    fill: hexA(p.halo, who === 'savitri' ? 0.95 : 0.5),
    motif: who === 'savitri' ? 'dots' : null, on: 'rgba(90,40,20,0.4)', pitch: 11,
    rays: who === 'savitri' ? 20 : 0, spin: t * 0.05, lw: 1.6,
  });

  // Shoulders and body: one broad field, the way a Gond torso is one shape.
  field(c, (g) => {
    g.moveTo(cx - 74, H + 6);
    g.quadraticCurveTo(cx - 70, H * 0.66, cx - 34, H * 0.58);
    g.quadraticCurveTo(cx, H * 0.54, cx + 34, H * 0.58);
    g.quadraticCurveTo(cx + 70, H * 0.66, cx + 74, H + 6);
    g.closePath();
  }, { ...fill, box: { x: cx - 80, y: H * 0.5, w: 160, h: H * 0.56 } });

  // The shawl over one shoulder, in the second pigment, with its own infill.
  field(c, (g) => {
    g.moveTo(cx - 62, H + 6);
    g.quadraticCurveTo(cx - 52, H * 0.72, cx - 14, H * 0.6);
    g.quadraticCurveTo(cx - 4, H * 0.78, cx - 18, H + 6);
    g.closePath();
  }, {
    fill: p.cloth2, motif: 'dashes', on: hexA(p.trim, 0.7), pitch: 10,
    box: { x: cx - 70, y: H * 0.56, w: 70, h: H * 0.5 },
  });

  // Arms, as tapering limbs. Satyavan's carries the axe, Narada's the veena.
  const armY = H * 0.74;
  limb(c, [[cx + 52, armY - 12], [cx + 66, armY + 22], [cx + 58 + emph * 6, armY + 58]], 9, 6,
    { fill: G.skin, motif: 'comb', on: 'rgba(60,30,15,0.35)', pitch: 6 });
  limb(c, [[cx - 52, armY - 12], [cx - 66, armY + 22], [cx - 58 - emph * 6, armY + 58]], 9, 6,
    { fill: G.skin, motif: 'comb', on: 'rgba(60,30,15,0.35)', pitch: 6 });

  if (who === 'satyavan') {
    // Leaves out of his shoulders, and the axe.
    for (let i = 0; i < 5; i++) {
      const a = -0.5 - i * 0.42;
      leaf(c, cx - 52 + Math.cos(a) * 26, H * 0.6 + Math.sin(a) * 22, 17, 9, a + 0.4,
        { fill: G.patta, motif: 'comb', on: 'rgba(240,240,200,0.5)', pitch: 5 });
    }
    limb(c, [[cx + 62, armY + 60], [cx + 70, armY + 6]], 3.5, 3.5, { fill: G.mitti, ink: true });
    field(c, (g) => {
      g.moveTo(cx + 62, armY - 4);
      g.lineTo(cx + 92, armY - 16);
      g.quadraticCurveTo(cx + 96, armY + 4, cx + 78, armY + 14);
      g.closePath();
    }, { fill: G.ash, motif: 'comb', on: 'rgba(240,240,240,0.4)', pitch: 5, box: { x: cx + 60, y: armY - 20, w: 40, h: 40 } });
  }

  if (who === 'narada') {
    // The veena across him, and the birds that carry what he says.
    limb(c, [[cx - 78, armY + 46], [cx + 6, armY - 6], [cx + 74, armY - 44]], 7, 7,
      { fill: G.mitti, motif: 'comb', on: 'rgba(240,220,170,0.5)', pitch: 5 });
    blob(c, cx - 78, armY + 46, 20, 20, 0, { fill: G.mittiPale, motif: 'scales', on: 'rgba(60,30,10,0.4)', pitch: 9 });
    blob(c, cx + 76, armY - 46, 13, 13, 0, { fill: G.mittiPale, motif: 'dots', on: 'rgba(60,30,10,0.4)', pitch: 7 });
    for (let i = 0; i < 3; i++) {
      const a = t * 0.5 + i * 2.1;
      bird(c, cx + 60 + Math.cos(a) * 26, 52 + Math.sin(a) * 16 + i * 8, 11,
        { fill: G.chuna, motif: 'dots', on: 'rgba(60,40,20,0.5)', pitch: 6, lw: 1.6 });
    }
  }

  if (who === 'savitri') {
    // The thread at her wrist: what the women wind round the trunk.
    c.strokeStyle = G.chuna; c.lineWidth = 2;
    c.beginPath(); c.arc(cx - 58, armY + 52, 8, 0, TAU); c.stroke();
  }

  if (who === 'keeper') {
    // A stick, because she has not walked past that stone in two winters.
    limb(c, [[cx + 60, armY + 62], [cx + 72, armY - 30]], 4, 3.5,
      { fill: G.mitti, motif: 'comb', on: 'rgba(240,227,200,0.4)', pitch: 6 });
  }

  // The neck, then the head: a plain field, because the pattern is in the cloth.
  limb(c, [[cx, cy + 30], [cx, cy + 56]], 15, 19, { fill: G.skinDark, ink: false });
  field(c, (g) => g.ellipse(cx, cy, 44, 50, 0, 0, TAU),
    { fill: G.skin, box: { x: cx - 44, y: cy - 50, w: 88, h: 100 }, lw: 2.6 });

  // Hair: a field of crescents over the crown, and the braid down one side.
  field(c, (g) => {
    g.moveTo(cx - 46, cy + 4);
    g.quadraticCurveTo(cx - 50, cy - 56, cx, cy - 56);
    g.quadraticCurveTo(cx + 50, cy - 56, cx + 46, cy + 4);
    g.quadraticCurveTo(cx + 30, cy - 22, cx, cy - 24);
    g.quadraticCurveTo(cx - 30, cy - 22, cx - 46, cy + 4);
    g.closePath();
  }, {
    fill: p.hair, motif: who === 'narada' || who === 'keeper' ? 'comb' : 'crescents',
    on: who === 'narada' || who === 'keeper' ? 'rgba(90,70,50,0.5)' : 'rgba(210,190,220,0.4)',
    pitch: 9, box: { x: cx - 50, y: cy - 60, w: 100, h: 70 },
  });
  if (who === 'savitri') {
    limb(c, [[cx + 40, cy - 6], [cx + 62, cy + 34], [cx + 56 + sway, cy + 92]], 9, 5,
      { fill: p.hair, motif: 'crescents', on: 'rgba(210,190,220,0.45)', pitch: 10 });
  }
  if (who === 'keeper') {
    blob(c, cx + 40, cy - 22, 15, 13, 0.3, { fill: p.hair, motif: 'comb', on: 'rgba(120,100,80,0.5)', pitch: 5 });
  }
  if (who === 'narada') {
    limb(c, [[cx, cy - 54], [cx + 4, cy - 76]], 5, 3, { fill: p.hair, ink: true });
  }

  // The face. Mostly eye.
  const bl = blink(t, who.length * 0.7);
  eye(c, cx - 17, cy + 2, 11, 8, Math.sin(t * 0.4) * 0.5, bl);
  eye(c, cx + 17, cy + 2, 11, 8, Math.sin(t * 0.4) * 0.5, bl);
  c.strokeStyle = G.soot; c.lineWidth = 2.2; c.lineCap = 'round';
  c.beginPath();                                    // brows
  c.moveTo(cx - 29, cy - 11); c.quadraticCurveTo(cx - 17, cy - 17, cx - 6, cy - 12);
  c.moveTo(cx + 29, cy - 11); c.quadraticCurveTo(cx + 17, cy - 17, cx + 6, cy - 12);
  c.moveTo(cx, cy + 6); c.lineTo(cx, cy + 20);      // nose, one line
  c.stroke();
  c.lineWidth = 2;
  c.beginPath();                                    // mouth: a line that speaks
  const open = who === 'keeper' || who === 'narada' ? 2 + emph * 3 : 1 + emph * 2;
  c.moveTo(cx - 11, cy + 29);
  c.quadraticCurveTo(cx, cy + 29 + open * 2, cx + 11, cy + 29);
  c.stroke();
  c.lineCap = 'butt';

  if (who === 'savitri' || who === 'keeper') {      // the bindi
    c.fillStyle = who === 'savitri' ? G.geru : G.mitti;
    c.beginPath(); c.arc(cx, cy - 22, 4, 0, TAU); c.fill();
  }
  // Earrings and a collar of dots: Gond figures are always ornamented.
  c.fillStyle = p.trim;
  c.beginPath(); c.arc(cx - 45, cy + 16, 5, 0, TAU); c.arc(cx + 45, cy + 16, 5, 0, TAU); c.fill();
  c.strokeStyle = G.soot; c.lineWidth = 1.4;
  c.beginPath(); c.arc(cx - 45, cy + 16, 5, 0, TAU); c.stroke();
  c.beginPath(); c.arc(cx + 45, cy + 16, 5, 0, TAU); c.stroke();
  c.fillStyle = p.trim;
  for (let i = -3; i <= 3; i++) {
    c.beginPath(); c.arc(cx + i * 13, H * 0.585 + Math.abs(i) * 2.5, 3.4, 0, TAU); c.fill();
  }
}

// --- Yama --------------------------------------------------------------------

function yama(c, p, t, emph) {
  const cx = W / 2, cy = H * 0.40;

  // The dark disc he stands against, ringed rather than rayed.
  disc(c, cx, cy - 10, 74, { fill: 'rgba(20,14,34,0.85)', motif: 'scales', on: 'rgba(90,120,190,0.3)', pitch: 14, rays: 0, lw: 2 });
  c.strokeStyle = hexA(G.geru, 0.6); c.lineWidth = 2;
  for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(cx, cy - 10, 80 + i * 11, 0, TAU); c.stroke(); }

  // Shoulders, wider than anyone else's.
  field(c, (g) => {
    g.moveTo(cx - 88, H + 6);
    g.quadraticCurveTo(cx - 84, H * 0.62, cx - 40, H * 0.54);
    g.quadraticCurveTo(cx, H * 0.5, cx + 40, H * 0.54);
    g.quadraticCurveTo(cx + 84, H * 0.62, cx + 88, H + 6);
    g.closePath();
  }, { fill: p.cloth, motif: 'scales', on: p.on, pitch: 13, box: { x: cx - 92, y: H * 0.46, w: 184, h: H * 0.6 } });

  // The noose, held out. It is a loop of rope and nothing more frightening.
  const swing = Math.sin(t * 0.8) * 5 + emph * 8;
  limb(c, [[cx + 60, H * 0.78], [cx + 92, H * 0.66], [cx + 104 + swing, H * 0.5]], 4, 3.5,
    { fill: G.geru, motif: 'comb', on: 'rgba(255,220,180,0.4)', pitch: 5 });
  field(c, (g) => g.ellipse(cx + 104 + swing, H * 0.42, 22, 15, 0.2, 0, TAU),
    { fill: 'rgba(0,0,0,0)', ink: G.geru, lw: 3.4 });

  // Arms.
  limb(c, [[cx - 62, H * 0.68], [cx - 80, H * 0.76], [cx - 72 - emph * 6, H * 0.88]], 11, 7,
    { fill: '#4a3f63', motif: 'comb', on: 'rgba(160,190,240,0.3)', pitch: 6 });

  // Head, and the buffalo horns: the buffalo is what he rides.
  limb(c, [[cx, cy + 26], [cx, cy + 54]], 17, 21, { fill: '#3a3152', ink: false });
  field(c, (g) => g.ellipse(cx, cy, 48, 54, 0, 0, TAU),
    { fill: '#4a3f63', motif: 'dots', on: 'rgba(150,180,235,0.35)', pitch: 11, box: { x: cx - 48, y: cy - 54, w: 96, h: 108 }, lw: 2.8 });

  for (const sgn of [-1, 1]) {
    limb(c, [
      [cx + sgn * 40, cy - 30], [cx + sgn * 74, cy - 46], [cx + sgn * 92, cy - 22], [cx + sgn * 84, cy + 4],
    ], 11, 3, { fill: G.chuna, motif: 'comb', on: 'rgba(60,40,30,0.45)', pitch: 6 });
  }

  // A crown of dots above the brow.
  c.fillStyle = G.geru;
  for (let i = -3; i <= 3; i++) {
    c.beginPath(); c.arc(cx + i * 12, cy - 44 + Math.abs(i) * 3.2, 4.2, 0, TAU); c.fill();
  }

  // The face: white eyes, wide open. Nothing else needs to be frightening.
  const bl = blink(t, 2.3);
  eye(c, cx - 19, cy + 2, 13, 10, 0, bl);
  eye(c, cx + 19, cy + 2, 13, 10, 0, bl);
  c.strokeStyle = G.soot; c.lineWidth = 2.6; c.lineCap = 'round';
  c.beginPath();
  c.moveTo(cx - 34, cy - 14); c.lineTo(cx - 6, cy - 8);
  c.moveTo(cx + 34, cy - 14); c.lineTo(cx + 6, cy - 8);
  c.moveTo(cx, cy + 8); c.lineTo(cx, cy + 22);
  c.stroke();
  c.strokeStyle = G.geru; c.lineWidth = 2.4;
  c.beginPath();
  c.moveTo(cx - 14, cy + 32);
  c.quadraticCurveTo(cx, cy + 32 + 3 + emph * 5, cx + 14, cy + 32);
  c.stroke();
  c.lineCap = 'butt';

  // Three marks on the brow, in red ochre.
  c.strokeStyle = G.geru; c.lineWidth = 2;
  c.beginPath();
  for (let i = -1; i <= 1; i++) { c.moveTo(cx + i * 9, cy - 34); c.lineTo(cx + i * 9, cy - 24); }
  c.stroke();
}
