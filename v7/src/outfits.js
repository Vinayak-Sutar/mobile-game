// The Wanderer's wardrobe: every piece the figure can wear, slot by slot, and
// the dyes that colour them.
//
// The Wanderer (wanderer.js) is drawn part by part - legs, boots, the coat,
// the belt, the scarf, the head, the hat, what is carried on the back - so
// each of those parts is a slot here, and each piece in a slot is a small
// drawing in the same style (flat colours, a dark outline, lit from the
// upper left). A piece is drawn from the same two numbers every part of the
// figure is placed by (`V.side`, 1 in profile, 0 facing or leaving the camera,
// and `V.depth`, + toward the camera), so it turns with the body at all eight
// angles.
//
// Colours come from the outfit's dyes, not the pieces: a piece paints with
// "cloth", "cloth2", "metal", "leather" or "hair", and the outfit says which
// dye each of those is. So one coat is a rust traveller's coat or an indigo
// one, and one helm is iron, bronze or blackened. The accent (the scarf, the
// hat band, a crest, a banner) follows the weapon's colour unless dyed.
//
// Slots: hat, face, hair, neck, body, shoulders, hands, legs, feet, back, belt.
// Every piece is open for now; how pieces are earned or crafted is the next
// step (see the journal, 16.55).

import { TAU, lerp } from './util.js';

export const OUT = '#1b130f';

// --- dyes ----------------------------------------------------------------------------
// [base, shade, light]

export const CLOTH = {
  rust: { name: 'Rust', c: ['#a24e2d', '#7a3620', '#c8683e'] },
  crimson: { name: 'Crimson', c: ['#a8282c', '#78181e', '#d04044'] },
  wine: { name: 'Wine', c: ['#6e2438', '#4a1626', '#944060'] },
  saffron: { name: 'Saffron', c: ['#c8862a', '#94601a', '#e8a848'] },
  forest: { name: 'Forest', c: ['#3e6a3a', '#2a4a28', '#5a8e52'] },
  moss: { name: 'Moss', c: ['#6e7a3a', '#4e5828', '#909e52'] },
  teal: { name: 'Teal', c: ['#2e7a78', '#1e5654', '#4aa09c'] },
  indigo: { name: 'Indigo', c: ['#34407a', '#222c58', '#4e5ea4'] },
  navy: { name: 'Navy', c: ['#243048', '#161e30', '#3a4a6a'] },
  plum: { name: 'Plum', c: ['#6a3a78', '#4a2656', '#8e56a0'] },
  slate: { name: 'Slate', c: ['#3b3444', '#2c2733', '#554c60'] },
  ash: { name: 'Ash grey', c: ['#7a7a80', '#56565c', '#9c9ca2'] },
  bone: { name: 'Bone', c: ['#d8ccb0', '#a89c80', '#f0e6cc'] },
  sand: { name: 'Sand', c: ['#c8a878', '#98784c', '#e4c896'] },
  black: { name: 'Black', c: ['#2a262e', '#1a181c', '#403a46'] },
};
export const METAL = {
  iron: { name: 'Iron', c: ['#7c8088', '#565a62', '#a8adb5'] },
  steel: { name: 'Steel', c: ['#9aa3ad', '#6b737d', '#d2d8de'] },
  bronze: { name: 'Bronze', c: ['#b07a3a', '#7e5424', '#dca468'] },
  gold: { name: 'Gold', c: ['#d8aa3a', '#9c7420', '#f4d67a'] },
  silver: { name: 'Silver', c: ['#c4c8d0', '#8e929c', '#eef0f4'] },
  black: { name: 'Blackened', c: ['#3c3a3e', '#262428', '#66626a'] },
  verdigris: { name: 'Verdigris', c: ['#5f9a8a', '#3e6e62', '#8fc4b4'] },
};
export const LEATHER = {
  dark: { name: 'Dark', c: ['#3a2a1c', '#2e2119', '#5a4230'] },
  brown: { name: 'Brown', c: ['#6a4428', '#4a2e1a', '#8a6038'] },
  tan: { name: 'Tan', c: ['#9a6a3a', '#6e4a26', '#c08a52'] },
  black: { name: 'Black', c: ['#26201c', '#161210', '#40362e'] },
  oxblood: { name: 'Oxblood', c: ['#6a2a22', '#481a16', '#8a3e32'] },
};
export const HAIR = {
  brown: { name: 'Brown', c: ['#3a2616'] },
  black: { name: 'Black', c: ['#1a1614'] },
  auburn: { name: 'Auburn', c: ['#7a3218'] },
  blond: { name: 'Blond', c: ['#c8a050'] },
  grey: { name: 'Grey', c: ['#8a8a8a'] },
  white: { name: 'White', c: ['#e4e0d8'] },
  ashblue: { name: 'Ash-blue', c: ['#5a6a8a'] },
};
export const ACCENT = {
  weapon: { name: "Weapon's colour", c: [null] },
  ember: { name: 'Ember', c: ['#ff7a3a'] },
  gold: { name: 'Gold', c: ['#f0c040'] },
  jade: { name: 'Jade', c: ['#50c080'] },
  sky: { name: 'Sky', c: ['#50a8f0'] },
  rose: { name: 'Rose', c: ['#f06090'] },
  violet: { name: 'Violet', c: ['#a070f0'] },
  snow: { name: 'Snow', c: ['#f0f0f0'] },
  blood: { name: 'Blood', c: ['#c02828'] },
};
export const SKIN = {
  light: { name: 'Light', c: ['#f0c8a0', '#c89c74'] },
  warm: { name: 'Warm', c: ['#e2b489', '#b98a62'] },
  olive: { name: 'Olive', c: ['#c8966a', '#9c7048'] },
  brown: { name: 'Brown', c: ['#9a6a44', '#744c2e'] },
  deep: { name: 'Deep', c: ['#6a4630', '#4c3020'] },
};

// Fixed materials a piece may use whatever the dyes.
const M = {
  straw: '#dcbd6e', strawShade: '#9c7a3a', strawLight: '#f0d88e',
  bamboo: '#c9a55a', bambooShade: '#8e6e34',
  fur: '#8a6a48', furLight: '#b89a78', furDark: '#5e4630',
  bone: '#e8dcc0', boneShade: '#b0a488',
  lacquer: '#2a1c1c', lacquerLight: '#4a3232',
  mask: '#f2ece0', maskShade: '#c8c0b0', red: '#c8322a',
  wood: '#8a5a32', woodShade: '#5e3a1e',
  wrap: '#e4dccb', wrapShade: '#b0a690',
  roll: '#c9b48a', rollShade: '#9a8660',
  glow: '#ff8a3a',
};

// --- small drawing helpers ------------------------------------------------------------

function poly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}
/** A rounded rectangle path (begins a new path; no reliance on ctx.roundRect). */
function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function seg(ctx, x0, y0, x1, y1, w, color) {
  ctx.strokeStyle = OUT; ctx.lineWidth = w + 3;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}
const line = (ctx, x0, y0, x1, y1, w, color) => {
  ctx.strokeStyle = color; ctx.lineWidth = w;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
};

// ================================================================================
// HATS. draw(h): h.hx, h.hy the head's centre (radius 6.2). `hair`: 'show' leaves
// the top of the head bare (the hair shows); 'hide' hides even a ponytail.
// `face: false` covers the face (a closed helm).
// ================================================================================

