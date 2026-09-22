# Ashfall

A top-down action roguelike in the spirit of Hades, built to run in a phone
browser and on desktop. It is vanilla JavaScript ES modules, Canvas 2D and
WebAudio:

- **No engine, no framework, no build step to play.**
- **No art or audio files.** Every character, arena and texture is drawn by
  code, and every sound and piece of music is synthesised at runtime.

The long-term goal is a mobile release (Google Play). Today it's a playable,
fairly large prototype: 14 guardian bosses, 7 weapons, 13 spells, a Training
Ground, a tutorial, and a small open world with its own quest.

- **Play online:** <https://vinayak-sutar.github.io/mobile-game/> (opens
  Version 4; Version 5 is at `/v5/`)
- **Developer journal:** [`DOCUMENTATION_JOURNAL.md`](DOCUMENTATION_JOURNAL.md),
  the full design and engineering record. Start at §0 (TL;DR), then §15
  (the Version 4 handover) and §16 (Version 5, step by step).
- **Ideas backlog:** [`IDEAS.md`](IDEAS.md)

---

## Versions

Every version is a self-contained folder with its own save, service worker
and cache. Every title screen has a switch to move between them.

| Version | Folder | What it is |
| --- | --- | --- |
| **5** | `v5/` | **Where current development happens.** Version 4 plus new weapons, folk-tale enemies, custom boss arenas and music, the Training Ground, a tutorial, and **The Wilds**, an open-world mode. |
| 4 | `v4/` | The default at the site root. Every guardian in one run (29 chambers), simple spells from Spell doors, 3 lives. |
| 3 | `v3/` | An experiment with elements, reactions, parry and traps, since set aside. |
| 2 | `v2/` | The 15-chamber game: four creature bosses, then the Warden of Ash. |
| 1 | `v1/` | The original 8-chamber prototype. Frozen. |

The rest of this README describes **Version 5** unless it says otherwise.

---

## What's in Version 5

### Runs (the roguelike)
- Chambers 1–2 are fights. From chamber 3 on, fights and **guardian**
  chambers alternate.
- Every guardian in the pool is fought once per run, in a fresh random order,
  so 14 guardians make 29 chambers. Beating the last one wins; **Press
  Deeper** loops the run, harder.
- **Doors** pay out a boon, health, gold or a spell. **3 lives** per run.
- Gold is banked as *darkness* win or lose, and spent in the **Mirror of
  Night** on permanent upgrades.
- **Boss Trials:** fight any guardian on its own, for practice. Nothing is
  banked.

### Guardians (14)
All of them follow the same **"hard but fair"** contract:
- Every attack has a pose, a sound and usually a floor marker before it lands.
- Each guardian has one dense barrage, on a long cooldown, and every barrage
  has a way through.
- Bullets are slower than you.
- Barrages end with the guardian **EXPOSED**, taking extra damage: that's
  your window to punish.

| Guardian | Signature |
| --- | --- |
| Gravemaw the Shellback (turtle) | Tidal rings. Fought in the **Drowned Vault**, a flooded arena with a live water simulation. |
| Mawgrim, the Mire King (crocodile) | Death rolls, submerged ambushes. Fought in **the Mire**, a swamp with rippling water. |
| Kharn, the Ashen Silverback (gorilla) | Leap slams and boulders. Fought on **the Broken Peak**, where footsteps leave trails in the ash. |
| Solenne, the Hundred-Eyed (peacock) | Feather mines and prism beams. Fought in **the Peacock Court**, with a theme in Raag Desh. |
| Deadeye Vesper (gunslinger) | A six-shot cylinder, reload windows, High Noon duels. Fought in **Dust Gulch**, with its own western theme. |
| Nagaraja (serpent) | Her body is a wall you dash over; splits into a hydra. |
| The Twin Wardens (duo) | A lancer and a hammer; the order you kill them changes phase 2. |
| Ser Aldric (knight) | An honour duel: bow or break the oath, then spare or execute him. |
| The Weeping Bride (ghost) | Hidden outside lantern light; mirror copies. |
| Echo of the Monkey King | Borrows the moves of guardians you've already beaten. |
| The Maestro | Attacks land on the beat of a live score. |
| Mau, the Nine-Lived (cat) | Nine lives, each adding a legend's moves. |
| Kwaku Anansi (spider) | Story chapters: python, hornets, leopard, gum doll. |
| The Warden of Ash | The original final boss. |

