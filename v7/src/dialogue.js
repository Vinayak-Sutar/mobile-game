// Talking to people: what they say, and what you can say back.
//
// A trial of the idea (the owner, 2026-09-23): an NPC who speaks on screen and
// gives you something to choose. Kept as DATA so more can be written without
// touching the game: each person is a name, a place to stand, a look, and a
// tree of lines. A line is
//
//   id: { text, ask, choices: [{ say, to, does, once, needs }] }
//
//   text    what they say (an array picks one at random for a greeting)
//   ask     the small line above it - where you are, what is going on
//   choices what you may say back:
//     say   your line on the button
//     to    the line it leads to ('leave' ends the talk)
//     does  a word the game acts on (game.js): 'gift', 'markDungeon', 'rest'
//     once  this choice is gone once it has been taken
//     needs a flag that must already be set for the choice to show
//
// Nothing here knows how it is drawn or what a Cinder is: game.js reads `does`
// and the panel, and dialogue state (what you have been told, what you have
// been given) lives in the save so it is remembered.

/** Everything said so far: { [npcId]: { met: true, taken: { choiceId: true } } } */
export function talkState(save) {
  if (!save.talks) save.talks = {};
  return save.talks;
}

export const NPCS = [
  {
    id: 'rell',
    name: 'Rell',
    title: 'the Lamplighter',
    // Where he stands is in wilds-layout.js with everything else that is placed.
    look: { robe: '#4a5a7a', robeShade: '#333f58', hood: '#3c4a66', skin: '#d8ab7e', lamp: '#ffb35e', staff: '#6a4a30' },
    start: 'hello',
    lines: {
      hello: {
        ask: 'a lamplighter on the road',
        text: [
          'Another one awake. The ash takes the names first, you know - do you still have yours?',
          'You have the look of someone the Wilds spat back out. Sit a moment, if you like.',
        ],
        choices: [
          { say: 'Who are you?', to: 'who' },
          { say: 'What is there to do out here?', to: 'work' },
          { say: 'Nothing. Goodbye.', to: 'leave' },
        ],
      },
      who: {
        text: 'Rell. I walk the road and keep the lamps lit. Someone has to, or the dark would have the whole of it.',
        choices: [
          { say: 'Why keep them lit?', to: 'why' },
          { say: 'Is there work out here?', to: 'work' },
          { say: 'Good luck to you.', to: 'leave' },
        ],
      },
      why: {
        text: 'Because a lamp is a promise. Rest at one and you will wake at it, whatever the dark does to you between.',
        choices: [
          { say: 'What else should I know?', to: 'work' },
          { say: 'I will remember that.', to: 'leave' },
        ],
      },
      work: {
        text: 'There is a stair east of the Hearth that goes down where it should not. Catacombs. The dead keep their halls tidy and they do not care for visitors.',
        choices: [
          { say: 'Show me where.', to: 'marked', does: 'markDungeon' },
          { say: 'I have been down there.', to: 'brag' },
          { say: 'Later, maybe.', to: 'leave' },
        ],
      },
      marked: {
        text: 'East, past the Hearth, where the ground opens. Take a light, and take your time on the walkway - the drop is the part that kills.',
        choices: [
          { say: 'Anything for the road?', to: 'gift', once: 'gift' },
          { say: 'Thank you, Rell.', to: 'leave' },
        ],
      },
      brag: {
        text: 'Have you now. Then you have seen more of the dark than most who stand here talking to me. Keep whatever you carry - the Wilds will ask for it back.',
        choices: [
          { say: 'Anything for the road?', to: 'gift', once: 'gift' },
          { say: 'I will keep that in mind.', to: 'leave' },
        ],
      },
      gift: {
        text: 'Cinders. What the fallen leave, and what the lamps are fed. Take them - I have a whole road of them.',
        does: 'gift',
        choices: [
          { say: 'You have my thanks.', to: 'leave' },
        ],
      },
      again: {
        ask: 'a lamplighter on the road',
        text: [
          'Still walking, then. Good.',
          'The lamps are lit and you are still standing. A fair day for the Wilds.',
        ],
        choices: [
          { say: 'Tell me about the lamps again.', to: 'why' },
          { say: 'Where was that stair?', to: 'work' },
          { say: 'Just passing.', to: 'leave' },
        ],
      },
    },
  },
];

export const npcById = (id) => NPCS.find((n) => n.id === id) || null;

/** The line to open with: people remember whether they have met you. */
export function openingLine(npc, state) {
  const s = state[npc.id];
  return s && s.met && npc.lines.again ? 'again' : npc.start;
}

/** One line, with a greeting picked if there are several, and the choices that apply. */
export function lineOf(npc, id, state) {
  const line = npc.lines[id];
  if (!line) return null;
  const taken = (state[npc.id] && state[npc.id].taken) || {};
  const text = Array.isArray(line.text) ? line.text[Math.floor(Math.random() * line.text.length)] : line.text;
  const choices = (line.choices || []).filter((c) => (!c.once || !taken[c.once]) && (!c.needs || taken[c.needs]));
  return { ...line, text, choices };
}
