// The Keeper of the tree — what she says, and what Savi can ask her.
//
// A tree of lines with choices, the way the dialogue in Ashfall works: a line
// of hers, and two to four things a child might actually say back. Nothing here
// gates anything. She is someone to talk to, and she will answer the same
// question twice if you ask it twice, because that is what old women do.
//
// `to` is the next line, or 'leave' to stop. `need` shows a choice only when
// that is true of the valley.

export const KEEPER = {
  // --- the first time, at the foot of a dying tree -----------------------------
  first: {
    text: 'The wind bites harder today, little one. Come nearer the fire, you will catch your death.',
    choices: [
      { say: 'What is wrong with the tree?', to: 'tree' },
      { say: 'Who are you?', to: 'who' },
      { say: 'Is it always this cold?', to: 'valley' },
    ],
  },
  tree: {
    text: 'The Great Banyan is dying. And if it falls, this valley freezes for good — you, me, the lot of it.',
    choices: [
      { say: 'Then give it water.', to: 'water' },
      { say: 'How do I help it?', to: 'help' },
      { say: 'What kind of tree needs saving?', to: 'who' },
    ],
  },
  water: {
    text: 'Water. Hah. No, child. This tree does not drink water — it drinks memories.',
    choices: [
      { say: 'Trees do not remember things.', to: 'remember' },
      { say: 'What memory?', to: 'story' },
    ],
  },
  remember: {
    text: 'This one does. It was planted to keep the greatest story of devotion our world has ever known. That is its whole purpose — to hold it, and not let it go.',
    choices: [
      { say: 'What story?', to: 'story' },
      { say: 'And it is forgetting?', to: 'help' },
    ],
  },
  story: {
    text: 'A girl who followed Death down the road and argued him out of it. But I cannot tell it to you — not properly. The tree has the telling of it, and the tree has gone quiet.',
    choices: [
      { say: 'Why has it gone quiet?', to: 'help' },
      { say: 'Then I will wake it.', to: 'send' },
    ],
  },
  help: {
    text: 'The land has grown cold, and the earth has choked its five Great Roots. A root that cannot breathe cannot carry anything back to the trunk. So the tree has forgotten its own legend, one piece at a time.',
    choices: [
      { say: 'I can clear them.', to: 'send' },
      { say: 'Why can you not do it?', to: 'frail' },
      { say: 'What is choking them?', to: 'burdens' },
    ],
  },
  burdens: {
    text: 'Leaves, where the wind piles them. Water, where it should not stand. Black thorn in the west. Snow that never goes. And in the north, ground so dead nothing will grow on it at all.',
    choices: [
      { say: 'That is a great deal for one girl.', to: 'frail' },
      { say: 'I will start with the leaves.', to: 'send' },
    ],
  },
  frail: {
    text: 'Look at my hands, child. I have not walked past that stone in two winters. But you — you have a warmth to your step. I felt the earth give under you before I saw your face.',
    choices: [
      { say: 'Where do I go first?', to: 'send' },
      { say: 'What do I clear them with?', to: 'broom' },
    ],
  },
  broom: {
    text: 'With that broom on your back, the same as you would sweep a doorstep. Lean into it and keep leaning — you are not strong, but you are stubborn, and stubborn is the one that finishes.',
    choices: [
      { say: 'And the thorn? The dead ground?', to: 'fire' },
      { say: 'Where do I go first?', to: 'send' },
    ],
  },
  fire: {
    text: 'Those will not move for a broom. Take a coal from my fire — go on, it will not burn you, not you — and hold it out to them. Hold it steady. They will draw back.',
    choices: [
      { say: 'I will take one.', to: 'send' },
      { say: 'What if it goes out?', to: 'emberOut' },
    ],
  },
  emberOut: {
    text: 'Then come back and take another, and mind the cold on the way. There are small fires along the north road. Stand at one a moment and your coal will come back to itself.',
    choices: [
      { say: 'Where do I go first?', to: 'send' },
    ],
  },
  who: {
    text: 'Nobody, now. I was the one who swept round the trunk and kept the lamp in it lit, and my mother before me, and hers. The keeper. There is not much keeping left in me.',
    choices: [
      { say: 'Then I will sweep it.', to: 'send' },
      { say: 'What is wrong with the tree?', to: 'tree' },
    ],
  },
  valley: {
    text: 'It was not. There was a proper autumn here once — a month of gold, and then rain, and then it turned. Now the gold came and never went, and the cold got in underneath it.',
    choices: [
      { say: 'What changed?', to: 'tree' },
      { say: 'How do I help?', to: 'help' },
    ],
  },
  send: {
    text: 'Then look at the roots, child. One of them will be lit — faint, like a coal under ash. That is the one the tree is reaching with. Follow it out, clear what sits on it, and come back and tell me.',
    choices: [
      { say: 'And the others?', to: 'others' },
      { say: 'I will go.', to: 'leave' },
    ],
  },
  others: {
    text: 'The cold is standing over them. It will not let you near, and there is no arguing with it — not yet. One at a time, in the order the tree wants them. It knows its own story better than we do.',
    choices: [
      { say: 'I will go.', to: 'leave' },
    ],
  },

  // --- between roots -----------------------------------------------------------
  back: {
    text: 'I felt that one come home. The trunk went warm under my hand — the first warm thing in this valley for two years.',
    choices: [
      { say: 'Which root now?', to: 'send' },
      { say: 'Tell me that piece again.', to: 'retell' },
      { say: 'How much is left?', to: 'howmuch' },
    ],
  },
  retell: { text: '', choices: [{ say: '…', to: 'leave' }] },   // filled in by the game
  howmuch: { text: '', choices: [{ say: 'I will go.', to: 'leave' }] },

  // --- all five ------------------------------------------------------------------
  done: {
    text: 'All five. Every one of them warm. Do you feel it coming up through your feet?',
    choices: [
      { say: 'What happens now?', to: 'ending' },
      { say: 'Is it enough?', to: 'ending' },
    ],
  },
  ending: {
    text: 'Now you go and stand under it, and you let it finish the story. It has been holding its breath for a long time, child. Go on.',
    choices: [{ say: 'I will.', to: 'leave' }],
  },
};

/** Where a conversation opens, given how far the valley has come. */
export function keeperStart(count, total, met) {
  if (count >= total) return 'done';
  if (!met) return 'first';
  return 'back';
}

/** The two lines the game fills in with what is actually true. */
export function keeperFill(count, total, lastBeat) {
  KEEPER.howmuch.text = count === 0
    ? 'Not one of them yet. Do not let that sit on you — five is only five.'
    : count === total - 1
      ? 'One. One root, and then we are done, and I can put this blanket down.'
      : `${count} awake, ${total - count} still cold. You are further than I got in two winters.`;
  KEEPER.retell.text = lastBeat || 'Nothing yet, child. Wake a root and there will be something to tell.';
  KEEPER.retell.choices = [{ say: lastBeat ? 'I remember now.' : 'I will go and wake one.', to: 'leave' }];
}
