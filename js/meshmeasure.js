// Measuring on a mesh body (STL, 3MF …): a mesh has no faces and edges of its own, so they are read from the
// triangles – neighbours in one plane are a flat face, the line where two faces meet at an angle is an edge, the
// strips round an axis (as mesh.js findCylinders finds them) are a cylinder and their rims are circles.
// Pure geometry: a mesh is { pos, idx }, cylinders are [{ c, d, r, h, hole, full }] (c = lower end of the axis).
import { sub, add, mul, dot, len, unit, dist } from './measure.js';

const COS_FLAT = 1 - 6e-6;                       // neighbours in one plane (0.2°)
const COS_EDGE = Math.cos((12 * Math.PI) / 180); // where two faces meet at more than this, there is an edge
const topos = new WeakMap();

// What is needed of a mesh, built once: normals, areas, the neighbour across every side, flat regions, the
// triangles around every corner, the cylinder every triangle lies on (−1: none).
export function meshTopo(m, cyls = []) {
  const got = topos.get(m);
  if (got && got.cyls === cyls) return got;
  const I = m.idx, P = m.pos, nT = I.length / 3, nV = P.length / 3;
  const N = new Float64Array(nT * 3), A = new Float64Array(nT);
  for (let t = 0; t < nT; t++) {
    const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
    A[t] = l / 2;
    if (l > 0) { N[t * 3] = nx / l; N[t * 3 + 1] = ny / l; N[t * 3 + 2] = nz / l; }
  }
  // neighbour across side k of triangle t (−1: open, or more than two triangles at that side)
  const nb = new Int32Array(nT * 3).fill(-1), sides = new Map();
  for (let t = 0; t < nT; t++) for (let k = 0; k < 3; k++) {
    const a = I[t * 3 + k], b = I[t * 3 + (k + 1) % 3], key = a < b ? a * 4294967296 + b : b * 4294967296 + a, o = sides.get(key);
    if (o === undefined) sides.set(key, t * 3 + k);
    else if (o >= 0) { nb[t * 3 + k] = Math.floor(o / 3); nb[o] = t; sides.set(key, -1); }
    else if (o === -1) sides.set(key, -2);
  }
  const dotN = (s, t) => N[s * 3] * N[t * 3] + N[s * 3 + 1] * N[t * 3 + 1] + N[s * 3 + 2] * N[t * 3 + 2];
  const par = new Int32Array(nT).map((_, i) => i), find = x => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
  for (let t = 0; t < nT; t++) for (let k = 0; k < 3; k++) { const s = nb[t * 3 + k]; if (s > t && A[s] > 0 && A[t] > 0 && dotN(s, t) > COS_FLAT) par[find(s)] = find(t); }
  const reg = new Int32Array(nT);
  for (let t = 0; t < nT; t++) reg[t] = find(t);
  // triangles around each corner
  const start = new Int32Array(nV + 1);
  for (let i = 0; i < I.length; i++) start[I[i] + 1]++;
  for (let v = 0; v < nV; v++) start[v + 1] += start[v];
  const fill = start.slice(0, nV), around = new Int32Array(I.length);
  for (let t = 0; t < nT; t++) for (let k = 0; k < 3; k++) around[fill[I[t * 3 + k]]++] = t;
  // the cylinder a triangle lies on: its three corners on the cylinder, its normal across the axis
  const cylOf = new Int32Array(nT).fill(-1);
  cyls.forEach((c, ci) => {
    const tol = Math.max(2e-3, 1e-3 * c.r), d = c.d;
    for (let t = 0; t < nT; t++) {
      if (cylOf[t] >= 0 || Math.abs(N[t * 3] * d[0] + N[t * 3 + 1] * d[1] + N[t * 3 + 2] * d[2]) > 0.05) continue;
      let on = true;
      for (let k = 0; k < 3 && on; k++) {
        const v = I[t * 3 + k] * 3, w = [P[v] - c.c[0], P[v + 1] - c.c[1], P[v + 2] - c.c[2]], s = dot(w, d);
        on = s > -tol && s < c.h + tol && Math.abs(len(sub(w, mul(d, s))) - c.r) < tol;
      }
      if (on) cylOf[t] = ci;
    }
  });
  const topo = { m, cyls, N, A, nb, reg, start, around, cylOf, dotN };
  topos.set(m, topo);
  return topo;
}

const vtx = (m, v) => [m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]];
// is side k of triangle t an edge of the part (and not just a line between two triangles of one face)?
function realSide(T, t, k) {
  const s = T.nb[t * 3 + k];
  if (s < 0) return true;
  if (T.reg[s] === T.reg[t]) return false;
  if (T.cylOf[t] >= 0 && T.cylOf[t] === T.cylOf[s]) return false;
  return T.dotN(s, t) < COS_EDGE || T.cylOf[t] !== T.cylOf[s];
}
function segDist(p, a, b) {
  const ab = sub(b, a), l2 = dot(ab, ab), s = l2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2)) : 0;
  return dist(p, add(a, mul(ab, s)));
}
// the straight edge through the side a–b: followed in both directions as long as it runs on straight
function straightChain(T, a, b) {
  const m = T.m, I = m.idx, d = unit(sub(vtx(m, b), vtx(m, a)));
  const walk = (from, dir) => {
    let v = from;
    for (let guard = 0; guard < 100000; guard++) {
      let next = -1;
      for (let i = T.start[v]; i < T.start[v + 1] && next < 0; i++) {
        const t = T.around[i];
        for (let k = 0; k < 3; k++) {
          const p = I[t * 3 + k], q = I[t * 3 + (k + 1) % 3], w = p === v ? q : q === v ? p : -1;
          if (w < 0 || !realSide(T, t, k)) continue;
          const e = sub(vtx(m, w), vtx(m, v)), l = len(e);
          if (l > 0 && dot(e, dir) / l > 1 - 1e-6) { next = w; break; }
        }
      }
      if (next < 0) break;
      v = next;
    }
    return v;
  };
  return [vtx(m, walk(a, mul(d, -1))), vtx(m, walk(b, d))];
}

