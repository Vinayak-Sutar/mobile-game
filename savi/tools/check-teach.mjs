// Does the first stretch of road actually teach the three things?
//
// The ways a tutorial fails are all quiet ones. It never appears. It appears
// and never goes away. It goes away before the player did the thing. It tells
// an Xbox player to press circle. It is still nagging in the fifth hour. None
// of those throws, and a screenshot of the first frame looks fine in every
// one of them.
//
// Run:  node savi/tools/check-teach.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let store = null;
globalThis.localStorage = { getItem: () => store, setItem: (k, v) => { store = v; } };

const T = await import('../src/savi-teach.js');
const K = await import('../src/savi-keys.js');

let bad = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) bad++; };
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'savi.js'), 'utf8');

const KB = { touch: false, pad: false };
const PAD = { touch: false, pad: true };
const TOUCH = { touch: true, pad: false };

/** Walk her for `sec` seconds at her real speed, and see what it says. */
const walk = (sec, speed = 196) => {
  for (let i = 0; i < sec * 60; i++) T.stepTeach(1 / 60, speed / 60, false);
};
const idle = (sec) => { for (let i = 0; i < sec * 60; i++) T.stepTeach(1 / 60, 0, false); };

// --- 1. it comes up, and it says the right thing ----------------------------------
console.log('the first thing she is told:');
{
  T.resetTeach();
  ok(T.teachText(KB) === null, 'nothing on the very first frame, while the film is still fading');
  idle(0.6);
  const first = T.teachText(KB);
  ok(!!first && /walk/.test(first.text), `then: "${first && first.text}"`);
  ok(/W.*A.*S.*D/.test(first.text), 'and on a keyboard it spells out W A S D');

  T.resetTeach(); idle(0.6);
  ok(/left stick/.test(T.teachText(PAD).text), `on a pad: "${T.teachText(PAD).text}"`);
  T.resetTeach(); idle(0.6);
  ok(/drag/.test(T.teachText(TOUCH).text), `on a phone: "${T.teachText(TOUCH).text}"`);
}

// --- 2. the words follow the pad in the player's hands ----------------------------
//
// This is the whole of the owner's ask about layouts: the buttons are the same
// numbers, the NAMES are not.
console.log('');
console.log('the pad in their hands:');
{
  for (const [id, jump, dash, style] of [
    ['Xbox 360 Controller (XInput STANDARD GAMEPAD)', 'A', 'B', 'Xbox'],
    ['Xbox Wireless Controller Extended Gamepad', 'A', 'B', 'Xbox'],
    ['DualSense Wireless Controller (Vendor: 054c Product: 0ce6)', 'cross', 'circle', 'PlayStation'],
    ['Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', 'cross', 'circle', 'PlayStation'],
    ['Some Unbranded Pad', 'A', 'B', 'Xbox (the safe default)'],
  ]) {
    K.setPadStyle(id);
    T.resetTeach(); idle(0.6);
    const j = T.teachLine(1, PAD), d = T.teachLine(2, PAD);
    ok(j === `${jump} to jump` && d === `${dash} to dash`,
      `${style}: "${j}" and "${d}"`);
  }
  K.setPadStyle('Xbox 360 Controller');
  ok(K.padName('menu') === 'menu', 'and pause is "menu" on an Xbox pad');
  K.setPadStyle('DualSense');
  ok(K.padName('menu') === 'options', 'and "options" on a DualSense');
}

