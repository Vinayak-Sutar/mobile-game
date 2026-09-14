// Inlines the esbuild bundle into index.html to produce a single standalone
// file. The result runs from file:// with no server, because there are no
// module imports or external requests left to block.
//
//   npx esbuild v4/src/game.js --bundle --format=iife --outfile=dist/bundle.js
//
// It builds Version 4, the default game.
//   node build.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const html = readFileSync('v4/index.html', 'utf8');
const bundle = readFileSync('dist/bundle.js', 'utf8');

const SCRIPT_TAG = '<script type="module" src="./src/game.js"></script>';
if (!html.includes(SCRIPT_TAG)) {
  console.error('build: could not find the module script tag in index.html');
  process.exit(1);
}

// A literal </script> inside the bundle would close the tag early.
const safe = bundle.replace(/<\/script/gi, '<\\/script');

const out = html.replace(
  SCRIPT_TAG,
  `<script>\n/* Ashfall — bundled ${new Date().toISOString().slice(0, 10)} */\n${safe}\n</script>`,
);

mkdirSync('dist', { recursive: true });
mkdirSync('dist/upload', { recursive: true });

// Two names for the same file: one to send someone directly, one named the
// way static hosts (itch.io, Netlify, GitHub Pages) expect.
writeFileSync('dist/ashfall.html', out);
writeFileSync('dist/upload/index.html', out);

writeFileSync('dist/HOW-TO-RUN.txt', `ASHFALL — how to play

Double-click "ashfall.html". It opens in your browser and runs. That's it.
No install, no internet needed after you have the file.

CONTROLS (keyboard)
  WASD / arrows  move
  mouse          aim
  click or J     attack
  Space          dash  (you get 2 charges — dashing makes you invulnerable)
  K or Shift     weapon special
  M              mute
  Esc            pause

HOW IT WORKS
  Clear a room, walk into one of the two doors, take the reward, go deeper.
  Eight chambers, then a boss. Boons stack, so builds get silly by chamber 6.
  Gold is banked as "darkness" whether you win or die — spend it in the
  Mirror of Night on permanent upgrades before your next run.

  It also works on a phone (touch controls appear automatically) if you put
  the file somewhere the phone can open it. Landscape.

If your browser refuses to open a downloaded .html file, right-click it ->
"Open with" -> Chrome / Edge / Firefox.
`);

const kb = (Buffer.byteLength(out) / 1024).toFixed(0);
console.log(`build: dist/ashfall.html       (${kb} kb, standalone — open directly in a browser)`);
console.log(`build: dist/upload/index.html  (same file, named for static hosts)`);
console.log(`build: dist/HOW-TO-RUN.txt`);
