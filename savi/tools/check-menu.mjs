// Can she get out of the pause screen again?
//
// A menu is the one piece of a game a player uses when something has already
// gone wrong for them, so the ways it can fail are all the same shape: a page
// with no way back, a row that does nothing, a rebind that eats the key it was
// given, or a key capture that never lets go. None of those throws, and none of
// them shows up in a screenshot - you find them by being stuck.
//
// So this walks it: every page, every row, on a keyboard, a pad and a thumb.
//
// Run:  node savi/tools/check-menu.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let store = null;
globalThis.localStorage = { getItem: () => store, setItem: (k, v) => { store = v; } };

// Enough of a browser for the menu to build its rows. The Sound page asks
// whether fullscreen exists, so it is given a browser that says yes and then
// does nothing - which is also what an iPhone does.
let full = false;
globalThis.document = {
  documentElement: { requestFullscreen: async () => { full = true; } },
  get fullscreenElement() { return full ? {} : null; },
  fullscreenEnabled: true,
  addEventListener: () => {},
  exitFullscreen: async () => { full = false; },
};
globalThis.window = { matchMedia: () => ({ matches: false }), addEventListener: () => {} };
globalThis.navigator = { maxTouchPoints: 0 };
globalThis.screen = {};

const M = await import('../src/savi-menu.js');
const K = await import('../src/savi-keys.js');
const A = await import('../src/audio.js');

let bad = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) bad++; };

const SRC = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(SRC, '..', 'src', 'savi.js'), 'utf8');
const key = (k, a = null) => { M.menuKey(k, a); M.stepMenu(1 / 60); };

// --- 1. it opens, and escape gets you out ------------------------------------------
console.log('opening and shutting:');
{
  ok(!M.menuOn(), 'it starts shut');
  M.openMenu();
  ok(M.menuOn() && M.menu.page === 'root', 'escape opens it on PAUSED');
  key('escape');
  ok(!M.menuOn(), 'and escape again resumes');

  // Opening it twice must not reset a page out from under a thumb mid-tap.
  M.openMenu();
  M.menu.page = 'sound';
  M.openMenu();
  ok(M.menu.page === 'sound', 'a second open while it is up changes nothing');
  M.closeMenu();
}

// --- 2. every page, and a way back from each --------------------------------------
console.log('\nthe four pages:');
for (const [row, page, title] of [[1, 'keys', 'CONTROLS'], [2, 'sound', 'SOUND'], [3, 'help', 'HOW TO PLAY']]) {
  M.openMenu();
  for (let i = 0; i < row; i++) key('arrowdown');
  key('enter');
  ok(M.menu.page === page, `Resume, row ${row} opens ${title}`);
  const rows = M.menuText();
  ok(rows.length > 0, `${title} has ${rows.length} row(s): ${rows.slice(0, 3).join(' / ')}${rows.length > 3 ? ' …' : ''}`);
  ok(rows[rows.length - 1].startsWith('Back'), `${title} ends with Back`);

  // The last row, picked, must come home.
  for (let i = 0; i < 20 && M.menu.sel !== rows.length - 1; i++) key('arrowdown');
  key('enter');
  ok(M.menu.page === 'root', `and its Back returns to PAUSED`);

  // ESCAPE IS THE SAME DOOR. On a page it goes up one; at the top it resumes.
  M.menu.page = page; M.menu.sel = 0;
  key('escape');
  ok(M.menu.page === 'root', `escape out of ${title} goes up one, not out`);
  key('escape');
  ok(!M.menuOn(), 'and from PAUSED it resumes');
}

// --- 3. every row does something ---------------------------------------------------
//
// A row with neither an action nor a bar is a dead line a player will press
// twice and then decide the game is broken.
console.log('\nevery row answers:');
{
  for (const page of ['root', 'keys', 'sound', 'help']) {
    M.openMenu();
    M.menu.page = page;
    M.stepMenu(1 / 60);
    const n = M.menuText().length;
    let dead = 0;
    for (let i = 0; i < n; i++) {
      M.menu.page = page; M.menu.sel = i; M.menu.wait = null;
      M.stepMenu(1 / 60);
      // The line it prints underneath counts as an answer: "Reset to defaults"
      // pressed while everything IS default changes no value on the page, and
      // saying so is the whole of what it should do.
      const snap = () => JSON.stringify([M.menu.page, M.menu.wait, M.menuText(), M.menuOn(), M.menu.note]);
      M.menu.note = '';
      const before = snap();
      key('enter');
      const after = snap();
      if (before === after) { ok(false, `${page} row ${i} does nothing at all`); dead++; }
      if (!M.menuOn()) M.openMenu();
    }
    ok(dead === 0, `${page}: all ${n} rows do something`);
    M.closeMenu();
  }
}

