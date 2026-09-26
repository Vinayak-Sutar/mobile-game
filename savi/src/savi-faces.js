// THE FACES, in the Gond manner — second attempt, after looking harder.
//
// The first one was wrong in a way worth writing down, because it is the
// mistake anyone makes coming to this tradition from outside: I drew shapes and
// then decorated them. Gond does not decorate. Every source says the same
// thing - there is no negative space in a Gond painting. Every part of the
// surface is activated. A form is not an outline with pattern added inside it;
// the form IS the pattern, and the contour is only where it stops. A tiger is
// not a tiger shape with dots on: it is a lattice of dots and dashes and scales
// that happens to be tiger-shaped, and the density of it is what makes the
// thing look alive rather than posed.
//
// So this version:
//
//   - fills EVERYTHING, including the skin and the background. No bare fields.
//   - gives one figure several colour zones, each with its own infill, because
//     colour moves through a Gond form by changing the pattern, not by blending.
//   - makes the figures long and sinuous and lets them fill the frame, instead
//     of sitting them in the middle as tidy little busts.
//   - grows the attributes out of the figures - hair that becomes a branch,
//     shoulders that sprout leaves - because everything in this worldview is in
//     relationship with everything else.
//
// And it fixes a plain iconographic error. I had given Yama the buffalo's horns
// on his own head. The buffalo is his VAHANA, the animal he rides; the noose,
// the pasha, is what he carries. He is here on the buffalo now, as he should
// be, with the noose in one hand and the rod in the other.

import { G, field, blob, limb, leaf, eye, disc, bird, motif } from './savi-gond.js';

const TAU = Math.PI * 2;
const W = 220, H = 300;
export const FACE = { w: W, h: H };

/** A blink on a clock, never a coin toss: nothing here twitches. */
function blink(t, seed) {
  const cycle = 4.6 + seed * 1.7;
  const k = (t + seed * 3.1) % cycle;
  return k < 0.17 ? Math.sin((k / 0.17) * Math.PI) : 0;
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

const GROUND = {
  savitri: '#2a1020', satyavan: '#12210f', yama: '#1c0a12', narada: '#221604', keeper: '#1b1410',
};

/**
 * One portrait in a 220 x 300 box.
 *   k     0..1 the entry
 *   emph  0..1 the beat on a new line
 */
export function drawPortrait(ctx, who, x, y, s, t, k = 1, emph = 0) {
  ctx.save();
  ctx.translate(x, y + (1 - k) * 30);
  ctx.scale(s / W, s / W);
  ctx.globalAlpha = k;

  // THE GROUND. Not a gradient - a flat colour, combed, like the wall a mural
  // is painted on. Nothing in a Gond panel is left as nothing.
  ctx.fillStyle = GROUND[who] || GROUND.keeper;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  motif(ctx, { x: -10, y: -10, w: W + 20, h: H + 20 }, 'dotLines', 'rgba(240,227,200,0.09)', 11);
  motif(ctx, { x: -10, y: -10, w: W + 20, h: H + 20 }, 'crescents', 'rgba(240,227,200,0.06)', 26);
  ctx.restore();

  const breath = Math.sin(t * 1.35) * 2.4;
  const lean = emph * emph;
  ctx.translate(W / 2, H);
  ctx.scale(1 + lean * 0.03, 1 + lean * 0.045);
  ctx.rotate(Math.sin(t * 0.7) * 0.01 + lean * 0.016);
  ctx.translate(-W / 2, -H + breath);

  if (who === 'yama') yama(ctx, t, emph);
  else if (who === 'savitri') savitri(ctx, t, emph);
  else if (who === 'satyavan') satyavan(ctx, t, emph);
  else if (who === 'narada') narada(ctx, t, emph);
  else keeper(ctx, t, emph);

  ctx.restore();
}

// --- the parts every figure is made of ------------------------------------------

/** Skin is patterned too. A face in a Gond panel is a filled field like any other. */
const SKIN = (col) => ({ fill: col, motif: 'dots', on: 'rgba(60,25,10,0.22)', pitch: 6, lw: 2.4 });

/**
 * A head: a long oval, densely filled, with the hair as a second field over it
 * and the whole thing read by one big eye.
 */
function head(c, cx, cy, rx, ry, o) {
  field(c, (g) => g.ellipse(cx, cy, rx, ry, 0, 0, TAU),
    { ...SKIN(o.skin), box: { x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2 } });
}

/** A run of dots along a curve — the collar and the bangle of every figure. */
function beads(c, x0, y0, x1, y1, n, r, col, ink = true) {
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0.5 : i / (n - 1);
    const x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k + Math.sin(k * Math.PI) * 4;
    c.fillStyle = col;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    if (ink) { c.strokeStyle = G.soot; c.lineWidth = 1.1; c.stroke(); }
  }
}

