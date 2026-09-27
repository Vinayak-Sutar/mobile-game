// Savi — the three things nobody told the player.
//
// She walks out onto the snow road with no idea what the buttons are. The
// game had one line of grey text along the bottom of the screen listing all
// of them at once, hidden on a phone, at a quarter opacity after sixteen
// seconds. That is a credits roll, not teaching.
//
// So: three prompts, on the first stretch of road and nowhere else, one at a
// time, each waiting until the player has actually DONE the thing before it
// moves on. Walk, jump, dash - in that order, because that is the order the
// road asks for them.
//
// WHAT MAKES IT STOP. Each step ends when the player does it, not when a
// timer runs out: a prompt that vanishes before you worked out what it meant
// has taught nobody anything, and one that stays after you have obviously
// got it is nagging. The whole sequence ends for good the moment the keeper
// sends her to the first root, whether or not all three were finished -
// after that the valley is the teacher and the pause screen is the manual.
//
// WHAT IT CALLS THINGS. Every word comes from the key table, so a rebound key
// is taught as the key the player chose, and a pad is taught in the names
// printed on the pad in their hands.

import { keyLabel, keyLabels, padName } from './savi-keys.js';

export const teach = {
  step: 0,            // which of the three
  t: 0,               // how long this one has been up
  got: 0,             // how long ago they did it (0 = not yet)
  walked: 0,          // units travelled on the ground
  jumped: 0,
  dashed: 0,
  over: false,
};

/**
 * The three, in order. `need` is what counts as having learned it.
 *
 * Walking wants a real distance and not one frame of a key: 340 units is
 * about two seconds of honest walking, far enough that the player has felt
 * the stick rather than brushed it.
 */
export const STEPS = [
  { id: 'walk', need: (t) => t.walked > 340 },
  { id: 'jump', need: (t) => t.jumped > 0 },
  { id: 'dash', need: (t) => t.dashed > 0 },
];

/** The wording, per device, for the step we are on. */
export function teachLine(step, { touch, pad }) {
  if (step === 0) {
    if (touch) return 'drag the left side to walk';
    if (pad) return `${padName('move')} or the d-pad to walk`;
    // W A S D, off the table, so a rebind is taught as what they chose.
    const one = (id) => keyLabels(id).split(' / ')[0];
    return `${one('up')} ${one('left')} ${one('down')} ${one('right')} to walk`;
  }
  if (step === 1) {
    if (touch) return 'tap JUMP, bottom right';
    return `${pad ? padName('jump') : keyLabel('jump')} to jump`;
  }
  if (step === 2) {
    if (touch) return 'tap DASH for a little run';
    return `${pad ? padName('dash') : keyLabel('dash')} to dash`;
  }
  return '';
}

/** And what it says for the second or so after they have done it. */
export const GOT = ['good', 'good', 'that is all three'];

/**
 * One frame of it.
 *
 * @param dt      seconds
 * @param moved   how far she travelled on the ground this frame
 * @param stop    true once the valley has taken over the teaching
 */
export function stepTeach(dt, moved, stop) {
  if (teach.over) return;
  if (stop) { teach.over = true; return; }
  teach.walked += moved;
  const s = STEPS[teach.step];
  if (!s) { teach.over = true; return; }
  teach.t += dt;
  if (teach.got > 0) {
    // A beat of "good" before the next one, so the three do not read as one
    // block of instructions that appeared all at once.
    teach.got += dt;
    if (teach.got > 1.5) {
      teach.step++;
      teach.t = 0;
      teach.got = 0;
      if (teach.step >= STEPS.length) teach.over = true;
    }
    return;
  }
  // Half a second before the first one, so it is not on the screen while the
  // valley is still fading up out of the film.
  if (teach.step === 0 && teach.t < 0.5) return;
  if (s.need(teach)) teach.got = 0.0001;
}

export function noteJump() { teach.jumped++; }
export function noteDash() { teach.dashed++; }

/** What to put on the screen, or null. */
export function teachText(device) {
  if (teach.over) return null;
  if (teach.step === 0 && teach.t < 0.5) return null;
  if (teach.got > 0) return { text: GOT[teach.step] || 'good', got: true };
  const text = teachLine(teach.step, device);
  return text ? { text, got: false } : null;
}

/** For the checker, and for a second playthrough in one tab. */
export function resetTeach() {
  teach.step = 0; teach.t = 0; teach.got = 0;
  teach.walked = 0; teach.jumped = 0; teach.dashed = 0; teach.over = false;
}
