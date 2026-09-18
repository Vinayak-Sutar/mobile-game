# Ashfall — Documentation Journal

> **Purpose.** A single document that lets a fresh collaborator — human or LLM —
> understand the entire project without the conversation history that produced
> it. Written to be read top to bottom once, then used as a reference.
>
> **Last updated:** 2026-09-17 (Version 5 started: `v5/` is a copy of `v4/`,
> §16). **New session? Read §0, then §15 (the Version 4 handover) and §16
> (Version 5, the current line of work), then the §14 entries for whatever
> you're touching.** If code and this document disagree, **the code wins**
> — then fix this document.

---

## 0. TL;DR (read this if nothing else)

- **What:** *Ashfall*, a Hades-style top-down action roguelike for mobile
  browsers (and desktop), aimed at eventually shipping on the Google Play Store.
- **Stack:** vanilla JavaScript ES modules + Canvas 2D + WebAudio. **No engine,
  no framework, no build step to run, no image/audio asset files** — all art is
  drawn procedurally and all sound is synthesised at runtime.
- **Size:** every version is its own folder:
  - `v2/src/`: Version 2, ~11,250 lines in 30 modules.
  - `v1/`: Version 1, ~8,400 lines.
  - `v3/`: Version 3.
  - `v4/src/`: Version 4.
  - The root holds only `index.html` (a redirect to `v4/`), `sw.js`
    (retires the old root worker), `serve.py` and `build.mjs`.
- **Run (Version 4, current):**
  - Chambers 1–2 are fights; from chamber 3, fight and guardian alternate.
  - **Every guardian in `BOSS_POOL`** (`v4/src/boss-pool.js`) is fought
    once, in a fresh shuffle each run (and each loop). Beating the last one
    wins.
  - 14 guardians → **29 chambers**; each new boss adds 2 chambers by itself.
  - **3 lives** per run. Bosses follow the "hard but fair" rules (§5.14).
  - Version 2's old run (15 chambers, creature bosses at 3/6/9/12, the
    Warden at 15) is kept only in `v2/`.
- **Four versions ship side by side**, each with its own save and cache, and
  a 4-button switch on every title screen:
  - The site root (`index.html`) redirects to **Version 4**, the default (§14.13).
  - `v2/` is **Version 2** (it lived at the root until §14.13).
  - `v1/` is **Version 1**: a frozen copy of the 8-chamber game from commit
    `c12c2d1`, plus 3 lives (§5.15).
  - `v3/` is **Version 3**: elements, reactions, traps. An experiment the
    owner stepped back from (§13).
  - `v4/` is **Version 4**: Version 2 plus simple spells from Spell doors.
    **It is the current line of work (§14).**
- **Work with the owner one step at a time:** build one thing, push it, give
  them a phone link and a short test list, then stop and wait.
- **The owner tests, not you** (since 2026-09-14):
  - Don't run browser tests, bots or regressions yourself.
  - Run only the static checks (§8.2), commit, push, and hand over a
    specific "what to test" list (§15.1).
- **Run locally:** `python serve.py` → open `http://localhost:8000` (PC).
  - On the phone (same Wi-Fi) open `http://<PC Wi-Fi IPv4>:8000/`. **The IP
    changes**: it was 10.20.79.236, then 10.188.185.236. Check with
    `ipconfig` and curl it before giving the link.
  - The root opens Version 4; the others are at `/v1/`, `/v2/`, `/v3/`.
  - Landscape only.
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

### 14.2 Step 2 — Deadeye Vesper, the boss kit, spell cooldowns ×2 (done)

The owner asked for the IDEAS.md bosses with many moves, a second phase at
half health with its own transformation, anti-cheese design and an artistic
feel. **One boss per step**: Vesper went first, as the template for the rest.
The regular enemies wait their turn.

- **Spell cooldowns doubled** (owner's call): e.g. Fireball 16 s, Meteor
  48 s.
- **`boss-kit.js`** (new): the shared boss brain moved out of `bosses.js`.
  It holds `shot`/`fanShot`/`ringShot`, `act`/`sub`/`idle`/`expose`, `runBoss`
  with phases, `shockwave`/`lob`/`lane`, and bullet clearing. The four
  creatures stay in `bosses.js`; each new boss is its own `boss-<name>.js`
  exporting a spec, registered in `BOSS_DEFS` / `BOSS_INFO` /
  `CREATURE_BOSSES`.
  - New optional spec hooks: `init(e)`; `tick(e, dt, p)` every frame;
    `phaseTime` + `phaseAnim(e, dt, p, k)` for a long animated phase
    change; `arena()` returns the room's obstacles; `draw` draws the boss
    itself (no rig needed); `drawExtras(e, ctx, t)` for props and
    telegraphs; `drawArena(ctx, room, t)` paints the floor.
- **Guardian pool:** `CREATURE_BOSSES` now holds 5 bosses; 4 are drawn per
  run for chambers 3/6/9/12. Boss Trials lists all of them.
- **Breakable crates** (a generic obstacle: `crate: true, hp, maxHp`).
  Every projectile that hits one chips 1 (`pr.crateDmg` for more, 99 =
  smash and stop the shot). `breakCrate()` is in `projectiles.js`; they are
  drawn as wooden crates with cracks.
- **New projectile shape `'bullet'`:** a brass slug with a smoke streak.
  **New sounds:** `sfx.gunshot`, `sfx.bell`, `sfx.click`.
- **Vesper (`boss-vesper.js`):** 1150 HP at slot 0, r 26, 15 moves. The
  core rhythm: a 6-shot cylinder shown as pips above her; every revolver
  shot spends one, and an empty gun means a forced **Reload** (EXPOSED
  1.5 s, the punish).
  - **Phase 1:** Quick Draw (a tracking line that locks, then a fast shot),
    Fan the Hammer (the whole cylinder in a fan), Ricochet (a bank shot
    whose full path is drawn first; the simulation steps the same physics
    as `projectiles.js`, so the bullet deviates 0 u from the drawing),
    Dynamite (a lob that smashes crates), Quick-Draw Roll (untouchable,
    then a snap shot), Lasso (a whirl, a thrown loop; if it catches you,
    **dash to break free**, else a point-blank Coach Gun), Coach Gun (a
    close cone of 9 pellets), Spur Kick (only when you hug her), Coin Toss
    (a trick shot around cover), **High Noon** (the signature below), and
    Deadeye (the phase-1 barrage: five fanned volleys from the top wall,
    a marked landing, EXPOSED 2.2 s).
  - **High Noon:** the floor darkens and the bell tolls three times. Her
    sight line turns at 1.5 rad/s, slower than you can run, and locks
    0.3 s before the third bell; then a 950 u/s shot. Crates stop it and
    shatter.
  - **Phase 2 "Sundown"** at 50%: a 3.4 s transformation. She staggers, the
    hat flies off (revealing silver hair and red eyes), the square turns to
    dusk with a setting sun, the bell tolls twice, a second revolver comes
    out, and "SUNDOWN" appears. She now has 12 shots and fresh crates drop
    in. New moves: Smoke & Mirrors (hidden; six shots from around you,
    each line drawn first), Dance (three rippling lines of marked shots at
    your feet), and **Sundown** (the barrage: four counter-rotating spiral
    arms at 1.15 rad/s, a volley every 0.16 s, ~40 u gaps). Phase-1 moves
    get harder: a double tap, crossing fans, two ricochets, three coins,
    cluster dynamite, a second High Noon shot.
  - **Anti-cheese** (she reads the player in `tick`):
    - Hugging her (0.45 s within 110 u) → Spur Kick, the Coach Gun, a Roll.
    - Kiting (1.5 s beyond 390 u) → the Lasso, Ricochets, Coins.
    - Hiding behind cover (0.9 s out of sight) → Dynamite, Coins,
      Ricochets.
    - A burst of damage (4.5% of max HP) while she's idle → she rolls out.
    - She **leads her aimed shots** (up to 80% of your velocity); the locked
      line still shows exactly where the shot goes.
  - **Art:** she is drawn in `spec.draw` (a poncho diamond, a wide hat with
    a brass band, a streaming scarf, guns with recoil). `drawArena` adds
    sand, wagon ruts, a boardwalk, tumbleweeds, the bell on a post, the
    dusk tint and sun, and the High Noon dark.
- **Verified:**
  - All 15 moves run to completion with no errors.
  - Ricochet deviation 0 u over 150 frames. A dash breaks the lasso.
    Crates break.
  - The phase change: hat off, dusk to 1.0, 2 guns, 12 shots, crates
    refilled 2 → 4.
  - Cheese bots: the hugger drew Kick ×5, Roll ×3, Coach; the kiter drew
    Lasso ×2 (each into the Coach Gun), Ricochet, Dynamite; the camper drew
    Ricochet ×5, Dynamite ×4, Coin ×3.
  - Damage per minute, phase 1 / phase 2, by player skill:

    | Player bot | Phase 1 | Phase 2 |
    | --- | --- | --- |
    | Standing still | 201 | 258 |
    | Circling on autopilot | 54 | 114 |
    | Human-like (0.25 s reactions) | 30 | 77 |
    | Expert (reads lines, dashes) | 0 | 8 |

    Fair (the expert avoids everything), and phase 2 is harder. Her rests
    were shortened slightly after this measurement. **Needs the owner's
    playtest for the difficulty.**
  - All six guardians are fought to death in trials with no errors (the kit
    split is safe).
  - Full runs on all 4 weapons: 0 errors, Vesper drawn in every run.

### 14.3 Vesper, round 2 — all gunplay, and harder (done)

The owner's feedback after playing her: "not challenging enough", and
"every move should be about guns".

- **Four moves replaced with gun moves:**
  - Dynamite → **Flare Gun**: a flare fired high, landing where you're
    heading (marked, 0.9 s flight). The blast smashes crates. In phase 2
    there are two flares, one on you and one ahead, and they burst into
    shrapnel.
  - Lasso → **Winchester**: shown when you keep your distance. A shouldered
    rifle fires 3 lever-action rounds (4 in phase 2), each with a tracking
    line that locks. The rounds fly at 780 u/s and **punch through crates**
    (`pr.pierceCover`, new in `projectiles.js`: the crate breaks and the
    round flies on). Their lines ignore cover to match.
  - Spur Kick → **Pistol Whip**: a gun-butt knockback, then a point-blank
    shot while you reel (two shots in phase 2).
  - Smoke bomb → **Gunsmoke**: she empties both guns into the dirt and
    vanishes in the smoke. Eight hidden shots come, up from six.
- **Harder:**
  - HP 1150 → 1400.
  - Quick Draw is a double tap (a triple in phase 2) at 700 u/s.
  - The Fan is faster (360 u/s, a 0.52 s tell); Ricochets fly at 400 u/s
    (`RICO_SPEED`, shared by the planner and the shot).
  - Two coins in phase 1; Coach Gun fires 11 pellets with a 0.42 s tell.
  - Reloads are shorter (1.1 s, 0.8 s in phase 2). High Noon comes every
    16/11 s, and its line turns at 1.9/2.4 rad/s, faster than you can
    circle at duelling range, so you must dash on the third bell or use
    cover.
  - Deadeye fires 6 volleys of 8; Dance has 4 lines; Sundown lasts 4 s at
    200 u/s (same gaps); the lead factor is 0.9; rests are shorter.
- **Measured** (damage per minute, phase 1 / phase 2; the round-1 numbers
  are before the arrow):

  | Player bot | Phase 1 | Phase 2 |
  | --- | --- | --- |
  | Standing still | 201 → 304 | 258 → 348 |
  | Circling on autopilot | 54 → 138 | 114 → 197 |
  | Human-like (0.25 s reactions) | 30 → 126 | 77 → 100 |
  | Expert (reads locked lines, dashes) | 0 → 0 | 8 → 23 |

  She now sits among the tougher guardians (§6.1), and a player who reads
  her lines still avoids nearly everything.
- **Verified:** every move in both phases runs to completion with no
  errors. A rifle round broke a crate and still hit the player behind it.
  A fight to the death took 56 s with no errors. A full run was a victory
  with Vesper at slot 2.

### 14.4 Step 3 — Nagaraja, the Coil Beneath (done)

The second boss from IDEAS.md, reworked for V4 (no parry, no elements).
Every move is a snake move.

- **Engine additions** (generic, for any multi-part boss):
  - `e.proxyOf` / `proxyMult` / `onProxyHit`: a part passes its hits to
    its boss, scaled (`combat.dealDamage`). Damage over time and chained
    blasts don't pass through, and one sweep or spell that catches several
    parts in the same tick counts once. Damage numbers show where the hit
    landed (`opts.at`).
  - `e.noTarget`: auto-aim, Chain Lightning and Minor Missiles skip the
    part.
  - `def.fixed`: the boss places the part; it never moves itself.
  - `def.invisible`: the boss draws the part; it also spawns silently.
  - New sounds: `sfx.hiss`, `sfx.rattle`.
- **`boss-naga.js`:** 1500 HP at slot 0. The body is 36 `nagaseg` parts
  (21 u apart, ~770 u long) that follow the head's trail (`makeSerpent` /
  `trailPush` / `layBody`).
  - **The body is a wall:** you can't walk through it, and it stops enemy
    bullets (older than 0.2 s). A dash hops over it, except while she
    coils: then the body is "raised" and drawn with a gold rim. Burrowed
    segments are untouchable.
  - **Damage:** the head takes ×1, the armoured coils ×0.25, and the 3
    **glowing scales** ×1.6. A scale cracks after 3.5% of her max HP and a
    new one lights 1.5 s later; the neck can't glow. Auto-aim skips the
    armoured coils.
  - **Phase 1:** Strike, Double Strike, Fang Volley, Venom Spit (lobs that
    leave venom pools: small damage every 0.5 s, 5 s), Tail Lash (a rattle
    and a cone from wherever the tail lies), Burrow (cracks show her path,
    a marked eruption), Hood Flare (true hugging only: within 120 u for
    0.8 s), Sidewinder (a drawn S-path she races along, then a strike),
    **The Coil** and **Hypnotic Sway** (the phase-1 barrage: a swirling
    floor, bending spiral scales and gapped rings).
  - **The Coil (signature):** a gold circle marks it; her head races to it
    and lays a full ring in 1.35 s.
    - Out before it closes → she's EXPOSED 1.5 s.
    - Trapped → the ring squeezes 124 → 62 u over 3.2 s. Deal 7% of her max
      HP (the glowing scales move onto the ring) → "BROKE FREE", EXPOSED
      1.9 s. Otherwise "CRUSHED" for 1.5× damage.
  - **Phase 2, Hydra:** a 3.4 s transformation. She thrashes, her body tears
    at segment 18, a second head (`nagahead`, ×1 proxy) grows from the
    stump, the braziers burn green and "HYDRA" appears.
    - Head B has its own little AI (`tickHeadB`): it keeps across from head
      A and spits fangs, or joins in on command (`orderB`).
    - New moves: Twin Strike, Crossfire, Venom Rain, Shed Skin (her empty
      skin stays as a wall for 6 s while she comes up under you), Great
      Coil (each head lays half the ring) and **Ouroboros** (the phase-2
      barrage: the halves chase each other round a ring, fanning fangs
      inward; EXPOSED 2.2 s after).
  - **Art:** a jade body with gold scale diamonds, a cobra hood, amber slit
    eyes (green at dusk), a flicking forked tongue and open jaws with
    fangs. The temple floor has a carved ring, a spiral serpent mosaic and
    four braziers; there's a green tint in phase 2.
