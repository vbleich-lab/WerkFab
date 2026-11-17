// Further modelling steps: cone, bounding body, boundary fill, web, boss, lip / groove, snap fit, rest,
// remove body, split face, ruled and blend surfaces, untrim, unstitch, flip normals, straighten surface,
// perforate, path flange, frame member and end cap. Each step gets the helpers of model.js (H) and works on
// ctx.bodies like the steps there.
import { R } from './kernel.js';
import { basis, sketchPlane, toWorld } from './plane.js';
import { entityOutline } from './profiles.js';
import { stdPartSteps } from './stdparts.js';

export const EXTRA_TYPES = {
  cone: 'Kegel', bbox: 'Begrenzungskörper', bfill: 'Begrenzungsfüllung', web: 'Gewebe', boss: 'Ansatz', lip: 'Lippe',
  snapfit: 'Rastverbindung', rest: 'Auflage', removebody: 'Körper entfernen', splitface: 'Fläche teilen',
  ruled: 'Regelfläche', blendsurf: 'Verbindungsfläche', untrim: 'Trimmen aufheben', unstitch: 'Verbund aufheben',
  flipnormal: 'Normale umkehren', straighten: 'Fläche begradigen', perforate: 'Perforieren', pathflange: 'Pfadflansch',
  frame: 'Rahmenelement', endcap: 'Endkappe',
};
// steps that make a tool shape (new body, join, cut): they can be patterned and mirrored
export const EXTRA_SOURCES = ['cone', 'web', 'boss', 'snapfit', 'rest', 'perforate', 'pathflange', 'frame', 'endcap', 'lip'];

const fail = msg => { throw new Error(msg); };
const V = {
  sub: (a, b) => a.map((v, i) => v - b[i]), add: (a, b) => a.map((v, i) => v + b[i]), mul: (a, k) => a.map(v => v * k),
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  norm: a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); },
};
const perp = d => V.norm(V.cross(d, Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
const P3 = p => [p.x, p.y, p.z];
const AX = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1], '-x': [-1, 0, 0], '-y': [0, -1, 0], '-z': [0, 0, -1] };
const plane = (o, n, x = null) => new R.Plane(o, x || perp(n), n);
// a half space as a large box: everything on the side the normal n points to, from the point o on
function halfSpace(o, n, size) {
  return R.drawRectangle(2 * size, 2 * size).sketchOnPlane(plane(o, n)).extrude(size);
}
const sizeOf = shape => { const [lo, hi] = shape.boundingBox.bounds; return Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]); };
const bodyOf = (bodies, id) => bodies.find(b => b.id === id) || null;
function solidsOf(shape) {
  const oc = R.getOC(), out = [], ex = new oc.TopExp_Explorer(shape.wrapped, oc.TopAbs_ShapeEnum.TopAbs_SOLID, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  for (; ex.More(); ex.Next()) out.push(R.cast(oc.TopoDS.Solid(ex.Current())));
  ex.delete();
  return out;
}
function subShapes(shape, kind) {
  const oc = R.getOC(), out = [], ex = new oc.TopExp_Explorer(shape.wrapped, oc.TopAbs_ShapeEnum[kind], oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  for (; ex.More(); ex.Next()) out.push(ex.Current());
  ex.delete();
  return out;
}
// the face of a body under a picked point
function faceAt(bodies, p) {
  for (const b of bodies) {
    const bb = b.shape.boundingBox?.bounds;
    if (!bb || ![0, 1, 2].every(k => p[k] >= bb[0][k] - 1e-3 && p[k] <= bb[1][k] + 1e-3)) continue;
    const fc = new R.FaceFinder().containsPoint(p).find(b.shape)[0];
    if (fc) return { b, fc };
  }
  return null;
}
const normalAt = (fc, p) => { const n = fc.normalAt(p); return V.norm([n.x, n.y, n.z]); };
// the points of a sketch: point entities and the centres of circles (optionally only the chosen ones)
function sketchPoints(sk, ids) {
  return sk.entities.filter(e => !Array.isArray(ids) || ids.includes(e.id)).flatMap(e => e.type === 'point' ? [[+e.x, +e.y]] : e.type === 'circle' ? [[+e.cx, +e.cy]] : []);
}
// straight segments of the open (and closed) line chains of a sketch, in world coordinates
function sketchSegments(sk, ids) {
  const b = basis(sk), segs = [];
  for (const e of sk.entities) {
    if (e.type !== 'poly' || e.curve || (Array.isArray(ids) && !ids.includes(e.id))) continue;
    const pts = entityOutline(e).pts.map(q => toWorld(b, q[0], q[1]).toArray());
    const n = e.closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i], c = pts[(i + 1) % pts.length];
      if (Math.hypot(...V.sub(c, a)) > 1e-6) segs.push({ a, b: c });
    }
  }
  return segs;
}

