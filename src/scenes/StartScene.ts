import * as THREE from 'three';
import { sfx } from '../audio/sfx';
import type { Difficulty } from '../engine/ai';
import { ALL_CARDS } from '../engine/cards';
import { CardView } from '../render/cardView';
import { VH, VW, type SceneLike, type Stage } from '../render/stage';
import { Button, COLOR, FONT, Label, Panel, TITLE_FONT, CanvasPlane } from '../render/ui';

export const DIFFICULTIES: { id: Difficulty; name: string; blurb: string }[] = [
  { id: 'easy', name: 'SCRIPT KIDDIE', blurb: 'sloppy opponent. good for learning.' },
  { id: 'normal', name: 'GREY HAT', blurb: 'competent, occasionally reckless.' },
  { id: 'hard', name: 'BLACK HAT', blurb: 'ruthless. smells blood.' },
];

const BOOT_LINES = [
  'BIOS v4.19 ............................ OK',
  'mem check 65536K ...................... OK',
  'loading kernel modules [nf_breach] .... OK',
  'mounting /dev/deck ..................... OK',
  'establishing tunnel 10.0.13.37 ......... OK',
  'handshake w/ GHOST.ai ................. ???',
  'WARNING: hostile process detected',
  'ready.',
];

const RULES = `OBJECTIVE
  Win by holding the most VP when the game ends — OR crash
  your opponent's INTEGRITY to 0 for an instant win.

YOUR TURN
  1. RUN programs (costs 1 CYCLE each; you start with 1).
  2. Play CURRENCY to earn CR, then ACQUIRE cards from the
     supply (1 BANDWIDTH per acquisition).
  3. End turn: everything is discarded, draw 5 new cards.

RESOURCES
  CYC  cycles — how many programs you can run
  CR   credits — spend on cards
  BW   bandwidth — how many cards you can acquire
  INT  integrity — reach 0 and your system crashes

KEYWORDS
  EXPLOIT  attacks the opponent. BREACH deals INT damage.
  DAEMON   while in your hand, auto-blocks enemy exploits.
  SHIELD   absorbs breach until your next turn.
  TRASH    removes a card from the game for good.

GAME END
  When ROOT ACCESS runs out or any 3 supply piles empty.
  Ties break on remaining integrity.`;

const VOLUME_ROW = 5;

export class StartScene implements SceneLike {
  root = new THREE.Group();
  private menu = new THREE.Group();
  private index = new THREE.Group();
  private rules = new THREE.Group();
  private mode: 'menu' | 'index' | 'rules' = 'menu';

  private title: Label;
  private ghosts: Label[] = [];
  private boot: Label;
  private bootChars = 0;
  private buttons: Button[] = [];
  private focus = 0;
  private diffIdx: number;
  private diffBlurb: Label;
  private drift: { v: CardView; vy: number; vr: number }[] = [];
  private glitchTimer = 0;

  private indexCards: CardView[] = [];
  private indexPage = 0;
  private indexLabel!: Label;
  private indexButtons: Button[] = [];
  private rulesBack!: Button;

  constructor(private stage: Stage, private opts: { difficulty: Difficulty; onStart: (d: Difficulty) => void; onLan: () => void }) {
    stage.bg.setIntensity(1);
    this.diffIdx = Math.max(0, DIFFICULTIES.findIndex((d) => d.id === opts.difficulty));
    this.root.add(this.menu, this.index, this.rules);

    // Drifting background cards.
    for (let i = 0; i < 9; i++) {
      const d = ALL_CARDS[(i * 7 + 3) % ALL_CARDS.length];
      const v = new CardView(d.id);
      v.place(100 + Math.random() * 1400, Math.random() * 900, -60, 0.75 + Math.random() * 0.4, (Math.random() - 0.5) * 0.5);
      v.target.opacity = 0.13;
      v.snap();
      this.drift.push({ v, vy: 8 + Math.random() * 14, vr: (Math.random() - 0.5) * 0.05 });
      this.root.add(v.group);
    }

    // Title with chromatic "ghost" copies for glitching.
    const titleStyle = { size: 168, font: TITLE_FONT, align: 'center' as const, glow: 26 };
    for (const c of [COLOR.red, COLOR.cyan]) {
      const g = new Label(1000, 190, 'BREACH.EXE', { ...titleStyle, color: c, glow: 0 });
      g.mat.blending = THREE.AdditiveBlending;
      g.mat.opacity = 0;
      g.at(800, 680, 9);
      this.ghosts.push(g);
      this.menu.add(g.mesh);
    }
    this.title = new Label(1000, 190, 'BREACH.EXE', { ...titleStyle, color: COLOR.green });
    this.title.at(800, 680, 10);
    this.menu.add(this.title.mesh);

    const sub = new Label(900, 34, '// a deckbuilding intrusion — v0.1 //', { size: 20, align: 'center', color: COLOR.cyan, glow: 8 });
    sub.at(800, 588, 10);
    this.menu.add(sub.mesh);

    // Menu.
    const items: [string, () => void][] = [
      ['JACK IN', () => this.startGame()],
      ['', () => this.cycleDifficulty(1)],
      ['LAN MATCH', () => this.opts.onLan()],
      ['CARD INDEX', () => this.setMode('index')],
      ['PROTOCOL', () => this.setMode('rules')],
      ['', () => this.stepVolume(sfx.volume >= 100 ? -100 : 10)],
    ];
    items.forEach(([label, fn], i) => {
      const b = new Button(420, 56, { label, color: i === 0 ? COLOR.green : COLOR.cyan });
      b.onClick = fn;
      b.at(800, 480 - i * 70, 20);
      const prevHover = b.mesh.userData.onHover;
      b.mesh.userData.onHover = (on: boolean) => {
        if (on) this.setFocus(i, false);
        prevHover(on);
      };
      this.buttons.push(b);
      this.menu.add(b.mesh);
    });
    this.diffBlurb = new Label(500, 24, '', { size: 14, align: 'center', color: COLOR.mid, glow: 0 });
    this.diffBlurb.at(800, 377, 20);
    this.menu.add(this.diffBlurb.mesh);
    this.refreshDifficulty();

    this.boot = new Label(520, 200, '', { size: 14, color: COLOR.mid, glow: 3, lineHeight: 1.35 });
    this.boot.at(300, 130, 10);
    this.menu.add(this.boot.mesh);

    const help = new Label(560, 24, '[↑↓] select   [←→] adjust   [ENTER] execute   [M] mute',
      { size: 13, align: 'right', color: COLOR.dim, glow: 0 });
    help.at(1300, 40, 10);
    this.menu.add(help.mesh);

    this.buildIndex();
    this.buildRules();
    this.setMode('menu');
    this.setFocus(0, false);
    sfx.boot();
  }

