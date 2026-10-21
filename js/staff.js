// staff.js — merender partitur ternormalisasi menjadi SVG (paranada tunggal atau grand staff).
// Tidak menyentuh DOM: mengembalikan string SVG + metadata, sehingga bisa diuji di Node.
import { keySignatureAccidentals } from './music.js';
import * as G from './glyphs.js';

const EPS = 1e-6;
const f = (n) => Math.round(n * 100) / 100;

const CLEF_REF = { treble: 30, bass: 18 }; // langkah diatonis garis paling bawah (E4 / G2)

// posisi tanda mula pada paranada (dalam setengah-spasi dari garis bawah)
const SIG_POS = {
  treble: { sharp: [8, 5, 9, 6, 3, 7, 4], flat: [4, 7, 3, 6, 2, 5, 1] },
  bass: { sharp: [6, 3, 7, 4, 1, 5, 2], flat: [2, 5, 1, 4, 0, 3, 6] },
};

const colWidth = (dur) => 14 + 20 * Math.log2(4 * dur + 1);

export function renderScore(score, opts = {}) {
  const sp = opts.sp || 10;
  const W = opts.width || 960;
  const marginL = 14, marginR = 14, marginT = 26, marginB = 18;
  const nStaves = score.staves.length;
  const gap = 7 * sp; // jarak antar paranada (grand staff)
  const staffH = 4 * sp;
  const sysH = nStaves * staffH + (nStaves - 1) * gap;
  const padAbove = 4.6 * sp, padBelow = 4.6 * sp;
  const sysSpacing = sysH + padAbove + padBelow + sp;
  const sigCount = Math.abs(score.fifths);
  const clefW = 4.0 * sp;
  const sigW = sigCount ? sigCount * 1.15 * sp + 0.8 * sp : 0;
  const timeW = 3 * sp;

  // ---- 1. kelompokkan ke dalam birama & kolom -----------------------------
  const bars = [];
  for (let m = 0; m < score.totalBars; m++) {
    const t0 = m * score.barLen;
    const colsMap = new Map();
    score.staves.forEach((st, si) => {
      st.events.forEach((ev) => {
        if (ev.start < t0 - EPS || ev.start >= t0 + score.barLen - EPS) return;
        const k = Math.round(ev.start * 1000);
        if (!colsMap.has(k)) colsMap.set(k, { start: ev.start, minDur: Infinity, events: [], hasAcc: false, step: -1 });
        const c = colsMap.get(k);
        c.events.push(ev);
        c.minDur = Math.min(c.minDur, ev.dur);
      });
    });
    const cols = [...colsMap.values()].sort((a, b) => a.start - b.start);
    bars.push({ index: m, t0, cols });
  }

  // ---- 2. aksidental per staff/birama (menentukan lebar kolom) -------------
  const sig = keySignatureAccidentals(score.fifths);
  const accOf = new Map(); // note object -> 'sharp'|'flat'|'natural'
  score.staves.forEach((st) => {
    for (const bar of bars) {
      const state = {};
      const evs = st.events.filter((e) => e.start >= bar.t0 - EPS && e.start < bar.t0 + score.barLen - EPS);
      for (const ev of evs) {
        if (ev.rest) continue;
        for (const n of ev.notes) {
          const eff = state[n.step] ?? (sig[n.letter] || 0);
          if (n.accVal !== eff) {
            if (!ev.tiedFrom) accOf.set(n, n.accVal > 0 ? 'sharp' : n.accVal < 0 ? 'flat' : 'natural');
            state[n.step] = n.accVal;
          }
        }
      }
    }
  });
  const colHasAcc = (c) => c.events.some((e) => !e.rest && e.notes.some((n) => accOf.has(n)));
  const accSpace = 1.9 * sp;

  for (const bar of bars) {
    for (const c of bar.cols) {
      c.hasAcc = colHasAcc(c);
      c.w = colWidth(c.minDur) + (c.hasAcc ? accSpace : 0);
    }
    bar.padL = 1.0 * sp;
    bar.padR = 0.6 * sp;
    bar.natW = bar.padL + bar.padR + bar.cols.reduce((s, c) => s + c.w, 0);
  }

  // ---- 3. bagi ke dalam sistem (baris) ------------------------------------
  const systems = [];
  let cur = null;
  const headW = (first) => clefW + sigW + (first ? timeW : 0);
  for (const bar of bars) {
    const avail = W - marginL - marginR;
    if (!cur) cur = { bars: [], first: systems.length === 0, used: 0 };
    const need = bar.natW;
    if (cur.bars.length && headW(cur.first) + cur.used + need > avail) {
      systems.push(cur);
      cur = { bars: [], first: false, used: 0 };
    }
    cur.bars.push(bar);
    cur.used += need;
  }
  if (cur && cur.bars.length) systems.push(cur);

  // ---- 4. render ----------------------------------------------------------
  const out = [];
  const stepMeta = new Array(score.steps.length).fill(null);
  const sysMeta = [];
  const stepCursor = [];
  const H = marginT + systems.length * sysSpacing + marginB - sp;

  systems.forEach((sys, sIdx) => {
    const yTop0 = marginT + sIdx * sysSpacing + padAbove; // atas paranada pertama
    const staffTop = (si) => yTop0 + si * (staffH + gap);
    const sysBottom = staffTop(nStaves - 1) + staffH;
    sysMeta.push({ top: yTop0 - padAbove, bottom: sysBottom + padBelow, y: yTop0 });

    const avail = W - marginL - marginR - headW(sys.first);
    const isLast = sIdx === systems.length - 1;
    let stretch = avail / sys.used;
    if (isLast && stretch > 1.3) stretch = 1.0;
    stretch = Math.min(stretch, 1.9);
    const xStart = marginL + headW(sys.first);

    // garis paranada
    const xEnd = isLast && stretch === 1.0 ? xStart + sys.used + 4 : W - marginR;
    score.staves.forEach((st, si) => {
      const t = staffTop(si);
      for (let i = 0; i < 5; i++) out.push(`<line class="sl" x1="${marginL}" x2="${f(xEnd)}" y1="${t + i * sp}" y2="${t + i * sp}"/>`);
    });
    // garis pembuka & kurung
    out.push(`<line class="bl" x1="${marginL}" x2="${marginL}" y1="${staffTop(0)}" y2="${sysBottom}"/>`);
    if (nStaves > 1) {
      const y1 = staffTop(0), h = sysBottom - y1, bx = marginL - 4;
      out.push(`<path class="brace" d="M ${bx + 3},${y1} C ${bx - 9},${y1 + h * 0.12} ${bx + 1},${y1 + h * 0.4} ${bx - 8},${y1 + h * 0.5} C ${bx + 1},${y1 + h * 0.6} ${bx - 9},${y1 + h * 0.88} ${bx + 3},${y1 + h}"/>`);
    }
    // kunci, tanda mula, tanda birama
    score.staves.forEach((st, si) => {
      const t = staffTop(si);
      if (st.clef === 'bass') out.push(G.bass(marginL + 0.9 * sp, t + sp, sp));
      else out.push(G.treble(marginL + 1.3 * sp, t + 3 * sp, sp));
      if (sigCount) {
        const kind = score.fifths > 0 ? 'sharp' : 'flat';
        const pos = SIG_POS[st.clef][kind];
        for (let i = 0; i < sigCount; i++) {
          const y = t + staffH - pos[i] * (sp / 2);
          out.push(G.accidental(kind, marginL + clefW + 0.7 * sp + i * 1.15 * sp, y, sp));
        }
      }
      if (sys.first) {
        const tx = marginL + clefW + sigW + 1.0 * sp;
        out.push(`<text class="ts" x="${f(tx)}" y="${f(t + 2 * sp - 0.2 * sp)}" font-size="${f(2.7 * sp)}" text-anchor="middle">${score.num}</text>`);
        out.push(`<text class="ts" x="${f(tx)}" y="${f(t + 4 * sp - 0.2 * sp)}" font-size="${f(2.7 * sp)}" text-anchor="middle">${score.den}</text>`);
      }
    });

    // birama
    let bx = xStart;
    sys.bars.forEach((bar, bi) => {
      const bw = bar.natW * stretch;
      let cx = bx + bar.padL * stretch;
      for (const c of bar.cols) {
        const cw = c.w * stretch;
        c.x = cx + (c.hasAcc ? accSpace : 0) + (cw - (c.hasAcc ? accSpace : 0)) / 2 - 0.0 * sp;
        // posisi kepala not: agak ke kiri-tengah kolom agar ada ruang ke kanan
        c.x = cx + (c.hasAcc ? accSpace : 0) + Math.min(cw - (c.hasAcc ? accSpace : 0), 3.2 * sp) * 0.3 + 0.6 * sp;
        cx += cw;
      }
      bar.x0 = bx; bar.x1 = bx + bw;
      // garis birama
      const last = bar.index === score.totalBars - 1;
      if (last) {
        out.push(`<line class="bl" x1="${f(bx + bw - 4)}" x2="${f(bx + bw - 4)}" y1="${staffTop(0)}" y2="${sysBottom}"/>`);
        out.push(`<line class="bl thick" x1="${f(bx + bw)}" x2="${f(bx + bw)}" y1="${staffTop(0)}" y2="${sysBottom}"/>`);
      } else {
        out.push(`<line class="bl" x1="${f(bx + bw)}" x2="${f(bx + bw)}" y1="${staffTop(0)}" y2="${sysBottom}"/>`);
      }
      // nomor birama pada awal sistem
      if (bi === 0) out.push(`<text class="barno" x="${f(bx + 2)}" y="${f(yTop0 - 1.6 * sp)}" font-size="${f(1.1 * sp)}">${bar.index + 1}</text>`);

      // kursor (sorotan kolom) untuk setiap langkah
      for (const c of bar.cols) {
        const stepIdxs = new Set();
        c.events.forEach((e) => { if (!e.rest && !e.tiedFrom && e.stepIndex >= 0) stepIdxs.add(e.stepIndex); });
        for (const si2 of stepIdxs) {
          out.push(`<rect class="cursor" data-step="${si2}" x="${f(c.x - 1.4 * sp)}" y="${f(yTop0 - 1.6 * sp)}" width="${f(2.8 * sp)}" height="${f(sysBottom - yTop0 + 3.2 * sp)}" rx="${sp * 0.5}"/>`);
          stepMeta[si2] = { system: sIdx, x: c.x, bar: bar.index };
        }
      }

      // not & rest tiap paranada
      score.staves.forEach((st, si) => {
        renderStaffBar(out, st, si, bar, staffTop(si), sp, score, accOf);
      });
      bx += bw;
    });
  });

  const svg =
    `<svg class="score" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${f(H)}" width="${W}" height="${f(H)}" role="img" aria-label="${(score.title || 'Partitur').replace(/"/g, '')}">` +
    out.join('') + '</svg>';
  return { svg, width: W, height: H, systems: sysMeta, steps: stepMeta };
}

