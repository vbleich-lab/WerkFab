// Holder check: does the tool holder (or the spindle nose) touch the stock or a fixture, and how far must the tool
// stick out of the holder at least? The setup is cut operation by operation into a coarse height field; at every
// point of the path each ring of the holder (its segments, bottom first) is compared with the highest material and
// fixture under it.
import { StockField } from './cam.js';
import { stickout, holderSegments } from './tooldraw.js';

const NO_HOLDER = new Set(['waterjet', 'laser', 'plasma', 'holder', 'arcwire', 'laserpowder', 'laserwire', 'probe', 'none']);

// gen: result of generateSetup (stock, results, ops, T); bodies: all bodies (fixtures are looked up by id)
// returns Map opId → { need, have, touch, what, at } (need = minimum stick-out incl. margin, mm)
export function holderReach(gen, bodies, setup, { margin = 2 } = {}) {
  const out = new Map();
  const { stock, results, ops, T } = gen || {};
  if (!stock || !ops?.length || !results) return out;
  const ids = new Set(setup?.fixtures || []);
  const fix = (bodies || []).filter(b => ids.has(b.id) && b.geometry).map(b => {
    const g = b.geometry.clone();
    if (T) g.applyMatrix4(T);
    g.computeBoundingBox();
    const bb = g.boundingBox.clone();
    g.dispose();
    return bb;
  });
  const span = Math.max(stock.maxX - stock.minX, stock.maxY - stock.minY);
  const field = new StockField(stock, null, Math.min(2, Math.max(0.5, span / 200)));
  const { G, nx, ny, res, minX, minY } = field;
  let gMax = -Infinity;
  for (let k = 0; k < G.length; k++) if (G[k] > gMax) gMax = G[k];
  const fixMax = fix.reduce((m, bb) => Math.max(m, bb.max.z), -Infinity);
  // highest material in a disc of radius R around (x, y)
  const discMax = (x, y, R) => {
    const rc = Math.ceil(R / res), ci = Math.round((x - minX) / res), cj = Math.round((y - minY) / res), RR = (R + res * 0.5) ** 2;
    let top = -Infinity;
    for (let dj = -rc; dj <= rc; dj++) {
      const j = cj + dj;
      if (j < 0 || j >= ny) continue;
      const dy2 = (dj * res) ** 2;
      for (let di = -rc; di <= rc; di++) {
        const i = ci + di;
        if (i < 0 || i >= nx || (di * res) ** 2 + dy2 > RR) continue;
        const v = G[j * nx + i];
        if (v > top) top = v;
      }
    }
    return top;
  };
  const fixUnder = (x, y, R) => {
    let top = -Infinity;
    for (const bb of fix) {
      const dx = Math.max(bb.min.x - x, 0, x - bb.max.x), dy = Math.max(bb.min.y - y, 0, y - bb.max.y);
      if (dx * dx + dy * dy <= R * R && bb.max.z > top) top = bb.max.z;
    }
    return top;
  };
  for (const op of ops) {
    const r = results.get(op.id);
    if (!r || r.error || r.disabled || !r.moves?.length || !r.tool || r.rotary) continue;
    const t = r.tool, mv = r.moves;
    const check = !NO_HOLDER.has(t.type) && +t.dia > 0;
    let z0 = 0;
    const rings = check ? holderSegments(t).map(s => { const o = { off: z0, R: Math.max(+s.d1 || 0, +s.d2 || 0) / 2 }; z0 += +s.h || 0; return o; }).filter(o => o.R > 0) : [];
    const have = check ? stickout(t) : 0;
    let best = { need: -Infinity }, touch = null;
    const step = Math.max(res, 1);
    for (let w = 1; w < mv.length; w++) {
      const a = mv[w - 1], b = mv[w];
      if (!Number.isFinite(a.x) || !Number.isFinite(b.x)) continue;
      if (b.t !== 'r') field.cutMove(a, b, t);
      if (!rings.length) continue;
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
      for (let q = q0(w); q <= n; q++) {
        const x = a.x + ((b.x - a.x) * q) / n, y = a.y + ((b.y - a.y) * q) / n, z = a.z + ((b.z - a.z) * q) / n;
        for (const g of rings) {
          // cheap bound first: nothing in the whole setup is high enough to matter
          const bound = Math.max(gMax, fixMax) - z - g.off;
          if (bound + margin <= best.need && (touch || bound <= have)) continue;
          const sTop = discMax(x, y, g.R), fTop = fixUnder(x, y, g.R), top = Math.max(sTop, fTop);
          if (!Number.isFinite(top)) continue;
          const need = top - z - g.off; // stick-out at which this ring just touches
          if (need + margin > best.need) best = { need: need + margin, at: { x, y, z }, what: fTop >= sTop ? 'fixture' : 'stock' };
          if (!touch && need > have + 1e-6) touch = { at: { x, y, z }, what: fTop >= sTop ? 'fixture' : 'stock', need };
        }
      }
    }
    if (!check) continue;
    const info = { need: Math.max(0, +best.need.toFixed(1)) || 0, have, touch: !!touch, what: touch?.what || best.what || null, at: touch?.at || best.at || null };
    out.set(op.id, info);
    r.reach = info;
    if (touch) {
      const p = touch.at;
      r.warning ||= `${touch.what === 'fixture' ? 'Halter berührt das Spannmittel' : 'Halter berührt das Material'} (bei X${p.x.toFixed(1)} Y${p.y.toFixed(1)} Z${p.z.toFixed(1)}) – Ausspannlänge mindestens ${info.need.toFixed(1)} mm, eingestellt ${have.toFixed(1)} mm`;
    }
  }
  return out;
  function q0(w) { return w === 1 ? 0 : 1; }
}
