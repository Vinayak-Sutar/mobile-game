// The faces that come up while the legend is told.
//
// Hades puts the speaker's portrait at the edge of the screen and leaves the
// world running behind it; the face is the art, and the text is small. This is
// that, drawn rather than painted: flat shapes, a hard rim light down one side,
// and a palette per character so you know who is speaking before you read a
// word.
//
// Each is a bust in a 220 x 300 box with its feet at the bottom edge, so it can
// be drawn at any size against any panel.

const TAU = Math.PI * 2;
const W = 220, H = 300;
export const FACE = { w: W, h: H };

const P = {
  savitri: { skin: '#c98a5e', skin2: '#a96d46', hair: '#1a1014', cloth: '#b8323f', cloth2: '#8a1f2c', trim: '#e8b45c', rim: '#ffcf8a' },
  satyavan: { skin: '#bd7f52', skin2: '#9b6339', hair: '#20161a', cloth: '#6d6350', cloth2: '#4e4739', trim: '#8d8470', rim: '#ffd9a0' },
  yama: { skin: '#3c3350', skin2: '#241e34', hair: '#120c1a', cloth: '#1d1526', cloth2: '#120c18', trim: '#c9952f', rim: '#ff8a3c' },
  narada: { skin: '#c39066', skin2: '#a0724c', hair: '#e8e2d6', cloth: '#d8b869', cloth2: '#b0904a', trim: '#f0dfae', rim: '#ffe7b0' },
  keeper: { skin: '#c2a284', skin2: '#9d7f63', hair: '#e6e0d6', cloth: '#6a5f74', cloth2: '#4e4557', trim: '#8f8398', rim: '#ffbe86' },
};

/**
 * One portrait, its feet on (x, y + h) and `s` wide against the 220-unit box.
 * `t` is time, for the breath, and `k` 0..1 fades it in as it slides up.
 */
