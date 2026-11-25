// Measuring by clicking elements of the model (pure geometry, no kernel): what an edge is – straight, circle,
// arc – from points on it, and what two clicked elements have to say about each other: centre distance, distance
// of parallel planes, centre to plane, angle.
// An element's geometry is plain data:
//   { kind: 'point', p }                     a corner or a centre
//   { kind: 'line', p, d }                   straight edge: a point on it and its direction
//   { kind: 'circle', p, d, r }              circle or arc: centre, axis direction, radius
//   { kind: 'axis', p, d, r }                bore or cylinder: a point on the axis (the opening), direction, radius
//   { kind: 'plane', p, d, c }               flat face: a point on it, its normal and (if known) its centroid
//   null                                     anything else (free-form faces and curves)

export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = a => Math.hypot(a[0], a[1], a[2]);
export const unit = a => { const l = len(a); return l > 1e-300 ? mul(a, 1 / l) : [0, 0, 0]; };
export const dist = (a, b) => len(sub(a, b));

// circle through three points: { c, r, n } or null when they lie on a line
export function circleFrom3(p0, p1, p2) {
  const a = sub(p1, p0), b = sub(p2, p0), n = cross(a, b), n2 = dot(n, n);
  if (n2 < 1e-18 * Math.max(1, dot(a, a) * dot(b, b))) return null;
  // centre = p0 + (|a|² (b × n) + |b|² (n × a)) / (2 |n|²)
  const o = mul(add(mul(cross(b, n), dot(a, a)), mul(cross(n, a), dot(b, b))), 1 / (2 * n2));
  return { c: add(p0, o), r: len(o), n: unit(n) };
}

// What a curve is, from points along it (in order; at least two) and what the kernel calls it (may be empty).
// → { sub: 'line' | 'circle' | 'arc' | 'curve', length, geo, angle (arc, in degrees) }
export function describeCurve(pts, { type = '', length = null, closed = null } = {}) {
  const n = pts.length, first = pts[0], last = pts[n - 1];
  let L = 0;
  for (let i = 1; i < n; i++) L += dist(pts[i], pts[i - 1]);
  const size = Math.max(L, 1e-9);
  const isClosed = closed ?? (n > 2 && dist(first, last) < 1e-6 * size);
  const straight = () => { const d = unit(sub(last, first)); return pts.every(p => { const w = sub(p, first); return len(sub(w, mul(d, dot(w, d)))) < 1e-6 * size; }); };
  if (type === 'LINE' || (!type && n >= 2 && !isClosed && straight())) {
    return { sub: 'line', length: length ?? dist(first, last), geo: { kind: 'line', p: mul(add(first, last), 0.5), d: unit(sub(last, first)) } };
  }
  if (n >= 3 && (type === 'CIRCLE' || !type)) {
    const k = isClosed ? n - 1 : n; // (a closed chain repeats its first point)
    const c = circleFrom3(pts[0], pts[Math.floor(k / 3)], pts[Math.floor((2 * k) / 3)]);
    // every point must lie on that circle (a spline that only looks round is no circle)
    if (c && pts.every(p => Math.abs(dist(p, c.c) - c.r) < 1e-4 * Math.max(1, c.r) && Math.abs(dot(sub(p, c.c), c.n)) < 1e-4 * Math.max(1, c.r))) {
      const geo = { kind: 'circle', p: c.c, d: c.n, r: c.r };
      if (isClosed) return { sub: 'circle', length: length ?? 2 * Math.PI * c.r, geo };
      const arcLen = length ?? L;
      return { sub: 'arc', length: arcLen, angle: (arcLen / c.r) * 180 / Math.PI, geo };
    }
  }
  return { sub: 'curve', length: length ?? L, geo: null };
}

const parallel = (a, b) => Math.abs(Math.abs(dot(a, b)) - 1) < 1e-6;
const perpendicular = (a, b) => Math.abs(dot(a, b)) < 1e-6;
const round = g => g && (g.kind === 'circle' || g.kind === 'axis');
const centred = g => g && (g.kind === 'point' || round(g));
const deg = x => (x * 180) / Math.PI;

// the point an element is measured from, centre to centre: a point, the centre of a circle, the opening of a
// bore, the centroid of a flat face (c)
const centreOf = g => (!g ? null : centred(g) ? g.p : g.kind === 'plane' && g.c ? g.c : null);
const footOn = (p, pl) => sub(p, mul(pl.d, dot(sub(p, pl.p), pl.d)));

// What two elements say about each other. Every distance comes with its two points { d, p, q }:
//   centre   centre to centre (axes: two parallel axes, measured square to them)
//   normal   square to a flat face: two parallel faces, or a centre above a face
//   lines    two parallel straight edges
// and angle (degrees), parallel (bool) – only the entries that apply.
export function relate(a, b) {
  const out = {};
  if (!a || !b) return out;
  const ca = centreOf(a), cb = centreOf(b);
  if (ca && cb) {
    // two parallel axes are measured square to them (two bores of a plate, whatever their depth)
    // (two circles, or two things on one axis: their centres as they are)
    const w = sub(cb, ca), q = round(a) && round(b) && parallel(a.d, b.d) && (a.kind === 'axis' || b.kind === 'axis') ? sub(cb, mul(a.d, dot(w, a.d))) : null;
    if (q && dist(ca, q) > 1e-9) out.centre = { d: dist(ca, q), p: ca, q, axes: true };
    else out.centre = { d: dist(ca, cb), p: ca, q: cb, axes: false };
  }
  if (a.kind === 'plane' && b.kind === 'plane') {
    if (parallel(a.d, b.d)) { const p = ca || a.p, q = footOn(p, b); out.normal = { d: dist(p, q), p, q }; }
  } else if (a.kind === 'circle' && b.kind === 'circle') {
    // two parallel circles: the distance of the planes they lie in
    if (parallel(a.d, b.d)) { const q = footOn(a.p, b); if (dist(a.p, q) > 1e-9) out.normal = { d: dist(a.p, q), p: a.p, q }; }
  } else {
    // a centre (or an axis lying parallel to the face) above a flat face
    for (const [pl, o] of [[a, b], [b, a]]) {
      if (pl.kind !== 'plane' || !centred(o)) continue;
      if (round(o) && !perpendicular(o.d, pl.d) && !parallel(o.d, pl.d)) continue;
      const q = footOn(o.p, pl);
      if (dist(o.p, q) > 1e-9) out.normal = { d: dist(o.p, q), p: o.p, q }; // (a bore opening in that very face: nothing)
    }
  }
  if (a.kind === 'line' && b.kind === 'line' && parallel(a.d, b.d)) { const w = sub(b.p, a.p), q = sub(b.p, mul(a.d, dot(w, a.d))); out.lines = { d: dist(a.p, q), p: a.p, q }; }
  // angle: between directions (normals of planes, axes of round things, straight edges)
  const dirOf = g => (g && g.d && g.kind !== 'point' ? g.d : null), da = dirOf(a), db = dirOf(b);
  if (da && db) {
    const c = Math.min(1, Math.abs(dot(da, db)));
    const between = deg(Math.acos(c)); // 0…90 between the two directions
    // (a circle counts as the plane it lies in, a bore as its axis)
    const flat = g => g.kind === 'plane' || g.kind === 'circle', planeA = flat(a), planeB = flat(b);
    // a line against a plane: the angle to the plane itself, not to its normal
    out.angle = planeA !== planeB ? 90 - between : between;
    out.parallel = out.angle < 1e-4;
    if (out.parallel) out.angle = 0;
  }
  return out;
}
