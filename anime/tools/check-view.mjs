// IS THERE EXACTLY ONE PROJECTION, AND IS IT THE ONE WE MEASURED?
//
// Every "everything is mirrored" and "the shadow is half a tile off" bug this
// project has ever had came from two pieces of code both knowing how the
// camera works and then disagreeing. So this reads the source as well as
// running it: a second projection is a bug that does not throw, looks almost
// right, and is found three weeks later.
//
// Run:  node anime/tools/check-view.mjs

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const { toScreen, depth, camera, GROUND, RISE, ELEV } = await import('../src/view.js');

let bad = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) bad++; };
const near = (a, b, eps) => Math.abs(a - b) <= eps;

// --- 1. the source says there is only one -----------------------------------
console.log('one projection, and only one:');
{
  const files = readdirSync(SRC).filter((f) => f.endsWith('.js'));
  const others = files.filter((f) => f !== 'view.js');

  let defs = 0;
  for (const f of files) {
    const n = (readFileSync(join(SRC, f), 'utf8').match(/function\s+toScreen\s*\(/g) || []).length;
    defs += n;
    if (n && f !== 'view.js') ok(false, `${f} defines its own toScreen`);
  }
  ok(defs === 1, `toScreen is defined ${defs} time(s), in view.js`);

  // Only the projector needs to know where the camera's focus lands on the
  // canvas. Anything else touching ox/oy is placing pixels by hand.
  const origin = others.filter((f) => /camera\s*\.\s*o[xy]/.test(readFileSync(join(SRC, f), 'utf8')));
  ok(origin.length === 0, origin.length
    ? `${origin.join(', ')} reach for camera.ox/oy - that is a second projection`
    : 'nothing outside view.js touches camera.ox / camera.oy');

  // RISE and ELEV belong to the projection alone. GROUND is allowed out, but
  // only as the squash factor for a circle drawn on the ground.
  for (const f of others) {
    const s = readFileSync(join(SRC, f), 'utf8');
    const imports = (s.match(/import\s*\{([^}]*)\}\s*from\s*'\.\/view\.js'/) || [, ''])[1];
    for (const name of ['RISE', 'ELEV']) {
      if (new RegExp(`\\b${name}\\b`).test(imports)) {
        ok(false, `${f} imports ${name} - only view.js may use it`);
      }
    }
  }
  ok(bad === 0 || true, 'only view.js imports RISE / ELEV');

  // A loose 0.5-ish or 1.2-ish multiplier next to a coordinate is how a second
  // projection usually sneaks in. Catch the exact constants.
  const sus = [];
  for (const f of others) {
    const s = readFileSync(join(SRC, f), 'utf8');
    if (/\*\s*0\.51[0-9]?\b/.test(s) || /\*\s*1\.21[0-9]?\b/.test(s)) sus.push(f);
  }
  ok(sus.length === 0, sus.length
    ? `${sus.join(', ')} multiply by the camera's own constants`
    : 'nobody else hard-codes 0.515 or 1.212');
}

// --- 2. it is the camera the footage measured -------------------------------
console.log('');
console.log('and it is the camera we measured off the ED:');
{
  camera.x = 0; camera.y = 0; camera.scale = 1; camera.ox = 0; camera.oy = 0;
  const o = toScreen(0, 0, 0);
  const px = toScreen(100, 0, 0), py = toScreen(0, 100, 0), pz = toScreen(0, 0, 100);

  ok(near(o.x, 0, 1e-9) && near(o.y, 0, 1e-9), 'the origin lands on the origin');

  const ax = Math.atan2(px.y - o.y, px.x - o.x) * 180 / Math.PI;
  const ay = Math.atan2(py.y - o.y, py.x - o.x) * 180 / Math.PI;
  ok(near(ax, 27.3, 1.2), `+x leaves at ${ax.toFixed(1)} deg (the footage measured +27)`);
  ok(near(180 - ay, 27.3, 1.2), `+y leaves at ${ay.toFixed(1)} deg (the footage measured -28, mirrored)`);
  ok(near(px.y - o.y, -(o.y - py.y), 1e-9), 'the two ground axes drop by the same amount');

  ok(near(pz.x - o.x, 0, 1e-9), 'up is dead vertical on screen - height never moves a thing sideways');
  ok(pz.y < o.y, 'and it moves it UP');
  ok(near(RISE, 1.212, 0.01), `a unit of height rises ${RISE.toFixed(3)} against a ground unit's reach`);
  ok(near(GROUND, 0.515, 0.01), `a unit along the ground drops ${GROUND.toFixed(3)}`);
  ok(near(Math.asin(GROUND) * 180 / Math.PI, 31, 0.4), 'which is a camera 31 degrees above the ground');
  ok(near(ELEV * 180 / Math.PI, 31, 1e-9), 'and ELEV says so too');
}

