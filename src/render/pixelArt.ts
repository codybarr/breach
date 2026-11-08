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
 *   c cyan glow   g / G dark / light grey   w white   e / E light / dark leaf
 *   a / A amber / dark amber (honey, wood)   f flame orange   r / R red / dark red
 *   . empty
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
    e: COLOR.green,
    E: mix(COLOR.green, '#000000', 0.5),
    a: COLOR.amber,
    A: mix(COLOR.amber, '#000000', 0.45),
    f: '#ff6a2a',
    r: COLOR.red,
    R: mix(COLOR.red, '#000000', 0.45),
  };
}

/** Shades drawn with a soft glow. */
const GLOWS = new Set(['h', 'c', 'a', 'f', 'r']);

/** Darken one step, for the side turned away from the light. */
const SHADE_DOWN: Record<string, string> = { h: 'l', l: 'm', m: 'd', d: 'o' };

/** 3x5 glyphs for in-art text, drawn with `fx.glyphs`. */
const FONT: Record<string, string[]> = {
  '^': ['.#.', '#.#', '...', '...', '...'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'],
  '{': ['.##', '.#.', '##.', '.#.', '.##'],
  '}': ['##.', '.#.', '.##', '.#.', '##.'],
  0: ['###', '#.#', '#.#', '#.#', '###'],
  1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['###', '..#', '###', '#..', '###'],
  3: ['###', '..#', '.##', '..#', '###'],
  4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'],
  7: ['###', '..#', '..#', '.#.', '.#.'],
  8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '###'],
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['###', '#..', '#..', '#..', '###'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
};

/** Drawing helpers handed to a sprite's decoration pass (grid coordinates). */
interface Fx {
  /** Grid size, and the sprite's size and top-left cell. */
  gw: number; gh: number; sw: number; sh: number; nx: number; ny: number;
  rnd: () => number;
  /** The sprite's shade palette (see the key above). */
  pal: Record<string, string>;
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
    def.decorate({ gw, gh, sw, sh, nx, ny, rnd, pal, lit, glyphs });
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

/**
 * Trojan: a blocky wooden horse on a wheeled cart, its belly hatch ajar and
 * something inside looking out. Overhead, a progress bar keeps "installing".
 */
const HORSE: SpriteDef = {
  rows: [
    '.................oo.oo........',
    '.................ohoho........',
    '................odllllooooo...',
    '................odlhllllllllo.',
    '................odlnllllllllmo',
    '...............odllllllllllmno',
    '...............odllllmmmmmmmo.',
    '..............odllllmoooooooo.',
    '..............odlllllmo.......',
    '.............odlllllmo........',
    '.oo.........odlllllmo.........',
    'odho.oooooodllllllmoooo.......',
    'odmohhhhhhhhhhhhhhhhhhhmo.....',
    'odmollloooooooollllllllmo.....',
    'odmolllonnnnnnollllllllmo.....',
    'odmolllocnnnncollllllllmo.....',
    '.omolllonnnnnnollllllllmo.....',
    '..oommmoooooooommmmmmmmmo.....',
    '...oooooooooooooooooooooo.....',
    '....olmoolmo....olmoolmo......',
    '....olmoolmo....olmoolmo......',
    '.ohhhhhhhhhhhhhhhhhhhhhhhho...',
    '.oooooooooooooooooooooooooo...',
    '...GgG.......GgG......GgG.....',
  ],
  // [██████████░░░░] stuck at about 70%.
  decorate({ nx, ny, lit }) {
    const x0 = Math.max(1, nx - 8), len = 14, y = ny + 4;
    for (let dy = -1; dy <= 2; dy++) { lit(x0, y + dy, COLOR.cyan, 0.6); lit(x0 + len + 3, y + dy, COLOR.cyan, 0.6); }
    for (const dx of [1, len + 2]) { lit(x0 + dx, y - 1, COLOR.cyan, 0.6); lit(x0 + dx, y + 2, COLOR.cyan, 0.6); }
    for (let i = 0; i < len; i++) for (let dy = 0; dy < 2; dy++) lit(x0 + 2 + i, y + dy, COLOR.cyan, i < 10 ? 0.95 : 0.3);
  },
};

/**
 * DDoS: a smart toaster, wifi up, packets scrolling across its little LCD,
 * with the rest of the 10,000 streaming past behind it.
 */
const TOASTER: SpriteDef = {
  shadeRight: true,
  rows: [
    '.........ccccccc.........',
    '........c.......c........',
    '..........ccccc..........',
    '.........c.....c.........',
    '...........ccc...........',
    '............c............',
    '.....oooooo...oooooo.....',
    '....ohhhhhho.ohhhhhho....',
    '....ohllllmo.ohllllmo....',
    '....ohllllmo.ohllllmo....',
    '.oooommmmmmooommmmmmoooo.',
    '.ohhnnnnnnnnhnnnnnnnnhho.',
    '.ohlllllllllllllllllllho.',
    '.ohlllllllllllllllllllhoG',
    '.ohlllooooooooooooolllhog',
    '.ohllloncnncnncnnnolllho.',
    '.ohlllonncnncnncnnolllho.',
    '.ohllloncnncnncnnnolllho.',
    '.ohlllooooooooooooolllho.',
    '.ohlllllllllllllllllllho.',
    '.ommmmmmmmmmmmmmmmmmmmmo.',
    '..ooooooooooooooooooooo..',
    '...oGo.............oGo...',
    '....kkkkkkkkkkkkkkkkk....',
  ],
  // Dim mini toasters, scattered through the margins: the other 9,999.
  decorate({ gw, gh, sw, nx, rnd, pal, lit }) {
    const MINI = ['.h.h.', 'mmmmm', 'mmmmm', 'ddddd'];
    const cols = [2, nx + sw + 6].filter((x) => x + 5 <= gw);
    for (const cx of cols) for (let gy = 2; gy + 5 <= gh; gy += 8) {
      const x = cx + Math.floor(rnd() * 5) - 1, y = gy + Math.floor(rnd() * 2);
      const a = 0.25 + rnd() * 0.35;
      MINI.forEach((row, dy) => [...row].forEach((ch, dx) => { if (ch !== '.') lit(x + dx, y + dy, pal[ch], a); }));
      lit(x + 2, y - 1, COLOR.cyan, a + 0.2);
    }
  },
};

const BOT: SpriteDef = {
  shadeRight: true,
  rows: [
    '...........c...........',
    '..........ccc..........',
    '...........o...........',
    '...........o...........',
    '...ooooooooooooooooo...',
    '..ohhhhhhhhhhhhhhhhho..',
    '..ohlllllllllllllllho..',
    '..ohlooooolllooooolho..',
    '.GohlocccolllocccolhoG.',
    '.GohlocccolllocccolhoG.',
    '..ohlooooolllooooolho..',
    '..ohlllllllllllllllho..',
    '..ohlllooooooooolllho..',
    '..ohlllowgwgwgwolllho..',
    '..ohlllooooooooolllho..',
    '..ohlllllllllllllllho..',
    '..ommmmmmmmmmmmmmmmmo..',
    '...ooooooooooooooooo...',
    '.......oGGGGGGGo.......',
    '....ooooooooooooooo....',
    '...ohhhhhhhhhhhhhhho...',
    '..ohlllllllclllllllho..',
    '..ommmmmmmmmmmmmmmmmo..',
    '..ooooooooooooooooooo..',
  ],
  // Mini bots on a grid, wired to their neighbours and inward to the big one.
  decorate({ gw, gh, sw, nx, rnd, pal, lit }) {
    const MINI = ['..c..', 'mmmmm', 'mcmcm', 'mmmmm'];
    const left = [1, 8], right = [nx + sw + 2, nx + sw + 9].filter((x) => x + 5 <= gw);
    for (const xs of [left, right]) for (let y = 1; y + 4 <= gh; y += 6) {
      xs.forEach((x, i) => {
        const a = 0.3 + rnd() * 0.3;
        MINI.forEach((row, dy) => [...row].forEach((ch, dx) => {
          if (ch !== '.') lit(x + dx, y + dy, ch === 'c' ? COLOR.cyan : pal[ch], ch === 'c' ? a + 0.25 : a);
        }));
        // Link right to the next mini (or the big bot), and down to the one below.
        const end = i + 1 < xs.length ? xs[i + 1] - 1 : xs === left ? nx + 3 : gw;
        for (let gx = x + 6; gx < end; gx += 2) lit(gx, y + 2, pal.m, 0.3);
        if (y + 10 <= gh) for (let gy = y + 5; gy < y + 6; gy++) lit(x + 2, gy, pal.m, 0.3);
      });
    }
  },
};

/**
 * Rootkit: an innocent sprout above ground, growing out of the skull buried
 * beneath it, whose roots have spread through everything.
 */
const SKULL: SpriteDef = {
  shadeRight: true,
  rows: [
    '.........EEE.....EEE.........',
    '........EeeeE...EeeeE........',
    '.........EeeeE.EeeeE.........',
    '..........EEeEmEeEE..........',
    '.............omo.............',
    'gggggggggggggomoggggggggggggg',
    '.............omo.............',
    '.............omo.............',
    '..........ooooooooo..........',
    '.........ohhhhhhhhho.........',
    '........ohlllllllllho........',
    '........ohnnnlllnnnho........',
    '........ohncnlllncnho........',
    '........ohnnnlllnnnho........',
    '........ohllllnllllho........',
    '.........ohlllllllho.........',
    '..........ownwnwnwo..........',
    '..........ooooooooo..........',
    '...........m..m..m...........',
    '..........m...m...m..........',
    '.........m....m....m.........',
    '........m....m.m....m........',
    '.......m....m...m....m.......',
  ],
  // Ground line across the whole window, soil specks, and roots wandering out
  // to the edges from the skull's temples and the tips of the taproots.
  decorate({ gw, gh, sw, nx, ny, rnd, pal, lit }) {
    const ground = ny + 5;
    for (let gx = 0; gx < gw; gx++) lit(gx, ground, '#30383e', 1);
    for (let i = 0; i < 16; i++) lit(Math.floor(rnd() * gw), ground + 1 + Math.floor(rnd() * (gh - ground)), pal.d, 0.35);
    // A root wanders outward, drooping as it goes and now and then forking.
    const root = (x: number, y: number, dir: number, a: number, droop: number, forks: number) => {
      while (x >= 0 && x < gw && y < gh && a > 0.1) {
        lit(x, y, pal.m, a);
        if (rnd() < droop) y++; else x += dir;
        a -= 0.025;
        if (forks > 0 && rnd() < 0.07) root(x, y + 1, dir, a * 0.8, droop + 0.2, forks - 1);
      }
    };
    for (const dir of [-1, 1]) {
      root(nx + 14 + dir * 2, ground + 1, dir, 0.85, 0.15, 2);
      root(nx + 14 + dir * 2, ground + 2, dir, 0.6, 0.3, 1);
      root(dir < 0 ? nx + 6 : nx + sw - 7, ny + 23, dir, 0.7, 0.4, 0);
    }
  },
};

const CALENDAR: SpriteDef = {
  rows: [
    '.....oGo........oGo.....',
    '..oooGgGooooooooGgGooo..',
    '.ohhhoGohhhhhhhhoGohhho.',
    '.ohllllllllllllllllllho.',
    '.ohllllllllllllllllllmo.',
    '.ommmmmmmmmmmmmmmmmmmmo.',
    '.oGGGGGGGGGGGGGGGGGGGGo.',
    '.oGggggggggggggggggggGo.',
    '.oGggggggccccccggggggGo.',
    '.oGgggggccggggccgggggGo.',
    '.oGgggggccgggcccgggggGo.',
    '.oGgggggccggcgccgggggGo.',
    '.oGgggggccgcggccgggggGo.',
    '.oGgggggcccgggccgggggGo.',
    '.oGgggggccggggccgggggGo.',
    '.oGggggggccccccggggggGo.',
    '.oGggggggggggggggggkmh..',
    '.oGgggggggggggggggkmlh..',
    '.oGgggggggggggggkkmlh.h.',
    '.oGgggggggggggkmlhh.....',
    '.oGGGGGGGGGkkmlh.h......',
    '.ooooooookmlh...........',
  ],
  // Embers lift off the burning edge and drift up and to the right.
  decorate({ nx, ny, rnd, pal, lit }) {
    for (let i = 0; i < 26; i++) {
      const t = rnd();
      const gx = nx + 12 + Math.floor(t * 12 + rnd() * 8);
      const gy = ny + 21 - Math.floor(t * 9 + rnd() * 10);
      lit(gx, gy, rnd() < 0.4 ? pal.h : pal.l, 0.9 - (ny + 21 - gy) * 0.04);
    }
  },
};

/**
 * Honeypot: a fat clay pot brimming with glowing honey, dripping down its sides
 * and over a honeycomb label, dipper left in. Curious packets drift in to taste.
 */
const HONEYPOT: SpriteDef = {
  shadeRight: true,
  rows: [
    '...................oAo.....',
    '..................oAo......',
    '.................oAo.......',
    '................oAo........',
    '...oooooooooooooAooooooo...',
    '...oaaaaaaaaaaaaAaaaaaAo...',
    '...oaaaaaaaaaaaaAaaaaaAo...',
    '...omaaaaaaaaaAmaaaaaAmo...',
    '.....oaaAddaaaAddaaaAo.....',
    '....ohaAlllaaaAlllaaAlo....',
    '...ohlaAllllaAllllaAlllo...',
    '..ohllllllllaAllllaAllllo..',
    '.ohlllllllGGGGGGGlaAlllllo.',
    '.ohlllllllGGaaaGGllllllllo.',
    '.ohlllllllGaGGGaGllllllllo.',
    '.ohlllllllGGaaaGGllllllllo.',
    '.ohlllllllGGGGGGGllllllllo.',
    '..ohllllllllllllllllllllo..',
    '...ohllllllllllllllllllo...',
    '.....ooooooooooooooooo.....',
    '......kkkkkkkkkkkkkkk......',
  ],
  // Curious packets buzz in from all sides, each trailing a wiggly dotted path.
  decorate({ gw, gh, sw, nx, ny, rnd, lit }) {
    const cx = nx + sw / 2, cy = ny + 7;
    const flies: [number, number][] = [[3, 3], [6, 15], [2, 22], [gw - 4, 4], [gw - 7, 14], [gw - 3, 21]];
    for (const [fx, fy] of flies) {
      const dx = cx - fx, dy = cy - fy, len = Math.hypot(dx, dy);
      const ux = dx / len, uy = dy / len, phase = rnd() * 6;
      for (let i = 0; i <= 6; i++) {
        const t = i * 1.5, w = Math.sin(phase + i * 1.3) * 1.2;
        lit(Math.round(fx - ux * t - uy * w), Math.round(Math.min(gh - 1, fy - uy * t + ux * w)), COLOR.cyan, 0.75 - i * 0.1);
      }
      lit(Math.round(fx + ux), Math.round(fy + uy), COLOR.cyan, 0.95);
    }
  },
};

/**
 * Firewall: a brick wall crowned in flame. Packets fly in from the left, hit
 * it and drop. DROP ALL INPUT.
 */
const FIREWALL: SpriteDef = {
  rows: [
    '.....ff...f....faf.....ff....',
    '....faf..ff...faaf....faf..f.',
    '...faaf.faf..faaaff..faaf.ff.',
    '..faaaffaaf.faawaaf.faaaffaf.',
    '.ffaawaaaaffaawwaafffaawaaaf.',
    '.faawwaaaafaawwwwaafaawwaaaff',
    'ffawwwwaaaaawwwwwaaaawwwwaaff',
    'faawwwwwaaawwwwwwwaawwwwwaaaf',
    'ooooooooooooooooooooooooooooo',
    'olllllolllllolllllolllllolllo',
    'ommmmmommmmmommmmmommmmmommmo',
    'odddddodddddodddddodddddodddo',
    'ooooooooooooooooooooooooooooo',
    'ollolllllolllllolllllollllloo',
    'ommommmmmommmmmommmmmommmmmoo',
    'oddodddddodddddodddddodddddoo',
    'ooooooooooooooooooooooooooooo',
    'olllllolllllolllllolllllolllo',
    'ommmmmommmmmommmmmommmmmommmo',
    'odddddodddddodddddodddddodddo',
    'ooooooooooooooooooooooooooooo',
    '.kkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  ],
  // Inbound streams on the left, each ending in a packet that falls away dead
  // at the wall; sparks lift off the flames.
  decorate({ nx, ny, sw, gw, rnd, pal, lit }) {
    for (const y of [ny + 11, ny + 15, ny + 19]) {
      for (let gx = 0; gx < nx - 2; gx += 2) lit(gx, y, COLOR.cyan, 0.15 + 0.75 * (gx / nx));
      for (let i = 1; i <= 4; i++) lit(nx - 1 - (i >> 1), y + i, COLOR.red, 0.8 - i * 0.17);
    }
    for (let i = 0; i < 14; i++) {
      const gx = nx + Math.floor(rnd() * sw), gy = ny - 1 - Math.floor(rnd() * 3) + Math.floor(rnd() * 4);
      lit(gx, gy, rnd() < 0.5 ? COLOR.amber : '#ff6a2a', 0.3 + rnd() * 0.5);
    }
    void gw; void pal;
  },
};

/**
 * Fork: a dinner fork, and off either side of it a process tree, each child
 * spawning children of its own.
 */

const FORK: SpriteDef = {
  rows: [
    'ooo.ooo.ooo.ooo',
    'owo.owo.owo.owo',
    'owo.owo.owo.owo',
    'owo.owo.owo.owo',
    'owo.owo.owo.owo',
    'owo.owo.owo.owo',
    'owo.owo.owo.owo',
    'owwwwwwwwwwwwGo',
    'owGGGGGGGGGGGgo',
    '.owGGGGGGGGGgo.',
    '..owGGGGGGGgo..',
    '...owGGGGGgo...',
    '....owGGGgo....',
    '.....owGgo.....',
    '.....owGgo.....',
    '.....owGgo.....',
    '.....owGgo.....',
    '.....owGgo.....',
    '.....owGgo.....',
    '.....owGgo.....',
    '....owGGGgo....',
    '....owGGGgo....',
    '....owGGGgo....',
    '.....ooooo.....',
  ],
  decorate({ sw, nx, ny, lit }) {
    const node = (x: number, y: number, a: number) => { lit(x, y, COLOR.cyan, a); lit(x + 1, y, COLOR.cyan, a); lit(x, y + 1, COLOR.cyan, a); lit(x + 1, y + 1, COLOR.cyan, a); };
    const branch = (x: number, y: number, dir: number, spread: number, depth: number) => {
      const xe = x + dir * 5;
      for (let gx = x; gx !== xe; gx += dir) if ((gx - x) % 2 === 0) lit(gx, y, COLOR.cyan, 0.35);
      node(dir < 0 ? xe - 1 : xe, y, 0.95 - depth * 0.25);
      if (depth === 2) return;
      for (const s of [-1, 1]) {
        const yc = y + s * spread, xc = dir < 0 ? xe - 1 : xe + 1;
        for (let gy = y + s * 2; gy !== yc; gy += s) if ((gy - y) % 2 === 0) lit(xc, gy, COLOR.cyan, 0.35);
        branch(xc + dir, yc, dir, spread / 2, depth + 1);
      }
    };
    branch(nx - 1, ny + 9, -1, 6, 0);
    branch(nx + sw, ny + 9, 1, 6, 0);
  },
};

/**
 * Garbage Collector: a ribbed bin with its lid lifted, stray bits drifting in
 * from both sides to be freed.
 */

const TRASH: SpriteDef = {
  shadeRight: true,
  rows: [
    '........ooooo........',
    '.......oo...oo.......',
    '..ooooooooooooooooo..',
    '.ohhhhhhhhhhhhhhhhho.',
    'olllllllllllllllllllo',
    'ommmmmmmmmmmmmmmmmmmo',
    'ooooooooooooooooooooo',
    '.....................',
    'ooooooooooooooooooooo',
    'ohhhhhhhhhhhhhhhhhhho',
    'ooooooooooooooooooooo',
    '.ohlmllmllmllmllmlho.',
    '.ohlmllmllmllmllmlho.',
    '.ohlmllmllmllmllmlho.',
    '.ohlmllmllmllmllmlho.',
    '.ohlmllmllmllmllmlho.',
    '..ohmllmllmllmllmho..',
    '..ohmllmllmllmllmho..',
    '..ohmllmllmllmllmho..',
    '..ohmllmllmllmllmho..',
    '..ohmllmllmllmllmho..',
    '...ohllmllmllmllho...',
    '...ooooooooooooooo...',
    '....kkkkkkkkkkkkk....',
  ],
  decorate({ sw, nx, ny, rnd, glyphs, lit }) {
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
      const x = side < 0 ? nx - 5 - i * 4 : nx + sw + 2 + i * 4, y = ny + 2 + i * 6 + Math.floor(rnd() * 3);
      const a = 0.9 - i * 0.28;
      glyphs(rnd() < 0.5 ? '0' : '1', x, y, COLOR.cyan, a);
      // Dotted path from the bit into the gap under the lid.
      const tx = side < 0 ? nx - 1 : nx + sw, ty = ny + 7, sx = x + 1, sy = y + 2;
      const n = Math.max(Math.abs(tx - sx), Math.abs(ty - sy));
      for (let k = 2; k < n; k += 2) lit(Math.round(sx + (tx - sx) * k / n), Math.round(sy + (ty - sy) * k / n), COLOR.cyan, a * 0.4);
    }
  },
};

/**
 * Defrag: an open hard drive, platter spinning under the head. To the left,
 * fragmented blocks; to the right, the same blocks sorted.
 */

const HDD: SpriteDef = {
  rows: [
    'ooooooooooooooooooooooooooo',
    'ogggggggggggggggggggggggggo',
    'ogGggggggoooooooggggggggGgo',
    'oggggggoohhhlllmooggggggggo',
    'ogggggoohhhhmmmlloogggggggo',
    'oggggohhhhhhmmmmmlmoggggggo',
    'ogggoohhhhhhlGlmmmloogggggo',
    'ogggolhhhhhhmmGGmmmlogggggo',
    'oggomlmmhhhhmmmwGmmlmoggggo',
    'oggolmmlmhhhmmmwGlmmloggggo',
    'oggolmmlmmmGGGmmwGmmloggggo',
    'oggolmmlmmmGwGmmmwGmloggggo',
    'oggolmmlmmmGGGmmmwGGloggggo',
    'oggolmmlmmmmmmmmmlmwGoggggo',
    'oggomlmmlmmmmmmmlmmwGoggggo',
    'ogggolmmmlmmmmmlmmmlwGggggo',
    'ogggoolmmmlllllmmmloowGgggo',
    'oggggomlmmmmmmmmmlmogGGGggo',
    'ogggggoollmmmmmllooggGwGggo',
    'oggggggoomlllllmoogggGGGggo',
    'ogGggggggoooooooggggggggGgo',
    'ogggggggggggggggggggggggggo',
    'ooooooooooooooooooooooooooo',
  ],
  decorate({ gw, gh, sw, nx, rnd, pal, lit }) {
    const cols = Math.max(1, Math.floor((nx - 1) / 3)), rows = Math.floor((gh - 1) / 3);
    const kinds = Array.from({ length: cols * rows }, () => (rnd() < 0.4 ? 0 : rnd() < 0.55 ? 1 : 2));
    const sorted = [...kinds].sort((a, b) => b - a);
    const block = (x: number, y: number, k: number) => {
      const [c, a] = k === 0 ? [pal.d, 0.3] : k === 1 ? [COLOR.cyan, 0.8] : [pal.l, 0.7];
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) lit(x + dx, y + dy, c, a);
    };
    const rx = nx + sw + Math.max(1, Math.floor((gw - nx - sw - cols * 3 + 1) / 2));
    kinds.forEach((k, i) => block(1 + (i % cols) * 3, 1 + Math.floor(i / cols) * 3, k));
    // Sorted fills from the bottom up.
    sorted.forEach((k, i) => block(rx + (i % cols) * 3, 1 + (rows - 1 - Math.floor(i / cols)) * 3, k));
  },
};

/**
 * Server Rack: six units of blinkenlights, cables spilling out either side.
 */

const RACK: SpriteDef = {
  rows: [
    'ooooooooooooooooooooo',
    'ohhhhhhhhhhhhhhhhhhho',
    'olGGGGGGGGGGGGGGGGGmo',
    'olgcghghgggGoGoGoGgmo',
    'olooooooooooooooooomo',
    'olGGGGGGGGGGGGGGGGGmo',
    'olgGGGgGGGgGGGgcgagmo',
    'olooooooooooooooooomo',
    'olGGGGGGGGGGGGGGGGGmo',
    'olghghghghgggggGGGgmo',
    'olooooooooooooooooomo',
    'olGGGGGGGGGGGGGGGGGmo',
    'olgaggggggggGoGoGogmo',
    'olooooooooooooooooomo',
    'olGGGGGGGGGGGGGGGGGmo',
    'olgGGGgGGGgGGGghgcgmo',
    'olooooooooooooooooomo',
    'olGGGGGGGGGGGGGGGGGmo',
    'olgcgagggggGoGoGoGgmo',
    'olooooooooooooooooomo',
    'ommmmmmmmmmmmmmmmmmmo',
    'ooooooooooooooooooooo',
    '.oGo.............oGo.',
    '..kkkkkkkkkkkkkkkkk..',
  ],
  decorate({ gw, gh, sw, nx, ny, pal, lit }) {
    const colors = [COLOR.cyan, COLOR.amber, pal.l];
    for (const side of [-1, 1]) colors.forEach((c, k) => {
      const sx = side < 0 ? nx - 1 : nx + sw, sy = ny + 4 + k * 6;
      const ex = side < 0 ? 1 + k * 3 : gw - 2 - k * 3, ey = gh - 1;
      const n = Math.abs(ex - sx) * 3;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        lit(Math.round(sx + (ex - sx) * t), Math.round(sy + (ey - sy) * t * t), c, 0.5);
      }
    });
  },
};

