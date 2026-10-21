// main.js — menyatukan semua modul: UI, keyboard laptop, partitur, latihan, dan pembaca file.
import { PianoAudio } from './audio.js';
import { VirtualKeyboard } from './keyboard.js';
import { LESSONS, LESSON_GROUPS, lessonById } from './lessons.js';
import { normalizeScore } from './score.js';
import { renderScore } from './staff.js';
import { Practice } from './practice.js';
import { DemoPlayer } from './demo.js';
import { parseText, parseJSONScore } from './parse-text.js';
import { parseMusicXML, mxlToXmlText } from './parse-musicxml.js';
import { parseMidi } from './parse-midi.js';
import { transformRaw, hasBothHands, hasChords } from './transform.js';
import * as M from './music.js';

const $ = (id) => document.getElementById(id);
const el = {
  host: $('score'), title: $('title'), summary: $('summary'), hint: $('hintbar'),
  done: $('done'), toast: $('toast'), lessons: $('lesson-list'), select: $('lesson-select'),
  progress: $('st-progress'), acc: $('st-acc'), err: $('st-err'),
  mode: $('opt-mode'), names: $('opt-names'), showHint: $('opt-hint'), auto: $('opt-auto'),
  speed: $('opt-speed'), speedOut: $('out-speed'), vol: $('opt-vol'),
  listen: $('btn-listen'), file: $('file'),
  sheetOpts: $('sheet-opts'), hands: $('opt-hands'), melody: $('opt-melody'), tracks: $('opt-tracks'),
  octLabel: $('oct-label'), minimap: $('minimap'),
};

const audio = new PianoAudio();
let shift = 0;
let sustainOn = false; // toggle state untuk pedal sustain
let score = null, practice = null, layout = null;
let source = null; // { kind:'lesson', id } | { kind:'file', name, ... }
let stepEls = new Map();
let lastWrong = '';
let toastTimer = 0;

