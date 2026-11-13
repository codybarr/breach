import * as THREE from 'three';
import { sfx } from '../audio/sfx';
import { BASIC_PILES, KINGDOM_POOL } from '../engine/cards';
import { warmCardTextures } from '../render/cardArt';
import { CardView } from '../render/cardView';
import { DEFAULT_FRACTURE, Fractures, type FractureStyle } from '../render/fracture';
import { Stage, type SceneLike } from '../render/stage';
import { COLOR, Label, Panel } from '../render/ui';

/**
 * Dev-only lab at /fracture.html for the breach fracture effect: a mock table on
 * the real stage (bloom + CRT), with controls to fire hits and tune the look.
 * Click the table to crack it there; keys 1-8 hit for that much damage.
 */

type NumKey = { [K in keyof FractureStyle]: FractureStyle[K] extends number ? K : never }[keyof FractureStyle];
const SLIDERS: { key: NumKey; label: string; min: number; max: number; step: number }[] = [
  { key: 'pixel', label: 'dot size', min: 0, max: 24, step: 1 },
  { key: 'scatter', label: 'scatter', min: 0, max: 400, step: 10 },
  { key: 'round', label: 'roundness', min: 0, max: 1, step: 0.05 },
  { key: 'vignette', label: 'edge haze', min: 0, max: 1.5, step: 0.05 },
  { key: 'spread', label: 'infection', min: 0, max: 1, step: 0.05 },
  { key: 'debris', label: 'sparks', min: 0, max: 1, step: 0.05 },
  { key: 'rays', label: 'rays', min: 2, max: 16, step: 1 },
  { key: 'reach', label: 'reach', min: 80, max: 900, step: 10 },
  { key: 'scaling', label: 'dmg scale', min: 0, max: 1, step: 0.05 },
  { key: 'step', label: 'piece len', min: 10, max: 140, step: 2 },
  { key: 'jagged', label: 'jagged', min: 0, max: 1, step: 0.05 },
  { key: 'branch', label: 'branching', min: 0, max: 0.8, step: 0.05 },
  { key: 'web', label: 'webbing', min: 0, max: 1, step: 0.05 },
  { key: 'width', label: 'width', min: 1, max: 20, step: 0.5 },
  { key: 'speed', label: 'speed', min: 300, max: 8000, step: 100 },
  { key: 'heat', label: 'hot tip', min: 0, max: 0.8, step: 0.02 },
  { key: 'hold', label: 'hold', min: 0, max: 3, step: 0.05 },
  { key: 'fade', label: 'fade', min: 0.05, max: 4, step: 0.05 },
  { key: 'flicker', label: 'flicker', min: 0, max: 1, step: 0.05 },
  { key: 'flash', label: 'flash', min: 0, max: 2, step: 0.05 },
];

type Origin = 'click' | 'panel' | 'centre' | 'edge';
interface Prefs { v: number; style: FractureStyle; above: boolean; glitch: boolean; sound: boolean; auto: boolean; origin: Origin; damage: number }
const STORE = 'fractureLab';
const fresh = (): Prefs => ({ v: 5, style: { ...DEFAULT_FRACTURE }, above: false, glitch: true, sound: true, auto: false, origin: 'centre', damage: 4 });
const prefs: Prefs = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? '{}') as Partial<Prefs>;
    const merged = { ...fresh(), ...saved, style: { ...DEFAULT_FRACTURE, ...saved.style } };
    // Each version changed what the cracks are made of, so a look saved for an older one starts over.
    if (saved.v === 5) return merged;
    if (saved.v !== 4) return { ...merged, v: 5, origin: 'centre', style: { ...DEFAULT_FRACTURE } };
    // v5 only shortened the timing: move a v4 look onto it wherever its timing was never touched.
    const was = { speed: 1800, hold: 0.45, fade: 1.2 } as const;
    for (const k of ['speed', 'hold', 'fade'] as const) if (merged.style[k] === was[k]) merged.style[k] = DEFAULT_FRACTURE[k];
    return { ...merged, v: 5 };
  } catch { return fresh(); }
})();
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(prefs)); } catch { /* private mode */ } };

const MY_PANEL = { x: 172, y: 252 };

/** A still table laid out roughly like a match, so the cracks can be judged against real cards. */
class MockTable implements SceneLike {
  root = new THREE.Group();
  fractures = new Fractures();
  private cards: CardView[] = [];

