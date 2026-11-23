// Local document store (data panel, but on this computer):
// every design is kept in IndexedDB with its saved versions and a thumbnail.
import { withBlobs, takeBlobs } from './interop.js';
const DB = 'openfab.docs';
let dbp = null;
function db() {
  return (dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('docs', { keyPath: 'id' });
      r.result.createObjectStore('versions'); // key "docId@v" -> project JSON
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}
const tx = async (stores, mode, fn) => {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(stores, mode);
    let out;
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    out = fn(...[].concat(stores).map(s => t.objectStore(s)));
  });
};
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function listDocs() {
  const d = await db();
  const all = await req(d.transaction('docs').objectStore('docs').getAll());
  return all.sort((a, b) => b.updated - a.updated);
}

export async function getDoc(id) {
  const d = await db();
  return req(d.transaction('docs').objectStore('docs').get(id));
}

// keeps the current state of a design (no new version)
export async function storeCurrent(project, thumb) {
  if (!project?.docId) return;
  const old = (await getDoc(project.docId)) || { id: project.docId, versions: [], created: Date.now() };
  const rec = { ...old, name: project.name, updated: Date.now(), current: JSON.stringify(project), ...(thumb ? { thumb } : {}) };
  await tx('docs', 'readwrite', s => s.put(rec));
  mirrorSoon(rec.id, project);
  return rec;
}

// "Speichern": a new version with a description
export async function saveVersion(project, note, thumb) {
  const rec = await storeCurrent(project, thumb);
  const v = (rec.versions.at(-1)?.v || 0) + 1;
  rec.versions = [...rec.versions, { v, date: Date.now(), note: note || '', thumb: thumb || rec.thumb || '' }];
  await tx(['docs', 'versions'], 'readwrite', (docs, vers) => { docs.put(rec); vers.put(rec.current, `${rec.id}@${v}`); });
  return v;
}

export async function loadCurrent(id) {
  const rec = await getDoc(id);
  return rec ? JSON.parse(rec.current) : null;
}

export async function loadVersion(id, v) {
  const d = await db();
  const s = await req(d.transaction('versions').objectStore('versions').get(`${id}@${v}`));
  return s ? JSON.parse(s) : null;
}

export async function renameDoc(id, name) {
  const rec = await getDoc(id);
  if (!rec) return;
  rec.name = name;
  const p = JSON.parse(rec.current);
  p.name = name;
  rec.current = JSON.stringify(p);
  await tx('docs', 'readwrite', s => s.put(rec));
  await mirrorNow(id, p);
}

export async function deleteDoc(id) {
  const rec = await getDoc(id);
  clearTimeout(mirrorTimers.get(id)); mirrorTimers.delete(id);
  await chain;
  if (dirState === 'ok' && rec?.file && rec.dir === dir.name) await dir.removeEntry(rec.file).catch(() => {});
  await tx(['docs', 'versions'], 'readwrite', (docs, vers) => {
    docs.delete(id);
    for (const v of rec?.versions || []) vers.delete(`${id}@${v.v}`);
  });
}

// small preview image of the current view
export function thumbnail(renderer, scene, camera, bg = '#3a434d', w = 240, h = 160) {
  try {
    renderer.render(scene, camera);
    const src = renderer.domElement;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    const k = Math.max(w / src.width, h / src.height);
    const sw = w / k, sh = h / k;
    g.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.8);
  } catch { return ''; }
}

