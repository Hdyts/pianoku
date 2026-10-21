import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keyToMidi } from '../js/music.js';
import { LESSONS } from '../js/lessons.js';
import { normalizeScore } from '../js/score.js';
import { renderScore } from '../js/staff.js';
import { Practice } from '../js/practice.js';
import { parseMidi } from '../js/parse-midi.js';
import { parseText } from '../js/parse-text.js';

test('pemetaan tuts putih dan hitam', () => {
  const white = 'qwertyuiopzxcvbnm,./'.split('');
  const offs = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24, 26, 28, 29, 31, 33];
  white.forEach((k, i) => assert.equal(keyToMidi(k), 60 + offs[i], k));
  const black = ['2', '3', '5', '6', '7', '9', '0', 's', 'd', 'f', 'h', 'j', 'l', ';', "'"];
  const bo = [1, 3, 6, 8, 10, 13, 15, 18, 20, 22, 25, 27, 30, 32, 34];
  black.forEach((k, i) => assert.equal(keyToMidi(k), 60 + bo[i], k));
  assert.equal(keyToMidi('q', 1), 72);
  assert.equal(keyToMidi('q', -1), 48);
});

test('semua pelajaran bisa dinormalisasi dan dirender', () => {
  for (const l of LESSONS) {
    const sc = normalizeScore(l.raw);
    assert.ok(sc.steps.length > 0, l.id);
    assert.ok(renderScore(sc, { width: 900 }).svg.includes('<svg'), l.id);
  }
});

test('nada salah menandai merah dan tetap merah setelah diperbaiki', () => {
  const p = new Practice(normalizeScore(LESSONS[0].raw).steps);
  assert.equal(p.press(60).result, 'step');
  assert.equal(p.press(65).result, 'bad'); // seharusnya D4 (62)
  assert.equal(p.status[1], 'bad');
  assert.equal(p.index, 1);
  assert.equal(p.press(62).result, 'step');
  assert.equal(p.status[1], 'bad');
  assert.equal(p.index, 2);
});

test('mode lanjut: nada salah langsung maju', () => {
  const p = new Practice(normalizeScore(LESSONS[0].raw).steps, { mode: 'continue' });
  p.press(60);
  const r = p.press(70);
  assert.equal(r.result, 'bad');
  assert.equal(p.index, 2);
});

test('akor dua tangan butuh dua nada', () => {
  const sc = normalizeScore(LESSONS.find((l) => l.id === 'canon-2tangan').raw);
  const p = new Practice(sc.steps);
  assert.equal(sc.steps[0].midis.length, 2);
  assert.equal(p.press(sc.steps[0].midis[0]).result, 'good');
  assert.equal(p.press(sc.steps[0].midis[1]).result, 'step');
});

test('sampel MIDI dan teks terbaca', () => {
  const b = readFileSync(new URL('../samples/canon-in-d.mid', import.meta.url));
  const { raw } = parseMidi(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  assert.equal(raw.fifths, 2);
  assert.equal(raw.tempo, 66);
  assert.equal(normalizeScore(raw).totalBars, 13);
  const t = parseText(readFileSync(new URL('../samples/twinkle.txt', import.meta.url), 'utf8'));
  assert.equal(normalizeScore(t).totalBars, 13);
});
