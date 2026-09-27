// Does every piece of music the game asks for actually exist?
//
// This is here because of a real one. The valley's theme is Raag Bhupali,
// whose id is 'bhupali' and whose NAME is 'Hearthfields'. The hand-off at the
// end of the opening film asked for `themeById('hearthfields')` - the name,
// not the id - which returns null, and a null ambient theme makes the audio
// scheduler fall through to the inherited engine's generic track. So the raga
// played over the title screen, stopped the instant the film ended, and the
// whole game ran on the wrong music. Nothing threw, nothing logged, and the
// only way to notice was to listen.
//
// A name that does not resolve is now a build failure.
//
// Run:  node savi/tools/check-music.mjs

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { themeById } from '../src/music-regions.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const CALL = /themeById\(\s*'([^']+)'\s*\)/g;

/**
 * Comments out, first. This scans source text rather than running the game,
 * so a call written INSIDE a comment - such as the one explaining this very
 * bug, two paragraphs up - would be reported as a broken theme. Strips block
 * comments, then line comments, leaving `://` alone so a URL survives.
 */
const code = (t) => t
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n')
  .map((line) => { const i = line.search(/(^|[^:])\/\//); return i < 0 ? line : line.slice(0, i); })
  .join('\n');

let bad = 0, found = 0;
console.log('every theme the game asks for:');
for (const f of readdirSync(SRC).filter((n) => n.endsWith('.js'))) {
  const text = code(readFileSync(join(SRC, f), 'utf8'));
  for (const m of text.matchAll(CALL)) {
    const id = m[1];
    const t = themeById(id);
    found++;
    if (t) console.log(`  ok    ${f} asks for '${id}' — ${t.name}, ${t.raga}`);
    else { console.log(`  FAIL  ${f} asks for '${id}', which is not a theme id`); bad++; }
  }
}

if (!found) { console.log('  FAIL  nothing asks for a theme at all, which cannot be right'); bad++; }
console.log('');
console.log(bad ? `${bad} piece(s) of music do not exist` : 'the music is all there');
process.exit(bad ? 1 : 0);
