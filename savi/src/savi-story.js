// Savi — the legend, told a line at a time with the speaker's face beside it.
//
// Each line is [who, text, mood]. `who` picks the portrait that comes up beside
// it and `mood` picks WHICH ONE - the face is part of the writing, not a
// decoration on it. Yama's five are the arc of the whole legend: he is PROUD
// and not looking at her, then STERN and ordering her home, then CAUGHT by
// something she has said, then RESPECTFUL and actually listening, and finally
// APPROVING, delighted to have been beaten fairly by a mortal. Savitri goes
// resolute, then clever, then pleading, then joyful. The keeper's own face
// follows the valley rather than the story - see keeperMood in savi-assets.js.
//
// Every Great Root the player frees gives the tree back one beat, and a young
// banyan rises on that root with the beat carved into it, to be walked up to
// and read again whenever.
//
// Two more fields carry the beat outward from the panel it was told in:
//
//   savi    what SHE thinks of what she has just heard, in a bubble over her
//           head as she walks away. She is eleven and it is the first time
//           anyone has told her any of this, so she is not reverent about it
//           - she is working out whether Savitri was brave or just stubborn.
//           Without this the legend is a thing that happens AT the player;
//           with it, the girl they are walking around is listening too.
//
//   keeper  what the old woman adds about that beat when Savi comes back to
//           her. Not a summary - the bit she has been carrying about it for
//           forty years and has never had anyone to say it to.

export const ROOTS = [
  {
    id: 'choice',
    name: 'The Choice',
    mural: 'choice',
    hint: 'Southwest, where the leaves lie deepest.',
    savi: 'She knew he had one year. She married him anyway. I wonder what happened after that.',
    keeper: 'Savitri was a great lady. Even though she knew he was going to die, she married him regardless.',
    lines: [
      ['keeper', 'Ah, I remember her fire. Savitri was a strong, elegant princess. Not one prince came to ask for her hand, for she was better than all of them at everything, and they knew it.', 'speaking'],
      ['savitri', 'I have chosen. He is the one.', 'resolute'],
      ['keeper', 'She chose her own fate, and gave her heart to Satyavan, a banished prince living in the dust of a forest.', 'speaking'],
      ['satyavan', 'I have nothing. A hut, and my blind father, and the wood.', 'warm'],
      ['keeper', 'They rejoiced. And then the sage Narada came to the palace with a deep fear in his eyes.', 'speaking'],
      ['narada', 'The boy is faultless, my King. But in one year from today, he will die.', 'grave'],
      ['keeper', 'A cursed love. The princess would not change her decision, and they started their life together.', 'weary'],
    ],
  },
  {
    id: 'fall',
    name: 'The Fall',
    mural: 'fall',
    hint: 'East, in the hollow the water has taken.',
    savi: '<i>Yamaraj</i> himself. The god of death came for Satyavan with his own hands. Poor Savitri. I feel so bad for her.',
    keeper: 'Satyavan died after a year. And the Lord of Death, <i>Yamaraj</i>, came himself to collect his soul.',
    lines: [
      ['keeper', 'They lived together for one year. After that year, Satyavan went into the wood to cut timber, and he fainted, and he fell.', 'speaking'],
      ['keeper', 'Savitri took his head into her lap, and stayed there.', 'weary'],
      ['keeper', 'Then a figure came out of the trees. He was the Lord of Death, and the Lord of <i>dharma</i>. He sat on his ride, a great buffalo.', 'weary'],
      ['yama', 'Let go of him, girl. I am here to collect his soul. Your duty as his wife is over. Go and make ready for his funeral.', 'stern'],
    ],
  },
  {
    id: 'pursuit',
    name: 'The Pursuit',
    mural: 'pursuit',
    hint: 'West, where the black thorn has closed over.',
    savi: 'She went after him. After DEATH. Savitri was really brave.',
    keeper: 'Savitri was very brave. She was ready to bring Satyavan back from the Lord of Death himself.',
    lines: [
      ['keeper', 'He drew the soul out of the boy, small and bright as a lamp, and turned south for the dark country.', 'speaking'],
      ['yama', 'Mortal. Turn back. The living do not walk this road.', 'proud'],
      ['savitri', 'Where my husband goes, I go. My road is tied to his.', 'resolute'],
      ['keeper', 'She did not weep, and she did not kneel. She stood up and walked after Death himself.', 'speaking'],
      ['keeper', 'Yama turned on her in anger. He reminded her who she was following, and what he could do to her.', 'weary'],
      ['yama', 'I am the Lord of <i>Dharma</i>, girl. I am Justice itself.', 'stern'],
    ],
  },
  {
    id: 'steps',
    name: 'The Seven Steps',
    mural: 'steps',
    hint: 'Northeast, under the snow that never melts.',
    savi: 'Savitri was so courageous. Was she able to bring Satyavan back to life?',
    keeper: 'Savitri used the law of <i>dharma</i> against <i>Dharmaraj</i> himself. She really was a clever girl.',
    lines: [
      ['keeper', 'Savitri did not fear <i>Yamaraj</i>. She fought him with her wits.', 'speaking'],
      ['savitri', 'Lord Yama, according to our <i>dharma</i>, it is said that if two people walk seven steps together, they are friends.', 'clever'],
      ['savitri', 'I have walked a great deal further than seven with you. A friend must hear a friend.', 'clever'],
      ['yama', 'You are a clever girl. Are you not afraid that I am the Lord of Death?', 'caught'],
      ['keeper', 'Yama was impressed by her wits. He began to offer her a boon to be rid of her. Would she be able to bring Satyavan back to life?', 'pleased'],
    ],
  },
  {
    id: 'boon',
    name: 'The Boon',
    mural: 'boon',
    hint: 'North, where half the hillside came down on it.',
    savi: 'Savitri got a boon from Yama. Anything at all, except the life of Satyavan. I wonder what she will do.',
    keeper: 'Everyone he had ever come for wept, or bargained, or cursed him. She praised him. He had been Lord of Justice since before the hills and nobody had ever once thanked him for it.',
    lines: [
      ['keeper', 'Yama thought Savitri would be afraid, after he had threatened her like that. But instead, she praised him.', 'speaking'],
      ['savitri', 'Fools fear you, <i>Dharmaraja</i>. They weep because they cannot see what you carry.', 'pleading'],
      ['savitri', 'You are the Lord of Justice. The righteous honour the balance you keep.', 'pleading'],
      ['keeper', 'Never had a mortal looked on Death with such kindness. He stopped at the very gate.', 'pleased'],
      ['yama', 'You are a very clever girl, full of wits. I am impressed by you. I will give you one boon. Ask me for anything, except the life of Satyavan.', 'respect'],
    ],
  },
];

