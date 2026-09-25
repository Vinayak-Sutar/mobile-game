// "Mor Chowk" - Solenne the Hundred-Eyed's theme, in Raag Desh. A warm,
// bright folk tune.
//
// Third brief from the owner: the soft version sounded eerie and ghostly.
// The ghosts were the pure sine flute gliding between notes over a long echo
// and a low drone - the sound of a theremin in an empty hall. So this one is
// the opposite: clear notes with no glides, a fuller flute voice an octave
// higher, a light plucked accompaniment walking Sa and Pa like a folk song,
// a soft pulse underneath, and only a little room.
//
// Still Raag Desh (Khamaj thaat, Sa = D):
//   - up on five notes, Ni Sa Re Ma Pa Ni Sa (no Ga, no Dha), shuddha Ni;
//   - down on all seven, Sa ni Dha Pa, Ma Ga Re, Ga Ni Sa, komal ni;
//   - Re the resting note (vadi), Pa its partner (samvadi);
//   - the pakad, Re Ma Pa Ni Sa, Re ni Dha Pa, Ma Ga Re, in the first phrase.
// It is the raga of Vande Mataram - bright and open when it is sung plainly,
// and that is how it is played here. The phrases were composed for the game.

import { voice } from './music-kit.js';
import { softPluck, roomIn, prewarm, warmSoft } from './music-samples.js';

const SA = 74;          // D5: the flute sings an octave up, where it is brightest
const SW = { 'N.': -1, S: 0, R: 2, G: 4, M: 5, P: 7, D: 9, n: 10, N: 11, "S'": 12, "R'": 14 };
const note = (sw) => SA + SW[sw];

// Four phrases of sixteen beats, as [swar, beats]. Short, singable, dancing.
const CYCLES = [
  // Re, Ma Pa Ni Sa' | Re' ni Dha Pa | Ma Ga Re . | Ga Ni Sa .
  [['R', 1], ['M', 0.5], ['P', 0.5], ['N', 0.5], ["S'", 1.5], ["R'", 1], ['n', 0.5], ['D', 0.5], ['P', 2], ['M', 1], ['G', 1], ['R', 2], ['G', 1], ['N.', 1], ['S', 2]],
  // Sa Re Ma Pa | Pa . Ni Sa' | Sa' ni Dha Pa | Ma Ga Re .
  [['S', 1], ['R', 1], ['M', 1], ['P', 2], ['N', 1], ["S'", 2], ["S'", 0.5], ['n', 0.5], ['D', 1], ['P', 2], ['M', 1], ['G', 1], ['R', 2]],
  // Re Pa . Re | Pa Ma Ga Re | Ni Sa Re Ma | Pa . . .
  [['R', 1], ['P', 2], ['R', 1], ['P', 1], ['M', 1], ['G', 1], ['R', 1], ['N.', 1], ['S', 1], ['R', 1], ['M', 1], ['P', 4]],
  // Ma Pa Ni Sa' | Re' Sa' ni Dha | Pa Ma Ga Re | Ga Ni Sa .
  [['M', 1], ['P', 1], ['N', 1], ["S'", 1], ["R'", 1], ["S'", 1], ['n', 1], ['D', 1], ['P', 1], ['M', 1], ['G', 1], ['R', 1], ['G', 1], ['N.', 1], ['S', 2]],
];

function events(cycle) {
  const out = [];
  let at = 0;
  for (const [sw, beats] of cycle) {
    out.push({ at: Math.round(at * 2), sw, steps: beats * 2 });
    at += beats;
  }
  return out;
}
const MELODY = CYCLES.map(events);

// The accompaniment, walking the drone's notes: Sa Pa Sa' Pa, and a warm Ga
// on the way home.
const WALK = [['S', 'P', "S'", 'P'], ['S', 'P', "S'", 'P'], ["S'", 'P', 'G', 'S'], ['S', 'P', "S'", 'P']];   // Ga only coming down, as the raga allows
const LOW = -12;        // an octave below the flute

const WARMUP = ['S', 'G', 'P', "S'", 'R', 'M', 'N'].map((sw) => warmSoft(note(sw) + LOW));

/** The flute: a warm, reedy-round tone with a clear start and a short vibrato. */
function flute(k, sw, dur, t) {
  const out = roomIn(k);
  if (!out) return;
  const m = note(sw);
  const d = Math.max(0.12, dur * 0.9);           // a breath between notes
  voice(k, { m, at: t, dur: d, vol: 0.03, type: 'triangle', attack: 0.04, release: 0.12, vib: 0.004, vibRate: 5.5, vibDelay: 0.25, filter: [2600], q: 0.5, out });
  voice(k, { m, at: t, dur: d, vol: 0.012, type: 'sine', attack: 0.04, release: 0.12, out });
  voice(k, { m: m + 12, at: t, dur: d, vol: 0.004, type: 'sine', attack: 0.05, release: 0.1, out });
}

/** A soft low pulse, like a hand drum heard from the next courtyard. */
function pulse(k, t, strong) {
  const out = roomIn(k);
  if (!out) return;
  k.tone({ freq: 110, freq2: 80, type: 'sine', dur: 0.22, vol: strong ? 0.08 : 0.05, attack: 0.008, at: t, out });
  k.tone({ freq: 220, freq2: 160, type: 'triangle', dur: 0.12, vol: strong ? 0.025 : 0.015, attack: 0.008, at: t, out });
}

// --- the piece ---------------------------------------------------------------------

const mem = { phase: 0, lastN: -1 };

export const DESH_THEME = {
  // One step is half a beat; a gentle walking pace, a touch quicker each phase.
  tempo(k) {
    const ph = k.boss ? k.boss.phase || 1 : 1;
    const beat = ph >= 3 ? 0.4 : ph >= 2 ? 0.44 : 0.48;
    return 60 / (beat / 2) / 4;
  },

  step(n, t, k) {
    const e = k.boss;
    if (n < mem.lastN) mem.phase = 0;
    mem.lastN = n;
    prewarm(k, WARMUP);
    const ph = e ? e.phase || 1 : 1;
    const step = 60 / this.tempo(k) / 4;
    const s = n % 32;
    const cycle = Math.floor(n / 32);

    // A new phase: a quick bright run up the santoor.
    if (ph !== mem.phase) {
      ['S', 'R', 'M', 'P', 'N', "S'"].forEach((sw, i) => softPluck(k, note(sw), t + i * 0.07, 0.022));
      mem.phase = ph;
    }

    // The accompaniment: one plucked note a beat, walking Sa and Pa.
    if (s % 2 === 0) {
      const walk = WALK[cycle % WALK.length];
      softPluck(k, note(walk[(s / 2) % 4]) + LOW, t, s % 8 === 0 ? 0.034 : 0.026);
    }

    // The pulse: beats one and three, the first a little stronger.
    if (s % 8 === 0) pulse(k, t, true);
    else if (s % 8 === 4) pulse(k, t, false);

    // The flute: the tune, and in the first phase a rest every fourth cycle.
    if (ph === 1 && cycle % 4 === 3) return;
    for (const ev of MELODY[cycle % MELODY.length]) {
      if (ev.at === s) flute(k, ev.sw, ev.steps * step, t);
    }
  },
};
