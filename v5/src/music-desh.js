// "Mor Chowk" - Solenne the Hundred-Eyed's theme, in Raag Desh. A night
// piece: soft, slow, in the background.
//
// The owner's brief after the second try: soothing, never harsh, the melody
// behind the fight rather than on top of it. So there is no percussion, no
// buzzing strings and no sharp attacks; every voice swells in and fades out,
// and all of it passes through one warm, muffled room.
//
// The raga's grammar, followed here:
//   - Khamaj thaat. Sa is D (midi 62).
//   - Audav-sampurna: five notes going up (Ni Sa Re Ma Pa Ni Sa - no Ga, no
//     Dha) and all seven coming down (Sa ni Dha Pa, Dha Ma Ga Re, Ga Ni Sa).
//   - Shuddha Ni in the ascent, komal ni in the descent.
//   - Re is the vadi (the centre of gravity, a resting note) and Pa the
//     samvadi; the Re-Pa pull runs through every phrase.
//   - The signature gesture: a meend from Ma sliding down to Re, grazing Ga
//     on the way.
//   - Pakad: Re, Ma Pa Ni, Sa Re ni Dha Pa, Ma Ga Re.
// The phrases themselves were composed for this game.
//
// The ensemble:
//   - A DRONE like a harmonium or shruti box: Sa and Pa, breathing slowly in
//     and out, always there underneath.
//   - A soft BANSURI (bamboo flute) with the melody - rounded tone, a slow
//     swell into each note, a light grace note and the Ma -> Re glide - played
//     with space between the phrases.
//   - A SANTOOR struck with felt: gentle ripples of the raga's notes under
//     the flute, like water in the courtyard's channels.
//
// Her phases change the texture, not the calm: the first is flute and drone
// with rests, the second adds the santoor ripple, the third a little more
// motion and a slightly quicker pulse - never a rush.

import { voice } from './music-kit.js';
import { softPluck, roomIn, prewarm, warmSoft } from './music-samples.js';

const SA = 62;
const SW = { 'N.': -1, S: 0, R: 2, G: 4, M: 5, P: 7, D: 9, n: 10, N: 11, "S'": 12, "R'": 14, "G'": 16, "M'": 17 };
const note = (sw) => SA + SW[sw];

// Four phrases of sixteen beats, as [swar, beats, options].
const CYCLES = [
  // The pakad, opened out: Re, Ma Pa Ni Sa', Re' ni Dha Pa.
  [['R', 2], ['M', 1], ['P', 1], ['N', 1], ["S'", 3], ["R'", 1], ['n', 1], ['D', 1], ['P', 5]],
  // Down through Dha to the meend Ma -> (Ga) -> Re, then home by Ga Ni Sa.
  [['M', 1], ['P', 1], ['D', 1], ['M', 2, { meend: 'R' }], ['R', 3], ['G', 1], ['N.', 1], ['S', 6]],
  // Up to the high Sa and back down to Pa.
  [['M', 1], ['P', 1], ['N', 2], ["S'", 3], ["R'", 1], ["S'", 2], ['n', 1], ['D', 1], ['P', 4]],
  // Re and Pa answering each other, and the cadence home.
  [['P', 1], ['D', 1], ['M', 2, { meend: 'R' }], ['R', 2], ['P', 2], ['M', 1], ['G', 1], ['R', 2], ['G', 1], ['N.', 1], ['S', 2]],
];

// The santoor's ripples: gentle figures on the drone's notes and the raga's.
const RIPPLES = [
  ['S', 'P', "S'", 'P', 'R', 'P', "S'", 'P'],
  ["S'", 'n', 'D', 'P', 'M', 'P', 'R', 'P'],
  ['S', 'R', 'M', 'P', 'N', "S'", 'P', 'M'],
  ['P', 'M', 'G', 'R', 'S', 'R', 'P', "S'"],
];

function events(cycle) {
  const out = [];
  let at = 0;
  for (const [sw, beats, opt] of cycle) {
    out.push({ at, sw, steps: beats * 2, opt: opt || {} });
    at += beats * 2;
  }
  return out;
}
const MELODY = CYCLES.map(events);

