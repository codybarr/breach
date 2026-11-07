import { BASIC_PILES, CARDS, KINGDOM_POOL, type CardDef } from './cards';
import { Rng } from './rng';

export const MAX_INTEGRITY = 20;
export const HAND_SIZE = 5;

export interface Card {
  id: number; // unique instance id
  def: string; // card definition id
}

export interface PlayerState {
  name: string;
  isAI: boolean;
  deck: Card[]; // top of deck = end of array
  hand: Card[];
  discard: Card[];
  inPlay: Card[];
  integrity: number;
  shield: number;
  cycles: number;
  credits: number;
  bandwidth: number;
}

export type Purpose = 'trash' | 'trashUpgrade' | 'discard' | 'play';

export interface HandPrompt {
  kind: 'hand';
  player: number;
  min: number;
  max: number;
  purpose: Purpose;
  title: string;
  filter?: (d: CardDef) => boolean;
}

export interface SupplyPrompt {
  kind: 'supply';
  player: number;
  maxCost: number;
  title: string;
  filter?: (d: CardDef) => boolean;
}

export type Prompt = HandPrompt | SupplyPrompt;
export type Effect = Generator<Prompt, void, any>;

export type GameEvent =
  | { t: 'play'; p: number; card: Card }
  | { t: 'breach'; p: number; amount: number; absorbed: number }
  | { t: 'heal'; p: number; amount: number }
  | { t: 'shield'; p: number; amount: number }
  | { t: 'gain'; p: number; card: Card; dest: 'hand' | 'discard' }
  | { t: 'trash'; p: number; card: Card }
  | { t: 'block'; p: number; by: string; exploit: string }
  | { t: 'shuffle'; p: number }
  | { t: 'turn'; p: number }
  | { t: 'gameover' };

export interface GameOver {
  winner: number; // -1 = draw
  reason: string;
  scores: [number, number];
}

export interface GameOptions {
  seed?: number;
  names?: [string, string];
  aiFlags?: [boolean, boolean];
  kingdom?: string[];
  firstPlayer?: number;
}

export class Game {
  readonly rng: Rng;
  players: [PlayerState, PlayerState];
  supply: Record<string, number> = {};
  basicOrder = BASIC_PILES;
  kingdom: string[];
  trash: Card[] = [];
  current = 0;
  phase: 'action' | 'buy' = 'action';
  turn = 0;
  over: GameOver | null = null;
  pending: Prompt | null = null;
  logLines: string[] = [];
  events: GameEvent[] = [];

  private runner: Effect | null = null;
  private nextId = 1;

  constructor(opts: GameOptions = {}) {
    this.rng = new Rng(opts.seed ?? (Math.random() * 2 ** 31) | 0);
    const names = opts.names ?? ['YOU', 'GHOST'];
    const ai = opts.aiFlags ?? [false, true];
    this.players = [0, 1].map((i) => ({
      name: names[i], isAI: ai[i], deck: [], hand: [], discard: [], inPlay: [],
      integrity: MAX_INTEGRITY, shield: 0, cycles: 0, credits: 0, bandwidth: 0,
    })) as unknown as [PlayerState, PlayerState];

    this.kingdom = opts.kingdom ?? this.pickKingdom();
    for (const id of BASIC_PILES) {
      this.supply[id] = id === 'megabyte' ? 46 : id === 'gigabyte' ? 40 : id === 'terabyte' ? 30 : id === 'malware' ? 10 : 8;
    }
    for (const id of this.kingdom) this.supply[id] = 10;

    for (const p of this.players) {
      for (let i = 0; i < 7; i++) p.deck.push(this.make('megabyte'));
      for (let i = 0; i < 3; i++) p.deck.push(this.make('node'));
      this.rng.shuffle(p.deck);
    }
    for (let i = 0; i < 2; i++) this.drawCards(i, HAND_SIZE, true);

    this.current = opts.firstPlayer ?? this.rng.int(2);
    this.log(`>> session start. ${this.players[this.current].name} has first move.`);
    this.startTurn(this.current);
  }

  /** 10 random programs, guaranteeing at least 2 exploits so the integrity race matters. */
  private pickKingdom(): string[] {
    for (;;) {
      const pool = [...KINGDOM_POOL];
      this.rng.shuffle(pool);
      const pick = pool.slice(0, 10);
      if (pick.filter((id) => CARDS[id].exploit).length >= 2) {
        return pick.sort((a, b) => CARDS[a].cost - CARDS[b].cost || a.localeCompare(b));
      }
    }
  }