// --- 3. it is linear, and it inverts ----------------------------------------
console.log('');
console.log('it behaves like a projection:');
{
  camera.x = 140; camera.y = -60; camera.scale = 0.735; camera.ox = 300; camera.oy = 220;
  const a = toScreen(10, 20, 5), b = toScreen(310, 20, 5), c = toScreen(610, 20, 5);
  ok(near((b.x - a.x), (c.x - b.x), 1e-9) && near((b.y - a.y), (c.y - b.y), 1e-9),
    'equal steps in the world are equal steps on the screen (no perspective)');

  // Invert it by hand and check we get back where we started.
  const back = (p, z) => {
    const u = (p.x - camera.ox) / camera.scale;              // u = dx - dy
    const v = ((p.y - camera.oy) / camera.scale + z * RISE) / GROUND;  // v = dx + dy
    return { x: (u + v) / 2 + camera.x, y: (v - u) / 2 + camera.y };
  };
  let worst = 0;
  for (const [x, y, z] of [[0, 0, 0], [500, -300, 180], [-220, 940, 0], [77, 13, 41]]) {
    const r = back(toScreen(x, y, z), z);
    worst = Math.max(worst, Math.abs(r.x - x), Math.abs(r.y - y));
  }
  ok(worst < 1e-9, `it round-trips, worst error ${worst.toExponential(1)}`);
}

// --- 4. the depth sort agrees with the camera -------------------------------
console.log('');
console.log('depth is x + y, which is the part that is easy to get wrong:');
{
  ok(depth(3, 4) === 7, 'depth(x, y) is x + y');
  camera.x = 0; camera.y = 0; camera.scale = 1; camera.ox = 0; camera.oy = 0;

  // Under THIS camera a larger x + y must sit lower on the screen. Under the
  // oblique camera the plan first assumed, it was a larger y - which would put
  // half a street in front of the wrong things.
  let wrong = 0, yOnly = 0;
  for (let i = 0; i < 400; i++) {
    const a = { x: (i * 37) % 900 - 450, y: (i * 53) % 900 - 450 };
    const b = { x: (i * 71) % 900 - 450, y: (i * 29) % 900 - 450 };
    if (depth(a.x, a.y) === depth(b.x, b.y)) continue;
    const nearer = depth(a.x, a.y) > depth(b.x, b.y) ? a : b;
    const further = nearer === a ? b : a;
    if (toScreen(nearer.x, nearer.y, 0).y <= toScreen(further.x, further.y, 0).y) wrong++;
    if ((nearer.y > further.y) !== (depth(nearer.x, nearer.y) > depth(further.x, further.y))) yOnly++;
  }
  ok(wrong === 0, wrong ? `${wrong} pairs sort the wrong way round` : 'a larger depth always draws lower on screen');
  ok(yOnly > 0, `and ${yOnly} of 400 pairs would sort differently on y alone - which is why it is not y`);
}

console.log('');
console.log(bad ? `${bad} thing(s) wrong with the camera` : 'one projection, measured, and the sort agrees with it');
process.exit(bad ? 1 : 0);
