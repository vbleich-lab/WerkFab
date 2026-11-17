// Point clouds: reading XYZ / TXT / CSV / PTS / ASC and PLY (ASCII or binary) files, the box around the points
// and a grid of heights for a fitted freeform surface. Points are kept as a flat array [x0, y0, z0, x1, …].

const MAX_POINTS = 500000;

// text: one point per line, numbers split by blanks, commas or semicolons; lines that do not start with three
// numbers (headers, the point count of a PTS file) are skipped
function parseText(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim().split(/[\s,;]+/);
    if (t.length < 3) continue;
    const x = +t[0], y = +t[1], z = +t[2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    out.push(x, y, z);
    if (out.length >= MAX_POINTS * 3) break;
  }
  return out;
}

function parsePLY(buf) {
  const u8 = new Uint8Array(buf);
  const head = new TextDecoder().decode(u8.subarray(0, Math.min(u8.length, 4096)));
  const end = head.indexOf('end_header');
  if (end < 0) throw new Error('PLY-Datei ohne Kopf');
  const lines = head.slice(0, end).split(/\r?\n/);
  const format = (lines.find(l => l.startsWith('format')) || '').split(/\s+/)[1];
  let nv = 0, props = [], inVertex = false;
  for (const l of lines) {
    const t = l.trim().split(/\s+/);
    if (t[0] === 'element') { inVertex = t[1] === 'vertex'; if (inVertex) nv = +t[2]; }
    else if (t[0] === 'property' && inVertex && t[1] !== 'list') props.push({ type: t[1], name: t[2] });
  }
  const ix = props.findIndex(p => p.name === 'x'), iy = props.findIndex(p => p.name === 'y'), iz = props.findIndex(p => p.name === 'z');
  if (ix < 0 || iy < 0 || iz < 0 || !nv) throw new Error('PLY-Datei ohne Punkte');
  let off = end + 'end_header'.length;
  while (u8[off] === 13 || u8[off] === 10) off++;
  const n = Math.min(nv, MAX_POINTS), out = new Array(n * 3);
  if (format === 'ascii') {
    const rows = new TextDecoder().decode(u8.subarray(off)).split(/\r?\n/);
    for (let i = 0; i < n; i++) { const t = rows[i].trim().split(/\s+/); out[i * 3] = +t[ix]; out[i * 3 + 1] = +t[iy]; out[i * 3 + 2] = +t[iz]; }
    return out;
  }
  const size = { char: 1, uchar: 1, int8: 1, uint8: 1, short: 2, ushort: 2, int16: 2, uint16: 2, int: 4, uint: 4, int32: 4, uint32: 4, float: 4, float32: 4, double: 8, float64: 8 };
  const little = format === 'binary_little_endian', dv = new DataView(buf, off);
  const read = (type, at) => {
    switch (type) {
      case 'float': case 'float32': return dv.getFloat32(at, little);
      case 'double': case 'float64': return dv.getFloat64(at, little);
      case 'int': case 'int32': return dv.getInt32(at, little);
      case 'uint': case 'uint32': return dv.getUint32(at, little);
      case 'short': case 'int16': return dv.getInt16(at, little);
      case 'ushort': case 'uint16': return dv.getUint16(at, little);
      case 'char': case 'int8': return dv.getInt8(at);
      default: return dv.getUint8(at);
    }
  };
  const at = [];
  let stride = 0;
  for (const p of props) { at.push(stride); stride += size[p.type] || 4; }
  for (let i = 0; i < n; i++) {
    const base = i * stride;
    out[i * 3] = read(props[ix].type, base + at[ix]); out[i * 3 + 1] = read(props[iy].type, base + at[iy]); out[i * 3 + 2] = read(props[iz].type, base + at[iz]);
  }
  return out;
}

/** The points of a file: ArrayBuffer and file name → flat array [x, y, z, …]. */
export function parsePointCloud(buf, name = '') {
  const ext = name.toLowerCase().split('.').pop();
  const pts = ext === 'ply' ? parsePLY(buf) : parseText(new TextDecoder().decode(new Uint8Array(buf)));
  if (pts.length < 3) throw new Error('Keine Punkte in der Datei gefunden');
  return pts.map(v => +(+v).toFixed(5));
}

export function cloudBounds(pts) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pts.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], pts[i + k]); hi[k] = Math.max(hi[k], pts[i + k]); }
  return { lo, hi };
}

/**
 * A grid of heights over the points (seen from above, Z up): nx × ny cells, the mean height of the points in
 * each cell; empty cells take the mean of their filled neighbours. → { x, y, w, d, base, heights } as a
 * freeform surface step takes it.
 */
export function cloudHeights(pts, nx = 6, ny = 6, below = 2) {
  const { lo, hi } = cloudBounds(pts);
  const w = hi[0] - lo[0], d = hi[1] - lo[1];
  if (!(w > 0 && d > 0)) throw new Error('Die Punkte liegen auf einer Linie');
  const sum = Array.from({ length: ny }, () => new Array(nx).fill(0)), cnt = Array.from({ length: ny }, () => new Array(nx).fill(0));
  for (let i = 0; i < pts.length; i += 3) {
    // the grid points sit on the edges of the box: each point counts to the nearest one
    const ci = Math.round(((pts[i] - lo[0]) / w) * (nx - 1)), cj = Math.round(((pts[i + 1] - lo[1]) / d) * (ny - 1));
    sum[cj][ci] += pts[i + 2]; cnt[cj][ci]++;
  }
  let H = sum.map((r, j) => r.map((s, i) => (cnt[j][i] ? s / cnt[j][i] : null)));
  for (let pass = 0; pass < nx + ny && H.some(r => r.some(v => v == null)); pass++) {
    H = H.map((r, j) => r.map((v, i) => {
      if (v != null) return v;
      const nb = [[j - 1, i], [j + 1, i], [j, i - 1], [j, i + 1]].map(([a, b]) => H[a]?.[b]).filter(q => q != null);
      return nb.length ? nb.reduce((s, q) => s + q, 0) / nb.length : null;
    }));
  }
  const base = +(lo[2] - Math.max(below, 0.01)).toFixed(4);
  return { x: +lo[0].toFixed(4), y: +lo[1].toFixed(4), w: +w.toFixed(4), d: +d.toFixed(4), base, heights: H.map(r => r.map(v => +(v ?? lo[2]).toFixed(4))) };
}
