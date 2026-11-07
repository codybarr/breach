import * as THREE from 'three';
import { sfx } from '../audio/sfx';
import { AI, type Difficulty } from '../engine/ai';
import { CARDS } from '../engine/cards';
import { Game, MAX_INTEGRITY, type Card, type GameEvent } from '../engine/game';
import { CardView } from '../render/cardView';
import { VH, VW, type SceneLike, type Stage } from '../render/stage';
import { Button, COLOR, CanvasPlane, FONT, Label, TITLE_FONT, drawFrame, hexA, wrap } from '../render/ui';
import { DIFFICULTIES } from './StartScene';

const HUMAN = 0;
const BOT = 1;

// ───────────────────────── layout (virtual px, y-up) ─────────────────────────
const MID_X = 707;
const L = {
  hand: { x: MID_X, y: 140, s: 1 },
  play: { x: MID_X, y: 362, s: 0.62 },
  aiHand: { x: MID_X - 40, y: 840, s: 0.42 },
  banner: { x: MID_X, y: 452 },
  trash: { x: MID_X, y: 470 },
  deck: [{ x: 82, y: 108 }, { x: 980, y: 840 }],
  discard: [{ x: 205, y: 108 }, { x: 1050, y: 840 }],
  pileScale: [0.62, 0.42],
  panel: [{ x: 172, y: 252, h: 128 }, { x: 172, y: 840, h: 104 }],
  preview: { x: 1345, y: 606, s: 1.72 },
  res: { x: 1345, y: 382 },
  log: { x: 1345, y: 112 },
};
const BASIC_POS: Record<string, { x: number; y: number }> = {
  bit: { x: 75, y: 712 }, byte: { x: 172, y: 712 }, terabyte: { x: 269, y: 712 },
  fragment: { x: 75, y: 560 }, database: { x: 172, y: 560 }, rootaccess: { x: 269, y: 560 },
  malware: { x: 172, y: 408 },
};
const BASIC_S = 0.58;
const KINGDOM_S = 0.66;

interface Tracked { view: CardView; owner: number }
interface Floater { label: Label; vy: number; life: number; max: number }

export class GameScene implements SceneLike {
  root = new THREE.Group();
  game: Game;
  private ai: AI;
  private difficulty: Difficulty;

  private views = new Map<number, Tracked>();
  private transients: CardView[] = [];
  private spawnFrom = new Map<number, { x: number; y: number }>();
  private piles = new Map<string, { view: CardView; count: Label; x: number; y: number; s: number }>();
  private deckViews: CardView[] = [];
  private discardViews: CardView[] = [];
  private pileCounts: Label[] = [];

  private panels: CanvasPlane[] = [];
  private panelKeys = ['', ''];
  private res: CanvasPlane;
  private resKey = '';
  private log: CanvasPlane;
  private logKey = '';
  private banner: Label;
  private info: Label;
  private preview: CardView;
  private previewFrame: CanvasPlane;
  private bigText: Label;
  private bigTextLife = 0;
  private btnA: Button;
  private btnB: Button;
  private btnC: Button;
  private btnAbort: Button;
  private abortArmed = 0;
  private floaters: Floater[] = [];

  private overlay = new THREE.Group();
  private overlayButtons: Button[] = [];
  private overDelay = -1;

  private selected = new Set<number>();
  private aiTimer = 0;
  private hoveredCardId: number | null = null;

