// The Wilds, as drawn on the designer's map: where every region, road, river,
// lake, cliff and stair is. Pure data - nothing here runs.
//
// The world is laid out the way souls-like worlds are: FIXED, the same on
// every visit, so it can be learned. The main island has a hub in the middle
// (the Ashen Heartland, where you start and where the Ashen Gate will stand)
// and thirteen regions round it, getting harder the further out you go. A
// second, smaller island lies off its east coast, joined by a long bridge -
// the first of the islands a ship will one day reach. The sea runs all round,
// so the world ends at a coast you can see, not at a wall.
//
// The fine detail - trees, rocks, flowers, grass - is grown from a fixed seed
// by wilds-world.js, sector by sector.
//
// Units are the game's own (the player is 17 across). At the default walking
// speed of 228 a second, the main island is about 2.6 minutes straight across
// and 3.5 to 4 along its winding roads.
//
// Height (see terrain.js paintRaised): a PLATEAU is higher ground whose south
// edge is a cliff face seen from the front. From below you climb it by its
// STAIRS - every face has several - and from above you can hop down anywhere
// along a face (dash off it to land in a plunge). Its other three sides are
// gentle SLOPES you can walk up and down freely: the heights shape the land
// without fencing it in. A plateau on a plateau is a second tier.
//
// Everything below is authored in the main island's own frame (0..36000 x
// 0..24000); it is moved out into the world - which has a band of sea round
// it - by the OFFSET at the bottom of this file.

export const OFFSET = { x: 2500, y: 2500 };
export const WILDS = { W: 47500, H: 29000, SEED: 0x5eed1a5 };

/** The main island's authored extent (its coast wanders out beyond it). */
export const MAIN = { x: 0, y: 0, w: 36000, h: 24000 };

/** The second island, off the east coast (an ellipse with a ragged shore). */
export const ISLES = [{ id: 'isle', x: 40800, y: 12800, rx: 2150, ry: 3500 }];

/** Where you first set foot, just south of the Ashen Gate's dais. */
const RAW_START = { x: 18000, y: 12700 };

// --- regions -------------------------------------------------------------------------
// A point belongs to the region whose centre it is "nearest" to, measured in
// multiples of each region's radius, after its position has been pushed about
// by noise - so borders wander instead of running straight.
//
// tier: how hard it is out there (0 the easiest, 3 the hardest).
// grade: the light laid over the screen there ([r, g, b, alpha]).
// trees / rocks: how thickly they grow (0..1), and which kind of tree.
const RAW_REGIONS = [
  { id: 'heartland', name: 'The Ashen Heartland', x: 18000, y: 12000, r: 5400, tier: 0,
    trees: 0.07, tree: 'broad', rocks: 0.05, weather: 'leaves', grade: [255, 228, 168, 0.05] },
  { id: 'webwood', name: 'The Webwood', x: 6200, y: 11600, r: 3700, tier: 0,
    trees: 0.62, tree: 'dark', rocks: 0.04, weather: 'motes', grade: [30, 80, 60, 0.16] },
  { id: 'lake', name: 'Mirror Lake', x: 7600, y: 18800, r: 3700, tier: 0,
    trees: 0.1, tree: 'broad', rocks: 0.05, weather: 'leaves', grade: [200, 230, 255, 0.06] },
  { id: 'gulch', name: 'The Dust Gulch', x: 26800, y: 11400, r: 3400, tier: 0,
    trees: 0.04, tree: 'cactus', rocks: 0.22, weather: 'dust', grade: [255, 190, 120, 0.09] },
  { id: 'mire', name: 'The Blackwater Mire', x: 18400, y: 20300, r: 3400, tier: 1,
    trees: 0.2, tree: 'dead', rocks: 0.03, weather: 'mist', grade: [60, 90, 70, 0.18] },
  { id: 'gilded', name: 'The Gilded Deep', x: 28400, y: 19600, r: 3700, tier: 1,
    trees: 0.12, tree: 'cypress', rocks: 0.02, weather: 'petals', grade: [120, 200, 220, 0.08] },
  { id: 'echo', name: 'The Echo Cliffs', x: 2600, y: 6400, r: 3000, tier: 1,
    trees: 0.05, tree: 'broad', rocks: 0.2, weather: 'wind', grade: [170, 160, 200, 0.1] },
  { id: 'sands', name: 'The Sunken Sands', x: 33600, y: 13200, r: 3300, tier: 1,
    trees: 0.02, tree: 'dead', rocks: 0.08, weather: 'dust', grade: [255, 210, 140, 0.1] },
  { id: 'isle', name: 'Saltwind Isle', x: 40800, y: 12800, r: 2700, tier: 1,
    trees: 0.16, tree: 'palm', rocks: 0.06, weather: 'wind', grade: [255, 238, 196, 0.06] },
  // The Broken Peaks: volcanic - ash, black rock, glowing fissures, no snow.
  { id: 'peaks', name: 'The Broken Peaks', x: 15600, y: 3600, r: 3900, tier: 2,
    trees: 0.05, tree: 'dead', rocks: 0.28, weather: 'ash', grade: [255, 130, 90, 0.13] },
  { id: 'gorge', name: 'The Coil Gorge', x: 12000, y: 22000, r: 2400, tier: 2,
    trees: 0.12, tree: 'dark', rocks: 0.25, weather: 'mist', grade: [90, 150, 120, 0.12] },
  { id: 'moors', name: 'The Hollow Moors', x: 7000, y: 2600, r: 3300, tier: 2,
    trees: 0.1, tree: 'pine', rocks: 0.12, weather: 'snow', grade: [185, 210, 255, 0.14] },
  // Cloud Summit: green terraces in blossom, cloud drifting through; snow only
  // on the crown.
  { id: 'summit', name: 'Cloud Summit', x: 32000, y: 3800, r: 3500, tier: 3,
    trees: 0.16, tree: 'blossom', rocks: 0.1, weather: 'cloud', grade: [255, 225, 240, 0.08] },
  { id: 'bridge', name: 'The Great Bridge', x: 24000, y: 5800, r: 1500, tier: 3,
    trees: 0.02, tree: 'dead', rocks: 0.18, weather: 'wind', grade: [180, 170, 190, 0.1] },
  // The Moon Citadel: pale marble courts under a cold blue moon.
  { id: 'citadel', name: 'The Moon Citadel', x: 24000, y: 1800, r: 2700, tier: 3,
    trees: 0.03, tree: 'pine', rocks: 0.04, weather: 'motes', grade: [140, 170, 255, 0.16] },
];

