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

// The story's own ragas, which are named in a table rather than in a call.
//
// STORY_RAGA lays a raga along Savitri's five beats, and the ids in it never
// pass through a literal themeById('...') - so the scan above cannot see them
// and a typo there would fail exactly the silent way the bug above failed.
{
  console.log('');
  console.log('and the ragas the story walks through:');
  const text = code(readFileSync(join(SRC, 'savi.js'), 'utf8'));
  const m = /const STORY_RAGA = \[([^\]]*)\]/.exec(text);
  if (!m) {
    console.log('  FAIL  STORY_RAGA is gone from savi.js - if it was renamed, rename it here too');
    bad++;
  } else {
    const ids = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    if (!ids.length) { console.log('  FAIL  STORY_RAGA names no ragas at all'); bad++; }
    for (const id of ids) {
      const t = themeById(id);
      if (t) console.log(`  ok    the story turns to '${id}' — ${t.name}, ${t.raga}`);
      else { console.log(`  FAIL  the story turns to '${id}', which is not a theme id`); bad++; }
    }
  }
}
console.log('');
console.log(bad ? `${bad} piece(s) of music do not exist` : 'the music is all there');
process.exit(bad ? 1 : 0);
