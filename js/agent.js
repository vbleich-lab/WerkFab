// Interface for AI agents: the tools an agent may call in the running app, spoken over the Model Context
// Protocol by the desktop app (electron/main.cjs opens the local port; the page only answers the calls).
// An agent works on the open design – it reads and changes the feature list, asks for the result and for a
// picture. It gets no access to files, to the settings or to other designs.
import { FEATURE_TYPES } from './model.js';
import { STD_FAMILIES, stdFamily, stdPartName } from './stdparts.js';
import { OP_TYPES, TOOL_TYPES } from './cam.js';

const obj = (properties = {}, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

export const AGENT_GUIDE = `WerkFab is a parametric CAD/CAM app. A design is one JSON project; its "features" array is the timeline:
each feature is rebuilt in order. All lengths are millimetres, angles are degrees. Every feature has a unique "id",
a "type" and a "name". Numbers may be given as expressions starting with "=" that use the project's parameters.

Feature types: ${Object.keys(FEATURE_TYPES).join(', ')}.

The safest way to learn the fields of a type: call get_project on a design that has such a feature (the user can
make one by hand) and copy its shape. These basic shapes are stable:

Sketch on a plane (o = origin, x = direction of the sketch X axis, n = normal):
  { "id": "sk1", "type": "sketch", "name": "Sketch1", "hidden": true,
    "plane": { "o": [0, 0, 0], "x": [1, 0, 0], "n": [0, 0, 1] },
    "entities": [
      { "id": "e1", "type": "rect", "x": 0, "y": 0, "w": 80, "h": 50, "r": 6 },
      { "id": "e2", "type": "circle", "cx": 20, "cy": 25, "r": 4 },
      { "id": "e3", "type": "poly", "closed": true, "pts": [[0, 0], [30, 0], [30, 10], [0, 10]] } ] }
Extrude all profiles of a sketch (op: new | join | cut | intersect; a negative distance goes against the normal):
  { "id": "ex1", "type": "extrude", "name": "Extrude1", "sketch": "sk1", "profiles": "all", "distance": 12, "extent": "one", "op": "new" }
Revolve a sketch about its own X or Y axis:
  { "id": "rv1", "type": "revolve", "name": "Revolve1", "sketch": "sk1", "profiles": "all", "axis": "y", "angle": 360, "op": "new" }
Holes at the circle centres of a sketch:
  { "id": "ho1", "type": "hole", "name": "Hole1", "sketch": "sk3", "points": "all", "kind": "simple", "dia": 6.6, "through": true, "depth": 15 }

Working loop: add_features → get_model (bodies with volume and bounding box, and the error text of every feature
that failed) → screenshot to look at the result. Every change is one undo step; undo takes it back.
Standard parts, tubes and sections come from the catalogue: list_standard_parts, then insert_standard_part.
Manufacture (CAM): get_cam shows setups (stock, origin, machine), the tool library and the operations with the
length and time of their toolpaths or the reason they failed. add_operation creates an operation with the
defaults the app would choose (tool by type, the last fitting sketch) – then read it with get_cam and adjust
fields with update_operation. Operation types: ${Object.keys(OP_TYPES).join(', ')}.
Tool types: ${Object.keys(TOOL_TYPES).join(', ')}. A 2D operation follows a sketch ("sketch": id, "entities": "all"
or a list of entity ids; "geomSource": "sketch") or faces picked in the model ("geomSource": "model"); "depth" is how deep it cuts below the top of the sketch plane. get_nc_program posts a setup
with the post processor of the design or another one from the list in get_cam; check_nc_program reports collisions
and machine limits of that program. add_setup adds another clamping (e.g. the part turned over).
An NC program is a draft: tell the user to check it in the simulation and with a dry run before cutting.
The user watches the same window: keep the design tidy, name features, and do not delete what you did not make
unless asked.`;

export const AGENT_TOOLS = [
  { name: 'guide', description: 'How a WerkFab design is built: the project structure, the feature types and examples. Read this first.', inputSchema: obj() },
  { name: 'get_project', description: 'The open design as JSON. part: "features" (default), "params", "cam" (setups, tools, operations) or "all".', inputSchema: obj({ part: { type: 'string', enum: ['features', 'params', 'cam', 'all'] } }) },
  { name: 'list_features', description: 'Short list of the timeline: index, id, type, name, suppressed, error text if the feature failed.', inputSchema: obj() },
  { name: 'add_features', description: 'Append features to the timeline (or insert them at "index"). Missing ids are created. Returns the ids and any errors of the rebuilt model.', inputSchema: obj({ features: { type: 'array', items: { type: 'object' } }, index: { type: 'integer' } }, ['features']) },
  { name: 'update_feature', description: 'Change fields of one feature: "patch" is merged into it (a field set to null is removed). Returns the errors of the rebuilt model.', inputSchema: obj({ id: { type: 'string' }, patch: { type: 'object' } }, ['id', 'patch']) },
  { name: 'delete_features', description: 'Remove features by id. Features that depend on them will report errors.', inputSchema: obj({ ids: { type: 'array', items: { type: 'string' } } }, ['ids']) },
  { name: 'set_params', description: 'Create or change named parameters used in expressions ("=name"). Each: { name, expr } – expr is a number or an expression as text, e.g. "120" or "laenge/2".', inputSchema: obj({ params: { type: 'array', items: obj({ name: { type: 'string' }, expr: { type: ['string', 'number'] } }, ['name', 'expr']) } }, ['params']) },
  { name: 'set_project', description: 'Replace the whole design by a project JSON (as get_project part "all" returns it). One undo step.', inputSchema: obj({ project: { type: 'object' } }, ['project']) },
  { name: 'new_design', description: 'Empty the open design (features, parameters and CAM operations). One undo step.', inputSchema: obj({ name: { type: 'string' } }) },
  { name: 'get_model', description: 'The rebuilt model: every body with name, volume (mm³), surface area (mm²) and bounding box, and the feature errors.', inputSchema: obj() },
  { name: 'screenshot', description: 'Picture of the 3D view (PNG). view: iso (default), top, front, right or current; fit: zoom to the model first (default true).', inputSchema: obj({ view: { type: 'string', enum: ['iso', 'top', 'front', 'right', 'current'] }, fit: { type: 'boolean' } }) },
  { name: 'export', description: 'The model as file content: format "step" (text) or "stl" (text, ASCII). Large models give long answers.', inputSchema: obj({ format: { type: 'string', enum: ['step', 'stl'] } }, ['format']) },
  { name: 'list_standard_parts', description: 'The parts catalogue. Without "family": all families (id, group, name, standard, number of sizes). With "family": its sizes and main dimensions.', inputSchema: obj({ family: { type: 'string' } }) },
  { name: 'insert_standard_part', description: 'Insert a catalogue part as a new body with its axis along Z at "at" (default the origin). "length" for screws, pins, tubes and sections.', inputSchema: obj({ family: { type: 'string' }, size: { type: 'string' }, length: { type: 'number' }, at: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 } }, ['family', 'size']) },
  { name: 'get_cam', description: 'Manufacture: setups (kind, stock box, error), tools, operations (with toolpath length in mm, time in s or the error text) and the post processors.', inputSchema: obj({ full: { type: 'boolean', description: 'true: every field of setups, tools and operations' } }) },
  { name: 'add_tool', description: 'Add a tool to the library of the design. Needs type (see guide) and dia (mm); optional name, number, rpm, feed, plunge (mm/min), stepdown, stepover (share of the diameter), fluteLen, length, angle, stickout (mm out of the holder) and holderDia for the collision check.', inputSchema: obj({ tool: { type: 'object' } }, ['tool']) },
  { name: 'add_operation', description: 'Add a machining operation with the defaults of the app. type: see guide. Optional: setup (id), tool (id) and "fields" merged into the operation (e.g. sketch, entities, depth, stepdown, side, stockToLeave). Returns the operation and its result.', inputSchema: obj({ type: { type: 'string' }, setup: { type: 'string' }, tool: { type: 'string' }, fields: { type: 'object' } }, ['type']) },
  { name: 'update_operation', description: 'Change fields of one operation ("patch" is merged; null removes a field). Returns its new result.', inputSchema: obj({ id: { type: 'string' }, patch: { type: 'object' } }, ['id', 'patch']) },
  { name: 'delete_operations', description: 'Remove operations by id.', inputSchema: obj({ ids: { type: 'array', items: { type: 'string' } } }, ['ids']) },
  { name: 'update_setup', description: 'Change fields of a setup ("patch" is merged; null removes a field) – e.g. name, stock margins, origin, safeZ. Read the fields with get_cam full first.', inputSchema: obj({ id: { type: 'string' }, patch: { type: 'object' } }, ['id', 'patch']) },
  { name: 'add_setup', description: 'Add a setup (a clamping of the part). It starts as a copy of the setup "copy_of" (default: the last one); "fields" are merged in – e.g. name, orientation ("top", "bottom", "front", "back", "left", "right"), stock margins, origin. Returns get_cam.', inputSchema: obj({ copy_of: { type: 'string' }, fields: { type: 'object' } }) },
  { name: 'check_nc_program', description: 'Post a setup and check the program line by line: holder and shank against the remaining stock and the clamping, rapids through material, machine travels and limits. It does not tell whether a path cuts into the finished part – compare the result with the model. Returns the issues by kind with the lines they are on; "clean": true when nothing was found. Optional: setup (id), post (id).', inputSchema: obj({ setup: { type: 'string' }, post: { type: 'string' } }) },
  { name: 'get_nc_program', description: 'The NC program of a setup as text, with line count, run time and warnings. Optional: setup (id, default the first), post (id of a post processor from get_cam). A draft – it must be verified before cutting.', inputSchema: obj({ setup: { type: 'string' }, post: { type: 'string' } }) },
  { name: 'undo', description: 'Take back the last change.', inputSchema: obj() },
  { name: 'redo', description: 'Do the last undone change again.', inputSchema: obj() },
];

