// Sketch corners: fillets (e.radii[k]) and chamfers (e.chamfers[k]) at the vertices of a polyline's
// sketch fillet / chamfer. The stored vertex stays the (virtual) sharp corner; the geometry is built from it.
//   e.radii[k]    = r                → tangent arc of radius r
//   e.chamfers[k] = d | [d1, d2]     → straight cut, d1 along the edge to the previous vertex, d2 to the next
// Corners that do not fit on their edges are scaled down together (and reported as `clamped`).

const TAU = Math.PI * 2;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = v => Math.sqrt(v[0] * v[0] + v[1] * v[1]);

export const hasCorners = e => e?.type === 'poly' && !e.curve && (Object.keys(e.radii || {}).length > 0 || Object.keys(e.chamfers || {}).length > 0);

// the outline as straight and arc segments: [{ k: 'L', a, b } | { k: 'A', a, m, b, c, r }] (+ clamped corners)
export function cornerPlan(e) {
  const P = e.pts.map(p => [+p[0], +p[1]]), n = P.length, closed = !!e.closed && n >= 3;
  const R = e.radii || {}, C = e.chamfers || {};
  const want = new Array(n).fill(null);
  for (let k = 0; k < n; k++) {
    if (!(closed || (k > 0 && k < n - 1))) continue;
    const r = +R[k] || 0, c = C[k];
    if (!(r > 0) && c == null) continue;
    const A = P[(k - 1 + n) % n], B = P[(k + 1) % n], ua = sub(A, P[k]), ub = sub(B, P[k]), la = len(ua), lb = len(ub);
    if (la < 1e-9 || lb < 1e-9) continue;
    const u = [ua[0] / la, ua[1] / la], v = [ub[0] / lb, ub[1] / lb];
    const th = Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]))); // inner angle
    if (th < 1e-4 || th > Math.PI - 1e-4) continue; // no corner
    if (r > 0) { const t = r / Math.tan(th / 2); want[k] = { f: true, tin: t, tout: t, u, v, th }; }
    else {
      const [d1, d2] = Array.isArray(c) ? [+c[0], +(c[1] ?? c[0])] : [+c, +c];
      if (d1 > 0 && d2 > 0) want[k] = { f: false, tin: d1, tout: d2, u, v, th };
    }
  }
  // what does not fit on an edge: both corners of that edge shrink by the same factor
  const scale = new Array(n).fill(1);
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const j = (i + 1) % n, a = want[i]?.tout || 0, b = want[j]?.tin || 0, L = len(sub(P[j], P[i]));
    if (a + b > L + 1e-9) { const s = L / (a + b); scale[i] = Math.min(scale[i], s); scale[j] = Math.min(scale[j], s); }
  }
  const clamped = [];
  // per vertex: where the outline arrives (in), the corner piece, where it leaves (out)
  const corner = P.map((p, k) => {
    const w = want[k];
    if (!w) return { in: p, out: p, seg: null };
    const s = scale[k];
    if (s < 1 - 1e-9) clamped.push(k);
    const T1 = [p[0] + w.u[0] * w.tin * s, p[1] + w.u[1] * w.tin * s], T2 = [p[0] + w.v[0] * w.tout * s, p[1] + w.v[1] * w.tout * s];
    if (!w.f) return { in: T1, out: T2, seg: { k: 'L', a: T1, b: T2 }, d: [w.tin * s, w.tout * s] };
    const r = w.tin * s * Math.tan(w.th / 2), bis = [w.u[0] + w.v[0], w.u[1] + w.v[1]], lb = len(bis), dc = r / Math.sin(w.th / 2);
    const c = [p[0] + (bis[0] / lb) * dc, p[1] + (bis[1] / lb) * dc];
    const m = [c[0] - (bis[0] / lb) * r, c[1] - (bis[1] / lb) * r]; // middle of the arc, towards the sharp corner
    return { in: T1, out: T2, seg: { k: 'A', a: T1, m, b: T2, c, r }, r };
  });
  const segs = [];
  const line = (a, b) => { if (len(sub(b, a)) > 1e-9) segs.push({ k: 'L', a, b }); };
  const piece = q => { if (q.seg && len(sub(q.seg.b, q.seg.a)) > 1e-9) segs.push(q.seg); };
  if (closed) {
    let at = corner[0].out;
    for (let k = 1; k <= n; k++) { const q = corner[k % n]; line(at, q.in); piece(q); at = q.out; }
  } else {
    let at = P[0];
    for (let k = 1; k < n; k++) { const q = corner[k]; line(at, q.in); piece(q); at = q.out; }
  }
  return { segs, closed, clamped, corner };
}

