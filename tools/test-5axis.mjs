// 5-axis simultaneous finishing (node tools/test-5axis.mjs): a dome on a plate, ball cutter leaning towards the
// surface normal. The centre of the ball must run exactly as in the 3-axis path; the axis stays within its limit,
// follows the normal, and the NC output writes the real tip with tool vectors.
import './lib/node-env.mjs';
const THREE = await import('three');
const { testProject } = await import('./lib/testpart.mjs');
const cam = await import('../js/cam.js');
const post = await import('../js/post.js');
const ok = (n, c, x = '') => { console.log((c ? 'OK   ' : 'FEHL ') + n + '  ' + x); if (!c) process.exitCode = 1; };

const RS = 30, C = [40, 40, 0];
function dome() {
  const s = new THREE.SphereGeometry(RS, 96, 64); s.translate(...C);
  const b = new THREE.BoxGeometry(80, 80, 5); b.translate(40, 40, -2.5);
  return [{ id: 'dome', geometry: s.toNonIndexed() }, { id: 'plate', geometry: b.toNonIndexed() }];
}
function make(extra = {}, type = 'parallel3d', bodies = dome, features = []) {
  const p = testProject();
  p.features = features;
  p.cam.tools.push({ id: 'B6', number: 40, name: 'Kugel Ø6', type: 'ball', dia: 6, flutes: 2, rpm: 12000, feed: 1200, plunge: 400, stepdown: 1, stepover: 0.3 },
    { id: 'F6', number: 41, name: 'Schaft Ø6', type: 'flat', dia: 6, flutes: 2, rpm: 12000, feed: 1200, plunge: 400, stepdown: 1, stepover: 0.3 },
    { id: 'TOR8', number: 52, name: 'Torus Ø8 R1', type: 'torus', dia: 8, cornerR: 1, flutes: 2, rpm: 12000, feed: 1200, plunge: 400, stepdown: 1, stepover: 0.3 },
    { id: 'CH6', number: 53, name: 'Fase Ø6', type: 'chamfer', dia: 6, angle: 90, flutes: 2, rpm: 12000, feed: 1200, plunge: 400, stepdown: 1, stepover: 0.3 });
  const s = p.cam.setups[0];
  p.cam.ops = [{ id: 'o1', name: '5-Achs', setup: s.id, enabled: true, type, tool: 'B6', stepoverMm: 2, tolerance: 0.01, ...extra }];
  const g = cam.generateSetup(p, bodies(), s, null, null);
  g.setup = s;
  return { p, g, r: g.results.get('o1') };
}

