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
