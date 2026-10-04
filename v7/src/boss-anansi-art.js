// Kwaku Anansi, Keeper of All Stories — the drawing: the spider, his web in
// the canopy, and the props of his tales (the gourd, gum dolls, pits, the
// python and leopard spirits, the pot of wisdom, his shed skin).
// boss-anansi.js owns the fight; this only reads its fields.

import { world, arena, arenaBounds } from './state.js';
import { TAU, clamp } from './util.js';

const PI = Math.PI;
export const SILK = '#e8e4d8';
export const AMBER = '#e8a030';
export const EARTH = '#6a3a1a';
export const STORY = '#ffd45e';
export const HORNET = '#ffcc30';
export const SPIRIT = '#8ad8c8';

/** Anansi: eight jointed legs, a patterned abdomen, a storyteller's gold. */
export function drawAnansi(ctx, e, t) {
  const r = e.r;
  const alpha = e.alpha ?? 1;
  const lift = (e.up || 0) * 60;
  ctx.save();
  // His shadow stays where he'll land.
  ctx.globalAlpha = 0.35 * alpha;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(e.x, e.y + r * 0.5, r * 1.2 * (1 - (e.up || 0) * 0.5), r * 0.5 * (1 - (e.up || 0) * 0.5), 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = alpha * (1 - (e.up || 0) * 0.6);
  // A silk thread up to the canopy while he climbs.
  if (e.up > 0) {
    ctx.strokeStyle = SILK;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(e.x, e.y - lift); ctx.lineTo(e.x, arenaBounds().t); ctx.stroke();
  }
  ctx.translate(e.x, e.y - lift);
  ctx.rotate(e.face || 0);
  const gait = Math.sin((e.legPhase || 0));
  const bodyC = e.flash > 0 ? '#ffffff' : e.stuck > 0 ? '#9a8a6a' : '#2a1a12';
  // Eight legs: two joints each, alternating steps.
  ctx.strokeStyle = bodyC;
  ctx.lineCap = 'round';
  for (const sd of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const base = (-0.6 + k * 0.42) * PI / 2;
      const step = (k % 2 ? 1 : -1) * sd * gait * 0.22;
      const a1 = sd * (PI / 2) + sd * base * -1 + step;
      const kx = Math.cos(a1) * r * 1.1, ky = Math.sin(a1) * r * 1.1;
      const a2 = a1 + sd * 0.7 * (k < 2 ? -1 : 1) * 0.6;
      const fx = kx + Math.cos(a2 + (k < 2 ? -0.5 : 0.5) * sd) * r * 1.0;
      const fy = ky + Math.sin(a2 + (k < 2 ? -0.5 : 0.5) * sd) * r * 1.0;
      ctx.lineWidth = r * 0.16;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(kx, ky); ctx.stroke();
      ctx.lineWidth = r * 0.11;
      ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
      ctx.fillStyle = AMBER;
      ctx.beginPath(); ctx.arc(kx, ky, r * 0.07, 0, TAU); ctx.fill();
    }
  }
  ctx.lineCap = 'butt';
  // Abdomen with a woven gold pattern; brighter once all stories are his.
  ctx.fillStyle = bodyC;
  ctx.beginPath(); ctx.ellipse(-r * 0.55, 0, r * 0.75, r * 0.62, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = e.phase >= 2 ? STORY : AMBER;
  ctx.lineWidth = 2;
  for (let k = -1; k <= 1; k++) {
    ctx.beginPath(); ctx.moveTo(-r * 1.1, k * r * 0.3); ctx.lineTo(-r * 0.05, k * r * 0.3); ctx.stroke();
  }
  for (let k = 0; k < 4; k++) {
    const x = -r * (0.95 - k * 0.25);
    ctx.beginPath(); ctx.moveTo(x, -r * 0.45); ctx.lineTo(x + r * 0.12, 0); ctx.lineTo(x, r * 0.45); ctx.stroke();
  }
  // Head and eight eyes.
  ctx.fillStyle = bodyC;
  ctx.beginPath(); ctx.arc(r * 0.35, 0, r * 0.42, 0, TAU); ctx.fill();
  ctx.fillStyle = e.phase >= 2 ? STORY : '#ff9a3d';
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 6;
  for (const [x, y, s] of [[0.62, -0.1, 0.07], [0.62, 0.1, 0.07], [0.52, -0.24, 0.05], [0.52, 0.24, 0.05], [0.44, -0.08, 0.04], [0.44, 0.08, 0.04], [0.36, -0.3, 0.035], [0.36, 0.3, 0.035]]) {
    ctx.beginPath(); ctx.arc(x * r, y * r, s * r, 0, TAU); ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** His shed skin: a pale, still husk (a decoy). */
export function drawHusk(ctx, h, e, t) {
  drawAnansi(ctx, { ...e, x: h.x, y: h.y, face: h.face, up: 0, alpha: 0.55 + Math.sin(t * 3) * 0.1, flash: 0, stuck: 1, legPhase: 0, phase: 1 }, t);
}

/** The canopy web: strands, trees at the edges, dappled light. */
export function drawAnansiArena(ctx, e, t) {
  const b = arenaBounds();
  const w = b.r - b.l, h = b.b - b.t;
  ctx.fillStyle = '#1a2414';
  ctx.fillRect(b.l, b.t, w, h);
  // Dappled light through leaves.
  for (let k = 0; k < 14; k++) {
    const x = b.l + ((k * 181) % w), y = b.t + ((k * 97) % h);
    ctx.fillStyle = `rgba(220,240,160,${0.04 + 0.02 * Math.sin(t * 0.6 + k)})`;
    ctx.beginPath(); ctx.arc(x, y, 50 + (k % 3) * 20, 0, TAU); ctx.fill();
  }
  // Tree trunks at the corners.
  for (const [x, y] of [[b.l + 30, b.t + 40], [b.r - 30, b.t + 40], [b.l + 30, b.b - 30], [b.r - 30, b.b - 30]]) {
    ctx.fillStyle = '#3a2a1a';
    ctx.beginPath(); ctx.arc(x, y, 34, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#2a1a0a';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, 22, 0, TAU); ctx.stroke();
  }
  if (!e) return;
  // The web: sticky strands (they tremble when something touches them).
  for (const s of e.strands || []) {
    const tr = s.tremble > 0 ? Math.sin(t * 60) * 2 * s.tremble : 0;
    ctx.strokeStyle = s.tremble > 0 ? '#ffffff' : 'rgba(232,228,216,0.55)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(s.x0, s.y0 + tr); ctx.lineTo(s.x1, s.y1 - tr); ctx.stroke();
  }
  const cx = (b.l + b.r) / 2, cy = (b.t + b.b) / 2;
  ctx.strokeStyle = 'rgba(232,228,216,0.22)';
  ctx.lineWidth = 1.5;
  for (const rr of [70, 140, 210]) { ctx.beginPath(); ctx.ellipse(cx, cy, rr * 1.6, rr, 0, 0, TAU); ctx.stroke(); }
  // Leopard pits: a faint ring of disturbed earth (look closely).
  for (const pit of e.pits || []) {
    ctx.globalAlpha = pit.trapped ? 0.9 : 0.35;
    ctx.fillStyle = pit.trapped ? '#1a1008' : 'rgba(90,60,30,0.6)';
    ctx.beginPath(); ctx.ellipse(pit.x, pit.y, pit.r, pit.r * 0.7, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#8a6a3a';
    ctx.setLineDash([5, 6]);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = 1;
  // Gum dolls with their plate of yams.
  for (const d of e.dolls || []) {
    ctx.fillStyle = '#5a3a18';
    ctx.beginPath(); ctx.ellipse(d.x, d.y, 16, 22, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(d.x, d.y - 24, 11, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(40,24,8,0.8)';
    ctx.globalAlpha = 0.6 + Math.sin(t * 4 + d.x) * 0.2;
    ctx.beginPath(); ctx.ellipse(d.x, d.y + 4, 20, 26, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#d8a060';
    for (const k of [-6, 0, 6]) { ctx.beginPath(); ctx.ellipse(d.x + k, d.y + 20, 5, 3, 0, 0, TAU); ctx.fill(); }
  }
  // Egg sacs.
  for (const g of e.eggs || []) {
    ctx.fillStyle = SILK;
    ctx.beginPath(); ctx.ellipse(g.x, g.y, 18 + Math.sin(t * 8) * g.k * 2, 22, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(g.x - 14, g.y - 12 + k * 10); ctx.lineTo(g.x + 14, g.y - 8 + k * 10); ctx.stroke(); }
  }
}

/** Over everything: the python, the leopard, the gourd, the pot, the tether, banners. */
export function drawAnansiExtras(ctx, e, t) {
  const b = arenaBounds();
  // The python stretched along the measuring stick.
  if (e.python) {
    const P = e.python;
    const k = clamp(P.k, 0, 1);
    const x1 = P.x0 + (P.x1 - P.x0) * k, y1 = P.y0 + (P.y1 - P.y0) * k;
    ctx.strokeStyle = '#8a6a2a';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(P.x0, P.y0); ctx.lineTo(P.x1, P.y1); ctx.stroke();
    ctx.strokeStyle = 'rgba(80,140,60,0.9)';
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const px = P.x0 + (x1 - P.x0) * u, py = P.y0 + (y1 - P.y0) * u;
      const nx = -(P.y1 - P.y0), ny = P.x1 - P.x0;
      const m = Math.hypot(nx, ny) || 1;
      const wv = Math.sin(u * 12 + t * 6) * 8 * (1 - (P.tied || 0));
      if (i) ctx.lineTo(px + nx / m * wv, py + ny / m * wv); else ctx.moveTo(px, py);
    }
    ctx.stroke();
    ctx.lineCap = 'butt';
  }
  // The leopard spirit.
  if (e.leopard) {
    const L = e.leopard;
    ctx.save();
    ctx.translate(L.x, L.y);
    ctx.rotate(L.a);
    ctx.globalAlpha = L.trapped ? 0.4 : 0.85;
    ctx.fillStyle = '#d8a848';
    ctx.beginPath(); ctx.ellipse(0, 0, 30, 15, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(26, 0, 11, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3a2a10';
    for (const [x, y] of [[-14, -5], [-4, 6], [6, -6], [-20, 5], [14, 4]]) { ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = '#d8a848';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-28, 0); ctx.quadraticCurveTo(-44, 10, -50, Math.sin(t * 6) * 8); ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  // The hornet gourd: shoot it while it's full.
  if (e.gourd) {
    const G = e.gourd;
    const wob = G.full ? Math.sin(t * 40) * 2 : 0;
    ctx.fillStyle = '#c89a4a';
    ctx.beginPath(); ctx.ellipse(G.x + wob, G.y, 22, 26, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(G.x + wob, G.y - 28, 10, 12, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#6a4a1a';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (G.full) {
      ctx.fillStyle = HORNET;
      ctx.font = '800 12px "Segoe UI", Roboto, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('bzzz', G.x, G.y - 46);
    }
  }
  // The pot of wisdom, falling.
  if (e.pot) {
    const y = e.pot.y - (e.pot.z || 0);
    ctx.fillStyle = '#8a4a2a';
    ctx.beginPath(); ctx.ellipse(e.pot.x, y, 26, 22, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = STORY;
    ctx.shadowColor = STORY;
    ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.ellipse(e.pot.x, y - 16, 14, 5, 0, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
  }
  // A silk tether pulling you in.
  const p = world.player;
  if (e.tether && p) {
    ctx.strokeStyle = SILK;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(p.x, p.y); ctx.stroke();
  }
  if (e.husk) drawHusk(ctx, e.husk, e, t);
  if (e.exposed > 0) {
    ctx.globalAlpha = 0.5 + Math.sin(t * 10) * 0.25;
    ctx.strokeStyle = '#ffe27a';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 16, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // The chapter of the story he's telling.
  if (e.chapterT > 0 && e.chapter) {
    ctx.globalAlpha = clamp(e.chapterT, 0, 1);
    ctx.fillStyle = STORY;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 26px "Segoe UI", Roboto, system-ui, sans-serif';
    ctx.fillText(e.chapter, (b.l + b.r) / 2, b.t + arena.h * 0.14);
    ctx.globalAlpha = 1;
  }
  if (e.action === 'phase') {
    const k = clamp(1 - e.t / (e.phaseT || 1), 0, 1);
    ctx.globalAlpha = Math.sin(k * PI);
    ctx.fillStyle = STORY;
    ctx.font = '900 40px "Segoe UI", Roboto, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ALL STORIES ARE ANANSI’S', (b.l + b.r) / 2, b.t + arena.h * 0.3);
    ctx.globalAlpha = 1;
  }
}