/**
 * L2 Cache: a memory die, a glowing core ringed by cache lines, a few lit with
 * hits. Pulses race in along the traces.
 */

const CACHE: SpriteDef = {
  rows: [
    '.....G.G.G.G.G.G.G.G.G.....',
    '.....G.G.G.G.G.G.G.G.G.....',
    '...ooooooooooooooooooooo...',
    '...ogggggggggggggggggggo...',
    'GGGogooooooooooooooooogoGGG',
    '...ogonnnnnnnnnnnnnnnogo...',
    'GGGogonccnmmnllnmmnmmogoGGG',
    '...ogonccnmmnllnmmnmmogo...',
    'GGGogonnnnnnnnnnnnnnnogoGGG',
    '...ogonccnclllllllnccogo...',
    'GGGogonccnclhhhlllnccogoGGG',
    '...ogonnnnnlhwhlnnnnnogo...',
    'GGGogonmmnllhhhlllnmmogoGGG',
    '...ogonmmnllllllllnmmogo...',
    'GGGogonnnnnnnnnnnnnnnogoGGG',
    '...ogonccnmmnllnmmnmmogo...',
    'GGGogonccnmmnllnmmnmmogoGGG',
    '...ogonnnnnnnnnnnnnnnogo...',
    'GGGogooooooooooooooooogoGGG',
    '...ogggggggggggggggggggo...',
    '...ooooooooooooooooooooo...',
    '.....G.G.G.G.G.G.G.G.G.....',
    '.....G.G.G.G.G.G.G.G.G.....',
  ],
  decorate({ gw, sw, sh, nx, ny, rnd, pal, lit }) {
    for (let y = ny + 4; y < ny + sh - 4; y += 2) for (const side of [-1, 1]) {
      const x0 = side < 0 ? 0 : nx + sw, x1 = side < 0 ? nx : gw;
      for (let gx = x0; gx < x1; gx++) lit(gx, y, pal.d, 0.45);
      if (rnd() < 0.6) {
        const p = x0 + Math.floor(rnd() * (x1 - x0));
        for (let t = 0; t < 3; t++) lit(p - side * t, y, COLOR.cyan, 0.95 - t * 0.3);
      }
    }
  },
};

