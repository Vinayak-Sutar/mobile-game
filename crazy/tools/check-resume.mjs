// IF YOU CLOSE THE TAB, DO YOU GET YOUR BUILD BACK?
//
// This is the one failure in the whole game that a player cannot forgive and
// cannot work around: twenty minutes of a journey, gone, with no way to tell
// what went missing. It is also exactly the kind of bug that never shows up in
// play-testing, because it only appears on the SECOND visit.
//
// So the round trip is tested rather than trusted. A player is built, given a
// build, captured, and rebuilt from the capture - and the two are compared
// stat by stat, not eyeballed.
//
// The build is stored as a RECIPE (which boons, at which levels) and replayed
// through applyBoon, never as a copy of player.stats. That choice is what
// section 3 below actually checks: retune a boon and an old save must come
// back with the NEW number, because a saved stat block would quietly preserve
// last month's balance forever in every save in the wild.
//
// Run:  node crazy/tools/check-resume.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

// save.js only ever touches localStorage; run-save.js only touches save.js.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { createPlayer } = await import('../src/player.js');
const { BOONS, applyBoon, boonById } = await import('../src/boons.js');
const { learnSpell, spellLevel, SPELLS } = await import('../src/spells.js');
const { WEAPONS } = await import('../src/weapons.js');
const R = await import('../src/run-save.js');
const S = await import('../src/save.js');
const A = await import('../src/acts.js');

let bad = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) bad++; };

/** A player a few chambers into an act. */
function builtPlayer() {
  const p = createPlayer(WEAPONS[1], {});
  // Deliberately includes a stacked boon and one taken twice at different
  // times, because several boons give a different amount the first time.
  for (const id of ['ember', 'ember', 'vigor', 'charged', 'bloodroot', 'ember']) {
    const b = boonById(id);
    if (b) applyBoon(p, b);
  }
  learnSpell(p, SPELLS[0].id);
  learnSpell(p, SPELLS[0].id);        // levelled
  learnSpell(p, SPELLS[3].id);
  p.hp = Math.round(p.stats.maxHp * 0.4);
  p.lives = 2;
  return p;
}

// --- 1. the round trip ------------------------------------------------------
console.log('a build survives being written down and read back:');
{
  const before = builtPlayer();
  const snap = R.captureBuild(before);
  const after = R.applyBuild(createPlayer(R.weaponOf(snap), {}), snap);

  const keys = Object.keys(before.stats);
  const differ = keys.filter((k) => Math.abs((before.stats[k] || 0) - (after.stats[k] || 0)) > 1e-9);
  ok(differ.length === 0, differ.length
    ? `these stats came back different: ${differ.map((k) => `${k} ${before.stats[k]}->${after.stats[k]}`).join(', ')}`
    : `all ${keys.length} stats identical after a round trip`);

  ok(after.weapon && after.weapon.id === before.weapon.id,
    `the weapon comes back (${before.weapon.id})`);
  ok(after.hp === before.hp, `health comes back exactly (${before.hp})`);
  ok(after.lives === before.lives, `lives come back (${before.lives})`);
  ok(JSON.stringify(after.spells) === JSON.stringify(before.spells),
    `spells come back in their slots (${before.spells.join(', ') || 'none'})`);

  const lvDiffer = SPELLS.filter((s) => spellLevel(before, s.id) !== spellLevel(after, s.id));
  ok(lvDiffer.length === 0, lvDiffer.length
    ? `spell levels differ: ${lvDiffer.map((s) => s.id).join(', ')}`
    : 'and at the levels they were learned to');

  // Compared by content, not by JSON: boonOrder is a RECENCY list (applyBoon
  // filters the id out and pushes it back), so replaying rebuilds the same
  // levels in a different key order. Every stat matching above is the proof
  // that the different interleaving does not matter - each boon's increment
  // reads only its own prior count.
  const ids = new Set([...Object.keys(before.boons), ...Object.keys(after.boons)]);
  const lvDiff = [...ids].filter((id) => (before.boons[id] || 0) !== (after.boons[id] || 0));
  ok(lvDiff.length === 0, lvDiff.length
    ? `boon levels differ: ${lvDiff.map((id) => `${id} ${before.boons[id]}->${after.boons[id]}`).join(', ')}`
    : `and all ${ids.size} boons are back at their own level`);
}

// --- 2. it is a recipe, not a block of numbers ------------------------------
console.log('');
console.log('and it is replayed, not copied:');
{
  const p = builtPlayer();
  const snap = R.captureBuild(p);
  const text = JSON.stringify(snap);

  // If stats were being copied, the saved object would hold them.
  ok(!('stats' in snap) && !text.includes('damageMult') && !text.includes('maxHp'),
    'the saved build holds no stat block - only which boons, at which levels');

  // THE POINT OF ALL THIS. Retune a boon; an old save must come back changed.
  const ember = boonById('ember');
  const original = ember.apply;
  ember.apply = (st) => { st.damageMult += 1; };          // pretend it was buffed
  const after = R.applyBuild(createPlayer(R.weaponOf(snap), {}), snap);
  ember.apply = original;
  const normal = R.applyBuild(createPlayer(R.weaponOf(snap), {}), snap);

  ok(after.stats.damageMult > normal.stats.damageMult,
    'a boon retuned after the save takes its NEW value on resume, not the old one');
}

