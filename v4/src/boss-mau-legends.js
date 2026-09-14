// Mau, the cat of nine lives — the legends she learns in her later lives.
//   Life 5  THE GREAT CAT OF RA: in the Book of the Dead, Ra takes the form of
//           a great tom-cat, Mau, and cuts off the head of Apep, the serpent
//           of chaos, with a knife beneath the persea tree of Heliopolis.
//   Life 6  KOT BAYUN: the Slavic cat on a golden pillar whose songs and tales
//           lull travellers to sleep before his iron claws strike — and whose
//           tales heal whoever manages to catch him.
//   Life 7  NEKOMATA: the Japanese cat whose tail splits in two when it grows
//           old; it summons ghost fire and makes the dead dance.
//   Life 8  KASHA, the fire-cart cat who comes with thunder to snatch the dead,
//           and FREYJA'S CHARIOT, drawn by two great cats.
//   Life 9  CAT SÌTH, the Highland fairy cat that steals souls before burial,
//           and the JÓLAKÖTTURINN, the house-sized Yule Cat that peers in at
//           windows. Folklore says a witch could become the cat-sìth nine
//           times — the ninth time, she stayed a cat forever.

import { world, arenaBounds } from './state.js';
import { TAU, clamp, rand, dist, angleTo, angleDiff } from './util.js';
import { sub, idle, expose, shot, lane, inArena, spawnEnemyFn } from './boss-kit.js';
import { burst, ring, shake, flash, damageText } from './fx.js';
import { sfx } from './audio.js';
import { spawnHazard } from './hazards.js';
import { spawnPickup } from './spawn.js';
import {
  PV, say, leadAt, center, blastAt, touchPoint, strikeLane, cutLands, startLeap, stepLeap,
} from './boss-mau-kit.js';
import { SUN, SOUL, GOLD } from './boss-mau-art.js';

const PI = Math.PI;
const SHADOW = '#7a4aa8';

function knifeCue(e, p, t) {
  e.aim = angleTo(e.x, e.y, p.x, p.y);
  e.face = e.aim;
  spawnHazard({ kind: 'cone', x: e.x, y: e.y, angle: e.aim, arc: 2.2, r: 150, delay: t, color: SUN, owner: e, follow: e });
  sfx.telegraph();
  sub(e, 'cut', t);
}

function soulTop(e) { return e.maxHp * (10 - e.life) / 9; }