// api: what the page lends (js/main.js): project(), commit(fn), settled() → model, bodyInfo(body), picture(view, fit),
// exportText(format), insertPart(v, at), undo(), redo(), uid(prefix), note(what, n) – what: added | changed | deleted | replaced | emptied | opAdded,
// cam(full), addOp(type, setupId, toolId, fields) → id, opResult(id), nc(setupId, postId)
export async function agentCall(name, a, api) {
  a ||= {};
  const errorsNow = async () => { const m = await api.settled(); return { errors: m.errors || {}, bodies: m.bodies.length }; };
  switch (name) {
    case 'guide': return AGENT_GUIDE;
    case 'get_project': {
      const p = api.project(), part = a.part || 'features';
      return part === 'all' ? p : part === 'params' ? p.params || [] : part === 'cam' ? { cam: p.cam, post: p.post } : p.features;
    }
    case 'list_features': {
      const m = await api.settled();
      return api.project().features.map((f, index) => ({ index, id: f.id, type: f.type, name: f.name, ...(f.suppressed ? { suppressed: true } : {}), ...(m.errors?.[f.id] ? { error: m.errors[f.id] } : {}) }));
    }
    case 'add_features': {
      if (!Array.isArray(a.features) || !a.features.length) throw new Error('features: a list of feature objects is needed');
      const have = new Set(api.project().features.map(f => f.id)), list = [];
      for (const f of a.features) {
        if (!f || typeof f !== 'object' || !FEATURE_TYPES[f.type]) throw new Error(`Unknown feature type "${f?.type}". Types: ${Object.keys(FEATURE_TYPES).join(', ')}`);
        const g = structuredClone(f);
        if (!g.id) g.id = api.uid(g.type.slice(0, 2));
        if (have.has(g.id)) throw new Error(`The id "${g.id}" is already used`);
        have.add(g.id);
        g.name ||= FEATURE_TYPES[g.type];
        if (g.type === 'sketch') { g.entities ||= []; for (const e of g.entities) e.id ||= api.uid('e'); }
        list.push(g);
      }
      api.commit(p => { const i = Number.isInteger(a.index) ? Math.max(0, Math.min(p.features.length, a.index)) : p.features.length; p.features.splice(i, 0, ...list); });
      api.note('added', list.length);
      return { ids: list.map(f => f.id), ...(await errorsNow()) };
    }
    case 'update_feature': {
      if (!api.project().features.some(f => f.id === a.id)) throw new Error(`No feature with the id "${a.id}"`);
      if (!a.patch || typeof a.patch !== 'object') throw new Error('patch: an object with the fields to change is needed');
      if ('id' in a.patch || 'type' in a.patch) throw new Error('id and type of a feature cannot be changed');
      api.commit(p => { const f = p.features.find(q => q.id === a.id); for (const [k, v] of Object.entries(structuredClone(a.patch))) { if (v === null) delete f[k]; else f[k] = v; } });
      api.note('changed');
      return errorsNow();
    }
    case 'delete_features': {
      const ids = new Set(a.ids || []), n = api.project().features.filter(f => ids.has(f.id)).length;
      if (!n) throw new Error('None of these ids exists');
      api.commit(p => { p.features = p.features.filter(f => !ids.has(f.id)); });
      api.note('deleted', n);
      return { deleted: n, ...(await errorsNow()) };
    }
    case 'set_params': {
      for (const q of a.params || []) if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(q?.name || '')) throw new Error(`"${q?.name}" is no parameter name (letters, digits, underscore)`);
      api.commit(p => { p.params ||= []; for (const q of a.params || []) { const old = p.params.find(x => x.name === q.name); if (old) old.expr = String(q.expr); else p.params.push({ name: q.name, expr: String(q.expr) }); } });
      return { params: api.project().params, ...(await errorsNow()) };
    }
    case 'set_project': {
      const q = a.project;
      if (!q || !Array.isArray(q.features)) throw new Error('project: needs at least a "features" list');
      api.commit(p => { for (const k of ['name', 'params', 'features', 'cam', 'post', 'bodyMeta']) if (q[k] !== undefined) p[k] = structuredClone(q[k]); });
      api.note('replaced');
      return errorsNow();
    }
    case 'new_design': {
      api.commit(p => { p.features = []; p.params = []; p.cam.ops = []; p.bodyMeta = {}; if (a.name) p.name = String(a.name).slice(0, 80); });
      api.note('emptied');
      return { ok: true };
    }
    case 'get_model': {
      const m = await api.settled();
      return { bodies: m.bodies.map(api.bodyInfo), errors: m.errors || {}, kernel: m.kernel };
    }
    case 'screenshot': return { image: await api.picture(a.view || 'iso', a.fit !== false) };
    case 'export': return api.exportText(a.format);
    case 'list_standard_parts': {
      if (!a.family) return STD_FAMILIES.map(f => ({ family: f.id, group: f.group, name: f.name, standard: f.norm, sizes: f.sizes().length, ...(f.len ? { length: 'needed (mm)' } : {}) }));
      const f = stdFamily(a.family);
      if (!f) throw new Error(`No family "${a.family}"`);
      return { family: f.id, name: f.name, standard: f.norm, ...(f.len ? { defaultLength: f.len } : {}), sizes: f.sizes().map(z => ({ size: z, dims: f.dims(z) })) };
    }
    case 'insert_standard_part': {
      const f = stdFamily(a.family);
      if (!f) throw new Error(`No family "${a.family}" – see list_standard_parts`);
      if (!f.sizes().includes(String(a.size))) throw new Error(`No size "${a.size}" in ${f.id}. Sizes: ${f.sizes().join(', ')}`);
      const len = f.len ? (+a.length > 0 ? +a.length : f.len) : 0;
      const ok = api.insertPart({ fam: f.id, size: String(a.size), len, thread: 'mark' }, Array.isArray(a.at) && a.at.length === 3 ? a.at.map(Number) : [0, 0, 0]);
      return { inserted: ok, name: stdPartName(f, String(a.size), len), ...(await errorsNow()) };
    }
    case 'get_cam': return api.cam(!!a.full);
    case 'add_tool': {
      const t = a.tool;
      if (!t || !TOOL_TYPES[t.type]) throw new Error(`tool.type must be one of: ${Object.keys(TOOL_TYPES).join(', ')}`);
      if (!(+t.dia > 0)) throw new Error('tool.dia (mm) is needed');
      const tools = api.project().cam.tools, id = api.uid('T');
      const tool = { rpm: 10000, feed: 600, plunge: 200, stepdown: 1, stepover: 0.5, ...structuredClone(t), id, dia: +t.dia, number: +t.number > 0 ? +t.number : Math.max(0, ...tools.map(x => +x.number || 0)) + 1 };
      tool.name ||= `${TOOL_TYPES[tool.type]} Ø${tool.dia}`;
      api.commit(p => { p.cam.tools.push(tool); });
      return tool;
    }
    case 'add_operation': {
      if (!OP_TYPES[a.type]) throw new Error(`Unknown operation type "${a.type}". Types: ${Object.keys(OP_TYPES).join(', ')}`);
      const p = api.project();
      if (a.setup && !p.cam.setups.some(s => s.id === a.setup)) throw new Error(`No setup "${a.setup}"`);
      if (a.tool && !p.cam.tools.some(t => t.id === a.tool)) throw new Error(`No tool "${a.tool}"`);
      await api.settled();
      const id = api.addOp(a.type, a.setup || null, a.tool || null, a.fields || {});
      api.note('opAdded');
      return api.opResult(id);
    }
    case 'update_operation': {
      if (!api.project().cam.ops.some(o => o.id === a.id)) throw new Error(`No operation with the id "${a.id}"`);
      if (!a.patch || typeof a.patch !== 'object' || 'id' in a.patch) throw new Error('patch: an object with the fields to change is needed (not the id)');
      api.commit(p => { const o = p.cam.ops.find(q => q.id === a.id); for (const [k, v] of Object.entries(structuredClone(a.patch))) { if (v === null) delete o[k]; else o[k] = v; } });
      await api.settled();
      return api.opResult(a.id);
    }
    case 'delete_operations': {
      const ids = new Set(a.ids || []), n = api.project().cam.ops.filter(o => ids.has(o.id)).length;
      if (!n) throw new Error('None of these ids exists');
      api.commit(p => { p.cam.ops = p.cam.ops.filter(o => !ids.has(o.id)); });
      return { deleted: n };
    }
    case 'update_setup': {
      if (!api.project().cam.setups.some(s => s.id === a.id)) throw new Error(`No setup with the id "${a.id}"`);
      if (!a.patch || typeof a.patch !== 'object' || 'id' in a.patch) throw new Error('patch: an object with the fields to change is needed (not the id)');
      api.commit(p => { const s = p.cam.setups.find(q => q.id === a.id); for (const [k, v] of Object.entries(structuredClone(a.patch))) { if (v === null) delete s[k]; else s[k] = v; } });
      await api.settled();
      return api.cam(false);
    }
    case 'add_setup': {
      if (a.copy_of && !api.project().cam.setups.some(s => s.id === a.copy_of)) throw new Error(`No setup "${a.copy_of}"`);
      api.addSetup(a.copy_of || null, a.fields || {});
      await api.settled();
      return api.cam(false);
    }
    case 'check_nc_program': { await api.settled(); return api.check(a.setup || null, a.post || null); }
    case 'get_nc_program': { await api.settled(); return api.nc(a.setup || null, a.post || null); }
    case 'undo': api.undo(); return errorsNow();
    case 'redo': api.redo(); return errorsNow();
    default: throw new Error(`Unknown tool "${name}"`);
  }
}
