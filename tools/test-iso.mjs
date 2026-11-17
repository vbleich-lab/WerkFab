// G-code posts for milling (Fanuc / ISO, Okuma OSP-M, LinuxCNC, GRBL, Sinumerik 840D): the program with every
// kind of output from tools/lib/postcase.mjs, written with several option sets and checked block by block
// with tools/lib/iso-lint.mjs.
// Run: npm run test:iso
import './lib/node-env.mjs';
import fs from 'fs';
const { partBodies } = await import('./lib/testpart.mjs');
const cam = await import('../js/cam.js');
const post = await import('../js/post.js');
const { lintIso } = await import('./lib/iso-lint.mjs');
const { lintSummary } = await import('./lib/hh-lint.mjs');
const { project, OPS } = await import('./lib/postcase.mjs');

const ok = (n, c, x = '') => { console.log((c ? 'OK   ' : 'FEHL ') + n + '  ' + x); if (!c) process.exitCode = 1; };
const dumpDir = process.argv[2]; // optional: write the programs there
const p = project();
p.cam.ops = OPS;
const gens = p.cam.setups.map(st => { const g = cam.generateSetup(p, partBodies(), st, null, null); g.setup = st; return g; });

const POSTS = { fanuc: 'fanuc', 'okuma-mill': 'okuma', linuxcnc: 'linuxcnc', grbl: 'grbl', sinumerik: 'sinumerik' };
const VARIANTS = {
  Standard: {},
  'Satznummern + M1 + Vorwahl + Glättung + XY-Referenz': { lineNumbers: true, optionalStop: true, preloadTool: true, smoothing: 'auto', homeXY: true },
  'G28-Rückzug': { safeRetract: 'g28' },
  'G53-Rückzug + Notizen': { safeRetract: 'g53', showNotes: true },
  'ohne Zyklen, Bohrbilder, Bögen, Kommentare': { cycles: false, drillPatterns: false, arcs: false, structureComments: false, writeToolList: false, probeCycles: false },
};
for (const [id, dialect] of Object.entries(POSTS)) {
  for (const [vname, props] of Object.entries(VARIANTS)) {
    gens.forEach(g => {
      const name = `${id} / ${vname} / ${g.setup.name}`;
      let res;
      try { res = post.postProcess(p, g, null, { postId: id, props }); } catch (e) { ok(`${name}: läuft`, false, e.stack.split('\n').slice(0, 3).join(' | ')); return; }
      if (dumpDir) fs.writeFileSync(`${dumpDir}/${id}_${Object.keys(VARIANTS).indexOf(vname)}_${g.setup.id}.nc`, res.code);
      const issues = lintIso(res.code, { dialect });
      ok(`${name}: G-Code fehlerfrei`, issues.length === 0, issues.length ? lintSummary(issues).slice(0, 6).map(s => `${s.n}× ${s.msg} [${s.first}]`).join(' ‖ ') : `${res.lines} Sätze`);
      const bad = res.code.match(/NaN|undefined|Infinity|\bnull\b|\[object|\{[A-Za-z0-9]+!?\}/);
      ok(`${name}: keine ungültigen Werte oder offenen Platzhalter`, !bad, bad ? `„${bad[0]}“ in Zeile ${res.code.slice(0, bad.index).split('\n').length}` : '');
    });
  }
}

// M functions switched off in the post properties: left out of every block, comments untouched
{
  const fan = post.findPost(p, 'fanuc'), codes = post.postMCodes(fan, {});
  ok('M-Befehle: Liste enthält M3, M5, M6, M8, M9, M30', [3, 5, 6, 8, 9, 30].every(n => codes.includes(n)), codes.map(n => 'M' + n).join(' '));
  const g = gens[0];
  const full = post.postProcess(p, g, null, { postId: 'fanuc', coolant: true, props: { optionalStop: true } }).code;
  const res = post.postProcess(p, g, null, { postId: 'fanuc', coolant: true, props: { optionalStop: true, mOff: [1, 8, 9] } }).code;
  const blocks = c => c.split('\n').filter(l => !/^\s*\(/.test(l));
  ok('M-Befehle: vorher M1, M8 und M9 im Programm', blocks(full).some(l => /(^|\s)M0?8\b/.test(l)) && blocks(full).some(l => /(^|\s)M0?1\b/.test(l)));
  ok('M-Befehle: ausgeschaltete M1, M8, M9 fehlen', !blocks(res).some(l => /(^|\s)M0?[189](?![0-9])/.test(l)));
  { const miss = ['M3', 'M5', 'M6', 'M30'].filter(m => !new RegExp('(^|\\s)' + m + '(?![0-9])', 'm').test(res)); ok('M-Befehle: übrige bleiben (M3, M5, M6, M30)', !miss.length, miss.join(' ')); }
  ok('M-Befehle: keine leeren Sätze', !res.split('\n').some(l => /^N?\d*\s*$/.test(l) && l !== '' ) );
  const issues = lintIso(res, { dialect: 'fanuc' });
  ok('M-Befehle: G-Code fehlerfrei', issues.length === 0, issues.length ? lintSummary(issues).slice(0, 4).map(s => `${s.n}× ${s.msg} [${s.first}]`).join(' ‖ ') : '');
  const s2 = post.postProcess(p, g, null, { postId: 'fanuc', props: { mOff: [3, 5] } }).code;
  ok('M-Befehle: S-Wort bleibt ohne M3', /\bS\d+/.test(s2) && !/(^|\s)M0?3(?![0-9])/.test(s2.split('\n').filter(l => !l.startsWith('(')).join('\n')));
}

// several parts in one clamping: G52 shift per part (order by tool) and own datums G54/G55 (part by part)
{
  const g = gens[0], st0 = g.setup;
  const run = multi => { g.setup = { ...st0, multi }; try { return post.postProcess(p, g, null, { postId: 'fanuc' }); } finally { g.setup = st0; } };
  const one = post.postProcess(p, g, null, { postId: 'fanuc' });
  const r = run({ on: true, mode: 'shift', order: 'tool', list: [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 0, y: 90 }] });
  const L = r.code.split('\n');
  const tc = c => c.split('\n').filter(l => /(^|\s)M0?6(?![0-9])/.test(l)).length;
  ok('Mehrfachaufspannung G52: Verschiebungen je Teil', L.some(l => /^(N\d+ )?G52 X120\.? Y0\.? Z0\.?$/.test(l)) && L.some(l => /^(N\d+ )?G52 X0\.? Y90\.? Z0\.?$/.test(l)), L.filter(l => /G52/.test(l)).slice(0, 4).join(' | '));
  ok('Mehrfachaufspannung G52: am Ende zurück auf 0', /G52 X0\.? Y0\.? Z0\.?[\s\S]*M30/.test(r.code) && !/G52 X120[\s\S]*$/.test(r.code.split(/G52 X0\.? Y0\.? Z0\.?\n/).pop()));
  ok('Mehrfachaufspannung nach Werkzeug: Werkzeugwechsel nicht mehr als einzeln', tc(r.code) === tc(one.code), `${tc(r.code)} / ${tc(one.code)}`);
  ok('Mehrfachaufspannung: Laufzeit etwa dreifach', r.time > one.time * 2.5, `${Math.round(one.time)} → ${Math.round(r.time)} s`);
  let issues = lintIso(r.code, { dialect: 'fanuc' });
  ok('Mehrfachaufspannung G52: G-Code fehlerfrei', issues.length === 0, issues.length ? lintSummary(issues).slice(0, 4).map(s => `${s.n}× ${s.msg} [${s.first}]`).join(' ‖ ') : '');
  const w = run({ on: true, mode: 'wcs', order: 'part', list: [{ wcs: 1 }, { wcs: 2 }] });
  ok('Mehrfachaufspannung G54/G55 je Teil: G55 vorhanden', /(^|\s)G55(\s|$)/m.test(w.code));
  ok('Mehrfachaufspannung Teil für Teil: Werkzeugwechsel doppelt', tc(w.code) >= 2 * tc(one.code) - 1, `${tc(w.code)} / ${tc(one.code)}`);
  issues = lintIso(w.code, { dialect: 'fanuc' });
  ok('Mehrfachaufspannung G54/G55: G-Code fehlerfrei', issues.length === 0, issues.length ? lintSummary(issues).slice(0, 4).map(s => `${s.n}× ${s.msg} [${s.first}]`).join(' ‖ ') : '');
  const gr = (() => { g.setup = { ...st0, multi: { on: true, mode: 'shift', list: [{ x: 0 }, { x: 50 }] } }; try { return post.postProcess(p, g, null, { postId: 'grbl' }); } finally { g.setup = st0; } })();
  ok('Mehrfachaufspannung GRBL mit Verschiebung: Warnung, ein Teil', gr.warnings.some(x => /Mehrfachaufspannung/.test(x)) && !/G52/.test(gr.code));
}

// serial numbers: "#" in the sketch text becomes the number, one number per part of the clamping
{
  const nodeFetch = globalThis.fetch;
  globalThis.fetch = async (u, o) => (String(u).startsWith('file:') ? new Response(fs.readFileSync(new URL(String(u)))) : nodeFetch(u, o));
  await (await import('../js/fonts.js')).loadFonts();
  const ps = project();
  ps.features.push({ id: 'skSn', type: 'sketch', name: 'Seriennummer', plane: { o: [0, 0, 10], x: [1, 0, 0], n: [0, 0, 1] }, entities: [{ id: 'tx', type: 'text', text: 'SN-##', x: 20, y: 30, size: 6, font: 'mono' }] });
  const sn = { setup: 'S1', enabled: true, entities: 'all', id: 'sn', name: 'Seriennummer', type: 'trace', tool: 'T5', sketch: 'skSn', depth: 0.2, serialOn: true, serialStart: 7, serialStep: 1 };
  ps.cam.ops = [OPS.find(x => x.id === 'fa'), sn];
  const st = ps.cam.setups[0];
  ok('Seriennummer: Nummern je Teil', cam.serialText('SN-####', 7) === 'SN-0007' && cam.serialNumbers(sn, { multi: { on: true, list: [{}, {}, {}] } }).join() === '7,8,9');
  const gen = multi => { ps.cam.setups[0] = { ...st, multi }; const g = cam.generateSetup(ps, partBodies(), ps.cam.setups[0], null, null); g.setup = ps.cam.setups[0]; return g; };
  const g1 = gen(undefined), r1 = g1.results.get('sn');
  ok('Seriennummer: Bahn ohne Mehrfachaufspannung', !r1.error && r1.moves.length > 20 && !r1.parts && r1.serial.join() === '7', r1.error || '');
  const multi = { on: true, mode: 'shift', order: 'tool', list: [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 0, y: 90 }] };
  const g3 = gen(multi), r3 = g3.results.get('sn');
  ok('Seriennummer: eigene Bahn je Teil', r3.parts?.length === 3 && JSON.stringify(r3.parts[0].moves) !== JSON.stringify(r3.parts[1].moves), r3.error || '');
  for (const order of ['tool', 'part']) {
    g3.setup = { ...g3.setup, multi: { ...multi, order } };
    const code = post.postProcess(ps, g3, null, { postId: 'fanuc' }).code;
    const nums = [...code.matchAll(/SERIENNUMMER (\d+)/gi)].map(m => m[1]);
    ok(`Seriennummer (${order}): 7, 8, 9 je Teil`, nums.join() === '7,8,9', nums.join());
    const issues = lintIso(code, { dialect: 'fanuc' });
    ok(`Seriennummer (${order}): G-Code fehlerfrei`, issues.length === 0, issues.length ? lintSummary(issues).slice(0, 4).map(s => `${s.n}× ${s.msg} [${s.first}]`).join(' ‖ ') : '');
  }
  const { lintHeidenhain } = await import('./lib/hh-lint.mjs');
  g3.setup = { ...g3.setup, multi };
  const hc = post.postProcess(ps, g3, null, { postId: 'heidenhain', props: { subroutines: 'ops' } }).code;
  const lb = [...hc.matchAll(/^\d+ LBL (\d+)/gm)].length;
  ok('Seriennummer Heidenhain: je Teil ein eigenes Unterprogramm', lb >= 4, lb + ' LBL');
  const hi = lintHeidenhain(hc);
  ok('Seriennummer Heidenhain: Programm fehlerfrei', hi.length === 0, hi.length ? lintSummary(hi).slice(0, 4).map(s => `${s.n}× ${s.msg} [${s.first}]`).join(' ‖ ') : '');
  ps.features.find(f => f.id === 'skSn').entities[0].text = 'ABC';
  const ge = gen(undefined).results.get('sn');
  ok('Seriennummer: Fehler ohne # im Text', /#/.test(ge.error || ''), ge.error || '');
  globalThis.fetch = nodeFetch;
}

// ISO fit: milled to the middle of the tolerance zone (H7 hole a little larger, g6 pin a little smaller)
{
  const pf = project();
  const bo = OPS.find(x => x.id === 'bo');
  const run = extra => { pf.cam.ops = [{ ...bo, ...extra }]; const g = cam.generateSetup(pf, partBodies(), pf.cam.setups[0], null, null); return g.results.get(bo.id); };
  const maxR = r => { const c = [100, 60]; return Math.max(...r.moves.filter(m => m.t !== 'r' && Number.isFinite(m.x) && Math.hypot(m.x - c[0], m.y - c[1]) < 6).map(m => Math.hypot(m.x - c[0], m.y - c[1]))); };
  const r0 = run({}), r1 = run({ fit: 'H7' });
  const d = maxR(r1) - maxR(r0);
  ok('Passung H7 Ø10: Bohrung im Radius 0,00375 mm größer (Ø +0,0075)', !r1.error && Math.abs(d - 0.00375) < 0.0006, `${d.toFixed(5)} ${r1.error || ''}`);
  ok('Passung: Wellenpassung an Bohrung → Fehler', /Kleinbuchstaben/.test(run({ fit: 'g6' }).error || ''));
  const fo = cam.fitOffset({ type: 'contour', side: 'outside', fit: 'g6', fitSize: 25 }, pf);
  ok('Passung g6 Ø25 Zapfen: 0,00675 mm weniger Aufmaß', Math.abs(fo.radial + 0.00675) < 1e-9, String(fo.radial));
}
