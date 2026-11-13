import * as THREE from 'three';

/** Tunable look of a fracture burst. Distances are virtual px, times are seconds. */
export interface FractureStyle {
  /** Grid size of the dots the cracks are built from. 0 draws smooth lines instead. */
  pixel: number;
  /** How far, at most, a hit lands from where it was aimed, so hits in quick succession don't stack. */
  scatter: number;
  /** 0 = square blocks, 1 = round dots. */
  round: number;
  /** 0..1: how much the damage spreads sideways off the cracks in speckled patches, like an infection. */
  spread: number;
  /** 0..1: strength of the red dot haze that closes in from the screen edges on a hit. */
  vignette: number;
  /** Directions a crack may run in: 4 = right angles, 8 = adds diagonals, 0 = any. */
  angles: number;
  /** 0..1: stray dots that spark beside the cracks as they pass. Dot mode only. */
  debris: number;
  /** Main cracks leaving the impact point at 1 damage. */
  rays: number;
  /** Main cracks run until they leave the screen; `reach` then only sizes the forks, webbing and flash. */
  toEdge: boolean;
  /** How far the main cracks run at 1 damage (when they don't run to the edge). */
  reach: number;
  /** How much each extra point of damage adds to reach, ray count and width (0 = damage is ignored). */
  scaling: number;
  /** Mean length of one straight piece of a crack. */
  step: number;
  /** 0 = straight spokes, 1 = wildly kinked. */
  jagged: number;
  /** Chance per piece that a crack forks. */
  branch: number;
  /** Chance that two neighbouring cracks are joined by a cross crack, like a spider-webbed pane. */
  web: number;
  /** Width of a main crack where it starts. */
  width: number;
  /** How fast the cracks run outward, px per second. */
  speed: number;
  /** How long the white-hot leading edge takes to cool to the base colour. */
  heat: number;
  /** How long the full pattern stays lit once it has finished growing. */
  hold: number;
  /** How long it takes to fade out after the hold. */
  fade: number;
  /** 0 = steady, 1 = pieces of the pattern drop out and stutter. */
  flicker: number;
  /** Strength of the glow at the impact point. */
  flash: number;
  color: string;
}

export const DEFAULT_FRACTURE: FractureStyle = {
  pixel: 5, scatter: 160, round: 1, spread: 0.5, vignette: 0.6, angles: 8, debris: 0.3,
  rays: 6, toEdge: true, reach: 320, scaling: 0.45, step: 56, jagged: 0.5, branch: 0.12, web: 0.2,
  width: 9, speed: 2400, heat: 0.06, hold: 0.12, fade: 0.45, flicker: 0.35, flash: 0, color: '#ff2a4a',
};

export interface Bounds { left: number; right: number; bottom: number; top: number }

interface Seg { ax: number; ay: number; bx: number; by: number; d0: number; d1: number; w0: number; w1: number }
interface Pt { x: number; y: number; d: number }

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo);

/** Distance from (x, y) along `heading` to where it leaves the bounds. */
function edgeDistance(x: number, y: number, heading: number, b: Bounds) {
  const dx = Math.cos(heading), dy = Math.sin(heading);
  const tx = dx > 0 ? (b.right - x) / dx : dx < 0 ? (b.left - x) / dx : Infinity;
  const ty = dy > 0 ? (b.top - y) / dy : dy < 0 ? (b.bottom - y) / dy : Infinity;
  return Math.max(0, Math.min(tx, ty));
}

