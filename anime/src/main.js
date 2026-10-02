// ANIME - the shell, and the sections inside it.
//
// This is its own version, a sibling of v1-v5 and savi: its own cache prefix
// (anime-), its own manifest and its own build number. It is not v6 - that is
// the shelved 3D experiment and it is gitignored.
//
// It is built as SECTIONS rather than as one game, because it is an
// experiment. Each step of the plan gets its own entry here: a style test, her
// walking, the street, then the animals and the crowd. A section that is not
// written yet still appears on the title screen, greyed out, so the shape of
// the thing is visible from the front door.
//
// Adding a section is one entry in the list below plus a module that exports
// draw(ctx, { w, h }). Nothing else has to change.

import { BUILD, BUILT, latestBuild, hardRefresh } from './update.js';
import {
  initFullscreen, registerServiceWorker, isFullscreen, enterFullscreen,
} from './fullscreen.js';

/** A phone or tablet, judged by the device rather than by recent input. */
const isTouchDevice = () => (navigator.maxTouchPoints || 0) > 0
  && window.matchMedia('(pointer: coarse)').matches;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const overlay = document.getElementById('overlay');

/** Logical render size. Height is fixed so a character is the same share of
 *  the screen on every device; width follows the aspect ratio. */
export const viewport = { w: 1280, h: 600, dpr: 1 };

/**
 * THE SECTIONS.
 *
 * `load` is a dynamic import so an unfinished section costs nothing, and a
 * finished one is only fetched when it is opened.
 */
const SECTIONS = [
  {
    id: 'style',
    name: 'Style test',
    blurb: 'One still street. Three faces per solid, outlines on actors only, '
      + 'and the colour rationed the way the footage measured it.',
    ready: true,
    load: () => import('./style-test.js'),
  },
  {
    id: 'walk',
    name: 'Her walking',
    blurb: 'An empty tilted plane and nothing else: the projection, the walk, '
      + 'her hair and her earrings on springs. This is the feel.',
    ready: false,
  },
  {
    id: 'street',
    name: 'The street',
    blurb: 'One short street built out of the prop kit, walked end to end, '
      + 'with everything on it breathing on its own phase.',
    ready: false,
  },
  {
    id: 'alive',
    name: 'Cats, dogs and people',
    blurb: 'The crowd from the Wilds with different numbers, a cat that sits '
      + 'and washes and bolts, a dog that loses interest in you.',
    ready: false,
  },
  {
    id: 'reference',
    name: 'Reference',
    blurb: 'The frames from the ED that every number in this folder was '
      + 'measured off. Worth looking at before judging anything else.',
    ready: true,
    page: true,
  },
];

let current = null;              // the open section, or null on the title

// --- the canvas -------------------------------------------------------------

function resize() {
  const cw = Math.max(1, window.innerWidth), ch = Math.max(1, window.innerHeight);
  viewport.h = 600;
  viewport.w = Math.round(Math.min(1500, Math.max(820, 600 * (cw / ch))));
  viewport.dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(viewport.w * viewport.dpr);
  canvas.height = Math.round(viewport.h * viewport.dpr);
  ctx.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0);

  // Fit, never stretch. The logical width already follows the window's aspect,
  // so this is a no-op on anything shaped like a phone in landscape; it only
  // letterboxes where the clamp could not follow, and a squashed street would
  // be a worse answer than a margin.
  const fit = Math.min(cw / viewport.w, ch / viewport.h);
  canvas.style.width = `${Math.round(viewport.w * fit)}px`;
  canvas.style.height = `${Math.round(viewport.h * fit)}px`;
  repaint();
}

function repaint() {
  if (!current || !current.mod) return;
  current.mod.draw(ctx, { w: viewport.w, h: viewport.h });
}

// --- the title screen -------------------------------------------------------

