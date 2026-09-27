// Can she still be told to do all nine things?
//
// The bindings used to be literals scattered through two functions, which was
// unreadable but could not go WRONG. A table that a player edits and a browser
// remembers can: a saved file from an older build, a key bound to two actions
// at once, an action left with nothing on it, or Escape taken for `dash` so
// there is no way out of the menu that took it. Any one of those ships a game
// that cannot be played and throws nothing.
//
// Run:  node savi/tools/check-keys.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// A localStorage the module can talk to, since this is node. Each case below
// loads through it, exactly the way the game does at boot.
let store = null;
globalThis.localStorage = {
  getItem: () => store,
  setItem: (k, v) => { store = v; },
};

const {
  ACTIONS, BINDS, RESERVED_KEYS, KEY_DEFAULTS, keys,
  loadKeys, resetKeys, kdown, actionFor, keyLabel, keyLabels, rebindKey, defaultKeys,
} = await import('../src/savi-keys.js');

let bad = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) bad++; };

const SRC = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(SRC, '..', 'src', 'savi.js'), 'utf8');

// --- 1. the defaults themselves ---------------------------------------------------
console.log('the table as it ships:');
{
  const seen = new Map();
  let clash = 0;
  for (const a of ACTIONS) {
    ok(Array.isArray(KEY_DEFAULTS[a.id]) && KEY_DEFAULTS[a.id].length,
      `${a.id} has a default (${keyLabels(a.id)})`);
    for (const k of KEY_DEFAULTS[a.id]) {
      if (seen.has(k)) { ok(false, `"${k}" is bound to both ${seen.get(k)} and ${a.id}`); clash++; }
      seen.set(k, a.id);
      if (RESERVED_KEYS.includes(k)) { ok(false, `${a.id} defaults to ${k}, which is reserved`); clash++; }
    }
  }
  ok(clash === 0, 'no key does two jobs, and none of them is escape or enter');
  // THE SPLIT. Interact and use are the whole reason this file exists: one
  // key for "the thing in front of her" and one for "the thing in her hand".
  ok(KEY_DEFAULTS.interact[0] === 'e', 'interact is still E');
  ok(KEY_DEFAULTS.use[0] === 'mouse1', 'use is the left mouse button');
}

// --- 2. saved data, in every state it can arrive in --------------------------------
console.log('\nwhat a browser hands back:');
for (const [what, raw] of [
  ['nothing saved at all', null],
  ['not even JSON', 'wat'],
  ['JSON that is not an object', '42'],
  ['an empty object', '{}'],
  ['an array', '[1,2,3]'],
  ['a null', 'null'],
  ['one action, from an older build', '{"jump":["j"]}'],
  ['an action bound to nothing', '{"jump":[]}'],
  ['an action holding rubbish', '{"jump":[null,7,{},""]}'],
  ['an action holding escape', '{"dash":["escape"]}'],
  ['the same key twice over', '{"dash":["q","q","q"]}'],
  ['a key that is not a string', '{"dash":[["q"]]}'],
]) {
  store = raw;
  loadKeys();
  let dark = 0;
  for (const a of ACTIONS) if (!BINDS[a.id] || !BINDS[a.id].length) dark++;
  ok(dark === 0, `${what}: all ${ACTIONS.length} actions still have a key`);
  let held = 0;
  for (const k of RESERVED_KEYS) if (actionFor(k)) held++;
  ok(held === 0, `${what}: and escape and enter are nobody's`);
}

// --- 3. a player changing one -----------------------------------------------------
console.log('\nrebinding:');
{
  store = null;
  loadKeys();

  // A plain change.
  const r1 = rebindKey('jump', 'K');
  ok(!r1.refused && BINDS.jump[0] === 'k', 'jump takes K, lowercased');
  ok(keyLabel('jump') === 'K', 'and the hint says K');

  // TAKEN FROM THE OTHER ONE, AND SAID OUT LOUD. A key doing two things is a
  // player pressing one button and getting two verbs, which reads as a bug in
  // the game rather than a thing they did.
  const r2 = rebindKey('dash', 'k');
  ok(r2.took === 'jump', 'binding K to dash takes it off jump, and says so');
  ok(BINDS.jump.length > 0, 'and jump is not left with nothing');
  ok(actionFor('k') === 'dash', 'K is dash now, and only dash');

  // Escape stays the way out.
  for (const k of RESERVED_KEYS) {
    const r = rebindKey('dash', k);
    ok(!!r.refused, `${k} is refused (${r.refused})`);
    ok(actionFor(k) === null, `and ${k} is still nobody's`);
  }

  // It survives the trip through storage.
  const before = JSON.stringify(BINDS);
  loadKeys();
  ok(JSON.stringify(BINDS) === before, 'a rebind is still there next session');

  defaultKeys();
  ok(BINDS.jump.join() === KEY_DEFAULTS.jump.join(), 'reset puts it back');
  loadKeys();
  ok(BINDS.jump.join() === KEY_DEFAULTS.jump.join(), 'and the reset is what gets remembered');
}

// --- 4. held keys reach the right action -------------------------------------------
console.log('\nheld:');
{
  store = null;
  loadKeys();
  keys.clear();
  keys.add(' ');
  ok(kdown('jump') && !kdown('dash'), 'space is jump and nothing else');
  keys.clear();
  keys.add('mouse1');
  ok(kdown('use') && !kdown('interact'), 'a left click is USE, and not interact');
  keys.clear();
  keys.add('e');
  ok(kdown('interact') && !kdown('use'), 'and E is interact, and not use');
  keys.clear();
  keys.add('arrowleft');
  ok(kdown('left'), 'the arrows walk her too');
  keys.clear();
  ok(ACTIONS.every((a) => !kdown(a.id)), 'and with nothing held, nothing is down');
}

// --- 5. the game asks for what is actually in the table ---------------------------
//
// A typo in `kdown('intract')` is silently false for ever: she simply never
// interacts and nothing throws. So this reads the source and checks every name
// the game asks about against the table.
console.log('\nthe names savi.js asks for:');
{
  const ids = new Set(ACTIONS.map((a) => a.id));
  let wrong = 0;
  for (const m of src.matchAll(/\b(?:kdown|keyLabel|keyLabels)\('([a-z]+)'\)/g)) {
    if (!ids.has(m[1])) { ok(false, `it asks for '${m[1]}', which is not an action`); wrong++; }
  }
  ok(wrong === 0, 'every action it asks about exists');

  // AND NO LITERALS LEFT BEHIND. A stray `keys.has('e')` is a key that cannot
  // be rebound and a hint that lies about it.
  const stray = [...src.matchAll(/keys\.has\('([^']+)'\)/g)].map((m) => m[1]);
  ok(stray.length === 0, stray.length ? `keys.has() still spells out: ${stray.join(', ')}` : 'no key is spelled out by hand any more');

  // The two channels are actually two.
  ok(/holding = kdown\('use'\)/.test(src), 'the HOLD reads `use`');
  ok(/const acting = kdown\('interact'\)/.test(src), 'the PRESS reads `interact`');
  ok(!/holding = kdown\('interact'\)/.test(src), 'and they are not the same thing');
  // And a left click no longer drags her about.
  ok(/if \(!isTouch\(\)\) \{\n\s*if \(e\.button === 0/.test(src), 'a desktop click goes to the held set, not the stick');
}

console.log('');
console.log(bad ? `${bad} thing(s) wrong with the controls` : 'nine actions, all bound, all reachable');
process.exit(bad ? 1 : 0);
