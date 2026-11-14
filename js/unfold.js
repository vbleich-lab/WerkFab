// A body that is a bent sheet (drawn elsewhere, read from a STEP file, built from extrusions) read back as sheet
// metal: its thickness, its bends and its flat pattern, found from the faces of the body alone.
//
// faces = [{ plane (a flat face?), n (its unit normal, pointing out of the body), loops: [{ pts: [[x, y, z], …],
// circle?: { c, r } }] (flat faces only), keys: [one text per edge – the same text on the two faces it joins] }]
import { bendAllowance } from './sheetmetal.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]), unit = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const area2 = p => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; };
// area of a flat loop in space (seen against its normal)
const area3 = (pts, n) => { let s = [0, 0, 0]; for (let i = 0; i < pts.length; i++) s = add(s, cross(pts[i], pts[(i + 1) % pts.length])); return dot(s, n) / 2; };

/**
 * Returns { t, r, k, outline (closed outlines of the blank; the first is the outer one, counter-clockwise), holes:
 * [{ pts } | { c, r }], folds: [{ a, b, angle (+ = bent up towards +Z), r }], aligned (the blank lies where the
 * largest face of the body lies, on a plane parallel to XY), z0 (underside of the blank), faces, area, overlap,
 * notes: [texts] } – or throws with what keeps the body from being a sheet.
 */