// ---------- solids ----------
function coneTool(f) {
  const r1 = +f.r1 || 0, r2 = +f.r2 || 0, h = +f.h || 0;
  if (!(h > 0)) fail('Höhe fehlt');
  if (!(r1 > 0 || r2 > 0)) fail('Radius fehlt');
  const pts = [[0, 0], [r1, 0], [r2, h], [0, h]].filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1]) > 1e-9);
  let d = R.draw(pts[0]);
  for (let i = 1; i < pts.length; i++) d = d.lineTo(pts[i]);
  let s = d.close().sketchOnPlane('XZ').revolve([0, 0, 1], { origin: [0, 0, 0], angle: 360 });
  if (f.axis === 'x') s = s.rotate(90, [0, 0, 0], [0, 1, 0]);
  else if (f.axis === 'y') s = s.rotate(-90, [0, 0, 0], [1, 0, 0]);
  return s.translate([+f.x || 0, +f.y || 0, +f.z || 0]);
}

// Begrenzender Körper: the box (or the cylinder) that just holds a body, with a margin
function bboxTool(f, bodies) {
  const b = bodyOf(bodies, f.body) || bodies[bodies.length - 1];
  if (!b) fail('Körper wählen');
  const m = +f.margin || 0, [lo, hi] = b.shape.boundingBox.bounds;
  if (f.kind === 'cyl') {
    const ax = ['x', 'y', 'z'].indexOf(f.axis || 'z'), u = (ax + 1) % 3, v = (ax + 2) % 3;
    const c = lo.map((q, i) => (q + hi[i]) / 2);
    // the radius: the farthest vertex of the body from the axis
    let r = 0;
    for (const vx of subShapes(b.shape, 'TopAbs_VERTEX')) { const p = R.getOC().BRep_Tool.Pnt(R.getOC().TopoDS.Vertex(vx)); const q = [p.X(), p.Y(), p.Z()]; r = Math.max(r, Math.hypot(q[u] - c[u], q[v] - c[v])); }
    // curved faces bulge past their vertices: the box half-diagonal across the axis is the safe limit
    r = Math.min(Math.max(r, Math.max(hi[u] - lo[u], hi[v] - lo[v]) / 2), Math.hypot(hi[u] - lo[u], hi[v] - lo[v]) / 2) + m;
    const base = [...c]; base[ax] = lo[ax] - m;
    return R.makeCylinder(r, hi[ax] - lo[ax] + 2 * m, base, AX[f.axis || 'z']);
  }
  return R.makeBox(lo.map(q => q - m), hi.map(q => q + m));
}

// Begrenzungsfüllung: closed hollows inside the body are filled (each solid keeps only its outer skin)
function boundaryFill(f, bodies) {
  const b = bodyOf(bodies, f.body) || [...bodies].reverse().find(x => solidsOf(x.shape).length);
  if (!b) fail('Körper wählen');
  const oc = R.getOC();
  let filled = 0;
  const parts = solidsOf(b.shape).map(sol => {
    const shells = subShapes(sol, 'TopAbs_SHELL');
    if (shells.length < 2) return sol;
    // the outer shell is the one with the largest box
    let best = null, bestD = -1;
    for (const sh of shells) { const s = R.cast(sh), d = sizeOf(s); if (d > bestD) { bestD = d; best = sh; } }
    filled += shells.length - 1;
    const fix = new oc.ShapeFix_Solid();
    const out = R.cast(fix.SolidFromShell(oc.TopoDS.Shell(best)));
    fix.delete();
    return out;
  });
  if (!filled) fail('Der Körper hat keine geschlossenen Hohlräume');
  b.shape = parts.length === 1 ? parts[0] : R.makeCompound(parts);
}

// Gewebe: every open line of the sketch becomes a rib
function webTool(f, ctx, H) {
  const sk = ctx.sketches[f.sketch];
  if (!sk) fail('Skizze fehlt');
  const ids = sk.entities.filter(e => e.type === 'poly' && !e.cons && !e.closed && (!Array.isArray(f.entities) || f.entities.includes(e.id))).map(e => e.id);
  if (!ids.length) fail('Die Skizze hat keine offenen Linien');
  return H.fuseAll(ids.map(id => H.ribTool({ ...f, entity: id }, ctx.sketches)));
}

