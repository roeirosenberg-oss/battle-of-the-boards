// Procedural music: a small step sequencer with synthesised instruments.
// Tracks: menu, explore, fight, boss, throne. Cross-fades between them.

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
// chord roots (MIDI) + quality
const CH = {
  Am: [57, 60, 64], F: [53, 57, 60], C: [48, 52, 55], G: [55, 59, 62], Dm: [50, 53, 57], Bb: [46, 50, 53],
  A: [57, 61, 64], Em: [52, 55, 59], Fm: [53, 56, 60], D: [50, 54, 57], E: [52, 56, 59], Cmaj: [60, 64, 67], Gb: [55, 59, 62],
};

const TRACKS = {
  menu: { bpm: 96, chords: ['Am', 'F', 'C', 'G'], parts: ['pad', 'arp8', 'hatOff'], gain: 0.8 },
  explore: { bpm: 112, chords: ['Am', 'F', 'C', 'G'], parts: ['pad', 'arp16', 'bass8', 'kick2', 'hat8'], gain: 0.75 },
  fight: { bpm: 140, chords: ['Dm', 'Bb', 'C', 'A'], parts: ['bass16', 'kick4', 'snare', 'hat16', 'stab', 'lead'],
    melody: [74, -1, 72, 74, -1, 77, -1, 76, 74, -1, 72, -1, 69, -1, -1, -1], gain: 0.7 },
  boss: { bpm: 158, chords: ['Em', 'F', 'Em', 'D'], parts: ['bossBass', 'kickBoss', 'snare', 'hat16', 'arp16', 'lead', 'pad'],
    melody: [76, 77, 76, -1, 71, -1, 72, 71, 69, -1, 71, -1, 64, -1, 67, -1], gain: 0.7 },
  throne: { bpm: 84, chords: ['C', 'G', 'Am', 'F'], parts: ['padBig', 'choir', 'timpani', 'bells', 'brassLead', 'bass8soft'],
    melody: [72, -1, -1, 76, 79, -1, -1, -1, 77, -1, 76, -1, 74, -1, -1, -1], gain: 0.85 },
};

export class MusicPlayer {
  constructor(audio) {
    this.a = audio;
    this.ctx = audio.ctx;
    this.current = null;
    this._timer = null;
  }