  get piles(): string[] {
    return [...this.basicOrder, ...this.kingdom];
  }

  def(c: Card | string): CardDef {
    return CARDS[typeof c === 'string' ? c : c.def];
  }

  private make(def: string): Card {
    return { id: this.nextId++, def };
  }

  log(msg: string) {
    this.logLines.push(msg);
    if (this.logLines.length > 200) this.logLines.shift();
  }

  emit(e: GameEvent) {
    this.events.push(e);
  }

  // ───────────────────────── queries ─────────────────────────

  vp(p: number): number {
    const s = this.players[p];
    let v = 0;
    for (const z of [s.deck, s.hand, s.discard, s.inPlay]) for (const c of z) v += this.def(c).vp ?? 0;
    return v;
  }

  allCards(p: number): Card[] {
    const s = this.players[p];
    return [...s.deck, ...s.hand, ...s.discard, ...s.inPlay];
  }

  emptyPiles(): number {
    return this.piles.filter((id) => this.supply[id] <= 0).length;
  }

  canPlay(p: number, card: Card): boolean {
    if (this.over || this.pending || this.current !== p) return false;
    const s = this.players[p];
    if (!s.hand.includes(card)) return false;
    const d = this.def(card);
    if (d.kind === 'program') return this.phase === 'action' && s.cycles > 0;
    if (d.kind === 'currency') return true;
    return false;
  }

  canBuy(p: number, pile: string): boolean {
    if (this.over || this.pending || this.current !== p || this.def(pile)?.kind === 'malware') return false;
    const s = this.players[p];
    return s.bandwidth > 0 && (this.supply[pile] ?? 0) > 0 && s.credits >= this.def(pile).cost;
  }

  /** Is a supply pile a legal answer to the current supply prompt? */
  supplyEligible(pr: SupplyPrompt, pile: string): boolean {
    const d = this.def(pile);
    return (this.supply[pile] ?? 0) > 0 && d.cost <= pr.maxCost && (!pr.filter || pr.filter(d));
  }

  handEligible(pr: HandPrompt, card: Card): boolean {
    return !pr.filter || pr.filter(this.def(card));
  }

  // ───────────────────────── player actions ─────────────────────────

  playCard(p: number, card: Card): boolean {
    if (!this.canPlay(p, card)) return false;
    const s = this.players[p];
    const d = this.def(card);
    if (d.kind === 'currency') {
      this.phase = 'buy';
      this.moveToPlay(p, card);
      s.credits += d.credits ?? 0;
      return true;
    }
    s.cycles--;
    this.moveToPlay(p, card);
    this.log(`${s.name} runs ${d.name}.`);
    this.startRunner(this.runEffect(p, card));
    return true;
  }

  playAllCurrency(p: number) {
    if (this.over || this.pending || this.current !== p) return;
    const s = this.players[p];
    const cur = s.hand.filter((c) => this.def(c).kind === 'currency');
    for (const c of cur) this.playCard(p, c);
    this.phase = 'buy';
  }

  toBuyPhase(p: number) {
    if (this.over || this.pending || this.current !== p) return;
    this.phase = 'buy';
  }

  buy(p: number, pile: string): boolean {
    if (!this.canBuy(p, pile)) return false;
    const s = this.players[p];
    this.phase = 'buy';
    s.credits -= this.def(pile).cost;
    s.bandwidth--;
    this.log(`${s.name} acquires ${this.def(pile).name}.`);
    this.gainCard(p, pile, 'discard');
    return true;
  }

  endTurn(p: number) {
    if (this.over || this.pending || this.current !== p) return;
    const s = this.players[p];
    s.discard.push(...s.inPlay, ...s.hand);
    s.inPlay = [];
    s.hand = [];
    s.cycles = s.credits = s.bandwidth = 0;
    this.drawCards(p, HAND_SIZE, true);

    if (this.supply.mainframe <= 0 || this.emptyPiles() >= 3) {
      this.finishByScore(this.supply.mainframe <= 0 ? 'MAINFRAME CAPTURED' : 'THREE SUPPLY PILES EMPTY');
      return;
    }
    this.startTurn(1 - p);
  }

  /** Player `p` leaves the match (abort or dropped link); the other player wins. */
  forfeit(p: number, reason: string) {
    if (this.over) return;
    this.runner = null;
    this.finish(1 - p, reason);
  }

