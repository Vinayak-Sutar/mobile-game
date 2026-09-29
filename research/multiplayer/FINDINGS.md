# Ashfall v5: what the code says about adding a second player

Measured against `v5/src` on 2026-09-29, by reading the whole codebase. These
are facts about the code as it stands, not opinions about what to build. If
code and this document disagree, **the code wins** — then fix this document.

---

## 1. The single biggest finding: rollback netcode is not possible here

Rollback and deterministic lockstep both need every machine to reach a bit
identical state from identical inputs. This simulation cannot, for five
independent reasons, each of which alone would be fatal.

### 1.1 Randomness is everywhere and unseeded

| source | call sites |
| --- | --- |
| direct `Math.random()` | **216** across 43 files |
| `rand(lo, hi)` (the `util.js` wrapper) | **~579** |
| `pick`, `randInt`, `chance`, `shuffle` | ~31 |
| **effective total** | **~820** |

Cosmetic and gameplay draws are **interleaved in the same call graph**, so they
cannot be separated onto different streams without touching all of them. The
idiom `Math.random() < dt * N` appears 73 times: 52 of them open a particle
effect, 21 are gameplay.

Gameplay-affecting draws include: wave composition (`rooms.js makeWaves`), door
rewards (`rollReward`), boon offers (`boons.js offerBoons`), spell offers
(`spells.js` — the sort *comparator itself* is RNG), the crit roll
(`combat.js:73`), boss move selection (`boss-kit.js chooseMove`), enemy strafe
flips, shotgun pellet jitter, and the shockring gap position — which decides
where you are allowed to dodge.

**Seeded RNG does exist, but only for terrain.** `terrain.js:42 mulberry(seed)`
with a fixed `mulberry(1337)` noise table, and The Wilds' layout is
position-hashed off `WILDS.SEED = 0x5eed1a5`. So the open world's *geometry* is
deterministic. The chamber roguelike is not, anywhere.

### 1.2 The arena is a different size on every screen

`game.js:148`:

```js
function chamberArena() {
  const mx = 38, top = 74, bottom = 38;
  arena.x = mx; arena.y = top;
  arena.w = view.w - mx * 2;
  arena.h = view.h - top - bottom;
}
```

`view.w/h` come from `window.innerWidth/innerHeight`. Every wall bounce, player
clamp, hazard clamp, obstacle placement and spawn point reads `arena`. **Two
players on differently shaped screens are playing in differently sized rooms.**

It also changes *mid-run*: `resize()` fires on rotate, `frame()` polls the
window every frame, and `clampObstacles()` then **moves obstacles in place**.

### 1.3 The state does not serialise

Entities carry things JSON cannot hold:

- `Set`s of live objects — `h.hits` on every hitbox, `pr.hits`, `p.dashHits`
- cross-references — `pr.owner`, `pr.target`, `e.summoner`, `h.follow`
- closures — `e.onDeath`, `e.eats`, `pr.onExpire`, `h.track`, `h.onDetonate`
- function-table references — `e.def = ENEMY_DEFS[type]`, `p.weapon`, `e.anim`

### 1.4 Half the simulation lives outside `world`

Serialising `world` would miss, among others:

| file | what |
| --- | --- |
| `dungeon.js:47` | `let D` — the **entire** dungeon sim: water level, floors, platforms, checkpoints |
| `wilds-world.js:54` | `let W` — the live open world |
| `fx.js:9` | `fx`, including **`fx.hitstop`, which freezes the whole simulation** |
| `input.js:8` | `input`, 25 fields |
| `state.js:39` | **`tuning.speed`** — read by `player.js:210`, so two players with different settings walk at different speeds |
| `state.js:55` | `arena` (see 1.2) |
| `wilds-progress.js:36` | `journey` — the overworld stat levels |
| `save.js:53` | `save` |
| `boss-kit.js:30` | `let liveBullets` — the enemy bullet budget, which gates whether a boss shot exists at all |
| `enemies-folk2.js:406` | `const hidden = []` — gold a Duende ran off with |

### 1.5 Iteration order and float precision are load-bearing

- Every entity loop runs **backwards with in-place `splice`**, and insertion
  order is itself RNG-driven.
- `projectiles.js:186` — which enemy a limited-pierce shot hits depends on
  **array position**, not distance.
- `combat.js:14 nearestEnemy` resolves ties to the earliest array element.
- `Math.hypot/sin/cos/atan2/exp/pow` have engine-defined precision and are
  everywhere in movement and AI.

### Conclusion

**Host-authoritative is the only sane model.** One device runs the only
simulation that matters; the other sends its inputs and renders the snapshots
it gets back, predicting only its own movement. None of 1.1–1.5 has to be
fixed. This is written up in `PLAN.md`, Module 3.

