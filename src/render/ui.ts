import * as THREE from 'three';
import { sfx } from '../audio/sfx';

export const FONT = '"Share Tech Mono", ui-monospace, Menlo, monospace';
export const TITLE_FONT = '"VT323", ui-monospace, monospace';

export const COLOR = {
  green: '#33ff88',
  cyan: '#33e0ff',
  amber: '#ffc933',
  red: '#ff3366',
  orange: '#ff6a2a',
  blue: '#5a8cff',
  dim: '#1f5a3d',
  mid: '#3fa070',
  white: '#e8fff2',
  bg: '#020806',
};

/** A plane in world space whose texture is drawn with Canvas2D. Size is in virtual px. */
export class CanvasPlane {
  mesh: THREE.Mesh;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  mat: THREE.MeshBasicMaterial;

  constructor(public w: number, public h: number, private res = 2) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.ceil(w * res);
    this.canvas.height = Math.ceil(h * res);
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, depthTest: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat);
  }

  redraw(fn: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.res, 0, 0, this.res, 0, 0);
    ctx.save();
    fn(ctx, this.w, this.h);
    ctx.restore();
    this.tex.needsUpdate = true;
  }

  at(x: number, y: number, z = 0) {
    this.mesh.position.set(x, y, z);
    this.mesh.renderOrder = z;
    return this;
  }

  dispose() {
    this.tex.dispose();
    this.mat.dispose();
    this.mesh.geometry.dispose();
  }
}

export interface TextStyle {
  size?: number;
  color?: string;
  align?: CanvasTextAlign;
  font?: string;
  glow?: number;
  lineHeight?: number;
}

export class Label extends CanvasPlane {
  private key = '';
  constructor(w: number, h: number, text = '', public style: TextStyle = {}) {
    super(w, h);
    this.set(text);
  }

  set(text: string, style: TextStyle = {}) {
    const s = { ...this.style, ...style };
    const key = text + JSON.stringify(s);
    if (key === this.key) return;
    this.key = key;
    this.redraw((ctx, w, h) => {
      const size = s.size ?? 18;
      ctx.font = `${size}px ${s.font ?? FONT}`;
      ctx.fillStyle = s.color ?? COLOR.green;
      ctx.textAlign = s.align ?? 'left';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = s.color ?? COLOR.green;
      ctx.shadowBlur = s.glow ?? 6;
      const lines = text.split('\n');
      const lh = size * (s.lineHeight ?? 1.2);
      const x = ctx.textAlign === 'center' ? w / 2 : ctx.textAlign === 'right' ? w - 2 : 2;
      const y0 = h / 2 - ((lines.length - 1) * lh) / 2;
      lines.forEach((ln, i) => ctx.fillText(ln, x, y0 + i * lh));
    });
  }
}

/** Neon frame with corner brackets. */
export function drawFrame(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  color: string, opts: { fill?: string; title?: string; glow?: number; lw?: number } = {},
) {
  ctx.save();
  if (opts.fill) {
    ctx.fillStyle = opts.fill;
    ctx.fillRect(x, y, w, h);
  }
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = opts.glow ?? 8;
  ctx.lineWidth = opts.lw ?? 1.5;
  ctx.globalAlpha = 0.55;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.globalAlpha = 1;
  ctx.lineWidth = (opts.lw ?? 1.5) + 1.5;
  const b = Math.min(14, w / 4, h / 4);
  ctx.beginPath();
  for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
    ctx.moveTo(cx + dx * b, cy + dy * 1);
    ctx.lineTo(cx + dx * 1, cy + dy * 1);
    ctx.lineTo(cx + dx * 1, cy + dy * b);
  }
  ctx.stroke();
  if (opts.title) {
    ctx.font = `13px ${FONT}`;
    ctx.textBaseline = 'middle';
    const tw = ctx.measureText(opts.title).width;
    ctx.fillStyle = COLOR.bg;
    ctx.shadowBlur = 0;
    ctx.fillRect(x + 18, y - 8, tw + 12, 16);
    ctx.fillStyle = color;
    ctx.shadowBlur = 6;
    ctx.fillText(opts.title, x + 24, y);
  }
  ctx.restore();
}

export class Panel extends CanvasPlane {
  constructor(w: number, h: number, color: string, title?: string) {
    super(w, h);
    this.redraw((ctx) => drawFrame(ctx, 8, 10, w - 16, h - 18, color, { fill: 'rgba(2,10,7,0.78)', title }));
  }
}

export interface ButtonOpts {
  label: string;
  color?: string;
  enabled?: boolean;
  hotkey?: string;
}

export class Button extends CanvasPlane {
  hovered = false;
  opts: ButtonOpts = { label: '', enabled: true };
  private key = '';
  onClick: () => void = () => {};

  constructor(w: number, h: number, opts: ButtonOpts) {
    super(w, h);
    this.mesh.userData.onClick = () => {
      if (this.opts.enabled === false) return;
      sfx.click();
      this.onClick();
    };
    this.mesh.userData.onHover = (on: boolean) => {
      this.hovered = on;
      if (on && this.opts.enabled !== false) sfx.hover();
      this.draw();
    };
    this.set(opts);
  }

  set(opts: Partial<ButtonOpts>) {
    this.opts = { ...this.opts, ...opts };
    this.draw();
  }

  private draw() {
    const o = this.opts;
    const enabled = o.enabled !== false;
    const key = JSON.stringify(o) + this.hovered;
    if (key === this.key) return;
    this.key = key;
    const color = enabled ? o.color ?? COLOR.green : COLOR.dim;
    const hot = this.hovered && enabled;
    this.redraw((ctx, w, h) => {
      drawFrame(ctx, 4, 4, w - 8, h - 8, color, {
        fill: hot ? hexA(color, 0.28) : 'rgba(2,12,8,0.85)', glow: hot ? 16 : 6,
      });
      ctx.font = `${Math.min(20, h * 0.42)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = hot ? COLOR.white : color;
      ctx.shadowColor = color;
      ctx.shadowBlur = hot ? 14 : 6;
      ctx.fillText(o.label, w / 2, h / 2 + 1);
      if (o.hotkey) {
        ctx.font = `11px ${FONT}`;
        ctx.textAlign = 'right';
        ctx.globalAlpha = 0.6;
        ctx.fillText(o.hotkey, w - 12, h - 13);
      }
    });
  }
}

export function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Word-wrap text to a pixel width with the context's current font. */
export function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const t = line ? `${line} ${word}` : word;
      if (ctx.measureText(t).width > maxW && line) {
        out.push(line);
        line = word;
      } else line = t;
    }
    out.push(line);
  }
  return out;
}
