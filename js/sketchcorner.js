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
// by horizontal / vertical constraints. A centre held on a point (centre rectangle on the origin) is kept by a
// construction diagonal whose midpoint lies there; other constraints on the centre: not possible (null).
const isPointRef = r => r === 'origin' || /:(pd+|c)$/.test(r);
function rectToPoly(e, cons, newId) {
  const cref = `${e.id}:c`, onC = cons.filter(c => c.refs.includes(cref));
  if (onC.some(c => c.type !== 'coincident' || c.refs.length !== 2 || !isPointRef(c.refs.find(r => r !== cref) || ''))) return null;
  const x0 = +e.x, y0 = +e.y, x1 = x0 + +e.w, y1 = y0 + +e.h;
  const r = +e.r || 0;
  const p = { id: e.id, type: 'poly', closed: true, pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], ...(r > 0 ? { radii: { 0: r, 1: r, 2: r, 3: r } } : {}) };
  if (e.cons) p.cons = true;
  const add = [['horizontal', 0], ['vertical', 1], ['horizontal', 2], ['vertical', 3]].map(([type, l]) => ({ id: newId(), type, refs: [`${e.id}:l${l}`] }));
  if (!onC.length) return { e: p, add };
  const did = 'e' + newId(), diag = { id: did, type: 'poly', cons: true, closed: false, pts: [[x0, y0], [x1, y1]] };
  add.push({ id: newId(), type: 'coincident', refs: [`${did}:p0`, `${e.id}:p0`] }, { id: newId(), type: 'coincident', refs: [`${did}:p1`, `${e.id}:p2`] },
    ...onC.map(c => ({ id: newId(), type: 'midpoint', refs: [c.refs.find(r => r !== cref), `${did}:l0`] })));
  return { e: p, add, extra: diag, drop: onC.map(c => c.id) };
}

