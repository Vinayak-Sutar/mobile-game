// Kwaku Anansi — the tales. In the Ashanti stories, every story in the world
// belonged to Nyame, the sky god, and their price was the python Onini, the
// leopard Osebo, the hornets Mmoboro and the fairy Mmoatia. Anansi paid it
// with tricks: he measured the python against a stick and tied him to it,
// cried "It's raining!" so the hornets flew into his gourd, dug a pit on the
// leopard's path, and caught the fairy with a doll covered in gum. Later he
// tried to keep all wisdom in one pot — and dropped it, scattering wisdom
// across the world. Each of those tales is a chapter of this fight.

import { world, arenaBounds } from './state.js';
import { TAU, clamp, rand, dist, angleTo } from './util.js';
import { sub, idle, expose, shot, lane, inArena } from './boss-kit.js';
import { burst, ring, shake, damageText } from './fx.js';
import { sfx } from './audio.js';
import { spawnHazard } from './hazards.js';
import { spawnPickup } from './spawn.js';
import {
  PV, say, chapter, leadAt, center, blastAt, touchPoint, strikeLane, swingHits, playerHits, startLeap, stepLeap, segmentNear,
} from './boss-anansi-kit.js';
import { SILK, STORY, HORNET } from './boss-anansi-art.js';

const PI = Math.PI;
const p2 = (e) => e.phase >= 2;

// --- pieces of the tales, shared by their chapter and the finale ---------------------

/** The python stretched along a measuring stick through you; then tied, knot by knot. */
function pythonLine(e, p, angle) {
  const [x0, y0] = inArena(p.x - Math.cos(angle) * 270, p.y - Math.sin(angle) * 270, 30);
  const [x1, y1] = inArena(p.x + Math.cos(angle) * 270, p.y + Math.sin(angle) * 270, 30);
  const len = dist(x0, y0, x1, y1);
  const a = angleTo(x0, y0, x1, y1);
  spawnHazard({ kind: 'lane', x: x0, y: y0, angle: a, len, width: 64, delay: 1.0, color: '#6ab04a', owner: e });
  const knots = [];
  for (let i = 0; i < 9; i++) {
    const k = i / 8;
    knots.push(blastAt(e, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, 42, 1.0 + i * 0.07, 0.6, SILK));
  }
  return { x0, y0, x1, y1, k: 0, tied: 0 };
}

/** "It's raining!": drops fall around you, then the hornets swarm out, homing. */
function rain(e, p, n = 12) {
  for (let k = 0; k < n; k++) {
    const a = rand(0, TAU), r = k === 0 ? 0 : rand(60, 260);
    blastAt(e, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 30, 0.5 + k * 0.05, 0.3, '#7ac8ff');
  }
}

function swarm(e, x, y, n = 14) {
  const off = rand(0, TAU);
  for (let k = 0; k < n; k++) {
    shot(e, off + (k / n) * TAU, 210, { x, y, off: 20, shape: 'orb', r: 5, color: HORNET, dmg: 0.32, life: 5.5, extra: { homing: 2.0, isHornet: true } });
  }
  sfx.buzz(1.2);
}

/** A leopard pounce down a shown lane — into a pit, if you've lured it over one. */
function leopardAim(e, p) {
  const L = e.leopard;
  L.a = leadAt(L.x, L.y, p, 900, 0.4);
  L.len = Math.min(520, dist(L.x, L.y, p.x, p.y) + 60);
  spawnHazard({ kind: 'lane', x: L.x, y: L.y, angle: L.a, len: L.len, width: 56, delay: p2(e) ? 0.5 : 0.6, color: '#d8a848', owner: e });
  L.wait = p2(e) ? 0.5 : 0.6;
}

