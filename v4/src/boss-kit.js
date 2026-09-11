// The shared boss kit: bullets, the boss brain (move choice, phases, punish
// windows) and the common hazard shapes. Every boss moveset (bosses.js for the
// creatures, boss-*.js for the rest) is a plain `spec` object built on this.
//
// A spec provides: idle(e, dt, p), choose(e, p, d) -> [[move, weight]...],
// moves { name: { cooldown?, start(e, p), update(e, dt, p) } }, phases [0.5],
// and optionally: opening (initial cooldowns), roarPitch, onPhase, afterPhase,
// phaseTime + phaseAnim(e, dt, p, k) for a longer, animated phase change,
// init(e), arena() (the room's obstacles), draw(e, ctx), drawExtras(e, ctx),
// drawArena(ctx, room, time) (under everything), and hit(e, p) hooks.
//
import { world, arenaBounds } from './state.js';
import { TAU, clamp, rand, dist, angleTo, angleDiff, circleArc, lerp, resolveCircleRect } from './util.js';
import { spawnProjectile } from './spawn.js';
import { damagePlayer } from './combat.js';
import { burst, ring, shake, flash, damageText } from './fx.js';
import { sfx } from './audio.js';
import { player, strafe, collideWorld, contactDamage } from './ai.js';
import { spawnHazard, clearHazards } from './hazards.js';

const BULLET_CAP = 170;
export const PI = Math.PI;

export let spawnEnemyFn = null;
/** enemies.js hands over its factory, so this module needn't import it back. */
export function bindBossSpawner(fn) { spawnEnemyFn = fn; }

// --- bullets ------------------------------------------------------------------

let liveBullets = 0;
export function countBullets() {
  let n = 0;
  for (const pr of world.projectiles) if (!pr.friendly && !pr.cleared) n++;
  liveBullets = n;
}

/**
 * Fire one enemy bullet from a boss (or minion). Returns null, silently,
 * once the screen holds BULLET_CAP enemy bullets.
 * o: { x, y, off, r, dmg (x owner damage), color, shape, life, extra }
 */
export function shot(e, a, speed, o = {}) {
  if (liveBullets >= BULLET_CAP) return null;
  liveBullets++;
  const off = o.off ?? e.r * 0.8;
  const x = (o.x ?? e.x) + Math.cos(a) * off;
  const y = (o.y ?? e.y) + Math.sin(a) * off;
  return spawnProjectile({
    x, y,
    vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
    r: o.r ?? 8,
    damage: Math.max(1, Math.round(e.damage * (o.dmg ?? 0.45))),
    color: o.color ?? e.color,
    shape: o.shape ?? 'orb',
    life: o.life ?? 5,
    srcType: e.summoner ? e.summoner.type : e.type,
    quiet: true,
    trailEvery: 999,
    knockback: 0,
    ...(o.extra || {}),
  });
}

export function ringShot(e, n, speed, offset, o = {}) {
  for (let k = 0; k < n; k++) {
    const a = offset + (k / n) * TAU;
    if (o.gapA !== undefined && Math.abs(angleDiff(o.gapA, a)) < (o.gapW || 0.6) / 2) continue;
    shot(e, a, speed, o);
  }
}

export function fanShot(e, n, spread, center, speed, o = {}) {
  for (let k = 0; k < n; k++) {
    const a = n === 1 ? center : center + (k / (n - 1) - 0.5) * spread;
    shot(e, a, speed, o);
  }
}

/** Remove every enemy bullet and hazard (phase change, boss death). */
export function clearBullets() {
  let shown = 0;
  for (const pr of world.projectiles) {
    if (pr.friendly || pr.cleared) continue;
    // Flagged rather than spliced: this can run from inside the projectile
    // loop (a boss killed by an arrow), which must not have its array shrink.
    pr.cleared = true;
    if (shown++ < 36) {
      burst(pr.x, pr.y, { count: 2, color: pr.color, speed: 90, size: 3, life: 0.3, drag: 4, shape: 'spark' });
    }
  }
  clearHazards();
  liveBullets = 0;
}

/** On a boss's death: its bullets, its hazards and its summons all go. */
export function clearHostiles(owner) {
  clearBullets();
  if (!owner) return;
  for (const m of world.enemies) {
    if (m.summoner === owner && !m.dead) {
      m.dead = true;
      burst(m.x, m.y, { count: 10, color: m.color, speed: 200, size: 3.5, life: 0.4, drag: 4 });
    }
  }
}

