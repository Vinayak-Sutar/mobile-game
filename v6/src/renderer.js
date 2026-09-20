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
  renderer.shadowMap.enabled = false;              // contact shadows are decals
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  // Distance haze in the colour of the horizon, so the land fades into the sky
  // rather than ending in a hard line against the dark.
  const HAZE = 0x6d6a72;
  scene.fog = new THREE.Fog(HAZE, 700, 2400);
  renderer.setClearColor(HAZE, 1);

  // The sky: one big sphere seen from the inside, dark overhead and warm at the
  // horizon, coloured per vertex so it costs one draw call and no texture.
  const skyGeo = new THREE.SphereGeometry(3400, 16, 12);
  const skyPos = skyGeo.attributes.position;
  const skyCol = new Float32Array(skyPos.count * 3);
  const top = new THREE.Color(SKY_TOP), low = new THREE.Color(SKY_LOW), c = new THREE.Color();
  for (let i = 0; i < skyPos.count; i++) {
    const t = Math.max(0, Math.min(1, (skyPos.getY(i) / 3400) * 1.6 + 0.35));
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
  const sun = new THREE.DirectionalLight(0xffe2b8, 2.05);
  sun.position.set(-260, 420, -160);
  scene.add(sun);
  const sky = new THREE.HemisphereLight(SKY_TOP, SKY_LOW, 0.85);
  scene.add(sky);

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
      for (const key of ['ground', 'props', 'grass', 'decals']) {
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
