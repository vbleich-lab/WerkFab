// A Fusion design with its timeline: the file written by the script js/fusion/WerkFabExport (it runs inside Fusion
// and describes every timeline step) becomes WerkFab features. This module only translates: for each step it gives
// the ways the step can be built ("alternatives", most likely first). main.js builds them one after the other and
// keeps the first whose model has the volume, the number of bodies and the centre of mass Fusion reported – so a
// direction or a sign that the two programs see differently is found by trying, not by guessing.
import { uid } from './state.js';

export const FUSION_FORMAT = 'werkfab-fusion-timeline';
export const isFusionTimeline = d => !!d && d.format === FUSION_FORMAT && Array.isArray(d.steps);

const r5 = v => +(+v).toFixed(5);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const l = Math.hypot(...a) || 1; return a.map(c => c / l); };
const addScaled = (a, d, k) => [a[0] + d[0] * k, a[1] + d[1] * k, a[2] + d[2] * k];

// sketch plane of WerkFab from the frame of the Fusion sketch (y = n × x in both)
const planeOf = (frame, shift = 0) => ({ o: addScaled(frame.o, frame.n, shift).map(r5), x: frame.x.map(Number), n: frame.n.map(Number) });

// curves of the file → sketch entities
function entitiesOf(curves, cons = false) {
  const out = [];
  for (const c of curves || []) {
    const id = uid('e'), k = c.cons || cons ? { cons: true } : {};
    if (c.t === 'line') out.push({ id, type: 'poly', closed: false, pts: c.pts.map(p => p.map(r5)), ...k });
    else if (c.t === 'arc') out.push({ id, type: 'poly', closed: false, curve: 'arc', pts: c.pts.map(p => p.map(r5)), ...k });
    else if (c.t === 'circle') out.push({ id, type: 'circle', cx: r5(c.c[0]), cy: r5(c.c[1]), r: r5(c.r), ...k });
    else if (c.t === 'ellipse') out.push({ id, type: 'ellipse', cx: r5(c.c[0]), cy: r5(c.c[1]), rx: r5(c.rx), ry: r5(c.ry), rot: r5(c.rot || 0), ...k });
    else if (c.t === 'spline' && c.pts?.length >= 2) {
      const a = c.pts[0], b = c.pts[c.pts.length - 1], closed = c.pts.length > 3 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-4;
      out.push({ id, type: 'poly', closed, pts: (closed ? c.pts.slice(0, -1) : c.pts).map(p => p.map(r5)), ...k });
    }
  }
  return out;
}
// the loops of the profiles a feature uses, as their own sketch (exactly what Fusion extruded)
function profileSketch(step, name, shift = 0, extra = []) {
  // Fusion cuts a sketch into regions wherever curves cross; a feature that takes neighbouring regions takes their
  // union. A curve two of the picked regions share lies inside that union: it comes twice and goes out.
  const k4 = p => p.map(c => (+c).toFixed(4)).join(',');
  const keyOf = c => {
    if (c.t === 'line' || c.t === 'arc') { const a = k4(c.pts[0]), b = k4(c.pts[c.pts.length - 1]); return c.t + (a < b ? a + '|' + b : b + '|' + a) + (c.t === 'arc' ? '|' + k4(c.pts[1]) : ''); }
    if (c.t === 'circle') return 'c' + k4(c.c) + '|' + (+c.r).toFixed(4);
    return null;
  };
  const all = [], seen = new Map();
  for (const loops of step.profiles || []) for (const lp of loops) for (const c of lp.curves || []) {
    const key = keyOf(c);
    all.push([key, c]);
    if (key) seen.set(key, (seen.get(key) || 0) + 1);
  }
  const ents = entitiesOf(all.filter(([key]) => !key || seen.get(key) % 2 === 1).map(([, c]) => c));
  return { id: uid('sk'), type: 'sketch', name, hidden: true, plane: planeOf(step.frame, shift), entities: [...ents, ...extra] };
}

