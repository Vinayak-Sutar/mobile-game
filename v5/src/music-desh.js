// "Mor Chowk" - Solenne the Hundred-Eyed's theme, in Raag Desh.
//
// The raga's grammar, followed here:
//   - Khamaj thaat. Sa is D (midi 62).
//   - Audav-sampurna: five notes going up (Ni Sa Re Ma Pa Ni Sa - no Ga, no
//     Dha) and all seven coming down (Sa ni Dha Pa, Dha Ma Ga Re, Ga Ni Sa).
//   - Shuddha Ni in the ascent, komal ni in the descent.
//   - Re is the vadi (the centre of gravity, a resting note) and Pa the
//     samvadi; the Re-Pa pull runs through every phrase.
//   - The signature gesture: a meend from Ma sliding down to Re, grazing Ga
//     on the way (D -> M -> G -> R, P M G R).
//   - Pakad: Re, Ma Pa Ni, Sa Re ni Dha Pa, Ma Ga Re.
// The phrases themselves were composed for this game.
//
// The ensemble, like a small Hindustani recital:
//   - TANPURA drone: Pa, Sa, Sa, low Sa, round and round, buzzing.
//   - BANSURI (bamboo flute) with the melody, with kan (grace notes from
//     above) and meend (glides).
//   - TABLA playing teentaal: 16 beats, dha dhin dhin dha | dha dhin dhin dha
//     | dha tin tin ta (the khali, no bass drum) | ta dhin dhin dha.
//   - SWARMANDAL: a sweep of plucked strings up the raga at every new phase.
//   - SANTOOR tremolo while she spreads her tail (the Display).
//
// Like a real performance, the laya (tempo) quickens as it goes on: her
// three phases play slow, medium and fast. In the fast phase the flute runs
// taans up the aroha and down the avaroha, and every cycle closes with a
// TIHAI - a phrase played three times so the last note lands exactly on sam,
// the first beat of the next cycle.

import { voice, midi } from './music-kit.js';

const SA = 62;
const SW = { 'N.': -1, S: 0, R: 2, G: 4, M: 5, P: 7, D: 9, n: 10, N: 11, "S'": 12, "R'": 14, "G'": 16, "M'": 17 };
const note = (sw) => SA + SW[sw];

// Four cycles of teentaal, as [swar, matras, options]. Each sums to 16.
const CYCLES = [
  // The pakad, opened out: Re, Ma Pa Ni Sa', Re' ni Dha Pa.
  [['R', 2], ['M', 1], ['P', 1], ['N', 1], ["S'", 3], ["R'", 1], ['n', 1], ['D', 1], ['P', 5]],
  // Down through Dha to the meend Ma -> (Ga) -> Re, then home by Ga Ni Sa.
  [['M', 1], ['P', 1], ['D', 1], ['M', 2, { meend: 'R' }], ['R', 3], ['G', 1], ['N.', 1], ['S', 6]],
  // Up into the upper octave, the same meend there, back down to Pa.
  [['M', 1], ['P', 1], ['N', 2], ["S'", 2], ["S'", 1], ["R'", 1], ["M'", 2, { meend: "R'" }], ["R'", 2], ["S'", 1], ['n', 1], ['D', 1], ['P', 1]],
  // Re and Pa answering each other, and the cadence home.
  [['P', 1], ['D', 1], ['M', 2, { meend: 'R' }], ['R', 2], ['P', 2], ['M', 1], ['G', 1], ['R', 2], ['G', 1], ['N.', 1], ['S', 2]],
];

// Fast taans: up the aroha, down the avaroha (half a matra per note).
const TAAN_UP = ['N.', 'S', 'R', 'M', 'P', 'N', "S'", "R'"];
const TAAN_DOWN = ["S'", 'n', 'D', 'P', 'M', 'G', 'R', 'S'];
const TIHAI = ['P', 'M', 'G', 'R'];

// Teentaal's theka, one bol per matra.
const THEKA = ['dha', 'dhin', 'dhin', 'dha', 'dha', 'dhin', 'dhin', 'dha', 'dha', 'tin', 'tin', 'ta', 'ta', 'dhin', 'dhin', 'dha'];
const TANPURA = [SA - 5, SA, SA, SA - 12];

/** Turn a cycle into note events, in half-matra steps. */
function events(cycle) {
  const out = [];
  let at = 0;
  for (const [sw, matras, opt] of cycle) {
    out.push({ at, sw, steps: matras * 2, opt: opt || {} });
    at += matras * 2;
  }
  return out;
}
const MELODY = CYCLES.map(events);

// --- the instruments ----------------------------------------------------------------

/** The bansuri: breathy, graced from above, gliding where the raga glides. */
function flute(k, sw, dur, t, opt = {}, vol = 0.07) {
  const m = note(sw);
  const o = { m, at: t, dur, vol, type: 'sine', attack: 0.04, release: 0.16, vib: 0.005, vibRate: 5.2, vibDelay: 0.3 };
  // Kan: Re is touched from Ga, the upper Sa from Re - the raga's colours.
  if (sw === 'R' && dur > 0.4) { o.kan = note('G'); o.kanTime = 0.06; }
  if (sw === "S'" && dur > 0.4) { o.kan = note("R'"); o.kanTime = 0.05; }
  if (opt.meend) { o.glideTo = note(opt.meend); o.glideFrom = 0.3; }
  voice(k, o);
  voice(k, { ...o, type: 'triangle', vol: vol * 0.25, vib: 0 });
  // Breath.
  k.noise({ dur: Math.min(dur, 0.35), vol: 0.01, freq: 1800, type: 'bandpass', q: 1.5, at: t, out: k.bus });
}