// Ansatz: a round boss (outer diameter, height) at every point of the sketch, with a hole in it; draft optional
function bossTools(f, ctx) {
  const sk = ctx.sketches[f.sketch];
  if (!sk) fail('Skizze fehlt');
  const pts = sketchPoints(sk, f.points);
  if (!pts.length) fail('Die Skizze braucht Punkte oder Kreise als Mittelpunkte');
  const D = +f.D, d = +f.d || 0, h = +f.h, depth = +f.depth || h;
  if (!(D > 0 && h > 0)) fail('Durchmesser und Höhe fehlen');
  if (d >= D) fail('Der Bohrungsdurchmesser muss kleiner als der Außendurchmesser sein');
  const pl = sketchPlane(sk), b = basis(sk), n = pl.n, dir = f.flip ? V.mul(n, -1) : n;
  const outer = [], inner = [];
  for (const [u, v] of pts) {
    const o = toWorld(b, u, v).toArray();
    let c = R.drawCircle(D / 2).sketchOnPlane(plane(o, dir)).extrude(h);
    if (+f.draft) { try { c = c.draft(+f.draft, ff => ff.not(x => x.parallelTo(plane(o, dir))), plane(o, dir)); } catch { /* straight */ } }
    outer.push(c);
    // the hole starts at the top of the boss and goes down by its depth
    if (d > 0) inner.push(R.drawCircle(d / 2).sketchOnPlane(plane(V.add(o, V.mul(dir, h + 0.01)), V.mul(dir, -1))).extrude(depth + 0.01));
  }
  return { outer: H0.fuseAll(outer), inner: inner.length ? H0.fuseAll(inner) : null };
}
const H0 = { fuseAll: shapes => shapes.reduce((a, b) => (a ? a.fuse(b) : b), null) };

// Lippe / Nut: a band along the inner (or outer) edge of a flat rim face – raised (lip) or sunk (groove)
function lipTool(f, bodies) {
  const p = (f.faces || [])[0];
  if (!p) fail('Randfläche wählen (die ebene Stirnfläche einer Schale)');
  const hit = faceAt(bodies, p);
  if (!hit) fail('Gewählte Fläche nicht mehr gefunden – neu auswählen');
  const { fc } = hit;
  if (fc.geomType !== 'PLANE') fail('Die Randfläche muss eben sein');
  const w = +f.width, h = +f.height;
  if (!(w > 0 && h > 0)) fail('Breite und Höhe fehlen');
  const n = normalAt(fc, p);
  const holes = fc.clone().innerWires();
  const outerW = fc.clone().outerWire();
  const edgeW = f.side === 'outer' || !holes.length ? outerW : holes[0];
  // the wire moved by the width into the material: test both ways, keep the one that stays on the face
  const area = s => { try { return R.measureArea(s); } catch { return 0; } };
  // the band as a solid: (moved outline − outline) ∩ rim face, all drawn out by the height
  const groove = f.kind === 'groove', v = V.mul(n, groove ? -h : h);
  const full = area(fc) * h;
  const vol = s => { try { return R.measureVolume(s); } catch { return 0; } };
  let band = null;
  for (const sgn of [1, -1]) {
    try {
      const moved = edgeW.clone().offset2D(sgn * w);
      const a = R.makeFace(edgeW.clone()), m = R.makeFace(moved);
      const big = area(m) > area(a) ? m : a, small = big === m ? a : m;
      const ring = H1.prism(big, v).cut(H1.prism(small, v));
      const onFace = ring.intersect(H1.prism(fc.clone(), v));
      const got = vol(onFace);
      if (got > 1e-6 && got < full - 1e-6) { band = onFace; break; }
    } catch { /* other way */ }
  }
  if (!band) fail('Der Rand lässt sich nicht versetzen (Breite größer als die Wand?)');
  return { tool: band, op: groove ? 'cut' : 'join', body: hit.b.id };
}
const H1 = {};

