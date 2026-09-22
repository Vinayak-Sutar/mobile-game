// The Wilds' own music: six pieces, each in a raga, one for each kind of land.
//
// What makes game music different from music written to be listened to
// (researched for this; see the journal, 16.53):
//   - It loops for as long as you stay, so it must never tire the ear. The
//     melody leaves room: a phrase, then space, and whole cycles with only
//     the accompaniment (Breath of the Wild's sparse piano, Minecraft's
//     C418, Journey). Nothing sharp and no fills that shout "the loop ends here".
//   - It is heard under everything else: footsteps, hits, spells. So it keeps
//     to the middle of the range (a phone speaker cannot play the low end),
//     plays softly and never competes with the sound of the fight.
//   - It is adaptive. The same piece gains a layer when a fight starts
//     (vertical layering) - a pulse, a quicker pace, a melody that no longer
//     rests - and sheds it when the fight is over, without starting again.
//   - It carries a place. Each land has its own raga and its own instruments,
//     so you know where you are by ear, and one theme flows into the next
//     with a short fade when you cross a border.
//   - It repeats as little as it can. Four phrases are played in a long order
//     with rests; on every other pass through that order a second instrument
//     takes the tune (re-orchestration), so the loop is long before it is
//     heard the same way twice.
//
// The ragas were chosen for what each is said to carry (its rasa and its
// hour), and their grammar is kept: the notes each allows, going up and
// coming down, the notes it rests on and its signature phrases. The tunes
// themselves were composed for the game. Solenne's theme (music-desh.js)
// taught the rules the owner asked for: warm and clear, no ghostly glides,
// no buzz, no sharp attacks, the tune up where the flute is bright.

import { voice, midi } from './music-kit.js';
import { softPluck, santoor, koto, roomIn, prewarm, warmSoft, warmKoto, warmSantoor } from './music-samples.js';

