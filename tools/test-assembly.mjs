// Assembly helpers without a browser: interference check of many bodies, joint limits, motion links
// through the agent interface. Run: npm run test:assembly
import './lib/node-env.mjs';
const { interference, interferenceAsync, contactAsync, boxPairs, boxGap } = await import('../js/model.js');
const { registerKernel } = await import('../js/kern/index.js');
const { jointValues, jointLimits } = await import('../js/assembly.js');
const { agentCall } = await import('../js/agent.js');

const ok = (n, c, x = '') => { console.log((c ? 'OK   ' : 'FEHL ') + n + '  ' + x); if (!c) process.exitCode = 1; };

// ---- interference: only pairs whose boxes meet are intersected ----
{
  // a kernel of boxes: the overlap is the volume of the common box
  let calls = 0;
  const vol = (a, b) => { calls++; let v = 1; for (let k = 0; k < 3; k++) v *= Math.max(0, Math.min(a.hi[k], b.hi[k]) - Math.max(a.lo[k], b.lo[k])); return v; };
  registerKernel({ id: 'boxes', intersectVolume: vol });
  const box = (lo, hi) => ({ kernel: 'boxes', lo, hi, boundingBox: { bounds: [lo, hi] } });
  // 1000 cubes of 10 mm in a row with 2 mm gaps, two of them overlapping a long bar
  const bodies = Array.from({ length: 1000 }, (_, i) => ({ id: 'c' + i, shape: box([12 * i, 0, 0], [12 * i + 10, 10, 10]) }));
  bodies.push({ id: 'bar', shape: box([5, 5, 5], [17, 6, 6]) });
  const t0 = Date.now();
  const res = interference(bodies);
  ok('1001 Körper: nur sich berührende Paare werden verschnitten', calls < 10, `${calls} Verschneidungen statt ${1001 * 1000 / 2}, ${Date.now() - t0} ms`);
  ok('1001 Körper: die zwei Überschneidungen mit dem Riegel', res.length === 2 && res[0].a.id === 'c0' && res[0].b.id === 'bar' && res[1].a.id === 'c1' && res[1].b.id === 'bar' && Math.abs(res[0].volume - 5) < 1e-9 && Math.abs(res[1].volume - 5) < 1e-9, res.map(r => `${r.a.id}–${r.b.id} ${r.volume}`).join(', '));
  calls = 0;
  const only = interference(bodies, (a, b) => a.id === 'c1' || b.id === 'c1');
  ok('Paarfilter: nur Paare mit dem bewegten Körper', only.length === 1 && only[0].a.id === 'c1' && calls === 1);
  // the same in slices (the window stays usable), with progress and stop
  calls = 0;
  const seen = [];
  const res2 = await interferenceAsync(bodies, { progress: (i, n) => seen.push([i, n]) });
  ok('Interferenz in Abschnitten: gleiches Ergebnis, Fortschritt bis zum Ende', res2.length === 2 && res2[1].b.id === 'bar' && seen.at(-1)[0] === seen.at(-1)[1], JSON.stringify(seen.at(-1)));
  const stopped = await interferenceAsync(Array.from({ length: 3000 }, (_, i) => ({ id: 'd' + i, shape: box([0, 0, 0], [1, 1, 1]) })), { stop: () => true });
  ok('Interferenz abbrechen: kein Ergebnis', stopped === null);
  // nearby pairs for the contact check: boxes within 5 mm
  const near = boxPairs(bodies.slice(0, 10), 5);
  ok('Paare in der Nähe (5 mm): nur Nachbarn mit 2 mm Abstand', near.length === 9 && near.every(([p, q]) => +q.id.slice(1) === +p.id.slice(1) + 1), near.length + ' Paare');
  ok('Abstand zweier Quader', Math.abs(boxGap(box([0, 0, 0], [1, 1, 1]), box([4, 5, 1], [6, 6, 2])) - 5) < 1e-12 && boxGap(box([0, 0, 0], [2, 2, 2]), box([1, 1, 1], [3, 3, 3])) === 0);
  // a body with many partners is split once into pieces; the volumes stay the same
  {
    const K = { id: 'boxes2', intersectVolume: vol, distance: (a, b) => { dcalls++; return boxGap(a, b); }, clip: (s, lo, hi) => {
      const l = s.lo.map((v, k) => Math.max(v, lo[k])), u = s.hi.map((v, k) => Math.min(v, hi[k]));
      return l.every((v, k) => v < u[k]) ? { kernel: 'boxes2', lo: l, hi: u, boundingBox: { bounds: [l, u] } } : null;
    } };
    let dcalls = 0;
    registerKernel(K);
    const bx = (lo, hi) => ({ kernel: 'boxes2', lo, hi, boundingBox: { bounds: [lo, hi] } });
    const rail = { id: 'rail', shape: bx([0, 0, 0], [4000, 10, 10]) };
    // 40 cubes sitting into the rail by 1 mm (volume 10·10·1 = 100 each), 40 clear of it by 1 mm above
    const cubes = Array.from({ length: 80 }, (_, i) => ({ id: 'q' + i, shape: i < 40 ? bx([100 * i, 0, 9], [100 * i + 10, 10, 19]) : bx([100 * (i - 40) + 50, 0, 10], [100 * (i - 40) + 60, 10, 20]) }));
    calls = 0;
    const r = interference([rail, ...cubes]);
    const callsSplit = calls;
    calls = 0;
    const r2 = await interferenceAsync([rail, ...cubes]);
    ok('Körper mit vielen Partnern wird zerteilt: 40 Überschneidungen zu je 100 mm³', r.length === 40 && r.every(x => Math.abs(x.volume - 100) < 1e-9) && r2.length === 40 && r2.every(x => Math.abs(x.volume - 100) < 1e-9), `${r.length} / ${r2.length}`);
    ok('Zerteilt: jedes Paar trifft nur die Teile in seiner Nähe', callsSplit < 80 * 3, `${callsSplit} Verschneidungen für 80 Paare`);
    // contact: the lifted cubes touch the rail; one more 3 mm above it; a far one is not in the pairs
    const up = { id: 'up', shape: bx([2000, 0, 13], [2010, 10, 23]) };
    const all = [rail, ...cubes, up];
    const res = await contactAsync(boxPairs(all, 5), { near: 5 });
    const of = id => res.find(x => (x.a.id === 'rail' && x.b.id === id));
    ok('Kontakt: Überschneidung, Berührung und Abstand mit zerteiltem Körper', res.filter(x => x.a.id === 'rail').length === 81 && of('q3').volume === 100 && of('q43').volume === 0 && of('q43').gap === 0 && Math.abs(of('up').gap - 3) < 1e-12, `${res.length} Paare, Abstand oben ${of('up')?.gap}`);
    ok('Kontakt: Abstand nur zu den nächsten Teilstücken gemessen', dcalls < 3 * 41, `${dcalls} Abstandsmessungen`);
  }
  // bodies whose box cannot be read are still checked
  calls = 0;
  const odd = interference([{ id: 'x', shape: { kernel: 'boxes', lo: [0, 0, 0], hi: [1, 1, 1] } }, { id: 'y', shape: box([0.5, 0, 0], [2, 1, 1]) }]);
  ok('Körper ohne Hüllquader werden trotzdem geprüft', odd.length === 1 && calls === 1);
}