// points of an arc segment, chord error at most tol
export function arcSegPts(s, tol = 0.005) {
  const ang = p => Math.atan2(p[1] - s.c[1], p[0] - s.c[0]);
  const a0 = ang(s.a), am = ang(s.m), norm = x => ((x % TAU) + TAU) % TAU;
  let sw = norm(ang(s.b) - a0);
  if (norm(am - a0) > sw) sw -= TAU;
  const step = 2 * Math.acos(Math.max(-1, 1 - tol / Math.max(s.r, tol)));
  const m = Math.max(2, Math.min(256, Math.ceil(Math.abs(sw) / Math.max(step, 1e-3))));
  const out = [];
  for (let i = 1; i < m; i++) { const a = a0 + (sw * i) / m; out.push([s.c[0] + s.r * Math.cos(a), s.c[1] + s.r * Math.sin(a)]); }
  out.push(s.b);
  return out;
}

// the outline as points (for display, profiles, CAM): arcs within tol
export function cornerPts(e, tol = 0.005) {
  const { segs, closed } = cornerPlan(e);
  if (!segs.length) return e.pts.map(p => [+p[0], +p[1]]);
  const out = [segs[0].a];
  for (const s of segs) {
    if (s.k === 'L') out.push(s.b);
    else out.push(...arcSegPts(s, tol));
  }
  if (closed && out.length > 1 && len(sub(out[0], out[out.length - 1])) < 1e-9) out.pop();
  return out;
}

// ---- adding corners to sketch entities ----
const near = (a, b) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
const plainOpen = e => e?.type === 'poly' && !e.curve && !e.closed && e.pts.length >= 2;
const rekey = (obj, f) => { if (!obj) return obj; const o = {}; for (const [k, v] of Object.entries(obj)) { const nk = f(+k); if (nk != null) o[nk] = v; } return Object.keys(o).length ? o : undefined; };

// rectangle → closed polyline with the same point and line numbers (p0 = x/y, counter-clockwise), kept rectangular
// by horizontal / vertical constraints. Not when the rectangle's centre point is constrained.
function rectToPoly(e, cons, newId) {
  if (cons.some(c => c.refs.includes(`${e.id}:c`))) return null;
  const x0 = +e.x, y0 = +e.y, x1 = x0 + +e.w, y1 = y0 + +e.h;
  const r = +e.r || 0;
  const p = { id: e.id, type: 'poly', closed: true, pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], ...(r > 0 ? { radii: { 0: r, 1: r, 2: r, 3: r } } : {}) };
  if (e.cons) p.cons = true;
  const add = [['horizontal', 0], ['vertical', 1], ['horizontal', 2], ['vertical', 3]].map(([type, l]) => ({ id: newId(), type, refs: [`${e.id}:l${l}`] }));
  return { e: p, add };
}

// reversing a polyline: point k → n-1-k, line k → n-2-k (open)
function reversePoly(e, cons) {
  const n = e.pts.length;
  e.pts = e.pts.slice().reverse();
  e.radii = rekey(e.radii, k => n - 1 - k);
  e.chamfers = rekey(e.chamfers, k => n - 1 - k);
  if (e.chamfers) for (const k of Object.keys(e.chamfers)) if (Array.isArray(e.chamfers[k])) e.chamfers[k] = e.chamfers[k].slice().reverse();
  const map = ref => {
    const [id, s] = ref.split(':');
    if (id !== e.id || !s) return ref;
    if (s[0] === 'p') return `${id}:p${n - 1 - +s.slice(1)}`;
    if (s[0] === 'l') return `${id}:l${n - 2 - +s.slice(1)}`;
    return ref;
  };
  for (const c of cons) c.refs = c.refs.map(map);
}

