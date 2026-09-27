// Can an animal drown, climb a cliff, walk out of the valley, or go NaN?
//
// A valley shaped like the real one in the ways that matter: a rock border, a
// river across the middle with shallows either side, and grass between. Savi
// walks a long circuit through all of it while 600 frames go by, which is the
// case that matters - they only ever move when she is near enough to be
// thought about.
const { initFauna, stepFauna, fauna } = await import('../src/savi-fauna.js');
const { TT } = await import('../src/terrain.js');

const V = { w: 5200, h: 3400 };
const DRY = new Set([TT.GRASS, TT.TALL, TT.MOSS, TT.DIRT]);
const WET = new Set([TT.SHALLOW, TT.MUD]);

function classify(x, y) {
  const edge = Math.min(x, y, V.w - x, V.h - y);
  if (edge < 220) return TT.ROCK;
  const d = Math.abs(y - 1700 - Math.sin(x * 0.0016) * 300);
  if (d < 90) return TT.WATER;
  if (d < 150) return TT.SHALLOW;
  if (d < 190) return TT.MUD;
  if (x > 3800 && y > 2400) return TT.ASH;
  return (x * 7 + y * 13) % 11 < 3 ? TT.TALL : TT.GRASS;
}

// Five roots and the tree, the same regions the game uses.
const REGIONS = [
  { id: 'choice', x: 1160, y: 2340, r: 620 },
  { id: 'fall', x: 4400, y: 1420, r: 620 },
  { id: 'pursuit', x: 760, y: 1120, r: 620 },
  { id: 'steps', x: 4180, y: 760, r: 620 },
  { id: 'boon', x: 2600, y: 440, r: 620 },
  { id: 'hub', hub: true, x: 2600, y: 1780, r: 640 },
];
const n = initFauna(V, classify, REGIONS);
console.log('placed            : %d animals across %d regions', n, REGIONS.length);

const S = { x: 2600, y: 3120 };
const st = { bloomK: 0, woken: {} };
let moved = 0, worst = '';
const fail = [];

for (let f = 0; f < 600; f++) {
  // She walks a wide circuit, and the valley heals as she goes.
  const u = (f / 600) * Math.PI * 2;
  S.x = 2600 + Math.cos(u) * 1900;
  S.y = 1900 + Math.sin(u) * 1200;
  st.bloomK = f / 600;
  const was = fauna().map((a) => [a.x, a.y]);
  stepFauna(1 / 60, S, st);
  fauna().forEach((a, i) => {
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) fail.push(`${a.k} went NaN on frame ${f}`);
    if (a.x < 60 || a.y < 60 || a.x > V.w - 60 || a.y > V.h - 60) fail.push(`${a.k} left the valley at ${a.x | 0},${a.y | 0}`);
    const t = classify(a.x, a.y);
    const good = a.k === 'crane' ? WET.has(t) : DRY.has(t) || (a.k === 'peacock' && (t === TT.PAVE || t === TT.GRAVEL));
    if (!good) { fail.push(`${a.k} standing on terrain ${t} at ${a.x | 0},${a.y | 0}`); worst = a.k; }
    if (Math.hypot(a.x - was[i][0], a.y - was[i][1]) > 0.01) moved++;
  });
  if (fail.length > 4) break;
}

console.log('frames where something moved: %d steps', moved);

// --- and the rule the whole thing exists for --------------------------------------
//
// An animal on ground she has not cleared is decoration. An animal on ground
// she cleared an hour ago is the valley answering her. The difference is the
// entire point of grouping them by root, and it is one boolean away from
// being silently undone.
function out(woken, bloom) {
  const state = { woken, bloomK: bloom };
  stepFauna(1 / 60, { x: -9000, y: -9000 }, state);
  const by = {};
  for (const a of fauna()) if (a.on) by[a.region.id] = (by[a.region.id] || 0) + 1;
  return by;
}
const say = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fail.push(m); };

console.log('');
console.log('who is out, and when:');
{
  const none = out({}, 0);
  say(Object.keys(none).length === 0, 'nothing at all before the first root is freed');

  const one = out({ pursuit: true }, 0);
  const elsewhere = Object.keys(one).filter((k) => k !== 'pursuit');
  say(elsewhere.length === 0, `only the freed root has animals — ${JSON.stringify(one)}`);
  say((one.pursuit || 0) >= 1 && (one.pursuit || 0) <= 2, `and just ${one.pursuit || 0} of them`);

  const four = out({ pursuit: true, choice: true, steps: true, boon: true }, 0);
  say(!four.fall && !four.hub, 'the river and the tree stay empty until they are earned');

  const all = out({ pursuit: true, choice: true, steps: true, boon: true, fall: true }, 1);
  let total = 0;
  for (const k of Object.keys(all)) total += all[k];
  say(total === fauna().length, `everything is out at full bloom — ${total} of ${fauna().length}`);
  say(!!all.hub, 'including the ones round the tree, which exist for the ending alone');
}

console.log('failures          : %d %s', fail.length, worst);
for (const f of fail.slice(0, 5)) console.log('  ! ' + f);
const ok = !fail.length && n > 8 && moved > 500;
console.log(ok ? 'the animals stay where animals can stand' : 'SOMETHING IS IN THE RIVER');
process.exit(ok ? 0 : 1);
