import type { Ctx } from './game';

export type CardKind = 'currency' | 'data' | 'malware' | 'program';

/** Procedural 3D dot-matrix models available as card art (drawn in render/dotModels). */
export type DotModel = 'cpu' | 'honeypot';

/** Flat pixel-art sprites available as card art (drawn in render/pixelArt). */
export type PixelSprite = 'nose' | 'kiddie' | 'horse' | 'toaster' | 'bot' | 'skull' | 'calendar' | 'honeypot' | 'firewall'
  | 'fork' | 'trash' | 'hdd' | 'rack' | 'cache' | 'cart' | 'door' | 'bandaid' | 'magnifier' | 'hook' | 'gears' | 'screens' | 'padlock' | 'cpu' | 'bug';

export interface CardDef {
  id: string;
  name: string;
  cost: number;
  kind: CardKind;
  /** Program subtypes. */
  exploit?: boolean; // attack: targets the opponent
  daemon?: boolean; // reaction: blocks exploits from hand
  credits?: number; // currency value
  vp?: number;
  /** Rules text shown on the card. Use \n for line breaks. */
  text: string;
  flavor?: string;
  /** Small ASCII glyph used as card art. */
  art: string[];
  /** If set, art is a drawn network graph with this many nodes instead of ASCII. */
  network?: number;
  /** If set, art is this 3D dot-matrix model instead of ASCII. */
  model?: DotModel;
  /** If set, art is this flat pixel-art sprite instead of ASCII. */
  sprite?: PixelSprite;
  /** +cycles granted; used by the AI to tell terminals from non-terminals. */
  givesCycles?: number;
  effect?: (ctx: Ctx) => Generator<import('./game').Prompt, void, any>;
}

/** Deterministic block of 0s and 1s; bigger currency = denser grid. */
function binaryArt(rows: number, cols: number, seed: number): string[] {
  let s = seed * 2654435761 >>> 0;
  const bit = () => ((s = (s * 1664525 + 1013904223) >>> 0) >>> 31).toString();
  return Array.from({ length: rows }, () => Array.from({ length: cols }, bit).join(''));
}