The Grandmaster (a chess boss) exists but is on hold, outside the pool.

### Weapons (7)
Each has a basic attack and a special.
- **Heart-Seeker** (bow): charged, piercing shots.
- **Stygian Blade:** a 3-hit combo and a spin.
- **Eternal Spear:** piercing thrusts and a thrown spear.
- **Shield of Chaos:** bashes that deflect bullets, and a ricochet throw.
- **Earthbreaker Maul:** a heavy charged slam and the Skyfall Leap.
- **Deadeye's Blunderbuss:** shells, a reload button, and a crit on the last
  shell.
- **Marshal's Longarm:** a scattergun with a scoped rifle, aimed by hand.

### Spells (13)
Spells are learned from Spell doors (in The Wilds, from camps and guardians).
Each has **4 slots and levels 1–3**: Fireball, Dragon's Breath, Meteor
Shower, Frost Nova, Ice Shards, Chain Lightning, Minor Missiles, Gale,
Corrosive Siphon, Aegis, Sigil of Stillness, Singularity and Earthen
Bulwark. You can rearrange slots in the pause menu (drag and drop, tap two
slots, or on PC hover a spell and press 1–4).

### Enemies
- **7 base types:** Wretch, Slinger, Brute, Charger, Bomber, Splitter,
  Spitter.
- **8 folk-tale enemies from world mythology,** each built to teach one skill
  and each with a counter you can find on purpose: Chinthe, Adze, Vetala,
  Kobold Sapper, Kappa, Preta, Draugr, Duende.

### The Wilds: an open-world mode
**Being rebuilt as a large souls-like world, in steps.** The land itself is
in: guardians, lamps, fights and progression arrive in the next steps.

- **Size:** a main island of 36,000 × 24,000 units (about 3–4 minutes to
  cross on foot) and **Saltwind Isle** off its east coast, joined by a long
  bridge, all in a sea: the world ends at a coastline, not a wall. (Ships are
  planned.)
- **Fourteen regions** round the Ashen Heartland, each with its own ground,
  trees, weather and colour: the Webwood, Mirror Lake, the Dust Gulch, the
  Blackwater Mire, the Gilded Deep, the Echo Cliffs, the Sunken Sands, the
  Broken Peaks, the Coil Gorge, the Hollow Moors, Cloud Summit, the Great
  Bridge and the Moon Citadel.
- **The layout is fixed**, the same on every visit, so it can be learned.
  Hand-placed roads, rivers with bridges where roads cross, lakes, a sea
  coast, and a chasm that only the Great Bridge crosses. The fine detail
  (trees, boulders, flowers, grass) grows from a fixed seed.
- **Height, without fences:** plateaus have a cliff face to the south
  (several stairs up it, and you can hop down anywhere, or dash off to land a
  plunge) and open slopes on the other three sides. Tiers stack: the volcanic
  Broken Peaks are three, and the blossoming Cloud Summit four. Sky bridges
  join the Peaks, the Moon Citadel and the Summit over the chasm. High ground
  reveals more of the map.
- **Live water:** lakes, rivers and the sea move like the flooded boss
  arenas: waves lap the shore, fish rise, and you can wade the shallows,
  leaving ripples.
- **Ground:** fifteen painted types, including volcanic ash, swamp mud, a
  frozen lake, palace marble, water and the chasm. A live grass field, and
  prints in snow, ash and mud.
- **Map:** a minimap window round you, and a full-screen map (Tab, tap the
  minimap, or the DualSense touchpad). Fog of war covers it until you have
  walked there. Drag to pan, zoom in two steps.
- **Souls-like core:** kindle **Ashlamps** (23 of them) by walking up; stand
  still at one to rest: health, all three lives and cooldowns back, and it
  becomes where you wake. Spend **Cinders** there on four attributes (Vigor,
  Might, Grace for dashes, Attunement for spell slots), travel between
  kindled lamps, and attune your spells. Fall with no life left and your
  Cinders stay where you fell as a **smoulder**. The journey saves itself;
  Continue from the Wilds screen.
- **Thirty places to fight through:** forts with watchtowers, villages
  with bell towers, stepped temples, terraced quarries, war camps,
  graveyards, canyon passes with archers on the ledges, ruined keeps and
  hedge gardens. Enemies hold posts all through each one and never leave
  their ground; nothing locks you in. A named **champion** at each place's
  heart fights you in a closing ring and guards a reliquary with a spell.
  Between the places: smaller fights (a ring of stones, a palisade, ruins)
  and **patrols** walking the roads. Resting brings them all back.