// Rastverbindung: a flexible tongue with a hook at its end, standing on a point
function snapTool(f) {
  const L = +f.length, t = +f.thickness, w = +f.width, hk = +f.hook, hl = +f.hookLen || 2 * (+f.hook || 0);
  if (!(L > 0 && t > 0 && w > 0)) fail('Länge, Dicke und Breite fehlen');
  if (!(hk >= 0) || hl >= L) fail('Haken zu lang für die Zunge');
  // profile in the XZ plane: tongue from z = 0 to L, the hook sticks out in +x near the top
  const pts = hk > 0 ? [[0, 0], [t, 0], [t, L - hl], [t + hk, L - hl], [t, L], [0, L]] : [[0, 0], [t, 0], [t, L], [0, L]];
  let d = R.draw(pts[0]);
  for (let i = 1; i < pts.length; i++) d = d.lineTo(pts[i]);
  // plane normal -Y: its second axis (normal × x) is +Z, so the tongue stands up; extruded from y = w/2 to -w/2
  let s = d.close().sketchOnPlane(new R.Plane([0, w / 2, 0], [1, 0, 0], [0, -1, 0])).extrude(w);
  s = s.translate([-t / 2, 0, 0]);
  if (+f.rz) s = s.rotate(+f.rz, [0, 0, 0], [0, 0, 1]);
  if (f.dir && f.dir !== 'z') {
    const to = AX[f.dir];
    if (to) {
      const ax = V.cross([0, 0, 1], to), ang = Math.acos(Math.max(-1, Math.min(1, to[2]))) * 180 / Math.PI;
      s = Math.hypot(...ax) > 1e-9 ? s.rotate(ang, [0, 0, 0], V.norm(ax)) : ang > 90 ? s.rotate(180, [0, 0, 0], [1, 0, 0]) : s;
    }
  }
  return s.translate([+f.x || 0, +f.y || 0, +f.z || 0]);
}

// Auflage: a wall of the given width along the inside of a closed sketch profile (a seat or ledge)
function restTool(f, ctx, H) {
  const sk = ctx.sketches[f.sketch];
  if (!sk) fail('Skizze fehlt');
  const w = +f.width, h = +f.height;
  if (!(w > 0 && h)) fail('Breite und Höhe fehlen');
  const ds = H.regionDrawings(sk, f.profiles);
  if (!ds.length) fail('Kein geschlossenes Profil');
  const pl = sketchPlane(sk), out = [];
  for (const dr of ds) {
    let inner;
    try { inner = dr.clone().offset(-w); } catch { fail('Die Breite ist zu groß für das Profil'); }
    const ring = dr.clone().cut(inner);
    out.push(ring.sketchOnPlane(H.rPlane(pl)).extrude(h));
  }
  return H.fuseAll(out);
}

// ---------- surfaces ----------
// Fläche teilen: faces of a body are cut along a plane or the curves of a sketch – the body stays one piece
function splitFace(f, ctx, H) {
  const { bodies } = ctx;
  const refs = f.faces || [];
  if (!refs.length) fail('Flächen wählen, die geteilt werden sollen');
  let tool;
  if (f.toolKind === 'sketch') {
    const sk = ctx.sketches[f.sketch];
    if (!sk) fail('Skizze fehlt');
    const n = sketchPlane(sk).n, L = 10000;
    tool = H.sewSheets(H.curveWires(sk, f.curves).map(w => H.prism(w.clone().translate(n.map(c => -c * L)), n.map(c => 2 * c * L))));
  } else {
    const p = H.offsetPlane(H.planeRef(f.plane || 'XY', ctx.features), f.offset);
    if (!p) fail('Ebene fehlt');
    tool = R.drawRectangle(20000, 20000).sketchOnPlane(H.rPlane(p)).face();
  }
  const oc = R.getOC();
  let done = 0;
  for (const { b, own } of H.bodiesWithPoints(bodies, refs)) {
    const faces = [];
    for (const p of own) for (const fc of new R.FaceFinder().containsPoint(p).find(b.shape)) if (!faces.some(x => x.isSame(fc))) faces.push(fc);
    if (!faces.length) continue;
    // the lines where the tool meets the chosen faces; they split those faces only
    const edges = [];
    for (const fc of faces) {
      const sec = new oc.BRepAlgoAPI_Section(fc.wrapped, tool.wrapped, true);
      if (sec.IsDone()) for (const e of subShapes(R.cast(sec.Shape()), 'TopAbs_EDGE')) edges.push(e);
      sec.delete();
    }
    if (!edges.length) continue;
    const args = new oc.NCollection_List_TopoDS_Shape(), tools = new oc.NCollection_List_TopoDS_Shape();
    args.Append(b.shape.wrapped);
    for (const e of edges) tools.Append(e);
    const sp = new oc.BRepAlgoAPI_Splitter();
    sp.SetArguments(args); sp.SetTools(tools);
    sp.Build(new oc.Message_ProgressRange());
    if (sp.IsDone()) { b.shape = R.cast(sp.Shape()); done++; }
    sp.delete(); args.delete(); tools.delete();
  }
  if (!done) fail('Die Ebene oder Skizze schneidet die gewählten Flächen nicht');
}