// two open polylines that meet at J become one (the corner at J can then be rounded): A … J … B
function mergeAt(ents, cons, A, B, J) {
  if (near(A.pts[0], J)) reversePoly(A, cons);
  if (near(B.pts[B.pts.length - 1], J)) reversePoly(B, cons);
  const nA = A.pts.length, nB = B.pts.length;
  let pts = [...A.pts, ...B.pts.slice(1)];
  const radii = { ...(A.radii || {}) }, chamfers = { ...(A.chamfers || {}) };
  for (const [k, v] of Object.entries(B.radii || {})) radii[nA - 1 + +k] = v;
  for (const [k, v] of Object.entries(B.chamfers || {})) chamfers[nA - 1 + +k] = v;
  // A's start meets B's end: a closed loop
  let closed = false;
  if (pts.length >= 4 && near(pts[0], pts[pts.length - 1])) { pts = pts.slice(0, -1); closed = true; }
  const N = pts.length;
  const map = ref => {
    const [id, s] = ref.split(':');
    if (id !== B.id || !s) return ref;
    if (s[0] === 'p') return `${A.id}:p${(nA - 1 + +s.slice(1)) % N}`;
    if (s[0] === 'l') return `${A.id}:l${nA - 1 + +s.slice(1)}`;
    return ref;
  };
  for (const c of cons) c.refs = c.refs.map(map);
  if (closed && radii[N] != null) { radii[0] = radii[N]; delete radii[N]; }
  if (closed && chamfers[N] != null) { chamfers[0] = chamfers[N]; delete chamfers[N]; }
  A.pts = pts;
  A.closed = closed || undefined;
  A.radii = Object.keys(radii).length ? radii : undefined;
  A.chamfers = Object.keys(chamfers).length ? chamfers : undefined;
  ents.splice(ents.indexOf(B), 1);
}

// Rounds (kind 'fillet', value r) or chamfers (kind 'chamfer', value d or [d1, d2]) the picked corners; value 0
// removes them. picks: point refs 'id:pK' (polyline vertices, rectangle corners, ends of lines that meet).
// Returns { entities, constraints, done, skipped, changed } as new arrays (the input is not changed); changed =
// ids of entities that were rebuilt (rectangle → polyline, joined lines), all others only got radii / chamfers.
export function applyCorners(entities, constraints, picks, kind, value, newId) {
  const ents = JSON.parse(JSON.stringify(entities)), cons = JSON.parse(JSON.stringify(constraints || []));
  // where each pick lies: the entity may be renumbered or merged on the way
  const targets = picks.map(ref => {
    const [id, s] = ref.split(':'), e = ents.find(x => x.id === id), k = +String(s).slice(1);
    if (!e || !s || s[0] !== 'p') return null;
    if (e.type === 'rect') return { id, p: [[+e.x, +e.y], [+e.x + +e.w, +e.y], [+e.x + +e.w, +e.y + +e.h], [+e.x, +e.y + +e.h]][k] };
    return e.pts?.[k] ? { id, p: [+e.pts[k][0], +e.pts[k][1]] } : null;
  });
  const alias = {}, changed = new Set();
  const live = id => { while (alias[id]) id = alias[id]; return id; };
  let done = 0, skipped = 0;
  for (const t of targets) {
    if (!t) { skipped++; continue; }
    let e = ents.find(x => x.id === live(t.id));
    if (e?.type === 'rect') {
      const rp = rectToPoly(e, cons, newId);
      if (!rp) { skipped++; continue; }
      ents[ents.indexOf(e)] = rp.e;
      changed.add(e.id);
      cons.push(...rp.add);
      e = rp.e;
    }
    if (e?.type !== 'poly' || e.curve) { skipped++; continue; }
    let k = e.pts.findIndex(q => near([+q[0], +q[1]], t.p));
    if (k < 0) { skipped++; continue; }
    // the end of an open polyline: join it with the line that ends there
    if (!e.closed && (k === 0 || k === e.pts.length - 1)) {
      const other = ents.find(x => x !== e && plainOpen(x) && (near(x.pts[0], t.p) || near(x.pts[x.pts.length - 1], t.p)));
      if (!other) { skipped++; continue; }
      if (!plainOpen(e)) { skipped++; continue; }
      // the one drawn first keeps its id and direction
      const [keep, gone] = ents.indexOf(other) < ents.indexOf(e) ? [other, e] : [e, other];
      mergeAt(ents, cons, keep, gone, t.p);
      changed.add(keep.id); changed.add(gone.id);
      alias[gone.id] = keep.id;
      e = keep;
      k = e.pts.findIndex(q => near([+q[0], +q[1]], t.p));
      if (k < 0) { skipped++; continue; }
    }
    const v = Array.isArray(value) ? value.map(Number) : +value;
    const zero = Array.isArray(v) ? !(v[0] > 0) : !(v > 0);
    e.radii ||= {}; e.chamfers ||= {};
    delete e.radii[k]; delete e.chamfers[k];
    if (!zero) {
      if (kind === 'fillet') e.radii[k] = Array.isArray(v) ? v[0] : v;
      else e.chamfers[k] = Array.isArray(v) && v.length > 1 && v[1] > 0 && Math.abs(v[1] - v[0]) > 1e-12 ? [v[0], v[1]] : Array.isArray(v) ? v[0] : v;
    }
    if (!Object.keys(e.radii).length) delete e.radii;
    if (!Object.keys(e.chamfers).length) delete e.chamfers;
    done++;
  }
  // constraints that merged onto one point (the coincidence of the joined ends) are dropped
  const out = cons.filter(c => !(c.refs.length === 2 && c.refs[0] === c.refs[1]));
  return { entities: ents, constraints: out, done, skipped, changed: [...changed] };
}

