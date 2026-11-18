// Tests for sketch fillets and chamfers (node tools/test-sketchcorner.mjs)
import { cornerPlan, cornerPts, applyCorners } from '../js/sketchcorner.js';
const ok = (n, c, x = '') => { console.log((c ? 'OK   ' : 'FEHL ') + n + '  ' + x); if (!c) process.exitCode = 1; };
const J = JSON.stringify, near = (a, b, t = 1e-6) => Math.abs(a[0] - b[0]) < t && Math.abs(a[1] - b[1]) < t;
let idc = 0;
const newId = () => 'c' + ++idc;
const area = pts => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
const sq = { id: 'S', type: 'poly', closed: true, pts: [[0, 0], [20, 0], [20, 10], [0, 10]] };

// ---- geometry ----
{
  const e = { ...sq, radii: { 1: 3 } };
  const pl = cornerPlan(e), arc = pl.segs.find(s => s.k === 'A');
  ok('Abrundung: Bogen tangential (Mitte, Radius)', arc && near(arc.c, [17, 3]) && Math.abs(arc.r - 3) < 1e-9 && near(arc.a, [17, 0]) && near(arc.b, [20, 3]), J(arc));
  const A = area(cornerPts(e, 0.001)), exact = 200 - (9 - (Math.PI * 9) / 4);
  ok('Abrundung: Fläche = Rechteck − Eckzwickel', Math.abs(A - exact) < 0.005, `${A.toFixed(4)} / ${exact.toFixed(4)}`);
  const pts = cornerPts(e, 0.005);
  const worst = Math.max(...pts.map(p => (p[0] > 17 && p[1] < 3 ? Math.abs(Math.hypot(p[0] - 17, p[1] - 3) - 3) : 0)));
  // chord error between the points: centre-to-chord distance ≥ r − tol
  let sag = 0;
  for (let i = 0; i + 1 < pts.length; i++) { const a = pts[i], b = pts[i + 1]; if (a[0] >= 17 - 1e-9 && b[1] <= 3 + 1e-9 && a[1] < 3 && b[0] > 17) { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; sag = Math.max(sag, 3 - Math.hypot(m[0] - 17, m[1] - 3)); } }
  ok('Abrundung: Punkte auf dem Kreis, Sehnenfehler ≤ 0,005', worst < 1e-9 && sag <= 0.005 + 1e-9, `Sehne ${sag.toFixed(4)}`);
}
{
  const e = { ...sq, chamfers: { 2: 2 } };
  const pts = cornerPts(e);
  ok('Fase gleichschenklig: Ecke (20,10) → (20,8)–(18,10)', pts.some(p => near(p, [20, 8])) && pts.some(p => near(p, [18, 10])) && !pts.some(p => near(p, [20, 10])), J(pts));
  ok('Fase: Fläche', Math.abs(area(pts) - (200 - 2)) < 1e-9, area(pts).toFixed(4));
  const e2 = { ...sq, chamfers: { 2: [1, 4] } }; // 1 along the edge to the previous vertex (20,0), 4 towards (0,10)
  const p2 = cornerPts(e2);
  ok('Fase ungleich (1 / 4)', p2.some(p => near(p, [20, 9])) && p2.some(p => near(p, [16, 10])), J(p2));
}
{
  // too big: both corners of the 10 mm edge shrink to 5 mm each
  const e = { ...sq, radii: { 1: 8, 2: 8 } };
  const pl = cornerPlan(e), arcs = pl.segs.filter(s => s.k === 'A');
  ok('zu groß: beide Radien gemeinsam verkleinert und gemeldet', arcs.length === 2 && arcs.every(a => Math.abs(a.r - 5) < 1e-9) && J(pl.clamped) === J([1, 2]), arcs.map(a => a.r).join(', '));
  ok('zu groß: keine Kante mit Länge 0', pl.segs.every(s => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) > 1e-9));
}
{
  // corner at vertex 0 of a closed polyline, and at a 60° corner of an open one
  const e = { ...sq, radii: { 0: 2 } };
  const pts = cornerPts(e);
  ok('Abrundung an Punkt 0 (geschlossen)', !pts.some(p => near(p, [0, 0])) && pts.some(p => near(p, [2, 0])) && pts.some(p => near(p, [0, 2])), `${pts.length} Punkte`);
  const o = { id: 'O', type: 'poly', pts: [[0, 0], [10, 0], [5, 8.660254]], radii: { 1: 1, 0: 5, 2: 5 } };
  const pl = cornerPlan(o);
  ok('offen: Endpunkte bleiben, nur innere Ecke gerundet', near(pl.segs[0].a, [0, 0]) && near(pl.segs[pl.segs.length - 1].b, [5, 8.660254]) && pl.segs.filter(s => s.k === 'A').length === 1);
  const arc = pl.segs.find(s => s.k === 'A');
  ok('60°-Ecke: Tangentenlänge r/tan(30°)', Math.abs(Math.hypot(arc.a[0] - 10, arc.a[1]) - 1 / Math.tan(Math.PI / 6)) < 1e-6);
}

