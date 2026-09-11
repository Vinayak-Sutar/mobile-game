// Traps: Hades-style chamber furniture that punishes careless play and can be
// turned on enemies by a clever player. Every trap:
//   - hits ENEMIES as well as the player (knock foes onto spikes with Gale,
//     drag them into a pit with Singularity, lure them past a turret line);
//   - tells you before it fires (glow, click, a drawn line or rail);
//   - talks to the element system (vents ignite oil and douse in rain, pylons
//     electrify puddles, barrels burst into fire or oil).
//
// Traps live on the room (`room.traps`), so they vanish with it. Each kind is
// one entry in TRAPS: { init(t), update(t, dt, ctx), draw(ctx, t, time),
// hittable? } — adding a trap is adding an entry.

import { world, arenaBounds } from './state.js';
import { TAU, dist, rand, clamp, angleTo, circleArc, circleOrientedRect, circleRect } from './util.js';
import { damagePlayer, dealDamage, killEnemy, explode } from './combat.js';
import { elementArea, elementOnPlayer } from './elements.js';
import { spawnSurface, surfacesAt } from './surfaces.js';
import { spawnProjectile, spawnPickup } from './spawn.js';
import { burst, ring, damageText, shake } from './fx.js';
import { sfx } from './audio.js';

const PLAYER_TRAP_DAMAGE = { spikes: 12, vent: 6, saw: 13, arrow: 10, barrel: 18 };

/** Trapmaster (a boon): traps hit enemies 50% harder and spare the player. */
function trapmaster() {
  const p = world.player;
  return !!(p && p.stats && p.stats.trapmaster);
}

function hurtPlayer(amount, x, y, source) {
  if (trapmaster()) return false;
  return damagePlayer(amount, x, y, source);
}

function hurtEnemy(e, amount, source, extra = {}) {
  const k = trapmaster() ? 1.5 : 1;
  return dealDamage(e, amount * k, { raw: true, noCrit: true, trap: true, source: `trap:${source}`, ...extra });
}

// --- the traps ---------------------------------------------------------------------