  constructor() {
    this.root.add(this.fractures.root);
    const put = (id: string, x: number, y: number, s: number, faceUp = true, rot = 0) => {
      const v = new CardView(id, faceUp);
      v.place(x, y, 10 + this.cards.length * 0.01, s, rot).snap();
      this.cards.push(v);
      this.root.add(v.group);
    };
    const mid = 640;
    KINGDOM_POOL.slice(0, 10).forEach((id, i) => put(id, mid + ((i % 5) - 2) * 124, 712 - Math.floor(i / 5) * 152, 0.66));
    BASIC_PILES.forEach((id, i) => put(id, i === 6 ? 172 : 75 + (i % 3) * 97, i === 6 ? 408 : 712 - Math.floor(i / 3) * 152, 0.58));
    ['megabyte', 'firewall', 'megabyte', 'node', 'gigabyte'].forEach((id, i) => put(id, mid + (i - 2) * 132, 140, 1, true, (2 - i) * 0.03));
    for (let i = 0; i < 5; i++) put('megabyte', 600 + (i - 2) * 46, 840, 0.42, false);

    const frame = (x: number, y: number, w: number, h: number, color: string, title: string) => {
      const p = new Panel(w, h, color, title).at(x, y, 5);
      this.root.add(p.mesh);
    };
    frame(MY_PANEL.x, MY_PANEL.y, 316, 128, COLOR.green, 'YOU');
    frame(172, 840, 316, 104, COLOR.red, 'GHOST');
    frame(1345, 112, 480, 196, COLOR.dim, 'LOG');
    const int = new Label(280, 60, 'INTEGRITY 16 / 20', { size: 24, color: COLOR.green, align: 'center' }).at(MY_PANEL.x, MY_PANEL.y - 8, 6);
    this.root.add(int.mesh);
  }

  update(dt: number, t: number) {
    for (const c of this.cards) c.update(dt, t);
    this.fractures.update(dt);
  }

  hitTargets() {
    return [];
  }
}

