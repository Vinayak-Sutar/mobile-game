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
import { addOutline, mat, surfaceMat, WEAR } from './palette.js';
import { blobTexture, TEX } from './textures3d.js';
import { buildWeapon, createTrail } from './weapons3d.js';

const FRAMES = 8;
const BOB = [0, 1.6, 0, -1.6, 0, 1.6, 0, -1.6];
const THIGH = 15, SHIN = 15, HIP_Y = 28;      // sim units: the player is ~54 tall
// Hips at 28 with 30 units of leg: the foot can always reach the ground, even
// at the widest part of a stride, so the figure never sinks to make the reach.
const SOLE = 2.6;                             // half the boot: its sole rests on the ground

/** Where a foot is within its own cycle: planted, then swinging. */
function footAt(u, reach, lift) {
  if (u < 0.5) return { x: reach - (u / 0.5) * 2 * reach, y: 0 };
  const v = (u - 0.5) / 0.5, e = v * v * (3 - 2 * v);
  return { x: -reach + e * 2 * reach, y: Math.sin(v * Math.PI) * lift };
}

/**
 * Knee angles for a hip-to-foot span, thigh and shin of fixed length.
 *
 * Two-bone inverse kinematics always has two answers - the knee can bend
 * either side of the line from hip to foot - and the wrong one gives a bird's
 * backward knee. The body faces local +X, so the knee has to lead forward:
 * that is the `a + b` branch, with the shin folding back the other way.
 */
function legAngles(dx, dy) {
  const d = Math.min(Math.hypot(dx, dy), THIGH + SHIN - 0.5);
  const a = Math.atan2(dy, dx);
  const b = Math.acos(clamp((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * Math.max(d, 0.01)), -1, 1));
  const knee = Math.acos(clamp((THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN), -1, 1));
  return { hip: a + b, knee: -(Math.PI - knee) };
}

/** Woven cloth for the clothes, so the light finds a weave rather than a plane. */
const cloth = (color) => surfaceMat(color, TEX.cloth(), { rough: 0.94, normalScale: 0.6 });

function limb(len, thick, color) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, thick, thick), cloth(color));
  m.castShadow = true;
  m.position.x = len / 2;                     // grows along +X from its joint
  const holder = new THREE.Group();
  holder.add(m);
  return holder;
}

/**
 * The sword, pose by pose, following the owner's animation notes: a light
 * combo whose three hits each read differently, a charged blow held at the top
 * of its wind-up, and a jumping attack that comes down as a plunge.
 *
 * Every pose is driven by the simulation's own attack state (which hit of the
 * combo, which phase, how far through it), so the swing you see is the swing
 * that has the hitbox.
 */
