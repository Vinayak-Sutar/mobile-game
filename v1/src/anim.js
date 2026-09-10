// Keyframe skeletal animation.
//
// A skeleton is a flat list of bones in parent-first order. A clip holds one
// keyframe track per animated bone. An Animator samples a clip over time and
// cross-fades between clips, producing a local pose; resolvePose walks the
// hierarchy to world transforms, and drawSkeleton renders them.
//
// Deliberately small: no IK solver, no inverse hierarchy, no runtime retarget.
// Everything a top-down character needs is here and nothing else.

import { TAU, clamp, lerp, angleDiff } from './util.js';

export const Ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inCubic: (t) => t * t * t,
  outBack: (t) => {
    const c1 = 2.2, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1;
  },
};

const REST = { angle: 0, x: 0, y: 0, sx: 1, sy: 1 };

/**
 * defs: [{ name, parent, x, y, angle, len, thick, color, shape, z, taper }]
 * `x`/`y`/`angle` are the bone's rest transform in its parent's space.
 */
export function makeSkeleton(defs) {
  const bones = defs.map((d, i) => ({
    name: d.name,
    index: i,
    parent: d.parent ?? null,
    parentIndex: -1,
    x: d.x || 0,
    y: d.y || 0,
    angle: d.angle || 0,
    len: d.len || 0,
    thick: d.thick || 4,
    taper: d.taper ?? 0.7,
    color: d.color || '#f0e6ff',
    shape: d.shape || 'capsule',   // capsule | circle | blob | cloak | none
    z: d.z || 0,
  }));

  const index = {};
  bones.forEach((b, i) => { index[b.name] = i; });
  bones.forEach((b) => { b.parentIndex = b.parent === null ? -1 : (index[b.parent] ?? -1); });

  // Parents must resolve before children; assert rather than silently mis-draw.
  for (const b of bones) {
    if (b.parentIndex >= b.index) {
      throw new Error(`anim: bone "${b.name}" must appear after its parent "${b.parent}"`);
    }
  }
  return { bones, index };
}

/**
 * tracks: { boneName: [{ t, angle, x, y, sx, sy, ease }] }
 * `t` is in seconds. Keys must be sorted ascending.
 */
export function makeClip({ name, duration, loop = true, tracks = {} }) {
  const compiled = {};
  for (const [bone, keys] of Object.entries(tracks)) {
    compiled[bone] = keys.map((k) => ({
      t: k.t,
      angle: k.angle ?? 0,
      x: k.x ?? 0,
      y: k.y ?? 0,
      sx: k.sx ?? 1,
      sy: k.sy ?? 1,
      ease: typeof k.ease === 'function' ? k.ease : (Ease[k.ease] || Ease.inOutQuad),
    }));
  }
  return { name, duration, loop, tracks: compiled };
}

function sampleTrack(keys, t, out) {
  const n = keys.length;
  if (n === 0) return out;
  if (n === 1 || t <= keys[0].t) return copyKey(keys[0], out);
  if (t >= keys[n - 1].t) return copyKey(keys[n - 1], out);

  let i = 0;
  while (i < n - 1 && keys[i + 1].t <= t) i++;
  const a = keys[i], b = keys[i + 1];
  const span = b.t - a.t;
  const raw = span > 1e-6 ? (t - a.t) / span : 0;
  // The easing on the *destination* key governs the segment into it.
  const k = b.ease(clamp(raw, 0, 1));

  out.angle = a.angle + angleDiff(a.angle, b.angle) * k;
  out.x = lerp(a.x, b.x, k);
  out.y = lerp(a.y, b.y, k);
  out.sx = lerp(a.sx, b.sx, k);
  out.sy = lerp(a.sy, b.sy, k);
  return out;
}

function copyKey(k, out) {
  out.angle = k.angle; out.x = k.x; out.y = k.y; out.sx = k.sx; out.sy = k.sy;
  return out;
}

function blankPose(skeleton) {
  const pose = {};
  for (const b of skeleton.bones) pose[b.name] = { ...REST };
  return pose;
}

function samplePose(skeleton, clip, time, pose) {
  const t = clip.loop
    ? ((time % clip.duration) + clip.duration) % clip.duration
    : clamp(time, 0, clip.duration);
  for (const b of skeleton.bones) {
    const track = clip.tracks[b.name];
    const p = pose[b.name];
    if (track) sampleTrack(track, t, p);
    else { p.angle = 0; p.x = 0; p.y = 0; p.sx = 1; p.sy = 1; }
  }
  return pose;
}

function blendInto(dst, from, to, k, skeleton) {
  for (const b of skeleton.bones) {
    const a = from[b.name], c = to[b.name], o = dst[b.name];
    o.angle = a.angle + angleDiff(a.angle, c.angle) * k;
    o.x = lerp(a.x, c.x, k);
    o.y = lerp(a.y, c.y, k);
    o.sx = lerp(a.sx, c.sx, k);
    o.sy = lerp(a.sy, c.sy, k);
  }
  return dst;
}

export class Animator {
  constructor(skeleton) {
    this.skeleton = skeleton;
    this.pose = blankPose(skeleton);
    this._cur = blankPose(skeleton);
    this._prev = blankPose(skeleton);
    this.clip = null;
    this.prevClip = null;
    this.time = 0;
    this.prevTime = 0;
    this.speed = 1;
    this.fade = 0;
    this.fadeDur = 0;
    this.finished = false;
  }

