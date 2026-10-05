// ============================================================================
// NAGARAJA, THE COIL BENEATH — an ancient temple serpent. Patient, hypnotic,
// then sudden. "The arena is not a floor. It is her body."
//
// Her body is ~770 u long: 36 scaled segments that follow her head's path.
// The body is a moving WALL — you can't walk through it (a DASH hops over it,
// except while she's coiling) and it blocks bullets, hers and yours — so she
// reshapes the arena as she moves. Only her head takes full
// damage; the armoured coils take a quarter — but three GLOWING SCALES along
// her body take extra (they move to new scales as you crack them).
//
// Every move is a snake move: strikes, venom, fangs, the tail's rattle, a
// cobra's hood, burrowing, coiling, shedding skin, a hypnotic sway.
//
// Phase 2, HYDRA (at half health): she tears in two and a second head grows
// from the stump. Both heads hunt you together.
//
// Cheese-proofing:
//   standing on her head    → Hood Flare (a hiss-shockwave and a venom spray);
//   keeping far away        → she Burrows under you, Sidewinds across, spits;
//   hiding behind her coils → the coils MOVE; Tail Lash; the Coil itself;
//   standing inside a loop  → The Coil closes: get out through the gap, or
//                             crack her scales to make her let go.
//
// Phase 1: Strike, Double Strike, Fang Volley, Venom Spit, Tail Lash, Burrow,
// Hood Flare, Sidewinder, The Coil (signature), Hypnotic Sway (barrage).
// Phase 2 adds: Twin Strike, Crossfire, Venom Rain, Shed Skin, Great Coil,
// Ouroboros (barrage).
// ============================================================================

import { world, arena, arenaBounds } from './state.js';
import { TAU, clamp, rand, dist, angleTo, angleDiff, lerp } from './util.js';
import { act, sub, idle, expose, shot, shockwave, lane, inArena, spawnEnemyFn } from './boss-kit.js';
import { damagePlayer } from './combat.js';
import { burst, ring, shake, flash, damageText } from './fx.js';
import { sfx } from './audio.js';
import { spawnHazard } from './hazards.js';

const PI = Math.PI;
const N_SEGS = 36;
const SPACING = 21;
const SCALE = '#2f8f6a';
const SCALE_DK = '#10362a';
const SCALE_LT = '#6fd8a4';
const GOLDEN = '#f2c14e';
const VENOM = '#9be34a';
const EYE = '#ffb020';
// A strike lunges 360 u; the bite reaches head radius + ~10 either side of
// the line. The lane on the floor must cover all of it (a first draft drew
// it 60 wide against a ~72-wide bite, and a bot found it).
const STRIKE_LUNGE = 360;
const STRIKE_LANE_W = 76;
const STRIKE_LANE_LEN = STRIKE_LUNGE + 38;

const p2 = (e) => e.phase >= 2;
const tell = (e, t) => t * (p2(e) ? 0.85 : 1);

function say(e, text, color = '#c9ffd8') {
  damageText(e.x, e.y - e.r - 30, text, { color, size: 16 });
}

const segR = (j, n) => lerp(21, 9, n > 1 ? j / (n - 1) : 0);

// --- the serpent body: a trail the segments follow ---------------------------

/** A serpent from a polyline (tail first, head last). */
function makeSerpent(head, ents, pts) {
  const S = { head, ents, trail: [], s: 0, under: [], headUnder: false, scale: 1, pos: [], biteCd: 0 };
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i) s += dist(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
    S.trail.push({ x: pts[i].x, y: pts[i].y, s });
  }
  S.s = s;
  return S;
}

/** Record the head's position (a new trail point every few units). */
function trailPush(S) {
  const h = S.head;
  const last = S.trail[S.trail.length - 1];
  const d = dist(last.x, last.y, h.x, h.y);
  if (d < 2.5) return;
  S.s += d;
  S.trail.push({ x: h.x, y: h.y, s: S.s });
  const keep = S.s - (S.ents.length + 2) * SPACING - 120;
  let k = 0;
  while (k < S.trail.length - 2 && S.trail[k + 1].s < keep) k++;
  if (k > 0) S.trail.splice(0, k);
  S.under = S.under.filter((u) => u.to > keep);
}

function isUnder(S, s) {
  return S.under.some((u) => s > u.from && s < u.to);
}

/** Lay the segments along the trail, one pass from the head backwards. */
function layBody(S) {
  const tr = S.trail;
  const n = S.ents.length;
  let i = tr.length - 1;
  S.pos.length = n;
  for (let j = 0; j < n; j++) {
    const s = S.s - (j + 1) * SPACING;
    while (i > 0 && tr[i - 1].s > s) i--;
    let x, y;
    if (i <= 0 || s <= tr[0].s) { x = tr[0].x; y = tr[0].y; }
    else {
      const a = tr[i - 1], b = tr[i];
      const k = (s - a.s) / ((b.s - a.s) || 1);
      x = lerp(a.x, b.x, k); y = lerp(a.y, b.y, k);
    }
    const under = isUnder(S, s);
    const r = segR(j, n) * (j < 3 ? lerp(S.scale, 1, j / 3) : 1);
    S.pos[j] = { x, y, r, under };
    const ent = S.ents[j];
    ent.x = x; ent.y = y; ent.r = r;
    ent.invuln = under;
    ent.noTarget = under || !ent.weak;
  }
}

function dive(S) {
  S.under.push({ from: S.s, to: Infinity });
  S.headUnder = true;
  S.head.hidden = true;
  S.head.invuln = true;
  burst(S.head.x, S.head.y, { count: 20, color: '#8a6a44', speed: 220, size: 5, life: 0.5, drag: 3 });
  sfx.thud();
}

function emerge(S) {
  const u = S.under[S.under.length - 1];
  if (u && u.to === Infinity) u.to = S.s;
  S.headUnder = false;
  S.head.hidden = false;
  S.head.invuln = false;
  burst(S.head.x, S.head.y, { count: 26, color: '#8a6a44', speed: 300, size: 5, life: 0.6, drag: 3, shape: 'shard' });
  shake(0.35);
}

function surfaceAll(S) {
  for (const u of S.under) if (u.to === Infinity) u.to = S.s;
  S.under = [];
  S.headUnder = false;
  S.head.hidden = false;
  S.head.invuln = false;
}

/** Move a head: turn toward a target (snake-like), glide forward, stay inside. */
function slither(S, tx, ty, speed, turn, dt) {
  const h = S.head;
  const want = angleTo(h.x, h.y, tx, ty);
  h.face = (h.face || 0) + clamp(angleDiff(h.face || 0, want), -turn * dt, turn * dt);
  h.x += Math.cos(h.face) * speed * dt;
  h.y += Math.sin(h.face) * speed * dt;
  [h.x, h.y] = inArena(h.x, h.y, 34);
}

/** Head contact: a bite while it lunges. */
function bite(e, S, mult) {
  const p = world.player;
  if (!p || p.dead || S.headUnder || S.biteCd > 0) return;
  if (dist(S.head.x, S.head.y, p.x, p.y) < S.head.r + p.r * 0.5) {
    if (damagePlayer(Math.round(e.damage * mult), S.head.x, S.head.y, e.type)) S.biteCd = 0.6;
  }
}

function fangs(e, S, n, spread, center, speed, o = {}) {
  for (let k = 0; k < n; k++) {
    const a = n === 1 ? center : center + (k / (n - 1) - 0.5) * spread;
    shot(e, a, speed, { x: S.head.x, y: S.head.y, off: S.head.r * 0.9, shape: 'shard', r: 7, color: o.color || '#e8f0d0', dmg: o.dmg ?? 0.45, life: 3.5 });
  }
}

