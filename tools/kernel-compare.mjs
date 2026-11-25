// Compares the geometry kernels on whole designs: every design is computed with OpenCascade and with the Rust
// kernel (which leaves a design to OpenCascade when it cannot build one of its steps); body count and volumes must agree.
// Starts the app from the sources with a fresh profile. Run: node tools/kernel-compare.mjs [only]
// only: part of a design name (e.g. "Dreh"), to run a single design.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const exe = createRequire(import.meta.url)('electron');
const only = process.argv[2] || '';
const port = 9300 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), 'werkfab-kern-'));
const cwd = new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1');
const child = spawn(exe, [cwd, `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`], { stdio: 'ignore', cwd });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (n, c, x = '') => { results.push(!!c); console.log((c ? 'OK   ' : 'FEHL ') + n + (x === '' ? '' : '  ' + x)); };
const cases = JSON.parse(readFileSync(new URL('./kernel-cases.json', import.meta.url), 'utf8'));

let ws;
try {
  let target = null;
  for (let i = 0; i < 80 && !target; i++) { await sleep(500); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch { /* not up yet */ } }
  if (!target) throw new Error('Das Programm hat kein Fenster geöffnet');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('keine Verbindung zur Seite')); });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } };
  const call = (method, params = {}) => new Promise(res => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expr => {
    const r = await call('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
    if (r?.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.split('\n')[0] || r.exceptionDetails.text);
    return r?.result?.value;
  };
  let ready = false;
  for (let i = 0; i < 160 && !ready; i++) { await sleep(500); try { ready = await evaluate(`return !!(window.werkfabAgent && document.querySelectorAll('.tbtn').length > 20)`); } catch { /* loading */ } }
  if (!ready) throw new Error('Das Programm ist nicht bereit');
  await evaluate(`
    const K = await import('/js/kern/index.js'), M = await import('/js/model.js'), E = await import('/js/example.js'), P = await import('/js/params.js'), S = await import('/js/state.js');
    await K.getKernel('rust').load();
    const base = () => { const p = S.newProject(); p.features = []; return p; };
    window.__kern = {
      designs: { Beispielprojekt: E.exampleProject, Drehteil: E.exampleTurning, 'Frästestteil': E.exampleMilling, Konstruktionstestteil: E.exampleDesign },
      async run(project, id) {
        await K.setActiveKernel(id);
        M.clearTimelineCache();
        const t0 = performance.now();
        const r = M.regenerate(P.resolveProject(JSON.parse(JSON.stringify(project))));
        const vols = r.bodies.map(b => { try { return M.bodyProps(b).volume; } catch { return NaN; } });
        return { ms: Math.round(performance.now() - t0), bodies: r.bodies.length, vols, errors: Object.values(r.errors).map(String), kernel: r.kernel, byOcc: r.byOcc || '', kinds: r.bodies.map(b => (b.shape.wrapped ? 'occ' : b.shape.kernel)) };
      },
      fromSteps(steps) { const p = base(); p.features = steps; return p; },
    };
    return true`);
  const compare = async (name, expr) => {
    if (only && !name.toLowerCase().includes(only.toLowerCase())) return;
    let a, b;
    try {
      a = await evaluate(`return await window.__kern.run(${expr}, 'occ')`);
      b = await evaluate(`return await window.__kern.run(${expr}, 'rust')`);
    } catch (err) { return ok(name, false, String(err.message || err)); }
    const sum = v => v.reduce((s, x) => s + x, 0);
    const va = sum(a.vols), vb = sum(b.vols);
    const same = a.bodies === b.bodies && a.bodies > 0 && Math.abs(va - vb) <= 0.001 * Math.max(va, 1) && b.errors.length <= a.errors.length;
    ok(name, same, `OpenCascade: ${a.bodies} Körper, ${va.toFixed(1)} mm³, ${a.ms} ms${a.errors.length ? `, ${a.errors.length} Fehler` : ''} · Rust-Kern: ${b.bodies} Körper, ${vb.toFixed(1)} mm³, ${b.ms} ms, ${b.kernel === 'rust' ? 'im Rust-Kern gerechnet' : `mit OpenCascade gerechnet (wegen „${b.byOcc}“)`}${b.errors.length ? `, Fehler: ${b.errors[0].slice(0, 120)}` : ''}`);
  };
  for (const c of cases) await compare(c.name, `window.__kern.fromSteps(${JSON.stringify(c.steps)})`);
  for (const name of ['Beispielprojekt', 'Drehteil', 'Frästestteil', 'Konstruktionstestteil']) await compare(name, `window.__kern.designs[${JSON.stringify(name)}]()`);
  await evaluate(`await (await import('/js/kern/index.js')).setActiveKernel('occ'); return true`);
} catch (err) {
  ok('Ablauf', false, String(err.message || err));
} finally {
  try { ws?.close(); } catch { /* closed */ }
  child.kill();
  await sleep(800);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* still locked */ }
}
const bad = results.filter(x => !x).length;
console.log(bad ? `\n${bad} von ${results.length} Prüfungen fehlgeschlagen` : `\nAlle ${results.length} Prüfungen bestanden`);
process.exit(bad ? 1 : 0);
