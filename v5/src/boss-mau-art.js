// Mau, the cat of nine lives — the drawing. boss-mau.js owns the fight and
// sets the fields read here (form, tails, wiggle, z, puffed, alpha, props).

import { world, arena, arenaBounds } from './state.js';
import { TAU, clamp } from './util.js';

const PI = Math.PI;
export const GOLD = '#ffc861';
export const JADE = '#5fe0a0';
export const NIGHT = '#1a1420';
export const SUN = '#ffb347';
export const SOUL = '#aee8ff';
export const CATNIP = '#9be870';

const FORM_COAT = { cat: '#221a26', ra: '#d8a040', sith: '#0c0a12' };

/** The cat from above: body, head with ears, tail(s), collar and bell, eyes. */
export function drawMau(ctx, e, t) {
  const r = e.r;
  const coat = e.flash > 0 ? '#ffffff' : FORM_COAT[e.form] || FORM_COAT.cat;
  const z = e.z || 0;
  const alpha = e.alpha ?? 1;
  const big = e.form === 'sith' ? 1.25 : e.form === 'ra' ? 1.12 : 1;
  ctx.save();
  // Shadow stays on the ground as she leaps.
  ctx.globalAlpha = 0.35 * alpha;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(e.x, e.y + r * 0.6, r * 1.1 / (1 + z / 200), r * 0.45 / (1 + z / 200), 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.translate(e.x, e.y - z);
  ctx.rotate(e.face || 0);
  ctx.scale(big, big);
  // The pounce tell: a wiggle of the hindquarters.
  const wig = (e.wiggle || 0) * Math.sin(t * 40) * r * 0.18;
  // Tail(s): one, or the split tail of the nekomata.
  const tails = e.tails || 1;
  ctx.strokeStyle = coat;
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.22;
  for (let k = 0; k < tails; k++) {
    const sd = tails === 1 ? 0 : k === 0 ? -1 : 1;
    const sway = Math.sin(t * 3 + k * 1.7) * r * 0.5;
    ctx.beginPath();
    ctx.moveTo(-r * 0.9, wig);
    ctx.bezierCurveTo(-r * 1.5, sway + sd * r * 0.4, -r * 1.9, -sway + sd * r * 0.7, -r * 2.2, sway * 0.4 + sd * r * 0.9);
    ctx.stroke();
    if (tails > 1) {
      ctx.fillStyle = '#7fd8ff';
      ctx.globalAlpha = alpha * (0.6 + Math.sin(t * 9 + k) * 0.3);
      ctx.beginPath(); ctx.arc(-r * 2.2, sway * 0.4 + sd * r * 0.9, r * 0.2, 0, TAU); ctx.fill();
      ctx.globalAlpha = alpha;
    }
  }
  ctx.lineCap = 'butt';
  // Fur puffed up (the hiss).
  if (e.puffed > 0) {
    ctx.fillStyle = coat;
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * TAU;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.7);
      ctx.lineTo(Math.cos(a + 0.12) * r * 1.25, Math.sin(a + 0.12) * r * 1.25);
      ctx.lineTo(Math.cos(a + 0.24) * r * 0.7, Math.sin(a + 0.24) * r * 0.7);
      ctx.fill();
    }
  }
  // Body and haunches.
  ctx.fillStyle = coat;
  ctx.beginPath(); ctx.ellipse(-r * 0.25, wig, r * 0.8, r * 0.62, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(r * 0.25, 0, r * 0.62, r * 0.5, 0, 0, TAU); ctx.fill();
  // Ra's cat: a golden mane and sun marks; the Cat Sìth: the white star on the chest.
  if (e.form === 'ra') {
    ctx.strokeStyle = SUN;
    ctx.lineWidth = 3;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU;
      ctx.beginPath(); ctx.moveTo(r * 0.75 + Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45); ctx.lineTo(r * 0.75 + Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8); ctx.stroke();
    }
  }
  if (e.form === 'sith') {
    ctx.fillStyle = '#f4f0ff';
    ctx.beginPath(); ctx.arc(r * 0.35, 0, r * 0.2, 0, TAU); ctx.fill();
  }
  // Paws.
  ctx.fillStyle = coat;
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(r * 0.55, sd * r * 0.42, r * 0.2, r * 0.15, 0, 0, TAU); ctx.fill(); }
  // Collar and bell.
  ctx.strokeStyle = e.form === 'sith' ? '#6a5a8a' : GOLD;
  ctx.lineWidth = r * 0.12;
  ctx.beginPath(); ctx.arc(r * 0.72, 0, r * 0.36, PI * 0.55, PI * 1.45); ctx.stroke();
  ctx.fillStyle = GOLD;
  ctx.beginPath(); ctx.arc(r * 0.42, 0, r * 0.1, 0, TAU); ctx.fill();
  // Head and ears.
  ctx.fillStyle = coat;
  ctx.beginPath(); ctx.arc(r * 0.8, 0, r * 0.42, 0, TAU); ctx.fill();
  for (const sd of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(r * 0.72, sd * r * 0.22);
    ctx.lineTo(r * 0.62, sd * r * 0.62);
    ctx.lineTo(r * 0.98, sd * r * 0.3);
    ctx.closePath();
    ctx.fill();
  }
  // Eyes: they shine (and slow-blink when she purrs).
  const blink = e.blink > 0 ? 0.25 : 1;
  ctx.fillStyle = e.form === 'ra' ? SUN : JADE;
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 8;
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(r * 1.02, sd * r * 0.15, r * 0.08, r * 0.1 * blink, 0, 0, TAU); ctx.fill(); }
  ctx.shadowBlur = 0;
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** A cardboard box for Schrödinger's trick. */
export function drawCatBox(ctx, b, t) {
  const wob = b.wobble > 0 ? Math.sin(t * 50) * 3 * b.wobble : 0;
  ctx.save();
  ctx.translate(b.x + wob, b.y);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-30, 20, 60, 10);
  ctx.fillStyle = '#b8864e';
  ctx.fillRect(-30, -28, 60, 50);
  ctx.fillStyle = '#9a6a3a';
  ctx.fillRect(-30, -28, 60, 10);
  ctx.strokeStyle = '#5a3a1a';
  ctx.lineWidth = 2;
  ctx.strokeRect(-30, -28, 60, 50);
  ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(0, 22); ctx.stroke();
  ctx.fillStyle = '#5a3a1a';
  ctx.font = '800 12px "Segoe UI", Roboto, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', 0, 2);
  ctx.restore();
}

