// TOWNSFOLK — people who are not a fight.
//
// A crowd is not a set of slow enemies. An enemy wants to reach you; a person
// wants to get past you, and the whole feeling of walking through a market is
// that everyone has somewhere else to be and you are in the way of it.
//
// THE ONE RULE THAT MAKES IT WORK. Nobody runs away from the player. A person
// who backs off directly bunches up in front of you and the street jams, and
// what you feel is a wall of bodies retreating - the exact opposite of a
// crowd. Instead each person works out WHEN the two of you will be closest,
// and if that is soon and close, steps SIDEWAYS. The wave opens ahead of you
// and closes behind. See yieldForce.
//
// And they anticipate rather than react: the test uses your velocity, not your
// position, so people start leaning aside before you touch them. That one
// detail is most of the difference between a crowd and a pile of crates.
//
// WHY THEY ARE NOT ENEMIES. `world.enemies` is read in ninety-nine places, and
// `aimAngle()` in player.js auto-aims at `nearestEnemy(p.x, p.y, 420)` every
// single frame. Put a shopper in that array and the player's aim snaps onto
// her the moment she is the nearest body - and the music decides a fight has
// started. So folk live in `world.folk` and are hit by an explicit test.
//
// NOT ORCA, NOT RVO. Those solve a thousand agents with collision guarantees.
// For forty stylised people, four weighted forces read better, cost almost
// nothing, and can be tuned by feel rather than by proof.

import { world } from './state.js';
import { clamp, rand, TAU, normalize, pick } from './util.js';
import { collideWorld } from './ai.js';
import { drawFigure } from './figures.js';

/** How big a person is, and how hard they are to shove. */
const R = 14;
const MASS = { adult: 1, porter: 1.5, child: 0.55 };

/** Walking speeds, in world units a second. The player walks at 268. */
const SPEED = { adult: 74, porter: 62, child: 118 };

// --- tuning, all in one place so it can be felt with rather than hunted for ---
export const CROWD = {
  // Separation between people.
  push: 190,          // how hard neighbours shove apart
  // The yield force.
  look: 0.70,         // seconds ahead we predict a collision
  clear: 12,          // extra room a person wants past touching
  yieldPush: 340,     // how hard they step aside
  // The player pressing through.
  shove: 8,           // the player's mass, relative to a person's
  slowNear: 46,       // count folk inside this to slow him
  slowK: 0.20,        // each one costs this much of his speed
  slowFloor: 0.42,    // and he never drops below this
};

// WHAT ACTUALLY MAKES A CROWD, measured rather than guessed.
//
// The first attempt put people in an open square and tuned the slowdown hard
// looking for the feeling. It never arrived: across the whole range of
// settings, walking the length of the crowd cost between 1.07x and 1.27x the
// empty walk, and the worst speed barely dipped. The reason is that the yield
// force works - people get out of the way so well that you are never actually
// among them, and a crowd you can always slip past is not a crowd.
//
// It is the WALLS. Penned into a lane 96 units wide, with nowhere sideways to
// go, the same people and the same numbers give:
//
//     27 people, 25% of the lane covered   1.68x
//     54 people, 49%                       1.98x
//     74 people, 68%                       2.10x
//
// and it plateaus there - you are slowed, never stopped. So the narrow street
// has to be genuinely narrow and genuinely walled; scattering forty people
// across an open market square will look busy and feel like nothing.
//
// The tuning above is a consequence of that, not the cause of it: slowK 0.20
// gives a readable ramp (1 person 0.83, 2 0.71, 3 0.63, 4 0.56) instead of
// slamming into the floor at four.

let nextId = 1;

/**
 * One person. `home` is where they belong and drift back to; `goal` is where
 * they are heading right now.
 */
/** The clothes of one person. Read by figures.js in place of its own palette. */
const CLOTH = ['#6a5a7a', '#4a5a7a', '#7a5a4a', '#5a6a4a', '#7a6a5a', '#4a6a6a',
  '#6a4a5a', '#5a4a3a', '#7a7a5a', '#48566a'];

