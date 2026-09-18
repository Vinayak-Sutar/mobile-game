// Sampled instruments, synthesised in JavaScript: a sitar, a tanpura, a
// swarmandal and a tabla, for Solenne's Raag Desh theme.
//
// Oscillators alone sound like oscillators. The trick here is to *model* the
// instruments once, sample by sample, into AudioBuffers, then play those
// back - cheap at run time, and far richer than anything built from live
// oscillator nodes:
//
//   - Strings use Karplus-Strong: a burst of noise circulating in a delay
//     line exactly one period long, low-passed a little on every pass, so it
//     rings and darkens like a real plucked string. The pluck position is a
//     comb on the burst, fine tuning is an all-pass in the loop, and the
//     SITAR's jawari - the flat curved bridge that makes it buzz - is an
//     asymmetric clip inside the loop: loud swings hit the "bridge", keep
//     regenerating harmonics, and the buzz fades as the note does.
//   - The TABLA is modal synthesis. A tabla's right drum (dayan) is famous for
//     its nearly harmonic overtones (C. V. Raman's discovery, thanks to the
//     black syahi), so each stroke is a set of decaying harmonic partials plus
//     a noise click: rim strokes (na, ta) favour the upper partials, the open
//     centre stroke (tin) rings on the fundamental, damped strokes (ti, ra)
//     die almost at once. The left drum (bayan) booms, and its pitch rises
//     under the heel of the palm - that slide is the tabla's voice.
//   - Everything shares a small ROOM: a reverb whose impulse response is
//     decaying noise, darker as it fades, so the ensemble sits in one space.
//
// Buffers are rendered lazily, the first time each note or stroke is needed,
// so the cost is spread out and tiny.

import { rand } from './util.js';
import { midi } from './music-kit.js';

let bank = null;

function getBank(c) {
  if (!bank || bank.ctx !== c) bank = { ctx: c, sr: c.sampleRate, cache: new Map(), room: null };
  return bank;
}

function cached(c, key, make) {
  const b = getBank(c);
  let buf = b.cache.get(key);
  if (!buf) {
    const data = make(b.sr);
    buf = c.createBuffer(1, data.length, b.sr);
    buf.getChannelData(0).set(data);
    b.cache.set(key, buf);
  }
  return buf;
}

function normalise(out, peak = 0.95) {
  let m = 0;
  for (let i = 0; i < out.length; i++) m = Math.max(m, Math.abs(out[i]));
  if (m > 0) { const k = peak / m; for (let i = 0; i < out.length; i++) out[i] *= k; }
  return out;
}

// --- Karplus-Strong strings --------------------------------------------------------

/**
 * A plucked string.
 *   t60      seconds for the note to die away
 *   damp     loop low-pass: 0.5 is the classic dull string, lower is brighter
 *   bright   how bright the pluck's burst of noise is (0..1)
 *   pick     pluck position along the string (a comb on the burst)
 *   jawari   the sitar bridge: loud swings above this are clipped, which buzzes
 */
function renderString(sr, freq, dur, o) {
  const n = Math.floor(sr * dur);
  const out = new Float32Array(n);
  const period = sr / freq;
  const damp = o.damp ?? 0.5;
  // Loop delay: L samples + the averaging filter's half sample + the all-pass.
  let L = Math.floor(period - damp - 0.05);
  let d = period - damp - L;
  if (d < 0.1) { L -= 1; d += 1; }
  L = Math.max(2, L);
  const C = (1 - d) / (1 + d);
  const decay = Math.exp(Math.log(0.001) / (o.t60 * freq));

  // The burst: noise, softened, combed by the pluck position.
  const exc = new Float32Array(L);
  let lp = 0;
  for (let i = 0; i < L; i++) { lp += ((Math.random() * 2 - 1) - lp) * (o.bright ?? 0.6); exc[i] = lp; }
  const buf = new Float32Array(L);
  const pp = Math.max(1, Math.floor(L * (o.pick ?? 0.13)));
  for (let i = 0; i < L; i++) buf[i] = exc[i] - 0.9 * exc[(i - pp + L) % L];
  let m = 0;
  for (let i = 0; i < L; i++) m = Math.max(m, Math.abs(buf[i]));
  for (let i = 0; i < L; i++) buf[i] /= m || 1;

  let idx = 0, apX = 0, apY = 0;
  const jaw = o.jawari || 0;
  for (let i = 0; i < n; i++) {
    const a = buf[idx], b = buf[idx + 1 < L ? idx + 1 : 0];
    let v = decay * (a * (1 - damp) + b * damp);
    const y = C * v + apX - C * apY;
    apX = v; apY = y; v = y;
    if (jaw && v > jaw) v = jaw + (v - jaw) * 0.22;          // the bridge
    buf[idx] = v;
    out[i] = a;
    idx = idx + 1 < L ? idx + 1 : 0;
  }
  // The pluck itself: a few milliseconds of bright click (the mizrab).
  if (o.click) {
    const cn = Math.floor(sr * 0.004);
    let hp = 0, prev = 0;
    for (let i = 0; i < cn; i++) {
      const w = Math.random() * 2 - 1;
      hp = 0.7 * (hp + w - prev); prev = w;
      out[i] += hp * o.click * (1 - i / cn);
    }
  }
  return normalise(out);
}

