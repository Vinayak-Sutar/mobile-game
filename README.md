# Ashfall

A top-down action roguelike prototype — Hades-shaped, built to run in a phone
browser. Vanilla JS + Canvas 2D, no build step, no dependencies, no art or
audio assets (everything is drawn with shapes and synthesised with WebAudio).

## Run it

```bash
python serve.py
```

The server prints two URLs. Open the **phone** one on any device on the same
Wi-Fi. The game plays in landscape. Use the address the server prints
each time — a PC's LAN IP changes whenever it joins a different network:

```
  local     http://localhost:8000
  phone     http://<this-PC's-LAN-IP>:8000
```

If the phone can't connect, Windows Firewall is almost certainly blocking the
port — allow Python on private networks, or run:

```bash
netsh advfirewall firewall add rule name="Ashfall dev" dir=in action=allow protocol=TCP localport=8000
```

Node alternative, if you'd rather not use Python:

```bash
npx --yes serve -l 8000 .
```

## Play it online

The repo is set up for **GitHub Pages** with no build step: Settings → Pages →
*Deploy from a branch* → `main` / `(root)`. The game is then at
`https://vinayak-sutar.github.io/mobile-game/`.

Pages serves over HTTPS, which is a secure context — so fullscreen, wake lock,
the installable PWA and the DualSense WebHID features all work there, with none
of the LAN-address workarounds described below. `.nojekyll` is present so Pages
serves the files as-is.

## Sharing it

ES modules don't load over `file://`, so the source folder always needs a
server. To hand someone a copy that just *works*, build the standalone file:

```bash
npm run build
```

That produces:

| File | Use |
| --- | --- |
| `dist/ashfall.html` | One ~370 KB file, no dependencies. Double-click to play. |
| `dist/upload/index.html` | Same file, named for static hosts. |
| `dist/HOW-TO-RUN.txt` | Plain-text instructions for whoever you send it to. |
| `Ashfall.zip` | The `.html` + instructions, zipped for messaging apps. |
| `Ashfall-web.zip` | Zipped for an itch.io HTML5 upload. |

To put it online instead, drag `dist/upload/` onto
[Netlify Drop](https://app.netlify.com/drop), or upload `Ashfall-web.zip` to
itch.io as an HTML5 project with "play in browser" ticked.

## Controls

**Touch** — drag anywhere on the left half to move (floating stick).
`ATK` attack · `DASH` dash · `SPEC` special · `BOMB` grenade · `II` pause
(top-right). Aiming is automatic: attacks snap to the nearest enemy within
range, so you only ever steer.

**Orientation.** Landscape only. The menus work with the phone upright, but
pressing **Begin Run** goes fullscreen and locks landscape — on Android the
screen turns for you. Where that lock isn't available (every iPhone browser),
a *turn your phone sideways* prompt holds the run until you do. Tilting upright
mid-fight shows the same prompt and pauses the game, so it can't cost you a
run.

**Keyboard** — `WASD` move, mouse aims, click or `J` attack, `Space` dash,
`K` special, `G` grenade, `M` mute, `Esc` pause.

**Audio.** Music plays during runs only, and follows the fight: a calm pad
and arpeggio between waves, the full kit in combat, and a harder variation
once the Warden is up. It's on by default. **Music volume** is a slider (with
big `−`/`+` buttons for thumbs and gamepads) on the title screen and in the
pause menu — on touch, pause is the **II** button top-right. Each change plays
a short phrase so you can hear the level, since the track itself is stopped
while paused. All audio is suspended whenever the page is hidden.

Measured at the final output, the default music level is about 9–12 dB louder
than the first version (roughly twice as loud to the ear), and full volume
about 13 dB. A limiter is the last stage of the mix: without it, full music
volume plus a busy fight peaked at +2 dBFS and clipped; with it the loudest
measured moment is −0.3 dBFS.

The melody sits in the 290–600 Hz range and the bass is a filtered sawtooth,
because a phone speaker can't reproduce much below ~250 Hz. The first version
of this track was a 55 Hz sine and was effectively silent on phones.

**Controller** — any standard gamepad. Left stick moves, **right stick aims**
(true twin-stick, no auto-aim), `R2` attack, `L2` special, `R1`/`L1`/`✕` dash,
`Options` pause, `Create` mute. Menus are fully navigable: sticks or D-pad to
move the focus ring, `✕` to confirm. Rumble is driven by the same trauma value
that drives screen shake, so it scales with impact automatically.