export function makeFolk(x, y, kind = 'adult', extra = {}) {
  return {
    id: nextId++,
    kind,
    // WHAT figures.js NEEDS. `type` picks the definition, `tint` is this
    // person's own clothes, and `r` sets their size (REF is 17). Everything
    // else it wants - the gait, the facing octant, the smear - it derives
    // from where they were last frame and stashes on `g`-prefixed fields.
    type: kind === 'child' ? 'child' : kind === 'porter' ? 'porter' : 'townsfolk',
    tint: pick(CLOTH),
    color: '#000',
    flash: 0,
    x, y, vx: 0, vy: 0,
    r: R,
    mass: MASS[kind] || 1,
    speed: (SPEED[kind] || 74) * rand(0.9, 1.1),
    face: rand(0, TAU),
    state: 'stroll',
    t: 0,
    home: { x, y },
    goal: null,
    pause: 0,
    seed: rand(0, 100),
    hp: 12,
    dead: false,
    // What figures.js and the draw pass read: how fast they are actually
    // going, which is not the same as what they intended.
    moveMag: 0,
    ...extra,
  };
}

/**
 * A rectangle that keeps itself full of people walking one way through it.
 *
 * This is the reusable piece: drop one on a street, a bridge or a gate and it
 * populates itself. People are RECYCLED rather than spawned and destroyed -
 * walk out of the far end and you reappear at the near one - so the cost is
 * flat and there is no churn.
 */
export function makeCrowd(x, y, w, h, flow = 0, density = 0.7, kinds = ['adult'], max = 999) {
  const area = (w * h) / (100 * 100);
  // A CAP, because density alone lies about the cost. Six per hundred square
  // units is the measured sweet spot for how a lane FEELS, but a lane twice
  // as long then costs twice as much to draw for no extra feeling - you can
  // only ever be in one part of it. Cap the people, keep the density where
  // you are.
  const n = Math.min(max, Math.max(1, Math.round(area * density)));
  const c = { x, y, w, h, flow, density, kinds, folk: [] };
  for (let i = 0; i < n; i++) {
    const kind = kinds[(Math.random() * kinds.length) | 0];
    const f = makeFolk(x + rand(0, w), y + rand(0, h), kind, { crowd: c });
    // Half walk one way, half the other, or a one-way street looks like a
    // parade rather than a market.
    f.flow = flow + (Math.random() < 0.5 ? 0 : Math.PI) + rand(-0.12, 0.12);
    c.folk.push(f);
    world.folk.push(f);
  }
  return c;
}

/** Put a walker back at the other end once they leave their volume. */
function recycle(f) {
  const c = f.crowd;
  const pad = 20;
  const inside = f.x > c.x - pad && f.x < c.x + c.w + pad
              && f.y > c.y - pad && f.y < c.y + c.h + pad;
  if (inside) return;
  // Re-enter from the side they are walking away from, at a fresh offset.
  const fx = Math.cos(f.flow), fy = Math.sin(f.flow);
  if (Math.abs(fx) > Math.abs(fy)) {
    f.x = fx > 0 ? c.x - pad * 0.5 : c.x + c.w + pad * 0.5;
    f.y = c.y + rand(0, c.h);
  } else {
    f.y = fy > 0 ? c.y - pad * 0.5 : c.y + c.h + pad * 0.5;
    f.x = c.x + rand(0, c.w);
  }
  f.vx = 0; f.vy = 0;
}

/**
 * THE YIELD FORCE — the one that makes a crowd feel like a crowd.
 *
 * Work out the moment the two of us will be closest, given where we are both
 * going. If that moment is soon and that distance is inside touching, step
 * ASIDE - perpendicular to his heading, on whichever side I already lean.
 *
 * Sideways and not backwards is the whole trick. Backwards is what makes a
 * street jam; sideways is what makes it part.
 */
