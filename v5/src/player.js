// The player: movement, the dash (i-frames are the whole defensive game),
// and a small attack state machine driving the weapon data.

import { world, arenaBounds } from './state.js';
import {
  TAU, clamp, rand, dist, angleTo, angleDiff, normalize, resolveCircleRect, polygon, lerp,
} from './util.js';
import { input } from './input.js';
import { performStep, fireShell, groundSlam } from './weapons.js';
import { nearestEnemy, dealDamage, enemiesInRadius } from './combat.js';
import { burst, ring, trail, shake, slash, damageText } from './fx.js';
import { sfx } from './audio.js';
import { createPlayerAnimator, updatePlayerAnim, drawPlayerRig, playerHandTransform } from './rigs.js';
import { updateSpells } from './spells.js';
import { updateGrenade, GRENADE } from './grenade.js';

const DASH_TIME = 0.17;
const DASH_SPEED = 920;
const BASE_SPEED = 268;

/** Lives per run: falling with one to spare gets you back up at full health. */
export const START_LIVES = 3;

export function createPlayer(weapon, meta = {}) {
  const stats = {
    maxHp: 80 + (meta.vitality || 0) * 10,
    damageMult: 1 + (meta.might || 0) * 0.06,
    attackSpeed: 1,
    moveSpeed: 1,
    critChance: 0.05,
    critMult: 2,
    lifesteal: 0,
    damageReduction: 0,
    dashCharges: 2 + (meta.alacrity || 0),
    dashDamage: 0,
    burn: 0,
    chain: 0,
    explodeOnKill: 0,
    bolt: 0,
    retribution: 0,
    slowOnHit: 0,
    knockbackMult: 1,
    pierceBonus: 0,
    multishot: 0,
  };

  return {
    x: 0, y: 0, vx: 0, vy: 0,
    r: 17,
    stats,
    hp: stats.maxHp,
    lives: START_LIVES,
    weapon,
    boons: {},
    boonOrder: [],
    face: -Math.PI / 2,
    aimAngle: -Math.PI / 2,
    invuln: 0,
    hurtFlash: 0,
    dead: false,

    dashStock: stats.dashCharges,
    dashTimer: 0,
    dashing: false,
    dashT: 0,
    dashDir: 0,
    dashHits: null,

    attack: null,
    comboIndex: 0,
    comboTimer: 0,
    specialCd: 0,
    charging: false,
    charge: 0,
    holding: false,       // the maul: attack held, not yet a charge
    holdT: 0,
    leap: null,           // the maul's Skyfall Leap in flight
    z: 0,
    ammo: weapon.gun ? weapon.gun.shells : 0,   // the blunderbuss
    reloadT: 0,
    idleT: 0,
    fan: null,            // Fan the Hammer, firing

    blockTime: 0,
    blockAngle: 0,

    // Spells (Version 4): up to four equipped, won from Spell doors.
    spells: [],         // equipped spell ids, in slot order
    spellLv: {},        // spell id -> level (1-3); kept even if the spell is dropped
    spellCds: {},       // spell id -> seconds until ready
    spellGcd: 0,
    channel: null,      // a channelled spell in progress
    aegis: null,        // the Aegis shield, while up

    grenadeStock: GRENADE.maxCharges,
    grenadeTimer: 0,
    grenadeArmed: false,
    grenadeAiming: false,
    grenadeHeld: 0,
    grenadeTarget: null,

    walkPhase: 0,
    trailTimer: 0,

    // Animation
    anim: createPlayerAnimator(),
    moveMag: 0,
    moveAngle: 0,
  };
}

function aimAngle(p) {
  if (input.aimActive) return Math.atan2(input.aim.y, input.aim.x);
  // Soft auto-aim: on a touchscreen the player is steering, not aiming.
  const t = nearestEnemy(p.x, p.y, 420);
  if (t) return angleTo(p.x, p.y, t.x, t.y);
  if (input.move.x || input.move.y) return Math.atan2(input.move.y, input.move.x);
  return p.face;
}

