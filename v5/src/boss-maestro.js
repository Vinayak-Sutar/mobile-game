// ============================================================================
// THE MAESTRO, CONDUCTOR OF THE LAST SYMPHONY — a spectral conductor on a
// dark concert stage. "Every one of my attacks is a note. Learn the music."
//
// THE BEAT (signature): he keeps his own tempo and plays his own piece — a
// composed melody over drums, bass and strings. Every attack lands ON the
// music. A strip of sheet music across the top of the stage shows what is
// coming: notes scroll left to the playhead, and each note is an attack.
// His bullets are musical notes.
//
// ON THE BEAT: your hits on the beat deal x1.5 ("ON BEAT"). Ten separate
// beats struck in time — FORTISSIMO — and the orchestra stumbles: his score
// is torn up and he's wide open.
//
// Phrases (each a bar or more, every one an instrument or a piece of music):
// Staccato, Timpani, Crescendo, Brass Chord, Arpeggio, Legato, Fermata (the
// music stops — find a stage light before the SFORZANDO), Baton Flurry,
// Orchestra, Rubato, Bass Drum Resonance (the floor itself vibrates), Snare
// Roll, Piano Keys (the melody you hear presses the keys of the stage),
// Harp Glissando, Metronome, Cymbal Crash, Syncopation, OVERTURE.
// Phase 2 — PRESTO: the coat comes off, the tempo leaps, the drums drive
// under everything; Pipe Organ, the Canon, and the GRAND FINALE.
// ============================================================================

import { world, arena, arenaBounds } from './state.js';
import { TAU, clamp, rand, randInt, dist, angleTo, angleDiff, lerp } from './util.js';
import { sub, idle, expose, shot, shockwave, inArena, turnToward, forward, spawnEnemyFn } from './boss-kit.js';
import { damagePlayer } from './combat.js';
import { burst, ring, shake, flash, damageText } from './fx.js';
import { band } from './audio.js';
import { spawnHazard } from './hazards.js';

const PI = Math.PI;
const PIZZ = '#ffd45e';
const STRING = '#c8a8ff';
const BRASS = '#6fb8ff';
const BOMB = '#ff5e6e';
const DRUM = '#f4f0ff';
const SFZ = '#ff3d6e';
const VIOLET = '#b48cff';
const WOOD = '#8a5a3a';

const BPM1 = 116;
const BPM2 = 144;
const ON_BEAT = 0.1;       // seconds either side of a beat that count as "on it"
const STREAK = 10;         // separate beats struck in time for FORTISSIMO
const PX_PER_BEAT = 56;    // sheet-music scroll
const KEYS = 12;           // piano-key strips across the stage

const p2 = (e) => e.phase >= 2;
const PV = { x: 0, y: 0 };   // your smoothed velocity, for leading attacks

// --- the piece ----------------------------------------------------------------------
// Eight bars in A minor: Am - F - C - G - Am - F - E - E7, round and round.
const PROG = [
  { root: 45, pad: [57, 60, 64], arp: [69, 72, 76, 81] },   // Am
  { root: 41, pad: [53, 57, 60], arp: [65, 69, 72, 77] },   // F
  { root: 48, pad: [55, 60, 64], arp: [67, 72, 76, 79] },   // C
  { root: 43, pad: [55, 59, 62], arp: [67, 71, 74, 79] },   // G
  { root: 45, pad: [57, 60, 64], arp: [69, 72, 76, 81] },   // Am
  { root: 41, pad: [53, 57, 60], arp: [65, 69, 72, 77] },   // F
  { root: 40, pad: [56, 59, 64], arp: [68, 71, 76, 80] },   // E
  { root: 40, pad: [56, 59, 62], arp: [68, 71, 74, 80] },   // E7
];
// The melody: [beat in bar, MIDI note, length in beats]. A rising question in
// bars 1-4, a climbing answer in 5-6, and a turn on E that pulls back home.
const MELODY = [
  [[0, 76, 1], [1, 81, 0.5], [1.5, 83, 0.5], [2, 84, 1], [3, 83, 0.5], [3.5, 81, 0.5]],
  [[0, 81, 1.5], [1.5, 79, 0.5], [2, 77, 1], [3, 76, 1]],
  [[0, 79, 1], [1, 84, 0.5], [1.5, 86, 0.5], [2, 88, 1], [3, 86, 0.5], [3.5, 84, 0.5]],
  [[0, 86, 1.5], [1.5, 83, 0.5], [2, 79, 2]],
  [[0, 76, 1], [1, 81, 0.5], [1.5, 83, 0.5], [2, 84, 0.5], [2.5, 86, 0.5], [3, 88, 1]],
  [[0, 89, 1], [1, 88, 0.5], [1.5, 86, 0.5], [2, 84, 1], [3, 81, 1]],
  [[0, 83, 1], [1, 80, 0.5], [1.5, 81, 0.5], [2, 83, 1], [3, 76, 1]],
  [[0, 80, 1], [1, 83, 1], [2, 88, 2]],
];
const barOf = (beat) => (((Math.floor(beat / 4)) % 8) + 8) % 8;
const chordAt = (beat) => PROG[barOf(beat)];
/** A melody pitch to a key strip: low notes on the left, high on the right. */
const keyIndex = (m) => clamp(Math.round((m - 76) * (KEYS - 1) / 13), 0, KEYS - 1);

function say(e, text, color = VIOLET) {
  damageText(e.x, e.y - e.r - 30, text, { color, size: 16 });
}

function leadAt(x, y, p, speed, k = 0.5) {
  const t = dist(x, y, p.x, p.y) / speed;
  return angleTo(x, y, p.x + PV.x * t * k, p.y + PV.y * t * k);
}

function center() {
  const b = arenaBounds();
  return { x: (b.l + b.r) / 2, y: (b.t + b.b) / 2 };
}

/** Seconds from now until beat `at`, at the current tempo. */
const secs = (e, at) => Math.max(0.05, (at - e.song) * 60 / e.bpm);
const silent = (e) => e.song < e.silenceUntil || e.action === 'phase';

// --- strikes -----------------------------------------------------------------------

function blastAt(e, x, y, r, delay, mult, color) {
  const [sx, sy] = inArena(x, y, 20);
  return spawnHazard({ kind: 'blast', x: sx, y: sy, r, delay, damage: Math.round(e.damage * mult), color, source: e.type, owner: e, quiet: true });
}

function noteShot(e, a, speed, color, dmg = 0.42, from = null) {
  shot(e, a, speed, { shape: 'note', r: 7, color, dmg, life: 5, ...(from ? { x: from.x, y: from.y, off: 14 } : {}) });
}

function fan(e, center, n, spread, speed, color, dmg = 0.42, from = null) {
  for (let i = 0; i < n; i++) {
    const a = n === 1 ? center : center + (i / (n - 1) - 0.5) * spread;
    noteShot(e, a, speed, color, dmg, from);
  }
}

function ringNotes(e, x, y, n, speed, color, dmg = 0.38) {
  const off = rand(0, TAU);
  for (let k = 0; k < n; k++) noteShot(e, off + (k / n) * TAU, speed, color, dmg, { x, y });
}

/** A vibration ring from a drum: two gaps either side of you. */
function drumRing(e, x, y, o = {}) {
  const p = world.player;
  const pa = p ? angleTo(x, y, p.x, p.y) + (o.turn || 0) : 0;
  spawnHazard({
    kind: 'shockring', x, y, r0: o.r0 || 30, speed: o.speed || 280, width: o.width || 16, maxR: o.maxR || 1000,
    damage: Math.round(e.damage * (o.dmg || 0.6)), color: o.color || DRUM, source: e.type, owner: e,
    gaps: [{ a: pa + 0.75, w: o.gapW || 0.85 }, { a: pa - 0.75, w: o.gapW || 0.85 }], wait: 0,
  });
}

/** Damage from something that keeps touching (a pendulum, a cymbal). */
function hurt(e, mult, sx, sy) {
  if ((e.contactCd || 0) > 0) return;
  if (damagePlayer(Math.round(e.damage * mult), sx, sy, e.type)) e.contactCd = 0.5;
}

function touch(e, mult) {
  const p = world.player;
  if (!p || p.dead || (e.touchCd || 0) > 0) return;
  if (dist(e.x, e.y, p.x, p.y) < e.r + p.r * 0.5 + 10) {
    if (damagePlayer(Math.round(e.damage * mult), e.x, e.y, e.type)) e.touchCd = 0.6;
  }
}

/** A brass blast down a line: the hit, the knockback, and its flare. */
function strike(e, x, y, a, len, halfW, mult, kb) {
  const p = world.player;
  if (p && !p.dead) {
    const c = Math.cos(a), s = Math.sin(a);
    const dx = p.x - x, dy = p.y - y;
    const along = dx * c + dy * s, across = Math.abs(-dx * s + dy * c);
    if (along > -12 && along < len && across < halfW + p.r * 0.5) {
      if (damagePlayer(Math.round(e.damage * mult), x, y, e.type)) {
        p.vx = (p.vx || 0) + c * kb;
        p.vy = (p.vy || 0) + s * kb;
      }
    }
  }
  e.fxLines.push({ x, y, a, len, t: 0.25, color: BRASS });
}