export const HATS = {
  straw: {
    name: "Wayfarer's straw", desc: 'A wide straw hat against sun and ash.',
    draw(h) {
      const { ctx, hx, hy, col, fill } = h;
      ctx.beginPath(); ctx.ellipse(hx, hy - 3.2, 13.5, 4.6, 0, 0, TAU); fill(col(M.strawShade), 1.6);
      ctx.beginPath(); ctx.ellipse(hx, hy - 4.2, 13, 3.8, 0, Math.PI, TAU); ctx.fillStyle = col(M.straw); ctx.fill();
      ctx.beginPath(); ctx.ellipse(hx, hy - 7.2, 6.6, 5.2, 0, Math.PI, TAU); ctx.lineTo(hx + 6.6, hy - 5.4); ctx.lineTo(hx - 6.6, hy - 5.4); ctx.closePath();
      fill(col(M.straw), 1.5);
      ctx.fillStyle = h.accent; ctx.fillRect(hx - 6.6, hy - 7.4, 13.2, 2);
      if (!h.flashing) { ctx.fillStyle = M.strawLight; ctx.beginPath(); ctx.ellipse(hx - 2.6, hy - 9.6, 2.4, 1.2, -0.3, 0, TAU); ctx.fill(); }
    },
  },
  kasa: {
    name: 'Ronin kasa', desc: 'A woven bamboo cone, low over the eyes.',
    draw(h) {
      const { ctx, hx, hy, col, fill } = h;
      ctx.beginPath();
      ctx.moveTo(hx - 15, hy - 3.5); ctx.lineTo(hx, hy - 13.5); ctx.lineTo(hx + 15, hy - 3.5);
      ctx.ellipse(hx, hy - 3.5, 15, 3.4, 0, 0, Math.PI);
      ctx.closePath();
      fill(col(M.bamboo), 1.6);
      if (!h.flashing) {
        ctx.strokeStyle = M.bambooShade; ctx.lineWidth = 0.8;
        for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(hx, hy - 13); ctx.lineTo(hx + i * 4.6, hy - 2.4 + Math.abs(i) * 0.25); ctx.stroke(); }
        ctx.fillStyle = 'rgba(255,240,200,0.35)';
        poly(ctx, [hx, hy - 13, hx - 13, hy - 4, hx - 6, hy - 3.2]); ctx.fill();
      }
      if (!h.back) { ctx.strokeStyle = h.accent; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(hx - 4.5, hy - 2.5); ctx.lineTo(h.faceX, hy + 5.6); ctx.lineTo(hx + 4.5, hy - 2.5); ctx.stroke(); }
    },
  },
  hood: {
    name: "Traveller's hood", desc: 'A deep cowl that hides the hair and shades the face.', hair: 'hide',
    draw(h) {
      const { ctx, hx, hy, col, fill, P } = h;
      // The drape over the shoulders.
      poly(ctx, [hx - 6.8, hy + 1, -8.4, -29, 8.4, -29, hx + 6.8, hy + 1]); fill(col(P.cloth2[1]), 1.4);
      ctx.beginPath();
      ctx.arc(hx, hy - 0.6, 7.6, 0, TAU);
      if (!h.back) ctx.ellipse(h.faceX, hy + 1.2, h.square ? 4.6 : 4.2, 5.2, 0, 0, TAU);
      ctx.fillStyle = col(P.cloth2[0]); ctx.fill('evenodd');
      ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.stroke();
      // The peak of the hood, falling back.
      const bx = h.square ? hx : hx - 5.6;
      poly(ctx, [bx - 2.4, hy - 6.4, bx + (h.square ? 0 : -3.2), hy - 10.4, bx + 2.6, hy - 7.2]); fill(col(P.cloth2[0]), 1.2);
      if (!h.back && !h.flashing) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(h.faceX, hy - 2.4, 4.4, 1.8, 0, 0, TAU); ctx.fill();
      }
    },
  },
  ranger: {
    name: "Ranger's cap", desc: 'A peaked felt cap with a long feather.',
    draw(h) {
      const { ctx, hx, hy, col, fill, P } = h;
      const f = h.square ? 0 : 1;
      ctx.beginPath();
      ctx.moveTo(hx - 7.4, hy - 3.6);
      ctx.quadraticCurveTo(hx - 5 + f * 2, hy - 13, hx + 2 * f, hy - 11.2);
      ctx.quadraticCurveTo(hx + 7 * f + 4 * (1 - f), hy - 9, hx + 9 * f + 7.4 * (1 - f), hy - 4.2);
      ctx.quadraticCurveTo(hx, hy - 2.2, hx - 7.4, hy - 3.6);
      ctx.closePath();
      fill(col(P.cloth[0]), 1.5);
      line(ctx, hx - 7, hy - 4.2, hx + 7, hy - 4.6, 1.6, col(P.cloth[1]));
      // The feather, sweeping back.
      ctx.strokeStyle = OUT; ctx.lineWidth = 3.2;
      ctx.beginPath(); ctx.moveTo(hx - 2, hy - 6); ctx.quadraticCurveTo(hx - 9, hy - 10, hx - 13, hy - 16); ctx.stroke();
      ctx.strokeStyle = h.accent; ctx.lineWidth = 1.8; ctx.stroke();
    },
  },
  kettle: {
    name: 'Kettle helm', desc: 'An iron hat with a broad brim - the footman\'s helm.',
    draw(h) {
      const { ctx, hx, hy, col, fill, P } = h;
      ctx.beginPath(); ctx.ellipse(hx, hy - 2.6, 10.5, 3.2, 0, 0, TAU); fill(col(P.metal[1]), 1.5);
      ctx.beginPath(); ctx.ellipse(hx, hy - 3.4, 6.8, 6.4, 0, Math.PI, TAU); ctx.closePath(); fill(col(P.metal[0]), 1.5);
      line(ctx, hx - 6.6, hy - 3.6, hx + 6.6, hy - 3.6, 1.2, col(P.metal[1]));
      if (!h.flashing) { ctx.fillStyle = P.metal[2]; ctx.beginPath(); ctx.ellipse(hx - 2.6, hy - 7.4, 2, 1.4, -0.4, 0, TAU); ctx.fill(); }
    },
  },
  greathelm: {
    name: 'Great helm', desc: 'A closed iron bucket. Nothing of you shows.', hair: 'hide', face: false,
    draw(h) {
      const { ctx, hx, hy, col, fill, P } = h;
      rrect(ctx, hx - 7, hy - 8.6, 14, 15.4, 3); fill(col(P.metal[0]), 1.6);
      if (!h.flashing) { ctx.fillStyle = P.metal[2]; ctx.fillRect(hx - 5.4, hy - 7.6, 2.2, 12); }
      if (!h.back) {
        const ex = h.square ? hx : h.faceX + 0.6;
        const w = h.square ? 11 : h.profile ? 6 : 8.4;
        ctx.fillStyle = OUT; ctx.fillRect(ex - w / 2, hy - 1.4, w, 1.8);
        ctx.fillRect(ex - 0.8, hy - 1.4, 1.6, 6.6);
        ctx.fillStyle = col(h.accent); ctx.fillRect(ex - 0.5, hy - 7.6, 1, 5.2);
        ctx.fillStyle = OUT;
        for (let i = 0; i < 3; i++) ctx.fillRect(ex + 2 + i * 1.6, hy + 2.4, 0.9, 0.9);
      }
      line(ctx, hx - 6.6, hy - 5, hx + 6.6, hy - 5, 1, col(P.metal[1]));
    },
  },
  horned: {
    name: 'Horned helm', desc: 'A northman\'s dome with a pair of ox horns.',
    draw(h) {
      const { ctx, hx, hy, col, fill, P } = h;
      for (const sd of [-1, 1]) {
        const x0 = hx + sd * 6;
        ctx.beginPath();
        ctx.moveTo(x0, hy - 5);
        ctx.quadraticCurveTo(x0 + sd * 7, hy - 5, x0 + sd * 7.5, hy - 14);
        ctx.quadraticCurveTo(x0 + sd * 4, hy - 8, x0, hy - 8.4);
        ctx.closePath();
        fill(col(M.bone), 1.3);
      }
      ctx.beginPath(); ctx.ellipse(hx, hy - 3, 7, 7.2, 0, Math.PI, TAU); ctx.closePath(); fill(col(P.metal[0]), 1.5);
      ctx.fillStyle = col(P.metal[1]); ctx.fillRect(hx - 7, hy - 4.2, 14, 2);
      if (!h.back) { ctx.fillStyle = col(P.metal[1]); ctx.fillRect(h.faceX - 0.8, hy - 3, 1.6, 5); }
      if (!h.flashing) { ctx.fillStyle = P.metal[2]; ctx.beginPath(); ctx.ellipse(hx - 2.4, hy - 7, 2, 1.3, -0.4, 0, TAU); ctx.fill(); }
    },
  },
  kabuto: {
    name: 'Kabuto', desc: 'A lacquered samurai helm with a flared neck guard and a golden crest.',
    draw(h) {
      const { ctx, hx, hy, col, fill, P } = h;
      // The neck guard: three lames flaring out below the bowl.
      for (let i = 2; i >= 0; i--) {
        ctx.beginPath(); ctx.ellipse(hx - (h.square ? 0 : 1.2), hy - 2.4 + i * 1.9, 8.6 + i * 1.3, 3, 0, 0, Math.PI); ctx.closePath();
        fill(col(i % 2 ? P.metal[1] : P.metal[0]), 1.2);
      }
      ctx.beginPath(); ctx.ellipse(hx, hy - 3.6, 7.2, 6.8, 0, Math.PI, TAU); ctx.closePath(); fill(col(M.lacquer), 1.5);
      if (!h.flashing) {
        ctx.strokeStyle = M.lacquerLight; ctx.lineWidth = 0.8;
        for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(hx + i * 2.6, hy - 3.8); ctx.lineTo(hx + i * 1.2, hy - 10); ctx.stroke(); }
      }
      if (!h.back) {
        // The crest: a crescent of gold horns.
        const cx = h.faceX;
        ctx.beginPath();
        ctx.moveTo(cx, hy - 7);
        ctx.quadraticCurveTo(cx - 7, hy - 9, cx - 8, hy - 17);
        ctx.quadraticCurveTo(cx - 4, hy - 11, cx, hy - 9.4);
        ctx.quadraticCurveTo(cx + 4, hy - 11, cx + 8 * (h.profile ? 0.5 : 1), hy - 17);
        ctx.quadraticCurveTo(cx + 7 * (h.profile ? 0.5 : 1), hy - 9, cx, hy - 7);
        fill(col(h.accent), 1.2);
      }
    },
  },
  wrap: {
    name: 'Desert wrap', desc: 'A long cloth wound round the head, one tail loose.',
    draw(h) {
      const { ctx, hx, hy, col, fill, P } = h;
      const bx = hx - (h.square ? 0 : 6);
      ctx.strokeStyle = OUT; ctx.lineWidth = 4.6;
      ctx.beginPath(); ctx.moveTo(bx, hy - 3); ctx.quadraticCurveTo(bx - 3 + h.wave * 0.5, hy + 4, bx - 4 - h.wave, hy + 10); ctx.stroke();
      ctx.strokeStyle = col(P.cloth2[1]); ctx.lineWidth = 2.6; ctx.stroke();
      ctx.beginPath(); ctx.ellipse(hx, hy - 4.6, 7.8, 6.4, 0, Math.PI * 0.95, TAU + 0.05); ctx.closePath(); fill(col(P.cloth2[0]), 1.5);
      if (!h.flashing) {
        ctx.strokeStyle = P.cloth2[1]; ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(hx - 7, hy - 3.4 - i * 2.4); ctx.quadraticCurveTo(hx, hy - 6 - i * 2.6, hx + 7, hy - 5 - i * 1.4); ctx.stroke(); }
      }
    },
  },
  pointed: {
    name: 'Pointed hat', desc: 'The tall, drooping hat of a hedge-wizard.',
    draw(h) {
      const { ctx, hx, hy, col, fill, P } = h;
      ctx.beginPath(); ctx.ellipse(hx, hy - 3.4, 12.4, 3.8, 0, 0, TAU); fill(col(P.cloth[1]), 1.5);
      const sway = h.wave * 0.4;
      ctx.beginPath();
      ctx.moveTo(hx - 6.4, hy - 4.2);
      ctx.quadraticCurveTo(hx - 3, hy - 16, hx - 2 + sway, hy - 21);
      ctx.quadraticCurveTo(hx - 6 + sway, hy - 23, hx - 11 + sway, hy - 20);
      ctx.quadraticCurveTo(hx - 3, hy - 17, hx + 1.4, hy - 15);
      ctx.quadraticCurveTo(hx + 4, hy - 10, hx + 6.4, hy - 4.2);
      ctx.closePath();
      fill(col(P.cloth[0]), 1.5);
      ctx.fillStyle = h.accent; ctx.fillRect(hx - 6.2, hy - 6.6, 12.4, 2);
    },
  },
  tricorn: {
    name: 'Tricorn', desc: 'A three-cornered hat with a gilt edge, for the high seas.',
    draw(h) {
      const { ctx, hx, hy, col, fill, P } = h;
      ctx.beginPath(); ctx.ellipse(hx, hy - 7.6, 6, 4.6, 0, Math.PI, TAU); ctx.closePath(); fill(col(P.leather[1]), 1.4);
      ctx.beginPath();
      ctx.moveTo(hx - 11, hy - 6.5);
      ctx.quadraticCurveTo(hx - 5, hy - 3.6, hx + (h.square ? 0 : 3), hy - 1.4);
      ctx.quadraticCurveTo(hx + 6, hy - 4, hx + 11, hy - 6.5);
      ctx.quadraticCurveTo(hx + 4, hy - 9.6, hx, hy - 8.4);
      ctx.quadraticCurveTo(hx - 4, hy - 9.6, hx - 11, hy - 6.5);
      ctx.closePath();
      fill(col(P.leather[0]), 1.5);
      ctx.strokeStyle = col(P.metal[2]); ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(hx - 10.4, hy - 6.4); ctx.quadraticCurveTo(hx - 5, hy - 3.9, hx + (h.square ? 0 : 3), hy - 1.8); ctx.quadraticCurveTo(hx + 6, hy - 4.2, hx + 10.4, hy - 6.4); ctx.stroke();
    },
  },
  circlet: {
    name: 'Circlet', desc: 'A thin band of metal with a single stone.', hair: 'show',
    draw(h) {
      const { ctx, hx, hy, col, P } = h;
      ctx.strokeStyle = OUT; ctx.lineWidth = 2.8;
      ctx.beginPath(); ctx.ellipse(hx, hy - 3.2, 6.4, 1.8, 0, 0, Math.PI); ctx.stroke();
      ctx.strokeStyle = col(P.metal[0]); ctx.lineWidth = 1.4; ctx.stroke();
      if (!h.back) {
        ctx.beginPath(); ctx.arc(h.faceX, hy - 1.7, 1.3, 0, TAU);
        ctx.fillStyle = h.accent; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.8; ctx.stroke();
      }
    },
  },
  bandana: {
    name: 'Bandana', desc: 'A cloth knotted over the head, tails in the wind.',
    draw(h) {
      const { ctx, hx, hy, col, fill } = h;
      const kx = hx - (h.square ? 0 : 6.2);
      ctx.strokeStyle = OUT; ctx.lineWidth = 3.6;
      ctx.beginPath(); ctx.moveTo(kx, hy - 2); ctx.quadraticCurveTo(kx - 4, hy + h.wave * 0.3, kx - 7, hy + 2 + h.wave); ctx.stroke();
      ctx.strokeStyle = h.accent; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(hx, hy - 0.8, 6.6, Math.PI * 1.02, TAU - 0.02); ctx.closePath(); fill(h.accent, 1.4);
      if (!h.flashing) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; for (let i = 0; i < 4; i++) ctx.fillRect(hx - 4 + i * 2.4, hy - 4.6 + (i % 2), 0.9, 0.9); }
      void col;
    },
  },
  fur: {
    name: 'Fur cap', desc: 'A round fur hat with ear flaps, for the moors in winter.', hair: 'hide',
    draw(h) {
      const { ctx, hx, hy, col, fill } = h;
      for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(hx + sd * 6, hy + 0.6, 2.2, 3.8, 0, 0, TAU); fill(col(M.fur), 1.2); }
      rrect(ctx, hx - 7.4, hy - 11.6, 14.8, 9, 4); fill(col(M.fur), 1.5);
      rrect(ctx, hx - 7.8, hy - 5.2, 15.6, 3.8, 2); fill(col(M.furLight), 1.3);
      if (!h.flashing) { ctx.fillStyle = M.furDark; for (let i = 0; i < 5; i++) ctx.fillRect(hx - 6 + i * 3, hy - 10 + (i % 2) * 2, 0.9, 2.4); }
    },
  },
  sallet: {
    name: 'Plumed sallet', desc: 'A knight\'s sallet with its tail swept back and a plume on top.', hair: 'hide',
    draw(h) {
      const { ctx, hx, hy, col, fill, P } = h;
      // The plume, streaming back.
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = OUT; ctx.lineWidth = 3.4;
        ctx.beginPath(); ctx.moveTo(hx, hy - 8); ctx.quadraticCurveTo(hx - 5 - i * 2, hy - 15 + i, hx - 12 - i * 1.6 + h.wave * 0.4, hy - 9 + i * 2.6); ctx.stroke();
        ctx.strokeStyle = h.accent; ctx.lineWidth = 2; ctx.stroke();
      }
      const tail = h.square ? 0 : 1;
      ctx.beginPath();
      ctx.moveTo(hx + 6.6, hy - 1);
      ctx.quadraticCurveTo(hx + 7, hy - 9, hx, hy - 9.4);
      ctx.quadraticCurveTo(hx - 7, hy - 9, hx - 7, hy - 1);
      ctx.lineTo(hx - 7 - 5 * tail, hy + 3 - tail);
      ctx.lineTo(hx - 5, hy + 1.4);
      ctx.lineTo(hx + 6.6, hy + 1.4);
      ctx.closePath();
      fill(col(P.metal[0]), 1.5);
      if (!h.back) { ctx.fillStyle = OUT; ctx.fillRect(h.faceX - (h.square ? 5 : 2.6), hy - 2.2, h.square ? 10 : 7, 1.6); }
      if (!h.flashing) { ctx.fillStyle = P.metal[2]; ctx.beginPath(); ctx.ellipse(hx - 2.6, hy - 6.4, 2.2, 1.3, -0.4, 0, TAU); ctx.fill(); }
    },
  },
  none: { name: 'Bare head', desc: 'Nothing but the wind.', hair: 'show', draw() {} },
};