// An edge that lies on two bodies (a surface and the solid thickened from it) is found on both: it is taken
// once, from a surface body if there is one.
function edgesOnce(hits, H) {
  const pt = (e, u) => P3(e.pointAt(u)).map(x => x.toFixed(3)).join(',');
  const key = e => [pt(e, 0.5), ...[pt(e, 0), pt(e, 1)].sort()].join(';');
  const sheet = b => !H.hasSolid(b.shape), by = new Map();
  for (const h of hits) { const k = key(h.e), had = by.get(k); if (!had || (!sheet(had.b) && sheet(h.b))) by.set(k, h); }
  return [...by.values()];
}

// Regelfläche: a strip from picked edges, along the face normal (or tangent away from the face, or a direction)
function ruledTool(f, bodies, H) {
  const d = +f.distance;
  if (!d) fail('Abstand fehlt');
  const hits = edgesOnce(H.pickedEdges(f.edges, bodies), H);
  if (!hits.length) fail('Kanten wählen');
  const strips = [];
  for (const { e, b } of hits) {
    const fc = b.shape.faces.find(x => x.edges.some(y => y.isSame(e)));
    const N = e.geomType === 'LINE' ? 1 : 24;
    const tan = u => V.norm(V.sub(P3(e.pointAt(Math.min(1, u + 0.002))), P3(e.pointAt(Math.max(0, u - 0.002)))));
    const dirAt = u => {
      if (AX[f.dir]) return AX[f.dir];
      if (!fc) fail('Die Kante gehört zu keiner Fläche – eine Richtung wählen');
      const p = P3(e.pointAt(u)), n = normalAt(fc, p);
      if (f.dir === 'tangent') { const t = V.norm(V.cross(tan(u), n)), c = P3(fc.center); return V.dot(t, V.sub(c, p)) > 0 ? V.mul(t, -1) : t; }
      return n;
    };
    const pts = [];
    for (let k = 0; k <= N; k++) { const u = k / N; pts.push(V.add(P3(e.pointAt(u)), V.mul(dirAt(u), d))); }
    const far = N === 1 ? R.makeLine(pts[0], pts[1]) : R.makeBSplineApproximation(pts);
    strips.push(R.loft([R.assembleWire([e.clone()]), R.assembleWire([far])], { ruled: true }, true));
  }
  return H.sewSheets(strips);
}

// Verbindungsfläche: a smooth surface between two picked edges (or edge chains)
function blendTool(f, bodies, H) {
  const a = edgesOnce(H.pickedEdges(f.edges, bodies), H), c = edgesOnce(H.pickedEdges(f.edges2, bodies), H);
  if (!a.length || !c.length) fail('Zwei Kanten wählen (erste und zweite Seite)');
  try { return R.loft([R.assembleWire(a.map(x => x.e.clone())), R.assembleWire(c.map(x => x.e.clone()))], { ruled: !!f.ruled }, true); } catch { fail('Verbindung nicht möglich – Kanten zusammenhängend und in gleicher Richtung wählen'); }
}

// rebuild a body from its faces with some faces replaced
function rebuildFaces(b, replace) {
  const oc = R.getOC(), sew = new oc.BRepBuilderAPI_Sewing(1e-3, true, true, true, false);
  for (const fc of b.shape.faces) { const r = replace(fc); if (r) sew.Add(r.wrapped); }
  sew.Perform(new oc.Message_ProgressRange());
  let out = R.cast(sew.SewedShape());
  const closed = sew.NbFreeEdges() === 0;
  sew.delete();
  if (closed) try { const fix = new oc.ShapeFix_Solid(), sol = R.cast(fix.SolidFromShell(oc.TopoDS.Shell(subShapes(out, 'TopAbs_SHELL')[0]))); fix.delete(); if (R.measureVolume(sol) > 1e-6) out = sol; } catch { /* stays a surface */ }
  b.shape = out;
}
const pickedFaceSet = (b, refs) => { const faces = []; for (const p of refs) for (const fc of new R.FaceFinder().containsPoint(p).find(b.shape)) faces.push(fc); return faces; };

// Trimmen aufheben: holes in the picked faces are closed (the face keeps its outline)
function untrim(f, ctx, H) {
  let n = 0;
  for (const { b, own } of H.bodiesWithPoints(ctx.bodies, f.faces || [])) {
    const chosen = pickedFaceSet(b, own);
    if (!chosen.length) continue;
    rebuildFaces(b, fc => {
      if (!chosen.some(x => x.isSame(fc))) return fc;
      if (!fc.clone().innerWires().length && !f.outer) return fc;
      n++;
      return R.makeNewFaceWithinFace(fc, fc.clone().outerWire());
    });
  }
  if (!n) fail('Die gewählten Flächen haben keine Öffnungen');
}

