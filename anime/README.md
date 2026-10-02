# anime — a street that looks like the ED

An experiment, in its own folder beside `v1`–`v5` and `savi`. The target is the
look of **正反対な君と僕 / You and I Are Polar Opposites**, and specifically its
season 1 ending, "Pure" by Pas Tasta feat. 橋本絵莉子.

Everything is drawn in code. No images, no generated art, no build step.

| | |
| --- | --- |
| `reference/NOTES.md` | what the ED actually looks like, measured off the footage |
| `reference/frames/`, `reference/sheet*.jpg` | the frames those numbers came from |
| `style-test.html` | **step 1** — one still screen, to judge the look |
| `src/view.js` | the one projection: 2:1 isometric, 31° camera, depth on `x + y` |
| `src/palette.js` | the two colour tiers and the measured shadow rule |
| `src/kit.js` | the prop primitives — box, post, awning, banner, foliage, machine, car |
| `src/girl.js` | her, as a cel drawing standing on a point |
| `src/style-test.js` | the scene, written as data |
| `tools/check-view.mjs` | there is exactly one projection, and it is the measured one |
| `tools/check-palette.mjs` | every colour obeys the rules the footage set |

## Looking at it

ES modules need a server; `file://` will not do.

```bash
python serve.py 8000
```

Then open `http://localhost:8000/anime/style-test.html`.

The page takes query parameters so the drawing can be inspected without being
rebuilt: `?z=2&cx=170&cy=-40` re-aims the camera, `?w=&h=` sets the canvas and
`?dw=` its display width.

## Checks

```bash
node anime/tools/check-view.mjs
node anime/tools/check-palette.mjs
```

The first one earned its keep on its first run: it found two places in the
scene file that were quietly doing their own projection — setting the camera's
screen origin by hand, and squashing a manhole cover with a hard-coded 0.515.
Both are the exact failure this project keeps hitting, and both were invisible
in the render.

## Where it stands

Measured on a desktop: **4.3 ms median** for the full scene, 6.9 ms at the 90th
percentile. A phone is several times slower, and roughly 3,900 paving slabs are
redrawn every frame — so the ground wants baking into a tile before this moves.

The scenery's median saturation is 22% against the ED's 14%. Close, slightly
hot, and worth pulling down as more of the street gets built.
