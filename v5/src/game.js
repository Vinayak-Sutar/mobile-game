// Entry point: canvas setup, the fixed-timestep loop, the run state machine
// and every menu screen.

import { world, view, arena, arenaBounds, resetWorld, clearEntities, gfx, camera, tuning } from './state.js';
import {
  enterOverworld, updateOverworld, applyOverworldBounds, overworldRespawn,
  overworldProgress, bindOverworldSpawner, arriveAt, setMapFog, lairById, markLairBeaten, remnantCount,
  lampById, litLamps, setLastLamp, worldSnapshot, restoreWorld, resetWildsSites, sitesProgress,
} from './wilds-world.js';
import { siteFx } from './wilds-sites.js';
import { KIN_NAMES } from './enemies-kin.js';
import { YOKAI_NAMES } from './enemies-yokai.js';
import { MINI_NAMES, miniInFight } from './enemies-mini.js';
import {
  journey, resetJourney, applyLevels, buyLevel, levelCost, totalLevel, ATTRS,
  dropSmoulder, restore,
} from './wilds-progress.js';
import { loadJourney, saveJourney, clearJourney } from './wilds-save.js';
import { LAMPS, REGIONS } from './wilds-layout.js';
import { REGION_THEMES, themeForRegion, themeById, setLeadChoice, leadFor, LEAD_OPTIONS } from './music-regions.js';
import { DESH_THEME } from './music-desh.js';
import { WESTERN_THEME } from './music-western.js';
import { drawOverworldBelow, drawOverworldAbove } from './wilds-draw.js';
import { enterDungeon, updateDungeon, leaveDungeon, dungeonWake, dungeonState } from './dungeon.js';
import { DUNGEON_LIST, dungeonInfo } from './dungeon-levels.js';
import { drawDungeonBelow, drawDungeonAbove } from './dungeon-draw.js';
import { drawOverworldMap, mountWildsMap } from './wilds-map.js';
import { clamp, TAU, shuffle } from './util.js';
import {
  initAudio, sfx, audio, toggleMute, startMusic, stopMusic,
  setMusicEnabled, setMusicActive, suspendAudio, resumeAudio, setMusicIntensity, setBossTheme, unlockAudio,
  setAmbientTheme,
  setMusicVolume, previewMusic, outputLevel,
} from './audio.js';
import {
  fx, updateFx, drawFxBelow, drawFxAbove, clearFx, flash, ring as ringFx, burst as burstFx,
} from './fx.js';
import { input, initInput, updateInput, endFrameInput, layoutControls, resetInput, controls } from './input.js';
import { createPlayer, updatePlayer, drawPlayer } from './player.js';
import { updateEnemies, drawEnemies, bossInRoom, spawnEnemy as spawnEnemyRef } from './enemies.js';
import { drawCorpses } from './enemies-folk.js';
import { drawTrainingHud, updateMeter, resetMeter, noteBroken } from './training.js';
import {
  bindTutorialSpawner, startLessons, updateTutorial, drawTutorialWorld, drawTutorialHud,
} from './tutorial.js';
import { updateStatuses, healPlayer } from './combat.js';
import {
  updateProjectiles, drawProjectiles, updateHitboxes, updatePickups, drawPickups, clearSpriteCache,
} from './projectiles.js';
import {
  generateRoom, startRoom, updateRoom, drawFloor, drawObstacles, drawDoors, drawRoomIntro,
  FINAL_DEPTH, FIRST_BOSS_DEPTH, BOSS_GAP, effDepth,
} from './rooms.js';
import { updateHazards, drawHazardsBelow, drawHazardsAbove } from './hazards.js';
import { BOSS_INFO, BOSS_POOL, clearBullets } from './bosses.js';
import { WEAPONS } from './weapons.js';
import { updateGrenades, drawGrenades, drawGrenadeAim, GRENADE } from './grenade.js';
import { BIOMES, getBiome, initAmbient, drawAmbient, clearAmbient } from './biomes.js';
import { biomeThumbnail, clearTextureCache } from './texture.js';
import { offerBoons, applyBoon, describeBoon, GODS } from './boons.js';
import {
  drawHud, drawControls, updateUi, resetUi, showToast, showOverlay, hideOverlay, overlayVisible,
} from './ui.js';
import {
  SPELLS, SPELL_SLOTS, SPELL_MAX_LEVEL, ELEMENT_INFO, spellById, spellColor, spellLevel, knownSpells,
  offerSpells, learnSpell, tryCast,
  updateSpellZones, drawSpellZones, drawPlayerSpells,
} from './spells.js';
import {
  save, loadSave, writeSave, UPGRADES, upgradeCost, canAfford, buyUpgrade, metaBonuses, bankRun, goldMultiplier,
} from './save.js';
import {
  pad, initGamepad, pollGamepad, updateDualSenseFeedback, resetMenuFocus, resetDualSenseFeedback, rumble,
} from './gamepad.js';
import { dualsense, dualSenseSupported, connectDualSense, probe as probeDualSense } from './dualsense.js';
import { look } from './wanderer.js';
import {
  SLOTS as OUTFIT_SLOTS, DYE_SLOTS as OUTFIT_DYES, PRESETS as OUTFIT_PRESETS, DEFAULT_OUTFIT,
  normaliseOutfit, setOutfit, randomOutfit,
} from './outfits.js';
import { BUILD, BUILT, latestBuild, hardRefresh } from './update.js';
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

  layoutControls();
  if (world.overworld) applyOverworldBounds();
  else {
    chamberArena();
    clampObstacles();
  }
  checkOrientation();
}

/** The chambers' floor: the view, inset for the HUD. */
function chamberArena() {
  const mx = 38, top = 74, bottom = 38;
  arena.x = mx;
  arena.y = top;
  arena.w = view.w - mx * 2;
  arena.h = view.h - top - bottom;
}

/** A phone held upright. Gameplay is landscape-only. */
function isPortraitTouch() {
  return isTouchDevice() && window.innerHeight > window.innerWidth;
}

function inRun() {
  return state === 'playing' || state === 'paused' || state === 'boon' || state === 'dying';
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
  world.depth = 1;
  world.loop = 0;
  // Every guardian, in a different order every run.
  world.bossOrder = shuffle(BOSS_POOL);

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
  for (let i = 0; i < 3; i++) {
    const offer = offerBoons(p, 1);
    if (offer[0]) applyBoon(p, offer[0]);
  }
  // Two spells too, as a run would have by then (some bosses answer them).
  for (const sp of offerSpells(p, 2)) learnSpell(p, sp.id);
  p.hp = p.stats.maxHp;
  // Every trial plays at tier 1, as the trials always have.
  world.depth = FIRST_BOSS_DEPTH + BOSS_GAP;
  clearEntities();
  clearFx();
  const room = generateRoom(world.depth, 0, { bossType, slot: 1, tier: 1 });
  startRoom(room);
  showToast('BOSS TRIAL', BOSS_INFO[bossType].animal);
}

function advanceRoom() {
  world.depth++;
  clearEntities();
  clearFx();
  const room = generateRoom(world.depth, world.loop);
  startRoom(room);
  initAmbient(world.biome || getBiome());
  if (room.final) showToast('THE LAST GATE', `CHAMBER ${world.depth} · the last guardian`);
  else if (room.type === 'boss') showToast(`CHAMBER ${world.depth}`, 'A guardian bars the way.');
  else showToast(`CHAMBER ${world.depth}`, room.type === 'elite' ? 'An elite stalks this hall.' : '');
  state = 'playing';
  hideOverlay();
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
  world.bossOrder = shuffle(BOSS_POOL);
  advanceRoom();
  showToast(`LOOP ${world.loop + 1}`, 'The dungeon sharpens its teeth.');
}

