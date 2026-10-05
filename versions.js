// EVERY VERSION OF THIS GAME, in one place.
//
// This file exists because the roster used to be a hardcoded block of HTML
// duplicated once per folder - nine copies, no shared source, no detection of
// which folder was running. So each copy froze at whatever the roster was on
// the day that folder was created:
//
//   v1-v4   six entries. They predate crazy/ and v7/, so neither is reachable.
//   anime/  no row at all - one hardcoded link to ../v5/.
//   savi/   labels ITSELF "Version 5", so the real v5/ cannot be reached.
//
// And the repo's front door redirected to v4/, whose row has no Arcade button.
// Whichever way you came in, v5 was the only folder that could see everything,
// which is exactly the bug that was reported.
//
// So: the launcher at ../index.html renders this list, and nothing else keeps
// a roster. Adding a version is one line here. A ninth copy cannot drift
// because there is no ninth copy.
//
// ORDER IS NEWEST-FIRST, because that is what someone opening the page wants.

/**
 * One version.
 *
 *   slug      the folder, and the href. Never renamed - saves are keyed on it.
 *   label     what it is called on the launcher
 *   blurb     one line: what makes this one different
 *   shipping  the build being published. At most one is true.
 *   note      optional aside, for anything parked or experimental
 */
export const VERSIONS = [
  {
    slug: 'crazy',
    label: 'Arcade',
    blurb: 'A roguelike journey in three acts.',
    shipping: true,
    note: 'For CrazyGames. This is the one being published.',
  },
  {
    slug: 'v7',
    label: 'Campaign',
    blurb: 'A hub and missions, for Google Play.',
    note: 'Paused while the Arcade build ships.',
  },
  {
    slug: 'v5',
    label: 'Version 5',
    blurb: 'Enemy variety, minibosses, The Wilds and the dungeons.',
    note: 'The largest build, and where most systems were grown.',
  },
  {
    slug: 'savi',
    label: 'Savi',
    blurb: 'A quieter game: a lantern, a broom, a village.',
  },
  {
    slug: 'anime',
    label: 'Anime',
    blurb: 'An isometric street, drawn in the style of an ED.',
    note: 'An experiment, parked.',
  },
  {
    slug: 'v4',
    label: 'Version 4',
    blurb: 'Spells, and pure action.',
  },
  {
    slug: 'v3',
    label: 'Version 3',
    blurb: 'Spells, elements and traps.',
  },
  {
    slug: 'v2',
    label: 'Version 2',
    blurb: '15 chambers, 5 bosses.',
  },
  {
    slug: 'v1',
    label: 'Version 1',
    blurb: '8 chambers, 1 boss. Where it started.',
  },
];

/** The one being published, or null. */
export const shipping = () => VERSIONS.find((v) => v.shipping) || null;

/** Every slug, for the checker that asserts this list matches what is on disk. */
export const SLUGS = VERSIONS.map((v) => v.slug);
