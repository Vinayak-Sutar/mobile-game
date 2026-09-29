# Multiplayer for Ashfall: a Duel mode, online co-op, and the two-player
# foundation both stand on

## Context

Savi is submitted and the jam is over. The owner wants to experiment with
multiplayer in Ashfall (`v5/`): **PvE co-op** — "different devices, different
cities, totally online, MOBA-like" — and **PvP duels** that reward skill rather
than button-mashing. It lives in its own **Multiplayer** section off the title
screen, beside Begin Run and Boss Trials.

Three findings from the code decide the whole shape of this.

**1. The player is already a factory, not a singleton.** `createPlayer(weapon,
meta)` in `v5/src/player.js` holds no module state, and two extra instances
already exist and draw correctly today — the wardrobe preview (`game.js:1097`)
and the opening cinematic's hero (`cinema-opening.js:419`). Animation rigs are
per-instance (`p.anim`), and lives, boons and spells are already per-player.
**Two players is a refactor, not a rewrite.**

**2. Deterministic lockstep and rollback are off the table.** Rollback needs
every machine to reach an identical state from identical inputs. This
simulation cannot:

- **~820 RNG draws** per `util.js` wrappers, all unseeded `Math.random()`, with
  cosmetic and gameplay draws interleaved in the same call graph — enemy strafe
  flips, boss move selection, crit rolls, wave composition, boon and spell
  offers, shockring gap placement.
- **`arena` is derived from `window.innerWidth/innerHeight`** (`game.js:148`).
  Two players on differently shaped screens are literally playing in
  differently sized rooms, and `clampObstacles()` moves obstacles when a window
  resizes.
- **State does not serialise.** Entities carry `Set`s of live objects
  (`h.hits`), cross-references (`pr.owner`, `h.follow`, `e.summoner`), closures
  (`e.onDeath`, `pr.onExpire`) and function-table references (`e.def`).
- **Hidden state everywhere** outside `world`: `dungeon.js`'s `let D`,
  `wilds-world.js`'s `let W`, `fx` (including `fx.hitstop`, which freezes the
  whole sim), `input`, `tuning.speed`, `journey`, `save`.
- `Math.hypot/sin/cos/atan2` have engine-defined precision and are everywhere
  in movement and AI.

So: **host-authoritative**. One device runs the only simulation that matters;
the other sends inputs and receives state. No determinism required, and none of
the above has to be fixed.

**3. The skill layer for PvP already exists — it is buried under PvE tuning.**
Attacks lock their aim at windup and commit for 15–45 frames, with recoveries
of 7–25 frames cancellable only by a dash. That is real footsies material. What
breaks in a duel is the tuning, not the design (see Module 4).

**Settled with the owner:** no boons and no meta upgrades in PvP, but **spells
yes** — both players pick from the same set before the fight. PvP gets its own
tuning table. **Parry comes back, duels only.** Co-op is online-first, each
device with its own camera.

---

## Module 1 — The two-player foundation

Everything else sits on this. It is the bulk of the work and it is all in
`v5/src/`.

### 1.1 `world.players[]`, with `world.player` kept alive

```js
world.players = [p1, p2];
Object.defineProperty(world, 'player', { get: () => world.players[0] });
```

157 references across 36 files keep working unchanged. Then convert only the
ones whose meaning is wrong, group by group. Reuse the existing chokepoint:
**`ai.js:10 player()` — 33 calls in 7 files** — becomes `nearestPlayer(x, y)`.
Enemies gain `e.target` so they commit to one player instead of flip-flopping
mid-lunge.

### 1.2 Per-player input

`input` is a module singleton read **77 times in 7 files** (`player.js` 28,
`grenade.js` 13, `game.js` 12, `ui.js` 11, `spells.js` 5). Give each player an
`p.in` of the same shape, and make `input.js` a *source* that fills
`players[0].in`. Then `player.js`, `grenade.js` and `spells.js` read `p.in`
rather than the import. `input.js:40 srcHeld` already splits held state per
source — extend that idea rather than inventing one.