// ---------------------------------------------------------------- penyimpanan
const store = {
  get(k, d) { try { const v = localStorage.getItem('pianoku.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('pianoku.' + k, JSON.stringify(v)); } catch { /* abaikan */ } },
};
const progress = store.get('progress', {});

// ---------------------------------------------------------------- bantuan
const pretty = (midi) => {
  const n = M.midiToName(midi);
  const sharp = n[1] === '#';
  return `${M.SOLFEGE[n[0]]}${sharp ? '♯' : ''} (${n[0]}${sharp ? '♯' : ''}${n.slice(sharp ? 2 : 1)})`;
};
function toast(msg, isErr = false, ms = 3500) {
  el.toast.textContent = msg;
  el.toast.className = 'toast' + (isErr ? ' err' : '');
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.toast.hidden = true), ms);
}
const blurSoon = (e) => e.target.blur?.();

// ---------------------------------------------------------------- keyboard virtual
const kb = new VirtualKeyboard($('keyboard'), {
  onDown: (m) => noteDown(m),
  onUp: (m) => noteUp(m),
});

function buildMinimap() {
  el.minimap.innerHTML = '<span class="win"></span>';
  for (let o = 0; o <= 9; o++) {
    const i = document.createElement('i');
    i.style.left = `${(o / 9) * 100}%`;
    el.minimap.appendChild(i);
  }
}
function updateOctaveUI() {
  const lo = kb.baseMidi, hi = lo + 35;
  el.octLabel.textContent = `${M.midiToName(lo)} – ${M.midiToName(hi)}`;
  const span = 108; // C1..C10
  const win = el.minimap.querySelector('.win');
  if (win) { win.style.left = `${((lo - 24) / span) * 100}%`; win.style.width = `${(36 / span) * 100}%`; }
}
function setShift(s) {
  s = Math.max(M.MIN_OCTAVE_SHIFT, Math.min(M.MAX_OCTAVE_SHIFT, s));
  if (s === shift && kb.shift === s) return;
  shift = s;
  kb.setOctave(s);
  held.forEach((m) => kb.setPressed(m, true));
  updateOctaveUI();
  updateHint();
}
const inWindow = (m) => M.midiToKeyLabel(m, shift) !== null;

// Pastikan semua nada langkah ini bisa dimainkan; geser oktaf bila perlu.
function ensureWindow(midis) {
  if (!midis.length || midis.every(inWindow)) return;
  const order = [];
  for (let d = 1; d <= 6; d++) order.push(shift - d, shift + d);
  const ok = order.find((s) => s >= M.MIN_OCTAVE_SHIFT && s <= M.MAX_OCTAVE_SHIFT && midis.every((m) => M.midiToKeyLabel(m, s) !== null));
  setShift(ok !== undefined ? ok : M.bestOctaveShift(midis));
}

// ---------------------------------------------------------------- partitur
function pickSp(w) { return w < 560 ? 8 : w < 900 ? 10 : 12; }

function renderSheet() {
  if (!score) return;
  const w = Math.max(320, Math.floor(el.host.clientWidth - 12));
  layout = renderScore(score, { width: Math.min(w, 1180), sp: pickSp(w) });
  el.host.innerHTML = layout.svg;
  stepEls = new Map();
  el.host.querySelectorAll('[data-step]').forEach((n) => {
    const i = Number(n.dataset.step);
    if (!stepEls.has(i)) stepEls.set(i, []);
    stepEls.get(i).push(n);
  });
  paintAll();
}

function paintStep(i, { showCursor = true } = {}) {
  const els = stepEls.get(i);
  if (!els) return;
  const st = practice ? practice.status[i] : 'pending';
  const isCur = practice && !practice.finished && practice.index === i && showCursor;
  for (const n of els) {
    if (n.classList.contains('cursor')) { n.classList.toggle('on', !!isCur); continue; }
    n.classList.toggle('st-ok', st === 'ok');
    n.classList.toggle('st-bad', st === 'bad');
    n.classList.toggle('st-cur', !!isCur && st !== 'bad');
  }
}
function paintAll() {
  for (const i of stepEls.keys()) paintStep(i);
}

function scrollToStep(i) {
  const m = layout?.steps?.[i];
  if (!m) return;
  const sys = layout.systems[m.system];
  const h = el.host;
  if (!sys) return;
  const top = sys.top, bottom = sys.bottom;
  if (top < h.scrollTop || bottom > h.scrollTop + h.clientHeight) h.scrollTop = Math.max(0, top - 6);
}

// ---------------------------------------------------------------- memuat sheet
function loadScore(raw, src) {
  demo.stop(false);
  score = normalizeScore(raw);
  source = src;
  practice = new Practice(score.steps, { mode: el.mode.value });
  el.title.textContent = src.title || raw.title || 'Tanpa judul';
  el.summary.textContent = src.summary || (src.kind === 'file' ? `Sheet dari file ${src.name}. Tekan tuts yang sesuai dengan not yang disorot.` : '');
  el.done.hidden = true;
  lastWrong = '';
  el.host.scrollTop = 0;
  renderSheet();
  afterStepChange(true);
  updateStats();
  renderLessonList();
  el.host.focus?.();
}

function loadLesson(id) {
  const l = lessonById(id);
  if (!l) return;
  el.sheetOpts.hidden = true;
  fileState = null;
  loadScore(l.raw, { kind: 'lesson', id, title: l.title, summary: `${l.summary} ${l.tips}` });
  store.set('lesson', id);
}

function restart() {
  if (!practice) return;
  demo.stop(false);
  practice.reset();
  el.done.hidden = true;
  lastWrong = '';
  paintAll();
  el.host.scrollTop = 0;
  afterStepChange(true);
  updateStats();
}

function afterStepChange(first = false) {
  if (!practice) return;
  if (!practice.finished) {
    if (el.auto.checked) ensureWindow(practice.current.midis);
    scrollToStep(practice.index);
  }
  updateHint();
}

// ---------------------------------------------------------------- petunjuk & statistik
function updateHint() {
  if (!practice || demo.playing) { kb.setHints([]); if (!demo.playing) el.hint.innerHTML = ''; return; }
  if (practice.finished) { kb.setHints([]); el.hint.innerHTML = '<span>Selesai.</span>'; return; }
  const rem = practice.remaining;
  const wrong = lastWrong ? `<span class="warn">Kamu menekan ${lastWrong}. Coba lagi.</span>` : '';
  if (!el.showHint.checked) {
    kb.setHints([]);
    el.hint.innerHTML = `<span>Petunjuk tuts mati. Baca not yang disorot, lalu tekan tuts yang tepat.</span>${wrong}`;
    return;
  }
  kb.setHints(rem.filter(inWindow));
  const parts = rem.map((m) => {
    const lab = M.midiToKeyLabel(m, shift);
    return lab !== null
      ? `<span class="now">${pretty(m)}</span> <kbd>${lab.toUpperCase()}</kbd>`
      : `<span class="now">${pretty(m)}</span> <span class="warn">ada di oktaf lain, tekan [ atau ]</span>`;
  });
  el.hint.innerHTML = `<span>Berikutnya:</span> ${parts.join('<span>dan</span>')}${wrong}`;
}

function updateStats() {
  if (!practice) return;
  const s = practice.stats;
  el.progress.textContent = `${s.done}/${s.total}`;
  el.acc.textContent = s.done ? `${Math.round((s.ok / s.done) * 100)}%` : '–';
  el.err.textContent = s.mistakes;
}

function showDone() {
  const s = practice.stats;
  const acc = s.accuracy;
  const secs = s.seconds;
  $('done-title').textContent = acc === 100 ? 'Sempurna!' : acc >= 90 ? 'Bagus sekali!' : acc >= 70 ? 'Selesai, hampir mulus' : 'Selesai';
  $('done-text').textContent =
    `Akurasi ${acc}%, ${s.mistakes} salah tekan, waktu ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}. ` +
    (s.bad ? 'Not merah menunjukkan yang pernah salah.' : 'Semua not benar sejak percobaan pertama.');
  const idx = LESSONS.findIndex((l) => l.id === source?.id);
  $('btn-next').hidden = !(source?.kind === 'lesson' && idx >= 0 && idx < LESSONS.length - 1);
  el.done.hidden = false;
  if (source?.kind === 'lesson') {
    const prev = progress[source.id]?.best ?? -1;
    progress[source.id] = { best: Math.max(prev, acc) };
    store.set('progress', progress);
    renderLessonList();
  }
}

// ---------------------------------------------------------------- input nada
const held = new Map(); // id tuts (kode / pointer) -> midi

function noteDown(midi, id = midi) {
  audio.noteOn(midi, { id });
  kb.setPressed(midi, true);
  if (!practice || demo.playing) return;
  const r = practice.press(midi);
  if (r.result === 'ignored') return;
  if (r.result === 'bad') {
    lastWrong = pretty(midi);
    kb.flash(midi, 'bad');
    paintStep(r.index);
    if (r.advanced) { lastWrong = ''; paintStep(practice.index); }
  } else {
    kb.flash(midi, 'good');
    lastWrong = '';
    if (r.result === 'step') { paintStep(r.index); paintStep(practice.index); }
  }
  updateStats();
  if (r.finished) { updateHint(); showDone(); return; }
  if (r.result === 'step' || r.advanced) afterStepChange(); else updateHint();
}

function noteUp(midi, id = midi) {
  audio.noteOff(id);
  kb.setPressed(midi, false);
}

// ---------------------------------------------------------------- keyboard laptop
const CODE_CHAR = { Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']' };
function charOf(code) {
  if (/^Key[A-Z]$/.test(code)) return code[3].toLowerCase();
  if (/^Digit\d$/.test(code)) return code[5];
  return CODE_CHAR[code];
}
const dialogOpen = () => document.querySelector('dialog[open]');

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (dialogOpen()) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) {
      sustainOn = !sustainOn;
      audio.setSustain(sustainOn);
      // Indikator visual sustain pada keyboard container
      $('keyboard').classList.toggle('sustain-on', sustainOn);
      if (sustainOn) toast('Sustain ON', false, 1500);
      else toast('Sustain OFF', false, 1500);
    }
    return;
  }
  if (e.code === 'Escape') { restart(); return; }
  const ch = charOf(e.code);
  if (!ch) return;
  e.preventDefault();
  if (e.repeat) return;
  if (ch === '[') return setShift(shift - 1);
  if (ch === ']') return setShift(shift + 1);
  const midi = M.keyToMidi(ch, shift);
  if (midi === null || held.has(e.code)) return;
  held.set(e.code, midi);
  noteDown(midi, e.code);
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') { e.preventDefault(); return; } // toggle, jadi keyup tidak mengubah state
  const midi = held.get(e.code);
  if (midi === undefined) return;
  held.delete(e.code);
  noteUp(midi, e.code);
});
window.addEventListener('blur', () => {
  for (const [code, midi] of held) noteUp(midi, code);
  held.clear();
  // Sustain toggle tetap aktif saat blur — pengguna harus menekan Space untuk mematikan
});

