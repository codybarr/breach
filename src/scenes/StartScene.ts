import * as THREE from 'three';
import { sfx } from '../audio/sfx';
import type { Difficulty } from '../engine/ai';
import { ALL_CARDS, INDEX_CARDS } from '../engine/cards';
import { compact, touch } from '../mobile';
import { CardView } from '../render/cardView';
import { CardInspector } from '../render/inspector';
import { RULES } from './reference';
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

const VOLUME_ROW = 5;

const TITLE_Y = compact ? 720 : 680;
const INDEX = compact
  ? { perPage: 14, s: 1.3, x: (col: number) => 155 + col * 215, y: (row: number) => 680 - row * 285, cols: 7 }
  : { perPage: 18, s: 0.95, x: (col: number) => 800 + (col - 2.5) * 165, y: (row: number) => 700 - row * 225, cols: 6 };
const INDEX_PAGES = Math.ceil(ALL_CARDS.length / INDEX.perPage);

interface MenuRow { label: () => string; run: () => void }

export class StartScene implements SceneLike {
  root = new THREE.Group();
  fitHeight = compact ? 760 : VH;
  private menu = new THREE.Group();
  private options = new THREE.Group();
  private index = new THREE.Group();
  private rules = new THREE.Group();
  private mode: 'menu' | 'options' | 'index' | 'rules' = 'menu';