A second player's `p.in` is then filled by a second gamepad (local) or by the
network (online). Nothing else needs to know which.

### 1.3 One damage pipeline with an attacker and a target

Today there are two functions that share nothing:

| now | becomes |
| --- | --- |
| `dealDamage(e, amount, opts)` — reads `world.player.stats` for damage, crit, lifesteal, burn | `dealDamage(target, amount, { from, ...opts })` — stats come from `from` |
| `damagePlayer(amount, sx, sy, source)` — reads `world.player`, no target | `damagePlayer(target, amount, sx, sy, { from, source })` |

60 `damagePlayer` call sites in 22 files, 21 direct `dealDamage` sites plus
every melee swing through `updateHitboxes`. Mechanical, but it is the single
largest signature change in the codebase — and it is what makes PvP possible at
all, because a player becomes a damageable target like anything else.

### 1.4 Teams on hitboxes and projectiles

`spawn.js:44` already has a `friendly` flag that `updateHitboxes` **never
reads** — the loop iterates `world.enemies` unconditionally. Replace it with
`team` (`0` = players in co-op, `1` = enemies, or `p1`/`p2` in a duel) and make
the loop walk a target list built from the team. Same for `pr.friendly`.

This one change is what turns melee into something that can hit a player.

### 1.5 Death without freezing the world

`game.js:573` sets the global `state = 'dying'` when the one player dies. With
two players that stops both. Replace with a per-player `p.down` state: the
downed player stops acting and the sim keeps running; the run ends when every
player is down.

### 1.6 Two HUDs, two looks

`ui.js` draws one HUD at fixed coordinates with module-level `hpShown` and
anchor rects — make those per-player and mirror the second to the right.
`wanderer.js:30 look.skin` and `outfits.js:1138 current` are shared, but
`resolveOutfit(o)` already takes an argument and `game.js:1133` already
demonstrates the swap-around-a-draw pattern. Give each player a dye set so they
are told apart at a glance.

### 1.7 Two gamepads (local play)

`gamepad.js` is last-connected-wins: `pad.index = e.gamepad.index`
unconditionally, with one module-level `prev[]` for edge detection. Turn `pad`
into a small registry of slots, each with its own `prev[]`, bound to a player.
`game.js:1385` already enumerates every connected pad for the Controller Check
screen — the enumeration exists, only the binding is singular.

---

## Module 2 — The Multiplayer section

A new button in `showTitle()`'s `.row` (`game.js:1156`), opening a panel built
the same way as the others, routed through the existing delegated `data-act`
click listener.

```
MULTIPLAYER
  Duel          two players, one arena          [ local · online ]
  Co-op         the run, together               [ local · online ]
  ── online ──
  Host a game   →  shows a 6-letter code
  Join a game   →  type a friend's code
```

New file `v5/src/mp-menu.js` for the panel and lobby; `game.js` gains the
states `'mp'`, `'mpLobby'`, `'duelPick'` and `'duelEnd'` alongside the existing
`title`/`biome`/`weapon`/`trials`.

---

## Module 3 — Online, host-authoritative

New files: `v5/src/net.js` (transport and session), `v5/src/net-sync.js`
(what gets sent).

### 3.1 Transport

**WebRTC DataChannel, peer to peer, via PeerJS's free public broker for
signalling.** The site is static on GitHub Pages and there is no server to run;
the broker only introduces the two browsers, after which the data flows
directly. Unreliable/unordered channel for the 20 Hz state stream, a reliable
one for lobby and match events.

**Honest limit:** research puts **15–25% of real-world connections** as needing
a TURN relay, and mobile carriers are the worst case — carrier-grade NAT is
almost always symmetric, and some carriers block UDP outright. Two phones on
mobile data in different cities is exactly the failing case. So: same-Wi-Fi and
desktop-to-desktop will work; cross-city on mobile data will sometimes not
connect, and the lobby must say so plainly rather than hanging. A free TURN
tier (Open Relay / Metered) can be added later behind one config line.

