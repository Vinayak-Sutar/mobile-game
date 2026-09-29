// Kin: the third wave of enemies, made for Version 5's world of figures.
//
// The owner asked for more variety - skeletons and the dead, beast-folk,
// goblins and imps, bandits and cultists - and for new behaviours, drawn from
// other games and from myth. Each one has one job, one tell, and one answer a
// player can find on purpose (the rule every enemy here keeps):
//
//   Crossbowman  (bandits)       a red line locks on, then one hard bolt    step aside after the lock
//   Necromancer  (cultists)      raises skeletons from the ground           hit it mid-rite; kill it and they fall
//   Boneling     (the dead)      the necromancer's little skeletons         -
//   Jiangshi     (China)         a hopping corpse, stiff-armed, in lines    stand still and it cannot see you
//   Zealot       (cultists)      wards its allies; calls down light on you   it runs out of breath: catch it
//   Wolf-folk    (beast-folk)    hunts in packs; one howls to rouse them    kill the howler while it howls
//   Tengu        (Japan)         a crow-winged goblin that dives from the sky   watch its shadow, then punish it
//   Banshee      (Ireland)       a keening that fills a cone                get out of the cone, or behind her
//   Skeleton Spearman (the dead) two long thrusts in a line                 sidestep, then punish the recovery
//
// Nothing hurts the player without a telegraph first. Ground telegraphs (the
// aiming line, the cone, the shadow, the rising circles) are drawn under the
// body (`under`) in both looks; `draw` is the Hooded One's top-down shape.

import { world } from './state.js';
import { TAU, clamp, rand, dist, angleTo, angleDiff, polygon, circleOrientedRect } from './util.js';
import { damagePlayer } from './combat.js';
import { burst, ring, shake, damageText } from './fx.js';
import { sfx } from './audio.js';
import { player, stepToward, stepAway, strafe, collideWorld, contactDamage } from './ai.js';
import { spawnProjectile } from './spawn.js';
import { spawnHazard } from './hazards.js';

let spawnEnemyFn = null;
export function bindKinSpawner(fn) { spawnEnemyFn = fn; }

/** A simple top-down body for the Hooded One's look. */
function blob(ctx, e, sides, k = 1) {
  ctx.save();
  ctx.translate(e.x, e.y - (e.z || 0));
  ctx.rotate(e.face || 0);
  ctx.fillStyle = e.tint;
  polygon(ctx, 0, 0, e.r * k, sides, 0);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  polygon(ctx, 0, 0, e.r * k * 0.45, sides, 0.3);
  ctx.fill();
  ctx.fillStyle = '#fff2b0';
  ctx.beginPath(); ctx.arc(e.r * k * 0.45, 0, 2.4, 0, TAU); ctx.fill();
  ctx.restore();
}

// --- the Crossbowman ------------------------------------------------------------------------
// Holds a long range. Raises the crossbow and a thin red line reaches for you,
// following you; for the last quarter-second the line stops following (it
// turns bright): that is the moment to step aside. Then one fast, hard bolt,
// and a long reload.

const AIM_T = 0.95, LOCK_T = 0.28;