export const LEGEND_MOVES = {
  // Life 5+. Knife of Mau: three slashes of the sun-knife, each throwing a
  // crescent of blades.
  knife: {
    cooldown: 4,
    start(e, p) { e.left = 3; knifeCue(e, p, 0.42); },
    update(e, dt, p) {
      if (e.t > 0) return;
      cutLands(e, e.aim, 2.2, 150, 0.7);
      for (let k = 0; k < 7; k++) shot(e, e.aim + (k - 3) * 0.18, 300, { shape: 'shard', r: 7, color: SUN, dmg: 0.4, life: 3 });
      sfx.scratch();
      e.left--;
      if (e.left > 0) knifeCue(e, p, 0.3); else idle(e, 0.4);
    },
  },

  // Life 5+. Apep: the serpent of chaos slithers across the courtyard toward
  // you, coil by coil (marked) — then Mau cuts off its head and the whole
  // body bursts at once.
  apep: {
    cooldown: 9,
    start(e, p) {
      const b = arenaBounds();
      const fromLeft = p.x > (b.l + b.r) / 2;
      const x0 = fromLeft ? b.l + 40 : b.r - 40;
      const y0 = rand(b.t + 80, b.b - 60);
      const a = angleTo(x0, y0, p.x, p.y);
      const len = dist(x0, y0, p.x, p.y) + 160;
      e.coils = [];
      for (let i = 0; i < 14; i++) {
        const d = (i / 13) * len;
        const wave = Math.sin(i * 0.9) * 50;
        e.coils.push([x0 + Math.cos(a) * d - Math.sin(a) * wave, y0 + Math.sin(a) * d + Math.cos(a) * wave]);
      }
      e.coilT = 0;
      e.coilN = 0;
      say(e, 'Apep! Serpent of chaos!', SHADOW);
      sfx.hiss();
      sub(e, 'slither', 1.5);
    },
    update(e, dt) {
      const total = 1.5;
      while (e.coilN < e.coils.length && e.st >= e.coilN * 0.07) {
        const [x, y] = e.coils[e.coilN];
        blastAt(e, x, y, e.coilN === e.coils.length - 1 ? 70 : 44, Math.max(0.1, total - e.coilN * 0.07), 0.7, SHADOW);
        e.coilN++;
      }
      if (e.t <= 0) { shake(0.6); sfx.explode(); sfx.yowl(); idle(e, 0.4); }
    },
  },

  // Life 5+ barrage. Sun of Heliopolis: beneath the persea tree the sun-disc
  // turns — four arms of light, and rings rolling out with a gap. Then she's
  // spent.
  sundisk: {
    cooldown: 28,
    start(e) {
      const c = center();
      startLeap(e, c.x, c.y + 60, 0.6);
      e.sun = { a: rand(0, TAU), v: 0, ring: 1 };
      say(e, 'Sun of Heliopolis!', SUN);
      sub(e, 'hop', 0.6);
    },
    update(e, dt, p) {
      if (e.sub === 'hop') { if (stepLeap(e, dt)) { sfx.roar(1.1); sub(e, 'shine', 5); } return; }
      const S = e.sun;
      S.a += 1.0 * dt;
      if ((S.v -= dt) <= 0) {
        S.v = 0.13;
        for (let k = 0; k < 4; k++) shot(e, S.a + (k / 4) * TAU, 170, { shape: 'orb', r: 7, color: SUN, dmg: 0.4, life: 6 });
      }
      if ((S.ring -= dt) <= 0) {
        S.ring = 1.2;
        const gap = angleTo(e.x, e.y, p.x, p.y) + rand(-0.4, 0.4);
        for (let k = 0; k < 18; k++) { const a = (k / 18) * TAU; if (Math.abs(angleDiff(gap, a)) < 0.45) continue; shot(e, a, 140, { shape: 'orb', r: 6, color: GOLD, dmg: 0.35, life: 7 }); }
      }
      if (e.t <= 0) expose(e, 2.2);
    },
  },

  // Life 6+. Kot Bayun's Lullaby: she climbs a golden pillar and sings. Stay
  // near the song and you grow drowsy (the bar over you); fall asleep and
  // her iron claws come. But catch her — five hits while she sings — and her
  // tale heals you instead.
  lullaby: {
    cooldown: 16,
    start(e) {
      const c = center();
      e.pillar = { x: c.x, y: c.y };
      e.songHits = 0;
      startLeap(e, c.x, c.y, 0.55);
      say(e, 'Sleep, little traveller…', '#c8b8ff');
      sub(e, 'hop', 0.55);
    },
    update(e, dt, p) {
      if (e.sub === 'hop') { if (stepLeap(e, dt)) { e.spiral = rand(0, TAU); e.noteT = 0; sub(e, 'sing', 5.5); } return; }
      if (e.sub === 'sing') {
        e.blink = 1;
        e.spiral += dt * 1.2;
        if ((e.noteT -= dt) <= 0) {
          e.noteT = 0.2;
          for (const off of [0, PI]) shot(e, e.spiral + off, 110, { shape: 'orb', r: 7, color: '#c8b8ff', dmg: 0.25, life: 6 });
          if (Math.random() < 0.3) sfx.purr(0.3);
        }
        const near = dist(e.x, e.y, p.x, p.y) < 300;
        e.drowsy = clamp((e.drowsy || 0) + (near ? dt * 0.3 : -dt * 0.25), 0, 1);
        if (e.songHits >= 5) {
          damageText(e.x, e.y - e.r - 30, 'CAUGHT! HER TALE HEALS YOU', { color: '#7dff9c', size: 15 });
          spawnPickup({ x: e.x, y: e.y, vx: rand(-80, 80), vy: 120, type: 'heal', value: 18, r: 13 });
          e.pillar = null; e.drowsy = 0; e.blink = 0;
          expose(e, 1.6);
          return;
        }
        if (e.drowsy >= 1) {
          e.drowsy = 0;
          p.slowUntil = world.runTime + 1.6;
          p.slowMult = 0.3;
          damageText(p.x, p.y - p.r - 22, 'ASLEEP', { color: '#c8b8ff', size: 16 });
          e.aim = angleTo(e.x, e.y, p.x, p.y);
          lane(e, 0.55, dist(e.x, e.y, p.x, p.y) + 40, 2 * (e.r + 10), '#c8b8ff');
          sub(e, 'wind', 0.55);
          return;
        }
        if (e.t <= 0) { e.pillar = null; e.blink = 0; idle(e, 0.4); }
        return;
      }
      if (e.sub === 'wind') {
        e.wiggle = 1;
        if (e.t <= 0) { e.wiggle = 0; startLeap(e, p.x + Math.cos(e.aim) * 40, p.y + Math.sin(e.aim) * 40, 0.3); sfx.yowl(); sub(e, 'claws', 0.3); }
        return;
      }
      if (stepLeap(e, dt)) {
        cutLands(e, e.aim, TAU, 90, 1.0);
        e.pillar = null; e.blink = 0;
        idle(e, 0.4);
      }
    },
  },

  // Life 7+. Onibi: six ghost fires gather around her split tail, then chase
  // you one after another.
  ghostfire: {
    cooldown: 8,
    start(e) { e.wisps = []; for (let k = 0; k < 6; k++) e.wisps.push({ orbit: (k / 6) * TAU, x: e.x, y: e.y, vx: 0, vy: 0, life: 4.5, free: false }); sfx.chime(); sub(e, 'gather', 1.0); },
    update(e, dt) {
      if (e.sub === 'gather') { if (e.t <= 0) { e.launchT = 0; sub(e, 'launch', 1.9); } return; }
      if ((e.launchT -= dt) <= 0) {
        e.launchT = 0.3;
        const w = e.wisps.find((q) => !q.free);
        if (w) { w.free = true; w.vx = Math.cos(w.orbit) * 150; w.vy = Math.sin(w.orbit) * 150; sfx.telegraph(); }
      }
      if (e.t <= 0) idle(e, 0.3);
    },
  },

  // Life 7+. The Dancing Dead: she makes three of the dead get up and dance
  // at you.
  dead: {
    cooldown: 16,
    start(e) { say(e, 'Dance for me!', '#c8f0ff'); sfx.meow(0.7); sub(e, 'raise', 0.8); },
    update(e, dt, p) {
      if (e.t > 0) return;
      for (let k = 0; k < 3; k++) {
        const a = rand(0, TAU);
        const [x, y] = inArena(p.x + Math.cos(a) * 260, p.y + Math.sin(a) * 260, 40);
        spawnEnemyFn('wretch', x, y, { summoner: e, color: '#c8e0e8', scale: (e.scale || 1) * 0.6 });
      }
      idle(e, 0.4);
    },
  },

  // Life 8+. The Kasha: thunder first — then she becomes a burning cart
  // wheel that rolls across the courtyard, bouncing off the walls three
  // times and leaving fire behind.
  kasha: {
    cooldown: 11,
    start(e) { flash(0.4, '#ffffff'); sfx.thunder(); shake(0.6); say(e, 'Thunder at the funeral…', '#ff8a3d'); sub(e, 'thunder', 0.7); },
    update(e, dt, p) {
      if (e.sub === 'thunder') {
        if (e.t <= 0) { e.bounces = 3; aimWheel(e, p, 0.5); }
        return;
      }
      if (e.sub === 'aim') { if (e.t <= 0) sub(e, 'roll', 2); return; }
      const sp = 700;
      e.x += Math.cos(e.aim) * sp * dt;
      e.y += Math.sin(e.aim) * sp * dt;
      e.face += dt * 20;
      touchPoint(e, e.x, e.y, e.r + 8, 0.9);
      if ((e.fireT = (e.fireT || 0) - dt) <= 0) { e.fireT = 0.05; e.fires.push({ x: e.x, y: e.y, r: 30, t: 3 }); }
      const [cx, cy] = inArena(e.x, e.y, e.r + 6);
      if (cx !== e.x || cy !== e.y || e.t <= 0) {
        e.x = cx; e.y = cy;
        shake(0.3);
        e.bounces--;
        if (e.bounces > 0) aimWheel(e, p, 0.35);
        else { e.exposed = 0.8; idle(e, 0.8); }
      }
    },
  },

  // Life 8+. Freyja's Chariot: two great cats race side by side down two
  // lanes — the gap between them is safe — then again, crosswise.
  freyja: {
    cooldown: 10,
    start(e, p) { e.pass = 0; chariotCue(e, p); },
    update(e, dt, p) {
      if (e.sub === 'cue') {
        if (e.t <= 0) { e.lynx = e.chariot.map(([x, y]) => ({ x, y, a: e.chariot.a })); e.chariot.d = 0; sfx.roar(1.3); sub(e, 'race', 2); }
        return;
      }
      const C = e.chariot;
      const step = 950 * dt;
      C.d += step;
      for (const L of e.lynx) {
        L.x += Math.cos(C.a) * step;
        L.y += Math.sin(C.a) * step;
        touchPoint(e, L.x, L.y, 28, 0.8);
      }
      if (C.d >= C.len || e.t <= 0) {
        e.lynx = [];
        e.pass++;
        if (e.pass < 2) chariotCue(e, p); else idle(e, 0.4);
      }
    },
  },

  // Life 9. Soul Snatch (the Cat Sìth): a pounce through you. If it lands,
  // your soul is knocked loose and drifts to her — catch it back to heal, or
  // she drinks it.
  soul: {
    cooldown: 9,
    start(e, p) {
      e.aim = leadAt(e.x, e.y, p, 900, 0.4);
      e.saultLen = dist(e.x, e.y, p.x, p.y) + 140;
      lane(e, 0.5, e.saultLen, 2 * (e.r + 12), SOUL);
      e.wiggle = 1;
      sfx.telegraph();
      sub(e, 'wind', 0.5);
    },
    update(e, dt, p) {
      if (e.sub === 'wind') {
        if (e.t <= 0) {
          e.wiggle = 0;
          const x0 = e.x, y0 = e.y;
          startLeap(e, e.x + Math.cos(e.aim) * e.saultLen, e.y + Math.sin(e.aim) * e.saultLen, 0.35);
          if (strikeLane(e, x0, y0, e.aim, e.saultLen, e.r + 12, 0.8)) {
            e.soul = { x: p.x, y: p.y };
            damageText(p.x, p.y - p.r - 22, 'SOUL SNATCHED', { color: SOUL, size: 15 });
          }
          sfx.catHiss();
          sub(e, 'leap', 0.35);
        }
        return;
      }
      if (stepLeap(e, dt)) idle(e, 0.35);
    },
  },

  // Life 9. The Yule Cat: a cat the size of a house peers over the wall, and
  // its giant paw comes down — four times, each shadow marked.
  yulepaw: {
    cooldown: 13,
    start(e) { e.paws = 4; e.pawT = 0.9; sfx.yowl(); say(e, 'The Yule Cat is watching…', '#ffe27a'); sub(e, 'peer', 5); },
    update(e, dt, p) {
      e.yule = clamp((e.yule || 0) + dt * 1.5, 0, 1);
      if ((e.pawT -= dt) <= 0 && e.paws > 0) {
        e.paws--;
        e.pawT = 0.75;
        blastAt(e, p.x + PV.x * 0.4, p.y + PV.y * 0.4, 130, 1.0, 1.0, '#08060c', {
          onDetonate: (h) => {
            shake(0.6);
            sfx.thud();
            for (let k = 0; k < 6; k++) shot(e, (k / 6) * TAU + rand(0, 1), 190, { x: h.x, y: h.y, off: 20, shape: 'rock', r: 7, color: '#8a8070', dmg: 0.4, life: 3 });
          },
        });
      }
      if (e.paws <= 0 && e.pawT <= -0.4) { e.yuleFade = true; idle(e, 0.4); }
    },
  },

  // Life 9 barrage. Nine Lives: the ghosts of her eight lost lives ring you,
  // and each pounces through you in turn. Then the last life stands alone.
  nine: {
    cooldown: 30,
    start(e, p) {
      e.ghosts = [];
      const base = rand(0, TAU);
      for (let k = 0; k < 8; k++) {
        const a = base + (k / 8) * TAU;
        const [x, y] = inArena(p.x + Math.cos(a) * 280, p.y + Math.sin(a) * 280, 30);
        e.ghosts.push({ x, y, a: angleTo(x, y, p.x, p.y), alpha: 0, go: 0.9 + k * 0.42, done: false });
      }
      say(e, 'Every life I have lost…', '#c8b8ff');
      sfx.meow(0.6);
      sub(e, 'haunt', 0.9 + 8 * 0.42 + 0.8);
    },
    update(e, dt, p) {
      for (const g of e.ghosts) {
        g.alpha = clamp(g.alpha + dt * 2, 0, 0.75);
        if (g.done) continue;
        const until = g.go - e.st;
        if (until > 0.5) { g.a = angleTo(g.x, g.y, p.x, p.y); continue; }
        if (until > 0) {
          if (!g.laned) {
            g.laned = true;
            g.len = dist(g.x, g.y, p.x, p.y) + 120;
            spawnHazard({ kind: 'lane', x: g.x, y: g.y, angle: g.a, len: g.len, width: 50, delay: until, color: SOUL, owner: e });
          }
          g.wiggle = 1;
          continue;
        }
        strikeLane(e, g.x, g.y, g.a, g.len, 25, 0.7);
        burst(g.x, g.y, { count: 12, color: SOUL, speed: 200, size: 4, life: 0.4, drag: 3 });
        g.x += Math.cos(g.a) * g.len;
        g.y += Math.sin(g.a) * g.len;
        g.done = true;
        g.alpha = 0.3;
        sfx.catHiss();
      }
      if (e.t <= 0) { e.ghosts = []; expose(e, 2.4); }
    },
  },
};

