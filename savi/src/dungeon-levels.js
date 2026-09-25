// The dungeons themselves: their floors, their mechanics, their bosses.
//
// dungeon.js runs any of these; dungeon-draw.js draws them in each one's own
// look. Every dungeon keeps the shape the research favoured for the first
// (journal §16.51): a key on a side loop, a locked great door, a lamp near
// it, a shortcut back, a boss at the end. What makes each one itself is ONE
// mechanic, introduced safely, then tested with danger, then twisted
// (the Zelda way - teach, test, twist):
//
//   The Sunken Catacomb (Heartland)  - holes that drop you to the floor below;
//                                      traps with a tell; a drawn bridge.
//   The Drowned Cistern (Mirror Lake)- the WATER LEVEL. Valve wheels raise and
//                                      lower it everywhere at once: low, the
//                                      channels are paths; high, they are deep
//                                      water, and the floats rise into bridges.
//                                      Flood a channel with foes in it and they
//                                      drown.
//   The Ember Forge (Broken Peaks)   - LAVA crossed on moving platforms,
//                                      conveyor belts, crushers that slam in a
//                                      wave, vents.
//   The Foxfire Shrine (Cloud Summit)- RED and BLUE PEGS. Strike a switch orb
//                                      and every red peg sinks as every blue
//                                      one rises (and back); paper screens tear
//                                      open on hidden rooms; ninja ambushes.
//   The Frozen Crypt (Hollow Moors)  - ICE. Step onto it and you slide until
//                                      something stops you: rocks are the
//                                      puzzle. Icicles fall where you pass.
//
// Tiles, one character each (see also dungeon.js):
//   #  wall             .  floor            (space) a hole       o  pillar / rock
//   ^  floor spikes     P  pressure plate   > < v  dart slits    F  fire vent
//   C  cracked tile     R  retracting bridge  =  bridge planks   L  lever   G  iron gate
//   K  the key's chest  X  a chest          B  the great door    A  a lamp
//   U  the way out      S  stairs up        D  stairs down
//   ~  a channel (walkable when the water is low; deep when high)
//   %  a float (a hole when the water is low; a raft bridge when high)
//   V  a valve wheel (turns the water)
//   O  a switch orb (strike it)   1  a red peg   2  a blue peg   H  a paper screen (strike it)
//   *  lava              Z  a crusher        → ← ↑ ↓  conveyor belts
//   I  ice               Y  icicles overhead
// Enemies (they stand on floor): s archer, b boneling, d draugr, p spearman,
// n necromancer, c crossbowman, w goblin, q kappa, e preta, i brute, m bomber,
// r ronin, j ninja, f kitsune, t tengu, h jiangshi, u wolf-folk, a banshee,
// z zealot, M the boss.

function grid(w, h) { return Array.from({ length: h }, () => Array(w).fill('#')); }
function rect(g, x0, y0, x1, y1, ch) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g[y][x] = ch; }
function path(g, pts, ch = '.') {
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (let k = 0; k <= n; k++) g[ay + Math.sign(by - ay) * k][ax + Math.sign(bx - ax) * k] = ch;
  }
}
/** Put single tiles: [[x, y, ch], ...]. */
function put(g, list) { for (const [x, y, ch] of list) g[y][x] = ch; }

// --- looks ---------------------------------------------------------------------------------
// floor/wall/face: base colours; dark: how dark it is beyond the light;
// light: the radius of the light you carry; torch: 'torch' | 'lantern' | 'brazier'.
export const THEMES = {
  catacomb: { floor: [58, 51, 60], wall: [38, 34, 44], face: '#4a4352', dark: 0.72, light: 340, torch: 'torch', decal: 'bones' },
  cistern: { floor: [50, 66, 68], wall: [28, 42, 48], face: '#3a5258', dark: 0.66, light: 360, torch: 'torch', decal: 'moss' },
  forge: { floor: [62, 50, 46], wall: [34, 28, 28], face: '#4a3834', dark: 0.5, light: 360, torch: 'brazier', decal: 'soot' },
  shrine: { floor: [142, 112, 76], wall: [118, 34, 30], face: '#e8dcc0', dark: 0.42, light: 380, torch: 'lantern', decal: 'petals' },
  crypt: { floor: [120, 134, 150], wall: [60, 72, 92], face: '#8a9ab4', dark: 0.6, light: 360, torch: 'torch', decal: 'frost' },
};

