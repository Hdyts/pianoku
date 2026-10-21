// parse-midi.js — Standard MIDI File (.mid / .midi) -> skor mentah.
// Not dibagi ke paranada kanan (kunci G) dan kiri (kunci F) berdasarkan tinggi nada.
// Waktu dikuantisasi ke 1/16 (0,25 ketukan) supaya aman ditampilkan sebagai not balok.

const Q = 0.25;
const quant = (x) => Math.round(x / Q) * Q;

function readVarLen(u8, p) {
  let v = 0, n = 0, b;
  do {
    b = u8[p + n++];
    if (b === undefined) throw new Error('Berkas MIDI terpotong.');
    v = (v << 7) | (b & 0x7f);
  } while (b & 0x80 && n < 5);
  return [v, n];
}

function parseTrack(u8, start, end) {
  const notes = [];
  const open = new Map(); // "ch:note" -> [ {tick, vel} ]
  const meta = { name: '', tempo: null, time: null, key: null };
  let p = start, tick = 0, status = 0;
  while (p < end) {
    const [delta, dn] = readVarLen(u8, p);
    p += dn;
    tick += delta;
    let b = u8[p];
    if (b === undefined) break;
    if (b & 0x80) { status = b; p++; } // bila tidak, pakai running status
    if (status === 0xff) {
      const type = u8[p++];
      const [len, ln] = readVarLen(u8, p);
      p += ln;
      const d = u8.subarray(p, p + len);
      if (type === 0x03 && !meta.name) meta.name = new TextDecoder('utf-8', { fatal: false }).decode(d).trim();
      else if (type === 0x51 && len === 3 && meta.tempo === null) meta.tempo = { tick, us: (d[0] << 16) | (d[1] << 8) | d[2] };
      else if (type === 0x58 && len >= 2 && meta.time === null) meta.time = { tick, num: d[0], den: 2 ** d[1] };
      else if (type === 0x59 && len >= 2 && meta.key === null) meta.key = { tick, fifths: (d[0] << 24) >> 24 };
      p += len;
      if (type === 0x2f) break;
    } else if (status === 0xf0 || status === 0xf7) {
      const [len, ln] = readVarLen(u8, p);
      p += ln + len;
    } else {
      const hi = status & 0xf0, ch = status & 0x0f;
      const two = hi !== 0xc0 && hi !== 0xd0;
      const d1 = u8[p++];
      const d2 = two ? u8[p++] : 0;
      if (hi === 0x90 && d2 > 0) {
        const k = `${ch}:${d1}`;
        if (!open.has(k)) open.set(k, []);
        open.get(k).push({ tick, vel: d2 });
      } else if (hi === 0x80 || (hi === 0x90 && d2 === 0)) {
        const k = `${ch}:${d1}`;
        const st = open.get(k);
        if (st && st.length) {
          const o = st.shift();
          if (ch !== 9) notes.push({ midi: d1, start: o.tick, end: tick, ch });
        }
      }
    }
  }
  // not yang tidak pernah dilepas: tutup di akhir trek
  for (const [k, st] of open) {
    const [ch, midi] = k.split(':').map(Number);
    for (const o of st) if (ch !== 9) notes.push({ midi, start: o.tick, end: Math.max(tick, o.tick + 1), ch });
  }
  return { notes, meta };
}

// opts.tracks: Set/array indeks trek yang dipakai (default: semua yang berisi not)
export function parseMidi(buf, opts = {}) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  const tag = (o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  if (u8.length < 14 || tag(0) !== 'MThd') throw new Error('Bukan berkas MIDI yang valid.');
  const hlen = dv.getUint32(4);
  const division = dv.getUint16(12);
  if (division & 0x8000) throw new Error('MIDI berbasis SMPTE belum didukung.');
  const ppq = division || 480;

  const tracks = [];
  let p = 8 + hlen;
  while (p + 8 <= u8.length) {
    const len = dv.getUint32(p + 4);
    if (tag(p) === 'MTrk') {
      const t = parseTrack(u8, p + 8, Math.min(u8.length, p + 8 + len));
      tracks.push(t);
    }
    p += 8 + len;
  }
  if (!tracks.length) throw new Error('Berkas MIDI tidak berisi trek.');

  const info = tracks.map((t, i) => ({
    index: i,
    name: t.meta.name || `Trek ${i + 1}`,
    count: t.notes.length,
    lo: t.notes.length ? Math.min(...t.notes.map((n) => n.midi)) : null,
    hi: t.notes.length ? Math.max(...t.notes.map((n) => n.midi)) : null,
  }));
  const usable = info.filter((t) => t.count > 0).map((t) => t.index);
  if (!usable.length) throw new Error('Tidak ada not yang ditemukan di berkas MIDI.');
  const chosen = new Set(opts.tracks && [...opts.tracks].length ? [...opts.tracks] : usable);

  const firstMeta = (key) => tracks.map((t) => t.meta[key]).filter(Boolean).sort((a, b) => a.tick - b.tick)[0];
  const tempoM = firstMeta('tempo'), timeM = firstMeta('time'), keyM = firstMeta('key');
  const tempo = tempoM ? Math.round(60e6 / tempoM.us) : 100;
  const num = timeM ? timeM.num : 4;
  const den = timeM ? timeM.den : 4;
  const fifths = keyM ? Math.max(-7, Math.min(7, keyM.fifths)) : 0;

  // kumpulkan not terpilih, kuantisasi ke ketukan
  const all = [];
  for (const i of chosen) {
    for (const n of tracks[i]?.notes || []) {
      const s = quant(n.start / ppq);
      let e = quant(n.end / ppq);
      if (e <= s) e = s + Q;
      all.push({ midi: n.midi, start: s, end: e });
    }
  }
  if (!all.length) throw new Error('Trek yang dipilih tidak berisi not.');

  const lo = Math.min(...all.map((n) => n.midi)), hi = Math.max(...all.map((n) => n.midi));
  const SPLIT = 60;
  const staffDefs = [];
  if (lo >= 55) staffDefs.push({ clef: 'treble', pick: () => true });
  else if (hi <= 64) staffDefs.push({ clef: 'bass', pick: () => true });
  else {
    staffDefs.push({ clef: 'treble', pick: (m) => m >= SPLIT });
    staffDefs.push({ clef: 'bass', pick: (m) => m < SPLIT });
  }

  const staves = staffDefs.map((def) => {
    const byStart = new Map();
    for (const n of all) {
      if (!def.pick(n.midi)) continue;
      const k = Math.round(n.start * 1000);
      if (!byStart.has(k)) byStart.set(k, { start: n.start, midis: new Set(), end: n.end });
      const g = byStart.get(k);
      g.midis.add(n.midi);
      g.end = Math.max(g.end, n.end);
    }
    const groups = [...byStart.values()].sort((a, b) => a.start - b.start);
    const events = groups.map((g, i) => {
      const next = groups[i + 1];
      const len = g.end - g.start;
      let dur = len;
      if (next) {
        const ioi = next.start - g.start;
        dur = len >= ioi * 0.6 ? ioi : len; // legato -> isi sampai nada berikut
        dur = Math.min(dur, ioi);
      }
      return { start: g.start, dur: Math.max(Q, dur), notes: [...g.midis].sort((a, b) => a - b) };
    });
    return { clef: def.clef, events };
  });

  const raw = {
    title: tracks[0].meta.name && !/^track\s*\d*$/i.test(tracks[0].meta.name) ? tracks[0].meta.name : '',
    composer: '',
    fifths, num, den, tempo, staves,
  };
  return { raw, info: { kind: 'midi', tracks: info, chosen: [...chosen] } };
}