function swordPose(p, extra, out) {
  const REST = 1.42;
  const at = p.attack;

  // Charged: wound back over the shoulder and held there, the blade low behind.
  if (extra.charging) {
    const k = extra.chargeFrac;
    out.mainZ = REST - 1.2 - k * 1.4;
    out.mainY = 0.5 + k * 0.55;
    out.twist = -0.35 - k * 0.45;
    out.lean = -0.1 - k * 0.12;
    out.step = -4 * k;                     // weight shifts onto the back foot
    return out;
  }
  // The jumping attack: both hands up, blade overhead, waiting for the ground.
  if (extra.plunging) {
    out.mainZ = -1.85;
    out.mainY = 0.15;
    out.twist = -0.2;
    out.lean = -0.18;
    out.offGrip = true;
    return out;
  }
  if (!at) return out;

  const total = Math.max(0.0001, (at.step[at.phase] || 0.0001) / p.stats.attackSpeed);
  const k = 1 - Math.max(0, Math.min(1, at.t / total));       // 0 at the phase's start
  const spin = !!at.step.spin;
  const hit = at.index | 0;

  if (spin) {
    // The third hit and the Rending Spin: the whole body turns through the
    // swing, blade held out at arm's length, and the feet cross under it.
    const turns = at.isSpecial ? 1.6 : 1.0;
    out.mainZ = 0.12;
    out.mainY = -0.25;
    if (at.phase === 'windup') { out.twist = -0.9 * k; out.lean = 0.05 + 0.1 * k; out.spin = -0.5 * k; }
    else if (at.phase === 'active') { out.spin = -0.5 - turns * Math.PI * 2 * k; out.twist = -0.9 + 0.4 * k; }
    else { out.spin = -0.5 - turns * Math.PI * 2; out.twist = -0.5 * (1 - k); out.mainZ = 0.12 + (1.42 - 0.12) * k; }
    return out;
  }

  // Light hits. The first comes down from the right shoulder, the second
  // answers it back across the body from the left, so a combo reads as two
  // different swings rather than the same one twice.
  const mirror = hit % 2 === 1 ? -1 : 1;
  if (at.phase === 'windup') {
    out.mainZ = 1.42 - 2.9 * k;                       // up and behind the head
    out.mainY = (0.95 * k) * mirror;
    out.twist = (-0.6 * k) * mirror;
    out.lean = -0.06 * k;
  } else if (at.phase === 'active') {
    out.mainZ = -1.5 + 2.9 * k;                       // through the arc
    out.mainY = (0.95 - 2.0 * k) * mirror;
    out.twist = (-0.6 + 1.25 * k) * mirror;
    out.lean = 0.12 * Math.sin(k * Math.PI);
    out.step = 7 * k;                                  // the body follows the blade
  } else {
    out.mainZ = 1.4 + (1.42 - 1.4) * k;
    out.mainY = (-1.05 * (1 - k)) * mirror;
    out.twist = (0.65 * (1 - k)) * mirror;
    out.step = 7 * (1 - k);
  }
  return out;
}

/**
 * Where the arms are this frame. The attack state machine gives the phase and
 * how far through it we are; each family of weapon reads that differently - a
 * blade winds up over the shoulder and sweeps down, a spear pulls back and
 * thrusts, a maul is slower and heavier, a gun kicks.
 */
function armPose(p, extra) {
  const REST = 1.42;
  const out = {
    mainZ: REST, mainY: 0, offZ: 0, offY: 0, twist: 0, offGrip: false,
    lean: 0, step: 0, spin: 0,
  };
  const id = p.weapon ? p.weapon.id : 'blade';
  const twoHanded = id === 'maul' || id === 'longarm' || id === 'spear';
  out.offGrip = twoHanded;

  // The blade has its own hand-authored set (light combo, charged, plunge).
  if (id === 'blade') return swordPose(p, extra, out);

  // Aiming down a scope or drawing a bow: brought up and held.
  if (p.aiming || (p.charging && id === 'bow')) {
    out.mainZ = 0.05;
    out.mainY = id === 'bow' ? -0.5 : -0.15;
    out.offGrip = true;
    out.twist = -0.35;
    return out;
  }
  if (p.charging) {
    // Winding a heavy blow: the weapon goes up and back behind the shoulder.
    const k = p.weapon && p.weapon.charge ? Math.min(1, p.charge / p.weapon.charge.time)
      : p.weapon && p.weapon.heavy ? Math.min(1, p.charge / p.weapon.heavy.time) : 0.5;
    out.mainZ = REST - 1.1 - k * 1.5;
    out.mainY = 0.5 + k * 0.45;
    out.twist = -0.3 - k * 0.35;
    return out;
  }

  const at = p.attack;
  if (!at) return out;

  const total = Math.max(0.0001, (at.step[at.phase] || 0.0001) / p.stats.attackSpeed);
  const k = 1 - Math.max(0, Math.min(1, at.t / total));      // 0 at the start of the phase

  if (id === 'gun' || id === 'longarm') {
    // Levelled, then a kick back on the shot.
    out.mainZ = 0.05;
    out.mainY = -0.12;
    out.twist = -0.4;
    if (at.phase === 'active') { out.mainZ += 0.45 * (1 - k); out.twist -= 0.2 * (1 - k); }
    return out;
  }
  if (id === 'bow') {
    out.mainZ = 0.05;
    out.mainY = -0.5;
    out.twist = -0.5;
    return out;
  }
  if (id === 'shield') {
    // A bash: shoulder first, then punch through.
    if (at.phase === 'windup') { out.mainZ = REST - 0.9 * k; out.twist = -0.5 * k; }
    else if (at.phase === 'active') { out.mainZ = 0.5 - 0.5 * k; out.mainY = -0.2 * k; out.twist = -0.5 + 0.9 * k; }
    else { out.mainZ = 0.4 + (REST - 0.4) * k; out.twist = 0.4 * (1 - k); }
    return out;
  }
  if (id === 'spear') {
    // Pull back along the body, then thrust straight out.
    if (at.phase === 'windup') { out.mainZ = 0.9 - 0.35 * k; out.mainY = 0.9 * k; out.twist = 0.55 * k; }
    else if (at.phase === 'active') { out.mainZ = 0.35; out.mainY = 0.9 - 1.15 * k; out.twist = 0.55 - 1.0 * k; }
    else { out.mainZ = 0.35 + (REST - 0.35) * k; out.mainY = -0.25 * (1 - k); out.twist = -0.45 * (1 - k); }
    return out;
  }
  // Blade and maul: over the shoulder, then down and across.
  const heavy = id === 'maul';
  if (at.phase === 'windup') {
    out.mainZ = REST - (REST + 1.5) * k;         // up and behind
    out.mainY = 0.85 * k;
    out.twist = -0.55 * k;
  } else if (at.phase === 'active') {
    out.mainZ = -1.5 + (heavy ? 3.1 : 2.7) * k;  // the sweep through
    out.mainY = 0.85 - 1.7 * k;
    out.twist = -0.55 + 1.1 * k;
  } else {
    out.mainZ = (heavy ? 1.6 : 1.2) + (REST - (heavy ? 1.6 : 1.2)) * k;
    out.mainY = -0.85 * (1 - k);
    out.twist = 0.55 * (1 - k);
  }
  return out;
}

