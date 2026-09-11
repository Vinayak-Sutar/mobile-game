// Entry point: canvas setup, the fixed-timestep loop, the run state machine
// and every menu screen.

import { world, view, arena, arenaBounds, resetWorld, clearEntities } from './state.js';
import { clamp, TAU, shuffle } from './util.js';
import {
  initAudio, sfx, audio, toggleMute, startMusic, stopMusic,
  setMusicEnabled, setMusicActive, suspendAudio, resumeAudio, setMusicIntensity, unlockAudio,
  setMusicVolume, previewMusic, outputLevel,
} from './audio.js';
import {
  fx, updateFx, drawFxBelow, drawFxAbove, clearFx, flash, ring as ringFx, burst as burstFx,
} from './fx.js';
import { input, initInput, updateInput, endFrameInput, layoutControls, resetInput, controls } from './input.js';
import { createPlayer, updatePlayer, drawPlayer, bufferInput } from './player.js';
import { updateEnemies, drawEnemies, bossInRoom, spawnEnemy as spawnEnemyRef } from './enemies.js';
import { updateStatuses, healPlayer } from './combat.js';
import { updatePoise } from './poise.js';
import {
  updateElements, setDiscoverHook, hitElement, elementArea, applyStatus, drawPlayerElements, REACTIONS,
} from './elements.js';
import { spawnSurface, drawSurfaces, drawClouds } from './surfaces.js';
import {
  SPELLS, SPELL_SLOTS, spellById, spellColor, equipSpell, cooldownLeft, updateSpellZones, drawSpellZones, drawPlayerSpells, tryCast,
} from './spells.js';
import { ELEMENTS } from './elements.js';
import { updateProjectiles, drawProjectiles, updateHitboxes, updatePickups, drawPickups } from './projectiles.js';
import {
  generateRoom, startRoom, updateRoom, drawFloor, drawObstacles, drawDoors, drawRoomIntro, openRoom,
  FINAL_DEPTH, BOSS_EVERY, effDepth,
} from './rooms.js';
import { updateHazards, drawHazardsBelow, drawHazardsAbove } from './hazards.js';
import { BOSS_INFO, CREATURE_BOSSES, clearBullets } from './bosses.js';
import { WEAPONS } from './weapons.js';
import { updateGrenades, drawGrenades, drawGrenadeAim, GRENADE, GRENADE_TYPES, cycleGrenade } from './grenade.js';
import { setParryHook } from './parry.js';
import { updateTraps, drawTrapsBelow, drawTrapsAbove, onTrapKill, setTrapKillHook } from './traps.js';
import { SPECIAL_ROOMS, randomCurse, CHAMBERS } from './chambers.js';
import { setTrapKillFn } from './combat.js';
import { dealDamage } from './combat.js';
import { BIOMES, getBiome, initAmbient, drawAmbient, clearAmbient } from './biomes.js';
import { biomeThumbnail } from './texture.js';
import { offerBoons, applyBoon, describeBoon, GODS } from './boons.js';
import {
  drawHud, drawControls, updateUi, resetUi, showToast, showOverlay, hideOverlay, overlayVisible,
} from './ui.js';
import {
  save, loadSave, writeSave, UPGRADES, upgradeCost, canAfford, buyUpgrade, metaBonuses, bankRun, goldMultiplier,
} from './save.js';
import {
  pad, initGamepad, pollGamepad, updateDualSenseFeedback, resetMenuFocus, resetDualSenseFeedback, rumble,
} from './gamepad.js';
import { dualsense, dualSenseSupported, connectDualSense, probe as probeDualSense } from './dualsense.js';
import { bakeSpriteSheet, bakeTextures, exportAll, exportAsDataURLs, canvasToDataURL, saveAssets } from './bake.js';
import { PLAYER_SKELETON, PLAYER_CLIPS } from './rigs.js';
import { resolvePose, drawSkeleton } from './anim.js';
import {
  initFullscreen, toggleFullscreen, enterFullscreen, isFullscreen,
  fullscreenSupported, registerServiceWorker, isInstalled, screenState,
} from './fullscreen.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
const rotateEl = document.getElementById('rotate');

const STEP = 1 / 60;
let accumulator = 0;
let last = performance.now();
let state = 'title';        // title | mirror | weapon | playing | boon | dead | victory | paused
let deathTimer = 0;
let audioStarted = false;
// A weapon picked while the phone was still upright; the run starts once
// it's been turned sideways.
let pendingWeapon = null;
// Set when the weapon screen was reached from Boss Trials.
let pendingTrial = null;

// --- setup -----------------------------------------------------------------

function resize() {
  const cw = Math.max(320, window.innerWidth);
  const ch = Math.max(240, window.innerHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const aspect = cw / ch;

  // Fixed logical height, width follows the aspect ratio, both clamped so
  // extreme screens do not turn into a completely different game. The height
  // is deliberately small: the whole room is always on screen, so a taller
  // logical viewport just shrinks every entity into an unreadable dot on a
  // phone.
  let ww = 600 * aspect, wh = 600;
  if (ww < 820) { ww = 820; wh = 820 / aspect; }
  if (ww > 1320) { ww = 1320; wh = 1320 / aspect; }

  view.w = Math.round(ww);
  view.h = Math.round(wh);
  view.cw = cw;
  view.ch = ch;
  view.dpr = dpr;
  view.scale = cw / view.w;

  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  canvas.style.width = cw + 'px';
  canvas.style.height = ch + 'px';

  const mx = 38, top = 74, bottom = 38;
  arena.x = mx;
  arena.y = top;
  arena.w = view.w - mx * 2;
  arena.h = view.h - top - bottom;

  layoutControls();
  clampObstacles();
  checkOrientation();
}

/** A phone held upright. Gameplay is landscape-only. */
function isPortraitTouch() {
  return isTouchDevice() && window.innerHeight > window.innerWidth;
}

function inRun() {
  return state === 'playing' || state === 'paused' || state === 'boon' || state === 'dying' || state === 'shrine' || state === 'spellbook';
}

/**
 * Starting a run goes fullscreen and locks landscape, which on Android turns
 * the screen for you. Where the lock isn't available — every iPhone browser —
 * this prompt is the fallback: the run waits (or pauses) until the phone is
 * turned. Menus stay usable upright; only the fight needs landscape.
 */
function checkOrientation() {
  const upright = isPortraitTouch();
  rotateEl.classList.toggle('on', upright && (!!pendingWeapon || inRun()));
  if (!upright && pendingWeapon) {
    const w = pendingWeapon;
    pendingWeapon = null;
    beginRun(w);
  }
  if (upright && state === 'playing') showPause();
}

function clampObstacles() {
  const room = world.room;
  if (!room) return;
  const b = arenaBounds();
  for (const o of room.obstacles) {
    o.x = clamp(o.x, b.l + 40, Math.max(b.l + 40, b.r - 40 - o.w));
    o.y = clamp(o.y, b.t + 40, Math.max(b.t + 40, b.b - 40 - o.h));
  }
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 120));