/** Build the crack pattern for one impact as straight pieces, each knowing how far along the crack it sits. */
function shatter(x: number, y: number, damage: number, s: FractureStyle, b: Bounds) {
  const k = Math.max(0, Math.min(damage, 12) - 1) * s.scaling;
  const reach = s.reach * (1 + k);
  const rays = Math.max(2, Math.round(s.rays * (1 + k * 0.35)));
  const width = s.width * (1 + k * 0.15);
  const segs: Seg[] = [];
  let far = 0;

  const inside = (px: number, py: number) => px > b.left - 60 && px < b.right + 60 && py > b.bottom - 60 && py < b.top + 60;

  const grow = (sx: number, sy: number, heading: number, length: number, dist: number, w: number, depth: number): Pt[] => {
    const path: Pt[] = [{ x: sx, y: sy, d: dist }];
    let px = sx, py = sy, wander = 0, left = length;
    while (left > 1) {
      const len = Math.min(left, s.step * rand(0.45, 1.55));
      // A random walk pulled back toward the heading, so cracks kink but keep radiating outward.
      wander = wander * 0.6 + rand(-1, 1) * s.jagged * 1.25;
      const turnStep = s.angles > 0 ? (Math.PI * 2) / s.angles : 0;
      const a = turnStep ? Math.round((heading + wander) / turnStep) * turnStep : heading + wander;
      const nx = px + Math.cos(a) * len, ny = py + Math.sin(a) * len;
      const w0 = w * Math.max(0.12, left / length), w1 = w * Math.max(0.12, (left - len) / length);
      segs.push({ ax: px, ay: py, bx: nx, by: ny, d0: dist, d1: dist + len, w0, w1 });
      px = nx; py = ny; dist += len; left -= len;
      far = Math.max(far, dist);
      path.push({ x: px, y: py, d: dist });
      if (!inside(px, py)) break;
      if (depth < 3 && left > s.step && Math.random() < s.branch) {
        const turn = rand(0.35, 1.05) * (Math.random() < 0.5 ? -1 : 1);
        grow(px, py, a + turn, Math.min(left, reach * 1.5) * rand(0.3, 0.7), dist, w0 * 0.6, depth + 1);
      }
    }
    return path;
  };

  const spokes: Pt[][] = [];
  const start = rand(0, Math.PI * 2);
  for (let i = 0; i < rays; i++) {
    const heading = start + ((i + rand(-0.32, 0.32)) / rays) * Math.PI * 2;
    // To the edge: aim well past it, since the crack wanders, and let leaving the screen end it.
    const length = s.toEdge ? edgeDistance(x, y, heading, b) * 1.4 + 120 : reach * rand(0.6, 1.15);
    spokes.push(grow(x, y, heading, length, 0, width, 0));
  }

  // Cross cracks between neighbouring spokes.
  const at = (path: Pt[], d: number) => path.reduce((best, p) => (Math.abs(p.d - d) < Math.abs(best.d - d) ? p : best));
  for (let i = 0; i < spokes.length && spokes.length > 2; i++) {
    for (let ring = 0; ring < 2; ring++) {
      if (Math.random() >= s.web) continue;
      const r = reach * (ring === 0 ? rand(0.12, 0.3) : rand(0.35, 0.65));
      const from = at(spokes[i], r), to = at(spokes[(i + 1) % spokes.length], r * rand(0.8, 1.2));
      const span = Math.hypot(to.x - from.x, to.y - from.y);
      if (span < 12 || span > reach) continue;
      // One kink in the middle keeps it from looking ruled.
      const mx = (from.x + to.x) / 2 + rand(-1, 1) * span * 0.12 * (0.3 + s.jagged);
      const my = (from.y + to.y) / 2 + rand(-1, 1) * span * 0.12 * (0.3 + s.jagged);
      const w = width * 0.4;
      const half = Math.hypot(mx - from.x, my - from.y);
      segs.push({ ax: from.x, ay: from.y, bx: mx, by: my, d0: from.d, d1: from.d + half, w0: w, w1: w });
      const end = from.d + half + Math.hypot(to.x - mx, to.y - my);
      segs.push({ ax: mx, ay: my, bx: to.x, by: to.y, d0: from.d + half, d1: end, w0: w, w1: w * 0.6 });
      far = Math.max(far, end);
    }
  }
  return { segs, far, reach };
}

