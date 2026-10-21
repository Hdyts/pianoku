// demo.js — mode "Dengarkan": memutar sheet dari langkah tertentu dengan penjadwalan lookahead.

export class DemoPlayer {
  // audio: PianoAudio; callbacks: onStep(step), onNoteOn(midi), onNoteOff(midi), onEnd()
  constructor(audio, { onStep, onNoteOn, onNoteOff, onEnd } = {}) {
    this.audio = audio;
    this.onStep = onStep || (() => {});
    this.onNoteOn = onNoteOn || (() => {});
    this.onNoteOff = onNoteOff || (() => {});
    this.onEnd = onEnd || (() => {});
    this.timer = null;
    this.timeouts = new Set();
    this.playing = false;
  }

  // steps: score.steps, tempo: ketukan per menit (sudah dikali kecepatan)
  play(steps, { tempo = 80, from = 0 } = {}) {
    this.stop(false);
    if (!steps.length || from >= steps.length) return;
    const ctx = this.audio.ensure();
    const spb = 60 / tempo;
    const t0 = ctx.currentTime + 0.12;
    const beat0 = steps[from].start;
    let next = from;
    this.playing = true;

    const at = (beat) => t0 + (beat - beat0) * spb;
    const later = (fn, whenSec) => {
      const ms = Math.max(0, (whenSec - ctx.currentTime) * 1000);
      const id = setTimeout(() => { this.timeouts.delete(id); fn(); }, ms);
      this.timeouts.add(id);
    };

    const pump = () => {
      const horizon = ctx.currentTime + 0.35;
      while (next < steps.length && at(steps[next].start) < horizon) {
        const s = steps[next];
        const when = at(s.start);
        const idx = next;
        for (const n of s.notes) {
          const dur = Math.max(0.12, n.dur * spb);
          this.audio.playScheduled(n.midi, when, dur, 0.72);
          later(() => this.onNoteOn(n.midi), when);
          later(() => this.onNoteOff(n.midi), when + dur * 0.95);
        }
        later(() => this.onStep(s, idx), when);
        next++;
      }
      if (next >= steps.length) {
        clearInterval(this.timer);
        this.timer = null;
        const last = steps[steps.length - 1];
        const end = at(last.start + Math.max(...last.notes.map((n) => n.dur))) + 0.3;
        later(() => { this.playing = false; this.onEnd(); }, end);
      }
    };
    pump();
    if (next < steps.length) this.timer = setInterval(pump, 60);
  }

  stop(notify = true) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const id of this.timeouts) clearTimeout(id);
    this.timeouts.clear();
    const was = this.playing;
    this.playing = false;
    this.audio.stopAll();
    if (was && notify) this.onEnd();
  }
}
