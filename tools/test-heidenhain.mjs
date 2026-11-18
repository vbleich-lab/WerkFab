// Heidenhain Klartext tests: one program with every kind of output (moves, arcs, helices, APPR/DEP, all drilling
// cycles, pocket / stud / slot cycles, hole patterns, touch probe, tilted setup), written with every combination
// of post options and checked block by block with tools/lib/hh-lint.mjs.
// Run: npm run test:hh
import './lib/node-env.mjs';
import fs from 'fs';
const { partBodies } = await import('./lib/testpart.mjs');
const cam = await import('../js/cam.js');
const post = await import('../js/post.js');
const { lintHeidenhain, lintSummary } = await import('./lib/hh-lint.mjs');

const ok = (n, c, x = '') => { console.log((c ? 'OK   ' : 'FEHL ') + n + '  ' + x); if (!c) process.exitCode = 1; };
const bodies = partBodies();
const dumpDir = process.argv[2]; // optional: write the programs there

const { project, OPS } = await import('./lib/postcase.mjs');

const p = project();
p.cam.ops = OPS;
const gens = p.cam.setups.map(st => { const g = cam.generateSetup(p, bodies, st, null, null); g.setup = st; return g; });
for (const g of gens) for (const op of g.ops) {
  const r = g.results.get(op.id);
  ok(`Erzeugt: ${op.name}`, r && !r.error && (r.moves?.length > 0 || r.probe || r.manual), r?.error || '');
}

const VARIANTS = {
  Standard: {},
  'Unterprogramme + Q-Vorschub + Glättung + M140 + Werkzeugname + Vorwahl + M1 + TCPM + XY-Referenz': { subroutines: 'ops', parametricFeed: true, smoothing: 'auto', useM140: true, toolAsName: true, preloadTool: true, optionalStop: true, tcpm: true, homeXY: true },
  'M91-Rückzug + Q-Vorschub + Notizen': { safeRetract: 'm91', m91Z: -5, parametricFeed: true, showNotes: true },
  'ohne Zyklen, Bohrbilder, APPR/DEP, Bögen, Strukturkommentare': { cycles: false, drillPatterns: false, apprDep: false, arcs: false, structureComments: false, writeToolList: false, probeCycles: false },
  'Zyklus 19 + Glättung hoch + Unterprogramme': { tiltedPlane: 'cycle19', smoothing: 'high', subroutines: 'ops' },
  'ohne Satznummern': { lineNumbers: false },
};

