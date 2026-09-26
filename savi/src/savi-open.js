// THE OPENING — who Savi is, and why she has come.
//
// Six shots, about half a minute, skippable. It exists to answer the question
// the game never answered: why is this child here at all? She is the NEXT
// KEEPER. Looking after the Banyan's roots is a job, it was the old woman's
// job and her mother's before her, and Savi has walked here to take it on.
//
// The projector is cinema.js, which came across with the engine and is
// self-contained: a shot is { hold, draw(ctx, t, k), say, sayAt, cam, cue,
// beats }, it letterboxes, cross-fades, wraps the line along the foot and puts
// PRESS ANYWHERE TO SKIP in the corner. Ashfall's own film is next to it and is
// no use here - it pulls in the whole player rig and hardcodes its own title -
// so this is written fresh, in the Gond grammar the rest of the game's art
// uses now (savi-gond.js): flat colour, soot outline, every surface combed with
// a repeated mark, and the pattern following the form rather than sitting
// behind it.
//
// Nothing here uses Math.random at draw time. A hash of the index gives the
// same specks in the same places every viewing.

import { FILM } from './cinema.js';
import { G, paint, ribbon, blob, limb, leaf, disc, bird, motif } from './savi-gond.js';
import { sfx, setAmbientTheme, setMusicIntensity } from './audio.js';
import { themeById } from './music-regions.js';

const TAU = Math.PI * 2;
const W = FILM.w, H = FILM.h;
const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** The ground colour of a shot, combed, because nothing is left as nothing. */
function ground(ctx, top, bottom, mark = 'dot', on = 'rgba(255,243,220,0.07)') {
  const g = ctx.createLinearGradient(0, -200, 0, H + 200);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(-400, -300, W + 800, H + 600);
  motif(ctx, { x: -400, y: -300, w: W + 800, h: H + 600 }, mark, on, 22);
}

/** The hill line the valley sits in. */
function ridge(ctx, y, amp, seed, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(-400, H + 300);
  ctx.lineTo(-400, y);
  for (let x = -400; x <= W + 400; x += 40) {
    ctx.lineTo(x, y + Math.sin(x * 0.004 + seed) * amp + Math.sin(x * 0.011 + seed * 2) * amp * 0.4);
  }
  ctx.lineTo(W + 400, H + 300);
  ctx.closePath();
  ctx.fill();
}

/** The Banyan, as the film draws it: a trunk of ribbons and a crown of arcs. */
function banyan(ctx, x, base, s, leafy, t) {
  ctx.save();
  ctx.translate(x, base);
  ctx.scale(s, s);
  // The buttresses and the braided trunk.
  for (const d of [-1, 1]) {
    paint(ctx, ribbon([[d * 54, 0], [d * 30, -60], [d * 12, -130]], 26, 14), {
      fill: G.mitti, mark: 'dash', on: 'rgba(255,243,220,0.5)', rows: 2, along: 12, ms: 3, mlw: 1.3, lw: 2.4,
    });
  }
  paint(ctx, ribbon([[0, 6], [-6, -90], [4, -190], [0, -250]], 40, 22), {
    fill: G.mitti, fill2: '#7a4a1f', band: 0.2,
    mark: 'dash', on: 'rgba(255,243,220,0.55)', rows: 4, along: 22, ms: 3.4, mlw: 1.4, lw: 2.6,
  });
  // The limbs, and what hangs off them.
  for (let i = 0; i < 9; i++) {
    const a = -2.9 + i * 0.33;
    const ex = Math.cos(a) * 250, ey = -250 + Math.sin(a) * 120;
    paint(ctx, ribbon([[0, -240], [ex * 0.5, ey * 0.62 - 60], [ex, ey]], 13, 5), {
      fill: G.mitti, mark: 'dot', on: 'rgba(255,243,220,0.45)', rows: 2, along: 14, ms: 2, lw: 2,
    });
    // Aerial roots coming down.
    if (i % 2 === 0) {
      paint(ctx, ribbon([[ex * 0.8, ey + 10], [ex * 0.8 + Math.sin(t + i) * 6, ey + 120]], 4, 2.5), {
        fill: '#6a451f', lw: 1.6,
      });
    }
    if (!leafy) continue;
    for (let j = 0; j < 3; j++) {
      const b = a + (j - 1) * 0.3;
      leaf(ctx, ex + Math.cos(b) * 34, ey + Math.sin(b) * 26, 26, 13, b, {
        fill: j === 1 ? G.patta : G.hara, mark: 'tick', on: 'rgba(255,243,220,0.8)',
        rows: 1, along: 8, ms: 4, mlw: 1.4, lw: 1.8,
      });
    }
  }
  ctx.restore();
}

/** A root running away into the ground, and how choked it is. */
function rootLine(ctx, x0, y0, x1, y1, lit) {
  paint(ctx, ribbon([[x0, y0], [(x0 + x1) / 2, (y0 + y1) / 2 + 26], [x1, y1]], 17, 8), {
    fill: lit ? '#a8702f' : '#4a3a2c',
    mark: 'dash', on: lit ? 'rgba(255,214,140,0.85)' : 'rgba(180,170,150,0.35)',
    rows: 2, along: 18, ms: 3, mlw: 1.3, lw: 2.2,
  });
}

