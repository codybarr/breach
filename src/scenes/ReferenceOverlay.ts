import * as THREE from 'three';
import { compact } from '../mobile';
import { VH, VW } from '../render/stage';
import { Button, CanvasPlane, COLOR, FONT, Panel } from '../render/ui';
import { GLOSSARY, RULES } from './reference';

const LAYOUT = compact
  ? {
    panel: { w: 1570, h: 760 }, text: { y: 395, w: 1520, h: 640 }, font: 23, lineHeight: 40, columnWidth: 770,
    tabs: { y: 768, w: 320, h: 84, x: [400, 800, 1200], fontSize: 30 },
  }
  : {
    panel: { w: 900, h: 820 }, text: { y: 430, w: 840, h: 660 }, font: 16, lineHeight: 24.5, columnWidth: 0,
    tabs: { y: 792, w: 230, h: 44, x: [530, 800, 1070], fontSize: undefined },
  };

/** Split at the blank line that leaves the two columns closest in height. */
function twoColumns(lines: string[]): string[][] {
  let split = -1;
  lines.forEach((line, i) => {
    if (line.trim()) return;
    const cost = (at: number) => Math.max(at, lines.length - at - 1);
    if (split < 0 || cost(i) < cost(split)) split = i;
  });
  return split < 0 ? [lines] : [lines.slice(0, split), lines.slice(split + 1)];
}

/** Read-only reference: blocks board input without pausing a LAN opponent. */
export class ReferenceOverlay {
  root = new THREE.Group();
  private buttons: Button[] = [];
  private text = new CanvasPlane(LAYOUT.text.w, LAYOUT.text.h);

  constructor() {
    this.root.renderOrder = 900;
    const shade = new THREE.Mesh(new THREE.PlaneGeometry(VW * 3, VH * 3),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.88, depthTest: false, depthWrite: false }));
    shade.position.set(VW / 2, VH / 2, 500);
    shade.renderOrder = 500;
    const panel = new Panel(LAYOUT.panel.w, LAYOUT.panel.h, COLOR.cyan, ' REFERENCE ');
    panel.at(800, 450, 501);
    this.text.at(800, LAYOUT.text.y, 502);
    this.root.add(shade, panel.mesh, this.text.mesh);
    for (const [label, x, action] of [
      ['RULES', LAYOUT.tabs.x[0], () => this.show('rules')],
      ['GLOSSARY', LAYOUT.tabs.x[1], () => this.show('glossary')],
      ['CLOSE', LAYOUT.tabs.x[2], () => { this.root.visible = false; }],
    ] as const) {
      const button = new Button(LAYOUT.tabs.w, LAYOUT.tabs.h, { label, color: COLOR.cyan, fontSize: LAYOUT.tabs.fontSize });
      button.at(x, LAYOUT.tabs.y, 503);
      button.onClick = action;
      this.buttons.push(button);
      this.root.add(button.mesh);
    }
    this.root.visible = false;
  }

  show(page: 'rules' | 'glossary' = 'rules') {
    this.root.visible = true;
    this.buttons[0].set({ color: page === 'rules' ? COLOR.white : COLOR.mid });
    this.buttons[1].set({ color: page === 'glossary' ? COLOR.white : COLOR.mid });
    this.text.redraw((ctx) => {
      ctx.font = `${LAYOUT.font}px ${FONT}`;
      ctx.textBaseline = 'top';
      const lines = (page === 'rules' ? RULES : GLOSSARY).split('\n');
      (compact ? twoColumns(lines) : [lines]).forEach((column, c) => column.forEach((line, i) => {
        ctx.fillStyle = /^[A-Z ]+$/.test(line) && line.trim() ? COLOR.cyan : COLOR.green;
        ctx.fillText(line, 20 + c * LAYOUT.columnWidth, 10 + i * LAYOUT.lineHeight);
      }));
    });
  }

  hitTargets() { return this.buttons.map((b) => b.mesh); }
}
