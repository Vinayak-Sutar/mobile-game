// How high the ground is, and the one place that decides it.
//
// The simulation is flat: it knows plateaus only as rectangles you cannot walk
// into except by their stairs (Version 5's `raised` data). In 3D those
// rectangles become real height, so everything that needs a Y - the terrain
// mesh, the actors' feet, the camera's pivot, grass, decals - asks here and
// nobody guesses.
//
// On top of the plateaus there is a little micro-relief from the same value
// noise the 2D game paints its ground with, so a field is gently uneven and a
// rock shelf is lumpy.

import { fbm } from '../../v5/src/terrain.js';
import { clamp } from '../../v5/src/util.js';

const inRect = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/**
 * raised: { tops, faces, stairs, rims } as v5's overworld builds it.
 * relief: how strongly the micro-relief shows, per terrain type index.
 */
export function createHeights(raised, opts = {}) {
  const TOP = opts.top ?? 52;               // how tall a plateau stands
  const relief = opts.relief || null;       // (x, y) -> units, or null for the default
  const tops = raised?.tops || [];
  const stairs = raised?.stairs || [];
  const faces = raised?.faces || [];

  /** The plateau height at a point, and the ramp inside a staircase. */
  function base(x, y) {
    for (const s of stairs) {
      if (!inRect(s, x, y)) continue;
      // Stairs climb from their foot (south) to the top (north).
      const k = clamp((s.y + s.h - y) / s.h, 0, 1);
      return TOP * k;
    }
    for (const t of tops) if (inRect(t, x, y)) return TOP;
    // Standing in a cliff face's footprint means falling past it: the low side.
    for (const f of faces) if (inRect(f, x, y)) return 0;
    return 0;
  }

  function bumps(x, y) {
    if (relief) return relief(x, y);
    return (fbm(x * 0.004, y * 0.004) - 0.5) * 7;
  }

  return {
    TOP,
    /** Ground height in world units at a simulation point (x, y). */
    at(x, y) {
      return base(x, y) + bumps(x, y);
    },
    /** Just the plateau step, with no bumps: for placing flat things. */
    step: base,
    /** True when the point is on top of a plateau. */
    onTop(x, y) {
      return base(x, y) > TOP * 0.6;
    },
  };
}
