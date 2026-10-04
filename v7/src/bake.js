// Sprite-sheet baker.
//
// Renders the vector rigs frame by frame into a PNG atlas plus a JSON
// descriptor. This is the small version of the pipeline Dead Cells uses: model
// and animate once, render to sprites, ship the sprites. Here the "model" is
// the skeleton in rigs.js rather than a 3D mesh, but the output is identical —
// a texture the runtime can blit without evaluating any animation at all.
//
// The camera is straight top-down and the rig rotates cleanly, so only the
// +X facing is baked; the renderer rotates the sprite at draw time. Baking 8
// directions would multiply the atlas by 8 for no visual gain.

import { resolvePose, drawSkeleton } from './anim.js';
import { PLAYER_SKELETON, PLAYER_CLIPS } from './rigs.js';
import { ENEMY_RIGS } from './enemy-rigs.js';
import { TEXTURE_RECIPES } from './texture.js';

/** Frame counts chosen per clip: enough to read, few enough to stay small. */
export const DEFAULT_BAKE = {
  idle: 16,
  run: 12,
  dash: 8,
  hurt: 8,
  death: 16,
};

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Bake a set of clips into one atlas.
 * Returns { canvas, atlas } — atlas is the JSON sidecar.
 */
export function bakeSpriteSheet({
  skeleton = PLAYER_SKELETON,
  clips = PLAYER_CLIPS,
  frameCounts = DEFAULT_BAKE,
  cell = 128,
  scale = 3.4,
  palette = { visor: '#ff9a5a' },
  // Matches drawPlayerRig, so a baked sprite is pixel-identical to the
  // live rig rather than quietly losing its outline.
  outline = { color: '#0b0712', grow: 1.5 },
  name = 'player',
} = {}) {
  const names = Object.keys(frameCounts).filter((n) => clips[n]);
  const cols = Math.max(...names.map((n) => frameCounts[n]));
  const rows = names.length;

  const canvas = makeCanvas(cols * cell, rows * cell);
  const ctx = canvas.getContext('2d');

  const atlas = {
    name,
    image: `${name}.png`,
    frameWidth: cell,
    frameHeight: cell,
    // Where the character's origin sits inside a cell, so the runtime can
    // place sprites by their feet/centre rather than the cell corner.
    originX: cell / 2,
    originY: cell / 2,
    scale,
    clips: {},
  };

  names.forEach((clipName, row) => {
    const clip = clips[clipName];
    const count = frameCounts[clipName];
    atlas.clips[clipName] = {
      row,
      frames: count,
      duration: clip.duration,
      loop: clip.loop,
      fps: count / clip.duration,
    };

    const pose = blankPoseFor(skeleton);
    for (let f = 0; f < count; f++) {
      // Sample at frame centres for looping clips so frame 0 and frame N
      // are not the same pose (which would stutter on loop).
      const t = clip.loop
        ? (f / count) * clip.duration
        : (f / Math.max(1, count - 1)) * clip.duration;

      samplePoseAt(skeleton, clip, t, pose);

      ctx.save();
      ctx.translate(row * 0 + f * cell + cell / 2, row * cell + cell / 2);
      const world = resolvePose(skeleton, pose, { x: 0, y: 0, angle: 0, scale });
      if (outline) {
        drawSkeleton(ctx, world, { tint: outline.color, grow: outline.grow * scale });
      }
      drawSkeleton(ctx, world, { palette });
      ctx.restore();
    }
  });

  return { canvas, atlas };
}

// Local copies of anim.js internals — the baker needs to sample a clip at an
// arbitrary time without owning an Animator or advancing real time.
function blankPoseFor(skeleton) {
  const pose = {};
  for (const b of skeleton.bones) pose[b.name] = { angle: 0, x: 0, y: 0, sx: 1, sy: 1 };
  return pose;
}

function samplePoseAt(skeleton, clip, time, pose) {
  const t = clip.loop
    ? ((time % clip.duration) + clip.duration) % clip.duration
    : Math.max(0, Math.min(time, clip.duration));
  for (const b of skeleton.bones) {
    const keys = clip.tracks[b.name];
    const p = pose[b.name];
    if (!keys || keys.length === 0) {
      p.angle = 0; p.x = 0; p.y = 0; p.sx = 1; p.sy = 1;
      continue;
    }
    const n = keys.length;
    if (n === 1 || t <= keys[0].t) { assign(p, keys[0]); continue; }
    if (t >= keys[n - 1].t) { assign(p, keys[n - 1]); continue; }

    let i = 0;
    while (i < n - 1 && keys[i + 1].t <= t) i++;
    const a = keys[i], b2 = keys[i + 1];
    const span = b2.t - a.t;
    const k = b2.ease(span > 1e-6 ? (t - a.t) / span : 0);
    let da = (b2.angle - a.angle) % (Math.PI * 2);
    if (da > Math.PI) da -= Math.PI * 2;
    if (da < -Math.PI) da += Math.PI * 2;
    p.angle = a.angle + da * k;
    p.x = a.x + (b2.x - a.x) * k;
    p.y = a.y + (b2.y - a.y) * k;
    p.sx = a.sx + (b2.sx - a.sx) * k;
    p.sy = a.sy + (b2.sy - a.sy) * k;
  }
  return pose;
}

function assign(p, k) {
  p.angle = k.angle; p.x = k.x; p.y = k.y; p.sx = k.sx; p.sy = k.sy;
}

/**
 * Furthest point any bone reaches from the origin in the rest pose, including
 * its thickness. Used to fit a rig into a fixed cell instead of guessing.
 */
