// Is this phone running what is on GitHub?
//
// GitHub Pages serves every file with `cache-control: max-age=600`, so a
// browser may keep using a copy up to ten minutes old - and since the game is
// sixty-odd separate script files, each one can be a different age. After a
// push that looks like "my change isn't there", or worse, half of it.
//
// Two answers to that:
//   - `latestBuild()` asks the server for build.js, bypassing every cache, and
//     compares its number with the one this page is running. The title screen
//     shows the result: up to date, or a newer build waiting.
//   - `hardRefresh()` is the "fetch the latest" button: it drops this
//     version's service worker and offline cache, re-downloads every script
//     the game is made of straight from the server, and reloads.
//
// The build number is bumped automatically on every commit that touches v5/
// (tools/bump-build.py, run by the git pre-commit hook).

import { BUILD, BUILT } from './build.js';

export { BUILD, BUILT };

/** The build number on the server right now, or null if it could not be reached. */
export async function latestBuild() {
  try {
    const url = new URL('./build.js', import.meta.url);
    url.searchParams.set('t', Date.now());           // past any CDN copy too
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const m = /BUILD\s*=\s*(\d+)/.exec(await res.text());
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

/** Every script the game is made of, found by following its imports. */
async function refetchModules(entry, onFile) {
  const seen = new Set();
  const IMPORT = /(?:import|export)\s[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|import\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;
  let wave = [entry];
  while (wave.length) {
    const next = [];
    await Promise.all(wave.map(async (href) => {
      if (seen.has(href)) return;
      seen.add(href);
      // cache: 'reload' goes to the server AND replaces the browser's copy,
      // so the reload that follows picks up the new file.
      const res = await fetch(href, { cache: 'reload' }).catch(() => null);
      if (!res || !res.ok) return;
      onFile(seen.size);
      const text = await res.text();
      for (const m of text.matchAll(IMPORT)) {
        const dep = new URL(m[1] || m[2], href).href;
        if (!seen.has(dep)) next.push(dep);
      }
    }));
    wave = next;
  }
  return seen.size;
}

/**
 * Throw away everything cached for this version and load it fresh from the
 * server. `onStep(text)` reports progress for the button.
 */
export async function hardRefresh(onStep = () => {}) {
  const here = new URL('../', import.meta.url);        // this version's folder
  onStep('Clearing the offline copy…');
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.filter((r) => r.scope === here.href).map((r) => r.unregister()));
    }
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('ashfall-v5-')).map((k) => caches.delete(k)));
    }
  } catch { /* carry on: the downloads below still refresh the browser's copy */ }

  onStep('Downloading the latest files…');
  for (const f of ['./', './index.html', './manifest.json', './sw.js']) {
    await fetch(new URL(f, here), { cache: 'reload' }).catch(() => {});
  }
  await refetchModules(new URL('./src/game.js', here).href, (n) => onStep(`Downloading the latest files… ${n}`));

  onStep('Restarting…');
  location.reload();
}
