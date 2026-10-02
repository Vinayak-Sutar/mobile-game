// HER WALKING, on an empty tilted plane.
//
// Step 2, and the one that matters most: the street can be rebuilt in an
// afternoon, but if walking around does not feel good there is no point
// building anything to walk around in. So this is deliberately bare - a
// ground plane, a few posts to judge depth against, and her.
//
// Press V (or the button) for ALL EIGHT at once: she is drawn eight times,
// one per direction, all walking. That is the quickest way to see whether
// every facing reads and whether any of them is wrong.

import { aim, createScene, toScreen, upPixels, worldAt } from './view.js';
import { W, shade } from './palette.js';
import { contact, post, hash, grain, sunWash, castShadow } from './kit.js';
import {
  createGirl, updateGirl, drawGirl, HEIGHT_CM, GAIT, OCTANT_NAMES,
} from './girl.js';
import { input, initInput, updateInput, stopInput } from './input.js';

/** ?z=2 zooms the camera in. A dev affordance, the same one style-test.html
 *  has, because judging a drawing at its shipping size is impossible. */
const ZOOM = Number(new URLSearchParams(location.search).get('z')) || 0.735;

let girl = null;
let showAll = false;
let camX = 0, camY = 0;
let started = false;

/** A few uprights, so there is something to judge depth and scale against. */
const POSTS = [
  [-620, -380, 240, 13, '#d2cdc3'], [540, -760, 300, 13, '#d2cdc3'],
  [880, 240, 260, 13, '#d2cdc3'], [-340, 760, 220, 13, '#d2cdc3'],
  [160, -1180, 280, 13, '#d2cdc3'], [-1000, 180, 200, 13, '#d2cdc3'],
];

export const toggles = [
  { id: 'all', label: 'all eight', get on() { return showAll; }, fn() { showAll = !showAll; } },
];

export function start() {
  girl = createGirl(0, 0, Math.PI / 4);
  camX = girl.x; camY = girl.y;
  showAll = false;
  if (!started) {
    initInput(document.getElementById('game'));
    window.addEventListener('keydown', onKey);
    started = true;
  }
}

export function stop() {
  if (!started) return;
  stopInput();
  window.removeEventListener('keydown', onKey);
  started = false;
  girl = null;
}

function onKey(ev) {
  if (ev.key.toLowerCase() === 'v') showAll = !showAll;
}

export function update(dt) {
  if (!girl) return;
  updateInput();
  updateGirl(girl, dt, showAll ? { x: 0, y: 0 } : input.move);

  // The camera trails her rather than being bolted to her, which keeps the
  // ground from feeling nailed to the character when she changes direction.
  const k = 1 - Math.exp(-dt / 0.22);
  camX += (girl.x - camX) * k;
  camY += (girl.y - camY) * k;
}

export function draw(ctx, { w, h }) {
  if (!girl) return 0;
  aim({ x: camX, y: camY, scale: ZOOM, w, h, fx: 0.5, fy: 0.62 });

  ctx.fillStyle = W.road;
  ctx.fillRect(0, 0, w, h);

  ground(ctx, w, h);

  const scene = createScene();
  for (const [x, y, ph, r, c] of POSTS) {
    scene.add(x, y, (g) => {
      castShadow(g, x - r, y - r, r * 2, r * 2, ph, 0.16);
      contact(g, x, y, r * 2.2, 0.26);
      post(g, { x, y, h: ph, r, color: c });
    });
  }

  if (showAll) {
    // Eight of her in a ring, each pinned to one direction and walking on the
    // spot. One screen that answers "does every facing read?".
    const R = 300 * (0.735 / ZOOM);
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4;
      const x = camX + Math.cos(a) * R, y = camY + Math.sin(a) * R;
      const clone = {
        ...girl, x, y, oct: k, face: a,
        moving: 1, speed: GAIT.speed, phase: (girl.t * 3.4 + k * 0.4) % (Math.PI * 2),
      };
      scene.add(x, y, (g) => {
        contact(g, x, y, 26, 0.34);
        const p = toScreen(x, y, 0);
        drawGirl(g, clone, p.x, p.y, upPixels(HEIGHT_CM));
        label(g, p.x, p.y + 16, OCTANT_NAMES[k]);
      });
    }
  } else {
    scene.add(girl.x, girl.y, (g) => {
      contact(g, girl.x, girl.y, 25 + girl.speed * 0.02, 0.34);
      const p = toScreen(girl.x, girl.y, 0);
      drawGirl(g, girl, p.x, p.y, upPixels(HEIGHT_CM));
    });
  }

  scene.paint(ctx);
  sunWash(ctx, w, h);
  grain(ctx, w, h, 0.05);
  hud(ctx, w, h);
  return scene.count;
}

