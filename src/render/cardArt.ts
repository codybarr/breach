import * as THREE from 'three';
import { CARDS, cardColor, typeLine, type CardDef } from '../engine/cards';
import { COLOR, FONT, TITLE_FONT, hexA, wrap } from './ui';

export const CARD_W = 150;
export const CARD_H = 210;
const TW = 300, TH = 420; // canvas design units (2x card world size)
const RES = 1.6;

const cache = new Map<string, THREE.CanvasTexture>();

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hashStr(s: string) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

function makeCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = TW * RES;
  c.height = TH * RES;
  const ctx = c.getContext('2d')!;
  ctx.scale(RES, RES);
  return [c, ctx];
}

function toTex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Clipped-corner "chip" shape used for the card outline. */
function chipPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cut: number) {
  ctx.beginPath();
  ctx.moveTo(x + cut, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - cut);
  ctx.lineTo(x + w - cut, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + cut);
  ctx.closePath();
}

function hexNoise(ctx: CanvasRenderingContext2D, rnd: () => number, x: number, y: number, w: number, h: number, color: string, alpha: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.font = `10px ${FONT}`;
  ctx.fillStyle = hexA(color, alpha);
  ctx.textBaseline = 'top';
  for (let yy = y + 2; yy < y + h; yy += 11) {
    let line = '';
    for (let i = 0; i < 12; i++) line += Math.floor(rnd() * 256).toString(16).padStart(2, '0') + ' ';
    ctx.fillText(line, x + 3 - rnd() * 8, yy);
  }
  ctx.restore();
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, family: string) {
  let s = size;
  do {
    ctx.font = `${s}px ${family}`;
    if (ctx.measureText(text).width <= maxW) break;
    s -= 1;
  } while (s > 10);
  return s;
}

