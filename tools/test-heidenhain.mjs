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
      ok('Standard: Bohrbilder Raster und Lochkreis (221, 220)', /CYCL DEF 221 /.test(c) && /CYCL DEF 220 /.test(c) && /Q241=6 /.test(c));
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
