# crazy — the arcade version, for CrazyGames

A ladder of 24 short levels built on the combat that already works. Copied
from `v7/` (so it inherits the one-character Wanderer, the unified
`save.progress`, and the naming trick), then pointed at a web portal instead
of a store.

`v7/` is paused, not abandoned — see journal §18.

## What CrazyGames actually measures

Three numbers decide whether a game is promoted out of Basic Launch. Every
design decision in `src/levels.js` serves one of them:

| metric | target | what we do about it |
| --- | --- | --- |
| **Conversion** — still playing after 1 minute | **80%+** | levels 1–3 are tiny, teach one thing each, and cannot be lost |
| **Average play time** | **10+ min** | a level is 1–3 rooms; the next one is always one tap away |
| **D1 retention** | **10–15%** | three stars a level — nobody gets them all first try |

Basic Launch ends after 7 days *and* 500 plays, or automatically at 21 days.

**Conversion is the one we are built to win.** The platform's own guidance ties
low conversion to slow loading and says to keep the build under 20 MB and
loading under 10 seconds. This game has **no asset files at all** — every
sprite is drawn and every sound is synthesised at runtime — so the whole thing
bundles to **1.8 MB**. That is roughly a tenth of the budget.

The one thing still to do about it: **ship bundled.** 96 separate module
requests is slow on a portal even when each is small. `build.mjs` already
inlines an esbuild bundle into a single file.

## The ladder

`src/levels.js` is the whole design, as data:

- **24 levels in 4 chapters** of six, each chapter ending in a guardian.
- A level is **1–3 chambers**, or one boss. `power` is fed to the existing
  wave generator as an effective depth, so the budgets and enemy scaling are
  the ones already balanced — no new difficulty curve was invented.
- **Boons carry through a chapter and reset at the next.** Long enough to
  build something, short enough that the power curve cannot run away from the
  content the way the open-ended run's does (it reaches ~20× against content
  that scales ~2×).
- **Losing costs you the level and nothing else.** A game that takes your
  progress in the first minute does not keep the player.
- **Three stars**: cleared, untouched, under par. Only the best result is
  kept, so a bad replay can never undo a three-star clear — otherwise nobody
  would risk replaying anything.
- **Four guardians of the fourteen, shuffled once per save.** Consistent for
  one player, different between two, which costs nothing and is worth a
  surprising amount of talk.

## The portal

`src/portal.js` wraps the CrazyGames SDK and is deliberately paranoid: every
call is feature-detected and wrapped, so the game runs identically from a
local server, from GitHub Pages, and inside the portal's iframe. If the SDK is
missing, blocked by an ad blocker, or throws, the game does not notice.

`gameplayStart` / `gameplayStop` are reported **honestly** — the clock stops on
a results screen, a pause, and the ladder. Counting menu time as play time
would flatter our numbers into a game that never gets promoted, because the
platform compares them against other games' real ones.

## Still to do before submitting

- **Bundle it** (the single biggest conversion win left).
- The `teach` field on levels 1–5 is authored but not yet shown — the platform
  wants onboarding *in* gameplay, visual, with control overlays and no reading.
- Trim the title screen's leftovers: the Wilds, dungeons, Training Ground, the
  Lawn and the Music Room are all still reachable in code, just not from the
  ladder.
- Check it on a Chromebook-class machine — mandatory, and the one documented
  worst frame we have is 36 ms at 90 enemies on a dev PC.
- `-webkit-user-select: none` and relative paths only (already true).

## Checks

```bash
node crazy/tools/check-version.mjs
node crazy/tools/check-progress.mjs
```

The first one earned its keep immediately: it caught a level named "Ashfall",
which is also the game's title, and would have made a later rename ambiguous.
