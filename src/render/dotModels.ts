import type { DotModel } from '../engine/cards';
import { COLOR, hexA } from './ui';

/**
 * Tiny dot-matrix "3D" renderer for card art. Models are built from primitives
 * (axis-aligned boxes, lathed surfaces) whose surfaces are sampled as lattices
 * of dots. Dots are back-face culled by their normal, projected with a fixed
 * perspective camera, auto-fitted into the art window, then occlusion-tested
 * against a depth buffer rasterized from each primitive's coarse triangle mesh. Shading is Lambert + depth
 * falloff, expressed as dot size and alpha so it reads as an LED / halftone
 * matrix rather than solid geometry.
 */

type V3 = [number, number, number];

const COLOR_CAP = '#c9a37a';

interface Style {
  /** Lattice pitch along the surface (model units). */
  pitch: number;
  /** Brightness multiplier. */
  gain?: number;
  /** Optional override color (defaults to the card color). */
  color?: string;
}

interface Box extends Style {
  min: V3;
  max: V3;
  /** Faces to skip (e.g. a face resting on another box). */
  skip?: ('top' | 'bottom' | 'px' | 'nx' | 'pz' | 'nz')[];
}

/** A surface of revolution: `profile` is [radius, height] pairs along `axis` from `origin`. */
interface Lathe extends Style {
  profile: [number, number][];
  origin?: V3;
  axis?: V3;
  /** Flip normals inward (e.g. the inside wall of a rim). */
  inside?: boolean;
}

/** A height field z = h(x, y) over a rectangle, facing +z. */
interface Field extends Style {
  x: [number, number];
  y: [number, number];
  h: (x: number, y: number) => number;
  /** Per-point brightness multiplier; dots below 0.05 are dropped (holes, edge fades). */
  mask?: (x: number, y: number) => number;
}

/** A surface sample: position, normal, pitch (for splat size), brightness, color. */
interface Sample { p: V3; n: V3; pitch: number; a: number; color: string }

/** A free-floating dot that is not culled, shaded or used as an occluder (particles, trails). */
interface Dot { p: V3; r: number; a: number; color: string }

interface Camera {
  yaw: number; pitch: number; dist: number; target: V3;
  /** Direction toward the light (default upper-left-front). */
  light?: V3;
  /** Brightness of faces turned away from the light, 0..1 (default 0.35). */
  ambient?: number;
  /** Fit the frame to clearly visible surfaces only, letting particles and faint fringes run off the edge (default false). */
  fitSurfaces?: boolean;
}

type Tri = [V3, V3, V3];

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(...a); return [a[0] / l, a[1] / l, a[2] / l]; };

function boxSamples(b: Box, col: string): Sample[] {
  const out: Sample[] = [];
  const faces: { n: V3; name: NonNullable<Box['skip']>[number]; ax: number; val: number }[] = [
    { n: [0, 1, 0], name: 'top', ax: 1, val: b.max[1] },
    { n: [0, -1, 0], name: 'bottom', ax: 1, val: b.min[1] },
    { n: [1, 0, 0], name: 'px', ax: 0, val: b.max[0] },
    { n: [-1, 0, 0], name: 'nx', ax: 0, val: b.min[0] },
    { n: [0, 0, 1], name: 'pz', ax: 2, val: b.max[2] },
    { n: [0, 0, -1], name: 'nz', ax: 2, val: b.min[2] },
  ];
  for (const fc of faces) {
    if (b.skip?.includes(fc.name)) continue;
    const [u, w] = [0, 1, 2].filter((i) => i !== fc.ax);
    const nu = Math.max(1, Math.round((b.max[u] - b.min[u]) / b.pitch));
    const nw = Math.max(1, Math.round((b.max[w] - b.min[w]) / b.pitch));
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nw; j++) {
      const p: V3 = [0, 0, 0];
      p[fc.ax] = fc.val;
      p[u] = b.min[u] + ((b.max[u] - b.min[u]) * i) / nu;
      p[w] = b.min[w] + ((b.max[w] - b.min[w]) * j) / nw;
      const edge = i === 0 || j === 0 || i === nu || j === nw;
      out.push({ p, n: fc.n, pitch: b.pitch, a: (b.gain ?? 1) * (edge ? 1.35 : 1), color: b.color ?? col });
    }
  }
  return out;
}

