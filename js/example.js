// Demo part: parametric plate with rounded pocket, counterbored holes and filleted
// top edge, plus a complete CAM setup.
import { newProject } from './state.js';

const XY = z => ({ o: [0, 0, z], x: [1, 0, 0], n: [0, 0, 1] });

// Demo turned part: stepped shaft with groove and M20×1.5 thread, revolved about Z.
export function exampleTurning() {
  const p = newProject();
  p.name = 'Beispiel Welle';
  p.features = [
    { id: 'sk1', type: 'sketch', name: 'Skizze1', hidden: true, plane: { o: [0, 0, 0], x: [1, 0, 0], n: [0, -1, 0] }, entities: [
      { id: 'pr', type: 'poly', closed: true, pts: [[0, 0], [15, 0], [15, 30], [12, 30], [12, 37.5], [10, 37.5], [10, 42.5], [12, 42.5], [12, 50], [10, 52], [10, 70], [4.45, 70], [4.45, 63], [5.2, 63], [5.2, 61], [4.45, 61], [4.45, 58], [0, 55.33]] },
    ] },
    { id: 'rv1', type: 'revolve', name: 'Rotation1', sketch: 'sk1', profiles: 'all', axis: 'y', angle: 360, op: 'new' },
  ];
  const st = p.cam.setups[0];
  Object.assign(st, { name: 'Drehen', kind: 'turn', stockDia: 34, marginTop: 1, marginBottom: 10, safeZ: 5, machine: null });
  p.cam.tools.push(
    { id: 'L1', number: 11, name: 'Drehmeißel DCMT R0,4', type: 'turn', dia: 12, noseRadius: 0.4, insertAngle: 55, leadAngle: 93, rpm: 2000, feed: 300, plunge: 150, stepdown: 1.5, stepover: 0.5 },
    { id: 'L2', number: 12, name: 'Stechmeißel 3 mm', type: 'groove', dia: 3, width: 3, rpm: 1000, feed: 60, plunge: 60, stepdown: 1, stepover: 0.5 },
    { id: 'L3', number: 13, name: 'Gewindedrehmeißel 60°', type: 'tthread', dia: 6, rpm: 800, feed: 1200, plunge: 1200, stepdown: 1, stepover: 0.5 },
    { id: 'L4', number: 14, name: 'Bohrer Ø6', type: 'drill', dia: 6, angle: 118, fluteLen: 30, length: 70, rpm: 1500, feed: 120, plunge: 90, stepdown: 1, stepover: 0.5 },
    { id: 'L5', number: 15, name: 'Bohrstange Ø5 R0,2', type: 'turnbore', dia: 5, noseRadius: 0.2, insertAngle: 55, leadAngle: 93, rpm: 1800, feed: 150, plunge: 80, stepdown: 0.5, stepover: 0.5 },
    { id: 'L6', number: 16, name: 'Innen-Stechmeißel 2 mm', type: 'groove', internal: true, dia: 6, width: 2, rpm: 1200, feed: 50, plunge: 40, stepdown: 1, stepover: 0.5 },
    { id: 'L7', number: 17, name: 'Innengewindemeißel 60°', type: 'tthread', internal: true, dia: 6, rpm: 600, feed: 600, plunge: 600, stepdown: 1, stepover: 0.5 },
  );
  const o = { setup: st.id, enabled: true };
  p.cam.ops = [
    { ...o, id: 't1', type: 'tface', name: 'Plandrehen', tool: 'L1', stepdown: 0.5 },
    { ...o, id: 't2', type: 'trough', name: 'Längsschruppen', tool: 'L1', stepdown: 1.5, stockToLeave: 0.3, zEnd: 0 },
    { ...o, id: 't3', type: 'tfinish', name: 'Konturschlichten', tool: 'L1', zEnd: 0 },
    { ...o, id: 't7', type: 'tdrill', name: 'Bohren Ø6', tool: 'L4', peck: 5, stockToLeave: 0.2 },
    { ...o, id: 't8', type: 'tbore', name: 'Innendrehen Ø8,9', tool: 'L5', stepdown: 0.5 },
    { ...o, id: 't9', type: 'tgroove', name: 'Innen-Einstich', tool: 'L6', z: 62, width: 2, dia: 10.4 },
    { ...o, id: 't10', type: 'tthread', name: 'Innengewinde M10×1', tool: 'L7', zStart: 70, zEnd: 62.5, majorDia: 10, pitch: 1, passes: 5 },
    { ...o, id: 't4', type: 'tgroove', name: 'Einstich', tool: 'L2', z: 40, width: 5, dia: 20 },
    { ...o, id: 't5', type: 'tthread', name: 'Gewinde M20×1,5', tool: 'L3', zStart: 70, zEnd: 54, majorDia: 20, pitch: 1.5, passes: 6 },
    { ...o, id: 't6', type: 'tpart', name: 'Abstechen', tool: 'L2' },
  ];
  p.post.flavor = 'fanuc-lathe';
  return p;
}