// The corner nearest to p (within tol) that can be rounded / chamfered: inner vertices of polylines, rectangle
// corners and points where two separate lines meet → { ref, p } or null
export function cornerAt(entities, p, tol) {
  let best = null, bd = tol;
  const consider = (ref, q) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = { ref, p: q }; } };
  for (const e of entities) {
    if (e.cons) continue;
    if (e.type === 'rect' && +e.w > 0 && +e.h > 0) {
      [[+e.x, +e.y], [+e.x + +e.w, +e.y], [+e.x + +e.w, +e.y + +e.h], [+e.x, +e.y + +e.h]].forEach((q, k) => consider(`${e.id}:p${k}`, q));
    } else if (e.type === 'poly' && !e.curve) {
      const n = e.pts.length;
      e.pts.forEach((q0, k) => {
        const q = [+q0[0], +q0[1]];
        if (e.closed || (k > 0 && k < n - 1)) return consider(`${e.id}:p${k}`, q);
        if (e.closed) return;
        const joined = entities.some(x => x !== e && !x.cons && plainOpen(x) && (near(x.pts[0].map(Number), q) || near(x.pts[x.pts.length - 1].map(Number), q)));
        if (joined || curveCorner(entities, `${e.id}:p${k}`)) consider(`${e.id}:p${k}`, q);
      });
    } else if (isArcE(e)) {
      // the end of an arc where a line or another arc ends
      for (const k of [0, 2]) if (curveCorner(entities, `${e.id}:p${k}`)) consider(`${e.id}:p${k}`, [+e.pts[k][0], +e.pts[k][1]]);
    }
  }
  return best;
}