/** A figure, small, in the Gond manner: she is a shape and an attitude. */
function figure(ctx, x, base, s, o = {}) {
  ctx.save();
  ctx.translate(x, base);
  ctx.scale(s, s);
  const cloth = o.cloth || G.geru, hair = o.hair || '#170f14';
  paint(ctx, ribbon([[0, 0], [0, -28], [0, -54]], 26, 15), {
    fill: cloth, mark: 'dot', on: 'rgba(255,243,220,0.85)', rows: 3, along: 12, ms: 2, lw: 2.2,
  });
  const swing = o.walk ? Math.sin(o.walk) * 9 : 0;
  limb(ctx, [[-13, -46], [-20 - swing, -22]], 5, 4, { fill: G.skin, lw: 1.8 });
  limb(ctx, [[13, -46], [20 + swing, -22]], 5, 4, { fill: G.skin, lw: 1.8 });
  blob(ctx, 0, -66, 14, 16, 0, { fill: G.skin, mark: 'dot', on: 'rgba(120,45,15,0.3)', rows: 2, along: 10, ms: 1.6, lw: 2.2 });
  paint(ctx, { closed: false, at: (u, v) => {
    const a = Math.PI + u * Math.PI;
    return [Math.cos(a) * 15 * (0.74 + 0.26 * v), -66 + Math.sin(a) * 17 * (0.74 + 0.26 * v)];
  } }, { fill: hair, mark: 'crescent', on: 'rgba(224,65,126,0.6)', rows: 2, along: 12, ms: 2.4, mlw: 1.2, lw: 1.8 });
  if (o.braid) {
    paint(ctx, ribbon([[12, -64], [20, -40], [16, -14]], 5, 3), { fill: hair, lw: 1.6 });
  }
  if (o.stick) {
    paint(ctx, ribbon([[18, -20], [24, -88]], 3, 2.5), { fill: G.mitti, lw: 1.6 });
  }
  ctx.fillStyle = G.chuna;
  ctx.beginPath(); ctx.arc(-5, -68, 3.2, 0, TAU); ctx.arc(5, -68, 3.2, 0, TAU); ctx.fill();
  ctx.fillStyle = G.soot;
  ctx.beginPath(); ctx.arc(-5, -68, 1.6, 0, TAU); ctx.arc(5, -68, 1.6, 0, TAU); ctx.fill();
  ctx.restore();
}