/** The face: brows, a long nose, a small mouth, and an eye that carries it. */
function features(c, cx, cy, sc, t, emph, o = {}) {
  const bl = blink(t, o.seed || 1);
  const ew = 13 * sc, eh = 9.5 * sc;
  eye(c, cx - 17 * sc, cy, ew, eh, Math.sin(t * 0.35) * 0.4, bl);
  eye(c, cx + 17 * sc, cy, ew, eh, Math.sin(t * 0.35) * 0.4, bl);
  c.strokeStyle = G.soot; c.lineWidth = 2.4 * sc; c.lineCap = 'round';
  c.beginPath();
  c.moveTo(cx - 32 * sc, cy - 13 * sc); c.quadraticCurveTo(cx - 17 * sc, cy - 20 * sc, cx - 4 * sc, cy - 13 * sc);
  c.moveTo(cx + 32 * sc, cy - 13 * sc); c.quadraticCurveTo(cx + 17 * sc, cy - 20 * sc, cx + 4 * sc, cy - 13 * sc);
  c.stroke();
  c.lineWidth = 1.9 * sc;
  c.beginPath();                                   // a long straight nose
  c.moveTo(cx, cy - 6 * sc); c.lineTo(cx - 1.5 * sc, cy + 19 * sc);
  c.quadraticCurveTo(cx + 2 * sc, cy + 22 * sc, cx + 5 * sc, cy + 19 * sc);
  c.stroke();
  const open = (o.open || 1.5) + emph * 2.4;
  c.lineWidth = 2.1 * sc;
  c.strokeStyle = o.lip || G.geruDark;
  c.beginPath();
  c.moveTo(cx - 10 * sc, cy + 30 * sc);
  c.quadraticCurveTo(cx, cy + (30 + open * 2) * sc, cx + 10 * sc, cy + 30 * sc);
  c.stroke();
  c.lineCap = 'butt';
}

// --- SAVITRI ----------------------------------------------------------------------
//
// The one who followed Death down the road and argued him out of it. Geru red,
// the colour dug out of a riverbank; dot-lines, which were Jangarh's own; and
// the sun behind her head, because she was a boon of the sun and is named for
// Savitr. Her braid does not end - it goes down and becomes a branch, the way
// everything in a Gond painting turns into everything else.

