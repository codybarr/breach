import type { PixelSprite } from '../engine/cards';
import { COLOR } from './ui';

/**
 * Flat pixel-art card illustrations. A sprite is a grid of shade characters,
 * drawn as chunky square pixels on a faint "unlit LED" grid that fills the art
 * window. Card-colored shades are derived from the card color so a sprite works
 * on any card; a few fixed accents cover screens, metal and glow.
 *
 *   o outline   d dark   m mid   l light   h highlight
 *   n hole (near black)  k cast shadow
 *   c cyan glow   g / G dark / light grey   w white   . empty
 */

const mix = (a: string, b: string, t: number) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};

function palette(col: string): Record<string, string> {
  return {
    o: mix(col, '#000000', 0.68),
    d: mix(col, '#000000', 0.55),
    m: mix(col, '#000000', 0.3),
    l: col,
    h: mix(col, '#ffffff', 0.5),
    n: mix(col, '#000000', 0.93),
    k: mix(col, '#000000', 0.86),
    c: COLOR.cyan,
    g: '#30383e',
    G: '#5d676f',
    w: COLOR.white,
  };
}

/** Shades drawn with a soft glow. */
const GLOWS = new Set(['h', 'c']);

/** Darken one step, for the side turned away from the light. */
const SHADE_DOWN: Record<string, string> = { h: 'l', l: 'm', m: 'd', d: 'o' };