function leadAt(e, p, fromX, fromY, speed, k = 0.7) {
  const t = dist(fromX, fromY, p.x, p.y) / speed;
  return angleTo(fromX, fromY, p.x + (e.pvx || 0) * t * k, p.y + (e.pvy || 0) * t * k);
}

function venomLob(e, S, tx, ty) {
  const [x1, y1] = inArena(tx, ty, 40);
  spawnHazard({
    kind: 'lob', x0: S.head.x, y0: S.head.y - 10, x1, y1, flight: 0.85, r: 48,
    damage: Math.round(e.damage * 0.4), color: VENOM, source: e.type, owner: e, height: 140, shellR: 8, quiet: true,
    onDetonate: (h) => { e.pools.push({ x: h.x, y: h.y, r: 58, t: 5, tick: 0 }); sfx.splash(); },
  });
}

/** Pick the weak (glowing) scales: three, never on the neck. */
function lightScales(e, among = null) {
  const pool = (among || e.segs).filter((s) => !s.dead && !s.weak && s.weakable);
  while (e.segs.filter((s) => s.weak && !s.dead).length < 3 && pool.length) {
    const s = pool.splice((Math.random() * pool.length) | 0, 1)[0];
    s.weak = true;
    s.weakHp = e.maxHp * 0.035;
  }
}

function startMove(e, p, name) {
  act(e, name, 0);
  e.lastMove = name;
  const mv = NAGA.moves[name];
  if (mv.cooldown) e.cool[name] = mv.cooldown;
  mv.start(e, p);
}

// --- the moveset ------------------------------------------------------------------

