// Procedural audio (Web Audio API): all sound effects are synthesised at runtime,
// so the game needs no audio files. Separate music / effects volume buses.
import { settings } from '../core/settings.js';
import { MusicPlayer } from './music.js';

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.ready = false;
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = 0.9;
      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -12; this.comp.ratio.value = 4;
      this.master.connect(this.comp).connect(c.destination);
      this.sfx = c.createGain(); this.sfx.connect(this.master);
      this.musicBus = c.createGain(); this.musicBus.connect(this.master);
      // shared noise buffer
      const len = c.sampleRate * 2;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // reverb impulse for hits / music
      this.reverb = c.createConvolver();
      this.reverb.buffer = this._impulse(1.8, 2.5);
      this.reverbGain = c.createGain(); this.reverbGain.gain.value = 0.25;
      this.reverb.connect(this.reverbGain).connect(this.master);
      this.music = new MusicPlayer(this);
      this.applyVolumes();
      settings.onChange((k) => { if (k === 'musicVolume' || k === 'sfxVolume') this.applyVolumes(); });
      this.ready = true;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfx.gain.setTargetAtTime(settings.get('sfxVolume'), t, 0.05);
    this.musicBus.gain.setTargetAtTime(settings.get('musicVolume') * 0.55, t, 0.05);
  }

  _impulse(dur, decay) {
    const c = this.ctx, len = Math.floor(c.sampleRate * dur);
    const b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  // ------------------------------------------------------------ building blocks
  _out(pan = 0, reverb = 0, bus = null) {
    const c = this.ctx;
    const g = c.createGain();
    const p = c.createStereoPanner ? c.createStereoPanner() : null;
    if (p) { p.pan.value = pan; g.connect(p).connect(bus || this.sfx); } else g.connect(bus || this.sfx);
    if (reverb > 0) { const r = c.createGain(); r.gain.value = reverb; g.connect(r).connect(this.reverb); }
    return g;
  }

  _noise(t, dur, { type = 'bandpass', freq = 1000, freqEnd = null, q = 1, gain = 0.5, attack = 0.002, pan = 0, reverb = 0, bus = null } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this._out(pan, reverb, bus));
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }

  _tone(t, dur, { type = 'sine', freq = 440, freqEnd = null, gain = 0.3, attack = 0.003, pan = 0, reverb = 0, bus = null, detune = 0, filter = null } = {}) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type; o.detune.value = detune;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) { const f = c.createBiquadFilter(); f.type = filter.type || 'lowpass'; f.frequency.value = filter.freq; f.Q.value = filter.q ?? 1; o.connect(f); node = f; }
    node.connect(g).connect(this._out(pan, reverb, bus));
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }
  get ok() { return this.ready && this.ctx.state === 'running'; }

  // ------------------------------------------------------------ effects
  footstep(side = 'LEFT') {
    if (!this.ok) return;
    const t = this.now, pan = side === 'LEFT' ? -0.15 : 0.15;
    this._tone(t, 0.12, { freq: 95, freqEnd: 45, gain: 0.35, pan });
    this._noise(t, 0.07, { type: 'lowpass', freq: 400, gain: 0.25, pan });
    this._noise(t + 0.005, 0.03, { type: 'highpass', freq: 5000, gain: 0.06, pan }); // metallic click
  }

  punch(side, strength01 = 0.5) {
    if (!this.ok) return;
    const t = this.now, pan = side === 'LEFT' ? -0.55 : 0.55;
    const base = side === 'LEFT' ? 700 : 850;
    this._noise(t, 0.16, { type: 'bandpass', freq: base, freqEnd: base * 3.2, q: 1.4, gain: 0.32 + strength01 * 0.2, pan, attack: 0.01 });
  }

  hit(strength01 = 0.5, pan = 0) {
    if (!this.ok) return;
    const t = this.now;
    this._tone(t, 0.22, { freq: 150, freqEnd: 42, gain: 0.7 + strength01 * 0.3, pan });
    this._noise(t, 0.09, { type: 'bandpass', freq: 2600, q: 0.8, gain: 0.5, pan, reverb: 0.3 });
    this._noise(t, 0.18, { type: 'lowpass', freq: 900, gain: 0.45, pan });
    this._tone(t + 0.005, 0.08, { type: 'square', freq: 1800, freqEnd: 900, gain: 0.05, pan }); // electronic zap
  }

  miss(side) {
    if (!this.ok) return;
    const t = this.now, pan = side === 'LEFT' ? -0.4 : 0.4;
    this._noise(t + 0.05, 0.25, { type: 'bandpass', freq: 2200, freqEnd: 700, q: 2, gain: 0.2, pan });
  }

  enemyWindup() {
    if (!this.ok) return;
    const t = this.now;
    this._tone(t, 0.35, { type: 'sawtooth', freq: 120, freqEnd: 340, gain: 0.08, filter: { freq: 900 } }); // servo whine
  }

  enemyAttack() {
    if (!this.ok) return;
    const t = this.now;
    this._noise(t, 0.22, { type: 'bandpass', freq: 400, freqEnd: 1400, q: 1.2, gain: 0.35 });
  }

  playerHurt() {
    if (!this.ok) return;
    const t = this.now;
    this._tone(t, 0.3, { freq: 110, freqEnd: 35, gain: 0.8 });
    this._noise(t, 0.25, { type: 'lowpass', freq: 600, gain: 0.5 });
    this._tone(t, 0.12, { type: 'square', freq: 220, freqEnd: 110, gain: 0.08 });
  }

  enemyHurt(voice = 1) {
    if (!this.ok) return;
    const t = this.now;
    const f = 520 * voice;
    this._tone(t + 0.03, 0.18, { type: 'square', freq: f * 1.3, freqEnd: f * 0.6, gain: 0.07, filter: { freq: 2400 } });
    this._tone(t + 0.03, 0.18, { type: 'sawtooth', freq: f * 0.65, freqEnd: f * 0.3, gain: 0.05, filter: { freq: 1600 } });
  }

  spark(intensity = 1) {
    if (!this.ok) return;
    const t = this.now;
    const n = Math.round(6 + intensity * 8);
    for (let i = 0; i < n; i++) {
      this._noise(t + Math.random() * 0.35 * intensity, 0.015 + Math.random() * 0.03, { type: 'highpass', freq: 2500 + Math.random() * 4000, gain: 0.15 + Math.random() * 0.15, pan: (Math.random() - 0.5) * 0.8 });
    }
    this._tone(t, 0.3, { type: 'sawtooth', freq: 60, gain: 0.05, filter: { freq: 400 } }); // mains hum
  }

  ko(boss = false) {
    if (!this.ok) return;
    const t = this.now;
    this._tone(t, boss ? 2.2 : 1.2, { type: 'sawtooth', freq: 700, freqEnd: 30, gain: 0.18, filter: { freq: 2000 }, reverb: 0.4 });
    this._tone(t, boss ? 2.2 : 1.2, { type: 'square', freq: 350, freqEnd: 20, gain: 0.06, filter: { freq: 1200 } });
    this._noise(t + (boss ? 1.4 : 0.6), boss ? 1.6 : 0.8, { type: 'lowpass', freq: 1800, freqEnd: 200, gain: 0.7, reverb: 0.6 });
    this._tone(t + (boss ? 1.4 : 0.6), 0.6, { freq: 80, freqEnd: 30, gain: 0.9 });
  }

  bell() {
    if (!this.ok) return;
    const t = this.now;
    for (const [f, g] of [[520, 0.3], [1306, 0.12], [2210, 0.07], [3100, 0.04]]) this._tone(t, 1.6, { freq: f, gain: g, reverb: 0.5 });
  }

  phaseRoar() {
    if (!this.ok) return;
    const t = this.now;
    this._tone(t, 1.4, { type: 'sawtooth', freq: 55, freqEnd: 220, gain: 0.25, filter: { freq: 1200, q: 6 }, reverb: 0.5 });
    this._tone(t, 1.4, { type: 'sawtooth', freq: 57, freqEnd: 226, gain: 0.2, filter: { freq: 900 } });
    this.spark(1.5);
  }

  fanfare() {
    if (!this.ok) return;
    const t = this.now;
    const notes = [[0, 523.25], [0.14, 659.25], [0.28, 783.99], [0.42, 1046.5]];
    for (const [dt, f] of notes) this._brass(t + dt, 0.3, f, 0.12);
    for (const f of [523.25, 659.25, 783.99, 1046.5]) this._brass(t + 0.62, 1.4, f, 0.08);
    this._tone(t + 0.62, 1.2, { freq: 65.4, gain: 0.4 });
  }

  _brass(t, dur, f, gain) {
    for (const det of [-8, 0, 8]) this._tone(t, dur, { type: 'sawtooth', freq: f, gain: gain / 2, detune: det, attack: 0.03, filter: { freq: f * 3, q: 1.5 }, reverb: 0.35 });
  }

  uiClick() {
    if (!this.ok) return;
    const t = this.now;
    this._tone(t, 0.06, { type: 'square', freq: 1400, freqEnd: 900, gain: 0.05 });
  }

  uiHover() {
    if (!this.ok) return;
    this._tone(this.now, 0.04, { type: 'sine', freq: 1800, gain: 0.03 });
  }

  countdownBeep(final = false) {
    if (!this.ok) return;
    this._tone(this.now, final ? 0.5 : 0.15, { type: 'square', freq: final ? 1320 : 880, gain: 0.08, filter: { freq: 3000 } });
  }

  crowdCheer() {
    if (!this.ok) return;
    const t = this.now;
    this._noise(t, 2.5, { type: 'bandpass', freq: 1200, q: 0.5, gain: 0.25, attack: 0.4, reverb: 0.5 });
  }

  playMusic(name) { this.music?.play(name); }
  stopMusic() { this.music?.stop(); }
}