/**
 * Crypto Miner: a mine cart heaped with coins, pickaxe left in the pile.
 * Proof of work.
 */

const MINER: SpriteDef = {
  rows: [
    '.......wwwG..................',
    '.....wwwGG.G.................',
    '....wGGGo...G................',
    '...wG...Ao...................',
    '..GG.....AoaAaaaawa..........',
    '..G....aaaAoaaaAaaaaAa.......',
    '.G....aaAaaAoAaaaaAaaaa......',
    '.....aAaaaaAAowaAaaaaAaa.....',
    '....AaaawAaaaAoaaaaAawaaA....',
    '...aaaaAaaaaAaAoaAaaaaAaaa...',
    '.ooooooooooooooAoooooooooooo.',
    '.ohhhhhhhhhhhhhhhhhhhhhhhhho.',
    '.ohllllllllllllllllllllllllo.',
    '..ohlmmmmmmmmmmmmmmmmmmmmlo..',
    '..ohllGlllGlllGlllGlllGlllo..',
    '...ohllllllllllllllllllllo...',
    '...ohmmmmmmmmmmmmmmmmmmmmo...',
    '....ooooGGoooooooooooGGoo....',
    '.......GwgG.........GwgG.....',
    '........GG...........GG......',
    'GGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
    '.A..A..A..A..A..A..A..A..A..A',
  ],
  decorate({ gw, sw, nx, ny, rnd, lit }) {
    const twinkle = (x: number, y: number, a: number) => {
      lit(x, y, COLOR.amber, a);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) lit(x + dx, y + dy, COLOR.amber, a * 0.45);
    };
    for (let i = 0; i < 3; i++) twinkle(2 + Math.floor(rnd() * (nx - 4)), ny + 2 + i * 6 + Math.floor(rnd() * 3), 0.9 - i * 0.2);
    for (let i = 0; i < 3; i++) twinkle(nx + sw + 2 + Math.floor(rnd() * (gw - nx - sw - 4)), ny + 2 + i * 6 + Math.floor(rnd() * 3), 0.9 - i * 0.2);
  },
};

