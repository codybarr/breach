import { CARDS } from '../engine/cards';
import { CARD_ART_UPDATED, backTexture, faceTexture } from '../render/cardArt';

/**
 * Dev-only card index at /cards.html: every card face plus the back, with a
 * name filter and size slider. Card art edits repaint in place via the HMR
 * hook in render/cardArt; edits to this file re-run it.
 */

const root = document.createElement('main');
document.body.append(root);

const prefs = (() => {
  try { return JSON.parse(localStorage.getItem('cardGallery') ?? '{}') as { q?: string; w?: number }; } catch { return {}; }
})();
const save = () => { try { localStorage.setItem('cardGallery', JSON.stringify(prefs)); } catch { /* private mode */ } };

root.innerHTML = `
  <header>
    <h1>CARD INDEX</h1>
    <input type="search" placeholder="filter by name or id" />
    <label>size <input type="range" min="150" max="480" step="10" /></label>
    <span class="count"></span>
  </header>
  <div class="grid"></div>`;
const search = root.querySelector<HTMLInputElement>('input[type="search"]')!;
const size = root.querySelector<HTMLInputElement>('input[type="range"]')!;
const count = root.querySelector<HTMLSpanElement>('.count')!;
const grid = root.querySelector<HTMLDivElement>('.grid')!;
search.value = prefs.q ?? '';
size.value = String(prefs.w ?? 240);

const entries: { id: string; label: string; figure: HTMLElement; canvas: HTMLCanvasElement; source: () => HTMLCanvasElement }[] = [];

function add(id: string, label: string, source: () => HTMLCanvasElement) {
  const figure = document.createElement('figure');
  const canvas = document.createElement('canvas');
  const caption = document.createElement('figcaption');
  caption.textContent = `${label} · ${id}`;
  figure.append(canvas, caption);
  grid.append(figure);
  entries.push({ id, label, figure, canvas, source });
}

/** Copy each texture's current canvas onto the page (textures are repainted on hot update). */
function paint() {
  for (const e of entries) {
    const src = e.source();
    e.canvas.width = src.width;
    e.canvas.height = src.height;
    e.canvas.getContext('2d')!.drawImage(src, 0, 0);
  }
}

function applyFilters() {
  const q = search.value.trim().toLowerCase();
  let shown = 0;
  for (const e of entries) {
    const hit = !q || e.id.includes(q) || e.label.toLowerCase().includes(q);
    e.figure.hidden = !hit;
    if (hit) shown++;
  }
  count.textContent = `${shown} / ${entries.length}`;
  grid.style.setProperty('--card-w', `${size.value}px`);
  prefs.q = search.value;
  prefs.w = Number(size.value);
  save();
}

async function boot() {
  // Card faces bake text into their textures, so wait for the webfonts first.
  await Promise.race([
    Promise.all(['16px "Share Tech Mono"', '32px "VT323"'].map((f) => document.fonts.load(f))),
    new Promise((r) => setTimeout(r, 2500)),
  ]);
  for (const [id, def] of Object.entries(CARDS)) add(id, def.name, () => faceTexture(id).image as HTMLCanvasElement);
  add('__back', 'Card back', () => backTexture().image as HTMLCanvasElement);
  paint();
  applyFilters();
}

search.addEventListener('input', applyFilters);
size.addEventListener('input', applyFilters);
window.addEventListener(CARD_ART_UPDATED, paint);
void boot();

if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.dispose(() => {
    window.removeEventListener(CARD_ART_UPDATED, paint);
    root.remove();
  });
}