  answer(a: number[] | string | null): boolean {
    const pr = this.pending;
    if (!pr) return false;
    if (pr.kind === 'hand') {
      if (!Array.isArray(a)) return false;
      const hand = this.players[pr.player].hand;
      const uniq = new Set(a);
      if (uniq.size !== a.length || a.length < pr.min || a.length > pr.max) return false;
      if (a.some((i) => i < 0 || i >= hand.length || !this.handEligible(pr, hand[i]))) return false;
    } else {
      if (a !== null && (typeof a !== 'string' || !this.supplyEligible(pr, a))) return false;
    }
    this.advance(a);
    return true;
  }

  // ───────────────────────── effect runner ─────────────────────────

  private startRunner(eff: Effect) {
    this.runner = eff;
    this.advance(undefined);
  }

  private advance(input: unknown) {
    let next = input;
    for (;;) {
      if (!this.runner) return;
      if (this.over) {
        this.runner = null;
        this.pending = null;
        return;
      }
      const r = this.runner.next(next);
      if (r.done) {
        this.runner = null;
        this.pending = null;
        return;
      }
      const pr = r.value;
      // Auto-resolve prompts with no meaningful choice.
      if (pr.kind === 'hand') {
        const hand = this.players[pr.player].hand;
        const eligible = hand.map((c, i) => (this.handEligible(pr, c) ? i : -1)).filter((i) => i >= 0);
        pr.min = Math.min(pr.min, eligible.length);
        pr.max = Math.min(pr.max, eligible.length);
        if (pr.max === 0) { next = []; continue; }
        if (pr.min === eligible.length && pr.max === eligible.length) { next = eligible; continue; }
      } else if (!this.piles.some((id) => this.supplyEligible(pr, id))) {
        next = null;
        continue;
      }
      this.pending = pr;
      return;
    }
  }

  *runEffect(p: number, card: Card): Effect {
    const d = this.def(card);
    this.emit({ t: 'play', p, card });
    if (d.effect) yield* d.effect(new Ctx(this, p, card));
  }

  // ───────────────────────── primitives ─────────────────────────

  private moveToPlay(p: number, card: Card) {
    const s = this.players[p];
    s.hand.splice(s.hand.indexOf(card), 1);
    s.inPlay.push(card);
  }

  drawCards(p: number, n: number, quiet = false) {
    const s = this.players[p];
    let drawn = 0;
    for (let i = 0; i < n; i++) {
      if (s.deck.length === 0) {
        if (s.discard.length === 0) break;
        s.deck = s.discard;
        s.discard = [];
        this.rng.shuffle(s.deck);
        this.emit({ t: 'shuffle', p });
      }
      s.hand.push(s.deck.pop()!);
      drawn++;
    }
    if (!quiet && drawn) this.log(`  ${s.name} draws ${drawn}.`);
  }

  gainCard(p: number, pile: string, dest: 'hand' | 'discard'): Card | null {
    if ((this.supply[pile] ?? 0) <= 0) return null;
    this.supply[pile]--;
    const c = this.make(pile);
    const s = this.players[p];
    (dest === 'hand' ? s.hand : s.discard).push(c);
    this.emit({ t: 'gain', p, card: c, dest });
    return c;
  }

  trashCard(p: number, c: Card) {
    this.trash.push(c);
    this.emit({ t: 'trash', p, card: c });
  }

  breach(p: number, n: number) {
    if (n <= 0) return;
    const s = this.players[p];
    const absorbed = Math.min(s.shield, n);
    s.shield -= absorbed;
    const dmg = n - absorbed;
    s.integrity -= dmg;
    this.emit({ t: 'breach', p, amount: dmg, absorbed });
    this.log(`  !! ${s.name} breached for ${dmg}${absorbed ? ` (${absorbed} absorbed)` : ''}. INT ${Math.max(0, s.integrity)}.`);
    if (s.integrity <= 0 && !this.over) {
      s.integrity = 0;
      this.finish(1 - p, `${s.name} SYSTEM CRASH`);
    }
  }

  heal(p: number, n: number) {
    const s = this.players[p];
    const amt = Math.min(n, MAX_INTEGRITY - s.integrity);
    s.integrity += amt;
    if (amt > 0) {
      this.emit({ t: 'heal', p, amount: amt });
      this.log(`  ${s.name} restores ${amt} integrity.`);
    }
  }

  // ───────────────────────── turn flow ─────────────────────────

  private startTurn(p: number) {
    this.current = p;
    this.turn++;
    const s = this.players[p];
    s.shield = 0;
    s.cycles = 1;
    s.bandwidth = 1;
    s.credits = 0;
    this.phase = 'action';
    this.emit({ t: 'turn', p });
    this.log(`── turn ${Math.ceil(this.turn / 2)} · ${s.name} ──`);
  }

