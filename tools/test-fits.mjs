// ISO 286 fits (js/fits.js): limit deviations against published tables (DIN ISO 286-2, JIS B 0401).
// Run: npm run test:fits
const { fitLimits, parseFit, fitMid, fitDevText } = await import('../js/fits.js');
const ok = (n, c, x = '') => { console.log((c ? 'OK   ' : 'FEHL ') + n + '  ' + x); if (!c) process.exitCode = 1; };
const checks = [
  ['H7',25,21,0],['h6',25,0,-13],['g6',25,-7,-20],['f7',25,-20,-41],['k6',25,15,2],['m6',25,21,8],
  ['n6',25,28,15],['p6',25,35,22],['K7',25,6,-15],['N7',25,-7,-28],['P7',25,-14,-35],['G7',25,28,7],
  ['F7',25,41,20],['js6',25,6.5,-6.5],['H7',60,30,0],['s6',60,72,53],['s6',70,78,59],
  // extra checks vs Mitsubishi / Miki (JIS B 0401) tables
  ['j6',25,9,-4],['j6',40,11,-5],['j6',60,12,-7],['j5',25,5,-4],['j6',300,16,-16],['J6',25,8,-5],['J7',25,12,-9],
  ['J7',450,43,-20],['K6',25,2,-11],['M6',25,-4,-17],['M6',300,-9,-41],['M7',300,0,-52],['N6',300,-25,-57],
  ['K7',450,18,-45],['M6',5,-1,-9],['N6',5,-5,-13],['P7',5,-8,-20],['R7',5,-11,-23],['R7',150,-50,-90],
  ['R7',450,-103,-166],['r6',470,172,132],['u6',35,76,60],['x6',12,51,40],['t6',35,64,48],['E8',25,73,40],
  ['D9',25,117,65],['B10',225,565,380],['C9',100,257,170],['C9',110,267,180],['M7',2,-2,-12],['K7',2,0,-10],['N9',25,0,-52],
  ['S7',60,-42,-72],['h9',500,0,-155],
];
let bad = [];
for (const [c, s, up, lo] of checks) { const l = fitLimits(c, s); if (!l || l[0] !== up || l[1] !== lo) bad.push(`${c}@${s}: ${l} statt ${up}/${lo}`); }
ok(`Passungen: ${checks.length} Tabellenwerte`, !bad.length, bad.slice(0, 5).join(' · '));
ok('Passung erkennen', parseFit('H7')?.hole === true && parseFit('g6')?.hole === false && parseFit('js6')?.cls === 'js6' && parseFit('±0,1') === null && parseFit('2×') === null && parseFit('Hx7') === null);
ok('Passung: Mitte H7 Ø25 = +0,0105', Math.abs(fitMid('H7', 25) - 0.0105) < 1e-9);
ok('Passung: Abmaße als Text', fitDevText('H7', 25) === '+0,021/0' && fitDevText('g6', 25) === '−0,007/−0,02', fitDevText('g6', 25));
ok('Passung: außerhalb 500 mm → null', fitLimits('H7', 600) === null && fitLimits('H7', 0) === null);
ok('Passung: Ø 0,5 im ersten Bereich', fitLimits('H7', 0.5)?.join() === '10,0');
