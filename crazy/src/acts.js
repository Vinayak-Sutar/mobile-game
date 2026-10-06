// A JOURNEY, IN THREE ACTS.
//
// The run used to be one unbroken climb: 29 chambers, all fourteen guardians,
// about 25 minutes, win or lose the lot. That is a bad shape for a browser
// game. Nobody sits down to a 25-minute commitment they cannot put down, and
// a death at chamber 27 costs an evening.
//
// So a journey is three acts of twelve chambers, four guardians each:
//
//   ACT 1   chambers  1-12,  guardians at  3,  6,  9, 12   from the EASY group
//   ACT 2   chambers 13-24,  guardians at 15, 18, 21, 24   from the MIDDLE group
//   ACT 3   chambers 25-36,  guardians at 27, 30, 33, 36   from the HARD group
//
// Twelve chambers is about ten minutes at the measured pace of ~0.86 minutes a
// chamber, which is exactly the session length the platform ranks on. An act is
// a sitting. A journey is three of them, and the build carries across - which
// is what makes act 2 a test of the build rather than a repeat of act 1.
//
// DEPTH DOES NOT RESET between acts. It runs 1 to 36 straight through, because
// enemy scaling is a function of depth (rooms.js effDepth) and the player's
// power never resets either. An act is a boundary, not a fresh start.
//
// WHY TWELVE GUARDIANS AND NOT FOURTEEN. Four from each group, drawn at random,
// out of 4 + 5 + 5. So you fight twelve of the fourteen and two journeys are
// never the same. The easy group has only four, so all four always appear in
// act 1 - which is the one act where a fixed cast is least of a loss, since
// almost nobody sees act 1 twice before they have seen acts 2 and 3 once.

import { BOSS_POOL } from './boss-pool.js';

export const ACT_COUNT = 3;
export const CHAMBERS_PER_ACT = 12;
export const GUARDIANS_PER_ACT = 4;

/**
 * The three groups, easiest first.
 *
 * GROUPED ON EVIDENCE, NOT FEEL, because nothing in the code had an opinion
 * about which guardian is hard - the old run shuffled all fourteen and let
 * bossSlot scaling flatten the difference. Two measurable signals agreed:
 *
 *   where it lives   The five in `easy` are the original guardians, defined
 *                    inline in bosses.js with no file of their own. The eight
 *                    in `middle` and `hard` each have a dedicated file with
 *                    10 to 17 named moves. That is a real complexity gap.
 *   threat           base hp x base damage. The easy five run 12.5k-26.4k;
 *                    the hard four run 25.5k-34.2k and top out at Mau.
 *
 * This is a first pass and it is MEANT to be edited. Moving a guardian between
 * groups is one line here and changes nothing else, which is the point: the
 * ladder died because a balance assumption was buried in code nobody reread.
 */
/**
 * Each guardian's own weight, as base hp x base damage, read out of
 * bosses.js and enemies.js. Thousands, rounded.
 *
 * It exists so an act can open on its gentlest guardian. Difficulty inside an
 * act was already a smooth 5-8% a fight, but the act BOUNDARIES cliffed - 19%
 * into act 2 and 35% into act 3 - because the group's base difficulty stepped
 * up at the same moment slot scaling kept climbing, and a random draw could
 * put the group's hardest guardian first. A 35% spike landing immediately
 * after the screen that invites you to stop is the worst possible place for
 * one.
 *
 * Measured, not guessed, and the measurement is worth redoing whenever a
 * guardian's numbers change.
 */
export const THREAT = {
  peacock: 18.0, croc: 22.0, turtle: 22.5, gorilla: 26.4,
  aldric: 22.1, warden: 22.5, bride: 22.5, monkey: 23.4, vesper: 23.8,
  naga: 25.5, maestro: 28.0, anansi: 28.5,
  // THE TWIN WARDENS ARE TWO BOSSES. Solaris alone is 780 hp and the gentlest
  // thing in the game, which is how they ended up leading the easy group - the
  // first scoring counted Solaris and forgot Grumm's 1050 entirely. Together
  // they are 32.4, second only to Mau, and they transform in phase 2 on top of
  // that. An act-1 opener they are not.
  solaris: 32.4,
  mau: 34.2,
};

export const GROUPS = [
  {
    id: 'easy',
    name: 'The Outer Ash',
    // The simple ones: no dedicated boss file, one creature, no phase change.
    bosses: ['peacock', 'croc', 'turtle', 'gorilla'],
  },
  {
    id: 'middle',
    name: 'The Deep Ash',
    // The Warden has two phase breaks; the other three run 11-17 moves each.
    bosses: ['warden', 'aldric', 'bride', 'monkey', 'vesper'],
  },
  {
    id: 'hard',
    name: 'The Last Ash',
    // The heaviest, including the Twin Wardens - a duo with two phase-two
    // transformations, which is not an act-1 fight whatever Solaris weighs
    // on his own.
    bosses: ['naga', 'maestro', 'anansi', 'mau', 'solaris'],
  },
];

/** Chambers 1-36. The last chamber of the last act ends the journey. */
export const FINAL_CHAMBER = ACT_COUNT * CHAMBERS_PER_ACT;

/** Which act a chamber belongs to: 1, 2 or 3. */
export const actOf = (depth) =>
  Math.min(ACT_COUNT, Math.max(1, Math.ceil(depth / CHAMBERS_PER_ACT)));

/** The last chamber of an act - always a guardian. */
export const actEndDepth = (act) => act * CHAMBERS_PER_ACT;

/** The first chamber of an act. */
export const actStartDepth = (act) => (act - 1) * CHAMBERS_PER_ACT + 1;

/** Is this chamber the one that closes an act? */
export const isActEnd = (depth) => depth > 0 && depth % CHAMBERS_PER_ACT === 0;

/** Is this the chamber that ends the whole journey? */
export const isJourneyEnd = (depth) => depth >= FINAL_CHAMBER;

function shuffled(a) {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The twelve guardians of one journey, in the order they will be met.
 *
 * Four from each group, in group order, so difficulty rises across the journey
 * no matter which four come out. The result slots straight into
 * `world.bossOrder`, which rooms.js already indexes by guardian number - so
 * acts needed no new boss-selection machinery at all.
 */
export function drawJourney() {
  const out = [];
  for (const g of GROUPS) {
    // WHICH four is random; the ORDER they come in is not. Each act opens on
    // its gentlest guardian and closes on its hardest, so the step up at an
    // act boundary is cushioned instead of being whatever the shuffle dealt.
    const four = shuffled(g.bosses).slice(0, GUARDIANS_PER_ACT);
    four.sort((a, b) => (THREAT[a] || 0) - (THREAT[b] || 0));
    out.push(...four);
  }
  return out;
}

/** The four guardians of one act, out of a journey's twelve. */
export function actGuardians(journey, act) {
  const i = (act - 1) * GUARDIANS_PER_ACT;
  return (journey || []).slice(i, i + GUARDIANS_PER_ACT);
}

/** Every guardian that can be drawn - for the checker, and for a bestiary. */
export const ALL_GROUPED = GROUPS.flatMap((g) => g.bosses);

/** Guardians in the pool that no group claims. Should always be empty. */
export const UNGROUPED = BOSS_POOL.filter((b) => !ALL_GROUPED.includes(b));
