// Update + draw for the transient combat objects: projectiles, melee
// hitboxes and floor pickups.

import { world, arenaBounds } from './state.js';
import {
  TAU, clamp, rand, dist, angleTo, angleDiff, normalize, polygon,
  circleRect, circleArc, circleOrientedRect,
} from './util.js';
import { dealDamage, damagePlayer, healPlayer, nearestEnemy } from './combat.js';
import { burst, ring, trail, damageText, shake } from './fx.js';
import { sfx } from './audio.js';

// --- projectiles -----------------------------------------------------------

export function updateProjectiles(dt) {
  const p = world.player;
  const b = arenaBounds();

  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    const pr = world.projectiles[i];
    pr.life -= dt;
    if (pr.life <= 0 || pr.dead) {
      if (pr.onExpire) pr.onExpire(pr);
      fizzle(pr);
      world.projectiles.splice(i, 1);
      continue;
    }

    const age = pr.maxLife - pr.life;

    // Homing: hostile shots curve toward the player, friendly ones toward foes.
    if (pr.homing > 0) {
      const target = pr.friendly ? nearestEnemy(pr.x, pr.y, 520) : p;
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

    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.rot += (pr.spin || 0) * dt;

    if (pr.shape !== 'arrow') {
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
        });
        if (pr.pierce > 0) pr.pierce--;
        else { consumed = true; break; }
      }
      if (consumed) {
        fizzle(pr);
        world.projectiles.splice(i, 1);
        continue;
      }
    } else if (p && !p.dead) {
      if (dist(pr.x, pr.y, p.x, p.y) < pr.r + p.r) {
        // Shield bashes deflect shots inside a frontal cone.
        if (p.blockTime > 0 && Math.abs(angleDiff(p.blockAngle, angleTo(p.x, p.y, pr.x, pr.y))) < 1.1) {
          const sp = Math.hypot(pr.vx, pr.vy);
          const t = nearestEnemy(pr.x, pr.y, 900);
          const a = t ? angleTo(pr.x, pr.y, t.x, t.y) : p.blockAngle;
          pr.vx = Math.cos(a) * sp * 1.35;
          pr.vy = Math.sin(a) * sp * 1.35;
          pr.friendly = true;
          pr.color = '#ffd45e';
          pr.damage *= 2;
          pr.hits = null;
          pr.life = Math.max(pr.life, 1.6);
          sfx.block();
          damageText(p.x, p.y - p.r - 14, 'BLOCK', { color: '#ffd45e', size: 15 });
          burst(pr.x, pr.y, { count: 12, color: '#ffd45e', speed: 280, size: 3.5, life: 0.3, drag: 5, shape: 'spark' });
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

function fizzle(pr) {
  burst(pr.x, pr.y, {
    count: 7, color: pr.color, speed: 170, size: 3, life: 0.26, drag: 5, shape: 'spark',
  });
}

export function drawProjectiles(ctx) {
  for (const pr of world.projectiles) {
    ctx.save();
    ctx.translate(pr.x, pr.y);
    const a = pr.shape === 'arrow' || pr.shape === 'spear' ? Math.atan2(pr.vy, pr.vx) : pr.rot;
    ctx.rotate(a);
    ctx.fillStyle = pr.color;

    switch (pr.shape) {
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
