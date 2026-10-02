// HER.
//
// In the ED the characters are 2D cel art composited into a 3D world - they do
// not share the scenery's geometry, they are drawn flat and face the camera.
// So she is drawn in SCREEN space, standing up from wherever her feet land,
// and the only thing the world tells her is where that point is and how near
// she is for the depth sort. That is also what the reference says to do: in
// the footage she is a drawing, and the street is a model.
//
// Measured off the ED: she stands 23% of the frame height (166-171 px of 720,
// across two frames), so at our 600-unit view she is about 138 px tall. At that
// size her face is barely 26 px - in the real footage her eyes are two or three
// pixels. The read comes from the silhouette, from four blocks of colour, and
// from the outline. Rendering a face in detail here is work nobody can see.
//
// THE SILHOUETTE IS THE CHARACTER. Pink hair falling past her shoulders, two
// small buns on top, a blunt fringe - that shape, at thirty pixels across, is
// the whole recognition. A first pass gave her a round ball of hair with the
// buns stuck on the sides and she read as a teddy bear; the fix was not more
// detail, it was getting the outline right.
//
// She is laid out in a local space where her feet are y = 0 and the top of her
// hair is y = -100, so every landmark below is a percentage of her height. No
// mirroring and no flipped axes: one scale, and y goes down the way canvas does.

import { INK } from './palette.js';

const TAU = Math.PI * 2;

/** The landmarks, as percentages of her height. About five heads, which is
 *  what the close-up measures once the hair is discounted. */
const L = {
  crown: -100, skull: -95, brow: -87, eyes: -84, chin: -76,
  shoulder: -71, chest: -62, waist: -52, hip: -48, hem: -36,
  knee: -24, sock: -12, ankle: -5, foot: 0,
};

/** Sampled off the close-up at 79 s and the in-world sprite at 31 s. */
export const SKIN = {
  hair: '#f0a0b4', hairLit: '#fbd0d9', hairDim: '#d2788f',
  skin: '#fce3da', skinDim: '#eec2bb',
  shirt: '#fcf8f3', shirtDim: '#e5d9d4',
  collar: '#2d3a5b', scarf: '#bcd94a', clip: '#e8629a',
  skirt: '#3a4a6e', skirtDim: '#2a3654',
  sock: '#2b2b35', shoe: '#f7c8d4', shoeSole: '#fdfdfd',
  ear: '#e0405a', eye: '#3c4030', white: '#ffffff', blush: '#f7aeb2',
};

/** The outline weight in her local units. She carries the thickest line in the
 *  scene on purpose - architecture has none, props have a thin one, and she
 *  has this. That ladder is the depth hierarchy, since the palette has no
 *  value contrast to do the job. */
const LW = 3.0;

/**
 * Draw her. (sx, sy) is where her feet touch the ground - the caller gets that
 * from view.js, which is the only thing allowed to know where the ground is.
 *
 * Two passes, which is the trick that makes a cel figure read: everything is
 * drawn once solid in ink and stroked fat, then everything again in colour on
 * top. The result is one clean line around the whole silhouette and no line
 * between her arm and her side - exactly what the reference does.
 */
export function drawGirl(ctx, sx, sy, height = 138) {
  const s = height / 100;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  body(ctx, true);
  body(ctx, false);
  detail(ctx);
  ctx.restore();
}

/** The long fall of hair behind her: wide at the shoulders, scalloped into
 *  ringlets at the bottom. The one shape that has to be right. */
function backHair(ctx) {
  ctx.beginPath();
  ctx.moveTo(-7.5, -93);
  ctx.bezierCurveTo(-14, -90, -16.5, -78, -16, -66);
  ctx.bezierCurveTo(-16, -60, -17, -56, -16.5, -51);
  for (let i = 0; i < 4; i++) {                      // ringlet ends
    const x0 = -16.5 + i * 8.3, x1 = x0 + 8.3;
    ctx.quadraticCurveTo((x0 + x1) / 2, -43.5, x1, -51);
  }
  ctx.bezierCurveTo(17, -56, 16, -60, 16, -66);
  ctx.bezierCurveTo(16.5, -78, 14, -90, 7.5, -93);
  ctx.closePath();
}

