// Ashfall, Version 6: the 3D demo's entry point.
//
// The plan of the whole version in one paragraph: Version 5's simulation is
// two-dimensional maths with no drawing in it, so this version imports the
// simulation and replaces only the picture. The frame is the same shape as
// Version 5's - a fixed-step tick that never touches the renderer, then a draw
// pass that never touches the simulation - and the simulation's (x, y) plane
// becomes the world's (x, z) with height on y.
//
// Milestone 1: the world, the camera and the character. You can walk the Ember
// Meadow, look around, roll, climb the ridge's stairs, drop off its edge and
// dash the pond's channel. Fighting, enemies and the weapons' visuals come next.

import * as THREE from '../vendor/three.module.js';
import { world, arena, tuning, resetWorld } from '../../v5/src/state.js';
import { clamp } from '../../v5/src/util.js';
import { fx, updateFx, clearFx } from '../../v5/src/fx.js';
import { input, endFrameInput } from '../../v5/src/input.js';
import { initGamepad, pollGamepad } from '../../v5/src/gamepad.js';
import { createPlayer, updatePlayer } from '../../v5/src/player.js';
import { WEAPONS } from '../../v5/src/weapons.js';
import { updateStatuses } from '../../v5/src/combat.js';
import { updateProjectiles, updateHitboxes, updatePickups } from '../../v5/src/projectiles.js';
import { updateHazards } from '../../v5/src/hazards.js';
import { updateGrenades } from '../../v5/src/grenade.js';
import { updateSpellZones } from '../../v5/src/spells.js';
import { initAudio, sfx, audio, toggleMute, setMusicActive, setMusicIntensity, suspendAudio, resumeAudio } from '../../v5/src/audio.js';
import { initFullscreen, toggleFullscreen, registerServiceWorker } from '../../v5/src/fullscreen.js';
import { createStage } from './renderer.js';
import { createCameraRig } from './camera3d.js';
import { buildMeadow } from './levels3d.js';
import { buildTerrain, buildWater, updateWater } from './terrain3d.js';
import { buildProps, swayTrees } from './props3d.js';
import { createPlayerActor } from './actors3d.js';
import {
  initInput3d, updateInput3d, releaseLook, requestLook, state3d, keys3d, want, endFrame3d, heldKeys,
} from './input3d.js';
import { createMover, updateMove, MOVE } from './move3d.js';
import { createCombat, updateCombat3d, chargeFrac } from './combat3d.js';
import {
  buildHud, hideOverlay, hudToast, hudVisible, overlayVisible, setFps, setHint, showFps, showOverlay, updateHud,
} from './hud3d.js';

const canvas = document.getElementById('game');
const STEP = 1 / 60;

const stage = createStage(canvas);
const rig = createCameraRig(stage.camera);

let level = null;
let actor = null;
let mover = createMover();
let combat = createCombat();
let state = 'title';          // title | playing | paused
let accumulator = 0;
let last = performance.now();
let weaponIndex = 1;          // the blade: the plainest weapon to learn with
let fpsSmooth = 60;
let audioReady = false;

// --- menus ------------------------------------------------------------------

function versionRow() {
  return `
    <div class="versions">
      <button class="ver" data-act="version" data-href="../v4/">Version 4<small>spells · pure action</small></button>
      <button class="ver" data-act="version" data-href="../v5/">Version 5<small>2D · the full game</small></button>
      <button class="ver on" data-act="version-here" aria-current="true">Version 6<small>3D · WebGL demo</small></button>
    </div>`;
}

function showTitle() {
  state = 'title';
  hudVisible(false);
  releaseLook();
  const cards = WEAPONS.map((w, i) => `
    <div class="card ${i === weaponIndex ? 'rare' : ''}" data-act="weapon" data-idx="${i}" style="border-color:${w.color}88">
      <div class="glyph" style="color:${w.color}">${w.glyph}</div>
      <div class="name" style="color:${w.color}">${w.name}</div>
      <div class="tag" style="color:${w.color}">${w.specialName}</div>
    </div>`).join('');
  showOverlay(`
    <div class="panel">
      <div class="eyebrow">an experiment · desktop</div>
      <h1>Ashfall 3D</h1>
      ${versionRow()}
      <p class="sub">The same game, seen from behind the shoulder. This is a demo of the world and the
      movement: walk the Ember Meadow, climb the ridge, dash the channel. Fighting arrives next.</p>
      <div class="cards">${cards}</div>
      <div class="row">
        <button class="btn" data-act="start">Enter the Meadow</button>
        <button class="btn ghost" data-act="fs">Fullscreen</button>
        <button class="btn ghost" data-act="mute">${audio.muted ? 'Unmute' : 'Mute'}</button>
      </div>
      <div class="keys" style="margin-top:14px">
        <b>Mouse</b> looks (click to capture, <kbd>Esc</kbd> releases) · <b>WASD</b> moves ·
        <kbd>Shift</kbd> sprint, tap it to dodge roll · <kbd>Space</kbd> jump ·
        <kbd>Wheel</kbd> zoom · <kbd>F</kbd> fullscreen · <kbd>G</kbd> stats
      </div>
    </div>`);
}

