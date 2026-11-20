// Hole recognition on a solid (pure): from the cylinder faces and the other faces of a body, find drilled holes –
// through or blind, with a flat or pointed bottom, simple or counterbored – so they can become editable hole
// features again (e.g. after "Netz → Körper"). The caller gives plain data:
//   cyls: [{ id, loc: [x,y,z], dir: [x,y,z], r, concave: bool, pts: [[x,y,z], …] (points on the face boundary) }]
//   caps: [{ id, kind: 'plane' | 'cone' | other, pts: [[x,y,z], …] }]
// Result: [{ entry: [x,y,z] (centre of the opening), dir: unit vector into the material, dia, depth, through, tip,
//            kind: 'simple' | 'cbore', cbDia, cbDepth, faces: [ids] }]

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = a => Math.hypot(a[0], a[1], a[2]), norm = a => mul(a, 1 / (len(a) || 1));

export function findHoles(cyls, caps, { tol = 1e-3 } = {}) {
  // 1. concave cylinders grouped by their axis line
  const axes = [];
  for (const c of cyls) {
    if (!c.concave || !(c.r > 0)) continue;
    let d = norm(c.dir);
    const ax = axes.find(a => Math.abs(Math.abs(dot(a.dir, d)) - 1) < 1e-4 && len(sub(sub(c.loc, a.loc), mul(a.dir, dot(sub(c.loc, a.loc), a.dir)))) < tol * 10);
    if (ax && dot(ax.dir, d) < 0) d = mul(d, -1);
    const ts = c.pts.map(p => dot(sub(p, ax ? ax.loc : c.loc), ax ? ax.dir : d));
    const seg = { id: c.id, r: c.r, t0: Math.min(...ts), t1: Math.max(...ts) };
    if (ax) ax.segs.push(seg); else axes.push({ loc: c.loc, dir: d, segs: [seg] });
  }
  const out = [];
  for (const ax of axes) {
    // 2. pieces of the same radius that touch are one section (a cylinder split into two halves, or along)
    const secs = [];
    for (const s of ax.segs.sort((p, q) => p.t0 - q.t0 || p.r - q.r)) {
      const m = secs.find(q => Math.abs(q.r - s.r) < tol * 10 && s.t0 <= q.t1 + tol && s.t1 >= q.t0 - tol);
      if (m) { m.t0 = Math.min(m.t0, s.t0); m.t1 = Math.max(m.t1, s.t1); m.ids.push(s.id); } else secs.push({ r: s.r, t0: s.t0, t1: s.t1, ids: [s.id] });
    }
    secs.sort((p, q) => p.t0 - q.t0);
    // sections must follow each other without a gap (one bore with steps)
    let chain = [secs[0]], chains = [chain];
    for (const s of secs.slice(1)) { if (Math.abs(s.t0 - chain[chain.length - 1].t1) < tol * 10) chain.push(s); else chains.push(chain = [s]); }
    for (const ch of chains) {
      const T0 = ch[0].t0, T1 = ch[ch.length - 1].t1;
      const at = t => ax.loc.map((v, k) => v + ax.dir[k] * t);
      // 3. a cap closes an end when all its points lie inside the bore radius there, at or beyond that end
      const closes = (cap, end) => {
        const r = (end === 0 ? ch[0] : ch[ch.length - 1]).r, tEnd = end === 0 ? T0 : T1, out = end === 0 ? -1 : 1;
        return cap.pts.length > 0 && cap.pts.every(p => {
          const q = sub(p, ax.loc), t = dot(q, ax.dir), rad = len(sub(q, mul(ax.dir, t))), beyond = (t - tEnd) * out;
          return rad <= r + tol * 10 && beyond >= -tol * 10 && beyond <= 2 * r + tol * 10;
        });
      };
      const cap0 = caps.filter(c => closes(c, 0)), cap1 = caps.filter(c => closes(c, 1));
      const open0 = !cap0.length, open1 = !cap1.length;
      if (!open0 && !open1) continue; // closed on both sides: a cavity inside, no drilled hole
      // 4. entry at an open end; with both open the wider end is the entry (counterbore side), else the lower t
      // equal ends: drilled from above (from +Z, else from +Y, else +X) – as one would draw it
      const same = Math.abs(ch[0].r - ch[ch.length - 1].r) < tol * 10, up = ax.dir[2] || ax.dir[1] || ax.dir[0];
      let fromStart = open0 && (!open1 || (same ? up < 0 : ch[0].r > ch[ch.length - 1].r));
      const secsIn = fromStart ? ch : [...ch].reverse(), dir = fromStart ? ax.dir : mul(ax.dir, -1);
      const entryT = fromStart ? T0 : T1, entry = at(entryT), lenOf = s => s.t1 - s.t0;
      const through = open0 && open1, bottom = fromStart ? cap1 : cap0;
      let hole = null;
      if (secsIn.length === 1) hole = { kind: 'simple', dia: 2 * secsIn[0].r, depth: lenOf(secsIn[0]) };
      else if (secsIn.length === 2 && secsIn[0].r > secsIn[1].r) hole = { kind: 'cbore', dia: 2 * secsIn[1].r, depth: lenOf(secsIn[0]) + lenOf(secsIn[1]), cbDia: 2 * secsIn[0].r, cbDepth: lenOf(secsIn[0]) };
      if (!hole) continue; // other step patterns are not drilled holes of one feature
      // sizes from a mesh fit (8.0002) snap to what one would type when within 0.001 of a hundredth
      const r5 = v => { const h = Math.round(v * 100) / 100; return Math.abs(v - h) < 1e-3 ? h : Math.round(v * 1e5) / 1e5; };
      out.push({ entry: entry.map(r5), dir: dir.map(r5), ...Object.fromEntries(Object.entries(hole).map(([k, v]) => [k, typeof v === 'number' ? r5(v) : v])),
        through, tip: !through && bottom.some(c => c.kind === 'cone'), faces: [...ch.flatMap(s => s.ids), ...(through ? [] : bottom.map(c => c.id))] });
    }
  }
  return out;
}

// holes that can share one sketch and one hole feature: same entry plane, same sizes
export function groupHoles(holes, tol = 1e-3) {
  const groups = [];
  for (const h of holes) {
    const key = JSON.stringify([h.kind, h.dia, h.through ? 'T' : h.depth, h.tip, h.cbDia, h.cbDepth]);
    const g = groups.find(q => q.key === key && dot(q.dir, h.dir) > 1 - 1e-6 && Math.abs(dot(sub(h.entry, q.holes[0].entry), q.dir)) < tol * 10);
    if (g) g.holes.push(h); else groups.push({ key, dir: h.dir, holes: [h] });
  }
  return groups;
}
