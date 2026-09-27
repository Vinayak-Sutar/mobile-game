// THE SPRING AT THE HEAD OF THE VALLEY, and how far a stone goes.
//
// The last root is under a fall of stones, and a stone has to go SOMEWHERE.
// Dropping it two paces away is not getting rid of it, and a game that only
// counts the ones you carried past an invisible line is a game about an
// invisible line. So there is water at the top of the valley to throw them
// into: it answers, it splashes, and you can see from right across the field
// whether you got it in.
//
// This is its own file, small as it is, for the same reason savi-shallows.js
// is: the geometry has to be readable by the offline check as well as by the
// game, or the check is only testing a copy of it.

/** The pool itself. A wobbled ellipse - nothing out here was drawn with a compass. */
export const TARN = { x: 2600, y: 96, rx: 430, ry: 132 };

/**
 * Is this in the water? `grow` widens it, for the wadeable lip round the
 * edge and for keeping stones from being sown too near it.
 */
export function inTarn(x, y, grow = 0) {
  const dx = (x - TARN.x) / (TARN.rx + grow), dy = (y - TARN.y) / (TARN.ry + grow);
  const d = Math.hypot(dx, dy);
  if (d > 1.3) return false;
  const a = Math.atan2(dy, dx);
  return d < 1
    + Math.sin(a * 3 + 1.1) * 0.1
    + Math.sin(a * 5 - 2.2) * 0.06
    + Math.sin(a * 8 + 0.4) * 0.035;
}

/**
 * THE THROW, in one place, so the check measures the arc the game actually
 * uses. She lobs it: up off her hands at `Z0`, and it falls under gravity.
 * A big stone leaves her hands slower, which is the only reason to look at
 * which one you are picking up.
 */
export const THROW = { VZ: 430, G: 1500, Z0: 16 };

/**
 * HOW HARD SHE THROWS, which is set by the POOL and not by what feels strong.
 *
 * The first cut carried 218 to 234, and the pool is wide but only 264 deep -
 * so from most of the shore a stone sailed clean over it and landed on the
 * rocks beyond, and near the ends of the pool it did that even standing on
 * the waterline. A throw you can only land from one exact spot is not a
 * throw, it is a trap. At about 145 she can stand a hundred and forty back
 * from the edge anywhere along it and still put it in the middle.
 */
export const throwSpeed = (r) => 270 - r * 1.4;
export function throwRange(r) {
  const t = (THROW.VZ + Math.sqrt(THROW.VZ * THROW.VZ + 2 * THROW.G * THROW.Z0)) / THROW.G;
  return throwSpeed(r) * t;
}
