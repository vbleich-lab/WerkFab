// Python scripts and add-ins written for the "adsk" interface (scripts with run(context), add-ins with
// run/stop and toolbar commands). Python is Pyodide (CPython in WebAssembly), loaded on first use; the
// package js/fusion/adsk maps the interface onto WerkFab features. Everything a script calls is answered
// synchronously here: the model is rebuilt on the spot when a script asks for bodies, faces or edges.
import * as THREE from 'three';
import { t } from './i18n.js';
import { profileItems } from './model.js';
import { buildRegions } from './profiles.js';
import { planeFromFace } from './plane.js';
import { paramScope } from './params.js';

const PY_FILES = ['adsk/__init__.py', 'adsk/core.py', 'adsk/fusion.py', 'adsk/cam.py', '_wf_runtime.py'];
const STORE = 'openfab.pyScripts.v1';
const LIB = '/home/pyodide/wf', USER = '/home/pyodide/scripts';
const MAX_FILE = 512 * 1024, MAX_TOTAL = 4 * 1024 * 1024;

let env = null, py = null, loading = null, depth = 0, before = null;
const buttons = new Map();   // command id → { id, name, tooltip, owner }
const running = new Set();   // keys of running add-ins
const outLines = [];

export function initFusion(e) { env = e; }
export const fusionButtons = () => [...buttons.values()];
export const pythonLoaded = () => !!py;