export function updatePlayer(p, dt) {
  if (p.dead) {
    // Still drive the animator so the collapse plays out.
    updatePlayerAnim(p, dt);
    return;
  }

  p.invuln = Math.max(0, p.invuln - dt);
  p.hurtFlash = Math.max(0, p.hurtFlash - dt);
  p.specialCd = Math.max(0, p.specialCd - dt);
  p.comboTimer = Math.max(0, p.comboTimer - dt);
  p.blockTime = Math.max(0, p.blockTime - dt);
  if (p.comboTimer <= 0 && !p.attack) p.comboIndex = 0;

  // Charge feedback: a pip pops when one lands, and a refused press says so.
  p.dashPop = Math.max(0, (p.dashPop || 0) - dt);
  p.dashDenied = Math.max(0, (p.dashDenied || 0) - dt);
  p.grenadePop = Math.max(0, (p.grenadePop || 0) - dt);
  p.grenadeDenied = Math.max(0, (p.grenadeDenied || 0) - dt);

  // Dash charges refill one at a time.
  if (p.dashStock < p.stats.dashCharges) {
    p.dashTimer -= dt;
    if (p.dashTimer <= 0) {
      p.dashStock++;
      p.dashTimer = 0.75;
      p.dashPop = 0.42;
      sfx.ui();
    }
  }

  p.aimAngle = aimAngle(p);

  // --- dash ---------------------------------------------------------------
  if (input.dashPressed && !p.dashing && !p.leap && p.dashStock > 0) startDash(p);
  else if (input.dashPressed && !p.dashing && !p.leap) {
    // Out of charges: say no out loud rather than doing nothing.
    p.dashDenied = 0.45;
    sfx.click();
  }

  if (p.dashing) {
    p.dashT -= dt;
    p.invuln = Math.max(p.invuln, 0.06);
    p.x += Math.cos(p.dashDir) * DASH_SPEED * dt;
    p.y += Math.sin(p.dashDir) * DASH_SPEED * dt;

    p.trailTimer -= dt;
    if (p.trailTimer <= 0) {
      p.trailTimer = 0.018;
      trail(p.x, p.y, { color: p.weapon.color, radius: p.r * 1.05, life: 0.26 });
    }
    if (p.stats.dashDamage > 0) {
      for (const e of enemiesInRadius(p.x, p.y, 78)) {
        if (p.dashHits.has(e)) continue;
        p.dashHits.add(e);
        dealDamage(e, p.stats.dashDamage, {
          knockback: 260, dir: p.dashDir, source: 'dash',
        });
        burst(e.x, e.y, { count: 8, color: '#8ef0ff', speed: 240, size: 3, life: 0.28, drag: 5, shape: 'spark' });
      }
    }
    if (p.dashT <= 0) {
      p.dashing = false;
      p.invuln = Math.max(p.invuln, 0.09);
      burst(p.x, p.y, { count: 6, color: p.weapon.color, speed: 130, size: 3, life: 0.25, drag: 5 });
    }
  }

  updateGun(p, dt);
  updateLeap(p, dt);

  // --- attacks ------------------------------------------------------------
  updateAttack(p, dt);
  updateGrenade(p, dt);
  updateSpells(p, dt);

  // --- movement -----------------------------------------------------------
  if (!p.dashing && !p.leap) {
    let speed = BASE_SPEED * p.stats.moveSpeed;
    if (p.attack) speed *= 0.34;
    if (p.charging) speed *= p.weapon.heavy ? 0.4 : 0.55;
    if (p.channel) speed *= 0.5;      // channelling a spell
    // A boss can slow you for a moment (Mau's hairball goo, her lullaby).
    if ((p.slowUntil || 0) > world.runTime) speed *= p.slowMult ?? 1;

    const mag = Math.min(1, Math.hypot(input.move.x, input.move.y));
    p.moveMag = mag;
    if (mag > 0.06) {
      const [nx, ny] = normalize(input.move.x, input.move.y);
      p.x += nx * speed * mag * dt;
      p.y += ny * speed * mag * dt;
      p.face = Math.atan2(ny, nx);
      p.moveAngle = p.face;
      p.walkPhase += dt * 13 * mag;
    } else {
      p.walkPhase = lerp(p.walkPhase, 0, 1 - Math.pow(0.001, dt));
    }
  } else {
    p.moveMag = 0;
  }

  // Knockback / recoil velocity, decaying.
  const decay = Math.exp(-9 * dt);
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.vx *= decay;
  p.vy *= decay;

  // --- world bounds -------------------------------------------------------
  const b = arenaBounds();
  p.x = clamp(p.x, b.l + p.r, b.r - p.r);
  p.y = clamp(p.y, b.t + p.r, b.b - p.r);
  if (world.room) {
    for (const o of world.room.obstacles) resolveCircleRect(p, o);
  }

  updatePlayerAnim(p, dt);
}

