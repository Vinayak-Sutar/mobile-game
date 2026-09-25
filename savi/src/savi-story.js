// Savi — the legend, and everything the Old Woman says.
//
// Pure data. The Banyan drinks memories, not water: each Great Root the player
// frees gives the tree back one beat of the story of Savitri and Satyavan, and
// the Old Woman tells it over a mural that lights on the root itself.
//
// The script follows savi.docx. Lines are short on purpose - they are read on a
// phone, one panel at a time, with a tap between each.

/** The five roots, in the order the tree remembers them. */
export const ROOTS = [
  {
    id: 'choice',
    name: 'The Choice',
    mural: 'choice',
    // Where it reaches, and what is choking it.
    x: 780, y: 1180, mat: 'leaves',
    patch: { x: 560, y: 980, w: 520, h: 420 },
    hint: 'Southwest, where the leaves lie deepest.',
    lines: [
      'Ah... I remember her fire. Savitri, a princess so bright that men were afraid of her.',
      'She chose her own fate, and gave her heart to Satyavan - a banished prince living in the dust.',
      'They rejoiced. But the sage Narada came to the palace with a shadow in his eyes.',
      '"The boy is perfect," he said. "But in one year, he will die."',
      'A cursed love. The princess would not be swayed. And the year began to run.',
    ],
  },
  {
    id: 'fall',
    name: 'The Fall',
    mural: 'fall',
    x: 2180, y: 1240, mat: 'water',
    patch: { x: 1820, y: 1020, w: 740, h: 520 },
    hint: 'East, in the hollow the water has taken.',
    lines: [
      'She did not run from it. She put off her gold, wore bark, and counted the days in silence.',
      'On the last morning she followed him into the deep woods.',
      'He struck at a branch, cried out, and fell into her lap - beneath this very tree.',
      'The forest went cold. The birds stopped.',
      'And a shadow put out the sun. Yama, the Lord of Death, had come with his noose.',
    ],
  },
  {
    id: 'pursuit',
    name: 'The Pursuit',
    mural: 'pursuit',
    x: 420, y: 560, mat: 'thorn',
    patch: { x: 220, y: 380, w: 560, h: 420 },
    hint: 'West, where the black thorn has closed over.',
    lines: [
      'Yama drew the soul out of the boy and turned south, for the dark country.',
      'He told her to stay and weep. Her duty was done, he said.',
      '"Mortal. Turn back. The living do not walk this road."',
      'And she said: "Where my husband goes, I go. My road is tied to his."',
      'She did not weep. She stood up and followed Death into the dark.',
    ],
  },
  {
    id: 'steps',
    name: 'The Seven Steps',
    mural: 'steps',
    x: 2320, y: 400, mat: 'snow',
    patch: { x: 2060, y: 220, w: 620, h: 420 },
    hint: 'Northeast, under the snow that never melts.',
    lines: [
      'He did not strike her. She fought him with the law, not with magic.',
      '"Lord Yama - it is said that if two walk seven steps together they are friends."',
      '"I have walked far more than seven with you. A friend must hear a friend."',
      'Yama was stunned. Bound by his own law, he could not argue.',
      'He offered her boons to send her home - and still heard her feet in the snow behind him.',
    ],
  },
  {
    id: 'boon',
    name: 'The Boon',
    mural: 'boon',
    x: 1500, y: 240, mat: 'ash',
    patch: { x: 1240, y: 100, w: 540, h: 360 },
    hint: 'North, on the dead ground. Nothing grows there. Take my fire.',
    lines: [
      'His patience was thin. But before he could turn on her, she spoke again - and she praised him.',
      '"Fools fear you, Dharmaraja. They weep because they do not see what you carry."',
      '"You are the Lord of Justice. The righteous honour the balance you keep."',
      'Never had a mortal looked on Death with such kindness. He stopped at the very gate.',
      '"One last boon," he said. "Anything - except the life of Satyavan. Then you must go."',
    ],
  },
];

/** The climax, once all five are awake and the tree remembers everything. */
export const CLIMAX = [
  'She looked at the God of Death. And she smiled.',
  '"Then grant me this, Dharmaraja: let me be the mother of a hundred strong sons."',
  '"Tathastu," said Yama. "So be it." And he turned to go, glad to be done with her.',
  '"Wait. I am a woman of one husband, and I can bear children by no other."',
  '"You are the God of Truth. You cannot lie. How am I to have sons, if you take him?"',
  'Yama stopped. He saw what she had done...',
  'And then Death threw back his head and laughed - a warm, booming laugh that shook the forest.',
  '"You have won, little one. Take him."',
  'He let the noose go. She won him back with words. And the forest bloomed.',
];

/** What the Old Woman says at the tree, chosen by what is true in the valley. */
export function keeperLines(woken, total) {
  if (woken === 0) {
    return [
      'The wind bites harder today, little one. The Great Banyan is dying.',
      'And if it falls, the valley freezes for good.',
      'This tree does not drink water. It drinks memories.',
      'It was planted to keep the greatest story of devotion our world has known.',
      'But the land has grown cold. The earth has choked its five Great Roots, and the tree has forgotten its own legend.',
      'I am too frail to walk the valley. But you - you have a warmth to your step. I feel the earth give under you.',
      'Follow the roots, Savi. Clear what is choking them. Wake the roots, and the tree will remember.',
      'And if it remembers... the spring comes back.',
    ];
  }
  if (woken >= total) {
    return ['All five. Go and stand under it, child. Let it tell you the end.'];
  }
  return [
    `${woken} of the five are awake. I can feel them from here.`,
    'Follow another root out. The tree will show you which are still cold.',
  ];
}

/** A bird, for when the player is lost. */
export function birdHint(roots, done) {
  const left = roots.filter((r) => !done[r.id]);
  if (!left.length) return 'The tree is full of it now. Go and stand under it.';
  return left[0].hint;
}