function showPause() {
  state = 'paused';
  releaseLook();
  showOverlay(`
    <div class="panel">
      <div class="eyebrow">${level ? level.name : 'the wilds'}</div>
      <h2>Paused</h2>
      <div class="row">
        <button class="btn" data-act="resume">Resume</button>
        <button class="btn ghost" data-act="fs">Fullscreen</button>
        <button class="btn ghost" data-act="mute">${audio.muted ? 'Unmute' : 'Mute'}</button>
        <button class="btn ghost" data-act="title">Leave</button>
      </div>
      <p class="sub" style="margin-top:14px">Move speed ${Math.round(tuning.speed * 100)}% ·
      camera distance ${Math.round(rig.distWanted)}</p>
    </div>`);
}

function resume() {
  state = 'playing';
  hideOverlay();
  hudVisible(true);
  requestLook();
}

document.getElementById('overlay').addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  ensureAudio();
  sfx.ui();
  switch (el.dataset.act) {
    case 'version': location.href = el.dataset.href; break;
    case 'version-here': break;
    case 'weapon': weaponIndex = Number(el.dataset.idx); showTitle(); break;
    case 'start': startDemo(); break;
    case 'resume': resume(); break;
    case 'title': showTitle(); break;
    case 'fs': toggleFullscreen(); break;
    case 'mute':
      toggleMute();
      if (state === 'paused') showPause(); else showTitle();
      break;
    default: break;
  }
});

function ensureAudio() {
  if (audioReady) return;
  audioReady = true;
  initAudio();
}

// --- the demo ---------------------------------------------------------------

function startDemo() {
  ensureAudio();
  resetWorld();
  clearFx();
  stage.clearLevel();

  level = buildMeadow();
  // The simulation's playfield is the whole level; its collision rectangles are
  // the level's obstacles, exactly as in 2D.
  arena.x = 0; arena.y = 0; arena.w = level.W; arena.h = level.H;
  world.room = level.room;
  world.training = true;               // nothing in v5's run logic should fire

  buildTerrain(stage.groups.ground, level);
  buildWater(stage.groups.ground, level);
  buildProps(stage.groups.props, level);

  world.player = createPlayer(WEAPONS[weaponIndex], {});
  world.player.x = level.spawn.x;
  world.player.y = level.spawn.y;
  mover = createMover();
  mover.face = Math.PI / 2;
  combat = createCombat();
  actor = createPlayerActor(stage.groups.actors);
  actor.setWeapon(WEAPONS[weaponIndex], stage.groups.fx);

  rig.yaw = 0;                        // the camera sits south, looking up the meadow
  rig.pitch = -0.2;
  rig.distWanted = 190;

  buildHud();
  setHint('WASD move · shift sprint (tap to roll) · space jump · mouse look');
  hudToast('THE EMBER MEADOW', 'Walk north to the ridge', 3.4);
  resume();
}

/** Where the camera is pointing at the ground: used for placed throws. */
const rayOrigin = new THREE.Vector3();
const rayDir = new THREE.Vector3();
function reticle() {
  if (!level) return null;
  stage.camera.getWorldPosition(rayOrigin);
  stage.camera.getWorldDirection(rayDir);
  // March down the view ray until it crosses the ground.
  let t = 0;
  for (let i = 0; i < 24; i++) {
    t += 34;
    const x = rayOrigin.x + rayDir.x * t;
    const y = rayOrigin.y + rayDir.y * t;
    const z = rayOrigin.z + rayDir.z * t;
    if (y <= level.heights.at(x, z)) return { x, y: z };
  }
  return null;
}

/**
 * Does anything solid stand between the player and where the camera wants to
 * be? Every obstacle is an axis-aligned rectangle, so this is a few cheap tests
 * rather than a ray cast. Returns the distance to pull in to, or 0.
 */
function cameraBlocked(pivot, yaw, pitch, dist) {
  if (!level) return 0;
  const cp = Math.cos(pitch);
  const dx = Math.sin(yaw) * cp, dy = -Math.sin(pitch), dz = Math.cos(yaw) * cp;
  const step = 16;
  for (let t = step; t < dist; t += step) {
    const x = pivot.x + dx * t, y = pivot.y + dy * t, z = pivot.z + dz * t;
    // Below the ground, or inside a tall obstacle: stop here.
    if (y < level.heights.at(x, z) + 8) return t - step;
    for (const o of level.obstacles) {
      if (o.low || o.kind === 'trunk') continue;        // water and thin trunks don't block the view
      if (x > o.x && x < o.x + o.w && z > o.y && z < o.y + o.h) {
        const topY = o.kind === 'rock' ? level.heights.at(x, z) + Math.max(o.w, o.h) * 0.7 : level.heights.TOP + 8;
        if (y < topY) return t - step;
      }
    }
  }
  return 0;
}