function savitri(c, t, emph) {
  const cx = W / 2, cy = 112;
  const sway = Math.sin(t * 0.8) * 2.5;

  disc(c, cx, cy - 8, 74, {
    fill: G.haldi, motif: 'dots', on: 'rgba(150,60,20,0.45)', pitch: 8,
    rays: 24, spin: t * 0.04, lw: 2,
  });

  // The sari: three zones, three infills, which is how colour moves in Gond.
  field(c, (g) => {
    g.moveTo(cx - 92, H + 8);
    g.quadraticCurveTo(cx - 80, 236, cx - 46, 196);
    g.quadraticCurveTo(cx - 20, 168, cx, 166);
    g.quadraticCurveTo(cx + 20, 168, cx + 46, 196);
    g.quadraticCurveTo(cx + 80, 236, cx + 92, H + 8);
    g.closePath();
  }, { fill: G.geru, motif: 'dotLines', on: 'rgba(248,232,205,0.85)', pitch: 8, lw: 2.6, box: { x: 18, y: 160, w: 184, h: 150 } });

  field(c, (g) => {                                // the pallu over her shoulder
    g.moveTo(cx - 78, H + 8);
    g.quadraticCurveTo(cx - 66, 240, cx - 30, 192);
    g.quadraticCurveTo(cx - 8, 214, cx - 22, H + 8);
    g.closePath();
  }, { fill: G.geruDark, motif: 'scales', on: 'rgba(248,232,205,0.7)', pitch: 10, lw: 2.2, box: { x: 20, y: 186, w: 90, h: 120 } });

  field(c, (g) => g.rect(cx - 94, 276, 188, 20), {  // the hem band
    fill: G.haldi, motif: 'crescents', on: 'rgba(120,40,20,0.7)', pitch: 11, lw: 2, box: { x: cx - 94, y: 276, w: 188, h: 20 },
  });

  // Arms: long and thin, one raised with the palm open.
  const lift = emph * 8;
  limb(c, [[cx - 44, 196], [cx - 74, 226], [cx - 80, 268]], 9, 7,
    { ...SKIN(G.skin), pitch: 5 });
  limb(c, [[cx + 44, 196], [cx + 78, 214 - lift], [cx + 86, 176 - lift]], 9, 7,
    { ...SKIN(G.skin), pitch: 5 });
  blob(c, cx + 88, 166 - lift, 12, 15, -0.2, { ...SKIN(G.skin), pitch: 4 });
  beads(c, cx + 72, 206 - lift, cx + 84, 190 - lift, 3, 3.4, G.chuna);
  beads(c, cx - 74, 250, cx - 80, 262, 3, 3.4, G.chuna);

  // Neck, long, with three lines of beads on it.
  limb(c, [[cx, 150], [cx, 182]], 15, 21, { ...SKIN(G.skinDark), pitch: 5 });
  head(c, cx, cy, 45, 53, { skin: G.skin });

  // Hair: a crown of crescents, and a braid that goes on being a plant.
  field(c, (g) => {
    g.moveTo(cx - 47, cy + 10);
    g.quadraticCurveTo(cx - 54, cy - 62, cx, cy - 60);
    g.quadraticCurveTo(cx + 54, cy - 62, cx + 47, cy + 10);
    g.quadraticCurveTo(cx + 28, cy - 26, cx, cy - 28);
    g.quadraticCurveTo(cx - 28, cy - 26, cx - 47, cy + 10);
    g.closePath();
  }, { fill: '#170f14', motif: 'crescents', on: 'rgba(214,180,220,0.5)', pitch: 8, lw: 2.4, box: { x: cx - 56, y: cy - 66, w: 112, h: 80 } });

  limb(c, [[cx + 40, cy + 2], [cx + 68, cy + 46], [cx + 74 + sway, cy + 104], [cx + 62 + sway, cy + 150]], 10, 5,
    { fill: '#170f14', motif: 'crescents', on: 'rgba(214,180,220,0.5)', pitch: 9, lw: 2.2 });
  for (let i = 0; i < 4; i++) {                    // and it puts out leaves
    const yy = cy + 60 + i * 26;
    leaf(c, cx + 76 + sway + (i & 1 ? 12 : -10), yy, 13, 6, (i & 1 ? 0.5 : -0.5) + 0.4,
      { fill: G.patta, motif: 'comb', on: 'rgba(240,240,200,0.55)', pitch: 4, lw: 1.5 });
  }

  features(c, cx, cy + 2, 1, t, emph, { seed: 1.3, lip: G.geruDark });

  // Ornament: nose ring, bindi, brow marks, ears, and a collar of three strands.
  c.fillStyle = G.geru;
  c.beginPath(); c.arc(cx, cy - 28, 4.6, 0, TAU); c.fill();
  c.strokeStyle = G.haldi; c.lineWidth = 2;
  c.beginPath(); c.arc(cx - 12, cy + 20, 9, -0.4, 2.6); c.stroke();
  c.strokeStyle = G.chuna; c.lineWidth = 1.6;
  for (let i = -1; i <= 1; i++) {
    c.beginPath(); c.arc(cx + i * 10, cy - 40, 4, Math.PI, TAU); c.stroke();
  }
  blob(c, cx - 47, cy + 16, 9, 12, 0, { fill: G.haldi, motif: 'dots', on: 'rgba(120,40,20,0.5)', pitch: 5, lw: 1.6 });
  blob(c, cx + 47, cy + 16, 9, 12, 0, { fill: G.haldi, motif: 'dots', on: 'rgba(120,40,20,0.5)', pitch: 5, lw: 1.6 });
  beads(c, cx - 34, 176, cx + 34, 176, 9, 4, G.chuna);
  beads(c, cx - 26, 190, cx + 26, 190, 7, 3.2, G.haldi);
}

// --- SATYAVAN ---------------------------------------------------------------------
//
// A year from the forest and a year from the ground. Crushed leaf green, young
// shoots, and a banyan coming up behind his shoulders - he is the one the tree
// is about. The axe he went up the hill with, on the morning of the last day.

