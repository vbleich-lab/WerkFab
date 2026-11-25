// Measuring by clicking elements of the model (pure geometry, no kernel): what an edge is – straight, circle,
// arc – from points on it, and what two clicked elements have to say about each other: centre distance, distance
// of parallel planes, centre to plane, angle.
// An element's geometry is plain data:
//   { kind: 'point', p }                     a corner or a centre
//   { kind: 'line', p, d }                   straight edge: a point on it and its direction
//   { kind: 'circle', p, d, r }              circle or arc: centre, axis direction, radius
//   { kind: 'axis', p, d, r }                bore or cylinder: a point on the axis (the opening), direction, radius
//   { kind: 'plane', p, d }                  flat face: a point on it and its normal
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

// What two elements say about each other. → { centre: { d, p, q, axes: bool }, planes: d, toPlane: d, angle: deg,
// parallel: bool } – only the entries that apply.
export function relate(a, b) {
  const out = {};
  if (!a || !b) return out;
  // centre to centre: two parallel axes are measured square to them (two bores of a plate, whatever their depth)
  if (centred(a) && centred(b)) {
    if (round(a) && round(b) && parallel(a.d, b.d)) {
      const w = sub(b.p, a.p), q = sub(b.p, mul(a.d, dot(w, a.d)));
      out.centre = { d: dist(a.p, q), p: a.p, q, axes: true };
    } else if (round(a) && b.kind === 'point') {
      out.centre = { d: dist(a.p, b.p), p: a.p, q: b.p, axes: false };
    } else out.centre = { d: dist(a.p, b.p), p: a.p, q: b.p, axes: false };
  }
  if (a.kind === 'plane' && b.kind === 'plane' && parallel(a.d, b.d)) out.planes = Math.abs(dot(sub(b.p, a.p), a.d));
  // a centre (or an axis lying parallel to the plane) above a plane
  for (const [pl, o] of [[a, b], [b, a]]) {
    if (pl.kind !== 'plane' || !centred(o)) continue;
    if (o.kind === 'axis' && !perpendicular(o.d, pl.d)) continue;
    if (o.kind === 'circle' && !perpendicular(o.d, pl.d) && !parallel(o.d, pl.d)) continue;
    out.toPlane = Math.abs(dot(sub(o.p, pl.p), pl.d));
  }
  // a straight edge parallel to a plane, or two parallel straight edges
  if (a.kind === 'line' && b.kind === 'line' && parallel(a.d, b.d)) { const w = sub(b.p, a.p); out.lines = len(sub(w, mul(a.d, dot(w, a.d)))); }
  // angle: between directions (normals of planes, axes of round things, straight edges)
  const dirOf = g => (g && g.d && g.kind !== 'point' ? g.d : null), da = dirOf(a), db = dirOf(b);
  if (da && db) {
    const c = Math.min(1, Math.abs(dot(da, db)));
    const between = deg(Math.acos(c)); // 0…90 between the two directions
    const planeA = a.kind === 'plane', planeB = b.kind === 'plane';
    // a line against a plane: the angle to the plane itself, not to its normal
    out.angle = planeA !== planeB ? 90 - between : between;
    out.parallel = out.angle < 1e-4;
    if (out.parallel) out.angle = 0;
  }
  return out;
}