// ================================================================================
// FACE: drawn over the face, under the hat. Not seen from behind.
// ================================================================================

export const FACES = {
  none: { name: 'None', desc: 'Your own face.', draw() {} },
  beard: {
    name: 'Beard', desc: 'A full beard, in your hair\'s colour.',
    draw(h) {
      const { ctx, faceX, hy, col, fill, P } = h;
      ctx.beginPath();
      ctx.ellipse(faceX + (h.profile ? 0.6 : 0), hy + 3.6, h.square ? 4.6 : 3.8, 3.8, 0, -0.1, Math.PI + 0.1);
      ctx.closePath(); fill(col(P.hair), 1.2);
    },
  },
  eyepatch: {
    name: 'Eyepatch', desc: 'One eye lost to a fight you don\'t talk about.',
    draw(h) {
      const { ctx, hx, hy, faceX } = h;
      const ex = h.square ? hx + 2.2 : faceX + 1.8;
      ctx.strokeStyle = OUT; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(hx - 6, hy - 2.6); ctx.lineTo(ex, hy + 0.2); ctx.stroke();
      ctx.fillStyle = OUT; ctx.beginPath(); ctx.ellipse(ex, hy + 0.4, 1.9, 1.7, 0, 0, TAU); ctx.fill();
    },
  },
  bandit: {
    name: 'Bandit cloth', desc: 'A cloth over the nose and mouth.',
    draw(h) {
      const { ctx, hy, faceX, col, fill, P } = h;
      const w = h.square ? 5.8 : 4.8;
      ctx.beginPath();
      ctx.moveTo(faceX - w, hy + 1.2); ctx.lineTo(faceX + w, hy + 1.2);
      ctx.lineTo(faceX + w * 0.7, hy + 5.4); ctx.lineTo(faceX, hy + 7.8); ctx.lineTo(faceX - w * 0.7, hy + 5.4);
      ctx.closePath(); fill(col(P.cloth2[0]), 1.2);
    },
  },
  kitsune: {
    name: 'Kitsune mask', desc: 'A white fox face with red markings, from a summit shrine.',
    draw(h) {
      const { ctx, hy, faceX, col, fill } = h;
      const w = h.square ? 5.6 : 4.8;
      const snout = h.square ? 0 : 3;
      ctx.beginPath();
      ctx.moveTo(faceX - w, hy - 3.6);
      ctx.lineTo(faceX - w + 1, hy - 7.4); ctx.lineTo(faceX - 1.6, hy - 4.4);
      ctx.lineTo(faceX + 1.6, hy - 4.4); ctx.lineTo(faceX + w - 1, hy - 7.4);
      ctx.lineTo(faceX + w, hy - 3.6);
      ctx.lineTo(faceX + w * 0.6 + snout, hy + 3.4);
      ctx.lineTo(faceX + snout * 0.8, hy + 5);
      ctx.lineTo(faceX - w * 0.6, hy + 3.4);
      ctx.closePath(); fill(col(M.mask), 1.2);
      if (!h.flashing) {
        ctx.strokeStyle = M.red; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(faceX - 3.6, hy - 1.2); ctx.lineTo(faceX - 1, hy - 0.2); ctx.moveTo(faceX + 3.6, hy - 1.2); ctx.lineTo(faceX + 1.4, hy - 0.2); ctx.stroke();
        ctx.fillStyle = M.red; ctx.beginPath(); ctx.arc(faceX + snout * 0.8, hy + 3.8, 0.9, 0, TAU); ctx.fill();
        ctx.fillStyle = OUT; ctx.fillRect(faceX - 3, hy - 0.4, 1.8, 0.9); ctx.fillRect(faceX + 1.2, hy - 0.4, 1.8, 0.9);
      }
    },
  },
  oni: {
    name: 'Oni mask', desc: 'A red demon\'s half-mask with tusks.',
    draw(h) {
      const { ctx, hy, faceX, col, fill } = h;
      const w = h.square ? 5.6 : 4.8;
      ctx.beginPath(); ctx.ellipse(faceX, hy + 1.2, w, 5.2, 0, 0, TAU); fill(col('#b8282a'), 1.3);
      if (!h.flashing) {
        ctx.fillStyle = '#e8c040'; ctx.fillRect(faceX - 3.4, hy - 0.8, 2.2, 1.2); ctx.fillRect(faceX + 1.2, hy - 0.8, 2.2, 1.2);
        ctx.strokeStyle = OUT; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(faceX - 4, hy - 2.6); ctx.lineTo(faceX - 1, hy - 1.6); ctx.moveTo(faceX + 4, hy - 2.6); ctx.lineTo(faceX + 1, hy - 1.6); ctx.stroke();
        ctx.fillStyle = OUT; ctx.fillRect(faceX - 2.6, hy + 3, 5.2, 1.2);
        ctx.fillStyle = M.bone;
        poly(ctx, [faceX - 2.4, hy + 3, faceX - 1.6, hy + 5.8, faceX - 0.8, hy + 3]); ctx.fill();
        poly(ctx, [faceX + 2.4, hy + 3, faceX + 1.6, hy + 5.8, faceX + 0.8, hy + 3]); ctx.fill();
      }
    },
  },
  menpo: {
    name: 'Menpo', desc: 'A samurai\'s iron face guard with a snarling moustache.',
    draw(h) {
      const { ctx, hy, faceX, col, fill, P } = h;
      const w = h.square ? 5.2 : 4.4;
      ctx.beginPath();
      ctx.moveTo(faceX - w, hy + 0.6); ctx.lineTo(faceX + w + (h.square ? 0 : 1.2), hy + 0.6);
      ctx.lineTo(faceX + w * 0.8, hy + 5.4); ctx.lineTo(faceX, hy + 7); ctx.lineTo(faceX - w * 0.8, hy + 5.4);
      ctx.closePath(); fill(col(P.metal[1]), 1.2);
      if (!h.flashing) {
        ctx.strokeStyle = '#e8e0d0'; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.moveTo(faceX - 3, hy + 3.4); ctx.quadraticCurveTo(faceX, hy + 2, faceX + 3, hy + 3.4); ctx.stroke();
        ctx.fillStyle = OUT; ctx.fillRect(faceX - 1.6, hy + 4.4, 3.2, 0.8);
      }
    },
  },
  plague: {
    name: 'Beaked mask', desc: 'A leather beak and round glass eyes, stuffed with herbs.',
    draw(h) {
      const { ctx, hy, faceX, col, fill, P } = h;
      ctx.beginPath(); ctx.ellipse(faceX, hy + 0.4, h.square ? 5.4 : 4.6, 5.2, 0, 0, TAU); fill(col(P.leather[0]), 1.3);
      // The beak: long and forward in profile, pointing down the chest facing the camera.
      const len = h.square ? 0 : h.profile ? 9 : 6;
      ctx.beginPath();
      ctx.moveTo(faceX - 2 + len * 0.1, hy + 1);
      ctx.lineTo(faceX + len + 1, hy + 4 + (h.square ? 5 : 1.4));
      ctx.lineTo(faceX + 2 + len * 0.1, hy + 3.8);
      ctx.closePath(); fill(col(P.leather[2]), 1.2);
      ctx.fillStyle = h.accent;
      for (const ex of h.square ? [-2.4, 2.4] : [0.4, 3]) { ctx.beginPath(); ctx.arc(faceX + ex - (h.square ? 0 : 1.4), hy - 0.8, 1.2, 0, TAU); ctx.fill(); }
    },
  },
};

