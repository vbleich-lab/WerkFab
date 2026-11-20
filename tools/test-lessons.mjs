// Tests for the guided lessons (node tools/test-lessons.mjs)
import { LESSONS, currentStep } from '../js/lessons.js';
const ok = (n, c, x = '') => { console.log((c ? 'OK   ' : 'FEHL ') + n + '  ' + x); if (!c) process.exitCode = 1; };
const L = id => LESSONS.find(l => l.id === id);
const P = o => ({ ws: 'design', sketchOpen: false, features: [], params: [], configs: [], bodies: 0, setups: 1, ops: 0, simOpen: false, dialogs: [], joints: [], studySteps: 0, explodeOpen: false, ...o });

ok('Vier Aufgaben, alle mit Schritten und Prüfung', LESSONS.length === 4 && LESSONS.every(l => l.steps.length >= 4 && l.steps.every(s => typeof s.check === 'function' && s.text)));
{
  const l = L('plate'), sk = { id: 's', type: 'sketch', entities: [{ type: 'rect' }] };
  ok('Platte: leer → Schritt 1', currentStep(l, P({})) === 0);
  ok('Skizze offen → Schritt 2', currentStep(l, P({ sketchOpen: true, features: [{ type: 'sketch', entities: [] }] })) === 1);
  ok('Rechteck gezeichnet, Skizze noch offen → Schritt 3', currentStep(l, P({ sketchOpen: true, features: [sk] })) === 2);
  ok('Skizze fertig → Extrusion', currentStep(l, P({ features: [sk] })) === 3);
  ok('Extrudiert → Bohrung', currentStep(l, P({ features: [sk, { type: 'extrude', op: 'new' }], bodies: 1 })) === 4);
  ok('Ausschneiden zählt als Bohrung → Verrundung', currentStep(l, P({ features: [sk, { type: 'extrude', op: 'new' }, { type: 'extrude', op: 'cut' }], bodies: 1 })) === 5);
  ok('Alles erledigt', currentStep(l, P({ features: [sk, { type: 'extrude' }, { type: 'hole' }, { type: 'fillet' }], bodies: 1 })) === l.steps.length);
  ok('Unterdrückte Schritte zählen nicht', currentStep(l, P({ features: [sk, { type: 'extrude' }, { type: 'hole', suppressed: true }], bodies: 1 })) === 4);
  ok('Geschlossene Polylinie zählt als Profil', currentStep(l, P({ features: [{ type: 'sketch', entities: [{ type: 'poly', closed: true }] }] })) === 3);
}
{
  const l = L('params'), base = { bodies: 1, params: [{ name: 'dicke', expr: '10' }] };
  ok('Parameter ohne Verwendung → Schritt 3', currentStep(l, P({ ...base, features: [{ type: 'extrude', distance: 10 }] })) === 2);
  ok('=dicke in der Extrusion zählt', currentStep(l, P({ ...base, features: [{ type: 'extrude', distance: '=dicke*2' }] })) === 3);
  ok('=dicke2 zählt nicht für dicke', currentStep(l, P({ ...base, features: [{ type: 'extrude', distance: '=dicke2' }] })) === 2);
  ok('Parameter in einer Skizze zählt', currentStep(l, P({ ...base, features: [{ type: 'sketch', entities: [{ type: 'rect', w: '=dicke' }] }] })) === 3);
  ok('Zwei gleiche Varianten reichen nicht', currentStep(l, P({ ...base, features: [{ type: 'extrude', distance: '=dicke' }], configs: [{ values: { dicke: '10' } }, { values: { dicke: '10' } }] })) === 4);
  ok('Zwei verschiedene Varianten: fertig', currentStep(l, P({ ...base, features: [{ type: 'extrude', distance: '=dicke' }], configs: [{ values: { dicke: '10' } }, { values: { dicke: '20' } }] })) === l.steps.length);
}
{
  const l = L('cam');
  ok('CAM: Fertigung gewählt, keine Operation → Schritt 3', currentStep(l, P({ bodies: 1, ws: 'cam' })) === 2);
  ok('CAM: NC-Fenster offen → fertig', currentStep(l, P({ bodies: 1, ws: 'cam', ops: 2, simOpen: true, dialogs: ['NC-PROGRAMM'] })) === l.steps.length);
}
{
  const l = L('motion');
  ok('Starres Gelenk zählt nicht', currentStep(l, P({ bodies: 2, joints: [{ type: 'rigid' }] })) === 1);
  ok('Drehgelenk, Ablauf, Explosion → fertig', currentStep(l, P({ bodies: 2, joints: [{ type: 'revolute' }], studySteps: 1, explodeOpen: true })) === l.steps.length);
}
ok('Prüfung mit Fehler gilt als nicht erledigt', currentStep({ steps: [{ check: () => { throw new Error('x'); } }] }, {}) === 0);
