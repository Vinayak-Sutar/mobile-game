# Ashfall — Documentation Journal

> **Purpose.** A single document that lets a fresh collaborator — human or LLM —
> understand the entire project without the conversation history that produced
> it. Written to be read top to bottom once, then used as a reference.
>
> **Last updated:** 2026-09-11, after commit `27ea3fb` (3 lives and the
> Version 1 / Version 2 split), which followed `e8f73d3` (boss battles). If
> code and this document disagree, **the code wins** — then fix this document.

---

## 0. TL;DR (read this if nothing else)

- **What:** *Ashfall*, a Hades-style top-down action roguelike for mobile
  browsers (and desktop), aimed at eventually shipping on the Google Play Store.
- **Stack:** vanilla JavaScript ES modules + Canvas 2D + WebAudio. **No engine,
  no framework, no build step to run, no image/audio asset files** — all art is
  drawn procedurally and all sound is synthesised at runtime.
- **Size:** Version 2 is ~11,250 lines in 30 JS modules in `src/`, plus
  `index.html`, `serve.py`, `build.mjs`, `sw.js`, `manifest.json`; entry point
  `src/game.js`. Version 1 (`v1/`) is a separate ~8,400 lines in 26 modules.
- **Run:** 15 chambers. Chambers 3/6/9/12 are four creature bosses (turtle,
  crocodile, gorilla, peacock) in a per-run shuffled order; 15 is the Warden
  of Ash. Bosses follow written "hard but fair" rules (§5.14). **3 lives** per
  run.
- **Four versions ship side by side**, each with its own save and cache, and
  a 4-button switch on every title screen:
  - The root (`index.html`, `src/`) is **Version 2**.
  - `v1/` is **Version 1**: a frozen copy of the 8-chamber game from commit
    `c12c2d1`, plus 3 lives (§5.15).
  - `v3/` is **Version 3**: elements, reactions, traps. An experiment the
    owner stepped back from (§13).
  - `v4/` is **Version 4**: Version 2 plus simple spells from Spell doors.
    **It is the current line of work (§14).**
- **Work with the owner one step at a time:** build one thing, push it, give
  them a phone link and a short test list, then stop and wait.
- **Run locally:** `python serve.py` → open `http://localhost:8000` (PC) or the
  printed LAN URL on a phone on the same Wi-Fi (Version 1 is at `/v1/`).
  Landscape only.
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
| **Boss every third chamber** | Two fights then a guardian; creature bosses shuffled per run, Warden always last at 15. | Owner: "after every two chambers", bosses inspired by gorilla, crocodile, peacock, turtle. |
| **3 lives** | Both versions. Dying with a spare life revives in place at full HP. | Owner: "Give three lives to the player." |
| **Keep Version 1 playable** | The pre-boss game lives on in `v1/` as a separate copy, switchable from the title screen. | Owner wanted the 15-chamber game as "Version 2" and the previous one as "Version 1", "as two different things". |
| **Bullet patterns: rare, hard, fair** | One dense barrage per boss on a long cooldown; always a way through; always followed by an EXPOSED punish window. | Owner loves weaving through projectiles but "don't make it appear every time… people should be able to avoid those projectiles, and then get an opening to punish". |

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
    esbuild does *not* catch undefined identifiers; run the eslint one-liner
    in §8.2 for that.
17. **Never splice `world.projectiles` from outside `updateProjectiles`.** A boss
    can die from an arrow *inside* the projectile loop, and its death wipes
    bullets. `clearBullets()` therefore sets `pr.cleared = true`; the loop
    removes flagged shots silently. Splicing there would shift the loop index.
18. **Hazards and boss attacks damage only through `damagePlayer`** (rule 1),
    so dash i-frames and the 0.8 s hit invulnerability apply to everything.
19. **Tracking telegraphs must lock early enough to walk out.** Measured: a croc
    snap that tracked for 60% of its wind-up and a gorilla leap marker that
    followed for 50% of the flight left less time than escaping takes. Both
    now lock at 40%. When adding a tracking attack, compute
    `time after lock ≥ distance to leave ÷ 268 u/s`.
20. **Boss modules don't import `enemies.js`.** `bosses.js` gets `spawnEnemy`
    via `bindBossSpawner()` and shared movement from `ai.js`; `enemies.js`
    merges `BOSS_DEFS` into `ENEMY_DEFS`. This keeps the graph acyclic.
21. **`v1/` is a separate, frozen codebase.** Nothing is shared with `src/`, so a
    fix in Version 2 does not reach Version 1. Change `v1/` only when the owner
    asks for something in Version 1, and then check both. It must keep its own
    save key (`ashfall.classic.save`) and cache prefix (`ashfall-classic-`),
    or the two versions overwrite each other's progress and offline caches.
22. **Menus must centre with `margin:auto`, not flex `align-items:center`.**
    Flex centring pushed the top of a tall panel above the viewport, out of
    scroll reach. On a 390 px-tall landscape phone the title screen's heading
    was invisible. Fixed in both versions.
23. **Game-flow timers run on game time, never `setTimeout`.** A timeout that
    checks `state === 'playing'` is skipped for good if the player pauses or
    the phone backgrounds the app in that moment. The V3 shrine prompt did
    exactly that and left the player locked in the room. Count a field down
    in `tick()` instead (e.g. `room.shrineT`).

---

## 3. Repository map

```
index.html          Shell: canvas#game, div#overlay (DOM menus), div#rotate, all CSS
manifest.json       PWA manifest (display fullscreen, orientation landscape)
sw.js               Service worker, network-first cache "ashfall-main-N" (only deletes its own prefix)
v1/                 VERSION 1 — frozen 8-chamber game (index.html, src/, sw.js, manifest.json, icon.svg)
                    from c12c2d1 + 3 lives + version switch + own save key + own cache prefix
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
  bosses.js       Shared boss brain (runBoss) + TURTLE/CROC/GORILLA/PEACOCK movesets, eyeorb minion,
                  bullet helpers (shot/ringShot/fanShot, 170 cap), clearBullets/clearHostiles, BOSS_INFO
  boss-rigs.js    Skeletons + clips for the 4 creature bosses (poseClip authoring, speedFor, post hooks)
  hazards.js      world.hazards: blast, lob, shockring, beam, cone, lane — update + draw below/above
  ai.js           Shared movement/contact helpers (stepToward, collideWorld, contactDamage, …)
  enemy-rigs.js   Skeletons + clips for every enemy; state→clip mapping; drawEnemyRig
  rigs.js         Player skeleton + clips; updatePlayerAnim; drawPlayerRig
  anim.js         Keyframe skeletal animation engine (skeleton, clips, Animator, draw)
  rooms.js        Room generation, waves, doors, drawing; FINAL_DEPTH, effDepth, bossForDepth, bossScaling
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
  enemy-rigs, ai, bosses`; `bosses → ai, hazards, combat, spawn` (never
  enemies — rule 20); `enemy-rigs → boss-rigs`; `rooms → enemies, bosses,
  texture, biomes`; `ui → input, boons, enemies, rooms, bosses, audio,
  grenade, gamepad`; `game.js` imports everything.
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
     projectiles, **hazards**, pickups, room, fx; set music intensity; handle a
     chosen door; detect death → `dying`.
  4. If `dying`: keep animating (including `updatePlayer`, so the death clip
     plays) and updating enemies, projectiles and hazards for 1.15 s. Then
     `revivePlayer()` → back to `playing` if `p.lives > 1`, else `onDeath()`
     (§5.15).
  5. `updateUi(dt)`, the **music rule** (§2 rule 3), `endFrameInput()`.

### 4.2 Game states (`state` in `game.js`)

`title` → `biome` → `weapon` → `playing` ⇄ `paused` / `boon` → `dying` →
(`playing` again if a life remains) → `dead`, or → `victory`. Also `mirror` (meta shop), `padcheck` (controller diagnostic)
and `trials` (Boss Trials: `trials` → `weapon` → a single boss room; the chosen
boss waits in `pendingTrial`, and `beginRun()` dispatches to `startTrial()`).
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
below (trails, rings) → obstacles → doors → **hazard floor markers** → grenade
aim reticle → pickups → enemies (+ boss extras: exposed halo, croc ripple) →
player → projectiles → **lobbed shells + live beams** → grenades → fx above
(slashes, particles, damage numbers) → boss intro text. Then, unshaken: HUD, touch controls, low-health
vignette, full-screen flash. Screen shake is a `translate` around the world pass.

### 4.5 `world` (from `state.js`)

`player, enemies[], projectiles[], hitboxes[], grenades[], pickups[],
hazards[], room, depth, loop, biome, bossOrder[], trial, gold, kills, runTime,
damageLog{}, timeScale, paused`.

---

## 5. Systems reference

### 5.1 Player (`player.js`, `rigs.js`)

