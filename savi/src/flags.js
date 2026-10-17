// WHAT SHIPS.
//
// Savi is being published on CrazyGames, and the platform's requirements are
// explicit that a game must not handle fullscreen itself:
//
//   "Custom fullscreen buttons (interfere with CrazyGames features)"
//
// CrazyGames supplies fullscreen through its own chrome around the iframe.
// A game that also requests it either silently fails - the iframe does not
// always carry the permission - or fights the portal's own control. Savi had
// three ways in: a pause-menu row, a global F key, and an automatic request
// on the first tap.
//
// WHY THIS IS A LITERAL AND NOT A CHECK.
//
// The obvious gate is "are we inside an iframe" or "is the SDK present", and
// both are the wrong shape. They answer at runtime, they can fail, and when
// they fail they fail OPEN - the prohibited control appears on the portal.
// A gate whose failure mode is "show the thing anyway" is not a gate.
//
// So the shipped build is decided here, at edit time, by a constant. Off the
// portal a developer opts back in with `?dev` in the URL. The failure mode is
// now "a developer loses a convenience", which is a bad afternoon rather than
// a rejected submission.
//
// What is NOT dropped: the landscape orientation lock and the wake lock. Those
// are not fullscreen, the platform has no objection to them, and a phone that
// dims or rotates mid-game is a worse game.

/** True in every committed build. */
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

/** May this build drive fullscreen itself? */
export const fullscreenAllowed = () => !SHIP || devRequested();