### DualSense extras

The standard Gamepad API can't reach the lightbar or adaptive triggers, so
those go over WebHID (desktop Chrome/Edge only). Click **Link DualSense** on
the title or pause screen and pick the controller:

- **Lightbar** tracks your weapon colour, flashes red when you're hit, and
  pulses like a heartbeat below 35% health.
- **Adaptive triggers** give R2 a weight per weapon — light for the blade,
  heavy for the shield, and a draw-then-release curve for the bow. L2 goes
  completely slack while your special is on cooldown, so the cooldown is
  something you feel rather than read.

**If the lightbar button says the context isn't secure:** WebHID is only
exposed in a *secure context*. `http://localhost` counts; `http://192.168.x.x`
does **not**, so over a LAN address the browser hides `navigator.hid` entirely
and the link button cannot appear. Three ways round it, best first:

1. Play on `http://localhost:8000` on the PC the controller is plugged into.
2. Tell Chrome to trust the LAN origin: open `chrome://flags/#unsafely-treat-insecure-origin-as-secure`,
   paste your `http://<LAN-IP>:8000` address, set the dropdown to **Enabled**, relaunch.
3. `python serve.py --https` — serves on :8443 with a self-signed certificate.
   The browser warns once; click **Advanced → Proceed**.

Plain controller input, aiming and rumble work fine over LAN HTTP — only the
lightbar and adaptive triggers need the secure context.

**Controller Check** on the title screen shows all of this live: secure
context, Gamepad API, WebHID, the detected pad, its mapping, and raw axis and
button values as you press them. Start there whenever a controller misbehaves.

> The lightbar and adaptive triggers are written against the documented
> DualSense report layout but were **not verified on hardware** — no controller was available.
> Everything else (input, rumble, menus) is tested. If the lightbar doesn't
> respond, run `ashfall.probeDualSense()` in the console: it cycles the
> lightbar red/green/blue and returns the detected transport.

## The loop

Fifteen chambers: two fights, then a guardian, five times over. Clear a room,
pick one of two doors, take the reward, go deeper. Chambers 3, 6, 9 and 12
hold the four creature bosses in a different order every run; chamber 15 is
always the Warden of Ash. Gold is banked as *darkness* whether you win or die,
and spends in the **Mirror of Night** on permanent upgrades — so a losing run
still moves you forward.

- **3 lives.** Fall with a life to spare and you get back up where you fell,
  at full health, with a moment of invulnerability. Hearts next to the health
  bar show what's left.
- **Two versions.** The title screen switches between **Version 2** (this
  one: 15 chambers, five bosses) and **Version 1** (the original eight-chamber
  game with one boss, kept as-is in `v1/` with its own save, plus 3 lives).
- **4 weapons.** Bow — the default, listed first — (hold to charge a piercing
  shot, volley special), Blade (3-hit combo → spin), Spear (piercing thrusts,
  thrown spear), Shield (bashes that deflect projectiles, ricocheting throw).
- **7 enemy types + 5 bosses.** Wretch (lunges), Slinger (kites and
  shoots), Brute (telegraphed slam), Charger (line charge, stuns on wall
  impact), Bomber (suicide blast), Splitter (splits on death), Spitter
  (stationary radial bullets). Bosses below.
- **17 boons across 5 gods**, stacking: burn, chain lightning, crits, lifesteal,
  dash damage, explode-on-kill, extra dash charges, and more.
- **Dash i-frames** are the whole defensive game, and dashing cancels attack
  recovery — the same contract Hades runs on.

## Bosses

| Chamber | Boss | Moves |
| --- | --- | --- |
| 3/6/9/12 (shuffled) | **Gravemaw the Shellback** (turtle) | Beak snap · stomp + gapped shockwaves · ricocheting shell spin · lobbed barnacle volleys · **Tidal Rings** barrage |
| | **Mawgrim, the Mire King** (crocodile) | Double jaw snap · tail sweep · death roll with a mud wake · submerged ambush · hatchlings · **Mire Spray** barrage |
| | **Kharn, the Ashen Silverback** (gorilla) | Leap slams (up to 3) · boulder that bursts into shrapnel · knuckle rush that cracks the floor · thunder clap · enrages at 30% · **Ground Pound** barrage |
| | **Solenne, the Hundred-Eyed** (peacock) | Feather darts · swoop dropping feather mines · sweeping prism beams · watching-eye turrets · **Hundred-Eyed Display** barrage |
| 15 | **The Warden of Ash** | Slam, volleys, charges, summons, phase-3 bullet spiral |