// ---------- storage folder ----------
// The designs can also live in a folder of the computer (a network drive, a synced folder, a USB stick): every
// design is a file "<name>.ofab" there, written again after each change. Files put into the folder from outside
// show up as designs. The saved versions (Strg+S) stay in the program's own store.
let dir = null, dirState = 'none'; // none | ok | locked (the browser asks again for the permission after a restart)
const fsDb = () => new Promise((res, rej) => { const r = indexedDB.open('openfab.fs', 1); r.onupgradeneeded = () => r.result.createObjectStore('h'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
export const folderSupported = () => typeof window !== 'undefined' && !!window.showDirectoryPicker;
export const folderInfo = () => ({ state: dirState, name: dir?.name || '' });
export async function initFolder() {
  try {
    const d = await fsDb();
    dir = (await req(d.transaction('h').objectStore('h').get('docs'))) || null;
    dirState = !dir ? 'none' : (await dir.queryPermission({ mode: 'readwrite' })) === 'granted' ? 'ok' : 'locked';
  } catch { dir = null; dirState = 'none'; }
  return folderInfo();
}
// needs a click of the user: the browser shows its question
export async function unlockFolder() {
  if (!dir) return folderInfo();
  try { dirState = (await dir.requestPermission({ mode: 'readwrite' })) === 'granted' ? 'ok' : 'locked'; } catch { dirState = 'locked'; }
  return folderInfo();
}
export async function setFolder(handle) {
  await flushFolder();
  dir = handle || null;
  dirState = dir ? 'ok' : 'none';
  try { const d = await fsDb(); d.transaction('h', 'readwrite').objectStore('h').put(dir, 'docs'); } catch { /* not remembered */ }
  return folderInfo();
}
const safeFile = name => (String(name || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/[. ]+$/, '').trim() || 'Unbenannt').slice(0, 80);
const fileText = project => JSON.stringify(withBlobs(project), null, 1);
async function writeFile(name, text) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}
// one write after the other, so two saves never open the same file at once
let chain = Promise.resolve();
const queued = fn => (chain = chain.then(fn, fn));
const mirrorTimers = new Map();
function mirrorSoon(id, project) {
  if (dirState !== 'ok') return;
  clearTimeout(mirrorTimers.get(id));
  mirrorTimers.set(id, setTimeout(() => { mirrorTimers.delete(id); mirrorNow(id, project).catch(() => {}); }, 2000));
}
// writes the file of one design; a new name moves the file
function mirrorNow(id, project) {
  if (dirState !== 'ok') return Promise.resolve();
  return queued(async () => {
    const rec = await getDoc(id);
    if (!rec || dirState !== 'ok') return;
    const p = project || JSON.parse(rec.current);
    const here = rec.dir === dir.name ? rec.file : null;
    const base = safeFile(rec.name);
    let name = here;
    if (!here || here.replace(/( \(\d+\))?\.ofab$/i, '') !== base) {
      const taken = new Set((await listDocs()).filter(r => r.id !== id && r.dir === dir.name && r.file).map(r => r.file.toLowerCase()));
      name = base + '.ofab';
      for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${base} (${i}).ofab`;
    }
    try {
      await writeFile(name, fileText(p));
      if (here && here !== name) await dir.removeEntry(here).catch(() => {});
      const now = await getDoc(id);
      if (now) await tx('docs', 'readwrite', s => s.put({ ...now, file: name, dir: dir.name, synced: Date.now() }));
    } catch (err) { if (err?.name === 'NotAllowedError') dirState = 'locked'; }
  });
}
// writes everything that is still waiting (before the window closes or the folder changes)
export async function flushFolder() {
  const ids = [...mirrorTimers.keys()];
  for (const id of ids) { clearTimeout(mirrorTimers.get(id)); mirrorTimers.delete(id); await mirrorNow(id).catch(() => {}); }
  await chain;
}
// Compares the folder with the designs: new files become designs, files changed from outside are read again,
// designs without a file are written. activeId: the open design (never replaced from its file).
// Returns { added, updated, written }.
export async function syncFolder(activeId) {
  const out = { added: 0, updated: 0, written: 0 };
  if (dirState !== 'ok') return out;
  await flushFolder();
  const files = new Map();
  try {
    for await (const [name, hd] of dir.entries()) if (hd.kind === 'file' && /\.ofab$/i.test(name)) files.set(name, hd);
  } catch (err) { if (err?.name === 'NotAllowedError') dirState = 'locked'; return out; }
  const recs = await listDocs();
  const put = rec => tx('docs', 'readwrite', s => s.put(rec));
  const owner = name => recs.find(r => r.dir === dir.name && r.file === name);
  for (const [name, hd] of files) {
    try {
      const file = await hd.getFile();
      const rec = owner(name);
      if (rec) {
        // changed outside the program (another computer through a synced folder, a copy put over it)
        if (rec.id !== activeId && file.lastModified > (rec.synced || rec.updated) + 3000) {
          const p = JSON.parse(await file.text());
          if (!Array.isArray(p.features)) continue;
          await takeBlobs(p);
          p.docId = rec.id;
          Object.assign(rec, { name: p.name || rec.name, current: JSON.stringify(p), updated: file.lastModified, synced: Date.now() });
          await put(rec);
          out.updated++;
        }
        continue;
      }
      const p = JSON.parse(await file.text());
      if (!Array.isArray(p.features)) continue;
      await takeBlobs(p);
      const known = p.docId && recs.find(r => r.id === p.docId);
      if (known && !(known.dir === dir.name && known.file && files.has(known.file))) {
        // the file of a design that is already here: they belong together, the newer state counts
        if (known.id !== activeId && file.lastModified > known.updated + 3000) Object.assign(known, { name: p.name || known.name, current: JSON.stringify(p), updated: file.lastModified });
        Object.assign(known, { file: name, dir: dir.name, synced: Date.now() });
        await put(known);
        continue;
      }
      if (known || !p.docId) p.docId = 'doc_' + Math.random().toString(36).slice(2, 9); // a copy of a design, or a file without a number
      if (!p.name || known) p.name = name.replace(/\.ofab$/i, '');
      const fresh = { id: p.docId, name: p.name, versions: [], created: file.lastModified, updated: file.lastModified, current: JSON.stringify(p), file: name, dir: dir.name, synced: Date.now() };
      await put(fresh);
      recs.push(fresh);
      out.added++;
    } catch { /* not a design file: left alone */ }
  }
  for (const rec of recs) {
    if (rec.dir === dir.name && rec.file && files.has(rec.file)) continue;
    await put({ ...rec, file: null, dir: null });
    await mirrorNow(rec.id);
    out.written++;
  }
  return out;
}
