// Tests for standard workholding around the stock (node tools/test-fixtures.mjs)
import { fixtureBoxes, overlapsStock, VISE_SIZES } from '../js/fixtures.js';
const ok = (n, c, x = '') => { console.log((c ? 'OK   ' : 'FEHL ') + n + '  ' + x); if (!c) process.exitCode = 1; };
const S = { minX: 0, maxX: 120, minY: 0, maxY: 60, bottom: 0, top: 30 };

{
  const r = fixtureBoxes('vise', S);
  const [fix, mov, base] = r.boxes;
  ok('Schraubstock: 3 Teile', r.boxes.length === 3, r.note);
  ok('Backenbreite passend gewählt', fix.max[0] - fix.min[0] === 100 && VISE_SIZES.includes(100), `${fix.max[0] - fix.min[0]}`);
  ok('Backen liegen am Rohteil an (Y)', fix.max[1] === 0 && mov.min[1] === 60);
  ok('Spanntiefe 8 mm über der Rohteil-Unterkante', fix.max[2] === 8 && mov.max[2] === 8);
  ok('Kein Teil steckt im Rohteil', r.boxes.every(b => !overlapsStock(b, S)));
  ok('Grundkörper unter den Backen', base.max[2] === fix.min[2]);
  ok('Überstand wird gemeldet', /10 mm über die Backen/.test(r.note), r.note);
}
{
  const r = fixtureBoxes('vise', { ...S, top: 5 }, { grip: 20 });
  ok('Spanntiefe nie höher als das Rohteil', r.boxes[0].max[2] < 5, String(r.boxes[0].max[2]));
  const p = fixtureBoxes('vise', S, { jaw: 160, parallel: 10 });
  ok('Feste Backenbreite und Parallelunterlagen', p.boxes[0].max[0] - p.boxes[0].min[0] === 160 && p.boxes.length === 5 && p.boxes[3].min[2] === -10 && !overlapsStock(p.boxes[3], S));
}
{
  const r = fixtureBoxes('clamps', S, { overlap: 10 });
  ok('Pratzen: 4 Stück auf dem Rohteil', r.boxes.length === 4 && r.boxes.every(b => b.min[2] === 30));
  ok('Pratze links überdeckt 10 mm', r.boxes[0].max[0] === 10 && r.boxes[0].min[0] === -50);
}
{
  const r = fixtureBoxes('plate', S);
  ok('Unterlage unter dem Rohteil, 20 mm Rand', r.boxes[0].min[0] === -20 && r.boxes[0].max[1] === 80 && r.boxes[0].max[2] === 0 && r.boxes[0].min[2] === -15);
}
{
  let e = '';
  try { fixtureBoxes('vise', { ...S, maxX: 0 }); } catch (err) { e = err.message; }
  ok('Rohteil ohne Größe → Fehler', /keine Größe/.test(e));
}
