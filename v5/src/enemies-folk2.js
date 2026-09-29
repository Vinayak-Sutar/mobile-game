// Folk enemies, second wave: each one asks for a skill the others don't.
//
//   Kappa   (Japan)          grappler   bait its leap; a miss spills its dish
//   Preta   (India, Buddhist) glutton   swallows your shots, spews them back
//   Draugr  (Norse)           revenant  rises again unless you finish the grave
//   Duende  (Iberia, Latin America) prankster  hides your gold somewhere else
//
// Design notes, from the enemy-design research (journal §16.2):
//   - one job and one tell each, readable from the silhouette;
//   - each has a counter a player can find on purpose - a dodge, a melee
//     blow, a finishing hit, a chase - so it rewards knowing it;
//   - none of them can hurt without a telegraph first.

import { world, arenaBounds } from './state.js';
import { TAU, clamp, rand, dist, angleTo, circleArc } from './util.js';
import { damagePlayer } from './combat.js';
import { burst, ring, shake, damageText } from './fx.js';
import { sfx } from './audio.js';
import { player, stepToward, stepAway, strafe, collideWorld, telegraphRing } from './ai.js';
import { spawnProjectile, spawnPickup } from './spawn.js';
import { spawnHazard } from './hazards.js';

// --- the Kappa -------------------------------------------------------------------
// A river imp with a dish of water on its head: its strength. It crouches, then
// leaps on you and holds you under (a dash breaks free). If the leap misses,
// it lands off balance, the water spills - and it is helpless.