### 3.2 What crosses the wire

| direction | rate | payload |
| --- | --- | --- |
| guest → host | 60 Hz | that player's `p.in` — sticks, buttons, aim angle. ~20 bytes |
| host → guest | 20 Hz | a snapshot: both players, enemies, projectiles, hitboxes, hazards, pickups near the guest |

The guest **does not simulate**. It renders interpolated snapshots and applies
**local prediction to its own movement only** — the player moves the instant you
push the stick, and is corrected if the host disagrees. Everything else is
whatever the host last said. This is why none of the determinism problems
matter.

`net-sync.js` owns an explicit whitelist of fields per entity type. Nothing is
auto-serialised, because the entities cannot be (Module context, finding 2).

### 3.3 Cameras

Each device has its own camera on its own player. This is what makes the open
world work at all online, and it is why the owner's answer removes the
shared-camera problem entirely. In the camera-free chamber modes both views are
simply identical.

---

## Module 4 — The Duel: making PvP skillful

### 4.1 What is already right

| | |
| --- | --- |
| aim locks at windup | `beginAttack` stores `angle: p.aimAngle` and never re-reads it |
| real commitment | windup 3–12 frames, recovery 7–25 frames |
| one cancel only | dash cancels `recover`, never `windup` or `active` (`player.js:295`) |
| a punish exists | whiffed maul c2 = 22.8 frames of recovery |
| symmetric arena exists | `boss-wardens.js:224` — four 62×62 stone pillars, exactly mirrored on both axes |
| a duel ring exists | The Wilds' champion ring, `wilds-sites.js:65 CHAMP_R = 300`, with a closing-ring effect and the line *"The ring closes. One of you walks out."* |

### 4.2 What breaks, and the fix

A separate `PVP` tuning table in a new `v5/src/duel.js`, applied on entering a
duel and nowhere else. PvE numbers are untouched.

| problem | why it ruins a duel | fix |
| --- | --- | --- |
| **`p.invuln = 0.8` after every hit** (`combat.js:291`) | caps damage at **1.25 hits/second whatever hits you**. A kill is 2–4 exchanges. Skill cannot show in four exchanges | invuln **0.25s**, HP **160**. A duel becomes 15–25 exchanges |
| **auto-aim** — `aimAngle()` falls back to `nearestEnemy(p.x, p.y, 420)` | with exactly one opponent this is an aimbot. Touch and pad players would never miss | off in duels. Aiming is manual, and this is the single biggest skill lever |
| **dash has no cooldown between dashes** — 0.17s, 156 units, ~0.26s of i-frames, 2 charges at 0.75s | back-to-back dashes = 0.34s of near-total immunity. This is the known roll-spam failure of every souls-like duel | 0.28s lockout between dashes; i-frames only the **first 0.12s** of the dash, so a read punishes a panic dash |
| **longarm rifle** — 60 dmg, speed 2600 × 0.7s life = **1820 units of travel in a 1204-unit arena**, pierce 99, cooldown 0.15s | unmissable, unavoidable, screen-wide | halve the range and damage, cooldown to 1.2s, or cut the weapon from duels |
| **maul full charge** — 100 damage vs 80 HP | a one-shot kill | with HP 160 it is a 2-hit weapon, which is what its 42-frame commitment deserves. Keep the floor ring that telegraphs it |
| **melee deletes projectiles for free** (`updateHitboxes:510`) | a blade spin is a 352-unit bullet vacuum | only the shield's block cone and parry deflect in duels |
| **homing** — missiles, Umbral Barb (`homing: 7`), shield Bull Rush `retarget`, tapped grenades auto-home | removes aiming from the spells too | no homing in duels; spells travel where they were sent |
| **no input buffer** | `attackPressed` is a one-frame edge; a press during recovery is silently dropped, so combos need single-frame precision | a 0.12s buffer. v3 had one. Buffering makes execution feel *intentional*, which is the opposite of mashing |

### 4.3 Parry, duels only

