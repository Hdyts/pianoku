// parse-musicxml.js — MusicXML (.musicxml / .xml / .mxl) -> skor mentah.
import { parseNote } from './music.js';

const STEP_ACC = (alter) => (alter === 1 ? '#' : alter === -1 ? 'b' : alter === 2 ? '##' : alter === -2 ? 'bb' : '');

// ---- .mxl = ZIP; baca tanpa pustaka luar memakai DecompressionStream -------
async function unzipEntry(buf, wantName) {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  // cari End Of Central Directory
  let eocd = -1;
  for (let i = u8.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('File .mxl rusak (ZIP tidak valid).');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
    entries.push({ name, method, csize, off });
    p += 46 + nlen + elen + clen;
  }
  const pick = wantName ? entries.find((e) => e.name === wantName) : entries.find((e) => /\.(xml|musicxml)$/i.test(e.name) && !/^META-INF\//i.test(e.name));
  if (!pick) throw new Error('Tidak ada berkas MusicXML di dalam .mxl');
  const lh = pick.off;
  const nl = dv.getUint16(lh + 26, true), el = dv.getUint16(lh + 28, true);
  const data = u8.subarray(lh + 30 + nl + el, lh + 30 + nl + el + pick.csize);
  if (pick.method === 0) return new TextDecoder().decode(data);
  if (pick.method !== 8) throw new Error('Metode kompresi ZIP tidak didukung.');
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([data]).stream().pipeThrough(ds);
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}

export async function mxlToXmlText(buf) {
  const container = await unzipEntry(buf, 'META-INF/container.xml').catch(() => null);
  if (container) {
    const m = /full-path="([^"]+)"/.exec(container);
    if (m) return unzipEntry(buf, m[1]);
  }
  return unzipEntry(buf, null);
}

const txt = (el, sel) => el.querySelector(sel)?.textContent?.trim();
const num = (el, sel, d = 0) => { const v = txt(el, sel); return v === undefined || v === '' ? d : parseFloat(v); };

export function parseMusicXML(xmlText, { part: partIdx = 0 } = {}) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('XML tidak valid.');
  const root = doc.documentElement;
  if (root.nodeName === 'score-timewise') throw new Error('Format score-timewise belum didukung; ekspor sebagai partwise.');
  const parts = [...doc.querySelectorAll('score-partwise > part')];
  if (!parts.length) throw new Error('Tidak ada <part> pada berkas.');
  const part = parts[Math.min(partIdx, parts.length - 1)];

  const title = txt(doc, 'work > work-title') || txt(doc, 'movement-title') || '';
  const composer = [...doc.querySelectorAll('identification > creator')].find((c) => c.getAttribute('type') === 'composer')?.textContent?.trim() || '';

  let divisions = 1, fifths = 0, num_ = 4, den = 4, tempo = 0;
  const staffClefs = {}; // staff# -> clef
  const staffEvents = {}; // staff# -> events[]
  let measureStart = 0;
  let maxStaff = 1;

  const push = (staff, ev) => { (staffEvents[staff] ||= []).push(ev); };

  for (const measure of part.querySelectorAll(':scope > measure')) {
    let cursor = measureStart; // posisi (beat) dalam birama
    let lastStart = cursor;
    let measureEnd = measureStart;
    const chordStarts = {};
    for (const el of measure.children) {
      switch (el.nodeName) {
        case 'attributes': {
          if (el.querySelector('divisions')) divisions = num(el, 'divisions', divisions);
          if (el.querySelector('key > fifths')) fifths = num(el, 'key > fifths', fifths);
          const tb = el.querySelector('time');
          if (tb) { num_ = num(tb, 'beats', num_); den = num(tb, 'beat-type', den); }
          el.querySelectorAll('clef').forEach((c) => {
            const n = parseInt(c.getAttribute('number') || '1', 10);
            const sign = txt(c, 'sign');
            staffClefs[n] = sign === 'F' ? 'bass' : 'treble';
            maxStaff = Math.max(maxStaff, n);
          });
          const st = num(el, 'staves', 0);
          if (st) maxStaff = Math.max(maxStaff, st);
          break;
        }
        case 'direction': {
          const t = el.querySelector('sound[tempo]')?.getAttribute('tempo') || el.querySelector('per-minute')?.textContent;
          if (t && !tempo) tempo = parseFloat(t);
          break;
        }
        case 'backup': cursor -= num(el, 'duration') / divisions; break;
        case 'forward': cursor += num(el, 'duration') / divisions; break;
        case 'note': {
          const isChord = !!el.querySelector('chord');
          const isGrace = !!el.querySelector('grace');
          if (isGrace) break;
          const dur = num(el, 'duration') / divisions;
          const staff = parseInt(txt(el, 'staff') || '1', 10);
          maxStaff = Math.max(maxStaff, staff);
          const start = isChord ? lastStart : cursor;
          if (el.querySelector('rest')) {
            if (!isChord) push(staff, { start, dur, rest: true, notes: [] });
          } else {
            const step = txt(el, 'pitch > step');
            if (!step) break;
            const alter = Math.round(num(el, 'pitch > alter', 0));
            const octave = txt(el, 'pitch > octave');
            const n = parseNote(step + STEP_ACC(alter) + octave);
            const tiedStop = [...el.querySelectorAll('tie')].some((t) => t.getAttribute('type') === 'stop');
            const tiedStart = [...el.querySelectorAll('tie')].some((t) => t.getAttribute('type') === 'start');
            const list = (staffEvents[staff] ||= []);
            // gabungkan not berdurasi sama pada awal yang sama menjadi akor
            const same = isChord ? list.findLast((e) => !e.rest && Math.abs(e.start - start) < 1e-6) : null;
            if (same) same.notes.push(n);
            else list.push({ start, dur, notes: [n], _tieStop: tiedStop, _tieStart: tiedStart });
          }
          if (!isChord) { lastStart = cursor; cursor += dur; }
          measureEnd = Math.max(measureEnd, cursor);
          break;
        }
        default: break;
      }
    }
    // panjang birama = posisi terjauh (mendukung anacrusis)
    measureStart = Math.max(measureEnd, cursor, measureStart);
  }

  // gabungkan tie: not yang tersambung dilebur menjadi satu event panjang
  const staves = [];
  const order = Object.keys(staffEvents).map(Number).sort((a, b) => a - b);
  for (const s of order) {
    const evs = staffEvents[s].sort((a, b) => a.start - b.start);
    const merged = [];
    for (const e of evs) {
      if (e._tieStop && !e.rest) {
        const prev = merged.findLast((m) => !m.rest && m.notes.some((n) => e.notes.some((x) => x.midi === n.midi)) && Math.abs(m.start + m.dur - e.start) < 1e-6);
        if (prev) { prev.dur += e.dur; continue; }
      }
      merged.push({ start: e.start, dur: e.dur, rest: e.rest, notes: e.notes });
    }
    staves.push({ clef: staffClefs[s] || (order.length === 2 && s === 2 ? 'bass' : 'treble'), events: merged });
  }
  if (!staves.length) throw new Error('Tidak ada not yang ditemukan.');
  return { title, composer, fifths, num: num_, den, tempo: tempo || 80, staves };
}
