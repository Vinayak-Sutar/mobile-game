// The Wilds' maps: the minimap in the corner and the full map screen.
//
// Both are drawn from one picture (wilds-world.js mapCanvas): two pixels for
// every 100-unit cell of the world, painted in as you clear the fog. Where you
// have not been is simply not painted, so the fog is free - the map is dark
// parchment until you walk there, the way maps work in Hollow Knight, Elden
// Ring and most games like them.
//
// The minimap shows a window about 6000 units across round you (the whole
// world at that size would be unreadable). Tap it - or press Tab, or the
// touchpad on a DualSense - for the full map, which pans by dragging and
// zooms in two steps.

import { world, view } from './state.js';
import { TAU, clamp, roundRect } from './util.js';
import { input } from './input.js';
import { REGIONS } from './wilds-layout.js';
import { wildsState, WILDS, FOG, chartOverview, chartProgress } from './wilds-world.js';
import { journey } from './wilds-progress.js';

/** A lamp on a map: a warm dot if kindled, a hollow ring if only seen. */
function lampIcon(ctx, x, y, lit, r) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
  if (lit) { ctx.fillStyle = '#ffb35e'; ctx.fill(); ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 1; ctx.stroke(); }
  else { ctx.strokeStyle = 'rgba(255,200,150,0.6)'; ctx.lineWidth = 1.5; ctx.stroke(); }
}

/** A place on a map: a little keep, red while its champion stands, green once it has fallen. */
function placeIcon(ctx, x, y, won, r) {
  ctx.fillStyle = won ? '#9fe0a0' : '#ff7a5a';
  ctx.fillRect(x - r, y - r * 0.4, r * 2, r * 1.4);
  ctx.fillRect(x - r, y - r, r * 0.6, r * 0.7); ctx.fillRect(x + r * 0.4, y - r, r * 0.6, r * 0.7);
  ctx.strokeStyle = '#1a1014'; ctx.lineWidth = 1; ctx.strokeRect(x - r, y - r * 0.4, r * 2, r * 1.4);
}

/** A site on a map: crossed blades, red while it waits, green once its reliquary is yours. */
function siteIcon(ctx, x, y, claimed, r) {
  ctx.strokeStyle = claimed ? '#9fe0a0' : '#ff6a5a';
  ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.stroke();
}

/** Your smoulder on a map: a pulsing ember. */
function smoulderIcon(ctx, x, y, r) {
  const k = 0.7 + Math.sin(performance.now() * 0.006) * 0.3;
  ctx.fillStyle = `rgba(255,90,40,${k.toFixed(2)})`;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}

const PX = 2 / FOG;                      // map pixels per world unit

/** Has this place's champion fallen (and its reliquary been claimed)? */
function placeWon(W, P) {
  const c = W.sites.find((q) => q.id === `${P.id}:champ`);
  return !!(c && c.claimed);
}

/** A lair on a map: a pale diamond round a dark heart; ash grey once its guardian is gone. */
function lairIcon(ctx, x, y, beaten, r) {
  ctx.fillStyle = beaten ? '#8a8490' : '#e8dcff';
  ctx.beginPath(); ctx.moveTo(x, y - r * 1.3); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r * 1.3); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = '#1a1014'; ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = beaten ? '#3a3440' : '#6a2a8a';
  ctx.beginPath(); ctx.arc(x, y, r * 0.38, 0, TAU); ctx.fill();
}

/** A place or a lair, as the map shows it. */
function markIcon(ctx, x, y, W, P, r) {
  if (P.kind === 'lair') lairIcon(ctx, x, y, P.beaten, r * 1.15);
  else placeIcon(ctx, x, y, placeWon(W, P), r);
}
const INK = '#16121c';

function arrow(ctx, x, y, a, s) {
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
  ctx.lineTo(x + Math.cos(a + 2.4) * s * 0.8, y + Math.sin(a + 2.4) * s * 0.8);
  ctx.lineTo(x + Math.cos(a - 2.4) * s * 0.8, y + Math.sin(a - 2.4) * s * 0.8);
  ctx.closePath();
}