| Stat | Value |
| --- | --- |
| Lives | 3 per run (`START_LIVES`); a spare life revives at full HP (§5.15) |
| Max HP | 80 (+10 per Vitality level) |
| Move speed | 268 u/s (34% while attacking, 55% while charging the bow) |
| Dash | 0.17 s at 920 u/s; **2 charges**, one recharges every 0.75 s |
| Dash invulnerability | whole dash + 0.09 s; dashing **cancels attack recovery** |
| Hit invulnerability | 0.8 s after taking damage (2.5 s after a revive) |
| Hurtbox | body r 17 for walls; ×0.72 against enemy bullets, ×0.6 against hazards |
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

**Warden of Ash** (final boss, chamber 15): r46, base HP 1250 × scale 1.9
(≈2375), damage scale 1.1. Phases at 62% and 30% HP; a phase change is a 1.5 s
invulnerable roar (bullets wiped) ending in an r300 blast. Actions: slam
(r220), volley (radial waves), aim→charge (880 u/s, 2 charges in phase 3),
stun (now EXPOSED), summon (wretches; bombers in phase 3), spiral (phase 3,
ends winded and EXPOSED for 1 s). Eight animation clips including the roar.
The creature bosses are in §5.14.

Scaling (combat rooms use `effDepth`, §5.6): `enemyScale = 1 + (eff-1)×0.19 + loop×0.75` multiplies HP;
`dmgScale = min(2.0, 0.9 + scale×0.26)`. **Elites** (chambers 5 and 11 in V2;
3 and 6 in V1): ×1.22
radius, ×1.9 HP, ×1.15 damage, ×1.08 speed, gold ring. Enemies spawn through a
0.75 s portal telegraph, at least 250 units from the player. `e.mvx/e.mvy` hold
each enemy's real per-frame velocity. No pathfinding: they steer straight at the
player and slide along obstacles.

### 5.6 Rooms and the run (`rooms.js`)

- `FINAL_DEPTH = 15`, `BOSS_EVERY = 3`: boss rooms at 3, 6, 9, 12 (creature
  bosses, order = `world.bossOrder`, shuffled in `startRun`) and 15 (Warden).
  `bossForDepth(d)` picks the type; `room.bossSlot` is 0–3 for the creatures
  and 4 for the Warden.
- **`effDepth(d) = 1 + (d-1)×0.5`** maps the 15-chamber run onto the
  8-chamber curve the balance pass measured (chamber 14 ≈ old 7.5). Combat rooms
  use it for waves, budget, enemy pool, obstacles, enemy scaling and gold.
- Elite rooms: `ELITE_DEPTHS = [5, 11]` (= old elite depths 3 and 6 exactly).
- Waves: 1 (eff ≤2), 2 (≤5), 3 otherwise. Budget per wave =
  `round((4 + eff×2.8 + loop×8) × (0.75 + w×0.35))`, spent on random enemies
  whose `minDepth ≤ eff + loop×3`.
- On clear: two doors on the top wall (60% boon / 20% heal / 20% gold; forced
  heal if HP < 45%; duplicate non-boon rewards become boon). **Creature boss
  rooms:** always a boon door, plus heal (if HP < 85%) or gold. **Final boss /
  trial:** one exit.
- Door rewards: **boon** → pick 1 of 3; **heal** → 40% max HP; **gold** →
  `18 + eff×9`.
- **Boss scaling** (`bossScaling(room)`): creature slot s → HP ×`1 + 0.3s`,
  damage ×`1 + 0.1s`, `tier = s` (bullets +4% speed per tier, shorter rests);
  Warden HP ×1.9, damage ×1.1. Loops add HP ×0.8 and damage ×0.3.
- Kill drops: 1–3 coins (elite 7, boss 22); heal pickup 14% (boss 100%) worth 16
  HP; magnet radius 170.
- After the **final** boss (the Warden, chamber 15): *Victory* screen with
  **Press Deeper** (loop +1, harder; the boss order is kept) or a new run.
- **Version 1** (`v1/src/rooms.js`) is the old structure: `BOSS_DEPTH = 8`,
  elites at 3 and 6, the Warden at scale 1.45, no `effDepth`.

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

- **Version 2** uses localStorage key **`ashfall.save.v1`**. Careful: the
  `v1` in that key is the *save-format* version and predates the Version 1 /
  Version 2 split; it is Version 2's save. Don't rename it: that would wipe
  every existing player's progress.
- **Version 1** uses **`ashfall.classic.save`**. On its first launch, when that
  key is empty, it loads `ashfall.save.v1` as a starting point, then writes
  only its own key. So whatever the shared save held at that moment
  (including any Version 2 progress) is Version 1's starting point.
- Defaults: `darkness 0, upgrades {vitality, might, alacrity, fortune}, best
  {depth, kills, gold}, runs, wins, muted false, musicOn true, musicVolume 0.7,
  biome 'ember'`.
- Boss Trials never call `bankRun()`: no darkness, no run counted.
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
- PWA: `manifest.json` (fullscreen, landscape) + `sw.js` (network-first).
  Registered only over http(s). GitHub Pages plus caching can delay updates by
  up to ~10 minutes.
- **Two service workers.** Root `sw.js` (scope `/`) caches as `ashfall-main-N`
  and on activate deletes only `ashfall-main-*` plus the legacy `ashfall-v1`.
  `v1/sw.js` (scope `/v1/`, the more specific scope wins there) caches as
  `ashfall-classic-N` and deletes only `ashfall-classic-*`. Before the split,
  each worker deleted *every* other cache, so two versions would have wiped
  each other's offline copy. Bump `N` in the matching file when shipping.
- `v1/manifest.json` is named "Ashfall — Version 1" / "Ashfall v1", so the two
  are distinguishable if both get installed to a home screen.

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
only for bosses. **Intensity** (set every tick): 0 = room cleared (no drums),
1 = combat, 2 = any boss alive (16th-note saw arpeggio, 4-on-the-floor,
snare). Every boss shares the same boss track; per-boss music is an idea in §11. Measured:
42–78% of scheduled notes are above 250 Hz (the first version: 0%).

**Lifecycle rules:** see §2 rule 3. The whole AudioContext is suspended when the
page is hidden. `unlockAudio()` retries `ctx.resume()` on touchend, pointerup,
click and keydown, because mobile browsers differ on which gesture unlocks audio.
Music cuts the instant you die.