// Fläche begradigen: a picked face is replaced by a calm surface spanned over its outline (bumps go away)
function straighten(f, ctx, H) {
  let n = 0;
  for (const { b, own } of H.bodiesWithPoints(ctx.bodies, f.faces || [])) {
    const chosen = pickedFaceSet(b, own);
    if (!chosen.length) continue;
    rebuildFaces(b, fc => {
      if (!chosen.some(x => x.isSame(fc))) return fc;
      n++;
      const w = fc.clone().outerWire();
      try { return R.makeFace(w.clone()); } catch { return R.makeNonPlanarFace(w); }
    });
  }
  if (!n) fail('Flächen wählen');
}

// Verbund aufheben: every face of a body becomes a surface body of its own
function unstitch(f, bodies) {
  const b = bodyOf(bodies, f.body) || bodies[bodies.length - 1];
  if (!b) fail('Körper wählen');
  const faces = b.shape.faces;
  if (faces.length < 2) fail('Der Körper hat nur eine Fläche');
  const at = bodies.indexOf(b);
  bodies.splice(at, 1, ...faces.map((fc, i) => ({ id: i ? `${f.id}_${i}` : b.id, name: '', shape: fc })));
}

// Normale umkehren: the faces of a surface body point the other way
function flipNormals(f, bodies) {
  const ids = Array.isArray(f.bodies) && f.bodies.length ? f.bodies : [f.body].filter(Boolean);
  const list = ids.length ? bodies.filter(b => ids.includes(b.id)) : bodies.slice(-1);
  if (!list.length) fail('Flächenkörper wählen');
  for (const b of list) b.shape = R.cast(b.shape.wrapped.Reversed());
}

// ---------- sheet metal and weldments ----------
// Perforieren: a grid of round holes inside the closed profiles of a sketch, through the material
function perforateTool(f, ctx, H) {
  const sk = ctx.sketches[f.sketch];
  if (!sk) fail('Skizze fehlt');
  const dia = +f.dia, pitch = +f.pitch, margin = +f.margin || 0;
  if (!(dia > 0 && pitch > dia)) fail('Teilung muss größer als der Lochdurchmesser sein');
  const polys = H.profileItems(sk, f.profiles).map(i => i.poly).filter(p => p.length >= 3);
  if (!polys.length) fail('Kein geschlossenes Profil');
  const inside = ([x, y], P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > y) !== (P[j][1] > y) && x < ((P[j][0] - P[i][0]) * (y - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c; };
  const distEdge = ([x, y], P) => { let m = Infinity; for (let i = 0; i < P.length; i++) { const a = P[i], c = P[(i + 1) % P.length], dx = c[0] - a[0], dy = c[1] - a[1], l2 = dx * dx + dy * dy, s = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)) : 0; m = Math.min(m, Math.hypot(x - a[0] - dx * s, y - a[1] - dy * s)); } return m; };
  // the outer profile carries the grid; holes of the profile (inner loops) stay free
  const area = P => Math.abs(P.reduce((s, a, i) => { const c = P[(i + 1) % P.length]; return s + a[0] * c[1] - c[0] * a[1]; }, 0) / 2);
  const outer = [...polys].sort((p, q) => area(q) - area(p))[0], holes = polys.filter(p => p !== outer && p.every(q => inside(q, outer)));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of outer) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const rowH = f.stagger !== false ? pitch * Math.sqrt(3) / 2 : pitch, centres = [];
  const keep = dia / 2 + margin;
  for (let j = 0, y = y0 + keep; y <= y1 - keep + 1e-9; j++, y += rowH) {
    for (let x = x0 + keep + (f.stagger !== false && j % 2 ? pitch / 2 : 0); x <= x1 - keep + 1e-9; x += pitch) {
      const q = [x, y];
      if (!inside(q, outer) || distEdge(q, outer) < keep - 1e-9) continue;
      if (holes.some(hp => inside(q, hp) || distEdge(q, hp) < keep - 1e-9)) continue;
      centres.push(q);
    }
  }
  if (!centres.length) fail('Keine Löcher passen in das Profil');
  if (centres.length > 5000) fail(`${centres.length} Löcher – mehr als 5000, Teilung vergrößern`);
  const b = basis(sk), n = sketchPlane(sk).n, L = +f.depth > 0 ? +f.depth : 10000;
  const tools = centres.map(([u, v]) => { const o = toWorld(b, u, v).toArray(); return R.makeCylinder(dia / 2, 2 * L, V.sub(o, V.mul(n, L)), n); });
  return R.makeCompound(tools);
}

