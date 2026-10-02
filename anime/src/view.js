// THE ONE PROJECTION. Nothing else in this folder may convert world to screen.
//
// This project has learned the hard way that the moment two pieces of code
// both know how the camera works, they start to disagree, and everything ends
// up mirrored or half a tile off. So: the world is stored flat and upright in
// centimetres, nothing in the simulation knows the camera is tilted, and
// exactly one function here turns (x, y, z) into a point on the canvas.
// tools/check-view.mjs reads the source and fails if a second one appears.
//
// THE CAMERA IS MEASURED, not chosen. Five crops of the ED - paving slabs, a
// shopfront, a kerb, a crosswalk and the boxy vending machines - were gradient
// histogrammed by edge strength, and all five agree:
//
//     one ground axis at -28 deg, the other at +27 deg, and up dead vertical.
//
// Mean ground slope 0.52 against 0.500 for a textbook 2:1 isometric, which is
// inside the measurement error. So it is the classic one, 45 degrees of
// azimuth, and the camera's elevation follows from the slope: sin(e) = 0.52.
//
// Everything else drops out of that single angle.

const DEG = Math.PI / 180;

/** The only free number. 31 degrees is what the footage measured. */
export const ELEV = 31 * DEG;

/** How far a step along a ground axis drops down the screen. ~0.515. */
export const GROUND = Math.sin(ELEV);

/** How far a unit of height rises up the screen, relative to a ground unit's
 *  sideways reach. cos(elev) / cos(45 deg) ~ 1.212. */
export const RISE = Math.cos(ELEV) / Math.SQRT1_2;

/** World units are CENTIMETRES. scale turns them into canvas pixels: at 0.735
 *  a 155 cm girl stands 138 px tall, which is the 23% of frame height she
 *  occupies in the ED. ox/oy are where the camera's focus lands on the canvas. */
export const camera = { x: 0, y: 0, scale: 0.735, ox: 640, oy: 300 };

/**
 * World to screen. The only one.
 *
 * +x leaves toward the lower right, +y toward the lower left, +z straight up.
 */
export function toScreen(x, y, z = 0) {
  const dx = x - camera.x, dy = y - camera.y, s = camera.scale;
  return {
    x: (dx - dy) * s + camera.ox,
    y: ((dx + dy) * GROUND - z * RISE) * s + camera.oy,
  };
}

/**
 * THE INVERSE, and the two direction helpers that go with it.
 *
 * A control stick and a mouse live on the screen; the simulation lives flat
 * in the world. Something has to convert, and if that something is written
 * twice it will be written differently the second time - which is how every
 * "she walks the wrong way on diagonals" bug starts. So the inverse lives
 * here, beside the thing it inverts.
 */

/** Where a point on the canvas lands on the ground. */
export function worldAt(px, py) {
  const u = (px - camera.ox) / camera.scale;            // u = dx - dy
  const v = ((py - camera.oy) / camera.scale) / GROUND; // v = dx + dy
  return { x: (u + v) / 2 + camera.x, y: (v - u) / 2 + camera.y };
}

/** Which way a world direction points on the screen, as a unit vector. */
export function screenDir(dx, dy) {
  const sx = dx - dy, sy = (dx + dy) * GROUND;
  const m = Math.hypot(sx, sy) || 1;
  return { x: sx / m, y: sy / m };
}

/**
 * Which way a SCREEN direction points in the world, as a unit vector.
 *
 * This is what makes the controls feel right: push the stick up and she walks
 * up the screen, which under this camera is diagonally away in world terms.
 * Push it right and she walks right. The player never has to think in x and y.
 */
export function worldDir(ux, uy) {
  const dx = (ux + uy / GROUND) / 2;
  const dy = (uy / GROUND - ux) / 2;
  const m = Math.hypot(dx, dy) || 1;
  return { x: dx / m, y: dy / m };
}

/**
 * How many screen pixels tall a vertical world length is.
 *
 * The characters are billboards - flat drawings standing up from a point on
 * the ground, the way the ED composites its cel art into a 3D street - so
 * something has to turn "she is 155 cm" into "she is 138 px". This is that,
 * and it lives here so the rise factor stays in one file.
 */
export function upPixels(cm) { return cm * camera.scale * RISE; }

/**
 * Point the camera. Scenes say where to look and how big the canvas is; only
 * this file ever works out where that lands in pixels, which is the whole
 * reason tools/check-view.mjs fails any other file that touches ox/oy.
 */
export function aim({ x, y, scale, w, h, fx = 0.42, fy = 0.72 }) {
  camera.x = x;
  camera.y = y;
  camera.scale = scale;
  camera.ox = w * fx;
  camera.oy = h * fy;
}

/**
 * How near the camera something is. Under this projection a thing is in front
 * of another when x + y is larger - NOT when y is larger, which is only true
 * for a camera tilted about one axis. Sort ascending and paint back to front.
 */
export function depth(x, y) { return x + y; }

/** Lay a path through world-space points, each [x, y, z]. Kit code builds
 *  shapes this way so it never has to touch a coordinate itself. */
export function poly(ctx, pts) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = toScreen(pts[i][0], pts[i][1], pts[i][2] || 0);
    if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
}

// --- the scene list ---------------------------------------------------------
//
// Props hand in a depth and a closure; the scene sorts once and paints. Keeping
// the sort here rather than in each prop is the other half of not disagreeing
// about the camera.

export function createScene() {
  const items = [];
  return {
    add(x, y, draw) { items.push({ d: depth(x, y), draw }); },
    /** Ground-level paint: slabs, road markings, cast shadows. Always under. */
    flat(draw) { items.push({ d: -Infinity, draw }); },
    paint(ctx) {
      items.sort((a, b) => a.d - b.d);
      for (const it of items) it.draw(ctx);
    },
    clear() { items.length = 0; },
    get count() { return items.length; },
  };
}
