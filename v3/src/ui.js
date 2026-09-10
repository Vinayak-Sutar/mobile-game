// Canvas HUD + on-screen touch controls, plus thin helpers for the DOM
// overlay used by menus.

import { world, view, arena, arenaBounds } from './state.js';
import { TAU, clamp, lerp, roundRect, polygon } from './util.js';
import { input, controls } from './input.js';
import { GODS, boonById } from './boons.js';
import { bossInRoom } from './enemies.js';
import { FINAL_DEPTH, isBossDepth } from './rooms.js';
import { BOSS_INFO } from './bosses.js';
import { audio } from './audio.js';
import { GRENADE } from './grenade.js';
import { resetMenuFocus } from './gamepad.js';

const FONT = '"Segoe UI", Roboto, system-ui, sans-serif';

let hpShown = 1;      // lags behind real HP so damage reads as a draining bar
let toast = null;

export function showToast(text, sub = '', life = 1.9) {
  toast = { text, sub, life, maxLife: life };
}

export function clearToast() { toast = null; }

export function updateUi(dt) {
  const p = world.player;
  if (p) {
    const target = clamp(p.hp / p.stats.maxHp, 0, 1);
    hpShown = target > hpShown ? target : lerp(hpShown, target, 1 - Math.pow(0.0008, dt));
  }
  if (toast) {
    toast.life -= dt;
    if (toast.life <= 0) toast = null;
  }
}

export function resetUi() {
  hpShown = 1;
  toast = null;
}