function cutLands(e, a, arc, r, mult) {
  const p = world.player;
  if (!p || p.dead) return;
  if (dist(e.x, e.y, p.x, p.y) < r + p.r * 0.5 && Math.abs(angleDiff(a, angleTo(e.x, e.y, p.x, p.y))) < arc / 2 + 0.1) {
    if (damagePlayer(Math.round(e.damage * mult), e.x, e.y, e.type)) {
      p.vx = (p.vx || 0) + Math.cos(a) * 240;
      p.vy = (p.vy || 0) + Math.sin(a) * 240;
    }
  }
  for (let k = 0; k < 9; k++) {
    const b = a - arc / 2 + (k / 8) * arc;
    burst(e.x + Math.cos(b) * r * 0.8, e.y + Math.sin(b) * r * 0.8, { count: 1, color: DRUM, speed: 90, size: 3, life: 0.25, dir: b + PI / 2, spread: 0.2, drag: 4, shape: 'spark' });
  }
}

// --- the score -----------------------------------------------------------------------

// A note: at `at - warn` beats its cue shows the attack; at `at` it fires.
function add(e, n) {
  e.score.push({ warn: 0, cued: false, done: false, ...n });
}

/** The first bar line (grid 4), half bar (2) or beat (1) at least `lead` beats away. */
function nextBar(e, lead, grid) {
  return Math.ceil((e.song + lead) / grid) * grid;
}

/**
 * A phrase: schedule its notes on the next grid line, then conduct until
 * they're played. In Presto the drums drive under most phrases (accomp).
 */
function phraseMove(cooldown, lead, build, grid = 2, accomp = true) {
  return {
    cooldown,
    start(e, p) {
      const at0 = nextBar(e, lead, grid);
      e.accomp = accomp;
      e.phraseEnd = build(e, p, at0);
      sub(e, 'play', 999);
    },
    update(e, dt, p) {
      drift(e, dt, p, 0.35);
      if (e.song >= e.phraseEnd) idle(e, 0.05);
    },
  };
}

function drumNote(e, at) {
  add(e, {
    at, kind: 'drum', warn: 1,
    cue: (e) => { e.drumCue = at; },
    fire: (e) => {
      shockwave(e, { speed: p2(e) ? 300 : 270, dmg: 0.7, color: DRUM });
      band.timpani(chordAt(at).root + 12, 1);
      shake(0.3);
      e.drumCue = null;
    },
  });
}

function fanNote(e, at, n, spread, pitch, speed = 270) {
  add(e, {
    at, kind: 'pizz', warn: 0.5,
    cue: (e) => { e.batonFlash = 1; },
    fire: (e, p) => {
      fan(e, leadAt(e.x, e.y, p, speed, 0.6), n, spread, speed, PIZZ);
      band.pizz(pitch, 1);
    },
  });
}

/** Blasts marching out along a line from him, one per eighth note. */
function arpLine(e, at0, count, offsets, descend) {
  const line = {};
  for (let i = 0; i < count; i++) {
    const at = at0 + i * 0.5;
    const step = descend ? count - 1 - i : i;
    add(e, {
      at, kind: 'bomb', warn: 1,
      cue: (e, p) => {
        if (line.a === undefined) { line.x = e.x; line.y = e.y; line.a = angleTo(e.x, e.y, p.x, p.y); }
        for (const off of offsets) {
          const a = line.a + off;
          const d = 80 + step * 64;
          blastAt(e, line.x + Math.cos(a) * d, line.y + Math.sin(a) * d, 48, secs(e, at), 0.6, BOMB);
        }
      },
      fire: () => band.bell(chordAt(at).arp[step % 4] + (step >= 4 ? 12 : 0)),
    });
  }
}

/** FERMATA → SFORZANDO: the music stops, stage lights mark the safe spots, then the whole stage is struck. */
function sforzando(e, at) {
  add(e, {
    at, kind: 'sfz', warn: p2(e) ? 4 : 3,
    cue: (e, p) => {
      e.silenceUntil = at;
      e.safeUntil = at + 0.6;
      e.safe = safeSpots(e, p);
      say(e, 'Silence…', VIOLET);
    },
    fire: (e, p) => {
      const inSafe = e.safe && e.safe.some((s) => dist(p.x, p.y, s.x, s.y) < s.r + p.r * 0.3);
      if (!inSafe) damagePlayer(Math.round(e.damage * 1.4), e.x, e.y, e.type);
      flash(0.35, SFZ);
      shake(0.8);
      band.sforzando(chordAt(at).pad);
      e.sfz = 0.5;
    },
  });
}

function safeSpots(e, p) {
  const b = arenaBounds();
  const out = [];
  const r = p2(e) ? 60 : 68;
  const far = p2(e) ? 330 : 360;
  for (let tries = 0; tries < 120 && out.length < 3; tries++) {
    const x = rand(b.l + 90, b.r - 90), y = rand(b.t + 110, b.b - 70);
    const d = dist(x, y, p.x, p.y);
    if (d < 150 || d > far) continue;
    if (out.some((s) => dist(s.x, s.y, x, y) < 220)) continue;
    out.push({ x, y, r });
  }
  for (const sd of [-1, 1]) {
    if (out.length >= 2) break;
    const [x, y] = inArena(p.x + sd * 200, p.y, 90);
    out.push({ x, y, r });
  }
  return out;
}

// --- the orchestra ------------------------------------------------------------------

function spawnOrchestra(e, at0) {
  const b = arenaBounds();
  const spots = [['drum', b.l + 90, b.t + 120], ['violin', b.r - 90, b.t + 120], ['horn', b.r - 90, b.b - 60]];
  if (p2(e)) spots.push(['cymbal', b.l + 90, b.b - 60]);
  const bars = p2(e) ? 8 : 6;
  for (const [variant, x, y] of spots) {
    if (e.musicians.some((m) => m.variant === variant && !m.dead)) continue;
    const m = spawnEnemyFn('musician', x, y, { instant: true, summoner: e, scale: (e.scale || 1) * 0.8 });
    if (!m) continue;
    m.variant = variant;
    m.untilBeat = at0 + bars * 4;
    m.pulseAt = -9;
    e.musicians.push(m);
    ring(x, y, { r0: 6, r1: 60, color: VIOLET, life: 0.4, width: 4 });
  }
}

function playMusician(e, p, mu, beat, m, ch) {
  if (beat >= mu.untilBeat) {
    mu.dead = true;
    burst(mu.x, mu.y, { count: 14, color: VIOLET, speed: 160, size: 4, life: 0.5, gravity: -60, drag: 2 });
    damageText(mu.x, mu.y - 26, 'takes a bow', { color: VIOLET, size: 12 });
    return;
  }
  mu.pulseAt = world.runTime;
  if (mu.variant === 'drum' && (m === 0 || m === 2)) {
    drumRing(e, mu.x, mu.y, { speed: 240, dmg: 0.5, width: 14, gapW: 0.9 });
    band.timpani(ch.root + 12, 0.6);
  }
  if (mu.variant === 'violin') {
    noteShot(e, leadAt(mu.x, mu.y, p, 240, 0.6), 240, PIZZ, 0.35, mu);
    band.pizz(ch.arp[((beat % 4) + 4) % 4] + 12, 0.5);
  }
  if (mu.variant === 'horn') {
    if (m === 2) {
      mu.aim = angleTo(mu.x, mu.y, p.x, p.y);
      spawnHazard({ kind: 'lane', x: mu.x, y: mu.y, angle: mu.aim, len: 900, width: 44, delay: 60 / e.bpm, color: BRASS, owner: e });
    }
    if (m === 3 && mu.aim !== undefined) {
      strike(e, mu.x, mu.y, mu.aim, 900, 22, 0.7, 200);
      band.brass([ch.pad[0] + 12]);
      mu.aim = undefined;
    }
  }
  if (mu.variant === 'cymbal' && m === 0) {
    ringNotes(e, mu.x, mu.y, 10, 200, PIZZ, 0.35);
    band.crash();
  }
}

// --- on the beat ----------------------------------------------------------------------

/**
 * The music clock: tempo, beats and eighth notes, and the band playing on
 * them. It keeps running through a hit-stop freeze (MAESTRO.realTick), so the
 * melody never stutters when a hit lands; the fight's beat events catch up in
 * tick once the freeze ends.
 */
function musicClock(e, dt) {
  band.takeStage();
  // Rubato: the tempo swells, then sags, then settles.
  if (e.rubato) {
    const x = (e.song - e.rubato.at) / e.rubato.len;
    if (x >= 1) { e.rubato = null; e.bpm = e.baseBpm; }
    else if (x >= 0) e.bpm = e.baseBpm * (1 + 0.32 * Math.sin(TAU * x));
  }
  e.song += dt * e.bpm / 60;
  e.beatPulse = Math.max(0, e.beatPulse - dt * 4);
  const beat = Math.floor(e.song);
  if (beat !== e.lastBeat) { e.lastBeat = beat; beatSounds(e, beat); }
  const half = Math.floor(e.song * 2);
  if (half !== e.lastHalf) { e.lastHalf = half; onHalf(e, half / 2); }
}

/** The band on the beat: the count-in, drums, bass and strings. */
function beatSounds(e, beat) {
  e.beatPulse = 1;
  const m = ((beat % 4) + 4) % 4;
  const ch = chordAt(beat);
  const spb = 60 / e.bpm;
  if (beat < 0) {
    // The count-in.
    band.click();
    damageText(e.x, e.y - e.r - 24, String(m + 1), { color: DRUM, size: 18 });
    return;
  }
  if (silent(e)) return;
  if (p2(e)) { band.kick(); if (m === 1 || m === 3) band.snare(1); }
  else if (m === 0 || m === 2) band.kick();
  else band.snare(0.8);
  if (m === 0) band.strings(ch.pad, spb * 4);
  if (!p2(e)) {
    if (m === 0) band.bass(ch.root, spb * 1.8);
    else if (m === 2) band.bass(ch.root + 7, spb * 0.9);
  }
}

