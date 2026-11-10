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
    '...o...............o...',
    '...oo.............oo...',
    '...omo...........omo...',
    '...omho..ooooo..ohmo...',
    '...omhmoommmmmoomhmo...',
    '...omllllnnnnnllllmo...',
    '...omlllnnnnnnnlllmo...',
    '..omlllnnnnnnnnnlllmo..',
    '..omllnncnnnnncnnllmo..',
    '..omllncncnnncncnllmo..',
    '..omllnncnnnnncnnllmo..',
    'wwomllnnnnnhnnnnnllmoww',
    '.womllnnnnnnnnnnnllmow.',
    '..omlllnnnnnnnnnlllmo..',
    '..omllllmnnnnnmllllmo..',
    '.omlllllllmmmlllllllmo.',
    '.omllGGGGGGGGGGGGGllmo.',
    '.omllGgggggggggggGllmo.',
    '.omllGgggwwwwwgggGllmo.',
    '.omllGgggwnwnwgggGllmo.',
    '.omllGgggwwwwwgggGllmo.',
    '.omllGgggwgwgwgggGllmo.',
    '.ommmGgggggggggggGmmmo.',
    '.oooGGGGGGGGGGGGGGGooo.',
  ],
  // Copy once on the left; paste over and over on the right, fading as it climbs.
  decorate({ sw, nx, ny, glyphs }) {
    glyphs('^C', nx - 8, ny + 4, COLOR.cyan, 0.95);
    for (let i = 0; i < 3; i++) glyphs('^V', nx + sw + 1, ny + 14 - i * 6, COLOR.cyan, 0.95 - i * 0.3);
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
    '..............oAo..',
    '.............oAo...',
    '............oAo....',
    '...........oAo.....',
    '..oooooooooAooooo..',
    '..oaaaaaaaaAaaaAo..',
    '..oaaaaaaaaAaaaAo..',
    '..omaaaaaaAmaaAmo..',
    '...oaAddaaAddaAo...',
    '..ohaAlllaAllaAlo..',
    '.ohlaAllllaAlllAlo.',
    'ohlllaAlllaAlllAllo',
    'ohllllGGGGGGGlaAllo',
    'ohllllGGaaaGGlllllo',
    'ohllllGaGGGaGlllllo',
    'ohllllGGaaaGGlllllo',
    'ohllllGGGGGGGlllllo',
    'ohllllllllllllllllo',
    'ohllllllllllllllllo',
    'ohllllllllllllllllo',
    '.ohllllllllllllllo.',
    '..ohllllllllllllo..',
    '...ooooooooooooo...',
    '....kkkkkkkkkkk....',
  ],
  // Curious packets buzz in close around the pot, each trailing a short wiggly path.
  decorate({ gh, sw, nx, ny, rnd, lit }) {
    const cx = nx + sw / 2, cy = ny + 7;
    const flies: [number, number][] = [[nx - 4, ny + 4], [nx - 6, ny + 16], [nx + sw + 3, ny + 7], [nx + sw + 5, ny + 18]];
    for (const [fx, fy] of flies) {
      const dx = cx - fx, dy = cy - fy, len = Math.hypot(dx, dy);
      const ux = dx / len, uy = dy / len, phase = rnd() * 6;
      for (let i = 0; i <= 3; i++) {
        const t = i * 1.5, w = Math.sin(phase + i * 1.3) * 1.2;
        lit(Math.round(fx - ux * t - uy * w), Math.round(Math.min(gh - 1, fy - uy * t + ux * w)), COLOR.cyan, 0.75 - i * 0.15);
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
 * Fork: a slim dinner fork, and off either side of it a small process tree,
 * each parent with two children.
 */

const FORK: SpriteDef = {
  rows: [
    'ooo.ooo.ooo',
    'owo.owo.owo',
    'owo.owo.owo',
    'owo.owo.owo',
    'owo.owo.owo',
    'owo.owo.owo',
    'owo.owo.owo',
    'owwwwwwwwGo',
    'owGGGGGGGgo',
    '.owGGGGGgo.',
    '..owGGGgo..',
    '...owGgo...',
    '...owGgo...',
    '...owGgo...',
    '...owGgo...',
    '...owGgo...',
    '...owGgo...',
    '...owGgo...',
    '...owGgo...',
    '...owGgo...',
    '..owGGGgo..',
    '..owGGGgo..',
    '..owGGGgo..',
    '...ooooo...',
  ],
  decorate({ sw, nx, ny, lit }) {
    const node = (x: number, y: number, a: number) => { lit(x, y, COLOR.cyan, a); lit(x + 1, y, COLOR.cyan, a); lit(x, y + 1, COLOR.cyan, a); lit(x + 1, y + 1, COLOR.cyan, a); };
    const branch = (x: number, y: number, dir: number, spread: number, depth: number) => {
      const xe = x + dir * (depth ? 2 : 3);
      for (let gx = x; gx !== xe; gx += dir) if ((gx - x) % 2 === 0) lit(gx, y, COLOR.cyan, 0.35);
      node(dir < 0 ? xe - 1 : xe, y, 0.95 - depth * 0.3);
      if (depth === 1) return;
      for (const s of [-1, 1]) {
        const yc = y + s * spread, xc = dir < 0 ? xe - 1 : xe + 1;
        for (let gy = y + s * 2; gy !== yc; gy += s) if ((gy - y) % 2 === 0) lit(xc, gy, COLOR.cyan, 0.35);
        branch(xc + dir, yc, dir, 0, depth + 1);
      }
    };
    branch(nx - 1, ny + 9, -1, 5, 0);
    branch(nx + sw, ny + 9, 1, 5, 0);
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

/** Phishing: a fat fish caught through the lip on a barbed hook, the line running up out of frame. */
const HOOK: SpriteDef = {
  rows: [
    '...................................g..',
    '..................................oGo.',
    '..................................G.G.',
    '..................................oGo.',
    '..................................owG.',
    '..................................owG.',
    '..................................owG.',
    '...............oooooo.............owG.',
    '..............ohhhho..............owG.',
    '..oo.......oooohllhoooo...........owG.',
    '..ohoo...oohhhhhhhhhhhhoo.........owG.',
    '..ollmo.ohhlllllllllllhhhoo.......owG.',
    '..omllmohllmlllmlllmllwwwowo......owG.',
    '...omlmmlllmlllmlllmllwnwowoo.....owG.',
    '....omlmlllmlllmlllmllwwwowGwo....owG.',
    '...omlmmlmmlmmlmlllmllllmowooo....owG.',
    '..omllmommmmmmmmmlmmmmmmoowo......owG.',
    '..omlmo.oommmmmdddmmmmoo.owo......owG.',
    '..ooo....oooddoooooooo...owo.....owwG.',
    '............ooo..........owGo...owwGo.',
    '..........................owwoooowwGo.',
    '...........................owwwwwGGo..',
    '............................oGGGGoo...',
    '.............................oooo.....',
  ],
  // The line carries on up to the top of the window; a couple of bubbles.
  decorate({ nx, ny, lit }) {
    for (let y = 0; y < ny; y++) lit(nx + 35, y, '#30383e', 1);
    for (const [x, y, a] of [[-3, 4, 0.7], [-5, 1, 0.45], [-2, -1, 0.3]]) lit(nx + x, ny + y, COLOR.cyan, a);
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

/** Hello World: a tiny CRT says HELLO in a big speech bubble, despite being unplugged. */
const HELLO: SpriteDef = {
  rows: [
    '...........ooooooooooooooooooooooo..',
    '..........ohhhhhhhhhhhhhhhhhhhhhhho.',
    '.........ohnnnnnnnnnnnnnnnnnnnnnnnmo',
    '.........ohnnhnhnhhhnhnnnhnnnhhhnnmo',
    '.........ohnnhnhnhnnnhnnnhnnnhnhnnmo',
    '.........ohnnhhhnhhnnhnnnhnnnhnhnnmo',
    '.........ohnnhnhnhnnnhnnnhnnnhnhnnmo',
    '.........ohnnhnhnhhhnhhhnhhhnhhhnnmo',
    '.........ohnnnnnnnnnnnnnnnnnnnnnnnmo',
    '..........ommmmmmmmmmmmmmmmmmmmmmmo.',
    '...........oollllloooooooooooooooo..',
    '............olllo...................',
    '...oooooooooooooo...................',
    '..ohhhhhhhhhhhhhmo..................',
    '..ohldnnnnnnnndlmo..................',
    '..ohlnncnnnnnnnlmo..................',
    '..ohlnnncnnnnnnlmo..................',
    '..ohlnncnncccnnlmo..................',
    '..ohldnnnnnnnndlmo..................',
    '..ohllllllllGlalmommmmmmmmm.........',
    '..ommmmmmmmmmmmmmo.........m...GGGw.',
    '...oooooooooooooo...........mmmGGG..',
    '....omllllllllmo...............GGGw.',
    '....kkkkkkkkkkkk...............kkkk.',
  ],
  // Sparks off the dangling plug.
  decorate({ nx, ny, sw, lit }) {
    lit(nx + sw - 1, ny + 19, COLOR.amber, 0.7);
    lit(nx + sw + 1, ny + 21, COLOR.amber, 0.5);
    lit(nx + sw, ny + 23, COLOR.amber, 0.35);
  },
};

/** Load Balancer: one line splits three ways into three identical servers, packets evenly dealt.
 * A round robin supervises from the splitter. */
const BALANCER: SpriteDef = {
  rows: [
    '............ooooo...........oooooooooo',
    '...........ohhllmo..........ohhhhhhhmo',
    '..........ohlwnllaa.....ooooohlllllmmo',
    '........oohllrrrrmo....ooclllhnccnlhmo',
    '........odlllrrrrmo....ollooohlllllmmo',
    '........oomllrrrrmo...ooloo.ommmmmmmmo',
    '...........ooooooo...oolco..oooooooooo',
    '..........ooooooo...oocloo............',
    '.........ohhhhhhmo..olcoo...oooooooooo',
    'oooooooooohlllllmo.ooloo....ohhhhhhhmo',
    'hhhhhhhhhhhlnnnlmoooclooooooohlllllmmo',
    'lccllcclllllncnllllccllllccllhnccnlhmo',
    'mmmmmmmmmmmlnnnlmooollooooooohlllllmmo',
    'oooooooooohlllllmo.ooloo....ommmmmmmmo',
    '.........ommmmmmmo..olcoo...oooooooooo',
    '..........ooooooo...oocloo............',
    '.....................oollo..oooooooooo',
    '......................ooloo.ohhhhhhhmo',
    '.......................occooohlllllmmo',
    '.......................oollllhnccnlhmo',
    '........................ooooohlllllmmo',
    '............................ommmmmmmmo',
    '............................oooooooooo',
    '.............................kkkkkkkkk',
  ],
  // Traffic queues in from the left edge, brightening as it reaches the trunk.
  decorate({ nx, ny, lit }) {
    for (let gx = 0; gx < nx; gx++) if (gx % 3 !== 2) lit(gx, ny + 11, COLOR.cyan, 0.3 + 0.6 * gx / nx);
  },
};

/** Git Stash: an open treasure chest heaped with gold, for later. */
const STASH: SpriteDef = {
  shadeRight: true,
  rows: [
    '......oooooooooooooooooo......',
    '....oohhGhhhhhhhhhhhhGhhoo....',
    '...ohlllGllllllllllllGlllho...',
    '..ohllGnnnnnnnnnnnnnnnnGllho..',
    '..ohllGnnAAAAAAAAAAAAnnGllho..',
    '..ommmGnAAaaaaaaaaaaAAnGmmmo..',
    '..oooooooooooooooooooooooooo..',
    '..onnnnAaaaawaaaaaaaaaAnnnno..',
    '..onnAaaawaaAaaaaAaaawaaAnno..',
    '..oAaaAaawaaaAaaAaaaAawaaAao..',
    '.GGGGGGGGGGGGGGGGGGGGGGGGGGGG.',
    '.GwwwwwwwwwwwwwwwwwwwwwwwwwwG.',
    '.oooooooooooooooooooooooooooo.',
    '.oGhhllllllllGddGllllllllhhGo.',
    '.oGhlllllllllGddGlllllllllhGo.',
    '.oGhlmmmmmmmoGGGGommmmmmmlhGo.',
    '.oGhlllllllloGaaGollllllllhGo.',
    '.oGhlllllllloGnnGollllllllhGo.',
    '.oGhlmmmmmmmoGGGGommmmmmmlhGo.',
    '.oGhlllllllllGddGlllllllllhGo.',
    '.oGhlllllllllGddGlllllllllhGo.',
    '.oGmmmmmmmmmmGddGmmmmmmmmmmGo.',
    '.oooooooooooooooooooooooooooo.',
    '..kkkkkkkkkkkkkkkkkkkkkkkkkk..',
  ],
  // Gold glints rising out of the chest.
  decorate({ nx, ny, rnd, lit }) {
    for (let i = 0; i < 10; i++) lit(nx - 3 + Math.floor(rnd() * 36), ny + 1 + Math.floor(rnd() * 8), COLOR.amber, 0.25 + rnd() * 0.5);
  },
};

/** The Intern: a hand with one finger out, about to press the big red button; the safety cover is already flipped up. Has prod access. */
const INTERN: SpriteDef = {
  rows: [
    '.........ooooooooooooooooo...........',
    '.........oGwwwwwwwwwwwwGgo...........',
    '.........ooooooooooooooooo...........',
    '..........ohhhhhhhhhhhhmo............',
    '.......oooohllllllllllmmo............',
    '.......ohlohllllllllllmmo............',
    '.......ohmoohlmoohmohmohmo...........',
    '........oo.ohlmoolmolmolmo.oooooooooo',
    '...........ohlmo.oo.oo.oo..oGannaango',
    '...........ohlmo...........oGnnaanngo',
    '...........ohlmo..........oGnaannago.',
    '...........oGwGo..........oGaannaago.',
    '...........ommmo..........oGnnnnnngo.',
    '............ooo..........oGncnnnngo..',
    '.........................oGnncnnngo..',
    '.......ooooooooooooo.....oGnnncnngo..',
    '.....oorrwwwrrrrrrrRRo..oGnnnncngo...',
    '....orrrwwrrrrrrrrrrRRo.oGnnnnnngo...',
    '....orrrrrrrrrrrrrrrRRo.oGnnnnnngo...',
    '....orrrrrrrrrrrrrrRRRooooooooooo....',
    '...oGGGGGGGGGGGGGGGGGGgooGGGGGo......',
    '.ohhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhho.',
    '.oaaannnaaannnaaannnaaannnaaannnaaao.',
    '.ooooooooooooooooooooooooooooooooooo.',
  ],
  // A nervous tremble either side of the fingertip, and nobody around to stop it.
  decorate({ nx, ny, lit, glyphs }) {
    glyphs('!', nx + 2, ny + 8, COLOR.red, 0.9);
    for (const [x, y, a] of [[9, 11, 0.7], [8, 13, 0.45], [17, 11, 0.7], [18, 13, 0.45]]) lit(nx + x, ny + y, COLOR.amber, a);
  },
};

/** Rubber Duck: a classic debugging duck in side profile, amber bill shut. Its speech bubble offers only "...". */
const DUCK: SpriteDef = {
  rows: [
    '.......oooooooo.........',
    '.....oohhhhllmmoo.......',
    '....ohhhhlllllmmo.......',
    '...ohhllllllllllmo......',
    '...ohllllllnnnllmo......',
    '...ohllllllnwnllmo...ooo',
    '...ohllllllnnnllmooooaao',
    '...ohlllllllllllmoaaaaao',
    '...ohlllllllllllmoaaaaao',
    '....ohllllllllllmooooooo',
    '....ohllllllllllmoAAAo..',
    '....olllllllllllmoooo...',
    '.oo..olllllllllllmo.....',
    'ohmo.ohhlllllllllllmo...',
    'ohlmoohhhhlllllllllmo...',
    'ohllhhhhhllllllllllllmo.',
    'ohlllllooooooolllllllmo.',
    'ohlllollmmmmmooollllmmo.',
    'omlllloddddddddolllllmmo',
    'omlllllooooooooollllmmo.',
    '.omlllllllllllllllllmo..',
    '..ommmmmmmmmmmmmmmmo....',
    '....oooooooooooooo......',
    '.....kkkkkkkkkkkkkkk....',
  ],
  decorate({ nx, ny, lit }) {
    const left = nx + 19, right = nx + 27, top = ny - 1, bottom = ny + 3;
    for (let x = left + 1; x < right; x++) {
      lit(x, top, COLOR.cyan, 0.55);
      lit(x, bottom, COLOR.cyan, 0.55);
    }
    for (let y = top + 1; y < bottom; y++) {
      lit(left, y, COLOR.cyan, 0.55);
      lit(right, y, COLOR.cyan, 0.55);
    }
    lit(left + 1, bottom + 1, COLOR.cyan, 0.55);
    for (const dx of [2, 4, 6]) lit(left + dx, ny + 1, COLOR.cyan, 0.95);
  },
};

/** Bug Bounty: a torn WANTED poster with a red-eyed beetle's mugshot, pinned up beside the amber coin it pays out. */
const BOUNTY: SpriteDef = {
  rows: [
    '...............gGg......................',
    '.ooooooooooooooGwGooooooooooooo.........',
    '.olllllllllllllgGgllllllllllllo.........',
    '.olnnnnnnnnnnnnnnnnnnnnnnnnnndok........',
    '.olhnnnhnnhnnhnnhnhhhnhhhnhhndok........',
    '.olhnnnhnhnhnhhnhnnhnnhnnnhnhdok........',
    '.olhnhnhnhhhnhnhhnnhnnhhnnhnhdok........',
    '.olhhnhhnhnhnhnnhnnhnnhnnnhnhdok........',
    '.olhnnnhnhnhnhnnhnnhnnhhhnhhndok........',
    '.olnnnnnnnnnnnnnnnnnnnnnnnnnndok........',
    '.olnnnnnnnnnnnnnnnnnnnnnnnnnndok........',
    '.olnnnhnnnnhnnnnnnnnnnnnnnnnndooooo.....',
    '.olnnnnhnnnhnnnnnnnnnnnnnnnnooaaaaaoo...',
    '.olnnnnnhnnhnnnoooooooonnnnoaaAAAAAaao..',
    '.olnnnnnoooonnollhhllmmonnoaAwAAAAAAAao.',
    '.olnnnnohhllooolhhlllmmmonoawAAAaAAAAao.',
    '.olnnnohwrllolhlllllmmlmooaAwAAaaaaAAAao',
    '.olnnnolrrllollllllmmlmmooaAAAaAaAAAAAao',
    '.olnnnolllmmolllllmmlmmmooaAAAAaaaAAAAao',
    '.olnnnnooooooommmmmmmmoonoaAAAAAaAaAAAao',
    '.olnnnnnhnnhnnnnnhnnnhnnnoaAAAaaaaAAAAao',
    '.olnnnnhhnhhnnnnhhnnhhnnnnoaAAAAaAAAAao.',
    '.olnnddndndnnddndnddnndnddoaAAAAAAAAAao.',
    '.ooddoodododdoododooddodoodoaaAAAAAaao..',
    '.o.oo.ko.o.oo.ko.o.koo.o.ko.ooaaaaaoo...',
    '..k.kk..k.k.kk..k.k..kk.k..k.kooooo.....',
  ],
  // A few amber glints coming off the coin.
  decorate({ nx, ny, rnd, lit }) {
    for (let i = 0; i < 5; i++) {
      const x = nx + 32 + Math.floor(rnd() * 9), y = ny + 5 + Math.floor(rnd() * 7);
      lit(x, y, COLOR.amber, 0.25 + rnd() * 0.45);
    }
  },
};

/** Cron Job: a round wall clock at 3:00, the traditional hour for scheduled jobs to go wrong,
 * with a dotted orbit coming back around and shedding +1s. */
const CRON: SpriteDef = {
  rows: [
    '..........ooooooo..........',
    '........ooolhlllooo........',
    '......oohhhhhlllllloo......',
    '.....olhhllooooolllllo.....',
    '....ohhllooonhnooollllo....',
    '...ohhloonnnnhnnnnoolllo...',
    '..olhloonlnnnnnnnlnoolllo..',
    '..ohloonnnnnnhnnnnnnoollo..',
    '.ohhlonnnnnnhhlnnnnnnollmo.',
    '.ohlonlnnnnnhhlnnnnnlnommo.',
    'oohlonnnnnnnhhlnnnnnnnommoo',
    'olhoonnnnnnnhhlnnnnnnnoommo',
    'ohhonnnnnnnnnalhhhnnnnnommo',
    'ollohhnnnnnnaaahhhhnnhhommo',
    'ollonnnnnnnnnanmmmnnnnnommo',
    'olloonnnnnnnnnnnnnnnnnoommo',
    'oollonnnnnnnnnnnnnnnnnoddoo',
    '.ollonlnnnnnnnnnnnnnlnoddo.',
    '.olllonnnnnnnnnnnnnnnodddo.',
    '..olloonnnnnnnnnnnnnooddo..',
    '..ollloonlnnnnnnnlnoodddo..',
    '...ollloonnnnhnnnnoodddo...',
    '....ollllooonhnoooddddo....',
    '.....olllmmooooodddddo.....',
    '......oommmmmmmmdddoo......',
    '........ooommmmmooo........',
    '..........ooooooo..........',
    '.....kkkkkkkkkkkkkkkkk.....',
  ],
  decorate({ sw, nx, ny, pal, lit, glyphs }) {
    const cx = nx + (sw - 1) / 2, cy = ny + 13;
    for (let i = 0; i < 40; i += 2) {
      const a = -0.5 + (i / 40) * Math.PI * 1.15;
      lit(Math.round(cx + Math.cos(a) * 17), Math.round(cy + Math.sin(a) * 15.5), pal.l, 0.15 + (1 - i / 40) * 0.55);
    }
    for (const [x, y, alpha] of [[nx + sw + 7, ny + 7, 0.9], [nx + sw + 12, ny, 0.4]]) {
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) lit(x + dx, y + 2 + dy, COLOR.amber, alpha);
      glyphs('1', x + 3, y, COLOR.amber, alpha);
    }
  },
};

/** Backup: a cassette-style data tape labeled BACKUP, two spools in the window, with almost all the tape still on the left. */
const BACKUP: SpriteDef = {
  rows: [
    '.ooooooooooooooooooooooooooooooooooooo.',
    'oohhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhoo',
    'ohldooooooooooooooooooooooooooooooodlmo',
    'ohldoohhoooohooohhhoohohoohohoohhoollmo',
    'ohldoohohoohohoohoooohohoohohoohohollmo',
    'ohldoohhooohhhoohoooohhooohohoohhoollmo',
    'ohldoohohoohohoohoooohohoohohoohooollmo',
    'ohldoohhooohohoohhhoohohoohhhoohooollmo',
    'ohldlllllllllllllllllllllllllllllllllmo',
    'ohldmooooooooooooooooooooooooooooomllmo',
    'ohldmonnnnmmmmmmmnnnnnnnnnnnnnnnnomllmo',
    'ohldmonnnmlldmddmmnnnnnnnndddnnnnomllmo',
    'ohldmonnmldmGGGmdmmnnnnnddGGGddnnomllmo',
    'ohldmonnmdmGGwGGmdmnnnnndGGwGGdnnomllmo',
    'ohldmonnmdGGnnnGGdmnnnndGGnnnGGdnomllmo',
    'ohldmonnmmGwnnnwGmmnnnndGwnnnwGdnomllmo',
    'ohldmonnmdGGnnnGGdmnnnndGGnnnGGdnomllmo',
    'ohldmonnmdmGGwGGmdmnnnnndGGwGGdnnomllmo',
    'ohldmonnmmdmGGGmdmmnnnnnddGGGddnnomllmo',
    'ohldmonnnmmddmddmmddddddnndddnnnnomllmo',
    'ohldmooooooooooooooooooooooooooooomllmo',
    'ohldlllllllllllllllllllllllllllllllllmo',
    'ohlllllllllooooooooooooooooolllllllllmo',
    'ohllllllllommmnmmmnnnmmmnmmmollllllllmo',
    'oommmmmmmommmmnmmmnnnmmmnmmmmommmmmmmoo',
    '.ooooooooooooooooooooooooooooooooooooo.',
    '..kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk..',
  ],
  // Rewind chevrons on the left, stray bits drifting back in from the right.
  decorate({ gw, gh, sw, nx, ny, rnd, pal, lit }) {
    const cy = ny + 15;
    for (let i = 0; i < 3; i++) {
      const x = nx - 4 - i * 4, a = 0.9 - i * 0.28;
      for (let d = 0; d < 3; d++) { lit(x + d, cy - d, COLOR.cyan, a); lit(x + d, cy + d, COLOR.cyan, a); }
    }
    for (let x = nx + sw + 2; x < gw - 1; x += 3) {
      const t = (x - nx - sw) / (gw - nx - sw);
      if (rnd() < 0.8) lit(x, cy - 4 + Math.floor(rnd() * 9), pal.l, 0.75 - t * 0.55);
      if (rnd() < 0.3) lit(x + 1, Math.floor(rnd() * gh), pal.d, 0.45);
    }
  },
};

/** RAID Array: four identical drives on one backplane, three writing the same A1 and one gone dark with a red LED. */
const RAID: SpriteDef = {
  rows: [
    '.......................................',
    '.......................................',
    '.......................................',
    '.......................................',
    '.......................................',
    '.......................................',
    'ooooooooo.ooooooooo.ooooooooo.ooooooooo',
    'ommmmmmdo.ommmmmmdo.oddddddoo.ommmmmmdo',
    'oddhhhddo.oddhhhddo.onnmmmnno.oddhhhddo',
    'odhhhhldo.odhhhhldo.onmmmmdno.odhhhhldo',
    'ohhhnllmo.ohhhnllmo.ommmndddo.ohhhnllmo',
    'ohhnnnlmo.ohhnnnlmo.ommnnnddo.ohhnnnlmo',
    'ohhlnlmmo.ohhlnlmmo.ommdndddo.ohhlnlmmo',
    'odhllmmdo.odhllmmdo.onmddddno.odhllmmdo',
    'oddmmmddo.oddmmmddo.onndddnno.oddmmmddo',
    'odddddddo.odddddddo.onnnnnnno.odddddddo',
    'oncncnhno.oncncnhno.onrrnnnno.oncncnhno',
    'oncncnhno.oncncnhno.onrrnnnno.oncncnhno',
    'ollllllmo.ollllllmo.oddddddoo.ollllllmo',
    'ooooooooo.ooooooooo.ooooooooo.ooooooooo',
    '..oGGGo.....oGGGo.....oGGGo.....oGGGo..',
    'ooooooooooooooooooooooooooooooooooooooo',
    'ohhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhmo',
    'olmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmdo',
    'ooooooooooooooooooooooooooooooooooooooo',
    '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
  ],
  decorate({ nx, ny, glyphs }) {
    [0, 10, 30].forEach((x) => glyphs('A1', nx + x + 1, ny, COLOR.cyan, 0.85));
    glyphs('!', nx + 23, ny, COLOR.red, 0.95);
  },
};

/** Container: a translucent plastic leftovers tub with a snap-on tabbed lid and masking-tape label, a tiny program glowing among the leftovers. */
const CONTAINER: SpriteDef = {
  rows: [
    '......oooooooooooooooooooooooooooo......',
    '....oohhhhhhhhhhhhhhhhhllllllllllloo....',
    '...ohhllmmmmmmmmmmmmmmmmmmmmmmmmlllmo...',
    '...ohhllhhhhhhhhhhhhhllllllllllllllmo...',
    '.oooooooooooooooooooooooooooooooooooooo.',
    'ohohhhhhhhhhhhhhhhhllllllllllllllllllolo',
    'olommmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmodo',
    '.oooooooooooooooooooooooooooooooooooooo.',
    '....ohdddddddddohhhhlllmodddddddddmo....',
    '....ohddddddddddollllmmodddmddmdddmo....',
    '....ohddddhddldddoooooodddddddddddmo....',
    '....ohdddhddlddddddddddddcccccccddmo....',
    '.....ohdlddldddddddmdddddcnnnnncdmo.....',
    '.....ohdddlddddddddddmdddcncnnncdmo.....',
    '.....ohddddddddddddddddmmcnncnncdmo.....',
    '.....olmddddmmddddddddmllcncnwwcmmo.....',
    '.....ollmwwwwwwwwwwddmlllccccccclmo.....',
    '......ollwGwGGwGwGwmmlllhlllllalmo......',
    '......olawwwwwwwwwwlllllllllalllmo......',
    '......olllllallllalllhlllallllllmo......',
    '......olallllAlhllllllallllAlhllmo......',
    '.......oommmmmmmmmmmmmmmmmmmmmmoo.......',
    '.........oooooooooooooooooooooo.........',
    '........kkkkkkkkkkkkkkkkkkkkkkkk........',
  ],
  // A few stray bits rising off the leftovers. Nobody knows how old they are.
  decorate({ gw, nx, ny, sw, sh, rnd, lit }) {
    for (let i = 0; i < 8; i++) {
      const side = i % 2, x = side ? nx + sw + 1 + Math.floor(rnd() * Math.max(1, gw - nx - sw - 2)) : Math.floor(rnd() * Math.max(1, nx - 1));
      lit(x, ny + Math.floor(rnd() * (sh - 2)), i % 3 ? COLOR.green : COLOR.cyan, 0.2 + rnd() * 0.3);
    }
  },
};

/** Cloud Compute: a puffy cloud with a server rack in its belly, raining binary. There is no cloud. */
const CLOUD: SpriteDef = {
  rows: [
    '...............oooooooo...............',
    '.............oohhhhhhhhoo.............',
    '............ohhhhllllllhho............',
    '...........ohhhllllllllllho...........',
    '......oooo.ohhllllllllllllho..........',
    '....oohhhhohhllllllllllllllo..........',
    '...ohhhhllmlhllllllllllllllmo.ooooo...',
    '..ohhhlllllmooooooooooooooolo.ohhhho..',
    '.ohhhllllllmoGGGGGGGGGGGGGollohhlllho.',
    'ohhhllllllllogcgagggGoGoGgollmlhllllho',
    'ohhlllllllllooooooooooooooolmlllllllmo',
    'ohlllllllllloGGGGGGGGGGGGGolllllllllmo',
    'ohllllllllllogagggcgGoGoGgollllllllmmo',
    '.ohlllllllllooooooooooooooolllllllmmo.',
    '..ohmllllllloGGGGGGGGGGGGGollllmmmmo..',
    '...ooommmmmmogcgcgggGoGoGgommmmmooo...',
    '......oooooooooooooooooooooooooo......',
    '......................................',
    '.......h...........h...........h......',
    '......hh..........hh..........hh......',
    '.......h...........h...........h......',
    '.......h....lll....h....lll....h......',
    '......hhh...l.l...hhh...l.l...hhh.....',
    '............l.l.........l.l...........',
    '............l.l.........l.l...........',
    '............lll.........lll...........',
  ],
  // The rain keeps falling, fading out toward the bottom of the art.
  decorate({ nx, ny, pal, glyphs }) {
    glyphs('0', nx + 6, ny + 24, pal.l, 0.5);
    glyphs('1', nx + 18, ny + 24, pal.l, 0.5);
    glyphs('0', nx + 30, ny + 24, pal.l, 0.5);
    glyphs('1', nx + 12, ny + 27, pal.l, 0.25);
    glyphs('1', nx + 24, ny + 27, pal.l, 0.25);
  },
};

/** Sudo: a plain deli ham sandwich on square sliced bread, seen three-quarter. */
const SUDO: SpriteDef = {
  // Blank rows hold the pixel size: the sprite's height sets its scale.
  rows: [
    '..................................',
    '..................................',
    '..................................',
    '..................................',
    '..................................',
    '....oooooooooooooooooooooooooooooo',
    '...ohhhhhhhhhhhhhhhhhhhhhhhhhhhhoo',
    '..ohllllllllhllllllllhllllllllhodo',
    '.ohlllllhllllllllhllllllllhllloddo',
    '.ooooooooooooooooooooooooooooooddo',
    '.olllllllllllllllllllllllllllloddo',
    '.oddddddddddddddddddddddddddddoddo',
    '.oaaaaaaaaaaaaaaaaaaaaaaaaaaaaoAAo',
    'orwrwrwwRRRRwwwrwrwwRRRRRwrRrroRRo',
    'oRRwwwwwRRrrrwRRwwwwwRrrrwrRRRorro',
    'owrwrwwRRRRwwwrwrwwRRRRRwrRrwroRRo',
    '.ooooooooooooooooooooooooooooooddo',
    '.olllllllllllllllllllllllllllloddo',
    '.oddddddddddddddddddddddddddddodo.',
    '.ooooooooooooooooooooooooooooooo..',
    '...kkkkkkkkkkkkkkkkkkkkkkkkkkkkk..',
    '..................................',
    '..................................',
    '..................................',
    '..................................',
  ],
  // A few crumbs, escalating.
  decorate({ nx, ny, sw, lit }) {
    for (const [x, y, a] of [[-3, 10, 0.7], [-5, 15, 0.4], [sw + 2, 8, 0.7], [sw + 4, 14, 0.4], [2, 3, 0.4]]) lit(nx + x, ny + y, COLOR.cyan, a);
  },
};

/** Orchestrator: a tailcoated conductor seen from behind on a podium, both arms raised, baton up, notes in the air. */
const ORCHESTRATOR: SpriteDef = {
  rows: [
    '.......................................w',
    '..oo............ooooo............oo..ww.',
    '.oGGoo.........oGwwwGo.........ooGwww...',
    '.oGGGwo.......oGwwwwwGo.......owGGGo....',
    '..oGGwwoo.....oGwwwwwGo.....oowwGGo.....',
    '...oowwwmo....oGwwwwwGo....omwwwoo......',
    '.....owmmmoo...oGGGGGo...oommmwo........',
    '..c...ommmmmooooowwwooooommmmmo.........',
    '..c....ohlmmmmmmmmmmmmmmmmmmdo..........',
    '.cc.....oohlmmmmmmmmmmmmmmdoo...........',
    '..........ohlmmmmmmmmmmmmdo.............',
    '...........ohlmmmmdmmmmmdo..............',
    '............ohlmmmdmmmmdo...............',
    '............ohlmmmdmmmmdo.........cc....',
    '.ccc........ohlmmmdmmmmdo.........c.....',
    '.c.c.......ohlmmmmdmmmmmdo.......cc.....',
    'cc.c.......ollllllommmmmmo.......cc.....',
    'cc.c.......olllllo.ommmmmo..............',
    '............oldddo.odddmo...............',
    '.............odddo.odddo................',
    '.............odddo.odddo................',
    '.........ooooooooooooooooooo............',
    '.........ohhhhhhhhhlllllllmo............',
    '.........ooooooooooooooooooo............',
  ],
};

/** Brute Force: three big keycaps, A, B and C, with the middle one getting hammered flat. aaaa. aaab. aaac. */
const CROWBAR: SpriteDef = {
  rows: [
    '...................................',
    '...................................',
    '...................................',
    '...................................',
    '.ooooooooo...............ooooooooo.',
    'ohhhhhhhhho.............ohhhhhhhhho',
    'ohhhhhhhhdo.............ohhhhhhhhdo',
    'ohmmwwmmmdo..ooooooooo..ohwwwwwwmdo',
    'ohwwmmwwmdo.ohhhhhhhhho.ohwwmmmmmdo',
    'ohwwmmwwmdo.ohhhhhhhhdo.ohwwmmmmmdo',
    'ohwwwwwwmdo.ohwwwwmmmdo.ohwwmmmmmdo',
    'ohwwmmwwmdo.ohwwmmwwmdo.ohwwmmmmmdo',
    'ohwwmmwwmdo.ohwwmmwwmdo.ohwwmmmmmdo',
    'ohwwmmwwmdo.ohwwwwmmmdo.ohwwwwwwmdo',
    'ohmmmmmmmdo.ohwwmmwwmdo.ohmmmmmmmdo',
    'ohmmmmmmmdo.ohwwmmwwmdo.ohmmmmmmmdo',
    'ommmmmmmmmo.ohwwwwmmmdo.ommmmmmmmmo',
    'odddddddddo.ohmmmmmmmdo.odddddddddo',
    'odddddddddo.ohmmmmmmmdo.odddddddddo',
    'odddddddddo.ommmmmmmmmo.odddddddddo',
    'ooooooooooo.odddddddddo.ooooooooooo',
    '............ooooooooooo............',
    'GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
    'ggggggggggggggggggggggggggggggggggg',
  ],
  // Impact burst off the struck key.
  decorate({ nx, ny, lit }) {
    const cx = nx + 17, cy = ny + 5;
    for (const [dx, dy, a] of [[0, -3, 1], [-3, -2, 0.9], [3, -2, 0.9], [-5, 0, 0.8], [5, 0, 0.8], [-2, -1, 0.7], [2, -1, 0.7], [0, -1, 0.95]]) lit(cx + dx, cy + dy, dy === -1 ? COLOR.white : COLOR.amber, a);
    for (const [dx, dy] of [[-4, -3], [4, -3], [-1, -2], [1, -2]]) lit(cx + dx, cy + dy, '#ff6a2a', 0.8);
  },
};

/** Worm: a segmented worm squeezing out of an Ethernet wall jack and grinning,
 * while a smaller copy of itself buds off its back. */
const WORM: SpriteDef = {
  rows: [
    '.................o......................',
    '...............ooloo..........ooooooo...',
    '..............owwlwwo........ohllllllo..',
    '..............owwlwwo.......ohhwwwlwwwo.',
    'GGGGGGGGGGGGGGollllmo.......ohhwwnlwwnmo',
    'GGggggggggggGGoonnnooo.....olllwwnlwwnmo',
    'GggggggggggggG.ooooolo.....olllwwwlwwwmo',
    'GgkaAaAaAaAkgG....olloo....olllllllllmmo',
    'GgkAkAkAkAkkgG....oooolo....ollnllllnmmo',
    'GgkkkkkkkkkkgG.....olllo....olllnnnnmmoo',
    'GgkkkkkkkkkkgG.....ollmoo..ooollllmmmmo.',
    'GgkkkkoooookgG......oooloo.oloommmmmmo..',
    'GgkkkkohllokgG......ollllooollloooooo...',
    'Ggkkkolllloooo......oolooohoollllmoo....',
    'Ggkkkolllohllloooo.oooollollollmmmo.....',
    'Ggkkkkololhlloolloollohhlolllooooo......',
    'Ggkkkkooolllolhllohhlolllolllllmo.......',
    'Gggggkkkolllolllolhlollllollllmmo.......',
    'Gggggkkkkollolllollllolllloommoo........',
    'Ggggggggggooolllollllollllmoooo.........',
    'GGggggggggggGollolllllommmmo............',
    'GGGGGGGGGGGGGooooolmmmmoooo.............',
    '..............kkkkoooookkkkkkkkkkkkkkkk.',
    '.................kkkkkkkkkkkkkkkkkkk....',
  ],
  // Copied packets drifting up from the bud.
  decorate({ nx, ny, sw, rnd, pal, lit }) {
    for (let i = 0; i < 7; i++) {
      const x = nx + Math.floor(rnd() * sw), y = Math.max(0, ny - 2) + Math.floor(rnd() * 8);
      lit(x, y, rnd() < 0.5 ? COLOR.cyan : pal.l, 0.2 + rnd() * 0.4);
    }
  },
};

/**
 * SQL Injection: a syringe of cyan payload driven into the middle disc of a
 * stacked-cylinder database, with the obligatory comment-out in the corner.
 */
const SQLI: SpriteDef = {
  rows: [
    '...c......................oooooooooo....',
    '...c.c.................ooohhhhhhhhhlooo.',
    '.......ccc.ccc........ohhhhhhhhhhhhllllo',
    '.....c................ohhhhhhhhhhhhllllo',
    '.....c................ohhhhhhhhhhhhllllo',
    '......................oooohhhhhhhhhloooo',
    '.....oo...............omhhoooooooooomddo',
    'oo...hm...............omhhhllllllmnmnddo',
    'hl...hmoooooooo.......omhhhllllllmmmmddo',
    'hl...hmhdhdhdhdo......omhhhllllllmmmmddo',
    'hl...hmllllllllGo.....oooohllllclmmmoooo',
    'hlooohmnlmwwwwcGg.....omhhooocooocoomddo',
    'hllllhmllmcccccGgwwwwwwwwwwwcccllmmmmddo',
    'hlooohmnlmcccccGg.....omhhhllclllmmmmddo',
    'hl...hmmmmmmmmmGo.....omhhhlllllcmmmmddo',
    'hl...hmddddddddo......oooohllllllmmmoooo',
    'hl...hmoooooooo.......omhhoooooooooomddo',
    'oo...hm...............omhhhllllllmnmnddo',
    '.....oo...............omhhhllllllmmmmddo',
    '......................omhhhllllllmmmmddo',
    '.......................ooohllllllmmmooo.',
    '..........................oooooooooo....',
    '........................kkkkkkkkkkkkkk..',
  ],
  // A drip off the needle.
  decorate({ nx, ny, lit }) {
    for (let i = 0; i < 3; i++) lit(nx + 20, ny + 14 + i * 2, COLOR.cyan, 0.8 - i * 0.25);
  },
};

/** Keylogger: a front-on keyboard with one wide eye rising out of its top edge, reading along as seven asterisks go by. All it sees is *******. */
const KEYLOGGER: SpriteDef = {
  rows: [
    '............oooooooooooo............',
    '..........oooddmmmmmmddooo..........',
    '........oomlhhhhhhhhhhllmdoo........',
    '......omloooooooooooooooooomdo......',
    '.....omowwwwwwccccccccwwwwwwodo.....',
    '...omowwwwwwwcccnwnncccwwwwwwwodo...',
    '...omowwwwwwwcccnnnncccwwwwwwwodo...',
    '.....omowwwwwcccnnnncccwwwwwodo.....',
    '.......omowwwwccnnnnccwwwwodo.......',
    '.........oommmmmmmmmmmmmmoo.........',
    '.oooooooooooooooooooooooooooooooooo.',
    'omhhlohhlohhlohhlohhlohhlohhlohhlodo',
    'omllmollmollmollmollmollmollmollmodo',
    'omoooooooooooooooooooooooooooooooodo',
    'omhhhhlohhlohhlohhlohhlohhlohhhhlodo',
    'omllllmollmollmollmollmollmollllmodo',
    'omoooooooooooooooooooooooooooooooodo',
    'omhhhhhlohhlohhlohhlohhlohhlohhhlodo',
    'omlllllmollmollmollmollmollmolllmodo',
    'omoooooooooooooooooooooooooooooooodo',
    'omhhlohhlohhhhhhhhhhhhhhlohhlohhlodo',
    'omllmollmollllllllllllllmollmollmodo',
    '.oooooooooooooooooooooooooooooooooo.',
    '..kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk..',
  ],
  // hunter2, as the eye reads it: three asterisks to the left, four to the right.
  decorate({ nx, ny, lit }) {
    const y = ny + 1;
    for (const x of [nx - 3, nx + 1, nx + 5, nx + 28, nx + 32, nx + 36, nx + 40]) {
      for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) lit(x + dx, y + dy, COLOR.cyan, 0.65);
    }
  },
};

/** Buffer Overflow: a mug rated for 16 bytes, buried under a heap of As spilling over the rim. */
const OVERFLOW: SpriteDef = {
  rows: [
    '....................................',
    '...............h...a...l...m........',
    '..............h.h.a.a.l.l.m.m.......',
    '..............hhh.aaa.lll.mmm.......',
    '.....l........h.h.a.a.l.l.m.m.......',
    '....l.l.......h.h.a.a.l.l.m.m.......',
    '....lll......l...h...l...h..........',
    '....l.l.....l.l.h.h.l.l.h.h.ooo.....',
    '....l.looo..lll.hhh.lll.hhhoohoo....',
    '......oohoo.l.l.h.h.l.l.h.hohoho....',
    '......ohoho.l.l.h.h.l.l.h.hohhho....',
    '......ohhhohhhhhhhhhhhhhhhmohoho....',
    '......ohohoooooooooooooooooohoho....',
    '...l..ohohohhlllllllllllmdoooooo....',
    '..l.l.ooooohhlllllllllllmdollllo....',
    '..lll.....ohhllllnllnnnlmdoooolo....',
    '..l.l.....ohhlllnnllnlllmdo..olo....',
    '..l.l.....ohhllllnllnnnlmdo..olo....',
    '...m...l..ohhllllnllnlnlmdoooomo....',
    '..m.m.l.l.ohhlllnnnlnnnlmdommmmo....',
    '..mmm.lll.ohhlllllllllllmdooooo.....',
    '..m.m.l.l.ollmmmmmmmmmmmmmo.........',
    '..m.m.l.l.ooooooooooooooooo.........',
    '.kkkkkkkkkkkkkkkkkkkkkkkkkkk........',
  ],
  // The bytes that no longer fit, tumbling off the right side of the rim.
  decorate({ nx, ny, pal, glyphs }) {
    glyphs('A', nx + 34, ny + 5, pal.l, 0.7);
    glyphs('A', nx + 37, ny + 13, pal.l, 0.45);
    glyphs('A', nx + 40, ny + 20, pal.l, 0.25);
  },
};

/** Logic Bomb: a round cartoon bomb, fuse lit, its body-mounted countdown down to 0:01. */
const BOMB: SpriteDef = {
  rows: [
    '..................oo...aAAa.......',
    '.................oGGo.a....a......',
    '................oGGGGo......A.....',
    '.........oooooooGGGGGGoo.....a.f..',
    '.......oolllllllooGGGGggo.....faf.',
    '.....oolllllllllllooGggggo...fawwf',
    '....olllhlllllllllllogggo.....faa.',
    '...olllhhhlllllllllllogo.......f..',
    '...ollhhhlllllllllllloo...........',
    '..ollhhlllllllllllllllo...........',
    '..olhhhlllllllllllllllo...........',
    '.ollhhlllllllllllllllllo..........',
    '.olllGGGGGGGGGGGGGGGllmo..........',
    '.olllnnnnnnnnnnnnnnnmmmo..........',
    '.olllnrrrnnnrrrnnrnnmmmo..........',
    '.olllnrnrnrnrnrnrrnnmmmo..........',
    '.olllnrnrnnnrnrnnrnnmmmo..........',
    '.olllnrnrnrnrnrnnrnnmddo..........',
    '..ollnrrrnnnrrrnrrrnddo...........',
    '..ollnnnnnnnnnnnnnnnddo...........',
    '...olgggggggggggggggdo............',
    '...ollllllmmmmmmdddddo............',
    '....ollllmmmmmmdddddo.............',
    '.....oolmmmmmmddddoo..............',
    '.......oommmmdddoo................',
    '.........ooooooo..................',
    '.......kkkkkkkkkkk................',
  ],
  // Embers shaken loose from the spark, drifting away from the body.
  decorate({ nx, ny, rnd, lit }) {
    for (let i = 0; i < 8; i++) {
      const a = (-80 + rnd() * 140) * Math.PI / 180, d = 4 + rnd() * 6;
      lit(nx + 31 + Math.round(Math.cos(a) * d), ny + 5 + Math.round(Math.sin(a) * d), i % 3 ? COLOR.amber : COLOR.orange, 0.3 + rnd() * 0.5);
    }
  },
};

/** Social Engineering: an old telephone handset on a coiled cord, its voice rolling out in waves. */
const PHONE: SpriteDef = {
  rows: [
    '.........oooooooooo...................',
    '........ohhhllllmGGo..................',
    '........ohhlllllmGGo..................',
    '........ohlllllmmnGo..................',
    '.......ohhlllllmGGo...................',
    '.......ohhlllllmGGo...................',
    '.......ohlllllmmnno...................',
    '.......ohlllllmGGo....................',
    '.......ohlllllmGGo....................',
    '........ohmmllmnno....................',
    '.ooo....ohmddmGGo.....................',
    'ohlmo...ohhdooGGo.....................',
    'ohlmo....ohmdooo......................',
    'ooooo....ohldo...............ooo......',
    'ohlmo....ohllo............oooGGGo.....',
    'ohlmo.....olllo........ooonGGnGGo.....',
    'ooooo.....ohlllo.....oonGGnGGllmo.....',
    'ohlmo......ollllo...oGGnGGlllllmdo....',
    'ohlmo.......ollllo..oGGllllllllmdo....',
    'ooooo.......ohlllloooolllllllllmdo....',
    'ohlmo........oomllllllllllllllmmdo....',
    'ohlmo..........odmmmmmmllllllmmddo....',
    'ooooo...........ooddmmmlllmmmmddo.....',
    'ohlmoooooooooooooooooddmmmmmddddo.....',
    '.ohhohhohhohhohhohhohhoodddddooo......',
    '.ommommommommommommommooooooo.........',
    '.oooooooooooooooooooooo...............'
  ],
  // Arcs roll out from the crook of the handset, fading with distance.
  decorate({ nx, ny, lit }) {
    const cx = nx + 20, cy = ny + 9;
    for (const [r, a] of [[5, 0.95], [9, 0.6], [13, 0.3]]) {
      for (let t = -1.2; t <= 0.05; t += 0.04) {
        lit(Math.round(cx + r * Math.cos(t)), Math.round(cy + r * Math.sin(t)), COLOR.cyan, a);
      }
    }
  },
};

/** Ransomware: a taped-up ransom note, its demand PAY BTC spelled in mismatched cut-out letter blocks. */
const RANSOM: SpriteDef = {
  rows: [
    '...............gggggggg...............',
    '...............gGGGGGGg...............',
    '..ooooooooooooogGGGGGGgooooooooooooo..',
    '..ohhhhhhhhhhhhgggggggghhhhhhhhhhhho..',
    '..ohllllllllllllllllllllllllllllllmok.',
    '..ohllnnnnnnnllddddddlllllllllllllmok.',
    '..ohlnhhhhnnnoldddhdddollgggggggllmok.',
    '..ohlnhhnhhnnolddhdhddollgwgggwggomok.',
    '..ohlnhhnhhnnolddhdhddollgwgggwggomok.',
    '..ohlnhhhhnnnoldhdddhdollggwgwgggomok.',
    '..ohlnhhnnnnnoldhhhhhdollggwgwgggomok.',
    '..ohlnhhnnnnnoldhdddhdollgggwggggomok.',
    '..ohlnhhnnnnnoldhdddhdollgggwggggomok.',
    '..ohlnnnnnnnnoldddddddollgggwggggomok.',
    '..ohlloooooooollooooooollggggggggomok.',
    '..ohllooooooollwwwwwwwwllloooooooomok.',
    '..ohlloaaaaooolwnnnnnnwollnnnnnnnlmok.',
    '..ohlloaoooaoolwnnnnnnwollnnllllnomok.',
    '..ohlloaoooaoolwwwnnwwwollnllnnnnomok.',
    '..ohlloaaaaooolwwwnnwwwollnllnnnnomok.',
    '..ohlloaoooaoolwwwnnwwwollnllnnnnomok.',
    '..ohlloaoooaoolwwwnnwwwollnllnnnnomok.',
    '..ohlloaaaaooolwwwnnwwwollnllnnnnomok.',
    '..ohlllooooooolwwwwwwwwollnnllllnomok.',
    '..ohmooooooooommooooooooomnnnnnnnomok.',
    '..ooo..oooo.oooo...ooooo.oooooooooook.',
    '....k..kkkk.kkkk...kkkkk.kkkk..kk.kkk.',
  ],
  decorate({ gw, gh, rnd, lit }) {
    for (let i = 0; i < 12; i++) {
      lit(Math.floor(rnd() * gw), Math.floor(rnd() * gh), COLOR.amber, 0.2 + rnd() * 0.3);
    }
  },
};

/** Man-in-the-Middle: a hooded figure in shades, smirking, holding the two cut ends of a wire apart with a spark between them. */
const MITM: SpriteDef = {
  rows: [
    '..............ooooooooooo..............',
    '............oohhhlllmmmmmoo............',
    '...........ohhllllllmmmmmmmo...........',
    '..........ohhlllllllmmmmmmmmo..........',
    '..........ohlllnnnnnnnnnmmmmo..........',
    '.........ohllnnnnnnnnnnnnnmmmo.........',
    '.........ohlnnnnnnnnnnnnnnnmmo.........',
    '.........ohlnGGGGGGgGGGGGGnmmo.........',
    '.........ohlnGwgggGnGgggwGnmmo.........',
    '.........ohlnnGGGGnnnGGGGnnmmo.........',
    '.........ohlnnnnnnnnnnnwnnnmmo.........',
    '.........ohllnnnwwwwwwwnnnmmmo.........',
    '..........ohllnnnnnnnnnnnmmmo..........',
    '.....ooooooolhlnnnnnwnnnmmmooooooo.....',
    '....ohhlloooooonnnnannnnoooooommmmo....',
    'cccccccccohhhhoaanawnnaaohhhhoccccccccc',
    'cccccccccohllmoaannawnaaohllmoccccccccc',
    '....omlllohmhmonnnannnnnohmhmommmdo....',
    '....omllloooooonnnnwnnnnoooooommmdo....',
    '......omllllmddnnnnnnnnnoodmmmmdo......',
    '......omllllmddnnnnnnnnnoodmmmmdo......',
    '......omllllmdddnnnnnnnooodmmmmdo......',
    '......ooooooooooooooooooooooooooo......',
    '......kkkkkkkkkkkkkkkkkkkkkkkkkkk......',
  ],
  // The wire carries on to both edges of the art; Alice and Bob wait at either end.
  decorate({ gw, sw, nx, ny, glyphs, lit }) {
    for (let gx = 0; gx < nx; gx++) for (const dy of [15, 16]) { lit(gx, ny + dy, COLOR.cyan, 1); lit(nx + sw + gx, ny + dy, COLOR.cyan, 1); }
    glyphs('A', 1, ny + 8, COLOR.cyan, 0.8);
    glyphs('B', gw - 4, ny + 8, COLOR.cyan, 0.8);
  },
};

/** 2FA: a battered old smartphone buzzing with a six-digit code (123 456, naturally) on its cracked screen. */
const TWOFA: SpriteDef = {
  rows: [
    '...ooooooooooooooo...',
    '..ohhhhhhllllllmmdo..',
    '.ohlllllnnnnnlllllmo.',
    '.ohlllllllllllllllmo.',
    '.ohoooooooooooowGomo.',
    '.ohoGGGooooooowooomod',
    '.ohooooooooowwoooomod',
    '.ohoocooocccoocccomod',
    '.ohoccooooocoooocomo.',
    '.ohoocooocccoooccomo.',
    '.ohoocooocoooooocomo.',
    '.ohocccoocccoocccomo.',
    '.ohooooooooooooooomo.',
    '.ohooooooooooooooomo.',
    '.ohococoocccoocccomo.',
    '.ohococoocoooocooomo.',
    '.ohocccoocccoocccomo.',
    '.ohooocoooocoococomo.',
    '.ohooocoocccoocccomo.',
    '.ohooooooooooooooomo.',
    '.ohorrrrrRRRRRRRRomo.',
    '.ohooooooooooooooomo.',
    '.ohlllllllllllllllmo.',
    '.ohllllldddddlllllmo.',
    '..odmmmmmmmmmmmmddo..',
    '...ooooooooooooooo...',
    '....kkkkkkkkkkkkk....',
  ],
  // Buzz arcs either side of the phone: the code has arrived, for someone.
  decorate({ sw, sh, nx, ny, lit }) {
    const midY = ny + Math.floor(sh / 2);
    for (const [off, half, a] of [[3, 3, 0.85], [6, 4, 0.4]]) {
      for (let y = -half; y <= half; y++) {
        const bend = Math.abs(y) === half ? 1 : 0;
        lit(nx - off + bend, midY + y, COLOR.cyan, a);
        lit(nx + sw - 1 + off - bend, midY + y, COLOR.cyan, a);
      }
    }
  },
};

/** CAPTCHA: a 3x3 verification grid demanding every square with REGRET; each tile holds a small frown, three are ticked, and the cursor is hovering over one more. */
const CAPTCHA: SpriteDef = {
  rows: [
    'ooooooooooooooooooooooooooooooooo.',
    'ohhhhhhhhhhhhhhhhhhhhhhhhhhhhhhho.',
    'ohdddwwddwwwddwwdwwddwwwdwwwdddmo.',
    'ohdddwdwdwdddwdddwdwdwddddwddddmo.',
    'ohdddwwddwwddwdwdwwddwwdddwddddmo.',
    'ohdddwdwdwdddwdwdwdwdwddddwddddmo.',
    'ohdddwdwdwwwddwwdwdwdwwwddwddddmo.',
    'ohnnnnnnnnnnnnnnnnnnnnnnnnnnnnnmo.',
    'ohllllllwwlnmmmmmmmmmnmmmmmmmmmmo.',
    'ohlllllwwllnmnnmmmnnmnmnnmmmnnmmo.',
    'ohlwwlwwlllnmmmmmmmmmnmmmmmmmmmmo.',
    'ohllwwwllllnmmmnnnmmmnmmmnnnmmmmo.',
    'ohlllwlllllnmmnmmmnmmnmmnmmmnmmmo.',
    'ohnnnnnnnnnnnnnnnnnnnnnnnnnnnnnmo.',
    'ohmmmmmmmmmnllllllwwlnmmmmmmmmmmo.',
    'ohmnnmmmnnmnlllllwwllnmnnmnmnnmmo.',
    'ohmmmmmmmmmnlwwlwwlllnmmmmnnmmmmo.',
    'ohmmmnnnmmmnllwwwllllnmmmnnwnmmmo.',
    'ohmmnmmmnmmnlllwlllllnmmnmnwwnmmo.',
    'ohnnnnnnnnnnnnnnnnnnnnnnnnnwwwnmo.',
    'ohllllllwwlnmmmmmmmmmnmmmmnwwwwno.',
    'ohlllllwwllnmnnmmmnnmnmnnmnwwwwwn.',
    'ohlwwlwwlllnmmmmmmmmmnmmmmnwwwnnn.',
    'ohllwwwllllnmmmnnnmmmnmmmnnnwwnmo.',
    'ohlllwlllllnmmnmmmnmmnmmnmmmnwwno.',
    'ooooooooooooooooooooooooooooonnoo.',
    '.kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
  ],
};

/** VPN: a wireframe globe with a glowing tunnel bored straight through it, plus a tiny flag claiming you were always here. */
const VPN: SpriteDef = {
  rows: [
    '..........................Grrrrrr......',
    '..........................Gwwwwww......',
    '..........................Gllllll......',
    '...............ooooooooo..G............',
    '.............oohhllhllhhooG............',
    '............oohhhhhhhhhhhoo............',
    '...........ohlhmmmmhmmmmhmlo...........',
    '..........ohlhhmmmmhmmmmllmlo..........',
    '.........oolmhmmmmmhmmmmmlmmoo.........',
    '.........ohhhhhhmmmhmmmllllllo.........',
    'ooo.....ohlmmhmhhhhhhlllmldddlo.....ooo',
    'ohhooooooooooooooooooooooooooooooooohho',
    'ohhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhho',
    'ollllllllcccccccccccccccccccccllllllllo',
    'cllccwwwcccwwwcccwwwcccwwwcccwwwcccwllc',
    'ollllllllcccccccccccccccccccccllllllllo',
    'ommmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmo',
    'ommooooooooooooooooooooooooooooooooommo',
    'ooo.....ohmmmlmmmmdldddddldddlo.....ooo',
    '.........ohmmlmmmddldddddlddlo.........',
    '.........oolllmmdddldddddllloo.........',
    '..........olmllllllllllllldlo..........',
    '...........olmlddddlddddldlo...........',
    '............oolldddldddlloo............',
    '.............oollllllllloo.............',
    '...............ooooooooo...............',
    '..........kkkkkkkkkkkkkkkkkkk..........',
  ],
  // Packets go in one end and leave the other, somewhere else entirely.
  decorate({ gw, sw, nx, ny, lit }) {
    const y = ny + 14;
    for (let i = 1; i <= 10; i += 2) {
      const a = Math.max(0.15, 0.8 - i * 0.07);
      if (nx - i >= 0) lit(nx - i, y, COLOR.cyan, a);
      if (nx + sw - 1 + i < gw) lit(nx + sw - 1 + i, y, COLOR.cyan, a);
    }
  },
};

/** Watchdog: an alert guard dog sitting upright, ears up, in a spiked collar. */
const WATCHDOG: SpriteDef = {
  rows: [
    '...............o.....o............',
    '..............oho...omo...........',
    '..............ohlo..odmo..........',
    '.............ohdlo.odmo...........',
    '.............ohddloodmo...........',
    '.............ohddlhlmo............',
    '............ohllhhhllmooooo.......',
    '............ohlhaahhlllhhhloo.....',
    '............ohlhanllllhhhhhloGGo..',
    '............omllhlllllllllllGwGGo.',
    '............omlllllllllllllllGGo..',
    '............ommllloooooooooooooo..',
    '.............odmlmowllllwlmmmo....',
    '.............odmlmoooooooooo......',
    '...........GGGGGGGGGGGGGGGG.......',
    '..........wwGggggggggggggGww......',
    '...........GGGwwwGwwwGwwwGG.......',
    '.............omwlllwlllwlhmo......',
    '............omlhhhhhhhllhhmo......',
    '...........omlhhhhhhhhllhhmo......',
    '.oo.......omlhhhhhhhhhllhhmo......',
    'ohmo.....omlhhhddddhllmomlmo......',
    'omlmooooomlhhdllllldmo.omlmo......',
    '.omlmlllmmlhdlllllldmo..omlmo.....',
    '...ommmmmmlldlhhhhho...ohhhhmo....',
    '....ooooooooooooooooooooooooo.....',
    '.........kkkkkkkkkkkkkkkkkkkkkkk..',
  ],
  // The exclamation mark of a dog who has heard something.
  decorate({ nx, ny, sw, glyphs }) {
    glyphs('!', nx + sw - 7, ny + 1, COLOR.amber, 0.9);
  },
};

/** Air Gap: scissors snipping a network cable in two, with bare wires and sparks jumping across the gap between its plugs. */
const AIRGAP: SpriteDef = {
  rows: [
    '..........oooooo........oooooo..........',
    '.........ohhhhllo......ohhhhllo.........',
    '........ohhhhllllo....ohhhhllllo........',
    '.......ohhhoooollmo..ohhhoooollmo.......',
    '.......ohho....ommo..ohho....ommo.......',
    '.......ohho....ommo..ohho....ommo.......',
    '.......ohlloooommmo..ohlloooommmo.......',
    '........ollllmmmmo....ollllmmmmo........',
    '.........ollmmmmohoooomollmmmmo.........',
    '..........oooooollhomllhoooooo..........',
    '...............oomlGGlhoo...............',
    '................oomgghoo................',
    '................ohoooomo................',
    '...............ohholllmmo...............',
    '...............ohllollmmo...............',
    '..............ohhlloollmmo..............',
    '...oo........ohhllo..ollmmo........oo...',
    '.oohhoo......ohllo....olmmo......oolloo.',
    'ohhhhhloooooohhllo....ollmmoooooohhhhhlo',
    'oalllllmohhhohlee.a..f.rrlmohhhomhllllao',
    'oAllllldollohlla...ww...clmmollodhllllAo',
    'oallllldommohlorr..ww..eeolmommodhllllao',
    'oAmmmmmdodohlooc..f..a..aoolmododlmmmmAo',
    'ommmmmdooooloo............ooloooommmmmdo',
    '.ooooookkkko................okkkkoooooo.',
    '..kkkkkkkkkk................kkkkkkkkkk..',
  ],
  decorate({ nx, ny, rnd, lit }) {
    for (let i = 0; i < 6; i++) lit(nx + 15 + Math.floor(rnd() * 10), ny + 15 + Math.floor(rnd() * 3), COLOR.amber, 0.2 + rnd() * 0.3);
  },
};

/** Tripwire: a thin glowing wire strung low between two posts, tied by a pull line to a ringing alarm bell. */
const TRIPWIRE: SpriteDef = {
  rows: [
    '.................oooooooooooooooooooo.',
    '.................ohhhhhhhhhhhhhhhhlmo.',
    '.................oooooooooooooooohlmo.',
    '.................oGGGo..........ohlmo.',
    '................ooooooo.........ohlmo.',
    '...............oohlllmoo........ohlmo.',
    '...............olhhllmdo........ohlmo.',
    '...............olhlllmdo........ohlmo.',
    '...............olhlllmdo........ohlmo.',
    '...............olhlllmdo........ohlmo.',
    '...............olhlllmdo........ohlmo.',
    '..............olhllllmmdo.......ohlmo.',
    '..............olhllllmmdo.......ohlmo.',
    '.............oolhlllllmdoo......ohlmo.',
    '.............oGGGGGGGGgggo......ohlmo.',
    '.............ooooooooooooo......ohlmo.',
    '.................oaaao..........ohlmo.',
    '..ooooo..........oaaao..........ohlmo.',
    '..ohlmo...........ooo...........ohlmo.',
    '..ohlmo............c............ohlmo.',
    '..ohlmGccccccccccccwccccccccccccGhlmo.',
    '..ohlmo.........................ohlmo.',
    '..ohlmo.........................ohlmo.',
    '.ogGGGgo.......................ogGGGgo',
    '.ooooooo.......................ooooooo',
    'kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk',
  ],
  // Ring arcs on both sides of the bell, one flat alarm, and the wire still humming.
  decorate({ nx, ny, rnd, lit, glyphs }) {
    const arcs = [[12, 5], [11, 6], [10, 7], [10, 8], [10, 9], [11, 10], [12, 11],
      [26, 5], [27, 6], [28, 7], [28, 8], [28, 9], [27, 10], [26, 11]];
    arcs.forEach(([x, y]) => lit(nx + x, ny + y, COLOR.amber, 0.9));
    glyphs('!', nx + 5, ny + 5, COLOR.amber, 0.85);
    for (let i = 0; i < 7; i++) {
      lit(nx + 9 + Math.floor(rnd() * 21), ny + (i % 2 ? 19 : 21), COLOR.cyan, 0.2 + rnd() * 0.3);
    }
  },
};

/** Sandbox: a kids' sandbox with a red pail turned upside down on the sand and a spade stuck in beside it. */
const SANDBOX: SpriteDef = {
  rows: [
    '.........................ooooooo....',
    '.........................oaaaaao....',
    '.........................oooAooo....',
    '..........ooooooooo........oao......',
    '.........owrrrrrrRRo.......oao......',
    '.........owrrrrrrRRo.......oao......',
    '.........owrrrrrrRRo.......oao......',
    '........owrrrrrrrRRRo......oao......',
    '........owrrrrrrrRRRo......oGo......',
    '........owrGGGGGGGRRo...oooGGGooo...',
    '.......owrGrrrrrrrGRRo..oGwwwwGgo...',
    '.......owrGrrrrrrrGRRo..oGwwwwGgo...',
    '....oooowrGrrrrrrrGRRooooGwwwwGgo...',
    '....odowwwGwwwwwwwGwwwodoGwwwGGgo...',
    '...omoorrrGrrrrrrrGRRRoaoGwwwGGgo...',
    '..omoAoooooooooooooooooaaoGwGGgodo..',
    '..omoaAaaaAaaaAaaaAaaaaAaaoGGgoodo..',
    '.omoaaAaaaAaaaAaaaAaaaAAaaAaAAaaodo.',
    '.omoaaaAaaaAaaaAaaaAaaaAAaaAaaaAodo.',
    'omoAaaaAaaaAaaaAaaaAaaaAaaaAaaaAaodo',
    'oooooooooooooooooooooooooooooooooooo',
    'oGhhhhhhhhhhhhhhhhhlllllllllllllllGo',
    'oGmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmGo',
    'oooooooooooooooooooooooooooooooooooo',
  ],
};

/** Exit Scam: a man's legs from the belt down, flat out and leaving, with nothing else left of him. */
const RUG: SpriteDef = {
  rows: [
    '..........oooooooooooooo............',
    '..........oAAaaaAAooAAAo............',
    '..........oooooooooooooo............',
    '..........ohhlllmllllllo............',
    '..........ohhlllmllllllo............',
    '..........ohhlllmlllllloo...........',
    '..........ohhlllmlllllllho..........',
    '..........ohhlllmlllllllllo.........',
    '..........ohhlllmlllllllllloo.......',
    '..oooo....ollmmmdomlllllllllho......',
    '.owwwoooo.olmmmmdooolllllllllmo.....',
    '.owGgomllollmmmddo..ollllllllmo.....',
    '.owggommmmlmmmmdo....olllllllmo.....',
    '.owgommmmmmmmmmdo.....ollllllmo.....',
    '.owgoddmmmmmmmmdo......ollllmmo.....',
    '.owgoooodmmmmmmdo......ohllmmo......',
    'owwgo...ooddmdddo......ohllmo.......',
    'owGgo.....ooodoo......ohhlmmo.......',
    'owggo........o........ohllmo........',
    '.ooo.................oooooooooooo...',
    '......................ooGGGGGGGGGo..',
    '......................oGGGGGGGGGggo.',
    '.......................owwwwwwwwwo..',
    '........................ooooooooo...',
  ],
  // Speed lines trailing off behind him and a puff of dust where he just was.
  decorate({ nx, ny, rnd, lit }) {
    for (const y of [3, 7, 11, 19]) for (let i = 0; i < 12; i += 2) lit(nx - 2 - i - (y % 3), ny + y, COLOR.cyan, 0.75 - i * 0.055);
    for (let i = 0; i < 12; i++) lit(nx + 2 + Math.floor(rnd() * 12), ny + 20 + Math.floor(rnd() * 4), '#5d676f', 0.2 + rnd() * 0.4);
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
  hello: draw(HELLO),
  balancer: draw(BALANCER),
  stash: draw(STASH),
  intern: draw(INTERN),
  duck: draw(DUCK),
  bounty: draw(BOUNTY),
  cron: draw(CRON),
  backup: draw(BACKUP),
  raid: draw(RAID),
  rug: draw(RUG),
  container: draw(CONTAINER),
  cloud: draw(CLOUD),
  sandwich: draw(SUDO),
  baton: draw(ORCHESTRATOR),
  crowbar: draw(CROWBAR),
  worm: draw(WORM),
  syringe: draw(SQLI),
  keyboard: draw(KEYLOGGER),
  overflow: draw(OVERFLOW),
  bomb: draw(BOMB),
  phone: draw(PHONE),
  ransom: draw(RANSOM),
  mitm: draw(MITM),
  twofa: draw(TWOFA),
  captcha: draw(CAPTCHA),
  vpn: draw(VPN),
  watchdog: draw(WATCHDOG),
  scissors: draw(AIRGAP),
  tripwire: draw(TRIPWIRE),
  sandbox: draw(SANDBOX),
};