// ============================================================================================
// 1. THE SUNKEN CATACOMB - the first, unchanged in shape.
// ============================================================================================

function catacomb() {
  // --- B1, the Ossuary: under the chasm; where a fall from the walkway lands.
  const b1 = grid(34, 24);
  rect(b1, 1, 1, 31, 9, '.');
  for (const x of [6, 12, 18, 24]) { b1[3][x] = 'o'; b1[7][x] = 'o'; }
  for (const [x, y, m] of [[8, 5, 'b'], [10, 6, 'b'], [15, 5, 'b'], [20, 5, 'd'], [27, 6, 'd'], [22, 2, 'n']]) b1[y][x] = m;
  b1[2][30] = 'X';
  rect(b1, 12, 10, 14, 17, '.');
  rect(b1, 11, 18, 15, 21, '.');
  b1[19][13] = 'S';

  // --- F1, the entry: spikes, the chasm walkway, the darts, the stair up.
  const f1 = grid(34, 24);
  rect(f1, 1, 17, 8, 22, '.');
  f1[18][2] = 'A'; f1[22][4] = 'U';
  f1[19][9] = 'G';
  rect(f1, 10, 18, 14, 21, '.');
  f1[20][11] = 'L'; f1[19][13] = 'D';
  rect(f1, 3, 9, 5, 16, '.');
  rect(f1, 3, 10, 5, 15, '^');
  rect(f1, 1, 1, 31, 8, ' ');
  path(f1, [[4, 9], [4, 7], [9, 7], [9, 4], [18, 4], [18, 6], [24, 6], [24, 3], [29, 3]]);
  f1[4][12] = ' ';
  for (const [x, y] of [[7, 7], [8, 7], [21, 6], [22, 6]]) f1[y][x] = 'C';
  rect(f1, 28, 2, 30, 4, '.');
  rect(f1, 14, 7, 15, 7, '.'); f1[7][14] = 's';
  rect(f1, 20, 1, 21, 2, '.'); f1[1][21] = 's';
  rect(f1, 28, 5, 30, 11, '.');
  for (const y of [6, 8, 10]) f1[y][27] = '>';
  f1[6][29] = 'P'; f1[8][28] = 'P'; f1[10][30] = 'P';
  rect(f1, 25, 12, 31, 16, '.');
  f1[13][26] = 'p'; f1[13][30] = 'p';
  f1[15][31] = 'S';

  // --- F2, the halls above: the pendulums, the bridge and the key, the fire, the boss.
  const f2 = grid(34, 24);
  rect(f2, 24, 12, 31, 16, '.');
  f2[15][31] = 'D'; f2[13][25] = 'A';
  rect(f2, 26, 6, 28, 11, '.');
  rect(f2, 20, 1, 31, 5, '.');
  f2[2][30] = 'c'; f2[4][22] = 'd';
  rect(f2, 1, 1, 18, 8, ' ');
  rect(f2, 17, 2, 19, 4, '.');
  f2[2][18] = 'L';
  path(f2, [[9, 3], [16, 3]], 'R');
  rect(f2, 5, 2, 8, 4, '.');
  f2[3][6] = 'K'; f2[2][7] = 'b'; f2[4][7] = 'b';
  rect(f2, 12, 13, 23, 15, '.');
  for (let y = 13; y <= 15; y++) for (let x = 13; x <= 22; x++) if ((x + y) % 2 === 0) f2[y][x] = 'F';
  f2[14][11] = 'B';
  rect(f2, 2, 10, 10, 20, '.');
  f2[15][6] = 'M';

  return {
    id: 'catacomb', name: 'The Sunken Catacomb', theme: 'catacomb', music: 'dungeon',
    blurb: 'Traps with a tell, holes that drop you to the floor below, the dead keeping their halls.',
    floors: [
      { id: 'b1', name: 'The Ossuary', depth: -1, g: b1 },
      { id: 'f1', name: 'The Catacomb Gate', depth: 0, g: f1 },
      { id: 'f2', name: 'The Upper Halls', depth: 1, g: f2 },
    ],
    start: { floor: 1, x: 4, y: 20 },
    pendulums: [
      { floor: 2, x: 27, y: 10.5, amp: 1.55, period: 2.1, ph: 0 },
      { floor: 2, x: 27, y: 8.5, amp: 1.55, period: 2.1, ph: 1.05 },
      { floor: 2, x: 27, y: 6.5, amp: 1.55, period: 1.7, ph: 0.4 },
    ],
    boss: { title: 'The Catacomb Warden', type: 'captain', scale: 1.5 },
    key: { name: 'the Bone Key', short: 'Bone Key', color: '#e8e0cc' },
    reward: 400,
  };
}

