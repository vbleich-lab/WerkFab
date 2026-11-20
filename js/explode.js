// Exploded views (pure, no three.js): a list of steps, each moves some bodies along a direction by a distance.
// u = how far the explosion has run: 0 = assembled, k = the first k steps done, n = fully exploded. Read
// backwards, the steps are an assembly instruction (the last step to explode is the first to assemble).
// step: { id, name, bodies: [ids], dir: [x, y, z] (unit), dist (mm) }

export const DIRS = { 'x+': [1, 0, 0], 'x-': [-1, 0, 0], 'y+': [0, 1, 0], 'y-': [0, -1, 0], 'z+': [0, 0, 1], 'z-': [0, 0, -1] };
export const dirKey = d => Object.keys(DIRS).find(k => DIRS[k].every((v, i) => Math.abs(v - (d?.[i] || 0)) < 1e-9)) || null;

// offset [dx, dy, dz] of every moved body at progress u
export function offsetsAt(steps, u) {
  const off = {};
  steps.forEach((s, i) => {
    const f = Math.max(0, Math.min(1, u - i));
    if (!f || !(s.dist > 0)) return;
    const d = s.dir || [0, 0, 1], n = Math.hypot(...d) || 1;
    for (const id of s.bodies || []) {
      const o = off[id] || (off[id] = [0, 0, 0]);
      for (let k = 0; k < 3; k++) o[k] += (d[k] / n) * s.dist * f;
    }
  });
  return off;
}

// trail of a body: the corner points of its path (start, after each of its steps up to u)
export function trail(steps, id, u, from = [0, 0, 0]) {
  const pts = [from.slice()];
  let p = from.slice();
  steps.forEach((s, i) => {
    const f = Math.max(0, Math.min(1, u - i));
    if (!f || !(s.dist > 0) || !(s.bodies || []).includes(id)) return;
    const d = s.dir || [0, 0, 1], n = Math.hypot(...d) || 1;
    p = p.map((v, k) => v + (d[k] / n) * s.dist * f);
    pts.push(p.slice());
  });
  return pts;
}

// automatic explosion. boxes: [{ id, min: [x,y,z], max: [x,y,z] }]. The biggest body stays (the base); every other
// body moves along the main axis pointing from the base's centre to its own centre, far enough to clear the
// bodies before it on that side plus a gap. Bodies farther out go first (the steps can be read backwards
// as the order of assembly). factor scales the gaps.
export function autoExplode(boxes, { factor = 1, gap = null } = {}) {
  if (boxes.length < 2) return [];
  const size = b => b.max.map((v, k) => v - b.min[k]), vol = b => size(b).reduce((a, c) => a * Math.max(c, 1e-6), 1);
  const ctr = b => b.min.map((v, k) => (v + b.max[k]) / 2);
  const base = boxes.reduce((a, b) => (vol(b) > vol(a) ? b : a));
  const all = { min: [0, 1, 2].map(k => Math.min(...boxes.map(b => b.min[k]))), max: [0, 1, 2].map(k => Math.max(...boxes.map(b => b.max[k]))) };
  const g = gap ?? Math.max(2, 0.15 * Math.max(...size(all))) * factor;
  const bc = ctr(base), groups = {};
  for (const b of boxes) {
    if (b === base) continue;
    const c = ctr(b), d = c.map((v, k) => v - bc[k]);
    // main axis: the one in which the body sticks out of the base most (relative to the base's size); ties → Z
    const sb = size(base), score = [0, 1, 2].map(k => Math.abs(d[k]) / Math.max(sb[k] / 2, 1e-6) + (k === 2 ? 1e-6 : 0));
    let k = score.indexOf(Math.max(...score));
    if (!(Math.abs(d[k]) > 1e-9)) k = 2; // centred on the base: up
    const sgn = d[k] < 0 ? -1 : 1, key = (sgn > 0 ? 'xyz'[k] + '+' : 'xyz'[k] + '-');
    (groups[key] ||= []).push({ b, k, sgn, out: sgn * c[k] });
  }
  const steps = [];
  for (const [key, list] of Object.entries(groups)) {
    // nearest first: each body has to clear the ones before it on this side
    list.sort((p, q) => p.out - q.out);
    let edge = list[0].sgn > 0 ? base.max[list[0].k] : -base.min[list[0].k];
    const moves = list.map(({ b, k, sgn }) => {
      const near = sgn > 0 ? b.min[k] : -b.max[k], far = sgn > 0 ? b.max[k] : -b.min[k];
      const dist = Math.max(0, edge + g - near);
      edge = far + dist;
      return { b, dist };
    });
    // one body after the other: the last (outermost) one first, so read backwards it is put on last
    moves.reverse().forEach(({ b, dist }) => steps.push({ bodies: [b.id], dir: DIRS[key].slice(), dist: Math.round(dist * 100) / 100, out: Math.abs(dist), side: key }));
  }
  // outermost moves first over all sides; ties keep the side order
  steps.sort((p, q) => q.out - p.out);
  return steps.map(({ out, side, ...s }) => s);
}