export function exampleProject() {
  const p = newProject();
  p.name = 'Beispiel Grundplatte';
  p.params = [
    { name: 'laenge', expr: '120' },
    { name: 'breite', expr: '80' },
    { name: 'dicke', expr: '15' },
  ];
  p.features = [
    { id: 'sk1', type: 'sketch', name: 'Skizze1', hidden: true, plane: XY(0), entities: [{ id: 'e1', type: 'rect', x: 0, y: 0, w: '=laenge', h: '=breite', r: 6 }] },
    { id: 'ex1', type: 'extrude', name: 'Extrusion1', sketch: 'sk1', profiles: 'all', distance: '=dicke', extent: 'one', op: 'new' },
    { id: 'sk2', type: 'sketch', name: 'Skizze2', hidden: true, plane: XY('=dicke'), entities: [{ id: 'e2', type: 'rect', x: 30, y: 22, w: '=laenge-60', h: '=breite-44', r: 5 }] },
    { id: 'ex2', type: 'extrude', name: 'Extrusion2', sketch: 'sk2', profiles: 'all', distance: -6, extent: 'one', op: 'cut' },
    {
      id: 'sk3', type: 'sketch', name: 'Skizze3', hidden: true, plane: XY('=dicke'), entities: [
        { id: 'h1', type: 'circle', cx: 12, cy: 12, r: 3 },
        { id: 'h2', type: 'circle', cx: '=laenge-12', cy: 12, r: 3 },
        { id: 'h3', type: 'circle', cx: '=laenge-12', cy: '=breite-12', r: 3 },
        { id: 'h4', type: 'circle', cx: 12, cy: '=breite-12', r: 3 },
      ],
    },
    { id: 'ho1', type: 'hole', name: 'Bohrung1', sketch: 'sk3', points: 'all', kind: 'cbore', dia: 6.6, through: true, depth: 15, cbDia: 11, cbDepth: 6.5, csDia: 12, csAngle: 90, tip: false },
    {
      // top outer edges of the plate (straight edges + corner arcs), referenced by midpoint
      id: 'fi1', type: 'fillet', name: 'Verrundung1', radius: 1.5, all: false, edges: [
        [60, 0, 15], [120, 40, 15], [60, 80, 15], [0, 40, 15],
        [118.243, 1.757, 15], [118.243, 78.243, 15], [1.757, 78.243, 15], [1.757, 1.757, 15],
      ],
    },
  ];
  p.cam.ops = [
    { id: 'op1', type: 'face', name: 'Planfräsen1', tool: 'T1', enabled: true, bottom: null, bottomOffset: 0 },
    { id: 'op2', type: 'pocket', name: '2D-Tasche1', tool: 'T1', sketch: 'sk2', entities: 'all', enabled: true, bottom: null, bottomOffset: 0, stockToLeave: 0, direction: 'climb', ramp: 3 },
    { id: 'op3', type: 'drill', name: 'Bohren1', tool: 'T3', sketch: 'sk3', entities: 'all', enabled: true, bottom: null, bottomOffset: -1, peck: 3 },
    { id: 'op4', type: 'contour', name: '2D-Kontur1', tool: 'T1', sketch: 'sk1', entities: 'all', enabled: true, side: 'outside', bottom: null, bottomOffset: -0.3, stockToLeave: 0, direction: 'climb', tabs: true, tabCount: 4, tabWidth: 6, tabHeight: 1.5, ramp: 0 },
  ];
  return p;
}

