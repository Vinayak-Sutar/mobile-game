// Cinematics: a film, and the projector that plays it.
//
// A film is a list of SHOTS, and nothing else. A shot is
//
//   { hold, draw, say, sayAt, cam, cue, beats }
//
//   hold   how long it stays up, in seconds
//   draw   (ctx, t, k) - paints the shot; t is seconds in, k is 0..1 through it
//   say    the line along the foot (one short sentence; it wraps if it must)
//   sayAt  when that line arrives (default 0.55 s in)
//   cam    { z0, z1, x0, x1, y0, y1 } - a slow push or drift across the shot,
//          eased; z is never below 1, so the frame is always covered
//   cue    run once as the shot opens (a sound, a change of music)
//   beats  [{ at, run }] - run once as the shot passes that second
//
// Every shot paints into the same 1000x560 FILM space, and the projector
// scales that to COVER the screen, so a phone, a tablet and a desktop all see
// the same picture with only the edges differing. Black bars top and bottom,
// the line along the foot, a cross-fade at every cut, and any press at all
// skips out: the things a player expects of an opening.

import { clamp } from './util.js';

export const FILM = { w: 1000, h: 560 };

const FADE = 0.55;          // the cross-fade at a cut
const OPEN = 1.2;           // the film's own fade up from black
const BARS = 0.075;         // letterbox, as a share of the screen's height
const FONT = '"Segoe UI", Roboto, system-ui, sans-serif';

let film = null;

/**
 * Start a film. `onEnd` runs once, whether it was watched or skipped.
 *
 * `opts.manual` makes it a PICTURE BOOK rather than a film: a shot holds
 * until the player presses, and a press turns the page. `hold` then only
 * says how long the shot takes to settle, not how long it lasts, and the
 * line stays up instead of fading out on a clock - there is no clock.
 */
export function startCinema(shots, onEnd, opts = {}) {
  film = {
    shots, onEnd, i: 0, t: 0, age: 0, out: 0, outMax: FADE, fired: new Set(),
    manual: !!opts.manual,
  };
  const first = shots[0];
  if (first && first.cue) first.cue();
  return film;
}

export function cinemaOn() { return !!film; }

/** Any press: out, over the same fade a cut uses. */
export function skipCinema() {
  if (film && film.out <= 0) { film.out = 0.4; film.outMax = 0.4; }
}

/** Turn the page. The last page closes the book. */
export function advanceCinema() {
  if (!film || film.out > 0) return;
  // Not while the cut is still crossing, or one eager tap takes two pages.
  if (film.t < 0.35 && film.i > 0) return;
  if (film.age < 0.5) return;
  cut();
}

/** What a press does to THIS film: turn the page, or leave. */
export function pressCinema() {
  if (!film) return;
  if (film.manual) advanceCinema(); else skipCinema();
}

function cut() {
  film.i++;
  film.t = 0;
  const next = film.shots[film.i];
  if (!next) { film.out = film.outMax = FADE; return; }
  if (next.cue) next.cue();
}

export function updateCinema(dt) {
  if (!film) return;
  film.age += dt;
  film.t += dt;

  if (film.out > 0) {
    film.out -= dt;
    if (film.out <= 0) {
      const end = film.onEnd;
      film = null;
      if (end) end();
    }
    return;
  }

  const shot = film.shots[film.i];
  if (!shot) { film.out = film.outMax = FADE; return; }

  // Beats inside a shot: a clap of thunder, a change of tune.
  if (shot.beats) {
    for (let b = 0; b < shot.beats.length; b++) {
      const key = film.i + ':' + b;
      if (film.t >= shot.beats[b].at && !film.fired.has(key)) {
        film.fired.add(key);
        shot.beats[b].run();
      }
    }
  }

  // A picture book waits. A film does not.
  if (!film.manual && film.t >= shot.hold) cut();
}

const ease = (k) => k * k * (3 - 2 * k);
const mix = (a, b, k) => a + (b - a) * k;