/** Returns 'trapped', 'landed' or null while the pounce is still in the air. */
function leopardStep(e, dt) {
  const L = e.leopard;
  if (L.wait > 0) { L.wait -= dt; if (L.wait <= 0) { L.fly = 0; L.x0 = L.x; L.y0 = L.y; sfx.roar(1.2); } return null; }
  L.fly += dt;
  const k = clamp(L.fly / 0.32, 0, 1);
  const nx = L.x0 + Math.cos(L.a) * L.len * k, ny = L.y0 + Math.sin(L.a) * L.len * k;
  for (const pit of e.pits || []) {
    if (!pit.trapped && segmentNear(L.x, L.y, nx, ny, pit.x, pit.y, pit.r * 0.8)) {
      L.x = pit.x; L.y = pit.y;
      pit.trapped = true;
      L.trapped = true;
      return 'trapped';
    }
  }
  L.x = nx; L.y = ny;
  touchPoint(e, L.x, L.y, 28, 0.85);
  if (k >= 1) { [L.x, L.y] = inArena(L.x, L.y, 30); return 'landed'; }
  return null;
}

/** The web of the sky god: spokes of star-silk and rolling rings with a gap. */
function skywebTick(e, dt, p) {
  const W = e.web;
  W.a += 0.7 * dt;
  if ((W.v -= dt) <= 0) {
    W.v = 0.16;
    for (let k = 0; k < 6; k++) shot(e, W.a + (k / 6) * TAU, 180, { shape: 'orb', r: 6, color: STORY, dmg: 0.38, life: 6 });
  }
  if ((W.ring -= dt) <= 0) {
    W.ring = 1.15;
    const gap = angleTo(e.x, e.y, p.x, p.y) + rand(-0.4, 0.4);
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * TAU;
      if (Math.abs(((a - gap + PI * 3) % TAU) - PI) < 0.42) continue;
      shot(e, a, 130, { shape: 'orb', r: 6, color: SILK, dmg: 0.35, life: 7 });
    }
  }
}

