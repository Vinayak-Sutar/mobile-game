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
// themselves were composed for the game.
//
// Instruments, round 2 (owner: "I didn't like the instruments - try piano
// notes or some other instrument"): the flute, the bowed voice, the felt
// santoor and the koto are gone. Every piece is now played on modelled
// struck and plucked instruments (music-instruments.js): a piano, an electric
// piano, a music box, a kalimba, a marimba and a harp. The raga stays in the
// melody, and the harmony under it uses only the raga's own notes, so its
// colour survives the piano. The lead instrument of any piece can be changed
// in the Music Room, and the choice is kept in the game too.

import { prewarm } from './music-samples.js';
import { INSTRUMENTS, inst, roll, pad, hallIn, warmInst } from './music-instruments.js';

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

// --- percussion, for the fight layer only -------------------------------------------------

/** A soft low pulse: a hand drum heard across the courtyard. */
function pulse(k, t, strong) {
  const out = hallIn(k);
  if (!out) return;
  k.tone({ freq: 110, freq2: 80, type: 'sine', dur: 0.22, vol: strong ? 0.07 : 0.042, attack: 0.008, at: t, out });
  k.tone({ freq: 220, freq2: 160, type: 'triangle', dur: 0.12, vol: strong ? 0.02 : 0.012, attack: 0.008, at: t, out });
}
/** A light wooden tick: the khartal, a shrine's clapper. */
function tick(k, t, vol = 0.014, freq = 2400) {
  const out = hallIn(k);
  if (out) k.noise({ dur: 0.03, vol, freq, type: 'bandpass', q: 3, at: t, out });
}
/** A deep drum, felt more than heard: a taiko, a pakhawaj far off. */
function drum(k, t, vol = 0.065) {
  const out = hallIn(k);
  if (!out) return;
  k.tone({ freq: 96, freq2: 58, type: 'sine', dur: 0.4, vol, attack: 0.01, at: t, out });
  k.tone({ freq: 192, freq2: 120, type: 'triangle', dur: 0.14, vol: vol * 0.3, attack: 0.006, at: t, out });
}

// --- the lead: which instrument plays the tune ------------------------------------------

let leadChoice = {};
/** { themeId: instrumentName }, from the Music Room (kept in the save). */
export function setLeadChoice(map) { leadChoice = { ...(map || {}) }; }
export function leadFor(theme, pass = 0) {
  const pick = leadChoice[theme.id];
  return pick && INSTRUMENTS[pick] ? pick : theme.leads[pass % theme.leads.length];
}
export const LEAD_OPTIONS = Object.entries(INSTRUMENTS).map(([id, v]) => ({ id, label: v.label }));

// --- the theme engine ------------------------------------------------------------------