// ================================================================================
// HAIR: the style (the colour is a dye). Shown under a hat unless the hat hides it.
// ================================================================================

export const HAIRSTYLES = {
  short: { name: 'Short', desc: 'Cropped short.', draw() {} },
  tail: {
    name: 'Tail', desc: 'Tied back in a long tail.',
    behind(h) {
      const { ctx, hx, hy, col } = h;
      const bx = hx - (h.square ? 0 : 5.4);
      ctx.strokeStyle = OUT; ctx.lineWidth = 4.2;
      ctx.beginPath(); ctx.moveTo(bx, hy - 1); ctx.quadraticCurveTo(bx - 3 + h.wave * 0.4, hy + 5, bx - 2 - h.wave * 0.6, hy + 11); ctx.stroke();
      ctx.strokeStyle = col(h.P.hair); ctx.lineWidth = 2.4; ctx.stroke();
    },
  },
  long: {
    name: 'Long', desc: 'Loose to the shoulders.',
    behind(h) {
      const { ctx, hx, hy, col, fill } = h;
      ctx.beginPath(); ctx.ellipse(hx - (h.square ? 0 : 2), hy + 3, 7.4, 7.6, 0, 0, TAU); fill(col(h.P.hair), 1.4);
    },
  },
  topknot: {
    name: 'Topknot', desc: 'A samurai\'s topknot - seen when the head is bare.',
    top(h) {
      const { ctx, hx, hy, col, fill } = h;
      ctx.beginPath(); ctx.ellipse(hx - 0.6, hy - 7.4, 2.4, 1.8, 0, 0, TAU); fill(col(h.P.hair), 1.1);
      ctx.beginPath(); ctx.ellipse(hx + 1.6, hy - 8, 3, 1.2, -0.2, 0, TAU); fill(col(h.P.hair), 1.1);
    },
  },
  shaved: { name: 'Shaved', desc: 'A shaven head, like a temple monk.', bald: true, draw() {} },
};

// ================================================================================
// NECK: the scarf and what else goes round the neck.
// ================================================================================

function scarfPath(h, len, width, tails) {
  const { ctx, V, wave } = h;
  const nx = -1 * V.side, ny = -29;
  for (let i = 0; i < tails; i++) {
    const L = len * (i ? 0.8 : 1);
    ctx.strokeStyle = OUT; ctx.lineWidth = width + 2.7;
    ctx.beginPath(); ctx.moveTo(nx, ny + i); ctx.quadraticCurveTo(nx - L * 0.5, ny + 1 + i * 4 + wave * 0.4, nx - L, ny + 4 + i * 5 + wave * (i ? -0.5 : 1)); ctx.stroke();
    ctx.strokeStyle = h.accent; ctx.lineWidth = width;
    ctx.stroke();
  }
}
export const NECKS = {
  scarf: {
    name: 'Scarf', desc: 'A scarf in your colour, streaming behind you.',
    behind(h) { scarfPath(h, h.scarfLen, 3.8, 2); },
    knot: true,
  },
  longscarf: {
    name: 'Long scarf', desc: 'A long scarf that trails far behind.',
    behind(h) { scarfPath(h, h.scarfLen * 1.9, 3.4, 2); },
    knot: true,
  },
  mantle: {
    name: 'Fur mantle', desc: 'A heavy pelt across the shoulders.',
    front(h) {
      const { ctx, col, fill } = h;
      ctx.beginPath();
      for (let i = 0; i <= 8; i++) {
        const a = Math.PI + (i / 8) * Math.PI;
        const r = i % 2 ? 9.4 : 10.4;
        const x = Math.cos(a) * r, y = -29.5 + Math.sin(a) * -3.6 + 1.6;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.quadraticCurveTo(0, -24.6, -10.4, -28);
      fill(col(M.fur), 1.4);
      if (!h.flashing) { ctx.fillStyle = M.furLight; ctx.beginPath(); ctx.ellipse(-3, -30, 4, 1.3, 0, 0, TAU); ctx.fill(); }
    },
  },
  cowl: {
    name: 'Cowl', desc: 'A folded collar of cloth over the shoulders.',
    front(h) {
      const { ctx, col, fill, P } = h;
      ctx.beginPath(); ctx.ellipse(0, -29.4, 9.6, 3.6, 0, 0, TAU); fill(col(P.cloth2[0]), 1.4);
      if (!h.back) line(ctx, h.openX - 3, -28, h.openX + 2, -26.4, 1, col(P.cloth2[1]));
    },
  },
  beads: {
    name: 'Prayer beads', desc: 'A string of wooden beads.',
    front(h) {
      if (h.back) return;
      const { ctx, col } = h;
      for (let i = 0; i <= 10; i++) {
        const u = i / 10;
        const x = lerp(-5.4, 5.4, u) + h.openX * 0.3, y = -29.6 + Math.sin(u * Math.PI) * 6.2;
        ctx.beginPath(); ctx.arc(x, y, i === 5 ? 1.5 : 1, 0, TAU);
        ctx.fillStyle = col(i === 5 ? h.accent : M.wood); ctx.fill();
      }
    },
  },
  amulet: {
    name: 'Amulet', desc: 'A stone on a chain, warm to the touch.',
    front(h) {
      if (h.back) return;
      const { ctx, col, P } = h;
      ctx.strokeStyle = col(P.metal[0]); ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(-4.4 + h.openX * 0.4, -30); ctx.lineTo(h.openX, -24); ctx.lineTo(4.4 + h.openX * 0.4, -30); ctx.stroke();
      ctx.beginPath(); ctx.arc(h.openX, -23, 1.7, 0, TAU); ctx.fillStyle = h.accent; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.8; ctx.stroke();
    },
  },
  none: { name: 'Nothing', desc: 'A bare neck.' },
};

// ================================================================================
// BODY: the coat, the armour, the robe. `hem` is where it ends (the default
// coat ends at -11, just below the hips; a robe to the shins). `c(P)` gives
// [base, shade, light]; `sleeve(P)` the arms' [base, shade]; `sleeveW` their
// width; `open` how the front is drawn; `pattern(h)` is drawn clipped inside.
// ================================================================================

const clothOf = (P) => P.cloth, metalOf = (P) => P.metal, leatherOf = (P) => P.leather;

function mailRings(h, y0, y1, color) {
  const { ctx } = h;
  ctx.strokeStyle = color; ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let y = y0, r = 0; y < y1; y += 2.1, r++) {
    for (let x = -11 + (r % 2) * 1.2; x < 11; x += 2.4) { ctx.moveTo(x + 0.9, y); ctx.arc(x, y, 0.9, 0, Math.PI); }
  }
  ctx.stroke();
}