  /** Switch clips, cross-fading from whatever is playing. */
  play(clip, { fade = 0.12, speed = 1, restart = false } = {}) {
    if (!clip) return;
    if (this.clip === clip && !restart) { this.speed = speed; return; }
    if (this.clip && fade > 0) {
      this.prevClip = this.clip;
      this.prevTime = this.time;
      this.fadeDur = fade;
      this.fade = fade;
    } else {
      this.prevClip = null;
      this.fade = 0;
    }
    this.clip = clip;
    this.time = 0;
    this.speed = speed;
    this.finished = false;
  }

  /** Jump to a normalised point in the current clip (0..1). */
  seek(fraction) {
    if (this.clip) this.time = clamp(fraction, 0, 1) * this.clip.duration;
  }

  update(dt) {
    if (!this.clip) return this.pose;
    this.time += dt * this.speed;
    if (!this.clip.loop && this.time >= this.clip.duration) {
      this.time = this.clip.duration;
      this.finished = true;
    }

    samplePose(this.skeleton, this.clip, this.time, this._cur);

    if (this.prevClip && this.fade > 0) {
      this.fade -= dt;
      this.prevTime += dt;
      samplePose(this.skeleton, this.prevClip, this.prevTime, this._prev);
      const k = 1 - clamp(this.fade / this.fadeDur, 0, 1);
      blendInto(this.pose, this._prev, this._cur, k, this.skeleton);
      if (this.fade <= 0) this.prevClip = null;
    } else {
      blendInto(this.pose, this._cur, this._cur, 1, this.skeleton);
    }
    return this.pose;
  }

  /** Additively nudge one bone after sampling — cheap procedural layering. */
  offset(boneName, { angle = 0, x = 0, y = 0, sx = 1, sy = 1 } = {}) {
    const p = this.pose[boneName];
    if (!p) return;
    p.angle += angle;
    p.x += x;
    p.y += y;
    p.sx *= sx;
    p.sy *= sy;
  }

  /** Force one bone to an absolute local angle (used to aim the weapon arm). */
  set(boneName, { angle, x, y, sx, sy }) {
    const p = this.pose[boneName];
    if (!p) return;
    if (angle !== undefined) p.angle = angle;
    if (x !== undefined) p.x = x;
    if (y !== undefined) p.y = y;
    if (sx !== undefined) p.sx = sx;
    if (sy !== undefined) p.sy = sy;
  }
}

/** Walk the hierarchy, turning a local pose into world transforms. */
export function resolvePose(skeleton, pose, root = { x: 0, y: 0, angle: 0, scale: 1 }) {
  const out = new Array(skeleton.bones.length);
  for (const b of skeleton.bones) {
    const p = pose[b.name] || REST;
    const lx = (b.x + p.x);
    const ly = (b.y + p.y);
    const la = b.angle + p.angle;

    let px, py, pa, ps;
    if (b.parentIndex < 0) {
      px = root.x; py = root.y; pa = root.angle; ps = root.scale;
    } else {
      const par = out[b.parentIndex];
      px = par.x; py = par.y; pa = par.angle; ps = par.scale;
    }

    const c = Math.cos(pa), s = Math.sin(pa);
    out[b.index] = {
      bone: b,
      x: px + (lx * c - ly * s) * ps,
      y: py + (lx * s + ly * c) * ps,
      angle: pa + la,
      scale: ps,
      sx: p.sx,
      sy: p.sy,
    };
  }
  return out;
}

/**
 * Render resolved bones back-to-front by z.
 * `tint` replaces every bone colour (used for hit flashes).
 */
export function drawSkeleton(ctx, world, { tint = null, alpha = 1, palette = null, grow = 0 } = {}) {
  const order = world.slice().sort((a, b) => a.bone.z - b.bone.z);
  ctx.globalAlpha = alpha;

  for (const w of order) {
    const b = w.bone;
    if (b.shape === 'none') continue;
    const color = tint || (palette && palette[b.name]) || b.color;
    // `grow` fattens every bone uniformly — used for the dark outline pass
    // that separates the character from the floor.
    const len = b.len * w.scale * w.sx + (b.len > 0 ? grow : 0);
    const thick = b.thick * w.scale * w.sy + grow;

    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.rotate(w.angle);
    ctx.fillStyle = color;

    switch (b.shape) {
      case 'circle':
        ctx.beginPath();
        ctx.arc(0, 0, thick, 0, TAU);
        ctx.fill();
        break;

      case 'blob':
        ctx.beginPath();
        ctx.ellipse(len * 0.5, 0, Math.max(1, len * 0.5), thick, 0, 0, TAU);
        ctx.fill();
        break;

      case 'cloak': {
        // A tapered quad that fans out behind the character.
        const w0 = thick, w1 = thick * b.taper;
        ctx.beginPath();
        ctx.moveTo(0, -w0);
        ctx.lineTo(len, -w1);
        ctx.lineTo(len, w1);
        ctx.lineTo(0, w0);
        ctx.closePath();
        ctx.fill();
        break;
      }

      default: {
        // Capsule limb: rounded both ends so joints never show a seam.
        ctx.lineCap = 'round';
        ctx.strokeStyle = color;
        ctx.lineWidth = thick * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.max(0.01, len), 0);
        ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/** Convenience: find a resolved bone by name. */
export function boneAt(world, skeleton, name) {
  const i = skeleton.index[name];
  return i === undefined ? null : world[i];
}
