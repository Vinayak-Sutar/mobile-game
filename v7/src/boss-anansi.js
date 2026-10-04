// ============================================================================
// KWAKU ANANSI, KEEPER OF ALL STORIES — the spider trickster of Ashanti
// folklore, in his web high in the forest canopy.
// "Every story in the world is mine. Let me tell you one."
//
// THE WEB: sticky strands cross the canopy. Walk along one and it holds you
// back (and trembles, so he knows where you are).
//
// THE PRICE OF THE STORIES (signature): to win all the world's stories from
// Nyame the sky god, Anansi paid with four tricks — and he tells each one as
// a chapter of the fight (boss-anansi-tales.js): THE PYTHON measured on a
// stick, THE HORNETS tricked into a gourd (strike it to turn them on him),
// THE LEOPARD in a pit (lure its pounce over one), and THE GUM DOLL that
// catches whoever touches it (lure him onto it).
//
// Spider tricks: Silk Line (it can reel you in), Rappel Drop from the canopy,
// Egg Sacs (break them before they hatch), the Shed Skin, and the WEB OF THE
// SKY GOD barrage.
// Phase 2 — ALL STORIES ARE ANANSI'S: Many Legs, THE POT OF WISDOM (it breaks,
// and the wisdom that scatters heals you), and the finale where every story
// is told at once.
// ============================================================================

import { world, arenaBounds } from './state.js';
import { TAU, clamp, rand, dist, angleTo, lerp } from './util.js';
import { sub, idle, shot, lane, lob, inArena, turnToward, forward, spawnEnemyFn } from './boss-kit.js';
import { burst, ring, shake, damageText } from './fx.js';
import { sfx } from './audio.js';
import { spawnHazard } from './hazards.js';
import {
  PV, say, leadAt, center, blastAt, touchPoint, strikeLane, playerHits, startLeap, stepLeap, segmentNear,
} from './boss-anansi-kit.js';
import { TALE_MOVES, updateTales } from './boss-anansi-tales.js';
import { drawAnansi, drawAnansiArena, drawAnansiExtras, SILK, STORY } from './boss-anansi-art.js';

const PI = Math.PI;
const p2 = (e) => e.phase >= 2;

function webStrands() {
  const b = arenaBounds();
  const c = center();
  return [
    [b.l + 60, b.t + 50, b.r - 60, b.b - 40],
    [b.r - 60, b.t + 50, b.l + 60, b.b - 40],
    [b.l + 40, c.y, b.r - 40, c.y],
    [c.x, b.t + 40, c.x, b.b - 30],
    [b.l + 40, b.t + (b.b - b.t) * 0.25, b.r - 40, b.t + (b.b - b.t) * 0.7],
    [b.l + 40, b.t + (b.b - b.t) * 0.7, b.r - 40, b.t + (b.b - b.t) * 0.25],
  ].map(([x0, y0, x1, y1]) => ({ x0, y0, x1, y1, tremble: 0 }));
}

function silkDarts(e, x, y, n, speed = 220) {
  const off = rand(0, TAU);
  for (let k = 0; k < n; k++) shot(e, off + (k / n) * TAU, speed, { x, y, off: 16, shape: 'shard', r: 6, color: SILK, dmg: 0.38, life: 3.5 });
}

