// Shared synthesis for the boss themes (music-western.js, music-desh.js).
//
// A theme is handed a `kit` by the scheduler in audio.js: the AudioContext,
// the music bus, `tone`, `noise`, `muted()` and the boss. `voice(kit, o)`
// here builds one expressive note on top of that: a pitch that can slide
// into the note or grace it from above (an Indian *kan*), glide on to
// another note while it sounds (a *meend*), vibrato that fades in, a filter
// sweep, and an attack/release envelope.

export const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * One synthesised note.
 *   m, at, dur, vol, type        the note, when, how long, how loud, waveform
 *   slide / slideTime            start `slide` semitones below and rise into it
 *   bendFrom                     start at this frequency ratio (a plucked twang)
 *   kan / kanTime                start on midi note `kan` and drop onto `m`
 *   glideTo / glideFrom (0..1)   glide to midi `glideTo`, starting that far in
 *   vib / vibRate / vibDelay     vibrato depth (ratio), speed, fade-in delay
 *   attack / release / sustain   envelope (sustain:false = a pluck that decays)
 *   filter [f0, f1, sweepTime], q  a low-pass, optionally sweeping f0 -> f1
 *   out                          where it goes (default: the music bus)
 */
export function voice(k, o) {
  if (!k.ctx || k.muted() || !k.bus) return;
  const c = k.ctx, t = o.at, dur = Math.max(0.05, o.dur);
  const f = midi(o.m);
  const osc = c.createOscillator();
  osc.type = o.type || 'sine';
  const fr = osc.frequency;
  if (o.kan !== undefined) {
    fr.setValueAtTime(midi(o.kan), t);
    fr.setValueAtTime(f, t + (o.kanTime || 0.05));
  } else if (o.slide) {
    fr.setValueAtTime(f * Math.pow(2, -o.slide / 12), t);
    fr.exponentialRampToValueAtTime(f, t + (o.slideTime || 0.06));
  } else {
    fr.setValueAtTime(f * (o.bendFrom || 1), t);
    if (o.bendFrom) fr.exponentialRampToValueAtTime(f, t + 0.04);
  }
  if (o.glideTo !== undefined) {
    const g0 = t + dur * (o.glideFrom ?? 0.35);
    fr.setValueAtTime(f, g0);
    fr.exponentialRampToValueAtTime(midi(o.glideTo), t + dur * 0.92);
  }
  if (o.vib) {
    const lfo = c.createOscillator();
    const depth = c.createGain();
    lfo.frequency.value = o.vibRate || 5.5;
    const d0 = o.vibDelay ?? 0.15;
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(0, t + d0);
    depth.gain.linearRampToValueAtTime(f * o.vib, t + d0 + 0.25);
    lfo.connect(depth).connect(fr);
    lfo.start(t);
    lfo.stop(t + dur + 0.3);
  }
  const g = c.createGain();
  const a = o.attack ?? 0.01;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.vol, t + a);
  if (o.sustain !== false) g.gain.setValueAtTime(o.vol, t + Math.max(a, dur - (o.release ?? 0.12)));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let head = osc;
  if (o.filter) {
    const fl = c.createBiquadFilter();
    fl.type = o.filterType || 'lowpass';
    fl.frequency.setValueAtTime(o.filter[0], t);
    if (o.filter[1]) fl.frequency.exponentialRampToValueAtTime(o.filter[1], t + Math.min(dur, o.filter[2] || dur));
    fl.Q.value = o.q || 1;
    head.connect(fl);
    head = fl;
  }
  head.connect(g).connect(o.out || k.bus);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}
