// Measuring by clicking elements (js/measure.js): what an edge is, and what two elements say about each other.
// Run: npm run test:measure
import { circleFrom3, describeCurve, relate } from '../js/measure.js';

const ok = (n, c, x = '') => { console.log((c ? 'OK   ' : 'FEHL ') + n + (x === '' ? '' : '  ' + x)); if (!c) process.exitCode = 1; };
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const arc = (c, r, a0, a1, n = 24, z = 0) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a), z]; });

{
  const c = circleFrom3([5, 0, 2], [0, 5, 2], [-5, 0, 2]);
  ok('Kreis durch drei Punkte', c && near(c.r, 5) && near(c.c[0], 0) && near(c.c[1], 0) && near(c.c[2], 2) && near(Math.abs(c.n[2]), 1), JSON.stringify(c));
  ok('Drei Punkte auf einer Geraden: kein Kreis', circleFrom3([0, 0, 0], [1, 1, 1], [2, 2, 2]) === null);
}
{
  const l = describeCurve([[0, 0, 0], [30, 40, 0]], { type: 'LINE' });
  ok('Gerade Kante: Länge und Richtung', l.sub === 'line' && near(l.length, 50) && near(l.geo.d[0], 0.6) && near(l.geo.d[1], 0.8), `${l.length}`);
  const full = describeCurve(arc([10, 20, 0], 3.3, 0, 2 * Math.PI), { type: 'CIRCLE', length: 2 * Math.PI * 3.3, closed: true });
  ok('Kreis: Durchmesser 6,6 und Mittelpunkt', full.sub === 'circle' && near(full.geo.r, 3.3, 1e-9) && near(full.geo.p[0], 10, 1e-9) && near(full.geo.p[1], 20, 1e-9), `r ${full.geo?.r}`);
  const q = describeCurve(arc([0, 0, 5], 8, 0, Math.PI / 2), { type: 'CIRCLE', length: 4 * Math.PI });
  ok('Viertelkreis: Radius 8, 90°', q.sub === 'arc' && near(q.geo.r, 8, 1e-9) && near(q.angle, 90, 1e-9), `${q.angle}°`);
  const guess = describeCurve(arc([0, 0, 0], 12, 0, Math.PI, 40));
  ok('Bogen ohne Angabe des Kerns (aus den Punkten erkannt)', guess.sub === 'arc' && near(guess.geo.r, 12, 1e-9) && Math.abs(guess.angle - 180) < 0.2, `${guess.angle}°`);
  const guessLine = describeCurve([[0, 0, 0], [1, 2, 3], [2, 4, 6]]);
  ok('Gerade ohne Angabe des Kerns', guessLine.sub === 'line' && near(guessLine.length, Math.hypot(2, 4, 6)));
  const wavy = describeCurve([[0, 0, 0], [1, 1, 0], [2, 0, 0], [3, 1, 0], [4, 0, 0]], { type: 'OTHER' });
  ok('Freie Kurve: nur die Länge', wavy.sub === 'curve' && wavy.geo === null && near(wavy.length, 4 * Math.SQRT2));
  const notRound = describeCurve([[0, 0, 0], [1, 1, 0], [2, 0, 0], [3, 1, 0], [4, 0, 0]]);
  ok('Zickzack ist kein Kreisbogen', notRound.sub === 'curve');
}
{
  // two bores of a plate, different depths: the distance of the axes
  const a = { kind: 'axis', p: [10, 10, 20], d: [0, 0, -1], r: 3.3 }, b = { kind: 'axis', p: [90, 50, 12], d: [0, 0, 1], r: 3.3 };
  const r = relate(a, b);
  ok('Zwei Bohrungen: Mittenabstand quer zu den Achsen', r.centre.axes && near(r.centre.d, Math.hypot(80, 40)) && near(r.centre.q[2], 20) && r.parallel, `${r.centre.d}`);
  const top = { kind: 'plane', p: [0, 0, 20], d: [0, 0, 1] }, bottom = { kind: 'plane', p: [50, 30, 0], d: [0, 0, -1] }, side = { kind: 'plane', p: [0, 5, 3], d: [-1, 0, 0] };
  ok('Parallele Flächen: Abstand 20', near(relate(top, bottom).normal.d, 20) && near(relate(top, bottom).normal.q[2], 0) && relate(top, bottom).parallel);
  ok('Flächen im rechten Winkel: 90°, kein Abstand', relate(top, side).normal === undefined && near(relate(top, side).angle, 90));
  ok('Bohrung zur Seitenfläche: Mitte zur Fläche 10', near(relate(a, side).normal.d, 10) && near(relate(side, a).normal.d, 10) && near(relate(a, side).normal.q[0], 0));
  ok('Bohrung zur Deckfläche (Achse senkrecht darauf): kein Mittenmaß', relate(a, top).normal === undefined);
  const edge = { kind: 'line', p: [0, 0, 0], d: [1, 0, 0] }, slanted = { kind: 'line', p: [0, 0, 0], d: [Math.SQRT1_2, Math.SQRT1_2, 0] };
  ok('Zwei Kanten: 45°', near(relate(edge, slanted).angle, 45, 1e-9));
  ok('Kante zur Fläche: Winkel zur Fläche selbst', near(relate(edge, top).angle, 0, 1e-9) && near(relate({ kind: 'line', p: [0, 0, 0], d: [0, 0, 1] }, top).angle, 90, 1e-9));
  ok('Parallele Kanten: Abstand', near(relate(edge, { kind: 'line', p: [7, 3, 4], d: [-1, 0, 0] }).lines.d, 5));
  const pt = { kind: 'point', p: [10, 10, 0] };
  ok('Kreis und Punkt: Mittenabstand', near(relate({ kind: 'circle', p: [10, 10, 20], d: [0, 0, 1], r: 3 }, pt).centre.d, 20));
  // a flat face with its centroid against a circle: centre distance and the distance square to the face
  const face = { kind: 'plane', p: [3, 4, 0], d: [0, 0, 1], c: [0, 0, 0] }, ring = { kind: 'circle', p: [12, 0, 90], d: [0, 0, 1], r: 30 };
  const fr = relate(face, ring);
  ok('Fläche und Kreis: Mittenabstand und normaler Abstand', near(fr.centre.d, Math.hypot(12, 90)) && near(fr.normal.d, 90) && near(fr.normal.q[0], 12) && near(fr.normal.q[2], 0), `${fr.centre.d} / ${fr.normal.d}`);
  ok('Fläche ohne Schwerpunkt: kein Mittenabstand', relate(top, ring).centre === undefined && near(relate(top, ring).normal.d, 70));
  // two circles of a turned part on one axis, and two circles side by side
  const c1 = { kind: 'circle', p: [0, 0, 30], d: [0, 0, 1], r: 15 }, c2 = { kind: 'circle', p: [0, 0, 70], d: [0, 0, -1], r: 10 }, c3 = { kind: 'circle', p: [30, 40, 50], d: [0, 0, 1], r: 4 };
  ok('Kreise auf einer Achse: Abstand der Mitten und der Ebenen', near(relate(c1, c2).centre.d, 40) && !relate(c1, c2).centre.axes && near(relate(c1, c2).normal.d, 40) && relate(c1, c2).parallel);
  ok('Kreise nebeneinander: Mitte zu Mitte und Abstand der Ebenen', near(relate(c1, c3).centre.d, Math.hypot(30, 40, 20)) && near(relate(c1, c3).normal.d, 20));
  ok('Bohrungen auf einer Achse: Abstand der Öffnungen', near(relate({ kind: 'axis', p: [5, 5, 20], d: [0, 0, -1], r: 3 }, { kind: 'axis', p: [5, 5, 0], d: [0, 0, 1], r: 3 }).centre.d, 20));
  ok('Freiform: nichts zu sagen', Object.keys(relate(null, top)).length === 0);
}
