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
export const audio = { muted: false, music: true, active: false, ready: false, suspended: false };

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
  compressor.connect(ctx.destination);

  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(compressor);

  musicBus = ctx.createGain();
  musicBus.gain.value = 0.6;
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
    if (!audio.muted) scheduleStep(stepIndex, nextNoteTime);
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