function aimWheel(e, p, t) {
  e.aim = angleTo(e.x, e.y, p.x, p.y);
  lane(e, t, 900, 2 * (e.r + 10), '#ff8a3d');
  sfx.telegraph();
  sub(e, 'aim', t);
}

function chariotCue(e, p) {
  const b = arenaBounds();
  const a = e.pass === 0 ? (p.x < (b.l + b.r) / 2 ? 0 : PI) : (p.y < (b.t + b.b) / 2 ? PI / 2 : -PI / 2);
  const nx = -Math.sin(a), ny = Math.cos(a);
  const len = Math.abs(Math.cos(a)) > 0.5 ? b.r - b.l : b.b - b.t;
  const sx = Math.abs(Math.cos(a)) > 0.5 ? (Math.cos(a) > 0 ? b.l : b.r) : p.x;
  const sy = Math.abs(Math.cos(a)) > 0.5 ? p.y : (Math.sin(a) > 0 ? b.t : b.b);
  e.chariot = [[sx + nx * 70, sy + ny * 70], [sx - nx * 70, sy - ny * 70]];
  e.chariot.a = a;
  e.chariot.len = len;
  for (const [x, y] of e.chariot) spawnHazard({ kind: 'lane', x, y, angle: a, len, width: 60, delay: 0.65, color: '#e8d8b0', owner: e });
  say(e, "Freyja's chariot!", '#e8d8b0');
  sub(e, 'cue', 0.65);
}

