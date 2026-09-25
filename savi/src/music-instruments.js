// Instruments for the region music, modelled in JavaScript and rendered once
// into AudioBuffers: a piano, an electric piano, a music box, a kalimba, a
// marimba and a harp - plus a soft string pad played live.
//
// The owner did not like the first set (the flute, the bowed voice, the felt
// santoor). Struck and plucked instruments model far better than blown or
// bowed ones: once struck, a string, a tine or a bar is just a handful of
// decaying partials, and getting those partials right is what makes it
// sound real. So:
//   - PIANO: modal synthesis. Each partial of a stiff string is slightly
//     sharp (inharmonicity, f_n = n·f·sqrt(1 + B·n²), B growing up the
//     keyboard). The hammer strikes an eighth of the way along, which sets
//     how loud each partial is. Every note has two strings a hair apart in
//     tune, one dying fast (the prompt sound) and one slowly (the aftersound):
//     their beating and the two-stage fade are the piano's bloom. A short
//     filtered noise gives the hammer's knock, and a damper stops the note
//     when it is released.
//   - ELECTRIC PIANO: FM synthesis, as in the DX7's famous Rhodes. A sine
//     modulates another at the same frequency, hard at the strike and then
//     gently, plus a quick high "tine" partial for the bark.
//   - MUSIC BOX and KALIMBA: a tine is a clamped bar, whose partials sit at
//     1, 6.27 and 17.55 times the fundamental; the high ones die quickly.
//   - MARIMBA: a bar tuned so its overtones sit near 4× and 10×, a soft mallet.
//   - HARP: a plucked string, harmonic partials, the pluck point in the middle
//     third, the upper partials fading first.
// Rendered at 24 kHz (plenty under the room's filter), mono, a few
// milliseconds each; cached per note, and rendered ahead by the scheduler.

import { midi } from './music-kit.js';

const SR = 24000;
let bank = null;
function getBank(c) {
  if (!bank || bank.ctx !== c) bank = { ctx: c, cache: new Map(), hall: null };
  return bank;
}

// --- modal rendering -----------------------------------------------------------------

/**
 * Sum decaying sine partials into a buffer: [freq, amp, t60] each, a short
 * attack ramp, and an optional noise knock.
 */
function renderModes(len, modes, o = {}) {
  const out = new Float32Array(len);
  for (const [f, a, t60] of modes) {
    if (f >= SR * 0.45 || a <= 0) continue;
    const w = 2 * Math.PI * f / SR;
    const cw = Math.cos(w), sw = Math.sin(w);
    const d = Math.exp(-6.91 / (t60 * SR));
    let x = 1, y = 0, amp = a;
    const n = Math.min(len, Math.ceil(t60 * SR * 1.2));
    for (let i = 0; i < n; i++) {
      out[i] += amp * y;
      const nx = cw * x - sw * y;
      y = sw * x + cw * y;
      x = nx;
      amp *= d;
    }
  }
  if (o.knock) {
    // A short burst of noise, low-passed by a one-pole filter.
    const kl = Math.floor(SR * (o.knockLen || 0.012));
    const kcoef = Math.exp(-2 * Math.PI * (o.knockTone || 1500) / SR);
    let lp = 0;
    for (let i = 0; i < kl; i++) {
      lp = (1 - kcoef) * (Math.random() * 2 - 1) + kcoef * lp;
      out[i] += lp * o.knock * (1 - i / kl);
    }
  }
  const atk = Math.floor(SR * (o.attack || 0.0015));
  for (let i = 0; i < atk; i++) out[i] *= i / atk;
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = peak > 0 ? 1 / peak : 1;
  for (let i = 0; i < len; i++) out[i] *= g;
  // Fade the tail so a buffer never ends on a click.
  const tail = Math.min(len, Math.floor(SR * 0.05));
  for (let i = 0; i < tail; i++) out[len - 1 - i] *= i / tail;
  return out;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function piano(m) {
  const f = midi(m);
  const T = clamp(10 * Math.pow(2, -(m - 45) / 15), 1.3, 10);     // the fundamental's T60
  const len = Math.floor(SR * Math.min(5.5, T * 0.7 + 0.6));
  const B = 0.00008 * Math.pow(2, (m - 48) / 13);
  const modes = [];
  for (let n = 1; n <= 24; n++) {
    const fn = n * f * Math.sqrt(1 + B * n * n);
    const a = Math.abs(Math.sin(Math.PI * n / 8)) / Math.pow(n, 1.15) * Math.exp(-(n - 1) * 0.07) + (n === 8 ? 0.004 : 0);
    const Tn = T / (1 + 0.32 * (n - 1));
    modes.push([fn * (1 - 0.00045), a * 0.6, Tn * 0.3]);      // string one: the prompt sound
    modes.push([fn * (1 + 0.00055), a * 0.4, Tn]);            // string two: the aftersound
  }
  return renderModes(len, modes, { knock: 0.05, knockTone: Math.min(3000, f * 3), attack: 0.002 });
}

function epiano(m) {
  const f = midi(m);
  const T = clamp(5 * Math.pow(2, -(m - 60) / 22), 1.4, 7);
  const len = Math.floor(SR * Math.min(4.5, T * 0.8 + 0.3));
  const out = new Float32Array(len);
  const w = 2 * Math.PI * f / SR;
  const dEnv = Math.exp(-6.91 / (T * SR));
  let env = 1, ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const index = 1.5 * Math.exp(-t / 0.16) + 0.28;
    const mod = Math.sin(ph) * index;
    const tine = Math.sin(ph * 7.02) * 0.1 * Math.exp(-t / 0.04);
    out[i] = (Math.sin(ph + mod) + tine) * env * Math.min(1, i / (SR * 0.002));
    ph += w;
    env *= dEnv;
  }
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
  for (let i = 0; i < len; i++) out[i] /= peak || 1;
  const tail = Math.floor(SR * 0.05);
  for (let i = 0; i < tail; i++) out[len - 1 - i] *= i / tail;
  return out;
}

