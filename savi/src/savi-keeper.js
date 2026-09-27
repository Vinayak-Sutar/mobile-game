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
    text: 'So they sent someone after all. Come to the fire, child. You will catch your death standing there.',
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
    text: 'Water. It has all the water in these hills, child. It is not thirsty. It is CHOKED. A tree drinks through its roots, and every root it has is buried, or drowned, or bound, or frozen, or under half a hillside.',
    choices: [
      { say: 'Then we need to treat those roots.', to: 'roots', spine: true },
      { say: 'Why does this one tree matter so much?', to: 'story' },
      { say: 'Can a tree not grow new roots?', to: 'remember' },
    ],
  },
  roots: {
    repeat: true,
    text: 'Five Great Roots it has, and a root that cannot breathe carries nothing home. Free them. You will find murals on them, and those murals carry a great story.',
    choices: [
      { say: 'Then that is my work. Where do I start?', to: 'brief0', spine: true },
      { say: 'Why can you not do it?', to: 'frail' },
      { say: 'What is on the murals?', to: 'before' },
    ],
  },

  // --- the five briefings ------------------------------------------------------
  //
  // Each one says what the burden is, WHY it is there, and what the tool in her
  // hand will do about it. The tool is handed over at the end of it, which is
  // the moment the task begins.

  brief0: {
    repeat: true,
    text: 'South-west of the shrine, where the ground dips. Two autumns of leaves have come down in that hollow and nobody swept them, and now the root under them cannot feel the air.',
    choices: [
      { say: 'I will sweep it.', to: 'give0', spine: true },
      { say: 'Why does it matter if leaves lie on it?', to: 'whyleaves' },
    ],
  },
  give0: {
    repeat: true,
    give: 'broom',
    text: 'Take my broom, then. It is a wide drift and it will take you a while. Come back when the root can breathe.',
    choices: [{ say: 'I will.', to: 'leave', spine: true }],
  },

  brief1: {
    repeat: true,
    text: 'East, now. There is a gate out there that lets the water out of the valley. It jammed shut two winters ago. The water rose, and one of the Great Roots has been under it ever since.',
    choices: [
      { say: 'Then I open the gate.', to: 'give1', spine: true },
      { say: 'How do I get across water?', to: 'howcross' },
    ],
  },
  give1: {
    repeat: true,
    give: 'crank',
    text: 'You will need this. There is a wheel by the gate that lifts it, and the handle was taken off it years ago so nobody could flood the road for a joke. Fit this crank on, put your shoulder to the bar, and walk it round three times. The gate comes up as you go.',
    choices: [{ say: 'And the water itself?', to: 'howcross' }, { say: 'I will go.', to: 'leave', spine: true }],
  },

  brief2: {
    repeat: true,
    text: 'West. There is black thorn over that root, and it did not grow there by accident. Thorn comes up where the ground has gone cold and nothing else will hold it. It has been closing for two years.',
    choices: [
      { say: 'How do I get through thorn?', to: 'give2', spine: true },
      { say: 'Is it dangerous?', to: 'thornsafe' },
    ],
  },
  give2: {
    repeat: true,
    give: 'lamp',
    text: 'You do not cut it, child, you burn it. Take this lamp. It will not burn without a coal in it, and I have put one of mine in. Hold it out at the thorn and burn a way through.',
    choices: [
      { say: 'What if it goes out?', to: 'lampout' },
      { say: 'I will go.', to: 'leave', spine: true },
    ],
  },

  brief3: {
    repeat: true,
    text: 'North-east now, under the snow that never melts. A broom is no good to you there. You cannot brush cold off a thing. That one has to be thawed.',
    choices: [
      { say: 'Then I take the lamp.', to: 'give3', spine: true },
      { say: 'Why does that snow never go?', to: 'whysnow' },
    ],
  },
  give3: {
    repeat: true,
    give: 'lamp',
    text: 'Lit and full. Stand close and let it work. The snow will go back from you in a ring and you follow it in. It drinks heat faster than thorn does, mind, so keep an eye on the coal and do not dawdle.',
    choices: [
      { say: 'And if it goes out?', to: 'lampout' },
      { say: 'I will go.', to: 'leave', spine: true },
    ],
  },

  brief4: {
    repeat: true,
    text: 'The last one is north, at the head of the valley. Half the hillside came down on it the winter before last and it has been under the stones ever since. No fire will shift that, and no broom either, not while they are sitting on it.',
    choices: [
      { say: 'Then I will move them.', to: 'give4', spine: true },
      { say: 'Nobody cleared it?', to: 'whyash' },
    ],
  },
  give4: {
    repeat: true,
    give: 'broom',
    text: 'One at a time, child, and no cleverness about it. There is a spring up there, the one this whole valley drinks out of. Throw them in. It has swallowed bigger. And when the last one is off, sweep the grit they leave behind, and you will find the root under it.',
    choices: [
      { say: 'Into the water? Will that not spoil it?', to: 'giveaway' },
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
    // Filled in by keeperFill with what she has to say about the beat that
    // just came back. This is only the fallback.
    text: 'You have treated that root. The trunk went warm under my hand as it took.',
    // ONE LINE. "Tell me that piece again" repeated something she had heard
    // a minute earlier, which the panel on the tree does properly whenever
    // she likes, and "How much is left?" read back a number that is already
    // at the top of the screen. Neither of them told her anything, and two
    // rows of nothing on the one hub she comes back to five times is worse
    // than no rows at all.
    choices: [
      { say: 'What is next?', to: 'brief0', spine: true },   // retargeted in keeperFill
    ],
  },

  // --- the asides ------------------------------------------------------------------
  //
  // Each answers once and hands back to the hub it was asked from, so nothing
  // is ever a dead end and the spine is always still there underneath.

  who: {
    text: 'The keeper. They choose one out of the villages and send her up, the way they have always done, the way they sent you. I was nine when they sent me. There is not much keeping left in me now.',
    choices: [{ say: 'I see.', to: 'welcome' }],
  },
  valley: {
    text: 'It was not always cold here. The tree\'s roots have gone untended, and everything under a banyan goes the way the banyan goes.',
    choices: [{ say: 'I see.', to: 'welcome' }],
  },
  howlong: {
    text: 'Two winters that I have counted. It went slowly at first. You do not notice a thing going out until the evening you look up and it has.',
    choices: [{ say: 'Go on.', to: 'tree' }],
  },
  story: {
    text: 'Because of what happened under it, long ago. That is why they come up and tie their threads on it. I knew the whole of it word for word once. I have told it a hundred times. But I am old and it has gone out of me. Free the roots, and the murals may bring it back.',
    choices: [{ say: 'I want to hear that story.', to: 'water' }],
  },
  remember: {
    text: 'Not at its age, and not in this cold.',
    choices: [{ say: 'All right.', to: 'water' }],
  },
  frail: {
    text: 'Look at my hands, child. I have not walked past that stone in two winters. But you have a warmth to your step.',
    choices: [{ say: 'Then I will go.', to: 'roots' }],
  },
  before: {
    text: 'The story. One piece of it to a root. That is the whole reason the murals are there, and the reason nobody has read one in two winters.',
    choices: [{ say: 'I understand.', to: 'roots' }],
  },
  whyleaves: {
    text: 'These are not roots under the ground, child. A banyan\'s great roots lie on top of it. You could walk the length of one. Two autumns of wet leaves over that is a blanket that never dries, and nothing under it ever sees the sun.',
    choices: [{ say: 'Then I will start there.', to: 'brief0' }],
  },
  howcross: {
    text: 'Leaves, child. Great ones, broad as cartwheels, come down off the banyan and float there. They will hold you if you keep moving. Some drift, so watch them a moment before you trust them.',
    choices: [{ say: 'Right.', to: 'brief1' }],
  },
  thornsafe: {
    text: 'It will not bite you. It will only refuse to let you past.',
    choices: [{ say: 'Not me.', to: 'brief2' }],
  },
  lampout: {
    text: 'Stand at any fire a moment and it fills again.',
    choices: [{ say: 'I will remember.', to: 'brief2' }],
  },
  whysnow: {
    text: 'Because the tree stopped warming the ground. That is what a banyan does, you know. The whole valley sits under it, and when it goes cold, everything under it does too. That snow is a symptom, not a cause.',
    choices: [{ say: 'Then it will go when the tree comes back.', to: 'brief3' }],
  },
  whyash: {
    text: 'I tried. I was already old when it came down and there is only so much an old woman can lift. I got nine of them off and then I sat down on the tenth, and that was the end of that.',
    choices: [{ say: 'I see.', to: 'brief4' }],
  },
  giveaway: {
    text: 'Spoil it? Stones are what a spring is made of, child. It has been running over them since before the tree. Put them back where they came from and it will not notice.',
    choices: [{ say: 'Then I will go.', to: 'brief4' }],
  },

  // --- all five awake, and the end of it in three beats ---------------------------
  //
  // It used to be one: stand near the tree with five roots done and the whole
  // climax fired at you on the spot. Now she is sent, she reads it herself,
  // and she comes back and is told what she has become.

  sendoff: {
    repeat: true,
    mark: 'sent',
    text: 'All five. I felt the last one go. Now, there is a sixth mural, child, and it is not on any sapling. It is on the Great Banyan itself, low on the braid of the trunk, and I have not walked that far in two winters. Go and read me the end of it.',
    choices: [{ say: 'I will go and look.', to: 'leave', spine: true }],
  },
  farewell: {
    repeat: true,
    mark: 'blessed',
    text: 'So she won him with a sentence. I had forgotten that. Forty years I have sat under this tree and I had forgotten the best part of it.',
    choices: [
      { say: 'It is all back now.', to: 'blessing', spine: true },
      { say: 'How could you forget it?', to: 'howforget' },
    ],
  },
  howforget: {
    text: 'You tell a thing to nobody for long enough and it goes. That is all. There was no one to tell. The village stopped coming up when the gold would not fall, and a story with no one to hear it is only weather in your head.',
    choices: [{ say: 'Somebody heard it today.', to: 'blessing', spine: true }],
  },
  blessing: {
    repeat: true,
    mark: 'blessed',
    text: 'Look at you. Ash on your hands and the whole of it in your head. You are fit to keep this tree, child. You are the keeper now, and I am the old woman who sits by the fire. Let me have that for whatever days are left. Go on. Go and walk in it.',
    choices: [{ say: 'I will be here.', to: 'leave', spine: true }],
  },
  /** After the credits: whatever is on her mind, and nothing is asked of anyone. */
  idle: { repeat: true, text: '', choices: [{ say: '…', to: 'leave', spine: true }] },
};