// ---- joint limits ----
{
  const asm = { joints: [
    { id: 'r1', type: 'revolute', value: 800, min: 0, max: 720 },
    { id: 'r2', type: 'revolute', value: 0, link: { kind: 'ratio', from: 'r1', ratio: 1 } },
    { id: 's', type: 'slider', value: 0, min: -20, max: 50, link: { kind: 'rack', from: 'r1', dia: 28 } },
    { id: 'free', type: 'revolute', value: 500, min: 0, max: 90, limits: false },
  ] };
  ok('Grenzen: eingetippter Wert über dem Maximum wird auf 720° gehalten', jointValues(asm, asm.joints[0])[0] === 720);
  ok('Grenzen: verknüpftes Gelenk ohne Grenzen folgt dem begrenzten Wert', jointValues(asm, asm.joints[1])[0] === 720);
  ok('Grenzen: Zahnstange hält an ihrem eigenen Maximum (50 mm)', jointValues(asm, asm.joints[2])[0] === 50);
  ok('Grenzen aus: Wert bleibt frei', jointValues(asm, asm.joints[3])[0] === 500 && jointLimits(asm.joints[3]) === null);
  ok('Grenzen: Bewegungsstudie darf darüber hinaus fragen, wird aber begrenzt', jointValues(asm, asm.joints[0], { r1: -30 })[0] === 0);
}

// ---- agent: the kind of a motion link stays ----
{
  let project = { assembly: { placements: {}, joints: [
    { id: 'r1', name: 'Rolle', type: 'revolute', child: 'a', parent: '', origin: [0, 0, 0], axis: 'y', value: 0, min: 0, max: 720 },
    { id: 'p', name: 'Paket', type: 'slider', child: 'b', parent: '', origin: [0, 0, 0], axis: 'x', value: 0, min: 0, max: 400, contact: true, link: { kind: 'rack', from: 'r1', dia: 28, offset: 0 } },
  ] } };
  const api = {
    project: () => project,
    settled: async () => ({ bodies: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }),
    commit: fn => { project = structuredClone(project); fn(project); },
    assembly: async () => ({ joints: project.assembly.joints }),
    uid: p => p + Math.random().toString(36).slice(2, 7),
  };
  await agentCall('update_joint', { id: 'p', patch: { max: 300 } }, api);
  const p = project.assembly.joints.find(j => j.id === 'p');
  ok('update_joint: Zahnstange bleibt Zahnstange (dia 28), Kontakt bleibt', p.link?.kind === 'rack' && p.link.dia === 28 && p.contact === true && p.max === 300, JSON.stringify(p.link));
  await agentCall('add_joint', { type: 'slider', child: 'c', axis: 'z', link: { kind: 'cam', from: 'r1', throw: 5, dwell: 0.2 } }, api);
  const c = project.assembly.joints.find(j => j.child === 'c');
  ok('add_joint: Nocken mit Exzentrizität und Rast', c.link?.kind === 'cam' && c.link.throw === 5 && c.link.dwell === 0.2);
  await agentCall('update_joint', { id: c.id, patch: { link: { kind: 'gear', from: 'r1', z1: 20, z2: 40 } } }, api);
  const g = project.assembly.joints.find(j => j.child === 'c').link;
  ok('Zahnrad: Übersetzung aus den Zähnezahlen (−20/40)', g.kind === 'gear' && g.ratio === -0.5 && g.z1 === 20 && g.z2 === 40);
  let err = '';
  try { await agentCall('update_joint', { id: c.id, patch: { link: { kind: 'worm', from: 'r1' } } }, api); } catch (e) { err = e.message; }
  ok('Unbekannte Verknüpfungsart wird abgelehnt', /link\.kind/.test(err), err);
}