const CROSSBOW = {
  r: 15, hp: 46, speed: 120, mass: 1.1, cost: 4, minDepth: 2, color: '#d88a4a',
  role: 'shooter', damageBase: 15, maxPerWave: 2,
  init(e) { e.cd = rand(0.8, 1.8); e.sign = Math.random() < 0.5 ? 1 : -1; },
  update(e, dt) {
    const p = player();
    if (!p) return;
    const d = dist(e.x, e.y, p.x, p.y);
    e.cd = Math.max(0, e.cd - dt);
    if (e.state === 'aim') {
      e.t -= dt;
      if (e.t > LOCK_T) e.aim = angleTo(e.x, e.y, p.x, p.y);
      e.face = e.aim;
      if (e.t <= 0) {
        spawnProjectile({
          x: e.x + Math.cos(e.aim) * 18, y: e.y + Math.sin(e.aim) * 18,
          vx: Math.cos(e.aim) * 760, vy: Math.sin(e.aim) * 760,
          r: 7, damage: e.damage, color: '#ffb070', shape: 'arrow', life: 1.6, srcType: 'crossbow',
        });
        sfx.arrow();
        e.state = 'reload'; e.t = 1.3;
      }
      return;
    }
    if (e.state === 'reload') {
      e.t -= dt;
      if (d < 200) stepAway(e, p.x, p.y, e.speed * 0.8, dt);
      if (e.t <= 0) { e.state = 'chase'; e.cd = rand(0.4, 0.9); }
      return;
    }
    e.state = 'chase';
    if (d < 250) stepAway(e, p.x, p.y, e.speed, dt);
    else if (d > 380) stepToward(e, p.x, p.y, e.speed, dt);
    strafe(e, p.x, p.y, e.speed * 0.45, dt, e.sign);
    if (Math.random() < dt * 0.5) e.sign *= -1;
    if (e.cd <= 0 && d < 560) { e.state = 'aim'; e.t = AIM_T; e.aim = angleTo(e.x, e.y, p.x, p.y); sfx.telegraph(); }
  },
  under(e, ctx) {
    if (e.state !== 'aim') return;
    const locked = e.t <= LOCK_T;
    ctx.strokeStyle = locked ? 'rgba(255,90,60,0.95)' : `rgba(255,90,60,${(0.25 + 0.35 * (1 - e.t / AIM_T)).toFixed(2)})`;
    ctx.lineWidth = locked ? 2.4 : 1.2;
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(e.aim) * 700, e.y + Math.sin(e.aim) * 700); ctx.stroke();
  },
  draw(e, ctx) { blob(ctx, e, 3, 1.1); },
};

// --- the Necromancer and its Bonelings ---------------------------------------------------------
// Keeps its distance and, every few seconds, stands and works a rite: two
// circles of green light open on the ground and skeletons climb out. Hit it
// during the rite and the rite breaks. Kill it and everything it raised falls.

const RITE_T = 1.3;