// ---------------------------------------------------------------- mode dengarkan
const demo = new DemoPlayer(audio, {
  onStep: (step, i) => {
    el.host.querySelectorAll('.cursor.on').forEach((n) => n.classList.remove('on'));
    (stepEls.get(i) || []).forEach((n) => n.classList.contains('cursor') && n.classList.add('on'));
    if (el.auto.checked) ensureWindow(step.midis);
    scrollToStep(i);
  },
  onNoteOn: (m) => kb.setPressed(m, true),
  onNoteOff: (m) => kb.setPressed(m, false),
  onEnd: () => {
    el.listen.textContent = 'Dengarkan';
    el.listen.classList.add('solid');
    el.host.querySelectorAll('.cursor.on').forEach((n) => n.classList.remove('on'));
    for (const k of kb.keys.keys()) kb.setPressed(k, false);
    paintAll();
    updateHint();
  },
});

el.listen.addEventListener('click', () => {
  if (!score) return;
  if (demo.playing) { demo.stop(); return; }
  practice.reset();
  el.done.hidden = true;
  lastWrong = '';
  paintAll();
  updateStats();
  kb.setHints([]);
  el.hint.innerHTML = '<span>Mendengarkan… tekan Dengarkan lagi untuk berhenti.</span>';
  el.listen.textContent = 'Berhenti';
  el.listen.classList.remove('solid');
  el.host.scrollTop = 0;
  demo.play(score.steps, { tempo: score.tempo * (Number(el.speed.value) / 100) });
});

