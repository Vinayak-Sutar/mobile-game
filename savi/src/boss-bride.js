// ============================================================================
// THE WEEPING BRIDE, LADY OF THE HOLLOW MIRROR — a ghost in a dark ballroom.
// "You only see her when there is light."
//
// LIGHT (signature): the ballroom is dark. Six lanterns stand in it — strike
// one to light it (it burns ~18 s). She is only truly hit while she stands in
// light: a lantern's glow, a fallen chandelier's, or your own small aura.
// In the dark your blows pass through her veil (UNSEEN, x0.2). So a pure
// ranged fight means keeping lanterns lit where she floats — and she blows
// them out; a close fight means her Wail, her Embrace and her Cold Hands.
//
// MIRRORS: she splits into mirror images. They move as her reflections
// across the ballroom and every bullet she fires, they fire mirrored. Only
// the real Bride has a shadow and a reflection in the mirrors on the far
// wall. Strike a copy and it shatters into glass shards (auto-aim beware).
//
// Moves: Veil Petals, Cold Hands, Wail (silences your spells), Lantern
// Snuff, Chandelier, Mirror Copies, Grasping Veil, Embrace, VEIL DANCE.
// Phase 2 (THE HOLLOW MIRROR, at half health): the lanterns die, the copies
// stay, and she adds Tearfall, the Wedding March, HEX (she possesses one of
// your spells: casting it hurts you) and REQUIEM, the kaleidoscope barrage.
// ============================================================================

import { world, arena, arenaBounds } from './state.js';
import { TAU, clamp, rand, dist, angleTo, angleDiff, lerp, circleArc, circleOrientedRect } from './util.js';
import { sub, idle, expose, shot, lane, inArena, turnToward, forward, spawnEnemyFn, shockwave } from './boss-kit.js';
import { damagePlayer } from './combat.js';
import { burst, ring, shake, flash, damageText } from './fx.js';
import { sfx } from './audio.js';
import { spawnHazard } from './hazards.js';
import { spellById } from './spells.js';

const PI = Math.PI;
const PALE = '#dfeaff';
const ICE = '#9fd8ff';
const PETAL = '#f4d8ff';
const GLASS = '#cfe8ff';
const BLOOD = '#c8304a';
const HEX = '#b46cff';
const WARM = '#ffc878';

const LIT_TIME = 18;
const LAMP_R = 190;       // a lantern's light
const AURA_R = 150;       // your own small light
const p2 = (e) => e.phase >= 2;
const PV = { x: 0, y: 0 };   // your smoothed velocity, for leading shots

function say(e, text, color = PALE) {
  damageText(e.x, e.y - e.r - 30, text, { color, size: 16 });
}

function leadAt(x, y, p, speed, k = 0.5) {
  const t = dist(x, y, p.x, p.y) / speed;
  return angleTo(x, y, p.x + PV.x * t * k, p.y + PV.y * t * k);
}

function center() {
  const b = arenaBounds();
  return { x: (b.l + b.r) / 2, y: (b.t + b.b) / 2 };
}

function blastAt(e, x, y, r, delay, mult, color, extra = {}) {
  const [sx, sy] = inArena(x, y, 16);
  return spawnHazard({ kind: 'blast', x: sx, y: sy, r, delay, damage: Math.round(e.damage * mult), color: color || ICE, source: e.type, owner: e, quiet: true, ...extra });
}

function touch(e, mult) {
  const p = world.player;
  if (!p || p.dead || (e.touchCd || 0) > 0) return;
  if (dist(e.x, e.y, p.x, p.y) < e.r + p.r * 0.5 + 10) {
    if (damagePlayer(Math.round(e.damage * mult), e.x, e.y, e.type)) e.touchCd = 0.7;
  }
}

// --- light -------------------------------------------------------------------------

function lampRadius(L) { return L.lit > 0 ? LAMP_R * clamp(L.lit / 2, 0.25, 1) : 0; }

function isLit(e, x, y) {
  const p = world.player;
  if (p && dist(x, y, p.x, p.y) < AURA_R) return true;
  for (const L of e.lanterns) if (L.lit > 0 && dist(x, y, L.x, L.y) < lampRadius(L)) return true;
  for (const g of e.glows) if (dist(x, y, g.x, g.y) < g.r * clamp(g.t / 1.5, 0.3, 1)) return true;
  return false;
}

function lightLantern(L, e) {
  const was = L.lit > 0;
  L.lit = p2(e) ? LIT_TIME * 0.7 : LIT_TIME;
  if (!was) {
    ring(L.x, L.y, { r0: 6, r1: 90, color: WARM, life: 0.4, width: 4 });
    burst(L.x, L.y - 14, { count: 12, color: WARM, speed: 160, size: 3.5, life: 0.5, gravity: -60, drag: 3 });
    sfx.chime();
  }
}

function snuffLantern(L) {
  if (L.lit <= 0) return;
  L.lit = 0;
  burst(L.x, L.y - 14, { count: 10, color: '#8a8a9a', speed: 90, size: 4, life: 0.8, gravity: -40, drag: 2 });
}

/** Your blows and bullets light the lanterns they touch. */
function lanternHits(e) {
  for (const L of e.lanterns) {
    let hit = false;
    for (const pr of world.projectiles) {
      if (!pr.friendly || pr.cleared) continue;
      if (dist(pr.x, pr.y, L.x, L.y) < (pr.r || 6) + 16) { hit = true; break; }
    }
    if (!hit) {
      for (const h of world.hitboxes) {
        if (h.shape === 'arc') hit = circleArc(L.x, L.y, 16, h.x, h.y, h.angle, h.arc, h.radius);
        else if (h.shape === 'rect') hit = circleOrientedRect(L.x, L.y, 16, h.x, h.y, h.angle, h.len, h.wid);
        else hit = dist(h.x, h.y, L.x, L.y) < (h.radius || 0) + 16;
        if (hit) break;
      }
    }
    if (hit) lightLantern(L, e);
  }
}

