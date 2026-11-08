import * as THREE from 'three';
import { CardView } from './cardView';
import { VH, VW, type Stage } from './stage';
import { Button, COLOR } from './ui';

const RIGHT_X = 1170;
const CARD = { y: 510, z: 600, s: 2.9 };
const BUTTON = { y: 130, w: 435, h: 110 };

export interface InspectAction {
  label: string;
  enabled: boolean;
  run?: () => void;
}

/** The enlarged card a touch selects, with a button for what that card can do right now. */
export class CardInspector {
  root = new THREE.Group();
  private view = new CardView('megabyte');
  private shade: THREE.Mesh;
  private button = new Button(BUTTON.w, BUTTON.h, { label: '', fontSize: 34, color: COLOR.green, disabledColor: COLOR.mid, fill: COLOR.bg });
  private run: (() => void) | undefined;

  constructor(private stage: Stage) {
    this.shade = new THREE.Mesh(
      new THREE.PlaneGeometry(VW * 3, VH * 3),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthTest: false, depthWrite: false }),
    );
    this.shade.position.set(VW / 2, VH / 2, CARD.z - 10);
    this.shade.renderOrder = CARD.z - 10;
    this.view.speed = 30;
    this.button.mesh.userData.keepInspect = true;
    this.button.onClick = () => {
      this.run?.();
      this.stage.clearInspect();
    };
    this.root.add(this.shade, this.view.group, this.button.mesh);
    this.root.visible = false;
  }

  get open() {
    return this.stage.touchInspecting;
  }

  /** While open, these replace the scene's buttons so a stray tap can't end the turn. */
  hitTargets(): THREE.Object3D[] {
    return this.button.mesh.visible ? [this.view.face, this.button.mesh] : [this.view.face];
  }

  update(dt: number, t: number, action: InspectAction | null) {
    const target = this.open ? this.stage.inspectedObject : null;
    const id: string | undefined = target?.userData.preview;
    if (!target || !id) {
      this.root.visible = false;
      return;
    }
    // Stay on the far half from the selected card so it can still be tapped again.
    const x = target.getWorldPosition(new THREE.Vector3()).x < VW / 2 ? RIGHT_X : VW - RIGHT_X;
    this.view.setDef(id);
    this.view.place(x, CARD.y, CARD.z, CARD.s);
    if (!this.root.visible) this.view.snap();
    this.root.visible = true;
    this.view.update(dt, t);
    this.button.mesh.visible = !!action;
    if (action) {
      this.run = action.run;
      this.button.set({ label: action.label, enabled: action.enabled });
      this.button.at(x, BUTTON.y, CARD.z + 10);
    }
  }
}