function satyavan(c, t, emph) {
  const cx = W / 2, cy = 116;
  const sway = Math.sin(t * 0.6) * 0.05;

  // The tree behind him, which is also him.
  c.save();
  c.translate(cx, 250); c.rotate(sway * 0.3);
  limb(c, [[0, 0], [-4, -60], [2, -118]], 15, 8,
    { fill: G.mitti, motif: 'comb', on: 'rgba(245,225,190,0.45)', pitch: 6, lw: 2.2 });
  for (let i = 0; i < 7; i++) {
    const a = -2.75 + i * 0.42;
    const ex = Math.cos(a) * 88, ey = -112 + Math.sin(a) * 58;
    limb(c, [[0, -112], [ex * 0.5, ey * 0.55 - 40], [ex, ey]], 6, 3,
      { fill: G.mitti, motif: null, lw: 1.8 });
    for (let j = 0; j < 2; j++) {
      const b = a + (j - 0.5) * 0.5;
      leaf(c, ex + Math.cos(b) * 15, ey + Math.sin(b) * 13, 15, 8, b,
        { fill: j ? G.patta : G.pattaDark, motif: 'comb', on: 'rgba(240,245,200,0.5)', pitch: 4, lw: 1.5 });
    }
  }
  c.restore();

  // Body: bare chest of shoots, dhoti of comb-lines, a sash of seeds.
  field(c, (g) => {
    g.moveTo(cx - 84, H + 8);
    g.quadraticCurveTo(cx - 76, 244, cx - 44, 200);
    g.quadraticCurveTo(cx - 18, 172, cx, 170);
    g.quadraticCurveTo(cx + 18, 172, cx + 44, 200);
    g.quadraticCurveTo(cx + 76, 244, cx + 84, H + 8);
    g.closePath();
  }, { fill: G.skin, motif: 'shoots', on: 'rgba(60,90,30,0.45)', pitch: 13, lw: 2.6, box: { x: 24, y: 164, w: 172, h: 146 } });

  field(c, (g) => g.rect(cx - 86, 252, 172, 50), {
    fill: G.patta, motif: 'comb', on: 'rgba(240,245,205,0.6)', pitch: 6, lw: 2.4, box: { x: cx - 86, y: 252, w: 172, h: 50 },
  });
  field(c, (g) => {
    g.moveTo(cx - 60, 196); g.lineTo(cx + 44, 262); g.lineTo(cx + 26, 276); g.lineTo(cx - 74, 210); g.closePath();
  }, { fill: G.haldi, motif: 'seeds', on: 'rgba(70,40,15,0.55)', pitch: 10, lw: 2.2, box: { x: cx - 80, y: 190, w: 130, h: 92 } });

  // Arms. The right one holds the axe up over his shoulder.
  limb(c, [[cx - 48, 200], [cx - 76, 230], [cx - 70, 272]], 10, 7, { ...SKIN(G.skin), pitch: 5 });
  limb(c, [[cx + 48, 200], [cx + 76, 214], [cx + 70 - emph * 5, 176]], 10, 7, { ...SKIN(G.skin), pitch: 5 });
  limb(c, [[cx + 68, 186], [cx + 86, 96]], 4.5, 4,
    { fill: G.mitti, motif: 'comb', on: 'rgba(245,225,190,0.5)', pitch: 5, lw: 1.8 });
  field(c, (g) => {
    g.moveTo(cx + 82, 104); g.lineTo(cx + 124, 82);
    g.quadraticCurveTo(cx + 132, 108, cx + 106, 124); g.closePath();
  }, { fill: G.ash, motif: 'comb', on: 'rgba(245,245,245,0.45)', pitch: 5, lw: 2.2, box: { x: cx + 78, y: 76, w: 60, h: 56 } });

  limb(c, [[cx, 154], [cx, 186]], 16, 22, { ...SKIN(G.skinDark), pitch: 5 });
  head(c, cx, cy, 45, 52, { skin: G.skin });

  // Hair up in a knot, with a leaf through it.
  field(c, (g) => {
    g.moveTo(cx - 46, cy + 8);
    g.quadraticCurveTo(cx - 52, cy - 58, cx, cy - 58);
    g.quadraticCurveTo(cx + 52, cy - 58, cx + 46, cy + 8);
    g.quadraticCurveTo(cx + 26, cy - 24, cx, cy - 26);
    g.quadraticCurveTo(cx - 26, cy - 24, cx - 46, cy + 8);
    g.closePath();
  }, { fill: '#1b1410', motif: 'seeds', on: 'rgba(230,220,180,0.4)', pitch: 10, lw: 2.4, box: { x: cx - 54, y: cy - 62, w: 108, h: 76 } });
  blob(c, cx, cy - 66, 20, 16, 0, { fill: '#1b1410', motif: 'comb', on: 'rgba(230,220,180,0.45)', pitch: 5, lw: 2.2 });
  leaf(c, cx + 18, cy - 74, 18, 8, -0.5, { fill: G.patta, motif: 'comb', on: 'rgba(240,245,200,0.6)', pitch: 4, lw: 1.5 });

  features(c, cx, cy + 2, 1, t, emph, { seed: 2.1, lip: '#8a3a24' });

  // Leaves out of his shoulders, because that is what he is.
  for (let i = 0; i < 4; i++) {
    const a = -0.9 - i * 0.36;
    leaf(c, cx - 56 + Math.cos(a) * 24, 190 + Math.sin(a) * 26, 17, 8, a + 0.5,
      { fill: i & 1 ? G.patta : G.pattaDark, motif: 'comb', on: 'rgba(240,245,200,0.5)', pitch: 4, lw: 1.5 });
  }
  beads(c, cx - 30, 178, cx + 30, 178, 9, 3.6, G.patta);
  c.strokeStyle = G.chuna; c.lineWidth = 1.8;       // the sacred thread
  c.beginPath();
  c.moveTo(cx - 40, 186); c.quadraticCurveTo(cx + 6, 232, cx + 44, 250); c.stroke();
}