- **Bugs the bots found and fixed:**
  - The strike lane was drawn 60 u wide against a ~72 u bite. It's now 76 u
    wide and 398 u long (`STRIKE_LANE_*`), covering the whole bite.
  - Her body pinned players against a strike, and dashes couldn't cross
    it. Dashes now hop over it (except during the Coil).
  - Hood Flare fired whenever her head slithered past you. It now needs
    real hugging and has a longer tell; its shockwave is phase 2 only.
- **Measured** (damage per minute, phase 1 / phase 2):

  | Player bot | Phase 1 | Phase 2 |
  | --- | --- | --- |
  | Standing still | 334 | 255 |
  | Circling on autopilot | 64 | 172 |
  | Human-like (0.25 s reactions) | 104 | 129 |
  | Expert (reads lanes, dashes through) | 19 | ~70–93 |

  The expert's phase-2 damage is spread across every move (Ouroboros 14,
  everything else ≤ 7): harder, not unfair.
- **Verified:**
  - All 10 phase-1 and 16 phase-2 moves run to completion with no errors.
  - Damage rules: 40 / 10 / 64 for the same hit on the head / a coil / a
    scale.
  - The Coil: escaping → EXPOSED; breaking free → EXPOSED; staying passive
    → crushed.
  - The phase change: 2 serpents, a second head, 35 segments. Her death
    leaves 0 parts and opens the doors.
  - Full runs with her in the pool: victories, no errors.
  - Checked at the phone's 844×390 size.

### 14.5 Step 4 — the Twin Wardens, Solaris & Grumm (done)

The third boss from IDEAS.md (inspired by Ornstein & Smough): two bosses in
one fight, with a phase 2 that depends on kill order. `boss-wardens.js`
exports two specs, `SOLARIS` and `GRUMM`.

- **Setup:** the room spawns `solaris` (the pool entry; `BOSS_INFO` calls it
  "The Twin Wardens"). His `init` spawns `grumm` beside him with the same
  scale and tier, and links them with `e.partner`. No `summoner` link, so
  the first to die doesn't take the other with them.
- **UI:** two boss bars side by side while two bosses are alive (`ui.js`
  lists every live boss).
- **Arena:** a cathedral nave with marble tiles, a crimson runner, a sun
  sigil and stained-glass light. There are 4 **stone pillars**: crate
  obstacles with `stone: true` and 30 HP. Bullets chip them; Grumm's
  charge, slams and boulders smash them. `drawPillar` is in `rooms.js`.
- **Solaris** (780 HP at slot 0, r 22, fast):
  - Moves: Lance Thrust, Triple Thrust, Sky Dive (a marked landing,
    untouchable while high), Lightning Spear (a lane to the wall, then a
    spear that bursts into sparks), Chain Arc (marked strikes around you),
    Lance Sweep (anti-hug) and Retreat.
- **Grumm** (1050 HP, r 40, slow):
  - Moves: Hammer Slam (a red tell, then the impact), Triple Slam
    (stepping), Belly Slam (a jump onto you and two bounces, all marked),
    Bull Charge (smashes pillars; hitting a wall stuns him, EXPOSED 1.4 s),
    Boulder Toss (a lob with rock shards), Quake (two gapped rings) and
    Hammer Sweep (anti-hug).
- **Combos** (Solaris leads; Grumm is put in a `combo` action the combo
  drives):
  - **Spear Toss:** Grumm throws Solaris down a lane that runs to the far
    wall.
  - **Pincer:** a charge and a thrust on the same line from opposite
    sides.
  - **Crater Storm:** Grumm's crater, then Solaris's spear sends 3
    lightning rings out of it.
  - **Judgment**, the barrage: Solaris rises, lightning columns strike
    alternating strips of the nave (7 strips, waves every 1.1 s, columns
    72% of a strip), and Grumm pounds every 2 s with wide-gapped rings.
    Then both are EXPOSED 2.2 s.
- **Pacing:** while one twin is mid-attack, the other mostly waits
  (`pace`), so they alternate and only overlap sometimes.
