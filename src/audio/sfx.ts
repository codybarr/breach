/** Tiny WebAudio synth for terminal bleeps. No asset files. */
class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;
  private lastHover = 0;
  private unlocked = false;

  constructor() {
    // Browsers block audio until a user gesture; stay silent until then.
    const unlock = () => { this.unlocked = true; };
    window.addEventListener('pointerdown', unlock, { once: true, capture: true });
    window.addEventListener('keydown', unlock, { once: true, capture: true });
  }

  private ac(): AudioContext | null {
    if (this.muted || !this.unlocked) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.18;
        this.master.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.5, delay = 0, slide = 0) {
    const ac = this.ac();
    if (!ac || !this.master) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol = 0.4, delay = 0) {
    const ac = this.ac();
    if (!ac || !this.master) return;
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.master);
    src.start(ac.currentTime + delay);
  }

  hover() {
    const now = performance.now();
    if (now - this.lastHover < 40) return;
    this.lastHover = now;
    this.tone(1800, 0.025, 'square', 0.08);
  }
  click() { this.tone(880, 0.05, 'square', 0.25); this.tone(1320, 0.05, 'square', 0.2, 0.04); }
  play() { this.tone(440, 0.08, 'sawtooth', 0.25, 0, 440); }
  coin() { this.tone(988, 0.06, 'square', 0.2); this.tone(1319, 0.1, 'square', 0.2, 0.06); }
  draw() { this.tone(2200, 0.02, 'triangle', 0.15); }
  shuffle() { for (let i = 0; i < 6; i++) this.tone(600 + i * 120, 0.03, 'square', 0.1, i * 0.025); }
  breach() { this.noise(0.25, 0.5); this.tone(140, 0.3, 'sawtooth', 0.4, 0, -90); }
  heal() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.25, i * 0.06)); }
  block() { this.tone(300, 0.15, 'square', 0.3); this.tone(200, 0.2, 'square', 0.3, 0.08); }
  turn() { this.tone(660, 0.07, 'square', 0.15); this.tone(990, 0.09, 'square', 0.15, 0.07); }
  trash() { this.tone(300, 0.2, 'sawtooth', 0.2, 0, -250); }
  boot() { for (let i = 0; i < 8; i++) this.tone(200 + Math.random() * 1600, 0.03, 'square', 0.12, i * 0.05); }
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.25, 'square', 0.25, i * 0.12)); }
  lose() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.3, 'sawtooth', 0.25, i * 0.15)); }
}

export const sfx = new Sfx();