const base = make().r, five = make({ toolAxis: 'normal', maxTilt: 30 }).r;
ok('3-Achs-Bahn als Vergleich', base && !base.error && base.moves.length > 500, base?.error || `${base?.moves.length} Wege`);
ok('5-Achs: Bahn erzeugt, als mehrachsig gekennzeichnet', five && !five.error && !!five.multi, five?.error || `${five.moves.length} Wege, größte Neigung ${five.multi?.maxTilt.toFixed(2)}°`);
if (five?.multi) {
  // every point of the 3-axis path is there, in order; the extra ones lie on the straight lines between them
  let bi = 0, off = 0;
  for (const m of five.moves) {
    const b = base.moves[bi];
    if (b && m.x === b.x && m.y === b.y && m.z === b.z) { bi++; continue; }
    const p = base.moves[bi - 1], q = base.moves[bi];
    if (!p || !q) { off = 1; break; }
    const d = [q.x - p.x, q.y - p.y, q.z - p.z], l = Math.hypot(...d) || 1, w = [m.x - p.x, m.y - p.y, m.z - p.z], t = (w[0] * d[0] + w[1] * d[1] + w[2] * d[2]) / l;
    off = Math.max(off, Math.hypot(w[0] - (d[0] / l) * t, w[1] - (d[1] / l) * t, w[2] - (d[2] / l) * t));
  }
  ok('Kugelmitte läuft wie in der 3-Achs-Bahn (alle Punkte, Zwischenpunkte auf deren Geraden)', bi === base.moves.length && off < 1e-9, `${bi} von ${base.moves.length} Punkten, ${five.moves.length - base.moves.length} Zwischenpunkte`);
  let turn = 0;
  for (let i = 1; i < five.moves.length; i++) { const a = five.moves[i - 1].ax, b = five.moves[i].ax; if (a && b) turn = Math.max(turn, Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * 180 / Math.PI); }
  ok('Zwischen zwei Sätzen dreht die Achse höchstens 4°', turn <= 4.01, `${turn.toFixed(2)}°`);
  const withAx = five.moves.filter(m => m.ax);
  ok('Jeder Weg hat eine Werkzeugachse (Einheitsvektor)', withAx.length === five.moves.filter(m => m.t === 'f' || m.t === 'r').length && withAx.every(m => Math.abs(Math.hypot(...m.ax) - 1) < 1e-5), `${withAx.length} von ${five.moves.length}`);
  const worst = Math.max(...withAx.map(m => Math.acos(Math.min(1, m.ax[2])) * 180 / Math.PI));
  ok('Neigung nie über dem Grenzwinkel 30°', worst <= 30 + 1e-3 && worst > 25, `${worst.toFixed(3)}°`);
  // on the dome: the axis points away from the dome's axis (like the normal), on the plate it stands upright
  let along = 0, n = 0, flat = 0, nf = 0, err = 0;
  for (const m of five.moves) {
    if (m.t !== 'f' || !m.ax) continue;
    const dx = m.x - C[0], dy = m.y - C[1], rho = Math.hypot(dx, dy);
    if (rho > 8 && rho < 24 && m.z > 12) {
      n++;
      const hor = Math.hypot(m.ax[0], m.ax[1]);
      if (hor > 1e-6 && (m.ax[0] * dx + m.ax[1] * dy) / (hor * rho) > 0.95) along++;
      // the true normal there leans by asin(rho / (RS + 3)); up to the limit the axis should match it
      const want = Math.min(30, Math.asin(Math.min(1, rho / (RS + 3))) * 180 / Math.PI), got = Math.acos(m.ax[2]) * 180 / Math.PI;
      err = Math.max(err, Math.abs(got - want));
    }
    if (rho < 1.2 && m.z > 25) { nf++; if (m.ax[2] > 0.998) flat++; }
  }
  ok('Auf der Kuppel zeigt die Achse nach außen wie die Flächennormale', n > 100 && along / n > 0.97, `${along} von ${n}`);
  ok('Neigung entspricht dem Winkel der Normalen (± 3°)', err < 3, `größte Abweichung ${err.toFixed(2)}°`);
  ok('Auf dem Scheitel der Kuppel steht das Werkzeug senkrecht', nf > 0 && flat === nf, `${flat} von ${nf}`);
  // the axis changes gently from move to move on the surface
  let jump = 0;
  for (let i = 1; i < five.moves.length; i++) {
    const a = five.moves[i - 1], b = five.moves[i];
    if (a.t !== 'f' || b.t !== 'f' || !a.ax || !b.ax) continue;
    const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (d < 0.05) continue;
    const ang = Math.acos(Math.min(1, a.ax[0] * b.ax[0] + a.ax[1] * b.ax[1] + a.ax[2] * b.ax[2])) * 180 / Math.PI;
    jump = Math.max(jump, ang / d);
  }
  ok('Achse dreht ruhig (höchstens 12° je mm Weg)', jump < 12, `${jump.toFixed(2)} °/mm`);
  // real tip: on the sphere of the ball around the unchanged centre
  const R = 3, m = five.moves.find(q => q.t === 'f' && q.ax && q.ax[2] < 0.95), tip = cam.multiTip(m, R);
  ok('Echte Werkzeugspitze liegt auf der Kugel um die Kugelmitte', Math.abs(Math.hypot(tip.x - m.x, tip.y - m.y, tip.z - (m.z + R)) - R) < 1e-5 && tip.z > m.z, `Spitze Z${tip.z.toFixed(3)}, senkrecht Z${m.z.toFixed(3)}`);
}
{
  const r = make({ toolAxis: 'normal', maxTilt: 30, tool: 'CH6' }).r;
  ok('Fasenfräser: verständliche Meldung', !!r?.error && /Kugel-, Schaft-, Torus-/.test(r.error), r?.error);
  const l = make({ toolAxis: 'normal', maxTilt: 40, leadAngle: 10 }).r;
  ok('Voreilwinkel: Bahn erzeugt, Neigung im Grenzwinkel', l && !l.error && l.multi && l.multi.maxTilt <= 40 + 1e-3, l?.error || `${l.multi.maxTilt.toFixed(2)}°`);
  // a deep narrow slot beside a wall: the tool must stand up where the shaft would touch
  const s = make({ toolAxis: 'normal', maxTilt: 60 }).r;
  ok('Großer Grenzwinkel: Schaft und Halter bleiben frei (Werkzeug stellt sich auf)', s && !s.error && s.multi.maxTilt <= 60 + 1e-3, `größte Neigung ${s?.multi?.maxTilt.toFixed(1)}°, ${s?.multi?.stoodUp} Punkte aufgestellt`);
}

