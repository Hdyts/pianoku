// audio.js — synthesizer piano sederhana berbasis Web Audio (tanpa file sampel).
import { midiToFreq } from './music.js';

export class PianoAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.voices = new Map(); // id -> voice
    this.sustain = false;
    this.sustained = new Set();
    this.volume = 0.8;
  }

  // AudioContext hanya boleh dibuat setelah ada interaksi pengguna.
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.ratio.value = 4;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume * 0.55;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      this.noiseBuf = this._makeNoise();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v * 0.55;
  }

  _makeNoise() {
    const len = Math.floor(this.ctx.sampleRate * 0.05);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    return buf;
  }

  // Mulai nada. `id` dipakai untuk melepas nada yang sama nanti.
  noteOn(midi, { id = midi, velocity = 0.8, when } = {}) {
    const ctx = this.ensure();
    const t = when ?? ctx.currentTime;
    if (this.voices.has(id)) this._kill(id, t, 0.03);
    this.sustained.delete(id);

    const f = midiToFreq(midi);
    const out = ctx.createGain();
    out.connect(this.master);

    // Nada rendah bertahan lebih lama, nada tinggi cepat meluruh.
    const decay = Math.max(0.6, 4.2 - (midi - 36) * 0.045);
    const vel = Math.min(1, Math.max(0.1, velocity));
    const partials = [
      [1, 1.0, 1.0],
      [2, 0.55, 0.75],
      [3, 0.32, 0.55],
      [4, 0.2, 0.4],
      [5, 0.12, 0.3],
      [6, 0.07, 0.22],
    ];
    const oscs = [];
    for (const [mult, amp, dm] of partials) {
      if (f * mult > 12000) continue;
      const o = ctx.createOscillator();
      o.type = 'sine';
      // sedikit detune pada partial atas -> karakter dawai
      o.frequency.value = f * mult * (1 + (mult > 1 ? 0.0004 * mult * mult : 0));
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(amp * vel * 0.5, t + 0.004);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp * vel * 0.5 * 0.35), t + 0.18 * dm);
      g.gain.exponentialRampToValueAtTime(0.0002, t + decay * dm);
      o.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + decay * dm + 0.1);
      oscs.push(o);
    }
    // bunyi "tok" palu
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuf;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = Math.min(6000, f * 3);
    const ng = ctx.createGain();
    ng.gain.value = 0.25 * vel;
    n.connect(nf); nf.connect(ng); ng.connect(out);
    n.start(t);

    this.voices.set(id, { out, oscs, midi });
    return id;
  }

  noteOff(id, when) {
    const ctx = this.ctx;
    if (!ctx || !this.voices.has(id)) return;
    if (this.sustain) { this.sustained.add(id); return; }
    this._kill(id, when ?? ctx.currentTime, 0.25);
  }

  _kill(id, t, rel) {
    const v = this.voices.get(id);
    if (!v) return;
    this.voices.delete(id);
    this.sustained.delete(id);
    v.out.gain.cancelScheduledValues(t);
    v.out.gain.setValueAtTime(v.out.gain.value, t);
    v.out.gain.exponentialRampToValueAtTime(0.0001, t + rel);
    setTimeout(() => { try { v.out.disconnect(); } catch (e) {} }, (rel + 0.2) * 1000 + Math.max(0, (t - this.ctx.currentTime) * 1000));
  }

  setSustain(on) {
    this.sustain = on;
    if (!on) {
      for (const id of [...this.sustained]) this._kill(id, this.ctx.currentTime, 0.3);
    }
  }

  // Memutar satu nada terjadwal (dipakai mode "dengarkan").
  playScheduled(midi, startTime, dur, velocity = 0.7) {
    const ctx = this.ensure();
    const id = 'sch-' + Math.random().toString(36).slice(2);
    this.noteOn(midi, { id, velocity, when: startTime });
    const off = startTime + Math.max(0.08, dur * 0.95);
    const saved = this.sustain;
    // lepas tanpa memedulikan pedal sustain
    const delay = Math.max(0, (off - ctx.currentTime) * 1000);
    setTimeout(() => {
      this.sustained.delete(id);
      this._kill(id, this.ctx.currentTime, 0.25);
    }, delay);
    return id;
  }

  stopAll() {
    if (!this.ctx) return;
    for (const id of [...this.voices.keys()]) this._kill(id, this.ctx.currentTime, 0.1);
  }
}
