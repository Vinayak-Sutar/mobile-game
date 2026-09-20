// Everything solid that stands on the ground: cliffs, stairs, boulders, ruined
// walls and trees.
//
// Each of Version 5's obstacle kinds gets one builder here, and the shapes are
// read off the 2D drawings so the world is recognisably the same place: a
// boulder extrudes the irregular outline `overworld.js` already gives it, a
// cliff face carries the strata of the painted version, stairs are the same
// nine-unit treads.
//
// The collision is untouched - the simulation still pushes the player out of
// the same rectangles - so what you can climb and what you can drop off is
// exactly what it was in 2D.

import * as THREE from '../vendor/three.module.js';
import { TT } from '../../v5/src/terrain.js';
import { rand } from '../../v5/src/util.js';
import { addOutline, mat, surfaceMat, WORLD, GROUND } from './palette.js';
import { TEX } from './textures3d.js';

// Textured materials, built the first time a level asks for one.
const M = {
  get rock() { return surfaceMat(0xa79f97, TEX.rock(), { rough: 0.92, normalScale: 1.1, flat: true }); },
  get cliff() { return surfaceMat(0x9a938c, TEX.rock(), { rough: 0.95, normalScale: 1.3 }); },
  get stone() { return surfaceMat(0x9c968f, TEX.stone(), { rough: 0.86 }); },
  get bark() { return surfaceMat(0x8a7254, TEX.bark(), { rough: 0.95, normalScale: 1.3 }); },
  get leaf() { return surfaceMat(0x8fbf6a, TEX.leaf(), { rough: 0.9 }); },
  get pine() { return surfaceMat(0x6f9c74, TEX.leaf(), { rough: 0.9 }); },
  get snow() { return surfaceMat(0xffffff, TEX.snow(), { rough: 0.6 }); },
};

/** Everything solid casts a shadow and receives one. */
function solid(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildProps(group, level) {
  const { obstacles, raised, heights, terrain } = level;

  // --- the plateau: faces, side walls and the staircase ----------------------
  for (const f of raised.faces) buildFace(group, f, heights, terrain);
  for (const r of raised.rims) buildRim(group, r, heights);
  for (const s of raised.stairs) buildStairs(group, s, heights);

  for (const o of obstacles) {
    switch (o.kind) {
      case 'rock': buildRock(group, o, heights, terrain); break;
      case 'ruin': buildRuin(group, o, heights); break;
      case 'trunk': break;                   // the tree builder draws these
      case 'cliff': buildRim(group, { ...o, vertical: true }, heights); break;
      default: break;                        // water, gap, face, rim: handled above
    }
  }

  for (const t of level.trees) buildTree(group, t, heights);
}

/** A cliff face seen from the front: rock with a lip of whatever grows on top. */
function buildFace(group, f, heights, terrain) {
  const h = heights.TOP + 8;
  const box = solid(new THREE.Mesh(new THREE.BoxGeometry(f.w, h, f.h), M.cliff));
  uvScale(box.geometry, 0.02);
  box.position.set(f.x + f.w / 2, h / 2 - 8, f.y + f.h / 2);
  group.add(box);
  // The lip: a strip of ground colour along the top edge, hanging over a little.
  const above = terrain.typeAt(f.x + f.w / 2, f.y - 10);
  const lip = solid(new THREE.Mesh(
    new THREE.BoxGeometry(f.w + 6, 7, f.h * 0.5),
    mat(GROUND[above === TT.SNOW ? TT.SNOW : above]),
  ));
  lip.position.set(f.x + f.w / 2, heights.TOP - 2, f.y + f.h * 0.22);
  group.add(lip);
  // Strata: a couple of darker bands across the wall.
  for (let k = 0; k < 2; k++) {
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(f.w + 1, 5, f.h + 1),
      mat(0x463f3d),
    );
    band.position.set(f.x + f.w / 2, 6 + k * 22, f.y + f.h / 2);
    group.add(band);
  }
}

/** A sheer side wall (a plateau's flank, or a standalone cliff). */
function buildRim(group, r, heights) {
  const h = heights.TOP + 10;
  const box = solid(new THREE.Mesh(new THREE.BoxGeometry(r.w, h, r.h), M.cliff));
  uvScale(box.geometry, 0.02);
  box.position.set(r.x + r.w / 2, h / 2 - 10, r.y + r.h / 2);
  group.add(box);
}

/** Stone stairs: real steps, the same nine units deep as the painted ones. */
function buildStairs(group, s, heights) {
  const steps = Math.max(3, Math.round(s.h / 9));
  for (let i = 0; i < steps; i++) {
    const k = (i + 1) / steps;
    const y = heights.TOP * k;
    const depth = s.h / steps + 1;
    const step = solid(new THREE.Mesh(new THREE.BoxGeometry(s.w, y + 6, depth), M.stone));
    step.position.set(s.x + s.w / 2, (y + 6) / 2 - 6, s.y + s.h - (i + 0.5) * (s.h / steps));
    group.add(step);
  }
  // Cheek walls, so the staircase reads as cut into the cliff.
  for (const dx of [-s.w / 2 - 5, s.w / 2 + 5]) {
    const cheek = solid(new THREE.Mesh(new THREE.BoxGeometry(10, heights.TOP + 10, s.h), M.cliff));
    cheek.position.set(s.x + s.w / 2 + dx, (heights.TOP + 10) / 2 - 10, s.y + s.h / 2);
    group.add(cheek);
  }
}

