// Checks "Bohrungen erkennen" after "Netz → Körper": a plate with a through hole, a blind hole (tip optional) and a
// counterbore is meshed, turned back into a body and the holes are searched (same face data as main.js holeFaceData).
// In the page (run({ tip: true }) with a drill point): window.__hm = null; import('/tools/check-holefind-mesh.js?' + Date.now()).then(m => m.run()).then(r => (window.__hm = r))
export async function run({ tip = false } = {}) {
  const { R } = await import('../js/kernel.js');
  const MM = await import('../js/mesh.js'), IO = await import('../js/interop.js'), THREE = await import('three');
  const H = await import('../js/holefind.js');
  const K = (await import('../js/kern/index.js')).activeKernel();
  let s = R.drawRectangle(100, 60).sketchOnPlane('XY').extrude(10).translate([50, 30, 0]);
  s = s.cut(R.makeCylinder(4, 10, [20, 20, 0]));
  // blind hole Ø6 × 6 from the top, flat bottom (tip: true adds a 118° drill point)
  s = s.cut(R.makeCylinder(3, 6, [60, 30, 4]));
  // (as a solid of revolution: a loft to a point meshes into ~90 000 triangles)
  if (tip) s = s.cut(R.draw([0, 0]).lineTo([3, 0]).lineTo([0, -3 / Math.tan(59 * Math.PI / 180)]).close().sketchOnPlane('XZ').revolve([0, 0, 1]).translate([60, 30, 4]));
  s = s.cut(R.makeCylinder(3.3, 10, [80, 40, 0]).fuse(R.makeCylinder(5.5, 6, [80, 40, 4])));
  const m0 = K.mesh(s, 0.02, 0.2), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(m0.vertices, 3));
  g.setIndex(Array.from(m0.triangles));
  const m = MM.fromGeometry(g), rnd = MM.findRound(m);
  const conv = await IO.meshToStep(m, rnd.cylinders, rnd);
  const c = await IO.cleanSlivers(conv.text).catch(() => null);
  const body = await R.importSTEP(new Blob([(c || conv).text]));
  const oc = R.getOC(), P = v => [v.x, v.y, v.z], cyls = [], caps = [];
  body.faces.forEach((fc, id) => {
    const pts = [];
    for (const w of fc.wires) for (const e of w.edges) for (const t of e.geomType === 'LINE' ? [0, 1] : [0, 0.25, 0.5, 0.75, 1]) pts.push(P(e.pointAt(t)));
    if (fc.geomType === 'CYLINDRE') {
      const cy = new oc.BRepAdaptor_Surface(fc.wrapped, true).Cylinder(), ax = cy.Axis(), L = ax.Location(), D = ax.Direction();
      const loc = [L.X(), L.Y(), L.Z()], dir = [D.X(), D.Y(), D.Z()], r = cy.Radius();
      const q = P(fc.pointOnSurface(0.5, 0.5)), n = fc.normalAt(fc.pointOnSurface(0.5, 0.5));
      const t = (q[0] - loc[0]) * dir[0] + (q[1] - loc[1]) * dir[1] + (q[2] - loc[2]) * dir[2];
      const rad = [q[0] - loc[0] - dir[0] * t, q[1] - loc[1] - dir[1] * t, q[2] - loc[2] - dir[2] * t];
      cyls.push({ id, loc, dir, r, concave: n.x * rad[0] + n.y * rad[1] + n.z * rad[2] < 0, pts });
    } else caps.push({ id, kind: fc.geomType === 'PLANE' ? 'plane' : fc.geomType === 'CONE' ? 'cone' : 'other', pts });
  });
  const holes = H.findHoles(cyls, caps);
  return { faces: body.faces.length, cyls: cyls.length, holes: holes.map(h => ({ kind: h.kind, dia: h.dia, depth: h.depth, through: h.through, tip: h.tip, cb: h.cbDia && [h.cbDia, h.cbDepth], entry: h.entry })) };
}
