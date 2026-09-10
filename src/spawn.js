// Factories for the short-lived things combat creates: projectiles, melee
// hitboxes and floor pickups.

import { world } from './state.js';

export function spawnProjectile(o) {
  const p = {
    x: 0, y: 0, vx: 0, vy: 0,
    r: 7,
    damage: 10,
    knockback: 90,
    friendly: false,
    pierce: 0,            // number of extra enemies it can pass through
    bounces: 0,           // wall ricochets remaining
    life: 3,
    maxLife: 3,
    color: '#ff6b6b',
    shape: 'orb',         // orb | arrow | shard | shield
    homing: 0,            // radians/sec of turn toward the player
    delay: 0,             // seconds parked in place before it moves (feather mines)
    launchSpeed: 0,       // speed on leaving the park; 0 keeps vx/vy
    launchAtPlayer: false,// re-aim at the player the moment it launches
    accel: 0,             // u/s^2 along its heading (negative brakes)
    minSpeed: 40,
    maxSpeed: 900,
    turn: 0,              // rad/s: bends the path (curving spiral arms)
    quiet: false,         // tiny fizzle, for patterns that fire hundreds
    spin: 0,
    rot: 0,
    trailEvery: 0.03,
    trailTimer: 0,
    hits: null,           // lazily created Set of entities already struck
    owner: null,
    srcType: null,
    onExpire: null,
    dead: false,
    ...o,
  };
  p.maxLife = p.life;
  world.projectiles.push(p);
  return p;
}

export function spawnHitbox(o) {
  const h = {
    shape: 'arc',         // arc | rect | circle
    x: 0, y: 0,
    angle: 0,
    arc: Math.PI,         // for arc
    radius: 100,          // for arc / circle
    len: 160, wid: 40,    // for rect
    damage: 10,
    knockback: 200,
    life: 0.1,
    maxLife: 0.1,
    friendly: true,
    follow: null,         // entity whose position the hitbox tracks
    offset: 0,            // distance along `angle` from the followed entity
    hits: new Set(),
    maxHits: Infinity,
    hitCount: 0,
    onHit: null,
    dead: false,
    ...o,
  };
  h.maxLife = h.life;
  h.hits = new Set();
  world.hitboxes.push(h);
  return h;
}

export function spawnPickup(o) {
  const p = {
    x: 0, y: 0, vx: 0, vy: 0,
    r: 11,
    type: 'gold',         // gold | heal
    value: 1,
    life: 26,
    bob: Math.random() * Math.PI * 2,
    magnet: false,
    dead: false,
    ...o,
  };
  world.pickups.push(p);
  return p;
}
