// Procedural sound. Everything is synthesised at runtime so the prototype
// ships with zero audio assets.

import { rand, clamp } from './util.js';

let ctx = null;
let master = null;
let noiseBuf = null;
let compressor = null;
let musicBus = null;
// Music plays only inside a run and goes silent whenever the page is hidden,
// so it can default on without droning at you from a menu or a background tab.
// Two separate questions, deliberately kept apart:
//   music   — has the player switched music on? (a setting)
//   active  — does the game want music *right now*? (in a run, not paused)
// Music plays only when both are true and the page is visible. Conflating
// them is what once let the track start on the title screen.
export const audio = {
  muted: false, music: true, active: false, ready: false, suspended: false,
  musicVolume: 0.7,   // the player's slider, 0..1
  bossTrackUntil: 0,  // a boss playing its own music (the Maestro) keeps this in the future
};

// The slider maps onto the music bus through a curve, because loudness is
// heard logarithmically: a linear slider would do nothing across its top
// half. The old fixed bus gain was 0.6; the default now lands around 1.36,
// and full volume brings the melody up level with the combat effects.
const MUSIC_MAX_GAIN = 2.4;
function musicGain(v) { return Math.pow(clamp(v, 0, 1), 1.6) * MUSIC_MAX_GAIN; }

let makeup = null;
let outTap = null;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();

  // A gentle compressor on the whole mix. On a phone speaker it's the
  // difference between the music being present and being lost under hits,
  // and it stops SFX stacking into clipping during a busy fight.
  compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.knee.value = 18;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.2;
  // Make-up gain after the compressor. Without it the compressor only ever
  // turns things down, which on a phone speaker left the whole mix quiet.
  makeup = ctx.createGain();
  makeup.gain.value = 1.5;

  // Limiter as the very last stage. Measured without it, full music volume
  // plus a busy fight peaked at +2 dBFS — audible clipping. A hard, fast
  // compressor this close to 0 dB acts as a ceiling nothing can cross.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -2.5;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.08;

  // A meter on the final output, for checking levels from the console.
  outTap = ctx.createAnalyser();
  outTap.fftSize = 2048;
  compressor.connect(makeup).connect(limiter).connect(outTap).connect(ctx.destination);

  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(compressor);

  musicBus = ctx.createGain();
  musicBus.gain.value = musicGain(audio.musicVolume);
  musicBus.connect(master);

  // One second of white noise, reused for every percussive sound.
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  audio.ready = true;
}

export function toggleMute() {
  audio.muted = !audio.muted;
  if (master) master.gain.value = audio.muted ? 0 : 0.5;
  return audio.muted;
}

function now() { return ctx.currentTime; }

/**
 * `at` schedules at an absolute context time (the music scheduler needs this;
 * setInterval alone drifts audibly). `out` picks the bus. `filter` lets a
 * voice be shaped — how the bass gets harmonics a phone speaker can play.
 */
