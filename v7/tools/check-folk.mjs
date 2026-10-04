// Does the crowd hold together, and does pushing through it actually cost you?
//
// Two kinds of failure here and neither of them throws. A crowd volume that
// slowly empties, or slowly fills until everyone is standing inside everyone
// else, looks fine for the first ten seconds and wrong after a minute. And
// the whole point of the feature - that a crowd slows you down and then lets
// you through - is a number, so it can be measured rather than argued about.
//
// Run:  node v5/tools/check-folk.mjs

globalThis.window = { addEventListener: () => {}, matchMedia: () => ({ matches: false }) };
globalThis.document = { addEventListener: () => {}, documentElement: {}, createElement: () => ({ getContext: () => null }) };
globalThis.navigator = { getGamepads: () => [], maxTouchPoints: 0 };
globalThis.addEventListener = () => {};
globalThis.performance = globalThis.performance || { now: () => 0 };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };

const { world, arena } = await import('../src/state.js');
const F = await import('../src/wilds-folk.js');

let bad = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) bad++; };
const STEP = 1 / 60;

// A room for them to walk in.
arena.x = 0; arena.y = 0; arena.w = 1200; arena.h = 600;
world.room = { obstacles: [] };

/** A stand-in player, of the shape wilds-folk reads. */
function dummy(x, y) {
  return { x, y, r: 17, dead: false, moveMag: 0, moveAngle: 0, face: 0, groundMult: 1 };
}

// --- 1. a crowd volume stays a crowd ------------------------------------------------
console.log('a street that keeps itself full:');
{
  F.clearFolk();
  const c = F.makeCrowd(100, 200, 900, 200, 0, 1.0, ['adult', 'porter', 'child']);
  const n0 = world.folk.length;
  ok(n0 > 8, `it populated itself with ${n0} people`);

  const p = dummy(-9999, -9999);          // nobody near
  let minN = n0, maxN = n0, escaped = 0;
  for (let i = 0; i < 2000; i++) {
    F.updateFolk(STEP, p);
    const n = world.folk.length;
    if (n < minN) minN = n;
    if (n > maxN) maxN = n;
    for (const f of world.folk) {
      if (f.x < c.x - 120 || f.x > c.x + c.w + 120 || f.y < c.y - 120 || f.y > c.y + c.h + 120) escaped++;
    }
  }
  ok(minN === n0 && maxN === n0, `after 2000 ticks there are still ${world.folk.length} (never ${minN}..${maxN})`);
  ok(escaped === 0, escaped ? `${escaped} person-ticks spent well outside the volume` : 'and nobody wandered off');

  // Not piled on one spot.
  let overlap = 0;
  for (let i = 0; i < world.folk.length; i++) {
    for (let j = i + 1; j < world.folk.length; j++) {
      const a = world.folk[i], b = world.folk[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < (a.r + b.r) * 0.6) overlap++;
    }
  }
  ok(overlap === 0, overlap ? `${overlap} pairs are standing inside each other` : 'and nobody is standing inside anybody');
}

// --- 2. they do not walk through walls -----------------------------------------------
console.log('');
console.log('walls:');
{
  F.clearFolk();
  world.room = { obstacles: [{ x: 500, y: 150, w: 120, h: 300 }] };
  F.makeCrowd(100, 200, 900, 200, 0, 1.0, ['adult']);
  const p = dummy(-9999, -9999);
  let inside = 0;
  for (let i = 0; i < 1200; i++) {
    F.updateFolk(STEP, p);
    for (const f of world.folk) {
      const o = world.room.obstacles[0];
      if (f.x > o.x && f.x < o.x + o.w && f.y > o.y && f.y < o.y + o.h) inside++;
    }
  }
  ok(inside === 0, inside ? `${inside} person-ticks spent inside a building` : 'nobody ended up inside the building');
  world.room = { obstacles: [] };
}

