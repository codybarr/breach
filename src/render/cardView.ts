import * as THREE from 'three';
import { CARDS, cardColor } from '../engine/cards';
import { CARD_H, CARD_W, backTexture, faceTexture, glowTexture } from './cardArt';

const faceGeo = new THREE.PlaneGeometry(CARD_W, CARD_H);
const glowGeo = new THREE.PlaneGeometry(CARD_W * (200 / 148), CARD_H * (260 / 208));

/**
 * A card mesh that eases toward a target transform. Layout code only sets targets.
 */
export class CardView {
  group = new THREE.Group();
  face: THREE.Mesh;
  glow: THREE.Mesh;
  private faceMat: THREE.MeshBasicMaterial;
  private glowMat: THREE.MeshBasicMaterial;

  target = { x: 0, y: 0, z: 0, s: 1, rot: 0, opacity: 1 };
  opacity = 1;
  glowColor: string | null = null;
  glowPulse = false;
  /** Set when the card is flying somewhere to disappear. */
  leaving = false;
  removeWhenArrived = false;
  private faceUp = true;
  speed = 11;

  constructor(public defId: string, faceUp = true) {
    this.faceMat = new THREE.MeshBasicMaterial({ map: faceTexture(defId), transparent: true, depthWrite: false, depthTest: false });
    this.face = new THREE.Mesh(faceGeo, this.faceMat);
    this.glowMat = new THREE.MeshBasicMaterial({
      map: glowTexture(), transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    });
    this.glow = new THREE.Mesh(glowGeo, this.glowMat);
    this.glow.visible = false;
    this.group.add(this.glow, this.face);
    this.setFaceUp(faceUp);
  }

  setDef(defId: string) {
    if (defId === this.defId) return;
    this.defId = defId;
    if (this.faceUp) this.faceMat.map = faceTexture(defId);
  }

  setFaceUp(up: boolean) {
    this.faceUp = up;
    this.faceMat.map = up ? faceTexture(this.defId) : backTexture();
    this.faceMat.needsUpdate = true;
  }

  get isFaceUp() {
    return this.faceUp;
  }

  place(x: number, y: number, z: number, s: number, rot = 0) {
    Object.assign(this.target, { x, y, z, s, rot });
    return this;
  }

  snap() {
    const t = this.target;
    this.group.position.set(t.x, t.y, t.z);
    this.group.scale.setScalar(t.s);
    this.group.rotation.z = t.rot;
    this.opacity = t.opacity;
    this.apply(0);
    return this;
  }

  /** Returns true when the card has arrived (used for removal). */
  update(dt: number, t: number): boolean {
    const k = 1 - Math.exp(-dt * this.speed);
    const g = this.group;
    const tg = this.target;
    g.position.x += (tg.x - g.position.x) * k;
    g.position.y += (tg.y - g.position.y) * k;
    g.position.z = tg.z;
    const s = g.scale.x + (tg.s - g.scale.x) * k;
    g.scale.setScalar(s);
    g.rotation.z += (tg.rot - g.rotation.z) * k;
    this.opacity += (tg.opacity - this.opacity) * k;
    this.apply(t);
    const dx = tg.x - g.position.x, dy = tg.y - g.position.y;
    return dx * dx + dy * dy < 16 && Math.abs(this.opacity - tg.opacity) < 0.05;
  }

  private apply(t: number) {
    this.faceMat.opacity = this.opacity;
    this.face.renderOrder = this.target.z + 0.01;
    this.glow.renderOrder = this.target.z;
    if (this.glowColor) {
      this.glow.visible = true;
      this.glowMat.color.set(this.glowColor);
      const pulse = this.glowPulse ? 0.65 + 0.35 * Math.sin(t * 6) : 1;
      this.glowMat.opacity = this.opacity * pulse;
    } else {
      this.glow.visible = false;
    }
  }

  get typeColor() {
    return cardColor(CARDS[this.defId]);
  }

  dispose() {
    this.faceMat.dispose();
    this.glowMat.dispose();
  }
}
