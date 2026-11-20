// Clicks through what only the desktop app has: the AI-agent interface (MCP on a local port), Python scripts,
// "An Slicer senden" and full screen. Starts the app from the sources (or a packaged executable) with a fresh
// profile, so nothing of the user's settings is touched. The window shows up for about a minute.
// Run: node tools/desktop-check.mjs [path to the executable]
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, statSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';

const exe = process.argv[2] || createRequire(import.meta.url)('electron');
const port = 9300 + Math.floor(Math.random() * 500), mcpPort = 9800 + Math.floor(Math.random() * 150), token = randomBytes(16).toString('hex');
const profile = mkdtempSync(join(tmpdir(), 'werkfab-desk-'));
const args = [...(process.argv[2] ? [] : ['.']), `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`];
const child = spawn(exe, args, { stdio: 'ignore', cwd: new URL('..', import.meta.url).pathname.replace(/^\/([A-Z]:)/i, '$1'),
  env: { ...process.env, WERKFAB_AGENT: '1', WERKFAB_AGENT_PORT: String(mcpPort), WERKFAB_AGENT_TOKEN: token } });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const ok = (n, c, x = '') => { results.push(!!c); console.log((c ? 'OK   ' : 'FEHL ') + n + (x === '' ? '' : '  ' + x)); };

