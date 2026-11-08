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
 *   a / A amber / dark amber (honey, wood)   f flame orange   . empty
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
  };
}

/** Shades drawn with a soft glow. */
const GLOWS = new Set(['h', 'c', 'a', 'f']);

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
};