// --- 3. it waits for them to DO it ------------------------------------------------
console.log('');
console.log('it waits:');
{
  T.resetTeach();
  idle(0.6);
  walk(1.0);                       // about 196 units: not enough
  ok(/walk/.test(T.teachText(KB).text), 'a second of walking is not yet "you have got it"');
  walk(1.0);                       // now past 340
  ok(T.teachText(KB).got, `two seconds is: "${T.teachText(KB).text}"`);

  // And it does not move on until that beat is over.
  idle(0.4);
  ok(T.teachText(KB).got, 'the "good" stays up for a moment');
  idle(1.4);
  const second = T.teachText(KB);
  ok(second && /jump/.test(second.text), `then the next one: "${second.text}"`);

  // Standing still forever does not get you past step two.
  idle(60);
  ok(/jump/.test(T.teachText(KB).text), 'a minute of standing there still says jump');
  T.noteJump();
  T.stepTeach(1 / 60, 0, false);
  ok(T.teachText(KB).got, 'one jump does it');
  idle(1.6);
  ok(/dash/.test(T.teachText(KB).text), `and then: "${T.teachText(KB).text}"`);
  T.noteDash();
  T.stepTeach(1 / 60, 0, false);
  ok(T.teachText(KB).got, 'one dash does it');
  idle(1.6);
  ok(T.teachText(KB) === null && T.teach.over, 'and then it is gone for good');

  // Gone means gone: nothing brings it back.
  walk(10); T.noteJump(); T.noteDash();
  ok(T.teachText(KB) === null, 'nothing brings it back');
}

// --- 4. and it ends when the valley takes over ------------------------------------
//
// A player who runs straight past the road and gets sent to the first root
// without ever dashing must not be nagged about it for the rest of the game.
console.log('');
console.log('it stops when the valley takes over:');
{
  T.resetTeach();
  idle(0.6);
  ok(!!T.teachText(KB), 'up on the road');
  T.stepTeach(1 / 60, 0, true);           // the keeper has briefed her
  ok(T.teach.over && T.teachText(KB) === null, 'and gone the moment she is sent to the first root');
  walk(10);
  ok(T.teachText(KB) === null, 'and it stays gone');

  // A rebind is taught as the key they chose, not as the one it shipped with.
  T.resetTeach(); idle(0.6);
  K.rebindKey('jump', 'j');
  ok(T.teachLine(1, KB) === 'J to jump', `a rebound jump is taught as "${T.teachLine(1, KB)}"`);
  K.defaultKeys();
  ok(T.teachLine(1, KB) === 'space to jump', 'and reset puts it back');
}

// --- 5. the wiring -----------------------------------------------------------------
console.log('');
console.log('how savi.js holds it:');
{
  ok(/stepTeach\(dt, Math\.hypot\(S\.x - taughtX, S\.y - taughtY\), st\.briefed \|\| st\.done > 0\);/.test(src),
    'it is fed her real movement, and stopped by the briefing');
  ok(/function startJump\(\) \{\n\s*noteJump\(\);/.test(src), 'a jump is counted where jumps happen');
  ok(/function startDash\(\) \{\n\s*noteDash\(\);/.test(src), 'and a dash where dashes do');
  // It must not be drawn over a conversation or under the pause screen.
  ok(/teachText\(\{ touch: isTouch\(\), pad: pad\.on \}\) : null;/.test(src)
    && /!cinemaOn\(\) && !st\.talking && !st\.reading && !st\.wheel/.test(src),
  'and never drawn over a film, a talk, a reading or her belt');
  // NOBODY SAYS "CROSS" TO AN XBOX PLAYER ANY MORE. Comments come out first:
  // they are full of prose about which button is called what, and one
  // apostrophe in the middle of a sentence reads as the start of a string.
  const strings = (text) => {
    const clean = text
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .split('\n')
      .map((l) => { const i = l.search(/(^|[^:])\/\//); return i < 0 ? l : l.slice(0, i); })
      .join('\n');
    return [...clean.matchAll(/(['`])((?:[^'`\n\\])*)\1/g)].map((m) => m[2]);
  };
  const named = (text) => strings(text)
    .filter((q) => /(^|[^a-z])(cross|circle|square|L1)([^a-z]|$)/i.test(q));
  const said = named(src);
  ok(said.length === 0, said.length
    ? `savi.js still says a PlayStation button out loud: ${said.join(' | ')}`
    : 'no PlayStation button name is written out by hand in savi.js');
  const menu = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'savi-menu.js'), 'utf8');
  const said2 = named(menu);
  ok(said2.length === 0, said2.length
    ? `the pause screen still says: ${said2.join(' | ')}` : 'and nor does the pause screen');
}

console.log('');
console.log(bad ? `${bad} thing(s) wrong with the teaching` : 'walk, jump, dash, and then it leaves her alone');
process.exit(bad ? 1 : 0);