// corners of a regular polygon (same order as its outline)
const ngonPts = e => {
  if (!(+e.r > 0) || +e.n < 3) return [];
  const rot = ((+e.rot || 0) * Math.PI) / 180 + Math.PI / 2;
  return Array.from({ length: +e.n }, (_, i) => [+e.cx + +e.r * Math.cos(rot + (i * 2 * Math.PI) / +e.n), +e.cy + +e.r * Math.sin(rot + (i * 2 * Math.PI) / +e.n)]);
};
// regular polygon → closed polyline, kept regular: corners on a construction circle (centre and radius of the
// polygon; constraints on the polygon's centre move to it) and all sides equal. The circle carries of: polygon id.
function ngonToPoly(e, cons, newId) {
  const pts = ngonPts(e), n = pts.length;
  if (n < 3) return null;
  const cid = 'e' + newId(), circ = { id: cid, type: 'circle', cons: true, cx: +e.cx, cy: +e.cy, r: +e.r, of: e.id };
  for (const c of cons) c.refs = c.refs.map(r => (r === `${e.id}:c` ? `${cid}:c` : r));
  const p = { id: e.id, type: 'poly', closed: true, pts: pts.map(q => [+q[0].toFixed(6), +q[1].toFixed(6)]) };
  if (e.cons) p.cons = true;
  const add = [];
  for (let k = 0; k < n; k++) add.push({ id: newId(), type: 'coincident', refs: [`${e.id}:p${k}`, `${cid}:o`] });
  for (let k = 0; k < n - 1; k++) add.push({ id: newId(), type: 'equal', refs: [`${e.id}:l${k}`, `${e.id}:l${k + 1}`] });
  return { e: p, add, extra: circ };
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
    if (e.type === 'ngon') return ngonPts(e)[k] ? { id, p: ngonPts(e)[k] } : null;
    return e.pts?.[k] ? { id, p: [+e.pts[k][0], +e.pts[k][1]] } : null;
  });
  const alias = {}, changed = new Set();
  const live = id => { while (alias[id]) id = alias[id]; return id; };
  let done = 0, skipped = 0;
  for (const t of targets) {
    if (!t) { skipped++; continue; }
    let e = ents.find(x => x.id === live(t.id));
    if (e?.type === 'rect' || e?.type === 'ngon') {
      const rp = e.type === 'rect' ? rectToPoly(e, cons, newId) : ngonToPoly(e, cons, newId);
      if (!rp) { skipped++; continue; }
      ents[ents.indexOf(e)] = rp.e;
      changed.add(e.id);
      if (rp.extra) ents.push(rp.extra);
      if (rp.drop) for (const id of rp.drop) cons.splice(cons.findIndex(c => c.id === id), 1);
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
    } else if (e.type === 'ngon') {
      ngonPts(e).forEach((q, k) => consider(`${e.id}:p${k}`, q));
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
  // a rounding or chamfer that is an entity of its own: picked at its middle, to change or remove it
  for (const e of entities) {
    if (e.cons || !(isArcE(e) || (e.chamfer && plainOpen(e) && e.pts.length === 2)) || !bridge(entities, e.id)) continue;
    consider(`${e.id}:b`, e.pts.length === 3 ? [+e.pts[1][0], +e.pts[1][1]] : [(+e.pts[0][0] + +e.pts[1][0]) / 2, (+e.pts[0][1] + +e.pts[1][1]) / 2]);
  }
  return best;
}

// ---- two lines that do not meet in a corner (they cross, or end short of each other) ----
const segDist2 = (p, a, b) => {
  const d = sub(b, a), L2 = d[0] * d[0] + d[1] * d[1], t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / L2)) : 0;
  return len(sub(p, [a[0] + d[0] * t, a[1] + d[1] * t]));
};
// the line or arc under p that can be cut back or lengthened to meet another one: a line, the first / last segment
// of an open polyline, or a 3-point arc → { id, seg, c: the clicked point } or null
export function cornerLineAt(entities, p, tol) {
  let best = null, bd = tol;
  for (const e of entities) {
    if (e.cons) continue;
    if (isArcE(e)) {
      const C = curveOf(e, 0);
      if (!C) continue;
      const t = C.par(p);
      if (t > C.S + 1e-9) continue;
      const d = Math.abs(len(sub(p, C.c)) - C.r);
      if (d < bd) { bd = d; best = { id: e.id, seg: 0, c: [+p[0], +p[1]] }; }
      continue;
    }
    if (!plainOpen(e)) continue;
    const n = e.pts.length;
    for (const sg of n === 2 ? [0] : [0, n - 2]) {
      const d = segDist2(p, e.pts[sg].map(Number), e.pts[sg + 1].map(Number));
      if (d < bd) { bd = d; best = { id: e.id, seg: sg, c: [+p[0], +p[1]] }; }
    }
  }
  return best;
}
// a picked line (segment seg) or arc as geometry: lines P→Q, arcs circle c / r from angle a0 sweeping sw (signed)
function curveOf(e, seg) {
  if (isArcE(e)) {
    const [A, M, B] = e.pts.map(q => q.map(Number)), ci = circle3(A, M, B);
    if (!ci) return null;
    const ang = q => Math.atan2(q[1] - ci.c[1], q[0] - ci.c[0]), a0 = ang(A);
    let sw = norm(ang(B) - a0);
    if (norm(ang(M) - a0) > sw) sw -= TAU;
    const dir = Math.sign(sw) || 1;
    // param of a point: the angle from the start in the direction of the arc, 0 … 2π
    return { kind: 'A', e, c: ci.c, r: ci.r, a0, dir, S: Math.abs(sw), A, B, ang, par: q => norm(dir * (ang(q) - a0)) };
  }
  if (!plainOpen(e) || !e.pts[seg + 1]) return null;
  return { kind: 'L', e, seg, P: e.pts[seg].map(Number), Q: e.pts[seg + 1].map(Number) };
}
// where two curves (lines endless, arcs as full circles) cross
function crossings(a, b) {
  const cr = (u, v) => u[0] * v[1] - u[1] * v[0], dot = (u, v) => u[0] * v[0] + u[1] * v[1];
  if (a.kind === 'L' && b.kind === 'L') {
    const da = sub(a.Q, a.P), db = sub(b.Q, b.P), den = cr(da, db);
    if (Math.abs(den) < 1e-9 * len(da) * len(db)) return null; // parallel
    const t = cr(sub(b.P, a.P), db) / den;
    return [[a.P[0] + da[0] * t, a.P[1] + da[1] * t]];
  }
  if (a.kind === 'A' && b.kind === 'L') return crossings(b, a);
  if (a.kind === 'L') {
    const d = sub(a.Q, a.P), f = sub(a.P, b.c), A2 = dot(d, d), B2 = 2 * dot(f, d), C2 = dot(f, f) - b.r * b.r, disc = B2 * B2 - 4 * A2 * C2;
    if (disc < -1e-9 * A2 * b.r * b.r) return [];
    const q = Math.sqrt(Math.max(0, disc));
    return [(-B2 - q) / (2 * A2), (-B2 + q) / (2 * A2)].map(t => [a.P[0] + d[0] * t, a.P[1] + d[1] * t]);
  }
  const d = len(sub(b.c, a.c));
  if (d < 1e-9 || d > a.r + b.r + 1e-9 || d < Math.abs(a.r - b.r) - 1e-9) return [];
  const x = (d * d + a.r * a.r - b.r * b.r) / (2 * d), h = Math.sqrt(Math.max(0, a.r * a.r - x * x));
  const u = [(b.c[0] - a.c[0]) / d, (b.c[1] - a.c[1]) / d], m = [a.c[0] + u[0] * x, a.c[1] + u[1] * x];
  return [[m[0] - u[1] * h, m[1] + u[0] * h], [m[0] + u[1] * h, m[1] - u[0] * h]];
}
const r6 = p => [+(+p[0]).toFixed(6), +(+p[1]).toFixed(6)];
// how one curve changes so that it ends at X and keeps the part where it was clicked (c)
function moveTo(C, X, c) {
  if (C.kind === 'L') {
    const d = sub(C.Q, C.P), L2 = d[0] * d[0] + d[1] * d[1], par = q => ((q[0] - C.P[0]) * d[0] + (q[1] - C.P[1]) * d[1]) / L2;
    const tx = par(X), side = Math.sign(par(c) - tx) || 1;
    // ends: t = 0 (point seg) and t = 1 (point seg + 1); the one on the clicked side stays
    const on = [0, 1].filter(t => Math.sign(t - tx) === side);
    const moveT = on.length === 1 ? 1 - on[0] : Math.abs(0 - tx) < Math.abs(1 - tx) ? 0 : 1;
    const k = C.seg + moveT, n = C.e.pts.length;
    if (k !== 0 && k !== n - 1) return { error: 'Nur das Ende eines Linienzugs lässt sich stutzen oder verlängern.' };
    const keep = C.e.pts[moveT ? C.seg : C.seg + 1].map(Number);
    if (len(sub(keep, X)) < 1e-6) return { error: 'Bei diesem Schnittpunkt bliebe von einer Linie nichts übrig.' };
    return { id: C.e.id, k, p: r6(X) };
  }
  // an arc: either its end moves to X (start stays) or its start does (end stays) – along the same circle
  const tX = C.par(X), tc = C.par(c), eps = 1e-7;
  const len1 = tX, len2 = norm(C.S - tX);
  const has1 = len1 > eps && tc <= len1 + eps, has2 = len2 > eps && norm(tc - tX) <= len2 + eps;
  let which = has1 && !has2 ? 1 : has2 && !has1 ? 2 : Math.abs(len1 - C.S) <= Math.abs(len2 - C.S) ? 1 : 2;
  if (which === 1 && !(len1 > eps)) which = 2;
  if (which === 2 && !(len2 > eps)) return { error: 'Bei diesem Schnittpunkt bliebe von einer Linie nichts übrig.' };
  const at = a => [C.c[0] + C.r * Math.cos(a), C.c[1] + C.r * Math.sin(a)];
  const aX = C.ang(X);
  const pts = which === 1 ? [C.A, at(C.a0 + (C.dir * len1) / 2), X] : [X, at(aX + (C.dir * len2) / 2), C.B];
  return { id: C.e.id, k: which === 1 ? 2 : 0, p: r6(X), pts: pts.map(r6) };
}
/**
 * Brings two lines or arcs (from cornerLineAt) to a point where they intersect: each keeps the part on the side
 * where it was clicked and its other end moves to the intersection – cut back where they cross, lengthened where
 * they end short (an arc along its circle). Of two intersections (line and arc, two arcs) the one nearest to the
 * clicks is taken. Returns { moves: [{ id, k, p, pts? }], join: [refA, refB] (the two ends that now meet), X } or
 * { error }.
 */
