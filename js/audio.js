// audio.js — synthesizer grand piano berbasis Web Audio (tanpa file sampel).
// Model suara: stretched partials (inharmonicity), 12 harmonik, hammer tone,
// body resonance, dan decay realistis ala grand piano akustik.
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

      // --- Master chain: body resonance → compressor → destination ---
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.ratio.value = 4;
      comp.knee.value = 10;

      // Simulasi resonansi badan piano (formant kayu)
      this.bodyEQ = this.ctx.createBiquadFilter();
      this.bodyEQ.type = 'peaking';
      this.bodyEQ.frequency.value = 260;
      this.bodyEQ.Q.value = 1.2;
      this.bodyEQ.gain.value = 3;

      // Low-shelf untuk kehangatan bass grand piano
      this.warmth = this.ctx.createBiquadFilter();
      this.warmth.type = 'lowshelf';
      this.warmth.frequency.value = 300;
      this.warmth.gain.value = 2.5;

      // High-shelf rolloff halus — grand piano tidak terlalu tajam di atas
      this.rolloff = this.ctx.createBiquadFilter();
      this.rolloff.type = 'highshelf';
      this.rolloff.frequency.value = 4500;
      this.rolloff.gain.value = -3;

      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume * 0.45;

      this.master.connect(this.warmth);
      this.warmth.connect(this.bodyEQ);
      this.bodyEQ.connect(this.rolloff);
      this.rolloff.connect(comp);
      comp.connect(this.ctx.destination);

      this.noiseBuf = this._makeNoise();
      this.hammerBuf = this._makeHammerNoise();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v * 0.45;
  }

  // Noise burst pendek untuk komponen "tok" senar
  _makeNoise() {
    const len = Math.floor(this.ctx.sampleRate * 0.06);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = Math.exp(-i / (len * 0.15));
      d[i] = (Math.random() * 2 - 1) * env;
    }
    return buf;
  }

  // Noise yang lebih panjang dan terbentuk untuk simulasi suara hammer felt
  _makeHammerNoise() {
    const len = Math.floor(this.ctx.sampleRate * 0.12);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / this.ctx.sampleRate;
      // Envelope dua tahap: attack cepat, decay eksponensial
      const env = Math.min(1, i / (len * 0.02)) * Math.exp(-t * 35);
      d[i] = (Math.random() * 2 - 1) * env;
    }
    return buf;
  }

  // Inharmonicity: pada piano asli, partial ke-n sedikit lebih tinggi
  // karena kekakuan dawai. B = koefisien inharmonicity.
  _stretchedPartial(f0, n, B) {
    return f0 * n * Math.sqrt(1 + B * n * n);
  }

  // Mulai nada grand piano. `id` dipakai untuk melepas nada yang sama nanti.
  noteOn(midi, { id = midi, velocity = 0.8, when } = {}) {
    const ctx = this.ensure();
    const t = when ?? ctx.currentTime;
    if (this.voices.has(id)) this._kill(id, t, 0.03);
    this.sustained.delete(id);

    const f = midiToFreq(midi);
    const out = ctx.createGain();
    out.connect(this.master);

    const vel = Math.min(1, Math.max(0.1, velocity));

    // --- Koefisien inharmonicity: dawai bass lebih inharmonis ---
    const B = midi < 40 ? 0.0004 : midi < 60 ? 0.00015 : 0.00005;

    // --- Decay: nada rendah bertahan sangat lama (grand piano 9 kaki) ---
    const baseDecay = midi < 40 ? 12 : midi < 55 ? 8 : midi < 70 ? 5.5 : midi < 85 ? 3.5 : 2.0;
    const decay = baseDecay * (0.7 + vel * 0.3);

    // --- Brightness tergantung velocity (palu keras = lebih banyak harmonik tinggi) ---
    const brightness = 0.3 + vel * 0.7;

    // --- 12 partial harmonik dengan inharmonicity dan amplitudo realistis ---
    const oscs = [];
    const numPartials = midi > 80 ? 6 : midi > 60 ? 9 : 12;
    for (let n = 1; n <= numPartials; n++) {
      const pf = this._stretchedPartial(f, n, B);
      if (pf > 16000) continue;

      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = pf;

      // Amplitudo: fundamental kuat, harmonik meluruh secara bertahap
      // Grand piano: partial ke-2 dan 3 relatif kuat
      let amp;
      if (n === 1) amp = 1.0;
      else if (n === 2) amp = 0.65;
      else if (n === 3) amp = 0.45;
      else if (n === 4) amp = 0.28;
      else if (n === 5) amp = 0.18;
      else amp = 0.15 / (n - 4);
      amp *= brightness;

      // Partial yang lebih tinggi meluruh lebih cepat
      const partialDecay = decay * Math.pow(0.82, n - 1);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      // Attack sangat cepat (karakteristik palu piano)
      g.gain.linearRampToValueAtTime(amp * vel * 0.35, t + 0.003);
      // Transisi cepat ke sustain level
      g.gain.exponentialRampToValueAtTime(
        Math.max(0.0002, amp * vel * 0.35 * 0.4), t + 0.12
      );
      // Decay panjang eksponensial
      g.gain.exponentialRampToValueAtTime(0.0001, t + partialDecay);

      o.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + partialDecay + 0.2);
      oscs.push(o);
    }

    // --- Hammer tone: suara palu memukul dawai ---
    const hammer = ctx.createBufferSource();
    hammer.buffer = this.hammerBuf;
    // Filter: nada tinggi → hammer lebih cerah; nada rendah → lebih tumpul
    const hf = ctx.createBiquadFilter();
    hf.type = 'bandpass';
    hf.frequency.value = Math.min(8000, Math.max(800, f * 4));
    hf.Q.value = 0.8;
    const hg = ctx.createGain();
    hg.gain.value = 0.18 * vel * brightness;
    hammer.connect(hf);
    hf.connect(hg);
    hg.connect(out);
    hammer.start(t);

    // --- String noise: bunyi halus gesekan senar saat dipukul ---
    const sn = ctx.createBufferSource();
    sn.buffer = this.noiseBuf;
    const snf = ctx.createBiquadFilter();
    snf.type = 'highpass';
    snf.frequency.value = Math.min(5000, f * 2);
    const sng = ctx.createGain();
    sng.gain.value = 0.06 * vel;
    sn.connect(snf);
    snf.connect(sng);
    sng.connect(out);
    sn.start(t);

    this.voices.set(id, { out, oscs, midi });
    return id;
  }

  noteOff(id, when) {
    const ctx = this.ctx;
    if (!ctx || !this.voices.has(id)) return;
    if (this.sustain) { this.sustained.add(id); return; }
    this._kill(id, when ?? ctx.currentTime, 0.35);
  }

  _kill(id, t, rel) {
    const v = this.voices.get(id);
    if (!v) return;
    this.voices.delete(id);
    this.sustained.delete(id);
    v.out.gain.cancelScheduledValues(t);
    v.out.gain.setValueAtTime(v.out.gain.value, t);
    // Release lebih lembut untuk grand piano (damper tidak instan)
    v.out.gain.exponentialRampToValueAtTime(0.0001, t + rel);
    setTimeout(() => { try { v.out.disconnect(); } catch (e) {} }, (rel + 0.3) * 1000 + Math.max(0, (t - this.ctx.currentTime) * 1000));
  }

  setSustain(on) {
    this.sustain = on;
    if (!on) {
      for (const id of [...this.sustained]) this._kill(id, this.ctx.currentTime, 0.4);
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
      this._kill(id, this.ctx.currentTime, 0.35);
    }, delay);
    return id;
  }

  stopAll() {
    if (!this.ctx) return;
    for (const id of [...this.voices.keys()]) this._kill(id, this.ctx.currentTime, 0.1);
  }
}
