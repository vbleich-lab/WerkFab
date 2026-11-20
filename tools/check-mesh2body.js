// Checks "Netz → Körper" on parts with known faces: the part is built, meshed as an STL export would be, turned
// back into a body, the splinters are cleaned – and the faces are counted. Run in the page (browser preview):
//   window.__mb = null; import('/tools/check-mesh2body.js?' + Date.now()).then(m => m.run()).then(r => (window.__mb = r))
// then read window.__mb (it takes a minute or two). run(['cone']) for single parts.
export const PARTS = {
  // plate with a slot, all edges rounded: fillets meeting at mitres, spherical corners
  slot: R => { let s = R.drawRoundedRectangle(60, 40, 0).sketchOnPlane('XY').extrude(10); s = s.cut(R.drawRoundedRectangle(30, 10, 5).sketchOnPlane('XY').extrude(10)); return s.fillet(1.5); },
  // cylinder with a cone on top, a fillet round the rim and a hollow at the foot of the cone
  cone: R => { const s = R.makeCylinder(20, 10); const c = R.drawCircle(8).sketchOnPlane('XY', 10).loftWith(R.drawCircle(4).sketchOnPlane('XY', 20)); return s.fuse(c).fillet(1, e => e.inPlane('XY', 10)); },
  // box with four rounded vertical edges
  box: R => R.drawRoundedRectangle(40, 30, 0).sketchOnPlane('XY').extrude(12).fillet(3, e => e.inDirection('Z')),
};

export async function run(names = Object.keys(PARTS)) {
  const { R } = await import('../js/kernel.js');
  const MM = await import('../js/mesh.js'), IO = await import('../js/interop.js'), THREE = await import('three');
  const K = (await import('../js/kern/index.js')).activeKernel();
  const rep = sh => { const t = {}; for (const f of sh.faces) t[f.geomType] = (t[f.geomType] || 0) + 1; return { n: sh.faces.length, t, vol: +R.measureVolume(sh).toFixed(3) }; };
  const out = {};
  for (const k of names) {
    try {
      const s = PARTS[k](R), m0 = K.mesh(s, 0.02, 0.2), g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(m0.vertices, 3));
      g.setIndex(Array.from(m0.triangles));
      const m = MM.fromGeometry(g), rnd = MM.findRound(m);
      const t0 = performance.now(), conv = await IO.meshToStep(m, rnd.cylinders, rnd), t1 = performance.now();
      const c = await IO.cleanSlivers(conv.text), t2 = performance.now();
      const b0 = await R.importSTEP(new Blob([conv.text])), b1 = c ? await R.importSTEP(new Blob([c.text])) : null;
      out[k] = { orig: rep(s), conv: rep(b0), clean: b1 ? rep(b1) : null, sConv: +((t1 - t0) / 1000).toFixed(1), sClean: +((t2 - t1) / 1000).toFixed(1) };
      out[k].ok = Math.abs((b1 ? out[k].clean : out[k].conv).vol - out[k].orig.vol) < 1e-4 * out[k].orig.vol + 0.5;
    } catch (e) { out[k] = { error: String(e.message || e) }; }
  }
  return out;
}
