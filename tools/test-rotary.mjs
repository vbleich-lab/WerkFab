// 4-axis finishing on a small part (node tools/test-rotary.mjs): a square bar 3 × 3 mm in round stock Ø 4.8 mm.
// The ball cutter must touch the flats everywhere: what the radius map leaves standing shows as the distance
// between the ball and the exact square.
import './lib/node-env.mjs';
const THREE = await import('three');
const { testProject } = await import('./lib/testpart.mjs');
const cam = await import('../js/cam.js');
const ok = (n, c, x = '') => { console.log((c ? 'OK   ' : 'FEHL ') + n + '  ' + x); if (!c) process.exitCode = 1; };

const A = 1.5, LEN = 20; // half side, length along X
function squareBar() {
  const g = new THREE.BoxGeometry(LEN, 2 * A, 2 * A);
  g.translate(LEN / 2, 0, 0);
  return [{ id: 'bar', geometry: g.toNonIndexed() }];
}
// distance of a point (y, z) outside the square to the square
const distSq = (y, z) => Math.hypot(Math.max(Math.abs(y) - A, 0), Math.max(Math.abs(z) - A, 0));

function run(type, tool, extra = {}, bodies = squareBar(), setup = {}) {
  const p = testProject();
  p.features = [];
  p.cam.tools.push({ id: 'B1', number: 30, name: 'Kugel Ø2', type: 'ball', dia: 2, flutes: 2, rpm: 20000, feed: 300, plunge: 100, stepdown: 0.5, stepover: 0.3 },
    { id: 'F1', number: 31, name: 'Schaft Ø2', type: 'flat', dia: 2, flutes: 2, rpm: 20000, feed: 300, plunge: 100, stepdown: 0.5, stepover: 0.3 },
    { id: 'F08', number: 32, name: 'Schaft Ø0,8', type: 'flat', dia: 0.8, flutes: 2, rpm: 24000, feed: 200, plunge: 80, stepdown: 0.2, stepover: 0.2 },
    { id: 'B08', number: 33, name: 'Kugel Ø0,8', type: 'ball', dia: 0.8, flutes: 2, rpm: 24000, feed: 200, plunge: 80, stepdown: 0.2, stepover: 0.2 });
  const s = p.cam.setups[0];
  Object.assign(s, { stockMode: 'cylFixed', stockAxisPick: true, stockAxis: 'x', stockDia: 4.8, stockLen: LEN, stockFront: 0 });
  Object.assign(s, setup);
  p.cam.ops = [{ id: 'o1', name: type, setup: s.id, enabled: true, type, tool, xStart: 2, xEnd: 18, stepoverMm: 0.3, angleStep: 2, ...extra }];
  const t0 = performance.now();
  const g = cam.generateSetup(p, bodies, s, null, null);
  return { r: g.results.get('o1'), ms: Math.round(performance.now() - t0), stock: g.stock };
}