/** The fight on the beat (frozen with the rest of the fight during a hit-stop). */
function beatEvents(e, p, beat) {
  if (beat < 0) return;
  const m = ((beat % 4) + 4) % 4;
  const ch = chordAt(beat);
  // Presto: the drums drive under the phrase.
  if (p2(e) && !silent(e) && m === 0 && e.action === 'play' && e.accomp) shockwave(e, { speed: 300, dmg: 0.5, color: DRUM });
  // Grace notes while he turns the page to the next phrase.
  if (e.action === 'idle') {
    const a = leadAt(e.x, e.y, p, 250, 0.7);
    for (const k of [-0.12, 0.12]) noteShot(e, a + k, 250, PIZZ, 0.35);
    band.pizz(ch.arp[m], 0.6);
    e.batonFlash = 1;
  }
  if (e.action !== 'exposed' && !silent(e)) {
    for (const mu of e.musicians) if (!mu.dead) playMusician(e, p, mu, beat, m, ch);
  }
  e.musicians = e.musicians.filter((mu) => !mu.dead);
  if (e.metro && e.song >= e.metro.start && e.song <= e.metro.end) {
    // The pendulum's bob throws notes as it crosses the middle.
    const g = metroGeom(e);
    fan(e, angleTo(g.tx, g.ty, p.x, p.y), 3, 0.5, 230, VIOLET, 0.35, { x: g.tx, y: g.ty });
  }
}

/** Every eighth note: hats, the melody, and Presto's running bass and strings. */
function onHalf(e, pos) {
  if (pos < 0 || silent(e)) return;
  const spb = 60 / e.bpm;
  const off = pos - Math.floor(pos / 4) * 4;
  if (off % 1 !== 0) band.hat(0.6);
  else if (p2(e)) band.hat(0.3);
  for (const [o, m, d] of MELODY[barOf(pos)]) if (o === off) band.lead(m, d * spb);
  if (p2(e)) {
    const ch = chordAt(pos);
    const i = Math.round(off * 2);
    band.bass(ch.root + (i % 2 ? 12 : 0), spb * 0.45);
    band.harp(ch.arp[i % 4] - 12);
  }
}

/** Your hits on the beat land harder; ten beats in time and the orchestra stumbles. */
function tempoGuard(e) {
  if (e.action === 'phase') return 1;
  const frac = e.song - Math.floor(e.song);
  const off = Math.min(frac, 1 - frac) * 60 / e.bpm;
  const now = world.runTime;
  if (off <= ON_BEAT) {
    const beat = Math.round(e.song);
    if (beat !== e.lastHitBeat && e.action !== 'exposed') {
      e.streak++;
      e.lastHitBeat = beat;
      if (e.streak >= STREAK) fortissimo(e);
    }
    if ((e.onBeatSay || -9) < now - 0.25) {
      e.onBeatSay = now;
      damageText(e.x + rand(-10, 10), e.y - e.r - 14, '♪ ON BEAT', { color: PIZZ, size: 14 });
    }
    return 1.5;
  }
  e.streak = Math.max(0, e.streak - 1);
  return 1;
}

function clearStage(e) {
  e.score = [];
  e.safe = null;
  e.silenceUntil = 0;
  e.rubato = null;
  e.drumCue = null;
  e.metro = null;
  e.harp = null;
  e.keyboard = null;
  e.cymbals = [];
  e.pipes = null;
  e.drums = null;
}

function fortissimo(e) {
  e.streak = 0;
  clearStage(e);
  e.bpm = e.baseBpm;
  damageText(e.x, e.y - e.r - 34, 'FORTISSIMO!', { color: PIZZ, size: 20 });
  burst(e.x, e.y, { count: 30, color: PIZZ, speed: 320, size: 4, life: 0.6, drag: 3, shape: 'spark' });
  band.crash();
  expose(e, 2.0);
}

/** Glide to a conducting distance, facing you. */
function drift(e, dt, p, k = 1) {
  const d = dist(e.x, e.y, p.x, p.y);
  const a = angleTo(e.x, e.y, p.x, p.y);
  turnToward(e, a, 4 * dt);
  const sp = e.speed * k;
  if (d > 320) forward(e, sp, dt, a);
  else if (d < 220) forward(e, -sp * 0.8, dt, a);
  forward(e, sp * 0.5, dt, a + (PI / 2) * e.sign);
  [e.x, e.y] = inArena(e.x, e.y, e.r + 20);
}

// --- stage pieces: metronome, keys, harp, cymbals, pipes, drums ------------------------

function metroGeom(e) {
  const M = e.metro;
  const th = M.amp * Math.sin(PI * (e.song - M.start) * (2 / M.period));
  const a = PI / 2 + th;
  return { x: M.x, y: M.y, a, tx: M.x + Math.cos(a) * M.len, ty: M.y + Math.sin(a) * M.len };
}

