// THE STYLE TEST. Not a game: one still screen, to find out whether this look
// can be drawn in code before a street is built out of it.
//
// A corner of pavement with the props the ED's street is actually made of - a
// shopfront terrace under awnings, vending machines, a bin, nobori banners, a
// planter, telephone poles, the far kerb and a hedge - and her standing in it.
// Nothing moves, so the only question on the table is the drawing.
//
// The whole scene is written as DATA below. That is the point of the kit: the
// second street should cost an hour, not a week.
//
// The page can re-aim the camera from the query string (?z=2&cx=200&cy=100),
// which is how the drawing gets inspected close up without rebuilding it.

import { aim, createScene, toScreen, upPixels } from './view.js';
import { W, shade, lift } from './palette.js';
import {
  slabs, band, box, post, awning, banner, bush, vending, bin, shopWindow,
  contact, castShadow, quadX, grain, sunWash, car, groundCircle,
} from './kit.js';
import { drawGirl } from './girl.js';

export const VIEW = { w: 1280, h: 600 };

/** Everything in centimetres. The street runs along y; the shops are at low x
 *  and the road at high x, which is the way round the footage has it. */
const S = {
  pave:    { x0: 0,    x1: 300 },
  kerb:    { x0: 300,  x1: 316 },
  lane:    { x0: 316,  x1: 404 },   // the terracotta bike lane
  road:    { x0: 404,  x1: 784 },
  farKerb: { x0: 784,  x1: 800 },
  farPave: { x0: 800,  x1: 1030 },
  y0: -2400, y1: 2400,
};

/** The shopfront terrace, as a list. Awning colours are the only loud thing
 *  on this side of the street, which is the whole saturation budget. */
const SHOPS = [
  { y: -1500, d: 520, h: 600, wall: '#ece5d8', awn: '#ecb3ad', sign: '#b05070' },
  { y:  -980, d: 430, h: 670, wall: '#f1e9da', awn: '#a2cfcb', sign: '#4890b8' },
  { y:  -550, d: 560, h: 590, wall: '#e7e0d4', awn: '#ecb3ad', sign: '#b89040' },
  { y:    10, d: 480, h: 650, wall: '#f0eade', awn: '#ddca92', sign: '#58b8a8' },
  { y:   490, d: 620, h: 610, wall: '#eae1d4', awn: '#a2cfcb', sign: '#b85890' },
];

export function draw(ctx, o = {}) {
  const w = o.w || VIEW.w, h = o.h || VIEW.h;
  aim({
    x: o.cx !== undefined ? o.cx : 330,
    y: o.cy !== undefined ? o.cy : 0,
    scale: o.z || 0.735,
    w, h,
  });

  ctx.fillStyle = W.road;
  ctx.fillRect(0, 0, w, h);

  const scene = createScene();

  // --- the ground ----------------------------------------------------------
  scene.flat((c) => {
    band(c, S.road.x0, S.farPave.x1, S.y0, S.y1, W.road);
    band(c, S.lane.x0, S.lane.x1, S.y0, S.y1, W.lane);
    band(c, S.kerb.x0, S.kerb.x1, S.y0, S.y1, lift(W.kerb, 1.26));
    band(c, S.farKerb.x0, S.farKerb.x1, S.y0, S.y1, lift(W.kerb, 1.26));
    slabs(c, { x0: S.pave.x0, y0: S.y0, x1: S.pave.x1, y1: S.y1, t: 46, seed: 7 });
    slabs(c, { x0: S.farPave.x0, y0: S.y0, x1: S.farPave.x1, y1: S.y1, t: 46, seed: 23 });

    // Road paint, and the white line that edges the bike lane.
    for (let y = S.y0; y < S.y1; y += 320) band(c, 588, 600, y, y + 180, W.line);

    // A crossing, because an empty road reads as paper.
    for (let i = 0; i < 7; i++) {
      const xx = S.road.x0 + 14 + i * 52;
      band(c, xx, xx + 32, -1340, -1120, W.line);
    }
    band(c, S.lane.x1, S.lane.x1 + 9, S.y0, S.y1, W.line);
    band(c, S.road.x1 - 9, S.road.x1, S.y0, S.y1, W.line);

    // Manhole covers, because a road with nothing on it reads as paper.
    for (const [mx, my] of [[500, -520], [700, 560], [470, 1180]]) {
      groundCircle(c, mx, my, 26);
      c.fillStyle = shade(W.road, 0.90);
      c.fill();
    }

    // The terrace throws a long soft shadow, and it reaches screen-left -
    // which from buildings at low x means away from the street, so the
    // shopfronts stay in the sun. That is what the reference frames show.
    castShadow(c, -40, S.y0, 40, S.y1 - S.y0, 600, 0.20);
  });

  // --- the terrace ---------------------------------------------------------
  // Forced to the back of the sort: every prop in this scene is street-side of
  // it, so one depth for the whole row is safe here. A real street splits the
  // row into one box per shop, which is how it gets authored anyway.
  scene.add(-9e4, 0, (c) => {
    for (const s of SHOPS) shopfront(c, s);
  });

  // --- the far side, which keeps the road from reading as empty paper ------
  scene.add(1030, -2400, (c) => {
    box(c, { x: 1030, y: S.y0, w: 340, d: S.y1 - S.y0, h: 108, color: '#ded6c6' });
  });
  for (let y = S.y0 + 170; y < S.y1; y += 290) {
    scene.add(980, y, ((yy) => (c) =>
      bush(c, { x: 962, y: yy, r: 70, h: 90, seed: 40 + yy, color: '#8fa63a' }))(y));
  }

  // --- the props, as data --------------------------------------------------
  const props = [
    [40, 250, (c) => vending(c, { x: 40, y: 250, color: '#17929e' })],
    [44, 376, (c) => vending(c, { x: 44, y: 376, w: 76, d: 96, h: 176, color: '#e9ebe7' })],
    [56, 492, (c) => bin(c, { x: 56, y: 492, color: '#5070b8' })],
    [252, -150, (c) => banner(c, { x: 252, y: -150, h: 215, w: 46, color: '#b05070' })],
    [252, 600, (c) => banner(c, { x: 252, y: 600, h: 200, w: 44, color: '#4890b8' })],
    [60, -660, (c) => bush(c, { x: 60, y: -660, r: 74, h: 88, seed: 4 })],
    [92, 900, (c) => bush(c, { x: 92, y: 900, r: 62, h: 72, seed: 11 })],
    [284, -980, (c) => pole(c, 284, -980)],
    [288, 840, (c) => pole(c, 288, 840)],
    [850, -300, (c) => pole(c, 850, -300)],
    [490, -300, (c) => car(c, { x: 490, y: -300, color: '#eceae6' })],
    [470, 1060, (c) => car(c, { x: 470, y: 1060, color: '#cdd6da' })],
  ];
  for (const [x, y, d] of props) scene.add(x, y, d);

  // --- her -----------------------------------------------------------------
  const HER = { x: 170, y: 40, cm: 155 };
  scene.add(HER.x, HER.y, (c) => {
    contact(c, HER.x, HER.y, 34, 0.38);
    const p = toScreen(HER.x, HER.y, 0);
    drawGirl(c, p.x, p.y, upPixels(HER.cm));
  });

  scene.paint(ctx);

  // The air, over everything: the sun falling across the frame, and grain, so
  // the surfaces read as drawn rather than as filled polygons.
  sunWash(ctx, w, h);
  grain(ctx, w, h, 0.055);
  return scene.count;
}

