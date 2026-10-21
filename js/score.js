// score.js — model partitur: normalisasi (bar, durasi, tie, rest) + langkah latihan.
//
// Format mentah (hasil parser / data lesson):
//   { title, fifths, num, den, tempo,
//     staves: [ { clef: 'treble'|'bass',
//                 events: [ { start, dur, rest?, notes: [midi | {midi,letter,accVal,octave}] } ] } ] }
// Satuan waktu: beat not seperempat (quarter = 1).

import { spellMidi, parseNote } from './music.js';

const EPS = 1e-6;
const STD = [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.375, 0.25];

export function splitDuration(d) {
  const out = [];
  let left = d;
  while (left > EPS) {
    const piece = STD.find((x) => x <= left + EPS);
    if (!piece) break; // sisa < 1/16: abaikan
    out.push(piece);
    left -= piece;
  }
  return out;
}

function toSpelled(n, fifths) {
  if (typeof n === 'number') return spellMidi(n, fifths);
  if (typeof n === 'string') return parseNote(n);
  if (n.letter) {
    // sudah dieja (MusicXML); lengkapi bila perlu
    const p = parseNote(`${n.letter}${n.accVal === 1 ? '#' : n.accVal === -1 ? 'b' : ''}${n.octave}`);
    return p;
  }
  return spellMidi(n.midi, fifths);
}

export const barLength = (num, den) => (num * 4) / den;

export function normalizeScore(raw) {
  const fifths = raw.fifths ?? 0;
  const num = raw.num ?? 4;
  const den = raw.den ?? 4;
  const barLen = barLength(num, den);
  const staves = [];
  let endTime = 0;

  for (const st of raw.staves) {
    for (const ev of st.events) endTime = Math.max(endTime, ev.start + ev.dur);
  }
  const totalBars = Math.max(1, Math.ceil(endTime / barLen - EPS));
  const total = totalBars * barLen;

  raw.staves.forEach((st, si) => {
    const src = [...st.events].filter((e) => e.dur > EPS).sort((a, b) => a.start - b.start);
    const out = [];
    let cursor = 0;

    const pushRest = (from, to) => {
      let t = from;
      while (to - t > EPS) {
        const barEnd = (Math.floor(t / barLen + EPS) + 1) * barLen;
        const segEnd = Math.min(to, barEnd);
        const len = segEnd - t;
        // sebar penuh -> satu rest utuh bila bisa
        const pieces = Math.abs(len - barLen) < EPS && STD.includes(barLen) ? [barLen] : splitDuration(len);
        for (const p of pieces) { out.push({ start: t, dur: p, rest: true, notes: [] }); t += p; }
        if (!pieces.length) t = segEnd;
        t = Math.max(t, segEnd - 0); // jaga maju
      }
    };

    for (const ev of src) {
      if (ev.start > cursor + EPS) pushRest(cursor, ev.start);
      // potong di garis birama
      let t = ev.start;
      const end = ev.start + ev.dur;
      const segs = [];
      while (end - t > EPS) {
        const barEnd = (Math.floor(t / barLen + EPS) + 1) * barLen;
        const segEnd = Math.min(end, barEnd);
        for (const p of splitDuration(segEnd - t)) { segs.push([t, p]); t += p; }
        t = segEnd;
      }
      segs.forEach(([s, d], i) => {
        const e = { start: s, dur: d, rest: !!ev.rest, notes: [] };
        if (!ev.rest) {
          e.notes = ev.notes.map((n) => toSpelled(n, fifths)).sort((a, b) => a.midi - b.midi);
          if (i < segs.length - 1) e.tie = true;
          if (i > 0) e.tiedFrom = true;
        }
        out.push(e);
      });
      cursor = Math.max(cursor, end);
    }
    if (total > cursor + EPS) pushRest(cursor, total);

    out.forEach((e, i) => { e.id = `${si}-${i}`; e.staff = si; });
    staves.push({ clef: st.clef || 'treble', events: out });
  });

  const score = {
    title: raw.title || '',
    composer: raw.composer || '',
    fifths, num, den, barLen, totalBars,
    tempo: raw.tempo || 80,
    staves,
  };
  score.steps = buildSteps(score);
  return score;
}

// Langkah latihan: kelompokkan semua nada yang mulai bersamaan.
export function buildSteps(score) {
  const map = new Map();
  const key = (t) => Math.round(t * 1000);
  score.staves.forEach((st) => {
    let lastStep = -1;
    st.events.forEach((ev, i) => {
      if (ev.rest) return;
      if (ev.tiedFrom) { ev.stepIndex = lastStep; return; }
      // durasi bunyi = gabungan tie
      let dur = ev.dur;
      let j = i, cur = ev;
      while (cur.tie && st.events[j + 1]) { j++; cur = st.events[j]; dur += cur.dur; }
      const k = key(ev.start);
      if (!map.has(k)) map.set(k, { start: ev.start, notes: [], events: [] });
      const step = map.get(k);
      step.events.push(ev);
      for (const n of ev.notes) step.notes.push({ midi: n.midi, dur });
      ev._tmpKey = k;
    });
  });
  const steps = [...map.values()].sort((a, b) => a.start - b.start);
  steps.forEach((s, i) => {
    s.index = i;
    s.midis = [...new Set(s.notes.map((n) => n.midi))].sort((a, b) => a - b);
    s.events.forEach((e) => { e.stepIndex = i; });
  });
  // tiedFrom mengikuti langkah pendahulunya
  score.staves.forEach((st) => {
    let last = -1;
    st.events.forEach((ev) => {
      if (ev.rest) return;
      if (ev.tiedFrom) ev.stepIndex = last; else last = ev.stepIndex;
      delete ev._tmpKey;
    });
  });
  return steps;
}

// Skor ringkas dari teks sederhana, dipakai lesson:
//   "D4:1 E4:1 F#4:2 | A4:4"   (nama:durasi, '|' diabaikan, 'r:1' = rest, 'D4+F#4:2' = akor)
export function parseSimpleLine(text, startBeat = 0) {
  const events = [];
  let t = startBeat;
  for (const tok of text.replace(/\|/g, ' ').split(/\s+/).filter(Boolean)) {
    const [names, durStr] = tok.split(':');
    const dur = parseFloat(durStr);
    if (!(dur > 0)) throw new Error('Durasi tidak valid pada: ' + tok);
    if (names.toLowerCase() === 'r') events.push({ start: t, dur, rest: true, notes: [] });
    else events.push({ start: t, dur, notes: names.split('+').map((n) => parseNote(n)) });
    t += dur;
  }
  return events;
}
