/**
 * Mobile helpers: the game renders a fixed 1600x900 virtual screen, so on a
 * phone it only becomes playable in landscape with the browser chrome gone.
 *
 * - Installed as a PWA (manifest.webmanifest, display: fullscreen) there is no
 *   chrome at all, and nothing here shows.
 * - In a mobile browser that supports the Fullscreen API (Android, iPad), the
 *   first tap after loading or rotating to landscape enters fullscreen and is
 *   swallowed so it doesn't also click whatever is underneath. A corner button
 *   lets you re-enter after backing out.
 * - On iPhone Safari (no Fullscreen API) the button explains Add to Home Screen.
 * - In portrait, a dismissible overlay asks you to rotate.
 */

export const touch = matchMedia('(pointer: coarse)').matches;
/** A phone: small enough that the game swaps to its enlarged touch layout. Tablets keep the full one. */
export const compact = touch && Math.min(screen.width, screen.height) <= 500;
const landscapeMq = matchMedia('(orientation: landscape)');
const installed =
  matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
const canFullscreen = typeof document.documentElement.requestFullscreen === 'function';

export function setupMobile() {
  if (!touch || installed) return;

  const button = el('button', 'fs-btn', '[ ⛶ ]');
  button.setAttribute('aria-label', 'Fullscreen');
  const hint = el('div', 'mobile-overlay');
  const rotate = el('div', 'mobile-overlay');
  rotate.innerHTML =
    `<div class="mo-title">ROTATE DEVICE</div>` +
    `<div>BREACH.EXE is played in landscape.</div>` +
    (canFullscreen ? '' : `<div class="mo-dim">Tip: Share → Add to Home Screen for fullscreen.</div>`) +
    `<div class="mo-dim">tap to continue anyway</div>`;
  hint.innerHTML =
    `<div class="mo-title">FULLSCREEN</div>` +
    `<div>Safari can't hide its toolbars here.</div>` +
    `<div>Tap <b>Share</b> → <b>Add to Home Screen</b>,<br>then launch BREACH.EXE from your home screen.</div>` +
    `<div class="mo-dim">tap to close</div>`;
  document.body.append(button, hint, rotate);

  let rotateDismissed = false;
  // Armed: the next tap goes to fullscreen instead of the game.
  let armed = canFullscreen;

  const enterFullscreen = async () => {
    armed = false;
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      await (screen.orientation as ScreenOrientation & { lock?(o: string): Promise<void> }).lock?.('landscape');
    } catch {
      /* refused or unsupported; the button stays available */
    }
  };

  const sync = () => {
    const fs = !!document.fullscreenElement;
    const portrait = !landscapeMq.matches;
    button.hidden = fs;
    rotate.hidden = !portrait || rotateDismissed;
  };

  window.addEventListener(
    'pointerdown',
    (e) => {
      if (!armed || document.fullscreenElement || !landscapeMq.matches) return;
      if (e.target === button) return;
      e.stopPropagation();
      e.preventDefault();
      void enterFullscreen();
    },
    { capture: true },
  );

  button.addEventListener('pointerdown', (e) => e.stopPropagation());
  button.addEventListener('click', () => {
    if (canFullscreen) void enterFullscreen();
    else hint.hidden = false;
  });
  hint.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    hint.hidden = true;
  });
  rotate.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    rotateDismissed = true;
    sync();
  });

  landscapeMq.addEventListener('change', () => {
    // Re-arm on every turn to landscape so rotating sideways "just works".
    if (landscapeMq.matches && canFullscreen && !document.fullscreenElement) armed = true;
    if (landscapeMq.matches) rotateDismissed = false;
    sync();
  });
  document.addEventListener('fullscreenchange', sync);
  hint.hidden = true;
  sync();
}

/** Canvas text can't raise a phone keyboard, so touch edits happen in a real input pinned above it. */
export function promptText(opts: { title: string; value: string; maxLength: number; clean: (s: string) => string; onDone: (v: string) => void }) {
  const form = el('form', 'text-edit');
  const input = el('input', '');
  input.value = opts.value;
  input.maxLength = opts.maxLength;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('autocapitalize', 'characters');
  input.setAttribute('autocorrect', 'off');
  input.enterKeyHint = 'done';
  input.setAttribute('aria-label', opts.title);
  const ok = el('button', '', 'OK');
  const cancel = el('button', '', 'CANCEL');
  cancel.type = 'button';
  form.append(el('span', '', opts.title), input, ok, cancel);
  document.body.append(form);

  const close = () => {
    form.remove();
    window.scrollTo(0, 0); // iOS leaves the page shifted after its keyboard closes
  };
  input.addEventListener('input', () => {
    const clean = opts.clean(input.value);
    if (clean === input.value) return;
    const caret = input.selectionStart;
    input.value = clean; // assigning moves the caret to the end
    input.setSelectionRange(caret, caret);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    close();
    opts.onDone(input.value);
  });
  cancel.addEventListener('click', close);
  // Keep typing away from the scene's own keyboard handling.
  form.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') close();
  });
  input.focus();
  input.select();
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = '') {
  const e = document.createElement(tag);
  e.className = cls;
  e.textContent = text;
  return e;
}
