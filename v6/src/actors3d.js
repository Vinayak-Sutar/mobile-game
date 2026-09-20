// The player: how the figure is built, and how it moves.
//
// Two rules keep this readable, and the previous version broke both:
//
//   1. THE MODEL FACES LOCAL +X, with +Y up. Every limb is a box grown along
//      +X from its joint, so a limb hanging straight down is a rotation of
//      -90 degrees about Z. Rather than scatter that offset through every
//      pose, `swing()` takes an angle where **0 is hanging straight down and
//      positive swings forward** - the way an animator would say it. (The old
//      code used the raw rotation, which is why the character stood with both
//      arms in the air.)
//   2. Poses are authored as a whole body: arms, twist, lean, step and the
//      legs together. A swing that only moves an arm reads as a puppet.
//
// The look follows the owner's research document: a blocky, voxel-ish figure,
// but with the weight and follow-through of a souls-like - a low guard at
// rest, the body bladed toward the enemy, a cloak that trails the motion.

import * as THREE from '../vendor/three.module.js';
import { clamp } from '../../v5/src/util.js';
import { addOutline, mat, surfaceMat, WEAR } from './palette.js';
import { blobTexture, TEX } from './textures3d.js';
import { buildWeapon, createTrail } from './weapons3d.js';

// --- proportions (sim units; the collision radius is 17) ---------------------
const HIP_Y = 26;          // the hips ride here above the feet
const SHOULDER_Y = 18;     // above the hips
const SHOULDER_Z = 11.2;   // half the shoulder width: clear of the coat
const THIGH = 14, SHIN = 13;
const UPPER = 12, FORE = 11;
const SOLE = 2.6;

const FRAMES = 8;
const BOB = [0, 1.5, 0, -1.5, 0, 1.5, 0, -1.5];

/** The shortest signed angle from b to a. */
function angleGap(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** A limb angle where 0 hangs straight down and positive swings forward. */
function swing(group, a, out = 0) {
  group.rotation.z = -Math.PI / 2 + a;
  group.rotation.y = out;
}

/** Where a foot is within its own cycle: planted, then swinging forward. */
function footAt(u, reach, lift) {
  if (u < 0.5) return { x: reach - (u / 0.5) * 2 * reach, y: 0 };
  const v = (u - 0.5) / 0.5, e = v * v * (3 - 2 * v);
  return { x: -reach + e * 2 * reach, y: Math.sin(v * Math.PI) * lift };
}

/**
 * Two-bone inverse kinematics, picking the solution whose knee leads forward.
 * Returns angles in the same "0 is down" convention as `swing`.
 */
function legAngles(dx, dy) {
  const d = Math.min(Math.hypot(dx, dy), THIGH + SHIN - 0.4);
  const a = Math.atan2(dy, dx);
  const b = Math.acos(clamp((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * Math.max(d, 0.01)), -1, 1));
  const inner = Math.acos(clamp((THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN), -1, 1));
  return { hip: a + b + Math.PI / 2, knee: -(Math.PI - inner) };
}

const cloth = (color) => surfaceMat(color, TEX.cloth(), { rough: 0.94, normalScale: 0.6 });
const leather = (color) => surfaceMat(color, TEX.cloth(), { rough: 0.72, normalScale: 0.9 });

function box(w, h, d, material, cast = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.castShadow = cast;
  return m;
}

/** A limb segment: a tapered box grown along +X from its joint. */
function segment(len, thick, thick2, material) {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(len, thick, thick);
  // Taper the far end, so an arm reads as an arm and not a plank.
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getX(i) > 0) {
      pos.setY(i, pos.getY(i) * (thick2 / thick));
      pos.setZ(i, pos.getZ(i) * (thick2 / thick));
    }
  }
  geo.translate(len / 2, 0, 0);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  g.add(m);
  return g;
}

