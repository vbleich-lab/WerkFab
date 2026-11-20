// Tests for exploded views (node tools/test-explode.mjs)
import { offsetsAt, trail, autoExplode, DIRS, dirKey } from '../js/explode.js';
const ok = (n, c, x = '') => { console.log((c ? 'OK   ' : 'FEHL ') + n + '  ' + x); if (!c) process.exitCode = 1; };
const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

const steps = [{ bodies: ['lid'], dir: [0, 0, 1], dist: 40 }, { bodies: ['lid', 'screw'], dir: [1, 0, 0], dist: 20 }];
ok('u = 0: nichts bewegt', Object.keys(offsetsAt(steps, 0)).length === 0);
ok('u = 0,5: Deckel halb hoch', near(offsetsAt(steps, 0.5).lid, [0, 0, 20]));
ok('u = 2: Deckel hoch und zur Seite, Schraube zur Seite', near(offsetsAt(steps, 2).lid, [20, 0, 40]) && near(offsetsAt(steps, 2).screw, [20, 0, 0]));
ok('Richtung wird normiert', near(offsetsAt([{ bodies: ['a'], dir: [0, 0, 5], dist: 10 }], 1).a, [0, 0, 10]));
ok('Spur: Ecken des Wegs', JSON.stringify(trail(steps, 'lid', 2, [1, 1, 1])) === JSON.stringify([[1, 1, 1], [1, 1, 41], [21, 1, 41]]));
ok('Richtungsnamen', dirKey([0, -1, 0]) === 'y-' && dirKey([0.3, 0, 1]) === null && DIRS['z+'][2] === 1);
{
  // base plate, a block on top, a cap on the block, a pin on the side
  const B = [
    { id: 'plate', min: [0, 0, 0], max: [100, 100, 10] },
    { id: 'block', min: [30, 30, 10], max: [70, 70, 40] },
    { id: 'cap', min: [40, 40, 40], max: [60, 60, 45] },
    { id: 'pin', min: [100, 45, 2], max: [120, 55, 8] },
  ];
  const s = autoExplode(B, { gap: 10 });
  const by = id => s.find(x => x.bodies[0] === id);
  ok('Grundplatte bleibt stehen', !by('plate'), JSON.stringify(s));
  ok('Klotz und Kappe nach oben, Stift zur Seite', dirKey(by('block').dir) === 'z+' && dirKey(by('cap').dir) === 'z+' && dirKey(by('pin').dir) === 'x+');
  const off = offsetsAt(s, s.length);
  const moved = b => ({ min: b.min.map((v, k) => v + (off[b.id]?.[k] || 0)), max: b.max.map((v, k) => v + (off[b.id]?.[k] || 0)) });
  const M = Object.fromEntries(B.map(b => [b.id, moved(b)]));
  ok('Klotz schwebt mit Abstand über der Platte', M.block.min[2] >= 20 - 1e-9, M.block.min[2]);
  ok('Kappe schwebt mit Abstand über dem Klotz', M.cap.min[2] >= M.block.max[2] + 10 - 1e-9, `${M.cap.min[2]} / ${M.block.max[2]}`);
  ok('Stift mit Abstand neben der Platte', M.pin.min[0] >= 110 - 1e-9, M.pin.min[0]);
  ok('Äußerste Teile zuerst (Kappe vor Klotz)', s.indexOf(by('cap')) < s.indexOf(by('block')));
}
ok('Ein Körper: keine Schritte', autoExplode([{ id: 'a', min: [0, 0, 0], max: [1, 1, 1] }]).length === 0);