  private finishByScore(reason: string) {
    const a = this.vp(0), b = this.vp(1);
    let w = a > b ? 0 : b > a ? 1 : -1;
    if (w === -1) {
      const ia = this.players[0].integrity, ib = this.players[1].integrity;
      w = ia > ib ? 0 : ib > ia ? 1 : -1;
    }
    this.finish(w, reason);
  }

  private finish(winner: number, reason: string) {
    this.over = { winner, reason, scores: [this.vp(0), this.vp(1)] };
    this.pending = null;
    this.log(`>> ${reason}. ${winner === -1 ? 'DRAW' : `${this.players[winner].name} WINS`}.`);
    this.emit({ t: 'gameover' });
  }
}

/** The API card effects are written against. `p` is "me" from the effect's point of view. */
export class Ctx {
  constructor(public g: Game, public p: number, public self: Card | null) {}

  get me() { return this.g.players[this.p]; }
  get opp() { return this.g.players[1 - this.p]; }
  def(c: Card | string) { return this.g.def(c); }

  draw(n: number) { this.g.drawCards(this.p, n); }
  cycles(n: number) { this.me.cycles += n; }
  credits(n: number) { this.me.credits += n; }
  bandwidth(n: number) { this.me.bandwidth += n; }
  heal(n: number) { this.g.heal(this.p, n); }
  breach(n: number) { this.g.breach(this.p, n); }
  shield(n: number) {
    this.me.shield += n;
    this.g.emit({ t: 'shield', p: this.p, amount: n });
    this.g.log(`  ${this.me.name} raises ${n} shield.`);
  }

  gain(pile: string, dest: 'hand' | 'discard') {
    const c = this.g.gainCard(this.p, pile, dest);
    if (c) this.g.log(`  ${this.me.name} gains ${this.def(pile).name}${dest === 'hand' ? ' (to hand)' : ''}.`);
  }

  trashFromHand(indices: number[]) {
    const hand = this.me.hand;
    const picked = indices.map((i) => hand[i]);
    for (const c of picked) {
      hand.splice(hand.indexOf(c), 1);
      this.g.trashCard(this.p, c);
    }
    if (picked.length) this.g.log(`  ${this.me.name} trashes ${picked.map((c) => this.def(c).name).join(', ')}.`);
  }

  discardFromHand(indices: number[]) {
    const hand = this.me.hand;
    const picked = indices.map((i) => hand[i]);
    for (const c of picked) {
      hand.splice(hand.indexOf(c), 1);
      this.me.discard.push(c);
    }
    if (picked.length) this.g.log(`  ${this.me.name} discards ${picked.length}.`);
  }

  trashSelf() {
    const c = this.self;
    if (!c) return;
    const i = this.me.inPlay.indexOf(c);
    if (i < 0) return;
    this.me.inPlay.splice(i, 1);
    this.g.trashCard(this.p, c);
    this.g.log(`  ${this.def(c).name} burns out.`);
  }

  promptHand(o: Omit<HandPrompt, 'kind' | 'player'>): Prompt {
    return { kind: 'hand', player: this.p, ...o };
  }

  promptSupply(o: Omit<SupplyPrompt, 'kind' | 'player'>): Prompt {
    return { kind: 'supply', player: this.p, ...o };
  }

  /** Resolve an exploit against the opponent, honoring Daemons in their hand. */
  *exploit(fn: (target: Ctx) => Effect): Effect {
    const tgt = 1 - this.p;
    const ts = this.g.players[tgt];
    const name = this.self ? this.def(this.self).name : 'exploit';
    const honeypot = ts.hand.find((c) => c.def === 'honeypot');
    const firewall = ts.hand.find((c) => c.def === 'firewall');
    const blocker = honeypot ?? firewall;
    if (blocker) {
      const bn = this.def(blocker).name;
      this.g.emit({ t: 'block', p: tgt, by: blocker.def, exploit: name });
      this.g.log(`  ${ts.name}'s ${bn} blocks ${name}.`);
      if (honeypot) this.g.breach(this.p, 2);
      return;
    }
    yield* fn(new Ctx(this.g, tgt, null));
  }

  *runTwice(handIndex: number): Effect {
    const card = this.me.hand[handIndex];
    this.me.hand.splice(handIndex, 1);
    this.me.inPlay.push(card);
    this.g.log(`  ${this.me.name} recurses ${this.def(card).name}.`);
    yield* this.g.runEffect(this.p, card);
    yield* this.g.runEffect(this.p, card);
  }
}
