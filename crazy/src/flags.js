// WHAT SHIPS, AND WHAT DOES NOT.
//
// The title screen carries eleven buttons into The Wilds, the dungeons, the
// Training Ground, the Lawn, the Music Room, a controller check and more. All
// of it is worth keeping and none of it belongs in front of someone who came
// to play. Two of those doors would also fail submission outright: a custom
// fullscreen button is prohibited, and links out to other builds count as
// cross-promotion.
//
// WHY THIS IS A LITERAL AND NOT A CHECK.
//
// The obvious gate is portal.js's `onPortal()` - "are we on CrazyGames?" - and
// it is the wrong one. It answers by looking for the SDK, so an ad blocker, a
// slow CDN or a blocked script makes it FALSE while sitting on the portal, and
// the dev menu ships. A gate whose failure mode is "show everything" is not a
// gate.
//
// So the shipped build is decided here, at edit time, by a constant that a
// checker can read as text. Off the portal a developer opts back in with
// `?dev` in the URL. The failure mode is now "a developer loses a button",
// which is a bad afternoon rather than a rejected submission.

/** True in every committed build. Flip it only to take a screenshot. */
export const SHIP = true;

let asked = false;
let wanted = false;

/** `?dev` in the URL - read once, because it cannot change mid-session. */
function devRequested() {
  if (!asked) {
    asked = true;
    try { wanted = new URLSearchParams(location.search).has('dev'); } catch { wanted = false; }
  }
  return wanted;
}

/**
 * May this build show developer doors?
 *
 * `?dev` and nothing else. The first version also required `!onPortal()` as
 * belt-and-braces, which was worse than useless: onPortal() answered "did the
 * SDK script load", which is true on localhost, so the door never opened
 * anywhere. It is also the wrong shape of check - it reads the environment at
 * boot, before init() has resolved, so it cannot be trusted either way.
 *
 * The URL is enough. On the portal the game is embedded in an iframe whose src
 * CrazyGames controls, so `?dev` is not reachable by a player or a reviewer,
 * and SHIP already decides what a committed build does.
 */
export const devEnabled = () => !SHIP || devRequested();