function drawFace(d: CardDef): HTMLCanvasElement {
  const [cv, ctx] = makeCanvas();
  const col = cardColor(d);
  const rnd = seeded(hashStr(d.id));

  // Body.
  chipPath(ctx, 6, 6, TW - 12, TH - 12, 22);
  const grad = ctx.createLinearGradient(0, 0, 0, TH);
  grad.addColorStop(0, '#04110c');
  grad.addColorStop(1, '#010604');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.save();
  ctx.clip();
  hexNoise(ctx, rnd, 6, 6, TW, TH, col, 0.05);
  ctx.restore();

  ctx.save();
  chipPath(ctx, 6, 6, TW - 12, TH - 12, 22);
  ctx.strokeStyle = col;
  ctx.lineWidth = 3;
  ctx.shadowColor = col;
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.restore();
  chipPath(ctx, 13, 13, TW - 26, TH - 26, 17);
  ctx.strokeStyle = hexA(col, 0.25);
  ctx.lineWidth = 1;
  ctx.stroke();

  // Cost chip.
  ctx.save();
  ctx.fillStyle = hexA(COLOR.amber, 0.12);
  ctx.strokeStyle = COLOR.amber;
  ctx.shadowColor = COLOR.amber;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 2;
  roundRect(ctx, 20, 20, 44, 40, 4);
  ctx.fill();
  ctx.stroke();
  ctx.font = `34px ${TITLE_FONT}`;
  ctx.fillStyle = COLOR.amber;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(d.cost), 42, 42);
  ctx.restore();

  // Name.
  ctx.save();
  const name = d.name.toUpperCase();
  const fs = fitFont(ctx, name, TW - 100, 30, TITLE_FONT);
  ctx.font = `${fs}px ${TITLE_FONT}`;
  ctx.fillStyle = COLOR.white;
  ctx.shadowColor = col;
  ctx.shadowBlur = 10;
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 74, 41);
  ctx.restore();

  // Art window.
  const ax = 22, ay = 70, aw = TW - 44, ah = 132;
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(ax, ay, aw, ah);
  hexNoise(ctx, rnd, ax, ay, aw, ah, col, 0.12);
  // scanline overlay
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = ay; y < ay + ah; y += 3) ctx.fillRect(ax, y, aw, 1);
  ctx.strokeStyle = hexA(col, 0.6);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(ax + 0.5, ay + 0.5, aw - 1, ah - 1);
  const maxLen = Math.max(...d.art.map((l) => l.length));
  const artSize = Math.min(30, (aw - 24) / (maxLen * 0.6), (ah - 20) / (d.art.length * 1.1));
  ctx.font = `${artSize}px ${FONT}`;
  ctx.fillStyle = col;
  ctx.shadowColor = col;
  ctx.shadowBlur = 12;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lh = artSize * 1.1;
  d.art.forEach((ln, i) => {
    ctx.fillText(ln, ax + aw / 2, ay + ah / 2 + (i - (d.art.length - 1) / 2) * lh);
  });
  ctx.restore();

  // Type line.
  ctx.save();
  const tl = typeLine(d);
  ctx.font = `13px ${FONT}`;
  ctx.fillStyle = col;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = col;
  ctx.shadowBlur = 4;
  ctx.fillText(tl, TW / 2, 220);
  const tw = ctx.measureText(tl).width;
  ctx.fillRect(28, 220, TW / 2 - tw / 2 - 38, 1);
  ctx.fillRect(TW / 2 + tw / 2 + 10, 220, TW / 2 - tw / 2 - 38, 1);
  ctx.restore();

  // Rules text.
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (d.kind === 'data' || d.kind === 'malware' || d.kind === 'currency') {
    const big = d.kind === 'currency' ? `+${d.credits}` : `${d.vp}`;
    const unit = d.kind === 'currency' ? 'CR' : 'VP';
    ctx.textAlign = 'left';
    ctx.font = `34px ${TITLE_FONT}`;
    const uw = ctx.measureText(unit).width;
    ctx.font = `96px ${TITLE_FONT}`;
    const bw = ctx.measureText(big).width;
    const x0 = TW / 2 - (bw + uw + 8) / 2;
    ctx.fillStyle = col;
    ctx.shadowColor = col;
    ctx.shadowBlur = 18;
    ctx.fillText(big, x0, 282);
    ctx.font = `34px ${TITLE_FONT}`;
    ctx.fillText(unit, x0 + bw + 8, 300);
    ctx.textAlign = 'center';
    const extra = d.text.split('\n').slice(1).join(' ');
    if (extra) {
      ctx.font = `14px ${FONT}`;
      ctx.fillStyle = COLOR.white;
      ctx.shadowBlur = 0;
      wrap(ctx, extra, TW - 60).forEach((ln, i) => ctx.fillText(ln, TW / 2, 336 + i * 17));
    }
  } else {
    const lines = d.text.split('\n');
    const size = lines.length > 4 ? 17 : 19;
    ctx.font = `${size}px ${FONT}`;
    const lh = size * 1.22;
    const y0 = 292 - ((lines.length - 1) * lh) / 2;
    lines.forEach((ln, i) => {
      const isPlus = ln.startsWith('+');
      const isKw = /^(Exploit|Daemon)/.test(ln);
      ctx.fillStyle = isPlus ? COLOR.white : COLOR.white;
      ctx.shadowColor = col;
      ctx.shadowBlur = isPlus ? 8 : 2;
      if (isKw) {
        const [kw, ...rest] = ln.split(':');
        const full = `${kw}:${rest.join(':')}`;
        const fw = ctx.measureText(full).width;
        const kwW = ctx.measureText(kw + ':').width;
        ctx.textAlign = 'left';
        ctx.fillStyle = col;
        ctx.fillText(kw + ':', TW / 2 - fw / 2, y0 + i * lh);
        ctx.fillStyle = COLOR.white;
        ctx.fillText(rest.join(':'), TW / 2 - fw / 2 + kwW, y0 + i * lh);
        ctx.textAlign = 'center';
      } else {
        ctx.fillText(ln, TW / 2, y0 + i * lh);
      }
    });
  }
  ctx.restore();

  // Flavor + serial.
  if (d.flavor) {
    ctx.save();
    ctx.font = `italic 12px ${FONT}`;
    ctx.fillStyle = hexA(col, 0.55);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fl = d.flavor.split('\n').join(' // ');
    ctx.fillText(`"${fl}"`, TW / 2, 376);
    ctx.restore();
  }
  ctx.save();
  ctx.font = `10px ${FONT}`;
  ctx.fillStyle = hexA(col, 0.4);
  ctx.textAlign = 'right';
  ctx.fillText(`0x${hashStr(d.id).toString(16).slice(0, 6).toUpperCase()}`, TW - 34, 398);
  ctx.textAlign = 'left';
  ctx.fillText('BREACH.EXE', 30, 398);
  ctx.restore();
  return cv;
}