/**
 * Backdoor: a plain door, left ajar, cyan light leaking from the gap and
 * across the floor. Nobody checks port 31337.
 */

const DOOR: SpriteDef = {
  rows: [
    '...ooooooooooooooooo...',
    '...ohhhhhhhhhhhhhhho...',
    '...ohlooooooooooolmo...',
    '...ohlollllllocwclmo...',
    '...ohlolmmmdlocwclmo...',
    '...ohlolmmmdlocwclmo...',
    '...ohlolmmmdlocwclmo...',
    '...ohlolmmmdlocwclmo...',
    '...ohlolmmmdlocwclmo...',
    '...ohlolmmmdlocwclmo...',
    '...ohlolmmmdlocwclmo...',
    '...ohlollllllocwclmo...',
    '...ohlolllllAocwclmo...',
    '...ohlolmmmdlocwclmo...',
    '...ohlolmmmdlocwclmo...',
    '...ohlolmmmdlocwclmo...',
    '...ohlolmmmdlocwclmo...',
    '...ohlolmmmdlocwclmo...',
    '...ohlolmmmdlocwclmo...',
    '...ohlolmmmdlocwclmo...',
    '...ohlollllllocwclmo...',
    '...ooooooooooooooooo...',
    'ggggggggggggggggggggggg',
  ],
  decorate({ gw, gh, nx, ny, rnd, lit }) {
    const floor = ny + 22;
    for (let gx = 0; gx < gw; gx++) lit(gx, floor, '#30383e', 1);
    for (let k = 1; floor + k < gh; k++) for (let gx = nx + 13 - k; gx <= nx + 17 + k * 4; gx++) {
      lit(gx, floor + k, COLOR.cyan, Math.max(0.05, 0.55 - k * 0.12 - (gx - nx - 13) * 0.02));
    }
    for (let i = 0; i < 10; i++) lit(nx + 21 + Math.floor(rnd() * 12), ny + 3 + Math.floor(rnd() * 18), COLOR.cyan, 0.15 + rnd() * 0.35);
  },
};

