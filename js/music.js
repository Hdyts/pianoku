// music.js — teori musik dasar + pemetaan keyboard laptop -> tuts piano.
// Modul murni (tanpa DOM) supaya mudah diuji di Node.

export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export const LETTER_SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const SOLFEGE = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };

export const isBlack = (midi) => [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);

// "F#4" / "Bb3" / "C5" -> { letter, acc, octave, midi, step }
export function parseNote(name) {
  const m = /^([A-Ga-g])([#b]{0,2})(-?\d)$/.exec(String(name).trim());
  if (!m) throw new Error('Nama not tidak valid: ' + name);
  const letter = m[1].toUpperCase();
  const accStr = m[2];
  const octave = parseInt(m[3], 10);
  const accVal = accStr === '' ? 0 : accStr === '#' ? 1 : accStr === '##' ? 2 : accStr === 'b' ? -1 : -2;
  const midi = 12 * (octave + 1) + LETTER_SEMITONE[letter] + accVal;
  return { letter, acc: accStr, accVal, octave, midi, step: octave * 7 + LETTERS.indexOf(letter) };
}

export function midiToName(midi) {
  return SHARP_NAMES[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

export const midiToFreq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// Mengeja nada MIDI menjadi (huruf, aksidental, oktaf) mengikuti tanda mula.
// keyFifths: -7..+7 (positif = kres, negatif = mol).
const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];

export function keySignatureAccidentals(fifths) {
  const map = {};
  if (fifths > 0) SHARP_ORDER.slice(0, fifths).forEach((l) => (map[l] = 1));
  if (fifths < 0) FLAT_ORDER.slice(0, -fifths).forEach((l) => (map[l] = -1));
  return map;
}

export function spellMidi(midi, fifths = 0) {
  const sig = keySignatureAccidentals(fifths);
  const tryLetter = (L, accVal) => {
    const rest = midi - LETTER_SEMITONE[L] - accVal;
    if (((rest % 12) + 12) % 12 !== 0) return null;
    return makeSpelled(L, accVal, rest / 12 - 1);
  };
  // 1) nada yang jatuh pada huruf alami / sesuai tanda mula
  for (const L of LETTERS) {
    const r = tryLetter(L, sig[L] || 0);
    if (r) return r;
  }
  // 2) nada kromatik: kres (atau mol bila tanda mula bermol)
  for (const L of fifths < 0 ? [...LETTERS].reverse() : LETTERS) {
    const r = tryLetter(L, fifths < 0 ? -1 : 1);
    if (r) return r;
  }
  return makeSpelled('C', 0, Math.floor(midi / 12) - 1);
}

function makeSpelled(letter, accVal, octave) {
  const acc = accVal === 1 ? '#' : accVal === -1 ? 'b' : '';
  return {
    letter,
    acc,
    accVal,
    octave,
    midi: 12 * (octave + 1) + LETTER_SEMITONE[letter] + accVal,
    step: octave * 7 + LETTERS.indexOf(letter),
  };
}

export const noteLabel = (n) => `${n.letter}${n.acc}${n.octave}`;

// ---------------------------------------------------------------------------
// Pemetaan keyboard. Offset = jumlah semitone dari "Do" dasar (C4 secara default).
// Baris huruf = tuts putih, baris angka/home = tuts hitam, tersusun persis
// seperti tata letak tuts piano asli.
// ---------------------------------------------------------------------------
export const WHITE_KEYS = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'];
export const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24, 26, 28, 29, 31, 33];
export const BLACK_KEYS = ['2', '3', '5', '6', '7', '9', '0', 's', 'd', 'f', 'h', 'j', 'l', ';', "'"];
export const BLACK_OFFSETS = [1, 3, 6, 8, 10, 13, 15, 18, 20, 22, 25, 27, 30, 32, 34];

export const KEY_TO_OFFSET = {};
WHITE_KEYS.forEach((k, i) => (KEY_TO_OFFSET[k] = WHITE_OFFSETS[i]));
BLACK_KEYS.forEach((k, i) => (KEY_TO_OFFSET[k] = BLACK_OFFSETS[i]));

export const OFFSET_TO_KEY = {};
Object.entries(KEY_TO_OFFSET).forEach(([k, o]) => (OFFSET_TO_KEY[o] = k));

export const OCTAVE_DOWN_KEY = '[';
export const OCTAVE_UP_KEY = ']';
export const MIN_OCTAVE_SHIFT = -3;
export const MAX_OCTAVE_SHIFT = 3;
export const BASE_MIDI = 60; // C4

export const baseMidiFor = (octaveShift) => BASE_MIDI + 12 * octaveShift;

export function keyToMidi(key, octaveShift = 0) {
  const off = KEY_TO_OFFSET[key.toLowerCase()];
  return off === undefined ? null : baseMidiFor(octaveShift) + off;
}

// Label yang tampil di tuts untuk nada MIDI tertentu (bila bisa dimainkan
// pada oktaf saat ini); kalau tidak ada, null.
export function midiToKeyLabel(midi, octaveShift = 0) {
  const off = midi - baseMidiFor(octaveShift);
  return OFFSET_TO_KEY[off] ?? null;
}

// Cari pergeseran oktaf terbaik agar sekumpulan nada MIDI semuanya bisa dimainkan.
export function bestOctaveShift(midis) {
  if (!midis.length) return 0;
  let best = 0, bestScore = -Infinity;
  for (let s = MIN_OCTAVE_SHIFT; s <= MAX_OCTAVE_SHIFT; s++) {
    const base = baseMidiFor(s);
    let playable = 0;
    for (const m of midis) if (OFFSET_TO_KEY[m - base] !== undefined) playable++;
    const score = playable * 100 - Math.abs(s);
    if (score > bestScore) { bestScore = score; best = s; }
  }
  return best;
}
