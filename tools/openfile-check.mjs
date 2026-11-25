// Checks that the desktop app opens the files the system hands to it: started with a file (double click,
// "Open with") and handed to the running program by a second start. Starts the app from the sources (or a
// packaged executable) with a fresh profile, so nothing of the user's settings is touched.
// Run: node tools/openfile-check.mjs [path to the executable]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const exe = process.argv[2] ? resolve(process.argv[2]) : createRequire(import.meta.url)('electron');
const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'werkfab-open-')), files = mkdtempSync(join(tmpdir(), 'werkfab-files-'));
const cwd = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1');
const base = [...(process.argv[2] ? [] : [cwd]), `--user-data-dir=${profile}`];
// a tetrahedron as text STL
const tri = (a, b, c) => `facet normal 0 0 0\nouter loop\nvertex ${a}\nvertex ${b}\nvertex ${c}\nendloop\nendfacet\n`;
const P = ['0 0 0', '20 0 0', '0 20 0', '0 0 20'];
const stl = join(files, 'Keil Probe.stl');
writeFileSync(stl, 'solid t\n' + tri(P[0], P[2], P[1]) + tri(P[0], P[1], P[3]) + tri(P[1], P[2], P[3]) + tri(P[2], P[0], P[3]) + 'endsolid t\n');
const child = spawn(exe, [...base, `--remote-debugging-port=${port}`, stl], { stdio: 'ignore', cwd });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (n, c, x = '') => { results.push(!!c); console.log((c ? 'OK   ' : 'FEHL ') + n + (x === '' ? '' : '  ' + x)); };

let ws;
try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) { await sleep(500); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch { /* not up yet */ } }
  if (!target) throw new Error('Das Programm hat kein Fenster geöffnet');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('keine Verbindung zur Seite')); });
  let seq = 0;
  const pending = new Map(), errors = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description?.split('\n')[0] || m.params.exceptionDetails?.text);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  };
  const call = (method, params = {}) => new Promise(res => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expr => {
    const r = await call('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
    if (r?.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.split('\n')[0] || r.exceptionDetails.text);
    return r?.result?.value;
  };
  await call('Runtime.enable');
  const project = `JSON.parse(localStorage.getItem('openfab.project.v1') || '{}')`;
  const until = async (expr, n = 120) => { for (let i = 0; i < n; i++) { await sleep(500); try { const v = await evaluate(expr); if (v) return v; } catch { /* loading */ } } return null; };

  // ---- started with a file ----
  const first = await until(`const p = ${project}; const f = (p.features || []).find(x => x.type === 'meshimport'); return f ? { name: p.name, file: f.file, n: p.features.length } : null`);
  ok('Start mit einer STL-Datei: als Netz im neuen Design', first?.file === 'Keil Probe.stl' && first.name === 'Keil Probe', JSON.stringify(first));
  ok('Start mit einer Datei: keine Startseite davor', await evaluate(`return !document.querySelector('#startPage')`));

  // ---- a second start hands its file to the running program ----
  const p = await evaluate(`return ${project}`);
  p.name = 'Zweitstart';
  delete p.docId;
  const ofab = join(files, 'Zweitstart.ofab');
  writeFileSync(ofab, JSON.stringify(p));
  const second = spawn(exe, [...base, 'Zweitstart.ofab'], { stdio: 'ignore', cwd: files });
  const gone = await new Promise(res => { const t = setTimeout(() => res(false), 30000); second.on('exit', () => { clearTimeout(t); res(true); }); });
  ok('Zweiter Start beendet sich selbst', gone);
  const name = await until(`const p = ${project}; return p.name === 'Zweitstart' ? p.name : null`, 40);
  ok('Zweiter Start mit einer .ofab-Datei (relativer Pfad): Design im laufenden Programm geöffnet', name === 'Zweitstart', String(name));
  const tabs = await evaluate(`return [...document.querySelectorAll('#docTabs .doc-tab')].map(x => x.title + ' ' + x.textContent.trim()).join(' | ') + ' | ' + document.querySelector('#projectName').textContent`);
  ok('Beide Designs als Reiter', /Keil Probe/.test(tabs) && /Zweitstart/.test(tabs), tabs.slice(0, 120));
  ok('Keine Fehler in der Seite', !errors.length, errors.slice(0, 3).join(' · '));
} catch (err) {
  ok('Ablauf', false, String(err.message || err));
} finally {
  try { ws?.close(); } catch { /* closed */ }
  child.kill();
  await sleep(800);
  for (const d of [profile, files]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* still locked */ } }
}
const bad = results.filter(x => !x).length;
console.log(bad ? `\n${bad} von ${results.length} Prüfungen fehlgeschlagen` : `\nAlle ${results.length} Prüfungen bestanden`);
process.exit(bad ? 1 : 0);