function body(ctx, ink) {
  const put = (color) => {
    if (ink) {
      ctx.fillStyle = INK; ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = LW; ctx.stroke();
    } else {
      ctx.fillStyle = color; ctx.fill();
    }
  };
  const ell = (x, y, rx, ry, rot, color) => {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); put(color);
  };
  const quad = (pts, color) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath(); put(color);
  };

  // --- behind her ----------------------------------------------------------
  backHair(ctx); put(SKIN.hairDim);

  // --- legs and feet -------------------------------------------------------
  quad([[-6.6, L.hip], [-1.2, L.hip], [-2.0, L.ankle], [-6.8, L.ankle]], SKIN.skin);
  quad([[2.0, L.hip], [7.4, L.hip], [8.0, L.ankle], [3.2, L.ankle]], SKIN.skin);
  quad([[-6.9, L.knee], [-1.6, L.knee], [-2.2, -3.5], [-7.2, -3.5]], SKIN.sock);
  quad([[2.6, L.knee], [7.9, L.knee], [8.2, -3.5], [3.0, -3.5]], SKIN.sock);
  ell(-4.2, -2.2, 5.6, 3.0, -0.08, SKIN.shoe);       // feet point down-right,
  ell(6.3, -1.6, 5.8, 3.1, -0.08, SKIN.shoe);        // the way she faces

  // --- the skirt -----------------------------------------------------------
  quad([[-7.4, L.waist], [7.4, L.waist], [13.2, L.hem], [-12.6, L.hem]], SKIN.skirt);

  // --- the torso -----------------------------------------------------------
  quad([
    [-9.4, L.shoulder], [9.4, L.shoulder], [7.6, L.waist + 1], [-7.6, L.waist + 1],
  ], SKIN.shirt);
  ell(-9.6, -67.6, 4.4, 4.8, 0.22, SKIN.shirt);      // puffed sleeve caps
  ell(9.9, -67.6, 4.4, 4.8, -0.22, SKIN.shirt);

  // --- the arms ------------------------------------------------------------
  quad([[-11.2, -66.5], [-8.4, -66.5], [-9.8, -51.5], [-12.6, -51.5]], SKIN.skin);
  quad([[8.8, -66.5], [11.6, -66.5], [13.0, -51.5], [10.2, -51.5]], SKIN.skin);
  ell(-11.3, -50.0, 2.6, 2.8, 0, SKIN.skin);
  ell(11.7, -50.0, 2.6, 2.8, 0, SKIN.skin);

  // --- head ----------------------------------------------------------------
  quad([[-2.2, L.chin + 1], [2.8, L.chin + 1], [2.8, -72], [-2.2, -72]], SKIN.skin);
  ell(0.9, -85.0, 7.6, 9.2, 0, SKIN.skin);           // the face

  // --- hair in front -------------------------------------------------------
  ell(0.9, -89.2, 8.8, 7.4, 0, SKIN.hair);           // the crown and the blunt
  ell(0.9, -91.4, 8.4, 5.2, 0, SKIN.hair);           // fringe, as one mass
  ell(-7.2, -82.0, 3.4, 8.2, 0.16, SKIN.hair);       // locks past the cheeks
  ell(9.0, -82.0, 3.4, 8.2, -0.16, SKIN.hair);
  ell(-3.8, -95.8, 3.3, 3.0, 0, SKIN.hair);          // two small knots, tucked
  ell(5.6, -95.6, 3.3, 3.0, 0, SKIN.hair);           // into the crown, not
                                                     // stuck on at the sides
}

/** The parts that sit ON her rather than making her shape: the collar, the
 *  neckerchief, the pleats, two eyes, and the earrings the owner asked for. */
