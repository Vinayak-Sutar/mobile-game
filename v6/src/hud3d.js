// The heads-up display, and the menus' overlay.
//
// In 3D the HUD is DOM rather than canvas: text stays sharp at any resolution
// and there is no font work to do in WebGL. The information and the colours are
// the 2D game's - a health bar with a lagging ghost behind it, dash and grenade
// charges as pips - so the two versions read the same way.

import { resetMenuFocus } from '../../v5/src/gamepad.js';
import { clamp } from '../../v5/src/util.js';
import { GRENADE } from '../../v5/src/grenade.js';

const overlayEl = () => document.getElementById('overlay');
const hudEl = () => document.getElementById('hud');
const fpsEl = () => document.getElementById('fps');

export function showOverlay(html) {
  const el = overlayEl();
  el.innerHTML = html;
  el.classList.add('on');
  resetMenuFocus();
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

let hp = null, ghost = null, hpText = null, dashRow = null, bombRow = null, hint = null, toast = null;
let shown = 1;              // the lagging health, as a fraction
let toastT = 0;

export function buildHud() {
  const el = hudEl();
  el.innerHTML = `
    <div style="position:absolute;left:24px;top:22px;width:300px">
      <div style="position:relative;height:18px;border:1px solid rgba(255,255,255,.22);border-radius:4px;overflow:hidden;
                  background:rgba(8,6,13,.62)">
        <div id="h-ghost" style="position:absolute;inset:0;width:100%;background:rgba(255,77,94,.35)"></div>
        <div id="h-hp" style="position:absolute;inset:0;width:100%;
             background:linear-gradient(180deg,#ff8a90,#e8354b)"></div>
      </div>
      <div id="h-text" style="margin-top:3px;font-size:11px;letter-spacing:.14em;color:#9a90b5"></div>
      <div id="h-dash" style="display:flex;gap:4px;margin-top:7px"></div>
      <div id="h-bomb" style="display:flex;gap:4px;margin-top:4px"></div>
    </div>
    <div id="h-toast" style="position:absolute;left:0;right:0;top:86px;text-align:center;opacity:0;
         transition:opacity .25s">
      <div id="h-toast-a" style="font-size:20px;font-weight:800;letter-spacing:.16em;text-transform:uppercase"></div>
      <div id="h-toast-b" style="font-size:12px;color:#9a90b5;letter-spacing:.1em"></div>
    </div>
    <div class="hint" id="h-hint"></div>`;
  hp = document.getElementById('h-hp');
  ghost = document.getElementById('h-ghost');
  hpText = document.getElementById('h-text');
  dashRow = document.getElementById('h-dash');
  bombRow = document.getElementById('h-bomb');
  hint = document.getElementById('h-hint');
  toast = document.getElementById('h-toast');
  el.classList.add('on');
}

export function setHint(text) {
  if (hint) hint.textContent = text || '';
}

export function hudToast(title, sub = '', seconds = 2.6) {
  if (!toast) return;
  document.getElementById('h-toast-a').textContent = title;
  document.getElementById('h-toast-b').textContent = sub;
  toast.style.opacity = '1';
  toastT = seconds;
}

/** Pips for a charge row: filled, recharging, or spent. */
function pips(row, count, full, frac, color) {
  while (row.children.length < count) {
    const d = document.createElement('div');
    d.style.cssText = 'width:26px;height:6px;border-radius:3px;background:rgba(255,255,255,.14)';
    row.appendChild(d);
  }
  while (row.children.length > count) row.removeChild(row.lastChild);
  for (let i = 0; i < count; i++) {
    const d = row.children[i];
    if (i < full) d.style.background = color;
    else if (i === full && frac > 0) d.style.background = `linear-gradient(90deg,${color} ${Math.round(frac * 100)}%,rgba(255,255,255,.14) ${Math.round(frac * 100)}%)`;
    else d.style.background = 'rgba(255,255,255,.14)';
  }
}

export function updateHud(p, dt) {
  if (!hp || !p) return;
  const frac = clamp(p.hp / p.stats.maxHp, 0, 1);
  shown += (frac - shown) * (1 - Math.exp(-7 * dt));
  hp.style.width = `${frac * 100}%`;
  ghost.style.width = `${Math.max(frac, shown) * 100}%`;
  hpText.textContent = `${Math.ceil(p.hp)} / ${p.stats.maxHp}`;

  pips(dashRow, p.stats.dashCharges, p.dashStock, p.dashStock < p.stats.dashCharges ? 1 - clamp(p.dashTimer / 0.75, 0, 1) : 0, '#8ef0ff');
  pips(bombRow, GRENADE.maxCharges, p.grenadeStock, p.grenadeStock < GRENADE.maxCharges ? 1 - clamp(p.grenadeTimer / GRENADE.recharge, 0, 1) : 0, '#ffb35e');

  if (toastT > 0) {
    toastT -= dt;
    if (toastT <= 0) toast.style.opacity = '0';
  }
}

export function showFps(on) {
  fpsEl().classList.toggle('on', !!on);
}

export function setFps(text) {
  const el = fpsEl();
  if (el.classList.contains('on')) el.textContent = text;
}

export function hudVisible(on) {
  hudEl().classList.toggle('on', !!on);
}
