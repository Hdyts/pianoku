// audio.js — piano berbasis sampel grand piano asli (Salamander Grand Piano).
// Sampel direkam dari piano Yamaha C5 grand, dimuat dari CDN Tone.js.
// Fallback synthesizer sederhana dipakai selagi sampel belum selesai dimuat.
import { midiToFreq } from './music.js';

// URL basis untuk sampel Salamander Grand Piano (format MP3).
const SAMPLE_URL = 'https://tonejs.github.io/audio/salamander/';

// Daftar sampel yang tersedia: [nama_file, nomor_midi].
// Direkam setiap 3 seminada — nada di antaranya digeser pitch-nya.
const SAMPLES = [
  ['A0', 21],  ['C1', 24],  ['Ds1', 27], ['Fs1', 30],
  ['A1', 33],  ['C2', 36],  ['Ds2', 39], ['Fs2', 42],
  ['A2', 45],  ['C3', 48],  ['Ds3', 51], ['Fs3', 54],
  ['A3', 57],  ['C4', 60],  ['Ds4', 63], ['Fs4', 66],
  ['A4', 69],  ['C5', 72],  ['Ds5', 75], ['Fs5', 78],
  ['A5', 81],  ['C6', 84],  ['Ds6', 87], ['Fs6', 90],
  ['A6', 93],  ['C7', 96],  ['Ds7', 99], ['Fs7', 102],
  ['A7', 105], ['C8', 108],
];

export class PianoAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.voices = new Map(); // id -> voice
    this.sustain = false;
    this.sustained = new Set();
    this.volume = 0.8;
    this.buffers = new Map(); // sampleMidi -> AudioBuffer
    this.loaded = false;
    this.loading = false;
    this._loadPromise = null;
  }

  // AudioContext hanya boleh dibuat setelah ada interaksi pengguna.
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();

      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.ratio.value = 4;
      comp.knee.value = 10;

      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);

      // Mulai memuat sampel piano di latar belakang
      if (!this.loading && !this.loaded) {
        this._loadPromise = this._loadSamples();
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  // ---------------------------------------------------------------- memuat sampel

  // Memuat semua sampel grand piano dari CDN secara paralel.
  async _loadSamples() {
    this.loading = true;
    console.log('Memuat sampel grand piano…');

    // Muat sampel secara paralel, maks 6 koneksi sekaligus.
    const queue = [...SAMPLES];
    const workers = [];
    for (let i = 0; i < 6; i++) {
      workers.push((async () => {
        while (queue.length) {
          const [name, midi] = queue.shift();
          try {
            const res = await fetch(`${SAMPLE_URL}${name}.mp3`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const arrayBuf = await res.arrayBuffer();
            const audioBuf = await this.ctx.decodeAudioData(arrayBuf);
            this.buffers.set(midi, audioBuf);
          } catch (e) {
            console.warn(`Gagal memuat sampel ${name}:`, e);
          }
        }
      })());
    }
    await Promise.all(workers);
    this.loaded = true;
    this.loading = false;
    console.log(`Sampel piano dimuat: ${this.buffers.size}/${SAMPLES.length}`);
  }

  // Cari sampel terdekat untuk nada MIDI tertentu.
  _findClosestSample(midi) {
    let closest = null;
    let minDist = Infinity;
    for (const [, m] of SAMPLES) {
      if (!this.buffers.has(m)) continue;
      const d = Math.abs(midi - m);
      if (d < minDist) { closest = m; minDist = d; }
    }
    return closest;
  }

  // ---------------------------------------------------------------- memainkan nada

  // Mulai nada. `id` dipakai untuk melepas nada yang sama nanti.
  noteOn(midi, { id = midi, velocity = 0.8, when } = {}) {
    const ctx = this.ensure();
    const t = when ?? ctx.currentTime;
    if (this.voices.has(id)) this._kill(id, t, 0.03);
    this.sustained.delete(id);

    const vel = Math.min(1, Math.max(0.1, velocity));
    const sampleMidi = this._findClosestSample(midi);

    if (sampleMidi !== null) {
      return this._noteOnSample(midi, sampleMidi, { id, vel, t });
    } else {
      return this._noteOnFallback(midi, { id, vel, t });
    }
  }

  // Mainkan nada menggunakan sampel grand piano asli.
  _noteOnSample(midi, sampleMidi, { id, vel, t }) {
    const ctx = this.ctx;
    const buffer = this.buffers.get(sampleMidi);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    // Geser pitch dari sampel ke nada target.
    // Setiap 12 seminada = 2× frekuensi.
    src.playbackRate.value = Math.pow(2, (midi - sampleMidi) / 12);

    const gain = ctx.createGain();
    // Kurva velocity kuadratik — respons lebih alami seperti palu piano.
    gain.gain.value = vel * vel * 0.85;

    src.connect(gain);
    gain.connect(this.master);
    src.start(t);

    this.voices.set(id, { gain, src, midi, type: 'sample' });
    return id;
  }

  // Synthesizer sederhana — hanya dipakai selagi sampel belum dimuat.
  _noteOnFallback(midi, { id, vel, t }) {
    const ctx = this.ctx;
    const f = midiToFreq(midi);
    const out = ctx.createGain();
    out.connect(this.master);

    const decay = Math.max(0.8, 5.0 - (midi - 36) * 0.05);
    const oscs = [];
    const partials = [[1, 1.0], [2, 0.5], [3, 0.25], [4, 0.12]];
    for (const [mult, amp] of partials) {
      if (f * mult > 14000) continue;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(amp * vel * 0.3, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay * (1 / mult));
      o.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + decay + 0.1);
      oscs.push(o);
    }

    this.voices.set(id, { gain: out, oscs, midi, type: 'synth' });
    return id;
  }

  // ---------------------------------------------------------------- melepas nada

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

    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(v.gain.gain.value, t);
    v.gain.gain.exponentialRampToValueAtTime(0.0001, t + rel);

    const cleanupDelay = (rel + 0.3) * 1000 + Math.max(0, (t - this.ctx.currentTime) * 1000);
    setTimeout(() => {
      try {
        if (v.type === 'sample') v.src.stop();
        v.gain.disconnect();
      } catch (e) { /* abaikan */ }
    }, cleanupDelay);
  }

  // ---------------------------------------------------------------- sustain pedal

  setSustain(on) {
    this.sustain = on;
    if (!on) {
      for (const id of [...this.sustained]) this._kill(id, this.ctx.currentTime, 0.4);
    }
  }

  // ---------------------------------------------------------------- mode dengarkan

  // Memutar satu nada terjadwal (dipakai mode "dengarkan").
  playScheduled(midi, startTime, dur, velocity = 0.7) {
    const ctx = this.ensure();
    const id = 'sch-' + Math.random().toString(36).slice(2);
    this.noteOn(midi, { id, velocity, when: startTime });
    const off = startTime + Math.max(0.08, dur * 0.95);
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