// ---- applying ----
{
  const r = applyCorners([sq], [], ['S:p1', 'S:p3'], 'fillet', 2, newId);
  ok('Linienzug: zwei Ecken abgerundet', r.done === 2 && J(r.entities[0].radii) === J({ 1: 2, 3: 2 }) && !r.changed.length);
  const r2 = applyCorners(r.entities, [], ['S:p1'], 'chamfer', [1, 2], newId);
  ok('Fase ersetzt Rundung an derselben Ecke', J(r2.entities[0].radii) === J({ 3: 2 }) && J(r2.entities[0].chamfers) === J({ 1: [1, 2] }));
  const r3 = applyCorners(r2.entities, [], ['S:p1', 'S:p3'], 'fillet', 0, newId);
  ok('Wert 0 entfernt Rundung und Fase', !r3.entities[0].radii && !r3.entities[0].chamfers);
  ok('Eingabe bleibt unverändert', !sq.radii && !sq.chamfers);
}
{
  const rect = { id: 'R', type: 'rect', x: 0, y: 0, w: 30, h: 20 };
  const cons = [{ id: 'd1', type: 'distance', refs: ['R:p0', 'R:p1'], value: 30 }];
  const r = applyCorners([rect], cons, ['R:p2'], 'chamfer', 3, newId);
  const e = r.entities[0];
  ok('Rechteck → Linienzug mit Fase an Ecke 2', e.type === 'poly' && e.closed && J(e.pts) === J([[0, 0], [30, 0], [30, 20], [0, 20]]) && e.chamfers[2] === 3 && J(r.changed) === J(['R']), J(e));
  const hv = r.constraints.filter(c => c.type === 'horizontal' || c.type === 'vertical');
  ok('Rechteck bleibt rechtwinklig (H/V-Bedingungen) und Bemaßung bleibt', hv.length === 4 && r.constraints.some(c => c.id === 'd1' && J(c.refs) === J(['R:p0', 'R:p1'])), J(hv.map(c => c.type + c.refs)));
  const rr = applyCorners([{ ...rect, r: 2 }], [], ['R:p0'], 'fillet', 5, newId).entities[0];
  ok('Rechteck mit Eckenradius: übrige Ecken behalten ihn', J(rr.radii) === J({ 0: 5, 1: 2, 2: 2, 3: 2 }));
  // centre rectangle on the origin: a construction diagonal keeps the centre there (midpoint on the origin)
  const cr = applyCorners([rect], [{ id: 'm', type: 'coincident', refs: ['R:c', 'origin'] }], ['R:p0'], 'fillet', 2, newId);
  const dg = cr.entities.find(x => x.cons);
  ok('Mittelpunkt-Rechteck: abgerundet, Mitte über Konstruktionsdiagonale gehalten', cr.done === 1 && cr.entities[0].type === 'poly' && cr.entities[0].radii[0] === 2
    && dg && J(dg.pts) === J([[0, 0], [30, 20]]) && !cr.constraints.some(c => c.id === 'm')
    && cr.constraints.some(c => c.type === 'midpoint' && J(c.refs) === J(['origin', `${dg.id}:l0`]))
    && cr.constraints.some(c => c.type === 'coincident' && J(c.refs) === J([`${dg.id}:p1`, 'R:p2'])), J(cr.constraints.slice(-3)));
  const blocked = applyCorners([rect], [{ id: 'm', type: 'distance', refs: ['R:c', 'origin'], value: 5 }], ['R:p0'], 'fillet', 2, newId);
  ok('Rechteck mit Abstandsmaß an der Mitte bleibt unverändert', blocked.done === 0 && blocked.entities[0].type === 'rect');
}
{
  // regular polygon: corners on a construction circle that takes over the centre constraint, all sides equal
  const ng = { id: 'N', type: 'ngon', cx: 0, cy: 0, r: 20, n: 6, rot: 0 };
  const r = applyCorners([ng], [{ id: 'm', type: 'coincident', refs: ['N:c', 'origin'] }], ['N:p0'], 'fillet', 3, newId);
  const e = r.entities[0], ci = r.entities.find(x => x.type === 'circle');
  ok('Polygon → Linienzug mit Abrundung an Ecke 0', r.done === 1 && e.type === 'poly' && e.closed && e.pts.length === 6 && near(e.pts[0], [0, 20]) && e.radii[0] === 3, J(e.pts[0]));
  ok('Polygon bleibt regelmäßig (Ecken auf Konstruktionskreis, Seiten gleich, Mitte am Ursprung)', ci?.cons && ci.r === 20 && ci.of === 'N'
    && r.constraints.filter(c => c.type === 'coincident' && c.refs[1] === `${ci.id}:o`).length === 6 && r.constraints.filter(c => c.type === 'equal').length === 5
    && r.constraints.some(c => c.id === 'm' && J(c.refs) === J([`${ci.id}:c`, 'origin'])));
}
{
  // two separate lines meeting at (10,0): joined, the corner rounded; constraints follow the new numbers
  const A = { id: 'A', type: 'poly', pts: [[0, 0], [10, 0]] }, B = { id: 'B', type: 'poly', pts: [[10, 0], [10, 8]] };
  const cons = [{ id: 'k', type: 'coincident', refs: ['A:p1', 'B:p0'] }, { id: 'h', type: 'horizontal', refs: ['A:l0'] }, { id: 'v', type: 'vertical', refs: ['B:l0'] }, { id: 'f', type: 'fix', refs: ['B:p1'] }];
  const r = applyCorners([A, B], cons, ['B:p0'], 'fillet', 3, newId);
  const e = r.entities.find(x => x.id === 'A');
  ok('zwei Linien → ein Linienzug, Ecke gerundet', r.entities.length === 1 && J(e.pts) === J([[0, 0], [10, 0], [10, 8]]) && J(e.radii) === J({ 1: 3 }), J(r.entities));
  ok('Bedingungen umnummeriert, Koinzidenz entfällt', !r.constraints.some(c => c.id === 'k') && J(r.constraints.find(c => c.id === 'v').refs) === J(['A:l1']) && J(r.constraints.find(c => c.id === 'f').refs) === J(['A:p2']), J(r.constraints));
  // reversed second line (ends at the junction) and a closing third line → closed polyline
  const B2 = { id: 'B', type: 'poly', pts: [[10, 8], [10, 0]] }, Cc = { id: 'C', type: 'poly', pts: [[10, 8], [0, 0]] };
  const r2 = applyCorners([A, B2, Cc], [{ id: 'q', type: 'fix', refs: ['B:p0'] }], ['A:p1', 'C:p0'], 'chamfer', 1, newId);
  const e2 = r2.entities[0];
  ok('drei Linien → geschlossener Linienzug mit zwei Fasen', r2.entities.length === 1 && e2.closed && e2.pts.length === 3 && Object.keys(e2.chamfers || {}).length === 2 && J(r2.constraints[0].refs) === J(['A:p2']), J(r2.entities));
  const lone = applyCorners([A], [], ['A:p1'], 'fillet', 2, newId);
  ok('Linienende ohne zweite Linie: übersprungen', lone.done === 0 && lone.skipped === 1);
}

