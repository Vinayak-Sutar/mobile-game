// Update + draw for the transient combat objects: projectiles, melee
// hitboxes and floor pickups.

import { world, arenaBounds } from './state.js';
import {
  TAU, clamp, rand, dist, angleTo, angleDiff, normalize, polygon,
  circleRect, circleArc, circleOrientedRect,
} from './util.js';
import { dealDamage, damagePlayer, healPlayer, nearestEnemy } from './combat.js';
import { burst, trail, damageText, shake } from './fx.js';
import { sfx } from './audio.js';
import { isParrying, perfectParry, parryStyle, reflectAngle } from './parry.js';

// --- projectiles -----------------------------------------------------------

// Against enemy shots the player's hurtbox is ~70% of their body. Every
// bullet-hell game does this: a graze that visibly misses must actually miss,
// or dense patterns feel like dice rolls rather than skill.
export const BULLET_HURTBOX = 0.72;

export function hostileProjectileCount() {
  let n = 0;
  for (const pr of world.projectiles) if (!pr.friendly) n++;
  return n;
}

export function updateProjectiles(dt) {
  const p = world.player;
  const b = arenaBounds();

  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    const pr = world.projectiles[i];
    // Wiped by a boss phase change or death: gone, with no expiry effect.
    if (pr.cleared) { world.projectiles.splice(i, 1); continue; }
    pr.life -= dt;
    if (pr.life <= 0 || pr.dead) {
      if (pr.onExpire) pr.onExpire(pr);
      fizzle(pr);
      world.projectiles.splice(i, 1);
      continue;
    }

    // Parked shots hang in the air (harmlessly drawn as "armed") and then
    // launch. The wait is part of the telegraph, so it never counts as life.
    if (pr.delay > 0) {
      pr.delay -= dt;
      pr.life += dt;
      if (pr.delay <= 0) {
        const sp = pr.launchSpeed || Math.hypot(pr.vx, pr.vy);
        const a = pr.launchAtPlayer && p ? angleTo(pr.x, pr.y, p.x, p.y) : Math.atan2(pr.vy, pr.vx);
        pr.vx = Math.cos(a) * sp;
        pr.vy = Math.sin(a) * sp;
      }
      continue;
    }

    if (pr.accel || pr.turn) {
      let sp = Math.hypot(pr.vx, pr.vy);
      let a = Math.atan2(pr.vy, pr.vx);
      if (pr.accel) sp = clamp(sp + pr.accel * dt, pr.minSpeed, pr.maxSpeed);
      if (pr.turn) a += pr.turn * dt;
      pr.vx = Math.cos(a) * sp;
      pr.vy = Math.sin(a) * sp;
    }

    const age = pr.maxLife - pr.life;

    // Homing: hostile shots curve toward the player, friendly ones toward foes.
    if (pr.homing > 0) {
      // A friendly shot may carry its own target (Minor Missiles spread out).
      const target = pr.friendly ? (pr.target && !pr.target.dead ? pr.target : nearestEnemy(pr.x, pr.y, 520)) : p;
      if (target) {
        const cur = Math.atan2(pr.vy, pr.vx);
        const want = angleTo(pr.x, pr.y, target.x, target.y);
        const turn = clamp(angleDiff(cur, want), -pr.homing * dt, pr.homing * dt);
        const sp = Math.hypot(pr.vx, pr.vy);
        pr.vx = Math.cos(cur + turn) * sp;
        pr.vy = Math.sin(cur + turn) * sp;
      }
    }

    // Thrown-and-returning weapons: brake, reverse, then vanish on catch.
    if (pr.boomerang && pr.owner) {
      if (age > 0.34) {
        const want = angleTo(pr.x, pr.y, pr.owner.x, pr.owner.y);
        const sp = Math.min(1100, Math.hypot(pr.vx, pr.vy) + 1600 * dt);
        pr.vx = lerpTo(pr.vx, Math.cos(want) * sp, 7 * dt);
        pr.vy = lerpTo(pr.vy, Math.sin(want) * sp, 7 * dt);
        // Re-arm so the return trip can hit the same targets again.
        if (!pr.rearmed) { pr.hits = null; pr.rearmed = true; }
        if (age > 0.5 && dist(pr.x, pr.y, pr.owner.x, pr.owner.y) < 34) {
          sfx.block();
          burst(pr.x, pr.y, { count: 8, color: pr.color, speed: 180, size: 3, life: 0.25, drag: 5 });
          world.projectiles.splice(i, 1);
          continue;
        }
      }
    }

    // Inside a Sigil of Stillness enemy bullets crawl at a quarter speed.
    const sm = pr.inSigil ? 0.25 : 1;
    pr.x += pr.vx * dt * sm;
    pr.y += pr.vy * dt * sm;
    pr.rot += (pr.spin || 0) * dt;

    if (pr.shape !== 'arrow' && pr.trailEvery < 5) {
      pr.trailTimer -= dt;
      if (pr.trailTimer <= 0) {
        pr.trailTimer = pr.trailEvery;
        trail(pr.x, pr.y, { color: pr.color, radius: pr.r * 0.9, life: 0.22 });
      }
    }

    // --- world collision ---
    let hitWall = false;
    if (pr.x < b.l + pr.r) { pr.x = b.l + pr.r; pr.vx = Math.abs(pr.vx); hitWall = true; }
    if (pr.x > b.r - pr.r) { pr.x = b.r - pr.r; pr.vx = -Math.abs(pr.vx); hitWall = true; }
    if (pr.y < b.t + pr.r) { pr.y = b.t + pr.r; pr.vy = Math.abs(pr.vy); hitWall = true; }
    if (pr.y > b.b - pr.r) { pr.y = b.b - pr.r; pr.vy = -Math.abs(pr.vy); hitWall = true; }

    if (world.room) {
      for (const o of world.room.obstacles) {
        if (circleRect(pr.x, pr.y, pr.r, o)) {
          // Bounce off the shallower axis of penetration.
          const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
          const dx = (pr.x - cx) / (o.w / 2 + pr.r);
          const dy = (pr.y - cy) / (o.h / 2 + pr.r);
          if (Math.abs(dx) > Math.abs(dy)) {
            pr.vx = Math.sign(dx) * Math.abs(pr.vx);
            pr.x = cx + Math.sign(dx) * (o.w / 2 + pr.r + 1);
          } else {
            pr.vy = Math.sign(dy) * Math.abs(pr.vy);
            pr.y = cy + Math.sign(dy) * (o.h / 2 + pr.r + 1);
          }
          hitWall = true;
          break;
        }
      }
    }

    if (hitWall) {
      if (pr.bounces > 0) {
        pr.bounces--;
        pr.hits = null;               // each ricochet can re-hit
        sfx.block();
        burst(pr.x, pr.y, { count: 8, color: pr.color, speed: 220, size: 3, life: 0.24, drag: 5, shape: 'spark' });
        shake(0.08);
        if (pr.retarget) {
          // Steer a ricochet toward the nearest foe so it feels smart.
          const t = nearestEnemy(pr.x, pr.y, 700);
          if (t) {
            const sp = Math.hypot(pr.vx, pr.vy);
            const a = angleTo(pr.x, pr.y, t.x, t.y);
            pr.vx = Math.cos(a) * sp;
            pr.vy = Math.sin(a) * sp;
          }
        }
      } else if (!pr.boomerang) {
        // A boulder bursts on the wall it hits, not only at the end of its throw.
        if (pr.onExpire) pr.onExpire(pr);
        fizzle(pr);
        world.projectiles.splice(i, 1);
        continue;
      }
    }

    // --- entity collision ---
    if (pr.friendly) {
      let consumed = false;
      for (const e of world.enemies) {
        if (e.dead || e.spawning || e.invuln) continue;
        if (pr.hits && pr.hits.has(e)) continue;
        if (dist(pr.x, pr.y, e.x, e.y) > pr.r + e.r) continue;

        if (!pr.hits) pr.hits = new Set();
        pr.hits.add(e);
        dealDamage(e, pr.damage, {
          knockback: pr.knockback,
          dir: Math.atan2(pr.vy, pr.vx),
          source: 'projectile',
          heavy: !!pr.heavyHit,
          element: pr.element || undefined,
        });
        if (pr.pierce > 0) pr.pierce--;
        else { consumed = true; break; }
      }
      if (consumed) {
        if (pr.onExpire) pr.onExpire(pr);     // a Fireball bursts on the foe it hits
        fizzle(pr);
        world.projectiles.splice(i, 1);
        continue;
      }
      // Charged arrows, thrown spears and shields shoot enemy bullets down.
      if (pr.breaker) breakBulletsNear(pr.x, pr.y, pr.r + 4, p);
    } else if (p && !p.dead) {
      // Trap arrows are neutral: they hit enemies in their path as well.
      if (pr.trap) {
        let hitE = null;
        for (const e of world.enemies) {
          if (e.dead || e.spawning || e.hidden) continue;
          if (dist(pr.x, pr.y, e.x, e.y) < pr.r + e.r) { hitE = e; break; }
        }
        if (hitE) {
          dealDamage(hitE, pr.trapDamage || 20, { raw: true, noCrit: true, trap: true, source: 'trap:arrow', knockback: 140, dir: Math.atan2(pr.vy, pr.vx) });
          fizzle(pr);
          world.projectiles.splice(i, 1);
          continue;
        }
      }
      if (dist(pr.x, pr.y, p.x, p.y) < pr.r + p.r * BULLET_HURTBOX) {
        // A perfect parry sends any shot — even a boulder — back at its owner.
        if (isParrying(p)) {
          const st = parryStyle(p);
          perfectParry(p, null, pr.x, pr.y, 'projectile');
          sendBack(pr, reflectAngle(pr, p, nearestEnemy), st.reflectMult, '#ffe27a');
          continue;
        }
        // Shield bashes deflect shots inside a frontal cone.
        if (p.blockTime > 0 && Math.abs(angleDiff(p.blockAngle, angleTo(p.x, p.y, pr.x, pr.y))) < 1.1) {
          const t = nearestEnemy(pr.x, pr.y, 900);
          sendBack(pr, t ? angleTo(pr.x, pr.y, t.x, t.y) : p.blockAngle, 2, '#ffd45e');
          sfx.block();
          damageText(p.x, p.y - p.r - 14, 'BLOCK', { color: '#ffd45e', size: 15 });
          shake(0.2);
          continue;
        }
        if (!p.dashing && p.invuln <= 0) {
          damagePlayer(pr.damage, pr.x, pr.y, pr.srcType || 'projectile');
          fizzle(pr);
          world.projectiles.splice(i, 1);
          continue;
        }
      }
    }
  }
}

