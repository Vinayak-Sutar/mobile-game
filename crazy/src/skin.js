// THE SKIN: one texture, baked at boot, handed to CSS.
//
// The brief was "simple and fresh", not an ornate material study, so there is
// exactly one texture here and it does one job: stop large flat panels reading
// as dead rectangles. A fine grain at 3% over a soft gradient is the whole
// trick. Anything heavier fights the game behind it.
//
// NO IMAGE FILES, EVER. Every pixel in this game is drawn in code, and a menu
// is not the place to break that - it would also cost the loading budget the
// platform ranks us on, which is currently about a tenth spent.
//
// Cost matters more than it looks. The floor tiles in texture.js are per-pixel
// JS loops, and on the 4 GB Chromebook that is the floor we target, a 256px
// tile is a visible stall. This bakes ONE 64px tile - 4096 pixels, under a
// millisecond - and if even that is slow the page keeps a flat fallback that
// was designed to look deliberate rather than broken.

/** A dim, even grain. Alpha only, so it tints whatever it sits on. */
function grainTile(size = 64, alpha = 0.035) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    // Two samples averaged: pure white noise sparkles and reads as dirt on a
    // screen, this is softer and tiles without an obvious repeat at 64px.
    const n = (Math.random() + Math.random()) * 0.5;
    d[i] = d[i + 1] = d[i + 2] = 255;
    d[i + 3] = Math.round(n * 255 * alpha);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

let applied = false;

/**
 * Bake the grain and hand it to CSS as a custom property.
 *
 * Sets `data-skin="rich"` on <html> only once the texture is actually there,
 * so every textured rule is written under that attribute and the untextured
 * state is a real design rather than a half-loaded one.
 */
export function applySkin() {
  if (applied) return;
  applied = true;
  try {
    const t0 = performance.now();
    const url = grainTile().toDataURL('image/png');
    document.documentElement.style.setProperty('--grain', `url(${url})`);
    document.documentElement.setAttribute('data-skin', 'rich');
    const ms = performance.now() - t0;
    if (ms > 25) console.info(`skin: grain baked in ${ms.toFixed(0)}ms`);
  } catch {
    // A blocked canvas, a locked-down browser, anything: the flat look stands.
  }
}

/**
 * Honour a player's stated preference for less movement.
 *
 * One attribute drives every animation in the stylesheet and the ember drift
 * behind the menus, so there is one place to turn motion down rather than a
 * check at each animation.
 */
export function applyMotion(reduced) {
  const sys = typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.setAttribute('data-motion', (reduced || sys) ? 'reduced' : 'full');
}
