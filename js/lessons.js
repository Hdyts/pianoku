// lessons.js — jalur pelajaran: dari mengenal tuts sampai memainkan Canon in D.
// Not ditulis dengan format ringkas "nama:ketukan" (lihat parseSimpleLine di score.js).
// Aransemen di sini sederhana, mengikuti progresi akor Canon (D A Bm F#m G D G A).
import { parseSimpleLine } from './score.js';

const mk = ({ fifths = 0, num = 4, den = 4, tempo = 70, rh, lh, title }) => {
  const staves = [];
  if (rh) staves.push({ clef: 'treble', events: parseSimpleLine(rh) });
  if (lh) staves.push({ clef: 'bass', events: parseSimpleLine(lh) });
  return { title, fifths, num, den, tempo, staves };
};

// Bagian-bagian Canon (tiap not setengah = 2 ketukan, 1 akor)
const THEME_A = 'F#5:2 E5:2 | D5:2 C#5:2 | B4:2 A4:2 | B4:2 C#5:2';
const THEME_B = 'D5:2 C#5:2 | B4:2 A4:2 | G4:2 F#4:2 | G4:2 E4:2';
const VARIATION = 'D5:1 F#5:1 A5:1 G5:1 | F#5:1 D5:1 F#5:1 E5:1 | D5:1 B4:1 D5:1 A4:1 | G4:1 B4:1 A4:1 G4:1';
const ENDING = 'F#4:2 D4:2';
const BASS = 'D3:2 A2:2 | B2:2 F#2:2 | G2:2 D2:2 | G2:2 A2:2';

export const LESSON_GROUPS = [
  { id: 'dasar', title: 'Dasar membaca not' },
  { id: 'canon', title: 'Canon in D' },
];

const defs = [
  {
    id: 'tuts-putih',
    group: 'dasar',
    title: 'Tuts putih: Do sampai Do',
    summary: 'Kenali C D E F G A B pada paranada kunci G.',
    tips:
      'Do (C) ada di tombol Q, lalu W E R T Y U, dan I adalah Do berikutnya. Not paling bawah di paranada (garis bantu di bawah garis pertama) adalah Do tengah.',
    raw: mk({
      title: 'Tuts putih',
      tempo: 70,
      rh: 'C4:1 D4:1 E4:1 F4:1 | G4:1 A4:1 B4:1 C5:1 | C5:1 B4:1 A4:1 G4:1 | F4:1 E4:1 D4:1 C4:1',
    }),
  },
  {
    id: 'tuts-hitam',
    group: 'dasar',
    title: 'Tuts hitam dan tanda kres',
    summary: 'Tangga nada D mayor: F dan C selalu dinaikkan (♯).',
    tips:
      'Di awal paranada ada dua kres: semua F dan C dimainkan sebagai tuts hitam di sebelah kanannya. F♯ = tombol 5, C♯ = tombol 9. Tanda kres ini berlaku untuk seluruh lagu.',
    raw: mk({
      title: 'Tangga nada D mayor',
      fifths: 2,
      tempo: 70,
      rh: 'D4:1 E4:1 F#4:1 G4:1 | A4:1 B4:1 C#5:1 D5:1 | D5:1 C#5:1 B4:1 A4:1 | G4:1 F#4:1 E4:1 D4:1',
    }),
  },
  {
    id: 'kunci-f',
    group: 'dasar',
    title: 'Kunci F: garis bass Canon',
    summary: 'Tangan kiri. Delapan nada yang diulang sepanjang Canon.',
    tips:
      'Kunci F dipakai untuk nada rendah. Nada-nadanya D A B F♯ G D G A. Tuts akan bergeser oktaf otomatis; bisa juga kamu tekan [ untuk turun oktaf.',
    raw: mk({ title: 'Garis bass Canon', fifths: 2, tempo: 60, lh: `${BASS} | ${BASS}` }),
  },
  {
    id: 'canon-a',
    group: 'canon',
    title: 'Canon bagian 1: tema yang turun',
    summary: 'F♯ E D C♯ B A B C♯ — melodi paling terkenal.',
    tips: 'Delapan not setengah (dua ketukan tiap not). Perhatikan arah not: turun selangkah demi selangkah, lalu naik lagi.',
    raw: mk({ title: 'Canon in D — tema 1', fifths: 2, tempo: 60, rh: THEME_A }),
  },
  {
    id: 'canon-b',
    group: 'canon',
    title: 'Canon bagian 2',
    summary: 'D C♯ B A G F♯ G E — melodi lanjutan.',
    tips: 'Pola yang sama dengan bagian 1, dimulai dari D. Jari tidak perlu cepat; fokus membaca posisi not.',
    raw: mk({ title: 'Canon in D — tema 2', fifths: 2, tempo: 60, rh: THEME_B }),
  },
  {
    id: 'canon-var',
    group: 'canon',
    title: 'Canon variasi not seperempat',
    summary: 'Setiap akor diisi dua not seperempat.',
    tips: 'Sekarang satu not = satu ketukan. Not tertinggi di lagu ini adalah A di atas garis bantu pertama.',
    raw: mk({ title: 'Canon in D — variasi', fifths: 2, tempo: 72, rh: VARIATION }),
  },
  {
    id: 'canon-rh',
    group: 'canon',
    title: 'Canon in D: tangan kanan lengkap',
    summary: 'Tema, tema lanjutan, variasi, dan penutup.',
    tips: 'Gabungan semua bagian. Mainkan sampai akurasi di atas 90% lalu coba mode "Lanjut walau salah".',
    raw: mk({
      title: 'Canon in D — tangan kanan',
      fifths: 2,
      tempo: 66,
      rh: `${THEME_A} | ${THEME_B} | ${VARIATION} | ${ENDING}`,
    }),
  },
  {
    id: 'canon-2tangan',
    group: 'canon',
    title: 'Canon in D: dua tangan',
    summary: 'Bass dan tema 1 dimainkan bersamaan (dua paranada).',
    tips: 'Setiap langkah punya dua not: satu di kunci F, satu di kunci G. Tekan keduanya, urutan bebas.',
    raw: mk({
      title: 'Canon in D — dua tangan',
      fifths: 2,
      tempo: 56,
      rh: 'F#4:2 E4:2 | D4:2 C#4:2 | B3:2 A3:2 | B3:2 C#4:2',
      lh: BASS,
    }),
  },
];

export const LESSONS = defs;
export const lessonById = (id) => LESSONS.find((l) => l.id === id);
