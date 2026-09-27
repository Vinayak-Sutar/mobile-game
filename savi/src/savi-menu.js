// Savi — somewhere to stop.
//
// There was no pause at all. On a phone that means the only way to put the
// game down is to close the tab, and on itch it means a player who cannot
// work out a button has nowhere to look it up. Both of those are the
// difference between a prototype and a thing you hand to a stranger.
//
// It is drawn ON THE CANVAS, in her belt's visual language, and not as HTML.
// That is the whole reason it is short: one list of rows, one selection, and
// the same few lines serve a thumb, a stick and the arrow keys. An HTML menu
// would want its own focus handling, its own pad code and its own stylesheet
// to sit inside a canvas game that is already letterboxed.
//
// Four pages, and no more than four:
//
//   PAUSED        resume, and the three doors
//   CONTROLS      every action and its key, and the keyboard ones can be
//                 CHANGED - the thing the key table exists for
//   SOUND         music on or off, two volumes, fullscreen
//   HOW TO PLAY   what she is doing here, and the three verbs
//
// Escape closes the page that is open, and from the top it resumes. It is not
// in the key table and never will be: a player who has bound their way out of
// the menu has no way back into it.

import { view } from './state.js';
import { clamp, TAU } from './util.js';
import {
  audio, setMusicEnabled, setMusicVolume, setVolume, previewMusic, sfx,
} from './audio.js';
import { toggleFullscreen, isFullscreen, fullscreenSupported } from './fullscreen.js';
import { ACTIONS, keyLabels, rebindKey, defaultKeys, prettyKey } from './savi-keys.js';
import { BUILD } from './update.js';

/**
 * WHAT THE MENU IS. `page` is which of the four; `sel` walks the rows; `wait`
 * is the action whose new key we are listening for, and while it is set the
 * next key pressed goes into the table instead of into the game.
 */
export const menu = {
  open: false, page: 'root', sel: 0, t: 0, wait: null, note: '', noteT: 9,
  // The lowest thing the last draw put on the screen. It is here so the
  // checker can say whether a page fits, which is the one way this thing
  // breaks that you cannot see coming: a phone scales the text half again
  // and a list that was comfortable on a desktop walks off the bottom.
  bottom: 0,
};

let host = { isTouch: () => false, padOn: () => false };
let rows = [];          // laid out by drawMenu(), read by the pointer
let hits = [];          // one rect per row, in view units

export function initMenu(h) { host = { ...host, ...h }; }

// --- the sound settings, which the game had nowhere to keep --------------------------
//
// `setVolume` writes the master gain and forgets the number, and nothing at all
// remembered whether a player had turned the music off. So the three of them
// live here and are written back on every change. It is read in begin(), not
// in initMenu, because until the first tap there is no audio context to set.

const SOUND = 'savi.sound.v1';
const snd = { vol: 0.9 };

export function loadSound() {
  let raw = null;
  try { raw = localStorage.getItem(SOUND); } catch (e) { return; }
  if (raw) {
    try {
      const s = JSON.parse(raw);
      if (s && typeof s === 'object') {
        if (typeof s.music === 'boolean') setMusicEnabled(s.music);
        if (Number.isFinite(s.musicVol)) setMusicVolume(clamp(s.musicVol, 0, 1));
        if (Number.isFinite(s.vol)) snd.vol = clamp(s.vol, 0, 1);
      }
    } catch (e) { /* an older build, or a half-written entry */ }
  }
  setVolume(snd.vol);
}

function saveSound() {
  try {
    localStorage.setItem(SOUND, JSON.stringify({
      music: audio.music, musicVol: audio.musicVolume, vol: snd.vol,
    }));
  } catch (e) { /* a private window */ }
}

// --- opening and shutting ------------------------------------------------------------

export const menuOn = () => menu.open;

export function openMenu() {
  if (menu.open) return;
  menu.open = true;
  menu.page = 'root';
  menu.sel = 0;
  menu.t = 0;
  menu.wait = null;
  menu.note = '';
  menu.noteT = 9;
  rows = pageRows();
  sfx.ui();
}

export function closeMenu() {
  if (!menu.open) return;
  menu.open = false;
  menu.wait = null;
  rows = []; hits = [];
  sfx.ui();
}

function say(text) { menu.note = text; menu.noteT = 0; }

function go(page) {
  menu.page = page;
  menu.sel = 0;
  menu.wait = null;
  menu.note = '';
  rows = pageRows();
  sfx.ui();
}

