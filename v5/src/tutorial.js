// The tutorial chamber: an optional first room that teaches the controls one
// at a time, by doing rather than reading.
//
// Each lesson asks for one action, says how on the device in use (touch,
// keyboard or pad), points at the button or the part of the HUD it is about,
// and moves on the moment the player has done it. The last lesson is a small
// real fight that needs everything together. Nothing here is banked.
//
// The room itself is a training room (no doors, never clears); game.js owns
// entering and leaving it, this module owns the lessons.

import { world, view, arenaBounds } from './state.js';
import { TAU, dist, roundRect } from './util.js';
import { input } from './input.js';
import { ring, burst } from './fx.js';
import { sfx } from './audio.js';
import { learnSpell } from './spells.js';
import { hudAnchor, chargeRowAnchor } from './ui.js';

const FONT = '"Segoe UI", Roboto, system-ui, sans-serif';
const GOLD = '#ffc861';
const DONE_PAUSE = 1.0;

let spawnFn = null;
export function bindTutorialSpawner(fn) { spawnFn = fn; }

export const tutorial = {
  step: 0,
  count: 0,           // progress within the current lesson
  doneT: 0,           // >0 while the "done" tick shows before the next lesson
  marker: null,       // a spot on the floor to walk to
  // Edge detectors for the actions a lesson waits for.
  was: { dashing: false, specialCd: 0, grenades: 0, spellCd: 0 },
};

function device() {
  return input.touchMode ? 'touch' : input.padMode ? 'pad' : 'key';
}

function mid() {
  const b = arenaBounds();
  return { b, cx: b.l + (b.r - b.l) / 2, cy: b.t + (b.b - b.t) / 2 };
}

/** A straw dummy that does break: the tutorial's targets. */
function breakable(x, y, hp = 60) {
  const e = spawnFn('dummy', x, y, { instant: false });
  e.breakable = true;
  e.hpFloor = undefined;
  e.maxHp = hp;
  e.hp = hp;
  return e;
}

function clearFoes() {
  for (const e of world.enemies) e.dead = true;
}

function aliveFoes() {
  return world.enemies.filter((e) => !e.dead).length;
}

// --- the lessons -----------------------------------------------------------
// `say` is keyed by device; `note` is the one extra line of why it matters.
// `point` names a HUD anchor to highlight (see hudAnchor in ui.js).