  constructor(private stage: Stage, opts: { difficulty: Difficulty; onExit: () => void; onRestart: () => void }) {
    this.difficulty = opts.difficulty;
    stage.bg.setIntensity(0.45);
    this.game = new Game({ names: ['YOU', 'GHOST'], aiFlags: [false, true] });
    this.ai = new AI(BOT, opts.difficulty);

    this.buildSupply();
    this.buildPiles();

    for (let p = 0; p < 2; p++) {
      const pl = L.panel[p];
      const c = new CanvasPlane(316, pl.h);
      c.at(pl.x, pl.y, 5);
      this.panels.push(c);
      this.root.add(c.mesh);
    }

    this.res = new CanvasPlane(480, 76).at(L.res.x, L.res.y, 5);
    this.log = new CanvasPlane(480, 196).at(L.log.x, L.log.y, 5);
    this.banner = new Label(760, 34, '', { size: 18, align: 'center', color: COLOR.cyan, glow: 8 });
    this.banner.at(L.banner.x, L.banner.y, 6);
    this.info = new Label(330, 30, '', { size: 14, color: COLOR.mid, glow: 0 });
    this.info.at(1265, 866, 5);
    this.bigText = new Label(900, 120, '', { size: 92, font: TITLE_FONT, align: 'center', color: COLOR.green, glow: 24 });
    this.bigText.at(MID_X, 470, 400);
    this.bigText.mat.opacity = 0;
    this.root.add(this.res.mesh, this.log.mesh, this.banner.mesh, this.info.mesh, this.bigText.mesh);

    this.previewFrame = new CanvasPlane(280, 384);
    this.previewFrame.redraw((ctx, w, h) => {
      drawFrame(ctx, 6, 6, w - 12, h - 12, COLOR.dim, { fill: 'rgba(2,10,7,0.5)', title: ' INSPECT ' });
      ctx.font = `14px ${FONT}`;
      ctx.fillStyle = COLOR.mid;
      ctx.textAlign = 'center';
      ctx.fillText('hover a card', w / 2, h / 2 - 8);
      ctx.fillText('to inspect it', w / 2, h / 2 + 12);
    });
    this.previewFrame.at(L.preview.x, L.preview.y, 4);
    this.root.add(this.previewFrame.mesh);
    this.preview = new CardView('bit');
    this.preview.place(L.preview.x, L.preview.y, 300, L.preview.s).snap();
    this.preview.group.visible = false;
    this.preview.speed = 30;
    this.root.add(this.preview.group);

    this.btnA = new Button(232, 54, { label: 'RUN CURRENCY', hotkey: 'C', color: COLOR.amber });
    this.btnA.at(1226, 300, 20);
    this.btnA.onClick = () => this.game.playAllCurrency(HUMAN);
    this.btnB = new Button(232, 54, { label: 'END ACTIONS', hotkey: 'E', color: COLOR.cyan });
    this.btnB.at(1464, 300, 20);
    this.btnB.onClick = () => this.game.toBuyPhase(HUMAN);
    this.btnC = new Button(470, 56, { label: 'END TURN', hotkey: 'SPACE', color: COLOR.orange });
    this.btnC.at(1345, 238, 20);
    this.btnC.onClick = () => this.primaryAction();
    this.btnAbort = new Button(150, 38, { label: 'ABORT', color: COLOR.red });
    this.btnAbort.at(1510, 866, 20);
    this.btnAbort.onClick = () => {
      if (this.abortArmed > 0) opts.onExit();
      else {
        this.abortArmed = 3;
        this.btnAbort.set({ label: 'CONFIRM?' });
      }
    };
    this.root.add(this.btnA.mesh, this.btnB.mesh, this.btnC.mesh, this.btnAbort.mesh);

    this.buildOverlay(opts);
    this.drainEvents();
    this.sync(0, 0, true);
  }

  // ───────────────────────── construction ─────────────────────────

  private buildSupply() {
    const g = this.game;
    const place = (id: string, x: number, y: number, s: number) => {
      const v = new CardView(id);
      v.place(x, y, 10, s).snap();
      v.face.userData.preview = id;
      v.face.userData.onClick = () => this.onPileClick(id);
      v.face.userData.onHover = (on: boolean) => on && sfx.hover();
      const count = new Label(70, 20, '', { size: 14, align: 'center', color: COLOR.white, glow: 4 });
      count.at(x, y - (210 * s) / 2 - 11, 11);
      this.root.add(v.group, count.mesh);
      this.piles.set(id, { view: v, count, x, y, s });
    };
    for (const id of g.basicOrder) place(id, BASIC_POS[id].x, BASIC_POS[id].y, BASIC_S);
    g.kingdom.forEach((id, i) => {
      const col = i % 5, row = Math.floor(i / 5);
      place(id, MID_X + (col - 2) * 124, 712 - row * 152, KINGDOM_S);
    });
  }

  private buildPiles() {
    for (let p = 0; p < 2; p++) {
      const s = L.pileScale[p];
      const deck = new CardView('bit', false);
      deck.place(L.deck[p].x, L.deck[p].y, 8, s).snap();
      const disc = new CardView('bit', true);
      disc.place(L.discard[p].x, L.discard[p].y, 8, s).snap();
      this.deckViews.push(deck);
      this.discardViews.push(disc);
      this.root.add(deck.group, disc.group);
      for (const pos of [L.deck[p], L.discard[p]]) {
        const l = new Label(110, 18, '', { size: 12, align: 'center', color: COLOR.mid, glow: 0 });
        l.at(pos.x, pos.y - (210 * s) / 2 - 10, 9);
        this.pileCounts.push(l);
        this.root.add(l.mesh);
      }
    }
  }

