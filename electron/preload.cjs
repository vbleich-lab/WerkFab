// Bridge between the page and the desktop app: only what the updater needs.
const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('werkfabApp', {
  info: () => ipcRenderer.invoke('update:info'),
  check: () => ipcRenderer.invoke('update:check'),
  download: () => ipcRenderer.invoke('update:download'),
  install: () => ipcRenderer.invoke('update:install'),
  onState: fn => { ipcRenderer.on('update:state', (_e, s) => fn(s)); },
  // files the system handed over (double click on a file, "Open with"): take() answers [{ name, data }] once
  files: {
    take: () => ipcRenderer.invoke('file:take'),
    onOpen: fn => { ipcRenderer.on('file:open', () => fn()); },
  },
  // full screen of the window (on: true / false, nothing = the other state); answers the state it is in then
  fullscreen: on => ipcRenderer.invoke('win:fullscreen', on),
  // AI agents (Einstellungen → KI-Agenten): the local port of the desktop app and the calls it passes on
  agent: {
    info: () => ipcRenderer.invoke('agent:info'),
    set: on => ipcRenderer.invoke('agent:set', !!on),
    newToken: () => ipcRenderer.invoke('agent:token'),
    onCall: fn => { ipcRenderer.on('agent:call', (_e, c) => fn(c)); },
    reply: (id, r) => ipcRenderer.send('agent:reply', id, r),
  },
  // 3D printing: a file for the slicer is written to the temp folder and opened (exe: chosen program, else the system's)
  slicer: {
    open: ({ name, data, exe }) => ipcRenderer.invoke('slicer:open', { name: String(name || 'werkfab.3mf'), data, exe: String(exe || '') }),
    pick: () => ipcRenderer.invoke('slicer:pick'),
  },
  // NC program to the machine (Heidenhain, LSV2 like TNCremo): send({ host, port, password, dir, name, text }), test({ host, port, password })
  machine: {
    send: c => ipcRenderer.invoke('machine:send', c),
    test: c => ipcRenderer.invoke('machine:test', c),
    get: c => ipcRenderer.invoke('machine:get', c),
    onProgress: fn => { ipcRenderer.removeAllListeners('machine:progress'); ipcRenderer.on('machine:progress', (_e, f) => fn(f)); },
  },
  // an HTML page as PDF file (save dialog, then opened): savePdf({ html, name, landscape })
  savePdf: c => ipcRenderer.invoke('pdf:save', c),
  // size of the whole interface (Einstellungen → Benutzeroberfläche)
  zoom: f => { try { webFrame.setZoomFactor(Math.max(0.5, Math.min(3, +f || 1))); } catch { /* keeps the size */ } },
});