// --- the rows -----------------------------------------------------------------------
//
// A row is a label, something on the right, and what pressing it does. `slide`
// marks the two that are a bar rather than a word, which is the only place
// left and right mean anything in here.

function pageRows() {
  if (menu.page === 'root') {
    return [
      { label: 'Resume', act: closeMenu },
      { label: 'Controls', act: () => go('keys') },
      { label: 'Sound', act: () => go('sound') },
      { label: 'How to play', act: () => go('help') },
    ];
  }
  if (menu.page === 'keys') {
    // NINE ROWS DO NOT FIT ON A PHONE, and there is nothing to press them
    // with. Measured: at the touch text scale the list runs to 809 on a
    // 720-tall view, off the bottom of the screen and through the footer. So
    // a phone gets what a phone can act on - its own layout, and the pad's -
    // and the keyboard rows appear on the machine that has a keyboard.
    if (host.isTouch()) return [{ label: 'Back', act: () => go('root') }];
    const out = ACTIONS.map((a) => ({
      label: a.name,
      value: menu.wait === a.id ? 'press a key' : keyLabels(a.id),
      lit: menu.wait === a.id,
      act: () => { menu.wait = a.id; say('escape to leave it as it is'); sfx.tick(); },
    }));
    out.push({
      label: 'Reset to defaults',
      act: () => { defaultKeys(); menu.wait = null; say('back to how it shipped'); sfx.pickup(); },
    });
    out.push({ label: 'Back', act: () => go('root') });
    return out;
  }
  if (menu.page === 'sound') {
    const out = [
      {
        label: 'Music',
        value: audio.music ? 'on' : 'off',
        act: () => { setMusicEnabled(!audio.music); saveSound(); sfx.click(); },
      },
      {
        label: 'Music volume',
        slide: () => audio.musicVolume,
        set: (v) => { setMusicVolume(v); previewMusic(); saveSound(); },
      },
      {
        label: 'Everything else',
        slide: () => snd.vol,
        set: (v) => { snd.vol = v; setVolume(v); saveSound(); sfx.tick(); },
      },
    ];
    if (fullscreenSupported()) {
      out.push({
        label: 'Fullscreen',
        value: isFullscreen() ? 'on' : 'off',
        act: () => { toggleFullscreen(); sfx.click(); },
      });
    }
    out.push({ label: 'Back', act: () => go('root') });
    return out;
  }
  return [{ label: 'Back', act: () => go('root') }];
}

/** What a pad and a thumb do, which nothing can change and nothing should. */
const FIXED_KEYS = [
  'a controller: stick or d-pad to walk · cross to jump · circle to dash',
  'square to interact and to use · L1 for her belt · start to pause',
  '',
  'a phone: the left of the screen steers · the ring taps to interact and holds to use',
];
const TOUCH_KEYS = [
  'The left of the screen steers her.',
  'The ring, bottom right: TAP it for what is in front of her,',
  'HOLD it for what is in her hand.',
  '',
  'The tool in the corner opens her belt. ❚❚ at the top pauses.',
  '',
  'a controller: stick or d-pad to walk · cross to jump · circle to dash',
  'square to interact and to use · L1 for her belt · start to pause',
];

/** How to play, in a few lines and not forty. */
const HELP = [
  'The Great Banyan is dying, and everything in this valley grows under it.',
  'Five of its great roots are choked. Free one and a young banyan comes up',
  'on it carrying a painted mural, and reading a mural gives the old keeper',
  'back her story, a piece at a time.',
  '',
  'Three things she can do. Sweep what is lying on a root. Hold the lantern',
  'out at what will not move, and go back to a fire when the coal burns down.',
  'Lift a stone off a root and throw it away.',
  '',
  'Her belt is where you change which of those is in her hands.',
];

// --- input ---------------------------------------------------------------------------

function list() { return rows.length ? rows : pageRows(); }

function move(d) {
  if (menu.wait) return;
  const n = list().length;
  menu.sel = (menu.sel + d + n) % n;
  sfx.tick();
}

/** Left and right, which only the two bars care about. */
function adjust(d) {
  if (menu.wait) return;
  const r = list()[menu.sel];
  if (!r || !r.slide) return;
  r.set(clamp(Math.round((r.slide() + d * 0.1) * 10) / 10, 0, 1));
}