export const NAGA = {
  phases: [0.5],
  phaseTime: 3.4,
  roarPitch: 0.6,
  opening: { gaze: 14, coil: 9, burrow: 5, sidewinder: 4, twin: 99, crossfire: 99, rain: 99, shed: 99, greatcoil: 99, ouroboros: 99 },

  /** An open temple floor: her body is the only wall. */
  arena() { return []; },

  init(e) {
    const b = arenaBounds();
    e.pools = [];
    e.paths = [];
    e.venom = 0;
    e.gaze = 0;
    e.hood = 0;
    e.jaw = 0;
    e.hug = 0;
    e.far = 0;
    e.struggle = 0;
    e.face = PI / 2;
    // Lay her across the top of the temple in a lazy S, head at the spawn.
    const pts = [];
    for (let k = 30; k >= 0; k--) {
      const f = k / 30;
      pts.push({ x: clamp(e.x - 560 * f + Math.sin(f * PI * 2) * 40, b.l + 40, b.r - 40), y: clamp(e.y - 30 + Math.sin(f * PI * 4) * 70, b.t + 30, b.b - 30) });
    }
    e.segs = [];
    for (let j = 0; j < N_SEGS; j++) {
      const s = spawnEnemyFn('nagaseg', e.x, e.y, { instant: true, summoner: e, color: SCALE });
      s.proxyOf = e;
      s.proxyMult = (q) => (q.weak ? 1.6 : 0.25);
      s.onProxyHit = (q, dealt) => {
        if (!q.weak) return;
        q.weakHp -= dealt;
        if (q.weakHp <= 0) {
          q.weak = false;
          burst(q.x, q.y, { count: 16, color: GOLDEN, speed: 260, size: 4, life: 0.4, drag: 4, shape: 'shard' });
          damageText(q.x, q.y - 16, 'CRACKED', { color: GOLDEN, size: 14 });
          sfx.block();
          e.relight = 1.5;
        }
      };
      s.weakable = j >= 3;
      e.segs.push(s);
    }
    e.S = [makeSerpent(e, e.segs, pts)];
    layBody(e.S[0]);
    lightScales(e);
    e.relight = 0;
    sfx.hiss();
    say(e, 'Sssso small…');
  },

  // Every frame: the body, collisions, pools, the second head, reading the player.
  tick(e, dt, p) {
    e.hood = Math.max(0, e.hood - dt * 1.5);
    e.jaw = Math.max(0, e.jaw - dt * 3);
    if (e.exposed > 0 && e.action !== 'exposed') e.exposed = Math.max(0, e.exposed - dt);
    e.gaze = lerp(e.gaze, e.action === 'gaze' && e.sub === 'sway' ? 1 : 0, 1 - Math.exp(-3 * dt));
    if (p2(e) && e.action !== 'phase') e.venom = lerp(e.venom, 1, 1 - Math.exp(-2 * dt));
    if (e.relight > 0) { e.relight -= dt; if (e.relight <= 0) lightScales(e); }

    for (const S of e.S) {
      S.biteCd = Math.max(0, S.biteCd - dt);
      trailPush(S);
      layBody(S);
    }

    // The body is a wall: push the player out of every surfaced segment (and
    // the shed skin), and stop enemy bullets that run into it.
    const walls = [];
    for (const S of e.S) for (const q of S.pos) if (!q.under) walls.push(q);
    if (e.skin) { for (const q of e.skin.pts) walls.push(q); e.skin.t -= dt; if (e.skin.t <= 0) shedCrumble(e); }
    // A dash hops over her coils — except while she's coiling: then the body
    // is raised (drawn with a gold rim) and nothing crosses it.
    const raised = !!(e.coilC && (e.sub === 'lay' || e.sub === 'squeeze'));
    e.raised = raised;
    if (!p.dead && (!p.dashing || raised)) {
      for (const q of walls) {
        const d = dist(p.x, p.y, q.x, q.y), min = q.r + p.r * 0.85;
        if (d < min && d > 0.01) { p.x = q.x + (p.x - q.x) / d * min; p.y = q.y + (p.y - q.y) / d * min; }
      }
    }
    for (const pr of world.projectiles) {
      if (pr.friendly || pr.cleared || pr.life <= 0 || pr.maxLife - pr.life < 0.2) continue;
      for (const q of walls) {
        if (dist(pr.x, pr.y, q.x, q.y) < q.r + pr.r) {
          pr.life = 0; pr.onExpire = null;
          burst(pr.x, pr.y, { count: 3, color: SCALE_LT, speed: 120, size: 2.5, life: 0.2, drag: 5, shape: 'spark' });
          break;
        }
      }
    }

    // Venom pools: a small bite every half second you stand in one.
    for (const pool of e.pools) {
      pool.t -= dt;
      pool.tick -= dt;
      if (pool.tick <= 0 && dist(p.x, p.y, pool.x, pool.y) < pool.r + p.r * 0.5) {
        pool.tick = 0.5;
        damagePlayer(Math.max(2, Math.round(e.damage * 0.22)), null, null, 'venom');
      }
    }
    e.pools = e.pools.filter((q) => q.t > 0);

    // The player's running velocity, for leading strikes and spit.
    if (e.ppx !== undefined && dt > 0) {
      const vx = (p.x - e.ppx) / dt, vy = (p.y - e.ppy) / dt;
      if (Math.hypot(vx, vy) < 420) { const k = 1 - Math.exp(-8 * dt); e.pvx = lerp(e.pvx || 0, vx, k); e.pvy = lerp(e.pvy || 0, vy, k); }
    }
    e.ppx = p.x; e.ppy = p.y;

    const d = dist(e.x, e.y, p.x, p.y);
    e.hug = d < 120 && !e.S[0].headUnder ? e.hug + dt : Math.max(0, e.hug - dt * 2);
    e.far = d > 430 ? e.far + dt : Math.max(0, e.far - dt * 2);

    // During the squeeze, any damage she takes is you struggling free.
    if (e.action === 'coil' || e.action === 'greatcoil') {
      const lost = Math.max(0, (e.hpPrev ?? e.hp) - e.hp);
      e.struggle += lost;
    }
    e.hpPrev = e.hp;

    if (e.B && e.action !== 'phase') tickHeadB(e, dt, p);
  },

  idle(e, dt, p) {
    // Circle the prey at a distance, curving like a snake.
    e.orbit = (e.orbit ?? rand(0, TAU)) + dt * 0.55 * e.sign;
    const r = p2(e) ? 250 : 280;
    const tx = p.x + Math.cos(e.orbit) * r, ty = p.y + Math.sin(e.orbit) * r;
    slither(e.S[0], tx, ty, e.speed * (p2(e) ? 1.15 : 1), 2.8, dt);
    if (Math.random() < dt * 0.25) e.sign *= -1;
  },

  choose(e, p, d) {
    const S = e.S[0];
    const tail = S.pos[S.pos.length - 1];
    const tailNear = tail && !tail.under && dist(tail.x, tail.y, p.x, p.y) < 280;
    const pool = [['fang', 2.2], ['venom', 2], ['sidewinder', 1.4], ['burrow', 1.4]];
    if (d < 430) pool.push(['strike', 3], ['double', 1.6]);
    if (tailNear) pool.push(['tail', 3]);
    if (e.hug > 0.8) pool.push(['hood', 10]);
    if (e.far > 1.5) pool.push(['burrow', 5], ['sidewinder', 3], ['venom', 2]);
    if (!p2(e)) pool.push(['coil', 2.6], ['gaze', 3.6]);
    else pool.push(['twin', 3], ['crossfire', 2.6], ['rain', 2], ['shed', 2], ['greatcoil', 2.6], ['ouroboros', 4.2]);
    return pool;
  },

  // --- phase 2: HYDRA ---------------------------------------------------------------
  onPhase(e) {
    for (const S of e.S) surfaceAll(S);
    e.invuln = true;              // surfacing must not cancel the phase change's invulnerability
    e.pools = [];
    e.paths = [];
    e.coilC = null;
    if (e.skin) shedCrumble(e);
    e.phaseMarks = {};
    sfx.hiss();
  },
  phaseAnim(e, dt, p, k) {
    const once = (key, at, fn) => { if (k >= at && !e.phaseMarks[key]) { e.phaseMarks[key] = true; fn(); } };
    e.face += Math.sin(world.runTime * 18) * dt * 4;          // thrashing
    e.hood = 1;
    if (Math.random() < dt * 20) {
      const q = e.S[0].pos[(Math.random() * e.S[0].pos.length) | 0];
      if (q) burst(q.x, q.y, { count: 3, color: SCALE_LT, speed: 200, size: 4, life: 0.4, drag: 3, shape: 'shard' });
    }
    once('split', 0.3, () => splitHydra(e));
    if (e.S[1]) e.S[1].scale = clamp((k - 0.3) / 0.4, 0.05, 1);
    e.venom = clamp((k - 0.3) / 0.6, 0, 1);
    once('roar', 0.72, () => { sfx.roar(0.55); sfx.hiss(); shake(0.6); flash(0.25, VENOM); });
    once('line', 0.85, () => say(e, 'Two mouthsss…', VENOM));
  },
  afterPhase(e) {
    Object.assign(e.cool, { ouroboros: 7, greatcoil: 12, twin: 2, crossfire: 3, shed: 8, rain: 5 });
    lightScales(e);
  },

  moves: {
    // 1. Strike: she draws her head back into an S (the lane shows on the
    //    floor), then lunges. The head is briefly open after.
    strike: {
      cooldown: 1.6,
      start(e, p) {
        e.aim = leadAt(e, p, e.x, e.y, 1100, 0.5);
        e.face = e.aim;
        e.strikes = 1;
        lane(e, tell(e, 0.52), STRIKE_LANE_LEN, STRIKE_LANE_W, VENOM);
        sfx.hiss();
        sub(e, 'coil', tell(e, 0.52));
      },
      update(e, dt, p) { strikeUpdate(e, dt, p, 'strike'); },
    },

    // 2. Double Strike: the same, twice — the second lane appears as the
    //    first strike ends.
    double: {
      cooldown: 4.5,
      start(e, p) {
        e.aim = leadAt(e, p, e.x, e.y, 1100, 0.5);
        e.face = e.aim;
        e.strikes = 2;
        lane(e, tell(e, 0.5), STRIKE_LANE_LEN, STRIKE_LANE_W, VENOM);
        sfx.hiss();
        sub(e, 'coil', tell(e, 0.5));
      },
      update(e, dt, p) { strikeUpdate(e, dt, p, 'double'); },
    },

    // 3. Fang Volley: her jaw opens (a green glow) and three fans of fangs fly.
    fang: {
      cooldown: 3,
      start(e) {
        e.volleys = p2(e) ? 4 : 3;
        e.jaw = 1;
        sub(e, 'wind', tell(e, 0.45));
      },
      update(e, dt, p) {
        e.face = angleTo(e.x, e.y, p.x, p.y);
        e.jaw = 1;
        if (e.t > 0) return;
        const n = 5;
        fangs(e, e.S[0], n, 0.62, e.face + (e.volleys % 2 ? 0.07 : -0.07), 300);
        sfx.shoot();
        e.volleys--;
        if (e.volleys > 0) e.t = 0.2; else idle(e, 0.45);
      },
    },

    // 4. Venom Spit: arcing globs that leave pools of venom where they land.
    venom: {
      cooldown: 4.5,
      start(e) {
        e.jaw = 1;
        sfx.hiss();
        sub(e, 'wind', tell(e, 0.5));
      },
      update(e, dt, p) {
        e.face = angleTo(e.x, e.y, p.x, p.y);
        e.jaw = 1;
        if (e.t > 0) return;
        const lx = p.x + (e.pvx || 0) * 0.6, ly = p.y + (e.pvy || 0) * 0.6;
        venomLob(e, e.S[0], lx, ly);
        for (let k = 0; k < (p2(e) ? 3 : 2); k++) {
          const a = rand(0, TAU);
          venomLob(e, e.S[0], lx + Math.cos(a) * 110, ly + Math.sin(a) * 110);
        }
        sfx.splash();
        idle(e, 0.4);
      },
    },

    // 5. Tail Lash: the rattle sounds, the tail rears — a wide swipe from
    //    wherever her tail lies (the arc shows first).
    tail: {
      cooldown: 5,
      start(e, p) {
        const S = e.S[0];
        const t = S.pos[S.pos.length - 2] || S.pos[S.pos.length - 1];
        e.tailAt = { x: t.x, y: t.y, a: angleTo(t.x, t.y, p.x, p.y) };
        spawnHazard({ kind: 'cone', x: t.x, y: t.y, angle: e.tailAt.a, arc: 1.9, r: 250, delay: tell(e, 0.62), color: '#ff5e6e', owner: e });
        sfx.rattle();
        sub(e, 'rattle', tell(e, 0.62));
      },
      update(e, dt, p) {
        if (e.t > 0) return;
        const T = e.tailAt;
        const d = dist(T.x, T.y, p.x, p.y);
        if (d < 250 + p.r * 0.5 && Math.abs(angleDiff(T.a, angleTo(T.x, T.y, p.x, p.y))) < 0.95) {
          if (damagePlayer(Math.round(e.damage * 0.8), T.x, T.y, e.type)) {
            p.vx = (p.vx || 0) + Math.cos(T.a) * 260; p.vy = (p.vy || 0) + Math.sin(T.a) * 260;
          }
        }
        for (let k = 0; k < 14; k++) {
          const a = T.a - 0.95 + (k / 13) * 1.9;
          burst(T.x + Math.cos(a) * 200, T.y + Math.sin(a) * 200, { count: 1, color: SCALE_LT, speed: 120, size: 4, life: 0.3, dir: a + PI / 2, spread: 0.2, drag: 3 });
        }
        shake(0.25);
        sfx.swing(1.3);
        idle(e, 0.35);
      },
    },

    // 6. Burrow: she dives; cracks in the floor show her path under you; a
    //    marked circle, and she erupts. (Phase 2: faster.)
    burrow: {
      cooldown: 7,
      start(e) {
        e.jaw = 0;
        sub(e, 'dip', 0.35);
      },
      update(e, dt, p) { burrowUpdate(e, dt, p); },
    },

    // 7. Hood Flare: stay on her head and the hood spreads — a spray of venom
    //    in a cone (phase 2: plus a hiss-shockwave with gaps either side).
    hood: {
      cooldown: 3,
      start(e, p) {
        e.face = angleTo(e.x, e.y, p.x, p.y);
        e.hood = 1;
        sfx.hiss();
        spawnHazard({ kind: 'cone', x: e.x, y: e.y, angle: e.face, arc: 1.15, r: 230, delay: tell(e, 0.58), color: VENOM, owner: e });
        sub(e, 'flare', tell(e, 0.58));
      },
      update(e, dt, p) {
        e.hood = 1;
        if (e.t > 0) return;
        // Phase 2 adds the hiss-shockwave (gaps either side, or dash through it).
        if (p2(e)) shockwave(e, { color: SCALE_LT, speed: 300, dmg: 0.4 });
        if (dist(e.x, e.y, p.x, p.y) < 230 + p.r * 0.5 && Math.abs(angleDiff(e.face, angleTo(e.x, e.y, p.x, p.y))) < 0.6) {
          damagePlayer(Math.round(e.damage * 0.6), e.x, e.y, e.type);
        }
        burst(e.x, e.y, { count: 22, color: VENOM, speed: 380, size: 4, life: 0.4, dir: e.face, spread: 0.6, drag: 3 });
        idle(e, 0.4);
      },
    },

    // 8. Sidewinder: an S-shaped path across the temple is drawn, and she
    //    races along it — her body sweeping behind like a moving wall — and
    //    ends with a strike.
    sidewinder: {
      cooldown: 8,
      start(e, p) {
        const b = arenaBounds();
        const a = angleTo(e.x, e.y, p.x, p.y);
        const [tx, ty] = inArena(p.x + Math.cos(a) * 260, p.y + Math.sin(a) * 260, 60);
        const pts = [];
        const L = dist(e.x, e.y, tx, ty) || 1;
        const nx = -(ty - e.y) / L, ny = (tx - e.x) / L;
        for (let k = 0; k <= 24; k++) {
          const f = k / 24;
          const off = Math.sin(f * PI * 3) * 80;
          pts.push({ x: clamp(lerp(e.x, tx, f) + nx * off, b.l + 30, b.r - 30), y: clamp(lerp(e.y, ty, f) + ny * off, b.t + 30, b.b - 30) });
        }
        e.sw = { pts, d: 0 };
        e.paths = [pts];
        sfx.hiss();
        sub(e, 'plan', tell(e, 0.65));
      },
      update(e, dt, p) {
        if (e.sub === 'plan') { if (e.t <= 0) sub(e, 'race', 3); return; }
        const pts = e.sw.pts;
        e.sw.d += (p2(e) ? 620 : 560) * dt;
        let d = e.sw.d, i = 0;
        while (i < pts.length - 1) {
          const L = dist(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
          if (d <= L) { const k = d / (L || 1); e.face = angleTo(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y); e.x = lerp(pts[i].x, pts[i + 1].x, k); e.y = lerp(pts[i].y, pts[i + 1].y, k); break; }
          d -= L; i++;
        }
        e.jaw = 1;
        bite(e, e.S[0], 0.7);
        if (i >= pts.length - 1) { e.paths = []; startMove(e, p, 'strike'); }
      },
    },

    // 9. THE COIL (signature): she races a full circle around you, laying her
    //    body as a ring. Run (or dash) out through the gap before it closes.
    //    Trapped: the ring squeezes — crack her glowing scales (or hit her
    //    head) to make her let go before it crushes you.
    coil: {
      cooldown: 18,
      start(e, p) { coilStart(e, p, [e.S[0]]); },
      update(e, dt, p) { coilUpdate(e, dt, p); },
    },

    // 10. Hypnotic Sway (phase-1 barrage): she rears in the middle of the
    //     temple and sways; the floor swirls, and spiralling scales pour
    //     out in waves. Her own coils block some of them — use them. Then she
    //     slumps, dizzy.
    gaze: {
      cooldown: 30,
      start(e) {
        const b = arenaBounds();
        e.gazeC = { x: (b.l + b.r) / 2, y: (b.t + b.b) / 2 };
        say(e, 'Look into my eyesss…');
        sfx.hiss();
        sub(e, 'rise', 1.2);
      },
      update(e, dt) {
        if (e.sub === 'rise') {
          slither(e.S[0], e.gazeC.x, e.gazeC.y, 360, 5, dt);
          if (dist(e.x, e.y, e.gazeC.x, e.gazeC.y) < 30 || e.t <= 0) { e.gzA = rand(0, TAU); e.gzT = 0; e.gzV = 0; e.gzR = 0; sub(e, 'sway', 4.4); }
          return;
        }
        e.gzT += dt;
        e.hood = 1;
        e.face = e.gzA + Math.sin(e.gzT * 2.2) * 0.8;
        if ((e.gzV -= dt) <= 0) {
          e.gzV = 0.17;
          const a = e.gzA + e.gzT * 1.6;
          const bend = (Math.floor(e.gzT / 0.17) % 2 ? 1 : -1) * 0.5;
          for (const off of [0, PI]) {
            shot(e, a + off, 180, { shape: 'orb', r: 7, color: off ? GOLDEN : SCALE_LT, dmg: 0.4, life: 6, extra: { turn: bend } });
          }
        }
        if ((e.gzR -= dt) <= 0) {
          e.gzR = 1.15;
          const pl = world.player;
          const gapA = pl ? angleTo(e.x, e.y, pl.x, pl.y) + rand(-0.6, 0.6) : 0;
          for (let k = 0; k < 16; k++) {
            const a = (k / 16) * TAU + e.gzT;
            if (Math.abs(angleDiff(gapA, a)) < 0.45) continue;
            shot(e, a, 150, { shape: 'orb', r: 7, color: '#e8f0d0', dmg: 0.4, life: 6 });
          }
        }
        if (e.t <= 0) { say(e, 'Hhhh…'); expose(e, 2.1); }
      },
    },

    // --- phase 2 -------------------------------------------------------------------

    // 11. Twin Strike: one head strikes, and the other strikes from another
    //     angle a beat later. Two lanes, one after the other.
    twin: {
      cooldown: 5,
      start(e, p) {
        e.aim = leadAt(e, p, e.x, e.y, 1100, 0.5);
        e.face = e.aim;
        e.strikes = 1;
        lane(e, tell(e, 0.5), STRIKE_LANE_LEN, STRIKE_LANE_W, VENOM);
        sfx.hiss();
        if (e.B) orderB(e, 'strike', 0.4);
        sub(e, 'coil', tell(e, 0.5));
      },
      update(e, dt, p) { strikeUpdate(e, dt, p, 'twin'); },
    },

    // 12. Crossfire: both heads open their jaws and trade fang volleys, so
    //     the lanes cross.
    crossfire: {
      cooldown: 6,
      start(e) {
        e.volleys = 4;
        e.jaw = 1;
        if (e.B) orderB(e, 'fang', 0.28, 4);
        sub(e, 'wind', tell(e, 0.45));
      },
      update(e, dt, p) {
        e.face = angleTo(e.x, e.y, p.x, p.y);
        e.jaw = 1;
        if (e.t > 0) return;
        fangs(e, e.S[0], 5, 0.62, leadAt(e, p, e.x, e.y, 300, 0.4), 300);
        sfx.shoot();
        e.volleys--;
        if (e.volleys > 0) e.t = 0.56; else idle(e, 0.4);
      },
    },

    // 13. Venom Rain: both heads spit — six pools around you.
    rain: {
      cooldown: 7,
      start(e) {
        e.jaw = 1;
        sfx.hiss();
        if (e.B) orderB(e, 'spit', 0.2);
        sub(e, 'wind', tell(e, 0.5));
      },
      update(e, dt, p) {
        e.jaw = 1;
        if (e.t > 0) return;
        venomLob(e, e.S[0], p.x + (e.pvx || 0) * 0.5, p.y + (e.pvy || 0) * 0.5);
        for (let k = 0; k < 2; k++) { const a = rand(0, TAU); venomLob(e, e.S[0], p.x + Math.cos(a) * 130, p.y + Math.sin(a) * 130); }
        idle(e, 0.4);
      },
    },

    // 14. Shed Skin: she slips out of her skin — the hollow skin stays where
    //     it lay, a pale wall for six seconds — and she comes up under you.
    shed: {
      cooldown: 12,
      start(e) {
        const S = e.S[0];
        e.skin = { pts: S.pos.filter((q) => !q.under).map((q) => ({ x: q.x, y: q.y, r: q.r })), head: { x: e.x, y: e.y, face: e.face }, t: 6 };
        say(e, 'Catch me.');
        sfx.hiss();
        burst(e.x, e.y, { count: 20, color: '#e8e0c0', speed: 200, size: 4, life: 0.6, drag: 3 });
        if (e.B) orderB(e, 'fang', 0.8, 3);
        dive(S);
        e.bur = { tx: e.x, ty: e.y };
        sub(e, 'tunnel', 1.5);
      },
      update(e, dt, p) { burrowUpdate(e, dt, p); },
    },

    // 15. Great Coil: both heads race around you, each laying half a ring.
    greatcoil: {
      cooldown: 20,
      start(e, p) { coilStart(e, p, e.B ? [e.S[0], e.S[1]] : [e.S[0]]); },
      update(e, dt, p) { coilUpdate(e, dt, p); },
    },

    // 16. OUROBOROS (phase-2 barrage): the two halves chase each other round
    //     the temple, a living ring, spitting fangs inward as they go. Keep
    //     moving between the fans. Then both collapse, spent.
    ouroboros: {
      cooldown: 30,
      start(e) {
        const b = arenaBounds();
        e.ouro = { x: (b.l + b.r) / 2, y: (b.t + b.b) / 2, R: Math.min(arena.h / 2 - 40, 215), a: rand(0, TAU), t: 0, fire: 0.8 };
        say(e, 'The world-sssnake…', VENOM);
        sfx.roar(0.6);
        if (e.B) orderB(e, 'ouro', 0);
        sub(e, 'gather', 1.0);
      },
      update(e, dt, p) {
        const O = e.ouro;
        const target = (off) => ({ x: O.x + Math.cos(O.a + off) * O.R, y: O.y + Math.sin(O.a + off) * O.R });
        if (e.sub === 'gather') {
          const tA = target(0);
          slither(e.S[0], tA.x, tA.y, 520, 6, dt);
          if (e.t <= 0) sub(e, 'circle', 5.0);
          return;
        }
        O.t += dt;
        O.a += 1.2 * dt;
        const tA = target(0);
        e.face = angleTo(e.x, e.y, tA.x, tA.y);
        e.x = lerp(e.x, tA.x, 1 - Math.exp(-10 * dt)); e.y = lerp(e.y, tA.y, 1 - Math.exp(-10 * dt));
        if ((O.fire -= dt) <= 0) {
          O.fire = 0.6;
          const heads = [e.S[0]];
          if (e.B && e.S[1]) heads.push(e.S[1]);
          for (const S of heads) {
            const aim = angleTo(S.head.x, S.head.y, O.x, O.y) + (O.t % 1.2 < 0.6 ? 0.18 : -0.18);
            fangs(e, S, 5, 0.75, aim, 230, { color: GOLDEN });
          }
          sfx.shoot();
        }
        if (e.t <= 0) {
          if (e.B) orderB(e, 'rest', 0);
          say(e, 'Hhhh…');
          expose(e, 2.2);
        }
      },
    },
  },

  // --- drawing ------------------------------------------------------------------------

  /** Everything is drawn in drawExtras (the body must go under the heads). */
  draw() {},

  drawExtras(e, ctx, t) {
    // The shed skin: pale, hollow, translucent.
    if (e.skin) {
      const k = clamp(e.skin.t / 1, 0, 1);
      ctx.globalAlpha = 0.45 * k;
      for (const q of e.skin.pts) {
        ctx.fillStyle = '#e8e0c0';
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#8a8060';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      drawHead(ctx, e.skin.head.x, e.skin.head.y, e.skin.head.face, e.r, { skin: true, alpha: 0.45 * k }, t);
      ctx.globalAlpha = 1;
    }

    // Telegraphs: the sidewinder path, the coil circle.
    for (const pts of e.paths) {
      ctx.globalAlpha = 0.55 + Math.sin(t * 12) * 0.15;
      ctx.strokeStyle = VENOM;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 1;
    if (e.coilC) {
      const C = e.coilC;
      ctx.globalAlpha = 0.5 + Math.sin(t * 10) * 0.2;
      ctx.strokeStyle = C.squeeze ? '#ff5e6e' : GOLDEN;
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.arc(C.x, C.y, C.R, 0, TAU); ctx.stroke();
      ctx.setLineDash([]);
      if (C.squeeze) {
        const need = e.maxHp * 0.07;
        const k = clamp(e.struggle / need, 0, 1);
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(C.x - 50, C.y - C.R - 30, 100, 7);
        ctx.fillStyle = GOLDEN;
        ctx.fillRect(C.x - 50, C.y - C.R - 30, 100 * k, 7);
        ctx.fillStyle = '#ffffff';
        ctx.font = '800 11px "Segoe UI", Roboto, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('BREAK FREE — HIT HER!', C.x, C.y - C.R - 40);
      }
      ctx.globalAlpha = 1;
    }

    // The bodies, tail first, then the heads on top.
    for (const S of e.S) drawBody(ctx, S, t, e.raised);
    for (const S of e.S) {
      if (S.headUnder) continue;
      const h = S.head;
      const isA = h === e;
      drawHead(ctx, h.x, h.y, h.face || 0, e.r * (isA ? 1 : 0.9) * S.scale, {
        hood: e.hood > 0.1 || p2(e), jaw: isA ? e.jaw : (e.Bst && e.Bst.jaw) || 0,
        flash: e.flash > 0, venom: e.venom,
      }, t);
    }

    // The punish window: a gold ring on the head.
    if (e.exposed > 0 && !e.S[0].headUnder) {
      ctx.globalAlpha = 0.5 + Math.sin(t * 10) * 0.25;
      ctx.strokeStyle = '#ffe27a';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 12, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (e.action === 'phase') {
      const k = clamp(1 - e.t / (e.phaseT || 1), 0, 1);
      const b = arenaBounds();
      ctx.globalAlpha = Math.sin(k * PI);
      ctx.fillStyle = VENOM;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 54px "Segoe UI", Roboto, system-ui, sans-serif';
      ctx.fillText('HYDRA', (b.l + b.r) / 2, b.t + arena.h * 0.28);
      ctx.globalAlpha = 1;
    }
  },

  /** Under everything: the temple floor, its carved ring, braziers, pools, burrow cracks. */
  drawArena(ctx, room, t) {
    const e = world.enemies.find((q) => q.type === 'naga' && !q.dead);
    const venom = e ? e.venom : 0;
    const gaze = e ? e.gaze : 0;
    const b = arenaBounds();
    const cx = (b.l + b.r) / 2, cy = (b.t + b.b) / 2;

    // Sandstone wash and the great carved ring.
    ctx.fillStyle = 'rgba(200,170,110,0.06)';
    ctx.fillRect(b.l, b.t, b.r - b.l, b.b - b.t);
    ctx.strokeStyle = 'rgba(210,180,110,0.22)';
    ctx.lineWidth = 3;
    for (const R of [arena.h * 0.42, arena.h * 0.38]) { ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.stroke(); }
    // A serpent mosaic spiralling into the centre.
    ctx.fillStyle = `rgba(80,190,140,${0.18 + venom * 0.1})`;
    for (let k = 0; k < 60; k++) {
      const a = k * 0.42, r = 8 + k * 2.6;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(0, -2.5); ctx.lineTo(-4, 0); ctx.lineTo(0, 2.5); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // Four braziers, flickering (they burn green once she's a hydra).
    for (const [fx, fy] of [[0.06, 0.1], [0.94, 0.1], [0.06, 0.9], [0.94, 0.9]]) {
      const x = b.l + arena.w * fx, y = b.t + arena.h * fy;
      const g = ctx.createRadialGradient(x, y, 2, x, y, 70);
      const warm = venom > 0.5 ? '120,255,120' : '255,170,80';
      g.addColorStop(0, `rgba(${warm},0.25)`);
      g.addColorStop(1, `rgba(${warm},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, 70, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3a2c1a';
      ctx.beginPath(); ctx.arc(x, y, 11, 0, TAU); ctx.fill();
      ctx.fillStyle = venom > 0.5 ? VENOM : '#ffb35e';
      const fl = 6 + Math.sin(t * 13 + fx * 9) * 2;
      ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x, y - fl * 2); ctx.lineTo(x + 6, y); ctx.closePath(); ctx.fill();
    }

    if (venom > 0.01) {
      ctx.fillStyle = `rgba(60,140,40,${0.13 * venom})`;
      ctx.fillRect(b.l, b.t, b.r - b.l, b.b - b.t);
    }

    // The hypnotic sway: the floor itself turns.
    if (gaze > 0.02) {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(t * 0.9);
      ctx.strokeStyle = `rgba(160,255,200,${0.14 * gaze})`;
      ctx.lineWidth = 12;
      for (let k = 0; k < 6; k++) {
        ctx.beginPath();
        ctx.arc(0, 0, 60 + k * 70, k * 0.8, k * 0.8 + 2.2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Venom pools, bubbling.
    if (e) {
      for (const q of e.pools) {
        const k = clamp(q.t / 0.6, 0, 1);
        ctx.globalAlpha = 0.35 * k;
        ctx.fillStyle = VENOM;
        ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.7 * k;
        ctx.strokeStyle = '#d6ff9a';
        ctx.lineWidth = 2;
        ctx.stroke();
        for (let i = 0; i < 3; i++) {
          const a = t * 2 + i * 2.1 + q.x;
          ctx.beginPath(); ctx.arc(q.x + Math.cos(a) * q.r * 0.5, q.y + Math.sin(a * 1.3) * q.r * 0.4, 3 + Math.sin(t * 6 + i) * 1.5, 0, TAU); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      // Where she moves under the floor: a line of cracked earth.
      for (const S of e.S) {
        for (const u of S.under) {
          ctx.strokeStyle = 'rgba(40,24,10,0.6)';
          ctx.lineWidth = 6;
          ctx.beginPath();
          let started = false;
          for (const q of S.trail) {
            if (q.s < u.from || q.s > u.to) continue;
            if (!started) { ctx.moveTo(q.x, q.y); started = true; } else ctx.lineTo(q.x, q.y);
          }
          ctx.stroke();
        }
        if (S.headUnder && Math.random() < 0.5) {
          burst(S.head.x + rand(-10, 10), S.head.y + rand(-10, 10), { count: 1, color: '#8a6a44', speed: 70, size: 4, life: 0.4, drag: 3 });
        }
      }
    }
  },
};

// --- shared move logic -------------------------------------------------------------

function strikeUpdate(e, dt, p, name) {
  const S = e.S[0];
  if (e.sub === 'coil') {
    e.jaw = clamp(1 - e.t / 0.5, 0, 1);
    if (e.t <= 0) { e.lungeD = 0; sub(e, 'lunge', 0.5); sfx.swing(1.4); }
    return;
  }
  if (e.sub === 'lunge') {
    const step = 1100 * dt;
    e.x += Math.cos(e.aim) * step;
    e.y += Math.sin(e.aim) * step;
    e.lungeD += step;
    e.jaw = 1;
    const [cx, cy] = inArena(e.x, e.y, 30);
    const hitWall = cx !== e.x || cy !== e.y;
    e.x = cx; e.y = cy;
    bite(e, S, 0.75);
    if (e.lungeD >= STRIKE_LUNGE || hitWall || e.t <= 0) {
      e.exposed = 0.55;     // the head is open for a moment
      sub(e, 'recover', 0.45);
    }
    return;
  }
  if (e.sub === 'recover' && e.t <= 0) {
    e.strikes--;
    if (e.strikes > 0) {
      e.aim = leadAt(e, p, e.x, e.y, 1100, 0.5);
      e.face = e.aim;
      lane(e, 0.38, STRIKE_LANE_LEN, STRIKE_LANE_W, VENOM);
      sfx.hiss();
      sub(e, 'coil', 0.38);
    } else idle(e, 0.4);
  }
}

function burrowUpdate(e, dt, p) {
  const S = e.S[0];
  if (e.sub === 'dip') {
    if (e.t <= 0) { dive(S); e.bur = { tx: p.x, ty: p.y }; sub(e, 'tunnel', 1.5); }
    return;
  }
  if (e.sub === 'tunnel') {
    // She hunts you under the floor; the cracks show where she is.
    e.bur.tx = lerp(e.bur.tx, p.x, 1 - Math.exp(-2.5 * dt));
    e.bur.ty = lerp(e.bur.ty, p.y, 1 - Math.exp(-2.5 * dt));
    slither(S, e.bur.tx, e.bur.ty, p2(e) ? 600 : 520, 6, dt);
    if (dist(e.x, e.y, e.bur.tx, e.bur.ty) < 24 || e.t <= 0) {
      spawnHazard({ kind: 'blast', x: e.x, y: e.y, r: 92, delay: tell(e, 0.6), damage: Math.round(e.damage * 0.85), color: '#c9a36b', source: e.type, owner: e });
      sfx.telegraph();
      sub(e, 'mark', tell(e, 0.6));
    }
    return;
  }
  if (e.sub === 'mark') {
    if (e.t <= 0) {
      emerge(S);
      e.face = angleTo(e.x, e.y, p.x, p.y);
      e.hood = 1;
      e.exposed = 0.7;
      sub(e, 'rise', 0.7);
    }
    return;
  }
  if (e.sub === 'rise' && e.t <= 0) idle(e, 0.3);
}

function coilStart(e, p, serpents) {
  const R = 124;
  const [cx, cy] = inArena(p.x, p.y, R + 30);
  e.coilC = { x: cx, y: cy, R, heads: serpents, a0: angleTo(cx, cy, e.x, e.y), laid: 0, squeeze: false };
  e.struggle = 0;
  say(e, serpents.length > 1 ? 'Embrace usss.' : 'Ssstay…', GOLDEN);
  sfx.hiss();
  if (e.B && serpents.length > 1) orderB(e, 'coil', 0);
  sub(e, 'approach', 1.0);
}

function coilUpdate(e, dt, p) {
  const C = e.coilC;
  if (!C) { idle(e, 0.3); return; }
  const heads = C.heads;
  const arcEach = TAU / heads.length;
  const at = (S, k, R) => {
    const i = heads.indexOf(S);
    const a = C.a0 + i * arcEach + k;
    return { x: C.x + Math.cos(a) * R, y: C.y + Math.sin(a) * R, a };
  };
  if (e.sub === 'approach') {
    // Each head races to its starting point on the circle.
    let ready = true;
    for (const S of heads) {
      const q = at(S, 0, C.R);
      slither(S, q.x, q.y, 700, 8, dt);
      if (dist(S.head.x, S.head.y, q.x, q.y) > 30) ready = false;
    }
    if (ready || e.t <= 0) sub(e, 'lay', 1.35);
    return;
  }
  if (e.sub === 'lay') {
    // Round the circle: head-to-tail. The gap is where she hasn't been yet.
    C.laid = clamp(C.laid + (arcEach / 1.35) * dt, 0, arcEach);
    for (const S of heads) {
      const q = at(S, C.laid, C.R);
      S.head.face = q.a + PI / 2;
      S.head.x = q.x; S.head.y = q.y;
      bite(e, S, 0.6);
    }
    if (e.t <= 0) {
      if (dist(p.x, p.y, C.x, C.y) > C.R - 4) {
        // You got out: she's left stretched round nothing.
        say(e, 'Ssslippery…');
        e.coilC = null;
        if (e.B) orderB(e, 'rest', 0);
        expose(e, 1.5);
        return;
      }
      C.squeeze = true;
      say(e, 'Sssqueeze.', '#ff5e6e');
      sfx.hiss();
      lightScales(e, heads.flatMap((S) => S.ents));
      sub(e, 'squeeze', 3.2);
    }
    return;
  }
  if (e.sub === 'squeeze') {
    const k = 1 - e.t / 3.2;
    C.R = lerp(124, 62, clamp(k, 0, 1));
    C.laid += (arcEach / 3.2) * dt;
    for (const S of heads) {
      const q = at(S, C.laid, C.R);
      S.head.face = q.a + PI / 2;
      S.head.x = q.x; S.head.y = q.y;
    }
    if (Math.random() < dt * 8) shake(0.08);
    if (e.struggle >= e.maxHp * 0.07) {
      // Struck free: she recoils in pain.
      damageText(p.x, p.y - p.r - 18, 'BROKE FREE', { color: '#9fffcf', size: 16 });
      e.coilC = null;
      if (e.B) orderB(e, 'rest', 0);
      expose(e, 1.9);
      return;
    }
    if (e.t <= 0) {
      if (dist(p.x, p.y, C.x, C.y) < C.R + 20) {
        damagePlayer(Math.round(e.damage * 1.5), C.x, C.y, e.type);
        shake(0.6);
        damageText(p.x, p.y - p.r - 18, 'CRUSHED', { color: '#ff5e6e', size: 17 });
      }
      e.coilC = null;
      if (e.B) orderB(e, 'rest', 0);
      idle(e, 0.6);
    }
  }
}

// --- the second head (phase 2) --------------------------------------------------------

function splitHydra(e) {
  const S1 = e.S[0];
  const pos = S1.pos.map((q) => ({ ...q }));
  const cut = 18;
  const headPos = pos[cut];
  const B = spawnEnemyFn('nagahead', headPos.x, headPos.y, { instant: true, summoner: e, color: SCALE });
  B.proxyOf = e;
  B.proxyMult = 1;
  B.face = angleTo(pos[cut + 1].x, pos[cut + 1].y, headPos.x, headPos.y);
  // Segment 18 becomes the new head's neck stump: it's gone.
  e.segs[cut].dead = true;
  const bodyB = e.segs.slice(cut + 1);
  const ptsB = [];
  for (let j = pos.length - 1; j >= cut; j--) ptsB.push({ x: pos[j].x, y: pos[j].y });
  S1.ents = e.segs.slice(0, cut);
  const S2 = makeSerpent(B, bodyB, ptsB);
  S2.scale = 0.05;
  e.S.push(S2);
  e.B = B;
  e.Bst = { mode: 'idle', t: 0, cd: 2.2, jaw: 0 };
  for (const s of e.segs) s.weakable = !s.dead && s !== S1.ents[0] && s !== S1.ents[1] && s !== bodyB[0] && s !== bodyB[1];
  burst(headPos.x, headPos.y, { count: 40, color: VENOM, speed: 380, size: 5, life: 0.7, drag: 3 });
  ring(headPos.x, headPos.y, { r0: 10, r1: 160, color: VENOM, life: 0.5, width: 8 });
  sfx.roar(0.7);
  shake(0.7);
}

/** Tell the second head what to do: strike, fang, spit, coil, ouro, rest. */
function orderB(e, mode, delay, n = 1) {
  if (!e.Bst) return;
  e.Bst = { ...e.Bst, mode, t: delay, n, started: false };
}

function tickHeadB(e, dt, p) {
  const S = e.S[1];
  const B = e.B;
  if (!S || !B || B.dead) return;
  const st = e.Bst;
  st.jaw = Math.max(0, (st.jaw || 0) - dt * 3);
  st.t -= dt;
  switch (st.mode) {
    case 'idle': {
      // Keep across from the first head, and spit fangs now and then.
      const a = angleTo(e.x, e.y, p.x, p.y);
      const tx = p.x + Math.cos(a) * 260, ty = p.y + Math.sin(a) * 260;
      slither(S, tx, ty, e.speed * 1.1, 2.6, dt);
      st.cd -= dt;
      if (st.cd <= 0 && !S.headUnder) { st.cd = rand(2.8, 3.6); st.mode = 'fang'; st.t = 0.45; st.n = 1; st.started = false; }
      break;
    }
    case 'fang': {
      B.face = angleTo(B.x, B.y, p.x, p.y);
      st.jaw = 1;
      if (st.t > 0) break;
      fangs(e, S, 4, 0.5, leadAt(e, p, B.x, B.y, 290, 0.4), 290);
      sfx.shoot();
      st.n--;
      if (st.n > 0) st.t = 0.56; else { st.mode = 'idle'; st.cd = rand(2.4, 3.2); }
      break;
    }
    case 'spit': {
      st.jaw = 1;
      if (st.t > 0) break;
      for (let k = 0; k < 3; k++) { const a = rand(0, TAU); venomLob(e, S, p.x + Math.cos(a) * rand(60, 150), p.y + Math.sin(a) * rand(60, 150)); }
      st.mode = 'idle'; st.cd = 2.5;
      break;
    }
    case 'strike': {
      if (!st.started) {
        if (st.t > 0) { slither(S, p.x, p.y, e.speed, 2.6, dt); break; }
        st.started = true;
        st.aim = leadAt(e, p, B.x, B.y, 1100, 0.5);
        B.face = st.aim;
        st.phase = 'coil'; st.pt = 0.42; st.d = 0;
        spawnHazard({ kind: 'lane', x: B.x, y: B.y, angle: st.aim, len: STRIKE_LANE_LEN, width: STRIKE_LANE_W, delay: 0.42, color: VENOM, owner: e });
        sfx.hiss();
      }
      st.pt -= dt;
      if (st.phase === 'coil') { st.jaw = 1; if (st.pt <= 0) { st.phase = 'lunge'; st.pt = 0.5; } break; }
      if (st.phase === 'lunge') {
        const step = 1100 * dt;
        B.x += Math.cos(st.aim) * step; B.y += Math.sin(st.aim) * step; st.d += step;
        const [cx, cy] = inArena(B.x, B.y, 30);
        const wall = cx !== B.x || cy !== B.y;
        B.x = cx; B.y = cy;
        st.jaw = 1;
        bite(e, S, 0.75);
        if (st.d >= STRIKE_LUNGE || wall || st.pt <= 0) { st.mode = 'idle'; st.cd = 1.6; }
      }
      break;
    }
    case 'coil':
    case 'ouro':
      // Driven by the move (coilUpdate / ouroboros) — or, for ouro, chase
      // the far side of the ring here.
      if (st.mode === 'ouro' && e.ouro) {
        const O = e.ouro;
        const q = { x: O.x + Math.cos(O.a + PI) * O.R, y: O.y + Math.sin(O.a + PI) * O.R };
        if (e.sub === 'gather') slither(S, q.x, q.y, 520, 6, dt);
        else {
          B.face = angleTo(B.x, B.y, q.x, q.y);
          B.x = lerp(B.x, q.x, 1 - Math.exp(-10 * dt)); B.y = lerp(B.y, q.y, 1 - Math.exp(-10 * dt));
        }
      }
      break;
    case 'rest':
    default:
      st.mode = 'idle';
      st.cd = 1.5;
  }
}

function shedCrumble(e) {
  if (!e.skin) return;
  for (let i = 0; i < e.skin.pts.length; i += 3) {
    const q = e.skin.pts[i];
    burst(q.x, q.y, { count: 4, color: '#e8e0c0', speed: 120, size: 4, life: 0.5, drag: 3 });
  }
  e.skin = null;
}

// --- drawing helpers ----------------------------------------------------------------

function drawBody(ctx, S, t, raised = false) {
  const n = S.pos.length;
  // Connecting tube, tail to neck (dark rim, then the scales). While she
  // coils, the rim is gold: the body is raised and can't be dashed over.
  for (let pass = 0; pass < 2; pass++) {
    for (let j = n - 1; j > 0; j--) {
      const a = S.pos[j], b = S.pos[j - 1];
      if (a.under || b.under) continue;
      ctx.strokeStyle = pass ? SCALE : raised ? GOLDEN : SCALE_DK;
      ctx.lineWidth = a.r + b.r + (pass ? 0 : raised ? 7 : 4);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }
  ctx.lineCap = 'butt';
  // Scale pattern and the glowing weak scales.
  for (let j = 0; j < n; j++) {
    const q = S.pos[j];
    if (q.under) continue;
    const next = S.pos[Math.max(0, j - 1)];
    const a = angleTo(q.x, q.y, next.x, next.y);
    const ent = S.ents[j];
    if (ent && ent.weak) {
      const pulse = 0.6 + Math.sin(t * 8 + j) * 0.3;
      const g = ctx.createRadialGradient(q.x, q.y, 1, q.x, q.y, q.r + 10);
      g.addColorStop(0, `rgba(255,220,120,${0.9 * pulse})`);
      g.addColorStop(1, 'rgba(255,200,80,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.r + 10, 0, TAU); ctx.fill();
    }
    ctx.save();
    ctx.translate(q.x, q.y);
    ctx.rotate(a);
    ctx.fillStyle = ent && ent.weak ? '#fff2b0' : (ent && ent.flash > 0 ? '#ffffff' : (j % 2 ? GOLDEN : SCALE_LT));
    ctx.globalAlpha = ent && ent.weak ? 1 : 0.55;
    const w = q.r * 0.55;
    ctx.beginPath(); ctx.moveTo(w, 0); ctx.lineTo(0, -w * 0.6); ctx.lineTo(-w, 0); ctx.lineTo(0, w * 0.6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawHead(ctx, x, y, a, r, o, t) {
  if (r < 2) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  // The cobra hood, spread behind the head.
  if (o.hood && !o.skin) {
    ctx.fillStyle = SCALE_DK;
    ctx.beginPath(); ctx.ellipse(-r * 0.45, 0, r * 0.8, r * 1.35, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = SCALE;
    ctx.beginPath(); ctx.ellipse(-r * 0.45, 0, r * 0.68, r * 1.2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = GOLDEN;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(-r * 0.5, s * r * 0.62, r * 0.18, 0, TAU); ctx.fill(); }
  }
  // The head: a long rounded diamond.
  const body = o.skin ? '#e8e0c0' : o.flash ? '#ffffff' : SCALE;
  ctx.fillStyle = o.skin ? '#8a8060' : SCALE_DK;
  ctx.beginPath();
  ctx.moveTo(r * 1.45, 0); ctx.lineTo(r * 0.3, -r * 0.85); ctx.lineTo(-r * 0.85, -r * 0.62); ctx.lineTo(-r, 0); ctx.lineTo(-r * 0.85, r * 0.62); ctx.lineTo(r * 0.3, r * 0.85);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(r * 1.32, 0); ctx.lineTo(r * 0.28, -r * 0.74); ctx.lineTo(-r * 0.78, -r * 0.54); ctx.lineTo(-r * 0.88, 0); ctx.lineTo(-r * 0.78, r * 0.54); ctx.lineTo(r * 0.28, r * 0.74);
  ctx.closePath(); ctx.fill();
  if (!o.skin) {
    // A gold crest down the head.
    ctx.fillStyle = GOLDEN;
    ctx.beginPath(); ctx.moveTo(r * 0.9, 0); ctx.lineTo(r * 0.1, -r * 0.18); ctx.lineTo(-r * 0.6, 0); ctx.lineTo(r * 0.1, r * 0.18); ctx.closePath(); ctx.fill();
    // Open jaws: the fangs show.
    if (o.jaw > 0.2) {
      ctx.fillStyle = '#2a0a10';
      ctx.beginPath(); ctx.moveTo(r * 1.5, 0); ctx.lineTo(r * 0.7, -r * 0.4 * o.jaw); ctx.lineTo(r * 0.7, r * 0.4 * o.jaw); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff';
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(r * 1.1, s * r * 0.25 * o.jaw); ctx.lineTo(r * 1.25, s * r * 0.05); ctx.lineTo(r * 0.95, s * r * 0.2 * o.jaw); ctx.closePath(); ctx.fill(); }
    }
    // Amber eyes with slit pupils (green once she's a hydra).
    for (const s of [-1, 1]) {
      ctx.fillStyle = o.venom > 0.5 ? VENOM : EYE;
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.ellipse(r * 0.45, s * r * 0.42, r * 0.2, r * 0.14, 0, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#10100a';
      ctx.fillRect(r * 0.43, s * r * 0.42 - r * 0.12, r * 0.05, r * 0.24);
    }
    // A forked tongue, flicking.
    if (Math.sin(t * 5 + x * 0.01) > 0.6) {
      ctx.strokeStyle = '#ff3d5e';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(r * 1.4, 0); ctx.lineTo(r * 1.85, 0); ctx.lineTo(r * 2.05, -r * 0.14); ctx.moveTo(r * 1.85, 0); ctx.lineTo(r * 2.05, r * 0.14); ctx.stroke();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
