import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Background } from './background';
import { CrtShader } from './crt';

/** Virtual resolution. Every layout coordinate in the game uses this space (y-up, origin bottom-left). */
export const VW = 1600;
export const VH = 900;

/** Touch moving further than this (CSS px) counts as a drag, not a tap. */
const TAP_SLOP_PX = 12;

export interface SceneLike {
  root: THREE.Object3D;
  update(dt: number, t: number): void;
  /** Objects that can be hovered/clicked. Each may carry userData.onClick / userData.onHover. */
  hitTargets(): THREE.Object3D[];
  /** Virtual height (centred on VH / 2) this scene must keep on screen. Less than VH zooms in on wide screens. */
  fitHeight?: number;
  onKey?(e: KeyboardEvent): void;
  dispose?(): void;
}

export class Stage {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.OrthographicCamera;
  composer: EffectComposer;
  crt: ShaderPass;
  bloom: UnrealBloomPass;
  bg: Background;
  current: SceneLike | null = null;

  /** Pointer in virtual coordinates. */
  pointer = new THREE.Vector2(-1000, -1000);
  private ndc = new THREE.Vector2(-10, -10);
  private ray = new THREE.Raycaster();
  private hovered: THREE.Object3D | null = null;
  private clock = new THREE.Clock();
  private glitch = 0;
  /** The finger currently down, if any. */
  private press: { id: number; target: THREE.Object3D | null; wasOpen: THREE.Object3D | null; x: number; y: number; moved: boolean } | null = null;
  /** The card a touch selected. It stays selected after the finger lifts. */
  private touchInspected: THREE.Object3D | null = null;
  /** Hidden element whose padding reports the notch insets, which CSS exposes only through env(). */
  private safeArea = document.createElement('div');

  constructor(parent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 1);
    parent.appendChild(this.renderer.domElement);

    // Camera sits well above every layer (z = -500 .. ~600) so raycasts start in front of all of them.
    this.camera = new THREE.OrthographicCamera(0, VW, VH, 0, 1, 4000);
    this.camera.position.z = 2000;