{
  const { r, ms, stock } = run('rotary', 'B1');
  ok('4-Achs-Rotation erzeugt Wege', r && !r.error && r.moves?.length > 100, r?.error || `${r?.moves?.length} Wege, ${ms} ms, Rohteil r ${stock?.shape?.r}`);
  if (r?.moves) {
    const R = 1, cy = r.rotary.y, cz = r.rotary.z;
    let left = 0, gouge = 0, n = 0;
    for (const m of r.moves) {
      if (m.t !== 'f' || m.x < 3 || m.x > 17) continue;
      // tip → ball centre (R further out along the radius), in the part's frame
      const y = m.y - cy, z = m.z - cz, rho = Math.hypot(y, z);
      if (rho > 2.4) continue; // approach and retract
      const d = distSq((y * (rho + R)) / rho, (z * (rho + R)) / rho) - R;
      left = Math.max(left, d); gouge = Math.min(gouge, d); n++;
    }
    ok('Kugelfräser schneidet nicht ins Teil', gouge > -0.005, `tiefster Schnitt ${(-gouge).toFixed(4)} mm, ${n} Punkte`);
    ok('Flächen des Vierkants bleiben höchstens 0,03 mm stehen', left < 0.03, `größter Rest ${left.toFixed(4)} mm`);
  }
}
{
  // flat end mill: the end face must not dip below the flats, and reaches them
  const { r, ms } = run('rotary', 'F1');
  ok('Schaftfräser: Wege', r && !r.error && r.moves?.length > 100, r?.error || `${r?.moves?.length} Wege, ${ms} ms`);
  if (r?.moves) {
    // the outline of the square, finely divided: no point under the tool's circle may stand above its end face
    const pts = [];
    for (let k = 0; k < 400; k++) { const u = -A + (2 * A * k) / 400; pts.push([u, A], [A, -u], [-u, -A], [-A, u]); }
    let gouge = 0, left = 0, n = 0;
    for (const m of r.moves) {
      if (m.t !== 'f' || m.x < 3 || m.x > 17) continue;
      const y = m.y - r.rotary.y, z = m.z - r.rotary.z, rho = Math.hypot(y, z);
      if (rho > 2.4) continue;
      const uy = y / rho, uz = z / rho;
      let top = 0;
      for (const [py, pz] of pts) { const h = py * uy + pz * uz; if (Math.abs(py * uz - pz * uy) <= 1 && h > top) top = h; }
      gouge = Math.min(gouge, rho - top); left = Math.max(left, rho - top); n++;
    }
    ok('Schaftfräser: Stirnseite taucht nicht ins Teil', gouge > -0.005, `tiefster Schnitt ${(-gouge).toFixed(4)} mm, ${n} Punkte`);
    ok('Schaftfräser: höchstens 0,03 mm über der höchsten Stelle', left < 0.03, `größter Abstand ${left.toFixed(4)} mm`);
  }
}
{
  const { r, ms } = run('rotaryRough', 'F1', { stepdown: 0.4, stockToLeave: 0.2, angleStep: 4 });
  ok('4-Achs-Schruppen bleibt schnell', r && !r.error && ms < 4000, r?.error || `${r?.moves?.length} Wege, ${ms} ms`);
}
{
  // a large shaft Ø 40 × 100 with a shoulder: the map is limited in size, the time stays within reason
  const g1 = new THREE.CylinderGeometry(20, 20, 60, 96), g2 = new THREE.CylinderGeometry(14, 14, 40, 96);
  g1.rotateZ(Math.PI / 2); g1.translate(30, 0, 0); g2.rotateZ(Math.PI / 2); g2.translate(80, 0, 0);
  const bodies = [{ id: 'a', geometry: g1.toNonIndexed() }, { id: 'b', geometry: g2.toNonIndexed() }];
  const { r, ms } = run('rotary', 'B1', { xStart: 5, xEnd: 95, stepoverMm: 1, angleStep: 3 }, bodies, { stockDia: 42, stockLen: 100 });
  ok('Großes Teil: Wege in vertretbarer Zeit', r && !r.error && ms < 20000, r?.error || `${r?.moves?.length} Wege, ${ms} ms`);
  if (r?.moves) {
    // on the two cylinders, away from the shoulder: the tip lies on the surface
    let worst = 0, low = 0;
    for (const m of r.moves) {
      if (m.t !== 'f') continue;
      const rho = Math.hypot(m.y - r.rotary.y, m.z - r.rotary.z), want = m.x < 57 ? 20 : m.x > 63 ? 14 : null;
      if (want == null || rho > 20.5 || m.x < 6 || m.x > 94) continue;
      worst = Math.max(worst, rho - want); low = Math.min(low, rho - want);
    }
    ok('Großes Teil: Zylinderflächen getroffen', worst < 0.05 && low > -0.02, `+${worst.toFixed(4)} / ${low.toFixed(4)} mm (Netz mit 96 Ecken: Sehnenhöhe 0,011)`);
  }
}