- **Enemies as figures:** with the Wanderer, every enemy is a little
  character that walks and winds up in 8 directions:
  - Goblin Cutthroats and Skeleton Archers;
  - Boar-folk Brutes with mauls and Bull Raiders;
  - Imp Firebrands with lit kegs, Mushroom-folk and Frog Shamans;
  - Lion Guards with shields and spears, and Firefly Imps;
  - corpse-spirits, Rat-folk Sappers, Kappa and Hungry Ghosts;
  - Draugr and gnome thieves.

  (`v5/figures-preview.html` shows them all.)
- **New creatures:**
  - Crossbowmen whose aiming line locks on;
  - Necromancers who raise skeletons;
  - the hopping Jiangshi, blind to you if you hold your breath;
  - Zealots whose wards halve damage;
  - Wolf-folk packs roused by a howl;
  - Tengu that dive from the sky onto their shadow;
  - Banshees whose keening fills a cone;
  - Skeleton Spearmen.
- **Music of the Wilds:** each land has its own piece in a raga (Bhupali,
  Maand, Malkauns, Bhairav, Yaman, Durga), played on modelled piano,
  electric piano, music box, kalimba, marimba and harp. A fight adds a drum
  layer, and crossing a border fades one piece into the next. The **Music
  Room** on the title screen plays them all and lets you pick the instrument
  that plays each tune.
- **Dungeons (demo):** go down the ruined stair near the Wilds' start (or
  "Dungeon (demo)" on the title screen) into the Sunken Catacomb:
  - three floors joined by stairs;
  - a narrow walkway over a chasm, where a fall drops you into the Ossuary
    below;
  - wave spikes, dart plates, fire vents, crumbling tiles and pendulum
    blades;
  - levers, a drawn bridge, a shortcut gate, the Bone Key and a great door;
  - the Catacomb Warden at the bottom.
- **Mini-bosses:** eight named foes hold places across the Wilds, each with
  a bar of its own, a second phase and a rich reliquary:
  - Kyubi, the Nine-Tailed, and Sasaki, the Wandering Blade, on Cloud Summit;
  - the Oni Warlord, the Bone Captain, the Alpha and the Bandit Queen;
  - the Bog Hag and the Hierophant.

  Ronin, kitsune and ninja walk the Summit's roads.
- **Cloud Summit, in blossom:** a Japanese mountain. Tunnels of red torii
  climb its roads, stone lanterns glow and red paper lanterns hang along the
  way, and cherry trees drop petals onto the wind and around your feet. At
  the top is a shrine with a great gate, and the village has curved tiled
  roofs.
- **Lairs (all 14):** each guardian waits in a lair of its own:
  - the Drowned Vault on Mirror Lake's island;
  - the Story-Tree in the Webwood;
  - Last Chance, a ghost town in the Gulch;
  - the Sinkhole in the Mire;
  - the Peacock Court atop the Gilded terraces;
  - the Echoing Amphitheatre on the sea cliffs;
  - the Nine Tombs in the Sands;
  - Kharn's Caldera atop the Broken Peaks;
  - the Serpent Temple behind the Coil Gorge's waterfall;
  - the Frozen Chapel on the Moors' ice;
  - the Highest Shrine on Cloud Summit;
  - the Twin Wardens' gatehouse on the Great Bridge, the only way into the
    Moon Citadel (the sky bridges stay sealed until they fall);
  - the Moon Keep.

  Walk into the fog gate and there is no leaving until one of you falls.
  Win, and the guardian's **Remnant** is yours (one of thirteen for the
  Ashen Gate), with a heap of Cinders and a spell. An Ashlamp waits outside
  every lair. Set all thirteen Remnants and the **Ashen Gate** in the
  Heartland opens on the Warden of Ash, the last fight of the Wilds.
- **Streaming:** only the land near you exists at any moment: detail in
  2048-unit sectors, walls in a spatial hash, and collision against an
  active set. That is what lets a world this size run on a phone.
- **Pause menu:** switch to **any weapon at any time**.

### Characters
The same moves and animations, drawn two ways:
- **The Hooded One** is seen from straight above and turns with your aim.
- **The Wanderer** stands upright in The Wilds' 3/4 view: straw hat, rust
  coat, bedroll, and a scarf in your weapon's colour. Its walk uses held key
  poses and legs with real knees.