// --- the frame --------------------------------------------------------------

function tick(dt) {
  updateInput3d(world.player, reticle);
  // The camera writes a raw direction; the mover turns it into the eased,
  // sprinting, jumping thing the simulation then walks with.
  if (state === 'playing' && world.player && level) {
    updateMove(mover, world.player, dt, want, keys3d, level.heights, world.runTime);
    // The charged blow and the jumping plunge live in V6's own layer; they
    // read the buttons before the simulation sees them.
    updateCombat3d(combat, world.player, dt, mover, {
      light: input.attack, heavy: state3d.aiming,
    });
  }

  if (state === 'playing' && input.pausePressed) {
    input.pausePressed = false;
    showPause();
  }

  if (state === 'playing') {
    if (fx.hitstop > 0) {
      fx.hitstop -= dt;
      updateFx(dt * 0.18);
    } else {
      world.runTime += dt;
      updatePlayer(world.player, dt);
      updateStatuses(dt);
      updateHitboxes(dt);
      updateGrenades(dt);
      updateSpellZones(dt);
      updateProjectiles(dt);
      updateHazards(dt);
      updatePickups(dt);
      updateFx(dt);
      setMusicIntensity(0);
    }
    updateHud(world.player, dt);
  } else {
    updateFx(dt * 0.6);
  }

  setMusicActive(state === 'playing');
  endFrameInput();
  endFrame3d();
}

function draw(dt) {
  const t = world.runTime;
  if (actor && world.player && level) {
    actor.setWeapon(world.player.weapon, stage.groups.fx);
    actor.update(world.player, STEP, level.heights, mover, {
      charging: combat.charging,
      chargeFrac: chargeFrac(combat),
      plunging: combat.plunging,
    });
  }

  if (level && world.player) {
    const p = world.player;
    const focus = { x: p.x, y: level.heights.at(p.x, p.y) + (p.z || 0), z: p.y };
    rig.update(dt, focus, cameraBlocked);
    stage.followSun(p.x, p.y);
    updateWater(stage.groups.ground, t);
    swayTrees(stage.groups.props, t, focus);
  }
  stage.render();

  const info = stage.info();
  setFps(`${fpsSmooth.toFixed(0)} fps · ${info.calls} calls · ${(info.tris / 1000).toFixed(0)}k tris\n`
    + (world.player
      ? `x ${world.player.x.toFixed(0)}  y ${world.player.y.toFixed(0)}`
      + `  h ${level ? level.heights.at(world.player.x, world.player.y).toFixed(0) : 0}`
      + `  z ${(world.player.z || 0).toFixed(0)}${mover.grounded ? '' : ' (air)'}${mover.sprinting ? ' sprint' : ''}`
      : ''));
}

function frame(now) {
  requestAnimationFrame(frame);
  pollGamepad(overlayVisible());

  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  fpsSmooth += (1 / Math.max(dt, 0.001) - fpsSmooth) * 0.08;

  accumulator += dt;
  let guard = 0;
  while (accumulator >= STEP && guard++ < 5) {
    accumulator -= STEP;
    tick(STEP);
  }
  draw(dt);
}

// --- boot -------------------------------------------------------------------

initInput3d(canvas, rig, {
  onUnlock: () => { if (state === 'playing') showPause(); },
  onKey: (k) => {
    if (k === 'f') toggleFullscreen();
    if (k === 'm') { ensureAudio(); toggleMute(); }
    if (k === 'g') { showFps(!document.getElementById('fps').classList.contains('on')); }
  },
});
initGamepad();
initFullscreen({ onChange: () => { if (overlayVisible() && state === 'title') showTitle(); } });
registerServiceWorker();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    suspendAudio();
    if (state === 'playing') showPause();
  } else {
    resumeAudio();
    last = performance.now();
  }
});

showFps(true);
showTitle();
requestAnimationFrame(frame);

// The console handle, the same bargain Version 5 makes: drive the simulation by
// hand rather than waiting for frames.
window.ashfall3d = {
  THREE, world, fx, input, stage, rig, state3d,
  level: () => level,
  tick: (dt = STEP) => tick(dt),
  run: (n = 60) => { for (let i = 0; i < n; i++) tick(STEP); },
  tp: (x, y) => { world.player.x = x; world.player.y = y; },
  speed: (v) => { tuning.speed = clamp(v, 0.3, 2); },
  mover: () => mover,
  combat: () => combat,
  actor: () => actor,
  // Run one draw pass by hand. The preview browser freezes requestAnimationFrame
  // while its pane is hidden, so a test has to drive the picture itself.
  draw: (dt = STEP) => draw(dt),
  keys: keys3d,
  want,
  // Drive the keyboard by hand, for testing without a window in focus.
  hold: (k) => heldKeys.add(k),
  letGo: (k) => heldKeys.delete(k),
  MOVE,
  info: () => stage.info(),
};