  private title: Label;
  private ghosts: Label[] = [];
  private boot: Label;
  private bootChars = 0;
  private buttons: Button[] = [];
  private labels: (() => string)[] = [];
  private optionButtons: Button[] = [];
  private optionLabels: (() => string)[] = [];
  private jackButton!: Button;
  private diffButton!: Button;
  private inspector: CardInspector;
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
    this.root.add(this.menu, this.options, this.index, this.rules);
    this.inspector = new CardInspector(stage);
    this.root.add(this.inspector.root);

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
      g.at(800, TITLE_Y, 9);
      this.ghosts.push(g);
      this.menu.add(g.mesh);
    }
    this.title = new Label(1000, 190, 'BREACH.EXE', { ...titleStyle, color: COLOR.green });
    this.title.at(800, TITLE_Y, 10);
    this.menu.add(this.title.mesh);

    const sub = new Label(900, 40, '// a deckbuilding intrusion — v0.1 //', { size: compact ? 28 : 20, align: 'center', color: COLOR.cyan, glow: 8 });
    sub.at(800, compact ? 604 : 588, 10);
    this.menu.add(sub.mesh);

    // Menu.
    const jackIn: MenuRow = { label: () => 'JACK IN', run: () => this.startGame() };
    const difficulty: MenuRow = { label: () => `DIFFICULTY: ${DIFFICULTIES[this.diffIdx].name}`, run: () => this.cycleDifficulty(1) };
    const lan: MenuRow = { label: () => 'LAN MATCH', run: () => this.opts.onLan() };
    const cardIndex: MenuRow = { label: () => 'CARD INDEX', run: () => this.setMode('index') };
    const protocol: MenuRow = { label: () => 'PROTOCOL', run: () => this.setMode('rules') };
    const volume: MenuRow = { label: () => `VOLUME: ${sfx.volume}`, run: () => this.stepVolume(sfx.volume >= 100 ? -100 : 10) };
    const more: MenuRow = { label: () => 'OPTIONS', run: () => this.setMode('options') };
    const back: MenuRow = { label: () => 'BACK', run: () => this.setMode('menu') };

    const addRow = (group: THREE.Group, r: MenuRow, b: Button) => {
      b.onClick = r.run;
      if (r === jackIn) this.jackButton = b;
      if (r === difficulty) this.diffButton = b;
      group.add(b.mesh);
      return b;
    };
    const rows = compact ? [jackIn, lan, more] : [jackIn, difficulty, lan, cardIndex, protocol, volume];
    this.labels = rows.map((r) => r.label);
    rows.forEach((r, i) => {
      const color = r === jackIn ? COLOR.green : COLOR.cyan;
      const b = compact
        ? new Button(620, 104, { label: '', color, fontSize: 36 }).at(800, 480 - i * 125, 20)
        : new Button(420, 56, { label: '', color }).at(800, 480 - i * 70, 20);
      addRow(this.menu, r, b);
      const prevHover = b.mesh.userData.onHover;
      b.mesh.userData.onHover = (on: boolean) => {
        if (on) this.setFocus(i, false);
        prevHover(on);
      };
      this.buttons.push(b);
    });
    if (compact) {
      const head = new Label(800, 90, 'OPTIONS', { size: 80, font: TITLE_FONT, align: 'center', color: COLOR.green, glow: 18 });
      head.at(800, 780, 10);
      this.options.add(head.mesh);
      const optionRows = [difficulty, cardIndex, protocol, volume, back];
      this.optionLabels = optionRows.map((r) => r.label);
      optionRows.forEach((r, i) => {
        const b = new Button(720, 92, { label: '', color: COLOR.cyan, fontSize: 32 }).at(800, 680 - i * 105, 20);
        this.optionButtons.push(addRow(this.options, r, b));
      });
    }
    this.diffBlurb = new Label(500, 24, '', { size: 14, align: 'center', color: COLOR.mid, glow: 0 });
    this.diffBlurb.at(800, 377, 20);
    if (!compact) this.menu.add(this.diffBlurb.mesh);
    this.refreshDifficulty();

    this.boot = new Label(520, 200, '', { size: 14, color: COLOR.mid, glow: 3, lineHeight: 1.35 });
    this.boot.at(300, 130, 10);
    if (!compact) this.menu.add(this.boot.mesh);

    const help = new Label(560, 24, '[↑↓] select   [←→] adjust   [ENTER] execute   [M] mute',
      { size: 13, align: 'right', color: COLOR.dim, glow: 0 });
    help.at(1300, 40, 10);
    if (!compact) this.menu.add(help.mesh);

    this.buildIndex();
    this.buildRules();
    this.setMode('menu');
    this.setFocus(0, false);
    sfx.boot();
  }

  // ───────────────────────── menu ─────────────────────────

  private setFocus(i: number, sound = true) {
    this.focus = (i + this.buttons.length) % this.buttons.length;
    this.buttons.forEach((b, j) => b.set({ label: (j === this.focus && !compact ? '> ' : '') + this.labels[j]() }));
    this.optionButtons.forEach((b, j) => b.set({ label: this.optionLabels[j]() }));
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
    this.diffButton.set({ color: d.id === 'hard' ? COLOR.red : d.id === 'easy' ? COLOR.green : COLOR.amber, sub: compact ? d.blurb : undefined });
    if (compact) this.jackButton.set({ sub: `VS ${d.name}` });
    this.setFocus(this.focus, false);
    this.diffBlurb.set(`< ${d.blurb} >`);
  }

  private startGame() {
    sfx.boot();
    this.stage.pulseGlitch(1);
    this.opts.onStart(DIFFICULTIES[this.diffIdx].id);
  }

  private setMode(m: StartScene['mode']) {
    this.mode = m;
    this.menu.visible = m === 'menu';
    this.options.visible = m === 'options';
    this.index.visible = m === 'index';
    this.rules.visible = m === 'rules';
    for (const d of this.drift) d.v.group.visible = m === 'menu' || m === 'options';
    if (m === 'index') this.layoutIndex();
    this.stage.pulseGlitch(0.35);
  }

  // ───────────────────────── card index ─────────────────────────

  private buildIndex() {
    const head = new Label(800, 50, 'CARD INDEX', { size: 46, font: TITLE_FONT, align: 'center', color: COLOR.green, glow: 14 });
    head.at(800, 858, 10);
    if (!compact) this.index.add(head.mesh);
    this.indexLabel = new Label(compact ? 440 : 300, compact ? 34 : 24, '', { size: compact ? 24 : 15, align: 'center', color: COLOR.mid, glow: 0 });
    this.indexLabel.at(compact ? 700 : 800, compact ? 160 : 50, 10);
    this.index.add(this.indexLabel.mesh);

    const mk = (label: string, x: number, fn: () => void) => {
      const b = compact ? new Button(260, 100, { label, color: COLOR.cyan, fontSize: 32 }) : new Button(180, 46, { label, color: COLOR.cyan });
      b.onClick = fn;
      b.at(x, compact ? 160 : 50, 20);
      this.index.add(b.mesh);
      this.indexButtons.push(b);
      return b;
    };
    mk('< PREV', compact ? 330 : 560, () => this.stepIndex(-1));
    mk('NEXT >', compact ? 1070 : 1040, () => this.stepIndex(1));
    mk('BACK', compact ? 1370 : 1450, () => this.leaveSubpage());

    for (let i = 0; i < INDEX.perPage; i++) {
      const v = new CardView('megabyte');
      const slot = i;
      v.face.userData.onHover = (on: boolean) => {
        if (touch) return; // touch opens the inspector instead of growing in place
        const base = this.slotPos(slot);
        v.place(base.x, base.y + (on ? 20 : 0), on ? 50 : 10, on ? 1.65 : 0.95);
        if (on) sfx.hover();
      };
      this.indexCards.push(v);
      this.index.add(v.group);
    }
  }

  private slotPos(i: number) {
    return { x: INDEX.x(i % INDEX.cols), y: INDEX.y(Math.floor(i / INDEX.cols)) };
  }

  private stepIndex(dir: number) {
    this.indexPage = (this.indexPage + dir + INDEX_PAGES) % INDEX_PAGES;
    this.layoutIndex();
  }

  /** Phones reach the index and rules through Options, so that's where BACK returns. */
  private leaveSubpage() {
    this.setMode(compact ? 'options' : 'menu');
  }

  private layoutIndex() {
    const start = this.indexPage * INDEX.perPage;
    this.indexCards.forEach((v, i) => {
      const d = INDEX_CARDS[start + i];
      v.group.visible = !!d;
      if (!d) return;
      v.setDef(d.id);
      v.setFaceUp(true);
      v.face.userData.preview = d.id;
      const p = this.slotPos(i);
      v.place(p.x, p.y, 10, INDEX.s);
    });
    this.indexLabel.set(`PAGE ${this.indexPage + 1}/${INDEX_PAGES} · ${ALL_CARDS.length} CARD TYPES`);
  }

  // ───────────────────────── rules ─────────────────────────

  private buildRules() {
    const p = compact ? new Panel(1060, 760, COLOR.green, ' PROTOCOL.TXT ') : new Panel(900, 760, COLOR.green, ' PROTOCOL.TXT ');
    p.at(compact ? 640 : 800, compact ? 450 : 470, 5);
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
    txt.at(compact ? 640 : 800, compact ? 423 : 460, 6);
    if (compact) txt.mesh.scale.setScalar(1.15);
    this.rules.add(txt.mesh);
    this.rulesBack = compact ? new Button(340, 110, { label: 'BACK', color: COLOR.cyan, fontSize: 36 }) : new Button(200, 46, { label: 'BACK', color: COLOR.cyan });
    this.rulesBack.onClick = () => this.leaveSubpage();
    this.rulesBack.at(compact ? 1370 : 800, compact ? 450 : 52, 20);
    this.rules.add(this.rulesBack.mesh);
  }

  // ───────────────────────── SceneLike ─────────────────────────

  hitTargets(): THREE.Object3D[] {
    if (this.mode === 'menu') return this.buttons.map((b) => b.mesh);
    if (this.mode === 'options') return this.optionButtons.map((b) => b.mesh);
    if (this.mode === 'index') {
      const cards = this.indexCards.map((c) => c.face);
      return this.inspector.open ? [...this.inspector.hitTargets(), ...cards] : [...this.indexButtons.map((b) => b.mesh), ...cards];
    }
    return [this.rulesBack.mesh];
  }

  onKey(e: KeyboardEvent) {
    if (e.key === 'm' || e.key === 'M') { sfx.muted = !sfx.muted; return; }
    if (this.mode !== 'menu') {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        if (this.mode === 'options') this.setMode('menu');
        else this.leaveSubpage();
      }
      if (this.mode === 'index' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) this.stepIndex(e.key === 'ArrowRight' ? 1 : -1);
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
      g.mesh.position.y = TITLE_Y + (bursting ? (Math.random() - 0.5) * 8 : 0);
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
    this.inspector.update(dt, t, null);
  }
}