**SFX** (`sfx.*`): swing, hit, crit, hurt, dash, shoot, arrow, explode,
telegraph, spawn, pickup, heal, boon, door, death, bossRoar, bossDown, ui, block,
plus the boss kit: `beam`, `thud` (quiet impacts such as floor cracks and
mortar landings), `chime` (peacock), `splash` (croc), `whirr` (turtle spin),
`exposed` (bright two-note cue for the punish window) and `roar(pitch)` (each
boss's phase change). All synthesised from oscillators and one shared noise
buffer. A revive plays `boon`.

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
  per instance, so each type keeps its palette; a bone can also carry a literal
  hex colour (the bosses mix both). The rig scales by `e.r / rig.ref`, so
  elites and splitter children work automatically.
- Optional rig hooks, used by the boss rigs (`updateEnemyAnim`):
  `speedFor(e, clip)` sets playback speed (bosses stretch telegraph clips to
  `e.clipTime`), `post(e, anim)` layers procedural motion after sampling, and
  `e.animSerial` changing forces a non-looping clip to restart even if it's
  the same clip. `drawSkeleton` skips bones scaled to 0 (hidden bones). The
  player revive needs no special case: the finished death clip hands back to
  idle on its own.

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
to swap real art in against a known format. `ENEMY_RIGS` now includes the
four boss rigs, so `bakeEnemySheet('gorilla')` etc. work (verified: turtle
11 clips, croc 13, gorilla 15, peacock 9), but the committed `assets/`
predate the bosses and don't include them.

### 5.14 Creature bosses (`bosses.js`, `boss-rigs.js`, `hazards.js`)

**The fairness contract** (also at the top of `bosses.js` — keep it for any new
boss):
1. Every attack has a tell: a pose (clip time-stretched to the telegraph via
   `e.clipTime` + `speedFor`), a sound, and usually a floor marker (hazard).
2. Exactly one dense **barrage** per boss, with a ~13–14 s cooldown and an
   opening cooldown, so fights start with readable moves. Measured: the peacock
   uses its barrage 3–4× per minute.
3. Every barrage has a way through (drifting corridor, lattice wider than the
   hurtbox, safe flank, pillars). Barrage bullets fly at 140–235 u/s against the
   player's 268 u/s.
4. Every barrage ends **EXPOSED**: the boss stops (`action 'exposed'`), a gold
   dashed halo + orbiting stars, the HP bar turns gold, and damage ×1.35
   (`EXPOSED_MULT` in `combat.js`). Charges/rolls/rushes into a wall and the
   Warden's stun/spiral also expose.
5. Phase changes wait for an exposed window to finish, then roar (1.3 s,
   invulnerable) and `clearBullets()`. Death runs `clearHostiles()` (bullets,
   hazards, the boss's own summons).
6. `BULLET_CAP = 170` enemy bullets; `shot()` silently drops beyond it.
7. Against bullets the player's hurtbox is `p.r × 0.72` (`BULLET_HURTBOX` in
   `projectiles.js`); against hazards `p.r × 0.6`. Shockring gaps count the
   player's centre.

**Brain** (`runBoss`): per tick counts bullets, ticks timers (`e.t` action/step
countdown, `e.at` time in action, `e.st` time in step, `e.cool[move]`), checks
phases (`e.phases` thresholds), then runs `idle` (spec's movement) or the
current move's `update`. `chooseMove` takes the spec's weighted pool, skips
moves on cooldown and quarters the weight of the last move. `act()`/`sub()` set
action/step, reset timers, set `clipTime` and bump `animSerial` (so a repeated
step replays its clip). `idle()` shortens rests by phase (×1, ×0.8, ×0.65) and
tier.

| Boss (HP base, r) | Phases | Moves (barrage in bold) |
| --- | --- | --- |
| **Gravemaw the Shellback** — turtle (1250, 50) | 50% (spines up, faster) | `bite` cone r150 · `stomp` blast r125 + 1–2 shockrings with two gaps beside you · `spin` lane → ricochets 4/6 walls, bubble ring per bounce, EXPOSED 2 s · `mortar` 3–4 volleys × 4–5 lobs on marked spots · **`tide`** 6/8 rings of 20/24 slow bubbles, corridor drifting 0.22 rad/wave → EXPOSED 2.2 s |
| **Mawgrim, the Mire King** — croc (1100, 42) | 55% (double snap, hatchlings) | `snap` cone r215 then 820 u/s lunge · `tail` blast r190 (+12 mud in ph2) · `roll` lane → 640 u/s with mud wake (parked globs launch sideways after 0.5 s) → wall → EXPOSED · `submerge` hidden+invuln ripple chases you, marks r115, erupts with 18/24 ring → EXPOSED · `hatch` 3 wretch hatchlings (ph2, ≤2 alive) · **`spray`** stream swept ±1.05 rad for 2.6/3.3 s, flanks safe → EXPOSED 1.8 s |
| **Kharn, the Ashen Silverback** — gorilla (1200, 48) | 60%, 30% (enrage: ×1.25 speed, red eyes) | `leap` ×1/2/3, marker r130 tracks 40% of a 1.0 s flight, lands with rock ring · `boulder` ×1/2/3, bursts into 10–14 shards on expiry or wall · `rush` lane → 700 u/s, floor cracks erupt behind, wall → EXPOSED · `clap` cone r180 (+5-rock fan from ph2) · **`pound`** chest-beat, then 10/12/14 alternating rings of 14–16 rocks offset half a gap (lattice) → EXPOSED 2.3 s |
| **Solenne, the Hundred-Eyed** — peacock (1000, 36) | 66%, 33% | Kites at 240–380. `darts` 3–4 fans of 5–7 feathers at 390 u/s · `swoop` lane across you, feather mines both sides · `beams` (ph2+) 2–3 warning lines 1 s, then sweep 0.5–0.62 rad/s the way the chevrons point → EXPOSED 1.4 s · `eyes` (ph3) 3 `eyeorb` turrets spinning spirals for 7.5 s · **`display`** glides to centre, fans tail, counter-rotating teal/gold spirals (3–4 arms); ph2 adds rippling aimed shots from 5 tail eyes; ph3 adds gapped feather rings → EXPOSED 2.2 s |

**Hazards** (`spawnHazard`): `blast` (circle fills to its rim as it
detonates; optional `follow`, `shards`), `lob` (shell arcs `x0,y0 → x1,y1`,
then a blast), `shockring` (expands at `speed`, `width` band, `gaps [{a,w}]`,
optional `wait`, hits once), `beam` (`warn` dashed line with sweep chevrons →
`active` for `spin` rad/s), `cone` and `lane` (telegraph-only, owner applies
the hit; `track(h)` can steer them). Floor markers draw under entities; shells
and live beams draw above.

**Projectile additions** (`spawn.js`): `delay` (parked, blinking, then
launches), `launchSpeed`, `launchAtPlayer`, `accel`/`minSpeed`/`maxSpeed`,
`turn`, `quiet` (2-particle fizzle), `cleared`. Shapes `bubble`, `mud`
(sprite-cached like `orb`), `feather`, `rock`. Round enemy bullets are drawn
from a per-colour sprite cache (1.3 ms render for 118 bullets on the dev PC).

**Rigs** (`boss-rigs.js`): authored as whole poses with `poseClip(name, dur,
loop, [[t, {bone: {...}}, ease]])` — bones missing from a pose are at rest.
`post(e, anim)` layers procedural motion (turtle shell spin, croc roll flip,
tail-sweep spin, gorilla boulder visibility). `drawSkeleton` now skips bones
scaled to 0. `e.z` lifts a rig off its shadow (gorilla leap); `e.hidden` draws
only the boss's own tell (croc ripple).

**Boss Trials** (title screen): any boss alone, with 3 random boons (8 for the
Warden), creature bosses at slot 1. No darkness banked, no run counted;
`world.trial` holds the type. Debug: `ashfall.trial('gorilla', weaponIdx)`.

### 5.15 Lives and the two versions

**Lives** (both versions): `START_LIVES = 3` in `player.js`, `p.lives` on the
player. On death the normal `dying` state plays the collapse (1.15 s). Then,
if `p.lives > 1`, `revivePlayer()` in `game.js` runs instead of `onDeath()`:
lives −1, full HP, 2.5 s invulnerability, enemy fire cleared (`clearBullets()`
in V2, which also clears hazards; a direct splice in V1), enemies within 280 u
pushed back (mass-scaled), a green shockwave, and a "BACK ON YOUR FEET · N
lives left" toast. The death sting still plays on each death, and music drops
out during `dying` and resumes after (music rule, §2 rule 3). The HUD draws hearts
(`drawLives` in `ui.js`): beside the health bar when `view.w ≥ 1000`
(landscape phones), in the dash/grenade row on narrower screens (a 4:3 window
would collide with the chamber tracker). The last heart beats. Boss Trials
also get 3 lives. Verified: 3 → 2 → 1 → "Slain" in both versions.

**Versions:** the root is Version 2; `./v1/` is Version 1. Each title screen
shows a `.versions` row (`versionRow()` in each `game.js`) with the current
version highlighted; the other button (`data-act="version"`, `data-href`)
navigates to `./v1/` or `../`. Differences in `v1/` from commit `c12c2d1`,
and nothing else: 3 lives (player.js, game.js, ui.js), the version row +
CSS, the `margin:auto` menu fix, save key `ashfall.classic.save` (seeded once
from the shared `ashfall.save.v1` on first launch), SW cache prefix
`ashfall-classic-`, and a manifest named "Ashfall — Version 1". Verified: all
4 weapons clear V1's 8 chambers + Warden, saves stay separate, and switching
works in both directions.

### 5.16 DualSense (`dualsense.js`) — optional, unverified

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
but the bot taps instead of charging, which undersells it. **Grenades, the
bow-as-default, the 15-chamber run and 3 lives were all added after this pass
and have not been re-measured.** Lives alone roughly triple how much damage a
run can absorb, so the "0 wins in 12 bot runs" result is certainly out of date.

### 6.1 Bosses: idle vs dodging (damage taken per minute, slot-1 trial)

A crude **dodge bot** (§7.4) against a player standing still, 90 s per boss,
attributed to the boss's action when each hit landed:

| Boss | Idle | Dodging | Barrage damage while dodging |
| --- | --- | --- | --- |
| Turtle | 339 | 105 | tide 8 |
| Crocodile | 463 | 309 → **201** after the snap fix | spray 81–108 |
| Gorilla | 541 | 166 → **121** after the leap fix | pound 0–30 |
| Peacock | 264 | 61 | display 0 |
| Warden (unchanged) | 348 | 519 | — (the bot walks into its wretches) |

Reading: dodging removes 70–77% of the damage for turtle, gorilla and peacock,
and nearly all barrage damage, so the patterns are avoidable. The croc snap
and gorilla leap were the outliers; both telegraphs now lock earlier (rule 19).
**Boss HP numbers are reasoned, not measured against humans** — aim was a
45–75 s fight for a competent player. Needs playtesting.

---

## 7. Testing and verification playbook

### 7.1 Debug handle (`window.ashfall`)

`world, view, arena, input, fx, WEAPONS, state (get/set), tick, render,
startRun, advanceRoom, showTitle, trial(bossType, weaponIdx), spawn(type, x?,
y?, opts?), run(steps), pad,
dualsense, probeDualSense, rumble, pollGamepad, bakeSpriteSheet, bakeTextures,
exportAll, exportAsDataURLs, canvasToDataURL, saveAssets, outputLevel,
setMusicVolume, audio, toggleFullscreen, screenState, PLAYER_SKELETON,
PLAYER_CLIPS, resolvePose, drawSkeleton, ctx`.

Modules can also be imported directly in the console:
`await import('/src/audio.js')`.

**Version 1** exposes the same `window.ashfall` handle (minus `trial`) at
`/v1/`; import its modules relative to the page, e.g.
`await import('./src/combat.js')`, not `/src/…` (that would load Version 2's).

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
const combat = await import('/src/combat.js');
const TYPES = ['wretch','slinger','brute','charger','bomber','splitter','spitter'];
for (const w of A.WEAPONS) {
  A.startRun(w);
  const p = A.world.player; p.stats.maxHp = 99999; p.hp = 99999;
  for (let d = 1; d <= 15; d++) {
    if (A.world.room.type === 'boss') {
      drive(600, `${w.id}:boss${d}`);             // every boss gets 10 s of real moves
      let g = 0;                                   // then kill it once hittable
      while (A.world.enemies.some(e => e.boss && !e.dead) && g++ < 600) {
        const b = A.world.enemies.find(e => e.boss && !e.dead);
        if (!b.invuln) { b.hp = 1; combat.dealDamage(b, 999, { raw: true }); }
        A.tick(1/60);
      }
      A.world.enemies.forEach(e => { e.dead = true; });
      drive(90, 'bossclear');                      // > 0.3 s: boss deaths hitstop
    } else {
      TYPES.forEach(t => A.spawn(t)); drive(90, `${w.id}:${d}`);
      A.world.enemies.length = 0; A.world.room.waveIndex = A.world.room.waves.length;
      drive(60, 'clear');
    }
    if (d === 15) break;
    const door = A.world.room.doors[0];
    if (door) { p.x = door.x; p.y = door.y; drive(4, 'door'); }
    if (A.state === 'boon') { const c = document.querySelector('#overlay [data-act="boon"]'); c ? c.click() : A.advanceRoom(); }
  }
  const exit = A.world.room.doors[0]; if (exit) { p.x = exit.x; p.y = exit.y; drive(4, 'exit'); }
  // expect A.state === 'victory', five distinct bosses seen
  if (A.state !== 'playing') A.showTitle();
}
// then the death path: startRun, maxHp = hp = 10, spawn a brute, tick until A.state === 'dead'
errors; // expect []
```

Last result (boss update): 4 weapons × 15 chambers, all five bosses in a
different shuffled order per weapon, victory at 15, death path OK, 0 errors.
Also run each boss alone with `A.trial(type)` for 45 s and list the
`action/sub` pairs seen, and force phases by setting `b.hp` (wait out an
`exposed` window first — phase changes are deferred during it).

**Boss kills freeze the sim for 0.3 s (hitstop).** A test that checks "room
cleared" 5 ticks after a boss kill will wrongly report it still alive.

**Lives test (both versions):** `startRun`, then three times: `p.invuln = 0;
combat.damagePlayer(9999, p.x - 10, p.y, 'wretch')` and tick until
`A.state` is `playing` with `!p.dead`, or `dead`. Expect `3 → 2 → 1 → dead`,
full HP and `invuln 2.5` after each revive, and "Slain" on the end screen.
(Enemy shots counted right after a revive may still include ones flagged
`cleared`; they are gone on the next tick.)

**Version 1 regression:** the same loop at `/v1/` with `d <= 7`, then the
boss at chamber 8 and its exit door; expect `victory@8` for all four weapons.
Last results (`27ea3fb`): V2 full runs with bow and blade → `victory@15`; V1
all four weapons → `victory@8`; lives test passes in both; saves stay
separate; the version switch works both ways; 0 errors.

**Clean up afterwards.** Test runs bank darkness into the preview browser's
localStorage. Clear `ashfall*` keys when done so a later look at the title
screen isn't misleading.

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
  loop repaints the main canvas), or bake a sheet and `Read` the PNG. To
  screenshot a boss mid-pose while the pane is live, run until the pose, then
  set `A.fx.hitstop = 999` (freezes the sim, rendering continues).
- **Boss fairness — the dodge bot:** each tick, sum a steering force from
  (a) enemy bullets within 150 u that are approaching (push perpendicular to
  their path), (b) blast/lob markers (push out), (c) cones/lanes (push out
  sideways), (d) beams (move with the sweep), (e) a preferred 240 u distance
  from the boss (90 when exposed) and walls; press WASD for the force
  direction; tap dash when a bullet is about to connect or a shockring band is
  within 34 u. Compare `damageLog` per minute against a standing player and
  attribute each hit to `boss.action`. Moves the bot can't escape even while
  dodging are unfair candidates (that's how the snap and leap were found).
- **Render cost:** time `A.render()` over 120 frames at the densest barrage
  (peacock phase 3 Display): 1.33 ms for 118 bullets on the dev PC.

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
npx --yes esbuild@0.25.0 src/game.js --bundle --format=iife --outfile=/dev/null      # static check, V2
npx --yes esbuild@0.25.0 v1/src/game.js --bundle --format=iife --outfile=/dev/null   # static check, V1
node --check src/<file>.js      # syntax only (package.json has "type":"module")
# undefined / unused identifiers (esbuild misses these):
npx --yes eslint@8.57.0 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module,ecmaVersion:2022 --rule '{"no-undef":"error","no-unused-vars":["warn",{"args":"none"}]}' src/*.js v1/src/*.js
# single-file build (dist/ashfall.html, ~372 KB, Version 2 only; dist/ is gitignored):
npx --yes esbuild@0.25.0 src/game.js --bundle --format=iife --outfile=dist/bundle.js && node build.mjs
```

`npm run build` fails on this PC ("'esbuild' is not recognized") because
`node_modules` was never installed. Either `npm install` once, or use the
`npx` line above. The single-file build does not include Version 1.

Share zips (`Ashfall.zip`, `Ashfall-web.zip`, `Ashfall-assets.zip`) are made with
PowerShell `Compress-Archive`; they are gitignored.

### 8.3 Editing technique

- Large multi-line Python patch scripts inside Bash heredocs once failed
  ("unexpected EOF"). Write patch scripts to the session scratchpad as `.py` files
  and run them. Each patch asserts that its search string exists, so a stale
  assumption fails loudly instead of silently editing nothing.
- After edits: `node --check` each touched file, esbuild bundle, eslint
  `no-undef`, then the regression (§7.2). If `v1/` was touched, bundle and
  regress it too.
- Patching the same change into both versions: a scratchpad Python script
  that loops over `['src/ui.js', 'v1/src/ui.js']` and asserts each anchor
  exists keeps the two copies identical. (Bash heredocs with `python -` work
  for short patches; long ones go in a `.py` file.)

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
music only during runs → `0fb271c` bow first, landscape-only, music volume →
`c12c2d1` documentation journal (**the snapshot `v1/` was taken from**) →
`e8f73d3` boss battles, 15-chamber run → `27ea3fb` 3 lives, Version 1 /
Version 2 split, menu-clipping fix.

- The Pages URL serves both versions: `…/mobile-game/` is Version 2 and
  `…/mobile-game/v1/` is Version 1.

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
16. **Documentation journal** (this file), commit `c12c2d1`.
17. **Boss battles.** Owner asked for a boss after every two chambers,
    creature-inspired (gorilla, crocodile, peacock, turtle), each with distinct
    moves, and more of the "weave through projectiles" feel — rare, hard,
    fair, with an opening to punish. Built: 15-chamber run with `effDepth`
    keeping the measured curve; four creature bosses + the Warden; the shared
    boss brain; hazards; parked/curving/accelerating projectiles with sprite
    cache; EXPOSED windows (+35% damage); bullet wipes on phase change/death;
    bullet cap; smaller bullet hurtbox; hatchling and watching-eye minions;
    Boss Trials menu; boss-coloured HP bar with phase ticks; 15-pip chamber
    tracker with boss markers. Fixed during testing: gorilla fur was
    dark-on-dark against the floor (brightened); croc snap and gorilla leap
    locked too late to walk out (now 40%); `restTime` was written but unused
    (now folded into `idle()`). Commit `e8f73d3`.
18. **3 lives + Version 1 / Version 2.** Owner asked for three lives, and for the
    pre-boss game to stay playable as "Version 1" beside the 15-chamber
    "Version 2", as separate things with 3 lives in both. Built `v1/` from
    `c12c2d1`, the revive system, hearts HUD and version switch. Found and
    fixed a pre-existing bug on the way: tall menus were clipped at the top on
    landscape phones (flex centring), which hid the title and the new switch.
    Also split the service-worker caches so the versions can't delete each
    other's. Commit `27ea3fb`.
19. **Journal refresh (2026-09-11).** Brought every section in line with the
    two-version, 15-chamber, 3-lives game. Found that `npm run build` fails
    without `npm install`, and corrected the README's single-file size
    ("~160 KB" → ~370 KB, measured).

---

## 10. Known issues, limits and unverified areas

- **DualSense lightbar/triggers:** never tested on hardware. USB is more likely
  to work than Bluetooth (CRC32 path).
- **Fullscreen and landscape lock** can't be tested in the preview browser;
  verified logically only. iPhone: no page fullscreen, no lock → rotate prompt.
- **Balance** is bot-measured only; not re-measured since grenades,
  bow-as-default, the 15-chamber run or 3 lives. Needs human playtesting. With
  three full-HP lives the game is likely much easier than the §6 numbers
  suggest; lives were a deliberate owner request, so tune enemies rather than
  removing them.
- **Version 1 doesn't get fixes** made to Version 2 (rule 21). Known V2-only
  improvements it lacks: the smaller bullet hurtbox, bullet wipes on the
  Warden's phase change and death, the Warden's EXPOSED windows, and the
  sprite-cached bullets. It *does* have the menu-clipping fix and lives.
- **Version 1's first launch copies the shared save**, so if the owner played
  Version 2 first, Version 1 starts with that progress (e.g. "best chamber 15"
  in an 8-chamber game). Harmless, but it can look odd.
- **Lives aren't a Mirror upgrade or a setting** — always 3, in runs and in
  Boss Trials.
- **Boss HP and run length are untested with humans.** A full run is now 15
  chambers (roughly 12–15 minutes). More chambers also means more boons and
  gold per run than the 8-chamber economy was tuned for; the Mirror of Night
  prices may need raising. Boss fight lengths are estimates.
- **The Warden** was not re-tuned beyond HP ×1.9 for the longer run; the dodge
  bot does worse against it than a standing player (it walks into the adds).
- **Best chamber** in old saves is out of 8; new runs record out of 15. No
  migration (the number just grows).
- **Enemies have no pathfinding**; they can look dumb around obstacles.
- **Art is procedural** — readable at prototype scale, not a shippable art
  direction. Real art needs an artist, asset packs or image generation; the
  baked-atlas format (`assets/*.json`) is ready for it.
- **Doors** are placed when a room clears, in the arena as it was then; a
  mid-room resize can leave them slightly off.
- **Update lag on Pages:** service worker plus HTTP caching can show an old build
  for up to ~10 minutes.
- **`npm run build` needs `npm install` first** (no `node_modules` on the dev
  PC); the `npx` form in §8.2 works as-is.
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
- Bullet-pattern rooms outside boss fights (owner likes weaving through
  projectiles): e.g. an occasional "crossfire" chamber with turret enemies
  like the peacock's `eyeorb`. Must stay occasional.
- Per-boss arenas (the creature bosses currently share the Warden's four
  corner pillars) and per-boss music variations.
- Lives as a Mirror of Night upgrade, or a lives setting / "hard mode" with
  one life. Would need a balance pass either way.
- If Version 1 should also get specific Version 2 improvements (for example
  the fairer bullet hurtbox), port them deliberately and list them in §5.15.

---

## 13. Version 3 (`v3/`) — spells, elements, parry (in progress)

The owner asked for a "many bosses" direction (Wukong-style) and, first, deeper
combat tools that future bosses can be designed around. The approved plan is in
nine milestones; each ships to `…/mobile-game/v3/` when done. All new work
happens in `v3/`; Version 2 (root) and Version 1 (`v1/`) are untouched apart
from the three-button version switcher. Boss, spell, enemy, weapon and trap
ideas for later live in **`IDEAS.md`** (repo root), each written against the
V3 toolbox.

**V3 plumbing:** copied from V2 at `16a3020`. Save key `ashfall.v3.save`
(seeded once from `ashfall.save.v1`), SW cache prefix `ashfall-v3-`, manifest
"Ashfall — Version 3". Import modules in the console relative to the page
(`./src/…`).

### 13.1 Milestone 2 — parry, posture, projectile counters (done)

> **Parry is switched off since 13.6** (`PARRY_ENABLED = false` in
> `parry.js`): the owner found it didn't work well without enemies built
> for it. The code below is intact; flipping the flag brings back the
> button, the keys, the glints and the parry boons. Posture, bullet
> breaking and the input buffer are unaffected.

- **Input** (`input.js`, `gamepad.js`): new roles `parry` and `cast`. Touch:
  a PARRY button (✧) at `(w-222, h-54)` r34; CAST (✺) at `(w-46, h-200)`,
  hidden until spells exist (`controls.cast.enabled`). Keyboard: Shift or L =
  parry (Shift no longer triggers the special), C = cast, 1–4 pick a spell,
  mouse wheel cycles. Pad: **L1 parry, R1 cast**, dash is Cross only.
- **Input buffer** (`player.js`): attack/special/dash/parry presses are kept
  0.15 s (`p.buffer`). `bufferInput()` runs from `tick()` *before* the hitstop
  check. Before this, a press made during any impact freeze was dropped, which
  ate every riposte.
- **Parry** (`parry.js`): press → a perfect window (0.18 s default) → on a whiff,
  0.22 s recovery (no attacks, 40% move speed; dash cancels it), and a 0.55 s
  cooldown from the press. On success: the window stays open 0.08 s more for
  simultaneous hits, the cooldown drops to 0.1 s (so flurries can be
  parried one by one), attacks are unlocked immediately, +1 Focus, a clang,
  hitstop and haptics. Riposte (1.2 s): the next direct hit is a forced crit
  × the weapon's `riposteMult`, plus heavy posture damage.
  - **What's parryable:** anything passed to `damagePlayer(…, { parryable:
    true, attacker })` — body contact (`contactDamage` in `ai.js`), the
    turtle bite, croc snap, gorilla clap — and every projectile (reflected in
    `projectiles.js` via `sendBack`, even boulders, which then hit as heavy).
    Blasts, lobs, shockrings, beams and slams are not.
  - **Weapon styles** (`weapons.js` `parry: {}`): bow window 0.16 +
    counter-shot on melee parries; blade riposte ×2.6; spear counter-thrust
    (a heavy rect hitbox); shield window 0.26 and reflects ×2.6.
- **Parry cues** (`fx.parryCue`): a white four-point glint when a parryable
  wind-up has 0.16 s left (`cueWhite(e)`, once per step via `e.cued`), a red ⚠
  at the start of unparryable wind-ups (`cueRed`). Added to wretch, slinger,
  charger, spitter (white), brute and bomber (red), the Warden (charge white,
  slam red), and every creature-boss move.
- **Posture** (`poise.js`): `initPoise` gives regular enemies `30 + r×1.6`
  (×1.6 for elites) and bosses `130 + tier×20`. Normal hits add 35% of their
  damage, heavy hits 100%, explosions 60%, a melee parry 60% of a regular bar
  (34 for bosses), a riposte ×3 + 20. It drains after 2 s without hits. A full
  bar = BROKEN: regular enemies `stunT` 1.5 s (their wind-up is cancelled);
  bosses `onPoiseBreak` → EXPOSED 2.4 s (not while roaring, underground or
  airborne); the Warden → its stun for 2.2 s. The HUD shows a gold bar under
  the boss HP bar, and a thin one under hurt regular enemies.
- **Breaking bullets:** friendly melee hitboxes cut enemy bullets they touch
  (`updateHitboxes`). Charged arrows (>50%), the thrown spear and the thrown
  shield are `breaker`s. `heavy` shots (r ≥ 14, e.g. boulders) can't be
  broken, only parried or dodged. Each break +0.1 Focus and a "tink".
- **Heavy hits:** the 3rd hit of the blade/spear/shield combos, the melee
  specials, full-charge arrows, the spear counter and returned boulders.
- **Focus** is live already (3 pips on the HUD): +1 per damage/300, +1 per
  perfect parry, +0.1 per bullet broken, +0.03/s trickle. Spells arrive in
  Milestone 4.
- **Haptics** (`haptics.js`): `navigator.vibrate` on parry, hurt, posture
  break and boss kill (rate-limited; Android only).
- **Verified** (at `/v3/`): a timed parry reflects a slinger bullet with no
  damage and +1 Focus; an early press takes the hit; a blast can't be
  parried; a parried wretch lunge stuns it; ripostes land (blade 44 = 17 ×
  2.6, shield 40); a blade swing breaks 5/5 light bullets but not a boulder;
  a charged arrow shoots down 3/3 bullets; 5 heavy hits break a boss into
  EXPOSED; a full 15-chamber run on all 4 weapons has 0 errors; the lives
  death path works.

### 13.2 Milestone 3 — elements, statuses, surfaces, reactions, cancels (done)

- **`elements.js`**: `ELEMENTS` (fire, frost, water, storm, wind, earth, toxic,
  gravity, arcane), `REACTIONS` (codex name, colour, riddle hint,
  description), and **`ELEMENT_RULES`**, the single rules matrix: element ×
  status or aura → reaction, first match wins. A new interaction = one row
  (plus a case in `react()` if it's a new outcome).
- **Entry points:**
  - `hitElement(e, el, ctx)` → `{ mult }` for the triggering hit (0 = absorbed).
    `dealDamage(…, { element })` calls it; a heavy hit on a frozen foe uses the
    `physical` rule (Shatter).
  - `elementArea(el, x, y, r, opts)` hits enemies and transforms surfaces.
  - `elementOnPlayer(el)` is for enemy elements on the player.
  - `applyStatus` sets a status with no reaction check (boons, debug).
  - `combat.js` hands in `dealDamage` / `damagePlayer` via `bindCombat()`
    (rule 20 style: no import cycle).
- **Statuses** (`e.status[name] = { t, … }`, player too):
  - Burning (dps), Chilled (stacks; 3 = Frozen 2.2 s; bosses get Frostbite
    instead: 38 posture and a slow), Wet, Shocked (0.25 s micro-stun on first
    application), Poisoned (dps), Brittle (+30% taken), Extinguished (+25%
    taken, aura gone, −30% damage), Grounded (storm halved).
  - Ticks live in `updateElements()`. Cinder Trail now applies Burning through
    this, so it can Melt or be doused.
- **Reactions:** Electrocute (×1.5, chains to every wet foe within 240, stuns,
  electrifies puddles), Freeze, Shatter (×2.5), Melt (×2), Steam (the fire is
  wasted; leaves a steam cloud), Detonate (explosion), Overload (knockback
  blast), Superconduct (Brittle), Firestorm (spreads Burning, fire patches
  downwind), Spread (poison), Bog (mud). **Cancels:** Extinguish, Ground,
  Dilute, Disperse, Absorb (an aura heals from its own element).
- **Enemy buffs** (used by Milestone 7 affixes; rules live here):
  - `e.aura`: an element ring; the enemy is immune to that element.
  - `e.ward`: a shield HP pool; Storm or a parry pops it.
  - `e.armor`: −60% damage until a heavy hit, Shatter or Superconduct.
  - `e.regen`: heals over time, but not while poisoned.
  - Hasted: removed by frost.
- **`surfaces.js`** (`world.surfaces`, cap 24, same-type overlaps merge):
  water, ice, fire, toxic (cloud), oil, electrified (reverts to water), steam
  (cloud), mud.
  - `elementOnArea` transforms them: storm → electrified, frost → ice, fire
    on water → steam, fire on oil → Inferno, fire on toxic → Gas Blast, fire
    on ice → water, water on fire → steam, water/wind clear toxic, wind blows
    fire downwind, earth → mud.
  - Every 0.5 s a surface applies its element to whoever stands in it.
    Mud/oil slow.
  - Floor surfaces draw right after the floor; clouds draw above entities.
- **Friendly-fire rule:** player-made surfaces and reactions never affect the
  player; enemy-made ones do (`owner: 'enemy'`). Enemy surfaces *do* affect
  enemies — lure them in.
- **Discovery:** the first time any reaction happens → `discover(key)` stores
  it in `save.codex.reactions`, gives +5 darkness, and shows a "NEW REACTION"
  toast with its description.
- **Player damage over time:** `damagePlayer(…, { dot: true })` — small,
  ignores hit invulnerability, no flash, shake or knockback, still logged and
  still lethal.
- **Debug:** `ashfall.element(e, 'storm')`, `ashfall.area('frost', x, y, r)`,
  `ashfall.surface('oil', x, y, r, owner)`, `ashfall.applyStatus(e, 'wet', 5)`.
- **Verified:**
  - Electrocute 30 dmg on a 20 hit, chains 14 to a wet neighbour and stuns
    it; a far enemy is untouched.
  - Wet → frost = Frozen; a heavy hit shatters it for 50. Burning → frost =
    Melt 40. Three frost stacks freeze. Fire on wet leaves steam.
  - Poisoned → fire detonates for 40 on a neighbour. Chilled → storm =
    Brittle (26 on a 20 hit).
  - A fire aura absorbs fire; water strips it (Extinguished, damage 17 → 12,
    +25% taken).
  - Earth grounds a shocked foe (storm then 10 on 20).
  - Puddle + storm = electrified (18 damage over ~1 s to an enemy standing in
    it); puddle + frost = ice; oil + fire = Inferno (34).
  - The player's own fire does 0 to them; enemy fire burns.

### 13.3 Milestone 4 — spells, Focus, the CAST wheel, weapon imbue (done)

- **`spells.js`**: `SPELLS` (10 entries: `{ id, name, element, cost, glyph,
  aim: 'self' | 'cone' | 'target' | 'place', desc, cast(p, aim, target) }`).
  - **Aegis** (2): absorbs 2 hits via the `setAegisHook` in `damagePlayer`,
    then bursts (knockback, 20 damage, bullets within 170 destroyed).
  - **Dragon's Breath** (1): a 1 s channel, fire cone r190; every 0.1 s it
    deals 6, burns light bullets and touches the floor with fire. The player
    moves at 50% and can't attack while channelling.
  - **Rime** (1): frost cone r210, 16 damage, freezes puddles.
  - **Gale** (1): wind cone r240, knockback 950, interrupts wind-ups, turns
    enemy bullets in the cone into yours, disperses clouds, blows fire
    downwind. Enemies it hurls into a wall or pillar take a 22 heavy
    **SLAM** (`e.galeT` in `updateEnemies`).
  - **Stormcall** (1): bolt 22 on the nearest foe, chains 3 times (14 each),
    +1 jump per wet target, electrifies puddles.
  - **Downpour** (1): a rain zone r130 for 5 s (Wet every 0.5 s) plus a
    puddle.
  - **Sigil of Stillness** (2): a zone r135 for 7 s; enemies at 50% (bosses
    75%), enemy bullets inside at 25% speed (`pr.inSigil`, set each tick by
    `updateSpellZones`, which runs before `updateProjectiles`).
  - **Earthen Bulwark** (1): a temporary axis-aligned obstacle (`temp: 5`,
    `bulwark: true`) that blocks bodies and bullets, then shatters into 10
    friendly earth shards.
  - **Toxic Bloom** (1): a pod that bursts into a toxic cloud r115.
  - **Singularity** (2): r240 for 2.5 s; pulls enemies (bosses at 20%) and
    enemy bullets (swallowed within 24), then implodes for 30 heavy.
- **Focus:** a spell costs 1–2 pips; with too little the cast fails with
  "NO FOCUS". 0.3 s global cooldown. Silenced blocks casting (for future
  Hexers).
- **Casting:**
  - Tap CAST = cast the selected spell.
  - Hold ≥ 0.18 s = the **wheel**: the world runs at 20% (`sdt` in `tick()`;
    `world.realDt` keeps the hold timer real-time). Drag, point the mouse or
    push the right stick toward a slot; release to select and cast. Release
    near the centre cancels.
  - Keys 1–3 pick; the mouse wheel cycles.
  - The wheel is drawn centred on screen for every input (on touch it first
    sat over the button cluster).
- **Targets:**
  - Cones use `p.aimAngle` (auto-aim, mouse or stick).
  - Placed spells go to the mouse position (≤ 380 u), else the nearest enemy,
    else 200 u ahead.
- **Imbue:** an elemental spell imbues the weapon for 4 s. `spawn.js` adds
  `element` to every friendly hitbox/projectile from `p.imbue`, so swings
  apply that element (and its reactions). The HUD shows "STORM WEAPON 3.2s".
- **Loadout screen** (pulled forward from Milestone 8): weapon pick → a
  loadout screen (toggle 3 of 10 spells) → Begin. Saved in `save.loadout`
  (default Downpour / Stormcall / Gale). Trials go through it too.
- **HUD:** the CAST button shows the selected spell's glyph, colour and cost;
  three small spell icons next to the Focus pips (the selected one filled).
- **Debug:** `ashfall.loadout([...])`, `ashfall.cast('gale')`,
  `ashfall.spellState`.
- **Verified:**
  - Downpour wets 3 enemies → Stormcall electrocutes all three (29–33 each)
    and imbues storm.
  - Gale pushes an enemy 92 u and turns 4/4 bullets.
  - Three Rime casts freeze an enemy and the puddle becomes ice.
  - Breath: 52 damage, burning, 3/3 bullets burnt.
  - Sigil: a bullet moves exactly 25% of normal.
  - Bulwark blocks a bullet, then crumbles.
  - Bloom poisons, then fire blows the cloud.
  - Singularity pulls an enemy 101 u closer and swallows a bullet.
  - Aegis absorbs 2 hits, then damage lands normally. With no Focus the cast
    is refused.
  - The wheel opens and closes on hold/release, and a touch drag picks a slot.
  - Full 15-chamber runs with 4 different loadouts and 43–56 casts each: 0
    errors.
  - Bot quirk: a bot that walks onto the door for only 4 ticks can miss a boon
    screen and stall. Walk to the door until the depth changes (the loop in
    the runs above).

### 13.4 Milestone 5 — elemental grenades, element boons, weapon hooks (done)

- **`GRENADE_TYPES`** (`grenade.js`), picked on the loadout screen
  (`save.grenadeType`, `p.grenadeType`):
  - Frag: the original, a raw blast of 60.
  - Firebomb: fire + a fire patch. Frost Shell: frost applied twice. Shock
    Orb: storm.
  - Tide Flask: water + a puddle. Toxic Jar: toxic + a cloud. Oil Flask: a
    wide oil slick.
  - Elemental blasts go through `elementArea` (heavy, so they Shatter the
    frozen). The bomb, reticle, HUD pips and BOMB button take the type's
    colour.
- **Boons:** a sixth god, **Thalassa** (tide and frost). New boons use the
  element, parry, spell and Focus systems:
  - Kindling (Burning ×1.5 duration and damage) and Meltdown (Melt ×2.8/×3.6).
  - Conductor (Electrocute +40% reach, +50% stun) and Thunder Parry (a
    perfect parry strikes the nearest foes with storm).
  - Tidecaller (25–55% of hits leave foes Wet), Permafrost (Frozen foes take
    +40%), Glacial Parry (a parry chills the attacker) and Deep Well (+1 max
    Focus).
  - Deflecting Gust (dashing breaks light bullets) and Lingering Charm
    (imbues +2 s).
  - Everlasting Aegis (+1 absorb).
  - Killing Riposte (+0.6 riposte multiplier), Still Mind (parry window
    +30%) and Arcane Flow (Focus +40%).
  - Arc Chain now deals storm damage (so it electrocutes the wet); Cinder
    Trail respects Kindling.
- **Plumbing:** `boon.apply(stats, level, player)` (the third argument is
  new, for boons that touch the player, like Deep Well). Parry boons run
  through `setParryHook` (registered in `game.js`, so `parry.js` never
  imports combat).
- **Weapon hooks, ready for new weapons:** `element` (innate; every friendly
  hit carries it unless a spell imbue overrides), step `heavy: true`,
  thrown/shot `breaker`, and `parry: { window, riposteMult, reflectMult,
  counter: 'shot' | 'thrust' }`. A new weapon = one `WEAPONS` entry.
- **Verified:**
  - Every grenade type on a brute: frag 60; fire 38 + burning + fire patch;
    frost 30 + chilled; shock 36 + shocked; tide 16 + wet + puddle; toxic 18
    + poisoned + cloud; oil 14 + slick; oil then a firebomb = Inferno (72).
  - Tidecaller ×3: 10/20 hits wet. Meltdown: Melt = 56 on a 20 hit (×2.8).
    Deep Well: max Focus 4. Still Mind: parry window 0.234 s. Thunder Parry
    hits a second foe for 16.

### 13.5 Milestone 6 — traps, chamber layouts, special chambers (done)

- **`traps.js`**: `TRAPS` is a registry. Each entry is `{ init(t), update(t,
  dt), draw(ctx, t, time), hittable?, onHit?(t, element) }`, and a trap
  lives on `room.traps`, so it goes when the room goes. Every trap hurts
  enemies as well as the player, warns before it fires, and talks to the
  element system. Player damage is small (`PLAYER_TRAP_DAMAGE`); enemy
  damage is large.
  - **Spikes:** stepping on the plate arms it (red flashing ring); after
    0.5 s spikes hit whoever is still on it (player 12, enemies 34 heavy).
  - **Vent:** a wall vent; 0.8 s of glow, then a 1 s fire jet (6 per 0.25 s
    to the player, 9 fire to enemies). It ignites oil and gas along the jet.
    A puddle or Downpour over it douses it (blue ring).
  - **Saw:** a blade that runs a drawn rail (13 to the player, 30 + knockback
    to enemies).
  - **Turret:** a faint dashed line across the room. Anything crossing it
    makes it glint for 0.35 s, then it fires an arrow down the line. The
    arrows are parryable, and they hit enemies (`pr.trap`, 26 damage).
  - **Barrel** (hittable): a 120 blast of 40, plus fire. The oil variant
    spills a slick first and only explodes if fire hits it.
  - **Pylon** (hittable): a storm ring r130 for 18, chaining to pylons in
    reach and electrifying puddles.
  - **Chasm:** an enemy thrown in faster than 180 u/s (Gale, heavy hits,
    Singularity) dies with "FELL"; walkers are pushed back out. A player who
    falls loses 10% max HP and is put back at the edge.
  - **Channel:** a permanent enemy-owned puddle strip (storm bait, both
    ways).
  - Also: **toxic vents**, **wind** bands (push bodies and bullets),
    **urns** (hittable: gold, a heal or +0.6 Focus), and the fountain and
    altar used by special rooms.
  - Hittable traps are hit by melee hitboxes, friendly projectiles, blasts
    (`world.blastLog`) and fire surfaces.
  - A trap kill → "TRAP KILL", `p.trapKills` and `save.codex.trapKills`
    (via `setTrapKillFn` / `setTrapKillHook`, so no import cycle).
  - The **Trapmaster** boon (Gaia, rare): traps deal +50% to enemies and
    never hurt the player.
- **`chambers.js`**: `CHAMBERS` holds hand-made layouts in arena fractions
  (so they fit every screen size):
  - Pillared Hall (from depth 1), Hall of Pylons (2), Bridge over the Chasm
    (2), Flooded Vault (3), Furnace Corridor (4), Poison Garden (4),
    Crossroads (5), The Grinder (7), Windswept Ledge (7).
  - `pickChamber(depth)` gives none at depth 1 and a classic random room 25%
    of the time.
  - `realise()` turns fractions into world units; turrets and vents snap to
    walls.
  - `pathClear()` (a 20-unit grid flood fill, obstacles and pits count as
    walls) checks that the start can reach every door. A layout that fails
    loses its pits.
  - Enemies spawn clear of traps (`spawnPoint`).
- **Special chambers** (`SPECIAL_ROOMS`): from depth 2, 32% of the time door 2
  becomes a special door (never a repeat of the last one, never before a
  boss).
  - **Trial:** a timer of 32 + 3 per difficulty step. Clear it in time for two
    boon doors, and the next boon offer is rare-weighted.
  - **Shrine:** a pact menu, one of three curses for 3 chambers: Haste (enemies
    +30% speed), Glass (+25% damage taken) or Embers (every enemy
    Fire-touched). Accept it for a rare boon choice and the doors open; walk
    away and they open anyway. Running curses show under the chamber label.
  - **Fountain:** heals 50% and fills Focus, once.
  - **Treasure:** 8 urns and a barrel.
  - **Gauntlet:** saws, vents and spikes between you and 14 gold.
  - The rooms with no fight open their doors at once (except the shrine,
    which waits for the pact answer).
- **Debug:** `ashfall.chamber('bridge')`, `ashfall.special('shrine')`,
  `ashfall.CHAMBERS`.
- **Bug fixed during testing:** the shrine prompt was a 600 ms `setTimeout`.
  A pause in that window meant it never opened, so the doors never opened
  (rule 23).
- **Verified:**
  - All 9 layouts generate and every door is reachable.
  - Spikes 34 on an enemy; a barrel hit by fire explodes (40 to a brute
    beside it); a turret arrow hits an enemy for 26; rain douses a vent.
  - A knocked enemy falls into the chasm; a walking one doesn't; the player
    loses exactly 10% and ends outside the pit.
  - The fountain restores and fills Focus; the treasure room has 8 urns; the
    gauntlet has 7 traps and 14 gold; the trial timer starts at 39 at depth 4.
  - The shrine gives a curse (3 chambers), a boon screen, then open doors.
  - A trap kill is counted.
  - Full 15-chamber runs on all 4 weapons taking the first door and again
    taking the last (special) door: 0 errors, all victories.

### 13.6 Spell rework after the owner's phone test (done)

The owner tested M2–M6 and asked for: no parry, per-spell cooldowns, more
spells equipped, any grenade at any time, spells in the style of Avowed.
Their answers: cooldowns only (Focus removed), 4 slots with every spell
swappable mid-run, grenades sharing one set of charges, and new spells in
this same round.

- **Parry off:** `PARRY_ENABLED = false` in `parry.js` (see the note in
  13.1). `canParry`/`isParrying` return false, `setParryCues(false)` makes
  every `parryCue()` a no-op, and boons marked `needs: 'parry'` (Thunder
  Parry, Glacial Parry, Killing Riposte, Still Mind) are never offered.
  Shift is the special again.
- **Focus removed.** Every spell has its own cooldown (`cd` in `SPELLS`,
  6–24 s; `p.spellCds[id]`). It belongs to the spell, so swapping slots
  never resets it. A 0.3 s global cooldown between casts. Tapping a spell
  that is recharging flashes a red ring.
  - Deep Well is now −15% spell cooldowns (max 3; capped at −60% in
    total). Arcane Flow is now: each direct hit takes 0.1 s per level off
    every cooldown.
  - Fountains refresh all spells; urn "spells" loot takes 5 s off.
- **Four slots, any spell:** `SPELL_SLOTS = 4`, and `p.spells` always has 4
  entries (`null` = empty). The loadout screen picks the starting four
  (`save.loadout`, default Fireball, Stormcall, Gale, Downpour).
  - The **Spellbook** (state `'spellbook'`, the game paused) opens from
    the book button, **B**, the pause menu, or by tapping an empty slot.
    Tap a slot, then a spell; `equipSpell()` swaps if that spell is in
    another slot. The final set is saved as the next run's loadout.
  - The spell wheel and its slow motion are gone.
- **Casting** (Avowed's grimoire layout):
  - Touch: four spell buttons arc up the right edge above SPEC (r30,
    positions in `layoutControls`, checked at the phone's 1298×600 view).
    Each shows the glyph when ready and the seconds left while recharging.
  - Keyboard: 1–4.
  - Pad: hold **R1** and press ✕ ○ □ △ for slots 1–4; while R1 is held
    those buttons do not dash, attack, throw or special.
  - Touch taps pick the nearest button relative to its size
    (`pickButton`), so the tight cluster never steals taps.
- **New spells** (Avowed-inspired):
  - **Fireball** (8 s): bursts on the first foe or wall, a 105 blast for 30
    (heavy) and lingering flames. Friendly projectiles now run `onExpire`
    when they hit a foe.
  - **Minor Missiles** (7 s): five homing missiles, each assigned a
    different nearby foe (`pr.target`, new in the homing code).
  - **Corrosive Siphon** (12 s): a 1.6 s channelled beam into the nearest
    foe; it poisons, and heals you for half the damage dealt.
  - **Meteor Shower** (24 s): 7 meteors over 2.5 s in r150, each marked
    0.7 s ahead; 26 heavy fire and a fire patch each.
  - Every spell has a `short` label for its button.
- **Grenades:** all 7 types are always available and share the charges.
  `cycleGrenade()`: the TYPE button (⟳, beside BOMB), **R** or the mouse
  wheel, **L1** on a pad. The last type used is remembered
  (`save.grenadeType`). The grenade picker is gone from the loadout screen.
- **Desktop HUD:** four slot icons with cooldown sweeps and key or face
  labels, and the grenade type name next to its pips.
- **Verified:**
  - Casting through the input path: Fireball 48 on its target plus
    flames; Missiles hit 3 foes (33/32/11); Siphon dealt 47 and healed
    20.5; Meteor dealt 103. A second tap while recharging is refused.
  - 300 boon offers contain no parry boons, and no cues are spawned.
  - Touch taps (synthetic touch pointer events; `setPointerCapture` has to
    be stubbed for synthetic events): a spell button casts, TYPE cycles,
    an empty slot opens the Spellbook on that slot. Assigning and swapping
    work, and the cooldown survives the swap.
  - Full 15-chamber runs on all 4 weapons with 4 different loadouts
    (together all 14 spells, 44–64 casts per run) and all 7 grenade types:
    0 errors, all victories.
  - Bot quirk: a bot that re-picks its door every tick oscillates between
    two doors forever. Pick once per room.
- **Not in this round:** the new enemies (`bestiary.js`, `affixes.js`)
  are drafted but not wired in or committed. They wait for the owner's go.

## 14. Version 4 (`v4/`) — Version 2 plus simple spells (current direction)

After playing V3 the owner decided the element system (reactions,
surfaces, combos, Focus, many grenade types) was too much for a fast 2D
phone game. **Version 4 is a fresh copy of Version 2** (the fast one) with
only this added. V3 stays playable but is no longer the main line of work.

**Owner's rules for V4:**
- Spells keep their element, and each element does one clear thing: fire
  burns over time, ice slows, lightning stuns. **No combinations or
  reactions** (no ice + lightning, no puddles or surfaces).
- One grenade type (V2's).
- Spells are earned during a run; at most 4 are equipped, in a row at the
  bottom of the screen.
- Responsiveness changes (input buffer, dash-cancel, …) will come later,
  **one at a time, when the owner asks**. Don't add them on your own.
- Traps and special rooms may come later as their own step.

**Plumbing:**
- Save key `ashfall.v4.save`, seeded once from `ashfall.save.v1`.
- Cache prefix `ashfall-v4-`; manifest "Ashfall — Version 4".
- The version switcher has 4 buttons in all four versions (V1 and V3 were
  touched only there).

### 14.1 Step 1 — spells from Spell doors, grenade cancel (done)

- **`v4/src/spells.js`:** 13 spells, 3 levels each (+30% damage and −12%
  cooldown per level, plus a spell-specific extra listed in `up`). Every
  spell has its own cooldown.
  - Fire (burns: `e.burn`, V2's existing burn): Fireball (8 s, bursts on
    the first foe or wall), Dragon's Breath (9 s, a 1 s channel), Meteor
    Shower (24 s, 7 meteors, each marked on the floor first).
  - Ice (slows: `e.slow`; bosses never slower than 80%): Frost Nova (9 s,
    a ring that pushes back and slows to 50%), Ice Shards (6 s, piercing
    shards).
  - Lightning (stuns: `e.stunT`, new in `enemies.js`, bosses immune):
    Chain Lightning (7 s, 4 leaps, 0.4 s stun).
  - Wind: Gale (6 s, knockback, wall SLAM for 22, blows bullets back as
    yours).
  - Earth: Earthen Bulwark (10 s, a temporary wall).
  - Poison: Corrosive Siphon (12 s, a draining beam that heals half the
    damage).
  - Arcane: Minor Missiles (7 s, homing, spread across targets), Aegis
    (16 s, absorbs 2 hits via `setAegisHook` in `damagePlayer`), Sigil of
    Stillness (16 s, slows foes and enemy bullets to 25%).
  - Void: Singularity (18 s, a pull, bullets swallowed, then an implosion).
- **Spell doors** (`rooms.js`, reward `'spell'`, ✧ cyan):
  - A run starts with no spells. Door 2 is always a Spell door while you
    have none, then about 1 chamber in 3.
  - A guardian pays a boon plus health if you're hurt, else a spell.
  - The pick screen (`showSpellSelect`) offers 3 spells: at least one new
    one, and an upgrade if you know any. A known spell levels up (max 3;
    maxed spells are never offered).
  - A new spell with 4 equipped → "Replace which spell?" (or "Keep my
    spells"). A dropped spell keeps its level if found again (`p.spellLv`).
- **Casting:**
  - **Touch:** the 4 spell buttons arc up the right edge above SPEC, under
    the right thumb with the other action buttons (the owner asked for this
    after the first phone test; they started as a bottom row). Positions
    are in `layoutControls` (`controls.spell0-3`, r30, offsets from the
    bottom-right corner). Taps go to the nearest button relative to its size
    (`pickButton`), so SPEC never loses a tap to a spell.
  - **Keyboard and pad:** the same slots are drawn as a row along the
    bottom centre, labelled with the key or pad button (`drawSpellRow` in
    `ui.js`).
  - Each slot shows the glyph when ready, the seconds left while
    recharging, and level pips above; an empty slot is a faint socket.
  - Keyboard: 1–4. Pad: hold **R1** + ✕ ○ □ △. Dash on the pad is now ✕ or
    L1 (R1 no longer dashes).
- **Grenade cancel:** keeps the charge.
  - Touch: while aiming, a ✕ CANCEL zone appears top-right
    (`controls.gcancel`, far from any normal aiming drag). Let go over it
    and the reticle disappears; nothing is thrown.
  - Mouse: right-click while holding G.
  - Any input: dash while aiming.
- **Other changes:**
  - Burning enemies tint orange and slowed ones icy; stunned enemies show
    stars.
  - Friendly projectiles support `target` (homing), `onHitEnemy`, and
    `onExpire` on a hit.
- **Verified:**
  - Every spell cast on 3 brutes (damage, burn, slow 0.5, a stun on all 3
    for Chain Lightning, the Gale slam). Aegis blocks 2 hits. The Sigil
    slows a bullet to ~25%. Bulwark adds a wall.
  - Levelling through the door screen: 1→2→3, Fireball's cooldown goes
    8 → 6.1 s, and a maxed spell is never offered.
  - The replace screen works.
  - Grenade cancel by touch ✕, right-click and dash: 0 thrown, charge kept.
    A normal aimed throw still throws.
  - Full 15-chamber runs on all 4 weapons, taking Spell doors and casting:
    0 errors, all victories, 5–9 Spell doors per run.
  - V2 still runs; all switcher links are correct.

## 12. Glossary

| Term | Meaning |
| --- | --- |
| Chamber / depth | A room; the run is chambers 1–15; 3/6/9/12 creature bosses, 15 the Warden |
| Effective depth | `effDepth(d)`: the 15-chamber run mapped onto the old 8-chamber difficulty curve |
| Loop | Continuing past the final boss via Press Deeper; everything scales up |
| Elite | A stronger enemy variant with a gold ring (chambers 5 and 11) |
| Boss slot / tier | 0–3 = which creature-boss chamber (3/6/9/12); drives boss HP, damage, bullet speed |
| Barrage | A boss's one dense bullet pattern; long cooldown, always ends EXPOSED |
| Exposed | A boss's punish window: stopped, gold halo, takes ×1.35 damage |
| Hazard | A telegraphed non-projectile attack in `world.hazards` (blast, lob, shockring, beam, cone, lane) |
| Boss Trial | Practice fight against one boss from the title screen; nothing banked |
| Version 1 / Version 2 | V1 = the original 8-chamber game in `v1/` (frozen, own save); V2 = the current 15-chamber game at the root |
| Life / revive | 3 per run; dying with a spare stands you back up at full HP (`revivePlayer()`) |
| Boon | A stacking run upgrade from one of 5 gods, chosen at boon doors |
| Darkness | Meta currency: gold banked at the end of every run |
| Mirror of Night | Meta shop for permanent upgrades |
| Telegraph | The readable wind-up pose or marker before an enemy attack |
| Hitstop | A brief freeze of the simulation on impact, for feel |
| Trauma | 0..1 screen-shake energy; also drives gamepad rumble |
| World units | Logical coordinates (600 tall); scaled to screen by `view.scale` |
| Intensity | Music level: 0 calm, 1 combat, 2 boss |
