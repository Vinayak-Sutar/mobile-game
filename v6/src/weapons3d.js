// The weapons, in the hand.
//
// Seven meshes, one per entry in Version 5's WEAPONS table, each built facing
// local +X so it can hang off the hand joint and point where the arm points.
// The shapes are read off the 2D drawings (`drawWeapon` in player.js), so a
// blade is still a blade and the Longarm still has its scope.
//
// Nothing here decides when a swing happens: the simulation's attack state
// machine does that, and actors3d.js poses the arm from it. This module only
// supplies the object and the bright trail its edge leaves behind.

import * as THREE from '../vendor/three.module.js';
import { mat, surfaceMat } from './palette.js';
import { TEX } from './textures3d.js';

const STEEL = 0xc9d2dc, DARKSTEEL = 0x7c8794, WOOD = 0x6b4a2c, LEATHER = 0x4a3526;

function metal(color) {
  return surfaceMat(color, null, { rough: 0.32, metal: 0.72 });
}
function wood() {
  return surfaceMat(WOOD, TEX.bark(), { rough: 0.85, normalScale: 0.6 });
}

/** Build the mesh for a weapon id. Everything points along +X from the grip. */
export function buildWeapon(id, color) {
  const g = new THREE.Group();
  const add = (mesh, x = 0, y = 0, z = 0) => {
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };

  switch (id) {
    case 'blade': {
      add(new THREE.Mesh(new THREE.BoxGeometry(9, 3.4, 3.4), surfaceMat(LEATHER, TEX.cloth(), { rough: 0.9 })), 2, 0, 0);
      add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 3, 13), metal(DARKSTEEL)), 7, 0, 0);
      const blade = add(new THREE.Mesh(new THREE.BoxGeometry(42, 1.7, 6), metal(STEEL)), 29, 0, 0);
      blade.geometry.translate(0, 0, 0);
      const tip = add(new THREE.Mesh(new THREE.ConeGeometry(3, 10, 4), metal(STEEL)), 55, 0, 0);
      tip.rotation.z = -Math.PI / 2;
      break;
    }
    case 'spear': {
      add(new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 72, 8), wood()), 22, 0, 0).rotation.z = Math.PI / 2;
      const head = add(new THREE.Mesh(new THREE.ConeGeometry(3.4, 16, 4), metal(STEEL)), 64, 0, 0);
      head.rotation.z = -Math.PI / 2;
      add(new THREE.Mesh(new THREE.BoxGeometry(3, 2, 7), metal(DARKSTEEL)), 54, 0, 0);
      break;
    }
    case 'shield': {
      // Strapped across the forearm: a hexagonal plate with a boss.
      const plate = add(new THREE.Mesh(new THREE.CylinderGeometry(20, 20, 3.4, 6), metal(0x8d7a5e)), 12, 0, 0);
      plate.rotation.z = Math.PI / 2;
      const boss = add(new THREE.Mesh(new THREE.SphereGeometry(5.2, 10, 8), metal(STEEL)), 15, 0, 0);
      boss.scale.set(0.7, 1, 1);
      add(new THREE.Mesh(new THREE.TorusGeometry(20, 1.6, 6, 6), metal(DARKSTEEL)), 12, 0, 0).rotation.y = Math.PI / 2;
      break;
    }
    case 'maul': {
      add(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.6, 46, 8), wood()), 16, 0, 0).rotation.z = Math.PI / 2;
      const head = add(new THREE.Mesh(new THREE.BoxGeometry(18, 20, 20), metal(0x6c6e74)), 44, 0, 0);
      head.castShadow = true;
      add(new THREE.Mesh(new THREE.BoxGeometry(3, 22, 22), metal(DARKSTEEL)), 53, 0, 0);
      break;
    }
    case 'bow': {
      const limb = add(new THREE.Mesh(new THREE.TorusGeometry(26, 1.9, 6, 14, Math.PI * 1.1), wood()), 8, 0, 0);
      limb.rotation.set(Math.PI / 2, 0, Math.PI * 0.45);
      const string = add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 48, 4), mat(0xe8e0cc, { kind: 'basic' })), 6, 0, 0);
      string.rotation.x = Math.PI / 2;
      g.userData.string = string;
      break;
    }
    case 'gun': {
      add(new THREE.Mesh(new THREE.BoxGeometry(16, 6, 5), wood()), 4, -1, 0);
      add(new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.6, 30, 10), metal(DARKSTEEL)), 26, 1.5, 0).rotation.z = Math.PI / 2;
      add(new THREE.Mesh(new THREE.CylinderGeometry(4.6, 3.2, 7, 10), metal(0x8a8f96)), 44, 1.5, 0).rotation.z = Math.PI / 2;
      break;
    }
    case 'longarm': {
      add(new THREE.Mesh(new THREE.BoxGeometry(18, 6.5, 5.5), wood()), 3, -1.5, 0);
      for (const dz of [-1.8, 1.8]) {
        add(new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 40, 8), metal(DARKSTEEL)), 30, 1, dz).rotation.z = Math.PI / 2;
      }
      add(new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 13, 8), metal(0x55606c)), 22, 7, 0).rotation.z = Math.PI / 2;
      add(new THREE.Mesh(new THREE.BoxGeometry(4, 5, 4), metal(0x55606c)), 16, 4.5, 0);
      break;
    }
    default: {
      add(new THREE.Mesh(new THREE.BoxGeometry(30, 3, 3), metal(STEEL)), 16, 0, 0);
      break;
    }
  }

  // A hint of the weapon's own colour, so each still reads at a glance the way
  // the 2D game's coloured silhouettes do.
  const band = new THREE.Mesh(new THREE.BoxGeometry(3.4, 4.2, 4.2), mat(color, { kind: 'basic' }));
  band.position.x = 5;
  g.add(band);
  return g;
}

/**
 * The bright arc an edge leaves behind. A ribbon of segments that follows the
 * weapon's tip while a swing is live and fades out over a quarter of a second.
 */
export function createTrail(group, color) {
  const SEGS = 14;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(SEGS * 6 * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const material = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  group.add(mesh);

  const near = [], far = [];
  return {
    mesh,
    /** Call with the two ends of the blade while a swing is live. */
    push(a, b) {
      near.push(a.clone());
      far.push(b.clone());
      if (near.length > SEGS) { near.shift(); far.shift(); }
      this.rebuild();
    },
    fade() {
      if (near.length) { near.shift(); far.shift(); this.rebuild(); }
    },
    clear() {
      near.length = 0;
      far.length = 0;
      mesh.visible = false;
    },
    rebuild() {
      if (near.length < 2) { mesh.visible = false; return; }
      let k = 0;
      for (let i = 0; i < near.length - 1; i++) {
        const a0 = near[i], b0 = far[i], a1 = near[i + 1], b1 = far[i + 1];
        for (const v of [a0, b0, a1, b0, b1, a1]) {
          pos[k] = v.x; pos[k + 1] = v.y; pos[k + 2] = v.z;
          k += 3;
        }
      }
      for (; k < pos.length; k++) pos[k] = 0;
      geo.attributes.position.needsUpdate = true;
      geo.setDrawRange(0, (near.length - 1) * 6);
      mesh.visible = true;
      material.opacity = 0.2 + 0.35 * (near.length / SEGS);
    },
  };
}
