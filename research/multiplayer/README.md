# Multiplayer for Ashfall — research, parked

**Status: parked 2026-09-29.** Researched, planned, started, and rolled back.
The game is exactly as it was; nothing here is wired into `v5/`.

Parked because multiplayer is a large piece of work and the owner judged it
not worth doing now. The research is kept because it is the expensive part —
the measurements took a full pass over 94 files and would have to be redone
from scratch otherwise.

## What is in here

| file | what it is |
| --- | --- |
| `FINDINGS.md` | **Read this first.** What the code actually says: why rollback netcode is impossible, where every single-player assumption lives and how many call sites each is worth, and the measured combat numbers a duel would have to be tuned against |
| `PLAN.md` | The full approved implementation plan — five modules, the PvP design, the order to build in, and the verification |
| `checkers/` | Two working test tools from the attempt. Written against the two-player API, so they will **not** run against the current code |

## The three things worth remembering

**1. Rollback netcode is off the table.** ~820 unseeded `Math.random()` draws
with cosmetic and gameplay entropy interleaved, entities holding live `Set`s
and closures that cannot be serialised, and — the killer — `arena` is computed
from `window.innerWidth/innerHeight`, so two players on differently shaped
screens are literally playing in differently sized rooms. The answer is
host-authoritative: one device simulates, the other sends inputs and renders
snapshots. Nothing above has to be fixed for that to work.

**2. Two players is a refactor, not a rewrite.** `createPlayer()` is already a
pure factory with no module state, and two extra instances already exist and
draw correctly today (the wardrobe preview and the opening cinematic's hero).
The work is 157 `world.player` references, 60 `damagePlayer` calls with no
target, and an `input` singleton read in 77 places. All of that was done once
and verified before being rolled back — see `FINDINGS.md` §6.

**3. PvP would be mashy because of one number.** `p.invuln = 0.8` after every
hit caps damage at 1.25 hits per second whatever hits you, so a duel ends in
2–4 exchanges. Add auto-aim (`nearestEnemy` with one opponent is an aimbot),
dashes with no cooldown between them, and a longarm shot that travels 1820
units across a 1204-unit arena. All four are tuning, not design — the
commitment structure underneath (aim locks at windup, 7–25 frame recoveries,
dash as the only cancel) is genuinely good, and `v3/src/parry.js` is 182 lines
of finished anti-mashing mechanic sitting behind one disabled flag.

## If this is picked up again

Start at `PLAN.md`'s **Order** section. Step 1 is the whole foundation and it
was already done once — `FINDINGS.md` §3 and §6 say exactly what it touched
and what it measured, so it is a repeat rather than a discovery.

The first decision to re-check with the owner is scope: they asked for local
and online together, full co-op and all three duel formats. That is the
largest change the project has had, and sequencing it is what makes it
possible at all.
