// THE LEVELS, as data.
//
// This version is aimed at CrazyGames, and that platform judges a game on
// three numbers before it will promote it:
//
//   conversion      80%+ of players still playing after one minute
//   play time       10+ minutes in a single session
//   D1 retention    10-15% come back the next day
//
// Every decision in this file is in service of one of those.
//
// CONVERSION is won or lost in the first sixty seconds, so levels 1-3 are
// tiny, teach one thing each, and cannot be lost. The platform's own guidance
// is explicit: put the tutorial IN the gameplay, keep it visual, and never
// make someone read.
//
// PLAY TIME means a session has to be several levels long, so a level is one
// to three chambers - a minute or two - and the choice of a boon between them
// is the hook that makes the next one worth starting.
//
// D1 RETENTION needs a reason to come back, which is what the stars are for:
// every level can be cleared, cleared without being hit, and cleared under
// par. Nobody three-stars a level on the first try.
//
// A CHAPTER is six levels ending in a guardian. Boons last a chapter and then
// reset - long enough to build something, short enough that the power curve
// never runs away from the content the way the open-ended run's does.

import { BOSS_POOL } from './boss-pool.js';

/** Levels per chapter, and the guardian is always the last of them. */
export const CHAPTER_LEN = 6;

/**
 * One level.
 *
 *   id        stable, and the key progress is stored under - never renumber
 *   name      shown on the card and on the way in
 *   chambers  how many fights, back to back
 *   power     difficulty, fed to the existing wave budget as `eff`. Level 1
 *             is 1 and the last is about 7, matching the range the chamber
 *             run already spans and is already balanced against.
 *   boss      a guardian instead of waves
 *   teach     a thing to show the player, once, in gameplay (tutorial.js)
 *   par       seconds for the third star
 */
const L = (id, name, o = {}) => ({
  id, name, chambers: 1, power: 1, boss: null, teach: null, par: 60, ...o,
});

export const LEVELS = [
  // --- chapter 1: the first minute, which decides everything --------------
  L(1, 'The First Door', { power: 0.6, par: 35, teach: 'move' }),
  L(2, 'Two of Them', { power: 1.0, par: 40, teach: 'attack' }),
  L(3, 'Out of the Way', { power: 1.4, par: 45, teach: 'dash' }),
  L(4, 'The Long Hall', { chambers: 2, power: 1.8, par: 75 }),
  L(5, 'Press On', { chambers: 2, power: 2.2, par: 85, teach: 'spell' }),
  L(6, 'The First Guardian', { boss: 0, par: 90 }),

  // --- chapter 2 -----------------------------------------------------------
  L(7, 'Deeper', { chambers: 2, power: 2.6, par: 80 }),
  L(8, 'The Narrow Way', { chambers: 2, power: 3.0, par: 85 }),
  L(9, 'Three Rooms', { chambers: 3, power: 3.2, par: 115 }),
  L(10, 'No Quarter', { chambers: 2, power: 3.6, par: 90 }),
  L(11, 'The Gauntlet', { chambers: 3, power: 3.9, par: 120 }),
  L(12, 'The Second Guardian', { boss: 1, par: 95 }),

  // --- chapter 3 -----------------------------------------------------------
  L(13, 'The Falling Ash', { chambers: 2, power: 4.2, par: 85 }),
  L(14, 'The Burning Stair', { chambers: 3, power: 4.5, par: 120 }),
  L(15, 'Hold the Line', { chambers: 2, power: 4.8, par: 90 }),
  L(16, 'The Crush', { chambers: 3, power: 5.1, par: 125 }),
  L(17, 'Nowhere Left', { chambers: 3, power: 5.4, par: 130 }),
  L(18, 'The Third Guardian', { boss: 2, par: 100 }),

  // --- chapter 4 -----------------------------------------------------------
  L(19, 'The Last Road', { chambers: 3, power: 5.7, par: 125 }),
  L(20, 'Everything at Once', { chambers: 3, power: 6.0, par: 130 }),
  L(21, 'The Iron Hall', { chambers: 3, power: 6.3, par: 135 }),
  L(22, 'No Way Back', { chambers: 3, power: 6.6, par: 140 }),
  L(23, 'The Threshold', { chambers: 3, power: 7.0, par: 145 }),
  L(24, 'The Last Guardian', { boss: 3, par: 120 }),
];

export const LEVEL_COUNT = LEVELS.length;
export const CHAPTERS = Math.ceil(LEVEL_COUNT / CHAPTER_LEN);

export const levelById = (id) => LEVELS.find((l) => l.id === id) || null;

/** 1-based chapter a level belongs to. */
export const chapterOf = (id) => Math.ceil(id / CHAPTER_LEN);

/** The first level of a chapter, where its boons start fresh. */
export const chapterStart = (ch) => (ch - 1) * CHAPTER_LEN + 1;

/**
 * Which guardian a boss level fights.
 *
 * Four of the fourteen, spread across the pool so the four you meet are not
 * the four every other player meets - the order is shuffled per save, not per
 * level, so a given player's game is consistent but two players compare notes
 * and find different bosses. That costs nothing and is worth a surprising
 * amount of replay talk.
 */
export function bossFor(level, order) {
  if (level.boss === null) return null;
  const pool = order && order.length ? order : BOSS_POOL;
  return pool[level.boss % pool.length];
}

/**
 * The three stars.
 *
 * Clearing is one. The other two are the replay: nobody takes no damage on a
 * first attempt, and nobody beats par while still learning the room. They are
 * the cheapest replayability there is, and the whole reason to come back to a
 * level that is already green.
 */
export function starsFor(level, { won, hit, seconds }) {
  if (!won) return 0;
  return 1 + (hit ? 0 : 1) + (seconds <= level.par ? 1 : 0);
}

export const STAR_NAMES = ['cleared', 'untouched', `under par`];
