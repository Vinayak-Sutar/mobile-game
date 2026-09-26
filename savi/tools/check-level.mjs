// Does the course work? Answered in a second, without opening a browser.
//
// Every complaint made about this level is now an assertion:
//   - a platform that leads nowhere
//   - a route you can walk round instead of jumping
//   - gaps that only just work, or do not work at all
//   - a crossing that is over in three jumps
//
// Run:  node savi/tools/check-level.mjs

import {
  COURSE, COURSE_LEN, WALL_W, PLATFORMS, CAPSTAN, GATE,
  atRiver, riverAt, widthAt, inWall, inShallow, placePlatforms, onSolid,
} from '../src/savi-shallows.js';

// Measured in the running game from a standing start.
const JUMP = 117;          // a full press
const TAP = 100;           // a short one, which must also be enough
const DASH = 180;          // a jump with a dash out of it
const COZY = 75;           // what is pleasant to clear without thinking about it
const DASH_MIN = 130, DASH_MAX = 150;
const TAU = Math.PI * 2;

let bad = 0, warn = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) bad++; };
const note = (m) => { console.log('         ' + m); };
const flag = (m) => { console.log('  warn   ' + m); warn++; };

const still = (p) => { placePlatforms(0); return { x: p.x, y: p.y, r: p.r }; };
const moves = (p) => p.kind === 'swing' || p.kind === 'ferry' || p.kind === 'eddy';

/**
 * The closest and furthest two platforms EVER get from each other, sampling the
 * whole cycle of BOTH of them.
 *
 * The version of this that shipped froze the previous platform at t=0 and swung
 * only the new one against it, which is meaningless when both move - and it hid
 * a real defect for two builds. The three eddy leaves orbit locked together, so
 * the gap between them never changed in any way the player could wait out; it
 * sat between 85 and 133, and 133 is past a jump, so a third of the way round
 * the whirl the next leaf was unreachable with nothing to be done about it.
 */
function span(a, b) {
  const per = Math.max(TAU / (a.rate || 1), TAU / (b.rate || 1)) * 2;
  let near = 1e9, far = -1e9;
  for (let k = 0; k < 240; k++) {
    placePlatforms((k / 240) * per);
    const d = Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
    near = Math.min(near, d); far = Math.max(far, d);
  }
  placePlatforms(0);
  return { near, far };
}

/** Two platforms turning at the same rate are welded: there is no waiting them out. */
const locked = (a, b) => moves(a) && moves(b) && Math.abs((a.rate || 0) - (b.rate || 0)) < 1e-6;

console.log(`the course is ${Math.round(COURSE_LEN)} long in ${COURSE.length - 1} bends,`);
console.log(`carrying ${PLATFORMS.length} platforms.\n`);

const NAME = { leaf: 'a leaf', swing: 'a swinging leaf', ferry: 'a ferry', eddy: 'an eddy leaf', stone: 'a stone' };
const mouth = { x: atRiver(120, 0)[0], y: atRiver(120, 0)[1], r: 0 };
let seconds = 0;

console.log('the chain, link by link:');
for (let i = 0; i < PLATFORMS.length; i++) {
  const p = PLATFORMS[i];
  const prev = i === 0 ? null : PLATFORMS[i - 1];
  const label = `${String(i + 1).padStart(2)}. ${NAME[p.kind]}`;
  if (!prev) {
    const to = still(p);
    const g = Math.round(Math.hypot(to.x - mouth.x, to.y - mouth.y) - to.r);
    ok(g <= JUMP - 8, `${label} — ${g} from the mouth: a hop`);
    seconds += 1.7;
    continue;
  }
  const sp = span(prev, p);
  const near = Math.round(sp.near), far = Math.round(sp.far);
  if (locked(prev, p)) {
    // Welded together, so there is no waiting it out: it has to be a hop at
    // EVERY phase of the turn, not merely at some of them.
    ok(far <= JUMP - 8, `${label} — locked to the one before; the gap runs ${near} to ${far}, and must never pass ${JUMP - 8}`);
    seconds += 1.7;
  } else if (moves(p)) {
    // Getting ON to something that moves: it has to come to her, and it has to
    // leave again, or there is no timing in it.
    ok(near <= COZY, `${label} — comes within ${near} of the one before`);
    ok(far > JUMP, `${label} — and goes ${far} away, so there is something to wait for`);
    const period = TAU / p.rate;
    note(`its beat is ${period.toFixed(1)}s — at most ${(period / 2).toFixed(1)}s of waiting`);
    seconds += period / 2 + 1.6;
  } else if (moves(prev)) {
    // Stepping OFF one on to solid ground only has to be delivered. Asking
    // that it also go out of reach is asking the ride not to end.
    ok(near <= COZY, `${label} — the one before brings her within ${near}`);
    seconds += 1.7;
  } else if (near >= DASH_MIN && near <= DASH_MAX) {
    // NO DASH GAPS. The band is still measured, because knowing a gap has
    // landed in it is the point - but it is a failure now, not a pass.
    //
    // One of these shipped: 138 of water off the second boulder, the only
    // dash in fifty-eight seconds of hopping. Nothing had taught it, nothing
    // signalled it, and standing on the rock there was nothing in front of
    // her that looked like anywhere to go. A cozy game can have a gap that is
    // plainly too far, or a gap that is plainly a hop. What it cannot have is
    // one gap, once, that needs a move the rest of the level never asks for.
    ok(false, `${label} — ${near} away: the level has no business asking for a dash`);
    seconds += 2.4;
  } else {
    ok(near <= JUMP - 8, `${label} — ${near} away: a hop`);
    if (near > COZY) flag(`${near} is tight for a cozy hop; ${COZY} or under reads better`);
    if (near > TAP - 8 && near < DASH_MIN) ok(false, `${label} — ${near} is past a short press and short of a dash`);
    seconds += 1.7;
  }
}

