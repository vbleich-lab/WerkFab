// Guided lessons: short tasks in the real app whose steps check themselves. Pure (no DOM): every step has a check
// on a "probe" – a plain snapshot of the app that main.js builds:
//   { ws: 'design' | 'cam' | …, sketchOpen, features: [project features], params, configs, bodies: n,
//     setups: n, ops: n, simOpen, dialogs: [titles of open dialogs], joints: [joints], studySteps: n, explodeOpen }
// A step may name the toolbar button that does it (tab + label); the app makes it blink.

const sketches = p => p.features.filter(f => f.type === 'sketch' && !f.suppressed);
const closedShape = e => ['rect', 'circle', 'polygon', 'slot', 'ellipse'].includes(e.type) || (e.type === 'poly' && e.closed);
const hasType = (p, ...types) => p.features.some(f => types.includes(f.type) && !f.suppressed);
// a value written as a formula with a parameter ("=L", "=L/2") somewhere in a feature
const usesParam = (p) => {
  const names = (p.params || []).map(q => q.name).filter(Boolean);
  if (!names.length) return false;
  const re = new RegExp(`(^|[^A-Za-z0-9_])(${names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})([^A-Za-z0-9_]|$)`);
  const walk = v => (typeof v === 'string' ? v.startsWith('=') && re.test(v.slice(1)) : Array.isArray(v) ? v.some(walk) : v && typeof v === 'object' ? Object.values(v).some(walk) : false);
  return p.features.some(f => f.type !== 'sketch' ? walk(f) : walk(f.entities) || walk(f.dims) || walk(f.constraints));
};