  play(name) {
    if (!TRACKS[name]) return;
    if (this.current?.name === name) return;
    const c = this.ctx;
    const now = c.currentTime;
    // fade out the old track
    if (this.current) {
      const old = this.current;
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0.0001, now + 1.2);
      old.stopped = true;
      setTimeout(() => old.gain.disconnect(), 1600);
    }
    const tr = TRACKS[name];
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(tr.gain, now + 1.0);
    gain.connect(this.a.musicBus);
    const rv = c.createGain(); rv.gain.value = 0.35; gain.connect(rv).connect(this.a.reverb);
    this.current = { name, tr, gain, step: 0, nextTime: now + 0.1, stopped: false };
    if (!this._timer) this._timer = setInterval(() => this._schedule(), 25);
  }

  stop() {
    if (!this.current) return;
    const now = this.ctx.currentTime;
    const old = this.current;
    old.gain.gain.setValueAtTime(old.gain.gain.value, now);
    old.gain.gain.linearRampToValueAtTime(0.0001, now + 0.8);
    old.stopped = true;
    this.current = null;
  }

  _schedule() {
    const cur = this.current;
    if (!cur || cur.stopped) return;
    const c = this.ctx;
    if (c.state !== 'running') return;
    const spb = 60 / cur.tr.bpm / 4; // seconds per 16th
    if (cur.nextTime < c.currentTime - 0.2) cur.nextTime = c.currentTime + 0.05; // tab was hidden
    while (cur.nextTime < c.currentTime + 0.15) {
      this._step(cur, cur.step, cur.nextTime, spb);
      cur.step++;
      cur.nextTime += spb;
    }
  }

  _step(cur, step, t, spb) {
    const tr = cur.tr;
    const s = step % 16;
    const bar = Math.floor(step / 16);
    const chord = CH[tr.chords[bar % tr.chords.length]];
    const out = cur.gain;
    const P = new Set(tr.parts);
    const A = this.a;
    const tone = (o) => A._tone(t, o.dur ?? spb, { ...o, bus: out });
    const noise = (o) => A._noise(t, o.dur ?? spb, { ...o, bus: out });

    if (P.has('pad') && s === 0) for (const n of chord) for (const det of [-7, 7]) tone({ type: 'sawtooth', freq: mtof(n), dur: spb * 16, gain: 0.025, attack: 0.5, detune: det, filter: { freq: 1100 } });
    if (P.has('padBig') && s === 0) for (const n of [...chord, chord[0] + 12]) for (const det of [-10, 0, 10]) tone({ type: 'sawtooth', freq: mtof(n), dur: spb * 16, gain: 0.022, attack: 0.8, detune: det, filter: { freq: 1600 } });
    if (P.has('choir') && s === 0) for (const n of chord) {
      tone({ type: 'sawtooth', freq: mtof(n + 12), dur: spb * 15, gain: 0.03, attack: 0.9, filter: { type: 'bandpass', freq: 850, q: 4 } });
      tone({ type: 'sawtooth', freq: mtof(n + 12), dur: spb * 15, gain: 0.02, attack: 0.9, detune: 6, filter: { type: 'bandpass', freq: 1200, q: 5 } });
    }
    if (P.has('arp8') && s % 2 === 0) { const n = chord[(s / 2) % 3] + 12 + (s >= 8 ? 12 : 0); tone({ type: 'triangle', freq: mtof(n), dur: spb * 1.6, gain: 0.06, filter: { freq: 2600 } }); }
    if (P.has('arp16')) { const n = chord[s % 3] + 12 + ((s >> 2) % 2 ? 12 : 0); tone({ type: 'square', freq: mtof(n), dur: spb * 0.9, gain: 0.025, filter: { freq: 2200 } }); }
    if (P.has('bass8') && s % 2 === 0) { tone({ type: 'sawtooth', freq: mtof(chord[0] - 12), dur: spb * 1.7, gain: 0.09, filter: { freq: 500 } }); }
    if (P.has('bass8soft') && s % 4 === 0) { tone({ type: 'sine', freq: mtof(chord[0] - 12), dur: spb * 3.6, gain: 0.18 }); }
    if (P.has('bass16')) { const oct = s % 2 ? 0 : -12; tone({ type: 'sawtooth', freq: mtof(chord[0] + oct - 12), dur: spb * 0.9, gain: 0.08, filter: { freq: 700, q: 3 } }); }
    if (P.has('bossBass')) { const oct = [0, 0, 12, 0, 0, 1, 0, 12][s % 8]; tone({ type: 'sawtooth', freq: mtof(chord[0] - 24 + oct), dur: spb * 0.9, gain: 0.1, filter: { freq: 900, q: 6 } }); tone({ type: 'square', freq: mtof(chord[0] - 24 + oct), dur: spb * 0.9, gain: 0.04, filter: { freq: 500 } }); }
    if (P.has('kick2') && (s === 0 || s === 8)) tone({ freq: 140, freqEnd: 40, dur: 0.25, gain: 0.6 });
    if (P.has('kick4') && s % 4 === 0) tone({ freq: 150, freqEnd: 40, dur: 0.22, gain: 0.7 });
    if (P.has('kickBoss') && [0, 3, 6, 8, 11, 14].includes(s)) tone({ freq: 160, freqEnd: 38, dur: 0.2, gain: 0.7 });
    if (P.has('snare') && (s === 4 || s === 12)) { noise({ type: 'bandpass', freq: 1900, q: 0.7, dur: 0.16, gain: 0.35 }); tone({ type: 'triangle', freq: 210, freqEnd: 150, dur: 0.1, gain: 0.15 }); }
    if (P.has('hat8') && s % 2 === 0) noise({ type: 'highpass', freq: 8000, dur: 0.035, gain: s % 4 === 2 ? 0.08 : 0.04 });
    if (P.has('hatOff') && s % 4 === 2) noise({ type: 'highpass', freq: 9000, dur: 0.05, gain: 0.04 });
    if (P.has('hat16')) noise({ type: 'highpass', freq: 8500, dur: 0.03, gain: s % 2 ? 0.035 : 0.06 });
    if (P.has('stab') && [0, 3, 6, 10].includes(s)) for (const n of chord) tone({ type: 'sawtooth', freq: mtof(n + 12), dur: spb * 0.8, gain: 0.03, filter: { freq: 2500 } });
    if (P.has('timpani') && (s === 0 || (s === 12 && bar % 2 === 1))) { tone({ freq: mtof(chord[0] - 12), freqEnd: mtof(chord[0] - 13), dur: 0.9, gain: 0.45 }); noise({ type: 'lowpass', freq: 300, dur: 0.4, gain: 0.25 }); }
    if (P.has('bells') && s % 4 === 0) { const n = chord[(s / 4) % 3] + 24; tone({ freq: mtof(n), dur: 1.2, gain: 0.05 }); tone({ freq: mtof(n) * 2.76, dur: 0.6, gain: 0.015 }); }
    if ((P.has('lead') || P.has('brassLead')) && tr.melody) {
      const n = tr.melody[s];
      if (n > 0) {
        const transpose = (bar % 4 === 2 && !P.has('brassLead')) ? -2 : 0;
        if (P.has('brassLead')) for (const det of [-6, 6]) tone({ type: 'sawtooth', freq: mtof(n + transpose), dur: spb * 3, gain: 0.04, attack: 0.04, detune: det, filter: { freq: 2400, q: 1.5 } });
        else tone({ type: 'square', freq: mtof(n + transpose), dur: spb * 1.8, gain: 0.035, filter: { freq: 3000 } });
      }
    }
  }
}