// ---------------------------------------------------------------- daftar pelajaran
function renderLessonList() {
  el.lessons.innerHTML = '';
  el.select.innerHTML = '';
  const addOpt = (value, label, selected) => {
    const o = document.createElement('option');
    o.value = value; o.textContent = label; o.selected = selected;
    el.select.appendChild(o);
  };
  if (fileState) {
    const g = document.createElement('div');
    g.className = 'lesson-group';
    g.innerHTML = '<h3>Sheet kamu</h3>';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lesson-item';
    b.setAttribute('aria-current', source?.kind === 'file' ? 'true' : 'false');
    b.innerHTML = `<span class="lesson-num">♪</span><span><span class="lesson-name"></span><span class="lesson-sum">Dari file</span></span><span></span>`;
    b.querySelector('.lesson-name').textContent = fileState.name;
    b.addEventListener('click', () => rebuildFile());
    g.appendChild(b);
    el.lessons.appendChild(g);
    addOpt('__file', `Sheet: ${fileState.name}`, source?.kind === 'file');
  }
  let n = 0;
  for (const grp of LESSON_GROUPS) {
    const g = document.createElement('div');
    g.className = 'lesson-group';
    g.innerHTML = `<h3>${grp.title}</h3>`;
    for (const l of LESSONS.filter((x) => x.group === grp.id)) {
      n++;
      const done = progress[l.id];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lesson-item' + (done ? ' completed' : '');
      b.setAttribute('aria-current', source?.kind === 'lesson' && source.id === l.id ? 'true' : 'false');
      b.innerHTML = `<span class="lesson-num">${done ? '✓' : n}</span><span><span class="lesson-name"></span><span class="lesson-sum"></span></span><span class="lesson-acc">${done ? done.best + '%' : ''}</span>`;
      b.querySelector('.lesson-name').textContent = l.title;
      b.querySelector('.lesson-sum').textContent = l.summary;
      b.addEventListener('click', () => loadLesson(l.id));
      g.appendChild(b);
      addOpt(l.id, `${n}. ${l.title}`, source?.kind === 'lesson' && source.id === l.id);
    }
    el.lessons.appendChild(g);
  }
}
el.select.addEventListener('change', (e) => {
  if (e.target.value === '__file') rebuildFile(); else loadLesson(e.target.value);
  blurSoon(e);
});

// ---------------------------------------------------------------- membuka file sheet
let fileState = null; // { name, kind, buf?, text?, raw, info, part }

const extOf = (name) => (/\.([^.]+)$/.exec(name)?.[1] || '').toLowerCase();

