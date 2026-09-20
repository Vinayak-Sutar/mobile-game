// The player, in three dimensions.
//
// The 2D game draws the Wanderer by hand from the pose its skeleton resolves.
// Here the same idea is built out of primitives: hips, chest, head, a straw hat,
// two arms and two jointed legs, each a box or a sphere, all facing local +X so
// the whole figure can be turned by the simulation's aim angle.
//
// The walk is the one from wanderer.js, kept deliberately: eight held key poses
// per stride (contact, down, passing, up, then the other leg), the planted foot
// sliding back under the body, the free foot arcing forward, knees placed by
// two-bone inverse kinematics, and the body dropping and rising a unit per step.
// It reads as weight rather than as a wiggle, and it already survived the
// owner's eye in 2D.

import * as THREE from '../vendor/three.module.js';
import { clamp } from '../../v5/src/util.js';
import { addOutline, mat, WEAR } from './palette.js';

const FRAMES = 8;
const BOB = [0, 1.6, 0, -1.6, 0, 1.6, 0, -1.6];
const THIGH = 15, SHIN = 15, HIP_Y = 30;      // sim units: the player is ~54 tall

/** Where a foot is within its own cycle: planted, then swinging. */
function footAt(u, reach, lift) {
  if (u < 0.5) return { x: reach - (u / 0.5) * 2 * reach, y: 0 };
  const v = (u - 0.5) / 0.5, e = v * v * (3 - 2 * v);
  return { x: -reach + e * 2 * reach, y: Math.sin(v * Math.PI) * lift };
}

/** Knee angles for a hip-to-foot span, thigh and shin of fixed length. */
function legAngles(dx, dy) {
  const d = Math.min(Math.hypot(dx, dy), THIGH + SHIN - 0.5);
  const a = Math.atan2(dy, dx);
  const b = Math.acos(clamp((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * Math.max(d, 0.01)), -1, 1));
  const knee = Math.acos(clamp((THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN), -1, 1));
  return { hip: a - b, knee: Math.PI - knee };
}

function limb(len, thick, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, thick, thick), mat(color));
  m.position.x = len / 2;                     // grows along +X from its joint
  const holder = new THREE.Group();
  holder.add(m);
  return holder;
}