export const BODIES = {
  coat: {
    name: "Wayfarer's coat", desc: 'A long travelling coat, belted at the waist.',
    hem: -11, c: clothOf, open: 'lapel',
  },
  jerkin: {
    name: 'Leather jerkin', desc: 'Stitched leather over a shirt, light and quiet.',
    hem: -13, c: leatherOf, sleeve: (P) => [P.cloth2[0], P.cloth2[1]], open: 'laces',
    pattern(h) {
      const { ctx, P } = h;
      ctx.setLineDash([1.2, 1.2]); ctx.strokeStyle = P.leather[2]; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.moveTo(-6.8, -28); ctx.lineTo(-7.8, -14); ctx.moveTo(6.8, -28); ctx.lineTo(7.8, -14); ctx.moveTo(-8, -20.5); ctx.lineTo(8, -20.5); ctx.stroke();
      ctx.setLineDash([]);
    },
  },
  mail: {
    name: 'Chain hauberk', desc: 'A shirt of riveted rings to the thigh.',
    hem: -8, c: metalOf, sleeve: (P) => [P.metal[0], P.metal[1]], open: 'none',
    pattern(h) { mailRings(h, -31, -7, h.P.metal[1]); },
  },
  plate: {
    name: 'Plate cuirass', desc: 'A breastplate over mail, with a skirt of steel lames.',
    hem: -10, c: metalOf, sleeve: (P) => [P.metal[1], P.metal[1]], open: 'none',
    pattern(h) {
      const { ctx, P } = h;
      ctx.fillStyle = P.metal[2]; ctx.globalAlpha *= 0.8;
      ctx.beginPath(); ctx.ellipse(h.openX - 2.4, -25, 2, 5, 0.1, 0, TAU); ctx.fill();
      ctx.globalAlpha /= 0.8;
      ctx.strokeStyle = P.metal[1]; ctx.lineWidth = 1;
      for (const y of [-15.4, -13, -10.8]) { ctx.beginPath(); ctx.moveTo(-10, y); ctx.lineTo(10, y); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(h.openX, -30); ctx.lineTo(h.openX, -19); ctx.stroke();
    },
  },
  lamellar: {
    name: 'Lamellar dō', desc: 'Rows of lacquered scales laced with silk, samurai fashion.',
    hem: -9, c: (P) => P.cloth, sleeve: (P) => [P.cloth2[0], P.cloth2[1]], open: 'none',
    pattern(h) {
      const { ctx, P } = h;
      ctx.strokeStyle = P.cloth[1]; ctx.lineWidth = 1;
      for (let y = -27; y < -8; y += 2.8) { ctx.beginPath(); ctx.moveTo(-11, y); ctx.lineTo(11, y); ctx.stroke(); }
      ctx.strokeStyle = h.accent; ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let y = -27; y < -8; y += 2.8) for (let x = -9; x < 10; x += 2.6) { ctx.moveTo(x, y - 1.2); ctx.lineTo(x, y + 1.2); }
      ctx.stroke();
    },
  },
  brigandine: {
    name: 'Brigandine', desc: 'Cloth over hidden steel plates, rows of rivets showing.',
    hem: -10, c: clothOf, open: 'none',
    pattern(h) {
      const { ctx, P } = h;
      ctx.fillStyle = P.metal[2];
      for (let y = -28; y < -12; y += 3) for (let x = -8; x <= 8; x += 3) ctx.fillRect(x - 0.5, y - 0.5, 1.1, 1.1);
    },
  },
  tabard: {
    name: 'Tabard over mail', desc: 'A crusader\'s surcoat over a mail shirt.',
    hem: -8, c: metalOf, sleeve: (P) => [P.metal[0], P.metal[1]], open: 'none',
    pattern(h) {
      const { ctx, P } = h;
      mailRings(h, -31, -7, P.metal[1]);
      ctx.fillStyle = P.cloth[0];
      ctx.fillRect(h.openX - 5, -30, 10, 21);
      ctx.fillStyle = P.cloth[1]; ctx.fillRect(h.openX + 2.5, -30, 2.5, 21);
      if (!h.back) {
        ctx.fillStyle = h.accent;
        ctx.fillRect(h.openX - 0.8, -27, 1.6, 9); ctx.fillRect(h.openX - 3.2, -24.6, 6.4, 1.6);
      }
    },
  },
  robe: {
    name: 'Monk\'s robe', desc: 'A plain wrapped robe to the shins.',
    hem: -5, flare: 1.4, c: clothOf, open: 'wrap',
  },
  mage: {
    name: 'Mage\'s robe', desc: 'A long robe with a bright border and deep sleeves.',
    hem: -3, flare: 2.2, c: clothOf, sleeveW: 5.4, open: 'robe',
    pattern(h) {
      const { ctx } = h;
      ctx.fillStyle = h.accent;
      ctx.fillRect(-13, -5.4, 26, 1.6);
      if (!h.back) ctx.fillRect(h.openX - 0.8, -29, 1.6, 25);
    },
  },
  ranger: {
    name: 'Ranger\'s tunic', desc: 'A green tunic with a strap across the chest.',
    hem: -9, c: clothOf, open: 'none',
    pattern(h) {
      const { ctx, P } = h;
      ctx.strokeStyle = P.leather[0]; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-6, -30); ctx.lineTo(7, -16); ctx.stroke();
      ctx.fillStyle = P.metal[2]; ctx.fillRect(0, -24.2, 1.6, 1.6);
    },
  },
  doublet: {
    name: 'Noble doublet', desc: 'A quilted doublet with a row of gilt buttons.',
    hem: -12, c: clothOf, open: 'buttons',
    pattern(h) {
      const { ctx, P } = h;
      ctx.strokeStyle = P.cloth[1]; ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let x = -12; x < 12; x += 3.2) { ctx.moveTo(x, -31); ctx.lineTo(x + 10, -10); ctx.moveTo(x + 10, -31); ctx.lineTo(x, -10); }
      ctx.stroke();
    },
  },
  furcoat: {
    name: 'Fur-lined coat', desc: 'Hide and wool, trimmed with fur at the hem and front.',
    hem: -8, flare: 1, c: leatherOf, open: 'fur',
  },
  kimono: {
    name: 'Kimono and haori', desc: 'A wrapped kimono under a short coat with wide sleeves.',
    hem: -10, c: clothOf, sleeveW: 5.6, open: 'wrap',
  },
  desert: {
    name: 'Desert robe', desc: 'A loose robe of pale cloth, sashed at the waist.',
    hem: -4, flare: 1.8, c: clothOf, sleeveW: 4.8, open: 'wrap',
  },
  ember: {
    name: 'Ashen plate', desc: 'Blackened plate cracked by an inner fire - the Warden\'s own.',
    hem: -10, c: () => METAL.black.c, sleeve: () => [METAL.black.c[0], METAL.black.c[1]], open: 'none',
    pattern(h) {
      const { ctx, t } = h;
      const glow = 0.6 + 0.4 * Math.sin(t * 3);
      ctx.strokeStyle = M.glow; ctx.lineWidth = 0.9; ctx.globalAlpha *= glow;
      ctx.beginPath();
      ctx.moveTo(-5, -29); ctx.lineTo(-2.6, -24); ctx.lineTo(-4, -20); ctx.lineTo(-1.4, -15);
      ctx.moveTo(4, -28); ctx.lineTo(2.2, -23); ctx.lineTo(4.4, -18);
      ctx.moveTo(-8, -13); ctx.lineTo(-4, -12);
      ctx.stroke();
      ctx.globalAlpha /= glow;
      ctx.strokeStyle = '#1a181c'; ctx.lineWidth = 1;
      for (const y of [-15.4, -13, -10.8]) { ctx.beginPath(); ctx.moveTo(-10, y); ctx.lineTo(10, y); ctx.stroke(); }
    },
  },
};

// ================================================================================
// SHOULDERS: drawn over the coat at each shoulder. `x` is the shoulder's centre.
// ================================================================================