// ---- a bush Ø 4.78 with four lengthwise slots, floor at r 1.79, walls on planes through the axis ----
// Beside such a wall the side of the tool meets the wall at its foot first: the same half width spans a wider
// angle there than at the outside. No point of the part may lie inside the tool.
{
  const RO = 2.39, RF = 1.79, HALF = (20 * Math.PI) / 180, N = 4; // slots 40° wide
  const inSlot = th => { const p = (2 * Math.PI) / N, d = ((th % p) + p) % p; return Math.min(d, p - d) < HALF; };
  const sh = new THREE.Shape(), ring = [];
  for (let k = 0; k < N; k++) {
    const c = (k * 2 * Math.PI) / N, nxt = c + (2 * Math.PI) / N;
    for (let q = 0; q <= 12; q++) ring.push([RF, c - HALF + (2 * HALF * q) / 12]);
    for (let q = 0; q <= 24; q++) ring.push([RO, c + HALF + ((nxt - HALF - (c + HALF)) * q) / 24]);
  }
  // (θ from +Z towards +Y, as the rotary axis counts; the extrusion runs along the shape's Z → turned onto X)
  ring.forEach(([r, th], i) => { const a = r * Math.cos(th), b = r * Math.sin(th); if (i) sh.lineTo(a, b); else sh.moveTo(a, b); });
  const g = new THREE.ExtrudeGeometry(sh, { depth: LEN, bevelEnabled: false, curveSegments: 1 });
  g.rotateY(Math.PI / 2); // shape (a, b, depth) → (depth, b, -a)
  const bodies = [{ id: 'bush', geometry: g }];
  const partR = (y, z) => (inSlot(Math.atan2(y, -z)) ? RF : RO);
  for (const [tool, R, ball] of [['F08', 0.4, false], ['B08', 0.4, true]]) {
    const { r, ms } = run('rotary', tool, { xStart: 8, xEnd: 9, stepoverMm: 0.2, angleStep: 1, tolerance: 0.005 }, bodies);
    ok(`Nutenbuchse (${tool}): Wege`, r && !r.error && r.moves?.length > 100, r?.error || `${r?.moves?.length} Wege, ${ms} ms`);
    if (!r?.moves) continue;
    let deep = 0, floor = 9, n = 0;
    for (const m of r.moves) {
      if (m.t !== 'f') continue;
      const y = m.y - r.rotary.y, z = m.z - r.rotary.z, rho = Math.hypot(y, z);
      if (rho > RO + 0.3) continue;
      const uy = y / rho, uz = z / rho;
      floor = Math.min(floor, rho); n++;
      // points of the tool: l across (in the plane of the cross-section), a along its axis from the tip
      for (let l = -R; l <= R + 1e-9; l += 0.02) for (let a = 0; a <= 0.9; a += 0.02) {
        if (ball && a < R && Math.hypot(l, R - a) > R) continue;
        const py = (rho + a) * uy + l * uz, pz = (rho + a) * uz - l * uy, rr = Math.hypot(py, pz);
        // inside the part, and how far in from the tool's skin
        if (rr < partR(py, pz) - 1e-6) deep = Math.max(deep, ball && a < R ? R - Math.hypot(l, R - a) : Math.min(R - Math.abs(l), a));
      }
    }
    ok(`Nutenbuchse (${tool}): keine Wand angeschnitten`, deep < 0.02, `tiefster Schnitt ${deep.toFixed(3)} mm, ${n} Punkte`);
    ok(`Nutenbuchse (${tool}): Nutgrund erreicht`, floor < RF + 0.03 && floor > RF - 0.01, `tiefster Punkt r ${floor.toFixed(3)} (Grund ${RF})`);
  }
}