// ============================================================================================
// 2. THE DROWNED CISTERN - the water level.
//   Teach: the entry's channel is deep; turn the wheel and it drains to a path.
//   Test:  the float hall - drained, the floats sink and it is a drop to the
//          vaults below; flooded, they rise into a raft bridge.
//   Twist: the key is in the vaults, on an island only the rafts reach - flood
//          it from below, cross, and climb out beside the great door. The
//          arena has pools: flood them while the Hag's brood wades.
// ============================================================================================

function cistern() {
  const f1 = grid(32, 22);
  rect(f1, 1, 14, 8, 20, '.');                        // the entry
  put(f1, [[2, 15, 'A'], [4, 20, 'U'], [7, 15, 'V']]);
  rect(f1, 9, 15, 10, 19, '~');                       // the first channel
  rect(f1, 11, 14, 17, 20, '.');                      // the sluice room
  put(f1, [[13, 17, 'q'], [15, 19, 'q'], [16, 19, 'V'], [12, 15, 'X']]);
  rect(f1, 13, 9, 15, 13, '.');                       // north
  rect(f1, 11, 2, 24, 8, '.');                        // the float hall...
  rect(f1, 19, 2, 30, 12, '.');                       // ...and the east hall
  rect(f1, 16, 2, 18, 8, '%');                        // the floats: raft or drop
  put(f1, [[12, 3, 'V'], [20, 3, 'V'], [13, 6, 'e'], [21, 6, 'q'], [29, 11, 'c'], [27, 9, 'd'], [23, 10, 'o'], [27, 6, 'o'], [28, 3, 'A'], [23, 11, 'D']]);
  rect(f1, 25, 5, 26, 5, '~');                        // a trickle across the east hall
  f1[13][25] = 'B';                                   // the great door
  rect(f1, 19, 14, 30, 20, '.');                      // the arena and its pools
  rect(f1, 21, 16, 22, 18, '~'); rect(f1, 27, 16, 28, 18, '~');
  put(f1, [[20, 15, 'V'], [25, 18, 'M']]);

  const b1 = grid(32, 22);
  rect(b1, 14, 1, 20, 9, '.');                        // the vault landing, under the floats
  put(b1, [[15, 2, 'V'], [19, 3, 'd'], [15, 8, 'e'], [19, 8, 'q']]);
  rect(b1, 21, 4, 23, 4, '%');                        // floats to the key's island
  rect(b1, 24, 2, 28, 6, '.');
  put(b1, [[26, 4, 'K'], [27, 3, 'd'], [25, 6, 'b']]);
  rect(b1, 26, 7, 26, 9, '.');
  rect(b1, 22, 10, 27, 12, '.');                      // the stair room
  put(b1, [[23, 11, 'S'], [26, 12, 'e']]);
  path(b1, [[17, 10], [17, 11], [21, 11]], '~');      // a drained way to the stair
  path(b1, [[15, 10], [15, 11]], '~');                // and to a hidden nook
  rect(b1, 14, 12, 15, 12, '.'); b1[12][14] = 'X';

  return {
    id: 'cistern', name: 'The Drowned Cistern', theme: 'cistern', music: 'dungeon',
    blurb: 'Valve wheels raise and lower the water everywhere at once. Drained, channels are paths; flooded, floats rise into bridges - and whatever wades in a channel drowns.',
    floors: [
      { id: 'b1', name: 'The Drowned Vaults', depth: -1, g: b1 },
      { id: 'f1', name: 'The Upper Sluices', depth: 0, g: f1 },
    ],
    start: { floor: 1, x: 4, y: 18 },
    water: 'high',
    boss: { title: 'Mother of the Cistern', type: 'hag', scale: 1.4 },
    key: { name: 'the Sluice Key', short: 'Sluice Key', color: '#8ad8e8' },
    reward: 450,
  };
}

