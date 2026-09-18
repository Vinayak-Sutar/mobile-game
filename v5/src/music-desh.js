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
// The ensemble, modelled rather than faked (music-samples.js):
//   - SITAR on the melody: a buzzing plucked string (the jawari bridge), its
//     sympathetic strings answering, kan grace notes and meend pulls done by
//     bending the sounding string - no new stroke - as a sitarist does. The
//     chikari drone strings are struck between phrases for rhythm, and in the
//     fast phase they drive the jhala.
//   - TABLA in teentaal: modelled strokes (na, tin, ti, ra, ge, ka) combined
//     into bols, the left drum's pitch sliding up under the palm, a little
//     human in timing and weight. The khali (beats 9-12) drops the bass drum,
//     and fills (tirakita) grow denser as the tempo rises.
//   - TANPURA drone, buzzing: Pa, Sa, Sa, low Sa, round and round.
//   - SWARMANDAL sweep up the raga at every new phase; SANTOOR tremolo while
//     she spreads her tail.
//   - All in one small room (a synthesised reverb).
//
// Like a real performance, the laya (tempo) quickens with her three phases.
// In the fast phase every other cycle is taans - runs up the aroha, down the
// avaroha - closing with a TIHAI whose last note lands exactly on sam.

import {
  sitar, chikari, tanpura, tabla, swarmandal, santoor, prewarm, warmSitar, warmStroke,
} from './music-samples.js';

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
const SWEEP = ['N.', 'S', 'R', 'M', 'P', 'N', "S'", "R'", "M'"].map((sw) => note(sw) + 12);

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

// Everything the piece will need, rendered ahead one piece per step.
const WARMUP = [
  ...['na', 'tin', 'ge1', 'ge0', 'ge2', 'ti', 'ra', 'ka'].map(warmStroke),
  ...['R', 'M', 'P', 'N', "S'", "R'", 'n', 'D', 'G', 'N.', 'S', "M'"].map((sw) => warmSitar(note(sw))),
];

/** A sitar stroke on a swar, with the raga's ornaments. */
function play(k, sw, dur, t, opt = {}, vol) {
  const m = note(sw);
  const o = { vol };
  // Kan: Re is touched from Ga, the upper Sa from Re - the raga's colours.
  if (sw === 'R' && dur > 0.35) o.kan = note('G');
  if (sw === "S'" && dur > 0.35) o.kan = note("R'");
  if (opt.meend) o.meend = note(opt.meend);
  sitar(k, m, t, dur, o);
}

// --- the piece ------------------------------------------------------------------------

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
    prewarm(k, WARMUP);
    const ph = e ? e.phase || 1 : 1;
    const step = 60 / this.tempo(k) / 4;
    const s = n % 32;                        // 16 matras = 32 half-matra steps
    const cycle = Math.floor(n / 32);

    // A new phase opens with a sweep of the swarmandal.
    if (ph !== mem.phase) { mem.phase = ph; swarmandal(k, SWEEP, t); }

    // Tanpura: one string per matra, round and round.
    if (s % 2 === 0) tanpura(k, TANPURA[(s / 2) % 4], t);

    // Tabla: the theka on every matra; fills between as the tempo rises.
    if (s % 2 === 0) tabla(k, THEKA[s / 2], t, s === 0, step);
    else if (ph >= 2 && s === 31) tabla(k, 'tirakita', t, false, step);        // into sam
    else if (ph >= 3 && (s === 7 || s === 15 || s === 23)) tabla(k, 'tirakita', t, false, step);
    else if (ph >= 3 && s % 4 === 1) tabla(k, 'ge', t, false, step);

    // Her Display: the santoor trembles between Sa and Pa.
    if (e && e.action === 'display' && e.sub === 'fire') santoor(k, note(s % 2 ? 'P' : "S'") + 12, t);

    // --- the melody ----------------------------------------------------------------
    if (ph >= 3 && cycle % 2 === 1) {
      // Taans on the sitar, then a tihai landing on sam; chikari between.
      if (s < 8) play(k, TAAN_UP[s], step, t, {}, 0.12);
      else if (s < 16) play(k, TAAN_DOWN[s - 8], step, t, {}, 0.12);
      else if (s < 18) chikari(k, t, 0.05);
      else {
        const slot = (s - 18) % 5;              // three phrases of four, a rest between
        if (slot < 4) play(k, TIHAI[slot], step, t, {}, 0.13);
        else chikari(k, t, 0.05);
      }
      return;
    }

    // The tihai's last note: Sa, on sam - it takes the place of the phrase's first.
    const landing = ph >= 3 && cycle > 0 && s === 0;
    if (landing) play(k, 'S', step * 4, t, {}, 0.15);

    // In fast laya only every other cycle is a composed phrase; walk them all.
    const idx = ph >= 3 ? Math.floor(cycle / 2) : cycle;
    const phrase = MELODY[idx % MELODY.length];
    let struck = landing;
    for (const ev of phrase) {
      if (ev.at !== s || (landing && s === 0)) continue;
      play(k, ev.sw, ev.steps * step, t, ev.opt);
      struck = true;
    }

    // The chikari fills the space between notes: sparse when slow, a jhala
    // on every free half-beat when fast.
    if (!struck) {
      const every = ph >= 3 ? 1 : ph >= 2 ? 2 : 4;
      if (s % every === every - 1 || (ph >= 3 && s % 2 === 1)) chikari(k, t, ph >= 3 ? 0.04 : 0.035);
    }
  },
};