// --- YAMA -------------------------------------------------------------------------
//
// Dharmaraja, who keeps the accounts. His vahana is the buffalo, so he is on the
// buffalo: it fills the bottom of the panel and he rides above it. In his hands
// the pasha, the noose he carries souls away on, and the danda, the rod. Indigo
// and soot and fish scales, and red ochre for what he wears - no white in it.
// He is not a monster. He is an official, and he is going to be reasonable.

function yama(c, t, emph) {
  const cx = W / 2;
  const sway = Math.sin(t * 0.55) * 3;

  // THE BUFFALO, across the whole bottom of the panel: head, horns, muzzle, eye.
  const by = 250;
  field(c, (g) => {                                 // the great body behind
    g.moveTo(cx - 116, H + 10);
    g.quadraticCurveTo(cx - 104, by - 16, cx - 46, by - 30);
    g.quadraticCurveTo(cx, by - 40, cx + 46, by - 30);
    g.quadraticCurveTo(cx + 104, by - 16, cx + 116, H + 10);
    g.closePath();
  }, { fill: '#2a2230', motif: 'scales', on: 'rgba(150,170,220,0.4)', pitch: 13, lw: 2.6, box: { x: 0, y: by - 46, w: W, h: 80 } });

  for (const sgn of [-1, 1]) {                      // the horns, on the buffalo
    limb(c, [
      [cx + sgn * 40, by - 18], [cx + sgn * 82, by - 34], [cx + sgn * 104, by - 6], [cx + sgn * 96, by + 26],
    ], 13, 3.5, { fill: G.chuna, motif: 'comb', on: 'rgba(60,40,30,0.5)', pitch: 5, lw: 2.2 });
  }
  field(c, (g) => g.ellipse(cx, by + 6, 46, 34, 0, 0, TAU), {  // the muzzle
    fill: '#3a3040', motif: 'dots', on: 'rgba(160,180,230,0.35)', pitch: 7, lw: 2.4,
    box: { x: cx - 46, y: by - 28, w: 92, h: 68 },
  });
  c.fillStyle = G.chuna;
  c.beginPath(); c.arc(cx - 30, by + 2, 8, 0, TAU); c.arc(cx + 30, by + 2, 8, 0, TAU); c.fill();
  c.strokeStyle = G.soot; c.lineWidth = 1.8;
  c.beginPath(); c.arc(cx - 30, by + 2, 8, 0, TAU); c.stroke();
  c.beginPath(); c.arc(cx + 30, by + 2, 8, 0, TAU); c.stroke();
  c.fillStyle = G.soot;
  c.beginPath(); c.arc(cx - 30, by + 2, 3.6, 0, TAU); c.arc(cx + 30, by + 2, 3.6, 0, TAU); c.fill();
  c.beginPath(); c.ellipse(cx - 11, by + 24, 5, 4, 0, 0, TAU); c.ellipse(cx + 11, by + 24, 5, 4, 0, 0, TAU); c.fill();
  c.strokeStyle = G.geru; c.lineWidth = 2.6;        // the ring in its nose
  c.beginPath(); c.arc(cx, by + 34, 11, 0, Math.PI); c.stroke();

  // YAMA, rising out of it.
  const cy = 96;
  disc(c, cx, cy - 6, 66, {
    fill: 'rgba(24,10,20,0.9)', motif: 'scales', on: 'rgba(200,90,60,0.32)', pitch: 13, rays: 0, lw: 2,
  });
  c.strokeStyle = hexA(G.geru, 0.55); c.lineWidth = 2;
  for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(cx, cy - 6, 72 + i * 10, 0, TAU); c.stroke(); }

  field(c, (g) => {                                 // his robe
    g.moveTo(cx - 74, by - 22);
    g.quadraticCurveTo(cx - 70, 190, cx - 40, 162);
    g.quadraticCurveTo(cx, 146, cx + 40, 162);
    g.quadraticCurveTo(cx + 70, 190, cx + 74, by - 22);
    g.closePath();
  }, { fill: G.geruDark, motif: 'scales', on: 'rgba(240,190,140,0.5)', pitch: 11, lw: 2.6, box: { x: 30, y: 140, w: 160, h: 110 } });
  field(c, (g) => {
    g.moveTo(cx - 52, 176); g.lineTo(cx + 52, 176); g.lineTo(cx + 44, 196); g.lineTo(cx - 44, 196); g.closePath();
  }, { fill: G.neelDark, motif: 'dots', on: 'rgba(150,180,235,0.45)', pitch: 7, lw: 2, box: { x: cx - 54, y: 174, w: 108, h: 24 } });

  // The noose in one hand, the rod in the other.
  limb(c, [[cx - 46, 178], [cx - 82, 192], [cx - 92, 158 - emph * 6]], 10, 7,
    { fill: '#4a3f63', motif: 'dots', on: 'rgba(160,190,240,0.3)', pitch: 6, lw: 2.2 });
  limb(c, [[cx - 92, 150], [cx - 86, 58]], 5, 4.5,
    { fill: G.mitti, motif: 'comb', on: 'rgba(245,215,170,0.5)', pitch: 5, lw: 2 });
  blob(c, cx - 86, 50, 11, 11, 0, { fill: G.haldi, motif: 'dots', on: 'rgba(120,50,15,0.5)', pitch: 5, lw: 2 });

  limb(c, [[cx + 46, 178], [cx + 84, 190], [cx + 96, 156 - emph * 6]], 10, 7,
    { fill: '#4a3f63', motif: 'dots', on: 'rgba(160,190,240,0.3)', pitch: 6, lw: 2.2 });
  c.strokeStyle = G.geru; c.lineWidth = 3.4;
  c.beginPath();
  c.moveTo(cx + 96, 150);
  c.quadraticCurveTo(cx + 122, 120 + sway, cx + 104, 92 + sway);
  c.stroke();
  field(c, (g) => g.ellipse(cx + 96, 76 + sway, 24, 17, 0.25, 0, TAU),
    { fill: 'rgba(0,0,0,0)', ink: G.geru, lw: 3.6 });

  limb(c, [[cx, 138], [cx, 172]], 18, 24, { fill: '#3a3152', motif: 'dots', on: 'rgba(150,180,235,0.3)', pitch: 6, lw: 2.2 });
  field(c, (g) => g.ellipse(cx, cy, 47, 54, 0, 0, TAU),
    { fill: '#4a3f63', motif: 'dots', on: 'rgba(160,190,240,0.4)', pitch: 6, lw: 2.8, box: { x: cx - 47, y: cy - 54, w: 94, h: 108 } });

  // The crown: a mukuta of scales with a band of dots, not horns.
  field(c, (g) => {
    g.moveTo(cx - 44, cy - 34);
    g.lineTo(cx - 34, cy - 84); g.lineTo(cx - 16, cy - 58); g.lineTo(cx, cy - 96);
    g.lineTo(cx + 16, cy - 58); g.lineTo(cx + 34, cy - 84); g.lineTo(cx + 44, cy - 34);
    g.closePath();
  }, { fill: G.geru, motif: 'scales', on: 'rgba(245,220,180,0.6)', pitch: 9, lw: 2.4, box: { x: cx - 48, y: cy - 100, w: 96, h: 70 } });
  beads(c, cx - 38, cy - 38, cx + 38, cy - 38, 9, 3.8, G.haldi);

  features(c, cx, cy + 2, 1.06, t, emph, { seed: 2.8, lip: G.geru, open: 2 });
  // The moustache of an official who has heard it all before.
  c.strokeStyle = G.soot; c.lineWidth = 3;
  c.beginPath();
  c.moveTo(cx - 18, cy + 24); c.quadraticCurveTo(cx, cy + 20, cx + 18, cy + 24);
  c.moveTo(cx - 18, cy + 24); c.quadraticCurveTo(cx - 26, cy + 26, cx - 28, cy + 18);
  c.moveTo(cx + 18, cy + 24); c.quadraticCurveTo(cx + 26, cy + 26, cx + 28, cy + 18);
  c.stroke();
  c.strokeStyle = G.haldi; c.lineWidth = 2.2;       // three marks on the brow
  c.beginPath();
  for (let i = -1; i <= 1; i++) { c.moveTo(cx + i * 10, cy - 40); c.lineTo(cx + i * 10, cy - 28); }
  c.stroke();
  blob(c, cx - 49, cy + 14, 9, 13, 0, { fill: G.haldi, motif: 'dots', on: 'rgba(120,40,20,0.5)', pitch: 5, lw: 1.8 });
  blob(c, cx + 49, cy + 14, 9, 13, 0, { fill: G.haldi, motif: 'dots', on: 'rgba(120,40,20,0.5)', pitch: 5, lw: 1.8 });
}