let ws;
try {
  // ---- the page ----
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
  const evaluate = async (expr, timeout = 120000) => {
    const r = await call('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true, timeout });
    if (r?.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.split('\n')[0] || r.exceptionDetails.text);
    return r?.result?.value;
  };
  await call('Runtime.enable');
  let ready = false;
  for (let i = 0; i < 120 && !ready; i++) { await sleep(500); try { ready = await evaluate(`return !!(window.werkfabAgent && document.querySelectorAll('.tbtn').length > 20)`); } catch { /* loading */ } }
  ok('Fenster mit Werkzeugleiste', ready);
  await evaluate(`localStorage.setItem('openfab.lang', 'de'); return true`);

  // ---- MCP from outside, as an agent does ----
  const url = `http://127.0.0.1:${mcpPort}/mcp`;
  const rpc = async (method, params, head = {}) => {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...head }, body: JSON.stringify({ jsonrpc: '2.0', id: ++seq, method, params }) });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  const tool = async (name, a = {}) => { const r = await rpc('tools/call', { name, arguments: a }); const c = r.body?.result?.content?.[0]; return { error: r.body?.result?.isError, value: c?.type === 'text' ? (() => { try { return JSON.parse(c.text); } catch { return c.text; } })() : c }; };
  const info = await evaluate(`return await window.werkfabApp.agent.info()`);
  ok('MCP: Port läuft', info?.running && info.url === url, info?.url);
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'check', version: '1' } });
  ok('MCP: initialize', init.status === 200 && init.body?.result?.serverInfo?.name === 'werkfab', init.body?.result?.protocolVersion);
  const list = await rpc('tools/list', {});
  ok('MCP: Werkzeugliste', list.body?.result?.tools?.length > 30, `${list.body?.result?.tools?.length} Werkzeuge`);
  await tool('new_design', {});
  await tool('add_features', { features: [{ id: 'b', type: 'box', x: 0, y: 0, z: 0, w: 40, d: 30, h: 20, op: 'new' }] });
  const m = (await tool('get_model', {})).value;
  ok('MCP: Quader über den Port gebaut, Volumen 24 000 mm³', Math.abs((m?.bodies?.[0]?.volume || 0) - 24000) < 1e-3, m?.bodies?.[0]?.volume);
  const shot = await rpc('tools/call', { name: 'screenshot', arguments: {} });
  ok('MCP: Bildschirmfoto als Bild', shot.body?.result?.content?.[0]?.type === 'image', shot.body?.result?.content?.[0]?.mimeType || shot.body?.result?.content?.[0]?.text?.slice(0, 80));
  const noKey = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  ok('MCP: ohne Schlüssel abgewiesen (401)', noKey.status === 401);
  const web = await rpc('ping', {}, { origin: 'https://example.invalid' });
  ok('MCP: Aufruf aus einer Webseite abgewiesen (403)', web.status === 403);

  // ---- Python ----
  const py = await evaluate(`
    const F = await import('./js/fusionapi.js');
    const [e] = await F.importPythonFiles([new File([F.EXAMPLE_SCRIPT], 'WerkfabCheck.py')]);
    const t0 = performance.now(), r = await F.runEntry(e), ms = Math.round(performance.now() - t0);
    const md = await window.werkfabAgent.call('get_model', {});
    F.showOutput();
    return { r, ms, bodies: md.bodies.map(b => b.volume), out: document.querySelector('#pyOut pre')?.textContent || '' };`, 300000);
  ok('Python: Beispielskript läuft (Pyodide in der App)', py && !py.r?.error, py?.r?.error || `${py?.ms} ms`);
  const v = py?.bodies?.at(-1) || 0;
  ok('Python: Platte mit Verrundungen und vier Bohrungen entsteht', v > 37000 && v < 39500, Math.round(v));
  ok('Python: Ausgabe von app.log erscheint', /Volumen/.test(py?.out || ''), (py?.out || '').split('\n').filter(Boolean).slice(-1)[0]);

  // ---- "An Slicer senden" (a program that does not exist: the file is written, the app says it cannot open it) ----
  const missing = join(profile, 'kein-slicer.exe');
  const sl = await evaluate(`
    const S = await import('./js/settings.js');
    S.saveSettings({ slicerPath: ${JSON.stringify(missing)}, slicerFormat: '3mf' });
    const r = await window.werkfabApp.slicer.open({ name: 'check.3mf', data: new Uint8Array([80, 75, 3, 4]), exe: ${JSON.stringify(missing)} });
    // the app's own button (tab NETZ)
    const tab = [...document.querySelectorAll('button, .tab, [role=tab]')].find(b => b.textContent.trim().toUpperCase() === 'NETZ');
    tab?.click(); await new Promise(r => setTimeout(r, 400));
    const btn = document.querySelector('.tbtn[data-icon="mesh_slicer"]');
    // collect every status text: a later message (e.g. the update check) may replace it within the wait
    const seen = [], el = document.querySelector('#status'), mo = el && new MutationObserver(() => seen.push(el.textContent));
    mo?.observe(el, { childList: true, characterData: true, subtree: true });
    btn?.click(); await new Promise(r => setTimeout(r, 3000)); mo?.disconnect();
    return { r, button: !!btn, status: seen.find(t => /Slicer/.test(t)) || el?.textContent || '' };`);
  ok('Slicer: Datei landet im Temp-Ordner', sl?.r?.error && /program not found/.test(sl.r.error), sl?.r?.error);
  ok('Slicer: Knopf „An Slicer senden“ vorhanden', sl?.button);
  ok('Slicer: verständliche Meldung, wenn das Programm fehlt', /Slicer-Programm nicht gefunden/.test(sl?.status || ''), sl?.status);
  const dir = join(tmpdir(), 'werkfab-print'), files = existsSync(dir) ? readdirSync(dir).filter(f => /\.3mf$/i.test(f)).map(f => ({ f, t: statSync(join(dir, f)).mtimeMs, s: statSync(join(dir, f)).size })).sort((a, b) => b.t - a.t) : [];
  const latest = files.find(x => x.f !== 'check.3mf');
  rmSync(join(dir, 'check.3mf'), { force: true });
  ok('Slicer: 3MF der sichtbaren Körper geschrieben (ein Zip)', latest && latest.s > 500 && readFileSync(join(dir, latest.f)).subarray(0, 2).toString() === 'PK', latest ? `${latest.f}, ${latest.s} Byte` : 'keine Datei');

  // ---- full screen ----
  const fs1 = await evaluate(`return await window.werkfabApp.fullscreen(true)`);
  await sleep(800);
  const big = await evaluate(`return [innerWidth, innerHeight, screen.width, screen.height]`);
  const fs2 = await evaluate(`return await window.werkfabApp.fullscreen(false)`);
  ok('Vollbild an', fs1 === true, big.join(' × '));
  ok('Vollbild aus', fs2 === false);

  ok('Keine Skriptfehler auf der Seite', !errors.length, errors.slice(0, 3).join(' | '));
} catch (err) {
  ok('Ablauf', false, err.message);
} finally {
  try { ws?.close(); } catch { /* gone */ }
  child.kill();
}
const bad = results.filter(r => !r).length;
console.log(bad ? `\n${bad} von ${results.length} Prüfungen fehlgeschlagen` : `\nAlle ${results.length} Prüfungen bestanden`);
process.exit(bad ? 1 : 0);