/** The climax, once all five are awake and the tree remembers the whole of it. */
export const CLIMAX = [
  ['keeper', 'She looked at the God of Death. And she smiled.', 'speaking'],
  ['savitri', 'Then grant me this, <i>Dharmaraja</i>: let me be the mother of a hundred strong sons.', 'clever'],
  ['yama', '<i>Tathastu</i>. So be it.', 'respect'],
  ['keeper', 'And he turned to go, glad to be done with her.', 'speaking'],
  ['savitri', 'Wait. I am a <i>pativrata</i> (a wife completely devoted to her husband), and I can bear children by no other.', 'clever'],
  ['savitri', 'You are the God of Truth. You cannot lie. How am I to have sons, if you take him?', 'clever'],
  ['keeper', 'Yama stopped. He saw what she had done...', 'pleased'],
  ['yama', 'HA! Ha ha. Oh, well argued, little one. Well argued.', 'approving'],
  ['keeper', 'Death threw back his head and laughed, a warm, booming laugh that shook the forest.', 'pleased'],
  ['yama', 'You have won. Take him.', 'approving'],
  ['keeper', 'He let Satyavan go back to life. She won him back with her courage, her wits, her love, and her devotion to her husband.', 'moved'],
];

// NOTHING OVER HER HEAD AFTER THE LAST ONE. She has a thought about every
// other beat because she is hearing them for the first time. This one ends
// with the tree coming back into bloom around her, and a bubble of her
// working out how she feels about it is a caption on a thing that does not
// need one.
