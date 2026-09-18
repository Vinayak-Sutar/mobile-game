// "The Last Bullet" - Deadeye Vesper's theme. An original spaghetti-western
// piece, synthesised like the rest of the game's audio.
//
// The band:
//   - a WHISTLE carrying the tune: a pure tone that slides up into each note
//     and warms into vibrato as it holds;
//   - a TWANGY GUITAR: plucked, with a slapback echo, strumming the
//     off-beats and taking the tune on the second pass;
//   - a boom-chick BASS walking root and fifth;
//   - a GALLOP of hoof-clops (clip, clip-clop) under everything;
//   - MARIACHI TRUMPETS in thirds once she draws her second gun (Sundown),
//     with whip cracks and snare rolls, a little faster;
//   - and for HIGH NOON everything drops out but a heartbeat, a lone held
//     whistle and a church bell, until the draw - then a whip crack and the
//     band crashes back in.
//
// Chords: Am - G - F - E, the descending cadence the genre is built on. The
// melody is written for this game.
//
// It plugs into the music scheduler as a boss theme (audio.js
// setBossTheme): `step(n, t, kit)` is called on every 16th note with its
// exact start time, `tempo(kit)` sets the pace, and `kit.boss` is Vesper.

import { voice, midi } from './music-kit.js';

const PROG = [
  { root: 45, fifth: 52, strum: [57, 60, 64] },   // Am
  { root: 43, fifth: 50, strum: [55, 59, 62] },   // G
  { root: 41, fifth: 48, strum: [53, 57, 60] },   // F
  { root: 40, fifth: 47, strum: [52, 56, 59] },   // E (major: the G# pulls home)
];

// Eight bars of tune: [16th step in the bar, midi note, length in 16ths].
const TUNE = [
  [[0, 76, 6], [6, 81, 2], [8, 79, 2], [10, 76, 2], [12, 74, 4]],
  [[0, 74, 4], [4, 71, 2], [6, 74, 2], [8, 79, 8]],
  [[0, 77, 6], [6, 76, 2], [8, 74, 2], [10, 72, 2], [12, 71, 4]],
  [[0, 68, 4], [4, 71, 4], [8, 76, 8]],
  [[0, 81, 8], [8, 84, 4], [12, 83, 4]],
  [[0, 79, 6], [6, 81, 2], [8, 79, 2], [10, 77, 2], [12, 76, 4]],
  [[0, 77, 4], [4, 76, 2], [6, 74, 2], [8, 72, 4], [12, 74, 4]],
  [[0, 76, 12], [12, 68, 4]],
];


/** A diatonic third below, in A minor (with the raised G# of the E chord). */
function thirdBelow(m) {
  const drop = { 9: 4, 11: 4, 0: 3, 2: 3, 4: 4, 5: 3, 7: 3, 8: 4 }[((m % 12) + 12) % 12] ?? 3;
  return m - drop;
}

// --- voices ---------------------------------------------------------------------

/** The whistle: slides up into the note, vibrato warming in as it holds. */
function whistle(k, m, dur, t, vol = 0.075) {
  voice(k, { m, at: t, dur, vol, type: 'sine', slide: 1, slideTime: 0.07, vib: 0.009, vibRate: 5.8, vibDelay: 0.16, attack: 0.05, release: 0.18 });
  // A breath of air at the front of the note.
  k.noise({ dur: 0.06, vol: 0.012, freq: 2600, type: 'bandpass', q: 3, at: t, out: k.bus });
}

/** A plucked, twangy guitar note, with the slapback echo of a big room. */
function twang(k, m, t, vol = 0.05, dur = 0.5) {
  const pluck = (at, v) => {
    voice(k, { m, at, dur, vol: v, type: 'sawtooth', bendFrom: 1.012, attack: 0.003, sustain: false, filter: [3200, 520, 0.35], q: 3 });
    voice(k, { m: m + 12, at, dur: dur * 0.4, vol: v * 0.3, type: 'square', attack: 0.002, sustain: false, filter: [2600, 900], q: 1 });
  };
  pluck(t, vol);
  pluck(t + 0.17, vol * 0.35);
}

function strum(k, notes, t, vol = 0.03, up = false) {
  const order = up ? [...notes].reverse() : notes;
  order.forEach((m, i) => twang(k, m, t + i * 0.013, vol, 0.28));
}

function bass(k, m, t, dur) {
  k.tone({ freq: midi(m), type: 'triangle', dur, vol: 0.11, at: t, out: k.bus });
  k.tone({ freq: midi(m), type: 'sawtooth', dur: dur * 0.8, vol: 0.05, at: t, out: k.bus, filter: { freq: 1100, freq2: 300, q: 3 } });
}

/** A hoof-clop: hollow wood, higher for the "clip". */
function clop(k, t, hi, accent) {
  k.tone({ freq: hi ? 980 : 720, freq2: hi ? 760 : 520, type: 'triangle', dur: 0.05, vol: accent ? 0.075 : 0.05, at: t, out: k.bus });
  k.noise({ dur: 0.015, vol: accent ? 0.05 : 0.03, freq: 2400, type: 'highpass', at: t, out: k.bus });
}

function trumpet(k, m, dur, t, vol = 0.042) {
  voice(k, { m, at: t, dur, vol, type: 'sawtooth', slide: 0.5, slideTime: 0.04, vib: 0.006, vibRate: 6.2, vibDelay: 0.14, attack: 0.035, release: 0.1, filter: [2200, 1400], q: 1.4 });
  voice(k, { m, at: t, dur, vol: vol * 0.45, type: 'square', attack: 0.04, release: 0.1, filter: [1600], q: 0.8 });
}

