// transform.js — menyederhanakan skor mentah sebelum dilatih (pilih tangan, hanya melodi).
// Bekerja pada skor "mentah" (sebelum normalizeScore), tanpa DOM.

const midiOf = (n) => (typeof n === 'number' ? n : n.midi);

export function transformRaw(raw, { hands = 'both', melody = false } = {}) {
  let staves = raw.staves;
  if (hands === 'right' || hands === 'left') {
    const want = hands === 'right' ? 'treble' : 'bass';
    const picked = staves.filter((s) => s.clef === want);
    if (picked.length) staves = picked; // bila tak ada, biarkan semua
  }
  if (melody) {
    staves = staves.map((st) => ({
      ...st,
      events: st.events.map((ev) => {
        if (ev.rest || !ev.notes || ev.notes.length < 2) return ev;
        const sorted = [...ev.notes].sort((a, b) => midiOf(a) - midiOf(b));
        return { ...ev, notes: [st.clef === 'bass' ? sorted[0] : sorted[sorted.length - 1]] };
      }),
    }));
  }
  return { ...raw, staves };
}

export function hasBothHands(raw) {
  return raw.staves.some((s) => s.clef === 'treble') && raw.staves.some((s) => s.clef === 'bass');
}

export function hasChords(raw) {
  return raw.staves.some((s) => s.events.some((e) => !e.rest && e.notes && e.notes.length > 1));
}