// ---------------------------------------------------------------- stored scripts
export function storedScripts() {
  try { const v = JSON.parse(localStorage.getItem(STORE) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function saveScripts(list) {
  try { localStorage.setItem(STORE, JSON.stringify(list)); return true; } catch { alert(t('Die Skripte passen nicht mehr in den Speicher des Browsers – ein Skript entfernen.')); return false; }
}
const ident = s => { let r = String(s).replace(/[^A-Za-z0-9_]/g, '_'); if (!/^[A-Za-z_]/.test(r)) r = 'm_' + r; return r; };
function upsert(entry) {
  const list = storedScripts(), i = list.findIndex(x => x.key === entry.key);
  if (i >= 0) list[i] = entry; else list.push(entry);
  return saveScripts(list);
}
function guessKind(files, main) {
  for (const [p, txt] of Object.entries(files)) {
    if (!p.endsWith('.manifest')) continue;
    try { const m = JSON.parse(txt); if (/addin/i.test(m.type || '')) return 'addin'; if (/script/i.test(m.type || '')) return 'script'; } catch { /* no JSON */ }
  }
  return Object.values(files).some(x => /addButtonDefinition|commandCreated/.test(x)) || /def\s+stop\s*\(/.test(files[main + '.py'] || '') && /addCommand/.test(Object.values(files).join('\n')) ? 'addin' : 'script';
}
function makeEntry(root, files) {
  const pyRoot = Object.keys(files).filter(p => p.endsWith('.py') && !p.includes('/'));
  const main = files[`${root}.py`] != null ? root : (pyRoot[0] || '').replace(/\.py$/, '');
  if (!main) throw new Error(t('Im Ordner liegt keine Python-Datei'));
  const key = 'py_' + Math.random().toString(36).slice(2, 9);
  const manifest = Object.entries(files).find(([p]) => p.endsWith('.manifest'));
  let desc = '';
  try { desc = manifest ? JSON.parse(manifest[1]).description?.['']?.toString() || JSON.parse(manifest[1]).description || '' : ''; } catch { /* ignore */ }
  return { key, name: root, pkg: ident('u_' + root) + '_' + key.slice(3), main, kind: guessKind(files, main), files, runOnStart: false, desc: typeof desc === 'string' ? desc : '' };
}
export async function importPythonFiles(fileList) {
  const all = [...fileList];
  if (!all.length) return [];
  const groups = new Map();
  let total = 0;
  for (const f of all) {
    const rel = f.webkitRelativePath || f.name;
    if (!/\.(py|manifest|json|txt)$/i.test(rel) || /(^|\/)(__pycache__|\.git)\//.test(rel)) continue;
    if (f.size > MAX_FILE) throw new Error(t(`Datei zu groß: ${rel}`));
    total += f.size;
    if (total > MAX_TOTAL) throw new Error(t('Zu viele Dateien – höchstens 4 MB Text'));
    const parts = rel.split('/');
    const root = parts.length > 1 ? parts[0] : rel.replace(/\.py$/i, '');
    const inner = parts.length > 1 ? parts.slice(1).join('/') : rel;
    if (!groups.has(root)) groups.set(root, {});
    groups.get(root)[inner] = await f.text();
  }
  const out = [];
  for (const [root, files] of groups) {
    if (!Object.keys(files).some(p => p.endsWith('.py'))) continue;
    const old = storedScripts().find(x => x.name === root);
    const e = makeEntry(root, files);
    if (old) { e.key = old.key; e.pkg = old.pkg; e.runOnStart = old.runOnStart; }
    if (upsert(e)) out.push(e);
  }
  return out;
}

// ---------------------------------------------------------------- output window
function outPanel() {
  let el = document.getElementById('pyOut');
  if (el) return el;
  const pre = env.h('pre', { class: 'py-lines' });
  el = env.h('div', { id: 'pyOut', class: 'py-out' },
    env.h('div', { class: 'py-head' }, env.h('span', null, t('Python-Ausgabe')), env.h('div', { class: 'spacer' }),
      env.h('button', { onclick: () => { outLines.length = 0; pre.textContent = ''; } }, t('Leeren')),
      env.h('button', { onclick: () => el.remove(), title: t('Schließen') }, '✕')),
    pre);
  document.body.append(el);
  pre.textContent = outLines.join('\n');
  return el;
}
export function showOutput() { outPanel(); }
function log(text, level = 0) {
  const s = String(text ?? '');
  for (const line of s.split('\n')) outLines.push((level >= 2 ? '✖ ' : level === 1 ? '⚠ ' : '') + line);
  while (outLines.length > 2000) outLines.shift();
  const el = outPanel(), pre = el.querySelector('.py-lines');
  pre.textContent = outLines.join('\n');
  pre.scrollTop = pre.scrollHeight;
}

// ---------------------------------------------------------------- one undo step per run
function begin() {
  if (depth++ === 0) before = JSON.stringify(env.state.project);
}
function end() {
  if (--depth > 0) return;
  const now = JSON.stringify(env.state.project);
  if (now !== before) {
    const after = JSON.parse(now);
    env.state.project = JSON.parse(before);
    env.commit(p => { for (const k of Object.keys(p)) delete p[k]; Object.assign(p, after); });
  }
  before = null;
}
function session(fn) { begin(); try { return fn(); } finally { end(); } }

// ---------------------------------------------------------------- model helpers
const r6 = v => +(+v).toFixed(6) + 0;
const arr = v => [r6(v.x), r6(v.y), r6(v.z)];
const faceCache = new WeakMap(), edgeCache = new WeakMap();
function bodyById(id) {
  const b = env.modelSync().bodies.find(x => x.id === id);
  if (!b) throw new Error(t(`Kein Körper mit der Kennung „${id}“`));
  return b;
}
function faceInfo(body) {
  if (faceCache.has(body)) return faceCache.get(body);
  const g = body.geometry, pos = g.attributes.position, idx = g.index, faceOf = body.faceOf;
  const n = faceOf ? Math.max(-1, ...faceOf) + 1 : 0, acc = [];
  for (let i = 0; i < n; i++) acc.push({ area: 0, nrm: new THREE.Vector3(), best: 0, pt: null, pts: [] });
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const tri = idx ? idx.count / 3 : pos.count / 3;
  for (let k = 0; k < tri; k++) {
    const f = faceOf[k];
    if (!(f >= 0)) continue;
    const ia = idx ? idx.getX(3 * k) : 3 * k, ib = idx ? idx.getX(3 * k + 1) : 3 * k + 1, ic = idx ? idx.getX(3 * k + 2) : 3 * k + 2;
    a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
    const cr = e1.subVectors(b, a).cross(e2.subVectors(c, a)), ar = cr.length() / 2, F = acc[f];
    F.area += ar;
    F.nrm.add(cr);
    if (ar > F.best) { F.best = ar; F.pt = a.clone().add(b).add(c).multiplyScalar(1 / 3); F.n1 = cr.clone().normalize(); }
    if (F.pts.length < 400) F.pts.push([a.clone(), cr.clone().normalize()]);
  }
  const shapeFaces = (() => { try { return body.shape?.faces || []; } catch { return []; } })();
  const out = acc.map((F, i) => {
    let type = 'other';
    try { const gt = String(shapeFaces[i]?.geomType || ''); type = gt === 'PLANE' ? 'plane' : gt.startsWith('CYLIND') ? 'cylinder' : gt === 'CONE' ? 'cone' : gt === 'SPHERE' ? 'sphere' : gt === 'TORUS' ? 'torus' : 'other'; } catch { /* other kernel */ }
    const nn = F.nrm.length() > 1e-12 ? F.nrm.clone().normalize() : (F.n1 || new THREE.Vector3(0, 0, 1));
    if (type === 'other' && F.nrm.length() > 0.999 * 2 * F.area) type = 'plane';
    const r = { i, type, area: r6(F.area), point: F.pt ? arr(F.pt) : [0, 0, 0], normal: arr(type === 'plane' ? nn : F.n1 || nn) };
    if (type === 'cylinder' && F.pts.length > 2) {
      // axis ⟂ to all normals; radius from two points with different normals
      const [p0, n0] = F.pts[0];
      let q = null;
      for (const [p, nq] of F.pts) if (nq.angleTo(n0) > 0.3) { q = [p, nq]; break; }
      if (q) {
        const ax = n0.clone().cross(q[1]).normalize(), perp = v => v.clone().sub(ax.clone().multiplyScalar(v.dot(ax)));
        const P = perp(p0.clone().sub(q[0])), N = perp(n0.clone().sub(q[1])), rad = P.dot(N) / N.dot(N);
        r.axis = arr(ax); r.radius = r6(Math.abs(rad)); r.center = arr(p0.clone().sub(n0.clone().multiplyScalar(rad)));
      }
    }
    return r;
  });
  faceCache.set(body, out);
  return out;
}
function edgeInfo(body) {
  if (edgeCache.has(body)) return edgeCache.get(body);
  let edges = [];
  try { edges = body.shape?.edges || []; } catch { edges = []; }
  const out = edges.map((e, i) => {
    const r = { i, type: 'other', mid: env.edgeMidpoint(body, i) };
    try {
      const s = e.startPoint, en = e.endPoint;
      r.start = [r6(s.x), r6(s.y), r6(s.z)]; r.end = [r6(en.x), r6(en.y), r6(en.z)];
      r.length = r6(e.length);
      const gt = String(e.geomType || '');
      if (gt === 'LINE') r.type = 'line';
      else if (gt === 'CIRCLE') {
        const P = q => new THREE.Vector3(q.x, q.y, q.z), A = P(e.pointAt(0)), B = P(e.pointAt(0.33)), C = P(e.pointAt(0.66));
        const ab = B.clone().sub(A), ac = C.clone().sub(A), nn = ab.clone().cross(ac), d = 2 * nn.lengthSq();
        if (d > 1e-18) {
          const cc = A.clone().add(nn.clone().cross(ab).multiplyScalar(ac.lengthSq()).add(ac.clone().cross(nn).multiplyScalar(ab.lengthSq())).multiplyScalar(1 / d));
          r.type = 'circle'; r.center = arr(cc); r.radius = r6(cc.distanceTo(A)); r.axis = arr(nn.normalize());
        }
      }
    } catch { /* other kernel: midpoint only */ }
    return r;
  });
  edgeCache.set(body, out);
  return out;
}
function signedArea(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }
function centroidOf(p) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < p.length; i++) { const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length], c = x0 * y1 - x1 * y0; a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c; }
  return Math.abs(a) > 1e-12 ? [cx / (3 * a), cy / (3 * a)] : p[0];
}
function sketchProfiles(id) {
  const sk = env.resolved().features.find(f => f.id === id && f.type === 'sketch');
  if (!sk) throw new Error(t(`Keine Skizze mit der Kennung „${id}“`));
  const { regions } = buildRegions(profileItems(sk, null));
  return regions.map(rg => {
    const ao = Math.abs(signedArea(rg.outer)), holes = rg.holes.map(hp => [Math.abs(signedArea(hp)), centroidOf(hp)]);
    const co = centroidOf(rg.outer), area = ao - holes.reduce((s, q) => s + q[0], 0);
    const cx = (co[0] * ao - holes.reduce((s, q) => s + q[0] * q[1][0], 0)) / (area || 1), cy = (co[1] * ao - holes.reduce((s, q) => s + q[0] * q[1][1], 0)) / (area || 1);
    const xs = rg.outer.map(q => q[0]), ys = rg.outer.map(q => q[1]);
    let per = 0;
    for (const loop of [rg.outer, ...rg.holes]) for (let i = 0; i < loop.length; i++) { const a = loop[i], b = loop[(i + 1) % loop.length]; per += Math.hypot(b[0] - a[0], b[1] - a[1]); }
    return { ids: [rg.id, ...rg.holeIds], area: r6(area), centroid: [r6(cx), r6(cy)], min: [Math.min(...xs), Math.min(...ys)], max: [Math.max(...xs), Math.max(...ys)], perimeter: r6(per) };
  });
}

// ---------------------------------------------------------------- calls from Python
const HOST = {
  project: () => ({ name: env.state.project.name, features: env.state.project.features.map(f => ({ id: f.id, type: f.type, name: f.name })) }),
  addFeature({ feature: f }) {
    if (!f || !f.type) throw new Error('feature');
    const g = structuredClone(f);
    g.id ||= env.uid(g.type.slice(0, 2));
    g.name ||= g.type;
    if (g.type === 'sketch') g.entities ||= [];
    const p = env.state.project;
    p.features.push(g);
    if (env.state.rollback != null) env.state.rollback = null;
    return { id: g.id };
  },
  updateFeature({ id, patch }) {
    const f = env.state.project.features.find(q => q.id === id);
    if (!f) throw new Error(t(`Kein Feature mit der Kennung „${id}“`));
    for (const [k, v] of Object.entries(patch || {})) { if (v === null) delete f[k]; else f[k] = structuredClone(v); }
    return { ok: true };
  },
  deleteFeature({ id }) { const p = env.state.project; p.features = p.features.filter(f => f.id !== id); return { ok: true }; },
  model() {
    const m = env.modelSync();
    const out = { bodies: m.bodies.map(b => env.bodyInfo(b)), errors: m.errors || {} };
    if (m.box && !m.box.isEmpty()) { out.min = arr(m.box.min); out.max = arr(m.box.max); }
    return out;
  },
  faces: ({ body }) => faceInfo(bodyById(body)),
  edges: ({ body }) => edgeInfo(bodyById(body)),
  bodyProps: ({ body }) => env.bodyInfo(bodyById(body)),
  profiles: ({ sketch }) => sketchProfiles(sketch),
  facePlane: ({ point, normal }) => planeFromFace(new THREE.Vector3(...point), new THREE.Vector3(...normal)),
  params() {
    const p = env.state.project, sc = paramScope(p);
    return (p.params || []).map(q => ({ name: q.name, expr: String(q.expr), value: Number.isFinite(sc[q.name]) ? sc[q.name] : 0, unit: q.unit || 'mm', comment: q.comment || '' }));
  },
  setParam({ name, expr, comment, unit }) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name || '')) throw new Error(t(`„${name}“ ist kein gültiger Parametername`));
    const p = env.state.project;
    p.params ||= [];
    let q = p.params.find(x => x.name === name);
    if (!q) p.params.push((q = { name, expr: String(expr) }));
    q.expr = String(expr);
    if (comment) q.comment = comment;
    if (unit && unit !== 'mm') q.unit = unit;
    return { ok: true };
  },
  deleteParam({ name }) { const p = env.state.project; p.params = (p.params || []).filter(x => x.name !== name); return { ok: true }; },
  setBodyName({ id, name }) { const p = env.state.project; p.bodyMeta ||= {}; (p.bodyMeta[id] ||= {}).name = name; return { ok: true }; },
  setBodyVisible({ id, visible }) { if (visible) env.state.hiddenBodies.delete(id); else env.state.hiddenBodies.add(id); return { ok: true }; },
  docName: () => env.state.project.name,
  setDocName({ name }) { env.state.project.name = String(name).slice(0, 80); return { ok: true }; },
  message({ text, title }) { alert(title ? `${title}\n\n${text}` : text); return { ok: true }; },
  confirm: ({ text, title }) => confirm(title ? `${title}\n\n${text}` : text),
  input: ({ text, title, value }) => prompt(title ? `${title}\n\n${text}` : text, value ?? ''),
  log({ text, level }) { log(text, level || 0); return { ok: true }; },
  fit() { setTimeout(() => env.fitView(), 50); return { ok: true }; },
  export({ format, file, body, binary }) { env.exportFile(format, body, file, binary); return { ok: true }; },
  newDocument() {
    if (!confirm(t('Das Skript möchte ein neues Design anlegen. Das offene Design wird dafür geleert (mit Rückgängig zurückzuholen). Fortfahren?'))) return false;
    const p = env.state.project;
    p.features = []; p.params = []; p.bodyMeta = {}; delete p.assembly; if (p.cam) p.cam.ops = [];
    return true;
  },
  addButton({ id, name, tooltip, panel, owner }) { buttons.set(id, { id, name, tooltip, panel, owner }); setTimeout(() => env.renderToolbar(), 0); return { ok: true }; },
  dropButton({ id }) { buttons.delete(id); setTimeout(() => env.renderToolbar(), 0); return { ok: true }; },
  runCommand({ id }) { setTimeout(() => runCommand(id), 0); return { ok: true }; },
};
function hostCall(name, json) {
  try {
    const fn = HOST[name];
    if (!fn) throw new Error(`unknown call ${name}`);
    const r = fn(json ? JSON.parse(json) : {});
    return JSON.stringify(r ?? null);
  } catch (e) {
    return JSON.stringify({ __error__: String(e?.message || e) });
  }
}