// ============================================================================================
// 3. THE EMBER FORGE - lava, platforms, belts, crushers.
//   Teach: a belt runs against you under a row of crushers - time the slams.
//   Test:  the lava hall: ride one platform to an island, another across, a
//          belt the last stretch, under fire from the far ledge.
//   Twist: above, a gallery of crushers in three lanes, each on its own beat,
//          guards the key; the arena is ringed with lava.
// ============================================================================================

function forge() {
  const f1 = grid(34, 22);
  rect(f1, 1, 15, 7, 20, '.');
  put(f1, [[2, 16, 'A'], [4, 20, 'U']]);
  rect(f1, 8, 17, 20, 18, '←');                       // the belt, against you
  for (const x of [11, 14, 17]) { f1[17][x] = 'Z'; f1[18][x] = 'Z'; }
  rect(f1, 21, 14, 27, 20, '.');                      // the smithy
  put(f1, [[24, 16, 'i'], [26, 19, 'm'], [26, 15, 'X'], [22, 19, 'F']]);
  rect(f1, 20, 12, 27, 13, '.');                      // the ledge over the lava
  rect(f1, 6, 3, 27, 11, '*');                        // the lava hall
  rect(f1, 23, 3, 25, 5, '.'); f1[3][25] = 'F';       // an island
  rect(f1, 11, 3, 13, 5, '.'); f1[3][12] = 's';       // another
  rect(f1, 7, 4, 10, 4, '←');                         // a belt to the far ledge
  rect(f1, 3, 2, 6, 6, '.');
  put(f1, [[4, 3, 'S'], [5, 6, 'c']]);

  const f2 = grid(34, 22);
  rect(f2, 2, 1, 9, 5, '.');                          // the stair room
  put(f2, [[4, 3, 'D'], [8, 2, 'A']]);
  rect(f2, 10, 2, 19, 4, '.');                        // the vent walk
  for (let y = 2; y <= 4; y++) for (let x = 11; x <= 18; x++) if ((x + y) % 2 === 0) f2[y][x] = 'F';
  rect(f2, 20, 1, 31, 7, '.');                        // the hub, round its pool
  rect(f2, 23, 3, 28, 5, '*');
  put(f2, [[30, 2, 'i'], [21, 6, 'c'], [30, 6, 'm']]);
  rect(f2, 25, 8, 27, 13, 'Z');                       // the crusher gallery
  rect(f2, 20, 14, 31, 20, '.');                      // the key's vault
  put(f2, [[30, 19, 'K'], [24, 17, 'i'], [27, 15, 'm'], [22, 19, 'm'], [21, 15, 'X']]);
  rect(f2, 23, 20, 29, 20, '→');
  rect(f2, 5, 6, 6, 9, '.');
  f2[10][5] = 'B';
  rect(f2, 1, 11, 17, 20, '.');                       // the arena
  for (const [x, y] of [[3, 13], [14, 13], [3, 18], [14, 18]]) rect(f2, x, y, x + 1, y + 1, '*');
  put(f2, [[9, 12, 'F'], [9, 19, 'F'], [9, 16, 'M']]);

  return {
    id: 'forge', name: 'The Ember Forge', theme: 'forge', music: 'bhairav',
    blurb: 'Lava crossed on moving platforms, belts that drag you, crushers that slam in a wave.',
    floors: [
      { id: 'f1', name: 'The Slag Gate', depth: 0, g: f1 },
      { id: 'f2', name: 'The Crucible', depth: 1, g: f2 },
    ],
    start: { floor: 0, x: 4, y: 18 },
    platforms: [
      { floor: 0, path: [[24, 11], [24, 6]], speed: 1.7, wait: 1.1 },
      { floor: 0, path: [[22, 4], [14, 4]], speed: 1.9, wait: 1.1 },
      { floor: 1, path: [[22, 4], [29, 4]], speed: 1.6, wait: 1.2 },
    ],
    boss: { title: 'The Forgemaster', type: 'oni', scale: 1.45 },
    key: { name: 'the Ember Seal', short: 'Ember Seal', color: '#ffb05a' },
    reward: 500,
  };
}

