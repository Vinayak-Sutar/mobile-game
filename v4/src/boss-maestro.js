// ============================================================================
// THE MAESTRO, CONDUCTOR OF THE LAST SYMPHONY — a spectral conductor on a
// dark concert stage. "Every one of my attacks is a note. Learn the music."
//
// THE BEAT (signature): he keeps his own tempo, and the drums you hear are
// it. Every attack lands ON a beat. A strip of sheet music across the top of
// the stage shows what is coming: notes scroll left to the playhead, and each
// note is an attack (gold = bullets, blue = brass lanes, red = blasts, white =
// timpani rings, violet = strings). Read ahead and you'll know the rhythm.
//
// ON THE BEAT: your hits that land on the beat deal x1.5 ("ON BEAT"). Eight
// separate beats struck in time — FORTISSIMO — and the orchestra stumbles:
// his score is torn up and he's wide open.
//
// Moves (phrases, each a bar or more): Staccato, Timpani, Crescendo, Brass
// Chord, Arpeggio, Legato, Fermata (the music stops — find a stage light
// before the SFORZANDO), Baton Flurry, Orchestra (spectral musicians play
// along until they're struck down), Rubato (the tempo swells and sags),
// OVERTURE (the phase-1 barrage).
// Phase 2 — PRESTO: the coat comes off and the tempo leaps; eighth notes,
// wider chords, the Canon (a bar, then its echo from the other side), and
// the GRAND FINALE.
// ============================================================================

import { world, arena, arenaBounds } from './state.js';
import { TAU, clamp, rand, dist, angleTo, angleDiff, lerp } from './util.js';
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

const BPM1 = 100;
const BPM2 = 126;
const ON_BEAT = 0.1;       // seconds either side of a beat that count as "on it"
const STREAK = 8;          // separate beats struck in time for FORTISSIMO
const PX_PER_BEAT = 56;    // sheet-music scroll

const p2 = (e) => e.phase >= 2;
const PV = { x: 0, y: 0 };   // your smoothed velocity, for leading attacks

// A minor, i - VI - III - V: the Maestro's own piece.
const PROG = [
  { root: 45, pad: [57, 60, 64], arp: [69, 72, 76, 81] },   // Am
  { root: 41, pad: [53, 57, 60], arp: [65, 69, 72, 77] },   // F
  { root: 48, pad: [55, 60, 64], arp: [67, 72, 76, 79] },   // C
  { root: 40, pad: [56, 59, 64], arp: [68, 71, 76, 80] },   // E
];
const chordAt = (beat) => PROG[((Math.floor(beat / 4) % 4) + 4) % 4];

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

function fan(e, center, n, spread, speed, color, dmg = 0.42, from = null) {
  for (let i = 0; i < n; i++) {
    const a = n === 1 ? center : center + (i / (n - 1) - 0.5) * spread;
    shot(e, a, speed, { shape: 'orb', r: 7, color, dmg, life: 5, ...(from ? { x: from.x, y: from.y, off: 14 } : {}) });
  }
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

/** The first bar line (or half bar, grid 2) at least `lead` beats away. */
function nextBar(e, lead, grid = 4) {
  return Math.ceil((e.song + lead) / grid) * grid;
}

/** A phrase: schedule its notes on the next bar, then conduct until they're played. */
function phraseMove(cooldown, lead, build, grid = 4) {
  return {
    cooldown,
    start(e, p) {
      const at0 = nextBar(e, lead, grid);
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
      shockwave(e, { speed: p2(e) ? 290 : 260, dmg: 0.7, color: DRUM });
      band.timpani(chordAt(at).root + 12, 1);
      shake(0.3);
      e.drumCue = null;
    },
  });
}

function fanNote(e, at, n, spread, pitch) {
  add(e, {
    at, kind: 'pizz', warn: 0.5,
    cue: (e) => { e.batonFlash = 1; },
    fire: (e, p) => {
      fan(e, leadAt(e.x, e.y, p, 250, 0.6), n, spread, 250, PIZZ);
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
          const d = 90 + step * 70;
          blastAt(e, line.x + Math.cos(a) * d, line.y + Math.sin(a) * d, 46, secs(e, at), 0.55, BOMB);
        }
      },
      fire: () => band.bell(chordAt(at).arp[step % 4] + (step >= 4 ? 12 : 0)),
    });
  }
}

