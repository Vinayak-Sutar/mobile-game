// Does the level work? Answered without opening a browser.
//
// Three roots in a row shipped unfinishable, each for a different reason, and
// every time the answer was found by driving the running game for twenty
// minutes. This runs in about a second and it runs in the commit hook.
//
// It asserts the things that have actually gone wrong:
//   - a gap sized so that a jump only just makes it, which fails one try in
//     four and the player blames themselves
//   - a gap nothing can make
//   - a target island you can walk round to, so the crossing is decoration
//   - a platform sitting on land, or in the shallows, where it does nothing
//
// Run:  node savi/tools/check-level.mjs

import {
  POOL, SHELF, ISLES, SLUICE, LEAVES, FERRY, CAPSTAN, onIsle,
} from '../src/savi-shallows.js';

// --- the reach, measured in the running game from a standing start -------------
const JUMP = 116;          // what a jump actually carries her
const DASH = 181;          // a jump with a dash out of it
const HOP_MAX = 95;        // so no gap meant as a hop may exceed this
const DASH_MIN = 130;      // and no gap meant as a dash may be under this
const DASH_MAX = 150;

// pondK, copied from savi.js so this needs no browser and no game state.
const vn = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };
function smoothN(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = vn(xi, yi), b = vn(xi + 1, yi), c = vn(xi, yi + 1), d = vn(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y) { let v = 0, a = 0.5, f = 1; for (let i = 0; i < 3; i++) { v += smoothN(x * f, y * f) * a; a *= 0.5; f *= 2.07; } return v; }
function pondK(x, y) {
  const a = Math.atan2(y - POOL.y, x - POOL.x);
  const wob = 1 + (fbm(Math.cos(a) * 1.7 + 11, Math.sin(a) * 1.7 + 7) - 0.5) * 0.55;
  return Math.hypot((x - POOL.x) / (POOL.rx * wob), (y - POOL.y) / (POOL.ry * wob));
}

/** Deep water: in the bowl, inside the shelf, and not on an island. */
const isDeep = (x, y) => pondK(x, y) < SHELF && !onIsle(x, y);
/** Can she put a foot here at all? Leaves are taken at rest unless told. */
function standable(x, y, leaves = LEAVES) {
  if (!isDeep(x, y)) return true;
  for (const L of leaves) if (Math.hypot(x - L.x, y - L.y) < L.r * 0.9) return true;
  return false;
}

let bad = 0, warn = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) bad++; };
const note = (m) => console.log('         ' + m);

// --- the route, as the player walks it -------------------------------------------
//
// Each hop is from the edge of one thing to the edge of the next, measured along
// the line between their centres, which is the shortest way anyone will try it.

// Where the shelf actually ends along the first leg - derived, not guessed,
// because the bowl's edge wobbles and eyeballing it was wrong by forty units.
function shoreFor(first) {
  // The NEAREST place she can stand, in any direction - not a point along one
  // chosen ray. She will jump from wherever the water is closest, so that is
  // the gap that has to be in range.
  let best = null, bd = 1e9;
  for (let k = 0; k < 360; k++) {
    const a2 = (k / 360) * Math.PI * 2;
    for (let out = first.r; out < 700; out += 2) {
      const x = first.x + Math.cos(a2) * out, y = first.y + Math.sin(a2) * out;
      if (!isDeep(x, y)) {
        if (out < bd) { bd = out; best = { x, y, r: 0, name: 'the shore' }; }
        break;
      }
    }
  }
  return best || { x: first.x, y: first.y, r: 0, name: 'the shore (not found)' };
}
const SHORE = shoreFor(LEAVES[0]);
const named = (o, name, r) => ({ x: o.x, y: o.y, r: r !== undefined ? r : (o.rx || o.r), name });

const ROUTE = [
  SHORE,
  named(LEAVES[0], 'leaf one'), named(LEAVES[1], 'leaf two'),
  named(ISLES[0], 'the first sandbar'),
  named(LEAVES[2], 'leaf three'), named(LEAVES[3], 'leaf four'),
  named(ISLES[1], 'the second sandbar'),
];

/** Edge-to-edge distance between two discs along the line of centres. */
function gapBetween(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y) - a.r - b.r;
}

console.log('the route, hop by hop:');
const INTENT = [null, 'hop', 'hop', 'hop', 'dash', 'hop', 'hop'];
for (let i = 1; i < ROUTE.length; i++) {
  const g = Math.round(gapBetween(ROUTE[i - 1], ROUTE[i]));
  const want = INTENT[i];
  const label = `${ROUTE[i - 1].name} -> ${ROUTE[i].name} = ${g}`;
  if (want === 'dash') {
    ok(g >= DASH_MIN && g <= DASH_MAX, `${label} (a dash; wants ${DASH_MIN}-${DASH_MAX})`);
  } else if (want === 'hop') {
    ok(g <= HOP_MAX, `${label} (a hop; wants under ${HOP_MAX})`);
    if (g > HOP_MAX * 0.55 && g <= HOP_MAX) note('comfortable');
  } else {
    ok(g <= 60, `${label} (a step off; wants under 60)`);
  }
  if (g > HOP_MAX && g < DASH_MIN) {
    console.log(`  FAIL ${label} sits in the dead band ${HOP_MAX}-${DASH_MIN}: it only just works`);
    bad++;
  }
}