function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const k = clamp(((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(px - (x1 + dx * k), py - (y1 + dy * k));
}

function keyRect(i) {
  const b = arenaBounds();
  const sw = (b.r - b.l) / KEYS;
  return { x0: b.l + i * sw, x1: b.l + (i + 1) * sw };
}

function harpRect(H, k) {
  const b = arenaBounds();
  if (H.vertical) {
    const sw = (b.r - b.l) / H.n;
    return { x0: b.l + k * sw, x1: b.l + (k + 1) * sw, y0: b.t, y1: b.b };
  }
  const sh = (b.b - b.t) / H.n;
  return { x0: b.l, x1: b.r, y0: b.t + k * sh, y1: b.t + (k + 1) * sh };
}

function cymbalPos(e, c, sd) {
  const k = clamp((e.song - c.from) / (c.at - c.from), 0, 1);
  return [c.tx + Math.cos(c.a) * c.spread * (1 - k) * sd, c.ty + Math.sin(c.a) * c.spread * (1 - k) * sd, k];
}

// --- the moveset --------------------------------------------------------------------

export const MAESTRO = {
  phases: [0.5],
  phaseTime: 3.0,
  roarPitch: 1.6,
  opening: { overture: 18, orchestra: 8, fermata: 12, rubato: 10, metronome: 6, keys: 5, canon: 99, organ: 99, finale: 99 },

  /** An open stage. */
  arena() { return []; },

  init(e) {
    e.bpm = e.baseBpm = BPM1;
    e.song = -4;          // a bar of count-in before the music starts
    e.lastBeat = -5;
    e.lastBeatEvent = -5;
    e.lastHalf = -9;
    e.musicians = [];
    e.fxLines = [];
    e.streak = 0;
    e.lastHitBeat = -99;
    e.beatPulse = 0;
    e.batonFlash = 0;
    e.sfz = 0;
    e.face = PI / 2;
    e.guardFn = tempoGuard;
    clearStage(e);
  },

  tick(e, dt, p) {
    e.touchCd = Math.max(0, (e.touchCd || 0) - dt);
    e.contactCd = Math.max(0, (e.contactCd || 0) - dt);
    if (e.exposed > 0 && e.action !== 'exposed') e.exposed = Math.max(0, e.exposed - dt);
    if (e.ppx !== undefined && dt > 0) {
      const vx = (p.x - e.ppx) / dt, vy = (p.y - e.ppy) / dt;
      if (Math.hypot(vx, vy) < 420) { const k = 1 - Math.exp(-8 * dt); PV.x = lerp(PV.x, vx, k); PV.y = lerp(PV.y, vy, k); }
    }
    e.ppx = p.x; e.ppy = p.y;
    e.hug = dist(e.x, e.y, p.x, p.y) < e.r + 110 ? (e.hug || 0) + dt : Math.max(0, (e.hug || 0) - dt * 2);

    // His own music plays (the regular track steps aside while he's alive).
    musicClock(e, dt);
    e.batonFlash = Math.max(0, e.batonFlash - dt * 3);
    e.sfz = Math.max(0, e.sfz - dt);
    for (const f of e.fxLines) f.t -= dt;
    e.fxLines = e.fxLines.filter((f) => f.t > 0);

    for (const n of e.score) {
      if (!n.cued && e.song >= n.at - n.warn) { n.cued = true; if (n.cue) n.cue(e, p, n); }
      if (!n.done && e.song >= n.at) { n.done = true; if (n.fire) n.fire(e, p, n); }
    }
    e.score = e.score.filter((n) => !n.done || e.song - n.at < 1.5);

    const beat = Math.floor(e.song);
    if (beat !== e.lastBeatEvent) { e.lastBeatEvent = beat; beatEvents(e, p, beat); }

    // The metronome's pendulum and the sliding cymbals hurt to touch.
    if (e.metro) {
      if (e.song > e.metro.end + 0.5) e.metro = null;
      else if (e.song >= e.metro.start) {
        const g = metroGeom(e);
        if (segDist(p.x, p.y, g.x, g.y, g.tx, g.ty) < 14 + p.r * 0.5 || dist(p.x, p.y, g.tx, g.ty) < 34 + p.r * 0.5) hurt(e, 0.7, g.tx, g.ty);
      }
    }
    for (const c of e.cymbals) {
      for (const sd of [-1, 1]) {
        const [cx, cy, k] = cymbalPos(e, c, sd);
        if (k > 0.05 && k < 1 && dist(p.x, p.y, cx, cy) < 30 + p.r * 0.5) hurt(e, 0.5, cx, cy);
      }
    }
    e.cymbals = e.cymbals.filter((c) => e.song < c.at + 0.1);
    if (e.keyboard && e.song > e.keyboard.until) e.keyboard = null;
    if (e.keyboard) e.keyboard.strips = e.keyboard.strips.filter((s) => e.song < s.at + 0.5);
    if (e.harp && e.song > e.harp.end) e.harp = null;
    if (e.drums && e.song > e.drums.end) e.drums = null;
    if (e.pipes && e.song > e.pipes.end) e.pipes = null;

    if (e.streak > 0 && e.song - e.lastHitBeat > 4) e.streak = 0;
    if (e.safe && e.song > e.safeUntil) e.safe = null;
    touch(e, 0.4);
  },

  /** Called during a hit-stop freeze: the music keeps time. */
  realTick(e, dt) { musicClock(e, dt); },

  idle(e, dt, p) { drift(e, dt, p); },

  choose(e, p, d) {
    const alive = e.musicians.some((m) => !m.dead);
    const pool = [
      ['staccato', 2.4], ['timpani', 2], ['crescendo', 2.2], ['chord', 2],
      ['arpeggio', 1.8], ['legato', 1.6], ['fermata', 1.3], ['flurry', e.hug > 0.5 ? 9 : 0],
      ['orchestra', alive ? 0 : 1.6], ['rubato', 1.0], ['resonance', 2.2], ['snare', d < 260 ? 3 : 1.2],
      ['keys', 2], ['harp', 1.8], ['metronome', 1.6], ['cymbal', 2], ['syncopation', 1.8],
    ];
    if (!p2(e)) pool.push(['overture', 3]);
    else pool.push(['organ', 2.2], ['canon', 2.2], ['finale', 3.5]);
    return pool;
  },

  // --- phase 2: PRESTO ----------------------------------------------------------------
  onPhase(e) {
    e.marks = {};
    clearStage(e);
    e.streak = 0;
    e.startBpm = e.bpm;
    say(e, 'Presto!', PIZZ);
  },
  phaseAnim(e, dt, p, k) {
    const once = (key, at, fn) => { if (k >= at && !e.marks[key]) { e.marks[key] = true; fn(); } };
    e.bpm = lerp(e.startBpm, BPM2, k);
    e.face += dt * (k < 0.5 ? 7 : 2);
    once('coat', 0.5, () => {
      e.coatOff = true;
      burst(e.x, e.y, { count: 26, color: '#1e1828', speed: 260, size: 6, life: 0.8, drag: 2, shape: 'shard' });
      shake(0.5);
    });
    once('chord', 0.85, () => { band.sforzando(chordAt(e.song).pad); flash(0.3, PIZZ); });
  },
  afterPhase(e) {
    e.baseBpm = BPM2;
    e.bpm = BPM2;
    Object.assign(e.cool, { canon: 3, organ: 5, finale: 10, orchestra: 6, fermata: 6 });
  },

  moves: {
    // 1. Staccato: a fan on every beat, and a single note on every "and"
    //    (Presto: 3-fans on every eighth, 5-fans on the downbeats).
    staccato: phraseMove(3, 1, (e, p, at0) => {
      for (let i = 0; i < 8; i++) {
        const at = at0 + i * 0.5;
        const onBeat = i % 2 === 0;
        if (p2(e)) fanNote(e, at, i % 4 === 0 ? 5 : 3, i % 4 === 0 ? 0.6 : 0.36, chordAt(at).arp[i % 4], 290);
        else fanNote(e, at, onBeat ? 5 : 1, 0.6, chordAt(at).arp[i % 4]);
      }
      return at0 + 4;
    }),

    // 2. Timpani: a ring rolls out on every beat of the bar.
    timpani: phraseMove(5, 1, (e, p, at0) => {
      for (let b = 0; b < 4; b++) drumNote(e, at0 + b);
      return at0 + 4;
    }, 2, false),

    // 3. Crescendo: a blast where you stand on each beat — each bigger (on
    //    every eighth in Presto).
    crescendo: phraseMove(6, 1, (e, p, at0) => {
      const n = p2(e) ? 8 : 4, step = p2(e) ? 0.5 : 1;
      for (let i = 0; i < n; i++) {
        const at = at0 + i * step;
        const k = i / (n - 1);
        add(e, {
          at, kind: 'bomb', warn: 1,
          cue: (e, p) => { blastAt(e, p.x + PV.x * 0.4, p.y + PV.y * 0.4, lerp(40, 125, k), secs(e, at), lerp(0.45, 1.0, k), BOMB); },
          fire: () => { band.pizz(chordAt(at).arp[i % 4], 0.6 + k * 0.6); if (i === n - 1) band.crash(); },
        });
      }
      return at0 + n * step;
    }),

    // 4. Brass Chord: five lanes blast on beat 1, five more between them on
    //    beat 3 (Presto: three chords, the middle one syncopated).
    chord: phraseMove(5, 2, (e, p, at0) => {
      const hits = p2(e) ? [[0, 0, 2], [1.5, 0.5, 1.5], [3, 0, 1.5]] : [[0, 0, 2], [2, 0.5, 1.5]];
      for (const [b, off, warn] of hits) {
        const at = at0 + b;
        add(e, {
          at, kind: 'brass', warn,
          cue: (e, p, note) => {
            const base = angleTo(e.x, e.y, p.x, p.y);
            note.x = e.x; note.y = e.y; note.angles = [];
            for (let k = 0; k < 5; k++) {
              const a = base + (k - 2 + off) * 0.32;
              note.angles.push(a);
              spawnHazard({ kind: 'lane', x: e.x, y: e.y, angle: a, len: 900, width: 44, delay: secs(e, at), color: BRASS, owner: e });
            }
          },
          fire: (e, p, note) => {
            for (const a of note.angles || []) strike(e, note.x, note.y, a, 900, 22, 0.85, 240);
            band.brass(chordAt(at).pad);
            shake(0.25);
          },
        });
      }
      return at0 + 4;
    }),

    // 5. Arpeggio: blasts march out toward you on eighth notes, then back.
    arpeggio: phraseMove(6, 1, (e, p, at0) => {
      const offsets = p2(e) ? [-0.3, 0.3] : [-0.18, 0.18];
      arpLine(e, at0, 8, offsets, false);
      arpLine(e, at0 + 4, 8, offsets.map((o) => o + 0.35), true);
      return at0 + 8;
    }, 4),

    // 6. Legato: a long slur — arms of notes turning around him for two bars.
    legato: phraseMove(7, 1, (e, p, at0) => {
      const arms = p2(e) ? 4 : 3;
      const base = rand(0, TAU);
      for (let i = 0; i < 16; i++) {
        const at = at0 + i * 0.5;
        add(e, {
          at, kind: 'string',
          fire: (e) => { for (let k = 0; k < arms; k++) noteShot(e, base + i * 0.3 + (k / arms) * TAU, 180, STRING, 0.4); },
        });
      }
      return at0 + 8;
    }, 4),

    // 7. Fermata: the music stops. Stage lights mark safe spots — get into
    //    one before the SFORZANDO strikes the whole stage.
    fermata: phraseMove(14, 4, (e, p, at0) => { sforzando(e, at0); return at0 + 1; }, 4, false),

    // 8. Baton Flurry: too close, and the baton cuts on six eighth notes.
    flurry: phraseMove(4, 1, (e, p, at0) => {
      for (let i = 0; i < 6; i++) {
        const at = at0 + i * 0.5;
        add(e, {
          at, kind: 'bomb', warn: 1,
          cue: (e, p, n) => {
            n.a = angleTo(e.x, e.y, p.x, p.y) + (i % 2 ? 0.45 : -0.45);
            spawnHazard({ kind: 'cone', x: e.x, y: e.y, angle: n.a, arc: 1.8, r: 160, delay: secs(e, at), color: BOMB, owner: e, follow: e });
          },
          fire: (e, p, n) => { cutLands(e, n.a, 1.8, 160, 0.55); band.pizz(chordAt(at).arp[i % 4] + 12, 1); },
        });
      }
      return at0 + 3;
    }, 1),

    // 9. Orchestra: a drummer, a violinist and a horn player (and in Presto
    //    a cymbalist) take their seats and play along until struck down.
    orchestra: phraseMove(14, 2, (e, p, at0) => {
      add(e, {
        at: at0, kind: 'drum', warn: 2,
        cue: (e) => say(e, 'Orchestra!', VIOLET),
        fire: (e) => { spawnOrchestra(e, at0); band.brass(chordAt(at0).pad); },
      });
      return at0 + 1;
    }),

    // 10. Rubato: the tempo swells and sags for two bars while notes fly on
    //     every beat — trust the drums, not the clock.
    rubato: phraseMove(12, 1, (e, p, at0) => {
      e.rubato = { at: at0, len: 8 };
      add(e, { at: at0, kind: 'rest', warn: 1, cue: (e) => say(e, 'Rubato!', STRING) });
      for (let i = 0; i < 8; i++) {
        const at = at0 + i;
        add(e, {
          at, kind: 'pizz',
          fire: (e, p) => { fan(e, leadAt(e.x, e.y, p, 250, 0.6), 4, 0.5, 250, PIZZ); band.pizz(chordAt(at).arp[i % 4], 0.9); },
        });
      }
      return at0 + 8;
    }, 4),

    // 11. Bass Drum Resonance: a great drum is struck on every beat and the
    //     stage vibrates — rings roll out of it, and the boards around it
    //     shake loose in bands (marked). Presto: two drums, left and right.
    resonance: phraseMove(10, 2, (e, p, at0) => {
      const b = arenaBounds();
      const c = center();
      const spots = p2(e)
        ? [[b.l + 170, c.y], [b.r - 170, c.y]]
        : [inArena(lerp(e.x, c.x, 0.4), lerp(e.y, c.y, 0.4), 120)];
      add(e, {
        at: at0, kind: 'drum', warn: 1,
        cue: (e) => { e.drums = { list: spots.map(([x, y]) => ({ x, y, hitAt: -9 })), end: at0 + 8.5 }; say(e, 'Feel the floor!', DRUM); },
      });
      for (let i = 0; i < 8; i++) {
        const at = at0 + i;
        add(e, {
          at, kind: 'drum', warn: i % 2 === 0 ? 1 : 0,
          cue: i % 2 === 0 ? (e) => {
            if (!e.drums) return;
            const D = e.drums.list[(i / 2) % e.drums.list.length];
            const R = [150, 270][(i / 2) % 2];
            const off = rand(0, TAU);
            for (let k = 0; k < 10; k++) {
              const a = off + (k / 10) * TAU;
              blastAt(e, D.x + Math.cos(a) * R, D.y + Math.sin(a) * R, 42, secs(e, at), 0.5, DRUM);
            }
          } : null,
          fire: (e) => {
            if (!e.drums) return;
            const D = e.drums.list[i % e.drums.list.length];
            D.hitAt = world.runTime;
            drumRing(e, D.x, D.y, { speed: 300, dmg: 0.6, width: 18, turn: i * 0.7 });
            band.bassDrum(1);
            shake(0.35);
          },
        });
      }
      return at0 + 8;
    }, 4, false),

    // 12. Snare Roll: a buzz of tiny rings on sixteenth notes, then the
    //     accent — a fast ring and a burst of notes.
    snare: phraseMove(7, 1, (e, p, at0) => {
      for (let i = 0; i < 6; i++) {
        const at = at0 + i * 0.25;
        add(e, {
          at, kind: 'snare',
          fire: (e) => {
            spawnHazard({
              kind: 'shockring', x: e.x, y: e.y, r0: e.r, speed: 420, width: 10, maxR: 170 + i * 20,
              damage: Math.round(e.damage * 0.35), color: DRUM, source: e.type, owner: e,
              gaps: [{ a: rand(0, TAU), w: 1.0 }], wait: 0,
            });
            band.snare(0.3 + i * 0.1);
          },
        });
      }
      add(e, {
        at: at0 + 2, kind: 'drum', warn: 1,
        cue: (e) => { e.drumCue = at0 + 2; },
        fire: (e) => {
          shockwave(e, { speed: 380, dmg: 0.8, color: DRUM, gapW: 0.7 });
          ringNotes(e, e.x, e.y, 12, 230, PIZZ, 0.4);
          band.snare(1.3);
          band.crash();
          e.drumCue = null;
        },
      });
      return at0 + 2.5;
    }, 2, false),

    // 13. Piano Keys: the stage becomes a keyboard. The melody you hear
    //     presses its keys — each note lights its key a beat ahead, then
    //     strikes down the whole strip. (Presto: a harmony key below too.)
    keys: phraseMove(11, 1, (e, p, at0) => {
      e.keyboard = { until: at0 + 8.5, strips: [] };
      add(e, { at: at0, kind: 'rest', warn: 1, cue: (e) => say(e, 'Play along!', PIZZ) });
      for (let bar = 0; bar < 2; bar++) {
        for (const [o, m] of MELODY[barOf(at0 + bar * 4)]) {
          const at = at0 + bar * 4 + o;
          const idx = [keyIndex(m)];
          if (p2(e)) idx.push(keyIndex(m - 5));
          add(e, {
            at, kind: 'key', warn: 1,
            cue: (e) => { if (e.keyboard) for (const i of idx) e.keyboard.strips.push({ i, at }); },
            fire: (e, p) => {
              for (const i of idx) {
                const K = keyRect(i);
                if (p.x + p.r * 0.4 > K.x0 && p.x - p.r * 0.4 < K.x1) { damagePlayer(Math.round(e.damage * 0.6), (K.x0 + K.x1) / 2, p.y, e.type); break; }
              }
            },
          });
        }
      }
      return at0 + 8;
    }, 4),

    // 14. Harp Glissando: the strings of a giant harp span the stage and are
    //     plucked one after another in a sweep. Two neighbouring strings are
    //     never played — that gap (shimmering) is the way through.
    harp: phraseMove(9, 2, (e, p, at0) => {
      const vertical = p2(e) && Math.random() < 0.5;
      const n = 10;
      const safeK = randInt(1, n - 3);
      const step = p2(e) ? 0.25 : 0.5;
      e.harp = { vertical, n, safeK, lines: [], from: at0 - 2, end: at0 + n * step + 0.5 };
      add(e, { at: at0, kind: 'rest', warn: 2, cue: (e) => say(e, 'Glissando!', PIZZ) });
      for (let k = 0; k < n; k++) {
        if (k === safeK || k === safeK + 1) continue;
        const at = at0 + k * step;
        add(e, {
          at, kind: 'harp', warn: 1,
          cue: (e) => { if (e.harp) e.harp.lines.push({ k, at }); },
          fire: (e, p) => {
            if (!e.harp) return;
            const R = harpRect(e.harp, k);
            const pad = p.r * 0.4;
            if (p.x + pad > R.x0 && p.x - pad < R.x1 && p.y + pad > R.y0 && p.y - pad < R.y1) damagePlayer(Math.round(e.damage * 0.65), p.x, p.y, e.type);
            band.harp(chordAt(at).arp[k % 4] + 12);
          },
        });
      }
      return at0 + n * step;
    }, 4),

    // 15. Metronome: a giant pendulum swings from the top of the stage,
    //     ticking through the middle on every beat and flinging notes. Cross
    //     under it when it's at the far end of its swing.
    metronome: phraseMove(12, 1, (e, p, at0) => {
      const b = arenaBounds();
      e.metro = { x: (b.l + b.r) / 2, y: b.t + 64, len: (b.b - b.t) * 0.82, amp: 1.05, start: at0, end: at0 + 8, period: p2(e) ? 1.5 : 2 };
      add(e, { at: at0, kind: 'metro', warn: 1, cue: (e) => say(e, 'Keep time!', VIOLET) });
      for (let i = 0; i < 8; i++) add(e, { at: at0 + i, kind: 'metro', fire: () => band.tick() });
      return at0 + 8;
    }, 4, false),

    // 16. Cymbal Crash: two cymbals slide in from either side of you and
    //     meet with a crash on the third beat, throwing notes (two pairs in
    //     Presto).
    cymbal: phraseMove(7, 2, (e, p, at0) => {
      const meets = p2(e) ? [2, 3] : [2];
      for (const mb of meets) {
        const at = at0 + mb;
        add(e, {
          at, kind: 'cymbal', warn: 2,
          cue: (e, p, n) => {
            [n.x, n.y] = inArena(p.x + PV.x * 0.5, p.y + PV.y * 0.5, 60);
            e.cymbals.push({ tx: n.x, ty: n.y, a: rand(0, PI), from: at - 2, at, spread: 340 });
            blastAt(e, n.x, n.y, 95, secs(e, at), 1.0, PIZZ);
          },
          fire: (e, p, n) => { ringNotes(e, n.x, n.y, 12, 220, PIZZ, 0.4); band.crash(); band.kick(1.2); shake(0.5); },
        });
      }
      return at0 + meets[meets.length - 1] + 0.5;
    }),

    // 17. Syncopation: two bars where everything lands on the off-beats —
    //     the "and" between the drums — with a blast on the "and" of four.
    syncopation: phraseMove(8, 1, (e, p, at0) => {
      add(e, { at: at0, kind: 'rest', warn: 1, cue: (e) => say(e, 'Syncopation!', PIZZ) });
      for (let i = 0; i < 8; i++) {
        const at = at0 + i + 0.5;
        fanNote(e, at, p2(e) ? 4 : 3, 0.45, chordAt(at).arp[(i + 1) % 4]);
        if (i % 4 === 3) {
          add(e, { at, kind: 'bomb', warn: 1, cue: (e, p) => blastAt(e, p.x + PV.x * 0.4, p.y + PV.y * 0.4, 72, secs(e, at), 0.7, BOMB) });
        }
      }
      return at0 + 8;
    }, 4),

    // 18. OVERTURE (phase-1 barrage): four bars — timpani on every downbeat,
    //     staccato on the backbeats, and an arpeggio across the last two.
    //     Then he bows.
    overture: phraseMove(28, 1, (e, p, at0) => {
      add(e, { at: at0, kind: 'rest', warn: 1, cue: (e) => say(e, 'The Overture!', PIZZ) });
      for (let bar = 0; bar < 4; bar++) {
        const b0 = at0 + bar * 4;
        drumNote(e, b0);
        fanNote(e, b0 + 1, 6, 0.7, chordAt(b0).arp[1]);
        fanNote(e, b0 + 2.5, 3, 0.4, chordAt(b0).arp[2]);
        fanNote(e, b0 + 3, 6, 0.7, chordAt(b0).arp[3]);
      }
      arpLine(e, at0 + 8, 8, [-0.15, 0.15], false);
      arpLine(e, at0 + 12, 8, [0.2, 0.5], true);
      add(e, {
        at: at0 + 16, kind: 'sfz',
        fire: (e) => { band.sforzando(chordAt(at0).pad); say(e, 'Bravo!', PIZZ); expose(e, 2.0); },
      });
      return at0 + 16.5;
    }, 4, false),

    // --- phase 2 ------------------------------------------------------------------------

    // 19. Pipe Organ: five pipes rise around you and sound one by one, then
    //     all together with a ring of notes from the middle — step out
    //     between two pipes.
    organ: phraseMove(12, 2, (e, p, at0) => {
      add(e, {
        at: at0, kind: 'organ', warn: 2,
        cue: (e, p) => {
          const base = rand(0, TAU);
          const [cx, cy] = inArena(p.x, p.y, 120);
          e.pipes = { cx, cy, list: [], end: at0 + 3.6 };
          for (let k = 0; k < 5; k++) {
            const a = base + (k / 5) * TAU;
            const [x, y] = inArena(cx + Math.cos(a) * 210, cy + Math.sin(a) * 210, 30);
            e.pipes.list.push({ x, y, at: at0 + k * 0.5 });
          }
          say(e, 'The organ!', BRASS);
        },
      });
      for (let k = 0; k < 5; k++) {
        const at = at0 + k * 0.5;
        add(e, {
          at, kind: 'organ', warn: 1,
          cue: (e) => { const P = e.pipes && e.pipes.list[k]; if (P) blastAt(e, P.x, P.y, 62, secs(e, at), 0.7, BRASS); },
          fire: (e) => band.organ([chordAt(at).arp[k % 4]], 60 / e.bpm),
        });
      }
      add(e, {
        at: at0 + 3, kind: 'organ', warn: 1,
        cue: (e) => {
          if (!e.pipes) return;
          for (const P of e.pipes.list) blastAt(e, P.x, P.y, 62, secs(e, at0 + 3), 0.7, BRASS);
          blastAt(e, e.pipes.cx, e.pipes.cy, 95, secs(e, at0 + 3), 1.0, BRASS);
        },
        fire: (e) => {
          if (e.pipes) ringNotes(e, e.pipes.cx, e.pipes.cy, 16, 200, BRASS, 0.4);
          band.organ(chordAt(at0).pad, 120 / e.bpm);
          shake(0.4);
        },
      });
      return at0 + 3.5;
    }, 4),

    // 20. Canon: a bar of blasts and notes — then he steps through to the
    //     other side of the stage and the bar answers itself, mirrored.
    canon: phraseMove(9, 1, (e, p, at0) => {
      const marks = [];
      for (let i = 0; i < 4; i++) {
        const at = at0 + i;
        add(e, {
          at, kind: 'bomb', warn: 1,
          cue: (e, p) => {
            const x = p.x + PV.x * 0.4, y = p.y + PV.y * 0.4;
            marks[i] = [x, y];
            blastAt(e, x, y, 70, secs(e, at), 0.6, BOMB);
          },
          fire: (e, p) => { fan(e, angleTo(e.x, e.y, p.x, p.y), 4, 0.5, 270, PIZZ); band.pizz(chordAt(at).arp[i], 1); },
        });
      }
      add(e, {
        at: at0 + 4, kind: 'rest', warn: 0.5,
        cue: (e) => {
          const c = center();
          burst(e.x, e.y, { count: 18, color: VIOLET, speed: 200, size: 4, life: 0.4, drag: 3 });
          [e.x, e.y] = inArena(2 * c.x - e.x, 2 * c.y - e.y, e.r + 30);
          ring(e.x, e.y, { r0: 50, r1: 6, color: VIOLET, life: 0.35, width: 4 });
        },
      });
      for (let i = 0; i < 4; i++) {
        const at = at0 + 4 + i;
        add(e, {
          at, kind: 'bomb', warn: 1,
          cue: (e, p) => {
            const c = center();
            const m = marks[i];
            if (m) blastAt(e, 2 * c.x - m[0], 2 * c.y - m[1], 70, secs(e, at), 0.6, BOMB);
            blastAt(e, p.x + PV.x * 0.3, p.y + PV.y * 0.3, 56, secs(e, at), 0.55, BOMB);
          },
          fire: (e, p) => { fan(e, angleTo(e.x, e.y, p.x, p.y), 4, 0.5, 270, PIZZ); band.pizz(chordAt(at).arp[3 - i] + 12, 1); },
        });
      }
      return at0 + 8;
    }),

    // 21. GRAND FINALE (phase-2 barrage): the orchestra returns, strings spin
    //     for four bars over the timpani, then the music stops — find a light —
    //     SFORZANDO. Then he bows, spent.
    finale: phraseMove(30, 3, (e, p, at0) => {
      add(e, {
        at: at0, kind: 'drum', warn: 2,
        cue: (e) => say(e, 'The Grand Finale!', PIZZ),
        fire: (e) => spawnOrchestra(e, at0),
      });
      const base = rand(0, TAU);
      for (let i = 0; i < 32; i++) {
        const at = at0 + i * 0.5;
        add(e, {
          at, kind: 'string',
          fire: (e) => { for (let k = 0; k < 4; k++) noteShot(e, base + i * 0.26 + (k / 4) * TAU, 160, STRING, 0.4); },
        });
      }
      for (let bar = 0; bar < 4; bar++) drumNote(e, at0 + bar * 4);
      sforzando(e, at0 + 20);
      add(e, {
        at: at0 + 21, kind: 'rest',
        fire: (e) => { say(e, 'Bravo… bravo.', PIZZ); expose(e, 2.4); },
      });
      return at0 + 21.5;
    }, 4, false),
  },

  // --- drawing ------------------------------------------------------------------------

  draw(e, ctx) { drawMaestro(ctx, e, world.runTime); },

  drawExtras(e, ctx, t) {
    const p = world.player;
    const b = arenaBounds();
    drawKeyboard(ctx, e, b);
    drawHarp(ctx, e);
    // Fermata: the stage goes red; stage lights mark where it's safe.
    if (e.safe) {
      ctx.fillStyle = `rgba(255,40,80,${0.12 + Math.sin(t * 12) * 0.05})`;
      ctx.fillRect(b.l, b.t, b.r - b.l, b.b - b.t);
      for (const s of e.safe) {
        const g = ctx.createRadialGradient(s.x, s.y, 4, s.x, s.y, s.r);
        g.addColorStop(0, 'rgba(255,245,210,0.55)');
        g.addColorStop(1, 'rgba(255,245,210,0.12)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#fff4d0';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
    }
    drawDrums(ctx, e, t);
    drawPipes(ctx, e);
    drawCymbals(ctx, e);
    drawMetronome(ctx, e);
    // The timpani's warning: a ring closing on him.
    if (e.drumCue !== null && e.drumCue !== undefined) {
      const k = clamp(1 - secs(e, e.drumCue) / (60 / e.bpm), 0, 1);
      ctx.globalAlpha = 0.3 + k * 0.5;
      ctx.strokeStyle = DRUM;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, lerp(90, e.r + 6, k), 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Brass flares.
    for (const f of e.fxLines) {
      ctx.globalAlpha = clamp(f.t / 0.25, 0, 1);
      ctx.strokeStyle = f.color;
      ctx.lineWidth = 10;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x + Math.cos(f.a) * f.len, f.y + Math.sin(f.a) * f.len); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
    if (e.sfz > 0) {
      ctx.globalAlpha = e.sfz;
      ctx.strokeStyle = SFZ;
      ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(e.x, e.y, 60 + (0.5 - e.sfz) * 900, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // The beat, around you.
    if (p && e.beatPulse > 0 && !silent(e)) {
      ctx.globalAlpha = e.beatPulse * 0.45;
      ctx.strokeStyle = PIZZ;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 10 + (1 - e.beatPulse) * 10, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Presto: notes orbit him.
    if (e.phase >= 2 && e.action !== 'phase') {
      for (let k = 0; k < 4; k++) {
        const a = e.song * PI * 0.5 + (k / 4) * TAU;
        noteGlyph(ctx, e.x + Math.cos(a) * (e.r + 22), e.y + Math.sin(a) * (e.r + 22), k % 2 ? PIZZ : STRING, 'head', 0.8);
      }
    }
    if (e.exposed > 0) {
      ctx.globalAlpha = 0.5 + Math.sin(t * 10) * 0.25;
      ctx.strokeStyle = '#ffe27a';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 12, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    drawSheet(ctx, e);
    if (e.action === 'phase') {
      const k = clamp(1 - e.t / (e.phaseT || 1), 0, 1);
      ctx.globalAlpha = Math.sin(k * PI);
      ctx.fillStyle = PIZZ;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 52px "Segoe UI", Roboto, system-ui, sans-serif';
      ctx.fillText('PRESTO', (b.l + b.r) / 2, b.t + arena.h * 0.34);
      ctx.globalAlpha = 1;
    }
  },

  /** A dark concert stage: wooden boards, velvet wings, empty chairs, footlights. */
  drawArena(ctx) {
    const e = world.enemies.find((q) => q.type === 'maestro' && !q.dead);
    const b = arenaBounds();
    const w = b.r - b.l, h = b.b - b.t;
    const bp = e ? e.beatPulse : 0;
    ctx.fillStyle = '#231712';
    ctx.fillRect(b.l, b.t, w, h);
    for (let y = b.t, j = 0; y < b.b; y += 26, j++) {
      ctx.fillStyle = j % 2 ? 'rgba(255,200,150,0.035)' : 'rgba(255,200,150,0.06)';
      ctx.fillRect(b.l, y, w, 25);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(b.l, y + 25, w, 1);
    }
    // Velvet wings.
    for (const [x0, dir] of [[b.l, 1], [b.r, -1]]) {
      const g = ctx.createLinearGradient(x0, 0, x0 + dir * 60, 0);
      g.addColorStop(0, 'rgba(120,16,32,0.85)');
      g.addColorStop(1, 'rgba(120,16,32,0)');
      ctx.fillStyle = g;
      ctx.fillRect(dir > 0 ? x0 : x0 - 60, b.t, 60, h);
    }
    // Empty chairs and music stands in an arc at the back.
    const cx = b.l + w / 2;
    for (let k = 0; k < 11; k++) {
      const a = PI + 0.25 + (k / 10) * (PI - 0.5);
      const x = cx + Math.cos(a) * w * 0.32, y = b.t + 150 + Math.sin(a) * 70;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x - 9, y - 6, 18, 14);
      ctx.strokeStyle = 'rgba(200,180,140,0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y + 10); ctx.lineTo(x + 8, y + 22); ctx.stroke();
    }
    // A spotlight on him.
    if (e) {
      const g = ctx.createRadialGradient(e.x, e.y, 10, e.x, e.y, 170);
      g.addColorStop(0, `rgba(255,230,180,${0.12 + bp * 0.05})`);
      g.addColorStop(1, 'rgba(255,230,180,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(e.x, e.y, 170, 0, TAU); ctx.fill();
    }
    // Footlights, pulsing with the beat.
    for (let k = 0; k < 14; k++) {
      const x = b.l + (k + 0.5) * (w / 14), y = b.b - 8;
      const g = ctx.createRadialGradient(x, y, 1, x, y, 26);
      g.addColorStop(0, `rgba(255,220,150,${0.35 + bp * 0.45})`);
      g.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, 26, 0, TAU); ctx.fill();
    }
    if (bp > 0) {
      ctx.fillStyle = `rgba(255,220,160,${0.035 * bp})`;
      ctx.fillRect(b.l, b.t, w, h);
    }
  },
};

// --- art --------------------------------------------------------------------------

const GLYPHS = {
  pizz: { line: 1, color: PIZZ, shape: 'head' },
  string: { line: 2, color: STRING, shape: 'head' },
  brass: { line: 3, color: BRASS, shape: 'bar' },
  bomb: { line: 0.5, color: BOMB, shape: 'head' },
  drum: { line: 4, color: DRUM, shape: 'diamond' },
  snare: { line: 3.5, color: DRUM, shape: 'x' },
  sfz: { line: 2, color: SFZ, shape: 'accent' },
  key: { line: 1.5, color: BOMB, shape: 'head' },
  harp: { line: 0, color: PIZZ, shape: 'tick' },
  metro: { line: 2.5, color: VIOLET, shape: 'tri' },
  cymbal: { line: 0, color: PIZZ, shape: 'ring' },
  organ: { line: 2, color: BRASS, shape: 'bar' },
};

function noteGlyph(ctx, x, y, color, shape, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  if (shape === 'head') {
    ctx.beginPath(); ctx.ellipse(x, y, 5, 3.6, -0.35, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 4.5, y); ctx.lineTo(x + 4.5, y - 17); ctx.stroke();
  } else if (shape === 'diamond') {
    ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 6); ctx.lineTo(x - 6, y); ctx.closePath(); ctx.fill();
  } else if (shape === 'bar') {
    ctx.fillRect(x - 7, y - 3, 14, 6);
  } else if (shape === 'accent') {
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - 8, y - 7); ctx.lineTo(x + 8, y); ctx.lineTo(x - 8, y + 7); ctx.stroke();
  } else if (shape === 'x') {
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 4, y - 4); ctx.lineTo(x + 4, y + 4); ctx.moveTo(x + 4, y - 4); ctx.lineTo(x - 4, y + 4); ctx.stroke();
  } else if (shape === 'tick') {
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x, y + 7); ctx.stroke();
  } else if (shape === 'tri') {
    ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x + 6, y + 5); ctx.lineTo(x - 6, y + 5); ctx.closePath(); ctx.fill();
  } else if (shape === 'ring') {
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 5, 0, TAU); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** The score across the top of the stage: what's coming, scrolling to the playhead. */
function drawSheet(ctx, e) {
  const b = arenaBounds();
  const w = b.r - b.l;
  const x0 = b.l + w * 0.14, x1 = b.r - w * 0.14;
  const y0 = b.t + 22, gap = 7;
  const playX = x0 + (x1 - x0) * 0.16;
  ctx.fillStyle = 'rgba(10,6,18,0.62)';
  ctx.fillRect(x0 - 12, y0 - 14, x1 - x0 + 24, gap * 4 + 28);
  ctx.strokeStyle = 'rgba(240,230,255,0.3)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath(); ctx.moveTo(x0, y0 + i * gap); ctx.lineTo(x1, y0 + i * gap); ctx.stroke();
  }
  // Bar lines.
  ctx.strokeStyle = 'rgba(240,230,255,0.45)';
  for (let bb = Math.ceil((e.song - (playX - x0) / PX_PER_BEAT) / 4) * 4; ; bb += 4) {
    const x = playX + (bb - e.song) * PX_PER_BEAT;
    if (x > x1) break;
    if (x >= x0) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + gap * 4); ctx.stroke(); }
  }
  // The silence of a fermata: an arc over the staff up to the strike.
  if (e.song < e.silenceUntil) {
    const xe = playX + (e.silenceUntil - e.song) * PX_PER_BEAT;
    ctx.strokeStyle = VIOLET;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(playX, y0 - 4); ctx.quadraticCurveTo((playX + xe) / 2, y0 - 14, xe, y0 - 4); ctx.stroke();
  }
  for (const n of e.score) {
    const g = GLYPHS[n.kind];
    if (!g) continue;
    const x = playX + (n.at - e.song) * PX_PER_BEAT;
    if (x < x0 || x > x1) continue;
    const alpha = n.done ? clamp(1 - (e.song - n.at), 0, 1) * 0.6 : 1;
    noteGlyph(ctx, x, y0 + g.line * gap, g.color, g.shape, alpha);
  }
  // The playhead, flashing on the beat.
  ctx.strokeStyle = `rgba(255,230,140,${silent(e) ? 0.25 : 0.5 + e.beatPulse * 0.5})`;
  ctx.lineWidth = 2 + e.beatPulse * 2;
  ctx.beginPath(); ctx.moveTo(playX, y0 - 10); ctx.lineTo(playX, y0 + gap * 4 + 10); ctx.stroke();
  // The streak toward FORTISSIMO.
  for (let k = 0; k < STREAK; k++) {
    ctx.fillStyle = k < e.streak ? PIZZ : 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.arc(x1 + 22 + (k % 5) * 9, y0 + 6 + Math.floor(k / 5) * 12, 3.2, 0, TAU); ctx.fill();
  }
}

/** Piano Keys: the stage as a keyboard; keys light a beat ahead, then strike. */
function drawKeyboard(ctx, e, b) {
  const K = e.keyboard;
  if (!K) return;
  for (let i = 0; i < KEYS; i++) {
    const R = keyRect(i);
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)';
    ctx.fillRect(R.x0, b.t, R.x1 - R.x0, b.b - b.t);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(R.x1 - 1, b.t, 2, b.b - b.t);
    if (i % 7 !== 2 && i % 7 !== 6) {
      ctx.fillStyle = 'rgba(10,6,14,0.55)';
      ctx.fillRect(R.x1 - (R.x1 - R.x0) * 0.25, b.t, (R.x1 - R.x0) * 0.5, 70);
    }
  }
  for (const s of K.strips) {
    const R = keyRect(s.i);
    if (e.song < s.at) {
      const k = clamp(1 - (s.at - e.song), 0, 1);
      ctx.fillStyle = `rgba(255,94,110,${0.1 + k * 0.35})`;
    } else {
      ctx.fillStyle = `rgba(255,255,255,${clamp(1 - (e.song - s.at) * 3, 0, 1) * 0.6})`;
    }
    ctx.fillRect(R.x0 + 2, b.t, R.x1 - R.x0 - 4, b.b - b.t);
  }
}