/**
 * The plane. A flat warm ground, the joint lines of a paving grid, and weeds
 * scattered by hash - which is the cheapest way to make motion readable,
 * because a featureless plane gives the eye nothing to measure walking
 * against. Only what is on screen is drawn.
 */
function ground(ctx, w, h) {
  const T = 92;
  const c = [worldAt(0, 0), worldAt(w, 0), worldAt(0, h), worldAt(w, h)];
  const x0 = Math.floor(Math.min(...c.map((p) => p.x)) / T) * T;
  const x1 = Math.ceil(Math.max(...c.map((p) => p.x)) / T) * T;
  const y0 = Math.floor(Math.min(...c.map((p) => p.y)) / T) * T;
  const y1 = Math.ceil(Math.max(...c.map((p) => p.y)) / T) * T;

  ctx.strokeStyle = shade(W.slab, 0.935);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let x = x0; x <= x1; x += T) {
    const a = toScreen(x, y0, 0), b = toScreen(x, y1, 0);
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  }
  for (let y = y0; y <= y1; y += T) {
    const a = toScreen(x0, y, 0), b = toScreen(x1, y, 0);
    ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();

  ctx.fillStyle = shade('#97aa34', 0.98);
  for (let x = x0; x <= x1; x += T) {
    for (let y = y0; y <= y1; y += T) {
      const r = hash(Math.round(x / T), Math.round(y / T), 5);
      if (r > 0.13) continue;
      const p = toScreen(x + r * 300, y + hash(x, y, 9) * 300, 0);
      for (let b = 0; b < 5; b++) {
        const a = hash(x, y + b, 3) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(p.x + Math.cos(a) * 5, p.y + Math.sin(a) * 2.6, 2.6, 1.4, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function label(ctx, x, y, text) {
  ctx.font = '700 11px ui-rounded, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(64,67,82,0.42)';
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
}

function hud(ctx, w, h) {
  const pct = Math.round((girl.speed / GAIT.speed) * 100);
  ctx.font = '700 13px ui-rounded, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(64,67,82,0.55)';
  ctx.fillText(showAll
    ? 'all eight directions · V for one of her'
    : `facing ${OCTANT_NAMES[girl.oct]} · ${pct}% · V for all eight`, 20, h - 42);
  ctx.font = '500 12px ui-rounded, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(64,67,82,0.34)';
  ctx.fillText(input.pad ? 'left stick, or WASD' : 'WASD, the arrows, a stick, or drag anywhere',
    20, h - 24);

  // The floating thumbstick, drawn where the thumb actually is.
  if (input.stick) {
    const sc = w / window.innerWidth;
    const ox = input.stick.ox * sc, oy = input.stick.oy * sc;
    ctx.strokeStyle = 'rgba(64,67,82,0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ox, oy, 42, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(64,67,82,0.26)';
    ctx.beginPath();
    ctx.arc(ox + input.screen.x * 42, oy + input.screen.y * 42, 16, 0, Math.PI * 2);
    ctx.fill();
  }
}