const WARMUP = ['S', 'R', 'M', 'P', 'N', "S'", 'n', 'D', 'G', "R'"].map((sw) => warmSoft(note(sw)));

/** The flute: a soft, round tone that swells in, with a breath of air. */
function flute(k, sw, dur, t, opt = {}) {
  const out = roomIn(k);
  if (!out) return;
  const m = note(sw);
  const o = {
    m, at: t, dur: dur + 0.25, vol: 0.042, type: 'sine', attack: 0.16, release: 0.4,
    vib: 0.0035, vibRate: 4.6, vibDelay: 0.45, filter: [1900], q: 0.5, out,
  };
  if (sw === 'R' && dur > 0.7) { o.kan = note('G'); o.kanTime = 0.09; }
  if (opt.meend) { o.glideTo = note(opt.meend); o.glideFrom = 0.35; }
  voice(k, o);
  voice(k, { ...o, type: 'triangle', vol: 0.008, vib: 0, filter: [1200] });
  k.noise({ dur: 0.25, vol: 0.004, freq: 1100, type: 'bandpass', q: 0.8, at: t, out });
}

/** The drone: Sa and Pa like a harmonium's reeds, breathing in and out. */
function drone(k, t, len) {
  const out = roomIn(k);
  if (!out) return;
  for (const [m, v] of [[SA - 12, 0.03], [SA - 5, 0.018], [SA, 0.014]]) {
    voice(k, { m, at: t, dur: len + 2.6, vol: v, type: 'triangle', attack: 2.4, release: 2.6, filter: [850], q: 0.4, out });
  }
}

function ripple(k, list, t, gap, vol) {
  list.forEach((sw, i) => softPluck(k, note(sw) + 12, t + i * gap, vol));
}

// --- the piece ---------------------------------------------------------------------

const mem = { phase: 0, lastN: -1, display: false };

export const DESH_THEME = {
  // One step is half a beat; the beat eases from 0.62 s to 0.5 s over her phases.
  tempo(k) {
    const ph = k.boss ? k.boss.phase || 1 : 1;
    const beat = ph >= 3 ? 0.5 : ph >= 2 ? 0.56 : 0.62;
    return 60 / (beat / 2) / 4;
  },

  step(n, t, k) {
    const e = k.boss;
    if (n < mem.lastN) { mem.phase = 0; mem.display = false; }
    mem.lastN = n;
    prewarm(k, WARMUP);
    const ph = e ? e.phase || 1 : 1;
    const step = 60 / this.tempo(k) / 4;
    const s = n % 32;
    const cycle = Math.floor(n / 32);

    // The drone, renewed every eight beats, the old one fading as the new swells.
    if (s % 16 === 0) drone(k, t, step * 16);

    // A new phase, or her tail spreading: a slow, soft run up the santoor.
    const display = !!e && e.action === 'display';
    if (ph !== mem.phase || (display && !mem.display)) {
      ripple(k, ['S', 'R', 'M', 'P', 'N', "S'"], t, 0.11, 0.022);
    }
    mem.phase = ph;
    mem.display = display;

    // The santoor's ripple, from the second phase: every other beat, then every beat.
    const rippleEvery = ph >= 3 ? 2 : ph >= 2 ? 4 : 0;
    if (rippleEvery && s % rippleEvery === 0) {
      const fig = RIPPLES[cycle % RIPPLES.length];
      softPluck(k, note(fig[(s / rippleEvery) % fig.length]) + 12, t, 0.02);
    }

    // The flute. In the first phase every other cycle rests: space is the point.
    if (ph === 1 && cycle % 2 === 1) return;
    const idx = ph === 1 ? Math.floor(cycle / 2) : cycle;
    for (const ev of MELODY[idx % MELODY.length]) {
      if (ev.at === s) flute(k, ev.sw, ev.steps * step, t, ev.opt);
    }
  },
};
