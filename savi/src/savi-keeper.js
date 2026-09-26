// THE KEEPER — what she says, and what Savi can ask her back.
//
// TWO KINDS OF CHOICE, and the difference is the whole point of this file.
//
//   SPINE   one choice that moves the game on. Marked `spine: true` and never
//           filtered out, ever. It is always sitting there.
//   ASIDE   everything else. Who she is, who kept the tree before her, why the
//           valley went cold, what the tree actually is. Asked once, answered,
//           and then retired - which is what makes asking them feel like
//           finding something rather than reading a menu.
//
// It used to be that a choice vanished as soon as its answer had been seen,
// with no way to tell one kind from the other. So the story itself got eaten:
// ask "Who are you?" on your first visit, come back later, and "What is wrong
// with the tree?" was simply gone. Now the asides drain away and the spine
// stays, and every aside returns to the hub it came from, so you can empty the
// whole basket and still have somewhere to go.
//
// The hub she opens on comes from the quest state, not from guesswork:
// whether she has briefed you, and how many roots are awake.

export const KEEPER = {
  // --- the first meeting -------------------------------------------------------
  welcome: {
    repeat: true,
    text: 'So they sent someone after all. Come to the fire, child — you will catch your death standing there.',
    choices: [
      { say: 'What is wrong with the tree?', to: 'tree', spine: true },
      { say: 'Who are you?', to: 'who' },
      { say: 'Is it always this cold here?', to: 'valley' },
    ],
  },
  tree: {
    repeat: true,
    text: 'It is dying. The Great Banyan, that has stood here longer than the village, and it is going out like a lamp.',
    choices: [
      { say: 'Then give it water.', to: 'water', spine: true },
      { say: 'How long has it been like this?', to: 'howlong' },
    ],
  },
  water: {
    repeat: true,
    text: 'Water. Hah. No, child. This tree does not drink water — it drinks memories. It was planted to hold one story and never let it go, and it has been forgetting it, one piece at a time.',
    choices: [
      { say: 'How does a tree forget?', to: 'roots', spine: true },
      { say: 'What story?', to: 'story' },
      { say: 'Trees do not remember anything.', to: 'remember' },
    ],
  },
  roots: {
    repeat: true,
    text: 'Through its roots. It has five Great Roots and every one of them is choked — buried, drowned, bound, frozen, starved. A root that cannot breathe carries nothing home. Free them and it remembers.',
    choices: [
      { say: 'Then that is my work. Where do I start?', to: 'brief0', spine: true },
      { say: 'Why can you not do it?', to: 'frail' },
      { say: 'Who did this before me?', to: 'before' },
    ],
  },

  // --- the five briefings ------------------------------------------------------
  //
  // Each one says what the burden is, WHY it is there, and what the tool in her
  // hand will do about it. The tool is handed over at the end of it, which is
  // the moment the task begins.

  brief0: {
    repeat: true,
    text: 'South-east of the shrine, where the ground dips. Two autumns of leaves have come down in that hollow and nobody swept them, and now the root under them cannot feel the air.',
    choices: [
      { say: 'I will sweep it.', to: 'give0', spine: true },
      { say: 'Why does it matter if leaves lie on it?', to: 'whyleaves' },
    ],
  },
  give0: {
    repeat: true,
    give: 'broom',
    text: 'Take my broom, then. Lean into it and keep leaning — you are not strong, you are stubborn, and stubborn is the one that finishes. Come back when it can breathe.',
    choices: [{ say: 'I will.', to: 'leave', spine: true }],
  },

  brief1: {
    repeat: true,
    text: 'East, now. The stream that fed this valley used to run out through a stone sluice at the head of its gorge — and two winters ago the gate jammed shut. The water had nowhere to go, so it climbed its own banks, and a Great Root has been under it ever since.',
    choices: [
      { say: 'Then I open the gate.', to: 'give1', spine: true },
      { say: 'Who built a sluice out there?', to: 'sluicewho' },
      { say: 'How do I get across water?', to: 'howcross' },
    ],
  },
  give1: {
    repeat: true,
    give: 'crank',
    text: 'You will need this. The capstan by the gate has no handle — it was taken off so the hill folk could not flood the road with it. Fit the crank, put your shoulder to the bar, and walk it round three times. The gate comes up as you go.',
    choices: [{ say: 'And the water itself?', to: 'howcross' }, { say: 'I will go.', to: 'leave', spine: true }],
  },

  brief2: {
    repeat: true,
    text: 'West. There is black thorn over that root, and it did not grow there by accident — thorn comes up where the ground has gone cold and nothing else will hold it. It has been closing for two years.',
    choices: [
      { say: 'How do I get through thorn?', to: 'give2', spine: true },
      { say: 'Is it dangerous?', to: 'thornsafe' },
    ],
  },
  give2: {
    repeat: true,
    give: 'lamp',
    text: 'You do not cut it, child, you warm it. Take this lamp — a coal of my own fire in it. Thorn draws back from warmth the way a hand draws back from a stove. Hold it out in front of you and walk slowly, and it will open a way for you.',
    choices: [
      { say: 'What if it goes out?', to: 'lampout' },
      { say: 'I will go.', to: 'leave', spine: true },
    ],
  },

  brief3: {
    repeat: true,
    text: 'North-east, under the snow that never melts. That one is not choked so much as buried — the cold got into it and it has not come out. Take the broom back; snow does not scatter the way leaves do, so it will be slower work, and you will feel it.',
    choices: [
      { say: 'I will clear it.', to: 'give3', spine: true },
      { say: 'Why does that snow never go?', to: 'whysnow' },
    ],
  },
  give3: {
    repeat: true,
    give: 'broom',
    text: 'Go on, then. Keep your hands moving and do not stand still out there.',
    choices: [{ say: 'I will.', to: 'leave', spine: true }],
  },

  brief4: {
    repeat: true,
    text: 'The last one is north, on the dead ground. Nothing grows there and nothing has for a long while. That root is not buried or bound — it is starved, and there is nothing out there to give it.',
    choices: [
      { say: 'Then I take something to it.', to: 'give4', spine: true },
      { say: 'What happened to that ground?', to: 'whyash' },
    ],
  },
  give4: {
    repeat: true,
    give: 'lamp',
    text: 'The lamp again, and mind it on the way — it is a long cold walk and a coal does not like the cold. There are little fires along the north road; stand at one a moment if it dims. And when you reach the root, child, you give the lamp away. All of it.',
    choices: [
      { say: 'Give it away? Then I will have nothing.', to: 'giveaway' },
      { say: 'I will go.', to: 'leave', spine: true },
    ],
  },

  // --- while she is out working -------------------------------------------------
  remind: {
    repeat: true,
    text: '',                                   // filled in by the game
    choices: [{ say: 'I am going.', to: 'leave', spine: true }],
  },
  back: {
    repeat: true,
    text: 'I felt that one come home. The trunk went warm under my hand — the first warm thing in this valley for two winters.',
    choices: [
      { say: 'What is next?', to: 'brief0', spine: true },   // retargeted in keeperFill
      { say: 'Tell me that piece again.', to: 'retell' },
      { say: 'How much is left?', to: 'howmuch' },
    ],
  },

  // --- the asides ------------------------------------------------------------------
  //
  // Each answers once and hands back to the hub it was asked from, so nothing
  // is ever a dead end and the spine is always still there underneath.

  who: {
    text: 'Nobody, now. I kept this tree — swept round the trunk, kept the lamp in it lit, the way my mother did, and hers. The keeper. There is not much keeping left in me.',
    choices: [{ say: 'And now?', to: 'welcome' }],
  },
  valley: {
    text: 'It was not always. There was a proper autumn here once — a month of gold, then rain, then it turned. Now the gold came and never went, and the cold got in underneath it.',
    choices: [{ say: 'I see.', to: 'welcome' }],
  },
  howlong: {
    text: 'Two winters that I have counted. It went slowly at first. You do not notice a thing going out until the evening you look up and it has.',
    choices: [{ say: 'Go on.', to: 'tree' }],
  },
  story: {
    text: 'A girl who followed Death down the road and argued him out of it. But I cannot tell it to you, not properly — the tree has the telling of it, and the tree has gone quiet.',
    choices: [{ say: 'Then I will wake it.', to: 'water' }],
  },
  remember: {
    text: 'This one does. Why do you think anyone planted a banyan here, where nothing else will take? It was put here to hold that story. That is its whole purpose, and it is failing at it.',
    choices: [{ say: 'All right.', to: 'water' }],
  },
  frail: {
    text: 'Look at my hands, child. I have not walked past that stone in two winters. But you — you have a warmth to your step. I felt the ground give under you before I saw your face.',
    choices: [{ say: 'Then I will go.', to: 'roots' }],
  },
  before: {
    text: 'Keepers, all the way back. My mother. Her mother. A line of women with sore backs and clean courtyards. You are the next one, and I am glad of it, and I am sorry for it.',
    choices: [{ say: 'I understand.', to: 'roots' }],
  },
  whyleaves: {
    text: 'A root breathes, the same as you do. Bury it deep enough for long enough and it stops trying. Two autumns is long enough.',
    choices: [{ say: 'Then I will start there.', to: 'brief0' }],
  },
  sluicewho: {
    text: 'The old people, before any of us. They cut the channel and hung a gate on it so the valley would not drown every spring. It worked for three hundred years, which is longer than most things.',
    choices: [{ say: 'And now it is stuck.', to: 'brief1' }],
  },
  howcross: {
    text: 'Leaves, child. Great ones, broad as cartwheels, come down off the banyan and float there. They will hold you if you keep moving. Some drift, so watch them a moment before you trust them.',
    choices: [{ say: 'Right.', to: 'brief1' }],
  },
  thornsafe: {
    text: 'It will not bite you. It will only refuse to let you past, which in its way is worse — it has refused me for two years.',
    choices: [{ say: 'Not me.', to: 'brief2' }],
  },
  lampout: {
    text: 'Then come back and I will light it again, and mind the cold on the way. There are small fires along the roads. Stand at one a moment and the coal comes back to itself.',
    choices: [{ say: 'I will remember.', to: 'brief2' }],
  },
  whysnow: {
    text: 'Because the tree stopped warming the ground. That is what a banyan does, you know — the whole valley sits under it, and when it goes cold, everything under it does too. That snow is a symptom, not a cause.',
    choices: [{ say: 'Then it will go when the tree comes back.', to: 'brief3' }],
  },
  whyash: {
    text: 'A fire, long before me. It burned through and the ground never took anything again. Some places hold a grudge.',
    choices: [{ say: 'I see.', to: 'brief4' }],
  },
  giveaway: {
    text: 'You will have nothing, and it will be dark, and that is the whole of it. The last root does not want work, child. It wants a gift. There is a difference and you will feel it.',
    choices: [{ say: 'Then I will give it.', to: 'brief4' }],
  },
  retell: { repeat: true, text: '', choices: [{ say: '…', to: 'back' }] },
  howmuch: { repeat: true, text: '', choices: [{ say: 'I will go on.', to: 'back' }] },

  // --- all five awake ----------------------------------------------------------------
  done: {
    repeat: true,
    text: 'All five. Look at it, child — look up. It is remembering. Go and stand under it and let it finish.',
    choices: [{ say: 'Come with me.', to: 'leave', spine: true }],
  },
};

