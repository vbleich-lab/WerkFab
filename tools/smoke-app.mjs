// Starts a packaged desktop app and checks that the program really comes up: page loaded, toolbar built,
// 3D view there, no script error. Used after packaging (release workflow) on Windows, Linux and macOS.
// It is started with a file, the way the system does on a double click or "Open with": that file must open.
// Run: node tools/smoke-app.mjs <path to the executable> [arguments for the program …]
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exe = process.argv[2];
if (!exe) { console.error('Aufruf: node tools/smoke-app.mjs <Programmdatei>'); process.exit(2); }
const port = 9300 + Math.floor(Math.random() * 500);
const tmp = mkdtempSync(join(tmpdir(), 'werkfab-smoke-'));
// a small mesh file (a tetrahedron) the program is started with
const handed = join(tmp, 'smoke-teil.stl'), P = [[0, 0, 0], [20, 0, 0], [0, 20, 0], [0, 0, 20]];
writeFileSync(handed, ['solid smoke', ...[[0, 2, 1], [0, 1, 3], [1, 2, 3], [0, 3, 2]].flatMap(f => [' facet normal 0 0 0', '  outer loop', ...f.map(i => `   vertex ${P[i].join(' ')}`), '  endloop', ' endfacet']), 'endsolid smoke', ''].join('\n'));
const args = [...process.argv.slice(3), `--remote-debugging-port=${port}`, `--user-data-dir=${join(tmp, 'profil')}`];
if (process.platform === 'linux') args.push('--no-sandbox', '--disable-gpu');
args.push(handed);
const child = spawn(exe, args, { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = { exe, started: false };
let ok = false;
try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    await sleep(500);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch { /* not up yet */ }
  }
  if (!target) throw new Error('Das Programm hat kein Fenster geöffnet');
  out.started = true;
  out.url = target.url;
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('keine Verbindung zur Seite')); });
  let seq = 0;
  const errors = [];
  const pending = new Map();
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description?.split('\n')[0] || m.params.exceptionDetails?.text);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  };
  const call = (method, params = {}) => new Promise(res => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  await call('Runtime.enable');
  const expr = `JSON.stringify({ title: document.title, buttons: document.querySelectorAll('.tbtn').length, canvas: !!document.querySelector('#viewport canvas'), bridge: typeof window.werkfabApp, project: document.querySelector('#projectName')?.textContent || '', bodies: window.werkfabTest?.meshes ? window.werkfabTest.bodies().length + window.werkfabTest.meshes().length : -1, info: window.werkfabApp ? await window.werkfabApp.info() : null })`;
  // wait until the toolbar is there (the geometry kernel loads for a few seconds on a slow machine)
  for (let i = 0; i < 45; i++) {
    await sleep(2000);
    const r = await call('Runtime.evaluate', { expression: `(async () => ${expr})()`, awaitPromise: true, returnByValue: true });
    out.page = JSON.parse(r?.result?.value || '{}');
    if (out.page.buttons > 10 && out.page.canvas && out.page.project === 'smoke-teil' && out.page.bodies > 0) break;
  }
  out.errors = errors;
  ok = out.page.buttons > 10 && out.page.canvas && out.page.bridge === 'object' && !errors.length;
  out.opened = out.page.project === 'smoke-teil' && out.page.bodies > 0;
  ws.close();
} catch (e) { out.error = String(e.message || e); }
child.kill();
console.log((ok ? 'OK   ' : 'FEHL ') + 'Programm startet und zeigt die Oberfläche  ' + JSON.stringify(out));
console.log((out.opened ? 'OK   ' : 'FEHL ') + 'Eine übergebene Datei wird geöffnet (Doppelklick, „Öffnen mit“)');
process.exit(ok && out.opened ? 0 : 1);
