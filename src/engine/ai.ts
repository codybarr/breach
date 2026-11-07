import type { CardDef } from './cards';
import type { Card, Game, HandPrompt, Prompt, SupplyPrompt } from './game';

export type Difficulty = 'easy' | 'normal' | 'hard';

const BASE_VALUE: Record<string, number> = {
  l2cache: 55, serverrack: 52, overclock: 48, ddos: 50, rootkit: 58, trojan: 54,
  zeroday: 44, packetsniffer: 44, botnet: 40, backdoor: 42, encryption: 33, patch: 28,
  honeypot: 38, firewall: 22, garbagecollector: 30, defrag: 25, cryptominer: 30, compiler: 26,
  recursion: 30, antivirus: 0, phishing: 32, scriptkiddie: 27, fork: 30,
};

/**
 * Heuristic opponent. One `step()` = one visible action, so the UI can pace the AI's turn.
 */
export class AI {
  private noise: number;
  constructor(public p: number, public difficulty: Difficulty) {
    this.noise = difficulty === 'easy' ? 45 : difficulty === 'normal' ? 10 : 0;
  }

  private jitter() {
    return this.noise ? (Math.random() - 0.5) * this.noise : 0;
  }

  /** Perform a single action on the AI's turn. */
  step(g: Game) {
    const s = g.players[this.p];
    if (g.phase === 'action' && s.cycles > 0) {
      const pick = this.bestAction(g, s.hand);
      if (pick) {
        g.playCard(this.p, pick);
        return;
      }
    }
    if (s.hand.some((c) => g.def(c).kind === 'currency')) {
      g.playAllCurrency(this.p);
      return;
    }
    if (g.phase === 'action') {
      g.toBuyPhase(this.p);
      return;
    }
    if (s.bandwidth > 0) {
      const pile = this.bestPile(g, (id) => g.canBuy(this.p, id), s.bandwidth > 1 ? 15 : 1);
      if (pile) {
        g.buy(this.p, pile);
        return;
      }
    }
    g.endTurn(this.p);
  }

  answer(g: Game, pr: Prompt): number[] | string | null {
    return pr.kind === 'hand' ? this.answerHand(g, pr) : this.answerSupply(g, pr);
  }

  // ───────────────────────── action phase ─────────────────────────

  private bestAction(g: Game, hand: Card[]): Card | null {
    let best: Card | null = null;
    let bestScore = 0;
    for (const c of hand) {
      const d = g.def(c);
      if (d.kind !== 'program') continue;
      const sc = this.actionScore(g, d, hand, c) + this.jitter() * 0.5;
      if (sc > bestScore) { bestScore = sc; best = c; }
    }
    return best;
  }

  private actionScore(g: Game, d: CardDef, hand: Card[], self?: Card): number {
    const opp = g.players[1 - this.p];
    const me = g.players[this.p];
    const has = (f: (x: CardDef) => boolean) => hand.some((c) => c !== self && f(g.def(c)));
    if (d.givesCycles) return 100 + d.givesCycles * 3 + d.cost;
    switch (d.id) {
      case 'zeroday': return opp.integrity <= 8 ? 98 : 72;
      case 'recursion': return has((x) => x.kind === 'program') ? 92 : -1;
      case 'rootkit': return 84;
      case 'ddos': return 80;
      case 'trojan': return 78;
      case 'overclock': return 76;
      case 'packetsniffer': return 72;
      case 'compiler': return 60;
      case 'firewall': return 58;
      case 'phishing': return 56;
      case 'honeypot': return 50;
      case 'antivirus': return 62;
      case 'garbagecollector': return has((x) => this.isJunk(g, x)) ? 64 : -1;
      case 'defrag': return has((x) => x.kind === 'malware' || x.id === 'node' || x.id === 'megabyte') ? 66 : -1;
      case 'cryptominer': return has((x) => x.id === 'megabyte' || x.id === 'gigabyte') ? 63 : -1;
      default: return me.cycles > 0 ? 40 : -1;
    }
  }

  // ───────────────────────── buying / gaining ─────────────────────────

  private bestPile(g: Game, ok: (id: string) => boolean, threshold: number): string | null {
    let best: string | null = null;
    let bestV = threshold;
    for (const id of g.piles) {
      if (!ok(id)) continue;
      const v = this.cardValue(g, id) + this.jitter();
      if (v > bestV) { bestV = v; best = id; }
    }
    return best;
  }