function tine(m, T, parts, knock) {
  const f = midi(m);
  const len = Math.floor(SR * Math.min(4, T + 0.4));
  return renderModes(len, parts.map(([r, a, tr]) => [f * r, a, T * tr]), { knock, knockTone: 5000, knockLen: 0.004, attack: 0.001 });
}
const musicbox = (m) => tine(m, clamp(2.4 * Math.pow(2, -(m - 72) / 24), 0.9, 3.2), [[1, 1, 1], [2, 0.05, 0.5], [6.27, 0.2, 0.16], [17.55, 0.05, 0.05]], 0.03);
const kalimba = (m) => tine(m, clamp(2 * Math.pow(2, -(m - 64) / 24), 0.8, 3), [[1, 1, 1], [5.95, 0.14, 0.12], [2, 0.03, 0.4]], 0.02);
function marimba(m) {
  const f = midi(m);
  const T = clamp(1.4 * Math.pow(2, -(m - 60) / 26), 0.4, 2.2);
  return renderModes(Math.floor(SR * (T + 0.3)), [[f, 1, T], [f * 3.93, 0.22, T * 0.22], [f * 9.2, 0.06, T * 0.07]], { knock: 0.03, knockTone: 1800, knockLen: 0.005, attack: 0.001 });
}
function harp(m) {
  const f = midi(m);
  const T = clamp(4.5 * Math.pow(2, -(m - 55) / 20), 1.2, 6);
  const modes = [];
  for (let n = 1; n <= 16; n++) modes.push([n * f * (1 + 0.00002 * n * n), Math.abs(Math.sin(Math.PI * n * 0.3)) / Math.pow(n, 1.5), T / (1 + 0.45 * (n - 1))]);
  return renderModes(Math.floor(SR * Math.min(5, T * 0.8 + 0.4)), modes, { knock: 0.01, knockTone: 2500, knockLen: 0.003, attack: 0.0015 });
}

/**
 * The instruments. `oct` moves a melody into the instrument's own register;
 * `vol` evens out their loudness; `damp` is how quickly a released note stops
 * (0: it rings on, like a bar or a tine).
 */
export const INSTRUMENTS = {
  piano: { label: 'Piano', render: piano, oct: 0, vol: 1, damp: 0.09 },
  epiano: { label: 'Electric piano', render: epiano, oct: 0, vol: 0.85, damp: 0.12 },
  musicbox: { label: 'Music box', render: musicbox, oct: 0, vol: 0.7, damp: 0 },
  kalimba: { label: 'Kalimba', render: kalimba, oct: 0, vol: 0.95, damp: 0 },
  marimba: { label: 'Marimba', render: marimba, oct: 0, vol: 1, damp: 0 },
  harp: { label: 'Harp', render: harp, oct: 0, vol: 1, damp: 0 },
};