// Milling test part: one feature for every milling strategy – plate with outer contour and chamfer edge, pocket
// with an island, through bore (helix boring, thread milling), circular pocket, slot, M8 holes (drilling,
// tapping), a star for engraving, and a dome with a fillet at its foot for the 3D strategies.
export function exampleMilling() {
  const p = newProject();
  p.name = 'Frästestteil';
  const star = (cx, cy, R, r, n = 5) => Array.from({ length: 2 * n }, (_, i) => {
    const a = Math.PI / 2 + (i * Math.PI) / n, q = i % 2 ? r : R;
    return [+(cx + q * Math.cos(a)).toFixed(3), +(cy + q * Math.sin(a)).toFixed(3)];
  });
  p.features = [
    { id: 'skB', type: 'sketch', name: 'Grundplatte', hidden: true, plane: XY(0), entities: [{ id: 'b1', type: 'rect', x: 0, y: 0, w: 160, h: 110, r: 8 }] },
    { id: 'exB', type: 'extrude', name: 'Grundplatte', sketch: 'skB', profiles: 'all', distance: 30, extent: 'one', op: 'new' },
    { id: 'sph', type: 'sphere', name: 'Kuppel', x: 115, y: 55, z: 10, r: 28, op: 'join' },
    { id: 'skU', type: 'sketch', name: 'Unterseite', hidden: true, plane: XY(0), entities: [{ id: 'u1', type: 'rect', x: -20, y: -20, w: 200, h: 150 }] },
    { id: 'exU', type: 'extrude', name: 'Kuppel unten abschneiden', sketch: 'skU', profiles: 'all', distance: -40, extent: 'one', op: 'cut' },
    { id: 'fiD', type: 'fillet', name: 'Hohlkehle', radius: 5, all: false, edges: [[95.404, 55, 30]] },
    { id: 'skP', type: 'sketch', name: 'Tasche', hidden: true, plane: XY(30), entities: [{ id: 'p1', type: 'rect', x: 10, y: 52, w: 44, h: 40, r: 6 }] },
    { id: 'exP', type: 'extrude', name: 'Tasche', sketch: 'skP', profiles: 'all', distance: -10, extent: 'one', op: 'cut' },
    { id: 'skI', type: 'sketch', name: 'Insel', hidden: true, plane: XY(20), entities: [{ id: 'i1', type: 'circle', cx: 32, cy: 72, r: 7 }] },
    { id: 'exI', type: 'extrude', name: 'Insel', sketch: 'skI', profiles: 'all', distance: 10, extent: 'one', op: 'join' },
    { id: 'skPI', type: 'sketch', name: 'Tasche mit Insel', hidden: true, plane: XY(30), entities: [{ id: 'q1', type: 'rect', x: 10, y: 52, w: 44, h: 40, r: 6 }, { id: 'q2', type: 'circle', cx: 32, cy: 72, r: 7 }] },
    { id: 'skH', type: 'sketch', name: 'Bohrung Ø20', hidden: true, plane: XY(30), entities: [{ id: 'h1', type: 'circle', cx: 28, cy: 28, r: 10 }] },
    { id: 'exH', type: 'extrude', name: 'Bohrung Ø20', sketch: 'skH', profiles: 'all', distance: -30, extent: 'one', op: 'cut' },
    { id: 'skC', type: 'sketch', name: 'Kreistasche', hidden: true, plane: XY(30), entities: [{ id: 'c1', type: 'circle', cx: 65, cy: 22, r: 9 }] },
    { id: 'exC', type: 'extrude', name: 'Kreistasche', sketch: 'skC', profiles: 'all', distance: -8, extent: 'one', op: 'cut' },
    { id: 'skS', type: 'sketch', name: 'Nut', hidden: true, plane: XY(30), entities: [{ id: 's1', type: 'slot', cx: 75, cy: 60, len: 16, w: 6, rot: 90 }] },
    { id: 'exS', type: 'extrude', name: 'Nut', sketch: 'skS', profiles: 'all', distance: -5, extent: 'one', op: 'cut' },
    { id: 'skT', type: 'sketch', name: 'Gewindebohrungen', hidden: true, plane: XY(30), entities: [[10, 10], [150, 10], [150, 100], [10, 100]].map(([cx, cy], i) => ({ id: 't' + i, type: 'circle', cx, cy, r: 3.4 })) },
    { id: 'hoT', type: 'hole', name: 'Bohrungen M8', sketch: 'skT', points: 'all', kind: 'simple', dia: 6.8, through: false, depth: 18, tip: false },
    { id: 'skE', type: 'sketch', name: 'Stern', hidden: true, plane: XY(30), entities: [{ id: 'e1', type: 'poly', closed: true, pts: star(75, 88, 8, 3.5) }] },
    // CAM geometry only: the dome area, a wavy line over it, and two guide curves on either side
    { id: 'skK', type: 'sketch', name: 'Kuppelbereich', hidden: true, plane: XY(30), entities: [{ id: 'k1', type: 'circle', cx: 115, cy: 55, r: 25 }] },
    { id: 'skW', type: 'sketch', name: 'Wellenlinie', hidden: true, plane: XY(30), entities: [{ id: 'w1', type: 'poly', closed: false, pts: Array.from({ length: 25 }, (_, i) => [95 + i * (40 / 24), +(55 + 8 * Math.sin((i / 24) * 2 * Math.PI)).toFixed(3)]) }] },
    { id: 'skG', type: 'sketch', name: 'Leitkurven', hidden: true, plane: XY(30), entities: [
      { id: 'g1', type: 'poly', closed: false, pts: [[92, 35], [104, 30], [115, 29], [126, 30], [138, 35]] },
      { id: 'g2', type: 'poly', closed: false, pts: [[92, 75], [104, 80], [115, 81], [126, 80], [138, 75]] },
    ] },
  ];
  p.cam.tools.push(
    { id: 'T9', number: 9, name: 'Schaftfräser Ø12', type: 'flat', dia: 12, fluteLen: 42, length: 100, flutes: 3, rpm: 8000, feed: 1500, plunge: 400, stepdown: 4, stepover: 0.5 },
    { id: 'T10', number: 10, name: 'Kugelfräser R2', type: 'ball', dia: 4, fluteLen: 22, stickout: 40, flutes: 2, rpm: 12000, feed: 900, plunge: 300, stepdown: 0.5, stepover: 0.4 },
  );
  // reach of the standard tools for this part: the 3D strategies work down to the pocket floor (Z20)
  const reach = { T1: [25, 40], T2: [10, 30], T4: [25, 40], T6: [32, 45] };
  for (const t of p.cam.tools) if (reach[t.id]) Object.assign(t, { fluteLen: reach[t.id][0], stickout: reach[t.id][1] });
  // one operation per milling strategy: 2D, holes, engraving, 3D roughing, 3D finishing, rest machining, edges,
  // the outer contour last
  const st = p.cam.setups[0];
  const D = { enabled: true, depth: 0.5, pitch: 1, majorDia: null, hand: 'right', sketch: '', entities: 'all', bottom: null, bottomOffset: 0, stockToLeave: 0, side: 'outside', direction: 'climb', peck: 0, stepdown: null, stepover: null, ramp: 0, tabs: false, tabCount: 4, tabWidth: 5, tabHeight: 1.5, width: 0.5, extraDepth: 0.2, stepoverMm: 0.5, angle: 0 };
  p.cam.ops = [
    { type: 'face', name: 'Planfräsen', tool: 'T9' },
    { type: 'adaptive', name: '2D-Adaptiv', tool: 'T1', sketch: 'skPI', stockToLeave: 0.3, stepdown: 9, stepover: 0.12, ramp: 2, geomSource: 'sketch' },
    { type: 'pocket', name: '2D-Tasche', tool: 'T1', sketch: 'skPI', ramp: 3, geomSource: 'sketch' },
    { type: 'circular', name: 'Kreistasche', tool: 'T1', sketch: 'skC', geomSource: 'sketch' },
    { type: 'bore', name: 'Helix-Bohren', tool: 'T9', sketch: 'skH', geomSource: 'sketch' },
    { type: 'thread', name: 'Gewindefräsen', tool: 'T6', pitch: 1.5, majorDia: 22, bottomOffset: 18, sketch: 'skH', side: 'inside', geomSource: 'sketch' },
    { type: 'slot', name: '2D-Nut', tool: 'T1', sketch: 'skS', geomSource: 'sketch' },
    { type: 'trace', name: 'Gravieren / Kurve', tool: 'T2', depth: 0.3, sketch: 'skE', geomSource: 'sketch' },
    { type: 'vcarve', name: 'V-Gravur', tool: 'T5', sketch: 'skE', stepoverMm: 0.1, maxDepth: 3, geomSource: 'sketch' },
    { type: 'rough3d', name: '3D-Räumen', tool: 'T9', stockToLeave: 0.3, stepdown: 18, stepover: 0.12, ramp: 3, strategy: 'adaptive', retractPolicy: 'stock' },
    { type: 'adaptive3d', name: 'Adaptives 3D-Schruppen', tool: 'T9', stockToLeave: 0.3, stepdown: 9, stepover: 0.12, ramp: 2, retractPolicy: 'stock' },
    { type: 'pocket3d', name: '3D-Versatz-Schruppen', tool: 'T1', stockToLeave: 0.3, ramp: 3, retractPolicy: 'stock' },
    { type: 'plunge3d', name: 'Tauchschruppen', tool: 'T1', stockToLeave: 0.3, stepoverMm: 3, retractPolicy: 'full', rowStep: 4.2, pullBack: 0.3 },
    { type: 'parallel3d', name: '3D-Parallel', tool: 'T4', retractPolicy: 'stock' },
    { type: 'contour3d', name: '3D-Kontur (Wasserlinie)', tool: 'T4', retractPolicy: 'stock' },
    { type: 'horizontal3d', name: '3D-Horizontal (Planflächen)', tool: 'T1', retractPolicy: 'stock' },
    // the holes once the plate is at its height (before, the corners still stand up to the top of the dome);
    // the tap stops 2 mm above the bottom of the drilled hole
    { type: 'drill', name: 'Bohren Ø6,8', tool: 'T8', sketch: 'skT', peck: 3, geomSource: 'sketch' },
    { type: 'drill', name: 'Gewindebohren M8', tool: 'T7', sketch: 'skT', bottomOffset: 2, geomSource: 'sketch' },
    { type: 'steep3d', name: '3D-Steil & Flach', tool: 'T4', stepdown: 0.5, stepoverMm: 0.48, retractPolicy: 'stock', slope: 45 },
    { type: 'scallop3d', name: 'HSC-Kontur', tool: 'T4', stepoverMm: 0.48, retractPolicy: 'stock' },
    { type: 'flat3d', name: 'Flach', tool: 'T1', stepoverMm: 2.4, slope: 3, retractPolicy: 'stock' },
    { type: 'ramp3d', name: 'Materialeinfahrt', tool: 'T4', stepdown: 0.5, retractPolicy: 'stock' },
    { type: 'spiral3d', name: '3D-Spirale', tool: 'T4', stepoverMm: 0.48, retractPolicy: 'stock', cx: 115, cy: 55 },
    { type: 'radial3d', name: '3D-Radial', tool: 'T4', stepoverMm: 0.48, retractPolicy: 'stock', cx: 115, cy: 55 },
    { type: 'morphspiral3d', name: 'Morph-Spirale', tool: 'T4', sketch: 'skK', stepoverMm: 0.48, retractPolicy: 'stock', cx: 115, cy: 55, geomSource: 'sketch' },
    { type: 'flow3d', name: 'Fluss', tool: 'T4', sketch: 'skK', stepoverMm: 0.48, retractPolicy: 'stock', geomSource: 'sketch' },
    { type: 'morph3d', name: 'Flächen-Morph', tool: 'T4', sketch: 'skK', stepoverMm: 0.48, retractPolicy: 'stock', geomSource: 'sketch' },
    { type: 'blend3d', name: 'Leitkurven-Blend', tool: 'T4', sketch: 'skG', stepoverMm: 0.48, retractPolicy: 'stock', geomSource: 'sketch' },
    { type: 'guidemorph3d', name: 'Leitkurven-Morph', tool: 'T4', sketch: 'skG', stepoverMm: 0.48, retractPolicy: 'stock', geomSource: 'sketch' },
    { type: 'geodesic3d', name: 'Geodätische Linie', tool: 'T4', sketch: 'skW', stepoverMm: 0.48, retractPolicy: 'stock', geomSource: 'sketch' },
    { type: 'project3d', name: '3D-Projizieren', tool: 'T2', depth: 0.3, sketch: 'skW', geomSource: 'sketch' },
    { type: 'pencil3d', name: 'Hohlkehle', tool: 'T10', retractPolicy: 'stock', pencilAngle: 20 },
    { type: 'corner3d', name: 'Ecke', tool: 'T10', stepdown: 0.32, stepoverMm: 0.32, retractPolicy: 'stock', restDia: 8, slope: 45, restTool: 'T4' },
    { type: 'deburr3d', name: 'Entgraten', tool: 'T5', depth: 0.2, retractPolicy: 'stock', edgeAngle: 30 },
    { type: 'chamfer', name: '2D-Fase', tool: 'T5', sketch: 'skB', geomSource: 'sketch' },
    { type: 'contour', name: '2D-Kontur', tool: 'T9', sketch: 'skB', tabs: true, geomSource: 'sketch' },
  ].map((o, i) => ({
    id: 'm' + (i + 1), setup: st.id, ...D, ...o,
    // the 3D strategies stop above Z18: the outer walls below are the job of the 2D contour with the long Ø12
    ...(/3d$/.test(o.type) && !['rough3d', 'adaptive3d'].includes(o.type) ? { heights: { bottom: { from: 'modelBottom', offset: 18 } } } : {}),
  }));
  return p;
}

