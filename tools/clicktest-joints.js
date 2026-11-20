// Click test for "Gelenk" and "Gelenkursprung": real clicks into the 3D view of the running app (browser preview
// or desktop app), no mouse needed. In the page's console:
//   (await import('/tools/clicktest-joints.js')).run()
// The design is replaced by a plate with a hole and a pin. Returns the list of checks; failures are logged.
const wait = ms => new Promise(r => setTimeout(r, ms));
const near = (a, b, t = 1e-3) => a && b && a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= t);

export async function run() {
  const A = window.werkfabAgent, T = window.werkfabTest, out = [];
  const ok = (name, c, x = '') => { out.push({ name, ok: !!c, x }); (c ? console.log : console.error)((c ? 'OK   ' : 'FEHL ') + name, x); };
  const settle = async () => { await A.call('get_model', {}); await wait(250); };
  await A.call('new_design', {});
  await A.call('add_features', { features: [
    { id: 'pl', type: 'box', x: 0, y: 0, z: 0, w: 60, d: 40, h: 10, op: 'new' },
    { id: 'ho', type: 'cylinder', x: 20, y: 20, z: 0, r: 5, h: 10, op: 'cut', target: 'pl' },
    { id: 'pin', type: 'cylinder', x: 100, y: 20, z: 0, r: 5, h: 30, op: 'new' }] });
  await settle();
  const pick = () => T.pick()?.mode || null;

  // --- Gelenkursprung ---
  T.run('jointOrigin');
  ok('Gelenkursprung: Auswahl startet', pick() === 'jorigin');
  T.click([26, 20, 10], 'pl'); await settle();
  T.click([105, 20, 26], 'pin'); await settle();
  T.click([50, 8, 10], 'pl'); await settle();
  ok('Gelenkursprung: bleibt für weitere Klicks aktiv', pick() === 'jorigin');
  T.run('jointOrigin');
  ok('Gelenkursprung: zweiter Knopfdruck beendet', pick() === null);
  const o = T.assembly()?.origins || [];
  ok('Gelenkursprung: drei Ursprünge gespeichert', o.length === 3, o.length);
  ok('Neben der Bohrung: Mitte der Bohrungskante, Richtung +Z', o[0]?.body === 'pl' && near(o[0].p, [20, 20, 10]) && near(o[0].n, [0, 0, 1]), JSON.stringify(o[0]));
  ok('Zapfen oben angeklickt: Achsende oben, Richtung +Z', o[1]?.body === 'pin' && near(o[1].p, [100, 20, 30]) && near(o[1].n, [0, 0, 1]), JSON.stringify(o[1]));
  ok('Freie Fläche: auf der Fläche, Richtung +Z', o[2]?.body === 'pl' && Math.abs(o[2].p[2] - 10) < 1e-3 && near(o[2].n, [0, 0, 1]), JSON.stringify(o[2]));

  // --- Gelenk ---
  T.run('joint');
  ok('Gelenk: Schritt 1', pick() === 'joint' && T.pick().step === 1);
  T.click([105, 20, 3], 'pin'); await settle();
  ok('Gelenk: nach dem ersten Klick Schritt 2', T.pick()?.step === 2 && T.pick()?.child === 'pin');
  T.click([100, 25, 15], 'pin'); await settle();
  ok('Gelenk: gleicher Körper zweimal wird abgelehnt', T.pick()?.step === 2 && /anderer Körper/.test(T.status()), T.status());
  T.click([21, 21, 10], 'pl'); await settle();
  const j = (T.assembly()?.joints || [])[0];
  ok('Gelenk: angelegt, Auswahl beendet', !!j && pick() === null);
  ok('Zapfen in Bohrung: Drehgelenk', j?.type === 'revolute', j?.type);
  ok('Zapfen ist das bewegte Teil, Platte der Bezug', j?.child === 'pin' && j?.parent === 'pl');
  ok('Zapfen unten angeklickt: Achsende unten, Richtung −Z', near(j?.cO?.p, [100, 20, 0]) && near(j?.cO?.n, [0, 0, -1]), JSON.stringify(j?.cO));
  ok('Bezug: der gespeicherte Gelenkursprung an der Bohrung', near(j?.pO?.p, [20, 20, 10]) && near(j?.pO?.n, [0, 0, 1]), JSON.stringify(j?.pO));
  const pinBox = (await A.call('get_model', {})).bodies.find(b => b.id === 'pin');
  for (let k = 0; k < 2; k++) await new Promise(r => requestAnimationFrame(r));
  await wait(300);
  const s = T.screen([20, 20, 10]), s2 = T.screen([100, 20, 0], 'pin');
  ok('Zapfen wird in die Bohrung gesetzt (Fuß des Zapfens auf dem Bohrungsmittelpunkt)', Math.hypot(s.x - s2.x, s.y - s2.y) < 4, `${Math.round(s.x)},${Math.round(s.y)} / ${Math.round(s2.x)},${Math.round(s2.y)} ${pinBox ? '' : '(kein Zapfen)'}`);

  // --- abort and misses ---
  T.run('joint');
  T.click([200, 200, 200]); await settle();
  ok('Klick ins Leere: Hinweis, Auswahl bleibt', pick() === 'joint' && /anklicken/.test(T.status()), T.status());
  document.querySelector('#banner button, .banner button')?.click(); await wait(100);
  ok('Abbrechen beendet die Auswahl', pick() === null);

  const bad = out.filter(r => !r.ok);
  console.log(bad.length ? `${bad.length} von ${out.length} Prüfungen fehlgeschlagen` : `Alle ${out.length} Prüfungen bestanden`);
  return out;
}