export function createPlayerActor(group) {
  const node = new THREE.Group();

  // Hips and chest: the body is one wedge-ish stack, warm rust against the land.
  const hips = new THREE.Group();
  hips.position.y = HIP_Y;
  node.add(hips);

  const coat = new THREE.Mesh(new THREE.BoxGeometry(15, 22, 19), mat(WEAR.coat));
  coat.position.y = 11;
  addOutline(coat, 1.05);
  hips.add(coat);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(16, 3.5, 20), mat(WEAR.belt));
  belt.position.y = 1;
  hips.add(belt);
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 20, 7), mat(WEAR.roll));
  roll.rotation.x = Math.PI / 2;
  roll.position.set(-7, 18, 0);
  hips.add(roll);

  const head = new THREE.Mesh(new THREE.SphereGeometry(6.4, 10, 8), mat(WEAR.skin));
  head.position.y = 28;
  hips.add(head);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 1.8, 12), mat(WEAR.straw));
  brim.position.y = 33;
  addOutline(brim, 1.04);
  hips.add(brim);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(6.6, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(WEAR.straw));
  crown.position.y = 33.5;
  hips.add(crown);

  // Arms: the left swings with the walk, the right holds the weapon (and will
  // be driven by the attack state machine once weapons are in).
  const armL = limb(16, 4.4, WEAR.coatShade);
  armL.position.set(-1, 18, -8.5);
  hips.add(armL);
  const armR = limb(17, 4.6, WEAR.coatShade);
  armR.position.set(-1, 18, 8.5);
  hips.add(armR);
  const hand = new THREE.Group();          // where a weapon hangs, later
  hand.position.x = 17;
  armR.add(hand);

  // Legs: thigh, shin, boot.
  const legs = [];
  for (const side of [-1, 1]) {
    const thigh = limb(THIGH, 5, side < 0 ? WEAR.trouser : WEAR.trouser);
    thigh.position.set(0, 0, side * 5);
    const shin = limb(SHIN, 4.6, WEAR.trouser);
    shin.position.x = THIGH;
    thigh.add(shin);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 6), mat(WEAR.boot));
    boot.position.set(SHIN + 1, 0, 0);
    shin.add(boot);
    hips.add(thigh);
    legs.push({ thigh, shin });
  }

  // A soft shadow under the feet: a dark disc, the same trick the 2D game uses.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(15, 14),
    mat(0x000000, { kind: 'basic', opacity: 0.32, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;

  group.add(node);
  group.add(shadow);

  const state = { phase: 0 };

  return {
    node, hand, shadow,
    /** p: the simulation's player. heights: the ground. */
    update(p, dt, heights) {
      const ground = heights.at(p.x, p.y);
      node.position.set(p.x, ground + (p.z || 0), p.y);
      shadow.position.set(p.x, ground + 0.6, p.y);
      shadow.material.opacity = 0.32 / (1 + (p.z || 0) / 40);
      // Built facing local +X, so the sim's angle turns the figure like this.
      node.rotation.y = -p.aimAngle;

      const air = !!(p.hop || p.leap || (p.z || 0) > 0.5);
      const walking = p.moveMag > 0.08 && !p.dead && !p.dashing && !air;
      if (walking) state.phase = (state.phase + dt * (1.5 + 0.8 * p.moveMag)) % 1;
      const frame = Math.floor(state.phase * FRAMES) % FRAMES;

      // The legs swing along the way the body is moving, which is not always
      // the way it faces: running backwards steps backwards.
      const along = Math.cos(p.moveAngle - p.aimAngle);
      const dir = along < -0.2 ? -1 : 1;
      let near, far, bodyY = 0, lean = 0;
      if (p.dead) {
        near = { x: 4, y: 0 }; far = { x: -4, y: 0 };
      } else if (air) {
        near = { x: 9, y: 11 }; far = { x: -6, y: 13 };
      } else if (p.dashing) {
        near = { x: 16, y: 2 }; far = { x: -15, y: 7 };
        lean = 0.3;
      } else if (walking) {
        const u = frame / FRAMES;
        near = footAt(u, 11 * dir, 9);
        far = footAt((u + 0.5) % 1, 11 * dir, 9);
        bodyY = BOB[frame];
        lean = 0.07;
      } else {
        near = { x: 4, y: 0 }; far = { x: -3.5, y: 0 };
        bodyY = Math.sin(performance.now() * 0.0016) * 0.7;
      }

      hips.position.y = HIP_Y + bodyY;
      hips.rotation.z = -lean;

      // A dodge roll: the whole figure tumbles forward over the roll's length.
      if (p.dashing) {
        const k = 1 - clamp(p.dashT / 0.17, 0, 1);
        node.rotation.z = -k * Math.PI * 2;
        node.position.y = ground + Math.sin(k * Math.PI) * 10;
      } else {
        node.rotation.z = 0;
      }

      // Place each leg by inverse kinematics: hip to where the foot must be.
      const feet = [far, near];
      for (let i = 0; i < 2; i++) {
        const f = feet[i];
        const L = legs[i];
        const { hip, knee } = legAngles(f.x, -(HIP_Y + bodyY) + f.y);
        L.thigh.rotation.z = hip;
        L.shin.rotation.z = knee;
      }

      // Arms counter-swing with the legs; the weapon arm rises a little when
      // there is an attack running (the real swing arrives with the weapons).
      armL.rotation.z = 0.5 - far.x * 0.045;
      armR.rotation.z = 0.5 + (p.attack ? -1.1 : 0) - near.x * 0.045;

      if (p.dead) {
        node.rotation.z = Math.PI * 0.42;
        node.position.y = ground + 4;
      }
    },
  };
}