  // ───────────────────────── menu ─────────────────────────

  private baseLabel(j: number) {
    return ['JACK IN', `DIFFICULTY: ${DIFFICULTIES[this.diffIdx].name}`, 'LAN MATCH', 'CARD INDEX', 'PROTOCOL', `VOLUME: ${sfx.volume}`][j];
  }

  private setFocus(i: number, sound = true) {
    this.focus = (i + this.buttons.length) % this.buttons.length;
    this.buttons.forEach((b, j) => b.set({ label: (j === this.focus ? '> ' : '') + this.baseLabel(j) }));
    if (sound) sfx.hover();
  }

  private cycleDifficulty(dir: number) {
    this.diffIdx = (this.diffIdx + dir + DIFFICULTIES.length) % DIFFICULTIES.length;
    this.refreshDifficulty();
  }

  private stepVolume(delta: number) {
    sfx.volume += delta;
    this.setFocus(this.focus, false);
  }

  private refreshDifficulty() {
    const d = DIFFICULTIES[this.diffIdx];
    this.buttons[1].set({ color: d.id === 'hard' ? COLOR.red : d.id === 'easy' ? COLOR.green : COLOR.amber });
    this.setFocus(this.focus, false);
    this.diffBlurb.set(`< ${d.blurb} >`);
  }

  private startGame() {
    sfx.boot();
    this.stage.pulseGlitch(1);
    this.opts.onStart(DIFFICULTIES[this.diffIdx].id);
  }

  private setMode(m: 'menu' | 'index' | 'rules') {
    this.mode = m;
    this.menu.visible = m === 'menu';
    this.index.visible = m === 'index';
    this.rules.visible = m === 'rules';
    for (const d of this.drift) d.v.group.visible = m === 'menu';
    if (m === 'index') this.layoutIndex();
    this.stage.pulseGlitch(0.35);
  }

  // ───────────────────────── card index ─────────────────────────

  private buildIndex() {
    const head = new Label(800, 50, 'CARD INDEX', { size: 46, font: TITLE_FONT, align: 'center', color: COLOR.green, glow: 14 });
    head.at(800, 858, 10);
    this.index.add(head.mesh);
    this.indexLabel = new Label(300, 24, '', { size: 15, align: 'center', color: COLOR.mid, glow: 0 });
    this.indexLabel.at(800, 50, 10);
    this.index.add(this.indexLabel.mesh);

    const mk = (label: string, x: number, fn: () => void) => {
      const b = new Button(180, 46, { label, color: COLOR.cyan });
      b.onClick = fn;
      b.at(x, 50, 20);
      this.index.add(b.mesh);
      this.indexButtons.push(b);
      return b;
    };
    mk('< PREV', 560, () => { this.indexPage = (this.indexPage + 1) % 2; this.layoutIndex(); });
    mk('NEXT >', 1040, () => { this.indexPage = (this.indexPage + 1) % 2; this.layoutIndex(); });
    mk('BACK', 1450, () => this.setMode('menu'));

    for (let i = 0; i < 15; i++) {
      const v = new CardView('bit');
      const slot = i;
      v.face.userData.onHover = (on: boolean) => {
        const base = this.slotPos(slot);
        v.place(base.x, base.y + (on ? 20 : 0), on ? 50 : 10, on ? 1.65 : 0.95);
        if (on) sfx.hover();
      };
      this.indexCards.push(v);
      this.index.add(v.group);
    }
  }

