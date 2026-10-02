// THE COLOUR SYSTEM, read off the ED rather than invented.
//
// Two tiers, and the separation between them is the whole look:
//
//   THE WORLD is a warm near-neutral. Measured across three street frames:
//   median saturation 14%, median value 77%, hues clustered at 26-40 degrees.
//   Roads, paving, kerbs and walls all live here. Nothing is dark - the tenth
//   percentile of value is 51%.
//
//   THE ACTORS AND A FEW ACCENTS are loud. The eleven-colour palette the owner
//   measured (every one of them peaking at 184 on its strongest channel) is for
//   these: a vending machine, an awning, a banner, the leaves, and the people.
//   Three or four per screen, no more, or the street stops reading as sunlight.
//
// Spending saturation like money is what makes it anime and not a game.

/** Measured: shadow is DARKER, MORE SATURATED and WARMER. Not cooler, not grey.
 *  Lit road #beb5a7 -> shaded #b7a99a; lit path #d8c49d -> shaded #a18262. */
export const SHADOW = { hue: -7, sat: 0.10, val: 0.80 };

/** Measured off three plain boxes: light comes from the SCREEN UPPER RIGHT, so
 *  the face pointing down-right catches it and the one pointing down-left is in
 *  shade. (The ED's vending machines look the other way round only because
 *  their product displays are backlit.) */
export const LIGHT = { top: 1.00, lit: 0.96, dim: 0.82 };

/** The darkest thing in the entire ED is the characters' line, at value 32% -
 *  a cool near-navy. Nothing is ever black. */
export const INK = '#404352';

/** The world. Every one of these is a cluster centre from the real frames. */
export const W = {
  road:    '#cec6b9',   // 15% of the street, H36 S10 V81
  roadDim: '#bcb1a5',   // 13%, the same road in half-shade
  slab:    '#ded9d1',   // 12%, a lit paving slab
  kerb:    '#a19b92',   // 10%, kerbs and deeper shade
  sun:     '#edcab0',   //  7%, surfaces in direct sun
  lane:    '#cba26e',   //  6%, the terracotta bike lane
  wall:    '#e8e2d6',   //      shopfront render
  line:    '#f2efe9',   //      road paint
};

/** The four near-white tints a paving slab picks from. The grid is one of the
 *  cheapest things to draw and it carries the whole ground plane. */
export const SLABS = ['#e3ddd2', '#ded7ca', '#e8e2d7', '#e0dbd1'];

/** The eleven. Loud, and rationed. */
export const A = {
  seafoam: '#58b8a8', cream: '#b8b888', rose: '#b87888', ochre: '#b89040',
  orchid:  '#a850b8', magenta: '#b85890', cornflower: '#5070b8', sky: '#4890b8',
  crimson: '#b05070', aqua: '#78b8b8', indigo: '#2840b8',
};

/** Foliage and the vending machine measured at S69% and S68% - the two loudest
 *  things in the street, and both of them props. */
export const LEAF = '#97aa34';
export const VEND = '#17929e';

// --- the colour maths -------------------------------------------------------

export function toHsv(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-6) {
    if (mx === r) h = ((g - b) / d + 6) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, mx === 0 ? 0 : d / mx, mx];
}

export function hsv(h, s, v) {
  h = ((h % 360) + 360) % 360;
  s = Math.min(1, Math.max(0, s));
  v = Math.min(1, Math.max(0, v));
  const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
  const i = Math.floor(h / 60) % 6;
  const t = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][i];
  const q = (u) => Math.round((u + m) * 255).toString(16).padStart(2, '0');
  return `#${q(t[0])}${q(t[1])}${q(t[2])}`;
}

/** The measured shadow rule. k is how deep: ~0.95 for contact shade under a
 *  lip, ~0.80 for a face turned away, ~0.75 for a real cast shadow. */
export function shade(hex, k = SHADOW.val) {
  const [h, s, v] = toHsv(hex);
  return hsv(h + SHADOW.hue, s + SHADOW.sat, v * k);
}

/** And its opposite, for a surface turned into the light. */
export function lift(hex, k = 1.08) {
  const [h, s, v] = toHsv(hex);
  return hsv(h + 3, s * 0.85, v * k);
}

/** The three faces of any solid, from one colour. This is the whole of
 *  "looks 3D, is 2D": three flat fills and a light that never moves. */
export function faces(hex) {
  return {
    top: lift(hex, LIGHT.top * 1.05),
    lit: shade(hex, LIGHT.lit),
    dim: shade(hex, LIGHT.dim),
  };
}

/** Actors are outlined; architecture is not. The line is a dark, desaturated
 *  relative of the fill, pulled most of the way toward INK. */
export function outlineOf(hex, k = 0.72) {
  const [h, s] = toHsv(hex);
  const [ih, is, iv] = toHsv(INK);
  return hsv(h + (ih - h) * k, s + (is - s) * k * 0.8, iv * 1.05);
}
