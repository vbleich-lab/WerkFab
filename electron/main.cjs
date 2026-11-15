// WerkFab desktop app: serves the app files from disk through a private
// "app://" scheme (ES modules, WebAssembly and fetch work like on a web server),
// so everything runs offline.
const { app, BrowserWindow, protocol, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const ROOT = path.resolve(__dirname, '..');
// window icon: .ico on Windows, .png elsewhere (macOS takes the icon of the app bundle)
const ICON = path.join(__dirname, process.platform === 'win32' ? 'icon.ico' : 'icon.png');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
};

// one window only; a second start brings the first one to the front
if (!app.requestSingleInstanceLock()) app.quit();

function createWindow() {
  const win = new BrowserWindow({
    width: 1600, height: 960, minWidth: 1000, minHeight: 640,
    title: 'WerkFab', backgroundColor: '#1c2025', show: false, autoHideMenuBar: true,
    icon: ICON,
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false, preload: path.join(__dirname, 'preload.cjs') },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  // SpaceMouse (WebHID): Electron has no device chooser, so 3Dconnexion devices are
  // picked and allowed automatically; other HID devices stay blocked.
  const ses = win.webContents.session;
  const isSpaceMouse = d => d.vendorId === 0x256f || (d.vendorId === 0x046d && /space|3dconnexion/i.test(d.name || d.productName || ''));
  ses.on('select-hid-device', (event, details, callback) => {
    event.preventDefault();
    const d = details.deviceList.find(isSpaceMouse) || details.deviceList[0];
    callback(d ? d.deviceId : '');
  });
  ses.setPermissionCheckHandler(() => true); // same as Electron's default, needed so WebHID is allowed
  ses.setDevicePermissionHandler(details => details.deviceType === 'hid' && isSpaceMouse(details.device));
  // print / setup sheet windows (about:blank) are allowed, web links open in the browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url || url === 'about:blank') return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: ICON } };
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); } });
  win.loadURL('app://openfab/index.html');
  return win;
}

// ---------- updates from the releases on GitHub ----------
// The installed Windows app and the Linux AppImage can replace themselves (electron-updater). The portable
// folder has no updater, and macOS only installs updates of apps signed with a paid certificate: there the
// page itself looks at the releases and opens the download page.
let updater = null;
try { updater = require('electron-updater').autoUpdater; } catch { /* portable build */ }
const canAutoUpdate = () => !!updater && app.isPackaged && process.platform !== 'darwin'
  && fs.existsSync(path.join(process.resourcesPath, 'app-update.yml')) && (process.platform !== 'linux' || !!process.env.APPIMAGE);

// full screen of the window the page asks for (the button in the head bar, F11)
// "An Slicer senden": the file goes to a folder of its own in the temp folder and is opened with the chosen program or
// the one the system uses for this kind of file
ipcMain.handle('slicer:open', async (_e, { name, data, exe }) => {
  try {
    const safe = String(name).replace(/[^\w\-. äöüÄÖÜß]/g, '_').slice(0, 120) || 'werkfab.3mf';
    if (!/\.(3mf|stl)$/i.test(safe)) return { error: 'only 3MF or STL' };
    const dir = path.join(app.getPath('temp'), 'werkfab-print');
    await fs.promises.mkdir(dir, { recursive: true });
    const file = path.join(dir, safe);
    await fs.promises.writeFile(file, Buffer.from(data));
    if (exe) {
      if (!fs.existsSync(exe) || !fs.statSync(exe).isFile() && !/\.app$/i.test(exe)) return { error: `program not found: ${exe}` };
      const { spawn } = require('child_process');
      const child = process.platform === 'darwin' && /\.app$/i.test(exe) ? spawn('open', ['-a', exe, file], { detached: true, stdio: 'ignore' }) : spawn(exe, [file], { detached: true, stdio: 'ignore' });
      child.on('error', () => {});
      child.unref();
    } else {
      const err = await shell.openPath(file);
      if (err) return { error: err };
    }
    return { ok: true, file };
  } catch (err) {
    return { error: String(err.message || err) };
  }
});
ipcMain.handle('slicer:pick', async e => {
  const w = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(w, { properties: ['openFile'], filters: process.platform === 'win32' ? [{ name: 'Programme', extensions: ['exe'] }] : [] });
  return r.canceled ? '' : r.filePaths[0] || '';
});
ipcMain.handle('win:fullscreen', (e, on) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (!w) return false;
  const v = on == null ? !w.isFullScreen() : !!on;
  w.setFullScreen(v);
  return v;
});