// ---- a rounding between a line and an arc, or between two arcs ----
const isArcE = e => e?.type === 'poly' && e.curve === 'arc' && e.pts.length === 3;
const norm = x => ((x % TAU) + TAU) % TAU;
function circle3(a, m, b) {
  const d = 2 * (a[0] * (m[1] - b[1]) + m[0] * (b[1] - a[1]) + b[0] * (a[1] - m[1]));
  if (Math.abs(d) < 1e-12) return null;
  const A = a[0] * a[0] + a[1] * a[1], M = m[0] * m[0] + m[1] * m[1], B = b[0] * b[0] + b[1] * b[1];
  const c = [(A * (m[1] - b[1]) + M * (b[1] - a[1]) + B * (a[1] - m[1])) / d, (A * (b[0] - m[0]) + M * (a[0] - b[0]) + B * (m[0] - a[0])) / d];
  return { c, r: len(sub(a, c)) };
}
// the curve that ends at P, seen from P: a line (direction d, length L) or an arc (circle, its sweep away from P)
function curveEnd(e, k) {
  const P = [+e.pts[k][0], +e.pts[k][1]];
  if (isArcE(e)) {
    const E = e.pts[2 - k].map(Number), M = e.pts[1].map(Number), ci = circle3(P, M, E);
    if (!ci) return null;
    const ang = p => Math.atan2(p[1] - ci.c[1], p[0] - ci.c[0]), a0 = ang(P);
    let sw = norm(ang(E) - a0);
    if (norm(ang(M) - a0) > sw) sw -= TAU;
    return { kind: 'A', e, k, P, c: ci.c, R: ci.r, a0, sw, E, ref: `${e.id}:o`,
      // how far along the arc a point lies (mm from P), null when it is not on the arc
      at(T) { const da = sw > 0 ? norm(ang(T) - a0) : -norm(a0 - ang(T)); return Math.abs(da) > 1e-9 && Math.abs(da) < Math.abs(sw) - 1e-9 ? { s: Math.abs(da) * ci.r, da } : null; } };
  }
  const n = e.pts.length, Q = e.pts[k === 0 ? 1 : n - 2].map(Number), L = len(sub(Q, P));
  if (L < 1e-9) return null;
  // (a rounded or chamfered neighbour corner takes its share of the line)
  const nb = k === 0 ? 1 : n - 2, plan = n > 2 && (e.radii?.[nb] != null || e.chamfers?.[nb] != null) ? cornerPlan(e).corner[nb] : null;
  const free = plan ? len(sub(k === 0 ? plan.in : plan.out, P)) : L;
  return { kind: 'L', e, k, P, d: [(Q[0] - P[0]) / L, (Q[1] - P[1]) / L], L: free, ref: `${e.id}:l${k === 0 ? 0 : n - 2}` };
}
// the two curves that end at the point of ref, when at least one of them is an arc
function curvePair(entities, ref) {
  const [id, s] = String(ref).split(':'), e0 = entities.find(x => x.id === id), k0 = +String(s || '').slice(1);
  if (!e0 || !s || s[0] !== 'p' || !e0.pts?.[k0] || e0.cons) return null;
  const P = e0.pts[k0].map(Number), ends = [];
  for (const e of entities) {
    if (e.cons) continue;
    if (isArcE(e)) { for (const k of [0, 2]) if (near(e.pts[k].map(Number), P)) ends.push([e, k]); }
    else if (plainOpen(e)) { for (const k of [0, e.pts.length - 1]) if (near(e.pts[k].map(Number), P)) ends.push([e, k]); }
  }
  if (ends.length !== 2 || ends[0][0] === ends[1][0] || !ends.some(q => isArcE(q[0]))) return null;
  const a = curveEnd(...ends[0]), b = curveEnd(...ends[1]);
  return a && b ? [a, b] : null;
}
export const curveCorner = (entities, ref) => !!curvePair(entities, ref);

/**
 * Rounds the corner where a line meets an arc or two arcs meet: both are cut back to where the rounding touches
 * them and a new arc (id arcId) joins them. Returns { moves: [{ id, pts }] (the new points of the two curves),
 * arc (the new entity), drop (refs of the two ends that no longer coincide), cons (constraints that hold the
 * rounding: ends on the curves, tangent to both) } – or null where no rounding of this radius fits.
 */