/** Harp Glissando: every string faint, the next ones bright, the gap shimmering. */
function drawHarp(ctx, e) {
  const H = e.harp;
  if (!H || e.song < H.from) return;
  const t = world.runTime;
  for (let k = 0; k < H.n; k++) {
    const R = harpRect(H, k);
    const safe = k === H.safeK || k === H.safeK + 1;
    if (safe) {
      ctx.fillStyle = `rgba(160,255,190,${0.1 + Math.sin(t * 8) * 0.04})`;
      ctx.fillRect(R.x0, R.y0, R.x1 - R.x0, R.y1 - R.y0);
      continue;
    }
    ctx.strokeStyle = 'rgba(255,212,94,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (H.vertical) { const x = (R.x0 + R.x1) / 2; ctx.moveTo(x, R.y0); ctx.lineTo(x, R.y1); }
    else { const y = (R.y0 + R.y1) / 2; ctx.moveTo(R.x0, y); ctx.lineTo(R.x1, y); }
    ctx.stroke();
  }
  for (const L of H.lines) {
    const R = harpRect(H, L.k);
    if (e.song < L.at) {
      const k = clamp(1 - (L.at - e.song), 0, 1);
      ctx.fillStyle = `rgba(255,212,94,${0.08 + k * 0.32})`;
    } else {
      ctx.fillStyle = `rgba(255,255,230,${clamp(1 - (e.song - L.at) * 3, 0, 1) * 0.6})`;
    }
    ctx.fillRect(R.x0, R.y0, R.x1 - R.x0, R.y1 - R.y0);
  }
}