export function drawPortrait(ctx, who, x, y, s, t, k = 1) {
  const p = P[who] || P.keeper;
  ctx.save();
  ctx.translate(x, y + (1 - k) * 26);
  ctx.scale(s / W, s / W);
  ctx.globalAlpha = k;

  const breath = Math.sin(t * 1.5) * 3;
  ctx.translate(0, breath);

  // A wash behind the shoulders, so the figure lifts off whatever is behind it.
  const bg = ctx.createRadialGradient(W / 2, H * 0.42, 20, W / 2, H * 0.42, W * 0.82);
  bg.addColorStop(0, `rgba(${who === 'yama' ? '90,40,120' : '120,70,30'},0.5)`);
  bg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  if (who === 'yama') yamaBust(ctx, p, t);
  else bust(ctx, p, who, t);

  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Shoulders, neck, head, hair — the shape every mortal here shares. */
function bust(ctx, p, who, t) {
  const cx = W / 2, hy = 118;

  // Shoulders and the cloth over them.
  ctx.fillStyle = p.cloth2;
  ctx.beginPath();
  ctx.moveTo(cx - 96, H);
  ctx.quadraticCurveTo(cx - 88, 214, cx - 40, 190);
  ctx.lineTo(cx + 40, 190);
  ctx.quadraticCurveTo(cx + 88, 214, cx + 96, H);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = p.cloth;
  ctx.beginPath();
  ctx.moveTo(cx - 78, H);
  ctx.quadraticCurveTo(cx - 70, 218, cx - 34, 196);
  ctx.lineTo(cx + 46, 196);
  ctx.quadraticCurveTo(cx + 80, 222, cx + 86, H);
  ctx.closePath();
  ctx.fill();
  // A band of trim across it.
  ctx.fillStyle = p.trim;
  ctx.beginPath();
  ctx.moveTo(cx + 12, 200);
  ctx.quadraticCurveTo(cx + 54, 226, cx + 62, H);
  ctx.lineTo(cx + 84, H);
  ctx.quadraticCurveTo(cx + 76, 220, cx + 30, 196);
  ctx.closePath();
  ctx.fill();

  // Neck.
  ctx.fillStyle = p.skin2;
  ctx.fillRect(cx - 20, 168, 40, 36);

  // Head.
  ctx.fillStyle = p.skin;
  ctx.beginPath();
  ctx.ellipse(cx, hy, 47, 56, 0, 0, TAU);
  ctx.fill();
  // The jaw, a shade darker, so it is not a disc.
  ctx.fillStyle = p.skin2;
  ctx.beginPath();
  ctx.ellipse(cx + 3, hy + 30, 34, 26, 0, 0, Math.PI);
  ctx.fill();
  ctx.fillStyle = p.skin;
  ctx.beginPath();
  ctx.ellipse(cx, hy + 6, 44, 48, 0, Math.PI, TAU);
  ctx.fill();

  // Hair.
  ctx.fillStyle = p.hair;
  ctx.beginPath();
  ctx.ellipse(cx, hy - 20, 52, 46, 0, Math.PI, TAU);
  ctx.fill();
  if (who === 'narada' || who === 'keeper') {
    ctx.beginPath();                              // long white hair down the sides
    ctx.ellipse(cx - 46, hy + 22, 16, 52, 0.2, 0, TAU);
    ctx.ellipse(cx + 46, hy + 22, 16, 52, -0.2, 0, TAU);
    ctx.fill();
  } else {
    ctx.beginPath();                              // a plait falling past the shoulder
    ctx.moveTo(cx + 40, hy - 12);
    ctx.quadraticCurveTo(cx + 74, hy + 50, cx + 60, 214);
    ctx.quadraticCurveTo(cx + 46, hy + 60, cx + 30, hy + 4);
    ctx.closePath();
    ctx.fill();
  }
  if (who === 'narada') {
    ctx.beginPath();                              // his beard
    ctx.moveTo(cx - 34, hy + 26);
    ctx.quadraticCurveTo(cx, 232, cx + 34, hy + 26);
    ctx.quadraticCurveTo(cx, hy + 56, cx - 34, hy + 26);
    ctx.fill();
  }
  if (who === 'keeper') {
    ctx.fillStyle = p.cloth2;                     // her hood
    ctx.beginPath();
    ctx.moveTo(cx - 62, hy + 30);
    ctx.quadraticCurveTo(cx - 62, hy - 70, cx, hy - 74);
    ctx.quadraticCurveTo(cx + 62, hy - 70, cx + 62, hy + 30);
    ctx.quadraticCurveTo(cx + 40, hy - 16, cx, hy - 20);
    ctx.quadraticCurveTo(cx - 40, hy - 16, cx - 62, hy + 30);
    ctx.closePath();
    ctx.fill();
  }

  // Eyes. Everything a flat face has is in these.
  const blink = Math.sin(t * 0.7) > 0.985 ? 0.15 : 1;
  ctx.fillStyle = '#1b1114';
  ctx.save();
  ctx.translate(cx, hy + 2);
  ctx.scale(1, blink);
  ctx.beginPath(); ctx.ellipse(-17, 0, 8.5, 6, 0.1, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(17, 0, 8.5, 6, -0.1, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath(); ctx.arc(-14 + cx, hy - 1, 2.2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(20 + cx, hy - 1, 2.2, 0, TAU); ctx.fill();
  // Brows, which carry the mood.
  ctx.strokeStyle = p.hair;
  ctx.lineWidth = 4.4;
  ctx.lineCap = 'round';
  const tilt = who === 'narada' ? 0.16 : who === 'keeper' ? 0.1 : -0.04;
  ctx.beginPath(); ctx.moveTo(cx - 28, hy - 16 + tilt * 20); ctx.lineTo(cx - 7, hy - 20); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 7, hy - 20); ctx.lineTo(cx + 28, hy - 16 + tilt * 20); ctx.stroke();
  // Mouth, and a nose in shadow.
  ctx.fillStyle = p.skin2;
  ctx.beginPath(); ctx.ellipse(cx + 2, hy + 18, 6, 9, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#7a4636';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 12, hy + 36);
  ctx.quadraticCurveTo(cx + 2, hy + (who === 'savitri' ? 42 : 38), cx + 14, hy + 35);
  ctx.stroke();

  if (who === 'savitri') {
    ctx.fillStyle = '#c0203a';                    // her bindi
    ctx.beginPath(); ctx.arc(cx, hy - 30, 5.4, 0, TAU); ctx.fill();
    ctx.fillStyle = p.trim;                       // earrings
    ctx.beginPath(); ctx.arc(cx - 46, hy + 18, 7, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 46, hy + 18, 7, 0, TAU); ctx.fill();
  }

  rim(ctx, p);
}

/** Death: bigger than the frame, horned, and lit from inside. */
function yamaBust(ctx, p, t) {
  const cx = W / 2, hy = 128;
  // Horns of the buffalo he rides, behind him.
  ctx.strokeStyle = '#150f1e';
  ctx.lineWidth = 15;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 54, hy - 34);
  ctx.quadraticCurveTo(cx - 116, hy - 62, cx - 104, hy - 128);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 54, hy - 34);
  ctx.quadraticCurveTo(cx + 116, hy - 62, cx + 104, hy - 128);
  ctx.stroke();

  ctx.fillStyle = p.cloth2;
  ctx.beginPath();
  ctx.moveTo(cx - 112, H);
  ctx.quadraticCurveTo(cx - 100, 208, cx - 46, 188);
  ctx.lineTo(cx + 46, 188);
  ctx.quadraticCurveTo(cx + 100, 208, cx + 112, H);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = p.skin2;
  ctx.fillRect(cx - 24, 166, 48, 34);
  ctx.fillStyle = p.skin;
  ctx.beginPath();
  ctx.ellipse(cx, hy, 54, 62, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = p.skin2;
  ctx.beginPath();
  ctx.ellipse(cx + 3, hy + 34, 38, 28, 0, 0, Math.PI);
  ctx.fill();

  // The crown.
  ctx.fillStyle = p.trim;
  ctx.beginPath();
  ctx.moveTo(cx - 54, hy - 44);
  for (let i = 0; i < 5; i++) {
    ctx.lineTo(cx - 54 + i * 27 + 13, hy - 44 - (i % 2 ? 34 : 18));
    ctx.lineTo(cx - 54 + (i + 1) * 27, hy - 44);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#8f1f2c';
  ctx.beginPath(); ctx.arc(cx, hy - 52, 7, 0, TAU); ctx.fill();

  // Eyes like coals. This is the whole character.
  const heat = 0.72 + Math.sin(t * 2.2) * 0.2;
  for (const ex of [-20, 20]) {
    const g = ctx.createRadialGradient(cx + ex, hy + 2, 1, cx + ex, hy + 2, 30);
    g.addColorStop(0, `rgba(255,190,90,${heat})`);
    g.addColorStop(1, 'rgba(255,90,30,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx + ex, hy + 2, 30, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(255,226,170,${heat})`;
    ctx.beginPath(); ctx.ellipse(cx + ex, hy + 2, 9, 6.5, 0, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = '#0d0812';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - 36, hy - 24); ctx.lineTo(cx - 8, hy - 12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + 36, hy - 24); ctx.lineTo(cx + 8, hy - 12); ctx.stroke();
  ctx.strokeStyle = '#0d0812';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx - 18, hy + 40);
  ctx.quadraticCurveTo(cx + 2, hy + 34, cx + 20, hy + 40);
  ctx.stroke();

  rim(ctx, p);
}

/** The hard light down one side that makes a flat shape read as a form. */
function rim(ctx, p) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.3;
  const g = ctx.createLinearGradient(0, 0, W * 0.62, H);
  g.addColorStop(0, p.rim);
  g.addColorStop(0.42, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(W / 2, 128, 56, 66, 0, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(W / 2 - 100, H);
  ctx.quadraticCurveTo(W / 2 - 92, 210, W / 2 - 40, 188);
  ctx.lineTo(W / 2, 188);
  ctx.lineTo(W / 2 - 40, H);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