function startDash(p) {
  const mag = Math.hypot(input.move.x, input.move.y);
  const dir = mag > 0.12 ? Math.atan2(input.move.y, input.move.x) : p.aimAngle;
  p.dashing = true;
  p.dashT = DASH_TIME;
  p.dashDir = dir;
  p.dashStock--;
  if (p.dashTimer <= 0) p.dashTimer = 0.75;
  p.dashHits = new Set();
  p.face = dir;

  // Cancelling recovery with a dash is the core defensive tool, so let it.
  if (p.attack && p.attack.phase === 'recover') p.attack = null;

  // The blunderbuss: dashing mid-reload slams the shells home at once.
  if (p.weapon.gun && p.reloadT > 0) {
    p.reloadT = 0;
    p.ammo = p.weapon.gun.shells;
    damageText(p.x, p.y - p.r - 22, 'RELOADED', { color: p.weapon.color, size: 14 });
    sfx.clack(1.4);
  }

  burst(p.x, p.y, {
    count: 12, color: p.weapon.color, speed: 260, size: 3.4, life: 0.3,
    dir: dir + Math.PI, spread: 1.4, drag: 5, shape: 'spark',
  });
  ring(p.x, p.y, { r0: 6, r1: 46, color: p.weapon.color, life: 0.24, width: 3 });
  sfx.dash();
  shake(0.07);
}

/** The blunderbuss's shells: reload when empty (or after a pause), and Fan the Hammer. */
function updateGun(p, dt) {
  const g = p.weapon.gun;
  if (!g) return;
  if (p.fan) {
    p.fan.t -= dt;
    if (p.fan.t <= 0) {
      fireShell(p, p.fan.step, p.aimAngle, p.fan.step.spread, p.fan.left === 1);
      p.fan.left--;
      p.fan.t = 0.075;
      if (p.fan.left <= 0) { p.fan = null; p.reloadT = g.reload; sfx.clack(0.8); }
    }
    return;
  }
  // Reload on demand: a shell short is enough, and it is a touch quicker than
  // reloading an empty gun.
  if (input.reloadPressed && p.reloadT <= 0 && p.ammo < g.shells && !p.attack) {
    p.reloadT = p.ammo > 0 ? g.reload * 0.8 : g.reload;
    p.idleT = 0;
    sfx.clack(0.8);
  } else if (input.reloadPressed && p.ammo >= g.shells) {
    sfx.click();                                   // already full
  }
  if (p.reloadT > 0) {
    p.reloadT -= dt * p.stats.attackSpeed;
    if (p.reloadT <= 0) {
      p.reloadT = 0;
      p.ammo = g.shells;
      ring(p.x, p.y, { r0: 26, r1: 14, color: p.weapon.color, life: 0.2, width: 3 });
      sfx.clack(1.2);
    }
  } else if (p.ammo <= 0) {
    p.reloadT = g.reload;
    sfx.clack(0.8);
  } else if (p.ammo < g.shells && !p.attack && !input.attack) {
    // A pause tops the gun back up, a little quicker than an empty reload.
    p.idleT += dt;
    if (p.idleT > g.idleReload) { p.idleT = 0; p.reloadT = g.reload * 0.6; }
  }
  if (p.attack || input.attack) p.idleT = 0;
}

