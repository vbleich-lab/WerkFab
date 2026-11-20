// Tests for motion studies over time (node tools/test-motionplan.mjs)
import { schedule, duration, valuesAt, sampleTimes, collisionIntervals, protocolCSV } from '../js/motionplan.js';
const ok = (n, c, x = '') => { console.log((c ? 'OK   ' : 'FEHL ') + n + '  ' + x); if (!c) process.exitCode = 1; };
const near = (a, b) => Math.abs(a - b) < 1e-9;

const plan = [
  { joint: 'arm', to: 90, dur: 2 },
  { joint: 'grip', to: 10, dur: 1, with: true },
  { joint: 'slide', to: 50, dur: 1 },
  { joint: 'arm', to: 0, dur: 2 },
];
{
  const s = schedule(plan);
  ok('Zeitplan: nacheinander und gleichzeitig', s.map(x => `${x.t0}-${x.t1}`).join(' ') === '0-2 0-1 2-3 3-5', s.map(x => `${x.t0}-${x.t1}`).join(' '));
  ok('Gesamtdauer', duration(plan) === 5);
}
{
  const st = { arm: 0, grip: 0, slide: 0 };
  const v1 = valuesAt(plan, 1, st), v25 = valuesAt(plan, 2.5, st), v4 = valuesAt(plan, 4, st), v9 = valuesAt(plan, 9, st);
  ok('t = 1 s: Arm halb, Greifer fertig', near(v1.arm, 45) && near(v1.grip, 10) && near(v1.slide, 0), JSON.stringify(v1));
  ok('t = 2,5 s: Schlitten halb', near(v25.arm, 90) && near(v25.slide, 25));
  ok('t = 4 s: Arm fährt zurück, Schlitten bleibt', near(v4.arm, 45) && near(v4.slide, 50));
  ok('Nach dem Ende: Endstellung', near(v9.arm, 0) && near(v9.grip, 10) && near(v9.slide, 50));
  ok('Vor dem Start: Ausgangsstellung', near(valuesAt(plan, -1, st).arm, 0));
  ok('Startwert des Gelenks wird beachtet', near(valuesAt([{ joint: 'a', to: 10, dur: 1 }], 0.5, { a: 20 }).a, 15));
  ok('Weich anfahren: Mitte gleich, Anfang langsamer', near(valuesAt([{ joint: 'a', to: 10, dur: 1, ease: 'smooth' }], 0.5, { a: 0 }).a, 5) && valuesAt([{ joint: 'a', to: 10, dur: 1, ease: 'smooth' }], 0.1, { a: 0 }).a < 1);
  ok('Dauer 0: sofort am Ziel', near(valuesAt([{ joint: 'a', to: 7, dur: 0 }], 0, { a: 0 }).a, 7));
}
{
  const t = sampleTimes([{ joint: 'a', to: 1, dur: 1 }, { joint: 'b', to: 1, dur: 0.05 }], 4);
  ok('Prüfzeiten: Raster und Schrittgrenzen', t.join() === '0,0.25,0.5,0.75,1,1.05', t.join());
}
{
  const S = [
    { t: 0, hits: [] }, { t: 1, hits: [{ a: 'x', b: 'y', volume: 2 }] }, { t: 2, hits: [{ a: 'y', b: 'x', volume: 5 }, { a: 'x', b: 'z', volume: 1 }] },
    { t: 3, hits: [] }, { t: 4, hits: [{ a: 'x', b: 'y', volume: 0.5 }] },
  ];
  const c = collisionIntervals(S);
  ok('Zwei Kollisionsabschnitte', c.length === 2, JSON.stringify(c.map(x => [x.t0, x.t1])));
  ok('Abschnitt 1: 1–2 s, frei bis 0 s, wieder frei ab 3 s', c[0].t0 === 1 && c[0].t1 === 2 && c[0].free === 0 && c[0].clearAt === 3);
  ok('Paare zusammengefasst, tiefste zuerst', c[0].pairs.length === 2 && c[0].pairs[0].volume === 5 && c[0].pairs[0].t === 2 && c[0].worst.t === 2);
  ok('Abschnitt am Ende bleibt offen', c[1].t0 === 4 && c[1].clearAt === undefined);
  const csv = protocolCSV(c, id => id.toUpperCase(), x => String(x).replace('.', ','));
  ok('Protokoll als CSV', csv.split('\r\n').length === 5 && csv.includes('1;2;0;X;Y;5;2'), csv.replace(/\r\n/g, ' | '));
}
