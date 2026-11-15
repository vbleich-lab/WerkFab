// Bridge between the page and the desktop app: only what the updater needs.
const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('werkfabApp', {
  info: () => ipcRenderer.invoke('update:info'),
  check: () => ipcRenderer.invoke('update:check'),
  download: () => ipcRenderer.invoke('update:download'),
  install: () => ipcRenderer.invoke('update:install'),
  onState: fn => { ipcRenderer.on('update:state', (_e, s) => fn(s)); },
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
  // size of the whole interface (Einstellungen → Benutzeroberfläche)
  zoom: f => { try { webFrame.setZoomFactor(Math.max(0.5, Math.min(3, +f || 1))); } catch { /* keeps the size */ } },
});