function pick() {
  if (menu.wait) { menu.wait = null; menu.note = ''; return; }
  const r = list()[menu.sel];
  if (!r) return;
  if (r.act) r.act();
  else if (r.slide) r.set(r.slide() >= 1 ? 0 : clamp(r.slide() + 0.1, 0, 1));
}

/** Escape, or circle: out of the page, and from the top out of the menu. */
function back() {
  if (menu.wait) { menu.wait = null; menu.note = ''; sfx.tick(); return; }
  if (menu.page !== 'root') { go('root'); return; }
  closeMenu();
}

/**
 * A key, while the menu is up. The caller has already worked out which action
 * that key belongs to, if any, and hands it over as `a` - so the arrows walk
 * the list whether or not a player has rebound them to something.
 *
 * THE CAPTURE. While `wait` is set the very next key is bound, and that is why
 * savi.js calls this before anything else reads a keydown: the key being bound
 * must not also do the thing it is currently bound TO on its way past.
 */
export function menuKey(k, a) {
  if (menu.wait) {
    if (k === 'escape') { menu.wait = null; menu.note = ''; sfx.tick(); return; }
    const id = menu.wait;
    const mine = ACTIONS.find((q) => q.id === id);
    const r = rebindKey(id, k);
    menu.wait = null;
    rows = pageRows();
    if (r.refused) { say(r.refused); sfx.click(); return; }
    if (r.took) {
      // TAKEN, AND SAID OUT LOUD. A key quietly doing two things is a player
      // pressing one button and getting two verbs, which reads as the game
      // being broken rather than as something they did.
      const other = ACTIONS.find((q) => q.id === r.took);
      say(`${prettyKey(k)} was ${other.name.toLowerCase()}. That is ${keyLabels(r.took)} now.`);
    } else {
      say(`${mine.name.toLowerCase()} is ${prettyKey(k)}`);
    }
    sfx.pickup();
    return;
  }
  if (k === 'escape' || k === 'q') { back(); return; }
  if (k === 'arrowup' || a === 'up') { move(-1); return; }
  if (k === 'arrowdown' || a === 'down') { move(1); return; }
  if (k === 'arrowleft' || a === 'left') { adjust(-1); return; }
  if (k === 'arrowright' || a === 'right') { adjust(1); return; }
  if (k === 'enter' || k === ' ' || a === 'interact' || a === 'jump') pick();
  // and everything else is swallowed by the caller
}

/** A controller. Circle backs out of a page, the way it backs out of a talk. */
export function menuPad(pad) {
  if (pad.upPressed) move(-1);
  if (pad.downPressed) move(1);
  if (pad.leftPressed) adjust(-1);
  if (pad.rightPressed) adjust(1);
  if (pad.pressed || pad.jumpPressed) pick();
  if (pad.dashPressed) back();
}

/** A finger or a mouse, in view units. */
export function menuPointer(px, py) {
  if (menu.wait) { menu.wait = null; menu.note = ''; sfx.tick(); return; }
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    if (px < h.x || px > h.x + h.w || py < h.y || py > h.y + h.h) continue;
    const r = rows[h.row];
    if (!r) return;
    menu.sel = h.row;
    // A BAR IS SET WHERE THE THUMB LANDS, not stepped. On a phone that is the
    // only thing a slider can mean.
    if (r.slide && h.bar && px > h.bar.x - 18) {
      r.set(clamp(Math.round(((px - h.bar.x) / h.bar.w) * 10) / 10, 0, 1));
      return;
    }
    pick();
    return;
  }
  // A TAP IN THE DARK GOES BACK. On a phone there is no escape key, and a
  // player who has opened Controls and wants out should not have to find the
  // one row that says so.
  back();
}

export function stepMenu(dt) {
  menu.t += dt;
  menu.noteT += dt;
  rows = pageRows();          // the values on the right are live
}

// --- drawing -------------------------------------------------------------------------

const FONT = (px) => `600 ${Math.round(px)}px "Segoe UI", Roboto, system-ui, sans-serif`;
const TITLE = { root: 'PAUSED', keys: 'CONTROLS', sound: 'SOUND', help: 'HOW TO PLAY' };

