// practice.js — mesin latihan (tanpa DOM): memeriksa tuts yang ditekan terhadap not yang diharapkan.
//
// status per langkah: 'pending' | 'ok' (benar sejak percobaan pertama) | 'bad' (pernah salah -> merah)
//   mode 'wait'     : langkah baru maju setelah nada benar ditekan (nada salah menandai merah)
//   mode 'continue' : tiap tuts yang salah langsung menandai merah dan lanjut ke langkah berikut

export class Practice {
  constructor(steps, { mode = 'wait' } = {}) {
    this.steps = steps;
    this.mode = mode;
    this.reset();
  }

  reset() {
    this.index = 0;
    this.status = this.steps.map(() => 'pending');
    this.pressed = new Set();
    this.mistakes = 0;
    this.keystrokes = 0;
    this.startedAt = null;
  }

  setMode(mode) { this.mode = mode; }

  get finished() { return this.index >= this.steps.length; }
  get current() { return this.steps[this.index] || null; }

  // Not yang masih harus ditekan pada langkah ini.
  get remaining() {
    const s = this.current;
    return s ? s.midis.filter((m) => !this.pressed.has(m)) : [];
  }

  // Tekan tuts. Hasil: { result, index, finished }
  //   result: 'good' (benar, langkah belum selesai) | 'step' (langkah selesai) | 'bad' | 'ignored'
  press(midi) {
    if (this.finished) return { result: 'ignored', index: this.index, finished: true };
    if (this.startedAt === null) this.startedAt = Date.now();
    const step = this.current;
    const idx = this.index;
    this.keystrokes++;

    if (step.midis.includes(midi)) {
      if (this.pressed.has(midi)) return { result: 'ignored', index: idx, finished: false };
      this.pressed.add(midi);
      if (this.pressed.size < step.midis.length) return { result: 'good', index: idx, finished: false };
      if (this.status[idx] !== 'bad') this.status[idx] = 'ok';
      this._advance();
      return { result: 'step', index: idx, finished: this.finished };
    }

    // nada salah
    this.mistakes++;
    this.status[idx] = 'bad';
    if (this.mode === 'continue') {
      this._advance();
      return { result: 'bad', index: idx, finished: this.finished, advanced: true };
    }
    return { result: 'bad', index: idx, finished: false, advanced: false };
  }

  _advance() {
    this.index++;
    this.pressed = new Set();
  }

  seek(i) {
    this.index = Math.max(0, Math.min(i, this.steps.length));
    this.pressed = new Set();
  }

  get stats() {
    const total = this.steps.length;
    const ok = this.status.filter((s) => s === 'ok').length;
    const bad = this.status.filter((s) => s === 'bad').length;
    return {
      total,
      done: Math.min(total, this.index),
      ok,
      bad,
      mistakes: this.mistakes,
      accuracy: total ? Math.round((ok / total) * 100) : 0,
      seconds: this.startedAt ? Math.round((Date.now() - this.startedAt) / 1000) : 0,
    };
  }
}
