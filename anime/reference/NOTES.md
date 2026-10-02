# What the ED actually looks like

Read off `pure.mp4` — the season 1 ending of *You and I Are Polar Opposites*,
"Pure" by Pas Tasta feat. 橋本絵莉子. 100 s, 24 fps. The last ~18 s is the
Crunchyroll end card; the animation is 0–82 s.

Every number below is **measured from the frames**, not estimated by eye. The
scripts that produced them are throwaway, but the method is written down so
any of it can be re-checked.

The frames in `frames/` are the ones the art direction is read from.
`sheet01..04.jpg` are one frame per second, twenty to a sheet, so the whole
thing can be seen at a glance.

---

## 1 · It is isometric, and it is the textbook one

Measured by taking the gradient of five different crops — paving slabs, a
shopfront, a kerb, a crosswalk, and the boxy vending machines — and histogramming
the edge directions by strength. All five agree:

| direction | measured | what it is |
| --- | --- | --- |
| ground axis A | **−28°** (slope −0.53) | up and to the right |
| ground axis B | **+27°** (slope +0.51) | down and to the right |
| up | **+90°** (dead vertical) | every pole, flag, building edge and person |

Mean ground slope **0.52**, against 0.500 for a textbook 2:1 isometric. The
difference is inside the measurement error, so: **2:1 isometric, 45° azimuth.**

Vertical is vertical on screen. That is the single most important fact — it
means height only ever moves a thing *up*, which is exactly the one-projection
rule this project already works by.

From the ground slope the camera's elevation follows: `sin φ = 0.52`,
so **φ ≈ 31°**, and then the vertical scale relative to the horizontal is
`cos φ / cos 45° = 1.21`.

```js
// the whole camera, as three numbers derived from one measured angle
sx = (x - y)
sy = (x + y) * 0.52 - z * 1.21
```

**Depth sort is `x + y`**, not `y`. (The earlier plan said `y`; that was for an
oblique camera and is wrong for this one.)

## 2 · The world is a warm off-white. Only the characters are coloured.

Clustered 58,000 pixels out of three street frames:

| share | colour | | what it is |
| --- | --- | --- | --- |
| 15% | `#cec6b9` | H36 S10% V81% | road, paving |
| 13% | `#bcb1a5` | H31 S12% V74% | road in half-shade |
| 12% | `#ded9d1` | H37 S6% V87% | lit paving slabs |
| 10% | `#a19b92` | H37 S10% V63% | kerbs, deeper shade |
| 7% | `#edcab0` | H26 S25% V93% | sunlit warm surfaces |
| 7% | `#97aa34` | H69 **S69%** V67% | foliage |
| 6% | `#cba26e` | H34 S46% V80% | the terracotta bike lane |
| 1% | `#297a83` | H186 **S68%** V52% | the vending machine |

Across the whole frame: **median value 77 %, median saturation 14 %.**
Nothing is dark — the 10th percentile of value is 51 %.

So the rule is not the one in the palette image. It is:

> **The world is a warm near-neutral at 5–15 % saturation and 75–90 % value.
> Saturation is a resource, spent on the characters and on three or four props
> per screen — a vending machine, an awning, a banner, the leaves.**

The eleven-colour palette the owner sent (all at value 72 %, saturation 55–80 %)
is the **character and accent** palette. It is still right, for the things that
are allowed to be loud. It is simply not the background.

### Darkest thing on screen

The girl's outline and her navy skirt measure `#404352` — H231 S22% **V32%**.
Dark, cool, and emphatically **not black**. Nothing in the frame is darker.

### The shadow rule, measured against lit ground beside it

| | lit | shadowed | shift |
| --- | --- | --- | --- |
| road, under a building | `#beb5a7` | `#b7a99a` | V ×0.96, S +4, H −5° |
| canal path, evening | `#d8c49d` | `#a18262` | V ×0.75, S +12, H −9° |

**Shadow is darker, *more* saturated, and *warmer*.** Not cooler. The earlier
plan said to push shadow toward indigo; the footage says the opposite, because
the key light is warm daylight and the fill is warm bounce off concrete.

```js
shadow(c, k = 0.80) → hsv(h - 7°, s + 10 points, v * k)
```
`k ≈ 0.95` for ambient contact shade, `k ≈ 0.75` for a real cast shadow.

Shadows are **soft-edged**, not hard. A character's contact shadow is a blurred
ellipse; a tree throws a long blurred blob. (The plan said hard-edged — wrong.)

### A prop's ramp

The teal vending machine is one hue in five steps, and saturation *climbs* as
value falls: `#99d5d7` S28 V84 → `#57a8ad` S49 V68 → `#17929e` S85 V62 →
`#308282` S62 V51 → `#186064` S76 V40.

## 3 · Outlines: characters yes, architecture no

- **Characters, animals and loose props** carry a full outline, dark and tinted
  (that `#404352` family), about 1.5–2 px at 360p — so ~3–4 px at our scale.
- **Buildings, roads, kerbs, paving** have **no outline at all.** They are
  separated purely by face shading and by the contact shadow where they meet
  the ground.

That is the depth hierarchy, and it is sharper than "thick line near, thin line
far": it is a hard line between *actors* and *scenery*.

## 4 · Things worth stealing outright

- **The paving.** A diamond grid where each slab is randomly one of four
  near-white tints, with small lime weeds sprouting at the joints. Almost free
  to draw and it carries the whole ground plane.
- **Floating objects.** Vegetables, bottles, a shuttlecock, a fan drift through
  the frame in slow arcs, outlined and saturated. It is the ED's signature and
  it costs nothing.
- **Confetti dots.** Small coloured circles drifting on their own phases.
- **Long soft cast shadows** at the canal, which is what makes that section read
  as evening rather than noon.
- **A giant sleeping cat**, because why not.

## 5 · Scale and camera

The girl is **23 % of the frame height** (measured: 166–171 px of 720 across two
frames). At our logical view height of 600 units that is **≈ 138 units tall**.

The camera **follows her and scrolls smoothly**; it does not cut between static
plates within a location. She sits slightly left of centre.

## 6 · What this changes in the plan

| the plan said | the footage says |
| --- | --- |
| oblique, `y * TILT` | **2:1 isometric**, both axes tilted, vertical stays vertical |
| depth sort on `y` | depth sort on **`x + y`** |
| equal value, hue-separated, nothing near white | **near-white warm world**, saturation only on actors and accents |
| shadow pushed toward indigo | **shadow pushed warmer and more saturated** |
| hard-edged shadows | **soft-edged shadows** |
| outlines on everything, weighted | **outlines on actors only; none on architecture** |

Everything else in the plan survives: flat fills, one light, three faces per
box, specular dots, a parameterised prop kit, the street authored as data, and
springs for her hair and earrings.