// --- roads ---------------------------------------------------------------------------
// Polylines. They run through a set of stairs on every climb, so following the
// road always gets you up.
const RAW_ROADS = [
  // The Heartland's crossroads out to the four quarters.
  [[18000, 12700], [18000, 13600], [18200, 14500], [18300, 17500], [18400, 19300]],          // south, to the Mire
  [[18000, 12700], [16600, 12400], [15000, 11800], [12800, 11600], [9800, 11400], [7200, 11600]],   // west, to the Webwood
  [[18000, 12700], [19600, 12300], [21000, 11800], [24500, 11500], [26800, 11400]],           // east, to the Gulch
  [[18000, 12700], [19000, 12200], [19000, 10600], [17600, 9500], [16800, 7000], [16350, 6250], [16000, 5200], [15900, 4650], [15800, 3100], [15800, 2200]],   // north, up the Peaks
  // The spokes between the regions.
  [[16600, 12400], [15500, 13800], [12500, 15800], [10000, 16800], [7400, 17200]],            // to Mirror Lake's shore
  [[26800, 11400], [29500, 12000], [32000, 12800], [33600, 13200], [35100, 13200], [35100, 12820], [38900, 12820], [40800, 12600], [41300, 10600]],   // the Gulch to the Sands, and over the sea bridge to Saltwind Isle
  [[18400, 19300], [20500, 20400], [24500, 20100], [27000, 19800], [28400, 19550]],           // the Mire to the Gilded Deep
  [[19600, 12300], [21500, 14000], [25500, 17000], [26600, 19700], [28400, 19580]],           // the Heartland to the Gilded Deep
  [[7400, 17200], [10400, 17600], [10600, 20400], [11200, 21400], [12600, 21600], [13800, 21500], [16500, 20600], [18400, 19300]],   // the Lake, round its east shore, over the Coil in the Gorge, to the Mire
  [[16800, 7000], [14000, 7400], [11000, 5900], [9400, 3900], [7600, 2800]],                 // the Peaks' foot to the Moors
  [[7600, 2800], [5200, 2900], [3600, 3100], [3000, 4200], [2900, 6300]],                    // the Moors onto the Echo Cliffs' table
  [[2900, 6300], [3100, 8400], [3080, 9300], [4600, 10200], [7200, 11600]],                   // the Cliffs down to the Webwood
  [[17600, 9500], [19500, 9000], [22000, 7300], [24000, 6300], [24000, 3700], [24000, 1300]], // over the Great Bridge, up to the keep
  // The high road: from the Peaks over the West Sky Bridge to the Citadel,
  // and on over the East Sky Bridge to Cloud Summit.
  [[16000, 5200], [18600, 5000], [19000, 3400], [19800, 2530], [21600, 2530], [23000, 1900], [24000, 1300]],
  [[24000, 1300], [25200, 1900], [26800, 2530], [28800, 2530], [30300, 2300], [31000, 2400]],
  // Cloud Summit: a switchback up four tiers, the stairs on alternate sides.
  [[26800, 11400], [27800, 9000], [29800, 6800], [30680, 6750], [30680, 5900], [33280, 5750], [33280, 4600], [31280, 4450], [31280, 3500], [32000, 3350], [32000, 1800]],
];