function buffer(c, name, m) {
  const b = getBank(c);
  const key = `${name}${m}`;
  let buf = b.cache.get(key);
  if (!buf) {
    const data = INSTRUMENTS[name].render(m);
    buf = c.createBuffer(1, data.length, SR);
    buf.getChannelData(0).set(data);
    b.cache.set(key, buf);
  }
  return buf;
}

/** Render one note ahead of use (for the scheduler's warm-up queue). */
export const warmInst = (name, m) => (c) => buffer(c, name, m);

// --- the hall -----------------------------------------------------------------------

/** A stereo room, brighter and longer than the old one: a small concert hall. */
function makeHallIR(c) {
  const len = Math.floor(c.sampleRate * 2.4);
  const ir = c.createBuffer(2, len, c.sampleRate);
  const pre = Math.floor(c.sampleRate * 0.018);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / c.sampleRate;
      const bright = Math.exp(-t * 2.2);
      const coef = 0.2 + 0.7 * (1 - bright);      // darker as it fades
      lp = (1 - coef) * (Math.random() * 2 - 1) + coef * lp;
      d[i] = lp * Math.exp(-t * 2.9);
    }
  }
  return ir;
}

function hall(k) {
  const b = getBank(k.ctx);
  if (b.hall && b.hall.bus === k.bus) return b.hall;
  const c = k.ctx;
  const input = c.createGain();
  const tone = c.createBiquadFilter();
  tone.type = 'lowpass'; tone.frequency.value = 7500; tone.Q.value = 0.5;
  input.connect(tone).connect(k.bus);
  const conv = c.createConvolver();
  conv.buffer = makeHallIR(c);
  const wet = c.createGain();
  wet.gain.value = 0.2;
  input.connect(conv);
  conv.connect(wet).connect(k.bus);
  b.hall = { bus: k.bus, input };
  return b.hall;
}

const ready = (k) => k.ctx && k.bus && !k.muted();

/** The hall's input, for live voices (drums, the pad). */
export function hallIn(k) { return ready(k) ? hall(k).input : null; }

/**
 * Play a note. `dur` is how long it is held: a damped instrument stops soon
 * after (unless `pedal`); a tine or a bar rings out its own length.
 */
export function inst(k, name, m, t, o = {}) {
  if (!ready(k) || !INSTRUMENTS[name]) return;
  const spec = INSTRUMENTS[name];
  const c = k.ctx;
  const src = c.createBufferSource();
  src.buffer = buffer(c, name, m);
  const g = c.createGain();
  const v = (o.vol ?? 0.05) * spec.vol * (0.94 + Math.random() * 0.08);
  g.gain.value = v;
  let head = src.connect(g);
  if (c.createStereoPanner) {
    const p = c.createStereoPanner();
    // A little spread across the keyboard, as a piano sounds from the bench.
    p.pan.value = clamp(o.pan ?? (m - 66) / 40, -0.6, 0.6);
    head = head.connect(p);
  }
  head.connect(hall(k).input);
  // Humanised: a few milliseconds early or late.
  const at = t + (Math.random() - 0.5) * 0.008;
  src.start(at);
  if (spec.damp && o.dur && !o.pedal) {
    const off = at + Math.max(0.08, o.dur);
    g.gain.setValueAtTime(v, off);
    g.gain.setTargetAtTime(0.0001, off, spec.damp);
    src.stop(off + spec.damp * 8);
  }
}

/** A chord rolled from the bottom up, as a pianist or a harpist spreads it. */
export function roll(k, name, notes, t, o = {}) {
  notes.forEach((m, i) => inst(k, name, m, t + i * (o.spread ?? 0.035), o));
}

/** A soft string pad: a few detuned, filtered saws that swell in and out. */
export function pad(k, notes, t, dur, vol = 0.006) {
  const out = hallIn(k);
  if (!out) return;
  const c = k.ctx;
  for (const m of notes) {
    for (const det of [-6, 5]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midi(m);
      o.detune.value = det;
      const f = c.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 950; f.Q.value = 0.4;
      const g = c.createGain();
      const a = Math.min(1.6, dur * 0.35);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vol, t + a);
      g.gain.setValueAtTime(vol, t + dur - a);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(f).connect(g).connect(out);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }
}
