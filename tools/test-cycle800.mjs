// Sinumerik: swivelled plane with CYCLE800 (node tools/test-cycle800.mjs). The angles of the cycle (rotation about X,
// then the new Y, then the new Z – mode 57) must give the setup's axes again.
import './lib/node-env.mjs';
const THREE = await import('three');
const { partBodies } = await import('./lib/testpart.mjs');
const { project, OPS } = await import('./lib/postcase.mjs');
const cam = await import('../js/cam.js');
const post = await import('../js/post.js');
const ok = (n, c, x = '') => { console.log((c ? 'OK   ' : 'FEHL ') + n + '  ' + x); if (!c) process.exitCode = 1; };

const p = project(), bodies = partBodies();
p.cam.ops = OPS;
const gen = (patch) => {
  const s = p.cam.setups[1]; // the second setup of the test case: machined from the front
  for (const k of ['orientation', 'wcsMode', 'axesPair', 'zAxis', 'xAxis']) delete s[k];
  Object.assign(s, patch);
  const g = cam.generateSetup(p, bodies, s, null, null); g.setup = s;
  return g;
};
const run = (g, props = {}) => { p.post.props = { sinumerik: props }; return post.postProcess(p, g, null, { postId: 'sinumerik' }); };
const C8 = /CYCLE800\((\d),"([^"]*)",(\d+),(\d+),0,0,0,(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),0,0,0,(-?1),100,1\)/;
// rotation about X, then the new Y, then the new Z
const mat = (a, b, c) => new THREE.Matrix4().makeRotationX(a * Math.PI / 180).multiply(new THREE.Matrix4().makeRotationY(b * Math.PI / 180)).multiply(new THREE.Matrix4().makeRotationZ(c * Math.PI / 180));
const same = (g, a, b, c) => { const R = cam.setupMatrix(g.setup).clone().invert().elements, M = mat(a, b, c).elements; let d = 0; for (const k of [0, 1, 2, 4, 5, 6, 8, 9, 10]) d = Math.max(d, Math.abs(R[k] - M[k])); return d; };

{
  const r = run(gen({ orientation: 'top' }));
  ok('Von oben: kein CYCLE800', !/CYCLE800/.test(r.code));
}
for (const [name, patch] of [['Vorne', { orientation: 'front' }], ['Rechts', { orientation: 'right' }],
  ['Schräg (Achsen gewählt)', { wcsMode: 'axes', axesPair: 'zx', zAxis: [0.3, -0.5, 0.81], xAxis: [1, 0.2, 0] }]]) {
  const g = gen(patch), r = run(g), m = C8.exec(r.code), L = r.code.split('\n');
  ok(`${name}: CYCLE800 mit Freifahren, neuer Ebene, Modus 57`, !!m && m[1] === '1' && m[3] === '200000' && m[4] === '57' && m[8] === '-1', (r.code.match(/.*CYCLE800.*/g) || []).join(' | ').slice(0, 200));
  if (!m) continue;
  const d = same(g, +m[5], +m[6], +m[7]);
  ok(`${name}: Winkel ergeben die Achsen der Aufspannung`, d < 2e-4, `A${m[5]} B${m[6]} C${m[7]}, Abweichung ${d.toExponential(1)}`);
  const iOn = L.findIndex(l => C8.test(l)), iOff = L.findIndex(l => /CYCLE800\(\)/.test(l)), iEnd = L.findIndex(l => /\bM30\b/.test(l));
  const iCut = L.findIndex((l, k) => k > iOn && /\bG1\b/.test(l));
  ok(`${name}: vor dem ersten Schnitt ein, vor M30 zurück auf 0 und aus`, iOn > 0 && iCut > iOn && iOff > iCut && iOff < iEnd && /CYCLE800\(1,"",200000,57,0,0,0,0,0,0,0,0,0,-1,100,1\)/.test(L.slice(iCut, iOff).join('\n')), `ein ${iOn + 1}, aus ${iOff + 1}, M30 ${iEnd + 1}`);
  ok(`${name}: keine Warnung „keine Schwenkebene“`, !r.warnings.some(w => /keine Schwenkebene/.test(w)));
}
{
  const g = gen({ orientation: 'front' });
  const r = run(g, { swivelRecord: 'TABLE', swivelRetract: '4', preferTilt: 'pos' }), m = C8.exec(r.code);
  ok('Einstellungen: Datensatz, Freifahren, Richtung', !!m && m[1] === '4' && m[2] === 'TABLE' && m[8] === '1', m?.[0]);
  const off = run(g, { swivel: 'off' });
  ok('Aus: kein CYCLE800, dafür die Warnung', !/CYCLE800/.test(off.code) && off.warnings.some(w => /keine Schwenkebene/.test(w)));
}