---

## 2. The good news: the player is already a factory

`player.js createPlayer(weapon, meta)` holds **no module-level mutable state**.
Two extra instances already exist and draw correctly today:

- `game.js:1097` — the wardrobe preview
- `cinema-opening.js:419` — the opening cinematic's hero

Animation is per-instance (`p.anim`, from `createPlayerAnimator()`), and
`anim.js` has no shared mutable buffer — `resolvePose` returns a fresh array
per draw. Lives, boons, spells and cooldowns are already per-player fields.

Only `world.player` is ever passed to `updatePlayer()`, so the preview
instances are never simulated.

**Two players is a refactor, not a rewrite.**

---

## 3. Where the single-player assumptions actually live

| assumption | weight |
| --- | --- |
| `world.player` as a singular field | **157 references, 36 files** (only 7 writes, all in `game.js`) |
| `ai.js:10 player()` indirection | 33 calls, 7 files — **the cheapest chokepoint**; becomes `nearestPlayer(x, y)` |
| `damagePlayer(amount, …)` with no target | **60 call sites, 22 files** |
| `dealDamage(e, amount, opts)` with no attacker | 21 direct + every melee swing |
| `input` singleton read outside `input.js` | **77 reads, 7 files** (`player.js` 28, `grenade.js` 13) |
| one `pad`, last-connected-wins | `gamepad.js`, 352 lines, one module-level `prev[]` |
| `friendly: true` hardcoded on hitboxes | `spawn.js:56` — and `updateHitboxes` **never reads it**, it just walks `world.enemies` |
| one HUD at fixed coords | `ui.js`, plus module-level `hpShown` and anchor rects |
| `state = 'dying'` global on one player's death | `game.js:573-595` |
| `look.skin` / `outfits.current` shared | both already have per-call override patterns in use |

**The useful shape of it:** every `damagePlayer` call site already did its own
overlap test against a local `p`, so passing that `p` as the target is both
behaviour-preserving today and correct once enemies target either player. This
was proven — see §6.

---

## 4. Raw material for a PvP duel

### 4.1 What is already right

Attacks **lock their aim at windup** (`beginAttack` stores `angle: p.aimAngle`
and never re-reads it) and commit for real. Measured, in seconds and frames at
1/60:

| weapon / step | windup | active | recover | total | notes |
| --- | --- | --- | --- | --- | --- |
| blade c1 | 0.055 (3.3f) | 0.085 | 0.115 (6.9f) | 0.255 | arc 2.0 rad, r116, 17 dmg |
| blade c3 | 0.10 | 0.13 | 0.24 (14.4f) | 0.47 | arc TAU, r142, 32 dmg |
| spear c3 | 0.12 | 0.14 | 0.26 (15.6f) | 0.52 | rect 250×56, 38 dmg, lunge 460 |
| maul c2 | 0.20 (12f) | 0.13 | **0.38 (22.8f)** | 0.71 | 40 dmg, kb 640 |
| maul special | 0.10 | 0.36 | 0.30 | 0.76 | leap, 60 dmg, cd 3.0 |

Move speed is **×0.34 during any attack phase**. The only cancel in the game is
**dash cancelling `recover`** (`player.js:295`) — windup and active cannot be
cancelled. That is genuine commitment, and a whiffed maul c2 is 22.8 frames of
free punish.

Also present: an EXPOSED punish window at **×1.35** damage (`combat.js:12`),
six telegraph shapes with a written fairness contract (`bosses.js:1-18`),
shrunk hurtboxes (`BULLET_HURTBOX = 0.72`, hazards `0.6`), hitstop from 1.3 to
24 frames, and a **mirror-symmetric arena that already exists** —
`boss-wardens.js:224`, four 62×62 stone pillars at (0.22, 0.3), (0.78, 0.3),
(0.22, 0.72), (0.78, 0.72).

The Wilds also already has a **champion duel ring** — `wilds-sites.js:65
CHAMP_R = 300`, with a closing-ring effect and the line *"The ring closes. One
of you walks out."*

### 4.2 What would break a duel