const NECRO = {
  r: 16, hp: 64, speed: 112, mass: 1.1, cost: 5, minDepth: 3, color: '#9a6ad8',
  role: 'support', damageBase: 8, maxPerWave: 1,
  init(e) {
    e.cd = rand(1.2, 2.2); e.sign = Math.random() < 0.5 ? 1 : -1;
    e.onDeath = (self) => {
      for (const q of world.enemies) {
        if (q.summoner === self && !q.dead) { q.hp = 0; q.dead = true; burst(q.x, q.y, { count: 10, color: '#e8e0cc', speed: 180, size: 3, life: 0.4, drag: 4, shape: 'shard' }); }
      }
    };
  },
  update(e, dt) {
    const p = player();
    if (!p) return;
    const d = dist(e.x, e.y, p.x, p.y);
    e.cd = Math.max(0, e.cd - dt);
    if (e.state === 'rite') {
      e.t -= dt;
      e.face = angleTo(e.x, e.y, p.x, p.y);
      if (e.hp < e.riteHp - 0.5) {
        e.state = 'reel'; e.t = 0.9; e.cd = 2.2; e.spots = null;
        damageText(e.x, e.y - e.r - 20, 'INTERRUPTED', { color: '#ffd45e', size: 14 });
        sfx.hiss();
        return;
      }
      if (e.t <= 0) {
        for (const s of e.spots) {
          const b = spawnEnemyFn('boneling', s.x, s.y, { summoner: e, scale: e.scale || 1 });
          if (b) b.leash = e.leash;
        }
        e.spots = null;
        e.state = 'chase'; e.cd = rand(4.5, 6);
        sfx.rattle();
      }
      return;
    }
    if (e.state === 'reel') { e.t -= dt; if (e.t <= 0) e.state = 'chase'; return; }
    e.state = 'chase';
    if (d < 280) stepAway(e, p.x, p.y, e.speed, dt);
    else if (d > 420) stepToward(e, p.x, p.y, e.speed * 0.8, dt);
    strafe(e, p.x, p.y, e.speed * 0.4, dt, e.sign);
    const mine = world.enemies.filter((q) => q.summoner === e && !q.dead).length;
    if (e.cd <= 0 && mine < 4 && d < 600) {
      e.state = 'rite'; e.t = RITE_T; e.riteHp = e.hp;
      const a = angleTo(e.x, e.y, p.x, p.y);
      e.spots = [-1, 1].map((s) => ({ x: e.x + Math.cos(a + s * 0.9) * 90, y: e.y + Math.sin(a + s * 0.9) * 90 }));
      sfx.telegraph();
    }
  },
  under(e, ctx) {
    if (e.state !== 'rite' || !e.spots) return;
    const k = 1 - e.t / RITE_T;
    for (const s of e.spots) {
      ctx.strokeStyle = `rgba(140,255,160,${(0.35 + 0.5 * k).toFixed(2)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(s.x, s.y, 22 * (0.4 + 0.6 * k), 10 * (0.4 + 0.6 * k), 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = `rgba(140,255,160,${(0.15 * k).toFixed(2)})`; ctx.fill();
    }
  },
  draw(e, ctx) { blob(ctx, e, 7); },
};

const BONELING = {
  r: 12, hp: 18, speed: 150, mass: 0.7, cost: 1, minDepth: 99, color: '#e8e0cc',
  role: 'rusher', damageBase: 6,
  init(e) { e.cd = rand(0.3, 0.8); },
  update(e, dt) {
    const p = player();
    if (!p) return;
    const d = dist(e.x, e.y, p.x, p.y);
    e.cd = Math.max(0, e.cd - dt);
    if (e.state === 'windup') {
      e.t -= dt;
      if (e.t <= 0) {
        e.state = 'swipe'; e.t = 0.18; sfx.swing(0.5);
        if (dist(e.x, e.y, p.x, p.y) < e.r + p.r + 22) damagePlayer(e.damage, e.x, e.y, 'boneling');
      }
      return;
    }
    if (e.state === 'swipe') { e.t -= dt; if (e.t <= 0) { e.state = 'chase'; e.cd = 0.8; } return; }
    e.state = 'chase';
    stepToward(e, p.x, p.y, e.speed, dt);
    if (d < e.r + p.r + 16 && e.cd <= 0) { e.state = 'windup'; e.t = 0.32; e.aim = angleTo(e.x, e.y, p.x, p.y); }
  },
  draw(e, ctx) { blob(ctx, e, 5, 0.9); },
};

// --- the Jiangshi -----------------------------------------------------------------------------
// A hopping corpse from Chinese stories, arms held out stiff before it. It
// only moves by hopping, in straight lines, and each landing stamps the ground
// around it. It cannot turn in the air. And - as the stories say - it finds you
// by your breath: stand quite still and it loses you, hopping blindly.

const HOP_T = 0.38, SET_T = 0.42;

const JIANGSHI = {
  r: 16, hp: 74, speed: 0, mass: 1.6, cost: 4, minDepth: 3, color: '#6a9ab0',
  role: 'hopper', damageBase: 12, maxPerWave: 3,
  init(e) { e.t = rand(0.2, 0.6); e.state = 'set'; e.z = 0; e.still = 0; },
  update(e, dt) {
    const p = player();
    if (!p) return;
    // Its sense of you: gone while you hold your breath (stand still, not fighting).
    const quiet = (p.moveMag || 0) < 0.08 && !p.attack && !p.dashing && !p.charging;
    e.still = quiet ? e.still + dt : 0;
    const lost = e.still > 0.6;
    if (e.state === 'set') {
      e.t -= dt;
      if (e.t <= 0) {
        e.state = 'hop'; e.t = HOP_T;
        e.hx0 = e.x; e.hy0 = e.y;
        const a = lost ? rand(0, TAU) : angleTo(e.x, e.y, p.x, p.y);
        const reach = lost ? 70 : Math.min(140, dist(e.x, e.y, p.x, p.y));
        e.hx1 = e.x + Math.cos(a) * reach; e.hy1 = e.y + Math.sin(a) * reach;
        e.face = a;
        if (lost && !e.saidLost) { e.saidLost = true; damageText(e.x, e.y - 40, '?', { color: '#bfe8ff', size: 16 }); }
        if (!lost) e.saidLost = false;
      }
      return;
    }
    if (e.state === 'hop') {
      e.t -= dt;
      const k = clamp(1 - e.t / HOP_T, 0, 1);
      e.x = e.hx0 + (e.hx1 - e.hx0) * k;
      e.y = e.hy0 + (e.hy1 - e.hy0) * k;
      e.z = Math.sin(k * Math.PI) * 34;
      if (e.t <= 0) {
        e.z = 0;
        collideWorld(e);
        e.state = 'set'; e.t = SET_T;
        ring(e.x, e.y, { r0: 8, r1: 62, color: '#bfe8ff', life: 0.25, width: 4 });
        burst(e.x, e.y + e.r * 0.6, { count: 6, color: '#a89a88', speed: 120, size: 3, life: 0.3, drag: 4 });
        sfx.thud();
        if (dist(e.x, e.y, p.x, p.y) < 62 + p.r) damagePlayer(e.damage, e.x, e.y, 'jiangshi');
      }
    }
  },
  under(e, ctx) {
    // Where it will land: a faint ring tightening as it crouches to hop.
    if (e.state !== 'set') return;
    const k = 1 - e.t / SET_T;
    ctx.strokeStyle = `rgba(191,232,255,${(0.15 + 0.3 * k).toFixed(2)})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.5, 62, 26, 0, 0, TAU); ctx.stroke();
  },
  draw(e, ctx) { blob(ctx, e, 4, 1); },
};