function setupUpdates(win) {
  const send = (state, data = {}) => { if (!win.isDestroyed()) win.webContents.send('update:state', { state, ...data }); };
  ipcMain.handle('update:info', () => ({ version: app.getVersion(), auto: canAutoUpdate(), platform: process.platform }));
  if (!canAutoUpdate()) return;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = true;
  updater.allowPrerelease = /-/.test(app.getVersion());
  updater.on('update-available', i => send('available', { version: i.version }));
  updater.on('update-not-available', () => send('none'));
  updater.on('download-progress', p => send('progress', { percent: Math.round(p.percent) }));
  updater.on('update-downloaded', i => send('ready', { version: i.version }));
  updater.on('error', e => send('error', { message: String((e && e.message) || e).split('\n')[0].slice(0, 200) }));
  ipcMain.handle('update:check', () => updater.checkForUpdates().then(() => true).catch(() => false));
  ipcMain.handle('update:download', () => updater.downloadUpdate().then(() => true).catch(() => false));
  ipcMain.handle('update:install', () => { updater.quitAndInstall(false, true); });
}

// ---------- AI agents: the Model Context Protocol on a local port ----------
// Off until the user switches it on (Einstellungen → KI-Agenten). The port listens on 127.0.0.1 only and wants
// the key as "Authorization: Bearer …"; pages of a browser are turned away (Origin), so is a foreign Host name.
// Every tool call goes to the page (js/agent.js) and works on the open design – this process touches no file
// for an agent. WERKFAB_AGENT=1 switches it on for one start (tests), WERKFAB_AGENT_PORT / _TOKEN set the rest.
function setupAgent(win) {
  const file = path.join(app.getPath('userData'), 'agent.json');
  let cfg = { on: false, port: 0, token: '' };
  try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* first start */ }
  if (process.env.WERKFAB_AGENT === '1') cfg.on = true;
  if (+process.env.WERKFAB_AGENT_PORT > 0) cfg.port = +process.env.WERKFAB_AGENT_PORT;
  if (process.env.WERKFAB_AGENT_TOKEN) cfg.token = process.env.WERKFAB_AGENT_TOKEN;
  const fromEnv = process.env.WERKFAB_AGENT === '1' || +process.env.WERKFAB_AGENT_PORT > 0 || !!process.env.WERKFAB_AGENT_TOKEN; // (a test start leaves the stored choice alone)
  const save = () => { if (fromEnv) return; try { fs.writeFileSync(file, JSON.stringify({ on: cfg.on, port: cfg.port, token: cfg.token }), { mode: 0o600 }); } catch { /* stays for this run */ } };
  let server = null, port = 0, error = '', seq = 0;
  const waiting = new Map();
  ipcMain.on('agent:reply', (e, id, r) => { if (e.sender !== win.webContents) return; const w = waiting.get(id); if (w) { waiting.delete(id); clearTimeout(w.timer); w.done(r || { ok: false, error: 'no answer' }); } });
  const ask = (name, args) => new Promise(done => {
    if (win.isDestroyed()) return done({ ok: false, error: 'The window is closed' });
    const id = ++seq;
    waiting.set(id, { done, timer: setTimeout(() => { waiting.delete(id); done({ ok: false, error: 'WerkFab did not answer in time' }); }, 300000) });
    win.webContents.send('agent:call', { id, name, args });
  });
  const VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
  const rpc = async m => {
    if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return { jsonrpc: '2.0', id: m?.id ?? null, error: { code: -32600, message: 'Invalid request' } };
    if (m.id === undefined) return null; // a notification
    const ok = result => ({ jsonrpc: '2.0', id: m.id, result });
    if (m.method === 'initialize') return ok({ protocolVersion: VERSIONS.includes(m.params?.protocolVersion) ? m.params.protocolVersion : VERSIONS[0], capabilities: { tools: {} }, serverInfo: { name: 'werkfab', title: 'WerkFab', version: app.getVersion() },
      instructions: 'WerkFab CAD/CAM: you work on the design that is open in the user\'s window. Call the tool "guide" first.' });
    if (m.method === 'ping') return ok({});
    if (m.method === 'tools/list') { const r = await ask('__tools'); return r.ok ? ok({ tools: r.result }) : { jsonrpc: '2.0', id: m.id, error: { code: -32603, message: r.error } }; }
    if (m.method === 'tools/call') {
      const r = await ask(String(m.params?.name || ''), m.params?.arguments || {});
      if (!r.ok) return ok({ content: [{ type: 'text', text: String(r.error) }], isError: true });
      const img = r.result && typeof r.result.image === 'string' && /^data:(image\/[a-z]+);base64,(.*)$/s.exec(r.result.image);
      // (a picture, and what else the tool says about it as text)
      if (img) { const { image, ...rest } = r.result; return ok({ content: [{ type: 'image', data: img[2], mimeType: img[1] }, ...(Object.keys(rest).length ? [{ type: 'text', text: JSON.stringify(rest, null, 1) }] : [])] }); }
      return ok({ content: [{ type: 'text', text: typeof r.result === 'string' ? r.result : JSON.stringify(r.result) }] });
    }
    return { jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'Method not found' } };
  };
  const sameKey = given => { const a = Buffer.from(String(given || '')), b = Buffer.from('Bearer ' + cfg.token); return a.length === b.length && crypto.timingSafeEqual(a, b); };
  const handle = (req, res) => {
    const send = (code, body, head = {}) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store', ...head }); res.end(body === undefined ? '' : JSON.stringify(body)); };
    const host = String(req.headers.host || '').toLowerCase();
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return send(403, { error: 'forbidden' });
    if (req.headers.origin) return send(403, { error: 'forbidden' }); // a web page – agents send no Origin
    if (new URL(req.url, 'http://x').pathname !== '/mcp') return send(404, { error: 'not found' });
    if (!sameKey(req.headers.authorization)) return send(401, { error: 'unauthorized' }, { 'www-authenticate': 'Bearer' });
    if (req.method !== 'POST') return send(405, { error: 'POST only' }, { allow: 'POST' });
    const parts = [];
    let size = 0;
    req.on('data', d => { size += d.length; if (size > 32 * 1024 * 1024) { send(413, { error: 'too large' }); req.destroy(); } else parts.push(d); });
    req.on('end', async () => {
      if (res.writableEnded) return;
      let msg;
      try { msg = JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { return send(400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
      try {
        if (Array.isArray(msg)) { const out = []; for (const m of msg) { const r = await rpc(m); if (r) out.push(r); } return out.length ? send(200, out) : send(202); }
        const r = await rpc(msg);
        return r ? send(200, r) : send(202);
      } catch (err) { return send(500, { jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32603, message: String(err?.message || err) } }); }
    });
  };
  const stop = () => new Promise(done => { if (!server) return done(); const s = server; server = null; port = 0; s.close(() => done()); s.closeAllConnections?.(); });
  const start = () => new Promise(done => {
    error = '';
    if (!cfg.token) { cfg.token = crypto.randomBytes(24).toString('hex'); save(); }
    const listen = p => {
      const s = http.createServer(handle);
      s.once('error', err => { if (p && err.code === 'EADDRINUSE') return listen(0); error = String(err.message || err); done(); });
      s.listen(p, '127.0.0.1', () => { server = s; port = s.address().port; if (cfg.port !== port) { cfg.port = port; save(); } done(); });
    };
    listen(cfg.port || 0);
  });
  const state = () => ({ on: cfg.on, running: !!server, url: server ? `http://127.0.0.1:${port}/mcp` : '', token: cfg.on ? cfg.token : '', error });
  const mine = e => e.sender === win.webContents;
  ipcMain.handle('agent:info', e => (mine(e) ? state() : null));
  ipcMain.handle('agent:set', async (e, on) => { if (!mine(e)) return null; cfg.on = !!on; save(); await stop(); if (cfg.on) await start(); return state(); });
  ipcMain.handle('agent:token', async e => { if (!mine(e)) return null; cfg.token = crypto.randomBytes(24).toString('hex'); save(); return state(); });
  app.on('before-quit', () => { stop(); });
  if (cfg.on) start();
}

app.on('second-instance', () => {
  const [w] = BrowserWindow.getAllWindows();
  if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
});

app.whenReady().then(() => {
  protocol.handle('app', async req => {
    let rel = decodeURIComponent(new URL(req.url).pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT + path.sep)) return new Response('Forbidden', { status: 403 });
    try {
      const data = await fs.promises.readFile(file);
      return new Response(data, { headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' } });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
  // no menu bar on Windows and Linux; macOS needs its app and edit menus (quit, copy, paste, undo by keyboard)
  Menu.setApplicationMenu(process.platform === 'darwin' ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]) : null);
  const win = createWindow();
  setupUpdates(win);
  setupAgent(win);
});

app.on('window-all-closed', () => app.quit());
