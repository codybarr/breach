import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Background } from './background';
import { CRT_CURVE, CrtShader } from './crt';

/** Virtual resolution. Every layout coordinate in the game uses this space (y-up, origin bottom-left). */
export const VW = 1600;
export const VH = 900;

export interface SceneLike {
  root: THREE.Object3D;
  update(dt: number, t: number): void;
  /** Objects that can be hovered/clicked. Each may carry userData.onClick / userData.onHover. */
  hitTargets(): THREE.Object3D[];
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

    window.addEventListener('resize', () => this.resize());
    this.resize();

    const el = this.renderer.domElement;
    el.addEventListener('pointermove', (e) => this.setPointer(e));
    el.addEventListener('pointerdown', (e) => {
      this.setPointer(e);
      this.updateHover();
      const fn = this.hovered?.userData.onClick;
      if (fn && e.button === 0) fn();
    });
    el.addEventListener('pointerleave', () => this.ndc.set(-10, -10));
    window.addEventListener('keydown', (e) => this.current?.onKey?.(e));
  }

  setScene(s: SceneLike) {
    if (this.current) {
      this.scene.remove(this.current.root);
      this.current.dispose?.();
    }
    this.hovered = null;
    this.current = s;
    this.scene.add(s.root);
  }

  /** Kick the CRT glitch effect (0..1). */
  pulseGlitch(amount: number) {
    this.glitch = Math.max(this.glitch, amount);
  }

  private resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    // Fit the virtual area inside the window, extending the visible world on the longer axis.
    const scale = Math.min(w / VW, h / VH);
    const ww = w / scale, wh = h / scale;
    this.camera.left = VW / 2 - ww / 2;
    this.camera.right = VW / 2 + ww / 2;
    this.camera.bottom = VH / 2 - wh / 2;
    this.camera.top = VH / 2 + wh / 2;
    this.camera.updateProjectionMatrix();
    this.bg.resize(this.camera);
    const pr = this.renderer.getPixelRatio();
    this.crt.uniforms.uRes.value.set(w * pr, h * pr);
  }

  private setPointer(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    // Screen UV -> apply the same barrel curve the CRT shader uses, so picking matches what you see.
    let u = (e.clientX - r.left) / r.width;
    let v = 1 - (e.clientY - r.top) / r.height;
    const cx = u * 2 - 1, cy = v * 2 - 1;
    const k = (cx * cx + cy * cy) * CRT_CURVE;
    u = (cx + cx * k) * 0.5 + 0.5;
    v = (cy + cy * k) * 0.5 + 0.5;
    this.ndc.set(u * 2 - 1, v * 2 - 1);
    const c = this.camera;
    this.pointer.set(c.left + u * (c.right - c.left), c.bottom + v * (c.top - c.bottom));
  }

  private updateHover() {
    let hit: THREE.Object3D | null = null;
    if (this.current && this.ndc.x > -2) {
      this.ray.setFromCamera(this.ndc, this.camera);
      const targets = this.current.hitTargets().filter((o) => o.visible && isVisibleUp(o));
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