// --- run lifecycle ---------------------------------------------------------

function startRun(weapon) {
  resetWorld();
  clearFx();
  resetUi();
  resetInput();

  world.biome = pendingBiome || getBiome(save.biome);
  initAmbient(world.biome);

  world.player = createPlayer(weapon, metaBonuses());
  world.player.spells = fullLoadout(save.loadout);
  world.player.grenadeType = GRENADE_TYPES[save.grenadeType] ? save.grenadeType : 'frag';
  world.depth = 1;
  world.loop = 0;
  // A different order of guardians every run; the Warden always closes it.
  world.bossOrder = shuffle(CREATURE_BOSSES);

  const room = generateRoom(1, 0);
  startRoom(room);
  showToast(world.biome.name.toUpperCase(), `Chamber 1 · ${weapon.name}`);

  state = 'playing';
  hideOverlay();
}

/**
 * Boss Trials: straight into one boss fight, with a few boons so it plays
 * like it would mid-run. Nothing is banked — it's practice, not farming.
 */
function startTrial(weapon, bossType) {
  startRun(weapon);
  world.trial = bossType;
  const p = world.player;
  const final = bossType === 'warden';
  const gifts = final ? 8 : 3;
  for (let i = 0; i < gifts; i++) {
    const offer = offerBoons(p, 1);
    if (offer[0]) applyBoon(p, offer[0]);
  }
  p.hp = p.stats.maxHp;
  world.depth = final ? FINAL_DEPTH : BOSS_EVERY * 2;
  clearEntities();
  clearFx();
  const room = generateRoom(world.depth, 0, { bossType, slot: final ? 4 : 1 });
  startRoom(room);
  showToast('BOSS TRIAL', BOSS_INFO[bossType].animal === 'Final' ? 'The final guardian' : BOSS_INFO[bossType].animal);
}

function advanceRoom(special = null, template = null) {
  world.depth++;
  // Shrine pacts count down one chamber at a time.
  for (const c of world.curses) c.rooms--;
  world.curses = world.curses.filter((c) => c.rooms > 0);
  clearEntities();
  clearFx();
  const room = generateRoom(world.depth, world.loop, { special, template });
  if (special) world.lastSpecial = special;
  startRoom(room);
  initAmbient(world.biome || getBiome());
  if (room.final) showToast('THE LAST GATE', 'Something is waiting.');
  else if (room.type === 'boss') showToast(`CHAMBER ${world.depth}`, 'A guardian bars the way.');
  else if (special) showToast(SPECIAL_ROOMS[special].label.toUpperCase(), SPECIAL_ROOMS[special].desc);
  else showToast(`CHAMBER ${world.depth}`, room.type === 'elite' ? 'An elite stalks this hall.' : (room.template || ''));
  state = 'playing';
  hideOverlay();
  // Game time, not setTimeout: a pause or a backgrounded app must not skip the
  // prompt (the shrine's doors only open once it has been answered).
  if (special === 'shrine') room.shrineT = 0.6;
}

// --- shrine (special chamber): a pact for a rare boon -------------------------

let shrineCurse = null;
let shrineBoonPending = false;

function showShrine() {
  state = 'shrine';
  shrineCurse = randomCurse();
  showOverlay(`
    <div class="panel">
      <div class="eyebrow">a shrine hums in the dark</div>
      <h2>${shrineCurse.name}</h2>
      <p class="sub">${shrineCurse.desc}<br>Accept, and choose a <b style="color:#c07bff">rare boon</b> now.</p>
      <div class="row">
        <button class="btn" data-act="shrine-accept">Accept the pact</button>
        <button class="btn ghost" data-act="shrine-decline">Walk away</button>
      </div>
    </div>`);
}

/** The weapon was picked: a normal run, or the Boss Trial chosen before it. */
function beginRun(weapon) {
  const trial = pendingTrial;
  pendingTrial = null;
  if (trial) startTrial(weapon, trial);
  else startRun(weapon);
}

function loopDeeper() {
  world.loop++;
  world.depth = 0;   // advanceRoom increments to 1
  advanceRoom();
  showToast(`LOOP ${world.loop + 1}`, 'The dungeon sharpens its teeth.');
}

function handleDoor(door) {
  if (door.reward === 'exit') {
    if (world.trial) showTrialEnd(true);
    else onVictory();
    return;
  }
  if (SPECIAL_ROOMS[door.reward]) {
    advanceRoom(door.reward);
    return;
  }
  if (door.reward === 'boon') {
    showBoonSelect();
    return;
  }
  if (door.reward === 'heal') {
    healPlayer(Math.round(world.player.stats.maxHp * 0.40));
  } else if (door.reward === 'gold') {
    const amount = Math.round(18 + effDepth(world.depth) * 9);
    world.gold += amount;
    sfx.pickup();
  }
  advanceRoom();
}

/**
 * A spare life. The collapse plays out first (the `dying` state), then the
 * player stands back up where they fell: full health, a long moment of
 * invulnerability, enemy fire wiped and everything nearby shoved back, so a
 * revive can't be instantly undone by what killed you.
 */
function revivePlayer() {
  const p = world.player;
  p.lives--;
  p.dead = false;
  p.hp = p.stats.maxHp;
  p.invuln = 2.5;
  p.vx = p.vy = 0;
  p.attack = null;
  p.charging = false;
  p.dashing = false;
  p.hurtFlash = 0;

  clearBullets();
  for (const e of world.enemies) {
    if (e.dead || e.spawning) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d > 280) continue;
    const a = Math.atan2(e.y - p.y, e.x - p.x);
    const push = (900 * (1 - d / 280)) / Math.max(1, e.mass || 1);
    e.vx = (e.vx || 0) + Math.cos(a) * push;
    e.vy = (e.vy || 0) + Math.sin(a) * push;
  }

  ringFx(p.x, p.y, { r0: 10, r1: 280, color: '#7dff9c', life: 0.6, width: 10 });
  burstFx(p.x, p.y, { count: 40, color: '#7dff9c', speed: 380, size: 5, life: 0.7, drag: 3 });
  flash(0.4, '#c8ffd8');
  sfx.boon();
  showToast('BACK ON YOUR FEET', `${p.lives} ${p.lives === 1 ? 'life' : 'lives'} left`, 2.2);
  state = 'playing';
}

function onDeath() {
  if (world.trial) { showTrialEnd(false); return; }
  bankRun({ gold: world.gold, depth: world.depth, kills: world.kills, won: false });
  state = 'dead';
  showRunEnd(false);
}

function onVictory() {
  bankRun({ gold: world.gold, depth: FINAL_DEPTH, kills: world.kills, won: true });
  state = 'victory';
  flash(0.4, '#ffd9a0');
  showRunEnd(true);
}

// --- loop ------------------------------------------------------------------