function drawBack(): HTMLCanvasElement {
  const [cv, ctx] = makeCanvas();
  const rnd = seeded(1337);
  const col = COLOR.green;
  chipPath(ctx, 6, 6, TW - 12, TH - 12, 22);
  ctx.fillStyle = '#020a06';
  ctx.fill();
  ctx.save();
  ctx.clip();
  // Circuit traces.
  ctx.strokeStyle = hexA(col, 0.25);
  ctx.lineWidth = 2;
  for (let i = 0; i < 28; i++) {
    let x = Math.round(rnd() * 14) * 20 + 10, y = Math.round(rnd() * 20) * 20 + 10;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      if (rnd() < 0.5) x += (rnd() < 0.5 ? -1 : 1) * 40; else y += (rnd() < 0.5 ? -1 : 1) * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = hexA(col, 0.5);
    ctx.fillRect(x - 3, y - 3, 6, 6);
  }
  ctx.restore();
  ctx.save();
  chipPath(ctx, 6, 6, TW - 12, TH - 12, 22);
  ctx.strokeStyle = col;
  ctx.lineWidth = 3;
  ctx.shadowColor = col;
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.restore();
  // Center emblem.
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.strokeStyle = col;
  ctx.lineWidth = 2;
  ctx.shadowColor = col;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    ctx.lineTo(TW / 2 + Math.cos(a) * 80, TH / 2 + Math.sin(a) * 80);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.font = `64px ${TITLE_FONT}`;
  ctx.fillStyle = col;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('>_', TW / 2, TH / 2 - 4);
  ctx.font = `22px ${TITLE_FONT}`;
  ctx.fillText('BREACH.EXE', TW / 2, TH / 2 + 110);
  ctx.restore();
  return cv;
}

export function faceTexture(id: string): THREE.CanvasTexture {
  let t = cache.get(id);
  if (!t) {
    t = toTex(drawFace(CARDS[id]));
    cache.set(id, t);
  }
  return t;
}

export function backTexture(): THREE.CanvasTexture {
  let t = cache.get('__back');
  if (!t) {
    t = toTex(drawBack());
    cache.set('__back', t);
  }
  return t;
}

/** Soft white glow silhouette, tinted per use via material color. */
export function glowTexture(): THREE.CanvasTexture {
  let t = cache.get('__glow');
  if (!t) {
    const c = document.createElement('canvas');
    c.width = 200;
    c.height = 260;
    const ctx = c.getContext('2d')!;
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 22;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 8;
    chipPath(ctx, 26, 26, 148, 208, 14);
    ctx.stroke();
    ctx.stroke();
    t = new THREE.CanvasTexture(c);
    cache.set('__glow', t);
  }
  return t;
}

/** Pre-render every texture so the first frame of a game doesn't hitch. */
export function warmCardTextures() {
  for (const id of Object.keys(CARDS)) faceTexture(id);
  backTexture();
  glowTexture();
}