export function meetLines(entities, A, B) {
  if (!A || !B || A.id === B.id) return { error: 'Zwei verschiedene Linien anklicken.' };
  const get = L => { const e = entities.find(x => x.id === L.id); return e ? curveOf(e, L.seg) : null; };
  const a = get(A), b = get(B);
  if (!a || !b) return { error: 'Zwei verschiedene Linien anklicken.' };
  const xs = crossings(a, b);
  if (!xs) return { error: 'Die Linien sind parallel – sie treffen sich nirgends.' };
  if (!xs.length) return { error: 'Die beiden Kurven schneiden sich nirgends.' };
  const X = xs.reduce((best, q) => (len(sub(q, A.c)) + len(sub(q, B.c)) < len(sub(best, A.c)) + len(sub(best, B.c)) ? q : best));
  const moves = [];
  for (const [C, L] of [[a, A], [b, B]]) {
    const m = moveTo(C, X, L.c);
    if (m.error) return m;
    moves.push(m);
  }
  return { moves, join: moves.map(m => m.id + ':p' + m.k), X };
}
// the curves as they would be after meetLines (for the preview)
export function meetPreview(entities, r) {
  return r.moves.map(m => {
    if (m.pts) {
      const ci = circle3(...m.pts);
      if (!ci) return m.pts;
      const C = curveOf({ type: 'poly', curve: 'arc', pts: m.pts }, 0), n = Math.max(8, Math.ceil(C.S * 16));
      return Array.from({ length: n + 1 }, (_, i) => { const t = C.a0 + (C.dir * C.S * i) / n; return [ci.c[0] + ci.r * Math.cos(t), ci.c[1] + ci.r * Math.sin(t)]; });
    }
    const e = entities.find(x => x.id === m.id), pts = e.pts.map(q => q.map(Number));
    pts[m.k] = m.p;
    return pts;
  });
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

/**
 * A chamfer where a line meets an arc or two arcs meet: both are cut back by d1 / d2 (measured along the curve) and
 * a straight line (id lineId, marked chamfer) joins the two points. Same result shape as filletCurves.
 */
export function chamferCurves(entities, ref, d1, d2, lineId, newId) {
  const pair = curvePair(entities, ref);
  if (!pair || !(d1 > 0) || !(d2 > 0)) return null;
  const r6 = p => [+p[0].toFixed(6), +p[1].toFixed(6)];
  const at = (X, d) => {
    if (X.kind === 'L') return d < X.L - 1e-9 ? { T: [X.P[0] + X.d[0] * d, X.P[1] + X.d[1] * d], da: 0 } : null;
    const da = (Math.sign(X.sw) * d) / X.R;
    return Math.abs(da) < Math.abs(X.sw) - 1e-9 ? { T: [X.c[0] + X.R * Math.cos(X.a0 + da), X.c[1] + X.R * Math.sin(X.a0 + da)], da } : null;
  };
  const [A, B] = pair, ta = at(A, d1), tb = at(B, d2);
  if (!ta || !tb) return null;
  const cut = (X, t) => {
    const pts = X.e.pts.map(p => [p[0], p[1]]);
    pts[X.k] = r6(t.T);
    if (X.kind === 'A') { const am = X.a0 + (t.da + X.sw) / 2; pts[1] = r6([X.c[0] + X.R * Math.cos(am), X.c[1] + X.R * Math.sin(am)]); }
    return { id: X.e.id, pts };
  };
  return { moves: [cut(A, ta), cut(B, tb)], arc: { id: lineId, type: 'poly', closed: false, chamfer: true, pts: [r6(ta.T), r6(tb.T)] }, drop: [`${A.e.id}:p${A.k}`, `${B.e.id}:p${B.k}`],
    cons: [{ id: newId(), type: 'coincident', refs: [`${lineId}:p0`, `${A.e.id}:p${A.k}`] }, { id: newId(), type: 'coincident', refs: [`${lineId}:p1`, `${B.e.id}:p${B.k}`] }] };
}

// An arc that rounds a corner (it ends on two other curves and runs on tangentially from both), or a line made
// as a chamfer between two curves: the curve at each of its ends → { e, X, Y, r? } or null
function bridge(entities, id) {
  const e = entities.find(x => x.id === id);
  if (!e || e.cons) return null;
  const arc = isArcE(e), line = !arc && plainOpen(e) && e.pts.length === 2 && e.chamfer;
  if (!arc && !line) return null;
  const ends = [0, e.pts.length - 1].map(k => {
    const P = e.pts[k].map(Number), hit = [];
    for (const x of entities) {
      if (x === e || x.cons) continue;
      if (isArcE(x)) { for (const q of [0, 2]) if (near(x.pts[q].map(Number), P)) hit.push([x, q]); }
      else if (plainOpen(x)) { for (const q of [0, x.pts.length - 1]) if (near(x.pts[q].map(Number), P)) hit.push([x, q]); }
    }
    return hit.length === 1 ? curveEnd(...hit[0]) : null;
  });
  if (!ends[0] || !ends[1] || ends[0].e === ends[1].e) return null;
  if (!arc) return { e, X: ends[0], Y: ends[1] };
  // (tangent: the neighbour leaves the end along the tangent of the arc there)
  const ci = circle3(e.pts[0].map(Number), e.pts[1].map(Number), e.pts[2].map(Number));
  if (!ci) return null;
  const dir = X => (X.kind === 'L' ? X.d : [-(X.P[1] - X.c[1]) / X.R, (X.P[0] - X.c[0]) / X.R]);
  for (const X of ends) { const d = dir(X), rad = [(X.P[0] - ci.c[0]) / ci.r, (X.P[1] - ci.c[1]) / ci.r]; if (Math.abs(d[0] * rad[0] + d[1] * rad[1]) > 2e-3) return null; }
  return { e, X: ends[0], Y: ends[1], r: ci.r };
}
/** The radius of the rounding arc id (0 for a chamfer line), or null when the entity is neither. */
export function bridgeRadius(entities, id) { const b = bridge(entities, id); return b ? b.r || 0 : null; }

/**
 * Takes a rounding or chamfer between two curves away again: the two curves run on to where they meet and the
 * arc or line between them goes. Returns { moves, remove (its id), join (the two end refs, coincident again) } or
 * null when the curves do not meet.
 */
export function unbridge(entities, id) {
  const b = bridge(entities, id);
  if (!b) return null;
  const { X, Y } = b, M = b.e.pts.length === 3 ? b.e.pts[1].map(Number) : [(+b.e.pts[0][0] + +b.e.pts[1][0]) / 2, (+b.e.pts[0][1] + +b.e.pts[1][1]) / 2], cand = [];
  if (X.kind === 'L' && Y.kind === 'L') {
    const den = X.d[0] * Y.d[1] - X.d[1] * Y.d[0];
    if (Math.abs(den) > 1e-9) { const w = sub(Y.P, X.P), u = (w[0] * Y.d[1] - w[1] * Y.d[0]) / den; cand.push([X.P[0] + X.d[0] * u, X.P[1] + X.d[1] * u]); }
  } else if (X.kind === 'L' || Y.kind === 'L') {
    const [l, c] = X.kind === 'L' ? [X, Y] : [Y, X], w = sub(l.P, c.c), bb = w[0] * l.d[0] + w[1] * l.d[1], disc = bb * bb - (w[0] * w[0] + w[1] * w[1] - c.R * c.R);
    if (disc >= 0) for (const u of [-bb - Math.sqrt(disc), -bb + Math.sqrt(disc)]) cand.push([l.P[0] + l.d[0] * u, l.P[1] + l.d[1] * u]);
  } else {
    const w = sub(Y.c, X.c), D = len(w);
    if (D > 1e-12 && D <= X.R + Y.R && D >= Math.abs(X.R - Y.R)) {
      const a = (X.R * X.R - Y.R * Y.R + D * D) / (2 * D), hh = Math.sqrt(Math.max(0, X.R * X.R - a * a)), m = [X.c[0] + (w[0] * a) / D, X.c[1] + (w[1] * a) / D];
      cand.push([m[0] - (w[1] * hh) / D, m[1] + (w[0] * hh) / D], [m[0] + (w[1] * hh) / D, m[1] - (w[0] * hh) / D]);
    }
  }
  // (the corner lies beyond the end of both curves – not somewhere along them)
  const beyond = (C, P) => (C.kind === 'L' ? (P[0] - C.P[0]) * C.d[0] + (P[1] - C.P[1]) * C.d[1] < 1e-7 : !C.at(P));
  const ok = cand.filter(P => beyond(X, P) && beyond(Y, P)).sort((p, q) => len(sub(p, M)) - len(sub(q, M)));
  if (!ok.length) return null;
  // (to 5 places: the corner comes back to where it was, not a rounding error beside it)
  const r6 = p => [+p[0].toFixed(5) + 0, +p[1].toFixed(5) + 0], P = r6(ok[0]);
  const grow = C => {
    const pts = C.e.pts.map(p => [p[0], p[1]]);
    pts[C.k] = r6(P);
    if (C.kind === 'A') {
      const aP = Math.atan2(P[1] - C.c[1], P[0] - C.c[0]), da = C.sw > 0 ? -norm(C.a0 - aP) : norm(aP - C.a0), am = C.a0 + (da + C.sw) / 2;
      pts[1] = r6([C.c[0] + C.R * Math.cos(am), C.c[1] + C.R * Math.sin(am)]);
    }
    return { id: C.e.id, pts };
  };
  return { moves: [grow(X), grow(Y)], remove: b.e.id, join: [`${X.e.id}:p${X.k}`, `${Y.e.id}:p${Y.k}`], P: r6(P) };
}

// outline of the entity with the corner at ref changed (for the preview while hovering)
export function cornerPreview(entities, ref, kind, value) {
  if (String(ref).endsWith(':b')) return null;
  if (curveCorner(entities, ref) && kind === 'chamfer') {
    const v = Array.isArray(value) ? value.map(Number) : [+value, +value], f = chamferCurves(entities, ref, v[0], v[1] ?? v[0], 'tmp', () => 'tmp');
    return f ? { pts: f.arc.pts, closed: false } : null;
  }
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