// Swar -> semitones above Sa. Lower case = komal (flat), M# = tivra Ma.
// A trailing '.' is the octave below, a trailing "'" the octave above.
const SEMI = { S: 0, r: 1, R: 2, g: 3, G: 4, M: 5, 'M#': 6, P: 7, d: 8, D: 9, n: 10, N: 11 };
export function swar(sw) {
  let oct = 0, base = sw;
  while (base.endsWith('.')) { oct -= 12; base = base.slice(0, -1); }
  while (base.endsWith("'")) { oct += 12; base = base.slice(0, -1); }
  if (!(base in SEMI)) throw new Error(`unknown swar ${sw}`);
  return SEMI[base] + oct;
}
const baseOf = (sw) => sw.replace(/[.']/g, '');

// --- instruments -------------------------------------------------------------------

/** Bansuri, as in Mor Chowk: warm, a clear start, a short late vibrato, no glides. */
function flute(k, m, dur, t, vol = 1, o = {}) {
  const out = roomIn(k);
  if (!out) return;
  const d = Math.max(0.12, dur * 0.9);
  voice(k, { m, at: t, dur: d, vol: 0.028 * vol, type: 'triangle', attack: 0.045, release: 0.14, vib: o.vib ?? 0.004, vibRate: o.vibRate ?? 5.5, vibDelay: o.vibDelay ?? 0.28, filter: [o.bright ?? 2500], q: 0.5, out });
  voice(k, { m, at: t, dur: d, vol: 0.011 * vol, type: 'sine', attack: 0.045, release: 0.14, out });
  if (o.reed) voice(k, { m, at: t, dur: d, vol: o.reed * vol, type: 'square', attack: 0.05, release: 0.12, filter: [1500], q: 0.4, out });
  if (o.breath) k.noise({ dur: 0.07, vol: o.breath * vol, freq: midi(m) * 2, type: 'bandpass', q: 2.5, at: t, out });
}

/** A bowed voice like a sarangi, soft: slow bow, a warm filter. `andolan` sways the note slowly. */
function bowed(k, m, dur, t, vol = 1, andolan = false) {
  const out = roomIn(k);
  if (!out) return;
  const d = Math.max(0.2, dur * 0.95);
  const vib = andolan ? { vib: 0.009, vibRate: 1.7, vibDelay: 0.2 } : { vib: 0.005, vibRate: 5, vibDelay: 0.35 };
  voice(k, { m, at: t, dur: d, vol: 0.012 * vol, type: 'sawtooth', attack: 0.16, release: 0.25, filter: [1250], q: 0.6, out, ...vib });
  voice(k, { m, at: t, dur: d, vol: 0.02 * vol, type: 'triangle', attack: 0.14, release: 0.25, out, ...vib });
}

/** A soft low pulse: a hand drum heard across the courtyard. */
function pulse(k, t, strong, pitch = 1) {
  const out = roomIn(k);
  if (!out) return;
  k.tone({ freq: 110 * pitch, freq2: 80 * pitch, type: 'sine', dur: 0.22, vol: strong ? 0.075 : 0.045, attack: 0.008, at: t, out });
  k.tone({ freq: 220 * pitch, freq2: 160 * pitch, type: 'triangle', dur: 0.12, vol: strong ? 0.024 : 0.014, attack: 0.008, at: t, out });
}

/** A light wooden tick: the khartal of Rajasthan, the kane of a shrine. */
function tick(k, t, vol = 0.02, freq = 2200) {
  const out = roomIn(k);
  if (!out) return;
  k.noise({ dur: 0.035, vol, freq, type: 'bandpass', q: 3, at: t, out });
}

/** A temple bell, struck softly: a few inharmonic partials, a long fade. */
function bell(k, m, t, vol = 0.02) {
  const out = roomIn(k);
  if (!out) return;
  const f = midi(m);
  [[1, 1, 3.2], [2.0, 0.5, 2.2], [2.76, 0.32, 1.6], [5.4, 0.12, 0.8]].forEach(([r, v, d]) => {
    k.tone({ freq: f * r, type: 'sine', dur: d, vol: vol * v, attack: 0.004, at: t, out });
  });
}

/** A deep drum, felt more than heard: a taiko or a pakhawaj, far off. */
function drum(k, t, vol = 0.07) {
  const out = roomIn(k);
  if (!out) return;
  k.tone({ freq: 96, freq2: 58, type: 'sine', dur: 0.4, vol, attack: 0.01, at: t, out });
  k.tone({ freq: 192, freq2: 120, type: 'triangle', dur: 0.14, vol: vol * 0.3, attack: 0.006, at: t, out });
}

/** A soft reed chord that breathes: a shruti box on Sa and Pa. */
function reedDrone(k, m, t, dur, vol = 0.012) {
  const out = roomIn(k);
  if (!out) return;
  for (const [dm, v] of [[0, 1], [7, 0.7], [12, 0.5]]) {
    voice(k, { m: m + dm, at: t, dur, vol: vol * v, type: 'triangle', attack: dur * 0.3, release: dur * 0.35, filter: [900], q: 0.5, out });
  }
}

// --- the theme engine ------------------------------------------------------------------

/**
 * A theme from its score. The spec:
 *   sa            midi note of the lead's Sa
 *   beat, fightBeat   seconds a beat, exploring and in a fight
 *   cycle         beats in a cycle (a phrase fills one cycle)
 *   notes         the swar the raga allows (checked by the tests)
 *   phrases       [[swar, beats], ...] per phrase, each exactly `cycle` beats
 *   form          phrase indices in order; null = the lead rests that cycle
 *   lead(c, m, dur, ev)       play one melody note (c: the step context)
 *   bed(c)        every step: the accompaniment
 *   fight(c)      every step, in a fight only: the extra layer
 *   warm          notes to render ahead
 */
function makeTheme(spec) {
  const melody = spec.phrases.map((ph) => {
    const out = [];
    let at = 0;
    for (const [sw, beats] of ph) {
      out.push({ at: Math.round(at * 2), sw, m: spec.sa + swar(sw), steps: beats * 2 });
      at += beats;
    }
    return out;
  });
  const warm = spec.warm || [];
  return {
    ...spec,
    kind: 'region',
    note: (sw) => spec.sa + swar(sw),
    // One step is half a beat.
    tempo(k) {
      const beat = k.intensity >= 1 ? spec.fightBeat : spec.beat;
      return 60 / (beat / 2) / 4;
    },
    step(n, t, k) {
      prewarm(k, warm);
      const steps = spec.cycle * 2;
      const s = n % steps;
      const cycle = Math.floor(n / steps);
      const fight = k.intensity >= 1;
      const c = {
        k, t, s, cycle, fight,
        step: 60 / this.tempo(k) / 4,
        beat: s % 2 === 0 ? s / 2 : -1,          // which beat starts on this step (-1: none)
        pass: Math.floor(cycle / spec.form.length),
        note: (sw) => spec.sa + swar(sw),
      };
      spec.bed(c);
      if (fight && spec.fight) spec.fight(c);
      // The lead: in the form's order, resting where it rests - but not in a fight.
      let f = spec.form[cycle % spec.form.length];
      if (f === null && fight) f = cycle % melody.length;
      if (f === null) return;
      for (const ev of melody[f]) if (ev.at === s) this.lead(c, ev.m, ev.steps * c.step, ev);
    },
  };
}

const warmList = (sa, notes, off, fn) => notes.map((sw) => fn(sa + swar(sw) + off));

// --- 1. Raag Bhupali: the Ashen Heartland, Mirror Lake -----------------------------------
// Five notes, Sa Re Ga Pa Dha: the pentatonic of the plains, open and
// unclouded - an evening raga of peace and devotion (shanta, bhakti). Ga is
// the resting note, Dha its partner; it never touches Ma or Ni. The pakad:
// Ga Re Sa Dha., Sa Re Ga, Pa Ga, Dha Pa Ga Re Sa. Home: the land you wake in.
const BHUPALI = makeTheme({
  id: 'bhupali', name: 'Hearthfields', raga: 'Raag Bhupali', sa: 72, beat: 0.5, fightBeat: 0.42, cycle: 16,
  mood: 'Open, warm and at peace - the plains where you wake, the first lamp, home.',
  hour: 'early evening', regions: ['heartland', 'lake'],
  notes: ['S', 'R', 'G', 'P', 'D'],
  phrases: [
    [['G', 1], ['R', 1], ['S', 1], ['D.', 1], ['S', 2], ['R', 1], ['G', 1], ['P', 2], ['G', 1], ['R', 1], ['G', 4]],
    [['P', 1], ['G', 1], ['P', 1], ['D', 1], ["S'", 2], ['D', 1], ['P', 1], ['G', 2], ['R', 1], ['G', 1], ['P', 1], ['D', 1], ['P', 2]],
    [["S'", 1], ['D', 1], ['P', 1], ['G', 1], ['D', 2], ['P', 1], ['G', 1], ['R', 2], ['G', 1], ['R', 1], ['S', 1], ['D.', 1], ['S', 2]],
    [['G', 2], ['P', 1], ['D', 1], ["S'", 3], ["R'", 1], ["S'", 1], ['D', 1], ['P', 1], ['G', 1], ['R', 1], ['G', 1], ['S', 2]],
  ],
  form: [0, 1, 0, 2, null, 3, 1, 2, null, null],
  // First pass the flute sings; the next, the felt santoor takes the tune.
  lead(c, m, dur) {
    if (c.pass % 2 === 0) flute(c.k, m, dur, c.t);
    else { softPluck(c.k, m, c.t, 0.04); if (dur > c.step * 3) softPluck(c.k, m, c.t + dur * 0.5, 0.022); }
  },
  bed(c) {
    // The walk: Sa Ga Pa Sa', one pluck a beat, low.
    if (c.beat >= 0) {
      const walk = ['S.', 'G.', 'P.', 'S'];
      softPluck(c.k, c.note(walk[c.beat % 4]), c.t, c.beat % 4 === 0 ? 0.032 : 0.024);
    }
    if (c.s === 0) pulse(c.k, c.t, false);
  },
  fight(c) {
    if (c.s % 8 === 0) pulse(c.k, c.t, true);
    else if (c.s % 8 === 4) pulse(c.k, c.t, false);
    if (c.s % 4 === 2) tick(c.k, c.t, 0.012, 2600);
  },
  warm: [...warmList(72, ['S.', 'G.', 'P.', 'S', 'R', 'G', 'P', 'D', "S'", 'D.'], 0, warmSoft)],
});

// --- 2. Raag Maand: the Dust Gulch, the Sunken Sands, Saltwind Isle ---------------------
// The desert raga of Rajasthan, sung by the Manganiyars and Langas at night by
// the fire - a folk raga that wanders and zig-zags (Sa Ga Ma Pa, Ma Ga Re Sa)
// and lingers on Ma and Pa. Played on the algoza, the twin flutes of the
// desert (one pipe holds Sa while the other sings), over the lilting 6/8 of a
// dholak - the gait of a camel.
const MAAND = makeTheme({
  id: 'maand', name: 'Sand and Salt', raga: 'Raag Maand', sa: 69, beat: 0.3, fightBeat: 0.26, cycle: 12,
  mood: 'A long road under a big sky - wandering, sunlit, a little lonely.',
  hour: 'night, by the fire', regions: ['gulch', 'sands', 'isle'],
  notes: ['S', 'R', 'G', 'M', 'P', 'D', 'N'],
  phrases: [
    [['S', 1], ['G', 1], ['M', 1], ['P', 2], ['M', 1], ['G', 1], ['M', 1], ['P', 1], ['D', 2], ['P', 1]],
    [['D', 1], ['P', 1], ['D', 1], ["S'", 3], ['N', 1], ['D', 1], ['P', 1], ['M', 2], ['P', 1]],
    [['P', 1], ['M', 1], ['G', 1], ['M', 2], ['G', 1], ['R', 1], ['G', 1], ['S', 4]],
    [['G', 1], ['M', 1], ['P', 1], ["S'", 2], ['N', 1], ['D', 1], ['P', 1], ['M', 1], ['G', 1], ['S', 2]],
  ],
  form: [0, 1, 0, 2, null, 3, 1, 2, null, null, 0, 3, 1, 2, null, null],
  lead(c, m, dur) {
    // Algoza: a reedy flute; on the second pass the plucked string answers under it.
    flute(c.k, m, dur, c.t, 0.95, { reed: 0.004, vib: 0.003, vibRate: 6, vibDelay: 0.2, bright: 2300 });
    if (c.pass % 2 === 1) softPluck(c.k, m - 12, c.t, 0.03);
  },
  bed(c) {
    // The second pipe: Sa, held, breathing once a cycle.
    if (c.s === 0) voice(c.k, { m: c.note('S') - 12, at: c.t, dur: c.step * 23, vol: 0.011, type: 'triangle', attack: 0.6, release: 0.9, filter: [1100], q: 0.5, out: roomIn(c.k) });
    // Dholak in 6/8, soft: DHA . dhin | na . tin - the camel's gait.
    if (c.beat >= 0) {
      const b = c.beat % 6;
      if (b === 0) pulse(c.k, c.t, true, 1.1);
      else if (b === 3) pulse(c.k, c.t, false, 1.1);
      else if (b === 2 || b === 5) tick(c.k, c.t, 0.008, 1700);
      if (b === 0 || b === 3) softPluck(c.k, c.note(b === 0 ? 'S.' : 'P.'), c.t, 0.024);
    }
  },
  fight(c) {
    // The khartal joins: wooden clappers on every half-beat, leaning on the one.
    tick(c.k, c.t, c.s % 6 === 0 ? 0.022 : 0.011, 2400);
    if (c.beat >= 0 && c.beat % 6 === 4) pulse(c.k, c.t, false, 1.1);
  },
  warm: warmList(69, ['S.', 'P.', 'S', 'G', 'M', 'P', 'D'], -12, warmSoft),
});

// --- 3. Raag Malkauns: the Webwood, the Blackwater Mire, the Coil Gorge (and dungeons) ---
// One of the oldest ragas, sung after midnight: five notes, Sa ga Ma dha ni,
// with no Re and no Pa - deep, grave, spellbinding. Ma is its centre. The
// pakad: Ma ga Ma dha ni dha Ma ga Sa. Deep woods and dark water; here kept
// warm, a low flute over a rippling felt santoor, never a ghostly glide.
const MALKAUNS = makeTheme({
  id: 'malkauns', name: 'Under the Canopy', raga: 'Raag Malkauns', sa: 67, beat: 0.56, fightBeat: 0.46, cycle: 16,
  mood: 'Deep woods and dark water - hushed, grave and a little enchanted.',
  hour: 'after midnight', regions: ['webwood', 'mire', 'gorge', 'dungeon'],
  notes: ['S', 'g', 'M', 'd', 'n'],
  phrases: [
    [['M', 2], ['g', 1], ['M', 1], ['d', 2], ['n', 1], ['d', 1], ['M', 2], ['g', 1], ['S', 1], ['n.', 1], ['S', 3]],
    [['g', 1], ['M', 1], ['d', 1], ['n', 1], ["S'", 4], ['n', 1], ['d', 1], ['M', 2], ['d', 1], ['n', 1], ['d', 2]],
    [["S'", 2], ['n', 1], ['d', 1], ['n', 1], ["S'", 1], ["g'", 2], ["S'", 2], ['n', 1], ['d', 1], ['M', 4]],
    [['d', 1], ['M', 1], ['g', 1], ['M', 1], ['g', 1], ['S', 2], ['n.', 1], ['d.', 1], ['n.', 1], ['S', 2], ['g', 1], ['M', 1], ['S', 2]],
  ],
  form: [0, null, 1, 2, null, 3, 0, null, null, 2, 1, null],
  lead(c, m, dur) {
    if (c.pass % 2 === 0) flute(c.k, m, dur, c.t, 1, { vib: 0.0035, vibDelay: 0.35, bright: 2100 });
    else bowed(c.k, m, dur, c.t, 0.9);
  },
  bed(c) {
    // The ripple: Sa ga Ma dha ni dha Ma ga in eighths, low and soft, like water under leaves.
    if (c.beat >= 0) {
      const rip = ['S.', 'g.', 'M.', 'd.', 'n.', 'd.', 'M.', 'g.'];
      softPluck(c.k, c.note(rip[c.beat % 8]), c.t, c.beat % 8 === 0 ? 0.03 : 0.019);
    }
  },
  fight(c) {
    // A heartbeat: two low strokes, then quiet.
    if (c.s % 8 === 0) drum(c.k, c.t, 0.06);
    else if (c.s % 8 === 1) drum(c.k, c.t, 0.035);
  },
  warm: warmList(67, ['S.', 'g.', 'M.', 'd.', 'n.', 'S'], 0, warmSoft),
});

// --- 4. Raag Bhairav: the Broken Peaks, the Great Bridge ---------------------------------
// The raga of dawn and of Shiva: Sa re Ga Ma Pa dha Ni, re and dha sung
// with a slow sway (andolan). Solemn and grave, a prayer at first light -
// the ash-grey peaks and the bridge the Wardens hold. A bowed voice, a soft
// shruti box, a temple bell at every cycle.
const BHAIRAV = makeTheme({
  id: 'bhairav', name: 'Ash at Dawn', raga: 'Raag Bhairav', sa: 70, beat: 0.64, fightBeat: 0.5, cycle: 16,
  mood: 'Grave and solemn, a prayer at first light over ash and stone.',
  hour: 'dawn', regions: ['peaks', 'bridge'],
  notes: ['S', 'r', 'G', 'M', 'P', 'd', 'N'],
  phrases: [
    [['S', 1], ['r', 2], ['G', 1], ['M', 2], ['P', 2], ['d', 3], ['P', 1], ['M', 1], ['G', 1], ['M', 2]],
    [['G', 1], ['M', 1], ['d', 2], ['N', 1], ["S'", 3], ['N', 1], ['d', 3], ['P', 4]],
    [['P', 1], ['d', 1], ['M', 1], ['P', 1], ['G', 2], ['M', 1], ['r', 3], ['S', 2], ['N.', 1], ['S', 3]],
    [['d.', 1], ['N.', 1], ['S', 1], ['G', 1], ['M', 2], ['P', 1], ['d', 1], ['N', 1], ["S'", 3], ['d', 2], ['P', 2]],
  ],
  form: [0, 1, null, 2, 3, null, 0, 2, null, null],
  lead(c, m, dur, ev) {
    // re and dha sway (andolan) when they are held.
    const sway = (baseOf(ev.sw) === 'r' || baseOf(ev.sw) === 'd') && ev.steps >= 4;
    if (c.pass % 2 === 0) bowed(c.k, m, dur, c.t, 1, sway);
    else flute(c.k, m, dur, c.t, 0.9, { vib: sway ? 0.009 : 0.004, vibRate: sway ? 1.7 : 5.5, vibDelay: 0.2 });
  },
  bed(c) {
    if (c.s === 0) bell(c.k, c.note('S'), c.t, 0.018);
    if (c.s % 16 === 0) reedDrone(c.k, c.note('S.'), c.t, c.step * 16, 0.011);
    if (c.beat >= 0 && c.beat % 4 === 2) softPluck(c.k, c.note('P.'), c.t, 0.02);
  },
  fight(c) {
    // The pakhawaj, far off: a deep stroke on one and three, a lighter one on the "and" of four.
    if (c.s % 8 === 0) drum(c.k, c.t, c.s % 16 === 0 ? 0.075 : 0.055);
    if (c.s % 16 === 14) drum(c.k, c.t, 0.035);
    if (c.s % 16 === 8) bell(c.k, c.note("S'"), c.t, 0.008);
  },
  warm: warmList(70, ['P.'], 0, warmSoft),
});

// --- 5. Raag Yaman: the Moon Citadel, the Gilded Deep, the Echo Cliffs, the Hollow Moors ---
// The first raga every student learns and the king of the evening: all
// seven notes, Ma raised (tivra), often entering from Ni below - Ni. Re Ga,
// Ma# Dha Ni Sa'. Serene, noble, a little longing: marble under the moon,
// palace gardens, a chapel in the snow. The santoor carries the tune, its
// long notes a soft tremolo of strokes.
const YAMAN = makeTheme({
  id: 'yaman', name: 'Moonlit Courts', raga: 'Raag Yaman', sa: 72, beat: 0.52, fightBeat: 0.44, cycle: 16,
  mood: 'Serene and noble with a touch of longing - marble, moonlight and snow.',
  hour: 'first part of the night', regions: ['citadel', 'gilded', 'echo', 'moors'],
  notes: ['S', 'R', 'G', 'M#', 'P', 'D', 'N'],
  phrases: [
    [['N.', 1], ['R', 1], ['G', 2], ['R', 1], ['S', 1], ['N.', 1], ['D.', 1], ['N.', 1], ['R', 1], ['S', 6]],
    [['N.', 1], ['R', 1], ['G', 1], ['M#', 1], ['P', 2], ['M#', 1], ['G', 1], ['R', 2], ['G', 1], ['M#', 1], ['D', 1], ['P', 3]],
    [['G', 1], ['M#', 1], ['D', 1], ['N', 1], ["S'", 4], ['N', 1], ['D', 1], ['P', 2], ['M#', 1], ['G', 1], ['R', 2]],
    [['M#', 1], ['D', 1], ['N', 1], ["R'", 1], ["S'", 2], ['N', 1], ['D', 1], ['P', 1], ['M#', 1], ['G', 1], ['R', 1], ['N.', 1], ['R', 1], ['S', 2]],
  ],
  form: [0, 1, 2, null, 3, 1, null, 0, 2, null, null],
  lead(c, m, dur) {
    if (c.pass % 2 === 1) { flute(c.k, m, dur, c.t, 0.95); return; }
    // Santoor: one stroke, and a soft tremolo through a long note.
    santoor(c.k, m, c.t, 0.03);
    for (let x = c.step; x < dur - c.step * 0.5; x += c.step) santoor(c.k, m, c.t + x, 0.014);
  },
  bed(c) {
    if (c.beat >= 0 && c.beat % 2 === 0) {
      const arp = ['S.', 'P.', 'S', 'P.', 'N..', 'P.', 'S', 'G.'];
      softPluck(c.k, c.note(arp[(c.beat / 2) % 8]), c.t, 0.022);
    }
  },
  fight(c) {
    if (c.s % 8 === 0) pulse(c.k, c.t, true);
    else if (c.s % 8 === 4) pulse(c.k, c.t, false);
    if (c.s % 16 === 12) santoor(c.k, c.note('P.'), c.t, 0.014);
  },
  warm: [...warmList(72, ['S', 'R', 'G', 'M#', 'P', 'D', 'N', "S'", 'N.', 'D.'], 0, warmSantoor), ...warmList(72, ['S.', 'P.', 'S', 'N..', 'G.'], 0, warmSoft)],
});

// --- 6. Raag Durga: Cloud Summit --------------------------------------------------------
// Five notes, Sa Re Ma Pa Dha - the same five as Japan's yo scale, which is
// why it sits so naturally on the blossom mountain: a bright, gentle raga of
// the late evening, sung to the goddess (shringar: love and beauty). The
// breathy flute of a shakuhachi and a plucked koto whose pattern of three
// runs across the beat of four, like petals on the wind.
const DURGA = makeTheme({
  id: 'durga', name: 'Blossom Road', raga: 'Raag Durga', sa: 74, beat: 0.5, fightBeat: 0.42, cycle: 16,
  mood: 'Bright and gentle, petals on the wind - the red gates of the summit.',
  hour: 'late evening', regions: ['summit'],
  notes: ['S', 'R', 'M', 'P', 'D'],
  phrases: [
    [['S', 1], ['R', 1], ['M', 1], ['P', 1], ['D', 2], ['P', 1], ['M', 1], ['R', 2], ['M', 1], ['P', 1], ['M', 1], ['R', 1], ['S', 2]],
    [['M', 1], ['P', 1], ['D', 1], ["S'", 3], ["R'", 1], ["S'", 1], ['D', 1], ['P', 1], ['M', 2], ['P', 1], ['D', 1], ['M', 2]],
    [['D', 1], ["S'", 1], ['D', 1], ['P', 1], ['M', 2], ['R', 1], ['M', 1], ['P', 3], ['M', 1], ['R', 1], ['S', 3]],
    [['R', 1], ['M', 1], ['R', 1], ['P', 1], ['M', 2], ['D', 1], ['P', 1], ["S'", 4], ['D', 1], ['M', 1], ['R', 2]],
  ],
  form: [0, 1, null, 2, 3, null, 1, 0, null, null],
  lead(c, m, dur) {
    if (c.pass % 2 === 0) flute(c.k, m - 12, dur, c.t, 1.05, { breath: 0.012, vib: 0.005, vibRate: 4.5, vibDelay: 0.4, bright: 2200 });
    else koto(c.k, m, c.t, 0.04);
  },
  bed(c) {
    // Koto in threes against the four: Sa Pa Re, Ma Pa Dha... on every half-beat third.
    if (c.s % 3 === 0) {
      const pat = ['S.', 'P.', 'R', 'M.', 'D.', 'S'];
      koto(c.k, c.note(pat[(c.s / 3) % 6]), c.t, 0.02);
    }
  },
  fight(c) {
    // Taiko, far away: DON . . DON . DON . .
    if (c.s % 16 === 0 || c.s % 16 === 6 || c.s % 16 === 10) drum(c.k, c.t, c.s % 16 === 0 ? 0.08 : 0.05);
    if (c.s % 4 === 2) tick(c.k, c.t, 0.01, 3000);
  },
  warm: [...warmList(74, ['S.', 'P.', 'R', 'M.', 'D.', 'S', 'M', 'P', 'D', "S'"], 0, warmKoto)],
});

export const REGION_THEMES = [BHUPALI, MAAND, MALKAUNS, BHAIRAV, YAMAN, DURGA];

const BY_REGION = new Map();
for (const th of REGION_THEMES) for (const r of th.regions) BY_REGION.set(r, th);

/** The piece for a Wilds region id (or 'dungeon'); the Heartland's if none is set. */
export function themeForRegion(id) { return BY_REGION.get(id) || BHUPALI; }
export function themeById(id) { return REGION_THEMES.find((t) => t.id === id) || null; }