const LESSONS = [
  {
    id: 'move', title: 'Move',
    say: {
      touch: 'Drag anywhere on the left half of the screen to walk to the light.',
      key: 'Walk to the light with  W A S D.',
      pad: 'Walk to the light with the left stick.',
    },
    note: 'Aim follows the nearest enemy on its own, so moving is most of the game.',
    setup() {
      const { b, cx } = mid();
      tutorial.marker = { x: cx, y: b.t + (b.b - b.t) * 0.28 };
    },
    check(p) { return tutorial.marker && dist(p.x, p.y, tutorial.marker.x, tutorial.marker.y) < 46; },
  },
  {
    id: 'attack', title: 'Attack', goal: 3,
    say: {
      touch: 'Tap ATK to strike. Keep tapping to chain a combo.',
      key: 'Click, or press J, to strike. Keep going to chain a combo.',
      pad: 'Press R2 to strike. Keep going to chain a combo.',
    },
    note: 'Break all three dummies.',
    point: 'attack',
    setup() {
      tutorial.marker = null;
      const { cx, cy } = mid();
      for (let i = -1; i <= 1; i++) breakable(cx + i * 110, cy - 40);
    },
    check() {
      tutorial.count = 3 - world.enemies.filter((e) => !e.dead && e.breakable).length;
      return tutorial.count >= 3;
    },
  },
  {
    id: 'dash', title: 'Dash', goal: 2,
    say: {
      touch: 'Tap DASH to dart the way you are moving.',
      key: 'Press SPACE to dart the way you are moving.',
      pad: 'Press ✕ or L1 to dart the way you are moving.',
    },
    note: 'Nothing can hit you mid-dash. Dashes come in charges: watch the ring and the DASH pips refill.',
    point: 'dash', pointRow: 'dash',
    setup() { tutorial.marker = null; },
    check(p) {
      if (p.dashing && !tutorial.was.dashing) tutorial.count++;
      return tutorial.count >= 2;
    },
  },
  {
    id: 'special', title: 'Special',
    say: {
      touch: 'Tap SPEC for your weapon’s special move.',
      key: 'Press K, or right-click, for your weapon’s special move.',
      pad: 'Press L2 for your weapon’s special move.',
    },
    note: 'Every weapon has its own. It has a cooldown, shown as a sweep on its button.',
    point: 'special',
    setup() {
      const { cx, cy } = mid();
      spawnFn('dummy', cx, cy - 60, { instant: false });
    },
    check(p) {
      if (p.specialCd > tutorial.was.specialCd + 0.01) tutorial.count++;
      return tutorial.count >= 1;
    },
  },
  {
    id: 'grenade', title: 'Grenade', goal: 2,
    say: {
      touch: 'Tap BOMB to throw at the nearest foe. Drag from BOMB to aim it yourself; drag onto ✕ to cancel.',
      key: 'Tap Q to throw at the nearest foe. Hold Q and point with the mouse to aim; right-click cancels.',
      pad: 'Tap ○ to throw at the nearest foe. Hold ○ and push the right stick to aim.',
    },
    note: 'The blast hits everything in it. Grenades come in charges too, and recharge slowly: watch the BOMB pips.',
    point: 'grenade', pointRow: 'grenade',
    setup() {
      clearFoes();
      const { cx, cy } = mid();
      breakable(cx - 34, cy - 70, 90);
      breakable(cx + 34, cy - 70, 90);
      breakable(cx, cy - 120, 90);
    },
    check() { return tutorial.count >= 2; },
  },
  {
    id: 'spell', title: 'Spells',
    say: {
      touch: 'Tap the spell button to cast Fireball.',
      key: 'Press 1 to cast Fireball.',
      pad: 'Hold R1 and press ✕ to cast Fireball.',
    },
    note: 'Spells are strong but slow to recharge. Spell doors in a run teach you new ones, up to four.',
    point: 'spell',
    setup(p) {
      clearFoes();
      const { cx, cy } = mid();
      spawnFn('dummy', cx, cy - 80, { instant: false });
      if (!p.spells.includes('fireball')) learnSpell(p, 'fireball');
    },
    check() { return tutorial.count >= 1; },
  },
  {
    id: 'fight', title: 'Put it together',
    say: {
      touch: 'Real foes this time. Dash through their lunges and use everything.',
      key: 'Real foes this time. Dash through their lunges and use everything.',
      pad: 'Real foes this time. Dash through their lunges and use everything.',
    },
    note: 'Red lines and rings are warnings: something is about to land there.',
    setup() {
      clearFoes();
      const { b, cx } = mid();
      const y = b.t + 110;
      spawnFn('wretch', cx - 180, y, { instant: false, scale: 0.8 });
      spawnFn('wretch', cx + 180, y, { instant: false, scale: 0.8 });
      spawnFn('slinger', cx, y - 20, { instant: false, scale: 0.8 });
    },
    check() { return aliveFoes() === 0; },
  },
];

export const LESSON_COUNT = LESSONS.length;

export function startLessons() {
  tutorial.step = 0;
  tutorial.doneT = 0;
  tutorial.marker = null;
  beginLesson();
}

function beginLesson() {
  const p = world.player;
  tutorial.count = 0;
  syncEdges(p);
  const lesson = LESSONS[tutorial.step];
  if (lesson && lesson.setup) lesson.setup(p);
}

function syncEdges(p) {
  if (!p) return;
  tutorial.was.dashing = !!p.dashing;
  tutorial.was.specialCd = p.specialCd || 0;
  tutorial.was.grenades = p.grenadeStock;
  const cds = p.spellCds || {};
  tutorial.was.spellCd = Math.max(0, ...Object.values(cds));
}

/** Per frame. Returns true once the last lesson is done. */
export function updateTutorial(dt) {
  const p = world.player;
  if (!p) return false;
  const lesson = LESSONS[tutorial.step];
  if (!lesson) return true;

  if (tutorial.doneT > 0) {
    tutorial.doneT -= dt;
    if (tutorial.doneT <= 0) {
      tutorial.step++;
      if (tutorial.step >= LESSONS.length) return true;
      beginLesson();
    }
    return false;
  }

  // Throws and casts are counted here, so their lessons can stay one-liners.
  if (p.grenadeStock < tutorial.was.grenades && lesson.id === 'grenade') tutorial.count++;
  const cds = p.spellCds || {};
  const spellCd = Math.max(0, ...Object.values(cds));
  if (spellCd > tutorial.was.spellCd + 0.01 && lesson.id === 'spell') tutorial.count++;

  const passed = lesson.check(p);
  syncEdges(p);
  tutorial.was.spellCd = spellCd;

  if (passed) {
    tutorial.doneT = DONE_PAUSE;
    tutorial.marker = null;
    sfx.boon();
    ring(p.x, p.y, { r0: 10, r1: 90, color: GOLD, life: 0.5, width: 5 });
    burst(p.x, p.y, { count: 16, color: GOLD, speed: 240, size: 4, life: 0.5, drag: 4, shape: 'spark' });
  }
  return false;
}

