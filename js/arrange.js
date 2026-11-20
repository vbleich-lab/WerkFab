// Arranging parts on a print bed (pure, no three.js): each part is given by the XY points of its footprint.
// The footprint is turned so that its bounding rectangle is as small as possible (rotating calipers on the convex
// hull), then the rectangles are packed with MaxRects (best short side fit, 90° turns allowed). Parts that do not
// fit on one bed start a further bed.

export function hull(pts) {
  const p = pts.map(q => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop();
  return lo.concat(up);
}

const rot = ([x, y], a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
function box(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

// smallest bounding rectangle of a footprint: angle (radians, turn about Z) and size after turning
export function bestTurn(pts) {
  const h = hull(pts);
  let best = { a: 0, ...box(h) };
  for (let i = 0; i < h.length; i++) {
    const p = h[i], q = h[(i + 1) % h.length], a = -Math.atan2(q[1] - p[1], q[0] - p[0]);
    const b = box(h.map(v => rot(v, a)));
    if (b.w * b.h < best.w * best.h - 1e-9) best = { a, ...b };
  }
  // prefer the long side along X
  if (best.h > best.w + 1e-9) { const a = best.a + Math.PI / 2; best = { a, ...box(h.map(v => rot(v, a))) }; }
  return best;
}

// MaxRects packer for one bed of size W x H
function packer(W, H) {
  let free = [{ x: 0, y: 0, w: W, h: H }];
  const fits = (r, w, h) => w <= r.w + 1e-9 && h <= r.h + 1e-9;
  function find(w, h, turn) {
    let best = null;
    for (const r of free) for (const [ww, hh, t] of turn ? [[w, h, false], [h, w, true]] : [[w, h, false]]) {
      if (!fits(r, ww, hh)) continue;
      const s = Math.min(r.w - ww, r.h - hh), l = Math.max(r.w - ww, r.h - hh);
      // short side first, then long side, then lowest Y, then lowest X (fills the bed from the front left)
      const k = [s, l, r.y, r.x];
      if (!best || cmp(k, best.k) < 0) best = { x: r.x, y: r.y, w: ww, h: hh, t, k };
    }
    return best;
  }
  const cmp = (a, b) => { for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-9) return a[i] - b[i]; return 0; };
  function place(n) {
    const out = [];
    for (const r of free) {
      if (n.x >= r.x + r.w || n.x + n.w <= r.x || n.y >= r.y + r.h || n.y + n.h <= r.y) { out.push(r); continue; }
      if (n.x > r.x) out.push({ x: r.x, y: r.y, w: n.x - r.x, h: r.h });
      if (n.x + n.w < r.x + r.w) out.push({ x: n.x + n.w, y: r.y, w: r.x + r.w - n.x - n.w, h: r.h });
      if (n.y > r.y) out.push({ x: r.x, y: r.y, w: r.w, h: n.y - r.y });
      if (n.y + n.h < r.y + r.h) out.push({ x: r.x, y: n.y + n.h, w: r.w, h: r.y + r.h - n.y - n.h });
    }
    // drop rectangles inside another one (of two equal ones the first stays)
    const inside = (r, o) => r.x >= o.x - 1e-9 && r.y >= o.y - 1e-9 && r.x + r.w <= o.x + o.w + 1e-9 && r.y + r.h <= o.y + o.h + 1e-9;
    const keep = out.filter(r => r.w > 1e-9 && r.h > 1e-9);
    free = keep.filter((r, i) => !keep.some((o, j) => j !== i && inside(r, o) && (!inside(o, r) || j < i)));
  }
  return { find, place };
}

// items: [{ id, pts: [[x, y], …] }] (footprint in part coordinates); opts: { W, H, gap, margin, turn }
// returns { beds, places: [{ id, bed, a, dx, dy, w, h }], tooBig: [ids] } – a part point (x, y) goes to
// rot((x, y), a) + (dx, dy) on bed `bed`, with (0, 0) the front left corner of the bed.
export function arrange(items, { W = 220, H = 220, gap = 5, margin = 5, turn = true } = {}) {
  const parts = items.map(it => ({ it, b: bestTurn(it.pts) }));
  parts.sort((p, q) => Math.max(q.b.w, q.b.h) - Math.max(p.b.w, p.b.h) || q.b.w * q.b.h - p.b.w * p.b.h);
  const IW = W - 2 * margin + gap, IH = H - 2 * margin + gap; // every rectangle carries one gap on its right/back side
  const beds = [], places = [], tooBig = [];
  for (const { it, b } of parts) {
    const w = b.w + gap, h = b.h + gap;
    let hit = null, bi = -1;
    for (let i = 0; i < beds.length && !hit; i++) { hit = beds[i].find(w, h, turn); if (hit) bi = i; }
    if (!hit) {
      const p = packer(IW, IH), f = p.find(w, h, turn);
      if (!f) { tooBig.push(it.id); continue; }
      beds.push(p); bi = beds.length - 1; hit = f;
    }
    beds[bi].place(hit);
    // turn of the part: best turn, plus 90° when the packer turned the rectangle
    const a = b.a + (hit.t ? Math.PI / 2 : 0), bb = box(hull(it.pts).map(v => rot(v, a)));
    places.push({ id: it.id, bed: bi, a, dx: margin + hit.x - bb.x0, dy: margin + hit.y - bb.y0, w: bb.w, h: bb.h });
  }
  return { beds: beds.length, places, tooBig };
}

// footprint after placing: the moved hull of a part (for drawings and checks)
export function placedHull(pts, pl) { return hull(pts).map(v => { const [x, y] = rot(v, pl.a); return [x + pl.dx, y + pl.dy]; }); }
