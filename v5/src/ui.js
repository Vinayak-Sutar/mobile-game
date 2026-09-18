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
import { spellById, spellColor, cooldownFrac, cooldownLeft, spellLevel, SPELL_SLOTS } from './spells.js';
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

  // --- dash and grenade charges -------------------------------------------
  // Both are read the same way on purpose: one pip per charge, the next one
  // filling as it recharges. A landed charge pops, a refused press shakes.
  const py = y + h + 12;
  let px = x;
  chargeRects.dash = { x: px, y: py, w: 0, h: 10 };
  px = drawCharges(ctx, {
    x: px, y: py, label: 'DASH', color: p.weapon.color, pipW: 26,
    max: p.stats.dashCharges, have: p.dashStock,
    frac: 1 - clamp(p.dashTimer / 0.75, 0, 1),
    pop: p.dashPop || 0, deny: p.dashDenied || 0,
  });
  chargeRects.dash.w = px - chargeRects.dash.x - 4;
  px += 16;
  chargeRects.grenade = { x: px, y: py, w: 0, h: 10 };
  px = drawCharges(ctx, {
    x: px, y: py, label: 'BOMB', color: '#ffd45e', pipW: 22,
    max: GRENADE.maxCharges, have: p.grenadeStock,
    frac: 1 - clamp(p.grenadeTimer / GRENADE.recharge, 0, 1),
    pop: p.grenadePop || 0, deny: p.grenadeDenied || 0,
  });
  chargeRects.grenade.w = px - chargeRects.grenade.x - 4;
  if (!livesBeside) drawLives(ctx, p, px + 14, py + 5, time, 0.72);

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

  // Depth pips: bars for fights, diamonds for guardians.
  const pipW = 10, gap = 4;
  const total = FINAL_DEPTH * pipW + (FINAL_DEPTH - 1) * gap;
  let ppx = cx - total / 2;
  for (let i = 1; i <= FINAL_DEPTH && !world.trial; i++) {
    const done = i < world.depth;
    const here = i === world.depth;
    ctx.fillStyle = here ? '#ffd45e' : done ? 'rgba(255,212,94,0.45)' : 'rgba(255,255,255,0.14)';
    if (isBossDepth(i)) {
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
  // Two bosses at once (the Twin Wardens): two bars side by side.
  const bosses = world.enemies.filter((e) => e.boss && !e.dead && !e.spawning);
  if (bosses.length >= 2) {
    const total = Math.min(660, view.w - 220), gap = 18;
    const bw = (total - gap) / 2, bh = 13, byy = 62;
    bosses.slice(0, 2).forEach((b, i) => {
      const bxx = view.w / 2 - total / 2 + i * (bw + gap);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      roundRect(ctx, bxx - 3, byy - 3, bw + 6, bh + 6, 5);
      ctx.fill();
      ctx.fillStyle = b.exposed > 0 ? '#ffe27a' : b.color;
      roundRect(ctx, bxx, byy, bw * clamp(b.hp / b.maxHp, 0, 1), bh, 3);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,220,180,0.5)';
      ctx.lineWidth = 1.5;
      roundRect(ctx, bxx, byy, bw, bh, 3);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = b.exposed > 0 ? '#ffe27a' : '#ffd9a0';
      ctx.font = `800 11px ${FONT}`;
      ctx.fillText(b.title.toUpperCase() + (b.exposed > 0 ? ' · EXPOSED' : ''), bxx + bw / 2, byy + bh + 12);
    });
  }
  const boss = bosses.length >= 2 ? null : bossInRoom();
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

  // --- weapon name, and the ability bar (keyboard and pad) ----------------
  if (!input.touchMode) {
    ctx.textAlign = 'left';
    ctx.fillStyle = p.weapon.color;
    ctx.font = `800 13px ${FONT}`;
    ctx.fillText(p.weapon.name, 26, view.h - 30);
    drawAbilityRow(ctx, p);
  }

  drawSpellRow(ctx, p);
  drawToast(ctx);
}

/** Labels under each slot for keyboard and controller (hold R1 + a face button). */
/**
 * Dash, special and grenade on keyboard and pad. Touch players have these as
 * buttons; without them the grenade was invisible on PC. They sit left of the
 * spell row and use the same button art, so one look covers every ability.
 */