// ---- NC output ----
{
  const { p, g, r } = make({ toolAxis: 'normal', maxTilt: 30 });
  const out = (id, props = {}) => { p.post.props = { [id]: props }; return post.postProcess(p, g, null, { postId: id }); };
  const R = 3, o = cam.originOf(g.setup, g.stock);
  const mv = r.moves.find(q => q.t === 'f' && q.ax && q.ax[2] < 0.9), tip = cam.multiTip(mv, R);
  const num = v => (Math.round(v * 1000) / 1000 + 0).toFixed(3).replace(/\.?0+$/, '');
  {
    const s = out('sinumerik'), L = s.code.split('\n');
    const iOn = L.findIndex(l => /^(N\d+ )?TRAORI/.test(l)), iOff = L.findIndex(l => /^(N\d+ )?TRAFOOF/.test(l)), vec = L.filter(l => /A3=-?[\d.]+ B3=-?[\d.]+ C3=-?[\d.]+/.test(l));
    ok('Sinumerik: TRAORI … TRAFOOF um die Bahn, Richtungsvektoren A3 B3 C3', iOn > 0 && iOff > iOn && vec.length > 300, `TRAORI Zeile ${iOn + 1}, TRAFOOF ${iOff + 1}, ${vec.length} Sätze mit Vektor`);
    const unit = vec.every(l => { const q = /A3=(-?[\d.]+) B3=(-?[\d.]+) C3=(-?[\d.]+)/.exec(l); return Math.abs(Math.hypot(+q[1], +q[2], +q[3]) - 1) < 1e-4; });
    ok('Sinumerik: Vektoren haben die Länge 1', unit);
    // the block of the chosen move carries the real tip
    const want = new RegExp(`X${num(tip.x - o.x).replace('.', '\\.')}\\b.*Z${num(tip.z - o.z).replace('.', '\\.')}\\b.*A3=${String(mv.ax[0]).slice(0, 5).replace('.', '\\.').replace('-', '\\-')}`);
    ok('Sinumerik: Satz mit der echten Werkzeugspitze', L.some(l => want.test(l)), `gesucht X${num(tip.x - o.x)} Z${num(tip.z - o.z)} A3=${mv.ax[0]}`);
    ok('Sinumerik: keine Kreisbögen in der 5-Achs-Bahn', !L.slice(iOn, iOff).some(l => /\bG[23]\b/.test(l)));
  }
  {
    const s = out('heidenhain'), L = s.code.split('\n');
    const ln = L.filter(l => /\bLN X[+-][\d.]+ Y[+-][\d.]+ Z[+-][\d.]+ TX[+-][\d.]+ TY[+-][\d.]+ TZ[+-][\d.]+/.test(l));
    ok('Heidenhain: LN-Sätze mit TX TY TZ, TCPM ein und aus', ln.length > 300 && /FUNCTION TCPM|M128/.test(s.code) && /FUNCTION RESET TCPM|M129/.test(s.code), `${ln.length} LN-Sätze`);
    const iOn = L.findIndex(l => /FUNCTION TCPM|M128/.test(l)), iFirst = L.findIndex(l => /\bLN X/.test(l)), iOff = L.findIndex(l => /FUNCTION RESET TCPM|M129/.test(l)), iLast = L.length - 1 - [...L].reverse().findIndex(l => /\bLN X/.test(l));
    ok('Heidenhain: TCPM vor dem ersten und nach dem letzten LN-Satz', iOn < iFirst && iOff > iLast, `ein ${iOn + 1}, LN ${iFirst + 1}…${iLast + 1}, aus ${iOff + 1}`);
  }
  {
    const s = out('fanuc'), L = s.code.split('\n');
    const v = L.filter(l => /\bI-?[\d.]+ J-?[\d.]+ K-?[\d.]+/.test(l) && /\bG[01]\b|^(N\d+ )?[XYZ]/.test(l));
    ok('Fanuc: G43.5 mit Werkzeugvektor I J K, danach G49', /G43\.5 H40/.test(s.code) && v.length > 300 && L.findIndex(l => /\bG49\b/.test(l)) > L.findIndex(l => /G43\.5/.test(l)), `${v.length} Sätze`);
  }
  {
    const s = out('linuxcnc');
    ok('Ohne 5-Achs-Ausgabe (LinuxCNC): Warnung, Bahn als 3-Achs-Programm', s.warnings.some(w => /5-Achs/.test(w)) && !/A3=|TX[+-]|G43\.5/.test(s.code), s.warnings.find(w => /5-Achs/.test(w)));
  }
}

