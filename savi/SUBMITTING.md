# Putting Savi on itch.io

## Build it

```bash
python savi/tools/pack-itch.py
```

That writes **`dist/savi-itch.zip`** — about 22 MB, 29 files. Upload that file.
Nothing else needs doing to it.

It also refreshes `savi/savi.bundle.js`, which is what makes double-clicking
`savi/index.html` work (see *Opening it off the disk* below). Re-run the
command after any change to `savi/src/`.

## Why not just zip the savi folder

You can, but there is one rule that will bite you and it is the only rule itch
is strict about:

> **`index.html` must be at the ROOT of the zip**, not inside a folder in it.

Right-clicking the `savi` folder in Explorer and choosing *Send to → Compressed
folder* puts the folder **inside** the zip, so the zip contains
`savi/index.html` and itch answers *"Could not find an index.html"*. To do it by
hand you have to open the folder, select everything **inside** it, and compress
that.

Two other reasons the built zip is better than the raw folder:

- **22 MB instead of about 50.** Only about thirty of the 108 files in `src/`
  are reachable from `savi.js`; the rest is inherited engine that would ship for
  nothing. They are bundled into one script and the rest is dropped. It also
  leaves out `tools/`, `WRITING.md`, `valley.html`, `COVER.png`, the loose
  screenshots and the `ASSETS/Hand-drawn assets/` working folder.
- **No dev furniture.** The build number and its REFETCH button on the title
  screen exist so you can tell whether your phone has the push you just made. A
  player has nothing to compare it to.

## The settings on the itch page

In order, on *Edit game*:

| Field | Set it to |
| --- | --- |
| Kind of project | **HTML** |
| Uploads | upload `dist/savi-itch.zip`, then tick **This file will be played in the browser** |
| Embed options | **Manually set size**, `960` × `540` |
| | ✅ **Fullscreen button** |
| | ✅ **Mobile friendly** (and leave orientation on *Default*) |
| Cover image | `savi/COVER.png` (630×500) |
| Genre | Adventure |

The game asks for fullscreen itself on a phone and locks to landscape where the
browser allows it, so the fullscreen button is a fallback rather than the main
route — but leave it on.

**Click-to-launch, not embed-on-load.** If itch offers it, prefer the version
where the player presses a button to start the game. The game needs a tap
before it can start audio anyway (every browser requires one), and the title
screen is that tap.

## Opening it off the disk

Double-clicking `savi/index.html` used to do nothing at all: a `<script
type="module">` is *fetched*, and a fetch from a `file://` URL is refused by
every browser as a cross-origin read.

The page now picks how to load itself by protocol — modules when it is served
(so editing a file and hitting reload still works), and the prebuilt
`savi.bundle.js` when it is opened straight off the disk. So the folder plays
by double-clicking, and so does the unzipped upload.

If double-clicking gives you a black screen, `savi.bundle.js` is stale or
missing: run the build command above.

## The limits, and where we are against them

| | limit | Savi |
| --- | --- | --- |
| files after extraction | 1000 | 29 |
| total size | 500 MB | 22.4 MB |
| largest single file | 200 MB | 1.5 MB |
| paths | relative only | relative only |
| external requests | must be HTTPS | none at all |

The packer checks the first three and refuses to write a zip with
`index.html` anywhere but the root.