function frame(now) {
  requestAnimationFrame(frame);

  // Some mobile browsers (iOS Safari's collapsing URL bar, embedded webviews)
  // resize without ever firing a resize event, and a webview can boot at 0x0.
  // Comparing two integers per frame is cheaper than being stuck at the wrong
  // size forever.
  if (view.cw !== window.innerWidth || view.ch !== window.innerHeight) resize();

  pollGamepad(overlayVisible());

  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;   // tab was backgrounded

  accumulator += dt;
  let guard = 0;
  while (accumulator >= STEP && guard++ < 5) {
    accumulator -= STEP;
    tick(STEP);
  }
  render();
  updateDualSenseFeedback();
}

function tick(dt) {
  updateInput(world.player);

  if (state === 'playing' && input.pausePressed) {
    input.pausePressed = false;
    showPause();
  }
  // The Spellbook (book button, B): swap equipped spells, the game paused.
  // Tapping an empty spell slot opens it on that slot.
  if (state === 'playing' && world.player) {
    const p = world.player;
    if (input.spellCast !== null && !p.spells[input.spellCast]) showSpellbook(input.spellCast);
    else if (input.bookPressed) showSpellbook();
  }
  if (state === 'playing' && input.grenadeCycle && world.player) {
    cycleGrenade(world.player, input.grenadeCycle);
    save.grenadeType = world.player.grenadeType;
  }

  if (state === 'playing') {
    // Presses are buffered before the hitstop check so a freeze can't eat them.
    bufferInput(world.player, dt);
    world.realDt = dt;
    if (fx.hitstop > 0) {
      // Freeze the simulation but keep the feedback layer crawling, so the
      // screen shake still lands during the freeze.
      fx.hitstop -= dt;
      updateFx(dt * 0.18);
    } else {
      const sdt = dt;
      world.runTime += sdt;
      updatePlayer(world.player, sdt);
      updateEnemies(sdt);
      updateStatuses(sdt);
      updatePoise(sdt);
      updateElements(sdt);
      updateHitboxes(sdt);
      updateGrenades(sdt);
      updateSpellZones(sdt);
      updateTraps(sdt);
      updateProjectiles(sdt);
      updateHazards(sdt);
      updatePickups(sdt);
      updateRoom(sdt);
      updateFx(sdt);
      if (world.room.shrineT > 0 && (world.room.shrineT -= dt) <= 0) showShrine();

      // Music follows the fight: calm between waves, full kit in combat,
      // a harder variation once the Warden is up.
      setMusicIntensity(bossInRoom() ? 2 : world.enemies.some((e) => !e.dead) ? 1 : 0);

      const room = world.room;
      if (room && room.chosen) {
        const door = room.chosen;
        room.chosen = null;
        room.doorsOpen = false;
        sfx.door();
        handleDoor(door);
      }

      if (world.player.dead) {
        deathTimer = 1.15;
        state = 'dying';
      }
    }
  } else if (state === 'dying') {
    // updatePlayer early-returns once dead, but still drives the animator so
    // the collapse actually plays out instead of freezing on the last pose.
    updatePlayer(world.player, dt);
    updateFx(dt);
    updateEnemies(dt);
    updateProjectiles(dt);
    updateHazards(dt);
    deathTimer -= dt;
    if (deathTimer <= 0) {
      if (world.player.lives > 1) revivePlayer();
      else onDeath();
    }
  } else {
    updateFx(dt * 0.6);
  }

  updateUi(dt);

  // Single rule for when music plays: during a run, including the boon pick
  // between rooms, and nowhere else — not on menus, not while paused, and it
  // cuts the instant you die so the death sting lands on silence. Evaluated
  // every tick rather than at each state change, so no transition can forget it.
  setMusicActive(state === 'playing' || state === 'boon' || state === 'shrine' || state === 'spellbook');

  endFrameInput();
}

function render() {
  const s = view.dpr * view.scale;
  ctx.setTransform(s, 0, 0, s, 0, 0);

  ctx.fillStyle = '#08060d';
  ctx.fillRect(0, 0, view.w, view.h);

  const inRun = state === 'playing' || state === 'dying' || state === 'boon' || state === 'paused' || state === 'shrine' || state === 'spellbook';

  ctx.save();
  ctx.translate(fx.shakeX, fx.shakeY);

  if (inRun && world.room) {
    drawFloor(ctx, world.runTime);
    drawAmbient(ctx, world.biome);
    drawFxBelow(ctx);
    drawObstacles(ctx);
    drawSurfaces(ctx, world.runTime);
    drawTrapsBelow(ctx, world.runTime);
    drawSpellZones(ctx, world.runTime);
    drawDoors(ctx, world.runTime);
    drawHazardsBelow(ctx, world.runTime);
    drawGrenadeAim(ctx, world.player, world.runTime);
    drawTrapsAbove(ctx, world.runTime);
    drawPickups(ctx);
    drawEnemies(ctx);
    if (world.player) drawPlayer(world.player, ctx);
    if (world.player) drawPlayerElements(ctx, world.player);
    if (world.player) drawPlayerSpells(ctx, world.player, world.runTime);
    drawClouds(ctx, world.runTime);
    drawProjectiles(ctx);
    drawHazardsAbove(ctx);
    drawGrenades(ctx, world.runTime);
    drawFxAbove(ctx);
    drawRoomIntro(ctx, world.room, world.runTime);
  } else {
    drawMenuBackdrop();
  }

  ctx.restore();

  if (inRun) {
    drawHud(ctx, world.runTime);
    if (state === 'playing') drawControls(ctx, world.runTime);
    drawLowHealthVignette();
  }

  if (fx.flash > 0.001) {
    ctx.globalAlpha = clamp(fx.flash, 0, 1);
    ctx.fillStyle = fx.flashColor;
    ctx.fillRect(0, 0, view.w, view.h);
    ctx.globalAlpha = 1;
  }
}