export function drawHud(ctx, time) {
  const p = world.player;
  if (!p) return;

  ctx.textBaseline = 'middle';

  // --- health -------------------------------------------------------------
  const x = 26, y = 28, w = 288, h = 22;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, x - 3, y - 3, w + 6, h + 6, 6);
  ctx.fill();

  const frac = clamp(p.hp / p.stats.maxHp, 0, 1);
  // Ghost bar (recent damage) behind the real one.
  ctx.fillStyle = 'rgba(255,120,140,0.4)';
  roundRect(ctx, x, y, w * hpShown, h, 4);
  ctx.fill();

  ctx.fillStyle = frac < 0.3 ? '#ff3d5e' : frac < 0.6 ? '#ff8a5a' : '#5ee08a';
  roundRect(ctx, x, y, w * frac, h, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  roundRect(ctx, x, y, w * frac, h * 0.42, 4);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, 4);
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff';
  ctx.font = `800 13px ${FONT}`;
  ctx.fillText(`${Math.ceil(p.hp)} / ${p.stats.maxHp}`, x + 9, y + h / 2 + 0.5);

  // --- lives: one heart per life, lost ones hollow ------------------------
  // Beside the health bar on wide (phone-landscape) screens; on narrow ones
  // that spot collides with the chamber tracker, so they join the dash row.
  const livesBeside = view.w >= 1000;
  if (livesBeside) drawLives(ctx, p, x + w + 16, y + h / 2, time);

  // --- dash charges -------------------------------------------------------
  let px = x;
  const py = y + h + 13;
  for (let i = 0; i < p.stats.dashCharges; i++) {
    const filled = i < p.dashStock;
    ctx.fillStyle = filled ? p.weapon.color : 'rgba(255,255,255,0.16)';
    roundRect(ctx, px, py, 24, 6, 3);
    ctx.fill();
    if (!filled && i === p.dashStock) {
      const k = 1 - clamp(p.dashTimer / 0.75, 0, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      roundRect(ctx, px, py, 24 * k, 6, 3);
      ctx.fill();
    }
    px += 28;
  }

  // --- grenade charges ----------------------------------------------------
  px += 10;
  for (let i = 0; i < GRENADE.maxCharges; i++) {
    const filled = i < p.grenadeStock;
    ctx.fillStyle = filled ? '#ffd45e' : 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.arc(px + 5, py + 3, 5, 0, TAU);
    ctx.fill();
    if (!filled && i === p.grenadeStock) {
      const k = 1 - clamp(p.grenadeTimer / GRENADE.recharge, 0, 1);
      ctx.strokeStyle = 'rgba(255,212,94,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px + 5, py + 3, 5, -Math.PI / 2, -Math.PI / 2 + k * TAU);
      ctx.stroke();
    }
    px += 14;
  }
  if (!livesBeside) drawLives(ctx, p, px + 12, py + 3, time, 0.72);

  // --- boons --------------------------------------------------------------
  let bx = x;
  let by = py + 20;   // both advance: icons wrap onto a second row
  for (const id of p.boonOrder) {
    const boon = boonById(id);
    if (!boon) continue;
    const god = GODS[boon.god];
    const count = p.boons[id];
    ctx.fillStyle = god.color;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(bx + 8, by + 8, 8, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (count > 1) {
      ctx.fillStyle = '#0b0812';
      ctx.font = `900 10px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(String(count), bx + 8, by + 9);
      ctx.textAlign = 'left';
    }
    bx += 21;
    if (bx > 320) { bx = x; by += 21; }
  }

  // --- chamber + gold -----------------------------------------------------
  const cx = view.w / 2;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `700 11px ${FONT}`;
  const loopTag = world.loop > 0 ? `  ·  LOOP ${world.loop + 1}` : '';
  const label = world.trial ? 'BOSS TRIAL' : `CHAMBER ${world.depth} / ${FINAL_DEPTH}${loopTag}`;
  ctx.fillText(label, cx, 26);

  // Depth pips: bars for fights, diamonds for guardians, a crown-triangle for
  // the Warden.
  const pipW = 10, gap = 4;
  const total = FINAL_DEPTH * pipW + (FINAL_DEPTH - 1) * gap;
  let ppx = cx - total / 2;
  for (let i = 1; i <= FINAL_DEPTH && !world.trial; i++) {
    const done = i < world.depth;
    const here = i === world.depth;
    ctx.fillStyle = here ? '#ffd45e' : done ? 'rgba(255,212,94,0.45)' : 'rgba(255,255,255,0.14)';
    if (i === FINAL_DEPTH) {
      polygon(ctx, ppx + pipW / 2, 44, 7.5, 3, -Math.PI / 2);
      ctx.fill();
    } else if (isBossDepth(i)) {
      if (!done && !here) ctx.fillStyle = 'rgba(255,120,120,0.4)';
      polygon(ctx, ppx + pipW / 2, 43.5, 5.5, 4, 0);
      ctx.fill();
    } else {
      roundRect(ctx, ppx, 41, pipW, 5, 2.5);
      ctx.fill();
    }
    ppx += pipW + gap;
  }

  // On touch the top-right corner belongs to the pause button.
  const goldX = input.touchMode ? view.w - 66 : view.w - 30;
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffc861';
  ctx.font = `800 17px ${FONT}`;
  ctx.fillText(`${world.gold}`, goldX, 32);
  ctx.beginPath();
  ctx.arc(goldX - ctx.measureText(`${world.gold}`).width - 12, 32, 7, 0, TAU);
  ctx.fill();

  // Mute indicator
  ctx.fillStyle = audio.muted ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.55)';
  ctx.font = `700 11px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(audio.muted ? 'MUTED (M)' : '', view.w - 30, 54);

  // --- boss bar -----------------------------------------------------------
  const boss = bossInRoom();
  if (boss && !boss.spawning) {
    const bw = Math.min(660, view.w - 220), bh = 15;
    const bxx = view.w / 2 - bw / 2, byy = 62;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(ctx, bxx - 3, byy - 3, bw + 6, bh + 6, 5);
    ctx.fill();
    const info = BOSS_INFO[boss.type] || BOSS_INFO.warden;
    ctx.fillStyle = boss.exposed > 0 ? '#ffe27a' : info.color;
    roundRect(ctx, bxx, byy, bw * clamp(boss.hp / boss.maxHp, 0, 1), bh, 3);
    ctx.fill();
    // Phase thresholds
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    for (const t of boss.phases || []) {
      ctx.beginPath();
      ctx.moveTo(bxx + bw * t, byy);
      ctx.lineTo(bxx + bw * t, byy + bh);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,220,180,0.5)';
    ctx.lineWidth = 1.5;
    roundRect(ctx, bxx, byy, bw, bh, 3);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = boss.exposed > 0 ? '#ffe27a' : '#ffd9a0';
    ctx.font = `800 12px ${FONT}`;
    const tag = boss.exposed > 0 ? '  ·  EXPOSED' : '';
    ctx.fillText(boss.title.toUpperCase() + tag, view.w / 2, byy + bh + 13);
  }

  // --- weapon / special (desktop readout) ---------------------------------
  if (!input.touchMode) {
    ctx.textAlign = 'left';
    ctx.fillStyle = p.weapon.color;
    ctx.font = `800 13px ${FONT}`;
    ctx.fillText(p.weapon.name, 26, view.h - 44);
    const ready = p.specialCd <= 0;
    ctx.fillStyle = ready ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.3)';
    ctx.font = `700 12px ${FONT}`;
    ctx.fillText(
      ready ? `${p.weapon.specialName} — ready [K]` : `${p.weapon.specialName} — ${p.specialCd.toFixed(1)}s`,
      26, view.h - 26,
    );
  }

  drawToast(ctx);
}

const START_LIVES_SHOWN = 3;

function drawLives(ctx, p, x, cy, time, size = 1) {
  const total = Math.max(START_LIVES_SHOWN, p.lives || 0);
  for (let i = 0; i < total; i++) {
    const hx = x + i * 24 * size;
    const alive = i < (p.lives || 0);
    // The last remaining heart beats, so "this is your final life" is felt.
    const beat = (alive && p.lives === 1 ? 1 + Math.max(0, Math.sin(time * 7)) * 0.14 : 1) * size;
    heart(ctx, hx, cy, 9 * beat);
    if (alive) {
      ctx.fillStyle = '#ff4d6d';
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(hx - 3.2 * beat, cy - 3 * beat, 2.2 * beat, 0, TAU);
      ctx.fill();
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

/** Heart path centred on (x, y), roughly `s` in radius. */
function heart(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.95);
  ctx.bezierCurveTo(x - s * 1.25, y + s * 0.1, x - s * 1.05, y - s * 1.1, x, y - s * 0.4);
  ctx.bezierCurveTo(x + s * 1.05, y - s * 1.1, x + s * 1.25, y + s * 0.1, x, y + s * 0.95);
  ctx.closePath();
}

function drawToast(ctx) {
  if (!toast) return;
  const k = toast.life / toast.maxLife;
  const alpha = k > 0.75 ? (1 - k) / 0.25 : Math.min(1, k / 0.35);
  const b = arenaBounds();
  ctx.globalAlpha = clamp(alpha, 0, 1);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd9a0';
  ctx.font = `900 34px ${FONT}`;
  ctx.fillText(toast.text, b.l + arena.w / 2, b.t + arena.h * 0.3);
  if (toast.sub) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = `600 15px ${FONT}`;
    ctx.fillText(toast.sub, b.l + arena.w / 2, b.t + arena.h * 0.3 + 28);
  }
  ctx.globalAlpha = 1;
}

// --- touch controls --------------------------------------------------------

export function drawControls(ctx, time) {
  if (!input.touchMode) return;
  const p = world.player;

  // Pause: two bars in the corner.
  const pb = controls.pause;
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(pb.x, pb.y, pb.r, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.85;
  ctx.fillRect(pb.x - 6, pb.y - 7, 4, 14);
  ctx.fillRect(pb.x + 2, pb.y - 7, 4, 14);
  ctx.globalAlpha = 1;

  // Movement stick
  const s = controls.stick;
  if (s.active) {
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(s.ox, s.oy, s.radius, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.ox, s.oy, s.radius, 0, TAU);
    ctx.stroke();

    const dx = s.x - s.ox, dy = s.y - s.oy;
    const d = Math.hypot(dx, dy);
    const cl = Math.min(d, s.radius);
    const a = Math.atan2(dy, dx);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(s.ox + Math.cos(a) * cl, s.oy + Math.sin(a) * cl, s.knob, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else {
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(140, view.h - 132, 56, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.28;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = `700 11px ${FONT}`;
    ctx.fillText('MOVE', 140, view.h - 132);
    ctx.globalAlpha = 1;
  }

  button(ctx, controls.attack, p ? p.weapon.color : '#fff', 1, p ? p.weapon.glyph : '');
  button(ctx, controls.dash, '#9fb8ff',
    p ? clamp(p.dashStock / Math.max(1, p.stats.dashCharges), 0, 1) : 1, '»',
    p ? `${p.dashStock}` : '');
  button(ctx, controls.special, '#ffd45e',
    p ? (p.specialCd > 0 ? 1 - p.specialCd / (p.weapon.special.cooldown || 1) : 1) : 1, '★');
  button(ctx, controls.grenade, '#ff9a4d',
    p ? (p.grenadeStock > 0 ? 1 : 1 - clamp(p.grenadeTimer / GRENADE.recharge, 0, 1)) : 1,
    '◉', p ? `${p.grenadeStock}` : '');
}

function button(ctx, btn, color, fill, glyph, badge = '') {
  const ready = fill >= 1;
  ctx.globalAlpha = btn.pressed ? 0.34 : 0.18;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(btn.x, btn.y, btn.r, 0, TAU);
  ctx.fill();

  ctx.globalAlpha = ready ? 0.85 : 0.3;
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(btn.x, btn.y, btn.r, 0, TAU);
  ctx.stroke();

  // Cooldown sweep
  if (fill < 1) {
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(btn.x, btn.y, btn.r, -Math.PI / 2, -Math.PI / 2 + fill * TAU);
    ctx.stroke();
  }

  ctx.globalAlpha = ready ? 0.95 : 0.45;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${btn.r * 0.62}px ${FONT}`;
  ctx.fillText(glyph, btn.x, btn.y - 2);
  ctx.font = `800 9px ${FONT}`;
  ctx.globalAlpha = 0.55;
  ctx.fillText(btn.label, btn.x, btn.y + btn.r * 0.56);
  if (badge) {
    ctx.globalAlpha = 0.9;
    ctx.font = `900 12px ${FONT}`;
    ctx.fillText(badge, btn.x + btn.r * 0.72, btn.y - btn.r * 0.62);
  }
  ctx.globalAlpha = 1;
}

// --- DOM overlay -----------------------------------------------------------

const overlayEl = () => document.getElementById('overlay');

export function showOverlay(html) {
  const el = overlayEl();
  el.innerHTML = html;
  el.classList.add('on');
  resetMenuFocus();          // a fresh menu always starts on its first item
  return el;
}

export function hideOverlay() {
  const el = overlayEl();
  el.classList.remove('on');
  el.innerHTML = '';
}

export function overlayVisible() {
  return overlayEl().classList.contains('on');
}