// --- the ferry ---------------------------------------------------------------------
console.log('\nthe ferry:');
{
  const near = { x: FERRY.x0 - FERRY.ax, y: FERRY.y0 - FERRY.ay, r: FERRY.r };
  const far = { x: FERRY.x0 + FERRY.ax, y: FERRY.y0 + FERRY.ay, r: FERRY.r };
  const bar = named(ISLES[1], 'sandbar', ISLES[1].rx);
  const isle = named(SLUICE, 'hummock', SLUICE.rx);
  const onAtNear = Math.round(gapBetween(bar, near));
  const offAtFar = Math.round(gapBetween(far, isle));
  const offAtNear = Math.round(gapBetween(near, isle));
  const onAtFar = Math.round(gapBetween(bar, far));
  ok(onAtNear <= 40, `at its near end it is ${onAtNear} from the sandbar — she steps on`);
  ok(offAtFar <= 40, `at its far end it is ${offAtFar} from the hummock — she steps off`);
  ok(offAtNear > DASH, `at its near end the hummock is ${offAtNear} away — she cannot skip the ride`);
  ok(onAtFar > DASH, `at its far end the sandbar is ${onAtFar} away — she has to wait for it`);
  const period = (Math.PI * 2) / FERRY.rate;
  ok(period >= 5 && period <= 9, `its breath is ${period.toFixed(1)}s, so the wait is at most ${(period / 2).toFixed(1)}s`);
  const travel = Math.round(Math.hypot(FERRY.ax, FERRY.ay) * 2);
  const peak = Math.round(Math.hypot(FERRY.ax, FERRY.ay) * FERRY.rate);
  ok(peak < 190, `it travels ${travel} and its fastest is ${peak}/s, slower than she walks`);
}

// --- no back door onto the hummock ---------------------------------------------------
console.log('\nthe hummock:');
{
  let worst = 1e9, worstA = 0;
  for (let k = 0; k < 720; k++) {
    const a = (k / 720) * Math.PI * 2;
    let d = 0;
    for (d = 0; d < 1600; d += 2) {
      const x = SLUICE.x + Math.cos(a) * (SLUICE.rx + 3 + d);
      const y = SLUICE.y + Math.sin(a) * (SLUICE.ry + 3 + d);
      if (!isDeep(x, y)) break;                    // leaves ignored on purpose
    }
    if (d < worst) { worst = d; worstA = a; }
  }
  ok(worst > DASH, `the narrowest water round it, ignoring the ferry, is ${worst} (needs over ${DASH}) at ${(worstA * 57.3).toFixed(0)}deg`);
  ok(!!onIsle(CAPSTAN.x, CAPSTAN.y), 'the capstan is on the hummock');
  const ringOn = [0, 1.57, 3.14, 4.71].every((a) => !!onIsle(CAPSTAN.x + Math.cos(a) * CAPSTAN.r, CAPSTAN.y + Math.sin(a) * CAPSTAN.r * 0.62));
  ok(ringOn, 'the whole ring she walks round it is on the hummock');
}

// --- the platforms are where they should be -------------------------------------------
console.log('\nevery platform is somewhere it does something:');
for (const [i, L] of LEAVES.entries()) {
  const deepAtRest = isDeep(L.x, L.y);
  ok(deepAtRest, `leaf ${i + 1} at (${Math.round(L.x)},${Math.round(L.y)}) floats on deep water`);
}
for (const [i, I] of ISLES.entries()) {
  const ringDeep = [0, 1.57, 3.14, 4.71].every((a) => isDeep(I.x + Math.cos(a) * (I.rx + 30), I.y + Math.sin(a) * (I.ry + 30)));
  ok(ringDeep, `island ${i + 1} at (${I.x},${I.y}) has deep water all round it — it is an island`);
}

// --- and the shore she starts from is actually wadeable --------------------------------
console.log('\nthe way in:');
ok(standable(SHORE.x - 20, SHORE.y), `she can wade to (${Math.round(SHORE.x)},${Math.round(SHORE.y)}), where the route begins`);
{
  const dx = LEAVES[0].x - SHORE.x, dy = LEAVES[0].y - SHORE.y, d = Math.hypot(dx, dy);
  ok(isDeep(SHORE.x + (dx / d) * 12, SHORE.y + (dy / d) * 12), 'and it is over her head one step further on');
}

console.log(bad ? `\n${bad} FAILURES` : '\nthe level holds together');
if (warn) console.log(`${warn} warnings`);
process.exit(bad ? 1 : 0);