/** Leaves going over, which is what this valley does instead of weather. */
function falling(ctx, t, n = 40) {
  for (let i = 0; i < n; i++) {
    const sp = 0.4 + rnd(i) * 0.8;
    const x = ((rnd(i * 3) * (W + 500) + t * 26 * sp) % (W + 500)) - 250;
    const y = ((rnd(i * 7) * (H + 400) + t * 21 * sp) % (H + 400)) - 200;
    const k = t * (1.6 + sp) + i;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(k * 0.5) * 0.8);
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = ['#c9903a', '#a8761f', '#d3762e', '#8a5f22'][i & 3];
    ctx.beginPath();
    ctx.ellipse(0, 0, 8, 8 * (0.15 + 0.5 * Math.abs(Math.sin(k))), 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/** The film. A fresh array every time, so it can be watched twice. */
export function openingFilm() {
  return [
    // 1 — the valley, and what is wrong with it.
    {
      hold: 5.4,
      say: 'There is a valley where the autumn never ended.',
      cam: { z0: 1.12, z1: 1.0, y0: -20, y1: 10 },
      cue: () => { setMusicIntensity(0); setAmbientTheme(themeById('film-road')); },
      draw: (ctx, t) => {
        ground(ctx, '#2a1a22', '#4a2a1c');
        disc(ctx, W * 0.78, 120, 52, {
          fill: G.haldi, mark: 'dot', on: 'rgba(150,60,20,0.45)', rows: 3, along: 26, ms: 2.4,
          rays: 20, spin: t * 0.05, rayCol: G.kesar, lw: 1.8,
        });
        ridge(ctx, 300, 40, 1.2, '#3a2418');
        ridge(ctx, 372, 30, 3.7, '#2c1b13');
        falling(ctx, t, 54);
      },
    },
    // 2 — the tree at the middle of it.
    {
      hold: 5.6,
      say: 'At the middle of it stands a banyan, and the banyan is dying.',
      sayAt: 1.2,
      cam: { z0: 1.0, z1: 1.22, y0: 0, y1: 40 },
      cue: () => sfx.thud(),
      draw: (ctx, t) => {
        ground(ctx, '#2a1a22', '#46281a');
        ridge(ctx, 400, 26, 3.7, '#2c1b13');
        banyan(ctx, W / 2, 470, 1.0, false, t);
        falling(ctx, t, 34);
      },
    },
    // 3 — what it is for.
    {
      hold: 5.8,
      say: 'It does not drink water. It drinks memories — and it was planted to hold just one.',
      sayAt: 0.8,
      cam: { z0: 1.24, z1: 1.06, x0: -30, x1: 20 },
      cue: () => sfx.chime(),
      draw: (ctx, t) => {
        ground(ctx, '#1c1024', '#3a1c2e', 'crescent', 'rgba(255,243,220,0.06)');
        // The legend, as three figures in a row: her, him, and Death.
        figure(ctx, W * 0.3, 380, 1.5, { cloth: G.geru, braid: 1 });
        figure(ctx, W * 0.5, 380, 1.5, { cloth: G.patta });
        figure(ctx, W * 0.72, 380, 1.8, { cloth: G.neelDark, hair: '#0d0912' });
        for (let i = 0; i < 5; i++) {
          bird(ctx, 180 + i * 160, 130 + Math.sin(t * 0.6 + i) * 14, 16, {
            fill: G.chuna, mark: 'dot', on: 'rgba(60,40,20,0.5)', rows: 1, along: 5, ms: 1.6, lw: 1.8,
          });
        }
      },
    },
    // 4 — the five roots, and the work.
    {
      hold: 5.6,
      say: 'Five Great Roots carry it home to the trunk. Every one of them is choked.',
      cam: { z0: 1.0, z1: 1.14, y0: 30, y1: -10 },
      cue: () => sfx.hiss(),
      draw: (ctx, t) => {
        ground(ctx, '#241626', '#43271a');
        banyan(ctx, W / 2, 300, 0.62, false, t);
        const ends = [[120, 470], [300, 520], [W / 2, 540], [700, 520], [880, 470]];
        for (let i = 0; i < 5; i++) {
          rootLine(ctx, W / 2, 300, ends[i][0], ends[i][1], false);
          // and what is lying on each of them
          const col = ['#c9903a', '#5a8ba8', '#2b2233', '#e9eff5', '#6d6459'][i];
          ctx.fillStyle = col;
          ctx.globalAlpha = 0.85;
          for (let j = 0; j < 12; j++) {
            const a = rnd(i * 20 + j) * TAU, r = rnd(i * 31 + j) * 46;
            ctx.beginPath();
            ctx.ellipse(ends[i][0] + Math.cos(a) * r, ends[i][1] + Math.sin(a) * r * 0.5, 9, 5, a, 0, TAU);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
      },
    },
    // 5 — whose job it was.
    {
      hold: 5.6,
      say: 'Someone has always kept them. Her mother did, and hers, and hers.',
      sayAt: 0.9,
      cam: { z0: 1.16, z1: 1.0, x0: 30, x1: -20 },
      cue: () => sfx.bell(),
      draw: (ctx, t) => {
        ground(ctx, '#241a16', '#4a3222');
        ridge(ctx, 400, 22, 3.7, '#2c1f16');
        banyan(ctx, W * 0.66, 460, 0.7, false, t);
        figure(ctx, W * 0.36, 460, 2.0, { cloth: G.mitti, hair: '#ded6c6', stick: 1 });
        // Her fire.
        const f = 0.7 + 0.3 * Math.sin(t * 7);
        ctx.fillStyle = `rgba(255,150,60,${0.22 * f})`;
        ctx.beginPath(); ctx.ellipse(W * 0.46, 452, 70, 30, 0, 0, TAU); ctx.fill();
        blob(ctx, W * 0.46, 448, 17 * f, 22 * f, 0, { fill: G.kesar, mark: 'dot', on: 'rgba(255,240,180,0.7)', rows: 2, along: 8, ms: 2, lw: 2 });
        falling(ctx, t, 26);
      },
    },
    // 6 — and now it is hers.
    {
      hold: 6.2,
      say: 'She is the last of them. Savi is the next.',
      sayAt: 1.4,
      cam: { z0: 1.0, z1: 1.2, x0: -40, x1: 30 },
      cue: () => { setMusicIntensity(0.5); sfx.boon(); },
      beats: [{ at: 3.4, run: () => sfx.chime() }],
      draw: (ctx, t) => {
        ground(ctx, '#2a1a22', '#4a2a1c');
        disc(ctx, W * 0.2, 130, 44, {
          fill: G.haldi, mark: 'dot', on: 'rgba(150,60,20,0.45)', rows: 2, along: 22, ms: 2.2,
          rays: 18, spin: -t * 0.05, rayCol: G.kesar, lw: 1.8,
        });
        ridge(ctx, 396, 26, 3.7, '#2c1b13');
        // The torana she comes in under, and the road past it.
        for (const d of [-1, 1]) {
          ctx.fillStyle = '#7b6a52';
          ctx.fillRect(W * 0.62 + d * 120 - 13, 250, 26, 160);
        }
        ctx.fillStyle = '#7b6a52';
        ctx.fillRect(W * 0.62 - 146, 232, 292, 26);
        banyan(ctx, W * 0.62, 410, 0.42, false, t);
        // Savi, walking in, small against all of it.
        figure(ctx, 150 + t * 26, 440, 1.7, { cloth: G.geru, braid: 1, walk: t * 7 });
        falling(ctx, t, 30);
      },
    },
  ];
}
