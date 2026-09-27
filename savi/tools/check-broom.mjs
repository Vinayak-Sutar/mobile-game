// Does the broom throw what is actually under it?
//
// It did not. Three things were wrong at once and every one of them was
// invisible in a still: the spark colour was the LEAF palette for anything
// that was not snow, so sweeping the grit in the stone fall threw autumn off
// it; `took > 0` was the only test, and leaves never carve below LITTER and
// heal back up to it, so ground she had already swept clean kept flinging
// gold at nothing; and where there genuinely was nothing the broom went past
// in complete silence, which reads as a dead button.
//
// None of it throws. You find it by sweeping a bare road and watching gold
// come off it, which is what the owner did.
//
// This also covers the way out of her thought bubble, because that is the
// other thing on the screen that had no way to be put down.
//
// Run:  node savi/tools/check-broom.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

let bad = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) bad++; };

const SRC = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(SRC, '..', 'src', 'savi.js'), 'utf8');
// Comments out first. The note above the fix quotes the broken line.
const src = raw
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n')
  .map((l) => { const i = l.search(/(^|[^:])\/\//); return i < 0 ? l : l.slice(0, i); })
  .join('\n');

// --- 1. the colour is the thing being swept ---------------------------------------
console.log('what comes off the broom:');
{
  ok(!/col: MATS\[1\]\.col, angle: out/.test(src),
    'the spark is not hard-wired to the leaf palette');
  ok(/col: MATS\[stroke\.mat\]\.col/.test(src),
    'it is the palette of whatever she is actually sweeping');
}

// --- 2. and only where there is something to see ----------------------------------
//
// THE BAR HAS TO BE THE ONE THE GROUND IS DRAWN WITH. drawLayer skips a cell
// below CLEAR * 0.66, so that number is exactly "you can see something there".
// Two separate hand-tuned numbers would drift apart the first time either was
// touched, and the drift is silent.
console.log('');
console.log('and only where there is something to see:');
{
  const gate = /const real = at\.m === stroke\.mat && at\.d > (CLEAR \* 0\.66)[^;]*;/.exec(src);
  ok(!!gate, 'the stroke asks how deep the stuff in front of her is');
  ok(!!gate && gate[1] === 'CLEAR * 0.66', `and the bar is ${gate && gate[1]}`);

  const drawn = /if \(!m \|\| G\.dep\[q\] < (CLEAR \* 0\.66)\) continue;/.exec(src);
  ok(!!drawn, 'drawLayer has a bar of its own');
  ok(!!gate && !!drawn && gate[1] === drawn[1],
    `and they are the same number (${gate && gate[1]} both), so they cannot drift apart`);

  ok(/at\.d > CLEAR \* 0\.66 && took > 0\.0004/.test(src),
    'a stroke that carved nothing throws nothing either');
}

// --- 3. bare ground is not nothing ------------------------------------------------
console.log('');
console.log('a broom on bare ground:');
{
  ok(/const DUST = \[/.test(raw), 'there is a dust palette');
  ok(/col: DUST,/.test(src), 'and bare ground raises it');
  ok(/\} else if \(!stroke\.dusted\) \{/.test(src),
    'once per stroke, not once per frame - twenty-two frames of it is a dust storm');
  ok(/stroke\.dusted = true;/.test(src), 'and the stroke remembers it did');
  // The dust must be OUTSIDE the "did we carve anything" test, or the one
  // place it is needed most - ground with nothing on it at all - is silent.
  const iTook = src.indexOf('const took = carve(');
  const iDust = src.indexOf('col: DUST,');
  const iGate = src.indexOf('if (took > 0.0004)');
  ok(iDust > iTook, 'the dust is decided after the carve');
  ok(iGate === -1, 'and nothing hangs off "did the carve take anything" any more');
}

// --- 4. and a way to put her thought down ------------------------------------------
//
// A thought of hers sat over her head for seven and a half seconds with no way
// to dismiss it. You read it in two and then waited.
console.log('');
console.log('putting her thought down:');
{
  ok(/function dropThought\(\)/.test(src), 'there is one way to do it, and three things call it');
  ok(/thinkX && Math\.hypot\(px - thinkX\.x, py - thinkX\.y\) < thinkX\.r/.test(src),
    'a mouse or a thumb has a cross on the corner');
  ok(/if \(pad\.thinkPressed && st\.think\) dropThought\(\);/.test(src),
    'and a pad has a button of its own');
  ok(/pad\.thinkPressed = down\(3\)/.test(src),
    'which is 3: triangle on a DualSense, Y on an Xbox pad');
  ok(/pad\.thinkHeld = pad\.thinkPressed = false;/.test(src),
    'and a pad that is unplugged mid-press does not leave it stuck');

  // THE CROSS IS ASKED BEFORE THE BUTTONS. It floats over the world, so a
  // press that lands on it must not also reach the ring underneath.
  const iCross = src.indexOf('thinkX && Math.hypot(px');
  const iHit = src.indexOf('const hit = hitButton(px, py);');
  ok(iCross > 0 && iCross < iHit, 'the cross is asked before the HUD buttons are');

  // And it is not drawn where there is nothing to click it with.
  ok(/if \(pad\.on\) \{\s*\n\s*thinkX = null;/.test(src),
    'with a pad in hand there is no cross, because nothing can click one');
  ok(/padName\('dismiss'\)/.test(src), 'it names the pad button instead');
}

console.log('');
console.log(bad ? `${bad} thing(s) wrong` : 'the broom throws what is under it, and she can put a thought down');
process.exit(bad ? 1 : 0);