/**
 * Patch: two band-aids slapped on in an X. Fixes everything.
 */

const PATCH: SpriteDef = {
  rows: [
    '.........................',
    '.........................',
    '.........................',
    '....llho.........ohll....',
    '....lmmho.......ohmml....',
    '....mmllho.....ohllmm....',
    '....olllmho...ohmlllo....',
    '.....olmllho.ohllmlo.....',
    '......olllmGoGmlllo......',
    '.......olmGoGgGmlo.......',
    '........oGoGgGgGo........',
    '.........oGgGgGo.........',
    '........oGgGgGoGo........',
    '.......ohmGgGoGmho.......',
    '......ohllmGoGmllho......',
    '.....ohmlllo.olllmho.....',
    '....ohllmlo...olmllho....',
    '....hmlllo.....olllmh....',
    '....lmmlo.......olmml....',
    '....llmo.........omll....',
    '.........................',
    '.........................',
    '.........................',
  ],
  decorate({ gw, gh, sw, nx, rnd, lit }) {
    const sparkle = (x: number, y: number, r: number, a: number) => {
      lit(x, y, COLOR.cyan, a);
      for (let d = 1; d <= r; d++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) lit(x + dx * d, y + dy * d, COLOR.cyan, a * (0.7 - d * 0.2));
    };
    const spots: [number, number, number][] = [[nx - 6, 4, 2], [nx - 10, 14, 1], [nx - 4, 21, 1], [nx + sw + 5, 6, 1], [nx + sw + 9, 16, 2], [nx + sw + 3, 22, 1]];
    for (const [x, y, r] of spots) if (x > 1 && x < gw - 2 && y < gh - 1) sparkle(x, y, r, 0.6 + rnd() * 0.35);
  },
};

