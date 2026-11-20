// Tests for hole recognition (node tools/test-holefind.mjs)
import { findHoles, groupHoles } from '../js/holefind.js';
const ok = (n, c, x = '') => { console.log((c ? 'OK   ' : 'FEHL ') + n + '  ' + x); if (!c) process.exitCode = 1; };

// points on a circle of radius r around (cx, cy) at height z (axis Z)
const ring = (cx, cy, z, r, n = 8) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI), z]);
const cyl = (id, cx, cy, r, z0, z1, extra = {}) => ({ id, loc: [cx, cy, 0], dir: [0, 0, 1], r, concave: true, pts: [...ring(cx, cy, z0, r), ...ring(cx, cy, z1, r)], ...extra });
// the plate's top and bottom (with holes they are big faces: points far outside any hole)
const plate = [{ id: 'top', kind: 'plane', pts: [[0, 0, 10], [100, 0, 10], [100, 60, 10], [0, 60, 10]] }, { id: 'bot', kind: 'plane', pts: [[0, 0, 0], [100, 0, 0], [100, 60, 0], [0, 60, 0]] }];

{
  // through hole Ø8 split into two half cylinders (as mesh → body gives them), blind Ø6 × 6 with a drill tip, counterbore
  const cyls = [
    { ...cyl('a1', 20, 20, 4, 0, 10), pts: [...ring(20, 20, 0, 4).slice(0, 5), ...ring(20, 20, 10, 4).slice(0, 5)] },
    { ...cyl('a2', 20, 20, 4, 0, 10), loc: [20, 20, 5], dir: [0, 0, -1], pts: [...ring(20, 20, 0, 4).slice(4), ...ring(20, 20, 10, 4).slice(4)] },
    cyl('b', 50, 30, 3, 4, 10),
    cyl('c1', 80, 30, 5.5, 4, 10), cyl('c2', 80, 30, 3.3, 0, 4),
    { ...cyl('pin', 50, 50, 2, 10, 15), concave: false },
  ];
  const caps = [...plate, { id: 'tipB', kind: 'cone', pts: [...ring(50, 30, 4, 3), [50, 30, 4 - 3 / Math.tan(59 * Math.PI / 180)]] }, { id: 'cbFloor', kind: 'plane', pts: [...ring(80, 30, 4, 5.5), ...ring(80, 30, 4, 3.3)] }];
  const H = findHoles(cyls, caps);
  const at = (x, y) => H.find(h => Math.abs(h.entry[0] - x) < 1e-6 && Math.abs(h.entry[1] - y) < 1e-6);
  ok('Drei Bohrungen gefunden, der Zapfen nicht', H.length === 3, H.map(h => h.entry.join(',')).join(' | '));
  const a = H.find(h => h.dia === 8), b = at(50, 30), c = at(80, 30);
  ok('Durchgang Ø8 aus zwei Halbschalen, von oben', a && a.through && a.entry[2] === 10 && a.dir[2] === -1 && a.dia === 8 && a.depth === 10 && a.faces.sort().join() === 'a1,a2', JSON.stringify(a));
  ok('Sackloch Ø6 × 6 mit Spitze, Eintritt oben, Richtung nach unten', b && !b.through && b.tip && b.dia === 6 && b.depth === 6 && b.entry[2] === 10 && b.dir[2] === -1 && b.faces.includes('tipB'), JSON.stringify(b));
  ok('Senkbohrung: Ø6,6 durch, Senkung Ø11 × 6 von oben', c && c.kind === 'cbore' && c.through && c.dia === 6.6 && c.cbDia === 11 && c.cbDepth === 6 && c.depth === 10 && c.entry[2] === 10, JSON.stringify(c));
  ok('Die Senkungsschulter schließt kein Ende', !c.faces.includes('cbFloor'));
}
{
  // blind hole with flat bottom from below; a closed cavity is no hole
  const H = findHoles([cyl('f', 30, 30, 5, 0, 7), cyl('cav', 70, 30, 4, 3, 7)], [...plate, { id: 'floor', kind: 'plane', pts: ring(30, 30, 7, 5) }, { id: 'c0', kind: 'plane', pts: ring(70, 30, 3, 4) }, { id: 'c1', kind: 'plane', pts: ring(70, 30, 7, 4) }]);
  ok('Flaches Sackloch von unten', H.length === 1 && H[0].entry[2] === 0 && H[0].dir[2] === 1 && !H[0].tip && H[0].depth === 7 && H[0].faces.includes('floor'), JSON.stringify(H));
}
{
  // tilted axis
  const d = [Math.SQRT1_2, 0, Math.SQRT1_2], u = [Math.SQRT1_2, 0, -Math.SQRT1_2], v = [0, 1, 0];
  const P = (t, a, r = 2) => [10 + d[0] * t + r * (Math.cos(a) * u[0] + Math.sin(a) * v[0]), 10 + d[1] * t + r * (Math.cos(a) * u[1] + Math.sin(a) * v[1]), d[2] * t + r * (Math.cos(a) * u[2] + Math.sin(a) * v[2])];
  const pts = [0, 1, 2, 3, 4, 5].flatMap(i => [P(0, i), P(9, i)]);
  const H = findHoles([{ id: 't', loc: [10, 10, 0], dir: d, r: 2, concave: true, pts }], []);
  ok('Schräge Durchgangsbohrung, von oben', H.length === 1 && H[0].through && H[0].dir[2] < 0 && Math.abs(H[0].depth - 9) < 1e-4 && H[0].dia === 4, JSON.stringify(H[0]));
}
{
  // sizes of a mesh fit snap to hundredths
  const H = findHoles([cyl('m', 10, 10, 4.0001, 0, 10.0004)], plate);
  ok('Maße aus dem Netz gerundet: Ø8,0002 → 8', H.length === 1 && H[0].dia === 8 && H[0].depth === 10, JSON.stringify(H[0]));
}
{
  const g = groupHoles([
    { kind: 'simple', dia: 6, depth: 10, through: true, tip: false, entry: [10, 10, 10], dir: [0, 0, -1] },
    { kind: 'simple', dia: 6, depth: 10, through: true, tip: false, entry: [30, 10, 10], dir: [0, 0, -1] },
    { kind: 'simple', dia: 8, depth: 10, through: true, tip: false, entry: [50, 10, 10], dir: [0, 0, -1] },
    { kind: 'simple', dia: 6, depth: 10, through: true, tip: false, entry: [70, 10, 0], dir: [0, 0, 1] },
  ]);
  ok('Gleiche Bohrungen in einer Ebene → eine Gruppe', g.length === 3 && g[0].holes.length === 2, g.map(x => x.holes.length).join());
}
