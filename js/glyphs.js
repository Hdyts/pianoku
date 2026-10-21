// glyphs.js — simbol notasi musik digambar sebagai path SVG (tanpa font eksternal).
// Semua koordinat dalam satuan "spasi paranada" (sp). Pemanggil memakai
// transform="translate(x y) scale(sp)".

export const GLYPH = {
  // Kunci G. Titik asal (0,0) = garis G (garis ke-2 dari bawah).
  treble: {
    stroke:
      'M -0.55,2.55 C -0.55,3.55 0.85,3.7 0.9,2.55 C 0.95,1.3 0.2,0.6 -0.1,-0.9 ' +
      'C -0.45,-2.7 -0.25,-4.4 0.55,-5.0 C 1.15,-5.35 1.55,-4.5 1.4,-3.6 ' +
      'C 1.2,-2.4 0.2,-1.3 -0.6,-0.4 C -1.6,0.7 -1.2,2.0 0.0,2.0 ' +
      'C 1.2,2.0 1.8,0.9 1.3,0.1 C 0.8,-0.7 -0.3,-0.4 -0.35,0.4 C -0.38,1.0 0.3,1.3 0.65,0.9',
    width: 0.2,
    ball: [-0.55, 2.55, 0.0],
  },
  // Kunci F. Titik asal (0,0) = garis F (garis ke-4 dari bawah).
  bass: {
    stroke:
      'M -0.1,-0.05 C 0.5,-0.9 2.0,-0.9 2.0,0.55 C 2.0,1.9 1.0,2.8 -0.7,3.4',
    width: 0.26,
    dots: [[2.55, -0.5], [2.55, 0.5]],
    head: [0.0, 0.0, 0.42],
  },
  sharp: {
    lines: [[-0.25, -1.3, -0.25, 1.35], [0.25, -1.55, 0.25, 1.1]],
    bars: [[-0.6, 0.35, 0.6, -0.05], [-0.6, 1.0, 0.6, 0.6]],
  },
  flat: {
    stroke: 'M -0.35,-2.0 L -0.35,0.75 C 0.2,0.5 0.8,0.0 0.8,-0.55 C 0.8,-1.3 -0.1,-1.2 -0.35,-0.5',
  },
  natural: {
    lines: [[-0.3, -1.3, -0.3, 0.55], [0.3, -0.55, 0.3, 1.3]],
    bars: [[-0.3, -0.35, 0.3, -0.6], [-0.3, 0.75, 0.3, 0.5]],
  },
  restQuarter: 'M -0.3,-1.45 L 0.4,-0.55 L -0.3,0.35 L 0.3,1.05 C -0.5,0.9 -0.6,1.7 0.15,1.85',
  restEighth: { dots: [[-0.4, -0.35, 0.3]], stroke: 'M 0.55,-0.7 C 0.15,-0.2 -0.3,-0.15 -0.5,-0.35 M 0.55,-0.7 L -0.25,1.35' },
  restSixteenth: {
    dots: [[-0.35, -0.7, 0.28], [-0.6, 0.3, 0.28]],
    stroke: 'M 0.7,-1.05 C 0.3,-0.55 -0.1,-0.5 -0.3,-0.7 M 0.45,-0.1 C 0.05,0.4 -0.35,0.45 -0.55,0.25 M 0.7,-1.05 L -0.45,1.7',
  },
  // bendera: ujung batang di (0,0); 'up' = batang ke atas (bendera ke bawah-kanan)
  flagUp: 'M 0,0 C 0.15,0.9 1.35,1.35 1.15,3.05 C 1.2,1.6 0.35,1.1 0,1.1 Z',
  flagDown: 'M 0,0 C 0.15,-0.9 1.35,-1.35 1.15,-3.05 C 1.2,-1.6 0.35,-1.1 0,-1.1 Z',
};

const f = (n) => Math.round(n * 1000) / 1000;