export function minionCount(e) {
  let n = 0;
  for (const m of world.enemies) if (m.summoner === e && !m.dead) n++;
  return n;
}

// --- movement helpers -----------------------------------------------------------

export function turnToward(e, a, maxStep) {
  e.face = (e.face || 0) + clamp(angleDiff(e.face || 0, a), -maxStep, maxStep);
}

export function forward(e, speed, dt, a = e.face) {
  e.x += Math.cos(a) * speed * dt;
  e.y += Math.sin(a) * speed * dt;
}

export function inArena(x, y, m) {
  const b = arenaBounds();
  return [clamp(x, b.l + m, b.r - m), clamp(y, b.t + m, b.b - m)];
}

/** Reflect a free-moving boss (vx in e.mx/e.my) off walls and pillars. */
export function bounceWorld(e) {
  const b = arenaBounds();
  let hit = false;
  if (e.x < b.l + e.r) { e.x = b.l + e.r; e.mx = Math.abs(e.mx); hit = true; }
  if (e.x > b.r - e.r) { e.x = b.r - e.r; e.mx = -Math.abs(e.mx); hit = true; }
  if (e.y < b.t + e.r) { e.y = b.t + e.r; e.my = Math.abs(e.my); hit = true; }
  if (e.y > b.b - e.r) { e.y = b.b - e.r; e.my = -Math.abs(e.my); hit = true; }
  if (world.room) {
    for (const o of world.room.obstacles) {
      const px = e.x, py = e.y;
      if (resolveCircleRect(e, o)) {
        const nx = e.x - px, ny = e.y - py;
        const m = Math.hypot(nx, ny) || 1;
        const ux = nx / m, uy = ny / m;
        const dot = e.mx * ux + e.my * uy;
        if (dot < 0) { e.mx -= 2 * dot * ux; e.my -= 2 * dot * uy; }
        hit = true;
      }
    }
  }
  return hit;
}

/** Bullet-speed multiplier: later boss slots fire a touch faster. */
export const tm = (e) => 1 + (e.tier || 0) * 0.04;

// --- the shared boss brain -------------------------------------------------------

export function act(e, name, t = 0) {
  e.action = name;
  e.sub = null;
  e.t = t;
  e.at = 0;
  e.st = 0;
  e.clipTime = t;
  e.animSerial = (e.animSerial || 0) + 1;
}

export function sub(e, name, t) {
  e.sub = name;
  e.t = t;
  e.st = 0;
  e.clipTime = t;
  e.animSerial = (e.animSerial || 0) + 1;
}

/** Back to idle; later phases and later boss slots rest less between moves. */
export function idle(e, t) {
  const k = Math.max(0.45, [1, 0.8, 0.65][Math.min(3, e.phase || 1) - 1] - (e.tier || 0) * 0.04);
  act(e, 'idle', t * k);
}

/** The punish window: the boss stops, takes extra damage, and says so. */
export function expose(e, t) {
  e.z = 0;
  e.hidden = false;
  e.invuln = false;
  act(e, 'exposed', t);
  e.exposed = t;
  sfx.exposed();
  damageText(e.x, e.y - e.r - 18, 'EXPOSED', { color: '#ffe27a', size: 16 });
  ring(e.x, e.y, { r0: e.r, r1: e.r * 2.2, color: '#ffe27a', life: 0.4, width: 4 });
}

export function bossInit(e, S) {
  e.noPush = true;
  e.phase = 1;
  e.phases = S.phases;
  e.cool = { ...(S.opening || {}) };
  e.lastMove = null;
  e.sign = Math.random() < 0.5 ? 1 : -1;
  e.tier = e.tier ?? 0;
  e.title = e.def.title;
  e.exposed = 0;
  e.z = 0;
  act(e, 'idle', 1.2);
  e.onDeath = (self) => clearHostiles(self);
  if (S.init) S.init(e);
}

export function chooseMove(e, p, S) {
  const d = dist(e.x, e.y, p.x, p.y);
  let total = 0;
  const opts = [];
  for (const [name, w0] of S.choose(e, p, d)) {
    if (!S.moves[name] || (e.cool[name] || 0) > 0) continue;
    const w = name === e.lastMove ? w0 * 0.25 : w0;
    if (w <= 0) continue;
    opts.push([name, w]);
    total += w;
  }
  if (!opts.length) { idle(e, 0.3); return; }
  let r = Math.random() * total;
  let pickName = opts[opts.length - 1][0];
  for (const [n, w] of opts) { r -= w; if (r <= 0) { pickName = n; break; } }
  const mv = S.moves[pickName];
  e.lastMove = pickName;
  if (mv.cooldown) e.cool[pickName] = mv.cooldown;
  act(e, pickName, 0);
  mv.start(e, p);
}