function rigExtent(skeleton) {
  const pose = blankPoseFor(skeleton);
  const world = resolvePose(skeleton, pose, { x: 0, y: 0, angle: 0, scale: 1 });
  let max = 1;
  for (const w of world) {
    const b = w.bone;
    if (b.shape === 'none') continue;
    const tipX = w.x + Math.cos(w.angle) * b.len;
    const tipY = w.y + Math.sin(w.angle) * b.len;
    max = Math.max(max, Math.hypot(w.x, w.y) + b.thick, Math.hypot(tipX, tipY) + b.thick);
  }
  return max;
}

/** Frames per clip when baking enemies — short clips need fewer. */
function framesForClip(clip) {
  return Math.max(4, Math.min(16, Math.round(clip.duration * 20)));
}

/**
 * Bake one atlas per enemy type. Colours come from ENEMY_DEFS via the caller,
 * since the rigs store role names rather than literal colours.
 */
export function bakeEnemySheet(type, { cell = 96, colors = {} } = {}) {
  const rig = ENEMY_RIGS[type];
  if (!rig) return null;

  const base = colors.main || '#ff5e6e';
  const palette = {};
  for (const b of rig.skeleton.bones) {
    if (b.color === 'main') palette[b.name] = base;
    else if (b.color === 'dark') palette[b.name] = colors.dark || '#2a1c38';
    else if (b.color === 'light') palette[b.name] = colors.light || '#ffffff';
    else if (b.color === 'accent') palette[b.name] = '#fff2b0';
  }

  const frameCounts = {};
  for (const [name, clip] of Object.entries(rig.clips)) frameCounts[name] = framesForClip(clip);

  // Fit the rig to the cell. The 1.5 headroom covers poses that reach well
  // past the rest pose — a brute with both arms up, a bomber mid-swell.
  const fit = (cell / 2 - 3) / (rigExtent(rig.skeleton) * 1.5);

  return bakeSpriteSheet({
    skeleton: rig.skeleton,
    clips: rig.clips,
    frameCounts,
    cell,
    scale: fit,
    palette,
    name: type,
  });
}

/** Bake every procedural texture recipe into its own canvas. */
export function bakeTextures(opts = {}) {
  const out = {};
  for (const [key, make] of Object.entries(TEXTURE_RECIPES)) {
    out[key] = make(opts[key] || {});
  }
  return out;
}

// --- output ----------------------------------------------------------------

function toCanvas(c) {
  // OffscreenCanvas has no toDataURL; blit it into a normal one first.
  if (typeof HTMLCanvasElement !== 'undefined' && c instanceof HTMLCanvasElement) return c;
  const n = makeCanvas(c.width, c.height);
  n.getContext('2d').drawImage(c, 0, 0);
  return n;
}

export function canvasToDataURL(c) {
  return toCanvas(c).toDataURL('image/png');
}

function triggerDownload(filename, href) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Download the player atlas plus every texture as real files. */
export function exportAll({ cell = 128, scale = 3.4 } = {}) {
  const { canvas, atlas } = bakeSpriteSheet({ cell, scale });
  triggerDownload('player.png', canvasToDataURL(canvas));
  triggerDownload('player.json', 'data:application/json,' + encodeURIComponent(JSON.stringify(atlas, null, 2)));

  const textures = bakeTextures({
    'floor-stone': { size: 256, hue: 250 },
    'floor-normal': { size: 256 },
    rock: { size: 128, hue: 250 },
    'particle-dot': { size: 64 },
  });
  for (const [key, c] of Object.entries(textures)) {
    triggerDownload(`${key}.png`, canvasToDataURL(c));
  }
  return { sheet: `${canvas.width}x${canvas.height}`, textures: Object.keys(textures) };
}

/** Same set, returned as data URLs instead of downloads (used by tooling). */
export function exportAsDataURLs({ cell = 128, scale = 3.4 } = {}) {
  const { canvas, atlas } = bakeSpriteSheet({ cell, scale });
  const textures = bakeTextures({
    'floor-stone': { size: 256, hue: 250 },
    'floor-normal': { size: 256 },
    rock: { size: 128, hue: 250 },
    'particle-dot': { size: 64 },
  });
  const out = {
    'player.png': canvasToDataURL(canvas),
    'player.json': JSON.stringify(atlas, null, 2),
  };
  for (const [key, c] of Object.entries(textures)) out[`${key}.png`] = canvasToDataURL(c);

  for (const [type, colors] of Object.entries(ENEMY_COLORS)) {
    const baked = bakeEnemySheet(type, { colors });
    if (!baked) continue;
    out[`enemy-${type}.png`] = canvasToDataURL(baked.canvas);
    out[`enemy-${type}.json`] = JSON.stringify(baked.atlas, null, 2);
  }
  return out;
}

// Mirrors ENEMY_DEFS[type].color; kept here so bake.js doesn't drag the whole
// enemy AI module into the bundle just to read six hex strings.
const ENEMY_COLORS = {
  wretch: { main: '#ff5e6e' },
  slinger: { main: '#5ee0c8' },
  brute: { main: '#a97bff' },
  charger: { main: '#ff9a4d' },
  bomber: { main: '#ff4d9d' },
  splitter: { main: '#7dff9c' },
  spitter: { main: '#ff7ad6' },
  warden: { main: '#ff3d5e' },
};

/**
 * POST every baked asset to the dev server, which writes them into ./assets.
 * Only works against serve.py; harmless everywhere else.
 */
export async function saveAssets(opts = {}) {
  const files = exportAsDataURLs(opts);
  const res = await fetch('/__save-assets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
  });
  if (!res.ok) throw new Error(`save failed: ${res.status}`);
  return res.json();
}