  /** How much the AI wants another copy of a card right now. */
  cardValue(g: Game, id: string): number {
    const d = g.def(id);
    const mine = g.allCards(this.p);
    const opp = g.players[1 - this.p];
    const me = g.players[this.p];
    const rootLeft = g.supply.mainframe;
    const late = rootLeft <= 4 || g.emptyPiles() >= 2;
    const money = mine.reduce((a, c) => a + (g.def(c).credits ?? 0), 0);
    const copies = mine.filter((c) => c.def === id).length;

    switch (id) {
      case 'mainframe': return money < 12 && !late ? 45 : 100;
      case 'terabyte': return late ? 40 : 62;
      case 'server': return late ? 75 : rootLeft <= 6 ? 50 : 12;
      case 'node': return rootLeft <= 2 ? 35 : rootLeft <= 3 ? 16 : -5;
      case 'gigabyte': return late ? 18 : 30;
      case 'megabyte': return -5;
      case 'malware': return -100;
    }

    let v = BASE_VALUE[id] ?? 20;
    if (late) v -= 25;
    v -= copies * 8;

    const terminals = mine.filter((c) => {
      const x = g.def(c);
      return x.kind === 'program' && !x.givesCycles;
    }).length;
    if (d.kind === 'program' && !d.givesCycles && terminals >= 1 + Math.floor(mine.length / 7)) v -= 30;
    if (id === 'fork') v += terminals * 6 - 20;

    // Hybrid win condition: smell blood, or shore up defenses.
    if (d.exploit && opp.integrity <= 10) v += 20;
    if (d.exploit && this.difficulty === 'hard') v += 6;
    if ((id === 'patch' || id === 'encryption') && me.integrity <= 10) v += 30;
    if (id === 'antivirus') v = mine.filter((c) => c.def === 'malware').length * 14 - copies * 20;
    const oppExploits = g.allCards(1 - this.p).filter((c) => g.def(c).exploit).length;
    if (d.daemon) v += oppExploits * 5;
    if (id === 'garbagecollector' && g.turn > 8) v -= 40;
    return v;
  }

  private answerSupply(g: Game, pr: SupplyPrompt): string | null {
    return this.bestPile(g, (id) => g.supplyEligible(pr, id), 0);
  }

  // ───────────────────────── hand choices ─────────────────────────

  private isJunk(g: Game, d: CardDef): boolean {
    if (d.kind === 'malware') return true;
    if (d.id === 'node') return g.supply.mainframe > 4;
    if (d.id === 'megabyte') {
      const money = g.allCards(this.p).reduce((a, c) => a + (g.def(c).credits ?? 0), 0);
      return money >= 9;
    }
    return false;
  }

  /** Lower = happier to lose it. */
  private keepValue(d: CardDef): number {
    if (d.kind === 'malware') return -10;
    if (d.kind === 'data') return d.id === 'node' ? -2 : -1;
    if (d.kind === 'currency') return (d.credits ?? 0) * 3;
    return 4 + d.cost;
  }

  private answerHand(g: Game, pr: HandPrompt): number[] {
    const hand = g.players[pr.player].hand;
    const idx = hand.map((_, i) => i).filter((i) => g.handEligible(pr, hand[i]));
    const byKeep = [...idx].sort((a, b) => this.keepValue(g.def(hand[a])) - this.keepValue(g.def(hand[b])));

    if (pr.purpose === 'play') {
      const best = [...idx].sort((a, b) =>
        this.actionScore(g, g.def(hand[b]), hand, hand[b]) - this.actionScore(g, g.def(hand[a]), hand, hand[a]));
      return best.slice(0, pr.min || 1);
    }
    if (pr.purpose === 'trash') {
      const money = g.allCards(pr.player).reduce((a, c) => a + (g.def(c).credits ?? 0), 0);
      const out: number[] = [];
      let moneyLeft = money;
      for (const i of byKeep) {
        if (out.length >= pr.max) break;
        const d = g.def(hand[i]);
        if (d.kind === 'malware' || (d.id === 'node' && g.supply.mainframe > 4)) out.push(i);
        else if (d.id === 'megabyte' && moneyLeft - 1 >= 7) { out.push(i); moneyLeft--; }
      }
      while (out.length < pr.min) out.push(byKeep.find((i) => !out.includes(i))!);
      return out;
    }
    if (pr.purpose === 'trashUpgrade') {
      // Prefer junk, then the cheapest currency.
      const pick = byKeep[0];
      return [pick];
    }
    // discard
    return byKeep.slice(0, pr.min);
  }
}