// --- drawing ---------------------------------------------------------------

/** The spot to walk to, drawn on the floor. */
export function drawTutorialWorld(ctx) {
  const m = tutorial.marker;
  if (!m) return;
  const t = world.runTime;
  const pulse = 0.5 + Math.sin(t * 4) * 0.5;
  ctx.save();
  ctx.globalAlpha = 0.18 + pulse * 0.14;
  ctx.fillStyle = GOLD;
  ctx.beginPath();
  ctx.arc(m.x, m.y, 40, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(m.x, m.y, 40 + pulse * 6, 0, TAU);
  ctx.stroke();
  // A beam of light, so the spot is visible from anywhere in the room.
  const g = ctx.createLinearGradient(m.x, m.y - 160, m.x, m.y);
  g.addColorStop(0, 'rgba(255,200,97,0)');
  g.addColorStop(1, 'rgba(255,200,97,0.35)');
  ctx.globalAlpha = 1;
  ctx.fillStyle = g;
  ctx.fillRect(m.x - 18, m.y - 160, 36, 160);
  ctx.restore();
}

function highlight(ctx, a, t) {
  if (!a) return;
  const pulse = 0.5 + Math.sin(t * 6) * 0.5;
  ctx.save();
  ctx.strokeStyle = GOLD;
  ctx.globalAlpha = 0.55 + pulse * 0.45;
  ctx.lineWidth = 3.5;
  if (a.w) {
    roundRect(ctx, a.x - 6, a.y - 6, a.w + 12, a.h + 12, 8);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(a.x, a.y, a.r + 14 + pulse * 5, 0, TAU);
    ctx.stroke();
    // A bouncing arrow, pointing down at it.
    const ay = a.y - a.r - 30 - pulse * 8;
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.moveTo(a.x, ay + 14);
    ctx.lineTo(a.x - 10, ay);
    ctx.lineTo(a.x + 10, ay);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Wrap text to a width; returns the lines. */
function wrap(ctx, text, width) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > width && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

/** The lesson card at the top, and the highlight on whatever it is about. */
export function drawTutorialHud(ctx) {
  const lesson = LESSONS[tutorial.step];
  if (!lesson) return;
  const t = world.runTime;
  const done = tutorial.doneT > 0;

  if (!done) {
    if (lesson.point) highlight(ctx, hudAnchor(lesson.point), t);
    if (lesson.pointRow) highlight(ctx, chargeRowAnchor(lesson.pointRow), t);
  }

  const w = Math.min(560, view.w - 80);
  const x = view.w / 2 - w / 2;
  const y = 84;

  ctx.font = `600 14px ${FONT}`;
  const sayLines = wrap(ctx, lesson.say[device()], w - 40);
  ctx.font = `500 12px ${FONT}`;
  const noteLines = wrap(ctx, lesson.note || '', w - 40);
  const h = 58 + sayLines.length * 19 + noteLines.length * 16;

  ctx.fillStyle = 'rgba(8,6,13,0.78)';
  roundRect(ctx, x, y, w, h, 12);
  ctx.fill();
  ctx.strokeStyle = done ? 'rgba(125,255,156,0.8)' : 'rgba(255,200,97,0.55)';
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 12);
  ctx.stroke();

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `800 10px ${FONT}`;
  ctx.fillText(`TUTORIAL · ${tutorial.step + 1} / ${LESSONS.length}`, x + 20, y + 16);

  ctx.textAlign = 'right';
  ctx.fillText('PAUSE TO SKIP', x + w - 20, y + 16);

  ctx.textAlign = 'left';
  ctx.fillStyle = done ? '#7dff9c' : GOLD;
  ctx.font = `900 19px ${FONT}`;
  const title = done ? `✓  ${lesson.title}` : lesson.title;
  ctx.fillText(title, x + 20, y + 38);

  if (lesson.goal && !done) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 16px ${FONT}`;
    ctx.fillText(`${Math.min(tutorial.count, lesson.goal)} / ${lesson.goal}`, x + w - 20, y + 38);
  }

  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = `600 14px ${FONT}`;
  let ly = y + 60;
  for (const l of sayLines) { ctx.fillText(l, x + 20, ly); ly += 19; }
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `500 12px ${FONT}`;
  for (const l of noteLines) { ctx.fillText(l, x + 20, ly); ly += 16; }
}