/** In the dark, her veil turns your blows aside. */
function veilFn(e, opts) {
  if (isLit(e, e.x, e.y)) return 1;
  const now = world.runTime;
  if ((e.unseenSay || -9) < now - 0.6) {
    e.unseenSay = now;
    damageText(e.x, e.y - e.r - 14, 'UNSEEN', { color: '#8a9ac8', size: 13 });
  }
  if (opts && opts.source !== 'dash') burst(e.x, e.y, { count: 3, color: '#8a9ac8', speed: 120, size: 3, life: 0.3, drag: 5 });
  return 0.2;
}

// --- the mirror copies -------------------------------------------------------------

// Each copy is her reflection: across the vertical centre line ('h'), the
// horizontal one ('v'), or the centre point ('p'). Its bullets mirror hers.
function mirrorPos(e, m) {
  const c = center();
  if (m === 'h') return [2 * c.x - e.x, e.y];
  if (m === 'v') return [e.x, 2 * c.y - e.y];
  return [2 * c.x - e.x, 2 * c.y - e.y];
}
function mirrorAngle(a, m) {
  if (m === 'h') return PI - a;
  if (m === 'v') return -a;
  return a + PI;
}

function shatter(c) {
  if (c.dead) return 0;
  c.dead = true;
  const e = c.summoner;
  const p = world.player;
  const gap = p ? angleTo(c.x, c.y, p.x, p.y) : 0;
  if (e && !e.dead) {
    for (let k = 0; k < 10; k++) {
      const a = gap + 0.45 + (k / 10) * (TAU - 0.9);
      shot(e, a, 170, { x: c.x, y: c.y, off: 10, shape: 'shard', r: 6, color: GLASS, dmg: 0.4, life: 3.5 });
    }
    e.reformT = 5;
  }
  burst(c.x, c.y, { count: 22, color: GLASS, speed: 260, size: 4, life: 0.5, drag: 4, shape: 'shard' });
  damageText(c.x, c.y - 30, 'A REFLECTION', { color: GLASS, size: 13 });
  sfx.block();
  return 0;
}

function makeCopy(e, m) {
  const [x, y] = mirrorPos(e, m);
  const c = spawnEnemyFn('bridecopy', x, y, { instant: true, summoner: e, color: PALE });
  if (!c) return;
  c.mirror = m;
  c.guardFn = shatter;
  c.face = mirrorAngle(e.face || 0, m);
  e.copies.push(c);
  ring(x, y, { r0: 4, r1: 70, color: GLASS, life: 0.4, width: 4 });
  burst(x, y, { count: 14, color: GLASS, speed: 200, size: 3.5, life: 0.4, drag: 4, shape: 'shard' });
}

function liveCopies(e) { return e.copies.filter((c) => !c.dead); }

/** Fire from her, and mirrored from every reflection. */
function bshot(e, a, speed, o = {}) {
  shot(e, a, speed, o);
  for (const c of liveCopies(e)) shot(e, mirrorAngle(a, c.mirror), speed, { ...o, x: c.x, y: c.y });
}

function petal(e, a, speed, dmg = 0.42) {
  bshot(e, a, speed, { shape: 'orb', r: 7, color: p2(e) ? '#ff9ab0' : PETAL, dmg, life: 5 });
}

function coldHand(e, x, y, delay = 0.7) {
  blastAt(e, x, y, 56, delay, 0.7, ICE, {
    onDetonate: (h) => burst(h.x, h.y, { count: 10, color: ICE, speed: 120, size: 4, life: 0.5, gravity: -120, drag: 2 }),
  });
}

function teleportAway(e, p, dMin = 260) {
  const b = arenaBounds();
  let best = null, bestS = -1;
  for (let k = 0; k < 10; k++) {
    const x = rand(b.l + 60, b.r - 60), y = rand(b.t + 60, b.b - 60);
    const d = dist(x, y, p.x, p.y);
    if (d < dMin) continue;
    const s = (isLit(e, x, y) ? 0 : 200) - Math.abs(d - 320);
    if (s > bestS) { bestS = s; best = [x, y]; }
  }
  if (!best) return;
  burst(e.x, e.y, { count: 16, color: PALE, speed: 180, size: 4, life: 0.5, drag: 3 });
  e.x = best[0]; e.y = best[1];
  ring(e.x, e.y, { r0: 40, r1: 4, color: PALE, life: 0.35, width: 3 });
}

// --- the moveset --------------------------------------------------------------------