/** FERMATA → SFORZANDO: the music stops, stage lights mark the safe spots, then the whole stage is struck. */
function sforzando(e, at) {
  add(e, {
    at, kind: 'sfz', warn: 3,
    cue: (e, p) => {
      e.silenceUntil = at;
      e.safeUntil = at + 0.6;
      e.safe = safeSpots(e, p);
      say(e, 'Silence…', VIOLET);
    },
    fire: (e, p) => {
      const inSafe = e.safe && e.safe.some((s) => dist(p.x, p.y, s.x, s.y) < s.r + p.r * 0.3);
      if (!inSafe) damagePlayer(Math.round(e.damage * 1.3), e.x, e.y, e.type);
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
  const r = p2(e) ? 64 : 74;
  for (let tries = 0; tries < 120 && out.length < 3; tries++) {
    const x = rand(b.l + 90, b.r - 90), y = rand(b.t + 110, b.b - 70);
    const d = dist(x, y, p.x, p.y);
    if (d < 140 || d > 360) continue;
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
  const bars = p2(e) ? 8 : 5;
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
    const pa = angleTo(mu.x, mu.y, p.x, p.y);
    spawnHazard({
      kind: 'shockring', x: mu.x, y: mu.y, r0: 24, speed: 230, width: 14, maxR: 900,
      damage: Math.round(e.damage * 0.5), color: DRUM, source: e.type, owner: e,
      gaps: [{ a: pa + 0.8, w: 0.9 }, { a: pa - 0.8, w: 0.9 }], wait: 0,
    });
    band.timpani(ch.root + 12, 0.6);
  }
  if (mu.variant === 'violin') {
    shot(e, leadAt(mu.x, mu.y, p, 230, 0.6), 230, { x: mu.x, y: mu.y, off: 14, shape: 'orb', r: 6, color: PIZZ, dmg: 0.35, life: 4 });
    band.pizz(ch.arp[beat % 4] + 12, 0.5);
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
}

// --- on the beat ----------------------------------------------------------------------

function onBeat(e, p, beat) {
  e.beatPulse = 1;
  const m = ((beat % 4) + 4) % 4;
  const ch = chordAt(beat);
  const spb = 60 / e.bpm;
  if (beat < 4 && e.song < 4.5) {
    // The count-in.
    band.click();
    damageText(e.x, e.y - e.r - 24, String(m + 1), { color: DRUM, size: 18 });
    return;
  }
  if (!silent(e)) {
    if (m === 0 || m === 2) band.kick(); else band.snare(0.8);
    if (m === 0) { band.bass(ch.root, spb * 1.8); band.strings(ch.pad, spb * 4); }
    else if (m === 2) band.bass(ch.root + 12, spb * 0.9);
  }
  // Grace notes while he turns the page to the next phrase.
  if (e.action === 'idle' && (m === 1 || m === 3)) {
    const a = leadAt(e.x, e.y, p, 240, 0.7);
    for (const k of [-0.12, 0.12]) shot(e, a + k, 240, { shape: 'orb', r: 6, color: PIZZ, dmg: 0.35, life: 4 });
    band.pizz(ch.arp[m], 0.7);
    e.batonFlash = 1;
  }
  if (e.action !== 'exposed' && !silent(e)) {
    for (const mu of e.musicians) if (!mu.dead) playMusician(e, p, mu, beat, m, ch);
  }
  e.musicians = e.musicians.filter((mu) => !mu.dead);
}

/** Your hits on the beat land harder; eight beats in time and the orchestra stumbles. */
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

function fortissimo(e) {
  e.streak = 0;
  e.score = [];
  e.safe = null;
  e.silenceUntil = 0;
  e.rubato = null;
  e.bpm = e.baseBpm;
  e.drumCue = null;
  damageText(e.x, e.y - e.r - 34, 'FORTISSIMO!', { color: PIZZ, size: 20 });
  burst(e.x, e.y, { count: 30, color: PIZZ, speed: 320, size: 4, life: 0.6, drag: 3, shape: 'spark' });
  band.crash();
  expose(e, 2.4);
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

// --- the moveset --------------------------------------------------------------------

export const MAESTRO = {
  phases: [0.5],
  phaseTime: 3.0,
  roarPitch: 1.6,
  opening: { overture: 16, orchestra: 10, fermata: 12, rubato: 8, canon: 99, finale: 99 },

  /** An open stage. */
  arena() { return []; },

  init(e) {
    e.bpm = e.baseBpm = BPM1;
    e.song = 0;
    e.lastBeat = -1;
    e.lastHalf = -1;
    e.score = [];
    e.musicians = [];
    e.fxLines = [];
    e.streak = 0;
    e.lastHitBeat = -99;
    e.beatPulse = 0;
    e.batonFlash = 0;
    e.silenceUntil = 0;
    e.sfz = 0;
    e.face = PI / 2;
    e.guardFn = tempoGuard;
  },

  tick(e, dt, p) {
    e.touchCd = Math.max(0, (e.touchCd || 0) - dt);
    if (e.exposed > 0 && e.action !== 'exposed') e.exposed = Math.max(0, e.exposed - dt);
    if (e.ppx !== undefined && dt > 0) {
      const vx = (p.x - e.ppx) / dt, vy = (p.y - e.ppy) / dt;
      if (Math.hypot(vx, vy) < 420) { const k = 1 - Math.exp(-8 * dt); PV.x = lerp(PV.x, vx, k); PV.y = lerp(PV.y, vy, k); }
    }
    e.ppx = p.x; e.ppy = p.y;
    e.hug = dist(e.x, e.y, p.x, p.y) < e.r + 110 ? (e.hug || 0) + dt : Math.max(0, (e.hug || 0) - dt * 2);

    // His own music plays: the regular track steps aside while he's alive.
    band.takeStage();

    // Rubato: the tempo swells, then sags, then settles.
    if (e.rubato) {
      const x = (e.song - e.rubato.at) / e.rubato.len;
      if (x >= 1) { e.rubato = null; e.bpm = e.baseBpm; }
      else if (x >= 0) e.bpm = e.baseBpm * (1 + 0.32 * Math.sin(TAU * x));
    }
    e.song += dt * e.bpm / 60;
    e.beatPulse = Math.max(0, e.beatPulse - dt * 4);
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
    if (beat !== e.lastBeat) { e.lastBeat = beat; onBeat(e, p, beat); }
    const half = Math.floor(e.song * 2);
    if (half !== e.lastHalf) { e.lastHalf = half; if (half % 2 && !silent(e) && e.song > 4) band.hat(0.7); }
    if (e.streak > 0 && e.song - e.lastHitBeat > 4) e.streak = 0;
    if (e.safe && e.song > e.safeUntil) e.safe = null;
    touch(e, 0.4);
  },

  idle(e, dt, p) { drift(e, dt, p); },

  choose(e, p, d) {
    const alive = e.musicians.some((m) => !m.dead);
    const pool = [
      ['staccato', 2.6], ['timpani', d < 260 ? 3 : 2], ['crescendo', 2.4], ['chord', 2.2],
      ['arpeggio', 2], ['legato', 1.8], ['fermata', 1.4], ['flurry', e.hug > 0.5 ? 8 : 0],
      ['orchestra', alive ? 0 : 1.6], ['rubato', 1.2],
    ];
    if (!p2(e)) pool.push(['overture', 3]);
    else pool.push(['canon', 2.4], ['finale', 3.5]);
    return pool;
  },

  // --- phase 2: PRESTO ----------------------------------------------------------------
  onPhase(e) {
    e.marks = {};
    e.score = [];
    e.safe = null;
    e.silenceUntil = 0;
    e.rubato = null;
    e.drumCue = null;
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
    Object.assign(e.cool, { canon: 3, finale: 10, orchestra: 6, fermata: 6 });
  },

  moves: {
    // 1. Staccato: a fan of notes on every beat of the bar (every eighth in phase 2).
    staccato: phraseMove(3, 1, (e, p, at0) => {
      const eighths = p2(e), steps = eighths ? 8 : 4, step = eighths ? 0.5 : 1;
      for (let i = 0; i < steps; i++) {
        const at = at0 + i * step;
        fanNote(e, at, eighths ? 3 : 5, eighths ? 0.36 : 0.6, chordAt(at).arp[i % 4]);
      }
      return at0 + steps * step;
    }),

    // 2. Timpani: a ring rolls out from him on beats 1 and 3 (every beat in phase 2).
    timpani: phraseMove(5, 1, (e, p, at0) => {
      for (const b of p2(e) ? [0, 1, 2, 3] : [0, 2]) drumNote(e, at0 + b);
      return at0 + 4;
    }),

    // 3. Crescendo: a blast where you stand on each beat — each one bigger.
    crescendo: phraseMove(6, 1, (e, p, at0) => {
      const R = [44, 62, 84, 120], D = [0.45, 0.55, 0.7, 1.0];
      for (let i = 0; i < 4; i++) {
        const at = at0 + i;
        add(e, {
          at, kind: 'bomb', warn: 1,
          cue: (e, p) => { blastAt(e, p.x + PV.x * 0.4, p.y + PV.y * 0.4, R[i], secs(e, at), D[i], BOMB); },
          fire: () => { band.pizz(chordAt(at).arp[i], 0.6 + i * 0.3); if (i === 3) band.crash(); },
        });
      }
      return at0 + 4;
    }),

    // 4. Brass Chord: three lanes (five in phase 2) blast on beat 1, then
    //    three more between them on beat 3.
    chord: phraseMove(5, 2, (e, p, at0) => {
      const n = p2(e) ? 5 : 3;
      for (const [b, off, warn] of [[0, 0, 2], [2, 0.5, 1.5]]) {
        const at = at0 + b;
        add(e, {
          at, kind: 'brass', warn,
          cue: (e, p, note) => {
            const base = angleTo(e.x, e.y, p.x, p.y);
            note.x = e.x; note.y = e.y; note.angles = [];
            for (let k = 0; k < n; k++) {
              const a = base + (k - (n - 1) / 2 + off) * 0.34;
              note.angles.push(a);
              spawnHazard({ kind: 'lane', x: e.x, y: e.y, angle: a, len: 900, width: 44, delay: secs(e, at), color: BRASS, owner: e });
            }
          },
          fire: (e, p, note) => {
            for (const a of note.angles || []) strike(e, note.x, note.y, a, 900, 22, 0.8, 240);
            band.brass(chordAt(at).pad);
            shake(0.25);
          },
        });
      }
      return at0 + 3;
    }),

    // 5. Arpeggio: blasts march out toward you on eighth notes, then march back.
    arpeggio: phraseMove(6, 1, (e, p, at0) => {
      const offsets = p2(e) ? [-0.3, 0.3] : [0];
      arpLine(e, at0, 8, offsets, false);
      arpLine(e, at0 + 4, 8, offsets.map((o) => o + 0.35), true);
      return at0 + 8;
    }),

    // 6. Legato: a long slur — arms of notes turning around him for two bars.
    legato: phraseMove(7, 1, (e, p, at0) => {
      const arms = p2(e) ? 3 : 2;
      const base = rand(0, TAU);
      for (let i = 0; i < 16; i++) {
        const at = at0 + i * 0.5;
        add(e, {
          at, kind: 'string',
          fire: (e) => {
            if (i === 0) band.strings(chordAt(at).pad.map((m) => m + 12), secs(e, at + 8));
            for (let k = 0; k < arms; k++) shot(e, base + i * 0.3 + (k / arms) * TAU, 170, { shape: 'orb', r: 7, color: STRING, dmg: 0.4, life: 6 });
          },
        });
      }
      return at0 + 8;
    }),

    // 7. Fermata: the music stops. Stage lights mark safe spots — get into
    //    one before the SFORZANDO strikes the whole stage.
    fermata: phraseMove(16, 3, (e, p, at0) => { sforzando(e, at0); return at0 + 1; }),

    // 8. Baton Flurry: too close, and the baton cuts on eighth notes.
    flurry: phraseMove(4, 1, (e, p, at0) => {
      for (let i = 0; i < 4; i++) {
        const at = at0 + i * 0.5;
        add(e, {
          at, kind: 'bomb', warn: 1,
          cue: (e, p, n) => {
            n.a = angleTo(e.x, e.y, p.x, p.y) + (i % 2 ? 0.45 : -0.45);
            spawnHazard({ kind: 'cone', x: e.x, y: e.y, angle: n.a, arc: 1.8, r: 150, delay: secs(e, at), color: BOMB, owner: e, follow: e });
          },
          fire: (e, p, n) => { cutLands(e, n.a, 1.8, 150, 0.55); band.pizz(chordAt(at).arp[i] + 12, 1); },
        });
      }
      return at0 + 2;
    }, 2),

    // 9. Orchestra: a drummer, a violinist and a horn player take their
    //    seats and play along with him until they're struck down or bow.
    orchestra: phraseMove(22, 2, (e, p, at0) => {
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
          fire: (e, p) => { fan(e, leadAt(e.x, e.y, p, 240, 0.6), 3, 0.34, 240, PIZZ); band.pizz(chordAt(at).arp[i % 4], 0.9); },
        });
      }
      return at0 + 8;
    }),

    // 11. OVERTURE (phase-1 barrage): four bars — timpani on every downbeat,
    //     staccato on the backbeats, and an arpeggio across the last two.
    //     Then he bows.
    overture: phraseMove(30, 1, (e, p, at0) => {
      add(e, { at: at0, kind: 'rest', warn: 1, cue: (e) => say(e, 'The Overture!', PIZZ) });
      for (let bar = 0; bar < 4; bar++) {
        const b0 = at0 + bar * 4;
        drumNote(e, b0);
        fanNote(e, b0 + 1, 5, 0.6, chordAt(b0).arp[1]);
        fanNote(e, b0 + 3, 5, 0.6, chordAt(b0).arp[3]);
      }
      arpLine(e, at0 + 8, 8, [0], false);
      arpLine(e, at0 + 12, 8, [0.35], true);
      add(e, {
        at: at0 + 16, kind: 'sfz',
        fire: (e) => { band.sforzando(chordAt(at0).pad); say(e, 'Bravo!', PIZZ); expose(e, 2.2); },
      });
      return at0 + 16.5;
    }),

    // --- phase 2 ------------------------------------------------------------------------

    // 12. Canon: a bar of blasts and notes — then he steps through to the
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
          fire: (e, p) => { fan(e, angleTo(e.x, e.y, p.x, p.y), 3, 0.4, 250, PIZZ); band.pizz(chordAt(at).arp[i], 1); },
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
            blastAt(e, p.x, p.y, 50, secs(e, at), 0.5, BOMB);
          },
          fire: (e, p) => { fan(e, angleTo(e.x, e.y, p.x, p.y), 3, 0.4, 250, PIZZ); band.pizz(chordAt(at).arp[3 - i] + 12, 1); },
        });
      }
      return at0 + 8;
    }),

    // 13. GRAND FINALE (phase-2 barrage): the orchestra returns, strings spin
    //     for four bars over the timpani, then the music stops — find a light —
    //     SFORZANDO. Then he bows, spent.
    finale: phraseMove(32, 3, (e, p, at0) => {
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
          fire: (e) => {
            if (i === 0) band.strings(chordAt(at).pad.map((m) => m + 12), secs(e, at + 16));
            for (let k = 0; k < 3; k++) shot(e, base + i * 0.26 + (k / 3) * TAU, 150, { shape: 'orb', r: 7, color: STRING, dmg: 0.4, life: 6 });
          },
        });
      }
      for (let bar = 0; bar < 4; bar++) drumNote(e, at0 + bar * 4);
      sforzando(e, at0 + 20);
      add(e, {
        at: at0 + 21, kind: 'rest',
        fire: (e) => { say(e, 'Bravo… bravo.', PIZZ); expose(e, 2.6); },
      });
      return at0 + 21.5;
    }),
  },

  // --- drawing ------------------------------------------------------------------------

  draw(e, ctx) { drawMaestro(ctx, e, world.runTime); },

  drawExtras(e, ctx, t) {
    const p = world.player;
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
    // Fermata: the stage goes red; stage lights mark where it's safe.
    if (e.safe) {
      const b = arenaBounds();
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
      const b = arenaBounds();
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
  drawArena(ctx, room, t) {
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
  sfz: { line: 2, color: SFZ, shape: 'accent' },
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
    ctx.beginPath(); ctx.arc(x1 + 22 + (k % 4) * 9, y0 + 6 + Math.floor(k / 4) * 12, 3.2, 0, TAU); ctx.fill();
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
    ctx.fillStyle = '#8a5a3a';
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
  } else {
    ctx.strokeStyle = '#e8c060';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(r * 0.1, r * 0.3, r * 0.45, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#e8c060';
    ctx.beginPath(); ctx.arc(r * 0.7, r * 0.1, r * 0.22 + k * 3, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
