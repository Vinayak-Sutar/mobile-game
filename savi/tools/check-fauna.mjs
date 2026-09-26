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

const n = initFauna(V, classify, (x, y) => Math.hypot(x - 2600, y - 3120));
console.log('placed            : %d animals', n);

const S = { x: 2600, y: 3120 };
const st = { bloomK: 0 };
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
console.log('failures          : %d %s', fail.length, worst);
for (const f of fail.slice(0, 5)) console.log('  ! ' + f);
const ok = !fail.length && n > 8 && moved > 500;
console.log(ok ? 'the animals stay where animals can stand' : 'SOMETHING IS IN THE RIVER');
process.exit(ok ? 0 : 1);