export const TRAPS = {
  // Pressure spikes: stepping on the plate arms it; 0.5 s later spikes shoot up
  // and hit whatever is still standing there.
  spikes: {
    init(t) { t.r = t.r || 30; t.state = 'idle'; t.tt = 0; },
    update(t, dt) {
      t.tt -= dt;
      if (t.state === 'idle') {
        if (anyoneOn(t.x, t.y, t.r)) { t.state = 'armed'; t.tt = 0.5; sfx.tink(); }
      } else if (t.state === 'armed') {
        if (t.tt <= 0) {
          t.state = 'up'; t.tt = 0.4;
          burst(t.x, t.y, { count: 10, color: '#d8d0e8', speed: 160, size: 3, life: 0.25, drag: 5, shape: 'shard' });
          sfx.thud();
          const p = world.player;
          if (p && !p.dead && dist(p.x, p.y, t.x, t.y) < t.r + p.r * 0.5) hurtPlayer(PLAYER_TRAP_DAMAGE.spikes, t.x, t.y, 'spikes');
          for (const e of world.enemies) {
            if (e.dead || e.spawning || e.hidden || (e.z || 0) > 0) continue;
            if (dist(e.x, e.y, t.x, t.y) < t.r + e.r * 0.5) hurtEnemy(e, 34, 'spikes', { heavy: true });
          }
        }
      } else if (t.state === 'up') {
        if (t.tt <= 0) { t.state = 'cool'; t.tt = 1.0; }
      } else if (t.tt <= 0) {
        t.state = 'idle';
      }
    },
    draw(ctx, t, time) {
      const armed = t.state === 'armed';
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      plate(ctx, t.x, t.y, t.r);
      ctx.fill();
      ctx.strokeStyle = armed ? (Math.sin(time * 40) > 0 ? '#ff5e5e' : '#ffd0d0') : 'rgba(200,190,220,0.45)';
      ctx.lineWidth = armed ? 3 : 2;
      plate(ctx, t.x, t.y, t.r);
      ctx.stroke();
      // Holes, or spikes when up.
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * TAU + 0.3, d = k === 0 ? 0 : t.r * 0.55;
        const px = t.x + Math.cos(a) * d, py = t.y + Math.sin(a) * d;
        if (t.state === 'up') {
          ctx.fillStyle = '#e6e0f2';
          ctx.beginPath(); ctx.moveTo(px, py - 9); ctx.lineTo(px - 4, py + 3); ctx.lineTo(px + 4, py + 3); ctx.closePath(); ctx.fill();
        } else {
          ctx.fillStyle = armed ? '#ff8a8a' : 'rgba(10,6,16,0.8)';
          ctx.beginPath(); ctx.arc(px, py, 2.4, 0, TAU); ctx.fill();
        }
      }
    },
  },

  // Flame vent: warns (glow and smoke), then a jet of fire along `angle`.
  // Rain or a puddle over the vent puts it out; its fire ignites oil and gas.
  vent: {
    init(t) { t.len = t.len || 170; t.cycle = t.cycle || 3.6; t.tt = rand(0, t.cycle); t.state = 'off'; },
    update(t, dt) {
      const doused = surfacesAt(t.x, t.y, 4).some((s) => s.type === 'water' || s.type === 'ice') ||
        world.spellZones.some((z) => z.type === 'rain' && dist(z.x, z.y, t.x, t.y) < z.r);
      t.doused = doused;
      t.tt -= dt;
      if (t.state === 'off' && t.tt <= 0) { t.state = 'warn'; t.tt = 0.8; }
      else if (t.state === 'warn' && t.tt <= 0) {
        t.state = doused ? 'off' : 'fire'; t.tt = doused ? t.cycle : 1.0; t.tick = 0;
        if (!doused) sfx.whirr();
      } else if (t.state === 'fire') {
        t.tick -= dt;
        if (Math.random() < dt * 50) {
          const k = Math.random();
          burst(t.x + Math.cos(t.angle) * t.len * k, t.y + Math.sin(t.angle) * t.len * k, { count: 1, color: Math.random() < 0.5 ? '#ffb35e' : '#ff5e3d', speed: 60, size: 5, life: 0.35, drag: 2 });
        }
        if (t.tick <= 0) {
          t.tick = 0.25;
          const p = world.player;
          if (p && !p.dead && circleOrientedRect(p.x, p.y, p.r * 0.6, t.x, t.y, t.angle, t.len, 34)) {
            if (!trapmaster()) { hurtPlayer(PLAYER_TRAP_DAMAGE.vent, t.x, t.y, 'flame vent'); elementOnPlayer('fire'); }
          }
          for (const e of world.enemies) {
            if (e.dead || e.spawning || e.hidden) continue;
            if (circleOrientedRect(e.x, e.y, e.r, t.x, t.y, t.angle, t.len, 34)) hurtEnemy(e, 9, 'vent', { element: 'fire' });
          }
          // The jet touches the floor along its length: oil and gas go up.
          for (const k of [0.3, 0.65, 0.95]) {
            elementArea('fire', t.x + Math.cos(t.angle) * t.len * k, t.y + Math.sin(t.angle) * t.len * k, 30, { surfaceOnly: true, owner: 'enemy' });
          }
        }
        if (t.tt <= 0 || doused) { t.state = 'off'; t.tt = t.cycle; }
      }
    },
    draw(ctx, t, time) {
      ctx.fillStyle = '#231a2e';
      ctx.beginPath(); ctx.arc(t.x, t.y, 13, 0, TAU); ctx.fill();
      ctx.strokeStyle = t.doused ? '#4aa8ff' : t.state === 'warn' ? '#ffb35e' : 'rgba(255,154,77,0.5)';
      ctx.lineWidth = 3;
      ctx.stroke();
      if (t.state === 'warn') {
        ctx.globalAlpha = 0.25 + Math.sin(time * 30) * 0.12;
        ctx.fillStyle = '#ff9a4d';
        ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.angle);
        ctx.fillRect(0, -17, t.len, 34);
        ctx.restore();
        ctx.globalAlpha = 1;
      } else if (t.state === 'fire') {
        ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.angle);
        const g = ctx.createLinearGradient(0, 0, t.len, 0);
        g.addColorStop(0, 'rgba(255,230,140,0.9)'); g.addColorStop(1, 'rgba(255,80,40,0.1)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(t.len, -18 - Math.sin(time * 20) * 3); ctx.lineTo(t.len, 18); ctx.lineTo(0, 10); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    },
  },

  // A sawblade travelling a visible rail between (x, y) and (x2, y2).
  saw: {
    init(t) { t.k = rand(0, 1); t.dir = 1; t.speed = t.speed || 150; t.cd = new Map(); t.r = 20; },
    update(t, dt) {
      const L = dist(t.x, t.y, t.x2, t.y2) || 1;
      t.k += (t.speed / L) * dt * t.dir;
      if (t.k > 1) { t.k = 1; t.dir = -1; }
      if (t.k < 0) { t.k = 0; t.dir = 1; }
      t.cx = t.x + (t.x2 - t.x) * t.k;
      t.cy = t.y + (t.y2 - t.y) * t.k;
      t.spin = (t.spin || 0) + dt * 18;
      for (const [who, left] of t.cd) { if (left - dt <= 0) t.cd.delete(who); else t.cd.set(who, left - dt); }
      const p = world.player;
      if (p && !p.dead && !t.cd.has(p) && dist(p.x, p.y, t.cx, t.cy) < t.r + p.r * 0.6) {
        if (hurtPlayer(PLAYER_TRAP_DAMAGE.saw, t.cx, t.cy, 'sawblade')) t.cd.set(p, 0.8);
      }
      for (const e of world.enemies) {
        if (e.dead || e.spawning || e.hidden || t.cd.has(e) || (e.z || 0) > 0) continue;
        if (dist(e.x, e.y, t.cx, t.cy) < t.r + e.r) { hurtEnemy(e, 30, 'saw', { knockback: 260, dir: angleTo(t.cx, t.cy, e.x, e.y) }); t.cd.set(e, 0.6); burst(e.x, e.y, { count: 8, color: '#e6e0f2', speed: 260, size: 3, life: 0.2, drag: 5, shape: 'spark' }); }
      }
    },
    draw(ctx, t) {
      ctx.strokeStyle = 'rgba(200,190,220,0.35)';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(t.x2, t.y2); ctx.stroke();
      ctx.strokeStyle = 'rgba(10,6,16,0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.lineCap = 'butt';
      if (t.cx === undefined) return;
      ctx.save(); ctx.translate(t.cx, t.cy); ctx.rotate(t.spin || 0);
      ctx.fillStyle = '#0b0712';
      ctx.beginPath(); ctx.arc(0, 0, t.r + 2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#d8d0e8';
      ctx.beginPath();
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * TAU, rr = k % 2 ? t.r * 0.72 : t.r;
        if (k === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#6a5f80';
      ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
      ctx.restore();
    },
  },

  // Wall turret: a faint line across the room. Anything crossing it makes the
  // turret click, glint and fire an arrow down the line — at enemies too.
  // The arrows are parryable, and a parried arrow flies back at whoever's there.
  turret: {
    init(t) { t.len = t.len || 900; t.cd = 0; t.state = 'idle'; t.tt = 0; },
    update(t, dt) {
      t.cd -= dt;
      t.tt -= dt;
      if (t.state === 'idle' && t.cd <= 0 && anyoneOnLine(t)) { t.state = 'aim'; t.tt = 0.35; sfx.tink(); }
      else if (t.state === 'aim' && t.tt <= 0) {
        t.state = 'idle'; t.cd = 1.6;
        spawnProjectile({
          x: t.x + Math.cos(t.angle) * 16, y: t.y + Math.sin(t.angle) * 16,
          vx: Math.cos(t.angle) * 560, vy: Math.sin(t.angle) * 560,
          r: 6, damage: PLAYER_TRAP_DAMAGE.arrow, color: '#e6e0f2', shape: 'arrow', life: 2.2,
          srcType: 'arrow trap', trap: true, trapDamage: 26, heavy: false,
        });
        sfx.arrow();
      }
    },
    draw(ctx, t, time) {
      ctx.globalAlpha = t.state === 'aim' ? 0.6 : 0.14;
      ctx.strokeStyle = t.state === 'aim' ? '#ff5e5e' : '#e6e0f2';
      ctx.lineWidth = t.state === 'aim' ? 2 : 1;
      ctx.setLineDash([6, 10]);
      ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(t.x + Math.cos(t.angle) * t.len, t.y + Math.sin(t.angle) * t.len); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.angle);
      ctx.fillStyle = '#0b0712'; ctx.fillRect(-12, -12, 22, 24);
      ctx.fillStyle = '#6a5f80'; ctx.fillRect(-10, -10, 18, 20);
      ctx.fillStyle = t.state === 'aim' && Math.sin(time * 40) > 0 ? '#ffffff' : '#ffd45e';
      ctx.fillRect(6, -3, 8, 6);
      ctx.restore();
    },
  },

  // Barrels: fire barrels explode (fire), oil barrels spill a slick. Hit them.
  barrel: {
    hittable: true,
    init(t) { t.r = 17; t.hp = 1; t.oil = !!t.oil; },
    onHit(t, element) {
      if (t.dead) return;
      t.dead = true;
      if (t.oil && element !== 'fire') {
        spawnSurface('oil', t.x, t.y, 120, 'player', 18);
        burst(t.x, t.y, { count: 16, color: '#9a7cd8', speed: 200, size: 4, life: 0.4, drag: 4 });
        sfx.splash();
        return;
      }
      if (t.oil) spawnSurface('oil', t.x, t.y, 110, 'player', 14);
      trapBlast(t.x, t.y, 120, 40, '#ff7a3d');
      elementArea('fire', t.x, t.y, 110, { owner: 'player' });
      spawnSurface('fire', t.x, t.y, 80, 'player', 4);
    },
    update() {},
    draw(ctx, t) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(t.x, t.y + t.r * 0.7, t.r, t.r * 0.4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#0b0712';
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r + 2, 0, TAU); ctx.fill();
      ctx.fillStyle = t.oil ? '#4a3a64' : '#8a3a24';
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, TAU); ctx.fill();
      ctx.strokeStyle = t.oil ? '#9a7cd8' : '#ff9a4d';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r * 0.62, 0, TAU); ctx.stroke();
      ctx.fillStyle = t.oil ? '#c9b4ff' : '#ffd45e';
      ctx.font = '900 12px "Segoe UI", Roboto, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t.oil ? '◍' : '!', t.x, t.y + 1);
    },
  },

  // Storm pylon: hit it and it discharges a shock ring, chaining to pylons in reach.
  pylon: {
    hittable: true,
    init(t) { t.r = 16; t.cd = 0; },
    onHit(t) {
      if (t.cd > 0) return;
      discharge(t, new Set());
    },
    update(t, dt) { t.cd -= dt; },
    draw(ctx, t, time) {
      ctx.fillStyle = '#0b0712';
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r + 2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3a2d5a';
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, TAU); ctx.fill();
      const ready = t.cd <= 0;
      ctx.fillStyle = ready ? '#c58bff' : '#5a4a7a';
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r * 0.5 + (ready ? Math.sin(time * 8) * 1.5 : 0), 0, TAU); ctx.fill();
      if (ready) {
        ctx.globalAlpha = 0.25;
        ctx.strokeStyle = '#c58bff';
        ctx.setLineDash([3, 6]);
        ctx.beginPath(); ctx.arc(t.x, t.y, 130, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
    },
  },

  // Chasm: a pit. Enemies avoid it while walking, but anything knocked in
  // (Gale, a heavy hit, Singularity) falls. A player who falls loses 10% max
  // health and reappears at the edge.
  chasm: {
    init(t) {},
    update() {},
    draw(ctx, t, time) {
      const g = ctx.createLinearGradient(t.x, t.y, t.x, t.y + t.h);
      g.addColorStop(0, '#020104'); g.addColorStop(1, '#0b0614');
      ctx.fillStyle = g;
      ctx.fillRect(t.x, t.y, t.w, t.h);
      ctx.strokeStyle = 'rgba(160,120,220,0.35)';
      ctx.lineWidth = 3;
      ctx.strokeRect(t.x, t.y, t.w, t.h);
      // Drifting motes in the dark.
      ctx.fillStyle = 'rgba(160,120,220,0.35)';
      for (let k = 0; k < 6; k++) {
        const px = t.x + ((k * 97 + time * 20) % t.w), py = t.y + ((k * 53 + time * 9) % t.h);
        ctx.fillRect(px, py, 2, 2);
      }
    },
  },

  // A water channel: a permanent puddle strip (storm-combo bait).
  channel: {
    init(t) {
      // Several overlapping puddles along the strip; they never dry out.
      const n = Math.max(1, Math.round(Math.max(t.w, t.h) / 90));
      t.puddles = [];
      for (let k = 0; k < n; k++) {
        const f = (k + 0.5) / n;
        const px = t.w > t.h ? t.x + t.w * f : t.x + t.w / 2;
        const py = t.w > t.h ? t.y + t.h / 2 : t.y + t.h * f;
        t.puddles.push([px, py, Math.min(t.w, t.h) * 0.75 + 20]);
      }
    },
    update(t) {
      for (const [px, py, pr] of t.puddles) {
        if (!surfacesAt(px, py, 2).some((s) => ['water', 'electrified', 'ice', 'mud', 'steam'].includes(s.type))) {
          spawnSurface('water', px, py, pr, 'enemy', 9999);
        }
      }
    },
    draw() {},
  },

  // Toxic vent: puffs a poison cloud every few seconds.
  toxicVent: {
    init(t) { t.tt = rand(1, 4); },
    update(t, dt) {
      t.tt -= dt;
      if (t.tt <= 0) { t.tt = 5; spawnSurface('toxic', t.x, t.y, 75, 'enemy', 3.5); sfx.splash(); }
    },
    draw(ctx, t, time) {
      ctx.fillStyle = '#1f2a14';
      ctx.beginPath(); ctx.arc(t.x, t.y, 12, 0, TAU); ctx.fill();
      ctx.strokeStyle = t.tt < 0.8 && Math.sin(time * 30) > 0 ? '#d6ff9a' : '#9be34a';
      ctx.lineWidth = 3;
      ctx.stroke();
    },
  },

  // Wind current: a band that pushes bodies and bullets along `angle`.
  wind: {
    init(t) { t.force = t.force || 110; },
    update(t, dt) {
      const fx = Math.cos(t.angle) * t.force, fy = Math.sin(t.angle) * t.force;
      const inside = (o) => o.x > t.x && o.x < t.x + t.w && o.y > t.y && o.y < t.y + t.h;
      const p = world.player;
      if (p && !p.dead && !p.dashing && inside(p)) { p.x += fx * dt * 0.8; p.y += fy * dt * 0.8; }
      for (const e of world.enemies) if (!e.dead && !e.boss && inside(e)) { e.x += fx * dt; e.y += fy * dt; }
      for (const pr of world.projectiles) if (inside(pr)) { pr.vx += fx * 2.2 * dt; pr.vy += fy * 2.2 * dt; }
    },
    draw(ctx, t, time) {
      ctx.globalAlpha = 0.07;
      ctx.fillStyle = '#9fffcf';
      ctx.fillRect(t.x, t.y, t.w, t.h);
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#9fffcf';
      ctx.lineWidth = 2;
      const step = 60;
      const off = (time * 70) % step;
      ctx.save();
      ctx.beginPath(); ctx.rect(t.x, t.y, t.w, t.h); ctx.clip();
      for (let d = -step; d < Math.max(t.w, t.h) + step; d += step) {
        const k = d + off;
        const cx = t.x + (Math.cos(t.angle) >= 0 ? k : t.w - k), cy = t.y + t.h / 2;
        for (let j = 0.25; j < 1; j += 0.5) {
          const yy = t.y + t.h * j;
          ctx.beginPath(); ctx.moveTo(cx - 10, yy - 6); ctx.lineTo(cx, yy); ctx.lineTo(cx - 10, yy + 6); ctx.stroke();
        }
        void cy;
      }
      ctx.restore();
      ctx.globalAlpha = 1;
    },
  },

  // Fountain (special chamber): step in once to heal half your health and fill Focus.
  fountain: {
    init(t) { t.r = 34; t.used = false; },
    update(t) {
      const p = world.player;
      if (t.used || !p || p.dead || dist(p.x, p.y, t.x, t.y) > t.r + p.r) return;
      t.used = true;
      p.hp = Math.min(p.stats.maxHp, p.hp + Math.round(p.stats.maxHp * 0.5));
      if (p.focusMax) p.focus = p.focusMax;
      ring(t.x, t.y, { r0: 10, r1: 140, color: '#7dff9c', life: 0.6, width: 8 });
      burst(t.x, t.y, { count: 30, color: '#7dff9c', speed: 260, size: 4, life: 0.6, drag: 3 });
      damageText(p.x, p.y - p.r - 18, 'RESTORED', { color: '#7dff9c', size: 17 });
      sfx.heal();
    },
    draw(ctx, t, time) {
      ctx.fillStyle = '#16301f';
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r + 6, 0, TAU); ctx.fill();
      ctx.fillStyle = t.used ? '#2a4a36' : '#3fbf7a';
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, TAU); ctx.fill();
      if (!t.used) {
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = '#b8ffd0';
        ctx.lineWidth = 2;
        const ph = (time * 0.8) % 1;
        ctx.beginPath(); ctx.arc(t.x, t.y, t.r * (0.3 + ph * 0.7), 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    },
  },

  // Shrine altar (special chamber): purely the visual; the choice is a menu.
  altar: {
    init(t) { t.r = 26; },
    update() {},
    draw(ctx, t, time) {
      ctx.fillStyle = '#1b1226';
      ctx.fillRect(t.x - 30, t.y - 20, 60, 40);
      ctx.strokeStyle = '#c07bff';
      ctx.lineWidth = 2;
      ctx.strokeRect(t.x - 30, t.y - 20, 60, 40);
      ctx.globalAlpha = 0.5 + Math.sin(time * 3) * 0.2;
      ctx.fillStyle = '#c07bff';
      ctx.beginPath(); ctx.arc(t.x, t.y - 34, 8, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    },
  },

  // Urn: break it for gold, a little health or Focus.
  urn: {
    hittable: true,
    init(t) { t.r = 13; t.loot = t.loot || (Math.random() < 0.6 ? 'gold' : Math.random() < 0.5 ? 'heal' : 'focus'); },
    onHit(t) {
      if (t.dead) return;
      t.dead = true;
      burst(t.x, t.y, { count: 14, color: '#c9a36b', speed: 220, size: 3.5, life: 0.4, drag: 5, shape: 'shard' });
      sfx.thud();
      if (t.loot === 'gold') {
        for (let k = 0; k < 3; k++) spawnPickup({ x: t.x, y: t.y, vx: rand(-120, 120), vy: rand(-120, 120), type: 'gold', value: 2 });
      } else if (t.loot === 'heal') {
        spawnPickup({ x: t.x, y: t.y, vx: rand(-60, 60), vy: rand(-60, 60), type: 'heal', value: 8, r: 11 });
      } else {
        const p = world.player;
        if (p && p.focusMax) { p.focus = Math.min(p.focusMax, (p.focus || 0) + 0.6); damageText(t.x, t.y - 16, '+FOCUS', { color: '#8ef0ff', size: 14 }); }
      }
    },
    update() {},
    draw(ctx, t) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.ellipse(t.x, t.y + t.r * 0.8, t.r, t.r * 0.35, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#0b0712';
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r + 2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#8a6a44';
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, TAU); ctx.fill();
      ctx.fillStyle = '#c9a36b';
      ctx.fillRect(t.x - t.r * 0.6, t.y - 3, t.r * 1.2, 3);
    },
  },
};

