// IS THIS ACTUALLY ITS OWN VERSION?
//
// A new version folder is a copy of an old one with nine identifiers changed
// across seven files. Miss one and nothing breaks today: the game boots, plays
// and looks right. It breaks weeks later, on someone's phone, when two
// versions turn out to share a cache prefix and each one's service worker
// deletes the other's offline copy on activate - or worse, share a save key
// and overwrite each other's progress.
//
// That is not hypothetical. `savi/` shipped with two of the nine wrong and has
// been sharing v5's cache prefix ever since, because nothing checked.
//
// This also guards the naming trick. The game is unnamed; the displayed title
// lives in one constant so naming it later costs one edit. Two files cannot
// import that constant - manifest.json is static JSON, index.html's <title> is
// static markup - so they carry copies, and copies drift. This fails if they do.
//
// Run:  node v7/tools/check-version.mjs

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');          // v7/
const REPO = join(ROOT, '..');          // the repo
const N = await import('../src/name.js');

let bad = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) bad++; };
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// --- 1. nothing is inherited from the folder this was copied from -----------
console.log('nothing left over from the folder this was copied from:');
{
  const STALE = ['ashfall.v7.save', 'ashfall-v7-', 'ashfall.v7.wilds', 'ashfall.v5.save'];
  const files = [];
  const walk = (dir, rel = '') => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      // This file names the stale keys in order to look for them.
      if (e.name === 'check-version.mjs') continue;
      const p = join(dir, e.name), r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p, r);
      else if (/\.(js|mjs|json|html)$/.test(e.name)) files.push([r, readFileSync(p, 'utf8')]);
    }
  };
  walk(ROOT);
  for (const token of STALE) {
    const hits = files.filter(([, s]) => s.includes(token)).map(([r]) => r);
    ok(hits.length === 0, hits.length
      ? `${token} still appears in ${hits.join(', ')}`
      : `no trace of ${token}`);
  }
  console.log(`         (searched ${files.length} files)`);
}

// --- 2. the identifiers this version owns -----------------------------------
console.log('');
console.log('the identifiers this version owns:');
{
  ok(N.SLUG === 'crazy', `slug is "${N.SLUG}"`);
  ok(N.SAVE_KEY === `ashfall.${N.SLUG}.save`, `save key is "${N.SAVE_KEY}"`);
  ok(N.CACHE_PREFIX === `ashfall-${N.SLUG}-`, `cache prefix is "${N.CACHE_PREFIX}"`);

  const save = read('src/save.js');
  ok(/import\s*\{[^}]*SAVE_KEY[^}]*\}\s*from\s*'\.\/name\.js'/.test(save)
    && /const KEY = SAVE_KEY;/.test(save), 'save.js takes its key from name.js');
  ok(!/SEED_KEY/.test(save),
    'save.js does not seed from an older version - the campaign save is a different shape');

  const upd = read('src/update.js');
  ok(/startsWith\(CACHE_PREFIX\)/.test(upd), 'update.js clears its own caches, by the constant');

  const wilds = read('src/wilds-save.js');
  ok(wilds.includes(`ashfall.${N.SLUG}.wilds`), 'wilds-save.js has its own key');
}

// --- 3. the two copies that cannot import, and therefore drift --------------
console.log('');
console.log('the copies that cannot import the constant:');
{
  const sw = read('sw.js');
  const m = /const PREFIX = '([^']+)'/.exec(sw);
  ok(!!m && m[1] === N.CACHE_PREFIX,
    m ? `sw.js PREFIX is '${m[1]}' and name.js says '${N.CACHE_PREFIX}'` : 'sw.js has no PREFIX');

  const man = JSON.parse(read('manifest.json'));
  ok(man.name === N.NAME, `manifest name is "${man.name}" and NAME is "${N.NAME}"`);
  ok(man.short_name === N.SHORT, `manifest short_name is "${man.short_name}" and SHORT is "${N.SHORT}"`);

  const html = read('index.html');
  const t = /<title>([^<]*)<\/title>/.exec(html);
  ok(!!t && t[1] === N.NAME, t ? `<title> is "${t[1]}"` : 'index.html has no <title>');
}

// --- 4. the title is drawn from the constant, nowhere else ------------------
console.log('');
console.log('and the name is only written down once:');
{
  // Any literal of the current name in the source means a rename would miss it.
  const offenders = [];
  const walk = (dir, rel = '') => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const p = join(dir, e.name), r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { walk(p, r); continue; }
      if (!/\.js$/.test(e.name) || r.endsWith('name.js')) continue;
      readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        if (/^\s*(\/\/|\*)/.test(line)) return;              // comments may say it
        if (line.includes(N.NAME)) offenders.push(`${r}:${i + 1}`);
      });
    }
  };
  walk(join(ROOT, 'src'), 'src');
  for (const o of offenders) ok(false, `${o} hard-codes "${N.NAME}" instead of importing NAME`);
  ok(offenders.length === 0, `no source file hard-codes the title (manifest and <title> are checked above)`);

  const game = read('src/game.js');
  ok(/import \{ NAME \} from '\.\/name\.js'/.test(game) && /\$\{NAME\}/.test(game),
    'the title screen renders ${NAME}');
}

// --- 5. no other version is using these ------------------------------------
console.log('');
console.log('and no sibling version is using the same keys:');
{
  const sibs = readdirSync(REPO, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.')
      && existsSync(join(REPO, e.name, 'sw.js')) && e.name !== 'crazy')
    .map((e) => e.name);

  for (const s of sibs) {
    const sw = readFileSync(join(REPO, s, 'sw.js'), 'utf8');
    const m = /const PREFIX = '([^']+)'/.exec(sw);
    if (m && m[1] === N.CACHE_PREFIX) ok(false, `${s}/sw.js shares our cache prefix '${m[1]}'`);
  }
  ok(true, `checked ${sibs.length} sibling version(s): ${sibs.join(', ')}`);

  // The build bumper has to know, or this version's build number never moves
  // and the title screen's up-to-date readout quietly lies.
  const bump = readFileSync(join(REPO, 'tools', 'bump-build.py'), 'utf8');
  ok(/\('crazy',/.test(bump), "tools/bump-build.py knows about crazy");
  ok(/'crazy':\s*\('check-version\.mjs'/.test(bump), 'and runs this checker before a commit');
}

console.log('');
console.log(bad
  ? `${bad} thing(s) wrong - this folder is not yet its own version`
  : 'its own cache, its own save, and the name written down exactly once');
process.exit(bad ? 1 : 0);