function lerpTo(a, b, t) { return a + (b - a) * clamp(t, 0, 1); }

/** Turn an enemy shot into a friendly one flying at angle `a`. */
function sendBack(pr, a, mult, color) {
  const sp = Math.max(320, Math.hypot(pr.vx, pr.vy)) * 1.35;
  pr.vx = Math.cos(a) * sp;
  pr.vy = Math.sin(a) * sp;
  pr.friendly = true;
  pr.color = color;
  pr.damage *= mult;
  pr.hits = null;
  pr.delay = 0;
  pr.accel = 0;
  pr.turn = 0;
  pr.homing = 0;
  pr.onExpire = null;          // a parried boulder doesn't burst on you
  pr.life = Math.max(pr.life, 1.6);
  pr.heavyHit = pr.heavy;      // a returned boulder hits like a hammer
  burst(pr.x, pr.y, { count: 12, color, speed: 280, size: 3.5, life: 0.3, drag: 5, shape: 'spark' });
}

let breakSfxAt = 0;

/**
 * Destroy light enemy bullets inside a circle (thrown weapons, charged arrows).
 * Heavy shots (boulders) shrug it off; those have to be parried or dodged.
 */
export function breakBulletsNear(x, y, r, p) {
  for (const pr of world.projectiles) {
    if (pr.friendly || pr.cleared || pr.heavy) continue;
    if (dist(x, y, pr.x, pr.y) > r + pr.r) continue;
    breakBullet(pr, p);
  }
}