export function drawMenu(ctx) {
  if (!menu.open) { hits = []; return; }
  const touch = host.isTouch(), pad = host.padOn();
  // The same factor the buttons and the HUD scale by: text the size of text.
  const F = touch ? clamp(view.h / 400, 1, 1.55) : 1;
  const k = Math.min(1, menu.t * 7);
  if (!rows.length) rows = pageRows();
  hits = [];
  menu.bottom = 0;

  ctx.fillStyle = `rgba(12,9,7,${0.76 * k})`;
  ctx.fillRect(0, 0, view.w, view.h);

  // A PAGE OF TEXT DOES NOT GET THE FULL THUMB SCALE. The rows on PAUSED and
  // SOUND are things you hit with a thumb and want big; CONTROLS and HOW TO
  // PLAY are things you read, and at 1.55 they walked off the bottom of the
  // screen. They stop at 1.2, which is still half again the desktop size.
  const Ft = Math.min(F, 1.2);
  const wide = Math.min(700, view.w * 0.62);
  const x0 = Math.round(view.w / 2 - wide / 2);
  const text = menu.page === 'keys' || menu.page === 'help';
  const Fp = text ? Ft : F;
  const rh = Math.round((menu.page === 'keys' ? 30 : 40) * Fp);
  const top = Math.round((menu.page === 'keys' ? 132 : 188) * Fp);

  ctx.textAlign = 'center';
  ctx.font = FONT(25 * Fp);
  ctx.fillStyle = `rgba(255,214,170,${0.95 * k})`;
  ctx.fillText(TITLE[menu.page] || '', view.w / 2, top - 46 * Fp);

  if (menu.page === 'help') {
    ctx.textAlign = 'left';
    ctx.font = FONT(14 * Ft);
    let y = top - 26 * Ft;
    for (const line of HELP) {
      ctx.fillStyle = `rgba(240,226,203,${0.76 * k})`;
      ctx.fillText(line, x0, y);
      y += Math.round(21 * Ft);
    }
    menu.bottom = Math.max(menu.bottom, y);
    y += Math.round(8 * Ft);
    ctx.font = FONT(13 * Ft);
    ctx.fillStyle = `rgba(255,196,120,${0.82 * k})`;
    for (const line of deviceLines(pad, touch)) {
      ctx.fillText(line, x0, y);
      y += Math.round(20 * Ft);
    }
    menu.bottom = Math.max(menu.bottom, y);
    drawRows(ctx, [0], x0, wide, y + Math.round(18 * Ft), rh, k, Ft);
  } else if (!(menu.page === 'keys' && touch)) {
    // A phone's CONTROLS page is text with ONE row under it, and that row is
    // drawn down there with the text. Drawing the list here as well put a
    // second Back across the middle of the writing.
    drawRows(ctx, rows.map((r, i) => i), x0, wide, top, rh, k, Fp);
  }

  // On the controls page, the two layouts that are FIXED, said plainly so
  // nobody hunts for a way to change them. Pad conventions are settled enough
  // that players expect them not to move, and a touch layout has nothing in it
  // to rebind.
  if (menu.page === 'keys') {
    ctx.textAlign = 'center';
    ctx.font = FONT(13 * Ft);
    ctx.fillStyle = `rgba(240,226,203,${0.5 * k})`;
    let y = touch ? top + Math.round(10 * Ft) : top + rows.length * rh + Math.round(26 * Ft);
    for (const line of touch ? TOUCH_KEYS : FIXED_KEYS) {
      if (!line) { y += Math.round(10 * Ft); continue; }
      ctx.fillText(line, view.w / 2, y);
      y += Math.round(21 * Ft);
    }
    menu.bottom = Math.max(menu.bottom, y);
    ctx.font = FONT(12 * Ft);
    ctx.fillStyle = `rgba(240,226,203,${0.32 * k})`;
    ctx.fillText(touch
      ? 'a keyboard can be changed key by key, on a computer.'
      : 'those two are fixed. escape and enter are never bound.',
    view.w / 2, y + Math.round(6 * Ft));
    // On a phone the page is what it says, and the one row is its way out.
    if (touch) drawRows(ctx, [0], x0, wide, y + Math.round(44 * Ft), rh, k, Ft);
  }

  // Whatever just happened, under the list, for a few seconds.
  if (menu.note && menu.noteT < 6) {
    ctx.textAlign = 'center';
    ctx.font = FONT(13 * F);
    ctx.globalAlpha = Math.min(1, (6 - menu.noteT) * 1.4) * k;
    ctx.fillStyle = 'rgba(255,196,120,0.92)';
    ctx.fillText(menu.note, view.w / 2, view.h - 62 * F);
    ctx.globalAlpha = 1;
  }

  ctx.textAlign = 'center';
  ctx.font = FONT(12 * F);
  ctx.fillStyle = `rgba(240,226,203,${0.38 * k})`;
  ctx.fillText(touch ? 'tap a line · tap the dark to go back'
    : pad ? 'stick to choose · cross to pick · circle to go back'
      : 'arrows to choose · enter to pick · escape to go back',
  view.w / 2, view.h - 36 * F);

  // The build, dim, bottom right, so a bug report can name it.
  ctx.textAlign = 'right';
  ctx.font = FONT(11 * F);
  ctx.fillStyle = `rgba(240,226,203,${0.26 * k})`;
  ctx.fillText(`build ${BUILD}`, view.w - 18 * F, view.h - 16 * F);
  ctx.textAlign = 'left';
}