/** One shop: a box, a plinth, two windows, a sign band and an awning. */
function shopfront(ctx, s) {
  box(ctx, { x: -700, y: s.y, w: 700, d: s.d, h: s.h, color: s.wall });
  box(ctx, { x: -700, y: s.y, w: 707, d: s.d, h: 26, color: '#ddd6c8' });

  // The ground floor. An awning hides most of it from this camera - which is
  // what the reference does too - so what is left has to be bright rather than
  // a dark void: glass, a white band, and a door.
  quadX(ctx, 1, s.y + 34, s.y + s.d - 34, 30, 232);
  ctx.fillStyle = '#7d8699'; ctx.fill();
  quadX(ctx, 1.3, s.y + 50, s.y + 50 + (s.d - 100) * 0.42, 60, 222);
  ctx.fillStyle = 'rgba(240,246,250,0.42)'; ctx.fill();
  quadX(ctx, 1.4, s.y + 28, s.y + s.d - 28, 232, 252);
  ctx.fillStyle = '#f4efe6'; ctx.fill();
  quadX(ctx, 1.3, s.y + s.d - 140, s.y + s.d - 56, 30, 238);
  ctx.fillStyle = '#5f5a6c'; ctx.fill();

  // The sign band, sitting just above the awning where it can be seen.
  quadX(ctx, 1.2, s.y + 22, s.y + s.d - 22, 308, 352);
  ctx.fillStyle = s.sign; ctx.fill();
  quadX(ctx, 1.6, s.y + 48, s.y + s.d - 48, 320, 340);
  ctx.fillStyle = 'rgba(255,252,246,0.85)'; ctx.fill();

  // The first floor: three panes and a rail, which is where the facade gets
  // to be interesting since the shopfront is in shadow.
  const n = 3, span = (s.d - 120) / n;
  for (let i = 0; i < n; i++) {
    shopWindow(ctx, {
      x: 1, y0: s.y + 60 + i * span + 10, y1: s.y + 60 + (i + 1) * span - 10,
      z0: 400, z1: s.h - 72, frame: '#c3b396',
    });
  }
  quadX(ctx, 2, s.y + 44, s.y + s.d - 44, 388, 398);
  ctx.fillStyle = '#d7cfbf'; ctx.fill();

  awning(ctx, {
    x: 0, y0: s.y + 30, y1: s.y + s.d - 30, out: 122,
    zHigh: 300, zLow: 272, drop: 17, color: s.awn, teeth: 18,
  });
}

/** A telephone pole: a tall concrete cylinder with two crossarms. */
function pole(ctx, x, y) {
  castShadow(ctx, x - 11, y - 11, 22, 22, 760, 0.20);
  contact(ctx, x, y, 22, 0.22);
  post(ctx, { x, y, h: 760, r: 11, color: '#d2cdc3' });
  for (const z of [648, 706]) {
    quadX(ctx, x + 1, y - 80, y + 80, z, z + 7);
    ctx.fillStyle = shade('#d2cdc3', 0.86); ctx.fill();
  }
}