const abilitySlots = {
  dash: { x: 0, y: 0, r: 25, label: '', pressed: false },
  special: { x: 0, y: 0, r: 25, label: '', pressed: false },
  grenade: { x: 0, y: 0, r: 25, label: '', pressed: false },
};
const ABILITY_KEYS = {
  key: { dash: 'SPACE', special: 'K', grenade: 'G' },
  pad: { dash: '✕', special: 'L2', grenade: '○' },
};
const ABILITY_NAMES = { dash: 'DASH', special: 'SPECIAL', grenade: 'BOMB' };

function drawAbilityRow(ctx, p) {
  const keys = input.padMode ? ABILITY_KEYS.pad : ABILITY_KEYS.key;
  const y = view.h - 46;
  const order = ['dash', 'special', 'grenade'];
  // Left of the spells where there is room; on a narrow (4:3) view that would
  // run into the weapon name, so the bar moves to the right of the spells.
  const leftEnd = view.w / 2 - 111 - 84;         // clear of spell slot 1
  const fitsLeft = leftEnd - 2 * 72 - 40 > 170;
  const first = fitsLeft ? leftEnd - 2 * 72 : view.w / 2 + 111 + 84;
  order.forEach((id, i) => {
    const s = abilitySlots[id];
    s.x = first + i * 72;
    s.y = y;
    s.label = keys[id];
    s.pressed = id === 'dash' ? !!input.dash : id === 'special' ? !!input.special : !!input.grenade;
  });

  button(ctx, abilitySlots.dash, '#9fb8ff', p.dashStock > 0 ? 1 : 0, '»', '', {
    max: p.stats.dashCharges, have: p.dashStock,
    frac: 1 - clamp(p.dashTimer / 0.75, 0, 1),
    pop: p.dashPop || 0, deny: p.dashDenied || 0,
  });
  button(ctx, abilitySlots.special, '#ffd45e',
    p.specialCd > 0 ? 1 - p.specialCd / (p.weapon.special.cooldown || 1) : 1, '★');
  button(ctx, abilitySlots.grenade, '#ff9a4d', p.grenadeStock > 0 ? 1 : 0, '◉', '', {
    max: GRENADE.maxCharges, have: p.grenadeStock,
    frac: 1 - clamp(p.grenadeTimer / GRENADE.recharge, 0, 1),
    pop: p.grenadePop || 0, deny: p.grenadeDenied || 0,
  });

  // What each one is, above it: new players have no other way to know.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 9px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (const id of order) {
    const s = abilitySlots[id];
    ctx.fillText(ABILITY_NAMES[id], s.x, s.y - s.r - 16);
  }
}

// Where the HUD drew each charge group this frame.
const chargeRects = { dash: null, grenade: null };

/**
 * Where an ability lives on screen right now, for the tutorial to point at:
 * the touch button on a phone, the ability bar or spell row otherwise.
 */
export function hudAnchor(id) {
  if (input.touchMode) {
    const c = id === 'spell' ? controls.spell0 : controls[id];
    return c ? { x: c.x, y: c.y, r: c.r } : null;
  }
  if (id === 'spell') { const s = rowSlots[0]; return { x: s.x, y: s.y, r: s.r }; }
  if (id === 'attack') return null;             // the mouse button: nothing to point at
  const s = abilitySlots[id];
  return s ? { x: s.x, y: s.y, r: s.r } : null;
}

/** The HUD pip row for dash or grenade, as a rectangle. */
export function chargeRowAnchor(id) { return chargeRects[id] || null; }

/**
 * One group of charges: a label, then a pip per charge.
 *
 * Discrete pips answer "how many can I use", the filling pip answers "how long
 * until the next one", and the pop and shake answer "did that register" -
 * which is the part players notice without being able to name it.
 */