// at the outer edge of the plate the ball rolls off: no reason to lean there
if (five?.multi) {
  let n = 0, up = 0;
  for (const m of five.moves) if (m.ax && m.t === 'f' && (m.y < 1 || m.y > 79) && m.z < 0.01 && m.z > -0.5) { n++; if (m.ax[2] > 0.995) up++; }
  ok('An der Außenkante der Platte bleibt das Werkzeug senkrecht', n > 5 && up === n, `${up} von ${n}`);
}

// ---- other cutters: flat and torus lean and are drawn back along their axis ----
const sim = await import('../js/sim.js');
// points on the cutting end of a leaning cutter (tip T, axis a, radius R, corner radius cr), up to the height L
function toolPoints(T, a, R, cr, L = 6) {
  const ul = Math.hypot(a[0], a[1]), u = ul > 1e-9 ? [a[1] / ul, -a[0] / ul, 0] : [1, 0, 0], w = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
  const pts = [], rf = R - cr;
  const at = (rho, hgt, k) => { const c = Math.cos(k), s = Math.sin(k); pts.push([T[0] + hgt * a[0] + rho * (c * u[0] + s * w[0]), T[1] + hgt * a[1] + rho * (c * u[1] + s * w[1]), T[2] + hgt * a[2] + rho * (c * u[2] + s * w[2])]); };
  for (let k = 0; k < 48; k++) {
    const ang = (k * Math.PI) / 24;
    for (let q = 0; q <= 4; q++) at((rf * q) / 4, 0, ang);
    for (let q = 1; q <= 6; q++) { const b = (q * Math.PI) / 12; at(rf + cr * Math.sin(b), cr - cr * Math.cos(b), ang); }
    for (let q = 1; q <= 6; q++) at(R, cr + ((L - cr) * q) / 6, ang);
  }
  return pts;
}
// deepest a point of the cutter goes into the dome on the plate (mm, 0 = none)
const intoDome = pts => Math.max(0, ...pts.map(p => Math.max(RS - Math.hypot(p[0] - C[0], p[1] - C[1], p[2] - C[2]), p[0] > 0 && p[0] < 80 && p[1] > 0 && p[1] < 80 ? -p[2] : 0)));
const nearDome = pts => Math.min(...pts.map(p => Math.min(Math.abs(Math.hypot(p[0] - C[0], p[1] - C[1], p[2] - C[2]) - RS), Math.abs(p[2]))));
for (const [id, R, cr, name] of [['F6', 3, 0, 'Schaftfräser'], ['TOR8', 4, 1, 'Torusfräser']]) {
  const b3 = make({ tool: id }).r, r = make({ toolAxis: 'normal', maxTilt: 30, tool: id }).r;
  ok(name + ': 5-Achs-Bahn erzeugt', r && !r.error && !!r.multi && r.multi.ball === false && Math.abs(r.multi.R - cr) < 1e-9, r?.error || `${r.moves.length} Wege, größte Neigung ${r.multi.maxTilt.toFixed(1)}°, ${r.multi.stoodUp} aufgestellt`);
  if (!r?.multi) continue;
  let deep = 0, far = 0, n = 0, lean = 0;
  for (const m of r.moves) {
    if (m.t !== 'f' || !m.ax) continue;
    const tip = cam.multiTip(m, cr), pts = toolPoints([tip.x, tip.y, tip.z], m.ax, R, cr);
    deep = Math.max(deep, intoDome(pts));
    const dx = m.x - C[0], dy = m.y - C[1], rho = Math.hypot(dx, dy);
    if (rho > 8 && rho < 22 && m.z > 15) { n++; far = Math.max(far, nearDome(pts)); if (m.ax[2] < 0.97) lean++; }
  }
  ok(name + ': geneigtes Werkzeug verletzt das Teil nicht (höchstens 0,06 mm, Raster des Höhenfelds)', deep < 0.06, `tiefste Stelle ${deep.toFixed(3)} mm`);
  ok(name + ': auf der Kuppel liegt das Werkzeug an und ist geneigt', n > 100 && far < 0.15 && lean / n > 0.8, `${n} Punkte, größter Abstand ${far.toFixed(3)} mm, ${lean} geneigt`);
  ok(name + ': senkrechte 3-Achs-Bahn für Steuerungen ohne Vektor liegt bei', r.multi.upright.length === b3.moves.length && r.multi.upright.every((m, i) => m.x === b3.moves[i].x && m.z === b3.moves[i].z));
  let turn = 0;
  for (let i = 1; i < r.moves.length; i++) { const a = r.moves[i - 1].ax, b = r.moves[i].ax; if (a && b) turn = Math.max(turn, Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * 180 / Math.PI); }
  ok(name + ': zwischen zwei Sätzen dreht die Achse höchstens 4°', turn <= 4.01, `${turn.toFixed(2)}°`);
}
{
  // lead angle on the flat plate: the cutter leans forward and is lifted so that its front edge runs on the plate –
  // also between the blocks (the control moves tip and axis evenly from one block to the next)
  const r = make({ toolAxis: 'fixed', leadAngle: 10, tool: 'F6' }).r;
  let n = 0, lean = 0, lo = Infinity, hi = -Infinity;
  for (let i = 1; i < r.moves.length; i++) {
    const p = r.moves[i - 1], q = r.moves[i];
    if (p.t !== 'f' || q.t !== 'f' || !p.ax || !q.ax || Math.abs(p.y - q.y) > 0.05 || p.y > 6.5 || p.y < 2) continue;
    for (let k = 0; k <= 8; k++) {
      const f = k / 8, x = p.x + (q.x - p.x) * f;
      if (x < 6 || x > 74) continue;
      const ax = [0, 1, 2].map(c => p.ax[c] + (q.ax[c] - p.ax[c]) * f), l = Math.hypot(...ax), u = ax.map(v => v / l);
      const tip = cam.multiTip({ x, y: p.y + (q.y - p.y) * f, z: p.z + (q.z - p.z) * f, ax: u }, 0), low = Math.min(...toolPoints([tip.x, tip.y, tip.z], u, 3, 0).map(v => v[2]));
      n++; lo = Math.min(lo, low); hi = Math.max(hi, low);
      if (Math.abs(Math.acos(u[2]) * 180 / Math.PI - 10) < 0.6) lean++;
    }
  }
  ok('Fest zur Vorschubrichtung: Voreilwinkel 10° auf der Platte, tiefster Punkt der Schneide auf der Fläche (auch zwischen den Sätzen)', n > 10 && lean / n > 0.95 && lo > -0.06 && hi < 0.06, `${n} Stellen, ${lean} mit 10°, tiefster Punkt ${lo.toFixed(3)}…${hi.toFixed(3)} mm`);
}
{
  // axis through the centre of the dome: on the dome it is the normal
  const r = make({ toolAxis: 'point', axisX: C[0], axisY: C[1], axisZ: C[2], maxTilt: 30 }).r;
  let n = 0, good = 0;
  for (const m of r.moves) {
    if (m.t !== 'f' || !m.ax) continue;
    const d = [m.x - C[0], m.y - C[1], m.z + 3 - C[2]], l = Math.hypot(...d), rho = Math.hypot(d[0], d[1]);
    if (rho < 8 || rho > 14 || m.z < 20) continue;
    n++; if ((m.ax[0] * d[0] + m.ax[1] * d[1] + m.ax[2] * d[2]) / l > 0.999) good++;
  }
  ok('Durch einen Punkt: Achse zeigt vom Punkt durch die Kugelmitte', r && !r.error && n > 50 && good / n > 0.95, r?.error || `${good} von ${n}`);
  const l = make({ toolAxis: 'line', axisLineDir: 'x', axisLinePos: C[1], axisZ: 0, maxTilt: 30 }).r;
  const withAx = l.moves.filter(m => m.t === 'f' && m.ax && m.z > 10);
  ok('Durch eine Linie parallel zu X: das Werkzeug neigt sich nur quer zur Linie', l && !l.error && withAx.length > 100 && withAx.filter(m => Math.abs(m.ax[0]) < 0.02).length / withAx.length > 0.95 && withAx.some(m => Math.abs(m.ax[1]) > 0.3), l?.error || `${withAx.length} Punkte`);
}
{
  // half way between two blocks (tip and axis move evenly): at the edge of the plate the leaning cutter rolls over
  // and must not cut into the edge there. Depth measured as the shorter way out of the plate (up or sideways).
  const inPart = p => Math.max(RS - Math.hypot(p[0] - C[0], p[1] - C[1], p[2] - C[2]), p[0] > 0 && p[0] < 80 && p[1] > 0 && p[1] < 80 ? Math.min(-p[2], p[0], 80 - p[0], p[1], 80 - p[1]) : 0);
  const r = make({ toolAxis: 'line', axisLineDir: 'x', axisLinePos: C[1], axisZ: -40, maxTilt: 30, tool: 'F6', stepoverMm: 1.5 }).r;
  let deep = 0, n = 0;
  for (let i = 1; i < r.moves.length; i++) {
    const q = r.moves[i - 1], m = r.moves[i];
    if (m.t !== 'f' || q.t !== 'f' || !m.ax || !q.ax) continue;
    const a = cam.multiTip(q, 0), b = cam.multiTip(m, 0), ax0 = [0, 1, 2].map(c => q.ax[c] + m.ax[c]), l = Math.hypot(...ax0);
    n++;
    for (const p of toolPoints([(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2], ax0.map(v => v / l), 3, 0)) deep = Math.max(deep, inPart(p));
  }
  ok('Zwischen zwei Sätzen verletzt der geneigte Schaftfräser das Teil nicht, auch nicht am Rand der Platte (höchstens 0,08 mm)', r && !r.error && n > 500 && deep < 0.08, r?.error || `${n} Zwischenstellungen, tiefste Stelle ${deep.toFixed(3)} mm`);
}
{
  // swarf: a frustum with 15° draft on a plate – the flank of a flat cutter lies on the wall
  const DR = 15 * Math.PI / 180, R0 = 25, H = 12, R1 = R0 - H * Math.tan(DR);
  const frustum = () => {
    const c = new THREE.CylinderGeometry(R1, R0, H, 128, 1); c.rotateX(Math.PI / 2); c.translate(40, 40, H / 2);
    const b = new THREE.BoxGeometry(80, 80, 5); b.translate(40, 40, -2.5);
    return [{ id: 'cone', geometry: c.toNonIndexed() }, { id: 'plate', geometry: b.toNonIndexed() }];
  };
  const r = make({ toolAxis: 'swarf', maxTilt: 30, tool: 'F6', stepdown: 50, heights: { bottom: { from: 'modelBottom', offset: 5 } } }, 'contour3d', frustum).r;
  ok('Wälzfräsen: Bahn erzeugt', r && !r.error && !!r.multi, r?.error || `${r.moves.length} Wege, größte Neigung ${r.multi?.maxTilt.toFixed(2)}°`);
  if (r?.multi) {
    const on = r.moves.filter(m => m.t === 'f' && m.ax && m.ax[2] < 0.999);
    // distance of the cone's surface from the tool axis, measured at two heights; the axis leans towards the cone's axis
    let dev = 0, par = 0, tiltErr = 0, inward = 0, deep = 0;
    for (const m of on) {
      const tip = cam.multiTip(m, 0);
      tiltErr = Math.max(tiltErr, Math.abs(Math.acos(m.ax[2]) * 180 / Math.PI - 15));
      const hx = tip.x - 40, hy = tip.y - 40, hl = Math.hypot(hx, hy);
      if ((m.ax[0] * hx + m.ax[1] * hy) / hl < 0) inward++;
      let first = 0;
      for (const s of [2, 8]) {
        const q = [tip.x + s * m.ax[0], tip.y + s * m.ax[1], tip.z + s * m.ax[2]], rho = Math.hypot(q[0] - 40, q[1] - 40);
        // distance from the cone (radius R0 − z·tan at height z), measured normal to it
        const v = (rho - (R0 - q[2] * Math.tan(DR))) * Math.cos(DR);
        dev = Math.max(dev, v - 3);
        if (s === 2) first = v; else par = Math.max(par, Math.abs(v - first));
      }
      for (const p of toolPoints([tip.x, tip.y, tip.z], m.ax, 3, 0, 10)) {
        const rho = Math.hypot(p[0] - 40, p[1] - 40);
        if (p[2] < H) deep = Math.max(deep, ((R0 - Math.max(0, p[2]) * Math.tan(DR)) - rho) * Math.cos(DR), -p[2]);
      }
    }
    ok('Wälzfräsen: Achse um die Schräge der Wand (15°) zur Wand geneigt', on.length > 50 && tiltErr < 1.5 && inward === on.length, `${on.length} Punkte, Abweichung ${tiltErr.toFixed(2)}°, ${inward} zur Wand`);
    ok('Wälzfräsen: Flanke liegt gleichmäßig an der Wand (unten wie oben, ± 0,03 mm), so genau wie die 3-Achs-Kontur (höchstens 0,45 mm Aufmaß)', par < 0.03 && dev < 0.45, `oben zu unten ${par.toFixed(3)} mm, größtes Aufmaß ${dev.toFixed(3)} mm`);
    ok('Wälzfräsen: Wand und Boden werden nicht verletzt (höchstens 0,03 mm)', deep < 0.03, `tiefste Stelle ${deep.toFixed(3)} mm`);
  }
}
{
  // swarf on a wall that is curved in height (the dome): the straight flank must not cut into the bulge
  const r = make({ toolAxis: 'swarf', maxTilt: 30, tool: 'F6', stepdown: 3, heights: { bottom: { from: 'modelBottom', offset: 30 } } }, 'contour3d').r;
  let deep = 0, n = 0, lean = 0;
  if (r?.multi) for (const m of r.moves) {
    if (m.t !== 'f' || !m.ax) continue;
    n++; if (m.ax[2] < 0.99) lean++;
    const tip = cam.multiTip(m, 0);
    deep = Math.max(deep, intoDome(toolPoints([tip.x, tip.y, tip.z], m.ax, 3, 0)));
  }
  ok('Wälzfräsen an gewölbter Wand: die gerade Flanke verletzt die Wölbung nicht (höchstens 0,06 mm)', r && !r.error && !!r.multi && n > 200 && lean / n > 0.5 && deep < 0.06, r?.error || `${n} Punkte, ${lean} geneigt, tiefste Stelle ${deep.toFixed(3)} mm`);
}
{
  // projecting (engraving a sketch onto the surface): the cutter leans and goes in by the depth along its axis
  const sk = { id: 'skC', type: 'sketch', name: 'Kreis', plane: { o: [0, 0, 0], x: [1, 0, 0], n: [0, 0, 1] }, entities: [{ id: 'c1', type: 'circle', cx: C[0], cy: C[1], r: 15 }] };
  const r = make({ toolAxis: 'normal', maxTilt: 40, tool: 'F6', sketch: 'skC', entities: 'all', depth: 0.3 }, 'project3d', dome, [sk]).r;
  let n = 0, lean = 0, deepOk = 0, hi = -Infinity;
  if (r?.multi) for (const m of r.moves) {
    if (m.t !== 'f' || !m.ax || Math.abs(Math.hypot(m.x - C[0], m.y - C[1]) - 15) > 1.5 || m.z < 15) continue;
    n++; if (Math.abs(Math.acos(m.ax[2]) * 180 / Math.PI - 30) < 2) lean++;
    const tip = cam.multiTip(m, 0), d = intoDome(toolPoints([tip.x, tip.y, tip.z], m.ax, 3, 0));
    if (d > 0.2 && d < 0.4) deepOk++; hi = Math.max(hi, d);
  }
  ok('Projizieren mit 5 Achsen: der Schaftfräser steht in der Flächennormale (30°) und taucht um die Tiefe 0,3 mm ein', r && !r.error && !!r.multi && n > 30 && lean / n > 0.9 && deepOk / n > 0.95 && hi < 0.4, r?.error || `${n} Punkte, ${lean} mit 30°, ${deepOk} mit 0,2…0,4 mm Tiefe, größte ${hi.toFixed(3)} mm`);
}
{
  // leaning cutter in the simulation: lowest point above a cell, against points sampled on the cutter
  let worst = 0, n = 0;
  for (const [R, cr] of [[3, 0], [4, 1], [5, 2.5]]) for (const a of [[0.3, 0.1], [-0.2, 0.45], [0, 0.6]]) {
    const ax = [a[0], a[1], Math.sqrt(1 - a[0] * a[0] - a[1] * a[1])], T = [1, 2, 3];
    const pts = toolPoints(T, ax, R, cr, 20);
    for (let k = 0; k < 40; k++) {
      const px = T[0] + (((k * 37) % 17) / 17 - 0.47) * 1.3 * R, py = T[1] + (((k * 53) % 19) / 19 - 0.47) * 1.3 * R;
      const z = sim.tiltedEdgeZ(px, py, T, ax, R, cr, 20);
      // by trial: the first height at which the point is inside the cutter
      let hit = Infinity;
      for (let zz = T[2] - R - 1; zz < T[2] + 25; zz += 0.01) {
        const d = [px - T[0], py - T[1], zz - T[2]], hh = d[0] * ax[0] + d[1] * ax[1] + d[2] * ax[2], rho = Math.sqrt(Math.max(0, d[0] * d[0] + d[1] * d[1] + d[2] * d[2] - hh * hh)), rf = R - cr;
        if (hh >= 0 && hh <= 20 && (rho <= rf || (hh >= cr && rho <= R) || (hh < cr && (rho - rf) * (rho - rf) + (hh - cr) * (hh - cr) <= cr * cr))) { hit = zz; break; }
      }
      if (Number.isFinite(hit) !== Number.isFinite(z)) { if (Number.isFinite(hit) && hit < T[2] + 15) worst = Math.max(worst, 99); continue; }
      if (Number.isFinite(hit)) { n++; worst = Math.max(worst, Math.abs(hit - z)); }
    }
  }
  ok('Simulation: Unterkante des geneigten Fräsers (Schaft, Torus) stimmt mit Stichproben überein (± 0,03 mm)', n > 100 && worst < 0.03, `${n} Stellen, größte Abweichung ${worst.toFixed(3)} mm`);
}
{
  // NC output with a flat cutter: tip and vector; a control without vectors gets the upright 3-axis path
  const { p, g, r } = make({ toolAxis: 'normal', maxTilt: 30, tool: 'F6' });
  const out = id => { p.post.props = { [id]: {} }; return post.postProcess(p, g, null, { postId: id }); };
  const hh = out('heidenhain'), ln = hh.code.split('\n').filter(l => /\bLN X/.test(l));
  ok('Schaftfräser, Heidenhain: LN-Sätze mit Werkzeugvektor', ln.length > 300, `${ln.length} LN-Sätze`);
  const lc = out('linuxcnc'), b3 = make({ tool: 'F6' }), l3 = (() => { b3.p.post.props = { linuxcnc: {} }; return post.postProcess(b3.p, b3.g, null, { postId: 'linuxcnc' }); })();
  const body = c => c.split('\n').filter(l => /^(N\d+ )?(G[0123] |[XYZ])/.test(l)).join('\n');
  ok('Schaftfräser ohne 5-Achs-Ausgabe (LinuxCNC): dieselben Wege wie die 3-Achs-Operation, mit Warnung', lc.warnings.some(w => /5-Achs/.test(w) && !/Kugelfräser/.test(w)) && body(lc.code) === body(l3.code) && body(lc.code).length > 1000, lc.warnings.find(w => /5-Achs/.test(w)));
}
