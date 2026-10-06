// DOES THE JOURNEY STILL FIT THE COMBAT IT IS BUILT ON?
//
// This checker exists because of a specific failure, and it is worth writing
// down so it is not repeated a third time.
//
// The 24-level ladder that used to live here kept the combat's enemy scaling -
// which was tuned against a player who picks up roughly 22 boons on the way -
// and then removed the boons. showBoonSelect() only fires from handleDoor, and
// the ladder suppressed doors inside a level, so it granted NONE. Enemy health
// still climbed to x1.98. The result was flat and pointless early and
// unwinnable from about level 8.
//
// Nothing caught it, because nothing ever compared the player's power curve
// against the content's. Two numbers lived in different files and no one made
// them look at each other.
//
// So this file does exactly that, and it reads the probabilities OUT OF
// rooms.js rather than keeping its own copy - a model that can drift from the
// code it models is worse than no model, because it reassures you.
//
// Run:  node crazy/tools/check-acts.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');
const read = (f) => readFileSync(join(SRC, f), 'utf8');

const A = await import('../src/acts.js');
const { BOSS_POOL } = await import('../src/boss-pool.js');

let bad = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) bad++; };

// --- 1. the groups ----------------------------------------------------------
console.log('three groups, and every guardian in exactly one:');
{
  const all = A.ALL_GROUPED;
  const dupes = all.filter((b, i) => all.indexOf(b) !== i);
  ok(dupes.length === 0, dupes.length
    ? `in two groups at once: ${[...new Set(dupes)].join(', ')}`
    : 'no guardian appears in two groups');

  ok(A.UNGROUPED.length === 0, A.UNGROUPED.length
    ? `in BOSS_POOL but in no group, so unreachable: ${A.UNGROUPED.join(', ')}`
    : 'every guardian in BOSS_POOL belongs to a group');

  const strays = all.filter((b) => !BOSS_POOL.includes(b));
  ok(strays.length === 0, strays.length
    ? `grouped but not in BOSS_POOL: ${strays.join(', ')}`
    : 'and no group names a guardian that does not exist');

  ok(A.GROUPS.length === A.ACT_COUNT, `${A.GROUPS.length} groups for ${A.ACT_COUNT} acts`);
  for (const g of A.GROUPS) {
    ok(g.bosses.length >= A.GUARDIANS_PER_ACT,
      `group "${g.id}" has ${g.bosses.length}, and an act needs ${A.GUARDIANS_PER_ACT}`);
  }
}

// --- 2. a journey -----------------------------------------------------------
console.log('');
console.log('a journey draws the right guardians, in rising order:');
{
  const j = A.drawJourney();
  ok(j.length === A.ACT_COUNT * A.GUARDIANS_PER_ACT,
    `twelve guardians a journey (got ${j.length})`);
  ok(new Set(j).size === j.length, 'and never the same one twice');

  // Every guardian must be reachable in SOME journey, or it is dead content.
  const seen = new Set();
  for (let i = 0; i < 400; i++) for (const b of A.drawJourney()) seen.add(b);
  const never = BOSS_POOL.filter((b) => !seen.has(b));
  ok(never.length === 0, never.length
    ? `never drawn in 400 journeys: ${never.join(', ')}`
    : `every one of the ${BOSS_POOL.length} guardians turns up across journeys`);

  // Act N's guardians must come from group N, or difficulty does not rise.
  let wrong = 0;
  for (let i = 0; i < 200; i++) {
    const journey = A.drawJourney();
    for (let act = 1; act <= A.ACT_COUNT; act++) {
      for (const b of A.actGuardians(journey, act)) {
        if (!A.GROUPS[act - 1].bosses.includes(b)) wrong++;
      }
    }
  }
  ok(wrong === 0, wrong
    ? `${wrong} guardians drawn from the wrong group`
    : 'act 1 is always easy-group, act 2 middle, act 3 hard');
}

// --- 3. the shape -----------------------------------------------------------
console.log('');
console.log('the shape of a journey:');
{
  const rooms = read('rooms.js');

  // Derived, not retyped. A hardcoded 3 or 12 here is how two files start to
  // disagree about how long a journey is.
  ok(/BOSS_GAP = CHAMBERS_PER_ACT \/ GUARDIANS_PER_ACT/.test(rooms),
    'rooms.js derives BOSS_GAP from acts.js rather than hardcoding it');
  ok(/GUARDIAN_COUNT = ACT_COUNT \* GUARDIANS_PER_ACT/.test(rooms),
    'and derives GUARDIAN_COUNT the same way');

  const FIRST = 3;
  const GAP = A.CHAMBERS_PER_ACT / A.GUARDIANS_PER_ACT;
  const N = A.ACT_COUNT * A.GUARDIANS_PER_ACT;
  const FINAL = FIRST + (N - 1) * GAP;

  ok(Number.isInteger(GAP), `a guardian every ${GAP} chambers`);
  ok(FINAL === A.FINAL_CHAMBER,
    `the last guardian stands on the last chamber (${FINAL} === ${A.FINAL_CHAMBER})`);

  // Every act must CLOSE on a guardian, which is what makes the boundary a
  // place you can stop rather than an arbitrary line mid-fight.
  const bossDepths = [];
  for (let d = FIRST; d <= FINAL; d += GAP) bossDepths.push(d);
  for (let act = 1; act <= A.ACT_COUNT; act++) {
    const end = A.actEndDepth(act);
    ok(bossDepths.includes(end), `act ${act} ends on a guardian, at chamber ${end}`);
    ok(A.isActEnd(end), `and isActEnd agrees about chamber ${end}`);
  }
  ok(!A.isActEnd(A.CHAMBERS_PER_ACT - 1), 'and does not claim a mid-act chamber');
  ok(A.actOf(1) === 1 && A.actOf(A.CHAMBERS_PER_ACT) === 1
    && A.actOf(A.CHAMBERS_PER_ACT + 1) === 2 && A.actOf(FINAL) === A.ACT_COUNT,
    'chambers map to the act they belong to');
}