async function boot() {
  const fonts = ['16px "Share Tech Mono"', '32px "VT323"'];
  await Promise.race([Promise.all(fonts.map((f) => document.fonts.load(f))), new Promise((r) => setTimeout(r, 2500))]);
  warmCardTextures();

  const stage = new Stage(document.body);
  const table = new MockTable();
  const fx = table.fractures;
  fx.style = prefs.style;
  fx.setLayer(prefs.above);
  stage.setScene(table);
  stage.start();

  const strike = (damage: number, at?: { x: number; y: number }) => {
    prefs.damage = damage;
    const cam = stage.camera;
    let p = at;
    if (!p) {
      if (prefs.origin === 'edge') {
        const along = Math.random();
        p = [
          { x: cam.left + along * (cam.right - cam.left), y: cam.bottom }, { x: cam.left + along * (cam.right - cam.left), y: cam.top },
          { x: cam.left, y: cam.bottom + along * (cam.top - cam.bottom) }, { x: cam.right, y: cam.bottom + along * (cam.top - cam.bottom) },
        ][Math.floor(Math.random() * 4)];
      } else if (prefs.origin === 'panel') p = MY_PANEL;
      else p = { x: (cam.left + cam.right) / 2, y: (cam.bottom + cam.top) / 2 };
    }
    // A click lands exactly where it was aimed; everything else scatters around its origin.
    fx.hit(p.x, p.y, damage, cam, at ? 0 : undefined);
    if (prefs.glitch) stage.pulseGlitch(0.95);
    if (prefs.sound) sfx.breach();
    save();
    highlight();
  };

  // ───────────────────────── controls ─────────────────────────

  const lab = document.createElement('aside');
  lab.id = 'lab';
  lab.innerHTML = `
    <h1>FRACTURE LAB</h1>
    <p>Click the table to crack it there, or press 1-8 to take that much damage. Dot size 0 draws smooth lines.</p>
    <h2>TAKE A HIT</h2>
    <div class="hits">${[1, 2, 3, 4, 5, 6, 8, 10].map((n) => `<button data-hit="${n}">-${n}</button>`).join('')}</div>
    <div class="row" style="grid-template-columns: 78px 1fr; margin-top: 8px">
      <span>origin</span>
      <select id="origin">
        <option value="centre">screen centre</option>
        <option value="panel">my integrity panel</option>
        <option value="edge">random screen edge</option>
      </select>
    </div>
    <label class="check"><input type="checkbox" id="toEdge" /> cracks run to the screen edge</label>
    <label class="check"><input type="checkbox" id="above" /> draw on top of the cards</label>
    <label class="check"><input type="checkbox" id="glitch" /> CRT glitch pulse (as in game)</label>
    <label class="check"><input type="checkbox" id="sound" /> breach sound</label>
    <label class="check"><input type="checkbox" id="auto" /> repeat every 2.5 s</label>
    <h2>LOOK</h2>
    <div id="sliders"></div>
    <div class="row" style="grid-template-columns: 78px 1fr">
      <span>directions</span>
      <select id="angles"><option value="4">right angles only</option><option value="8">right angles + diagonals</option><option value="0">any direction</option></select>
    </div>
    <div class="row" style="grid-template-columns: 78px 1fr"><span>colour</span><input type="color" id="color" /></div>
    <h2>SETTINGS</h2>
    <div class="bar"><button id="copy">COPY</button><button id="reset">RESET</button><button id="clear">CLEAR CRACKS</button></div>
    <textarea id="dump" readonly></textarea>`;
  const toggle = document.createElement('button');
  toggle.id = 'toggle';
  toggle.textContent = 'PANEL';
  toggle.onclick = () => lab.classList.toggle('closed');
  document.body.append(lab, toggle);

  const $ = <T extends HTMLElement>(sel: string) => lab.querySelector<T>(sel)!;
  const dump = $<HTMLTextAreaElement>('#dump');
  const sliders = $<HTMLDivElement>('#sliders');
  const inputs = new Map<NumKey, { input: HTMLInputElement; out: HTMLOutputElement }>();

  for (const def of SLIDERS) {
    const row = document.createElement('label');
    row.className = 'row';
    row.innerHTML = `<span>${def.label}</span><input type="range" min="${def.min}" max="${def.max}" step="${def.step}" /><output></output>`;
    const input = row.querySelector('input')!, out = row.querySelector('output')!;
    input.oninput = () => {
      prefs.style[def.key] = Number(input.value);
      out.textContent = input.value;
      refresh();
    };
    // Letting go of a slider fires a hit, so every tweak is seen straight away.
    input.onchange = () => strike(prefs.damage);
    inputs.set(def.key, { input, out });
    sliders.append(row);
  }

  const color = $<HTMLInputElement>('#color');
  color.oninput = () => { prefs.style.color = color.value; refresh(); };
  color.onchange = () => strike(prefs.damage);

  const checks = ['above', 'glitch', 'sound', 'auto'] as const;
  for (const key of checks) {
    const box = $<HTMLInputElement>(`#${key}`);
    box.onchange = () => {
      prefs[key] = box.checked;
      if (key === 'above') fx.setLayer(box.checked);
      refresh();
    };
  }
  const angles = $<HTMLSelectElement>('#angles');
  angles.onchange = () => { prefs.style.angles = Number(angles.value); refresh(); strike(prefs.damage); };
  const toEdge = $<HTMLInputElement>('#toEdge');
  toEdge.onchange = () => { prefs.style.toEdge = toEdge.checked; refresh(); strike(prefs.damage); };
  const origin = $<HTMLSelectElement>('#origin');
  origin.onchange = () => { prefs.origin = origin.value as Origin; refresh(); };

  lab.querySelectorAll<HTMLButtonElement>('[data-hit]').forEach((b) => { b.onclick = () => strike(Number(b.dataset.hit)); });
  const highlight = () => lab.querySelectorAll<HTMLButtonElement>('[data-hit]').forEach((b) => b.classList.toggle('on', Number(b.dataset.hit) === prefs.damage));

  $<HTMLButtonElement>('#clear').onclick = () => fx.clear();
  $<HTMLButtonElement>('#reset').onclick = () => { Object.assign(prefs.style, DEFAULT_FRACTURE); load(); refresh(); strike(prefs.damage); };
  $<HTMLButtonElement>('#copy').onclick = async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    try { await navigator.clipboard.writeText(dump.value); btn.textContent = 'COPIED'; } catch { dump.select(); btn.textContent = 'SELECTED'; }
    setTimeout(() => { btn.textContent = 'COPY'; }, 1200);
  };

  function load() {
    for (const [key, { input, out }] of inputs) { input.value = String(prefs.style[key]); out.textContent = input.value; }
    color.value = prefs.style.color;
    toEdge.checked = prefs.style.toEdge;
    angles.value = String(prefs.style.angles);
    for (const key of checks) $<HTMLInputElement>(`#${key}`).checked = prefs[key];
    origin.value = prefs.origin === 'click' ? 'centre' : prefs.origin;
    highlight();
  }
  function refresh() {
    dump.value = JSON.stringify({ ...prefs.style, layer: prefs.above ? 'above cards' : 'beneath cards' }, null, 1);
    save();
  }
  load();
  refresh();

  stage.renderer.domElement.addEventListener('pointerdown', (e) => {
    if (e.button === 0) strike(prefs.damage, { x: stage.pointer.x, y: stage.pointer.y });
  });
  window.addEventListener('keydown', (e) => {
    const n = Number(e.key);
    if (n >= 1 && n <= 8) strike(n);
  });
  setInterval(() => { if (prefs.auto && !document.hidden) strike(prefs.damage); }, 2500);

  (window as unknown as { fx: Fractures }).fx = fx;
}

void boot();
