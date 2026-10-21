// Membuat samples/canon-in-d.musicxml dan samples/canon-in-d.mid dari data pelajaran.
// Jalankan: node scripts/make-samples.mjs
import { writeFileSync } from 'node:fs';
import { parseSimpleLine } from '../js/score.js';

const THEME_A = 'F#5:2 E5:2 | D5:2 C#5:2 | B4:2 A4:2 | B4:2 C#5:2';
const THEME_B = 'D5:2 C#5:2 | B4:2 A4:2 | G4:2 F#4:2 | G4:2 E4:2';
const VARIATION = 'D5:1 F#5:1 A5:1 G5:1 | F#5:1 D5:1 F#5:1 E5:1 | D5:1 B4:1 D5:1 A4:1 | G4:1 B4:1 A4:1 G4:1';
const BASS = 'D3:2 A2:2 | B2:2 F#2:2 | G2:2 D2:2 | G2:2 A2:2';
const rh = parseSimpleLine(`${THEME_A} | ${THEME_B} | ${VARIATION} | F#4:2 D4:2`);
const lh = parseSimpleLine(`${BASS} | ${BASS} | ${BASS} | D3:2 D3:2`);
const BARS = 13, BPM = 66;

// ---------------- MusicXML ----------------
const stepAlter = (n) => ({ step: n.letter, alter: n.accVal, octave: n.octave });
const noteXml = (ev, staff, voice) => ev.notes.map((n, i) => {
  const p = stepAlter(n);
  const type = { 1: 'quarter', 2: 'half', 4: 'whole' }[ev.dur];
  return `<note>${i ? '<chord/>' : ''}<pitch><step>${p.step}</step>${p.alter ? `<alter>${p.alter}</alter>` : ''}<octave>${p.octave}</octave></pitch><duration>${ev.dur}</duration><voice>${voice}</voice><type>${type}</type><staff>${staff}</staff></note>`;
}).join('');
let measures = '';
for (let m = 0; m < BARS; m++) {
  const inBar = (ev) => ev.start >= m * 4 && ev.start < m * 4 + 4;
  const attrs = m === 0
    ? '<attributes><divisions>1</divisions><key><fifths>2</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef></attributes><direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>' + BPM + '</per-minute></metronome></direction-type><sound tempo="' + BPM + '"/></direction>'
    : '';
  measures += `<measure number="${m + 1}">${attrs}${rh.filter(inBar).map((e) => noteXml(e, 1, 1)).join('')}<backup><duration>4</duration></backup>${lh.filter(inBar).map((e) => noteXml(e, 2, 2)).join('')}</measure>\n`;
}
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
<work><work-title>Canon in D (aransemen sederhana)</work-title></work>
<identification><creator type="composer">Johann Pachelbel</creator></identification>
<part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1">
${measures}</part>
</score-partwise>
`;
writeFileSync(new URL('../samples/canon-in-d.musicxml', import.meta.url), xml);

// ---------------- MIDI ----------------
const PPQ = 480;
const vl = (v) => { const b = [v & 0x7f]; while ((v >>= 7)) b.unshift((v & 0x7f) | 0x80); return b; };
const evs = [];
for (const ev of [...rh, ...lh]) for (const n of ev.notes) {
  evs.push({ t: Math.round(ev.start * PPQ), d: [0x90, n.midi, 80] });
  evs.push({ t: Math.round((ev.start + ev.dur) * PPQ) - 8, d: [0x80, n.midi, 0] });
}
evs.sort((a, b) => a.t - b.t || (a.d[0] === 0x80 ? -1 : 1));
const us = Math.round(60e6 / BPM);
const trk = [
  ...vl(0), 0xff, 0x03, 10, ...Buffer.from('Canon in D'),
  ...vl(0), 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255,
  ...vl(0), 0xff, 0x58, 4, 4, 2, 24, 8,
  ...vl(0), 0xff, 0x59, 2, 2, 0,
  ...vl(0), 0xc0, 0,
];
let last = 0;
for (const e of evs) { trk.push(...vl(e.t - last), ...e.d); last = e.t; }
trk.push(...vl(0), 0xff, 0x2f, 0);
const hdr = Buffer.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, PPQ >> 8, PPQ & 255]);
const th = Buffer.from([0x4d, 0x54, 0x72, 0x6b, (trk.length >>> 24) & 255, (trk.length >>> 16) & 255, (trk.length >>> 8) & 255, trk.length & 255]);
writeFileSync(new URL('../samples/canon-in-d.mid', import.meta.url), Buffer.concat([hdr, th, Buffer.from(trk)]));
console.log('ok: musicxml + mid');