// --- NARADA -----------------------------------------------------------------------

function narada(c, t, emph) {
  const cx = W / 2, cy = 116;

  disc(c, cx, cy - 8, 62, { fill: hexA(G.haldi, 0.5), motif: 'dots', on: 'rgba(90,50,10,0.4)', pitch: 9, rays: 12, spin: -t * 0.05, lw: 1.8 });

  field(c, (g) => {
    g.moveTo(cx - 84, H + 8);
    g.quadraticCurveTo(cx - 76, 240, cx - 44, 198);
    g.quadraticCurveTo(cx - 18, 172, cx, 170);
    g.quadraticCurveTo(cx + 18, 172, cx + 44, 198);
    g.quadraticCurveTo(cx + 76, 240, cx + 84, H + 8);
    g.closePath();
  }, { fill: G.haldi, motif: 'seeds', on: 'rgba(80,45,15,0.5)', pitch: 11, lw: 2.6, box: { x: 24, y: 164, w: 172, h: 146 } });
  field(c, (g) => g.rect(cx - 86, 268, 172, 34), {
    fill: '#b0742a', motif: 'waves', on: 'rgba(250,235,200,0.6)', pitch: 8, lw: 2.2, box: { x: cx - 86, y: 268, w: 172, h: 34 },
  });

  // The veena across him.
  limb(c, [[cx - 86, 268], [cx + 6, 196], [cx + 86, 138]], 8, 8,
    { fill: G.mitti, motif: 'comb', on: 'rgba(245,225,185,0.55)', pitch: 5, lw: 2.4 });
  blob(c, cx - 88, 272, 26, 26, 0, { fill: G.mittiPale, motif: 'scales', on: 'rgba(60,30,10,0.45)', pitch: 9, lw: 2.4 });
  blob(c, cx + 90, 132, 16, 16, 0, { fill: G.mittiPale, motif: 'dots', on: 'rgba(60,30,10,0.45)', pitch: 6, lw: 2.2 });
  c.strokeStyle = G.chuna; c.lineWidth = 1.2;
  for (let i = -1; i <= 1; i++) {
    c.beginPath(); c.moveTo(cx - 84 + i * 3, 266 + i * 3); c.lineTo(cx + 86 + i * 3, 136 + i * 3); c.stroke();
  }

  limb(c, [[cx - 46, 198], [cx - 74, 236], [cx - 62, 268]], 10, 7, { ...SKIN(G.skin), pitch: 5 });
  limb(c, [[cx + 46, 198], [cx + 74, 186 - emph * 5], [cx + 84, 156 - emph * 5]], 10, 7, { ...SKIN(G.skin), pitch: 5 });

  limb(c, [[cx, 154], [cx, 186]], 16, 22, { ...SKIN(G.skinDark), pitch: 5 });
  head(c, cx, cy, 44, 51, { skin: G.skin });

  field(c, (g) => {                                  // white hair, and the shikha
    g.moveTo(cx - 45, cy + 8);
    g.quadraticCurveTo(cx - 50, cy - 56, cx, cy - 56);
    g.quadraticCurveTo(cx + 50, cy - 56, cx + 45, cy + 8);
    g.quadraticCurveTo(cx + 26, cy - 24, cx, cy - 26);
    g.quadraticCurveTo(cx - 26, cy - 24, cx - 45, cy + 8);
    g.closePath();
  }, { fill: '#e8e0cc', motif: 'comb', on: 'rgba(120,95,60,0.5)', pitch: 5, lw: 2.4, box: { x: cx - 52, y: cy - 60, w: 104, h: 74 } });
  limb(c, [[cx + 2, cy - 54], [cx + 10, cy - 84]], 6, 3, { fill: '#e8e0cc', ink: true, lw: 2 });

  features(c, cx, cy + 2, 1, t, emph, { seed: 3.4, open: 3.2, lip: '#8a4a24' });
  // A white beard, combed.
  field(c, (g) => {
    g.moveTo(cx - 30, cy + 26);
    g.quadraticCurveTo(cx, cy + 96, cx + 30, cy + 26);
    g.quadraticCurveTo(cx, cy + 46, cx - 30, cy + 26);
    g.closePath();
  }, { fill: '#efe7d6', motif: 'comb', on: 'rgba(130,100,60,0.5)', pitch: 5, lw: 2.2, box: { x: cx - 32, y: cy + 24, w: 64, h: 76 } });

  for (let i = 0; i < 4; i++) {
    const a = t * 0.45 + i * 1.7;
    bird(c, cx - 74 + Math.cos(a) * 20 + i * 8, 54 + Math.sin(a) * 14, 12,
      { fill: G.chuna, motif: 'dots', on: 'rgba(70,45,20,0.5)', pitch: 6, lw: 1.8 });
  }
}