function crackGeometry(segs: Seg[]) {
  const pos = new Float32Array(segs.length * 12);
  const dist = new Float32Array(segs.length * 4);
  const side = new Float32Array(segs.length * 4);
  const index = new Uint32Array(segs.length * 6);
  segs.forEach((g, i) => {
    const len = Math.hypot(g.bx - g.ax, g.by - g.ay) || 1;
    const ux = (g.bx - g.ax) / len, uy = (g.by - g.ay) / len;
    // Each piece overshoots its ends a little so the kinks between pieces stay closed.
    const corners = [
      [g.ax - ux * g.w0 * 0.4, g.ay - uy * g.w0 * 0.4, g.w0, g.d0],
      [g.bx + ux * g.w1 * 0.4, g.by + uy * g.w1 * 0.4, g.w1, g.d1],
    ];
    corners.forEach(([cx, cy, w, d], end) => {
      for (const sgn of [-1, 1]) {
        const v = i * 4 + end * 2 + (sgn < 0 ? 0 : 1);
        pos[v * 3] = cx - uy * sgn * w * 0.5;
        pos[v * 3 + 1] = cy + ux * sgn * w * 0.5;
        dist[v] = d;
        side[v] = sgn;
      }
    });
    index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aDist', new THREE.BufferAttribute(dist, 1));
  geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(segs.length * 4), 1));
  geo.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(segs.length * 4), 1));
  geo.setAttribute('aCorner', new THREE.BufferAttribute(new Float32Array(segs.length * 8), 2));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  return geo;
}

/**
 * Rasterise the cracks onto a square grid: one dot per cell touched, lit when the crack reaches it.
 * `aSide` is 0 (no soft edge), `aSeed` is a per-dot random, `aCorner` is the position within the dot
 * and `aKind` is 0 for the crack itself, 1 for debris sparks and 2 for infection spreading off it.
 */
function pixelGeometry(segs: Seg[], s: FractureStyle) {
  const { pixel, debris } = s;
  const cells = new Map<string, { cx: number; cy: number; d: number; kind: number }>();
  const stamp = (cx: number, cy: number, d: number, kind: number) => {
    const key = cx + ',' + cy;
    const old = cells.get(key);
    if (!old) cells.set(key, { cx, cy, d, kind });
    else if (kind === 0 && (old.kind !== 0 || d < old.d)) { old.d = d; old.kind = 0; }
    else if (kind === 2 && old.kind === 2 && d < old.d) old.d = d;
  };
  for (const g of segs) {
    const len = Math.hypot(g.bx - g.ax, g.by - g.ay);
    const n = Math.max(1, Math.ceil(len / (pixel * 0.5)));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const thick = Math.max(1, Math.round((g.w0 + (g.w1 - g.w0) * t) / pixel));
      const d = g.d0 + (g.d1 - g.d0) * t;
      const cx = Math.floor((g.ax + (g.bx - g.ax) * t) / pixel - (thick - 1) / 2);
      const cy = Math.floor((g.ay + (g.by - g.ay) * t) / pixel - (thick - 1) / 2);
      for (let ox = 0; ox < thick; ox++) for (let oy = 0; oy < thick; oy++) stamp(cx + ox, cy + oy, d, 0);
      if (Math.random() < debris * 0.12) {
        stamp(cx + Math.round(rand(-5, 5)), cy + Math.round(rand(-5, 5)), d + rand(0, 120), 1);
      }
      // A patch of infection: dense by the crack, thinning out, and creeping outward well after the crack has passed.
      if (Math.random() < s.spread * 0.06) {
        const radius = rand(2, 4 + s.spread * 9);
        for (let ox = -Math.ceil(radius); ox <= radius; ox++) for (let oy = -Math.ceil(radius); oy <= radius; oy++) {
          const r = Math.hypot(ox, oy);
          if (r > radius || Math.random() > Math.pow(1 - r / radius, 1.3) * 0.8) continue;
          stamp(cx + ox, cy + oy, d + r * s.speed * rand(0.012, 0.025), 2);
        }
      }
    }
  }
  const count = cells.size;
  const pos = new Float32Array(count * 12);
  const dist = new Float32Array(count * 4), side = new Float32Array(count * 4);
  const seed = new Float32Array(count * 4), kind = new Float32Array(count * 4);
  const index = new Uint32Array(count * 6);
  const corner = new Float32Array(count * 8);
  // A sliver of gap between dots keeps them reading as separate pixels.
  const gap = Math.max(0.4, pixel * 0.07);
  let i = 0, far = 0;
  for (const c of cells.values()) {
    const x0 = c.cx * pixel + gap, x1 = (c.cx + 1) * pixel - gap, y0 = c.cy * pixel + gap, y1 = (c.cy + 1) * pixel - gap;
    pos.set([x0, y0, 0, x1, y0, 0, x0, y1, 0, x1, y1, 0], i * 12);
    corner.set([-1, -1, 1, -1, -1, 1, 1, 1], i * 8);
    far = Math.max(far, c.d);
    const r = Math.random();
    for (let v = i * 4; v < i * 4 + 4; v++) { dist[v] = c.d; seed[v] = r; kind[v] = c.kind; }
    index.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3], i * 6);
    i++;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aDist', new THREE.BufferAttribute(dist, 1));
  geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  geo.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  geo.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  return { geo, far };
}