function detail(ctx) {
  const ell = (x, y, rx, ry, c, rot = 0) => {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
    ctx.fillStyle = c; ctx.fill();
  };
  const shape = (pts, c) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath(); ctx.fillStyle = c; ctx.fill();
  };

  // The sailor collar, over the shoulders and to a point at her back.
  shape([[-9.3, L.shoulder], [9.3, L.shoulder], [8.4, -68.2], [0.8, -65.4],
         [-7.2, -68.2]], SKIN.collar);

  // The neckerchief - lime, and one of very few saturated things on her.
  shape([[-2.6, -67.0], [0.8, -65.4], [4.2, -67.0], [2.4, -59.5], [-0.6, -59.5]],
        SKIN.scarf);
  ell(0.8, -65.8, 1.1, 0.9, SKIN.clip);

  // Pleats: three darker wedges, which is all a skirt needs at this size.
  ctx.fillStyle = SKIN.skirtDim;
  for (const u of [-0.55, 0.0, 0.55]) {
    shape([[u * 7.4 - 0.8, L.waist], [u * 7.4 + 0.8, L.waist],
           [u * 13.2 + 1.5, L.hem], [u * 13.2 - 1.5, L.hem]], SKIN.skirtDim);
  }

  // Hard white highlight bands in the hair. The cheapest anime tell there is,
  // and the close-up leans on it heavily.
  ctx.save();
  ctx.beginPath(); ctx.ellipse(0.9, -91.4, 8.4, 5.2, 0, 0, TAU); ctx.clip();
  ell(-0.4, -93.2, 6.4, 1.4, SKIN.hairLit, -0.10);
  ctx.restore();
  ctx.save();
  backHair(ctx); ctx.clip();
  ell(-11.0, -72.0, 2.0, 7.0, SKIN.hairLit, 0.12);
  ell(11.4, -72.0, 2.0, 7.0, SKIN.hairLit, -0.12);
  ctx.restore();
  ell(-3.8, -96.8, 1.6, 0.9, SKIN.hairLit, -0.16);
  ell(5.6, -96.6, 1.6, 0.9, SKIN.hairLit, -0.16);

  // Two eyes and a mouth. At 138 px tall this is five marks; any more is work
  // nobody can see.
  ell(-2.0, L.eyes, 1.5, 2.0, SKIN.eye);
  ell(4.0, L.eyes, 1.5, 2.0, SKIN.eye);
  ell(-2.3, L.eyes - 0.8, 0.55, 0.7, SKIN.white);
  ell(3.7, L.eyes - 0.8, 0.55, 0.7, SKIN.white);
  ell(0.9, -79.4, 1.1, 0.7, '#c4707e');
  ell(-4.8, -81.6, 2.1, 1.0, SKIN.blush);
  ell(6.8, -81.6, 2.1, 1.0, SKIN.blush);

  // The earrings. The owner called them out, and specific small things are what
  // make a character read as a particular person rather than as a figure.
  ell(-6.8, -80.6, 1.5, 1.5, SKIN.ear);
  ell(8.6, -80.6, 1.5, 1.5, SKIN.ear);
  ell(-7.1, -81.0, 0.5, 0.5, '#ffd8dc');
  ell(8.3, -81.0, 0.5, 0.5, '#ffd8dc');

  // The handful of internal lines cel art draws: the arms against the body,
  // the hem, and the tops of the socks.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.0;
  const line = (ax, ay, bx, by) => {
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  };
  line(-8.4, -66.0, -9.8, -52.0);
  line(8.8, -66.0, 10.2, -52.0);
  line(-7.4, L.waist, 7.4, L.waist);
  line(-6.9, L.knee, -1.6, L.knee);
  line(2.6, L.knee, 7.9, L.knee);
  ctx.fillStyle = SKIN.shoeSole;                      // a sole, so the shoes
  ell(-4.2, -0.9, 5.3, 1.3, SKIN.shoeSole, -0.08);    // are not pink pebbles
  ell(6.3, -0.4, 5.5, 1.3, SKIN.shoeSole, -0.08);

  // One soft step of shade down her left side, where the light does not reach.
  // Warm and more saturated, the way the footage measured.
  ctx.fillStyle = 'rgba(176,128,146,0.24)';
  shape([[-9.4, L.shoulder], [-3.4, L.shoulder], [-2.8, L.waist + 1],
         [-7.6, L.waist + 1]], 'rgba(176,128,146,0.24)');
  shape([[-7.4, L.waist], [-2.4, L.waist], [-4.4, L.hem], [-12.6, L.hem]],
        'rgba(176,128,146,0.24)');
}