  private buildOverlay(opts: { onExit: () => void; onRestart: () => void }) {
    const shade = new THREE.Mesh(
      new THREE.PlaneGeometry(VW * 3, VH * 3),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.78, depthTest: false, depthWrite: false }),
    );
    shade.position.set(VW / 2, VH / 2, 500);
    shade.renderOrder = 500;
    this.overlay.add(shade);
    const again = new Button(260, 58, { label: 'RUN AGAIN', color: COLOR.green });
    again.onClick = opts.onRestart;
    again.at(MID_X + 30 - 150, 300, 520);
    const menu = new Button(260, 58, { label: 'MAIN MENU', color: COLOR.cyan });
    menu.onClick = opts.onExit;
    menu.at(MID_X + 30 + 150, 300, 520);
    this.overlayButtons.push(again, menu);
    this.overlay.add(again.mesh, menu.mesh);
    this.overlay.visible = false;
    // Group renderOrder sorts before child renderOrder, so lift the whole overlay above the board.
    this.overlay.renderOrder = 1000;
    this.root.add(this.overlay);
  }

  private showGameOver() {
    const o = this.game.over!;
    const won = o.winner === HUMAN, draw = o.winner === -1;
    const color = won ? COLOR.green : draw ? COLOR.amber : COLOR.red;
    const head = new Label(1100, 140, won ? 'ACCESS GRANTED' : draw ? 'STALEMATE' : 'CONNECTION LOST',
      { size: 120, font: TITLE_FONT, align: 'center', color, glow: 30 });
    head.at(MID_X + 30, 590, 510);
    const p = this.game.players;
    const sub = new Label(1000, 90,
      `${o.reason}\nVP  YOU ${o.scores[0]}  ·  GHOST ${o.scores[1]}     INT  YOU ${p[0].integrity}  ·  GHOST ${p[1].integrity}`,
      { size: 20, align: 'center', color: COLOR.white, glow: 6, lineHeight: 1.6 });
    sub.at(MID_X + 30, 450, 510);
    this.overlay.add(head.mesh, sub.mesh);
    this.overlay.visible = true;
    if (won) sfx.win(); else sfx.lose();
    this.stage.pulseGlitch(1);
  }

  // ───────────────────────── input ─────────────────────────

  private humanPrompt() {
    const pr = this.game.pending;
    return pr && pr.player === HUMAN ? pr : null;
  }

  private myTurn() {
    const g = this.game;
    return !g.over && !g.pending && g.current === HUMAN;
  }

  private primaryAction() {
    const g = this.game;
    const pr = this.humanPrompt();
    if (pr?.kind === 'hand') {
      const hand = g.players[HUMAN].hand;
      const idx = hand.map((c, i) => (this.selected.has(c.id) ? i : -1)).filter((i) => i >= 0);
      if (g.answer(idx)) this.selected.clear();
      return;
    }
    if (pr?.kind === 'supply') {
      g.answer(null);
      return;
    }
    if (this.myTurn()) g.endTurn(HUMAN);
  }

  private onHandClick(card: Card) {
    const g = this.game;
    const pr = this.humanPrompt();
    if (pr?.kind === 'hand') {
      if (!g.handEligible(pr, card)) return;
      if (this.selected.has(card.id)) this.selected.delete(card.id);
      else {
        if (pr.max === 1) this.selected.clear();
        if (this.selected.size < pr.max) this.selected.add(card.id);
      }
      sfx.click();
      return;
    }
    if (g.canPlay(HUMAN, card)) {
      sfx.play();
      g.playCard(HUMAN, card);
    }
  }

  private onPileClick(id: string) {
    const g = this.game;
    const pr = this.humanPrompt();
    if (pr?.kind === 'supply') {
      if (g.supplyEligible(pr, id)) g.answer(id);
      return;
    }
    if (!this.myTurn()) return;
    // Convenience: buying from the action phase auto-runs your currency first.
    if (!g.canBuy(HUMAN, id) && g.players[HUMAN].hand.some((c) => g.def(c).kind === 'currency')) {
      if (this.potentialCredits() >= g.def(id).cost) g.playAllCurrency(HUMAN);
    }
    if (g.buy(HUMAN, id)) sfx.coin();
  }

  private potentialCredits() {
    const s = this.game.players[HUMAN];
    return s.credits + s.hand.reduce((a, c) => a + (this.game.def(c).credits ?? 0), 0);
  }

  onKey(e: KeyboardEvent) {
    if (e.key === 'm' || e.key === 'M') { sfx.muted = !sfx.muted; return; }
    if (this.game.over) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (this.btnC.opts.enabled !== false && this.btnC.mesh.visible) { sfx.click(); this.primaryAction(); }
    } else if ((e.key === 'c' || e.key === 'C') && this.myTurn()) {
      this.game.playAllCurrency(HUMAN);
    } else if ((e.key === 'e' || e.key === 'E') && this.myTurn()) {
      this.game.toBuyPhase(HUMAN);
    }
  }

  hitTargets(): THREE.Object3D[] {
    if (this.overlay.visible) return this.overlayButtons.map((b) => b.mesh);
    const out: THREE.Object3D[] = [this.btnA.mesh, this.btnB.mesh, this.btnC.mesh, this.btnAbort.mesh];
    for (const p of this.piles.values()) out.push(p.view.face);
    for (const t of this.views.values()) if (!t.view.leaving && t.view.face.userData.preview) out.push(t.view.face);
    for (const d of this.discardViews) if (d.group.visible) out.push(d.face);
    return out;
  }

  // ───────────────────────── frame ─────────────────────────

  update(dt: number, t: number) {
    const g = this.game;
    this.runAI(dt);
    this.drainEvents();

    if (this.abortArmed > 0) {
      this.abortArmed -= dt;
      if (this.abortArmed <= 0) this.btnAbort.set({ label: 'ABORT' });
    }

    const hov = this.stage.hoveredObject;
    this.hoveredCardId = hov?.userData.cardId ?? null;
    const prevId: string | undefined = hov?.userData.preview;
    if (prevId) {
      this.preview.setDef(prevId);
      this.preview.setFaceUp(true);
      this.preview.group.visible = true;
    } else {
      this.preview.group.visible = false;
    }
    this.preview.update(dt, t);

    this.sync(dt, t);
    this.refreshHud(t);

    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      f.label.mesh.position.y += f.vy * dt;
      f.label.mat.opacity = Math.min(1, f.life / (f.max * 0.4));
      if (f.life <= 0) {
        this.root.remove(f.label.mesh);
        f.label.dispose();
        this.floaters.splice(i, 1);
      }
    }
    if (this.bigTextLife > 0) {
      this.bigTextLife -= dt;
      this.bigText.mat.opacity = Math.min(1, this.bigTextLife * 2.5);
      this.bigText.mesh.scale.setScalar(1 + (1.4 - this.bigTextLife) * 0.04);
    }

    if (g.over && this.overDelay < 0) this.overDelay = 1.3;
    if (this.overDelay > 0) {
      this.overDelay -= dt;
      if (this.overDelay <= 0) {
        this.overDelay = 0;
        this.showGameOver();
      }
    }
  }

  private runAI(dt: number) {
    const g = this.game;
    if (g.over) return;
    const pr = g.pending;
    if (pr && pr.player === BOT) {
      this.aiTimer += dt;
      if (this.aiTimer > 0.8) {
        this.aiTimer = 0;
        g.answer(this.ai.answer(g, pr));
      }
    } else if (!pr && g.current === BOT) {
      this.aiTimer += dt;
      const s = g.players[BOT];
      const quick = g.phase === 'buy' || !s.hand.some((c) => g.def(c).kind === 'program');
      if (this.aiTimer > (quick ? 0.55 : 0.9)) {
        this.aiTimer = 0;
        this.ai.step(g);
      }
    } else {
      this.aiTimer = 0;
    }
  }

  private drainEvents() {
    const g = this.game;
    for (const e of g.events.splice(0)) this.onEvent(e);
  }

  private onEvent(e: GameEvent) {
    const panel = L.panel[(e as { p?: number }).p ?? 0];
    switch (e.t) {
      case 'play':
        if (e.p === BOT) sfx.play();
        break;
      case 'breach':
        if (e.amount > 0) this.float(`-${e.amount} INT`, panel.x, panel.y, COLOR.red, 34);
        if (e.absorbed > 0) this.float(`${e.absorbed} ABSORBED`, panel.x, panel.y - 30, COLOR.blue, 20);
        this.stage.pulseGlitch(e.p === HUMAN ? 0.95 : 0.45);
        sfx.breach();
        break;
      case 'heal':
        this.float(`+${e.amount} INT`, panel.x, panel.y, COLOR.green, 30);
        sfx.heal();
        break;
      case 'shield':
        this.float(`+${e.amount} SHIELD`, panel.x, panel.y, COLOR.blue, 26);
        sfx.heal();
        break;
      case 'block':
        this.float(`${CARDS[e.by].name.toUpperCase()} BLOCKED ${e.exploit.toUpperCase()}`, panel.x + 120, panel.y + 20, COLOR.blue, 22);
        sfx.block();
        break;
      case 'shuffle': {
        const d = L.deck[e.p];
        this.float('SHUFFLE', d.x, d.y + 40, COLOR.mid, 16);
        sfx.shuffle();
        break;
      }
      case 'gain': {
        const pile = this.piles.get(e.card.def);
        const from = pile ? { x: pile.x, y: pile.y } : L.trash;
        if (e.p === BOT) sfx.coin();
        if (e.dest === 'hand') {
          this.spawnFrom.set(e.card.id, from);
        } else {
          const v = new CardView(e.card.def);
          v.place(from.x, from.y, 260, pile?.s ?? 0.6).snap();
          const to = L.discard[e.p];
          v.place(to.x, to.y, 260, L.pileScale[e.p]);
          v.removeWhenArrived = true;
          v.speed = 7;
          this.transients.push(v);
          this.root.add(v.group);
        }
        break;
      }
      case 'trash':
        sfx.trash();
        break;
      case 'turn':
        sfx.turn();
        this.selected.clear();
        this.flash(e.p === HUMAN ? '// YOUR TURN //' : '// GHOST TURN //', e.p === HUMAN ? COLOR.green : COLOR.orange);
        break;
      case 'gameover':
        break;
    }
  }

  private float(text: string, x: number, y: number, color: string, size: number) {
    const w = Math.max(200, text.length * size * 0.62);
    const label = new Label(w, size * 1.6, text, { size, align: 'center', color, glow: 14, font: size > 24 ? TITLE_FONT : FONT });
    label.at(x, y, 450);
    this.root.add(label.mesh);
    this.floaters.push({ label, vy: 42, life: 1.6, max: 1.6 });
  }

  private flash(text: string, color: string) {
    this.bigText.set(text, { color });
    this.bigTextLife = 1.4;
  }

  // ───────────────────────── card reconciliation ─────────────────────────

  private sync(dt: number, t: number, snap = false) {
    const g = this.game;
    const pr = this.humanPrompt();
    const visible = new Set<number>();

    const want = (c: Card, owner: number, x: number, y: number, z: number, s: number, rot: number, faceUp: boolean) => {
      visible.add(c.id);
      let tr = this.views.get(c.id);
      if (!tr) {
        const v = new CardView(c.def, faceUp);
        const from = this.spawnFrom.get(c.id) ?? L.deck[owner];
        this.spawnFrom.delete(c.id);
        v.place(from.x, from.y, z, L.pileScale[owner] * 0.9).snap();
        v.face.userData.cardId = c.id;
        if (faceUp) v.face.userData.preview = c.def;
        if (owner === HUMAN) v.face.userData.onClick = () => this.onHandClick(c);
        tr = { view: v, owner };
        this.views.set(c.id, tr);
        this.root.add(v.group);
        if (owner === HUMAN && !snap) sfx.draw();
      }
      const v = tr.view;
      v.leaving = false;
      v.removeWhenArrived = false;
      v.target.opacity = 1;
      if (v.isFaceUp !== faceUp) {
        v.setFaceUp(faceUp);
        v.face.userData.preview = faceUp ? c.def : undefined;
      }
      v.place(x, y, z, s, rot);
      return v;
    };

    // Human hand.
    const me = g.players[HUMAN];
    const n = me.hand.length;
    const spacing = Math.min(132, 680 / Math.max(1, n));
    me.hand.forEach((c, i) => {
      const off = i - (n - 1) / 2;
      const hovered = this.hoveredCardId === c.id;
      const sel = this.selected.has(c.id);
      const y = L.hand.y - Math.abs(off) * 3 + (sel ? 34 : 0) + (hovered ? 26 : 0);
      const v = want(c, HUMAN, L.hand.x + off * spacing, y, hovered ? 200 : 100 + i, hovered ? 1.08 : L.hand.s, hovered ? 0 : -off * 0.025, true);
      v.face.userData.onClick = () => this.onHandClick(c);
      const d = g.def(c);
      if (pr?.kind === 'hand') {
        const ok = g.handEligible(pr, c);
        v.glowColor = sel ? COLOR.white : ok ? COLOR.cyan : null;
        v.glowPulse = !sel && ok;
        v.target.opacity = ok ? 1 : 0.45;
      } else if (g.canPlay(HUMAN, c)) {
        v.glowColor = d.kind === 'currency' ? COLOR.amber : COLOR.green;
        v.glowPulse = false;
      } else {
        v.glowColor = null;
      }
    });

    // In play (both players; normally only the active one has cards).
    for (let p = 0; p < 2; p++) {
      const ip = g.players[p].inPlay;
      const m = ip.length;
      const sp = Math.min(98, 700 / Math.max(1, m));
      ip.forEach((c, i) => {
        const v = want(c, p, L.play.x + (i - (m - 1) / 2) * sp, L.play.y, 60 + i, L.play.s, 0, true);
        v.glowColor = null;
      });
    }

    // AI hand (face down).
    const ah = g.players[BOT].hand;
    ah.forEach((c, i) => {
      const v = want(c, BOT, L.aiHand.x + (i - (ah.length - 1) / 2) * 44, L.aiHand.y, 30 + i, L.aiHand.s, 0, false);
      v.glowColor = null;
    });

    // Cards that left view: send them to their new zone.
    const zone = new Map<number, 'deck' | 'discard' | 'trash'>();
    for (const p of g.players) {
      for (const c of p.deck) zone.set(c.id, 'deck');
      for (const c of p.discard) zone.set(c.id, 'discard');
    }
    for (const c of g.trash) zone.set(c.id, 'trash');
    for (const [id, tr] of this.views) {
      const v = tr.view;
      if (!visible.has(id) && !v.leaving) {
        v.leaving = true;
        v.removeWhenArrived = true;
        v.glowColor = null;
        const z = zone.get(id) ?? 'discard';
        if (z === 'trash') {
          v.place(L.trash.x, L.trash.y + 40, 250, 0.5, 0.4);
          v.target.opacity = 0;
          v.glowColor = COLOR.red;
          v.speed = 5;
        } else {
          const to = z === 'deck' ? L.deck[tr.owner] : L.discard[tr.owner];
          v.place(to.x, to.y, 240, L.pileScale[tr.owner]);
          v.speed = 9;
        }
      }
      const arrived = v.update(dt, t);
      if (snap) v.snap();
      if (v.leaving && v.removeWhenArrived && arrived) {
        this.root.remove(v.group);
        v.dispose();
        this.views.delete(id);
      }
    }
    for (let i = this.transients.length - 1; i >= 0; i--) {
      const v = this.transients[i];
      if (v.update(dt, t)) {
        this.root.remove(v.group);
        v.dispose();
        this.transients.splice(i, 1);
      }
    }

    // Supply pile highlights.
    const myTurn = this.myTurn();
    const s = g.players[HUMAN];
    const credits = this.potentialCredits();
    for (const [id, pile] of this.piles) {
      const left = g.supply[id];
      pile.count.set(left > 0 ? `×${left}` : 'EMPTY', { color: left > 0 ? COLOR.white : COLOR.red });
      let glow: string | null = null;
      let pulse = false;
      if (pr?.kind === 'supply') {
        if (g.supplyEligible(pr, id)) { glow = COLOR.cyan; pulse = true; }
      } else if (myTurn && s.bandwidth > 0 && left > 0 && credits >= g.def(id).cost && id !== 'malware') {
        // Bright = affordable right now; dim = affordable once you run your currency.
        glow = s.credits >= g.def(id).cost ? COLOR.green : COLOR.dim;
      }
      pile.view.glowColor = glow;
      pile.view.glowPulse = pulse;
      const hovered = this.stage.hoveredObject === pile.view.face;
      pile.view.target.opacity = left > 0 ? (pr?.kind === 'supply' && !glow ? 0.35 : 1) : 0.2;
      pile.view.place(pile.x, pile.y + (hovered ? 6 : 0), hovered ? 15 : 10, pile.s * (hovered ? 1.06 : 1));
      pile.view.update(dt, t);
    }

    // Deck / discard piles.
    for (let p = 0; p < 2; p++) {
      const pl = g.players[p];
      const deck = this.deckViews[p], disc = this.discardViews[p];
      deck.group.visible = pl.deck.length > 0;
      const top = pl.discard[pl.discard.length - 1];
      disc.group.visible = !!top;
      if (top) {
        disc.setDef(top.def);
        disc.face.userData.preview = top.def;
      }
      this.pileCounts[p * 2].set(`DECK ${pl.deck.length}`);
      this.pileCounts[p * 2 + 1].set(`DISCARD ${pl.discard.length}`);
      deck.update(dt, t);
      disc.update(dt, t);
    }
  }

  // ───────────────────────── HUD ─────────────────────────

  private refreshHud(t: number) {
    const g = this.game;
    const pr = g.pending;
    const human = this.humanPrompt();

    for (let p = 0; p < 2; p++) this.drawPanel(p, t);

    // Resources of the active player.
    const cur = g.players[g.current];
    const rk = `${g.current}|${cur.cycles}|${cur.credits}|${cur.bandwidth}|${g.phase}`;
    if (rk !== this.resKey) {
      this.resKey = rk;
      const col = g.current === HUMAN ? COLOR.green : COLOR.orange;
      this.res.redraw((ctx, w, h) => {
        drawFrame(ctx, 4, 10, w - 8, h - 14, col, { fill: 'rgba(2,10,7,0.8)', title: ` ${cur.name} · ${g.phase === 'action' ? 'ACTION' : 'ACQUIRE'} ` });
        const cells: [string, number, string][] = [['CYC', cur.cycles, COLOR.green], ['CR', cur.credits, COLOR.amber], ['BW', cur.bandwidth, COLOR.cyan]];
        cells.forEach(([k, v, c], i) => {
          const x = 30 + i * 152;
          ctx.font = `14px ${FONT}`;
          ctx.fillStyle = c;
          ctx.globalAlpha = 0.7;
          ctx.textBaseline = 'middle';
          ctx.fillText(k, x, h / 2 + 4);
          ctx.globalAlpha = 1;
          ctx.font = `44px ${TITLE_FONT}`;
          ctx.shadowColor = c;
          ctx.shadowBlur = 12;
          ctx.fillText(String(v), x + 40, h / 2 + 5);
          ctx.shadowBlur = 0;
        });
      });
    }

    // Banner.
    let text = '';
    let bcol = COLOR.cyan;
    if (g.over) text = '';
    else if (human?.kind === 'hand') {
      const need = human.min === human.max ? `${human.min}` : `${human.min}-${human.max}`;
      text = `▶ ${human.title}  [${this.selected.size}/${need}]`;
    } else if (human?.kind === 'supply') text = `▶ ${human.title} — click a highlighted card`;
    else if (pr) { text = 'GHOST IS DECIDING' + '.'.repeat(1 + (Math.floor(t * 3) % 3)); bcol = COLOR.orange; }
    else if (g.current === BOT) { text = 'GHOST IS EXECUTING' + '.'.repeat(1 + (Math.floor(t * 3) % 3)); bcol = COLOR.orange; }
    else if (g.phase === 'action') {
      const me = g.players[HUMAN];
      const hasProg = me.hand.some((c) => g.def(c).kind === 'program');
      text = hasProg && me.cycles > 0 ? 'ACTION PHASE — click a program to run it' : 'play currency, then acquire from the supply';
      bcol = COLOR.green;
    } else {
      text = 'ACQUIRE PHASE — click a supply card to buy it';
      bcol = COLOR.green;
    }
    this.banner.set(text, { color: bcol });

    this.info.set(`TURN ${Math.ceil(g.turn / 2)} · GHOST: ${DIFFICULTIES.find((d) => d.id === this.difficulty)?.name}`);

    // Buttons.
    const myTurn = this.myTurn();
    const me = g.players[HUMAN];
    const show = (b: Button, on: boolean) => (b.mesh.visible = on);
    if (g.over) {
      show(this.btnA, false); show(this.btnB, false); show(this.btnC, false);
    } else if (human?.kind === 'hand') {
      show(this.btnA, false); show(this.btnB, false); show(this.btnC, true);
      const ok = this.selected.size >= human.min && this.selected.size <= human.max;
      this.btnC.set({ label: 'CONFIRM', enabled: ok, color: COLOR.cyan, hotkey: 'SPACE' });
    } else if (human?.kind === 'supply') {
      show(this.btnA, false); show(this.btnB, false); show(this.btnC, true);
      this.btnC.set({ label: 'SKIP', enabled: true, color: COLOR.mid, hotkey: 'SPACE' });
    } else if (myTurn) {
      show(this.btnA, true); show(this.btnB, true); show(this.btnC, true);
      this.btnA.set({ enabled: me.hand.some((c) => g.def(c).kind === 'currency') });
      this.btnB.set({ enabled: g.phase === 'action', label: g.phase === 'action' ? 'END ACTIONS' : 'ACQUIRING' });
      this.btnC.set({ label: 'END TURN', enabled: true, color: COLOR.orange, hotkey: 'SPACE' });
    } else {
      show(this.btnA, false); show(this.btnB, false); show(this.btnC, true);
      this.btnC.set({ label: 'STANDBY', enabled: false, hotkey: '' });
    }

    // Log.
    const lk = `${g.logLines.length}|${g.logLines[g.logLines.length - 1]}`;
    if (lk !== this.logKey) {
      this.logKey = lk;
      this.log.redraw((ctx, w, h) => {
        drawFrame(ctx, 4, 10, w - 8, h - 14, COLOR.dim, { fill: 'rgba(2,10,7,0.8)', title: ' /var/log/session ' });
        ctx.font = `13px ${FONT}`;
        ctx.textBaseline = 'top';
        const lines: { s: string; c: string }[] = [];
        for (const raw of g.logLines.slice(-14)) {
          const c = raw.includes('!!') ? COLOR.red : raw.startsWith('──') ? COLOR.cyan : raw.startsWith('>>') ? COLOR.amber
            : raw.trim().startsWith('GHOST') ? COLOR.orange : raw.trim().startsWith('YOU') ? COLOR.green : COLOR.mid;
          for (const s of wrap(ctx, raw, w - 36)) lines.push({ s, c });
        }
        const maxLines = Math.floor((h - 30) / 15.5);
        lines.slice(-maxLines).forEach((ln, i) => {
          ctx.fillStyle = ln.c;
          ctx.globalAlpha = ln.c === COLOR.mid ? 0.85 : 1;
          ctx.fillText(ln.s, 18, 22 + i * 15.5);
        });
      });
    }
  }

  private drawPanel(p: number, t: number) {
    const g = this.game;
    const s = g.players[p];
    const active = g.current === p && !g.over;
    const blink = active ? Math.floor(t * 2) % 2 : 0;
    const key = `${s.integrity}|${s.shield}|${g.vp(p)}|${active}|${blink}|${g.allCards(p).length}`;
    if (key === this.panelKeys[p]) return;
    this.panelKeys[p] = key;
    const col = p === HUMAN ? COLOR.green : COLOR.orange;
    const pl = L.panel[p];
    this.panels[p].redraw((ctx, w, h) => {
      drawFrame(ctx, 4, 10, w - 8, h - 14, active ? col : hexA(col, 0.5),
        { fill: 'rgba(2,10,7,0.82)', title: p === HUMAN ? ' LOCALHOST ' : ' REMOTE HOST ', glow: active ? 14 : 4 });
      ctx.textBaseline = 'middle';
      ctx.font = `30px ${TITLE_FONT}`;
      ctx.fillStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 10;
      ctx.fillText(`${active && blink ? '▶' : ' '} ${s.name}`, 14, 36);
      ctx.font = `28px ${TITLE_FONT}`;
      ctx.fillStyle = COLOR.cyan;
      ctx.shadowColor = COLOR.cyan;
      ctx.textAlign = 'right';
      ctx.fillText(`${g.vp(p)} VP`, w - 18, 36);
      ctx.textAlign = 'left';

      // Integrity bar: one segment per point.
      const by = 58, bw = w - 36, seg = bw / MAX_INTEGRITY;
      ctx.font = `12px ${FONT}`;
      ctx.shadowBlur = 0;
      ctx.fillStyle = COLOR.mid;
      const lowInt = s.integrity <= 6;
      const ic = lowInt ? COLOR.red : s.integrity <= 12 ? COLOR.amber : COLOR.green;
      for (let i = 0; i < MAX_INTEGRITY; i++) {
        ctx.fillStyle = i < s.integrity ? ic : 'rgba(80,120,100,0.18)';
        ctx.shadowColor = ic;
        ctx.shadowBlur = i < s.integrity ? 6 : 0;
        ctx.fillRect(18 + i * seg, by, seg - 3, 14);
      }
      for (let i = 0; i < s.shield; i++) {
        ctx.fillStyle = COLOR.blue;
        ctx.shadowColor = COLOR.blue;
        ctx.fillRect(18 + i * seg, by - 6, seg - 3, 3);
      }
      ctx.shadowBlur = 0;
      ctx.fillStyle = COLOR.white;
      ctx.font = `13px ${FONT}`;
      const extra = s.shield ? `  SHIELD ${s.shield}` : '';
      ctx.fillText(`INT ${s.integrity}/${MAX_INTEGRITY}${extra}`, 18, by + 28);
      if (pl.h > 110) {
        ctx.fillStyle = COLOR.mid;
        ctx.fillText(`CARDS OWNED ${g.allCards(p).length}`, 18, by + 48);
      }
      ctx.textAlign = 'right';
      ctx.fillStyle = COLOR.mid;
      ctx.fillText(p === BOT ? `HAND ${s.hand.length}` : '', w - 18, by + 28);
    });
  }

  dispose() {
    for (const t of this.views.values()) t.view.dispose();
  }
}