function drawLowHealthVignette() {
  const p = world.player;
  if (!p) return;
  const frac = p.hp / p.stats.maxHp;
  const danger = frac < 0.35 ? (0.35 - frac) / 0.35 : 0;
  const amount = Math.max(danger * (0.35 + Math.sin(world.runTime * 4) * 0.12), fx.vignette * 0.5);
  if (amount <= 0.01) return;

  const g = ctx.createRadialGradient(
    view.w / 2, view.h / 2, Math.min(view.w, view.h) * 0.28,
    view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.62,
  );
  g.addColorStop(0, 'rgba(255,0,40,0)');
  g.addColorStop(1, `rgba(255,0,40,${clamp(amount, 0, 0.6)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, view.w, view.h);
}

let bgSeed = [];
function drawMenuBackdrop() {
  if (bgSeed.length === 0) {
    for (let i = 0; i < 46; i++) {
      bgSeed.push({ x: Math.random(), y: Math.random(), r: Math.random() * 2.4 + 0.6, s: Math.random() * 0.4 + 0.1 });
    }
  }
  const t = performance.now() / 1000;
  for (const p of bgSeed) {
    const y = ((p.y + t * p.s * 0.03) % 1) * view.h;
    ctx.globalAlpha = 0.16 + Math.sin(t + p.x * 20) * 0.1;
    ctx.fillStyle = '#ff9a4d';
    ctx.beginPath();
    ctx.arc(p.x * view.w, view.h - y, p.r, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// --- menus -----------------------------------------------------------------

function statBlock() {
  return `
    <div class="stats">
      <div class="stat"><b>${save.best.depth}</b><span>Best chamber</span></div>
      <div class="stat"><b>${save.wins}</b><span>Escapes</span></div>
      <div class="stat"><b>${save.runs}</b><span>Runs</span></div>
      <div class="stat"><b>${save.darkness}</b><span>Darkness</span></div>
    </div>`;
}

function fullscreenRow() {
  if (!fullscreenSupported() || isInstalled()) return '';
  return `<div class="row"><button class="btn ghost" data-act="fullscreen">
    ${isFullscreen() ? 'Leave Fullscreen' : 'Play Fullscreen'} <kbd>F</kbd>
  </button></div>`;
}

function musicVolumeRow() {
  const pct = Math.round(audio.musicVolume * 100);
  // Big +/- buttons as well as the slider: easy to hit on a phone, and the
  // only way to adjust it from a gamepad, since menu navigation drives buttons.
  return `
    <div class="volrow">
      <span class="vollabel">Music volume</span>
      <button class="volbtn" data-act="vol-down" aria-label="Music quieter">−</button>
      <input type="range" id="musicvol" min="0" max="100" step="5" value="${pct}" aria-label="Music volume">
      <button class="volbtn" data-act="vol-up" aria-label="Music louder">+</button>
      <span class="volval" id="musicvolval">${pct}%</span>
    </div>`;
}

function applyMusicVolume(v) {
  ensureAudio();
  setMusicVolume(v);
  save.musicVolume = audio.musicVolume;
  writeSave();
  previewMusic();
  const pct = Math.round(audio.musicVolume * 100);
  const slider = document.getElementById('musicvol');
  const label = document.getElementById('musicvolval');
  if (slider) slider.value = String(pct);
  if (label) label.textContent = `${pct}%`;
}

/**
 * Version 1 (the original eight-chamber game) is kept as a separate, frozen
 * copy in ./v1/ with its own save. This row switches between the two.
 */
function versionRow() {
  return `
    <div class="versions">
      <button class="ver" data-act="version" data-href="../v1/">Version 1<small>8 chambers · 1 boss</small></button>
      <button class="ver" data-act="version" data-href="../">Version 2<small>15 chambers · 5 bosses</small></button>
      <button class="ver on" data-act="version-here" aria-current="true">Version 3<small>spells · elements · traps</small></button>
    </div>`;
}

/** A phone or tablet, judged by the device rather than by recent input. */
function isTouchDevice() {
  return window.matchMedia('(pointer: coarse)').matches;
}

function dualSenseRow() {
  if (!dualSenseSupported()) {
    // WebHID is gated behind a secure context, so plain http:// on a LAN IP
    // silently has no navigator.hid at all. Say so rather than vanishing.
    const why = !window.isSecureContext
      ? `Lightbar and adaptive triggers need a secure context. You're on
         <b>${location.origin}</b> — open the game on
         <b>http://localhost:${location.port || 80}</b> from this PC, or start the
         server with <b>--https</b>.`
      : 'This browser has no WebHID. Use desktop Chrome or Edge.';
    return `<div class="sub" style="margin-top:14px;opacity:.75">${why}</div>`;
  }
  if (dualsense.connected) {
    return `<div class="row"><button class="btn ghost" data-act="dsprobe">DualSense linked (${dualsense.transport.toUpperCase()}) - test lightbar</button></div>`;
  }
  const err = dualsense.error ? `<div class="sub" style="color:#ff8a8a;margin-top:8px">${dualsense.error}</div>` : '';
  return `<div class="row"><button class="btn ghost" data-act="dsconnect">Link DualSense (lightbar + triggers)</button></div>${err}`;
}

function showTitle() {
  state = 'title';
  showOverlay(`
    <div class="panel">
      <div class="eyebrow">top-down action roguelike · prototype</div>
      <h1>Ashfall</h1>
      ${versionRow()}
      <p class="sub">Fifteen chambers and five guardians stand between you and the surface.
      You have three lives.
      Clear a room, choose a door, take a boon, go deeper.
      Death is not the end — the darkness you carry out makes you stronger.</p>
      <div class="row">
        <button class="btn" data-act="biome">Begin Run</button>
        <button class="btn ghost" data-act="trials">Boss Trials</button>
        <button class="btn ghost" data-act="mirror">Mirror of Night · ${save.darkness} ◆</button>
        <button class="btn ghost" data-act="padcheck">Controller Check</button>
      </div>
      ${fullscreenRow()}
      ${statBlock()}
      ${musicVolumeRow()}
      ${dualSenseRow()}
      <div class="keys">
        <b>Touch</b> — left half drags to move · <kbd>ATK</kbd> attack · <kbd>DASH</kbd> dash ·
        <kbd>SPEC</kbd> special · <kbd>BOMB</kbd> grenade (drag from it to aim) · <kbd>⟳</kbd> grenade type ·
        four spell buttons · <kbd>📖</kbd> spellbook<br>
        <b>Keyboard</b> — <kbd>WASD</kbd> move · <kbd>mouse</kbd> aim · <kbd>click</kbd>/<kbd>J</kbd> attack ·
        <kbd>Space</kbd> dash · <kbd>K</kbd> special · <kbd>G</kbd> grenade (hold to aim) · <kbd>R</kbd>/<kbd>wheel</kbd> grenade type · <kbd>1</kbd>–<kbd>4</kbd> spells ·
        <kbd>B</kbd> spellbook ·
        <kbd>M</kbd> mute · <kbd>Esc</kbd> pause<br>
        <b>Controller</b> — <kbd>L stick</kbd> move · <kbd>R stick</kbd> aim · <kbd>R2</kbd> attack ·
        <kbd>L2</kbd> special · <kbd>✕</kbd> dash · <kbd>○</kbd> grenade (hold + R stick) · <kbd>L1</kbd> grenade type ·
        hold <kbd>R1</kbd> + <kbd>✕○□△</kbd> spells ·
        <kbd>Options</kbd> pause
      </div>
    </div>`);
}

let pendingBiome = null;

function showBiomeSelect() {
  state = 'biome';
  const cards = BIOMES.map((b, i) => {
    // A real tile of the biome's own floor, so the choice previews itself.
    const tile = biomeThumbnail(b, 96);
    return `
      <div class="card biomecard" data-act="biome-pick" data-idx="${i}"
           style="border-color:${b.accent}55;background-image:url(${tile})">
        <div class="biomeveil"></div>
        <div class="biometext">
          <div class="name" style="color:${b.accent}">${b.name}</div>
          <div class="desc">${b.tagline}</div>
        </div>
      </div>`;
  }).join('');

  showOverlay(`
    <div class="panel">
      <div class="eyebrow">where the gate opens</div>
      <h2>Choose your descent</h2>
      <p class="sub">Terrain only — every biome runs the same fifteen chambers.</p>
      <div class="cards">${cards}</div>
      <div class="row"><button class="btn ghost" data-act="title">Back</button></div>
    </div>`);
}

function showWeaponSelect() {
  state = 'weapon';
  const cards = WEAPONS.map((w, i) => `
    <div class="card" data-act="pick" data-idx="${i}" style="border-color:${w.color}55">
      <div class="glyph" style="color:${w.color}">${w.glyph}</div>
      <div class="name" style="color:${w.color}">${w.name}</div>
      <div class="desc">${w.tagline}</div>
      <div class="tag" style="color:${w.color}">${w.specialName}</div>
    </div>`).join('');

  showOverlay(`
    <div class="panel">
      <div class="eyebrow">choose your arm</div>
      <h2>Take up a weapon</h2>
      <div class="cards">${cards}</div>
      <div class="row"><button class="btn ghost" data-act="title">Back</button></div>
    </div>`);
}

// --- spell loadout (Version 3) -------------------------------------------------

const LOADOUT_SIZE = SPELL_SLOTS;
let chosenWeapon = null;

/** The saved loadout, cleaned of unknown ids (a renamed spell can't break a save). */
function validLoadout(list) {
  const ids = (Array.isArray(list) ? list : []).filter((id) => spellById(id));
  return [...new Set(ids)].slice(0, LOADOUT_SIZE);
}

/** Exactly four slots for a run; empty ones are null (tap one to fill it). */
function fullLoadout(list) {
  const ids = validLoadout(list);
  while (ids.length < SPELL_SLOTS) ids.push(null);
  return ids;
}

function showLoadout() {
  state = 'loadout';
  const chosen = validLoadout(save.loadout);
  const cards = SPELLS.map((sp) => {
    const on = chosen.includes(sp.id);
    const c = ELEMENTS[sp.element] ? ELEMENTS[sp.element].color : '#fff';
    return `
      <div class="card spellcard ${on ? 'picked' : ''}" data-act="spell-toggle" data-spell="${sp.id}"
           style="border-color:${c}${on ? 'ee' : '44'}">
        <div class="glyph" style="color:${c}">${sp.glyph}</div>
        <div class="name" style="color:${c}">${sp.name}</div>
        <div class="tag">${ELEMENTS[sp.element] ? ELEMENTS[sp.element].name : ''} · ${sp.cd}s cooldown</div>
        <div class="desc">${sp.desc}</div>
      </div>`;
  }).join('');
  showOverlay(`
    <div class="panel">
      <div class="eyebrow">${chosenWeapon ? chosenWeapon.name : ''} · choose four spells to start with</div>
      <h2>Spell Loadout <span style="opacity:.6;font-size:.6em">${chosen.length}/${LOADOUT_SIZE}</span></h2>
      <p class="sub">Every spell has its own cooldown. You can swap any of them during the run from the
      Spellbook (the book button, or B). Every grenade type is yours too: switch with TYPE (R, the mouse wheel, L1).
      Elements combine: rain then lightning, frost on the wet, fire on poison… try things.</p>
      <div class="cards">${cards}</div>
      <div class="row">
        <button class="btn" data-act="loadout-go" ${chosen.length ? '' : 'disabled'}>Begin</button>
        <button class="btn ghost" data-act="weapon">Back</button>
      </div>
    </div>`);
}


// --- the Spellbook: swap equipped spells mid-run (the game is paused) -----------

let spellbookSlot = 0;

function showSpellbook(slot = null) {
  const p = world.player;
  if (!p) return;
  state = 'spellbook';
  if (slot !== null) spellbookSlot = slot;
  const slots = [];
  for (let i = 0; i < SPELL_SLOTS; i++) {
    const sp = spellById(p.spells[i]);
    const c = sp ? spellColor(sp) : '#ffffff';
    const on = i === spellbookSlot;
    slots.push(`
      <div class="card spellcard sbslot ${on ? 'picked' : ''}" data-act="sb-slot" data-idx="${i}"
           style="border-color:${c}${on ? 'ee' : '44'}">
        <div class="tag">SLOT ${i + 1}</div>
        <div class="glyph" style="color:${c}">${sp ? sp.glyph : '+'}</div>
        <div class="name" style="color:${c}">${sp ? sp.name : 'Empty'}</div>
      </div>`);
  }
  const cards = SPELLS.map((sp) => {
    const c = spellColor(sp);
    const at = p.spells.indexOf(sp.id);
    const left = cooldownLeft(p, sp.id);
    const el = ELEMENTS[sp.element] ? ELEMENTS[sp.element].name : '';
    return `
      <div class="card spellcard ${at >= 0 ? 'equipped' : ''}" data-act="sb-spell" data-spell="${sp.id}"
           style="border-color:${c}${at >= 0 ? 'aa' : '44'}">
        <div class="glyph" style="color:${c}">${sp.glyph}</div>
        <div class="name" style="color:${c}">${sp.name}</div>
        <div class="tag">${el} · ${sp.cd}s${at >= 0 ? ` · in slot ${at + 1}` : ''}${left > 0 ? ` · ready in ${Math.ceil(left)}s` : ''}</div>
        <div class="desc">${sp.desc}</div>
      </div>`;
  }).join('');
  showOverlay(`
    <div class="panel">
      <div class="eyebrow">the fight is paused</div>
      <h2>Spellbook</h2>
      <p class="sub">Choose a slot, then the spell to put in it. Cooldowns belong to the spell,
      so swapping never resets one.</p>
      <div class="cards sbslots">${slots.join('')}</div>
      <div class="row" style="margin:4px 0 8px"><button class="btn" data-act="sb-done">Back to the fight</button></div>
      <div class="cards">${cards}</div>
      <div class="row"><button class="btn" data-act="sb-done">Back to the fight</button></div>
    </div>`);
}

// Trap kills: a pop-up (combat → traps), a run tally and a codex count.
setTrapKillFn(onTrapKill);
setTrapKillHook(() => {
  if (world.player) world.player.trapKills = (world.player.trapKills || 0) + 1;
  if (!save.codex) save.codex = { reactions: {} };
  save.codex.trapKills = (save.codex.trapKills || 0) + 1;
});

// Parry boons that need combat: Thunder Parry (lightning to the nearest foes)
// and Glacial Parry (chill the attacker).
setParryHook((p, attacker) => {
  const st = p.stats;
  if (st.parryStorm) {
    const hit = new Set();
    for (let k = 0; k < st.parryStorm + 1; k++) {
      let best = null, bestD = 320;
      for (const e of world.enemies) {
        if (e.dead || e.spawning || e.hidden || hit.has(e)) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < bestD) { bestD = d; best = e; }
      }
      if (!best) break;
      hit.add(best);
      burstFx(best.x, best.y, { count: 10, color: '#e9d8ff', speed: 200, size: 3, life: 0.25, drag: 5, shape: 'spark' });
      dealDamage(best, 16, { element: 'storm', source: 'spell', noCrit: true });
    }
  }
  if (st.parryFrost && attacker && !attacker.dead) {
    dealDamage(attacker, 6, { element: 'frost', source: 'spell', noCrit: true });
  }
});

let pendingBoons = [];
function showBoonSelect() {
  state = 'boon';
  const p = world.player;
  // A beaten trial or an accepted pact offers rare-weighted boons.
  pendingBoons = offerBoons(p, 3, { rare: world.nextBoonRare || shrineBoonPending });
  world.nextBoonRare = false;
  sfx.boon();

  const cards = pendingBoons.map((b, i) => {
    const god = GODS[b.god];
    const owned = p.boons[b.id] || 0;
    return `
      <div class="card ${b.rare ? 'rare' : ''}" data-act="boon" data-idx="${i}" style="border-color:${god.color}66">
        <div class="glyph">${god.glyph}</div>
        <div class="tag" style="color:${god.color}">${god.name} · ${god.domain}</div>
        <div class="name">${b.name}${owned ? ` <span style="opacity:.6">lv ${owned + 1}</span>` : ''}</div>
        <div class="desc">${describeBoon(p, b)}</div>
      </div>`;
  }).join('');

  showOverlay(`
    <div class="panel">
      <div class="eyebrow">a gift is offered</div>
      <h2>Choose a boon</h2>
      <div class="cards">${cards}</div>
    </div>`);
}

let padCheckTimer = null;

function stopPadCheck() {
  if (padCheckTimer) { clearInterval(padCheckTimer); padCheckTimer = null; }
}

function padCheckBody() {
  const secure = window.isSecureContext;
  const hasApi = typeof navigator.getGamepads === 'function';
  const list = hasApi ? [...navigator.getGamepads()].filter(Boolean) : [];
  const row = (label, ok, detail) =>
    `<div class="mrow"><div class="pips"><div class="pip ${ok ? 'on' : ''}"></div></div>
     <div class="mname"><b>${label}</b><i>${detail}</i></div></div>`;

  let out = '';
  out += row('Secure context', secure,
    secure ? location.origin : `${location.origin} — not secure; WebHID is unavailable here`);
  out += row('Gamepad API', hasApi,
    hasApi ? 'navigator.getGamepads present' : 'missing — controllers cannot work in this browser');
  out += row('WebHID', !!navigator.hid,
    navigator.hid ? 'available — lightbar and triggers can be linked' : 'unavailable — needs https:// or localhost');
  out += row('Controllers seen', list.length > 0,
    list.length === 0
      ? 'none yet — PRESS ANY BUTTON on the pad (browsers hide it until you do)'
      : `${list.length} connected`);

  for (const gp of list) {
    const axes = gp.axes.map((a, i) => `${i}:${a.toFixed(2)}`).join('  ');
    const down = gp.buttons
      .map((b, i) => ({ i, v: typeof b === 'object' ? b.value : b, p: typeof b === 'object' ? b.pressed : b > 0.5 }))
      .filter((b) => b.p || b.v > 0.2)
      .map((b) => `${b.i}(${b.v.toFixed(1)})`)
      .join(' ') || '—';
    out += `<div class="mrow" style="display:block">
      <b style="font-size:13px">${gp.id}</b>
      <i style="display:block;font-size:11.5px;color:var(--dim);margin-top:5px">
        mapping: <b style="color:${gp.mapping === 'standard' ? '#7dff9c' : '#ff8a5a'}">${gp.mapping || 'NON-STANDARD'}</b>
        &nbsp;·&nbsp; index ${gp.index}
        &nbsp;·&nbsp; rumble: ${gp.vibrationActuator ? 'yes' : 'no'}<br>
        axes &nbsp; ${axes}<br>
        buttons down &nbsp; ${down}
      </i></div>`;
  }

  out += `<div class="mrow" style="display:block"><i style="font-size:11.5px;color:var(--dim)">
    Game sees: move ${pad.move.x.toFixed(2)},${pad.move.y.toFixed(2)} ·
    aim ${pad.aimActive ? `${pad.aim.x.toFixed(2)},${pad.aim.y.toFixed(2)}` : 'off'} ·
    attack ${pad.attack ? 'YES' : 'no'} · special ${pad.special ? 'YES' : 'no'} · dash ${pad.dash ? 'YES' : 'no'}
  </i></div>`;
  return out;
}

function showPadCheck() {
  state = 'padcheck';
  showOverlay(`
    <div class="panel">
      <div class="eyebrow">diagnostics</div>
      <h2>Controller Check</h2>
      <p class="sub">Press buttons and move the sticks — this updates live.
      Everything green and the pad works in game.</p>
      <div class="mirror" id="padout">${padCheckBody()}</div>
      <div class="row"><button class="btn" data-act="title">Back</button></div>
    </div>`);
  stopPadCheck();
  // Poll the pad here too: the main loop only polls while a frame runs.
  padCheckTimer = setInterval(() => {
    pollGamepad(false);
    const el = document.getElementById('padout');
    if (el) el.innerHTML = padCheckBody();
    else stopPadCheck();
  }, 120);
}

function showMirror() {
  state = 'mirror';
  const rows = UPGRADES.map((u, i) => {
    const lv = save.upgrades[u.id] || 0;
    const maxed = lv >= u.max;
    const cost = upgradeCost(u);
    const pips = Array.from({ length: u.max }, (_, k) =>
      `<div class="pip ${k < lv ? 'on' : ''}"></div>`).join('');
    return `
      <div class="mrow">
        <div class="pips">${pips}</div>
        <div class="mname"><b>${u.name}</b><i>${u.desc(lv)}</i></div>
        <button class="buy" data-act="buy" data-idx="${i}" ${maxed || !canAfford(u) ? 'disabled' : ''}>
          ${maxed ? 'MAX' : `${cost} ◆`}
        </button>
      </div>`;
  }).join('');

  showOverlay(`
    <div class="panel">
      <div class="eyebrow">permanent power · spend darkness</div>
      <h2>Mirror of Night</h2>
      <p class="sub">You hold <b style="color:var(--gold)">${save.darkness} ◆</b> darkness.
      Gold gathered on a run is banked here whether you live or die.</p>
      <div class="mirror">${rows}</div>
      <div class="row">
        <button class="btn" data-act="biome">Begin Run</button>
        <button class="btn ghost" data-act="title">Back</button>
      </div>
    </div>`);
}

const KILLER_NAMES = {
  wretch: 'a Wretch', slinger: 'a Slinger', brute: 'a Brute', charger: 'a Charger',
  bomber: "a Bomber's blast", splitter: 'a Splitter', spitter: 'a Spitter',
  warden: 'the Warden of Ash', explosion: 'an explosion',
  turtle: 'Gravemaw the Shellback', croc: 'Mawgrim, the Mire King',
  gorilla: 'Kharn, the Ashen Silverback', peacock: 'Solenne, the Hundred-Eyed',
};

// --- Boss Trials ------------------------------------------------------------

function showTrials() {
  state = 'trials';
  const order = [...CREATURE_BOSSES, 'warden'];
  const cards = order.map((type) => {
    const b = BOSS_INFO[type];
    return `
      <div class="card" data-act="trial-pick" data-boss="${type}" style="border-color:${b.color}66">
        <div class="tag" style="color:${b.color}">${b.animal === 'Final' ? 'Final guardian' : b.animal}</div>
        <div class="name" style="color:${b.color}">${b.title}</div>
        <div class="desc">${b.subtitle}</div>
      </div>`;
  }).join('');
  showOverlay(`
    <div class="panel">
      <div class="eyebrow">practice · nothing is banked</div>
      <h2>Boss Trials</h2>
      <p class="sub">Fight any guardian on its own, with a few boons to start.
      In a real run they guard chambers 3, 6, 9 and 12 in a random order; the Warden waits at 15.</p>
      <div class="cards">${cards}</div>
      <div class="row"><button class="btn ghost" data-act="title">Back</button></div>
    </div>`);
}

function showTrialEnd(won) {
  state = won ? 'victory' : 'dead';
  const info = BOSS_INFO[world.trial] || BOSS_INFO.warden;
  const last = world.trial;
  const t = world.runTime;
  showOverlay(`
    <div class="panel">
      <div class="eyebrow">boss trial</div>
      <h2 style="color:${info.color}">${won ? 'Guardian Felled' : 'Defeated'}</h2>
      <p class="sub">${info.title} — ${won ? 'beaten' : 'still standing'} after
      ${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.</p>
      <div class="row">
        <button class="btn" data-act="trial-again" data-boss="${last}">${won ? 'Fight Again' : 'Retry'}</button>
        <button class="btn ghost" data-act="trials">Other Trials</button>
        <button class="btn ghost" data-act="title">Title</button>
      </div>
    </div>`);
}

function showRunEnd(won) {
  const banked = Math.round(world.gold * goldMultiplier());
  // What actually ground you down, not just the final blow.
  const worst = Object.entries(world.damageLog).sort((a, b) => b[1] - a[1])[0];
  const killer = !won && worst
    ? `<div class="sub" style="margin-top:-6px">Most of the damage came from
       <b style="color:var(--blood)">${KILLER_NAMES[worst[0]] || worst[0]}</b>.</div>`
    : '';
  showOverlay(`
    <div class="panel">
      <div class="eyebrow">${won ? 'the gate opens' : 'you fall'}</div>
      <h1 style="${won ? '' : 'background:linear-gradient(180deg,#ffd9d9,#ff5e6e 60%,#7a1f33);-webkit-background-clip:text;background-clip:text'}">
        ${won ? 'Escaped' : 'Slain'}
      </h1>
      <p class="sub">${won
        ? 'The Warden falls and the last gate swings wide. You could stop here — or press deeper, where everything hits harder.'
        : `You made it to chamber ${world.depth}. The dungeon keeps what it kills, but not what you carried.`}</p>
      <div class="stats">
        <div class="stat"><b>${world.depth}</b><span>Chamber</span></div>
        <div class="stat"><b>${world.kills}</b><span>Kills</span></div>
        <div class="stat"><b>${Math.floor(world.runTime / 60)}:${String(Math.floor(world.runTime % 60)).padStart(2, '0')}</b><span>Time</span></div>
        <div class="stat"><b>+${banked}</b><span>Darkness banked</span></div>
      </div>
      ${killer}
      <div class="row">
        ${won ? '<button class="btn" data-act="loop">Press Deeper</button>' : ''}
        <button class="btn ${won ? 'ghost' : ''}" data-act="weapon">New Run</button>
        <button class="btn ghost" data-act="mirror">Mirror of Night</button>
      </div>
    </div>`);
}

function showPause() {
  state = 'paused';
  showOverlay(`
    <div class="panel">
      <div class="eyebrow">chamber ${world.depth}</div>
      <h2>Paused</h2>
      <div class="row">
        <button class="btn" data-act="resume">Resume</button>
        <button class="btn ghost" data-act="spellbook">Spellbook</button>
        <button class="btn ghost" data-act="mute">${audio.muted ? 'Unmute' : 'Mute'}</button>
        <button class="btn ghost" data-act="music">Music: ${audio.music ? 'On' : 'Off'}</button>
        <button class="btn ghost" data-act="abandon">Abandon Run</button>
      </div>
      ${musicVolumeRow()}
      ${fullscreenRow()}
      ${dualSenseRow()}
    </div>`);
}

// --- overlay interaction ---------------------------------------------------

document.getElementById('overlay').addEventListener('input', (ev) => {
  if (ev.target && ev.target.id === 'musicvol') applyMusicVolume(Number(ev.target.value) / 100);
});

document.getElementById('overlay').addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  ensureAudio();
  sfx.ui();

  const act = el.dataset.act;
  const idx = Number(el.dataset.idx);
  if (act !== 'padcheck') stopPadCheck();

  switch (act) {
    case 'title': pendingTrial = null; showTitle(); break;
    case 'version': location.href = el.dataset.href; break;
    case 'version-here': break;
    case 'trials': showTrials(); break;
    case 'trial-pick': {
      if (isTouchDevice() && !isFullscreen()) enterFullscreen();
      pendingTrial = el.dataset.boss;
      showWeaponSelect();
      break;
    }
    case 'trial-again': {
      pendingTrial = el.dataset.boss;
      showWeaponSelect();
      break;
    }
    case 'mirror': showMirror(); break;
    case 'padcheck': showPadCheck(); break;
    case 'vol-down': applyMusicVolume(audio.musicVolume - 0.1); break;
    case 'vol-up': applyMusicVolume(audio.musicVolume + 0.1); break;
    case 'fullscreen': toggleFullscreen().then(() => showTitle()); break;
    case 'weapon': pendingTrial = null; showWeaponSelect(); break;
    case 'biome': {
      if (isTouchDevice() && !isFullscreen()) enterFullscreen();
      showBiomeSelect();
      break;
    }
    case 'biome-pick': {
      pendingBiome = BIOMES[idx];
      save.biome = pendingBiome.id;
      writeSave();
      showWeaponSelect();
      break;
    }
    case 'pick': {
      // Version 3: the spell loadout comes between weapon and run.
      chosenWeapon = WEAPONS[idx];
      showLoadout();
      break;
    }
    case 'spell-toggle': {
      const id = el.dataset.spell;
      const cur = validLoadout(save.loadout);
      const at = cur.indexOf(id);
      if (at >= 0) cur.splice(at, 1);
      else if (cur.length < LOADOUT_SIZE) cur.push(id);
      else { cur.shift(); cur.push(id); }
      save.loadout = cur;
      writeSave();
      showLoadout();
      break;
    }
    case 'spellbook': showSpellbook(); break;
    case 'sb-slot': {
      spellbookSlot = idx;
      showSpellbook();
      break;
    }
    case 'sb-spell': {
      const p = world.player;
      if (!p) break;
      equipSpell(p, spellbookSlot, el.dataset.spell);
      // The next run starts with what you ended up using.
      save.loadout = p.spells.filter(Boolean);
      writeSave();
      spellbookSlot = (spellbookSlot + 1) % SPELL_SLOTS;
      showSpellbook();
      break;
    }
    case 'sb-done': state = 'playing'; hideOverlay(); resetInput(); break;
    case 'loadout-go': {
      if (!chosenWeapon) { showWeaponSelect(); break; }
      if (isTouchDevice() && !isFullscreen()) enterFullscreen();
      // The landscape lock resolves a moment after fullscreen, and never on
      // iOS. If the phone is still upright, hold the run until it's turned.
      if (isPortraitTouch()) {
        pendingWeapon = chosenWeapon;
        checkOrientation();
        break;
      }
      beginRun(chosenWeapon);
      break;
    }
    case 'boon': {
      applyBoon(world.player, pendingBoons[idx]);
      sfx.boon();
      if (shrineBoonPending) {
        // The shrine's gift: stay in the shrine room; its doors open now.
        shrineBoonPending = false;
        state = 'playing';
        hideOverlay();
        resetInput();
        openRoom(world.room);
      } else {
        advanceRoom();
      }
      break;
    }
    case 'shrine-accept': {
      world.curses.push({ id: shrineCurse.id, name: shrineCurse.name, rooms: 3 });
      shrineBoonPending = true;
      showBoonSelect();
      break;
    }
    case 'shrine-decline': {
      state = 'playing';
      hideOverlay();
      resetInput();
      openRoom(world.room);
      break;
    }
    case 'buy': {
      if (buyUpgrade(UPGRADES[idx])) { sfx.pickup(); showMirror(); }
      break;
    }
    case 'loop': loopDeeper(); break;
    case 'resume': state = 'playing'; hideOverlay(); resetInput(); break;
    case 'mute': toggleMute(); save.muted = audio.muted; writeSave(); showPause(); break;
    case 'music': {
      setMusicEnabled(!audio.music);
      save.musicOn = audio.music;
      writeSave();
      showPause();
      break;
    }
    case 'dsconnect': {
      connectDualSense().then((ok) => {
        resetDualSenseFeedback();
        if (ok) rumble(0.6, 0.4, 200);
        state === 'paused' ? showPause() : showTitle();
      });
      break;
    }
    case 'dsprobe': {
      probeDualSense().then((msg) => console.log('[dualsense]', msg));
      break;
    }
    case 'abandon': {
      if (!world.trial) bankRun({ gold: world.gold, depth: world.depth, kills: world.kills, won: false });
      showTitle();
      break;
    }
  }
});

window.addEventListener('keydown', (ev) => {
  const k = ev.key.toLowerCase();
  if (k === 'm') { ensureAudio(); toggleMute(); save.muted = audio.muted; writeSave(); }
  if (k === 'escape' || k === 'p') {
    if (state === 'playing') showPause();
    else if (state === 'paused') { state = 'playing'; hideOverlay(); resetInput(); }
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') suspendAudio();
  else if (audioStarted) resumeAudio();
});

function ensureAudio() {
  if (audioStarted) return;
  audioStarted = true;
  initAudio();
  if (save.muted) toggleMute();
  setMusicVolume(typeof save.musicVolume === 'number' ? save.musicVolume : 0.7);
  setMusicEnabled(save.musicOn !== false);
}

// Any first interaction unlocks WebAudio (mobile requires a gesture).
window.addEventListener('pointerdown', ensureAudio, { once: true });
// Which gesture unlocks audio differs across mobile browsers; keep retrying
// on every kind until the context is actually running.
for (const type of ['touchend', 'pointerup', 'click', 'keydown']) {
  window.addEventListener(type, () => { if (audioStarted) unlockAudio(); }, { passive: true });
}
window.addEventListener('keydown', ensureAudio, { once: true });

// First time a reaction happens: a banner naming it, and a codex entry.
setDiscoverHook((key, info) => {
  showToast('NEW REACTION', `${info.name} — ${info.desc}`, 2.8);
  sfx.boon();
});

// --- boot ------------------------------------------------------------------

loadSave();
resize();
initInput(canvas);
initFullscreen({ onChange: () => { if (overlayVisible() && state === 'title') showTitle(); } });
registerServiceWorker();
initGamepad({
  pause: () => {
    if (state === 'playing') showPause();
    else if (state === 'paused') { state = 'playing'; hideOverlay(); resetInput(); }
  },
  mute: () => { ensureAudio(); toggleMute(); save.muted = audio.muted; writeSave(); },
});
showTitle();
requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });

// Debug handle: lets the sim be driven without rAF, for smoke tests and for
// poking at balance from the browser console.
window.ashfall = {
  world, view, arena, input, fx,
  WEAPONS,
  get state() { return state; },
  set state(s) { state = s; },
  tick, render, startRun, advanceRoom, showTitle,
  trial: (type, weaponIdx = 0) => startTrial(WEAPONS[weaponIdx], type),
  // Elements: hit an enemy with an element, hit an area, place a surface.
  element: (e, el, ctx = {}) => hitElement(e, el, { damage: 10, owner: 'player', ...ctx }),
  area: (el, x, y, r, opts) => elementArea(el, x, y, r, opts),
  surface: (type, x, y, r, owner) => spawnSurface(type, x, y, r, owner),
  applyStatus, REACTIONS,
  loadout: (ids) => { save.loadout = ids; if (world.player) world.player.spells = fullLoadout(ids); },
  cast: (id) => tryCast(world.player, id),
  grenadeType: (id) => { save.grenadeType = id; if (world.player) world.player.grenadeType = id; },
  // Jump to a chamber layout or special room (from the current depth).
  chamber: (id) => { world.depth--; advanceRoom(null, id); },
  special: (kind) => { world.depth--; advanceRoom(kind); },
  CHAMBERS,
  spellbook: () => showSpellbook(),
  spawn: (type, x, y, opts) => spawnEnemyDebug(type, x, y, opts),
  pad, dualsense, probeDualSense, rumble, pollGamepad,
  bakeSpriteSheet, bakeTextures, exportAll, exportAsDataURLs, canvasToDataURL, saveAssets,
  outputLevel, setMusicVolume, audio,
  toggleFullscreen, screenState,
  PLAYER_SKELETON, PLAYER_CLIPS, resolvePose, drawSkeleton, ctx,
  run(steps = 60) {
    for (let i = 0; i < steps; i++) tick(STEP);
  },
};

function spawnEnemyDebug(type, x, y, opts = {}) {
  const b = arenaBounds();
  return spawnEnemyRef(
    type,
    x ?? b.l + (b.r - b.l) * 0.3,
    y ?? b.t + (b.b - b.t) * 0.4,
    { instant: true, ...opts },
  );
}