// --- modal drums -------------------------------------------------------------------

/**
 * A drum stroke: decaying partials [ratio, amplitude, seconds] over f0, an
 * onset pitch drop (`bend`), a pitch rise (`rise` over `riseT`, the bayan's
 * palm slide), and a noise click low- or high-passed.
 */
function renderDrum(sr, dur, f0, partials, o = {}) {
  const n = Math.floor(sr * dur);
  const out = new Float32Array(n);
  // Envelopes advance by multiplication: one sine per partial per sample.
  const ph = partials.map(() => rand(0, 6.28));
  const env = partials.map((p) => p[1]);
  const fall = partials.map((p) => Math.exp(-1 / (p[2] * sr)));
  let bendE = o.bend || 0;
  const bendF = Math.exp(-1 / ((o.bendT || 0.02) * sr));
  let riseE = 1;
  const riseF = Math.exp(-1 / ((o.riseT || 0.12) * sr));
  const w0 = (6.283185 * f0) / sr;
  for (let i = 0; i < n; i++) {
    const k = 1 + bendE + (o.rise || 0) * (1 - riseE);
    bendE *= bendF;
    riseE *= riseF;
    let v = 0;
    for (let p = 0; p < partials.length; p++) {
      ph[p] += w0 * partials[p][0] * k;
      v += env[p] * Math.sin(ph[p]);
      env[p] *= fall[p];
    }
    out[i] = v;
  }
  if (o.noise) {
    const { amp, decay, color } = o.noise;
    let lp = 0;
    const nn = Math.min(n, Math.floor(sr * decay * 6));
    for (let i = 0; i < nn; i++) {
      const w = Math.random() * 2 - 1;
      lp += (w - lp) * (color === 'low' ? 0.08 : 0.5);
      const s = color === 'high' ? w - lp : lp;
      out[i] += s * amp * Math.exp(-(i / sr) / decay);
    }
  }
  return normalise(out);
}

const DAYAN_F = midi(62);        // the right drum is tuned to Sa (D)

const STROKES = {
  // Rim: the upper harmonics ring, with a sharp click.
  na: (sr) => renderDrum(sr, 0.9, DAYAN_F, [[1, 0.55, 0.5], [2, 1, 0.42], [3, 0.75, 0.28], [4.01, 0.45, 0.2], [5.03, 0.25, 0.13]], { bend: 0.03, noise: { amp: 0.55, decay: 0.004, color: 'high' } }),
  // Open centre: the fundamental sings.
  tin: (sr) => renderDrum(sr, 1.2, DAYAN_F, [[1, 1, 0.95], [2, 0.38, 0.55], [3, 0.16, 0.32]], { bend: 0.02, noise: { amp: 0.25, decay: 0.003, color: 'high' } }),
  // Damped: fingers stay on the skin, so it is almost only the click.
  ti: (sr) => renderDrum(sr, 0.12, DAYAN_F, [[1, 0.45, 0.028], [2, 0.35, 0.022], [3, 0.3, 0.018]], { noise: { amp: 0.8, decay: 0.006, color: 'high' } }),
  ra: (sr) => renderDrum(sr, 0.12, DAYAN_F * 1.02, [[1, 0.5, 0.03], [2, 0.3, 0.02]], { noise: { amp: 0.6, decay: 0.007, color: 'mid' } }),
  // The bayan's ge, three ways: flat, a little slide, a full swoop up.
  ge0: (sr) => renderDrum(sr, 0.8, 98, [[1, 1, 0.5], [2, 0.55, 0.3], [3, 0.22, 0.2]], { rise: 0.08, riseT: 0.1, noise: { amp: 0.4, decay: 0.012, color: 'low' } }),
  ge1: (sr) => renderDrum(sr, 0.9, 96, [[1, 1, 0.6], [2, 0.55, 0.34], [3, 0.22, 0.22]], { rise: 0.3, riseT: 0.13, noise: { amp: 0.4, decay: 0.012, color: 'low' } }),
  ge2: (sr) => renderDrum(sr, 1.0, 94, [[1, 1, 0.7], [2, 0.55, 0.38], [3, 0.22, 0.24]], { rise: 0.55, riseT: 0.16, noise: { amp: 0.4, decay: 0.012, color: 'low' } }),
  // Ka: the flat slap of the left hand, no ring.
  ka: (sr) => renderDrum(sr, 0.15, 120, [[1, 0.5, 0.035], [2.3, 0.2, 0.02]], { noise: { amp: 1, decay: 0.018, color: 'low' } }),
};