function yieldForce(f, p, out) {
  const dpx = f.x - p.x, dpy = f.y - p.y;
  const near2 = dpx * dpx + dpy * dpy;
  if (near2 > 200 * 200) return;                   // too far to care

  // His velocity. The player's vx/vy are knockback only, so use the honest
  // one: where he is walking, times how fast.
  const pSpeed = (p.moveMag || 0) * 268 * (p.groundMult || 1);
  const pa = p.moveAngle !== undefined ? p.moveAngle : p.face;
  const pvx = Math.cos(pa) * pSpeed, pvy = Math.sin(pa) * pSpeed;

  const dvx = f.vx - pvx, dvy = f.vy - pvy;
  const dv2 = dvx * dvx + dvy * dvy;
  if (dv2 < 1) return;                             // nobody is closing

  // Time of closest approach, clamped to the window we look ahead over.
  let t = -(dpx * dvx + dpy * dvy) / dv2;
  if (t < 0) return;                               // already past each other
  t = Math.min(t, CROWD.look);

  const cx = dpx + dvx * t, cy = dpy + dvy * t;
  const closest = Math.hypot(cx, cy);
  const want = f.r + (p.r || 17) + CROWD.clear;
  if (closest > want) return;                      // we will miss anyway

  // How urgent: closer approach and sooner both push harder.
  const urgency = (1 - closest / want) * (1 - t / CROWD.look);

  // Sideways, on the side I already lean toward. `cross` of his heading with
  // the offset between us says which side that is.
  const cross = Math.cos(pa) * dpy - Math.sin(pa) * dpx;
  const side = cross >= 0 ? 1 : -1;
  const px = -Math.sin(pa) * side, py = Math.cos(pa) * side;

  // Faster approach, harder scramble.
  const rush = clamp(pSpeed / 268, 0.35, 1.4);
  out.x += px * CROWD.yieldPush * urgency * rush;
  out.y += py * CROWD.yieldPush * urgency * rush;
  f.yielding = 0.35;
}

/** Everyone shoves everyone, and the light give way to the heavy. */
function separation(f, out) {
  for (const o of world.folk) {
    if (o === f || o.dead) continue;
    const dx = f.x - o.x, dy = f.y - o.y;
    const d2 = dx * dx + dy * dy;
    const min = f.r + o.r;
    if (d2 > min * min || d2 < 0.01) continue;
    const d = Math.sqrt(d2);
    // Heavier neighbours move you more than you move them.
    const give = o.mass / (f.mass + o.mass);
    const k = ((min - d) / min) * CROWD.push * give * 2;
    out.x += (dx / d) * k;
    out.y += (dy / d) * k;
  }
}

/** Where this person is trying to get to, as a unit vector into `out`. */
function goalForce(f, out) {
  if (f.state === 'work') return;                  // they stay put
  let tx, ty;
  if (f.crowd) {
    // A walker heads along the flow, for ever.
    tx = f.x + Math.cos(f.flow) * 200;
    ty = f.y + Math.sin(f.flow) * 200;
  } else if (f.goal) {
    // Reached the stall they wanted: look at it a moment, then pick another.
    if (Math.hypot(f.goal.x - f.x, f.goal.y - f.y) < 34) {
      if (f.pause <= 0) f.pause = rand(1.4, 4);
      if (f.stalls && f.stalls.length) f.goal = f.stalls[(Math.random() * f.stalls.length) | 0];
      return;
    }
    tx = f.goal.x; ty = f.goal.y;
  } else return;
  const [nx, ny] = normalize(tx - f.x, ty - f.y);
  out.x += nx * f.speed * 2.4;
  out.y += ny * f.speed * 2.4;
}