// ---------------------------------------------------------------- Python
export async function loadPython() {
  if (py) return py;
  loading ||= (async () => {
    env.status(t('Python wird geladen …'));
    const base = new URL('../vendor/pyodide/', import.meta.url).href;
    const { loadPyodide } = await import('../vendor/pyodide/pyodide.mjs');
    const p = await loadPyodide({ indexURL: base, stdout: s => log(s), stderr: s => log(s, 2) });
    p.registerJsModule('_werkfab', { call: (name, json) => hostCall(name, json) });
    p.FS.mkdirTree(LIB + '/adsk');
    p.FS.mkdirTree(USER);
    for (const f of PY_FILES) {
      const res = await fetch(new URL('./fusion/' + f, import.meta.url));
      if (!res.ok) throw new Error(`${f}: ${res.status}`);
      p.FS.writeFile(`${LIB}/${f}`, await res.text());
    }
    p.runPython(`import sys\nfor d in ('${USER}', '${LIB}'):\n    if d not in sys.path: sys.path.insert(0, d)\nimport _wf_runtime`);
    py = p;
    env.status(t('Python bereit'));
    return p;
  })();
  try { return await loading; } catch (e) { loading = null; env.status(t(`Python konnte nicht geladen werden: ${e.message || e}`)); throw e; }
}
function writeEntry(p, e) {
  const dir = `${USER}/${e.pkg}`;
  for (const [rel, txt] of Object.entries(e.files)) {
    const path = `${dir}/${rel}`, folder = path.slice(0, path.lastIndexOf('/'));
    p.FS.mkdirTree(folder);
    p.FS.writeFile(path, txt);
  }
  p.runPython(`import sys\nif '${dir}' not in sys.path: sys.path.append('${dir}')`);
}
const pyMessage = e => {
  const s = String(e?.message || e);
  const last = s.trim().split('\n').filter(Boolean).pop() || s;
  return { full: s, last };
};
export async function runEntry(e, { startup = false } = {}) {
  const p = await loadPython();
  writeEntry(p, e);
  const rt = p.pyimport('_wf_runtime');
  log(`▶ ${e.name}`);
  try {
    const r = session(() => JSON.parse(rt.run(e.key, e.pkg, e.main, e.kind, startup)));
    if (r.running) running.add(e.key); else running.delete(e.key);
    env.status(r.running ? t(`Zusatzmodul „${e.name}“ läuft`) : t(`Skript „${e.name}“ ausgeführt`));
    env.changed();
    return r;
  } catch (err) {
    const m = pyMessage(err);
    log(m.full, 2);
    env.status(t(`Skript „${e.name}“ fehlgeschlagen: ${m.last}`));
    env.changed();
    return { error: m.last };
  } finally {
    rt.destroy?.();
  }
}
export async function stopEntry(e) {
  if (!py || !running.has(e.key)) return;
  const rt = py.pyimport('_wf_runtime');
  try {
    const r = session(() => JSON.parse(rt.stop(e.key)));
    if (r.error) log(r.error, 2);
  } catch (err) { log(pyMessage(err).full, 2); }
  running.delete(e.key);
  for (const [id, b] of buttons) if (b.owner === e.key) buttons.delete(id);
  env.status(t(`Zusatzmodul „${e.name}“ gestoppt`));
  env.changed();
  rt.destroy?.();
}
export const isRunning = key => running.has(key);

