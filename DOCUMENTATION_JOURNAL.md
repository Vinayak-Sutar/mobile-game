# Ashfall — Documentation Journal

> **Purpose.** A single document that lets a fresh collaborator — human or LLM —
> understand the entire project without the conversation history that produced
> it. Written to be read top to bottom once, then used as a reference.
>
> **Last updated:** 2026-09-10, after commit `0fb271c` (bow first, landscape-only,
> music volume). If code and this document disagree, **the code wins** — then
> fix this document.

---

## 0. TL;DR (read this if nothing else)

- **What:** *Ashfall*, a Hades-style top-down action roguelike for mobile
  browsers (and desktop), aimed at eventually shipping on the Google Play Store.
- **Stack:** vanilla JavaScript ES modules + Canvas 2D + WebAudio. **No engine,
  no framework, no build step to run, no image/audio asset files** — all art is
  drawn procedurally and all sound is synthesised at runtime.
- **Size:** ~8,800 lines of code: 26 JS modules in `src/` plus `index.html`,
  `serve.py`, `build.mjs`, `sw.js`, `manifest.json`. Entry point `src/game.js`.
- **Run locally:** `python serve.py` → open `http://localhost:8000` (PC) or the
  printed LAN URL on a phone on the same Wi-Fi. Landscape only.
- **Repo:** `https://github.com/Vinayak-Sutar/mobile-game` (branch `main`).
  Intended to be served by GitHub Pages at
  `https://vinayak-sutar.github.io/mobile-game/`.
- **Owner:** Vinayak Sutar. Solo developer, Windows 11 PC, tests on an Android
  phone. Has "a lot of additions" planned — this journal exists so the next
  session can pick up cleanly.
- **Debug handle:** `window.ashfall` in the browser console exposes the world,
  `tick()`, `startRun()`, `spawn()` and more (§7.1). All automated testing goes
  through it.
- **Most important rule for testing:** the in-app preview browser is usually
  *hidden*, which **freezes `requestAnimationFrame`**. Drive the game by calling
  `ashfall.tick(1/60)` in a loop, never by waiting for frames (§7.3).

---

## 1. Decisions already made (do not relitigate without the owner)

| Decision | Detail | Why |
| --- | --- | --- |
| Stay on the web stack | Vanilla JS + Canvas 2D. Earlier advice recommended Unity; the owner chose to stay. | Fast iteration; the game is fun as-is. |
| Future packaging | **Capacitor** for Play Store (AdMob via `@capacitor-community/admob`), **Tauri** for desktop. | Wraps this exact codebase. Trade-off: weaker ad mediation than Unity LevelPlay. |
| **Landscape only** | Portrait support was built, then removed at the owner's request ("looks very bad"). | See §5.9 for how orientation is enforced. |
| **Bow is the default weapon** | Heart-Seeker is first in `WEAPONS`; first card = default. | Owner's preference. |
| **Fullscreen on start** | Pressing *Begin Run* on a touch device goes fullscreen + locks landscape. | Owner's preference. |
| Music on by default | Plays only during a run; volume slider on title + pause screens. | Owner couldn't hear it on mobile; then disliked it playing on menus. |
| Biomes are cosmetic | No gameplay differences between the 4 biomes. | Balance was measured against fixed numbers; biome choice must not undo it. |
| Push to GitHub after changes | Owner asked for the first push to test via Pages; fixes have been pushed to `main` since. | Owner tests on the Pages URL. |

---

## 2. Rules that must not be broken (hard-won lessons)

Each of these was a real bug. Violating one reintroduces it.

1. **All damage goes through `src/combat.js`** (`dealDamage`, `damagePlayer`,
   `explode`, `killEnemy`). Boons, crits, statuses, feedback and the damage log
   all live there. Never subtract HP anywhere else.
2. **`damagePlayer(amount, sx, sy, source)` must be given a `source`** (enemy
   type). It feeds `world.damageLog`, which drives balance work and the death
   screen's "Most of the damage came from…" line.
3. **Music "enabled" ≠ music "active".** `audio.music` is the player's setting;
   `audio.active` is "the game wants music right now". Music plays only when
   both are true and the page is visible. The single rule lives at the **end of
   `tick()`**: `setMusicActive(state === 'playing' || state === 'boon')`.
   Conflating these once made music start on the title screen, keep playing
   while paused, and restart when returning to a tab.
4. **The game-rule checks must live in `tick()`, not `frame()`** when they need to
   be testable, because tests pump `tick()` while `frame()` (rAF) is frozen.
5. **`input.touchMode` is only set when a finger touches the game *canvas*.**
   Menus are a DOM overlay covering the canvas, so on menus it is usually false.
   To ask "is this a phone?", use `isTouchDevice()` (`matchMedia('(pointer:
   coarse)')`) in `game.js`. Using `touchMode` once meant fullscreen never
   triggered on phones.
6. **Weapon damage and the weapon arm are driven by the attack state machine,
   not keyframes.** The player's `armR` bone angle comes from `weaponArmAngle()`
   in `rigs.js`, and the weapon is drawn at the hand bone. Keyframing it would
   let the blade disagree with the hitbox.
7. **Enemy animation clips are chosen by the enemy's own state** (`clipFor(e)` in
   `enemy-rigs.js`). Telegraph poses (brute fists up, wretch jaws open) must last
   exactly as long as the matching state.
8. **The floor must stay dark.** Atmosphere belongs in the biome `fog` and
   ambient mote layers, not floor brightness. A bright floor (first Emberfall
   attempt, vein strength 1.5) makes entities unreadable.