// --- the Zealot --------------------------------------------------------------------------------
// A cultist who keeps to the back and lays a golden ward on the enemies round
// it (they take half damage while it lasts). It is frail and runs from you:
// chase it down and the wards go out.

const WARD_R = 280;

const ZEALOT = {
  r: 15, hp: 42, speed: 132, mass: 0.9, cost: 4, minDepth: 3, color: '#e8c050',
  role: 'support', damageBase: 9, maxPerWave: 1,
  init(e) { e.sign = Math.random() < 0.5 ? 1 : -1; e.pulse = 0; e.cd = rand(1.2, 2); e.fleeCd = 0; },
  update(e, dt) {
    const p = player();
    if (!p) return;
    const d = dist(e.x, e.y, p.x, p.y);
    e.cd = Math.max(0, e.cd - dt);
    e.fleeCd = Math.max(0, e.fleeCd - dt);
    e.face = angleTo(e.x, e.y, p.x, p.y);
    wardAllies(e, dt);

    // Smite: the censer raised, a golden circle on the ground where you stand,
    // then light falls there.
    if (e.state === 'wind') {
      e.t -= dt;
      if (e.t <= 0) {
        spawnHazard({ kind: 'blast', x: e.tx, y: e.ty, r: 58, delay: 0.55, damage: e.damage, color: '#ffe08a', source: 'zealot', owner: e, quiet: true });
        e.state = 'chase'; e.cd = rand(2.2, 3);
      }
      return;
    }
    // It can run from you, but not for long: then it must stop for breath.
    if (e.state === 'flee') {
      e.t -= dt;
      stepAway(e, p.x, p.y, e.speed * 1.15, dt);
      if (e.t <= 0) { e.state = 'winded'; e.t = 1.3; e.exposed = 1.3; damageText(e.x, e.y - 40, 'WINDED', { color: '#ffe08a', size: 13 }); }
      return;
    }
    if (e.state === 'winded') { e.t -= dt; if (e.t <= 0) { e.state = 'chase'; e.exposed = 0; e.fleeCd = 3.5; } return; }

    e.state = 'chase';
    if (d < 150 && e.fleeCd <= 0) { e.state = 'flee'; e.t = 1.1; return; }
    // With someone to shelter behind, it keeps behind them; alone, it stands
    // at a caster's distance and fights.
    const ally = world.enemies
      .filter((q) => q !== e && !q.dead && !q.boss && q.type !== 'zealot' && q.type !== 'dummy')
      .sort((a, b) => dist(a.x, a.y, e.x, e.y) - dist(b.x, b.y, e.x, e.y))[0];
    if (ally) {
      const k = Math.hypot(ally.x - p.x, ally.y - p.y) || 1;
      const tx = ally.x + ((ally.x - p.x) / k) * 110, ty = ally.y + ((ally.y - p.y) / k) * 110;
      if (dist(e.x, e.y, tx, ty) > 20) stepToward(e, tx, ty, e.speed * 0.9, dt);
    } else if (d > 300) stepToward(e, p.x, p.y, e.speed * 0.8, dt);
    else if (d < 200) stepAway(e, p.x, p.y, e.speed * 0.7, dt);
    strafe(e, p.x, p.y, e.speed * 0.35, dt, e.sign);
    if (Math.random() < dt * 0.4) e.sign *= -1;
    if (e.cd <= 0 && d < 460) { e.state = 'wind'; e.t = 0.6; e.tx = p.x; e.ty = p.y; sfx.telegraph(); }
  },
  under(e, ctx) {
    if (!e.warded) return;
    ctx.strokeStyle = 'rgba(255,214,110,0.4)'; ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 5]);
    for (const q of e.warded) {
      if (q.dead) continue;
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    }
    ctx.setLineDash([]);
  },
  draw(e, ctx) { blob(ctx, e, 6, 0.95); },
};

