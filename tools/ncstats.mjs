// NC-Statistik: alle Frässtrategien am Testteil, jeder eingebaute Fräs-Postprozessor –
// Zeilen, Bytes und Ballast (kollineare G1, Nullwege, doppelte Eilgänge, wiederholte Wörter).
// Aufruf: node tools/ncstats.mjs [postId] [--dump typ]
import './lib/node-env.mjs';
const { partBodies, testProject } = await import('./lib/testpart.mjs');
const cam = await import('../js/cam.js');
const post = await import('../js/post.js');
const { TURN_OPS } = await import('../js/turning.js');
const { writeFileSync } = await import('node:fs');

const arg = process.argv.slice(2);
const only = arg.find(a => !a.startsWith('--') && arg[arg.indexOf(a) - 1] !== '--dump');
const dump = arg.includes('--dump') ? arg[arg.indexOf('--dump') + 1] : null;
const bodies = partBodies();
const XY = z => ({ o: [0, 0, z], x: [1, 0, 0], n: [0, 0, 1] });
function project() {
  const p = testProject();
  p.features.push(
    { id: 'skBig', type: 'sketch', name: 'Große Bohrungen', plane: XY(10), entities: [[100, 60], [100, 70], [112, 65]].map(([cx, cy], i) => ({ id: 'g' + i, type: 'circle', cx, cy, r: 5 })) },
    { id: 'skSlot', type: 'sketch', name: 'Nut', plane: XY(10), entities: [{ id: 's1', type: 'slot', cx: 100, cy: 8, len: 12, w: 4, rot: 0 }] },
  );
  return p;
}
const SK = { contour: 'skBoss', pocket: 'skPocket', adaptive: 'skPocket', chamfer: 'skBoss', trace: 'skBoss', drill: 'skHoles', bore: 'skBig', thread: 'skBig', circular: 'skBig', slot: 'skSlot' };
const TOOL = { drill: 'T3', thread: 'T6', bore: 'T1', circular: 'T1', slot: 'T2', chamfer: 'T5', trace: 'T2' };
const TYPES = ['face', 'contour', 'pocket', 'adaptive', 'chamfer', 'drill', 'bore', 'circular', 'slot', 'rough3d', 'parallel3d', 'contour3d', 'scallop3d', 'pencil3d', 'spiral3d', 'adaptive3d', 'horizontal3d', 'steep3d'];
const POSTS = only ? [only] : ['grbl', 'linuxcnc', 'fanuc', 'okuma-mill', 'sinumerik', 'heidenhain'];

const p = project();
p.cam.ops = TYPES.filter(t => t in cam.OP_TYPES && !(t in TURN_OPS)).map((type, i) => ({
  id: 'o' + i, name: type, setup: 'S1', enabled: true, type, tool: TOOL[type] || (cam.OPS_3D.includes(type) ? 'T4' : 'T1'),
  ...(SK[type] ? { sketch: SK[type], entities: 'all', geomSource: 'sketch' } : {}), ...(type === 'contour' ? { side: 'outside' } : {}),
  ...(['rough3d', 'adaptive3d', 'pocket3d'].includes(type) ? { stockToLeave: 0.3 } : {}), // defaults of the app
}));
const t0 = performance.now();
const g = cam.generateSetup(p, bodies, p.cam.setups[0], null, null);
g.setup = p.cam.setups[0];
const genMs = Math.round(performance.now() - t0);
let moves = 0; for (const op of p.cam.ops) moves += g.results.get(op.id)?.moves?.length || 0;
console.log(`Bahnen: ${p.cam.ops.length} Operationen, ${moves} Punkte, ${genMs} ms`);

const AX = /([XYZIJKFR])([-+]?\d*\.?\d+)/g;
for (const id of POSTS) {
  const t1 = performance.now();
  const r = post.postProcess(p, g, null, { postId: id });
  const ms = Math.round(performance.now() - t1);
  const lines = r.code.split('\n');
  let pos = { X: null, Y: null, Z: null }, mode = null, prevDir = null, colin = 0, zero = 0, rapidPairs = 0, prevRapid = false, g1 = 0, arcs = 0, rapids = 0, prevF = null, sameF = 0;
  for (const raw of lines) {
    const l = raw.replace(/\(.*?\)|;.*$/g, '').trim().replace(/^\d+\s+(?=[A-Z])/, ''); // Heidenhain block numbers
    if (!l || /^(O|%|N?\d*\s*$)/.test(l) && !/[XYZ]/.test(l)) { continue; }
    const g = l.match(/\bG0?([0-3])\b/);
    if (g) mode = +g[1];
    const w = {}; for (const m of l.replaceAll(/^N\d+\s*/g, '').matchAll(AX)) w[m[1]] = +m[2];
    if (/^L /.test(l)) mode = /FMAX/.test(l) ? 0 : 1; // Heidenhain
    if (/^C /.test(l) || /^CP /.test(l)) mode = 2;
    const moved = ['X', 'Y', 'Z'].some(k => k in w);
    if (!moved || mode == null) { prevDir = null; continue; }
    const np = { X: w.X ?? pos.X, Y: w.Y ?? pos.Y, Z: w.Z ?? pos.Z };
    if (mode === 0) rapids++; else if (mode === 1) g1++; else arcs++;
    if (w.F != null) { if (w.F === prevF) sameF++; prevF = w.F; }
    if (mode === 1 && pos.X != null) {
      const d = [np.X - pos.X, np.Y - pos.Y, np.Z - pos.Z], L = Math.hypot(...d);
      if (L < 1e-9) zero++;
      else {
        const u = d.map(v => v / L);
        if (prevDir && Math.abs(u[0] * prevDir[0] + u[1] * prevDir[1] + u[2] * prevDir[2] - 1) < 1e-9 && w.F == null) colin++;
        prevDir = u;
      }
    } else prevDir = null;
    if (mode === 0 && prevRapid) rapidPairs++;
    prevRapid = mode === 0;
    pos = np;
  }
  console.log(`${id.padEnd(11)} ${String(lines.length).padStart(6)} Zeilen ${String(r.code.length).padStart(8)} B  ${ms} ms | G1 ${g1}  Bögen ${arcs}  Eil ${rapids} | kollinear ${colin}  Nullweg ${zero}  Eil-Folgen ${rapidPairs}  F doppelt ${sameF} | Warnungen ${r.warnings.length}`);
  if (dump) writeFileSync(`${dump}-${id}.nc`, r.code);
}