export const LESSONS = [
  {
    id: 'plate', title: 'Erstes Teil: Halteplatte', time: '5 min',
    intro: 'Eine Platte mit Bohrung und abgerundeten Kanten – Skizze, Extrusion, Bohrung und Verrundung.',
    fresh: true,
    steps: [
      { text: 'Skizze anlegen: auf „Skizze“ klicken und die XY-Ebene (unten liegend) anklicken.', button: ['MODELL', 'Skizze'], check: p => p.sketchOpen || sketches(p).length > 0 },
      { text: 'Ein Rechteck zeichnen: Werkzeug „Rechteck“ (R), zwei Ecken anklicken. Maße kann man direkt eintippen, z. B. 80 und 50.', button: ['SKIZZE', 'Rechteck'], check: p => sketches(p).some(s => (s.entities || []).some(closedShape)) },
      { text: 'Die Skizze schließen: „Skizze fertig“.', button: ['SKIZZE', 'Skizze fertig'], check: p => !p.sketchOpen && sketches(p).some(s => (s.entities || []).some(closedShape)) },
      { text: 'Die Platte extrudieren: „Extrusion“ (E), die Fläche anklicken und 10 mm eingeben, dann OK.', button: ['MODELL', 'Extrusion'], check: p => p.bodies > 0 && hasType(p, 'extrude', 'box') },
      { text: 'Eine Bohrung setzen: „Bohrung“ (H), auf die Oberseite klicken, Durchmesser wählen, OK. (Eine Extrusion mit „Ausschneiden“ zählt auch.)', button: ['MODELL', 'Bohrung'], check: p => hasType(p, 'hole') || p.features.some(f => f.type === 'extrude' && f.op === 'cut' && !f.suppressed) },
      { text: 'Kanten abrunden: „Verrundung“ (F), einige Kanten anklicken, Radius z. B. 3 mm, OK.', button: ['MODELL', 'Verrundung'], check: p => hasType(p, 'fillet', 'chamfer') },
    ],
    done: 'Geschafft! Das Teil steht in der Zeitleiste unten – ein Doppelklick auf einen Schritt ändert ihn nachträglich. Weiter geht es mit „Maße als Parameter“ oder „Vom Teil zum NC-Programm“.',
  },
  {
    id: 'params', title: 'Maße als Parameter', time: '4 min',
    intro: 'Maße mit Namen steuern das ganze Teil; Varianten merken sich verschiedene Werte.',
    steps: [
      { text: 'Es braucht einen Körper – falls noch keiner da ist, zuerst die Aufgabe „Erstes Teil“ machen.', check: p => p.bodies > 0 },
      { text: 'Einen Parameter anlegen: VERWALTEN → „Parameter ändern“, „+ Parameter“, Name z. B. dicke, Wert 10.', button: ['VERWALTEN', 'Parameter ändern'], check: p => (p.params || []).length > 0 },
      { text: 'Den Parameter benutzen: einen Schritt der Zeitleiste öffnen (Doppelklick, z. B. die Extrusion) und als Abstand =dicke eintippen.', check: p => usesParam(p) },
      { text: 'Eine Variante speichern: VERWALTEN → „Konfigurieren“, Name z. B. dünn.', button: ['VERWALTEN', 'Konfigurieren'], check: p => (p.configs || []).length > 0 },
      { text: 'Den Wert ändern (z. B. 20) und eine zweite Variante speichern – in der Konfigurationstabelle lassen sich beide umschalten und als Teilefamilie exportieren.', button: ['VERWALTEN', 'Konfigurationstabelle'], check: p => (p.configs || []).length > 1 && new Set((p.configs || []).map(c => JSON.stringify(c.values))).size > 1 },
    ],
    done: 'Sehr gut. In der Konfigurationstabelle: „Tabelle speichern“ gibt alle Varianten als CSV für Excel, „Alle Varianten exportieren“ als STEP oder STL.',
  },
  {
    id: 'cam', title: 'Vom Teil zum NC-Programm', time: '5 min',
    intro: 'Aufspannen, eine Bearbeitung anlegen, simulieren und das NC-Programm ansehen.',
    steps: [
      { text: 'Es braucht einen Körper – falls keiner da ist: Datei → Beispiele, oder zuerst „Erstes Teil“.', check: p => p.bodies > 0 },
      { text: 'Oben links den Arbeitsbereich „Fertigung“ wählen.', check: p => p.ws === 'cam' },
      { text: 'Eine Bearbeitung anlegen, z. B. FRÄSEN → „2D-Kontur“ oder „Planfräsen“, Werkzeug wählen, OK.', button: ['FRÄSEN', '2D-Kontur'], check: p => p.ops > 0 },
      { text: 'Die Bearbeitung simulieren: „Simulieren“ – Abspielen zeigt, wie das Werkzeug das Rohteil abträgt.', button: ['FRÄSEN', 'Simulieren'], check: p => p.simOpen },
      { text: 'Das NC-Programm ansehen: „NC-Programm“. Dort lässt es sich prüfen, speichern oder an die Maschine senden.', button: ['FRÄSEN', 'NC-Programm'], check: p => (p.dialogs || []).some(t => /NC/i.test(t)) },
    ],
    done: 'Fertig! Vor dem ersten Span: das Programm im NC-Fenster gegen Kollisionen prüfen und an der Maschine trocken (ohne Material) laufen lassen.',
  },
  {
    id: 'motion', title: 'Baugruppe bewegen', time: '4 min',
    intro: 'Zwei Teile mit einem Gelenk verbinden, die Bewegung abspielen und eine Explosionsansicht erstellen.',
    steps: [
      { text: 'Es braucht mindestens zwei Körper (z. B. zwei Extrusionen mit „Neuer Körper“).', check: p => p.bodies > 1 },
      { text: 'Ein Gelenk anlegen: ZUSAMMENBAU → „Gelenk“ (J), erst das bewegliche Teil, dann das feste anklicken, Art „Drehgelenk“ oder „Schiebegelenk“.', button: ['ZUSAMMENBAU', 'Gelenk'], check: p => (p.joints || []).some(j => ['revolute', 'slider', 'cylindrical'].includes(j.type)) },
      { text: 'Einen Bewegungsablauf anlegen: „Bewegungsablauf“, „+ Schritt“, dann ▶ – „Prüfen“ meldet Zusammenstöße mit Zeitpunkt.', button: ['ZUSAMMENBAU', 'Bewegungsablauf'], check: p => p.studySteps > 0 },
      { text: 'Eine Explosionsansicht öffnen: „Explosionsansicht“ – „Montageanleitung“ macht daraus eine Seite mit Bildern.', button: ['ZUSAMMENBAU', 'Explosionsansicht'], check: p => p.explodeOpen },
    ],
    done: 'Prima. Die Baugruppe lässt sich auch als Roboterbeschreibung (URDF) exportieren: Datei → „Als Roboterbeschreibung exportieren“.',
  },
];

// the first step that is not done yet (steps are done in order; a later step never counts before an earlier one)
export function currentStep(lesson, probe, from = 0) {
  for (let i = from; i < lesson.steps.length; i++) {
    let done = false;
    try { done = !!lesson.steps[i].check(probe); } catch { done = false; }
    if (!done) return i;
  }
  return lesson.steps.length;
}