const CRACK_VERT = /* glsl */ `
  attribute float aDist, aSide, aSeed, aKind;
  attribute vec2 aCorner;
  varying float vDist, vSide, vSeed, vKind;
  varying vec2 vCorner;
  void main() {
    vDist = aDist; vSide = aSide; vSeed = aSeed; vKind = aKind; vCorner = aCorner;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CRACK_FRAG = /* glsl */ `
  uniform float uTime, uSpeed, uHeat, uGrow, uHold, uFade, uFlicker, uPixel, uRound;
  uniform vec3 uColor;
  varying float vDist, vSide, vSeed, vKind;
  varying vec2 vCorner;
  float hash(float n) { return fract(sin(n * 91.345) * 47453.5453); }
  void main() {
    float age = uTime - vDist / uSpeed;
    if (age < 0.0) discard;
    float hot = exp(-age / max(uHeat, 0.001));
    float edge = 1.0 - smoothstep(0.3, 1.0, abs(vSide));
    float dying = smoothstep(0.0, uFade, uTime - uGrow - uHold);
    // Stretches of crack stutter, more as the pattern dies.
    float stutter = step(0.55, hash(floor(uTime * 26.0) + floor(vDist / 70.0) * 7.0));
    float flick = 1.0 - uFlicker * stutter * (0.35 + 0.65 * dying);
    float alpha = edge * (1.0 - dying);
    if (uPixel > 0.0) {
      // Dots have hard edges, cool in steps and die by dropping out one by one rather than dimming.
      if (length(vCorner) > mix(1.5, 1.0, uRound)) discard;
      hot = floor(hot * 3.0 + 0.5) / 3.0;
      if (vSeed < dying) discard;
      alpha = 1.0;
      if (vKind > 1.5) {
        // Infection: dimmer, never hot, and it crawls: dots blink at their own pace.
        hot = 0.0;
        alpha = 0.4 + 0.5 * step(0.4, hash(floor(uTime * 9.0 + vSeed * 40.0) + vSeed * 100.0));
      } else if (vKind > 0.5) {
        if (age > 0.1 + vSeed * 0.45) discard;
        alpha = step(0.35, hash(floor(uTime * 30.0) + vSeed * 100.0));
      }
    }
    // The leading edge runs brighter and pinker, but never white: white-hot reads as an electric pulse.
    vec3 c = mix(uColor, vec3(1.0, 0.5, 0.45), hot * 0.6) * (1.0 + hot * 0.9);
    gl_FragColor = vec4(c * flick, alpha);
  }