// --- the room ----------------------------------------------------------------------

function makeIR(c) {
  const sr = c.sampleRate, len = Math.floor(sr * 1.9);
  const ir = c.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      // Darker as it fades: the smoothing grows over the tail.
      const k = 0.9 - Math.min(0.8, t * 0.5);
      lp += ((Math.random() * 2 - 1) - lp) * k;
      d[i] = lp * Math.exp(-t / 0.42) * (i < sr * 0.012 ? i / (sr * 0.012) : 1);
    }
  }
  return ir;
}

/** The shared room: a dry mix, a reverb send, and the sitar's wooden body. */
function room(k) {
  const b = getBank(k.ctx);
  if (b.room && b.room.bus === k.bus) return b.room;
  const c = k.ctx;
  const mix = c.createGain();
  mix.connect(k.bus);
  const conv = c.createConvolver();
  conv.buffer = makeIR(c);
  const wet = c.createGain();
  wet.gain.value = 0.3;
  mix.connect(conv);
  conv.connect(wet).connect(k.bus);
  // The gourd and the neck: a warm low resonance and a bright upper one.
  const sitar = c.createGain();
  const body1 = c.createBiquadFilter();
  body1.type = 'peaking'; body1.frequency.value = 330; body1.Q.value = 1.1; body1.gain.value = 4;
  const body2 = c.createBiquadFilter();
  body2.type = 'peaking'; body2.frequency.value = 2700; body2.Q.value = 1.4; body2.gain.value = 5;
  sitar.connect(body1).connect(body2).connect(mix);
  b.room = { bus: k.bus, mix, sitar, lead: null };
  return b.room;
}

function play(k, buf, t, vol, out, rate = null) {
  const c = k.ctx;
  const src = c.createBufferSource();
  src.buffer = buf;
  if (rate) rate(src.playbackRate);
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(g).connect(out);
  src.start(t);
  return { src, g };
}

const ready = (k) => k.ctx && k.bus && !k.muted();

/**
 * Render ahead: called every step, it builds one not-yet-made sound from the
 * list, so the first notes of the piece never stall the game.
 */
const WARM = [];
export function prewarm(k, list) {
  if (!k.ctx) return;
  if (!WARM.length && list) WARM.push(...list);
  const job = WARM.shift();
  if (job) job(k.ctx);
}
export const warmSitar = (m) => (c) => sitarBuf(c, m);
export const warmStroke = (name) => (c) => cached(c, `tb_${name}`, STROKES[name]);

// --- the instruments -----------------------------------------------------------------

const sitarBuf = (c, m) => cached(c, `sitar${m}`, (sr) => renderString(sr, midi(m), 3.2, { t60: 2.6, damp: 0.34, bright: 0.75, pick: 0.11, jawari: 0.32, click: 0.5 }));

/**
 * The sitar's main string. Monophonic like the real one: a new stroke stops
 * the last. `kan` graces the note from another; `meend` pulls the sounding
 * string on to another note without a new stroke.
 */