/**
 * Which hub she opens on. From the quest state, not from guessing: whether she
 * has briefed you for the job you are on, and whether you have just come back
 * from finishing one.
 */
export function keeperStart(st, total) {
  if (st.done >= total) return 'done';
  if (st.briefed) return 'remind';
  // She resumes where the STORY got to, not where the player got to. Walking
  // off in the middle of the first conversation used to skip her straight to
  // the job, so the whole reason for the job never got said.
  if (st.done === 0) return st.asked && st.asked.roots ? 'brief0' : 'welcome';
  return 'back';
}

/** The lines the game fills in with what is actually true right now. */
export function keeperFill(st, total, lastBeat, stageNow) {
  const left = total - st.done;
  KEEPER.howmuch.text = st.done === 0
    ? 'Not one of them yet. Do not let that sit on you — five is only five.'
    : left === 1
      ? 'One. One root, and then we are done, and I can put this blanket down.'
      : `${st.done} awake, ${left} still cold. You are further than I got in two winters.`;
  KEEPER.retell.text = lastBeat || 'Nothing yet, child. Wake a root and there will be something to tell.';
  KEEPER.remind.text = stageNow
    ? `You have what you need, child. ${cap(stageNow.task)} — ${stageNow.where}.`
    : 'Off you go.';
  // Her "what is next?" points at the job in hand, so the spine is never a hop
  // through an empty node.
  KEEPER.back.choices[0].to = stageNow ? stageNow.brief : 'done';
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