`;

const FLASH_FRAG = /* glsl */ `
  uniform float uTime, uStrength, uCells;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    // In pixel mode the glow is a mosaic of flat blocks in a few brightness steps.
    vec2 uv = uCells > 0.0 ? (floor(vUv * uCells) + 0.5) / uCells : vUv;
    float r = length(uv - 0.5) * 2.0;
    float glow = pow(max(0.0, 1.0 - r), 2.2);
    if (uCells > 0.0) glow = floor(glow * 6.0) / 6.0;
    gl_FragColor = vec4(mix(uColor, vec3(1.0), glow * 0.5), glow * uStrength * exp(-uTime / 0.16));
  }
`;

/** Halftone dots that slam in from the screen edges and recede: the "you are hurt" frame. */
const VIGNETTE_FRAG = /* glsl */ `
  uniform float uTime, uStrength, uDepth, uCell, uHold, uFade, uRound;
  uniform vec4 uBounds;
  uniform vec3 uColor;
  varying vec2 vWorld;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    vec2 cell = floor(vWorld / uCell);
    vec2 c = (cell + 0.5) * uCell;
    vec2 f = fract(vWorld / uCell) * 2.0 - 1.0;
    float edge = min(min(c.x - uBounds.x, uBounds.z - c.x), min(c.y - uBounds.y, uBounds.w - c.y));
    // Hits hard at once, throbs while it holds, then pulls back to the edges.
    float life = smoothstep(0.0, 0.05, uTime) * (1.0 - smoothstep(uHold, uHold + uFade, uTime));
    float throb = 1.0 + 0.12 * sin(uTime * 14.0);
    float ragged = 0.3 + 0.75 * noise(cell * 0.07) + 0.2 * noise(cell * 0.31 + uTime * 1.5);
    float v = clamp(1.0 - edge / (uDepth * ragged * life * throb + 0.001), 0.0, 1.0);
    v = v * v * v * (0.75 + 0.25 * hash(cell + floor(uTime * 12.0)));
    // Halftone: the stronger the haze, the fatter the dot.
    float radius = sqrt(v) * 1.15;
    if (length(f) > radius * mix(1.5, 1.0, uRound) || v < 0.02) discard;
    gl_FragColor = vec4(uColor * (0.6 + v), uStrength * life * (0.35 + 0.65 * v));
  }