export function unfoldFaces(faces, opts = {}) {
  const L = globalThis.ClipperLib || globalThis.window?.ClipperLib;
  const P = faces.map((f, i) => {
    if (!f.plane || !f.loops?.length) return null;
    const n = unit(f.n), all = f.loops.flatMap(l => l.pts);
    const lo = [0, 1, 2].map(a => Math.min(...all.map(p => p[a]))), hi = [0, 1, 2].map(a => Math.max(...all.map(p => p[a])));
    const as = f.loops.map(l => Math.abs(area3(l.pts, n))), big = Math.max(...as);
    return { i, n, D: dot(n, all[0]), all, lo, hi, area: 2 * big - as.reduce((a, b) => a + b, 0), outer: as.indexOf(big) };
  });
  const flat = P.filter(Boolean);
  if (!flat.length) throw new Error('Der Körper hat keine ebene Fläche');
  const boxLap = (a, b, e) => [0, 1, 2].every(q => a.lo[q] <= b.hi[q] + e && b.lo[q] <= a.hi[q] + e);
  let root = flat.reduce((a, b) => (b.area > a.area ? b : a));
  // the thickness: the nearest face behind the largest one, lying against it
  let t = Infinity;
  for (const q of flat) {
    if (q === root || dot(q.n, root.n) > -1 + 1e-6 || q.area < 0.3 * root.area) continue;
    const d = root.D + q.D;
    if (d > 1e-6 && d < t && boxLap(root, q, d + 1e-6)) t = d;
  }
  if (!Number.isFinite(t)) throw new Error('Keine Gegenfläche zur größten Fläche – der Körper ist kein Blech gleicher Dicke');
  if (t > Math.sqrt(root.area) / 1.5) throw new Error('Der Körper ist zu dick für ein Blech');
  const tol = Math.max(1e-4, 2e-3 * t);
  const partner = new Map();
  for (const a of flat) {
    let best = null;
    for (const b of flat) if (b !== a && dot(a.n, b.n) < -1 + 1e-6 && Math.abs(a.D + b.D - t) < tol && boxLap(a, b, t + tol) && (!best || b.area > best.area)) best = b;
    if (best) partner.set(a, best);
  }
  // the faces that share an edge
  const byKey = new Map(), neigh = faces.map(() => new Set());
  faces.forEach((f, i) => { for (const k of f.keys || []) { if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(i); } });
  for (const l of byKey.values()) for (const a of l) for (const b of l) if (a !== b) neigh[a].add(b);
  // … directly (a sharp bend) or across a round face (the bend itself)
  const link = (a, b) => neigh[a.i].has(b.i) || [...neigh[a.i]].some(c => !faces[c].plane && neigh[c].has(b.i));
  // the side that is kept: the one looking up, where the largest face or its other side does
  if (partner.get(root) && partner.get(root).n[2] > root.n[2]) root = partner.get(root);
  const aligned = root.n[2] > 1 - 1e-7, k = +opts.k > 0 ? +opts.k : 0.42, notes = [];
  const U0 = aligned ? [1, 0, 0] : unit(Math.abs(root.n[2]) < 0.9 ? cross([0, 0, 1], root.n) : cross([0, 1, 0], root.n));
  const mapOf = new Map([[root, { O: aligned ? [0, 0, root.D] : root.all[0], U: U0, V: cross(root.n, U0), o2: [0, 0], u2: [1, 0], v2: [0, 1] }]]);
  const lin = (m, w) => { const a = dot(w, m.U), b = dot(w, m.V); return [m.u2[0] * a + m.v2[0] * b, m.u2[1] * a + m.v2[1] * b]; };
  const to2 = (m, p) => { const q = lin(m, sub(p, m.O)); return [m.o2[0] + q[0], m.o2[1] + q[1]]; };
  const used = new Set([root, partner.get(root)]), queue = [root], folds = [], zones = [], radii = [];
  let lapOk = 0;
  // how far a face stays away from the line X0 + s·d (it lies in the plane of the face)
  const setback = (fc, X0, d) => Math.min(...fc.all.map(p => { const w = sub(p, X0); return len(sub(w, mul(d, dot(w, d)))); }));
  while (queue.length) {
    const a = queue.shift(), pa = partner.get(a), ma = mapOf.get(a);
    for (const q of flat) {
      if (used.has(q) || !partner.has(q)) continue;
      let c = link(a, q) ? q : pa && link(pa, q) ? partner.get(q) : null;
      if (!c || used.has(c)) continue;
      const dd = cross(a.n, c.n);
      if (len(dd) < 1e-6) continue; // a hem or a face in the same plane: not across one bend
      const d = unit(dd), o1 = unit(cross(d, a.n));
      // (a round face may join this side to the far side of the neighbour: the side that looks the right way is taken –
      // seen from this face, the neighbour's own side looks back over the bend where it rises, away where it drops)
      { const mc = mul(c.all.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / c.all.length), ma0 = mul(a.all.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / a.all.length);
        const away = dot(sub(mc, ma0), o1) < 0 ? mul(o1, -1) : o1, rise = dot(sub(mc, a.all[0]), a.n);
        if (rise * dot(c.n, away) > 1e-9) { c = partner.get(c); if (!c || used.has(c)) continue; } }
      const pc = partner.get(c);
      // the line where the two planes of this side meet
      const lineOf = (f1, f2) => { const m = [f1.n, f2.n, d], rhs = [f1.D, f2.D, dot(d, a.all[0])], det = dot(m[0], cross(m[1], m[2])); return mul(add(add(mul(cross(m[1], m[2]), rhs[0]), mul(cross(m[2], m[0]), rhs[1])), mul(cross(m[0], m[1]), rhs[2])), 1 / det); };
      const X0 = lineOf(a, c), mid = f => mul(f.all.reduce((s, p) => add(s, p), [0, 0, 0]), 1 / f.all.length);
      let out1 = unit(cross(d, a.n)), in2 = unit(cross(d, c.n));
      if (dot(sub(X0, mid(a)), out1) < 0) out1 = mul(out1, -1);
      if (dot(sub(mid(c), X0), in2) < 0) in2 = mul(in2, -1);
      const th = Math.acos(Math.max(-1, Math.min(1, dot(out1, in2)))), up = dot(in2, a.n) > 0, tn = Math.tan(th / 2);
      if (th < 1e-4 || th > 3.1) continue;
      // the inner radius: how far the inner faces stay away from the line they would meet in
      const [i1, i2] = up ? [a, c] : [pa, pc], Xi = up ? X0 : lineOf(pa, pc), s1 = setback(i1, Xi, d), s2 = setback(i2, Xi, d);
      const r = Math.round((Math.min(s1, s2) / tn) * 1e4) / 1e4;
      if (Math.abs(s1 - s2) > 0.02 * t + 1e-3) notes.push('uneven');
      const s = (up ? r : r + t) * tn, ba = bendAllowance((th * 180) / Math.PI, r, t, k);
      const x2 = to2(ma, X0), d2 = lin(ma, d), o2 = lin(ma, out1);
      mapOf.set(c, { O: X0, U: d, V: in2, o2: [x2[0] + o2[0] * (ba - 2 * s), x2[1] + o2[1] * (ba - 2 * s)], u2: d2, v2: o2 });
      // along the bend: where both faces reach it
      const reach = f => { const v = f.all.filter(p => { const w = sub(p, X0); return len(sub(w, mul(d, dot(w, d)))) <= s + 1e-3 + 0.01 * t; }).map(p => dot(sub(p, X0), d)); return v.length ? [Math.min(...v), Math.max(...v)] : null; };
      const ra = reach(a), rc = reach(c);
      let lo = Math.max(ra?.[0] ?? -Infinity, rc?.[0] ?? -Infinity), hi = Math.min(ra?.[1] ?? Infinity, rc?.[1] ?? Infinity);
      if (!(hi > lo + 1e-6) || !Number.isFinite(hi - lo)) { const v = [...a.all, ...c.all].map(p => dot(sub(p, X0), d)); lo = Math.min(...v); hi = Math.max(...v); }
      const at = (u, w) => [x2[0] + d2[0] * u + o2[0] * w, x2[1] + d2[1] * u + o2[1] * w];
      zones.push([at(lo, -s - 0.01), at(hi, -s - 0.01), at(hi, ba - s + 0.01), at(lo, ba - s + 0.01)]);
      lapOk += (hi - lo) * (0.03 + Math.max(0, s - setback(a, X0, d)) + Math.max(0, s - setback(c, X0, d)));
      folds.push({ a: at(lo, ba / 2 - s), b: at(hi, ba / 2 - s), angle: ((up ? 1 : -1) * th * 180) / Math.PI, r });
      radii.push(r);
      used.add(c); used.add(pc); queue.push(c);
    }
  }
  const skins = [...mapOf.keys()];
  if (flat.some(q => partner.has(q) && !used.has(q) && q.area > 4 * t * t)) notes.push('left');
  // the radius of the sheet: the one most bends have
  const count = new Map();
  for (const r of radii) { const key = Math.round(r * 100) / 100; count.set(key, (count.get(key) || 0) + 1); }
  const r = radii.length ? [...count].sort((p, q) => q[1] - p[1])[0][0] : Math.round(t * 100) / 100;
  if (count.size > 1) notes.push('radii');
  const polys = [], holes = [];
  for (const fc of skins) {
    const m = mapOf.get(fc), f = faces[fc.i];
    f.loops.forEach((lp, j) => {
      const pts = lp.pts.map(p => to2(m, p));
      if (j === fc.outer) polys.push(area2(pts) < 0 ? pts.reverse() : pts);
      else if (lp.circle) holes.push({ c: to2(m, lp.circle.c), r: lp.circle.r });
      else holes.push({ pts: area2(pts) < 0 ? pts.reverse() : pts });
    });
  }
  const S = 1000, toC = p => p.map(([x, y]) => ({ X: Math.round(x * S), Y: Math.round(y * S) }));
  const c = new L.Clipper(), res = new L.Paths();
  c.AddPaths([...polys, ...zones.map(z => (area2(z) < 0 ? z.slice().reverse() : z))].map(toC), L.PolyType.ptSubject, true);
  c.Execute(L.ClipType.ctUnion, res, L.PolyFillType.pftNonZero, L.PolyFillType.pftNonZero);
  const clean = L.Clipper.CleanPolygons(res, 2).filter(p => p.length >= 3).map(p => p.map(q => [q.X / S, q.Y / S]));
  const outer = clean.filter(p => area2(p) > 0).sort((p, q) => area2(q) - area2(p));
  if (!outer.length) throw new Error('Keine Abwicklung gefunden');
  if (outer.length > 1) notes.push('parts');
  for (const p of clean) if (area2(p) < 0 && Math.abs(area2(p)) > 1e-3) holes.push({ pts: p.slice().reverse() });
  const sum = polys.reduce((s, p) => s + Math.abs(area2(p)), 0) + zones.reduce((s, p) => s + Math.abs(area2(p)), 0);
  const joined = clean.reduce((s, p) => s + area2(p), 0);
  const holeArea = holes.reduce((s, q) => s + (q.pts ? Math.abs(area2(q.pts)) : Math.PI * q.r * q.r), 0);
  return { t: Math.round(t * 1e4) / 1e4, r, k, outline: outer, holes, folds, aligned, z0: aligned ? root.D - t : 0, faces: skins.length, area: outer.reduce((s, p) => s + area2(p), 0) - holeArea,
    overlap: sum - joined > 0.5 + 1e-3 * sum + lapOk, notes: [...new Set(notes)] };
}