/**
 * Antivirus: a magnifying glass over a single red virus, a scan line passing
 * through it. 1 threat found.
 */

const LENS: SpriteDef = {
  rows: [
    '.........................',
    '......ooohhhooo..........',
    '.....ohhhhhhhhho.........',
    '....ohhhhhhhhhllo........',
    '...ohhhookkkoolllo.......',
    '..ohhhokkkrkkkolllo......',
    '..ohhokrkkRkkrkolmo......',
    '.ohhhkkkRrrrRkkkmmmo.....',
    '.ohhokkkrwrwrkkkommo.....',
    '.ohhokrRrrrrrRrkommo.....',
    '.ohhokkkrrrrrkkkommo.....',
    '.ohhokkkRrrrRkkkommo.....',
    '.ohhhkkrkkRkkrkkmmmo.....',
    '..ohlokkkkrkkkkommo......',
    '..olllokkkkkkkommmo......',
    '...olllookkkoommmd.......',
    '....ollmmmmmmmmmomd......',
    '.....ommmmmmmmmolmmd.....',
    '......ooommmooo..lmdd....',
    '..................lmdd...',
    '...................lmmd..',
    '....................lmmd.',
    '.....................l...',
  ],
  decorate({ gw, nx, ny, glyphs, lit }) {
    for (let gx = 0; gx < gw; gx++) lit(gx, ny + 9, COLOR.cyan, 0.4);
    glyphs('!', nx + 20, ny + 1, COLOR.red, 0.95);
  },
};

/**
 * Phishing: an envelope on a hook, dangled under the surface. A curious fish
 * noses in; bubbles rise.
 */

const HOOK: SpriteDef = {
  rows: [
    '.............g.......',
    '.............g.......',
    '.............g.......',
    '............oGo......',
    '............G.G......',
    '............oGo......',
    '............owG......',
    '............owG......',
    '.......o....owG......',
    '......owo...owG......',
    '......owo...owG......',
    '......owwo..owG......',
    '......owowo.owG......',
    '......owoo..owo......',
    '..GGGGowooGoowoGGGG..',
    '..GGwwoowooowoowwGG..',
    '..GwGGwowwwwwowGGwG..',
    '..GwwwGGoooooGGwwwG..',
    '..GwwwwwGwwwGwwwwwG..',
    '..GwwwwwwGGGwwwwwwG..',
    '..GwwwwwwwwwwwwwwwG..',
    '..GwwwwwwwwwwwwwwwG..',
    '..GGGGGGGGGGGGGGGGG..',
    '.....................',
  ],
  decorate({ gw, nx, ny, rnd, pal, lit }) {
    for (let gx = 0; gx < gw; gx++) if ((gx + 1) % 4 !== 0) lit(gx, Math.round(Math.sin(gx * 0.7)), COLOR.cyan, 0.35);
    const FISH = ['..###...#', '.#####.##', '#.######.', '.#####.##', '..###...#'];
    const fx = Math.max(0, nx - 12), fy = ny + 14;
    FISH.forEach((row, dy) => [...row].forEach((ch, dx) => { if (ch === '#') lit(fx + 8 - dx, fy + dy, pal.l, 0.55); }));
    for (let i = 0; i < 9; i++) lit(nx + 22 + Math.floor(rnd() * 8), ny + 3 + Math.floor(rnd() * 18), COLOR.cyan, 0.2 + rnd() * 0.35);
  },
};