/** 3x5 glyphs for in-art text, drawn with `fx.glyphs`. */
const FONT: Record<string, string[]> = {
  '^': ['.#.', '#.#', '...', '...', '...'],
  C: ['###', '#..', '#..', '#..', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
};

/** Drawing helpers handed to a sprite's decoration pass (grid coordinates). */
interface Fx {
  /** Grid size, and the sprite's size and top-left cell. */
  gw: number; gh: number; sw: number; sh: number; nx: number; ny: number;
  rnd: () => number;
  /** Light one cell (skipped if it's on the sprite or off-grid). */
  lit(gx: number, gy: number, color: string, alpha: number): void;
  /** Draw a string in the 3x5 font with its top-left at (gx, gy). */
  glyphs(text: string, gx: number, gy: number, color: string, alpha: number): void;
}

interface SpriteDef {
  rows: string[];
  /** Author symmetric, then shade the right half down a step (lit from the left). */
  shadeRight?: boolean;
  /** Extra pixels drawn around the sprite (particles, text). */
  decorate?: (fx: Fx) => void;
}

function drawSprite(ctx: CanvasRenderingContext2D, rnd: () => number, ax: number, ay: number, aw: number, ah: number, col: string, def: SpriteDef) {
  const rows = def.shadeRight
    ? def.rows.map((r) => [...r].map((ch, i) => (i > (r.length - 1) / 2 ? SHADE_DOWN[ch] ?? ch : ch)).join(''))
    : def.rows;
  const sw = rows[0].length, sh = rows.length;
  const px = Math.floor((ah - 12) / sh);
  const gw = Math.floor(aw / px), gh = Math.floor(ah / px);
  const ox = ax + (aw - gw * px) / 2, oy = ay + (ah - gh * px) / 2;
  const nx = Math.floor((gw - sw) / 2), ny = Math.floor((gh - sh) / 2);
  const pal = palette(col);

  const cell = (gx: number, gy: number, fill: string, glow = 0) => {
    ctx.shadowBlur = glow;
    ctx.shadowColor = fill;
    ctx.fillStyle = fill;
    ctx.fillRect(ox + gx * px + 0.5, oy + gy * px + 0.5, px - 1, px - 1);
  };

  ctx.save();
  ctx.beginPath();
  ctx.rect(ax, ay, aw, ah);
  ctx.clip();

  // Unlit LED grid.
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) cell(gx, gy, mix(col, '#000000', 0.94));

  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch !== '.') cell(nx + x, ny + y, pal[ch], GLOWS.has(ch) ? 6 : 0);
  }));

  if (def.decorate) {
    const onSprite = (gx: number, gy: number) => (rows[gy - ny]?.[gx - nx] ?? '.') !== '.';
    const lit = (gx: number, gy: number, color: string, alpha: number) => {
      if (onSprite(gx, gy) || gx < 0 || gx >= gw || gy < 0 || gy >= gh) return;
      ctx.globalAlpha = alpha;
      cell(gx, gy, color, 6);
    };
    const glyphs = (text: string, gx: number, gy: number, color: string, alpha: number) => {
      [...text].forEach((chr, i) => FONT[chr]?.forEach((line, y) => [...line].forEach((b, x) => {
        if (b === '#') lit(gx + i * 4 + x, gy + y, color, alpha);
      })));
    };
    def.decorate({ gw, gh, sw, sh, nx, ny, rnd, lit, glyphs });
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/**
 * Packet Sniffer: a front-on nose inhaling two streams of cyan data pixels.
 * Nostrils are enclosed holes at rows 16-18.
 */
const NOSE: SpriteDef = {
  shadeRight: true,
  rows: [
    '..........ooooo..........',
    '..........omlmo..........',
    '..........omlmo..........',
    '..........omhmo..........',
    '..........omhmo..........',
    '.........omlhlmo.........',
    '.........omlhlmo.........',
    '.........omlhlmo.........',
    '........omllhllmo........',
    '........omllhllmo........',
    '.......omllhhhllmo.......',
    '......omllhhhhhllmo......',
    '...ooomlllhhhhhlllmooo...',
    '..omlmdmllhhhhhllmdmlmo..',
    '.omllmdmlllhhhlllmdmllmo.',
    '.omllmdmmlllllllmmdmllmo.',
    '.ommmdnnndmmmmmdnnndmmmo.',
    '..ommnnnnndmmmdnnnnnmmo..',
    '...ommdnnnmmmmmnnndmmo...',
    '.....oodmmmmmmmmmdoo.....',
    '.......ooooooooooo.......',
    '........kkkkkkkkk........',
  ],
  // Data streams run in along the bottom from each edge and curl up toward the
  // nostrils, brightening as they near, with the odd 2x2 "packet".
  decorate({ gw, gh, sw, nx, ny, rnd, lit }) {
    for (const side of [-1, 1]) {
      const tx = nx + (side < 0 ? 7 : sw - 8), ty = ny + 20;
      const sx = side < 0 ? 0 : gw - 1, sy = gh - 1 - Math.floor(rnd() * 2);
      const steps = Math.abs(tx - sx);
      for (let i = 0; i <= steps; i += 2) {
        const t = i / steps;
        const gx = sx - side * i, gy = Math.round(sy + (ty - sy) * t ** 3);
        const a = 0.25 + 0.75 * t;
        lit(gx, gy, COLOR.cyan, a);
        if (i % 8 === 4 && t < 0.75) {
          lit(gx, gy - 1, COLOR.cyan, a); lit(gx - side, gy, COLOR.cyan, a); lit(gx - side, gy - 1, COLOR.cyan, a);
        }
      }
    }
  },
};

/**
 * Script Kiddie: a cat in a hoodie, ears poking up, face lost in shadow except
 * for slit-pupil eyes lit cyan by the screen and its whiskers, hunched behind a
 * stickered laptop. One ^C, many ^V.
 */
const KIDDIE: SpriteDef = {
  shadeRight: true,
  rows: [
    '.....o...............o.....',
    '.....oo.............oo.....',
    '.....omo...........omo.....',
    '.....omho..ooooo..ohmo.....',
    '.....omhmoommmmmoomhmo.....',
    '.....omllllnnnnnllllmo.....',
    '.....omlllnnnnnnnlllmo.....',
    '....omlllnnnnnnnnnlllmo....',
    '....omllnncnnnnncnnllmo....',
    '....omllncncnnncncnllmo....',
    '....omllnncnnnnncnnllmo....',
    '.wwwomllnnnnnhnnnnnllmowww.',
    '..wwomllnnnnnnnnnnnllmoww..',
    '....omlllnnnnnnnnnlllmo....',
    '...omllllmnnnnnnnmllllmo...',
    '..omlllllllmmmmmlllllllmo..',
    '.omlllGGGGGGGGGGGGGGGlllmo.',
    'omllllGgggggggggggggGllllmo',
    'omllllGggggwwwwwggggGllllmo',
    'omllllGggggwnwnwggggGllllmo',
    'omllllGggggwwwwwggggGllllmo',
    'omllllGggggwgwgwggggGllllmo',
    'ommmmmGgggggggggggggGmmmmmo',
    'oooGGGGGGGGGGGGGGGGGGGGGooo',
  ],


  // Copy once on the left; paste over and over on the right, fading as it climbs.
  decorate({ gw, sw, nx, ny, glyphs }) {
    const left = Math.max(1, Math.floor((nx - 7) / 2));
    const right = nx + sw + Math.max(1, Math.floor((gw - nx - sw - 7) / 2));
    glyphs('^C', left, ny + 8, COLOR.cyan, 0.95);
    for (let i = 0; i < 3; i++) glyphs('^V', right, ny + 14 - i * 6, COLOR.cyan, 0.95 - i * 0.3);
  },
};

type SpriteDrawer = (ctx: CanvasRenderingContext2D, rnd: () => number, ax: number, ay: number, aw: number, ah: number, col: string) => void;

const draw = (def: SpriteDef): SpriteDrawer => (ctx, rnd, ax, ay, aw, ah, col) => drawSprite(ctx, rnd, ax, ay, aw, ah, col, def);

/** Card art drawers keyed by `CardDef.sprite`; each fills the art window (ax, ay, aw, ah). */
export const PIXEL_SPRITES: Record<PixelSprite, SpriteDrawer> = {
  nose: draw(NOSE),
  kiddie: draw(KIDDIE),
};