/** Everything around her: lives, props, spirits, and the banners. */
export function drawMauExtras(ctx, e, t) {
  const p = world.player;
  const b = arenaBounds();
  // The laser dot.
  if (e.dot) {
    const k = e.dot.pause > 0 ? 1 + Math.sin(t * 30) * 0.3 : 1;
    ctx.fillStyle = 'rgba(255,40,60,0.35)';
    ctx.beginPath(); ctx.arc(e.dot.x, e.dot.y, 14 * k, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ff2a3c';
    ctx.beginPath(); ctx.arc(e.dot.x, e.dot.y, 5, 0, TAU); ctx.fill();
  }
  // Ghost fire (onibi) and a stolen soul.
  for (const w of e.wisps || []) {
    ctx.fillStyle = 'rgba(127,216,255,0.3)';
    ctx.beginPath(); ctx.arc(w.x, w.y, 16, 0, TAU); ctx.fill();
    ctx.fillStyle = '#c8f0ff';
    ctx.beginPath(); ctx.arc(w.x, w.y, 7, 0, TAU); ctx.fill();
  }
  if (e.soul) {
    ctx.globalAlpha = 0.7 + Math.sin(t * 10) * 0.2;
    ctx.fillStyle = SOUL;
    ctx.beginPath(); ctx.arc(e.soul.x, e.soul.y, 12, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(e.soul.x, e.soul.y, 20, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Freyja's lynxes.
  for (const L of e.lynx || []) {
    ctx.save();
    ctx.translate(L.x, L.y);
    ctx.rotate(L.a);
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#e8d8b0';
    ctx.beginPath(); ctx.ellipse(0, 0, 26, 13, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(22, 0, 10, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3a2a1a';
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(24, sd * 6); ctx.lineTo(22, sd * 16); ctx.lineTo(28, sd * 8); ctx.fill(); }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  // Nine-lives echoes.
  for (const g of e.ghosts || []) {
    ctx.globalAlpha = g.alpha;
    drawMau(ctx, { ...e, x: g.x, y: g.y, face: g.a, z: 0, flash: 0, puffed: 0, wiggle: g.wiggle || 0, alpha: g.alpha, form: 'sith' }, t);
  }
  ctx.globalAlpha = 1;
  // The grin of a vanished cat, and where her bell rings.
  if (e.alpha !== undefined && e.alpha < 0.3 && !e.hidden) {
    ctx.strokeStyle = '#f4f0ff';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(e.x, e.y - 6, 14, 0.2, PI - 0.2); ctx.stroke();
    ctx.fillStyle = JADE;
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(e.x + sd * 9, e.y - 14, 3, 5, 0, 0, TAU); ctx.fill(); }
  }
  // The Yule Cat, peering over the wall.
  if (e.yule > 0) {
    const cx = (b.l + b.r) / 2, cy = b.t - 20;
    ctx.globalAlpha = e.yule * 0.9;
    ctx.fillStyle = '#08060c';
    ctx.beginPath(); ctx.ellipse(cx, cy, 300, 150, 0, 0, PI); ctx.fill();
    for (const sd of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(cx + sd * 150, cy); ctx.lineTo(cx + sd * 250, cy - 90); ctx.lineTo(cx + sd * 270, cy + 30); ctx.fill();
      ctx.fillStyle = '#ffe27a';
      ctx.shadowColor = '#ffe27a';
      ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.ellipse(cx + sd * 90, cy + 60, 30, 20 * (0.3 + 0.7 * Math.abs(Math.sin(t * 0.8))), 0, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#08060c';
      ctx.beginPath(); ctx.ellipse(cx + sd * 90, cy + 60, 6, 18, 0, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // Drowsiness from the lullaby.
  if (p && e.drowsy > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(p.x - 22, p.y - p.r - 22, 44, 5);
    ctx.fillStyle = '#b8a8ff';
    ctx.fillRect(p.x - 22, p.y - p.r - 22, 44 * clamp(e.drowsy, 0, 1), 5);
    ctx.fillStyle = '#d8d0ff';
    ctx.font = '700 12px "Segoe UI", Roboto, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('z', p.x + 26, p.y - p.r - 18 - Math.sin(t * 3) * 3);
  }
  if (e.exposed > 0) {
    ctx.globalAlpha = 0.5 + Math.sin(t * 10) * 0.25;
    ctx.strokeStyle = '#ffe27a';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 14, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // Nine lives, as nine little cat heads across the top.
  const x0 = (b.l + b.r) / 2 - 4 * 26;
  for (let k = 0; k < 9; k++) {
    const alive = k < 10 - e.life;
    const x = x0 + k * 26, y = b.t + 22;
    ctx.globalAlpha = alive ? 1 : 0.25;
    ctx.fillStyle = alive ? GOLD : '#6a6070';
    ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.fill();
    for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + sd * 3, y - 6); ctx.lineTo(x + sd * 8, y - 13); ctx.lineTo(x + sd * 8, y - 3); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  // A new life: its name.
  if (e.lifeFlash > 0 && e.lifeName) {
    const k = clamp(e.lifeFlash, 0, 1);
    ctx.globalAlpha = k;
    ctx.fillStyle = e.form === 'ra' ? SUN : e.form === 'sith' ? '#c8b8ff' : GOLD;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 30px "Segoe UI", Roboto, system-ui, sans-serif';
    ctx.fillText(e.lifeName, (b.l + b.r) / 2, b.t + arena.h * 0.3);
    ctx.font = '700 14px "Segoe UI", Roboto, system-ui, sans-serif';
    ctx.fillText(`${10 - e.life} ${10 - e.life === 1 ? 'life' : 'lives'} left`, (b.l + b.r) / 2, b.t + arena.h * 0.3 + 28);
    ctx.globalAlpha = 1;
  }
}

/** A moonlit temple courtyard: sandstone, cat statues, a ledge of vases, props. */
export function drawMauArena(ctx, e, t) {
  const b = arenaBounds();
  const w = b.r - b.l, h = b.b - b.t;
  ctx.fillStyle = '#2a2218';
  ctx.fillRect(b.l, b.t, w, h);
  ctx.fillStyle = 'rgba(255,220,160,0.05)';
  for (let y = b.t, j = 0; y < b.b; y += 48, j++) {
    for (let x = b.l + (j % 2) * 48; x < b.r; x += 96) ctx.fillRect(x, y, 48, 48);
  }
  // The ledge along the top wall, with its vases.
  ctx.fillStyle = '#4a3a28';
  ctx.fillRect(b.l, b.t, w, 34);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(b.l, b.t + 34, w, 6);
  for (const v of (e && e.vases) || []) {
    if (v.done) continue;
    const y = v.falling ? v.fy : b.t + 20;
    ctx.fillStyle = '#6fb8c8';
    ctx.beginPath(); ctx.ellipse(v.x, y, 9, 13, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#e8d8a8';
    ctx.fillRect(v.x - 6, y - 15, 12, 4);
  }
  // Cat statues along the sides.
  for (const [x, dir] of [[b.l + 26, 1], [b.r - 26, -1]]) {
    for (let k = 0; k < 3; k++) {
      const y = b.t + h * (0.3 + k * 0.28);
      ctx.fillStyle = '#6a5a40';
      ctx.beginPath(); ctx.ellipse(x, y, 14, 20, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(x + dir * 4, y - 20, 9, 0, TAU); ctx.fill();
      ctx.fillStyle = GOLD;
      ctx.beginPath(); ctx.arc(x + dir * 4, y - 12, 2, 0, TAU); ctx.fill();
    }
  }
  if (!e) return;
  // The persea tree of Heliopolis, grown when she becomes Ra's cat.
  if (e.tree > 0) {
    const cx = b.l + w / 2, cy = b.t + h * 0.55;
    ctx.globalAlpha = e.tree;
    ctx.fillStyle = 'rgba(40,90,50,0.55)';
    for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 50, cy + Math.sin(a) * 40, 42, 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#5a3a20';
    ctx.beginPath(); ctx.arc(cx, cy, 16, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // Kot Bayun's golden pillar.
  if (e.pillar) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(e.pillar.x, e.pillar.y + 10, 40, 16, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d8a840';
    ctx.beginPath(); ctx.arc(e.pillar.x, e.pillar.y, 34, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#8a6a20';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  // Hairball goo, Kasha's fire, catnip clouds, catnip pots.
  for (const g of e.puddles) {
    ctx.globalAlpha = clamp(g.t, 0, 1) * 0.6;
    ctx.fillStyle = '#8a7a5a';
    ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, TAU); ctx.fill();
  }
  for (const f of e.fires) {
    ctx.globalAlpha = clamp(f.t / 0.5, 0, 1) * 0.6;
    ctx.fillStyle = '#ff6a20';
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd060';
    ctx.beginPath(); ctx.arc(f.x + Math.sin(t * 9 + f.x) * 5, f.y - 6, f.r * 0.4, 0, TAU); ctx.fill();
  }
  for (const c of e.clouds) {
    ctx.globalAlpha = clamp(c.t, 0, 1) * 0.35;
    ctx.fillStyle = CATNIP;
    ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const pot of e.pots) {
    ctx.fillStyle = '#a0522d';
    ctx.beginPath(); ctx.ellipse(pot.x, pot.y, 16, 12, 0, 0, TAU); ctx.fill();
    if (pot.grow >= 1) {
      ctx.fillStyle = CATNIP;
      for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU + t * 0.5; ctx.beginPath(); ctx.ellipse(pot.x + Math.cos(a) * 8, pot.y - 8 + Math.sin(a) * 5, 7, 4, a, 0, TAU); ctx.fill(); }
    } else {
      ctx.fillStyle = 'rgba(155,232,112,0.5)';
      ctx.beginPath(); ctx.arc(pot.x, pot.y - 6, 6 * pot.grow, 0, TAU); ctx.fill();
    }
  }
}