export const SHOULDERS = {
  none: { name: 'None', desc: 'Nothing on the shoulders.' },
  pads: {
    name: 'Leather pads', desc: 'Boiled-leather caps.',
    draw(h, x) { const { ctx, col, fill, P } = h; ctx.beginPath(); ctx.ellipse(x, -28.6, 3.6, 2.6, 0, 0, TAU); fill(col(P.leather[0]), 1.3); },
  },
  pauldrons: {
    name: 'Steel pauldrons', desc: 'Rounded plates over each shoulder.',
    draw(h, x) {
      const { ctx, col, fill, P } = h;
      ctx.beginPath(); ctx.ellipse(x, -28.4, 4.4, 3.6, 0, Math.PI, TAU); ctx.lineTo(x + 4.4, -26.4); ctx.lineTo(x - 4.4, -26.4); ctx.closePath(); fill(col(P.metal[0]), 1.3);
      line(ctx, x - 4.2, -26.6, x + 4.2, -26.6, 1, col(P.metal[1]));
      if (!h.flashing) { ctx.fillStyle = P.metal[2]; ctx.fillRect(x - 2, -30.6, 1.6, 1.2); }
    },
  },
  spiked: {
    name: 'Spiked pauldrons', desc: 'Pauldrons that bite back.',
    draw(h, x) {
      const { ctx, col, fill, P } = h;
      for (const dx of [-1.6, 1.6]) { poly(ctx, [x + dx - 1, -30.6, x + dx, -35.4, x + dx + 1, -30.6]); fill(col(P.metal[2]), 1); }
      ctx.beginPath(); ctx.ellipse(x, -28.4, 4.4, 3.6, 0, Math.PI, TAU); ctx.lineTo(x + 4.4, -26.4); ctx.lineTo(x - 4.4, -26.4); ctx.closePath(); fill(col(P.metal[0]), 1.3);
    },
  },
  pelts: {
    name: 'Fur pelts', desc: 'Wolf pelts thrown over the shoulders.',
    draw(h, x) {
      const { ctx, col, fill } = h;
      ctx.beginPath(); ctx.ellipse(x, -28.4, 4.6, 3.2, 0, 0, TAU); fill(col(M.fur), 1.3);
      if (!h.flashing) { ctx.fillStyle = M.furLight; ctx.fillRect(x - 2.4, -30, 1, 2); ctx.fillRect(x + 0.6, -30.4, 1, 2); }
    },
  },
  sode: {
    name: 'Sode', desc: 'Broad samurai shoulder plates, laced in rows.',
    draw(h, x) {
      const { ctx, col, fill, P } = h;
      rrect(ctx, x - 3.6, -31, 7.2, 8.2, 1); fill(col(P.cloth[0]), 1.3);
      ctx.strokeStyle = col(P.cloth[1]); ctx.lineWidth = 0.9;
      for (const y of [-28.4, -25.8]) { ctx.beginPath(); ctx.moveTo(x - 3.4, y); ctx.lineTo(x + 3.4, y); ctx.stroke(); }
      ctx.fillStyle = h.accent; for (const y of [-29.6, -27, -24.4]) ctx.fillRect(x - 0.4, y, 0.8, 1.2);
    },
  },
  gilded: {
    name: 'Gilded spaulders', desc: 'Layered plates edged in gold, flared like wings.',
    draw(h, x, sd) {
      const { ctx, col, fill, P } = h;
      poly(ctx, [x - 3.6, -27, x + sd * 6, -33.4, x + 4, -29.4]); fill(col(METAL.gold.c[0]), 1.1);
      ctx.beginPath(); ctx.ellipse(x, -28.4, 4.4, 3.4, 0, Math.PI, TAU); ctx.lineTo(x + 4.4, -26.4); ctx.lineTo(x - 4.4, -26.4); ctx.closePath(); fill(col(P.metal[0]), 1.3);
      line(ctx, x - 4.2, -26.8, x + 4.2, -26.8, 1.2, col(METAL.gold.c[0]));
    },
  },
};

// ================================================================================
// HANDS: the glove at the end of each arm (the arms are the body's sleeves).
// ================================================================================

export const HANDS = {
  gloves: { name: 'Leather gloves', desc: 'Worn riding gloves.', c: (P) => P.leather[0], r: 2.8 },
  wraps: { name: 'Cloth wraps', desc: 'Hands bound in cloth, a fighter\'s wraps.', c: () => M.wrap, r: 2.6, band: M.wrapShade },
  gauntlets: { name: 'Gauntlets', desc: 'Steel gauntlets with flared cuffs.', c: (P) => P.metal[0], r: 3.3, cuff: (P) => P.metal[1] },
  bracers: { name: 'Bracers', desc: 'Long leather bracers to the elbow.', c: (P) => P.leather[0], r: 2.6, bracer: (P) => P.leather[2] },
  bare: { name: 'Bare hands', desc: 'Nothing between you and the hilt.', c: (P) => P.skin[0], r: 2.5 },
};

// ================================================================================
// LEGS: drawn hip -> knee -> ankle. `c(P)` gives [near colour, far colour] for
// the thigh and `shin(P)` for below the knee (if different).
// ================================================================================

export const LEGS = {
  trousers: { name: 'Trousers', desc: 'Dark travelling trousers.', c: (P) => [P.cloth2[0], P.cloth2[1]] },
  hakama: {
    name: 'Hakama', desc: 'Wide pleated trousers that sweep like a skirt.',
    c: (P) => [P.cloth2[0], P.cloth2[1]], flare: 4.4,
  },
  baggy: {
    name: 'Desert trousers', desc: 'Loose and light, gathered at the ankle.',
    c: (P) => [P.cloth2[0], P.cloth2[1]], width: 5.4, flare: 2.2,
  },
  breeches: {
    name: 'Leather breeches', desc: 'Tough leather with patched knees.',
    c: (P) => [P.leather[0], P.leather[1]], knee: (P) => P.leather[2],
  },
  chausses: {
    name: 'Mail chausses', desc: 'Leggings of rings.',
    c: (P) => [P.metal[0], P.metal[1]], mail: true,
  },
  greaves: {
    name: 'Plate greaves', desc: 'Steel shins and knee cops over padded thighs.',
    c: (P) => [P.cloth2[0], P.cloth2[1]], shin: (P) => [P.metal[0], P.metal[1]], cop: (P) => P.metal[2],
  },
  wrapped: {
    name: 'Wrapped leggings', desc: 'Cloth bound tight around the shins.',
    c: (P) => [P.cloth2[0], P.cloth2[1]], shin: () => [M.wrap, M.wrapShade], stripes: M.wrapShade,
  },
};

// ================================================================================
// FEET: drawn at each ankle. `shin` covers that much of the lower leg too.
// ================================================================================

export const FEET = {
  boots: {
    name: 'Leather boots', desc: 'Sturdy walking boots.',
    draw(h, x, y, toe, tilt) { const { ctx, col, fill, P, V } = h; ctx.beginPath(); ctx.ellipse(x + 1.4 * V.side, y + 1 + 0.8 * toe, 2.5 + 1.3 * V.side, 2.1, toe + tilt, 0, TAU); fill(col(P.leather[1]), 1.4); },
  },
  tall: {
    name: 'Riding boots', desc: 'Tall boots to the knee.', shin: 0.75, shinC: (P) => P.leather[1],
    draw(h, x, y, toe, tilt) { const { ctx, col, fill, P, V } = h; ctx.beginPath(); ctx.ellipse(x + 1.4 * V.side, y + 1 + 0.8 * toe, 2.6 + 1.4 * V.side, 2.2, toe + tilt, 0, TAU); fill(col(P.leather[1]), 1.4); },
  },
  sandals: {
    name: 'Sandals', desc: 'Straps and a sole.',
    draw(h, x, y, toe, tilt) {
      const { ctx, col, fill, P, V } = h;
      ctx.beginPath(); ctx.ellipse(x + 1.4 * V.side, y + 1.2 + 0.8 * toe, 2.5 + 1.3 * V.side, 1.8, toe + tilt, 0, TAU); fill(col(P.skin[0]), 1.2);
      line(ctx, x - 1 + V.side, y + 0.2, x + 1.2 + 2 * V.side, y + 1.6, 0.9, col(P.leather[0]));
    },
  },
  geta: {
    name: 'Geta', desc: 'Raised wooden clogs over white tabi.',
    draw(h, x, y, toe, tilt) {
      const { ctx, col, fill, V } = h;
      ctx.fillStyle = col(M.wood); ctx.strokeStyle = OUT; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.rect(x - 2.4 + 0.4 * V.side, y + 1.8, 4.4 + 2 * V.side, 1.6); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(x + 1.2 * V.side, y + 0.8, 2.2 + 1 * V.side, 1.8, toe + tilt, 0, TAU); fill(col(M.wrap), 1.2);
      line(ctx, x - 0.4 + V.side, y - 0.4, x + 0.6 + V.side, y + 1.6, 0.8, col(M.red));
    },
  },
  sabatons: {
    name: 'Sabatons', desc: 'Pointed steel shoes.',
    shin: 0.3, shinC: (P) => P.metal[0],
    draw(h, x, y, toe, tilt) {
      const { ctx, col, fill, P, V } = h;
      const L = 3 + 2.6 * V.side;
      ctx.save(); ctx.translate(x + 1.2 * V.side, y + 1 + 0.8 * toe); ctx.rotate(toe + tilt);
      poly(ctx, [-2.2, -2, L * 0.4, -2.2, L, 0.6, -2.2, 2]); fill(col(P.metal[0]), 1.3);
      line(ctx, -0.6, -2, -0.6, 2, 0.8, col(P.metal[1]));
      ctx.restore();
    },
  },
  furboots: {
    name: 'Fur boots', desc: 'Boots lined and cuffed with fur.', shin: 0.35, shinC: () => M.fur,
    draw(h, x, y, toe, tilt) { const { ctx, col, fill, V } = h; ctx.beginPath(); ctx.ellipse(x + 1.3 * V.side, y + 1 + 0.8 * toe, 2.9 + 1.2 * V.side, 2.4, toe + tilt, 0, TAU); fill(col(M.furDark), 1.4); },
  },
  waraji: {
    name: 'Tabi and waraji', desc: 'Split-toe socks and straw sandals.',
    draw(h, x, y, toe, tilt) {
      const { ctx, col, fill, V } = h;
      ctx.beginPath(); ctx.ellipse(x + 1.3 * V.side, y + 1 + 0.8 * toe, 2.4 + 1.2 * V.side, 2, toe + tilt, 0, TAU); fill(col(M.wrap), 1.3);
      line(ctx, x - 1.6, y + 2.6, x + 1.6 + 2.2 * V.side, y + 2.6, 1, col(M.straw));
    },
  },
  slippers: {
    name: 'Curled slippers', desc: 'Soft slippers with curling toes.',
    draw(h, x, y, toe, tilt) {
      const { ctx, col, fill, V } = h;
      ctx.beginPath(); ctx.ellipse(x + 1.3 * V.side, y + 1 + 0.8 * toe, 2.4 + 1.3 * V.side, 1.9, toe + tilt, 0, TAU); fill(col(h.accent), 1.3);
      if (V.side > 0.5) { ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x + 4.6, y - 0.2, 1.3, Math.PI * 0.5, Math.PI * 2); ctx.stroke(); }
    },
  },
};