function drawCharges(ctx, o) {
  const h = 10;
  const shake = o.deny > 0 ? Math.sin(o.deny * 70) * 3 * (o.deny / 0.45) : 0;
  let px = o.x + shake;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = o.deny > 0 ? 'rgba(255,94,110,0.95)' : 'rgba(255,255,255,0.42)';
  ctx.font = `800 9px ${FONT}`;
  ctx.fillText(o.label, px, o.y + h / 2);
  px += 32;

  for (let i = 0; i < o.max; i++) {
    const filled = i < o.have;
    const charging = !filled && i === o.have;
    const fresh = filled && i === o.have - 1 ? o.pop : 0;
    const grow = fresh > 0 ? (fresh / 0.42) * 2.5 : 0;

    // Socket.
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(ctx, px - 1, o.y - 1, o.pipW + 2, h + 2, 4);
    ctx.fill();

    if (filled) {
      ctx.fillStyle = o.color;
      roundRect(ctx, px - grow, o.y - grow * 0.4, o.pipW + grow * 2, h + grow * 0.8, 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      roundRect(ctx, px, o.y, o.pipW, h * 0.42, 4);
      ctx.fill();
      if (fresh > 0) {
        ctx.strokeStyle = `rgba(255,255,255,${(fresh / 0.42) * 0.8})`;
        ctx.lineWidth = 2;
        roundRect(ctx, px - grow - 2, o.y - grow * 0.4 - 2, o.pipW + grow * 2 + 4, h + grow * 0.8 + 4, 5);
        ctx.stroke();
      }
    } else {
      // Empty socket, flashing red on a refused press.
      ctx.fillStyle = o.deny > 0 ? 'rgba(255,94,110,0.45)' : 'rgba(255,255,255,0.12)';
      roundRect(ctx, px, o.y, o.pipW, h, 4);
      ctx.fill();
      if (charging) {
        ctx.save();
        ctx.beginPath();
        roundRect(ctx, px, o.y, o.pipW, h, 4);
        ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,0.34)';
        ctx.fillRect(px, o.y, o.pipW * o.frac, h);
        // Bright leading edge, so the fill reads as movement.
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.fillRect(px + o.pipW * o.frac - 2, o.y, 2, h);
        ctx.restore();
      }
    }
    px += o.pipW + 4;
  }
  return px - shake;
}

const PAD_FACE = ['✕', '○', '□', '△'];

/**
 * The four spell slots. On touch they are the cast buttons in the right-hand
 * cluster (input.js hit-tests the same spots); with keyboard or pad they are
 * a row along the bottom centre, labelled with the key.
 */
const rowSlots = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, r: 30, label: '', pressed: false }));