function deviceLines(pad, touch) {
  if (touch) {
    return ['The left of the screen steers her.',
      'The ring: a tap for what is in front of her, a hold for what is in her hand.'];
  }
  if (pad) {
    return ['Stick or d-pad to walk, cross to jump, circle to dash.',
      'Square: a tap for what is in front of her, a hold for what is in her hand.'];
  }
  return [`${keyLabels('up')} and ${keyLabels('left')} to walk · ${keyLabels('jump')} to jump · ${keyLabels('dash')} to dash`,
    `${keyLabels('interact')} for what is in front of her · ${keyLabels('use')} for what is in her hand`];
}

/** `which` is indexes into `rows`, so the help page can draw only its Back. */
function drawRows(ctx, which, x0, wide, top, rh, k, F) {
  for (let i = 0; i < which.length; i++) {
    const r = rows[which[i]];
    if (!r) continue;
    const y = top + i * rh;
    const on = which[i] === menu.sel;
    const h = { x: x0 - 16, y: Math.round(y - rh * 0.72), w: wide + 32, h: rh, bar: null, row: which[i] };

    if (on) {
      ctx.beginPath();
      round(ctx, h.x, h.y, h.w, h.h, 8);
      ctx.fillStyle = `rgba(52,38,26,${0.92 * k})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(255,196,120,${0.85 * k})`;
      ctx.lineWidth = 1.8;
      ctx.stroke();
      // The same dot her belt puts over the tool she is already holding.
      ctx.beginPath();
      ctx.arc(h.x - 13, y - rh * 0.22, 3, 0, TAU);
      ctx.fillStyle = `rgba(255,196,120,${0.9 * k})`;
      ctx.fill();
    }

    ctx.textAlign = 'left';
    ctx.font = FONT((on ? 15 : 14) * F);
    ctx.fillStyle = on ? `rgba(255,232,198,${0.98 * k})` : `rgba(226,210,186,${0.72 * k})`;
    ctx.fillText(r.label, x0, y);

    if (r.slide) {
      const bw = Math.round(wide * 0.34), bh = Math.max(6, Math.round(7 * F));
      const bx = x0 + wide - bw, by = Math.round(y - bh - 3 * F);
      h.bar = { x: bx, y: by, w: bw, h: bh };
      ctx.fillStyle = `rgba(255,170,80,${0.24 * k})`;
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = `rgba(255,196,120,${0.92 * k})`;
      ctx.fillRect(bx, by, Math.round(bw * r.slide()), bh);
      ctx.textAlign = 'right';
      ctx.font = FONT(12 * F);
      ctx.fillStyle = `rgba(240,226,203,${0.6 * k})`;
      ctx.fillText(`${Math.round(r.slide() * 100)}%`, bx - 12 * F, y);
    } else if (r.value) {
      ctx.textAlign = 'right';
      ctx.font = FONT(14 * F);
      ctx.fillStyle = r.lit
        ? `rgba(255,196,120,${(0.55 + 0.45 * Math.abs(Math.sin(menu.t * 3.6))) * k})`
        : `rgba(255,214,170,${0.86 * k})`;
      ctx.fillText(r.value, x0 + wide, y);
    }
    hits.push(h);
    menu.bottom = Math.max(menu.bottom, h.y + h.h);
  }
  ctx.textAlign = 'left';
}

function round(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

/** For the checker: what the page would read as, in plain text. */
export function menuText() {
  return pageRows().map((r) => r.label
    + (r.slide ? ` ${Math.round(r.slide() * 100)}%` : r.value ? ` ${r.value}` : ''));
}
