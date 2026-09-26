// THE WORK, IN ORDER — what Savi has been sent to do, and who tells her.
//
// The game used to be a valley with five chores in it and an old woman who
// pointed vaguely at all of them at once. There was no reason Savi was there,
// no reason to start, and no reason ever to go back to the keeper once you had
// met her.
//
// She is the NEXT KEEPER. Caring for the Banyan's roots is a job, it was the
// old woman's job, and Savi has come to take it over. That turns the list of
// chores into an apprenticeship, and the loop into something deliberate:
//
//     the keeper teaches, and hands over a tool
//       -> you go and do the work
//         -> the tree gives back a piece of the legend
//           -> you come back, and she teaches the next thing
//
// Two fields hold all of it, on `st`:
//
//     st.done     0..5   how many roots are awake
//     st.briefed  bool   has she told me about the next one and given me the tool
//
// and one rule: NOTHING IS WALLED OFF. She can walk anywhere from the first
// minute. She simply cannot finish a root without the tool for it, and the
// tools come from the keeper. The gate is the fiction, not a fence - which also
// settles the old argument between telling the story in order and letting the
// player go where they like, because now the order is the story's and the
// reason for it is hers.

/** In the order the legend is told, which is the order she is sent. */
export const CHAIN = [
  {
    root: 'choice',
    tool: 'broom',
    where: 'south-west of the shrine',
    task: 'sweep the leaves off the buried root',
    brief: 'brief0',
  },
  {
    root: 'fall',
    tool: 'crank',
    where: 'the drowned course, east',
    task: 'cross the water and wind the sluice open',
    brief: 'brief1',
  },
  {
    root: 'pursuit',
    tool: 'lamp',
    where: 'the black thorn, west',
    task: 'hold the lamp out and let the thorn draw back',
    brief: 'brief2',
  },
  {
    root: 'steps',
    tool: 'lamp',
    where: 'the snow that never melts, north-east',
    task: 'thaw the snow off the root',
    brief: 'brief3',
  },
  {
    root: 'boon',
    tool: 'lamp',
    where: 'the dead ground, north',
    task: 'carry the lamp there and give it away',
    brief: 'brief4',
  },
];

/** What she is on now, or null when the five are done. */
export const stage = (st) => CHAIN[st.done] || null;

/** Has she been handed this? Tools are given, never found. */
export const has = (st, tool) => !!(st.tools && st.tools[tool]);

/** The one the current job needs, if she has it. */
export function toolFor(st) {
  const s = stage(st);
  return s && has(st, s.tool) ? s.tool : null;
}

/**
 * WHERE TO GO AND WHY, in one line, from one place - so the words at the top of
 * the screen and the arrow at its edge can never disagree with each other.
 * Returns null once there is nothing left to say.
 */
export function objective(st, ROOTS, WOMAN, TREE, here, gorge) {
  if (st.ended) return null;
  const s = stage(st);
  if (!s) {
    return { text: 'the tree is remembering — go to it', x: TREE.x, y: TREE.y, kind: 'tree' };
  }
  if (!st.briefed) {
    return {
      text: st.done === 0 ? 'find the keeper at the foot of the tree' : 'go back to the keeper',
      x: WOMAN.x, y: WOMAN.y, kind: 'keeper',
    };
  }
  const r = ROOTS.find((q) => q.id === s.root);
  // THE RIVER IS ENTERED AT ITS MOUTH AND NOWHERE ELSE, so until she is in the
  // gorge the mark goes on the mouth. It used to point at the root, which is
  // up at the head behind two miles of cliff - an arrow aimed through a rock
  // face is worse than no arrow at all.
  if (s.root === 'fall' && gorge && here && !gorge.inside(here.x, here.y)) {
    return { text: `the mouth of the gorge — ${gorge.where}`, x: gorge.mouth[0], y: gorge.mouth[1], kind: 'mouth' };
  }
  return { text: `${s.task} — ${s.where}`, x: r ? r.at.x : WOMAN.x, y: r ? r.at.y : WOMAN.y, kind: 'root' };
}

/** She has been told, and handed the thing. Called from the briefing. */
export function brief(st) {
  const s = stage(st);
  if (!s) return null;
  st.briefed = true;
  st.tools = st.tools || {};
  st.tools[s.tool] = true;
  return s;
}

/**
 * A root has woken. Where she is in the chain is READ BACK from which roots are
 * actually awake rather than counted up, so finishing one out of turn - the
 * leaves and the snow both take the broom - cannot slide the chain out of step
 * with the valley.
 */
export function rootDone(st) {
  let n = 0;
  while (n < CHAIN.length && st.woken[CHAIN[n].root]) n++;
  st.done = n;
  st.briefed = false;
}
