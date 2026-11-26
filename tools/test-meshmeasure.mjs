// Measuring on mesh bodies (js/meshmeasure.js): faces, edges, corners, cylinders and circles read from triangles.
// Run: npm run test:measure
import { meshTopo, meshElement } from '../js/meshmeasure.js';

const ok = (n, c, x = '') => { console.log((c ? 'OK   ' : 'FEHL ') + n + (x === '' ? '' : '  ' + x)); if (!c) process.exitCode = 1; };
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// a mesh from quads and triangles over shared points
function build() {
  const pos = [], idx = [], seen = new Map();
  const v = p => { const k = p.map(x => x.toFixed(6)).join(','); if (!seen.has(k)) { seen.set(k, pos.length / 3); pos.push(...p); } return seen.get(k); };
  const tri = (a, b, c) => { idx.push(v(a), v(b), v(c)); return idx.length / 3 - 1; };
  return { tri, quad: (a, b, c, d) => [tri(a, b, c), tri(a, c, d)], mesh: () => ({ pos: new Float32Array(pos), idx: Uint32Array.from(idx) }) };
}
// which triangle of the mesh holds the point (on its plane, inside)
function triAt(m, p) {
  const V = i => [m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]], S = (a, b) => a.map((x, i) => x - b[i]);
  const X = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], D = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  for (let t = 0; t < m.idx.length / 3; t++) {
    const a = V(m.idx[t * 3]), b = V(m.idx[t * 3 + 1]), c = V(m.idx[t * 3 + 2]), n = X(S(b, a), S(c, a));
    if (Math.abs(D(n, S(p, a))) > 1e-6 * Math.hypot(...n)) continue;
    if ([[a, b], [b, c], [c, a]].every(([u, w]) => D(X(S(w, u), S(p, u)), n) >= -1e-9)) return t;
  }
  return -1;
}

{
  // a box 10 × 20 × 30
  const B = build(), X = 10, Y = 20, Z = 30;
  B.quad([0, 0, 0], [0, Y, 0], [X, Y, 0], [X, 0, 0]); B.quad([0, 0, Z], [X, 0, Z], [X, Y, Z], [0, Y, Z]);
  B.quad([0, 0, 0], [X, 0, 0], [X, 0, Z], [0, 0, Z]); B.quad([0, Y, 0], [0, Y, Z], [X, Y, Z], [X, Y, 0]);
  B.quad([0, 0, 0], [0, 0, Z], [0, Y, Z], [0, Y, 0]); B.quad([X, 0, 0], [X, Y, 0], [X, Y, Z], [X, 0, Z]);
  const m = B.mesh(), T = meshTopo(m);
  const at = (p, px = 0.05) => meshElement(m, T, triAt(m, p), p, px);
  const top = at([5, 10, 30]);
  ok('Quader: Deckfläche ist eine ebene Fläche aus zwei Dreiecken', top.type === 'plane' && top.tris.length === 2 && near(top.area, 200) && near(top.perimeter, 60) && near(top.n[2], 1), JSON.stringify(top));
  ok('Quader: Schwerpunkt der Deckfläche', near(top.c[0], 5) && near(top.c[1], 10) && near(top.c[2], 30));
  const e = at([5, 0.1, 30]);
  ok('Quader: Kante neben dem Klick', e.type === 'line' && near(e.length, 10), JSON.stringify(e));
  const d = at([4.9, 9.9, 30]);
  ok('Quader: die Diagonale zwischen den zwei Dreiecken ist keine Kante', d.type === 'plane', d.type);
  const c = at([0.1, 0.1, 30]);
  ok('Quader: Ecke', c.type === 'point' && near(c.p[0], 0) && near(c.p[1], 0) && near(c.p[2], 30), JSON.stringify(c));
}
{
  // a prism with 24 sides round Z (r 5, height 12) between two caps, and an edge of 3 collinear pieces
  const B = build(), n = 24, r = 5, hgt = 12, P = (i, z) => [r * Math.cos((2 * Math.PI * i) / n), r * Math.sin((2 * Math.PI * i) / n), z];
  for (let i = 0; i < n; i++) {
    B.quad(P(i, 0), P(i + 1, 0), P(i + 1, hgt), P(i, hgt));
    B.tri([0, 0, hgt], P(i, hgt), P(i + 1, hgt)); B.tri([0, 0, 0], P(i + 1, 0), P(i, 0));
  }
  const m = B.mesh(), cyls = [{ c: [0, 0, 0], d: [0, 0, 1], r, h: hgt, hole: false, full: true }], T = meshTopo(m, cyls);
  const mid = (i, z) => { const a = P(i, z), b = P(i + 1, z); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z]; };
  const side = meshElement(m, T, triAt(m, mid(3, 6)), mid(3, 6), 0.01);
  ok('Prisma: Mantel ist ein Zylinder mit allen 48 Dreiecken', side.type === 'cyl' && side.tris.length === 48 && near(side.r, 5) && near(side.h, 12) && near(side.c[2], 6), JSON.stringify({ ...side, tris: side.tris?.length }));
  const p = mid(3, hgt), rim = meshElement(m, T, triAt(m, [p[0] * 0.999, p[1] * 0.999, hgt]), p, 0.05);
  ok('Prisma: Rand ist ein Kreis', rim.type === 'circle' && near(rim.r, 5) && near(rim.c[2], 12) && near(rim.c[0], 0), JSON.stringify(rim));
  const q = P(3, hgt), v = meshElement(m, T, triAt(m, [q[0] * 0.999, q[1] * 0.999, hgt]), q, 0.0005);
  ok('Prisma: ein Punkt des Randes ist keine Ecke', v.type === 'circle', v.type);
  const cap = meshElement(m, T, triAt(m, [1, 0.5, hgt]), [1, 0.5, hgt], 0.01);
  ok('Prisma: Deckel ist eine ebene Fläche aus 24 Dreiecken', cap.type === 'plane' && cap.tris.length === 24, cap.type + ' ' + cap.tris?.length);
  // without the cylinder known: the strips are flat faces of their own
  const T0 = meshTopo(m, []), s0 = meshElement(m, T0, triAt(m, mid(3, 6)), mid(3, 6), 0.01);
  ok('Prisma ohne erkannten Zylinder: ein Streifen ist eine ebene Fläche', s0.type === 'plane' && s0.tris.length === 2, s0.type);
}