/** A tanpura string: a buzzing pluck that rings for seconds. */
function tanpura(k, m, t) {
  voice(k, { m, at: t, dur: 3.2, vol: 0.022, type: 'sawtooth', attack: 0.02, sustain: false, filter: [1400, 700, 3], q: 2 });
  voice(k, { m, at: t, dur: 3.0, vol: 0.03, type: 'sine', attack: 0.03, sustain: false });
}

/** The tabla. Dayan (right, tuned to Sa) rings; bayan (left) booms and bends. */
function tabla(k, bol, t, accent) {
  const f = midi(SA);
  const dayan = (ring, v) => {
    k.tone({ freq: f, type: 'sine', dur: ring, vol: v, attack: 0.002, at: t, out: k.bus });
    k.tone({ freq: f * 2.02, type: 'sine', dur: ring * 0.5, vol: v * 0.35, attack: 0.002, at: t, out: k.bus });
    k.noise({ dur: 0.02, vol: v * 0.6, freq: 3200, type: 'bandpass', q: 1.2, at: t, out: k.bus });
  };
  const bayan = (v) => {
    k.tone({ freq: 92, freq2: 132, type: 'sine', dur: 0.45, vol: v, attack: 0.004, at: t, out: k.bus });
    k.tone({ freq: 184, freq2: 250, type: 'triangle', dur: 0.25, vol: v * 0.35, attack: 0.004, at: t, out: k.bus });
  };
  const v = accent ? 1.35 : 1;
  switch (bol) {
    case 'dha': dayan(0.28, 0.07 * v); bayan(0.2 * v); break;
    case 'dhin': dayan(0.5, 0.06 * v); bayan(0.16 * v); break;
    case 'tin': dayan(0.18, 0.05 * v); break;
    case 'ta': dayan(0.14, 0.065 * v); break;
    default: dayan(0.08, 0.035); break;          // a light filler stroke
  }
}

/** A sweep of plucked strings up the raga: the swarmandal. */
function swarmandal(k, t) {
  const up = ['N.', 'S', 'R', 'M', 'P', 'N', "S'", "R'", "M'"];
  up.forEach((sw, i) => {
    voice(k, { m: note(sw) + 12, at: t + i * 0.035, dur: 1.4, vol: 0.03, type: 'triangle', attack: 0.002, sustain: false });
  });
}

function santoor(k, sw, t) {
  voice(k, { m: note(sw) + 12, at: t, dur: 0.4, vol: 0.028, type: 'triangle', attack: 0.002, sustain: false, filter: [4000, 1500], q: 1 });
}

// --- the piece --------------------------------------------------------------------------

const mem = { phase: 0, lastN: -1 };

export const DESH_THEME = {
  // One step is half a matra: slow, medium and fast laya for her three phases.
  tempo(k) {
    const ph = k.boss ? k.boss.phase || 1 : 1;
    const matra = ph >= 3 ? 0.32 : ph >= 2 ? 0.4 : 0.5;
    return 60 / (matra / 2) / 4;
  },

  step(n, t, k) {
    const e = k.boss;
    if (n < mem.lastN) mem.phase = 0;
    mem.lastN = n;
    const ph = e ? e.phase || 1 : 1;
    const step = 60 / this.tempo(k) / 4;
    const s = n % 32;                        // 16 matras = 32 half-matra steps
    const cycle = Math.floor(n / 32);

    // A new phase opens with a sweep of the swarmandal.
    if (ph !== mem.phase) { mem.phase = ph; swarmandal(k, t); }

    // Tanpura: one string per matra, round and round.
    if (s % 2 === 0) tanpura(k, TANPURA[(s / 2) % 4], t);

    // Tabla: the theka on every matra; fast laya adds filler strokes between.
    if (s % 2 === 0) tabla(k, THEKA[s / 2], t, s === 0);
    else if (ph >= 3 && (s === 3 || s === 7 || s === 23 || s === 27)) tabla(k, 'tirakita', t, false);

    // Her Display: the santoor trembles between Sa and Pa.
    if (e && e.action === 'display' && e.sub === 'fire') santoor(k, s % 2 ? 'P' : "S'", t);

    // --- the melody ------------------------------------------------------------
    if (ph >= 3 && cycle % 2 === 1) {
      // Taans and a tihai, landing on sam.
      if (s < 8) flute(k, TAAN_UP[s], step * 0.95, t, {}, 0.06);
      else if (s < 16) flute(k, TAAN_DOWN[s - 8], step * 0.95, t, {}, 0.06);
      else if (s >= 18) {
        const k2 = s - 18;                     // three phrases of four, one rest between
        const slot = k2 % 5;
        if (slot < 4) flute(k, TIHAI[slot], step * 0.95, t, {}, 0.065);
      }
      return;
    }
    // The tihai's last note: Sa, on sam - it takes the place of the phrase's first.
    const landing = ph >= 3 && cycle > 0 && s === 0;
    if (landing) flute(k, 'S', step * 4, t, {}, 0.075);

    // In fast laya only every other cycle is a composed phrase; walk them all.
    const idx = ph >= 3 ? Math.floor(cycle / 2) : cycle;
    const phrase = MELODY[idx % MELODY.length];
    for (const ev of phrase) {
      if (ev.at !== s || (landing && s === 0)) continue;
      flute(k, ev.sw, ev.steps * step, t, ev.opt);
    }
  },
};