/**
 * Compiler: two meshed gears grinding source into machine code.
 */

const GEARS: SpriteDef = {
  rows: [
    '.............................',
    '...................o...o.....',
    '..................oho.oho....',
    '..................ohhohlo....',
    '......oo...oo......oholo.....',
    '.....oho...oho..oooho.olooo..',
    '......ohoooho...ohho...ommo..',
    '.....ohhhhhllo..ooolo.omooo..',
    '..o.ohhhhhllllo.o..olomo.....',
    '.ohohhhhhllllllomoollommo....',
    '.oohhhhhooollllmooolo.omo....',
    '...ohhho...ollmo...o...o.....',
    '...ohhlo...olmmo.............',
    '...ohllo...ommmo.............',
    '.oohllllooommmmmoo...........',
    '.ohollllllmmmmmomo...........',
    '..o.ollllmmmmmo.o............',
    '.....ollmmmmmo...............',
    '......omooomo................',
    '.....omo...omo...............',
    '......oo...oo................',
    '.............................',
  ],
  decorate({ sw, nx, ny, glyphs, lit }) {
    glyphs('{}', Math.max(1, nx - 10), ny + 12, COLOR.cyan, 0.85);
    for (let gx = nx - 2; gx < nx + 1; gx++) lit(gx, ny + 14, COLOR.cyan, 0.4);
    glyphs('01', nx + sw + 2, ny + 4, COLOR.cyan, 0.85);
    glyphs('10', nx + sw + 2, ny + 11, COLOR.cyan, 0.45);
  },
};

/**
 * Recursion: a monitor showing a monitor showing a monitor. See: Recursion.
 */

const SCREENS: SpriteDef = {
  rows: [
    'ooooooooooooooooooooooooooo',
    'ohhhhhhhhhhhhhhhhhhhhhhhhho',
    'ohnnnnnnnnnnnnnnnnnnnnnnnmo',
    'ohnnnnooooooooooooooonnnnmo',
    'ohnnnnohhhhhhhhhhhhhonnnnmo',
    'ohnnnnohnnnooooonnnmonnnnmo',
    'ohnnnnohnnnohchonnnmonnnnmo',
    'ohnnnnohnnnohmmonnnmonnnnmo',
    'ohnnnnohnnnooooonnnmonnnnmo',
    'ohnnnnohnnommmmmonnmonnnnmo',
    'ohnnnnohnnnnnnnnnnnmonnnnmo',
    'ohnnnnohmmmmmmmmmmmmonnnnmo',
    'ohnnnnooooooooooooooonnnnmo',
    'ohnnnnnnnnnnolonnnnnnnnnnmo',
    'ohnnnnnnnnnnolonnnnnnnnnnmo',
    'ohnnnnnnnnommmmmonnnnnnnnmo',
    'ohnncnnnnnnnnnnnnnnnnncnnmo',
    'ohmmmmmmmmmmmmmmmmmmmmmmmmo',
    'ooooooooooooooooooooooooooo',
    '............olo............',
    '............olo............',
    '............olo............',
    '..........ommmmmo..........',
  ],
  decorate({ gw, gh, sw, nx, ny, pal, lit }) {
    // Zoom lines from the outer screen's corners out to the window's.
    const corners: [number, number, number, number][] = [[nx, ny, 0, 0], [nx + sw - 1, ny, gw - 1, 0], [nx, ny + 18, 0, gh - 1], [nx + sw - 1, ny + 18, gw - 1, gh - 1]];
    for (const [sx, sy, ex, ey] of corners) {
      const n = Math.max(Math.abs(ex - sx), Math.abs(ey - sy));
      for (let k = 1; k <= n; k += 2) lit(Math.round(sx + (ex - sx) * k / n), Math.round(sy + (ey - sy) * k / n), pal.l, 0.4);
    }
  },
};

/**
 * Encryption: a heavy padlock, ciphertext drifting around it. Good luck.
 */

const PADLOCK: SpriteDef = {
  shadeRight: true,
  rows: [
    '.....................',
    '.........ooo.........',
    '.......owwGGGo.......',
    '.....owwwwGGGGGo.....',
    '....owwwwoooGGGGo....',
    '....owwo.....oGGo....',
    '...owwo.......oGGo...',
    '...owwo.......oGGo...',
    '...oww.........GGo...',
    '...owwo.......oGGo...',
    '..ooooooooooooooooo..',
    '.ohhhhhhhhhhhhhhhhho.',
    '.ohGlllllllllllllGlo.',
    '.ohllllllllllllllllo.',
    '.ohllllllnnnlllllllo.',
    '.ohllllllnnnlllllllo.',
    '.ohllllllnnnlllllllo.',
    '.ohlllllllnllllllllo.',
    '.ohlllllllnllllllllo.',
    '.ohlllllllnllllllllo.',
    '.ohGlllllllllllllGlo.',
    '.ohmmmmmmmmmmmmmmmmo.',
    '..ooooooooooooooooo..',
    '.....................',
  ],
  decorate({ gw, gh, sw, nx, rnd, pal, glyphs }) {
    const HEX = '0123456789ABCDEF';
    for (let y = 1; y + 5 <= gh; y += 6) for (const x0 of [1, nx + sw + 2]) {
      for (let x = x0; x + 3 <= (x0 === 1 ? nx - 1 : gw); x += 4) glyphs(HEX[Math.floor(rnd() * 16)], x, y, pal.m, 0.15 + rnd() * 0.3);
    }
  },
};

/**
 * Overclock: a CPU cooking itself, its die glowing white-hot through amber and
 * red, pins glowing with it. Heat shimmers up the sides and the thermometer is
 * pinned. Thermal limits are a suggestion.
 */
