import * as THREE from 'three';
import { compact } from '../mobile';
import { VH, VW } from '../render/stage';
import { Button, CanvasPlane, COLOR, FONT, Panel } from '../render/ui';
import { GLOSSARY, RULES } from './reference';

/** Read-only reference: blocks board input without pausing a LAN opponent. */
export class ReferenceOverlay {
  root = new THREE.Group();
  private buttons: Button[] = [];
  private text = new CanvasPlane(840, 660);

  constructor() {
    this.root.renderOrder = 900;
    const shade = new THREE.Mesh(new THREE.PlaneGeometry(VW * 3, VH * 3),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.88, depthTest: false, depthWrite: false }));
    shade.position.set(VW / 2, VH / 2, 500);
    shade.renderOrder = 500;
    const panel = new Panel(900, compact ? 760 : 820, COLOR.cyan, ' REFERENCE ');
    panel.at(800, 450, 501);
    this.text.at(800, 430, 502);
    this.root.add(shade, panel.mesh, this.text.mesh);
    for (const [label, x, action] of [
      ['RULES', 530, () => this.show('rules')],
      ['GLOSSARY', 800, () => this.show('glossary')],
      ['CLOSE', 1070, () => { this.root.visible = false; }],
    ] as const) {
      const button = new Button(230, 44, { label, color: COLOR.cyan });
      button.at(x, 792, 503);
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
      ctx.font = `16px ${FONT}`;
      ctx.textBaseline = 'top';
      (page === 'rules' ? RULES : GLOSSARY).split('\n').forEach((line, i) => {
        ctx.fillStyle = /^[A-Z ]+$/.test(line) && line.trim() ? COLOR.cyan : COLOR.green;
        ctx.fillText(line, 20, 10 + i * 24.5);
      });
    });
  }

  hitTargets() { return this.buttons.map((b) => b.mesh); }
}