/** Skyfall Leap: up, over and down, untouchable in the air. */
function updateLeap(p, dt) {
  const L = p.leap;
  if (!L) return;
  L.t += dt;
  const k = clamp(L.t / L.T, 0, 1);
  const s = k * k * (3 - 2 * k);
  p.x = lerp(L.x0, L.x1, s);
  p.y = lerp(L.y0, L.y1, s);
  p.z = Math.sin(k * Math.PI) * 70;
  p.invuln = Math.max(p.invuln, 0.1);
  if (k >= 1) {
    p.z = 0;
    p.leap = null;
    groundSlam(p, p.x, p.y, L.step.radius, L.step.damage, L.step.knockback, 1);
  }
}

function stepDuration(p, step, key) {
  return (step[key] || 0) / p.stats.attackSpeed;
}

function updateAttack(p, dt) {
  const w = p.weapon;
  // No swings while channelling a spell (Dragon's Breath, Siphon).
  if (p.channel) { p.charging = false; return; }

  // --- charged weapons ---
  if (w.charge) {
    if (!p.attack) {
      if (input.attack) {
        p.charging = true;
        p.charge = Math.min(w.charge.time, p.charge + dt * p.stats.attackSpeed);
        if (p.charge >= w.charge.time && !p.chargeReady) {
          p.chargeReady = true;
          ring(p.x, p.y, { r0: 34, r1: 16, color: w.color, life: 0.25, width: 3 });
          sfx.ui();
        }
        if (Math.random() < dt * 26) {
          const a = rand(0, TAU);
          const d = 40 * (1 - p.charge / w.charge.time) + 14;
          burst(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, {
            count: 1, color: w.color, speed: 20, size: 3, life: 0.24, drag: 2,
          });
        }
      } else if (p.charging) {
        // Release: even a tap fires, just weakly.
        const power = clamp(p.charge / w.charge.time, 0.15, 1);
        p.charging = false;
        p.chargeReady = false;
        p.charge = 0;
        beginAttack(p, w.combo[0], 0, false, power);
      }
    }
  } else if (w.heavy) {
    // The maul: a tap swings, a hold winds up a slam.
    if (!p.attack) {
      if (input.attack && !p.holding) { p.holding = true; p.holdT = 0; }
      if (p.holding && input.attack) {
        p.holdT += dt;
        if (p.holdT >= w.heavy.hold) {
          p.charging = true;
          p.charge = Math.min(w.heavy.time, p.charge + dt * p.stats.attackSpeed);
          if (p.charge >= w.heavy.time && !p.chargeReady) {
            p.chargeReady = true;
            ring(p.x, p.y, { r0: 40, r1: 18, color: w.color, life: 0.25, width: 4 });
            sfx.ui();
          }
        }
      } else if (p.holding) {
        p.holding = false;
        if (p.charging) {
          const power = clamp(p.charge / w.heavy.time, 0.2, 1);
          p.charging = false;
          p.chargeReady = false;
          p.charge = 0;
          beginAttack(p, w.slam, -1, false, power);
        } else {
          const idx = p.comboTimer > 0 ? p.comboIndex % w.combo.length : 0;
          beginAttack(p, w.combo[idx], idx, false, 1);
        }
      }
    }
  } else if (w.gun) {
    // The blunderbuss: hold to keep firing while there are shells.
    if (!p.attack && !p.fan && p.reloadT <= 0 && input.attack && p.ammo > 0) {
      beginAttack(p, w.combo[0], 0, false, 1);
    } else if (input.attackPressed && p.ammo <= 0 && !p.fan) {
      sfx.click();                                  // the dry click of an empty gun
    }
  } else if (input.attackPressed && !p.attack) {
    const idx = p.comboTimer > 0 ? p.comboIndex % w.combo.length : 0;
    beginAttack(p, w.combo[idx], idx, false, 1);
  }

  if (input.specialPressed && !p.attack && !p.leap && !p.fan && p.specialCd <= 0) {
    p.charging = false;
    p.holding = false;
    p.charge = 0;
    beginAttack(p, w.special, -1, true, 1);
  }

  if (!p.attack) return;

  const a = p.attack;
  a.t -= dt;
  if (a.t > 0) return;

  if (a.phase === 'windup') {
    a.phase = 'active';
    a.t = stepDuration(p, a.step, 'active');
    performStep(p, a.step, a.angle, a.power);

    if (a.step.lunge) {
      p.vx += Math.cos(a.angle) * a.step.lunge;
      p.vy += Math.sin(a.angle) * a.step.lunge;
    }
    if (a.step.block) {
      p.blockTime = Math.max(p.blockTime, stepDuration(p, a.step, 'active') + 0.16);
      p.blockAngle = a.angle;
    }
    if (a.t <= 0) { a.phase = 'recover'; a.t = stepDuration(p, a.step, 'recover'); }
  } else if (a.phase === 'active') {
    a.phase = 'recover';
    a.t = stepDuration(p, a.step, 'recover');
  } else {
    // Recovery finished: open the combo window for the next step.
    if (!a.isSpecial && p.weapon.comboWindow > 0) {
      p.comboIndex = (a.index + 1) % p.weapon.combo.length;
      p.comboTimer = p.weapon.comboWindow;
    } else {
      p.comboIndex = 0;
    }
    p.attack = null;
  }
}