export function runBoss(e, dt, S) {
  const p = player();
  if (!p) return;
  countBullets();
  e.t -= dt;
  e.at += dt;
  e.st += dt;
  for (const k in e.cool) e.cool[k] -= dt;
  // Every-frame upkeep a spec wants (telegraph lines, tracking the player).
  if (S.tick) S.tick(e, dt, p);

  // Phase change: waits for any punish window to finish (the player earned
  // it), then roars — invulnerable, screen wiped — and comes back meaner.
  const frac = e.hp / e.maxHp;
  let want = 1;
  for (const th of e.phases) if (frac <= th) want++;
  if (want > e.phase && e.action !== 'phase' && e.action !== 'exposed') {
    e.phase = want;
    e.exposed = 0;
    e.z = 0;
    e.hidden = false;
    e.invuln = true;
    // A spec can ask for a longer, animated transformation (phaseAnim).
    e.phaseT = S.phaseTime || 1.3;
    act(e, 'phase', e.phaseT);
    clearBullets();
    sfx.roar(S.roarPitch || 1);
    flash(0.35, e.color);
    shake(0.8);
    if (S.onPhase) S.onPhase(e, want);
    return;
  }

  switch (e.action) {
    case 'phase':
      if (S.phaseAnim) {
        S.phaseAnim(e, dt, p, clamp(1 - e.t / e.phaseT, 0, 1));
      } else if (Math.random() < dt * 30) {
        burst(e.x, e.y, { count: 2, color: e.color, speed: 380, size: 5, life: 0.5, drag: 2, shape: 'shard' });
      }
      if (e.t <= 0) {
        e.invuln = false;
        if (S.afterPhase) S.afterPhase(e, p);
        idle(e, 0.5);
      }
      return;
    case 'exposed':
      if (Math.random() < dt * 6) {
        burst(e.x + rand(-e.r, e.r) * 0.6, e.y - e.r * 0.8, {
          count: 1, color: '#ffe27a', speed: 30, size: 3.5, life: 0.6, gravity: -50, drag: 1,
        });
      }
      if (e.t <= 0) { e.exposed = 0; idle(e, 0.35); }
      return;
    case 'idle':
      S.idle(e, dt, p);
      if (e.t <= 0) chooseMove(e, p, S);
      return;
    default: {
      const mv = S.moves[e.action];
      if (mv) mv.update(e, dt, p);
      else idle(e, 0.3);
    }
  }
}

/**
 * A ground shockwave ring with two gaps either side of the player, so it
 * always asks for a sidestep — or a well-timed dash straight through.
 */
export function shockwave(e, { speed = 240, width = 18, spread = [0.5, 0.95], gapW = 0.8, dmg = 0.7, color, wait = 0 } = {}) {
  const p = player();
  const pa = p ? angleTo(e.x, e.y, p.x, p.y) : 0;
  spawnHazard({
    kind: 'shockring', x: e.x, y: e.y, r0: e.r * 0.8, speed, width, maxR: 1400,
    damage: Math.round(e.damage * dmg), color: color || e.color, source: e.type, owner: e,
    gaps: [{ a: pa + rand(spread[0], spread[1]), w: gapW }, { a: pa - rand(spread[0], spread[1]), w: gapW }],
    wait,
  });
}

export function lob(e, tx, ty, o = {}) {
  spawnHazard({
    kind: 'lob', x0: e.x, y0: e.y - e.r * 0.3, x1: tx, y1: ty, flight: o.flight || 0.95,
    r: o.r || 46, damage: Math.round(e.damage * (o.dmg || 0.65)), color: o.color || e.color,
    source: e.type, owner: e, height: 160, shellR: 9, quiet: true,
    shards: o.shards || null, shardShape: o.shardShape, shardDamage: o.shardDamage,
  });
}

export function lane(e, t, len, width, color) {
  return spawnHazard({
    kind: 'lane', x: e.x, y: e.y, angle: e.aim, len, width, delay: t, color, owner: e,
    follow: e, track: (h) => { h.angle = e.aim; },
  });
}