const snapshotFeature = (step, key, name) => ({ id: uid('im'), type: 'import', name, file: `${name}.step`, format: 'step', blob: null, snapshot: key, op: 'new', replace: true, scale: 1, yUp: false, rz: 0, dx: 0, dy: 0, dz: 0 });

// ctx: { sketches: Map(timeline index → sketch id), diag: size of the model so far (mm), params: Map(name → value) }
// Returns [{ features, note? }] – most likely first. An empty list: the step has no description.
export function stepAlternatives(step, ctx) {
  const name = step.name || '';
  if (step.kind === 'sketch') {
    return [{ features: [{ id: uid('sk'), type: 'sketch', name, hidden: true, plane: planeOf(step.frame), entities: entitiesOf(step.curves) }], sketchIndex: step.index }];
  }
  if (step.kind === 'extrude') {
    const L = Math.ceil(Math.max(200, (ctx.diag || 0) * 2 + 50));
    const dist = e => (e.type === 'all' ? (e.positive === false ? -L : L) : +e.distance);
    const shift = +step.startOffset || 0;
    const variants = [];
    if (step.extent === 'sym') variants.push({ extent: 'sym', distance: Math.abs(+step.distance) });
    else if (step.extent === 'two') {
      const d1 = dist(step.one), d2 = dist(step.two);
      variants.push({ extent: 'two', distance: d1, distance2: Math.abs(d2) }, { extent: 'two', distance: -d1, distance2: Math.abs(d2) }, { extent: 'two', distance: Math.abs(d2), distance2: Math.abs(d1) });
    } else {
      const d = dist(step.one);
      variants.push({ extent: 'one', distance: d }, { extent: 'one', distance: -d });
      if (step.one.type === 'all') variants.push({ extent: 'sym', distance: 2 * L });
    }
    const tapers = +step.taper ? [+step.taper, -step.taper] : [0];
    const own = ctx.sketches.get(step.sketch);
    const out = [];
    // first the sketch of the timeline itself (a change of the sketch then changes the body), then the picked profiles alone
    for (const useOwn of own && step.all && !shift ? [true, false] : [false]) {
      for (const v of variants) for (const t of tapers) {
        const sk = useOwn ? null : profileSketch(step, `${name} – Profil`, shift);
        const f = { id: uid('ex'), type: 'extrude', name, sketch: useOwn ? own : sk.id, profiles: 'all', ...v, op: step.op || 'new', ...(t ? { taper: t } : {}) };
        out.push({ features: sk ? [sk, f] : [f] });
      }
    }
    return out;
  }
  if (step.kind === 'revolve') {
    // the axis as a construction line in the sketch of the profiles
    const fr = step.frame, y = cross(fr.n, fr.x), a = step.axis;
    const uv = p => [r5(dot(sub(p, fr.o), fr.x)), r5(dot(sub(p, fr.o), y))];
    const d = unit(a.d), span = Math.max(100, ctx.diag || 0);
    const out = [];
    const full = Math.abs(Math.abs(+step.angle) - 360) < 1e-6;
    for (const ang of full ? [360] : [+step.angle, -step.angle]) {
      const axis = { id: uid('e'), type: 'poly', closed: false, cons: true, pts: [uv(addScaled(a.o, d, -span)), uv(addScaled(a.o, d, span))] };
      const sk = profileSketch(step, `${name} – Profil`, 0, [axis]);
      out.push({ features: [sk, { id: uid('rv'), type: 'revolve', name, sketch: sk.id, profiles: 'all', axis: axis.id, angle: ang, op: step.op || 'new' }] });
    }
    return out;
  }
  if (step.kind === 'hole') {
    const out = [];
    for (const sign of [-1, 1]) {
      // WerkFab drills against the normal of the sketch
      const n = unit(step.dir).map(c => c * sign), o = step.points[0];
      const x = unit(cross(Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], n)), y = cross(n, x);
      const ents = step.points.map(p => ({ id: uid('e'), type: 'point', x: r5(dot(sub(p, o), x)), y: r5(dot(sub(p, o), y)) }));
      const sk = { id: uid('sk'), type: 'sketch', name: `${name} – Punkte`, hidden: true, plane: { o: o.map(r5), x, n }, entities: ents };
      const kind = step.type === 'cbore' ? 'cbore' : step.type === 'csink' ? 'csink' : 'simple';
      const f = { id: uid('ho'), type: 'hole', name, sketch: sk.id, points: 'all', kind, dia: +step.dia, through: !!step.through, depth: step.through ? 10 : +step.depth,
        cbDia: +step.cbDia || +step.dia * 1.8, cbDepth: +step.cbDepth || +step.dia, csDia: +step.csDia || +step.dia * 2, csAngle: +step.csAngle || 90, tip: !step.through && +step.tipAngle < 179 };
      out.push({ features: [sk, f] });
      if (f.tip) out.push({ features: [sk, { ...f, id: uid('ho'), tip: false }] });
    }
    return out;
  }
  if (step.kind === 'fillet') {
    return [{ features: step.sets.map((s, i) => ({ id: uid('fi'), type: 'fillet', name: step.sets.length > 1 ? `${name} (${i + 1})` : name, radius: +s.radius, all: false, edges: s.edges })) }];
  }
  if (step.kind === 'chamfer') {
    return [{ features: step.sets.map((s, i) => ({ id: uid('ch'), type: 'chamfer', name: step.sets.length > 1 ? `${name} (${i + 1})` : name, distance: +s.distance, all: false, edges: s.edges })) }];
  }
  if (step.kind === 'shell') {
    return [{ features: [{ id: uid('sh'), type: 'shell', name, thickness: +step.thickness, faces: step.faces }] }];
  }
  return [];
}
export const snapshotAlternative = (step, key, name) => ({ features: [snapshotFeature(step, key, name)], snapshot: key });