// --- 3. the slowdown, which is the feature ---------------------------------------------
console.log('');
console.log('what a crowd costs you:');
{
  F.clearFolk();
  const p = dummy(600, 300);
  p.groundMult = 1;
  F.updateFolk(STEP, p);
  ok(p.groundMult === 1, 'an empty street does not slow you at all');

  // Stand him in the middle of a dense knot.
  F.clearFolk();
  for (let i = 0; i < 6; i++) F.makeFolk && world.folk.push(F.makeFolk(600 + Math.cos(i) * 22, 300 + Math.sin(i) * 22));
  p.groundMult = 1;
  F.updateFolk(STEP, p);
  ok(p.groundMult < 0.7, `six people around you takes you to ${p.groundMult.toFixed(2)} speed`);
  ok(p.groundMult >= F.CROWD.slowFloor - 1e-9, `and never below the ${F.CROWD.slowFloor} floor`);

  // Twenty should not stop him dead.
  F.clearFolk();
  for (let i = 0; i < 20; i++) world.folk.push(F.makeFolk(600 + Math.cos(i) * 30, 300 + Math.sin(i) * 30));
  p.groundMult = 1;
  F.updateFolk(STEP, p);
  ok(p.groundMult >= F.CROWD.slowFloor - 1e-9, `even twenty leaves you moving at ${p.groundMult.toFixed(2)}`);
}

// --- 4. THE WALK THROUGH. Measured, not guessed. ----------------------------------------
//
// Walk the same line twice, once down an empty lane and once down a packed
// one, and compare. This test is a WALLED lane on purpose: measured in the
// open, every setting gave between 1.07x and 1.27x, because people simply
// stepped aside and the crowd was never felt. The walls are the feature. See
// the note above CROWD in wilds-folk.js.
console.log('');
console.log('walking the length of a packed lane:');
{
  const LANE = 96;
  const walls = [
    { x: 150, y: 300 - LANE / 2 - 60, w: 800, h: 60 },
    { x: 150, y: 300 + LANE / 2, w: 800, h: 60 },
  ];
  const walk = (density) => {
    F.clearFolk();
    world.room = { obstacles: walls };
    if (density) F.makeCrowd(200, 300 - LANE / 2, 700, LANE, 0, density, ['adult', 'porter']);
    const n = world.folk.length;
    const p = dummy(170, 300);
    let t = 0, worst = 1;
    for (let i = 0; i < 60 * 40; i++) {
      p.groundMult = 1;
      p.moveMag = 1; p.moveAngle = 0; p.face = 0;
      F.updateFolk(STEP, p);
      worst = Math.min(worst, p.groundMult);
      p.x += 268 * p.groundMult * STEP;
      t += STEP;
      if (p.x > 940) break;
    }
    return { n, t, x: p.x, worst };
  };
  const clear = walk(0);
  const dense = walk(8);
  ok(clear.x > 940, `an empty lane is crossed in ${clear.t.toFixed(2)}s`);
  ok(dense.x > 940, dense.x > 940
    ? `${dense.n} people in it and he still gets through, in ${dense.t.toFixed(2)}s`
    : `he never got through: stuck at x=${dense.x.toFixed(0)} - that is a wall, not a crowd`);
  const ratio = dense.t / clear.t;
  ok(ratio > 1.4, `it costs him ${ratio.toFixed(2)}x as long, so the crowd is felt`);
  ok(ratio < 3.0, `and under 3x, so it is a crowd and not treacle`);
  ok(dense.worst >= F.CROWD.slowFloor - 1e-9,
    `his worst moment was ${dense.worst.toFixed(2)} speed, never below the ${F.CROWD.slowFloor} floor`);
  world.room = { obstacles: [] };
}

// --- 5. folk are not enemies -------------------------------------------------------------
console.log('');
console.log('and they are not enemies:');
{
  world.enemies.length = 0;
  F.clearFolk();
  F.makeCrowd(100, 200, 400, 200, 0, 1.0);
  const p = dummy(300, 300);
  for (let i = 0; i < 300; i++) F.updateFolk(STEP, p);
  ok(world.enemies.length === 0, 'nothing in wilds-folk.js ever touches world.enemies');
  ok(world.folk.length > 0, `${world.folk.length} of them live in world.folk instead`);
}

console.log('');
console.log(bad ? `${bad} thing(s) wrong with the crowd` : 'the street stays full, and pushing through it costs you');
process.exit(bad ? 1 : 0);