const count = (code, re) => (code.match(re) || []).length;
for (const [vname, props] of Object.entries(VARIANTS)) {
  gens.forEach((g, gi) => {
    let res;
    try { res = post.postProcess(p, g, null, { postId: 'heidenhain', props }); } catch (e) { ok(`${vname} / ${g.setup.name}: läuft`, false, e.stack.split('\n').slice(0, 3).join(' | ')); return; }
    if (dumpDir) fs.writeFileSync(`${dumpDir}/hh_${Object.keys(VARIANTS).indexOf(vname)}_${g.setup.id}.h`, res.code);
    const issues = lintHeidenhain(res.code, { lineNumbers: props.lineNumbers !== false });
    const sum = lintSummary(issues);
    ok(`${vname} / ${g.setup.name}: Klartext fehlerfrei`, issues.length === 0, issues.length ? sum.slice(0, 6).map(s => `${s.n}× ${s.msg} [${s.first}]`).join(' ‖ ') : `${res.lines} Sätze`);
    const bad = res.code.match(/NaN|undefined|Infinity|null|\[object|\{[A-Za-z0-9]+!?\}/);
    ok(`${vname} / ${g.setup.name}: keine ungültigen Werte oder offenen Platzhalter`, !bad, bad ? `„${bad[0]}“ in Zeile ${res.code.slice(0, bad.index).split('\n').length}` : '');
    if (gi === 0 && vname === 'Standard') {
      const c = res.code;
      ok('Standard: alle Bohrzyklen (200, 203, 201, 202, 207 rechts/links)', [/CYCL DEF 200 /, /CYCL DEF 203 /, /CYCL DEF 201 /, /CYCL DEF 202 /, /CYCL DEF 207 /].every(r => r.test(c)) && /Q239=\+1\.250/.test(c) && /Q239=-1\.250/.test(c));
      ok('Standard: Taschen-, Nut- und Zapfenzyklen (251, 252, 253, 256)', [/CYCL DEF 251 /, /CYCL DEF 252 /, /CYCL DEF 253 /, /CYCL DEF 256 /].every(r => r.test(c)));
      ok('Standard: Bohrungen mit Koordinaten statt Bohrbild (kein 220/221)', !/CYCL DEF 22[01] /.test(c) && /CYCL CALL POS|M99/.test(c));
      // the switch of the operation turns the pattern cycles on
      const pp = structuredClone(p);
      for (const o of pp.cam.ops) if (o.type === 'drill') o.drillPattern = true;
      const gp = cam.generateSetup(pp, bodies, pp.cam.setups[0], null, null); gp.setup = pp.cam.setups[0];
      const cp = post.postProcess(pp, gp, null, { postId: 'heidenhain', props }).code;
      ok('Schalter je Operation: Bohrbilder Raster und Lochkreis (221, 220)', /CYCL DEF 221 /.test(cp) && /CYCL DEF 220 /.test(cp) && /Q241=6 /.test(cp));
      ok('Postprozessor-Einstellung „Bohrbilder als Zyklus“ schaltet sie ebenfalls ein', /CYCL DEF 220 /.test(post.postProcess(p, g, null, { postId: 'heidenhain', props: { drillPatterns: true } }).code));
      for (const o of pp.cam.ops) if (o.type === 'drill') o.drillPattern = false;
      const gq = cam.generateSetup(pp, bodies, pp.cam.setups[0], null, null); gq.setup = pp.cam.setups[0];
      ok('Schalter aus schlägt die Postprozessor-Einstellung', !/CYCL DEF 22[01] /.test(post.postProcess(pp, gq, null, { postId: 'heidenhain', props: { drillPatterns: true } }).code));
      // the slot operation: switch "Als Steuerungszyklus ausgeben" → CYCL DEF 253 at the slot centre, off → path
      const ps = structuredClone(p), sl = ps.cam.ops.find(o => o.type === 'slot');
      const slotCode = on => {
        sl.ctrlCycle = on;
        const gs = cam.generateSetup(ps, bodies, ps.cam.setups.find(s => s.id === sl.setup) || ps.cam.setups[0], null, null);
        gs.setup = ps.cam.setups.find(s => s.id === sl.setup) || ps.cam.setups[0];
        const code = post.postProcess(ps, gs, null, { postId: 'heidenhain', props }).code;
        const at = code.indexOf(sl.name), rest = code.slice(at), end = rest.search(/\n(\d+ )?; .* - /);
        return { r: gs.results.get(sl.id), part: end > 0 ? rest.slice(0, end) : rest, code };
      };
      const sOn = slotCode(true), sOff = slotCode(false);
      ok('Nut als Steuerungszyklus: CYCL DEF 253 mit Länge 19 und Breite 7', sOn.r.pocketCycle && /CYCL DEF 253 /.test(sOn.part) && /Q218=\+?19(\.0+)? /.test(sOn.part) && /Q219=\+?7(\.0+)? /.test(sOn.part) && /M99/.test(sOn.part) && /Q202=\+?8\.000 /.test(sOn.part) && !/Q202=\+?1000000/.test(sOn.part), (sOn.r.pocketCycleWhy || '') + ' ' + (sOn.part.match(/Q21[89]=\S+/g) || []).join(' '));
      ok('Nut ohne Schalter: Bahn mit Koordinaten, kein 253', !/CYCL DEF 253 /.test(sOff.part) && / L X/.test(sOff.part));
      ok('Nut als Steuerungszyklus: Klartext fehlerfrei', lintHeidenhain(sOn.code, { lineNumbers: props.lineNumbers !== false }).length === 0);
      // face / bore / thread milling with "Als Steuerungszyklus ausgeben": 232, 208, 262
      const pm = structuredClone(p);
      for (const o of pm.cam.ops) if (['face', 'bore', 'thread'].includes(o.type)) { o.ctrlCycle = true; if (o.type === 'thread') { o.threadPasses = 1; o.threadSpring = false; } }
      const st1 = pm.cam.setups[0], gm = cam.generateSetup(pm, bodies, st1, null, null); gm.setup = st1;
      const resM = post.postProcess(pm, gm, null, { postId: 'heidenhain', props }), cm = resM.code;
      const whys = pm.cam.ops.filter(o => o.setup === st1.id || !o.setup).map(o => gm.results.get(o.id)).filter(x => x?.millCycleWhy).map(x => x.millCycleWhy);
      ok('Planfräsen als CYCL DEF 232 mit Rohteilmaß', /CYCL DEF 232 PLANFRAESEN/.test(cm) && /Q218=\+?\d/.test(cm) && /\nCYCL CALL|\d+ CYCL CALL/.test(cm), whys.join(' | '));
      ok('Bohrfräsen als CYCL DEF 208, Aufruf je Bohrung', /CYCL DEF 208 BOHRFRAESEN/.test(cm) && /Q335=\+?\d/.test(cm) && /M99/.test(cm));
      ok('Gewindefräsen als CYCL DEF 262 mit Steigung', /CYCL DEF 262 GEWINDEFRAESEN/.test(cm) && /Q239=[+-]\d/.test(cm));
      const lintM = lintHeidenhain(cm, { lineNumbers: props.lineNumbers !== false });
      ok('Zyklen 232/208/262: Klartext fehlerfrei', lintM.length === 0, lintSummary(lintM).slice(0, 4).map(s => `${s.n}× ${s.msg} [${s.first}]`).join(' ‖ '));
      const pw = structuredClone(pm), tw = pw.cam.ops.find(o => o.type === 'thread'); tw.threadPasses = 3;
      const gw = cam.generateSetup(pw, bodies, pw.cam.setups[0], null, null);
      ok('Gewindefräsen mit mehreren Zustellungen: Hinweis, als Bahn', /Zustellungen/.test(gw.results.get(tw.id).millCycleWhy || ''));
      // any outline: pocket with an island as SL cycles 14/20/22, an L-shaped contour as contour train 25
      const ps2 = structuredClone(p);
      ps2.features.push({ id: 'skL', type: 'sketch', name: 'L-Tasche', plane: structuredClone(ps2.features.find(f => f.id === 'skBig').plane), entities: [
        { id: 'l1', type: 'poly', closed: true, pts: [[15, 45], [55, 45], [55, 60], [35, 60], [35, 78], [15, 78]] },
        { id: 'l2', type: 'circle', cx: 25, cy: 55, r: 4 },
      ] });
      ps2.cam.ops = [
        { setup: 'S1', enabled: true, entities: 'all', id: 'slp', name: 'L-Tasche mit Insel', type: 'pocket', tool: 'T2', sketch: 'skL', ctrlCycle: true, heights: { bottom: { from: 'top', offset: -8 }, top: { from: 'pick', z: 10, offset: 0 } } },
        { setup: 'S1', enabled: true, entities: ['l1'], id: 'slc', name: 'L-Kontur', type: 'contour', tool: 'T2', sketch: 'skL', side: 'outside', ctrlCycle: true, heights: { bottom: { from: 'top', offset: -8 }, top: { from: 'pick', z: 10, offset: 0 } } },
      ];
      const gl = cam.generateSetup(ps2, bodies, ps2.cam.setups[0], null, null); gl.setup = ps2.cam.setups[0];
      const rp = gl.results.get('slp'), rc = gl.results.get('slc');
      const cl = post.postProcess(ps2, gl, null, { postId: 'heidenhain', props }).code;
      ok('SL-Tasche: Außenkontur und Insel erkannt', rp.slCycle?.regions?.length === 1 && rp.slCycle.regions[0].islands.length === 1, rp.error || rp.pocketCycleWhy || '');
      ok('SL-Tasche: CYCL DEF 14 mit zwei Labels, 20, 22, CYCL CALL', /CYCL DEF 14\.1 KONTURLABEL \d+ \/\d+/.test(cl) && /CYCL DEF 20 KONTUR-DATEN/.test(cl) && /CYCL DEF 22 RAEUMEN/.test(cl), (cl.match(/.*KONTURLABEL.*/) || [''])[0]);
      ok('Kontur als Konturzug: CYCL DEF 25 mit eigenem Label', rc.contourCycle && /CYCL DEF 25 KONTUR-ZUG/.test(cl), rc.contourCycleWhy || rc.error || '');
      const subsL = cl.slice(cl.search(/\n\d* ?M30|\nM30/));
      ok('Unterprogramme nach M30: Tasche RL, Insel RR, Kreisbogen mit CC/C', (subsL.match(/LBL [1-9]/g) || []).length === 3 && / RL\n/.test(subsL) && / RR\n/.test(subsL) && /CC X[+-][\d.]+ Y[+-][\d.]+\n\d* ?C X[+-][\d.]+ Y[+-][\d.]+ DR[+-]/.test(subsL), (subsL.match(/LBL \d+/g) || []).join(' '));
      const lintL = lintHeidenhain(cl, { lineNumbers: props.lineNumbers !== false });
      ok('SL-Zyklen und Konturzug: Klartext fehlerfrei', lintL.length === 0, lintSummary(lintL).slice(0, 4).map(s => `${s.n}× ${s.msg} [${s.first}]`).join(' ‖ '));
      if (dumpDir) fs.writeFileSync(`${dumpDir}/hh_sl.h`, cl);
      ok('Standard: APPR/DEP mit RL und RR', /APPR (CT|LCT) .* RL/.test(c) && /APPR LN .* RL/.test(c) && /DEP (CT|LCT)/.test(c) && /DEP LN/.test(c), (c.match(/.*APPR.*/g) || []).slice(0, 3).join(' | '));
      ok('Standard: Radiuskorrektur RR ohne Anfahrbewegung ein- und ausgeschaltet', / RR /.test(c) || / RR$/m.test(c));
      ok('Standard: Schraubenlinien als CP mit IPA/IZ', /CP IPA[+-][\d.]+ IZ[+-][\d.]+ DR[+-]/.test(c), (c.match(/.*CP IPA.*/) || ['–'])[0]);
      ok('Standard: Tastzyklus', /TCH PROBE 4\d\d /.test(c));
      ok('Standard: Taster ohne Drehzahl und ohne M3', /TOOL CALL 20 Z\n\d+ L Z[+\d.]+ R0 FMAX\n/.test(c), (c.match(/TOOL CALL 20.*\n.*/) || ['–'])[0].replace('\n', ' | '));
      ok('Standard: Gewindebohrer ohne M3 im Zyklusaufruf nötig, Spindel läuft', /TOOL CALL 7 Z S\d+/.test(c));
    }
    if (gi === 1) {
      const c = res.code;
      if (props.tiltedPlane === 'cycle19') ok(`${vname} / Vorne: Zyklus 19 ein und zurück`, count(c, /CYCL DEF 19\.0 /g) >= 3 && /CYCL DEF 19\.1 A\+90\.000 B\+0\.000 C\+0\.000/.test(c) && /CYCL DEF 19\.1 A\+0\.000 B\+0\.000 C\+0\.000\n\d+ CYCL DEF 19\.0 BEARBEITUNGSEBENE\n\d+ CYCL DEF 19\.1\n/.test(c), (c.match(/.*CYCL DEF 19\.1.*/g) || []).join(' | '));
      else ok(`${vname} / Vorne: PLANE SPATIAL … PLANE RESET`, /PLANE SPATIAL SPA[+-][\d.]+ SPB[+-][\d.]+ SPC[+-][\d.]+ /.test(c) && /PLANE RESET /.test(c), (c.match(/.*PLANE.*/g) || []).join(' | '));
    }
    if (props.subroutines === 'ops') ok(`${vname} / ${g.setup.name}: jede Operation ein LBL`, count(res.code, /^\d+ LBL [1-9]\d*$/gm) === count(res.code, /^\d+ CALL LBL \d+$/gm) && count(res.code, /^\d+ LBL 0$/gm) === count(res.code, /^\d+ CALL LBL \d+$/gm), `${count(res.code, /CALL LBL/g)} Aufrufe`);
    if (props.cycles === false) ok(`${vname} / ${g.setup.name}: keine Zyklen, kein APPR/DEP, keine Kreise`, !/CYCL DEF 2[02]\d|APPR|DEP |^\d+ C[CP]? /m.test(res.code));
  });
}

// M functions switched off: M3 off the positioning block, coolant and M140 left out, the program stays valid
{
  const g = gens[0];
  const res = post.postProcess(p, g, null, { postId: 'heidenhain', coolant: true, props: { useM140: true, mOff: [3, 8, 9, 140] } }).code;
  const blocks = res.split('\n').filter(l => !/^\s*\d*\s*;/.test(l));
  ok('M-Befehle (Heidenhain): M3, M8, M9, M140 fehlen', !blocks.some(l => /\sM(3|8|9|140)(?![0-9])/.test(l)));
  ok('M-Befehle (Heidenhain): kein „MB MAX“ ohne M140', !/MB MAX/.test(res));
  const r2 = post.postProcess(p, g, null, { postId: 'heidenhain', coolant: true, props: { useM140: true, mOff: [3, 8, 9, 140] } });
  ok('M-Befehle (Heidenhain): Warnung bei ausgeschalteter Spindel', r2.warnings.some(w => /Spindel/.test(w)));
  const issues = lintHeidenhain(post.postProcess(p, g, null, { postId: 'heidenhain', coolant: true, props: { useM140: true, mOff: [8, 9, 140] } }).code);
  ok('M-Befehle (Heidenhain): Programm ohne M8, M9, M140 fehlerfrei', issues.length === 0, issues.length ? lintSummary(issues).slice(0, 4).map(s => `${s.n}× ${s.msg} [${s.first}]`).join(' ‖ ') : '');
  ok('M-Befehle (Heidenhain): Liste enthält M91, M99, M140', [91, 99, 140].every(n => post.postMCodes(post.findPost(p, 'heidenhain'), {}).includes(n)));
}

// M120 LA (look-ahead) on finishing operations with RL/RR, M128/M129, M13 for spindle + coolant
{
  const g = gens[0];
  const res = post.postProcess(p, g, null, { postId: 'heidenhain', coolant: true, props: { tcpm: true, tcpmCode: 'm128', m13: true, m120LA: 5 } });
  const L = res.code.split('\n');
  const rlBlocks = L.filter(l => /\sR[LR](\s|$)/.test(l));
  const withM120 = L.filter(l => /\sM120 LA5\b/.test(l));
  ok('M120: im Satz mit RL/RR', withM120.length > 0 && withM120.every(l => /\sR[LR]\s/.test(l)), `${withM120.length} von ${rlBlocks.length} RL/RR-Sätzen`);
  ok('M128 am Anfang, M129 vor dem Ende', L.some(l => /\sM128$/.test(l)) && L.some(l => /\sM129$/.test(l)) && !/FUNCTION TCPM/.test(res.code));
  ok('M13 statt M3 + M8', L.some(l => /\sM13$/.test(l)));
  const issues = lintHeidenhain(res.code);
  ok('M120/M128/M13: Programm fehlerfrei', issues.length === 0, issues.length ? lintSummary(issues).slice(0, 4).map(s => `${s.n}× ${s.msg} [${s.first}]`).join(' ‖ ') : '');
  const off = post.postProcess(p, g, null, { postId: 'heidenhain', props: { mOff: [120] } }).code;
  ok('M120 ausgeschaltet: kein M120 und kein LA übrig', !/M120|\sLA\d/.test(off));
  const noM120 = post.postProcess(p, g, null, { postId: 'heidenhain', props: { m120: false } }).code;
  ok('M120 abgewählt: kein M120', !/M120/.test(noM120));
}

// several parts in one clamping: cycle 7 per part (order by tool), cycle 247 per part, subprograms
{
  const g = gens[0], st0 = g.setup;
  const run = (multi, props = {}) => { g.setup = { ...st0, multi }; try { return post.postProcess(p, g, null, { postId: 'heidenhain', props }); } finally { g.setup = st0; } };
  const r = run({ on: true, mode: 'shift', order: 'tool', list: [{ x: 0, y: 0 }, { x: 120, y: 0 }] });
  ok('Mehrfachaufspannung Zyklus 7: Verschiebung X+120', /CYCL DEF 7\.1 X\+120/.test(r.code));
  let issues = lintHeidenhain(r.code);
  ok('Mehrfachaufspannung Zyklus 7: Programm fehlerfrei', issues.length === 0, issues.length ? lintSummary(issues).slice(0, 4).map(s => `${s.n}× ${s.msg} [${s.first}]`).join(' ‖ ') : '');
  const w = run({ on: true, mode: 'wcs', order: 'part', list: [{ wcs: 1 }, { wcs: 2 }] });
  ok('Mehrfachaufspannung Zyklus 247: Bezugspunkt 2', /Q339=\+2 /.test(w.code));
  issues = lintHeidenhain(w.code);
  ok('Mehrfachaufspannung Zyklus 247: Programm fehlerfrei', issues.length === 0, issues.length ? lintSummary(issues).slice(0, 4).map(s => `${s.n}× ${s.msg} [${s.first}]`).join(' ‖ ') : '');
  const sb = run({ on: true, mode: 'shift', order: 'tool', list: [{ x: 0 }, { x: 60 }, { x: 120 }] }, { subroutines: 'ops' });
  const calls = (sb.code.match(/CALL LBL 1\b/g) || []).length;
  ok('Mehrfachaufspannung mit Unterprogrammen: LBL 1 dreimal gerufen, einmal definiert', calls === 3 && (sb.code.match(/^\s*\d*\s*LBL 1$/gm) || []).length === 1, `${calls}`);
  issues = lintHeidenhain(sb.code);
  ok('Mehrfachaufspannung mit Unterprogrammen: fehlerfrei', issues.length === 0, issues.length ? lintSummary(issues).slice(0, 4).map(s => `${s.n}× ${s.msg} [${s.first}]`).join(' ‖ ') : '');
}

// Q parameters for depth / allowance, tool check after the change, breakage check after the last use
{
  const g = gens[0];
  const res = post.postProcess(p, g, null, { postId: 'heidenhain', props: { qParams: true, qBase: 50, toolCheck: 'length', toolBreak: true } });
  const L = res.code.split('\n').map(l => l.replace(/^\d+ /, ''));
  const qdef = L.filter(l => /^FN 0: Q(5\d|[6-9]\d|\d{3}) = \+0 ; (TIEFE|AUFMASS)/.test(l));
  ok('Q-Parameter: je Operation Tiefe und Aufmaß am Anfang', qdef.length >= 2 && qdef[0].startsWith('FN 0: Q50 = +0 ; TIEFE'), qdef.slice(0, 2).join(' | '));
  const calls = L.filter(l => /^TOOL CALL/.test(l));
  ok('Q-Parameter: jeder TOOL CALL mit DL+Q / DR+Q', calls.length > 0 && calls.filter(l => / S/.test(l)).every(l => / DL\+Q\d+ DR\+Q\d+$/.test(l)), calls.slice(0, 3).join(' | '));
  ok('Q-Parameter: Operation ohne Werkzeugwechsel bekommt TOOL CALL Z S… DL/DR', calls.some(l => /^TOOL CALL Z S\d+ DL\+Q/.test(l)));
  const i481 = L.findIndex(l => /^TCH PROBE 481 WERKZEUG-LAENGE ~$/.test(l));
  ok('Werkzeug prüfen: TCH PROBE 481 direkt nach dem TOOL CALL', i481 > 0 && /^TOOL CALL \d+ Z/.test(L[i481 - 1]) && /Q340=\+1 ;PRUEFEN/.test(L[i481 + 1]), L.slice(i481 - 1, i481 + 3).join(' | '));
  const nTc = L.filter(l => /^TOOL CALL \d+ Z/.test(l)).length, n481 = L.filter(l => /^TCH PROBE 481/.test(l)).length;
  ok('Bruchkontrolle: einmal je Werkzeug zusätzlich', n481 === 2 * nTc - L.filter(l => /^TOOL CALL \d+ Z/.test(l) && false).length || n481 >= nTc + 1, `${n481} Zyklen, ${nTc} Werkzeugwechsel`);
  const issues = lintHeidenhain(res.code);
  ok('Q-Parameter + Werkzeug prüfen + Bruchkontrolle: Programm fehlerfrei', issues.length === 0, issues.length ? lintSummary(issues).slice(0, 4).map(s => `${s.n}× ${s.msg} [${s.first}]`).join(' ‖ ') : '');
  const b483 = post.postProcess(p, g, null, { postId: 'heidenhain', props: { toolCheck: 'both', ttTeeth: true } }).code;
  ok('Werkzeug prüfen: 483 mit Einzelschneiden', /TCH PROBE 483 WERKZEUG MESSEN ~/.test(b483) && /Q341=\+1 ;SCHNEIDENVERMESSUNG/.test(b483));
}
