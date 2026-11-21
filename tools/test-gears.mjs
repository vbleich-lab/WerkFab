// Gear outlines (node tools/test-gears.mjs): sizes, involute form, closed outlines, rack, bevel, worm, sprocket.
const G = await import('../js/gears.js');
const ok = (n, c, x = '') => { console.log((c ? 'OK   ' : 'FEHL ') + n + '  ' + x); if (!c) process.exitCode = 1; };
const RAD = Math.PI / 180;
// points along an outline (Bézier and arcs sampled)
function sample(o, n = 12) {
  const pts = [o.start];
  let p = o.start;
  for (const s of o.segs) {
    if (s.k === 'L') pts.push(s.b);
    else if (s.k === 'B') for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; pts.push([0, 1].map(k => u ** 3 * p[k] + 3 * u * u * t * s.c1[k] + 3 * u * t * t * s.c2[k] + t ** 3 * s.b[k])); }
    else {
      // circle through p, m, b
      const [ax, ay] = p, [bx, by] = s.m, [cx, cy] = s.b, d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
      if (Math.abs(d) < 1e-12) { pts.push(s.m, s.b); p = s.b; continue; }
      const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
      const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
      const r = Math.hypot(ax - ux, ay - uy), a0 = Math.atan2(ay - uy, ax - ux), am = Math.atan2(by - uy, bx - ux), a1 = Math.atan2(cy - uy, cx - ux);
      const norm = v => ((v % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      const ccw = norm(am - a0) < norm(a1 - a0);
      const sweep = ccw ? norm(a1 - a0) : -norm(a0 - a1);
      for (let i = 1; i <= n; i++) pts.push([ux + r * Math.cos(a0 + (sweep * i) / n), uy + r * Math.sin(a0 + (sweep * i) / n)]);
    }
    p = s.b;
  }
  return pts;
}
const area = pts => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
const closed = o => Math.hypot(o.segs[o.segs.length - 1].b[0] - o.start[0], o.segs[o.segs.length - 1].b[1] - o.start[1]);

{
  const m = 2, z = 24, o = G.gearOutline({ m, z }), s = o.sizes;
  ok('Stirnrad m2 z24: Teilkreis 48, Kopfkreis 52, Fußkreis 43', Math.abs(s.d - 48) < 1e-9 && Math.abs(s.da - 52) < 1e-9 && Math.abs(s.df - 43) < 1e-9, `d ${s.d} da ${s.da} df ${s.df} db ${s.db.toFixed(3)}`);
  ok('Umriss geschlossen, gegen den Uhrzeigersinn', closed(o) < 1e-9 && area(sample(o)) > 0, `Lücke ${closed(o).toExponential(1)}, Fläche ${area(sample(o)).toFixed(1)} mm²`);
  const pts = sample(o, 40);
  const rr = pts.map(p => Math.hypot(...p));
  ok('Alle Punkte zwischen Fuß- und Kopfkreis', Math.min(...rr) > s.rf - 1e-6 && Math.max(...rr) < s.ra + 1e-6, `${Math.min(...rr).toFixed(4)} … ${Math.max(...rr).toFixed(4)}`);
  // flank points lie on the involute: polar angle = half tooth angle on the base circle less the involute function
  let worst = 0, n = 0;
  for (const p of pts) {
    const r = Math.hypot(...p), a = Math.atan2(p[1], p[0]);
    if (r < s.rb + 0.05 || r > s.ra - 0.05 || a > 0 || a < -Math.PI / z) continue; // lower flank of the first tooth
    const al = Math.acos(s.rb / r), want = -s.psiB + (Math.tan(al) - al);
    worst = Math.max(worst, Math.abs(a - want) * r); n++;
  }
  ok('Flanke liegt auf der Evolvente (Bézier-Näherung < 1 µm)', n > 20 && worst < 1e-3, `${n} Punkte, größte Abweichung ${(worst * 1000).toFixed(3)} µm`);
  const al = 20 * RAD, th = 2 * s.r * (s.psiB - (Math.tan(al) - al));
  ok('Zahndicke am Teilkreis = π·m/2', Math.abs(th - Math.PI * m / 2) < 1e-9, th.toFixed(5));
  const o2 = G.gearOutline({ m, z, backlash: 0.1 });
  ok('Flankenspiel macht den Zahn dünner', Math.abs(2 * o2.sizes.r * (o2.sizes.psiB - (Math.tan(al) - al)) - (Math.PI * m / 2 - 0.1)) < 1e-9);
}
{
  const s = G.gearSizes({ m: 1, z: 10 });
  ok('z10 ohne Profilverschiebung: Unterschnitt gemeldet (Grenze 18)', s.undercut && s.zMin === 18, `zMin ${s.zMin}`);
  ok('z10 mit x = 0,5: kein Unterschnitt', !G.gearSizes({ m: 1, z: 10, x: 0.5 }).undercut);
  const p = G.gearSizes({ m: 1, z: 8, x: 0.8 });
  ok('Spitzer Zahn: Kopf gekürzt', p.pointed && p.ra < 4 + 1.8, `ra ${p.ra.toFixed(3)}`);
  for (const z of [6, 9, 12, 17, 40, 120]) { const o = G.gearOutline({ m: 1.5, z }); ok(`z${z}: geschlossen, ${o.segs.length} Stücke`, closed(o) < 1e-9 && area(sample(o)) > 0 && o.segs.length === z * 8); }
}
{
  const o = G.internalOutline({ m: 2, z: 40 });
  ok('Hohlrad m2 z40: Kopfkreis 76 (innen), Fußkreis 85', Math.abs(o.sizes.da - 76) < 1e-9 && Math.abs(o.sizes.df - 85) < 1e-9, `da ${o.sizes.da} df ${o.sizes.df}`);
  ok('Hohlrad: Ausschnitt geschlossen', closed(o) < 1e-9);
}
{
  const r = G.rackOutline({ m: 2, n: 5 });
  ok('Zahnstange m2, 5 Zähne: Teilung 2π, Länge 10π', Math.abs(r.pitch - 2 * Math.PI) < 1e-9 && Math.abs(r.length - 10 * Math.PI) < 1e-9);
  const ys = r.pts.filter(p => Math.abs(p[1] - 2) < 1e-9), tip = Math.abs(ys[0][0] - ys[1][0]);
  ok('Zahnstange: Kopfbreite = π·m/2 − 2·m·tan 20°', Math.abs(tip - (Math.PI - 4 * Math.tan(20 * RAD))) < 1e-9, tip.toFixed(4));
  ok('Zahnstange: Umriss mit Fläche', Math.abs(area(r.pts)) > 0 && r.pts.length >= 4 * 5 + 2, `${r.pts.length} Punkte`);
}
{
  const a = G.bevelGear({ m: 2, z: 20, z2: 20 }), b = G.bevelGear({ m: 2, z: 15, z2: 30 }), c = G.bevelGear({ m: 2, z: 30, z2: 15 });
  ok('Kegelrad 1:1 bei 90°: Teilkegelwinkel 45°', Math.abs(a.delta - 45) < 1e-9);
  ok('Kegelradpaar 15/30: Winkel ergänzen sich zu 90°', Math.abs(b.delta + c.delta - 90) < 1e-9, `${b.delta.toFixed(3)}° + ${c.delta.toFixed(3)}°`);
  ok('Kegelrad: Teilkegellänge beider Räder gleich', Math.abs(b.Re - c.Re) < 1e-9, b.Re.toFixed(3));
  ok('Kegelrad: Umriss geschlossen, 20 Zähne', closed(a) < 1e-9 && a.segs.length === 160 && area(sample(a)) > 0);
  ok('Kegelrad: kleines Ende verkleinert um Breite / Teilkegellänge', Math.abs(a.scale - (1 - a.width / a.Re)) < 1e-12 && a.scale > 0.4 && a.scale < 1, a.scale.toFixed(3));
}
{
  const w = G.wormSizes({ m: 2, z1: 2, q: 10 });
  ok('Schnecke m2, zweigängig, q10: Teilkreis 20, Steigung 4π', Math.abs(w.d - 20) < 1e-9 && Math.abs(w.lead - 4 * Math.PI) < 1e-9);
  ok('Schnecke: Steigungswinkel atan(z1/q)', Math.abs(w.gamma - Math.atan(2 / 10) / RAD) < 1e-9, w.gamma.toFixed(3) + '°');
  const sp = G.gearSpec({ kind: 'wormwheel', m: 2, z: 30, width: 12, z1: 2, q: 10 });
  ok('Schneckenrad: Teilkreis = m·z (Stirnmodul = Axialmodul der Schnecke)', Math.abs(sp.sizes.d - 60) < 1e-6, sp.sizes.d.toFixed(4));
}
{
  const [p, d1] = G.CHAINS['08B'], z = 17, o = G.sprocketOutline({ p, d1, z });
  ok('Kettenrad 08B z17: Teilkreis p / sin(180°/z)', Math.abs(o.sizes.d - p / Math.sin(Math.PI / z)) < 1e-9, o.sizes.d.toFixed(3));
  ok('Kettenrad: geschlossen, Fläche > 0', closed(o) < 1e-9 && area(sample(o)) > 0, `${o.segs.length} Stücke, da ${o.sizes.da.toFixed(2)}`);
  const pts = sample(o, 30), rr = pts.map(q => Math.hypot(...q));
  ok('Kettenrad: zwischen Fußkreis und Kopfkreis', Math.min(...rr) > o.sizes.df / 2 - 1e-6 && Math.max(...rr) < o.sizes.da / 2 + 0.02, `${Math.min(...rr).toFixed(3)} … ${Math.max(...rr).toFixed(3)}`);
  // the roller (radius d1/2) sits in the seat without cutting into the tooth
  let pen = 0; for (const q of pts) pen = Math.max(pen, d1 / 2 - Math.hypot(q[0] - o.sizes.d / 2, q[1]));
  ok('Kettenrad: Rolle sitzt frei im Zahngrund', pen < 1e-6, `Eindringen ${pen.toFixed(4)}`);
  for (const zz of [8, 11, 25, 57]) { const s = G.sprocketOutline({ p, d1, z: zz }); ok(`Kettenrad z${zz}: geschlossen`, closed(s) < 1e-9 && area(sample(s)) > 0); }
}
for (const [name, f] of [['Stirnrad', { kind: 'spur', m: 2, z: 20, width: 10 }], ['Schrägrad', { kind: 'helical', m: 2, z: 20, width: 10, beta: 20 }], ['Pfeilrad', { kind: 'herringbone', m: 2, z: 20, width: 20, beta: 25 }],
  ['Hohlrad', { kind: 'internal', m: 2, z: 40, width: 10 }], ['Zahnstange', { kind: 'rack', m: 2, z: 8, width: 10 }], ['Kegelrad', { kind: 'bevel', m: 2, z: 20, z2: 30, width: 8 }],
  ['Schnecke', { kind: 'worm', m: 2, z1: 1, q: 10, length: 40 }], ['Schneckenrad', { kind: 'wormwheel', m: 2, z: 30, width: 12 }], ['Kettenrad', { kind: 'sprocket', chain: '08B', z: 17 }]]) {
  let t = '', e = '';
  try { G.gearSpec(f); t = G.gearInfo(f); } catch (x) { e = x.message; }
  ok(`${name}: Daten und Infozeile`, !e && t.length > 20, e || t);
}
{
  const h = G.gearSpec({ kind: 'helical', m: 2, z: 20, width: 10, beta: 20 });
  ok('Schrägrad: Stirnmodul = mn / cos β, Verdrehung über die Breite', Math.abs(h.sizes.mt - 2 / Math.cos(20 * RAD)) < 1e-12 && Math.abs(Math.abs(h.twist) - (10 * Math.tan(20 * RAD)) / h.sizes.r / RAD) < 1e-9, `mt ${h.sizes.mt.toFixed(4)}, ${h.twist.toFixed(3)}°`);
}