/** One person, one tick. */
function stepFolk(f, p, dt) {
  if (f.dead) return;
  if (f.yielding > 0) f.yielding -= dt;

  if (f.pause > 0) { f.pause -= dt; }
  const want = { x: 0, y: 0 };
  if (f.pause <= 0) goalForce(f, want);
  separation(f, want);
  if (p && !p.dead) yieldForce(f, p, want);

  // Steer toward the wanted velocity rather than snapping to it, so a person
  // leans into a change of direction instead of pivoting on the spot.
  const turn = 1 - Math.pow(0.0001, dt);
  f.vx += (want.x - f.vx) * turn;
  f.vy += (want.y - f.vy) * turn;

  // Nobody outruns their legs.
  const sp = Math.hypot(f.vx, f.vy);
  const cap = f.speed * (f.yielding > 0 ? 1.5 : 1);
  if (sp > cap) { f.vx = (f.vx / sp) * cap; f.vy = (f.vy / sp) * cap; }

  f.x += f.vx * dt;
  f.y += f.vy * dt;
  f.moveMag = Math.min(1, sp / f.speed);
  if (sp > 4) f.face = Math.atan2(f.vy, f.vx);

  collideWorld(f);
  if (f.crowd) recycle(f);
}

/**
 * THE PLAYER PRESSING THROUGH.
 *
 * Two halves, and they have to be two halves. The shove is what makes bodies
 * feel solid; the slowdown is what makes a crowd feel like weather. With only
 * the shove you skate through people; with only the slowdown you wade through
 * treacle with no idea why.
 *
 * And the slowdown EASES as they part, which is the loop the whole thing
 * turns on: press in, slow down, they notice and open, speed comes back.
 */
function pressThrough(p, dt) {
  if (!p || p.dead) return;
  let near = 0;
  for (const f of world.folk) {
    if (f.dead) continue;
    const dx = p.x - f.x, dy = p.y - f.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < CROWD.slowNear * CROWD.slowNear) near++;
    const min = p.r + f.r;
    if (d2 > min * min || d2 < 0.01) continue;
    // Soft, and mostly one way: he displaces them, they barely move him.
    const d = Math.sqrt(d2);
    const overlap = min - d;
    const nx = dx / d, ny = dy / d;
    const total = CROWD.shove + f.mass;
    f.x -= nx * overlap * (CROWD.shove / total);
    f.y -= ny * overlap * (CROWD.shove / total);
    p.x += nx * overlap * (f.mass / total);
    p.y += ny * overlap * (f.mass / total);
  }
  if (near > 0) {
    const k = Math.max(CROWD.slowFloor, 1 / (1 + CROWD.slowK * near));
    p.groundMult = Math.min(p.groundMult === undefined ? 1 : p.groundMult, k);
  }
  p.inCrowd = near;
}

/** Everyone, one tick. Called from updateOverworld and the Training Ground. */
export function updateFolk(dt, p = world.player) {
  const n = world.folk.length;
  if (!n) return;
  for (let i = 0; i < n; i++) stepFolk(world.folk[i], p, dt);
  pressThrough(p, dt);
  // The dead are swept after everyone has moved, so an index loop is safe.
  for (let i = world.folk.length - 1; i >= 0; i--) {
    const f = world.folk[i];
    if (f.dead && (f.t += dt) > 2) world.folk.splice(i, 1);
  }
}

/**
 * Fill a market: keepers at their stalls, shoppers drifting between them, and
 * a crowd flowing down the lane.
 *
 * Three populations because a market is three things at once. Take any one
 * away and it stops reading: only keepers and it is a museum, only shoppers
 * and nobody is selling anything, only the lane crowd and it is a corridor.
 */