function handleDoor(door) {
  if (door.reward === 'exit') {
    if (world.trial) showTrialEnd(true);
    else onVictory();
    return;
  }
  if (door.reward === 'boon') {
    showBoonSelect();
    return;
  }
  if (door.reward === 'spell') {
    showSpellSelect();
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
  if (world.dungeon) {
    // Fallen in a dungeon with no life to spare: back at its last lamp, the dead risen with you.
    dungeonWake();
    clearBullets();
    snapCamera();
    showToast('YOU WAKE AT THE LAMP', 'The dead have risen again. Levers stay pulled; the key stays yours.', 3.2);
    state = 'playing';
    return;
  }
  if (world.owBoss) { leaveGateFight(false); return; }
  if (world.overworld) { wakeAtLamp(world.player.x, world.player.y); return; }
  if (world.training || world.tutorial) {
    const p = world.player;
    if (p) { p.dead = false; p.hp = p.stats.maxHp; p.invuln = 1.2; }
    showToast('BACK ON YOUR FEET', 'Nothing is lost in training');
    state = 'playing';
    return;
  }
  if (world.trial) { showTrialEnd(false); return; }
  bankRun({ gold: world.gold, depth: world.depth, kills: world.kills, won: false });
  state = 'dead';
  showRunEnd(false);
}

/**
 * Fallen in the Wilds with no life to spare: your Cinders stay where you fell
 * (x, y - your smoulder), and you wake at the last Ashlamp you rested at,
 * whole again, with the land's enemies back.
 */
function wakeAtLamp(x, y) {
  const p = world.player;
  const lost = world.gold;
  dropSmoulder(x, y);
  resetWildsSites();
  const at = overworldRespawn();
  p.dead = false; p.invuln = 2;
  restore(p);
  p.x = at.x; p.y = at.y; p.vx = p.vy = 0;
  p.attack = null; p.dashing = false;
  clearBullets();
  arriveAt(p.x, p.y);
  snapCamera();
  const lamp = lampById(journey.lastLampId) || null;
  showToast(`YOU WAKE${lamp ? ` AT ${lamp.name.toUpperCase()}` : ' AGAIN'}`,
    lost ? `Your ${lost} Cinders smoulder where you fell. Go back for them.` : 'You carried no Cinders', 4);
  state = 'playing';
  saveWilds();
}

function onVictory() {
  bankRun({ gold: world.gold, depth: FINAL_DEPTH, kills: world.kills, won: true });
  state = 'victory';
  flash(0.4, '#ffd9a0');
  showRunEnd(true);
}

// --- loop ------------------------------------------------------------------

let rafId = 0;
let lastFrameAt = performance.now();

// Frames per second and the cost of a frame (the setting "Show FPS").
const perf = { frames: 0, work: 0, worst: 0, since: 0, fps: 0, avg: 0, peak: 0 };

function frame(now) {
  rafId = requestAnimationFrame(frame);
  lastFrameAt = performance.now();
  const began = lastFrameAt;

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

  // Half a second at a time: how many frames, and how long our work took.
  const work = performance.now() - began;
  perf.frames++; perf.work += work; perf.worst = Math.max(perf.worst, work);
  if (now - perf.since >= 500) {
    perf.fps = perf.frames * 1000 / Math.max(1, now - perf.since);
    perf.avg = perf.work / Math.max(1, perf.frames);
    perf.peak = perf.worst;
    perf.frames = 0; perf.work = 0; perf.worst = 0; perf.since = now;
  }
  if (save.showFps) drawPerf();
  updateDualSenseFeedback();
}

function tick(dt) {
  updateInput(world.player);

  if (state === 'playing' && input.pausePressed) {
    input.pausePressed = false;
    showPause();
  }
  if (state === 'playing' && input.mapPressed && world.overworld) {
    input.mapPressed = false;
    showWildsMap();
  }

  if (state === 'playing') {
    if (fx.hitstop > 0) {
      // Freeze the simulation but keep the feedback layer crawling, so the
      // screen shake still lands during the freeze.
      fx.hitstop -= dt;
      updateFx(dt * 0.18);
      // A boss that keeps time with its own music (the Maestro) keeps its
      // clock running through the freeze, so the melody never stutters.
      for (const en of world.enemies) {
        const spec = en.def && en.def.spec;
        if (!en.dead && !en.spawning && spec && spec.realTick) spec.realTick(en, dt);
      }
    } else {
      world.runTime += dt;
      updatePlayer(world.player, dt);
      updateEnemies(dt);
      updateStatuses(dt);
      updateHitboxes(dt);
      updateGrenades(dt);
      updateSpellZones(dt);
      updateProjectiles(dt);
      updateHazards(dt);
      updatePickups(dt);
      if (world.training) updateTraining(dt);
      if (world.dungeon) {
        const act = updateDungeon(dt);
        if (act && act.toast) showToast(act.toast[0], act.toast[1], 2.8);
        if (act && act.cleared) sfx.bossDown();
        if (act && act.exit) exitDungeon(act.exit);
      }
      if (world.overworld) {
        const act = updateOverworld(dt);
        if (act && act.toast) showToast(act.toast[0], act.toast[1], 2.6);
        if (act && act.kindle) {
          journey.lastLampId = act.kindle.id;
          showToast('ASHLAMP KINDLED', `${act.kindle.name}: stand still at it to rest`, 3);
          sfx.boon();
          saveWilds();
        }
        if (act && act.rest) restAtLamp(act.rest);
        if (act && (act.duel || act.wave || act.clear || act.reliquary || act.champion)) siteFx(act);
        if (act && act.duel) showToast(act.duel.name.toUpperCase(), 'The ring closes. One of you walks out.', 2.6);
        if (act && act.wave) showToast('MORE OF THEM', 'A second wave', 2);
        if (act && act.clear) { showToast('CLEARED', 'A chest of Cinders', 2.4); saveWilds(); }
        if (act && act.champion) { showToast('CHAMPION FELLED', act.champion.claimed ? 'Its reliquary holds Cinders' : 'Its reliquary lights: a spell waits', 3.4); saveWilds(); }
        if (act && act.reliquary) openReliquary(act.reliquary);
        if (act && act.smoulder) {
          showToast('YOUR SMOULDER', `${act.smoulder} Cinders taken back`, 2.6);
          sfx.pickup();
          saveWilds();
        }
        // Kept safe every half minute, whatever happens.
        wildsSaveT -= dt;
        if (wildsSaveT <= 0) { wildsSaveT = 30; saveWilds(); }
        if (act && act.lair) showLairGate(act.lair);
        if (act && act.dungeon) showDungeonGate(act.dungeon);
      }
      if (world.owBoss && world.room && world.room.cleared) {
        owBossT += dt;
        if (owBossT > 2.2) leaveGateFight(true);
      }
      if (world.tutorial && updateTutorial(dt)) showTutorialEnd(true);
      updateRoom(dt);
      updateFx(dt);

      // Music follows the fight: calm between waves, full kit in combat,
      // a harder variation once the Warden is up.
      setMusicIntensity(bossInRoom() || miniInFight() ? 2 : world.enemies.some((e) => !e.dead) ? 1 : 0);
      // A guardian with its own theme (Vesper's western) plays it instead.
      {
        const guard = bossInRoom();
        const spec = guard && guard.def && guard.def.spec;
        setBossTheme(spec && spec.music ? spec.music : null, guard);
      }
      // The place's own piece: each land of the Wilds has its raga, and the
      // dungeons theirs (music-regions.js). A region must hold for 2 s
      // before its music takes over, so walking along a border never flickers.
      setAmbientTheme(placeTheme(dt));

      const room = world.room;
      if (room && room.chosen && world.owBoss) room.chosen = null;   // no doors out of a gate fight
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
      // A spare life stands you back up where you fell - in the chambers and
      // in a Wilds guardian's arena alike. (Out in the Wilds themselves a fall
      // wakes you at your shrine instead.)
      // A spare life stands you back up where you fell - in the chambers, in
      // a guardian's arena, and out in the Wilds alike.
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
  setMusicActive(state === 'playing' || state === 'boon' || !!(musicRoom && musicRoom.theme));

  endFrameInput();
}

function render() {
  const s = view.dpr * view.scale;
  // The player's look (wanderer.js): as chosen, or by default the Wanderer
  // in The Wilds' 3/4 world and the Hooded One in the chambers.
  const ch = save.character;
  look.skin = ch === 'hooded' || ch === 'wanderer' ? ch : world.overworld || world.owBoss || world.dungeon ? 'wanderer' : 'hooded';
  tuning.speed = save.moveSpeed ?? SPEED_DEFAULT;
  ctx.setTransform(s, 0, 0, s, 0, 0);

  ctx.fillStyle = '#08060d';
  ctx.fillRect(0, 0, view.w, view.h);

  const inRun = state === 'playing' || state === 'dying' || state === 'boon' || state === 'paused';

  ctx.save();
  ctx.translate(fx.shakeX, fx.shakeY);

  const wilds = inRun && world.overworld;
  const dungeon = inRun && world.dungeon;
  if (wilds || dungeon) ctx.translate(-Math.round(camera.x), -Math.round(camera.y));

  if (inRun && world.room) {
    if (wilds) {
      drawOverworldBelow(ctx, world.runTime);
      drawFxBelow(ctx);
    } else if (dungeon) {
      drawDungeonBelow(ctx, world.runTime);
      drawFxBelow(ctx);
    } else {
      drawFloor(ctx, world.runTime);
      drawAmbient(ctx, world.biome);
      drawFxBelow(ctx);
      drawObstacles(ctx);
      drawDoors(ctx, world.runTime);
    }
    drawHazardsBelow(ctx, world.runTime);
    if (world.tutorial) drawTutorialWorld(ctx);
    drawSpellZones(ctx, world.runTime);
    drawGrenadeAim(ctx, world.player, world.runTime);
    drawCorpses(ctx);
    drawPickups(ctx);
    drawEnemies(ctx);
    if (world.player && world.player.fallK) {
      // Falling down a hole: smaller and darker as the dark takes you.
      const p = world.player, k = world.player.fallK;
      ctx.save();
      ctx.translate(p.x, p.y + k * 26); ctx.scale(1 - 0.7 * k, 1 - 0.7 * k); ctx.translate(-p.x, -p.y);
      ctx.globalAlpha = 1 - 0.85 * k;
      drawPlayer(p, ctx);
      ctx.restore();
      ctx.globalAlpha = 1;
    } else if (world.player) drawPlayer(world.player, ctx);
    if (world.player) drawPlayerSpells(ctx, world.player, world.runTime);
    drawProjectiles(ctx);
    drawHazardsAbove(ctx);
    drawGrenades(ctx, world.runTime);
    if (wilds) drawOverworldAbove(ctx, world.runTime);
    drawFxAbove(ctx);
    if (dungeon) drawDungeonAbove(ctx, world.runTime);
    if (!wilds && !dungeon) drawRoomIntro(ctx, world.room, world.runTime);
  } else {
    drawMenuBackdrop();
  }

  ctx.restore();

  if (inRun) {
    drawHud(ctx, world.runTime);
    input.mapRect = null;                 // only where the minimap is drawn this frame
    if (world.overworld) drawOverworldMap(ctx);
    drawTrainingHud(ctx);
    if (world.tutorial && state === 'playing') drawTutorialHud(ctx);
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

/** The FPS readout, top centre: rate, average work per frame, the worst frame. */
function drawPerf() {
  const s = view.dpr * view.scale;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  const ghost = world.player && world.player.ghost && world.overworld;
  const text = `${Math.round(perf.fps)} fps \u00b7 ${perf.avg.toFixed(1)} ms (worst ${perf.peak.toFixed(0)})${ghost ? ' \u00b7 GHOST' : ''}`;
  ctx.font = '700 11px system-ui';
  const w = ctx.measureText(text).width + 14;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(view.w / 2 - w / 2, 4, w, 18);
  ctx.fillStyle = perf.fps >= 55 ? '#9fe0a0' : perf.fps >= 40 ? '#ffd45e' : '#ff7a7a';
  ctx.textAlign = 'center';
  ctx.fillText(text, view.w / 2, 17);
  ctx.textAlign = 'left';
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

const CHARACTERS = [
  ['auto', 'Auto', 'The Wanderer in The Wilds, the Hooded One in the chambers'],
  ['hooded', 'Hooded One', 'Seen from above, turning with the aim'],
  ['wanderer', 'Wanderer', 'Standing, in the 3/4 view of The Wilds: a straw hat and a scarf'],
];

/**
 * Who you play as. The same moves; only the look changes (wanderer.js).
 * Offered on the title and in every pause screen; `back` redraws the screen
 * it was picked on, so the choice shows at once.
 */
let charBack = null;
function characterRow(back = null) {
  charBack = back;
  const cur = save.character || 'auto';
  return `
    <div class="volrow">
      <span class="vollabel">Character</span>
      ${CHARACTERS.map(([id, name, tip]) => `
        <button class="tgl ${cur === id ? 'on' : ''}" data-act="char" data-v="${id}" title="${tip}">${name}</button>`).join('')}
    </div>`;
}

// Walking speed, adjustable while it is being tuned by feel (a tester found
// the old pace "like sliding on ice"). 85% of the old speed by default.
const SPEED_DEFAULT = 0.85, SPEED_MIN = 0.6, SPEED_MAX = 1.2, SPEED_STEP = 0.05;

function speedRow() {
  const pct = Math.round((save.moveSpeed ?? SPEED_DEFAULT) * 100);
  return `
    <div class="volrow">
      <span class="vollabel">Move speed</span>
      <button class="volbtn" data-act="spd-down" aria-label="Slower">−</button>
      <span class="volval">${pct}%</span>
      <button class="volbtn" data-act="spd-up" aria-label="Faster">+</button>
      <button class="tgl ${pct === Math.round(SPEED_DEFAULT * 100) ? 'on' : ''}" data-act="spd-def">Default ${Math.round(SPEED_DEFAULT * 100)}%</button>
    </div>`;
}

/** The FPS readout, on or off. */
function fpsRow() {
  return `
    <div class="volrow">
      <span class="vollabel">Show FPS</span>
      <button class="tgl ${save.showFps ? 'on' : ''}" data-act="fps">${save.showFps ? 'On' : 'Off'}</button>
    </div>`;
}

/** The wardrobe, from any settings screen: it comes back to the one it was opened from. */
function wardrobeRow() {
  const o = normaliseOutfit(save.outfit);
  const same = (pr) => { const q = normaliseOutfit({ ...DEFAULT_OUTFIT, ...pr.o }); return Object.keys(q).every((k) => q[k] === o[k]); };
  const named = OUTFIT_PRESETS.find(same);
  return `
    <div class="volrow">
      <span class="vollabel">Wardrobe</span>
      <button class="tgl" data-act="wardrobe">Change outfit</button>
      <span class="volval" style="width:auto">${named ? named.name : 'Your own'}</span>
    </div>`;
}

/** The player settings shown on the title and in every pause screen. */
function playerRows(back) {
  return characterRow(back) + wardrobeRow() + speedRow() + fpsRow();
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
      <button class="ver" data-act="version" data-href="../v2/">Version 2<small>15 chambers · 5 bosses</small></button>
      <button class="ver" data-act="version" data-href="../v3/">Version 3<small>spells · elements · traps</small></button>
      <button class="ver" data-act="version" data-href="../v4/">Version 4<small>spells · pure action</small></button>
      <button class="ver on" data-act="version-here" aria-current="true">Version 5<small>enemy variety · minibosses</small></button>
    </div>`;
}

/** A phone or tablet, judged by the device rather than by recent input. */
/** On a phone or tablet, go fullscreen (and so lock landscape) if we are not already. */
function phoneFullscreen() {
  if (isTouchDevice() && !isFullscreen()) enterFullscreen();
}

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

// --- the place's music ---------------------------------------------------------------

let zoneHeld = { id: null, t: 0, theme: null };
function placeTheme(dt) {
  if (world.dungeon) { const D = dungeonState(); return (D && themeById(D.music)) || themeForRegion('dungeon'); }
  if (!world.overworld || world.owBoss) return null;   // chambers and lair arenas keep the regular track
  const id = world.zoneId || 'heartland';
  if (id !== zoneHeld.id) { zoneHeld.id = id; zoneHeld.t = 0; }
  zoneHeld.t += dt;
  if (!zoneHeld.theme || zoneHeld.t > 2) zoneHeld.theme = themeForRegion(id);
  return zoneHeld.theme;
}

// --- the Music Room: every piece, to listen to on its own -------------------------------

let musicRoom = null;          // { theme, boss, fight } while the room is open
const BOSS_PIECES = [
  { id: 'desh', theme: DESH_THEME, name: 'Mor Chowk', raga: 'Raag Desh', who: 'Solenne the Hundred-Eyed', mood: 'A warm, bright folk tune in the moonlit Peacock Court.' },
  { id: 'western', theme: WESTERN_THEME, name: 'High Noon', raga: 'a spaghetti western', who: 'Deadeye Vesper', mood: 'Whistle, twang and a trotting beat in the Dust Gulch.' },
];

function regionNames(th) {
  return th.regions.map((r) => (r === 'dungeon' ? 'the dungeons' : (REGIONS.find((g) => g.id === r) || {}).name || r)).join(', ');
}

function playInRoom(theme, boss) {
  ensureAudio();
  unlockAudio();
  musicRoom.theme = theme;
  musicRoom.boss = boss;
  if (boss) { setAmbientTheme(null); setBossTheme(theme, null); setMusicIntensity(2); }
  else { setBossTheme(null); setAmbientTheme(theme); setMusicIntensity(musicRoom.fight ? 1 : 0); }
}

function showMusicRoom() {
  if (!musicRoom) musicRoom = { theme: null, boss: false, fight: false };
  const playing = (t) => musicRoom.theme === t;
  const card = (t, i, boss) => `
      <div class="card musiccard${playing(t.theme || t) ? ' on' : ''}" data-act="${boss ? 'mr-boss' : 'mr-play'}" data-idx="${i}">
        <div class="name">${playing(t.theme || t) ? '♪ ' : ''}${t.name}</div>
        <div class="desc"><b>${t.raga}</b>${boss ? ` · ${t.who}` : ` · ${t.hour}`}</div>
        <div class="desc">${t.mood}</div>
        ${boss ? '' : `<div class="desc" style="opacity:.7">Plays in ${regionNames(t)}. The tune on ${LEAD_OPTIONS.find((o) => o.id === leadFor(t, 0)).label.toLowerCase()}.</div>`}
      </div>`;
  showOverlay(`
    <div class="panel">
      <div class="eyebrow">listen</div>
      <h2>Music Room</h2>
      <p class="sub">Every land of the Wilds has its own piece, each in a raga chosen for its mood,
      played on piano, electric piano, music box, kalimba, marimba and harp.
      Out exploring the tune comes and goes and leaves room; when a fight starts a drum and a quicker
      pace join the same piece. Try both - and try another instrument on the tune.</p>
      ${audio.music ? '' : '<p class="sub" style="color:#ffb070">Music is switched off. <button class="btn ghost" data-act="mr-musicon">Turn music on</button></p>'}
      <div class="row">
        <button class="btn${musicRoom.fight ? ' ghost' : ''}" data-act="mr-calm">Exploring</button>
        <button class="btn${musicRoom.fight ? '' : ' ghost'}" data-act="mr-fight">In a fight</button>
        <button class="btn ghost" data-act="mr-stop">Stop</button>
      </div>
      ${leadRow()}
      <h3 style="margin:14px 0 6px">The Wilds</h3>
      <div class="cards">${REGION_THEMES.map((t, i) => card(t, i, false)).join('')}</div>
      <h3 style="margin:14px 0 6px">Guardians</h3>
      <div class="cards">${BOSS_PIECES.map((t, i) => card(t, i, true)).join('')}</div>
      ${musicVolumeRow()}
      <div class="row"><button class="btn ghost" data-act="mr-back">Back</button></div>
    </div>`);
}

/** For the region piece playing: which instrument plays the tune (kept, and used in the Wilds). */
function leadRow() {
  const th = musicRoom && !musicRoom.boss && musicRoom.theme;
  if (!th) return '';
  const pick = (save.musicLead || {})[th.id];
  const dflt = th.leads.map((l) => LEAD_OPTIONS.find((o) => o.id === l).label).join(', then ');
  const b = (v, label, on) => `<button class="btn${on ? '' : ' ghost'}" data-act="mr-lead" data-v="${v}">${label}</button>`;
  return `
      <p class="sub" style="margin:10px 0 4px">The tune of <b>${th.name}</b> on:</p>
      <div class="row">
        ${b('', `As composed (${dflt})`, !pick)}
        ${LEAD_OPTIONS.map((o) => b(o.id, o.label, pick === o.id)).join('')}
      </div>`;
}

function leaveMusicRoom() {
  musicRoom = null;
  setAmbientTheme(null);
  setBossTheme(null);
  setMusicIntensity(1);
}

// --- the Wardrobe: the Wanderer's outfit, piece by piece ---------------------------------
//
// Every slot of the outfit (outfits.js) with all its pieces, the dyes, and
// whole outfits a tap away, beside a live Wanderer who turns and walks so
// every piece can be seen from every side. The outfit is saved and worn
// wherever the Wanderer is drawn (the Wilds and the dungeons, or everywhere
// if the Wanderer is chosen as the character).

let ward = null;        // { tab, oct, turn, walk, p, raf } while the wardrobe is open

function wardOutfit() { return normaliseOutfit(save.outfit); }

function wardSet(patch) {
  save.outfit = { ...wardOutfit(), ...patch };
  setOutfit(save.outfit);
  writeSave();
  wardRefresh();
}

function wardTabs() {
  const tabs = [{ id: 'sets', name: 'Outfits' }, ...OUTFIT_SLOTS.map((s) => ({ id: s.id, name: s.name })), { id: 'dyes', name: 'Dyes' }];
  return tabs.map((t) => `<button class="wtab${ward.tab === t.id ? ' on' : ''}" data-act="w-tab" data-v="${t.id}">${t.name}</button>`).join('');
}

function wardOptions() {
  const o = wardOutfit();
  if (ward.tab === 'sets') {
    return `<p class="wnote">Whole outfits. Pick one, then change any piece or dye.</p><div class="wchips">${
      OUTFIT_PRESETS.map((pr, i) => `<button class="wchip" data-act="w-preset" data-idx="${i}">${pr.name}</button>`).join('')}</div>`;
  }
  if (ward.tab === 'dyes') {
    return OUTFIT_DYES.map((d) => `
      <div class="wdyerow"><span class="wdyename">${d.name}</span>${
        Object.entries(d.list).map(([id, v]) => {
          const c = v.c[0] || '#888';
          const inner = v.c[0] ? '' : '⚔';
          return `<button class="wswatch${o[d.id] === id ? ' on' : ''}" data-act="w-dye" data-slot="${d.id}" data-v="${id}" title="${v.name}" style="background:${c}">${inner}</button>`;
        }).join('')}</div>`).join('') + '<p class="wnote">⚔ = the accent follows your weapon\'s colour.</p>';
  }
  const slot = OUTFIT_SLOTS.find((s) => s.id === ward.tab);
  const cur = slot.list[o[slot.id]];
  return `<div class="wchips">${
    Object.entries(slot.list).map(([id, v]) => `<button class="wchip${o[slot.id] === id ? ' on' : ''}" data-act="w-piece" data-slot="${slot.id}" data-v="${id}">${v.name}</button>`).join('')
  }</div><p class="wnote"><b>${cur.name}</b>${cur.desc ? ' - ' + cur.desc : ''}</p>`;
}

function wardRefresh() {
  const t = document.getElementById('wardtabs');
  const op = document.getElementById('wardopts');
  if (t) t.innerHTML = wardTabs();
  if (op) op.innerHTML = wardOptions();
  const w = document.getElementById('wardwalk');
  if (w) w.textContent = ward.walk ? 'Stand' : 'Walk';
  const tn = document.getElementById('wardturn');
  if (tn) tn.textContent = ward.turn ? 'Hold still' : 'Turn';
}

let wardBack = null;
function showWardrobe(back = null) {
  if (back) wardBack = back;
  if (!ward) ward = { tab: 'sets', oct: 2, turn: true, walk: false, p: null, raf: 0, t0: 0 };
  setOutfit(save.outfit);
  showOverlay(`
    <div class="panel wardrobe">
      <div class="eyebrow">the wanderer</div>
      <h2>Wardrobe</h2>
      <div class="wardwrap">
        <div class="wardleft">
          <canvas id="wardcv"></canvas>
          <div class="row">
            <button class="btn ghost" data-act="w-rot" data-v="-1" aria-label="Turn left">◀</button>
            <button class="btn ghost" id="wardturn" data-act="w-turn">Hold still</button>
            <button class="btn ghost" id="wardwalk" data-act="w-walk">Walk</button>
            <button class="btn ghost" data-act="w-rot" data-v="1" aria-label="Turn right">▶</button>
          </div>
        </div>
        <div class="wardright">
          <div class="wardtabs" id="wardtabs"></div>
          <div class="wardopts" id="wardopts"></div>
        </div>
      </div>
      <p class="sub" style="font-size:12px">Worn by the Wanderer in the Wilds and the dungeons - and everywhere if you choose the Wanderer as your character.
      Every piece is open for now, to try on.</p>
      <div class="row">
        <button class="btn ghost" data-act="w-random">Surprise me</button>
        <button class="btn ghost" data-act="w-reset">The Wanderer's own</button>
        <button class="btn" data-act="w-done">Done</button>
      </div>
    </div>`);
  wardRefresh();
  // Dressed with the weapon in hand, so an accent that follows it shows true.
  if (!ward.p) ward.p = createPlayer((world.player && world.player.weapon) || WEAPONS[0], {});
  cancelAnimationFrame(ward.raf);
  ward.t0 = performance.now();
  ward.raf = requestAnimationFrame(wardFrame);
}

/** The live Wanderer in the wardrobe: turning through the eight views, walking in place. */
function wardFrame(now) {
  if (!ward) return;
  const cv = document.getElementById('wardcv');
  if (!cv) { ward.raf = 0; return; }
  ward.raf = requestAnimationFrame(wardFrame);
  const dt = Math.min(0.05, (now - (ward.last || now)) / 1000);
  ward.last = now;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = cv.clientWidth || 220, H = cv.clientHeight || 240;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const c = cv.getContext('2d');
  const p = ward.p;
  if (ward.turn) ward.oct = Math.floor((now - ward.t0) / 1400) % 8;
  const a = ward.oct * Math.PI / 4;
  p.wFace = a;
  p.aimAngle = a;
  p.moveAngle = a;
  p.moveMag = ward.walk ? 1 : 0;
  if (ward.walk) { p.x += Math.cos(a) * 150 * dt; p.y += Math.sin(a) * 150 * dt; }
  p.hurtFlash = 0; p.invuln = 0;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2a3a2c'); g.addColorStop(1, '#4a6a3e');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.fillStyle = 'rgba(0,0,0,0.18)';
  c.beginPath(); c.ellipse(W / 2, H * 0.74, W * 0.32, H * 0.07, 0, 0, Math.PI * 2); c.fill();
  const Z = Math.min(W, H) / 70;
  c.setTransform(dpr * Z, 0, 0, dpr * Z, dpr * (W / 2 - p.x * Z), dpr * (H * 0.66 - p.y * Z));
  const was = look.skin;
  look.skin = 'wanderer';
  try { drawPlayer(p, c); } finally { look.skin = was; }
}

function closeWardrobe() {
  if (ward) cancelAnimationFrame(ward.raf);
  ward = null;
}

function showTitle() {
  if (musicRoom) leaveMusicRoom();
  if (ward) closeWardrobe();
  state = 'title';
  showOverlay(`
    <div class="panel">
      <div class="eyebrow">top-down action roguelike · prototype</div>
      <h1>Ashfall</h1>
      ${versionRow()}
      ${buildRow()}
      <p class="sub">Every guardian stands between you and the surface, one in every other chamber.
      You have three lives.
      Clear a room, choose a door, take a boon, go deeper.
      Death is not the end — the darkness you carry out makes you stronger.</p>
      <div class="row">
        <button class="btn" data-act="biome">Begin Run</button>
        <button class="btn ghost" data-act="trials">Boss Trials</button>
        <button class="btn ghost" data-act="tutorial">Tutorial</button>
        <button class="btn ghost" data-act="training">Training Ground</button>
        <button class="btn ghost" data-act="wilds">The Wilds (open world)</button>
        <button class="btn ghost" data-act="dungeon-demo">Dungeons</button>
        <button class="btn ghost" data-act="music-room">Music Room</button>
        <button class="btn ghost" data-act="mirror">Mirror of Night · ${save.darkness} ◆</button>
        <button class="btn ghost" data-act="padcheck">Controller Check</button>
      </div>
      ${fullscreenRow()}
      ${playerRows(showTitle)}
      ${statBlock()}
      ${musicVolumeRow()}
      ${dualSenseRow()}
      <div class="keys">
        <b>Touch</b> — left half drags to move · <kbd>ATK</kbd> attack · <kbd>DASH</kbd> dash ·
        <kbd>SPEC</kbd> special · <kbd>BOMB</kbd> grenade (drag from it to aim; drag onto ✕ to cancel) ·
        the row at the bottom casts your spells<br>
        <b>Keyboard</b> — <kbd>WASD</kbd> move · <kbd>mouse</kbd> aim · <kbd>click</kbd>/<kbd>J</kbd> attack ·
        <kbd>Space</kbd> dash · <kbd>K</kbd> special · <kbd>Q</kbd> grenade (hold to aim, right-click cancels) ·
        <kbd>R</kbd> reload (blunderbuss) ·
        <kbd>1</kbd>–<kbd>4</kbd> spells ·
        <kbd>M</kbd> mute · <kbd>Esc</kbd> pause<br>
        <b>Controller</b> — <kbd>L stick</kbd> move · <kbd>R stick</kbd> aim · <kbd>R2</kbd> attack ·
        <kbd>L2</kbd> special · <kbd>✕</kbd>/<kbd>L1</kbd> dash · <kbd>○</kbd> grenade (hold + R stick; dash cancels) ·
        hold <kbd>R1</kbd> + <kbd>✕○□△</kbd> spells ·
        <kbd>Options</kbd> pause
      </div>
    </div>`);
}

/**
 * Which build this is, and whether GitHub has a newer one (update.js). The
 * button always fetches everything fresh; it just says "Update" when there is
 * something newer to get.
 */
function buildRow() {
  checkBuild();
  return `
    <div class="build" id="buildline">
      <span id="buildtext">Build ${BUILD} · ${BUILT} · checking GitHub…</span>
      <button class="btn ghost small" data-act="update" id="buildbtn">Force refresh</button>
    </div>`;
}

async function checkBuild() {
  const latest = await latestBuild();
  const text = document.getElementById('buildtext');
  const btn = document.getElementById('buildbtn');
  const line = document.getElementById('buildline');
  if (!text || !btn || !line) return;              // the title has gone
  if (latest === null) {
    text.textContent = `Build ${BUILD} · ${BUILT} · couldn't reach GitHub (offline?)`;
  } else if (latest > BUILD) {
    text.textContent = `Build ${BUILD} · build ${latest} is on GitHub`;
    btn.textContent = `Update to build ${latest}`;
    line.classList.add('stale');
  } else {
    text.textContent = `Build ${BUILD} · ${BUILT} · up to date with GitHub`;
    line.classList.add('fresh');
  }
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

let pendingBoons = [];
function showBoonSelect() {
  state = 'boon';
  const p = world.player;
  pendingBoons = offerBoons(p, 3);
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

// --- Spell doors (Version 4): pick 1 of 3; known spells level up --------------

let pendingSpells = [];
let pendingSpellId = null;

// Where a spell choice goes when it is made: the next chamber in a run, or
// back to The Wilds (a camp's spoils, a guardian's gift).
let spellDone = null, spellEyebrow = 'a spell tome lies open';
function finishSpell() {
  const next = spellDone || advanceRoom;
  spellDone = null;
  spellEyebrow = 'a spell tome lies open';
  next();
}

function showSpellSelect(again = false, opts = null) {
  const p = world.player;
  if (opts) { spellDone = opts.done || null; spellEyebrow = opts.eyebrow || spellEyebrow; }
  // Coming back from the replace screen shows the same three spells.
  if (!again) pendingSpells = offerSpells(p, 3);
  if (!pendingSpells.length) { finishSpell(); return; }
  state = 'boon';
  if (!again) sfx.boon();
  const cards = pendingSpells.map((sp, i) => {
    const c = spellColor(sp);
    const el = ELEMENT_INFO[sp.element];
    const lv = spellLevel(p, sp.id);
    const known = lv > 0;
    const worn = p.spells.includes(sp.id);
    const head = known ? `level ${lv} \u2192 ${lv + 1}${worn ? '' : ' \u00b7 in your book'}` : 'new';
    const tag = `${el.name}${el.effect ? ` · ${el.effect}` : ''} · ${sp.cd}s cooldown`;
    return `
      <div class="card spellcard" data-act="spell-pick" data-idx="${i}" style="border-color:${c}88">
        <div class="glyph" style="color:${c}">${sp.glyph}</div>
        <div class="tag" style="color:${c}">${tag}</div>
        <div class="name">${sp.name} <span style="opacity:.6">${head}</span></div>
        <div class="desc">${known ? `<b>Level up:</b> ${sp.up}.` : sp.desc}</div>
      </div>`;
  }).join('');
  showOverlay(`
    <div class="panel">
      <div class="eyebrow">${spellEyebrow}</div>
      <h2>Choose a spell</h2>
      <p class="sub">A spell you take is yours for good: it goes into your spell book. One you already have levels up (to 3).
      ${p.spells.length} of ${p.spellSlots ?? SPELL_SLOTS} spell slots filled${p.spells.length >= (p.spellSlots ?? SPELL_SLOTS) ? ': a new spell can be swapped in now, or kept in the book for later' : ''}.</p>
      <div class="cards">${cards}</div>
      <div class="row"><button class="btn ghost" data-act="spell-skip">Leave the tome</button></div>
    </div>`);
}

/**
 * A new spell, learned, with every slot full: it is already yours (in your
 * spell book). Swap it in now for one you carry, or keep it for later.
 */
function showSpellReplace(id) {
  const p = world.player;
  const sp = spellById(id);
  pendingSpellId = id;
  const journey = world.overworld || world.dungeon;
  const cards = p.spells.map((sid, i) => {
    const s = spellById(sid);
    const c = spellColor(s);
    return `
      <div class="card spellcard" data-act="spell-replace" data-idx="${i}" style="border-color:${c}88">
        <div class="glyph" style="color:${c}">${s.glyph}</div>
        <div class="name">${s.name} <span style="opacity:.6">level ${spellLevel(p, sid)}</span></div>
        <div class="desc">Put ${s.name} back in the book and carry ${sp.name} instead. ${s.name} stays yours, at its level.</div>
      </div>`;
  }).join('');
  showOverlay(`
    <div class="panel">
      <div class="eyebrow">a new spell is yours</div>
      <h2 style="color:${spellColor(sp)}">${sp.glyph} ${sp.name} learned</h2>
      <p class="sub">It is in your spell book now, for good. Your slots are full: swap it in for one you carry,
      or keep it in the book${journey ? ' and equip it at any Ashlamp (Attune)' : ' for now'}.</p>
      <div class="cards">${cards}</div>
      <div class="row"><button class="btn" data-act="spell-keep">Keep it in the book</button></div>
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
  ...KIN_NAMES,
  spikes: 'the spikes', darts: 'a dart trap', fire: 'a fire vent', blade: 'a swinging blade', pit: 'the dark below', fall: 'a fall',
  ...YOKAI_NAMES,
  ...MINI_NAMES,
};

// --- Boss Trials ------------------------------------------------------------

function showTrials() {
  state = 'trials';
  const order = BOSS_POOL;
  const cards = order.map((type) => {
    const b = BOSS_INFO[type];
    return `
      <div class="card" data-act="trial-pick" data-boss="${type}" style="border-color:${b.color}66">
        <div class="tag" style="color:${b.color}">${b.animal}</div>
        <div class="name" style="color:${b.color}">${b.title}</div>
        <div class="desc">${b.subtitle}</div>
      </div>`;
  }).join('');
  showOverlay(`
    <div class="panel">
      <div class="eyebrow">practice · nothing is banked</div>
      <h2>Boss Trials</h2>
      <p class="sub">Fight any guardian on its own, with a few boons to start.
      In a real run you face all of them, in a random order, one in every other chamber.</p>
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

// --- Training Ground -------------------------------------------------------
// A room with straw dummies where the loadout can be rebuilt at any time, so a
// weapon or a spell can be learned without spending a run on it. Nothing here
// is banked.

const training = {
  weapon: 0,
  spells: [],           // spell ids, in slot order
  levels: {},           // id -> 1..3
  invincible: true,
  freeCasts: false,
  dummyHp: 1000,        // 0 = endless (never breaks, refills)
  dummyRespawn: false,  // does a broken dummy stand back up?
  respawns: [],         // broken dummies waiting to stand back up
};

const DUMMY_HP_CHOICES = [100, 500, 1000, 3000, 0];

/** What can be called into the ring, in the order they appear in a run. */
const TRAINING_FOES = [
  'wretch', 'slinger', 'bomber', 'charger', 'splitter', 'brute', 'spitter',
  'adze', 'chinthe', 'vetala', 'sapper', 'kappa', 'preta', 'draugr', 'duende',
  'crossbow', 'necro', 'jiangshi', 'zealot', 'wolf', 'tengu', 'banshee', 'spearman',
  'ronin', 'kitsune', 'ninja',
  // The mini-bosses, to practise on.
  'kyubi', 'sasaki', 'oni', 'captain', 'alpha', 'queen', 'hag', 'hierophant',
];

function trainingLoadout() {
  const p = world.player;
  if (!p) return;
  p.spells = [];
  p.spellLv = {};
  p.spellCds = {};
  for (const id of training.spells.slice(0, SPELL_SLOTS)) {
    learnSpell(p, id);
    p.spellLv[id] = training.levels[id] || 1;
  }
  p.invincible = training.invincible;
  p.hp = p.stats.maxHp;
}

function trainingSetWeapon(i) {
  training.weapon = clamp(i, 0, WEAPONS.length - 1);
  // Rebuilt rather than patched, so no weapon state survives the swap.
  if (world.training && world.player) {
    const old = world.player;
    const next = createPlayer(WEAPONS[training.weapon], metaBonuses());
    next.x = old.x;
    next.y = old.y;
    next.face = old.face;
    next.aimAngle = old.aimAngle;
    world.player = next;
    trainingLoadout();
  }
}

function trainingToggleSpell(id) {
  const at = training.spells.indexOf(id);
  if (at >= 0) training.spells.splice(at, 1);
  else if (training.spells.length < SPELL_SLOTS) training.spells.push(id);
  else training.spells[SPELL_SLOTS - 1] = id;       // full: replace the last slot
  if (!training.levels[id]) training.levels[id] = 1;
  if (world.training) trainingLoadout();
}

/**
 * One dummy, called in like any other foe. With a set health it can be
 * broken: it reports how long that took, and - if "Dummies stand back up" is
 * on - stands up again where it was a moment later. Endless ones refill.
 */
function trainingDummy(x, y) {
  const e = spawnEnemyDebug('dummy', x, y);
  if (training.dummyHp > 0) {
    e.breakable = true;
    e.hpFloor = undefined;
    e.maxHp = training.dummyHp;
    e.hp = training.dummyHp;
    e.onDeath = (self) => {
      noteBroken(self);
      if (training.dummyRespawn) training.respawns.push({ x, y, t: 1.5 });
    };
  }
  return e;
}

function trainingClear() {
  training.respawns.length = 0;
  clearEntities();
  clearFx();
  resetMeter();
}

function startTraining() {
  resetWorld();
  clearFx();
  resetUi();
  resetInput();
  resetMeter();

  world.biome = getBiome(save.biome);
  initAmbient(world.biome);
  world.player = createPlayer(WEAPONS[training.weapon], metaBonuses());
  world.training = true;
  world.depth = 1;

  const room = generateRoom(1, 0, { training: true });
  startRoom(room);
  trainingLoadout();

  showToast('TRAINING GROUND', 'Pause to change your loadout');
  state = 'playing';
  hideOverlay();
}

// --- The Wilds: the open world ------------------------------------------------------------
// A world to walk around in rather than a run of rooms (wilds-world.js and its
// neighbours). It uses the Training Ground's weapon and spells, so a build is
// set up there first. Being built in steps: this one is the land itself -
// fourteen regions, their climbs, rivers and lakes, and the map.

bindOverworldSpawner(spawnEnemyDebug);
let owBossT = 0;

function showWildsIntro(confirmNew = false) {
  state = 'training';
  const w = WEAPONS[training.weapon];
  const saved = loadJourney();
  const t = saved ? saved.played || 0 : 0;
  const lamp = saved && saved.world && saved.world.last;
  const lampName = lamp ? (LAMP_NAMES[lamp] || 'an Ashlamp') : 'where you began';
  const lv = saved ? 1 + Object.values(saved.levels || {}).reduce((a, b) => a + b, 0) : 1;
  const buttons = confirmNew
    ? `<p class="sub" style="color:#ffb35e">A new journey forgets the one you have: your levels, Cinders, lamps and map. Begin again?</p>
       <div class="row">
         <button class="btn" data-act="w-new-yes">Yes, begin again</button>
         <button class="btn ghost" data-act="wilds">Keep my journey</button>
       </div>`
    : `<div class="row">
        ${saved ? '<button class="btn" data-act="w-continue">Continue</button>' : ''}
        <button class="btn ${saved ? 'ghost' : ''}" data-act="w-new">${saved ? 'New Journey' : 'Set out'}</button>
        <button class="btn ghost" data-act="training">Training Ground loadout</button>
        <button class="btn ghost" data-act="title">Back</button>
      </div>`;
  showOverlay(`
    <div class="panel">
      <div class="eyebrow">in construction &middot; the land and its lamps</div>
      <h2>The Wilds</h2>
      ${saved ? `<p class="sub"><b>Your journey:</b> level ${lv} &middot; ${saved.cinders || 0} Cinders &middot;
        ${(saved.world && saved.world.lamps ? saved.world.lamps.length : 0)} Ashlamps kindled &middot;
        ${Math.floor(t / 3600)}h ${String(Math.floor(t / 60) % 60).padStart(2, '0')}m played.
        You will wake at ${lampName}.</p>` : ''}
      <p class="sub">An island of fourteen lands round the Ashen Heartland, and Saltwind Isle
      across the sea bridge. Kindle the <b>Ashlamps</b> you find: rest at one to heal, get your
      three lives back and save; spend <b>Cinders</b> there to grow stronger; travel between the
      ones you have lit. Fall with no life left and you wake at your last lamp, your Cinders left
      smouldering where you fell.</p>
      <p class="sub">Thirty places hold the land - forts with watchtowers, villages, temples,
      quarries, war camps, graveyards, canyon passes, ruined keeps, hedge gardens - each with
      its posts to fight through and a named champion at its heart guarding a reliquary with a
      spell. Patrols walk the roads. The guardians arrive in the next steps.</p>
      <p class="sub">A new journey takes <b style="color:${w.color}">${w.name}</b> and the Training
      Ground's spells (as many as your spell slots hold).</p>
      ${playerRows(() => showWildsIntro(confirmNew))}
      ${buttons}
    </div>`);
}

// The lamps' names, for the intro screen (the world is not built there yet).
const LAMP_NAMES = Object.fromEntries(LAMPS.map((l) => [l.id, l.name]));

// The Wilds' own progression (wilds-progress.js): the player is made with no
// Mirror of Night bonuses and the journey's levels are laid on top. `wildsBase`
// is that fresh player's stats, which every level is counted from.
let wildsBase = null;
let wildsSaveT = 30;

/** Start the Wilds: `cont` carries on the saved journey, otherwise a new one. */
function startWilds(cont) {
  resetWorld();
  clearFx();
  resetUi();
  resetInput();
  world.biome = getBiome(save.biome);
  const saved = cont ? loadJourney() : null;
  if (!saved) { clearJourney(); resetJourney(); }
  else {
    journey.levels = { ...journey.levels, ...saved.levels };
    journey.smoulder = saved.smoulder || null;
  }
  if (saved && WEAPONS[saved.weapon]) training.weapon = saved.weapon;
  world.player = createPlayer(WEAPONS[training.weapon], {});
  wildsBase = { ...world.player.stats };
  world.depth = FIRST_BOSS_DEPTH + BOSS_GAP;
  const p = world.player;
  if (saved) {
    p.spells = (saved.spells || []).filter((id) => spellById(id));
    p.spellLv = saved.spellLv || {};
    p.spellCds = {};
  } else {
    trainingLoadout();
  }
  applyLevels(p, wildsBase);
  p.hp = p.stats.maxHp;
  p.invincible = false;
  world.gold = saved ? saved.cinders || 0 : 0;
  world.runTime = saved ? saved.played || 0 : 0;
  world.wildsLevel = totalLevel();
  wildsGhost = false;
  wildsSaveT = 30;
  world.overworld = true;
  const room = enterOverworld(true);
  world.room = room;
  if (saved && saved.world) restoreWorld(saved.world);
  journey.lastLampId = saved && saved.world ? saved.world.last : null;
  setMapFog(!!save.mapNoFog);
  const at = overworldRespawn();
  p.x = at.x; p.y = at.y;
  arriveAt(p.x, p.y);
  snapCamera();
  const lamp = lampById(journey.lastLampId);
  if (saved) showToast(lamp ? `YOU WAKE AT ${lamp.name.toUpperCase()}` : 'YOUR JOURNEY GOES ON', `Level ${totalLevel()} \u00b7 ${world.gold} Cinders`, 3.4);
  else showToast('THE WILDS', 'Find an Ashlamp. Tab or tap the minimap for the map.', 4);
  state = 'playing';
  hideOverlay();
  saveWilds();
}

/** Keep the journey (everything but where you stand). */
function saveWilds() {
  const p = world.player;
  if (!p || !(world.overworld || world.owBoss)) return;
  saveJourney({
    levels: journey.levels,
    smoulder: journey.smoulder,
    cinders: world.gold,
    weapon: WEAPONS.indexOf(p.weapon),
    spells: p.spells,
    spellLv: p.spellLv,
    played: world.runTime,
    world: worldSnapshot(),
  });
}

// --- the Ashlamps ----------------------------------------------------------------------------
// Standing still at a kindled lamp rests you there: everything back, it becomes
// where you wake, and the journey is saved. Then its menu: level up, travel to
// another lamp, attune your spells, change weapon, or rise and go on.

let curLamp = null;

function restAtLamp(lamp) {
  const p = world.player;
  if (!p) return;
  restore(p);
  setLastLamp(lamp.id);
  journey.lastLampId = lamp.id;
  resetWildsSites();                 // the land's enemies return, souls-style
  sfx.heal();
  saveWilds();
  showLampMenu(lamp);
}

function lampHeader(lamp, eyebrow) {
  return `
    <div class="eyebrow">${eyebrow}</div>
    <h2 style="color:#ffb35e">${lamp.name}</h2>
    <div class="stats">
      <div class="stat"><b>${totalLevel()}</b><span>Level</span></div>
      <div class="stat"><b style="color:#ff9a5a">${world.gold}</b><span>Cinders</span></div>
      <div class="stat"><b>${levelCost()}</b><span>Next level</span></div>
    </div>`;
}

function showLampMenu(lamp) {
  curLamp = lamp;
  state = 'paused';
  showOverlay(`
    <div class="panel">
      ${lampHeader(lamp, 'ashlamp &middot; rested')}
      <p class="sub">Your wounds close and your three lives return. You will wake here if you fall.</p>
      <div class="row">
        <button class="btn" data-act="l-level">Level up</button>
        <button class="btn ghost" data-act="l-travel">Travel</button>
        <button class="btn ghost" data-act="l-attune">Attune spells</button>
        <button class="btn ghost" data-act="l-weapon">Weapon</button>
        <button class="btn ghost" data-act="l-leave">Rise</button>
      </div>
    </div>`);
}

function showLevelUp(msg = '') {
  const lamp = curLamp;
  const cost = levelCost();
  const rows = ATTRS.map((a) => {
    const lv = journey.levels[a.id];
    const maxed = lv >= a.max;
    const can = !maxed && world.gold >= cost;
    return `
      <div class="volrow">
        <span class="vollabel"><b>${a.name}</b> &middot; ${lv} / ${a.max}</span>
        <span class="vollabel" style="opacity:.75">${a.what}</span>
        <button class="btn ${can ? '' : 'ghost'} small" data-act="l-buy" data-id="${a.id}" ${can ? '' : 'disabled'}>${maxed ? 'Full' : `+1 &middot; ${cost}`}</button>
      </div>`;
  }).join('');
  showOverlay(`
    <div class="panel">
      ${lampHeader(lamp, 'ashlamp &middot; burn cinders to grow')}
      ${msg ? `<p class="sub" style="color:#9fe0a0">${msg}</p>` : ''}
      ${rows}
      <div class="row"><button class="btn ghost" data-act="l-back">Back</button></div>
    </div>`);
}

function showTravel() {
  const lamp = curLamp;
  const others = litLamps().filter((l) => l.id !== lamp.id);
  const list = others.length
    ? others.map((l) => `<button class="tgl" data-act="l-go" data-id="${l.id}">${l.name}</button>`).join('')
    : '<p class="sub">Kindle other Ashlamps to travel between them.</p>';
  showOverlay(`
    <div class="panel">
      ${lampHeader(lamp, 'ashlamp &middot; travel')}
      <div class="chips">${list}</div>
      <div class="row"><button class="btn ghost" data-act="l-back">Back</button></div>
    </div>`);
}

function showAttune(msg = '') {
  const lamp = curLamp;
  const p = world.player;
  const known = knownSpells(p);
  const list = known.length
    ? known.map((id) => {
      const sp = spellById(id);
      const on = p.spells.includes(id);
      return `<button class="tgl ${on ? 'on' : ''}" data-act="l-spell" data-id="${id}" style="${on ? `border-color:${spellColor(sp)};color:${spellColor(sp)}` : ''}">${sp.glyph} ${sp.name}</button>`;
    }).join('')
    : '<p class="sub">You know no spells yet.</p>';
  showOverlay(`
    <div class="panel">
      ${lampHeader(lamp, 'ashlamp &middot; attune')}
      <p class="sub">${p.spells.length} of ${p.spellSlots} spell slots filled. Attunement opens more (at levels 2, 5 and 9).</p>
      ${msg ? `<p class="sub" style="color:#ffb35e">${msg}</p>` : ''}
      <div class="chips">${list}</div>
      <div class="row"><button class="btn ghost" data-act="l-back">Back</button></div>
    </div>`);
}

function showLampWeapon() {
  const lamp = curLamp;
  const p = world.player;
  showOverlay(`
    <div class="panel">
      ${lampHeader(lamp, 'ashlamp &middot; weapon')}
      <div class="chips">${WEAPONS.map((w, i) => `
        <button class="tgl ${p.weapon === w ? 'on' : ''}" data-act="l-weapon-pick" data-idx="${i}" style="${p.weapon === w ? `border-color:${w.color};color:${w.color}` : ''}">${w.glyph} ${w.name}</button>`).join('')}</div>
      <div class="row"><button class="btn ghost" data-act="l-back">Back</button></div>
    </div>`);
}

/** Travel: straight to another kindled lamp, and rest there. */
function travelTo(id) {
  const l = lampById(id);
  const p = world.player;
  if (!l || !p) return;
  p.x = l.x; p.y = l.y + 70; p.vx = p.vy = 0;
  arriveAt(p.x, p.y);
  snapCamera();
  restore(p);
  setLastLamp(l.id);
  journey.lastLampId = l.id;
  resetWildsSites();
  saveWilds();
  wildsResume();
  showToast(l.name.toUpperCase(), 'You rest, and rise', 2.4);
}

/**
 * A reliquary opens: Cinders every time; the first time at a site, a spell as
 * well (chosen from three, as at a Spell door).
 */
function openReliquary(site) {
  const champ = site.kind === 'champion';
  const bonus = Math.round((site.mini ? 380 : champ ? 160 : 50) * (1 + site.tier) * (site.claimed ? 0.5 : 1));
  world.gold += bonus;
  const first = champ && !site.claimed;
  site.claimed = true;
  saveWilds();
  if (first) {
    showToast('THE RELIQUARY', `${bonus} Cinders, and a spell`, 2.6);
    showSpellSelect(false, { eyebrow: 'the reliquary', done: () => { saveWilds(); wildsResume(); } });
  } else {
    showToast('THE RELIQUARY', `${bonus} Cinders`, 2.4);
  }
}

/** Testing: Cinders to spend. */
function testRow() {
  return `
    <div class="volrow">
      <span class="vollabel">Testing</span>
      <button class="tgl" data-act="w-cinders">+1000 Cinders</button>
    </div>`;
}

function snapCamera() {
  const p = world.player;
  camera.x = clamp(p.x - view.w / 2, 0, Math.max(0, arena.w - view.w));
  camera.y = clamp(p.y - view.h / 2, 0, Math.max(0, arena.h - view.h));
}

/** Stepping through a gate: that guardian's own arena, as a Boss Trial plays it. */
/** Back to The Wilds from a menu. */
function wildsResume() {
  state = 'playing';
  hideOverlay();
  resetInput();
}

let owFight = null;         // { site, boss } or { final: true, boss } while fighting

/** A lair's fog gate: go on, or not yet. */
function showLairGate(L) {
  state = 'paused';
  const info = BOSS_INFO[L.boss] || { title: L.boss, subtitle: '', color: '#fff', animal: '' };
  showOverlay(`
    <div class="panel">
      <div class="eyebrow">a wall of fog</div>
      <h2>${L.name}</h2>
      <div class="cards">
        <div class="card" style="border-color:${info.color}88">
          <div class="tag" style="color:${info.color}">${info.animal}</div>
          <div class="name" style="color:${info.color}">${info.title}</div>
          <div class="desc">${info.subtitle}</div>
        </div>
      </div>
      <p class="sub">Beyond the fog there is no way out until one of you falls. Your lives go in with you.
      Fall with none to spare and you wake at your last Ashlamp, your Cinders left smouldering at this door.</p>
      <div class="row">
        <button class="btn" data-act="w-lair" data-id="${L.id}">Walk into the fog</button>
        <button class="btn ghost" data-act="w-away">Not yet</button>
      </div>
    </div>`);
}

// --- dungeons ---------------------------------------------------------------------------------
let pendingDungeon = null;

/** At the head of a dungeon's stair in the Wilds: go down? */
function showDungeonGate(d) {
  state = 'paused';
  pendingDungeon = d;
  const info = dungeonInfo(d.id);
  const done = (save.dungeonsCleared || {})[d.id];
  showOverlay(`
    <div class="panel">
      <div class="eyebrow">steps down into the dark${done ? ' · cleared before' : ''}</div>
      <h2>${info.name}</h2>
      <p class="sub">${info.blurb} Find the key, open the great door - ${info.boss} waits beyond it.</p>
      <div class="row">
        <button class="btn" data-act="d-enter">Go down</button>
        <button class="btn ghost" data-act="w-away">Not yet</button>
      </div>
    </div>`);
}

function enterDungeonFromWilds(d) {
  saveWilds();
  world.overworld = false;
  world.dungeon = true;
  world.enemies = [];
  clearFx(); clearBullets();
  enterDungeon({ x: d.x, y: d.y }, d.id);
}

let demoDungeon = 'catacomb';

/** Every dungeon, to go straight into from the title screen. */
function showDungeonList() {
  const cards = DUNGEON_LIST.map((id, i) => {
    const info = dungeonInfo(id);
    const done = (save.dungeonsCleared || {})[id];
    return `
      <div class="card musiccard" data-act="d-pick" data-idx="${i}">
        <div class="name">${done ? '✓ ' : ''}${info.name}</div>
        <div class="desc">${info.blurb}</div>
        <div class="desc" style="opacity:.7">At the bottom: ${info.boss}</div>
      </div>`;
  }).join('');
  showOverlay(`
    <div class="panel">
      <div class="eyebrow">the dungeons</div>
      <h2>Go down</h2>
      <p class="sub">Each dungeon is built round its own trick. In the Wilds they are ruined stairs marked on the map;
      from here you go in with the Training Ground loadout.</p>
      <div class="cards">${cards}</div>
      <div class="row"><button class="btn ghost" data-act="title">Back</button></div>
    </div>`);
}

/** A dungeon, straight from the title screen. */
function startDungeonDemo(id = demoDungeon) {
  demoDungeon = id;
  resetWorld();
  clearFx();
  resetUi();
  resetInput();
  world.biome = getBiome(save.biome);
  world.player = createPlayer(WEAPONS[training.weapon], {});
  trainingLoadout();
  const p = world.player;
  p.invincible = false; p.hp = p.stats.maxHp;
  world.depth = 3;
  world.gold = 0;
  world.runTime = 0;
  world.dungeon = true;
  enterDungeon('demo', id);
  state = 'playing';
  hideOverlay();
}

/** Out of the dungeon: back up the stair into the Wilds, or (the demo) to its end screen. */
function exitDungeon(kind) {
  const D = dungeonState();
  const from = D ? D.from : 'demo';
  const dName = D ? D.name : 'The dungeon', bossTitle = D ? D.boss.title : 'Its keeper';
  if (kind === 'cleared' && D) {
    save.dungeonsCleared = { ...(save.dungeonsCleared || {}), [D.id]: true };
    writeSave();
  }
  world.dungeon = false;
  leaveDungeon();
  clearBullets();
  if (from === 'demo') {
    state = 'paused';
    world.enemies = [];
    showOverlay(`
      <div class="panel">
        <div class="eyebrow">the dungeon demo</div>
        <h2>${kind === 'cleared' ? `${dName} is cleared` : 'Back into the daylight'}</h2>
        <p class="sub">${kind === 'cleared' ? `${bossTitle} fell and the way out opened.` : 'You climbed back out before the end.'}
        Time ${Math.floor(world.runTime / 60)}:${String(Math.floor(world.runTime % 60)).padStart(2, '0')} &middot; kills ${world.kills}.</p>
        <div class="row">
          <button class="btn" data-act="d-again">Go down again</button>
          <button class="btn ghost" data-act="dungeon-demo">Another dungeon</button>
          <button class="btn ghost" data-act="title">Title screen</button>
        </div>
      </div>`);
    return;
  }
  world.overworld = true;
  world.enemies = [];
  world.room = enterOverworld(false);
  const p = world.player;
  p.x = from.x; p.y = from.y + 90; p.vx = p.vy = 0; p.fallK = 0;
  arriveAt(p.x, p.y);
  resetWildsSites();
  snapCamera();
  saveWilds();
  state = 'playing';
  showToast(kind === 'cleared' ? `${dName.toUpperCase()} IS CLEARED` : 'BACK IN THE WILDS', kind === 'cleared' ? 'You climb out into the light' : 'The dark will wait', 3);
}

function showDungeonPause() {
  state = 'paused';
  const D = dungeonState();
  const F = D ? D.floors[D.cur] : null;
  showOverlay(`
    <div class="panel">
      <div class="eyebrow">${D ? D.name : 'a dungeon'}</div>
      <h2>${F ? F.name : 'Paused'}</h2>
      <p class="sub">${D && D.key ? `You carry ${D.keyInfo.name}.` : `The great door wants ${D ? D.keyInfo.name : 'a key'}.`} ${D && D.bossDead ? `${D.boss.title} has fallen.` : ''}</p>
      ${playerRows(showDungeonPause)}
      <div class="row">
        <button class="btn" data-act="w-resume">Resume</button>
        <button class="btn ghost" data-act="d-leave">Leave the dungeon</button>
      </div>
    </div>`);
}

/** Step back out of a gate (or away from the statue) and carry on. */
function wildsStepAway() {
  const p = world.player;
  if (p) { p.y += 90; p.vx = p.vy = 0; }
  wildsResume();
}

/** The last guardian fell: the ending, and its reward. */
function showWildsVictory(first) {
  state = 'paused';
  const pr = overworldProgress();
  const reward = 500;
  if (first) {
    save.darkness += reward;
    writeSave();
  }
  const t = world.runTime;
  showOverlay(`
    <div class="panel">
      <div class="eyebrow">thirteen sockets burn</div>
      <h1>The Ash Lifts</h1>
      <p class="sub">The Warden of Ash falls at its own gate, and for the first time in an age the sky over the Wilds clears.
      The land stays yours to wander.<br>
      ${first ? `You carry <b>${reward} darkness</b> out with you, for the Mirror of Night.` : 'The ending is yours again.'}</p>
      <div class="stats">
        <div class="stat"><b>${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}</b><span>Time</span></div>
        <div class="stat"><b>${world.kills}</b><span>Kills</span></div>
        <div class="stat"><b>${pr ? pr.regions.length : 0}/${pr ? pr.regionsTotal : 0}</b><span>Lands found</span></div>
        <div class="stat"><b>${pr ? (pr.explored * 100).toFixed(0) : 0}%</b><span>Explored</span></div>
      </div>
      <div class="row">
        <button class="btn" data-act="w-resume">Keep exploring</button>
        <button class="btn ghost" data-act="w-leave">Title screen</button>
      </div>
    </div>`);
}

function enterGateFight(bossType, name, ctx = null) {
  owFight = ctx || { boss: bossType };
  world.overworld = false;
  world.owBoss = bossType;
  owBossT = 0;
  camera.x = 0;
  camera.y = 0;
  chamberArena();
  clearEntities();
  clearFx();
  // A guardian comes as hard as its land: the first lands' a little softer
  // than a Boss Trial, the next a little harder.
  const tier = ctx && ctx.tier !== undefined ? ctx.tier : 1;
  startRoom(generateRoom(world.depth, 0, { bossType, slot: 1, tier }));
  showToast(name.toUpperCase(), BOSS_INFO[bossType] ? BOSS_INFO[bossType].title : '');
}

function leaveGateFight(won) {
  const ctx = owFight;
  owFight = null;
  world.owBoss = null;
  world.overworld = true;
  clearEntities();
  clearFx();
  clearBullets();
  world.room = enterOverworld(false);
  const L = ctx && ctx.lair ? lairById(ctx.lair) : null;
  // Back out through the lair's door (or, if it is somehow gone, at your lamp).
  const at = L ? { x: L.gx, y: L.gy + 90 } : overworldRespawn();
  const p = world.player;
  p.attack = null; p.dashing = false; p.aiming = null;
  // Fallen with no life left: your Cinders stay at the lair's door.
  if (!won) { wakeAtLamp(at.x, at.y); return; }
  p.dead = false;
  p.x = at.x; p.y = at.y; p.vx = p.vy = 0;
  arriveAt(p.x, p.y);
  p.invuln = 1.5;
  snapCamera();
  state = 'playing';
  p.hp = p.stats.maxHp;
  if (!L) return;
  // The Warden of Ash, at the Ashen Gate: the end of the journey.
  if (L.needs) {
    const first = !L.beaten;
    markLairBeaten(L.id);
    world.gold += 3000;
    sfx.boon();
    saveWilds();
    showWildsVictory(first);
    return;
  }
  // Its Remnant, a great many Cinders, and a spell - and, for a passage, the way on.
  markLairBeaten(L.id);
  const info = BOSS_INFO[L.boss] || { title: 'The guardian' };
  const bonus = Math.round(600 * (1 + L.region.tier));
  world.gold += bonus;
  sfx.boon();
  saveWilds();
  showToast(`${info.title.toUpperCase()} FALLS`, L.passage
    ? `Its Remnant is yours (${remnantCount()} of 13) \u00b7 the way to the Moon Citadel is open`
    : `Its Remnant is yours (${remnantCount()} of 13) \u00b7 ${bonus} Cinders`, 4);
  showSpellSelect(false, { eyebrow: 'the guardian\'s gift', done: () => { saveWilds(); wildsResume(); } });
}

function leaveWilds() {
  saveWilds();
  world.overworld = false;
  world.owBoss = null;
  camera.x = 0;
  camera.y = 0;
  clearEntities();
  world.room = null;
  chamberArena();
  showTitle();
}

/** How much of the land you have walked. */
function wildsQuestRow() {
  const pr = overworldProgress();
  if (!pr) return '';
  const lands = pr.regions.map((n) => `<span class="tgl on">${n}</span>`).join('');
  return `
    <p class="sub" style="margin-bottom:6px">Lands found ${pr.regions.length} / ${pr.regionsTotal}
      &middot; explored ${(pr.explored * 100).toFixed(1)}%</p>
    <div class="chips">${lands}</div>
    ${sitesProgress() ? `<p class="sub" style="margin-top:6px">Champions felled ${sitesProgress().claimed} / ${sitesProgress().total}
      &middot; Remnants ${remnantCount()} / 13</p>` : ''}
    <div class="row"><button class="btn ghost" data-act="w-map">Open the map</button></div>`;
}

// --- the map screen ------------------------------------------------------------------

let wildsMap = null;

function showWildsMap() {
  state = 'map';
  resetInput();
  showOverlay(`
    <div class="mapview">
      <canvas id="wmap"></canvas>
      <div class="maprow">
        <button class="btn ghost small" data-act="map-out" aria-label="Zoom out">&minus;</button>
        <button class="btn ghost small" data-act="map-in" aria-label="Zoom in">+</button>
        <button class="btn ghost small" data-act="map-you">Find me</button>
        <button class="btn ghost small" data-act="map-fog" id="mapfogbtn">${save.mapNoFog ? 'Fog: off' : 'Fog: on'}</button>
        <button class="btn" data-act="map-close">Close</button>
      </div>
      <div class="maprow" id="maptravel"></div>
    </div>`);
  wildsMap = mountWildsMap(document.getElementById('wmap'), {
    onPick: mapPick,
    hint: wildsGhost ? 'Ghost mode: tap anywhere to go there' : 'Tap a kindled lamp to travel there',
  });
}

/**
 * A tap on the map. In ghost mode, straight there. Otherwise, a kindled lamp
 * near the tap offers travel to it - but not with enemies awake near you.
 */
function mapPick(x, y, pxPerUnit) {
  if (wildsGhost) { ghostTo(x, y); return; }
  const box = document.getElementById('maptravel');
  if (!box) return;
  const reach = Math.max(150, 28 / pxPerUnit);
  let best = null, bd = reach;
  for (const l of litLamps()) {
    const d = Math.hypot(l.x - x, l.y - y);
    if (d < bd) { bd = d; best = l; }
  }
  if (!best) { box.innerHTML = ''; return; }
  box.innerHTML = inCombat()
    ? `<span class="sub" style="margin:0">${best.name}: enemies are near you, so you cannot travel now.</span>`
    : `<span style="align-self:center">Travel to <b style="color:#ffb35e">${best.name}</b>?</span>
       <button class="btn small" data-act="map-travel" data-id="${best.id}">Travel</button>`;
}

/** Is a fight on? Anything awake within reach of you, or a guardian's arena. */
function inCombat() {
  const p = world.player;
  if (!p) return false;
  if (world.owBoss) return true;
  return world.enemies.some((e) => !e.dead && !e.spawning && e.type !== 'foxclone'
    && !(e.asleep && e.asleep(e)) && Math.hypot(e.x - p.x, e.y - p.y) < 900);
}

/** Ghost mode: straight to a spot picked on the map. */
function ghostTo(x, y) {
  const p = world.player;
  if (!p) return;
  p.x = x; p.y = y; p.vx = p.vy = 0;
  arriveAt(x, y);
  snapCamera();
  closeWildsMap();
}

function closeWildsMap() {
  if (wildsMap) wildsMap.destroy();
  wildsMap = null;
  wildsResume();
  input.mapPressed = false;          // the Tab that closed it must not reopen it
}

// Ghost mode, for exploring the Wilds fast while it is being built: four
// times the speed, through every wall and over water, and nothing can hurt
// you. On the map, a tap takes you straight there.
let wildsGhost = false;

function setGhost(on) {
  wildsGhost = on;
  const p = world.player;
  if (p) { p.ghost = on; p.invincible = on; }
  showToast(on ? 'GHOST MODE' : 'GHOST MODE OFF',
    on ? 'Fast, through walls, unhurt \u00b7 tap the map to go anywhere' : 'Back on your feet', 2.6);
}

/** The map's fog, on or off (a saved setting). */
function fogRow() {
  return `
    <div class="volrow">
      <span class="vollabel">Map fog</span>
      <button class="tgl ${save.mapNoFog ? '' : 'on'}" data-act="w-fog">${save.mapNoFog ? 'Off: whole map shown' : 'On: only where you have been'}</button>
    </div>`;
}

function toggleMapFog() {
  save.mapNoFog = !save.mapNoFog;
  writeSave();
  setMapFog(save.mapNoFog);
}

function ghostRow() {
  return `
    <div class="volrow">
      <span class="vollabel">Ghost mode (testing)</span>
      <button class="tgl ${wildsGhost ? 'on' : ''}" data-act="w-ghost">${wildsGhost ? 'On' : 'Off'}</button>
      <span class="vollabel" style="opacity:.7">or press G</span>
    </div>`;
}

/** Any weapon, any time, keeping everything else about you. */
function wildsWeaponRow() {
  const p = world.player;
  return `
    <div class="tgsec">Weapon</div>
    <div class="chips">${WEAPONS.map((w, i) => `
      <button class="tgl ${p && p.weapon === w ? 'on' : ''}" data-act="w-weapon" data-idx="${i}" style="${p && p.weapon === w ? `border-color:${w.color};color:${w.color}` : ''}">${w.glyph} ${w.name}</button>`).join('')}</div>`;
}

function swapWeapon(i) {
  const old = world.player;
  if (!old || !WEAPONS[i] || old.weapon === WEAPONS[i]) return;
  // In the Wilds the journey's levels are laid on a player with no Mirror bonuses.
  const next = createPlayer(WEAPONS[i], world.overworld || world.owBoss ? {} : metaBonuses());
  // Rebuilt, so no half-finished swing or reload survives; what you have
  // earned (health, hearts, embers, spells, boons, levels) comes with you.
  for (const k of ['x', 'y', 'face', 'aimAngle', 'stats', 'hp', 'lives', 'spells', 'spellLv', 'spellCds', 'boons', 'boonOrder', 'ghost', 'invincible', 'spellSlots', 'dashStock']) {
    if (old[k] !== undefined) next[k] = old[k];
  }
  next.invuln = 0.5;
  world.player = next;
  training.weapon = i;
}

function showWildsPause() {
  state = 'paused';
  showOverlay(`
    <div class="panel">
      <div class="eyebrow">the wilds</div>
      <h2>Paused</h2>
      ${wildsQuestRow()}
      <div class="row">
        <button class="btn" data-act="w-resume">Resume</button>
        <button class="btn ghost" data-act="mute">${audio.muted ? 'Unmute' : 'Mute'}</button>
        <button class="btn ghost" data-act="music">Music: ${audio.music ? 'On' : 'Off'}</button>
        <button class="btn ghost" data-act="w-leave">Leave The Wilds</button>
      </div>
      ${ghostRow()}
      ${fogRow()}
      ${testRow()}
      ${wildsWeaponRow()}
      ${playerRows(showWildsPause)}
      ${spellSlotsRow()}
      ${musicVolumeRow()}
      ${fullscreenRow()}
    </div>`);
  bindSlotDrag();
}

// --- tutorial chamber --------------------------------------------------------
// Optional, offered once before the first run and always on the title screen.
// The lessons live in tutorial.js; this is entering and leaving.

bindTutorialSpawner(spawnEnemyDebug);

function startTutorial() {
  save.tutorialSeen = true;
  writeSave();
  resetWorld();
  clearFx();
  resetUi();
  resetInput();

  world.biome = getBiome(save.biome);
  initAmbient(world.biome);
  // The blade: the plainest weapon to learn the controls with.
  const blade = WEAPONS.find((w) => w.id === 'blade') || WEAPONS[1] || WEAPONS[0];
  world.player = createPlayer(blade, metaBonuses());
  world.tutorial = true;
  world.depth = 1;

  startRoom(generateRoom(1, 0, { training: true }));
  startLessons();
  state = 'playing';
  hideOverlay();
}

function showTutorialOffer() {
  state = 'tutorial';
  showOverlay(`
    <div class="panel">
      <div class="eyebrow">before you descend</div>
      <h2>New to Ashfall?</h2>
      <p class="sub">A short tutorial chamber teaches moving, attacking, dashing, your
      weapon's special, grenades and spells, one at a time, then a small real fight.
      About two minutes. You can skip it from the pause menu, and it is always on the
      title screen.</p>
      <div class="row">
        <button class="btn" data-act="tutorial">Take the tutorial</button>
        <button class="btn ghost" data-act="tut-no">Skip, straight to the run</button>
      </div>
    </div>`);
}

function showTutorialPause() {
  state = 'paused';
  showOverlay(`
    <div class="panel">
      <div class="eyebrow">tutorial</div>
      <h2>Paused</h2>
      <div class="row">
        <button class="btn" data-act="tut-resume">Resume</button>
        <button class="btn ghost" data-act="tut-skip">Skip the tutorial</button>
        <button class="btn ghost" data-act="mute">${audio.muted ? 'Unmute' : 'Mute'}</button>
      </div>
      ${playerRows(showTutorialPause)}
    </div>`);
}

function showTutorialEnd(finished) {
  state = 'victory';
  showOverlay(`
    <div class="panel">
      <div class="eyebrow">${finished ? 'tutorial complete' : 'tutorial skipped'}</div>
      <h2>${finished ? 'You are ready' : 'Straight in, then'}</h2>
      <p class="sub">Every guardian waits below, one in every other chamber. Clear a room,
      pick a door, take its reward, go deeper. The Training Ground on the title screen
      lets you try any weapon or spell whenever you like.</p>
      <div class="row">
        <button class="btn" data-act="tut-run">Begin Run</button>
        <button class="btn ghost" data-act="tut-title">Title screen</button>
      </div>
    </div>`);
}

/** Per-frame upkeep while the Training Ground is open. */
function updateTraining(dt) {
  updateMeter();
  for (let i = training.respawns.length - 1; i >= 0; i--) {
    const r = training.respawns[i];
    r.t -= dt;
    if (r.t <= 0) { training.respawns.splice(i, 1); trainingDummy(r.x, r.y); }
  }
  const p = world.player;
  if (!p || !training.freeCasts) return;
  // Practice mode: everything is always ready, so a rotation can be drilled.
  for (const id of Object.keys(p.spellCds || {})) p.spellCds[id] = 0;
  p.spellGcd = 0;
  p.specialCd = 0;
  p.dashStock = p.stats.dashCharges;
  p.grenadeStock = GRENADE.maxCharges;
}

function showTraining() {
  const live = !!world.training;
  state = live ? 'paused' : 'training';

  const weapons = WEAPONS.map((w, i) => `
    <div class="card tgw ${i === training.weapon ? 'on' : ''}" data-act="t-weapon" data-idx="${i}"
         style="border-color:${w.color}${i === training.weapon ? '' : '55'}">
      <div class="glyph" style="color:${w.color}">${w.glyph}</div>
      <div class="name" style="color:${w.color}">${w.name}</div>
      <div class="tag" style="color:${w.color}">${w.specialName}</div>
    </div>`).join('');

  const spells = SPELLS.map((s) => {
    const slot = training.spells.indexOf(s.id);
    const on = slot >= 0;
    const lv = training.levels[s.id] || 1;
    const c = spellColor(s);
    return `
      <div class="chip ${on ? 'on' : ''}" data-act="t-spell" data-id="${s.id}" style="--c:${c}">
        ${on ? `<span class="slot">${slot + 1}</span>` : ''}
        <span class="sg" style="color:${c}">${s.glyph}</span>
        <span class="sn">${s.name}</span>
        <span class="sm">${s.element} &middot; ${s.cd}s</span>
        ${on ? `<button class="lv" data-act="t-level" data-id="${s.id}">Lv ${'I'.repeat(lv)}</button>` : ''}
      </div>`;
  }).join('');

  const foes = ['dummy', ...TRAINING_FOES].map((t) => `
    <button class="tgl" data-act="t-spawn" data-type="${t}">${t}</button>`).join('');

  showOverlay(`
    <div class="panel">
      <div class="eyebrow">practice &middot; nothing is banked</div>
      <h2>Training Ground</h2>
      <p class="sub">Swap weapons and spells as often as you like, call in anything
      you want to fight, and watch what your build actually does to a dummy.</p>

      <div class="tgsec">Weapon</div>
      <div class="cards">${weapons}</div>

      <div class="tgsec">Spells &mdash; ${training.spells.length}/${SPELL_SLOTS} equipped (tap Lv to rank up)</div>
      <div class="chips">${spells}</div>

      <div class="tgsec">Dummies &mdash; call one in below, like any foe</div>
      <div class="chips">${DUMMY_HP_CHOICES.map((hp) => `
        <button class="tgl ${training.dummyHp === hp ? 'on' : ''}" data-act="t-hp" data-hp="${hp}">${hp || 'Endless'}</button>`).join('')}
        <button class="tgl ${training.dummyRespawn ? 'on' : ''}" data-act="t-toggle" data-opt="dummyRespawn">Dummies stand back up</button>
      </div>

      <div class="tgsec">Room</div>
      <div class="chips">
        <button class="tgl ${training.invincible ? 'on' : ''}" data-act="t-toggle" data-opt="invincible">Invincible</button>
        <button class="tgl ${training.freeCasts ? 'on' : ''}" data-act="t-toggle" data-opt="freeCasts">No cooldowns</button>
        <button class="tgl" data-act="t-clear">Clear room</button>
      </div>

      <div class="tgsec">Call in a foe</div>
      <div class="chips">${foes}</div>

      ${playerRows(showTraining)}

      <div class="row">
        <button class="btn" data-act="${live ? 't-resume' : 't-start'}">${live ? 'Resume' : 'Enter the ring'}</button>
        <button class="btn ghost" data-act="t-leave">Leave</button>
      </div>
    </div>`);
}

function showPause() {
  if (world.dungeon) { showDungeonPause(); return; }
  // In the Training Ground the pause screen is the loadout panel.
  if (world.training) { showTraining(); return; }
  if (world.tutorial) { showTutorialPause(); return; }
  if (world.overworld || world.owBoss) { showWildsPause(); return; }

  state = 'paused';
  showOverlay(`
    <div class="panel">
      <div class="eyebrow">chamber ${world.depth}</div>
      <h2>Paused</h2>
      <div class="row">
        <button class="btn" data-act="resume">Resume</button>
        <button class="btn ghost" data-act="mute">${audio.muted ? 'Unmute' : 'Mute'}</button>
        <button class="btn ghost" data-act="music">Music: ${audio.music ? 'On' : 'Off'}</button>
        <button class="btn ghost" data-act="abandon">Abandon Run</button>
      </div>
      ${playerRows(showPause)}
      ${spellSlotsRow()}
      ${musicVolumeRow()}
      ${fullscreenRow()}
      ${dualSenseRow()}
    </div>`);
  bindSlotDrag();
}

// --- rearranging spell slots (pause menu) ----------------------------------------
//
// Three ways to do it, as modern games do on each device:
//   - DRAG a spell onto another slot to swap them (touch and mouse alike);
//   - TAP / CLICK one slot, then another (and a pad's confirm button does the
//     same, through the menu focus);
//   - on PC, HOVER a spell and press 1-4 to send it straight to that key, the
//     way action bars are bound in MMOs.

let slotSel = -1;          // a slot picked up by tap or click, waiting for its partner
let slotHover = -1;
let slotDragged = false;   // a drag just ended: ignore the click that follows it

const SLOT_KEYS = { key: ['1', '2', '3', '4'], pad: ['R1+\u2715', 'R1+\u25cb', 'R1+\u25a1', 'R1+\u25b3'] };

function spellSlotsRow() {
  const p = world.player;
  if (!p || !p.spells.length) return '';
  const keys = input.padMode ? SLOT_KEYS.pad : SLOT_KEYS.key;
  const slots = [];
  for (let i = 0; i < SPELL_SLOTS; i++) {
    const sp = spellById(p.spells[i]);
    if (!sp) {
      slots.push(`<div class="sslot empty"><span class="sk">${keys[i]}</span><span class="sg">\u2727</span><span class="sn">empty</span></div>`);
      continue;
    }
    const c = spellColor(sp);
    slots.push(`
      <div class="sslot ${slotSel === i ? 'sel' : ''}" data-act="slot-pick" data-idx="${i}" data-slot="${i}" style="--c:${c}">
        <span class="sk">${keys[i]}</span>
        <span class="sg" style="color:${c}">${sp.glyph}</span>
        <span class="sn">${sp.name}</span>
        <span class="sl">${'\u25cf'.repeat(spellLevel(p, sp.id))}</span>
      </div>`);
  }
  const hint = input.touchMode
    ? 'Drag a spell onto another slot to swap them, or tap one and then the other.'
    : input.padMode
      ? 'Select a spell, then the slot to swap it with.'
      : 'Drag a spell onto another slot, click two to swap, or hover one and press 1\u20134.';
  return `
    <div class="tgsec">Spell slots</div>
    <div class="slots" id="spellslots">${slots.join('')}</div>
    <p class="sub" style="margin-top:6px">${hint}</p>`;
}

function swapSlots(i, j) {
  const p = world.player;
  if (!p || i === j || i < 0 || j < 0 || i >= p.spells.length || j >= p.spells.length) return;
  [p.spells[i], p.spells[j]] = [p.spells[j], p.spells[i]];
  sfx.pickup();
}

function pickSlot(i) {
  if (slotDragged) { slotDragged = false; return; }
  if (slotSel < 0) slotSel = i;
  else { swapSlots(slotSel, i); slotSel = -1; }
  showPause();
}

/** Drag and drop on the slots, with a ghost that follows the finger or mouse. */
function bindSlotDrag() {
  const row = document.getElementById('spellslots');
  if (!row) return;
  let drag = null;
  row.querySelectorAll('.sslot[data-slot]').forEach((el) => {
    el.addEventListener('pointerenter', () => { slotHover = Number(el.dataset.slot); });
    el.addEventListener('pointerleave', () => { if (slotHover === Number(el.dataset.slot)) slotHover = -1; });
    el.addEventListener('pointerdown', (ev) => {
      const from = Number(el.dataset.slot);
      const r = el.getBoundingClientRect();
      drag = { from, id: ev.pointerId, x0: ev.clientX, y0: ev.clientY, moved: false, ghost: null, dx: ev.clientX - r.left, dy: ev.clientY - r.top, el };
    });
  });
  const over = (x, y) => {
    const hit = document.elementFromPoint(x, y);
    const slot = hit && hit.closest && hit.closest('.sslot[data-slot]');
    return slot ? Number(slot.dataset.slot) : -1;
  };
  const move = (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) > 8) {
      drag.moved = true;
      drag.ghost = drag.el.cloneNode(true);
      drag.ghost.classList.add('ghost');
      drag.ghost.style.width = `${drag.el.offsetWidth}px`;
      document.body.appendChild(drag.ghost);
      drag.el.classList.add('lifted');
    }
    if (!drag.moved) return;
    drag.ghost.style.left = `${ev.clientX - drag.dx}px`;
    drag.ghost.style.top = `${ev.clientY - drag.dy}px`;
    const to = over(ev.clientX, ev.clientY);
    row.querySelectorAll('.sslot').forEach((s) => s.classList.toggle('over', Number(s.dataset.slot) === to && to !== drag.from));
  };
  const end = (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    if (!d.moved) return;                         // a tap: the click handler picks it
    if (d.ghost) d.ghost.remove();
    slotDragged = true;
    slotSel = -1;
    const to = over(ev.clientX, ev.clientY);
    if (to >= 0 && to !== d.from) swapSlots(d.from, to);
    showPause();
    setTimeout(() => { slotDragged = false; }, 0);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);
}

// On PC: hover a spell in the pause menu and press 1-4 to send it to that key.
window.addEventListener('keydown', (ev) => {
  if (state !== 'paused' || slotHover < 0 || !overlayVisible()) return;
  const k = Number(ev.key);
  if (k >= 1 && k <= SPELL_SLOTS) {
    swapSlots(slotHover, k - 1);
    slotHover = -1;
    slotSel = -1;
    showPause();
  }
});

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

  if (act !== 'slot-pick') slotSel = -1;
  switch (act) {
    case 'title': pendingTrial = null; showTitle(); break;
    case 'version': location.href = el.dataset.href; break;
    case 'version-here': break;
    case 'update':
      el.disabled = true;
      hardRefresh((msg) => { el.textContent = msg; });
      break;
    case 'trials': showTrials(); break;
    // Like Begin Run, the Training Ground and the tutorial go fullscreen on a phone.
    case 'training': phoneFullscreen(); showTraining(); break;
    case 't-start': phoneFullscreen(); startTraining(); break;
    case 'wilds': showWildsIntro(); break;
    case 'dungeon-demo': showDungeonList(); break;
    case 'd-pick': phoneFullscreen(); startDungeonDemo(DUNGEON_LIST[idx]); break;
    case 'music-room': showMusicRoom(); break;
    case 'wardrobe': showWardrobe(charBack || showTitle); break;
    case 'w-tab': ward.tab = el.dataset.v; wardRefresh(); break;
    case 'w-piece': wardSet({ [el.dataset.slot]: el.dataset.v }); break;
    case 'w-dye': wardSet({ [el.dataset.slot]: el.dataset.v }); break;
    case 'w-preset': save.outfit = null; wardSet({ ...DEFAULT_OUTFIT, ...OUTFIT_PRESETS[idx].o }); break;
    case 'w-random': save.outfit = null; wardSet(randomOutfit()); break;
    case 'w-reset': save.outfit = null; wardSet({ ...DEFAULT_OUTFIT }); break;
    case 'w-rot': ward.turn = false; ward.oct = (ward.oct + Number(el.dataset.v) + 8) % 8; wardRefresh(); break;
    case 'w-turn': ward.turn = !ward.turn; ward.t0 = performance.now() - ward.oct * 1400; wardRefresh(); break;
    case 'w-walk': ward.walk = !ward.walk; wardRefresh(); break;
    case 'w-done': { const back = wardBack || showTitle; closeWardrobe(); wardBack = null; back(); break; }
    case 'mr-play': playInRoom(REGION_THEMES[idx], false); showMusicRoom(); break;
    case 'mr-boss': playInRoom(BOSS_PIECES[idx].theme, true); showMusicRoom(); break;
    case 'mr-calm': case 'mr-fight':
      musicRoom.fight = act === 'mr-fight';
      if (musicRoom.theme && !musicRoom.boss) setMusicIntensity(musicRoom.fight ? 1 : 0);
      showMusicRoom();
      break;
    case 'mr-stop': musicRoom.theme = null; setAmbientTheme(null); setBossTheme(null); showMusicRoom(); break;
    case 'mr-musicon': ensureAudio(); setMusicEnabled(true); save.musicOn = true; writeSave(); showMusicRoom(); break;
    case 'mr-back': showTitle(); break;
    case 'mr-lead': {
      const th = musicRoom && musicRoom.theme;
      if (!th || musicRoom.boss) break;
      save.musicLead = { ...(save.musicLead || {}) };
      if (el.dataset.v) save.musicLead[th.id] = el.dataset.v;
      else delete save.musicLead[th.id];
      writeSave();
      setLeadChoice(save.musicLead);
      showMusicRoom();
      break;
    }
    case 'd-enter': {
      const d = pendingDungeon;
      pendingDungeon = null;
      hideOverlay(); resetInput();
      if (d) enterDungeonFromWilds(d);
      state = 'playing';
      break;
    }
    case 'd-leave': exitDungeon('left'); break;
    case 'd-again': startDungeonDemo(); break;
    case 'spd-down':
    case 'spd-up':
    case 'spd-def': {
      const cur = save.moveSpeed ?? SPEED_DEFAULT;
      const next = act === 'spd-def' ? SPEED_DEFAULT : cur + (act === 'spd-up' ? SPEED_STEP : -SPEED_STEP);
      save.moveSpeed = Math.round(clamp(next, SPEED_MIN, SPEED_MAX) * 100) / 100;
      writeSave();
      (charBack || showTitle)();
      break;
    }
    case 'fps':
      save.showFps = !save.showFps;
      writeSave();
      el.classList.toggle('on', save.showFps);
      el.textContent = save.showFps ? 'On' : 'Off';
      break;
    case 'w-ghost': setGhost(!wildsGhost); showWildsPause(); break;
    case 'char': {
      save.character = el.dataset.v;
      writeSave();
      // Redraw whichever screen the choice was made on.
      (charBack || showTitle)();
      break;
    }
    case 'w-start':
    case 'w-new': if (loadJourney()) showWildsIntro(true); else { phoneFullscreen(); startWilds(false); } break;
    case 'w-new-yes': phoneFullscreen(); startWilds(false); break;
    case 'w-continue': phoneFullscreen(); startWilds(true); break;
    case 'w-cinders': world.gold += 1000; saveWilds(); showWildsPause(); break;
    case 'l-level': showLevelUp(); break;
    case 'l-travel': showTravel(); break;
    case 'l-attune': showAttune(); break;
    case 'l-weapon': showLampWeapon(); break;
    case 'l-back': showLampMenu(curLamp); break;
    case 'l-leave': wildsResume(); break;
    case 'l-go': travelTo(el.dataset.id); break;
    case 'l-buy': {
      const a = ATTRS.find((q) => q.id === el.dataset.id);
      if (a && buyLevel(a.id, world.player, wildsBase)) {
        world.wildsLevel = totalLevel();
        sfx.boon();
        saveWilds();
        showLevelUp(`${a.name} rises to ${journey.levels[a.id]}.`);
      }
      break;
    }
    case 'l-spell': {
      const p = world.player;
      const id = el.dataset.id;
      let msg = '';
      if (p.spells.includes(id)) p.spells = p.spells.filter((s) => s !== id);
      else if (p.spells.length < p.spellSlots) p.spells.push(id);
      else msg = 'Every slot is full: take a spell out first.';
      saveWilds();
      showAttune(msg);
      break;
    }
    case 'l-weapon-pick': swapWeapon(idx); saveWilds(); showLampWeapon(); break;
    case 'w-resume': wildsResume(); break;
    case 'w-away': wildsStepAway(); break;
    case 'w-weapon': swapWeapon(idx); showWildsPause(); break;
    case 'w-lair': {
      const L = lairById(el.dataset.id);
      if (!L) { wildsResume(); break; }
      const info = BOSS_INFO[L.boss];
      hideOverlay();
      resetInput();
      state = 'playing';
      saveWilds();
      // Tier 0 lands: 0.5; tier 1: 1.2; tier 2: 1.9; tier 3: 2.6 (a Boss Trial is 1). The Warden: 2.8.
      enterGateFight(L.boss, info ? info.title : L.boss, { lair: L.id, boss: L.boss, tier: L.needs ? 2.8 : 0.5 + L.region.tier * 0.7 });
      break;
    }
    case 'w-leave': leaveWilds(); break;
    case 'w-map': showWildsMap(); break;
    case 'map-in': if (wildsMap) wildsMap.zoomIn(); break;
    case 'map-out': if (wildsMap) wildsMap.zoomOut(); break;
    case 'map-you': if (wildsMap) wildsMap.centre(); break;
    case 'map-close': closeWildsMap(); break;
    case 'map-travel': {
      const id = el.dataset.id;
      if (inCombat()) break;
      closeWildsMap();
      travelTo(id);
      break;
    }
    case 'map-fog':
      toggleMapFog();
      el.textContent = save.mapNoFog ? 'Fog: off' : 'Fog: on';
      break;
    case 'w-fog': toggleMapFog(); showWildsPause(); break;
    case 't-resume': state = 'playing'; hideOverlay(); resetInput(); break;
    case 't-leave': world.training = false; clearEntities(); showTitle(); break;
    case 't-weapon': trainingSetWeapon(idx); showTraining(); break;
    case 't-spell': trainingToggleSpell(el.dataset.id); showTraining(); break;
    case 't-level': {
      const id = el.dataset.id;
      training.levels[id] = ((training.levels[id] || 1) % SPELL_MAX_LEVEL) + 1;
      if (world.training) trainingLoadout();
      showTraining();
      break;
    }
    case 't-toggle': {
      const opt = el.dataset.opt;
      training[opt] = !training[opt];
      if (world.training && world.player) world.player.invincible = training.invincible;
      if (opt === 'dummyRespawn' && !training.dummyRespawn) training.respawns.length = 0;
      showTraining();
      break;
    }
    case 't-spawn': {
      if (!world.training) startTraining();
      const b = arenaBounds();
      const sx = b.l + (b.r - b.l) * (0.3 + Math.random() * 0.4);
      const sy = b.t + (b.b - b.t) * (0.25 + Math.random() * 0.3);
      if (el.dataset.type === 'dummy') trainingDummy(sx, sy);
      else spawnEnemyDebug(el.dataset.type, sx, sy);
      state = 'playing';
      hideOverlay();
      resetInput();
      break;
    }
    case 't-clear': trainingClear(); showTraining(); break;
    case 't-hp': {
      training.dummyHp = Number(el.dataset.hp) || 0;
      // Dummies already in the ring are set up again with the new health;
      // nothing else in the ring is touched.
      const spots = world.enemies.filter((e) => e.type === 'dummy' && !e.dead).map((e) => [e.x, e.y]);
      world.enemies = world.enemies.filter((e) => e.type !== 'dummy');
      training.respawns.length = 0;
      for (const [x, y] of spots) trainingDummy(x, y);
      showTraining();
      break;
    }
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
      if (!save.tutorialSeen) showTutorialOffer();
      else showBiomeSelect();
      break;
    }
    case 'tutorial': phoneFullscreen(); startTutorial(); break;
    case 'tut-no': save.tutorialSeen = true; writeSave(); showBiomeSelect(); break;
    case 'tut-resume': state = 'playing'; hideOverlay(); resetInput(); break;
    case 'tut-skip': showTutorialEnd(false); break;
    case 'tut-run': world.tutorial = false; clearEntities(); showBiomeSelect(); break;
    case 'tut-title': world.tutorial = false; clearEntities(); showTitle(); break;
    case 'biome-pick': {
      pendingBiome = BIOMES[idx];
      save.biome = pendingBiome.id;
      writeSave();
      showWeaponSelect();
      break;
    }
    case 'pick': {
      if (isTouchDevice() && !isFullscreen()) enterFullscreen();
      // The landscape lock resolves a moment after fullscreen, and never on
      // iOS. If the phone is still upright, hold the run until it's turned.
      if (isPortraitTouch()) {
        pendingWeapon = WEAPONS[idx];
        checkOrientation();
        break;
      }
      beginRun(WEAPONS[idx]);
      break;
    }
    case 'boon': {
      applyBoon(world.player, pendingBoons[idx]);
      sfx.boon();
      advanceRoom();
      break;
    }
    case 'spell-pick': {
      const sp = pendingSpells[idx];
      if (!sp) break;
      const got = learnSpell(world.player, sp.id);
      sfx.boon();
      if (got === 'stored') { showSpellReplace(sp.id); break; }
      showToast(got === 'levelled' ? `${sp.name.toUpperCase()} \u00b7 LEVEL ${spellLevel(world.player, sp.id)}` : `${sp.name.toUpperCase()} LEARNED`,
        got === 'levelled' ? (world.player.spells.includes(sp.id) ? 'Stronger now' : 'Stronger, in your spell book') : 'Equipped in a free slot', 2.6);
      finishSpell();
      break;
    }
    case 'spell-replace': {
      // Swap it in: the spell it replaces goes back into the book, at its own level.
      const p = world.player;
      learnSpell(p, pendingSpellId, idx);
      const sp = spellById(pendingSpellId);
      showToast(`${sp.name.toUpperCase()} EQUIPPED`, 'The spell it replaced is still in your book', 2.6);
      sfx.boon();
      finishSpell();
      break;
    }
    case 'spell-keep': {
      const sp = spellById(pendingSpellId);
      showToast(`${sp.name.toUpperCase()} LEARNED`, world.overworld || world.dungeon ? 'In your spell book: equip it at any Ashlamp' : 'In your spell book', 2.8);
      finishSpell();
      break;
    }
    case 'spell-back': showSpellSelect(true); break;
    case 'spell-skip': finishSpell(); break;
    case 'slot-pick': pickSlot(idx); break;
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
  if (state === 'map' && (k === 'escape' || k === 'tab' || k === 'p')) { closeWildsMap(); return; }
  if (k === 'g' && state === 'playing' && world.overworld) setGhost(!wildsGhost);
  if (k === 'escape' || k === 'p') {
    if (state === 'playing') showPause();
    else if (state === 'paused') { state = 'playing'; hideOverlay(); resetInput(); }
  }
});

// --- leaving and coming back (a phone switching apps) -------------------------
//
// Going away: the run pauses itself (so nothing hits you while you are gone,
// and the Resume tap on return is the gesture that wakes the sound up), every
// held touch and key is let go (their "up" events never arrive), and the
// audio stops.
// Coming back: the clock restarts from now, the screen is re-measured, the
// sound resumes, and the frame loop is restarted if the browser dropped it.
// If the phone threw the canvases away while we were hidden, every cached
// drawing is rebuilt.

function onLeave() {
  if (world.overworld || world.owBoss) saveWilds();
  resetInput();
  if (state === 'playing') showPause();
  suspendAudio();
}

function onReturn() {
  last = performance.now();
  accumulator = 0;
  resetInput();
  resize();
  if (audioStarted) resumeAudio();
  // The loop should still be running; if the browser dropped it, start it again.
  setTimeout(() => {
    if (document.visibilityState === 'visible' && performance.now() - lastFrameAt > 250) {
      cancelAnimationFrame(rafId);
      last = performance.now();
      rafId = requestAnimationFrame(frame);
    }
  }, 300);
}

function rebuildGraphics() {
  gfx.epoch++;
  clearSpriteCache();
  clearTextureCache();
  resize();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') onLeave();
  else onReturn();
});
// Android can freeze or restore the page without a visibility change.
window.addEventListener('pagehide', onLeave);
window.addEventListener('pageshow', (ev) => { if (ev.persisted) onReturn(); });
document.addEventListener('freeze', onLeave);
document.addEventListener('resume', onReturn);
// The phone reclaimed the GPU: redraw everything cached once it is back.
canvas.addEventListener('contextrestored', rebuildGraphics);

function ensureAudio() {
  if (audioStarted) return;
  audioStarted = true;
  initAudio();
  if (save.muted) toggleMute();
  setMusicVolume(typeof save.musicVolume === 'number' ? save.musicVolume : 0.7);
  setMusicEnabled(save.musicOn !== false);
  setLeadChoice(save.musicLead);
}

// Any first interaction unlocks WebAudio (mobile requires a gesture).
window.addEventListener('pointerdown', ensureAudio, { once: true });
// Which gesture unlocks audio differs across mobile browsers; keep retrying
// on every kind until the context is actually running.
for (const type of ['touchend', 'pointerup', 'click', 'keydown']) {
  window.addEventListener(type, () => { if (audioStarted) unlockAudio(); }, { passive: true });
}
window.addEventListener('keydown', ensureAudio, { once: true });

// --- boot ------------------------------------------------------------------

loadSave();
setOutfit(save.outfit);
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
  map: () => {
    if (state === 'map') closeWildsMap();
    else if (state === 'playing' && world.overworld) showWildsMap();
  },
});
showTitle();
requestAnimationFrame((t) => { last = t; rafId = requestAnimationFrame(frame); });

// Debug handle: lets the sim be driven without rAF, for smoke tests and for
// poking at balance from the browser console.
window.ashfall = {
  world, view, arena, input, fx,
  // Version 4 spells: learn/level one, open a Spell door screen, cast by id.
  SPELLS,
  learn: (id, times = 1) => { for (let k = 0; k < times; k++) learnSpell(world.player, id); return world.player.spells; },
  spellDoor: () => showSpellSelect(),
  cast: (id) => tryCast(world.player, id),
  WEAPONS,
  get state() { return state; },
  set state(s) { state = s; },
  tick, render, startRun, advanceRoom, showTitle,
  trial: (type, weaponIdx = 0) => startTrial(WEAPONS[weaponIdx], type),
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