/** Remove one enemy bullet with a satisfying pop. */
export function breakBullet(pr, p) {
  pr.cleared = true;
  burst(pr.x, pr.y, { count: 5, color: pr.color, speed: 200, size: 2.6, life: 0.22, drag: 6, shape: 'spark' });
  if (p) p.bulletsBroken = (p.bulletsBroken || 0) + 1;
  const now = world.runTime;
  if (now - breakSfxAt > 0.06) { breakSfxAt = now; sfx.tink(); }
}

/** Does a melee hitbox overlap this bullet? Same shapes as enemy hits. */
function hitboxTouches(h, pr) {
  if (h.shape === 'arc') return circleArc(pr.x, pr.y, pr.r, h.x, h.y, h.angle, h.arc, h.radius);
  if (h.shape === 'rect') return circleOrientedRect(pr.x, pr.y, pr.r, h.x, h.y, h.angle, h.len, h.wid);
  return dist(h.x, h.y, pr.x, pr.y) < h.radius + pr.r;
}

function fizzle(pr) {
  burst(pr.x, pr.y, {
    count: pr.quiet ? 2 : 7, color: pr.color, speed: 170, size: 3, life: 0.26, drag: 5, shape: 'spark',
  });
}

// Round bullets are pre-rendered once per colour and size and blitted, which
// is far cheaper on a phone than three alpha-blended arcs per bullet — and a
// boss pattern can put 150 of them on screen.
const SPRITE_RES = 2;
const spriteCache = new Map();

