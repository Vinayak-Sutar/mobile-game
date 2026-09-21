// The Wilds, as drawn on the designer's map: where every region, road, river,
// lake, cliff and stair is. Pure data - nothing here runs.
//
// The world is laid out the way souls-like worlds are: FIXED, the same on
// every visit, so it can be learned. A hub in the middle (the Ashen Heartland,
// where you start and where the Ashen Gate will stand), and thirteen regions
// around it, each with its own ground, weather and guardian, getting harder
// the further out you go. The fine detail - trees, rocks, flowers, grass - is
// grown from a fixed seed by wilds-world.js, sector by sector.
//
// Units are the game's own (the player is 17 across). At the default walking
// speed of 228 a second, straight across is about 2.6 minutes and the roads,
// which wind, take 3.5 to 4.
//
// Height (see terrain.js paintRaised): a PLATEAU is higher ground whose south
// edge is a cliff face seen from the front. You climb it only by its STAIRS;
// anywhere else along the face you can hop down (dash off it to land in a
// plunge). Its sides are sheer RIMS. A plateau on a plateau is a second tier,
// and the Broken Peaks and Cloud Summit are climbs of three and four.

export const WILDS = { W: 36000, H: 24000, SEED: 0x5eed1a5 };

/** Where you first set foot, just south of the Ashen Gate's dais. */
export const START = { x: 18000, y: 12700 };

// --- regions -------------------------------------------------------------------------
// A point belongs to the region whose centre it is "nearest" to, measured in
// multiples of each region's radius, after its position has been pushed about
// by noise - so borders wander instead of running straight.
//
// tier: how hard it is out there (0 the easiest, 3 the hardest).
// grade: the light laid over the screen there ([r, g, b, alpha]).
// trees / rocks: how thickly they grow (0..1), and which kind of tree.
export const REGIONS = [
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
  { id: 'peaks', name: 'The Broken Peaks', x: 15600, y: 3600, r: 3900, tier: 2,
    trees: 0.05, tree: 'dead', rocks: 0.28, weather: 'ash', grade: [255, 150, 110, 0.12] },
  { id: 'gorge', name: 'The Coil Gorge', x: 12000, y: 22000, r: 2400, tier: 2,
    trees: 0.12, tree: 'dark', rocks: 0.25, weather: 'mist', grade: [90, 150, 120, 0.12] },
  { id: 'moors', name: 'The Hollow Moors', x: 7000, y: 2600, r: 3300, tier: 2,
    trees: 0.1, tree: 'pine', rocks: 0.12, weather: 'snow', grade: [185, 210, 255, 0.14] },
  { id: 'summit', name: 'Cloud Summit', x: 32000, y: 3800, r: 3500, tier: 3,
    trees: 0.14, tree: 'pine', rocks: 0.14, weather: 'cloud', grade: [220, 235, 255, 0.1] },
  { id: 'bridge', name: 'The Great Bridge', x: 24000, y: 5800, r: 1500, tier: 3,
    trees: 0.02, tree: 'dead', rocks: 0.18, weather: 'wind', grade: [180, 170, 190, 0.1] },
  { id: 'citadel', name: 'The Moon Citadel', x: 24000, y: 1800, r: 2700, tier: 3,
    trees: 0.03, tree: 'pine', rocks: 0.05, weather: 'snow', grade: [160, 180, 255, 0.14] },
];

// --- roads ---------------------------------------------------------------------------
// Polylines. They run through the stairs of every climb, so following the road
// always gets you up.
export const ROADS = [
  // The Heartland's crossroads out to the four quarters.
  [[18000, 12700], [18000, 13600], [18200, 14500], [18300, 17500], [18400, 19300]],          // south, to the Mire
  [[18000, 12700], [16600, 12400], [15000, 11800], [12800, 11600], [9800, 11400], [7200, 11600]],   // west, to the Webwood
  [[18000, 12700], [19600, 12300], [21000, 11800], [24500, 11500], [26800, 11400]],           // east, to the Gulch
  [[18000, 12700], [19000, 12200], [19000, 10600], [17600, 9500], [16800, 7000], [16350, 6250], [16000, 5200], [15900, 4650], [15800, 3100], [15800, 2200]],   // north, round the dais and up the Peaks
  // The spokes between the regions.
  [[16600, 12400], [15500, 13800], [12500, 15800], [10000, 16800], [7400, 17200]],            // to Mirror Lake's shore
  [[26800, 11400], [29500, 12000], [32000, 12800], [33600, 13200]],                          // the Gulch to the Sands
  [[18400, 19300], [20500, 20400], [24500, 20100], [27000, 19800], [28400, 19550]],           // the Mire to the Gilded Deep
  [[19600, 12300], [21500, 14000], [25500, 17000], [26600, 19700], [28400, 19580]],           // the Heartland to the Gilded Deep
  [[7400, 17200], [10400, 17600], [10600, 20400], [11200, 21400], [12600, 21600], [13800, 21500], [16500, 20600], [18400, 19300]],   // the Lake, round its east shore, over the Coil in the Gorge, to the Mire
  [[16800, 7000], [14000, 7400], [11000, 5900], [9400, 3900], [7600, 2800]],                 // the Peaks' foot to the Moors
  [[7600, 2800], [5200, 2900], [3600, 3100], [3000, 4200], [2900, 6300]],                    // the Moors onto the Echo Cliffs' table
  [[2900, 6300], [3100, 8400], [3080, 9300], [4600, 10200], [7200, 11600]],                   // the Cliffs down to the Webwood
  [[17600, 9500], [19500, 9000], [22000, 7300], [24000, 6300], [24000, 3700], [24000, 1300]], // over the Great Bridge, up to the keep
  // Cloud Summit: a switchback up four tiers, the stairs on alternate sides.
  [[26800, 11400], [27800, 9000], [29800, 6800], [30680, 6750], [30680, 5900], [33280, 5750], [33280, 4600], [31280, 4450], [31280, 3500], [32000, 3350], [32000, 1800]],
];