export function drawCinema(ctx, view) {
  if (!film) return;
  const shot = film.shots[Math.min(film.i, film.shots.length - 1)];
  const k = clamp(film.t / shot.hold, 0, 1);

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, view.w, view.h);

  // The film covers the screen: the middle is always seen, the edges may not be.
  const cover = Math.max(view.w / FILM.w, view.h / FILM.h);
  const c = shot.cam || {};
  const e = ease(k);
  const z = cover * mix(c.z0 === undefined ? 1 : c.z0, c.z1 === undefined ? 1 : c.z1, e);
  const px = mix(c.x0 || 0, c.x1 || 0, e);
  const py = mix(c.y0 || 0, c.y1 || 0, e);

  ctx.save();
  ctx.translate(view.w / 2, view.h / 2);
  ctx.scale(z, z);
  ctx.translate(-FILM.w / 2 - px, -FILM.h / 2 - py);
  shot.draw(ctx, film.t, k);
  ctx.restore();

  // --- the frame it is shown in -------------------------------------------
  const bar = Math.round(view.h * BARS);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, view.w, bar);
  ctx.fillRect(0, view.h - bar, view.w, bar);

  if (shot.say) {
    const at = shot.sayAt === undefined ? 0.55 : shot.sayAt;
    const up = clamp((film.t - at) / 0.5, 0, 1);
    // A page that waits keeps its line up. Fading it out on `hold` would
    // take the words away while the picture was still there to be read.
    const down = film.manual ? 1 : clamp((shot.hold - 0.35 - film.t) / 0.45, 0, 1);
    const show = Math.min(up, down);
    // A wash under the line: a lamp, a fire or a dawn can sit exactly where the
    // words are, and white on gold is not reading.
    if (show > 0.01) {
      const wash = ctx.createLinearGradient(0, view.h - bar - 118, 0, view.h - bar);
      wash.addColorStop(0, 'rgba(4,3,7,0)');
      wash.addColorStop(1, `rgba(4,3,7,${(0.62 * show).toFixed(3)})`);
      ctx.fillStyle = wash;
      ctx.fillRect(0, view.h - bar - 118, view.w, 118);
    }
    drawSay(ctx, view, shot.say, show * 0.96, bar);
  }

  // What a press would do. On a picture book it comes up as soon as the
  // line has, because it is the instruction rather than an escape hatch.
  const last = film.i >= film.shots.length - 1;
  const after = film.manual ? (shot.sayAt === undefined ? 0.55 : shot.sayAt) + 0.7 : 2.2;
  const hint = clamp((film.t - after) / 0.6, 0, 1) * (film.out > 0 ? 0 : 1)
    * (film.manual ? 1 : clamp((film.age - 2.2) / 0.8, 0, 1));
  if (hint > 0.01) {
    const pulse = film.manual ? 0.62 + 0.24 * Math.sin(film.age * 2.6) : 0.4;
    ctx.globalAlpha = hint * pulse;
    ctx.fillStyle = '#e9dcc8';
    ctx.font = `600 11px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(film.manual ? (last ? 'TAP TO BEGIN  ›' : 'TAP TO GO ON  ›') : 'PRESS ANYWHERE TO SKIP',
      view.w - 18, view.h - bar - 14);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  // --- the dark between shots ---------------------------------------------
  let dark = 0;
  if (film.age < OPEN) dark = 1 - film.age / OPEN;
  if (film.t < FADE && film.i > 0) dark = Math.max(dark, 1 - film.t / FADE);
  // THE FADE-OUT AT THE END OF A SHOT IS KEYED ON `hold`, and a page that
  // waits runs past `hold` for ever - so (hold - t) goes negative, the veil
  // clamps to 1, and the whole picture book is a black screen. A page only
  // goes dark when it is actually turned, which the cross-fade above does.
  if (!film.manual && shot.hold - film.t < FADE && film.out <= 0) dark = Math.max(dark, 1 - (shot.hold - film.t) / FADE);
  if (film.out > 0) dark = Math.max(dark, 1 - film.out / film.outMax);
  if (dark > 0.001) {
    ctx.fillStyle = `rgba(0,0,0,${clamp(dark, 0, 1).toFixed(3)})`;
    ctx.fillRect(0, 0, view.w, view.h);
  }
}

/** The line along the foot, wrapped to the screen and never in the picture's way. */
function drawSay(ctx, view, text, alpha, bar) {
  if (alpha <= 0.01) return;
  const size = Math.max(13, Math.min(19, Math.round(view.w / 46)));
  ctx.font = `600 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  const max = Math.min(view.w * 0.84, 760);
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? line + ' ' + word : word;
    if (ctx.measureText(next).width > max && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);

  const lh = size * 1.42;
  let y = view.h - bar - 16 - (lines.length - 1) * lh;
  for (const l of lines) {
    ctx.globalAlpha = alpha * 0.55;
    ctx.fillStyle = '#000';
    ctx.fillText(l, view.w / 2 + 1, y + 2);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#f0e2cb';
    ctx.fillText(l, view.w / 2, y);
    y += lh;
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}
