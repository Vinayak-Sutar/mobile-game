// THE OPENING — three pictures, and who Savi is.
//
// It used to be six moving shots: leaves drifting across every one of them,
// the camera pushing in, a girl walking. It was a film, and it was the wrong
// thing twice over. A cozy game opens the way a picture book opens - you are
// shown a thing and given time to look at it - and the third of those shots
// told you the whole legend before the game started. The one story the game
// has to tell, given away in the first thirty seconds.
//
// So: THREE HELD PICTURES and nothing moving in any of them. Everything is
// drawn at t = 0, deliberately, so there is no sway and no drift. A shot in
// cinema.js carries one line, so the third picture is held across two of
// them - three drawings, four lines.
//
//   1  the valley, and the tree at the middle of it
//   2  the women, and the threads they tie on it
//   3  the keeper at her fire, the tree going out, and a girl on the road
//
// What is NOT said: why the threads work. That is the story, and Savi does
// not know it either.
//
// The projector is cinema.js, which came across with the engine and is
// self-contained: a shot is { hold, draw(ctx, t, k), say, sayAt, cam, cue,
// beats }, it letterboxes, cross-fades, wraps the line along the foot and
// puts PRESS ANYWHERE TO SKIP in the corner. Drawn in the Gond grammar the
// rest of the game's art uses (savi-gond.js): flat colour, soot outline,
// every surface combed with a repeated mark, the pattern following the form.
//
// Nothing here uses Math.random at draw time. A hash of the index gives the
// same specks in the same places every viewing.

import { FILM } from './cinema.js';
import { G, paint, ribbon, blob, limb, leaf, disc, motif } from './savi-gond.js';
import { sfx, setAmbientTheme, setMusicIntensity } from './audio.js';
import { themeById } from './music-regions.js';

const TAU = Math.PI * 2;
const W = FILM.w, H = FILM.h;

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

/** The threads the women tie: loops of colour round the bole, year on year. */
function threads(ctx, x, base, s2) {
  const col = [G.geru, G.haldi, G.gulabi, G.chuna, G.kesar];
  for (let i = 0; i < 9; i++) {
    const y = base - (40 + i * 13) * s2;
    ctx.strokeStyle = col[i % col.length];
    ctx.lineWidth = 3.4 * s2;
    ctx.beginPath();
    ctx.ellipse(x, y, (42 - i * 0.9) * s2, 8 * s2, 0, 0, TAU);
    ctx.stroke();
    // The two ends left hanging, which is how you can tell it was tied.
    ctx.lineWidth = 2.2 * s2;
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + d * (38 - i * 0.8) * s2, y + 5 * s2);
      ctx.quadraticCurveTo(x + d * (46 - i * 0.8) * s2, y + 18 * s2, x + d * (36 - i * 0.8) * s2, y + 30 * s2);
      ctx.stroke();
    }
  }
}

/** The film. A fresh array every time, so it can be watched twice. */
export function openingFilm() {
  // Held. Every draw takes t = 0 so nothing in the picture moves.
  return [
    // ---- PICTURE ONE: the valley, and the tree at the middle of it --------
    {
      hold: 1.6,
      say: 'There is a valley in the hills, and at the middle of it stands a banyan older than any village under it.',
      sayAt: 0.9,
      cue: () => { setMusicIntensity(0); setAmbientTheme(themeById('film-road')); },
      draw: (ctx) => {
        ground(ctx, '#2a1a22', '#4a2a1c');
        disc(ctx, W * 0.8, 116, 50, {
          fill: G.haldi, mark: 'dot', on: 'rgba(150,60,20,0.45)', rows: 3, along: 26, ms: 2.4,
          rays: 20, spin: 0, rayCol: G.kesar, lw: 1.8,
        });
        ridge(ctx, 286, 40, 1.2, '#3a2418');
        ridge(ctx, 356, 30, 3.7, '#2c1b13');
        ridge(ctx, 424, 18, 6.1, '#241811');
        banyan(ctx, W / 2, 486, 0.82, true, 0);
      },
    },

    // ---- PICTURE TWO: the women, and the threads --------------------------
    {
      hold: 1.6,
      say: 'Every autumn the women walk up from the villages and tie their threads round it — a ritual for the longevity of their husbands.',
      sayAt: 0.9,
      cue: () => sfx.bell(),
      draw: (ctx) => {
        ground(ctx, '#241a16', '#4a3222', 'crescent', 'rgba(255,243,220,0.06)');
        ridge(ctx, 392, 22, 3.7, '#2c1f16');
        banyan(ctx, W / 2, 452, 0.94, true, 0);
        threads(ctx, W / 2, 452, 0.94);
        // Five of them round it, turned in. Nobody is walking anywhere.
        const at = [[0.17, 1.3, 446], [0.3, 1.45, 452], [0.7, 1.45, 452], [0.83, 1.3, 446], [0.5, 1.2, 472]];
        const cloth = [G.geru, G.gulabi, G.haldi, G.patta, G.kesar];
        for (let i = 0; i < at.length; i++) {
          figure(ctx, W * at[i][0], at[i][2], at[i][1], { cloth: cloth[i], braid: i % 2 });
        }
      },
    },

    // ---- PICTURE THREE: the keeper, the tree going out ---------------------
    {
      hold: 1.6,
      say: 'Someone has always tended it — a keeper, chosen out of the villages, for as long as anyone can say.',
      sayAt: 0.9,
      cue: () => sfx.thud(),
      draw: (ctx) => keeperShot(ctx, false),
    },
    // ---- the same picture, and now there is a girl on the road -------------
    {
      hold: 1.6,
      say: 'The one up there now is old, and the tree is going out. So they chose again — the girl on the road is Savi, and she has been sent up to keep it.',
      sayAt: 0.6,
      cue: () => { setMusicIntensity(0.5); sfx.boon(); },
      beats: [{ at: 3.6, run: () => sfx.chime() }],
      draw: (ctx) => keeperShot(ctx, true),
    },
  ];
}

/** The third picture. Twice: without the girl on the road, and with her. */
function keeperShot(ctx, savi) {
  ground(ctx, '#2a1a22', '#46281a');
  ridge(ctx, 300, 34, 1.2, '#382317');
  ridge(ctx, 388, 24, 3.7, '#2c1b13');
  // The tree, bare. This is the one picture where it is plainly failing.
  banyan(ctx, W * 0.64, 440, 0.82, false, 0);
  threads(ctx, W * 0.64, 440, 0.82);
  // The keeper at her fire, small under it.
  ctx.fillStyle = 'rgba(255,150,60,0.2)';
  ctx.beginPath(); ctx.ellipse(W * 0.44, 432, 74, 30, 0, 0, TAU); ctx.fill();
  blob(ctx, W * 0.44, 426, 16, 21, 0, {
    fill: G.kesar, mark: 'dot', on: 'rgba(255,240,180,0.7)', rows: 2, along: 8, ms: 2, lw: 2,
  });
  figure(ctx, W * 0.33, 442, 1.8, { cloth: G.mitti, hair: '#ded6c6', stick: 1 });
  // The road up out of the bottom of the frame, and the torana over it.
  ctx.fillStyle = 'rgba(150,126,92,0.22)';
  ctx.beginPath();
  ctx.moveTo(W * 0.02, 520); ctx.lineTo(W * 0.22, 520);
  ctx.lineTo(W * 0.17, 404); ctx.lineTo(W * 0.12, 404);
  ctx.closePath();
  ctx.fill();
  if (savi) figure(ctx, W * 0.135, 486, 1.45, { cloth: G.geru, braid: 1 });
}