// --- water ---------------------------------------------------------------------------
// Lakes and pools are ellipses; `holes` are islands and `cuts` are dry land
// through them (a causeway). Rivers are polylines with a width; wherever a
// road crosses one there is a bridge (worked out by wilds-world.js).
export const LAKES = [
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

export const RIVERS = [
  // The Coil: from the foot of the Broken Peaks, down the Heartland's west
  // side, past the Lake, into the Gorge and out to the south edge.
  { w: 150, pts: [[14300, 6700], [13600, 9000], [12900, 11000], [12700, 13200], [12300, 16000], [12050, 18500], [12000, 20400], [11980, 22500], [11900, 24000]] },
  // The Summit's meltwater, down to the palace gardens.
  { w: 110, pts: [[30500, 7200], [30100, 9500], [29600, 12500], [29200, 15500], [28900, 17600]] },
];

// The sea along the Echo Cliffs: everything west of a ragged coastline.
export const SEA = { x: 760, y0: 2600, y1: 10600, jag: 420 };

// Chasms: bottomless and impassable. This is the only hard wall in the world:
// the Moon Citadel stands on a mesa cut off by it, and the Great Bridge is the
// one way across.
export const CHASMS = [
  { x: 20500, y: 4300, w: 3380, h: 700 },
  { x: 24120, y: 4300, w: 4380, h: 700 },
  { x: 20500, y: 0, w: 500, h: 4300 },
  { x: 28000, y: 0, w: 500, h: 4300 },
];
// The bridge's deck, across the chasm (railings are added either side).
export const BRIDGES = [{ x: 23880, y: 4300, w: 240, h: 700 }];

// --- height ---------------------------------------------------------------------------
// plateau: [x, y, w, h, faceHeight, stairs [[x, width], ...], sideTop, northRim]
// sideTop: where its side rims start (the top of the plateau for a tier that
// stands clear; higher for one set against a slope).
export const PLATEAUS = [
  // The Heartland: the Ashen Gate's dais, and two lookout knolls.
  [17500, 11100, 1000, 500, 40, [[17920, 160]], 11100, true],
  [14700, 9800, 700, 420, 44, [[14990, 120]], 9800, true],
  [21000, 14700, 560, 360, 40, [[21220, 110]], 14700, true],

  // The Broken Peaks: three tiers up to Kharn's caldera, the road through
  // every set of stairs.
  [12400, 1600, 7000, 4600, 64, [[16270, 170]], 1600, true],
  [13600, 1800, 4600, 2800, 60, [[15820, 160]], 1800, true],
  [14900, 2000, 1900, 1000, 56, [[15720, 160]], 2000, true],

  // Cloud Summit: four tiers, the stairs switching sides, the Monkey King's
  // perch at the very top.
  [29300, 1100, 5400, 5300, 64, [[30600, 160]], 1100, true],
  [30200, 1300, 3700, 3700, 60, [[33200, 160]], 1300, true],
  [30900, 1500, 2300, 2200, 56, [[31200, 160]], 1500, true],
  [31500, 1700, 1000, 800, 52, [[31920, 160]], 1700, true],

  // The Moon Citadel's mesa (reached over the Great Bridge), and its keep.
  [21200, 380, 6600, 3300, 70, [[23900, 200]], 380, true],
  [23000, 650, 2000, 1550, 56, [[23920, 160]], 650, true],

  // The Echo Cliffs: a sea-cliff table with the amphitheatre on it.
  [950, 3300, 4300, 5700, 60, [[3000, 160]], 3300, false],

  // The Gilded Deep: the palace's garden terraces.
  [26700, 17500, 3400, 1950, 44, [[28320, 160]], 17500, true],
  [27500, 17700, 1800, 1000, 40, [[28320, 160]], 17700, true],

  // The Dust Gulch: mesas where the slingers keep watch.
  [25000, 9700, 900, 600, 52, [[25400, 110]], 9700, true],
  [27900, 12700, 760, 520, 50, [[28230, 110]], 12700, true],
  [25700, 13200, 640, 420, 48, [[25960, 110]], 13200, true],

  // The Webwood: a long wooded ridge.
  [4700, 8800, 2600, 900, 50, [[5900, 130]], 8800, true],

  // The Sunken Sands: a half-buried temple mound.
  [33600, 12200, 1300, 800, 46, [[34180, 140]], 12200, true],
];

// Free-standing walls: the Coil Gorge's canyon sides, with a gap in each
// where the road from the Lake to the Mire passes through.
export const RIMS = [
  { x: 11040, y: 20300, w: 26, h: 750 },
  { x: 11040, y: 21420, w: 26, h: 2580 },
  { x: 12960, y: 20300, w: 26, h: 1180 },
  { x: 12960, y: 21680, w: 26, h: 2320 },
];

// Places that must stay clear of trees and rocks: where you start, the gate
// dais, and every spot something will stand later (lamps, lairs, sites).
export const CLEARINGS = [
  { x: 18000, y: 12200, r: 900 },
  { x: 7400, y: 19450, r: 600 },
];