async function openBuffer(name, buf) {
  const ext = extOf(name);
  try {
    let st;
    if (ext === 'mid' || ext === 'midi') {
      const { raw, info } = parseMidi(buf);
      st = { name, kind: 'midi', buf, raw, info };
    } else if (ext === 'mxl') {
      const xml = await mxlToXmlText(buf);
      st = { name, kind: 'xml', text: xml, raw: parseMusicXML(xml, { part: 0 }), part: 0 };
    } else if (ext === 'musicxml' || ext === 'xml') {
      const xml = new TextDecoder().decode(buf);
      st = { name, kind: 'xml', text: xml, raw: parseMusicXML(xml, { part: 0 }), part: 0 };
    } else if (ext === 'json') {
      st = { name, kind: 'text', raw: parseJSONScore(new TextDecoder().decode(buf)) };
    } else if (ext === 'txt' || ext === 'piano') {
      st = { name, kind: 'text', raw: parseText(new TextDecoder().decode(buf)) };
    } else if (ext === 'pdf' || /^(png|jpe?g|gif|webp)$/.test(ext)) {
      throw new Error('PDF dan gambar belum bisa dibaca. Gunakan MusicXML, MIDI, atau teks.');
    } else {
      throw new Error(`Format .${ext || '?'} tidak dikenali. Gunakan .musicxml, .mxl, .mid, atau .txt.`);
    }
    fileState = st;
    setupSheetOptions();
    rebuildFile();
  } catch (err) {
    console.error(err);
    toast(err.message || 'File tidak bisa dibaca.', true, 6000);
  }
}

function setupSheetOptions() {
  const st = fileState;
  el.sheetOpts.hidden = false;
  el.hands.value = 'both';
  el.melody.checked = false;
  el.hands.closest('label').hidden = !hasBothHands(st.raw);
  el.melody.closest('label').hidden = !hasChords(st.raw);
  el.tracks.innerHTML = '';
  el.tracks.hidden = true;
  if (st.kind === 'midi' && st.info.tracks.filter((t) => t.count).length > 1) {
    el.tracks.hidden = false;
    for (const t of st.info.tracks.filter((x) => x.count)) {
      const lab = document.createElement('label');
      lab.className = 'check';
      lab.innerHTML = `<input type="checkbox" value="${t.index}" checked> <span></span>`;
      lab.querySelector('span').textContent = `${t.name} (${t.count} not)`;
      lab.querySelector('input').addEventListener('change', onSheetOptions);
      el.tracks.appendChild(lab);
    }
  }
  if (st.kind === 'xml') {
    const count = (st.text.match(/<part\s+id=/g) || []).length;
    if (count > 1) {
      el.tracks.hidden = false;
      const names = [...st.text.matchAll(/<score-part\s+id="[^"]*"[^>]*>[\s\S]*?<part-name[^>]*>([^<]*)</g)].map((m) => m[1].trim());
      const sel = document.createElement('select');
      for (let i = 0; i < count; i++) sel.add(new Option(names[i] || `Bagian ${i + 1}`, i));
      sel.addEventListener('change', (e) => { onSheetOptions(e); });
      const lab = document.createElement('label');
      lab.append('Bagian ', sel);
      el.tracks.appendChild(lab);
    }
  }
}

function onSheetOptions(e) {
  if (e?.target?.tagName === 'SELECT' || e?.target?.type === 'checkbox') e.target.blur?.();
  const st = fileState;
  if (!st) return;
  try {
    if (st.kind === 'midi') {
      const picked = [...el.tracks.querySelectorAll('input:checked')].map((i) => Number(i.value));
      if (!el.tracks.hidden && !picked.length) { toast('Pilih minimal satu trek.', true); return; }
      st.raw = parseMidi(st.buf, { tracks: picked }).raw;
    } else if (st.kind === 'xml') {
      const sel = el.tracks.querySelector('select');
      if (sel) st.raw = parseMusicXML(st.text, { part: Number(sel.value) });
    }
    rebuildFile();
  } catch (err) { toast(err.message, true); }
}

function rebuildFile() {
  const st = fileState;
  if (!st) return;
  try {
    const raw = transformRaw(st.raw, { hands: el.hands.value, melody: el.melody.checked });
    const probe = normalizeScore(raw);
    if (probe.steps.length > 1500) toast('Sheet ini panjang. Pilih satu tangan atau "satu nada per langkah" agar lebih ringan.', false, 6000);
    el.sheetOpts.hidden = false;
    loadScore(raw, { kind: 'file', name: st.name, title: raw.title || st.name.replace(/\.[^.]+$/, '') });
    toast(`${probe.steps.length} langkah dimuat dari ${st.name}.`);
  } catch (err) {
    console.error(err);
    toast(err.message || 'Sheet tidak bisa ditampilkan.', true, 6000);
  }
}
el.hands.addEventListener('change', onSheetOptions);
el.melody.addEventListener('change', onSheetOptions);

async function openFileObject(file) {
  openBuffer(file.name, await file.arrayBuffer());
}
el.file.addEventListener('change', () => {
  const f = el.file.files[0];
  if (f) openFileObject(f);
  el.file.value = '';
});
async function openSample(path) {
  try {
    const r = await fetch(path);
    if (!r.ok) throw new Error('Contoh tidak ditemukan.');
    $('dlg-file').close();
    openBuffer(path.split('/').pop(), await r.arrayBuffer());
  } catch (e) { toast(e.message, true); }
}

// seret & lepas
const veil = $('dropveil');
let dragDepth = 0;
window.addEventListener('dragenter', (e) => { if (e.dataTransfer?.types?.includes('Files')) { dragDepth++; veil.hidden = false; } });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) veil.hidden = true; });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0; veil.hidden = true;
  const f = e.dataTransfer?.files?.[0];
  if (f) openFileObject(f);
});

