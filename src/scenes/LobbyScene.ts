import * as THREE from 'three';
import { sfx } from '../audio/sfx';
import { NetClient, handle, session } from '../net/client';
import { cleanName, type MatchStart, type RoomInfo, type ServerMsg } from '../net/protocol';
import type { SceneLike, Stage } from '../render/stage';
import { Button, COLOR, Label, TITLE_FONT } from '../render/ui';

const MAX_ROWS = 5;
const ROW_Y = (i: number) => 404 - i * 62;

/** LAN lobby: pick a handle, host a session, or join one from the list. */
export class LobbyScene implements SceneLike {
  root = new THREE.Group();
  private net: NetClient;
  private status: Label;
  private hostNote: Label;
  private empty: Label;
  private handleBtn: Button;
  private hostBtn: Button;
  private backBtn: Button;
  private rowBtns: Button[] = [];
  private rooms: RoomInfo[] = [];
  private hosting: string | null = null;
  private name = handle.get();
  private focus = 0;
  private handedOff = false;
  private flashMsg = '';
  private flashLife = 0;
  private age = 0;

  constructor(private stage: Stage, private opts: { onBack: () => void; onStart: (net: NetClient, m: MatchStart) => void }) {
    stage.bg.setIntensity(0.8);

    const title = new Label(900, 90, 'LAN UPLINK', { size: 76, font: TITLE_FONT, align: 'center', color: COLOR.green, glow: 20 });
    title.at(800, 806, 10);
    this.status = new Label(900, 26, '', { size: 15, align: 'center', color: COLOR.mid, glow: 0 });
    this.status.at(800, 744, 10);

    this.handleBtn = this.button(640, COLOR.cyan, () => this.setFocus(0));
    this.hostBtn = this.button(570, COLOR.green, () => this.toggleHost());
    this.hostNote = new Label(700, 24, '', { size: 14, align: 'center', color: COLOR.amber, glow: 4 });
    this.hostNote.at(800, 523, 10);

    const head = new Label(500, 26, '── OPEN SESSIONS ──', { size: 16, align: 'center', color: COLOR.cyan, glow: 6 });
    head.at(800, 470, 10);
    this.empty = new Label(600, 24, '', { size: 14, align: 'center', color: COLOR.dim, glow: 0 });
    this.empty.at(800, ROW_Y(0), 10);
    for (let i = 0; i < MAX_ROWS; i++) {
      const b = this.button(ROW_Y(i), COLOR.amber, () => this.join(i));
      b.mesh.visible = false;
      this.rowBtns.push(b);
    }
    this.backBtn = this.button(70, COLOR.cyan, () => this.back());

    const help = new Label(760, 24, '[↑↓] select   [ENTER] execute   type to edit handle   [ESC] back',
      { size: 13, align: 'right', color: COLOR.dim, glow: 0 });
    help.at(1200, 24, 10);
    this.root.add(title.mesh, this.status.mesh, this.hostNote.mesh, head.mesh, this.empty.mesh, help.mesh);

    this.net = new NetClient();
    this.net.onOpen = () => this.net.send({ t: 'list' });
    this.net.onMessage = (m) => this.onNet(m);
    this.net.onStatus = (up) => {
      if (!up && this.hosting) this.hosting = null; // server drops waiting rooms on disconnect
      this.refresh();
    };
    this.refresh();
  }

  private button(y: number, color: string, fn: () => void) {
    const b = new Button(460, 50, { label: '', color });
    b.onClick = fn;
    b.at(800, y, 20);
    const prev = b.mesh.userData.onHover;
    b.mesh.userData.onHover = (on: boolean) => {
      if (on) {
        const i = this.targets().indexOf(b);
        if (i >= 0) this.focus = i;
        this.refresh();
      }
      prev(on);
    };
    this.root.add(b.mesh);
    return b;
  }

  private targets(): Button[] {
    return [this.handleBtn, this.hostBtn, ...this.rowBtns.filter((b) => b.mesh.visible), this.backBtn];
  }

  private setFocus(i: number, sound = false) {
    const t = this.targets();
    this.focus = (i + t.length) % t.length;
    if (sound) sfx.hover();
    this.refresh();
  }

