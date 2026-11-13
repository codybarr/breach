import type { Ctx, Game } from './game';

export type CardKind = 'currency' | 'data' | 'malware' | 'program';

/** Procedural 3D dot-matrix models available as card art (drawn in render/dotModels). */
export type DotModel = 'cpu' | 'honeypot';

/** What a Daemon does from hand when an Exploit targets its owner. */
export interface DaemonReaction {
  /** Cancels the Exploit. */
  blocks?: boolean;
  /** The Daemon is discarded when it blocks. */
  discards?: boolean;
  onBlock?: (me: Ctx, attacker: Ctx, exploit: string | null) => import('./game').Effect;
  /** Subtracted from each Breach the Exploit deals. */
  softens?: number;
  /** Cards drawn after an Exploit lands. */
  drawsAfterHit?: number;
}

/** Flat pixel-art sprites available as card art (drawn in render/pixelArt). */
export type PixelSprite = 'nose' | 'kiddie' | 'horse' | 'toaster' | 'bot' | 'skull' | 'calendar' | 'honeypot' | 'firewall'
  | 'fork' | 'trash' | 'hdd' | 'rack' | 'cache' | 'cart' | 'door' | 'bandaid' | 'magnifier' | 'hook' | 'gears' | 'screens' | 'padlock' | 'cpu' | 'bug'
  | 'cloud' | 'hello' | 'balancer' | 'stash' | 'intern' | 'duck' | 'bounty' | 'cron' | 'backup' | 'raid' | 'rug' | 'container' | 'sandwich' | 'baton'
  | 'crowbar' | 'worm' | 'syringe' | 'keyboard' | 'overflow' | 'bomb' | 'phone' | 'ransom' | 'mitm'
  | 'twofa' | 'captcha' | 'vpn' | 'watchdog' | 'scissors' | 'tripwire' | 'sandbox';