/** The wards: renewed on its three nearest allies every half second. */
function wardAllies(e, dt) {
  e.pulse -= dt;
  if (e.pulse > 0) return;
  e.pulse = 0.5;
  const near = world.enemies
    .filter((q) => q !== e && !q.dead && !q.boss && q.type !== 'zealot' && q.type !== 'dummy' && dist(q.x, q.y, e.x, e.y) < WARD_R)
    .sort((a, b) => dist(a.x, a.y, e.x, e.y) - dist(b.x, b.y, e.x, e.y))
    .slice(0, 3);
  e.warded = near;
  for (const q of near) q.wardT = 0.7;
}

/** Drawn over any warded enemy: a thin golden shell. */
export function drawWard(e, ctx) {
  if (!(e.wardT > 0) || e.dead) return;
  const k = 0.5 + Math.sin(world.runTime * 6 + (e.seed || 0)) * 0.2;
  ctx.strokeStyle = `rgba(255,214,110,${k.toFixed(2)})`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(e.x, e.y - e.r * 0.4, e.r * 1.25, e.r * 1.5, 0, 0, TAU); ctx.stroke();
}

// --- the Wolf-folk ------------------------------------------------------------------------------
// Hunters in packs. They circle at a distance, then one crouches and pounces
// with a double bite. The first to see you howls, standing tall and still:
// every wolf that hears it runs faster for a while. Kill it mid-howl.