Port `v3/src/parry.js` (182 lines) as `v5/src/parry.js`, enabled only in duels.
Its own header states the design goal exactly: *"A whiffed parry leaves a short
recovery and a cooldown, so mashing it is worse than timing it."*

- perfect window **0.18s**; whiff → 0.22s recovery + 0.55s cooldown
- a correct parry deflects the shot back or shoves the attacker and grants a
  **Riposte** — the next hit is a big crit
- ground attacks cannot be parried — you dash those

It needs `poise.js` from v3 (or a cut-down posture value on the player) and
`fx.parryCue` white glints, which `fx.js` already has a hook for
(`setParryCues`). PvE keeps the owner's 2026 decision: no parry.

**This is the mechanic that makes duels reads rather than reflexes.** Dash
answers spacing; parry answers commitment; whiff-punish answers both. Three
defences that beat different things is what a skill triangle looks like.

### 4.4 Spells in a duel

Both players pick from **the same offered set** before the fight — reuse
`offerSpells()` from `spells.js`, shown to both, alternating picks. No boons, no
meta upgrades, so the only asymmetry is the weapon and the spells, both chosen
openly. Cooldowns 12–48s are already long enough to be commitments.

### 4.5 The three formats

All on one match-settings row in the lobby, sharing one round manager in
`duel.js`:

| format | rules |
| --- | --- |
| **Best of 3** (default) | 160 HP, round ends on a kill, first to 2. A ring closes from 45s to stop camping — the Wilds' closing-ring effect already exists |
| **One long fight** | 320 HP, single round, no ring |
| **Stocks** | 3 lives each, continuous, brief respawn invulnerability |

---

## Module 5 — Co-op (PvE)

Once Module 1 lands, co-op is mostly rules rather than plumbing.

- **Enemies** target the nearest player and commit (`e.target`).
- **Room clear** already counts enemies, not players (`rooms.js:231`) — no
  change. **Doors** need "both players at the door", and the reward roll should
  read the worse-off player (`rooms.js:337` currently reads the one player's
  HP).
- **Downed and revive**: a downed player can be revived by the other standing
  near them for ~3s. This is the co-op tension, and it replaces the global
  `state = 'dying'` from 1.5.
- **Boons and spells**: offered to each player separately from the same roll.
  Gold (`world.gold`) is already a shared pool.
- **Modes**: the chamber run, Boss Trials, Training Ground, Dungeons and The
  Wilds. All camera-free except the Wilds, which works online because each
  device has its own camera.
- **Local same-screen co-op** works in the camera-free modes. In the Wilds it
  would need a shared camera or split screen, so local Wilds co-op is out of
  scope until the owner asks for it.

---

## Files

| file | what happens |
| --- | --- |
| `v5/src/state.js` | `world.players[]`; `world.player` becomes a getter alias |
| `v5/src/player.js` | reads `p.in` instead of the `input` import; `p.team`, `p.down` |
| `v5/src/input.js` | becomes a source that fills `players[0].in` |
| `v5/src/gamepad.js` | pad slots with per-slot edge state, bound to players |
| `v5/src/combat.js` | `dealDamage(target, amount, {from})`, `damagePlayer(target, ...)` |
| `v5/src/spawn.js`, `projectiles.js` | `team` on hitboxes and projectiles; the hitbox loop walks a target list |
| `v5/src/ai.js` | `player()` → `nearestPlayer(x, y)`; enemies gain `e.target` |
| `v5/src/ui.js` | two HUDs; per-player `hpShown` and anchors |
| `v5/src/rooms.js`, `game.js` | doors need both; per-player down/revive; the Multiplayer states |
| `v5/src/duel.js` | **new** — PvP tuning table, round manager, the three formats, the ring |
| `v5/src/parry.js` | **new** — ported from `v3/src/parry.js`, duels only |
| `v5/src/mp-menu.js` | **new** — the Multiplayer panel and lobby |
| `v5/src/net.js`, `net-sync.js` | **new** — WebRTC session; the snapshot whitelist |
| `v5/src/enemies*.js`, `boss-*.js` | `world.player` → nearest/target, group by group (~33 lines) |