/** Every tick: ghost fires chase, a stolen soul drifts, the Yule Cat fades. */
export function updateLegends(e, dt, p) {
  if (e.wisps) {
    for (const w of e.wisps) {
      if (!w.free) {
        w.orbit += dt * 3;
        w.x = e.x + Math.cos(w.orbit) * (e.r + 30);
        w.y = e.y + Math.sin(w.orbit) * (e.r + 30);
        continue;
      }
      w.life -= dt;
      const want = angleTo(w.x, w.y, p.x, p.y);
      const cur = Math.atan2(w.vy, w.vx);
      const na = cur + clamp(angleDiff(cur, want), -1.6 * dt, 1.6 * dt);
      w.vx = Math.cos(na) * 250;
      w.vy = Math.sin(na) * 250;
      w.x += w.vx * dt;
      w.y += w.vy * dt;
      if (touchPoint(e, w.x, w.y, 12, 0.5)) w.life = 0;
    }
    e.wisps = e.wisps.filter((w) => w.life > 0 && (w.free || e.action === 'ghostfire'));
    if (!e.wisps.length) e.wisps = null;
  }
  if (e.soul) {
    const S = e.soul;
    const a = angleTo(S.x, S.y, e.x, e.y);
    S.x += Math.cos(a) * 110 * dt;
    S.y += Math.sin(a) * 110 * dt;
    if (dist(S.x, S.y, p.x, p.y) < p.r + 16) {
      p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.maxHp * 0.12);
      damageText(p.x, p.y - p.r - 22, 'SOUL RECLAIMED', { color: '#7dff9c', size: 15 });
      ring(p.x, p.y, { r0: 30, r1: 4, color: SOUL, life: 0.4, width: 4 });
      e.soul = null;
    } else if (dist(S.x, S.y, e.x, e.y) < e.r + 10) {
      e.hp = Math.min(soulTop(e) - 1, e.hp + e.maxHp * 0.05);
      damageText(e.x, e.y - e.r - 22, 'SHE DRINKS YOUR SOUL', { color: SOUL, size: 15 });
      sfx.purr(0.8);
      e.soul = null;
    }
  }
  if (e.yuleFade) {
    e.yule = Math.max(0, (e.yule || 0) - dt * 1.2);
    if (e.yule <= 0) e.yuleFade = false;
  }
  if (e.drowsy > 0 && e.action !== 'lullaby') e.drowsy = Math.max(0, e.drowsy - dt * 0.5);
}