const defs: CardDef[] = [
  // ───────────── CURRENCY ─────────────
  {
    id: 'megabyte', name: 'Megabyte', cost: 0, kind: 'currency', credits: 1,
    text: '+1 CR', flavor: 'fits on a floppy. barely.',
    art: binaryArt(2, 4, 1),
  },
  {
    id: 'gigabyte', name: 'Gigabyte', cost: 3, kind: 'currency', credits: 2,
    text: '+2 CR', flavor: 'a thousand megs walk into a bar.',
    art: binaryArt(3, 8, 2),
  },
  {
    id: 'terabyte', name: 'Terabyte', cost: 6, kind: 'currency', credits: 3,
    text: '+3 CR', flavor: 'cold storage, hot assets.',
    art: binaryArt(6, 16, 3),
  },
  // ───────────── DATA (VP) ─────────────
  {
    id: 'node', name: 'Node', cost: 2, kind: 'data', vp: 1,
    text: '1 VP', flavor: 'a foothold.',
    art: [], network: 2,
  },
  {
    id: 'server', name: 'Server', cost: 5, kind: 'data', vp: 3,
    text: '3 VP', flavor: 'uptime: 847 days. not anymore.',
    art: [], network: 5,
  },
  {
    id: 'mainframe', name: 'Mainframe', cost: 8, kind: 'data', vp: 6,
    text: '6 VP\nWhen this pile empties,\nthe game ends.', flavor: '# whoami\nroot',
    art: [], network: 12,
  },
  // ───────────── MALWARE (curse) ─────────────
  {
    id: 'malware', name: 'Malware', cost: 0, kind: 'malware', vp: -1,
    text: '-1 VP\nDoes nothing.\nClogs your deck.', flavor: 'it came with the free screensaver.',
    art: [' .-"-. ', '/ x x \\', '\\  ^  /', " '-.-' "], sprite: 'bug',
  },
  // ───────────── PROGRAMS ─────────────
  {
    id: 'fork', name: 'Fork', cost: 3, kind: 'program', givesCycles: 2,
    text: '+1 Card\n+2 Cycles',
    flavor: 'pid_t child = fork();',
    art: ['   |   ', '   |   ', '  / \\  ', ' /   \\ '], sprite: 'fork',
    *effect(c) { c.draw(1); c.cycles(2); },
  },
  {
    id: 'overclock', name: 'Overclock', cost: 4, kind: 'program',
    text: '+3 Cards', flavor: 'thermal limits are a suggestion.',
    art: ['  ^^^  ', ' [CPU] ', ' ||||| ', ' ~~~~~ '], sprite: 'cpu',
    *effect(c) { c.draw(3); },
  },
  {
    id: 'scriptkiddie', name: 'Script Kiddie', cost: 2, kind: 'program', exploit: true, givesCycles: 1,
    text: '+1 Cycle\n+1 CR\nExploit: Breach 1.',
    flavor: 'copy. paste. pwn?',
    art: ['  (o_o) ', ' <)  )> ', '  /  \\  '], sprite: 'kiddie',
    *effect(c) {
      c.cycles(1); c.credits(1);
      yield* c.exploit(function* (t) { t.breach(1); });
    },
  },
  {
    id: 'firewall', name: 'Firewall', cost: 2, kind: 'program', daemon: true,
    text: '+2 Cards\nDaemon: while in your\nhand, blocks Exploits\ntargeting you.',
    flavor: 'DROP ALL INPUT',
    art: ['|#|#|#|', '|#|#|#|', '|#|#|#|'], sprite: 'firewall',
    *effect(c) { c.draw(2); },
  },
  {
    id: 'garbagecollector', name: 'Garbage Collector', cost: 2, kind: 'program',
    text: 'Trash up to 4 cards\nfrom your hand.',
    flavor: 'free(everything);',
    art: [' _____ ', ' \\   / ', '  |_|  ', '  [=]  '], sprite: 'trash',
    *effect(c) {
      const picks: number[] = yield c.promptHand({ min: 0, max: 4, purpose: 'trash', title: 'TRASH UP TO 4 CARDS' });
      c.trashFromHand(picks);
    },
  },
  {
    id: 'defrag', name: 'Defrag', cost: 4, kind: 'program',
    text: 'Trash a card from your\nhand. Gain a card\ncosting up to 2 more.',
    flavor: 'rearranging the bits.',
    art: ['▓▓░▓░░▓', '░▓▓░▓▓░', '▓▓▓▓░░░'], sprite: 'hdd',
    *effect(c) {
      if (c.me.hand.length === 0) return;
      const [pick]: number[] = yield c.promptHand({ min: 1, max: 1, purpose: 'trashUpgrade', title: 'TRASH A CARD' });
      const card = c.me.hand[pick];
      const cost = c.def(card).cost;
      c.trashFromHand([pick]);
      const pile: string | null = yield c.promptSupply({ maxCost: cost + 2, title: `GAIN A CARD COSTING UP TO ${cost + 2}` });
      if (pile) c.gain(pile, 'discard');
    },
  },
  {
    id: 'packetsniffer', name: 'Packet Sniffer', cost: 4, kind: 'program', exploit: true,
    text: '+2 CR\nExploit: opponent\ndiscards down to\n3 cards.',
    flavor: 'tcpdump -i eth0',
    art: [' >>--> ', ' [ ? ] ', ' <--<< '], sprite: 'nose',
    *effect(c) {
      c.credits(2);
      yield* c.exploit(function* (t) {
        const n = t.me.hand.length - 3;
        if (n <= 0) return;
        const picks: number[] = yield t.promptHand({ min: n, max: n, purpose: 'discard', title: `DISCARD ${n} CARD${n > 1 ? 'S' : ''}` });
        t.discardFromHand(picks);
      });
    },
  },
  {
    id: 'trojan', name: 'Trojan', cost: 5, kind: 'program', exploit: true,
    text: '+2 Cards\nExploit: opponent\ngains a Malware.',
    flavor: 'totally_legit_installer.exe',
    art: ['  _/\\_ ', ' |o  o|', ' |____|', '  |  | '], sprite: 'horse',
    *effect(c) {
      c.draw(2);
      yield* c.exploit(function* (t) { t.gain('malware', 'discard'); });
    },
  },
  {
    id: 'ddos', name: 'DDoS', cost: 5, kind: 'program', exploit: true,
    text: '+1 CR\nExploit: Breach 3.',
    flavor: '10,000 toasters, one target.',
    art: ['> > > >', ' > > > ', '> > > >', ' >>>>[]'], sprite: 'toaster',
    *effect(c) {
      c.credits(1);
      yield* c.exploit(function* (t) { t.breach(3); });
    },
  },
  {
    id: 'botnet', name: 'Botnet', cost: 4, kind: 'program', exploit: true, givesCycles: 1,
    text: '+1 Card\n+1 Cycle\nExploit: Breach 1 per\nBotnet you have in play.',
    flavor: 'we are legion. we are cheap.',
    art: ['o-o-o-o', '|\\|/|\\|', 'o-o-o-o'], sprite: 'bot',
    *effect(c) {
      c.draw(1); c.cycles(1);
      const n = c.me.inPlay.filter((x) => x.def === 'botnet').length;
      yield* c.exploit(function* (t) { t.breach(n); });
    },
  },
  {
    id: 'serverrack', name: 'Server Rack', cost: 5, kind: 'program', givesCycles: 1,
    text: '+1 Card\n+1 Cycle\n+1 Bandwidth\n+1 CR',
    flavor: 'blinkenlights included.',
    art: ['[=====]', '[= . =]', '[=====]', '[= . =]'], sprite: 'rack',
    *effect(c) { c.draw(1); c.cycles(1); c.bandwidth(1); c.credits(1); },
  },
  {
    id: 'l2cache', name: 'L2 Cache', cost: 5, kind: 'program', givesCycles: 1,
    text: '+2 Cards\n+1 Cycle',
    flavor: 'closer to the core.',
    art: [' ┌┬┬┬┐ ', ' ├┼┼┼┤ ', ' └┴┴┴┘ '], sprite: 'cache',
    *effect(c) { c.draw(2); c.cycles(1); },
  },
  {
    id: 'cryptominer', name: 'Crypto Miner', cost: 5, kind: 'program',
    text: 'Trash a Currency from\nyour hand. Gain a\nCurrency costing up to\n3 more, into your hand.',
    flavor: 'proof of work. lots of work.',
    art: ['  ___  ', ' / ₿ \\ ', ' \\___/ ', ' /|||\\ '], sprite: 'cart',
    *effect(c) {
      if (!c.me.hand.some((x) => c.def(x).kind === 'currency')) return;
      const [pick]: number[] = yield c.promptHand({
        min: 1, max: 1, purpose: 'trashUpgrade', title: 'TRASH A CURRENCY',
        filter: (d) => d.kind === 'currency',
      });
      const cost = c.def(c.me.hand[pick]).cost;
      c.trashFromHand([pick]);
      const pile: string | null = yield c.promptSupply({
        maxCost: cost + 3, title: `GAIN A CURRENCY UP TO ${cost + 3} (TO HAND)`,
        filter: (d) => d.kind === 'currency',
      });
      if (pile) c.gain(pile, 'hand');
    },
  },
  {
    id: 'backdoor', name: 'Backdoor', cost: 4, kind: 'program', givesCycles: 1,
    text: '+1 Card\n+1 Cycle\n+1 CR',
    flavor: 'nobody checks port 31337.',
    art: [' _____ ', '|  _  |', '| |_|>|', '|_____|'], sprite: 'door',
    *effect(c) { c.draw(1); c.cycles(1); c.credits(1); },
  },
  {
    id: 'patch', name: 'Patch', cost: 3, kind: 'program', givesCycles: 1,
    text: '+1 Card\n+1 Cycle\nRestore 3 Integrity.',
    flavor: 'v1.0.1 — fixes everything.',
    art: ['  ___  ', ' |+ +| ', ' | + | ', ' |+_+| '], sprite: 'bandaid',
    *effect(c) { c.draw(1); c.cycles(1); c.heal(3); },
  },
  {
    id: 'antivirus', name: 'Antivirus', cost: 3, kind: 'program',
    text: '+2 Cards\nThen trash all Malware\nfrom your hand.',
    flavor: 'scanning... 1 threat found.',
    art: ['  ___  ', ' /   \\ ', '| (+) |', ' \\___/ '], sprite: 'magnifier',
    *effect(c) {
      c.draw(2);
      const idx = c.me.hand.map((x, i) => (x.def === 'malware' ? i : -1)).filter((i) => i >= 0);
      if (idx.length) c.trashFromHand(idx);
    },
  },
  {
    id: 'phishing', name: 'Phishing', cost: 3, kind: 'program',
    text: '+1 Bandwidth\n+2 CR',
    flavor: 'Dear valued customer...',
    art: ['   /   ', '  /    ', ' J  ><>', '       '], sprite: 'hook',
    *effect(c) { c.bandwidth(1); c.credits(2); },
  },
  {
    id: 'rootkit', name: 'Rootkit', cost: 6, kind: 'program', exploit: true,
    text: '+2 CR\nExploit: Breach 2.\nOpponent gains a\nMalware.',
    flavor: 'it was here before you were.',
    art: ['  ___  ', ' (o o) ', '/|_#_|\\', ' // \\\\ '], sprite: 'skull',
    *effect(c) {
      c.credits(2);
      yield* c.exploit(function* (t) { t.breach(2); t.gain('malware', 'discard'); });
    },
  },
  {
    id: 'zeroday', name: 'Zero-Day', cost: 5, kind: 'program', exploit: true,
    text: 'Exploit: Breach 6.\nTrash this card.',
    flavor: 'works exactly once.',
    art: ['  ___  ', ' | 0 | ', ' |DAY| ', ' |___| '], sprite: 'calendar',
    *effect(c) {
      yield* c.exploit(function* (t) { t.breach(6); });
      c.trashSelf();
    },
  },
  {
    id: 'honeypot', name: 'Honeypot', cost: 4, kind: 'program', daemon: true,
    text: '+2 CR\nDaemon: while in hand,\nblocks Exploits and\nBreaches attacker 2.',
    flavor: 'come on in. it is warm.',
    art: ['  ___  ', ' (___) ', ' |HNY| ', ' |___| '], sprite: 'honeypot',
    *effect(c) { c.credits(2); },
  },
  {
    id: 'compiler', name: 'Compiler', cost: 3, kind: 'program',
    text: 'Gain a card costing\nup to 4.',
    flavor: 'gcc -O3 ./dreams.c',
    art: ['{ } { }', ' \\ | / ', '  [*]  ', '   |   '], sprite: 'gears',
    *effect(c) {
      const pile: string | null = yield c.promptSupply({ maxCost: 4, title: 'GAIN A CARD COSTING UP TO 4' });
      if (pile) c.gain(pile, 'discard');
    },
  },
  {
    id: 'recursion', name: 'Recursion', cost: 4, kind: 'program',
    text: 'Choose a Program in\nyour hand.\nRun it twice.',
    flavor: 'see: Recursion.',
    art: [' .--.  ', '(  _ ) ', ' `( `) ', '   `-  '], sprite: 'screens',
    *effect(c) {
      if (!c.me.hand.some((x) => c.def(x).kind === 'program')) return;
      const [pick]: number[] = yield c.promptHand({
        min: 1, max: 1, purpose: 'play', title: 'CHOOSE A PROGRAM TO RUN TWICE',
        filter: (d) => d.kind === 'program',
      });
      yield* c.runTwice(pick);
    },
  },
  {
    id: 'encryption', name: 'Encryption', cost: 4, kind: 'program', givesCycles: 1,
    text: '+1 Card\n+1 Cycle\n+3 Shield (absorbs\nBreach until your\nnext turn).',
    flavor: 'AES-256. good luck.',
    art: ['  .-.  ', ' |   | ', '[=====]', '[ KEY ]'], sprite: 'padlock',
    *effect(c) { c.draw(1); c.cycles(1); c.shield(3); },
  },
];

export const CARDS: Record<string, CardDef> = Object.fromEntries(defs.map((d) => [d.id, d]));
export const ALL_CARDS = defs;
export const BASIC_PILES = ['megabyte', 'gigabyte', 'terabyte', 'node', 'server', 'mainframe', 'malware'];
export const KINGDOM_POOL = defs.filter((d) => d.kind === 'program').map((d) => d.id);

export function typeLine(d: CardDef): string {
  if (d.kind === 'currency') return 'CURRENCY';
  if (d.kind === 'data') return 'DATA';
  if (d.kind === 'malware') return 'MALWARE';
  if (d.exploit) return 'PROGRAM · EXPLOIT';
  if (d.daemon) return 'PROGRAM · DAEMON';
  return 'PROGRAM';
}

/** Neon accent color per card type. */
export function cardColor(d: CardDef): string {
  if (d.kind === 'currency') return '#ffc933';
  if (d.kind === 'data') return '#33e0ff';
  if (d.kind === 'malware') return '#ff3366';
  if (d.exploit) return '#ff6a2a';
  if (d.daemon) return '#5a8cff';
  return '#33ff88';
}