// Mengembalikan string SVG (di dalam <g transform=...>) untuk simbol.
export function treble(x, y, sp) {
  const g = GLYPH.treble;
  return `<g class="glyph" transform="translate(${f(x)} ${f(y)}) scale(${sp})">` +
    `<path d="${g.stroke}" fill="none" stroke="currentColor" stroke-width="${g.width}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="${g.ball[0]}" cy="${g.ball[1]}" r="0.25" fill="currentColor"/></g>`;
}

export function bass(x, y, sp) {
  const g = GLYPH.bass;
  return `<g class="glyph" transform="translate(${f(x)} ${f(y)}) scale(${sp})">` +
    `<path d="${g.stroke}" fill="none" stroke="currentColor" stroke-width="${g.width}" stroke-linecap="round"/>` +
    `<circle cx="${g.head[0]}" cy="${g.head[1]}" r="${g.head[2]}" fill="currentColor"/>` +
    g.dots.map(([dx, dy]) => `<circle cx="${dx}" cy="${dy}" r="0.2" fill="currentColor"/>`).join('') +
    `</g>`;
}

// Aksidental di (x, y): y = pusat vertikal kepala not.
export function accidental(kind, x, y, sp) {
  const open = `<g class="glyph acc" transform="translate(${f(x)} ${f(y)}) scale(${sp})" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">`;
  if (kind === 'flat') {
    return open + `<path d="${GLYPH.flat.stroke}" stroke-width="0.14"/></g>`;
  }
  const g = kind === 'sharp' ? GLYPH.sharp : GLYPH.natural;
  const lines = g.lines.map(([a, b, c, d]) => `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke-width="0.1"/>`).join('');
  const bars = g.bars.map(([a, b, c, d]) => `<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke-width="0.26"/>`).join('');
  return open + lines + bars + '</g>';
}

// Rest. (x, yTop): yTop = garis paling atas paranada.
export function rest(dur, x, yTop, sp) {
  const base = dur >= 4 || dur === 3 ? 'whole' : dur >= 2 ? 'half' : dur >= 1 ? 'quarter' : dur >= 0.5 ? 'eighth' : 'sixteenth';
  let body;
  if (base === 'whole') {
    body = `<rect x="${f(x - 0.7 * sp)}" y="${f(yTop + sp)}" width="${f(1.4 * sp)}" height="${f(0.5 * sp)}" fill="currentColor"/>`;
  } else if (base === 'half') {
    body = `<rect x="${f(x - 0.7 * sp)}" y="${f(yTop + 1.5 * sp)}" width="${f(1.4 * sp)}" height="${f(0.5 * sp)}" fill="currentColor"/>`;
  } else {
    const cy = yTop + 2 * sp;
    let inner;
    if (base === 'quarter') {
      inner = `<path d="${GLYPH.restQuarter}" fill="none" stroke="currentColor" stroke-width="0.28" stroke-linecap="round" stroke-linejoin="round"/>`;
    } else {
      const g = base === 'eighth' ? GLYPH.restEighth : GLYPH.restSixteenth;
      inner = g.dots.map(([dx, dy, r]) => `<circle cx="${dx}" cy="${dy}" r="${r}" fill="currentColor"/>`).join('') +
        `<path d="${g.stroke}" fill="none" stroke="currentColor" stroke-width="0.2" stroke-linecap="round"/>`;
    }
    body = `<g transform="translate(${f(x)} ${f(cy)}) scale(${sp})">${inner}</g>`;
  }
  return body;
}

export function flag(dirUp, x, y, sp, count = 1) {
  let out = '';
  for (let i = 0; i < count; i++) {
    const dy = dirUp ? i * 0.95 : -i * 0.95;
    out += `<path d="${dirUp ? GLYPH.flagUp : GLYPH.flagDown}" transform="translate(${f(x)} ${f(y + dy * sp)}) scale(${sp})" fill="currentColor"/>`;
  }
  return out;
}