const WOLF = {
  r: 15, hp: 46, speed: 176, mass: 1, cost: 3, minDepth: 2, color: '#8a8a94',
  role: 'rusher', damageBase: 8, maxPerWave: 3,
  init(e) { e.cd = rand(0.8, 1.6); e.sign = Math.random() < 0.5 ? 1 : -1; e.hasteT = 0; },
  update(e, dt) {
    const p = player();
    if (!p) return;
    const d = dist(e.x, e.y, p.x, p.y);
    e.cd = Math.max(0, e.cd - dt);
    e.hasteT = Math.max(0, e.hasteT - dt);
    const sp = e.speed * (e.hasteT > 0 ? 1.35 : 1);
    // The pack's first sight of you: a howl.
    if (e.state === 'chase' && !e.howled && d < 520 && !world.enemies.some((q) => q.type === 'wolf' && q !== e && q.state === 'howl')) {
      const packHowled = world.enemies.some((q) => q.type === 'wolf' && q.howled && dist(q.x, q.y, e.x, e.y) < 600);
      e.howled = true;
      if (!packHowled) { e.state = 'howl'; e.t = 0.9; e.exposed = 0.9; sfx.roar(); }
    }
    if (e.state === 'howl') {
      e.t -= dt;
      e.face = angleTo(e.x, e.y, p.x, p.y);
      if (e.t <= 0) {
        ring(e.x, e.y, { r0: 10, r1: 160, color: '#c8c8d8', life: 0.4, width: 3 });
        for (const q of world.enemies) if (q.type === 'wolf' && !q.dead && dist(q.x, q.y, e.x, e.y) < 600) q.hasteT = 6;
        e.state = 'chase'; e.exposed = 0;
      }
      return;
    }
    if (e.state === 'crouch') {
      e.t -= dt;
      e.aim = angleTo(e.x, e.y, p.x, p.y); e.face = e.aim;
      if (e.t <= 0) { e.state = 'pounce'; e.t = 0.22; e.bites = 2; sfx.swing(0.8); }
      return;
    }
    if (e.state === 'pounce') {
      e.t -= dt;
      e.x += Math.cos(e.aim) * 520 * dt; e.y += Math.sin(e.aim) * 520 * dt;
      contactDamage(e, dt, e.damage, 0.25);
      if (e.t <= 0) {
        e.bites--;
        if (e.bites > 0) { e.t = 0.18; e.aim = angleTo(e.x, e.y, p.x, p.y); e.face = e.aim; sfx.swing(0.6); }
        else { e.state = 'recover'; e.t = 0.5; }
      }
      return;
    }
    if (e.state === 'recover') { e.t -= dt; if (e.t <= 0) { e.state = 'chase'; e.cd = rand(0.9, 1.5); } return; }
    e.state = 'chase';
    // Circle, closing in.
    if (d > 190) stepToward(e, p.x, p.y, sp, dt);
    else if (d < 130) stepAway(e, p.x, p.y, sp * 0.6, dt);
    strafe(e, p.x, p.y, sp * 0.6, dt, e.sign);
    if (Math.random() < dt * 0.3) e.sign *= -1;
    if (e.cd <= 0 && d < 220) { e.state = 'crouch'; e.t = 0.32; sfx.telegraph(); }
  },
  draw(e, ctx) { blob(ctx, e, 3, 1.15); },
};

// --- the Tengu ----------------------------------------------------------------------------------
// A crow-winged goblin of the Japanese mountains. It beats up into the sky,
// out of reach, and its shadow follows you on the ground - until the shadow
// stops and darkens: it is coming down there. It lands hard, and stands dazed
// for a moment. That is when to hit it.

const TENGU = {
  r: 16, hp: 60, speed: 128, mass: 1, cost: 5, minDepth: 4, color: '#3a3a4a',
  role: 'diver', damageBase: 14, maxPerWave: 2,
  init(e) { e.cd = rand(1, 2); e.z = 0; e.sign = Math.random() < 0.5 ? 1 : -1; },
  update(e, dt) {
    const p = player();
    if (!p) return;
    const d = dist(e.x, e.y, p.x, p.y);
    e.cd = Math.max(0, e.cd - dt);
    if (e.state === 'rise') {
      e.t -= dt;
      e.z = (1 - e.t / 0.35) * 60;
      if (e.t <= 0) { e.state = 'sky'; e.t = 1.1; e.invuln = true; }
      return;
    }
    if (e.state === 'sky') {
      e.t -= dt;
      e.z = 260;
      // The shadow follows you until the last beat.
      if (e.t > 0.35) { e.x += (p.x - e.x) * Math.min(1, dt * 5); e.y += (p.y - e.y) * Math.min(1, dt * 5); }
      if (e.t <= 0) { e.state = 'dive'; e.t = 0.2; }
      return;
    }
    if (e.state === 'dive') {
      e.t -= dt;
      e.z = Math.max(0, e.t / 0.2) * 260;
      if (e.t <= 0) {
        e.z = 0; e.invuln = false;
        collideWorld(e);
        ring(e.x, e.y, { r0: 10, r1: 80, color: '#e8e0ff', life: 0.3, width: 6 });
        burst(e.x, e.y, { count: 14, color: '#2a2a3a', speed: 240, size: 4, life: 0.4, drag: 4, shape: 'shard' });
        shake(0.25); sfx.thud();
        if (dist(e.x, e.y, p.x, p.y) < 80 + p.r) damagePlayer(e.damage, e.x, e.y, 'tengu');
        e.state = 'dazed'; e.t = 1.1; e.exposed = 1.1;
      }
      return;
    }
    if (e.state === 'dazed') { e.t -= dt; if (e.t <= 0) { e.state = 'chase'; e.cd = rand(1.4, 2.4); e.exposed = 0; } return; }
    e.state = 'chase';
    if (d > 240) stepToward(e, p.x, p.y, e.speed, dt);
    else if (d < 160) stepAway(e, p.x, p.y, e.speed * 0.7, dt);
    strafe(e, p.x, p.y, e.speed * 0.5, dt, e.sign);
    if (e.cd <= 0 && d < 520) { e.state = 'rise'; e.t = 0.35; sfx.dash(); }
  },
  under(e, ctx) {
    if (e.state !== 'sky' && e.state !== 'dive') return;
    const locked = e.state === 'dive' || e.t <= 0.35;
    ctx.fillStyle = locked ? 'rgba(20,10,30,0.45)' : 'rgba(20,10,30,0.22)';
    ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.6, locked ? 70 : 34, locked ? 28 : 14, 0, 0, TAU); ctx.fill();
    if (locked) { ctx.strokeStyle = 'rgba(232,224,255,0.7)'; ctx.lineWidth = 2; ctx.stroke(); }
  },
  draw(e, ctx) { if (e.z < 200) blob(ctx, e, 3, 1.05); },
};