// ---------------------------------------------------------------- kontrol & dialog
$('btn-open').addEventListener('click', () => $('dlg-file').showModal());
$('pick-file').addEventListener('click', () => { $('dlg-file').close(); el.file.click(); });
$('btn-map').addEventListener('click', () => $('dlg-map').showModal());
$('sample-txt').addEventListener('click', () => openSample('samples/twinkle.txt'));
$('sample-xml').addEventListener('click', () => openSample('samples/canon-in-d.musicxml'));
$('sample-mid').addEventListener('click', () => openSample('samples/canon-in-d.mid'));
$('btn-restart').addEventListener('click', restart);
$('btn-again').addEventListener('click', restart);
$('btn-next').addEventListener('click', () => {
  const i = LESSONS.findIndex((l) => l.id === source?.id);
  if (i >= 0 && i < LESSONS.length - 1) loadLesson(LESSONS[i + 1].id);
});
$('oct-down').addEventListener('click', () => setShift(shift - 1));
$('oct-up').addEventListener('click', () => setShift(shift + 1));

el.mode.addEventListener('change', (e) => { practice?.setMode(el.mode.value); store.set('mode', el.mode.value); blurSoon(e); });
el.names.addEventListener('change', (e) => { $('keyboard').dataset.names = el.names.value; store.set('names', el.names.value); blurSoon(e); });
el.showHint.addEventListener('change', (e) => { store.set('hint', el.showHint.checked); updateHint(); blurSoon(e); });
el.auto.addEventListener('change', (e) => { store.set('auto', el.auto.checked); if (el.auto.checked && practice?.current) ensureWindow(practice.current.midis); blurSoon(e); });
el.speed.addEventListener('input', () => { el.speedOut.textContent = `${el.speed.value}%`; store.set('speed', el.speed.value); });
el.vol.addEventListener('input', () => { audio.setVolume(Number(el.vol.value) / 100); store.set('vol', el.vol.value); });
[el.speed, el.vol].forEach((r) => r.addEventListener('change', blurSoon));

let resizeTimer = 0, lastW = 0;
new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const w = el.host.clientWidth;
    if (Math.abs(w - lastW) > 16) { lastW = w; renderSheet(); }
  }, 140);
}).observe(el.host);

// ---------------------------------------------------------------- mulai
function init() {
  el.mode.value = store.get('mode', 'wait');
  el.names.value = store.get('names', 'solfege');
  el.showHint.checked = store.get('hint', true);
  el.auto.checked = store.get('auto', true);
  el.speed.value = store.get('speed', 100);
  el.vol.value = store.get('vol', 80);
  el.speedOut.textContent = `${el.speed.value}%`;
  audio.setVolume(Number(el.vol.value) / 100);
  $('keyboard').dataset.names = el.names.value;
  buildMinimap();
  updateOctaveUI();
  lastW = el.host.clientWidth;
  loadLesson(lessonById(store.get('lesson', '')) ? store.get('lesson') : LESSONS[0].id);
}
init();

// untuk pengujian & debugging di konsol
window.pianoku = {
  get practice() { return practice; },
  get score() { return score; },
  get shift() { return shift; },
  kb, loadLesson, openBuffer,
};