// Pfadflansch: an open line chain of a sketch, thickened to one side and drawn out along the sketch normal
function pathFlangeTool(f, ctx, H) {
  return H.ribTool({ ...f, symmetric: !!f.symmetric, height: f.length }, ctx.sketches);
}

// the profile of a catalogue section as a sketch on the plane at a, looking along d
function profileSketch(fam, size, o, d, up, rot) {
  const part = stdPartSteps(fam, size, 1);
  let x = V.norm(V.cross(up, d));
  if (Math.hypot(...V.cross(up, d)) < 1e-9) x = perp(d);
  if (rot) { const a = (rot * Math.PI) / 180, y = V.cross(d, x); x = V.add(V.mul(x, Math.cos(a)), V.mul(y, Math.sin(a))); }
  const ents = [];
  for (const st of part.steps) {
    if (st.k !== 'prism') continue;
    const id = `p${ents.length}`;
    if (st.shape === 'poly') ents.push({ id, type: 'poly', closed: true, pts: st.pts.map(p => [...p]), ...(st.radii ? { radii: { ...st.radii } } : {}) });
    else if (st.shape === 'rect') ents.push({ id, type: 'rect', x: (st.cx || 0) - st.w / 2, y: -st.h / 2, w: st.w, h: st.h, ...(st.rr ? { r: st.rr } : {}) });
    else if (st.shape === 'circle') ents.push({ id, type: 'circle', cx: 0, cy: 0, r: st.r });
    else if (st.shape === 'hex') ents.push({ id, type: 'ngon', cx: 0, cy: 0, r: st.s / Math.sqrt(3), n: 6, rot: 0 });
    if (st.hole) ents.push({ id: id + 'h', type: 'circle', cx: 0, cy: 0, r: st.hole });
  }
  if (!ents.length) fail('Dieses Bauteil hat kein Profil');
  return { id: '__frame', type: 'sketch', plane: { o, x, n: d }, entities: ents, rmax: part.rmax };
}
// Rahmenelement: a catalogue section along every line of a sketch; at corners where two lines meet the
// members are mitred (cut along the bisecting plane)
function frameTool(f, ctx, H) {
  const sk = ctx.sketches[f.sketch];
  if (!sk) fail('Skizze mit Linien wählen');
  if (!f.fam || !f.size) fail('Profil wählen');
  const segs = sketchSegments(sk, f.entities);
  if (!segs.length) fail('Die Skizze hat keine geraden Linien');
  const up = sketchPlane(sk).n, tol = 1e-4;
  const same = (p, q) => Math.hypot(...V.sub(p, q)) < tol;
  const dirOf = s => V.norm(V.sub(s.b, s.a));
  const probe = profileSketch(f.fam, f.size, [0, 0, 0], [0, 0, 1], [0, 1, 0], 0), ext = 2 * (probe.rmax || 50) + 1;
  // corners: an end of one member that meets an end of exactly one other member
  const cuts = segs.map(() => []);
  const ends = [];
  segs.forEach((s, i) => { ends.push({ i, end: 'a', p: s.a }, { i, end: 'b', p: s.b }); });
  const extend = segs.map(() => ({ a: 0, b: 0 }));
  for (const e of ends) {
    const others = ends.filter(o => o.i !== e.i && same(o.p, e.p));
    if (others.length !== 1 || e.i > others[0].i || f.corner === 'none') continue;
    const o = others[0];
    const dIn = e.end === 'b' ? dirOf(segs[e.i]) : V.mul(dirOf(segs[e.i]), -1);   // e runs into the corner
    const dOut = o.end === 'a' ? dirOf(segs[o.i]) : V.mul(dirOf(segs[o.i]), -1);  // o runs away from it
    if (Math.abs(V.dot(dIn, dOut)) > 1 - 1e-9) continue; // straight on: nothing to cut
    const m = V.norm(V.add(dIn, dOut));
    extend[e.i][e.end] = ext; extend[o.i][o.end] = ext;
    cuts[e.i].push({ o: e.p, n: m });
    cuts[o.i].push({ o: e.p, n: V.mul(m, -1) });
  }
  const members = segs.map((s, i) => {
    const d = dirOf(s), a = V.sub(s.a, V.mul(d, extend[i].a)), L = Math.hypot(...V.sub(s.b, s.a)) + extend[i].a + extend[i].b;
    const off = f.align === 'top' ? -(probe.rmax || 0) : 0;
    const psk = profileSketch(f.fam, f.size, V.add(a, V.mul(up, off)), d, up, +f.rot || 0);
    let m = H.extrudeTool(psk, { profiles: 'all', distance: L, extent: 'one' });
    for (const c of cuts[i]) m = m.cut(halfSpace(c.o, c.n, L + 4 * ext));
    return m;
  });
  return f.separate ? R.makeCompound(members) : H.fuseAll(members);
}

