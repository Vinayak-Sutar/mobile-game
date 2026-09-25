// Savi — the legend, told a line at a time with the speaker's face beside it.
//
// Each line is [who, text]. `who` picks the portrait that slides in while it is
// spoken (savi-art.js drawPortrait): the keeper telling it, and Savitri,
// Satyavan, Narada and Yama appearing as she names them — the way Hades puts
// the speaker's face at the edge of the screen and leaves the world behind it.
//
// Every Great Root the player frees gives the tree back one beat, and a young
// banyan rises on that root with the beat carved into it, to be walked up to
// and read again whenever.

export const ROOTS = [
  {
    id: 'choice',
    name: 'The Choice',
    mural: 'choice',
    hint: 'Southwest, where the leaves lie deepest.',
    lines: [
      ['keeper', 'Ah... I remember her fire. Savitri, a princess so bright that grown men stepped out of her way.'],
      ['savitri', 'I have chosen. He is the one.'],
      ['keeper', 'She chose her own fate, and gave her heart to Satyavan — a banished prince living in the dust of a forest.'],
      ['satyavan', 'I have nothing. A hut, and my blind father, and the wood.'],
      ['keeper', 'They rejoiced. And then the sage Narada came to the palace with a shadow in his eyes.'],
      ['narada', 'The boy is faultless, my King. And in one year from today, he will die.'],
      ['keeper', 'A cursed love. The princess would not be moved by it. And the year began to run.'],
    ],
  },
  {
    id: 'fall',
    name: 'The Fall',
    mural: 'fall',
    hint: 'East, in the hollow the water has taken.',
    lines: [
      ['keeper', 'She did not run from it. She put off her gold, wore bark, and counted the days without telling a soul.'],
      ['savitri', 'Three days without food or sleep. Let the fast hold what my hands cannot.'],
      ['keeper', 'On the last morning she followed him into the deep woods and would not be left behind.'],
      ['satyavan', 'My head — it is only the heat. Let me put it in your lap a moment.'],
      ['keeper', 'He struck at a branch, cried out, and fell. The forest went cold. The birds stopped.'],
      ['yama', 'Let him go, daughter. He is mine now.'],
      ['keeper', 'A shadow put out the sun. Yama, the Lord of Death, had come with his noose.'],
    ],
  },
  {
    id: 'pursuit',
    name: 'The Pursuit',
    mural: 'pursuit',
    hint: 'West, where the black thorn has closed over.',
    lines: [
      ['keeper', 'He drew the soul out of the boy, small and bright as a lamp, and turned south for the dark country.'],
      ['yama', 'Mortal. Turn back. The living do not walk this road.'],
      ['savitri', 'Where my husband goes, I go. My road is tied to his.'],
      ['keeper', 'She did not weep, and she did not kneel. She stood up and walked after Death himself.'],
      ['keeper', 'And Yama raised his hand. Would he strike her down for it?'],
    ],
  },
  {
    id: 'steps',
    name: 'The Seven Steps',
    mural: 'steps',
    hint: 'Northeast, under the snow that never melts.',
    lines: [
      ['keeper', 'He did not strike her. She fought him with the law, not with magic.'],
      ['savitri', 'Lord Yama. It is said that if two walk seven steps together, they are friends.'],
      ['savitri', 'I have walked a great deal further than seven with you. A friend must hear a friend.'],
      ['yama', 'You argue like a priest. Very well — ask me for something, and then go home.'],
      ['keeper', 'Bound by his own law, he offered her boons to be rid of her. And still he heard her feet in the snow behind him.'],
    ],
  },
  {
    id: 'boon',
    name: 'The Boon',
    mural: 'boon',
    hint: 'North, on the dead ground. Nothing grows there. Take my fire.',
    lines: [
      ['keeper', 'His patience was thin. But before he could turn on her, she spoke again — and she praised him.'],
      ['savitri', 'Fools fear you, Dharmaraja. They weep because they cannot see what you carry.'],
      ['savitri', 'You are the Lord of Justice. The righteous honour the balance you keep.'],
      ['keeper', 'Never had a mortal looked on Death with such kindness. He stopped at the very gate.'],
      ['yama', 'One last boon. Anything — except the life of Satyavan. Then you must go.'],
    ],
  },
];

/** The climax, once all five are awake and the tree remembers the whole of it. */
export const CLIMAX = [
  ['keeper', 'She looked at the God of Death. And she smiled.'],
  ['savitri', 'Then grant me this, Dharmaraja: let me be the mother of a hundred strong sons.'],
  ['yama', 'Tathastu. So be it.'],
  ['keeper', 'And he turned to go, glad to be done with her.'],
  ['savitri', 'Wait. I am a woman of one husband, and I can bear children by no other.'],
  ['savitri', 'You are the God of Truth. You cannot lie. How am I to have sons, if you take him?'],
  ['keeper', 'Yama stopped. He saw what she had done...'],
  ['yama', 'HA! Ha ha — oh, well argued, little one. Well argued.'],
  ['keeper', 'Death threw back his head and laughed, a warm, booming laugh that shook the forest.'],
  ['yama', 'You have won. Take him.'],
  ['keeper', 'He let the noose go. She won him back with words — and the forest bloomed.'],
];
