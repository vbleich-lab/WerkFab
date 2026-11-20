// Motion study over time (pure, no DOM): a plan is a list of steps, each drives one joint to a value in a given
// time. A step runs after the steps before it, or – with "with" – together with the step before it.
// step: { joint, to, dur (s), with?: bool, ease?: 'linear' | 'smooth' }

// start and end time of every step
export function schedule(steps) {
  const out = [];
  let end = 0, prevStart = 0;
  for (const s of steps) {
    const dur = Math.max(0, +s.dur || 0), t0 = s.with && out.length ? prevStart : end, t1 = t0 + dur;
    out.push({ ...s, dur, t0, t1 });
    prevStart = t0;
    end = Math.max(end, t1);
  }
  return out;
}
export const duration = steps => schedule(steps).reduce((m, s) => Math.max(m, s.t1), 0);

const ease = (u, how) => (how === 'smooth' ? u * u * (3 - 2 * u) : u);

// joint values at time t. start: { jointId: value } before the plan. A joint keeps its value between its steps;
// a step starts from where the joint stands when the step begins (also when two steps of one joint overlap).
export function valuesAt(steps, t, start = {}) {
  const sch = schedule(steps), v = { ...start };
  // in order of start time (stable): later steps of the same joint start from the earlier ones' result
  const order = sch.map((s, i) => [s, i]).sort((a, b) => a[0].t0 - b[0].t0 || a[1] - b[1]).map(x => x[0]);
  for (const s of order) {
    if (t < s.t0 || !s.joint) continue;
    const from = Number.isFinite(+v[s.joint]) ? +v[s.joint] : 0, to = +s.to;
    if (!Number.isFinite(to)) continue;
    const u = s.dur > 0 ? Math.min(1, (t - s.t0) / s.dur) : 1;
    v[s.joint] = from + (to - from) * ease(u, s.ease);
  }
  return v;
}

// the times to check: every 1/rate seconds, plus the start and end of every step (so short steps are not missed)
export function sampleTimes(steps, rate = 10) {
  const T = duration(steps), dt = 1 / Math.max(0.5, Math.min(200, +rate || 10)), set = new Set();
  const r = x => Math.round(x * 1e6) / 1e6;
  for (let t = 0; t < T + 1e-9; t += dt) set.add(r(Math.min(t, T)));
  set.add(r(T));
  for (const s of schedule(steps)) { set.add(r(s.t0)); set.add(r(s.t1)); }
  return [...set].sort((a, b) => a - b);
}

// samples [{ t, hits: [{ a, b, volume }] }] → intervals in which bodies collide, with the pairs, the deepest point
// and the last free time before (the collision starts somewhere between "free" and "t0")
export function collisionIntervals(samples) {
  const out = [];
  let cur = null, lastFree = null;
  for (const s of samples) {
    if (!s.hits?.length) { if (cur) { cur.clearAt = s.t; out.push(cur); cur = null; } lastFree = s.t; continue; }
    if (!cur) cur = { t0: s.t, t1: s.t, free: lastFree, pairs: new Map(), worst: { t: s.t, volume: 0 } };
    cur.t1 = s.t;
    for (const h of s.hits) {
      const k = [h.a, h.b].sort().join('|'), p = cur.pairs.get(k) || { a: h.a, b: h.b, volume: 0, t: s.t };
      if (h.volume > p.volume) { p.volume = h.volume; p.t = s.t; }
      cur.pairs.set(k, p);
      if (h.volume > cur.worst.volume) cur.worst = { t: s.t, volume: h.volume };
    }
  }
  if (cur) out.push(cur);
  return out.map(c => ({ ...c, pairs: [...c.pairs.values()].sort((p, q) => q.volume - p.volume) }));
}

// protocol as CSV (";" for Excel): one row per colliding pair and interval
export function protocolCSV(intervals, name = id => id, fmt = x => String(x)) {
  const rows = [['von s', 'bis s', 'frei bis s', 'Körper A', 'Körper B', 'größte Überschneidung mm³', 'bei s']];
  for (const c of intervals) for (const p of c.pairs) rows.push([fmt(c.t0), fmt(c.t1), c.free == null ? '' : fmt(c.free), name(p.a), name(p.b), fmt(p.volume), fmt(p.t)]);
  return '﻿' + rows.map(r => r.map(x => (/[;"\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : x)).join(';')).join('\r\n') + '\r\n';
}
