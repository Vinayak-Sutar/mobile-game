// The ground, as a mesh.
//
// Version 5 paints its ground pixel by pixel. Here the same information becomes
// geometry: a grid of vertices whose height comes from heights.js and whose
// colour comes from the terrain type at that point, with the 2D painter's
// relief light baked into the colour so the land still reads as lit from the
// upper left. Flat shading does the rest - every triangle takes one colour, and
// the facets catch the light the way the painted ground's noise did.
//
// Built in chunks so Three can cull what is off screen, and non-indexed because
// flat shading needs its own normal per triangle.

import * as THREE from '../vendor/three.module.js';
import { TT, fbm, vnoise } from '../../v5/src/terrain.js';
import { GROUND, mat, WORLD } from './palette.js';

const CHUNK = 256;          // world units per chunk
const PITCH = 8;            // units between vertices

// How strongly each terrain type shows the relief light (terrain.js's ROUGH).
const ROUGH = [0.35, 0.3, 0.3, 0.3, 1.1, 0.9, 0.45, 0.2, 0.6];

const tmpColor = new THREE.Color();

/** One mesh per chunk, added to `group`. */
export function buildTerrain(group, level) {
  const { terrain, heights, W, H } = level;
  const cols = Math.ceil(W / CHUNK), rows = Math.ceil(H / CHUNK);
  const material = mat(0xffffff, { vertexColors: true, flat: true });

  for (let cj = 0; cj < rows; cj++) {
    for (let ci = 0; ci < cols; ci++) {
      const x0 = ci * CHUNK, y0 = cj * CHUNK;
      const x1 = Math.min(W, x0 + CHUNK), y1 = Math.min(H, y0 + CHUNK);
      const nx = Math.ceil((x1 - x0) / PITCH), ny = Math.ceil((y1 - y0) / PITCH);
      const tris = nx * ny * 2;
      const pos = new Float32Array(tris * 9);
      const col = new Float32Array(tris * 9);
      let p = 0, c = 0;

      const put = (x, y) => {
        pos[p] = x; pos[p + 1] = heights.at(x, y); pos[p + 2] = y;
        p += 3;
        groundColor(terrain, x, y, tmpColor);
        col[c] = tmpColor.r; col[c + 1] = tmpColor.g; col[c + 2] = tmpColor.b;
        c += 3;
      };

      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const ax = x0 + i * PITCH, ay = y0 + j * PITCH;
          const bx = Math.min(x1, ax + PITCH), by = Math.min(y1, ay + PITCH);
          // Two triangles, wound so they face up.
          put(ax, ay); put(ax, by); put(bx, ay);
          put(bx, ay); put(ax, by); put(bx, by);
        }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, material);
      mesh.frustumCulled = true;
      group.add(mesh);
    }
  }

  // A skirt around the edge, so the world does not end in a visible cliff of
  // nothing: a wide dark plane a little below the ground.
  const skirt = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 4, H * 4),
    mat(0x1a1622, { flat: false }),
  );
  skirt.rotation.x = -Math.PI / 2;
  skirt.position.set(W / 2, -60, H / 2);
  group.add(skirt);
}

/**
 * The colour of the ground at a point: the terrain type, varied by the same
 * broad noise the 2D painter uses, and lit by the slope of that noise.
 */
function groundColor(terrain, x, y, out) {
  // Ragged borders, exactly as terrain.js does it: look the type up a little
  // way off, pushed about by noise.
  const jx = x + (vnoise(x * 0.035, y * 0.035) - 0.5) * 26;
  const jy = y + (vnoise(x * 0.035 + 57, y * 0.035 + 91) - 0.5) * 26;
  const t = terrain.typeAt(jx, jy);
  const m = fbm(x * 0.011, y * 0.011);
  const a = x * 0.018, b = y * 0.018;
  const relief = (fbm(a - 0.06, b - 0.06) - fbm(a + 0.06, b + 0.06)) * 5;
  out.setHex(GROUND[t]);
  // Patch variation, then the relief light.
  const light = (0.88 + m * 0.24) * (1 + relief * ROUGH[t] * 0.8);
  out.multiplyScalar(light);
  // Worn roads: the ground goes to packed earth near a road's centre line.
  const road = terrain.roadAt(x, y);
  if (road < 34) {
    tmpRoad.setHex(t === TT.SNOW ? 0xb4bcc8 : 0x6d5a42);
    out.lerp(tmpRoad, (1 - road / 34) * 0.8);
  }
  return out;
}
const tmpRoad = new THREE.Color();

/** Still water and the dash channels, as planes with a foam rim. */
export function buildWater(group, level) {
  for (const o of level.obstacles) {
    if (o.kind !== 'water' && o.kind !== 'gap') continue;
    const deep = o.kind === 'water';
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(o.w, o.h, Math.max(2, o.w / 40), Math.max(2, o.h / 40)),
      mat(deep ? WORLD.waterDeep : WORLD.water, { flat: true, opacity: 0.88 }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(o.x + o.w / 2, -7, o.y + o.h / 2);
    plane.userData.wave = { t: 0, base: plane.geometry.attributes.position.array.slice() };
    group.add(plane);
    // The bed below, so shallow water reads as water over sand.
    const bed = new THREE.Mesh(
      new THREE.PlaneGeometry(o.w, o.h),
      mat(deep ? 0x2a3038 : 0x4a4436, { flat: false }),
    );
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(o.x + o.w / 2, -26, o.y + o.h / 2);
    group.add(bed);
  }
}

/** Ripple the water planes: two summed sines, the cheap version of the 2D waves. */
export function updateWater(group, time) {
  for (const child of group.children) {
    const w = child.userData.wave;
    if (!w) continue;
    const attr = child.geometry.attributes.position;
    const arr = attr.array;
    for (let i = 0; i < arr.length; i += 3) {
      const x = w.base[i], y = w.base[i + 1];
      arr[i + 2] = Math.sin(x * 0.05 + time * 1.7) * 1.6 + Math.sin(y * 0.07 - time * 2.3) * 1.2;
    }
    attr.needsUpdate = true;
  }
}
