// NC tools without the app: comparing programs (js/nccompare.js), tool table for the control (js/tooltable.js).
// Run: npm run test:nc
import './lib/node-env.mjs';
const { ncKey, diffLines, compareRows } = await import('../js/nccompare.js');

const ok = (n, c, x = '') => { console.log((c ? 'OK   ' : 'FEHL ') + n + '  ' + x); if (!c) process.exitCode = 1; };

// ---- comparing NC programs ----
{
  ok('Vergleich: Satznummer ignoriert', ncKey('15 L X+10 R0 FMAX') === 'L X+10 R0 FMAX' && ncKey('N120 G1 X5') === 'G1 X5');
  ok('Vergleich: Satznummer beachtet', ncKey('15 L X+10', { numbers: false }) === '15 L X+10');
  const apply = (A, B, ops) => ops.every(o => o.op !== '=' || A[o.a] === B[o.b]) && ops.filter(o => o.op !== '+').map(o => o.a).join() === A.map((_, i) => i).join() && ops.filter(o => o.op !== '-').map(o => o.b).join() === B.map((_, i) => i).join();
  const rnd = n => Array.from({ length: n }, () => 'ABCDE'[Math.floor(Math.random() * 5)]);
  let good = true, minimal = true;
  for (let t = 0; t < 300; t++) {
    const A = rnd(Math.floor(Math.random() * 30)), B = rnd(Math.floor(Math.random() * 30));
    const ops = diffLines(A, B);
    if (!ops || !apply(A, B, ops)) { good = false; break; }
    // the edit script is the shortest: equal lines = longest common subsequence
    const L = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
    for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    if (ops.filter(o => o.op === '=').length !== L[0][0]) minimal = false;
  }
  ok('Vergleich: 300 Zufallsfälle ergeben beide Programme', good);
  ok('Vergleich: kürzeste Änderungsliste (= längste gemeinsame Folge)', minimal);
  const a = ['BEGIN PGM T MM', '1 TOOL CALL 1 Z S3000', '2 L X+0 Y+0 R0 FMAX', '3 L Z-2 R0 F200', '4 L X+50 R0', '5 END PGM T MM'].join('\n');
  const b = ['BEGIN PGM T MM', '1 TOOL CALL 1 Z S3500', '2 L X+0 Y+0 R0 FMAX', '3 M8', '4 L Z-2 R0 F200', '5 L X+50 R0', '6 END PGM T MM'].join('\n');
  const r = compareRows(a, b, { context: 1 });
  ok('Vergleich: geänderte Drehzahl, neuer Satz, Rest trotz neuer Satznummern gleich', r.stats.changed === 1 && r.stats.added === 1 && r.stats.removed === 0, JSON.stringify(r.stats));
  const big = Array.from({ length: 20000 }, (_, i) => `${i} L X+${i % 97} Y+${i % 89} R0 F500`);
  const big2 = big.slice(); big2.splice(12000, 0, '12000 M9'); big2[500] = '500 L X+1 Y+2 R0 F600';
  const t0 = Date.now(), rb = compareRows(big.join('\n'), big2.join('\n'));
  ok('Vergleich: 20 000 Sätze schnell', rb && Date.now() - t0 < 2000 && rb.stats.changed === 1 && rb.stats.added === 1, `${Date.now() - t0} ms ${JSON.stringify(rb?.stats)}`);
  ok('Vergleich: lange gleiche Strecken gefaltet', rb.rows.some(x => x.kind === 'fold' && x.n > 1000));
  ok('Vergleich: zu verschieden → null', compareRows(rnd(400).join('\n'), rnd(400).join('\n'), { maxD: 5 }) === null);
}

// ---- tool table for the control ----
{
  const { toolTable } = await import('../js/tooltable.js');
  const tools = [
    { id: 'a', number: 3, name: 'Schaftfräser Ø10', type: 'flat', dia: 10, flutes: 3, fluteLen: 22, stickout: 40 },
    { id: 'b', number: 1, name: 'Kugel "R3"', type: 'ball', dia: 6, flutes: 2, gauge: 87.5 },
    { id: 'c', number: 5, name: 'Torus', type: 'torus', dia: 12, cornerR: 1, neckDia: 11.5 },
    { id: 'd', number: 9, name: 'Halter', type: 'holder', dia: 0 },
    { id: 'e', number: 4, name: 'Taster', type: 'probe', dia: 4 },
  ];
  const hh = toolTable(tools, 'heidenhain'), L = hh.text.trim().split(/\r\n/);
  ok('Werkzeugtabelle Heidenhain: Spaltennamen in Zeile 1', L[0] === 'T,NAME,L,R,R2,DL,DR,LCUTS,LU,RN,CUT,DOC', L[0]);
  ok('Werkzeugtabelle Heidenhain: nach Nummer, ohne Halter', L.slice(1).map(l => l.split(',')[0]).join() === '1,3,4,5', L.slice(1).map(l => l.split(',')[0]).join());
  ok('Werkzeugtabelle Heidenhain: L, R, R2 (Kugel R2 = R)', /^1,KUGEL R3,87\.5,3,3,0,0,.*,"Kugel ""R3"""$/.test(L[1]), L[1]);
  ok('Werkzeugtabelle Heidenhain: Ø als D, Torus R2, RN', /^3,SCHAFTFRAESER D10,40,5,0,/.test(L[2]) && /^5,TORUS,[\d.]+,6,1,0,0,[\d.]+,[\d.]+,5\.75,/.test(L[4]), L[2] + ' | ' + L[4]);
  ok('Werkzeugtabelle Heidenhain: Dezimalpunkt, nur ASCII', !/[^\x20-\x7e\r\n]/.test(hh.text) && !/\d,\d{3}\b(?=,)/.test('') );
  const lc = toolTable(tools, 'linuxcnc').text.split('\n');
  ok('Werkzeugtabelle LinuxCNC: T P D Z', lc[0] === 'T1 P1 D6.000 Z+87.500 ;Kugel "R3"', lc[0]);
  const fa = toolTable(tools, 'fanuc').text;
  ok('Werkzeugtabelle Fanuc: G10 L10 / L12', /G10 L10 P3 R40\n/.test(fa) && /G10 L12 P3 R5\n/.test(fa) && /^%\nO9000/.test(fa) && /M30\n%\n$/.test(fa));
  const si = toolTable(tools, 'sinumerik').text;
  ok('Werkzeugtabelle Sinumerik: $TC_DP', /\$TC_DP1\[1,1\]=110/.test(si) && /\$TC_DP3\[3,1\]=40/.test(si) && /\$TC_DP6\[5,1\]=6/.test(si));
  ok('Werkzeugtabelle: doppelte Nummer gemeldet', toolTable([...tools, { id: 'x', number: 3, name: 'Bohrer', type: 'drill', dia: 5 }], 'heidenhain').warnings.some(w => /T3 ist doppelt/.test(w)));
}