    this.bg = new Background();
    this.scene.add(this.bg.mesh);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(VW, VH), 0.55, 0.35, 0.72);
    this.composer.addPass(this.bloom);
    this.crt = new ShaderPass(CrtShader);
    this.composer.addPass(this.crt);
    this.composer.addPass(new OutputPass());

    this.safeArea.style.cssText =
      'position:fixed;visibility:hidden;width:0;height:0;padding:0 env(safe-area-inset-right) 0 env(safe-area-inset-left)';
    document.body.appendChild(this.safeArea);
    window.addEventListener('resize', () => this.resize());
    // iOS can update the insets after the resize event when the phone rotates.
    new ResizeObserver(() => this.resize()).observe(this.safeArea, { box: 'border-box' });
    this.resize();

    const el = this.renderer.domElement;
    el.addEventListener('pointermove', (e) => {
      this.setPointer(e);
      const p = this.press;
      if (p?.id !== e.pointerId) return;
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > TAP_SLOP_PX) p.moved = true;
      if (!p.moved) return;
      this.updateHover();
      if (this.hovered?.userData.preview) this.touchInspected = this.hovered;
    });
    el.addEventListener('pointerdown', (e) => {
      this.setPointer(e);
      this.updateHover();
      if (e.pointerType === 'touch') {
        if (!e.isPrimary) return;
        this.press = { id: e.pointerId, target: this.hovered, wasOpen: this.touchInspected, x: e.clientX, y: e.clientY, moved: false };
        if (this.hovered?.userData.preview) this.touchInspected = this.hovered;
        return;
      }
      const fn = this.hovered?.userData.onClick;
      if (fn && e.button === 0) fn();
    });
    el.addEventListener('pointerup', (e) => {
      if (this.press?.id !== e.pointerId) return;
      this.setPointer(e);
      this.updateHover();
      this.releasePress();
    });
    el.addEventListener('pointercancel', (e) => {
      if (this.press?.id !== e.pointerId) return;
      this.press = null;
      this.ndc.set(-10, -10);
    });
    el.addEventListener('pointerleave', () => this.ndc.set(-10, -10));
    // Pointer events handle all input; the mouse events a tap also generates would land on whatever it just opened.
    el.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });
    // Android raises a context menu on long-press, which would interrupt the touch.
    el.addEventListener('contextmenu', (e) => { if (this.press) e.preventDefault(); });
    window.addEventListener('keydown', (e) => this.current?.onKey?.(e));
  }

  setScene(s: SceneLike) {
    if (this.current) {
      this.scene.remove(this.current.root);
      this.current.dispose?.();
    }
    this.hovered = null;
    this.touchInspected = null;
    this.current = s;
    this.scene.add(s.root);
    this.fitCamera();
  }

  /** Kick the CRT glitch effect (0..1). */
  pulseGlitch(amount: number) {
    this.glitch = Math.max(this.glitch, amount);
  }

  private resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.fitCamera();
    const pr = this.renderer.getPixelRatio();
    this.crt.uniforms.uRes.value.set(w * pr, h * pr);
  }

  private fitCamera() {
    const w = window.innerWidth, h = window.innerHeight;
    const safe = getComputedStyle(this.safeArea);
    const inset = Math.max(parseFloat(safe.paddingLeft) || 0, parseFloat(safe.paddingRight) || 0);
    // Fit the virtual area inside the notch-safe window, extending the visible world on the longer axis.
    const scale = Math.min((w - inset * 2) / VW, h / (this.current?.fitHeight ?? VH));
    const ww = w / scale, wh = h / scale;
    this.camera.left = VW / 2 - ww / 2;
    this.camera.right = VW / 2 + ww / 2;
    this.camera.bottom = VH / 2 - wh / 2;
    this.camera.top = VH / 2 + wh / 2;
    this.camera.updateProjectionMatrix();
    this.bg.resize(this.camera);
  }

  /**
   * Touch selects before it acts: the first tap on a card opens it, a second tap on
   * that same card activates it, and tapping nothing closes it. Dragging flips between
   * cards. `oneTap` cards act on every tap; `keepInspect` targets don't close it.
   */
  private releasePress() {
    const p = this.press!;
    this.press = null;
    this.ndc.set(-10, -10);
    const t = p.target;
    if (!t) {
      if (!p.moved) this.clearInspect();
      return;
    }
    if (t.userData.preview) {
      if (p.moved) return;
      if (t.userData.oneTap) t.userData.onClick?.();
      else if (p.wasOpen === t) {
        t.userData.onClick?.();
        this.clearInspect();
      }
      return;
    }
    if (this.hovered === t) t.userData.onClick?.();
    if (!t.userData.keepInspect) this.clearInspect();
  }

  private setPointer(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const u = (e.clientX - r.left) / r.width;
    const v = 1 - (e.clientY - r.top) / r.height;
    this.ndc.set(u * 2 - 1, v * 2 - 1);
    const c = this.camera;
    this.pointer.set(c.left + u * (c.right - c.left), c.bottom + v * (c.top - c.bottom));
  }

  private updateHover() {
    let hit: THREE.Object3D | null = null;
    const targets = this.current ? this.current.hitTargets().filter((o) => o.visible && isVisibleUp(o)) : [];
    // The selected card can leave play while it's open.
    if (this.touchInspected && !targets.includes(this.touchInspected)) this.touchInspected = null;
    if (this.ndc.x > -2) {
      this.ray.setFromCamera(this.ndc, this.camera);
      const hits = this.ray.intersectObjects(targets, false);
      hits.sort((a, b) => worldZ(b.object) - worldZ(a.object));
      hit = hits[0]?.object ?? null;
    }
    if (hit !== this.hovered) {
      this.hovered?.userData.onHover?.(false);
      this.hovered = hit;
      hit?.userData.onHover?.(true);
    }
    this.renderer.domElement.style.cursor = hit?.userData.onClick ? 'pointer' : 'default';
  }

  get hoveredObject() {
    return this.hovered;
  }

  /** The card to show: the one a touch selected, otherwise whatever the mouse is over. */
  get inspectedObject() {
    return this.touchInspected ?? this.hovered;
  }

  get touchInspecting() {
    return !!this.touchInspected;
  }

  clearInspect() {
    this.touchInspected = null;
  }

  start() {
    const loop = () => {
      requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.05);
      const t = this.clock.elapsedTime;
      this.updateHover();
      this.current?.update(dt, t);
      this.bg.update(t);
      this.glitch = Math.max(0, this.glitch - dt * 1.8);
      this.crt.uniforms.uTime.value = t;
      this.crt.uniforms.uGlitch.value = this.glitch;
      this.composer.render();
    };
    loop();
  }
}

function worldZ(o: THREE.Object3D) {
  const v = new THREE.Vector3();
  o.getWorldPosition(v);
  return v.z;
}

function isVisibleUp(o: THREE.Object3D | null): boolean {
  while (o) {
    if (!o.visible) return false;
    o = o.parent;
  }
  return true;
}