export async function runCommand(id) {
  const p = await loadPython(), rt = p.pyimport('_wf_runtime');
  try {
    const spec = session(() => JSON.parse(rt.created(id)));
    let vals = {};
    const asked = spec.fields.filter(f => f.label != null);
    if (spec.fields.length) {
      vals = await env.formDialog(spec.title, spec.fields, spec.ok || 'OK');
      if (vals) for (const f of spec.fields) if (f.label == null) delete vals[f.key];
    }
    if (!asked.length && !spec.hasExecute && vals) vals = {};
    const r = session(() => JSON.parse(rt.execute(id, vals == null ? null : JSON.stringify(vals))));
    if (r.failed) alert(r.failed);
    env.changed();
  } catch (err) {
    const m = pyMessage(err);
    log(m.full, 2);
    env.status(t(`Befehl fehlgeschlagen: ${m.last}`));
    env.changed();
  } finally {
    rt.destroy?.();
  }
}

// add-ins marked "run at start"
export function startAddins() {
  const list = storedScripts().filter(e => e.runOnStart);
  if (!list.length) return;
  (async () => { for (const e of list) await runEntry(e, { startup: true }); })().catch(() => {});
}

// ---------------------------------------------------------------- examples and templates
export const EXAMPLE_SCRIPT = `import adsk.core, adsk.fusion, traceback

# Beispiel: Platte mit vier Bohrungen und verrundeten Ecken (Werte in cm wie im Original)
def run(context):
    ui = None
    try:
        app = adsk.core.Application.get()
        ui = app.userInterface
        design = adsk.fusion.Design.cast(app.activeProduct)
        root = design.rootComponent

        sketch = root.sketches.add(root.xYConstructionPlane)
        sketch.sketchCurves.sketchLines.addTwoPointRectangle(adsk.core.Point3D.create(0, 0, 0), adsk.core.Point3D.create(8, 5, 0))
        ext = root.features.extrudeFeatures.addSimple(sketch.profiles.item(0), adsk.core.ValueInput.createByString('10 mm'),
                                                     adsk.fusion.FeatureOperations.NewBodyFeatureOperation)
        body = ext.bodies.item(0)
        body.name = 'Platte'

        # senkrechte Kanten verrunden
        edges = adsk.core.ObjectCollection.create()
        for e in body.edges:
            a, b = e.startVertex.geometry, e.endVertex.geometry
            if abs(a.x - b.x) < 1e-6 and abs(a.y - b.y) < 1e-6:
                edges.add(e)
        fil = root.features.filletFeatures.createInput()
        fil.addConstantRadiusEdgeSet(edges, adsk.core.ValueInput.createByString('6 mm'), True)
        root.features.filletFeatures.add(fil)

        # Bohrungen auf der Oberseite
        top = ext.endFaces.item(0)
        sk2 = root.sketches.add(top)
        pts = adsk.core.ObjectCollection.create()
        for x, y in ((1, 1), (7, 1), (7, 4), (1, 4)):
            pts.add(sk2.sketchPoints.add(sk2.modelToSketchSpace(adsk.core.Point3D.create(x, y, 1))))
        hole = root.features.holeFeatures.createSimpleInput(adsk.core.ValueInput.createByString('6.6 mm'))
        hole.setPositionBySketchPoints(pts)
        hole.setAllExtent(adsk.fusion.ExtentDirections.PositiveExtentDirection)
        root.features.holeFeatures.add(hole)

        app.activeViewport.fit()
        app.log('Volumen: %.1f cm³' % body.volume)
    except:
        if ui:
            ui.messageBox('Fehler:\\n{}'.format(traceback.format_exc()))
`;
export const EXAMPLE_ADDIN = `import adsk.core, adsk.fusion, traceback

# Beispiel-Zusatzmodul: ein Befehl „Zahnscheibe“ in der Werkzeugleiste mit Eingaben
handlers = []
CMD_ID = 'werkfabSampleDisc'

class Created(adsk.core.CommandCreatedEventHandler):
    def notify(self, args):
        cmd = args.command
        inputs = cmd.commandInputs
        inputs.addValueInput('dia', 'Durchmesser', 'mm', adsk.core.ValueInput.createByString('60 mm'))
        inputs.addValueInput('thick', 'Dicke', 'mm', adsk.core.ValueInput.createByString('8 mm'))
        inputs.addIntegerSpinnerCommandInput('teeth', 'Zähne', 3, 60, 1, 12)
        inputs.addBoolValueInput('bore', 'Bohrung in der Mitte', True, '', True)
        h = Execute()
        cmd.execute.add(h)
        handlers.append(h)

class Execute(adsk.core.CommandEventHandler):
    def notify(self, args):
        inputs = args.command.commandInputs
        r = inputs.itemById('dia').value / 2
        t = inputs.itemById('thick').value
        n = inputs.itemById('teeth').value
        import math
        root = adsk.fusion.Design.cast(adsk.core.Application.get().activeProduct).rootComponent
        sk = root.sketches.add(root.xYConstructionPlane)
        lines = sk.sketchCurves.sketchLines
        pts = []
        for k in range(2 * n):
            rr = r if k % 2 == 0 else r * 0.85
            a = math.pi * k / n
            pts.append(adsk.core.Point3D.create(rr * math.cos(a), rr * math.sin(a), 0))
        for k in range(2 * n):
            lines.addByTwoPoints(pts[k], pts[(k + 1) % (2 * n)])
        if inputs.itemById('bore').value:
            sk.sketchCurves.sketchCircles.addByCenterRadius(adsk.core.Point3D.create(0, 0, 0), r * 0.2)
        prof = max(sk.profiles, key=lambda p: p.areaProperties().area)
        root.features.extrudeFeatures.addSimple(prof, adsk.core.ValueInput.createByReal(t), adsk.fusion.FeatureOperations.NewBodyFeatureOperation)

def run(context):
    ui = adsk.core.Application.get().userInterface
    d = ui.commandDefinitions.itemById(CMD_ID) or ui.commandDefinitions.addButtonDefinition(CMD_ID, 'Zahnscheibe', 'Zahnscheibe mit Durchmesser, Dicke und Zähnezahl')
    h = Created()
    d.commandCreated.add(h)
    handlers.append(h)
    panel = ui.allToolbarPanels.itemById('SolidScriptsAddinsPanel')
    panel.controls.addCommand(d)

def stop(context):
    ui = adsk.core.Application.get().userInterface
    d = ui.commandDefinitions.itemById(CMD_ID)
    if d:
        d.deleteMe()
`;
export function addTemplate(kind) {
  const base = kind === 'addin' ? t('Beispiel-Zusatzmodul') : t('Beispielskript');
  const names = new Set(storedScripts().map(e => e.name));
  let name = ident(base), k = 2;
  while (names.has(name)) name = `${ident(base)}_${k++}`;
  const e = makeEntry(name, { [`${name}.py`]: kind === 'addin' ? EXAMPLE_ADDIN : EXAMPLE_SCRIPT });
  e.kind = kind;
  upsert(e);
  return e;
}
export function updateEntry(e) { return upsert(e); }
export function removeEntry(key) { saveScripts(storedScripts().filter(e => e.key !== key)); }