function beginAttack(p, step, index, isSpecial, power) {
  p.attack = {
    step, index, isSpecial, power,
    phase: 'windup',
    t: stepDuration(p, step, 'windup'),
    angle: p.aimAngle,
  };
  p.face = p.aimAngle;
  if (isSpecial) {
    p.specialCd = step.cooldown;
    ring(p.x, p.y, { r0: 8, r1: 40, color: p.weapon.color, life: 0.2, width: 3 });
  }
}

// --- rendering -------------------------------------------------------------

export function drawPlayer(p, ctx) {
  const bob = p.dead ? 0 : Math.sin(p.walkPhase) * 1.4;

  // Ground shadow stays flat on the floor, so it is drawn outside the rig.
  ctx.globalAlpha = p.dead ? 0.18 : 0.34;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + p.r * 0.78, p.r * 0.9, p.r * 0.36, 0, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 1;

  const lift = p.z || 0;
  // The maul's wind-up: the slam's reach, drawn on the floor as it grows.
  if (p.charging && p.weapon.heavy) {
    const h = p.weapon.heavy;
    const k = clamp(p.charge / h.time, 0, 1);
    const r = h.minRadius + (h.maxRadius - h.minRadius) * k;
    const full = k >= 1;
    ctx.globalAlpha = full ? 0.55 + Math.sin(performance.now() * 0.02) * 0.2 : 0.35;
    ctx.strokeStyle = full ? '#ffffff' : p.weapon.color;
    ctx.lineWidth = full ? 3 : 2;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + p.r * 0.4, r, r * 0.86, 0, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  const world = drawPlayerRig(p, ctx, { bob: bob - lift });

  if (!p.dead) drawWeapon(p, ctx, world, bob - lift);

  // The blunderbuss's shells, over your head; a sweep while it reloads.
  if (p.weapon.gun && !p.dead) {
    const g = p.weapon.gun;
    for (let i = 0; i < g.shells; i++) {
      const x = p.x - (g.shells - 1) * 5 + i * 10, y = p.y - p.r - 18 - lift;
      ctx.fillStyle = i < p.ammo ? (i === 0 && p.ammo === 1 ? '#ffd45e' : '#e8d2a8') : 'rgba(255,255,255,0.18)';
      ctx.fillRect(x - 3, y - 5, 6, 10);
    }
    if (p.reloadT > 0) {
      const k = 1 - clamp(p.reloadT / g.reload, 0, 1);
      ctx.strokeStyle = p.weapon.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y - lift, p.r + 12, -Math.PI / 2, -Math.PI / 2 + k * TAU);
      ctx.stroke();
    }
  }

  // Charge indicator
  if (p.charging && p.charge > 0.04) {
    const c = p.weapon.charge || p.weapon.heavy;
    const k = clamp(p.charge / c.time, 0, 1);
    ctx.strokeStyle = k >= 1 ? '#ffffff' : p.weapon.color;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 12, -Math.PI / 2, -Math.PI / 2 + k * TAU);
    ctx.stroke();
  }

  // Shield block arc
  if (p.blockTime > 0) {
    ctx.globalAlpha = clamp(p.blockTime * 3, 0, 0.7);
    ctx.strokeStyle = '#ffd45e';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 16, p.blockAngle - 1.1, p.blockAngle + 1.1);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawWeapon(p, ctx, world, bob) {
  const w = p.weapon;
  // Anchor to the animated hand so blade and arm can never disagree.
  const hand = playerHandTransform(p, world);
  const angle = hand ? hand.angle : p.aimAngle;
  const hx = hand ? hand.x + Math.cos(angle) * p.anim.pose.armR.sx * 11 : p.x;
  const hy = hand ? hand.y + Math.sin(angle) * p.anim.pose.armR.sx * 11 : p.y + bob;
  const extend = p.attack ? 6 : 0;

  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(angle);
  ctx.fillStyle = w.color;
  ctx.strokeStyle = w.color;

  const d = extend;
  switch (w.id) {
    case 'blade':
      ctx.fillRect(d, -2.6, 30, 5.2);
      ctx.beginPath();
      ctx.moveTo(d + 30, -2.6);
      ctx.lineTo(d + 40, 0);
      ctx.lineTo(d + 30, 2.6);
      ctx.closePath();
      ctx.fill();
      break;
    case 'spear':
      ctx.fillRect(d - 12, -2, 52, 4);
      ctx.beginPath();
      ctx.moveTo(d + 40, -5);
      ctx.lineTo(d + 54, 0);
      ctx.lineTo(d + 40, 5);
      ctx.closePath();
      ctx.fill();
      break;
    case 'shield':
      ctx.lineWidth = 4;
      polygon(ctx, d + 10, 0, 13, 6, 0);
      ctx.stroke();
      ctx.globalAlpha = 0.35;
      polygon(ctx, d + 10, 0, 9, 6, 0);
      ctx.fill();
      ctx.globalAlpha = 1;
      break;
    case 'maul':
      // A long haft and a heavy stone head.
      ctx.fillStyle = '#6a4a30';
      ctx.fillRect(d - 10, -2.2, 44, 4.4);
      ctx.fillStyle = w.color;
      ctx.fillRect(d + 30, -11, 16, 22);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(d + 30, -11, 5, 22);
      break;
    case 'gun':
      // A stubby stock and a barrel that flares at the mouth.
      ctx.fillStyle = '#6a4a30';
      ctx.fillRect(d - 8, -3.5, 14, 7);
      ctx.fillStyle = w.color;
      ctx.fillRect(d + 4, -2.6, 26, 5.2);
      ctx.beginPath();
      ctx.moveTo(d + 28, -3); ctx.lineTo(d + 36, -6.5); ctx.lineTo(d + 36, 6.5); ctx.lineTo(d + 28, 3);
      ctx.closePath();
      ctx.fill();
      break;
    case 'bow': {
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.arc(d + 6, 0, 15, -1.9, 1.9);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 1.4;
      const pull = p.charging ? clamp(p.charge / w.charge.time, 0, 1) * 9 : 0;
      ctx.beginPath();
      ctx.moveTo(d + 6 + Math.cos(-1.9) * 15, Math.sin(-1.9) * 15);
      ctx.lineTo(d + 6 - pull, 0);
      ctx.lineTo(d + 6 + Math.cos(1.9) * 15, Math.sin(1.9) * 15);
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}
