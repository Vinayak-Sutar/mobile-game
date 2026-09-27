(() => {
  // savi/src/state.js
  var world = {
    player: null,
    enemies: [],
    projectiles: [],
    spellZones: [],
    // lasting spells (sigil, singularity, meteors)
    hitboxes: [],
    grenades: [],
    pickups: [],
    hazards: [],
    // telegraphed ground attacks (hazards.js)
    corpses: [],
    // bodies left by kills, for the Vetala (enemies-folk.js)
    training: false,
    // the Training Ground, not a run
    tutorial: false,
    // the tutorial chamber (tutorial.js)
    overworld: false,
    // The Wilds, the open world (wilds-world.js)
    owBoss: null,
    // a guardian fought from one of The Wilds' gates
    dungeon: false,
    // inside a dungeon (dungeon.js)
    room: null,
    depth: 1,
    loop: 0,
    // how many times the run has looped past the boss
    biome: null,
    // terrain/palette chosen at run start
    bossOrder: [],
    // every guardian, shuffled per run (boss-pool.js)
    beaten: [],
    // guardians beaten so far this run (the Monkey King borrows them)
    trial: null,
    // boss type when playing a Boss Trial, else null
    gold: 0,
    kills: 0,
    runTime: 0,
    damageLog: {},
    timeScale: 1,
    paused: false
  };
  var gfx = { epoch: 0 };
  var view = {
    w: 1280,
    h: 720,
    // world units
    cw: 0,
    ch: 0,
    // css pixels
    scale: 1,
    dpr: 1
  };
  var camera = { x: 0, y: 0 };
  var arena = { x: 0, y: 0, w: 0, h: 0 };

  // savi/src/util.js
  var TAU = Math.PI * 2;
  var clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
  var rand = (lo, hi) => lo + Math.random() * (hi - lo);
  var dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
  var dist2 = (ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay;
    return dx * dx + dy * dy;
  };
  function angleDiff(a, b) {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }
  function circleOrientedRect(cx, cy, cr, x, y, angle, len, wid) {
    const c = Math.cos(-angle), s = Math.sin(-angle);
    const dx = cx - x, dy = cy - y;
    const lx = dx * c - dy * s;
    const ly = dx * s + dy * c;
    const hw = wid / 2;
    const qx = clamp(lx, 0, len);
    const qy = clamp(ly, -hw, hw);
    return dist2(lx, ly, qx, qy) < cr * cr;
  }

  // savi/src/terrain.js
  var TT = {
    GRASS: 0,
    TALL: 1,
    MOSS: 2,
    DIRT: 3,
    ROCK: 4,
    SNOW: 5,
    SAND: 6,
    PAVE: 7,
    GRAVEL: 8,
    // The big Wilds' own grounds: the Broken Peaks' ash, the Mire's mud, the
    // Moors' frozen lake, the palace's marble, open water and the chasm.
    ASH: 9,
    MUD: 10,
    ICE: 11,
    MARBLE: 12,
    WATER: 13,
    CHASM: 14,
    // The shallow edge of any water: you can wade it, slowly.
    SHALLOW: 15
  };
  var ROUGH = [0.35, 0.3, 0.3, 0.3, 1.1, 0.9, 0.45, 0.2, 0.6, 0.75, 0.25, 0.35, 0.12, 0.1, 0, 0.1];
  function mulberry(seed) {
    return () => {
      seed = seed + 1831565813 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var NS = 256;
  var TABLE = new Float32Array(NS * NS);
  {
    const r = mulberry(1337);
    for (let i = 0; i < TABLE.length; i++) TABLE[i] = r();
  }
  function vnoise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let fx2 = x - xi, fy = y - yi;
    fx2 = fx2 * fx2 * (3 - 2 * fx2);
    fy = fy * fy * (3 - 2 * fy);
    const x0 = xi & 255, x1 = xi + 1 & 255;
    const y0 = (yi & 255) * NS, y1 = (yi + 1 & 255) * NS;
    const a = TABLE[y0 + x0], b = TABLE[y0 + x1], c = TABLE[y1 + x0], d = TABLE[y1 + x1];
    return a + (b - a) * fx2 + (c - a) * fy + (a - b - c + d) * fx2 * fy;
  }
  function fbm(x, y) {
    return vnoise(x, y) * 0.62 + vnoise(x * 2.03 + 17.3, y * 2.03 + 31.1) * 0.38;
  }
  function hash(x, y) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) | 0;
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
  }
  var CHUNK = 256;
  var KEEP = 64;
  var clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  function createTerrain(opts) {
    const { W: W3, H: H3 } = opts;
    const CELL3 = 20;
    const gw = Math.ceil(W3 / CELL3) + 1, gh = Math.ceil(H3 / CELL3) + 1;
    const grid = new Uint8Array(gw * gh);
    const road = new Uint8Array(gw * gh);
    const BLK = 16;
    const bw = Math.ceil(gw / BLK), bh = Math.ceil(gh / BLK);
    const done = new Uint8Array(bw * bh);
    function fill(bi, bj) {
      done[bj * bw + bi] = 1;
      const i0 = bi * BLK, j0 = bj * BLK;
      const i1 = Math.min(gw, i0 + BLK), j1 = Math.min(gh, j0 + BLK);
      const near = opts.roadDist.length === 4 ? opts.roadDist(i0 * CELL3 - 300, j0 * CELL3 - 300, i1 * CELL3 + 300, j1 * CELL3 + 300) : opts.roadDist;
      for (let j = j0; j < j1; j++) {
        for (let i = i0; i < i1; i++) {
          grid[j * gw + i] = opts.classify(i * CELL3 + CELL3 / 2, j * CELL3 + CELL3 / 2);
          road[j * gw + i] = Math.min(255, near(i * CELL3, j * CELL3));
        }
      }
    }
    const at = (i, j) => {
      const bi = i / BLK | 0, bj = j / BLK | 0;
      if (!done[bj * bw + bi]) fill(bi, bj);
      return j * gw + i;
    };
    function prefill(x0, y0, x1, y1, deadline) {
      const bi0 = Math.max(0, Math.floor(x0 / CELL3 / BLK)), bi1 = Math.min(bw - 1, Math.floor(x1 / CELL3 / BLK));
      const bj0 = Math.max(0, Math.floor(y0 / CELL3 / BLK)), bj1 = Math.min(bh - 1, Math.floor(y1 / CELL3 / BLK));
      for (let bj = bj0; bj <= bj1; bj++) {
        for (let bi = bi0; bi <= bi1; bi++) {
          if (done[bj * bw + bi]) continue;
          if (performance.now() > deadline) return false;
          fill(bi, bj);
        }
      }
      return true;
    }
    function typeAt(x, y) {
      const i = Math.min(gw - 1, Math.max(0, Math.floor(x / CELL3)));
      const j = Math.min(gh - 1, Math.max(0, Math.floor(y / CELL3)));
      return grid[at(i, j)];
    }
    function roadAt(x, y) {
      const fx2 = Math.min(gw - 1.001, Math.max(0, x / CELL3)), fy = Math.min(gh - 1.001, Math.max(0, y / CELL3));
      const i = fx2 | 0, j = fy | 0, u = fx2 - i, v = fy - j;
      const k = at(i, j);
      at(i + 1, j);
      at(i, j + 1);
      at(i + 1, j + 1);
      const a = road[k], b = road[k + 1], c = road[k + gw], d = road[k + gw + 1];
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    const smoothK = (u) => u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
    const ridged = (x, y) => 1 - Math.abs(fbm(x, y) * 2 - 1);
    const LZ = 0.62;
    const LH = Math.sqrt(1 - LZ * LZ);
    const LX = -LH * 0.7071, LY = -LH * 0.7071;
    const TAN = LZ / LH;
    function formAt(wx, wy, tops) {
      let base = 0;
      for (let i = 0; i < tops.length; i++) {
        const r = tops[i];
        if (!r.rise) continue;
        const ramp = r.ramp || 300;
        const dx = Math.min(wx - r.x + ramp, r.x + r.w + ramp - wx);
        if (dx <= 0) continue;
        const dy = Math.min(wy - r.y + ramp, r.y + r.h + ramp - wy);
        if (dy <= 0) continue;
        base += r.rise * smoothK(dx / ramp) * smoothK(dy / ramp);
      }
      return base;
    }
    function elevAt(wx, wy, tops, amp) {
      const base = formAt(wx, wy, tops);
      if (amp <= 0) return base;
      const k = 0.28 + 0.72 * Math.min(1, base / 170);
      const rx = wx * 21e-4, ry = wy * 31e-4;
      const a1 = ridged(rx, ry), a2 = ridged(rx * 2.6 + 21, ry * 2.6 + 7), a3 = ridged(rx * 6.1 + 5, ry * 6.1 + 63);
      return base + amp * k * (a1 * a1 * 0.58 + a2 * a2 * 0.28 + a3 * a3 * 0.14);
    }
    function reliefLight(wx, wy, tops, amp, out2) {
      const D = 11;
      const e = elevAt(wx, wy, tops, amp);
      const gx = (elevAt(wx + D, wy, tops, amp) - elevAt(wx - D, wy, tops, amp)) / (2 * D);
      const gy = (elevAt(wx, wy + D, tops, amp) - elevAt(wx, wy - D, tops, amp)) / (2 * D);
      const lam = (-gx * LX - gy * LY + LZ) / Math.sqrt(gx * gx + gy * gy + 1);
      let block = 0;
      const hx = LX / LH, hy = LY / LH;
      for (let s = 1; s <= 10; s++) {
        const d = s * 26;
        const over = elevAt(wx + hx * d, wy + hy * d, tops, amp) - (e + d * TAN);
        if (over > block) block = over;
      }
      const sun = 1 - Math.min(1, block / 22) * 0.55;
      out2[0] = Math.max(0.34, Math.min(1.8, (1 + (lam - LZ) * 2.3) * sun));
      out2[1] = Math.min(1, Math.hypot(gx, gy) * 2.4);
      out2[2] = formAt(wx, wy, tops);
      out2[3] = e;
    }
    const out = [0, 0, 0];
    let wasWall = false;
    function paint2(wx, wy, shadowRects, jxo, jyo, m, relief, crackN, J) {
      const n = vnoise(wx * 0.11, wy * 0.11);
      const h = hash(wx, wy);
      let lift = 1;
      wasWall = false;
      if (J.raised) {
        const rv = paintRaised(wx, wy, n, h, J);
        if (rv === true) {
          wasWall = true;
          return out;
        }
        lift = rv;
      }
      const t = typeAt(wx + jxo, wy + jyo);
      let r, g, bl;
      switch (t) {
        case TT.GRASS:
        case TT.TALL: {
          const k = t === TT.TALL ? 0.84 : 1;
          r = (66 + m * 30 + n * 10) * k;
          g = (86 + m * 34 + n * 12) * k;
          bl = (50 + m * 14) * k;
          if (h < 0.16) {
            r *= 0.8;
            g *= 0.84;
            bl *= 0.8;
          } else if (h > 0.992) {
            r = 150;
            g = 146;
            bl = 132;
          } else if (h > 0.97) {
            r += 22;
            g += 24;
            bl += 8;
          }
          break;
        }
        case TT.MOSS:
          r = 40 + m * 18 + n * 8;
          g = 60 + m * 22 + n * 10;
          bl = 42 + m * 8;
          if (h < 0.035) {
            r = 112 + n * 30;
            g = 82 + n * 20;
            bl = 42;
          } else if (h < 0.1) {
            r *= 0.8;
            g *= 0.85;
            bl *= 0.85;
          }
          break;
        case TT.DIRT:
          r = 100 + m * 26 + n * 12;
          g = 84 + m * 20 + n * 9;
          bl = 62 + m * 12;
          if (h < 0.05) {
            r += 30;
            g += 26;
            bl += 22;
          }
          break;
        case TT.ROCK: {
          r = 92 + m * 34 + n * 14;
          g = 88 + m * 32 + n * 13;
          bl = 84 + m * 28 + n * 12;
          const c = Math.abs(crackN - 0.5);
          if (c < 0.018) {
            r *= 0.6;
            g *= 0.6;
            bl *= 0.6;
          } else if (c < 0.03) {
            r *= 1.1;
            g *= 1.1;
            bl *= 1.1;
          }
          if (h < 0.08) {
            r *= 0.88;
            g *= 0.88;
            bl *= 0.88;
          }
          break;
        }
        case TT.GRAVEL:
          r = 118 + m * 22 + n * 16;
          g = 104 + m * 18 + n * 14;
          bl = 86 + m * 14 + n * 10;
          if (h < 0.18) {
            const s = h < 0.09 ? 1.25 : 0.72;
            r *= s;
            g *= s;
            bl *= s;
          }
          break;
        case TT.SNOW: {
          r = 208 + m * 26 + n * 8;
          g = 216 + m * 22 + n * 7;
          bl = 230 + m * 16 + n * 6;
          const hollow = clamp01(-relief * 1.4);
          r -= hollow * 40;
          g -= hollow * 30;
          bl -= hollow * 8;
          if (h > 0.996) {
            r = 255;
            g = 255;
            bl = 255;
          }
          break;
        }
        case TT.SAND: {
          const rip = Math.sin((wx * 0.8 + wy * 0.35) * 0.22 + m * 9) * 7;
          r = 172 + m * 22 + rip;
          g = 152 + m * 20 + rip;
          bl = 112 + m * 14 + rip * 0.7;
          if (h < 0.04) {
            r -= 26;
            g -= 26;
            bl -= 22;
          }
          break;
        }
        case TT.PAVE: {
          const row2 = Math.floor(wy / 30);
          const col = Math.floor((wx + (row2 & 1) * 15) / 30);
          const lx = wx + (row2 & 1) * 15 - col * 30, ly = wy - row2 * 30;
          const th = hash(col * 7 + 3, row2 * 13 + 5);
          const edge = Math.min(lx, ly, 30 - lx, 30 - ly);
          if (th < 0.18) {
            r = 70 + n * 20;
            g = 76 + n * 22;
            bl = 52;
          } else if (edge < 1.6) {
            r = 58 + n * 10;
            g = 66 + n * 12;
            bl = 50;
          } else {
            const tint = (th - 0.5) * 22;
            r = 100 + tint + m * 18 + n * 10;
            g = 96 + tint + m * 16 + n * 9;
            bl = 92 + tint + m * 14 + n * 8;
            if (edge < 4) {
              r *= 0.9;
              g *= 0.9;
              bl *= 0.9;
            }
          }
          break;
        }
        case TT.ASH: {
          r = 66 + m * 22 + n * 12;
          g = 60 + m * 20 + n * 11;
          bl = 58 + m * 18 + n * 10;
          if (h < 0.06) {
            r *= 0.78;
            g *= 0.78;
            bl *= 0.78;
          } else if (h > 0.9975) {
            r = 236;
            g = 120;
            bl = 52;
          } else if (h > 0.985) {
            r += 28;
            g += 26;
            bl += 24;
          }
          break;
        }
        case TT.MUD: {
          r = 60 + m * 20 + n * 10;
          g = 50 + m * 16 + n * 8;
          bl = 36 + m * 10 + n * 6;
          if (m > 0.66) {
            const k = (m - 0.66) * 3;
            r += (40 - r) * k;
            g += (58 - g) * k;
            bl += (60 - bl) * k;
          }
          if (h < 0.05) {
            r *= 0.8;
            g *= 0.8;
            bl *= 0.8;
          }
          break;
        }
        case TT.ICE: {
          r = 170 + m * 30 + n * 8;
          g = 198 + m * 26 + n * 8;
          bl = 218 + m * 20 + n * 6;
          const c = Math.abs(crackN - 0.5);
          if (c < 0.014) {
            r = 238;
            g = 246;
            bl = 252;
          } else if (c < 0.03) {
            r *= 0.9;
            g *= 0.93;
            bl *= 0.96;
          }
          if (m > 0.7) {
            r += 24;
            g += 20;
            bl += 12;
          }
          break;
        }
        case TT.MARBLE: {
          const row2 = Math.floor(wy / 64), col = Math.floor(wx / 64);
          const lx = wx - col * 64, ly = wy - row2 * 64;
          const edge = Math.min(lx, ly, 64 - lx, 64 - ly);
          const th = hash(col * 5 + 1, row2 * 11 + 7);
          if (edge < 1.8) {
            r = 196;
            g = 160;
            bl = 82;
          } else {
            const vein = Math.abs(vnoise(wx * 0.05 + th * 9, wy * 0.05) - 0.5) < 0.02 ? 0.88 : 1;
            const tint = (th - 0.5) * 16;
            r = (204 + tint + n * 10) * vein;
            g = (198 + tint + n * 10) * vein;
            bl = (186 + tint + n * 8) * vein;
          }
          break;
        }
        case TT.WATER: {
          r = 20 + m * 12 + n * 6;
          g = 48 + m * 16 + n * 8;
          bl = 68 + m * 20 + n * 8;
          break;
        }
        case TT.SHALLOW: {
          const foam = typeAt(wx + 18, wy) < TT.WATER || typeAt(wx - 18, wy) < TT.WATER || typeAt(wx, wy + 18) < TT.WATER || typeAt(wx, wy - 18) < TT.WATER;
          r = 58 + m * 26 + n * 12;
          g = 112 + m * 24 + n * 10;
          bl = 118 + m * 20 + n * 8;
          if (h < 0.05) {
            r -= 14;
            g -= 12;
            bl -= 10;
          }
          if (foam && h > 0.4) {
            r = 214 + n * 30;
            g = 230 + n * 20;
            bl = 232 + n * 16;
          }
          break;
        }
        case TT.CHASM: {
          const lip = typeAt(wx, wy - 22) !== TT.CHASM || typeAt(wx - 22, wy) !== TT.CHASM || typeAt(wx + 22, wy) !== TT.CHASM;
          if (lip) {
            r = 70 + n * 20;
            g = 64 + n * 18;
            bl = 60 + n * 16;
          } else {
            r = 10 + m * 10;
            g = 10 + m * 10;
            bl = 16 + m * 16;
          }
          break;
        }
        default:
          r = g = bl = 60;
      }
      const rd = t === TT.WATER || t === TT.CHASM || t === TT.SHALLOW ? 99 : roadAt(wx + (n - 0.5) * 8, wy + (m - 0.5) * 8);
      if (rd < 30) {
        const k = clamp01((30 - rd) / 9);
        let dr, dg, db;
        if (t === TT.SNOW) {
          dr = 176 + n * 14;
          dg = 184 + n * 14;
          db = 198 + n * 12;
        } else {
          dr = 104 + m * 22 + n * 12;
          dg = 88 + m * 18 + n * 10;
          db = 66 + m * 12;
        }
        if (Math.abs(rd - 10) < 2.6) {
          dr *= 0.82;
          dg *= 0.82;
          db *= 0.82;
        }
        if (h < 0.03) {
          dr += 24;
          dg += 22;
          db += 18;
        }
        r += (dr - r) * k;
        g += (dg - g) * k;
        bl += (db - bl) * k;
      }
      let light = (1 + relief * ROUGH[t]) * lift;
      if (shadowRects.length) {
        const sx = wx - 7, sy = wy - 9;
        let d = 99;
        for (const o of shadowRects) {
          const dx = Math.max(o.x - sx, 0, sx - (o.x + o.w));
          const dy = Math.max(o.y - sy, 0, sy - (o.y + o.h));
          const dd = Math.hypot(dx, dy);
          if (dd < d) d = dd;
        }
        if (d < 24) light *= 1 - 0.34 * (1 - d / 24);
      }
      out[0] = r * light;
      out[1] = g * light;
      out[2] = bl * light;
      return out;
    }
    const inR = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
    function paintRaised(wx, wy, n, h, J) {
      for (const s2 of J.stairs) {
        if (!inR(s2, wx, wy)) continue;
        const ly = wy - s2.y, step2 = Math.floor(ly / 9), f = ly - step2 * 9;
        const edge = Math.min(wx - s2.x, s2.x + s2.w - wx);
        const dim = 1 - step2 / Math.max(1, s2.h / 9) * 0.25;
        let r, g, b;
        if (edge < 6) {
          r = 74;
          g = 70;
          b = 66;
          if (edge < 1.5) {
            r = 50;
            g = 47;
            b = 45;
          }
        } else if (f < 3.4) {
          r = 158 + n * 14;
          g = 152 + n * 13;
          b = 142 + n * 12;
        } else {
          const k = 1 - (f - 3.4) / 12;
          r = 104 * k + n * 8;
          g = 98 * k + n * 8;
          b = 92 * k + n * 7;
        }
        if (h < 0.05) {
          r *= 0.85;
          g *= 0.85;
          b *= 0.85;
        }
        out[0] = r * dim;
        out[1] = g * dim;
        out[2] = b * dim;
        return true;
      }
      for (const f of J.faces) {
        if (!inR(f, wx, wy)) continue;
        const dy = wy - f.y, v = dy / f.h;
        const above = typeAt(wx, f.y - 8);
        const lip = 4 + vnoise(wx * 0.18, f.y * 0.01) * 8 + (h < 0.2 ? 2 : 0);
        if (dy < lip) {
          if (above === TT.SNOW) {
            out[0] = 226 + n * 20;
            out[1] = 232 + n * 16;
            out[2] = 244 + n * 10;
          } else if (above === TT.GRASS || above === TT.TALL || above === TT.MOSS) {
            const k2 = dy > lip - 2 ? 0.7 : 1;
            out[0] = (78 + n * 22) * k2;
            out[1] = (104 + n * 24) * k2;
            out[2] = (58 + n * 10) * k2;
          } else {
            out[0] = 150 + n * 16;
            out[1] = 144 + n * 14;
            out[2] = 134 + n * 12;
          }
          return true;
        }
        const snowy = above === TT.SNOW;
        const streak = vnoise(wx * 0.09, wy * 0.012);
        let r = (snowy ? 88 : 90) + streak * 34 + n * 10;
        let g = (snowy ? 92 : 84) + streak * 30 + n * 9;
        let b = (snowy ? 106 : 78) + streak * 28 + n * 8;
        if (Math.sin(wy * 0.6 + vnoise(wx * 0.02, wy * 0.05) * 7) > 0.82) {
          r *= 0.8;
          g *= 0.8;
          b *= 0.8;
        }
        if (Math.abs(vnoise(wx * 0.06 + 11, 3.3) - 0.5) < 0.018) {
          r *= 0.62;
          g *= 0.62;
          b *= 0.62;
        }
        if (dy < lip + 2) {
          r *= 0.55;
          g *= 0.55;
          b *= 0.55;
        }
        const k = (1.16 - v * 0.72) * (dy > f.h - 3 ? 0.55 : 1);
        out[0] = r * k;
        out[1] = g * k;
        out[2] = b * k;
        return true;
      }
      for (const r2 of J.rims) {
        if (!inR(r2, wx, wy)) continue;
        const e = r2.vertical ? wx - r2.x : wy - r2.y;
        const k = e < 2.5 ? 1.35 : 0.72 - e / 14 * 0.2;
        out[0] = (100 + n * 16) * k;
        out[1] = (96 + n * 14) * k;
        out[2] = (90 + n * 12) * k;
        return true;
      }
      let lift = 1;
      for (const t2 of J.tops) if (inR(t2, wx, wy)) {
        lift = 1.08;
        break;
      }
      for (const sl of J.slopes) {
        if (!inR(sl, wx, wy)) continue;
        const u = sl.side === "n" ? (wy - sl.y) / sl.h : (wx - sl.x) / sl.w;
        const k = sl.side === "w" ? 1 - u : u;
        const lit = sl.side === "w" || sl.side === "n" ? 1.12 : 0.8;
        lift *= 1 + (lit - 1) * Math.sin(Math.PI * Math.min(1, k * 1.2));
        if (k > 0.2 && k < 0.3 && h < 0.5) lift *= 0.9;
      }
      for (const f of J.faces) {
        const reach = Math.max(36, f.h * 0.62);
        const below = wy - (f.y + f.h);
        if (below >= 0 && below < reach && wx > f.x - 6 && wx < f.x + f.w + 16) {
          const k = 1 - below / reach;
          lift *= 1 - 0.55 * k * k;
        }
      }
      for (const r2 of J.rims) {
        if (!r2.vertical) continue;
        const east = wx - (r2.x + r2.w);
        if (east >= 0 && east < 22 && wy > r2.y && wy < r2.y + r2.h + 20) lift *= 1 - 0.3 * (1 - east / 22);
      }
      return lift;
    }
    const cache2 = /* @__PURE__ */ new Map();
    let epoch = -1;
    let tick2 = 0;
    const G3 = 6;
    const NF = 5;
    const G22 = 16;
    const STEP2 = 17;
    const NL = 4;
    function startJob(cx, cy) {
      const x0 = cx * CHUNK - 1, y0 = cy * CHUNK - 1;
      const S2 = CHUNK + 2;
      const c = document.createElement("canvas");
      c.width = S2;
      c.height = S2;
      const cc = c.getContext("2d");
      const img2 = cc.createImageData(S2, S2);
      const shadowRects = (opts.shadowsNear ? opts.shadowsNear(x0 - 30, y0 - 30, x0 + S2 + 30, y0 + S2 + 30) : opts.obstacles || []).filter((o) => o.shadow && o.x < x0 + S2 + 30 && o.x + o.w > x0 - 30 && o.y < y0 + S2 + 30 && o.y + o.h > y0 - 30);
      const P3 = Math.ceil(S2 / G3) + 2;
      const F3 = new Float32Array(P3 * P3 * NF);
      for (let j = 0; j < P3; j++) {
        for (let i = 0; i < P3; i++) {
          const wx = x0 + i * G3, wy = y0 + j * G3, o = (j * P3 + i) * NF;
          F3[o] = (vnoise(wx * 0.035, wy * 0.035) - 0.5) * 30;
          F3[o + 1] = (vnoise(wx * 0.035 + 57, wy * 0.035 + 91) - 0.5) * 30;
          F3[o + 2] = fbm(wx * 0.011, wy * 0.011);
          const a = wx * 0.018, b = wy * 0.018;
          F3[o + 3] = (fbm(a - 0.06, b - 0.06) - fbm(a + 0.06, b + 0.06)) * 5;
          F3[o + 4] = fbm(wx * 0.03 + 40, wy * 0.03 + 12);
        }
      }
      const R0 = opts.raisedNear ? opts.raisedNear(x0 - 40, y0 - 40, x0 + S2 + 40, y0 + S2 + 40) : opts.raised || { tops: [], faces: [], stairs: [], rims: [], slopes: [] };
      const midAmp = opts.reliefAmp ? opts.reliefAmp(x0 + S2 / 2, y0 + S2 / 2) : 0;
      const wide = opts.raisedNear ? opts.raisedNear(x0 - 1600, y0 - 1600, x0 + S2 + 1600, y0 + S2 + 1600).tops : [];
      const elevTops = wide.filter((r) => r.rise);
      let L = null, P22 = 0;
      if (midAmp > 0 || elevTops.length) {
        P22 = Math.ceil(S2 / G22) + 2;
        L = new Float32Array(P22 * P22 * NL);
        const o2 = [0, 0, 0, 0];
        for (let j = 0; j < P22; j++) {
          for (let i = 0; i < P22; i++) {
            const wx = x0 + i * G22, wy = y0 + j * G22;
            reliefLight(wx, wy, elevTops, opts.reliefAmp ? opts.reliefAmp(wx, wy) : 0, o2);
            const o = (j * P22 + i) * NL;
            L[o] = o2[0];
            L[o + 1] = o2[1];
            L[o + 2] = o2[2];
            L[o + 3] = o2[3];
          }
        }
      }
      const near = (r) => r.x < x0 + S2 + 40 && r.x + r.w > x0 - 40 && r.y < y0 + S2 + 40 && r.y + r.h > y0 - 40;
      const J = {
        tops: R0.tops.filter(near),
        faces: R0.faces.filter(near),
        stairs: R0.stairs.filter(near),
        rims: R0.rims.filter(near),
        slopes: (R0.slopes || []).filter(near)
      };
      J.raised = J.tops.length + J.faces.length + J.stairs.length + J.rims.length + J.slopes.length > 0;
      return { key: cy * 1e3 + cx, x0, y0, S: S2, c, cc, img: img2, shadowRects, F: F3, P: P3, J, L, P2: P22, row: 0 };
    }
    function stepJob(job, deadline) {
      const { S: S2, P: P3, F: F3, L, P2: P22, x0, y0, shadowRects } = job;
      const d = job.img.data;
      const R2 = job.rowF || (job.rowF = new Float32Array(P3 * NF));
      const RL = L && (job.rowL || (job.rowL = new Float32Array(P22 * NL)));
      while (job.row < S2) {
        const y = job.row;
        const gy = y / G3, j = gy | 0, v = gy - j;
        for (let q = 0, o = j * P3 * NF; q < P3 * NF; q++) R2[q] = F3[o + q] + (F3[o + P3 * NF + q] - F3[o + q]) * v;
        if (L) {
          const gy2 = y / G22, j2 = gy2 | 0, v2 = gy2 - j2, o2 = j2 * P22 * NL;
          for (let q = 0; q < P22 * NL; q++) RL[q] = L[o2 + q] + (L[o2 + P22 * NL + q] - L[o2 + q]) * v2;
        }
        let k = y * S2 * 4;
        for (let x = 0; x < S2; x++) {
          const gx = x / G3, i = gx | 0, u = gx - i;
          const o = i * NF;
          const px = paint2(
            x0 + x,
            y0 + y,
            shadowRects,
            R2[o] + (R2[o + NF] - R2[o]) * u,
            R2[o + 1] + (R2[o + 1 + NF] - R2[o + 1]) * u,
            R2[o + 2] + (R2[o + 2 + NF] - R2[o + 2]) * u,
            R2[o + 3] + (R2[o + 3 + NF] - R2[o + 3]) * u,
            R2[o + 4] + (R2[o + 4 + NF] - R2[o + 4]) * u,
            job.J
          );
          if (L && !wasWall) {
            const gx2 = x / G22, i2 = gx2 | 0, u2 = gx2 - i2, q = i2 * NL;
            const lit = RL[q] + (RL[q + NL] - RL[q]) * u2;
            const steep = RL[q + 1] + (RL[q + 1 + NL] - RL[q + 1]) * u2;
            const form = RL[q + 2] + (RL[q + 2 + NL] - RL[q + 2]) * u2;
            const elev = RL[q + 3] + (RL[q + 3 + NL] - RL[q + 3]) * u2;
            const bare = Math.min(1, steep * 1.35) ** 2 * 0.5;
            const a = Math.min(1, form / 260) * 0.55;
            let lip = 0;
            if (steep > 0.04) {
              const gate = Math.min(1, steep * 3.4);
              const gmag = Math.max(0.035, steep / 2.4);
              const f = elev / STEP2 - Math.floor(elev / STEP2);
              const up = f * STEP2 / gmag, down = (1 - f) * STEP2 / gmag;
              if (up < 3) lip = -(1 - up / 3) * 0.34 * gate;
              else if (down < 2) lip = (1 - down / 2) * 0.28 * gate;
            }
            const sh = lit * (1 + lip);
            const r = px[0] * (1 - bare) + 58 * bare;
            const g = px[1] * (1 - bare) + 52 * bare;
            const b = px[2] * (1 - bare) + 50 * bare;
            d[k] = Math.min(255, r * sh * (1 - 0.1 * a) + 22 * a);
            d[k + 1] = Math.min(255, g * sh * (1 - 0.06 * a) + 24 * a);
            d[k + 2] = Math.min(255, b * sh * (1 - 0.02 * a) + 30 * a);
          } else {
            d[k] = px[0];
            d[k + 1] = px[1];
            d[k + 2] = px[2];
          }
          d[k + 3] = 255;
          k += 4;
        }
        job.row++;
        if (deadline && (job.row & 3) === 0 && performance.now() > deadline) break;
      }
      if (job.row < S2) return false;
      job.cc.putImageData(job.img, 0, 0);
      return true;
    }
    let pending = null;
    function bake(cx, cy) {
      const key = cy * 1e3 + cx;
      const job = pending && pending.key === key ? pending : startJob(cx, cy);
      if (job === pending) pending = null;
      stepJob(job, 0);
      return { c: job.c, used: tick2 };
    }
    function visibleRange(camX, camY, vw, vh, pad4) {
      return {
        i0: Math.max(0, Math.floor((camX - pad4) / CHUNK)),
        i1: Math.min(Math.ceil(W3 / CHUNK) - 1, Math.floor((camX + vw + pad4) / CHUNK)),
        j0: Math.max(0, Math.floor((camY - pad4) / CHUNK)),
        j1: Math.min(Math.ceil(H3 / CHUNK) - 1, Math.floor((camY + vh + pad4) / CHUNK))
      };
    }
    function warm(camX, camY, vw, vh) {
      if (epoch !== gfx.epoch) {
        cache2.clear();
        epoch = gfx.epoch;
      }
      const r = visibleRange(camX, camY, vw, vh, 0);
      for (let j = r.j0; j <= r.j1; j++) for (let i = r.i0; i <= r.i1; i++) {
        const key = j * 1e3 + i;
        if (!cache2.has(key)) cache2.set(key, bake(i, j));
      }
    }
    function draw(ctx3, camX, camY, vw, vh) {
      if (epoch !== gfx.epoch) {
        cache2.clear();
        pending = null;
        epoch = gfx.epoch;
      }
      tick2++;
      const r = visibleRange(camX, camY, vw, vh, 0);
      for (let j = r.j0; j <= r.j1; j++) {
        for (let i = r.i0; i <= r.i1; i++) {
          const key = j * 1e3 + i;
          let ch = cache2.get(key);
          if (!ch) {
            ch = bake(i, j);
            cache2.set(key, ch);
          }
          ch.used = tick2;
          ctx3.drawImage(ch.c, 1, 1, CHUNK, CHUNK, i * CHUNK, j * CHUNK, CHUNK, CHUNK);
        }
      }
      if (!pending) {
        const p = visibleRange(camX, camY, vw, vh, CHUNK);
        outer:
          for (let j = p.j0; j <= p.j1; j++) {
            for (let i = p.i0; i <= p.i1; i++) {
              if (!cache2.has(j * 1e3 + i)) {
                pending = startJob(i, j);
                break outer;
              }
            }
          }
      }
      if (pending && stepJob(pending, performance.now() + 3)) {
        cache2.set(pending.key, { c: pending.c, used: tick2 });
        pending = null;
      }
      if (cache2.size > KEEP) {
        const old = [...cache2.entries()].sort((a, b) => a[1].used - b[1].used);
        const n = cache2.size - KEEP;
        for (let k = 0; k < n; k++) cache2.delete(old[k][0]);
      }
    }
    function invalidate(x0, y0, x1, y1) {
      const bi0 = Math.max(0, Math.floor(x0 / CELL3 / BLK)), bi1 = Math.min(bw - 1, Math.floor(x1 / CELL3 / BLK));
      const bj0 = Math.max(0, Math.floor(y0 / CELL3 / BLK)), bj1 = Math.min(bh - 1, Math.floor(y1 / CELL3 / BLK));
      for (let bj = bj0; bj <= bj1; bj++) for (let bi = bi0; bi <= bi1; bi++) done[bj * bw + bi] = 0;
      cache2.clear();
      pending = null;
    }
    return { typeAt, roadAt, draw, warm, prefill, invalidate, CELL: CELL3 };
  }

  // savi/src/fx.js
  var MAX_PARTICLES = 420;
  var fx = {
    particles: [],
    rings: [],
    slashes: [],
    texts: [],
    trails: [],
    trauma: 0,
    // 0..1, shake magnitude is trauma^2 so small hits stay subtle
    shakeX: 0,
    shakeY: 0,
    hitstop: 0,
    // seconds of frozen simulation
    flash: 0,
    flashColor: "#ffffff",
    vignette: 0
  };
  function burst(x, y, opts = {}) {
    const {
      count = 8,
      color = "#fff",
      speed = 180,
      speedVar = 0.6,
      size = 4,
      sizeVar = 0.5,
      life = 0.4,
      lifeVar = 0.4,
      dir = null,
      spread = TAU,
      drag = 4,
      gravity = 0,
      shape = "circle",
      glowing = false
    } = opts;
    for (let i = 0; i < count; i++) {
      if (fx.particles.length >= MAX_PARTICLES) break;
      const a = dir === null ? rand(0, TAU) : dir + rand(-spread / 2, spread / 2);
      const sp = speed * rand(1 - speedVar, 1 + speedVar);
      const l = life * rand(1 - lifeVar, 1 + lifeVar);
      fx.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: l,
        maxLife: l,
        size: size * rand(1 - sizeVar, 1 + sizeVar),
        color,
        drag,
        gravity,
        shape,
        glowing,
        spin: rand(-8, 8),
        rot: rand(0, TAU)
      });
    }
  }

  // savi/src/spawn.js
  function spawnPickup(o) {
    const p = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      r: 11,
      type: "gold",
      // gold | heal
      value: 1,
      life: 26,
      bob: Math.random() * Math.PI * 2,
      magnet: false,
      dead: false,
      ...o
    };
    world.pickups.push(p);
    return p;
  }

  // savi/src/grass.js
  var BUCKET = 128;
  var K = 46;
  var DAMP = 7;
  var SHADES_TALL = ["#3d5731", "#4c6a39", "#628243", "#83a056"];
  var SHADES_SHORT = ["#4a6536", "#56733e", "#6c8a48", "#8aa65a"];
  var LEAN = [-0.4, 0.05, 0.42];
  var OFF = [-3.2, 0.4, 3.4];
  var REST_BY = -0.04;
  var BX0 = 0.02;
  var BSTEP = 0.04;
  var NB = 15;
  var KINDS = [
    // tall: reference height, the cell round the root (world units), blade width
    { ref: 22, x0: -10, y0: -26, w: 34, h: 30, width: 2.1, shades: SHADES_TALL, off: 1 },
    { ref: 9, x0: -5, y0: -12, w: 16, h: 15, width: 1.5, shades: SHADES_SHORT, off: 0.7 }
  ];
  var atlas = null;
  function tuftPath(p, x, y, hh, bx, by, pattern, off) {
    const flat = Math.min(1, Math.abs(bx) + Math.abs(by) * 0.5);
    for (let j = 0; j < (off === 1 ? 3 : 2); j++) {
      const lean = LEAN[(j + pattern) % 3];
      const ox = x + OFF[j] * off;
      const tx = ox + lean * hh * 0.45 + bx * hh;
      const ty = y - hh * (1 - flat * 0.45) + by * hh * 0.55;
      p.moveTo(ox, y);
      p.quadraticCurveTo(ox + (tx - ox) * 0.2, y - hh * 0.55, tx, ty);
    }
  }
  function buildAtlas(scale) {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    const kinds = [];
    let oy = 0, width = 0;
    for (const K2 of KINDS) {
      const cw = Math.ceil(K2.w * scale), ch = Math.ceil(K2.h * scale);
      kinds.push({ oy, cw, ch });
      oy += ch * 12;
      width = Math.max(width, cw * NB);
    }
    canvas.width = width;
    canvas.height = oy;
    const g = canvas.getContext("2d");
    g.lineCap = "round";
    KINDS.forEach((K2, t) => {
      const { oy: top, cw, ch } = kinds[t];
      g.lineWidth = K2.width;
      for (let s = 0; s < 4; s++) {
        g.strokeStyle = K2.shades[s];
        for (let pat = 0; pat < 3; pat++) {
          for (let b = 0; b < NB; b++) {
            g.setTransform(scale, 0, 0, scale, b * cw - K2.x0 * scale, top + (s * 3 + pat) * ch - K2.y0 * scale);
            g.beginPath();
            tuftPath(g, 0, 0, K2.ref, BX0 + b * BSTEP, REST_BY, pat, K2.off);
            g.stroke();
          }
        }
      }
    });
    return { canvas, scale, kinds };
  }
  function createGrass(terrain2, opts) {
    const { W: W3, H: H3 } = opts;
    const OX = opts.x0 || 0, OY = opts.y0 || 0;
    const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    const xs = [], ys = [], hs = [], hues = [], tall = [];
    const sow = (step2, want, isTall, hMin, hMax, where) => {
      for (let gy = OY; gy < OY + H3; gy += step2) {
        for (let gx = OX; gx < OX + W3; gx += step2) {
          const x = gx + rand(0, step2), y = gy + rand(0, step2);
          if (!want.includes(terrain2.typeAt(x, y))) continue;
          if (terrain2.roadAt(x, y) < 32) continue;
          if (opts.blocked(x, y)) continue;
          if (where && !where(x, y)) continue;
          xs.push(x);
          ys.push(y);
          hs.push(rand(hMin, hMax));
          hues.push(Math.random() * 3 | 0);
          tall.push(isTall ? 1 : 0);
        }
      }
    };
    sow(coarse ? 34 : 27, [TT.GRASS, TT.MOSS, TT.DIRT], false, 7, 12);
    sow(coarse ? 21 : 17, [TT.TALL], true, 17, 27);
    if (opts.tallAt) sow(coarse ? 32 : 24, [TT.GRASS, TT.MOSS, TT.TALL], true, 15, 25, opts.tallAt);
    const n = xs.length;
    const nbx = Math.ceil(W3 / BUCKET), nby = Math.ceil(H3 / BUCKET);
    const order = [...Array(n).keys()].sort((a, b) => {
      const ka = Math.floor((ys[a] - OY) / BUCKET) * nbx + Math.floor((xs[a] - OX) / BUCKET);
      const kb = Math.floor((ys[b] - OY) / BUCKET) * nbx + Math.floor((xs[b] - OX) / BUCKET);
      return ka - kb || ys[a] - ys[b];
    });
    const X = new Float32Array(n), Y = new Float32Array(n), Hh = new Float32Array(n);
    const HUE = new Uint8Array(n), TALL = new Uint8Array(n);
    const BX = new Float32Array(n), BY = new Float32Array(n), VX = new Float32Array(n), VY = new Float32Array(n);
    const GUST = new Float32Array(n);
    const CUT = new Float32Array(n).fill(-1e9);
    const start = new Int32Array(nbx * nby + 1);
    order.forEach((src, i) => {
      X[i] = xs[src];
      Y[i] = ys[src];
      Hh[i] = hs[src];
      HUE[i] = hues[src];
      TALL[i] = tall[src];
      start[clamp(Math.floor((Y[i] - OY) / BUCKET), 0, nby - 1) * nbx + clamp(Math.floor((X[i] - OX) / BUCKET), 0, nbx - 1) + 1]++;
    });
    for (let k = 1; k < start.length; k++) start[k] += start[k - 1];
    const range = (x0, y0, x1, y1) => ({
      i0: clamp(Math.floor((x0 - OX) / BUCKET), 0, nbx - 1),
      i1: clamp(Math.floor((x1 - OX) / BUCKET), 0, nbx - 1),
      j0: clamp(Math.floor((y0 - OY) / BUCKET), 0, nby - 1),
      j1: clamp(Math.floor((y1 - OY) / BUCKET), 0, nby - 1)
    });
    function each(x0, y0, x1, y1, fn) {
      if (x1 < OX || y1 < OY || x0 > OX + W3 || y0 > OY + H3) return;
      const r = range(x0, y0, x1, y1);
      for (let j = r.j0; j <= r.j1; j++) {
        for (let i = r.i0; i <= r.i1; i++) {
          const b = j * nbx + i;
          for (let k = start[b]; k < start[b + 1]; k++) fn(k);
        }
      }
    }
    const gustAt = (x, y, t) => clamp(
      0.5 + Math.sin(x * 45e-4 + y * 22e-4 - t * 1.25) * 0.36 + Math.sin(x * 0.012 - y * 6e-3 - t * 2.3) * 0.16,
      0,
      1
    );
    const heightOf = (k, t) => {
      const since = t - CUT[k];
      if (since > 30) return Hh[k];
      return 3.5 + (Hh[k] - 3.5) * clamp((since - 8) / 22, 0, 1);
    };
    function update(dt, t, view2, movers, cutters) {
      const pad4 = 40;
      each(view2.x - pad4, view2.y - pad4, view2.x + view2.w + pad4, view2.y + view2.h + pad4, (k) => {
        const g = gustAt(X[k], Y[k], t);
        GUST[k] = g;
        const tx = 0.12 + g * 0.42, ty = -0.04;
        VX[k] += (-(BX[k] - tx) * K - VX[k] * DAMP) * dt;
        VY[k] += (-(BY[k] - ty) * K - VY[k] * DAMP) * dt;
        BX[k] += VX[k] * dt;
        BY[k] += VY[k] * dt;
      });
      for (const m of movers) {
        const R2 = m.r + 16;
        each(m.x - R2, m.y - R2, m.x + R2, m.y + R2, (k) => {
          const dx = X[k] - m.x, dy = Y[k] - m.y;
          const d2 = dx * dx + dy * dy;
          if (d2 > R2 * R2) return;
          const d = Math.sqrt(d2) || 1;
          const f = (1 - d / R2) * m.push;
          const blend = Math.min(1, dt * 20);
          BX[k] += (dx / d * 1.15 * f - BX[k]) * blend * f;
          BY[k] += (dy / d * 1.15 * f - BY[k]) * blend * f;
          if (m.rustle && TALL[k] && Math.random() < dt * 1.2 * f) {
            burst(X[k], Y[k] - 10, { count: 1, color: "#6c8a48", speed: 60, size: 2, life: 0.4, drag: 3, gravity: 60, shape: "shard" });
          }
        });
      }
      for (const h of cutters) {
        const reach = (h.radius || 0) + (h.len || 0) + 10;
        let shown = 0;
        each(h.x - reach, h.y - reach, h.x + reach, h.y + reach, (k) => {
          if (!TALL[k] || t - CUT[k] < 30) return;
          let hit;
          if (h.shape === "arc") {
            hit = dist(h.x, h.y, X[k], Y[k]) < h.radius + 4 && Math.abs(angleDiff(h.angle, Math.atan2(Y[k] - h.y, X[k] - h.x))) < h.arc / 2 + 0.15;
          } else if (h.shape === "rect") {
            hit = circleOrientedRect(X[k], Y[k], 4, h.x, h.y, h.angle, h.len, h.wid);
          } else hit = dist(h.x, h.y, X[k], Y[k]) < (h.radius || 30) + 4;
          if (!hit) return;
          CUT[k] = t;
          if (shown++ < 5) {
            burst(X[k], Y[k] - 8, { count: 3, color: SHADES_TALL[1 + k % 3], speed: 150, size: 2.5, life: 0.5, drag: 3, gravity: 120, shape: "shard" });
          }
          const roll2 = Math.random();
          if (roll2 < 0.025) spawnPickup({ x: X[k], y: Y[k], type: "gold", value: 3 });
          else if (roll2 < 0.035) spawnPickup({ x: X[k], y: Y[k], type: "heal", value: 6 });
        });
      }
    }
    const shadeOf = (k) => clamp(Math.round(HUE[k] * 0.5 + GUST[k] * 2.3 - 0.4), 0, 3);
    function blades(k, t, pt, ps) {
      const idx = shadeOf(k);
      tuftPath(TALL[k] ? pt[idx] : ps[idx], X[k], Y[k], heightOf(k, t), BX[k], BY[k], HUE[k], TALL[k] ? 1 : 0.7);
    }
    function strokeAll(ctx3, pt, ps) {
      ctx3.lineCap = "round";
      ctx3.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        ctx3.strokeStyle = SHADES_SHORT[i];
        ctx3.stroke(ps[i]);
      }
      ctx3.lineWidth = 2.1;
      for (let i = 0; i < 4; i++) {
        ctx3.strokeStyle = SHADES_TALL[i];
        ctx3.stroke(pt[i]);
      }
    }
    function draw(ctx3, t, view2) {
      const pt = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
      const ps = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
      const m = ctx3.getTransform ? ctx3.getTransform() : null;
      const want = m ? Math.min(3, Math.max(1, Math.round(Math.hypot(m.a, m.b) * 4) / 4)) : 0;
      if (want && (!atlas || atlas.scale !== want)) atlas = buildAtlas(want);
      const A2 = atlas;
      let stroked = 0;
      each(view2.x - 30, view2.y - 10, view2.x + view2.w + 30, view2.y + view2.h + 40, (k) => {
        const hh = heightOf(k, t);
        const b = Math.round((BX[k] - BX0) / BSTEP);
        if (!A2 || hh !== Hh[k] || b < -1 || b > NB || Math.abs(BY[k] - REST_BY) > 0.06) {
          blades(k, t, pt, ps);
          stroked++;
          return;
        }
        const T = TALL[k] ? 0 : 1, K2 = KINDS[T], C = A2.kinds[T];
        const s = hh / K2.ref;
        const sx = clamp(b, 0, NB - 1) * C.cw, sy = C.oy + (shadeOf(k) * 3 + HUE[k]) * C.ch;
        ctx3.drawImage(A2.canvas, sx, sy, C.cw, C.ch, X[k] + K2.x0 * s, Y[k] + K2.y0 * s, K2.w * s, K2.h * s);
      });
      if (stroked) strokeAll(ctx3, pt, ps);
    }
    function drawFront(ctx3, t, e) {
      const pt = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
      const ps = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
      let any = false;
      each(e.x - 30, e.y - 4, e.x + 30, e.y + 26, (k) => {
        if (!TALL[k] || Y[k] < e.y + 2 || Y[k] > e.y + e.r + 12 || Math.abs(X[k] - e.x) > e.r + 10) return;
        if (heightOf(k, t) < 8) return;
        blades(k, t, pt, ps);
        any = true;
      });
      if (any) strokeAll(ctx3, pt, ps);
    }
    function inTall(x, y, t) {
      let found = false;
      each(x - 12, y - 12, x + 12, y + 12, (k) => {
        if (!found && TALL[k] && heightOf(k, t) > 8 && Math.abs(X[k] - x) < 12 && Math.abs(Y[k] - y) < 12) found = true;
      });
      return found;
    }
    return { update, draw, drawFront, inTall, count: n };
  }
  function grassMovers() {
    const out = [];
    const p = world.player;
    if (p && !p.dead) out.push({ x: p.x, y: p.y + p.r * 0.5, r: p.r, push: p.dashing ? 1.4 : 1, rustle: true });
    for (const e of world.enemies) {
      if (e.dead || e.z) continue;
      out.push({ x: e.x, y: e.y + e.r * 0.4, r: e.r, push: 0.9, rustle: false });
    }
    return out;
  }

  // savi/src/wilds-water.js
  var CELL = 12;
  var PAD = 200;
  var C2 = 0.22;
  var DAMP2 = 0.982;
  var LIGHT = 0.8;
  var GLINT_CAP = 0.7;
  var TINTS = {
    clear: { glint: [120, 176, 196], ring: "143,184,200" },
    swamp: { glint: [96, 150, 120], ring: "143,196,168" }
  };
  function createWildsWater() {
    const S2 = {
      gx0: 0,
      gy0: 0,
      w: 0,
      h: 0,
      hgt: null,
      vel: null,
      wet: null,
      canvas: null,
      cx: null,
      img: null,
      ripples: [],
      lapT: 0,
      dripT: 0,
      stepT: 0,
      lastP: null,
      any: false,
      t: 0,
      tint: TINTS.clear,
      calm: 1
    };
    const isWet = (t) => t === TT.WATER || t === TT.SHALLOW;
    function fill(terrain2, i0, j0, i1, j1) {
      for (let j = j0; j < j1; j++) {
        for (let i = i0; i < i1; i++) {
          const k = j * S2.w + i;
          S2.wet[k] = isWet(terrain2.typeAt((S2.gx0 + i) * CELL + CELL / 2, (S2.gy0 + j) * CELL + CELL / 2)) ? 1 : 0;
          S2.hgt[k] = 0;
          S2.vel[k] = 0;
        }
      }
    }
    function countWet() {
      let n = 0;
      for (let k = 0; k < S2.wet.length; k++) n += S2.wet[k];
      S2.any = n > 0;
    }
    function follow(terrain2) {
      const gx0 = Math.floor((camera.x - PAD) / CELL), gy0 = Math.floor((camera.y - PAD) / CELL);
      const w = Math.ceil((view.w + PAD * 2) / CELL) + 1, h = Math.ceil((view.h + PAD * 2) / CELL) + 1;
      if (!S2.hgt || w !== S2.w || h !== S2.h) {
        S2.w = w;
        S2.h = h;
        S2.gx0 = gx0;
        S2.gy0 = gy0;
        S2.hgt = new Float32Array(w * h);
        S2.vel = new Float32Array(w * h);
        S2.wet = new Uint8Array(w * h);
        if (typeof document !== "undefined") {
          S2.canvas = document.createElement("canvas");
          S2.canvas.width = w;
          S2.canvas.height = h;
          S2.cx = S2.canvas.getContext("2d");
          S2.img = S2.cx.createImageData(w, h);
        }
        fill(terrain2, 0, 0, w, h);
        countWet();
        return;
      }
      const dx = gx0 - S2.gx0, dy = gy0 - S2.gy0;
      if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
      if (Math.abs(dx) >= w || Math.abs(dy) >= h) {
        S2.gx0 = gx0;
        S2.gy0 = gy0;
        fill(terrain2, 0, 0, w, h);
        countWet();
        return;
      }
      const H3 = new Float32Array(w * h), V2 = new Float32Array(w * h), Wt = new Uint8Array(w * h);
      for (let j = 0; j < h; j++) {
        const sj = j + dy;
        if (sj < 0 || sj >= h) continue;
        for (let i = 0; i < w; i++) {
          const si = i + dx;
          if (si < 0 || si >= w) continue;
          const a = j * w + i, b = sj * w + si;
          H3[a] = S2.hgt[b];
          V2[a] = S2.vel[b];
          Wt[a] = S2.wet[b];
        }
      }
      S2.hgt = H3;
      S2.vel = V2;
      S2.wet = Wt;
      S2.gx0 = gx0;
      S2.gy0 = gy0;
      if (dx > 0) fill(terrain2, w - dx, 0, w, h);
      else if (dx < 0) fill(terrain2, 0, 0, -dx, h);
      if (dy > 0) fill(terrain2, 0, h - dy, w, h);
      else if (dy < 0) fill(terrain2, 0, 0, w, -dy);
      countWet();
    }
    function disturb(x, y, r, amt) {
      if (!S2.hgt) return;
      const cx = x / CELL - S2.gx0, cy = y / CELL - S2.gy0;
      const cr = Math.max(1.3, r / CELL);
      const xa = Math.max(1, Math.floor(cx - cr)), xb = Math.min(S2.w - 2, Math.ceil(cx + cr));
      const ya = Math.max(1, Math.floor(cy - cr)), yb = Math.min(S2.h - 2, Math.ceil(cy + cr));
      for (let yy = ya; yy <= yb; yy++) {
        for (let xx = xa; xx <= xb; xx++) {
          const d = Math.hypot(xx - cx, yy - cy);
          if (d > cr) continue;
          const i = yy * S2.w + xx;
          if (!S2.wet[i]) continue;
          S2.vel[i] += amt * (0.5 + 0.5 * Math.cos(Math.PI * d / cr));
        }
      }
    }
    function ripple(x, y, r0, r1, life, alpha) {
      if (S2.ripples.length > 18) S2.ripples.shift();
      S2.ripples.push({ x, y, r0, r1, t: 0, life, alpha });
    }
    const wetAt = (x, y) => {
      const i = Math.floor(x / CELL) - S2.gx0, j = Math.floor(y / CELL) - S2.gy0;
      return i >= 0 && j >= 0 && i < S2.w && j < S2.h && S2.wet[j * S2.w + i] === 1;
    };
    function randomCell(shore) {
      for (let tries = 0; tries < 30; tries++) {
        const i = 2 + Math.floor(Math.random() * (S2.w - 4)), j = 2 + Math.floor(Math.random() * (S2.h - 4));
        const k = j * S2.w + i;
        if (!S2.wet[k]) continue;
        const edge = !S2.wet[k - 1] || !S2.wet[k + 1] || !S2.wet[k - S2.w] || !S2.wet[k + S2.w];
        if (shore !== edge) continue;
        return { x: (S2.gx0 + i) * CELL + CELL / 2, y: (S2.gy0 + j) * CELL + CELL / 2 };
      }
      return null;
    }
    function step2() {
      const { w, h, hgt, vel, wet } = S2;
      for (let y = 1; y < h - 1; y++) {
        let i = y * w + 1;
        for (let x = 1; x < w - 1; x++, i++) {
          if (!wet[i]) {
            vel[i] = 0;
            hgt[i] = 0;
            continue;
          }
          const lap = hgt[i - 1] + hgt[i + 1] + hgt[i - w] + hgt[i + w] - 4 * hgt[i];
          vel[i] = (vel[i] + lap * C2) * DAMP2;
        }
      }
      for (let i = 0; i < hgt.length; i++) hgt[i] += vel[i];
    }
    function update(dt, terrain2) {
      S2.t += dt;
      follow(terrain2);
      for (let i = S2.ripples.length - 1; i >= 0; i--) {
        const r = S2.ripples[i];
        r.t += dt;
        if (r.t >= r.life) S2.ripples.splice(i, 1);
      }
      if (!S2.any) return;
      const p = world.player;
      if (p && !p.dead && wetAt(p.x, p.y + p.r * 0.5)) {
        if (S2.lastP) {
          const sp = Math.hypot(p.x - S2.lastP.x, p.y - S2.lastP.y) / Math.max(dt, 1e-4);
          if (sp > 25) {
            disturb(p.x, p.y + p.r * 0.5, p.r, -Math.min(sp, 1400) * 9e-4);
            S2.stepT -= dt;
            if (S2.stepT <= 0) {
              ripple(p.x, p.y + p.r * 0.5, p.r * 0.5, p.r * 2.6, 0.8, p.dashing || p.ghost ? 0.42 : 0.28);
              S2.stepT = p.dashing || p.ghost ? 0.14 : 0.34;
            }
          }
        }
      }
      if (p) S2.lastP = { x: p.x, y: p.y };
      for (const e of world.enemies) {
        if (e.dead || e.spawning || (e.z || 0) > 4 || !wetAt(e.x, e.y)) continue;
        const sp = Math.hypot(e.mvx || e.vx || 0, e.mvy || e.vy || 0);
        if (sp > 20) disturb(e.x, e.y, e.r, -Math.min(sp, 900) * 7e-4);
      }
      S2.lapT -= dt;
      if (S2.lapT <= 0) {
        S2.lapT = rand(0.18, 0.4) * S2.calm;
        const c = randomCell(true);
        if (c) disturb(c.x, c.y, 26, rand(0.35, 0.7));
      }
      S2.dripT -= dt;
      if (S2.dripT <= 0) {
        S2.dripT = rand(0.25, 0.9) * S2.calm;
        const c = randomCell(false);
        if (c) {
          disturb(c.x, c.y, 14, -rand(0.6, 1.1));
          ripple(c.x, c.y, 2, rand(18, 36), 1, 0.3);
        }
      }
      step2();
    }
    function draw(ctx3) {
      if (!S2.any || !S2.img) return;
      const { w, h, hgt, wet } = S2;
      const d = S2.img.data;
      const t = S2.t;
      const tint = S2.tint.glint;
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const k = j * w + i, o = k * 4;
          if (!wet[k] || i === 0 || j === 0 || i === w - 1 || j === h - 1) {
            d[o + 3] = 0;
            continue;
          }
          const wx = S2.gx0 + i, wy = S2.gy0 + j;
          let light = (hgt[k - 1] - hgt[k + 1] + hgt[k - w] - hgt[k + w]) * LIGHT + Math.sin(wx * 0.55 + t * 0.9) * Math.sin(wy * 0.7 - t * 0.6) * 0.05;
          if (light > 1.3) light = 1.3;
          else if (light < -1.3) light = -1.3;
          if (light > 0) {
            const q = Math.min(light, GLINT_CAP);
            d[o] = tint[0];
            d[o + 1] = tint[1];
            d[o + 2] = tint[2];
            d[o + 3] = q * 120;
          } else {
            d[o] = 0;
            d[o + 1] = 14;
            d[o + 2] = 22;
            d[o + 3] = Math.min(90, -light * 0.5 * 160);
          }
        }
      }
      S2.cx.putImageData(S2.img, 0, 0);
      ctx3.save();
      ctx3.imageSmoothingEnabled = true;
      ctx3.drawImage(S2.canvas, 1, 1, w - 2, h - 2, (S2.gx0 + 1) * CELL, (S2.gy0 + 1) * CELL, (w - 2) * CELL, (h - 2) * CELL);
      ctx3.restore();
      ctx3.lineWidth = 1.4;
      for (const r of S2.ripples) {
        const k = r.t / r.life;
        const rad = r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k));
        ctx3.strokeStyle = `rgba(${S2.tint.ring},${(r.alpha * 0.4 * (1 - k)).toFixed(3)})`;
        ctx3.beginPath();
        ctx3.ellipse(r.x, r.y, rad, rad * 0.62, 0, 0, TAU);
        ctx3.stroke();
      }
    }
    return {
      update,
      draw,
      disturb,
      /** 'clear' or 'swamp': the colour its glints and rings take. */
      setTint(name) {
        S2.tint = TINTS[name] || TINTS.clear;
      },
      splash(x, y, r, amt) {
        disturb(x, y, r, amt);
        ripple(x, y, r * 0.4, r * 2.4, 1, 0.5);
      },
      /**
       * How still the water is when nothing is touching it. The lapping and the
       * drips fire on timers tuned for a pond a few hundred units across; over a
       * lake two thousand wide there is several times as much shore on screen at
       * once, so at calm 1 it never stops twitching. Higher is quieter.
       */
      setCalm(k) {
        S2.calm = Math.max(0.2, k);
      },
      wetAt,
      /** For tests: how much of the grid is water. */
      stats: () => ({ w: S2.w, h: S2.h, any: S2.any })
    };
  }

  // savi/src/audio.js
  var ctx = null;
  var master = null;
  var noiseBuf = null;
  var compressor = null;
  var musicBus = null;
  var audio = {
    muted: false,
    music: true,
    active: false,
    ready: false,
    suspended: false,
    musicVolume: 0.7,
    // the player's slider, 0..1
    bossTrackUntil: 0
    // a boss playing its own music (the Maestro) keeps this in the future
  };
  var MUSIC_MAX_GAIN = 2.4;
  function musicGain(v) {
    return Math.pow(clamp(v, 0, 1), 1.6) * MUSIC_MAX_GAIN;
  }
  var makeup = null;
  var outTap = null;
  function initAudio() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 4e-3;
    compressor.release.value = 0.2;
    makeup = ctx.createGain();
    makeup.gain.value = 1.5;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2.5;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 1e-3;
    limiter.release.value = 0.08;
    outTap = ctx.createAnalyser();
    outTap.fftSize = 2048;
    compressor.connect(makeup).connect(limiter).connect(outTap).connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(compressor);
    musicBus = ctx.createGain();
    musicBus.gain.value = musicGain(audio.musicVolume);
    musicBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    audio.ready = true;
  }
  function now() {
    return ctx.currentTime;
  }
  function tone({
    freq = 440,
    freq2 = null,
    type = "square",
    dur = 0.12,
    vol = 0.25,
    delay = 0,
    attack = 4e-3,
    at = null,
    out = null,
    filter = null
  }) {
    if (!ctx || audio.muted) return;
    const t = at !== null ? at : now() + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freq2 !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t + dur);
    gain.gain.setValueAtTime(1e-4, t);
    gain.gain.linearRampToValueAtTime(vol, t + attack);
    gain.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type || "lowpass";
      f.frequency.setValueAtTime(filter.freq, t);
      if (filter.freq2) f.frequency.exponentialRampToValueAtTime(filter.freq2, t + dur);
      f.Q.value = filter.q || 1;
      osc.connect(f).connect(gain);
    } else {
      osc.connect(gain);
    }
    gain.connect(out || master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
  function noise({
    dur = 0.12,
    vol = 0.3,
    freq = 1200,
    freq2 = null,
    q = 1,
    type = "lowpass",
    delay = 0,
    at = null,
    out = null
  }) {
    if (!ctx || audio.muted) return;
    const t = at !== null ? at : now() + delay;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = rand(0.85, 1.15);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (freq2 !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(40, freq2), t + dur);
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(1e-4, t + dur);
    src.connect(filter).connect(gain).connect(out || master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
  var sfx = {
    swing(power = 1) {
      noise({ dur: 0.13 * power, vol: 0.16, freq: 2600, freq2: 500, type: "bandpass", q: 0.7 });
    },
    hit(power = 1) {
      noise({ dur: 0.07, vol: 0.26 * power, freq: 1800, freq2: 300 });
      tone({ freq: 180 * rand(0.9, 1.1), freq2: 60, type: "triangle", dur: 0.09, vol: 0.2 * power });
    },
    crit() {
      tone({ freq: 900, freq2: 1600, type: "square", dur: 0.09, vol: 0.16 });
      noise({ dur: 0.1, vol: 0.3, freq: 4e3, freq2: 800, type: "bandpass", q: 1.4 });
    },
    hurt() {
      tone({ freq: 260, freq2: 70, type: "sawtooth", dur: 0.3, vol: 0.3 });
      noise({ dur: 0.2, vol: 0.25, freq: 900, freq2: 120 });
    },
    dash() {
      noise({ dur: 0.2, vol: 0.2, freq: 320, freq2: 3200, type: "bandpass", q: 1.1 });
    },
    shoot() {
      tone({ freq: 720, freq2: 240, type: "square", dur: 0.09, vol: 0.13 });
    },
    arrow() {
      noise({ dur: 0.12, vol: 0.18, freq: 3e3, freq2: 900, type: "bandpass", q: 2 });
    },
    explode() {
      noise({ dur: 0.55, vol: 0.42, freq: 900, freq2: 45 });
      tone({ freq: 110, freq2: 30, type: "sawtooth", dur: 0.42, vol: 0.28 });
    },
    telegraph() {
      tone({ freq: 300, freq2: 620, type: "sine", dur: 0.3, vol: 0.1 });
    },
    spawn() {
      tone({ freq: 90, freq2: 320, type: "sine", dur: 0.35, vol: 0.14 });
    },
    pickup() {
      tone({ freq: 880, type: "sine", dur: 0.08, vol: 0.16 });
      tone({ freq: 1320, type: "sine", dur: 0.12, vol: 0.13, delay: 0.06 });
    },
    heal() {
      [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: "sine", dur: 0.3, vol: 0.13, delay: i * 0.07 }));
    },
    boon() {
      [392, 523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: "triangle", dur: 0.55, vol: 0.14, delay: i * 0.08 }));
    },
    door() {
      tone({ freq: 160, freq2: 420, type: "sine", dur: 0.5, vol: 0.16 });
      noise({ dur: 0.5, vol: 0.12, freq: 400, freq2: 1600, type: "bandpass", q: 0.6 });
    },
    death() {
      [440, 330, 262, 196].forEach((f, i) => tone({ freq: f, freq2: f * 0.5, type: "sawtooth", dur: 0.7, vol: 0.2, delay: i * 0.16 }));
    },
    bossRoar() {
      tone({ freq: 70, freq2: 180, type: "sawtooth", dur: 1.4, vol: 0.34 });
      noise({ dur: 1.4, vol: 0.3, freq: 260, freq2: 90 });
    },
    bossDown() {
      [523, 587, 698, 880, 1047].forEach((f, i) => tone({ freq: f, type: "triangle", dur: 0.8, vol: 0.18, delay: i * 0.13 }));
      noise({ dur: 1, vol: 0.2, freq: 1400, freq2: 120, delay: 0.1 });
    },
    ui() {
      tone({ freq: 620, type: "triangle", dur: 0.05, vol: 0.11 });
    },
    // ONE ROW UP OR DOWN. Quieter and shorter than `ui`, because a list you are
    // walking with a stick makes this sound a dozen times in a row. savi.js has
    // called sfx.tick() from the belt since the belt went in and there was no
    // such function, so moving the selection with a key or a stick threw inside
    // the keydown handler - a phone never found it, because a thumb taps the
    // tool it wants directly.
    tick() {
      tone({ freq: 1180, type: "triangle", dur: 0.022, vol: 0.055 });
    },
    block() {
      tone({ freq: 1400, freq2: 700, type: "square", dur: 0.08, vol: 0.16 });
      noise({ dur: 0.12, vol: 0.24, freq: 5e3, freq2: 1500, type: "bandpass", q: 2.5 });
    },
    // --- boss kit. Everything a phone must hear keeps energy above ~250 Hz. ---
    beam() {
      tone({ freq: 380, freq2: 1200, type: "sawtooth", dur: 0.35, vol: 0.12, filter: { freq: 2400 } });
      noise({ dur: 0.4, vol: 0.18, freq: 2600, freq2: 600, type: "bandpass", q: 1.2 });
    },
    thud() {
      noise({ dur: 0.22, vol: 0.3, freq: 700, freq2: 90 });
      tone({ freq: 300, freq2: 90, type: "triangle", dur: 0.16, vol: 0.18 });
    },
    // Version 4, Vesper: a revolver crack, a church-bell toll, a cylinder click.
    gunshot() {
      noise({ dur: 0.16, vol: 0.28, freq: 1800, freq2: 300, type: "bandpass", q: 0.8 });
      tone({ freq: 160, freq2: 60, type: "triangle", dur: 0.12, vol: 0.18 });
    },
    // Nagaraja: a long hiss and a tail rattle.
    hiss() {
      noise({ dur: 0.7, vol: 0.16, freq: 5200, freq2: 2600, type: "highpass", q: 0.6 });
    },
    rattle() {
      for (let k = 0; k < 7; k++) noise({ dur: 0.035, vol: 0.12, freq: 3800, type: "bandpass", q: 3, delay: k * 0.055 });
    },
    bell() {
      [220, 440, 660, 880].forEach((f, i) => tone({ freq: f, type: "sine", dur: 1.8 - i * 0.3, vol: 0.12 / (i + 1), attack: 5e-3 }));
    },
    click() {
      tone({ freq: 2400, type: "square", dur: 0.025, vol: 0.08 });
      tone({ freq: 1600, type: "square", dur: 0.025, vol: 0.06, delay: 0.07 });
    },
    chime() {
      [784, 988, 1175].forEach((f, i) => tone({ freq: f, type: "sine", dur: 0.4, vol: 0.09, delay: i * 0.05 }));
    },
    splash() {
      noise({ dur: 0.4, vol: 0.28, freq: 1600, freq2: 300, type: "bandpass", q: 0.8 });
      tone({ freq: 420, freq2: 160, type: "sine", dur: 0.25, vol: 0.12 });
    },
    /**
     * A foot going into shallow water, which is not a splash. A splash is a body
     * falling in; this is a soft low swish with none of the bright top on it, so
     * a hundred of them in a row do not become a noise.
     */
    wade(power = 1) {
      noise({ dur: 0.26 * power, vol: 0.075, freq: 760, freq2: 180, type: "lowpass", q: 0.7 });
      tone({ freq: 190, freq2: 120, type: "sine", dur: 0.14, vol: 0.035 });
    },
    /** The broom going past, whether or not it finds anything to move. */
    swish(power = 1) {
      noise({ dur: 0.2 * power, vol: 0.055, freq: 2400, freq2: 900, type: "bandpass", q: 0.9 });
    },
    whirr() {
      tone({ freq: 260, freq2: 780, type: "sawtooth", dur: 0.6, vol: 0.1, filter: { freq: 1500 } });
    },
    exposed() {
      tone({ freq: 988, type: "triangle", dur: 0.12, vol: 0.14 });
      tone({ freq: 1319, type: "triangle", dur: 0.2, vol: 0.14, delay: 0.08 });
    },
    // Mau, the cat of nine lives. A meow is a nasal "m" into a rising-falling
    // vowel: a filtered saw sweeping up, then down.
    meow(pitch = 1) {
      tone({ freq: 420 * pitch, freq2: 820 * pitch, type: "sawtooth", dur: 0.16, vol: 0.12, filter: { type: "bandpass", freq: 1300 * pitch, q: 2.5 } });
      tone({ freq: 820 * pitch, freq2: 480 * pitch, type: "sawtooth", dur: 0.34, vol: 0.12, delay: 0.14, filter: { type: "bandpass", freq: 1100 * pitch, freq2: 700 * pitch, q: 2.5 } });
      tone({ freq: 840 * pitch, freq2: 500 * pitch, type: "sine", dur: 0.32, vol: 0.05, delay: 0.15 });
    },
    catHiss() {
      noise({ dur: 0.55, vol: 0.2, freq: 3600, freq2: 5200, type: "highpass", q: 0.7 });
      noise({ dur: 0.3, vol: 0.08, freq: 1800, type: "bandpass", q: 1.5, delay: 0.05 });
    },
    /** A purr: a fast flutter of low, soft bursts (~25 a second). */
    purr(dur = 1) {
      const n = Math.round(dur * 25);
      for (let k = 0; k < n; k++) noise({ dur: 0.03, vol: 0.1, freq: 260, type: "lowpass", delay: k * 0.04 });
    },
    yowl() {
      tone({ freq: 300, freq2: 520, type: "sawtooth", dur: 0.35, vol: 0.16, filter: { type: "bandpass", freq: 900, q: 2 } });
      tone({ freq: 520, freq2: 220, type: "sawtooth", dur: 0.7, vol: 0.16, delay: 0.3, filter: { type: "bandpass", freq: 800, freq2: 400, q: 2 } });
      noise({ dur: 0.9, vol: 0.12, freq: 700, freq2: 200, type: "bandpass", q: 0.8 });
    },
    trill() {
      for (let k = 0; k < 5; k++) tone({ freq: 700 + k * 60, type: "triangle", dur: 0.05, vol: 0.09, delay: k * 0.045 });
    },
    scratch() {
      for (let k = 0; k < 3; k++) noise({ dur: 0.06, vol: 0.2, freq: 2600, freq2: 900, type: "bandpass", q: 1.8, delay: k * 0.05 });
    },
    /** Her collar bell: you can hear her when you can't see her. */
    jingle() {
      tone({ freq: 2640, type: "sine", dur: 0.18, vol: 0.07 });
      tone({ freq: 3520, type: "sine", dur: 0.14, vol: 0.05, delay: 0.06 });
    },
    coin() {
      tone({ freq: 1980, type: "square", dur: 0.05, vol: 0.06 });
      tone({ freq: 2970, type: "triangle", dur: 0.12, vol: 0.06, delay: 0.04 });
    },
    thunder() {
      noise({ dur: 1.2, vol: 0.4, freq: 1200, freq2: 60 });
      tone({ freq: 80, freq2: 35, type: "sawtooth", dur: 1, vol: 0.22 });
    },
    // The Grandmaster: a wooden piece set down, and a chess clock being pressed.
    clack(pitch = 1) {
      noise({ dur: 0.05, vol: 0.22, freq: 1900 * pitch, type: "bandpass", q: 2.2 });
      tone({ freq: 620 * pitch, freq2: 420 * pitch, type: "triangle", dur: 0.07, vol: 0.12 });
    },
    chessClock() {
      tone({ freq: 1500, type: "square", dur: 0.025, vol: 0.08 });
      noise({ dur: 0.03, vol: 0.12, freq: 2600, type: "bandpass", q: 3, delay: 0.01 });
    },
    // Anansi: legs skittering, a snap of silk, a hornet swarm, a talking drum.
    skitter() {
      for (let k = 0; k < 6; k++) noise({ dur: 0.02, vol: 0.1, freq: 3200, type: "bandpass", q: 3, delay: k * 0.03 });
    },
    silk() {
      noise({ dur: 0.22, vol: 0.16, freq: 5200, freq2: 1800, type: "bandpass", q: 1.2 });
      tone({ freq: 900, freq2: 1500, type: "sine", dur: 0.12, vol: 0.05 });
    },
    buzz(dur = 0.8) {
      const n = Math.round(dur * 12);
      for (let k = 0; k < n; k++) tone({ freq: 210 + k % 3 * 18, type: "sawtooth", dur: 0.09, vol: 0.05, delay: k * 0.07, filter: { freq: 1400, q: 1 } });
    },
    /** An atumpan-style talking drum: the pitch bends as it speaks. */
    talkingDrum(up = true) {
      tone({ freq: up ? 140 : 220, freq2: up ? 230 : 130, type: "sine", dur: 0.32, vol: 0.3 });
      noise({ dur: 0.05, vol: 0.12, freq: 900, type: "bandpass", q: 1.5 });
    },
    roar(pitch = 1) {
      tone({ freq: 120 * pitch, freq2: 320 * pitch, type: "sawtooth", dur: 0.9, vol: 0.28, filter: { freq: 1800 } });
      noise({ dur: 0.9, vol: 0.26, freq: 900 * pitch, freq2: 260, type: "bandpass", q: 0.7 });
    }
  };
  var BPM = 104;
  var STEP = 60 / BPM / 4;
  var LOOKAHEAD = 0.12;
  var TICK_MS = 25;
  var midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
  var PROGRESSION = [
    { root: 38, pad: [50, 53, 57], arp: [62, 65, 69, 74] },
    // Dm
    { root: 34, pad: [46, 50, 53], arp: [58, 62, 65, 70] },
    // Bb
    { root: 36, pad: [48, 52, 55], arp: [60, 64, 67, 72] },
    // C
    { root: 33, pad: [45, 48, 52], arp: [57, 60, 64, 69] }
    // Am
  ];
  var ARP_WALK = [0, 1, 2, 3, 2, 1, 2, 3];
  var BASS_STEPS = [0, 3, 6, 8, 11, 14];
  var schedTimer = null;
  var nextNoteTime = 0;
  var stepIndex = 0;
  var intensity = 1;
  function setMusicIntensity(level) {
    intensity = clamp(level | 0, 0, 2);
  }
  function scheduleStep(n, t) {
    const s = n % 16;
    const chord = PROGRESSION[Math.floor(n / 16) % PROGRESSION.length];
    const bus = musicBus;
    if (s === 0) {
      for (const m of chord.pad) {
        tone({
          freq: midi(m + 12),
          type: "triangle",
          dur: STEP * 15,
          vol: intensity === 0 ? 0.05 : 0.04,
          attack: 0.28,
          at: t,
          out: bus
        });
      }
    }
    const bassOn = intensity === 0 ? s === 0 || s === 8 : BASS_STEPS.includes(s);
    if (bassOn) {
      const f = midi(chord.root);
      tone({
        freq: f,
        type: "sawtooth",
        dur: STEP * 1.8,
        vol: 0.11,
        at: t,
        out: bus,
        filter: { freq: intensity === 2 ? 1100 : 760, freq2: 240, q: 5 }
      });
      if (s === 0 || s === 8) {
        tone({
          freq: f * 2,
          type: "square",
          dur: STEP * 1.2,
          vol: 0.035,
          at: t,
          out: bus,
          filter: { freq: 1400, q: 1 }
        });
      }
    }
    const arpEvery = intensity === 2 ? 1 : 2;
    if (s % arpEvery === 0) {
      const walk = ARP_WALK[Math.floor(s / 2) % ARP_WALK.length];
      const note = chord.arp[(walk + (intensity === 2 && s % 2 ? 2 : 0)) % chord.arp.length];
      tone({
        freq: midi(note),
        type: intensity === 2 ? "sawtooth" : "triangle",
        dur: STEP * 1.6,
        vol: intensity === 0 ? 0.05 : 0.065,
        at: t,
        out: bus,
        filter: intensity === 2 ? { freq: 2400, freq2: 700, q: 2 } : null
      });
    }
    if (intensity === 0) return;
    const kickOn = intensity === 2 ? s % 4 === 0 : s === 0 || s === 8;
    if (kickOn) {
      tone({ freq: 150, freq2: 45, type: "sine", dur: 0.2, vol: 0.28, at: t, out: bus });
      noise({ dur: 0.02, vol: 0.12, freq: 3500, type: "highpass", at: t, out: bus });
    }
    if (s % 4 === 2 || intensity === 2 && s % 2 === 1) {
      noise({ dur: 0.04, vol: s % 4 === 2 ? 0.05 : 0.025, freq: 7e3, type: "highpass", at: t, out: bus });
    }
    if (intensity === 2 && (s === 4 || s === 12)) {
      noise({ dur: 0.14, vol: 0.12, freq: 1800, type: "bandpass", q: 0.8, at: t, out: bus });
      tone({ freq: 210, freq2: 140, type: "triangle", dur: 0.1, vol: 0.08, at: t, out: bus });
    }
  }
  var bossTheme = null;
  var ambientTheme = null;
  var pendingAmbient;
  var swapAt = 0;
  var themeFade = null;
  var FADE = 1.4;
  function fadeBus() {
    if (!ctx || !musicBus) return musicBus;
    if (!themeFade) {
      themeFade = ctx.createGain();
      themeFade.gain.value = 1;
      themeFade.connect(musicBus);
    }
    return themeFade;
  }
  var themeKit = {
    get ctx() {
      return ctx;
    },
    get bus() {
      return fadeBus();
    },
    get intensity() {
      return intensity;
    },
    muted: () => audio.muted,
    tone,
    noise,
    midi,
    boss: null
  };
  function setAmbientTheme(theme) {
    if (theme === (pendingAmbient === void 0 ? ambientTheme : pendingAmbient)) return;
    if (!ctx || !schedTimer || !ambientTheme) {
      ambientTheme = theme;
      pendingAmbient = void 0;
      stepIndex = 0;
      if (themeFade) {
        themeFade.gain.cancelScheduledValues(ctx.currentTime);
        themeFade.gain.setValueAtTime(1, ctx.currentTime);
      }
      return;
    }
    pendingAmbient = theme;
    swapAt = ctx.currentTime + FADE;
    const g = fadeBus().gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.linearRampToValueAtTime(1e-4, swapAt);
  }
  function scheduler() {
    if (!ctx) return;
    if (nextNoteTime < ctx.currentTime - 0.2) nextNoteTime = ctx.currentTime + 0.05;
    if (pendingAmbient !== void 0 && ctx.currentTime >= swapAt) {
      ambientTheme = pendingAmbient;
      pendingAmbient = void 0;
      stepIndex = 0;
      nextNoteTime = Math.max(nextNoteTime, ctx.currentTime + 0.05);
      const g = fadeBus().gain;
      g.cancelScheduledValues(ctx.currentTime);
      g.setValueAtTime(1e-4, ctx.currentTime);
      g.linearRampToValueAtTime(1, ctx.currentTime + 0.6);
    }
    while (nextNoteTime < ctx.currentTime + LOOKAHEAD) {
      const theme = intensity === 2 && bossTheme || ambientTheme;
      if (!audio.muted && !(performance.now() < audio.bossTrackUntil)) {
        if (theme) theme.step(stepIndex, nextNoteTime, themeKit);
        else scheduleStep(stepIndex, nextNoteTime);
      }
      nextNoteTime += theme ? 60 / theme.tempo(themeKit) / 4 : STEP;
      stepIndex++;
    }
  }
  function refreshMusic() {
    const want = !!ctx && audio.music && audio.active && !audio.suspended;
    if (want && !schedTimer) {
      stepIndex = 0;
      nextNoteTime = ctx.currentTime + 0.06;
      schedTimer = setInterval(scheduler, TICK_MS);
      scheduler();
    } else if (!want && schedTimer) {
      clearInterval(schedTimer);
      schedTimer = null;
    }
  }
  function setMusicActive(on) {
    audio.active = !!on;
    refreshMusic();
  }
  function setMusicEnabled(on) {
    audio.music = !!on;
    refreshMusic();
    return audio.music;
  }
  function setMusicVolume(v) {
    audio.musicVolume = clamp(v, 0, 1);
    if (musicBus) musicBus.gain.setTargetAtTime(musicGain(audio.musicVolume), ctx.currentTime, 0.03);
    return audio.musicVolume;
  }
  var lastPreview = -1;
  function previewMusic() {
    if (!ctx || audio.muted || schedTimer) return;
    if (ctx.currentTime - lastPreview < 0.45) return;
    lastPreview = ctx.currentTime;
    if (ctx.state !== "running") ctx.resume().catch(() => {
    });
    const chord = PROGRESSION[0];
    const t0 = ctx.currentTime + 0.02;
    for (const m of chord.pad) {
      tone({ freq: midi(m + 12), type: "triangle", dur: 0.95, vol: 0.04, attack: 0.08, at: t0, out: musicBus });
    }
    chord.arp.forEach((m, i) => {
      tone({ freq: midi(m), type: "triangle", dur: STEP * 1.6, vol: 0.065, at: t0 + i * STEP * 2, out: musicBus });
    });
  }
  function unlockAudio() {
    if (!ctx || audio.suspended) return;
    if (ctx.state !== "running") ctx.resume().catch(() => {
    });
  }
  function setVolume(v) {
    if (master) master.gain.value = audio.muted ? 0 : clamp(v, 0, 1);
  }

  // savi/src/dualsense.js
  var TRIGGER = {
    off: () => ({ mode: 0, params: [] }),
    /** Constant resistance from `position` (0-9) at `strength` (0-8). */
    feedback: (position, strength) => ({
      mode: 1,
      params: [clampByte(position, 0, 9), clampByte(strength, 0, 8)]
    }),
    /** Resistance between `start` and `end`, snapping past it — like a trigger pull. */
    weapon: (start, end, strength) => ({
      mode: 2,
      params: [clampByte(start, 2, 7), clampByte(end, 3, 8), clampByte(strength, 0, 8)]
    }),
    /** Buzzes at `frequency` Hz past `position`. */
    vibration: (position, amplitude, frequency) => ({
      mode: 6,
      params: [clampByte(position, 0, 9), clampByte(amplitude, 0, 8), clampByte(frequency, 0, 255)]
    })
  };
  function clampByte(v, lo, hi) {
    return Math.max(lo, Math.min(hi, Math.round(v || 0))) & 255;
  }

  // savi/src/gamepad.js
  var pad = {
    connected: false,
    index: -1,
    id: "",
    isDualSense: false,
    move: { x: 0, y: 0 },
    aim: { x: 1, y: 0 },
    aimActive: false,
    attack: false,
    attackPressed: false,
    spellPressed: null,
    // slot 0-3 cast this frame (hold R1 + a face button)
    special: false,
    specialPressed: false,
    dash: false,
    dashPressed: false,
    grenade: false,
    grenadePressed: false,
    reloadPressed: false,
    // R3: reload the blunderbuss
    aimPush: 0,
    pausePressed: false,
    mutePressed: false,
    confirmPressed: false,
    backPressed: false
  };
  function activeGamepad() {
    if (!navigator.getGamepads) return null;
    const list2 = navigator.getGamepads();
    if (!list2) return null;
    if (pad.index >= 0 && list2[pad.index]) return list2[pad.index];
    for (const gp of list2) {
      if (gp && gp.connected) {
        pad.index = gp.index;
        pad.id = gp.id;
        pad.isDualSense = /dualsense|0ce6|dualshock/i.test(gp.id);
        pad.connected = true;
        return gp;
      }
    }
    return null;
  }
  function rumble(strong, weak, ms) {
    const gp = activeGamepad();
    if (!gp) return;
    const act = gp.vibrationActuator;
    if (!act || !act.playEffect) return;
    try {
      act.playEffect("dual-rumble", {
        startDelay: 0,
        duration: clamp(ms, 10, 900),
        strongMagnitude: clamp(strong, 0, 1),
        weakMagnitude: clamp(weak, 0, 1)
      }).catch(() => {
      });
    } catch {
    }
  }
  var WEAPON_TRIGGER = {
    blade: TRIGGER.feedback(2, 3),
    // light, fast
    spear: TRIGGER.feedback(4, 5),
    // firmer thrust
    shield: TRIGGER.feedback(3, 8),
    // heavy bash
    maul: TRIGGER.feedback(6, 8),
    // a heavy haft
    gun: TRIGGER.weapon(3, 6, 8),
    // a hammer that breaks
    longarm: TRIGGER.weapon(4, 7, 8),
    // a stiffer double trigger
    bow: TRIGGER.weapon(2, 7, 6)
    // draw resistance, then a release click
  };

  // savi/src/fullscreen.js
  var screenState = {
    fullscreen: false,
    wakeLock: null,
    orientationLocked: false,
    supported: false
  };
  function el() {
    return document.documentElement;
  }
  function touchLike() {
    return window.matchMedia("(pointer: coarse)").matches || (navigator.maxTouchPoints || 0) > 0 || "ontouchstart" in window;
  }
  function fullscreenSupported() {
    const d = document;
    return !!(el().requestFullscreen || el().webkitRequestFullscreen || d.fullscreenEnabled || d.webkitFullscreenEnabled);
  }
  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }
  async function enterFullscreen() {
    if (isFullscreen()) return true;
    const e = el();
    const req = e.requestFullscreen || e.webkitRequestFullscreen || e.mozRequestFullScreen;
    if (!req) return false;
    try {
      await req.call(e, { navigationUI: "hide" });
      await lockOrientation();
      await requestWakeLock();
      return true;
    } catch {
      return false;
    }
  }
  async function exitFullscreen() {
    if (!isFullscreen()) return;
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    try {
      if (exit) await exit.call(document);
    } catch {
    }
    releaseWakeLock();
  }
  async function toggleFullscreen() {
    if (isFullscreen()) {
      await exitFullscreen();
      return false;
    }
    return enterFullscreen();
  }
  async function lockOrientation() {
    const so = screen.orientation;
    if (!so || !so.lock) return;
    if (!touchLike()) return;
    try {
      await so.lock("landscape");
      screenState.orientationLocked = true;
    } catch {
    }
  }
  async function requestWakeLock() {
    if (!("wakeLock" in navigator) || screenState.wakeLock) return;
    try {
      screenState.wakeLock = await navigator.wakeLock.request("screen");
      screenState.wakeLock.addEventListener("release", () => {
        screenState.wakeLock = null;
      });
    } catch {
    }
  }
  function releaseWakeLock() {
    if (!screenState.wakeLock) return;
    try {
      screenState.wakeLock.release();
    } catch {
    }
    screenState.wakeLock = null;
  }

  // savi/src/build.js
  var BUILD = 58;
  var BUILT = "2026-09-27 23:56";

  // savi/src/update.js
  var import_meta = {};
  async function latestBuild() {
    try {
      const url = new URL("./build.js", import_meta.url);
      url.searchParams.set("t", Date.now());
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return null;
      const m = /BUILD\s*=\s*(\d+)/.exec(await res.text());
      return m ? Number(m[1]) : null;
    } catch {
      return null;
    }
  }
  async function refetchModules(entry, onFile) {
    const seen = /* @__PURE__ */ new Set();
    const IMPORT = /(?:import|export)\s[^'"]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|import\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;
    let wave = [entry];
    while (wave.length) {
      const next = [];
      await Promise.all(wave.map(async (href) => {
        if (seen.has(href)) return;
        seen.add(href);
        const res = await fetch(href, { cache: "reload" }).catch(() => null);
        if (!res || !res.ok) return;
        onFile(seen.size);
        const text = await res.text();
        for (const m of text.matchAll(IMPORT)) {
          const dep = new URL(m[1] || m[2], href).href;
          if (!seen.has(dep)) next.push(dep);
        }
      }));
      wave = next;
    }
    return seen.size;
  }
  async function hardRefresh(onStep = () => {
  }) {
    const here = new URL("../", import_meta.url);
    onStep("Clearing the offline copy\u2026");
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.filter((r) => r.scope === here.href).map((r) => r.unregister()));
      }
      if (window.caches) {
        const keys2 = await caches.keys();
        await Promise.all(keys2.filter((k) => k.startsWith("savi-")).map((k) => caches.delete(k)));
      }
    } catch {
    }
    onStep("Downloading the latest files\u2026");
    for (const f of ["./", "./index.html", "./manifest.json", "./sw.js"]) {
      await fetch(new URL(f, here), { cache: "reload" }).catch(() => {
      });
    }
    await refetchModules(new URL("./src/savi.js", here).href, (n) => onStep(`Downloading the latest files\u2026 ${n}`));
    onStep("Restarting\u2026");
    location.reload();
  }

  // savi/src/music-kit.js
  var midi2 = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // savi/src/music-samples.js
  var DAYAN_F = midi2(62);
  var WARM = [];
  function prewarm(k, list2) {
    if (!k.ctx) return;
    if (!WARM.length && list2) WARM.push(...list2);
    const job = WARM.shift();
    if (job) job(k.ctx);
  }

  // savi/src/music-instruments.js
  var SR = 24e3;
  var bank = null;
  function getBank(c) {
    if (!bank || bank.ctx !== c) bank = { ctx: c, cache: /* @__PURE__ */ new Map(), hall: null };
    return bank;
  }
  function renderModes(len, modes, o = {}) {
    const out = new Float32Array(len);
    for (const [f, a, t60] of modes) {
      if (f >= SR * 0.45 || a <= 0) continue;
      const w = 2 * Math.PI * f / SR;
      const cw = Math.cos(w), sw = Math.sin(w);
      const d = Math.exp(-6.91 / (t60 * SR));
      let x = 1, y = 0, amp = a;
      const n = Math.min(len, Math.ceil(t60 * SR * 1.2));
      for (let i = 0; i < n; i++) {
        out[i] += amp * y;
        const nx = cw * x - sw * y;
        y = sw * x + cw * y;
        x = nx;
        amp *= d;
      }
    }
    if (o.knock) {
      const kl = Math.floor(SR * (o.knockLen || 0.012));
      const kcoef = Math.exp(-2 * Math.PI * (o.knockTone || 1500) / SR);
      let lp = 0;
      for (let i = 0; i < kl; i++) {
        lp = (1 - kcoef) * (Math.random() * 2 - 1) + kcoef * lp;
        out[i] += lp * o.knock * (1 - i / kl);
      }
    }
    const atk = Math.floor(SR * (o.attack || 15e-4));
    for (let i = 0; i < atk; i++) out[i] *= i / atk;
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
    const g = peak > 0 ? 1 / peak : 1;
    for (let i = 0; i < len; i++) out[i] *= g;
    const tail = Math.min(len, Math.floor(SR * 0.05));
    for (let i = 0; i < tail; i++) out[len - 1 - i] *= i / tail;
    return out;
  }
  var clamp2 = (v, a, b) => Math.max(a, Math.min(b, v));
  function piano(m) {
    const f = midi2(m);
    const T = clamp2(10 * Math.pow(2, -(m - 45) / 15), 1.3, 10);
    const len = Math.floor(SR * Math.min(5.5, T * 0.7 + 0.6));
    const B = 8e-5 * Math.pow(2, (m - 48) / 13);
    const modes = [];
    for (let n = 1; n <= 24; n++) {
      const fn = n * f * Math.sqrt(1 + B * n * n);
      const a = Math.abs(Math.sin(Math.PI * n / 8)) / Math.pow(n, 1.15) * Math.exp(-(n - 1) * 0.07) + (n === 8 ? 4e-3 : 0);
      const Tn = T / (1 + 0.32 * (n - 1));
      modes.push([fn * (1 - 45e-5), a * 0.6, Tn * 0.3]);
      modes.push([fn * (1 + 55e-5), a * 0.4, Tn]);
    }
    return renderModes(len, modes, { knock: 0.05, knockTone: Math.min(3e3, f * 3), attack: 2e-3 });
  }
  function epiano(m) {
    const f = midi2(m);
    const T = clamp2(5 * Math.pow(2, -(m - 60) / 22), 1.4, 7);
    const len = Math.floor(SR * Math.min(4.5, T * 0.8 + 0.3));
    const out = new Float32Array(len);
    const w = 2 * Math.PI * f / SR;
    const dEnv = Math.exp(-6.91 / (T * SR));
    let env = 1, ph = 0;
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const index = 1.5 * Math.exp(-t / 0.16) + 0.28;
      const mod = Math.sin(ph) * index;
      const tine2 = Math.sin(ph * 7.02) * 0.1 * Math.exp(-t / 0.04);
      out[i] = (Math.sin(ph + mod) + tine2) * env * Math.min(1, i / (SR * 2e-3));
      ph += w;
      env *= dEnv;
    }
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
    for (let i = 0; i < len; i++) out[i] /= peak || 1;
    const tail = Math.floor(SR * 0.05);
    for (let i = 0; i < tail; i++) out[len - 1 - i] *= i / tail;
    return out;
  }
  function tine(m, T, parts, knock) {
    const f = midi2(m);
    const len = Math.floor(SR * Math.min(4, T + 0.4));
    return renderModes(len, parts.map(([r, a, tr]) => [f * r, a, T * tr]), { knock, knockTone: 5e3, knockLen: 4e-3, attack: 1e-3 });
  }
  var musicbox = (m) => tine(m, clamp2(2.4 * Math.pow(2, -(m - 72) / 24), 0.9, 3.2), [[1, 1, 1], [2, 0.05, 0.5], [6.27, 0.2, 0.16], [17.55, 0.05, 0.05]], 0.03);
  var kalimba = (m) => tine(m, clamp2(2 * Math.pow(2, -(m - 64) / 24), 0.8, 3), [[1, 1, 1], [5.95, 0.14, 0.12], [2, 0.03, 0.4]], 0.02);
  function marimba(m) {
    const f = midi2(m);
    const T = clamp2(1.4 * Math.pow(2, -(m - 60) / 26), 0.4, 2.2);
    return renderModes(Math.floor(SR * (T + 0.3)), [[f, 1, T], [f * 3.93, 0.22, T * 0.22], [f * 9.2, 0.06, T * 0.07]], { knock: 0.03, knockTone: 1800, knockLen: 5e-3, attack: 1e-3 });
  }
  function harp(m) {
    const f = midi2(m);
    const T = clamp2(4.5 * Math.pow(2, -(m - 55) / 20), 1.2, 6);
    const modes = [];
    for (let n = 1; n <= 16; n++) modes.push([n * f * (1 + 2e-5 * n * n), Math.abs(Math.sin(Math.PI * n * 0.3)) / Math.pow(n, 1.5), T / (1 + 0.45 * (n - 1))]);
    return renderModes(Math.floor(SR * Math.min(5, T * 0.8 + 0.4)), modes, { knock: 0.01, knockTone: 2500, knockLen: 3e-3, attack: 15e-4 });
  }
  var INSTRUMENTS = {
    piano: { label: "Piano", render: piano, oct: 0, vol: 1, damp: 0.09 },
    epiano: { label: "Electric piano", render: epiano, oct: 0, vol: 0.85, damp: 0.12 },
    musicbox: { label: "Music box", render: musicbox, oct: 0, vol: 0.7, damp: 0 },
    kalimba: { label: "Kalimba", render: kalimba, oct: 0, vol: 0.95, damp: 0 },
    marimba: { label: "Marimba", render: marimba, oct: 0, vol: 1, damp: 0 },
    harp: { label: "Harp", render: harp, oct: 0, vol: 1, damp: 0 }
  };
  function buffer(c, name, m) {
    const b = getBank(c);
    const key = `${name}${m}`;
    let buf = b.cache.get(key);
    if (!buf) {
      const data = INSTRUMENTS[name].render(m);
      buf = c.createBuffer(1, data.length, SR);
      buf.getChannelData(0).set(data);
      b.cache.set(key, buf);
    }
    return buf;
  }
  var warmInst = (name, m) => (c) => buffer(c, name, m);
  function makeHallIR(c) {
    const len = Math.floor(c.sampleRate * 2.4);
    const ir = c.createBuffer(2, len, c.sampleRate);
    const pre = Math.floor(c.sampleRate * 0.018);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = pre; i < len; i++) {
        const t = (i - pre) / c.sampleRate;
        const bright = Math.exp(-t * 2.2);
        const coef = 0.2 + 0.7 * (1 - bright);
        lp = (1 - coef) * (Math.random() * 2 - 1) + coef * lp;
        d[i] = lp * Math.exp(-t * 2.9);
      }
    }
    return ir;
  }
  function hall(k) {
    const b = getBank(k.ctx);
    if (b.hall && b.hall.bus === k.bus) return b.hall;
    const c = k.ctx;
    const input = c.createGain();
    const tone2 = c.createBiquadFilter();
    tone2.type = "lowpass";
    tone2.frequency.value = 7500;
    tone2.Q.value = 0.5;
    input.connect(tone2).connect(k.bus);
    const conv = c.createConvolver();
    conv.buffer = makeHallIR(c);
    const wet = c.createGain();
    wet.gain.value = 0.2;
    input.connect(conv);
    conv.connect(wet).connect(k.bus);
    b.hall = { bus: k.bus, input };
    return b.hall;
  }
  var ready = (k) => k.ctx && k.bus && !k.muted();
  function hallIn(k) {
    return ready(k) ? hall(k).input : null;
  }
  function inst(k, name, m, t, o = {}) {
    if (!ready(k) || !INSTRUMENTS[name]) return;
    const spec = INSTRUMENTS[name];
    const c = k.ctx;
    const src = c.createBufferSource();
    src.buffer = buffer(c, name, m);
    const g = c.createGain();
    const v = (o.vol ?? 0.05) * spec.vol * (0.94 + Math.random() * 0.08);
    g.gain.value = v;
    let head2 = src.connect(g);
    if (c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = clamp2(o.pan ?? (m - 66) / 40, -0.6, 0.6);
      head2 = head2.connect(p);
    }
    head2.connect(hall(k).input);
    const at = t + (Math.random() - 0.5) * 8e-3;
    src.start(at);
    if (spec.damp && o.dur && !o.pedal) {
      const off = at + Math.max(0.08, o.dur);
      g.gain.setValueAtTime(v, off);
      g.gain.setTargetAtTime(1e-4, off, spec.damp);
      src.stop(off + spec.damp * 8);
    }
  }
  function roll(k, name, notes, t, o = {}) {
    notes.forEach((m, i) => inst(k, name, m, t + i * (o.spread ?? 0.035), o));
  }
  function pad2(k, notes, t, dur, vol = 6e-3) {
    const out = hallIn(k);
    if (!out) return;
    const c = k.ctx;
    for (const m of notes) {
      for (const det of [-6, 5]) {
        const o = c.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = midi2(m);
        o.detune.value = det;
        const f = c.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = 950;
        f.Q.value = 0.4;
        const g = c.createGain();
        const a = Math.min(1.6, dur * 0.35);
        g.gain.setValueAtTime(1e-4, t);
        g.gain.linearRampToValueAtTime(vol, t + a);
        g.gain.setValueAtTime(vol, t + dur - a);
        g.gain.linearRampToValueAtTime(1e-4, t + dur);
        o.connect(f).connect(g).connect(out);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }

  // savi/src/music-regions.js
  var SEMI = { S: 0, r: 1, R: 2, g: 3, G: 4, M: 5, "M#": 6, P: 7, d: 8, D: 9, n: 10, N: 11 };
  function swar(sw) {
    let oct = 0, base = sw;
    while (base.endsWith(".")) {
      oct -= 12;
      base = base.slice(0, -1);
    }
    while (base.endsWith("'")) {
      oct += 12;
      base = base.slice(0, -1);
    }
    if (!(base in SEMI)) throw new Error(`unknown swar ${sw}`);
    return SEMI[base] + oct;
  }
  function pulse(k, t, strong) {
    const out = hallIn(k);
    if (!out) return;
    k.tone({ freq: 110, freq2: 80, type: "sine", dur: 0.22, vol: strong ? 0.07 : 0.042, attack: 8e-3, at: t, out });
    k.tone({ freq: 220, freq2: 160, type: "triangle", dur: 0.12, vol: strong ? 0.02 : 0.012, attack: 8e-3, at: t, out });
  }
  function tick(k, t, vol = 0.014, freq = 2400) {
    const out = hallIn(k);
    if (out) k.noise({ dur: 0.03, vol, freq, type: "bandpass", q: 3, at: t, out });
  }
  function drum(k, t, vol = 0.065) {
    const out = hallIn(k);
    if (!out) return;
    k.tone({ freq: 96, freq2: 58, type: "sine", dur: 0.4, vol, attack: 0.01, at: t, out });
    k.tone({ freq: 192, freq2: 120, type: "triangle", dur: 0.14, vol: vol * 0.3, attack: 6e-3, at: t, out });
  }
  var leadChoice = {};
  function leadFor(theme, pass = 0) {
    const pick2 = leadChoice[theme.id];
    return pick2 && INSTRUMENTS[pick2] ? pick2 : theme.leads[pass % theme.leads.length];
  }
  var LEAD_OPTIONS = Object.entries(INSTRUMENTS).map(([id, v]) => ({ id, label: v.label }));
  function makeTheme(spec) {
    const melody = spec.phrases.map((ph) => {
      const out = [];
      let at = 0;
      for (const [sw, beats] of ph) {
        out.push({ at: Math.round(at * 2), sw, m: spec.sa + swar(sw), steps: beats * 2 });
        at += beats;
      }
      return out;
    });
    const note = (sw) => spec.sa + swar(sw);
    const warm = [];
    const seen = /* @__PURE__ */ new Set();
    const want = (name, m) => {
      const key = name + m;
      if (!seen.has(key)) {
        seen.add(key);
        warm.push(warmInst(name, m));
      }
    };
    for (const name of spec.leads) for (const ph of melody) for (const ev of ph) want(name, ev.m + INSTRUMENTS[name].oct);
    for (const bar of spec.bars || []) for (const sw of bar) if (sw) want(spec.barInst, note(sw));
    for (const [name, sws] of spec.warmMore || []) for (const sw of sws) want(name, note(sw));
    return {
      ...spec,
      kind: "region",
      note,
      tempo(k) {
        const beat = k.intensity >= 1 ? spec.fightBeat : spec.beat;
        return 60 / (beat / 2) / 4;
      },
      step(n, t, k) {
        prewarm(k, warm);
        const steps = spec.cycle * 2;
        const s = n % steps;
        const cycle = Math.floor(n / steps);
        const fight = k.intensity >= 1;
        const c = {
          k,
          t,
          s,
          n,
          cycle,
          fight,
          step: 60 / this.tempo(k) / 4,
          pass: Math.floor(cycle / spec.form.length),
          note
        };
        if (spec.bars) {
          const per = spec.barBeats * 2;
          const bar = spec.bars[Math.floor(n / per) % spec.bars.length];
          const i = n % per;
          const sw = bar[i];
          if (sw) {
            inst(k, spec.barInst, note(sw), t, i === 0 ? { vol: spec.barVol * 1.25, dur: per * c.step, pedal: true } : { vol: spec.barVol * (i % 2 ? 0.8 : 1), dur: c.step * 3 });
          }
        }
        if (spec.bed) spec.bed(c);
        if (fight && spec.fight) spec.fight(c);
        let f = spec.form[cycle % spec.form.length];
        if (f === null && fight) f = cycle % melody.length;
        if (f === null) return;
        for (const ev of melody[f]) if (ev.at === s) this.lead(c, ev);
      },
      lead(c, ev) {
        const name = leadFor(this, c.pass);
        const I = INSTRUMENTS[name];
        const dur = ev.steps * c.step;
        const vol = spec.leadVol ?? 0.07;
        inst(c.k, name, ev.m + I.oct, c.t, { vol, dur: dur * 1.02 });
        if (spec.leadDouble && name === "piano") inst(c.k, name, ev.m + spec.leadDouble, c.t, { vol: vol * 0.5, dur });
        if (!I.damp && ev.steps >= 4) {
          const every = name === "marimba" ? 1 : 2;
          for (let x = every; x < ev.steps - 0.5; x += every) {
            inst(c.k, name, ev.m + I.oct, c.t + x * c.step, { vol: vol * (name === "marimba" ? 0.45 : 0.35) });
          }
        }
      }
    };
  }
  var BHUPALI = makeTheme({
    id: "bhupali",
    name: "Hearthfields",
    raga: "Raag Bhupali",
    sa: 72,
    beat: 0.5,
    fightBeat: 0.42,
    cycle: 16,
    mood: "Open, warm and at peace - the plains where you wake, the first lamp, home.",
    hour: "early evening",
    regions: ["heartland", "lake"],
    notes: ["S", "R", "G", "P", "D"],
    phrases: [
      [["G", 1], ["R", 1], ["S", 1], ["D.", 1], ["S", 2], ["R", 1], ["G", 1], ["P", 2], ["G", 1], ["R", 1], ["G", 4]],
      [["P", 1], ["G", 1], ["P", 1], ["D", 1], ["S'", 2], ["D", 1], ["P", 1], ["G", 2], ["R", 1], ["G", 1], ["P", 1], ["D", 1], ["P", 2]],
      [["S'", 1], ["D", 1], ["P", 1], ["G", 1], ["D", 2], ["P", 1], ["G", 1], ["R", 2], ["G", 1], ["R", 1], ["S", 1], ["D.", 1], ["S", 2]],
      [["G", 2], ["P", 1], ["D", 1], ["S'", 3], ["R'", 1], ["S'", 1], ["D", 1], ["P", 1], ["G", 1], ["R", 1], ["G", 1], ["S", 2]]
    ],
    form: [0, 1, 0, 2, null, 3, 1, 2, null, null],
    leads: ["piano", "musicbox"],
    leadVol: 0.075,
    barInst: "piano",
    barBeats: 4,
    barVol: 0.03,
    bars: [
      ["S..", "P..", "S.", "G.", "P.", "G.", "S.", "P.."],
      ["D...", "G..", "D..", "S.", "G.", "S.", "D..", "G.."],
      ["R..", "P..", "R.", "G.", "D.", "G.", "R.", "P.."],
      ["P...", "R..", "P..", "D..", "R.", "D..", "P..", "R.."]
    ],
    bed(c) {
      if (c.s === 0 && c.cycle % 2 === 0) pad2(c.k, [c.note("S."), c.note("P.")], c.t, c.step * 64, 35e-4);
    },
    fight(c) {
      if (c.s % 8 === 0) pulse(c.k, c.t, true);
      else if (c.s % 8 === 4) pulse(c.k, c.t, false);
      if (c.s % 4 === 2) tick(c.k, c.t, 0.01, 2600);
    }
  });
  var MAAND = makeTheme({
    id: "maand",
    name: "Sand and Salt",
    raga: "Raag Maand",
    sa: 69,
    beat: 0.3,
    fightBeat: 0.26,
    cycle: 12,
    mood: "A long road under a big sky - wandering, sunlit, a little lonely.",
    hour: "night, by the fire",
    regions: ["gulch", "sands", "isle"],
    notes: ["S", "R", "G", "M", "P", "D", "N"],
    phrases: [
      [["S", 1], ["G", 1], ["M", 1], ["P", 2], ["M", 1], ["G", 1], ["M", 1], ["P", 1], ["D", 2], ["P", 1]],
      [["D", 1], ["P", 1], ["D", 1], ["S'", 3], ["N", 1], ["D", 1], ["P", 1], ["M", 2], ["P", 1]],
      [["P", 1], ["M", 1], ["G", 1], ["M", 2], ["G", 1], ["R", 1], ["G", 1], ["S", 4]],
      [["G", 1], ["M", 1], ["P", 1], ["S'", 2], ["N", 1], ["D", 1], ["P", 1], ["M", 1], ["G", 1], ["S", 2]]
    ],
    form: [0, 1, 0, 2, null, 3, 1, 2, null, null, 0, 3, 1, 2, null, null],
    leads: ["kalimba", "piano"],
    leadVol: 0.075,
    // The marimba: one note a beat (a beat here is an eighth), bars of six.
    barInst: "marimba",
    barBeats: 6,
    barVol: 0.034,
    bars: [
      ["S.", null, "P.", null, "S", null, "P.", null, "G", null, "P.", null],
      ["M.", null, "S", null, "M", null, "S", null, "P", null, "S", null],
      ["S.", null, "P.", null, "S", null, "P.", null, "G", null, "P.", null],
      ["P.", null, "S", null, "D", null, "S", null, "G", null, "S", null]
    ],
    warmMore: [["piano", ["S..", "M.."]]],
    bed(c) {
      if (c.n % 12 === 0) inst(c.k, "piano", c.note(c.n / 12 % 2 ? "M.." : "S.."), c.t, { vol: 0.03, dur: c.step * 12, pedal: true });
    },
    fight(c) {
      if (c.s % 12 === 0) drum(c.k, c.t, 0.06);
      else if (c.s % 12 === 6) pulse(c.k, c.t, false);
      tick(c.k, c.t, c.s % 6 === 0 ? 0.018 : 9e-3, 2400);
    }
  });
  var MALKAUNS = makeTheme({
    id: "malkauns",
    name: "Under the Canopy",
    raga: "Raag Malkauns",
    sa: 67,
    beat: 0.56,
    fightBeat: 0.46,
    cycle: 16,
    mood: "Deep woods and dark water - hushed, grave and a little enchanted.",
    hour: "after midnight",
    regions: ["webwood", "mire", "gorge", "dungeon"],
    notes: ["S", "g", "M", "d", "n"],
    phrases: [
      [["M", 2], ["g", 1], ["M", 1], ["d", 2], ["n", 1], ["d", 1], ["M", 2], ["g", 1], ["S", 1], ["n.", 1], ["S", 3]],
      [["g", 1], ["M", 1], ["d", 1], ["n", 1], ["S'", 4], ["n", 1], ["d", 1], ["M", 2], ["d", 1], ["n", 1], ["d", 2]],
      [["S'", 2], ["n", 1], ["d", 1], ["n", 1], ["S'", 1], ["g'", 2], ["S'", 2], ["n", 1], ["d", 1], ["M", 4]],
      [["d", 1], ["M", 1], ["g", 1], ["M", 1], ["g", 1], ["S", 2], ["n.", 1], ["d.", 1], ["n.", 1], ["S", 2], ["g", 1], ["M", 1], ["S", 2]]
    ],
    form: [0, null, 1, 2, null, 3, 0, null, null, 2, 1, null],
    leads: ["epiano", "piano"],
    leadVol: 0.07,
    barInst: "epiano",
    barBeats: 4,
    barVol: 0.03,
    bars: [
      ["S..", "M..", "n..", "g.", "M.", "g.", "n..", "M.."],
      ["d...", "g..", "n..", "M.", "g.", "M.", "n..", "g.."],
      ["M..", "S.", "g.", "d.", "g.", "S.", "M..", "S."],
      ["n...", "M..", "g.", "n.", "g.", "M..", "S.", "M.."]
    ],
    bed(c) {
      if (c.s === 0 && c.cycle % 2 === 0) pad2(c.k, [c.note("S."), c.note("M.")], c.t, c.step * 64, 4e-3);
    },
    fight(c) {
      if (c.s % 8 === 0) drum(c.k, c.t, 0.06);
      else if (c.s % 8 === 1) drum(c.k, c.t, 0.035);
    }
  });
  var BHAIRAV_CHORDS = [["S..", "P..", "G.", "S"], ["r..", "M..", "d.", "r"], ["d...", "M..", "S.", "M."], ["P...", "N..", "M.", "P."]];
  var BHAIRAV = makeTheme({
    id: "bhairav",
    name: "Ash at Dawn",
    raga: "Raag Bhairav",
    sa: 70,
    beat: 0.64,
    fightBeat: 0.5,
    cycle: 16,
    mood: "Grave and solemn, a prayer at first light over ash and stone.",
    hour: "dawn",
    regions: ["peaks", "bridge"],
    notes: ["S", "r", "G", "M", "P", "d", "N"],
    phrases: [
      [["S", 1], ["r", 2], ["G", 1], ["M", 2], ["P", 2], ["d", 3], ["P", 1], ["M", 1], ["G", 1], ["M", 2]],
      [["G", 1], ["M", 1], ["d", 2], ["N", 1], ["S'", 3], ["N", 1], ["d", 3], ["P", 4]],
      [["P", 1], ["d", 1], ["M", 1], ["P", 1], ["G", 2], ["M", 1], ["r", 3], ["S", 2], ["N.", 1], ["S", 3]],
      [["d.", 1], ["N.", 1], ["S", 1], ["G", 1], ["M", 2], ["P", 1], ["d", 1], ["N", 1], ["S'", 3], ["d", 2], ["P", 2]]
    ],
    form: [0, 1, null, 2, 3, null, 0, 2, null, null],
    leads: ["piano", "harp"],
    leadVol: 0.07,
    leadDouble: -12,
    warmMore: [["piano", BHAIRAV_CHORDS.flat()], ["musicbox", ["S'"]]],
    bed(c) {
      const ch = BHAIRAV_CHORDS[Math.floor(c.n / 8) % 4].map(c.note);
      if (c.s % 8 === 0) roll(c.k, "piano", ch, c.t, { vol: 0.03, dur: c.step * 8, pedal: true, spread: 0.06 });
      if (c.s % 8 === 4) inst(c.k, "piano", ch[2], c.t, { vol: 0.018, dur: c.step * 4 });
      if (c.s === 0) {
        pad2(c.k, [c.note("S."), c.note("P.")], c.t, c.step * 32, 4e-3);
        inst(c.k, "musicbox", c.note("S'"), c.t, { vol: 0.03 });
      }
    },
    fight(c) {
      if (c.s % 8 === 0) drum(c.k, c.t, c.s % 16 === 0 ? 0.07 : 0.05);
      if (c.s % 16 === 14) drum(c.k, c.t, 0.032);
    }
  });
  var YAMAN = makeTheme({
    id: "yaman",
    name: "Moonlit Courts",
    raga: "Raag Yaman",
    sa: 72,
    beat: 0.52,
    fightBeat: 0.44,
    cycle: 16,
    mood: "Serene and noble with a touch of longing - marble, moonlight and snow.",
    hour: "first part of the night",
    regions: ["citadel", "gilded", "echo", "moors"],
    notes: ["S", "R", "G", "M#", "P", "D", "N"],
    phrases: [
      [["N.", 1], ["R", 1], ["G", 2], ["R", 1], ["S", 1], ["N.", 1], ["D.", 1], ["N.", 1], ["R", 1], ["S", 6]],
      [["N.", 1], ["R", 1], ["G", 1], ["M#", 1], ["P", 2], ["M#", 1], ["G", 1], ["R", 2], ["G", 1], ["M#", 1], ["D", 1], ["P", 3]],
      [["G", 1], ["M#", 1], ["D", 1], ["N", 1], ["S'", 4], ["N", 1], ["D", 1], ["P", 2], ["M#", 1], ["G", 1], ["R", 2]],
      [["M#", 1], ["D", 1], ["N", 1], ["R'", 1], ["S'", 2], ["N", 1], ["D", 1], ["P", 1], ["M#", 1], ["G", 1], ["R", 1], ["N.", 1], ["R", 1], ["S", 2]]
    ],
    form: [0, 1, 2, null, 3, 1, null, 0, 2, null, null],
    leads: ["musicbox", "piano"],
    leadVol: 0.075,
    barInst: "piano",
    barBeats: 4,
    barVol: 0.028,
    bars: [
      ["S..", "P..", "S.", "G.", "N.", "G.", "S.", "P.."],
      ["D...", "G..", "S.", "G.", "D.", "G.", "S.", "G.."],
      ["R..", "D..", "M#.", "S", "M#.", "D..", "R.", "D.."],
      ["N...", "M#..", "R.", "D.", "R.", "M#..", "N..", "R."]
    ],
    bed(c) {
      if (c.s === 0 && c.cycle % 2 === 1) pad2(c.k, [c.note("S."), c.note("G.")], c.t, c.step * 64, 3e-3);
    },
    fight(c) {
      if (c.s % 8 === 0) pulse(c.k, c.t, true);
      else if (c.s % 8 === 4) pulse(c.k, c.t, false);
    }
  });
  var DURGA_FIGURE = ["S.", "P.", "R", "M.", "D.", "S"];
  var DURGA_BASS = ["S..", "S..", "M..", "R.."];
  var DURGA = makeTheme({
    id: "durga",
    name: "Blossom Road",
    raga: "Raag Durga",
    sa: 74,
    beat: 0.5,
    fightBeat: 0.42,
    cycle: 16,
    mood: "Bright and gentle, petals on the wind - the red gates of the summit.",
    hour: "late evening",
    regions: ["summit"],
    notes: ["S", "R", "M", "P", "D"],
    phrases: [
      [["S", 1], ["R", 1], ["M", 1], ["P", 1], ["D", 2], ["P", 1], ["M", 1], ["R", 2], ["M", 1], ["P", 1], ["M", 1], ["R", 1], ["S", 2]],
      [["M", 1], ["P", 1], ["D", 1], ["S'", 3], ["R'", 1], ["S'", 1], ["D", 1], ["P", 1], ["M", 2], ["P", 1], ["D", 1], ["M", 2]],
      [["D", 1], ["S'", 1], ["D", 1], ["P", 1], ["M", 2], ["R", 1], ["M", 1], ["P", 3], ["M", 1], ["R", 1], ["S", 3]],
      [["R", 1], ["M", 1], ["R", 1], ["P", 1], ["M", 2], ["D", 1], ["P", 1], ["S'", 4], ["D", 1], ["M", 1], ["R", 2]]
    ],
    form: [0, 1, null, 2, 3, null, 1, 0, null, null],
    leads: ["piano", "kalimba"],
    leadVol: 0.07,
    warmMore: [["harp", [...DURGA_FIGURE, ...DURGA_BASS]]],
    bed(c) {
      if (c.n % 3 === 0) inst(c.k, "harp", c.note(DURGA_FIGURE[c.n / 3 % 6]), c.t, { vol: 0.026 });
      if (c.s % 8 === 0) inst(c.k, "harp", c.note(DURGA_BASS[Math.floor(c.n / 8) % 4]), c.t, { vol: 0.034 });
    },
    fight(c) {
      if (c.s % 16 === 0 || c.s % 16 === 6 || c.s % 16 === 10) drum(c.k, c.t, c.s % 16 === 0 ? 0.075 : 0.048);
      if (c.s % 4 === 2) tick(c.k, c.t, 9e-3, 3e3);
    }
  });
  var FILM_BHAIRAV_CHORDS = [["S.", "M.", "d."], ["N..", "G.", "P."], ["r.", "P.", "N."], ["S.", "M.", "P."]];
  var FILM_ASH = makeTheme({
    id: "film-ash",
    name: "The Ash Falls",
    raga: "Raag Bhairav",
    sa: 65,
    beat: 0.82,
    fightBeat: 0.7,
    cycle: 16,
    mood: "The opening, first half: grave, bare and falling - a world already lost.",
    hour: "before dawn",
    regions: [],
    notes: ["S", "r", "G", "M", "P", "d", "N"],
    phrases: [
      [["d.", 2], ["N.", 2], ["S", 3], ["r", 3], ["S", 2], ["N.", 4]],
      [["S", 2], ["r", 2], ["G", 3], ["M", 3], ["P", 4], ["M", 2]],
      [["P", 2], ["d", 3], ["N", 3], ["S'", 4], ["d", 2], ["P", 2]],
      [["M", 2], ["G", 2], ["r", 4], ["S", 4], ["N.", 2], ["S", 2]]
    ],
    form: [0, null, 1, null, 2, 3, null, 1, null, null],
    leads: ["piano"],
    leadVol: 0.085,
    leadDouble: -12,
    barInst: "piano",
    barBeats: 4,
    barVol: 0.032,
    bars: [
      ["S..", "", "", "", "P..", "", "", ""],
      ["d..", "", "", "", "S.", "", "", ""],
      ["N..", "", "", "", "G.", "", "", ""],
      ["P..", "", "", "", "S.", "", "", ""]
    ],
    warmMore: [["piano", FILM_BHAIRAV_CHORDS.flat()], ["musicbox", ["S'"]]],
    bed(c) {
      if (c.s === 0) {
        pad2(c.k, [c.note("S.."), c.note("P.."), c.note("S.")], c.t, c.step * 32, 6e-3);
        drum(c.k, c.t, 0.055);
      }
      if (c.s === 16) drum(c.k, c.t, 0.03);
      if (c.s % 16 === 0) {
        const ch = FILM_BHAIRAV_CHORDS[Math.floor(c.n / 16) % 4].map(c.note);
        roll(c.k, "piano", ch, c.t, { vol: 0.026, dur: c.step * 16, pedal: true, spread: 0.1 });
      }
      if (c.s === 24 && c.cycle % 2 === 1) inst(c.k, "musicbox", c.note("S'"), c.t, { vol: 0.026 });
    }
  });
  var FILM_ROAD = makeTheme({
    id: "film-road",
    name: "The Road Out",
    raga: "Raag Bhupali",
    sa: 67,
    beat: 0.62,
    fightBeat: 0.54,
    cycle: 16,
    mood: "The opening, second half: the same world, walked into on purpose.",
    hour: "first light",
    regions: [],
    notes: ["S", "R", "G", "P", "D"],
    phrases: [
      [["S", 2], ["R", 2], ["G", 4], ["P", 4], ["G", 2], ["R", 2]],
      [["G", 2], ["P", 2], ["D", 3], ["S'", 3], ["D", 2], ["P", 2], ["G", 2]],
      [["P", 1], ["D", 1], ["S'", 2], ["R'", 2], ["S'", 4], ["D", 3], ["P", 3]],
      [["G", 2], ["R", 2], ["S", 3], ["D.", 3], ["S", 4], ["G", 2]]
    ],
    form: [0, 1, 2, 3, 1, 2, null, 3],
    leads: ["piano", "musicbox"],
    leadVol: 0.082,
    leadDouble: -12,
    barInst: "piano",
    barBeats: 4,
    barVol: 0.034,
    bars: [
      ["S..", "", "P.", "", "G.", "", "P.", ""],
      ["D..", "", "G.", "", "S.", "", "G.", ""],
      ["R..", "", "D.", "", "G.", "", "D.", ""],
      ["P..", "", "S'.", "", "D.", "", "G.", ""]
    ],
    bed(c) {
      if (c.s === 0) pad2(c.k, [c.note("S.."), c.note("P..")], c.t, c.step * 32, 5e-3);
      if (c.s % 8 === 0) drum(c.k, c.t, c.s % 16 === 0 ? 0.05 : 0.034);
      if (c.s % 8 === 6) tick(c.k, c.t, 8e-3, 2800);
    }
  });
  var FILM_THEMES = [FILM_ASH, FILM_ROAD];
  var REGION_THEMES = [BHUPALI, MAAND, MALKAUNS, BHAIRAV, YAMAN, DURGA];
  var BY_REGION = /* @__PURE__ */ new Map();
  for (const th of REGION_THEMES) for (const r of th.regions) BY_REGION.set(r, th);
  function themeById(id) {
    return [...REGION_THEMES, ...FILM_THEMES].find((t) => t.id === id) || null;
  }

  // savi/src/savi-keys.js
  var ACTIONS = [
    { id: "up", name: "Walk up", keys: ["w", "arrowup"], pad: "stick / d-pad" },
    { id: "down", name: "Walk down", keys: ["s", "arrowdown"], pad: "stick / d-pad" },
    { id: "left", name: "Walk left", keys: ["a", "arrowleft"], pad: "stick / d-pad" },
    { id: "right", name: "Walk right", keys: ["d", "arrowright"], pad: "stick / d-pad" },
    { id: "jump", name: "Jump", keys: [" "], pad: "cross" },
    { id: "dash", name: "Dash", keys: ["shift", "x"], pad: "circle" },
    { id: "interact", name: "Interact", keys: ["e"], pad: "square", what: "talk, read a mural, lift a stone" },
    { id: "use", name: "Use what she holds", keys: ["mouse1"], pad: "square", what: "sweep, raise the lantern" },
    { id: "belt", name: "Her belt", keys: ["tab"], pad: "L1", what: "change what is in her hands" }
  ];
  var PAD_STYLES = {
    ps: {
      name: "PlayStation",
      move: "the left stick",
      jump: "cross",
      dash: "circle",
      act: "square",
      belt: "L1",
      menu: "options",
      dismiss: "triangle"
    },
    xbox: {
      name: "Xbox",
      move: "the left stick",
      jump: "A",
      dash: "B",
      act: "X",
      belt: "LB",
      menu: "menu",
      dismiss: "Y"
    }
  };
  var padStyle = "xbox";
  function setPadStyle(id) {
    padStyle = /dualsense|dualshock|playstation|054c|0ce6|sony/i.test(String(id || "")) ? "ps" : "xbox";
    return padStyle;
  }
  function padName(what) {
    return PAD_STYLES[padStyle][what] || what;
  }
  var RESERVED_KEYS = ["escape", "enter"];
  var DEFAULTS = {};
  for (const a of ACTIONS) DEFAULTS[a.id] = a.keys.slice();
  var SAVED = "savi.keys.v1";
  var BINDS = {};
  var keys = /* @__PURE__ */ new Set();
  function resetKeys() {
    for (const a of ACTIONS) BINDS[a.id] = DEFAULTS[a.id].slice();
  }
  resetKeys();
  function loadKeys() {
    resetKeys();
    let raw = null;
    try {
      raw = localStorage.getItem(SAVED);
    } catch (e) {
      return;
    }
    if (!raw) return;
    let saved = null;
    try {
      saved = JSON.parse(raw);
    } catch (e) {
      return;
    }
    if (!saved || typeof saved !== "object") return;
    for (const a of ACTIONS) {
      const v = saved[a.id];
      if (!Array.isArray(v)) continue;
      const clean = [];
      for (const k of v) {
        if (typeof k !== "string" || !k) continue;
        const lk = k.toLowerCase();
        if (RESERVED_KEYS.includes(lk)) continue;
        if (!clean.includes(lk)) clean.push(lk);
      }
      if (clean.length) BINDS[a.id] = clean.slice(0, 3);
    }
  }
  function saveKeys() {
    try {
      localStorage.setItem(SAVED, JSON.stringify(BINDS));
    } catch (e) {
    }
  }
  function kdown(id) {
    const b = BINDS[id];
    if (!b) return false;
    for (const k of b) if (keys.has(k)) return true;
    return false;
  }
  function actionFor(key) {
    const k = String(key).toLowerCase();
    for (const a of ACTIONS) if (BINDS[a.id].includes(k)) return a.id;
    return null;
  }
  var PRETTY = {
    " ": "space",
    arrowup: "\u2191",
    arrowdown: "\u2193",
    arrowleft: "\u2190",
    arrowright: "\u2192",
    mouse1: "left click",
    mouse2: "right click",
    shift: "shift",
    tab: "tab",
    control: "ctrl",
    alt: "alt",
    capslock: "caps",
    backspace: "backspace"
  };
  function prettyKey(k) {
    if (!k) return "";
    const lk = String(k).toLowerCase();
    if (PRETTY[lk]) return PRETTY[lk];
    return lk.length === 1 ? lk.toUpperCase() : lk;
  }
  function keyLabel(id) {
    const b = BINDS[id];
    return b && b.length ? prettyKey(b[0]) : "";
  }
  function keyLabels(id) {
    const b = BINDS[id];
    return b && b.length ? b.map(prettyKey).join(" / ") : "unbound";
  }
  function rebindKey(id, key) {
    if (!BINDS[id]) return { took: null, refused: "no such action" };
    const k = String(key).toLowerCase();
    if (!k) return { took: null, refused: "no key" };
    if (RESERVED_KEYS.includes(k)) return { took: null, refused: `${prettyKey(k)} is how you get out of here` };
    let took = null;
    for (const a of ACTIONS) {
      if (a.id === id) continue;
      const at = BINDS[a.id].indexOf(k);
      if (at < 0) continue;
      took = a.id;
      BINDS[a.id] = BINDS[a.id].filter((x) => x !== k);
      if (!BINDS[a.id].length) BINDS[a.id] = DEFAULTS[a.id].filter((x) => x !== k);
      if (!BINDS[a.id].length) BINDS[a.id] = DEFAULTS[a.id].slice();
    }
    BINDS[id] = [k];
    saveKeys();
    return { took, refused: null };
  }
  function defaultKeys() {
    resetKeys();
    saveKeys();
  }

  // savi/src/savi-teach.js
  var teach = {
    step: 0,
    // which of the three
    t: 0,
    // how long this one has been up
    got: 0,
    // how long ago they did it (0 = not yet)
    walked: 0,
    // units travelled on the ground
    jumped: 0,
    dashed: 0,
    over: false
  };
  var STEPS = [
    { id: "walk", need: (t) => t.walked > 340 },
    { id: "jump", need: (t) => t.jumped > 0 },
    { id: "dash", need: (t) => t.dashed > 0 }
  ];
  function teachLine(step2, { touch: touch2, pad: pad4 }) {
    if (step2 === 0) {
      if (touch2) return "drag the left side to walk";
      if (pad4) return `${padName("move")} or the d-pad to walk`;
      const one = (id) => keyLabels(id).split(" / ")[0];
      return `${one("up")} ${one("left")} ${one("down")} ${one("right")} to walk`;
    }
    if (step2 === 1) {
      if (touch2) return "tap JUMP, bottom right";
      return `${pad4 ? padName("jump") : keyLabel("jump")} to jump`;
    }
    if (step2 === 2) {
      if (touch2) return "tap DASH for a little run";
      return `${pad4 ? padName("dash") : keyLabel("dash")} to dash`;
    }
    return "";
  }
  var GOT = ["good", "good", "good"];
  function stepTeach(dt, moved, stop) {
    if (teach.over) return;
    if (stop) {
      teach.over = true;
      return;
    }
    teach.walked += moved;
    const s = STEPS[teach.step];
    if (!s) {
      teach.over = true;
      return;
    }
    teach.t += dt;
    if (teach.got > 0) {
      teach.got += dt;
      if (teach.got > 1.5) {
        teach.step++;
        teach.t = 0;
        teach.got = 0;
        if (teach.step >= STEPS.length) teach.over = true;
      }
      return;
    }
    if (teach.step === 0 && teach.t < 0.5) return;
    if (s.need(teach)) teach.got = 1e-4;
  }
  function noteJump() {
    teach.jumped++;
  }
  function noteDash() {
    teach.dashed++;
  }
  function teachText(device) {
    if (teach.over) return null;
    if (teach.step === 0 && teach.t < 0.5) return null;
    if (teach.got > 0) return { text: GOT[teach.step] || "good", got: true };
    const text = teachLine(teach.step, device);
    return text ? { text, got: false } : null;
  }

  // savi/src/savi-menu.js
  var menu = {
    open: false,
    page: "root",
    sel: 0,
    t: 0,
    wait: null,
    note: "",
    noteT: 9,
    // The lowest thing the last draw put on the screen. It is here so the
    // checker can say whether a page fits, which is the one way this thing
    // breaks that you cannot see coming: a phone scales the text half again
    // and a list that was comfortable on a desktop walks off the bottom.
    bottom: 0
  };
  var host = { isTouch: () => false, padOn: () => false };
  var rows = [];
  var hits = [];
  function initMenu(h) {
    host = { ...host, ...h };
  }
  var SOUND = "savi.sound.v1";
  var snd = { vol: 0.9 };
  function loadSound() {
    let raw = null;
    try {
      raw = localStorage.getItem(SOUND);
    } catch (e) {
      return;
    }
    if (raw) {
      try {
        const s = JSON.parse(raw);
        if (s && typeof s === "object") {
          if (typeof s.music === "boolean") setMusicEnabled(s.music);
          if (Number.isFinite(s.musicVol)) setMusicVolume(clamp(s.musicVol, 0, 1));
          if (Number.isFinite(s.vol)) snd.vol = clamp(s.vol, 0, 1);
        }
      } catch (e) {
      }
    }
    setVolume(snd.vol);
  }
  function saveSound() {
    try {
      localStorage.setItem(SOUND, JSON.stringify({
        music: audio.music,
        musicVol: audio.musicVolume,
        vol: snd.vol
      }));
    } catch (e) {
    }
  }
  var menuOn = () => menu.open;
  function openMenu() {
    if (menu.open) return;
    menu.open = true;
    menu.page = "root";
    menu.sel = 0;
    menu.t = 0;
    menu.wait = null;
    menu.note = "";
    menu.noteT = 9;
    rows = pageRows();
    sfx.ui();
  }
  function closeMenu() {
    if (!menu.open) return;
    menu.open = false;
    menu.wait = null;
    rows = [];
    hits = [];
    sfx.ui();
  }
  function say(text) {
    menu.note = text;
    menu.noteT = 0;
  }
  function go(page) {
    menu.page = page;
    menu.sel = 0;
    menu.wait = null;
    menu.note = "";
    rows = pageRows();
    sfx.ui();
  }
  function pageRows() {
    if (menu.page === "root") {
      return [
        { label: "Resume", act: closeMenu },
        { label: "Controls", act: () => go("keys") },
        { label: "Sound", act: () => go("sound") },
        { label: "How to play", act: () => go("help") }
      ];
    }
    if (menu.page === "keys") {
      if (host.isTouch()) return [{ label: "Back", act: () => go("root") }];
      const out = ACTIONS.map((a) => ({
        label: a.name,
        value: menu.wait === a.id ? "press a key" : keyLabels(a.id),
        lit: menu.wait === a.id,
        act: () => {
          menu.wait = a.id;
          say("escape to leave it as it is");
          sfx.tick();
        }
      }));
      out.push({
        label: "Reset to defaults",
        act: () => {
          defaultKeys();
          menu.wait = null;
          say("back to how it shipped");
          sfx.pickup();
        }
      });
      out.push({ label: "Back", act: () => go("root") });
      return out;
    }
    if (menu.page === "sound") {
      const out = [
        {
          label: "Music",
          value: audio.music ? "on" : "off",
          act: () => {
            setMusicEnabled(!audio.music);
            saveSound();
            sfx.click();
          }
        },
        {
          label: "Music volume",
          slide: () => audio.musicVolume,
          set: (v) => {
            setMusicVolume(v);
            previewMusic();
            saveSound();
          }
        },
        {
          label: "Everything else",
          slide: () => snd.vol,
          set: (v) => {
            snd.vol = v;
            setVolume(v);
            saveSound();
            sfx.tick();
          }
        }
      ];
      if (fullscreenSupported()) {
        out.push({
          label: "Fullscreen",
          value: isFullscreen() ? "on" : "off",
          act: () => {
            toggleFullscreen();
            sfx.click();
          }
        });
      }
      out.push({ label: "Back", act: () => go("root") });
      return out;
    }
    return [{ label: "Back", act: () => go("root") }];
  }
  var padLines = () => [
    `a controller: ${padName("move")} or the d-pad to walk \xB7 ${padName("jump")} to jump \xB7 ${padName("dash")} to dash`,
    `${padName("act")} to interact and to use \xB7 ${padName("belt")} for her belt \xB7 ${padName("menu")} to pause`
  ];
  var FIXED_KEYS = () => [
    ...padLines(),
    "",
    "a phone: the left of the screen steers \xB7 the ring taps to interact and holds to use"
  ];
  var TOUCH_KEYS = () => [
    "The left of the screen steers her.",
    "The ring, bottom right: TAP it for what is in front of her,",
    "HOLD it for what is in her hand.",
    "",
    "The tool in the corner opens her belt. \u275A\u275A at the top pauses.",
    "",
    ...padLines()
  ];
  var HELP = [
    "The Great Banyan is dying, and everything in this valley grows under it.",
    "Five of its great roots are choked. Free one and a young banyan comes up",
    "on it carrying a painted mural, and reading a mural gives the old keeper",
    "back her story, a piece at a time.",
    "",
    "Three things she can do. Sweep what is lying on a root. Hold the lantern",
    "out at what will not move, and go back to a fire when the coal burns down.",
    "Lift a stone off a root and throw it away.",
    "",
    "Her belt is where you change which of those is in her hands."
  ];
  function list() {
    return rows.length ? rows : pageRows();
  }
  function move(d) {
    if (menu.wait) return;
    const n = list().length;
    menu.sel = (menu.sel + d + n) % n;
    sfx.tick();
  }
  function adjust(d) {
    if (menu.wait) return;
    const r = list()[menu.sel];
    if (!r || !r.slide) return;
    r.set(clamp(Math.round((r.slide() + d * 0.1) * 10) / 10, 0, 1));
  }
  function pick() {
    if (menu.wait) {
      menu.wait = null;
      menu.note = "";
      return;
    }
    const r = list()[menu.sel];
    if (!r) return;
    if (r.act) r.act();
    else if (r.slide) r.set(r.slide() >= 1 ? 0 : clamp(r.slide() + 0.1, 0, 1));
  }
  function back() {
    if (menu.wait) {
      menu.wait = null;
      menu.note = "";
      sfx.tick();
      return;
    }
    if (menu.page !== "root") {
      go("root");
      return;
    }
    closeMenu();
  }
  function menuKey(k, a) {
    if (menu.wait) {
      if (k === "escape") {
        menu.wait = null;
        menu.note = "";
        sfx.tick();
        return;
      }
      const id = menu.wait;
      const mine = ACTIONS.find((q) => q.id === id);
      const r = rebindKey(id, k);
      menu.wait = null;
      rows = pageRows();
      if (r.refused) {
        say(r.refused);
        sfx.click();
        return;
      }
      if (r.took) {
        const other = ACTIONS.find((q) => q.id === r.took);
        say(`${prettyKey(k)} was ${other.name.toLowerCase()}. That is ${keyLabels(r.took)} now.`);
      } else {
        say(`${mine.name.toLowerCase()} is ${prettyKey(k)}`);
      }
      sfx.pickup();
      return;
    }
    if (k === "escape" || k === "q") {
      back();
      return;
    }
    if (k === "arrowup" || a === "up") {
      move(-1);
      return;
    }
    if (k === "arrowdown" || a === "down") {
      move(1);
      return;
    }
    if (k === "arrowleft" || a === "left") {
      adjust(-1);
      return;
    }
    if (k === "arrowright" || a === "right") {
      adjust(1);
      return;
    }
    if (k === "enter" || k === " " || a === "interact" || a === "jump") pick();
  }
  function menuPad(pad4) {
    if (pad4.upPressed) move(-1);
    if (pad4.downPressed) move(1);
    if (pad4.leftPressed) adjust(-1);
    if (pad4.rightPressed) adjust(1);
    if (pad4.pressed || pad4.jumpPressed) pick();
    if (pad4.dashPressed) back();
  }
  function menuPointer(px, py) {
    if (menu.wait) {
      menu.wait = null;
      menu.note = "";
      sfx.tick();
      return;
    }
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      if (px < h.x || px > h.x + h.w || py < h.y || py > h.y + h.h) continue;
      const r = rows[h.row];
      if (!r) return;
      menu.sel = h.row;
      if (r.slide && h.bar && px > h.bar.x - 18) {
        r.set(clamp(Math.round((px - h.bar.x) / h.bar.w * 10) / 10, 0, 1));
        return;
      }
      pick();
      return;
    }
    back();
  }
  function stepMenu(dt) {
    menu.t += dt;
    menu.noteT += dt;
    rows = pageRows();
  }
  var FONT = (px) => `600 ${Math.round(px)}px "Segoe UI", Roboto, system-ui, sans-serif`;
  var TITLE = { root: "PAUSED", keys: "CONTROLS", sound: "SOUND", help: "HOW TO PLAY" };
  function drawMenu(ctx3) {
    if (!menu.open) {
      hits = [];
      return;
    }
    const touch2 = host.isTouch(), pad4 = host.padOn();
    const F3 = touch2 ? clamp(view.h / 400, 1, 1.55) : 1;
    const k = Math.min(1, menu.t * 7);
    if (!rows.length) rows = pageRows();
    hits = [];
    menu.bottom = 0;
    ctx3.fillStyle = `rgba(12,9,7,${0.76 * k})`;
    ctx3.fillRect(0, 0, view.w, view.h);
    const Ft = Math.min(F3, 1.2);
    const wide = Math.min(700, view.w * 0.62);
    const x0 = Math.round(view.w / 2 - wide / 2);
    const text = menu.page === "keys" || menu.page === "help";
    const Fp = text ? Ft : F3;
    const rh = Math.round((menu.page === "keys" ? 30 : 40) * Fp);
    const top = Math.round((menu.page === "keys" ? 132 : 188) * Fp);
    ctx3.textAlign = "center";
    ctx3.font = FONT(25 * Fp);
    ctx3.fillStyle = `rgba(255,214,170,${0.95 * k})`;
    ctx3.fillText(TITLE[menu.page] || "", view.w / 2, top - 46 * Fp);
    if (menu.page === "help") {
      ctx3.textAlign = "left";
      ctx3.font = FONT(14 * Ft);
      let y = top - 26 * Ft;
      for (const line of HELP) {
        ctx3.fillStyle = `rgba(240,226,203,${0.76 * k})`;
        ctx3.fillText(line, x0, y);
        y += Math.round(21 * Ft);
      }
      menu.bottom = Math.max(menu.bottom, y);
      y += Math.round(8 * Ft);
      ctx3.font = FONT(13 * Ft);
      ctx3.fillStyle = `rgba(255,196,120,${0.82 * k})`;
      for (const line of deviceLines(pad4, touch2)) {
        ctx3.fillText(line, x0, y);
        y += Math.round(20 * Ft);
      }
      menu.bottom = Math.max(menu.bottom, y);
      drawRows(ctx3, [0], x0, wide, y + Math.round(18 * Ft), rh, k, Ft);
    } else if (!(menu.page === "keys" && touch2)) {
      drawRows(ctx3, rows.map((r, i) => i), x0, wide, top, rh, k, Fp);
    }
    if (menu.page === "keys") {
      ctx3.textAlign = "center";
      ctx3.font = FONT(13 * Ft);
      ctx3.fillStyle = `rgba(240,226,203,${0.5 * k})`;
      let y = touch2 ? top + Math.round(10 * Ft) : top + rows.length * rh + Math.round(26 * Ft);
      for (const line of (touch2 ? TOUCH_KEYS : FIXED_KEYS)()) {
        if (!line) {
          y += Math.round(10 * Ft);
          continue;
        }
        ctx3.fillText(line, view.w / 2, y);
        y += Math.round(21 * Ft);
      }
      menu.bottom = Math.max(menu.bottom, y);
      ctx3.font = FONT(12 * Ft);
      ctx3.fillStyle = `rgba(240,226,203,${0.32 * k})`;
      ctx3.fillText(
        touch2 ? "a keyboard can be changed key by key, on a computer." : "those two are fixed. escape and enter are never bound.",
        view.w / 2,
        y + Math.round(6 * Ft)
      );
      if (touch2) drawRows(ctx3, [0], x0, wide, y + Math.round(44 * Ft), rh, k, Ft);
    }
    if (menu.note && menu.noteT < 6) {
      ctx3.textAlign = "center";
      ctx3.font = FONT(13 * F3);
      ctx3.globalAlpha = Math.min(1, (6 - menu.noteT) * 1.4) * k;
      ctx3.fillStyle = "rgba(255,196,120,0.92)";
      ctx3.fillText(menu.note, view.w / 2, view.h - 62 * F3);
      ctx3.globalAlpha = 1;
    }
    ctx3.textAlign = "center";
    ctx3.font = FONT(12 * F3);
    ctx3.fillStyle = `rgba(240,226,203,${0.38 * k})`;
    ctx3.fillText(
      touch2 ? "tap a line \xB7 tap the dark to go back" : pad4 ? `stick to choose \xB7 ${padName("jump")} to pick \xB7 ${padName("dash")} to go back` : "arrows to choose \xB7 enter to pick \xB7 escape to go back",
      view.w / 2,
      view.h - 36 * F3
    );
    ctx3.textAlign = "right";
    ctx3.font = FONT(11 * F3);
    ctx3.fillStyle = `rgba(240,226,203,${0.26 * k})`;
    ctx3.fillText(`build ${BUILD}`, view.w - 18 * F3, view.h - 16 * F3);
    ctx3.textAlign = "left";
  }
  function deviceLines(pad4, touch2) {
    if (touch2) {
      return [
        "The left of the screen steers her.",
        "The ring: a tap for what is in front of her, a hold for what is in her hand."
      ];
    }
    if (pad4) {
      return [
        `${padName("move")} or the d-pad to walk, ${padName("jump")} to jump, ${padName("dash")} to dash.`,
        `${padName("act")}: a tap for what is in front of her, a hold for what is in her hand.`
      ];
    }
    return [
      `${keyLabels("up")} and ${keyLabels("left")} to walk \xB7 ${keyLabels("jump")} to jump \xB7 ${keyLabels("dash")} to dash`,
      `${keyLabels("interact")} for what is in front of her \xB7 ${keyLabels("use")} for what is in her hand`
    ];
  }
  function drawRows(ctx3, which, x0, wide, top, rh, k, F3) {
    for (let i = 0; i < which.length; i++) {
      const r = rows[which[i]];
      if (!r) continue;
      const y = top + i * rh;
      const on = which[i] === menu.sel;
      const h = { x: x0 - 16, y: Math.round(y - rh * 0.72), w: wide + 32, h: rh, bar: null, row: which[i] };
      if (on) {
        ctx3.beginPath();
        round(ctx3, h.x, h.y, h.w, h.h, 8);
        ctx3.fillStyle = `rgba(52,38,26,${0.92 * k})`;
        ctx3.fill();
        ctx3.strokeStyle = `rgba(255,196,120,${0.85 * k})`;
        ctx3.lineWidth = 1.8;
        ctx3.stroke();
        ctx3.beginPath();
        ctx3.arc(h.x - 13, y - rh * 0.22, 3, 0, TAU);
        ctx3.fillStyle = `rgba(255,196,120,${0.9 * k})`;
        ctx3.fill();
      }
      ctx3.textAlign = "left";
      ctx3.font = FONT((on ? 15 : 14) * F3);
      ctx3.fillStyle = on ? `rgba(255,232,198,${0.98 * k})` : `rgba(226,210,186,${0.72 * k})`;
      ctx3.fillText(r.label, x0, y);
      if (r.slide) {
        const bw = Math.round(wide * 0.34), bh = Math.max(6, Math.round(7 * F3));
        const bx = x0 + wide - bw, by = Math.round(y - bh - 3 * F3);
        h.bar = { x: bx, y: by, w: bw, h: bh };
        ctx3.fillStyle = `rgba(255,170,80,${0.24 * k})`;
        ctx3.fillRect(bx, by, bw, bh);
        ctx3.fillStyle = `rgba(255,196,120,${0.92 * k})`;
        ctx3.fillRect(bx, by, Math.round(bw * r.slide()), bh);
        ctx3.textAlign = "right";
        ctx3.font = FONT(12 * F3);
        ctx3.fillStyle = `rgba(240,226,203,${0.6 * k})`;
        ctx3.fillText(`${Math.round(r.slide() * 100)}%`, bx - 12 * F3, y);
      } else if (r.value) {
        ctx3.textAlign = "right";
        ctx3.font = FONT(14 * F3);
        ctx3.fillStyle = r.lit ? `rgba(255,196,120,${(0.55 + 0.45 * Math.abs(Math.sin(menu.t * 3.6))) * k})` : `rgba(255,214,170,${0.86 * k})`;
        ctx3.fillText(r.value, x0 + wide, y);
      }
      hits.push(h);
      menu.bottom = Math.max(menu.bottom, h.y + h.h);
    }
    ctx3.textAlign = "left";
  }
  function round(ctx3, x, y, w, h, r) {
    ctx3.moveTo(x + r, y);
    ctx3.lineTo(x + w - r, y);
    ctx3.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx3.lineTo(x + w, y + h - r);
    ctx3.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx3.lineTo(x + r, y + h);
    ctx3.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx3.lineTo(x, y + r);
    ctx3.quadraticCurveTo(x, y, x + r, y);
  }

  // savi/src/savi-story.js
  var ROOTS = [
    {
      id: "choice",
      name: "The Choice",
      mural: "choice",
      hint: "Southwest, where the leaves lie deepest.",
      savi: "She knew he had one year. She married him anyway. I wonder what happened after that.",
      keeper: "Savitri was a great lady. Even though she knew he was going to die, she married him regardless.",
      lines: [
        ["keeper", "Ah, I remember her fire. Savitri was a strong, elegant princess. Not one prince came to ask for her hand, for she was better than all of them at everything, and they knew it.", "speaking"],
        ["savitri", "I have chosen. He is the one.", "resolute"],
        ["keeper", "She chose her own fate, and gave her heart to Satyavan, a banished prince living in the dust of a forest.", "speaking"],
        ["satyavan", "I have nothing. A hut, and my blind father, and the wood.", "warm"],
        ["keeper", "They rejoiced. And then the sage Narada came to the palace with a deep fear in his eyes.", "speaking"],
        ["narada", "The boy is faultless, my King. But in one year from today, he will die.", "grave"],
        ["keeper", "A cursed love. The princess would not change her decision, and they started their life together.", "weary"]
      ]
    },
    {
      id: "fall",
      name: "The Fall",
      mural: "fall",
      hint: "East, in the hollow the water has taken.",
      savi: "<i>Yamaraj</i> himself. The god of death came for Satyavan with his own hands. Poor Savitri. I feel so bad for her.",
      keeper: "Satyavan died after a year. And the Lord of Death, <i>Yamaraj</i>, came himself to collect his soul.",
      lines: [
        ["keeper", "They lived together for one year. After that year, Satyavan went into the wood to cut timber, and he fainted, and he fell.", "speaking"],
        ["keeper", "Savitri took his head into her lap, and stayed there.", "weary"],
        ["keeper", "Then a figure came out of the trees. He was the Lord of Death, and the Lord of <i>dharma</i>. He sat on his ride, a great buffalo.", "weary"],
        ["yama", "Let go of him, girl. I am here to collect his soul. Your duty as his wife is over. Go and make ready for his funeral.", "stern"]
      ]
    },
    {
      id: "pursuit",
      name: "The Pursuit",
      mural: "pursuit",
      hint: "West, where the black thorn has closed over.",
      savi: "She went after him. After DEATH. Savitri was really brave.",
      keeper: "Savitri was very brave. She was ready to bring Satyavan back from the Lord of Death himself.",
      lines: [
        ["keeper", "He drew the soul out of the boy, small and bright as a lamp, and turned south for the dark country.", "speaking"],
        ["yama", "Mortal. Turn back. The living do not walk this road.", "proud"],
        ["savitri", "Where my husband goes, I go. My road is tied to his.", "resolute"],
        ["keeper", "She did not weep, and she did not kneel. She stood up and walked after Death himself.", "speaking"],
        ["keeper", "Yama turned on her in anger. He reminded her who she was following, and what he could do to her.", "weary"],
        ["yama", "I am the Lord of <i>Dharma</i>, girl. I am Justice itself.", "stern"]
      ]
    },
    {
      id: "steps",
      name: "The Seven Steps",
      mural: "steps",
      hint: "Northeast, under the snow that never melts.",
      savi: "Savitri was so courageous. Was she able to bring Satyavan back to life?",
      keeper: "Savitri used the law of <i>dharma</i> against <i>Dharmaraj</i> himself. She really was a clever girl.",
      lines: [
        ["keeper", "Savitri did not fear <i>Yamaraj</i>. She fought him with her wits.", "speaking"],
        ["savitri", "Lord Yama, according to our <i>dharma</i>, it is said that if two people walk seven steps together, they are friends.", "clever"],
        ["savitri", "I have walked a great deal further than seven with you. A friend must hear a friend.", "clever"],
        ["yama", "You are a clever girl. Are you not afraid that I am the Lord of Death?", "caught"],
        ["keeper", "Yama was impressed by her wits. Would she be able to bring Satyavan back to life?", "pleased"]
      ]
    },
    {
      id: "boon",
      name: "The Boon",
      mural: "boon",
      hint: "North, where half the hillside came down on it.",
      savi: "Savitri got a boon from Yama. Anything at all, except the life of Satyavan. I wonder what she will do.",
      keeper: "Everyone he had ever come for wept, or bargained, or cursed him. She praised him. He had been Lord of Justice since before the hills and nobody had ever once thanked him for it.",
      lines: [
        ["keeper", "Yama thought Savitri would be afraid, after he had threatened her like that. But instead, she praised him.", "speaking"],
        ["savitri", "Fools fear you, <i>Dharmaraja</i>. They weep because they cannot see what you carry.", "pleading"],
        ["savitri", "You are the Lord of Justice. The righteous honour the balance you keep.", "pleading"],
        ["keeper", "Never had a mortal looked on Death with such kindness. He stopped at the very gate.", "pleased"],
        ["yama", "You are a very clever girl, full of wits. I am impressed by you. I will give you one boon. Ask me for anything, except the life of Satyavan.", "respect"]
      ]
    }
  ];
  var CLIMAX = [
    ["keeper", "She looked at the God of Death. And she smiled.", "speaking"],
    ["savitri", "Then grant me this, <i>Dharmaraja</i>: let me be the mother of a hundred strong sons.", "clever"],
    ["yama", "<i>Tathastu</i>. So be it.", "respect"],
    ["keeper", "And he turned to go, glad to be done with her.", "speaking"],
    ["savitri", "Wait. I am a <i>pativrata</i> (a wife completely devoted to her husband), and I can bear children by no other.", "clever"],
    ["savitri", "You are the God of Truth. You cannot lie. How am I to have sons, if you take him?", "clever"],
    ["keeper", "Yama stopped. He saw what she had done...", "pleased"],
    ["yama", "HA! Ha ha. Oh, well argued, little one. Well argued.", "approving"],
    ["keeper", "Death threw back his head and laughed, a warm, booming laugh that shook the forest.", "pleased"],
    ["yama", "You have won. Take him.", "approving"],
    ["keeper", "He let Satyavan go back to life. She won him back with her courage, her wits, her love, and her devotion to her husband.", "moved"]
  ];

  // savi/src/savi-keeper.js
  var KEEPER = {
    // --- the first meeting -------------------------------------------------------
    welcome: {
      repeat: true,
      text: "So they sent someone after all. Come to the fire, child. You will catch your death standing there.",
      choices: [
        { say: "What is wrong with the tree?", to: "tree", spine: true },
        { say: "Who are you?", to: "who" }
      ]
    },
    tree: {
      repeat: true,
      text: "It is dying. The Great Banyan, that has stood here longer than the village, and it is going out like a lamp.",
      choices: [
        { say: "Then give it water.", to: "water", spine: true }
      ]
    },
    water: {
      repeat: true,
      text: "Water. It has all the water in these hills, child. It is not thirsty. It is CHOKED. A tree drinks through its roots, and every root it has is buried, or drowned, or bound, or frozen, or under half a hillside.",
      choices: [
        { say: "Then we need to treat those roots.", to: "roots", spine: true },
        { say: "Why does this one tree matter so much?", to: "story" },
        { say: "Can a tree not grow new roots?", to: "remember" }
      ]
    },
    roots: {
      repeat: true,
      text: "Five Great Roots it has, and a root that cannot breathe carries nothing home. Free them. You will find murals on them, and those murals carry a great story.",
      choices: [
        { say: "Then that is my work. Where do I start?", to: "brief0", spine: true },
        { say: "Why can you not do it?", to: "frail" },
        { say: "What is on the murals?", to: "before" }
      ]
    },
    // --- the five briefings ------------------------------------------------------
    //
    // Each one says what the burden is, WHY it is there, and what the tool in her
    // hand will do about it. The tool is handed over at the end of it, which is
    // the moment the task begins.
    brief0: {
      repeat: true,
      text: "South-west of the shrine, where the ground dips. Two autumns of leaves have come down in that hollow and nobody swept them, and now the root under them cannot feel the air.",
      choices: [
        { say: "I will sweep it.", to: "give0", spine: true }
      ]
    },
    give0: {
      repeat: true,
      give: "broom",
      text: "Take my broom, then. It is a wide drift and it will take you a while. Come back when the root can breathe.",
      choices: [{ say: "I will.", to: "leave", spine: true }]
    },
    brief1: {
      repeat: true,
      text: "East, now. There is a gate out there that lets the water out of the valley. It jammed shut two winters ago. The water rose, and one of the Great Roots has been under it ever since.",
      choices: [
        { say: "Then I open the gate.", to: "give1", spine: true },
        { say: "How do I get across water?", to: "howcross" }
      ]
    },
    give1: {
      repeat: true,
      give: "crank",
      text: "You will need this. There is a wheel by the gate that lifts it, and the handle was taken off it years ago so nobody could flood the road for a joke. Fit this crank on, put your shoulder to the bar, and walk it round three times. The gate comes up as you go.",
      choices: [{ say: "And the water itself?", to: "howcross" }, { say: "I will go.", to: "leave", spine: true }]
    },
    brief2: {
      repeat: true,
      text: "West. There is black thorn over that root, and it did not grow there by accident. Thorn comes up where the ground has gone cold and nothing else will hold it. It has been closing for two years.",
      choices: [
        { say: "How do I get through thorn?", to: "give2", spine: true },
        { say: "Is it dangerous?", to: "thornsafe" }
      ]
    },
    give2: {
      repeat: true,
      give: "lamp",
      text: "You do not cut it, child, you burn it. Take this lamp. It will not burn without a coal in it, and I have put one of mine in. Hold it out at the thorn and burn a way through.",
      choices: [
        { say: "What if it goes out?", to: "lampout" },
        { say: "I will go.", to: "leave", spine: true }
      ]
    },
    brief3: {
      repeat: true,
      give: "lamp",
      text: "North-east now, under the snow that never melts. You will melt it away with the lamp. Mind the coal, though. Snow drinks it faster than thorn does.",
      choices: [
        { say: "Then I take the lamp and go.", to: "leave", spine: true }
      ]
    },
    brief4: {
      repeat: true,
      text: "The last one is north, at the head of the valley. Half the hillside came down on it the winter before last and it has been under the stones ever since. You will have to clear those stones.",
      choices: [
        { say: "Then I will move them.", to: "give4", spine: true },
        { say: "Nobody cleared it?", to: "whyash" }
      ]
    },
    give4: {
      repeat: true,
      give: "broom",
      text: "Clear those stones. Throw them in the spring up there, then sweep the grit they leave behind, and you will find the root under it.",
      choices: [
        { say: "I will go.", to: "leave", spine: true }
      ]
    },
    // --- while she is out working -------------------------------------------------
    remind: {
      repeat: true,
      text: "",
      // filled in by the game
      choices: [{ say: "I am going.", to: "leave", spine: true }]
    },
    back: {
      repeat: true,
      // Filled in by keeperFill with what she has to say about the beat that
      // just came back. This is only the fallback.
      text: "You have treated that root. The trunk went warm under my hand as it took.",
      // ONE LINE. "Tell me that piece again" repeated something she had heard
      // a minute earlier, which the panel on the tree does properly whenever
      // she likes, and "How much is left?" read back a number that is already
      // at the top of the screen. Neither of them told her anything, and two
      // rows of nothing on the one hub she comes back to five times is worse
      // than no rows at all.
      choices: [
        { say: "What is next?", to: "brief0", spine: true }
        // retargeted in keeperFill
      ]
    },
    // --- the asides ------------------------------------------------------------------
    //
    // Each answers once and hands back to the hub it was asked from, so nothing
    // is ever a dead end and the spine is always still there underneath.
    who: {
      text: "The keeper. They choose one out of the villages and send her up, the way they have always done, the way they sent you. I was nine when they sent me. There is not much keeping left in me now.",
      choices: [{ say: "I see.", to: "welcome" }]
    },
    story: {
      text: "Because of what happened under it, long ago. That is why they come up and tie their threads on it. I knew the whole of it word for word once. I have told it a hundred times. But I am old and it has gone out of me. Free the roots, and the murals may bring it back.",
      choices: [{ say: "I want to hear that story.", to: "water" }]
    },
    remember: {
      text: "Not at its age, and not in this cold.",
      choices: [{ say: "All right.", to: "water" }]
    },
    frail: {
      text: "Look at my hands, child. I have not walked past that stone in two winters. But you have a warmth to your step.",
      choices: [{ say: "Then I will go.", to: "roots" }]
    },
    before: {
      text: "The story. One piece of it to a root. That is the whole reason the murals are there, and the reason nobody has read one in two winters.",
      choices: [{ say: "I understand.", to: "roots" }]
    },
    howcross: {
      text: "Leaves, child. Great ones, broad as cartwheels, come down off the banyan and float there. They will hold you if you keep moving. Some drift, so watch them a moment before you trust them.",
      choices: [{ say: "Right.", to: "brief1" }]
    },
    thornsafe: {
      text: "It will not bite you. It will only refuse to let you past.",
      choices: [{ say: "Not me.", to: "brief2" }]
    },
    lampout: {
      text: "Stand at any fire a moment and it fills again.",
      choices: [{ say: "I will remember.", to: "brief2" }]
    },
    whyash: {
      text: "My old body is too weak for that.",
      choices: [{ say: "I see.", to: "brief4" }]
    },
    // --- all five awake, and the end of it in three beats ---------------------------
    //
    // It used to be one: stand near the tree with five roots done and the whole
    // climax fired at you on the spot. Now she is sent, she reads it herself,
    // and she comes back and is told what she has become.
    sendoff: {
      repeat: true,
      mark: "sent",
      text: "You have cleared all the roots. You will find the sixth mural on the Great Banyan itself. Go and take a look at it.",
      choices: [{ say: "I will go and look.", to: "leave", spine: true }]
    },
    farewell: {
      repeat: true,
      text: "Savitri was a devoted wife. She went after the Lord of Death himself, and by her own determination she brought her husband back from death. That is why the women come up and tie their threads on this tree, for the long life of their husbands.",
      choices: [
        { say: "So that is why they come.", to: "blessing", spine: true }
      ]
    },
    blessing: {
      repeat: true,
      mark: "blessed",
      text: "Look at you. You are fit to keep this tree, child, and I am the old woman who sits by the fire. Let me have that for whatever days are left. From now on, you are the keeper of the Great Banyan.",
      choices: [{ say: "It will be my honour.", to: "leave", spine: true }]
    },
    /** After the credits: whatever is on her mind, and nothing is asked of anyone. */
    idle: { repeat: true, text: "", choices: [{ say: "\u2026", to: "leave", spine: true }] }
  };
  var IDLE = [
    "Listen to that. Birds. I had got so used to the quiet I thought that was the sound a valley made.",
    "The gold is coming down at last. Two autumns it hung up there refusing to fall, and now look at it.",
    "Sit a while if you like. I am not going anywhere and neither, apparently, is the tree.",
    "There were deer in the lower field this morning. I have not seen a deer since before you were born.",
    "They will start coming up again, you know. The women, with their threads. You will have to learn all their names.",
    "I was your age once and I thought this job was sweeping. It is not sweeping.",
    "Do not let them tell you the tree did it by itself. I saw who did it.",
    "It is warm. Feel the trunk. It has not been warm in two winters and it is warm."
  ];
  function keeperStart(st2, total) {
    if (st2.after) return "idle";
    if (st2.bloom >= 1) return st2.blessed ? "idle" : "farewell";
    if (st2.done >= total) return "sendoff";
    if (st2.briefed) return "remind";
    if (st2.done === 0) return st2.asked && st2.asked.roots ? "brief0" : "welcome";
    return "back";
  }
  function keeperFill(st2, stageNow, onLast) {
    KEEPER.idle.text = IDLE[Math.random() * IDLE.length | 0];
    if (onLast) KEEPER.back.text = `You have treated that root. ${onLast}`;
    KEEPER.remind.text = stageNow ? `You have what you need, child. ${cap(stageNow.task)} \u2014 ${stageNow.where}.` : "Off you go.";
    KEEPER.back.choices[0].to = stageNow ? stageNow.brief : "sendoff";
  }
  var cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // savi/src/savi-quest.js
  var CHAIN = [
    {
      root: "choice",
      tool: "broom",
      where: "south-west of the shrine",
      task: "sweep the leaves off the buried root",
      brief: "brief0"
    },
    {
      root: "fall",
      tool: "crank",
      where: "the drowned course, east",
      task: "cross the water and wind the sluice open",
      brief: "brief1"
    },
    {
      root: "pursuit",
      tool: "lamp",
      where: "the black thorn, west",
      task: "hold the lamp out and let the thorn draw back",
      brief: "brief2"
    },
    {
      root: "steps",
      tool: "lamp",
      where: "the snow that never melts, north-east",
      task: "thaw the snow off the root",
      brief: "brief3"
    },
    {
      root: "boon",
      tool: "broom",
      where: "the stone fall, north",
      task: "throw the stones in the spring, then sweep what is left",
      brief: "brief4"
    }
  ];
  var stage = (st2) => CHAIN[st2.done] || null;
  var has = (st2, tool) => !!(st2.tools && st2.tools[tool]);
  function objective(st2, ROOTS2, WOMAN2, TREE2, here, gorge, unread) {
    if (st2.after) return null;
    if (unread) {
      return { text: "a mural has come up on the new tree. go and read it", x: unread.x, y: unread.y, kind: "mural" };
    }
    const s = stage(st2);
    if (!s) {
      if (!st2.sent) {
        return { text: "all five are awake. go back to the keeper", x: WOMAN2.x, y: WOMAN2.y, kind: "keeper" };
      }
      if (!(st2.bloom >= 1)) {
        return { text: "the last mural is on the Banyan itself", x: TREE2.x, y: TREE2.y + 40, kind: "mural" };
      }
      if (!st2.blessed) {
        return { text: "go and tell her what it says", x: WOMAN2.x, y: WOMAN2.y, kind: "keeper" };
      }
      return null;
    }
    if (!st2.briefed) {
      return {
        text: st2.done === 0 ? "find the keeper at the foot of the tree" : "go back to the keeper",
        x: WOMAN2.x,
        y: WOMAN2.y,
        kind: "keeper"
      };
    }
    const r = ROOTS2.find((q) => q.id === s.root);
    if (s.root === "fall" && gorge && here && !gorge.inside(here.x, here.y)) {
      return { text: `the mouth of the gorge, ${gorge.where}`, x: gorge.mouth[0], y: gorge.mouth[1], kind: "mouth" };
    }
    return { text: `${s.task}, ${s.where}`, x: r ? r.at.x : WOMAN2.x, y: r ? r.at.y : WOMAN2.y, kind: "root" };
  }
  function brief(st2) {
    const s = stage(st2);
    if (!s) return null;
    st2.briefed = true;
    st2.tools = st2.tools || {};
    st2.tools[s.tool] = true;
    return s;
  }
  function rootDone(st2) {
    let n = 0;
    while (n < CHAIN.length && st2.woken[CHAIN[n].root]) n++;
    st2.done = n;
    st2.briefed = false;
  }

  // savi/src/cinema.js
  var FILM = { w: 1e3, h: 560 };
  var FADE2 = 0.55;
  var OPEN = 1.2;
  var BARS = 0.075;
  var FONT2 = '"Segoe UI", Roboto, system-ui, sans-serif';
  var film = null;
  function startCinema(shots, onEnd, opts = {}) {
    film = {
      shots,
      onEnd,
      i: 0,
      t: 0,
      age: 0,
      out: 0,
      outMax: FADE2,
      fired: /* @__PURE__ */ new Set(),
      manual: !!opts.manual
    };
    const first = shots[0];
    if (first && first.cue) first.cue();
    return film;
  }
  function cinemaOn() {
    return !!film;
  }
  function skipCinema() {
    if (film && film.out <= 0) {
      film.out = 0.4;
      film.outMax = 0.4;
    }
  }
  function advanceCinema() {
    if (!film || film.out > 0) return;
    if (film.t < 0.35 && film.i > 0) return;
    if (film.age < 0.5) return;
    cut();
  }
  function pressCinema() {
    if (!film) return;
    if (film.manual) advanceCinema();
    else skipCinema();
  }
  function cut() {
    film.i++;
    film.t = 0;
    const next = film.shots[film.i];
    if (!next) {
      film.out = film.outMax = FADE2;
      return;
    }
    if (next.cue) next.cue();
  }
  function updateCinema(dt) {
    if (!film) return;
    film.age += dt;
    film.t += dt;
    if (film.out > 0) {
      film.out -= dt;
      if (film.out <= 0) {
        const end = film.onEnd;
        film = null;
        if (end) end();
      }
      return;
    }
    const shot = film.shots[film.i];
    if (!shot) {
      film.out = film.outMax = FADE2;
      return;
    }
    if (shot.beats) {
      for (let b = 0; b < shot.beats.length; b++) {
        const key = film.i + ":" + b;
        if (film.t >= shot.beats[b].at && !film.fired.has(key)) {
          film.fired.add(key);
          shot.beats[b].run();
        }
      }
    }
    if (!film.manual && film.t >= shot.hold) cut();
  }
  var ease = (k) => k * k * (3 - 2 * k);
  var mix = (a, b, k) => a + (b - a) * k;
  function drawCinema(ctx3, view2) {
    if (!film) return;
    const shot = film.shots[Math.min(film.i, film.shots.length - 1)];
    const k = clamp(film.t / shot.hold, 0, 1);
    ctx3.fillStyle = "#000";
    ctx3.fillRect(0, 0, view2.w, view2.h);
    const cover2 = Math.max(view2.w / FILM.w, view2.h / FILM.h);
    const c = shot.cam || {};
    const e = ease(k);
    const z = cover2 * mix(c.z0 === void 0 ? 1 : c.z0, c.z1 === void 0 ? 1 : c.z1, e);
    const px = mix(c.x0 || 0, c.x1 || 0, e);
    const py = mix(c.y0 || 0, c.y1 || 0, e);
    ctx3.save();
    ctx3.translate(view2.w / 2, view2.h / 2);
    ctx3.scale(z, z);
    ctx3.translate(-FILM.w / 2 - px, -FILM.h / 2 - py);
    shot.draw(ctx3, film.t, k);
    ctx3.restore();
    const bar = Math.round(view2.h * BARS);
    ctx3.fillStyle = "#000";
    ctx3.fillRect(0, 0, view2.w, bar);
    ctx3.fillRect(0, view2.h - bar, view2.w, bar);
    if (shot.say) {
      const at = shot.sayAt === void 0 ? 0.55 : shot.sayAt;
      const up = clamp((film.t - at) / 0.5, 0, 1);
      const down = film.manual ? 1 : clamp((shot.hold - 0.35 - film.t) / 0.45, 0, 1);
      const show = Math.min(up, down);
      if (show > 0.01) {
        const wash = ctx3.createLinearGradient(0, view2.h - bar - 118, 0, view2.h - bar);
        wash.addColorStop(0, "rgba(4,3,7,0)");
        wash.addColorStop(1, `rgba(4,3,7,${(0.62 * show).toFixed(3)})`);
        ctx3.fillStyle = wash;
        ctx3.fillRect(0, view2.h - bar - 118, view2.w, 118);
      }
      drawSay(ctx3, view2, shot.say, show * 0.96, bar);
    }
    const last = film.i >= film.shots.length - 1;
    const after = film.manual ? (shot.sayAt === void 0 ? 0.55 : shot.sayAt) + 0.7 : 2.2;
    const hint = clamp((film.t - after) / 0.6, 0, 1) * (film.out > 0 ? 0 : 1) * (film.manual ? 1 : clamp((film.age - 2.2) / 0.8, 0, 1));
    if (hint > 0.01) {
      const pulse2 = film.manual ? 0.62 + 0.24 * Math.sin(film.age * 2.6) : 0.4;
      ctx3.globalAlpha = hint * pulse2;
      ctx3.fillStyle = "#e9dcc8";
      ctx3.font = `600 11px ${FONT2}`;
      ctx3.textAlign = "right";
      ctx3.fillText(
        film.manual ? last ? "TAP TO BEGIN  \u203A" : "TAP TO GO ON  \u203A" : "PRESS ANYWHERE TO SKIP",
        view2.w - 18,
        view2.h - bar - 14
      );
      ctx3.textAlign = "left";
      ctx3.globalAlpha = 1;
    }
    let dark = 0;
    if (film.age < OPEN) dark = 1 - film.age / OPEN;
    if (film.t < FADE2 && film.i > 0) dark = Math.max(dark, 1 - film.t / FADE2);
    if (!film.manual && shot.hold - film.t < FADE2 && film.out <= 0) dark = Math.max(dark, 1 - (shot.hold - film.t) / FADE2);
    if (film.out > 0) dark = Math.max(dark, 1 - film.out / film.outMax);
    if (dark > 1e-3) {
      ctx3.fillStyle = `rgba(0,0,0,${clamp(dark, 0, 1).toFixed(3)})`;
      ctx3.fillRect(0, 0, view2.w, view2.h);
    }
  }
  function drawSay(ctx3, view2, text, alpha, bar) {
    if (alpha <= 0.01) return;
    const size = Math.max(13, Math.min(19, Math.round(view2.w / 46)));
    ctx3.font = `600 ${size}px ${FONT2}`;
    ctx3.textAlign = "center";
    const max = Math.min(view2.w * 0.84, 760);
    const lines = [];
    let line = "";
    for (const word of text.split(" ")) {
      const next = line ? line + " " + word : word;
      if (ctx3.measureText(next).width > max && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    const lh = size * 1.42;
    let y = view2.h - bar - 16 - (lines.length - 1) * lh;
    for (const l of lines) {
      ctx3.globalAlpha = alpha * 0.55;
      ctx3.fillStyle = "#000";
      ctx3.fillText(l, view2.w / 2 + 1, y + 2);
      ctx3.globalAlpha = alpha;
      ctx3.fillStyle = "#f0e2cb";
      ctx3.fillText(l, view2.w / 2, y);
      y += lh;
    }
    ctx3.globalAlpha = 1;
    ctx3.textAlign = "left";
  }

  // savi/src/savi-gond.js
  var TAU2 = Math.PI * 2;
  var G = {
    soot: "#120c12",
    geru: "#e04a2c",
    geruDark: "#a82a1c",
    haldi: "#f5c02a",
    haldiPale: "#ffde7a",
    patta: "#52b84a",
    pattaDark: "#2c7d3c",
    neel: "#2f74d8",
    neelDark: "#16357e",
    chuna: "#fff3dc",
    mitti: "#a8652c",
    mittiPale: "#d1924a",
    kesar: "#f5822a",
    // saffron orange
    jamun: "#8a45c4",
    // the purple of a jamun
    gulabi: "#e0417e",
    // the pink that turns up in every modern Gond panel
    hara: "#16a89c",
    // a teal green
    skin: "#d08a4c",
    skinDark: "#a8622c",
    ash: "#7d7368",
    night: "#0e0a10"
  };
  var MARK = {
    dot(c, x, y, a, s) {
      c.beginPath();
      c.arc(x, y, s * 0.5, 0, TAU2);
      c.fill();
    },
    dash(c, x, y, a, s) {
      c.beginPath();
      c.moveTo(x - Math.cos(a) * s, y - Math.sin(a) * s);
      c.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
      c.stroke();
    },
    tick(c, x, y, a, s) {
      const b = a + Math.PI / 2;
      c.beginPath();
      c.moveTo(x - Math.cos(b) * s, y - Math.sin(b) * s);
      c.lineTo(x + Math.cos(b) * s, y + Math.sin(b) * s);
      c.stroke();
    },
    crescent(c, x, y, a, s) {
      c.beginPath();
      c.arc(x, y, s, a - 2.1, a + 2.1);
      c.stroke();
    },
    scale(c, x, y, a, s) {
      c.beginPath();
      c.arc(x, y, s, a + Math.PI * 0.15, a + Math.PI * 0.85);
      c.stroke();
    },
    seed(c, x, y, a, s) {
      c.save();
      c.translate(x, y);
      c.rotate(a);
      c.beginPath();
      c.moveTo(-s, 0);
      c.quadraticCurveTo(0, -s * 0.72, s, 0);
      c.quadraticCurveTo(0, s * 0.72, -s, 0);
      c.fill();
      c.restore();
    },
    eyeDot(c, x, y, a, s) {
      c.beginPath();
      c.arc(x, y, s * 0.42, 0, TAU2);
      c.fill();
      c.beginPath();
      c.arc(x, y, s * 0.95, 0, TAU2);
      c.stroke();
    },
    shoot(c, x, y, a, s) {
      c.save();
      c.translate(x, y);
      c.rotate(a);
      c.beginPath();
      c.moveTo(0, s);
      c.lineTo(0, -s * 0.3);
      c.moveTo(0, -s * 0.2);
      c.quadraticCurveTo(s * 0.7, -s * 0.5, s * 0.45, -s);
      c.moveTo(0, -s * 0.2);
      c.quadraticCurveTo(-s * 0.7, -s * 0.5, -s * 0.45, -s);
      c.stroke();
      c.restore();
    }
  };
  var STROKED = { dash: 1, tick: 1, crescent: 1, scale: 1, shoot: 1, eyeDot: 1 };
  function paint(c, F3, o) {
    const N = o.steps || 44;
    const trace = (g) => {
      g.moveTo(...F3.at(0, 1));
      for (let i = 1; i <= N; i++) g.lineTo(...F3.at(i / N, 1));
      if (F3.closed) {
        g.closePath();
        return;
      }
      for (let i = N; i >= 0; i--) g.lineTo(...F3.at(i / N, -1));
      g.closePath();
    };
    c.save();
    if (o.fill) {
      c.beginPath();
      trace(c);
      c.fillStyle = o.fill;
      c.fill();
    }
    if (o.fill2) {
      c.save();
      c.beginPath();
      trace(c);
      c.clip();
      c.fillStyle = o.fill2;
      c.beginPath();
      const m = o.band === void 0 ? 0.45 : o.band;
      c.moveTo(...F3.at(0, m));
      for (let i = 1; i <= N; i++) c.lineTo(...F3.at(i / N, m));
      for (let i = N; i >= 0; i--) c.lineTo(...F3.at(i / N, F3.closed ? 0 : -1));
      c.closePath();
      c.fill();
      c.restore();
    }
    if (o.mark) {
      const rows2 = o.rows || 3, along2 = o.along || 16;
      const fn = MARK[o.mark] || MARK.dot;
      const stroked = STROKED[o.mark];
      c.fillStyle = o.on || "rgba(255,243,220,0.85)";
      c.strokeStyle = o.on || "rgba(255,243,220,0.85)";
      c.lineWidth = o.mlw || 1.5;
      c.lineCap = "round";
      const s = o.ms || 2.1;
      const v0 = F3.closed ? 0.18 : -0.72, v1 = F3.closed ? 0.92 : 0.72;
      for (let r = 0; r < rows2; r++) {
        const v = rows2 === 1 ? (v0 + v1) / 2 : v0 + (v1 - v0) * (r / (rows2 - 1));
        const off = r & 1 ? 0.5 / along2 : 0;
        const n = F3.closed ? along2 : along2;
        for (let i = 0; i < n; i++) {
          const u = (i / n + off + (o.phase || 0)) % 1;
          const p = F3.at(u, v);
          const q = F3.at((u + 0.012) % 1, v);
          const a = Math.atan2(q[1] - p[1], q[0] - p[0]);
          const sz = typeof s === "function" ? s(u, v) : s;
          fn(c, p[0], p[1], a, sz);
        }
      }
      if (stroked) c.fill?.call(c);
    }
    if (o.ink !== false) {
      c.beginPath();
      trace(c);
      c.strokeStyle = o.ink || G.soot;
      c.lineWidth = o.lw || 2.6;
      c.lineJoin = "round";
      c.stroke();
    }
    c.restore();
  }
  function ribbon(spine, w0, w1, bulge) {
    const n = spine.length;
    const pt = (u) => {
      const f = u * (n - 1), i = Math.min(n - 2, Math.floor(f)), k = f - i;
      const a = spine[i], b = spine[i + 1];
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    };
    return {
      closed: false,
      at(u, v) {
        const p = pt(Math.max(0, Math.min(1, u)));
        const q = pt(Math.max(0, Math.min(1, u + 0.02)));
        const dx = q[0] - p[0], dy = q[1] - p[1], d = Math.hypot(dx, dy) || 1;
        let w = w0 + (w1 - w0) * u;
        if (bulge) w *= 1 + bulge * Math.sin(u * Math.PI);
        return [p[0] - dy / d * w * v, p[1] + dx / d * w * v];
      }
    };
  }
  function rosette(cx, cy, rx, ry, wob) {
    return {
      closed: true,
      at(u, v) {
        const a = u * TAU2;
        const w = wob ? 1 + wob(a) : 1;
        return [cx + Math.cos(a) * rx * w * v, cy + Math.sin(a) * ry * w * v];
      }
    };
  }
  function lens(cx, cy, len, wid, rot) {
    const co = Math.cos(rot || 0), si = Math.sin(rot || 0);
    return {
      closed: false,
      at(u, v) {
        const x = -len + 2 * len * u;
        const y = Math.sin(u * Math.PI) * wid * v;
        return [cx + x * co - y * si, cy + x * si + y * co];
      }
    };
  }
  function blob(c, x, y, rx, ry, rot, o) {
    const F3 = rot ? { closed: true, at: (u, v) => {
      const a = u * TAU2, px = Math.cos(a) * rx * v, py = Math.sin(a) * ry * v;
      return [x + px * Math.cos(rot) - py * Math.sin(rot), y + px * Math.sin(rot) + py * Math.cos(rot)];
    } } : rosette(x, y, rx, ry);
    paint(c, F3, o);
  }
  function limb(c, spine, w0, w1, o) {
    paint(c, ribbon(spine, w0, w1), o);
  }
  function leaf(c, x, y, len, wid, rot, o) {
    paint(c, lens(x, y, len, wid, rot), { rows: 2, along: 9, ms: 1.6, ...o });
    const co = Math.cos(rot), si = Math.sin(rot);
    c.strokeStyle = o.ink || G.soot;
    c.lineWidth = 1.3;
    c.beginPath();
    c.moveTo(x - len * 0.86 * co, y - len * 0.86 * si);
    c.lineTo(x + len * 0.86 * co, y + len * 0.86 * si);
    c.stroke();
  }
  function field(c, path, o) {
    c.save();
    c.beginPath();
    path(c);
    if (o.fill) {
      c.fillStyle = o.fill;
      c.fill();
    }
    if (o.motif && o.box) {
      c.save();
      c.clip();
      motif(c, o.box, o.motif, o.on, o.pitch);
      c.restore();
    }
    if (o.ink !== false) {
      c.strokeStyle = o.ink || G.soot;
      c.lineWidth = o.lw || 2.4;
      c.lineJoin = "round";
      c.beginPath();
      path(c);
      c.stroke();
    }
    c.restore();
  }
  function motif(c, b, name, col, pitch = 9) {
    const fn = MARK[{
      dots: "dot",
      dotLines: "dot",
      comb: "dash",
      dashes: "dash",
      scales: "scale",
      crescents: "crescent",
      seeds: "seed",
      waves: "crescent",
      hatch: "dash",
      shoots: "shoot"
    }[name] || name] || MARK.dot;
    c.save();
    c.fillStyle = col || "rgba(255,243,220,0.6)";
    c.strokeStyle = col || "rgba(255,243,220,0.6)";
    c.lineWidth = 1.4;
    c.lineCap = "round";
    const s = name === "dots" || name === "dotLines" ? 3 : pitch * 0.32;
    for (let y = b.y, row2 = 0; y < b.y + b.h + pitch; y += pitch, row2++) {
      for (let x = b.x + (row2 & 1 ? pitch / 2 : 0); x < b.x + b.w + pitch; x += pitch) {
        fn(c, x, y, 0, s);
      }
    }
    c.restore();
  }
  function eye(c, x, y, w, h, look = 0, lid = 0) {
    paint(c, rosette(x, y, w, h), { fill: G.chuna, lw: 2.2, ink: G.soot });
    c.fillStyle = G.soot;
    c.beginPath();
    c.arc(x + look * w * 0.28, y, h * 0.6, 0, TAU2);
    c.fill();
    c.fillStyle = "rgba(255,255,255,0.85)";
    c.beginPath();
    c.arc(x + look * w * 0.28 - h * 0.2, y - h * 0.22, h * 0.17, 0, TAU2);
    c.fill();
    if (lid > 0.02) {
      c.save();
      c.beginPath();
      c.ellipse(x, y, w + 1.4, h + 1.4, 0, 0, TAU2);
      c.clip();
      c.fillStyle = G.skinDark;
      c.fillRect(x - w - 2, y - h - 2, w * 2 + 4, (h * 2 + 4) * lid);
      c.restore();
      c.strokeStyle = G.soot;
      c.lineWidth = 1.8;
      c.beginPath();
      c.moveTo(x - w, y - h + h * 2 * lid);
      c.quadraticCurveTo(x, y - h + h * 2 * lid + h * 0.45, x + w, y - h + h * 2 * lid);
      c.stroke();
    }
  }
  function disc(c, x, y, r, o) {
    const rays = o.rays === void 0 ? 16 : o.rays;
    if (rays) {
      c.strokeStyle = o.rayCol || o.ink || G.soot;
      c.lineWidth = o.lw || 2;
      c.lineCap = "round";
      c.beginPath();
      for (let i = 0; i < rays; i++) {
        const a = i / rays * TAU2 + (o.spin || 0);
        const l = i & 1 ? 1.44 : 1.24;
        c.moveTo(x + Math.cos(a) * r * 1.04, y + Math.sin(a) * r * 1.04);
        c.lineTo(x + Math.cos(a) * r * l, y + Math.sin(a) * r * l);
        if (!(i & 1)) {
          c.moveTo(x + Math.cos(a) * r * l, y + Math.sin(a) * r * l);
          c.arc(x + Math.cos(a) * r * l, y + Math.sin(a) * r * l, 2.4, 0, TAU2);
        }
      }
      c.stroke();
      c.lineCap = "butt";
    }
    blob(c, x, y, r, r, 0, { rows: 3, along: 26, ms: 2.4, ...o });
  }
  function bird(c, x, y, s, o) {
    paint(c, lens(x - s * 0.5, y - s * 0.2, s * 0.62, s * 0.5, -0.6), { rows: 1, along: 5, ms: 1.4, ...o });
    paint(c, lens(x + s * 0.5, y - s * 0.2, s * 0.62, s * 0.5, 0.6), { rows: 1, along: 5, ms: 1.4, ...o });
    blob(c, x, y, s * 0.42, s * 0.3, 0, { ...o, rows: 1, along: 6, ms: 1.4 });
    c.fillStyle = o.ink || G.soot;
    c.beginPath();
    c.arc(x, y - s * 0.05, s * 0.09, 0, TAU2);
    c.fill();
  }
  function band(c, x, y, w, h, o) {
    field(c, (g) => g.rect(x, y, w, h), { ...o, box: { x, y, w, h } });
  }
  function frame(c, w, h, m, o) {
    band(c, 0, 0, w, m, o);
    band(c, 0, h - m, w, m, o);
    band(c, 0, m, m, h - m * 2, o);
    band(c, w - m, m, m, h - m * 2, o);
  }

  // savi/src/savi-open.js
  var TAU3 = Math.PI * 2;
  var W = FILM.w;
  var H = FILM.h;
  function ground(ctx3, top, bottom, mark = "dot", on = "rgba(255,243,220,0.07)") {
    const g = ctx3.createLinearGradient(0, -200, 0, H + 200);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx3.fillStyle = g;
    ctx3.fillRect(-400, -300, W + 800, H + 600);
    motif(ctx3, { x: -400, y: -300, w: W + 800, h: H + 600 }, mark, on, 22);
  }
  function ridge(ctx3, y, amp, seed, fill) {
    ctx3.fillStyle = fill;
    ctx3.beginPath();
    ctx3.moveTo(-400, H + 300);
    ctx3.lineTo(-400, y);
    for (let x = -400; x <= W + 400; x += 40) {
      ctx3.lineTo(x, y + Math.sin(x * 4e-3 + seed) * amp + Math.sin(x * 0.011 + seed * 2) * amp * 0.4);
    }
    ctx3.lineTo(W + 400, H + 300);
    ctx3.closePath();
    ctx3.fill();
  }
  function banyan(ctx3, x, base, s, leafy, t) {
    ctx3.save();
    ctx3.translate(x, base);
    ctx3.scale(s, s);
    for (const d of [-1, 1]) {
      paint(ctx3, ribbon([[d * 54, 0], [d * 30, -60], [d * 12, -130]], 26, 14), {
        fill: G.mitti,
        mark: "dash",
        on: "rgba(255,243,220,0.5)",
        rows: 2,
        along: 12,
        ms: 3,
        mlw: 1.3,
        lw: 2.4
      });
    }
    paint(ctx3, ribbon([[0, 6], [-6, -90], [4, -190], [0, -250]], 40, 22), {
      fill: G.mitti,
      fill2: "#7a4a1f",
      band: 0.2,
      mark: "dash",
      on: "rgba(255,243,220,0.55)",
      rows: 4,
      along: 22,
      ms: 3.4,
      mlw: 1.4,
      lw: 2.6
    });
    for (let i = 0; i < 9; i++) {
      const a = -2.9 + i * 0.33;
      const ex = Math.cos(a) * 250, ey = -250 + Math.sin(a) * 120;
      paint(ctx3, ribbon([[0, -240], [ex * 0.5, ey * 0.62 - 60], [ex, ey]], 13, 5), {
        fill: G.mitti,
        mark: "dot",
        on: "rgba(255,243,220,0.45)",
        rows: 2,
        along: 14,
        ms: 2,
        lw: 2
      });
      if (i % 2 === 0) {
        paint(ctx3, ribbon([[ex * 0.8, ey + 10], [ex * 0.8 + Math.sin(t + i) * 6, ey + 120]], 4, 2.5), {
          fill: "#6a451f",
          lw: 1.6
        });
      }
      if (!leafy) continue;
      for (let j = 0; j < 3; j++) {
        const b = a + (j - 1) * 0.3;
        leaf(ctx3, ex + Math.cos(b) * 34, ey + Math.sin(b) * 26, 26, 13, b, {
          fill: j === 1 ? G.patta : G.hara,
          mark: "tick",
          on: "rgba(255,243,220,0.8)",
          rows: 1,
          along: 8,
          ms: 4,
          mlw: 1.4,
          lw: 1.8
        });
      }
    }
    ctx3.restore();
  }
  function figure(ctx3, x, base, s, o = {}) {
    ctx3.save();
    ctx3.translate(x, base);
    ctx3.scale(s, s);
    const cloth = o.cloth || G.geru, hair = o.hair || "#170f14";
    paint(ctx3, ribbon([[0, 0], [0, -28], [0, -54]], 26, 15), {
      fill: cloth,
      mark: "dot",
      on: "rgba(255,243,220,0.85)",
      rows: 3,
      along: 12,
      ms: 2,
      lw: 2.2
    });
    const swing = o.walk ? Math.sin(o.walk) * 9 : 0;
    limb(ctx3, [[-13, -46], [-20 - swing, -22]], 5, 4, { fill: G.skin, lw: 1.8 });
    limb(ctx3, [[13, -46], [20 + swing, -22]], 5, 4, { fill: G.skin, lw: 1.8 });
    blob(ctx3, 0, -66, 14, 16, 0, { fill: G.skin, mark: "dot", on: "rgba(120,45,15,0.3)", rows: 2, along: 10, ms: 1.6, lw: 2.2 });
    paint(ctx3, { closed: false, at: (u, v) => {
      const a = Math.PI + u * Math.PI;
      return [Math.cos(a) * 15 * (0.74 + 0.26 * v), -66 + Math.sin(a) * 17 * (0.74 + 0.26 * v)];
    } }, { fill: hair, mark: "crescent", on: "rgba(224,65,126,0.6)", rows: 2, along: 12, ms: 2.4, mlw: 1.2, lw: 1.8 });
    if (o.braid) {
      paint(ctx3, ribbon([[12, -64], [20, -40], [16, -14]], 5, 3), { fill: hair, lw: 1.6 });
    }
    if (o.stick) {
      paint(ctx3, ribbon([[18, -20], [24, -88]], 3, 2.5), { fill: G.mitti, lw: 1.6 });
    }
    ctx3.fillStyle = G.chuna;
    ctx3.beginPath();
    ctx3.arc(-5, -68, 3.2, 0, TAU3);
    ctx3.arc(5, -68, 3.2, 0, TAU3);
    ctx3.fill();
    ctx3.fillStyle = G.soot;
    ctx3.beginPath();
    ctx3.arc(-5, -68, 1.6, 0, TAU3);
    ctx3.arc(5, -68, 1.6, 0, TAU3);
    ctx3.fill();
    ctx3.restore();
  }
  function threads(ctx3, x, base, s2) {
    const col = [G.geru, G.haldi, G.gulabi, G.chuna, G.kesar];
    for (let i = 0; i < 9; i++) {
      const y = base - (40 + i * 13) * s2;
      ctx3.strokeStyle = col[i % col.length];
      ctx3.lineWidth = 3.4 * s2;
      ctx3.beginPath();
      ctx3.ellipse(x, y, (42 - i * 0.9) * s2, 8 * s2, 0, 0, TAU3);
      ctx3.stroke();
      ctx3.lineWidth = 2.2 * s2;
      for (const d of [-1, 1]) {
        ctx3.beginPath();
        ctx3.moveTo(x + d * (38 - i * 0.8) * s2, y + 5 * s2);
        ctx3.quadraticCurveTo(x + d * (46 - i * 0.8) * s2, y + 18 * s2, x + d * (36 - i * 0.8) * s2, y + 30 * s2);
        ctx3.stroke();
      }
    }
  }
  function openingFilm() {
    return [
      // ---- PICTURE ONE: the valley, and the tree at the middle of it --------
      {
        hold: 1.6,
        say: "There is a valley in the hills, and at the middle of it stands a banyan older than any village under it.",
        sayAt: 0.9,
        cue: () => {
          setMusicIntensity(0);
          setAmbientTheme(themeById("film-road"));
        },
        draw: (ctx3) => {
          ground(ctx3, "#2a1a22", "#4a2a1c");
          disc(ctx3, W * 0.8, 116, 50, {
            fill: G.haldi,
            mark: "dot",
            on: "rgba(150,60,20,0.45)",
            rows: 3,
            along: 26,
            ms: 2.4,
            rays: 20,
            spin: 0,
            rayCol: G.kesar,
            lw: 1.8
          });
          ridge(ctx3, 286, 40, 1.2, "#3a2418");
          ridge(ctx3, 356, 30, 3.7, "#2c1b13");
          ridge(ctx3, 424, 18, 6.1, "#241811");
          banyan(ctx3, W / 2, 486, 0.82, true, 0);
        }
      },
      // ---- PICTURE TWO: the women, and the threads --------------------------
      {
        hold: 1.6,
        say: "Every autumn the women walk up from the villages and tie their threads round it. It is a ritual for the longevity of their husbands.",
        sayAt: 0.9,
        cue: () => sfx.bell(),
        draw: (ctx3) => {
          ground(ctx3, "#241a16", "#4a3222", "crescent", "rgba(255,243,220,0.06)");
          ridge(ctx3, 392, 22, 3.7, "#2c1f16");
          banyan(ctx3, W / 2, 452, 0.94, true, 0);
          threads(ctx3, W / 2, 452, 0.94);
          const at = [[0.17, 1.3, 446], [0.3, 1.45, 452], [0.7, 1.45, 452], [0.83, 1.3, 446], [0.5, 1.2, 472]];
          const cloth = [G.geru, G.gulabi, G.haldi, G.patta, G.kesar];
          for (let i = 0; i < at.length; i++) {
            figure(ctx3, W * at[i][0], at[i][2], at[i][1], { cloth: cloth[i], braid: i % 2 });
          }
        }
      },
      // ---- PICTURE THREE: the keeper, the tree going out ---------------------
      {
        hold: 1.6,
        say: "Someone has always tended it. A keeper, chosen out of the villages, for as long as anyone can say.",
        sayAt: 0.9,
        cue: () => sfx.thud(),
        draw: (ctx3) => keeperShot(ctx3, false)
      },
      // ---- the same picture, and now there is a girl on the road -------------
      {
        hold: 1.6,
        say: "The one up there now is old, and the tree is going out. So they chose again. The girl on the road is Savi, and she has been sent up to keep it.",
        sayAt: 0.6,
        cue: () => {
          setMusicIntensity(0.5);
          sfx.boon();
        },
        beats: [{ at: 3.6, run: () => sfx.chime() }],
        draw: (ctx3) => keeperShot(ctx3, true)
      }
    ];
  }
  function keeperShot(ctx3, savi) {
    ground(ctx3, "#2a1a22", "#46281a");
    ridge(ctx3, 300, 34, 1.2, "#382317");
    ridge(ctx3, 388, 24, 3.7, "#2c1b13");
    banyan(ctx3, W * 0.64, 440, 0.82, false, 0);
    threads(ctx3, W * 0.64, 440, 0.82);
    ctx3.fillStyle = "rgba(255,150,60,0.2)";
    ctx3.beginPath();
    ctx3.ellipse(W * 0.44, 432, 74, 30, 0, 0, TAU3);
    ctx3.fill();
    blob(ctx3, W * 0.44, 426, 16, 21, 0, {
      fill: G.kesar,
      mark: "dot",
      on: "rgba(255,240,180,0.7)",
      rows: 2,
      along: 8,
      ms: 2,
      lw: 2
    });
    figure(ctx3, W * 0.33, 442, 1.8, { cloth: G.mitti, hair: "#ded6c6", stick: 1 });
    ctx3.fillStyle = "rgba(150,126,92,0.22)";
    ctx3.beginPath();
    ctx3.moveTo(W * 0.02, 520);
    ctx3.lineTo(W * 0.22, 520);
    ctx3.lineTo(W * 0.17, 404);
    ctx3.lineTo(W * 0.12, 404);
    ctx3.closePath();
    ctx3.fill();
    if (savi) figure(ctx3, W * 0.135, 486, 1.45, { cloth: G.geru, braid: 1 });
  }

  // savi/src/savi-assets.js
  var BASE = "ASSETS/";
  var cache = /* @__PURE__ */ new Map();
  function img(name) {
    if (!name) return null;
    let e = cache.get(name);
    if (e === void 0) {
      e = typeof Image === "undefined" ? null : new Image();
      if (e) {
        e.decoding = "async";
        e.addEventListener("load", () => {
          e.ok = e.naturalWidth > 0;
        });
        e.addEventListener("error", () => {
          e.bad = true;
        });
        e.src = `${BASE}${name}.webp`;
      }
      cache.set(name, e);
    }
    return e && e.ok ? e : null;
  }
  function preload(names) {
    for (const n of names) img(n);
  }
  function cover(ctx3, im, x, y, w, h) {
    const s = Math.max(w / im.naturalWidth, h / im.naturalHeight);
    const dw = im.naturalWidth * s, dh = im.naturalHeight * s;
    ctx3.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }
  var PORTRAITS = [
    "savitri-resolute",
    "savitri-grieving",
    "savitri-clever",
    "savitri-pleading",
    "savitri-joy",
    "satyavan-warm",
    "yama-proud",
    "yama-stern",
    "yama-caught",
    "yama-respect",
    "yama-approving",
    "narada-grave",
    "narada-wry",
    "keeper-weary",
    "keeper-speaking",
    "keeper-hopeful",
    "keeper-pleased",
    "keeper-moved"
  ];
  var MURALS = [
    "mural-choice",
    "mural-fall",
    "mural-pursuit",
    "mural-steps",
    "mural-boon",
    "mural-bloom"
  ];
  var DEFAULT_MOOD = {
    savitri: "resolute",
    satyavan: "warm",
    yama: "proud",
    narada: "grave",
    keeper: "speaking"
  };
  function keeperMood(count, total, ended) {
    if (ended) return "moved";
    if (count === 0) return "weary";
    if (count >= total) return "moved";
    return count === 1 ? "hopeful" : "pleased";
  }

  // savi/src/savi-shallows.js
  var TAU4 = Math.PI * 2;
  var COURSE = [
    [3e3, 2980],
    [3300, 2900],
    [3560, 2740],
    [3720, 2520],
    [3980, 2440],
    [4260, 2520],
    [4440, 2330],
    [4520, 2080],
    [4680, 1900],
    [4860, 1760],
    [4900, 1560],
    [4760, 1380],
    [4520, 1290]
  ];
  var WATER_W = 156;
  var WALL_W = 230;
  var MOUTH = 150;
  var SEG = [];
  var LEN = 0;
  for (let i = 1; i < COURSE.length; i++) {
    const a = COURSE[i - 1], b = COURSE[i];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    SEG.push({ a, dx: dx / len, dy: dy / len, len, s0: LEN });
    LEN += len;
  }
  var COURSE_LEN = LEN;
  function atRiver(s, v = 0) {
    s = Math.max(0, Math.min(LEN, s));
    let g = SEG[SEG.length - 1];
    for (const q of SEG) if (s <= q.s0 + q.len) {
      g = q;
      break;
    }
    const k = s - g.s0;
    return [g.a[0] + g.dx * k - g.dy * v, g.a[1] + g.dy * k + g.dx * v];
  }
  function riverAt(x, y) {
    let bs = 0, bd = 1e9;
    for (const g of SEG) {
      const k = Math.max(0, Math.min(g.len, (x - g.a[0]) * g.dx + (y - g.a[1]) * g.dy));
      const d = Math.hypot(x - (g.a[0] + g.dx * k), y - (g.a[1] + g.dy * k));
      if (d < bd) {
        bd = d;
        bs = g.s0 + k;
      }
    }
    return { s: bs, d: bd };
  }
  function widthAt(s) {
    let w = WATER_W;
    w += Math.max(0, 1 - Math.abs(s - 1590) / 280) * 152;
    w += Math.max(0, 1 - Math.abs(s - LEN) / 340) * 140;
    w -= Math.max(0, 1 - Math.abs(s - 2300) / 210) * 44;
    return w;
  }
  function inWall(x, y) {
    const r = riverAt(x, y);
    const w = widthAt(r.s);
    return r.d >= w && r.d < w + WALL_W && r.s > 30 && r.s < LEN - 30;
  }
  function inShallow(x, y) {
    const r = riverAt(x, y);
    return r.s < MOUTH || r.d > widthAt(r.s) - 28;
  }
  function P(s, v, r, kind, o = {}) {
    return {
      s0: s,
      v0: v,
      s,
      v,
      r,
      kind,
      amp: o.amp || 0,
      rate: o.rate || 0.5,
      phase: o.phase || 0,
      x: 0,
      y: 0,
      dx: 0,
      dy: 0,
      sink: 0,
      dip: 0,
      solid: kind === "stone"
    };
  }
  var PLATFORMS = [
    // THE MOUTH — four broad leaves up the middle, short hops.
    P(250, 0, 58, "leaf"),
    P(408, -48, 58, "leaf"),
    P(566, 42, 58, "leaf"),
    P(724, -30, 58, "leaf"),
    P(880, 0, 76, "stone"),
    // THE NARROWS — alternate banks, and two that swing across to meet her.
    P(1036, -76, 52, "leaf"),
    P(1180, 72, 52, "swing", { amp: 80, rate: 0.95 }),
    P(1318, -72, 52, "leaf"),
    P(1452, 68, 52, "swing", { amp: 80, rate: 0.95, phase: Math.PI }),
    // THE EDDY — three leaves turning round the whirl in the wide bowl.
    //
    // They orbit LOCKED TOGETHER at the same rate, so the gap between one and the
    // next never changes in a way she can wait out: whatever it is, it is what it
    // is, all the way round. It used to swing between 85 and 133, and 133 is past
    // a jump - so a third of the way round the whirl the next leaf was simply out
    // of reach with nothing to do about it but fall in. A tighter orbit and
    // broader leaves keep every step of it a hop at every phase.
    P(1590, 0, 60, "eddy", { amp: 100, rate: 0.7 }),
    P(1590, 0, 60, "eddy", { amp: 100, rate: 0.7, phase: TAU4 / 3 }),
    P(1590, 0, 60, "eddy", { amp: 100, rate: 0.7, phase: TAU4 * 2 / 3 }),
    // THE BOULDER OUT OF THE BOWL. It used to sit back at 1830, which left 138
    // of open water between it and the next leaf - the one gap in the whole
    // course that wanted a dash, and the only place she was ever asked for one.
    // Standing on it there was simply nothing in front of her that looked
    // jumpable, so it read as the end of the road rather than as a skill check.
    // Moved seventy up the river it is 68 off the eddy behind and 72 off the
    // leaf ahead: two cozy hops, and no dash anywhere in the level.
    P(1900, 0, 76, "stone"),
    P(2090, -44, 50, "leaf"),
    // THE RACE — narrow and quick, two ferries running the current.
    P(2270, 54, 54, "ferry", { amp: 118, rate: 0.85 }),
    P(2460, -50, 54, "leaf"),
    P(2630, 48, 54, "ferry", { amp: 114, rate: 0.85, phase: Math.PI }),
    P(2810, -40, 56, "leaf"),
    // THE LAST BEND — the gorge turns back on itself under the pool, and the
    // water is quick here, so it is one more swing and two hops to the shelf.
    P(2950, 56, 54, "swing", { amp: 80, rate: 0.95, phase: 1.1 }),
    P(3090, -46, 56, "leaf"),
    P(3230, 34, 58, "leaf")
  ];
  function placePlatforms(t) {
    for (const p of PLATFORMS) {
      const k = Math.sin(t * p.rate + p.phase);
      if (p.kind === "swing") p.v = p.v0 + p.amp * k;
      else if (p.kind === "ferry") p.s = p.s0 + p.amp * k;
      else if (p.kind === "eddy") {
        const a = t * p.rate + p.phase;
        p.s = p.s0 + Math.cos(a) * p.amp;
        p.v = Math.sin(a) * p.amp * 0.86;
      }
      const [x, y] = atRiver(p.s, p.v);
      p.dx = p.x ? x - p.x : 0;
      p.dy = p.y ? y - p.y : 0;
      p.x = x;
      p.y = y;
    }
  }
  placePlatforms(0);
  for (const p of PLATFORMS) {
    p.dx = 0;
    p.dy = 0;
  }
  var ROOT_AT = atRiver(COURSE_LEN - 170, 0);
  var capAt = atRiver(COURSE_LEN - 40, 196);
  var CAPSTAN = {
    x: capAt[0],
    y: capAt[1],
    r: 54,
    turns: 0,
    need: 3,
    wound: 0,
    // WHERE THE BAR IS, as against how far it has been WOUND.
    //
    // `wound` is the work done and it drives the gate; it cannot be touched to
    // make a picture look right. But she takes hold of the bar wherever she
    // happens to be standing, and the bar was pointing somewhere else - so the
    // drawn arm carries an offset that puts a grip under her hands the moment
    // she starts pushing, eased in so it does not snap a half-turn.
    lag: 0,
    lagTo: 0,
    gripping: false
  };
  function capstanArms() {
    const b = CAPSTAN.wound + CAPSTAN.lag;
    return [0, Math.PI].map((k) => [
      CAPSTAN.x + Math.cos(b + k) * 48,
      CAPSTAN.y + Math.sin(b + k) * 29 - 20
    ]);
  }
  function capstanGrip(x, y) {
    const arms = capstanArms();
    return Math.hypot(x - arms[0][0], y - arms[0][1]) <= Math.hypot(x - arms[1][0], y - arms[1][1]) ? arms[0] : arms[1];
  }
  function easeCapstan(dt) {
    let d = CAPSTAN.lagTo - CAPSTAN.lag;
    while (d > Math.PI) d -= TAU4;
    while (d < -Math.PI) d += TAU4;
    CAPSTAN.lag += d * Math.min(1, dt * 9);
  }
  var gateAt = atRiver(COURSE_LEN, 0);
  var GATE = { x: gateAt[0], y: gateAt[1] - 30, w: 28, h: 100 };
  function onSolid(x, y) {
    for (const p of PLATFORMS) {
      if (p.solid && Math.hypot(x - p.x, y - p.y) < p.r) return p;
    }
    if (Math.hypot(x - CAPSTAN.x, y - CAPSTAN.y) < 118) return CAPSTAN;
    return null;
  }
  function leafAt(x, y) {
    for (const p of PLATFORMS) {
      if (p.solid || p.sink >= 1) continue;
      if (Math.hypot(x - p.x, y - (p.y + p.dip)) < p.r * 0.96) return p;
    }
    return null;
  }
  function stepShallows(dt, t, standing) {
    placePlatforms(t);
    for (const p of PLATFORMS) {
      if (p.solid) continue;
      const rate = p.kind === "leaf" || p.kind === "swing" ? 0.13 : 0.04;
      if (p === standing) p.sink = Math.min(1, p.sink + dt * rate);
      else p.sink = Math.max(0, p.sink - dt * 0.8);
      p.dip = p.sink * 6 + Math.sin(t * 1.2 + p.phase) * 0.9;
    }
  }
  var lastAngle = null;
  function windCapstan(x, y, moving) {
    const d = Math.hypot(x - CAPSTAN.x, y - CAPSTAN.y);
    if (d > CAPSTAN.r + 34 || d < 12 || !moving) {
      lastAngle = null;
      CAPSTAN.gripping = false;
      return false;
    }
    const a = Math.atan2(y - CAPSTAN.y, x - CAPSTAN.x);
    if (lastAngle === null) {
      lastAngle = a;
      let g = a - CAPSTAN.wound;
      while (g > Math.PI) g -= TAU4;
      while (g < -Math.PI) g += TAU4;
      if (g > Math.PI / 2) g -= Math.PI;
      if (g < -Math.PI / 2) g += Math.PI;
      CAPSTAN.lagTo = g;
      return false;
    }
    let da = a - lastAngle;
    while (da > Math.PI) da -= TAU4;
    while (da < -Math.PI) da += TAU4;
    lastAngle = a;
    if (Math.abs(da) > 0.6) {
      CAPSTAN.gripping = false;
      return false;
    }
    CAPSTAN.gripping = true;
    const full = CAPSTAN.need * TAU4;
    const before = CAPSTAN.wound;
    CAPSTAN.wound = Math.max(0, Math.min(full, CAPSTAN.wound + da));
    CAPSTAN.turns = CAPSTAN.wound / TAU4;
    return before < full && CAPSTAN.wound >= full;
  }
  var gateOpen = () => CAPSTAN.wound >= CAPSTAN.need * TAU4;
  var gateLift = () => CAPSTAN.wound / (CAPSTAN.need * TAU4);
  var MOUTH_AT = atRiver(40, 0);
  var inGorge = (x, y) => {
    const r = riverAt(x, y);
    return r.d < widthAt(r.s) + WALL_W * 0.6;
  };
  function drawCliffs(ctx3, t, cam, view2) {
    const S0 = 130;
    for (const side of [-1, 1]) {
      const lip = [];
      for (let s2 = S0; s2 <= COURSE_LEN - 40; s2 += 30) lip.push(atRiver(s2, side * widthAt(s2)));
      if (lip.length < 2) continue;
      const out = [];
      for (let i = 0; i < lip.length; i++) {
        const s2 = S0 + i * 30;
        out.push(atRiver(s2, side * (widthAt(s2) + WALL_W)));
      }
      let seen = false;
      for (const p of lip) {
        if (p[0] > cam.x - 240 && p[0] < cam.x + view2.w + 240 && p[1] > cam.y - 240 && p[1] < cam.y + view2.h + 240) {
          seen = true;
          break;
        }
      }
      if (!seen) continue;
      ctx3.save();
      ctx3.beginPath();
      ctx3.moveTo(lip[0][0], lip[0][1]);
      for (const p of lip) ctx3.lineTo(p[0], p[1]);
      ctx3.strokeStyle = "rgba(6,14,22,0.42)";
      ctx3.lineWidth = 34;
      ctx3.lineJoin = "round";
      ctx3.lineCap = "round";
      ctx3.translate(side * -10, -8);
      ctx3.stroke();
      ctx3.restore();
      ctx3.beginPath();
      ctx3.moveTo(lip[0][0], lip[0][1]);
      for (const p of lip) ctx3.lineTo(p[0], p[1]);
      for (let i = out.length - 1; i >= 0; i--) ctx3.lineTo(out[i][0], out[i][1]);
      ctx3.closePath();
      const g = ctx3.createLinearGradient(0, -200, 0, 200);
      g.addColorStop(0, "#3a3630");
      g.addColorStop(1, "#22201c");
      ctx3.fillStyle = g;
      ctx3.fill();
      ctx3.save();
      ctx3.clip();
      ctx3.strokeStyle = "rgba(12,10,8,0.5)";
      ctx3.lineWidth = 2;
      for (let i = 0; i < lip.length; i += 2) {
        const a = lip[i], b = out[i];
        ctx3.beginPath();
        ctx3.moveTo(a[0], a[1]);
        ctx3.lineTo(a[0] + (b[0] - a[0]) * (0.5 + i * 7 % 5 * 0.09), a[1] + (b[1] - a[1]) * (0.55 + i * 3 % 4 * 0.1));
        ctx3.stroke();
      }
      ctx3.restore();
      ctx3.beginPath();
      ctx3.moveTo(lip[0][0], lip[0][1]);
      for (const p of lip) ctx3.lineTo(p[0], p[1]);
      ctx3.strokeStyle = "#8b8377";
      ctx3.lineWidth = 7;
      ctx3.lineJoin = "round";
      ctx3.stroke();
      ctx3.strokeStyle = "rgba(214,206,186,0.55)";
      ctx3.lineWidth = 2.6;
      ctx3.stroke();
      for (let i = 0; i < lip.length; i += 3) {
        const s2 = S0 + i * 30;
        const p = atRiver(s2, side * (widthAt(s2) + 22 + i * 11 % 5 * 9));
        if (p[0] < cam.x - 80 || p[0] > cam.x + view2.w + 80) continue;
        const r = 9 + i * 13 % 7 * 3;
        ctx3.fillStyle = "rgba(0,0,0,0.3)";
        ctx3.beginPath();
        ctx3.ellipse(p[0] + 4, p[1] + 5, r, r * 0.6, 0, 0, TAU4);
        ctx3.fill();
        ctx3.fillStyle = i % 3 ? "#6e675c" : "#7d7568";
        ctx3.beginPath();
        ctx3.ellipse(p[0], p[1], r, r * 0.72, i, 0, TAU4);
        ctx3.fill();
        ctx3.fillStyle = "rgba(222,214,196,0.28)";
        ctx3.beginPath();
        ctx3.ellipse(p[0] - r * 0.3, p[1] - r * 0.3, r * 0.42, r * 0.26, i, 0, TAU4);
        ctx3.fill();
      }
    }
    const m = atRiver(70, 0);
    ctx3.save();
    ctx3.strokeStyle = "rgba(150,132,104,0.5)";
    ctx3.lineWidth = 46;
    ctx3.lineCap = "round";
    ctx3.setLineDash([26, 20]);
    ctx3.beginPath();
    const back2 = atRiver(0, 0);
    ctx3.moveTo(back2[0] - 120, back2[1] + 90);
    ctx3.lineTo(m[0], m[1]);
    ctx3.stroke();
    ctx3.setLineDash([]);
    ctx3.restore();
    for (const side of [-1, 1]) {
      const p = atRiver(60, side * (widthAt(60) + 30));
      ctx3.fillStyle = "rgba(0,0,0,0.3)";
      ctx3.beginPath();
      ctx3.ellipse(p[0] + 4, p[1] + 6, 13, 7, 0, 0, TAU4);
      ctx3.fill();
      ctx3.fillStyle = "#7b6a52";
      ctx3.fillRect(p[0] - 7, p[1] - 54, 14, 56);
      ctx3.fillStyle = "#96836a";
      ctx3.fillRect(p[0] - 7, p[1] - 54, 5, 56);
      ctx3.fillStyle = "#5f5340";
      for (let i = 0; i < 3; i++) ctx3.fillRect(p[0] - 9, p[1] - 46 + i * 16, 18, 4);
    }
  }
  function drawCurrent(ctx3, t, drained2, cam, view2) {
    if (drained2) return;
    ctx3.save();
    ctx3.strokeStyle = "rgba(180,214,228,0.15)";
    ctx3.lineWidth = 2;
    for (let i = 0; i < 110; i++) {
      const s = (i * 149 + t * 44) % COURSE_LEN;
      const w = widthAt(s);
      const v = (i * 61 % 200 - 100) * (w / WATER_W) * 0.86;
      const [x, y] = atRiver(s, v);
      if (x < cam.x - 40 || x > cam.x + view2.w + 40 || y < cam.y - 40 || y > cam.y + view2.h + 40) continue;
      const [x2, y2] = atRiver(s + 26, v);
      ctx3.beginPath();
      ctx3.moveTo(x, y);
      ctx3.lineTo(x2, y2);
      ctx3.stroke();
    }
    ctx3.restore();
  }
  function drawRootBed(ctx3, t, drained2) {
    ctx3.save();
    if (!drained2) {
      ctx3.globalAlpha = 0.15;
      ctx3.strokeStyle = "#1e2a2c";
      ctx3.lineWidth = 56;
      ctx3.filter = "blur(7px)";
    } else {
      ctx3.globalAlpha = 0.95;
      ctx3.strokeStyle = "#7a5533";
      ctx3.lineWidth = 46;
    }
    ctx3.lineCap = "round";
    ctx3.lineJoin = "round";
    ctx3.beginPath();
    for (let s = 40; s <= COURSE_LEN - 40; s += 60) {
      const [x, y] = atRiver(s, Math.sin(s * 4e-3) * 42);
      if (s === 40) ctx3.moveTo(x, y);
      else ctx3.lineTo(x, y);
    }
    ctx3.stroke();
    ctx3.filter = "none";
    if (drained2) {
      ctx3.globalAlpha = 0.5;
      ctx3.strokeStyle = "rgba(255,196,130,0.6)";
      ctx3.lineWidth = 6;
      ctx3.stroke();
    }
    ctx3.restore();
  }
  function leafFace(ctx3, p, t, drained2) {
    const y = p.y + p.dip;
    ctx3.fillStyle = `rgba(8,22,34,${0.26 + p.sink * 0.24})`;
    ctx3.beginPath();
    ctx3.ellipse(p.x + 3, y + 6, p.r * 0.98, p.r * 0.5, 0, 0, TAU4);
    ctx3.fill();
    ctx3.save();
    ctx3.translate(p.x, y);
    ctx3.rotate(Math.sin(t * 0.8 + p.phase) * 0.06);
    const g = ctx3.createLinearGradient(-p.r, 0, p.r, 0);
    g.addColorStop(0, p.sink > 0.5 ? "#4a5c33" : "#a8761f");
    g.addColorStop(0.5, p.sink > 0.5 ? "#5d7340" : "#c9903a");
    g.addColorStop(1, "#8a5f22");
    ctx3.fillStyle = g;
    ctx3.beginPath();
    ctx3.ellipse(0, 0, p.r, p.r * 0.62, 0, 0, TAU4);
    ctx3.fill();
    ctx3.strokeStyle = "rgba(58,40,16,0.6)";
    ctx3.lineWidth = p.kind === "leaf" ? 1.8 : 2.6;
    ctx3.stroke();
    ctx3.strokeStyle = "rgba(86,60,22,0.5)";
    ctx3.lineWidth = 2.2;
    ctx3.beginPath();
    ctx3.moveTo(-p.r * 0.82, 0);
    ctx3.lineTo(p.r * 0.82, 0);
    ctx3.stroke();
    ctx3.lineWidth = 1.1;
    for (let i = -3; i <= 3; i++) {
      if (!i) continue;
      const vx = i * p.r * 0.22;
      ctx3.beginPath();
      ctx3.moveTo(vx, 0);
      ctx3.lineTo(vx + p.r * 0.12, -p.r * 0.46);
      ctx3.moveTo(vx, 0);
      ctx3.lineTo(vx + p.r * 0.12, p.r * 0.46);
      ctx3.stroke();
    }
    ctx3.fillStyle = drained2 ? "rgba(60,52,36,0.5)" : "rgba(10,24,38,0.5)";
    ctx3.beginPath();
    ctx3.moveTo(-p.r, 0);
    ctx3.lineTo(-p.r * 0.5, -p.r * 0.15);
    ctx3.lineTo(-p.r * 0.5, p.r * 0.15);
    ctx3.closePath();
    ctx3.fill();
    ctx3.restore();
  }
  function drawPlatforms(ctx3, t, drained2) {
    for (const p of PLATFORMS) {
      if (p.solid) {
        ctx3.fillStyle = "rgba(0,0,0,0.3)";
        ctx3.beginPath();
        ctx3.ellipse(p.x + 6, p.y + 9, p.r * 1.02, p.r * 0.6, 0, 0, TAU4);
        ctx3.fill();
        ctx3.fillStyle = "#6a6358";
        ctx3.beginPath();
        ctx3.ellipse(p.x, p.y, p.r, p.r * 0.78, 0, 0, TAU4);
        ctx3.fill();
        ctx3.fillStyle = "#7b7365";
        ctx3.beginPath();
        ctx3.ellipse(p.x - 8, p.y - 10, p.r * 0.8, p.r * 0.58, 0, 0, TAU4);
        ctx3.fill();
        ctx3.fillStyle = "#55604a";
        ctx3.beginPath();
        ctx3.ellipse(p.x - 18, p.y - 20, p.r * 0.44, p.r * 0.3, 0.3, 0, TAU4);
        ctx3.fill();
        continue;
      }
      if (!drained2 && p.kind !== "leaf") {
        ctx3.strokeStyle = p.kind === "ferry" ? "rgba(190,224,232,0.42)" : "rgba(228,198,150,0.38)";
        ctx3.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          const r = p.r * (1.2 + i * 0.2), ph = t * 0.7 + i * 1.1;
          ctx3.beginPath();
          ctx3.ellipse(p.x, p.y + p.dip, r, r * 0.5, 0, ph, ph + 1.8);
          ctx3.stroke();
        }
      }
      leafFace(ctx3, p, t, drained2);
      if (p.sink > 0.45) {
        ctx3.strokeStyle = `rgba(190,224,232,${(p.sink - 0.45) * 0.8})`;
        ctx3.lineWidth = 2;
        const k = 1 + (p.sink - 0.45) * 0.5;
        ctx3.beginPath();
        ctx3.ellipse(p.x, p.y + p.dip, p.r * k, p.r * 0.52 * k, 0, 0, TAU4);
        ctx3.stroke();
      }
    }
  }
  function drawSluice(ctx3, t, drained2) {
    const lift = gateLift();
    ctx3.fillStyle = "rgba(0,0,0,0.3)";
    ctx3.beginPath();
    ctx3.ellipse(CAPSTAN.x + 7, CAPSTAN.y + 10, 126, 82, 0, 0, TAU4);
    ctx3.fill();
    ctx3.fillStyle = "#6a6358";
    ctx3.beginPath();
    ctx3.ellipse(CAPSTAN.x, CAPSTAN.y, 120, 78, 0, 0, TAU4);
    ctx3.fill();
    ctx3.fillStyle = "#7b7365";
    ctx3.beginPath();
    ctx3.ellipse(CAPSTAN.x - 12, CAPSTAN.y - 14, 98, 60, 0, 0, TAU4);
    ctx3.fill();
    for (const sgn of [-1, 1]) {
      ctx3.fillStyle = "#8a8172";
      ctx3.fillRect(GATE.x - 12, GATE.y + sgn * 64 - 18, 60, 36);
      ctx3.fillStyle = "#6d6558";
      ctx3.fillRect(GATE.x - 12, GATE.y + sgn * 64 + 10, 60, 8);
    }
    const up = lift * (GATE.h - 14);
    ctx3.fillStyle = "#3c3a32";
    ctx3.fillRect(GATE.x - 4, GATE.y - GATE.h / 2 - up, GATE.w, GATE.h);
    ctx3.strokeStyle = "#26241f";
    ctx3.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const yy = GATE.y - GATE.h / 2 - up + 14 + i * 22;
      ctx3.beginPath();
      ctx3.moveTo(GATE.x - 4, yy);
      ctx3.lineTo(GATE.x + GATE.w - 4, yy);
      ctx3.stroke();
    }
    if (lift > 0.02) {
      ctx3.strokeStyle = `rgba(178,214,226,${0.2 + lift * 0.5})`;
      ctx3.lineWidth = 2.6;
      for (let i = 0; i < 5; i++) {
        const yy = GATE.y + 28 - i * 14;
        ctx3.beginPath();
        ctx3.moveTo(GATE.x + GATE.w - 4, yy);
        ctx3.quadraticCurveTo(GATE.x + 36, yy + Math.sin(t * 4 + i) * 4, GATE.x + 70 + lift * 30, yy + 10);
        ctx3.stroke();
      }
    }
    const C = CAPSTAN;
    {
      const gx = GATE.x + GATE.w / 2;
      const gy = GATE.y - GATE.h / 2 - lift * (GATE.h - 14);
      const sag = (1 - lift) * 30;
      const mx = (C.x + gx) / 2, my = (C.y + gy) / 2 + sag;
      ctx3.strokeStyle = "#413b33";
      ctx3.lineWidth = 6;
      ctx3.beginPath();
      ctx3.moveTo(C.x, C.y - 12);
      ctx3.quadraticCurveTo(mx, my, gx, gy);
      ctx3.stroke();
      const n = 16;
      for (let i = 0; i < n; i++) {
        const u = (i + C.wound * 0.6 % 1) / n;
        const ax = C.x + (mx - C.x) * u, ay = C.y - 12 + (my - (C.y - 12)) * u;
        const bx = mx + (gx - mx) * u, by = my + (gy - my) * u;
        const x = ax + (bx - ax) * u, y = ay + (by - ay) * u;
        ctx3.fillStyle = i % 2 ? "#9a8e7c" : "#6a6154";
        ctx3.beginPath();
        ctx3.ellipse(x, y, 4.6, 3.2, 0, 0, TAU4);
        ctx3.fill();
      }
    }
    if (!gateOpen()) {
      const spin = t * 1.1;
      ctx3.strokeStyle = "rgba(255,214,150,0.2)";
      ctx3.lineWidth = 13;
      ctx3.beginPath();
      ctx3.ellipse(C.x, C.y, C.r, C.r * 0.62, 0, 0, TAU4);
      ctx3.stroke();
      for (let i = 0; i < 10; i++) {
        const a2 = i / 10 * TAU4;
        const k = (Math.sin(spin - a2) + 1) / 2;
        ctx3.fillStyle = `rgba(255,226,182,${0.1 + k * 0.5})`;
        ctx3.save();
        ctx3.translate(C.x + Math.cos(a2) * C.r, C.y + Math.sin(a2) * C.r * 0.62);
        ctx3.rotate(a2 + Math.PI / 2);
        ctx3.beginPath();
        ctx3.ellipse(0, 0, 4.4, 7.2, 0, 0, TAU4);
        ctx3.fill();
        ctx3.restore();
      }
      for (let h = 0; h < 2; h++) {
        const a2 = spin + h * Math.PI;
        ctx3.save();
        ctx3.translate(C.x + Math.cos(a2) * C.r, C.y + Math.sin(a2) * C.r * 0.62);
        ctx3.rotate(Math.atan2(Math.cos(a2) * 0.62, -Math.sin(a2)));
        ctx3.fillStyle = "rgba(255,200,120,0.95)";
        ctx3.beginPath();
        ctx3.moveTo(13, 0);
        ctx3.lineTo(-7, 7);
        ctx3.lineTo(-3, 0);
        ctx3.lineTo(-7, -7);
        ctx3.closePath();
        ctx3.fill();
        ctx3.strokeStyle = "rgba(50,30,12,0.75)";
        ctx3.lineWidth = 1.4;
        ctx3.stroke();
        ctx3.restore();
      }
      ctx3.strokeStyle = "rgba(255,196,120,0.92)";
      ctx3.lineWidth = 7;
      ctx3.lineCap = "round";
      ctx3.beginPath();
      ctx3.ellipse(C.x, C.y, C.r, C.r * 0.62, 0, -Math.PI / 2, -Math.PI / 2 + TAU4 * lift);
      ctx3.stroke();
      ctx3.lineCap = "butt";
    }
    ctx3.fillStyle = "rgba(0,0,0,0.3)";
    ctx3.beginPath();
    ctx3.ellipse(C.x + 5, C.y + 8, 30, 16, 0, 0, TAU4);
    ctx3.fill();
    ctx3.save();
    ctx3.translate(C.x, C.y);
    const idle = gateOpen() ? 0 : Math.sin(t * 1.5) * 0.035;
    ctx3.strokeStyle = "#5f5340";
    ctx3.lineWidth = 11;
    ctx3.lineCap = "round";
    ctx3.beginPath();
    ctx3.moveTo(0, -6);
    ctx3.lineTo(0, -20);
    ctx3.stroke();
    ctx3.strokeStyle = "#7b6a52";
    ctx3.lineWidth = 6;
    ctx3.beginPath();
    ctx3.moveTo(-1, -7);
    ctx3.lineTo(-1, -20);
    ctx3.stroke();
    for (const k of [0, 1]) {
      const b = C.wound + C.lag + idle + k * Math.PI;
      const ex = Math.cos(b) * 66, ey = Math.sin(b) * 40;
      const hx = Math.cos(b) * 48, hy = Math.sin(b) * 29;
      ctx3.strokeStyle = "#6b5c46";
      ctx3.lineWidth = 10;
      ctx3.lineCap = "round";
      ctx3.beginPath();
      ctx3.moveTo(0, -18);
      ctx3.lineTo(ex, ey - 18);
      ctx3.stroke();
      ctx3.strokeStyle = "#8a7859";
      ctx3.lineWidth = 5;
      ctx3.beginPath();
      ctx3.moveTo(0, -20);
      ctx3.lineTo(ex, ey - 20);
      ctx3.stroke();
      ctx3.strokeStyle = "#4a4033";
      ctx3.lineWidth = 1.2;
      ctx3.beginPath();
      ctx3.ellipse(ex, ey - 20, 4.2, 3.4, 0, 0, TAU4);
      ctx3.stroke();
      ctx3.fillStyle = "#b3a189";
      ctx3.beginPath();
      ctx3.ellipse(hx, hy - 20, 7, 5.4, 0, 0, TAU4);
      ctx3.fill();
      ctx3.strokeStyle = "#4a4033";
      ctx3.lineWidth = 1.4;
      ctx3.beginPath();
      ctx3.ellipse(hx, hy - 20, 7, 5.4, 0, 0, TAU4);
      ctx3.stroke();
    }
    ctx3.lineCap = "butt";
    ctx3.fillStyle = "#5f5340";
    ctx3.beginPath();
    ctx3.ellipse(0, 0, 17, 13, 0, 0, TAU4);
    ctx3.fill();
    ctx3.fillStyle = "#7b6a52";
    ctx3.beginPath();
    ctx3.ellipse(0, -7, 17, 13, 0, 0, TAU4);
    ctx3.fill();
    ctx3.strokeStyle = "#8d8272";
    ctx3.lineWidth = 1.5;
    for (let i = 0; i < 3 + Math.round(lift * 5); i++) {
      ctx3.beginPath();
      ctx3.ellipse(0, -7 + i * 1.3, 15 - i * 0.6, 11 - i * 0.45, 0, 0, TAU4);
      ctx3.stroke();
    }
    ctx3.strokeStyle = "#4a4033";
    ctx3.lineWidth = 2;
    ctx3.beginPath();
    ctx3.ellipse(0, -7, 17, 13, 0, 0, TAU4);
    ctx3.stroke();
    ctx3.restore();
  }

  // savi/src/savi-litter.js
  var TAU5 = Math.PI * 2;
  var FCELL = 22;
  var MAXD = 13;
  var HOLD = 3.6;
  var F = { w: 0, h: 0, dx: null, dy: null, sp: null };
  function initLitter(W3, H3) {
    F.w = Math.ceil(W3 / FCELL) + 1;
    F.h = Math.ceil(H3 / FCELL) + 1;
    F.dx = new Float32Array(F.w * F.h);
    F.dy = new Float32Array(F.w * F.h);
    F.sp = new Float32Array(F.w * F.h);
  }
  function pushLitter(x, y, r, dirx, diry, power) {
    if (!F.dx) return;
    const i0 = Math.max(0, (x - r) / FCELL | 0), i1 = Math.min(F.w - 1, (x + r) / FCELL | 0);
    const j0 = Math.max(0, (y - r) / FCELL | 0), j1 = Math.min(F.h - 1, (y + r) / FCELL | 0);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const cx = i * FCELL, cy = j * FCELL;
        const ox = cx - x, oy = cy - y;
        const d = Math.hypot(ox, oy);
        if (d > r) continue;
        const f = 1 - d / r;
        const push = power * f * f;
        const nx = d > 0.01 ? ox / d : 0, ny = d > 0.01 ? oy / d : 0;
        const q = j * F.w + i;
        F.dx[q] += nx * push + dirx * push * 0.3;
        F.dy[q] += ny * push + diry * push * 0.3;
        F.sp[q] += (nx * diry - ny * dirx) * push * 0.05;
        const m = Math.hypot(F.dx[q], F.dy[q]);
        if (m > MAXD) {
          F.dx[q] *= MAXD / m;
          F.dy[q] *= MAXD / m;
        }
        if (F.sp[q] > 1.2) F.sp[q] = 1.2;
        if (F.sp[q] < -1.2) F.sp[q] = -1.2;
      }
    }
  }
  var row = 0;
  function settleLitter(dt) {
    if (!F.dx) return;
    const band2 = 40;
    const k = Math.min(1, 2.2 * dt * (F.h / band2));
    for (let n = 0; n < band2; n++) {
      const j = (row + n) % F.h;
      for (let i = 0; i < F.w; i++) {
        const q = j * F.w + i;
        const m = Math.hypot(F.dx[q], F.dy[q]);
        if (m < 0.01) continue;
        if (m > HOLD) {
          const want = HOLD + (m - HOLD) * (1 - k);
          F.dx[q] *= want / m;
          F.dy[q] *= want / m;
        }
      }
    }
    row = (row + band2) % F.h;
  }
  function litterAt(x, y, out) {
    if (!F.dx) {
      out.dx = 0;
      out.dy = 0;
      out.sp = 0;
      return out;
    }
    const gx = x / FCELL, gy = y / FCELL;
    let i = gx | 0, j = gy | 0;
    if (i < 0 || j < 0 || i >= F.w - 1 || j >= F.h - 1) {
      out.dx = 0;
      out.dy = 0;
      out.sp = 0;
      return out;
    }
    const fx2 = gx - i, fy = gy - j;
    const a = j * F.w + i, b = a + 1, c = a + F.w, d = c + 1;
    const w0 = (1 - fx2) * (1 - fy), w1 = fx2 * (1 - fy), w2 = (1 - fx2) * fy, w3 = fx2 * fy;
    out.dx = F.dx[a] * w0 + F.dx[b] * w1 + F.dx[c] * w2 + F.dx[d] * w3;
    out.dy = F.dy[a] * w0 + F.dy[b] * w1 + F.dy[c] * w2 + F.dy[d] * w3;
    out.sp = F.sp[a] * w0 + F.sp[b] * w1 + F.sp[c] * w2 + F.sp[d] * w3;
    return out;
  }
  var WIND = { x: 0.82, y: 0.58 };
  function breezeAt(t, x, y) {
    const phase = t * 1.15 - (x * WIND.x + y * WIND.y) * 4e-3;
    const gust = 0.55 + 0.45 * Math.sin(t * 0.21 + x * 4e-4);
    return Math.sin(phase) * 0.07 * gust;
  }
  function drawLeafSprite(ctx3, s, k) {
    const edge = Math.abs(Math.sin(k));
    ctx3.beginPath();
    ctx3.ellipse(0, 0, s, s * (0.12 + 0.46 * edge), 0, 0, TAU5);
    ctx3.fill();
    if (edge > 0.35) {
      ctx3.globalAlpha *= 0.5;
      ctx3.beginPath();
      ctx3.moveTo(-s * 0.8, 0);
      ctx3.lineTo(s * 0.8, 0);
      ctx3.lineWidth = 0.9;
      ctx3.strokeStyle = "#6b3f16";
      ctx3.stroke();
      ctx3.globalAlpha /= 0.5;
    }
  }
  function drawFallingLeaves(ctx3, t, camera2, view2, n, cols) {
    const spanX = view2.w + 340, spanY = view2.h + 340;
    const x0 = camera2.x - 170, y0 = camera2.y - 170;
    for (let i = 0; i < n; i++) {
      const sp = 0.4 + i * 37 % 13 / 13;
      const px = i * 613.7 + t * 26 * sp;
      const py = i * 971.3 + t * 19 * sp;
      const k = t * (1.7 + sp) + i;
      const sway = Math.sin(k * 0.55) * 13;
      const x = x0 + ((px + sway - x0) % spanX + spanX) % spanX;
      const y = y0 + ((py - y0) % spanY + spanY) % spanY;
      ctx3.globalAlpha = 0.5 + 0.22 * Math.abs(Math.sin(k));
      ctx3.fillStyle = cols[i & 3];
      ctx3.save();
      ctx3.translate(x, y);
      ctx3.rotate(Math.atan2(19 * sp, 26 * sp) + Math.sin(k * 0.55) * 0.7);
      drawLeafSprite(ctx3, 5.2, k);
      ctx3.restore();
    }
    ctx3.globalAlpha = 1;
  }

  // savi/src/savi-art.js
  var TAU6 = Math.PI * 2;
  var clamp012 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  var mix2 = (a, b, k) => a + (b - a) * k;
  var rnd = (i) => {
    const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  var NEW_LEAF = ["#2f6b2c", "#387a33", "#4d9a3a", "#63b148"];
  var PROPS = [];
  var LIMBS = [];
  var CURTAIN = [];
  function banyanBones(T) {
    if (LIMBS.length) return;
    for (let i = 0; i < 9; i++) {
      const a0 = i / 9 * TAU6 + 0.35;
      const reach = 210 + rnd(i * 5) * 190;
      LIMBS.push({
        a: a0,
        reach,
        x1: T.x + Math.cos(a0) * reach,
        y1: T.y - 96 + Math.sin(a0) * reach * 0.58,
        mx: T.x + Math.cos(a0) * reach * 0.5,
        my: T.y - 132 + Math.sin(a0) * reach * 0.26,
        w: 24 - i % 3 * 5
      });
    }
    for (let i = 0; i < 96; i++) {
      const L = LIMBS[i % LIMBS.length];
      const k = 0.22 + rnd(i * 3) * 0.78;
      const x = T.x + (L.x1 - T.x) * k + (rnd(i * 7) - 0.5) * 34;
      const y = T.y - 96 + (L.y1 - (T.y - 96)) * k + (rnd(i * 11) - 0.5) * 22;
      const ground2 = T.y + 30 + Math.sin(i) * 26;
      const full = rnd(i * 13) < 0.24;
      CURTAIN.push({
        x,
        y,
        len: full ? ground2 - y : 40 + rnd(i * 17) * 190,
        w: full ? 5 + rnd(i * 19) * 9 : 1.4 + rnd(i * 23) * 3.2,
        full,
        seed: i,
        front: y > T.y - 130
        // hangs in front of her, or behind
      });
    }
    for (let i = 0; i < 22; i++) {
      const a0 = rnd(i) * Math.PI + 0.05;
      const r = 110 + rnd(i * 3) * 250;
      PROPS.push({
        x: T.x + Math.cos(a0) * r,
        y: T.y + 30 + Math.sin(a0) * r * 0.6,
        w: 9 + rnd(i * 5) * 21,
        h: 58 + rnd(i * 7) * 70,
        lean: (rnd(i * 11) - 0.5) * 0.28,
        seed: i
      });
    }
    PROPS.sort((p, q) => p.y - q.y);
  }
  function strand(ctx3, c, time, col) {
    const sway = Math.sin(time * 0.7 + c.seed) * (c.full ? 1.4 : 4 + c.len * 0.03);
    ctx3.strokeStyle = col;
    ctx3.lineWidth = c.w;
    ctx3.lineCap = "round";
    ctx3.beginPath();
    ctx3.moveTo(c.x, c.y);
    ctx3.quadraticCurveTo(c.x + sway * 0.4, c.y + c.len * 0.55, c.x + sway, c.y + c.len);
    ctx3.stroke();
    if (!c.full) {
      ctx3.fillStyle = col;
      ctx3.beginPath();
      ctx3.arc(c.x + sway, c.y + c.len, c.w * 0.85, 0, TAU6);
      ctx3.fill();
    }
  }
  function drawBanyan(ctx3, T, bloom, time) {
    banyanBones(T);
    const bark = mixHex("#38281e", "#5e4430", bloom * 0.8);
    const lit = mixHex("#4a3627", "#8a6442", bloom * 0.8);
    ctx3.fillStyle = "rgba(0,0,0,0.3)";
    ctx3.beginPath();
    ctx3.ellipse(T.x + 16, T.y + 56, 350, 218, 0, 0, TAU6);
    ctx3.fill();
    for (let i = 0; i < 18; i++) {
      const a0 = i / 18 * TAU6 + 0.2;
      const r = 150 + rnd(i * 13) * 220;
      ctx3.strokeStyle = bark;
      ctx3.lineWidth = 11 + rnd(i) * 21;
      ctx3.lineCap = "round";
      ctx3.beginPath();
      ctx3.moveTo(T.x, T.y + 20);
      ctx3.quadraticCurveTo(
        T.x + Math.cos(a0) * r * 0.55,
        T.y + 20 + Math.sin(a0) * r * 0.4,
        T.x + Math.cos(a0) * r,
        T.y + 24 + Math.sin(a0) * r * 0.66
      );
      ctx3.stroke();
    }
    for (const L of LIMBS) {
      ctx3.strokeStyle = bark;
      ctx3.lineWidth = L.w;
      ctx3.lineCap = "round";
      ctx3.beginPath();
      ctx3.moveTo(T.x, T.y - 70);
      ctx3.quadraticCurveTo(L.mx, L.my, L.x1, L.y1);
      ctx3.stroke();
      ctx3.strokeStyle = lit;
      ctx3.lineWidth = L.w * 0.34;
      ctx3.beginPath();
      ctx3.moveTo(T.x, T.y - 76);
      ctx3.quadraticCurveTo(L.mx, L.my - 5, L.x1, L.y1 - 4);
      ctx3.stroke();
    }
    for (const c of CURTAIN) if (!c.front) strand(ctx3, c, time, bark);
    for (let i = 0; i < 9; i++) {
      const a0 = i / 9 * TAU6;
      const rr = i ? 34 + rnd(i * 17) * 26 : 0;
      ctx3.fillStyle = i % 2 ? bark : lit;
      ctx3.beginPath();
      ctx3.ellipse(T.x + Math.cos(a0) * rr, T.y + Math.sin(a0) * rr * 0.6, 48 - i * 1.8, 64 - i * 2.2, a0 * 0.3, 0, TAU6);
      ctx3.fill();
    }
    ctx3.strokeStyle = "rgba(0,0,0,0.32)";
    ctx3.lineWidth = 3.4;
    for (let i = 0; i < 8; i++) {
      const x = T.x - 52 + i * 15;
      ctx3.beginPath();
      ctx3.moveTo(x, T.y - 60);
      ctx3.quadraticCurveTo(x + (rnd(i) - 0.5) * 24, T.y, x + (rnd(i * 3) - 0.5) * 20, T.y + 48);
      ctx3.stroke();
    }
    for (const p of PROPS) {
      const sway = Math.sin(time * 0.5 + p.seed) * 1.2;
      ctx3.fillStyle = "rgba(0,0,0,0.26)";
      ctx3.beginPath();
      ctx3.ellipse(p.x + 4, p.y + 3, p.w * 0.9, p.w * 0.42, 0, 0, TAU6);
      ctx3.fill();
      ctx3.save();
      ctx3.translate(p.x, p.y);
      ctx3.rotate(p.lean);
      const g = ctx3.createLinearGradient(-p.w / 2, 0, p.w / 2, 0);
      g.addColorStop(0, lit);
      g.addColorStop(0.45, bark);
      g.addColorStop(1, "#241a13");
      ctx3.fillStyle = g;
      ctx3.beginPath();
      ctx3.moveTo(-p.w * 0.36 + sway, -p.h);
      ctx3.quadraticCurveTo(-p.w * 0.5, -p.h * 0.4, -p.w * 0.62, 0);
      ctx3.lineTo(p.w * 0.62, 0);
      ctx3.quadraticCurveTo(p.w * 0.5, -p.h * 0.4, p.w * 0.36 + sway, -p.h);
      ctx3.closePath();
      ctx3.fill();
      ctx3.restore();
    }
  }
  function drawCanopy(ctx3, T, bloom, time, see = 1) {
    banyanBones(T);
    const bark = mixHex("#33241b", "#543c2a", bloom * 0.7);
    for (const c of CURTAIN) if (c.front) strand(ctx3, c, time, bark);
    if (bloom <= 0.02) {
      ctx3.strokeStyle = "rgba(44,32,26,0.5)";
      ctx3.lineCap = "round";
      for (let i = 0; i < 30; i++) {
        const a0 = i / 30 * TAU6;
        const r = 200 + rnd(i) * 200;
        ctx3.lineWidth = 5 - i % 3 * 1.2;
        ctx3.beginPath();
        ctx3.moveTo(T.x, T.y - 96);
        ctx3.quadraticCurveTo(
          T.x + Math.cos(a0) * r * 0.55,
          T.y - 150 + Math.sin(a0) * r * 0.34,
          T.x + Math.cos(a0) * r,
          T.y - 110 + Math.sin(a0) * r * 0.58
        );
        ctx3.stroke();
      }
      return;
    }
    const LAYERS = [
      { col: ["#20401f", "#27492a"], dy: 118, spread: 1, n: 34, size: 92 },
      { col: ["#2f6b2c", "#387a33"], dy: 152, spread: 0.88, n: 28, size: 84 },
      { col: ["#4d9a3a", "#63b148"], dy: 186, spread: 0.7, n: 20, size: 70 }
    ];
    for (let layer = 0; layer < 3; layer++) {
      const L = LAYERS[layer];
      const grown = clamp012((bloom - layer * 0.12) / 0.7);
      if (grown <= 0.01) continue;
      for (let i = 0; i < L.n; i++) {
        const a0 = i / L.n * TAU6 + layer * 0.8 + rnd(i + layer * 31) * 0.5;
        const r = (110 + rnd(i * 3 + layer) * 250) * L.spread;
        const sway = Math.sin(time * 0.55 + i + layer) * (3 + layer);
        const size = (L.size * 0.62 + rnd(i * 5 + layer) * L.size * 0.6) * (0.55 + grown * 0.45);
        ctx3.fillStyle = L.col[i & 1];
        ctx3.globalAlpha = 0.92 * see;
        ctx3.beginPath();
        ctx3.ellipse(T.x + Math.cos(a0) * r + sway, T.y - L.dy + Math.sin(a0) * r * 0.55, size, size * 0.72, a0, 0, TAU6);
        ctx3.fill();
      }
    }
    ctx3.globalAlpha = see;
    for (let i = 0; i < 46; i++) {
      const k = clamp012((bloom - 0.25) / 0.6);
      if (k <= 0.01) break;
      const a0 = rnd(i * 7) * TAU6, r = 90 + rnd(i * 11) * 270;
      const x = T.x + Math.cos(a0) * r + Math.sin(time * 0.6 + i) * 3;
      const y = T.y - 150 + Math.sin(a0) * r * 0.55 - rnd(i * 5) * 40;
      ctx3.fillStyle = i % 5 ? "#eef0d8" : "#d9607a";
      const sz = (2.6 + rnd(i * 3) * 2.6) * k;
      ctx3.beginPath();
      ctx3.arc(x, y, sz, 0, TAU6);
      ctx3.fill();
    }
    if (bloom > 0.3) {
      ctx3.strokeStyle = `rgba(90,66,40,${(bloom - 0.3) * 0.9 * see})`;
      ctx3.lineCap = "round";
      for (let i = 0; i < 12; i++) {
        const a0 = rnd(i * 17) * TAU6, r = 120 + rnd(i * 23) * 230;
        const x = T.x + Math.cos(a0) * r, y = T.y - 150 + Math.sin(a0) * r * 0.55;
        const len = (40 + rnd(i * 31) * 90) * clamp012((bloom - 0.3) / 0.7);
        ctx3.lineWidth = 2 + rnd(i) * 2;
        ctx3.beginPath();
        ctx3.moveTo(x, y);
        ctx3.quadraticCurveTo(x + Math.sin(time * 0.5 + i) * 6, y + len * 0.6, x + Math.sin(time * 0.5 + i) * 9, y + len);
        ctx3.stroke();
      }
    }
    ctx3.globalAlpha = 1;
    ctx3.save();
    ctx3.globalCompositeOperation = "lighter";
    const lg = ctx3.createRadialGradient(T.x - 140, T.y - 250, 20, T.x - 140, T.y - 250, 360);
    lg.addColorStop(0, `rgba(255,228,150,${0.22 * bloom * see})`);
    lg.addColorStop(0.5, `rgba(190,230,140,${0.1 * bloom * see})`);
    lg.addColorStop(1, "rgba(255,190,110,0)");
    ctx3.fillStyle = lg;
    ctx3.beginPath();
    ctx3.arc(T.x - 140, T.y - 250, 360, 0, TAU6);
    ctx3.fill();
    ctx3.restore();
    if (bloom > 0.45) {
      const n = Math.round((bloom - 0.45) * 16);
      for (let i = 0; i < n; i++) {
        const a0 = time * 0.24 + i * 1.7;
        const r = 200 + i % 4 * 60;
        bird(ctx3, T.x + Math.cos(a0) * r, T.y - 300 + Math.sin(a0 * 1.3) * 70 - i % 3 * 30, 11, {
          fill: i & 1 ? G.chuna : G.kesar,
          mark: "dot",
          on: "rgba(60,40,20,0.5)",
          rows: 1,
          along: 5,
          ms: 1.5,
          lw: 1.6
        });
      }
    }
  }
  function drawYoungTree(ctx3, o, time, bloom = 0) {
    const g = clamp012(o.grow), x = o.x, y = o.y;
    const bl = clamp012(bloom);
    if (g <= 0.01) return;
    const h = 128 * g;
    const bw = 27 * g;
    ctx3.fillStyle = "rgba(0,0,0,0.28)";
    ctx3.beginPath();
    ctx3.ellipse(x + 6, y + 6, 52 * g, 22 * g, 0, 0, TAU6);
    ctx3.fill();
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU6 + 0.35;
      ctx3.strokeStyle = "#4a3323";
      ctx3.lineWidth = 7 * g;
      ctx3.lineCap = "round";
      ctx3.beginPath();
      ctx3.moveTo(x + Math.cos(a) * bw * 0.4, y - 6);
      ctx3.quadraticCurveTo(x + Math.cos(a) * 30 * g, y + Math.sin(a) * 15 * g, x + Math.cos(a) * 54 * g, y + 7 + Math.sin(a) * 27 * g);
      ctx3.stroke();
    }
    const wAt = (u) => bw * (1 - u * 0.36);
    const bg = ctx3.createLinearGradient(x - bw, 0, x + bw, 0);
    bg.addColorStop(0, "#7b5838");
    bg.addColorStop(0.42, "#5a4029");
    bg.addColorStop(1, "#2f2118");
    ctx3.fillStyle = bg;
    ctx3.beginPath();
    ctx3.moveTo(x - wAt(0), y);
    ctx3.quadraticCurveTo(x - wAt(0.5) * 1.04, y - h * 0.5, x - wAt(1), y - h);
    ctx3.lineTo(x + wAt(1), y - h);
    ctx3.quadraticCurveTo(x + wAt(0.5) * 1.04, y - h * 0.5, x + wAt(0), y);
    ctx3.closePath();
    ctx3.fill();
    ctx3.strokeStyle = "rgba(28,18,12,0.5)";
    ctx3.lineCap = "round";
    for (const u of [-0.74, -0.3, 0.3, 0.74]) {
      ctx3.lineWidth = (Math.abs(u) > 0.5 ? 2.6 : 1.8) * g;
      ctx3.beginPath();
      ctx3.moveTo(x + u * wAt(0), y - 2);
      ctx3.quadraticCurveTo(x + u * wAt(0.5) * 1.02, y - h * 0.5, x + u * wAt(1), y - h + 4);
      ctx3.stroke();
    }
    ctx3.strokeStyle = "#4a3323";
    ctx3.lineWidth = 3.4 * g;
    ctx3.beginPath();
    ctx3.moveTo(x + 30 * g, y - h * 0.86);
    ctx3.quadraticCurveTo(x + 42 * g + Math.sin(time) * 3, y - h * 0.4, x + 38 * g, y - h * 0.06);
    ctx3.stroke();
    for (let i = 0; i < 9; i++) {
      const a = i / 9 * TAU6;
      const r = 36 * g;
      const leaf2 = NEW_LEAF[(i + 1) % NEW_LEAF.length];
      ctx3.fillStyle = bl < 0.02 ? leaf2 : mixHex(leaf2, "#7cc255", bl * 0.6);
      ctx3.beginPath();
      ctx3.ellipse(x + Math.cos(a) * r + Math.sin(time * 0.7 + i) * 2, y - h - 12 * g + Math.sin(a) * r * 0.6, 27 * g, 21 * g, a, 0, TAU6);
      ctx3.fill();
    }
    ctx3.fillStyle = "rgba(214,240,180,0.16)";
    ctx3.beginPath();
    ctx3.ellipse(x - 10 * g, y - h - 26 * g, 26 * g, 13 * g, -0.2, 0, TAU6);
    ctx3.fill();
    if (bl > 0.55) {
      ctx3.fillStyle = `rgba(255,236,242,${(bl - 0.55) * 1.6})`;
      for (let i = 0; i < 5; i++) {
        const a = rnd(i * 3 + 1) * TAU6, d = (8 + rnd(i * 7) * 24) * g;
        ctx3.beginPath();
        ctx3.arc(x + Math.cos(a) * d, y - h - 12 * g + Math.sin(a) * d * 0.62, 1.8 * g, 0, TAU6);
        ctx3.fill();
      }
    }
    if (g > 0.7) {
      const pw = 40 * g;
      drawMuralPanel(ctx3, x - pw / 2, y - h * 0.62, pw, o.mural, clamp012((g - 0.7) / 0.3));
    }
  }
  function drawMuralPanel(ctx3, px, py, pw, mural, k = 1) {
    const pht = pw * 0.56;
    ctx3.save();
    ctx3.globalAlpha = k;
    glow(ctx3, px + pw / 2, py + pht / 2, pw * 2.4, "rgba(255,170,80,0.26)");
    ctx3.fillStyle = "#3a2718";
    roundRect(ctx3, px - pw * 0.075, py - pw * 0.075, pw * 1.15, pht + pw * 0.15, pw * 0.1);
    ctx3.fill();
    ctx3.fillStyle = "#17100b";
    roundRect(ctx3, px, py, pw, pht, pw * 0.075);
    ctx3.fill();
    const painted = img(`mural-${mural}`);
    if (painted) {
      ctx3.save();
      roundRect(ctx3, px, py, pw, pht, pw * 0.075);
      ctx3.clip();
      cover(ctx3, painted, px, py, pw, pht);
      ctx3.restore();
      const lg = ctx3.createLinearGradient(px, py, px, py + pht);
      lg.addColorStop(0, "rgba(255,196,120,0.22)");
      lg.addColorStop(1, "rgba(60,30,10,0.26)");
      ctx3.fillStyle = lg;
      roundRect(ctx3, px, py, pw, pht, pw * 0.075);
      ctx3.fill();
    } else {
      ctx3.fillStyle = "rgba(255,190,120,0.7)";
      for (let i = 0; i < 3; i++) ctx3.fillRect(px + pw * 0.14, py + pht * (0.22 + i * 0.26), pw * 0.72, pw * 0.045);
    }
    ctx3.strokeStyle = "rgba(255,196,130,0.9)";
    ctx3.lineWidth = Math.max(1.3, pw * 0.035);
    roundRect(ctx3, px, py, pw, pht, pw * 0.075);
    ctx3.stroke();
    ctx3.restore();
  }
  function roundRect(ctx3, x, y, w, h, r) {
    ctx3.beginPath();
    ctx3.moveTo(x + r, y);
    ctx3.arcTo(x + w, y, x + w, y + h, r);
    ctx3.arcTo(x + w, y + h, x, y + h, r);
    ctx3.arcTo(x, y + h, x, y, r);
    ctx3.arcTo(x, y, x + w, y, r);
    ctx3.closePath();
  }
  function drawBroom(ctx3, o, time) {
    const bob = Math.sin(time * 1.4) * 1.2;
    ctx3.fillStyle = "rgba(0,0,0,0.26)";
    ctx3.beginPath();
    ctx3.ellipse(o.x + 3, o.y + 3, 13, 5, 0, 0, TAU6);
    ctx3.fill();
    ctx3.save();
    ctx3.translate(o.x, o.y + bob);
    ctx3.rotate(-0.42);
    ctx3.strokeStyle = "#6b4a2c";
    ctx3.lineWidth = 3.4;
    ctx3.lineCap = "round";
    ctx3.beginPath();
    ctx3.moveTo(0, 2);
    ctx3.lineTo(0, -46);
    ctx3.stroke();
    ctx3.strokeStyle = "#c8a05a";
    ctx3.lineWidth = 1.8;
    for (let i = -4; i <= 4; i++) {
      ctx3.beginPath();
      ctx3.moveTo(i * 0.6, 0);
      ctx3.lineTo(i * 2.6, 15 - Math.abs(i) * 0.8);
      ctx3.stroke();
    }
    ctx3.strokeStyle = "#8a5f34";
    ctx3.lineWidth = 2.2;
    ctx3.beginPath();
    ctx3.moveTo(-3.4, 0);
    ctx3.lineTo(3.4, 0);
    ctx3.stroke();
    ctx3.restore();
    glow(ctx3, o.x, o.y - 20, 70, "rgba(255,190,120,0.16)");
  }
  function drawRoot(ctx3, T, R2, woken, time, isCurrent) {
    const pts = rootPath(T, R2);
    const n = pts.length;
    ctx3.save();
    ctx3.translate(5, 9);
    ribbon2(ctx3, pts, 34, 7, "rgba(0,0,0,0.22)");
    ctx3.restore();
    for (let i = 2; i < n - 1; i++) {
      if ((R2.seed + i) % 3) continue;
      const a = Math.atan2(pts[i].y - pts[i - 1].y, pts[i].x - pts[i - 1].x);
      for (const side of [-1, 1]) {
        const sp = a + side * (0.8 + rnd(R2.seed + i * 3) * 0.7);
        const len = 40 + rnd(R2.seed + i * 7) * 90;
        const w = 9 * (1 - i / n) + 3;
        ctx3.strokeStyle = woken ? "#5e4129" : "#514d46";
        ctx3.lineWidth = w;
        ctx3.lineCap = "round";
        ctx3.beginPath();
        ctx3.moveTo(pts[i].x, pts[i].y);
        ctx3.quadraticCurveTo(
          pts[i].x + Math.cos(sp) * len * 0.6 + 14,
          pts[i].y + Math.sin(sp) * len * 0.6,
          pts[i].x + Math.cos(sp + 0.5) * len,
          pts[i].y + Math.sin(sp + 0.5) * len
        );
        ctx3.stroke();
      }
    }
    ribbon2(ctx3, pts, 36, 8, woken ? "#6b4a2e" : "#57534b");
    ribbon2(ctx3, pts, 22, 4, woken ? "#7d5936" : "#615c54", -5);
    ribbon2(ctx3, pts, 8, 2, woken ? "rgba(255,196,130,0.5)" : "rgba(168,164,156,0.35)", -10);
    for (let i = 1; i < n - 1; i++) {
      if ((R2.seed + i * 2) % 4) continue;
      const w = (36 - (36 - 8) * (i / (n - 1))) * 0.62;
      ctx3.fillStyle = woken ? "#5b3e26" : "#4c4841";
      ctx3.beginPath();
      ctx3.ellipse(pts[i].x, pts[i].y, w, w * 0.72, i, 0, TAU6);
      ctx3.fill();
    }
    const tip = pts[n - 1];
    if (woken) {
      ctx3.save();
      ctx3.globalCompositeOperation = "lighter";
      for (let k = 0; k < 3; k++) {
        const f = (time * 0.2 + R2.seed * 0.3 + k / 3) % 1;
        const p = along(pts, 1 - f);
        const g = ctx3.createRadialGradient(p.x, p.y, 2, p.x, p.y, 80);
        g.addColorStop(0, "rgba(255,175,80,0.5)");
        g.addColorStop(1, "rgba(255,150,60,0)");
        ctx3.fillStyle = g;
        ctx3.beginPath();
        ctx3.arc(p.x, p.y, 80, 0, TAU6);
        ctx3.fill();
      }
      ctx3.restore();
      glow(ctx3, tip.x, tip.y, 170, `rgba(255,168,72,${0.26 + Math.sin(time * 1.6 + R2.seed) * 0.06})`);
    }
    if (!woken && isCurrent) {
      const pulse2 = 0.2 + Math.sin(time * 1.9) * 0.08;
      ctx3.save();
      ctx3.globalCompositeOperation = "lighter";
      ribbon2(ctx3, pts, 14, 4, `rgba(255,150,60,${pulse2})`, -6);
      ctx3.restore();
      const run = along(pts, time * 0.24 % 1);
      glow(ctx3, run.x, run.y, 60, "rgba(255,160,70,0.30)");
    }
    ctx3.fillStyle = woken ? "#7a5533" : isCurrent ? "#5d5548" : "#4a4a52";
    ctx3.beginPath();
    ctx3.ellipse(tip.x, tip.y, 52, 38, 0, 0, TAU6);
    ctx3.fill();
    if (!woken && !isCurrent) {
      ctx3.fillStyle = "rgba(214,230,246,0.5)";
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9;
        ctx3.beginPath();
        ctx3.ellipse(tip.x + Math.cos(a) * 26, tip.y + Math.sin(a) * 18, 9, 5, a, 0, TAU6);
        ctx3.fill();
      }
    }
    ctx3.strokeStyle = woken ? "rgba(255,196,130,0.9)" : "rgba(126,122,116,0.7)";
    ctx3.lineWidth = 3.5;
    ctx3.stroke();
    for (let i = 0; i < 5; i++) {
      ctx3.strokeStyle = woken ? `rgba(255,190,120,${0.3 - i * 0.05})` : `rgba(140,136,130,${0.24 - i * 0.04})`;
      ctx3.lineWidth = 1.6;
      ctx3.beginPath();
      ctx3.ellipse(tip.x, tip.y, 46 - i * 9, 33 - i * 6.5, 0, 0, TAU6);
      ctx3.stroke();
    }
  }
  function ribbon2(ctx3, pts, w0, w1, fill, lift = 0) {
    const n = pts.length;
    const side = (sgn) => {
      for (let i = 0; i < n; i++) {
        const k = sgn > 0 ? i : n - 1 - i;
        const p = pts[k];
        const a = pts[Math.min(n - 1, k + 1)], b = pts[Math.max(0, k - 1)];
        const ang = Math.atan2(a.y - b.y, a.x - b.x) + Math.PI / 2;
        const w = (w0 + (w1 - w0) * (k / (n - 1))) / 2;
        const x = p.x + Math.cos(ang) * w * sgn, y = p.y + Math.sin(ang) * w * sgn + lift;
        if (i === 0 && sgn > 0) ctx3.moveTo(x, y);
        else ctx3.lineTo(x, y);
      }
    };
    ctx3.beginPath();
    side(1);
    side(-1);
    ctx3.closePath();
    ctx3.fillStyle = fill;
    ctx3.fill();
  }
  function rootPath(T, R2) {
    if (R2._pts) return R2._pts;
    const to = R2.at || R2;
    const n = 11, out = [];
    const dx = to.x - T.x, dy = to.y - T.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const bend = Math.sin(k * Math.PI) * 190 * (rnd(R2.seed) - 0.5) + Math.sin(k * Math.PI * 2.7 + R2.seed) * 62 + Math.sin(k * Math.PI * 5.3 + R2.seed * 2) * 20;
      out.push({ x: T.x + dx * k + nx * bend, y: T.y + dy * k + ny * bend });
    }
    R2._pts = out;
    return out;
  }
  function along(pts, k) {
    const f = clamp012(k) * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(f)), u = f - i;
    return { x: mix2(pts[i].x, pts[i + 1].x, u), y: mix2(pts[i].y, pts[i + 1].y, u) };
  }
  function drawTree(ctx3, o, time, warmth, bloom = 0) {
    const bl = clamp012(bloom);
    const s = o.s, x = o.x, y = o.y;
    const sway = Math.sin(time * 0.6 + o.seed) * 2.4 * s;
    ctx3.fillStyle = "rgba(0,0,0,0.26)";
    ctx3.beginPath();
    ctx3.ellipse(x + 8 * s, y + 8 * s, 34 * s, 16 * s, 0, 0, TAU6);
    ctx3.fill();
    ctx3.fillStyle = "#3d2c20";
    ctx3.beginPath();
    ctx3.moveTo(x - 6 * s, y);
    ctx3.lineTo(x - 4 * s, y - 26 * s);
    ctx3.lineTo(x + 4 * s, y - 26 * s);
    ctx3.lineTo(x + 6 * s, y);
    ctx3.closePath();
    ctx3.fill();
    if (o.dead) {
      const tip = [];
      ctx3.strokeStyle = mixHex("#3d3229", "#54402c", bl);
      ctx3.lineCap = "round";
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i - 2.5) * 0.42;
        const ex = x + Math.cos(a) * 44 * s + sway, ey = y - 52 * s + Math.sin(a) * 12 * s;
        ctx3.lineWidth = 4.5 * s;
        ctx3.beginPath();
        ctx3.moveTo(x, y - 22 * s);
        ctx3.quadraticCurveTo(x + Math.cos(a) * 24 * s, y - 42 * s, ex, ey);
        ctx3.stroke();
        tip.push([ex, ey, a]);
      }
      if (bl > 0.02) {
        for (let i = 0; i < tip.length; i++) {
          const [ex, ey, a] = tip[i];
          ctx3.fillStyle = NEW_LEAF[(o.seed + i) % NEW_LEAF.length];
          const r = (7 + rnd(o.seed + i) * 7) * s * bl;
          ctx3.beginPath();
          ctx3.ellipse(ex, ey, r * 1.5, r, a, 0, TAU6);
          ctx3.fill();
          ctx3.beginPath();
          ctx3.ellipse((x + ex) / 2 + Math.cos(a) * 4 * s, (y - 30 * s + ey) / 2, r * 1.1, r * 0.8, a, 0, TAU6);
          ctx3.fill();
        }
      }
      return;
    }
    const gold = warmth > 0.55 ? ["#d98f2f", "#e8b148", "#c46c25", "#f0c65e"] : ["#8f7a3a", "#a8893c", "#7a6330", "#bd9a45"];
    const hues = bl < 0.02 ? gold : gold.map((c, i) => mixHex(c, NEW_LEAF[i], bl));
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU6 + o.seed;
      const r = (26 + rnd(o.seed + i) * 16) * s;
      ctx3.fillStyle = hues[(o.seed + i) % hues.length];
      ctx3.beginPath();
      ctx3.ellipse(x + Math.cos(a) * 17 * s + sway, y - 34 * s + Math.sin(a) * 11 * s, r, r * 0.8, a, 0, TAU6);
      ctx3.fill();
    }
    ctx3.fillStyle = `rgba(255,${230 + bl * 18},${180 + bl * 40},0.14)`;
    ctx3.beginPath();
    ctx3.ellipse(x - 12 * s + sway, y - 46 * s, 22 * s, 14 * s, 0, 0, TAU6);
    ctx3.fill();
    if (bl > 0.55) {
      ctx3.fillStyle = `rgba(255,236,242,${(bl - 0.55) * 1.6})`;
      for (let i = 0; i < 7; i++) {
        const a = rnd(o.seed * 3 + i) * TAU6;
        const d = (10 + rnd(o.seed + i * 5) * 26) * s;
        ctx3.beginPath();
        ctx3.arc(x + Math.cos(a) * d + sway, y - 36 * s + Math.sin(a) * d * 0.7, 1.7 * s, 0, TAU6);
        ctx3.fill();
      }
    }
  }
  function drawRock(ctx3, o, time, warmth) {
    const s = o.s, x = o.x, y = o.y;
    ctx3.fillStyle = "rgba(0,0,0,0.24)";
    ctx3.beginPath();
    ctx3.ellipse(x + 4 * s, y + 4 * s, 20 * s, 10 * s, 0, 0, TAU6);
    ctx3.fill();
    for (let i = 0; i < 3; i++) {
      const a = o.seed + i * 2.1;
      ctx3.fillStyle = ["#6a655e", "#7b756c", "#57524c"][i];
      ctx3.beginPath();
      ctx3.ellipse(x + Math.cos(a) * 6 * s, y - 4 * s + Math.sin(a) * 4 * s, (16 - i * 3) * s, (12 - i * 2.4) * s, a, 0, TAU6);
      ctx3.fill();
    }
    ctx3.fillStyle = "rgba(255,240,210,0.16)";
    ctx3.beginPath();
    ctx3.ellipse(x - 5 * s, y - 9 * s, 8 * s, 4.4 * s, -0.4, 0, TAU6);
    ctx3.fill();
  }
  function drawStone(ctx3, o, time) {
    const r = o.r, z = o.z || 0, seed = o.seed;
    const sh = Math.min(0.9, z * 55e-4);
    ctx3.fillStyle = `rgba(0,0,0,${0.32 - sh * 0.2})`;
    ctx3.beginPath();
    ctx3.ellipse(o.x + r * 0.16, o.y + r * 0.34, r * (1 - sh * 0.4), r * 0.44 * (1 - sh * 0.4), 0, 0, TAU6);
    ctx3.fill();
    ctx3.save();
    ctx3.translate(o.x, o.y - z + (o.spin ? Math.sin(time * 9 + seed) * 0.6 : 0));
    const tip = o.spin ? Math.sin(time * 5 + seed) * 0.5 : 0;
    ctx3.rotate(tip);
    for (let i = 0; i < 3; i++) {
      const a = seed + i * 2.2;
      ctx3.fillStyle = ["#6a655e", "#7b756c", "#57524c"][i];
      ctx3.beginPath();
      ctx3.ellipse(
        Math.cos(a) * r * 0.2,
        -r * 0.16 + Math.sin(a) * r * 0.14,
        r * (1 - i * 0.16),
        r * (0.78 - i * 0.13),
        a,
        0,
        TAU6
      );
      ctx3.fill();
    }
    ctx3.strokeStyle = "rgba(30,26,22,0.5)";
    ctx3.lineWidth = 1.3;
    ctx3.beginPath();
    ctx3.ellipse(0, -r * 0.16, r * 0.98, r * 0.78, 0, 0, TAU6);
    ctx3.stroke();
    ctx3.fillStyle = "rgba(255,240,210,0.2)";
    ctx3.beginPath();
    ctx3.ellipse(-r * 0.24, -r * 0.46, r * 0.44, r * 0.24, -0.4, 0, TAU6);
    ctx3.fill();
    ctx3.fillStyle = "rgba(122,146,86,0.5)";
    for (let i = 0; i < 3; i++) {
      const a = seed * 1.7 + i * 2.6;
      ctx3.beginPath();
      ctx3.ellipse(Math.cos(a) * r * 0.5, -r * 0.16 + Math.sin(a) * r * 0.38, r * 0.15, r * 0.1, a, 0, TAU6);
      ctx3.fill();
    }
    ctx3.restore();
  }
  function drawShrine(ctx3, S2, time, lit) {
    const x = S2.x, y = S2.y;
    ctx3.fillStyle = "rgba(0,0,0,0.22)";
    ctx3.beginPath();
    ctx3.ellipse(x + 8, y + 16, 286, 132, 0, 0, TAU6);
    ctx3.fill();
    ctx3.fillStyle = "#8d8272";
    ctx3.beginPath();
    ctx3.ellipse(x, y, 272, 124, 0, 0, TAU6);
    ctx3.fill();
    ctx3.fillStyle = "#7a705f";
    ctx3.beginPath();
    ctx3.ellipse(x, y - 8, 262, 116, 0, 0, TAU6);
    ctx3.fill();
    ctx3.strokeStyle = "rgba(52,44,34,0.5)";
    ctx3.lineWidth = 3;
    ctx3.beginPath();
    ctx3.ellipse(x, y - 8, 262, 116, 0, 0, TAU6);
    ctx3.stroke();
    ctx3.strokeStyle = "rgba(52,44,34,0.24)";
    ctx3.lineWidth = 1.8;
    for (let i = -5; i <= 5; i++) {
      ctx3.beginPath();
      ctx3.moveTo(x + i * 46, y - 112);
      ctx3.lineTo(x + i * 46, y + 102);
      ctx3.stroke();
    }
    for (let j = -2; j <= 2; j++) {
      ctx3.beginPath();
      ctx3.ellipse(x, y - 8, 262 - Math.abs(j) * 52, 116 - Math.abs(j) * 26, 0, 0, TAU6);
      ctx3.stroke();
    }
    for (let i = 0; i < 3; i++) {
      ctx3.fillStyle = ["#9b907e", "#8d8272", "#7f7565"][i];
      ctx3.beginPath();
      ctx3.ellipse(x, y + 104 + i * 13, 128 - i * 16, 22 - i * 3, 0, 0, Math.PI);
      ctx3.fill();
    }
    const lamps = [[-224, -48], [224, -48], [-150, 86], [150, 86]];
    for (const [dx, dy] of lamps) {
      const lx = x + dx, ly = y + dy;
      ctx3.fillStyle = "#6e6454";
      ctx3.beginPath();
      ctx3.ellipse(lx, ly, 13, 7, 0, 0, TAU6);
      ctx3.fill();
      ctx3.fillStyle = "#857a67";
      ctx3.fillRect(lx - 4, ly - 26, 8, 26);
      ctx3.fillStyle = "#9a8f79";
      ctx3.beginPath();
      ctx3.ellipse(lx, ly - 29, 11, 6, 0, 0, TAU6);
      ctx3.fill();
      if (lit > 0.02) {
        const f = 0.8 + Math.sin(time * 6 + dx) * 0.16;
        glow(ctx3, lx, ly - 32, 96 * lit * f, `rgba(255,158,70,${0.42 * lit})`);
        ctx3.fillStyle = `rgba(255,206,130,${lit * f})`;
        ctx3.beginPath();
        ctx3.ellipse(lx, ly - 34, 4, 7 * f, 0, 0, TAU6);
        ctx3.fill();
      }
    }
    const bx = x + 250, by = y + 30;
    ctx3.strokeStyle = "#6a5a44";
    ctx3.lineWidth = 6;
    ctx3.lineCap = "round";
    ctx3.beginPath();
    ctx3.moveTo(bx, by);
    ctx3.lineTo(bx, by - 74);
    ctx3.lineTo(bx - 34, by - 74);
    ctx3.stroke();
    ctx3.fillStyle = lit > 0.5 ? "#c9a24a" : "#8b8272";
    ctx3.beginPath();
    ctx3.moveTo(bx - 44, by - 64);
    ctx3.quadraticCurveTo(bx - 46, by - 42, bx - 34, by - 38);
    ctx3.lineTo(bx - 14, by - 38);
    ctx3.quadraticCurveTo(bx - 22, by - 42, bx - 24, by - 64);
    ctx3.closePath();
    ctx3.fill();
    ctx3.beginPath();
    ctx3.arc(bx - 29, by - 33, 3.4, 0, TAU6);
    ctx3.fill();
  }
  function drawGate(ctx3, G3, time, warmth) {
    const x = G3.x, y = G3.y;
    ctx3.fillStyle = "rgba(0,0,0,0.26)";
    ctx3.beginPath();
    ctx3.ellipse(x, y + 10, 150, 26, 0, 0, TAU6);
    ctx3.fill();
    for (const side of [-1, 1]) {
      const px = x + side * 116, lean = side * 0.035;
      ctx3.save();
      ctx3.translate(px, y);
      ctx3.rotate(lean);
      ctx3.fillStyle = "#7b6a52";
      ctx3.fillRect(-15, -128, 30, 128);
      ctx3.fillStyle = "#8d7c62";
      ctx3.fillRect(-15, -128, 11, 128);
      ctx3.fillStyle = "#5f5340";
      for (let i = 0; i < 4; i++) ctx3.fillRect(-17, -112 + i * 30, 34, 6);
      ctx3.fillStyle = "#6d5f49";
      ctx3.fillRect(-21, -4, 42, 10);
      ctx3.restore();
    }
    ctx3.fillStyle = "#7b6a52";
    ctx3.beginPath();
    ctx3.moveTo(x - 132, y - 128);
    ctx3.quadraticCurveTo(x, y - 116, x + 132, y - 128);
    ctx3.lineTo(x + 132, y - 150);
    ctx3.quadraticCurveTo(x, y - 138, x - 132, y - 150);
    ctx3.closePath();
    ctx3.fill();
    ctx3.fillStyle = "#8d7c62";
    ctx3.beginPath();
    ctx3.moveTo(x - 132, y - 150);
    ctx3.quadraticCurveTo(x, y - 138, x + 132, y - 150);
    ctx3.lineTo(x + 132, y - 156);
    ctx3.quadraticCurveTo(x, y - 144, x - 132, y - 156);
    ctx3.closePath();
    ctx3.fill();
    for (let i = 0; i < 15; i++) {
      const k = i / 14;
      const mx = x - 120 + k * 240;
      const my = y - 124 + Math.sin(k * Math.PI) * 22 + Math.sin(time * 0.7 + i) * 1.4;
      const fresh = warmth > 0.5 && i % 3 === 0;
      ctx3.fillStyle = fresh ? "#e8a32a" : "#8a6a34";
      ctx3.beginPath();
      ctx3.arc(mx, my, fresh ? 5 : 4, 0, TAU6);
      ctx3.fill();
    }
    const bx = x, by = y - 116 + Math.sin(time * 0.9) * 0.8;
    ctx3.strokeStyle = "#5a5040";
    ctx3.lineWidth = 2;
    ctx3.beginPath();
    ctx3.moveTo(bx, y - 122);
    ctx3.lineTo(bx, by + 4);
    ctx3.stroke();
    ctx3.fillStyle = warmth > 0.5 ? "#c9a24a" : "#867c6a";
    ctx3.beginPath();
    ctx3.moveTo(bx - 9, by + 4);
    ctx3.quadraticCurveTo(bx - 10, by + 20, bx - 6, by + 24);
    ctx3.lineTo(bx + 6, by + 24);
    ctx3.quadraticCurveTo(bx + 10, by + 20, bx + 9, by + 4);
    ctx3.closePath();
    ctx3.fill();
    ctx3.beginPath();
    ctx3.arc(bx, by + 27, 2.6, 0, TAU6);
    ctx3.fill();
  }
  function drawSavi(ctx3, p, time) {
    const a = p.face;
    const walking = p.speed > 12;
    const ph = p.phase;
    const bob = walking ? Math.sin(ph * 2) * 1.6 : Math.sin(time * 1.6) * 0.7;
    const fx2 = Math.cos(a), fy = Math.sin(a);
    const away = fy < -0.25;
    const z = p.z || 0;
    ctx3.save();
    ctx3.fillStyle = `rgba(0,0,0,${0.3 - Math.min(0.16, z * 42e-4)})`;
    ctx3.beginPath();
    ctx3.ellipse(p.x + 1, p.y + 5, 12 - Math.min(4.5, z * 0.1), 5 - Math.min(2, z * 0.045), 0, 0, TAU6);
    ctx3.fill();
    ctx3.translate(p.x, p.y + bob - z);
    if (p.crank) ctx3.transform(1, 0, -fx2 * 0.36, 1 - fy * 0.15, 0, 2.5);
    const st2 = walking ? Math.sin(ph) * (p.crank ? 8.5 : 5) : 0;
    ctx3.fillStyle = "#3a2b22";
    ctx3.beginPath();
    ctx3.ellipse(-4.5 + fx2 * st2 * 0.5, 1 + st2 * 0.5, 3.6, 4.4, 0, 0, TAU6);
    ctx3.fill();
    ctx3.beginPath();
    ctx3.ellipse(4.5 - fx2 * st2 * 0.5, 1 - st2 * 0.5, 3.6, 4.4, 0, 0, TAU6);
    ctx3.fill();
    const carryStone = () => {
      const cr = p.carry * 0.58;
      const cy = (away ? -2 : -11) + Math.abs(Math.sin(ph)) * (walking ? 1.4 : 0) + Math.sin(time * 1.3) * 0.4;
      ctx3.save();
      ctx3.translate(fx2 * 2.5, cy);
      for (let i = 0; i < 3; i++) {
        const a2 = 1.3 + i * 2.2;
        ctx3.fillStyle = ["#6a655e", "#7b756c", "#57524c"][i];
        ctx3.beginPath();
        ctx3.ellipse(Math.cos(a2) * cr * 0.2, Math.sin(a2) * cr * 0.14, cr * (1 - i * 0.16), cr * (0.78 - i * 0.13), a2, 0, TAU6);
        ctx3.fill();
      }
      ctx3.strokeStyle = "rgba(30,26,22,0.5)";
      ctx3.lineWidth = 1.2;
      ctx3.beginPath();
      ctx3.ellipse(0, 0, cr * 0.98, cr * 0.78, 0, 0, TAU6);
      ctx3.stroke();
      ctx3.fillStyle = "rgba(255,240,210,0.2)";
      ctx3.beginPath();
      ctx3.ellipse(-cr * 0.24, -cr * 0.3, cr * 0.44, cr * 0.22, -0.4, 0, TAU6);
      ctx3.fill();
      ctx3.restore();
    };
    const carryHands = () => {
      const cr = p.carry * 0.58;
      const cy = (away ? -2 : -11) + Math.abs(Math.sin(ph)) * (walking ? 1.4 : 0) + Math.sin(time * 1.3) * 0.4;
      ctx3.fillStyle = "#c08a5a";
      ctx3.beginPath();
      ctx3.ellipse(fx2 * 2.5 - cr * 0.82, cy + cr * 0.34, 2.8, 2.2, -0.4, 0, TAU6);
      ctx3.fill();
      ctx3.beginPath();
      ctx3.ellipse(fx2 * 2.5 + cr * 0.82, cy + cr * 0.34, 2.8, 2.2, 0.4, 0, TAU6);
      ctx3.fill();
    };
    if (p.carry && away) carryStone();
    const sway = walking ? Math.sin(ph) * 2.2 : 0;
    ctx3.fillStyle = "#7b4b52";
    ctx3.beginPath();
    ctx3.moveTo(-6.5, -10);
    ctx3.quadraticCurveTo(-10 + sway, -2, -8.5 + sway, 2.5);
    ctx3.lineTo(8.5 + sway, 2.5);
    ctx3.quadraticCurveTo(10 + sway, -2, 6.5, -10);
    ctx3.closePath();
    ctx3.fill();
    ctx3.fillStyle = "#d8702f";
    ctx3.beginPath();
    ctx3.moveTo(-9, -20);
    ctx3.quadraticCurveTo(-11.5, -11, -7.5, -6);
    ctx3.lineTo(7.5, -6);
    ctx3.quadraticCurveTo(11.5, -11, 9, -20);
    ctx3.quadraticCurveTo(0, -23, -9, -20);
    ctx3.closePath();
    ctx3.fill();
    ctx3.fillStyle = "rgba(0,0,0,0.13)";
    ctx3.beginPath();
    ctx3.moveTo(1, -21);
    ctx3.lineTo(9, -20);
    ctx3.quadraticCurveTo(11.5, -11, 7.5, -6);
    ctx3.lineTo(1, -6);
    ctx3.closePath();
    ctx3.fill();
    ctx3.strokeStyle = "#efb76a";
    ctx3.lineWidth = 1.1;
    for (let i = -3; i <= 3; i++) {
      ctx3.beginPath();
      ctx3.moveTo(i * 2.6, -6);
      ctx3.lineTo(i * 2.6 + sway * 0.4, -3.4);
      ctx3.stroke();
    }
    const sweeping = (p.act || 0) > 0;
    if (p.broom) {
      ctx3.save();
      if (sweeping) {
        const sw = p.sweep || 0;
        ctx3.translate(Math.cos(a) * 9, Math.sin(a) * 6 - 8);
        ctx3.rotate(a + sw * 0.72 - Math.PI / 2);
      } else {
        ctx3.translate(-fx2 * 3, -12);
        ctx3.rotate(-0.72);
      }
      ctx3.strokeStyle = "#6b4a2c";
      ctx3.lineWidth = 2.6;
      ctx3.lineCap = "round";
      ctx3.beginPath();
      ctx3.moveTo(0, sweeping ? -14 : -13);
      ctx3.lineTo(0, sweeping ? 16 : 15);
      ctx3.stroke();
      ctx3.strokeStyle = "#c8a05a";
      ctx3.lineWidth = 1.5;
      for (let i = -4; i <= 4; i++) {
        ctx3.beginPath();
        ctx3.moveTo(i * 0.5, sweeping ? 13 : 12);
        ctx3.lineTo(i * 1.9, (sweeping ? 24 : 22) + Math.abs(i) * -0.5);
        ctx3.stroke();
      }
      ctx3.strokeStyle = "#8a5f34";
      ctx3.lineWidth = 1.8;
      ctx3.beginPath();
      ctx3.moveTo(-2.6, sweeping ? 12 : 11);
      ctx3.lineTo(2.6, sweeping ? 12 : 11);
      ctx3.stroke();
      ctx3.restore();
    }
    if (p.crank) {
      const sk = -fx2 * 0.36, sq = 1 - fy * 0.15;
      const gy = (p.crank.dy - 2.5) / sq;
      const gx = p.crank.dx - sk * gy;
      const aim2 = Math.atan2(p.crank.dy, p.crank.dx);
      const px2 = -Math.sin(aim2), py2 = Math.cos(aim2);
      ctx3.strokeStyle = "#c08a5a";
      ctx3.lineWidth = 3.1;
      ctx3.lineCap = "round";
      for (const d of [-1, 1]) {
        ctx3.beginPath();
        ctx3.moveTo(px2 * d * 5 + fx2 * 2, -16 + py2 * d * 2.2 + fy * 1.2);
        ctx3.lineTo(gx + px2 * d * 3.6, gy + py2 * d * 1.8);
        ctx3.stroke();
      }
      ctx3.fillStyle = "#c08a5a";
      for (const d of [-1, 1]) {
        ctx3.beginPath();
        ctx3.ellipse(gx + px2 * d * 3.6, gy + py2 * d * 1.8, 3, 2.5, 0, 0, TAU6);
        ctx3.fill();
      }
    }
    const swing = walking ? Math.sin(ph) * 1.7 : Math.sin(time * 1.2) * 0.7;
    const toward = clamp012((fy + 1) / 2);
    const tipX = -fx2 * 8.5 + swing;
    const tipY = mix2(-12, -33, toward);
    const braid = () => {
      ctx3.strokeStyle = "#2a1c18";
      ctx3.lineWidth = 3.8;
      ctx3.lineCap = "round";
      ctx3.beginPath();
      ctx3.moveTo(-fx2 * 3, -27.5);
      ctx3.quadraticCurveTo(tipX * 0.55, (tipY - 27.5) * 0.45 - 27.5 + 6, tipX, tipY);
      ctx3.stroke();
      ctx3.fillStyle = "#c94f6d";
      ctx3.beginPath();
      ctx3.arc(tipX, tipY, 1.9, 0, TAU6);
      ctx3.fill();
    };
    if (!away) braid();
    const hx = fx2 * 0.9;
    if (away) {
      ctx3.fillStyle = "#2a1c18";
      ctx3.beginPath();
      ctx3.ellipse(0, -25.4, 7, 7.3, 0, 0, TAU6);
      ctx3.fill();
    } else {
      ctx3.fillStyle = "#d9a06e";
      ctx3.beginPath();
      ctx3.ellipse(hx, -25.2, 6.5, 7, 0, 0, TAU6);
      ctx3.fill();
      ctx3.fillStyle = "#2a1c18";
      ctx3.beginPath();
      ctx3.ellipse(hx, -25.2, 6.8, 7.2, 0, Math.PI, TAU6);
      ctx3.quadraticCurveTo(hx + 3.2, -27.4, hx + 0.4, -28.4);
      ctx3.quadraticCurveTo(hx - 3.4, -27.2, hx - 6.8, -25.2);
      ctx3.closePath();
      ctx3.fill();
      ctx3.fillStyle = "#1b120f";
      ctx3.fillRect(hx - 2.9, -25.2, 1.6, 2);
      ctx3.fillRect(hx + 1.3, -25.2, 1.6, 2);
    }
    if (p.carry && !away) {
      carryStone();
      carryHands();
    }
    if (p.carry && away) carryHands();
    if (away) braid();
    if (p.lamp) {
      const em = clamp012(p.ember || 0);
      const out = (p.act || 0) > 0;
      const side = Math.abs(fx2) > 0.3 ? fx2 > 0 ? 1 : -1 : -1;
      const swg = walking ? Math.sin(ph) * 1.9 : Math.sin(time * 1.1) * 0.7;
      const hx2 = out ? fx2 * 16 : side * 10 + fx2 * 2 + swg;
      const hy = out ? fy * 9 - 25 : -22 + fy * 1.5 + (walking ? Math.abs(Math.sin(ph)) * 1.2 : 0);
      ctx3.strokeStyle = "#c08a5a";
      ctx3.lineWidth = 2.8;
      ctx3.lineCap = "round";
      ctx3.beginPath();
      ctx3.moveTo(side * 5.5, -17);
      ctx3.quadraticCurveTo((side * 5.5 + hx2) / 2 + side * 1.6, (-17 + hy) / 2 + 3, hx2, hy + 1);
      ctx3.stroke();
      drawLantern(ctx3, hx2, hy, em, time, p.x);
    }
    ctx3.restore();
  }
  function drawBreath(ctx3, p, o, time) {
    const a = p.face, fx2 = Math.cos(a), fy = Math.sin(a);
    const ox = p.x, oy = p.y + 6;
    const half = o.arc / 2;
    const cold = !!o.steam;
    const fl = 0.88 + Math.sin(time * 19.7) * 0.09 + Math.sin(time * 33.1) * 0.05;
    ctx3.save();
    ctx3.globalCompositeOperation = "lighter";
    const LAY = cold ? [[1, 1, "rgba(140,200,225,"], [0.72, 0.78, "rgba(200,232,244,"], [0.4, 0.46, "rgba(255,255,255,"]] : [[1, 1, "rgba(255,104,38,"], [0.7, 0.76, "rgba(255,164,58,"], [0.38, 0.44, "rgba(255,240,196,"]];
    const ALPHA = cold ? [0.15, 0.18, 0.22] : [0.16, 0.2, 0.25];
    for (let i = 0; i < 3; i++) {
      const r = o.reach * LAY[i][0] * (0.92 + Math.sin(time * (13 + i * 6)) * 0.06) * fl;
      const near = Math.min(0.5, 34 / r);
      const g = ctx3.createRadialGradient(ox, oy, 0, ox, oy, r);
      g.addColorStop(0, `${LAY[i][2]}0)`);
      g.addColorStop(near * 0.5, `${LAY[i][2]}${(ALPHA[i] * 0.16).toFixed(3)})`);
      g.addColorStop(near, `${LAY[i][2]}${(ALPHA[i] * 0.5).toFixed(3)})`);
      g.addColorStop(0.78, `${LAY[i][2]}${ALPHA[i]})`);
      g.addColorStop(1, `${LAY[i][2]}${(ALPHA[i] * 0.3).toFixed(3)})`);
      ctx3.fillStyle = g;
      ctx3.beginPath();
      ctx3.moveTo(ox, oy);
      ctx3.arc(ox, oy, r, a - half * LAY[i][1], a + half * LAY[i][1]);
      ctx3.closePath();
      ctx3.fill();
    }
    const z = p.z || 0;
    const mx = p.x + fx2 * 16, my = p.y - 14 + fy * 9 - z;
    const fr = 15 * fl;
    const fg = ctx3.createRadialGradient(mx, my, 0, mx, my, fr);
    fg.addColorStop(0, "rgba(255,248,214,0.52)");
    fg.addColorStop(0.42, cold ? "rgba(190,228,246,0.24)" : "rgba(255,148,52,0.26)");
    fg.addColorStop(1, "rgba(0,0,0,0)");
    ctx3.fillStyle = fg;
    ctx3.beginPath();
    ctx3.arc(mx, my, fr, 0, TAU6);
    ctx3.fill();
    ctx3.lineCap = "round";
    for (let k = 0; k < 7; k++) {
      const ph = k * 1.73 + time * 5.5;
      const ta = a + Math.sin(ph) * half * 0.82;
      const len = o.reach * (0.44 + (Math.sin(ph * 1.7) + 1) / 2 * 0.56);
      const ex = ox + Math.cos(ta) * len, ey = oy + Math.sin(ta) * len;
      const bx = (mx + ex) / 2 + Math.sin(ph * 2.3) * 8;
      const by = (my + ey) / 2 + Math.cos(ph * 2.1) * 8;
      const j = k % 3;
      ctx3.strokeStyle = cold ? `rgba(${210 + j * 15},${236 + j * 6},250,${0.09 + j * 0.05})` : `rgba(255,${148 + j * 44},${52 + j * 56},${0.12 + j * 0.05})`;
      ctx3.lineWidth = 6.4 - j * 1.9;
      ctx3.beginPath();
      ctx3.moveTo(mx, my);
      ctx3.quadraticCurveTo(bx, by, ex, ey);
      ctx3.stroke();
    }
    ctx3.restore();
    glow(
      ctx3,
      ox + fx2 * o.reach * 0.4,
      oy + fy * o.reach * 0.4,
      o.reach * 1.5,
      cold ? "rgba(170,215,240,0.16)" : "rgba(255,150,60,0.22)"
    );
  }
  function drawLantern(ctx3, x, y, em, time, seed) {
    const flick = 0.82 + Math.sin(time * 9.1 + seed) * 0.12 + Math.sin(time * 4.3) * 0.06;
    const lit = em * flick;
    if (em > 5e-3) {
      ctx3.save();
      ctx3.globalCompositeOperation = "lighter";
      const g = ctx3.createRadialGradient(x, y + 11, 0, x, y + 11, (13 + em * 20) * flick);
      g.addColorStop(0, `rgba(255,214,150,${0.46 * (0.3 + em * 0.7)})`);
      g.addColorStop(0.42, `rgba(255,150,60,${0.22 * (0.3 + em * 0.7)})`);
      g.addColorStop(1, "rgba(255,120,40,0)");
      ctx3.fillStyle = g;
      ctx3.beginPath();
      ctx3.arc(x, y + 11, (13 + em * 20) * flick, 0, TAU6);
      ctx3.fill();
      ctx3.restore();
    }
    const ink = "#161414", iron = "#2d2a29", edge = "#4e4845";
    ctx3.strokeStyle = ink;
    ctx3.lineWidth = 1.5;
    ctx3.lineCap = "round";
    ctx3.beginPath();
    ctx3.moveTo(x - 4.6, y + 5.5);
    ctx3.quadraticCurveTo(x, y - 0.5, x + 4.6, y + 5.5);
    ctx3.stroke();
    ctx3.fillStyle = iron;
    ctx3.fillRect(x - 1.3, y + 2.2, 2.6, 2.4);
    ctx3.beginPath();
    ctx3.moveTo(x - 4.4, y + 7.4);
    ctx3.quadraticCurveTo(x, y + 3, x + 4.4, y + 7.4);
    ctx3.closePath();
    ctx3.fill();
    ctx3.fillStyle = ink;
    ctx3.beginPath();
    ctx3.ellipse(x, y + 7.6, 5.4, 1.5, 0, 0, TAU6);
    ctx3.fill();
    ctx3.fillStyle = `rgba(255,190,110,${0.25 + lit * 0.5})`;
    for (let i = -1; i <= 1; i++) {
      ctx3.beginPath();
      ctx3.arc(x + i * 2.4, y + 6.2, 0.6, 0, TAU6);
      ctx3.fill();
    }
    ctx3.beginPath();
    ctx3.moveTo(x - 3, y + 8.4);
    ctx3.quadraticCurveTo(x - 5.4, y + 11.4, x - 3, y + 14.4);
    ctx3.lineTo(x + 3, y + 14.4);
    ctx3.quadraticCurveTo(x + 5.4, y + 11.4, x + 3, y + 8.4);
    ctx3.closePath();
    ctx3.fillStyle = em > 5e-3 ? mixHex("#3a3330", "#ffd489", 0.25 + lit * 0.75) : "rgba(126,134,138,0.42)";
    ctx3.fill();
    if (em > 5e-3) {
      ctx3.fillStyle = mixHex("#7e2410", "#fff0c4", lit);
      ctx3.beginPath();
      ctx3.ellipse(x, y + 12.2, 1.9, 2.4 + lit * 1.2, 0, 0, TAU6);
      ctx3.fill();
    } else {
      ctx3.fillStyle = "#211d1b";
      ctx3.beginPath();
      ctx3.ellipse(x, y + 12.4, 1.8, 1.4, 0, 0, TAU6);
      ctx3.fill();
    }
    ctx3.fillStyle = "rgba(255,255,255,0.22)";
    ctx3.beginPath();
    ctx3.ellipse(x - 2.4, y + 10.6, 0.9, 2.4, -0.2, 0, TAU6);
    ctx3.fill();
    ctx3.strokeStyle = ink;
    ctx3.lineWidth = 1.4;
    for (const d of [-1, 1]) {
      ctx3.beginPath();
      ctx3.moveTo(x + d * 4.4, y + 8);
      ctx3.quadraticCurveTo(x + d * 6, y + 11.4, x + d * 4.4, y + 14.8);
      ctx3.stroke();
    }
    ctx3.fillStyle = iron;
    ctx3.beginPath();
    ctx3.moveTo(x - 3.6, y + 14.4);
    ctx3.quadraticCurveTo(x - 4.6, y + 17.6, x - 3.4, y + 18.4);
    ctx3.lineTo(x + 3.4, y + 18.4);
    ctx3.quadraticCurveTo(x + 4.6, y + 17.6, x + 3.6, y + 14.4);
    ctx3.closePath();
    ctx3.fill();
    ctx3.strokeStyle = ink;
    ctx3.lineWidth = 1;
    ctx3.stroke();
    ctx3.fillStyle = edge;
    ctx3.fillRect(x - 3.2, y + 14.8, 6.4, 0.8);
    ctx3.fillStyle = "#8a6a3a";
    ctx3.beginPath();
    ctx3.arc(x + 4.4, y + 16.2, 1.1, 0, TAU6);
    ctx3.fill();
    ctx3.fillStyle = ink;
    ctx3.beginPath();
    ctx3.ellipse(x, y + 18.6, 4.4, 1.3, 0, 0, TAU6);
    ctx3.fill();
  }
  function drawToolIcon(ctx3, id, x, y, s, lit = 1) {
    ctx3.save();
    ctx3.translate(x, y);
    const k = s / 34;
    ctx3.scale(k, k);
    if (id === "lamp") {
      drawLantern(ctx3, 0, -11, lit, 0, 0);
    } else if (id === "broom") {
      ctx3.rotate(-0.42);
      ctx3.strokeStyle = "#6b4a2c";
      ctx3.lineWidth = 3;
      ctx3.lineCap = "round";
      ctx3.beginPath();
      ctx3.moveTo(0, -15);
      ctx3.lineTo(0, 7);
      ctx3.stroke();
      ctx3.strokeStyle = "#c8a05a";
      ctx3.lineWidth = 1.8;
      for (let i = -4; i <= 4; i++) {
        ctx3.beginPath();
        ctx3.moveTo(i * 0.6, 5);
        ctx3.lineTo(i * 2.2, 15 - Math.abs(i) * 0.6);
        ctx3.stroke();
      }
      ctx3.strokeStyle = "#8a5f34";
      ctx3.lineWidth = 2;
      ctx3.beginPath();
      ctx3.moveTo(-3, 4);
      ctx3.lineTo(3, 4);
      ctx3.stroke();
    } else {
      ctx3.fillStyle = "#c08a5a";
      ctx3.beginPath();
      ctx3.ellipse(0, 3, 6, 7, 0, 0, TAU6);
      ctx3.fill();
      ctx3.strokeStyle = "#c08a5a";
      ctx3.lineWidth = 2.6;
      ctx3.lineCap = "round";
      for (let i = -1; i <= 2; i++) {
        ctx3.beginPath();
        ctx3.moveTo(i * 3.2, -1);
        ctx3.lineTo(i * 3.6, -9 + Math.abs(i) * 1.6);
        ctx3.stroke();
      }
      ctx3.beginPath();
      ctx3.moveTo(-5, 3);
      ctx3.lineTo(-9, -2);
      ctx3.stroke();
    }
    ctx3.restore();
  }
  function drawWoman(ctx3, o, time) {
    const x = o.x, y = o.y;
    const breath = Math.sin(time * 0.9) * 0.8;
    const look = clamp012((o.look === void 0 ? 0 : o.look) * 0.5 + 0.5) * 2 - 1;
    const lx = look * 2.2;
    ctx3.fillStyle = "rgba(0,0,0,0.28)";
    ctx3.beginPath();
    ctx3.ellipse(x + 2, y + 5, 19, 7.5, 0, 0, TAU6);
    ctx3.fill();
    ctx3.fillStyle = "#8a5426";
    ctx3.beginPath();
    ctx3.moveTo(x - 19, y + 4);
    ctx3.quadraticCurveTo(x, y - 2, x + 19, y + 4);
    ctx3.quadraticCurveTo(x + 14, y + 8, x, y + 8);
    ctx3.quadraticCurveTo(x - 14, y + 8, x - 19, y + 4);
    ctx3.closePath();
    ctx3.fill();
    ctx3.fillStyle = "#a8652c";
    ctx3.beginPath();
    ctx3.moveTo(x - 18, y + 5);
    ctx3.quadraticCurveTo(x - 15, y - 14, x - 11, y - 24 + breath);
    ctx3.lineTo(x + 11, y - 24 + breath);
    ctx3.quadraticCurveTo(x + 15, y - 14, x + 18, y + 5);
    ctx3.closePath();
    ctx3.fill();
    ctx3.strokeStyle = "rgba(64,34,14,0.3)";
    ctx3.lineWidth = 0.8;
    for (let i = -3; i <= 3; i++) {
      ctx3.beginPath();
      ctx3.moveTo(x + i * 4.6, y - 21 + breath);
      ctx3.quadraticCurveTo(x + i * 5.6, y - 8, x + i * 6.4, y + 4);
      ctx3.stroke();
    }
    ctx3.fillStyle = "#fff3dc";
    ctx3.beginPath();
    ctx3.ellipse(x, y - 13 + breath, 9.5, 8.5, 0, 0, TAU6);
    ctx3.fill();
    ctx3.strokeStyle = "rgba(150,108,70,0.34)";
    ctx3.lineWidth = 0.6;
    for (let i = 1; i <= 2; i++) {
      ctx3.beginPath();
      ctx3.ellipse(x, y - 13 + breath, 2.8 * i, 2.4 * i, 0, 0, TAU6);
      ctx3.stroke();
    }
    ctx3.fillStyle = "#e04a2c";
    ctx3.beginPath();
    ctx3.moveTo(x - 10.5, y - 6 + breath);
    ctx3.quadraticCurveTo(x, y - 3.4 + breath, x + 10.5, y - 6 + breath);
    ctx3.lineTo(x + 10.5, y - 2.4 + breath);
    ctx3.quadraticCurveTo(x, y + 0.2 + breath, x - 10.5, y - 2.4 + breath);
    ctx3.closePath();
    ctx3.fill();
    ctx3.fillStyle = "#f5c02a";
    for (let i = -3; i <= 3; i++) {
      ctx3.beginPath();
      ctx3.arc(x + i * 2.9, y - 3.6 + breath + Math.abs(i) * 0.22, 0.7, 0, TAU6);
      ctx3.fill();
    }
    ctx3.strokeStyle = "#74441d";
    ctx3.lineWidth = 5.2;
    ctx3.lineCap = "round";
    for (const s of [-1, 1]) {
      ctx3.beginPath();
      ctx3.moveTo(x + s * 9, y - 17 + breath);
      ctx3.quadraticCurveTo(x + s * 14, y - 10 + breath, x + s * 9.5, y - 4.5 + breath);
      ctx3.stroke();
    }
    ctx3.strokeStyle = "#fff3dc";
    ctx3.lineWidth = 1.6;
    for (const s of [-1, 1]) {
      ctx3.beginPath();
      ctx3.moveTo(x + s * 11.4, y - 6.6 + breath);
      ctx3.lineTo(x + s * 7.8, y - 5 + breath);
      ctx3.stroke();
    }
    ctx3.strokeStyle = "#b5763f";
    ctx3.lineWidth = 3.6;
    for (const s of [-1, 1]) {
      ctx3.beginPath();
      ctx3.moveTo(x + s * 9, y - 5 + breath);
      ctx3.quadraticCurveTo(x + s * 6, y - 1 + breath, x + s * 1.6, y - 1.2 + breath);
      ctx3.stroke();
    }
    ctx3.fillStyle = "#c08a52";
    ctx3.beginPath();
    ctx3.ellipse(x, y - 1 + breath, 3.4, 2.4, 0, 0, TAU6);
    ctx3.fill();
    const hy = y - 30 + breath;
    ctx3.fillStyle = "#8a5426";
    ctx3.beginPath();
    ctx3.moveTo(x - 12, y - 19);
    ctx3.quadraticCurveTo(x - 13.5, hy - 10, x, hy - 11.5);
    ctx3.quadraticCurveTo(x + 13.5, hy - 10, x + 12, y - 19);
    ctx3.closePath();
    ctx3.fill();
    ctx3.fillStyle = "#c08a52";
    ctx3.beginPath();
    ctx3.ellipse(x + lx, hy, 6.4, 7.4, 0, 0, TAU6);
    ctx3.fill();
    ctx3.fillStyle = "#ece4d8";
    ctx3.beginPath();
    ctx3.moveTo(x + lx - 6.2, hy - 2.6);
    ctx3.quadraticCurveTo(x + lx, hy - 9.4, x + lx + 6.2, hy - 2.6);
    ctx3.quadraticCurveTo(x + lx, hy - 5.4, x + lx - 6.2, hy - 2.6);
    ctx3.closePath();
    ctx3.fill();
    ctx3.strokeStyle = "rgba(150,140,126,0.55)";
    ctx3.lineWidth = 0.5;
    for (let i = -2; i <= 2; i++) {
      ctx3.beginPath();
      ctx3.moveTo(x + lx + i * 1.1, hy - 7.4 + Math.abs(i) * 0.9);
      ctx3.lineTo(x + lx + i * 2.3, hy - 3.6 + Math.abs(i) * 0.3);
      ctx3.stroke();
    }
    ctx3.strokeStyle = "#2a1a10";
    ctx3.lineWidth = 0.95;
    ctx3.lineCap = "round";
    for (const s of [-1, 1]) {
      ctx3.beginPath();
      ctx3.moveTo(x + lx + s * 0.9, hy - 2.5);
      ctx3.quadraticCurveTo(x + lx + s * 2.6, hy - 3.5, x + lx + s * 4.1, hy - 2.3);
      ctx3.stroke();
    }
    for (const s of [-1, 1]) {
      ctx3.fillStyle = "#fff3dc";
      ctx3.beginPath();
      ctx3.ellipse(x + lx + s * 2.5, hy - 0.2, 2, 1.45, 0, 0, TAU6);
      ctx3.fill();
      ctx3.fillStyle = "#120c12";
      ctx3.beginPath();
      ctx3.arc(x + lx + s * 2.5 + lx * 0.25, hy - 0.2, 1.05, 0, TAU6);
      ctx3.fill();
      ctx3.strokeStyle = "#3b291c";
      ctx3.lineWidth = 0.45;
      ctx3.beginPath();
      ctx3.ellipse(x + lx + s * 2.5, hy - 0.2, 2, 1.45, 0, 0, TAU6);
      ctx3.stroke();
    }
    ctx3.strokeStyle = "#8a5a34";
    ctx3.lineWidth = 0.7;
    ctx3.beginPath();
    ctx3.moveTo(x + lx - 1.6, hy + 3.2);
    ctx3.quadraticCurveTo(x + lx, hy + 4, x + lx + 1.6, hy + 3.2);
    ctx3.stroke();
    for (const s of [-1, 1]) {
      ctx3.strokeStyle = "#fff3dc";
      ctx3.lineWidth = 5.4;
      ctx3.lineCap = "butt";
      ctx3.beginPath();
      ctx3.moveTo(x + s * 11.5, y - 18);
      ctx3.quadraticCurveTo(x + s * 11.2, hy - 6, x + s * 3.4, hy - 9.6);
      ctx3.stroke();
      ctx3.strokeStyle = "#e04a2c";
      ctx3.lineWidth = 3.4;
      ctx3.beginPath();
      ctx3.moveTo(x + s * 11.5, y - 18);
      ctx3.quadraticCurveTo(x + s * 11.2, hy - 6, x + s * 3.4, hy - 9.6);
      ctx3.stroke();
      ctx3.fillStyle = "#f5c02a";
      for (let i = 0; i <= 5; i++) {
        const u = i / 5, v = 1 - u;
        const px = v * v * (x + s * 11.5) + 2 * v * u * (x + s * 11.2) + u * u * (x + s * 3.4);
        const py = v * v * (y - 18) + 2 * v * u * (hy - 6) + u * u * (hy - 9.6);
        ctx3.beginPath();
        ctx3.arc(px, py, 0.75, 0, TAU6);
        ctx3.fill();
      }
    }
    ctx3.lineCap = "round";
    ctx3.save();
    ctx3.globalCompositeOperation = "lighter";
    const g = ctx3.createLinearGradient(x - 6, 0, x + 20, 0);
    g.addColorStop(0, "rgba(255,150,60,0)");
    g.addColorStop(1, `rgba(255,150,60,${0.1 + Math.sin(time * 7.1) * 0.02})`);
    ctx3.fillStyle = g;
    ctx3.beginPath();
    ctx3.moveTo(x - 18, y + 5);
    ctx3.quadraticCurveTo(x - 15, y - 16, x, hy - 11);
    ctx3.quadraticCurveTo(x + 15, y - 16, x + 18, y + 5);
    ctx3.closePath();
    ctx3.fill();
    ctx3.restore();
  }
  function drawFire(ctx3, f, time, alive = 1) {
    if (alive <= 0.02) return;
    const flick = 0.78 + Math.sin(time * 8.3) * 0.13 + Math.sin(time * 3.7) * 0.09;
    glow(ctx3, f.x, f.y - 6, 150 * alive * flick, `rgba(255,150,60,${0.4 * alive})`);
    ctx3.fillStyle = "#3a2a20";
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7;
      ctx3.save();
      ctx3.translate(f.x, f.y);
      ctx3.rotate(a);
      ctx3.fillRect(-11, -2, 22, 4);
      ctx3.restore();
    }
    ctx3.fillStyle = `rgba(255,164,72,${alive * flick})`;
    ctx3.beginPath();
    ctx3.ellipse(f.x, f.y - 8, 7, 12 * flick, 0, 0, TAU6);
    ctx3.fill();
    ctx3.fillStyle = `rgba(255,240,190,${alive * flick})`;
    ctx3.beginPath();
    ctx3.ellipse(f.x, f.y - 6, 3.2, 6 * flick, 0, 0, TAU6);
    ctx3.fill();
  }
  function glow(ctx3, x, y, r, col) {
    const g = ctx3.createRadialGradient(x, y, r * 0.03, x, y, r);
    g.addColorStop(0, col);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx3.save();
    ctx3.globalCompositeOperation = "lighter";
    ctx3.fillStyle = g;
    ctx3.beginPath();
    ctx3.arc(x, y, r, 0, TAU6);
    ctx3.fill();
    ctx3.restore();
  }
  function drawMural(ctx3, id, W3, H3, time) {
    const painted = img(`mural-${id}`);
    if (painted) {
      cover(ctx3, painted, 0, 0, W3, H3);
      return;
    }
    ctx3.save();
    ctx3.fillStyle = "#efe0c0";
    ctx3.fillRect(0, 0, W3, H3);
    ctx3.globalAlpha = 0.5;
    motif(ctx3, { x: 0, y: 0, w: W3, h: H3 }, "dots", "rgba(140,105,60,0.35)", 13);
    ctx3.globalAlpha = 1;
    const m = Math.max(7, Math.round(Math.min(W3, H3) * 0.035));
    frame(ctx3, W3, H3, m, { fill: G.geru, motif: "crescents", on: "rgba(245,225,190,0.8)", pitch: 11, lw: 2 });
    const S2 = Math.min((W3 - m * 2) / 430, (H3 - m * 2) / 250);
    ctx3.save();
    ctx3.translate(W3 / 2, H3 * 0.54);
    ctx3.scale(S2, S2);
    const ground2 = () => {
      band(ctx3, -215, 86, 430, 16, { fill: G.mitti, motif: "waves", on: "rgba(245,225,190,0.55)", pitch: 7, lw: 2 });
    };
    const sun = (x, y, r) => disc(ctx3, x, y, r, {
      fill: G.haldi,
      motif: "dots",
      on: "rgba(120,60,20,0.45)",
      pitch: 10,
      rays: 18,
      spin: time * 0.04,
      lw: 1.8
    });
    if (id === "choice") {
      sun(-150, -66, 26);
      ground2();
      gFigure(ctx3, -66, 0, 1, "savitri", time);
      gFigure(ctx3, 42, 0, 1, "satyavan", time);
      gFigure(ctx3, 146, 4, 0.82, "narada", time);
      ctx3.strokeStyle = G.geru;
      ctx3.lineWidth = 2.4;
      ctx3.beginPath();
      ctx3.moveTo(-40, -18);
      ctx3.quadraticCurveTo(-4, 6, 22, -18);
      ctx3.stroke();
      for (let i = 0; i < 7; i++) {
        const k = i / 6, x = -40 + k * 62, y = -18 + Math.sin(k * Math.PI) * 22;
        ctx3.fillStyle = i % 2 ? G.haldi : G.chuna;
        ctx3.beginPath();
        ctx3.arc(x, y, 4, 0, TAU6);
        ctx3.fill();
      }
    } else if (id === "fall") {
      gTree(ctx3, -120, 10, 1.15, time);
      gTree(ctx3, 150, 6, 0.9, time);
      ground2();
      gFigure(ctx3, -30, 0, 1, "savitri", time, { kneel: 1 });
      ctx3.save();
      ctx3.translate(58, 62);
      ctx3.rotate(-1.42);
      gFigure(ctx3, 0, 0, 0.94, "satyavan", time, { lying: 1 });
      ctx3.restore();
      limb(ctx3, [[96, 78], [124, 70]], 3, 3, { fill: G.mitti, ink: true });
    } else if (id === "pursuit") {
      ground2();
      gFigure(ctx3, 96, -6, 1.24, "yama", time);
      gFigure(ctx3, -104, 2, 0.98, "savitri", time, { walk: 1 });
      ctx3.strokeStyle = G.geru;
      ctx3.lineWidth = 2.4;
      ctx3.beginPath();
      ctx3.moveTo(52, -14);
      ctx3.lineTo(-4, 2);
      ctx3.stroke();
      blob(ctx3, -10, 4, 11, 11, 0, { fill: G.haldiPale, motif: "dots", on: "rgba(140,70,20,0.5)", pitch: 6, lw: 2 });
      for (let i = 0; i < 5; i++) {
        bird(
          ctx3,
          -170 + i * 26,
          -72 + i % 2 * 14,
          8,
          { fill: G.soot, motif: null, lw: 1.6 }
        );
      }
    } else if (id === "steps") {
      ground2();
      gFigure(ctx3, 78, -4, 1.2, "yama", time);
      gFigure(ctx3, -96, 2, 0.98, "savitri", time, { walk: 1 });
      for (let i = 0; i < 7; i++) {
        const x = -60 + i * 20;
        ctx3.fillStyle = i % 2 ? G.geru : G.mitti;
        ctx3.beginPath();
        ctx3.ellipse(x, 92 + i % 2 * 6, 5, 7, 0, 0, TAU6);
        ctx3.fill();
        ctx3.strokeStyle = G.soot;
        ctx3.lineWidth = 1.2;
        ctx3.stroke();
      }
    } else if (id === "boon") {
      ground2();
      gFigure(ctx3, 86, -4, 1.2, "yama", time, { giving: 1 });
      gFigure(ctx3, -92, 2, 0.98, "savitri", time);
      for (let i = 0; i < 9; i++) {
        const k = i / 8, x = 34 - k * 96, y = -22 - Math.sin(k * Math.PI) * 18;
        ctx3.fillStyle = G.haldi;
        ctx3.beginPath();
        ctx3.arc(x, y, 2 + k * 2.6, 0, TAU6);
        ctx3.fill();
      }
      sun(-92, -74, 20);
    } else if (id === "bloom") {
      sun(0, -78, 34);
      ground2();
      gTree(ctx3, 0, 14, 1.9, time);
      for (let i = 0; i < 22; i++) {
        const a = i / 22 * TAU6 + time * 0.05;
        const r = 58 + i * 37 % 11 * 7;
        leaf(
          ctx3,
          Math.cos(a) * r,
          -26 + Math.sin(a) * r * 0.62,
          11,
          6,
          a,
          { fill: i % 3 ? G.patta : G.haldi, motif: null, lw: 1.4 }
        );
      }
      gFigure(ctx3, -118, 6, 0.9, "savitri", time);
      gFigure(ctx3, -54, 6, 0.9, "satyavan", time);
    }
    ctx3.restore();
    ctx3.restore();
  }
  function gFigure(ctx3, x, y, s, who, time, o = {}) {
    const P3 = {
      savitri: { cloth: G.geru, motif: "dotLines", on: "rgba(245,225,190,0.8)", hair: "#160f12" },
      satyavan: { cloth: G.patta, motif: "shoots", on: "rgba(240,235,200,0.6)", hair: "#1a1410" },
      narada: { cloth: G.haldi, motif: "seeds", on: "rgba(70,40,20,0.5)", hair: "#efe7d6" },
      yama: { cloth: G.neelDark, motif: "scales", on: "rgba(150,180,235,0.5)", hair: "#0d0912" }
    }[who] || { cloth: G.mitti, motif: "comb", on: "rgba(240,227,200,0.5)", hair: "#ded6c6" };
    const big = who === "yama";
    ctx3.save();
    ctx3.translate(x, y);
    ctx3.scale(s, s);
    if (o.lying) ctx3.scale(1, 0.92);
    const hy = o.kneel ? -18 : -52;
    const foot = 86;
    field(ctx3, (g) => {
      const w = big ? 40 : 30, wl = big ? 34 : 24;
      g.moveTo(-w, foot);
      g.quadraticCurveTo(-wl - 4, hy + 34, -wl, hy + 22);
      g.lineTo(wl, hy + 22);
      g.quadraticCurveTo(wl + 4, hy + 34, w, foot);
      g.closePath();
    }, { fill: P3.cloth, motif: P3.motif, on: P3.on, pitch: big ? 11 : 9, lw: 2, box: { x: -46, y: hy, w: 92, h: foot - hy + 6 } });
    const reach = o.giving ? 44 : o.walk ? 20 : 26;
    limb(
      ctx3,
      [[-22, hy + 28], [-34, hy + 52], [-30 - (o.walk ? 8 : 0), hy + 74]],
      5,
      4,
      { fill: G.skin, motif: null, lw: 1.8 }
    );
    limb(
      ctx3,
      [[22, hy + 28], [30, hy + 46], [18 + reach, hy + 52]],
      5,
      4,
      { fill: G.skin, motif: null, lw: 1.8 }
    );
    if (o.walk) {
      limb(ctx3, [[-8, foot - 6], [-20, foot + 14]], 5, 4, { fill: G.skin, lw: 1.8 });
      limb(ctx3, [[10, foot - 6], [24, foot + 14]], 5, 4, { fill: G.skin, lw: 1.8 });
    }
    blob(
      ctx3,
      0,
      hy,
      big ? 24 : 20,
      big ? 26 : 22,
      0,
      { fill: big ? "#4a3f63" : G.skin, motif: big ? "dots" : null, on: "rgba(150,180,235,0.35)", pitch: 9, lw: 2 }
    );
    field(ctx3, (g) => {
      g.moveTo(-20, hy - 2);
      g.quadraticCurveTo(-22, hy - 28, 0, hy - 28);
      g.quadraticCurveTo(22, hy - 28, 20, hy - 2);
      g.quadraticCurveTo(12, hy - 14, 0, hy - 14);
      g.quadraticCurveTo(-12, hy - 14, -20, hy - 2);
      g.closePath();
    }, { fill: P3.hair, motif: "crescents", on: "rgba(210,190,220,0.4)", pitch: 7, lw: 1.6, box: { x: -24, y: hy - 30, w: 48, h: 34 } });
    ctx3.fillStyle = G.chuna;
    ctx3.beginPath();
    ctx3.arc(-7, hy, 4.4, 0, TAU6);
    ctx3.arc(7, hy, 4.4, 0, TAU6);
    ctx3.fill();
    ctx3.fillStyle = G.soot;
    ctx3.beginPath();
    ctx3.arc(-7, hy, 2.2, 0, TAU6);
    ctx3.arc(7, hy, 2.2, 0, TAU6);
    ctx3.fill();
    ctx3.strokeStyle = G.soot;
    ctx3.lineWidth = 1.4;
    ctx3.beginPath();
    ctx3.moveTo(0, hy + 5);
    ctx3.lineTo(0, hy + 10);
    ctx3.stroke();
    ctx3.beginPath();
    ctx3.moveTo(-5, hy + 14);
    ctx3.quadraticCurveTo(0, hy + 17, 5, hy + 14);
    ctx3.stroke();
    if (big) {
      for (const sgn of [-1, 1]) {
        limb(
          ctx3,
          [[sgn * 20, hy - 16], [sgn * 38, hy - 26], [sgn * 47, hy - 10]],
          6,
          2,
          { fill: G.chuna, motif: null, lw: 1.8 }
        );
      }
    }
    if (who === "savitri") {
      limb(
        ctx3,
        [[18, hy - 4], [28, hy + 20], [24, hy + 52]],
        5,
        3,
        { fill: P3.hair, motif: null, lw: 1.6 }
      );
    }
    ctx3.restore();
  }
  function gTree(ctx3, x, y, s, time) {
    ctx3.save();
    ctx3.translate(x, y);
    ctx3.scale(s, s);
    limb(
      ctx3,
      [[0, 88], [-4, 40], [0, -4]],
      13,
      8,
      { fill: G.mitti, motif: "comb", on: "rgba(245,225,190,0.45)", pitch: 6, lw: 2 }
    );
    for (let i = 0; i < 6; i++) {
      const a = -2.5 + i * 0.5;
      const ex = Math.cos(a) * 54, ey = -10 + Math.sin(a) * 40;
      limb(
        ctx3,
        [[0, -2], [ex * 0.55, ey * 0.7], [ex, ey]],
        5,
        3,
        { fill: G.mitti, motif: null, lw: 1.8 }
      );
      for (let k = 0; k < 3; k++) {
        const b = a + (k - 1) * 0.42 + Math.sin(time * 0.4 + i) * 0.04;
        leaf(
          ctx3,
          ex + Math.cos(b) * 16,
          ey + Math.sin(b) * 13,
          13,
          7,
          b,
          { fill: k === 1 ? G.patta : G.pattaDark, motif: "comb", on: "rgba(240,240,200,0.45)", pitch: 4, lw: 1.4 }
        );
      }
    }
    ctx3.restore();
  }
  function mixHex(a, b, k) {
    k = clamp012(k);
    const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
    const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
    return `rgb(${Math.round(mix2(pa[0], pb[0], k))},${Math.round(mix2(pa[1], pb[1], k))},${Math.round(mix2(pa[2], pb[2], k))})`;
  }

  // savi/src/savi-faces.js
  var TAU7 = Math.PI * 2;
  var W2 = 220;
  var H2 = 300;
  function blinkAt(t, seed) {
    const cycle = 4.6 + seed * 1.7;
    const k = (t + seed * 3.1) % cycle;
    return k < 0.17 ? Math.sin(k / 0.17 * Math.PI) : 0;
  }
  var GROUND = {
    savitri: "#15071c",
    satyavan: "#07160e",
    yama: "#16060c",
    narada: "#1a0f04",
    keeper: "#120c0a"
  };
  function drawPortrait(ctx3, who, x, y, s, t, k = 1, emph = 0, mood = null) {
    const face = img(`${who}-${mood || DEFAULT_MOOD[who] || "speaking"}`) || img(`${who}-${DEFAULT_MOOD[who] || "speaking"}`);
    if (face) {
      const h = s * (H2 / W2);
      const breath2 = Math.sin(t * 1.3) * 4e-3;
      const lean2 = emph * emph;
      ctx3.save();
      ctx3.globalAlpha = k;
      ctx3.translate(x + s / 2, y + h);
      ctx3.scale(1 + lean2 * 0.03 + breath2, 1 + lean2 * 0.045 - breath2);
      ctx3.rotate(Math.sin(t * 0.7) * 8e-3 + lean2 * 0.012);
      ctx3.translate(-s / 2, -h + (1 - k) * 30);
      cover(ctx3, face, 0, 0, s, h);
      ctx3.restore();
      return;
    }
    ctx3.save();
    ctx3.translate(x, y + (1 - k) * 30);
    ctx3.scale(s / W2, s / W2);
    ctx3.globalAlpha = k;
    ctx3.fillStyle = GROUND[who] || GROUND.keeper;
    ctx3.fillRect(0, 0, W2, H2);
    ctx3.save();
    ctx3.beginPath();
    ctx3.rect(0, 0, W2, H2);
    ctx3.clip();
    motif(ctx3, { x: -8, y: -8, w: W2 + 16, h: H2 + 16 }, "dots", "rgba(255,243,220,0.07)", 13);
    ctx3.restore();
    const breath = Math.sin(t * 1.3) * 2.2;
    const lean = emph * emph;
    ctx3.translate(W2 / 2, H2);
    ctx3.scale(1 + lean * 0.028, 1 + lean * 0.042);
    ctx3.rotate(Math.sin(t * 0.7) * 9e-3 + lean * 0.014);
    ctx3.translate(-W2 / 2, -H2 + breath);
    ({ savitri, satyavan, yama, narada }[who] || keeper)(ctx3, t, emph);
    ctx3.restore();
  }
  function head(c, cx, cy, rx, ry, skin, on) {
    blob(c, cx, cy, rx, ry, 0, {
      fill: skin,
      mark: "dot",
      on: on || "rgba(120,45,15,0.3)",
      rows: 4,
      along: 30,
      ms: 2.2,
      lw: 2.6
    });
  }
  function features(c, cx, cy, sc, t, emph, o = {}) {
    const bl = blinkAt(t, o.seed || 1);
    eye(c, cx - 17 * sc, cy, 13 * sc, 9.5 * sc, Math.sin(t * 0.33) * 0.4, bl);
    eye(c, cx + 17 * sc, cy, 13 * sc, 9.5 * sc, Math.sin(t * 0.33) * 0.4, bl);
    c.strokeStyle = G.soot;
    c.lineWidth = 2.6 * sc;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(cx - 33 * sc, cy - 14 * sc);
    c.quadraticCurveTo(cx - 17 * sc, cy - 22 * sc, cx - 3 * sc, cy - 13 * sc);
    c.moveTo(cx + 33 * sc, cy - 14 * sc);
    c.quadraticCurveTo(cx + 17 * sc, cy - 22 * sc, cx + 3 * sc, cy - 13 * sc);
    c.stroke();
    c.lineWidth = 1.9 * sc;
    c.beginPath();
    c.moveTo(cx - 1 * sc, cy - 4 * sc);
    c.lineTo(cx - 2.5 * sc, cy + 18 * sc);
    c.quadraticCurveTo(cx + 1.5 * sc, cy + 21 * sc, cx + 5 * sc, cy + 17 * sc);
    c.stroke();
    const open = (o.open || 1.4) + emph * 2.6;
    c.lineWidth = 2.2 * sc;
    c.strokeStyle = o.lip || "#b02a2a";
    c.beginPath();
    c.moveTo(cx - 10 * sc, cy + 30 * sc);
    c.quadraticCurveTo(cx, cy + (30 + open * 2) * sc, cx + 10 * sc, cy + 30 * sc);
    c.stroke();
    c.lineCap = "butt";
  }
  function beads(c, x0, y0, x1, y1, n, r, col) {
    for (let i = 0; i < n; i++) {
      const k = n === 1 ? 0.5 : i / (n - 1);
      const x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k + Math.sin(k * Math.PI) * 5;
      c.fillStyle = col;
      c.beginPath();
      c.arc(x, y, r, 0, TAU7);
      c.fill();
      c.strokeStyle = G.soot;
      c.lineWidth = 1.1;
      c.stroke();
    }
  }
  function torso(c, cx, tilt, o) {
    const spine = [
      [cx + tilt * 10, H2 + 10],
      [cx + tilt * 6, 262],
      [cx + tilt * 2, 224],
      [cx, 190],
      [cx - tilt * 3, 168]
    ];
    paint(c, ribbon(spine, 86, 40, 0.06), {
      mark: "dot",
      rows: 5,
      along: 26,
      ms: 2.4,
      lw: 2.8,
      ...o
    });
  }
  function savitri(c, t, emph) {
    const cx = W2 / 2 - 4, cy = 108;
    const sway = Math.sin(t * 0.8) * 3;
    disc(c, cx + 6, cy - 12, 72, {
      fill: G.haldi,
      fill2: G.kesar,
      band: 0.55,
      mark: "dot",
      on: "rgba(150,40,10,0.5)",
      rows: 4,
      along: 34,
      ms: 2.6,
      rays: 26,
      spin: t * 0.04,
      rayCol: G.kesar,
      lw: 2
    });
    torso(c, cx, 0.9, {
      fill: G.geru,
      fill2: G.gulabi,
      band: 0.2,
      mark: "dot",
      on: "rgba(255,243,220,0.9)",
      rows: 6,
      along: 30,
      ms: 2.4
    });
    paint(c, ribbon([[cx - 74, H2 + 8], [cx - 60, 250], [cx - 34, 208], [cx + 4, 182], [cx + 40, 176]], 26, 12), {
      fill: G.jamun,
      mark: "crescent",
      on: "rgba(255,222,122,0.9)",
      rows: 3,
      along: 22,
      ms: 3.4,
      mlw: 1.6,
      lw: 2.4
    });
    paint(c, ribbon([[cx - 92, 288], [cx, 280], [cx + 92, 290]], 12, 12), {
      fill: G.haldi,
      mark: "scale",
      on: "rgba(160,40,10,0.8)",
      rows: 2,
      along: 20,
      ms: 4,
      mlw: 1.6,
      lw: 2.2
    });
    const lift = emph * 9;
    limb(
      c,
      [[cx - 40, 196], [cx - 72, 228], [cx - 82, 272]],
      10,
      7,
      { fill: G.skin, mark: "dot", on: "rgba(120,45,15,0.4)", rows: 2, along: 14, ms: 2, lw: 2.2 }
    );
    limb(
      c,
      [[cx + 40, 194], [cx + 80, 214 - lift], [cx + 92, 172 - lift]],
      10,
      7,
      { fill: G.skin, mark: "dot", on: "rgba(120,45,15,0.4)", rows: 2, along: 14, ms: 2, lw: 2.2 }
    );
    blob(
      c,
      cx + 94,
      160 - lift,
      13,
      16,
      -0.15,
      { fill: G.skin, mark: "dot", on: "rgba(120,45,15,0.4)", rows: 2, along: 12, ms: 1.8, lw: 2.2 }
    );
    beads(c, cx + 74, 204 - lift, cx + 86, 186 - lift, 3, 3.6, G.hara);
    beads(c, cx - 76, 254, cx - 82, 266, 3, 3.6, G.hara);
    limb(
      c,
      [[cx, 146], [cx, 184]],
      15,
      22,
      { fill: G.skinDark, mark: "dot", on: "rgba(120,45,15,0.35)", rows: 2, along: 8, ms: 2, lw: 2.2 }
    );
    head(c, cx, cy, 45, 52, G.skin);
    paint(c, { closed: false, at: (u, v) => {
      const a = Math.PI + u * Math.PI;
      return [cx + Math.cos(a) * 48 * (0.72 + 0.28 * v), cy + Math.sin(a) * 54 * (0.72 + 0.28 * v) - 6];
    } }, {
      fill: "#160d16",
      mark: "crescent",
      on: "rgba(224,65,126,0.75)",
      rows: 3,
      along: 24,
      ms: 3.6,
      mlw: 1.6,
      lw: 2.4
    });
    paint(c, ribbon([
      [cx + 38, cy + 4],
      [cx + 66, cy + 48],
      [cx + 74 + sway, cy + 106],
      [cx + 58 + sway, cy + 156],
      [cx + 40 + sway, cy + 186]
    ], 11, 4), {
      fill: "#160d16",
      mark: "crescent",
      on: "rgba(224,65,126,0.7)",
      rows: 2,
      along: 22,
      ms: 3,
      mlw: 1.5,
      lw: 2.2
    });
    for (let i = 0; i < 5; i++) {
      const yy = cy + 58 + i * 28;
      const s2 = i & 1 ? 1 : -1;
      leaf(c, cx + 78 + sway + s2 * 13, yy, 14, 7, 0.5 * s2 + 0.3, {
        fill: i % 2 ? G.patta : G.hara,
        mark: "tick",
        on: "rgba(255,243,220,0.8)",
        rows: 1,
        along: 6,
        ms: 2.4,
        mlw: 1.3,
        lw: 1.6
      });
    }
    blob(c, cx + 40 + sway, cy + 196, 9, 9, 0, { fill: G.gulabi, mark: "dot", on: "rgba(255,243,220,0.9)", rows: 1, along: 7, ms: 1.8, lw: 1.8 });
    features(c, cx, cy + 2, 1, t, emph, { seed: 1.3, lip: "#c02040" });
    c.fillStyle = G.gulabi;
    c.beginPath();
    c.arc(cx, cy - 30, 5, 0, TAU7);
    c.fill();
    c.strokeStyle = G.haldi;
    c.lineWidth = 2.2;
    c.beginPath();
    c.arc(cx - 13, cy + 19, 10, -0.5, 2.5);
    c.stroke();
    blob(c, cx - 48, cy + 15, 9, 13, 0, { fill: G.haldi, mark: "dot", on: "rgba(160,40,10,0.6)", rows: 1, along: 8, ms: 1.7, lw: 1.8 });
    blob(c, cx + 48, cy + 15, 9, 13, 0, { fill: G.haldi, mark: "dot", on: "rgba(160,40,10,0.6)", rows: 1, along: 8, ms: 1.7, lw: 1.8 });
    beads(c, cx - 36, 172, cx + 36, 172, 11, 4, G.hara);
    beads(c, cx - 26, 188, cx + 26, 188, 8, 3.2, G.haldi);
  }
  function satyavan(c, t, emph) {
    const cx = W2 / 2 + 4, cy = 112;
    const sway = Math.sin(t * 0.6) * 0.04;
    c.save();
    c.translate(cx - 6, 262);
    c.rotate(sway * 0.3);
    paint(c, ribbon([[0, 0], [-5, -62], [3, -126]], 16, 8), {
      fill: G.mitti,
      mark: "dash",
      on: "rgba(255,243,220,0.6)",
      rows: 3,
      along: 18,
      ms: 3.4,
      mlw: 1.4,
      lw: 2.4
    });
    for (let i = 0; i < 7; i++) {
      const a = -2.8 + i * 0.44;
      const ex = Math.cos(a) * 92, ey = -120 + Math.sin(a) * 62;
      paint(c, ribbon([[0, -118], [ex * 0.5, ey * 0.55 - 44], [ex, ey]], 6, 3), {
        fill: G.mitti,
        mark: "dot",
        on: "rgba(255,243,220,0.5)",
        rows: 1,
        along: 10,
        ms: 1.6,
        lw: 1.8
      });
      for (let j = 0; j < 2; j++) {
        const b = a + (j - 0.5) * 0.52;
        leaf(c, ex + Math.cos(b) * 16, ey + Math.sin(b) * 14, 16, 8, b, {
          fill: j ? G.patta : G.hara,
          mark: "tick",
          on: "rgba(255,243,220,0.8)",
          rows: 1,
          along: 7,
          ms: 2.6,
          mlw: 1.3,
          lw: 1.6
        });
      }
    }
    c.restore();
    torso(c, cx, -0.8, {
      fill: G.skin,
      fill2: G.skinDark,
      band: 0.1,
      mark: "shoot",
      on: "rgba(82,184,74,0.75)",
      rows: 4,
      along: 16,
      ms: 4,
      mlw: 1.4
    });
    paint(c, ribbon([[cx - 88, H2 + 10], [cx, 264], [cx + 88, H2 + 10]], 26, 26), {
      fill: G.patta,
      mark: "dash",
      on: "rgba(255,243,220,0.8)",
      rows: 3,
      along: 26,
      ms: 3.2,
      mlw: 1.5,
      lw: 2.6
    });
    paint(c, ribbon([[cx - 66, 192], [cx - 10, 232], [cx + 48, 268]], 11, 11), {
      fill: G.kesar,
      mark: "seed",
      on: "rgba(60,25,5,0.65)",
      rows: 2,
      along: 16,
      ms: 3,
      lw: 2.2
    });
    limb(
      c,
      [[cx - 40, 198], [cx - 74, 232], [cx - 66, 274]],
      11,
      7,
      { fill: G.skin, mark: "dot", on: "rgba(120,45,15,0.4)", rows: 2, along: 14, ms: 2, lw: 2.2 }
    );
    limb(
      c,
      [[cx + 40, 196], [cx + 78, 208], [cx + 72 - emph * 5, 168]],
      11,
      7,
      { fill: G.skin, mark: "dot", on: "rgba(120,45,15,0.4)", rows: 2, along: 14, ms: 2, lw: 2.2 }
    );
    paint(c, ribbon([[cx + 70, 178], [cx + 90, 86]], 5, 4.5), {
      fill: G.mitti,
      mark: "dash",
      on: "rgba(255,243,220,0.6)",
      rows: 1,
      along: 12,
      ms: 2.6,
      mlw: 1.3,
      lw: 2
    });
    paint(c, lens(cx + 112, 82, 26, 15, -0.5), {
      fill: G.ash,
      mark: "scale",
      on: "rgba(255,255,255,0.6)",
      rows: 2,
      along: 8,
      ms: 3.2,
      mlw: 1.4,
      lw: 2.2
    });
    limb(
      c,
      [[cx, 150], [cx, 188]],
      16,
      23,
      { fill: G.skinDark, mark: "dot", on: "rgba(120,45,15,0.35)", rows: 2, along: 8, ms: 2, lw: 2.2 }
    );
    head(c, cx, cy, 45, 52, G.skin);
    paint(c, { closed: false, at: (u, v) => {
      const a = Math.PI + u * Math.PI;
      return [cx + Math.cos(a) * 48 * (0.74 + 0.26 * v), cy + Math.sin(a) * 53 * (0.74 + 0.26 * v) - 6];
    } }, {
      fill: "#160f0c",
      mark: "seed",
      on: "rgba(82,184,74,0.7)",
      rows: 3,
      along: 20,
      ms: 2.6,
      lw: 2.4
    });
    blob(c, cx - 4, cy - 68, 21, 17, -0.2, { fill: "#160f0c", mark: "dash", on: "rgba(82,184,74,0.6)", rows: 2, along: 12, ms: 2.6, mlw: 1.3, lw: 2.2 });
    leaf(c, cx + 16, cy - 78, 19, 8, -0.55, { fill: G.patta, mark: "tick", on: "rgba(255,243,220,0.85)", rows: 1, along: 7, ms: 2.6, mlw: 1.3, lw: 1.6 });
    features(c, cx, cy + 2, 1, t, emph, { seed: 2.1, lip: "#8a3a24" });
    for (let i = 0; i < 4; i++) {
      const a = -1 - i * 0.34;
      leaf(c, cx - 58 + Math.cos(a) * 26, 188 + Math.sin(a) * 28, 18, 8, a + 0.5, {
        fill: i & 1 ? G.patta : G.hara,
        mark: "tick",
        on: "rgba(255,243,220,0.8)",
        rows: 1,
        along: 7,
        ms: 2.8,
        mlw: 1.3,
        lw: 1.6
      });
    }
    beads(c, cx - 32, 176, cx + 32, 176, 9, 3.8, G.haldi);
  }
  function yama(c, t, emph) {
    const cx = W2 / 2;
    const sway = Math.sin(t * 0.55) * 3;
    const by = 252;
    paint(c, ribbon([
      [cx - 118, H2 + 12],
      [cx - 96, by - 6],
      [cx - 40, by - 30],
      [cx + 40, by - 30],
      [cx + 96, by - 6],
      [cx + 118, H2 + 12]
    ], 22, 22, 0.3), {
      fill: "#2b1c30",
      fill2: "#3c2742",
      band: 0.3,
      mark: "scale",
      on: "rgba(110,150,225,0.6)",
      rows: 3,
      along: 30,
      ms: 4.4,
      mlw: 1.5,
      lw: 2.8
    });
    for (const sgn of [-1, 1]) {
      paint(c, ribbon([
        [cx + sgn * 42, by - 14],
        [cx + sgn * 80, by - 34],
        [cx + sgn * 106, by - 6],
        [cx + sgn * 98, by + 30]
      ], 14, 3), {
        fill: G.chuna,
        mark: "tick",
        on: "rgba(60,30,20,0.6)",
        rows: 1,
        along: 14,
        ms: 3.4,
        mlw: 1.3,
        lw: 2.4
      });
    }
    blob(c, cx, by + 12, 44, 32, 0, {
      fill: "#3c2742",
      mark: "dot",
      on: "rgba(130,165,235,0.5)",
      rows: 3,
      along: 22,
      ms: 2.4,
      lw: 2.6
    });
    c.fillStyle = G.chuna;
    c.beginPath();
    c.arc(cx - 29, by + 4, 8.5, 0, TAU7);
    c.arc(cx + 29, by + 4, 8.5, 0, TAU7);
    c.fill();
    c.strokeStyle = G.soot;
    c.lineWidth = 1.8;
    c.beginPath();
    c.arc(cx - 29, by + 4, 8.5, 0, TAU7);
    c.stroke();
    c.beginPath();
    c.arc(cx + 29, by + 4, 8.5, 0, TAU7);
    c.stroke();
    c.fillStyle = G.soot;
    c.beginPath();
    c.arc(cx - 29, by + 4, 3.8, 0, TAU7);
    c.arc(cx + 29, by + 4, 3.8, 0, TAU7);
    c.fill();
    c.beginPath();
    c.ellipse(cx - 11, by + 28, 5, 4, 0, 0, TAU7);
    c.ellipse(cx + 11, by + 28, 5, 4, 0, 0, TAU7);
    c.fill();
    c.strokeStyle = G.kesar;
    c.lineWidth = 3;
    c.beginPath();
    c.arc(cx, by + 38, 12, 0, Math.PI);
    c.stroke();
    const cy = 92;
    disc(c, cx, cy - 6, 68, {
      fill: "#1d0a16",
      mark: "scale",
      on: "rgba(224,74,44,0.4)",
      rows: 3,
      along: 26,
      ms: 4.4,
      mlw: 1.4,
      rays: 0,
      lw: 2
    });
    c.strokeStyle = "rgba(224,74,44,0.55)";
    c.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.arc(cx, cy - 6, 74 + i * 11, 0, TAU7);
      c.stroke();
    }
    paint(c, ribbon([[cx - 2, by - 20], [cx, 200], [cx + 2, 158]], 76, 44), {
      fill: G.geruDark,
      fill2: G.geru,
      band: 0.25,
      mark: "scale",
      on: "rgba(255,222,122,0.65)",
      rows: 4,
      along: 22,
      ms: 4.2,
      mlw: 1.5,
      lw: 2.8
    });
    paint(c, ribbon([[cx - 56, 178], [cx + 56, 178]], 13, 13), {
      fill: G.neelDark,
      mark: "dot",
      on: "rgba(130,175,255,0.8)",
      rows: 2,
      along: 18,
      ms: 2.2,
      lw: 2.2
    });
    limb(
      c,
      [[cx - 44, 178], [cx - 84, 192], [cx - 96, 156 - emph * 6]],
      11,
      7,
      { fill: "#4e3a68", mark: "dot", on: "rgba(150,185,255,0.45)", rows: 2, along: 12, ms: 2, lw: 2.2 }
    );
    paint(c, ribbon([[cx - 96, 150], [cx - 88, 50]], 5.5, 5), {
      fill: G.mitti,
      mark: "dash",
      on: "rgba(255,222,122,0.7)",
      rows: 1,
      along: 14,
      ms: 2.8,
      mlw: 1.3,
      lw: 2
    });
    blob(c, cx - 88, 42, 12, 12, 0, { fill: G.haldi, mark: "dot", on: "rgba(160,40,10,0.6)", rows: 1, along: 9, ms: 1.8, lw: 2 });
    limb(
      c,
      [[cx + 44, 178], [cx + 86, 190], [cx + 98, 154 - emph * 6]],
      11,
      7,
      { fill: "#4e3a68", mark: "dot", on: "rgba(150,185,255,0.45)", rows: 2, along: 12, ms: 2, lw: 2.2 }
    );
    c.strokeStyle = G.kesar;
    c.lineWidth = 3.6;
    c.beginPath();
    c.moveTo(cx + 98, 148);
    c.quadraticCurveTo(cx + 126, 116 + sway, cx + 106, 86 + sway);
    c.stroke();
    paint(c, rosette(cx + 96, 68 + sway, 25, 18), { fill: null, ink: G.kesar, lw: 3.6 });
    limb(
      c,
      [[cx, 136], [cx, 172]],
      18,
      25,
      { fill: "#3e2f56", mark: "dot", on: "rgba(150,185,255,0.4)", rows: 2, along: 9, ms: 2, lw: 2.2 }
    );
    head(c, cx, cy, 47, 54, "#4e3a68", "rgba(150,185,255,0.5)");
    paint(c, { closed: false, at: (u, v) => {
      const a = Math.PI * 1.06 + u * Math.PI * 0.88;
      const spike = 1 + 0.34 * Math.abs(Math.sin(u * Math.PI * 2.5));
      return [cx + Math.cos(a) * 48 * (0.66 + 0.34 * v * spike), cy + Math.sin(a) * 58 * (0.66 + 0.34 * v * spike) - 8];
    } }, {
      fill: G.geru,
      mark: "scale",
      on: "rgba(255,222,122,0.85)",
      rows: 2,
      along: 22,
      ms: 3.4,
      mlw: 1.5,
      lw: 2.4
    });
    beads(c, cx - 38, cy - 38, cx + 38, cy - 38, 9, 4, G.haldi);
    features(c, cx, cy + 2, 1.06, t, emph, { seed: 2.8, lip: G.kesar, open: 2 });
    c.strokeStyle = G.soot;
    c.lineWidth = 3.2;
    c.lineCap = "round";
    c.beginPath();
    c.moveTo(cx - 18, cy + 25);
    c.quadraticCurveTo(cx, cy + 21, cx + 18, cy + 25);
    c.moveTo(cx - 18, cy + 25);
    c.quadraticCurveTo(cx - 28, cy + 27, cx - 30, cy + 17);
    c.moveTo(cx + 18, cy + 25);
    c.quadraticCurveTo(cx + 28, cy + 27, cx + 30, cy + 17);
    c.stroke();
    c.lineCap = "butt";
    c.strokeStyle = G.haldi;
    c.lineWidth = 2.4;
    c.beginPath();
    for (let i = -1; i <= 1; i++) {
      c.moveTo(cx + i * 10, cy - 42);
      c.lineTo(cx + i * 10, cy - 30);
    }
    c.stroke();
    blob(c, cx - 50, cy + 13, 9, 13, 0, { fill: G.haldi, mark: "dot", on: "rgba(160,40,10,0.6)", rows: 1, along: 8, ms: 1.7, lw: 1.8 });
    blob(c, cx + 50, cy + 13, 9, 13, 0, { fill: G.haldi, mark: "dot", on: "rgba(160,40,10,0.6)", rows: 1, along: 8, ms: 1.7, lw: 1.8 });
  }
  function narada(c, t, emph) {
    const cx = W2 / 2 - 2, cy = 112;
    disc(c, cx, cy - 10, 62, {
      fill: "rgba(245,192,42,0.35)",
      mark: "dot",
      on: "rgba(255,222,122,0.5)",
      rows: 3,
      along: 28,
      ms: 2.2,
      rays: 14,
      spin: -t * 0.05,
      rayCol: G.haldi,
      lw: 1.8
    });
    torso(c, cx, -0.5, {
      fill: G.haldi,
      fill2: G.kesar,
      band: 0.3,
      mark: "seed",
      on: "rgba(70,35,5,0.6)",
      rows: 4,
      along: 20,
      ms: 3.2
    });
    paint(c, ribbon([[cx - 88, 292], [cx, 284], [cx + 88, 294]], 13, 13), {
      fill: G.hara,
      mark: "crescent",
      on: "rgba(255,243,220,0.85)",
      rows: 2,
      along: 20,
      ms: 3.6,
      mlw: 1.5,
      lw: 2.2
    });
    paint(c, ribbon([[cx - 88, 272], [cx + 6, 198], [cx + 90, 136]], 8, 8), {
      fill: G.mitti,
      mark: "dash",
      on: "rgba(255,243,220,0.7)",
      rows: 2,
      along: 22,
      ms: 3,
      mlw: 1.4,
      lw: 2.4
    });
    blob(c, cx - 90, 276, 27, 27, 0, { fill: G.jamun, mark: "scale", on: "rgba(255,222,122,0.7)", rows: 3, along: 18, ms: 3.6, mlw: 1.5, lw: 2.4 });
    blob(c, cx + 94, 130, 17, 17, 0, { fill: G.jamun, mark: "dot", on: "rgba(255,222,122,0.7)", rows: 2, along: 12, ms: 2, lw: 2.2 });
    c.strokeStyle = G.chuna;
    c.lineWidth = 1.1;
    for (let i = -1; i <= 1; i++) {
      c.beginPath();
      c.moveTo(cx - 86 + i * 3.5, 270 + i * 3.5);
      c.lineTo(cx + 90 + i * 3.5, 134 + i * 3.5);
      c.stroke();
    }
    limb(
      c,
      [[cx - 42, 200], [cx - 74, 238], [cx - 60, 272]],
      11,
      7,
      { fill: G.skin, mark: "dot", on: "rgba(120,45,15,0.4)", rows: 2, along: 12, ms: 2, lw: 2.2 }
    );
    limb(
      c,
      [[cx + 42, 198], [cx + 76, 184 - emph * 5], [cx + 88, 152 - emph * 5]],
      11,
      7,
      { fill: G.skin, mark: "dot", on: "rgba(120,45,15,0.4)", rows: 2, along: 12, ms: 2, lw: 2.2 }
    );
    limb(
      c,
      [[cx, 150], [cx, 186]],
      16,
      22,
      { fill: G.skinDark, mark: "dot", on: "rgba(120,45,15,0.35)", rows: 2, along: 8, ms: 2, lw: 2.2 }
    );
    head(c, cx, cy, 44, 51, G.skin);
    paint(c, { closed: false, at: (u, v) => {
      const a = Math.PI + u * Math.PI;
      return [cx + Math.cos(a) * 47 * (0.74 + 0.26 * v), cy + Math.sin(a) * 52 * (0.74 + 0.26 * v) - 6];
    } }, {
      fill: "#f2ead8",
      mark: "dash",
      on: "rgba(130,100,60,0.65)",
      rows: 3,
      along: 24,
      ms: 3,
      mlw: 1.3,
      lw: 2.4
    });
    paint(c, ribbon([[cx + 2, cy - 54], [cx + 12, cy - 88]], 7, 3), { fill: "#f2ead8", lw: 2 });
    features(c, cx, cy + 2, 1, t, emph, { seed: 3.4, open: 3.2, lip: "#8a4a24" });
    paint(c, lens(cx, cy + 56, 30, 30, Math.PI / 2), {
      fill: "#f2ead8",
      mark: "dash",
      on: "rgba(130,100,60,0.6)",
      rows: 3,
      along: 14,
      ms: 3,
      mlw: 1.3,
      lw: 2.2
    });
    for (let i = 0; i < 4; i++) {
      const a = t * 0.45 + i * 1.7;
      bird(c, cx - 70 + i * 16 + Math.cos(a) * 18, 46 + Math.sin(a) * 13, 13, {
        fill: i & 1 ? G.chuna : G.hara,
        mark: "dot",
        on: "rgba(60,35,10,0.6)",
        rows: 1,
        along: 5,
        ms: 1.6,
        lw: 1.8
      });
    }
  }
  function keeper(c, t, emph) {
    const cx = W2 / 2 + 2, cy = 116;
    disc(c, cx, cy - 10, 58, {
      fill: "rgba(168,101,44,0.35)",
      mark: "dot",
      on: "rgba(255,243,220,0.35)",
      rows: 2,
      along: 22,
      ms: 2,
      rays: 0,
      lw: 1.8
    });
    torso(c, cx, 0.6, {
      fill: G.mitti,
      fill2: "#7a4620",
      band: 0.25,
      mark: "dash",
      on: "rgba(255,243,220,0.6)",
      rows: 5,
      along: 22,
      ms: 3,
      mlw: 1.4
    });
    paint(c, ribbon([[cx - 90, 290], [cx, 282], [cx + 90, 292]], 13, 13), {
      fill: G.geruDark,
      mark: "tick",
      on: "rgba(255,243,220,0.7)",
      rows: 2,
      along: 20,
      ms: 3.4,
      mlw: 1.4,
      lw: 2.2
    });
    limb(
      c,
      [[cx - 42, 200], [cx - 72, 234], [cx - 60, 270]],
      11,
      7,
      { fill: G.mittiPale, mark: "dot", on: "rgba(90,50,20,0.45)", rows: 2, along: 12, ms: 2, lw: 2.2 }
    );
    limb(
      c,
      [[cx + 42, 200], [cx + 74, 224], [cx + 66 - emph * 4, 260]],
      11,
      7,
      { fill: G.mittiPale, mark: "dot", on: "rgba(90,50,20,0.45)", rows: 2, along: 12, ms: 2, lw: 2.2 }
    );
    paint(c, ribbon([[cx + 70, 276], [cx + 84, 86]], 5.5, 4.5), {
      fill: G.mitti,
      mark: "dash",
      on: "rgba(255,243,220,0.55)",
      rows: 1,
      along: 20,
      ms: 2.6,
      mlw: 1.3,
      lw: 2
    });
    limb(
      c,
      [[cx, 154], [cx, 190]],
      15,
      21,
      { fill: "#b07a4e", mark: "dot", on: "rgba(90,50,20,0.4)", rows: 2, along: 8, ms: 2, lw: 2.2 }
    );
    head(c, cx, cy, 43, 50, G.mittiPale, "rgba(90,50,20,0.35)");
    paint(c, { closed: false, at: (u, v) => {
      const a = Math.PI * 0.94 + u * Math.PI * 1.12;
      return [cx + Math.cos(a) * 56 * (0.78 + 0.22 * v), cy + Math.sin(a) * 62 * (0.78 + 0.22 * v) + 4];
    } }, {
      fill: G.chuna,
      mark: "dash",
      on: "rgba(120,80,45,0.6)",
      rows: 3,
      along: 26,
      ms: 3.2,
      mlw: 1.4,
      lw: 2.4
    });
    features(c, cx, cy + 2, 0.96, t, emph, { seed: 4.2, open: 2.4, lip: "#7a4a30" });
    c.strokeStyle = "rgba(70,40,20,0.55)";
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(cx - 33, cy + 16);
    c.quadraticCurveTo(cx - 25, cy + 25, cx - 21, cy + 35);
    c.moveTo(cx + 33, cy + 16);
    c.quadraticCurveTo(cx + 25, cy + 25, cx + 21, cy + 35);
    c.stroke();
    c.fillStyle = G.geru;
    c.beginPath();
    c.arc(cx, cy - 26, 4, 0, TAU7);
    c.fill();
    beads(c, cx - 28, 180, cx + 28, 180, 7, 3.6, G.chuna);
  }

  // savi/src/savi-spring.js
  var TARN = { x: 2600, y: 96, rx: 430, ry: 132 };
  function inTarn(x, y, grow = 0) {
    const dx = (x - TARN.x) / (TARN.rx + grow), dy = (y - TARN.y) / (TARN.ry + grow);
    const d = Math.hypot(dx, dy);
    if (d > 1.3) return false;
    const a = Math.atan2(dy, dx);
    return d < 1 + Math.sin(a * 3 + 1.1) * 0.1 + Math.sin(a * 5 - 2.2) * 0.06 + Math.sin(a * 8 + 0.4) * 0.035;
  }
  var THROW = { VZ: 430, G: 1500, Z0: 16 };
  var throwSpeed = (r) => 270 - r * 1.4;

  // savi/src/savi-fauna.js
  var TAU8 = Math.PI * 2;
  var rand2 = (a, b) => a + Math.random() * (b - a);
  var clamp3 = (v, a, b) => v < a ? a : v > b ? b : v;
  var clamp013 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  var DRY = [TT.GRASS, TT.TALL, TT.MOSS, TT.DIRT];
  var KINDS2 = {
    deer: { sp: 44, run: 130, roam: 240, r: 13, ground: DRY },
    fawn: { sp: 42, run: 138, roam: 150, r: 9, ground: DRY },
    peacock: { sp: 32, run: 94, roam: 160, r: 10, ground: [...DRY, TT.PAVE, TT.GRAVEL] },
    hare: { sp: 38, run: 158, roam: 130, r: 6, ground: DRY },
    crane: { sp: 22, run: 66, roam: 90, r: 11, ground: [TT.SHALLOW, TT.MUD] }
  };
  var A = [];
  var F2 = [];
  var R = [];
  var VW = 0;
  var VH = 0;
  var ok = null;
  var MIX = ["deer", "hare", "peacock", "fawn", "deer", "hare", "crane", "peacock"];
  function initFauna(V2, classify2, regions) {
    VW = V2.w;
    VH = V2.h;
    ok = (x, y, k) => {
      if (x < 60 || y < 60 || x > VW - 60 || y > VH - 60) return false;
      return KINDS2[k].ground.includes(classify2(x, y));
    };
    A.length = 0;
    F2.length = 0;
    R.length = 0;
    for (let g = 0; g < regions.length; g++) {
      const G3 = regions[g];
      const reg = { id: G3.id, x: G3.x, y: G3.y, few: G3.hub ? 0 : 1 + (g & 1), n: 0 };
      R.push(reg);
      for (const k of MIX) {
        let hx = 0, hy = 0, got = false;
        for (let tr = 0; tr < 400 && !got; tr++) {
          const a = rand2(0, TAU8), d = rand2(150, G3.r || 560);
          hx = G3.x + Math.cos(a) * d;
          hy = G3.y + Math.sin(a) * d;
          got = ok(hx, hy, k);
        }
        if (!got) continue;
        A.push({
          k,
          region: reg,
          rank: reg.n++,
          hx,
          hy,
          x: hx,
          y: hy,
          tx: hx,
          ty: hy,
          dir: Math.random() < 0.5 ? -1 : 1,
          mode: "graze",
          t: rand2(0, 4),
          ph: rand2(0, TAU8),
          seed: Math.random() * 1e3,
          head: 0,
          buck: Math.random() < 0.45,
          sp: 0,
          on: false
        });
      }
      F2.push({
        region: reg,
        x: G3.x,
        y: G3.y,
        a: rand2(0, TAU8),
        h: rand2(46, 96),
        n: 3 + g % 5,
        t: rand2(0, 9),
        sp: rand2(30, 52),
        on: false
      });
    }
    return A.length;
  }
  function present(a, woken, bloom) {
    const reg = a.region;
    const base = woken && woken[reg.id] ? reg.few : 0;
    return a.rank < base + Math.round(bloom * (reg.n - base));
  }
  function stepFauna(dt, S2, st2) {
    const bloom = clamp013(st2.bloomK || 0);
    const flee = 128 - bloom * 60;
    const wary = flee + 66;
    for (const a of A) a.on = present(a, st2.woken, bloom);
    for (const f of F2) f.on = !!(st2.woken && st2.woken[f.region.id]) || bloom > 0.35;
    for (const a of A) {
      if (!a.on) continue;
      const K2 = KINDS2[a.k];
      const d = Math.hypot(S2.x - a.x, S2.y - a.y);
      if (d > 1400) continue;
      a.t -= dt;
      if (d < flee && a.mode !== "flee") {
        a.mode = "flee";
        a.t = rand2(1.1, 2.3);
      } else if (d < wary && (a.mode === "graze" || a.mode === "walk")) {
        a.mode = "alert";
        a.t = rand2(0.5, 1.3);
      }
      if (a.t <= 0) {
        if (a.mode === "alert") {
          a.mode = d < wary ? "flee" : "graze";
          a.t = rand2(1, 2.4);
        } else if (a.mode === "flee") {
          a.mode = "graze";
          a.t = rand2(1.4, 4.5);
        } else if (a.mode === "graze") {
          a.mode = "walk";
          a.t = rand2(1.6, 4.6);
          aim(a, K2);
        } else {
          a.mode = "graze";
          a.t = rand2(2, 6);
        }
      }
      let want = 0;
      if (a.mode === "flee") {
        const ang = Math.atan2(a.y - S2.y, a.x - S2.x);
        a.tx = clamp3(S2.x + Math.cos(ang) * 340, 80, VW - 80);
        a.ty = clamp3(S2.y + Math.sin(ang) * 340, 80, VH - 80);
        want = K2.run;
      } else if (a.mode === "walk") {
        want = K2.sp;
      }
      a.sp += (want - a.sp) * Math.min(1, dt * 6);
      if (a.sp > 1) {
        const ang = Math.atan2(a.ty - a.y, a.tx - a.x);
        const nx = a.x + Math.cos(ang) * a.sp * dt;
        const ny = a.y + Math.sin(ang) * a.sp * dt;
        if (ok(nx, ny, a.k)) {
          a.x = nx;
          a.y = ny;
          if (Math.abs(Math.cos(ang)) > 0.12) a.dir = Math.cos(ang) < 0 ? -1 : 1;
          a.ph += a.sp * dt * 0.16;
        } else {
          aim(a, K2);
          if (a.mode === "flee") {
            a.mode = "walk";
            a.t = rand2(0.6, 1.4);
          }
        }
        if (Math.hypot(a.tx - a.x, a.ty - a.y) < 8) {
          a.mode = "graze";
          a.t = rand2(2, 6);
        }
      }
      const up = a.mode === "graze" ? 0 : 1;
      a.head += (up - a.head) * Math.min(1, dt * 7);
    }
    for (const f of F2) {
      f.t += dt;
      f.a += Math.sin(f.t * 0.24 + f.n) * dt * 0.5;
      f.x += Math.cos(f.a) * f.sp * dt;
      f.y += Math.sin(f.a) * f.sp * dt;
      if (f.x < 200 || f.x > VW - 200) {
        f.a = Math.PI - f.a;
        f.x = clamp3(f.x, 200, VW - 200);
      }
      if (f.y < 200 || f.y > VH - 200) {
        f.a = -f.a;
        f.y = clamp3(f.y, 200, VH - 200);
      }
    }
  }
  function aim(a, K2) {
    for (let tr = 0; tr < 12; tr++) {
      const ang = rand2(0, TAU8), r = rand2(20, K2.roam);
      const tx = a.hx + Math.cos(ang) * r, ty = a.hy + Math.sin(ang) * r;
      if (ok(tx, ty, a.k)) {
        a.tx = tx;
        a.ty = ty;
        return;
      }
    }
    a.tx = a.hx;
    a.ty = a.hy;
  }
  function drawFauna(ctx3, time, cam, view2, y0, y1) {
    for (const a of A) {
      if (!a.on) continue;
      if (a.y < y0 || a.y >= y1) continue;
      if (a.x < cam.x - 90 || a.x > cam.x + view2.w + 90 || a.y < cam.y - 110 || a.y > cam.y + view2.h + 90) continue;
      ctx3.save();
      ctx3.translate(a.x, a.y);
      ctx3.scale(a.dir, 1);
      DRAW[a.k](ctx3, a, time);
      ctx3.restore();
    }
  }
  function drawSkyFauna(ctx3, time, cam, view2) {
    for (const f of F2) {
      if (!f.on) continue;
      if (f.x < cam.x - 200 || f.x > cam.x + view2.w + 200 || f.y < cam.y - 200 || f.y > cam.y + view2.h + 200) continue;
      for (let k = 0; k < f.n; k++) {
        const o = k * 1.9 + f.n;
        const bx = f.x + Math.cos(f.a + Math.PI) * k * 15 + Math.sin(time * 0.8 + o) * 13;
        const by = f.y + Math.sin(f.a + Math.PI) * k * 9 + Math.cos(time * 0.7 + o) * 9;
        ctx3.fillStyle = "rgba(0,0,0,0.13)";
        ctx3.beginPath();
        ctx3.ellipse(bx + 7, by + 6, 4.5, 2, 0, 0, TAU8);
        ctx3.fill();
        const w = Math.sin(time * 9 + o);
        const y = by - f.h;
        ctx3.strokeStyle = "#2b2620";
        ctx3.lineWidth = 1.7;
        ctx3.lineCap = "round";
        ctx3.beginPath();
        ctx3.moveTo(bx - 6, y + w * 2.2);
        ctx3.quadraticCurveTo(bx - 2.4, y - 2 - w * 1.4, bx, y);
        ctx3.quadraticCurveTo(bx + 2.4, y - 2 - w * 1.4, bx + 6, y + w * 2.2);
        ctx3.stroke();
      }
    }
  }
  function legs(ctx3, a, n, x0, gap, len, col, w) {
    ctx3.strokeStyle = col;
    ctx3.lineWidth = w;
    ctx3.lineCap = "round";
    const moving = a.sp > 3;
    for (let i = 0; i < n; i++) {
      const sw = moving ? Math.sin(a.ph * 2 + i * 2.1) * 3.4 : Math.sin(a.seed + i) * 0.3;
      ctx3.beginPath();
      ctx3.moveTo(x0 + i * gap, -len);
      ctx3.lineTo(x0 + i * gap + sw, 0);
      ctx3.stroke();
    }
  }
  function deer(ctx3, a, time, small) {
    const s = small ? 0.62 : 1;
    const bob = a.sp > 3 ? Math.abs(Math.sin(a.ph * 2)) * 1.6 * s : Math.sin(time * 1.1 + a.seed) * 0.5;
    ctx3.fillStyle = "rgba(0,0,0,0.26)";
    ctx3.beginPath();
    ctx3.ellipse(1, 1, 13 * s, 4.6 * s, 0, 0, TAU8);
    ctx3.fill();
    ctx3.save();
    ctx3.translate(0, -bob);
    legs(ctx3, a, 4, -8 * s, 5.4 * s, 13 * s, "#6b4526", 2.3 * s);
    ctx3.fillStyle = "#9a6231";
    ctx3.beginPath();
    ctx3.ellipse(0, -17 * s, 12 * s, 7 * s, 0, 0, TAU8);
    ctx3.fill();
    ctx3.fillStyle = "#b5763f";
    ctx3.beginPath();
    ctx3.ellipse(-1 * s, -19.5 * s, 10 * s, 3.6 * s, 0, 0, TAU8);
    ctx3.fill();
    ctx3.fillStyle = "#efe4d2";
    ctx3.beginPath();
    ctx3.ellipse(-11 * s, -17 * s, 3 * s, 3.6 * s, 0, 0, TAU8);
    ctx3.fill();
    if (small) {
      ctx3.fillStyle = "rgba(255,243,220,0.8)";
      for (let i = 0; i < 6; i++) {
        ctx3.beginPath();
        ctx3.arc((-7 + i * 2.7) * s, (-19 + i % 2 * 3.6) * s, 0.9 * s, 0, TAU8);
        ctx3.fill();
      }
    }
    const up = a.head;
    const nx = 12 * s, ny = (-22 - up * 5) * s + (1 - up) * 10 * s;
    ctx3.strokeStyle = "#9a6231";
    ctx3.lineWidth = 4.4 * s;
    ctx3.lineCap = "round";
    ctx3.beginPath();
    ctx3.moveTo(8 * s, -20 * s);
    ctx3.quadraticCurveTo(12 * s, (-24 - up * 3) * s + (1 - up) * 6 * s, nx, ny);
    ctx3.stroke();
    ctx3.fillStyle = "#a86c37";
    ctx3.beginPath();
    ctx3.ellipse(nx + 1.6 * s, ny, 4.2 * s, 2.7 * s, 0.2 - up * 0.5, 0, TAU8);
    ctx3.fill();
    ctx3.fillStyle = "#120c12";
    ctx3.beginPath();
    ctx3.arc(nx + 1.4 * s, ny - 0.8 * s, 0.75 * s, 0, TAU8);
    ctx3.fill();
    ctx3.fillStyle = "#7e5028";
    ctx3.beginPath();
    ctx3.ellipse(nx - 2.4 * s, ny - 2.4 * s, 2.2 * s, 1.3 * s, -0.8 + up * 0.4, 0, TAU8);
    ctx3.fill();
    if (a.buck && !small) {
      ctx3.strokeStyle = "#d9c8a4";
      ctx3.lineWidth = 1.5;
      ctx3.lineCap = "round";
      for (const d of [-1, 1]) {
        ctx3.beginPath();
        ctx3.moveTo(nx - 1.4, ny - 2.6);
        ctx3.quadraticCurveTo(nx - 1 + d * 1.6, ny - 9, nx + 1 + d * 4.4, ny - 12);
        ctx3.moveTo(nx - 0.6 + d * 1.4, ny - 7.6);
        ctx3.lineTo(nx - 3 + d * 2, ny - 11.6);
        ctx3.stroke();
      }
    }
    ctx3.restore();
  }
  function peacock(ctx3, a, time) {
    const bob = a.sp > 3 ? Math.abs(Math.sin(a.ph * 2)) * 1.3 : Math.sin(time * 1.4 + a.seed) * 0.4;
    const fan = a.mode === "graze" ? clamp013(Math.sin(time * 0.33 + a.seed) * 3 - 2.1) : 0;
    ctx3.fillStyle = "rgba(0,0,0,0.24)";
    ctx3.beginPath();
    ctx3.ellipse(-2, 1, 10, 4, 0, 0, TAU8);
    ctx3.fill();
    ctx3.save();
    ctx3.translate(0, -bob);
    if (fan > 0.02) {
      for (let i = -6; i <= 6; i++) {
        const ang = Math.PI * 0.5 + i * 0.13 * fan + Math.PI * 0.5;
        const r = 26 * fan;
        const ex = -6 + Math.cos(ang) * r, ey = -14 + Math.sin(ang) * r * 0.9;
        ctx3.strokeStyle = "#16a89c";
        ctx3.lineWidth = 2.4;
        ctx3.lineCap = "round";
        ctx3.beginPath();
        ctx3.moveTo(-6, -12);
        ctx3.lineTo(ex, ey);
        ctx3.stroke();
        ctx3.fillStyle = "#2f74d8";
        ctx3.beginPath();
        ctx3.arc(ex, ey, 2.1, 0, TAU8);
        ctx3.fill();
        ctx3.fillStyle = "#f5c02a";
        ctx3.beginPath();
        ctx3.arc(ex, ey, 0.9, 0, TAU8);
        ctx3.fill();
      }
    } else {
      ctx3.strokeStyle = "#16a89c";
      ctx3.lineWidth = 4.2;
      ctx3.lineCap = "round";
      for (let i = -1; i <= 1; i++) {
        ctx3.beginPath();
        ctx3.moveTo(-6, -12);
        ctx3.quadraticCurveTo(-16, -10 + i * 2, -26 + Math.sin(time * 1.6 + i) * 2, -5 + i * 3);
        ctx3.stroke();
      }
      ctx3.fillStyle = "#2f74d8";
      for (let i = -1; i <= 1; i++) {
        ctx3.beginPath();
        ctx3.arc(-25 + Math.sin(time * 1.6 + i) * 2, -5 + i * 3, 1.8, 0, TAU8);
        ctx3.fill();
      }
    }
    legs(ctx3, a, 2, -2, 4.4, 8, "#8a7a52", 1.6);
    ctx3.fillStyle = "#16355e";
    ctx3.beginPath();
    ctx3.ellipse(-2, -12, 8, 6, 0, 0, TAU8);
    ctx3.fill();
    ctx3.fillStyle = "#2f74d8";
    ctx3.beginPath();
    ctx3.ellipse(1, -12.5, 5.4, 4.6, 0, 0, TAU8);
    ctx3.fill();
    const up = 0.5 + a.head * 0.5;
    const hy = -22 - up * 3;
    ctx3.strokeStyle = "#2f74d8";
    ctx3.lineWidth = 3;
    ctx3.lineCap = "round";
    ctx3.beginPath();
    ctx3.moveTo(3, -15);
    ctx3.quadraticCurveTo(7, -19, 6, hy);
    ctx3.stroke();
    ctx3.fillStyle = "#2f74d8";
    ctx3.beginPath();
    ctx3.ellipse(6.4, hy, 2.8, 2.4, 0, 0, TAU8);
    ctx3.fill();
    ctx3.fillStyle = "#120c12";
    ctx3.beginPath();
    ctx3.arc(7.4, hy - 0.4, 0.7, 0, TAU8);
    ctx3.fill();
    ctx3.fillStyle = "#f5c02a";
    ctx3.beginPath();
    ctx3.moveTo(9, hy);
    ctx3.lineTo(12, hy + 0.6);
    ctx3.lineTo(9, hy + 1.4);
    ctx3.fill();
    ctx3.strokeStyle = "#16a89c";
    ctx3.lineWidth = 0.9;
    for (let i = -1; i <= 1; i++) {
      ctx3.beginPath();
      ctx3.moveTo(6 + i * 0.9, hy - 2.2);
      ctx3.lineTo(6 + i * 2.2, hy - 5.4);
      ctx3.stroke();
      ctx3.fillStyle = "#2f74d8";
      ctx3.beginPath();
      ctx3.arc(6 + i * 2.2, hy - 5.6, 0.85, 0, TAU8);
      ctx3.fill();
    }
    ctx3.restore();
  }
  function hare(ctx3, a, time) {
    const hop = a.sp > 3 ? Math.abs(Math.sin(a.ph * 3.2)) * 5 : 0;
    ctx3.fillStyle = "rgba(0,0,0,0.22)";
    ctx3.beginPath();
    ctx3.ellipse(0, 1, 7 - hop * 0.3, 3, 0, 0, TAU8);
    ctx3.fill();
    ctx3.save();
    ctx3.translate(0, -hop);
    ctx3.fillStyle = "#9a8460";
    ctx3.beginPath();
    ctx3.ellipse(-1, -6, 7, 5.2, -0.16, 0, TAU8);
    ctx3.fill();
    ctx3.fillStyle = "#fff3dc";
    ctx3.beginPath();
    ctx3.ellipse(-7, -6.4, 2.2, 2, 0, 0, TAU8);
    ctx3.fill();
    const up = 0.35 + a.head * 0.65;
    ctx3.fillStyle = "#a89070";
    ctx3.beginPath();
    ctx3.ellipse(4.6, -9 - up * 1.6, 3.6, 3.2, 0, 0, TAU8);
    ctx3.fill();
    ctx3.fillStyle = "#9a8460";
    for (const d of [-0.5, 0.35]) {
      ctx3.save();
      ctx3.translate(4.2, -11.4 - up * 1.6);
      ctx3.rotate(d - up * 0.3 + Math.sin(time * 1.7 + a.seed + d) * 0.09);
      ctx3.beginPath();
      ctx3.ellipse(0, -4, 1.4, 4.6, 0, 0, TAU8);
      ctx3.fill();
      ctx3.restore();
    }
    ctx3.fillStyle = "#120c12";
    ctx3.beginPath();
    ctx3.arc(6, -9.6 - up * 1.6, 0.8, 0, TAU8);
    ctx3.fill();
    ctx3.restore();
  }
  function crane(ctx3, a, time) {
    const stab = a.mode === "graze" ? clamp013(Math.sin(time * 0.7 + a.seed) * 4 - 3) : 0;
    ctx3.fillStyle = "rgba(0,0,0,0.2)";
    ctx3.beginPath();
    ctx3.ellipse(0, 1, 9, 3.4, 0, 0, TAU8);
    ctx3.fill();
    legs(ctx3, a, 2, -1, 4, 20, "#3a3128", 1.6);
    ctx3.fillStyle = "#efe8dc";
    ctx3.beginPath();
    ctx3.ellipse(0, -25, 9, 6, -0.1, 0, TAU8);
    ctx3.fill();
    ctx3.fillStyle = "#cfc6b6";
    ctx3.beginPath();
    ctx3.ellipse(-7, -25, 4.4, 3.4, 0.4, 0, TAU8);
    ctx3.fill();
    const hy = -38 + stab * 15;
    ctx3.strokeStyle = "#efe8dc";
    ctx3.lineWidth = 2.6;
    ctx3.lineCap = "round";
    ctx3.beginPath();
    ctx3.moveTo(4, -28);
    ctx3.quadraticCurveTo(9, -34 + stab * 8, 8, hy);
    ctx3.stroke();
    ctx3.fillStyle = "#efe8dc";
    ctx3.beginPath();
    ctx3.ellipse(8.4, hy, 2.6, 2.1, 0, 0, TAU8);
    ctx3.fill();
    ctx3.fillStyle = "#e04a2c";
    ctx3.beginPath();
    ctx3.ellipse(8.4, hy - 1.8, 1.8, 1, 0, 0, TAU8);
    ctx3.fill();
    ctx3.fillStyle = "#120c12";
    ctx3.beginPath();
    ctx3.arc(9.4, hy - 0.2, 0.6, 0, TAU8);
    ctx3.fill();
    ctx3.strokeStyle = "#3a3128";
    ctx3.lineWidth = 1.2;
    ctx3.beginPath();
    ctx3.moveTo(10.6, hy + 0.4);
    ctx3.lineTo(17, hy + 2 + stab * 2);
    ctx3.stroke();
  }
  var DRAW = {
    deer: (c, a, t) => deer(c, a, t, false),
    fawn: (c, a, t) => deer(c, a, t, true),
    peacock,
    hare,
    crane
  };

  // savi/src/savi.js
  var V = { w: 5200, h: 3400 };
  var TREE = { x: 2600, y: 1560 };
  var WOMAN = { x: 2456, y: 1790 };
  var FIRE = { x: 2556, y: 1812 };
  var START = { x: 2600, y: 3120 };
  var GATE2 = { x: 2600, y: 3230 };
  var AVENUE = [];
  for (let i = 0; i < 9; i++) {
    const y = 3140 - i * 150;
    const w = 168 + i * 5;
    AVENUE.push({ x: 2600 - w, y, s: 1.05 + i % 3 * 0.16, seed: i * 2 });
    AVENUE.push({ x: 2600 + w, y, s: 1.05 + (i + 1) % 3 * 0.16, seed: i * 2 + 1 });
  }
  var DRIFTS = AVENUE.map((t, i) => ({ x: t.x + (i % 2 ? 34 : -34), y: t.y + 26, r: 74 + i % 4 * 16, d: 0.42 + i % 3 * 0.1 })).concat([
    { x: 2470, y: 2960, r: 120, d: 0.55 },
    { x: 2735, y: 2790, r: 108, d: 0.5 },
    { x: 2520, y: 2620, r: 132, d: 0.6 }
  ]);
  var PLACES = {
    choice: { at: { x: 1160, y: 2340 }, patch: { x: 880, y: 2060, w: 620, h: 540 }, mat: "leaves" },
    fall: { at: { x: ROOT_AT[0], y: ROOT_AT[1] }, patch: { x: 2800, y: 1300, w: 2400, h: 1900 }, mat: "water" },
    pursuit: { at: { x: 760, y: 1120 }, patch: { x: 500, y: 880, w: 620, h: 520 }, mat: "thorn" },
    steps: { at: { x: 4180, y: 760 }, patch: { x: 3840, y: 520, w: 720, h: 520 }, mat: "snow" },
    // The stone fall. `mat: 'ash'` is the GRIT under the stones - the layer is
    // already the right grey - and it is swept, not burned, now.
    boon: { at: { x: 2600, y: 440 }, patch: { x: 2250, y: 300, w: 700, h: 400 }, mat: "ash" }
  };
  ROOTS.forEach((r, i) => Object.assign(r, PLACES[r.id], { seed: i * 5 + 3, order: i }));
  var inRiver = (x, y) => {
    const r = riverAt(x, y);
    return r.d < widthAt(r.s);
  };
  var nearRiver = (x, y, pad4) => {
    const r = riverAt(x, y);
    return r.d < widthAt(r.s) + pad4;
  };
  var INFLOW = [[4640, 1180], [4560, 1430], [4470, 1620], [4400, 1740]];
  var drained = false;
  var ROAD = [[2600, 3340], [2600, 2900], [2560, 2500], [2600, 2100], [2600, 1820]];
  var SPURS = [
    [[2420, 2e3], [2e3, 2180], [1500, 2300], [1160, 2340]],
    [[2820, 1900], [3020, 1990], [3240, 2080]],
    [[2380, 1480], [1800, 1320], [1200, 1180], [760, 1120]],
    [[2820, 1420], [3400, 1120], [3900, 880], [4180, 760]],
    [[2600, 1320], [2600, 960], [2600, 600], [2600, 420]]
  ];
  var SHELTERS = [
    { x: 2600, y: 1080, r: 110 },
    { x: 2600, y: 700, r: 110 },
    // the north road
    { x: 1810, y: 1330, r: 110 },
    { x: 1250, y: 1200, r: 110 },
    // the west road
    // THE NORTH-EAST ROAD had none, and it is the one road where the coal runs
    // out fastest: snow drinks it half again as quick as thorn does. Walking
    // back to the shrine from the drift is the longest walk in the valley.
    { x: 3220, y: 1210, r: 110 },
    { x: 3640, y: 1005, r: 110 }
    // out to the snow
  ];
  var SHRINE = { x: TREE.x, y: TREE.y + 150, r: 300 };
  var COURT = { x: SHRINE.x - 270, y: SHRINE.y - 120, w: 540, h: 300 };
  var BROOM_HOME = { x: 2296, y: 1932 };
  var TOOLNAME = { broom: "her broom", crank: "the iron crank", lamp: "her lamp" };
  var broom = { x: BROOM_HOME.x, y: BROOM_HOME.y, held: false };
  var YOUNG = [];
  function polyDist(x, y, pts) {
    let d = 1e9;
    for (let i = 1; i < pts.length; i++) d = Math.min(d, seg(x, y, pts[i - 1], pts[i]));
    return d;
  }
  var seg = (x, y, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t));
  };
  function roadDist(x, y) {
    let d = 1e9;
    for (let i = 1; i < ROAD.length; i++) d = Math.min(d, seg(x, y, ROAD[i - 1], ROAD[i]));
    for (const s of SPURS) for (let i = 1; i < s.length; i++) d = Math.min(d, seg(x, y, s[i - 1], s[i]));
    return d;
  }
  var vn = (x, y) => {
    const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return s - Math.floor(s);
  };
  function smoothN(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = vn(xi, yi), b = vn(xi + 1, yi), c = vn(xi, yi + 1), d = vn(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm2(x, y) {
    let v = 0, a = 0.5, f = 1;
    for (let i = 0; i < 3; i++) {
      v += smoothN(x * f, y * f) * a;
      a *= 0.5;
      f *= 2.07;
    }
    return v;
  }
  function inSoft(x, y, r, soft) {
    const e = Math.min(Math.min(x - r.x, r.x + r.w - x), Math.min(y - r.y, r.y + r.h - y));
    return e >= 0 ? 1 : Math.max(0, 1 + e / soft);
  }
  var CLUMPS = [
    [-0.98, -0.52, 0.3],
    [0.86, -0.74, 0.25],
    [1.04, 0.4, 0.27],
    [-0.7, 0.94, 0.23],
    [0.14, 1.12, 0.26],
    [-1.16, 0.2, 0.21]
  ];
  function thicket(x, y, p) {
    const rx = p.w / 2, ry = p.h / 2;
    const dx = (x - (p.x + rx)) / rx, dy = (y - (p.y + ry)) / ry;
    const n = (fbm2(x * 85e-4, y * 85e-4) - 0.5) * 0.46;
    const a = Math.atan2(dy, dx);
    const rim = 1 + Math.sin(a * 3 + 0.8) * 0.15 + Math.sin(a * 5 - 1.9) * 0.09 + Math.sin(a * 9 + 2.4) * 0.055;
    let k = clamp012((rim + n - Math.hypot(dx, dy)) / 0.26);
    for (const [ox, oy, r] of CLUMPS) {
      const d = Math.hypot(dx - ox, dy - oy);
      k = Math.max(k, clamp012((r + n * 0.6 - d) / 0.17) * 0.92);
    }
    return k;
  }
  function classify(x, y) {
    const inD = polyDist(x, y, INFLOW);
    if (inD < 26) return TT.WATER;
    if (inD < 46) return TT.SHALLOW;
    if (inTarn(x, y)) return TT.WATER;
    if (inTarn(x, y, 32)) return TT.SHALLOW;
    if (onSolid(x, y)) return TT.ROCK;
    const rv = riverAt(x, y);
    const rw = widthAt(rv.s);
    if (rv.d < rw) {
      if (drained) return rv.d < rw * 0.55 ? TT.MUD : TT.SHALLOW;
      return inShallow(x, y) ? TT.SHALLOW : TT.WATER;
    }
    if (inWall(x, y)) return TT.ROCK;
    const n = fbm2(x * 16e-4, y * 16e-4);
    if (roadDist(x, y) < 46) return TT.DIRT;
    if (inSoft(x, y, PLACES.boon.patch, 280) > 0.34 + n * 0.3) return TT.GRAVEL;
    if (inSoft(x, y, PLACES.steps.patch, 320) > 0.3 + n * 0.3) return TT.SNOW;
    const dt = Math.hypot(x - TREE.x, y - TREE.y);
    if (dt < 430 + n * 190) return TT.MOSS;
    const edge = Math.min(x, y, V.w - x, V.h - y);
    if (edge < 300 + n * 340) return n > 0.52 ? TT.ROCK : TT.GRAVEL;
    if (n > 0.62) return TT.TALL;
    if (n < 0.31) return TT.DIRT;
    return TT.GRASS;
  }
  var CELL2 = 14;
  var LITTER = 0.16;
  var DUST = ["#9b8b71", "#877963", "#b0a287", "#7a6d59"];
  var CLEAR = 0.3;
  var MAT = { none: 0, leaves: 1, snow: 2, thorn: 3, ash: 4 };
  var BURN = {
    2: { reach: 104, arc: 1.45, rate: 3.4, drain: 0.13, steam: true },
    // snow
    3: { reach: 68, arc: 1, rate: 2.4, drain: 0.085, steam: false }
    // thorn
  };
  var BURNS = BURN;
  var MATS = [
    null,
    { drag: 0.42, heal: 0.03, col: ["#c9762c", "#e0a13f", "#a5551f", "#d98a30"] },
    { drag: 0.5, heal: 0, col: ["#e9eff5", "#d6dee8", "#f4f8fc", "#c6d0dc"] },
    { drag: 0.3, heal: 0.09, col: ["#2b2233", "#1c1626", "#372b40", "#241d2e"] },
    { drag: 0.2, heal: 0.04, col: ["#5a5550", "#484340", "#67615b", "#4f4a47"] }
  ];
  var G2 = { w: 0, h: 0, mat: null, dep: null, base: null, orig: null, cv: null, cx: null, img: null };
  function buildGround() {
    G2.w = Math.ceil(V.w / CELL2);
    G2.h = Math.ceil(V.h / CELL2);
    const n = G2.w * G2.h;
    G2.mat = new Uint8Array(n);
    G2.dep = new Float32Array(n);
    G2.base = new Float32Array(n);
    G2.orig = new Float32Array(n);
    const put = (rect, m, amt, soft) => {
      for (let j = 0; j < G2.h; j++) {
        for (let i = 0; i < G2.w; i++) {
          const x = i * CELL2 + 7, y = j * CELL2 + 7;
          let k = inSoft(x, y, rect, soft);
          if (k <= 0) continue;
          k *= 0.68 + 0.32 * fbm2(x * 6e-3, y * 6e-3);
          const q = j * G2.w + i, d = amt * clamp012(k);
          if (d <= G2.base[q] || nearRiver(x, y, 40)) continue;
          G2.base[q] = d;
          G2.dep[q] = d;
          G2.orig[q] = d;
          G2.mat[q] = m;
        }
      }
    };
    const blob2 = (rect, m, amt) => {
      const gx = rect.w * 0.42, gy = rect.h * 0.42;
      const i0 = Math.max(0, (rect.x - gx) / CELL2 | 0), i1 = Math.min(G2.w - 1, (rect.x + rect.w + gx) / CELL2 | 0);
      const j0 = Math.max(0, (rect.y - gy) / CELL2 | 0), j1 = Math.min(G2.h - 1, (rect.y + rect.h + gy) / CELL2 | 0);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const x = i * CELL2 + 7, y = j * CELL2 + 7;
          const k = thicket(x, y, rect);
          if (k <= 0.02) continue;
          const q = j * G2.w + i, d = amt * (0.62 + 0.38 * k) * clamp012(k * 1.35);
          if (d <= G2.base[q] || nearRiver(x, y, 40)) continue;
          G2.base[q] = d;
          G2.dep[q] = d;
          G2.orig[q] = d;
          G2.mat[q] = m;
        }
      }
    };
    put({ x: -200, y: -200, w: V.w + 400, h: V.h + 400 }, MAT.leaves, LITTER + 0.05, 1);
    for (const d of DRIFTS) {
      put({ x: d.x - d.r, y: d.y - d.r * 0.62, w: d.r * 2, h: d.r * 1.24 }, MAT.leaves, d.d, d.r * 0.85);
    }
    put(COURT, MAT.leaves, 0.95, 150);
    for (const r of ROOTS) {
      if (r.mat === "water") continue;
      blob2(r.patch, MAT[r.mat], 1);
    }
    G2.cv = document.createElement("canvas");
    G2.cv.width = G2.w;
    G2.cv.height = G2.h;
    G2.cx = G2.cv.getContext("2d");
    G2.img = G2.cx.createImageData(G2.w, G2.h);
    paintLayerColours();
  }
  function paintLayerColours() {
    const d = G2.img.data;
    for (let j = 0, q = 0, p = 0; j < G2.h; j++) {
      for (let i = 0; i < G2.w; i++, q++, p += 4) {
        const m = G2.mat[q];
        if (!m) continue;
        const col = MATS[m].col[i * 5 + j * 3 & 3];
        const lit = 0.8 + vn(i * 0.7, j * 0.9) * 0.36;
        d[p] = Math.min(255, parseInt(col.slice(1, 3), 16) * lit);
        d[p + 1] = Math.min(255, parseInt(col.slice(3, 5), 16) * lit);
        d[p + 2] = Math.min(255, parseInt(col.slice(5, 7), 16) * lit);
      }
    }
  }
  function depAt(x, y) {
    const i = x / CELL2 | 0, j = y / CELL2 | 0;
    if (i < 0 || j < 0 || i >= G2.w || j >= G2.h) return { m: 0, d: 0 };
    const q = j * G2.w + i;
    return { m: G2.mat[q], d: G2.dep[q] };
  }
  var healRow = 0;
  function settle(dt) {
    const rows2 = 48;
    for (let k = 0; k < rows2; k++) {
      const j = (healRow + k) % G2.h;
      for (let i = 0; i < G2.w; i++) {
        const q = j * G2.w + i, m = G2.mat[q];
        if (!m) continue;
        const h = MATS[m].heal;
        if (h) G2.dep[q] += (G2.base[q] - G2.dep[q]) * Math.min(1, h * dt * (G2.h / rows2));
      }
    }
    healRow = (healRow + rows2) % G2.h;
  }
  function cleared(p, m) {
    const i0 = Math.max(0, p.x / CELL2 | 0), i1 = Math.min(G2.w - 1, (p.x + p.w) / CELL2 | 0);
    const j0 = Math.max(0, p.y / CELL2 | 0), j1 = Math.min(G2.h - 1, (p.y + p.h) / CELL2 | 0);
    let t = 0, o = 0;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const q = j * G2.w + i;
        if (G2.mat[q] !== m || G2.orig[q] < 0.5) continue;
        t++;
        if (G2.dep[q] < CLEAR) o++;
      }
    }
    return t ? o / t : 1;
  }
  var GOAL = { rx: 126, ry: 78 };
  function clearedNear(at, m) {
    const i0 = Math.max(0, (at.x - GOAL.rx) / CELL2 | 0), i1 = Math.min(G2.w - 1, (at.x + GOAL.rx) / CELL2 | 0);
    const j0 = Math.max(0, (at.y - GOAL.ry) / CELL2 | 0), j1 = Math.min(G2.h - 1, (at.y + GOAL.ry) / CELL2 | 0);
    let t = 0, o = 0;
    for (let j = j0 & ~1; j <= j1; j += 2) {
      for (let i = i0 & ~1; i <= i1; i += 2) {
        const q = j * G2.w + i;
        if (G2.mat[q] !== m || G2.orig[q] < 0.5) continue;
        const dx = (i * CELL2 + 7 - at.x) / GOAL.rx, dy = (j * CELL2 + 7 - at.y) / GOAL.ry;
        if (dx * dx + dy * dy > 1) continue;
        t++;
        if (G2.dep[q] < CLEAR) o++;
      }
    }
    return t ? o / t : 1;
  }
  var fraction = (r) => clearedNear(r.at, MAT[r.mat]);
  var P2 = [];
  function spark(x, y, n, o) {
    for (let i = 0; i < n; i++) {
      const a = (o.angle === void 0 ? rand(0, TAU) : o.angle) + rand(-(o.arc || TAU) / 2, (o.arc || TAU) / 2);
      const sp = rand(o.sp0 || 40, o.sp1 || 200);
      P2.push({
        x: x + rand(-8, 8),
        y: y + rand(-8, 8),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - (o.lift || 0),
        life: rand(o.l0 || 0.5, o.l1 || 1.4),
        t: 0,
        s: rand(o.s0 || 3, o.s1 || 7),
        rot: rand(0, TAU),
        spin: rand(-6, 6),
        col: o.col[Math.random() * o.col.length | 0],
        kind: o.kind || "flat",
        drag: o.drag || 1.8
      });
      if (P2.length > 900) P2.shift();
    }
  }
  function stepParticles(dt) {
    for (let i = P2.length - 1; i >= 0; i--) {
      const p = P2[i];
      p.t += dt;
      if (p.t >= p.life) {
        P2.splice(i, 1);
        continue;
      }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      if (p.kind === "ember") p.vy -= 30 * dt;
      if (p.kind === "dust") p.vy -= 14 * dt;
      if (p.kind === "leaf") {
        p.vx += Math.cos(p.rot * 1.6) * 34 * dt;
        p.vy += (26 - Math.sin(p.rot * 1.6) * 20) * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
    }
  }
  function drawParticles(c) {
    for (const p of P2) {
      const a = 1 - p.t / p.life;
      c.globalAlpha = p.kind === "ember" ? a : a * 0.9;
      c.fillStyle = p.col;
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      if (p.kind === "ember") {
        c.beginPath();
        c.arc(0, 0, p.s * a * 0.6, 0, TAU);
        c.fill();
      } else if (p.kind === "drop") {
        c.beginPath();
        c.ellipse(0, 0, p.s * 0.5, p.s, 0, 0, TAU);
        c.fill();
      } else if (p.kind === "leaf") drawLeafSprite(c, p.s * 0.8, p.rot * 1.6);
      else if (p.kind === "dust") {
        c.globalAlpha = a * a * 0.5;
        c.beginPath();
        c.arc(0, 0, p.s * (0.7 + (1 - a) * 1.5), 0, TAU);
        c.fill();
      } else {
        c.beginPath();
        c.ellipse(0, 0, p.s * 0.6, p.s * 0.36, 0, 0, TAU);
        c.fill();
      }
      c.restore();
    }
    c.globalAlpha = 1;
  }
  var S = {
    x: START.x,
    y: START.y,
    r: 12,
    vx: 0,
    vy: 0,
    face: -Math.PI / 2,
    phase: 0,
    speed: 0,
    act: 0,
    actA: 0,
    dead: false,
    lastStep: 0,
    dashing: false,
    z: 0,
    vz: 0,
    safeX: START.x,
    safeY: START.y
  };
  var st = {
    t: 0,
    woken: {},
    count: 0,
    step: 0,
    ember: 0,
    hasEmber: false,
    bloom: 0,
    bloomK: 0,
    warmth: 0,
    ended: false,
    started: false,
    // The apprenticeship: how many roots are awake, and whether she has been
    // told about the next one and handed the tool for it. See savi-quest.js.
    done: 0,
    briefed: false,
    tools: {},
    sawOpening: false,
    lastRoot: "",
    think: null,
    // The end, in three beats: she is sent, she reads the sixth panel and the
    // tree blooms, she comes back and is told what she has become. Then the
    // titles, and then the valley is hers to walk in.
    sent: false,
    blessed: false,
    after: false,
    credits: false,
    // WHAT IS IN HER HANDS, and the belt she changes it from. `tools` is what
    // she has been GIVEN and never loses; `equip` is the one thing she is
    // actually holding, which used to be "all of them at once, for ever".
    equip: null,
    stowed: null,
    wheel: null,
    // SHE STANDS AND WATCHES THE WATER GO. From the moment the gate lifts to
    // the moment the tree has something to tell her, the valley is doing the
    // work and she is not: no walking, no jumping, no sweeping. It is the one
    // thing in the game she has set off and cannot help with, and wandering
    // away mid-flood threw the whole beat away.
    watching: false,
    watchT: 0,
    talking: null,
    reading: null,
    metKeeper: false,
    nearWoman: false,
    asked: {},
    told: 0,
    prompt: "",
    cue: "",
    swept: false
  };
  var ctx2 = null;
  var cv = null;
  var terrain = null;
  var grass = null;
  var water = null;
  var overlay = null;
  var rotateEl = null;
  var forceTouch = typeof location !== "undefined" && /[?&]touch=1/.test(location.search);
  var isTouch = () => forceTouch || touchLike();
  function isPortraitTouch() {
    if (!isTouch()) return false;
    const type = screen.orientation && screen.orientation.type;
    const tall = window.innerHeight > window.innerWidth;
    if (!type) return tall;
    return type.startsWith("portrait") && tall;
  }
  function checkOrientation() {
    if (!rotateEl) return;
    rotateEl.classList.toggle("on", st.started && isPortraitTouch());
  }
  var touch = { on: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
  var STICK_MAX = 62;
  var pad3 = {
    on: false,
    mx: 0,
    my: 0,
    id: "",
    held: false,
    pressed: false,
    // square / R2: the action
    upHeld: false,
    upPressed: false,
    // and the stick, for choosing a reply
    downHeld: false,
    downPressed: false,
    leftHeld: false,
    leftPressed: false,
    // and across, for a volume in the menu
    rightHeld: false,
    rightPressed: false,
    menuHeld: false,
    menuPressed: false,
    // options / start: the pause screen
    thinkHeld: false,
    thinkPressed: false,
    // triangle / Y: put her thought down
    jumpHeld: false,
    jumpPressed: false,
    // cross
    dashHeld: false,
    dashPressed: false,
    // circle
    beltHeld: false,
    beltPressed: false
    // L1: the belt
  };
  function pollPad() {
    const list2 = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const g of list2) if (g && g.connected) {
      gp = g;
      break;
    }
    pad3.on = !!gp;
    if (gp && gp.id !== pad3.id) {
      pad3.id = gp.id;
      setPadStyle(gp.id);
    }
    if (!gp) {
      pad3.mx = 0;
      pad3.my = 0;
      pad3.held = pad3.pressed = false;
      pad3.jumpHeld = pad3.jumpPressed = false;
      pad3.dashHeld = pad3.dashPressed = false;
      pad3.beltHeld = pad3.beltPressed = false;
      pad3.upHeld = pad3.upPressed = pad3.downHeld = pad3.downPressed = false;
      pad3.leftHeld = pad3.leftPressed = pad3.rightHeld = pad3.rightPressed = false;
      pad3.menuHeld = pad3.menuPressed = false;
      pad3.thinkHeld = pad3.thinkPressed = false;
      return;
    }
    const dead = (v) => Math.abs(v) < 0.24 ? 0 : (v - Math.sign(v) * 0.24) / 0.76;
    let mx = dead(gp.axes[0] || 0), my = dead(gp.axes[1] || 0);
    const b = gp.buttons;
    const down = (i) => !!(b[i] && (b[i].pressed || b[i].value > 0.4));
    if (down(12)) my = -1;
    if (down(13)) my = 1;
    if (down(14)) mx = -1;
    if (down(15)) mx = 1;
    pad3.mx = mx;
    pad3.my = my;
    const act = down(2) || down(7);
    const jump = down(0);
    const dash = down(1) || down(5);
    const up = my < -0.55, dn = my > 0.55;
    pad3.upPressed = up && !pad3.upHeld;
    pad3.upHeld = up;
    pad3.downPressed = dn && !pad3.downHeld;
    pad3.downHeld = dn;
    const lf = mx < -0.55, rt = mx > 0.55;
    pad3.leftPressed = lf && !pad3.leftHeld;
    pad3.leftHeld = lf;
    pad3.rightPressed = rt && !pad3.rightHeld;
    pad3.rightHeld = rt;
    pad3.menuPressed = down(9) && !pad3.menuHeld;
    pad3.menuHeld = down(9);
    pad3.thinkPressed = down(3) && !pad3.thinkHeld;
    pad3.thinkHeld = down(3);
    pad3.jumpPressed = jump && !pad3.jumpHeld;
    pad3.jumpHeld = jump;
    pad3.dashPressed = dash && !pad3.dashHeld;
    pad3.dashHeld = dash;
    pad3.beltPressed = down(4) && !pad3.beltHeld;
    pad3.beltHeld = down(4);
    pad3.pressed = act && !pad3.held;
    pad3.held = act;
  }
  var forceMove = null;
  var holding = false;
  var wasHolding = false;
  var tapDone = false;
  var actT = 0;
  var beltAxis = false;
  var readAxis = false;
  var drain = 0;
  var crackT = 0;
  var canopySee = 1;
  var GORGE = { inside: inGorge, mouth: MOUTH_AT, where: "south-west, at the foot of the water" };
  var dtSeen = 1 / 60;
  var warmedArt = false;
  var ripT = 0;
  var taughtX = START.x;
  var taughtY = START.y;
  var DASH_TIME = 0.16;
  var DASH_SPEED = 570;
  var DASH_MAX = 2;
  var DASH_BACK = 1.1;
  var dashT = 0;
  var dashDir = 0;
  var dashStock = DASH_MAX;
  var dashRecharge = 0;
  var dashWant = false;
  var JUMP_V = 350;
  var GRAV_UP = 1180;
  var GRAV_DOWN = 1600;
  var COYOTE = 0.12;
  var BUFFER = 0.14;
  var jumpWant = 0;
  var coyote = 0;
  var held = false;
  var wasHeld = false;
  var onLeaf = null;
  var footing = null;
  function startJump() {
    noteJump();
    if (st.talking || st.reading) return;
    S.vz = JUMP_V;
    S.z = 0.6;
    jumpWant = 0;
    coyote = 0;
    wasHeld = true;
    sfx.click();
    if (onLeaf) {
      onLeaf.sink = Math.min(1, onLeaf.sink + 0.14);
      water.splash(S.x, S.y + 6, 70, 1.1);
    } else if (water.wetAt(S.x, S.y + 6)) water.splash(S.x, S.y + 6, 90, 1.3);
    else {
      const u = depAt(S.x, S.y + 6);
      if (u.m && u.d > 0.12) spark(S.x, S.y + 6, 8, { col: MATS[u.m].col, sp0: 40, sp1: 160, l0: 0.5, l1: 1.2, s0: 4, s1: 9, lift: 40 });
    }
  }
  var isDeep = (x, y) => !drained && inRiver(x, y) && !inShallow(x, y) && !onSolid(x, y);
  var supported = (x, y) => !isDeep(x, y) || !!leafAt(x, y);
  function fallIn() {
    water.splash(S.x, S.y + 6, 220, 2.6);
    spark(S.x, S.y + 6, 26, { col: ["#bfe0e8", "#8fbcc8", "#dff0f4"], sp0: 60, sp1: 260, l0: 0.5, l1: 1.3, s0: 3, s1: 8, kind: "drop", lift: 70 });
    sfx.splash();
    if (footing && footing.sink !== void 0 && footing.sink < 0.9) {
      S.x = footing.x;
      S.y = footing.y + (footing.dip || 0);
    } else if (footing) {
      S.x = footing.x;
      S.y = footing.y;
    } else {
      S.x = S.safeX;
      S.y = S.safeY;
    }
    S.z = 0;
    S.vz = 0;
    onLeaf = null;
    camera.x = clamp(S.x - view.w / 2, 0, Math.max(0, V.w - view.w));
    camera.y = clamp(S.y - view.h / 2, 0, Math.max(0, V.h - view.h));
  }
  var lastTurn = 0;
  function stepCapstan(dt) {
    if (drained) {
      S.crank = null;
      return;
    }
    easeCapstan(dt);
    if (!has(st, "crank")) return;
    const moving = S.speed > 30 && S.z <= 0.5;
    const opened = windCapstan(S.x, S.y, moving);
    if (CAPSTAN.gripping) {
      const g = capstanGrip(S.x, S.y);
      S.crank = { dx: g[0] - S.x, dy: g[1] - S.y };
    } else S.crank = null;
    if (CAPSTAN.turns > lastTurn + 0.125) {
      lastTurn = CAPSTAN.turns;
      sfx.clack(0.7);
      rumble(0.18, 0.1, 60);
      if (Math.random() < 0.5) {
        spark(
          GATE.x,
          GATE.y + rand(-30, 30),
          1,
          { col: ["#bfe0e8", "#8fbcc8"], sp0: 20, sp1: 90, l0: 0.4, l1: 1, s0: 2, s1: 5, kind: "drop" }
        );
      }
    }
    if (CAPSTAN.turns < lastTurn) lastTurn = CAPSTAN.turns;
    if (!opened) return;
    sfx.bossDown();
    drained = true;
    st.watching = true;
    st.watchT = 0;
    terrain.invalidate(2700, 1200, 5200, 3200);
    terrain.warm(camera.x, camera.y, view.w, view.h);
    water.splash(GATE.x, GATE.y, 420, 4.4);
    spark(GATE.x, GATE.y, 110, { col: ["#bfe0e8", "#c6e2ea", "#8fbcc8"], sp0: 120, sp1: 460, l0: 0.9, l1: 2.1, s0: 4, s1: 10, kind: "drop" });
    rumble(0.9, 0.6, 340);
  }
  function startDash() {
    noteDash();
    if (dashT > 0 || dashStock <= 0 || st.talking || st.reading || carried || st.watching) return;
    const mv = moveVector();
    const m = Math.hypot(mv.x, mv.y);
    dashDir = m > 0.15 ? Math.atan2(mv.y, mv.x) : S.face;
    S.face = dashDir;
    dashT = DASH_TIME;
    dashStock--;
    if (dashRecharge <= 0) dashRecharge = DASH_BACK;
    sfx.dash();
    rumble(0.3, 0.2, 90);
    const fx2 = groundFx(S.x, S.y + 6);
    if (water.wetAt(S.x, S.y + 6)) water.splash(S.x, S.y + 6, 120, 2);
    if (fx2) {
      spark(S.x, S.y + 6, fx2.kind === "drop" ? 14 : 16, {
        col: fx2.col,
        angle: dashDir + Math.PI,
        arc: 1.7,
        sp0: 90,
        sp1: 300,
        l0: 0.5,
        l1: 1.4,
        s0: 4,
        s1: 10,
        lift: fx2.lift,
        drag: 1.3,
        kind: fx2.kind
      });
      const u = depAt(S.x, S.y + 6);
      if (u.m === MAT.leaves && u.d > 0.2) pushLitter(S.x, S.y + 8, 58, Math.cos(dashDir), Math.sin(dashDir), 9);
    }
  }
  var BTN = {
    act: { r: 0, x: 0, y: 0, id: -1, on: false },
    jump: { r: 0, x: 0, y: 0, id: -1, on: false },
    dash: { r: 0, x: 0, y: 0, id: -1, on: false },
    belt: { r: 0, x: 0, y: 0, id: -1, on: false, off: true },
    // The pause button, top right, and only on a phone: a keyboard has escape
    // and a pad has start, and neither wants a target drawn over the valley.
    menu: { r: 0, x: 0, y: 0, id: -1, on: false, off: true }
  };
  function layoutButtons() {
    const t = isTouch();
    const s = t ? clamp(view.h / 400, 1, 1.55) : 1;
    const m = t ? Math.max(34, view.w * 0.04) : 22;
    BTN.act.r = (t ? 44 : 38) * s;
    BTN.jump.r = (t ? 35 : 32) * s;
    BTN.dash.r = (t ? 33 : 32) * s;
    BTN.belt.r = (t ? 32 : 27) * s;
    const right = view.w - m, bottom = view.h - m;
    BTN.jump.x = right - BTN.jump.r;
    BTN.jump.y = bottom - BTN.jump.r;
    BTN.act.x = BTN.jump.x - BTN.jump.r - BTN.act.r - 8;
    BTN.act.y = bottom - BTN.act.r - BTN.jump.r * 0.55;
    BTN.dash.x = right - BTN.dash.r;
    BTN.dash.y = BTN.jump.y - BTN.jump.r - BTN.dash.r - 14;
    BTN.belt.x = m + BTN.belt.r;
    BTN.belt.y = bottom - BTN.belt.r;
    BTN.belt.off = belt().length < 2;
    BTN.menu.r = 24 * s;
    BTN.menu.x = right - BTN.menu.r;
    BTN.menu.y = m + BTN.menu.r;
    BTN.menu.off = !t;
  }
  function hitButton(px, py) {
    let best = null, bd = 1e9;
    for (const k of Object.keys(BTN)) {
      const b = BTN[k];
      if (b.off) continue;
      const d = Math.hypot(px - b.x, py - b.y);
      if (d < b.r * 1.22 && d < bd) {
        bd = d;
        best = k;
      }
    }
    return best;
  }
  function releaseButton(id) {
    for (const k of Object.keys(BTN)) {
      const b = BTN[k];
      if (b.id === id) {
        b.id = -1;
        b.on = false;
        return k;
      }
    }
    return null;
  }
  var beltSlots = [];
  function current() {
    const s2 = stage(st);
    if (!s2) return null;
    return ROOTS.find((r) => r.id === s2.root && !st.woken[r.id]) || null;
  }
  var win = () => ({ x: camera.x, y: camera.y, w: view.w, h: view.h });
  var STROKE = { wind: 0.07, work: 0.2, rest: 0.1 };
  var SWEEP_BITE = 16;
  var stroke = null;
  var strokeN = 0;
  function beginStroke() {
    if (stroke || st.talking || st.reading || st.watching) return false;
    if (!drained && Math.hypot(S.x - CAPSTAN.x, S.y - CAPSTAN.y) < CAPSTAN.r + 40) return false;
    if (st.equip !== "broom") return false;
    const a = S.face, fx2 = Math.cos(a), fy = Math.sin(a);
    let m = 0, deepest = 0, burny = 0;
    for (let d = 0; d <= 70; d += 14) {
      const c = depAt(S.x + fx2 * d, S.y + fy * d + 6);
      if (!c.m) continue;
      if (BURNS[c.m]) {
        if (c.d > burny) burny = c.d;
        continue;
      }
      if (c.d > deepest) {
        deepest = c.d;
        m = c.m;
      }
    }
    if (burny > 0.12) return false;
    stroke = { t: 0, side: S.lastSide = -(S.lastSide || 1), mat: m || MAT.leaves, dry: deepest < 0.24 };
    sfx.swish(stroke.dry ? 0.7 : 1);
    return true;
  }
  function stepStroke(dt) {
    if (!stroke) return;
    stroke.t += dt;
    const total = STROKE.wind + STROKE.work + STROKE.rest;
    const k = stroke.t / total;
    S.sweep = stroke.side * Math.cos(clamp012(k) * Math.PI) * 0.95;
    S.act = total - stroke.t + 0.04;
    const biting = stroke.t > STROKE.wind && stroke.t < STROKE.wind + STROKE.work;
    if (biting) {
      const a = S.face + S.sweep * 0.7;
      const took = carve(S.x + Math.cos(a) * 34, S.y + Math.sin(a) * 34 + 6, a, 62, 0.8, dt * SWEEP_BITE, stroke.mat);
      const out = a + stroke.side * 1.15;
      const at = depAt(S.x + Math.cos(a) * 40, S.y + Math.sin(a) * 40 + 6);
      const real = at.m === stroke.mat && at.d > CLEAR * 0.66 && took > 4e-4;
      if (real) {
        if (stroke.mat === MAT.leaves) {
          pushLitter(S.x + Math.cos(a) * 46, S.y + Math.sin(a) * 46 + 6, 52, Math.cos(out), Math.sin(out), dt * 70);
        }
        spark(S.x + Math.cos(a) * 62, S.y + Math.sin(a) * 62 + 6, 3, stroke.mat === MAT.snow ? { col: ["#ffffff", "#e4ecf4", "#cfdae6"], angle: out, arc: 0.7, sp0: 130, sp1: 300, l0: 0.4, l1: 1, s0: 3, s1: 7, lift: 56 } : { col: MATS[stroke.mat].col, angle: out, arc: 0.8, sp0: 170, sp1: 420, l0: 0.7, l1: 1.7, s0: 5, s1: 12, lift: 46, drag: 1.2 });
        if (!stroke.sounded) {
          stroke.sounded = true;
          strokeN++;
          if (strokeN & 1) {
            stroke.mat === MAT.snow ? sfx.clack(1.6) : sfx.hiss();
          }
          rumble(0.2, 0.12, 70);
        }
      } else if (!stroke.dusted) {
        stroke.dusted = true;
        spark(S.x + Math.cos(a) * 54, S.y + Math.sin(a) * 54 + 6, 5, {
          col: DUST,
          angle: out,
          arc: 1.3,
          sp0: 30,
          sp1: 120,
          l0: 0.35,
          l1: 0.85,
          s0: 2,
          s1: 5,
          lift: 14,
          drag: 2.6
        });
      }
    }
    if (stroke.t >= total) {
      stroke = null;
      S.act = 0;
      S.sweep = 0;
      tapDone = false;
    }
  }
  function actHold(dt) {
    if (st.talking || st.reading || stroke || st.watching) return;
    if (tapDone) return;
    if (st.equip !== "lamp") return;
    const a = S.face, fx2 = Math.cos(a), fy = Math.sin(a);
    let m = 0, deepest = 0;
    for (let d = 0; d <= 60; d += 12) {
      const c = depAt(S.x + fx2 * d, S.y + fy * d + 6);
      if (BURNS[c.m] && c.d > deepest) {
        deepest = c.d;
        m = c.m;
      }
    }
    if (!m || deepest < 0.12) {
      S.act = 0;
      return;
    }
    if (!(st.hasEmber && st.ember > 0.02)) {
      if (actT <= 0) {
        actT = 1.2;
        say2(st.hasEmber ? [["keeper", `Your coal has gone out, child. There is a fire ${towardFire()}. Stand at it a moment and it will fill again.`]] : [["keeper", "This will not move for hands. The old woman keeps a fire. Take a coal from it and hold it out."]], null);
      }
      return;
    }
    S.act = 0.14;
    S.sweep = Math.sin(st.t * 3) * 0.12;
    const b = BURN[m];
    const took = carve(S.x, S.y + 6, a, b.reach, b.arc, dt * b.rate, m);
    if (took <= 6e-4) {
      crackT = 0;
      S.act = 0;
      return;
    }
    S.burn = b;
    st.ember = Math.max(0, st.ember - dt * b.drain);
    if (Math.random() < dt * (b.steam ? 48 : 40)) {
      const mx = S.x + fx2 * 16, my = S.y - 11 + fy * 9;
      spark(mx, my, 1, b.steam ? { col: ["#e8f2f6", "#cfe0e8", "#ffffff"], sp0: 50, sp1: 150, l0: 0.9, l1: 2, s0: 7, s1: 15, kind: "dust", lift: 44, angle: a, arc: b.arc, drag: 2.6 } : { col: ["#ffb35e", "#ff7a2e", "#ffd9a0"], sp0: 110, sp1: 280, l0: 0.34, l1: 0.8, s0: 3, s1: 6, kind: "ember", lift: 22, angle: a, arc: b.arc, drag: 3.2 });
    }
    crackT -= dt;
    if (crackT <= 0) {
      crackT = 0.9 + Math.random() * 0.6;
      sfx.hiss();
    }
  }
  var TOOLS = [
    { id: null, name: "empty hands", note: "nothing in them" },
    { id: "broom", name: "the broom", note: "sweep what is lying on a root" },
    { id: "lamp", name: "the lantern", note: "hold the fire out at what will not move" }
  ];
  function belt() {
    return TOOLS.filter((t) => t.id === null || (t.id === "broom" ? broom.held || has(st, "broom") : has(st, t.id)));
  }
  function openBelt() {
    if (st.talking || st.reading || st.watching || cinemaOn()) return;
    const b = belt();
    if (b.length < 2) return;
    const i = b.findIndex((t) => t.id === st.equip);
    st.wheel = { sel: i < 0 ? 0 : i, t: 0 };
    sfx.ui();
  }
  function closeBelt(take) {
    const w = st.wheel;
    st.wheel = null;
    if (!take || !w) return;
    const b = belt();
    const pick2 = b[Math.max(0, Math.min(b.length - 1, w.sel))];
    equipTool(pick2 ? pick2.id : null);
  }
  function equipTool(id) {
    if (st.equip === id) {
      sfx.click();
      return;
    }
    st.equip = id;
    if (id === "broom") broom.held = true;
    sfx.pickup();
    const t = TOOLS.find((q) => q.id === id);
    toast = { t: 0, text: id ? `she takes ${t.name}` : "her hands are empty" };
  }
  function beltMove(d) {
    const b = belt();
    st.wheel.sel = (st.wheel.sel + d + b.length) % b.length;
    sfx.tick();
  }
  var FINAL = { x: TREE.x - 6, y: TREE.y + 8, mural: "bloom", name: "The Boon Granted" };
  var finalRead = () => ({ mural: FINAL.mural, name: FINAL.name, lines: CLIMAX });
  var finalUp = () => st.count >= ROOTS.length && st.sent && !(st.bloom >= 1);
  function unreadMural() {
    for (const yt of YOUNG) if (yt.pending && yt.grow >= 1) return yt;
    return null;
  }
  function towardFire() {
    let best = FIRE, bd = Math.hypot(S.x - FIRE.x, S.y - FIRE.y);
    for (const h of SHELTERS) {
      const d = Math.hypot(S.x - h.x, S.y - h.y);
      if (d < bd) {
        bd = d;
        best = h;
      }
    }
    const dx = best.x - S.x, dy = best.y - S.y;
    const way = Math.abs(dx) > Math.abs(dy) ? dx > 0 ? "east" : "west" : dy > 0 ? "south" : "north";
    return bd < 420 ? `just ${way} of you` : `back ${way}`;
  }
  function groundFx(x, y) {
    const u = depAt(x, y);
    if (u.m && u.d > 0.34) {
      if (u.m === MAT.leaves) return { col: MATS[1].col, kind: "leaf", lift: 40 };
      if (u.m === MAT.snow) return { col: ["#ffffff", "#e8eff6", "#cfdae6"], kind: "dust", lift: 30 };
      if (u.m === MAT.ash) return { col: ["#8a8378", "#6f6a62", "#a49c90"], kind: "dust", lift: 22 };
      if (u.m === MAT.thorn) return null;
    }
    switch (terrain.typeAt(x, y)) {
      case TT.WATER:
      case TT.SHALLOW:
        return { col: ["#bfe0e8", "#8fbcc8", "#dff0f4"], kind: "drop", lift: 54, wet: true };
      case TT.SNOW:
      case TT.ICE:
        return { col: ["#ffffff", "#e8eff6", "#cfdae6"], kind: "dust", lift: 26 };
      case TT.MUD:
        return { col: ["#5a4b33", "#6b5a3e", "#463a28"], kind: "dust", lift: 14 };
      case TT.ASH:
        return { col: ["#8a8378", "#6f6a62", "#a49c90"], kind: "dust", lift: 24 };
      case TT.GRASS:
      case TT.TALL:
      case TT.MOSS:
        return { col: ["#6f8a3e", "#87a54c", "#55703a"], kind: "leaf", lift: 26 };
      default:
        return { col: ["#9a8f7e", "#b0a695", "#877d6d"], kind: "dust", lift: 18 };
    }
  }
  function carve(x, y, a, r, arc, power, m) {
    const i0 = Math.max(0, (x - r) / CELL2 | 0), i1 = Math.min(G2.w - 1, (x + r) / CELL2 | 0);
    const j0 = Math.max(0, (y - r) / CELL2 | 0), j1 = Math.min(G2.h - 1, (y + r) / CELL2 | 0);
    let took = 0;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const q = j * G2.w + i;
        if (G2.mat[q] !== m) continue;
        const dx = i * CELL2 + 7 - x, dy = j * CELL2 + 7 - y;
        const d = Math.hypot(dx, dy);
        if (d > r) continue;
        let da = Math.abs(Math.atan2(dy, dx) - a);
        if (da > Math.PI) da = TAU - da;
        if (da > arc) continue;
        if (m === MAT.ash && underStone(i * CELL2 + 7, j * CELL2 + 7)) continue;
        const t = Math.min(G2.dep[q], (0.45 + (1 - d / r) * (1 - da / arc)) * power);
        if (t <= 0) continue;
        G2.dep[q] -= t;
        const floor = m === MAT.leaves ? LITTER : 0;
        let base = Math.max(floor, G2.dep[q] + 0.05);
        if (m === MAT.thorn) base = Math.min(base, 0.5);
        G2.base[q] = Math.min(G2.base[q], base);
        took += t;
      }
    }
    return Math.min(3, took * 0.02);
  }
  function moveVector() {
    if (forceMove) return forceMove;
    if (st.watching) return { x: 0, y: 0 };
    let mx = 0, my = 0;
    if (kdown("up")) my -= 1;
    if (kdown("down")) my += 1;
    if (kdown("left")) mx -= 1;
    if (kdown("right")) mx += 1;
    if (touch.on) {
      const dx = touch.x - touch.ox, dy = touch.y - touch.oy, d = Math.hypot(dx, dy);
      const lim = STICK_MAX * (view.scale || 1);
      if (d > lim * 0.12) {
        mx += dx / Math.max(d, lim);
        my += dy / Math.max(d, lim);
      }
    }
    mx += pad3.mx;
    my += pad3.my;
    const m = Math.hypot(mx, my);
    return m > 1 ? { x: mx / m, y: my / m } : { x: mx, y: my };
  }
  function step(dt) {
    st.t += dt;
    dtSeen = dt;
    world.runTime = st.t;
    pollPad();
    if (pad3.thinkPressed && st.think) dropThought();
    if (pad3.menuPressed) {
      begin();
      if (menuOn()) closeMenu();
      else if (!st.talking && !st.reading && !st.wheel && !st.credits) openMenu();
    }
    if (menuOn()) {
      menuPad(pad3);
      stepMenu(dt);
      stepParticles(dt);
      holding = false;
      wasHolding = true;
      tapDone = true;
      return;
    }
    if (pad3.pressed) {
      begin();
      if (st.talking || st.reading) advance();
    }
    const page = st.reading ? stepReading : st.talking && !st.talking.keeper ? stepTalk : null;
    if (page) {
      if (pad3.mx < -0.55 && !readAxis) {
        page(-1);
        readAxis = true;
      } else if (pad3.mx > 0.55 && !readAxis) {
        page(1);
        readAxis = true;
      } else if (Math.abs(pad3.mx) < 0.3) readAxis = false;
    } else readAxis = false;
    if (st.talking && st.talking.keeper) {
      if (pad3.upPressed) moveSel(-1);
      if (pad3.downPressed) moveSel(1);
      if (pad3.pressed || pad3.jumpPressed) pickSel();
      if (pad3.dashPressed) closeTalk();
      return;
    }
    if (st.credits && (pad3.pressed || pad3.jumpPressed || pad3.dashPressed) && creditsEnd) creditsEnd();
    if (pad3.beltPressed) {
      begin();
      if (st.wheel) closeBelt(false);
      else openBelt();
    }
    if (st.wheel) {
      st.wheel.t += dt;
      const ax = pad3.mx;
      if (ax < -0.55 && !beltAxis) {
        beltMove(-1);
        beltAxis = true;
      } else if (ax > 0.55 && !beltAxis) {
        beltMove(1);
        beltAxis = true;
      } else if (Math.abs(ax) < 0.3) beltAxis = false;
      if (pad3.pressed || pad3.jumpPressed) closeBelt(true);
      holding = false;
      wasHolding = true;
      tapDone = true;
      stepParticles(dt);
      return;
    }
    beltAxis = false;
    if (pad3.jumpPressed) {
      begin();
      if (st.talking || st.reading) advance();
      else jumpWant = BUFFER;
    }
    if (cinemaOn() && (pad3.pressed || pad3.jumpPressed || pad3.dashPressed)) pressCinema();
    held = pad3.jumpHeld || kdown("jump");
    if (pad3.dashPressed) {
      begin();
      dashWant = true;
    }
    holding = kdown("use") || BTN.act.on || pad3.held;
    const acting = kdown("interact") || BTN.act.on || pad3.held;
    if (actT > 0) actT -= dt;
    if (S.act > 0) S.act -= dt;
    if (acting && !wasHolding) {
      tapDone = false;
      const busy = st.talking || st.reading || st.watching;
      const yt = !busy && YOUNG.find((q) => q.grow >= 1 && Math.hypot(S.x - q.x, S.y - q.y) < 130);
      const fin = !busy && !yt && finalUp() && Math.hypot(S.x - FINAL.x, S.y - FINAL.y) < 150;
      const atKeeper = !busy && Math.hypot(S.x - WOMAN.x, S.y - WOMAN.y) < 104;
      if (fin) {
        openReading(finalRead(), () => {
          st.ended = true;
          st.bloom = 1;
          setAmbientTheme(themeById("durga"));
          sfx.boon();
          spark(TREE.x, TREE.y - 40, 120, { col: ["#ffb35e", "#ffd9a0", "#eef0d8"], sp0: 40, sp1: 340, l0: 1.2, l1: 2.8, s0: 3, s1: 9, kind: "ember" });
        });
        tapDone = true;
      } else if (yt) {
        openReading(yt);
        tapDone = true;
      } else if (!busy && has(st, "broom") && !broom.held && Math.hypot(S.x - broom.x, S.y - broom.y) < 74) {
        broom.held = true;
        st.equip = "broom";
        tapDone = true;
        sfx.pickup();
      } else if (atKeeper) {
        talkTo(keeperStart(st, ROOTS.length));
        st.metKeeper = true;
        tapDone = true;
      } else if (!busy && carried) {
        hurlStone();
        tapDone = true;
      } else if (!busy && !carried && reachStone()) {
        takeStone(reachStone());
        tapDone = true;
      }
    }
    if (!acting) tapDone = false;
    wasHolding = acting;
    if (holding && !tapDone && !stroke) beginStroke();
    stepStroke(dt);
    S.burn = null;
    if (holding) actHold(dt);
    else if (!stroke) S.act = 0;
    if (st.talking || st.reading || st.credits) {
      stepParticles(dt);
      return;
    }
    if (!warmedArt && st.t > 3) {
      warmedArt = true;
      preload(PORTRAITS);
      preload(MURALS);
    }
    stepCapstan(dt);
    stepShallows(dt, st.t, drained ? null : onLeaf);
    if (onLeaf && !drained && S.z <= 0.5) {
      S.x += onLeaf.dx;
      S.y += onLeaf.dy;
    }
    const grounded = S.z <= 0.5;
    coyote = grounded ? COYOTE : Math.max(0, coyote - dt);
    jumpWant = Math.max(0, jumpWant - dt);
    if (carried || st.watching) jumpWant = 0;
    if (jumpWant > 0 && (grounded || coyote > 0)) startJump();
    if (S.z > 0 || S.vz !== 0) {
      if (S.vz > 0 && wasHeld && !held) S.vz *= 0.8;
      wasHeld = held;
      const g = S.vz > 0 ? GRAV_UP : GRAV_DOWN;
      S.vz -= g * (Math.abs(S.vz) < 60 ? 0.62 : 1) * dt;
      S.z += S.vz * dt;
      if (S.z <= 0) {
        S.z = 0;
        S.vz = 0;
        onLeaf = leafAt(S.x, S.y);
        if (!onLeaf && isDeep(S.x, S.y)) {
          for (const L of PLATFORMS) {
            if (L.solid || L.sink >= 1) continue;
            const d = Math.hypot(S.x - L.x, S.y - (L.y + L.dip));
            if (d < L.r * 0.96 + 30) {
              const k = L.r * 0.9 / d;
              S.x = L.x + (S.x - L.x) * k;
              S.y = L.y + L.dip + (S.y - L.y - L.dip) * k;
              onLeaf = L;
              break;
            }
          }
        }
        if (!supported(S.x, S.y)) fallIn();
        else if (onLeaf) {
          sfx.thud();
          water.splash(S.x, S.y + 6, 90, 1.4);
        } else {
          const g3 = groundFx(S.x, S.y + 6);
          if (g3 && g3.wet) {
            sfx.wade(1.4);
            water.splash(S.x, S.y + 6, 150, 2);
          } else sfx.thud();
          if (g3) {
            spark(S.x, S.y + 6, 9, {
              col: g3.col,
              sp0: 70,
              sp1: 210,
              l0: 0.7,
              l1: 1.6,
              s0: 4,
              s1: 9,
              lift: g3.lift + 20,
              drag: 2,
              kind: g3.kind
            });
            const u3 = depAt(S.x, S.y + 6);
            if (u3.m === MAT.leaves && u3.d > 0.2) pushLitter(S.x, S.y + 8, 62, 0, 0, 7);
          }
        }
      }
    }
    if (dashWant) {
      dashWant = false;
      startDash();
    }
    if (dashStock < DASH_MAX) {
      dashRecharge -= dt;
      if (dashRecharge <= 0) {
        dashStock++;
        dashRecharge = dashStock < DASH_MAX ? DASH_BACK : 0;
      }
    }
    const mv = moveVector();
    const under = depAt(S.x, S.y + 6);
    const air = S.z > 0.5;
    const drag = air || !under.m ? 0 : MATS[under.m].drag * Math.min(1, under.d);
    const wet = !air && water.wetAt(S.x, S.y + 6) ? 0.34 : 0;
    const sp = 196 * (1 - Math.max(drag, wet)) * (S.act > 0 ? 0.58 : 1) * (carried ? 0.62 : 1) * (S.crank ? 0.66 : 1);
    S.vx = mv.x * sp;
    S.vy = mv.y * sp;
    if (dashT > 0) {
      dashT -= dt;
      S.vx = Math.cos(dashDir) * DASH_SPEED;
      S.vy = Math.sin(dashDir) * DASH_SPEED;
      S.dashing = true;
      if (Math.random() < dt * 40) {
        const u2 = depAt(S.x, S.y + 6);
        if (u2.m && u2.d > 0.1) spark(S.x, S.y + 6, 1, { col: MATS[u2.m].col, sp0: 30, sp1: 140, l0: 0.4, l1: 1, s0: 4, s1: 8, lift: 30 });
      }
    } else S.dashing = false;
    let nx = S.x + S.vx * dt, ny = S.y + S.vy * dt;
    const ah = depAt(nx, ny + 6);
    if (ah.m === MAT.thorn && ah.d > 0.6) {
      nx = S.x;
      ny = S.y;
    }
    if (inTarn(nx, ny)) {
      if (!inTarn(nx, S.y)) ny = S.y;
      else if (!inTarn(S.x, ny)) nx = S.x;
      else {
        nx = S.x;
        ny = S.y;
      }
    }
    if (inWall(nx, ny)) {
      if (!inWall(nx, S.y)) ny = S.y;
      else if (!inWall(S.x, ny)) nx = S.x;
      else {
        nx = S.x;
        ny = S.y;
      }
    }
    if (S.z <= 0.5 && !supported(nx, ny)) {
      if (supported(nx, S.y)) ny = S.y;
      else if (supported(S.x, ny)) nx = S.x;
      else {
        nx = S.x;
        ny = S.y;
      }
    }
    S.x = clamp(nx, 40, V.w - 40);
    S.y = clamp(ny, 40, V.h - 40);
    if (S.z <= 0.5) {
      onLeaf = drained ? null : leafAt(S.x, S.y);
      if (onLeaf && onLeaf.sink >= 1) {
        onLeaf = null;
        if (!supported(S.x, S.y)) fallIn();
      }
      if (onLeaf) footing = onLeaf;
      if (!isDeep(S.x, S.y)) {
        S.safeX = S.x;
        S.safeY = S.y;
        footing = onSolid(S.x, S.y) ? { x: S.x, y: S.y } : null;
      }
    } else onLeaf = null;
    S.speed = Math.hypot(S.vx, S.vy);
    if (S.speed > 14) {
      S.face = Math.atan2(S.vy, S.vx);
      S.phase += dt * (6 + S.speed * 0.024);
      const k = Math.floor(S.phase / Math.PI);
      if (k !== S.lastStep) {
        S.lastStep = k;
        const gf = groundFx(S.x, S.y + 6);
        if (gf && gf.wet) {
          sfx.wade();
          spark(S.x, S.y + 6, 4, { col: gf.col, sp0: 30, sp1: 120, l0: 0.3, l1: 0.7, s0: 2, s1: 5, kind: "drop", lift: 44 });
        } else if (gf) {
          const deep = under.d > 0.3 && under.m;
          spark(S.x, S.y + 6, deep ? 2 + (k & 1) : 1, {
            col: gf.col,
            angle: S.face,
            arc: 1.5,
            sp0: 30,
            sp1: deep ? 130 : 70,
            l0: 0.5,
            l1: 1.2,
            s0: 3,
            s1: deep ? 8 : 5,
            lift: gf.lift,
            drag: 2.2,
            kind: gf.kind
          });
          if (under.d > 0.5 && under.m === MAT.snow && k & 1) sfx.clack(1.4);
        }
      }
    }
    if (S.speed > 14 && S.z <= 0.5) {
      const u2 = depAt(S.x, S.y + 6);
      if (u2.m === MAT.leaves && u2.d > 0.12) {
        const inv = 1 / S.speed;
        pushLitter(S.x, S.y + 8, 46 + S.speed * 0.08, S.vx * inv, S.vy * inv, dt * (S.dashing ? 170 : 90));
      }
    }
    settleLitter(dt);
    settle(dt);
    stepParticles(dt);
    water.update(dt, terrain);
    grass.update(dt, st.t, win(), grassMovers(), []);
    if (st.hasEmber) {
      const warmHere = SHELTERS.some((h) => Math.hypot(S.x - h.x, S.y - h.y) < h.r) || Math.hypot(S.x - FIRE.x, S.y - FIRE.y) < 170;
      st.ember = clamp(st.ember + (warmHere ? dt * 0.4 : -dt * 0.021), 0, 1);
      if (st.equip === "lamp" && st.ember > 0.05 && Math.random() < 0.4) {
        const side = Math.abs(Math.cos(S.face)) > 0.3 ? Math.sign(Math.cos(S.face)) : -1;
        spark(
          S.x + side * 10 + rand(-3, 3),
          S.y - 12,
          1,
          { col: ["#ffb35e", "#ff8a3c"], sp0: 4, sp1: 20, l0: 0.6, l1: 1.4, s0: 2, s1: 4, kind: "ember", lift: 28 }
        );
      }
    }
    stepTeach(dt, Math.hypot(S.x - taughtX, S.y - taughtY), st.briefed || st.done > 0);
    taughtX = S.x;
    taughtY = S.y;
    st.prompt = "";
    st.cue = "";
    const ih = isTouch() ? "" : pad3.on ? padName("act") : keyLabel("interact");
    const uh = isTouch() ? "" : pad3.on ? padName("act") : keyLabel("use");
    const press = (v) => ih ? `${ih} to ${v}` : v;
    const hold = (v) => uh ? `hold ${uh} to ${v}` : `hold to ${v}`;
    const nearBroom = has(st, "broom") && !broom.held && Math.hypot(S.x - broom.x, S.y - broom.y) < 74;
    const nearYoung = YOUNG.find((yt) => yt.grow >= 1 && Math.hypot(S.x - yt.x, S.y - yt.y) < 130);
    const nearFinal = finalUp() && Math.hypot(S.x - FINAL.x, S.y - FINAL.y) < 150;
    const atCapstan = !drained && Math.hypot(S.x - CAPSTAN.x, S.y - CAPSTAN.y) < CAPSTAN.r + 40;
    const boon = ROOTS.find((r) => r.mat === "ash");
    const atBoon = boon && !st.woken[boon.id] && Math.hypot(S.x - boon.at.x, S.y - boon.at.y) < 320;
    const left = atBoon ? stonesOn(boon.patch) : 0;
    if (carried) {
      st.cue = "throw";
      st.prompt = press("throw it in the spring, north");
    } else if (reachStone()) {
      st.cue = "lift";
      st.prompt = press("lift the stone");
    } else if (atBoon && left) st.prompt = `${left} stone${left === 1 ? "" : "s"} still on the root`;
    else if (atBoon) {
      st.cue = "sweep";
      st.prompt = hold("sweep the grit off it");
    } else if (Math.hypot(S.x - WOMAN.x, S.y - WOMAN.y) < 120) {
      st.cue = "speak";
      st.prompt = press("speak to her");
    } else if (atCapstan) {
      st.cue = "haul";
      st.prompt = !has(st, "crank") ? "the wheel has no handle. the keeper has it" : CAPSTAN.turns < 0.08 ? "walk round the wheel to raise the gate" : `the gate is coming up. ${(CAPSTAN.need - CAPSTAN.turns).toFixed(1)} turns to go`;
    } else if (nearBroom) {
      st.cue = "take";
      st.prompt = press("take the broom");
    } else if (nearYoung || nearFinal) {
      st.cue = "read";
      st.prompt = press("read the mural");
    } else if (onLeaf) st.prompt = "jump";
    else if (st.equip === "broom") {
      st.cue = "sweep";
      st.prompt = hold("sweep");
    } else if (st.equip === "lamp") {
      st.cue = "hold";
      st.prompt = hold("raise the lantern at thorn or snow");
    }
    if (st.watching) st.prompt = "she stands and watches the water go";
    for (const yt of YOUNG) {
      if (yt.grow < 1) yt.grow = Math.min(1, yt.grow + dt * 0.42);
      else if (yt.pending && !yt.rung) {
        yt.rung = true;
        st.watching = false;
        sfx.chime();
        toast = { t: 0, text: "a mural has come up on the new tree" };
      }
    }
    if (has(st, "lamp") && Math.hypot(S.x - FIRE.x, S.y - FIRE.y) < 80 && st.ember < 0.6) {
      st.hasEmber = true;
      st.ember = 1;
      sfx.boon();
      toast = { t: 0, text: "the lamp takes a coal from her fire" };
    }
    if (st.watching) {
      st.watchT += dt;
      if (st.watchT > 14) st.watching = false;
    }
    if (drained && drain < 1) {
      drain = Math.min(1, drain + dt / 5);
      ripT -= dt;
      if (ripT <= 0) {
        ripT = 0.34;
        water.splash(GATE.x + rand(-20, 20), GATE.y + rand(-30, 30), 110, 1.6);
      }
      if (Math.random() < dt * 30) {
        spark(
          GATE.x + rand(-20, 20),
          GATE.y + rand(-40, 40),
          1,
          { col: ["#bfe0e8", "#8fbcc8", "#dff0f4"], angle: 0.1, arc: 1.2, sp0: 120, sp1: 340, l0: 0.5, l1: 1.2, s0: 3, s1: 7, kind: "drop" }
        );
      }
    }
    if (!st.swept && cleared(COURT, MAT.leaves) > 0.5) {
      st.swept = true;
      sfx.chime();
      sfx.boon();
      spark(SHRINE.x, SHRINE.y - 40, 60, { col: ["#ffb35e", "#ffd9a0"], sp0: 30, sp1: 200, l0: 1, l1: 2.2, s0: 3, s1: 7, kind: "ember" });
      say2([
        ["keeper", "Look at that. Swept clean, the way it used to be kept."],
        ["keeper", "The lamps have taken it for a kindness. That is the first warm thing here in two winters."],
        ["keeper", "The roots next, child. Follow the lit one out and do for it what you did for my doorstep."]
      ], null);
    }
    for (const r of ROOTS) {
      if (st.woken[r.id]) continue;
      const near = Math.hypot(S.x - r.at.x, S.y - r.at.y) < 78;
      let done;
      if (r.mat === "water") done = drained && drain >= 1;
      else if (r.mat === "thorn") {
        if (!blaze && (near || cleared(r.patch, MAT.thorn) > 0.36)) lightTheThicket(r);
        done = false;
      } else if (r.mat === "ash") done = stonesOn(r.patch) === 0 && fraction(r) > 0.8;
      else done = fraction(r) > 0.8;
      if (done) wake(r);
    }
    stepStones(dt);
    if (blaze) stepBlaze(dt);
    stepFauna(dt, S, st);
    st.bloomK += (st.bloom - st.bloomK) * Math.min(1, dt * 0.6);
    st.warmth = clamp012(0.2 + st.count / ROOTS.length * 0.58 + st.bloomK * 0.22);
    const look = st.watching ? clamp012(st.watchT / 1.6) * 0.42 : 0;
    const cx = S.x + (ROOT_AT[0] - S.x) * look;
    const cy = S.y + (ROOT_AT[1] - S.y) * look;
    const tx = clamp(cx - view.w / 2, 0, Math.max(0, V.w - view.w));
    const ty = clamp(cy - view.h / 2, 0, Math.max(0, V.h - view.h));
    const f = 1 - Math.exp(-5 * dt);
    camera.x += (tx - camera.x) * f;
    camera.y += (ty - camera.y) * f;
  }
  function wither(p, m) {
    if (!p.w) return;
    const floor = m === MAT.leaves ? LITTER : 0;
    const gx = p.w * 0.45, gy = p.h * 0.45;
    const i0 = Math.max(0, (p.x - gx) / CELL2 | 0), i1 = Math.min(G2.w - 1, (p.x + p.w + gx) / CELL2 | 0);
    const j0 = Math.max(0, (p.y - gy) / CELL2 | 0), j1 = Math.min(G2.h - 1, (p.y + p.h + gy) / CELL2 | 0);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const q = j * G2.w + i;
        if (G2.mat[q] !== m) continue;
        const k = clamp012(thicket(i * CELL2 + 7, j * CELL2 + 7, p) * 1.2);
        if (k <= 0.02) continue;
        const want = Math.max(floor, G2.dep[q] * (1 - k));
        if (want >= G2.dep[q]) continue;
        if (G2.dep[q] > 0.05 && Math.random() < 0.05 * k) {
          spark(i * CELL2, j * CELL2, 1, { col: MATS[m].col, sp0: 20, sp1: 90, l0: 0.8, l1: 1.8, s0: 3, s1: 7, lift: 40 });
        }
        G2.dep[q] = want;
        G2.base[q] = Math.min(G2.base[q], want);
      }
    }
  }
  var blaze = null;
  var BAND = 78;
  function lightTheThicket(r) {
    const p = r.patch;
    let max = 0;
    for (const cx of [p.x, p.x + p.w]) {
      for (const cy of [p.y, p.y + p.h]) max = Math.max(max, Math.hypot(cx - r.at.x, cy - r.at.y));
    }
    blaze = { root: r, x: r.at.x, y: r.at.y, r: 0, max: max * 1.34, t: 0, hiss: 0 };
    toast = { t: 0, text: "the thicket catches" };
    sfx.hiss();
  }
  function stepBlaze(dt) {
    const B = blaze;
    B.t += dt;
    B.r += dt * (B.max / 2.8);
    const p = B.root.patch, gx = p.w * 0.42, gy = p.h * 0.42;
    const i0 = Math.max(0, (p.x - gx) / CELL2 | 0), i1 = Math.min(G2.w - 1, (p.x + p.w + gx) / CELL2 | 0);
    const j0 = Math.max(0, (p.y - gy) / CELL2 | 0), j1 = Math.min(G2.h - 1, (p.y + p.h + gy) / CELL2 | 0);
    let live = 0;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const q = j * G2.w + i;
        if (G2.mat[q] !== MAT.thorn || G2.dep[q] <= 0) continue;
        live++;
        const k = (B.r - Math.hypot(i * CELL2 + 7 - B.x, j * CELL2 + 7 - B.y)) / BAND;
        if (k <= 0) continue;
        G2.dep[q] = Math.max(0, G2.dep[q] - dt * (2.4 + Math.min(1, k) * 6));
        G2.base[q] = 0;
      }
    }
    const n = Math.min(26, 4 + Math.round(B.r * 0.05));
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const d = B.r - rand(0, BAND * 0.8);
      if (d < 6) continue;
      const x = B.x + Math.cos(a) * d, y = B.y + Math.sin(a) * d;
      if (depAt(x, y).m !== MAT.thorn) continue;
      spark(x, y, 1, Math.random() < 0.34 ? { col: ["#3a3040", "#4c4256", "#2b2233"], sp0: 4, sp1: 40, l0: 1.4, l1: 3, s0: 9, s1: 20, kind: "dust", lift: 58 } : { col: ["#ffb35e", "#ff7a2e", "#ffd9a0", "#ff5e3d"], sp0: 20, sp1: 130, l0: 0.5, l1: 1.5, s0: 3, s1: 8, kind: "ember", lift: 46 });
    }
    B.hiss -= dt;
    if (B.hiss <= 0) {
      B.hiss = 0.22 + Math.random() * 0.2;
      sfx.hiss();
    }
    if (!live || B.r > B.max + BAND * 2) {
      const r = B.root;
      blaze = null;
      wake(r);
    }
  }
  function drawBlaze(c) {
    const B = blaze;
    if (!B) return;
    const fl = 0.9 + Math.sin(st.t * 17) * 0.07 + Math.sin(st.t * 31) * 0.04;
    const N = 72;
    const lit = [];
    for (let i = 0; i < N; i++) {
      const a = i / N * TAU;
      const cs = Math.cos(a), sn = Math.sin(a);
      let x = 0, y = 0, on = false;
      for (const k of [0.25, 0.55, 0.85]) {
        const d = B.r - BAND * k;
        if (d < 4) continue;
        const px = B.x + cs * d, py = B.y + sn * d;
        const g = depAt(px, py);
        if (g.m === MAT.thorn && g.d > 0.03) {
          x = px;
          y = py;
          on = true;
          break;
        }
      }
      if (on) lit.push([x, y, a, i]);
    }
    if (!lit.length) return;
    c.save();
    c.globalCompositeOperation = "lighter";
    for (const [x, y] of lit) {
      const rr = BAND * 0.62 * fl;
      const g = c.createRadialGradient(x, y, 0, x, y, rr);
      g.addColorStop(0, "rgba(255,238,190,0.3)");
      g.addColorStop(0.35, "rgba(255,166,60,0.22)");
      g.addColorStop(1, "rgba(255,90,30,0)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, rr, 0, TAU);
      c.fill();
    }
    c.lineCap = "round";
    for (const [x, y, , i] of lit) {
      if (i & 1) continue;
      const h = 15 + (Math.sin(st.t * 9 + i * 1.7) + 1) * 12;
      const j = i % 3;
      c.strokeStyle = `rgba(255,${158 + j * 42},${58 + j * 52},0.42)`;
      c.lineWidth = 5.5 - j * 1.4;
      c.beginPath();
      c.moveTo(x, y + 4);
      c.quadraticCurveTo(x + Math.sin(st.t * 6 + i) * 6, y - h * 0.6, x + Math.sin(st.t * 4 + i) * 10, y - h);
      c.stroke();
    }
    c.restore();
    glow(c, B.x, B.y, B.r + BAND, `rgba(255,150,60,${(0.05 + 0.1 * (lit.length / N)) * fl})`);
  }
  function wake(r) {
    st.woken[r.id] = true;
    rootDone(st);
    wither(r.mat === "water" ? { x: 0, y: 0, w: 0, h: 0 } : r.patch, MAT[r.mat] || 0);
    st.count++;
    st.step++;
    const beat = ROOTS[st.told] || ROOTS[ROOTS.length - 1];
    st.told++;
    YOUNG.push({
      x: r.at.x + 86,
      y: r.at.y + 34,
      grow: 0,
      pending: true,
      mural: beat.mural,
      name: beat.name,
      lines: beat.lines,
      savi: beat.savi
    });
    st.lastRoot = beat.id;
    sfx.chime();
    sfx.boon();
    spark(r.at.x, r.at.y, 90, { col: ["#ffb35e", "#ffd9a0", "#ff8a3c"], sp0: 40, sp1: 320, l0: 1, l1: 2.4, s0: 3, s1: 8, kind: "ember" });
  }
  function drawLayer(c) {
    const d = G2.img.data, dep = G2.dep;
    for (let q = 0, p = 3, n = dep.length; q < n; q++, p += 4) {
      const v = dep[q];
      d[p] = v < 0.06 ? 0 : v > 0.98 ? 246 : (v - 0.06) * 262 | 0;
    }
    G2.cx.putImageData(G2.img, 0, 0);
    c.drawImage(G2.cv, 0, 0, V.w, V.h);
    const i0 = Math.max(0, (camera.x / CELL2 | 0) & ~1), i1 = Math.min(G2.w - 1, (camera.x + view.w) / CELL2 | 0);
    const j0 = Math.max(0, (camera.y / CELL2 | 0) & ~1), j1 = Math.min(G2.h - 1, (camera.y + view.h) / CELL2 | 0);
    const f = FIELD;
    for (let j = j0; j <= j1; j += 2) {
      for (let i = i0; i <= i1; i += 2) {
        const q = j * G2.w + i, m = G2.mat[q];
        if (!m || G2.dep[q] < CLEAR * 0.66) continue;
        const h = vn(i * 3.1, j * 7.7);
        const lx = i * CELL2 + h * CELL2, ly = j * CELL2 + vn(i * 5.3, j * 2.9) * CELL2;
        c.save();
        if (m === MAT.leaves) {
          litterAt(lx, ly, f);
          c.translate(lx + f.dx, ly + f.dy * 0.8);
          c.rotate(h * TAU + f.sp + breezeAt(st.t, lx, ly));
        } else {
          c.translate(lx, ly);
          c.rotate(h * TAU);
        }
        c.globalAlpha = Math.min(1, G2.dep[q]) * clamp012((G2.dep[q] - CLEAR * 0.66) / (CLEAR * 0.5));
        if (m === MAT.thorn) {
          c.strokeStyle = "#120d18";
          c.lineWidth = 2.2;
          c.beginPath();
          c.moveTo(-7, 4);
          c.lineTo(0, -9);
          c.lineTo(7, 3);
          c.stroke();
        } else if (m === MAT.leaves) {
          c.fillStyle = MATS[m].col[i + j & 3];
          drawLeafSprite(c, 7, 1.15 + h * 0.5 + Math.hypot(f.dx, f.dy) * 0.07);
        } else {
          c.fillStyle = MATS[m].col[i + j & 3];
          c.beginPath();
          c.ellipse(0, 0, m === MAT.snow ? 4 : 7, m === MAT.snow ? 3 : 4, 0, 0, TAU);
          c.fill();
        }
        c.restore();
      }
    }
    c.globalAlpha = 1;
  }
  var STONES = [];
  var carried = null;
  var RIPPLES = [];
  function sowStones() {
    const p = PLACES.boon.patch;
    for (let tr = 0; STONES.length < 18 && tr < 6e3; tr++) {
      const x = rand(p.x + 34, p.x + p.w - 34), y = rand(p.y + 30, p.y + p.h - 26);
      if (inTarn(x, y, 80)) continue;
      if (Math.hypot(x - PLACES.boon.at.x, y - PLACES.boon.at.y) < 52) continue;
      let clash = false;
      for (const s of STONES) if (Math.hypot(x - s.x, y - s.y) < 76) {
        clash = true;
        break;
      }
      if (clash) continue;
      STONES.push({ x, y, r: rand(13, 20), seed: rand(0, 9), z: 0, vx: 0, vy: 0, vz: 0, fly: false, spin: false, held: false });
    }
  }
  function stonesOn(p) {
    let n = carried ? 1 : 0;
    for (const s of STONES) {
      if (s.held) continue;
      if (s.x > p.x - 40 && s.x < p.x + p.w + 40 && s.y > p.y - 40 && s.y < p.y + p.h + 40) n++;
    }
    return n;
  }
  function underStone(x, y) {
    for (const s of STONES) {
      if (s.held || s.fly) continue;
      if (Math.hypot(x - s.x, y - s.y) < s.r + 16) return true;
    }
    return false;
  }
  function reachStone() {
    let best = null, bd = 54;
    for (const s of STONES) {
      if (s.fly || s.held) continue;
      const d = Math.hypot(S.x - s.x, S.y + 4 - s.y) - s.r;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }
  function takeStone(s) {
    carried = s;
    s.held = true;
    st.stowed = st.equip;
    st.equip = null;
    sfx.pickup();
    const g = groundFx(s.x, s.y);
    if (g) spark(s.x, s.y, 7, { col: g.col, sp0: 20, sp1: 90, l0: 0.4, l1: 1, s0: 3, s1: 7, lift: g.lift, kind: g.kind });
  }
  function hurlStone() {
    const s = carried;
    carried = null;
    s.held = false;
    st.equip = st.stowed;
    st.stowed = null;
    const a = S.face;
    const sp = throwSpeed(s.r);
    s.x = S.x + Math.cos(a) * 14;
    s.y = S.y + Math.sin(a) * 10;
    s.vx = Math.cos(a) * sp;
    s.vy = Math.sin(a) * sp;
    s.vz = THROW.VZ;
    s.z = THROW.Z0;
    s.fly = true;
    s.spin = true;
    sfx.swish(1.2);
  }
  function stepStones(dt) {
    for (let i = STONES.length - 1; i >= 0; i--) {
      const s = STONES[i];
      if (!s.fly) continue;
      s.vz -= THROW.G * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      if (s.z > 0) continue;
      s.z = 0;
      s.fly = false;
      s.spin = false;
      s.x = clamp(s.x, 40, V.w - 40);
      s.y = clamp(s.y, 40, V.h - 40);
      if (inTarn(s.x, s.y, 10)) {
        sfx.splash();
        spark(s.x, s.y, 30, {
          col: ["#bfe0e8", "#8fbcc8", "#dff0f4", "#ffffff"],
          sp0: 50,
          sp1: 260,
          l0: 0.5,
          l1: 1.5,
          s0: 3,
          s1: 9,
          kind: "drop",
          lift: 110
        });
        RIPPLES.push({ x: s.x, y: s.y, t: 0 });
        STONES.splice(i, 1);
        continue;
      }
      sfx.thud();
      const g = groundFx(s.x, s.y);
      if (g) {
        spark(s.x, s.y, 9, { col: g.col, sp0: 40, sp1: 150, l0: 0.5, l1: 1.3, s0: 3, s1: 8, lift: g.lift, kind: g.kind });
        if (depAt(s.x, s.y).m === MAT.leaves) pushLitter(s.x, s.y + 4, 48, 0, 0, 6);
      }
    }
    for (let i = RIPPLES.length - 1; i >= 0; i--) {
      RIPPLES[i].t += dt;
      if (RIPPLES[i].t > 1.6) RIPPLES.splice(i, 1);
    }
  }
  function drawStones(c, y0, y1) {
    for (const s of STONES) {
      if (s.held) continue;
      const sy = s.fly ? s.y + 200 : s.y;
      if (sy < y0 || sy >= y1) continue;
      if (s.x < camera.x - 60 || s.x > camera.x + view.w + 60 || s.y < camera.y - 120 || s.y > camera.y + view.h + 60) continue;
      drawStone(c, s, st.t);
    }
  }
  function drawRipples(c) {
    for (const r of RIPPLES) {
      const k = r.t / 1.6;
      c.strokeStyle = `rgba(226,242,248,${0.5 * (1 - k) * (1 - k)})`;
      c.lineWidth = 3 - k * 2;
      for (const o of [0, 0.34, 0.66]) {
        const u = k - o;
        if (u <= 0) continue;
        c.beginPath();
        c.ellipse(r.x, r.y, u * 130, u * 130 * 0.42, 0, 0, TAU);
        c.stroke();
      }
    }
  }
  var TALLG = { s: 64, w: 0, h: 0, m: null };
  function sowTallMask() {
    TALLG.w = Math.ceil(V.w / TALLG.s);
    TALLG.h = Math.ceil(V.h / TALLG.s);
    TALLG.m = new Uint8Array(TALLG.w * TALLG.h);
    const mark = (x, y, r) => {
      const i0 = Math.max(0, (x - r) / TALLG.s | 0), i1 = Math.min(TALLG.w - 1, (x + r) / TALLG.s | 0);
      const j0 = Math.max(0, (y - r) / TALLG.s | 0), j1 = Math.min(TALLG.h - 1, (y + r) / TALLG.s | 0);
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const cx = i * TALLG.s + TALLG.s / 2, cy = j * TALLG.s + TALLG.s / 2;
          if (Math.hypot(cx - x, cy - y) < r) TALLG.m[j * TALLG.w + i] = 1;
        }
      }
    };
    mark(TREE.x, TREE.y + 70, 470);
    for (const o of SCENERY) if (!o.rock) mark(o.x, o.y - 12, 62 + o.s * 48);
  }
  var tallGrassAt = (x, y) => {
    if (!TALLG.m) return false;
    const i = x / TALLG.s | 0, j = y / TALLG.s | 0;
    if (i < 0 || j < 0 || i >= TALLG.w || j >= TALLG.h) return false;
    return !!TALLG.m[j * TALLG.w + i];
  };
  var FIELD = { dx: 0, dy: 0, sp: 0 };
  var SCENERY = [];
  function sowScenery() {
    for (const t of AVENUE) SCENERY.push({ x: t.x, y: t.y, rock: false, s: t.s, seed: t.seed, dead: false, avenue: 1 });
    for (let i = 0; i < 760; i++) {
      const x = rand(60, V.w - 60), y = rand(60, V.h - 60);
      if (nearRiver(x, y, 90) || roadDist(x, y) < 72) continue;
      if (Math.hypot(x - TREE.x, y - TREE.y) < 500) continue;
      if (Math.abs(x - 2600) < 230 && y > 2300) continue;
      if (inSoft(x, y, PLACES.boon.patch, 90) > 0) continue;
      let onPatch = false;
      for (const r of ROOTS) if (inSoft(x, y, r.patch, 60) > 0) onPatch = true;
      if (onPatch && Math.random() < 0.72) continue;
      const t = classify(x, y);
      const rock = t === TT.ROCK || t === TT.GRAVEL || Math.random() < 0.16;
      SCENERY.push({ x, y, rock, s: rand(0.7, 1.45), seed: i, dead: t === TT.ASH || t === TT.SNOW });
    }
    SCENERY.sort((a, b) => a.y - b.y);
    initFauna(V, classify, [
      ...ROOTS.map((r) => ({ id: r.id, x: r.at.x, y: r.at.y, r: 620 })),
      { id: "hub", hub: true, x: TREE.x, y: TREE.y + 220, r: 640 }
    ]);
    sowStones();
  }
  function render() {
    const s = view.dpr * view.scale;
    ctx2.setTransform(s, 0, 0, s, 0, 0);
    ctx2.fillStyle = "#14100e";
    ctx2.fillRect(0, 0, view.w, view.h);
    if (cinemaOn()) {
      drawCinema(ctx2, view);
      return;
    }
    ctx2.save();
    ctx2.translate(-Math.round(camera.x), -Math.round(camera.y));
    terrain.draw(ctx2, camera.x, camera.y, view.w, view.h);
    drawLayer(ctx2);
    drawRipples(ctx2);
    drawBlaze(ctx2);
    grass.draw(ctx2, st.t, win());
    drawRootBed(ctx2, st.t, drained);
    water.draw(ctx2);
    drawShrine(ctx2, SHRINE, st.t, st.swept ? 1 : 0);
    for (const r of ROOTS) drawRoot(ctx2, TREE, r, !!st.woken[r.id], st.t, r === current());
    drawRootProgress(ctx2);
    drawHollow(ctx2);
    drawCurrent(ctx2, st.t, drained, camera, view);
    drawSluice(ctx2, st.t, drained);
    drawPlatforms(ctx2, st.t, drained);
    drawCliffs(ctx2, st.t, camera, view);
    S.broom = st.equip === "broom";
    S.carry = carried ? carried.r : 0;
    S.lamp = st.equip === "lamp";
    S.ember = st.hasEmber ? st.ember : 0;
    if (!broom.held) drawBroom(ctx2, broom, st.t);
    for (const yt of YOUNG) drawYoungTree(ctx2, yt, st.t, st.bloomK);
    drawGate(ctx2, GATE2, st.t, st.warmth);
    const below = [], above = [];
    for (const o of SCENERY) {
      if (o.x < camera.x - 160 || o.x > camera.x + view.w + 160 || o.y < camera.y - 240 || o.y > camera.y + view.h + 200) continue;
      const r = 44 + o.s * 26;
      const under = !o.rock && o.y >= S.y && Math.hypot(S.x - o.x, S.y - (o.y - 20)) < r;
      o.see = (o.see === void 0 ? 1 : o.see) + ((under ? 0.34 : 1) - (o.see === void 0 ? 1 : o.see)) * Math.min(1, dtSeen * 9);
      (o.y < S.y ? below : above).push(o);
    }
    for (const o of below) (o.rock ? drawRock : drawTree)(ctx2, o, st.t, st.warmth, st.bloomK);
    drawFauna(ctx2, st.t, camera, view, -1e9, S.y);
    drawStones(ctx2, -1e9, S.y);
    drawBanyan(ctx2, TREE, st.bloomK, st.t);
    if (finalUp()) drawMuralPanel(ctx2, FINAL.x - 46, FINAL.y - 16, 92, FINAL.mural, 1);
    drawFire(ctx2, FIRE, st.t, st.hasEmber ? 0.4 : 1);
    WOMAN.look = Math.hypot(S.x - WOMAN.x, S.y - WOMAN.y) < 260 ? clamp((S.x - WOMAN.x) / 90, -1, 1) : 0;
    drawWoman(ctx2, WOMAN, st.t);
    for (const h of SHELTERS) drawFire(ctx2, { x: h.x, y: h.y }, st.t + h.x, 0.6);
    if (st.equip === "lamp" && st.ember > 0.02) {
      glow(ctx2, S.x, S.y - 10, 190 * (0.45 + st.ember * 0.55), `rgba(255,150,60,${0.22 * st.ember + 0.05})`);
    }
    const behind = S.burn && Math.sin(S.face) < -0.25;
    if (behind) drawBreath(ctx2, S, S.burn, st.t);
    drawSavi(ctx2, S, st.t);
    if (S.burn && !behind) drawBreath(ctx2, S, S.burn, st.t);
    drawFauna(ctx2, st.t, camera, view, S.y, 1e9);
    drawStones(ctx2, S.y, 1e9);
    for (const o of above) {
      ctx2.globalAlpha = o.see === void 0 ? 1 : o.see;
      (o.rock ? drawRock : drawTree)(ctx2, o, st.t, st.warmth, st.bloomK);
    }
    ctx2.globalAlpha = 1;
    grass.drawFront(ctx2, st.t, win());
    drawParticles(ctx2);
    const underTree = Math.hypot(S.x - TREE.x, S.y - (TREE.y - 120)) < 340;
    canopySee += ((underTree ? 0.4 : 1) - canopySee) * Math.min(1, dtSeen * 9);
    drawCanopy(ctx2, TREE, st.bloomK, st.t, canopySee);
    drawSkyFauna(ctx2, st.t, camera, view);
    const onAvenue = Math.abs(S.x - 2600) < 420 && S.y > 2250;
    const n = (onAvenue ? 74 : 38) + Math.round(st.bloomK * 50);
    const air = st.bloomK < 0.05 ? MATS[1].col : [
      mixHex(MATS[1].col[0], "#63b148", st.bloomK),
      mixHex(MATS[1].col[1], "#eef0d8", st.bloomK),
      mixHex(MATS[1].col[2], "#4d9a3a", st.bloomK),
      mixHex(MATS[1].col[3], "#d9607a", st.bloomK * 0.7)
    ];
    drawFallingLeaves(ctx2, st.t, camera, view, n, air);
    ctx2.restore();
    const vig = ctx2.createRadialGradient(view.w / 2, view.h / 2, view.h * 0.32, view.w / 2, view.h / 2, view.w * 0.74);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    const vg = Math.round(28 + st.bloomK * 26), vb = Math.round(48 - st.bloomK * 18);
    vig.addColorStop(1, `rgba(20,${vg},${vb},${0.52 - st.warmth * 0.3})`);
    ctx2.fillStyle = vig;
    ctx2.fillRect(0, 0, view.w, view.h);
    drawWaypoint(ctx2);
    drawThought(ctx2);
    drawHud();
    drawBelt(ctx2);
    drawMenu(ctx2);
    if (st.talking) paintFace();
  }
  function drawHollow(ctx3) {
    for (let i = 0; i < 90; i++) {
      const side = i & 1 ? 1 : -1;
      const sAt = i / 90 * COURSE_LEN;
      const [x, y] = atRiver(sAt, side * (widthAt(sAt) - 8 - i % 5 * 4));
      if (x < camera.x - 60 || x > camera.x + view.w + 60 || y < camera.y - 90 || y > camera.y + view.h + 60) continue;
      const n = 3 + i * 7 % 4;
      for (let k = 0; k < n; k++) {
        const rx = x + (vn(i, k) - 0.5) * 34, ry = y + (vn(k, i) - 0.5) * 22;
        const h = 22 + vn(i * 2, k * 3) * 26;
        const lean = Math.sin(st.t * 0.9 + i + k) * 4;
        ctx3.strokeStyle = drained ? "#7d7b46" : "#5f6b3e";
        ctx3.lineWidth = 1.7;
        ctx3.beginPath();
        ctx3.moveTo(rx, ry);
        ctx3.quadraticCurveTo(rx + lean * 0.5, ry - h * 0.6, rx + lean, ry - h);
        ctx3.stroke();
        if ((i + k) % 5 === 0) {
          ctx3.fillStyle = "#6b5a32";
          ctx3.beginPath();
          ctx3.ellipse(rx + lean, ry - h - 3, 1.7, 4.4, 0, 0, TAU);
          ctx3.fill();
        }
      }
    }
    if (!drained) {
      for (let i = 0; i < 44; i++) {
        const [x, y] = atRiver(i / 44 * COURSE_LEN, i * 37 % 120 - 60);
        const drift = Math.sin(st.t * 0.4 + i) * 3;
        ctx3.fillStyle = i % 4 ? "#3d6b46" : "#4b7a4e";
        ctx3.beginPath();
        ctx3.ellipse(x + drift, y, 16 + vn(i, 5) * 10, 12 + vn(i, 7) * 7, i * 0.7, 0.5, TAU);
        ctx3.fill();
        if (i % 6 === 0) {
          ctx3.fillStyle = "#e8d8e4";
          ctx3.beginPath();
          ctx3.arc(x + drift + 4, y - 3, 3.4, 0, TAU);
          ctx3.fill();
        }
      }
    }
  }
  function drawRootProgress(ctx3) {
    for (const r of ROOTS) {
      if (st.woken[r.id]) continue;
      const d = Math.hypot(S.x - r.at.x, S.y - r.at.y);
      if (d > 460) continue;
      if (r.mat === "thorn" || r.mat === "ash") {
        const pulse2 = 0.5 + 0.5 * Math.sin(st.t * 2.2);
        ctx3.save();
        ctx3.strokeStyle = `rgba(255,190,110,${clamp012((460 - d) / 200) * (0.25 + pulse2 * 0.3)})`;
        ctx3.lineWidth = 4;
        ctx3.setLineDash([10, 12]);
        ctx3.beginPath();
        ctx3.ellipse(r.at.x, r.at.y, 78, 48, 0, st.t * 0.3, st.t * 0.3 + TAU);
        ctx3.stroke();
        ctx3.setLineDash([]);
        ctx3.restore();
        continue;
      }
      const k = clamp012(fraction(r) / 0.8);
      const a = clamp012((460 - d) / 160) * (0.35 + k * 0.5);
      ctx3.save();
      ctx3.lineWidth = 5;
      ctx3.strokeStyle = `rgba(240,226,203,${a * 0.22})`;
      ctx3.beginPath();
      ctx3.ellipse(r.at.x, r.at.y, GOAL.rx, GOAL.ry, 0, 0, TAU);
      ctx3.stroke();
      ctx3.strokeStyle = `rgba(255,${180 + k * 60 | 0},${94 + k * 90 | 0},${a})`;
      ctx3.lineCap = "round";
      ctx3.beginPath();
      ctx3.ellipse(r.at.x, r.at.y, GOAL.rx, GOAL.ry, 0, -Math.PI / 2, -Math.PI / 2 + TAU * k);
      ctx3.stroke();
      ctx3.lineCap = "butt";
      if (k > 0.04) glow(ctx3, r.at.x, r.at.y, 90 + k * 90, `rgba(255,170,80,${0.05 + k * 0.16})`);
      ctx3.restore();
    }
  }
  function drawWaypoint(ctx3) {
    const job = objective(st, ROOTS, WOMAN, TREE, S, GORGE, unreadMural());
    if (!job || st.talking || st.reading || st.credits) return;
    const sx = job.x - camera.x, sy = job.y - camera.y;
    const m = 54;
    if (sx > m && sx < view.w - m && sy > m && sy < view.h - m) return;
    const cx = view.w / 2, cy = view.h / 2;
    const a = Math.atan2(sy - cy, sx - cx);
    const rx = view.w / 2 - m, ry = view.h / 2 - m;
    const k = Math.min(Math.abs(rx / Math.cos(a)), Math.abs(ry / Math.sin(a)));
    const x = cx + Math.cos(a) * k, y = cy + Math.sin(a) * k;
    const pulse2 = 0.72 + 0.28 * Math.sin(st.t * 2.4);
    ctx3.save();
    ctx3.translate(x, y);
    ctx3.rotate(a);
    ctx3.fillStyle = `rgba(255,190,110,${pulse2})`;
    ctx3.beginPath();
    ctx3.moveTo(15, 0);
    ctx3.lineTo(-9, 9);
    ctx3.lineTo(-4, 0);
    ctx3.lineTo(-9, -9);
    ctx3.closePath();
    ctx3.fill();
    ctx3.strokeStyle = "rgba(40,24,12,0.8)";
    ctx3.lineWidth = 1.6;
    ctx3.stroke();
    ctx3.restore();
    const d = Math.round(Math.hypot(job.x - S.x, job.y - S.y) / 50);
    ctx3.font = '600 11px "Segoe UI", Roboto, system-ui, sans-serif';
    ctx3.fillStyle = `rgba(255,214,170,${pulse2 * 0.8})`;
    ctx3.textAlign = "center";
    ctx3.fillText(`${d}`, x - Math.cos(a) * 22, y - Math.sin(a) * 22 + 4);
    ctx3.textAlign = "left";
    ctx3.font = '600 13px "Segoe UI", Roboto, system-ui, sans-serif';
  }
  function drawHud() {
    const F3 = isTouch() ? clamp(view.h / 400, 1, 1.55) : 1;
    const fnt = (px) => `600 ${Math.round(px * F3)}px "Segoe UI", Roboto, system-ui, sans-serif`;
    const L = Math.round(22 * F3);
    ctx2.font = fnt(13);
    ctx2.textAlign = "left";
    ctx2.fillStyle = "rgba(240,226,203,0.8)";
    ctx2.fillText(`${st.count} of ${ROOTS.length} roots awake`, L, 30 * F3);
    const job = objective(st, ROOTS, WOMAN, TREE, S, GORGE, unreadMural());
    if (job) {
      ctx2.fillStyle = "rgba(255,179,94,0.92)";
      const cur2 = ROOTS.find((r) => r.id === (stage(st) || {}).root);
      const near = cur2 && st.briefed && Math.hypot(S.x - cur2.at.x, S.y - cur2.at.y) < 460;
      const done = (r) => Math.min(99, Math.round(clamp012(fraction(r) / 0.8) * 100));
      let pc = "";
      if (near && (cur2.mat === "leaves" || cur2.mat === "snow")) pc = `, ${done(cur2)}% uncovered`;
      else if (near && cur2.mat === "ash") {
        const n = stonesOn(cur2.patch);
        pc = n ? `, ${n} stone${n === 1 ? "" : "s"} to shift` : `, ${done(cur2)}% swept`;
      }
      ctx2.fillText(job.text + pc, L, 50 * F3);
    }
    if (st.hasEmber) {
      ctx2.fillStyle = "rgba(240,226,203,0.55)";
      ctx2.font = fnt(10);
      ctx2.fillText("COAL", L, 66 * F3);
      ctx2.font = fnt(13);
      ctx2.fillStyle = "rgba(255,170,80,0.26)";
      ctx2.fillRect(56 * F3, 59 * F3, 88 * F3, 7 * F3);
      ctx2.fillStyle = `rgba(255,${150 + st.ember * 70 | 0},${60 + st.ember * 70 | 0},0.95)`;
      ctx2.fillRect(56 * F3, 59 * F3, 88 * F3 * st.ember, 7 * F3);
    }
    if (toast) {
      toast.t += 1 / 60;
      if (toast.t > 3.4) toast = null;
      else {
        ctx2.textAlign = "center";
        ctx2.globalAlpha = Math.min(1, (3.4 - toast.t) * 1.6);
        ctx2.fillStyle = "rgba(240,226,203,0.9)";
        ctx2.fillText(toast.text, view.w / 2, 76 * F3);
        ctx2.globalAlpha = 1;
        ctx2.textAlign = "left";
      }
    }
    const lesson = st.started && !cinemaOn() && !st.talking && !st.reading && !st.wheel ? teachText({ touch: isTouch(), pad: pad3.on }) : null;
    if (lesson) {
      const y = view.h - (isTouch() ? 186 * F3 : 96);
      ctx2.textAlign = "center";
      let px = 17;
      ctx2.font = fnt(px);
      while (px > 11 && ctx2.measureText(lesson.text).width + 44 * F3 > view.w - 40) {
        px -= 1;
        ctx2.font = fnt(px);
      }
      const w = ctx2.measureText(lesson.text).width + 44 * F3;
      ctx2.fillStyle = "rgba(14,10,8,0.5)";
      ctx2.beginPath();
      const h = 30 * F3, x = view.w / 2 - w / 2, ty = y - h * 0.72, r = h / 2;
      ctx2.moveTo(x + r, ty);
      ctx2.arcTo(x + w, ty, x + w, ty + h, r);
      ctx2.arcTo(x + w, ty + h, x, ty + h, r);
      ctx2.arcTo(x, ty + h, x, ty, r);
      ctx2.arcTo(x, ty, x + w, ty, r);
      ctx2.fill();
      ctx2.strokeStyle = lesson.got ? "rgba(198,226,196,0.5)" : "rgba(255,196,120,0.45)";
      ctx2.lineWidth = 1.6;
      ctx2.stroke();
      ctx2.fillStyle = lesson.got ? "rgba(214,238,210,0.95)" : "rgba(255,224,186,0.95)";
      ctx2.fillText(lesson.text, view.w / 2, y);
      ctx2.font = fnt(13);
      ctx2.textAlign = "left";
    }
    if (st.prompt) {
      ctx2.textAlign = "center";
      ctx2.fillStyle = "rgba(255,214,170,0.92)";
      ctx2.font = fnt(isTouch() ? 14 : 13);
      ctx2.fillText(st.prompt, view.w / 2, view.h - (isTouch() ? 132 * F3 : 54));
      ctx2.font = fnt(13);
      ctx2.textAlign = "left";
    }
    layoutButtons();
    const ttouch = isTouch();
    const button = (b, label2, fill, edge, lit, inner) => {
      if (b.off) return;
      const k = b.on ? 1 : 0;
      ctx2.beginPath();
      ctx2.arc(b.x, b.y, b.r, 0, TAU);
      ctx2.fillStyle = "rgba(16,12,9,0.34)";
      ctx2.fill();
      ctx2.beginPath();
      ctx2.arc(b.x, b.y, b.r, 0, TAU);
      ctx2.fillStyle = fill(lit + k * 0.28);
      ctx2.fill();
      ctx2.strokeStyle = edge;
      ctx2.lineWidth = 2 + k * 1.4;
      ctx2.stroke();
      if (inner) inner(b);
      if (label2) {
        ctx2.textAlign = "center";
        ctx2.fillStyle = "rgba(255,240,222,0.95)";
        ctx2.font = `600 ${Math.round(b.r * 0.3)}px "Segoe UI", Roboto, system-ui, sans-serif`;
        ctx2.fillText(label2, b.x, b.y + b.r * 0.11);
        ctx2.textAlign = "left";
      }
    };
    const CUE = { take: "TAKE", read: "READ", speak: "TALK", lift: "LIFT", throw: "THROW", haul: "HAUL", sweep: "SWEEP", hold: "HOLD" };
    const label = CUE[st.cue] || (st.equip === "lamp" ? "HOLD" : st.equip === "broom" ? "SWEEP" : "ACT");
    button(BTN.act, label, (a) => `rgba(255,179,94,${0.22 + a * 0.2})`, "rgba(255,190,120,0.8)", holding ? 0.28 : 0);
    button(
      BTN.jump,
      "JUMP",
      (a) => `rgba(198,226,196,${0.18 + a * 0.2})`,
      "rgba(214,238,210,0.72)",
      S.z > 0.5 ? 0.22 : 0
    );
    button(
      BTN.dash,
      "DASH",
      (a) => `rgba(150,190,225,${(dashStock > 0 ? 0.18 : 0.06) + a * 0.18})`,
      dashStock > 0 ? "rgba(180,215,245,0.72)" : "rgba(180,215,245,0.26)",
      0,
      (b) => {
        for (let i = 0; i < DASH_MAX; i++) {
          ctx2.beginPath();
          ctx2.arc(b.x - b.r * 0.22 + i * b.r * 0.44, b.y + b.r * 0.52, b.r * 0.1, 0, TAU);
          ctx2.fillStyle = i < dashStock ? "rgba(190,225,255,0.95)" : "rgba(190,225,255,0.22)";
          ctx2.fill();
        }
      }
    );
    button(BTN.menu, null, (a) => `rgba(28,22,18,${0.42 + a * 0.2})`, "rgba(240,226,203,0.5)", 0, (b) => {
      ctx2.fillStyle = "rgba(240,226,203,0.9)";
      const w = b.r * 0.17, h = b.r * 0.62;
      ctx2.fillRect(b.x - w * 2.1, b.y - h / 2, w, h);
      ctx2.fillRect(b.x + w * 1.1, b.y - h / 2, w, h);
    });
    button(BTN.belt, null, (a) => `rgba(28,22,18,${0.42 + a * 0.2})`, "rgba(255,190,120,0.6)", 0, (b) => {
      drawToolIcon(ctx2, st.equip, b.x, b.y + b.r * 0.07, b.r * 1.1, st.equip === "lamp" ? st.ember : 1);
      if (!ttouch) {
        ctx2.textAlign = "center";
        ctx2.font = '600 9px "Segoe UI", Roboto, system-ui, sans-serif';
        ctx2.fillStyle = "rgba(240,226,203,0.6)";
        ctx2.fillText(pad3.on ? padName("belt") : keyLabel("belt").toUpperCase(), b.x, b.y + b.r + 13);
        ctx2.textAlign = "left";
      }
    });
    if (touch.on) {
      const dx = touch.x / (view.scale || 1) - touch.ox / (view.scale || 1);
      const dy = touch.y / (view.scale || 1) - touch.oy / (view.scale || 1);
      const d = Math.hypot(dx, dy);
      const k = d > 1 ? Math.min(1, d / STICK_MAX) : 0;
      const ox = touch.ox / (view.scale || 1), oy = touch.oy / (view.scale || 1);
      ctx2.beginPath();
      ctx2.arc(ox, oy, STICK_MAX, 0, TAU);
      ctx2.fillStyle = "rgba(18,13,10,0.24)";
      ctx2.fill();
      ctx2.strokeStyle = "rgba(255,214,170,0.3)";
      ctx2.lineWidth = 2;
      ctx2.stroke();
      const nx = d > 0 ? dx / d : 0, ny = d > 0 ? dy / d : 0;
      ctx2.beginPath();
      ctx2.arc(ox + nx * k * STICK_MAX, oy + ny * k * STICK_MAX, STICK_MAX * 0.42, 0, TAU);
      ctx2.fillStyle = "rgba(255,214,170,0.34)";
      ctx2.fill();
      ctx2.strokeStyle = "rgba(255,230,196,0.7)";
      ctx2.lineWidth = 2;
      ctx2.stroke();
    }
    if (!ttouch) {
      ctx2.textAlign = "center";
      ctx2.font = '600 13px "Segoe UI", Roboto, system-ui, sans-serif';
      ctx2.fillStyle = `rgba(240,226,203,${st.t < 16 ? 0.5 : 0.26})`;
      ctx2.fillText(
        pad3.on ? `${padName("jump")} to jump \xB7 ${padName("dash")} to dash \xB7 ${padName("act")} to act \xB7 ${padName("belt")} for her belt \xB7 ${padName("menu")} to pause` : `${keyLabel("jump")} to jump \xB7 ${keyLabel("dash")} to dash \xB7 ${keyLabel("interact")} to interact \xB7 ${keyLabel("use")} to use \xB7 ${keyLabel("belt")} for her belt \xB7 escape to pause`,
        view.w / 2,
        view.h - 16
      );
      ctx2.textAlign = "left";
    }
  }
  function drawBelt(ctx3) {
    beltSlots = [];
    if (!st.wheel) return;
    const b = belt();
    const k = Math.min(1, st.wheel.t * 7);
    ctx3.fillStyle = `rgba(12,9,7,${0.52 * k})`;
    ctx3.fillRect(0, 0, view.w, view.h);
    const R2 = 42, gap = 22;
    const wide = b.length * R2 * 2 + (b.length - 1) * gap;
    const y = view.h / 2 + 6;
    for (let i = 0; i < b.length; i++) {
      const x = view.w / 2 - wide / 2 + R2 + i * (R2 * 2 + gap);
      const on = i === st.wheel.sel;
      const r = R2 * (0.82 + k * 0.18) * (on ? 1.1 : 0.94);
      beltSlots.push({ x, y, r, id: b[i].id });
      ctx3.beginPath();
      ctx3.arc(x, y, r, 0, TAU);
      ctx3.fillStyle = on ? "rgba(52,38,26,0.95)" : "rgba(26,20,16,0.85)";
      ctx3.fill();
      ctx3.strokeStyle = on ? "rgba(255,196,120,0.95)" : "rgba(150,126,98,0.5)";
      ctx3.lineWidth = on ? 2.6 : 1.6;
      ctx3.stroke();
      drawToolIcon(ctx3, b[i].id, x, y + 4, r * 1.25, b[i].id === "lamp" ? Math.max(0.25, st.ember) : 1);
      if (b[i].id === st.equip) {
        ctx3.fillStyle = "rgba(255,196,120,0.9)";
        ctx3.beginPath();
        ctx3.arc(x, y - r - 9, 3, 0, TAU);
        ctx3.fill();
      }
      ctx3.globalAlpha = k;
      ctx3.textAlign = "center";
      ctx3.font = `600 ${on ? 13 : 12}px "Segoe UI", Roboto, system-ui, sans-serif`;
      ctx3.fillStyle = on ? "rgba(255,224,186,0.95)" : "rgba(210,192,168,0.5)";
      ctx3.fillText(b[i].name, x, y + r + 22);
      ctx3.globalAlpha = 1;
    }
    const sel = b[st.wheel.sel];
    ctx3.globalAlpha = k;
    ctx3.textAlign = "center";
    ctx3.font = '600 13px "Segoe UI", Roboto, system-ui, sans-serif';
    ctx3.fillStyle = "rgba(240,226,203,0.62)";
    ctx3.fillText(sel ? sel.note : "", view.w / 2, y + R2 + 54);
    ctx3.font = '600 11px "Segoe UI", Roboto, system-ui, sans-serif';
    ctx3.fillStyle = "rgba(240,226,203,0.36)";
    ctx3.fillText(pad3.on ? `stick to choose \xB7 ${padName("act")} to take it \xB7 ${padName("belt")} to close` : `tap one, or ${keyLabels("left")} and ${keyLabels("right")} \xB7 ${keyLabel("interact")} to take it \xB7 ${keyLabel("belt")} to close`, view.w / 2, y + R2 + 76);
    ctx3.textAlign = "left";
  }
  function say2(lines, onDone, mural, thought) {
    st.talking = { lines: lines.slice(), i: 0, onDone, mural, thought };
    paintTalk();
  }
  function think(text) {
    if (text) st.think = { text, t: 0 };
  }
  var THINK_FOR = 7.5;
  var thinkX = null;
  function drawThought(c) {
    if (!st.think) {
      thinkX = null;
      return;
    }
    st.think.t += dtSeen;
    if (st.think.t > THINK_FOR) {
      st.think = null;
      thinkX = null;
      return;
    }
    const F3 = isTouch() ? clamp(view.h / 400, 1, 1.55) : 1;
    const k = Math.min(1, st.think.t * 5) * clamp012((THINK_FOR - st.think.t) * 1.4);
    const size = Math.round(13 * F3);
    const FNT = (it) => `${it ? "italic " : ""}600 ${size}px "Segoe UI", Roboto, system-ui, sans-serif`;
    c.font = FNT(false);
    const maxw = Math.min(view.w * 0.62, 360 * F3);
    const toks = [];
    let ital = false;
    for (const part of st.think.text.split(/(<i>|<\/i>)/)) {
      if (part === "<i>") {
        ital = true;
        continue;
      }
      if (part === "</i>") {
        ital = false;
        continue;
      }
      for (const w of part.split(/\s+/)) if (w) toks.push({ w, i: ital });
    }
    c.font = FNT(false);
    const sp = c.measureText(" ").width;
    const rows2 = [[]];
    let cur = 0, wide = 0;
    for (const t of toks) {
      c.font = FNT(t.i);
      const ww = c.measureText(t.w).width;
      const row2 = rows2[rows2.length - 1];
      const adv = row2.length ? sp + ww : ww;
      if (row2.length && cur + adv > maxw) {
        rows2.push([t]);
        cur = ww;
      } else {
        row2.push(t);
        cur += adv;
      }
      wide = Math.max(wide, cur);
    }
    const lh = size * 1.32;
    const pad4 = 11 * F3;
    const bw = wide + pad4 * 2;
    const bh = rows2.length * lh + pad4 * 1.7;
    const bx = clamp(S.x - camera.x - bw / 2, 12, view.w - bw - 12);
    const by = clamp(S.y - camera.y - 52 * F3 - bh, 10, view.h - bh - 10);
    const tipx = clamp(S.x - camera.x, bx + 16, bx + bw - 16);
    c.save();
    c.globalAlpha = k;
    c.beginPath();
    roundRectPath(c, bx, by, bw, bh, 10 * F3);
    c.moveTo(tipx - 7 * F3, by + bh - 1);
    c.lineTo(tipx, by + bh + 11 * F3);
    c.lineTo(tipx + 7 * F3, by + bh - 1);
    c.closePath();
    c.fillStyle = "rgba(24,18,14,0.86)";
    c.fill();
    c.strokeStyle = "rgba(255,196,130,0.5)";
    c.lineWidth = 1.5;
    c.stroke();
    c.fillStyle = "rgba(244,232,214,0.95)";
    c.textAlign = "left";
    rows2.forEach((row2, i) => {
      let x = bx + pad4;
      const y = by + pad4 + lh * (i + 0.78);
      for (const t of row2) {
        c.font = FNT(t.i);
        c.fillText(t.w, x, y);
        x += c.measureText(t.w).width + sp;
      }
    });
    if (pad4.on) {
      thinkX = null;
      c.textAlign = "right";
      c.font = `600 ${Math.round(10 * F3)}px "Segoe UI", Roboto, system-ui, sans-serif`;
      c.fillStyle = "rgba(255,196,130,0.7)";
      c.fillText(`${padName("dismiss")} to dismiss`, bx + bw - 2, by + bh + 13 * F3);
    } else {
      const r = 9 * F3, cx = bx + bw - r * 0.3, cy = by + r * 0.3;
      thinkX = { x: cx, y: cy, r: r * 1.9 };
      c.beginPath();
      c.arc(cx, cy, r, 0, TAU);
      c.fillStyle = "rgba(24,18,14,0.95)";
      c.fill();
      c.strokeStyle = "rgba(255,196,130,0.6)";
      c.lineWidth = 1.4;
      c.stroke();
      c.strokeStyle = "rgba(244,232,214,0.9)";
      c.lineWidth = 1.7;
      const q = r * 0.42;
      c.beginPath();
      c.moveTo(cx - q, cy - q);
      c.lineTo(cx + q, cy + q);
      c.moveTo(cx + q, cy - q);
      c.lineTo(cx - q, cy + q);
      c.stroke();
    }
    c.restore();
  }
  function dropThought() {
    if (!st.think) return false;
    st.think = null;
    thinkX = null;
    sfx.click();
    return true;
  }
  function roundRectPath(c, x, y, w, h, r) {
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
  }
  function talkTo(node) {
    const last = ROOTS.find((r) => r.id === st.lastRoot);
    keeperFill(st, stage(st), last && last.keeper);
    st.talking = { keeper: node, who: "The Old Keeper" };
    paintTalk();
  }
  function paintTalk() {
    const t = st.talking;
    if (!t) return;
    let body;
    if (t.keeper) {
      const n = KEEPER[t.keeper];
      st.asked[t.keeper] = true;
      if (n.mark) st[n.mark] = true;
      if (n.give) {
        const fresh = !has(st, n.give);
        const s2 = brief(st);
        if (n.give === "broom") broom.held = true;
        if (n.give === "lamp") {
          st.hasEmber = true;
          st.ember = 1;
        }
        if (n.give !== "crank") st.equip = n.give;
        sfx.pickup();
        toast = { t: 0, text: fresh ? `she gives you ${TOOLNAME[n.give] || n.give}` : `${TOOLNAME[n.give] || n.give}, again` };
        if (s2) st.prompt = "";
      }
      const open = n.choices.filter((c) => c.spine || c.to === "leave" || KEEPER[c.to] && KEEPER[c.to].repeat || !st.asked[c.to]);
      const spine = open.find((c) => c.spine) || open.find((c) => c.to === "leave") || open[0];
      const asks = open.filter((c) => c !== spine && c.to !== "leave").slice(0, 2);
      const list2 = [spine, ...asks].filter(Boolean);
      t.list = list2;
      const cs = list2.map((c, i) => `<button class="choice${c === spine ? " spine" : ""}" data-i="${i}">${c.say}</button>`).join("");
      body = `<div class="saybar"><canvas class="face" width="220" height="300"></canvas>
      <div class="readtext"><div class="who">${t.who}</div><p>${n.text}</p>
      <div class="choices">${cs}</div></div></div>`;
      t.face = "keeper";
    } else {
      const line = t.lines[t.i];
      const who = Array.isArray(line) ? line[0] : "keeper";
      const text = Array.isArray(line) ? line[1] : line;
      const m = t.mural ? '<canvas id="mural" width="460" height="250"></canvas>' : "";
      body = `${m}<div class="saybar"><canvas class="face" width="220" height="300"></canvas>
      <div class="readtext"><div class="who">${WHO[who] || ""}</div><p>${text}</p>
      <div class="readnav">
        <button class="navb" id="sayback"${t.i === 0 ? " disabled" : ""}>&lsaquo; back</button>
        <div class="more">${t.i + 1} / ${t.lines.length}</div>
        <button class="navb" id="sayfwd">${t.i === t.lines.length - 1 ? "done" : "next &rsaquo;"}</button>
      </div></div></div>`;
      t.face = who;
    }
    overlay.innerHTML = `<div class="panel">${body}</div>`;
    overlay.classList.add("on");
    const fc = overlay.querySelector(".face");
    t.faceCtx = fc ? fc.getContext("2d") : null;
    if (t.keeper) {
      t.mood = keeperMood(st.count, ROOTS.length, st.ended);
    } else {
      const line = t.lines[t.i];
      t.mood = Array.isArray(line) ? line[2] || null : null;
      if (!t.mood && t.face === "keeper") t.mood = keeperMood(st.count, ROOTS.length, st.ended);
    }
    t.muralCtx = t.mural ? document.getElementById("mural").getContext("2d") : null;
    for (const [id, d] of [["sayback", -1], ["sayfwd", 1]]) {
      const b = document.getElementById(id);
      if (!b) continue;
      b.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        stepTalk(d);
      });
    }
    if (t.shownAt === void 0) t.shownAt = st.t;
    t.lineAt = st.t;
    paintFace();
    if (t.keeper) {
      if (t.sel === void 0 || t.sel >= t.list.length) t.sel = 0;
      overlay.querySelectorAll(".choice").forEach((b) => {
        b.addEventListener("pointerdown", (e) => {
          e.stopPropagation();
          choose(st.talking.list[+b.dataset.i].to);
        });
        b.addEventListener("pointerenter", () => {
          st.talking.sel = +b.dataset.i;
          markSel();
        });
      });
      markSel();
    }
  }
  function moveSel(d) {
    const t = st.talking;
    if (!t || !t.list || !t.list.length) return;
    t.sel = ((t.sel || 0) + d + t.list.length) % t.list.length;
    markSel();
    sfx.tick();
  }
  function markSel() {
    const t = st.talking;
    if (!t || !t.list) return;
    overlay.querySelectorAll(".choice").forEach((b, i) => b.classList.toggle("sel", i === (t.sel || 0)));
  }
  function pickSel() {
    const t = st.talking;
    if (!t || !t.list || !t.list.length) return;
    choose(t.list[t.sel || 0].to);
  }
  function choose(to) {
    sfx.ui();
    if (to === "leave") closeTalk();
    else {
      st.talking.keeper = to;
      st.talking.sel = 0;
      paintTalk();
    }
  }
  function paintFace() {
    const t = st.talking;
    if (!t || !t.faceCtx) return;
    const k = clamp012((st.t - (t.shownAt || st.t)) / 0.3);
    const emph = clamp012(1 - (st.t - (t.lineAt || st.t)) / 0.42);
    t.faceCtx.clearRect(0, 0, 220, 300);
    drawPortrait(t.faceCtx, t.face, 0, 0, 220, st.t, k, emph, t.mood);
    if (t.muralCtx) drawMural(t.muralCtx, t.mural, 460, 250, st.t);
  }
  function closeTalk() {
    const t = st.talking;
    st.talking = null;
    overlay.classList.remove("on");
    overlay.innerHTML = "";
    if (t && t.thought) think(t.thought);
    if (t && t.onDone) t.onDone();
    if (st.blessed && !st.after && !st.credits) rollCredits();
  }
  function rollCredits() {
    st.credits = true;
    overlay.innerHTML = `<div class="credits"><div class="credroll">
      <h1>SAVI</h1>
      <div class="sub">The Keeper of the Banyan Tree</div>
      <div class="role">Made by</div><p class="name">Vinayak and Surya</p>
      <div class="role">Made for</div><p class="name">the Cozy Fall Game Jam, 2026</p>
      <div class="role">&nbsp;</div>
    </div><div class="credskip">tap, or press any key, to go back to the valley</div></div>`;
    overlay.classList.add("on", "full");
    sfx.chime();
    const end = () => {
      if (!st.credits) return;
      st.credits = false;
      st.after = true;
      overlay.classList.remove("on", "full");
      overlay.innerHTML = "";
      toast = { t: 0, text: "the valley is yours to walk in" };
    };
    creditsEnd = end;
    const box = overlay.querySelector(".credits");
    if (box) box.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      end();
    });
    const roll2 = overlay.querySelector(".credroll");
    if (roll2) roll2.addEventListener("animationend", end);
  }
  var creditsEnd = null;
  function advance() {
    if (st.reading) {
      stepReading(1);
      return;
    }
    stepTalk(1);
  }
  function stepTalk(d) {
    const t = st.talking;
    if (!t || t.keeper) return;
    if (d < 0) {
      if (t.i === 0) {
        sfx.click();
        return;
      }
      t.i--;
      paintTalk();
      sfx.ui();
      return;
    }
    t.i++;
    if (t.i < t.lines.length) {
      paintTalk();
      sfx.ui();
      return;
    }
    closeTalk();
  }
  var toast = null;
  function openReading(yt, onDone) {
    st.reading = { yt, i: 0, onDone };
    yt.pending = false;
    sfx.chime();
    paintReading();
  }
  function paintReading() {
    const r = st.reading;
    if (!r) return;
    const [who, text] = r.yt.lines[r.i];
    overlay.innerHTML = `<div class="read">
      <canvas id="bigmural" width="880" height="470"></canvas>
      <div class="readbar">
        <canvas id="bigface" width="220" height="300"></canvas>
        <div class="readtext"><div class="who">${WHO[who] || ""}</div><p>${text}</p>
          <div class="readnav">
            <button class="navb" id="readback"${r.i === 0 ? " disabled" : ""}>&lsaquo; back</button>
            <div class="more">${r.i + 1} / ${r.yt.lines.length}</div>
            <button class="navb" id="readfwd">${r.i === r.yt.lines.length - 1 ? "done" : "next &rsaquo;"}</button>
          </div></div>
      </div>
    </div>`;
    overlay.classList.add("on", "full");
    drawMural(document.getElementById("bigmural").getContext("2d"), r.yt.mural, 880, 470, st.t);
    drawPortrait(document.getElementById("bigface").getContext("2d"), who, 0, 0, 220, st.t, 1);
    for (const [id, d] of [["readback", -1], ["readfwd", 1]]) {
      const b = document.getElementById(id);
      if (!b) continue;
      b.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        e.preventDefault();
        stepReading(d);
      });
    }
  }
  function stepReading(d = 1) {
    const r = st.reading;
    if (!r) return;
    if (d < 0) {
      if (r.i === 0) {
        sfx.click();
        return;
      }
      r.i--;
      paintReading();
      sfx.ui();
      return;
    }
    r.i++;
    if (r.i < r.yt.lines.length) {
      paintReading();
      sfx.ui();
      return;
    }
    think(r.yt.savi);
    st.reading = null;
    overlay.classList.remove("on", "full");
    overlay.innerHTML = "";
    if (r.onDone) r.onDone();
  }
  var WHO = { keeper: "The Old Keeper", savitri: "Savitri", satyavan: "Satyavan", yama: "Yama, Lord of Death", narada: "Narada" };
  var lastW = -1;
  var lastH = -1;
  function resize() {
    const W22 = window.innerWidth, H22 = window.innerHeight;
    if (W22 < 2 || H22 < 2) return;
    lastW = W22;
    lastH = H22;
    view.dpr = Math.min(2, window.devicePixelRatio || 1);
    view.h = 720;
    view.w = Math.round(720 * (W22 / H22));
    view.scale = H22 / 720;
    view.cw = W22;
    view.ch = H22;
    cv.width = Math.round(W22 * view.dpr);
    cv.height = Math.round(H22 * view.dpr);
    cv.style.width = W22 + "px";
    cv.style.height = H22 + "px";
    arena.x = 0;
    arena.y = 0;
    arena.w = V.w;
    arena.h = V.h;
    checkOrientation();
  }
  function playOpening(after) {
    startCinema(openingFilm(), () => {
      setAmbientTheme(themeById("bhupali"));
      setMusicIntensity(0.4);
      if (after) after();
    }, { manual: true });
  }
  function begin() {
    if (st.started) return;
    st.started = true;
    document.getElementById("title").classList.remove("on");
    if (!st.sawOpening) {
      st.sawOpening = true;
      playOpening(null);
    }
    if (isTouch() && !isFullscreen()) enterFullscreen().then(checkOrientation);
    checkOrientation();
    try {
      initAudio();
      unlockAudio();
      loadSound();
      setMusicEnabled(true);
      setMusicActive(true);
      setMusicIntensity(0);
      setAmbientTheme(themeById("bhupali"));
    } catch (e) {
    }
  }
  function main() {
    loadKeys();
    initMenu({ isTouch, padOn: () => pad3.on });
    cv = document.getElementById("game");
    ctx2 = cv.getContext("2d");
    overlay = document.getElementById("overlay");
    rotateEl = document.getElementById("rotate");
    const dev = /^https?:$/.test(location.protocol) && /^(localhost|127\.0\.0\.1|\[::1\]|[^.]*\.github\.io)$/.test(location.hostname);
    const ver = dev ? document.getElementById("ver") : null;
    if (!dev) {
      const v = document.getElementById("ver");
      if (v) v.style.display = "none";
    }
    if (ver) {
      ver.innerHTML = `build ${BUILD} &middot; ${BUILT}`;
      latestBuild().then((n) => {
        if (n === null) ver.innerHTML += ' &middot; <span class="dim">offline</span>';
        else if (n > BUILD) {
          ver.innerHTML += ` &middot; <b class="new">build ${n} is out</b> <button id="refresh" class="mini">fetch it</button>`;
          document.getElementById("refresh").addEventListener("pointerdown", (e) => {
            e.stopPropagation();
            hardRefresh((msg) => {
              ver.textContent = msg;
            });
          });
        } else {
          ver.innerHTML += ' &middot; <span class="ok">up to date</span> <button id="refresh" class="mini">refetch</button>';
          document.getElementById("refresh").addEventListener("pointerdown", (e) => {
            e.stopPropagation();
            hardRefresh((msg) => {
              ver.textContent = msg;
            });
          });
        }
      });
    }
    world.player = S;
    world.overworld = true;
    world.enemies.length = 0;
    gfx.epoch = 0;
    buildGround();
    initLitter(V.w, V.h);
    preload(PORTRAITS.filter((n) => n.startsWith("keeper-")));
    terrain = createTerrain({ W: V.w, H: V.h, classify, roadDist });
    sowScenery();
    sowTallMask();
    grass = createGrass(terrain, {
      W: V.w,
      H: V.h,
      x0: 0,
      y0: 0,
      tallAt: tallGrassAt,
      blocked: (x, y) => nearRiver(x, y, 30) || inTarn(x, y, 24) || onSolid(x, y) || x > COURT.x && x < COURT.x + COURT.w && y > COURT.y && y < COURT.y + COURT.h
    });
    water = createWildsWater();
    water.setCalm(2.6);
    resize();
    camera.x = clamp(S.x - view.w / 2, 0, Math.max(0, V.w - view.w));
    camera.y = clamp(S.y - view.h / 2, 0, Math.max(0, V.h - view.h));
    terrain.warm(camera.x, camera.y, view.w, view.h);
    addEventListener("resize", resize);
    addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (cinemaOn()) {
        pressCinema();
        e.preventDefault();
        return;
      }
      if (st.credits) {
        if (creditsEnd) creditsEnd();
        e.preventDefault();
        return;
      }
      const a = actionFor(k);
      const ok2 = k === "enter" || a === "interact" || a === "jump";
      if (menuOn()) {
        menuKey(k, a);
        e.preventDefault();
        return;
      }
      if (a === "belt") {
        begin();
        if (st.wheel) closeBelt(false);
        else openBelt();
        e.preventDefault();
        return;
      }
      if (st.reading) {
        if (a === "left") {
          stepReading(-1);
          e.preventDefault();
          return;
        }
        if (a === "right") {
          stepReading(1);
          e.preventDefault();
          return;
        }
      }
      if (st.talking && !st.talking.keeper) {
        if (a === "left") {
          stepTalk(-1);
          e.preventDefault();
          return;
        }
        if (a === "right") {
          stepTalk(1);
          e.preventDefault();
          return;
        }
      }
      if (st.talking && st.talking.keeper && k === "escape") {
        closeTalk();
        e.preventDefault();
        return;
      }
      if (st.wheel) {
        if (a === "left") beltMove(-1);
        else if (a === "right") beltMove(1);
        else if (k === "escape" || k === "q") closeBelt(false);
        else if (ok2) closeBelt(true);
        e.preventDefault();
        return;
      }
      if (k === "escape") {
        if (!st.talking && !st.reading && !st.watching) {
          begin();
          openMenu();
        }
        e.preventDefault();
        return;
      }
      keys.add(k);
      if (st.talking && st.talking.keeper) {
        if (a === "up") {
          moveSel(-1);
          e.preventDefault();
          return;
        }
        if (a === "down") {
          moveSel(1);
          e.preventDefault();
          return;
        }
        if (ok2) {
          pickSel();
          e.preventDefault();
          return;
        }
      }
      if (a === "dash") {
        begin();
        dashWant = true;
        e.preventDefault();
      }
      if (ok2) {
        begin();
        if (st.talking || st.reading) advance();
        else if (a === "jump") jumpWant = BUFFER;
        e.preventDefault();
      }
    });
    addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
    const sc = () => view.scale || 1;
    cv.addEventListener("pointerdown", (e) => {
      if (cinemaOn()) {
        pressCinema();
        return;
      }
      begin();
      if (isTouch() && !isFullscreen()) enterFullscreen().then(checkOrientation);
      const px = e.clientX / sc(), py = e.clientY / sc();
      if (menuOn()) {
        menuPointer(px, py);
        return;
      }
      if (thinkX && Math.hypot(px - thinkX.x, py - thinkX.y) < thinkX.r) {
        dropThought();
        return;
      }
      if (st.wheel) {
        for (const b of beltSlots) {
          if (Math.hypot(px - b.x, py - b.y) < b.r) {
            equipTool(b.id);
            st.wheel = null;
            return;
          }
        }
        closeBelt(false);
        return;
      }
      if (st.talking || st.reading) {
        advance();
        return;
      }
      const hit = hitButton(px, py);
      if (hit) {
        const b = BTN[hit];
        b.id = e.pointerId === void 0 ? -2 : e.pointerId;
        b.on = true;
        try {
          cv.setPointerCapture(e.pointerId);
        } catch (err) {
        }
        if (hit === "jump") jumpWant = BUFFER;
        else if (hit === "dash") dashWant = true;
        else if (hit === "belt") openBelt();
        else if (hit === "menu") {
          b.on = false;
          b.id = -1;
          openMenu();
        }
        return;
      }
      if (!isTouch()) {
        if (e.button === 0 || e.button === void 0) keys.add("mouse1");
        return;
      }
      if (px > view.w * 0.62) return;
      if (touch.on) return;
      touch.on = true;
      touch.id = e.pointerId === void 0 ? -2 : e.pointerId;
      touch.ox = e.clientX;
      touch.oy = e.clientY;
      touch.x = e.clientX;
      touch.y = e.clientY;
      try {
        cv.setPointerCapture(e.pointerId);
      } catch (err) {
      }
    });
    cv.addEventListener("pointermove", (e) => {
      const id = e.pointerId === void 0 ? -2 : e.pointerId;
      if (touch.on && id === touch.id) {
        touch.x = e.clientX;
        touch.y = e.clientY;
        const dx = touch.x - touch.ox, dy = touch.y - touch.oy;
        const d = Math.hypot(dx, dy), lim = STICK_MAX * sc();
        if (d > lim) {
          touch.ox += dx / d * (d - lim);
          touch.oy += dy / d * (d - lim);
        }
        return;
      }
      for (const k of Object.keys(BTN)) {
        const b = BTN[k];
        if (b.id !== id) continue;
        if (Math.hypot(e.clientX / sc() - b.x, e.clientY / sc() - b.y) > b.r * 2) {
          b.id = -1;
          b.on = false;
        }
        return;
      }
    });
    const letGo = (e) => {
      const id = e && e.pointerId !== void 0 ? e.pointerId : -2;
      if (!e || e.button === 0 || e.button === void 0) keys.delete("mouse1");
      if (touch.on && id === touch.id) {
        touch.on = false;
        touch.id = -1;
        return;
      }
      releaseButton(id);
    };
    addEventListener("pointerup", letGo);
    addEventListener("pointercancel", letGo);
    cv.addEventListener("lostpointercapture", letGo);
    const allOff = () => {
      keys.clear();
      touch.on = false;
      touch.id = -1;
      for (const k of Object.keys(BTN)) {
        BTN[k].id = -1;
        BTN[k].on = false;
      }
    };
    addEventListener("blur", allOff);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) allOff();
    });
    overlay.addEventListener("pointerdown", () => {
      begin();
      advance();
    });
    document.getElementById("title").addEventListener("pointerdown", begin);
    let last = performance.now();
    const frame2 = (now2) => {
      requestAnimationFrame(frame2);
      const dt = Math.min(0.05, (now2 - last) / 1e3);
      last = now2;
      if (window.innerWidth !== lastW || window.innerHeight !== lastH) resize();
      if (cinemaOn()) {
        updateCinema(dt);
        pollPad();
        setMusicActive(true);
        render();
        return;
      }
      if (st.started && !(rotateEl && rotateEl.classList.contains("on"))) step(dt);
      render();
    };
    requestAnimationFrame(frame2);
  }
  main();
  window.savi = {
    st,
    S,
    G: G2,
    V,
    ROOTS,
    TREE,
    FIRE,
    WOMAN,
    CAPSTAN,
    SLUICE_GATE: GATE,
    PLATFORMS,
    COURSE_LEN,
    atRiver,
    riverAt,
    inWall,
    broom,
    YOUNG,
    STONES,
    inTarn,
    stonesOn,
    reachStone,
    takeStone,
    hurlStone,
    get carried() {
      return carried;
    },
    BTN,
    touch,
    keys,
    get holding() {
      return holding;
    },
    layoutButtons,
    hitButton,
    get parts() {
      return P2;
    },
    dep: (x, y) => depAt(x, y),
    get thinkX() {
      return thinkX;
    },
    LITTER,
    render,
    resize,
    begin,
    say: say2,
    advance,
    fraction,
    gateOpen,
    gateLift,
    jump() {
      jumpWant = BUFFER;
      step(1 / 60);
    },
    opening() {
      playOpening(null);
    },
    isDeep,
    supported,
    leafAt,
    get onLeaf() {
      return onLeaf;
    },
    litterAt: (x, y) => litterAt(x, y, { dx: 0, dy: 0, sp: 0 }),
    breezeAt,
    get terrain() {
      return terrain;
    },
    get drained() {
      return drained;
    },
    get drain() {
      return drain;
    },
    face: drawPortrait,
    openReading,
    run(n = 60) {
      for (let i = 0; i < n; i++) step(1 / 60);
    },
    walk(x, y, n = 60) {
      forceMove = { x, y };
      for (let i = 0; i < n; i++) step(1 / 60);
      forceMove = null;
    },
    dash() {
      dashWant = true;
      step(1 / 60);
      for (let i = 0; i < 20; i++) step(1 / 60);
    },
    hold(sec = 1) {
      keys.add("mouse1");
      for (let i = 0; i < sec * 60; i++) step(1 / 60);
      keys.delete("mouse1");
      step(1 / 60);
    },
    sweep(n = 1) {
      for (let i = 0; i < n; i++) {
        keys.add("mouse1");
        step(1 / 60);
        keys.delete("mouse1");
        for (let j = 0; j < 34; j++) step(1 / 60);
      }
    },
    talkTo,
    KEEPER,
    openMenu,
    closeMenu,
    menuOn,
    menuKey,
    menuPointer,
    drawMenu
  };
})();