export function createPlayerActor(group) {
  const node = new THREE.Group();

  // The pivot the whole body tumbles about in a roll.
  const rollPivot = new THREE.Group();
  rollPivot.position.y = HIP_Y;
  node.add(rollPivot);

  const hips = new THREE.Group();
  rollPivot.add(hips);

  // --- the body ------------------------------------------------------------
  const coatMat = cloth(WEAR.coat), darkMat = cloth(WEAR.coatShade);
  const pelvis = box(13, 9, 15, cloth(WEAR.trouser));
  pelvis.position.y = -1;
  hips.add(pelvis);

  // Chest: broader at the shoulders than at the waist, which is most of what
  // makes a blocky figure read as a person rather than a crate.
  const chest = new THREE.Group();
  chest.position.y = 4;
  hips.add(chest);
  const torso = box(13.5, 16, 17.5, coatMat);
  torso.position.y = 8;
  addOutline(torso, 1.03);
  chest.add(torso);
  const shoulders = box(11, 6, 23, coatMat);
  shoulders.position.y = 15;
  chest.add(shoulders);
  // A pauldron on the sword shoulder: asymmetry gives the silhouette an edge.
  const pauldron = box(12, 6.5, 8, leather(0x6b4a2c));
  pauldron.position.set(0, 15.5, 11);
  chest.add(pauldron);
  const belt = box(14.5, 3.6, 16.5, leather(WEAR.belt));
  belt.position.y = 1.5;
  chest.add(belt);
  const buckle = box(2.6, 3, 3, mat(WEAR.buckle));
  buckle.position.set(7, 1.5, 0);
  chest.add(buckle);

  // The cloak: three panels hanging from the shoulders, each swinging a little
  // more than the one above, so movement ripples down it.
  const cloakSegs = [];
  let parent = chest;
  for (let i = 0; i < 3; i++) {
    const seg = new THREE.Group();
    seg.position.y = i === 0 ? 14 : -8;
    const panel = box(3, 9, 20 - i * 1.5, darkMat);
    panel.position.set(-7.5, -4.5, 0);
    seg.add(panel);
    parent.add(seg);
    cloakSegs.push(seg);
    parent = seg;
  }

  // Head, neck, hat.
  const head = new THREE.Group();
  head.position.y = 19.5;
  chest.add(head);
  // (kept on the actor so the pose can turn it toward the aim)
  // A high collar rather than a bare neck: it joins the head to the coat.
  const collar = box(7.5, 4.5, 9, cloth(WEAR.coatShade));
  collar.position.y = -2;
  head.add(collar);
  const skull = box(8.5, 9, 9, cloth(WEAR.skin));
  skull.position.y = 3.5;
  addOutline(skull, 1.03);
  head.add(skull);
  const hair = box(8.8, 4, 9.3, cloth(WEAR.hair));
  hair.position.set(-0.4, 7, 0);
  head.add(hair);
  // A shadowed face under the brim, with two catchlights for eyes.
  const face = box(1.2, 3, 7, mat(0x2a211c));
  face.position.set(4.2, 3.2, 0);
  head.add(face);
  for (const z of [-1.9, 1.9]) {
    const eye = box(0.7, 0.7, 1, mat(0x9fb4cc, { kind: 'basic' }));
    eye.position.set(4.85, 3.5, z);
    head.add(eye);
  }
  const strawMat = surfaceMat(WEAR.straw, TEX.straw(), { rough: 0.85, normalScale: 0.8 });
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(11.5, 11.5, 1.5, 14), strawMat);
  brim.position.y = 7.4;
  brim.rotation.z = -0.07;                 // worn at a slight tilt
  brim.castShadow = true;
  addOutline(brim, 1.03);
  head.add(brim);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.8, 5, 12), strawMat);
  crown.position.y = 9.6;
  crown.castShadow = true;
  head.add(crown);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(5.9, 5.9, 1.6, 12), cloth(0x8a3a2a));
  band.position.y = 8.3;
  head.add(band);

  // The bedroll across the back.
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 17, 9), cloth(WEAR.roll));
  roll.rotation.x = Math.PI / 2;
  roll.position.set(-8, 13, 0);
  roll.castShadow = true;
  chest.add(roll);

  // --- arms ----------------------------------------------------------------
  const arms = [];
  for (const side of [1, -1]) {            // [0] = sword arm (+z), [1] = off hand
    const upper = segment(UPPER, 4.6, 4.0, side > 0 ? darkMat : darkMat);
    upper.position.set(0, SHOULDER_Y, side * SHOULDER_Z);
    const fore = segment(FORE, 4.0, 3.6, darkMat);
    fore.position.x = UPPER;
    upper.add(fore);
    const hand = new THREE.Group();
    hand.position.x = FORE;
    fore.add(hand);
    const fist = box(4.2, 4.2, 4.2, leather(WEAR.glove));
    fist.position.x = 1.6;
    hand.add(fist);
    chest.add(upper);
    arms.push({ upper, fore, hand });
  }
  const hand = arms[0].hand;               // the sword hand
  const handL = arms[1].hand;

  // --- legs ----------------------------------------------------------------
  const legs = [];
  for (const side of [1, -1]) {
    const thigh = segment(THIGH, 5.4, 4.8, cloth(WEAR.trouser));
    thigh.position.set(0, -2, side * 4.6);
    const shin = segment(SHIN, 4.8, 4.2, cloth(WEAR.trouser));
    shin.position.x = THIGH;
    thigh.add(shin);
    const boot = box(9.5, 5.2, 6.4, leather(WEAR.boot));
    boot.position.set(SHIN + 1.5, 0, 0);
    shin.add(boot);
    hips.add(thigh);
    legs.push({ thigh, shin, boot });
  }

  // A soft pool of shadow under the feet, on top of the sun's own shadow.
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(48, 48),
    new THREE.MeshBasicMaterial({
      map: blobTexture(), transparent: true, opacity: 0.5, depthWrite: false, color: 0x000000,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;

  group.add(node);
  group.add(shadow);

  const state = { phase: 0, weaponId: null, weapon: null, trail: null, land: 0, flinch: 0, wasAir: false };
  const tipA = new THREE.Vector3(), tipB = new THREE.Vector3();

  return {
    node, hand, handL, shadow,
    setWeapon(w, fxGroup) {
      if (state.weaponId === w.id) return;
      state.weaponId = w.id;
      if (state.weapon) hand.remove(state.weapon);
      state.weapon = buildWeapon(w.id, w.color);
      // The grip sits in the fist, angled so the blade runs along the forearm.
      state.weapon.position.set(2.5, 0, 0);
      hand.add(state.weapon);
      if (state.trail) state.trail.clear();
      else state.trail = createTrail(fxGroup, w.color);
      state.trail.mesh.material.color.setHex(w.color);
    },

    update(p, dt, heights, mv, extra = {}) {
      // The head leads: it turns toward where you are aiming before the body
      // gets there, which is what stops a turn looking like a tank.
      const aimOff = angleGap(p.aimAngle, mv ? mv.face : p.aimAngle);
      const ground = heights.at(p.x, p.y);
      const lift = p.z || 0;
      node.position.set(p.x, ground + lift, p.y);
      shadow.position.set(p.x, ground + 0.7, p.y);
      shadow.material.opacity = 0.5 / (1 + lift / 55);
      shadow.scale.setScalar(1 / (1 + lift / 130));

      const air = !!(p.hop || p.leap || (mv && !mv.grounded) || lift > 0.5);
      // Landing absorbs in proportion to the fall: a hop barely dips, a drop
      // from the ridge buckles the knees.
      if (state.wasAir && !air) state.land = mv ? clamp(0.35 + mv.impact, 0.35, 1.5) : 1;
      state.wasAir = air;
      state.land = Math.max(0, state.land - dt * 4.5);
      state.flinch = p.hurtFlash > 0 ? 1 : Math.max(0, state.flinch - dt * 4);

      const sprinting = !!(mv && mv.sprinting);
      const walking = p.moveMag > 0.08 && !p.dead && !p.dashing && !air;
      if (walking) state.phase = (state.phase + dt * (1.5 + 0.8 * p.moveMag) * (sprinting ? 1.5 : 1)) % 1;
      const frame = Math.floor(state.phase * FRAMES) % FRAMES;

      const pose = bodyPose(p, extra, { walking, air, sprinting, frame, mv, land: state.land, flinch: state.flinch });
      pose.headTurn = clamp(aimOff, -0.7, 0.7);

      // --- place the body ----------------------------------------------------
      node.rotation.y = -(mv ? mv.face : p.aimAngle) + pose.spin;
      node.rotation.z = 0;
      rollPivot.rotation.z = pose.roll;
      rollPivot.position.y = HIP_Y + pose.rollLift;
      hips.position.y = pose.bodyY - state.land * 5;
      hips.position.x = pose.step;
      hips.rotation.y = pose.twist;
      // Lean: into the acceleration, back when braking, and banked into a turn.
      const drive = mv ? mv.accel * 0.16 : 0;
      const bank = mv ? mv.turn * 0.22 : 0;
      hips.rotation.z = -(pose.lean + drive);
      hips.rotation.x = bank;
      pelvis.rotation.y = pose.hipTurn;
      // The head keeps looking where you are aiming while the body turns.
      head.rotation.y = pose.headTurn - pose.twist * 0.6;

      swing(arms[0].upper, pose.armA, pose.armAOut);
      arms[0].fore.rotation.z = pose.elbowA;
      swing(arms[1].upper, pose.armB, pose.armBOut);
      arms[1].fore.rotation.z = pose.elbowB;

      const hipHeight = HIP_Y + pose.bodyY - state.land * 5;
      const feet = [pose.footNear, pose.footFar];
      const rolls = [pose.footNearRoll, pose.footFarRoll];
      for (let i = 0; i < 2; i++) {
        const f = feet[i];
        const L = legs[i];
        const { hip, knee } = legAngles(f.x, -hipHeight + f.y + SOLE);
        swing(L.thigh, hip);
        L.shin.rotation.z = knee;
        L.boot.rotation.z = rolls[i] || 0;      // heel down, then toe off
      }

      // The cloak trails whatever the body just did.
      const flow = pose.cloak;
      for (let i = 0; i < cloakSegs.length; i++) {
        cloakSegs[i].rotation.z = flow * (0.35 + i * 0.22);
        cloakSegs[i].rotation.x = Math.sin(performance.now() * 0.002 + i) * 0.03;
      }

      // The weapon's trail, while a swing is actually live.
      if (state.trail && state.weapon) {
        if (p.attack && p.attack.phase === 'active') {
          state.weapon.updateMatrixWorld(true);
          tipA.set(8, 0, 0).applyMatrix4(state.weapon.matrixWorld);
          tipB.set(56, 0, 0).applyMatrix4(state.weapon.matrixWorld);
          state.trail.push(tipA, tipB);
        } else {
          state.trail.fade();
        }
      }
    },
  };
}

/**
 * The whole body's pose for this frame, in one place.
 *
 * Arm angles: 0 hangs straight down, +90 degrees is straight forward, +180 is
 * straight overhead. `out` swings the arm away from the body.
 *
 * ELBOWS ARE POSITIVE. With the upper arm hanging, a positive rotation carries
 * the forearm forward and up - which is the only way an elbow bends. Negative
 * would hyperextend it backwards, which is what the first pass did to every
 * pose in this file.
 */
function bodyPose(p, extra, s) {
  const o = {
    armA: 0.12, armAOut: 0.12, elbowA: 0.25,      // sword arm
    armB: 0.1, armBOut: -0.12, elbowB: 0.3,       // off hand
    twist: 0, lean: 0, step: 0, spin: 0, bodyY: 0,
    roll: 0, rollLift: 0, cloak: 0, hipTurn: 0, headTurn: 0,
    footNear: { x: 4, y: 0 }, footFar: { x: -3.5, y: 0 },
    footNearRoll: 0, footFarRoll: 0,
  };

  // --- legs and the body's carriage ---------------------------------------
  if (p.dead) {
    o.footNear = { x: 4, y: 0 };
    o.footFar = { x: -4, y: 0 };
    o.lean = 1.3;
    return o;
  }
  if (p.dashing) {
    // The dodge roll: tucked up, tumbling forward along the way you travel.
    const k = 1 - clamp(p.dashT / 0.17, 0, 1);
    o.roll = -k * Math.PI * 2;
    o.rollLift = Math.sin(k * Math.PI) * 8;
    o.footNear = { x: 8, y: 12 };
    o.footFar = { x: 1, y: 14 };
    o.armA = 1.9; o.elbowA = 1.5;
    o.armB = 2.0; o.elbowB = 1.6;
    o.bodyY = -5;
    o.cloak = -0.5;
    return o;
  }
  if (s.air) {
    const rising = s.mv ? s.mv.vz > 0 : false;
    const push = s.mv ? s.mv.pushOff : 0;
    if (push > 0.05) {
      // The push-off: legs driving down, body stretched, arms thrown up.
      o.footNear = { x: 2, y: 2 };
      o.footFar = { x: -2, y: 1 };
      o.bodyY = 3 * push;
      o.armA = 0.9 + push * 0.6; o.armB = 1.0 + push * 0.7;
      o.lean = 0.12;
      o.cloak = -0.6;
      return o;
    }
    o.footNear = rising ? { x: 9, y: 12 } : { x: 6, y: 4 };
    o.footFar = rising ? { x: -5, y: 14 } : { x: -7, y: 6 };
    o.lean = rising ? 0.1 : -0.05;
    o.armA = rising ? 0.7 : 0.35;
    o.armB = rising ? 0.9 : 0.5;
    o.armBOut = -0.5;
    o.cloak = rising ? -0.55 : -0.3;
  } else if (s.walking) {
    const u = s.frame / FRAMES;
    const reach = s.sprinting ? 15 : 10.5;
    const lift = s.sprinting ? 12 : 8;
    o.footNear = footAt(u, reach, lift);
    o.footFar = footAt((u + 0.5) % 1, reach, lift);
    o.bodyY = BOB[s.frame] * (s.sprinting ? 1.4 : 1);
    o.lean = s.sprinting ? 0.22 : 0.06;
    o.cloak = s.sprinting ? -0.45 : -0.18;
    // The hips lead and the shoulders answer: the pelvis turns with the leg
    // that is reaching, the chest counter-turns, and that opposition is most
    // of what makes a walk look like a person rather than a doll on rails.
    o.hipTurn = (o.footNear.x / reach) * (s.sprinting ? 0.22 : 0.13);
    o.twist -= o.hipTurn * 1.5;
    // Heel strikes first, toe pushes off last.
    o.footNearRoll = -o.footNear.x * 0.035;
    o.footFarRoll = -o.footFar.x * 0.035;
    // Arms counter-swing against the legs, and the elbows bend as they come up.
    o.armA = 0.12 + o.footFar.x * (s.sprinting ? 0.055 : 0.032);
    o.armB = 0.1 + o.footNear.x * (s.sprinting ? 0.06 : 0.035);
    o.elbowA = 0.25 + Math.max(0, o.footFar.x) * (s.sprinting ? 0.05 : 0.025);
    o.elbowB = 0.3 + Math.max(0, o.footNear.x) * (s.sprinting ? 0.055 : 0.03);
  } else {
    // At rest: weight on one leg, a slow breath.
    o.bodyY = Math.sin(performance.now() * 0.0015) * 0.6;
    o.footNear = { x: 4.5, y: 0 };
    o.footFar = { x: -4, y: 0 };
  }

  if (s.flinch > 0) { o.lean -= 0.18 * s.flinch; o.step -= 2 * s.flinch; }

  // --- what the arms are doing --------------------------------------------
  const id = p.weapon ? p.weapon.id : 'blade';
  if (id === 'blade') swordArms(p, extra, o, s);
  else genericArms(p, o);
  return o;
}

/**
 * The sword, following the owner's animation notes. A low guard at rest, a
 * three-hit light combo whose hits read differently, a charged blow held at
 * the top of its wind-up, and a jumping attack that lands as a plunge.
 */
function swordArms(p, extra, o, s) {
  // A fighter's rest: bladed stance, weapon low and out, off hand forward.
  const guard = () => {
    o.armA = 0.5; o.armAOut = 0.45; o.elbowA = 0.55;
    o.armB = 0.55; o.armBOut = -0.5; o.elbowB = 0.9;
    o.twist += -0.22;
  };
  if (!s.air && !p.dashing && !p.dead) guard();

  if (extra.charging) {
    // Wound back over the shoulder and held there, weight on the back foot.
    const k = extra.chargeFrac;
    o.armA = 2.1 + k * 0.55;
    o.armAOut = 0.55;
    o.elbowA = 0.8 + k * 0.35;
    o.armB = 0.9; o.armBOut = -0.7; o.elbowB = 1.2;
    o.twist = -0.45 - k * 0.4;
    o.lean = -0.12 - k * 0.1;
    o.step = -3.5 * k;
    o.cloak = 0.25;
    return;
  }
  if (extra.plunging) {
    // Both hands overhead, point down, waiting for the ground.
    o.armA = 3.0; o.armAOut = 0.1; o.elbowA = 0.15;
    o.armB = 2.85; o.armBOut = -0.25; o.elbowB = 0.3;
    o.lean = -0.2;
    o.cloak = -0.7;
    return;
  }

  const at = p.attack;
  if (!at) return;
  const total = Math.max(0.0001, (at.step[at.phase] || 0.0001) / p.stats.attackSpeed);
  const k = 1 - clamp(at.t / total, 0, 1);            // 0 at the phase's start

  if (at.step.spin) {
    // Hit three and the Rending Spin: the body turns through the blow with the
    // blade held out at the end of a straight arm.
    const turns = at.isSpecial ? 1.5 : 1;
    o.armA = 1.55; o.armAOut = 0.9; o.elbowA = 0.1;
    o.armB = 0.9; o.armBOut = -0.8; o.elbowB = 0.7;
    if (at.phase === 'windup') { o.spin = -0.6 * k; o.twist = -0.7 * k; o.lean = 0.08; }
    else if (at.phase === 'active') { o.spin = -0.6 - turns * Math.PI * 2 * k; o.lean = 0.16; }
    else {
      o.spin = -0.6 - turns * Math.PI * 2;
      o.armA = 1.55 - 1.05 * k; o.armAOut = 0.9 - 0.45 * k;
      o.lean = 0.16 * (1 - k);
    }
    return;
  }

  // The light hits. The first falls from the sword shoulder; the second answers
  // it back across the body, so a combo reads as two different swings.
  const mirror = (at.index | 0) % 2 === 1 ? -1 : 1;
  if (at.phase === 'windup') {
    o.armA = 0.5 + 2.1 * k;                  // up and behind the head
    o.armAOut = (0.45 + 0.5 * k) * mirror;
    o.elbowA = 0.55 + 0.5 * k;
    o.twist = -0.55 * k * mirror;
    o.lean = -0.08 * k;
    o.cloak = 0.2 * k;
  } else if (at.phase === 'active') {
    o.armA = 2.6 - 2.0 * k;                  // down through the arc
    o.armAOut = (0.95 - 1.5 * k) * mirror;
    o.elbowA = 1.05 - 0.85 * k;
    o.twist = (-0.55 + 1.15 * k) * mirror;
    o.lean = 0.16 * Math.sin(k * Math.PI);
    o.step = 6 * k;
    o.cloak = -0.35;
  } else {
    o.armA = 0.6 + (0.5 - 0.6) * k;
    o.armAOut = (-0.55 + 1.0 * k) * mirror;
    o.elbowA = 0.2 + 0.35 * k;
    o.twist = (0.6 * (1 - k)) * mirror;
    o.step = 6 * (1 - k);
  }
}

/** The other weapons keep a plain hold until each gets its own set. */
function genericArms(p, o) {
  const id = p.weapon ? p.weapon.id : '';
  const at = p.attack;
  if (p.aiming || (p.charging && id === 'bow')) {
    o.armA = 1.55; o.armAOut = -0.15; o.elbowA = 0.1;
    o.armB = 1.5; o.armBOut = -0.45; o.elbowB = 0.6;
    o.twist = -0.4;
    return;
  }
  if (!at) { o.armA = 0.3; o.armB = 0.25; return; }
  const total = Math.max(0.0001, (at.step[at.phase] || 0.0001) / p.stats.attackSpeed);
  const k = 1 - clamp(at.t / total, 0, 1);
  if (at.phase === 'windup') { o.armA = 0.4 + 1.9 * k; o.twist = -0.4 * k; }
  else if (at.phase === 'active') { o.armA = 2.3 - 1.8 * k; o.twist = -0.4 + 0.8 * k; o.step = 5 * k; }
  else { o.armA = 0.5 + 0.2 * k; o.twist = 0.4 * (1 - k); }
  o.elbowA = 0.3;
}