**Auto** (the default) uses the Wanderer in The Wilds and the Hooded One in
chambers. You can switch from the title screen or any pause menu.

### Practice and settings
- **Training Ground:**
  - Swap weapons and spells freely.
  - Spawn any enemy.
  - Straw dummies with set health, which time how long it takes to break
    them.
  - A damage meter, free casts, invincibility.
- **Tutorial:** an optional chamber that teaches one control at a time,
  offered before the first run.
- **Settings** (title screen and every pause menu):
  - character;
  - **move speed** (60–120%, default 85%);
  - music volume;
  - fullscreen;
  - mute.
- The game survives the phone switching apps: it auto-pauses, resets input
  and rebuilds graphics lost when the app was in the background.

---

## Controls

**Touch:**
- Drag on the left half to move (a floating stick).
- Buttons: `ATK` attack, `DASH`, `SPEC` special, `BOMB` grenade, the spell
  buttons, `RLD` reload (guns), `II` pause.
- Drag from `BOMB` to aim a throw, or from `SPEC` to aim the Longarm's scope.
- Attacks aim at the nearest enemy automatically.

**Keyboard and mouse:**
- `WASD` move; the mouse aims.
- Left click, `J` or `E`: attack.
- Right click, `K` or `Shift`: special.
- `Space`: dash.
- `Q`: grenade (right click cancels a throw).
- `R`: reload.
- `1`–`4`: spells.
- `Esc` or `P`: pause. `M`: mute. `F`: fullscreen.

**Controller** (any standard gamepad):
- Left stick moves; **right stick aims** (true twin-stick).
- `R2` attack, `L2` special, `R1`/`L1`/`✕` dash.
- `R1` + a face button casts a spell.
- `Options` pauses.
- Menus are fully navigable with the pad.
- **DualSense extras** over WebHID (desktop Chrome/Edge, secure context
  only): the lightbar follows your weapon and health; the adaptive triggers
  add weight per weapon. **Controller Check** on the title screen shows live
  diagnostics.

The game plays in **landscape**. Starting a run on a phone goes fullscreen
and locks the orientation. Where a browser can't lock it (iPhone), a
"turn your phone" prompt waits.

---

## Running it

```bash
python serve.py
```

The server prints a **local** URL (`http://localhost:8000`) and a **phone**
URL (`http://<this-PC's-LAN-IP>:8000`) for any device on the same Wi-Fi. The
LAN IP changes when the PC joins a different network, so use the one printed
each time. The root opens Version 4; Version 5 is at `/v5/`.

If the phone can't connect, Windows Firewall is usually blocking the port:

```bash
netsh advfirewall firewall add rule name="Ashfall dev" dir=in action=allow protocol=TCP localport=8000
```

Node alternative: `npx --yes serve -l 8000 .`

`python serve.py --https` serves on :8443 with a self-signed certificate, for
the features that need a secure context (DualSense lightbar and triggers) on a
LAN address. The certificate lives in `.certs/`, which is never committed.