// Endkappe: a plate on the open end of a tube or section, of the given thickness (optionally set in)
function endcapTool(f, bodies) {
  const refs = f.faces || [];
  if (!refs.length) fail('Stirnfläche des Rohrs oder Profils wählen');
  const t = +f.thickness, inset = +f.inset || 0;
  if (!(t > 0)) fail('Dicke fehlt');
  const out = [];
  let body = null;
  for (const p of refs) {
    const hit = faceAt(bodies, p);
    if (!hit) fail('Gewählte Fläche nicht mehr gefunden – neu auswählen');
    if (hit.fc.geomType !== 'PLANE') fail('Die Stirnfläche muss eben sein');
    const n = normalAt(hit.fc, p);
    let w = hit.fc.clone().outerWire();
    if (inset > 0) w = w.offset2D(-inset);
    let face = R.makeFace(w);
    // the cap sits outside (on the end) or inside (in the opening)
    if (f.place === 'inside') face = face.translate(V.mul(n, -t));
    out.push(R.basicFaceExtrusion(face, new R.Vector(V.mul(n, t))));
    body ||= hit.b.id;
  }
  return { tool: H0.fuseAll(out), body };
}

// ---------- the step itself ----------
export function runExtra(f, ctx, H) {
  const { bodies, tools } = ctx;
  H1.prism = H.prism;
  const put = (tool, op, target, only = null) => {
    tools[f.id] = { tool: tool.clone(), op, target };
    H.applyOp(bodies, tool, op, f.id, target, only);
  };
  switch (f.type) {
    case 'cone': return put(coneTool(f), f.op || 'new', f.target);
    case 'bbox': { const t = bboxTool(f, bodies); return put(t, f.op || 'new', f.target); }
    case 'bfill': return boundaryFill(f, bodies);
    case 'web': return put(webTool(f, ctx, H), f.op || 'join', f.target);
    case 'boss': {
      const { outer, inner } = bossTools(f, ctx);
      const op = f.op || 'join';
      put(outer, op, f.target);
      if (inner && op !== 'cut') H.applyOp(bodies, inner, 'cut', f.id, null, (bodies.find(b => b.id === f.target) || [...bodies].reverse().find(b => H.hasSolid(b.shape)))?.id || null);
      return;
    }
    case 'lip': { const r = lipTool(f, bodies); return put(r.tool, r.op, f.target || r.body, r.op === 'cut' ? r.body : null); }
    case 'snapfit': return put(snapTool(f), f.op || 'join', f.target);
    case 'rest': return put(restTool(f, ctx, H), f.op || 'join', f.target);
    case 'removebody': {
      const ids = Array.isArray(f.bodies) && f.bodies.length ? f.bodies : [f.body].filter(Boolean);
      if (!ids.length) fail('Körper wählen');
      const n0 = bodies.length;
      for (const id of ids) { const i = bodies.findIndex(b => b.id === id); if (i >= 0) bodies.splice(i, 1); }
      if (bodies.length === n0) fail('Körper nicht mehr vorhanden');
      return;
    }
    case 'splitface': return splitFace(f, ctx, H);
    case 'ruled': case 'blendsurf': {
      const s = f.type === 'ruled' ? ruledTool(f, bodies, H) : blendTool(f, bodies, H);
      tools[f.id] = { tool: s.clone(), op: 'new' };
      bodies.push({ id: f.id, name: '', shape: s });
      return;
    }
    case 'untrim': return untrim(f, ctx, H);
    case 'straighten': return straighten(f, ctx, H);
    case 'unstitch': return unstitch(f, bodies);
    case 'flipnormal': return flipNormals(f, bodies);
    case 'perforate': return put(perforateTool(f, ctx, H), 'cut', null, f.cutOnly || null);
    case 'pathflange': return put(pathFlangeTool(f, ctx, H), f.op || 'join', f.target);
    case 'frame': return put(frameTool(f, ctx, H), f.op || 'new', f.target);
    case 'endcap': { const r = endcapTool(f, bodies); return put(r.tool, f.op || 'join', f.target || r.body); }
  }
  fail('Unbekannter Schritt: ' + f.type);
}
