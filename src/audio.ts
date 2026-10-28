/**
 * Procedural audio: no asset files, no licensing, no load time.
 * A slow lo-fi loop (pad, bass, arpeggio, soft hat) and short SFX built from
 * oscillators. iOS/Safari will not start an AudioContext before a user gesture,
 * so unlock() is called from the first pointerdown or keydown.
 */
type Sfx = 'ui' | 'ok' | 'bad' | 'cash' | 'door' | 'step' | 'alert';

const CHORDS: number[][] = [
  [220.0, 261.63, 329.63, 392.0],  // Am7
  [174.61, 220.0, 261.63, 349.23], // Fmaj7
  [130.81, 164.81, 196.0, 246.94], // Cmaj7
  [196.0, 246.94, 293.66, 349.23], // G
];

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private bar = 0;
  private nextBarAt = 0;
  private timer: number | null = null;
  private sounding = false;

  muted = false;

  unlock(): void {
    try {
      this.unlockInner();
    } catch {
      /* audio is optional: never let it break input handling */
    }
  }

  private unlockInner(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.34;
      this.musicBus.connect(this.master);
      this.noise = this.buildNoise(this.ctx);
    }
    void this.ctx.resume();
    if (!this.sounding) {
      this.sounding = true;
      this.nextBarAt = this.ctx.currentTime + 0.15;
      this.timer = window.setInterval(() => this.schedule(), 250);
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }

  private buildNoise(ctx: AudioContext): AudioBuffer {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const barLen = 2.4; // ~100 bpm in 4/4, two beats per bar here: slow on purpose
    if (ctx.currentTime + 0.4 < this.nextBarAt) return;

    const chord = CHORDS[this.bar % CHORDS.length];
    const t = Math.max(ctx.currentTime + 0.05, this.nextBarAt);

    // pad: two detuned triangles per chord tone, slow attack
    chord.forEach((f, i) => this.tone(f, t, barLen * 0.95, 0.035, 'triangle', this.musicBus!, 0.35 + i * 0.02));
    // bass: root an octave down
    this.tone(chord[0] / 2, t, barLen * 0.7, 0.06, 'sine', this.musicBus!, 0.02);
    // arpeggio: short blips on off-beats
    for (let i = 0; i < 6; i += 1) {
      const f = chord[(i + this.bar) % chord.length] * 2;
      this.tone(f, t + i * (barLen / 6), 0.12, 0.018, 'square', this.musicBus!, 0.01);
    }
    // soft hat from filtered noise
    for (let i = 0; i < 4; i += 1) {
      this.hat(t + i * (barLen / 4), 0.06);
    }

    this.bar += 1;
    this.nextBarAt = t + barLen;
  }

  private tone(freq: number, at: number, dur: number, gain: number, type: OscillatorType,
               bus: AudioNode, attack = 0.02): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g);
    g.connect(bus);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  private hat(at: number, gain: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.musicBus!);
    src.start(at);
    src.stop(at + 0.08);
  }

  play(name: Sfx): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const now = ctx.currentTime;
    const bus = this.master;

    switch (name) {
      case 'ui':
        this.tone(720, now, 0.05, 0.05, 'square', bus, 0.005);
        break;
      case 'ok':
        this.tone(660, now, 0.08, 0.07, 'square', bus, 0.005);
        this.tone(990, now + 0.09, 0.12, 0.06, 'square', bus, 0.005);
        break;
      case 'bad':
        this.tone(180, now, 0.16, 0.08, 'sawtooth', bus, 0.005);
        this.tone(120, now + 0.08, 0.2, 0.07, 'sawtooth', bus, 0.005);
        break;
      case 'cash':
        [880, 1170, 1560].forEach((f, i) => this.tone(f, now + i * 0.05, 0.1, 0.05, 'square', bus, 0.004));
        break;
      case 'door':
        this.tone(140, now, 0.18, 0.07, 'sine', bus, 0.01);
        break;
      case 'alert':
        [0, 0.16, 0.32].forEach((d) => this.tone(1320, now + d, 0.09, 0.05, 'square', bus, 0.004));
        break;
      case 'step':
        this.tone(90 + Math.random() * 20, now, 0.03, 0.02, 'sine', bus, 0.004);
        break;
      default:
        break;
    }
  }
}

export const audio = new AudioEngine();