// --- 3. a build that no longer makes sense ----------------------------------
console.log('');
console.log('and it survives the game changing underneath it:');
{
  const snap = R.captureBuild(builtPlayer());
  snap.boonOrder.push('a-boon-that-was-deleted');
  snap.boons['a-boon-that-was-deleted'] = 3;
  snap.spells.push('a-spell-that-was-deleted');
  snap.weapon = 'a-weapon-that-was-deleted';

  let threw = null;
  let p = null;
  try { p = R.applyBuild(createPlayer(R.weaponOf(snap), {}), snap); } catch (e) { threw = e; }
  ok(!threw, threw ? `a removed boon threw: ${threw.message}` : 'a removed boon or spell is skipped, not thrown over');
  ok(p && p.weapon, 'and a removed weapon falls back to a real one rather than undefined');
}

// --- 4. the save itself -----------------------------------------------------
console.log('');
console.log('the journey is written, read and cleared:');
{
  store.clear();
  S.loadSave();
  ok(!R.hasRun(), 'a fresh save has no journey waiting');

  const world = {
    player: builtPlayer(), act: 2, depth: 17, biome: { id: 'ember' },
    bossOrder: A.drawJourney(), loop: 0, gold: 140, kills: 55, runTime: 612,
  };
  R.saveRun(world);
  ok(R.hasRun(), 'after a chamber boundary there is one');

  S.writeSave();
  S.loadSave();                                   // the second visit
  const r = R.currentRun();
  ok(!!r, 'and it is still there after a reload');
  ok(r.act === 2 && r.depth === 17, `at the chamber it was left (act ${r.act}, chamber ${r.depth})`);
  ok(r.bosses.length === A.ACT_COUNT * A.GUARDIANS_PER_ACT,
    'with the same twelve guardians, so the journey does not reshuffle');
  ok(r.gold === 140 && r.kills === 55, 'and the run tally intact');

  // An ordinary chamber save must NOT move the point a death returns you to.
  const entryBefore = JSON.stringify(R.currentRun().entry);
  world.player.hp = 5;
  world.depth = 18;
  R.saveRun(world);
  ok(JSON.stringify(R.currentRun().entry) === entryBefore,
    'a chamber save leaves `entry` alone - only an act boundary moves it');
  ok(R.currentRun().now.hp === 5, 'while `now` follows the player');

  // An act boundary does move it.
  world.player.hp = 60;
  R.bankAct(world, 3);
  ok(R.currentRun().entry.hp === 60 && R.currentRun().act === 3,
    'clearing an act makes what you hold the thing you fall back to');
  ok(world.depth === A.actStartDepth(3) - 1,
    `and sets up the first chamber of act 3 (depth ${world.depth} + 1 = ${A.actStartDepth(3)})`);

  R.clearRun();
  ok(!R.hasRun(), 'and finishing or abandoning forgets it');
}

// --- 5. the save point is where it says it is -------------------------------
console.log('');
console.log('and it is written at chamber boundaries only:');
{
  const game = readFileSync(join(SRC, 'game.js'), 'utf8');

  // Both ways a chamber can begin must save, and nothing else may.
  const body = (name) => {
    const i = game.indexOf(`function ${name}(`);
    return i < 0 ? '' : game.slice(i, game.indexOf('\n}\n', i));
  };
  ok(/saveChamber\(\)/.test(body('startRun')), 'startRun saves chamber 1');
  ok(/saveChamber\(\)/.test(body('advanceRoom')), 'advanceRoom saves every chamber after it');

  // This check earned its keep immediately: the save landed in startRun alone,
  // so a journey would have frozen at chamber 1 and every later chamber been
  // lost - a bug that only shows itself on somebody's second visit.
  const calls = (game.match(/saveRun\(/g) || []).length;
  ok(calls === 1, calls === 1
    ? 'and saveRun has exactly one caller, saveChamber, so a fight is never serialised'
    : `saveRun is called ${calls} times; only saveChamber should call it`);

  ok(/clearRun\(\)/.test(game), 'winning or abandoning clears it');

  // Endless shares startRun, advanceRoom and saveChamber with the journey, so
  // without this guard a score run would overwrite a journey in progress -
  // somebody's twenty minutes, gone, for playing the other mode.
  const guard = body('saveChamber');
  ok(/world\.endless/.test(guard),
    'and an endless run writes nothing, so it cannot overwrite a journey');
  ok(/!world\.endless/.test(readFileSync(join(SRC, 'rooms.js'), 'utf8')),
    'while rooms.js drops the act boundaries and the last gate in endless');
}

console.log('');
console.log(bad
  ? `${bad} thing(s) wrong - a player could lose their journey`
  : 'close the tab, come back, and the build is the one you had');
process.exit(bad ? 1 : 0);