export function createPlayerActor(group) {
  const node = new THREE.Group();

  // A pivot at hip height, so a roll can tumble the whole body about its
  // middle while the node itself stays on the ground.
  const rollPivot = new THREE.Group();
  rollPivot.position.y = HIP_Y;
  node.add(rollPivot);

  // Hips and chest: the body is one wedge-ish stack, warm rust against the land.
  const hips = new THREE.Group();
  rollPivot.add(hips);

  const coat = new THREE.Mesh(new THREE.BoxGeometry(14, 22, 16), cloth(WEAR.coat));
  coat.position.y = 11;
  coat.castShadow = true;
  addOutline(coat, 1.05);
  hips.add(coat);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(15, 3.5, 17), mat(WEAR.belt));
  belt.position.y = 1;
  hips.add(belt);
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 20, 9), cloth(WEAR.roll));
  roll.castShadow = true;
  roll.rotation.x = Math.PI / 2;
  roll.position.set(-7, 18, 0);
  hips.add(roll);

  const head = new THREE.Mesh(new THREE.SphereGeometry(6.4, 12, 10), surfaceMat(WEAR.skin, null, { rough: 0.78 }));
  head.position.y = 28;
  head.castShadow = true;
  hips.add(head);
  const strawMat = surfaceMat(WEAR.straw, TEX.straw(), { rough: 0.85, normalScale: 0.8 });
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 1.8, 16), strawMat);
  brim.position.y = 33;
  brim.castShadow = true;
  addOutline(brim, 1.04);
  hips.add(brim);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(6.6, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), strawMat);
  crown.position.y = 33.5;
  crown.castShadow = true;
  hips.add(crown);

  // Arms: the left swings with the walk, the right holds the weapon (and will
  // be driven by the attack state machine once weapons are in).
  const armL = limb(16, 4.2, WEAR.coatShade);
  armL.position.set(-1, 18, -10.5);          // clear of the coat, or they vanish inside it
  hips.add(armL);
  const armR = limb(17, 4.4, WEAR.coatShade);
  armR.position.set(-1, 18, 10.5);
  hips.add(armR);
  const hand = new THREE.Group();          // the grip: a weapon hangs here
  hand.position.x = 17;
  armR.add(hand);
  // The off hand, for the bow's draw and the shield's brace.
  const handL = new THREE.Group();
  handL.position.x = 16;
  armL.add(handL);

  // Legs: thigh, shin, boot.
  const legs = [];
  for (const side of [-1, 1]) {
    const thigh = limb(THIGH, 5, side < 0 ? WEAR.trouser : WEAR.trouser);
    thigh.position.set(0, 0, side * 5);
    const shin = limb(SHIN, 4.6, WEAR.trouser);
    shin.position.x = THIGH;
    thigh.add(shin);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(9, 5.2, 6), cloth(WEAR.boot));
    boot.castShadow = true;
    boot.position.set(SHIN + 1, 0, 0);
    boot.userData.sole = SOLE;
    shin.add(boot);
    hips.add(thigh);
    legs.push({ thigh, shin });
  }

  // A soft shadow under the feet: a dark disc, the same trick the 2D game uses.
  // A soft contact shadow under the feet. The sun casts a real shadow too;
  // this is the dark little pool that says exactly where the feet are.
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 46),
    new THREE.MeshBasicMaterial({
      map: blobTexture(), transparent: true, opacity: 0.5, depthWrite: false, color: 0x000000,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;

  group.add(node);
  group.add(shadow);

  const state = { phase: 0, weaponId: null, weapon: null, trail: null, land: 0, flinch: 0, wasAir: false };

  // Scratch vectors for the trail, so a frame allocates nothing.
  const tipA = new THREE.Vector3(), tipB = new THREE.Vector3();

  return {
    node, hand, handL, shadow,
    /** Put a weapon in the hand (and its trail in the effects group). */
    setWeapon(w, fxGroup) {
      if (state.weaponId === w.id) return;
      state.weaponId = w.id;
      if (state.weapon) hand.remove(state.weapon);
      state.weapon = buildWeapon(w.id, w.color);
      hand.add(state.weapon);
      if (state.trail) state.trail.clear();
      else state.trail = createTrail(fxGroup, w.color);
      state.trail.mesh.material.color.setHex(w.color);
    },
    /**
     * p: the simulation's player. mv: the mover (move3d.js).
     * extra: { charging, chargeFrac, plunging } from combat3d.js.
     */
    update(p, dt, heights, mv, extra) {
      const ground = heights.at(p.x, p.y);
      node.position.set(p.x, ground + (p.z || 0), p.y);
      shadow.position.set(p.x, ground + 0.7, p.y);
      // The shadow shrinks and fades as you rise, which is what sells height.
      const lift = (p.z || 0);
      shadow.material.opacity = 0.5 / (1 + lift / 55);
      shadow.scale.setScalar(1 / (1 + lift / 130));

      const air = !!(p.hop || p.leap || (mv && !mv.grounded) || (p.z || 0) > 0.5);
      // Landing compresses the legs for a moment; a hit jolts the body.
      if (state.wasAir && !air) state.land = 1;
      state.wasAir = air;
      state.land = Math.max(0, state.land - dt * 5);
      state.flinch = p.hurtFlash > 0 ? Math.max(state.flinch, 1) : Math.max(0, state.flinch - dt * 4);
      const sprinting = !!(mv && mv.sprinting);
      const walking = p.moveMag > 0.08 && !p.dead && !p.dashing && !air;
      if (walking) state.phase = (state.phase + dt * (1.5 + 0.8 * p.moveMag) * (sprinting ? 1.5 : 1)) % 1;
      const frame = Math.floor(state.phase * FRAMES) % FRAMES;

      // The legs swing along the way the body is moving, which is not always
      // the way it faces: running backwards steps backwards.
      const along = Math.cos(p.moveAngle - p.aimAngle);
      const dir = along < -0.2 ? -1 : 1;
      let near, far, bodyY = 0, lean = 0;
      if (p.dead) {
        near = { x: 4, y: 0 }; far = { x: -4, y: 0 };
      } else if (air) {
        // Rising: knees up and reaching. Falling: legs reaching for the ground.
        const rising = mv ? mv.vz > 0 : false;
        near = rising ? { x: 11, y: 13 } : { x: 7, y: 5 };
        far = rising ? { x: -5, y: 15 } : { x: -6, y: 7 };
        lean = rising ? 0.12 : -0.06;
      } else if (p.dashing) {
        // Tucked up inside the roll: knees to the chest.
        near = { x: 9, y: 12 }; far = { x: 2, y: 14 };
        bodyY = -6;
      } else if (walking) {
        const u = frame / FRAMES;
        const reach = sprinting ? 16 : 11;
        near = footAt(u, reach * dir, sprinting ? 13 : 9);
        far = footAt((u + 0.5) % 1, reach * dir, sprinting ? 13 : 9);
        bodyY = BOB[frame] * (sprinting ? 1.5 : 1);
        lean = sprinting ? 0.2 : 0.07;
      } else {
        near = { x: 4, y: 0 }; far = { x: -3.5, y: 0 };
        bodyY = Math.sin(performance.now() * 0.0016) * 0.7;
      }

      hips.position.y = bodyY - state.land * 4;
      hips.rotation.z = -lean - state.flinch * 0.12;

      // --- the dodge roll ------------------------------------------------
      // A roll is a tumble about the body's side axis, in the direction it is
      // travelling: the figure turns to face the roll, curls, goes over its
      // shoulder and comes back to its feet. Rolling is 0.17 s, so the whole
      // revolution has to happen inside it.
      if (p.dashing) {
        const k = 1 - clamp(p.dashT / 0.17, 0, 1);
        node.rotation.y = -(p.dashDir ?? mv?.face ?? p.aimAngle);
        rollPivot.rotation.z = -k * Math.PI * 2;
        // Up over the shoulder and back down: the hips rise at the apex. The
        // pivot keeps its own hip height, or the body sinks into the ground.
        rollPivot.position.y = HIP_Y + Math.sin(k * Math.PI) * 9;
        hips.rotation.z = 0;
      } else {
        rollPivot.rotation.z = 0;
        rollPivot.position.y = HIP_Y;
      }

      // Place each leg by inverse kinematics: hip to where the foot must be.
      // The legs bend a little more on the frame you land.
      const feet = [far, near];
      const hipHeight = HIP_Y + bodyY - state.land * 4;
      for (let i = 0; i < 2; i++) {
        const f = feet[i];
        const L = legs[i];
        const { hip, knee } = legAngles(f.x, -hipHeight + f.y + SOLE);
        L.thigh.rotation.z = hip;
        L.shin.rotation.z = knee;
      }

      // Arms counter-swing with the legs; the weapon arm rises a little when
      // there is an attack running (the real swing arrives with the weapons).
      // --- the arms ------------------------------------------------------
      // At rest they hang and swing against the legs. During an attack the
      // weapon arm is driven by the simulation's own state machine, so what you
      // see is exactly the swing that deals the damage.
      const A = armPose(p, extra || {});
      armL.rotation.z = A.offZ + (A.offGrip ? 0 : 1.42 - far.x * 0.03);
      armL.rotation.y = A.offY;
      armR.rotation.z = A.mainZ;
      armR.rotation.y = A.mainY;
      hips.rotation.y = A.twist;
      // A swing carries the body with it: the shoulders lean into the arc, the
      // hips step through it, and a spin turns the whole figure.
      if (A.lean) hips.rotation.z -= A.lean;
      hips.position.x = A.step || 0;
      node.rotation.y = -(mv ? mv.face : p.aimAngle) + (A.spin || 0);
      if (A.offGrip && state.weapon) {
        // Both hands on it: the off hand reaches for the grip.
        armL.rotation.z = A.mainZ * 0.85;
        armL.rotation.y = -A.mainY * 0.5 - 0.35;
      }

      // The weapon's trail, while a swing is actually live.
      if (state.trail && state.weapon) {
        if (p.attack && p.attack.phase === 'active') {
          state.weapon.updateMatrixWorld(true);
          tipA.set(10, 0, 0).applyMatrix4(state.weapon.matrixWorld);
          tipB.set(58, 0, 0).applyMatrix4(state.weapon.matrixWorld);
          state.trail.push(tipA, tipB);
        } else {
          state.trail.fade();
        }
      }

      if (p.dead) {
        node.rotation.z = Math.PI * 0.42;
        node.position.y = ground + 4;
      }
    },
  };
}
