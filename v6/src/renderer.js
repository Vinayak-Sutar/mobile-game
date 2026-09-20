// The WebGL stage: renderer, scene, lights, groups and resizing.
//
// One scene, a handful of named groups, and a strict rule about them: static
// groups are built once when a level loads, dynamic groups are *synced* every
// frame (objects reused from a pool, never rebuilt). Draw order is the depth
// buffer's job, so the 2D game's below/above bracketing disappears - except for
// ground decals and the additive effects layer, which are drawn late without
// writing depth.
//
// `view` (Version 5's state.js) is still the shared idea of the screen: input
// and the HUD read it, so resize keeps it up to date exactly as the 2D game does.

import * as THREE from '../vendor/three.module.js';
import { view } from '../../v5/src/state.js';
import { SKY_LOW, SKY_TOP } from './palette.js';

export function createStage(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Filmic tone mapping: highlights roll off instead of blowing out to white,
  // which is most of the difference between "a WebGL demo" and "a game".
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  // Real sun shadows, softened. Desktop only, so this is affordable.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  // Distance haze in the colour of the horizon, so the land fades into the sky
  // rather than ending in a hard line against the dark.
  const HAZE = 0xc3c8cc;
  scene.fog = new THREE.Fog(HAZE, 900, 3000);
  renderer.setClearColor(HAZE, 1);

  // The sky: one big sphere seen from the inside, dark overhead and warm at the
  // horizon, coloured per vertex so it costs one draw call and no texture.
  const skyGeo = new THREE.SphereGeometry(3400, 16, 12);
  const skyPos = skyGeo.attributes.position;
  const skyCol = new Float32Array(skyPos.count * 3);
  const top = new THREE.Color(SKY_TOP), low = new THREE.Color(SKY_LOW), c = new THREE.Color();
  for (let i = 0; i < skyPos.count; i++) {
    const t = Math.max(0, Math.min(1, (skyPos.getY(i) / 3400) * 1.5 + 0.28));
    c.copy(low).lerp(top, t);
    skyCol[i * 3] = c.r; skyCol[i * 3 + 1] = c.g; skyCol[i * 3 + 2] = c.b;
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(skyCol, 3));
  const skyDome = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  }));
  skyDome.renderOrder = -10;
  scene.add(skyDome);

  const camera = new THREE.PerspectiveCamera(55, 1, 1, 6000);

  // The light is the 2D game's light: from the upper left, warm, with a cool
  // sky bounce underneath so shadowed faces go blue rather than black.
  const sun = new THREE.DirectionalLight(0xffe9cc, 3.1);
  sun.position.set(-260, 420, -160);
  sun.castShadow = true;
  // A tight shadow frustum that travels with the player: sharp shadows near
  // you, nothing wasted on the far side of the level.
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 1400;
  const span = 420;
  sun.shadow.camera.left = -span;
  sun.shadow.camera.right = span;
  sun.shadow.camera.top = span;
  sun.shadow.camera.bottom = -span;
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 1.2;
  scene.add(sun);
  scene.add(sun.target);
  const sky = new THREE.HemisphereLight(0xbcd2ff, 0x7a6a52, 1.5);
  scene.add(sky);

  // The sun itself, a warm disc in the sky dome.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(180, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff0cf, fog: false, transparent: true, opacity: 0.9 }),
  );
  disc.position.set(-1700, 1500, -1100);
  disc.lookAt(0, 0, 0);
  disc.renderOrder = -9;
  scene.add(disc);

  const groups = {
    ground: new THREE.Group(),    // terrain, water
    props: new THREE.Group(),     // cliffs, rocks, ruins, trees, doors
    grass: new THREE.Group(),
    decals: new THREE.Group(),    // shadows, hazard markers, spell zones
    actors: new THREE.Group(),    // player and enemies
    fx: new THREE.Group(),        // particles, rings, slashes (additive)
    overlay: new THREE.Group(),   // lock-on marker, vertical hazard cues
  };
  // Later groups draw over earlier ones where depth ties, which is what the
  // decal and effect layers want.
  let order = 0;
  for (const g of Object.values(groups)) { g.renderOrder = order++; scene.add(g); }

  const stage = {
    renderer, scene, camera, groups, sun, sky,
    /** Everything a level puts in the world, cleared when the level changes. */
    clearLevel() {
      // The actors and the effects go too: starting a second time otherwise
      // leaves the old character standing in the meadow for ever.
      for (const key of ['ground', 'props', 'grass', 'decals', 'actors', 'fx', 'overlay']) {
        const g = groups[key];
        for (let i = g.children.length - 1; i >= 0; i--) {
          const child = g.children[i];
          g.remove(child);
          disposeTree(child);
        }
      }
    },
    resize() {
      const cw = Math.max(320, window.innerWidth);
      const ch = Math.max(240, window.innerHeight);
      // The 3D camera has its own field of view, so `view` is only about the
      // screen: input and the HUD use it, nothing about the world does.
      view.cw = cw;
      view.ch = ch;
      view.w = cw;
      view.h = ch;
      view.scale = 1;
      view.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      renderer.setPixelRatio(view.dpr);
      renderer.setSize(cw, ch, false);
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
    },
    /** Keep the sun's shadow box over the player. */
    followSun(x, z) {
      sun.target.position.set(x, 0, z);
      sun.position.set(x - 320, 520, z - 210);
      sun.target.updateMatrixWorld();
    },
    render() {
      renderer.render(scene, camera);
    },
    info() {
      const r = renderer.info.render;
      return { calls: r.calls, tris: r.triangles };
    },
  };

  stage.resize();
  window.addEventListener('resize', () => stage.resize());

  // A GPU can take its context away (a driver reset, a laptop switching cards).
  // Three rebuilds its own objects on restore; the log is so a player can say
  // what happened.
  canvas.addEventListener('webglcontextlost', (ev) => {
    ev.preventDefault();
    console.warn('[ashfall3d] WebGL context lost');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    console.warn('[ashfall3d] WebGL context restored');
  });

  return stage;
}

function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
  });
}