// ================================================================================
// BACK: what is carried on the back. `peek(h)` is drawn behind the body when it
// faces the camera (a glimpse over the shoulders); `back(h)` over the body
// when it faces away. A cape is `cape: len`.
// ================================================================================

function bedroll(h, y, x) {
  const { ctx, col, fill, V } = h;
  ctx.beginPath(); ctx.ellipse(x, y, 9.5, 3.4, -0.08 * V.side, 0, TAU); fill(col(M.roll), 1.4);
  ctx.fillStyle = col(M.rollShade); ctx.fillRect(x - 3, y - 3, 1.6, 6.4); ctx.fillRect(x + 4, y - 3, 1.6, 6.4);
}
function shield(h, full) {
  const { ctx, col, fill, P, V } = h;
  const x = -2.6 * V.side, y = -21;
  ctx.beginPath(); ctx.ellipse(x, y, full ? 9 : 10, full ? 9 : 10.2, 0, 0, TAU); fill(col(P.cloth[0]), 1.6);
  if (full) {
    ctx.save(); ctx.clip();
    ctx.fillStyle = col(h.accent); ctx.fillRect(x - 10, y - 10, 10, 10); ctx.fillRect(x, y, 10, 10);
    ctx.restore();
    ctx.strokeStyle = col(P.metal[0]); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(x, y, 8.4, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 2.6, 0, TAU); fill(col(P.metal[2]), 1.2);
  }
}
export const BACKS = {
  bedroll: {
    name: 'Bedroll', desc: 'Everything you own, rolled and strapped.',
    peek(h) { bedroll(h, -31, -2 * h.V.side); },
    back(h) { bedroll(h, -28, -2 * h.V.side); line(h.ctx, -6, -31, 5, -17, 1.6, h.col(h.P.leather[0])); },
  },
  quiver: {
    name: 'Quiver', desc: 'A leather quiver of fletched arrows.',
    peek(h) {
      const { ctx, col } = h;
      for (let i = 0; i < 3; i++) { line(ctx, -4 + i * 1.6, -30, -6 + i * 1.8, -36 - i, 0.9, col('#d8c8a0')); line(ctx, -6 + i * 1.8, -36 - i, -6.6 + i * 1.8, -38.4 - i, 1.8, h.accent); }
    },
    back(h) {
      const { ctx, col, P } = h;
      seg(ctx, -5, -32, 4, -14, 4.4, col(P.leather[0]));
      for (let i = 0; i < 3; i++) line(ctx, -6 + i * 1.6, -32, -7.4 + i * 1.8, -36.4 - i, 1.8, h.accent);
    },
  },
  shield: {
    name: 'Round shield', desc: 'A painted round shield slung on the back.',
    peek(h) { shield(h, false); },
    back(h) { shield(h, true); },
  },
  pack: {
    name: 'Pack', desc: 'A travelling pack with a rolled blanket.',
    peek(h) { const { ctx, col, fill, P } = h; rrect(ctx, -7, -35, 12, 6, 2); fill(col(P.leather[0]), 1.3); },
    strapsFront(h) {
      if (h.back) return;
      const { ctx, col, P } = h;
      line(ctx, -5 + h.openX * 0.2, -30, -6, -20, 1.4, col(P.leather[1]));
      line(ctx, 5 + h.openX * 0.2, -30, 6, -20, 1.4, col(P.leather[1]));
    },
    back(h) {
      const { ctx, col, fill, P } = h;
      rrect(ctx, -7, -32, 13, 16, 3); fill(col(P.leather[0]), 1.4);
      rrect(ctx, -7, -32, 13, 6, 2); fill(col(P.leather[2]), 1.2);
      bedroll(h, -33.5, -0.6);
    },
  },
  cape: {
    name: 'Short cape', desc: 'A cape to the waist, in your cloth.', cape: 16,
  },
  cloak: {
    name: 'Long cloak', desc: 'A long cloak that sweeps behind you.', cape: 28,
  },
  banner: {
    name: 'Sashimono', desc: 'A samurai\'s banner on a pole, flying above the head.',
    pole(h) {
      const { ctx, col, fill } = h;
      const x = -3 - 1.4 * h.V.side;
      line(ctx, x, -22, x, -62, 2.6, OUT);
      line(ctx, x, -22, x, -62, 1.2, col(M.wood));
      const w = h.wave * 0.6;
      ctx.beginPath(); ctx.moveTo(x - 0.4, -61); ctx.lineTo(x - 9, -60 + w); ctx.lineTo(x - 9.4, -45 + w * 1.4); ctx.lineTo(x - 0.4, -46); ctx.closePath();
      fill(h.accent, 1.2);
      if (!h.flashing) { ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(x - 4.8, -53 + w, 2.2, 0, TAU); ctx.fill(); }
      void col;
    },
    peek(h) { this.pole(h); },
    back(h) { this.pole(h); },
  },
  katana: {
    name: 'Sheathed blade', desc: 'A long blade in a black saya, across the back.',
    peek(h) { const { ctx, col } = h; seg(ctx, -7, -34, -4, -30, 1.8, col(h.accent)); },
    back(h) {
      const { ctx, col } = h;
      seg(ctx, -8, -36, 7, -12, 2.4, col(M.lacquer));
      seg(ctx, -8, -36, -5.4, -32, 2, col(h.accent));
      line(ctx, -5.4, -32.6, -4.2, -30.6, 3.4, col(METAL.gold.c[0]));
    },
  },
  none: { name: 'Nothing', desc: 'Travelling light.' },
};

// ================================================================================
// BELT
// ================================================================================

export const BELTS = {
  leather: {
    name: 'Belt and buckle', desc: 'A plain belt with a brass buckle.',
    draw(h) { const { ctx, col, P } = h; ctx.fillStyle = col(P.leather[0]); ctx.fillRect(-8.2, -18.5, 16.4, 2.6); if (!h.back) { ctx.fillStyle = col('#e0b050'); ctx.fillRect(h.openX - 1.5, -18.8, 3, 3.2); } },
  },
  obi: {
    name: 'Obi sash', desc: 'A broad sash, knotted at the side.',
    draw(h) {
      const { ctx, col, fill, P } = h;
      ctx.fillStyle = col(P.cloth2[0]); ctx.fillRect(-8.6, -19.4, 17.2, 4); ctx.fillStyle = col(h.accent); ctx.fillRect(-8.6, -17.8, 17.2, 0.9);
      const kx = h.back ? 2 : -5;
      ctx.beginPath(); ctx.ellipse(kx, -17.4, 2, 1.5, 0.3, 0, TAU); fill(col(P.cloth2[1]), 1);
      line(ctx, kx, -16.4, kx - 1.4, -12, 1.4, col(P.cloth2[1]));
    },
  },
  rope: {
    name: 'Rope belt', desc: 'A length of rope, tied off.',
    draw(h) {
      const { ctx, col } = h;
      line(ctx, -8.2, -17.4, 8.2, -17.4, 1.6, col('#b89a60'));
      if (!h.back) { line(ctx, h.openX - 1, -17, h.openX - 2, -11.6, 1.2, col('#b89a60')); line(ctx, h.openX + 0.6, -17, h.openX + 1.2, -12.6, 1.2, col('#b89a60')); }
    },
  },
  pouches: {
    name: 'Pouch belt', desc: 'A belt hung with pouches and a flask.',
    draw(h) {
      const { ctx, col, fill, P } = h;
      ctx.fillStyle = col(P.leather[0]); ctx.fillRect(-8.2, -18.5, 16.4, 2.6);
      for (const x of [-6.4, 4.4]) { rrect(ctx, x, -17, 3, 3.6, 0.8); fill(col(P.leather[2]), 1); }
    },
  },
  none: { name: 'None', desc: '', draw() {} },
};

// ================================================================================
// The slots, in wardrobe order.
// ================================================================================