console.log(`\nabout ${Math.round(seconds)}s of platforming, before a single miss.`);
ok(seconds >= 55, 'which is long enough to be worth doing');

console.log('\nno platform leads nowhere:');
{
  let orphans = 0;
  for (let i = 0; i < PLATFORMS.length; i++) {
    let best = 1e9;
    for (let j = 0; j < PLATFORMS.length; j++) {
      if (i === j) continue;
      const a = still(PLATFORMS[i]), b = still(PLATFORMS[j]);
      best = Math.min(best, Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r);
    }
    if (best > DASH) { ok(false, `platform ${i + 1} is ${Math.round(best)} from anything else`); orphans++; }
  }
  ok(orphans === 0, 'every platform has a neighbour within reach of it');
}

console.log('');
console.log('the banks — can she just walk up to the sluice?');
{
  // A band test lies at a bend: on the inside of a curve a point offset from
  // the centreline is legitimately in the water, so it reports a hole that is
  // not there. The question that actually matters is CONNECTIVITY, so flood
  // fill the valley on foot and see whether the capstan can be reached without
  // touching a single platform.
  const CELL = 20, W = Math.ceil(5200 / CELL), H = Math.ceil(3400 / CELL);
  const walkable = (x, y) => {
    if (inWall(x, y)) return false;
    const r = riverAt(x, y);
    if (r.d < widthAt(r.s) && !inShallow(x, y)) return false;
    return true;
  };
  const seen = new Uint8Array(W * H);
  const si = Math.round(2600 / CELL), sj = Math.round(1710 / CELL);
  const q = [sj * W + si];
  seen[q[0]] = 1;
  let n = 0;
  while (q.length) {
    const k = q.pop(); n++;
    const i = k % W, j = (k / W) | 0;
    for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const i2 = i + d[0], j2 = j + d[1];
      if (i2 < 1 || j2 < 1 || i2 >= W - 1 || j2 >= H - 1) continue;
      const k2 = j2 * W + i2;
      if (seen[k2] || !walkable(i2 * CELL + 10, j2 * CELL + 10)) continue;
      seen[k2] = 1; q.push(k2);
    }
  }
  const at = (x, y) => !!seen[Math.round(y / CELL) * W + Math.round(x / CELL)];
  const mouthPt = atRiver(60, 0);
  const midPt = atRiver(COURSE_LEN * 0.5, 0);
  ok(at(mouthPt[0], mouthPt[1]), 'she can walk to the mouth of the river');
  ok(!at(CAPSTAN.x, CAPSTAN.y), 'and cannot walk to the capstan — the river is the only way');
  ok(!at(midPt[0], midPt[1]), 'nor wade up the middle of it');
  note(n + ' cells of valley are walkable on foot');
}

console.log('\nthe head of the river:');
{
  ok(!!onSolid(CAPSTAN.x, CAPSTAN.y), 'the capstan stands on solid ground');
  const ringOn = [0, 1.57, 3.14, 4.71].every((a) =>
    !!onSolid(CAPSTAN.x + Math.cos(a) * CAPSTAN.r, CAPSTAN.y + Math.sin(a) * CAPSTAN.r * 0.62));
  ok(ringOn, 'and so does the whole ring she walks round it');
  const last = still(PLATFORMS[PLATFORMS.length - 1]);
  const d = Math.round(Math.hypot(CAPSTAN.x - last.x, CAPSTAN.y - last.y) - last.r - 110);
  ok(d <= COZY, `the last platform leaves her ${d} from the capstan's shelf`);
  ok(Math.hypot(GATE.x - CAPSTAN.x, GATE.y - CAPSTAN.y) < 420, 'and the gate is in sight of it');
}

placePlatforms(0);
console.log(bad ? `\n${bad} FAILURES` : '\nthe course holds together');
if (warn) console.log(`${warn} warnings`);
process.exit(bad ? 1 : 0);
