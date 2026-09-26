// Does the fire ever get DRAWN over ground it does not clear?
//
// A stub canvas that collects every path drawBreath lays down, over two
// seconds of animation, for all three materials, from eight facings. Two of
// the things it draws are NOT claims on the ground and are excluded by name:
//
//   the flare at the lamp's lip  - a small disc AT THE LAMP, which is a lamp
//                                  glowing, and radius 24 round it
//   the glow() at the end        - light thrown on what is burning; fire lights
//                                  further than it burns
//
// Everything else - the three wedges and the seven tongues - has to lie inside
// the cone carve() actually clears.
const { drawBreath } = await import('../src/savi-art.js');

const BURN = {
  snow: { reach: 104, arc: 1.45, steam: true },
  thorn: { reach: 68, arc: 1.0, steam: false },
  ash: { reach: 124, arc: 1.0, steam: false },
};

let worstR = 0, worstA = 0, bad = 0, paths = 0, kept = 0;

function run(o, aim, time) {
  const p = { x: 1000, y: 2000, face: aim, z: 0 };
  const ox = p.x, oy = p.y + 6;                              // where carve() starts
  const mx = p.x + Math.cos(aim) * 16;                       // the lamp's lip
  const my = p.y - 11 + Math.sin(aim) * 9;
  let pts = [];
  let done = false, depth = 0;
  const note = (x, y) => {
    if (done) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) { bad++; return; }
    pts.push([x, y]);
  };
  const flush = (tongue) => {
    if (done || !pts.length) { pts = []; return; }
    paths++;
    // The flare: everything in it is within 26 of the lamp's lip.
    let far = 0;
    for (const [x, y] of pts) far = Math.max(far, Math.hypot(x - mx, y - my));
    if (far <= 26.5) { pts = []; return; }
    kept++;
    // A WEDGE is a claim on the ground and every point of it is measured. A
    // TONGUE starts at the lamp, which is at her chest and can sit behind the
    // carve origin when she faces down the screen - so what is measured is
    // where its TIP lands, which is the only part of it that touches ground.
    for (const [x, y] of (tongue ? [pts[pts.length - 1]] : pts)) {
      const d = Math.hypot(x - ox, y - oy);
      if (d < 0.5) continue;
      let da = Math.atan2(y - oy, x - ox) - aim;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      worstR = Math.max(worstR, d / o.reach);
      worstA = Math.max(worstA, Math.abs(da) / (o.arc / 2));
    }
    pts = [];
  };
  const ctx = {
    save() { depth++; },
    restore() { depth--; if (depth <= 0) done = true; },   // past here it is glow()
    beginPath() { pts = []; }, closePath() {},
    fill() { flush(false); }, stroke() { flush(true); },
    set globalCompositeOperation(_v) {}, set fillStyle(_v) {}, set strokeStyle(_v) {},
    set lineWidth(_v) {}, set lineCap(_v) {}, set globalAlpha(_v) {},
    moveTo: note, lineTo: note,
    quadraticCurveTo(cx, cy, x, y) { note(cx, cy); note(x, y); },
    arc(x, y, r, a0, a1) {
      for (let k = 0; k <= 24; k++) { const t = a0 + ((a1 - a0) * k) / 24; note(x + Math.cos(t) * r, y + Math.sin(t) * r); }
    },
    ellipse(x, y, rx, ry) { note(x + rx, y); note(x - rx, y); note(x, y + ry); note(x, y - ry); },
    createRadialGradient() { return { addColorStop() {} }; },
    createLinearGradient() { return { addColorStop() {} }; },
  };
  drawBreath(ctx, p, o, time);
}

for (const [, o] of Object.entries(BURN)) {
  for (let f = 0; f < 8; f++) for (let k = 0; k < 120; k++) run(o, (f / 8) * Math.PI * 2, k / 60);
}

console.log('paths drawn       : %d  (%d measured, %d were the lamp flare)', paths, kept, paths - kept);
console.log('non-finite points : %d', bad);
console.log('worst radius      : %s x reach', worstR.toFixed(3));
console.log('worst half-angle  : %s x (arc/2)', worstA.toFixed(3));
const ok = !bad && kept > 0 && worstR <= 1.02 && worstA <= 1.001;
console.log(ok ? 'the fire stays inside the ground it clears' : 'THE FIRE OVERREACHES');
process.exit(ok ? 0 : 1);