export const SLOTS = [
  { id: 'hat', name: 'Head', list: HATS },
  { id: 'face', name: 'Face', list: FACES },
  { id: 'hair', name: 'Hair', list: HAIRSTYLES },
  { id: 'neck', name: 'Neck', list: NECKS },
  { id: 'body', name: 'Body', list: BODIES },
  { id: 'shoulders', name: 'Shoulders', list: SHOULDERS },
  { id: 'hands', name: 'Hands', list: HANDS },
  { id: 'legs', name: 'Legs', list: LEGS },
  { id: 'feet', name: 'Feet', list: FEET },
  { id: 'back', name: 'Back', list: BACKS },
  { id: 'belt', name: 'Belt', list: BELTS },
];

export const DYE_SLOTS = [
  { id: 'cloth', name: 'Cloth', list: CLOTH },
  { id: 'cloth2', name: 'Second cloth', list: CLOTH },
  { id: 'metal', name: 'Metal', list: METAL },
  { id: 'leather', name: 'Leather', list: LEATHER },
  { id: 'hairC', name: 'Hair colour', list: HAIR },
  { id: 'skin', name: 'Skin', list: SKIN },
  { id: 'accent', name: 'Accent', list: ACCENT },
];

/** The Wanderer as first drawn. */
export const DEFAULT_OUTFIT = {
  hat: 'straw', face: 'none', hair: 'short', neck: 'scarf', body: 'coat', shoulders: 'none',
  hands: 'gloves', legs: 'trousers', feet: 'boots', back: 'bedroll', belt: 'leather',
  cloth: 'rust', cloth2: 'slate', metal: 'iron', leather: 'dark', hairC: 'brown', skin: 'warm', accent: 'weapon',
};

// Whole outfits, a tap away.
export const PRESETS = [
  { id: 'wanderer', name: 'The Wanderer', o: {} },
  { id: 'ronin', name: 'Ronin', o: { hat: 'kasa', hair: 'tail', neck: 'none', body: 'kimono', hands: 'wraps', legs: 'hakama', feet: 'waraji', back: 'katana', belt: 'obi', cloth: 'indigo', cloth2: 'slate', accent: 'blood' } },
  { id: 'samurai', name: 'Samurai', o: { hat: 'kabuto', face: 'menpo', neck: 'none', body: 'lamellar', shoulders: 'sode', hands: 'gauntlets', legs: 'hakama', feet: 'waraji', back: 'banner', belt: 'obi', cloth: 'crimson', cloth2: 'black', metal: 'black', accent: 'gold' } },
  { id: 'knight', name: 'Knight', o: { hat: 'sallet', neck: 'none', body: 'plate', shoulders: 'pauldrons', hands: 'gauntlets', legs: 'greaves', feet: 'sabatons', back: 'cloak', belt: 'leather', cloth: 'navy', cloth2: 'slate', metal: 'steel', accent: 'sky' } },
  { id: 'crusader', name: 'Crusader', o: { hat: 'greathelm', neck: 'none', body: 'tabard', shoulders: 'none', hands: 'gauntlets', legs: 'chausses', feet: 'sabatons', back: 'shield', belt: 'leather', cloth: 'bone', cloth2: 'slate', metal: 'steel', accent: 'blood' } },
  { id: 'ranger', name: 'Ranger', o: { hat: 'ranger', hair: 'tail', neck: 'cowl', body: 'ranger', shoulders: 'pads', hands: 'bracers', legs: 'breeches', feet: 'tall', back: 'quiver', belt: 'pouches', cloth: 'forest', cloth2: 'moss', leather: 'brown', accent: 'gold' } },
  { id: 'northman', name: 'Northman', o: { hat: 'horned', face: 'beard', hair: 'long', neck: 'mantle', body: 'mail', shoulders: 'pelts', hands: 'gloves', legs: 'wrapped', feet: 'furboots', back: 'shield', belt: 'leather', cloth: 'crimson', cloth2: 'slate', metal: 'iron', hairC: 'auburn', accent: 'snow' } },
  { id: 'monk', name: 'Temple monk', o: { hat: 'none', hair: 'shaved', neck: 'beads', body: 'robe', hands: 'wraps', legs: 'trousers', feet: 'sandals', back: 'none', belt: 'rope', cloth: 'saffron', cloth2: 'wine', accent: 'jade' } },
  { id: 'nomad', name: 'Desert nomad', o: { hat: 'wrap', face: 'bandit', neck: 'none', body: 'desert', hands: 'wraps', legs: 'baggy', feet: 'slippers', back: 'pack', belt: 'obi', cloth: 'sand', cloth2: 'teal', leather: 'tan', accent: 'ember' } },
  { id: 'mage', name: 'Hedge wizard', o: { hat: 'pointed', face: 'beard', hair: 'long', neck: 'amulet', body: 'mage', hands: 'bare', legs: 'trousers', feet: 'slippers', back: 'none', belt: 'rope', cloth: 'indigo', cloth2: 'plum', hairC: 'white', accent: 'violet' } },
  { id: 'bandit', name: 'Bandit', o: { hat: 'bandana', face: 'bandit', hair: 'tail', neck: 'none', body: 'jerkin', shoulders: 'pads', hands: 'gloves', legs: 'breeches', feet: 'boots', back: 'pack', belt: 'pouches', cloth: 'slate', cloth2: 'wine', leather: 'brown', accent: 'blood' } },
  { id: 'corsair', name: 'Corsair', o: { hat: 'tricorn', face: 'eyepatch', hair: 'long', neck: 'longscarf', body: 'doublet', hands: 'gloves', legs: 'trousers', feet: 'tall', back: 'none', belt: 'obi', cloth: 'crimson', cloth2: 'navy', leather: 'black', metal: 'gold', accent: 'gold' } },
  { id: 'kitsune', name: 'Fox pilgrim', o: { hat: 'none', face: 'kitsune', hair: 'long', neck: 'beads', body: 'kimono', hands: 'wraps', legs: 'hakama', feet: 'geta', back: 'none', belt: 'obi', cloth: 'bone', cloth2: 'crimson', hairC: 'white', accent: 'blood' } },
  { id: 'physician', name: 'Plague physician', o: { hat: 'tricorn', face: 'plague', neck: 'none', body: 'coat', hands: 'gloves', legs: 'trousers', feet: 'tall', back: 'pack', belt: 'pouches', cloth: 'black', cloth2: 'black', leather: 'black', metal: 'silver', accent: 'jade' } },
  { id: 'winter', name: 'Winter hunter', o: { hat: 'fur', neck: 'longscarf', body: 'furcoat', shoulders: 'pelts', hands: 'gloves', legs: 'breeches', feet: 'furboots', back: 'quiver', belt: 'leather', leather: 'brown', cloth2: 'slate', accent: 'snow' } },
  { id: 'noble', name: 'Exiled noble', o: { hat: 'circlet', hair: 'long', neck: 'amulet', body: 'doublet', shoulders: 'gilded', hands: 'gloves', legs: 'trousers', feet: 'tall', back: 'cape', belt: 'leather', cloth: 'plum', cloth2: 'black', metal: 'gold', hairC: 'blond', accent: 'gold' } },
  { id: 'oni', name: 'Oni warlord', o: { hat: 'kabuto', face: 'oni', neck: 'none', body: 'lamellar', shoulders: 'sode', hands: 'gauntlets', legs: 'greaves', feet: 'sabatons', back: 'banner', belt: 'obi', cloth: 'black', cloth2: 'crimson', metal: 'black', accent: 'blood' } },
  { id: 'warden', name: 'Ashen Warden', o: { hat: 'greathelm', neck: 'none', body: 'ember', shoulders: 'spiked', hands: 'gauntlets', legs: 'greaves', feet: 'sabatons', back: 'cloak', belt: 'leather', cloth: 'black', cloth2: 'black', metal: 'black', accent: 'ember' } },
];

/** Fill in anything missing (and anything no longer in the catalogue) from the default. */
export function normaliseOutfit(o) {
  const out = { ...DEFAULT_OUTFIT, ...(o || {}) };
  for (const s of SLOTS) if (!s.list[out[s.id]]) out[s.id] = DEFAULT_OUTFIT[s.id];
  for (const d of DYE_SLOTS) if (!d.list[out[d.id]]) out[d.id] = DEFAULT_OUTFIT[d.id];
  return out;
}

/** The outfit the Wanderer is drawn in. */
let current = normaliseOutfit(null);
export function setOutfit(o) { current = normaliseOutfit(o); }
export function getOutfit() { return current; }

/** Parts and colours for drawing, from an outfit. */
export function resolveOutfit(o = current) {
  return {
    hat: HATS[o.hat], face: FACES[o.face], hair: HAIRSTYLES[o.hair], neck: NECKS[o.neck], body: BODIES[o.body],
    shoulders: SHOULDERS[o.shoulders], hands: HANDS[o.hands], legs: LEGS[o.legs], feet: FEET[o.feet],
    back: BACKS[o.back], belt: BELTS[o.belt],
    P: {
      cloth: CLOTH[o.cloth].c, cloth2: CLOTH[o.cloth2].c, metal: METAL[o.metal].c, leather: LEATHER[o.leather].c,
      hair: HAIR[o.hairC].c[0], skin: SKIN[o.skin].c, accent: ACCENT[o.accent].c[0],
    },
  };
}

/** A random outfit (the wardrobe's "Surprise me"). */
export function randomOutfit() {
  const pick = (obj) => { const k = Object.keys(obj); return k[Math.floor(Math.random() * k.length)]; };
  const o = {};
  for (const s of SLOTS) o[s.id] = pick(s.list);
  for (const d of DYE_SLOTS) o[d.id] = pick(d.list);
  return o;
}