function bulletSprite(shape, color, r) {
  const key = `${shape}|${color}|${r}`;
  let s = spriteCache.get(key);
  if (s) return s;
  const pad = shape === 'bubble' ? 1.5 : 1.95;
  const size = Math.ceil((r * pad * 2 + 4) * SPRITE_RES);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.scale(SPRITE_RES, SPRITE_RES);
  const m = size / SPRITE_RES / 2;
  g.translate(m, m);
  if (shape === 'bubble') {
    g.globalAlpha = 0.22;
    g.fillStyle = color;
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = '#0b0712';
    g.lineWidth = 4;
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke();
    g.strokeStyle = color;
    g.lineWidth = 2.4;
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath(); g.arc(-r * 0.35, -r * 0.35, r * 0.22, 0, TAU); g.fill();
  } else {
    // orb / mud: soft halo, dark rim for contrast on any floor, bright core.
    g.globalAlpha = 0.26;
    g.fillStyle = color;
    g.beginPath(); g.arc(0, 0, r * 1.85, 0, TAU); g.fill();
    g.globalAlpha = 1;
    g.fillStyle = '#0b0712';
    g.beginPath(); g.arc(0, 0, r + 1.5, 0, TAU); g.fill();
    g.fillStyle = color;
    g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
    g.fillStyle = shape === 'mud' ? 'rgba(255,255,220,0.55)' : 'rgba(255,255,255,0.85)';
    g.beginPath(); g.arc(0, 0, r * 0.42, 0, TAU); g.fill();
  }
  s = { canvas: c, half: size / SPRITE_RES / 2 };
  spriteCache.set(key, s);
  return s;
}