function boxTris(b: Box): Tri[] {
  const out: Tri[] = [];
  const faces: [NonNullable<Box['skip']>[number], number, number][] = [
    ['top', 1, b.max[1]], ['bottom', 1, b.min[1]], ['px', 0, b.max[0]], ['nx', 0, b.min[0]], ['pz', 2, b.max[2]], ['nz', 2, b.min[2]],
  ];
  for (const [name, axis, val] of faces) {
    if (b.skip?.includes(name)) continue;
    const [u, w] = [0, 1, 2].filter((i) => i !== axis);
    const c = [[b.min[u], b.min[w]], [b.max[u], b.min[w]], [b.max[u], b.max[w]], [b.min[u], b.max[w]]].map(([cu, cw]) => {
      const p: V3 = [0, 0, 0];
      p[axis] = val; p[u] = cu; p[w] = cw;
      return p;
    });
    out.push([c[0], c[1], c[2]], [c[0], c[2], c[3]]);
  }
  return out;
}

function latheFrame(l: Lathe) {
  const o = l.origin ?? [0, 0, 0];
  const ax = norm(l.axis ?? [0, 1, 0]);
  const e1 = norm(cross(ax, Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  const e2 = cross(ax, e1);
  const at = (r: number, h: number, th: number) => add(o, add(scale(add(scale(e1, Math.cos(th)), scale(e2, Math.sin(th))), r), scale(ax, h)));
  return { o, ax, e1, e2, at };
}

function latheTris(l: Lathe): Tri[] {
  const out: Tri[] = [];
  const { at } = latheFrame(l);
  const seg = 40;
  for (let s = 0; s < l.profile.length - 1; s++) {
    const [r0, h0] = l.profile[s], [r1, h1] = l.profile[s + 1];
    for (let i = 0; i < seg; i++) {
      const t0 = (Math.PI * 2 * i) / seg, t1 = (Math.PI * 2 * (i + 1)) / seg;
      const a = at(r0, h0, t0), b = at(r0, h0, t1), c = at(r1, h1, t1), d = at(r1, h1, t0);
      out.push([a, b, c], [a, c, d]);
    }
  }
  return out;
}

function latheSamples(l: Lathe, col: string): Sample[] {
  const out: Sample[] = [];
  const { o, ax, e1, e2 } = latheFrame(l);
  const prof = l.profile;
  // Walk the profile at roughly `pitch` spacing along its arc length.
  for (let s = 0; s < prof.length - 1; s++) {
    const [r0, h0] = prof[s], [r1, h1] = prof[s + 1];
    const segLen = Math.hypot(r1 - r0, h1 - h0);
    const steps = Math.max(1, Math.round(segLen / l.pitch));
    // Profile tangent (dr, dh) → outward normal in (radial, axial) is (dh, -dr).
    const nr = (h1 - h0) / segLen, nh = -(r1 - r0) / segLen;
    const last = s === prof.length - 2;
    for (let k = 0; k <= (last ? steps : steps - 1); k++) {
      const t = k / steps;
      const r = r0 + (r1 - r0) * t, h = h0 + (h1 - h0) * t;
      const ring = Math.max(1, Math.round((Math.PI * 2 * r) / l.pitch));
      const endpoint = (s === 0 && k === 0) || (last && k === steps);
      for (let i = 0; i < ring; i++) {
        const th = (Math.PI * 2 * i) / ring;
        const radial = add(scale(e1, Math.cos(th)), scale(e2, Math.sin(th)));
        const p = add(o, add(scale(radial, r), scale(ax, h)));
        let n = norm(add(scale(radial, nr), scale(ax, nh)));
        if (l.inside) n = scale(n, -1);
        out.push({ p, n, pitch: l.pitch, a: (l.gain ?? 1) * (endpoint ? 1.35 : 1), color: l.color ?? col });
      }
    }
  }
  return out;
}

function fieldNormal(f: Field, x: number, y: number): V3 {
  const e = 1e-3;
  const hx = (f.h(x + e, y) - f.h(x - e, y)) / (2 * e);
  const hy = (f.h(x, y + e) - f.h(x, y - e)) / (2 * e);
  return norm([-hx, -hy, 1]);
}

function fieldSamples(f: Field, col: string): Sample[] {
  const out: Sample[] = [];
  const ny = Math.round((f.y[1] - f.y[0]) / f.pitch);
  for (let j = 0; j <= ny; j++) {
    const y = f.y[0] + ((f.y[1] - f.y[0]) * j) / ny;
    // Walk each row by surface arc length so steep slopes aren't sparse.
    for (let x = f.x[0]; x <= f.x[1] + 1e-6;) {
      const m = f.mask ? f.mask(x, y) : 1;
      const n = fieldNormal(f, x, y);
      if (m >= 0.05) out.push({ p: [x, y, f.h(x, y)], n, pitch: f.pitch, a: (f.gain ?? 1) * m, color: f.color ?? col });
      x += f.pitch * Math.max(0.25, n[2] / Math.hypot(n[0], n[2]));
    }
  }
  return out;
}

function fieldTris(f: Field): Tri[] {
  const out: Tri[] = [];
  const step = f.pitch;
  const nx = Math.round((f.x[1] - f.x[0]) / step), ny = Math.round((f.y[1] - f.y[0]) / step);
  const at = (i: number, j: number): V3 => {
    const x = f.x[0] + ((f.x[1] - f.x[0]) * i) / nx, y = f.y[0] + ((f.y[1] - f.y[0]) * j) / ny;
    return [x, y, f.h(x, y)];
  };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
    out.push([a, b, c], [a, c, d]);
  }
  return out;
}

/** Collects a model's dot samples, occluder triangles and free particles. */
class Scene {
  samples: Sample[] = [];
  tris: Tri[] = [];
  extra: Dot[] = [];
  constructor(private col: string) {}
  box(b: Box) { this.samples.push(...boxSamples(b, this.col)); this.tris.push(...boxTris(b)); }
  lathe(l: Lathe) { this.samples.push(...latheSamples(l, this.col)); this.tris.push(...latheTris(l)); }
  field(f: Field) { this.samples.push(...fieldSamples(f, this.col)); this.tris.push(...fieldTris(f)); }
}

function render(
  ctx: CanvasRenderingContext2D, scene: Scene, cam: Camera,
  ax: number, ay: number, aw: number, ah: number,
) {
  const { samples, tris, extra } = scene;
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const eye: V3 = [
    cam.target[0] + cam.dist * cp * sy,
    cam.target[1] + cam.dist * sp,
    cam.target[2] + cam.dist * cp * cy,
  ];
  const fwd = norm(sub(cam.target, eye));
  const right = norm([fwd[2], 0, -fwd[0]]);
  const up = cross(fwd, right);
  const light = norm(cam.light ?? [-0.5, 1, 0.7]);
  const amb = cam.ambient ?? 0.35;

  interface P { x: number; y: number; z: number; r: number; a: number; color: string; pitch: number; free: boolean }
  const pts: P[] = [];
  const project = (p: V3) => {
    const v = sub(p, eye);
    const z = dot3(v, fwd);
    return { x: dot3(v, right) / z, y: -dot3(v, up) / z, z };
  };
  for (const s of samples) {
    if (dot3(s.n, sub(eye, s.p)) <= 0) continue; // back-facing
    const lam = amb + (1 - amb) * Math.max(0, dot3(s.n, light));
    pts.push({ ...project(s.p), r: 0, a: s.a * lam, color: s.color, pitch: s.pitch, free: false });
  }
  for (const e of extra) pts.push({ ...project(e.p), r: e.r, a: e.a, color: e.color, pitch: 0, free: true });

  // Fit the projected cloud into the art window (with padding), centred.
  const pad = 12;
  const fitPts = cam.fitSurfaces ? pts.filter((d) => !d.free && d.a > 0.3) : pts;
  const xs = fitPts.map((d) => d.x), ys = fitPts.map((d) => d.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const k = Math.min((aw - 2 * pad) / (x1 - x0), (ah - 2 * pad) / (y1 - y0));
  for (const d of pts) {
    d.x = ax + aw / 2 + (d.x - (x0 + x1) / 2) * k;
    d.y = ay + ah / 2 + (d.y - (y0 + y1) / 2) * k;
  }

  // Occlusion: rasterize every occluder triangle into a depth buffer (1/z
  // interpolated in screen space), then keep dots at or in front of it. The
  // max over a 3x3 neighbourhood forgives quantization on grazing surfaces.
  const cell = 0.5;
  const gw = Math.ceil(aw / cell) + 1, gh = Math.ceil(ah / cell) + 1;
  const zbuf = new Float32Array(gw * gh).fill(Infinity);
  const toGrid = (p: V3) => {
    const q = project(p);
    return { x: (ax + aw / 2 + (q.x - (x0 + x1) / 2) * k - ax) / cell, y: (ay + ah / 2 + (q.y - (y0 + y1) / 2) * k - ay) / cell, iz: 1 / q.z };
  };
  for (const t of tris) {
    const [a, b, c] = t.map(toGrid);
    const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    if (Math.abs(area) < 1e-9) continue;
    const minX = Math.max(0, Math.floor(Math.min(a.x, b.x, c.x))), maxX = Math.min(gw - 1, Math.ceil(Math.max(a.x, b.x, c.x)));
    const minY = Math.max(0, Math.floor(Math.min(a.y, b.y, c.y))), maxY = Math.min(gh - 1, Math.ceil(Math.max(a.y, b.y, c.y)));
    for (let gy = minY; gy <= maxY; gy++) for (let gx = minX; gx <= maxX; gx++) {
      const w0 = ((b.x - gx) * (c.y - gy) - (b.y - gy) * (c.x - gx)) / area;
      const w1 = ((c.x - gx) * (a.y - gy) - (c.y - gy) * (a.x - gx)) / area;
      const w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = 1 / (w0 * a.iz + w1 * b.iz + w2 * c.iz);
      const i = gy * gw + gx;
      if (z < zbuf[i]) zbuf[i] = z;
    }
  }
  const dots = pts.filter((d) => {
    const cx = Math.round((d.x - ax) / cell), cy2 = Math.round((d.y - ay) / cell);
    let front = -Infinity;
    for (let gy = cy2 - 1; gy <= cy2 + 1; gy++) for (let gx = cx - 1; gx <= cx + 1; gx++) {
      front = Math.max(front, gx < 0 || gy < 0 || gx >= gw || gy >= gh ? Infinity : zbuf[gy * gw + gx]);
    }
    return d.z <= front + 0.15 * d.pitch + 1e-3;
  });

  // Depth falloff relative to the visible range, far-to-near so near dots win.
  const zs = dots.map((d) => d.z);
  const zMin = Math.min(...zs), zMax = Math.max(...zs);
  dots.sort((a, b) => b.z - a.z);
  ctx.save();
  ctx.beginPath();
  ctx.rect(ax, ay, aw, ah);
  ctx.clip();
  ctx.shadowBlur = 6;
  for (const d of dots) {
    const depth = 1 - (d.z - zMin) / (zMax - zMin || 1);
    const a = Math.min(1, d.a * (0.45 + 0.55 * depth));
    const r = (d.r || 1.3) * (0.7 + 0.5 * depth) * (0.6 + 0.4 * Math.min(1, a));
    ctx.fillStyle = hexA(d.color, a);
    ctx.shadowColor = hexA(d.color, a * 0.8);
    ctx.fillRect(d.x - r, d.y - r, r * 2, r * 2);
  }
  ctx.restore();
}

/** Overclock: a CPU package with SMD caps and heat rising off the lid. */
function drawCpu(ctx: CanvasRenderingContext2D, rnd: () => number, ax: number, ay: number, aw: number, ah: number, col: string, heat: string) {
  const boxes: Box[] = [
    // Substrate.
    { min: [-5, 0, -5], max: [5, 0.45, 5], pitch: 0.62, gain: 0.55, skip: ['bottom'] },
    // Heat spreader lid: a lip plus the raised top.
    { min: [-3.7, 0.45, -3.7], max: [3.7, 0.75, 3.7], pitch: 0.5, gain: 0.8, skip: ['bottom'] },
    { min: [-3.3, 0.75, -3.3], max: [3.3, 1.35, 3.3], pitch: 0.44, gain: 1.1, skip: ['bottom'] },
  ];
  // SMD capacitor rows along two edges.
  for (let k = -3; k <= 3; k++) {
    const c = k * 0.95;
    boxes.push({ min: [c - 0.18, 0.45, 4.05], max: [c + 0.18, 0.7, 4.55], pitch: 0.25, gain: 0.9, color: COLOR_CAP, skip: ['bottom'] });
    boxes.push({ min: [4.05, 0.45, c - 0.18], max: [4.55, 0.7, c + 0.18], pitch: 0.25, gain: 0.9, color: COLOR_CAP, skip: ['bottom'] });
  }
  // Pin-1 marker.
  boxes.push({ min: [-4.7, 0.45, -4.7], max: [-4.2, 0.55, -4.2], pitch: 0.12, gain: 1.6, skip: ['bottom'] });

  const scene = new Scene(col);
  boxes.forEach((b) => scene.box(b));

  // Heat: three wavy columns of dots rising off the lid, fading and spreading as they climb.
  const extra = scene.extra;
  for (let c3 = -1; c3 <= 1; c3++) {
    const phase = rnd() * Math.PI * 2;
    for (let i = 0; i < 13; i++) {
      const t = i / 12;
      const x = c3 * 1.9 + Math.sin(phase + t * 7) * (0.35 + t * 0.6);
      extra.push({ p: [x, 1.8 + t * 3.4, c3 * -0.6], r: 1.7 - t * 0.7, a: 1 - t * 0.85, color: heat });
    }
  }

  render(ctx, scene, { yaw: 0.62, pitch: 0.5, dist: 30, target: [0, 2, 0] }, ax, ay, aw, ah);
}

/**
 * Honeypot: a bulbous pot brimming with honey that drips down its sides, a
 * dipper resting in it, and data packets spiralling in to get stuck.
 */
function drawHoneypot(ctx: CanvasRenderingContext2D, rnd: () => number, ax: number, ay: number, aw: number, ah: number, col: string, honey: string) {
  const scene = new Scene(col);
  const lathe = (l: Lathe) => scene.lathe(l);

  // Pot body: foot, bulge, neck, rolled lip.
  const body: [number, number][] = [
    [0, 0], [1.3, 0], [1.6, 0.2], [2.4, 1.0], [2.75, 2.1], [2.65, 3.1], [2.2, 3.9], [1.85, 4.3], [2.2, 4.45], [2.3, 4.65], [2.1, 4.8],
  ];
  lathe({ profile: body, pitch: 0.3, gain: 0.95 });
  // Inner wall above the honey line, and the honey surface itself (normal up).
  lathe({ profile: [[2.0, 4.8], [1.85, 4.45]], pitch: 0.24, gain: 0.6, inside: true });
  lathe({ profile: [[1.85, 4.45], [0, 4.45]], pitch: 0.26, gain: 1.1, color: honey });
  // Raised label band around the bulge.
  lathe({ profile: [[2.74, 1.8], [2.79, 1.95], [2.79, 2.35], [2.74, 2.5]], pitch: 0.2, gain: 1.4 });

  // Honey drips over the lip: amber strips hugging the profile, varying length, bulb at the tip.
  const potR = (h: number) => {
    for (let i = 0; i < body.length - 1; i++) {
      const [r0, h0] = body[i], [r1, h1] = body[i + 1];
      if (h1 > h0 && h >= h0 && h <= h1) return r0 + ((r1 - r0) * (h - h0)) / (h1 - h0);
    }
    return 2;
  };
  for (let d = 0; d < 5; d++) {
    const th = -0.2 + d * 0.62 + rnd() * 0.2;
    const len = 0.9 + rnd() * 2.6;
    const w = 0.14 + rnd() * 0.1;
    const wob = rnd() * Math.PI * 2;
    for (let h = 4.75; h > 4.75 - len; h -= 0.18) {
      const bulb = h - (4.75 - len) < 0.35 ? 1.7 : 1;
      const sway = Math.sin(wob + h * 2.2) * 0.05;
      for (let a = -w * bulb; a <= w * bulb + 1e-6; a += 0.14) {
        const t = th + sway + a / 2.3;
        const r = potR(h) + 0.06;
        const radial: V3 = [Math.sin(t), 0, Math.cos(t)];
        scene.samples.push({ p: [radial[0] * r, h, radial[2] * r], n: radial, pitch: 0.16, a: 1.25, color: honey });
      }
    }
  }

  // Dipper: a stick leaning out of the pot with a grooved head sunk in the honey.
  const tilt = norm([-0.9, 1, 0.5]);
  const head: V3 = [0.5, 3.9, -0.3];
  lathe({ profile: [[0, 0], [0.12, 0], [0.12, 3.6], [0.18, 3.8], [0, 3.95]], origin: head, axis: tilt, pitch: 0.16, gain: 1.1, color: COLOR_CAP });
  lathe({ profile: [[0.3, 0.2], [0.5, 0.35], [0.5, 0.55], [0.3, 0.7], [0.5, 0.85], [0.5, 1.05], [0.3, 1.2]], origin: head, axis: tilt, pitch: 0.16, gain: 1.1, color: COLOR_CAP });

  // Data packets swooping in from both sides toward the mouth, with dotted trails.
  const yaw = 0.5;
  const side: V3 = [Math.cos(yaw), 0, -Math.sin(yaw)]; // camera-right in the ground plane
  const extra = scene.extra;
  const packets: [number, number, number][] = [[-1, 3.2, 5.4], [1, 3.6, 6.0], [1, 2.6, 7.0]]; // dir, reach, height
  for (const [dir, reach, y] of packets) {
    const jitter = (rnd() - 0.5) * 0.4;
    const pos = (t: number): V3 => {
      const out = reach + t * 4.2;
      return add(scale(side, dir * out), [0, y + jitter + t * t * 2.2, 0]);
    };
    for (let i = 1; i < 12; i++) extra.push({ p: pos(i * 0.08), r: 1.0, a: 0.2 + 0.7 * (1 - i / 12), color: col });
    const c = pos(0);
    const s = 0.28;
    scene.box({ min: [c[0] - s, c[1] - s, c[2] - s], max: [c[0] + s, c[1] + s, c[2] + s], pitch: 0.28, gain: 1.4 });
  }

  render(ctx, scene, { yaw, pitch: 0.5, dist: 34, target: [0, 3, 0] }, ax, ay, aw, ah);
}

type ModelDrawer = (ctx: CanvasRenderingContext2D, rnd: () => number, ax: number, ay: number, aw: number, ah: number, col: string) => void;

/** Card art drawers keyed by `CardDef.model`; each fills the art window (ax, ay, aw, ah). */
export const DOT_MODELS: Record<DotModel, ModelDrawer> = {
  cpu: (ctx, rnd, ax, ay, aw, ah, col) => drawCpu(ctx, rnd, ax, ay, aw, ah, col, COLOR.orange),
  honeypot: (ctx, rnd, ax, ay, aw, ah, col) => drawHoneypot(ctx, rnd, ax, ay, aw, ah, col, COLOR.amber),
};