// ---------------------------------------------------------------------------

function relOf(note, clef) { return note.step - CLEF_REF[clef]; }
const yOfRel = (rel, top, sp) => top + 4 * sp - rel * (sp / 2);
const typeOf = (dur) => {
  if (dur >= 4) return { head: 'whole', stem: false, flags: 0, dots: 0 };
  if (dur === 3) return { head: 'half', stem: true, flags: 0, dots: 1 };
  if (dur >= 2) return { head: 'half', stem: true, flags: 0, dots: 0 };
  if (dur === 1.5) return { head: 'quarter', stem: true, flags: 0, dots: 1 };
  if (dur >= 1) return { head: 'quarter', stem: true, flags: 0, dots: 0 };
  if (dur === 0.75) return { head: 'quarter', stem: true, flags: 1, dots: 1 };
  if (dur >= 0.5) return { head: 'quarter', stem: true, flags: 1, dots: 0 };
  if (dur === 0.375) return { head: 'quarter', stem: true, flags: 2, dots: 1 };
  return { head: 'quarter', stem: true, flags: 2, dots: 0 };
};

function beatLenOf(score) {
  if (score.den === 8 && score.num % 3 === 0) return 1.5;
  if (score.den === 2) return 2;
  return 1;
}

function renderStaffBar(out, st, si, bar, top, sp, score, accOf) {
  const clef = st.clef;
  const rx = 0.66 * sp, ry = 0.47 * sp;
  const evs = st.events.filter((e) => e.start >= bar.t0 - EPS && e.start < bar.t0 + score.barLen - EPS);
  const colOf = (ev) => bar.cols.find((c) => Math.abs(c.start - ev.start) < EPS);
  const beatLen = beatLenOf(score);

  // rest
  for (const ev of evs) {
    if (!ev.rest) continue;
    const c = colOf(ev);
    const x = ev.dur >= score.barLen - EPS ? (bar.x0 + bar.x1) / 2 : c.x;
    out.push(`<g class="rest">${G.rest(ev.dur, x, top, sp)}</g>`);
  }

  // info stem / arah per event
  const info = new Map();
  for (const ev of evs) {
    if (ev.rest) continue;
    const c = colOf(ev);
    const rels = ev.notes.map((n) => relOf(n, clef));
    const lo = Math.min(...rels), hi = Math.max(...rels);
    const avg = (lo + hi) / 2;
    info.set(ev, { c, rels, lo, hi, t: typeOf(ev.dur), up: avg < 4, x: c.x });
  }

  // kelompok balok
  const groups = [];
  let g = null;
  for (const ev of evs) {
    if (ev.rest) { g = null; continue; }
    const t = info.get(ev).t;
    const beam = t.flags > 0;
    const beat = Math.floor((ev.start - bar.t0) / beatLen + EPS);
    if (beam && g && g.beat === beat) g.evs.push(ev);
    else if (beam) { g = { beat, evs: [ev] }; groups.push(g); }
    else g = null;
  }
  const beamed = new Set();
  for (const gr of groups) {
    if (gr.evs.length < 2) continue;
    gr.evs.forEach((e) => beamed.add(e));
    // arah bersama: ditentukan oleh not terjauh dari garis tengah
    let far = 0;
    for (const e of gr.evs) { const i = info.get(e); const d = Math.abs(i.lo - 4) > Math.abs(i.hi - 4) ? i.lo - 4 : i.hi - 4; if (Math.abs(d) > Math.abs(far)) far = d; }
    const up = far < 0 || (far === 0 && info.get(gr.evs[0]).up);
    gr.up = up;
    gr.evs.forEach((e) => { info.get(e).up = up; });
  }

  // geometri stem per event
  const geo = new Map();
  for (const ev of evs) {
    if (ev.rest) continue;
    const i = info.get(ev);
    const stemX = i.up ? i.x + rx - 0.6 : i.x - rx + 0.6;
    const yHi = yOfRel(i.hi, top, sp), yLo = yOfRel(i.lo, top, sp);
    geo.set(ev, { stemX, yHi, yLo });
  }

  // balok
  const beamSvg = [];
  for (const gr of groups) {
    if (gr.evs.length < 2) continue;
    const up = gr.up;
    const e0 = gr.evs[0], e1 = gr.evs[gr.evs.length - 1];
    const x0 = geo.get(e0).stemX, x1 = geo.get(e1).stemX;
    const tip = (e) => (up ? geo.get(e).yHi - 3.5 * sp : geo.get(e).yLo + 3.5 * sp);
    let ya = tip(e0), yb = tip(e1);
    const maxSlope = 1.6 * sp;
    if (Math.abs(yb - ya) > maxSlope) { const mid = (ya + yb) / 2; const s = Math.sign(yb - ya); ya = mid - (s * maxSlope) / 2; yb = mid + (s * maxSlope) / 2; }
    const lineY = (x) => (x1 === x0 ? ya : ya + ((yb - ya) * (x - x0)) / (x1 - x0));
    let shift = 0;
    for (const e of gr.evs) {
      const gx = geo.get(e).stemX;
      const minLen = 2.7 * sp;
      if (up) { const need = geo.get(e).yHi - minLen - lineY(gx); if (need < shift) shift = need; }
      else { const need = geo.get(e).yLo + minLen - lineY(gx); if (need > shift) shift = need; }
    }
    ya += shift; yb += shift;
    const lineAt = (x) => (x1 === x0 ? ya : ya + ((yb - ya) * (x - x0)) / (x1 - x0));
    gr.lineAt = lineAt;
    const th = 0.5 * sp, dir = up ? 1 : -1;
    const poly = (xa, xb, off) => {
      const y1a = lineAt(xa) + dir * off, y1b = lineAt(xb) + dir * off;
      const pts = up
        ? [[xa, y1a], [xb, y1b], [xb, y1b + th], [xa, y1a + th]]
        : [[xa, y1a - th], [xb, y1b - th], [xb, y1b], [xa, y1a]];
      return `<polygon points="${pts.map((p) => f(p[0]) + ',' + f(p[1])).join(' ')}"/>`;
    };
    beamSvg.push(poly(x0 - 0.5, x1 + 0.5, 0));
    // balok kedua (16): pasangan berdekatan yang sama-sama <= 1/4
    for (let k = 0; k < gr.evs.length; k++) {
      const e = gr.evs[k];
      if (info.get(e).t.flags < 2) continue;
      const nxt = gr.evs[k + 1], prv = gr.evs[k - 1];
      if (nxt && info.get(nxt).t.flags >= 2) beamSvg.push(poly(geo.get(e).stemX, geo.get(nxt).stemX, dir * 0.8 * sp));
      else if (!(prv && info.get(prv).t.flags >= 2)) {
        const sx = geo.get(e).stemX;
        const side = nxt ? 1 : -1;
        beamSvg.push(poly(Math.min(sx, sx + side * 1.1 * sp), Math.max(sx, sx + side * 1.1 * sp), dir * 0.8 * sp));
      }
    }
  }

  // gambar not
  for (const ev of evs) {
    if (ev.rest) continue;
    const i = info.get(ev), gm = geo.get(ev);
    const stepIdx = ev.stepIndex;
    const parts = [];
    // garis bantu
    const ledgerW = rx * 2 + 0.9 * sp;
    const ledgers = new Set();
    for (const r of i.rels) {
      for (let k = -2; k >= r; k -= 2) ledgers.add(k);
      for (let k = 10; k <= r; k += 2) ledgers.add(k);
    }
    for (const k of ledgers) {
      const y = yOfRel(k, top, sp);
      parts.push(`<line class="ledger" x1="${f(i.x - ledgerW / 2)}" x2="${f(i.x + ledgerW / 2)}" y1="${f(y)}" y2="${f(y)}"/>`);
    }
    // kepala not: sisi bergeser pada interval kedua
    const order = ev.notes.map((n, idx) => ({ n, rel: i.rels[idx] })).sort((a, b) => a.rel - b.rel);
    const flipped = new Set();
    if (i.up) {
      for (let k = 1; k < order.length; k++) if (order[k].rel - order[k - 1].rel === 1 && !flipped.has(order[k - 1])) flipped.add(order[k]);
    } else {
      for (let k = order.length - 2; k >= 0; k--) if (order[k + 1].rel - order[k].rel === 1 && !flipped.has(order[k + 1])) flipped.add(order[k]);
    }
    const accList = [];
    for (const o of order) {
      const y = yOfRel(o.rel, top, sp);
      const hx = flipped.has(o) ? i.x + (i.up ? 2 * rx - 1.2 : -(2 * rx - 1.2)) : i.x;
      const hollow = i.t.head !== 'quarter';
      if (i.t.head === 'whole') {
        parts.push(`<ellipse class="head" cx="${f(hx)}" cy="${f(y)}" rx="${f(rx * 1.12)}" ry="${f(ry * 1.08)}"/>`);
        parts.push(`<ellipse class="hole" cx="${f(hx)}" cy="${f(y)}" rx="${f(rx * 0.5)}" ry="${f(ry * 0.85)}" transform="rotate(-40 ${f(hx)} ${f(y)})"/>`);
      } else {
        parts.push(`<ellipse class="head${hollow ? ' hollow' : ''}" cx="${f(hx)}" cy="${f(y)}" rx="${f(rx)}" ry="${f(ry)}" transform="rotate(-22 ${f(hx)} ${f(y)})" stroke-width="${hollow ? f(sp * 0.22) : 0}"/>`);
      }
      const acc = accOf.get(o.n);
      if (acc) accList.push({ kind: acc, y });
      if (i.t.dots) {
        const dy = o.rel % 2 === 0 ? y - sp * 0.5 : y;
        parts.push(`<circle class="dot" cx="${f(hx + rx + 0.55 * sp)}" cy="${f(dy)}" r="${f(sp * 0.18)}"/>`);
      }
    }
    // aksidental (susun mundur agar tidak bertabrakan)
    accList.sort((a, b) => a.y - b.y);
    let lastY = -1e9, col = 0;
    for (const a of accList) {
      if (a.y - lastY < 2.4 * sp) col++; else col = 0;
      parts.push(G.accidental(a.kind, i.x - rx - 1.0 * sp - col * 1.1 * sp, a.y, sp));
      lastY = a.y;
    }
    // batang
    if (i.t.stem) {
      const inBeam = beamed.has(ev);
      let yEnd;
      if (inBeam) {
        const gr = groups.find((q) => q.evs.includes(ev));
        yEnd = gr.lineAt(gm.stemX) + (i.up ? 0.4 : -0.4) * sp;
      } else {
        const tipRel = i.up ? Math.max(i.hi + 7, 4) : Math.min(i.lo - 7, 4);
        yEnd = yOfRel(tipRel, top, sp);
        if (i.t.flags >= 2) yEnd += (i.up ? -1 : 1) * 0.9 * sp;
      }
      const yStart = i.up ? gm.yLo : gm.yHi;
      parts.push(`<line class="stem" x1="${f(gm.stemX)}" x2="${f(gm.stemX)}" y1="${f(yStart)}" y2="${f(yEnd)}"/>`);
      if (!inBeam && i.t.flags > 0) parts.push(G.flag(i.up, gm.stemX, yEnd, sp, i.t.flags));
    }
    out.push(`<g class="nt" data-step="${stepIdx}" data-id="${ev.id}">${parts.join('')}</g>`);
  }
  if (beamSvg.length) out.push(`<g class="beams">${beamSvg.join('')}</g>`);

  // ikatan (tie)
  evs.forEach((ev) => {
    if (ev.rest || !ev.tie) return;
    const i = info.get(ev);
    const idx = st.events.indexOf(ev);
    const nx = st.events[idx + 1];
    const ni = nx && info.get(nx);
    const x1 = i.x + rx;
    const x2 = ni ? ni.x - rx : x1 + 3 * sp;
    ev.notes.forEach((n) => {
      const y = yOfRel(relOf(n, clef), top, sp);
      const below = i.up;
      const y0 = y + (below ? 0.6 : -0.6) * sp, h = (below ? 1 : -1) * 0.9 * sp;
      out.push(`<path class="tie" d="M ${f(x1)},${f(y0)} Q ${f((x1 + x2) / 2)},${f(y0 + h * 1.6)} ${f(x2)},${f(y0)}"/>`);
    });
  });
}
