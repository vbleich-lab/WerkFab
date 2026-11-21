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
function make(extra = {}, type = 'parallel3d') {
  const p = testProject();
  p.features = [];
  p.cam.tools.push({ id: 'B6', number: 40, name: 'Kugel Ø6', type: 'ball', dia: 6, flutes: 2, rpm: 12000, feed: 1200, plunge: 400, stepdown: 1, stepover: 0.3 },
    { id: 'F6', number: 41, name: 'Schaft Ø6', type: 'flat', dia: 6, flutes: 2, rpm: 12000, feed: 1200, plunge: 400, stepdown: 1, stepover: 0.3 });
  const s = p.cam.setups[0];
  p.cam.ops = [{ id: 'o1', name: '5-Achs', setup: s.id, enabled: true, type, tool: 'B6', stepoverMm: 2, tolerance: 0.01, ...extra }];
  const g = cam.generateSetup(p, dome(), s, null, null);
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
  const r = make({ toolAxis: 'normal', maxTilt: 30, tool: 'F6' }).r;
  ok('Schaftfräser: verständliche Meldung', !!r?.error && /Kugelfräser/.test(r.error), r?.error);
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