// ============================================================================================
// 4. THE FOXFIRE SHRINE - red and blue pegs.
//   Teach: red pegs bar the way on; strike the orb and they sink (and the
//          blue ones rise).
//   Test:  each room's way out is the colour you just raised: strike again.
//   Twist: the lantern gallery upstairs - three rows of pegs, an orb in each
//          pocket between them, ninjas in the pockets; the key beyond, and a
//          torn screen and a hole down to the great door.
// ============================================================================================

function shrine() {
  const f1 = grid(32, 22);
  rect(f1, 1, 15, 8, 20, '.');
  put(f1, [[2, 16, 'A'], [4, 20, 'U'], [6, 16, 'O']]);
  rect(f1, 9, 16, 9, 18, '1');                        // red pegs: the way on
  rect(f1, 10, 14, 17, 20, '.');                      // the hall of the torii
  put(f1, [[12, 18, 'j'], [15, 17, 'j'], [16, 19, 'O'], [11, 15, 'A']]);
  rect(f1, 13, 13, 15, 13, '2');                      // blue pegs north
  rect(f1, 13, 8, 15, 12, '.');
  f1[17][18] = 'B';                                   // the great door
  rect(f1, 19, 11, 31, 20, '.');                      // the arena
  put(f1, [[26, 15, 'M'], [22, 13, 'o'], [29, 13, 'o'], [22, 18, 'o'], [29, 18, 'o']]);
  rect(f1, 9, 2, 23, 8, '.');                         // the courtyard: three parts
  for (let y = 2; y <= 8; y++) { f1[y][12] = '#'; f1[y][16] = '#'; }
  f1[5][12] = '2'; f1[5][16] = '1';
  f1[8][13] = '.'; f1[8][14] = '.'; f1[8][15] = '.';
  put(f1, [[14, 3, 'O'], [10, 3, 'S'], [10, 7, 't'], [20, 5, 'r'], [22, 7, 'f'], [23, 3, 'X']]);
  f1[5][24] = 'H';                                    // a paper screen, and behind it
  rect(f1, 25, 4, 26, 6, '.'); f1[5][26] = 'X';

  const f2 = grid(32, 22);
  rect(f2, 8, 1, 13, 6, '.');                         // the landing
  put(f2, [[10, 3, 'D'], [12, 1, 'O']]);
  rect(f2, 14, 1, 30, 6, '.');                        // the lantern gallery
  rect(f2, 17, 1, 17, 6, '1'); rect(f2, 21, 1, 21, 6, '2'); rect(f2, 25, 1, 25, 6, '1');
  put(f2, [[19, 1, 'O'], [23, 6, 'O'], [19, 5, 'j'], [23, 2, 'j'], [28, 2, 'f']]);
  f2[7][28] = '.';
  rect(f2, 24, 8, 30, 20, '.');                       // the south wing
  put(f2, [[26, 12, 'j'], [29, 14, 'j'], [25, 18, 'r'], [29, 19, 'K'], [27, 10, 't']]);
  f2[12][23] = 'H'; rect(f2, 20, 11, 22, 13, '.'); f2[12][20] = 'X';
  f2[17][23] = 'H';                                   // a screen, a passage, and a hole down
  rect(f2, 13, 16, 22, 18, '.');
  rect(f2, 13, 16, 14, 18, ' ');

  return {
    id: 'shrine', name: 'The Foxfire Shrine', theme: 'shrine', music: 'durga',
    blurb: 'Strike a switch orb and every red peg sinks as every blue one rises. Paper screens hide rooms; ninjas wait in the pockets.',
    floors: [
      { id: 'f1', name: 'The Torii Hall', depth: 0, g: f1 },
      { id: 'f2', name: 'The Lantern Gallery', depth: 1, g: f2 },
    ],
    start: { floor: 0, x: 4, y: 18 },
    color: 'red',
    boss: { title: 'The Nine-Tailed Keeper', type: 'kyubi', scale: 1.35 },
    key: { name: 'the Fox Seal', short: 'Fox Seal', color: '#ff7a5a' },
    reward: 500,
  };
}