/** A boulder: its 2D outline extruded and faceted, with a snow cap up high. */
function buildRock(group, o, heights, terrain) {
  // A boulder: a coarse sphere pushed about a little, squashed to the
  // obstacle's footprint and cut off flat where it meets the ground.
  const tall = Math.max(o.w, o.h) * rand(0.42, 0.62);
  const geo = new THREE.SphereGeometry(0.5, 9, 6);
  const gp = geo.attributes.position;
  for (let i = 0; i < gp.count; i++) {
    const j = 0.88 + Math.random() * 0.22;
    const y = gp.getY(i);
    gp.setXYZ(
      i,
      gp.getX(i) * o.w * j,
      Math.max(-0.12, y) * tall * 2 * j,     // flat-bottomed: it sits, not floats
      gp.getZ(i) * o.h * j,
    );
  }
  geo.computeVertexNormals();
  applyBoxUV(geo, 0.03);
  const rock = solid(new THREE.Mesh(geo, M.rock));
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  rock.position.set(cx, heights.at(cx, cy) - 3, cy);
  rock.rotation.y = rand(0, Math.PI * 2);
  addOutline(rock, 1.04);
  group.add(rock);
  if (terrain.typeAt(cx, cy) === TT.SNOW) {
    const cap = solid(new THREE.Mesh(new THREE.SphereGeometry(Math.min(o.w, o.h) * 0.42, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.5), M.snow));
    cap.position.set(cx, heights.at(cx, cy) + tall - 6, cy);
    group.add(cap);
  }
}

/** A broken wall: a box with its top edge chipped away. */
function buildRuin(group, o, heights) {
  const h = rand(40, 70);
  const wallMesh = solid(new THREE.Mesh(new THREE.BoxGeometry(o.w, h, Math.max(o.h, 18)), M.stone));
  uvScale(wallMesh.geometry, 0.02);
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  wallMesh.position.set(cx, heights.at(cx, cy) + h / 2 - 4, cy);
  addOutline(wallMesh, 1.02);
  group.add(wallMesh);
  // A few loose blocks fallen off the top.
  for (let k = 0; k < 2; k++) {
    const s = rand(10, 18);
    const block = solid(new THREE.Mesh(new THREE.BoxGeometry(s, s, s), M.stone));
    block.position.set(cx + rand(-o.w / 2, o.w / 2), heights.at(cx, cy) + s / 2 - 2, cy + rand(18, 34));
    block.rotation.y = rand(0, Math.PI);
    group.add(block);
  }
}

/** A tree: a tapered trunk and either a pine's tiers or a broadleaf crown. */
function buildTree(group, t, heights) {
  const y = heights.at(t.x, t.y);
  const tree = new THREE.Group();
  tree.position.set(t.x, y, t.y);
  const trunkH = t.r * (t.pine ? 2.2 : 1.7);
  const trunk = solid(new THREE.Mesh(
    new THREE.CylinderGeometry(t.r * 0.12, t.r * 0.19, trunkH, 7),
    M.bark,
  ));
  trunk.position.y = trunkH / 2;
  tree.add(trunk);

  const tint = (base) => {
    const c = new THREE.Color(base);
    c.offsetHSL(0, 0, t.shade / 260);
    return c.getHex();
  };
  if (t.pine) {
    for (let k = 0; k < 3; k++) {
      const r = t.r * (0.95 - k * 0.24);
      const tier = solid(new THREE.Mesh(new THREE.ConeGeometry(r, t.r * 1.15, 8), M.pine.clone()));
      tier.material.color.setHex(tint(WORLD.pine));
      tier.position.y = trunkH * 0.55 + k * t.r * 0.62;
      tree.add(tier);
    }
  } else {
    for (let k = 0; k < 2; k++) {
      const crown = solid(new THREE.Mesh(new THREE.IcosahedronGeometry(t.r * (0.95 - k * 0.3), 1), M.leaf.clone()));
      crown.material.color.setHex(tint(WORLD.leaf));
      crown.position.set(rand(-4, 4), trunkH + k * t.r * 0.5, rand(-4, 4));
      tree.add(crown);
    }
  }
  tree.userData.sway = t.sway;
  group.add(tree);
}

/** Scale a box's own UVs so a tiling texture keeps a constant size on it. */
function uvScale(geo, k) {
  const uv = geo.attributes.uv;
  geo.computeBoundingBox();
  const size = new THREE.Vector3();
  geo.boundingBox.getSize(size);
  const s = Math.max(size.x, size.y, size.z) * k;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s, uv.getY(i) * s);
  uv.needsUpdate = true;
}

/** Project a tiling texture onto a shape that has no UVs of its own. */
function applyBoxUV(geo, k) {
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) * k;
    uv[i * 2 + 1] = pos.getZ(i) * k + pos.getY(i) * k * 0.6;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** A gentle sway on the trees near the camera. */
export function swayTrees(group, time, focus) {
  for (const child of group.children) {
    const s = child.userData.sway;
    if (s === undefined) continue;
    const dx = child.position.x - focus.x, dz = child.position.z - focus.z;
    if (dx * dx + dz * dz > 700 * 700) continue;
    child.rotation.z = Math.sin(time * 0.9 + s) * 0.022;
    child.rotation.x = Math.cos(time * 0.7 + s) * 0.018;
  }
}
