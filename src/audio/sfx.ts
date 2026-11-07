/** Tiny WebAudio synth for low, murky terminal tones. No asset files. */
const MASTER_GAIN = 0.4;
const VOLUME_KEY = 'breach.volume';

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;
  private lastHover = 0;
  private unlocked = false;
  private _volume = 100;

  constructor() {
    try {
      const saved = Number(localStorage.getItem(VOLUME_KEY));
      if (localStorage.getItem(VOLUME_KEY) !== null && Number.isFinite(saved)) this._volume = Math.max(0, Math.min(100, saved));
    } catch { /* storage unavailable: keep default */ }
    // Browsers block audio until a user gesture; stay silent until then.
    const unlock = () => { this.unlocked = true; };
    window.addEventListener('pointerdown', unlock, { once: true, capture: true });
    window.addEventListener('keydown', unlock, { once: true, capture: true });
  }

  /** User volume, 0–100 (default 100). Persisted per browser. */
  get volume() { return this._volume; }
  set volume(v: number) {
    this._volume = Math.max(0, Math.min(100, Math.round(v)));
    try { localStorage.setItem(VOLUME_KEY, String(this._volume)); } catch { /* ignore */ }
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.gain(), this.ctx.currentTime, 0.02);
  }

  private gain() { return MASTER_GAIN * (this._volume / 100); }

  private ac(): AudioContext | null {
    if (this.muted || !this.unlocked || this._volume === 0) return null;
    if (!this.ctx) {
      try {
        const ctx = new AudioContext();
        // master -> lowpass (dull, muffled) -> out, plus a dark echo send
        // so everything sounds like it's bouncing off concrete walls.
        const master = ctx.createGain();
        master.gain.value = this.gain();
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1400;
        lp.Q.value = 0.7;
        master.connect(lp).connect(ctx.destination);

        const delay = ctx.createDelay(1);
        delay.delayTime.value = 0.21;
        const fb = ctx.createGain();
        fb.gain.value = 0.35;
        const fbLp = ctx.createBiquadFilter();
        fbLp.type = 'lowpass';
        fbLp.frequency.value = 700;
        const wet = ctx.createGain();
        wet.gain.value = 0.28;
        lp.connect(delay);
        delay.connect(fbLp).connect(fb).connect(delay);
        delay.connect(wet).connect(ctx.destination);

        this.ctx = ctx;
        this.master = master;
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Soft-attack tone; `detune` (cents) adds a second, slightly-off voice for a thick, uneasy sound. */
  private tone(freq: number, dur: number, type: OscillatorType = 'triangle', vol = 0.5, delay = 0, slide = 0, detune = 0) {
    const ac = this.ac();
    if (!ac || !this.master) return;
    const t = ac.currentTime + delay;
    const g = ac.createGain();
    const attack = Math.min(0.012, dur * 0.3);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.master);
    const voices = detune ? [0, detune] : [0];
    for (const cents of voices) {
      const o = ac.createOscillator();
      o.type = type;
      o.detune.value = cents;
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
  }

  /** Low rumbling noise burst. */
  private noise(dur: number, vol = 0.4, delay = 0, cutoff = 400) {
    const ac = this.ac();
    if (!ac || !this.master) return;
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ac.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start(ac.currentTime + delay);
  }

  hover() {
    const now = performance.now();
    if (now - this.lastHover < 40) return;
    this.lastHover = now;
    this.tone(330, 0.04, 'sine', 0.06);
  }
  click() { this.tone(165, 0.09, 'triangle', 0.3); this.tone(110, 0.12, 'sine', 0.3, 0.03); }
  play() { this.tone(98, 0.2, 'sawtooth', 0.22, 0, 49, 9); this.noise(0.08, 0.15, 0, 300); }
  coin() { this.tone(330, 0.1, 'triangle', 0.22); this.tone(392, 0.18, 'triangle', 0.2, 0.08); }
  draw() { this.tone(520, 0.03, 'sine', 0.1); this.noise(0.03, 0.08, 0, 900); }
  shuffle() { for (let i = 0; i < 6; i++) this.tone(140 + i * 18, 0.05, 'triangle', 0.12, i * 0.035); }
  breach() {
    this.noise(0.5, 0.6, 0, 250);
    this.tone(70, 0.6, 'sawtooth', 0.4, 0, -35, 14);
    this.tone(41, 0.8, 'sine', 0.5);
  }
  heal() { [220, 262, 330].forEach((f, i) => this.tone(f, 0.35, 'sine', 0.22, i * 0.09)); }
  block() { this.tone(110, 0.2, 'triangle', 0.35, 0, 0, 12); this.tone(73, 0.3, 'sine', 0.35, 0.08); }
  turn() { this.tone(196, 0.12, 'triangle', 0.18); this.tone(147, 0.2, 'triangle', 0.18, 0.1); }
  trash() { this.tone(150, 0.35, 'sawtooth', 0.2, 0, -110, 10); }
  boot() {
    this.tone(55, 1.0, 'sine', 0.35);
    for (let i = 0; i < 8; i++) this.tone(80 + Math.random() * 320, 0.05, 'triangle', 0.12, 0.1 + i * 0.06);
  }
  win() { [220, 262, 330, 494].forEach((f, i) => this.tone(f, 0.45, 'triangle', 0.22, i * 0.15, 0, 7)); }
  lose() {
    [196, 185, 165, 131].forEach((f, i) => this.tone(f, 0.5, 'sawtooth', 0.2, i * 0.2, 0, 15));
    this.tone(49, 1.2, 'sine', 0.4, 0.6);
  }
}

export const sfx = new Sfx();