// --- 4. THE ONE THAT MATTERS ------------------------------------------------
//
// Does the player gain power at the rate the enemy scaling assumes?
console.log('');
console.log('and the player grows as fast as the enemies do:');
{
  const rooms = read('rooms.js');

  // Read the reward odds out of rooms.js. If someone retunes rollReward, this
  // check retunes with it - and if the shape of that function changes enough
  // that these patterns stop matching, the check fails loudly instead of
  // silently modelling a function that no longer exists.
  const pBoon = Number((/if \(r < ([0-9.]+)\) return 'boon'/.exec(rooms) || [])[1]);
  const pHealTo = Number((/if \(r < ([0-9.]+)\) return 'heal'/.exec(rooms) || [])[1]);
  ok(Number.isFinite(pBoon) && Number.isFinite(pHealTo),
    `read the door odds straight from rooms.js (boon ${pBoon}, heal to ${pHealTo})`);
  ok(/types\[0\] === types\[1\] && types\[0\] !== 'boon'/.test(rooms),
    'and the rule that a duplicate pair becomes a boon is still there');

  const roll = () => {
    const r = Math.random();
    return r < pBoon ? 'boon' : r < pHealTo ? 'heal' : 'gold';
  };

  // Count the chambers where a boon is actually ON OFFER. Not taken - taken
  // depends on the player, and nobody has measured that (the journal still
  // lists "measure a full 29-chamber run with real boons" as an open task, so
  // any figure for boons-taken would be invented).
  const offersOver = (chambers, first, gap) => {
    let n = 0;
    for (let d = 1; d <= chambers; d++) {
      const boss = d >= first && (d - first) % gap === 0;
      if (d === chambers) continue;               // the last door is the way out
      if (boss) { n++; continue; }                // a guardian always pays a boon
      const a = roll();
      let b = roll();
      if (a === b && a !== 'boon') b = 'boon';
      if (a === 'boon' || b === 'boon') n++;
    }
    return n;
  };
  const mean = (c, f, g) => {
    let t = 0;
    for (let i = 0; i < 20000; i++) t += offersOver(c, f, g);
    return t / 20000;
  };

  // THE REFERENCE IS THE OLD RUN, not a remembered number. 29 chambers, a
  // guardian every 2nd, all fourteen - the shape the combat was actually
  // balanced in play against, and the one the owner has called fine.
  const OLD = mean(29, 3, 2);
  const NOW = mean(A.FINAL_CHAMBER, 3, A.CHAMBERS_PER_ACT / A.GUARDIANS_PER_ACT);
  const drift = (NOW / OLD - 1) * 100;

  console.log(`         old run   29 chambers, 14 guardians : ${OLD.toFixed(1)} boon offers`);
  console.log(`         journey   ${A.FINAL_CHAMBER} chambers, ${A.ACT_COUNT * A.GUARDIANS_PER_ACT} guardians : ${NOW.toFixed(1)} boon offers`);
  console.log(`         drift     ${drift >= 0 ? '+' : ''}${drift.toFixed(0)}% over the same eff 1-8 span`);

  // A LOCKED BASELINE, not a guessed band.
  //
  // The journey is longer than the old run but spans the same difficulty
  // curve, so the player arrives at the end holding more. That is a real
  // balance question and it belongs to the owner's balance pass - it is not
  // something this file should decide by quietly moving a number.
  //
  // What this file CAN do is make sure the figure never moves again without
  // somebody noticing, which is precisely what did not happen to the ladder.
  // So: the current value is recorded, and any change to the act shape or the
  // door odds that shifts it fails here until BASELINE is updated on purpose.
  const BASELINE = 33.1;
  ok(Math.abs(NOW - BASELINE) <= BASELINE * 0.1,
    `boon offers are still ${BASELINE} +/- 10% (got ${NOW.toFixed(1)}) - if you changed the`
    + ' act shape or the door odds on purpose, update BASELINE in this file');

  ok(NOW / A.ACT_COUNT >= 5,
    `about ${(NOW / A.ACT_COUNT).toFixed(1)} boons an act, which is a build worth carrying`);

  if (drift > 10) {
    console.log('');
    console.log(`  NOTE   the journey offers ${drift.toFixed(0)}% more boons than the shape the`);
    console.log('         combat was balanced against, because it is 36 chambers over the');
    console.log('         same eff 1-8 curve instead of 29. The player therefore reaches');
    console.log('         the last act stronger than the old run assumed. This is the');
    console.log('         number the balance pass needs; it is surfaced, not hidden.');
  }
}

console.log('');
console.log(bad
  ? `${bad} thing(s) wrong - the journey and the combat disagree`
  : 'three acts, twelve guardians, and a power curve the enemies can live with');
process.exit(bad ? 1 : 0);
