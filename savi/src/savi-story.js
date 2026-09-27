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
    keeper: 'That is the part everyone leaves out, child. Narada named the day. She heard him name it, and she married the boy regardless. Her father put a hundred better matches in front of her and she would not look at one of them.',
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
    savi: 'She counted every one of those days by herself and never said a word about it. I would have told somebody. I would have told everybody.',
    keeper: 'A year of counting, and she took the last three of it without food or sleep. Then she got up on the morning she knew about, and walked out into the wood beside him, and talked about the weather.',
    lines: [
      ['keeper', 'She did not run from it. She put off her gold, wore bark, and counted the days without telling a soul.', 'speaking'],
      ['savitri', 'Three days without food or sleep. Let the fast hold what my hands cannot.', 'resolute'],
      ['keeper', 'On the last morning she followed him into the deep woods and would not be left behind.', 'speaking'],
      ['satyavan', 'My head. It is only the heat. Let me put it in your lap a moment.', 'tired'],
      ['keeper', 'He struck at a branch, cried out, and fell. The forest went cold. The birds stopped.', 'weary'],
      ['yama', 'Let him go, daughter. He is mine now.', 'stern'],
      ['keeper', 'A shadow put out the sun. Yama, the Lord of Death, had come with his noose.', 'weary'],
    ],
  },
  {
    id: 'pursuit',
    name: 'The Pursuit',
    mural: 'pursuit',
    hint: 'West, where the black thorn has closed over.',
    savi: 'She went after him. After DEATH. I have been afraid of the road home in the dark, and that was only a road.',
    keeper: 'There is no law saying the living may walk that road. There is none saying they may not, either - nobody had ever wanted to badly enough to find out. She found out.',
    lines: [
      ['keeper', 'He drew the soul out of the boy, small and bright as a lamp, and turned south for the dark country.', 'speaking'],
      ['yama', 'Mortal. Turn back. The living do not walk this road.', 'proud'],
      ['savitri', 'Where my husband goes, I go. My road is tied to his.', 'resolute'],
      ['keeper', 'She did not weep, and she did not kneel. She stood up and walked after Death himself.', 'speaking'],
      ['keeper', 'And Yama raised his hand. Would he strike her down for it?', 'weary'],
    ],
  },
  {
    id: 'steps',
    name: 'The Seven Steps',
    mural: 'steps',
    hint: 'Northeast, under the snow that never melts.',
    savi: 'She did not fight him. She argued with him. I did not know anyone was allowed to argue with Death.',
    keeper: 'Seven steps make a friendship. That is a real saying, child, older than these hills, and he could not deny it without denying himself. She did not out-magic him. She out-remembered him.',
    lines: [
      ['keeper', 'He did not strike her. She fought him with the law, not with magic.', 'speaking'],
      ['savitri', 'Lord Yama. It is said that if two walk seven steps together, they are friends.', 'clever'],
      ['savitri', 'I have walked a great deal further than seven with you. A friend must hear a friend.', 'clever'],
      ['yama', 'You argue like a priest. Very well. Ask me for something, and then go home.', 'caught'],
      ['keeper', 'Bound by his own law, he offered her boons to be rid of her. And still he heard her feet in the snow behind him.', 'pleased'],
    ],
  },
  {
    id: 'boon',
    name: 'The Boon',
    mural: 'boon',
    hint: 'North, where half the hillside came down on it.',
    savi: 'She was kind to him. To Death. And he is the one who had to stop walking.',
    keeper: 'Everyone he had ever come for wept, or bargained, or cursed him. She praised him. He had been Lord of Justice since before the hills and nobody had ever once thanked him for it.',
    lines: [
      ['keeper', 'His patience was thin. But before he could turn on her, she spoke again, and she praised him.', 'speaking'],
      ['savitri', 'Fools fear you, Dharmaraja. They weep because they cannot see what you carry.', 'pleading'],
      ['savitri', 'You are the Lord of Justice. The righteous honour the balance you keep.', 'pleading'],
      ['keeper', 'Never had a mortal looked on Death with such kindness. He stopped at the very gate.', 'pleased'],
      ['yama', 'One last boon. Anything except the life of Satyavan. Then you must go.', 'respect'],
    ],
  },
];

/** The climax, once all five are awake and the tree remembers the whole of it. */
export const CLIMAX = [
  ['keeper', 'She looked at the God of Death. And she smiled.', 'speaking'],
  ['savitri', 'Then grant me this, Dharmaraja: let me be the mother of a hundred strong sons.', 'clever'],
  ['yama', 'Tathastu. So be it.', 'respect'],
  ['keeper', 'And he turned to go, glad to be done with her.', 'speaking'],
  ['savitri', 'Wait. I am a woman of one husband, and I can bear children by no other.', 'clever'],
  ['savitri', 'You are the God of Truth. You cannot lie. How am I to have sons, if you take him?', 'clever'],
  ['keeper', 'Yama stopped. He saw what she had done...', 'pleased'],
  ['yama', 'HA! Ha ha. Oh, well argued, little one. Well argued.', 'approving'],
  ['keeper', 'Death threw back his head and laughed, a warm, booming laugh that shook the forest.', 'pleased'],
  ['yama', 'You have won. Take him.', 'approving'],
  ['keeper', 'He let the noose go. She won him back with words, and the forest bloomed.', 'moved'],
];

/** And what Savi thinks, standing under a tree that has just come back. */
export const CLIMAX_SAVI = 'She never once asked for him back. She asked for sons, and then she made him see what that meant. She won with a sentence. I would like to be like that.';