// Design test part: every modelling step of the app at least once – a plate with pocket, holes, threads,
// patterns, mirror, revolve, loft, sweep, rib, web, bosses, text; beside it single bodies for shell, draft,
// delete / replace / offset face, align, split, move, scale, combine, the primitives, coil, pipe, freeform,
// sheet metal, frame, the surface steps and the construction geometry.
export function exampleDesign() {
  const p = newProject();
  p.name = 'Konstruktionstestteil';
  p.params = [{ name: 'L', expr: '220' }, { name: 'B', expr: '160' }, { name: 'T', expr: '20' }, { name: 'rKnopf', expr: '12' }];
  const T = 20;
  const sk = (id, name, plane, entities, extra = {}) => ({ id, type: 'sketch', name, hidden: true, plane, entities, ...extra });
  const XZ = (x, y) => ({ o: [x, y, 0], x: [1, 0, 0], n: [0, -1, 0] }); // sketch v = world Z
  const YZ = (x, y, z) => ({ o: [x, y, z], x: [0, 1, 0], n: [1, 0, 0] });
  const box = (id, name, x, y, z, w, d, h, op = 'new') => ({ id, type: 'box', name, x, y, z, w, d, h, op });
  p.features = [
    // ---- construction geometry ----
    { id: 'plT', type: 'plane', hidden: true, name: 'Ebene Oberseite', kind: 'offset', base: 'XY', offset: '=T' },
    { id: 'plW', type: 'plane', hidden: true, name: 'Ebene 30°', kind: 'angle', base: 'XZ', axis: 'x', angle: 30 },
    { id: 'plM', type: 'plane', hidden: true, name: 'Mittelebene', kind: 'mid', base: 'XY', base2: 'plT' },
    { id: 'pl3', type: 'plane', hidden: true, name: 'Ebene durch 3 Punkte', kind: '3pt', pts: [[0, 0, 0], [220, 0, 0], [0, 160, 20]] },
    { id: 'axZ', type: 'axis', hidden: true, name: 'Achse Knopf', kind: '2pt', pts: [[160, 80, 0], [160, 80, 40]] },
    { id: 'axS', type: 'axis', hidden: true, name: 'Schnittachse', kind: 'planes', base: 'XY', base2: 'YZ' },
    { id: 'ptA', type: 'point', hidden: true, name: 'Punkt Mitte', x: 110, y: 80, z: 20 },
    { id: 'cv1', type: 'curve3d', name: '3D-Spline', kind: 'spline', pts: [[0, 180, 0], [40, 200, 20], [80, 180, 40], [120, 200, 20]] },
    { id: 'cv2', type: 'curve3d', name: '3D-Bogen', kind: 'arc', pts: [[140, 180, 0], [160, 200, 10], [180, 180, 0]] },
    // ---- base plate (parameters) ----
    sk('skB', 'Grundplatte', XY(0), [{ id: 'b1', type: 'rect', x: 0, y: 0, w: '=L', h: '=B', r: 10 }]),
    { id: 'exB', type: 'extrude', name: 'Grundplatte', sketch: 'skB', profiles: 'all', distance: '=T', extent: 'one', op: 'new' },
    // pocket (cut) on the construction plane, its floor raised by 1 mm (offset face), mirrored about the middle
    sk('skP', 'Tasche', XY(T), [{ id: 'p1', type: 'rect', x: 20, y: 20, w: 50, h: 30, r: 5 }], { planeRef: 'plT' }),
    { id: 'exP', type: 'extrude', name: 'Tasche', sketch: 'skP', profiles: 'all', distance: -8, extent: 'one', op: 'cut' },
    { id: 'ofP', type: 'offsetface', name: 'Taschenboden höher', faces: [[45, 35, 12]], distance: 1 },
    { id: 'miP', type: 'mirror', name: 'Tasche gespiegelt', target: 'exP', plane: 'YZ', offset: 110 },
    // holes: counterbored through, countersunk, plain with a thread
    sk('skH', 'Senkungen', XY(T), [[12, 12], [208, 12], [208, 148], [12, 148]].map(([cx, cy], i) => ({ id: 'h' + i, type: 'circle', cx, cy, r: 3.3 }))),
    { id: 'hoC', type: 'hole', name: 'Bohrung mit Senkung', sketch: 'skH', points: 'all', kind: 'cbore', dia: 6.6, through: true, depth: 20, cbDia: 11, cbDepth: 6.5, csDia: 12, csAngle: 90, tip: false },
    sk('skK', 'Kegelsenkungen', XY(T), [{ id: 'k1', type: 'circle', cx: 90, cy: 15, r: 3.3 }, { id: 'k2', type: 'circle', cx: 105, cy: 15, r: 3.3 }]),
    { id: 'hoK', type: 'hole', name: 'Kegelsenkung', sketch: 'skK', points: 'all', kind: 'csink', dia: 6.6, through: false, depth: 12, cbDia: 11, cbDepth: 6, csDia: 12, csAngle: 90, tip: true },
    sk('skG', 'Gewindebohrung', XY(T), [{ id: 'g1', type: 'circle', cx: 125, cy: 15, r: 5.1 }]),
    { id: 'hoG', type: 'hole', name: 'Bohrung Ø10,2', sketch: 'skG', points: 'all', kind: 'simple', dia: 10.2, through: false, depth: 15, tip: true },
    { id: 'thG', type: 'thread', name: 'Gewinde M12', faces: [[130.1, 15, 12]], size: 'auto', pitch: null, full: true, length: 10, modeled: false, hand: 'right', flip: false },
    // rectangular and circular pattern
    sk('skR', 'Lochfeld', XY(T), [{ id: 'r1', type: 'circle', cx: 30, cy: 75, r: 3 }]),
    { id: 'exR', type: 'extrude', name: 'Loch', sketch: 'skR', profiles: 'all', distance: -4, extent: 'one', op: 'cut' },
    { id: 'paR', type: 'pattern', name: 'Rechteckmuster', kind: 'rect', target: 'exR', dir1: 'x', n1: 4, s1: 12, dir2: 'y', n2: 2, s2: 12 },
    sk('skN', 'Nut', XY(T), [{ id: 'n1', type: 'slot', cx: 110, cy: 100, len: 10, w: 4, rot: 90 }]),
    { id: 'exN', type: 'extrude', name: 'Nut', sketch: 'skN', profiles: 'all', distance: -3, extent: 'one', op: 'cut' },
    { id: 'paN', type: 'pattern', name: 'Kreismuster', kind: 'circ', target: 'exN', axis: 'z', cx: 110, cy: 80, cz: 0, n: 6, angle: 360 },
    // sketch shapes: ellipse, hexagon, polyline with corner radius and chamfer – cut 2 mm
    sk('skF', 'Skizzenformen', XY(T), [
      { id: 'f1', type: 'ellipse', cx: 30, cy: 100, rx: 8, ry: 4, rot: 20 },
      { id: 'f2', type: 'ngon', cx: 55, cy: 100, r: 6, n: 6, rot: 0 },
      { id: 'f3', type: 'poly', closed: true, pts: [[70, 94], [86, 94], [86, 106], [70, 106]], radii: { 1: 3 }, chamfers: { 3: [2, 2] } },
    ]),
    { id: 'exF', type: 'extrude', name: 'Skizzenformen', sketch: 'skF', profiles: 'all', distance: -2, extent: 'one', op: 'cut' },
    // revolved knob (parameter rKnopf), lofted transition, filleted block, cone, bolt with modelled thread
    sk('skV', 'Knopf', XZ(160, 80), [{ id: 'v1', type: 'poly', closed: true, pts: [[0, 19], ['=rKnopf', 19], ['=rKnopf', 25], [7, 35], [0, 35]] }]),
    { id: 'rvV', type: 'revolve', name: 'Knopf', sketch: 'skV', profiles: 'all', axis: 'y', angle: 360, op: 'join' },
    sk('skL1', 'Übergang unten', XY(T), [{ id: 'l1', type: 'rect', x: 185, y: 65, w: 20, h: 20 }]),
    sk('skL2', 'Übergang oben', XY(T + 20), [{ id: 'l2', type: 'circle', cx: 195, cy: 75, r: 6 }]),
    { id: 'loL', type: 'loft', name: 'Übergang', sections: ['skL1', 'skL2'], ruled: false, op: 'join' },
    box('bxQ', 'Block', 180, 100, T, 25, 20, 10, 'join'),
    { id: 'fiQ', type: 'fillet', name: 'Block verrunden', radius: 3, all: false, edges: [[192.5, 100, 30], [205, 110, 30], [192.5, 120, 30], [180, 110, 30]] },
    { id: 'coK', type: 'cone', name: 'Kegel', x: 150, y: 140, z: T, r1: 8, r2: 3, h: 12, axis: 'z', op: 'join' },
    { id: 'cyB', type: 'cylinder', name: 'Bolzen', x: 185, y: 140, z: T, r: 6, h: 18, op: 'join' },
    { id: 'thB', type: 'thread', name: 'Außengewinde M12', faces: [[191, 140, 32]], size: 'auto', pitch: null, full: false, length: 7, modeled: true, hand: 'right', flip: false },
    // sweep along a bent path, rib, web, bosses, snap hook, ledge
    sk('skW1', 'Sweep-Pfad', XY(T + 2), [{ id: 'w1', type: 'poly', closed: false, pts: [[20, 118], [60, 118], [80, 134]], radii: { 1: 10 } }]),
    sk('skW2', 'Sweep-Profil', YZ(20, 118, T + 2), [{ id: 'w2', type: 'circle', cx: 0, cy: 0, r: 4 }]),
    { id: 'swW', type: 'sweep', name: 'Sweep', sketch: 'skW2', profiles: 'all', pathSketch: 'skW1', pathEntity: 'w1', op: 'join' },
    sk('skRi', 'Rippe', XZ(0, 112), [{ id: 'ri1', type: 'poly', closed: false, pts: [[170, 20], [180, 30]] }]),
    { id: 'riR', type: 'rib', name: 'Rippe', sketch: 'skRi', entity: 'ri1', thickness: 3, height: 10, symmetric: true, op: 'join' },
    sk('skWe', 'Gewebe', XY(T), [{ id: 'we1', type: 'poly', closed: false, pts: [[132, 30], [146, 30]] }, { id: 'we2', type: 'poly', closed: false, pts: [[139, 23], [139, 37]] }]),
    { id: 'weW', type: 'web', name: 'Gewebe', sketch: 'skWe', thickness: 2, height: 6, symmetric: false, op: 'join' },
    sk('skBo', 'Dome', XY(T), [{ id: 'bo1', type: 'circle', cx: 90, cy: 45, r: 1.5 }, { id: 'bo2', type: 'circle', cx: 90, cy: 62, r: 1.5 }]),
    { id: 'boD', type: 'boss', name: 'Dome', sketch: 'skBo', D: 8, d: 3, h: 10, depth: 8, draft: 1, flip: false, op: 'join' },
    { id: 'snS', type: 'snapfit', name: 'Rasthaken', x: 105, y: 145, z: T, dir: 'z', rz: 0, length: 15, thickness: 1.5, width: 6, hook: 1, hookLen: 2, op: 'join' },
    sk('skAu', 'Auflage', XY(T), [{ id: 'au1', type: 'rect', x: 120, y: 112, w: 20, h: 14 }]),
    { id: 'reA', type: 'rest', name: 'Auflage', sketch: 'skAu', profiles: 'all', width: 2, height: 4, op: 'join' },
    // text: debossed on top, embossed round the bolt (sketch on a plane tangent to it)
    sk('skT', 'Schrift', XY(T), [{ id: 't1', type: 'text', x: 20, y: 140, text: 'WerkFab', size: 8 }], { planeRef: 'plT' }),
    { id: 'emT', type: 'emboss', name: 'Schrift vertieft', sketch: 'skT', profiles: 'all', mode: 'deboss', depth: 0.5, wrap: 'plane', pts: [], r: 0 },
    { id: 'plB', type: 'plane', hidden: true, name: 'Tangentialebene Bolzen', kind: 'tangent', base: 'XY', pts: [[185, 140, 20], [185, 140, 38]], r: 6, angle: 0 },
    sk('skTB', 'Schrift Bolzen', { o: [185, 146, 20], x: [0, 0, 1], n: [0, 1, 0] }, [{ id: 'tb1', type: 'text', x: 1, y: -3, text: 'M12', size: 4 }], { planeRef: 'plB' }),
    { id: 'emB', type: 'emboss', name: 'Schrift Bolzen', sketch: 'skTB', profiles: 'all', mode: 'emboss', depth: 0.4, wrap: 'cyl', pts: [[185, 140, 20], [185, 140, 38]], r: 6 },
    // chamfer the bottom edges of the plate
    { id: 'chB', type: 'chamfer', name: 'Fase unten', distance: 1, all: false, edges: [[110, 0, 0], [220, 80, 0], [110, 160, 0], [0, 80, 0]] },
    // ---- single bodies left of the plate: shell with lip, draft, delete / replace face, align ----
    box('bxS', 'Schale', -70, 0, 0, 50, 40, 30),
    { id: 'shS', type: 'shell', name: 'Schale', thickness: 2, faces: [[-45, 20, 30]] },
    { id: 'liS', type: 'lip', name: 'Lippe', faces: [[-69, 20, 30]], kind: 'lip', side: 'inner', width: 1, height: 1.5 },
    box('bxD', 'Formschräge', -70, 60, 0, 30, 30, 20),
    { id: 'drD', type: 'draft', name: 'Formschräge', angle: 5, z: 0, faces: [[-55, 60, 10], [-40, 75, 10], [-55, 90, 10], [-70, 75, 10]] },
    box('bxL', 'Fläche löschen', -70, 110, 0, 30, 30, 20),
    { id: 'chL', type: 'chamfer', name: 'Fase zum Löschen', distance: 3, all: false, edges: [[-55, 140, 20]] },
    { id: 'dfL', type: 'delface', name: 'Fase löschen', faces: [[-55, 138.5, 18.5]] },
    box('bxE', 'Fläche ersetzen', -70, 160, 0, 30, 30, 20),
    { id: 'rfE', type: 'replaceface', name: 'Deckfläche ersetzen', faces: [[-55, 175, 20]], planeRef: 'XY', offset: 25 },
    box('bxA', 'Ausrichten', -30, 165, 50, 10, 10, 10),
    { id: 'alA', type: 'align', name: 'Ausrichten', mode: 'face', faces: [[-25, 170, 50], [-55, 175, 25]], edges: [], flip: false, offset: 0 },
    // ---- right of the plate: sphere split, torus moved and scaled, combine, coil, bounding box ----
    { id: 'spK', type: 'sphere', name: 'Kugel', x: 270, y: 40, z: 15, r: 15, op: 'new' },
    { id: 'spT', type: 'split', name: 'Kugel teilen', body: 'spK', plane: 'XY', offset: 15 },
    { id: 'toR', type: 'torus', name: 'Torus', x: 270, y: 110, z: 10, R: 20, r: 5, axis: 'z', op: 'new' },
    { id: 'mvR', type: 'move', name: 'Torus anheben', body: 'toR', dx: 0, dy: 0, dz: 5, rz: 0, cx: 0, cy: 0, copy: false },
    { id: 'scR', type: 'scale', name: 'Torus halb (Kopie)', body: 'toR', factor: 0.5, center: 'body', cx: 0, cy: 0, cz: 0, copy: true },
    box('bxC', 'Kombinieren Ziel', 250, 150, 0, 20, 20, 10),
    { id: 'cyC', type: 'cylinder', name: 'Kombinieren Werkzeug', x: 270, y: 170, z: 0, r: 8, h: 15, op: 'new' },
    { id: 'cmC', type: 'combine', name: 'Kombinieren', body: 'bxC', tool: 'cyC', op: 'cut', keep: false },
    { id: 'coF', type: 'coil', name: 'Feder', x: 330, y: 40, z: 0, axis: 'z', dia: 20, turns: 5, height: 30, section: 2, shape: 'circle', hand: 'right', op: 'new' },
    { id: 'bbF', type: 'bbox', name: 'Hüllquader Feder', body: 'coF', kind: 'box', axis: 'z', margin: 1, op: 'new' },
    { id: 'rbF', type: 'removebody', name: 'Hüllquader entfernen', body: 'bbF' },
    // ---- in front of the plate: pipe, freeform, sheet metal, path flange, frame ----
    sk('skRo', 'Rohrpfad', XY(10), [{ id: 'ro1', type: 'poly', closed: false, pts: [[0, -30], [80, -30], [120, -60]], radii: { 1: 20 } }]),
    { id: 'piR', type: 'pipe', name: 'Rohr', pathSketch: 'skRo', pathEntity: 'ro1', dia: 10, wall: 1, op: 'new' },
    { id: 'ffF', type: 'freeform', name: 'Freiform', x: 140, y: -120, w: 100, d: 80, base: 0, smooth: true, op: 'new', heights: [[15, 18, 22, 18, 15], [18, 26, 32, 26, 18], [15, 18, 22, 18, 15]] },
    sk('skBl', 'Blech', XY(0), [{ id: 'bl1', type: 'rect', x: 0, y: -150, w: 80, h: 50 }]),
    { id: 'shB', type: 'sheet', name: 'Blech', sketch: 'skBl', thickness: 2, radius: 2, kfactor: 0.44, flanges: [{ edge: 0, on: true, h: 20, angle: 90 }, { edge: 2, on: true, h: 20, angle: 90 }], op: 'new' },
    sk('skPf', 'Pfadflansch', XZ(0, -170), [{ id: 'pf1', type: 'poly', closed: false, pts: [[0, 0], [20, 0], [20, 15]] }]),
    { id: 'pfP', type: 'pathflange', name: 'Pfadflansch', sketch: 'skPf', entity: 'pf1', thickness: 2, length: 50, symmetric: false, op: 'new' },
    sk('skRa', 'Rahmen', XY(0), [{ id: 'ra1', type: 'poly', closed: false, pts: [[300, -40], [380, -40], [380, -120]] }]),
    { id: 'frR', type: 'frame', name: 'Rahmen', sketch: 'skRa', fam: 'en10219q', size: '40×40×3', op: 'new' },
    // ---- surfaces (behind the plate) ----
    sk('skS1', 'Flächen-Extrusion', XY(0), [{ id: 's1', type: 'poly', closed: false, pts: [[0, 250], [40, 250]] }]),
    { id: 'seS', type: 'surfextrude', name: 'Wand', sketch: 'skS1', curves: 'all', extent: 'one', distance: 20 },
    sk('skS2', 'Flicken', XY(0), [{ id: 's2', type: 'rect', x: 0, y: 250, w: 40, h: 30 }]),
    { id: 'paS', type: 'patch', name: 'Boden', sketch: 'skS2', profiles: 'all' },
    { id: 'stS', type: 'stitch', name: 'Zusammenfügen', bodies: ['seS', 'paS'], tolerance: 0.01 },
    { id: 'usS', type: 'unstitch', name: 'Verbund aufheben', body: 'seS' },
    sk('skS3', 'Vase', XZ(100, 265), [{ id: 's3', type: 'poly', closed: false, pts: [[6, 0], [12, 10], [8, 25]] }]),
    { id: 'srS', type: 'surfrevolve', name: 'Vase', sketch: 'skS3', curves: 'all', axis: 'y', angle: 360 },
    { id: 'fiS', type: 'fill', name: 'Vase Deckel', edges: [[92, 265, 25]], tangent: false },
    sk('skS4', 'Erhebung unten', XY(0), [{ id: 's4', type: 'poly', closed: false, pts: [[140, 250], [180, 250]] }]),
    sk('skS5', 'Erhebung oben', XY(20), [{ id: 's5', type: 'poly', closed: false, pts: [[140, 270], [180, 275]] }]),
    { id: 'slS', type: 'surfloft', name: 'Flächen-Erhebung', sections: ['skS4', 'skS5'], ruled: false },
    { id: 'osS', type: 'offsetsurf', name: 'Versatzfläche', faces: [[160, 261.25, 10]], distance: 3 },
    { id: 'tkS', type: 'thicken', name: 'Aufdicken', thickness: 2, direction: 'out', faces: [[160, 261.25, 10]], op: 'new' },
    sk('skS6', 'Wand 2', XY(0), [{ id: 's6', type: 'poly', closed: false, pts: [[220, 250], [260, 250]] }]),
    { id: 'seT', type: 'surfextrude', name: 'Wand zum Trimmen', sketch: 'skS6', curves: 'all', extent: 'one', distance: 30 },
    { id: 'trS', type: 'surftrim', name: 'Trimmen', body: 'seT', toolKind: 'plane', tool: '', plane: 'plT', faces: [[240, 250, 25]] },
    { id: 'exS', type: 'surfextend', name: 'Verlängern', edges: [[240, 250, 20]], distance: 5 },
    { id: 'ruS', type: 'ruled', name: 'Regelfläche', edges: [[20, 250, 20]], distance: 10, dir: 'normal' },
    { id: 'fnS', type: 'flipnormal', name: 'Normale umkehren', body: 'srS' },
    { id: 'sfS', type: 'splitface', name: 'Fläche teilen', faces: [[-45, 2, 15]], toolKind: 'plane', plane: 'plM', sketch: '' },
    // ---- variants ----
    // constrained sketch: lines and an arc held by coincident, tangent, horizontal, vertical, fix and dimensions
    sk('skC', 'Bemaßte Skizze', XY(T), [
      { id: 'c1', type: 'poly', pts: [[102, 30], [122, 30]] },
      { id: 'c2', type: 'poly', curve: 'arc', pts: [[122, 30], [129, 37], [122, 44]] },
      { id: 'c3', type: 'poly', pts: [[122, 44], [102, 44]] },
      { id: 'c4', type: 'poly', pts: [[102, 44], [102, 30]] },
    ], { constraints: [
      { id: 'k1', type: 'coincident', refs: ['c2:p0', 'c1:p1'] },
      { id: 'k2', type: 'coincident', refs: ['c3:p0', 'c2:p2'] },
      { id: 'k3', type: 'coincident', refs: ['c4:p0', 'c3:p1'] },
      { id: 'k4', type: 'coincident', refs: ['c1:p0', 'c4:p1'] },
      { id: 'k5', type: 'horizontal', refs: ['c1:l0'] },
      { id: 'k6', type: 'horizontal', refs: ['c3:l0'] },
      { id: 'k7', type: 'vertical', refs: ['c4:l0'] },
      { id: 'k8', type: 'tangent', refs: ['c2:o', 'c1:l0'] },
      { id: 'k9', type: 'tangent', refs: ['c2:o', 'c3:l0'] },
      { id: 'k10', type: 'fix', refs: ['c1:p0'], at: [102, 30] },
      { id: 'k11', type: 'dim', kind: 'length', refs: ['c1:l0'], value: 20 },
      { id: 'k12', type: 'dim', kind: 'radius', refs: ['c2:o'], value: '=rKnopf/2' },
    ] }),
    { id: 'exC', type: 'extrude', name: 'Bemaßte Tasche', sketch: 'skC', profiles: 'all', distance: -3, extent: 'one', op: 'cut' },
    // extents: symmetric, two sides with taper; revolve by 180° about a line of the sketch
    sk('skX1', 'Symmetrisch', XZ(200, -250), [{ id: 'x1', type: 'rect', x: 0, y: 0, w: 40, h: 20 }]),
    { id: 'exX1', type: 'extrude', name: 'Symmetrisch', sketch: 'skX1', profiles: 'all', distance: 20, extent: 'sym', op: 'new' },
    sk('skX2', 'Zwei Seiten', XY(10), [{ id: 'x2', type: 'circle', cx: 280, cy: -250, r: 10 }]),
    { id: 'exX2', type: 'extrude', name: 'Zwei Seiten mit Schräge', sketch: 'skX2', profiles: 'all', distance: 15, distance2: 5, taper: 5, extent: 'two', op: 'new' },
    sk('skX3', 'Halbe Drehung', XZ(320, -250), [{ id: 'x3', type: 'rect', x: 5, y: 0, w: 10, h: 15 }, { id: 'xa', type: 'poly', closed: false, pts: [[0, 0], [0, 20]] }]),
    { id: 'rvX3', type: 'revolve', name: 'Halbe Drehung', sketch: 'skX3', profiles: ['x3'], axis: 'xa', angle: 180, op: 'new' },
    // edge variants: variable fillet, chamfer with two distances and with an angle, tapped hole
    box('bxV', 'Kantenvarianten', -130, 0, 0, 30, 30, 20),
    { id: 'fiV', type: 'fillet', name: 'Variable Verrundung', radius: 2, radius2: 6, variable: true, all: false, edges: [[-115, 30, 20]] },
    { id: 'chV2', type: 'chamfer', name: 'Fase zwei Abstände', distance: 2, distance2: 4, chamferKind: 'two', all: false, edges: [[-115, 0, 20]] },
    { id: 'chVA', type: 'chamfer', name: 'Fase mit Winkel', distance: 3, angle: 30, chamferKind: 'angle', all: false, edges: [[-100, 15, 20]] },
    sk('skVG', 'Gewindeloch', XY(20), [{ id: 'vg', type: 'circle', cx: -118, cy: 15, r: 2.5 }]),
    { id: 'hoV', type: 'hole', name: 'Gewindebohrung M6', sketch: 'skVG', points: 'all', kind: 'simple', dia: 5, through: false, depth: 12, tip: true, tapped: true, threadSize: 'M6' },
    // pattern along a path and of a whole body, extrude of a face, intersect, filling a hollow
    { id: 'cyP', type: 'cylinder', name: 'Stift', x: -130, y: -40, z: 0, r: 3, h: 10, op: 'new' },
    sk('skPP', 'Musterpfad', XY(0), [{ id: 'pp', type: 'poly', closed: false, pts: [[-130, -40], [-80, -40], [-60, -70]] }]),
    { id: 'paP', type: 'pattern', name: 'Muster entlang Pfad', kind: 'path', target: 'cyP', pathSketch: 'skPP', pathEntity: 'pp', n: 4, distType: 'extent', dist: 0, orient: 'identical', flip: false },
    { id: 'paK', type: 'pattern', name: 'Körpermuster', source: 'body', body: 'spT', kind: 'rect', dir1: 'x', n1: 2, s1: 40, dir2: 'y', n2: 1, s2: 0 },
    { id: 'exD', type: 'extrude', name: 'Fläche extrudieren', source: 'faces', faces: [[-55, 75, 20]], extent: 'one', distance: 5, distance2: 5, op: 'auto' },
    box('bxI', 'Schnittmenge Würfel', 380, -260, 0, 20, 20, 20),
    { id: 'spI', type: 'sphere', name: 'Schnittmenge Kugel', x: 390, y: -250, z: 10, r: 13, op: 'new' },
    { id: 'cmI', type: 'combine', name: 'Schnittmenge', body: 'bxI', tool: 'spI', op: 'intersect', keep: false },
    box('bxH', 'Hohlraum', 380, -200, 0, 30, 30, 30),
    { id: 'spH', type: 'sphere', name: 'Hohlraum innen', x: 395, y: -185, z: 15, r: 8, op: 'cut', target: 'bxH' },
    { id: 'bfH', type: 'bfill', name: 'Hohlraum füllen', body: 'bxH' },
    // sheet perforated, frame with an end cap
    sk('skPe', 'Lochfeld', XY(0), [{ id: 'pe', type: 'rect', x: 15, y: -140, w: 50, h: 30 }]),
    { id: 'peB', type: 'perforate', name: 'Perforieren', sketch: 'skPe', profiles: 'all', dia: 3, pitch: 6, margin: 2, stagger: true, depth: 0 },
    { id: 'ecR', type: 'endcap', name: 'Endkappe', faces: [[300, -21.5, 0]], thickness: 3, inset: 0, place: 'outside', op: 'join' },
    // surfaces: blend between two edges, untrim, straighten
    { id: 'blS', type: 'blendsurf', name: 'Verbindungsfläche', edges: [[240, 250, 25]], edges2: [[20, 260, 20]], ruled: false },
    sk('skS7', 'Fläche mit Loch', XY(0), [{ id: 's7', type: 'rect', x: 300, y: 300, w: 40, h: 30 }, { id: 's8', type: 'circle', cx: 320, cy: 315, r: 5 }]),
    { id: 'paL', type: 'patch', name: 'Fläche mit Loch', sketch: 'skS7', profiles: 'all' },
    { id: 'utS', type: 'untrim', name: 'Loch schließen (Trimmen aufheben)', faces: [[305, 305, 0]] },
    { id: 'sgS', type: 'straighten', name: 'Fläche begradigen', faces: [[160, 261.25, 10]] },
  ];
  return p;
}