// ---- picking a corner by clicking near it ----
{
  const { cornerAt, cornerPreview } = await import('../js/sketchcorner.js');
  const ents = [{ id: 'R', type: 'rect', x: 0, y: 0, w: 30, h: 20 }, { id: 'A', type: 'poly', pts: [[50, 0], [60, 0]] }, { id: 'B', type: 'poly', pts: [[60, 0], [60, 10]] },
    { id: 'Z', type: 'poly', pts: [[80, 0], [90, 0], [90, 10]] }, { id: 'K', type: 'poly', cons: true, closed: true, pts: [[0, 40], [5, 40], [5, 45]] }];
  ok('Klick neben Rechteckecke → Ecke', cornerAt(ents, [29.2, 19.5], 1.5)?.ref === 'R:p2');
  ok('Klick am Treffpunkt zweier Linien', ['A:p1', 'B:p0'].includes(cornerAt(ents, [59.5, 0.4], 1.5)?.ref));
  ok('Linienende ohne zweite Linie / offenes Ende → keine Ecke', cornerAt(ents, [80.3, 0.2], 1.5) === null && cornerAt(ents, [90, 10.4], 1.5) === null);
  ok('innerer Punkt eines offenen Linienzugs', cornerAt(ents, [89.6, 0.5], 1.5)?.ref === 'Z:p1');
  ok('Konstruktionslinien werden ignoriert, zu weit weg → nichts', cornerAt(ents, [5, 40], 1.5) === null && cornerAt(ents, [15, 10], 1.5) === null);
  const pv = cornerPreview(ents, 'R:p2', 'fillet', 5);
  ok('Vorschau: Rechteck mit gerundeter Ecke', pv && pv.closed && pv.pts.some(p => near(p, [25, 20])) && pv.pts.some(p => near(p, [30, 15])));
}