export function fillMarket(P) {
  clearFolk();
  const M = P.market;
  if (!M) return;

  // The keepers. Each is pinned behind their own table by the same leash the
  // Wilds already uses to hold a champion to its ring.
  for (const st of M.stalls) {
    const f = makeFolk(st.x, st.y, Math.random() < 0.25 ? 'porter' : 'adult');
    f.state = 'work';
    f.home = { x: st.x, y: st.y };
    f.leash = { x: st.x, y: st.y, r: 26 };
    f.face = st.y < P.y ? Math.PI / 2 : -Math.PI / 2;   // facing their table
    world.folk.push(f);
  }

  // Shoppers, wandering the square from stall to stall.
  const sq = M.square;
  for (let i = 0; i < 8; i++) {
    const f = makeFolk(sq.x + rand(40, sq.w - 40), sq.y + rand(40, sq.h - 40),
      Math.random() < 0.18 ? 'child' : 'adult');
    f.stalls = M.stalls;
    f.goal = M.stalls.length ? M.stalls[(Math.random() * M.stalls.length) | 0] : null;
    world.folk.push(f);
  }

  // And the lane. Density 6 is the measured sweet spot: about forty people in
  // a hundred-wide street, 37% of it covered, and a crossing that costs a bit
  // over twice the empty walk without ever stopping you.
  // The lane. Density 6 is the measured sweet spot - about forty people in a
  // hundred-wide street, 37% of it covered, a crossing costing a bit over
  // twice the empty walk - but this lane is thirteen hundred long, and six
  // per hundred square units over all of it is eighty-two people at ten
  // milliseconds a frame to draw. Capped at twenty-two: you are only ever in
  // one stretch of the street, and the rest is cost with no feeling attached.
  const L = M.lane;
  makeCrowd(L.x, L.y, L.w, L.h, 0, 6, ['adult', 'adult', 'porter', 'child'], 22);
}

export function clearFolk() {
  world.folk.length = 0;
}

// --- drawing ------------------------------------------------------------------
//
// A cheap body, in drawNpc's flat style: no skeleton, no animator, no pose
// function. About twenty-five canvas operations, against thirty-five to
// fifty-five for a figures.js puppet. At forty people that is the difference
// between roughly a thousand operations a frame and roughly two thousand, on
// a budget where grass once cost forty frames a second by stroking too much.
//
// The walk is one sine wave off `seed` and distance travelled - enough to
// read as walking at this size, and free.

const SKIN = ['#d8ab7e', '#c08a5a', '#e2bb92', '#a87450'];

/**
 * One person, drawn with the game's own character system.
 *
 * `drawFigure` is the same puppet the enemies and the Wanderer use - eight
 * facing octants, two-bone legs and arms, a stepped stride, squash on a
 * wind-up. It costs more than the flat body below (roughly 35-55 canvas
 * operations against 25) and it is worth it: a market drawn in a different
 * style from everything else in the world reads as a different game.
 *
 * It returns false when the hooded skin is on (the chambers) or when there
 * is no definition, and then the flat body takes over so nothing vanishes.
 */