- **Friendly fire:** their strikes and impacts hurt each other (3–5% of
  the partner's max HP, shown as "FRIENDLY FIRE!"). Verified: Grumm's slam
  on Solaris took 51 (5%).
- **Phase 2 by kill order:** when a partner dies the survivor's `phases`
  becomes `[2]`, which trips the kit's phase change. The survivor absorbs
  the fallen twin's power: their energy streams across, the survivor heals
  +55% of max HP, and a banner appears.
  - **Thunder Grumm** (Solaris died first): faster. His slam adds a
    lightning ring. New moves: Thunderclap, Storm Charge (lightning falls
    along his trail), Lance Hurl (the fallen brother's lance), and
    **Tempest**, the barrage: 4 slow spinning beams plus strikes.
  - **Titan Solaris** (Grumm died first): r 22 → 34. New moves: Titan Leap
    (the landing, then two rings of rock spikes), Earthsplitter (a line of
    spikes), Titan Spin, and **Seismic Judgment** (columns alternating
    with lines of spikes).
- **Tuning from the bots:**
  - Judgment's waves came every 0.85 s, which left <0.7 s to cross a
    strip. Now 1.1 s, with narrower columns.
  - Grumm's phase-1 slam no longer rolls a ring (rings from two bosses
    stacked up).
- **Measured** (60 s samples, noisy): standing still ~530/min against the
  pair. The human-like bot takes ~120–250 (pair), ~93–150 (Thunder) and
  ~100–160 (Titan). The expert takes ~52–76 in every act. Two bosses are
  busier than one; nothing unfair stands out.
- **Verified:**
  - Every move of both twins, all 4 combos, and both phase-2 variants with
    their new moves run with no errors.
  - Killing both clears the room and opens the doors.
  - 3 full runs with the Wardens as the first guardian, plus 3 more:
    victories, no errors.
  - Checked at the phone's 844×390 size.

### 14.6 Step 5 — Ser Aldric the Oathbound (done)

The fourth boss from IDEAS.md: an honorable knight whose fight changes with
how you treat him. `boss-aldric.js`, spec `ALDRIC` (1300 HP at slot 0, r 22).
He's in the guardian pool and the trials ("Knight").

- **The Bow:** he walks out and bows for 2.4 s ("Hold your blade to duel
  with honor").
  - Leave him be → **Honor**: pure swordplay.
  - Hit him mid-bow → **Oathbroken**: black flames and dirty tricks, but he
    takes ×1.25 damage (`e.vulnerable`).
  - In an honorable duel he watches `world.grenades`: two warnings, and the
    third grenade breaks the oath.
  - The mid-bow check runs in `tick`, before the brain's phase check. If it
    ran in the move's update, a burst past 50% during the bow would skip it
    and leave the oath unresolved (a softlock; found in testing).
- **Guard** (`e.guardFn`, new in `combat.js`): sword crosswise for ~3 s.
  - Direct hits from his front ±72° are turned away ("GUARDED"); from
    behind they land. He turns slowly, so circle him.
  - Blocked damage strains the guard (bar over him). 8% of max HP →
    **GUARD BROKEN**, EXPOSED 2.2 s.
  - Three blocks within 1.3 s → a counter-thrust (0.3 s white lane).
  - Chained damage (grenade blasts, burn ticks) skips `guardFn`.
- **Sword moves:**
  - **Thrust:** a lane, then a lunge.
  - **Overhead Chop:** a red blast in front of him.
  - **Three Cuts:** left and right arcs (cones), then a thrust.
  - **Feint:** the chop's red tell, pulled (`h.dead = true`), then a
    thrust with its own lane.
  - **Pommel Strike:** anti-hug; a short cone with knockback, then a
    thrust.
  - **Dashing Stabs:** anti-kite; 3 lunges, each with a lane.
  - **Final Oath:** a 2.2 s circle r 255 that follows him, ×2.2 damage,
    then EXPOSED 2.4 s. Get out, or dash through on the stroke.
- **Oathbroken tricks:**
  - **Sand:** a cone; if it catches you, darkness except around you for
    2.2 s (drawn in `drawExtras`).
  - **Daggers:** a fan of 3.
  - **Ghost Squires:** up to 3 pale wretches, which die with him.
- **Phase 2 at 50%**, a 3.2 s transformation. The banner depends on the
  oath.
  - **Oath of the Moon** (honor): a glowing blade.
    - **Crescent Slash:** 3 walls of 7 moon orbs.
    - **Moonfall:** a 5-cut combo (sweep, sweep, thrust, spin, overhead),
      each cut telegraphed.
    - **Full Moon** barrage: 3 turning arms plus gapped rings, 4.6 s, then
      EXPOSED.
  - **The Oath Breaks** (broken): blood-moon light.
    - **Black Flame:** 3 dashes that leave fire patches (a bite every
      0.5 s).
    - **Inferno** barrage: 5 widening rings of marked fire pillars plus a
      two-armed spiral, then EXPOSED.
- **The kneel** (honor only). `e.hpFloor = 1` (new in `combat.js`) keeps
  him alive; at ≤12% (after phase 2) he kneels. A SPARE sigil appears
  ~230 away, and "STRIKE TO EXECUTE" shows over him.
  - Hits during the first 0.8 s do nothing.
  - After that, any hit (`guardFn` sets `e.struck`) → **Execute**: 14 extra
    gold, and `damageMult ×1.15` for the run ("Oathbreaker's Edge").
  - Standing in the sigil for 1 s → **Spare**: +1 life and full health.
  - Either way `killEnemy` clears the room normally. Oathbroken clears
    `hpFloor`, so he dies like any boss.
- **Art:** drawn in the spec.
  - The knight: plate, pauldrons, a great helm with a cross visor, a
    white plume, a blue cape with a white star, and a longsword. Poses for
    bow, guard, raise and kneel.
  - Oathbroken: a charred cape, red visor and black-flame embers.
  - The arena: a moonlit ring of standing stones (decor only, no
    obstacles), a ring on the ground, fireflies, and silver or blood-red
    moonlight.
- **Measured** (60 s bot samples, damage per minute):

  | Oath and phase | Human bot | Expert bot |
  | --- | --- | --- |
  | Honor, phase 1 | 168 | 0 |
  | Honor, phase 2 | 88 | 55 |
  | Broken, phase 1 | 118 | 58 |
  | Broken, phase 2 | 130 | 70 |

  The Three Cuts are what the human bot eats most in phase 1: a learnable
  pattern. Numbers are in the range of the other bosses.
- **Verified:**
  - All 16 moves end cleanly in both oaths and both phases.
  - Guard: block, counter and break.
  - Bow → broken; grenade warnings → broken on the third.
  - A burst past 50% mid-bow → broken.
  - Kneel: grace, spare (+1 life, full HP), execute (+15%).
  - Death clears the room.
  - 4 full runs with Aldric as the first guardian: victories, no errors
    (one spared him).
  - Checked at 844×390.
- **Owner's verdict:** "very easy". The original four creature bosses felt
  right. That set the calibration target for the next boss (§14.7).

### 14.7 Step 6 — the Weeping Bride, calibrated to the original bosses (done)

**Calibration first.** The owner found Aldric "very easy" and the original
four "awesome", so the originals were measured with the same bot (45 s
samples, damage per minute):

| Boss | Idle | Human bot | Expert bot | Exposed |
| --- | --- | --- | --- | --- |
| Turtle, P1 / last | 331 / 520 | 139 / 109 | 91 / 151 | ~15–28% |
| Gorilla, P1 / last | 572 / 625 | 139 / 292 | 77 / 107 | 14–26% |
| Peacock, P1 / last | 197 / 337 | 99 / 107 | 63 / 100 | 10–18% |
| Crocodile, last | 548 | 175 | 180 | 16–25% |
| Aldric (honor) P1 / P2 | 399 / 305 | 85 / 137 | **0** / 48 | ~22% |
| Vesper P1 / P2 | 333 / 389 | 143 / 157 | **0** / 9 | ~19% |

The reading: the originals keep hurting even a perfect dodger (63–180),
because something is always coming (darts, spins, boulders, contact). The V4
bosses let a perfect dodger take nothing in phase 1. **Target for new
bosses:** idle 350–600, human bot 100–200, expert bot 60–150.

**The Weeping Bride** (`boss-bride.js`, spec `BRIDE`, 1250 HP at slot 0,
r 22). She's in the pool and the trials ("Ghost").

- **Light (signature):** a dark ballroom with 6 lanterns.
  - Hit a lantern (a melee hitbox or a friendly bullet) to light it for
    18 s (13 s in phase 2). It fades over its last 2 s.
  - She's only fully hurt while lit: in a lantern's glow (r 190), a
    fallen chandelier's glow (r 170, 7 s), or your own aura (r 150).
  - In the dark, `guardFn` scales hits ×0.2 ("UNSEEN"). Grenades are
    chained, so they skip it.
  - So a pure ranged fight needs lanterns where she floats, and she
    blows them out. Close range meets Wail, Embrace and Cold Hands.
  - Drawn in `drawArena` (floor level): marble checks, then a small
    offscreen darkness canvas with soft holes, scaled up, then warm
    additive glows. Telegraphs and bullets are drawn above it, so they stay
    fully visible (phone fairness).
- **Mirrors:** copies are `bridecopy` enemies (`fixed`, `invisible`,
  `summoner`). She places them every tick at her reflection across the
  centre line ('h') or the horizontal line ('v').
  - Every petal she fires, they fire mirrored (`bshot`).
  - Only she has a shadow and shows in the two mirrors on the far wall.
    Copies also carry a crack.
  - A hit on a copy (`guardFn = shatter`) breaks it into 10 glass shards,
    gapped toward you. It gives no gold. Auto-aim can pick copies: a
    deliberate trap.
  - Phase 1: the copies last 11 s. Phase 2: both are permanent and re-form
    5 s after shattering.
- **Pressure:** in idle she keeps her distance (220–330) and weeps a
  3-petal volley every ~1 s. Touching her chills (contact damage).
- **Moves:**
  - **Veil Petals:** 3 fans of 6 (7 in phase 2).
  - **Cold Hands:** 5–6 marked hands, led onto your path.
  - **Wail:** a red cone from her and every copy. It hurts, knocks back
    and **silences** your spells for 3 s.
  - **Lantern Snuff:** a gapped gust ring that blows out lanterns as it
    passes.
  - **Chandelier:** a big marked crash on you, crystal shards, then its
    glow.
  - **Mirror Copies.**
  - **Grasping Veil:** a lane, then a flight; two in phase 2.
  - **Embrace:** anti-hug; a cold ring, then she teleports somewhere dark.
  - **Veil Dance:** a barrage, then EXPOSED 1.6 s.
- **Phase 2, "The Hollow Mirror"** at 50%: glass bursts, the lanterns die,
  the copies re-form, and she turns crimson.
  - **Tearfall:** dense small tear markers, the big ones on you.
  - **Wedding March:** she glides at you, and candles detonate down her
    aisle in order.
  - **HEX:** a violet lane. If it catches you, one of your spells is hers
    for 10 s, and casting it hurts you.
  - **Requiem:** a kaleidoscope barrage; she and her copies spin mirrored
    petal arms while hands keep reaching up. Then EXPOSED 2 s.
- **Engine hooks:**
  - `spells.js` `tryCast`: `p.silencedUntil` blocks every cast
    ("SILENCED"); `p.hex = { id, until, onCast }` spends the cooldown and
    calls `onCast` instead.
  - `ui.js`: silenced slots get a dark disc and a violet slash; the hexed
    slot gets a pulsing violet ring and her face.
  - She clears both on death.
  - Boss Trials now also start with 2 random spells, as a real run has by
    chamber 6. The Bride's Wail and Hex act on them.
- **Measured** (60 s bot samples; the bot doesn't use lanterns or attack):

  | Phase | Idle | Human bot | Expert bot | Exposed |
  | --- | --- | --- | --- | --- |
  | 1 | 410 | 112 | 79 | ~5% |
  | 2 | 496 | 167–200 | 39–80 | ~5% |

  Both phases sit inside the originals' range. The first pass was softer
  (human bot 72 in phase 1). Tuning then:
  - idle petals every 0.95 s;
  - fans of 6;
  - Cold Hands led further;
  - shorter lunge, chandelier and wail tells;
  - Mirror more often;
  - a denser Tearfall and Requiem.
- **Verified:**
  - All 13 moves end cleanly in both phases.
  - Lanterns light from bullets and melee.
  - UNSEEN ×0.2 and lit ×1.
  - Copy shatter (10 shards), and copies re-form in phase 2.
  - Silence blocks casting; a hexed cast hurts the player (18).
  - The phase change; death clears the room and the marks.
  - 4 full runs with her as the first guardian: victories, no errors.
  - Checked at 844×390 in touch layout.

### 14.8 Step 7 — a guardian in every other chamber (done)

The owner: "add a boss fight in every alternate chamber. And we will keep
this structure till the end, and we will keep adding new bosses."

- **Structure** (V4 only; V1–V3 unchanged):
  - Chambers 1–2 are fights (the guaranteed Spell door comes from
    chamber 1).
  - From chamber 3, fight and guardian alternate: guardians at 3, 5, 7, 9,
    11 and 13, the Warden at 15.
  - Six guardians are drawn per run from the shuffled pool
    (`CREATURE_BOSSES`, 9 bosses now), with no repeats while the pool has
    ≥ 6.
- **Data-driven** in `rooms.js`: `FIRST_BOSS_DEPTH = 3`, `BOSS_GAP = 2`,
  `GUARDIAN_COUNT` (derived, 6), `isBossDepth()` and `guardianIndex()`.
  `BOSS_EVERY` is gone. Adding a boss changes nothing here: it joins the
  pool.
- **Elites** move to the fight chambers 6 and 12 (5 and 11 are now
  guardians).
- **Scaling:** the six guardians climb the old four-slot curve, tier =
  slot × 3/5 (0, 0.6, 1.2, 1.8, 2.4, 3.0), so HP and damage run from ×1.0 at
  chamber 3 to ×1.9 / ×1.3 at chamber 13. Fractional tiers are fine: `tm()`
  and `idle()` only use tier arithmetically.
  - Trials pass `tier: 1` explicitly, so trial HP is unchanged and the bot
    tables in §14.2–14.7 stay valid. The Warden trial uses slot
    `GUARDIAN_COUNT`.
- **Unchanged:**
  - Guardian doors still pay a boon plus health/spell/gold.
  - The top-bar pips read `isBossDepth`, so they show the new pattern.
  - Title and Trials text updated.
- **Verified:**
  - Depths 1–15 map to F F B F B F B F B F B F B F W, with elites at 6 and 12.
  - Slots 0–5 and the Warden resolve to 6 distinct guardians, then the
    Warden.
  - Scaling per slot matches the curve.
  - Trial HP is unchanged (Aldric 1690).
  - 2 full runs reach victory through 6 guardians plus the Warden, with no
    errors; loop 2 rooms keep the same pattern.

### 14.9 Step 8 — every guardian in every run, no fixed finale (done)

The owner: "add all the bosses in run. So every alternate chamber will be a
boss, and don't keep Warden as the final boss. Randomly put all the bosses."
This replaces §14.8's six-of-the-pool structure.

- **The pool:** `boss-pool.js` exports `BOSS_POOL` (10 guardians, the
  Warden included). It has no imports because `rooms.js` reads its length
  while loading. `bosses.js` re-exports it, and `CREATURE_BOSSES` is gone.
- **The run:**
  - `startRun` shuffles the whole pool into `world.bossOrder`.
    `loopDeeper` reshuffles it for the next loop.
  - Chambers 1–2 are fights, then fight and guardian alternate from chamber 3.
  - `FINAL_DEPTH = FIRST_BOSS_DEPTH + (GUARDIAN_COUNT − 1) × BOSS_GAP`:
    **21 chambers** with 10 guardians. Each new boss adds 2 chambers by
    itself.
- **The finale:** `room.final` = the last boss chamber (not the Warden).
  Its door is the exit, so beating the last guardian wins the run. The
  toast reads "THE LAST GATE".
- **Curves stretch to any run length:**
  - `effDepth` maps the last chamber onto the measured curve's chamber 8.
  - Elites sit at the fight chambers nearest eff 3.5 and 6.5 (8 and 18
    for 21 chambers).
  - Boss scaling: tier = slot × 3/(N−1) for everyone, the Warden included
    (his old special case, ×1.9 as the finale, is gone; he lands on the
    curve wherever he's drawn).
- **Trials:** every boss, the Warden too, is a tier-1 trial with 3 boons
  (the Warden trial used to be ×1.9 with 8 boons). His card says "Warden".
- **HUD:** 21 pips, and every boss is a diamond (no Warden triangle).
- **Verified:**
  - `FINAL_DEPTH` 21, `GUARDIAN_COUNT` 10, elites 8/18, effDepth 1 → 8.
  - Chambers map to F F B F B F B E B F B F B F B F B E B F B, with
    `final` only at 21.
  - Scaling runs ×1.00 → ×1.90 over slots 0–9.
  - Trials: Aldric 1690 HP (unchanged), the Warden 1625.
  - 2 full runs won through all 10 guardians, with the Warden at slot 3 in
    one run and last in the other, and no errors.
  - Press Deeper reshuffles all 10.

### 14.10 Step 9 — Echo of the Monkey King (done)

The owner asked for the Monkey King right after the all-bosses run (§14.9).
`boss-monkey.js`, spec `MONKEY`, 1300 HP at slot 0, r 24. He's in
`BOSS_POOL`, so a run is now **11 guardians, 23 chambers**. The trial card
says "Trickster".

- **Art:** an original sage, drawn in the spec:
  - bronze-gold fur, round ears, a lighter face;
  - a cream robe with a sky-blue collar and a red rope sash;
  - a crown of three leaves, a curling tail, and a bamboo staff with bronze
    caps.
  - The real sage has a faint gold glow (phase 1 too) and a glowing staff;
    clones have neither.
- **The Summit (arena):** a dusk sea of cloud with a rock ellipse
  (rx 0.44w, ry 0.43h). No obstacles.
  - Off the rock for 0.1 s, and not mid-dash, you **fall**: −12% max HP,
    back to 72% of the way out, "FELL!".
  - The edge flushes red where you stand at k > 0.86.
  - Falls only happen while he's alive, so the doors are safe.
- **Guard hooks** (`guardFn`):
  - While spinning, projectiles and spells are DEFLECTED: nearby friendly
    bullets are `cleared`, and melee still lands.
  - Stone skin takes ×0.15, and each hit is a crack (10, or 12 in phase 2)
    → STONE SHATTERED, EXPOSED 2 s.
- **Moves:**
  - **Extending Staff:** a 560 lane (0.4 s), twice in phase 2.
  - **Staff Combo:** two cones, then a red slam.
  - **Staff Spin:** chases you, deflects shots, throws spark rings, then
    he's dizzy.
  - **Cloud Somersault:** a lane, and puffs burst behind him.
  - **Clone Army:** 4 clones, 6 in phase 2. `monkeyclone` enemies are
    fixed and invisible, drawn by him. They ring you and poke in sequence;
    a popped clone kills its lane and its strike.
  - **Pillar Slam:** a wide red lane, then rock shards to both sides.
  - **Stone Monkey.**
  - **Cudgel Throw:** out and back.
  - **Cloud Dive:** 2 dives, 3 in phase 2; the last lands with a
    shockwave.
- **Seventy-Two Transformations:** `world.beaten` (new) records guardians
  cleared this run (`clearRoom`, not in trials). He becomes one of them, or
  any in a trial, for one signature move:
  - turtle shell ricochet; croc hidden snaps; gorilla leap and shockwave;
  - peacock feather spiral; Vesper quickdraw lanes; naga venom lobs;
  - lancer spear lane; a borrowed Final Oath; Cold Hands; Warden novas.
  - A form icon floats over him. Phase 2 does two forms back to back.
- **Phase 2, "The Great Sage Awakens"** at 50%:
  - clones pop, a gold aura, and the summit crumbles to rx 0.36w, ry 0.35h
    (the player is kept on the rock during the shrink);
  - **Heaven-Splitting Staff:** a giant two-ended staff sweeping the summit
    for 5.5 s with gapped spark rings, then EXPOSED 2 s.
- **Measured** (45 s bot samples, damage a minute; falls counted apart):

  | Phase | Idle | Human bot | Expert bot, first pass | Expert bot, after tuning |
  | --- | --- | --- | --- | --- |
  | 1 | 537 | 195 | 11 (+9 falls) | 32–41 (+4–9 falls) |
  | 2 | 447 | 179 | 43 (+8 falls) | 76–85 (+3–7 falls) |

  The expert bot dodged too cleanly, so the idle staff flick became 3
  sparks every 1.05 s (0.85 s in phase 2), the poke tell 0.4 s, and
  Heaven's rings every 1.1 s.
  - Phase 2 now sits inside the target (60–150).
  - Phase 1 clean-dodge damage is still low, but falls are real damage
    (~10 each for an 80 HP player). Counting them, the expert takes about
    80–160 a minute.
- **Test pitfall:** a gamepad connected to the PC with stick drift steered
  the bot off the edge ~30 times a minute. Bot runs now stub
  `navigator.getGamepads = () => []` on the test page.
- **Verified:**
  - Every move and all 10 forms end cleanly in both phases.
  - Fall (−12%, back on the rock).
  - Spin deflects a shot on its first frame.
  - Popping a clone kills its strike, and no clones are left afterwards.
  - Stone takes exactly 6 per cracked hit, and 10 cracks expose him.
  - The phase change shrinks the summit; death clears the room.
  - 2 full 23-chamber runs won with him 6th, and his forms (turtle,
    gorilla) came from guardians already beaten.
  - Checked at 844×390.

### 14.11 Step 10 — The Maestro, the rhythm boss (built; owner testing)

The owner picked the Maestro from IDEAS.md. From this step on, **the owner
tests on the phone** (memory `feedback-owner-tests`). I only ran static
checks, so the build is unverified in the browser.

`boss-maestro.js`, spec `MAESTRO`, 1250 HP at slot 0, r 22. He's in
`BOSS_POOL`, so a run is now **12 guardians, 25 chambers**. The trial card
says "Conductor".

- **Beat clock:** `e.song` counts beats (`+= dt × bpm/60`) at 100 BPM in
  phase 1 and 126 BPM in phase 2.
  - A one-bar count-in (clicks, "1 2 3 4") opens the fight.
  - On each beat: kick on beats 1 and 3, snare on 2 and 4, a bass note, a
    string pad every bar, and hats on the off-beats.
  - The piece is original, A minor i–VI–III–V.
  - Every attack plays its own voice: pizzicato for bullets, timpani,
    brass, a bell for the arpeggio, a sforzando chord.
- **Audio:** `band` in `audio.js`.
  - Percussion uses the master bus, because the beat is gameplay and plays
    even with music off.
  - Melodic voices use the music bus and follow the music setting.
  - `band.takeStage()` (every frame he's alive) sets
    `audio.bossTrackUntil`; the regular scheduler skips its steps until
    then, so the normal track resumes 0.3 s after he dies, the run ends or
    the game pauses.
- **The score:** a note is `{ at, warn, cue, fire }` in beats.
  - At `at − warn` the cue spawns the telegraph, with the hazard delay
    converted from beats to seconds.
  - At `at` it fires.
  - Phrases (moves) schedule their notes on the next bar line with
    `phraseMove(cooldown, lead, build, grid)`.
- **Sheet music:** a staff at the top of the stage.
  - Notes scroll left to a playhead at 56 units a beat; bar lines, and a
    fermata arc over silences.
  - Each glyph shows the attack type: gold = bullets, violet = strings,
    blue bar = brass lanes, red = blasts, white diamond = timpani, red
    accent = sforzando.
  - FORTISSIMO streak pips sit at the right end.
- **On the beat** (`guardFn`): hits within ±0.1 s of a beat do ×1.5
  ("♪ ON BEAT").
  - Each beat struck in time adds 1 to a streak; an off-beat hit takes 1
    away, and 4 beats with no on-beat hit reset it.
  - 8 → **FORTISSIMO**: his score is cleared, tempo and silence reset, and
    he's EXPOSED 2.4 s.
- **Phrases:**
  - **Staccato:** a fan every beat, or 3-fans on eighths in phase 2.
  - **Timpani:** rings on beats 1 and 3 (every beat in phase 2), with a
    closing-ring cue.
  - **Crescendo:** blasts on you growing 44 → 120.
  - **Brass Chord:** 3 or 5 lanes on beat 1, then an offset set on beat 3.
  - **Arpeggio:** blasts marching out on eighths, then back.
  - **Legato:** 2–3 spiral arms for 2 bars.
  - **Fermata:** 3 beats of silence, a red stage and 3 safe stage lights;
    then SFORZANDO hits ×1.3 anywhere outside them.
  - **Baton Flurry:** anti-hug; 4 cones on eighths, on a half-bar grid.
  - **Orchestra:** a drummer (gapped rings on 1 and 3), a violinist (a
    bullet a beat) and a horn (a lane on 3 that strikes on 4). They are
    `musician` enemies (90 HP × scale, fixed, killable) for 5 bars (8 in
    phase 2), then they bow.
  - **Rubato:** tempo ×(1 + 0.32·sin) over 2 bars with a fan every beat.
  - **Overture:** the phase-1 barrage; 4 bars, then "Bravo!" and EXPOSED
    2.2 s.
- **Idle:** grace-note bullet pairs on beats 2 and 4 while he turns the
  page.
- **Phase 2, PRESTO:**
  - The tempo speeds up to 126 during the transformation, the coat comes
    off, and notes orbit him.
  - **Canon:** a bar of blasts on you, he steps to the mirrored side, and
    the bar echoes mirrored.
  - **Grand Finale:** the orchestra, 4 bars of spiral strings over timpani,
    then Fermata → Sforzando, then EXPOSED 2.6 s.
- **Not yet verified** (owner testing):
  - Moves and phases run without errors.
  - The sheet matches the attacks.
  - The on-beat window feels right on a phone.
  - The regular music really stops during his fight and returns after.
  - The balance.

### 14.12 The Maestro, round 2 — harder, a real melody, eight new instruments

Owner feedback: "actually nice", but "so easy". Asked for musical-note
projectiles, more attacks and enjoyable melodies, and "drums… vibrations of
those drums can be a type of attack", plus more instruments and musical
traits. The owner tests; I ran static checks only.

- **Harder:**
  - Tempo 100 → **116** BPM, and Presto 126 → **144**.
  - HP 1250 → 1400 and damageBase 18 → 20.
  - Most phrases start on the next half bar (less downtime). Grace notes
    fire on every beat while he's idle.
  - Presto drives a timpani ring under most phrases (`accomp`).
  - Denser attacks: staccato adds off-beat notes, 5-lane chords, eighth-note
    crescendo in Presto, 6-cut flurry.
  - FORTISSIMO needs 10 beats (was 8) and exposes for 2.0 s.
  - The orchestra returns sooner (cooldown 14) and adds a cymbalist in
    Presto.
- **Note bullets:** a new `note` shape in `projectiles.js` (head, stem and
  flag, always upright). Every Maestro bullet uses it.
- **The music:**
  - An 8-bar progression, Am–F–C–G–Am–F–E–E7.
  - A composed **lead melody**: `MELODY` in boss-maestro.js, played by
    `band.lead` (a triangle plus a quiet detuned saw) on the eighth-note
    grid (`onHalf`).
  - Presto adds a running eighth-note bass and harp arpeggio, and kicks on
    every beat.
  - The count-in is now its own bar (`song` starts at −4).
  - New voices in `audio.js`: `lead`, `harp`, `organ`, `bassDrum`, `tick`.
- **New phrases** (21 in all):
  - **Bass Drum Resonance:** a great drum on stage is struck every beat.
    Vibration rings roll out of it, and bands of the floor around it shake
    loose (marked). Presto: two drums, left and right.
  - **Snare Roll:** sixteenth-note buzz rings, then an accent ring and a
    note burst.
  - **Piano Keys:** the stage becomes 12 key strips. The melody you hear
    presses its keys: each note lights its strip a beat ahead, then strikes
    it. Presto adds a harmony key.
  - **Harp Glissando:** 10 string bands swept in order, with 2 neighbouring
    strings left silent as the way through. Presto can sweep sideways.
  - **Metronome:** a giant pendulum swings from the top of the stage,
    ticking through the middle every beat and flinging notes; the rod and
    bob hurt.
  - **Cymbal Crash:** two cymbals slide in from either side of you and meet
    on beat 3 (a marker) with a burst of notes.
  - **Syncopation:** two bars of attacks on the "and"s, and a blast on the
    "and" of four.
  - **Pipe Organ** (Presto): five pipes ring you and sound in turn, then
    all together with a centre blast and a ring of notes. Step out between
    two pipes.
- The sheet has glyphs for each new kind (snare ×, harp tick, metronome
  triangle, cymbal ring, organ bar). Fermata warns 4 beats in Presto.

### 14.13 Version 4 is the default (site layout change)

The owner: "make version 4 the default for our page."

- **Moved** (`git mv`): Version 2's `index.html`, `manifest.json`,
  `icon.svg`, `sw.js` and `src/` go from the root into `v2/`. V2 only uses
  relative paths, so it runs unchanged. The root `assets/` folder isn't
  referenced by any version's code and stays.
- **Root `index.html`** is now a small front door:
  - It unregisters a service worker scoped exactly to the root (the old V2
    worker), then `location.replace('./v4/' + search + hash)`.
  - It falls back after 0.8 s, and uses a 2 s meta refresh without
    JavaScript.
- **Root `sw.js`** is a retiring worker for phones that still have the old
  one: skipWaiting, delete `ashfall-main-*` and `ashfall-v1` caches,
  unregister, and reload the pages it controlled. Don't delete this file:
  without it the browser's update check would 404 and the old worker would
  never go away.
- **V2's cache prefix** is now `ashfall-v2-`, so the retiring worker can't
  touch it. Saves are unaffected (localStorage is per origin, not per path).
  V4 still seeds from V2's `ashfall.save.v1`.
- **Version switch:** V2's links are now `../v1/`, `../v3/` and `../v4/`,
  and V1, V3 and V4 point Version 2 at `../v2/`.
- **Build:** `build.mjs` and `npm run bundle` now make the standalone file
  from Version 4.
- **Local server:** `python serve.py` still serves the repo root, so
  `http://<ip>:8000/` opens Version 4.

### 14.14 Mau, the Nine-Lived — the cat boss (built; owner testing)

The owner asked for a cat boss with cat sounds and "all the cat-related
traits", researched from mythology and pop culture. The files are
`boss-mau.js` (fight and lives 1–4), `boss-mau-legends.js` (lives 5–9),
`boss-mau-kit.js` (helpers) and `boss-mau-art.js` (drawing). HP 1800 at
slot 0. She's in `BOSS_POOL`, so a run is **13 guardians, 27 chambers**.

- **Research used:**
  - The "nine lives" saying: Highland lore says a witch could become the
    Cat Sìth nine times, and stayed a cat after the ninth.
  - Ra as the Great Cat Mau kills Apep with a knife beneath the persea tree
    (Book of the Dead).
  - Kot Bayun (Slavic): sings travellers to sleep on a golden pillar, has
    iron claws, and his tales heal whoever catches him.
  - Nekomata (Japanese): the split tail, ghost fire, and making the dead
    dance.
  - Kasha: a fire-cart cat who comes with thunder to steal the dead.
  - Freyja's chariot is drawn by two cats (Norse).
  - Cat Sìth steals souls before burial.
  - Jólakötturinn: a house-sized Yule Cat that peers in at windows.
  - The maneki-neko's beckoning paw.
  - Real cat behaviour: purring at 25–50 Hz, the slow blink, zoomies as
    hunt rehearsal, the righting reflex.
- **Nine lives:** `phases` at 8/9 … 1/9, and `e.life` = `e.phase`.
  - Each lost life: a 1.0 s flip, landing on her feet, and a new life with
    its name banner. Lives 5 and 9 are 2.6 s transformations
    (`onPhase` sets `e.phaseT`/`e.t`).
  - Each life unlocks moves (`MOVES_BY_LIFE`); the newest life's moves are
    weighted ×1.6.
  - Nine cat heads across the top count what's left.
- **Moves by life:**
  - **1 The Housecat:** butt-wiggle pounce (the wiggle is the tell), claw
    swipes, knocking vases off the ledge (marked falls that shatter),
    hairball (lob plus slow goo), hiss (puffed fur takes ×0.5, knockback
    burst), and the beckoning paw (pulls you in; marked coins, some of
    which drop real gold).
  - **2 The Red Dot:** a laser dot chases you and she pounces whenever it
    stops.
  - **3:** Zoomies (6 shown dashes), and The Grin (she fades to a grin
    while her collar bell jingles, then pounces from behind you).
  - **4 Schrödinger's Box:** `catbox` enemies shuffle.
    - The real box wobbles, purrs and jingles every second.
    - Striking it: "OBSERVED: ALIVE!" and she's EXPOSED.
    - A wrong box releases a ghost ring.
    - A timeout makes her burst out and pounce.
  - **5 The Great Cat of Ra** (golden form, and the persea tree grows):
    Knife of Mau (3 slashes with blade crescents), Apep (a serpent of
    marked coils that all burst together), and the Sun of Heliopolis
    barrage.
  - **6 Kot Bayun:**
    - A lullaby from a golden pillar; drowsiness builds within 300.
    - At full you're ASLEEP (`p.slowUntil`/`p.slowMult`, a new player.js
      hook) and she pounces.
    - 5 hits while she sings: a heal pickup, and she's exposed.
  - **7 Nekomata:** split tail; ghost fire (6 homing wisps), and the
    dancing dead (3 wretches).
  - **8:** Kasha (a thunder tell, then a burning wheel that bounces 3 times
    and leaves fire), and Freyja's Chariot (two lynxes down parallel lanes,
    safe between; twice).
  - **9 Cat Sìth** (black form, white star):
    - Soul Snatch: a pounce that knocks your soul loose; catch it for +12%
      HP, or she heals 5%, capped at her current life.
    - The Yule Cat: a giant face over the wall and 4 marked paw slams.
    - The Nine Lives barrage: 8 ghost cats pounce in turn, then EXPOSED.
- **Catnip counterplay:** three pots. Strike one and it becomes a cloud; if
  she enters it: CATNIP!, EXPOSED 2.2 s (12 s cooldown). Pots regrow in
  16 s.
- **Sounds** (`audio.js`): `meow`, `catHiss`, `purr`, `yowl`, `trill`,
  `scratch`, `jingle` (her bell), `coin` and `thunder`.
- **Not yet verified:** the owner tests on the phone. Only static checks
  have run.

### 14.15 Fix: the Maestro's melody stuttered whenever a hit landed

Owner report: getting hit by the Maestro "disturbs" his melody.

- **Cause:** `damagePlayer` calls `hitstop(0.1)` (and `dealDamage` calls
  0.022–0.06 s on your own hits). During a hit-stop `tick()` skips every
  update, including the boss's, so `e.song` stopped. The drums, bass and
  melody (all triggered from `e.song` crossings) paused and came back late:
  an audible hiccup on every hit.
- **Fix:**
  - New generic hook: in the hit-stop branch, `game.js` calls
    `spec.realTick(e, dt)` for any live boss that has one.
  - The Maestro's `musicClock` (tempo, beat and eighth-note crossings, and
    the band) runs from both `tick` and `realTick`, so the music keeps
    exact time through the freeze.
  - Gameplay on the beat moved to `beatEvents`: grace notes, musicians,
    Presto drums, metronome notes. It stays frozen with the fight and runs
    on the first tick after, as do score cues and fires (`song >= at`).
  - Result: no drift, and a hazard can land at most one hit-stop (≤0.1 s)
    after its beat, once.

### 14.16 Mau: Schrödinger's Box made hard, and the auto-find fixed

Owner: the cat fight "was very nice". The box should be hard to read, with
fast shuffles and threats during them, and "Heart-Seeker automatically gets
to the correct box".

- **Why it was easy to find:**
  - The real box always started in the middle slot, nearest the player, and
    auto-aim (`nearestEnemy`) points at the nearest box. Three slow swaps
    often left it there.
  - Multi-hits opened every box: Arrow Volley (7 arrows), piercing charged
    shots and sweeps called `hitBox` on each box they touched, so the real
    one was always among them.
  - The hidden boss was parked on the real box's position.
- **Fixes:**
  - The real box starts in a random slot.
  - One look at a time: after a box is struck, `e.lookLock` ignores box hits
    for 0.6 s.
  - The observer effect: a wrong box releases a ghost ring and the rest
    reshuffle (2 swaps). Guess down to the last box and she bursts out and
    pounces.
  - While hidden she sits at the centroid of the row with
    `noTarget = true` (cleared by `popOut` and `clearProps`).
- **Harder:**
  - 7 swaps (9 from life 7) at 0.26 s (0.2 s from life 7), and 4 boxes from
    life 7.
  - Threats the whole time (`boxThreat`): every 0.45 s during the shuffle,
    0.9 s while waiting, alternating between a random box spitting 8
    claw-shards (every box jolts, so the wobble is no tell) and 3 marked
    vase drops around the player.
  - The tell is now one faint purr and jingle 1.4 s into a 3.6 s wait
    (was every second).

### 14.17 The Grandmaster — the chess boss (built; owner testing)

The owner picked "The Grandmaster" from the boss list. The files are
`boss-chess.js` (the King's fight), `boss-chess-board.js` (squares,
strikes, pieces and chess rules) and `boss-chess-art.js` (drawing). HP 1600
at slot 0. He's in `BOSS_POOL`, so a run is **14 guardians, 29 chambers**.
Only static checks have run; the owner tests.

- **The board:** the arena becomes 8 ranks × as many files as fit (square =
  arena height / 8), drawn as varnished wood.
- **Strikes** (the core idea): every attack is a set of squares, each with
  its own strike time. A square lights and fills during its warning, then
  flashes and hits whoever stands on it (once per strike group). Built with
  `strikeTogether` (all at once) and `strikeAlong` (down a path, `step`
  apart).
  - Warnings are 0.85 s, 0.7 s in phase 2 and 0.5 s in Blitz.
- **Pieces** (`chessman`: fixed, 80 HP × scale, their own art and health
  bar; killing one shows CAPTURED):
  - Real chess attack sets (`attackCells`): pawn diagonals; rook and bishop
    rays that stop at the first piece, so pieces block lines; knight Ls;
    the queen does both.
  - Moves are timed slides or knight hops (`movePiece`).
  - Pawns can't step onto your square, and promote on the far rank.
  - Pieces are capped at 7 (10 in phase 2); the oldest leave.
- **The King:** steps one square at a time, about 5 squares from you.
  - PROTECTED (×0.5) while 3+ pieces stand (4+ in phase 2).
  - Touching him strikes your square.
- **Moves:**
  - **Opening:** 5 pawns and a knight.
  - **Pawn Storm:** 3 advances of diagonal strikes and steps.
  - **Rook's File** and **Bishop's Diagonal:** a piece set down 4–9 squares
    from you on a line, then it strikes and slides. Two at once in phase 2.
  - **Knight's Fork:** a hop onto your square, then its 8 squares; 2
    knights, 3 in phase 2.
  - **Queen's Sweep:** 3 lines through you, repositioning before each.
  - **CHECK:** every square attacked by settled pieces, plus the King's
    neighbours, strikes together after 1.8 s (1.5 s in phase 2) for ×1.2.
    Coverage is capped at 72% of the board, so there's always a safe
    square. CHECKMATE or ESCAPED.
  - **Castling:** the King swaps with a rook; both neighbourhoods strike.
  - **Royal Guard:** anti-hug.
  - **Royal Decree:** 8-direction volleys.
  - **Scholar's Mate** (phase-1 barrage): bishop line, queen line, fork,
    CHECK, then EXPOSED 2.2 s.
- **Phase 2, The Board Flips:** the colours invert, pawns march the other
  way, and the crown tips.
  - **Promotion:** all pawns become random pieces.
  - **BLITZ:** 6 s of pieces taking turns attacking every 0.55 s, with the
    clock in red.
  - **ZUGZWANG:** for 8 s, 0.8 s on one square makes it strike.
  - **Checkmate in Three:** 4 pieces, then 3 checks at 1.5, 1.2 and 1.0 s,
    with knights and sliders repositioning between them. Then EXPOSED
    2.6 s.
- **Sounds:** `sfx.clack` (a wooden piece set down), `sfx.chessClock`, and
  the church `bell` for CHECK.
- **On hold:** after two rounds of piece art (top-down tokens, then
  upright silhouettes) the owner said the idea "has so much potential" but
  needs design and balance work first.
  - He is out of `BOSS_POOL`, so he's in neither runs nor Boss Trials.
  - All his code and registration stay in place (`boss-chess*.js`, the
    `grandmaster` and `chessman` defs).
  - A run is back to **13 guardians, 27 chambers**.
  - Open question: the piece art. chess.com's set is proprietary; the
    classic Wikipedia/lichess set (Colin M. L. Burnett, BSD-licensed, needs
    a credit line) was offered, or hand-drawn pieces. No choice made yet.

### 14.18 Kwaku Anansi, Keeper of All Stories — the spider boss (built; owner testing)

The owner picked Anansi. He's researched from Ashanti (Akan) folklore and
portrayed respectfully, as the clever trickster hero of the tales.

- **Files:**
  - `boss-anansi.js`: fight core, web strands, spider moves, phases.
  - `boss-anansi-tales.js`: the story chapters.
  - `boss-anansi-kit.js`: helpers.
  - `boss-anansi-art.js`: drawing.
- **Stats:** HP 1500 at slot 0, r 26. He's in `BOSS_POOL`, so a run is
  **14 guardians, 29 chambers**. Only static checks have run; the owner
  tests.
- **Research used:**
  - In the Ashanti tales, all stories belonged to Nyame the sky god. Their
    price was Onini the python, Osebo the leopard, Mmoboro the hornets and
    Mmoatia the fairy.
  - Anansi paid it with tricks: he measured the python against a stick and
    tied him to it; cried "It's raining!" so the hornets flew into his
    gourd; dug a pit on the leopard's path; and caught the fairy with a
    gum-covered doll holding yams.
  - In another tale he tried to hoard all wisdom in a pot and dropped it,
    scattering wisdom across the world.
  - The tales are called Anansesem ("spider stories"). He's a shapeshifter,
    and some tales credit him with making the sun, moon and stars.
- **Arena, the canopy web:** 6 sticky strands. Walking on one slows you
  (×0.72) and makes it tremble.
- **Chapters** (a banner plus a talking drum):
  - **The Python:** a measuring-stick lane through you, the python
    stretching along it, then 9 silk knots burst down it (two crossing
    pythons in phase 2).
  - **The Hornets:** rain markers, a homing swarm (enemy bullets with
    `homing`, flagged `isHornet`), then they fly into the gourd.
    - Strike the full gourd: STUNG!, EXPOSED 2.2 s.
    - Wait, and they come back out.
  - **The Leopard:** 3 faint dashed pits, then Osebo pounces 3–4 times
    down lanes.
    - If a pounce crosses a pit, OSEBO FALLS IN and Anansi laughs: EXPOSED
      1.8 s.
  - **The Gum Doll:** 2 sticky dolls beside you.
    - Touching or swinging at one: STUCK (slow ×0.12 for 1.1 s).
    - He pounces 3 times; if a pounce crosses a doll, he's stuck: EXPOSED
      2.2 s.
  - **Web of the Sky God** (phase-1 barrage): spokes of star-silk plus
    gapped rings, then EXPOSED 2.2 s.
- **Spider moves:**
  - **Silk Line:** 3 lanes. A hit reels you in for 1.2 s, and a bite
    follows if you're still close.
  - **Rappel Drop:** up the thread (untargetable), a shadow marker, a drop
    and a silk ring; two drops in phase 2.
  - **Egg Sac:** 2 sacs; break them within 4 s or 3 spiderlings each
    hatch (small wretches).
  - **Shed Skin:** the husk stays as a decoy (it bursts into silk if
    struck) while he fades, creeps behind you and pounces.
- **Phase 2, All Stories Are Anansi's:**
  - **Many Legs:** anti-hug; 8 stamping cones around him in turn.
  - **The Pot of Wisdom:** he climbs; the pot falls on a marker and
    shatters into shards plus 5 heal pickups.
  - **All Stories** (the finale): two pythons, rain, a swarm, two leopard
    pounces, then the sky web, then EXPOSED 2.6 s.
- **Sounds:** `skitter`, `silk`, `buzz`, and `talkingDrum` (an
  atumpan-style pitch bend).


---

## 15. Version 4 handover (state of the project, 2026-09-15)

The one place to restart from after a compaction. Each item points to the
detailed §14 entry where one exists.

### 15.1 Working with the owner (hard rules)

- **One step at a time.** Build one feature or boss, run the static checks,
  commit and push, make sure the phone server is up, give a short "what to
  test" list — then **stop and wait**. Never chain features, even if a plan
  lists several. (Memory: `feedback-one-step-at-a-time`.)
- **The owner tests, not you** (since 2026-09-14):
  - No browser tests, difficulty bots, forced-move loops or full-run
    regressions.
  - Static checks only (§15.2).
  - The test list must name the risky parts to check (new counters, phase
    changes, readability on the phone). (Memory: `feedback-owner-tests`.)
- **If you ever open the preview browser** (debugging only): mute first with
  `(await import('./src/audio.js')).audio.muted = true`.
  - End with `ashfall.showTitle(); ashfall.tick(1/60)`, then `tabs_close`.
    Otherwise the music plays on the owner's PC.
  - Never `preview_stop` (it kills the server the phone uses).
  - (Memory: `feedback-close-test-tab`.)
- **What the owner wants from bosses:**
  - A strong theme, researched from mythology, folklore and pop culture
    ("all corners of the internet"), with sources cited.
  - Every move follows that theme, and there are many moves (10–20).
  - One "crazy" signature mechanic.
  - A second phase with a transformation animation.
  - Long combos that reward observation, and cheese-proofing (no easy
    hugging, pure-ranged or hiding strategy).
  - An artistic feel.
  - **Challenging but fair, at the difficulty of the original four
    creature bosses** (they "were actually awesome"; §14.7 has the
    numbers).
  - Their favourites so far: the Maestro and Mau.
- **"What boss next?"** Offer 5–7 themed ideas with a recommendation; the
  owner picks.
- **Git:**
  - Push to `main` after every change.
  - End commit messages with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
  - Before every commit, run
    `git diff --cached --name-only | grep -iE "\.certs|\.pem|\.zip|dist/"`;
    it must print nothing (`.certs/` holds a private key).
  - Use the owner's email only for git authorship.
- **Don't touch:**
  - `v1/`, which is frozen except for the version switcher.
  - `v3/src/affixes.js` and `v3/src/bestiary.js`, untracked drafts.
- **Legal:** don't copy proprietary art (chess.com's pieces were refused);
  folklore and pop-culture figures get original designs; portray cultural
  figures respectfully (Anansi as the clever hero of his tales).

### 15.2 Tooling, workflow and pitfalls (Windows PC, Git Bash)

- **Server:** the preview server "ashfall" (`.claude/launch.json`, runs
  `python serve.py 8000` on 0.0.0.0).
  - If it's down, `preview_start` with name `ashfall`. It opens a tab;
    close it.
  - Phone link: `ipconfig | grep -A4 "Wi-Fi" | grep IPv4`, then
    `curl http://<ip>:8000/v4/src/<file>` should return 200. The IP has
    changed before.
- **Static checks (Version 4):**
  ```bash
  for f in v4/src/*.js; do node --check "$f"; done
  npx --yes esbuild@0.25.0 v4/src/game.js --bundle --format=iife --outfile=/dev/null   # expect "Done"
  npx --yes eslint@8.57.0 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module,ecmaVersion:2022 --rule '{"no-undef":"error"}' v4/src/*.js
  npx --yes eslint@8.57.0 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module,ecmaVersion:2022 --rule '{"no-unused-vars":"warn"}' v4/src/<new files>
  ```
  `npm notice` lines are noise. Grep them out before looking for "error".
- **Patching:**
  - Write Python patch scripts into the session scratchpad. Each uses a
    `rep()` that asserts its anchor exists before replacing.
  - **Long bash heredocs, especially with non-ASCII text (—, …, é), fail**
    with "unexpected EOF". Write scripts and commit messages to files with
    the Write tool, then run them (`git commit -F file`). Short ASCII
    heredocs are fine.
- **Output limits:** a big boss written in one response can hit the output
  cap. Split it across responses and files:
  - `boss-X-art.js` (drawing)
  - `boss-X-kit.js` (helpers)
  - `boss-X-legends.js` / `boss-X-tales.js` (move groups)
  - `boss-X.js` (the spec)

  Agree the field contract (the `e.*` fields the art reads) first.
- **A cycle-safe module pattern:** helpers live in a kit file with no
  imports from the spec. The spec spreads a move group
  (`moves: { ..., ...LEGEND_MOVES }`) that only imports the kit and art.
- **Pitfalls found:**
  - **Hit-stop** (`fx.hitstop`, from `damagePlayer` 0.1 s and `dealDamage`
    0.02–0.06 s) freezes the whole simulation. Tests must tick past it,
    and a boss with a musical clock needs `realTick` (§14.15).
  - **A drifting gamepad** on the owner's PC steers synthetic input. Test
    pages must stub `navigator.getGamepads = () => []` (§14.10).
  - **Multi-hit weapons** (Arrow Volley, piercing arrows, sweeps) can
    trigger "strike one of these" puzzles on several targets at once. Lock
    to one look per window (§14.16).
  - **Auto-aim** (`nearestEnemy`) targets the nearest valid enemy. Don't
    let a hidden boss's position, spawn order or starting slot give away a
    puzzle; use `noTarget` (§14.16).

### 15.3 The Version 4 map

- **The site root:**
  - `index.html` redirects to `./v4/` and unregisters the old root service
    worker scope.
  - `sw.js` is a retiring worker. **Don't delete it:** it clears the old
    `ashfall-main-*` caches on phones.
  - `v2/` holds Version 2 (cache `ashfall-v2-`).
  - `build.mjs` and `npm run bundle` build Version 4 into a single file.
- **`v4/`:** `index.html`, `manifest.json` ("Ashfall — Version 4"), and
  `sw.js` (cache `ashfall-v4-`, network-first).
  - Save key `ashfall.v4.save`, seeded once from V2's `ashfall.save.v1`.
  - All versions share an origin, so saves are localStorage keys; they
    don't depend on the path.
- **`v4/src` engine:**
  - `game.js`: loop, states, Boss Trials, version switch, and the hit-stop
    `realTick` hook.
  - `state.js`: `world`, including `bossOrder` and `beaten`.
  - `rooms.js`: run structure, doors, `bossScaling`.
  - `enemies.js`, `combat.js`, `projectiles.js`, `hazards.js`, `spawn.js`.
  - `player.js`, `weapons.js`, `grenade.js`, `spells.js`, `boons.js`.
  - `input.js`, `gamepad.js`, `ui.js`, `fx.js`, `audio.js`, `save.js`,
    `util.js`, and the rest.
- **Bosses:**
  - `boss-kit.js`: the shared boss brain and helpers.
  - `bosses.js`: every boss def, the creature bosses' moves, `BOSS_INFO`
    (trial cards), and re-export of the pool.
  - `boss-pool.js`: `BOSS_POOL`.
  - Warden: `enemies.js`.
  - Named bosses: `boss-vesper.js`, `boss-naga.js`, `boss-wardens.js`,
    `boss-aldric.js`, `boss-bride.js`, `boss-monkey.js`,
    `boss-maestro.js`, `boss-mau*.js` (4 files), `boss-anansi*.js`
    (4 files), and `boss-chess*.js` (3 files, on hold).

### 15.4 Version 4 systems

- **Spells** (§14.1–14.2):
  - 13 spells, each doing one simple thing (fire burns, ice slows,
    lightning stuns). No element combos, no parry.
  - Cooldowns were doubled at the owner's request. Levels 1–3; 4 slots.
  - Earned from Spell doors: always offered in the first chamber, then
    about 1 in 3.
  - Touch buttons on the right arc; keys 1–4; R1 plus a face button on a
    pad.
  - One grenade type, which can be cancelled (the ✕ zone, a right-click,
    or a dash).
- **Run structure** (§14.9): `BOSS_POOL` holds every guardian;
  `FIRST_BOSS_DEPTH = 3`, `BOSS_GAP = 2`, `GUARDIAN_COUNT` = pool length.
  - `FINAL_DEPTH = 3 + (N − 1) × 2`.
  - `effDepth` stretches the measured 8-chamber fight curve over any run
    length.
  - Elites sit at the fight chambers nearest eff 3.5 and 6.5.
  - Boss tier = slot × 3/(N − 1): HP ×(1 + 0.3·tier), up to ×1.9; damage
    ×(1 + 0.1·tier), up to ×1.3. Loops add +0.8 HP and +0.3 damage and
    reshuffle.
  - `room.final` is the last guardian chamber; its door exits to victory.
  - `world.beaten` lists guardians cleared this run.
  - Guardian doors pay a boon plus health, a spell or gold.
- **Boss Trials:** every pool boss at tier 1, with 3 boons and 2 random
  spells.
- **Boss kit** (`boss-kit.js`). A boss is a spec object passed to
  `bossDef(spec, stats)`. The spec provides:
  - `phases` (HP fractions), `phaseTime`, `phaseAnim(e,dt,p,k)`,
    `roarPitch`, and `opening` (starting cooldowns).
  - `init`, `tick`, `idle`, and `choose(e,p,d) → [[move, weight]]`.
  - `onPhase(e, want)` (may set `e.phaseT`/`e.t` for per-phase lengths)
    and `afterPhase`.
  - `moves { name: { cooldown, start(e,p), update(e,dt,p) } }`.
  - `arena()` (obstacles), `draw`, `drawExtras(e,ctx,t)`,
    `drawArena(ctx,room,t)`, and `realTick(e,dt)`.

  The kit exports:
  - The move state machine: `act`, `sub`, `idle(e,t)` (scaled by phase and
    tier) and `expose(e,t)` (EXPOSED ×1.35).
  - Bullets: `shot(e,a,speed,{x,y,off,shape,r,color,dmg,life,extra})`,
    `fanShot`, `ringShot`, and `tm(e)` (bullet speed by tier; only the
    original creature bosses use it).
  - Hazard shapes: `lane(e,t,len,width,color)` (follows `e.aim`), `lob`,
    and `shockwave` (gapped rings).
  - Movement: `inArena`, `turnToward`, `forward`.
  - Summons: `spawnEnemyFn`, and `clearHostiles` (summons die with the
    boss).

  The kit's rules:
  - A phase change waits for EXPOSED to end, then sets `invuln` and clears
    bullets and hazards.
  - The last move chosen gets ×0.25 weight.
- **Engine hooks bosses use** (all additive and generic):
  - `combat.dealDamage`:
    - `e.guardFn(e, opts, amount)` returns a multiplier (0 = blocked). It's
      skipped for `opts.chained` (grenade blasts, burn ticks).
    - `e.vulnerable` multiplies damage taken; `e.hpFloor` stops HP falling
      below a value.
    - Parts pass hits to the boss: `e.proxyOf`, `proxyMult`, `onProxyHit`.
  - Targeting and drawing flags:
    - `e.noTarget`: auto-aim and spells skip it.
    - `e.hidden`: not drawn; only the boss's `drawExtras` runs; targeting
      skips it.
    - `e.invuln`: projectile collision skips it.
    - Enemy def `fixed` (the engine doesn't move it) and `invisible` (the
      engine doesn't draw it; its boss does).
  - `player.js`: `p.slowUntil` (run time) and `p.slowMult` multiply move
    speed.
  - `spells.js` and `ui.js`:
    - `p.silencedUntil` blocks casting.
    - `p.hex = { id, until, onCast }` spends that spell and calls `onCast`
      instead.
    - Both are drawn on the spell buttons.
  - `projectiles.js`:
    - Hostile bullets honour `homing` (they curve toward you).
    - `extra` flags pass through (e.g. `isHornet`).
    - The `note` shape is an upright musical note; the others are `bullet`,
      `feather`, `shard`, `rock` and `orb`.
  - `game.js`: during a hit-stop, `spec.realTick(e, dt)` runs for live
    bosses.
  - `audio.js`:
    - `band` voices: kick, snare, hat, crash, click, timpani, pizz, bell,
      brass, strings, bass, lead, harp, organ, bassDrum, tick, sforzando.
    - `band.takeStage()` sets `audio.bossTrackUntil` (+0.3 s), which pauses
      the regular music scheduler while a boss plays its own track.
    - Percussion always uses the master bus; melodic voices use the music
      bus and follow the music setting.
  - Boss sfx:
    - Vesper and Naga: gunshot, bell, click, hiss, rattle.
    - Shared: chime, splash, whirr, exposed, roar(pitch).
    - Mau: meow, catHiss, purr, yowl, trill, scratch, jingle, coin,
      thunder.
    - Grandmaster: clack, chessClock.
    - Anansi: skitter, silk, buzz, talkingDrum.
- **Difficulty targets** (§14.7, damage a minute from the bot method):
  - The originals: idle 197–625, human bot 99–292, expert bot 63–180.
  - New bosses should keep pressure on even a perfect dodger: idle volleys,
    short rests, short punish windows.

### 15.5 The guardians (current `BOSS_POOL`, 14) — essentials

| Boss (key) | Signature and counters | Status | Journal |
| --- | --- | --- | --- |
| Turtle, Crocodile, Gorilla, Peacock (`turtle` `croc` `gorilla` `peacock`) | The original creature bosses; the owner's benchmark for difficulty | Tuned | §5.14, §6.1 |
| Warden of Ash (`warden`) | The old final boss, now just one of the pool | Unchanged | §5.14 |
| Deadeye Vesper (`vesper`) | Gunslinger: six-shot cylinder and reload windows, crates, High Noon, Deadeye, roulette | Round 2, harder | §14.2–14.3 |
| Nagaraja (`naga`) | Serpent body as a wall (dash hops it), proxy parts, hood, coils, Hydra split | Tuned | §14.4 |
| Twin Wardens (`solaris`, which brings `grumm`) | A duo with combos and friendly fire; phase 2 depends on kill order | Tuned | §14.5 |
| Ser Aldric (`aldric`) | The bow (honor or Oathbroken), a guard that strains, counters and breaks, Final Oath, kneel: spare (+1 life) or execute (+15% damage) | **Owner: "very easy"**, not retuned | §14.6 |
| Weeping Bride (`bride`) | Lanterns and light (×0.2 unseen), mirror copies with mirrored bullets, Wail silences, Hex, the Hollow Mirror | Tuned to the originals | §14.7 |
| Echo of the Monkey King (`monkey`) | Cloud summit (fall −12%), 72 transformations from bosses beaten this run, clones, deflecting spin, stone skin, the summit shrinks | Tuned | §14.10 |
| The Maestro (`maestro`) | A beat clock and score, sheet-music telegraph, on-beat ×1.5 and FORTISSIMO, 21 musical phrases, orchestra, composed melody | Owner liked it; round 2 and stutter fix untested | §14.11, §14.12, §14.15 |
| Mau, the Nine-Lived (`mau`) | Nine lives, each adding a legend's moves; catnip counterplay; Schrödinger's box (hardened, not auto-findable) | Owner: "very nice"; box changes untested | §14.14, §14.16 |
| Kwaku Anansi (`anansi`) | Canopy web; chapters: python, hornets (strike the gourd), leopard (lure it into a pit), gum doll (sticks either of you); Pot of Wisdom heals | Built, **untested** | §14.18 |
| *On hold:* The Grandmaster (`grandmaster`) | Chessboard, square strikes, real chess attack sets, CHECK puzzle | Out of the pool; needs design, balance and piece art | §14.17 |

### 15.6 Decisions and feedback, in order

1. **V3 abandoned for V4:** its elements, reactions and parry were "too
   confusing". V4 is V2 plus simple spells.
2. **Responsiveness work** (input buffer, dash-cancel, bullet cutting,
   haptics) waits until the owner asks, one item at a time. Traps and
   special rooms in V4 would be their own step.
3. **Spell cooldowns doubled.**
4. **Vesper:** "not challenging enough, stick to the guns theme" led to
   round 2.
5. **Aldric:** "very easy" made the original four the difficulty
   benchmark.
6. **Run structure:** a boss in every other chamber, then **every guardian
   in every run** with no fixed Warden finale.
7. **Maestro:** note-shaped bullets, harder, a better melody, more
   instruments; later, the melody stuttered on hits (fixed).
8. **Version 4 made the default** at the site root; V2 moved to `v2/`.
9. **Mau:** the box made hard to track, and Heart-Seeker's auto-find
   fixed.
10. **Grandmaster:** the pieces were unreadable twice. chess.com's art is
    proprietary; the options offered were the BSD-licensed classic
    Wikipedia/lichess set (needs a credit) or hand-drawn pieces. The owner
    paused, then put him on hold.
11. **Self-testing stopped** (2026-09-14): the owner tests.

### 15.7 Backlog and open questions (confirm with the owner before starting)

- **Waiting on owner test results:** Anansi (everything), the Mau box
  changes, the Maestro stutter fix and round-2 balance, the V4-default
  switch.
- **Grandmaster:** redesign, balance and a piece-art decision (above),
  then back into `BOSS_POOL`.
- **A balance pass** (the owner said "we will balance the bosses later").
  Proposals:
  - Difficulty bands in the shuffle, so hard bosses never come first and
    easy ones never last.
  - Newer bosses scale pressure with tier (tells, bullet speed), not just
    HP and damage.
  - Measure a full 29-chamber run with real boons.
  - Retune Aldric.
- **Pacing:** runs are now long (29 chambers). Watch for feedback.
- **More bosses** (IDEAS.md):
  - Main ideas: the Ringmaster (haunted circus), Hourglass Knight,
    Clockwork Colossus, Mimic King, Leviathan of the Drowned Bell, Plague
    Doctor, Frost Wyrm, Puppeteer, Hive Mother, Sol & Luna, the
    Cartographer, the Gambler, Echo of You.
  - Mini-bosses: the Headsman, Twin Hounds, the Alchemist, the Bramble
    Witch.
- **After bosses:** regular enemy variety for V4, and traps and special
  rooms for V4.

---

## 16. Version 5 (`v5/`) — enemy variety and mini-bosses (started 2026-09-17)

The owner has not settled the direction of the game yet (roguelike vs
souls-like, phone vs PC: see the research answer of 2026-09-16, summarised in
§15.7). Rather than restructure the run, Version 5 starts as an exact copy of
Version 4 and grows the part that is thin in every version so far: the
**non-boss enemies between guardian chambers**, plus **mini-bosses** drawn from
world mythology.

### 16.1 Step 1 — the V5 copy (built; owner testing)

`v5/` is `v4/` copied file for file, with only the per-version identifiers
changed, so V4 keeps working untouched:

- `v5/sw.js`: cache prefix `ashfall-v5-` (each worker only deletes its own
  prefix, so no version can wipe another's offline copy).
- `v5/manifest.json`: "Ashfall — Version 5", short name "Ashfall v5".
- `v5/src/save.js`: key `ashfall.v5.save`, seeded once from `ashfall.v4.save`
  so meta progress carries over, then independent.
- The version switcher in `v1`–`v5` `src/game.js` gained a fifth button.
  V1 is still frozen apart from that one line.
- The site root still redirects to `./v4/`. V5 is reached from the switcher or
  at `/v5/` until the owner says to promote it.

Static checks only (`node --check`, an esbuild bundle of `v5/src/game.js`,
eslint `no-undef`); the owner tests on the phone.

### 16.2 Enemy design principles (research, 2026-09-17)

- Every enemy has **one job** (a role: rusher, artillery, zoner, shield,
  swarm, support, ambusher) and **one tell**, readable from silhouette,
  colour and wind-up. Variety is about forcing different player behaviour,
  not about more hit points.
- Enemies are designed to **combine**: a zoner plus a rusher is a different
  problem from either alone. Spawn rules should mix roles, not stack one.
- **Mini-bosses** sit between fodder and guardians: a single named threat with
  2–3 moves, one gimmick and an honest punish window, dropping a reward.
- Fairness rules from §2 still hold: telegraph before damage, no off-screen
  hits, no unavoidable damage.

The mythology shortlist (ten regular enemies, six mini-bosses) is in the
step 2 proposal of 2026-09-17; the ones not built yet are in §16.11. Sacred or
taboo figures (the Wendigo, Australian Aboriginal beings) are deliberately off
the list.

### 16.3 Step 2 — the first three folk enemies (built; owner testing)

`v5/src/enemies-folk.js` holds all three plus the corpse system. They are
merged into `ENEMY_DEFS` next to the bosses
(`Object.assign(ENEMY_DEFS, BOSS_DEFS, FOLK_DEFS)`) and the factory reaches
them through `bindFolkSpawner(spawnEnemy)`, the same trick bosses use to avoid
importing `enemies.js` back.

- **Chinthe** (Myanmar temple lion) — role **shield**, r 24, hp 135, cost 5,
  `minDepth` 2.5, damage 14, at most 2 a wave.
  - `guardFn` (the hook Aldric's guard uses) cuts damage to **x0.12** for hits
    landing inside a 1.15 rad arc of its face, with a GUARDED pop and
    `sfx.block()`. Hits from the side or behind land in full, and anything
    with no direction (fire, blasts, chained hits) goes through.
  - Turns at only 2.0 rad/s, so **circling it is the counter**; it walks at
    full speed only while roughly facing you.
  - Shield bash: 0.55 s wind-up with a telegraph ring, a 0.34 s lunge, then
    **1.15 s `open`** where the guard is down and it is `exposed` (x1.35).
- **Adze** (Ewe, Ghana and Togo) — role **swarm**, r 13, hp 38, cost 3,
  `minDepth` 2, damage 7, at most 4 a wave.
  - Flies as fireflies: `invuln` and `noTarget` (so auto-aim ignores it), fast
    and wobbling, and **deals no damage in that form**.
  - It must land to feed, so it gathers within 95 units or after 4.2 s
    regardless. Gathering is a 0.45 s tell during which it is **already
    solid and killable**; then 2 s of feeding, healing 12% of its health per
    bite.
  - A stun (Chain Lightning, Gale) always drops it out of the swarm.
- **Vetala** (India) — role **support**, r 18, hp 78, cost 5, `minDepth` 3,
  damage 9, **one a wave**.
  - Holds 250–380 units away, strafes, and **blinks** 250–320 units away when
    you close inside 130 (4 s cooldown).
  - Rides a corpse: flies to it, then a **1.3 s rite** standing still, tethered
    by a dashed line, `exposed` the whole time. Completing it raises that enemy
    at **55% health, 85% damage**, tinted pale and flagged `risen`.
  - **Any damage during the rite interrupts it** (INTERRUPTED, 0.9 s stagger,
    the body stays). That is the punish window.
  - With no body to ride it throws a slow homing hex bolt instead.
- **Corpses** (`world.corpses`, reset with the world): `killEnemy` in
  `combat.js` leaves one for anything that is not a boss, a boss part, a
  summon, a split-off spawn or already risen. Life 14 s, at most 8, drawn
  under everything by `drawCorpses` from `game.js`. A Vetala claims one so two
  never fight over the same body, and it will not raise its own kind.

**Wave composition** (`rooms.js`): every type now carries a `role`
(`rusher`, `shooter`, `heavy`, `bomber`, `swarm`, `shield`, `support`) and an
optional `maxPerWave`. `makeWaves` caps how many of a role one wave may hold
(`ROLE_CAP`: rusher 4, shooter 3, swarm 4, bomber 3, heavy 2, shield 2,
support 1) and never opens a wave with a shield or a support, so those arrive
as a twist on top of a fight rather than as the fight.

Static checks only (`node --check`, esbuild bundle, eslint `no-undef`); the
owner tests.

### 16.4 To watch when testing the folk enemies

- Is the Chinthe's guard readable — is it obvious the front is blocked and
  that going around works, rather than feeling like a damage sponge?
- Does the Adze's swarm form frustrate (unkillable) or intrigue (wait for it)?
- Does a Vetala raising a brute feel like a threat you can answer, or a chore?
- Do waves feel more varied, or just busier?

### 16.5 Step 3 — the Training Ground (built; owner testing)

A practice room reached from the title screen, so a weapon or a spell can be
learned without spending a run on it. `v5/src/training.js` holds the dummy and
the meter; the loadout panel lives with the other menus in `game.js`.

- **The room:** `generateRoom(1, 0, { training: true })`. A training room has
  no obstacles, no waves, never clears and never opens a door
  (`updateRoom` returns early on `room.training`). `world.training` marks the
  mode and is cleared by `resetWorld`.
- **The dummy** (`ENEMY_DEFS.dummy`): 5000 HP, `hpFloor` 1 so it can never die,
  stationary, harmless. It leans when struck and its bar refills 1.4 s after
  the last hit, so the bar reads as "how much did that burst take off".
- **The meter** (top right): DPS over a rolling 5 s, best single hit and total.
  Fed by a new `onHurt(e, dmg)` hook called from `dealDamage`, which any enemy
  can now use.
- **The loadout panel** (pause, or the title button):
  - Weapon cards swap the weapon **live**. The player is rebuilt by
    `createPlayer` at the same position, so no weapon state survives a swap.
  - Every spell is a chip: tap to equip or unequip (4 slots, the slot number is
    shown), tap **Lv** to cycle rank I - III.
  - Toggles: **Invincible** (`p.invincible`, checked in `damagePlayer`) and
    **No cooldowns** (zeroes spell, special, dash and grenade cooldowns every
    frame, for drilling a rotation).
  - Buttons to add a dummy, clear the room, or call in any regular enemy
    including the three folk ones.
  - Dying in training just stands you back up; nothing is banked.

### 16.6 Step 3b — readable dash and grenade charges

Research (see the sources in the 2026-09-17 answer): a radial sweep or a
filling pip is read faster than a number; every input deserves a response
within ~100 ms, including a **refused** one; and charges read best as discrete
pips plus one continuous fill for the next charge.

- **HUD** (`drawCharges` in `ui.js`): dash and grenade now use the same
  vocabulary — a label, then one pip per charge in a dark socket. Full pips are
  solid, the next one fills left to right with a bright leading edge.
- **Landed charge:** the pip pops (scales up with a white ring) for 0.42 s, on
  top of the existing refill sound; the grenade now gets that sound too.
- **Refused press:** pressing dash or grenade with nothing left sets
  `dashDenied` / `grenadeDenied` for 0.45 s — the group shakes, the empty pips
  flash red, and a soft click plays. Previously nothing happened at all.
- **Touch buttons:** a **segmented ring** around the button, one arc per
  charge, with the next arc filling in white; the ring flashes outward when a
  charge lands and turns red and shakes when a press is refused.

### 16.7 Step 4 — the PC ability bar and the tutorial chamber (built; owner testing)

The owner found that on PC the grenade was invisible as an ability, and that
nothing told a new player it existed.

- **Ability bar** (`drawAbilityRow` in `ui.js`, keyboard and pad only): DASH,
  SPECIAL and BOMB as the same round buttons touch players get, with their
  names above and their key inside (`SPACE` / `K` / `G`, or `✕` / `L2` /
  `○` on a pad). Dash and bomb carry the segmented charge ring, special the
  cooldown sweep. It sits left of the spell row, or right of it on a narrow
  4:3 view. The old "special ready [K]" text line is gone.
- **The tutorial chamber** (`v5/src/tutorial.js`), researched against
  onboarding practice: learn by doing, one mechanic at a time, prompts only
  when relevant, always skippable.
  - Offered **once**, when Begin Run is pressed and `save.tutorialSeen` is
    false (seeded V4 saves count as unseen). Always available from the title
    screen. Skippable from the pause menu at any point.
  - Seven lessons, each with a card at the top (lesson n / 7, title, progress
    such as 1 / 2, a device-specific instruction for touch, keyboard or pad,
    and one line of why it matters), and a pulsing ring plus bouncing arrow on
    the relevant button and, for dash and bomb, on the HUD pip row too:
    move to a light, break three dummies, dash twice, use the special, throw
    two grenades at a cluster, cast Fireball (granted for the lesson), then a
    small real fight (two wretches and a slinger at 0.8 scale).
  - Each lesson finishes the moment it is done: a green tick, the boon sound
    and a gold ring, then the next one after a second.
  - Lessons detect actions by edge-watching player state (`dashing`,
    `specialCd`, `grenadeStock`, `spellCds`), so no engine hooks were needed.
    Breakable dummies are training dummies with `breakable` set (no refill,
    no `hpFloor`).
  - It runs in a training room (no doors), with the Stygian Blade.
    `world.tutorial` marks the mode; dying stands you back up.
  - The end screen offers Begin Run or the title screen, and points at the
    Training Ground.
- `hudAnchor(id)` and `chargeRowAnchor(id)` in `ui.js` report where an ability
  is on screen right now (touch button, ability bar or spell row), for any
  future hint that needs to point at the HUD.

### 16.8 Step 5 — dummy health, the Kobold Sapper, and cutting shots (built; owner testing)

- **Dummy health** (Training Ground panel): 100 / 500 / 1000 (default) / 3000 /
  Endless. A dummy with a set health can be broken: it pops "BROKEN in 3.2s"
  (time from its first hit), the meter keeps it as *last break*, and it stands
  back up where it was 1.5 s later. Endless dummies behave as before. The
  dummy def has `noCorpse` (checked in `killEnemy`), so a Vetala never raises
  straw.
- **Kobold Sapper** (`sapper` in `enemies-folk.js`) — role **artillery**, a
  Hades-style bomber from German mining lore. r 16, hp 48, cost 4,
  `minDepth` 2, damage 13, at most 2 a wave (`ROLE_CAP.artillery` 2).
  - Holds 260–440 units off, strafes, and scuttles back (0.26 s hop, 3.2 s
    cooldown) when you get inside 150.
  - Every 2.6–3.4 s: 0.55 s wind-up with the charge raised overhead, then a
    lobbed **blasting charge** at your position (elites throw three in a
    spread).
- **Blasting charge** (new hazard kind `charge`, `hazards.js`): a shell in the
  air for 0.8 s, then a bomb with a fizzing fuse for 0.9 s, then a 74-radius
  blast. The floor marker fills over the whole 1.7 s. **Strike it** (in the
  air or on the ground) and it is kicked: it flies 0.42 s to the nearest enemy
  roughly along the strike (or 260 units straight on) and blows up on enemies
  only, for `max(30, 2.5 x damage)`. `strikeCharges(hits, angle)` is exported
  for any future kickable bomb.
- **Cutting shots:** every player melee hitbox now strikes any **hostile
  projectile** it touches out of the air — boss shots included. The shot is
  removed like a boss wipe (`pr.cleared`, so no expiry effect: a splitting orb
  does not split) with a spark in its colour and a throttled block sound.
  Friendly projectiles (arrows, spells) break hostile ones too, spending
  themselves unless they pierce. A projectile flagged `unbreakable` is exempt
  (nothing sets it yet; it is there for a future mechanic that must not be
  cut). Hazards (lanes, rings, beams, blasts) are not projectiles and still
  have to be dodged.
- **Balance note:** this makes bullet-heavy bosses easier for melee builds.
  The owner asked for it; watch Vesper, the Peacock, the Maestro and the Bride.

- **No blood (owner, 2026-09-18):** the coloured floor stains left by kills
  read as blood and were removed. Bodies are now drawn **only while a Vetala is
  in the room**, as a pale dashed spirit outline. The Adze's bite spray and
  belly are ember gold instead of red.

### 16.9 Step 6 — custom boss arenas: the Mire (Mawgrim, the crocodile)

The owner wants a custom arena for every guardian, starting with the croc.
`v5/src/arena-mire.js`, wired as the croc spec's `drawArena` and a new
**`arenaTick(room, dt)`** hook that `updateRoom` calls every frame for the
room's boss spec (from the intro until you leave, so the water keeps moving
after the fight).

- **Live water:** a height field on a 10-unit grid, the 2D wave equation
  (`vel += C2 * laplacian`, `C2` 0.24, damping 0.984 per step, ~300 u/s wave
  speed). Pillars pin the surface so ripples **reflect** off them and the walls.
  Painted one pixel per cell into a small `ImageData`, lit by the surface
  slope (light from the top left, a specular kick on steep crests, a gentle
  time-based swell), then scaled up with smoothing over the floor. Cheap on
  phones: ~6k cells.
- **Everything disturbs it:** the player's steps and dashes (by speed, plus a
  crisp ring every step, faster while dashing), every enemy's wake (by speed
  and size), and ambient drips so the swamp is never still.
- **Mawgrim's moves on the water:** jaw snap slams a splash ahead of him; tail
  sweep throws a ring out and churns behind the tail as it spins; the death
  roll ploughs a bow wave down the lane and crashes at the wall; phase change
  and death are huge upheavals.
  - **Submerge**, the set piece: the water closes over him as he sinks, a
    **bow wave** heaps up over him as he glides beneath (the surface shows
    where he is), bubbles boil up faster and faster over the marked spot, then
    he erupts in a column of spray with rings racing outward.
- **Dressing:** lily pads that ride the waves (they slide off crests, bob, spin
  and get shoved aside by anyone wading through), reeds and cattails along the
  walls and mangrove roots in the corners (drawn once to a canvas), drifting
  floor mist, fireflies, a slow moonlight sheen, and **wading rings** at
  everyone's feet so they stand *in* the water.
- **Owner feedback:** loved the water physics; lily pads were distracting, so
  there are now **two**.
- **Cosmetic only:** no slowdown or other gameplay change; the croc's
  telegraphs are unchanged.
- **For the next arenas:** `arenaTick` + `drawArena` on a spec is the pattern,
  and `mireSplash / mireRing / mireWake / mireBubble` show how a boss's moves
  can talk to its arena.

### 16.10 Step 7 — the Drowned Vault (Gravemaw) and the Broken Peak (Kharn)

**The water engine** (`water-engine.js`): the Mire's simulation turned into a
factory, `createWaterArena(config)`, returning `tick`, `draw` and the helpers
`splash`, `ring`, `wake`, `bubble`, `vortex` (plus `disturb`, `addRipple`,
`heightAt`, `swirlAt`). An arena supplies its `shade(d, p, tone, light, lap,
x, y, time, solid)` per-pixel colour and optional `floor` (drawn under
translucent water and bent by `refract`), `deco`, pads, flies, mists, drips,
sheen, ripple colour, and hooks `onBuild`, `onTick`, `onDrawFloor` (under the
water), `onDrawWater` (on it), `onDrawOver`. **The Mire** is now one config of
it with exactly its old values (`arena-mire.js`); its exported names are
unchanged. `lob()` in `boss-kit.js` now returns its hazard and takes
`onDetonate`.

- **Whirlpools** (`vortex`): the eye is pressed down and two arms turn round
  it at 0.62 r, throwing spiral waves; foam arms are drawn turning; floating
  things (pads, bubbles, fish) are swept round via `swirlAt`. It can `follow`
  an entity and fades out when `until()` returns true.
- **Refraction:** the floor is drawn once, then re-drawn only in 20-unit blocks
  where the surface slopes, each shifted by the slope (cheap: only where waves
  are).

**The Drowned Vault** (`arena-vault.js`, Gravemaw):
- Clear blue water, translucent in the shallows, over a carved vault floor:
  stone slabs, a great nautilus-shell mosaic, scattered gold coins, gems and
  broken amphorae. Crawling **caustics** (a sharpened interference net) plus
  light focused where waves curve inward.
- Life: bubbles rising from floor vents and **off his shell** (faster while he
  spins or gathers the tide) and from the player's dash, each popping with a
  ring; fish that dart away from anyone near; weed swaying along the walls;
  slanting light shafts with drifting motes; toppled columns ringed in foam
  and barnacles along the rim.
- His moves: bite splashes ahead; each stomp is a real wave across the vault
  plus a cloud of bubbles; **Shell Spin raises a whirlpool that follows him**
  until the move ends, with a bow wave and a splash at every wall bounce;
  mortar shells splash down; every Tidal Ring pulses through the water; phase
  change and death are huge upheavals.

**The Broken Peak** (`arena-peak.js`, Kharn) — a new engine for ash:
- An **ash depth grid** (8-unit cells) over black basalt, painted like the
  water (one pixel per cell, lit by the ash's slope, alpha from depth so thin
  ash shows the rock). Drifts heap against walls and pillars. Ridges slowly
  slump and falling ash refills everything below 0.55, so marks fade over
  about half a minute.
- **Footprints** for everything that walks it (the owner's favourite idea):
  the player leaves alternating boot prints, small enemies paw prints, and
  **Kharn knuckle-walks**: a four-knuckle fist print on one side and a broad
  foot with a thumb-toe on the other, with a puff of dust each stride. Prints
  are crisp decals (dark hollow, pale lip) and dent the grid too. A dash
  ploughs a furrow instead.
- **Glowing veins** in the rock under the ash show wherever it is swept away,
  pulsing; brighter when he enrages (the whole arena heats: more embers, a
  stronger red glow).
- **Slams** (`peakSlam`): a crater with a raised rim, 6–10 **cracks** that
  grow outward in 0.18 s, glow white-hot to orange and cool to dark grey over
  ~6 s (longer when enraged), a torus of dust racing outward, a shock ring
  across the ash and a gust that blows the falling ash away.
- Falling ash with embers, riding a wandering wind; roars blow it outward.
- His moves: crouch kicks up dust; take-off dents the ash; **landing is a full
  slam**; each Ground Pound fist and each thrown boulder is a small crater and
  a crack; the Knuckle Rush ploughs a furrow with cracks glowing behind him
  and slams the wall; the Thunder Clap sweeps the ash off in a cone; roars
  gust; phase changes and his death are the biggest slams.
- Rim: jagged ash-capped rocks and charred stumps.

All cosmetic; the fights play the same. Static checks only; the owner tests.

**Owner feedback, first test:**
- Peak: footprints looked unnatural for our figures (no human feet), so the
  player and the small foes now leave a **trail**. After a second round of
  feedback ("too sharp, make it like the dash trail") it is exactly the dash
  furrow, `peakPlough` at depth 0.3 instead of 0.6, every 6 units: soft,
  drawn only by the ash grid, no hard-edged decal, and it fills back in as ash
  falls. Only Kharn, who has hands and feet, still leaves prints.
- Vault: ripples caught too much light and read like attacks. The Vault now
  uses `light` 0.8, capped blue-tinted glints instead of white crests, much
  less wave-focused caustic, and crisp ripple rings at 40% alpha in a muted
  blue (`rippleAlpha`, a new engine option).
- The owner loved the Vault's calmer light and asked for the same in the Mire:
  `light` 0.8, capped swamp-green glints (no white crests), ripple rings at
  40% alpha in a muted green.

### 16.11 Folk enemies not built yet

Kappa (grappler), Jengu (healer), Preta (projectile eater), Aleya (lure),
Chochin-obake (fodder that splits), Duende (thief), Draugr (rises once by
itself). Mini-bosses: Tengu the Mountain Fencer, Nuckelavee, the
Hundred-Demon Parade, Kikimora of the Rafters, Baba Yaga's Hut, the Clay
Guardian.

---

## 12. Glossary

| Term | Meaning |
| --- | --- |
| Chamber / depth | A room. V4: chambers 1…`FINAL_DEPTH` (29 with 14 guardians), with guardians on odd chambers from 3. V2: 15 chambers, bosses at 3/6/9/12/15 |
| Effective depth | `effDepth(d)`: the run mapped onto the measured 8-chamber difficulty curve (the last chamber plays like chamber 8) |
| Loop | Continuing past the final boss via Press Deeper; everything scales up (V4 also reshuffles the guardians) |
| Elite | A stronger enemy variant with a gold ring (V4: the fight chambers nearest eff 3.5 and 6.5) |
| Guardian pool | `BOSS_POOL` (`v4/src/boss-pool.js`): every boss a V4 run fights, in a shuffled order |
| Boss slot / tier | Slot = which guardian of the run (0…N−1). Tier = slot × 3/(N−1): HP ×1–1.9, damage ×1–1.3, shorter rests (and faster bullets for the original four) |
| Barrage | A boss's dense signature pattern; long cooldown, usually ends EXPOSED |
| Exposed | A boss's punish window: stopped, gold halo, takes ×1.35 damage |
| Hazard | A telegraphed non-projectile attack in `world.hazards` (blast, lob, shockring, beam, cone, lane) |
| Boss Trial | A practice fight against one boss from the title screen (V4: tier 1, 3 boons, 2 spells); nothing banked |
| Versions | V1 `v1/` (frozen 8-chamber game), V2 `v2/` (15 chambers), V3 `v3/` (elements experiment), V4 `v4/` (the default at the site root; current work) |
| Life / revive | 3 per run; dying with a spare stands you back up at full HP (`revivePlayer()`) |
| Boon | A stacking run upgrade from one of 5 gods, chosen at boon doors |
| Spell door | V4: a door that offers a new spell or a level-up (4 slots) |
| Darkness | Meta currency: gold banked at the end of every run |
| Mirror of Night | Meta shop for permanent upgrades |
| Telegraph | The readable wind-up pose or marker before an attack |
| Hitstop | A brief freeze of the simulation on impact; bosses with a musical clock keep time through it via `realTick` |
| Trauma | 0..1 screen-shake energy; also drives gamepad rumble |
| World units | Logical coordinates (a 1280×720 view); scaled to the screen by `view.scale` |
| Intensity | Music level: 0 calm, 1 combat, 2 boss. A boss can replace the track with its own (`band.takeStage()`) |