| problem | the number | why it ruins PvP |
| --- | --- | --- |
| **hit invulnerability** | `p.invuln = 0.8` after **every** hit (`combat.js:291`) | caps damage at **1.25 hits/second no matter what hits you**. A kill is 2–4 exchanges. This is the single most important PvP number in the codebase |
| **auto-aim** | `aimAngle()` falls back to `nearestEnemy(p.x, p.y, 420)` | with exactly one opponent this is an aimbot. Also affects Skyfall Leap (280), Chain Lightning (460), Siphon (320), Missiles, tapped grenades, Bull Rush retarget, blocked-bullet reflection (900) |
| **dash** | 0.17 s, 156 units, **~0.26 s of i-frames**, 2 charges at 0.75 s, **no cooldown between dashes** | two back-to-back dashes = 0.34 s of near-total immunity. The known roll-spam failure of every souls-like duel |
| **longarm rifle** | 60 dmg, speed 2600 × 0.7 s life = **1820 units of travel in a 1204-unit arena**, pierce 99, cd 0.15 s | unmissable and unavoidable |
| **maul full charge** | 100 damage vs 80 base HP | a one-shot kill |
| **melee eats bullets** | `updateHitboxes:510` deletes any hostile projectile it overlaps, free | a blade spin is a 352-unit bullet vacuum |
| **no input buffer** | `attackPressed` is a one-frame edge, dropped during any attack phase | combos need single-frame precision. v3 had a buffer; v5 does not |

Base player HP is **80** (`player.js:27`), up to 130 with Vitality 5 and 238
with the Verdant Vigor boon. A maxed build reaches `damageMult ≈ 2.94`,
`critChance 0.95`, `critMult 4.8` — roughly 3× HP and 3× damage over a fresh
one, which is why PvP should use neither boons nor meta upgrades.

### 4.3 Parry already exists, switched off

`v3/src/parry.js`, **182 lines, complete and tested**, disabled by
`PARRY_ENABLED = false` at line 51 after the owner asked for no parry in PvE.
Its own header is the design argument for using it in duels:

> *"A whiffed parry leaves a short recovery and a cooldown, so mashing it is
> worse than timing it. A successful one resets almost instantly."*

Perfect window 0.18 s; whiff → 0.22 s recovery + 0.55 s cooldown; a correct
parry deflects the shot back or shoves the attacker and grants a **Riposte**.
Ground attacks cannot be parried — you dash those. It depends on `poise.js`
and `haptics.js` from v3, and `fx.js` already carries the `setParryCues` hook.

---

## 5. Things found along the way that are worth knowing

Not multiplayer-specific, and **none of these were changed** — recorded so they
are not re-discovered.

- **`world.timeScale` is dead code.** Declared in `state.js:29`, reset in
  `resetWorld()`, and **never read anywhere in the repo**. There is no
  slow-motion system at all.
- **`h.friendly` on hitboxes is never read** by `updateHitboxes`. The loop
  walks `world.enemies` unconditionally. Only cosmetic consumers (grass
  cutting, dungeon switch orbs) read the flag.
- **`h.maxHits` is honoured but never set** by any caller.
- **The slash visual outlasts the hitbox** by 0.12 s (`weapons.js:213`) — about
  7 frames of feedback that can no longer hurt. Fine in PvE, a lie in PvP.
- **`onReturn()` discards accumulated simulation time** (`game.js:3288`,
  `accumulator = 0`), and the tick loop's 5-step guard silently drops
  simulation time on a slow device rather than falling behind.
- **`updateStatuses` can visit newly spawned enemies in the same pass** — a
  burn tick kills a splitter, `onDeath` pushes two halves onto `world.enemies`,
  and `for…of` uses a live index, so the new halves get a tick of status they
  should not have.

---

## 6. What was built, tested and then reverted

Commit `9924740`, reverted in full. It worked and was verified; it is recorded
here because the *measurements* are the expensive part, not the typing.

Built: `world.players[]` with `world.player` as a getter/setter alias for
`players[0]`; `nearestPlayer()` / `livePlayers()`; per-player input via `p.in`
and a `makeInput()` factory; `damagePlayer(target, …)` across 59 call sites;
`dealDamage(…, { from })`; `healPlayer(target, …)`; `explode()` walking every
player; and a target parameter on the three boss `hurt()` helpers.

Verified in the running game:

- movement measured at **228 u/s**, exactly `BASE_SPEED 268 × tuning.speed
  0.85` — unchanged by the refactor
- a blast caught **both** players for 9 each
- a hit aimed at player two took 15 from player two and **0** from player one
- an attacker with his own stats did his own damage, not player one's
  (10 vs 30 with a 3× multiplier on the other player)

The two checkers that proved it are in `checkers/`. They are written against
the two-player API and **will not run against the reverted code** — they are
kept as a starting point, not as working tests.

**One practical note for whoever resumes this:** the preview pane throttles
`requestAnimationFrame`, so the game freezes there. Drive it by dispatching
real key events and then pumping `ashfall.tick(1/60)` by hand in a loop —
`updateInput` runs at the top of `tick`, so injecting values into the `input`
object directly does not work.