// --- helpers -----------------------------------------------------------------------

function plate(ctx, x, y, r) {
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + Math.PI / 8;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function anyoneOn(x, y, r) {
  const p = world.player;
  if (p && !p.dead && !p.dashing && dist(p.x, p.y, x, y) < r) return true;
  return world.enemies.some((e) => !e.dead && !e.spawning && !e.hidden && !(e.z > 0) && dist(e.x, e.y, x, y) < r);
}

function anyoneOnLine(t) {
  const within = (o, pad) => circleOrientedRect(o.x, o.y, (o.r || 10) + pad, t.x, t.y, t.angle, t.len, 8);
  const p = world.player;
  if (p && !p.dead && within(p, 0)) return true;
  return world.enemies.some((e) => !e.dead && !e.spawning && !e.hidden && within(e, 0));
}

function discharge(t, done) {
  done.add(t);
  t.cd = 2.2;
  ring(t.x, t.y, { r0: 8, r1: 130, color: '#c58bff', life: 0.35, width: 6 });
  burst(t.x, t.y, { count: 16, color: '#e9d8ff', speed: 300, size: 3, life: 0.3, drag: 5, shape: 'spark' });
  sfx.beam();
  elementArea('storm', t.x, t.y, 130, { damage: 18, source: 'trap:pylon', owner: 'player' });
  // Chain to other pylons in reach.
  for (const o of (world.room && world.room.traps) || []) {
    if (o.kind !== 'pylon' || done.has(o) || o.cd > 0) continue;
    if (dist(o.x, o.y, t.x, t.y) > 420) continue;
    for (let i = 0; i <= 8; i++) {
      const k = i / 8;
      burst(t.x + (o.x - t.x) * k + rand(-8, 8), t.y + (o.y - t.y) * k + rand(-8, 8), { count: 1, color: '#e9d8ff', speed: 40, size: 3, life: 0.25, drag: 5, shape: 'spark' });
    }
    discharge(o, done);
  }
}

function trapBlast(x, y, r, damage, color) {
  explode(x, y, r, damage * (trapmaster() ? 1.5 : 1), null, color, false, 'barrel');
  const p = world.player;
  if (!trapmaster() && p && !p.dead && dist(p.x, p.y, x, y) < r + p.r * 0.6) damagePlayer(PLAYER_TRAP_DAMAGE.barrel, x, y, 'barrel');
  shake(0.45);
}

// --- per-tick upkeep --------------------------------------------------------------

/**
 * Update every trap in the room: its own behaviour, plus hittable traps
 * (barrels, pylons, urns) checking the player's swings, shots and blasts.
 */
export function updateTraps(dt) {
  const room = world.room;
  if (!room || !room.traps) return;
  for (const t of room.traps) {
    if (t.dead) continue;
    const def = TRAPS[t.kind];
    if (!def) continue;
    def.update(t, dt);
    if (def.hittable) checkHits(t, def);
  }
  // Remove broken barrels and urns.
  room.traps = room.traps.filter((t) => !t.dead);

  // Pits: knocked-in enemies fall; walking enemies are held at the edge.
  const pits = room.traps.filter((t) => t.kind === 'chasm');
  if (pits.length) updatePits(pits);
  world.blastLog.length = 0;
}

function checkHits(t, def) {
  if (!t.hitBy) t.hitBy = new WeakSet();
  // Melee swings.
  for (const h of world.hitboxes) {
    if (!h.friendly || t.hitBy.has(h)) continue;
    let hit = false;
    if (h.shape === 'arc') hit = circleArc(t.x, t.y, t.r, h.x, h.y, h.angle, h.arc, h.radius);
    else if (h.shape === 'rect') hit = circleOrientedRect(t.x, t.y, t.r, h.x, h.y, h.angle, h.len, h.wid);
    else hit = dist(h.x, h.y, t.x, t.y) < h.radius + t.r;
    if (hit) { t.hitBy.add(h); def.onHit(t, h.element || null); return; }
  }
  // Shots (friendly, and enemy shots too: a stray bullet can pop a barrel).
  for (const pr of world.projectiles) {
    if (pr.cleared || t.hitBy.has(pr)) continue;
    if (dist(pr.x, pr.y, t.x, t.y) < pr.r + t.r) { t.hitBy.add(pr); def.onHit(t, pr.element || null); if (!pr.friendly || pr.pierce <= 0) pr.cleared = true; return; }
  }
  // Blasts and elemental areas this tick.
  for (const b of world.blastLog) {
    if (dist(b.x, b.y, t.x, t.y) < b.r + t.r) { def.onHit(t, b.element || null); return; }
  }
  // Standing fire sets barrels off.
  if (t.kind === 'barrel' && surfacesAt(t.x, t.y, t.r).some((s) => s.type === 'fire')) def.onHit(t, 'fire');
}

function updatePits(pits) {
  const inPit = (x, y) => pits.some((c) => x > c.x && x < c.x + c.w && y > c.y && y < c.y + c.h);
  for (const e of world.enemies) {
    if (e.dead || e.spawning || e.hidden || e.boss || (e.z || 0) > 0) continue;
    if (!inPit(e.x, e.y)) continue;
    const speed = Math.hypot(e.vx || 0, e.vy || 0);
    if (speed > 180 || e.fallingIn) {
      // Knocked in: gone.
      e.fallingIn = true;
      burst(e.x, e.y, { count: 14, color: e.color, speed: 120, size: 4, life: 0.5, drag: 3 });
      damageText(e.x, e.y - e.r - 12, 'FELL', { color: '#c9b4ff', size: 16 });
      e.hp = 0;
      killEnemy(e, {});
      trapKillCredit();
    } else {
      // Walking: pushed back out to the nearest edge.
      for (const c of pits) {
        if (circleRect(e.x, e.y, e.r * 0.5, c)) pushOut(e, c);
      }
    }
  }
  const p = world.player;
  if (p && !p.dead && !p.dashing && inPit(p.x, p.y)) {
    // Fall: a slice of health, then back on solid ground at the edge.
    const c = pits.find((q) => p.x > q.x && p.x < q.x + q.w && p.y > q.y && p.y < q.y + q.h);
    pushOut(p, c, 30);
    p.invuln = 0;
    damagePlayer(Math.max(4, Math.round(p.stats.maxHp * 0.1)), null, null, 'a fall');
    p.invuln = Math.max(p.invuln, 1.0);
    damageText(p.x, p.y - p.r - 14, 'FELL', { color: '#c9b4ff', size: 16 });
  }
}

function pushOut(ent, c, extra = 0) {
  const left = ent.x - c.x, right = c.x + c.w - ent.x, top = ent.y - c.y, bottom = c.y + c.h - ent.y;
  const m = Math.min(left, right, top, bottom);
  const pad = (ent.r || 10) + 2 + extra;
  if (m === left) ent.x = c.x - pad;
  else if (m === right) ent.x = c.x + c.w + pad;
  else if (m === top) ent.y = c.y - pad;
  else ent.y = c.y + c.h + pad;
  const b = arenaBounds();
  ent.x = clamp(ent.x, b.l + (ent.r || 10), b.r - (ent.r || 10));
  ent.y = clamp(ent.y, b.t + (ent.r || 10), b.b - (ent.r || 10));
}

let trapKillHook = null;
export function setTrapKillHook(fn) { trapKillHook = fn; }
function trapKillCredit() { if (trapKillHook) trapKillHook(); }

/** combat.js calls this when a trap's damage kills an enemy. */
export function onTrapKill(e) {
  damageText(e.x, e.y - e.r - 26, 'TRAP KILL', { color: '#ffd45e', size: 16 });
  trapKillCredit();
}

// --- drawing ---------------------------------------------------------------------

/** Floor traps (plates, pits, channels, rails) under everything else. */
export function drawTrapsBelow(ctx, time) {
  const room = world.room;
  if (!room || !room.traps) return;
  for (const t of room.traps) {
    if (t.kind === 'chasm' || t.kind === 'wind' || t.kind === 'spikes' || t.kind === 'saw' || t.kind === 'vent' ||
        t.kind === 'toxicVent' || t.kind === 'fountain' || t.kind === 'altar') {
      TRAPS[t.kind].draw(ctx, t, time);
    }
  }
}

/** Standing traps (barrels, pylons, urns, turrets) with the entities. */
export function drawTrapsAbove(ctx, time) {
  const room = world.room;
  if (!room || !room.traps) return;
  for (const t of room.traps) {
    if (t.kind === 'barrel' || t.kind === 'pylon' || t.kind === 'urn' || t.kind === 'turret') {
      TRAPS[t.kind].draw(ctx, t, time);
    }
  }
}

/** Create the runtime trap objects for a room from a template's list. */
export function buildTraps(list) {
  return list.map((spec) => {
    const t = { ...spec };
    const def = TRAPS[t.kind];
    if (def && def.init) def.init(t);
    return t;
  });
}