function tone({
  freq = 440, freq2 = null, type = 'square', dur = 0.12, vol = 0.25,
  delay = 0, attack = 0.004, at = null, out = null, filter = null,
}) {
  if (!ctx || audio.muted) return;
  const t = at !== null ? at : now() + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (freq2 !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(vol, t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = filter.type || 'lowpass';
    f.frequency.setValueAtTime(filter.freq, t);
    if (filter.freq2) f.frequency.exponentialRampToValueAtTime(filter.freq2, t + dur);
    f.Q.value = filter.q || 1;
    osc.connect(f).connect(gain);
  } else {
    osc.connect(gain);
  }
  gain.connect(out || master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise({
  dur = 0.12, vol = 0.3, freq = 1200, freq2 = null, q = 1, type = 'lowpass',
  delay = 0, at = null, out = null,
}) {
  if (!ctx || audio.muted) return;
  const t = at !== null ? at : now() + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = rand(0.85, 1.15);
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, t);
  if (freq2 !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(40, freq2), t + dur);
  filter.Q.value = q;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(gain).connect(out || master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export const sfx = {
  swing(power = 1) {
    noise({ dur: 0.13 * power, vol: 0.16, freq: 2600, freq2: 500, type: 'bandpass', q: 0.7 });
  },
  hit(power = 1) {
    noise({ dur: 0.07, vol: 0.26 * power, freq: 1800, freq2: 300 });
    tone({ freq: 180 * rand(0.9, 1.1), freq2: 60, type: 'triangle', dur: 0.09, vol: 0.2 * power });
  },
  crit() {
    tone({ freq: 900, freq2: 1600, type: 'square', dur: 0.09, vol: 0.16 });
    noise({ dur: 0.1, vol: 0.3, freq: 4000, freq2: 800, type: 'bandpass', q: 1.4 });
  },
  hurt() {
    tone({ freq: 260, freq2: 70, type: 'sawtooth', dur: 0.3, vol: 0.3 });
    noise({ dur: 0.2, vol: 0.25, freq: 900, freq2: 120 });
  },
  dash() {
    noise({ dur: 0.2, vol: 0.2, freq: 320, freq2: 3200, type: 'bandpass', q: 1.1 });
  },
  shoot() {
    tone({ freq: 720, freq2: 240, type: 'square', dur: 0.09, vol: 0.13 });
  },
  arrow() {
    noise({ dur: 0.12, vol: 0.18, freq: 3000, freq2: 900, type: 'bandpass', q: 2 });
  },
  explode() {
    noise({ dur: 0.55, vol: 0.42, freq: 900, freq2: 45 });
    tone({ freq: 110, freq2: 30, type: 'sawtooth', dur: 0.42, vol: 0.28 });
  },
  telegraph() {
    tone({ freq: 300, freq2: 620, type: 'sine', dur: 0.3, vol: 0.1 });
  },
  spawn() {
    tone({ freq: 90, freq2: 320, type: 'sine', dur: 0.35, vol: 0.14 });
  },
  pickup() {
    tone({ freq: 880, type: 'sine', dur: 0.08, vol: 0.16 });
    tone({ freq: 1320, type: 'sine', dur: 0.12, vol: 0.13, delay: 0.06 });
  },
  heal() {
    [523, 659, 784, 1047].forEach((f, i) =>
      tone({ freq: f, type: 'sine', dur: 0.3, vol: 0.13, delay: i * 0.07 }));
  },
  boon() {
    [392, 523, 659, 784, 1047].forEach((f, i) =>
      tone({ freq: f, type: 'triangle', dur: 0.55, vol: 0.14, delay: i * 0.08 }));
  },
  door() {
    tone({ freq: 160, freq2: 420, type: 'sine', dur: 0.5, vol: 0.16 });
    noise({ dur: 0.5, vol: 0.12, freq: 400, freq2: 1600, type: 'bandpass', q: 0.6 });
  },
  death() {
    [440, 330, 262, 196].forEach((f, i) =>
      tone({ freq: f, freq2: f * 0.5, type: 'sawtooth', dur: 0.7, vol: 0.2, delay: i * 0.16 }));
  },
  bossRoar() {
    tone({ freq: 70, freq2: 180, type: 'sawtooth', dur: 1.4, vol: 0.34 });
    noise({ dur: 1.4, vol: 0.3, freq: 260, freq2: 90 });
  },
  bossDown() {
    [523, 587, 698, 880, 1047].forEach((f, i) =>
      tone({ freq: f, type: 'triangle', dur: 0.8, vol: 0.18, delay: i * 0.13 }));
    noise({ dur: 1.0, vol: 0.2, freq: 1400, freq2: 120, delay: 0.1 });
  },
  ui() {
    tone({ freq: 620, type: 'triangle', dur: 0.05, vol: 0.11 });
  },
  block() {
    tone({ freq: 1400, freq2: 700, type: 'square', dur: 0.08, vol: 0.16 });
    noise({ dur: 0.12, vol: 0.24, freq: 5000, freq2: 1500, type: 'bandpass', q: 2.5 });
  },

  // --- boss kit. Everything a phone must hear keeps energy above ~250 Hz. ---
  beam() {
    tone({ freq: 380, freq2: 1200, type: 'sawtooth', dur: 0.35, vol: 0.12, filter: { freq: 2400 } });
    noise({ dur: 0.4, vol: 0.18, freq: 2600, freq2: 600, type: 'bandpass', q: 1.2 });
  },
  thud() {
    noise({ dur: 0.22, vol: 0.3, freq: 700, freq2: 90 });
    tone({ freq: 300, freq2: 90, type: 'triangle', dur: 0.16, vol: 0.18 });
  },
  // Version 4, Vesper: a revolver crack, a church-bell toll, a cylinder click.
  gunshot() {
    noise({ dur: 0.16, vol: 0.28, freq: 1800, freq2: 300, type: 'bandpass', q: 0.8 });
    tone({ freq: 160, freq2: 60, type: 'triangle', dur: 0.12, vol: 0.18 });
  },
  // Nagaraja: a long hiss and a tail rattle.
  hiss() {
    noise({ dur: 0.7, vol: 0.16, freq: 5200, freq2: 2600, type: 'highpass', q: 0.6 });
  },
  rattle() {
    for (let k = 0; k < 7; k++) noise({ dur: 0.035, vol: 0.12, freq: 3800, type: 'bandpass', q: 3, delay: k * 0.055 });
  },
  bell() {
    [220, 440, 660, 880].forEach((f, i) =>
      tone({ freq: f, type: 'sine', dur: 1.8 - i * 0.3, vol: 0.12 / (i + 1), attack: 0.005 }));
  },
  click() {
    tone({ freq: 2400, type: 'square', dur: 0.025, vol: 0.08 });
    tone({ freq: 1600, type: 'square', dur: 0.025, vol: 0.06, delay: 0.07 });
  },
  chime() {
    [784, 988, 1175].forEach((f, i) =>
      tone({ freq: f, type: 'sine', dur: 0.4, vol: 0.09, delay: i * 0.05 }));
  },
  splash() {
    noise({ dur: 0.4, vol: 0.28, freq: 1600, freq2: 300, type: 'bandpass', q: 0.8 });
    tone({ freq: 420, freq2: 160, type: 'sine', dur: 0.25, vol: 0.12 });
  },
  whirr() {
    tone({ freq: 260, freq2: 780, type: 'sawtooth', dur: 0.6, vol: 0.1, filter: { freq: 1500 } });
  },
  exposed() {
    // A bright two-note "now!" cue for the punish window.
    tone({ freq: 988, type: 'triangle', dur: 0.12, vol: 0.14 });
    tone({ freq: 1319, type: 'triangle', dur: 0.2, vol: 0.14, delay: 0.08 });
  },
  roar(pitch = 1) {
    tone({ freq: 120 * pitch, freq2: 320 * pitch, type: 'sawtooth', dur: 0.9, vol: 0.28, filter: { freq: 1800 } });
    noise({ dur: 0.9, vol: 0.26, freq: 900 * pitch, freq2: 260, type: 'bandpass', q: 0.7 });
  },
};

// --- music ------------------------------------------------------------------
//
// The first version was a 55 Hz sine thump. It was audible on headphones and
// essentially silent on a phone speaker, which physically can't reproduce
// much below ~250 Hz. So the melody now lives in the 290-600 Hz range, the
// bass is a filtered sawtooth whose upper harmonics a small speaker *can*
// play (the ear fills in the missing fundamental), and the drums lead with a
// click transient rather than pure low end.
//
// Notes are scheduled ahead against the AudioContext clock — a setInterval
// alone jitters by tens of milliseconds, which rhythm makes very obvious.

const BPM = 104;
const STEP = 60 / BPM / 4;          // one 16th note, in seconds
const LOOKAHEAD = 0.12;             // how far ahead notes are queued
const TICK_MS = 25;

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

// i - VI - VII - v in D minor: moody, and it resolves back on itself.
const PROGRESSION = [
  { root: 38, pad: [50, 53, 57], arp: [62, 65, 69, 74] },   // Dm
  { root: 34, pad: [46, 50, 53], arp: [58, 62, 65, 70] },   // Bb
  { root: 36, pad: [48, 52, 55], arp: [60, 64, 67, 72] },   // C
  { root: 33, pad: [45, 48, 52], arp: [57, 60, 64, 69] },   // Am
];
const ARP_WALK = [0, 1, 2, 3, 2, 1, 2, 3];
const BASS_STEPS = [0, 3, 6, 8, 11, 14];

let schedTimer = null;
let nextNoteTime = 0;
let stepIndex = 0;
let intensity = 1;                  // 0 calm, 1 combat, 2 boss

/** 0 = room cleared, 1 = fighting, 2 = boss. Read on every 16th note. */
export function setMusicIntensity(level) {
  intensity = clamp(level | 0, 0, 2);
}

function scheduleStep(n, t) {
  const s = n % 16;
  const chord = PROGRESSION[Math.floor(n / 16) % PROGRESSION.length];
  const bus = musicBus;

  // Pad: a soft chord per bar. Mid-register, so it survives a phone speaker.
  if (s === 0) {
    for (const m of chord.pad) {
      tone({
        freq: midi(m + 12), type: 'triangle', dur: STEP * 15, vol: intensity === 0 ? 0.05 : 0.04,
        attack: 0.28, at: t, out: bus,
      });
    }
  }

  // Bass: filtered saw. Octave-up double on the downbeat for small speakers.
  const bassOn = intensity === 0 ? (s === 0 || s === 8) : BASS_STEPS.includes(s);
  if (bassOn) {
    const f = midi(chord.root);
    tone({
      freq: f, type: 'sawtooth', dur: STEP * 1.8, vol: 0.11, at: t, out: bus,
      filter: { freq: intensity === 2 ? 1100 : 760, freq2: 240, q: 5 },
    });
    if (s === 0 || s === 8) {
      tone({ freq: f * 2, type: 'square', dur: STEP * 1.2, vol: 0.035, at: t, out: bus,
        filter: { freq: 1400, q: 1 } });
    }
  }

  // Arp: the part you actually hear on a phone. 8ths normally, 16ths for the boss.
  const arpEvery = intensity === 2 ? 1 : 2;
  if (s % arpEvery === 0) {
    const walk = ARP_WALK[Math.floor(s / 2) % ARP_WALK.length];
    const note = chord.arp[(walk + (intensity === 2 && s % 2 ? 2 : 0)) % chord.arp.length];
    tone({
      freq: midi(note), type: intensity === 2 ? 'sawtooth' : 'triangle',
      dur: STEP * 1.6, vol: intensity === 0 ? 0.05 : 0.065, at: t, out: bus,
      filter: intensity === 2 ? { freq: 2400, freq2: 700, q: 2 } : null,
    });
  }

  if (intensity === 0) return;

  // Kick: the click gives it presence on speakers with no real low end.
  const kickOn = intensity === 2 ? s % 4 === 0 : (s === 0 || s === 8);
  if (kickOn) {
    tone({ freq: 150, freq2: 45, type: 'sine', dur: 0.2, vol: 0.28, at: t, out: bus });
    noise({ dur: 0.02, vol: 0.12, freq: 3500, type: 'highpass', at: t, out: bus });
  }

  // Hats on the offbeats, doubled for the boss.
  if (s % 4 === 2 || (intensity === 2 && s % 2 === 1)) {
    noise({ dur: 0.04, vol: s % 4 === 2 ? 0.05 : 0.025, freq: 7000, type: 'highpass', at: t, out: bus });
  }

  // Snare backbeat only when the Warden is up.
  if (intensity === 2 && (s === 4 || s === 12)) {
    noise({ dur: 0.14, vol: 0.12, freq: 1800, type: 'bandpass', q: 0.8, at: t, out: bus });
    tone({ freq: 210, freq2: 140, type: 'triangle', dur: 0.1, vol: 0.08, at: t, out: bus });
  }
}

function scheduler() {
  if (!ctx) return;
  // After a suspend the clock has moved on; never try to "catch up" a backlog.
  if (nextNoteTime < ctx.currentTime - 0.2) nextNoteTime = ctx.currentTime + 0.05;
  while (nextNoteTime < ctx.currentTime + LOOKAHEAD) {
    if (!audio.muted && !(performance.now() < audio.bossTrackUntil)) scheduleStep(stepIndex, nextNoteTime);
    nextNoteTime += STEP;
    stepIndex++;
  }
}

/** The one place that decides whether the scheduler runs. */
function refreshMusic() {
  const want = !!ctx && audio.music && audio.active && !audio.suspended;
  if (want && !schedTimer) {
    stepIndex = 0;
    nextNoteTime = ctx.currentTime + 0.06;
    schedTimer = setInterval(scheduler, TICK_MS);
    scheduler();
  } else if (!want && schedTimer) {
    clearInterval(schedTimer);
    schedTimer = null;
  }
}

/** Game state says whether music belongs here. Cheap enough to call per frame. */
export function setMusicActive(on) {
  audio.active = !!on;
  refreshMusic();
}

/** The player's setting. Never starts playback by itself. */
export function setMusicEnabled(on) {
  audio.music = !!on;
  refreshMusic();
  return audio.music;
}

export function setMusicVolume(v) {
  audio.musicVolume = clamp(v, 0, 1);
  if (musicBus) musicBus.gain.setTargetAtTime(musicGain(audio.musicVolume), ctx.currentTime, 0.03);
  return audio.musicVolume;
}

/**
 * Play a short phrase through the music bus so a volume change can be heard.
 * The slider lives on the pause screen, where the track itself is stopped.
 */
let lastPreview = -1;
export function previewMusic() {
  if (!ctx || audio.muted || schedTimer) return;   // live track already audible
  if (ctx.currentTime - lastPreview < 0.45) return;
  lastPreview = ctx.currentTime;
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  const chord = PROGRESSION[0];
  const t0 = ctx.currentTime + 0.02;
  for (const m of chord.pad) {
    tone({ freq: midi(m + 12), type: 'triangle', dur: 0.95, vol: 0.04, attack: 0.08, at: t0, out: musicBus });
  }
  chord.arp.forEach((m, i) => {
    tone({ freq: midi(m), type: 'triangle', dur: STEP * 1.6, vol: 0.065, at: t0 + i * STEP * 2, out: musicBus });
  });
}

// --- the Maestro's band ------------------------------------------------------
//
// The Maestro plays his own piece, one voice per attack, triggered from the
// game's beat clock. Percussion goes through the master bus (the beat is
// gameplay, so it plays even with music off); the melodic voices go through
// the music bus and respect the music setting and slider.

const melodicBus = () => (audio.music ? musicBus : null);

export const band = {
  /** Keep the regular track quiet for a moment (called every frame he's alive). */
  takeStage() { audio.bossTrackUntil = performance.now() + 300; },
  kick(vol = 1) {
    tone({ freq: 150, freq2: 45, type: 'sine', dur: 0.2, vol: 0.3 * vol });
    noise({ dur: 0.02, vol: 0.12 * vol, freq: 3500, type: 'highpass' });
  },
  snare(vol = 1) {
    noise({ dur: 0.14, vol: 0.14 * vol, freq: 1800, type: 'bandpass', q: 0.8 });
    tone({ freq: 210, freq2: 140, type: 'triangle', dur: 0.1, vol: 0.08 * vol });
  },
  hat(vol = 1) { noise({ dur: 0.04, vol: 0.05 * vol, freq: 7000, type: 'highpass' }); },
  crash() { noise({ dur: 0.9, vol: 0.18, freq: 6000, freq2: 2500, type: 'highpass', q: 0.5 }); },
  click() { tone({ freq: 1800, type: 'square', dur: 0.03, vol: 0.1 }); },
  timpani(m, vol = 1) {
    tone({ freq: midi(m), freq2: midi(m) * 0.8, type: 'sine', dur: 0.6, vol: 0.3 * vol });
    tone({ freq: midi(m) * 2, type: 'triangle', dur: 0.25, vol: 0.08 * vol });
    noise({ dur: 0.08, vol: 0.1 * vol, freq: 600 });
  },
  pizz(m, vol = 1) {
    const out = melodicBus(); if (!out) return;
    tone({ freq: midi(m), type: 'triangle', dur: 0.2, vol: 0.12 * vol, out, filter: { freq: 2600, freq2: 700, q: 1 } });
  },
  bell(m) {
    const out = melodicBus(); if (!out) return;
    tone({ freq: midi(m), type: 'sine', dur: 0.9, vol: 0.1, out });
    tone({ freq: midi(m) * 2.76, type: 'sine', dur: 0.4, vol: 0.03, out });
  },
  brass(ms) {
    const out = melodicBus(); if (!out) return;
    for (const m of ms) tone({ freq: midi(m), type: 'sawtooth', dur: 0.5, vol: 0.07, attack: 0.03, out, filter: { freq: 1600, freq2: 700, q: 2 } });
  },
  strings(ms, dur) {
    const out = melodicBus(); if (!out) return;
    for (const m of ms) tone({ freq: midi(m), type: 'sawtooth', dur: Math.max(0.2, dur), vol: 0.03, attack: 0.15, out, filter: { freq: 1800, q: 0.7 } });
  },
  bass(m, dur) {
    const out = melodicBus(); if (!out) return;
    tone({ freq: midi(m), type: 'sawtooth', dur: Math.max(0.1, dur), vol: 0.1, out, filter: { freq: 900, freq2: 260, q: 4 } });
  },
  /** The melody: a soft triangle with a quiet, slightly detuned saw for body. */
  lead(m, dur) {
    const out = melodicBus(); if (!out) return;
    const d = Math.max(0.12, dur * 0.95);
    tone({ freq: midi(m), type: 'triangle', dur: d, vol: 0.085, attack: 0.02, out });
    tone({ freq: midi(m) * 1.006, type: 'sawtooth', dur: d, vol: 0.022, attack: 0.03, out, filter: { freq: 2200, freq2: 900, q: 0.8 } });
  },
  harp(m) {
    const out = melodicBus(); if (!out) return;
    tone({ freq: midi(m), type: 'triangle', dur: 0.45, vol: 0.08, attack: 0.002, out });
    tone({ freq: midi(m) * 2, type: 'sine', dur: 0.25, vol: 0.025, out });
  },
  organ(ms, dur) {
    const out = melodicBus(); if (!out) return;
    for (const m of ms) {
      tone({ freq: midi(m), type: 'square', dur: Math.max(0.2, dur), vol: 0.03, attack: 0.04, out, filter: { freq: 1500, q: 0.7 } });
      tone({ freq: midi(m) * 2, type: 'sine', dur: Math.max(0.2, dur), vol: 0.02, attack: 0.04, out });
    }
  },
  /** A great bass drum: a deep boom, a click of the beater, and a rumble. */
  bassDrum(vol = 1) {
    tone({ freq: 95, freq2: 36, type: 'sine', dur: 0.55, vol: 0.4 * vol });
    tone({ freq: 190, freq2: 70, type: 'triangle', dur: 0.2, vol: 0.12 * vol });
    noise({ dur: 0.35, vol: 0.14 * vol, freq: 260, freq2: 80 });
  },
  /** A metronome's wooden tick. */
  tick() {
    tone({ freq: 1250, type: 'square', dur: 0.03, vol: 0.09 });
    tone({ freq: 830, type: 'triangle', dur: 0.05, vol: 0.06, delay: 0.005 });
  },
  sforzando(ms) {
    band.kick(1.2);
    band.crash();
    band.brass(ms.map((m) => m + 12));
    band.brass(ms);
  },
};

/** Peak and RMS of the final output, in dBFS, over the analyser's window. */
export function outputLevel() {
  if (!outTap) return null;
  const buf = new Float32Array(outTap.fftSize);
  outTap.getFloatTimeDomainData(buf);
  let peak = 0, sum = 0;
  for (const v of buf) { const a = Math.abs(v); if (a > peak) peak = a; sum += v * v; }
  const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
  return { peakDb: db(peak), rmsDb: db(Math.sqrt(sum / buf.length)) };
}

export function startMusic() { setMusicActive(true); }
export function stopMusic() { setMusicActive(false); }

/**
 * Mobile browsers — iOS Safari especially — only let an AudioContext start
 * inside certain gestures, and which ones has changed between versions. This
 * is called from several gesture types and simply retries until it's running.
 */
export function unlockAudio() {
  if (!ctx || audio.suspended) return;
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
}

/**
 * Silence everything while the page is hidden.
 *
 * Without this the music timer keeps firing in a background tab — you tab away
 * and the game is still thumping at you from a window you can't see.
 */
export function suspendAudio() {
  audio.suspended = true;
  refreshMusic();
  if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
}

export function resumeAudio() {
  audio.suspended = false;
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  // Only resumes the music if the game still wants it — returning to a tab
  // that's sitting on the title screen must stay quiet.
  refreshMusic();
}

/** Debug helpers: is the music loop actually ticking, and is the context live? */
export function musicRunning() { return schedTimer !== null; }
export function audioContextState() { return ctx ? ctx.state : 'none'; }

export function setVolume(v) {
  if (master) master.gain.value = audio.muted ? 0 : clamp(v, 0, 1);
}