const CPU: SpriteDef = {
  rows: [
    '....G.G.f.f.f.f.f.G.G....',
    '....G.G.f.f.f.f.f.G.G....',
    '..ooooooooooooooooooooo..',
    '..oGGGGGGGGGGGGGGGGGGGo..',
    'GGoGwgggggggggggggggGgoGG',
    '..oGgorrrrrrrrrrrrroggo..',
    'GGoGgorrrrrrrrrrrrroggoGG',
    '..oGgorrfffffffffrroggo..',
    'ffoGgorrfaaaaaaafrroggoff',
    '..oGgorrfaaaaaaafrroggo..',
    'ffoGgorrfaawwwaafrroggoff',
    '..oGgorrfaawwwaafrroggo..',
    'ffoGgorrfaawwwaafrroggoff',
    '..oGgorrfaaaaaaafrroggo..',
    'ffoGgorrfaaaaaaafrroggoff',
    '..oGgorrfffffffffrroggo..',
    'GGoGgorrrrrrrrrrrrroggoGG',
    '..oGgorrrrrrrrrrrrroggo..',
    'GGoGGgggggggggggggggGgoGG',
    '..oGggggggggggggggggggo..',
    '..ooooooooooooooooooooo..',
    '....G.G.f.f.f.f.f.G.G....',
    '....G.G.f.f.f.f.f.G.G....',
  ],
  decorate({ gw, gh, sw, nx, rnd, lit }) {
    // Shimmer: wavy columns of heat rising from the bottom, cooling as they climb.
    const heat = ['#ff3366', '#ff6a2a', '#ffc933'];
    for (const x0 of [2, 6, nx - 4, nx + sw + 3]) {
      const phase = rnd() * 6;
      for (let gy = gh - 1; gy >= 0; gy -= 1) {
        if ((gy + Math.floor(phase)) % 3 === 0) continue;
        const t = 1 - gy / gh;
        lit(x0 + Math.round(Math.sin(gy * 0.55 + phase)), gy, heat[Math.min(2, Math.floor(t * 3))], 0.65 - t * 0.5);
      }
    }
    // Thermometer, maxed out.
    const tx = gw - 5;
    for (let gy = 1; gy < gh - 4; gy++) { lit(tx - 1, gy, '#5d676f', 0.8); lit(tx + 1, gy, '#5d676f', 0.8); lit(tx, gy, '#ff3366', gy < 3 ? 0.5 : 0.95); }
    lit(tx, 0, '#5d676f', 0.8);
    for (let dy = 0; dy < 3; dy++) for (let dx = -1; dx <= 1; dx++) lit(tx + dx, gh - 4 + dy, '#ff3366', 0.95);
    for (let gy = 3; gy < gh - 6; gy += 3) lit(tx - 2, gy, '#5d676f', 0.6);
  },
};

/**
 * Malware: a fat bug, x-ed out eyes, spotted shell, crawling out of a glitch.
 * It came with the free screensaver.
 */
const BUG: SpriteDef = {
  shadeRight: true,
  rows: [
    '....ommo.........ommo....',
    '.....oomo.......omoo.....',
    '.......omooooooomo.......',
    '.......oommmmmmmoo.......',
    '......owmwmmmmmwmwo......',
    '......omwmmmmmmmwmo......',
    '.....omwmwmmmmmwmwmo.....',
    '......ommmmmmmmmmmo......',
    '.o.....ommmmommmmo.....o.',
    'omo...ommlllolllmmo...omo',
    'ommo.omllhhlollhhlmo.ommo',
    '.oomomllhlllollllhlmomoo.',
    '...oomlhllllolllllhmoo...',
    '.ooomllhllnlolllllhlmooo.',
    'ommmmlllllllollnnlllmmmmo',
    'omoomllnnlllolllllllmoomo',
    '.o.omlllllnlolllllllmo.o.',
    '.oommlllllllollnlnllmmoo.',
    'ommoomlllnnlollllllmoommo',
    'omo..omlllllolnlllmo..omo',
    '.o....omllllollllmo....o.',
    '.......ommllollmmo.......',
    '........ooooooooo........',
  ],
  // Glitch streaks and dead pixels scattered around it.
  decorate({ gw, gh, rnd, pal, lit }) {
    for (let i = 0; i < 12; i++) {
      const x = Math.floor(rnd() * gw), y = Math.floor(rnd() * gh), len = 2 + Math.floor(rnd() * 6);
      const c = rnd() < 0.35 ? pal.l : COLOR.cyan, a = 0.2 + rnd() * 0.35;
      for (let k = 0; k < len; k++) lit(x + k, y, c, a);
    }
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(rnd() * gw), y = Math.floor(rnd() * gh);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) lit(x + dx, y + dy, COLOR.white, 0.35);
    }
  },
};

type SpriteDrawer = (ctx: CanvasRenderingContext2D, rnd: () => number, ax: number, ay: number, aw: number, ah: number, col: string) => void;

const draw = (def: SpriteDef): SpriteDrawer => (ctx, rnd, ax, ay, aw, ah, col) => drawSprite(ctx, rnd, ax, ay, aw, ah, col, def);

/** Card art drawers keyed by `CardDef.sprite`; each fills the art window (ax, ay, aw, ah). */
export const PIXEL_SPRITES: Record<PixelSprite, SpriteDrawer> = {
  nose: draw(NOSE),
  kiddie: draw(KIDDIE),
  horse: draw(HORSE),
  toaster: draw(TOASTER),
  bot: draw(BOT),
  skull: draw(SKULL),
  calendar: draw(CALENDAR),
  honeypot: draw(HONEYPOT),
  firewall: draw(FIREWALL),
  fork: draw(FORK),
  trash: draw(TRASH),
  hdd: draw(HDD),
  rack: draw(RACK),
  cache: draw(CACHE),
  cart: draw(MINER),
  door: draw(DOOR),
  bandaid: draw(PATCH),
  magnifier: draw(LENS),
  hook: draw(HOOK),
  gears: draw(GEARS),
  screens: draw(SCREENS),
  padlock: draw(PADLOCK),
  cpu: draw(CPU),
  bug: draw(BUG),
};