**Hard but fair** is a set of rules every boss follows (top of `src/bosses.js`):
every attack has a pose, a sound and usually a floor marker first; each boss
has exactly one dense *barrage*, on a long cooldown, so it isn't every
attack; every barrage has a way through (a drifting corridor, a lattice wider
than your hurtbox, a safe flank, or the arena's pillars); bullets are slower
than you; and every barrage ends with the boss **EXPOSED** — stopped, gold
halo, taking +35% damage. That's the punish window. Phase changes and death
wipe the screen of bullets, and enemy bullets are capped at 170.

Against bullets your hurtbox is ~70% of your body, as in every bullet-hell
game: a graze that visibly misses does miss.

**Boss Trials** on the title screen lets you fight any boss on its own, with
a few boons, for practice. Nothing is banked.

## Balance

Tuned from measurement, not vibes. `world.damageLog` accumulates damage to the
player by source, so a scripted bot can be run through every chamber and the
result read off directly. The first pass found:

- Depths **3 and 6 spiked hard** — those are the elite rooms, and elite
  multipliers were compounding on top of an already steep damage ramp.
- **Brute** was the single biggest damage source (53 per 20s at depth 6); its
  slam radius was 150 in an arena only ~490 units tall.
- **Splitter** chipped relentlessly via contact damage, and its children hit
  at 60% — nearly as hard as the parent.
- **Bomber** dominated depths 2–3, when the player has no boons yet.

Changes: player 60 → 80 HP, dash recharge 0.85s → 0.75s, heal door 32% → 40%,
heal drops 8% → 14% at 16 HP. Brute slam 150 → 128 radius and 19 → 15 damage,
bomber blast 118 → 100 and 20 → 15, splitter contact 11 → 8 on a longer
cooldown, charger 16 → 13. The depth ramp was softened (1.20→1.60 across a run,
now 1.16→1.46) and elite multipliers cut (2.1x → 1.9x HP, 1.25x → 1.15x damage).

Result, damage taken per 20s of combat:

| Depth | Before | After |
| --- | --- | --- |
| 3 (elite) | 83 | 24 |
| 5 | 64 | 31 |
| 6 (elite) | 98 | 29 |
| 7 | 62 | 35 |

Twelve full bot runs afterwards: **0 wins, 12 deaths, average chamber 5.7**
(spread 3–8). A flailing bot gets two-thirds of the way and dies, which is
about right — the game still has teeth without being hopeless.

Re-measure any time:

```js
ashfall.world.damageLog   // { brute: 120, bomber: 44, ... } for the current run
```

## Layout

```
index.html          shell, CSS, DOM menu overlay
serve.py            LAN dev server (no-cache, binds 0.0.0.0)
src/
  game.js           entry point: loop, run state machine, menus
  state.js          shared mutable world + view/arena geometry
  player.js         movement, dash, attack state machine
  enemies.js        enemy roster + the Warden, each a small state machine
  bosses.js         shared boss brain + turtle, crocodile, gorilla, peacock
  boss-rigs.js      the four creature bosses, rigged and animated
  hazards.js        floor markers: blasts, lobs, shockwave rings, beams, lanes
  ai.js             movement/contact helpers shared by enemies and bosses
  weapons.js        weapon data + attack step executor
  combat.js         all damage flows through here (crits, boons, statuses)
  projectiles.js    projectiles, melee hitboxes, pickups
  rooms.js          room generation, wave pacing, doors
  boons.js          boon data + offer/apply
  anim.js           keyframe skeletal animation (bones, clips, cross-fade)
  rigs.js           player rig + animation clips
  enemy-rigs.js     all 7 enemies + boss, rigged and animated
  fullscreen.js     Fullscreen / orientation lock / wake lock / PWA
  texture.js        procedural textures (noise, stone, normal maps)
  biomes.js         four biomes: terrain params, palette, ambient motes
  grenade.js        tap-to-track / hold-to-place throws
  bake.js           renders rigs/textures out as PNG atlases
  fx.js             particles, shake, hitstop, damage numbers
  audio.js          synthesised SFX + procedural bass loop
  input.js          virtual stick + buttons, keyboard/mouse, pad merge
  gamepad.js        Gamepad API: twin-stick, rumble, menu navigation
  dualsense.js      WebHID: lightbar + adaptive triggers (optional)
  ui.js             canvas HUD, touch controls, overlay helpers
  save.js           localStorage meta progression
  util.js           math + collision helpers
```

## Grenades

Two throws off one button, separated by how long you hold it.

- **Tap** — locks on to the nearest enemy in range and *follows it in flight*.
  A guaranteed hit on one target.
- **Hold** — a reticle appears and you place the throw. Fixed point, so it can
  catch a whole group, but a moving target can walk out of it.

That split is the whole design: tap is reliable single-target, hold is riskier
and rewards reading the room.

| | |
| --- | --- |
| Damage | 60 in a 115 radius, scaled by damage boons |
| Range | 300 units, hard-clamped however you aim |
| Charges | 2, one recharging every 6s |
| Flight | 0.45s travel, then a 0.30s fuse |

Aiming is the same gesture everywhere: **drag from the BOMB button** on touch
(it becomes a mini-stick), **move the mouse** on desktop, **push the right
stick** while holding `○` on a pad.

**Why tap tracks its target rather than leading it.** The first version aimed
where the enemy would be, using its real per-frame velocity. It still whiffed
completely on a wretch — because a wretch lunges at 560 u/s from a standstill,
and no linear prediction survives that. Tracking the enemy in flight was the
only version that actually connected. Verified at 60 damage against every
enemy type, including chargers mid-charge.

## Biomes

Four selectable at the start of a run. Purely cosmetic — every biome runs the
same fifteen chambers with the same enemies and the same numbers. The balance
pass was measured against a fixed set of values and biome choice does not
quietly undo it.

| Biome | Terrain | Air |
| --- | --- | --- |
| **Emberfall** | dark basalt, thin lava seams | embers rising |
| **The Sunken Grove** | old stone under creeping moss | spores drifting |
| **Frostwake** | blue ice with fracture tracery | snow falling |
| **The Umbral Deep** | near-black void, faint starfield | slow violet dust |

Each is a data entry in `biomes.js`, not its own draw code — four copies of a
floor renderer would drift apart the first time anyone tuned one. A biome
supplies three things:

- **`floor`** — parameters for one shared generator: hue/saturation/lightness
  plus optional `veins` (ridged noise, additive, so seams genuinely glow),
  `blotch` (soft patches of a second material — moss) and `speck` (pinpoints —
  frost glitter, stars).
- **`rock`** — obstacle texture, plus a cap colour and corner radius. That
  radius is what separates a sharp ice shard from a rounded mossy boulder.
- **`ambient`** — a fixed pool of drifting motes that wrap at the arena edges.
  No spawning or despawning, so the cost is constant and it never competes with
  the combat particle budget.

Chambers darken slightly with depth within a biome, so descent still reads.
The select screen previews each one with a real tile of its own floor texture.

Adding a fifth is one object in `BIOMES`.

## Art pipeline

There are no image files in the repo — every visual is generated by code.

**Characters** are skeletal rigs (`rigs.js`, `enemy-rigs.js`) driven by a keyframe animator
(`anim.js`): bones in a parent-first hierarchy, one keyframe track per bone,
easing per segment, and cross-fades between clips. The player has `idle`,
`run`, `dash`, `hurt` and `death`. The weapon arm is *not* keyframed — it is
driven procedurally from the attack state machine, so the blade can never
disagree with the hitbox that actually deals damage.

Every enemy is rigged, and each clip is selected by that enemy's own state
machine — so the animation and the hitbox can never disagree. The telegraphs
carry the gameplay read: the wretch's jaws gape before it lunges, the brute
sweeps both fists overhead through its full 0.78s wind-up, the charger's horns
converge and drop, the bomber swells while its core throbs faster. The boss has
eight clips including a phase-transition roar.

**Surfaces** are procedural (`texture.js`): tileable value-noise fBm builds
cracked stone floors, chiselled rock for pillars, soft particle dots, and
tangent-space normal maps. Each is generated once into an offscreen canvas and
used as a repeating pattern, so the per-frame cost is one `fillRect`.

**Baking.** `bake.js` renders the rigs frame by frame into a PNG atlas plus a
JSON sidecar — the small version of the Dead Cells pipeline, with a skeleton
standing in for a 3D model. Only the +X facing is baked; the view is top-down
and the sprite rotates at draw time, so baking 8 directions would multiply the
atlas by 8 for no visual gain.

With the dev server running:

```js
ashfall.saveAssets()   // writes ./assets/*.png + player.json
ashfall.exportAll()    // same set, as browser downloads
```

Current output in `assets/`:

| File | Size | What |
| --- | --- | --- |
| `player.png` | 2048×640 | 60 frames across 5 clips, 128px cells |
| `player.json` | — | atlas: row, frame count, fps, loop flag per clip |
| `enemy-*.png` | varies | one sheet per enemy type, fitted to 96px cells |
| `enemy-*.json` | — | matching atlas per enemy |
| `floor-stone.png` | 256×256 | tileable floor |
| `floor-normal.png` | 256×256 | matching normal map |
| `rock.png` | 128×128 | pillars |
| `particle-dot.png` | 64×64 | soft particle |

Nothing in the game loads these yet — the live rig is drawn as vectors, which
is sharper and cheaper at this scale. They exist so the same characters can be
handed to another engine, or replaced by real art against a known format.

## Playing it fullscreen

The title and pause screens have a **Play Fullscreen** button, and `F` toggles
it anywhere. Starting a run on a touch device enters fullscreen automatically —
that click is the user gesture browsers require, and it's the only free one.

Fullscreen also takes a **landscape orientation lock** and a **wake lock**, so
a phone won't rotate or dim mid-fight. Both are best-effort: desktop Chrome and
all iOS browsers refuse the orientation lock, which is what the rotate-your-
device prompt is for.

The game is also an installable **PWA** — `manifest.json` plus a network-first
service worker. On Android, Chrome's "Add to Home screen" gives it an icon and
launches it with no browser chrome at all, and it works offline. That is the
cheapest route to something that feels like a real app.

### Going further, without changing engines

| Target | Tool | What changes |
| --- | --- | --- |
| Play Store | **Capacitor** | wraps this codebase; AdMob via `@capacitor-community/admob` |
| Desktop / Steam | **Tauri** | ~3 MB binaries, same web code |
| Web | itch.io, Netlify | already covered above |

The honest trade for staying on this stack: ad *mediation* via Capacitor's
AdMob plugin is weaker than Unity's LevelPlay, so expect a lower effective
eCPM. Worth it while iteration speed still matters more than revenue.

## Debugging

The page exposes `window.ashfall` for driving the sim without rAF:

```js
ashfall.startRun(ashfall.WEAPONS[0]);   // 0 bow, 1 blade, 2 spear, 3 shield
ashfall.spawn('brute');                 // any enemy type
ashfall.trial('peacock', 0);            // straight into a boss: turtle|croc|gorilla|peacock|warden
ashfall.run(300);                       // advance 300 fixed steps
ashfall.world.player.stats.damageMult = 10;
```

This is how the prototype was regression-tested: a scripted bot plays all four
weapons through all fifteen chambers and all five bosses.

## Known limits

It's a prototype, so:

- Enemies have no pathfinding — they steer straight at you and slide along
  pillars. Fine in open rooms, occasionally dumb around cover.
- Rooms are one arena size; there's no camera, the whole room is always on
  screen. That's a deliberate mobile choice, but it caps how large a room can
  get before entities become too small.
- Balance is second-pass and measured, but only against a scripted bot. It
  needs real playtesting. The bow is still the weakest weapon.
- No ads, no IAP, no analytics — this is the gameplay core only.
- No hand-drawn art anywhere. Everything is procedural, which reads fine at
  prototype scale but is not a shippable art direction.
- DualSense lightbar/adaptive triggers are untested on hardware, and WebHID is
  desktop-Chromium only. Bluetooth uses a CRC32-signed report path that is
  especially unverified; USB is the safer bet.
