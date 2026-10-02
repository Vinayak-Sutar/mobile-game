// DOES THE COLOUR STAY INSIDE WHAT THE FOOTAGE MEASURED?
//
// The ED's whole look is one property: the world sits at 14% median saturation
// and 77% median value, and saturation is spent only on the characters and on
// three or four props a screen. On a palette like that a single off-key colour
// is enormously visible - a sludgy mid-grey or one surface at 90% saturation
// wrecks a frame in a way it never would in Ashfall.
//
// So this does not check a list of approved hexes, which would just be a list
// someone forgot to update. It checks the two rules that actually produced the
// look, against every colour literal in src/.
//
// Run:  node anime/tools/check-palette.mjs

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const { A, LEAF, VEND, toHsv } = await import('../src/palette.js');

let bad = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) bad++; };

/** The eleven the owner measured, plus the two loud props the ED actually has. */
const HUES = [...Object.values(A), LEAF, VEND].map((h) => toHsv(h)[0]);
const hueGap = (h) => Math.min(...HUES.map((g) => {
  const d = Math.abs(h - g) % 360;
  return Math.min(d, 360 - d);
}));

// --- collect every colour literal -------------------------------------------
const found = [];
for (const f of readdirSync(SRC).filter((n) => n.endsWith('.js'))) {
  const text = readFileSync(join(SRC, f), 'utf8');
  text.split('\n').forEach((line, i) => {
    if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) return;   // not comments
    for (const m of line.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
      found.push({ file: f, line: i + 1, hex: m[0].toLowerCase() });
    }
    for (const m of line.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
      const hex = '#' + [1, 2, 3].map((k) => (+m[k]).toString(16).padStart(2, '0')).join('');
      found.push({ file: f, line: i + 1, hex, soft: true });
    }
  });
}
console.log(`${found.length} colour literals across ${new Set(found.map((c) => c.file)).size} files\n`);

// --- 1. nothing near black ---------------------------------------------------
console.log('nothing goes near black, which is most of why it reads as anime:');
{
  // The darkest thing in the whole ED is the characters' line at value 32%.
  // Her socks and the car tyres sit a little under that; true black does not
  // appear anywhere, so 18% is the floor.
  const dark = found.filter((c) => toHsv(c.hex)[2] < 0.18);
  for (const c of dark) ok(false, `${c.file}:${c.line} ${c.hex} is at ${(toHsv(c.hex)[2] * 100) | 0}% value`);
  ok(dark.length === 0, `the darkest literal is ${
    (Math.min(...found.map((c) => toHsv(c.hex)[2])) * 100).toFixed(0)}% value (the ED's floor is 32%, ours 18%)`);
}

// --- 2. loud colours must be on the measured hues ---------------------------
console.log('');
console.log('saturation is rationed, and spent only on the measured hues:');
{
  const LOUD = 0.38;
  const loud = found.filter((c) => toHsv(c.hex)[1] >= LOUD && !c.soft);
  const offKey = loud.filter((c) => hueGap(toHsv(c.hex)[0]) > 20);
  for (const c of offKey) {
    const [h, s] = toHsv(c.hex);
    ok(false, `${c.file}:${c.line} ${c.hex} is ${(s * 100) | 0}% saturated at hue ${h | 0}, `
      + `${hueGap(h) | 0} deg off any colour in the palette`);
  }
  ok(offKey.length === 0, `${loud.length} literals are above ${LOUD * 100}% saturation, `
    + 'and every one sits on a palette hue');

  // And there must not be too many of them: the budget is the point.
  const scene = found.filter((c) => c.file === 'style-test.js' || c.file === 'street.js');
  const sceneLoud = scene.filter((c) => toHsv(c.hex)[1] >= LOUD);
  ok(sceneLoud.length <= 14, `the scene spends ${sceneLoud.length} loud colours (budget 14)`);
}

// --- 3. the world really is a warm near-neutral ------------------------------
console.log('');
console.log('and the world itself stays where the footage put it:');
{
  // The scenery files only. Characters are allowed to be loud - that is the
  // whole separation.
  const world = found.filter((c) => ['palette.js', 'kit.js', 'style-test.js'].includes(c.file));
  const sats = world.map((c) => toHsv(c.hex)[1]).sort((a, b) => a - b);
  const vals = world.map((c) => toHsv(c.hex)[2]).sort((a, b) => a - b);
  const med = (a) => a[a.length >> 1];
  console.log(`         median saturation ${(med(sats) * 100).toFixed(0)}%  (the ED measured 14%)`);
  console.log(`         median value      ${(med(vals) * 100).toFixed(0)}%  (the ED measured 77%)`);
  ok(med(sats) <= 0.34, 'the median scenery colour is not a loud one');
  ok(med(vals) >= 0.55, 'and the scenery is light, not murky');

  // A sludgy mid-grey is the one thing that would look most wrong here.
  const sludge = world.filter((c) => {
    const [, s, v] = toHsv(c.hex);
    return s < 0.08 && v > 0.22 && v < 0.55;
  });
  for (const c of sludge) ok(false, `${c.file}:${c.line} ${c.hex} is a flat mid-grey - tint it`);
  ok(sludge.length === 0, 'no flat mid-greys: every neutral is tinted');
}

console.log('');
console.log(bad ? `${bad} colour(s) off the measured palette` : 'the colour stays inside what the footage measured');
process.exit(bad ? 1 : 0);