/**
 * A theme from its score:
 *   sa, beat, fightBeat, cycle   the lead's Sa (midi); seconds a beat calm / in a fight; beats a cycle
 *   notes, phrases, form         the raga's swar; four phrases of one cycle; their order (null = rest)
 *   leads                        lead instruments, one per pass through the form
 *   leadVol, leadDouble          the tune's loudness; a piano lead doubled this many semitones down
 *   bars, barInst, barBeats      the left hand: per bar, the swar of its broken chord, one per half-beat
 *   bed(c), fight(c)             anything else, every step (always / in a fight only)
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
  const note = (sw) => spec.sa + swar(sw);
  // Render ahead every note the leads and the left hand will need.
  const warm = [];
  const seen = new Set();
  const want = (name, m) => { const key = name + m; if (!seen.has(key)) { seen.add(key); warm.push(warmInst(name, m)); } };
  for (const name of spec.leads) for (const ph of melody) for (const ev of ph) want(name, ev.m + INSTRUMENTS[name].oct);
  for (const bar of spec.bars || []) for (const sw of bar) if (sw) want(spec.barInst, note(sw));
  for (const [name, sws] of spec.warmMore || []) for (const sw of sws) want(name, note(sw));
  return {
    ...spec,
    kind: 'region',
    note,
    tempo(k) {
      const beat = k.intensity >= 1 ? spec.fightBeat : spec.beat;
      return 60 / (beat / 2) / 4;     // one step is half a beat
    },
    step(n, t, k) {
      prewarm(k, warm);
      const steps = spec.cycle * 2;
      const s = n % steps;
      const cycle = Math.floor(n / steps);
      const fight = k.intensity >= 1;
      const c = {
        k, t, s, n, cycle, fight,
        step: 60 / this.tempo(k) / 4,
        pass: Math.floor(cycle / spec.form.length),
        note,
      };
      // The left hand: a broken chord, its bass note held through the bar.
      if (spec.bars) {
        const per = spec.barBeats * 2;
        const bar = spec.bars[Math.floor(n / per) % spec.bars.length];
        const i = n % per;
        const sw = bar[i];
        if (sw) {
          inst(k, spec.barInst, note(sw), t, i === 0
            ? { vol: spec.barVol * 1.25, dur: per * c.step, pedal: true }
            : { vol: spec.barVol * (i % 2 ? 0.8 : 1), dur: c.step * 3 });
        }
      }
      if (spec.bed) spec.bed(c);
      if (fight && spec.fight) spec.fight(c);
      let f = spec.form[cycle % spec.form.length];
      if (f === null && fight) f = cycle % melody.length;    // no resting in a fight
      if (f === null) return;
      for (const ev of melody[f]) if (ev.at === s) this.lead(c, ev);
    },
    lead(c, ev) {
      const name = leadFor(this, c.pass);
      const I = INSTRUMENTS[name];
      const dur = ev.steps * c.step;
      const vol = spec.leadVol ?? 0.07;
      inst(c.k, name, ev.m + I.oct, c.t, { vol, dur: dur * 1.02 });
      if (spec.leadDouble && name === 'piano') inst(c.k, name, ev.m + spec.leadDouble, c.t, { vol: vol * 0.5, dur });
      // A bar or a tine cannot hold a long note: a marimba rolls it, the others strike it again softly.
      if (!I.damp && ev.steps >= 4) {
        const every = name === 'marimba' ? 1 : 2;
        for (let x = every; x < ev.steps - 0.5; x += every) {
          inst(c.k, name, ev.m + I.oct, c.t + x * c.step, { vol: vol * (name === 'marimba' ? 0.45 : 0.35) });
        }
      }
    },
  };
}

// --- 1. Raag Bhupali: the Ashen Heartland, Mirror Lake -----------------------------------
// Five notes, Sa Re Ga Pa Dha: open and unclouded, an evening raga of peace
// (shanta). Ga the resting note, Dha its partner, never Ma or Ni. Home.
// A piano, the left hand flowing in broken chords of the raga's own notes.
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
  leads: ['piano', 'musicbox'], leadVol: 0.075,
  barInst: 'piano', barBeats: 4, barVol: 0.03,
  bars: [
    ['S..', 'P..', 'S.', 'G.', 'P.', 'G.', 'S.', 'P..'],
    ['D...', 'G..', 'D..', 'S.', 'G.', 'S.', 'D..', 'G..'],
    ['R..', 'P..', 'R.', 'G.', 'D.', 'G.', 'R.', 'P..'],
    ['P...', 'R..', 'P..', 'D..', 'R.', 'D..', 'P..', 'R..'],
  ],
  bed(c) { if (c.s === 0 && c.cycle % 2 === 0) pad(c.k, [c.note('S.'), c.note('P.')], c.t, c.step * 64, 0.0035); },
  fight(c) {
    if (c.s % 8 === 0) pulse(c.k, c.t, true);
    else if (c.s % 8 === 4) pulse(c.k, c.t, false);
    if (c.s % 4 === 2) tick(c.k, c.t, 0.01, 2600);
  },
});

// --- 2. Raag Maand: the Dust Gulch, the Sunken Sands, Saltwind Isle ---------------------
// The desert raga of Rajasthan, a folk raga sung by the fire that wanders
// and zig-zags (Sa Ga Ma Pa, Ma Ga Re Sa) and lingers on Ma and Pa. A
// kalimba sings over a marimba in the lilting 6/8 of a camel's gait.
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
  leads: ['kalimba', 'piano'], leadVol: 0.075,
  // The marimba: one note a beat (a beat here is an eighth), bars of six.
  barInst: 'marimba', barBeats: 6, barVol: 0.034,
  bars: [
    ['S.', null, 'P.', null, 'S', null, 'P.', null, 'G', null, 'P.', null],
    ['M.', null, 'S', null, 'M', null, 'S', null, 'P', null, 'S', null],
    ['S.', null, 'P.', null, 'S', null, 'P.', null, 'G', null, 'P.', null],
    ['P.', null, 'S', null, 'D', null, 'S', null, 'G', null, 'S', null],
  ],
  warmMore: [['piano', ['S..', 'M..']]],
  bed(c) {
    // The bass: a low piano note at each bar, the gait's downbeat.
    if (c.n % 12 === 0) inst(c.k, 'piano', c.note((c.n / 12) % 2 ? 'M..' : 'S..'), c.t, { vol: 0.03, dur: c.step * 12, pedal: true });
  },
  fight(c) {
    if (c.s % 12 === 0) drum(c.k, c.t, 0.06);
    else if (c.s % 12 === 6) pulse(c.k, c.t, false);
    tick(c.k, c.t, c.s % 6 === 0 ? 0.018 : 0.009, 2400);      // the khartal
  },
});

// --- 3. Raag Malkauns: the Webwood, the Blackwater Mire, the Coil Gorge (and dungeons) ---
// One of the oldest ragas, sung after midnight: Sa ga Ma dha ni, no Re and
// no Pa - deep, grave, spellbinding; Ma its centre. An electric piano, soft
// and round, over its own low broken chords and a string pad.
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
  leads: ['epiano', 'piano'], leadVol: 0.07,
  barInst: 'epiano', barBeats: 4, barVol: 0.03,
  bars: [
    ['S..', 'M..', 'n..', 'g.', 'M.', 'g.', 'n..', 'M..'],
    ['d...', 'g..', 'n..', 'M.', 'g.', 'M.', 'n..', 'g..'],
    ['M..', 'S.', 'g.', 'd.', 'g.', 'S.', 'M..', 'S.'],
    ['n...', 'M..', 'g.', 'n.', 'g.', 'M..', 'S.', 'M..'],
  ],
  bed(c) { if (c.s === 0 && c.cycle % 2 === 0) pad(c.k, [c.note('S.'), c.note('M.')], c.t, c.step * 64, 0.004); },
  fight(c) {
    if (c.s % 8 === 0) drum(c.k, c.t, 0.06);
    else if (c.s % 8 === 1) drum(c.k, c.t, 0.035);
  },
});

// --- 4. Raag Bhairav: the Broken Peaks, the Great Bridge ---------------------------------
// The raga of dawn and of Shiva: Sa re Ga Ma Pa dha Ni, solemn and grave.
// Its notes give the piano deep chords: Sa-Pa-Ga, and the dark re-Ma-dha a
// half step above. The tune in octaves, a chord rolled each bar like a hymn,
// a string pad, and a music box struck at each cycle like a far bell.
const BHAIRAV_CHORDS = [['S..', 'P..', 'G.', 'S'], ['r..', 'M..', 'd.', 'r'], ['d...', 'M..', 'S.', 'M.'], ['P...', 'N..', 'M.', 'P.']];
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
  leads: ['piano', 'harp'], leadVol: 0.07, leadDouble: -12,
  warmMore: [['piano', BHAIRAV_CHORDS.flat()], ['musicbox', ["S'"]]],
  bed(c) {
    const ch = BHAIRAV_CHORDS[Math.floor(c.n / 8) % 4].map(c.note);
    if (c.s % 8 === 0) roll(c.k, 'piano', ch, c.t, { vol: 0.03, dur: c.step * 8, pedal: true, spread: 0.06 });
    if (c.s % 8 === 4) inst(c.k, 'piano', ch[2], c.t, { vol: 0.018, dur: c.step * 4 });
    if (c.s === 0) {
      pad(c.k, [c.note('S.'), c.note('P.')], c.t, c.step * 32, 0.004);
      inst(c.k, 'musicbox', c.note("S'"), c.t, { vol: 0.03 });
    }
  },
  fight(c) {
    if (c.s % 8 === 0) drum(c.k, c.t, c.s % 16 === 0 ? 0.07 : 0.05);
    if (c.s % 16 === 14) drum(c.k, c.t, 0.032);
  },
});

// --- 5. Raag Yaman: the Moon Citadel, the Gilded Deep, the Echo Cliffs, the Hollow Moors ---
// The king of the evening ragas: all seven notes with Ma raised (tivra),
// often entering from Ni below. Serene, noble, a little longing. A music box
// over a piano's broken chords - the raised Ma gives them their moonlit lift.
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
  leads: ['musicbox', 'piano'], leadVol: 0.075,
  barInst: 'piano', barBeats: 4, barVol: 0.028,
  bars: [
    ['S..', 'P..', 'S.', 'G.', 'N.', 'G.', 'S.', 'P..'],
    ['D...', 'G..', 'S.', 'G.', 'D.', 'G.', 'S.', 'G..'],
    ['R..', 'D..', 'M#.', 'S', 'M#.', 'D..', 'R.', 'D..'],
    ['N...', 'M#..', 'R.', 'D.', 'R.', 'M#..', 'N..', 'R.'],
  ],
  bed(c) { if (c.s === 0 && c.cycle % 2 === 1) pad(c.k, [c.note('S.'), c.note('G.')], c.t, c.step * 64, 0.003); },
  fight(c) {
    if (c.s % 8 === 0) pulse(c.k, c.t, true);
    else if (c.s % 8 === 4) pulse(c.k, c.t, false);
  },
});

// --- 6. Raag Durga: Cloud Summit --------------------------------------------------------
// Sa Re Ma Pa Dha - the same five notes as Japan's yo scale, so it sits
// naturally on the blossom mountain: bright and gentle, late evening. A
// piano sings over a harp whose figure of three runs across the beat of
// four, like petals on the wind.
const DURGA_FIGURE = ['S.', 'P.', 'R', 'M.', 'D.', 'S'];
const DURGA_BASS = ['S..', 'S..', 'M..', 'R..'];
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
  leads: ['piano', 'kalimba'], leadVol: 0.07,
  warmMore: [['harp', [...DURGA_FIGURE, ...DURGA_BASS]]],
  bed(c) {
    // The harp in threes, and a low harp note at each bar.
    if (c.n % 3 === 0) inst(c.k, 'harp', c.note(DURGA_FIGURE[(c.n / 3) % 6]), c.t, { vol: 0.026 });
    if (c.s % 8 === 0) inst(c.k, 'harp', c.note(DURGA_BASS[Math.floor(c.n / 8) % 4]), c.t, { vol: 0.034 });
  },
  fight(c) {
    // Taiko, far away: DON . . DON . DON . .
    if (c.s % 16 === 0 || c.s % 16 === 6 || c.s % 16 === 10) drum(c.k, c.t, c.s % 16 === 0 ? 0.075 : 0.048);
    if (c.s % 4 === 2) tick(c.k, c.t, 0.009, 3000);
  },
});

export const REGION_THEMES = [BHUPALI, MAAND, MALKAUNS, BHAIRAV, YAMAN, DURGA];

const BY_REGION = new Map();
for (const th of REGION_THEMES) for (const r of th.regions) BY_REGION.set(r, th);

/** The piece for a Wilds region id (or 'dungeon'); the Heartland's if none is set. */
export function themeForRegion(id) { return BY_REGION.get(id) || BHUPALI; }
export function themeById(id) { return REGION_THEMES.find((t) => t.id === id) || null; }