function showTitle() {
  current = null;
  document.body.classList.remove('playing');
  overlay.innerHTML = `
    <div class="sheet">
      <h1>Anime</h1>
      <p class="sub">A street that looks like the ending of
        <i>You and I Are Polar Opposites</i>. Everything drawn in code.</p>
      <div class="cards">
        ${SECTIONS.map((s) => `
          <button class="card${s.ready ? '' : ' soon'}" data-open="${s.id}"
                  ${s.ready ? '' : 'disabled'}>
            <b>${s.name}</b>
            <span>${s.blurb}</span>
            ${s.ready ? '' : '<em>not built yet</em>'}
          </button>`).join('')}
      </div>
      <p class="foot"><span id="build">build ${BUILD} · ${BUILT}</span>
        <a class="away" href="../v5/">Ashfall →</a></p>
    </div>`;
  overlay.hidden = false;
  checkBuild();
}

/** Say whether this phone is running what was last pushed. The whole reason
 *  update.js exists: GitHub Pages can serve a ten-minute-old copy of any one
 *  of these files, so "my change isn't there" needs an answer. */
async function checkBuild() {
  const el = document.getElementById('build');
  if (!el) return;
  const latest = await latestBuild();
  if (latest === null || !document.getElementById('build')) return;
  if (latest <= BUILD) {
    el.textContent = `build ${BUILD} · up to date`;
    return;
  }
  el.innerHTML = `build ${BUILD} · <b>build ${latest} is waiting</b> `
    + '<button class="refresh" data-act="refresh">fetch it</button>';
}

// --- opening a section ------------------------------------------------------

async function openSection(id) {
  const s = SECTIONS.find((x) => x.id === id);
  if (!s || !s.ready) return;
  if (isTouchDevice() && !isFullscreen()) enterFullscreen().catch(() => {});

  if (s.page) { showReference(); return; }

  overlay.innerHTML = '<div class="loading">drawing…</div>';
  const mod = await s.load();
  current = { ...s, mod };
  document.body.classList.add('playing');
  overlay.innerHTML = '<button class="back" data-act="back">← sections</button>';
  overlay.hidden = false;
  repaint();
}

/** The reference frames, as a page rather than on the canvas - they are
 *  photographs of someone else's work and they are here to be compared
 *  against, not drawn over. */
function showReference() {
  current = null;
  document.body.classList.add('playing');
  const frames = [
    ['03_t27s.jpg', 'the shopfront street, 27 s - the frame this is all aimed at'],
    ['02_t22s.jpg', 'vending machines by the canal, 22 s'],
    ['04_t31s.jpg', 'the crossing, 31 s - three plain boxes here settled the light'],
    ['07_t46s.jpg', 'the canal path, 46 s - a low sun and long soft shadows'],
    ['01_t10s.jpg', 'the school corridor, 10 s'],
    ['09_t62s.jpg', 'the yellow room, 62 s'],
  ];
  overlay.innerHTML = `
    <button class="back" data-act="back">← sections</button>
    <div class="ref">
      <h2>What this is aiming at</h2>
      <p class="sub">"Pure" by Pas Tasta feat. 橋本絵莉子 - the season 1 ending.
        Every number in this folder was measured off these frames; the working
        is in <code>anime/reference/NOTES.md</code>.</p>
      ${frames.map(([f, cap]) => `
        <figure><img src="./reference/frames/${f}" alt="" loading="lazy">
        <figcaption>${cap}</figcaption></figure>`).join('')}
      <figure><img src="./reference/style-test-vs-ed.png" alt="" loading="lazy">
      <figcaption>the style test beside the frame it is aiming at</figcaption></figure>
    </div>`;
  overlay.hidden = false;
}

// --- wiring -----------------------------------------------------------------

overlay.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-open],[data-act]');
  if (!el) return;
  if (el.dataset.open) { openSection(el.dataset.open); return; }
  if (el.dataset.act === 'back') { showTitle(); return; }
  if (el.dataset.act === 'refresh') { hardRefresh(() => {}); }
});

window.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && document.body.classList.contains('playing')) showTitle();
});

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

initFullscreen({ onChange: resize });
registerServiceWorker();
resize();
showTitle();