// What lies at the point `hit` of triangle t; `px` = the length of one pixel there (corners are caught within
// 9 pixels, edges within 6). →
//   { type: 'point', p }
//   { type: 'line', ends: [p, q], length }
//   { type: 'circle', c, d, r, full }                the rim of a cylinder
//   { type: 'cyl', c (middle of the axis), d, r, h, hole, full, tris }
//   { type: 'plane', n, c (centroid), area, perimeter, tris }
export function meshElement(m, T, t, hit, px) {
  const I = m.idx;
  // a corner: where at least two edges of the part meet
  for (let k = 0; k < 3; k++) {
    const v = I[t * 3 + k], p = vtx(m, v);
    if (dist(p, hit) > px * 9) continue;
    // (the edges leaving it: three or more, or two that do not run on – the chords of a rim are no corners)
    const dirs = [];
    for (let i = T.start[v]; i < T.start[v + 1]; i++) {
      const s = T.around[i];
      for (let j = 0; j < 3; j++) {
        const a = I[s * 3 + j], b = I[s * 3 + (j + 1) % 3], w = a === v ? b : b === v ? a : -1;
        if (w < 0 || !realSide(T, s, j)) continue;
        const d = unit(sub(vtx(m, w), p));
        if (!dirs.some(q => dot(q, d) > 1 - 1e-9)) dirs.push(d);
      }
    }
    if (dirs.length >= 3 || (dirs.length === 2 && dot(dirs[0], dirs[1]) > -Math.cos(Math.PI / 6))) return { type: 'point', p };
  }
  let best = null;
  for (let k = 0; k < 3; k++) {
    if (!realSide(T, t, k)) continue;
    const a = I[t * 3 + k], b = I[t * 3 + (k + 1) % 3], dd = segDist(hit, vtx(m, a), vtx(m, b));
    if (dd < px * 6 && (!best || dd < best.dd)) best = { dd, k, a, b };
  }
  if (best) {
    const s = T.nb[t * 3 + best.k], ci = T.cylOf[t] >= 0 ? T.cylOf[t] : s >= 0 ? T.cylOf[s] : -1, c = ci >= 0 ? T.cyls[ci] : null;
    const pa = vtx(m, best.a), pb = vtx(m, best.b);
    // the rim of a cylinder: both ends at one height of its axis
    if (c) {
      const sa = dot(sub(pa, c.c), c.d), sb = dot(sub(pb, c.c), c.d);
      if (Math.abs(sa - sb) < Math.max(2e-3, 1e-3 * c.r)) return { type: 'circle', c: add(c.c, mul(c.d, (sa + sb) / 2)), d: c.d, r: c.r, full: c.full !== false };
    }
    const ends = straightChain(T, best.a, best.b);
    return { type: 'line', ends, length: dist(ends[0], ends[1]) };
  }
  const collect = same => { const tris = []; for (let s = 0; s < T.reg.length; s++) if (same(s)) tris.push(s); return tris; };
  if (T.cylOf[t] >= 0) {
    const ci = T.cylOf[t], c = T.cyls[ci];
    return { type: 'cyl', c: add(c.c, mul(c.d, c.h / 2)), d: c.d, r: c.r, h: c.h, hole: !!c.hole, full: c.full !== false, tris: collect(s => T.cylOf[s] === ci) };
  }
  const r = T.reg[t], tris = collect(s => T.reg[s] === r);
  let area = 0, per = 0;
  const cen = [0, 0, 0];
  for (const s of tris) {
    const p0 = vtx(m, I[s * 3]), p1 = vtx(m, I[s * 3 + 1]), p2 = vtx(m, I[s * 3 + 2]);
    area += T.A[s];
    for (let j = 0; j < 3; j++) cen[j] += (T.A[s] * (p0[j] + p1[j] + p2[j])) / 3;
    for (let k = 0; k < 3; k++) { const o = T.nb[s * 3 + k]; if (o < 0 || T.reg[o] !== r) per += dist([p0, p1, p2][k], [p0, p1, p2][(k + 1) % 3]); }
  }
  // (the normal of the largest triangle: needles of a cut are not to be trusted)
  const big = tris.reduce((x, s) => (T.A[s] > T.A[x] ? s : x), t);
  return { type: 'plane', n: [T.N[big * 3], T.N[big * 3 + 1], T.N[big * 3 + 2]], c: area > 0 ? mul(cen, 1 / area) : hit, area, perimeter: per, tris };
}
