# crazy — the arcade version, for CrazyGames

A roguelike **journey in three acts**, built on the combat that already works.
Copied from `v7/` (so it inherits the one-character Wanderer, the unified
`save.progress`, and the naming trick), then pointed at a web portal instead of
a store.

`v7/` is paused, not abandoned — see journal §18.

## The shape

```
A JOURNEY = three acts. Pick a weapon once, at the start.

ACT 1   ~12 chambers, 4 guardians from the EASY group
        boon and spell doors between rooms, exactly as the run does today
        10-12 minutes, then IT SAVES
          |   stop here if you like - walk back in later with your build
ACT 2   ~12 chambers, 4 guardians from the MIDDLE group
          |
ACT 3   ~12 chambers, 4 guardians from the HARD group

DEATH   restart the act you are in, with the build you walked into it with.
        A loss costs a session, never an evening.

ENDLESS unlocked after clearing two acts: the existing chamber run with no
        ending. Best depth is the score.
```

Three layers plus a short final act is the shape Slay the Spire and Hades both
use, and in both **the build carries between acts** — which is what makes act 2
a test of the build rather than a repeat of act 1.

No gold meta-progression. That is deliberate: it is a test of whether the
combat alone holds people, and currency for weapon unlocks is a later step if
the numbers ask for it.

### The bosses

Fifteen exist — the fourteen in `boss-pool.js` plus the Grandmaster, which is
fully built and currently unreachable. Three groups of five by difficulty; a
journey draws four from each, so you fight twelve of fifteen and two journeys
are never the same.

## What the ladder got wrong

The 24-level ladder that used to live here is deleted. It is worth writing down
why, because the mistake is easy to repeat:

The combat's enemy scaling was tuned against a player who picks up **~22 boons**
on the way. Enemy HP runs ×1.00 at level 1 to ×1.98 at level 24. The ladder kept
that scaling and removed the growth — `showBoonSelect()` only fires from
`handleDoor`, and the ladder suppressed doors inside a level, so it granted
**zero boons at all.** Flat and pointless early, unwinnable from about level 8.
Nothing caught it because nothing compared the player's power curve against the
content's.

Hence §Checks below: the acts get a checker that asserts the boon count at each
act boundary sits inside the band the scaling assumes.

## What CrazyGames actually measures

Three numbers decide whether a game is promoted out of Basic Launch, and the
act structure serves all three:

| metric | target | what we do about it |
| --- | --- | --- |
| **Conversion** — still playing after 1 minute | **80%+** | act 1's first chambers teach one thing each and cannot be lost |
| **Average play time** | **10+ min** | one act *is* a session: ~12 chambers, 10-12 minutes |
| **D1 retention** | **10-15%** | an unfinished journey, saved with your build, is a reason to come back |

Basic Launch ends after 7 days *and* 500 plays, or automatically at 21 days.

**Conversion is the one we are built to win.** The platform ties low conversion
to slow loading and asks for under 20 MB and under 10 seconds. This game has
**no asset files at all** — every sprite is drawn and every sound synthesised at
runtime — so it bundles to **1.8 MB**, about a tenth of the budget. The one
thing still to do about it: **ship bundled**, because 96 separate module
requests is slow on a portal even when each is small.

## The portal

`src/portal.js` wraps the CrazyGames SDK and is deliberately paranoid: every
call is feature-detected and wrapped, so the game runs identically from a local
server, from GitHub Pages, and inside the portal's iframe. If the SDK is
missing, blocked by an ad blocker, or throws, the game does not notice.

The play clock is reported **honestly, and from one place**: `frame()` derives
it from `state === 'playing' && !overlayVisible()`. Both SDK calls are
idempotent, so that compare is right by construction. The ladder instead called
start and stop by hand at each site and left the clock running over its own
results screen — and menu time counted as play time would flatter our number
against other games' real ones, which is the one way to lose a ranking by
cheating at it.

**Still to do here:** the SDK's **Data module**. A portal partitions
localStorage per visit, so a plain `localStorage` save makes every session look
like a brand-new player with no history. The Data module has the same API
(`getItem`/`setItem`/`removeItem`/`clear`), falls back to localStorage for
guests, and syncs to a signed-in player's account across devices.

## Still to do before submitting

- **The acts** themselves (`acts.js`), then save-and-resume, then the Data
  module. See the plan.
- **Bundle it** (the single biggest conversion win left).
- Onboarding *in* gameplay — visual, control overlays, nothing to read.
- Trim the title screen's leftovers: the Wilds, dungeons, Training Ground, the
  Lawn and the Music Room are all still reachable.
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

A third checker is owed to the acts, and it is the guard against repeating the
ladder's mistake: every boss reachable in some journey, no boss in two groups,
groups the right size, twelve guardians a journey, and **the expected boon count
at the end of each act inside a stated band of what the enemy scaling assumes.**