export function drawFolkOne(ctx, f, time, full = true) {
  if (full && !f.dead && drawFigure(f, ctx)) {
    if (f.yielding > 0) {
      // A glance your way: the only tell they get, and it is enough.
      ctx.fillStyle = `rgba(255,214,170,${(f.yielding * 0.45).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(f.x, (f.figTop || f.y - 40) - 6, 1.7, 0, TAU); ctx.fill();
    }
    return;
  }
  drawFolkFlat(ctx, f, time);
}

/** The fallback body: flat, cheap, and used where the figure system is off. */
function drawFolkFlat(ctx, f, time) {
  const x = f.x, y = f.y;
  const i = f.seed | 0;
  const cloth = f.tint || CLOTH[i % CLOTH.length];
  const skin = SKIN[(i >> 2) % SKIN.length];
  const tall = f.kind === 'child' ? 0.68 : f.kind === 'porter' ? 1.1 : 1;
  const H = 30 * tall;

  // The stride: a person standing still still breathes.
  const step = Math.sin(time * 7 * f.moveMag + f.seed) * f.moveMag;
  const bob = Math.abs(step) * 1.6;

  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath(); ctx.ellipse(x + 2, y + 4, 11 * tall, 4.5 * tall, 0, 0, TAU); ctx.fill();

  if (f.dead) {
    // Face down, and that is all. No corpse system yet.
    ctx.save(); ctx.translate(x, y); ctx.rotate(f.face);
    ctx.fillStyle = cloth; ctx.strokeStyle = '#1b130f'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.ellipse(0, 0, 15 * tall, 7 * tall, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.restore();
    return;
  }

  const out = (col) => { ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = '#1b130f'; ctx.lineWidth = 1.4; ctx.stroke(); };

  // Legs, two strokes, swinging opposite.
  ctx.strokeStyle = '#3a2b22'; ctx.lineWidth = 3.2 * tall; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 3, y - H * 0.34); ctx.lineTo(x - 3 + step * 3, y + 2 - bob);
  ctx.moveTo(x + 3, y - H * 0.34); ctx.lineTo(x + 3 - step * 3, y + 2 - bob);
  ctx.stroke();

  // The body: one rounded shape, leaning the way they walk.
  const lean = Math.cos(f.face) * 1.6 * f.moveMag;
  ctx.beginPath();
  ctx.moveTo(x - 7, y - H * 0.34 - bob);
  ctx.quadraticCurveTo(x - 9 + lean, y - H * 0.7 - bob, x - 6 + lean, y - H - bob);
  ctx.lineTo(x + 6 + lean, y - H - bob);
  ctx.quadraticCurveTo(x + 9 + lean, y - H * 0.7 - bob, x + 7, y - H * 0.34 - bob);
  ctx.closePath();
  out(cloth);

  // An arm, swinging against the legs.
  ctx.strokeStyle = skin; ctx.lineWidth = 2.6 * tall;
  ctx.beginPath();
  ctx.moveTo(x + 6 + lean, y - H * 0.85 - bob);
  ctx.lineTo(x + 7 + lean - step * 3, y - H * 0.4 - bob);
  ctx.stroke();

  // Head, turned the way they are facing.
  const hx = x + lean + Math.cos(f.face) * 1.8;
  ctx.beginPath(); ctx.arc(hx, y - H - 6.5 - bob, 5.6 * tall, 0, TAU); out(skin);
  // Hair, a cap over the crown only - a full dark circle reads as a beard.
  ctx.fillStyle = '#2a1c18';
  ctx.beginPath();
  ctx.arc(hx, y - H - 6.5 - bob, 5.6 * tall, Math.PI, TAU);
  ctx.fill();

  // Yielding: a glance your way. The only tell they get, and it is enough.
  if (f.yielding > 0) {
    ctx.fillStyle = `rgba(255,214,170,${(f.yielding * 0.5).toFixed(2)})`;
    ctx.beginPath(); ctx.arc(hx, y - H - 13 - bob, 1.6, 0, TAU); ctx.fill();
  }
}

/**
 * Everyone, sorted so they overlap correctly.
 *
 * Nothing else in this game y-sorts - the whole render is fixed layers - so
 * forty standing bodies drawn in spawn order would overlap in the wrong
 * order and the crowd would read as flat. Forty items is a trivial sort.
 */
export function drawFolk(ctx, time, inView) {
  if (!world.folk.length) return;
  const seen = [];
  for (const f of world.folk) {
    if (!inView || inView(f.x, f.y, 90)) seen.push(f);
  }
  seen.sort((a, b) => a.y - b.y);

  // LEVEL OF DETAIL, and it is not optional.
  //
  // Measured on the dev PC: rendering a frame costs 7.6 ms with nobody in the
  // market and 21 ms with forty figures on screen - about a third of a
  // millisecond each, against a sixteen millisecond budget that already has
  // three committed to streaming. A phone would be worse.
  //
  // So the nearest people get the real puppet, with its eight facing octants
  // and two-bone limbs, and everybody else gets the flat body at roughly half
  // the cost. You look at whoever is next to you; the far end of the street
  // only has to read as a crowd.
  const p = world.player;
  const px = p ? p.x : 0, py = p ? p.y : 0;
  let full = 0;
  for (const f of seen) {
    const near = (f.x - px) * (f.x - px) + (f.y - py) * (f.y - py) < LOD_NEAR * LOD_NEAR;
    const rich = near && full < LOD_MAX;
    if (rich) full++;
    drawFolkOne(ctx, f, time, rich);
  }
}

/** How close, and how many at once, get the full character rig. */
const LOD_NEAR = 260;
const LOD_MAX = 12;