export const TALE_MOVES = {
  // The Python's Measure: a measuring stick is laid through you and the
  // python stretches along it — then silk ties it down, knot by knot (two
  // pythons crossing in phase 2).
  python: {
    cooldown: 9,
    start(e, p) {
      chapter(e, 'THE PYTHON');
      say(e, '"Are you longer than this stick?"', STORY);
      const a = rand(0, PI);
      e.python = pythonLine(e, p, a);
      if (p2(e)) e.python2 = pythonLine(e, p, a + PI / 2);
      sub(e, 'stretch', 1.0);
    },
    update(e) {
      const k = clamp(e.st / 1.0, 0, 1);
      if (e.python) e.python.k = k;
      if (e.python2) e.python2.k = k;
      if (e.sub === 'stretch' && e.t <= 0) { sfx.silk(); sub(e, 'tie', 0.8); return; }
      if (e.sub === 'tie') {
        if (e.python) e.python.tied = clamp(e.st / 0.6, 0, 1);
        if (e.t <= 0) { e.python = null; e.python2 = null; idle(e, 0.35); }
      }
    },
  },

  // It's Raining!: drops fall, the hornets swarm out of their nest and hunt
  // you — then fly into Anansi's gourd. While the gourd is full, strike it:
  // it bursts and the hornets sting HIM. Wait too long and they come out.
  hornets: {
    cooldown: 12,
    start(e, p) {
      chapter(e, 'THE HORNETS');
      say(e, '"It’s raining! Into my gourd!"', HORNET);
      const [gx, gy] = inArena(e.x + (p.x < e.x ? 90 : -90), e.y + 20, 40);
      e.gourd = { x: gx, y: gy, full: false };
      rain(e, p);
      sub(e, 'rain', 1.2);
    },
    update(e, dt, p) {
      const G = e.gourd;
      if (!G) { idle(e, 0.3); return; }
      if (e.sub === 'rain') {
        if (e.t <= 0) {
          const [nx, ny] = inArena(p.x + rand(-200, 200), p.y + rand(-140, 140), 60);
          swarm(e, nx, ny, p2(e) ? 18 : 14);
          sub(e, 'swarm', 3.0);
        }
        return;
      }
      if (e.sub === 'swarm') {
        if (e.t <= 0) { sfx.buzz(0.6); sub(e, 'gather', 1.4); }
        return;
      }
      if (e.sub === 'gather') {
        for (const pr of world.projectiles) {
          if (!pr.isHornet || pr.cleared) continue;
          pr.homing = 0;
          const a = angleTo(pr.x, pr.y, G.x, G.y);
          pr.vx = Math.cos(a) * 420; pr.vy = Math.sin(a) * 420;
          if (dist(pr.x, pr.y, G.x, G.y) < 24) pr.cleared = true;
        }
        if (e.t <= 0) {
          for (const pr of world.projectiles) if (pr.isHornet) pr.cleared = true;
          G.full = true;
          damageText(G.x, G.y - 50, 'STRIKE THE GOURD!', { color: HORNET, size: 14 });
          sub(e, 'full', p2(e) ? 2.8 : 3.5);
        }
        return;
      }
      if (e.sub === 'full') {
        if (playerHits(G.x, G.y, 26)) {
          damageText(e.x, e.y - e.r - 30, 'STUNG!', { color: HORNET, size: 20 });
          burst(G.x, G.y, { count: 30, color: HORNET, speed: 260, size: 3, life: 0.6, drag: 3 });
          sfx.buzz(0.8);
          e.gourd = null;
          expose(e, 2.2);
          return;
        }
        if (e.t <= 0) { swarm(e, G.x, G.y, p2(e) ? 16 : 12); e.gourd = null; idle(e, 0.4); }
      }
    },
  },

  // Osebo's Pit: pits are dug around you (look for the dashed rings) and the
  // leopard spirit pounces three times. Lead its pounce over a pit and it
  // falls in — and Anansi, laughing, drops his guard.
  leopard: {
    cooldown: 12,
    start(e, p) {
      chapter(e, 'THE LEOPARD');
      e.pits = [];
      for (let tries = 0; tries < 40 && e.pits.length < 3; tries++) {
        const a = rand(0, TAU), r = rand(150, 320);
        const [x, y] = inArena(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 60);
        if (e.pits.some((q) => dist(q.x, q.y, x, y) < 130)) continue;
        e.pits.push({ x, y, r: 46, trapped: false });
      }
      const b = arenaBounds();
      const [lx, ly] = inArena(p.x < (b.l + b.r) / 2 ? b.r - 60 : b.l + 60, p.y, 40);
      e.leopard = { x: lx, y: ly, a: 0 };
      e.left = p2(e) ? 4 : 3;
      say(e, 'Osebo, mind the path…', '#d8a848');
      sub(e, 'enter', 0.6);
    },
    update(e, dt, p) {
      const L = e.leopard;
      if (!L) { idle(e, 0.3); return; }
      if (e.sub === 'enter') { if (e.t <= 0) { leopardAim(e, p); sub(e, 'hunt', 99); } return; }
      const res = leopardStep(e, dt);
      if (res === 'trapped') {
        damageText(L.x, L.y - 30, 'OSEBO FALLS IN!', { color: '#d8a848', size: 17 });
        shake(0.4);
        say(e, 'Ha! Ha ha!', STORY);
        e.leopard = null;
        expose(e, 1.8);
        return;
      }
      if (res === 'landed') {
        ring(L.x, L.y, { r0: 8, r1: 60, color: '#d8a848', life: 0.3, width: 4 });
        e.left--;
        if (e.left > 0) leopardAim(e, p);
        else { e.leopard = null; idle(e, 0.4); }
      }
    },
  },

  // Mmoatia's Gum Doll: sticky dolls with a plate of yams are set down beside
  // you. Touch or strike one and you're stuck fast — while Anansi pounces.
  // But if his pounce crosses a doll, HE is stuck.
  gumdoll: {
    cooldown: 12,
    start(e, p) {
      chapter(e, 'THE GUM DOLL');
      const a = angleTo(e.x, e.y, p.x, p.y) + PI / 2;
      e.dolls = [-1, 1].map((sd) => {
        const [x, y] = inArena(p.x + Math.cos(a) * 110 * sd, p.y + Math.sin(a) * 110 * sd, 40);
        return { x, y, t: 10, stuckAt: -9 };
      });
      e.left = 3;
      say(e, 'A doll for the fairy…', STORY);
      sub(e, 'set', 0.8);
    },
    update(e, dt, p) {
      if (e.sub === 'set') {
        if (e.t <= 0) aimPounce(e, p);
        return;
      }
      if (e.sub === 'wind') {
        if (e.t <= 0) { startLeap(e, e.pounceTo[0], e.pounceTo[1], 0.34); sfx.skitter(); sub(e, 'leap', 1); }
        return;
      }
      if (e.sub === 'leap') {
        const x0 = e.x, y0 = e.y;
        const landed = stepLeap(e, dt);
        strikeLaneOnce(e);
        for (const d of e.dolls || []) {
          if (segmentNear(x0, y0, e.x, e.y, d.x, d.y, 26)) {
            e.leap = null;
            e.x = d.x; e.y = d.y;
            damageText(e.x, e.y - e.r - 30, 'STUCK TO THE GUM DOLL!', { color: STORY, size: 17 });
            e.stuck = 2.2;
            e.dolls = e.dolls.filter((q) => q !== d);
            expose(e, 2.2);
            return;
          }
        }
        if (landed) {
          e.left--;
          if (e.left > 0) aimPounce(e, p); else idle(e, 0.4);
        }
      }
    },
  },

  // Web of the Sky God (phase-1 barrage): in the middle of his web, Anansi
  // spins the sky itself — spokes of star-silk turning, rings rolling out
  // with a gap. Then he rests.
  skyweb: {
    cooldown: 28,
    start(e) {
      const c = center();
      chapter(e, 'THE WEB OF THE SKY GOD');
      startLeap(e, c.x, c.y, 0.5);
      e.web = { a: rand(0, TAU), v: 0, ring: 1 };
      sub(e, 'go', 0.5);
    },
    update(e, dt, p) {
      if (e.sub === 'go') { if (stepLeap(e, dt)) { sfx.talkingDrum(false); sub(e, 'spin', 5); } return; }
      skywebTick(e, dt, p);
      if (e.t <= 0) expose(e, 2.2);
    },
  },

  // Phase 2. The Pot of Wisdom: Anansi climbs his thread with the pot of all
  // wisdom — and drops it. Where it shatters (marked) shards fly, and golden
  // wisdom scatters for anyone quick enough to take it.
  wisdom: {
    cooldown: 14,
    start(e, p) {
      chapter(e, 'THE POT OF WISDOM');
      say(e, 'All the wisdom, mine…', STORY);
      e.invuln = true;
      e.noTarget = true;
      sub(e, 'climb', 0.6);
    },
    update(e, dt, p) {
      if (e.sub === 'climb') {
        e.up = clamp(e.st / 0.6, 0, 1);
        if (e.t <= 0) {
          const [x, y] = inArena(p.x + PV.x * 0.4, p.y + PV.y * 0.4, 60);
          e.pot = { x, y, z: 260 };
          blastAt(e, x, y, 95, 1.1, 1.0, STORY, {
            onDetonate: (h) => {
              for (let k = 0; k < 16; k++) shot(e, (k / 16) * TAU, 220, { x: h.x, y: h.y, off: 16, shape: 'shard', r: 6, color: '#8a4a2a', dmg: 0.4, life: 3 });
              for (let k = 0; k < 5; k++) spawnPickup({ x: h.x, y: h.y, vx: rand(-160, 160), vy: rand(-160, 160), type: 'heal', value: 4, r: 10 });
              damageText(h.x, h.y - 40, 'WISDOM SCATTERED', { color: STORY, size: 15 });
              shake(0.5);
              sfx.explode();
              e.pot = null;
            },
          });
          sub(e, 'drop', 1.3);
        }
        return;
      }
      if (e.sub === 'drop') {
        if (e.pot) e.pot.z = Math.max(0, 260 * (1 - e.st / 1.1));
        if (e.t <= 0) {
          const [x, y] = inArena(p.x + rand(-260, 260), p.y + rand(-160, 160), 60);
          e.x = x; e.y = y;
          blastAt(e, x, y, 70, 0.5, 0.7, SILK);
          sub(e, 'land', 0.5);
        }
        return;
      }
      e.up = clamp(1 - e.st / 0.4, 0, 1);
      if (e.t <= 0) { e.up = 0; e.invuln = false; e.noTarget = false; idle(e, 0.3); }
    },
  },

  // Phase 2 barrage. All Stories Are Anansi's: he opens his story-gourd and
  // the whole price replays at once — two pythons, the hornet rain, the
  // leopard, and the sky web — then he rests at last.
  allstories: {
    cooldown: 32,
    start(e) { chapter(e, 'ALL STORIES ARE ANANSI’S'); e.step = 0; sub(e, 'tell', 0.6); },
    update(e, dt, p) {
      if (e.sub === 'web') {
        skywebTick(e, dt, p);
        if (e.t <= 0) expose(e, 2.6);
        return;
      }
      if (e.sub === 'leo') {
        const res = e.leopard ? leopardStep(e, dt) : 'landed';
        if (res) {
          e.left--;
          if (e.left > 0 && e.leopard && res !== 'trapped') { leopardAim(e, p); return; }
          e.leopard = null;
          e.web = { a: rand(0, TAU), v: 0, ring: 0.5 };
          sub(e, 'web', 3.2);
        }
        return;
      }
      if (e.t > 0) {
        const k = clamp(e.st / 1.0, 0, 1);
        if (e.python) e.python.k = k;
        if (e.python2) e.python2.k = k;
        return;
      }
      const s = e.step++;
      if (s === 0) { const a = rand(0, PI); e.python = pythonLine(e, p, a); e.python2 = pythonLine(e, p, a + PI / 2); sub(e, 'tell', 1.4); return; }
      if (s === 1) { e.python = null; e.python2 = null; rain(e, p, 10); e.t = 0.9; return; }
      if (s === 2) { swarm(e, e.x, e.y, 16); e.t = 1.6; return; }
      const b = arenaBounds();
      const [lx, ly] = inArena(p.x < (b.l + b.r) / 2 ? b.r - 60 : b.l + 60, p.y, 40);
      e.leopard = { x: lx, y: ly, a: 0 };
      e.left = 2;
      leopardAim(e, p);
      sub(e, 'leo', 99);
    },
  },
};

