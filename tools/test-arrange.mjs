// Tests for arranging parts on the print bed (node tools/test-arrange.mjs)
import { hull, bestTurn, arrange, placedHull } from '../js/arrange.js';
const ok = (n, c, x = '') => { console.log((c ? 'OK   ' : 'FEHL ') + n + '  ' + x); if (!c) process.exitCode = 1; };
const rect = (w, h, a = 0, cx = 0, cy = 0) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)]);
const overlap = (A, B) => { // separating axis test of two convex polygons
  for (const P of [A, B]) for (let i = 0; i < P.length; i++) {
    const p = P[i], q = P[(i + 1) % P.length], n = [q[1] - p[1], p[0] - q[0]];
    const pr = Q => Q.map(v => v[0] * n[0] + v[1] * n[1]), a = pr(A), b = pr(B);
    if (Math.max(...a) <= Math.min(...b) + 1e-6 || Math.max(...b) <= Math.min(...a) + 1e-6) return false;
  }
  return true;
};

ok('Hülle eines Quadrats mit Punkt innen', hull([[0, 0], [2, 0], [2, 2], [0, 2], [1, 1]]).length === 4);
{
  const b = bestTurn(rect(40, 10, 0.5));
  ok('Schräges Rechteck wird gerade gedreht', Math.abs(b.w - 40) < 1e-6 && Math.abs(b.h - 10) < 1e-6, `${b.w.toFixed(3)} × ${b.h.toFixed(3)}`);
}
{
  const items = Array.from({ length: 12 }, (_, i) => ({ id: 'p' + i, pts: rect(50, 30, i * 0.3, 100 * i, -40 * i) }));
  const r = arrange(items, { W: 220, H: 220, gap: 5, margin: 5 });
  const H = r.places.map(pl => placedHull(items.find(i => i.id === pl.id).pts, pl));
  ok('12 Teile 50×30 auf 220×220: eine Platte', r.beds === 1 && !r.tooBig.length, `${r.beds} Platte(n)`);
  ok('Alle Teile liegen auf der Platte mit Rand', H.every(h => h.every(([x, y]) => x >= 5 - 1e-6 && y >= 5 - 1e-6 && x <= 215 + 1e-6 && y <= 215 + 1e-6)));
  let bad = 0;
  for (let i = 0; i < H.length; i++) for (let j = i + 1; j < H.length; j++) if (overlap(H[i], H[j])) bad++;
  ok('Keine Überschneidungen', !bad, `${bad}`);
}
{
  const items = Array.from({ length: 10 }, (_, i) => ({ id: 'q' + i, pts: rect(100, 100) }));
  const r = arrange(items, { W: 220, H: 220, gap: 5, margin: 5 });
  ok('10 Teile 100×100 auf 220×220: drei Platten zu je 4', r.beds === 3 && [0, 1, 2].map(b => r.places.filter(p => p.bed === b).length).join() === '4,4,2', r.places.map(p => p.bed).join(''));
}
{
  const r = arrange([{ id: 'x', pts: rect(300, 20) }, { id: 'y', pts: rect(20, 20) }], { W: 220, H: 220 });
  ok('Zu großes Teil wird gemeldet, das andere angeordnet', r.tooBig.join() === 'x' && r.places.length === 1);
}
{
  const r = arrange([{ id: 'l', pts: rect(20, 200) }], { W: 220, H: 220, turn: false });
  ok('Lange Teile liegen mit der langen Seite entlang X, wenn möglich', r.places[0].w > r.places[0].h);
}
