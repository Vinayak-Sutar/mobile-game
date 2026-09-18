// The Training Ground: a safe room with straw dummies, a damage meter and a
// loadout panel (the panel itself lives in game.js, with the other menus).
//
// The dummy is a normal enemy so every weapon, spell and boon path hits it the
// way it hits anything else - it simply never dies and never fights back. Its
// health bar refills a moment after you stop hitting it, so the bar reads as
// "how much did that burst take off".

import { world, view } from './state.js';
import { TAU, clamp, roundRect } from './util.js';

const DUMMY_HP = 5000;
const REFILL_AFTER = 1.4;
const DPS_WINDOW = 5;

export const meter = { total: 0, hits: 0, best: 0, dps: 0, log: [] };

export function resetMeter() {
  meter.total = 0;
  meter.hits = 0;
  meter.best = 0;
  meter.dps = 0;
  meter.log.length = 0;
}

/** Called from dealDamage through the enemy's `onHurt` hook. */
export function noteHit(dmg) {
  meter.total += dmg;
  meter.hits++;
  if (dmg > meter.best) meter.best = dmg;
  meter.log.push({ t: world.runTime, dmg });
}

export function updateMeter() {
  const cut = world.runTime - DPS_WINDOW;
  while (meter.log.length && meter.log[0].t < cut) meter.log.shift();
  let sum = 0;
  for (const h of meter.log) sum += h.dmg;
  meter.dps = sum / DPS_WINDOW;
}

export const DUMMY = {
  r: 22, hp: DUMMY_HP, speed: 0, mass: 40, cost: 999, minDepth: 99,
  color: '#e3cf9e', role: 'dummy', damageBase: 0, noBar: false,
  init(e) {
    e.noPush = true;
    e.hpFloor = 1;                       // it can be worn down but never killed
    e.lean = 0;
    e.lastHit = -99;
    e.onHurt = (self, dmg) => {
      self.lastHit = world.runTime;
      self.lean = clamp(self.lean + dmg * 0.004, 0, 0.5);
      noteHit(dmg);
    };
  },
  update(e, dt) {
    // Sway back upright after a hit, then top the bar back up.
    e.lean *= Math.exp(-4 * dt);
    // Breakable ones (the tutorial's) stay broken.
    if (!e.breakable && world.runTime - e.lastHit > REFILL_AFTER && e.hp < e.maxHp) {
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * dt * 1.6);
    }
  },
  draw(e, ctx) {
    const lean = Math.sin(world.runTime * 26) * e.lean;
    ctx.save();
    ctx.translate(e.x, e.y + e.r * 0.5);
    ctx.rotate(lean);
    ctx.translate(0, -e.r * 0.5);

    // Post.
    ctx.fillStyle = '#6b563a';
    ctx.fillRect(-3, -e.r * 0.2, 6, e.r * 1.3);
    // Straw body.
    ctx.fillStyle = e.tint;
    ctx.beginPath();
    ctx.ellipse(0, -e.r * 0.15, e.r * 0.82, e.r * 0.92, 0, 0, TAU);
    ctx.fill();
    // Arms.
    ctx.strokeStyle = '#6b563a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-e.r * 1.1, -e.r * 0.3);
    ctx.lineTo(e.r * 1.1, -e.r * 0.3);
    ctx.stroke();
    // Painted target rings.
    ctx.strokeStyle = 'rgba(200,60,70,0.85)';
    ctx.lineWidth = 2.5;
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(0, -e.r * 0.15, e.r * 0.28 * i, 0, TAU);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(200,60,70,0.85)';
    ctx.beginPath();
    ctx.arc(0, -e.r * 0.15, 3.4, 0, TAU);
    ctx.fill();
    ctx.restore();
  },
};

export const TRAINING_DEFS = { dummy: DUMMY };

const FONT = '"Segoe UI", Roboto, system-ui, sans-serif';

/** The meter, top right, only while training. */
export function drawTrainingHud(ctx) {
  if (!world.training) return;
  const w = 186, h = 86;
  // Below the gold counter and the mute line, clear of the boss bar.
  const x = view.w - w - 22, y = 76;

  ctx.fillStyle = 'rgba(8,6,13,0.62)';
  roundRect(ctx, x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, 8);
  ctx.stroke();

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#8ef0ff';
  ctx.font = `800 10px ${FONT}`;
  ctx.fillText('TRAINING GROUND', x + 12, y + 14);

  ctx.fillStyle = '#ffffff';
  ctx.font = `900 22px ${FONT}`;
  ctx.fillText(Math.round(meter.dps).toLocaleString(), x + 12, y + 38);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = `700 10px ${FONT}`;
  ctx.fillText('DPS (5s)', x + 12, y + 54);

  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `800 12px ${FONT}`;
  ctx.fillText(`best ${meter.best}`, x + w - 12, y + 34);
  ctx.fillText(`total ${Math.round(meter.total).toLocaleString()}`, x + w - 12, y + 52);

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = `700 9px ${FONT}`;
  ctx.fillText('PAUSE to change loadout', x + 12, y + 72);
  ctx.textAlign = 'left';
}
