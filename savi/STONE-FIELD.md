# The last root: the stone field (agreed, not yet built)

The boon root stops being *dead ground cleared with the lamp* and becomes
**a fall of stones you carry off and throw into the spring**, then sweep the
grit that was under them. The owner picked this over the cairn variant because
throwing is the fun part.

## The shape of it

1. The root is buried under ~24 loose stones scattered over the patch.
2. One press with empty hands **picks a stone up**. Carrying it she is slower
   and cannot jump or dash — the weight is what makes carrying feel like
   anything.
3. One more press **throws it** along her facing, on an arc.
   - Into the spring → splash, ripple, gone for good, counter down.
   - Onto the ground → it lies where it fell and can be picked up again.
     Missing is allowed and costs only the walk.
4. Under the stones is a layer of **grit** (`MAT.ash`, which is already grey).
   A stone sitting on grit **holds it down**, so the broom cannot lift grit
   within `stone.r + 16` of one. Stones first, then sweep, without needing a
   gate to say so.
5. Done when no stones remain on the patch **and** `fraction(r) > 0.8`.

## What has to change

| where | what |
| --- | --- |
| `savi.js` `TARN` (new) | the spring at the head of the valley — a wobbled ellipse about `{x:2600, y:96, rx:430, ry:130}`, drawn by the terrain painter. Rim wobble via the same three-harmonic trick as `thicket()` |
| `savi.js` `classify` | inside the tarn → `TT.WATER`, a ring of `TT.SHALLOW`; and the boon patch paints `TT.GRAVEL`, not `TT.ASH` |
| `savi.js` movement clamp | `inTarn(nx, ny)` blocks the step, the same way `inWall` does — this avoids touching `supported`/`fallIn` at all |
| `savi.js` `PLACES.boon` | patch moves south clear of the tarn: `{x:2250, y:300, w:700, h:400}`, `at` stays `{2600, 420}` |
| `savi.js` `BURN` | drop key `4` — the lamp no longer does anything to grit, so `beginStroke` lets the broom claim it |
| `savi.js` `STONES` (new) | `{x, y, r, s, seed, fly}`; `sowStones()` after the ground is built, `stepStones(dt)`, `drawStones(ctx, y0, y1)` in the same below/above split the fauna uses |
| `savi.js` press dispatch (~line 1088) | after the mural / broom-pickup / keeper checks and **before** `beginStroke()`: throw if carrying, else pick up a stone within ~44 |
| `savi.js` `sp` (~line 1193) | `* (carried ? 0.6 : 1)`; and `jumpWant`/`dashWant` refused while carrying |
| `savi.js` `carve` | skip `MAT.ash` cells within `stone.r + 16` of any stone |
| `savi.js` root completion (~line 1320) | boon: `done = stonesLeft() === 0 && fraction(r) > 0.8` |
| `savi.js` `st.prompt` (~line 1308) | replace the coal lines with `N stones left — throw them in the spring` / `hold to sweep` |
| `savi-art.js` | new `drawStone(ctx, o, time)`; and the carried stone in `drawSavi`, held in both hands at chest height |
| `savi-quest.js` `CHAIN[4]` | `tool: 'broom'`, `where: 'the stone fall, north'`, `task: 'throw the stones in the spring and sweep what is under them'` |
| `savi-keeper.js` | `brief4` and `give4` rewritten — she hands back the broom, not the lamp. `whyash` / `giveaway` need new text or retiring |

Reuse: `sfx.splash`, `sfx.thud`, `sfx.pickup`, `sfx.clack`; `water.splash()` for
the ring on the spring; `spark()` for the spray; `thicket()`'s rim wobble for
the tarn's outline; `drawRock` in `savi-art.js` as the reference for how a
stone is shaded.

## Verify

`node --check`, the bundle, the `no-undef` eslint pass, and a new
`savi/tools/check-stones.mjs` proving every stone can be thrown from somewhere
on the patch into the tarn inside one throw's range — the same job
`check-level.mjs` does for the river, so the field can never ship with a stone
that cannot be got rid of.