function aimPounce(e, p) {
  e.aim = leadAt(e.x, e.y, p, 900, 0.4);
  const d = Math.min(460, dist(e.x, e.y, p.x, p.y) + 40);
  e.pounceTo = [e.x + Math.cos(e.aim) * d, e.y + Math.sin(e.aim) * d];
  e.pounceHit = false;
  lane(e, 0.55, d, 2 * (e.r + 12), SILK);
  sfx.telegraph();
  sub(e, 'wind', 0.55);
}

function strikeLaneOnce(e) {
  if (e.pounceHit) return;
  if (strikeLane(e, e.x - Math.cos(e.aim) * 30, e.y - Math.sin(e.aim) * 30, e.aim, 60, e.r + 8, 0.8)) e.pounceHit = true;
}

/** Every tick: the chapter banner fades, gum sticks, pits close, the gourd waits. */
export function updateTales(e, dt, p) {
  e.chapterT = Math.max(0, (e.chapterT || 0) - dt);
  if (e.dolls) {
    for (const d of e.dolls) {
      d.t -= dt;
      const now = world.runTime;
      if (now - d.stuckAt > 2 && (dist(p.x, p.y, d.x, d.y) < p.r + 20 || swingHits(d.x, d.y, 20))) {
        d.stuckAt = now;
        p.slowUntil = now + 1.1;
        p.slowMult = 0.12;
        damageText(p.x, p.y - p.r - 22, 'STUCK!', { color: '#c8a060', size: 16 });
        sfx.silk();
      }
    }
    e.dolls = e.dolls.filter((d) => d.t > 0);
    if (!e.dolls.length) e.dolls = null;
  }
  if (e.pits && e.action !== 'leopard' && e.action !== 'allstories') {
    e.pitT = (e.pitT ?? 6) - dt;
    if (e.pitT <= 0) { e.pits = null; e.pitT = 6; }
  }
}