// ============================================================================================
// 5. THE FROZEN CRYPT - ice.
//   Teach: the first ice hall - slide, stop at a rock, slide again to the door.
//   Test:  the icicle hall, and a strip of ice that runs you off a ledge (down
//          to the tombs: a shortcut if you mean it, a fall if you don't).
//   Twist: the tombs below - a whole cave of ice, rocks as the only brakes,
//          the key on a far island, wolves that do not slip.
// ============================================================================================

function crypt() {
  const f1 = grid(30, 22);
  rect(f1, 1, 15, 7, 20, '.');
  put(f1, [[2, 16, 'A'], [4, 20, 'U']]);
  f1[17][8] = '.';
  rect(f1, 9, 14, 18, 20, 'I');                       // the first ice hall
  put(f1, [[15, 14, 'o'], [12, 17, 'o'], [17, 19, 'o']]);
  f1[13][16] = '.'; rect(f1, 16, 9, 16, 12, '.');
  rect(f1, 10, 2, 26, 8, '.');                        // the icicle hall
  put(f1, [[11, 3, 'A'], [24, 3, 'D'], [14, 3, 'd'], [18, 3, 'b'], [21, 6, 'a'], [25, 7, 'b']]);
  for (const [x, y] of [[13, 5], [16, 4], [16, 6], [19, 4], [22, 5], [20, 2]]) f1[y][x] = 'Y';
  rect(f1, 11, 7, 18, 7, 'I');                        // ice, running east to a ledge...
  rect(f1, 19, 7, 21, 8, ' ');                        // ...and the drop
  f1[5][9] = 'B';
  rect(f1, 1, 1, 8, 12, '.');                         // the arena
  put(f1, [[4, 6, 'M'], [2, 3, 'o'], [7, 10, 'o']]);

  const b1 = grid(30, 22);
  rect(b1, 21, 1, 27, 5, '.');                        // the landing
  put(b1, [[24, 3, 'S'], [22, 4, 'u']]);
  rect(b1, 6, 6, 27, 18, 'I');                        // the cave of ice
  rect(b1, 7, 7, 9, 9, '.'); b1[8][8] = 'K';          // the key's island
  rect(b1, 25, 16, 26, 17, '.'); b1[17][26] = 'X';
  for (const [x, y] of [[21, 12], [7, 18], [14, 14], [17, 9], [12, 16], [24, 15], [10, 11], [19, 17], [12, 7], [13, 8], [12, 9]]) b1[y][x] = 'o';
  put(b1, [[15, 12, 'u'], [18, 15, 'u'], [10, 14, 'h']]);

  return {
    id: 'crypt', name: 'The Frozen Crypt', theme: 'crypt', music: 'yaman',
    blurb: 'Step onto the ice and you slide until something stops you - rocks are the puzzle. Icicles fall where you pass.',
    floors: [
      { id: 'b1', name: 'The Ice Tombs', depth: -1, g: b1 },
      { id: 'f1', name: 'The Frost Gate', depth: 0, g: f1 },
    ],
    start: { floor: 1, x: 4, y: 18 },
    boss: { title: 'The White Wolf', type: 'alpha', scale: 1.45 },
    key: { name: 'the Frost Key', short: 'Frost Key', color: '#bfe6ff' },
    reward: 500,
  };
}

export const DUNGEON_DEFS = { catacomb, cistern, forge, shrine, crypt };
export const DUNGEON_LIST = ['catacomb', 'cistern', 'forge', 'shrine', 'crypt'];
export function dungeonInfo(id) { const d = (DUNGEON_DEFS[id] || catacomb)(); return { id: d.id, name: d.name, blurb: d.blurb, boss: d.boss.title, theme: d.theme }; }