export function drawProjectiles(ctx) {
  for (const pr of world.projectiles) {
    if (pr.cleared) continue;
    // Parked shots blink so an armed mine never looks like decoration.
    const parked = pr.delay > 0;
    if (!pr.friendly && (pr.shape === 'orb' || pr.shape === 'bubble' || pr.shape === 'mud')) {
      const s = bulletSprite(pr.shape, pr.color, pr.r);
      if (parked) ctx.globalAlpha = 0.55 + Math.sin(world.runTime * 30) * 0.3;
      ctx.drawImage(s.canvas, pr.x - s.half, pr.y - s.half, s.half * 2, s.half * 2);
      ctx.globalAlpha = 1;
      continue;
    }
    ctx.save();
    if (parked) ctx.globalAlpha = 0.55 + Math.sin(world.runTime * 30) * 0.3;
    ctx.translate(pr.x, pr.y);
    const byVelocity = pr.shape === 'arrow' || pr.shape === 'spear' || pr.shape === 'feather';
    const a = byVelocity ? Math.atan2(pr.vy, pr.vx) : pr.rot;
    ctx.rotate(a);
    ctx.fillStyle = pr.color;

    switch (pr.shape) {
      case 'feather': {
        // A leaf blade with a dark outline and a bright spine.
        const L = pr.r * 2.4, W = pr.r * 0.9;
        ctx.fillStyle = '#0b0712';
        ctx.beginPath();
        ctx.ellipse(0, 0, L + 1.5, W + 1.5, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = pr.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, L, W, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-L * 0.9, 0);
        ctx.lineTo(L * 0.8, 0);
        ctx.stroke();
        ctx.fillStyle = pr.eye || '#ffd45e';
        ctx.beginPath();
        ctx.arc(L * 0.35, 0, W * 0.55, 0, TAU);
        ctx.fill();
        break;
      }
      case 'rock': {
        ctx.fillStyle = '#0b0712';
        polygon(ctx, 0, 0, pr.r + 2, 5, 0.3);
        ctx.fill();
        ctx.fillStyle = pr.color;
        polygon(ctx, 0, 0, pr.r, 5, 0.3);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        polygon(ctx, -pr.r * 0.2, -pr.r * 0.2, pr.r * 0.45, 5, 0.9);
        ctx.fill();
        break;
      }
      case 'arrow': {
        ctx.globalAlpha = 0.35;
        ctx.fillRect(-pr.r * 4.5, -pr.r * 0.32, pr.r * 4.5, pr.r * 0.64);
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(pr.r * 1.9, 0);
        ctx.lineTo(-pr.r * 0.9, -pr.r * 0.8);
        ctx.lineTo(-pr.r * 0.35, 0);
        ctx.lineTo(-pr.r * 0.9, pr.r * 0.8);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'spear': {
        ctx.fillRect(-pr.r * 2.2, -pr.r * 0.2, pr.r * 4.4, pr.r * 0.4);
        ctx.beginPath();
        ctx.moveTo(pr.r * 2.6, 0);
        ctx.lineTo(pr.r * 1.5, -pr.r * 0.6);
        ctx.lineTo(pr.r * 1.5, pr.r * 0.6);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'shield': {
        ctx.strokeStyle = pr.color;
        ctx.lineWidth = 5;
        polygon(ctx, 0, 0, pr.r, 6, 0);
        ctx.stroke();
        ctx.globalAlpha = 0.4;
        polygon(ctx, 0, 0, pr.r * 0.62, 6, 0);
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case 'shard': {
        polygon(ctx, 0, 0, pr.r, 3, 0);
        ctx.fill();
        break;
      }
      default: {
        ctx.globalAlpha = 0.28;
        ctx.beginPath();
        ctx.arc(0, 0, pr.r * 1.85, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(0, 0, pr.r, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(0, 0, pr.r * 0.4, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

// --- melee hitboxes --------------------------------------------------------

export function updateHitboxes(dt) {
  for (let i = world.hitboxes.length - 1; i >= 0; i--) {
    const h = world.hitboxes[i];
    h.life -= dt;
    if (h.life <= 0) { world.hitboxes.splice(i, 1); continue; }

    if (h.follow) {
      h.x = h.follow.x + Math.cos(h.angle) * h.offset;
      h.y = h.follow.y + Math.sin(h.angle) * h.offset;
    }

    // Melee swings cut light enemy bullets out of the air.
    if (h.friendly && h.breaks !== false) {
      for (const pr of world.projectiles) {
        if (pr.friendly || pr.cleared || pr.heavy) continue;
        if (hitboxTouches(h, pr)) breakBullet(pr, world.player);
      }
    }

    for (const e of world.enemies) {
      if (e.dead || e.spawning || e.invuln) continue;
      if (h.hits.has(e)) continue;
      if (h.hitCount >= h.maxHits) break;

      let hit = false;
      if (h.shape === 'arc') hit = circleArc(e.x, e.y, e.r, h.x, h.y, h.angle, h.arc, h.radius);
      else if (h.shape === 'rect') hit = circleOrientedRect(e.x, e.y, e.r, h.x, h.y, h.angle, h.len, h.wid);
      else hit = dist(h.x, h.y, e.x, e.y) < h.radius + e.r;

      if (!hit) continue;

      h.hits.add(e);
      h.hitCount++;
      dealDamage(e, h.damage, {
        knockback: h.knockback,
        dir: angleTo(h.x, h.y, e.x, e.y),
        source: 'melee',
        heavy: !!h.heavy,
        element: h.element || undefined,
      });
      if (h.onHit) h.onHit(e, h);
    }
  }
}

// --- pickups ---------------------------------------------------------------

export function updatePickups(dt) {
  const p = world.player;
  const b = arenaBounds();

  for (let i = world.pickups.length - 1; i >= 0; i--) {
    const k = world.pickups[i];
    k.life -= dt;
    if (k.life <= 0) { world.pickups.splice(i, 1); continue; }

    const decay = Math.exp(-4 * dt);
    k.x += k.vx * dt;
    k.y += k.vy * dt;
    k.vx *= decay;
    k.vy *= decay;
    k.bob += dt * 5;

    k.x = clamp(k.x, b.l + k.r, b.r - k.r);
    k.y = clamp(k.y, b.t + k.r, b.b - k.r);

    if (!p || p.dead) continue;

    const d = dist(k.x, k.y, p.x, p.y);
    // Generous magnet radius: chasing coins should never feel like a chore.
    if (d < 170) {
      const a = angleTo(k.x, k.y, p.x, p.y);
      const pull = 380 * (1 - d / 170) + 90;
      k.x += Math.cos(a) * pull * dt;
      k.y += Math.sin(a) * pull * dt;
    }
    if (d < p.r + k.r + 4) {
      if (k.type === 'gold') {
        world.gold += k.value;
        sfx.pickup();
        burst(k.x, k.y, { count: 5, color: '#ffc861', speed: 130, size: 3, life: 0.28, drag: 5 });
      } else {
        healPlayer(k.value);
      }
      world.pickups.splice(i, 1);
    }
  }
}

export function drawPickups(ctx) {
  for (const k of world.pickups) {
    const bob = Math.sin(k.bob) * 3;
    const fading = k.life < 4 && Math.sin(k.life * 14) < 0;
    if (fading) continue;

    ctx.save();
    ctx.translate(k.x, k.y + bob);
    if (k.type === 'gold') {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#ffc861';
      ctx.beginPath();
      ctx.arc(0, 0, k.r * 2, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffc861';
      // Squashed circle reads as a spinning coin.
      ctx.beginPath();
      ctx.ellipse(0, 0, k.r * Math.abs(Math.cos(k.bob * 0.6)) * 0.8 + 3, k.r, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.ellipse(-1, -2, 2, 4, 0, 0, TAU);
      ctx.fill();
    } else {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#7dff9c';
      ctx.beginPath();
      ctx.arc(0, 0, k.r * 2.1, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#7dff9c';
      const s = k.r * 0.55;
      ctx.fillRect(-s, -s * 2.6, s * 2, s * 5.2);
      ctx.fillRect(-s * 2.6, -s, s * 5.2, s * 2);
    }
    ctx.restore();
  }
}
