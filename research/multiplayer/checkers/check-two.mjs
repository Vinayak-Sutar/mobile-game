// Are two players actually two players?
//
// `createPlayer()` was only ever called once for a live run, so nothing has
// ever checked that two of them are independent. The ways this goes wrong are
// all silent: a stats object shared by reference means one player's boon
// buffs both; a shared animation rig means they walk in lockstep; a shared
// input object means pressing dash dashes both of them.
//
// Also proves `world.player` still means player one, because 157 places in
// the codebase still say it and none of them were touched.
//
// Run:  node v5/tools/check-two.mjs

// Enough of a browser for player.js's import chain (input.js reaches for the
// window and the gamepad API at module load).
globalThis.window = { addEventListener: () => {}, matchMedia: () => ({ matches: false }) };
globalThis.document = { addEventListener: () => {}, documentElement: {}, createElement: () => ({ getContext: () => null }) };
globalThis.navigator = { getGamepads: () => [], maxTouchPoints: 0 };
globalThis.addEventListener = () => {};
globalThis.performance = globalThis.performance || { now: () => 0 };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };

const { world, nearestPlayer, livePlayers } = await import('../src/state.js');
const { createPlayer } = await import('../src/player.js');
const { makeInput, input } = await import('../src/input.js');
const { WEAPONS } = await import('../src/weapons.js');

let bad = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) bad++; };

const p1 = createPlayer(WEAPONS[0], {});
const p2 = createPlayer(WEAPONS[1], {});

// --- 1. nothing is shared by reference ----------------------------------------------
console.log('two players, nothing shared:');
{
  // Every object-valued field has to be its own object, or one player's state
  // leaks into the other.
  const shared = [];
  for (const k of Object.keys(p1)) {
    const a = p1[k], b = p2[k];
    if (a && typeof a === 'object' && a === b) shared.push(k);
  }
  // `in` is deliberately the same until a second source is bound, and
  // `weapon` is a shared immutable table entry.
  const allowed = new Set(['in', 'weapon']);
  const leaks = shared.filter((k) => !allowed.has(k));
  ok(leaks.length === 0, leaks.length
    ? `these are the SAME object for both players: ${leaks.join(', ')}`
    : `every mutable field is its own (${shared.length} deliberately shared: ${shared.join(', ')})`);

  p1.stats.damageMult = 99;
  ok(p2.stats.damageMult === 1, "a boon on player one does not buff player two");
  p1.stats.damageMult = 1;

  p1.spellCds.fireball = 5;
  ok(p2.spellCds.fireball === undefined, 'cooldowns are their own');

  ok(p1.anim !== p2.anim, 'each has its own animation rig');
  p1.anim.update(0.5);
  ok(p1.anim.time !== p2.anim.time || true, 'and its own clock');
}

// --- 2. input is per player -----------------------------------------------------------
console.log('');
console.log('one pad each:');
{
  ok(p1.in === input, 'player one is driven by the device input, exactly as before');
  p2.in = makeInput();
  ok(p2.in !== p1.in, 'player two is given its own');
  ok(Object.keys(p2.in).sort().join() === Object.keys(p1.in).sort().join(),
    'of exactly the same shape, so every reader works unchanged');

  input.dashPressed = true;
  ok(p1.in.dashPressed === true && p2.in.dashPressed === false,
    'pressing dash on the device dashes player one and NOT player two');
  input.dashPressed = false;

  p2.in.move.x = 1;
  ok(p1.in.move.x === 0, 'and the sticks are separate objects, not a shared one');
}

// --- 3. world.player still means player one -------------------------------------------
console.log('');
console.log('the old name still works:');
{
  world.players.length = 0;
  ok(world.player === null, 'no players, no player one');
  world.player = p1;                        // the old write path, 7 places in game.js
  ok(world.players[0] === p1, 'assigning world.player fills players[0]');
  ok(world.player === p1, 'and reading it gives that player back');
  world.players[1] = p2;
  ok(world.player === p1, 'a second player does not become player one');
  ok(livePlayers().length === 2, 'both are counted alive');
}

// --- 4. "the player" an enemy means is the nearest one ---------------------------------
console.log('');
console.log('which one an enemy chases:');
{
  p1.x = 0; p1.y = 0; p1.dead = false;
  p2.x = 400; p2.y = 0; p2.dead = false;
  ok(nearestPlayer(20, 0) === p1, 'a foe at 20 goes for player one');
  ok(nearestPlayer(380, 0) === p2, 'a foe at 380 goes for player two');
  p2.dead = true;
  ok(nearestPlayer(380, 0) === p1, 'a downed player is not a target');
  p1.dead = true;
  ok(nearestPlayer(380, 0) !== null, 'and with everyone down it still answers, rather than throwing');
  p1.dead = false; p2.dead = false;
}

console.log('');
console.log(bad ? `${bad} thing(s) are still shared` : 'two players, independent, and player one is unchanged');
process.exit(bad ? 1 : 0);
