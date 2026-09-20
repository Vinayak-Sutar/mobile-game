// The third-person camera: a spring arm behind the player.
//
// Yaw and pitch come from the mouse (under pointer lock) or the right stick.
// The arm follows the player's shoulder with a critically damped spring, so it
// lags a little and settles without wobbling, and it pulls in when something
// solid would come between the camera and the player. The camera never rolls.
//
// Screen shake is the 2D game's `fx.shakeX/shakeY`, which are screen-space
// pixels. They are converted here into camera-local offsets scaled by how far
// away the camera is, so a shake displaces the picture by the same fraction of
// the screen as it does in 2D.

import * as THREE from '../vendor/three.module.js';
import { clamp } from '../../v5/src/util.js';
import { fx } from '../../v5/src/fx.js';

const PITCH_MIN = -0.62, PITCH_MAX = 0.42;      // radians from the horizon
const DIST_MIN = 70, DIST_MAX = 420;
const SHOULDER = 40;                            // pivot height above the feet

// Scratch vectors, so the frame allocates nothing.
const vPivot = new THREE.Vector3();
const vWant = new THREE.Vector3();
const vRight = new THREE.Vector3();
const vUp = new THREE.Vector3();

export function createCameraRig(camera) {
  const rig = {
    yaw: Math.PI,            // looking north (-z), the way a level starts
    pitch: -0.18,
    dist: 190,
    distWanted: 190,
    pivot: new THREE.Vector3(0, SHOULDER, 0),
    sensitivity: 0.0026,
    invertY: false,
    mode: 'follow',          // follow | lockon | shoulder | scope
    fov: 55,
    /** Mouse or stick look, in pixels (or stick units scaled by the caller). */
    look(dx, dy) {
      this.yaw -= dx * this.sensitivity;
      this.pitch = clamp(this.pitch + (this.invertY ? dy : -dy) * this.sensitivity, PITCH_MIN, PITCH_MAX);
      if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
      if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
    },
    zoom(delta) {
      this.distWanted = clamp(this.distWanted + delta, DIST_MIN, DIST_MAX);
    },
    /** The ground-plane basis the movement and aim code works in. */
    basis() {
      // Forward is where the camera looks, flattened onto the ground. In sim
      // coordinates (x, y) where y is world z.
      const fx0 = -Math.sin(this.yaw), fy0 = -Math.cos(this.yaw);
      return { fx: fx0, fy: fy0, rx: -fy0, ry: fx0 };
    },
    /**
     * focus: { x, y, z } in world units (x, z from the sim, y the feet height).
     * blocked(from, to) -> distance at which the view is blocked, or 0.
     */
    update(dt, focus, blocked = null) {
      const f = 1 - Math.exp(-9 * dt);
      vPivot.set(focus.x, focus.y + SHOULDER, focus.z);
      this.pivot.lerp(vPivot, f);

      let dist = this.distWanted;
      if (blocked) {
        const hit = blocked(this.pivot, this.yaw, this.pitch, dist);
        if (hit > 0) dist = Math.max(DIST_MIN * 0.5, hit);
      }
      // Pull in at once, ease back out, so the player is never hidden.
      this.dist = dist < this.dist ? dist : this.dist + (dist - this.dist) * (1 - Math.exp(-4 * dt));

      const cp = Math.cos(this.pitch);
      vWant.set(
        this.pivot.x + Math.sin(this.yaw) * cp * this.dist,
        this.pivot.y - Math.sin(this.pitch) * this.dist,
        this.pivot.z + Math.cos(this.yaw) * cp * this.dist,
      );
      camera.position.copy(vWant);
      camera.lookAt(this.pivot);

      // Shake: the same fraction of the screen as the 2D game's pixel shake.
      if (fx.trauma > 0.001) {
        const k = (this.dist * Math.tan((this.fov * Math.PI) / 360) * 2) / 600;
        camera.matrixWorld.extractBasis(vRight, vUp, vWant);
        camera.position.addScaledVector(vRight, fx.shakeX * k);
        camera.position.addScaledVector(vUp, fx.shakeY * k);
      }
      if (camera.fov !== this.fov) {
        camera.fov = this.fov;
        camera.updateProjectionMatrix();
      }
    },
  };
  return rig;
}
