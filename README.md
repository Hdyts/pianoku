# Pianoku — belajar not balok dengan piano virtual

Situs statis (HTML + JavaScript murni, tanpa build). Piano ada di halaman web dan dimainkan lewat keyboard laptop,
dengan partitur not balok tampil di atasnya.

## Peta tombol

| Baris | Tombol | Nada |
|---|---|---|
| Tuts putih | `Q W E R T Y U I` · `I O P Z X C V B` · `B N M , . /` | Do Re Mi Fa Sol La Si Do, dan seterusnya (20 tuts) |
| Tuts hitam | `2 3 5 6 7` · `9 0 S D F` · `H J L ; '` | C♯ D♯ F♯ G♯ A♯ di tiap oktaf |
| Oktaf | `[` turun, `]` naik | |
| Lain-lain | `Spasi` pedal sustain, `Esc` ulangi dari awal | |

Secara bawaan `Q` = C4 (Do tengah). Pemetaan memakai posisi fisik tombol, jadi tetap benar di layout keyboard lain.

## Fitur

- 8 pelajaran: tuts putih, tuts hitam dan kres, kunci F, lalu Canon in D (tema, variasi, tangan kanan, dua tangan).
- Not yang salah ditekan menjadi **merah** di partitur dan tetap merah sebagai tanda untuk dikoreksi; not benar menjadi hijau.
- Dua mode: "Tunggu nada benar" dan "Lanjut walau salah".
- **Buka file sheet**: `.musicxml`, `.xml`, `.mxl` (MuseScore, Finale, Sibelius), `.mid`/`.midi`, dan `.txt` (format sederhana, lihat dialog di aplikasi). Bisa juga seret file ke halaman.
- Mode **Dengarkan** memutar sheet sambil menyorot not dan tuts.
- Petunjuk tuts berikutnya, geser oktaf otomatis, nama nada (Do Re Mi / C D E), tempo, dan volume.

Catatan: PDF atau foto sheet belum bisa dibaca (butuh pengenalan gambar not).
Aransemen Canon in D di pelajaran adalah versi sederhana yang mengikuti progresi akornya; untuk aransemen lain, buka file MusicXML atau MIDI sendiri.

## Menjalankan di komputer

```bash
npx serve .          # lalu buka alamat yang tampil
npm test             # tes otomatis (Node 20+)
```

## Deploy ke Vercel

Tidak perlu build. `vercel.json` sudah menyetel folder ini sebagai situs statis.

**Lewat GitHub (disarankan)**
1. Buat repositori baru di GitHub, lalu unggah isi folder ini.
2. Buka vercel.com, pilih **Add New → Project**, impor repositori itu.
3. Biarkan semua pengaturan bawaan (Framework: Other), klik **Deploy**.
4. Situs aktif di alamat `nama-proyek.vercel.app`. Tiap `git push` otomatis memperbarui situs.

**Lewat terminal**
```bash
npm i -g vercel
vercel          # login lalu ikuti pertanyaan (jawab Enter untuk semua)
vercel --prod   # rilis ke alamat produksi
```

## Struktur

```
index.html          halaman utama
css/app.css         tampilan aplikasi
css/score.css       gaya partitur SVG
js/main.js          penghubung UI, keyboard, latihan
js/music.js         teori musik + pemetaan tombol
js/audio.js         synthesizer piano (Web Audio)
js/keyboard.js      tuts piano virtual
js/score.js         normalisasi partitur (birama, durasi, tie)
js/staff.js         renderer not balok (SVG)
js/glyphs.js        kunci, aksidental, rest (path SVG)
js/lessons.js       data pelajaran
js/practice.js      mesin latihan (benar/salah)
js/demo.js          mode dengarkan
js/parse-*.js       pembaca teks, MusicXML, MIDI
samples/            contoh file sheet
scripts/            pembuat contoh MIDI/MusicXML
tests/              tes otomatis
```