/** The minimap, top right, under the pause button. */
export function drawOverworldMap(ctx) {
  const W = wildsState();
  const p = world.player;
  if (!W || !p || !W.mapCanvas) return;
  const mw = 180, mh = 120;
  const x = view.w - mw - 16, y = 60;
  const span = 6000;                                     // world units across
  const s = mw / span;

  ctx.fillStyle = 'rgba(8,6,13,0.78)';
  roundRect(ctx, x - 4, y - 4, mw + 8, mh + 8, 8); ctx.fill();
  // The window, kept inside the world at its edges.
  const wx = clamp(p.x - span / 2, 0, WILDS.W - span), wy = clamp(p.y - (span * mh / mw) / 2, 0, WILDS.H - span * mh / mw);
  ctx.save();
  roundRect(ctx, x, y, mw, mh, 6); ctx.clip();
  ctx.fillStyle = INK; ctx.fillRect(x, y, mw, mh);
  ctx.imageSmoothingEnabled = false;
  if (W.fogOff && W.overview && W.overview.canvas) ctx.drawImage(W.overview.canvas, wx * PX, wy * PX, span * PX, span * PX * mh / mw, x, y, mw, mh);
  ctx.drawImage(W.mapCanvas, wx * PX, wy * PX, span * PX, span * PX * mh / mw, x, y, mw, mh);
  ctx.imageSmoothingEnabled = true;
  ctx.restore();

  ctx.save();
  roundRect(ctx, x, y, mw, mh, 6); ctx.clip();
  for (const q of W.sites) if (q.seen && q.kind === 'site') siteIcon(ctx, x + (q.x - wx) * s, y + (q.y - wy) * s, q.cleared, 2.5);
  for (const P of W.places) if (P.seen) markIcon(ctx, x + (P.x - wx) * s, y + (P.y - wy) * s, W, P, 4);
  for (const l of W.lamps) if (l.seen || l.lit) lampIcon(ctx, x + (l.x - wx) * s, y + (l.y - wy) * s, l.lit, 3);
  if (journey.smoulder) smoulderIcon(ctx, x + (journey.smoulder.x - wx) * s, y + (journey.smoulder.y - wy) * s, 3.5);
  ctx.restore();
  ctx.fillStyle = '#ffffff';
  arrow(ctx, x + (p.x - wx) * s, y + (p.y - wy) * s, p.face ?? p.aimAngle, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
  roundRect(ctx, x, y, mw, mh, 6); ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '700 10px system-ui';
  ctx.textAlign = 'right';
  ctx.fillText(input.touchMode ? 'tap for the map' : 'Tab · map', x + mw, y + mh + 14);
  ctx.textAlign = 'left';

  // Where a tap opens the full map (input.js checks it).
  input.mapRect = { x: x - 4, y: y - 4, w: mw + 8, h: mh + 22 };
}

// --- the full map ------------------------------------------------------------------

/**
 * Mount the full map on a canvas (the map screen's). Returns controls for the
 * screen's buttons, and a destroy to call when the screen closes.
 * opts.onPick(x, y): a tap (not a drag) on the map, in world units - ghost
 * mode uses it to go straight there.
 */
export function mountWildsMap(canvas, opts = {}) {
  const W = wildsState();
  const p = world.player;
  const st = { zoom: 1, cx: p ? p.x : WILDS.W / 2, cy: p ? p.y : WILDS.H / 2, raf: 0 };
  const ctx = canvas.getContext('2d');
  let cw = 0, ch = 0, dpr = 1;

  const fit = () => Math.min(cw / WILDS.W, ch / WILDS.H) * 0.94;
  const scale = () => fit() * st.zoom;
  const clampCentre = () => {
    const s = scale();
    const hw = cw / s / 2, hh = ch / s / 2;
    st.cx = hw * 2 >= WILDS.W ? WILDS.W / 2 : clamp(st.cx, hw, WILDS.W - hw);
    st.cy = hh * 2 >= WILDS.H ? WILDS.H / 2 : clamp(st.cy, hh, WILDS.H - hh);
  };

  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = canvas.clientWidth; ch = canvas.clientHeight;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    clampCentre();
  }

  function draw(time) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Parchment, darkening to the edges.
    const g = ctx.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, Math.max(cw, ch) * 0.7);
    g.addColorStop(0, '#2a2330'); g.addColorStop(1, '#0e0b12');
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    if (!W || !W.mapCanvas) return;
    const s = scale();
    const ox = cw / 2 - st.cx * s, oy = ch / 2 - st.cy * s;
    const toX = (x) => ox + x * s, toY = (y) => oy + y * s;

    // The world's outline, and the land you have seen.
    ctx.strokeStyle = 'rgba(255,240,220,0.12)'; ctx.lineWidth = 1;
    ctx.strokeRect(toX(0), toY(0), WILDS.W * s, WILDS.H * s);
    ctx.imageSmoothingEnabled = st.zoom < 1.5;
    if (W.fogOff && W.overview && W.overview.canvas) {
      chartOverview(performance.now() + 8);          // keep charting while the map is open
      ctx.drawImage(W.overview.canvas, toX(0), toY(0), WILDS.W * s, WILDS.H * s);
    }
    ctx.drawImage(W.mapCanvas, toX(0), toY(0), WILDS.W * s, WILDS.H * s);
    ctx.imageSmoothingEnabled = true;

    // The names of the lands you have walked.
    ctx.textAlign = 'center';
    ctx.font = `800 ${st.zoom > 1.5 ? 15 : 12}px system-ui`;
    for (const r of REGIONS) {
      if (!W.visited.has(r.id) && !W.fogOff) continue;
      const tx = toX(r.x), ty = toY(r.y);
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(r.name, tx + 1, ty + 1);
      ctx.fillStyle = 'rgba(255,236,200,0.92)'; ctx.fillText(r.name, tx, ty);
    }

    // The sites you have seen, the Ashlamps (kindled, or seen), and your smoulder.
    for (const q of W.sites) if ((q.seen || W.fogOff) && q.kind === 'site') siteIcon(ctx, toX(q.x), toY(q.y), q.cleared, st.zoom > 1.5 ? 5 : 3);
    ctx.font = '700 10px system-ui';
    ctx.textAlign = 'center';
    for (const P of W.places) {
      if (!P.seen && !W.fogOff) continue;
      markIcon(ctx, toX(P.x), toY(P.y), W, P, st.zoom > 1.5 ? 8 : 5);
      if (st.zoom > 1.5) { ctx.fillStyle = P.kind === 'lair' ? 'rgba(232,220,255,0.95)' : 'rgba(255,200,180,0.9)'; ctx.fillText(P.name, toX(P.x), toY(P.y) + 20); }
    }
    ctx.font = '700 11px system-ui';
    ctx.textAlign = 'center';
    for (const l of W.lamps) {
      if (!l.seen && !l.lit && !W.fogOff) continue;
      lampIcon(ctx, toX(l.x), toY(l.y), l.lit, st.zoom > 1.5 ? 6 : 4);
      if (st.zoom > 1.5 && l.lit) { ctx.fillStyle = 'rgba(255,217,160,0.9)'; ctx.fillText(l.name, toX(l.x), toY(l.y) - 10); }
    }
    if (journey.smoulder) smoulderIcon(ctx, toX(journey.smoulder.x), toY(journey.smoulder.y), 6);

    // You.
    if (p) {
      const px = toX(p.x), py = toY(p.y);
      const pulse = 1 + Math.sin(time * 0.006) * 0.25;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, 12 * pulse, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      arrow(ctx, px, py, p.face ?? p.aimAngle, 8); ctx.fill();
    }

    // How much of the world you have seen.
    let seen = 0;
    for (let k = 0; k < W.fog.length; k++) seen += W.fog[k];
    ctx.textAlign = 'left';
    ctx.font = '700 12px system-ui';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(`Explored ${(seen / W.fog.length * 100).toFixed(1)}%  ·  lands found ${W.visited.size} / ${REGIONS.length}`, 14, 22);
    let line = 40;
    if (W.fogOff) {
      const k = chartProgress();
      ctx.fillStyle = '#ffd45e';
      ctx.fillText(k < 1 ? `Fog off \u00b7 charting the whole map ${Math.round(k * 100)}%` : 'Fog off \u00b7 the whole map', 14, line);
      line += 18;
    }
    if (opts.hint) {
      ctx.fillStyle = '#9fe8ff';
      ctx.fillText(opts.hint, 14, line);
    }
  }

  function loop(t) {
    draw(t);
    st.raf = requestAnimationFrame(loop);
  }

  // Dragging pans (mouse or finger).
  let drag = null;
  const down = (ev) => {
    canvas.setPointerCapture?.(ev.pointerId);
    drag = { x: ev.clientX, y: ev.clientY, cx: st.cx, cy: st.cy, t: performance.now() };
  };
  const move = (ev) => {
    if (!drag) return;
    const s = scale();
    st.cx = drag.cx - (ev.clientX - drag.x) / s;
    st.cy = drag.cy - (ev.clientY - drag.y) / s;
    clampCentre();
  };
  const up = (ev) => {
    // A tap - hardly moved, quickly let go - picks a spot rather than panning.
    if (drag && opts.onPick && Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) < 8 && performance.now() - drag.t < 400) {
      const r = canvas.getBoundingClientRect();
      const s = scale();
      const x = st.cx + (ev.clientX - r.left - cw / 2) / s, y = st.cy + (ev.clientY - r.top - ch / 2) / s;
      drag = null;
      opts.onPick(clamp(x, 40, WILDS.W - 40), clamp(y, 40, WILDS.H - 40), s);
      return;
    }
    drag = null;
  };
  const wheel = (ev) => { ev.preventDefault(); ev.deltaY < 0 ? api.zoomIn() : api.zoomOut(); };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', wheel, { passive: false });
  window.addEventListener('resize', size);

  const api = {
    zoomIn() { st.zoom = Math.min(6, st.zoom * 2); clampCentre(); },
    zoomOut() { st.zoom = Math.max(1, st.zoom / 2); clampCentre(); },
    centre() { if (p) { st.cx = p.x; st.cy = p.y; clampCentre(); } },
    destroy() {
      cancelAnimationFrame(st.raf);
      window.removeEventListener('resize', size);
    },
  };
  size();
  st.raf = requestAnimationFrame(loop);
  return api;
}