function whip(k, t) {
  k.noise({ dur: 0.07, vol: 0.2, freq: 3200, type: 'highpass', at: t, out: k.bus });
  k.tone({ freq: 2400, freq2: 500, type: 'square', dur: 0.05, vol: 0.05, at: t, out: k.bus });
}

function snareRoll(k, t, n, gap) {
  for (let i = 0; i < n; i++) {
    k.noise({ dur: 0.07, vol: 0.03 + (i / n) * 0.07, freq: 1900, type: 'bandpass', q: 0.9, at: t + i * gap, out: k.bus });
  }
}

/** A church bell: inharmonic partials, a long decay. */
function bell(k, m, t) {
  const f = midi(m);
  [[1, 0.13, 3.2], [2.0, 0.06, 2.4], [2.4, 0.05, 1.8], [3.0, 0.035, 1.4], [4.2, 0.02, 0.9]].forEach(([r, v, d]) => {
    k.tone({ freq: f * r, type: 'sine', dur: d, vol: v, attack: 0.004, at: t, out: k.bus });
  });
}

/** Lub-dub. The octave-up thump is what a phone speaker can actually play. */
function heartbeat(k, t) {
  for (const [at, v] of [[t, 0.24], [t + 0.16, 0.16]]) {
    k.tone({ freq: 62, freq2: 40, type: 'sine', dur: 0.2, vol: v, at, out: k.bus });
    k.tone({ freq: 124, freq2: 80, type: 'triangle', dur: 0.12, vol: v * 0.4, at, out: k.bus });
  }
}

// --- the piece -------------------------------------------------------------------

const mem = { noon: false, lastN: -1 };

export const WESTERN_THEME = {
  tempo(k) { return k.boss && k.boss.phase >= 2 ? 132 : 118; },

  step(n, t, k) {
    const e = k.boss;
    if (n === 0 || n < mem.lastN) mem.noon = false;
    mem.lastN = n;
    const beat = 60 / this.tempo(k) / 4;
    const s = n % 16;
    const bar = Math.floor(n / 16);

    // --- High Noon: the band falls silent ---------------------------------------
    const noon = !!e && (e.noon || 0) > 0.25;
    if (noon) {
      if (!mem.noon) { mem.noon = true; mem.noonAt = n; bell(k, 57, t); }
      const since = n - mem.noonAt;
      if (s === 0 || s === 8) heartbeat(k, t);
      if (since > 0 && since % 32 === 0) bell(k, 57, t);
      if (since % 32 === 4) whistle(k, 76, beat * 26, t, 0.06);
      return;
    }
    if (mem.noon) {
      // The draw: a crack, and everyone comes back in on the next downbeat.
      mem.noon = false;
      whip(k, t);
      k.noise({ dur: 0.9, vol: 0.12, freq: 6000, freq2: 2500, type: 'highpass', q: 0.5, at: t, out: k.bus });
    }

    const chord = PROG[bar % 4];
    const sundown = !!e && e.phase >= 2;
    const barrage = !!e && ['deadeye', 'sundown', 'fan'].includes(e.action);

    // --- rhythm section -------------------------------------------------------------
    // The gallop: clip . clip-clop on every beat.
    const inBeat = s % 4;
    if (inBeat === 0 || inBeat === 2 || inBeat === 3) clop(k, t, inBeat !== 3, inBeat === 0);

    // Boom-chick: root on 1, fifth on 3, a walk down into the next bar on E.
    if (s === 0) bass(k, chord.root, t, beat * 3.5);
    if (s === 8) bass(k, chord.fifth, t, beat * 3.5);
    if (bar % 4 === 3 && s === 12) bass(k, 44, t, beat * 1.8);
    if (bar % 4 === 3 && s === 14) bass(k, 43, t, beat * 1.8);

    // The guitar's "chick" on 2 and 4 (and an upstroke on the "and" in Sundown).
    if (s === 4 || s === 12) strum(k, chord.strum, t, 0.028);
    if (sundown && (s === 6 || s === 14)) strum(k, chord.strum, t, 0.018, true);

    // Her big barrages get a tremolo-picked guitar driving under them.
    if (barrage) twang(k, chord.root + 24, t, 0.022, beat * 1.2);

    // --- the tune ---------------------------------------------------------------------
    const tuneBar = TUNE[bar % 8];
    const pass = Math.floor(bar / 8) % 2;
    for (const [at, m, len] of tuneBar) {
      if (at !== s) continue;
      const dur = len * beat;
      if (sundown) {
        // Sundown: mariachi trumpets in thirds carry it.
        trumpet(k, m, dur, t);
        trumpet(k, thirdBelow(m), dur, t, 0.03);
        if (pass === 1) twang(k, m - 12, t, 0.04, Math.min(dur, 0.6));
      } else if (pass === 0) {
        whistle(k, m, dur, t);
      } else {
        // Second pass: the guitar takes the tune an octave down, the whistle
        // answers with long notes over the top.
        twang(k, m - 12, t, 0.055, Math.min(dur, 0.7));
      }
    }
    if (!sundown && pass === 1 && s === 0) whistle(k, chord.strum[2] + 12, beat * 14, t, 0.04);

    // --- punctuation --------------------------------------------------------------------
    if (sundown && bar % 4 === 0 && s === 0) whip(k, t);
    if (sundown && bar % 4 === 3 && s === 12) snareRoll(k, t, 8, beat / 2);
    if (!sundown && bar % 8 === 7 && s === 12) snareRoll(k, t, 6, beat / 2);
  },
};