function drawSpellRow(ctx, p) {
  for (let i = 0; i < SPELL_SLOTS; i++) {
    let btn = controls[`spell${i}`];
    if (!input.touchMode) {
      btn = rowSlots[i];
      btn.x = view.w / 2 - 111 + i * 74;
      btn.y = view.h - 46;
    }
    const sp = spellById(p.spells[i]);
    if (!sp) {
      // Locked: an empty socket until a Spell door fills it.
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = '#ffffff';
      ctx.setLineDash([4, 5]);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(btn.x, btn.y, btn.r, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `900 14px ${FONT}`;
      ctx.fillText('✧', btn.x, btn.y);
      ctx.globalAlpha = 1;
      continue;
    }
    const c = spellColor(sp);
    const frac = cooldownFrac(p, sp.id);
    btn.label = input.touchMode ? sp.short : input.padMode ? PAD_FACE[i] : String(i + 1);
    button(ctx, btn, c, frac, frac >= 1 ? sp.glyph : String(Math.ceil(cooldownLeft(p, sp.id))));
    // Level pips above the slot.
    const lv = spellLevel(p, sp.id);
    for (let k = 0; k < lv; k++) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(btn.x - (lv - 1) * 5 + k * 10, btn.y - btn.r - 7, 3, 0, TAU);
      ctx.fill();
    }
    // Silenced (all slots) or hexed (one slot): the Weeping Bride's marks.
    const now = world.runTime;
    if ((p.silencedUntil || 0) > now) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#1a1024';
      ctx.beginPath(); ctx.arc(btn.x, btn.y, btn.r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#b46cff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(btn.x - btn.r * 0.6, btn.y - btn.r * 0.6); ctx.lineTo(btn.x + btn.r * 0.6, btn.y + btn.r * 0.6); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (p.hex && p.hex.id === sp.id && p.hex.until > now) {
      const k = 0.6 + Math.sin(now * 8) * 0.3;
      ctx.globalAlpha = k;
      ctx.strokeStyle = '#b46cff';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(btn.x, btn.y, btn.r + 5, 0, TAU); ctx.stroke();
      // Her face on it: a pale oval with hollow eyes.
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = '#eef2fb';
      ctx.beginPath(); ctx.ellipse(btn.x, btn.y, btn.r * 0.42, btn.r * 0.52, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#1a1024';
      for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(btn.x + sd * btn.r * 0.16, btn.y - btn.r * 0.08, btn.r * 0.09, btn.r * 0.14, 0, 0, TAU); ctx.fill(); }
      ctx.beginPath(); ctx.ellipse(btn.x, btn.y + btn.r * 0.25, btn.r * 0.08, btn.r * 0.12, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (p.spellDenied && p.spellDenied.id === sp.id) {
      ctx.globalAlpha = p.spellDenied.t / 0.3;
      ctx.strokeStyle = '#ff5e6e';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(btn.x, btn.y, btn.r + 4, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
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
  button(ctx, controls.dash, '#9fb8ff', p ? (p.dashStock > 0 ? 1 : 0) : 1, '»', '', p ? {
    max: p.stats.dashCharges, have: p.dashStock,
    frac: 1 - clamp(p.dashTimer / 0.75, 0, 1),
    pop: p.dashPop || 0, deny: p.dashDenied || 0,
  } : null);
  button(ctx, controls.special, '#ffd45e',
    p ? (p.specialCd > 0 ? 1 - p.specialCd / (p.weapon.special.cooldown || 1) : 1) : 1, '★');
  button(ctx, controls.grenade, '#ff9a4d', p ? (p.grenadeStock > 0 ? 1 : 0) : 1, '◉', '', p ? {
    max: GRENADE.maxCharges, have: p.grenadeStock,
    frac: 1 - clamp(p.grenadeTimer / GRENADE.recharge, 0, 1),
    pop: p.grenadePop || 0, deny: p.grenadeDenied || 0,
  } : null);

  // Aiming a grenade: a ✕ to drag onto and let go, to call the throw off.
  if (p && p.grenadeAiming) {
    const z = controls.gcancel;
    const on = input.grenadeInCancel;
    ctx.globalAlpha = on ? 0.5 : 0.2;
    ctx.fillStyle = on ? '#ff5e6e' : '#ffffff';
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.fill();
    ctx.globalAlpha = on ? 1 : 0.7;
    ctx.strokeStyle = on ? '#ff5e6e' : '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, TAU); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(z.x - 11, z.y - 11); ctx.lineTo(z.x + 11, z.y + 11);
    ctx.moveTo(z.x + 11, z.y - 11); ctx.lineTo(z.x - 11, z.y + 11);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 9px ${FONT}`;
    ctx.fillText('CANCEL', z.x, z.y + z.r + 10);
    ctx.globalAlpha = 1;
  }
}

function button(ctx, btn, color, fill, glyph, badge = '', charges = null) {
  const ready = fill >= 1;
  // A refused press nudges the button; a landed charge rings it.
  if (charges && charges.deny > 0) {
    ctx.save();
    ctx.translate(Math.sin(charges.deny * 70) * 3 * (charges.deny / 0.45), 0);
  }
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

  // Charges as a segmented ring: one arc per charge, the next one filling.
  if (charges) {
    const gap = 0.16;
    const span = TAU / charges.max;
    const rr = btn.r + 7;
    for (let i = 0; i < charges.max; i++) {
      const a0 = -Math.PI / 2 + i * span + gap / 2;
      const a1 = a0 + span - gap;
      const filled = i < charges.have;
      const charging = !filled && i === charges.have;
      ctx.globalAlpha = filled ? 0.95 : 0.22;
      ctx.strokeStyle = charges.deny > 0 && !filled ? '#ff5e6e' : color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(btn.x, btn.y, rr, a0, a1);
      ctx.stroke();
      if (charging) {
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(btn.x, btn.y, rr, a0, a0 + (a1 - a0) * charges.frac);
        ctx.stroke();
      }
    }
    if (charges.pop > 0) {
      const k = charges.pop / 0.42;
      ctx.globalAlpha = k * 0.8;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(btn.x, btn.y, rr + (1 - k) * 12, 0, TAU);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
  if (charges && charges.deny > 0) ctx.restore();
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