/**
 * WHAT SHE SAYS WHEN THERE IS NOTHING LEFT TO DO. Small, ordinary, and about
 * the valley rather than the quest - an old woman with her feet warm, saying
 * what she notices. Picked at random each time she is spoken to.
 */
export const IDLE = [
  'Listen to that. Birds. I had got so used to the quiet I thought that was the sound a valley made.',
  'The gold is coming down at last. Two autumns it hung up there refusing to fall, and now look at it.',
  'Sit a while if you like. I am not going anywhere and neither, apparently, is the tree.',
  'There were deer in the lower field this morning. I have not seen a deer since before you were born.',
  'They will start coming up again, you know. The women, with their threads. You will have to learn all their names.',
  'I was your age once and I thought this job was sweeping. It is not sweeping.',
  'Do not let them tell you the tree did it by itself. I saw who did it.',
  'It is warm. Feel the trunk. It has not been warm in two winters and it is warm.',
];

/**
 * Which hub she opens on. From the quest state, not from guessing: whether she
 * has briefed you for the job you are on, and whether you have just come back
 * from finishing one.
 */
export function keeperStart(st, total) {
  // The end, backwards: after the credits she is only company; before them
  // she has a blessing to give; before that she is sending Savi to the tree.
  if (st.after) return 'idle';
  if (st.bloom >= 1) return st.blessed ? 'idle' : 'farewell';
  if (st.done >= total) return 'sendoff';
  if (st.briefed) return 'remind';
  // She resumes where the STORY got to, not where the player got to. Walking
  // off in the middle of the first conversation used to skip her straight to
  // the job, so the whole reason for the job never got said.
  if (st.done === 0) return st.asked && st.asked.roots ? 'brief0' : 'welcome';
  return 'back';
}

/** The lines the game fills in with what is actually true right now. */
export function keeperFill(st, stageNow, onLast) {
  KEEPER.idle.text = IDLE[(Math.random() * IDLE.length) | 0];
  // SHE HAS SOMETHING TO ADD. She used to greet every root with the same
  // sentence about the trunk going warm, five times, which made her a door
  // you walk through rather than the only other person in the valley.
  if (onLast) KEEPER.back.text = `You have treated that root. ${onLast}`;
  KEEPER.remind.text = stageNow
    ? `You have what you need, child. ${cap(stageNow.task)} — ${stageNow.where}.`
    : 'Off you go.';
  // Her "what is next?" points at the job in hand, so the spine is never a hop
  // through an empty node.
  KEEPER.back.choices[0].to = stageNow ? stageNow.brief : 'sendoff';
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