export function sitar(k, m, t, dur, o = {}) {
  if (!ready(k)) return;
  const r = room(k);
  if (r.lead) r.lead.g.gain.setTargetAtTime(0.0001, t, 0.02);
  const vol = (o.vol ?? 0.13) * rand(0.92, 1.05);
  r.lead = play(k, sitarBuf(k.ctx, m), t, vol, r.sitar, (pr) => {
    pr.setValueAtTime(o.kan !== undefined ? Math.pow(2, (o.kan - m) / 12) : 1, t);
    if (o.kan !== undefined) pr.setValueAtTime(1, t + 0.055);
    if (o.meend !== undefined) {
      pr.setValueAtTime(1, t + dur * 0.3);
      pr.exponentialRampToValueAtTime(Math.pow(2, (o.meend - m) / 12), t + dur * 0.9);
    }
  });
  // The sympathetic strings (taraf) answer the notes of the raga.
  if (o.taraf !== false) {
    play(k, tarafBuf(k.ctx, m + 12), t + 0.02, vol * 0.18, r.mix);
  }
}

const tarafBuf = (c, m) => cached(c, `taraf${m}`, (sr) => renderString(sr, midi(m), 3.5, { t60: 3.2, damp: 0.3, bright: 0.4, pick: 0.2 }));

/** The chikari: the high drone strings, struck for rhythm between notes. */
export function chikari(k, t, vol = 0.045) {
  if (!ready(k)) return;
  const r = room(k);
  for (const m of [74, 86]) {
    const buf = cached(k.ctx, `chik${m}`, (sr) => renderString(sr, midi(m), 1.4, { t60: 1.0, damp: 0.3, bright: 0.85, pick: 0.09, jawari: 0.3, click: 0.6 }));
    play(k, buf, t + (m === 86 ? 0.008 : 0), vol * rand(0.85, 1.05), r.sitar);
  }
}

/** A tanpura string: long, buzzing, blooming. */
export function tanpura(k, m, t, vol = 0.05) {
  if (!ready(k)) return;
  const buf = cached(k.ctx, `tan${m}`, (sr) => renderString(sr, midi(m), 5.5, { t60: 5, damp: 0.42, bright: 0.5, pick: 0.25, jawari: 0.22 }));
  play(k, buf, t, vol, room(k).mix);
}

/** A sweep of plucked strings: the swarmandal. */
export function swarmandal(k, notes, t, vol = 0.04) {
  if (!ready(k)) return;
  notes.forEach((m, i) => {
    const buf = cached(k.ctx, `swar${m}`, (sr) => renderString(sr, midi(m), 2.4, { t60: 2.0, damp: 0.28, bright: 0.9, pick: 0.1 }));
    play(k, buf, t + i * 0.032, vol, room(k).mix);
  });
}

/** A santoor: a string struck with a light hammer. */
export function santoor(k, m, t, vol = 0.04) {
  if (!ready(k)) return;
  const buf = cached(k.ctx, `sant${m}`, (sr) => renderString(sr, midi(m), 1.5, { t60: 1.2, damp: 0.22, bright: 1, pick: 0.05, click: 0.3 }));
  play(k, buf, t, vol, room(k).mix);
}

/** One tabla bol, built from its strokes, a little human in time and weight. */
export function tabla(k, bol, t, accent = false, step = 0.25) {
  if (!ready(k)) return;
  const out = room(k).mix;
  const c = k.ctx;
  const s = (name) => cached(c, `tb_${name}`, STROKES[name]);
  const hum = () => t + rand(-0.004, 0.004);
  const w = (accent ? 1.25 : 1) * rand(0.88, 1.06);
  const dayanV = 0.1 * w, bayanV = 0.16 * w;
  const ge = () => s(['ge0', 'ge1', 'ge2'][(Math.random() * 3) | 0]);
  switch (bol) {
    case 'dha': play(k, s('na'), hum(), dayanV, out); play(k, ge(), hum(), bayanV, out); break;
    case 'dhin': play(k, s('tin'), hum(), dayanV, out); play(k, ge(), hum(), bayanV, out); break;
    case 'tin': play(k, s('tin'), hum(), dayanV * 0.9, out); break;
    case 'ta': case 'na': play(k, s('na'), hum(), dayanV, out); break;
    case 'ge': play(k, ge(), hum(), bayanV, out); break;
    case 'ke': play(k, s('ka'), hum(), bayanV * 0.8, out); break;
    case 'tirakita': {
      // ti - ra - ki - ta: four quick strokes across one step.
      const q = step / 4;
      play(k, s('ti'), t, dayanV * 0.8, out);
      play(k, s('ra'), t + q, dayanV * 0.7, out);
      play(k, s('ka'), t + q * 2, bayanV * 0.6, out);
      play(k, s('na'), t + q * 3, dayanV * 0.85, out);
      break;
    }
    default: play(k, s('ti'), hum(), dayanV * 0.6, out); break;
  }
}
