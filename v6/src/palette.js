// Version 6's colours and its material cache.
//
// The 3D look is meant to read as the same game as the 2D one: flat colour,
// hard silhouettes, a dark outline, lit from the upper left. So the palette is
// lifted straight from Version 5 - the terrain's colours (terrain.js
// TERRAIN_RGB) and the Wanderer's cloth colours (wanderer.js) - and every mesh
// uses a flat-shaded material from the cache below.
//
// The cache matters: with flat-shaded low-poly, a fresh material per mesh is
// the easiest way to blow the draw-call budget, since Three cannot batch two
// meshes that do not share a material.

import * as THREE from '../vendor/three.module.js';

/** The outline and shadow ink: everything dark in the game is this colour. */
export const INK = 0x1b130f;
export const SKY_TOP = 0x2a3550;
export const SKY_LOW = 0x6a5a58;
export const NIGHT = 0x08060d;          // the menus' background, and the fog's far end

// The nine terrain types, in the order of terrain.js's TT enum.
export const GROUND = [
  0x52643e, // grass
  0x466036, // tall grass
  0x2e4430, // moss
  0x705e46, // dirt
  0x706c66, // rock
  0xdee4ee, // snow
  0xb8a47a, // sand
  0x686462, // paving
  0x7e705c, // gravel
];

// Cloth and skin, from the Wanderer.
export const WEAR = {
  coat: 0xa24e2d, coatShade: 0x7a3620, trouser: 0x3b3444, boot: 0x2e2119,
  skin: 0xe2b489, hair: 0x3a2616, straw: 0xdcbd6e, roll: 0xc9b48a, glove: 0x4a3526,
  belt: 0x3a2a1c, buckle: 0xe0b050,
};

// Stone, wood and water for the world's props.
export const WORLD = {
  rock: 0x645c52, rockLit: 0x857c6e, cliff: 0x5a5250, ruin: 0x5a5452,
  bark: 0x3a2a1c, leaf: 0x3d5731, pine: 0x24392f, snowCap: 0xeaf0f8,
  water: 0x1c3a4c, waterDeep: 0x16303e, foam: 0x9fd8f0,
  ember: 0xff9a3d, gold: 0xffd45e, blood: 0xff4d5e, spirit: 0x9fe8ff,
};

const cache = new Map();

/**
 * A shared material. Flat shading by default, because the facets catching the
 * light are what make the low-poly read.
 * kind: 'lambert' (lit) | 'basic' (unlit, for outlines and glows).
 */
export function mat(color, opts = {}) {
  const {
    kind = 'lambert', flat = true, opacity = 1, side = THREE.FrontSide,
    depthWrite = opacity >= 1, blending = THREE.NormalBlending, vertexColors = false,
  } = opts;
  const key = `${kind}|${color}|${flat}|${opacity}|${side}|${depthWrite}|${blending}|${vertexColors}`;
  let m = cache.get(key);
  if (m) return m;
  const args = {
    color, transparent: opacity < 1, opacity, side, depthWrite, blending, vertexColors,
  };
  if (kind === 'basic') m = new THREE.MeshBasicMaterial(args);
  else m = new THREE.MeshLambertMaterial({ ...args, flatShading: flat });
  cache.set(key, m);
  return m;
}

/** The dark ink material used for every outline shell. */
export function inkMat() {
  return mat(INK, { kind: 'basic', side: THREE.BackSide });
}

/**
 * An outline, the way the 2D game does it: the same shape again, a little
 * fatter, in ink, drawn inside-out so only the rim shows around the silhouette.
 * (drawSkeleton's `grow: 1.5` dark pass, in three dimensions.)
 */
export function addOutline(mesh, grow = 1.06) {
  const shell = new THREE.Mesh(mesh.geometry, inkMat());
  shell.scale.setScalar(grow);
  shell.renderOrder = -1;
  mesh.add(shell);
  return shell;
}

export function disposeMaterials() {
  for (const m of cache.values()) m.dispose();
  cache.clear();
}