// --- 4. the two bars -------------------------------------------------------------
console.log('\nthe volume bars:');
{
  M.openMenu();
  M.menu.page = 'sound'; M.menu.sel = 1; M.stepMenu(1 / 60);   // music volume
  for (let i = 0; i < 20; i++) key('arrowleft');
  ok(A.audio.musicVolume === 0, 'left all the way is 0%, and does not go under');
  for (let i = 0; i < 20; i++) key('arrowright');
  ok(A.audio.musicVolume === 1, 'right all the way is 100%, and does not go over');
  key('arrowleft'); key('arrowleft');
  ok(Math.abs(A.audio.musicVolume - 0.8) < 1e-9, `and it steps in tenths (${A.audio.musicVolume})`);

  // It is remembered. A player who turns the music down does not want it back
  // up the next time they open the tab.
  ok(!!store && JSON.parse(store).musicVol === A.audio.musicVolume, 'the setting is written down');
  A.setMusicEnabled(true);
  M.menu.sel = 0; key('enter');
  ok(A.audio.music === false, 'Music switches off');
  ok(JSON.parse(store).music === false, 'and that is remembered too');
  M.loadSound();
  ok(A.audio.music === false, 'and it comes back off next session');
  M.menu.sel = 0; key('enter');
  M.closeMenu();

  // Rubbish in storage must not take the sound with it.
  for (const raw of ['wat', 'null', '[]', '{"vol":"loud"}', '{"musicVol":null}', '{"music":1}']) {
    store = raw;
    let threw = null;
    try { M.loadSound(); } catch (e) { threw = e.message; }
    ok(!threw, `a saved "${raw}" is survivable${threw ? ': ' + threw : ''}`);
  }
}

// --- 5. rebinding, through the menu, the way a player does it ---------------------
console.log('\nchanging a key from the menu:');
{
  store = null;
  K.loadKeys();
  M.openMenu();
  M.menu.page = 'keys';
  const names = M.menuText();
  const jumpRow = names.findIndex((r) => r.startsWith('Jump'));
  ok(jumpRow >= 0, `Jump is row ${jumpRow} of the controls page`);
  M.menu.sel = jumpRow; M.stepMenu(1 / 60);

  key('enter');
  ok(M.menu.wait === 'jump', 'picking it waits for a key');
  ok(M.menuText()[jumpRow].includes('press a key'), 'and the row says so');

  // THE KEY BEING BOUND MUST NOT ALSO BE OBEYED. Binding jump to K while
  // waiting must not ALSO walk the list or confirm the row.
  key('k');
  ok(M.menu.wait === null, 'the next key is taken and the wait ends');
  ok(K.BINDS.jump[0] === 'k', 'jump is K now');
  ok(M.menu.sel === jumpRow, 'and the selection did not move while it was captured');
  ok(M.menuText()[jumpRow].includes('K'), 'the row shows it');

  // Taken off whatever had it, and said out loud.
  const dashRow = M.menuText().findIndex((r) => r.startsWith('Dash'));
  M.menu.sel = dashRow; key('enter'); key('k');
  ok(K.actionFor('k') === 'dash', 'giving K to Dash takes it from Jump');
  ok(/jump/i.test(M.menu.note), `and it says so: "${M.menu.note}"`);
  ok(K.BINDS.jump.length > 0, 'Jump is not left with nothing');

  // Escape while waiting leaves it alone.
  M.menu.sel = dashRow; key('enter');
  ok(M.menu.wait === 'dash', 'waiting again');
  key('escape');
  ok(M.menu.wait === null && M.menuOn(), 'escape cancels the capture and stays in the menu');
  ok(K.actionFor('k') === 'dash', 'and the key it had is untouched');

  // Escape itself is refused, out loud.
  M.menu.sel = dashRow; key('enter');
  M.menuKey('escape', null);                 // this one CANCELS, it does not bind
  ok(K.actionFor('escape') === null, 'escape can never be bound, even from in here');

  // Reset.
  const resetRow = M.menuText().findIndex((r) => r.startsWith('Reset'));
  ok(resetRow >= 0, 'there is a Reset to defaults');
  M.menu.sel = resetRow; key('enter');
  ok(K.BINDS.jump.join() === K.KEY_DEFAULTS.jump.join()
    && K.BINDS.dash.join() === K.KEY_DEFAULTS.dash.join(), 'and it puts every key back');
  M.closeMenu();
}