const KAPPA = {
  r: 17, hp: 64, speed: 150, mass: 1.4, cost: 4, minDepth: 2, color: '#6fbf73',
  role: 'grappler', damageBase: 10, maxPerWave: 2,
  init(e) { e.cd = rand(0.8, 1.6); e.sign = Math.random() < 0.5 ? 1 : -1; e.z = 0; },
  update(e, dt) {
    const p = player();
    if (!p) return;
    const d = dist(e.x, e.y, p.x, p.y);
    e.cd = Math.max(0, e.cd - dt);

    if (e.state === 'crouch') {
      // The tell: it squats, the dish glints, a ring tightens on it.
      e.t -= dt;
      e.face = angleTo(e.x, e.y, p.x, p.y);
      if (Math.random() < dt * 30) telegraphRing(e, 1 - e.t / 0.5, 50, '#9fe8ff');
      if (e.t <= 0) {
        e.state = 'leap'; e.t = 0.42;
        e.lx0 = e.x; e.ly0 = e.y;
        const a = angleTo(e.x, e.y, p.x, p.y), reach = Math.min(d, 220);
        e.lx1 = e.x + Math.cos(a) * reach; e.ly1 = e.y + Math.sin(a) * reach;
        sfx.dash();
      }
      return;
    }
    if (e.state === 'leap') {
      e.t -= dt;
      const k = clamp(1 - e.t / 0.42, 0, 1);
      e.x = e.lx0 + (e.lx1 - e.lx0) * k;
      e.y = e.ly0 + (e.ly1 - e.ly0) * k;
      e.z = Math.sin(k * Math.PI) * 60;
      if (e.t <= 0) {
        e.z = 0;
        collideWorld(e);
        const caught = dist(e.x, e.y, p.x, p.y) < e.r + p.r + 6 && !p.dashing && p.invuln <= 0;
        if (caught) {
          e.state = 'grab'; e.t = 1.0; e.tick = 0;
          p.heldUntil = world.runTime + 1.0;
          p.heldBy = e;
          damageText(p.x, p.y - p.r - 20, 'GRABBED - DASH!', { color: '#9fe8ff', size: 14 });
          sfx.splash();
        } else {
          // Off balance: the dish tips, the water is gone, and so is its strength.
          e.state = 'spill'; e.t = 1.8;
          burst(e.x, e.y - e.r, { count: 16, color: '#7fd0ff', speed: 180, size: 3.5, life: 0.5, gravity: 200, drag: 2 });
          damageText(e.x, e.y - e.r - 18, 'SPILLED', { color: '#9fe8ff', size: 14 });
          sfx.splash();
        }
      }
      return;
    }
    if (e.state === 'grab') {
      e.t -= dt;
      e.x = p.x - Math.cos(e.face) * (e.r + p.r - 4);
      e.y = p.y - Math.sin(e.face) * (e.r + p.r - 4);
      e.tick -= dt;
      if (e.tick <= 0 && e.t > 0.05) {
        e.tick = 0.34;
        // Held under: each squeeze lands even inside the usual hit-grace
        // (the hold is telegraphed by the crouch, and a dash ends it).
        p.invuln = 0;
        damagePlayer(Math.round(e.damage * 0.45), e.x, e.y, 'kappa');
      }
      // A dash breaks the hold and knocks it reeling.
      if (p.dashing || (p.heldUntil || 0) <= world.runTime || e.t <= 0) {
        if (p.heldBy === e) { p.heldUntil = 0; p.heldBy = null; }
        e.state = p.dashing ? 'reel' : 'chase';
        e.t = 0.7; e.cd = 2.2;
        if (p.dashing) damageText(e.x, e.y - e.r - 16, 'BROKE FREE', { color: '#ffffff', size: 13 });
      }
      return;
    }
    if (e.state === 'spill' || e.state === 'reel') {
      e.t -= dt;
      e.exposed = Math.max(e.exposed || 0, e.t);
      if (e.state === 'spill' && Math.random() < dt * 5) {
        burst(e.x, e.y - e.r, { count: 1, color: '#9fe8ff', speed: 30, size: 3, life: 0.5, gravity: -30, drag: 1 });
      }
      if (e.t <= 0) { e.state = 'chase'; e.exposed = 0; e.cd = 1.6; }
      return;
    }
    // Stalking: close in, circling.
    e.state = 'chase';
    if (d > 150) stepToward(e, p.x, p.y, e.speed, dt);
    else strafe(e, p.x, p.y, e.speed * 0.6, dt, e.sign);
    if (Math.random() < dt * 0.5) e.sign *= -1;
    e.face = angleTo(e.x, e.y, p.x, p.y);
    if (d < 200 && e.cd <= 0) { e.state = 'crouch'; e.t = 0.5; sfx.telegraph(); }
  },
  draw(e, ctx) {
    const z = e.z || 0;
    const crouch = e.state === 'crouch' ? 1 - e.t / 0.5 : 0;
    const spilled = e.state === 'spill';
    ctx.save();
    ctx.translate(e.x, e.y - z);
    ctx.rotate(e.face || 0);
    ctx.scale(1 + crouch * 0.12, 1 - crouch * 0.1);
    // Shell, then the green body, then the beak.
    ctx.fillStyle = '#4a6a3a';
    ctx.beginPath(); ctx.ellipse(-e.r * 0.3, 0, e.r * 0.85, e.r * 0.8, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.5;
    for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(-e.r * 0.9, k * e.r * 0.35); ctx.lineTo(e.r * 0.2, k * e.r * 0.35); ctx.stroke(); }
    ctx.fillStyle = e.tint;
    ctx.beginPath(); ctx.arc(e.r * 0.25, 0, e.r * 0.6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e0b040';
    ctx.beginPath(); ctx.moveTo(e.r * 0.8, -4); ctx.lineTo(e.r * 1.15, 0); ctx.lineTo(e.r * 0.8, 4); ctx.closePath(); ctx.fill();
    // The dish of water - full and shining, or empty.
    ctx.fillStyle = '#d8d0b0';
    ctx.beginPath(); ctx.arc(e.r * 0.2, 0, e.r * 0.34, 0, TAU); ctx.fill();
    ctx.fillStyle = spilled ? '#8a8270' : (crouch > 0 ? '#e0f8ff' : '#6fc8f0');
    ctx.beginPath(); ctx.arc(e.r * 0.2, 0, e.r * 0.25, 0, TAU); ctx.fill();
    ctx.restore();
  },
};

// --- the Preta -------------------------------------------------------------------
// A hungry ghost: a vast belly and a mouth like the eye of a needle, starving
// forever. Your arrows, bullets and spells don't hurt it - it swallows them.
// When its belly is full it heaves them all back out. Walk up and strike it:
// blades land hard on a starving thing.

const PRETA = {
  r: 20, hp: 92, speed: 62, mass: 2.4, cost: 5, minDepth: 3, color: '#c9b8e8',
  role: 'glutton', damageBase: 9, maxPerWave: 1,
  init(e) {
    e.belly = [];
    e.baseR = e.r;
    e.guardFn = (self, opts) => (opts.source === 'melee' || opts.source === 'dash' ? 1.5 : 1);
    // Called by projectiles.js when a friendly shot reaches it: swallowed whole.
    e.eats = (self, pr) => {
      if (self.state === 'heave') return false;
      self.belly.push(pr.color || '#ffffff');
      self.r = Math.min(self.baseR + 14, self.baseR + self.belly.length * 2);
      pr.onExpire = null;
      damageText(self.x, self.y - self.r - 12, 'GULP', { color: '#c9b8e8', size: 12 });
      sfx.hit(0.5);
      if (self.belly.length === 1) self.fullT = 3.5;
      return true;
    };
  },
  update(e, dt) {
    const p = player();
    if (!p) return;
    if (e.state === 'bloat') {
      // The tell: the belly swells and shakes.
      e.t -= dt;
      e.r = e.baseR + 14 + Math.sin(world.runTime * 40) * 2;
      if (Math.random() < dt * 30) telegraphRing(e, 1 - e.t / 0.7, 60, '#e0c8ff');
      if (e.t <= 0) {
        e.state = 'heave'; e.t = 0.4;
        const n = Math.min(18, 5 + e.belly.length * 2);
        const aim = angleTo(e.x, e.y, p.x, p.y);
        for (let k = 0; k < n; k++) {
          const a = aim + (k / (n - 1) - 0.5) * 1.7;
          spawnProjectile({
            x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r,
            vx: Math.cos(a) * 230, vy: Math.sin(a) * 230,
            r: 7, damage: e.damage, color: e.belly[k % e.belly.length] || e.color, shape: 'orb', life: 3, srcType: 'preta',
          });
        }
        burst(e.x, e.y, { count: 14, color: '#e0c8ff', speed: 200, size: 4, life: 0.4, drag: 4 });
        sfx.shoot();
        e.belly = [];
        e.r = e.baseR;
      }
      return;
    }
    if (e.state === 'heave') {
      e.t -= dt;
      if (e.t <= 0) e.state = 'chase';
      return;
    }
    // Drifting after you, hungry.
    e.state = 'chase';
    stepToward(e, p.x, p.y, e.speed, dt);
    e.face = angleTo(e.x, e.y, p.x, p.y);
    if (e.belly.length) {
      e.fullT -= dt;
      if (e.belly.length >= 6 || e.fullT <= 0) { e.state = 'bloat'; e.t = 0.7; sfx.telegraph(); }
    }
  },
  draw(e, ctx) {
    const bob = Math.sin(world.runTime * 2 + e.seed) * 3;
    ctx.save();
    ctx.translate(e.x, e.y + bob);
    // The belly, the swallowed shots glowing inside it.
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = e.tint;
    ctx.beginPath(); ctx.ellipse(0, e.r * 0.15, e.r, e.r * 0.9, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    e.belly.forEach((c, i) => {
      const a = i * 2.4 + world.runTime;
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(Math.cos(a) * e.r * 0.45, e.r * 0.15 + Math.sin(a) * e.r * 0.4, 3, 0, TAU); ctx.fill();
    });
    // A thin neck, a small head, the needle mouth.
    ctx.strokeStyle = e.tint; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -e.r * 0.6); ctx.lineTo(0, -e.r * 1.05); ctx.stroke();
    ctx.fillStyle = e.tint;
    ctx.beginPath(); ctx.arc(0, -e.r * 1.2, 6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a1a3a';
    ctx.beginPath(); ctx.arc(-2, -e.r * 1.24, 1.2, 0, TAU); ctx.arc(2, -e.r * 1.24, 1.2, 0, TAU); ctx.fill();
    ctx.fillRect(-0.5, -e.r * 1.14, 1, 2);
    ctx.restore();
  },
};

// --- the Draugr -------------------------------------------------------------------
// The restless dead of the sagas, rising from its mound. It swings an axe down
// a marked arc. Strike it down and it falls into its grave - but unless you
// finish the grave while it lies there, it rises again.

const GRAVE_TIME = 2.8;

const DRAUGR = {
  r: 22, hp: 104, speed: 82, mass: 3, cost: 5, minDepth: 3, color: '#8fa6a0',
  role: 'heavy', damageBase: 15, maxPerWave: 2,
  init(e) { e.cd = rand(0.8, 1.6); e.hpFloor = 1; e.rose = false; },
  update(e, dt) {
    const p = player();
    if (!p) return;
    e.cd = Math.max(0, e.cd - dt);

    // Struck down: into the grave, where one more blow lays it to rest.
    if (e.hp <= 1 && !e.rose && e.state !== 'grave') {
      e.state = 'grave'; e.t = GRAVE_TIME;
      e.hpFloor = undefined;
      e.hp = 1;
      damageText(e.x, e.y - e.r - 16, 'FINISH IT', { color: '#bfe8ff', size: 14 });
      burst(e.x, e.y, { count: 14, color: '#6a7a70', speed: 160, size: 4, life: 0.4, drag: 4 });
      sfx.thud();
      return;
    }
    if (e.state === 'grave') {
      e.t -= dt;
      if (e.t <= 0) {
        // It rises: half its strength back, and it will not fall twice.
        e.rose = true;
        e.hp = Math.round(e.maxHp * 0.5);
        e.state = 'rise'; e.t = 0.6;
        ring(e.x, e.y, { r0: 10, r1: 90, color: '#bfe8ff', life: 0.4, width: 4 });
        damageText(e.x, e.y - e.r - 16, 'IT RISES', { color: '#bfe8ff', size: 14 });
        shake(0.2);
        sfx.roar(1.4);
      }
      return;
    }
    if (e.state === 'rise') { e.t -= dt; if (e.t <= 0) e.state = 'chase'; return; }
    if (e.state === 'wind') {
      e.t -= dt;
      if (e.t <= 0) {
        e.state = 'recover'; e.t = 0.6;
        if (circleArc(p.x, p.y, p.r * 0.6, e.x, e.y, e.aim, 1.6, 120)) damagePlayer(e.damage, e.x, e.y, 'draugr');
        burst(e.x + Math.cos(e.aim) * 60, e.y + Math.sin(e.aim) * 60, { count: 10, color: '#d8e0e8', speed: 220, size: 3, life: 0.3, drag: 5, shape: 'spark' });
        sfx.swing(1.3);
        shake(0.15);
      }
      return;
    }
    if (e.state === 'recover') { e.t -= dt; if (e.t <= 0) { e.state = 'chase'; e.cd = 1.2; } return; }

    e.state = 'chase';
    const d = dist(e.x, e.y, p.x, p.y);
    stepToward(e, p.x, p.y, e.speed * (e.rose ? 1.2 : 1), dt);
    if (d < 130 && e.cd <= 0) {
      e.state = 'wind'; e.t = 0.6;
      e.aim = angleTo(e.x, e.y, p.x, p.y);
      e.face = e.aim;
      spawnHazard({ kind: 'cone', x: e.x, y: e.y, angle: e.aim, arc: 1.6, r: 120, delay: 0.6, color: '#bfe8ff', owner: e, source: 'draugr' });
      sfx.telegraph();
    }
  },
  draw(e, ctx) {
    if (e.state === 'grave') {
      // A burial mound, with a ring running out: finish it before it closes.
      const k = e.t / GRAVE_TIME;
      ctx.fillStyle = '#4a4238';
      ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r * 1.2, e.r * 0.7, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#6a7a70';
      ctx.beginPath(); ctx.ellipse(e.x, e.y - 4, e.r * 0.7, e.r * 0.35, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#bfe8ff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 10, -Math.PI / 2, -Math.PI / 2 + k * TAU); ctx.stroke();
      return;
    }
    const wind = e.state === 'wind' ? 1 - e.t / 0.6 : 0;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.face || 0);
    ctx.fillStyle = e.tint;
    ctx.beginPath(); ctx.ellipse(-2, 0, e.r * 0.9, e.r * 0.8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(-e.r * 0.3, 0, e.r * 0.5, e.r * 0.65, 0, 0, TAU); ctx.fill();
    // The axe, raised as it winds up.
    ctx.rotate(-0.9 + wind * -0.6);
    ctx.fillStyle = '#6a4a30';
    ctx.fillRect(e.r * 0.4, -2, e.r * 0.9, 4);
    ctx.fillStyle = '#c8d0d8';
    ctx.beginPath(); ctx.moveTo(e.r * 1.2, -2); ctx.lineTo(e.r * 1.45, -9); ctx.lineTo(e.r * 1.45, 7); ctx.closePath(); ctx.fill();
    ctx.restore();
    // Grave-light eyes.
    ctx.fillStyle = '#bfe8ff';
    const fx = Math.cos(e.face || 0) * e.r * 0.5, fy = Math.sin(e.face || 0) * e.r * 0.5;
    ctx.beginPath(); ctx.arc(e.x + fx - 3, e.y + fy - 2, 2, 0, TAU); ctx.arc(e.x + fx + 3, e.y + fy - 2, 2, 0, TAU); ctx.fill();
  },
};

// --- the Duende -------------------------------------------------------------------
// A little trickster of Iberian and Latin American stories who hides things
// and leaves them somewhere unexpected. It darts in, lifts your gold and runs.
// Catch it and you get it back with interest; let it slip away and it hides
// the gold somewhere in the room, to be found a moment later.

const DUENDE = {
  r: 12, hp: 36, speed: 235, mass: 0.8, cost: 3, minDepth: 2.5, color: '#c89a4a',
  role: 'thief', damageBase: 0, maxPerWave: 1,
  init(e) { e.loot = 0; e.cd = rand(0.4, 1); e.sign = Math.random() < 0.5 ? 1 : -1; e.onDeath = duendeCaught; },
  update(e, dt) {
    const p = player();
    if (!p) return;
    const d = dist(e.x, e.y, p.x, p.y);
    e.cd = Math.max(0, e.cd - dt);
    e.face = angleTo(e.x, e.y, p.x, p.y);

    if (e.state === 'flee') {
      // Off with the sack, weaving; it won't wait for ever.
      e.t -= dt;
      stepAway(e, p.x, p.y, e.speed * 1.05, dt);
      strafe(e, p.x, p.y, e.speed * 0.5, dt, e.sign);
      if (Math.random() < dt * 1.5) e.sign *= -1;
      if (collideWorld(e) && Math.random() < 0.05) e.sign *= -1;
      if (Math.random() < dt * 8) burst(e.x, e.y, { count: 1, color: '#ffd45e', speed: 20, size: 2, life: 0.3, drag: 2, shape: 'spark' });
      if (e.t <= 0) {
        // It gets away - and hides the gold in the room, for you to find.
        if (e.loot > 0) {
          const b = arenaBounds();
          hidden.push({ x: rand(b.l + 60, b.r - 60), y: rand(b.t + 60, b.b - 60), loot: e.loot, at: world.runTime + 5, room: world.room });
        }
        burst(e.x, e.y, { count: 16, color: '#c89a4a', speed: 180, size: 4, life: 0.4, drag: 4 });
        damageText(e.x, e.y - 20, 'HIDDEN!', { color: '#c89a4a', size: 14 });
        sfx.whirr();
        e.dead = true;                          // slipped away: no kill, no drops
      }
      return;
    }
    // Sneaking in to lift your purse.
    e.state = 'chase';
    stepToward(e, p.x, p.y, e.speed, dt);
    if (d < e.r + p.r + 4 && e.cd <= 0) {
      const take = Math.min(world.gold, 12 + Math.round((world.depth || 1) * 2));
      world.gold -= take;
      e.loot = take;
      e.state = 'flee'; e.t = 7;
      damageText(p.x, p.y - p.r - 20, take ? `-${take} GOLD` : 'NOTHING TO TAKE', { color: '#ffd45e', size: 14 });
      sfx.coin();
    }
  },
  draw(e, ctx) {
    ctx.save();
    ctx.translate(e.x, e.y + Math.sin(world.runTime * 14 + e.seed) * 1.5);
    ctx.fillStyle = e.tint;
    ctx.beginPath(); ctx.arc(0, 2, e.r * 0.85, 0, TAU); ctx.fill();
    // A tall red cap.
    ctx.fillStyle = '#c83a3a';
    ctx.beginPath(); ctx.moveTo(-e.r * 0.7, -e.r * 0.2); ctx.lineTo(e.r * 0.7, -e.r * 0.2); ctx.lineTo(e.r * 0.2, -e.r * 1.4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2a1a10';
    ctx.beginPath(); ctx.arc(-3, 1, 1.6, 0, TAU); ctx.arc(3, 1, 1.6, 0, TAU); ctx.fill();
    // The sack, once it has something in it.
    if (e.loot > 0) {
      ctx.fillStyle = '#8a6a3a';
      ctx.beginPath(); ctx.arc(-e.r * 0.9, e.r * 0.3, e.r * 0.55, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffd45e';
      ctx.fillRect(-e.r * 0.95, e.r * 0.05, 3, 3);
    }
    ctx.restore();
  },
};

// Gold a Duende got away with, waiting to turn up somewhere in the room.
const hidden = [];

/** Called every frame (enemies.js): hidden gold reappears after a while. */
export function tickHidden() {
  for (let i = hidden.length - 1; i >= 0; i--) {
    const h = hidden[i];
    if (h.room !== world.room) { hidden.splice(i, 1); continue; }
    if (world.runTime < h.at) continue;
    hidden.splice(i, 1);
    ring(h.x, h.y, { r0: 30, r1: 6, color: '#ffd45e', life: 0.4, width: 3 });
    damageText(h.x, h.y - 20, 'FOUND IT', { color: '#ffd45e', size: 13 });
    for (let k = 0; k < Math.max(1, Math.round(h.loot / 3)); k++) {
      const a = rand(0, TAU);
      spawnPickup({ x: h.x, y: h.y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, type: 'gold', value: 3 });
    }
  }
}

/** Catch the Duende: it drops what it stole, and half again. */
function duendeCaught(e) {
  if (!e.loot) return;
  const give = Math.round(e.loot * 1.5);
  for (let k = 0; k < Math.max(1, Math.round(give / 3)); k++) {
    const a = rand(0, TAU);
    spawnPickup({ x: e.x, y: e.y, vx: Math.cos(a) * 130, vy: Math.sin(a) * 130, type: 'gold', value: 3 });
  }
  damageText(e.x, e.y - 24, 'RECOVERED', { color: '#ffd45e', size: 14 });
}

export const FOLK_DEFS2 = { kappa: KAPPA, preta: PRETA, draugr: DRAUGR, duende: DUENDE };