function drawMetronome(ctx, e) {
  if (!e.metro) return;
  const g = metroGeom(e);
  const live = e.song >= e.metro.start;
  ctx.globalAlpha = live ? 1 : 0.4;
  ctx.strokeStyle = '#d8d0e8';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(g.tx, g.ty); ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = '#3a2a4a';
  ctx.beginPath(); ctx.arc(g.x, g.y, 12, 0, TAU); ctx.fill();
  ctx.fillStyle = PIZZ;
  ctx.shadowColor = PIZZ;
  ctx.shadowBlur = live ? 14 : 0;
  ctx.beginPath(); ctx.arc(g.tx, g.ty, 34, 0, TAU); ctx.fill();
  ctx.shadowBlur = 0;
  noteGlyph(ctx, g.tx - 3, g.ty + 6, '#3a2a4a', 'head', 1);
  ctx.globalAlpha = 1;
}

function drawCymbals(ctx, e) {
  for (const c of e.cymbals) {
    for (const sd of [-1, 1]) {
      const [x, y] = cymbalPos(e, c, sd);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(e.song * 6 * sd);
      ctx.fillStyle = '#d8b04a';
      ctx.beginPath(); ctx.ellipse(0, 0, 30, 26, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#8a6a20';
      ctx.lineWidth = 2;
      for (const rr of [9, 17, 25]) { ctx.beginPath(); ctx.ellipse(0, 0, rr, rr * 0.87, 0, 0, TAU); ctx.stroke(); }
      ctx.fillStyle = '#fff0b0';
      ctx.beginPath(); ctx.arc(-8, -7, 4, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }
}

function drawPipes(ctx, e) {
  if (!e.pipes) return;
  for (const P of e.pipes.list) {
    const lit = e.song >= P.at - 1;
    if (lit) {
      const g = ctx.createRadialGradient(P.x, P.y, 4, P.x, P.y, 50);
      g.addColorStop(0, 'rgba(111,184,255,0.45)');
      g.addColorStop(1, 'rgba(111,184,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(P.x, P.y, 50, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = '#b8c0d0';
    ctx.beginPath(); ctx.arc(P.x, P.y, 24, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#5a6070';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#1a1a24';
    ctx.beginPath(); ctx.arc(P.x, P.y, 13, 0, TAU); ctx.fill();
  }
}

/** The great bass drums of Resonance; their skins shiver when struck. */
function drawDrums(ctx, e, t) {
  if (!e.drums) return;
  for (const D of e.drums.list) {
    const since = t - D.hitAt;
    const wob = since < 0.5 ? Math.sin(since * 60) * (1 - since * 2) * 5 : 0;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(D.x, D.y + 12, 52, 20, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = WOOD;
    ctx.beginPath(); ctx.arc(D.x, D.y, 50, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#d8b04a';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#efe4cc';
    ctx.beginPath(); ctx.arc(D.x, D.y, 40 + wob, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(138,90,58,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(D.x, D.y, 26 + wob * 0.6, 0, TAU); ctx.stroke();
  }
}

/**
 * The conductor from above: tailcoat tails that swing to the beat, a white
 * shirt front and crimson cravat, swept-back silver hair, and a white baton
 * beating time. In Presto the coat is gone: shirtsleeves and red braces.
 */
function drawMaestro(ctx, e, t) {
  const r = e.r;
  const presto = !!e.coatOff;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.face || 0);
  const flashW = e.flash > 0;
  if (!presto) {
    ctx.fillStyle = '#16121e';
    for (const sd of [-1, 1]) {
      const sw = Math.sin(e.song * PI) * r * 0.2 * sd;
      ctx.beginPath();
      ctx.moveTo(-r * 0.3, sd * r * 0.35);
      ctx.quadraticCurveTo(-r * 1.3, sd * r * 0.7 + sw, -r * 1.9, sd * r * 0.45 + sw);
      ctx.lineTo(-r * 1.2, sd * r * 0.08);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.fillStyle = flashW ? '#ffffff' : presto ? '#ece6f4' : '#1e1828';
  ctx.strokeStyle = '#0a0810';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(-r * 0.05, 0, r * 0.82, r, 0, 0, TAU); ctx.fill(); ctx.stroke();
  if (!presto) {
    ctx.fillStyle = '#f2eef8';
    ctx.beginPath(); ctx.moveTo(r * 0.6, 0); ctx.lineTo(r * 0.05, -r * 0.35); ctx.lineTo(r * 0.05, r * 0.35); ctx.closePath(); ctx.fill();
  } else {
    ctx.strokeStyle = '#c8304a';
    ctx.lineWidth = r * 0.12;
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-r * 0.6, sd * r * 0.4); ctx.lineTo(r * 0.5, sd * r * 0.3); ctx.stroke(); }
  }
  // Crimson cravat.
  ctx.fillStyle = '#c8304a';
  ctx.beginPath(); ctx.moveTo(r * 0.5, 0); ctx.lineTo(r * 0.3, -r * 0.2); ctx.lineTo(r * 0.3, r * 0.2); ctx.closePath(); ctx.fill();
  // Baton hand, beating time; the other hand shaping the phrase.
  const swing = Math.sin(e.song * PI) * 0.7;
  const hx = r * 0.45, hy = r * 0.78;
  ctx.fillStyle = '#e8dcd0';
  ctx.beginPath(); ctx.arc(hx, hy, r * 0.16, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(r * 0.4, -r * 0.72 + Math.sin(e.song * PI + 1) * r * 0.15, r * 0.15, 0, TAU); ctx.fill();
  if (e.batonFlash > 0) { ctx.shadowColor = PIZZ; ctx.shadowBlur = 12 * e.batonFlash; }
  ctx.strokeStyle = '#fbf8ff';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + Math.cos(swing) * r * 1.4, hy + Math.sin(swing) * r * 1.4); ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.shadowBlur = 0;
  // Head and silver hair.
  ctx.fillStyle = '#d8dce8';
  ctx.beginPath(); ctx.ellipse(-r * 0.02, 0, r * 0.46, r * 0.42, 0, 0, TAU); ctx.fill();
  if (presto) {
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath(); ctx.moveTo(-r * 0.1, k * r * 0.12); ctx.lineTo(-r * 0.65, k * r * 0.22 + Math.sin(t * 9 + k) * 2); ctx.lineTo(-r * 0.1, k * r * 0.12 + 4); ctx.fill();
    }
  }
  ctx.fillStyle = flashW ? '#ffffff' : '#efe2d6';
  ctx.beginPath(); ctx.arc(r * 0.22, 0, r * 0.34, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(160,170,190,0.9)';
  ctx.lineWidth = 1.2;
  for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(r * 0.3, k * r * 0.12); ctx.lineTo(-r * 0.35, k * r * 0.2); ctx.stroke(); }
  ctx.restore();
}

/** A spectral musician in their chair, pulsing when they play. */
export function drawMusician(e, ctx) {
  const t = world.runTime;
  const k = clamp(1 - (t - (e.pulseAt ?? -9)) * 4, 0, 1);
  const r = e.r;
  ctx.save();
  ctx.translate(e.x, e.y);
  const g = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 2);
  g.addColorStop(0, `rgba(180,140,255,${0.25 + k * 0.35})`);
  g.addColorStop(1, 'rgba(180,140,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r * 2, 0, TAU); ctx.fill();
  ctx.fillStyle = e.flash > 0 ? '#ffffff' : 'rgba(190,175,255,0.75)';
  ctx.beginPath(); ctx.ellipse(0, r * 0.1, r * 0.75, r * 0.85, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(0, -r * 0.75, r * 0.42, 0, TAU); ctx.fill();
  if (e.variant === 'drum') {
    ctx.fillStyle = WOOD;
    ctx.beginPath(); ctx.ellipse(0, r * 0.75, r * 0.9, r * 0.38, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#f4e8d0';
    ctx.lineWidth = 2;
    ctx.stroke();
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sd * r * 0.3, r * 0.1); ctx.lineTo(sd * r * 0.6, r * 0.6 - k * 6); ctx.stroke(); }
  } else if (e.variant === 'violin') {
    ctx.fillStyle = '#c87a3a';
    ctx.beginPath(); ctx.ellipse(r * 0.5, -r * 0.1, r * 0.28, r * 0.45, 0.6, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#f4e8d0';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-r * 0.6, r * 0.3 - k * 6); ctx.lineTo(r * 0.9, -r * 0.4 + k * 6); ctx.stroke();
  } else if (e.variant === 'cymbal') {
    ctx.fillStyle = '#d8b04a';
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sd * (r * 0.7 - k * 5), 0, r * 0.35, r * 0.5, 0, 0, TAU); ctx.fill(); }
  } else {
    ctx.strokeStyle = '#e8c060';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(r * 0.1, r * 0.3, r * 0.45, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#e8c060';
    ctx.beginPath(); ctx.arc(r * 0.7, r * 0.1, r * 0.22 + k * 3, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