// --- 6. a pad, and a thumb --------------------------------------------------------
console.log('\na controller and a thumb:');
{
  const PAD = {
    upPressed: false, downPressed: false, leftPressed: false, rightPressed: false,
    pressed: false, jumpPressed: false, dashPressed: false,
  };
  const tap = (f) => { PAD[f] = true; M.menuPad(PAD); PAD[f] = false; M.stepMenu(1 / 60); };

  M.openMenu();
  tap('downPressed'); tap('pressed');
  ok(M.menu.page === 'keys', 'the stick and cross reach Controls');
  tap('dashPressed');
  ok(M.menu.page === 'root', 'circle backs out of it');
  tap('dashPressed');
  ok(!M.menuOn(), 'and circle at the top resumes');

  // Every field pollPad clears must be one menuPad reads, or a flag left set
  // by a pad that was unplugged walks the list for ever.
  const read = [...src.matchAll(/pad\.(\w+Pressed)/g)].map((m) => m[1]);
  const menuSrc = readFileSync(join(SRC, '..', 'src', 'savi-menu.js'), 'utf8');
  const used = [...menuSrc.matchAll(/pad\.(\w+Pressed)/g)].map((m) => m[1]);
  let missing = 0;
  for (const f of used) {
    if (!read.includes(f)) { ok(false, `the menu reads pad.${f} and savi.js never sets it`); missing++; }
  }
  ok(missing === 0, `the menu reads ${new Set(used).size} pad flags, all of which savi.js sets`);

  // A TAP IN THE DARK GOES BACK, which on a phone is the only escape there is.
  M.openMenu();
  M.menu.page = 'keys'; M.stepMenu(1 / 60);
  M.drawMenu(fakeCtx());
  M.menuPointer(-500, -500);
  ok(M.menu.page === 'root', 'a tap off the list goes up a page');
  M.menuPointer(-500, -500);
  ok(!M.menuOn(), 'and again it resumes');
}

// --- 7. does the page actually fit on the screen? ---------------------------------
//
// Text on a phone is drawn half again the size it is on a desktop, and the
// CONTROLS page at that scale ran to 809 on a 720-tall view - nine rows of
// keys you cannot press anyway, off the bottom of the screen and through the
// footer. Nothing throws. You find it by holding a phone.
console.log('');
console.log('what fits:');
{
  const { view } = await import('../src/state.js');
  view.w = 1550; view.h = 720;
  const FOOT = 660;                    // the note and the footer live under this
  for (const touch of [false, true]) {
    M.initMenu({ isTouch: () => touch, padOn: () => false });
    for (const page of ['root', 'keys', 'sound', 'help']) {
      M.openMenu();
      M.menu.page = page;
      M.stepMenu(1 / 60); M.stepMenu(1);
      M.drawMenu(fakeCtx());
      ok(M.menu.bottom > 0 && M.menu.bottom < FOOT,
        `${touch ? 'a phone' : 'a desktop'}: ${page} ends at ${Math.round(M.menu.bottom)}, clear of the footer at ${FOOT}`);
      M.closeMenu();
    }
  }
  // And the one that had to change shape to fit.
  M.initMenu({ isTouch: () => true, padOn: () => false });
  M.openMenu(); M.menu.page = 'keys'; M.stepMenu(1 / 60);
  ok(M.menuText().length === 1, 'a phone gets the layout written out, not nine rows it cannot press');
  M.closeMenu();
  M.initMenu({ isTouch: () => false, padOn: () => false });
  M.openMenu(); M.menu.page = 'keys'; M.stepMenu(1 / 60);
  ok(M.menuText().length === 11, 'and a keyboard gets all nine, plus reset and back');
  M.closeMenu();
}

// --- 8. the wiring in savi.js -----------------------------------------------------
console.log('\nhow savi.js holds it:');
{
  ok(/if \(menuOn\(\)\) \{\n\s*menuPad\(pad\);[\s\S]{0,180}?return;/.test(src),
    'the world does not step while it is open');
  ok(/if \(menuOn\(\)\) \{ menuKey\(k, a\); e\.preventDefault\(\); return; \}/.test(src),
    'and no keystroke reaches the game underneath it');
  // The capture has to come before the belt and the dialogue, or the key being
  // bound does its old job on the way in.
  const iMenu = src.indexOf('if (menuOn()) { menuKey(k, a);');
  const iBelt = src.indexOf("if (a === 'belt')");
  ok(iMenu > 0 && iMenu < iBelt, 'the menu hears a key before the belt does');
  ok(/if \(menuOn\(\)\) \{ menuPointer\(px, py\); return; \}/.test(src), 'and before any button does');
  ok(/holding = false; wasHolding = true; tapDone = true;[\s\S]{0,40}return;/.test(src),
    'a finger that was down when it opened is not down when it shuts');
  ok(/BTN\.menu\.off = !t;/.test(src), 'the pause button is there on a phone');
  ok(/loadSound\(\);/.test(src), 'and the sound settings are read once there is audio to set');
}

/** Enough of a 2D context to lay the rows out. Nothing is looked at. */
function fakeCtx() {
  const noop = () => {};
  return {
    set fillStyle(v) {}, set strokeStyle(v) {}, set lineWidth(v) {},
    set font(v) {}, set textAlign(v) {}, set globalAlpha(v) {},
    fillRect: noop, fillText: noop, beginPath: noop, arc: noop, fill: noop,
    stroke: noop, moveTo: noop, lineTo: noop, quadraticCurveTo: noop,
  };
}

console.log('');
console.log(bad ? `${bad} thing(s) wrong with the pause screen` : 'four pages, and a way out of every one');
process.exit(bad ? 1 : 0);
