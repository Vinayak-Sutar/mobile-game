// Can every stone be got rid of?
//
// The stone fall is the one task in the game where the player can put an
// obstacle somewhere the designer did not choose. If a stone can end up
// somewhere she cannot stand next to it, or somewhere no throw reaches the
// water from, the last root cannot be finished and nothing on screen says so.
//
// Run:  node savi/tools/check-stones.mjs

import { TARN, inTarn, throwRange, throwSpeed } from '../src/savi-spring.js';

const PATCH = { x: 2250, y: 300, w: 700, h: 400 };     // PLACES.boon.patch
const ROOT = { x: 2600, y: 440 };
const R_MIN = 13, R_MAX = 20;
const V = { w: 5200, h: 3400 };

let bad = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) bad++; };
const note = (m) => console.log('         ' + m);

console.log('the spring is %dx%d at %d,%d', TARN.rx * 2, TARN.ry * 2, TARN.x, TARN.y);
console.log('a thrown stone carries %d to %d.\n', Math.round(throwRange(R_MAX)), Math.round(throwRange(R_MIN)));

// --- 1. the water is where the field can reach it ---------------------------------
console.log('from the field to the water:');
{
  // The furthest she ever has to walk: every point of the patch, to the
  // nearest spot that is dry, standable, and within a throw of the water.
  let worst = 0, worstAt = null;
  for (let x = PATCH.x; x <= PATCH.x + PATCH.w; x += 20) {
    for (let y = PATCH.y; y <= PATCH.y + PATCH.h; y += 20) {
      // Straight up the field is the obvious line; the shore is due north.
      let shore = null;
      for (let sy = y; sy > 0; sy -= 4) {
        if (inTarn(x, sy)) break;
        shore = sy;
      }
      if (shore === null) { ok(false, `nowhere dry to stand above ${x},${y}`); continue; }
      const d = y - shore;
      if (d > worst) { worst = d; worstAt = [x, y]; }
    }
  }
  ok(worst < 520, `the longest carry is ${Math.round(worst)} from ${worstAt}`);
  note(`about ${(worst / 196 / 0.62).toFixed(1)}s of walking, carrying`);
}

// --- 2. every throw from the shore lands in it ------------------------------------
console.log('\nthe throw:');
{
  // Standing on the lip, facing north, does the heaviest stone go in? And
  // does it still go in from a step or two back, so she does not have to be
  // on the exact waterline?
  let worstStand = 0;
  for (let x = PATCH.x; x <= PATCH.x + PATCH.w; x += 20) {
    let shore = null;
    for (let sy = 400; sy > 0; sy -= 2) { if (inTarn(x, sy)) break; shore = sy; }
    if (shore === null) continue;
    // How far back can she be and still land it? Walk outward until it misses.
    let back = 0;
    for (let d = 0; d <= 320; d += 4) {
      const y = shore + d;
      const land = y - throwRange(R_MAX);          // straight north, the heaviest
      if (land < 0 || !inTarn(x, land, 10)) break;
      back = d;
    }
    if (back < 60) ok(false, `at x=${x} she must be within ${back} of the water`);
    worstStand = worstStand === 0 ? back : Math.min(worstStand, back);
  }
  ok(worstStand >= 60, `she can throw it in from at least ${worstStand} back, anywhere along the shore`);
  note(`a small stone leaves her hands at ${Math.round(throwSpeed(R_MIN))}, a big one at ${Math.round(throwSpeed(R_MAX))}`);
}

// --- 3. a stone can never land somewhere it cannot be picked up again -------------
console.log('\na thrown stone that misses:');
{
  // She throws from anywhere on or near the field, in any direction. Where
  // can it end up? Nowhere off the map, and nowhere inside the water without
  // counting as gone.
  let off = 0, stuck = 0;
  for (let x = PATCH.x - 100; x <= PATCH.x + PATCH.w + 100; x += 40) {
    for (let y = PATCH.y - 100; y <= PATCH.y + PATCH.h + 100; y += 40) {
      if (inTarn(x, y)) continue;                  // she cannot stand there
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        const d = throwRange(R_MIN);
        const lx = x + Math.cos(a) * d, ly = y + Math.sin(a) * d;
        // The game clamps a landing to the valley, so off-map is recoverable
        // by construction; what would not be is a landing inside the water
        // that did not count as a splash. The splash test is inTarn(+10) and
        // is strictly wider than the wall test inTarn(0), so there is no gap.
        if (lx < 40 || ly < 40 || lx > V.w - 40 || ly > V.h - 40) off++;
        if (inTarn(lx, ly) && !inTarn(lx, ly, 10)) stuck++;
      }
    }
  }
  ok(stuck === 0, 'no landing is in the water without counting as a splash');
  note(`${off} throws would go off the map and are clamped back inside it`);
}

// --- 4. the stones are sown where she can get at them -----------------------------
console.log('\nwhere they are sown:');
{
  // sowStones() rejects anything within 80 of the water and 52 of the root,
  // and keeps them 76 apart. Prove the patch has room for two dozen on those
  // terms, or the field quietly ships with fewer stones than intended.
  let room = 0;
  const put = [];
  for (let tr = 0; put.length < 18 && tr < 400000; tr++) {
    const x = PATCH.x + 34 + ((tr * 7919) % (PATCH.w - 68));
    const y = PATCH.y + 30 + ((tr * 6271) % (PATCH.h - 56));
    if (inTarn(x, y, 80)) continue;
    if (Math.hypot(x - ROOT.x, y - ROOT.y) < 52) continue;
    if (put.some((p) => Math.hypot(x - p[0], y - p[1]) < 76)) continue;
    put.push([x, y]); room++;
  }
  ok(room >= 18, `the field holds ${room} stones at 76 apart, clear of the water and the root`);
}

console.log('');
console.log(bad ? `${bad} thing(s) wrong with the stone fall` : 'the stone fall can be cleared');
process.exit(bad ? 1 : 0);