  private slotPos(i: number) {
    const col = i % 5, row = Math.floor(i / 5);
    return { x: 800 + (col - 2) * 165, y: 700 - row * 225 };
  }

  private layoutIndex() {
    const start = this.indexPage * 15;
    this.indexCards.forEach((v, i) => {
      const d = ALL_CARDS[start + i];
      v.group.visible = !!d;
      if (!d) return;
      v.setDef(d.id);
      v.setFaceUp(true);
      const p = this.slotPos(i);
      v.place(p.x, p.y, 10, 0.95);
    });
    this.indexLabel.set(`PAGE ${this.indexPage + 1}/2 · ${ALL_CARDS.length} CARD TYPES`);
  }

  // ───────────────────────── rules ─────────────────────────

  private buildRules() {
    const p = new Panel(900, 760, COLOR.green, ' PROTOCOL.TXT ');
    p.at(800, 470, 5);
    this.rules.add(p.mesh);
    const txt = new CanvasPlane(840, 690);
    txt.redraw((ctx) => {
      ctx.font = `16px ${FONT}`;
      ctx.textBaseline = 'top';
      RULES.split('\n').forEach((ln, i) => {
        const header = /^[A-Z ]+$/.test(ln) && ln.trim().length > 0;
        ctx.fillStyle = header ? COLOR.cyan : COLOR.green;
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = header ? 8 : 3;
        ctx.fillText(ln, 20, 10 + i * 24.5);
      });
    });
    txt.at(800, 460, 6);
    this.rules.add(txt.mesh);
    this.rulesBack = new Button(200, 46, { label: 'BACK', color: COLOR.cyan });
    this.rulesBack.onClick = () => this.setMode('menu');
    this.rulesBack.at(800, 52, 20);
    this.rules.add(this.rulesBack.mesh);
  }

  // ───────────────────────── SceneLike ─────────────────────────

  hitTargets(): THREE.Object3D[] {
    if (this.mode === 'menu') return this.buttons.map((b) => b.mesh);
    if (this.mode === 'index') return [...this.indexButtons.map((b) => b.mesh), ...this.indexCards.map((c) => c.face)];
    return [this.rulesBack.mesh];
  }

  onKey(e: KeyboardEvent) {
    if (e.key === 'm' || e.key === 'M') { sfx.muted = !sfx.muted; return; }
    if (this.mode !== 'menu') {
      if (e.key === 'Escape' || e.key === 'Backspace') this.setMode('menu');
      if (this.mode === 'index' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
        this.indexPage = (this.indexPage + 1) % 2;
        this.layoutIndex();
      }
      return;
    }
    if (e.key === 'ArrowDown') this.setFocus(this.focus + 1);
    else if (e.key === 'ArrowUp') this.setFocus(this.focus - 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const dir = e.key === 'ArrowLeft' ? -1 : 1;
      if (this.focus === VOLUME_ROW) this.stepVolume(dir * 10);
      else this.cycleDifficulty(dir);
      sfx.click();
    } else if (e.key === 'Enter' || e.key === ' ') {
      sfx.click();
      this.buttons[this.focus].onClick();
    }
  }

  update(dt: number, t: number) {
    // Typed boot log.
    const full = BOOT_LINES.join('\n');
    if (this.bootChars < full.length) {
      this.bootChars = Math.min(full.length, this.bootChars + dt * 90);
      this.boot.set(full.slice(0, Math.floor(this.bootChars)) + (Math.floor(t * 3) % 2 ? '█' : ' '));
    } else {
      this.boot.set(full + (Math.floor(t * 2) % 2 ? ' █' : '  '));
    }

    // Title glitch bursts.
    this.glitchTimer -= dt;
    const bursting = this.glitchTimer < 0.18 && this.glitchTimer > 0;
    if (this.glitchTimer <= 0) this.glitchTimer = 1.5 + Math.random() * 3;
    this.ghosts.forEach((g, i) => {
      const amt = bursting ? 6 + Math.random() * 14 : 1.5;
      g.mesh.position.x = 800 + (i ? amt : -amt);
      g.mesh.position.y = 680 + (bursting ? (Math.random() - 0.5) * 8 : 0);
      g.mat.opacity = bursting ? 0.8 : 0.35;
    });
    this.title.mesh.position.x = 800 + (bursting ? (Math.random() - 0.5) * 6 : 0);
    if (bursting && Math.random() < 0.05) this.stage.pulseGlitch(0.25);

    for (const d of this.drift) {
      d.v.target.y += d.vy * dt;
      d.v.target.rot += d.vr * dt;
      if (d.v.target.y > VH + 160) {
        d.v.target.y = -160;
        d.v.target.x = 100 + Math.random() * (VW - 200);
        d.v.snap();
      }
      d.v.update(dt, t);
    }
    for (const c of this.indexCards) c.update(dt, t);
  }
}