`;

const VIGNETTE_VERT = /* glsl */ `
  varying vec2 vWorld;
  void main() { vWorld = (modelMatrix * vec4(position, 1.0)).xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const FLASH_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

interface Burst { group: THREE.Group; mats: THREE.ShaderMaterial[]; age: number; life: number }

/**
 * Glowing cracks that race out from an impact point, hang, then fade.
 * Add `root` to a scene, call `hit` when damage lands and `update` every frame.
 */
export class Fractures {
  root = new THREE.Group();
  style: FractureStyle = { ...DEFAULT_FRACTURE };
  private bursts: Burst[] = [];
  private above = false;
  private lastOffset = { x: 0, y: 0 };

  constructor() {
    this.setLayer(false);
  }

  /** Draw beneath the cards and panels (just above the background), or on top of everything. */
  setLayer(above: boolean) {
    this.above = above;
    this.root.position.z = above ? 900 : -400;
    for (const b of this.bursts) this.order(b.group);
  }

  private order(group: THREE.Group) {
    // The edge haze is a screen overlay: it always sits on top, whatever layer the cracks are on.
    group.children.forEach((m, i) => { m.renderOrder = (this.above || m.userData.overlay ? 5000 : -900) + i; });
  }

  get active() {
    return this.bursts.length;
  }

  /**
   * Crack the screen around (x, y). More damage means thicker and more numerous cracks.
   * The impact lands up to `scatter` away, and never close to where the previous one landed.
   */
  hit(x: number, y: number, damage: number, bounds: Bounds, scatter = this.style.scatter) {
    const s = this.style;
    if (scatter > 0) {
      let off = { x: 0, y: 0 };
      for (let tries = 0; tries < 8; tries++) {
        const a = rand(0, Math.PI * 2), r = scatter * Math.sqrt(rand(0.15, 1));
        off = { x: Math.cos(a) * r, y: Math.sin(a) * r };
        if (Math.hypot(off.x - this.lastOffset.x, off.y - this.lastOffset.y) > scatter * 0.6) break;
      }
      this.lastOffset = off;
      x += off.x;
      y += off.y;
    }
    const { segs, far: lineFar, reach } = shatter(x, y, damage, s, bounds);
    const color = new THREE.Color(s.color);
    const dots = s.pixel > 0 ? pixelGeometry(segs, s) : null;
    const grow = (dots ? dots.far : lineFar) / s.speed;
    // Crack pieces wind either way depending on their direction, so nothing may be culled.
    const base = { transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide };
    const cracks = new THREE.ShaderMaterial({
      ...base, vertexShader: CRACK_VERT, fragmentShader: CRACK_FRAG,
      uniforms: {
        uTime: { value: 0 }, uSpeed: { value: s.speed }, uHeat: { value: s.heat }, uGrow: { value: grow },
        uHold: { value: s.hold }, uFade: { value: Math.max(s.fade, 0.01) }, uFlicker: { value: s.flicker }, uColor: { value: color },
        uPixel: { value: s.pixel }, uRound: { value: s.round },
      },
    });
    const flash = new THREE.ShaderMaterial({
      ...base, vertexShader: FLASH_VERT, fragmentShader: FLASH_FRAG,
      uniforms: { uTime: { value: 0 }, uStrength: { value: s.flash }, uColor: { value: color }, uCells: { value: 0 } },
    });
    // The glow covers a whole number of blocks and sits on the same grid as the cracks.
    const blocks = s.pixel > 0 ? Math.max(2, Math.round((reach * 1.6) / s.pixel / 2) * 2) : 0;
    const size = blocks ? blocks * s.pixel : reach * 1.6;
    flash.uniforms.uCells.value = blocks;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(size, size), flash);
    if (blocks) glow.position.set(Math.round(x / s.pixel) * s.pixel, Math.round(y / s.pixel) * s.pixel, 0);
    else glow.position.set(x, y, 0);
    const lines = new THREE.Mesh(dots ? dots.geo : crackGeometry(segs), cracks);
    lines.frustumCulled = false;

    const hurt = Math.max(0, Math.min(damage, 12) - 1) * s.scaling;
    const w = bounds.right - bounds.left, h = bounds.top - bounds.bottom;
    const vignette = new THREE.ShaderMaterial({
      ...base, vertexShader: VIGNETTE_VERT, fragmentShader: VIGNETTE_FRAG,
      uniforms: {
        uTime: { value: 0 }, uStrength: { value: s.vignette }, uColor: { value: color }, uRound: { value: s.round },
        uDepth: { value: Math.min(h * 0.45, 150 * (1 + hurt * 0.6)) }, uCell: { value: s.pixel > 0 ? s.pixel : 5 },
        uHold: { value: grow + s.hold }, uFade: { value: Math.max(s.fade, 0.01) },
        uBounds: { value: new THREE.Vector4(bounds.left, bounds.bottom, bounds.right, bounds.top) },
      },
    });
    const haze = new THREE.Mesh(new THREE.PlaneGeometry(w, h), vignette);
    haze.position.set((bounds.left + bounds.right) / 2, (bounds.bottom + bounds.top) / 2, 0);
    haze.userData.overlay = true;
    haze.visible = s.vignette > 0;

    const group = new THREE.Group();
    group.add(glow, lines, haze);
    this.order(group);
    this.root.add(group);
    this.bursts.push({ group, mats: [cracks, flash, vignette], age: 0, life: grow + s.hold + s.fade });
  }

  update(dt: number) {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.age += dt;
      for (const m of b.mats) m.uniforms.uTime.value = b.age;
      if (b.age > b.life) {
        this.free(b);
        this.bursts.splice(i, 1);
      }
    }
  }

  clear() {
    for (const b of this.bursts) this.free(b);
    this.bursts = [];
  }

  private free(b: Burst) {
    this.root.remove(b.group);
    for (const m of b.group.children) (m as THREE.Mesh).geometry.dispose();
    for (const m of b.mats) m.dispose();
  }
}