// the user parameters with a plain number (lengths in mm, angles in degrees)
export function fusionParams(doc) {
  const out = [];
  for (const p of doc.params || []) {
    if (!Number.isFinite(+p.value) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(p.name || '')) continue;
    out.push({ name: p.name, expr: String(+(+p.value).toFixed(6)) });
  }
  return out;
}
// "=name" instead of the number where Fusion had a user parameter and the number is still the one of the parameter
export function linkParams(features, step, params) {
  const val = n => params.find(p => p.name === n);
  const link = (f, key, expr) => {
    const p = typeof expr === 'string' && val(expr.trim());
    if (p && typeof f[key] === 'number' && Math.abs(f[key] - +p.expr) < 1e-6) f[key] = '=' + p.name;
  };
  for (const f of features) {
    if (f.type === 'extrude') link(f, 'distance', step.one?.expr || step.distanceExpr);
    if (f.type === 'hole') link(f, 'dia', step.diaExpr);
    if (f.type === 'shell') link(f, 'thickness', step.thicknessExpr);
  }
  (step.sets || []).forEach((s, i) => { const f = features[i]; if (f?.type === 'fillet') link(f, 'radius', s.expr); if (f?.type === 'chamfer') link(f, 'distance', s.expr); });
}

// centre of mass and volume of a closed triangle mesh (BufferGeometry), for the comparison with Fusion
export function meshCentroid(geometry) {
  const pos = geometry.attributes.position, idx = geometry.index;
  const n = idx ? idx.count : pos.count;
  let vol = 0, cx = 0, cy = 0, cz = 0;
  const g = i => { const k = idx ? idx.getX(i) : i; return [pos.getX(k), pos.getY(k), pos.getZ(k)]; };
  for (let i = 0; i + 2 < n; i += 3) {
    const a = g(i), b = g(i + 1), c = g(i + 2);
    const v = (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    vol += v;
    cx += v * (a[0] + b[0] + c[0]) / 4; cy += v * (a[1] + b[1] + c[1]) / 4; cz += v * (a[2] + b[2] + c[2]) / 4;
  }
  return Math.abs(vol) < 1e-9 ? null : { volume: Math.abs(vol), c: [cx / vol, cy / vol, cz / vol] };
}