// ---- NC output with the rotary axis: feed modes and the GRBL warning ----
{
  const post = await import('../js/post.js');
  const p = testProject();
  p.features = [];
  p.cam.tools.push({ id: 'B1', number: 30, name: 'Kugel Ø2', type: 'ball', dia: 2, flutes: 2, rpm: 20000, feed: 300, plunge: 100, stepdown: 0.5, stepover: 0.3 });
  const s = p.cam.setups[0];
  // datum on the axis: the stock's centre in Y and Z
  Object.assign(s, { stockMode: 'cylFixed', stockAxisPick: true, stockAxis: 'x', stockDia: 4.8, stockLen: LEN, stockFront: 0 });
  p.cam.ops = [{ id: 'o1', name: 'Rotation', setup: s.id, enabled: true, type: 'rotary', tool: 'B1', xStart: 2, xEnd: 6, stepoverMm: 0.5, angleStep: 5 }];
  const g = cam.generateSetup(p, squareBar(), s, null, null);
  g.setup = s;
  const out = (id, mode) => { p.post.props = { [id]: mode ? { rotaryFeed: mode } : {} }; return post.postProcess(p, g, null, { postId: id }); };
  const feedLines = code => code.split('\n').filter(l => /^(N\d+ )?G0?1\b.* A-?[\d.]+/.test(l) || /^(N\d+ )?(X|Y|Z|A)-?[\d.]/.test(l) && / A-?[\d.]+/.test(l));
  {
    const r = out('grbl');
    ok('GRBL: Warnung bei A-Bewegungen', r.warnings.some(w => /GRBL 1\.1 steuert nur X, Y und Z/.test(w)), r.warnings.join(' | ').slice(0, 200));
    ok('Hinweis auf den Vorschub in gemischten Sätzen', r.warnings.some(w => /Grad wie Millimeter/.test(w)));
    ok('Ohne Umstellung kein G93', !/G93/.test(r.code));
  }
  {
    const r = out('linuxcnc', 'inverse'), L = r.code.split('\n'), i93 = L.findIndex(l => /\bG93\b/.test(l)), i94 = L.findIndex(l => /\bG94\b/.test(l) && !/G21|G90/.test(l) || /^(N\d+ )?G94$/.test(l));
    const body = L.slice(i93 + 1, L.findIndex((l, k) => k > i93 && /^(N\d+ )?G94$/.test(l)));
    const cut = body.filter(l => /\bA-?[\d.]+/.test(l) && !/G0\b/.test(l) && !/^(N\d+ )?G0 /.test(l));
    ok('Zeitreziprok: G93 vor den Sätzen, G94 danach', i93 > 0 && body.length > 10 && L.slice(i93).some(l => /^(N\d+ )?G94$/.test(l)), `G93 in Zeile ${i93 + 1}, ${body.length} Sätze`);
    ok('Zeitreziprok: jeder Vorschubsatz mit A hat sein F', cut.length > 10 && cut.every(l => /F[\d.]+/.test(l)), cut.find(l => !/F[\d.]+/.test(l)) || cut[3]);
    ok('Kein Hinweis mehr auf den Vorschub', !r.warnings.some(w => /Grad wie Millimeter/.test(w)), r.warnings.join(' | ').slice(0, 160));
    // time of the program part: Σ 1/F (minutes) = way of the tip on the part / feed
    const res = g.results.get('o1'), mv = res.moves;
    let way = 0;
    for (let k = 1; k < mv.length; k++) if (mv[k].t === 'f') way += Math.hypot(mv[k].x - mv[k - 1].x, mv[k].y - mv[k - 1].y, mv[k].z - mv[k - 1].z) / mv[k].f;
    const tNc = body.filter(l => /F[\d.]+/.test(l)).reduce((q, l) => q + 1 / +/F([\d.]+)/.exec(l)[1], 0); // (all blocks: plunge and retract have no A word)
    ok('Zeitreziprok: Summe der Satzzeiten = Weg am Teil / Vorschub', Math.abs(tNc - way) < 0.03 * way, `${(tNc * 60).toFixed(1)} s im Programm, ${(way * 60).toFixed(1)} s gerechnet`);
  }
  {
    const a = out('fanuc').code, b = out('fanuc', 'comp').code;
    const F = code => code.split('\n').filter(l => /\bA-?[\d.]+/.test(l)).map(l => +(/F(\d+)/.exec(l)?.[1] || 0)).filter(Boolean);
    const fa = F(a), fb = F(b);
    ok('Umgerechnet: F-Werte größer als programmiert (Grad zählen mit)', fb.length > fa.length && Math.max(...fb) > Math.max(...fa) * 1.5, `programmiert bis F${Math.max(...fa)}, umgerechnet bis F${Math.max(...fb)}`);
  }
}

// ---- comparison with the part on the cylinder stock: material left shows, with its amount ----
{
  const { CylStock, cylPartMap } = await import('../js/cylstock.js');
  const { MeshBVH } = await import('three-mesh-bvh');
  const { r, stock } = run('rotary', 'B1', { xStart: 0, xEnd: 20, stepoverMm: 0.15, angleStep: 2 });
  const rot = r.rotary;
  const cut = off => {
    const cs = new CylStock({ x0: stock.minX, x1: stock.maxX, cy: rot.y, cz: rot.z, r: rot.r });
    cs.setPart(cylPartMap(cs, squareBar().map(b => new MeshBVH(b.geometry))));
    let prev = null;
    for (const m of r.moves) {
      const cur = m.a == null ? null : { x: m.x, rho: m.mz - rot.z + off, a: m.a };
      if (prev && cur && m.t === 'f') cs.cutMove(prev, cur, { R: 1, ball: true });
      prev = cur;
    }
    return { st: cs.compareStats(0.1), cs };
  };
  const a = cut(0), b = cut(0.25);
  ok('Kleines Teil: feines Raster der Simulation', a.cs.dx <= 0.05 + 1e-9, `dx ${a.cs.dx} mm, ${a.cs.nx} × ${a.cs.nt}`);
  ok('Vergleich 4-Achs: fertig geschlichtet → fast alles auf Maß, nichts zu tief', a.st.ok > 0.9 && a.st.gouge === 0, `auf Maß ${(100 * a.st.ok).toFixed(1)} %, Rest ${(100 * a.st.left).toFixed(1)} % (max. ${a.st.most.toFixed(3)}), zu tief ${(100 * a.st.gouge).toFixed(1)} %`);
  ok('Vergleich 4-Achs: 0,25 mm zu weit außen wird als Rest gemeldet', b.st.left > 0.5 && Math.abs(b.st.most - 0.25) < 0.06, `Rest ${(100 * b.st.left).toFixed(1)} %, max. ${b.st.most.toFixed(3)} mm`);
}