export function filletCurves(entities, ref, r, arcId, newId) {
  const pair = curvePair(entities, ref);
  if (!pair || !(r > 0)) return null;
  const [A, B] = pair, P = A.P, cand = [];
  // where the centre may lie: r beside each curve
  const loci = X => X.kind === 'L' ? [1, -1].map(s => ({ o: [P[0] - X.d[1] * s * r, P[1] + X.d[0] * s * r], d: X.d })) : [1, -1].filter(s => X.R + s * r > 1e-9).map(s => ({ c: X.c, R: X.R + s * r }));
  const meet = (p, q) => {
    if (p.d && q.d) { const den = p.d[0] * q.d[1] - p.d[1] * q.d[0]; if (Math.abs(den) < 1e-12) return []; const w = sub(q.o, p.o), u = (w[0] * q.d[1] - w[1] * q.d[0]) / den; return [[p.o[0] + p.d[0] * u, p.o[1] + p.d[1] * u]]; }
    if (p.d || q.d) {
      const [l, c] = p.d ? [p, q] : [q, p], w = sub(l.o, c.c), b = w[0] * l.d[0] + w[1] * l.d[1], disc = b * b - (w[0] * w[0] + w[1] * w[1] - c.R * c.R);
      if (disc < 0) return [];
      return [-b - Math.sqrt(disc), -b + Math.sqrt(disc)].map(u => [l.o[0] + l.d[0] * u, l.o[1] + l.d[1] * u]);
    }
    const w = sub(q.c, p.c), D = len(w);
    if (D < 1e-12 || D > p.R + q.R || D < Math.abs(p.R - q.R)) return [];
    const a = (p.R * p.R - q.R * q.R + D * D) / (2 * D), hh = Math.sqrt(Math.max(0, p.R * p.R - a * a)), m = [p.c[0] + (w[0] * a) / D, p.c[1] + (w[1] * a) / D];
    return [[m[0] - (w[1] * hh) / D, m[1] + (w[0] * hh) / D], [m[0] + (w[1] * hh) / D, m[1] - (w[0] * hh) / D]];
  };
  // where the rounding with the centre O touches a curve, and how far that is from P along it
  const touch = (X, O) => {
    if (X.kind === 'L') { const u = (O[0] - P[0]) * X.d[0] + (O[1] - P[1]) * X.d[1]; return u > 1e-9 && u <= X.L + 1e-9 ? { T: [P[0] + X.d[0] * u, P[1] + X.d[1] * u], s: u } : null; }
    const w = sub(O, X.c), l = len(w);
    if (l < 1e-12) return null;
    const T = [X.c[0] + (w[0] / l) * X.R, X.c[1] + (w[1] / l) * X.R], at = X.at(T);
    return at ? { T, s: at.s, da: at.da } : null;
  };
  for (const p of loci(A)) for (const q of loci(B)) for (const O of meet(p, q)) {
    const ta = touch(A, O), tb = touch(B, O);
    if (ta && tb && len(sub(ta.T, tb.T)) > 1e-7) cand.push({ O, ta, tb, s: ta.s + tb.s });
  }
  if (!cand.length) return null;
  cand.sort((x, y) => x.s - y.s);
  const { O, ta, tb } = cand[0], r6 = p => [+p[0].toFixed(6), +p[1].toFixed(6)];
  let mid = [ta.T[0] + tb.T[0] - 2 * O[0], ta.T[1] + tb.T[1] - 2 * O[1]];
  if (len(mid) < 1e-9) mid = sub(P, O);
  const M = [O[0] + (mid[0] / len(mid)) * r, O[1] + (mid[1] / len(mid)) * r];
  const cut = (X, t) => {
    const pts = X.e.pts.map(p => [p[0], p[1]]);
    pts[X.k] = r6(t.T);
    if (X.kind === 'A') { const am = X.a0 + (t.da + X.sw) / 2; pts[1] = r6([X.c[0] + X.R * Math.cos(am), X.c[1] + X.R * Math.sin(am)]); }
    return { id: X.e.id, pts };
  };
  const arc = { id: arcId, type: 'poly', curve: 'arc', closed: false, pts: [r6(ta.T), r6(M), r6(tb.T)] };
  const cons = [
    { id: newId(), type: 'coincident', refs: [`${arcId}:p0`, `${A.e.id}:p${A.k}`] }, { id: newId(), type: 'coincident', refs: [`${arcId}:p2`, `${B.e.id}:p${B.k}`] },
    { id: newId(), type: 'tangent', refs: [A.ref, `${arcId}:o`] }, { id: newId(), type: 'tangent', refs: [B.ref, `${arcId}:o`] },
  ];
  return { moves: [cut(A, ta), cut(B, tb)], arc, drop: [`${A.e.id}:p${A.k}`, `${B.e.id}:p${B.k}`], cons, r, centre: O };
}

// outline of the entity with the corner at ref changed (for the preview while hovering)
export function cornerPreview(entities, ref, kind, value) {
  if (curveCorner(entities, ref)) {
    const f = kind === 'fillet' ? filletCurves(entities, ref, Array.isArray(value) ? +value[0] : +value, 'tmp', () => 'tmp') : null;
    return f ? { pts: [f.arc.pts[0], ...arcSegPts({ a: f.arc.pts[0], m: f.arc.pts[1], b: f.arc.pts[2], c: f.centre, r: f.r })], closed: false } : null;
  }
  const res = applyCorners(entities, [], [ref], kind, value, () => 'tmp');
  if (!res.done) return null;
  const [id] = ref.split(':');
  const e = res.entities.find(x => x.id === id) || res.entities.find(x => !entities.some(y => y.id === x.id && JSON.stringify(y) === JSON.stringify(x)));
  return e ? { pts: cornerPts(e), closed: !!e.closed } : null;
}