// --- water ---------------------------------------------------------------------------
// Lakes and pools are ellipses; `holes` are islands and `cuts` are dry land
// through them (a causeway). Rivers are polylines with a width; wherever a
// road crosses one there is a bridge (worked out by wilds-world.js). Round
// the edges of all water there is a shallow margin you can wade.
const RAW_LAKES = [
  // Mirror Lake, with the Drowned Vault's island and the causeway out to it.
  { x: 7400, y: 19200, rx: 2600, ry: 1900, holes: [{ x: 7400, y: 19450, r: 560 }],
    cuts: [{ x: 7280, y: 17100, w: 240, h: 1900 }] },
  // The Blackwater Mire's pools, with boardwalks left dry between them.
  { x: 16800, y: 19400, rx: 700, ry: 400 },
  { x: 19700, y: 20900, rx: 820, ry: 480 },
  { x: 18000, y: 21600, rx: 620, ry: 380 },
  { x: 20400, y: 19500, rx: 460, ry: 300 },
  { x: 16300, y: 21300, rx: 520, ry: 330 },
  // A tarn up on the Moors' shoulder and the Heartland's millpond.
  { x: 9000, y: 5200, rx: 420, ry: 260 },
  { x: 20200, y: 14300, rx: 520, ry: 300 },
];

const RAW_RIVERS = [
  // The Coil: from the foot of the Broken Peaks, down the Heartland's west
  // side, past the Lake, into the Gorge and out to the sea.
  { w: 150, pts: [[14300, 6700], [13600, 9000], [12900, 11000], [12700, 13200], [12300, 16000], [12050, 18500], [12000, 20400], [11980, 22500], [11900, 24600]] },
  // The Summit's meltwater, down to the palace gardens.
  { w: 110, pts: [[30500, 7200], [30100, 9500], [29600, 12500], [29200, 15500], [28900, 17600]] },
];

// An inlet of the sea cut into the Echo Cliffs' coast.
const RAW_SEA = { x: 760, y0: 2600, y1: 10600, jag: 420 };

// Chasms: bottomless and impassable. The Moon Citadel stands on a mesa cut
// off by them - crossed by the Great Bridge from the south and by the two sky
// bridges from the Broken Peaks and Cloud Summit.
const RAW_CHASMS = [
  { x: 20500, y: 4300, w: 3380, h: 700 },
  { x: 24120, y: 4300, w: 4380, h: 700 },
  { x: 20500, y: 0, w: 500, h: 4300 },
  { x: 28000, y: 0, w: 500, h: 4300 },
];
// Bridge decks (railings are added along both sides): the Great Bridge, the
// two sky bridges, and the long sea bridge out to Saltwind Isle.
const RAW_BRIDGES = [
  { x: 23880, y: 4300, w: 240, h: 700, name: 'The Great Bridge' },
  { x: 20480, y: 2420, w: 540, h: 220, name: 'The West Sky Bridge' },
  { x: 27980, y: 2420, w: 540, h: 220, name: 'The East Sky Bridge' },
  { x: 35300, y: 12700, w: 3700, h: 240, name: 'The Saltwind Bridge' },
];