export const BRIDE = {
  phases: [0.5],
  phaseTime: 3.0,
  roarPitch: 1.5,
  opening: { veil: 16, mirror: 8, snuff: 10, chandelier: 3, tearfall: 99, hex: 99, march: 99, requiem: 99 },

  /** An open ballroom: nothing to hide behind, only lanterns to light. */
  arena() { return []; },

  init(e) {
    const b = arenaBounds();
    const c = center();
    e.lanterns = [];
    for (const fx of [-0.36, 0, 0.36]) for (const fy of [-0.3, 0.3]) {
      e.lanterns.push({ x: c.x + fx * (b.r - b.l), y: c.y + fy * (b.b - b.t), lit: 0 });
    }
    e.glows = [];
    e.copies = [];
    e.copyT = 0;
    e.reformT = 0;
    e.petalT = 1.5;
    e.face = PI / 2;
    e.guardFn = veilFn;
    e.float = 0;
    const base = e.onDeath;
    e.onDeath = (self) => {
      if (base) base(self);
      const p = world.player;
      if (p) { p.silencedUntil = 0; p.hex = null; }
    };
  },

  tick(e, dt, p) {
    e.touchCd = Math.max(0, (e.touchCd || 0) - dt);
    e.float += dt;
    if (e.exposed > 0 && e.action !== 'exposed') e.exposed = Math.max(0, e.exposed - dt);
    if (e.ppx !== undefined && dt > 0) {
      const vx = (p.x - e.ppx) / dt, vy = (p.y - e.ppy) / dt;
      if (Math.hypot(vx, vy) < 420) { const k = 1 - Math.exp(-8 * dt); PV.x = lerp(PV.x, vx, k); PV.y = lerp(PV.y, vy, k); }
    }
    e.ppx = p.x; e.ppy = p.y;
    const d = dist(e.x, e.y, p.x, p.y);
    e.hug = d < e.r + 110 ? (e.hug || 0) + dt : Math.max(0, (e.hug || 0) - dt * 2);
    e.far = d > 380 ? (e.far || 0) + dt : Math.max(0, (e.far || 0) - dt * 2);

    // Light.
    for (const L of e.lanterns) L.lit = Math.max(0, L.lit - dt);
    for (const g of e.glows) g.t -= dt;
    e.glows = e.glows.filter((g) => g.t > 0);
    lanternHits(e);
    e.lit = isLit(e, e.x, e.y);
    touch(e, 0.45);

    // The reflections follow her; in phase 1 they fade after a while, in
    // phase 2 a shattered one re-forms.
    e.copies = e.copies.filter((c) => !c.dead);
    for (const c of e.copies) {
      [c.x, c.y] = mirrorPos(e, c.mirror);
      c.face = mirrorAngle(e.face || 0, c.mirror);
    }
    if (!p2(e) && e.copies.length && (e.copyT -= dt) <= 0) {
      for (const c of e.copies) { c.dead = true; burst(c.x, c.y, { count: 10, color: GLASS, speed: 120, size: 3, life: 0.4, drag: 4 }); }
      e.copies = [];
    }
    if (p2(e) && e.action !== 'phase' && e.copies.length < 2 && (e.reformT -= dt) <= 0) {
      const have = new Set(e.copies.map((c) => c.mirror));
      for (const m of ['h', 'v']) if (!have.has(m)) makeCopy(e, m);
      sfx.chime();
    }
  },

  idle(e, dt, p) {
    const d = dist(e.x, e.y, p.x, p.y);
    const a = angleTo(e.x, e.y, p.x, p.y);
    turnToward(e, a, 4 * dt);
    const sp = e.speed * (p2(e) ? 1.15 : 1);
    if (d > 330) forward(e, sp, dt, a);
    else if (d < 220) forward(e, -sp * 0.8, dt, a);
    forward(e, sp * 0.6, dt, a + (PI / 2) * e.sign);
    if (Math.random() < dt * 0.35) e.sign *= -1;
    [e.x, e.y] = inArena(e.x, e.y, e.r + 14);
    // She never stops weeping petals at you.
    if ((e.petalT -= dt) <= 0) {
      e.petalT = p2(e) ? 1.0 : 0.95;
      const la = leadAt(e.x, e.y, p, 230, 0.7);
      for (const k of [-0.2, 0, 0.2]) petal(e, la + k, 230, 0.38);
    }
  },

  choose(e, p, d) {
    const litLamps = e.lanterns.filter((L) => L.lit > 0).length;
    const pool = [['petals', 2.6], ['hands', 2.6], ['chandelier', 2], ['wail', d < 330 ? 3 : 1]];
    pool.push(['lunge', e.far > 0.8 || d > 300 ? 3.5 : 1]);
    if (e.hug > 0.5) pool.push(['embrace', 9]);
    if (litLamps >= 2) pool.push(['snuff', 1 + litLamps * 0.6]);
    if (!p2(e)) pool.push(['mirror', e.copies.length ? 0 : 2.6], ['veil', 3]);
    else {
      pool.push(['tearfall', 2.4], ['march', 2.4], ['requiem', 3.6]);
      if (p.spells && p.spells.some(Boolean) && !(p.hex && p.hex.until > world.runTime)) pool.push(['hex', 2]);
    }
    return pool;
  },

  // --- phase 2: THE HOLLOW MIRROR ---------------------------------------------------
  onPhase(e) {
    e.marks = {};
    say(e, 'Why won’t you stay with me?', BLOOD);
  },
  phaseAnim(e, dt, p, k) {
    const once = (key, at, fn) => { if (k >= at && !e.marks[key]) { e.marks[key] = true; fn(); } };
    e.face += dt * 3;
    if (Math.random() < dt * 24) {
      const a = rand(0, TAU);
      burst(e.x + Math.cos(a) * 30, e.y + Math.sin(a) * 30, { count: 1, color: k < 0.5 ? GLASS : BLOOD, speed: 200, size: 4, life: 0.6, dir: a, spread: 0.3, drag: 1.5, shape: 'shard' });
    }
    once('snuff', 0.35, () => {
      for (const L of e.lanterns) snuffLantern(L);
      e.glows = [];
      ring(e.x, e.y, { r0: 10, r1: 600, color: GLASS, life: 0.8, width: 6 });
      shake(0.6);
      sfx.explode();
    });
    once('copies', 0.8, () => {
      for (const c of e.copies) c.dead = true;
      e.copies = [];
      makeCopy(e, 'h');
      makeCopy(e, 'v');
      flash(0.25, BLOOD);
    });
  },
  afterPhase(e) {
    Object.assign(e.cool, { tearfall: 2, march: 4, hex: 6, requiem: 12 });
  },

  moves: {
    // 1. Veil Petals: she lifts her dead bouquet — three fans of petals.
    petals: {
      cooldown: 3.5,
      start(e) { e.left = 3; sfx.telegraph(); sub(e, 'lift', p2(e) ? 0.32 : 0.4); },
      update(e, dt, p) {
        e.face = angleTo(e.x, e.y, p.x, p.y);
        if (e.t > 0) return;
        const a = leadAt(e.x, e.y, p, 240, 0.6);
        const n = p2(e) ? 7 : 6;
        for (let k = 0; k < n; k++) petal(e, a + (k / (n - 1) - 0.5) * 0.95, 240);
        sfx.swing(1.4);
        e.left--;
        if (e.left > 0) e.t = 0.36; else idle(e, 0.3);
      },
    },

    // 2. Cold Hands: hands reach up out of the floor where you stand — one
    //    after another. Keep moving.
    hands: {
      cooldown: 6,
      start(e) { e.left = p2(e) ? 6 : 5; say(e, 'Stay…', ICE); sub(e, 'reach', 0.25); },
      update(e, dt, p) {
        if (e.t > 0) return;
        const lead = p2(e) ? 0.35 : 0.28;
        coldHand(e, p.x + PV.x * lead, p.y + PV.y * lead, 0.7);
        sfx.hiss();
        e.left--;
        if (e.left > 0) e.t = 0.3; else idle(e, 0.3);
      },
    },

    // 3. Wail: the red cone of her scream (from every reflection too). Caught
    //    in it: hurt, pushed back, and SILENCED — no spells for 3 s.
    wail: {
      cooldown: 7,
      start(e, p) {
        e.face = angleTo(e.x, e.y, p.x, p.y);
        const T = p2(e) ? 0.55 : 0.6;
        e.wails = [{ src: e, a: e.face }, ...liveCopies(e).map((c) => ({ src: c, a: mirrorAngle(e.face, c.mirror) }))];
        for (const w of e.wails) spawnHazard({ kind: 'cone', x: w.src.x, y: w.src.y, angle: w.a, arc: 1.2, r: 320, delay: T, color: '#ff5e6e', owner: e, follow: w.src });
        sfx.telegraph();
        sub(e, 'draw', T);
      },
      update(e, dt, p) {
        if (e.t > 0) return;
        for (const w of e.wails) {
          const d = dist(w.src.x, w.src.y, p.x, p.y);
          if (d < 320 + p.r * 0.5 && Math.abs(angleDiff(w.a, angleTo(w.src.x, w.src.y, p.x, p.y))) < 0.65) {
            if (damagePlayer(Math.round(e.damage * 0.8), w.src.x, w.src.y, e.type)) {
              p.silencedUntil = world.runTime + 3;
              p.vx = (p.vx || 0) + Math.cos(w.a) * 380; p.vy = (p.vy || 0) + Math.sin(w.a) * 380;
              damageText(p.x, p.y - p.r - 20, 'SILENCED', { color: HEX, size: 15 });
            }
          }
          for (let k = 0; k < 3; k++) ring(w.src.x + Math.cos(w.a) * (60 + k * 80), w.src.y + Math.sin(w.a) * (60 + k * 80), { r0: 10, r1: 40 + k * 20, color: PALE, life: 0.35, width: 3 });
        }
        shake(0.35);
        sfx.roar(1.8);
        idle(e, 0.45);
      },
    },

    // 4. Lantern Snuff: she draws a breath — then a cold gust rolls out and
    //    blows out every lantern it passes.
    snuff: {
      cooldown: 12,
      start(e) { say(e, 'Hush…', PALE); sub(e, 'inhale', 0.75); },
      update(e, dt) {
        if (e.sub === 'inhale') {
          if (Math.random() < dt * 30) {
            const a = rand(0, TAU);
            burst(e.x + Math.cos(a) * 160, e.y + Math.sin(a) * 160, { count: 1, color: PALE, speed: 240, size: 3, life: 0.6, dir: a + PI, spread: 0.1, drag: 0.5 });
          }
          if (e.t <= 0) {
            shockwave(e, { speed: 300, dmg: 0.5, color: PALE });
            e.gust = { x: e.x, y: e.y, r: 0 };
            sfx.whirr();
            sub(e, 'gust', 2.2);
          }
          return;
        }
        e.gust.r += 300 * dt;
        for (const L of e.lanterns) if (dist(L.x, L.y, e.gust.x, e.gust.y) < e.gust.r) snuffLantern(L);
        for (const g of e.glows) if (dist(g.x, g.y, e.gust.x, e.gust.y) < e.gust.r) g.t = Math.min(g.t, 0.3);
        if (e.t <= 0) idle(e, 0.3);
      },
    },

    // 5. Chandelier: she possesses a chandelier above you — its shadow
    //    grows — it crashes, flinging crystal. What's left of it still burns:
    //    light, for a while.
    chandelier: {
      cooldown: 7,
      start(e, p) {
        const T = p2(e) ? 0.85 : 0.9;
        const [x, y] = inArena(p.x + PV.x * 0.3, p.y + PV.y * 0.3, 60);
        blastAt(e, x, y, 92, T, 1.0, WARM, {
          shards: { n: 12, speed: 190, color: GLASS, r: 6 }, shardShape: 'shard', shardDamage: Math.round(e.damage * 0.4),
          onDetonate: (h) => { e.glows.push({ x: h.x, y: h.y, r: 170, t: 7 }); shake(0.45); },
        });
        say(e, 'Dance with me!', WARM);
        sfx.telegraph();
        sub(e, 'point', T);
      },
      update(e, dt, p) {
        e.face = angleTo(e.x, e.y, p.x, p.y);
        if (e.t <= 0) idle(e, 0.35);
      },
    },

    // 6. Mirror Copies: she splits into her reflections for a while. Only
    //    she has a shadow — and only she shows in the mirrors.
    mirror: {
      cooldown: 16,
      start(e) { say(e, 'Which of us is real?', GLASS); sfx.chime(); sub(e, 'split', 0.6); },
      update(e) {
        if (e.t > 0) return;
        for (const c of e.copies) c.dead = true;
        e.copies = [];
        makeCopy(e, 'h');
        makeCopy(e, 'v');
        e.copyT = 11;
        flash(0.15, GLASS);
        idle(e, 0.4);
      },
    },

    // 7. Grasping Veil: keep away and she flies at you down a shown lane —
    //    twice in phase 2.
    lunge: {
      cooldown: 5,
      start(e, p) { e.left = p2(e) ? 2 : 1; aimLunge(e, p, p2(e) ? 0.44 : 0.5); },
      update(e, dt, p) {
        if (e.sub === 'wind') { if (e.t <= 0) { e.lungeD = 0; sub(e, 'go', 1); sfx.dash(); } return; }
        if (e.sub === 'go') {
          touch(e, 0.85);
          const step = 950 * dt;
          e.x += Math.cos(e.aim) * step; e.y += Math.sin(e.aim) * step;
          e.lungeD += step;
          const [cx, cy] = inArena(e.x, e.y, e.r + 4);
          const wall = cx !== e.x || cy !== e.y;
          e.x = cx; e.y = cy;
          if (Math.random() < 0.6) burst(e.x, e.y, { count: 1, color: PALE, speed: 40, size: 5, life: 0.4, drag: 2 });
          if (e.lungeD >= 440 || wall) {
            e.left--;
            if (e.left > 0) aimLunge(e, p, 0.36);
            else sub(e, 'rest', 0.35);
          }
          return;
        }
        if (e.t <= 0) idle(e, 0.3);
      },
    },

    // 8. Embrace: hold her close and she holds you back — a cold ring around
    //    her, then she's gone, somewhere dark.
    embrace: {
      cooldown: 5,
      start(e) {
        blastAt(e, e.x, e.y, 130, p2(e) ? 0.42 : 0.5, 0.9, ICE, { follow: e });
        say(e, 'Hold me…', ICE);
        sfx.telegraph();
        sub(e, 'hold', p2(e) ? 0.42 : 0.5);
      },
      update(e, dt, p) {
        if (e.sub === 'hold') { if (e.t <= 0) { e.hug = 0; sub(e, 'fade', 0.25); } return; }
        if (e.t <= 0) { teleportAway(e, p); idle(e, 0.4); }
      },
    },

    // 9. VEIL DANCE (barrage): she waltzes in the middle of the ballroom;
    //    three arms of petals turn around her, and rings of petals roll out
    //    with a gap. Then she's spent.
    veil: {
      cooldown: 26,
      start(e) {
        const c = center();
        e.vd = { x: c.x, y: c.y, a: rand(0, TAU), v: 0, ring: 1.0 };
        say(e, 'One last dance…', PETAL);
        sub(e, 'walk', 1.0);
      },
      update(e, dt, p) {
        const V = e.vd;
        if (e.sub === 'walk') {
          const d = dist(e.x, e.y, V.x, V.y);
          if (d > 8) forward(e, Math.min(420, d / dt), dt, angleTo(e.x, e.y, V.x, V.y));
          if (d <= 8 || e.t <= 0) { sfx.chime(); sub(e, 'dance', 5.0); }
          return;
        }
        e.face += dt * 5;
        V.a += 1.05 * dt;
        if ((V.v -= dt) <= 0) {
          V.v = 0.14;
          for (let k = 0; k < 3; k++) shot(e, V.a + (k / 3) * TAU, 160, { shape: 'orb', r: 7, color: PETAL, dmg: 0.4, life: 6 });
        }
        if ((V.ring -= dt) <= 0) {
          V.ring = 1.25;
          const gap = angleTo(e.x, e.y, p.x, p.y) + rand(-0.4, 0.4);
          for (let k = 0; k < 18; k++) { const a = (k / 18) * TAU; if (Math.abs(angleDiff(gap, a)) < 0.45) continue; shot(e, a, 130, { shape: 'orb', r: 6, color: '#e0c0ff', dmg: 0.35, life: 7 }); }
        }
        if (e.t <= 0) expose(e, 1.6);
      },
    },

    // --- phase 2 ------------------------------------------------------------------------

    // 10. Tearfall: she weeps, and the ceiling weeps with her — small marked
    //     tears everywhere, the big ones on you.
    tearfall: {
      cooldown: 10,
      start(e) { e.tf = { small: 0, big: 0.4 }; say(e, 'Weep with me.', ICE); sub(e, 'weep', 3.4); },
      update(e, dt, p) {
        BRIDE.idleMove(e, dt, p);
        const T = e.tf;
        if ((T.small -= dt) <= 0) {
          T.small = 0.085;
          const near = Math.random() < 0.45;
          const a = rand(0, TAU), r = near ? rand(20, 130) : rand(100, 320);
          blastAt(e, p.x + Math.cos(a) * r, p.y + Math.sin(a) * r, 34, 0.8, 0.45, ICE);
        }
        if ((T.big -= dt) <= 0) {
          T.big = 0.8;
          blastAt(e, p.x + PV.x * 0.3, p.y + PV.y * 0.3, 70, 0.9, 0.7, BLOOD);
        }
        if (e.t <= 0) idle(e, 0.4);
      },
    },

    // 11. HEX: a violet thread reaches for you down a lane. If it catches you,
    //     she possesses one of your spells for 10 s: cast it and it turns on
    //     you (its button shows her face).
    hex: {
      cooldown: 20,
      start(e, p) {
        e.aim = angleTo(e.x, e.y, p.x, p.y);
        e.face = e.aim;
        lane(e, 0.7, 640, 64, HEX);
        say(e, 'Give me something of yours…', HEX);
        sfx.telegraph();
        sub(e, 'reach', 0.7);
      },
      update(e, dt, p) {
        if (e.t > 0) return;
        const c = Math.cos(e.aim), s = Math.sin(e.aim);
        const dx = p.x - e.x, dy = p.y - e.y;
        const along = dx * c + dy * s, across = Math.abs(-dx * s + dy * c);
        for (let k = 0; k < 14; k++) burst(e.x + c * k * 45, e.y + s * k * 45, { count: 1, color: HEX, speed: 60, size: 4, life: 0.4, drag: 3 });
        if (along > 0 && along < 640 && across < 32 + p.r * 0.5 && !(p.invuln > 0)) {
          const owned = p.spells.filter(Boolean);
          const id = owned[(Math.random() * owned.length) | 0];
          const sp = spellById(id);
          p.hex = {
            id, until: world.runTime + 10,
            onCast: (pl) => {
              damagePlayer(Math.round(e.damage * 0.9), null, null, 'hex');
              damageText(pl.x, pl.y - pl.r - 22, 'HEXED!', { color: HEX, size: 16 });
              burst(pl.x, pl.y, { count: 18, color: HEX, speed: 220, size: 4, life: 0.5, drag: 3 });
            },
          };
          damageText(p.x, p.y - p.r - 22, `${sp ? sp.name : 'A spell'} is hers`, { color: HEX, size: 15 });
          sfx.roar(1.7);
        }
        idle(e, 0.4);
      },
    },

    // 12. Wedding March: she glides at you, setting candles down her aisle.
    //     Behind her, they burst — one after another, first to last.
    march: {
      cooldown: 11,
      start(e, p) {
        e.aim = angleTo(e.x, e.y, p.x, p.y);
        e.candleT = 0;
        e.candles = 0;
        say(e, 'Walk with me…', WARM);
        sub(e, 'walk', 1.5);
      },
      update(e, dt, p) {
        turnToward(e, angleTo(e.x, e.y, p.x, p.y), 1.6 * dt);
        e.aim = e.face;
        forward(e, 320, dt, e.face);
        [e.x, e.y] = inArena(e.x, e.y, e.r + 10);
        touch(e, 0.7);
        if ((e.candleT -= dt) <= 0) {
          e.candleT = 0.1;
          blastAt(e, e.x, e.y, 52, 1.2 + e.candles * 0.06 + e.t, 0.6, WARM);
          e.candles++;
        }
        if (e.t <= 0) idle(e, 0.4);
      },
    },

    // 13. REQUIEM (barrage): she rises in the middle, her reflections at the
    //     mirrored points; all of them spin arms of petals — a kaleidoscope —
    //     while hands keep reaching up under you. Then she's spent.
    requiem: {
      cooldown: 28,
      start(e) {
        const c = center();
        e.rq = { x: c.x, y: c.y - 60, a: rand(0, TAU), v: 0, hand: 1.2 };
        for (const L of e.lanterns) snuffLantern(L);
        say(e, 'Requiem…', BLOOD);
        sfx.roar(1.4);
        sub(e, 'walk', 1.0);
      },
      update(e, dt, p) {
        const R = e.rq;
        if (e.sub === 'walk') {
          const d = dist(e.x, e.y, R.x, R.y);
          if (d > 8) forward(e, Math.min(420, d / dt), dt, angleTo(e.x, e.y, R.x, R.y));
          if (d <= 8 || e.t <= 0) { sfx.chime(); sub(e, 'sing', 5.5); }
          return;
        }
        e.face += dt * 3;
        R.a += 1.1 * dt;
        if ((R.v -= dt) <= 0) {
          R.v = 0.17;
          for (const off of [0, PI]) petal(e, R.a + off, 160, 0.4);
        }
        if ((R.hand -= dt) <= 0) { R.hand = 1.1; coldHand(e, p.x + PV.x * 0.2, p.y + PV.y * 0.2, 0.72); }
        if (e.t <= 0) expose(e, 2.0);
      },
    },
  },

  /** Her drift, without the petals (for moves she makes on the move). */
  idleMove(e, dt, p) {
    const d = dist(e.x, e.y, p.x, p.y);
    const a = angleTo(e.x, e.y, p.x, p.y);
    turnToward(e, a, 4 * dt);
    if (d > 330) forward(e, e.speed, dt, a);
    else if (d < 220) forward(e, -e.speed * 0.8, dt, a);
    forward(e, e.speed * 0.5, dt, a + (PI / 2) * e.sign);
    [e.x, e.y] = inArena(e.x, e.y, e.r + 14);
  },

  // --- drawing ------------------------------------------------------------------------

  draw(e, ctx) {
    const t = world.runTime;
    // The real one's shadow: darker than the engine's, so it reads in the dark.
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.9, e.r * 0.95, e.r * 0.38, 0, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    const alpha = e.lit || e.action === 'phase' || e.exposed > 0 ? 1 : 0.42;
    drawBride(ctx, e.x, e.y - 6 + Math.sin(e.float * 2.2) * 3, e.face || 0, e.r, t, alpha, p2(e), false, e);
    for (const c of e.copies) {
      if (c.dead) continue;
      drawBride(ctx, c.x, c.y - 6 + Math.sin(e.float * 2.2) * 3, c.face || 0, e.r, t, alpha * 0.9, p2(e), true, e);
    }
  },

  drawExtras(e, ctx, t) {
    const p = world.player;
    if (e.exposed > 0) {
      ctx.globalAlpha = 0.5 + Math.sin(t * 10) * 0.25;
      ctx.strokeStyle = '#ffe27a';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 12, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // Silenced / hexed: a violet mark over you.
    if (p && ((p.silencedUntil || 0) > world.runTime || (p.hex && p.hex.until > world.runTime))) {
      ctx.globalAlpha = 0.6 + Math.sin(t * 8) * 0.25;
      ctx.strokeStyle = HEX;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(p.x, p.y - p.r - 16, 7, 0, TAU); ctx.stroke();
      if ((p.silencedUntil || 0) > world.runTime) {
        ctx.beginPath(); ctx.moveTo(p.x - 5, p.y - p.r - 21); ctx.lineTo(p.x + 5, p.y - p.r - 11); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (e.action === 'phase') {
      const k = clamp(1 - e.t / (e.phaseT || 1), 0, 1);
      const b = arenaBounds();
      ctx.globalAlpha = Math.sin(k * PI);
      ctx.fillStyle = BLOOD;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 48px "Segoe UI", Roboto, system-ui, sans-serif';
      ctx.fillText('THE HOLLOW MIRROR', (b.l + b.r) / 2, b.t + arena.h * 0.28);
      ctx.globalAlpha = 1;
    }
  },

  /** A dark ballroom: marble, mirrors on the far wall, lanterns, and the dark. */
  drawArena(ctx, room, t) {
    const e = world.enemies.find((q) => q.type === 'bride' && !q.dead);
    const b = arenaBounds();
    const w = b.r - b.l, h = b.b - b.t;
    // Marble checks.
    ctx.fillStyle = 'rgba(200,210,255,0.035)';
    const s = 64;
    for (let y = b.t, j = 0; y < b.b; y += s, j++) {
      for (let x = b.l + (j % 2) * s; x < b.r; x += s * 2) ctx.fillRect(x, y, s, s);
    }
    // Mirrors on the far wall: only the real Bride shows in them.
    for (const fx of [-0.18, 0.18]) {
      const mx = (b.l + b.r) / 2 + fx * w - 42, my = b.t + 8, mw = 84, mh = 50;
      ctx.fillStyle = '#10141f';
      ctx.fillRect(mx, my, mw, mh);
      const g = ctx.createLinearGradient(mx, my, mx + mw, my + mh);
      g.addColorStop(0, 'rgba(180,200,255,0.18)');
      g.addColorStop(0.5, 'rgba(180,200,255,0.04)');
      g.addColorStop(1, 'rgba(180,200,255,0.14)');
      ctx.fillStyle = g;
      ctx.fillRect(mx, my, mw, mh);
      ctx.strokeStyle = '#b8a060';
      ctx.lineWidth = 3;
      ctx.strokeRect(mx, my, mw, mh);
      if (e && e.phase >= 2) {
        ctx.strokeStyle = 'rgba(220,230,255,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(mx + mw * 0.3, my); ctx.lineTo(mx + mw * 0.55, my + mh * 0.5); ctx.lineTo(mx + mw * 0.4, my + mh); ctx.moveTo(mx + mw * 0.55, my + mh * 0.5); ctx.lineTo(mx + mw, my + mh * 0.35); ctx.stroke();
      }
      if (e) {
        const rx = mx + clamp((e.x - b.l) / w, 0, 1) * mw;
        const ry = my + 8 + clamp((e.y - b.t) / h, 0, 1) * (mh - 16);
        ctx.fillStyle = e.phase >= 2 ? '#ff9ab0' : PALE;
        ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.ellipse(rx, ry, 4, 6, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
    if (!e) return;
    // The dark, with holes of light (drawn small and scaled up: soft edges).
    const dk = darkness(e, b, t);
    ctx.drawImage(dk, b.l, b.t, w, h);
    // Warm light where it burns: lanterns and fallen chandeliers.
    ctx.globalCompositeOperation = 'lighter';
    const warm = (x, y, r, k) => {
      const g2 = ctx.createRadialGradient(x, y, 4, x, y, r);
      g2.addColorStop(0, `rgba(255,190,110,${0.22 * k})`);
      g2.addColorStop(0.6, `rgba(255,170,90,${0.08 * k})`);
      g2.addColorStop(1, 'rgba(255,170,90,0)');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    };
    for (const L of e.lanterns) if (L.lit > 0) warm(L.x, L.y - 10, lampRadius(L), 0.9 + Math.sin(t * 11 + L.x) * 0.1);
    for (const g2 of e.glows) warm(g2.x, g2.y, g2.r * clamp(g2.t / 1.5, 0.3, 1), 1);
    ctx.globalCompositeOperation = 'source-over';
    // The edge of your own small light.
    const pl = world.player;
    if (pl) {
      ctx.strokeStyle = 'rgba(190,210,255,0.12)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(pl.x, pl.y, AURA_R, 0, TAU); ctx.stroke();
    }
    // Lanterns on their stands.
    for (const L of e.lanterns) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath(); ctx.ellipse(L.x, L.y + 10, 12, 5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3a3240';
      ctx.fillRect(L.x - 2, L.y - 14, 4, 24);
      ctx.fillStyle = L.lit > 0 ? '#ffe2a8' : '#4a4458';
      ctx.strokeStyle = '#b8a060';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.rect(L.x - 8, L.y - 30, 16, 18); ctx.fill(); ctx.stroke();
      if (L.lit > 0) {
        const fl = 0.8 + Math.sin(t * 13 + L.x) * 0.2;
        ctx.fillStyle = WARM;
        ctx.globalAlpha = fl;
        ctx.beginPath(); ctx.ellipse(L.x, L.y - 22, 3.5, 6, 0, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
      } else if (Math.sin(t * 3 + L.y) > 0.92) {
        // An unlit lantern glints now and then: strike me.
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(L.x + 5, L.y - 26, 2, 0, TAU); ctx.fill();
      }
    }
  },
};

function aimLunge(e, p, t) {
  e.aim = leadAt(e.x, e.y, p, 950, 0.4);
  e.face = e.aim;
  lane(e, t, 440, 2 * (e.r + 14), PALE);
  sfx.telegraph();
  sub(e, 'wind', t);
}

// --- art --------------------------------------------------------------------------

let darkCanvas = null;
function darkness(e, b, t) {
  const W = 160, H = Math.max(40, Math.round(160 * (b.b - b.t) / (b.r - b.l)));
  if (!darkCanvas) darkCanvas = document.createElement('canvas');
  if (darkCanvas.width !== W || darkCanvas.height !== H) { darkCanvas.width = W; darkCanvas.height = H; }
  const c = darkCanvas.getContext('2d');
  const sx = W / (b.r - b.l), sy = H / (b.b - b.t);
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, W, H);
  c.fillStyle = e.phase >= 2 ? 'rgba(10,2,8,0.86)' : 'rgba(4,4,14,0.82)';
  c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = 'destination-out';
  const hole = (x, y, r) => {
    const g = c.createRadialGradient((x - b.l) * sx, (y - b.t) * sy, 0, (x - b.l) * sx, (y - b.t) * sy, r * sx);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.65, 'rgba(0,0,0,0.85)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.beginPath(); c.arc((x - b.l) * sx, (y - b.t) * sy, r * sx, 0, TAU); c.fill();
  };
  const p = world.player;
  if (p) hole(p.x, p.y, AURA_R * 1.1);
  for (const L of e.lanterns) if (L.lit > 0) hole(L.x, L.y, lampRadius(L) * (1 + Math.sin(t * 9 + L.x) * 0.02));
  for (const g of e.glows) hole(g.x, g.y, g.r * clamp(g.t / 1.5, 0.3, 1));
  c.globalCompositeOperation = 'source-over';
  return darkCanvas;
}

/** A ghost bride from above: a long veil trailing, a pale gown, reaching hands. */
function drawBride(ctx, x, y, face, r, t, alpha, bloody, mirrored, e) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(face);
  if (mirrored) ctx.scale(1, -1);
  ctx.globalAlpha = alpha;
  // Cold glow.
  const g = ctx.createRadialGradient(0, 0, 4, 0, 0, r * 2.4);
  g.addColorStop(0, bloody ? 'rgba(255,120,150,0.3)' : 'rgba(200,225,255,0.3)');
  g.addColorStop(1, 'rgba(200,225,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r * 2.4, 0, TAU); ctx.fill();
  // The veil, streaming behind.
  const w1 = Math.sin(t * 3.1) * r * 0.25, w2 = Math.sin(t * 2.3 + 1) * r * 0.3;
  ctx.fillStyle = bloody ? 'rgba(90,20,40,0.75)' : 'rgba(235,242,255,0.55)';
  ctx.beginPath();
  ctx.moveTo(r * 0.2, -r * 0.7);
  ctx.bezierCurveTo(-r * 1.2, -r * 1.2 + w1, -r * 2.2, -r * 0.4 + w2, -r * 2.9, w1);
  ctx.bezierCurveTo(-r * 2.2, r * 0.4 + w2, -r * 1.2, r * 1.2 + w1, r * 0.2, r * 0.7);
  ctx.closePath();
  ctx.fill();
  // Lace edge.
  ctx.strokeStyle = bloody ? '#ff9ab0' : '#ffffff';
  ctx.globalAlpha = alpha * 0.6;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.globalAlpha = alpha;
  // The gown.
  const gown = e.flash > 0 && !mirrored ? '#ffffff' : bloody ? '#4a1424' : '#eef2fb';
  ctx.fillStyle = gown;
  ctx.beginPath(); ctx.ellipse(-r * 0.1, 0, r * 0.95, r * 0.85, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = bloody ? '#c8304a' : '#b8c4e0';
  ctx.lineWidth = 2;
  ctx.stroke();
  // Reaching arms and hands (longer while she attacks).
  const reach = e.action && e.action !== 'idle' && e.action !== 'exposed' ? 1.25 : 0.8;
  ctx.strokeStyle = bloody ? '#d8a0b0' : '#dfe8f8';
  ctx.lineWidth = r * 0.16;
  ctx.lineCap = 'round';
  for (const sd of [-1, 1]) {
    const hw = Math.sin(t * 4 + sd) * r * 0.1;
    ctx.beginPath(); ctx.moveTo(r * 0.1, sd * r * 0.55); ctx.quadraticCurveTo(r * 0.8, sd * r * 0.7, r * (0.9 + reach * 0.5), sd * r * 0.3 + hw); ctx.stroke();
  }
  ctx.lineCap = 'butt';
  // A dead bouquet at her chest.
  ctx.fillStyle = bloody ? BLOOD : '#8a6a9a';
  for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(r * 0.55 + Math.cos(k * 1.6) * 4, Math.sin(k * 1.6) * 4, 3.5, 0, TAU); ctx.fill(); }
  // Head under the veil: a pale hood and a hollow, dark face.
  ctx.fillStyle = bloody ? '#6a2030' : '#f6f8ff';
  ctx.beginPath(); ctx.arc(r * 0.15, 0, r * 0.48, 0, TAU); ctx.fill();
  ctx.fillStyle = '#0a0a14';
  ctx.beginPath(); ctx.ellipse(r * 0.42, 0, r * 0.18, r * 0.26, 0, 0, TAU); ctx.fill();
  // Tears (blood in phase 2).
  if (!mirrored && Math.random() < 0.15) burst(x, y + 4, { count: 1, color: bloody ? BLOOD : ICE, speed: 20, size: 2.5, life: 0.6, gravity: 140, drag: 1 });
  // Mirror copies have a crack through them.
  if (mirrored) {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.7); ctx.lineTo(0, -r * 0.1); ctx.lineTo(-r * 0.2, r * 0.4); ctx.lineTo(r * 0.4, r * 0.8); ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
