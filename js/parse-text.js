// parse-text.js — format teks sederhana (.txt / .piano) dan JSON -> skor mentah.
//
// Contoh:
//   title: Twinkle Twinkle
//   key: C            (C, G, D, F, Bb, Am, ... atau angka kres/mol: +2, -3)
//   time: 4/4
//   tempo: 90
//   RH: C4:1 C4:1 G4:1 G4:1 | A4:1 A4:1 G4:2
//   LH: C3+G3:2 C3+G3:2
//
// Setiap token = nama:durasi (dalam ketukan seperempat). "r:1" = jeda. "C4+E4+G4:2" = akor.
// Tanpa label RH/LH -> satu baris = satu paranada kunci G.
import { parseSimpleLine } from './score.js';

const KEY_FIFTHS = {
  C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7,
  F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7,
  Am: 0, Em: 1, Bm: 2, 'F#m': 3, 'C#m': 4, 'G#m': 5, 'D#m': 6,
  Dm: -1, Gm: -2, Cm: -3, Fm: -4, Bbm: -5, Ebm: -6,
};

export function parseText(text) {
  const raw = { title: '', composer: '', fifths: 0, num: 4, den: 4, tempo: 80, staves: [] };
  const lines = text.replace(/\r/g, '').split('\n');
  const staffMap = new Map();
  const bare = [];
  for (let ln of lines) {
    ln = ln.replace(/#\s.*$/, '').replace(/\/\/.*$/, '').trim(); // komentar
    if (!ln) continue;
    const m = /^([A-Za-z]+)\s*:\s*(.*)$/.exec(ln);
    const label = m && m[1].toLowerCase();
    if (m && ['title', 'judul'].includes(label)) raw.title = m[2];
    else if (m && ['composer', 'komposer'].includes(label)) raw.composer = m[2];
    else if (m && ['tempo', 'bpm'].includes(label)) raw.tempo = parseFloat(m[2]) || 80;
    else if (m && ['time', 'meter', 'birama'].includes(label)) {
      const t = /(\d+)\s*\/\s*(\d+)/.exec(m[2]);
      if (t) { raw.num = +t[1]; raw.den = +t[2]; }
    } else if (m && ['key', 'kunci', 'nada'].includes(label)) {
      const v = m[2].trim();
      if (/^[+-]?\d+$/.test(v)) raw.fifths = parseInt(v, 10);
      else if (v in KEY_FIFTHS) raw.fifths = KEY_FIFTHS[v];
      else throw new Error('Tanda mula tidak dikenal: ' + v);
    } else if (m && ['rh', 'tr', 'treble', 'kanan'].includes(label)) addTo(staffMap, 'treble', m[2]);
    else if (m && ['lh', 'bs', 'bass', 'kiri'].includes(label)) addTo(staffMap, 'bass', m[2]);
    else bare.push(ln);
  }
  if (bare.length && !staffMap.size) addTo(staffMap, 'treble', bare.join(' '));
  for (const [clef, parts] of staffMap) {
    raw.staves.push({ clef, events: parseSimpleLine(parts.join(' ')) });
  }
  raw.staves.sort((a, b) => (a.clef === 'treble' ? -1 : 1) - (b.clef === 'treble' ? -1 : 1));
  if (!raw.staves.length) throw new Error('Tidak ada not yang ditemukan di berkas.');
  return raw;
}

function addTo(map, clef, line) {
  if (!map.has(clef)) map.set(clef, []);
  map.get(clef).push(line);
}

// JSON: { title, fifths, num, den, tempo, rh: "D4:1 ...", lh: "..." }  atau bentuk mentah staves
export function parseJSONScore(text) {
  const j = JSON.parse(text);
  if (j.staves) {
    j.staves.forEach((s) => {
      if (typeof s.notes === 'string') s.events = parseSimpleLine(s.notes);
      if (!s.events) throw new Error('Setiap staff butuh "events" atau "notes".');
    });
    return { fifths: 0, num: 4, den: 4, tempo: 80, ...j };
  }
  const raw = { title: j.title || '', composer: j.composer || '', fifths: j.fifths ?? 0, num: j.num ?? 4, den: j.den ?? 4, tempo: j.tempo ?? 80, staves: [] };
  const rh = j.rh || j.treble, lh = j.lh || j.bass;
  if (rh) raw.staves.push({ clef: 'treble', events: parseSimpleLine(rh) });
  if (lh) raw.staves.push({ clef: 'bass', events: parseSimpleLine(lh) });
  if (!raw.staves.length) throw new Error('JSON harus punya "rh"/"lh" atau "staves".');
  return raw;
}