// ---- a rounding where a line meets an arc, and where two arcs meet ----
{
  const { filletCurves, curveCorner, cornerAt, cornerPreview } = await import('../js/sketchcorner.js');
  const q = Math.SQRT1_2, d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  // a line coming up to (40,0), there an arc (centre 40/20, R 20) leaves to the right
  const ents = [
    { id: 'L', type: 'poly', closed: false, pts: [[40, -30], [40, 0]] },
    { id: 'A', type: 'poly', curve: 'arc', closed: false, pts: [[40, 0], [40 + 20 * q, 20 - 20 * q], [60, 20]] },
    { id: 'B', type: 'poly', curve: 'arc', closed: false, pts: [[60, 20], [60 + 10 * q, 30 - 10 * q], [70, 30]] },
  ];
  ok('Ecke Linie–Bogen und Bogen–Bogen werden erkannt, ein freies Ende nicht', curveCorner(ents, 'L:p1') && curveCorner(ents, 'A:p0') && curveCorner(ents, 'A:p2') && !curveCorner(ents, 'L:p0') && !curveCorner(ents, 'B:p2') && cornerAt(ents, [40.3, 0.2], 1.5)?.ref != null);
  const f = filletCurves(ents, 'L:p1', 5, 'N', newId), O = f?.centre;
  const yO = 20 - Math.sqrt(25 * 25 - 25);
  ok('Linie–Bogen: Mitte 5 neben der Linie und 5 außerhalb des Kreises', f && near(O, [45, yO], 1e-6) && Math.abs(d2(O, [40, 20]) - 25) < 1e-6, J(O));
  const mL = f.moves.find(m => m.id === 'L'), mA = f.moves.find(m => m.id === 'A');
  ok('Linie–Bogen: Linie endet am Berührpunkt, der Bogen beginnt an seinem', near(mL.pts[1], [40, yO], 1e-5) && near(mL.pts[0], [40, -30]) && Math.abs(d2(mA.pts[0], [40, 20]) - 20) < 1e-5 && Math.abs(d2(mA.pts[0], O) - 5) < 1e-5 && near(mA.pts[2], [60, 20]) && Math.abs(d2(mA.pts[1], [40, 20]) - 20) < 1e-5 && mA.pts[1][0] > mA.pts[0][0] && mA.pts[1][0] < 60, J(mA.pts));
  ok('Linie–Bogen: neuer Bogen mit Radius 5 zwischen den Berührpunkten, Abhängigkeiten dazu', f.arc.pts.every(p => Math.abs(d2(p, O) - 5) < 1e-5) && near(f.arc.pts[0], mL.pts[1], 1e-5) && near(f.arc.pts[2], mA.pts[0], 1e-5) && f.cons.filter(c => c.type === 'tangent').length === 2 && f.cons.filter(c => c.type === 'coincident').length === 2 && J(f.drop) === J(['L:p1', 'A:p0']), J(f.arc.pts));
  ok('Linie–Bogen: ein Radius, der nicht passt, wird abgelehnt', filletCurves(ents, 'L:p1', 60, 'N', newId) === null && filletCurves(ents, 'L:p0', 5, 'N', newId) === null);
  // two arcs that meet with a kink at (60,20)
  const g = filletCurves(ents, 'A:p2', 2, 'N', newId);
  const gA = g?.moves.find(m => m.id === 'A'), gB = g?.moves.find(m => m.id === 'B');
  ok('Bogen–Bogen: Rundung berührt beide Kreise, beide Bögen sind gekürzt', g && [[40, 20, 20], [60, 30, 10]].every(([x, y, R]) => Math.min(Math.abs(d2(g.centre, [x, y]) - (R + 2)), Math.abs(d2(g.centre, [x, y]) - (R - 2))) < 1e-6)
    && Math.abs(d2(gA.pts[2], [40, 20]) - 20) < 1e-5 && Math.abs(d2(gB.pts[0], [60, 30]) - 10) < 1e-5 && near(gA.pts[0], [40, 0]) && near(gB.pts[2], [70, 30]) && d2(gA.pts[2], [60, 20]) > 0.1 && d2(gA.pts[2], [60, 20]) < 6 && g.arc.pts.every(p => Math.abs(d2(p, g.centre) - 2) < 1e-5), J(g?.centre));
  const pv = cornerPreview(ents, 'L:p1', 'fillet', 5);
  ok('Vorschau an der Ecke Linie–Bogen', pv && !pv.closed && pv.pts.length > 3 && pv.pts.every(p => Math.abs(d2(p, O) - 5) < 1e-4) && cornerPreview(ents, 'L:p1', 'chamfer', 5)?.pts.length === 2);
  // the line of a polyline whose other corner is rounded keeps that rounding
  const e2 = [{ id: 'P', type: 'poly', closed: false, pts: [[10, -30], [40, -30], [40, 0]], radii: { 1: 28 } }, ents[1]];
  ok('Linie–Bogen: die Rundung am anderen Ende der Linie begrenzt den Platz', filletCurves(e2, 'P:p2', 5, 'N', newId) === null && filletCurves(e2, 'P:p2', 1, 'N', newId) !== null);
}