  private refresh() {
    const up = this.net.up;
    const t = this.targets();
    if (this.focus >= t.length) this.focus = t.length - 1;
    const f = t[this.focus];
    const mark = (b: Button, s: string) => (b === f ? '> ' : '') + s;

    const editing = f === this.handleBtn && !this.hosting;
    const cursor = editing && Math.floor(this.age * 2.5) % 2 ? '█' : ' ';
    this.handleBtn.set({ label: mark(this.handleBtn, `HANDLE: ${this.name}${editing ? cursor : ' '}`), enabled: !this.hosting });
    this.hostBtn.set({
      label: mark(this.hostBtn, this.hosting ? 'CANCEL HOSTING' : 'HOST SESSION'),
      color: this.hosting ? COLOR.red : COLOR.green,
      enabled: up,
    });
    this.backBtn.set({ label: mark(this.backBtn, 'BACK') });
    this.hostNote.set(this.hosting
      ? `node ${this.hosting} online — waiting for an opponent${'.'.repeat(1 + (Math.floor(this.age * 2) % 3))}`
      : '');

    const others = this.rooms.filter((r) => r.id !== this.hosting);
    this.rowBtns.forEach((b, i) => {
      const r = others[i];
      b.mesh.visible = !!r && up;
      if (r) b.set({ label: mark(b, `JACK INTO ${r.host} [${r.id}]`), enabled: !this.hosting });
    });
    this.empty.set(!up ? '' : others.length ? '' : 'no open sessions on this network');

    if (this.flashLife > 0) this.status.set(this.flashMsg, { color: COLOR.red });
    else if (up) this.status.set(`relay online · ${location.host}`, { color: COLOR.green });
    else if (this.net.everUp) this.status.set('relay link lost — retrying...', { color: COLOR.amber });
    else this.status.set('no relay found — run `bun run serve` on the host machine', { color: COLOR.amber });
  }

  private onNet(m: ServerMsg) {
    switch (m.t) {
      case 'rooms':
        this.rooms = m.rooms;
        break;
      case 'hosted':
        this.hosting = m.room;
        break;
      case 'start':
        session.set({ room: m.room, token: m.token });
        this.handedOff = true;
        this.net.onMessage = this.net.onOpen = this.net.onStatus = null;
        sfx.boot();
        this.stage.pulseGlitch(1);
        this.opts.onStart(this.net, m);
        return;
      case 'error':
        this.flash(m.msg);
        break;
      default:
        return;
    }
    this.refresh();
  }

  private flash(msg: string) {
    this.flashMsg = `!! ${msg}`;
    this.flashLife = 2.5;
    this.stage.pulseGlitch(0.3);
  }

  private toggleHost() {
    if (!this.net.up) return;
    if (this.hosting) {
      this.net.send({ t: 'leave' });
      this.hosting = null;
    } else {
      this.net.send({ t: 'host', name: this.name });
    }
    this.refresh();
  }

  private join(i: number) {
    const r = this.rooms.filter((x) => x.id !== this.hosting)[i];
    if (r && !this.hosting) this.net.send({ t: 'join', room: r.id, name: this.name });
  }

  private back() {
    if (this.hosting) this.net.send({ t: 'leave' });
    this.opts.onBack();
  }

  hitTargets(): THREE.Object3D[] {
    return this.targets().map((b) => b.mesh);
  }

  onKey(e: KeyboardEvent) {
    const f = this.targets()[this.focus];
    if (f === this.handleBtn && !this.hosting) {
      if (e.key === 'Backspace') {
        e.preventDefault();
        this.name = this.name.slice(0, -1);
        sfx.draw();
        this.refresh();
        return;
      }
      if (e.key.length === 1 && /[a-z0-9_-]/i.test(e.key) && this.name.length < 12) {
        this.name += e.key.toUpperCase();
        sfx.draw();
        this.refresh();
        return;
      }
    }
    if (e.key === 'ArrowDown') this.setFocus(this.focus + 1, true);
    else if (e.key === 'ArrowUp') this.setFocus(this.focus - 1, true);
    else if (e.key === 'Escape') this.back();
    else if (e.key === 'Enter' && f.opts.enabled !== false) {
      sfx.click();
      if (f === this.handleBtn) this.setFocus(1);
      else f.onClick();
    }
  }

  update(dt: number) {
    this.age += dt;
    if (this.flashLife > 0) this.flashLife -= dt;
    this.refresh();
  }

  dispose() {
    this.name = cleanName(this.name);
    handle.set(this.name);
    if (!this.handedOff) this.net.close();
  }
}
