// IS THERE EXACTLY ONE ANSWER TO "HAS THE PLAYER DONE THIS"?
//
// There used to be four, and they disagreed with each other:
//
//   save.dungeonsCleared[id]     account-scoped, and leaked across journeys
//   save.talks[npc].taken        account-scoped, wiped by hand on a new journey
//   worldSnapshot().lairs        journey-scoped
//   worldSnapshot().claimed      journey-scoped
//
// Two localStorage keys, two versioning rules, no stated reason for the split -
// a lair kill forgotten on a new journey while a dungeon clear survived one.
// Nothing enforced any of it, so nothing stopped a fifth from appearing.
//
// The flags are also what a mission table hangs off, which is why this had to
// happen before anything was called a mission: unifying four stores is an
// afternoon now and a live-save migration later.
//
// This checker reads the source as well as running it, because the failure is
// silent. A stray `save.talks` compiles, runs, and quietly loses somebody's
// progress a week after it ships.
//
// Run:  node v7/tools/check-progress.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

// A DOM-free stand-in: save.js only ever touches localStorage.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const S = await import('../src/save.js');
const D = await import('../src/dialogue.js');

let bad = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) bad++; };
const files = readdirSync(SRC).filter((f) => f.endsWith('.js'))
  .map((f) => [f, readFileSync(join(SRC, f), 'utf8')]);

// --- 1. the four old stores are gone from the source ------------------------
console.log('the four stores that disagreed:');
{
  for (const token of ['save.dungeonsCleared', 'save.talks']) {
    const hits = files.filter(([f, s]) => f !== 'save.js' && s.includes(token)).map(([f]) => f);
    ok(hits.length === 0, hits.length ? `${token} still read in ${hits.join(', ')}` : `${token} is gone`);
  }
  // save.js may name them: it migrates them forward, then deletes them.
  const sv = files.find(([f]) => f === 'save.js')[1];
  ok(/delete save\.dungeonsCleared/.test(sv) && /delete save\.talks/.test(sv),
    'save.js migrates both forward and then drops them');

  const ww = files.find(([f]) => f === 'wilds-world.js')[1];
  ok(!/lairs: lairs\(\)\.filter/.test(ww),
    'worldSnapshot() no longer carries lair kills - a lair boss is a mission');
  ok(/markMission\(id, \{ done: true \}\)/.test(ww),
    'and restoreWorld folds an old journey\'s lairs forward');
}

// --- 2. one source of truth for the checkpoint ------------------------------
console.log('');
console.log('and one answer to "where am I checkpointed":');
{
  const assigns = files.filter(([, s]) => /lastLampId\s*=/.test(s.replace(/export const lastLampId =/g, '')))
    .map(([f]) => f);
  ok(assigns.length === 0, assigns.length
    ? `${assigns.join(', ')} still writes its own copy of lastLampId`
    : 'nothing keeps a hand-maintained copy of the last lamp');
  const ww = files.find(([f]) => f === 'wilds-world.js')[1];
  ok(/export const lastLampId = \(\) => \(W \? W\.lastLamp : null\)/.test(ww),
    'wilds-world.js owns it, as a getter over W.lastLamp');
}

// --- 3. it behaves ----------------------------------------------------------
console.log('');
console.log('the one namespace works:');
{
  store.clear();
  S.loadSave();
  ok(S.missionDone('catacomb') === false, 'a fresh save has done nothing');

  S.clearMission('catacomb');
  ok(S.missionDone('catacomb'), 'clearing a mission marks it done');
  ok(S.save.progress.missions.catacomb.clears === 1, 'and counts the clear');
  S.clearMission('catacomb');
  ok(S.save.progress.missions.catacomb.clears === 2,
    'replaying counts again - missions are meant to be replayed');

  ok(!S.flag('spoke'), 'a flag starts unset');
  S.setFlag('spoke');
  ok(S.flag('spoke'), 'and can be set');
  ok(!S.hasMet('rell'), 'nobody has met you');
  S.markMet('rell');
  ok(S.hasMet('rell'), 'until they have');

  // It has to survive a round trip, which is the whole point of a save.
  S.writeSave();
  const before = JSON.stringify(S.save.progress);
  S.loadSave();
  ok(JSON.stringify(S.save.progress) === before, 'and it all survives a reload');
}

// --- 4. the migration, which only gets one chance ---------------------------
console.log('');
console.log('an old save is folded forward, not lost:');
{
  store.clear();
  store.set('ashfall.crazy.save', JSON.stringify({
    darkness: 120,
    dungeonsCleared: { catacomb: true, forge: true },
    talks: { rell: { met: true, taken: { gaveCinders: true, markDungeon: true } } },
  }));
  S.loadSave();
  ok(S.missionDone('catacomb') && S.missionDone('forge'), 'two old dungeon clears carried over');
  ok(S.hasMet('rell'), 'and that you had met Rell');
  ok(S.flag('gaveCinders') && S.flag('markDungeon'), 'and both flags he set');
  ok(S.save.darkness === 120, 'without disturbing anything else');
  ok(S.save.dungeonsCleared === undefined && S.save.talks === undefined,
    'and the old stores are dropped, so they cannot drift back');
}

// --- 5. flags are global, which is the point --------------------------------
console.log('');
console.log('a flag one person sets, another can read:');
{
  store.clear();
  S.loadSave();
  const npc = D.NPCS[0];
  ok(!!npc, `there is at least one character (${npc && npc.id})`);

  // dialogue.js must read the shared namespace, not a private map per NPC.
  const dl = files.find(([f]) => f === 'dialogue.js')[1];
  ok(/const f = state\.flags;/.test(dl), 'lineOf filters choices against state.flags');
  ok(!/state\[npc\.id\]/.test(dl), 'and never reaches into a per-character map');

  // Set a flag as if a different character had, and check it is visible.
  S.setFlag('somebodyElseSaidSo');
  ok(S.talkState().flags.somebodyElseSaidSo === true,
    'a flag set anywhere is visible to every conversation');
}

console.log('');
console.log(bad
  ? `${bad} thing(s) wrong - progress is not yet in one place`
  : 'one namespace, one scope, one key, and old saves carried forward');
process.exit(bad ? 1 : 0);
