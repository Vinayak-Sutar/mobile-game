// DOES SHE FACE WHERE SHE IS GOING, AND DO HER FEET TOUCH THE GROUND?
//
// Two things here are the kind that look almost right and are wrong, and
// neither of them throws.
//
// The first is the octant table. Eight directions come out of five drawings
// and a mirror, and if one row of that table is off she walks left while
// facing right - or, worse, only on one diagonal, which is the sort of thing
// you notice a fortnight later. So the table is checked against the REAL
// projection rather than against the comment beside it.
//
// The second is foot skate. The walk cycle is driven by distance so that her
// feet match the ground; if anything ever drives it from time instead, she
// slides, and on a plain plane that is nearly invisible until there is a
// street under her.
//
// Run:  node anime/tools/check-girl.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const { screenDir } = await import('../src/view.js');
const G = await import('../src/girl.js');

let bad = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) bad++; };
const STEP = 1 / 60;

// --- 1. the octant table, against the projection itself ----------------------
console.log('eight directions out of five drawings and one mirror:');
{
  ok(G.OCTANTS.length === 8, `${G.OCTANTS.length} octants`);

  // What each row SHOULD be, derived from where that direction actually goes
  // on screen. Nothing here reads the table's comments.
  const expect = (k) => {
    const a = (k * Math.PI) / 4;
    const d = screenDir(Math.cos(a), Math.sin(a));
    const down = d.y > 0.80, up = d.y < -0.80;      // straight toward / away
    const flat = Math.abs(d.y) < 0.12;              // straight across
    if (down) return { view: 'front', flip: 1 };
    if (up) return { view: 'back', flip: 1 };
    if (flat) return { view: 'side', flip: d.x > 0 ? 1 : -1 };
    return { view: d.y > 0 ? 'fquart' : 'bquart', flip: d.x > 0 ? 1 : -1 };
  };
  for (let k = 0; k < 8; k++) {
    const e = expect(k), got = G.OCTANTS[k];
    const a = (k * Math.PI) / 4;
    const d = screenDir(Math.cos(a), Math.sin(a));
    ok(got.view === e.view && got.flip === e.flip,
      `${String(k * 45).padStart(3)} deg goes (${d.x.toFixed(2)}, ${d.y.toFixed(2)}) `
      + `on screen -> ${got.view} ${got.flip > 0 ? 'as drawn' : 'mirrored'}`
      + (got.view === e.view && got.flip === e.flip ? '' : `  (expected ${e.view} ${e.flip})`));
  }

  const views = new Set(G.OCTANTS.map((o) => o.view));
  ok(views.size === 5, `${views.size} distinct drawings cover all eight: ${[...views].join(', ')}`);
}

// --- 2. exactly one mirror, in one place -------------------------------------
console.log('');
console.log('and the mirror happens once:');
{
  const src = readFileSync(join(SRC, 'girl.js'), 'utf8');
  const scales = (src.match(/ctx\.scale\s*\(/g) || []).length;
  ok(scales === 1, `girl.js calls ctx.scale ${scales} time(s)`);
  const negs = (src.match(/scale\s*\(\s*-/g) || []).length;
  ok(negs === 0, 'and never with a hard-coded negative - the sign comes from the table');
  ok(/ctx\.scale\(s \* o\.flip, s\)/.test(src), 'the one scale takes its flip from OCTANTS');
}

// --- 3. she faces where she is going -----------------------------------------
console.log('');
console.log('she turns to face the way she walks:');
{
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const g = G.createGirl(0, 0, a + Math.PI);          // start facing backwards
    const move = { x: Math.cos(a), y: Math.sin(a) };
    for (let i = 0; i < 180; i++) G.updateGirl(g, STEP, move);
    ok(g.oct === k, `pushed at ${k * 45} deg she settles on octant ${g.oct} (${G.OCTANT_NAMES[g.oct]})`);
  }
}

// --- 4. the hysteresis actually holds ----------------------------------------
console.log('');
console.log('a wobble on a boundary does not flicker between two drawings:');
{
  const g = G.createGirl(0, 0, Math.PI / 8);            // exactly on a boundary
  let flips = 0, last = -1;
  for (let i = 0; i < 600; i++) {
    const a = Math.PI / 8 + Math.sin(i * 0.37) * 0.06;  // +/- 3.4 degrees
    G.updateGirl(g, STEP, { x: Math.cos(a), y: Math.sin(a) });
    if (g.oct !== last) { if (last !== -1) flips++; last = g.oct; }
  }
  ok(flips <= 1, `${flips} change(s) of drawing across 600 ticks of jitter`);
}

// --- 5. weight, and no foot skate --------------------------------------------
console.log('');
console.log('starting and stopping have weight:');
{
  const g = G.createGirl(0, 0, 0);
  const move = { x: 1, y: 0 };
  let tToFull = 0;
  for (let i = 0; i < 300; i++) {
    G.updateGirl(g, STEP, move);
    if (!tToFull && g.speed > G.GAIT.speed * 0.95) tToFull = i * STEP;
  }
  ok(tToFull > 0.18 && tToFull < 0.65, `she reaches full speed in ${tToFull.toFixed(2)}s`);
  ok(Math.abs(g.speed - G.GAIT.speed) < 1,
    `and tops out at ${g.speed.toFixed(0)} cm/s against the ${G.GAIT.speed} she is meant to`);

  let tToStop = 0;
  for (let i = 0; i < 300; i++) {
    G.updateGirl(g, STEP, { x: 0, y: 0 });
    if (!tToStop && g.speed < G.GAIT.speed * 0.05) tToStop = i * STEP;
  }
  ok(tToStop > 0.25 && tToStop < 1.2, `and coasts to a stop over ${tToStop.toFixed(2)}s`);
}

console.log('');
console.log('her feet match the ground at every speed:');
{
  // Half a cycle is one stride. If the phase ever came from time instead of
  // distance, this ratio would move with speed and she would skate.
  const at = (mag) => {
    const g = G.createGirl(0, 0, 0);
    for (let i = 0; i < 240; i++) G.updateGirl(g, STEP, { x: mag, y: 0 });   // settle
    const x0 = g.x, p0 = g.phase;
    let turns = 0, prev = p0;
    for (let i = 0; i < 600; i++) {
      G.updateGirl(g, STEP, { x: mag, y: 0 });
      if (g.phase < prev) turns++;
      prev = g.phase;
    }
    const dist = g.x - x0;
    const cycles = turns + (g.phase - p0) / (Math.PI * 2);
    return dist / cycles / 2;                        // centimetres per stride
  };
  const slow = at(0.35), fast = at(1.0);
  ok(Math.abs(slow - G.GAIT.stride) < 1.5,
    `at a third speed a stride covers ${slow.toFixed(1)} cm (meant to be ${G.GAIT.stride})`);
  ok(Math.abs(fast - G.GAIT.stride) < 1.5,
    `at full speed a stride covers ${fast.toFixed(1)} cm`);
  ok(Math.abs(slow - fast) < 1.0,
    `the two differ by ${Math.abs(slow - fast).toFixed(2)} cm, so her feet never skate`);
}

// --- 6. she is the size she is supposed to be ---------------------------------
console.log('');
console.log('and she is the right size for the street:');
{
  ok(G.HEIGHT_CM >= 125 && G.HEIGHT_CM <= 145,
    `${G.HEIGHT_CM} cm - deliberately shorter than the 155 the ED measured, which `
    + 'looked too tall against our props');
}

console.log('');
console.log(bad ? `${bad} thing(s) wrong with her` : 'she faces where she walks, and her feet stay on the ground');
process.exit(bad ? 1 : 0);