// --- the Banshee ---------------------------------------------------------------------------------
// She drifts at a distance. Then she draws breath, and a pale wedge opens on
// the ground before her: her keening will fill it. Leave the wedge, or get
// behind her, before she screams.

const WAIL_T = 0.85, CONE = 0.5, REACH = 290;

const BANSHEE = {
  r: 16, hp: 56, speed: 96, mass: 0.9, cost: 4, minDepth: 3, color: '#cfe0ff',
  role: 'caster', damageBase: 13, maxPerWave: 2,
  init(e) { e.cd = rand(1, 2); e.sign = Math.random() < 0.5 ? 1 : -1; },
  update(e, dt) {
    const p = player();
    if (!p) return;
    const d = dist(e.x, e.y, p.x, p.y);
    e.cd = Math.max(0, e.cd - dt);
    if (e.state === 'wail') {
      e.t -= dt;
      if (e.t <= 0) {
        sfx.bossRoar();
        for (let k = 0; k < 10; k++) burst(e.x + Math.cos(e.aim) * k * 28, e.y + Math.sin(e.aim) * k * 28, { count: 2, color: '#e8f0ff', speed: 120, size: 3, life: 0.35, drag: 3 });
        const inCone = d < REACH + p.r && Math.abs(angleDiff(e.aim, angleTo(e.x, e.y, p.x, p.y))) < CONE;
        if (inCone && damagePlayer(e.damage, e.x, e.y, 'banshee')) {
          p.vx = (p.vx || 0) + Math.cos(e.aim) * 320; p.vy = (p.vy || 0) + Math.sin(e.aim) * 320;
        }
        e.state = 'rest'; e.t = 0.9;
      }
      return;
    }
    if (e.state === 'rest') { e.t -= dt; if (e.t <= 0) { e.state = 'chase'; e.cd = rand(1.8, 2.6); } return; }
    e.state = 'chase';
    if (d > 240) stepToward(e, p.x, p.y, e.speed, dt);
    else if (d < 170) stepAway(e, p.x, p.y, e.speed, dt);
    strafe(e, p.x, p.y, e.speed * 0.5, dt, e.sign);
    e.face = angleTo(e.x, e.y, p.x, p.y);
    if (e.cd <= 0 && d < REACH - 20) { e.state = 'wail'; e.t = WAIL_T; e.aim = angleTo(e.x, e.y, p.x, p.y); e.face = e.aim; sfx.telegraph(); }
  },
  under(e, ctx) {
    if (e.state !== 'wail') return;
    const k = 1 - e.t / WAIL_T;
    ctx.fillStyle = `rgba(220,232,255,${(0.08 + 0.22 * k).toFixed(2)})`;
    ctx.strokeStyle = `rgba(220,232,255,${(0.3 + 0.5 * k).toFixed(2)})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(e.x, e.y);
    ctx.arc(e.x, e.y, REACH * (0.3 + 0.7 * k), e.aim - CONE, e.aim + CONE);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  },
  draw(e, ctx) { blob(ctx, e, 8, 0.95); },
};

// --- the Skeleton Spearman ------------------------------------------------------------------------
// Keeps a spear's length away, draws the spear back, and thrusts twice down a
// straight line. Side-step the line; after the second thrust it must recover.

const SPEAR_LEN = 118;

const SPEARMAN = {
  r: 15, hp: 58, speed: 118, mass: 1.2, cost: 4, minDepth: 2, color: '#d8d0bc',
  role: 'rusher', damageBase: 10, maxPerWave: 3,
  init(e) { e.cd = rand(0.6, 1.4); },
  update(e, dt) {
    const p = player();
    if (!p) return;
    const d = dist(e.x, e.y, p.x, p.y);
    e.cd = Math.max(0, e.cd - dt);
    if (e.state === 'draw') {
      e.t -= dt;
      if (e.t > 0.15) e.aim = angleTo(e.x, e.y, p.x, p.y);
      e.face = e.aim;
      if (e.t <= 0) { e.state = 'thrust'; e.t = 0.16; e.thrusts = (e.thrusts || 0) + 1; e.hit = false; sfx.swing(0.8); }
      return;
    }
    if (e.state === 'thrust') {
      e.t -= dt;
      const cx = e.x + Math.cos(e.aim) * (SPEAR_LEN / 2), cy = e.y + Math.sin(e.aim) * (SPEAR_LEN / 2);
      if (!e.hit && circleOrientedRect(p.x, p.y, p.r, cx, cy, e.aim, SPEAR_LEN, 16)) { e.hit = true; damagePlayer(e.damage, e.x, e.y, 'spearman'); }
      if (e.t <= 0) {
        if (e.thrusts < 2) { e.state = 'draw'; e.t = 0.3; }
        else { e.state = 'recover'; e.t = 0.7; e.thrusts = 0; }
      }
      return;
    }
    if (e.state === 'recover') { e.t -= dt; if (e.t <= 0) { e.state = 'chase'; e.cd = rand(0.8, 1.3); } return; }
    e.state = 'chase';
    if (d > 130) stepToward(e, p.x, p.y, e.speed, dt);
    else if (d < 90) stepAway(e, p.x, p.y, e.speed * 0.7, dt);
    if (e.cd <= 0 && d < 150) { e.state = 'draw'; e.t = 0.5; e.aim = angleTo(e.x, e.y, p.x, p.y); sfx.telegraph(); }
  },
  under(e, ctx) {
    if (e.state !== 'draw' && e.state !== 'thrust') return;
    const a = e.state === 'thrust' ? 0.5 : 0.18;
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.aim);
    ctx.fillStyle = `rgba(255,220,160,${a})`; ctx.fillRect(0, -8, SPEAR_LEN, 16);
    ctx.restore();
  },
  draw(e, ctx) { blob(ctx, e, 4, 1); },
};

export const KIN_DEFS = {
  crossbow: CROSSBOW, necro: NECRO, boneling: BONELING, jiangshi: JIANGSHI, zealot: ZEALOT,
  wolf: WOLF, tengu: TENGU, banshee: BANSHEE, spearman: SPEARMAN,
};

/** What killed you, for the death screen. */
export const KIN_NAMES = {
  crossbow: 'a Crossbowman', necro: 'a Necromancer', boneling: 'a Boneling', jiangshi: 'a Jiangshi', zealot: 'a Zealot',
  wolf: 'the Wolf-folk', tengu: 'a Tengu', banshee: "a Banshee's keening", spearman: 'a Skeleton Spearman',
};

