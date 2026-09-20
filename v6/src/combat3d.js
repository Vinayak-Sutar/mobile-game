// The parts of fighting that only exist in three dimensions.
//
// Version 5's attack state machine already runs the light combo: press, and it
// steps through the weapon's chain with its own wind-up, active and recovery
// timings. Two things it has no idea about, because they need height and a
// held button, are added here, following the owner's animation notes:
//
//   - the CHARGED attack: hold the heavy button and the character winds the
//     blade back and holds it there; let go and the wound-up blow goes off;
//   - the JUMPING attack: swing while airborne and the blade goes overhead,
//     stays there through the fall, and comes down as a plunge when you land.
//
// Both are driven through the simulation's own input flags and its own hitbox
// spawner, so the damage still comes from one place.

import { input } from '../../v5/src/input.js';
import { groundSlam } from '../../v5/src/weapons.js';
import { burst, ring, shake, hitstop } from '../../v5/src/fx.js';
import { sfx } from '../../v5/src/audio.js';
import { clamp } from '../../v5/src/util.js';

export const CHARGE = {
  min: 0.18,          // held less than this: just release the ordinary blow
  full: 0.75,         // held this long: fully wound up
  slamRadius: 150,
  slamDamage: 46,
  slamKnock: 520,
};

export const PLUNGE = {
  radius: 130,
  damage: 38,
  knock: 460,
};

export function createCombat() {
  return {
    charging: false,
    charge: 0,
    chargeReady: false,
    plunging: false,
    plungeArmed: false,
  };
}

/**
 * Runs before the simulation each tick. `held` carries the two buttons this
 * layer owns: light (left mouse) and heavy (right mouse).
 */
export function updateCombat3d(c, p, dt, mv, held) {
  if (!p || p.dead) {
    c.charging = false;
    c.plunging = false;
    return;
  }

  // --- the jumping attack ----------------------------------------------------
  // A press in the air is not an ordinary swing: the blade goes up and waits
  // for the ground. The simulation never sees the press, so it never starts a
  // normal combo mid-air.
  if (!mv.grounded && input.attackPressed && !c.plunging) {
    c.plunging = true;
    c.plungeArmed = true;
    input.attackPressed = false;
    input.attack = false;
    sfx.swing(0.7);
  }
  if (c.plunging) {
    // Hold the swing until the feet touch down.
    input.attackPressed = false;
    input.attack = false;
    if (mv.grounded) {
      c.plunging = false;
      if (c.plungeArmed) {
        c.plungeArmed = false;
        groundSlam(p, p.x, p.y, PLUNGE.radius, PLUNGE.damage, PLUNGE.knock, 1);
        ring(p.x, p.y, { r0: 12, r1: PLUNGE.radius, color: p.weapon.color, life: 0.34, width: 7 });
        burst(p.x, p.y, { count: 20, color: '#cfc6b4', speed: 260, size: 4, life: 0.5, drag: 4 });
        shake(0.38);
        hitstop(0.05);
        sfx.explode();
      }
    }
    return;
  }

  // --- the charged attack ----------------------------------------------------
  // Holding the heavy button winds the blade back; the simulation's own
  // special goes off on the release, so the swing that lands is still its.
  if (held.heavy && mv.grounded && !p.attack) {
    if (!c.charging) {
      c.charging = true;
      c.charge = 0;
      c.chargeReady = false;
    }
    c.charge += dt;
    if (c.charge >= CHARGE.full && !c.chargeReady) {
      c.chargeReady = true;
      ring(p.x, p.y, { r0: 44, r1: 22, color: p.weapon.color, life: 0.3, width: 3 });
      sfx.ui();
    }
    if (Math.random() < dt * 22) {
      const a = Math.random() * Math.PI * 2;
      const d = 26 + (1 - clamp(c.charge / CHARGE.full, 0, 1)) * 26;
      burst(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, {
        count: 1, color: p.weapon.color, speed: 24, size: 3, life: 0.3, drag: 2,
      });
    }
    // The press itself must not reach the simulation while winding up.
    input.specialPressed = false;
    return;
  }

  if (c.charging) {
    // Released: a proper wind-up sends the heavy blow, a twitch just stops.
    const wound = c.charge;
    c.charging = false;
    c.charge = 0;
    c.chargeReady = false;
    if (wound >= CHARGE.min) {
      input.specialPressed = true;          // the weapon's own special swing
      if (wound >= CHARGE.full) {
        // Fully wound: the blow also breaks the ground where it lands.
        groundSlam(p, p.x + Math.cos(p.aimAngle) * 40, p.y + Math.sin(p.aimAngle) * 40,
          CHARGE.slamRadius, CHARGE.slamDamage, CHARGE.slamKnock, 1);
        shake(0.3);
        hitstop(0.04);
      }
    }
  }
}

/** How far through the wind-up the charge is, 0..1, for the animation. */
export function chargeFrac(c) {
  return clamp(c.charge / CHARGE.full, 0, 1);
}