Reuses: `createPlayer()`'s factory shape, `ai.js player()` as the chokepoint,
`spawn.js`'s unused `friendly` flag, `boss-wardens.js`'s symmetric pillars, the
Wilds champion ring and its closing-ring effect, `offerSpells()`, `fx.js`'s
`setParryCues` hook, and `game.js:1385`'s existing multi-pad enumeration.

---

## Verification

The owner tests on devices; these are the offline checks that must pass first.

- **`v5/tools/check-two.mjs`** (new): create two players, assert no shared
  mutable state between them — independent `p.in`, `p.anim` phase, stats,
  cooldowns; assert `world.player` still resolves to `players[0]`.
- **`v5/tools/check-damage.mjs`** (new): every `damagePlayer`/`dealDamage` call
  site passes a target and an attacker — read the source and fail on any
  argument-less call. This is exactly the shape of checker that caught the
  briefing bug in Savi, and the same class of bug applies here.
- **`v5/tools/check-duel.mjs`** (new): the PvP table is applied on entering a
  duel and fully restored on leaving; no PvE constant is mutated permanently;
  auto-aim and homing are off; assert the measured time-to-kill for each weapon
  falls in the 15–25 exchange band.
- **Two bots duelling.** The dodge bot in the journal (§7.4) already steers from
  bullet, cone and shockring threat. Point two of them at each other with
  `world.damageLog` recording, and a weapon that wins every matchup or a round
  that never ends is a balance bug found without either of us playing.
- Static checks as always: `node --check`, an esbuild bundle of
  `v5/src/game.js`, eslint `no-undef`.
- Then the owner plays: local duel on two pads first, then a link to a phone.

---

## Order

Each step is playable before the next begins.

1. **The foundation** (Module 1) — two players, one screen, one device, in the
   Training Ground. Nothing else changes. This is the big one.
2. **The Duel, local** (Modules 2 and 4) — the Multiplayer panel, PvP tuning,
   parry, best-of-3 on two gamepads. The whole PvP design provable with no
   network involved.
3. **Co-op, local** (Module 5) — the chamber run and Boss Trials, two pads.
4. **Online** (Module 3) — host-authoritative WebRTC, starting with the Duel
   because one room and two entities is the smallest possible snapshot, then
   co-op, then the Wilds.
5. **The other two duel formats**, and balance from bot duels.

**Honest scope note.** This is the largest change the project has had — the
foundation alone touches 36 files and ~240 call sites, before any multiplayer
exists. Steps 1–2 are where the risk is; step 4 is well-understood work once
1 is done. If any step should be cut, cut step 5 first.

---

## Sources

[netplayjs](https://github.com/rameshvarun/netplayjs) and
[Telegraph](https://github.com/thomasboyt/telegraph) for browser rollback and
why it demands determinism and save-states;
[Preparing your game for deterministic netcode](https://yal.cc/preparing-your-game-for-deterministic-netcode/)
for the determinism checklist this simulation fails;
[Netcode Architectures: Rollback](https://www.snapnet.dev/blog/netcode-architectures-part-2-rollback/)
for the rollback/host-authoritative trade;
[Why WebRTC calls fail on mobile networks](https://www.expressturn.com/blog/webrtc-calls-fail-on-mobile-networks)
and [TURN servers explained](https://getstream.io/resources/projects/webrtc/advanced/stun-turn/)
for the 15–25% TURN figure and carrier-grade NAT;
[Footsies 101](https://www.eventhubs.com/news/2023/may/06/footsies-101-beginner-guide/)
and [Fighting Game Design Fundamentals](https://game-wisdom.com/critical/fighting-game-design-fundamentals)
for whiff punishing, frame advantage and why commitment is what makes skill
legible; [a Dark Souls PvP thread on roll-spam](https://steamcommunity.com/app/374320/discussions/0/1726450077666919727/)
for the dodge-spam failure mode and the cooldown-between-rolls fix.
