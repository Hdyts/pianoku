// keyboard.js — tuts piano virtual (DOM) 3 oktaf, label mengikuti pemetaan keyboard laptop.
import { isBlack, midiToKeyLabel, baseMidiFor, SOLFEGE, SHARP_NAMES } from './music.js';

const SPAN = 36; // 3 oktaf: Do..Si x3

export class VirtualKeyboard {
  constructor(root, { onDown, onUp } = {}) {
    this.root = root;
    this.onDown = onDown || (() => {});
    this.onUp = onUp || (() => {});
    this.shift = 0;
    this.keys = new Map(); // midi -> element
    this.pointerNotes = new Map(); // pointerId -> midi
    this.render();
  }

  get baseMidi() { return baseMidiFor(this.shift); }
  get range() { return [this.baseMidi, this.baseMidi + SPAN - 1]; }

  setOctave(shift) {
    this.shift = shift;
    this.render();
  }

  render() {
    const root = this.root;
    root.innerHTML = '';
    this.keys.clear();
    const wrap = document.createElement('div');
    wrap.className = 'kb';
    const whites = [];
    for (let o = 0; o < SPAN; o++) if (!isBlack(this.baseMidi + o)) whites.push(o);
    const wCount = whites.length; // 21
    wrap.style.setProperty('--wcount', wCount);

    let wi = 0;
    for (let o = 0; o < SPAN; o++) {
      const midi = this.baseMidi + o;
      const black = isBlack(midi);
      const el = document.createElement('div');
      el.className = 'key ' + (black ? 'black' : 'white');
      el.dataset.midi = midi;
      const label = midiToKeyLabel(midi, this.shift);
      const pc = ((midi % 12) + 12) % 12;
      const oct = Math.floor(midi / 12) - 1;
      if (black) {
        el.style.left = `calc(${(wi / wCount) * 100}% - var(--bw) / 2)`;
      } else {
        el.style.gridColumn = String(wi + 1);
        wi++;
      }
      el.innerHTML =
        `<span class="kcap">${label ? label.toUpperCase() : ''}</span>` +
        (black ? '' : `<span class="kname">${pc === 0 ? 'C' + oct : SHARP_NAMES[pc]}</span><span class="ksol">${SOLFEGE[SHARP_NAMES[pc]]}</span>`);
      if (!label) el.classList.add('nokey');
      el.setAttribute('aria-label', SHARP_NAMES[pc] + oct);
      this.keys.set(midi, el);
      (black ? wrap : wrap).appendChild(el);
    }
    root.appendChild(wrap);
    this._bindPointer(wrap);
    this.wrap = wrap;
  }

  _midiFromEvent(e) {
    const el = e.target.closest ? e.target.closest('.key') : null;
    return el ? Number(el.dataset.midi) : null;
  }

  _bindPointer(wrap) {
    wrap.addEventListener('pointerdown', (e) => {
      const m = this._midiFromEvent(e);
      if (m === null) return;
      e.preventDefault();
      wrap.setPointerCapture?.(e.pointerId);
      this.pointerNotes.set(e.pointerId, m);
      this.onDown(m, 'pointer');
    });
    wrap.addEventListener('pointermove', (e) => {
      if (!this.pointerNotes.has(e.pointerId)) return;
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const el = under && under.closest ? under.closest('.key') : null;
      if (!el) return;
      const m = Number(el.dataset.midi);
      const prev = this.pointerNotes.get(e.pointerId);
      if (m !== prev) {
        this.onUp(prev, 'pointer');
        this.pointerNotes.set(e.pointerId, m);
        this.onDown(m, 'pointer');
      }
    });
    const end = (e) => {
      const m = this.pointerNotes.get(e.pointerId);
      if (m === undefined) return;
      this.pointerNotes.delete(e.pointerId);
      this.onUp(m, 'pointer');
    };
    wrap.addEventListener('pointerup', end);
    wrap.addEventListener('pointercancel', end);
  }

  setPressed(midi, on) {
    const el = this.keys.get(midi);
    if (el) el.classList.toggle('down', on);
  }

  // Kilatan hijau/merah singkat pada tuts.
  flash(midi, kind) {
    const el = this.keys.get(midi);
    if (!el) return;
    const cls = kind === 'bad' ? 'flash-bad' : 'flash-good';
    el.classList.remove('flash-bad', 'flash-good');
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 450);
  }

  // Petunjuk: sorot tuts yang harus ditekan berikutnya.
  setHints(midis) {
    for (const el of this.keys.values()) el.classList.remove('hint');
    for (const m of midis) this.keys.get(m)?.classList.add('hint');
  }
}