export const ANANSI = {
  phases: [0.5],
  phaseTime: 2.6,
  roarPitch: 1.2,
  opening: { skyweb: 18, eggs: 6, molt: 8, legs: 99, wisdom: 99, allstories: 99 },

  /** The canopy web: open, but for the sticky strands. */
  arena() { return []; },

  init(e) {
    e.strands = webStrands();
    e.eggs = [];
    e.legPhase = 0;
    e.up = 0;
    e.alpha = 1;
    e.stuck = 0;
    e.dartT = 1.4;
    e.face = PI / 2;
    sfx.talkingDrum(true);
    say(e, 'Let me tell you a story…', STORY);
  },

  tick(e, dt, p) {
    e.touchCd = Math.max(0, (e.touchCd || 0) - dt);
    e.contactCd = Math.max(0, (e.contactCd || 0) - dt);
    e.stuck = Math.max(0, e.stuck - dt);
    if (e.exposed > 0 && e.action !== 'exposed') e.exposed = Math.max(0, e.exposed - dt);
    if (e.ppx !== undefined && dt > 0) {
      const vx = (p.x - e.ppx) / dt, vy = (p.y - e.ppy) / dt;
      if (Math.hypot(vx, vy) < 420) { const k = 1 - Math.exp(-8 * dt); PV.x = lerp(PV.x, vx, k); PV.y = lerp(PV.y, vy, k); }
    }
    e.ppx = p.x; e.ppy = p.y;
    e.hug = dist(e.x, e.y, p.x, p.y) < e.r + 110 ? (e.hug || 0) + dt : Math.max(0, (e.hug || 0) - dt * 2);

    // The web holds you back where you walk on a strand, and it trembles.
    for (const s of e.strands) {
      s.tremble = Math.max(0, s.tremble - dt * 2);
      if (segmentNear(s.x0, s.y0, s.x1, s.y1, p.x, p.y, 14)) {
        s.tremble = 1;
        if ((p.slowUntil || 0) < world.runTime + 0.1 || (p.slowMult ?? 1) >= 0.72) { p.slowUntil = world.runTime + 0.1; p.slowMult = 0.72; }
      }
    }
    // A silk line reels you in.
    if (e.tetherT > 0) {
      e.tetherT -= dt;
      e.tether = true;
      const d = dist(e.x, e.y, p.x, p.y);
      if (d > e.r + 40) { p.x += (e.x - p.x) / d * 170 * dt; p.y += (e.y - p.y) / d * 170 * dt; }
      if (e.tetherT <= 0) e.tether = false;
    }
    // Egg sacs hatch unless broken first.
    for (const g of e.eggs) {
      g.t -= dt;
      g.k = clamp(1 - g.t / 3.2, 0, 1);
      if (playerHits(g.x, g.y, 18)) {
        burst(g.x, g.y, { count: 16, color: SILK, speed: 160, size: 3, life: 0.4, drag: 4 });
        damageText(g.x, g.y - 30, 'SQUASHED', { color: SILK, size: 13 });
        g.t = -99;
        continue;
      }
      if (g.t <= 0) {
        for (let k = 0; k < 3; k++) {
          const a = rand(0, TAU);
          const [x, y] = inArena(g.x + Math.cos(a) * 30, g.y + Math.sin(a) * 30, 30);
          spawnEnemyFn('wretch', x, y, { summoner: e, color: '#3a2a1a', scale: (e.scale || 1) * 0.45 });
        }
        sfx.skitter();
      }
    }
    e.eggs = e.eggs.filter((g) => g.t > 0);
    // The shed skin: strike it and it bursts into silk.
    if (e.husk) {
      e.husk.t -= dt;
      if (playerHits(e.husk.x, e.husk.y, e.r)) {
        silkDarts(e, e.husk.x, e.husk.y, 8, 200);
        burst(e.husk.x, e.husk.y, { count: 20, color: SILK, speed: 200, size: 3, life: 0.5, drag: 3 });
        e.husk = null;
      } else if (e.husk.t <= 0) e.husk = null;
    }
    updateTales(e, dt, p);
    if (!(e.up > 0)) touchPoint(e, e.x, e.y, e.r + 6, 0.4);
  },

  idle(e, dt, p) {
    const d = dist(e.x, e.y, p.x, p.y);
    const a = angleTo(e.x, e.y, p.x, p.y);
    turnToward(e, a, 6 * dt);
    const sp = e.speed * (p2(e) ? 1.15 : 1);
    if (d > 320) forward(e, sp, dt, a);
    else if (d < 210) forward(e, -sp * 0.8, dt, a);
    forward(e, sp * 0.7, dt, a + (PI / 2) * e.sign);
    if (Math.random() < dt * 0.6) e.sign *= -1;
    [e.x, e.y] = inArena(e.x, e.y, e.r + 16);
    e.legPhase += dt * 16;
    if ((e.dartT -= dt) <= 0) {
      e.dartT = p2(e) ? 1.1 : 1.4;
      const la = leadAt(e.x, e.y, p, 260, 0.7);
      for (const k of [-0.13, 0.13]) shot(e, la + k, 260, { shape: 'shard', r: 6, color: SILK, dmg: 0.36, life: 4 });
      if (Math.random() < 0.3) sfx.skitter();
    }
  },

  choose(e) {
    const brood = world.enemies.filter((q) => q.summoner === e && !q.dead && q.type === 'wretch').length;
    const pool = [
      ['silk', 2.4], ['drop', 2], ['eggs', brood >= 3 || e.eggs.length ? 0 : 1.4], ['molt', 1.6],
      ['python', 2.2], ['hornets', 2], ['leopard', 2], ['gumdoll', 2],
    ];
    if (!p2(e)) pool.push(['skyweb', 3]);
    else pool.push(['legs', e.hug > 0.5 ? 8 : 1.5], ['wisdom', 2.2], ['allstories', 3.5]);
    return pool;
  },

  // --- phase 2: ALL STORIES ARE ANANSI'S ------------------------------------------------
  onPhase(e) {
    e.marks = {};
    e.python = null; e.python2 = null; e.leopard = null; e.gourd = null; e.pot = null;
    e.tetherT = 0; e.tether = false; e.up = 0; e.alpha = 1;
    say(e, 'Now every story is mine!', STORY);
  },
  phaseAnim(e, dt, p, k) {
    const once = (key, at, fn) => { if (k >= at && !e.marks[key]) { e.marks[key] = true; fn(); } };
    e.legPhase += dt * 40;
    for (const s of e.strands) s.tremble = 1;
    once('drum1', 0.2, () => sfx.talkingDrum(true));
    once('drum2', 0.45, () => sfx.talkingDrum(false));
    once('gold', 0.6, () => {
      ring(e.x, e.y, { r0: 10, r1: 360, color: STORY, life: 0.7, width: 10 });
      burst(e.x, e.y, { count: 40, color: STORY, speed: 320, size: 4, life: 0.8, drag: 2 });
      shake(0.7);
    });
  },
  afterPhase(e) {
    Object.assign(e.cool, { wisdom: 3, legs: 2, allstories: 10 });
  },

  moves: {
    // Silk Line: three lines of silk shoot out (shown first). Caught by one,
    // you're reeled in — and if you're still close when the line goes slack,
    // he bites.
    silk: {
      cooldown: 4,
      start(e, p) {
        e.aim = leadAt(e.x, e.y, p, 900, 0.3);
        e.face = e.aim;
        const w = p2(e) ? 0.42 : 0.5;
        for (const off of [-0.3, 0, 0.3]) {
          spawnHazard({ kind: 'lane', x: e.x, y: e.y, angle: e.aim + off, len: 520, width: 28, delay: w, color: SILK, owner: e });
        }
        sfx.telegraph();
        sub(e, 'wind', w);
      },
      update(e, dt, p) {
        if (e.sub === 'wind') {
          if (e.t > 0) return;
          let caught = false;
          for (const off of [-0.3, 0, 0.3]) if (strikeLane(e, e.x, e.y, e.aim + off, 520, 14, 0.55, 0)) caught = true;
          sfx.silk();
          if (caught) { e.tetherT = 1.2; damageText(p.x, p.y - p.r - 22, 'CAUGHT IN SILK', { color: SILK, size: 14 }); sub(e, 'reel', 1.25); }
          else idle(e, 0.3);
          return;
        }
        if (e.t <= 0) {
          if (dist(e.x, e.y, p.x, p.y) < e.r + 90) { touchPoint(e, p.x, p.y, 999, 0.8); sfx.skitter(); }
          idle(e, 0.3);
        }
      },
    },

    // Rappel Drop: up his thread into the canopy — his shadow marks where he
    // comes down — and a ring of silk darts where he lands (twice in phase 2).
    drop: {
      cooldown: 6,
      start(e) { e.left = p2(e) ? 2 : 1; e.invuln = true; e.noTarget = true; sfx.silk(); sub(e, 'climb', 0.45); },
      update(e, dt, p) {
        if (e.sub === 'climb') {
          e.up = clamp(e.st / 0.45, 0, 1);
          if (e.t <= 0) {
            const [x, y] = inArena(p.x + PV.x * 0.3, p.y + PV.y * 0.3, 60);
            e.x = x; e.y = y;
            blastAt(e, x, y, 80, 0.8, 0.9, SILK);
            sub(e, 'fall', 0.8);
          }
          return;
        }
        if (e.sub === 'fall') {
          e.up = clamp(1 - e.st / 0.8, 0, 1);
          if (e.t <= 0) {
            e.up = 0;
            silkDarts(e, e.x, e.y, 10);
            shake(0.4);
            sfx.skitter();
            e.left--;
            if (e.left > 0) { sub(e, 'climb', 0.4); return; }
            e.invuln = false;
            e.noTarget = false;
            idle(e, 0.4);
          }
        }
      },
    },

    // Egg Sac: two sacs of eggs land near you. Break them before they hatch,
    // or three spiderlings come skittering out of each.
    eggs: {
      cooldown: 12,
      start(e, p) {
        for (const sd of [-1, 1]) {
          const [x, y] = inArena(p.x + sd * rand(110, 180), p.y + rand(-80, 80), 50);
          lob(e, x, y, { flight: 0.8, r: 40, dmg: 0.4, color: SILK });
          e.eggs.push({ x, y, t: 4.0, k: 0 });
        }
        say(e, 'My children are hungry.', SILK);
        sub(e, 'wait', 0.9);
      },
      update(e) { if (e.t <= 0) idle(e, 0.3); },
    },

    // The Shed Skin: he leaves his old skin behind (strike it and it bursts),
    // fades, and creeps round behind you — then pounces.
    molt: {
      cooldown: 11,
      start(e) {
        e.husk = { x: e.x, y: e.y, face: e.face, t: 6 };
        say(e, 'Which one is Anansi?', STORY);
        sfx.silk();
        sub(e, 'fade', 0.5);
      },
      update(e, dt, p) {
        if (e.sub === 'fade') {
          e.alpha = clamp(1 - e.st / 0.5, 0.2, 1);
          if (e.t <= 0) sub(e, 'creep', 1.0);
          return;
        }
        if (e.sub === 'creep') {
          const behind = Math.hypot(PV.x, PV.y) > 40 ? Math.atan2(-PV.y, -PV.x) : angleTo(p.x, p.y, e.x, e.y);
          const [tx, ty] = inArena(p.x + Math.cos(behind) * 220, p.y + Math.sin(behind) * 220, e.r + 20);
          e.x = lerp(e.x, tx, 1 - Math.exp(-3 * dt));
          e.y = lerp(e.y, ty, 1 - Math.exp(-3 * dt));
          e.legPhase += dt * 30;
          if (e.t <= 0) {
            e.alpha = 1;
            e.aim = angleTo(e.x, e.y, p.x, p.y);
            e.pounceLen = Math.min(420, dist(e.x, e.y, p.x, p.y) + 40);
            lane(e, 0.45, e.pounceLen, 2 * (e.r + 12), SILK);
            sub(e, 'wind', 0.45);
          }
          return;
        }
        if (e.sub === 'wind') {
          if (e.t <= 0) { e.pounceHit = false; startLeap(e, e.x + Math.cos(e.aim) * e.pounceLen, e.y + Math.sin(e.aim) * e.pounceLen, 0.3); sfx.skitter(); sub(e, 'leap', 1); }
          return;
        }
        const done = stepLeap(e, dt);
        if (!e.pounceHit && touchPoint(e, e.x, e.y, e.r + 10, 0.85)) e.pounceHit = true;
        if (done) idle(e, 0.35);
      },
    },

    // Phase 2. Many Legs: too close — eight legs stamp down around him, one
    // after another, round the circle.
    legs: {
      cooldown: 4,
      start(e, p) {
        const base = angleTo(e.x, e.y, p.x, p.y);
        for (let k = 0; k < 8; k++) {
          spawnHazard({ kind: 'cone', x: e.x, y: e.y, angle: base + (k / 8) * TAU, arc: 0.85, r: 160, delay: 0.35 + k * 0.1, color: '#e8a030', owner: e, follow: e });
        }
        e.legK = 0;
        sub(e, 'stamp', 0.35 + 8 * 0.1);
      },
      update(e, dt, p) {
        const due = Math.floor((e.st - 0.35) / 0.1);
        while (e.legK <= due && e.legK < 8) {
          const a = angleTo(e.x, e.y, p.x, p.y);
          const base = e.legBase ?? (e.legBase = a);
          const cone = base + (e.legK / 8) * TAU;
          const d = dist(e.x, e.y, p.x, p.y);
          const diff = Math.abs(((a - cone + PI * 3) % TAU) - PI);
          if (d < 160 + p.r * 0.5 && diff < 0.45) touchPoint(e, p.x, p.y, 999, 0.6);
          sfx.skitter();
          e.legK++;
        }
        e.legPhase += dt * 40;
        if (e.t <= 0) { e.legBase = null; idle(e, 0.35); }
      },
    },

    ...TALE_MOVES,
  },

  draw(e, ctx) { drawAnansi(ctx, e, world.runTime); },

  drawExtras(e, ctx, t) { drawAnansiExtras(ctx, e, t); },

  drawArena(ctx, room, t) {
    const e = world.enemies.find((q) => q.type === 'anansi' && !q.dead) || null;
    drawAnansiArena(ctx, e, t);
  },
};