### Online and sharing
- **GitHub Pages** serves the repo root as-is (there's a `.nojekyll` file).
  Pages is HTTPS, so fullscreen, wake lock, the installable PWA and WebHID
  all work there.
- **Installable PWA.** Each version has a manifest and a network-first
  service worker. "Add to Home screen" on Android gives a full-screen app
  that works offline.
- **Is the phone on the latest build?** Version 5's title screen shows its
  build number and checks it against the copy on GitHub Pages ("up to date",
  or "build N is on GitHub" in gold). The button next to it (Force refresh /
  Update) clears that version's offline copy, re-downloads every script from
  the server and reloads. The number lives in `v5/src/build.js` and is bumped
  by a git pre-commit hook on every commit that touches `v5/`; install the
  hook once per clone with `python tools/bump-build.py --install`.
- **Single-file build:** `npm run build` bundles **Version 4** with esbuild
  into `dist/ashfall.html`, a standalone file you can double-click to play.
  It also produces `Ashfall.zip` and `Ashfall-web.zip` for messaging apps and
  itch.io.

---

## How it's built

```
index.html        redirect to v4/ (and retires an old service worker)
serve.py          LAN dev server (no-cache; optional HTTPS)
build.mjs         single-file build of Version 4
v5/
  index.html      shell, CSS, DOM menu overlay
  sw.js           network-first service worker (cache ashfall-v5-*)
  src/            69 ES modules, ~35,000 lines
```

**Version 5 modules, grouped:**

| Area | Files |
| --- | --- |
| Loop, menus, modes | `game.js` (the loop, the run's states, every menu, Boss Trials, the Training Ground, The Wilds' flow), `state.js`, `save.js` |
| Player | `player.js`, `weapons.js`, `grenade.js`, `spells.js`, `boons.js`, `rigs.js` and `anim.js` (the skeleton and its animation), `wanderer.js` (the Wanderer's look and walk) |
| Combat | `combat.js` (all damage flows through it), `projectiles.js`, `hazards.js`, `spawn.js`, `ai.js` |
| Enemies and bosses | `enemies.js`, `enemies-folk.js`, `enemies-folk2.js`, `enemy-rigs.js`, `boss-kit.js` (the shared boss brain), `bosses.js`, `boss-pool.js`, `boss-*.js` (one or more files per named guardian), `boss-rigs.js` |
| Boss arenas | `water-engine.js` (a 2D wave-equation water surface), `arena-mire.js`, `arena-vault.js`, `arena-peak.js`, `arena-gulch.js`, `arena-palace.js` |
| The Wilds | `wilds-layout.js` (the hand-placed world: regions, roads, water, heights), `wilds-world.js` (building and streaming it, the fog), `wilds-draw.js`, `wilds-map.js` (minimap and full map), `terrain.js` (painted ground, lazily classified and baked in chunks), `grass.js` (the grass simulation) |
| Chambers | `rooms.js` (run structure, waves, doors), `biomes.js`, `texture.js` |
| Practice | `training.js`, `tutorial.js` |
| Audio | `audio.js` (synthesised effects, the adaptive music, the `band` voices), `music-kit.js`, `music-samples.js` (plucked strings, tabla, reverb), `music-western.js`, `music-desh.js` |
| Input and platform | `input.js`, `gamepad.js`, `dualsense.js`, `fullscreen.js`, `ui.js` (the canvas HUD and touch controls) |
| Helpers | `fx.js` (particles, shake, hitstop, damage numbers), `util.js`, `bake.js` (export rigs to PNG sprite sheets) |

**Key techniques:**
- **Fixed-timestep simulation** at 60 Hz, rendered every animation frame.
- **Everything procedural:**
  - skeletal rigs with keyframe clips, and a weapon arm driven by the
    attack state machine (so the swing always matches its hitbox);
  - value-noise textures;
  - the water surface, a simulated height field;
  - the terrain, painted per pixel in chunks as they come into view;
  - the grass, thousands of damped springs, drawn in batches.
- **Music and sound:** synthesised in WebAudio, with plucked strings built
  from Karplus-Strong synthesis, a modal tabla and a room reverb. The music
  follows the fight, and some guardians bring their own themes.
- **Mobile first:**
  - a fixed logical height with width following the screen's shape;
  - touch controls laid out for thumbs;
  - lower grass density on touch screens;
  - graphics rebuilt after the phone reclaims the GPU.

---

## Testing and debugging

- **Static checks** before every commit:
  ```bash
  for f in v5/src/*.js; do node --check "$f"; done
  npx --yes esbuild@0.25.0 v5/src/game.js --bundle --format=iife --outfile=/dev/null
  npx --yes eslint@8.57.0 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module,ecmaVersion:2022 --rule '{"no-undef":"error"}' v5/src/*.js
  ```
- **Playtesting** is done by hand on an Android phone and a PC.
- **Console handle.** The page exposes `window.ashfall` to drive the
  simulation without waiting for animation frames. For example:
  `ashfall.startRun(ashfall.WEAPONS[0])`, `ashfall.spawn('brute')`,
  `ashfall.trial('peacock', 0)`, `ashfall.run(300)`,
  `ashfall.world.damageLog`. Earlier versions were balance-tested with
  scripted bots through this handle (see journal §6–§7).

---

## Known limits

- **Pathfinding:** enemies steer straight at you and slide along cover.
- **Balance:** measured with bots for the older content; the newer guardians,
  weapons and The Wilds still need playtesting. The Wilds is mid-rebuild:
  the land is in, and its fights, lamps and saving come next.
- **Art:** everything is procedural. That reads well at this scale but isn't
  a final art direction.
- **Hardware:** the DualSense lightbar and adaptive triggers are unverified on
  hardware, and WebHID is desktop Chromium only.
- **Build:** the single-file build targets Version 4, not Version 5.
- **Business:** no ads, in-app purchases or analytics yet. This is the
  gameplay core.