export interface CardDef {
  id: string;
  name: string;
  cost: number;
  kind: CardKind;
  /** Program subtypes. */
  exploit?: boolean; // attack: targets the opponent
  daemon?: boolean; // reaction: responds to exploits from hand
  reaction?: DaemonReaction;
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
  /** Reason player `p` can't run this from hand right now, when it would only waste a Cycle. */
  cantRun?: (g: Game, p: number) => string | null;
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
    reaction: { blocks: true },
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
    reaction: { blocks: true, *onBlock(_me, attacker) { attacker.breach(2); } },
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
  // ───────────── PROGRAMS · SET 2 ─────────────
  {
    id: 'helloworld', name: 'Hello World', cost: 1, kind: 'program', givesCycles: 1,
    text: '+1 Cycle\n+1 CR\nTrash this card.',
    flavor: 'your first and last program.',
    art: [], sprite: 'hello',
    *effect(c) { c.cycles(1); c.credits(1); c.trashSelf(); },
  },
  {
    id: 'loadbalancer', name: 'Load Balancer', cost: 2, kind: 'program', givesCycles: 1,
    text: '+1 Cycle\nDiscard up to 3 cards,\nthen draw that many.',
    flavor: 'round robin, round robin.',
    art: [], sprite: 'balancer',
    *effect(c) {
      c.cycles(1);
      const picks: number[] = yield c.promptHand({ min: 0, max: 3, purpose: 'cycle', title: 'DISCARD UP TO 3, THEN DRAW THAT MANY' });
      c.discardFromHand(picks);
      c.draw(picks.length);
    },
  },
  {
    id: 'gitstash', name: 'Git Stash', cost: 2, kind: 'program', givesCycles: 1,
    text: '+1 Card\n+1 Cycle\nPut a card from your\nhand on your deck.',
    flavor: "i'll get back to it.",
    art: [], sprite: 'stash',
    *effect(c) {
      c.draw(1); c.cycles(1);
      const picks: number[] = yield c.promptHand({ min: 1, max: 1, purpose: 'topdeck', title: 'PUT A CARD ON TOP OF YOUR DECK' });
      c.putOnDeck(picks);
    },
  },
  {
    id: 'intern', name: 'The Intern', cost: 2, kind: 'program',
    text: '+1 CR\nYou may trash this to\ngain a card costing\nup to 4.',
    flavor: 'unpaid. unsupervised. has prod access.',
    art: [], sprite: 'intern',
    *effect(c) {
      c.credits(1);
      if (!c.self || !c.me.inPlay.includes(c.self)) return;
      const pile: string | null = yield c.promptSupply({ maxCost: 4, title: 'PROMOTE THE INTERN: GAIN A CARD UP TO 4' });
      if (pile) { c.trashSelf(); c.gain(pile, 'discard'); }
    },
  },
  {
    id: 'rubberduck', name: 'Rubber Duck', cost: 3, kind: 'program', givesCycles: 1,
    text: '+1 Card\n+1 Cycle\nYou may trash a\nMalware from hand.',
    flavor: 'quack.',
    art: [], sprite: 'duck',
    *effect(c) {
      c.draw(1); c.cycles(1);
      const picks: number[] = yield c.promptHand({ min: 0, max: 1, purpose: 'trash', title: 'YOU MAY TRASH A MALWARE', filter: (d) => d.kind === 'malware' });
      c.trashFromHand(picks);
    },
  },
  {
    id: 'bugbounty', name: 'Bug Bounty', cost: 3, kind: 'program',
    text: '+1 CR\nYou may trash a Malware\nfrom hand for +2 CR.',
    flavor: 'responsible disclosure pays.',
    art: [], sprite: 'bounty',
    *effect(c) {
      c.credits(1);
      const picks: number[] = yield c.promptHand({ min: 0, max: 1, purpose: 'trash', title: 'TRASH A MALWARE FOR +2 CR', filter: (d) => d.kind === 'malware' });
      if (picks.length) { c.trashFromHand(picks); c.credits(2); }
    },
  },
  {
    id: 'cronjob', name: 'Cron Job', cost: 3, kind: 'program',
    text: '+1 CR\nNext turn start:\n+1 CR and +1 Card.',
    flavor: '0 0 * * * ./profit',
    art: [], sprite: 'cron',
    *effect(c) {
      c.credits(1);
      c.atNextTurn(() => { c.credits(1); c.draw(1); });
    },
  },
  {
    id: 'backup', name: 'Backup', cost: 3, kind: 'program',
    text: 'Put a card from your\ndiscard into your hand.',
    flavor: 'you do have one, right?',
    art: [], sprite: 'backup',
    cantRun: (g, p) => (g.players[p].discard.length ? null : 'DISCARD IS EMPTY'),
    *effect(c) {
      const held = new Set(c.me.discard.map((x) => x.def));
      const pile: string | null = yield c.promptSupply({
        maxCost: Infinity, anyStock: true, title: 'RESTORE A CARD FROM YOUR DISCARD',
        filter: (d) => held.has(d.id),
      });
      if (pile) c.recover(pile);
    },
  },
  {
    id: 'raidarray', name: 'RAID Array', cost: 4, kind: 'program', givesCycles: 1,
    text: '+1 Cycle\n+1 CR per different\nCurrency in your hand.',
    flavor: 'redundant. redundant.',
    art: [], sprite: 'raid',
    *effect(c) {
      c.cycles(1);
      c.credits(new Set(c.me.hand.filter((x) => c.def(x).kind === 'currency').map((x) => x.def)).size);
    },
  },
  {
    id: 'exitscam', name: 'Exit Scam', cost: 4, kind: 'program',
    text: '+1 Bandwidth\nYou may trash a Data\nfrom hand for CR equal\nto its cost.',
    flavor: 'thanks for the liquidity.',
    art: [], sprite: 'rug',
    *effect(c) {
      c.bandwidth(1);
      const picks: number[] = yield c.promptHand({ min: 0, max: 1, purpose: 'trash', title: 'YOU MAY CASH OUT A DATA CARD', filter: (d) => d.kind === 'data' });
      if (picks.length) {
        const cost = c.def(c.me.hand[picks[0]]).cost;
        c.trashFromHand(picks);
        c.credits(cost);
      }
    },
  },
  {
    id: 'container', name: 'Container', cost: 4, kind: 'program',
    text: 'Run a Program from the\nsupply costing up to 3,\nwithout gaining it.',
    flavor: 'works on my machine.',
    art: [], sprite: 'container',
    *effect(c) {
      const pile: string | null = yield c.promptSupply({ maxCost: 3, title: 'RUN A PROGRAM COSTING UP TO 3', filter: (d) => d.kind === 'program' });
      if (pile) yield* c.runFromSupply(pile);
    },
  },
  {
    id: 'cloudcompute', name: 'Cloud Compute', cost: 5, kind: 'program', givesCycles: 1,
    text: '+1 Cycle\n+1 Card per Program\nyou have in play.',
    flavor: "there is no cloud. just someone else's computer.",
    art: [], sprite: 'cloud',
    *effect(c) {
      c.cycles(1);
      c.draw(c.me.inPlay.filter((x) => c.def(x).kind === 'program').length);
    },
  },
  {
    id: 'sudo', name: 'Sudo', cost: 6, kind: 'program',
    text: 'Gain a card costing\nup to 5, into your hand.',
    flavor: 'make me a sandwich.',
    art: [], sprite: 'sandwich',
    *effect(c) {
      const pile: string | null = yield c.promptSupply({ maxCost: 5, title: 'GAIN A CARD UP TO 5 (TO HAND)' });
      if (pile) c.gain(pile, 'hand');
    },
  },
  {
    id: 'orchestrator', name: 'Orchestrator', cost: 6, kind: 'program', givesCycles: 2,
    text: '+2 Cards\n+2 Cycles\n+1 Bandwidth',
    flavor: "it's yaml all the way down.",
    art: [], sprite: 'baton',
    *effect(c) { c.draw(2); c.cycles(2); c.bandwidth(1); },
  },
  // ───────────── EXPLOITS · SET 2 ─────────────
  {
    id: 'bruteforce', name: 'Brute Force', cost: 3, kind: 'program', exploit: true,
    text: 'Exploit: Breach 2.\nIgnores Shield.',
    flavor: 'aaaa. aaab. aaac.',
    art: [], sprite: 'crowbar',
    *effect(c) {
      yield* c.exploit(function* (t) { t.breach(2, true); });
    },
  },
  {
    id: 'worm', name: 'Worm', cost: 3, kind: 'program', exploit: true,
    text: 'Gain a Worm.\nExploit: Breach 1.',
    flavor: "i'm in your LAN, copying your LAN.",
    art: [], sprite: 'worm',
    *effect(c) {
      c.gain('worm', 'discard');
      yield* c.exploit(function* (t) { t.breach(1); });
    },
  },
  {
    id: 'sqlinjection', name: 'SQL Injection', cost: 4, kind: 'program', exploit: true,
    text: "+2 CR\nExploit: trash the top\ncard of opponent's deck.",
    flavor: "'; DROP TABLE decks;--",
    art: [], sprite: 'syringe',
    *effect(c) {
      c.credits(2);
      yield* c.exploit(function* (t) { t.trashTop(); });
    },
  },
  {
    id: 'keylogger', name: 'Keylogger', cost: 4, kind: 'program', exploit: true,
    text: "Exploit: +1 CR per\nCurrency in opponent's\nhand.",
    flavor: 'hunter2',
    art: [], sprite: 'keyboard',
    *effect(c) {
      yield* c.exploit(function* (t) {
        c.credits(t.me.hand.filter((x) => t.def(x).kind === 'currency').length);
      });
    },
  },
  {
    id: 'bufferoverflow', name: 'Buffer Overflow', cost: 4, kind: 'program', exploit: true,
    text: '+2 Cards\nExploit: Breach 1 per\ncard in hand above 4.',
    flavor: 'AAAAAAAAAAAAAAAA',
    art: [], sprite: 'overflow',
    *effect(c) {
      c.draw(2);
      const n = Math.max(0, c.me.hand.length - 4);
      yield* c.exploit(function* (t) { t.breach(n); });
    },
  },
  {
    id: 'logicbomb', name: 'Logic Bomb', cost: 4, kind: 'program', exploit: true,
    text: 'Exploit: at the start of\nyour next turn, Breach 4.',
    flavor: 'if (fired) rm -rf /',
    art: [], sprite: 'bomb',
    *effect(c) {
      // Daemons answer when the bomb goes off, against the hand the target holds then.
      c.atNextTurn(() => c.exploit(function* (t) { t.breach(4); }));
    },
  },
  {
    id: 'socialengineering', name: 'Social Engineering', cost: 4, kind: 'program', exploit: true,
    text: "+1 CR\nExploit: Breach 2.\nCan't be blocked\nby Daemons.",
    flavor: "hi, it's IT. what's your password?",
    art: [], sprite: 'phone',
    *effect(c) {
      c.credits(1);
      yield* c.exploit(function* (t) { t.breach(2); }, { unblockable: true });
    },
  },
  {
    id: 'ransomware', name: 'Ransomware', cost: 5, kind: 'program', exploit: true,
    text: 'Exploit: opponent\ndiscards 2 cards or\ntakes Breach 4.',
    flavor: 'send 0.5 BTC to unlock your hand.',
    art: [], sprite: 'ransom',
    *effect(c) {
      yield* c.exploit(function* (t) {
        const picks: number[] = yield t.promptHand({ min: 0, max: 2, purpose: 'ransom', title: 'PICK 2 TO DISCARD, OR FEWER TO TAKE BREACH 4' });
        if (picks.length === 2) t.discardFromHand(picks);
        else t.breach(4);
      });
    },
  },
  {
    id: 'mitm', name: 'Man-in-the-Middle', cost: 5, kind: 'program', exploit: true,
    text: "+1 CR\nExploit: if opponent's\ntop card is Currency,\ntrash it, gain a copy.",
    flavor: 'tell bob i said hi.',
    art: [], sprite: 'mitm',
    *effect(c) {
      c.credits(1);
      yield* c.exploit(function* (t) {
        const top = t.g.topCard(t.p);
        if (!top || t.def(top).kind !== 'currency') return;
        t.trashTop();
        c.gain(top.def, 'discard');
      });
    },
  },
  // ───────────── DAEMONS · SET 2 ─────────────
  {
    id: 'twofactor', name: '2FA', cost: 2, kind: 'program', daemon: true,
    text: '+1 CR\nDaemon: discard this\nfrom hand to block\nan Exploit.',
    flavor: 'enter the code we sent to your old phone.',
    art: [], sprite: 'twofa',
    reaction: { blocks: true, discards: true },
    *effect(c) { c.credits(1); },
  },
  {
    id: 'captcha', name: 'CAPTCHA', cost: 3, kind: 'program', daemon: true,
    text: '+1 Bandwidth\n+1 CR\nDaemon: blocks Exploits.\nAttacker discards 1.',
    flavor: 'select all squares with regret.',
    art: [], sprite: 'captcha',
    reaction: {
      blocks: true,
      *onBlock(_me, attacker) {
        const picks: number[] = yield attacker.promptHand({ min: 1, max: 1, purpose: 'discard', title: 'CAPTCHA FAILED: DISCARD A CARD' });
        attacker.discardFromHand(picks);
      },
    },
    *effect(c) { c.bandwidth(1); c.credits(1); },
  },
  {
    id: 'vpn', name: 'VPN', cost: 3, kind: 'program', daemon: true, givesCycles: 1,
    text: '+1 Card\n+1 Cycle\nDaemon: Exploits deal\n2 less Breach to you.',
    flavor: "i'm in the netherlands now.",
    art: [], sprite: 'vpn',
    reaction: { softens: 2 },
    *effect(c) { c.draw(1); c.cycles(1); },
  },
  {
    id: 'watchdog', name: 'Watchdog', cost: 3, kind: 'program', daemon: true, givesCycles: 1,
    text: '+1 Cycle\nRestore 2 Integrity.\nDaemon: after an Exploit\nhits you, draw 2.',
    flavor: 'woof(1)',
    art: [], sprite: 'watchdog',
    reaction: { drawsAfterHit: 2 },
    *effect(c) { c.cycles(1); c.heal(2); },
  },
  {
    id: 'airgap', name: 'Air Gap', cost: 3, kind: 'program', daemon: true,
    text: "+6 Shield\nYou can't buy this turn.\nDaemon: blocks Exploits.",
    flavor: 'unplug it. no, the other one.',
    art: [], sprite: 'scissors',
    reaction: { blocks: true },
    *effect(c) { c.shield(6); c.me.noBuy = true; },
  },
  {
    id: 'tripwire', name: 'Tripwire', cost: 4, kind: 'program', daemon: true,
    text: '+1 Card\n+1 Bandwidth\nDaemon: blocks Exploits.\nAttacker gains Malware.',
    flavor: 'alert tcp any any -> $HOME',
    art: [], sprite: 'tripwire',
    reaction: { blocks: true, *onBlock(_me, attacker) { attacker.gain('malware', 'discard'); } },
    *effect(c) { c.draw(1); c.bandwidth(1); },
  },
  {
    id: 'sandbox', name: 'Sandbox', cost: 5, kind: 'program', daemon: true,
    text: '+2 Cards\nDaemon: blocks Exploits.\nGain a copy of it.',
    flavor: 'detonated safely. mostly.',
    art: [], sprite: 'sandbox',
    reaction: { blocks: true, *onBlock(me, _attacker, exploit) { if (exploit) me.gain(exploit, 'discard'); } },
    *effect(c) { c.draw(2); },
  },
];

export const CARDS: Record<string, CardDef> = Object.fromEntries(defs.map((d) => [d.id, d]));
export const ALL_CARDS = defs;
const indexGroup = (d: CardDef) =>
  d.kind === 'currency' ? 0 : d.kind === 'data' ? 1 : d.kind === 'malware' ? 2 : d.exploit ? 4 : d.daemon ? 5 : 3;
/** Card index order: currency, data, malware, programs, exploits, daemons, cheapest first within each group. */
export const INDEX_CARDS = [...defs].sort((a, b) => indexGroup(a) - indexGroup(b) || a.cost - b.cost);
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