// ---- a chamfer at an arc; taking a rounding or chamfer at an arc away again ----
{
  const { filletCurves, chamferCurves, unbridge, bridgeRadius, cornerAt, cornerPreview } = await import('../js/sketchcorner.js');
  const q = Math.SQRT1_2, d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const base = () => [
    { id: 'L', type: 'poly', closed: false, pts: [[40, -30], [40, 0]] },
    { id: 'A', type: 'poly', curve: 'arc', closed: false, pts: [[40, 0], [40 + 20 * q, 20 - 20 * q], [60, 20]] },
    { id: 'B', type: 'poly', curve: 'arc', closed: false, pts: [[60, 20], [60 + 10 * q, 30 - 10 * q], [70, 30]] },
  ];
  const apply = (ents, plan) => [...ents.map(e => { const m = plan.moves.find(x => x.id === e.id); return m ? { ...e, pts: m.pts } : e; }), plan.arc];
  const c = chamferCurves(base(), 'L:p1', 3, 3, 'C', newId);
  ok('Fase Linie–Bogen: 3 mm auf der Linie, 3 mm Bogenlänge auf dem Bogen, Linie dazwischen', c && near(c.arc.pts[0], [40, -3], 1e-5) && near(c.arc.pts[1], [40 + 20 * Math.sin(0.15), 20 - 20 * Math.cos(0.15)], 1e-5) && c.arc.chamfer && c.cons.length === 2 && chamferCurves(base(), 'L:p1', 3, 40, 'C', newId) === null, J(c?.arc.pts));
  const c2 = chamferCurves(base(), 'L:p1', 2, 5, 'C', newId);
  ok('Fase Linie–Bogen ungleich und in der Vorschau', near(c2.arc.pts[0], [40, -2], 1e-5) && Math.abs(d2(c2.arc.pts[1], [40, 20]) - 20) < 1e-5 && near(cornerPreview(base(), 'L:p1', 'chamfer', [2, 5]).pts[1], c2.arc.pts[1], 1e-6));
  const ec = apply(base(), c), uc = unbridge(ec, 'C');
  ok('Fase am Bogen entfernen: Linie und Bogen laufen wieder bis zur Ecke', bridgeRadius(ec, 'C') === 0 && uc && uc.remove === 'C' && near(uc.P, [40, 0], 1e-5) && near(uc.moves.find(m => m.id === 'L').pts[1], [40, 0], 1e-5) && near(uc.moves.find(m => m.id === 'A').pts[0], [40, 0], 1e-5) && near(uc.moves.find(m => m.id === 'A').pts[1], [40 + 20 * q, 20 - 20 * q], 1e-4) && cornerAt(ec, [41.5, -1.4], 1.5)?.ref === 'C:b', J(uc?.moves));
  const f = filletCurves(base(), 'L:p1', 5, 'N', newId), ef = apply(base(), f), uf = unbridge(ef, 'N');
  ok('Abrundung am Bogen entfernen: Radius wird erkannt, die Ecke kommt zurück', Math.abs(bridgeRadius(ef, 'N') - 5) < 1e-4 && uf && near(uf.P, [40, 0], 1e-4) && near(uf.moves.find(m => m.id === 'A').pts[2], [60, 20]) && cornerAt(ef, f.arc.pts[1], 1)?.ref === 'N:b' && cornerPreview(ef, 'N:b', 'fillet', 3) === null, J(uf?.P));
  const g = filletCurves(base(), 'A:p2', 2, 'N', newId), eg = apply(base(), g), ug = unbridge(eg, 'N');
  ok('Abrundung zwischen zwei Bögen entfernen', ug && near(ug.P, [60, 20], 1e-4) && near(ug.moves.find(m => m.id === 'B').pts[2], [70, 30]) && near(ug.moves.find(m => m.id === 'A').pts[0], [40, 0]), J(ug?.P));
  // an arc drawn by hand between two lines that it does not leave tangentially is no rounding; neither is a plain line
  const hand = [{ id: 'P', type: 'poly', closed: false, pts: [[0, 0], [10, 0]] }, { id: 'Q', type: 'poly', curve: 'arc', closed: false, pts: [[10, 0], [15, 3], [20, 0]] }, { id: 'R', type: 'poly', closed: false, pts: [[20, 0], [30, 0]] }, { id: 'S', type: 'poly', closed: false, pts: [[30, 0], [30, 9]] }];
  ok('Kein Entfernen an einem gezeichneten Bogen oder einer gewöhnlichen Linie', bridgeRadius(hand, 'Q') === null && bridgeRadius(hand, 'R') === null && unbridge(hand, 'Q') === null);
}
{
  // two lines that do not meet in a corner: brought to their intersection, then the corner is rounded
  const { meetLines, cornerLineAt } = await import('../js/sketchcorner.js');
  const H = { id: 'H', type: 'poly', closed: false, pts: [[0, 0], [60, 0]] }, V = { id: 'V', type: 'poly', closed: false, pts: [[50, -10], [50, 30]] };
  const a = cornerLineAt([H, V], [10, 0.2], 1), b = cornerLineAt([H, V], [50.2, 20], 1);
  const r = meetLines([H, V], a, b);
  ok('Kreuzende Linien: beide auf den Schnittpunkt gestutzt (Klickseite bleibt)', !r.error && near(r.X, [50, 0]) && J(r.moves) === J([{ id: 'H', k: 1, p: [50, 0] }, { id: 'V', k: 0, p: [50, 0] }]) && J(r.join) === J(['H:p1', 'V:p0']), J(r));
  const r2 = meetLines([H, V], cornerLineAt([H, V], [55, 0.1], 1), cornerLineAt([H, V], [50.1, -5], 1));
  ok('Kreuzende Linien: andere Klickseite behält die anderen Stücke', !r2.error && J(r2.moves) === J([{ id: 'H', k: 0, p: [50, 0] }, { id: 'V', k: 1, p: [50, 0] }]), J(r2));
  const G = { id: 'G', type: 'poly', closed: false, pts: [[0, 0], [40, 0]] }, W = { id: 'W', type: 'poly', closed: false, pts: [[50, 30], [50, 8]] };
  const r3 = meetLines([G, W], cornerLineAt([G, W], [20, 0], 1), cornerLineAt([G, W], [50, 20], 1));
  ok('Lücke: beide Linien bis zum Schnittpunkt verlängert', !r3.error && J(r3.moves) === J([{ id: 'G', k: 1, p: [50, 0] }, { id: 'W', k: 1, p: [50, 0] }]), J(r3));
  const ents = [G, W].map(e => ({ ...e, pts: e.pts.map(q => q.slice()) }));
  for (const m of r3.moves) ents.find(e => e.id === m.id).pts[m.k] = m.p;
  const f = applyCorners(ents, [{ id: 'j', type: 'coincident', refs: r3.join }], [r3.join[0]], 'fillet', 4, newId);
  ok('Lücke: danach abgerundet (ein Linienzug)', f.done === 1 && f.entities.length === 1 && J(f.entities[0].pts) === J([[0, 0], [50, 0], [50, 30]]) && f.entities[0].radii[1] === 4, J(f.entities));
  const P = { id: 'P', type: 'poly', closed: false, pts: [[0, 5], [40, 5]] };
  ok('Parallele Linien: Meldung statt Änderung', /parallel/.test(meetLines([G, P], cornerLineAt([G, P], [10, 0], 1), cornerLineAt([G, P], [10, 5], 1)).error || ''));
  const Z = { id: 'Z', type: 'poly', closed: false, pts: [[0, 10], [20, 10], [20, 40], [40, 40]] };
  const mid = meetLines([G, Z], cornerLineAt([G, Z], [5, 0], 1), { id: 'Z', seg: 1, c: [20, 20] });
  ok('Mittleres Stück eines Linienzugs: nicht verändert', !!mid.error, J(mid));
}
{
  // a line and an arc, two arcs: brought to the intersection nearest to the clicks (the arc along its circle)
  const { meetLines, cornerLineAt, filletCurves, curveCorner } = await import('../js/sketchcorner.js');
  const apply = (ents, r) => ents.map(e => { const m = r.moves.find(q => q.id === e.id); if (!m) return e; const x = { ...e, pts: e.pts.map(q => q.slice()) }; if (m.pts) x.pts = m.pts; else x.pts[m.k] = m.p; return x; });
  const onC = (p, c, r) => Math.abs(Math.hypot(p[0] - c[0], p[1] - c[1]) - r) < 1e-5;
  const H = { id: 'H', type: 'poly', closed: false, pts: [[0, 0], [60, 0]] };
  const U = { id: 'U', type: 'poly', curve: 'arc', closed: false, pts: [[35, 10], [50, 25], [65, 10]] };
  const r = meetLines([H, U], cornerLineAt([H, U], [10, 0], 1), cornerLineAt([H, U], [50, 25.1], 1));
  const x0 = 50 - Math.sqrt(125);
  ok('Linie und Bogen mit Lücke: Linie gestutzt, Bogen auf seinem Kreis verlängert', !r.error && near(r.X, [x0, 0], 1e-5) && r.moves[0].k === 1 && r.moves[1].k === 0
    && near(r.moves[1].pts[0], [x0, 0], 1e-5) && near(r.moves[1].pts[2], [65, 10]) && r.moves[1].pts.every(p => onC(p, [50, 10], 15)), J(r));
  const ents = apply([H, U], r);
  ok('… danach Abrundung zwischen Linie und Bogen möglich', curveCorner(ents, r.join[0]) && !!filletCurves(ents, r.join[0], 3, 'F', newId), J(ents));
  const V = { id: 'V', type: 'poly', curve: 'arc', closed: false, pts: [[50, -10], [60, 0], [50, 10]] };
  const r2 = meetLines([H, V], cornerLineAt([H, V], [55, 0.05], 1), cornerLineAt([H, V], [59.8, -2], 1));
  ok('Linie kreuzt Bogen: beide am nächsten Schnittpunkt gestutzt', !r2.error && near(r2.X, [60, 0], 1e-6) && J(r2.moves[0]) === J({ id: 'H', k: 1, p: [60, 0] })
    && near(r2.moves[1].pts[2], [60, 0], 1e-6) && near(r2.moves[1].pts[0], [50, -10]) && r2.moves[1].pts.every(p => onC(p, [50, 0], 10)), J(r2));
  const W = { id: 'W', type: 'poly', curve: 'arc', closed: false, pts: [[60, -20], [70, -10], [60, 0]] };
  const r3 = meetLines([V, W], cornerLineAt([V, W], [57.07, -7.07], 1), cornerLineAt([V, W], [70, -10], 1));
  ok('Zwei Bögen: am Schnittpunkt ihrer Kreise', !r3.error && r3.moves.every(m => m.pts) && onC(r3.X, [50, 0], 10) && onC(r3.X, [60, -10], 10), J(r3));
  const far = { id: 'Fa', type: 'poly', curve: 'arc', closed: false, pts: [[100, 0], [110, 10], [120, 0]] };
  ok('Bogen weit weg: Meldung', /schneiden sich nirgends/.test(meetLines([V, far], { id: 'V', seg: 0, c: [60, 0] }, { id: 'Fa', seg: 0, c: [110, 10] }).error || ''));
}