9. **`OffscreenCanvas` has no `toDataURL`.** `texture.js`'s `makeCanvas` prefers
   OffscreenCanvas; anything converting to a data URL must blit to a regular
   `<canvas>` first (`biomeThumbnail`, `bake.js`'s `toCanvas`).
10. **Phone speakers can't reproduce much below ~250 Hz.** Anything that must be
    heard on a phone needs content above that. The original 55 Hz music was
    silent on phones.
11. **The final audio stage is a limiter.** Without it, full music volume plus
    combat peaked at +2 dBFS (clipping). Keep the limiter last in the chain.
12. **Grenade tap-throws track their target in flight.** Lead prediction was
    tried and whiffed completely: a wretch lunges at 560 u/s from standstill.
13. **WebHID (DualSense lightbar/triggers) requires a secure context.**
    `http://localhost` and HTTPS qualify; `http://192.168.x.x` does not, and
    `navigator.hid` simply doesn't exist there.
14. **Never commit `.certs/`.** `serve.py --https` writes a self-signed cert *and
    its private key* there. It is in `.gitignore`; check staged files before
    every commit.
15. **Don't hardcode the dev PC's LAN IP** in docs. It changes whenever the PC
    joins another network (it went from `192.168.221.236` to `10.20.79.236`).
16. **Validate with the bundler.** `npx esbuild src/game.js --bundle` catches
    import cycles and errors `node --check` misses (it caught a `const`
    reassignment that only crashed once a player held more than ~14 boons).

---

## 3. Repository map

```
index.html          Shell: canvas#game, div#overlay (DOM menus), div#rotate, all CSS
manifest.json       PWA manifest (display fullscreen, orientation landscape)
sw.js               Service worker, network-first cache "ashfall-v1"
icon.svg            App icon
serve.py            Dev server (LAN, no-cache, --https, asset-save endpoint)
build.mjs           Inlines an esbuild bundle into a single standalone HTML file
package.json        "type":"module"; scripts start/bundle/build; devDep esbuild
README.md           Player/developer-facing readme
DOCUMENTATION_JOURNAL.md   This file
assets/             Baked sprite sheets + textures (generated, reference only)
.nojekyll           So GitHub Pages serves files as-is
.gitignore          .certs/ dist/ *.zip .claude/ node_modules/ __pycache__/ *.log
src/
  game.js         Entry point: resize, frame loop, tick, run state machine, all menus, debug handle
  state.js        Shared mutable `world`, `view`, `arena`; resetWorld/clearEntities
  util.js         Math, easing, collision (circle-rect, arc, oriented rect), canvas helpers
  player.js       Player creation, movement, dash, attack state machine, drawPlayer
  weapons.js      WEAPONS data (bow first) + performStep() that spawns hitboxes/projectiles
  combat.js       dealDamage, damagePlayer, killEnemy, explode, healPlayer, statuses, damage log
  spawn.js        Factories: spawnProjectile, spawnHitbox, spawnPickup
  projectiles.js  Update/draw projectiles, melee hitboxes, pickups; shield deflection
  enemies.js      ENEMY_DEFS (7 types + warden boss AI), spawnEnemy, update/draw enemies
  enemy-rigs.js   Skeletons + clips for every enemy; state→clip mapping; drawEnemyRig
  rigs.js         Player skeleton + clips; updatePlayerAnim; drawPlayerRig
  anim.js         Keyframe skeletal animation engine (skeleton, clips, Animator, draw)
  rooms.js        Room generation, waves, doors, floor/obstacle/door drawing, BOSS_DEPTH
  boons.js        GODS, 17 BOONS, offerBoons, applyBoon
  grenade.js      GRENADE constants, tap/hold aiming, throw, flight, draw
  biomes.js       4 BIOMES (data) + ambient mote system
  texture.js      Procedural textures: biomeFloor, rockTexture, softDot, normalMap, caches
  fx.js           Particles, rings, slashes, damage text, trails, shake, hitstop, flash
  audio.js        WebAudio graph, synthesised SFX, music engine, volume, suspend/unlock
  input.js        Unified input: touch stick + buttons, keyboard, mouse, gamepad merge
  gamepad.js      Gamepad API polling, mapping, rumble, menu navigation, DualSense feedback
  dualsense.js    WebHID lightbar + adaptive triggers (optional; untested on hardware)
  fullscreen.js   Fullscreen, landscape lock, wake lock, service-worker registration
  ui.js           Canvas HUD, touch controls drawing, toast, DOM overlay helpers
  save.js         localStorage meta progression + settings
  bake.js         Render rigs/textures to PNG atlases (+JSON); saveAssets() to disk
```

### 3.1 Import rules

- `state.js` and `util.js` import nothing project-local (leaves).
- There are **no import cycles**. Known chains: `input → gamepad → dualsense`;
  `player → input, weapons, combat, rigs, grenade`; `enemies → combat, spawn,
  enemy-rigs`; `rooms → enemies, texture, biomes`; `ui → input, boons, enemies,
  rooms, audio, grenade, gamepad`; `game.js` imports everything.
- Adding an import? Rebuild with esbuild to confirm no cycle (§8.2).

---

## 4. Runtime architecture

### 4.1 Frame loop (`game.js`)

- `frame(now)` runs on `requestAnimationFrame`:
  1. If `view.cw/ch` differ from `window.innerWidth/Height`, call `resize()`
     (catches mobile browsers that resize without firing an event).
  2. `pollGamepad(overlayVisible())`.
  3. Fixed timestep: `STEP = 1/60`, `dt` clamped to 0.25 s, at most 5 ticks per
     frame.
  4. `render()`, then `updateDualSenseFeedback()`.
- `tick(dt)`:
  1. `updateInput(world.player)`.
  2. Touch pause button → `showPause()` if playing.
  3. If `playing`: during **hitstop** the sim freezes and fx update at 0.18×
     speed; otherwise update player, enemies, statuses, hitboxes, grenades,
     projectiles, pickups, room, fx; set music intensity; handle a chosen door;
     detect death → `dying`.
  4. If `dying`: keep animating (including `updatePlayer`, so the death clip
     plays) for 1.15 s, then `onDeath()`.
  5. `updateUi(dt)`, the **music rule** (§2 rule 3), `endFrameInput()`.

### 4.2 Game states (`state` in `game.js`)

`title` → `biome` → `weapon` → `playing` ⇄ `paused` / `boon` → `dying` → `dead`,
or → `victory`. Also `mirror` (meta shop) and `padcheck` (controller diagnostic).
Menus are DOM overlays built by `show*()` functions in `game.js`; clicks route
through one delegated `click` listener on `#overlay` keyed on `data-act`, plus an
`input` listener for the music volume slider.

### 4.3 View and arena (landscape only)

- Logical height is **600**; logical width = `600 × aspect`, clamped to
  **[820, 1320]** (if clamped, height adjusts instead). `view.scale =
  cssWidth / view.w`. Every entity is authored in these world units.
- Why so small a height: the whole room is always on screen with no camera; a
  taller logical view shrinks entities into unreadable dots on a phone
  (720 → 600 raised the player from ~17 px to ~22 px on screen).
- Arena = view inset by `mx 38`, `top 74`, `bottom 38`. On an 844×390 phone it
  is roughly 1222×488 world units.
- Touch controls are drawn over the arena's bottom-right (§5.4).

### 4.4 Render order (`render()`)

Floor (texture + vignette + biome fog + sigil + wall band) → ambient motes → fx
below (trails, rings) → obstacles → doors → grenade aim reticle → pickups →
enemies → player → projectiles → grenades → fx above (slashes, particles, damage
numbers) → boss intro text. Then, unshaken: HUD, touch controls, low-health
vignette, full-screen flash. Screen shake is a `translate` around the world pass.

### 4.5 `world` (from `state.js`)

`player, enemies[], projectiles[], hitboxes[], grenades[], pickups[], room,
depth, loop, biome, gold, kills, runTime, damageLog{}, timeScale, paused`.

---

## 5. Systems reference

### 5.1 Player (`player.js`, `rigs.js`)

| Stat | Value |
| --- | --- |
| Max HP | 80 (+10 per Vitality level) |
| Move speed | 268 u/s (34% while attacking, 55% while charging the bow) |
| Dash | 0.17 s at 920 u/s; **2 charges**, one recharges every 0.75 s |
| Dash invulnerability | whole dash + 0.09 s; dashing **cancels attack recovery** |
| Hit invulnerability | 0.8 s after taking damage |
| Crit | 5% chance, 2× damage |
| Auto-aim | nearest enemy within 420 units when no explicit aim input |

Attack state machine: `windup → active → recover`, durations divided by
`attackSpeed`. `performStep()` fires on entering `active`. Combo steps advance if
the next attack comes within `comboWindow` after recovery. The bow instead
charges while held and fires on release (a tap fires a weak shot). Lunges add
velocity. Shield steps set `blockTime`/`blockAngle`.

### 5.2 Weapons (`weapons.js`) — order is menu order, first is default

| # | Weapon | Light attack | Special (cooldown) |
| --- | --- | --- | --- |
| 0 | **Heart-Seeker** (bow, `#b98cff`) | Hold to charge 0.5 s: 12→40 dmg, 760→1180 u/s, pierces 1 at >50% charge, 2 at >85% | Arrow Volley: 7 arrows × 15 dmg, pierce 1 (4.8 s) |
| 1 | Stygian Blade (`#ff9a5a`) | 3-hit arc combo 17/19/32; 3rd is a 360° spin | Rending Spin: 360°, r176, 44 dmg (4.5 s) |
| 2 | Eternal Spear (`#7ad6ff`) | 3 thrusts 21/23/38; 3rd lunges 460 | Hurled Spear: boomerang, 34 dmg, pierces all (3.6 s) |
| 3 | Shield of Chaos (`#ffd45e`) | 3 bashes 20/23/36 that **deflect enemy shots** (±1.1 rad cone; reflected shots deal 2× and home) | Thrown shield, 30 dmg, ricochets 5×, retargets (4.2 s) |

Note: the shield special's display name is "Bull Rush", but it is a thrown
ricochet shield — a naming mismatch, not a bug.

### 5.3 Grenades (`grenade.js`)

`GRENADE = { maxCharges 2, recharge 6.0 s, damage 60 (× damageMult), radius 115,
range 300, travel 0.45 s, fuse 0.30 s, holdThreshold 0.16 s }`.

- **Tap** (released before 0.16 s): target the nearest enemy in range; the
  grenade **follows that enemy** while airborne (still clamped to range).
- **Hold**: a reticle shows range ring, flight path and blast radius; the throw
  lands at a **fixed** point.
- Aim sources: mouse position (absolute) · drag from the BOMB touch button (78
  world units = full range) · Circle + right stick on a gamepad.
- Verified: a tap hits every enemy type for 60; a placed throw hit a cluster of
  three for 60 each.

### 5.4 Input (`input.js`, `gamepad.js`)

`input` is recomposed every tick from three sources — `srcHeld.key`,
`srcHeld.touch` and `pad` — so a release on one source can't be masked by
another. Press *edges* are consumed exactly once even when several ticks run per
frame.

| Action | Keyboard / mouse | Touch | Gamepad (standard mapping) |
| --- | --- | --- | --- |
| Move | WASD / arrows | Floating stick, left 52% of screen | Left stick (dz 0.22), D-pad |
| Aim | Mouse | Auto-aim | **Right stick** (dz 0.30; true twin-stick) |
| Attack | Click, J, E | ATK | R2, Square |
| Special | Right-click, K, Q, Shift | SPEC | L2, Triangle |
| Dash | Space | DASH | R1, L1, Cross |
| Grenade | G (hold to aim) | BOMB (drag to aim) | Circle (+ right stick) |
| Pause | Esc, P | **II** top-right | Options |
| Mute | M | — | Create |
| Fullscreen | F | Automatic on Begin Run | — |

Touch button centres (world units, `w,h` = view size): ATK `(w-104, h-100)` r52 ·
DASH `(w-212, h-142)` r40 · SPEC `(w-124, h-224)` r38 · BOMB `(w-232, h-256)` r36 ·
pause `(w-32, 32)` r20. The gold readout shifts left on touch to make room.

Gamepad extras: menus are navigable (stick/D-pad moves a gold focus ring,
Cross confirms); rumble is derived from jumps in `fx.trauma`, so every impact
that shakes the screen also rumbles. **Controller Check** on the title screen
shows secure-context status, Gamepad API, WebHID, mapping and live axes/buttons.

### 5.5 Enemies (`enemies.js`, `enemy-rigs.js`)

Base stats before depth scaling. Damage table: wretch 8, slinger 8, brute 15,
charger 13, bomber 15, splitter 8, spitter 8, warden 22.

| Type | r | HP | Speed | Cost | From depth | Behaviour and telegraph |
| --- | --- | --- | --- | --- | --- | --- |
| Wretch | 15 | 30 | 175 | 2 | 1 | Within 145: 0.34 s wind-up (jaws gape), then a 560 u/s lunge |
| Slinger | 15 | 42 | 140 | 3 | 2 | Keeps 230–330 away, strafes; 0.42 s aim, then a 3-shot burst |
| Bomber | 16 | 26 | 155 | 3 | 2 | Within 78: 0.82 s fuse (swells), explodes r100; also explodes on death |
| Charger | 20 | 78 | 105 | 5 | 3 | 0.62 s aim (spark lane), charges 690 u/s until a wall, then stunned 1.05 s |
| Splitter | 23 | 68 | 118 | 4 | 3 | Contact damage (1.05 s cooldown); splits into 2 children (22% HP, 1.35× speed, 45% dmg) |
| Brute | 27 | 140 | 88 | 6 | 3 | Within 140: 0.78 s wind-up (fists overhead), slam r128 |
| Spitter | 21 | 60 | 0 | 4 | 4 | Stationary; 0.5 s wind-up, 9-bullet radial ring every 2.4 s |

**Warden of Ash** (boss, chamber 8): r46, base HP 1250 × scale 1.45 (≈1813),
damage scale 1.05. Phases at 62% and 30% HP; a phase change is a 1.5 s
invulnerable roar ending in an r300 blast. Actions: slam (r220), volley (radial
waves), aim→charge (880 u/s, 2 charges in phase 3), stun, summon (wretches;
bombers in phase 3), spiral (phase 3). Eight animation clips including the roar.

Scaling: `enemyScale = 1 + (depth-1)×0.19 + loop×0.75` multiplies HP;
`dmgScale = min(2.0, 0.9 + scale×0.26)`. **Elites** (depth 3 and 6): ×1.22
radius, ×1.9 HP, ×1.15 damage, ×1.08 speed, gold ring. Enemies spawn through a
0.75 s portal telegraph, at least 250 units from the player. `e.mvx/e.mvy` hold
each enemy's real per-frame velocity. No pathfinding: they steer straight at the
player and slide along obstacles.

### 5.6 Rooms and the run (`rooms.js`)

- `BOSS_DEPTH = 8`. Elite room when `depth > 2 && depth % 3 === 0`.
- Waves: 1 (depth ≤2), 2 (≤5), 3 otherwise. Budget per wave =
  `round((4 + depth×2.8 + loop×8) × (0.75 + w×0.35))`, spent on random enemies
  whose `minDepth ≤ depth + loop×3`.
- On clear: two doors on the top wall (60% boon / 20% heal / 20% gold; forced
  heal if HP < 45%; duplicate non-boon rewards become boon). Boss room: one exit.
- Door rewards: **boon** → pick 1 of 3; **heal** → 40% max HP; **gold** →
  `18 + depth×9`.
- Kill drops: 1–3 coins (elite 7, boss 22); heal pickup 14% (boss 100%) worth 16
  HP; magnet radius 170.
- After the boss: *Victory* screen with **Press Deeper** (loop +1, harder) or a
  new run.

### 5.7 Boons (`boons.js`) — 17 across 5 gods, stackable

| God | Boons (max level) |
| --- | --- |
| Pyros (flame) | Ember Strike +22% dmg (6) · Cinder Trail burn (4) · Immolation kills explode (4, rare) |
| Astra (storm) | Charged Edge +18% attack speed (5) · Arc Chain chains to +1 foe (3, rare) · Static Dash dash damage (4) |
| Gaia (life) | Verdant Vigor +18 max HP (6) · Bloodroot lifesteal (4) · Stone Skin −18% damage taken (3, rare) |
| Zephyr (wind) | Swift Step +14% speed (5) · Second Wind +1 dash (2, rare) · Gale Force knockback + dmg (4) · Slipstream slow on hit (3) |
| Nyx (shadow) | Keen Eye +18% crit (5) · Deep Cut crit multiplier (4, rare) · Umbral Barb seeking bolts (4) · Retribution blast when hit (3, rare) |

Offers show 3 distinct boons, weighted (common 4, rare 2, already owned +2 so
builds converge). Boons mutate `player.stats`; their side effects run inside
`dealDamage`.

### 5.8 Meta progression and save (`save.js`)

- localStorage key **`ashfall.save.v1`**. Defaults: `darkness 0, upgrades
  {vitality, might, alacrity, fortune}, best {depth, kills, gold}, runs, wins,
  muted false, musicOn true, musicVolume 0.7, biome 'ember'`.
- Gold is banked as **darkness** win or lose (× Fortune multiplier).
- **Mirror of Night** upgrades: Vitality +10 HP (5 levels, cost 30+25×lv) ·
  Might +6% dmg (5, 35+30×lv) · Alacrity +1 dash (2, 120+150×lv) · Fortune +20%
  gold (3, 60+60×lv).
- Migration note: an old `music: false` key exists in early saves and is
  **ignored**. `musicOn` replaced it so that everyone who played before
  music-on-by-default still gets music.

### 5.9 Orientation, fullscreen, PWA (`fullscreen.js`, `game.js`)

- **Landscape only.** Menus work with the phone upright; the fight never runs
  upright.
- *Begin Run* (`data-act="biome"`) and picking a weapon (`"pick"`) call
  `enterFullscreen()` on touch devices: Fullscreen API → `screen.orientation.lock
  ('landscape')` → Wake Lock. On Android the screen turns by itself.
- Fallback where lock is unsupported (every iPhone browser): `checkOrientation()`
  shows `#rotate` ("Turn your phone sideways to play") when the device is touch,
  upright, and a run is pending or in progress. Picking a weapon while upright
  stores `pendingWeapon`; the run starts on rotation. Tilting upright mid-run
  shows the prompt and pauses the game (verified: no damage taken meanwhile).
- iPhone Safari has no Fullscreen API for pages; "Add to Home Screen" gives the
  app-like experience.
- PWA: `manifest.json` (fullscreen, landscape) + `sw.js` (network-first, cache
  `ashfall-v1`). Registered only over http(s). GitHub Pages plus caching can delay
  updates by up to ~10 minutes.

### 5.10 Audio (`audio.js`)

**Graph:** SFX voices → `master` (0.5) → `compressor` (−20 dB, knee 18, 4:1,
4 ms / 200 ms) → `makeup` (×1.5) → `limiter` (−2.5 dB, knee 0, 20:1, 1 ms) →
`outTap` analyser → speakers. Music voices → `musicBus` → `master`.

**Music volume:** bus gain = `v^1.6 × 2.4` (`v` is the 0..1 slider; default 0.7 →
≈1.36; the old fixed gain was 0.6). Measured at the output, the default is
≈9–12 dB louder than the first version and 100% is ≈13 dB louder. The heaviest
measured combat at 100% peaks at −0.3 dBFS thanks to the limiter (+2.1 dBFS
without it). Changing volume calls `previewMusic()` (a short phrase), because
music is stopped while paused.

**Music engine:** 104 BPM; a 16th-note lookahead scheduler (`setInterval` 25 ms,
0.12 s lookahead) against the AudioContext clock. D minor i–VI–VII–v (Dm, B♭,
C, Am). Layers: pad, filtered-sawtooth bass (+octave double), arpeggio (the part
you hear on phones; 290–600 Hz), kick (with a click transient), hats, and a snare
only for the boss. **Intensity** (set every tick): 0 = room cleared (no drums),
1 = combat, 2 = boss (16th-note saw arpeggio, 4-on-the-floor, snare). Measured:
42–78% of scheduled notes are above 250 Hz (the first version: 0%).

**Lifecycle rules:** see §2 rule 3. The whole AudioContext is suspended when the
page is hidden. `unlockAudio()` retries `ctx.resume()` on touchend, pointerup,
click and keydown, because mobile browsers differ on which gesture unlocks audio.
Music cuts the instant you die.

**SFX** (`sfx.*`): swing, hit, crit, hurt, dash, shoot, arrow, explode,
telegraph, spawn, pickup, heal, boon, door, death, bossRoar, bossDown, ui, block.
All synthesised from oscillators and one shared noise buffer.

**Debug:** `ashfall.outputLevel()` → `{ peakDb, rmsDb }` of the final output;
`musicRunning()`, `audioContextState()` in the module.

### 5.11 Animation (`anim.js`, `rigs.js`, `enemy-rigs.js`)

- Skeleton = bones in parent-first order (asserted). Shapes: `capsule`, `circle`,
  `blob` (ellipse), `cloak` (tapered quad), `none`.
- Clip = per-bone keyframe tracks `{t, angle, x, y, sx, sy, ease}`; the easing on
  the destination key governs each segment; angles take the shortest path.
- `Animator`: `play(clip, {fade, speed, restart})` with cross-fade;
  `offset()`/`set()` layer procedural motion after sampling.
- `drawSkeleton(ctx, world, {tint, alpha, palette, grow})`. `grow` fattens every
  bone; used for a **dark outline pass** drawn first, which is what makes
  characters readable against the floor.
- Player: 10 bones (cloak×2, legs, torso, arms, head, visor), clips idle / run /
  dash / hurt / death. Drawn at `RIG_SCALE 1.18` (a visual slightly larger than
  the 17 px hitbox). Body faces the aim; strafing leans the torso.
- Enemies: bone colours are *roles* (`main`, `dark`, `light`, `accent`) resolved
  per instance, so each type keeps its palette. The rig scales by `e.r /
  rig.ref`, so elites and splitter children work automatically.

### 5.12 Visuals: textures, biomes, fx (`texture.js`, `biomes.js`, `fx.js`)

- `biomeFloor()` is **one parameterised generator**: hue/sat/light plus optional
  `veins` (ridged noise, added additively so seams glow), `blotch` (moss
  patches), `speck` (glitter/stars). Tileable fBm value noise; 256 px tiles with
  4 slab seams; cached per biome and depth band (deeper chambers darken slightly).
- **Biomes** (`BIOMES` data, cosmetic only): Emberfall (basalt + lava seams,
  rising embers), The Sunken Grove (moss, spores), Frostwake (ice fractures,
  snow), The Umbral Deep (void starfield, violet dust). Each supplies `floor`,
  `rock`, `rockCap {color, radius}`, `fog`, `accent`, `wallTint`, `ambient`.
  Adding a biome = adding one object. The select screen previews each with a
  real floor tile.
- Ambient motes: a fixed pool per biome that wraps at the arena edges (constant
  cost; separate from the combat particle budget).
- `fx.js`: trauma-based shake (magnitude ∝ trauma²), hitstop, full-screen flash,
  particles (cap 420; shapes circle/square/spark/shard), rings, slash arcs,
  damage numbers, dash trails. `glow()` fakes glow without `shadowBlur`, which is
  slow on mobile.

### 5.13 Asset baking (`bake.js`)

Renders rigs frame by frame into PNG atlases plus JSON sidecars (+X facing only;
the top-down sprite rotates at draw time). Enemy rigs are fitted to 96 px cells
using the computed `rigExtent`. `ashfall.saveAssets()` POSTs everything to
`serve.py`, which writes `assets/` (13 PNGs + JSON). **Nothing at runtime loads
these** — the live game draws vectors. They exist to hand to another engine or
to swap real art in against a known format.

### 5.14 DualSense (`dualsense.js`) — optional, unverified

WebHID output reports: USB report `0x02` (47-byte payload); Bluetooth report
`0x31` with a flag byte, the same payload, and a CRC32. Lightbar follows the
weapon colour, flashes red on hit, pulses below 35% HP. Adaptive triggers: R2
resistance per weapon (bow: draw-then-release), L2 goes slack while the special
is on cooldown. **Written against documentation only; no controller has ever
been connected.** `ashfall.probeDualSense()` cycles the lightbar to check.

---

## 6. Balance (measured, not guessed)

Method: a scripted bot plays with `world.damageLog` recording damage by source.
The first pass found elite rooms (3, 6) spiking because elite multipliers
compounded on a steep ramp; the brute (slam r150 in a ~490-tall arena), splitter
contact chip, and early bombers dominated.

| Depth | Damage per 20 s — before | After |
| --- | --- | --- |
| 3 (elite) | 83 | 24 |
| 5 | 64 | 31 |
| 6 (elite) | 98 | 29 |
| 7 | 62 | 35 |

After: 12 full bot runs → 0 wins, 12 deaths, average chamber 5.7 (range 3–8).

**Caveats:** the bot flails rather than dodging, so this measures *relative*
danger well and absolute difficulty poorly. The bow looks weakest in bot runs,
but the bot taps instead of charging, which undersells it. **Grenades and the
bow-as-default were added after this pass and have not been re-measured.**

---

## 7. Testing and verification playbook

### 7.1 Debug handle (`window.ashfall`)

`world, view, arena, input, fx, WEAPONS, state (get/set), tick, render,
startRun, advanceRoom, showTitle, spawn(type, x?, y?, opts?), run(steps), pad,
dualsense, probeDualSense, rumble, pollGamepad, bakeSpriteSheet, bakeTextures,
exportAll, exportAsDataURLs, canvasToDataURL, saveAssets, outputLevel,
setMusicVolume, audio, toggleFullscreen, screenState, PLAYER_SKELETON,
PLAYER_CLIPS, resolvePose, drawSkeleton, ctx`.

Modules can also be imported directly in the console:
`await import('/src/audio.js')`.

### 7.2 Standard regression (run after every change)

```js
const A = window.ashfall, errors = [];
const key = (t, k) => window.dispatchEvent(new KeyboardEvent(t, { key: k, bubbles: true }));
function drive(n, label) {
  let held = 'd'; key('keydown', held);
  for (let i = 0; i < n; i++) {
    if (i % 13 === 0) key('keydown', 'j'); if (i % 13 === 4) key('keyup', 'j');
    if (i % 43 === 0) { key('keydown', ' '); key('keyup', ' '); }
    if (i % 79 === 0) { key('keydown', 'k'); key('keyup', 'k'); }
    if (i % 97 === 0) { key('keydown', 'g'); key('keyup', 'g'); }
    try { A.tick(1/60); A.render(); } catch (e) { errors.push({ label, i, msg: e.message }); }
  }
  key('keyup', held); key('keyup', 'j');
}
const TYPES = ['wretch','slinger','brute','charger','bomber','splitter','spitter'];
for (const w of A.WEAPONS) {
  A.startRun(w);
  const p = A.world.player; p.stats.maxHp = 99999; p.hp = 99999;
  for (let d = 1; d <= 7; d++) {
    TYPES.forEach(t => A.spawn(t)); drive(90, `${w.id}:${d}`);
    A.world.enemies.length = 0; A.world.room.waveIndex = A.world.room.waves.length;
    drive(60, 'clear');
    const door = A.world.room.doors[0];
    if (door) { p.x = door.x; p.y = door.y; drive(4, 'door'); }
    if (A.state === 'boon') { const c = document.querySelector('#overlay [data-act="boon"]'); c ? c.click() : A.advanceRoom(); }
  }
  drive(160, 'boss');
  const b = A.world.enemies.find(e => e.boss); if (b) { b.hp = 1; drive(120, 'kill'); }
}
// then the death path: startRun, maxHp = hp = 10, tick until A.state === 'dead'
errors; // expect []
```

A "boss not dead" result in bot runs is usually a bot artefact (it misses the
invulnerable phase windows). Verify boss death directly before calling it a bug.

### 7.3 Quirks of the in-app preview browser

- **It is usually hidden, so `requestAnimationFrame` delivers 0 frames.** Always
  pump `A.tick(1/60)`. Anything that lives only in `frame()` will not run in
  tests.
- `A.tick()` calls `updateInput()`, which **overwrites** `input.move` etc. Drive
  input with real events, not by writing fields.
- Touch: stub `canvas.setPointerCapture = () => {}` first (synthetic pointer IDs
  can't be captured), then dispatch `PointerEvent` with `pointerType: 'touch'`
  on the canvas at `worldCoord × view.scale`.
- Phone emulation: `resize_window` with width < 768 emulates a touch device
  (`pointer: coarse`). Because rAF is frozen, also
  `window.dispatchEvent(new Event('resize'))` after changing the viewport.
- Visibility: `Object.defineProperty(document, 'visibilityState', { configurable:
  true, get: () => 'hidden' })`, then dispatch `visibilitychange`.
- Gamepad: override `navigator.getGamepads` with a fake `{ axes, buttons:
  [{pressed, value}], vibrationActuator: { playEffect } }`. `new GamepadEvent`
  rejects fakes, so rely on the polling fallback; call `A.pollGamepad(false)`
  then `A.tick()`.
- **The console error buffer persists across navigations.** A stale error can
  show up after its fix; confirm by calling the code path directly.
- It refuses self-signed certificates outright (no interstitial), so
  `serve.py --https` can't be tested there.
- File downloads aren't reachable; use `ashfall.saveAssets()` to write baked
  files to disk through `serve.py`.
- The AudioContext *does* run while hidden, so audio can be measured.

### 7.4 Measurement techniques that worked

- **Balance:** `world.damageLog` + bot runs (per depth, per source); full-run
  depth distribution.
- **Music frequency content:** patch `AudioContext.prototype.createOscillator` to
  tag `osc.frequency`, then patch `AudioParam.prototype.setValueAtTime` to
  record values for tagged params; count the share above 250 Hz.
- **Loudness and clipping:** sample `ashfall.outputLevel()` every ~40 ms; pace
  combat in real time (3 ticks per 50 ms) so SFX don't stack unrealistically.
- **Visual inspection:** render rigs at 4× onto an overlaid `<canvas>` (the game
  loop repaints the main canvas), or bake a sheet and `Read` the PNG.

---

## 8. Development workflow

### 8.1 Environment

Windows 11; Git Bash and PowerShell. Python 3.10.5 and Node 20.19.3 are
installed; `gh` is not. The LAN IP changes by network, so read what `serve.py`
prints. `.claude/launch.json` defines preview servers `ashfall` (port 8000) and
`ashfall-https` (8443).

### 8.2 Commands

```bash
python serve.py                 # http://localhost:8000 + LAN URL
python serve.py --https         # https on :8443, self-signed (.certs/, gitignored)
npx --yes esbuild@0.25.0 src/game.js --bundle --format=iife --outfile=/dev/null   # static check
npm run build                   # dist/ashfall.html single-file build (+ dist/upload/, HOW-TO-RUN.txt)
node --check src/<file>.js      # syntax only (package.json has "type":"module")
```

Share zips (`Ashfall.zip`, `Ashfall-web.zip`, `Ashfall-assets.zip`) are made with
PowerShell `Compress-Archive`; they are gitignored.

### 8.3 Editing technique

- Large multi-line Python patch scripts inside Bash heredocs once failed
  ("unexpected EOF"). Write patch scripts to the session scratchpad as `.py` files
  and run them. Each patch asserts that its search string exists, so a stale
  assumption fails loudly instead of silently editing nothing.
- After edits: `node --check` each touched file, esbuild bundle, then the
  regression (§7.2).

### 8.4 Git and GitHub

- Remote `origin` = `https://github.com/Vinayak-Sutar/mobile-game.git`, branch
  `main`. Push works non-interactively through Git Credential Manager (cached).
  Git identity is set globally on the PC.
- Before committing: `git diff --cached --name-only | grep -iE "\.certs|\.pem|\.zip|dist/"`
  must print nothing.
- Commit messages explain *why* and end with:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- GitHub Pages: Settings → Pages → Deploy from a branch → `main` / `(root)`.
  Relative paths throughout, so it works under `/mobile-game/`. HTTPS there
  makes fullscreen, wake lock, PWA install and WebHID work without workarounds.

History: `f7c94f2` initial prototype → `d964581` README LAN-IP fix → `e51fbf2`
music only during runs → `0fb271c` bow first, landscape-only, music volume.

---

## 9. Changelog (chronological, condensed)

1. **Strategy research.** Hybrid-casual market (retention via a meta layer,
   rewarded ads plus IAP, Play Console's 12-tester × 14-day closed test). Unity
   was recommended at the time; later superseded by the decision to stay on web.
2. **Prototype v1.** 4 weapons, 7 enemies plus a boss, boons, rooms and doors,
   Mirror meta, fx juice, synthesised SFX, touch controls, LAN server. Fixed:
   boss HP 3,350 → 1,813; canvas stuck at 320×240 when booted at 0×0 (added the
   per-frame size check); logical height 720 → 600 for on-phone readability.
3. **Sharing.** esbuild single-file build and zips. The bundler caught a
   `const` reassignment in the boon-icon wrap (crashed past ~14 boons).
4. **3D stack brief** (Unity 6 URP, Blender, Mixamo, asset packs, mobile budgets).
   Not pursued.
5. **Controller support.** Gamepad API twin-stick, rumble from trauma, menu
   navigation; DualSense over WebHID. Then diagnosed "controller not working":
   WebHID needs a secure context; added Controller Check and `serve.py --https`.
6. **Art systems.** Skeletal animation engine, player rig, procedural textures,
   sprite baker. Fixed: rig read as a crab (rebalanced masses, outline pass);
   floor too busy; death animation never played (the `dying` state didn't call
   `updatePlayer`); baked sprites missing the outline.
7. **Enemy rigs** for all 8 types; fullscreen; PWA. Fixed: inverted enemy-sheet
   scale (now fitted from computed rig extent).
8. **Music drone #1.** Music never stopped and played in hidden tabs → suspend on
   hide, default off, runs only.
9. **Balance pass** (§6) and the "Most of the damage came from…" death line.
10. **Four biomes.** Parameterised floor generator. Fixed: OffscreenCanvas has no
    `toDataURL`.
11. **Grenades.** Fixed: lead-predicted taps whiffed on lunging wretches → tap
    throws now track their target.
12. **Mobile music inaudible.** Three causes: default off, no touch pause button
    to reach the toggle, 55 Hz sine inaudible on phone speakers → new music
    engine, II pause button, `musicOn` save migration, compressor, unlock retries.
13. **Portrait support + GitHub push.** Fixed: fullscreen never triggered on
    phones (the `touchMode` check). README stopped hardcoding the LAN IP.
14. **Music drone #2.** Setting vs "should play now" conflated → split into
    `music` / `active`; the rule moved into `tick()`.
15. **Bow first; portrait removed** → landscape-only with fullscreen + lock and a
    rotate fallback; **music volume** slider (+9–12 dB louder by default),
    make-up gain, limiter (+2.1 dBFS clipping → −0.3 dBFS).

---

## 10. Known issues, limits and unverified areas

- **DualSense lightbar/triggers:** never tested on hardware. USB is more likely
  to work than Bluetooth (CRC32 path).
- **Fullscreen and landscape lock** can't be tested in the preview browser;
  verified logically only. iPhone: no page fullscreen, no lock → rotate prompt.
- **Balance** is bot-measured only; not re-measured since grenades and
  bow-as-default. Needs human playtesting.
- **Enemies have no pathfinding**; they can look dumb around obstacles.
- **Art is procedural** — readable at prototype scale, not a shippable art
  direction. Real art needs an artist, asset packs or image generation; the
  baked-atlas format (`assets/*.json`) is ready for it.
- **Doors** are placed when a room clears, in the arena as it was then; a
  mid-room resize can leave them slightly off.
- **Update lag on Pages:** service worker plus HTTP caching can show an old build
  for up to ~10 minutes.
- **README drift:** it says `dist/ashfall.html` is "~160 KB"; it is ~256 KB now.
- **Shield special naming:** "Bull Rush" is actually a thrown ricochet shield.
- No ads, IAP or analytics yet.

---

## 11. Ideas discussed but not built (candidate next steps)

- Per-biome mechanics (e.g. Frostwake slows, Emberfall applies burn) — needs a
  balance re-measure.
- A sound-effects volume slider alongside the music one.
- Re-run the balance measurement with grenades and the bow default; human
  playtest.
- Enemy pathfinding around obstacles.
- Real character art, dropped in against the baked atlas format.
- Packaging: Capacitor → Play Store (rewarded ads first, capped interstitials,
  remove-ads IAP), Tauri → desktop.
- The owner has "a lot of additions" planned — ask for the list first.

---

## 12. Glossary

| Term | Meaning |
| --- | --- |
| Chamber / depth | A room; the run is chambers 1–8, chamber 8 is the boss |
| Loop | Continuing past the boss via Press Deeper; everything scales up |
| Elite | A stronger enemy variant with a gold ring (chambers 3 and 6) |
| Boon | A stacking run upgrade from one of 5 gods, chosen at boon doors |
| Darkness | Meta currency: gold banked at the end of every run |
| Mirror of Night | Meta shop for permanent upgrades |
| Telegraph | The readable wind-up pose or marker before an enemy attack |
| Hitstop | A brief freeze of the simulation on impact, for feel |
| Trauma | 0..1 screen-shake energy; also drives gamepad rumble |
| World units | Logical coordinates (600 tall); scaled to screen by `view.scale` |
| Intensity | Music level: 0 calm, 1 combat, 2 boss |
