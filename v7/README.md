# v7 — the game being published

The mobile game for Google Play. A copy of `v5/` at build 52, which is now
being restructured from a 29-chamber randomised run into **a campaign of about
fifty authored levels in themed chapters**, with the randomised run surviving
as a second mode unlocked partway through.

`v5/` is untouched and stays playable. The plan this folder is built against
lives outside the repo, in the owner's plan file.

## The name

**The game is not named yet, and that is deliberate.** Naming it later costs
one edit, because of how `src/name.js` is arranged:

- **`SLUG` is permanent and invisible** — `v7`. It is the cache prefix and the
  save key. It does not change when the game is named, because changing it
  would orphan every save on every phone.
- **`NAME` and `SHORT` are what players see** — the title screen, the app icon
  label, the store listing. Free to change.

`manifest.json` and `index.html`'s `<title>` cannot import a module, so they
carry copies. `tools/check-version.mjs` fails if either drifts out of step with
`name.js`, and fails if any source file hard-codes the title instead of
importing `NAME`.

"Ashfall" is a working title.

## One character

v5 had two looks and let the player choose between them: the **Hooded One**,
seen from straight above and turning with the aim, and the **Wanderer**,
standing in a 3/4 view. This version has one: **the Wanderer, everywhere,
chambers included.** The character picker is gone from settings.

That is not a cosmetic tidy-up. The outfits are what this game is monetised
on, they are drawn on the Wanderer's eleven layered slots (`outfits.js`), and
keeping a second look in step with every outfit that will ever be sold is work
nobody would ever see the benefit of.

It also changes how the whole game looks, because `figures.js` only draws the
enemies as standing figures when the Wanderer's look is on. One switch, and
the chambers are populated by little people rather than top-down shapes.

`drawPlayer`'s hooded branch (`player.js:654`) and `drawPlayerRig` are now
unreachable. They are left in place rather than deleted: this folder is about
to be restructured heavily and removing things is cheaper once the shape has
settled.

## Why this folder has a checker

A new version is a copy with **nine identifiers changed across seven files** —
the cache prefix in `sw.js`, the prefix and entry path in `update.js`, the save
key in `save.js`, the Wilds key in `wilds-save.js`, two names in
`manifest.json`, `build.js`, and `index.html`'s title — plus one line in
`tools/bump-build.py` or the build number never moves and the title screen's
"up to date" readout quietly lies.

Miss one and nothing breaks today. The game boots, plays, looks right. It
breaks weeks later on someone's phone, when two versions turn out to share a
cache prefix and each service worker deletes the other's offline copy on
activate.

That is not hypothetical: **`savi/` shipped with two of the nine wrong** and
has been sharing v5's cache prefix ever since, because nothing checked.

```bash
node v7/tools/check-version.mjs
```

It also runs on every commit that touches `v7/`, via the pre-commit hook.

## Where this is going

| phase | |
| --- | --- |
| **1 · the folder** | ✅ done — its own cache, its own save, the name written down once |
| 2 · the fundamentals | `levels.js` as data, level flow, instant retry, owned boons with slots. Deliberately rough. |
| 3 · judge it on the phone | the decision point |
| 4 · the front end | the UI component set, then the chapter map, loadout and reward choice |
| 5 · phone blockers | safe-area insets, PNG icons, offline, touch target sizes |
| 6+ | one chapter dressed, the rest of the campaign, story, balance, cosmetics, submission |

## Inherited, and not yet dealt with

The copy brought all of `v5/` with it, including the Wilds open world, the
Training Ground, dungeons, the Music Room and The Lawn. None of that belongs in
a published mobile game, but removing it now risks breaking things that are
about to be restructured anyway. It gets stripped once the campaign flow is
real — not before.

## Running it

```bash
python serve.py 8000
```

Then `http://localhost:8000/v7/`, or the Campaign button on any other version's
title screen.