// --- height ---------------------------------------------------------------------------
// plateau: [x, y, w, h, faceHeight, stairs [[x, width], ...]]
const RAW_PLATEAUS = [
  // The Heartland: the Ashen Gate's dais, and two lookout knolls.
  [17500, 11100, 1000, 500, 40, [[17920, 160]]],
  [14700, 9800, 700, 420, 44, [[14990, 120]]],
  [21000, 14700, 560, 360, 40, [[21220, 110]]],

  // The Broken Peaks: three tiers up to Kharn's caldera.
  [12400, 1600, 7000, 4600, 64, [[13300, 160], [16270, 170], [18300, 160]]],
  [13600, 1800, 4600, 2800, 60, [[14400, 150], [15820, 160], [17300, 150]]],
  [14900, 2000, 1900, 1000, 56, [[15720, 160], [16350, 140]]],

  // Cloud Summit: four tiers, the Monkey King's perch at the very top.
  [29300, 1100, 5400, 5300, 64, [[30600, 160], [32400, 160], [34000, 160]]],
  [30200, 1300, 3700, 3700, 60, [[31000, 150], [33200, 160]]],
  [30900, 1500, 2300, 2200, 56, [[31200, 160], [32600, 150]]],
  [31500, 1700, 1000, 800, 52, [[31920, 160]]],

  // The Moon Citadel's mesa, and its keep.
  [21200, 380, 6600, 3300, 70, [[22300, 180], [23900, 200], [25700, 180], [27000, 160]]],
  [23000, 650, 2000, 1550, 56, [[23920, 160], [24600, 140]]],

  // The Echo Cliffs: a sea-cliff table with the amphitheatre on it.
  [950, 3300, 4300, 5700, 60, [[1900, 150], [3000, 160], [4400, 150]]],

  // The Gilded Deep: the palace's garden terraces.
  [26700, 17500, 3400, 1950, 44, [[27200, 150], [28320, 160], [29600, 150]]],
  [27500, 17700, 1800, 1000, 40, [[28320, 160]]],

  // The Dust Gulch: mesas where the slingers keep watch.
  [25000, 9700, 900, 600, 52, [[25400, 110]]],
  [27900, 12700, 760, 520, 50, [[28230, 110]]],
  [25700, 13200, 640, 420, 48, [[25960, 110]]],

  // The Webwood: a long wooded ridge.
  [4700, 8800, 2600, 900, 50, [[5000, 130], [5900, 130], [6800, 130]]],

  // The Sunken Sands: a half-buried temple mound.
  [33600, 12200, 1300, 800, 46, [[34180, 140]]],
];

// Free-standing walls: the Coil Gorge's canyon sides, with gaps where the
// road from the Lake to the Mire passes through and further down.
const RAW_RIMS = [
  { x: 11040, y: 20300, w: 26, h: 750 },
  { x: 11040, y: 21420, w: 26, h: 1200 },
  { x: 11040, y: 22900, w: 26, h: 1100 },
  { x: 12960, y: 20300, w: 26, h: 1180 },
  { x: 12960, y: 21680, w: 26, h: 1000 },
  { x: 12960, y: 23000, w: 26, h: 1000 },
];

// Places that must stay clear of trees and rocks: where you start, the gate
// dais, and every spot something will stand later (lamps, lairs, sites).
const RAW_CLEARINGS = [
  { x: 18000, y: 12200, r: 900 },
  { x: 7400, y: 19450, r: 600 },
];

// --- into the world ------------------------------------------------------------------

const OX = OFFSET.x, OY = OFFSET.y;
const pt = ([x, y]) => [x + OX, y + OY];
const at = (o) => ({ ...o, x: o.x + OX, y: o.y + OY });

export const START = at(RAW_START);
export const REGIONS = RAW_REGIONS.map(at);
export const ROADS = RAW_ROADS.map((r) => r.map(pt));
export const LAKES = RAW_LAKES.map((L) => ({
  ...at(L),
  holes: L.holes && L.holes.map(at),
  cuts: L.cuts && L.cuts.map(at),
}));
export const RIVERS = RAW_RIVERS.map((r) => ({ ...r, pts: r.pts.map(pt) }));
export const SEA = { ...RAW_SEA, x: RAW_SEA.x + OX, y0: RAW_SEA.y0 + OY, y1: RAW_SEA.y1 + OY };
export const CHASMS = RAW_CHASMS.map(at);
export const BRIDGES = RAW_BRIDGES.map(at);
export const PLATEAUS = RAW_PLATEAUS.map(([x, y, w, h, f, stairs]) => [x + OX, y + OY, w, h, f, stairs.map(([sx, sw]) => [sx + OX, sw])]);
export const RIMS = RAW_RIMS.map(at);
export const CLEARINGS = RAW_CLEARINGS.map(at);
export const LAND = { main: at(MAIN), isles: ISLES.map(at) };