// --- THE KEEPER -------------------------------------------------------------------

function keeper(c, t, emph) {
  const cx = W / 2, cy = 120;

  disc(c, cx, cy - 8, 58, { fill: 'rgba(138,90,43,0.4)', motif: 'dots', on: 'rgba(240,227,200,0.3)', pitch: 10, rays: 0, lw: 1.8 });

  field(c, (g) => {                                  // shawl over everything
    g.moveTo(cx - 88, H + 8);
    g.quadraticCurveTo(cx - 76, 234, cx - 40, 186);
    g.quadraticCurveTo(cx, 158, cx + 40, 186);
    g.quadraticCurveTo(cx + 76, 234, cx + 88, H + 8);
    g.closePath();
  }, { fill: G.mitti, motif: 'comb', on: 'rgba(243,230,205,0.55)', pitch: 6, lw: 2.6, box: { x: 20, y: 152, w: 180, h: 158 } });
  field(c, (g) => g.rect(cx - 90, 274, 180, 24), {
    fill: '#5f4022', motif: 'dashes', on: 'rgba(243,230,205,0.6)', pitch: 9, lw: 2.2, box: { x: cx - 90, y: 274, w: 180, h: 24 },
  });

  limb(c, [[cx - 44, 194], [cx - 72, 228], [cx - 62, 266]], 10, 7, { ...SKIN(G.mittiPale), pitch: 5 });
  limb(c, [[cx + 44, 194], [cx + 74, 220], [cx + 66 - emph * 4, 258]], 10, 7, { ...SKIN(G.mittiPale), pitch: 5 });
  limb(c, [[cx + 70, 272], [cx + 82, 96]], 5, 4,
    { fill: G.mitti, motif: 'comb', on: 'rgba(243,230,205,0.45)', pitch: 6, lw: 2 });

  limb(c, [[cx, 158], [cx, 190]], 15, 20, { ...SKIN('#a8845e'), pitch: 5 });
  head(c, cx, cy, 43, 50, { skin: G.mittiPale });

  field(c, (g) => {                                  // grey hair, pulled back
    g.moveTo(cx - 44, cy + 6);
    g.quadraticCurveTo(cx - 50, cy - 54, cx, cy - 54);
    g.quadraticCurveTo(cx + 50, cy - 54, cx + 44, cy + 6);
    g.quadraticCurveTo(cx + 24, cy - 26, cx, cy - 28);
    g.quadraticCurveTo(cx - 24, cy - 26, cx - 44, cy + 6);
    g.closePath();
  }, { fill: '#ded6c6', motif: 'comb', on: 'rgba(120,100,78,0.5)', pitch: 5, lw: 2.4, box: { x: cx - 50, y: cy - 58, w: 100, h: 70 } });
  blob(c, cx + 40, cy - 26, 16, 14, 0.3, { fill: '#ded6c6', motif: 'comb', on: 'rgba(120,100,78,0.5)', pitch: 5, lw: 2.2 });

  // The shawl drawn up over her head, which is how an old woman wears one.
  field(c, (g) => {
    g.moveTo(cx - 52, cy + 30);
    g.quadraticCurveTo(cx - 60, cy - 66, cx, cy - 66);
    g.quadraticCurveTo(cx + 60, cy - 66, cx + 52, cy + 30);
    g.quadraticCurveTo(cx + 40, cy - 16, cx, cy - 18);
    g.quadraticCurveTo(cx - 40, cy - 16, cx - 52, cy + 30);
    g.closePath();
  }, { fill: G.chuna, motif: 'dashes', on: 'rgba(120,90,55,0.5)', pitch: 8, lw: 2.4, box: { x: cx - 62, y: cy - 70, w: 124, h: 104 } });

  features(c, cx, cy + 2, 0.96, t, emph, { seed: 4.2, open: 2.4, lip: '#7a4a30' });
  c.strokeStyle = 'rgba(70,45,25,0.5)'; c.lineWidth = 1.4;   // the lines of her face
  c.beginPath();
  c.moveTo(cx - 34, cy + 16); c.quadraticCurveTo(cx - 26, cy + 24, cx - 22, cy + 34);
  c.moveTo(cx + 34, cy + 16); c.quadraticCurveTo(cx + 26, cy + 24, cx + 22, cy + 34);
  c.moveTo(cx - 12, cy - 30); c.lineTo(cx - 10, cy - 22);
  c.moveTo(cx + 12, cy - 30); c.lineTo(cx + 10, cy - 22);
  c.stroke();
  c.fillStyle = G.mitti;
  c.beginPath(); c.arc(cx, cy - 26, 3.6, 0, TAU); c.fill();
  beads(c, cx - 28, 182, cx + 28, 182, 7, 3.4, G.chuna);
}
