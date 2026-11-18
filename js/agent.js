// Interface for AI agents: the tools an agent may call in the running app, spoken over the Model Context
// Protocol by the desktop app (electron/main.cjs opens the local port; the page only answers the calls).
// An agent works on the open design – it reads and changes the feature list, asks for the result and for a
// picture. It gets no access to files, to the settings or to other designs.
import { FEATURE_TYPES } from './model.js';
import { STD_FAMILIES, stdFamily, stdPartName } from './stdparts.js';
import { OP_TYPES, TOOL_TYPES } from './cam.js';

// 2D operations have no depth field of their own: their bottom is a height ("auto" = the deepest point of the
// sketch's features). "depth" from an agent means that far below the sketch plane → the bottom height.
const DEPTH_OPS = ['contour', 'pocket', 'adaptive', 'drill', 'bore', 'thread', 'slot', 'circular'];
export function depthAsBottom(type, fields) {
  if (!DEPTH_OPS.includes(type) || !fields || fields.depth == null) return fields;
  const d = +fields.depth;
  delete fields.depth;
  if (Number.isFinite(d) && d > 0) fields.heights = { ...(fields.heights || {}), bottom: { from: 'sketch', offset: -d } };
  return fields;
}

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
with the post processor of the design or another one from the list in get_cam; check_nc_program reports collisions,
machine limits and cuts into the finished part of that program. add_setup adds another clamping (e.g. the part turned over). simulate runs the material removal and returns a picture
of the stock, the collisions and how the stock compares with the part (on size, material left, cut too deep).
An NC program is a draft: tell the user to check it in the simulation and with a dry run before cutting.
Assembly: every body is a component. set_placement shifts and turns a body; add_joint joins a body to another one
(or to the ground) so that it turns or slides; update_joint with { "value": … } moves it. get_assembly shows where
the bodies stand and which ones run into each other; motion_study drives a joint through its range and reports the
poses that collide. export_robot gives the assembly as URDF, SDF or MJCF.
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
  { name: 'delete_setups', description: 'Remove setups by id, together with their operations. The last setup stays.', inputSchema: obj({ ids: { type: 'array', items: { type: 'string' } } }, ['ids']) },
  { name: 'simulate', description: 'Run the material removal simulation of a setup and return a picture of the stock (PNG) with what was found: collisions (rapid in material, shank, holder) and the comparison with the part – share on size, material left, cut too deep (gouge) and the deepest cut into the part in mm. Optional: setup (id), at (0…1 of the run time, default 1 = the end), view (iso, top, front, right, current).', inputSchema: obj({ setup: { type: 'string' }, at: { type: 'number' }, view: { type: 'string', enum: ['iso', 'top', 'front', 'right', 'current'] } }) },
  { name: 'check_nc_program', description: 'Post a setup and check the program line by line: holder and shank against the remaining stock and the clamping, rapids through material, machine travels and limits, and paths that cut into the finished part (kind "part", with deepestCutIntoPart in mm; end mills, face mills, ball and bull nose cutters, chamfer mills and drills with their cone, on 3-axis moves and drilling cycles; sideways from about one grid cell, 0.3 mm or more on large parts). A cut that is not in the model – an engraving, a dog-bone relief, a pocket milled from a sketch only – is reported as "part" too: set against_part to false to leave that check out. Returns the issues by kind with the lines they are on; "clean": true when nothing was found. Optional: setup (id), post (id), against_part (default true).', inputSchema: obj({ setup: { type: 'string' }, post: { type: 'string' }, against_part: { type: 'boolean' } }) },
  { name: 'get_nc_program', description: 'The NC program of a setup as text, with line count, run time and warnings. Optional: setup (id, default the first), post (id of a post processor from get_cam). A draft – it must be verified before cutting.', inputSchema: obj({ setup: { type: 'string' }, post: { type: 'string' } }) },
  { name: 'get_assembly', description: 'The assembly: every body with the box it fills where it stands now (placement and joints applied), the joints with their motions (field, unit, value now), and the pairs of bodies that run into each other with the shared volume in mm³ (collisions: false leaves that check out – it takes time on large models).', inputSchema: obj({ collisions: { type: 'boolean' } }) },
  { name: 'set_placement', description: 'Place a body as a component: shift dx, dy, dz (mm) and turn rx, ry, rz (degrees, about X then Y then Z through the origin). Fields left out keep their value; all zero takes the placement away. A body moved by a joint with picked origins ignores its placement.', inputSchema: obj({ body: { type: 'string' }, dx: { type: 'number' }, dy: { type: 'number' }, dz: { type: 'number' }, rx: { type: 'number' }, ry: { type: 'number' }, rz: { type: 'number' } }, ['body']) },
  { name: 'add_joint', description: 'Join a body (child, the one that moves) to another body (parent; leave out for the ground). type: rigid, revolute (turns about the axis through origin), slider (moves along the axis), cylindrical (turns and moves), planar (moves in the plane across the axis and turns), ball. origin: [x, y, z] in the coordinates of the model as built (before any motion); axis: "x", "y", "z" or a direction [x, y, z]. value: where it stands (degrees or mm; value2, value3 for the further motions of cylindrical, planar and ball). min, max: the range of value; limits: false for a joint without limits. link: { from: id of another joint, ratio, offset } makes value follow that joint (value = ratio × its value + offset). A body has one joint as child; a second one replaces the first.', inputSchema: obj({ type: { type: 'string', enum: ['rigid', 'revolute', 'slider', 'cylindrical', 'planar', 'ball'] }, child: { type: 'string' }, parent: { type: 'string' }, name: { type: 'string' }, origin: { type: 'array', items: { type: 'number' } }, axis: {}, value: { type: 'number' }, value2: { type: 'number' }, value3: { type: 'number' }, min: { type: 'number' }, max: { type: 'number' }, limits: { type: 'boolean' }, link: { type: 'object' } }, ['type', 'child']) },
  { name: 'update_joint', description: 'Change fields of a joint: patch with e.g. value (move it), min, max, axis, origin, parent, type, name, link (null removes a field). Returns the assembly as get_assembly does, with the collisions in the new pose.', inputSchema: obj({ id: { type: 'string' }, patch: { type: 'object' }, collisions: { type: 'boolean' } }, ['id', 'patch']) },
  { name: 'delete_joints', description: 'Remove joints by id.', inputSchema: obj({ ids: { type: 'array', items: { type: 'string' } } }, ['ids']) },
  { name: 'motion_study', description: 'Drive a joint through its range (joint: id; without it all joints that move on their own, together) in equal steps and check every pose for bodies that run into each other. Returns how many poses collide, the first and the deepest collision and the colliding poses with the pairs of bodies and the shared volume in mm³. steps: 2…72, default 24. The design is not changed; set a pose with update_joint.', inputSchema: obj({ joint: { type: 'string' }, steps: { type: 'number' } }) },
  { name: 'export_robot', description: 'The assembly as a robot description: format "urdf" (ROS), "sdf" (Gazebo), "mjcf" (MuJoCo) or "all". Every visible body is a link with mesh, mass and inertia from its material, every joint a joint with axis and limits; the present pose is the zero pose. Returns the description files as text and the list of mesh files (binary STL, metres); meshes: true adds them as base64 (long answers). package: name of a ROS package – the URDF then names the meshes as package://name/meshes/… instead of relative paths. collision: "mesh" (default, the full mesh), "hull" (the convex hull as a mesh of its own – few triangles, but pockets and holes are filled) or "box" (the box around the body).', inputSchema: obj({ format: { type: 'string', enum: ['urdf', 'sdf', 'mjcf', 'all'] }, package: { type: 'string' }, meshes: { type: 'boolean' }, collision: { type: 'string', enum: ['mesh', 'hull', 'box'] } }) },
  { name: 'undo', description: 'Take back the last change.', inputSchema: obj() },
  { name: 'redo', description: 'Do the last undone change again.', inputSchema: obj() },
];

// api: what the page lends (js/main.js): project(), commit(fn), settled() → model, bodyInfo(body), picture(view, fit),
// exportText(format), insertPart(v, at), undo(), redo(), uid(prefix), note(what, n) – what: added | changed | deleted | replaced | emptied | opAdded,
// cam(full), addOp(type, setupId, toolId, fields) → id, opResult(id), nc(setupId, postId)
// The fields of a joint from what an agent sent, checked: the bodies exist, no body hangs on itself.
const JOINT_KINDS = ['rigid', 'revolute', 'slider', 'cylindrical', 'planar', 'ball'];
function jointFields(a, bodyIds, joints, selfId) {
  if (!JOINT_KINDS.includes(a.type)) throw new Error(`type: one of ${JOINT_KINDS.join(', ')}`);
  if (!bodyIds.includes(a.child)) throw new Error(`child: no body with the id "${a.child}" (ids: ${bodyIds.join(', ')})`);
  const parent = a.parent || '';
  if (parent && !bodyIds.includes(parent)) throw new Error(`parent: no body with the id "${parent}" (ids: ${bodyIds.join(', ')})`);
  if (parent === a.child) throw new Error('A body cannot be joined to itself');
  // up the chain of parents: the child must not come again
  const others = joints.filter(q => q.id !== selfId && q.child !== a.child);
  for (let p = parent, n = 0; p && n < 1000; n++) {
    if (p === a.child) throw new Error('These joints would form a ring: the parent already hangs on the child');
    p = others.find(q => q.child === p)?.parent || '';
  }
  const num = (k, d) => { if (a[k] === undefined || a[k] === null) return d; if (!Number.isFinite(+a[k])) throw new Error(`${k}: a number is needed`); return +a[k]; };
  const j = { type: a.type, child: a.child, parent };
  if (a.pO && a.cO) return { ...j, value: num('value', 0) }; // picked in the app: origins and axis stay as they are
  const o = a.origin ?? [0, 0, 0];
  if (!Array.isArray(o) || o.length !== 3 || o.some(q => !Number.isFinite(+q))) throw new Error('origin: [x, y, z] is needed');
  j.origin = o.map(Number);
  const ax = a.axis ?? 'z';
  if (Array.isArray(ax)) {
    if (ax.length !== 3 || ax.some(q => !Number.isFinite(+q)) || !(Math.hypot(...ax.map(Number)) > 1e-9)) throw new Error('axis: "x", "y", "z" or a direction [x, y, z] is needed');
    const u = ax.map(Number), len = Math.hypot(...u), n = u.map(q => +(q / len).toFixed(9)), k = n.findIndex(q => Math.abs(q - 1) < 1e-9);
    j.axis = k >= 0 && n.every((q, i) => i === k || Math.abs(q) < 1e-9) ? 'xyz'[k] : n;
  } else if (['x', 'y', 'z'].includes(ax)) j.axis = ax;
  else throw new Error('axis: "x", "y", "z" or a direction [x, y, z] is needed');
  const lin = a.type === 'slider';
  j.value = num('value', 0);
  if (a.value2 !== undefined) j.value2 = num('value2', 0);
  if (a.value3 !== undefined) j.value3 = num('value3', 0);
  j.min = num('min', lin ? 0 : -180);
  j.max = num('max', lin ? 50 : 180);
  if (j.max < j.min) throw new Error('max must not be smaller than min');
  if (a.limits === false) j.limits = false;
  if (a.link && typeof a.link === 'object') {
    if (!joints.some(q => q.id === a.link.from && q.id !== selfId)) throw new Error(`link.from: no other joint with the id "${a.link.from}"`);
    j.link = { from: a.link.from, ratio: Number.isFinite(+a.link.ratio) ? +a.link.ratio : 1, offset: Number.isFinite(+a.link.offset) ? +a.link.offset : 0 };
  }
  return j;
}

// tools that change the design: refused while the user lets agents only read (Einstellungen → KI-Agenten)
export const WRITE_TOOLS = new Set(['add_features', 'update_feature', 'delete_features', 'set_params', 'set_project', 'new_design', 'insert_standard_part',
  'add_tool', 'add_operation', 'update_operation', 'delete_operations', 'update_setup', 'add_setup', 'delete_setups', 'set_placement',
  'add_joint', 'update_joint', 'delete_joints', 'undo', 'redo']);

export async function agentCall(name, a, api) {
  a ||= {};
  if (WRITE_TOOLS.has(name) && api.readOnly?.()) throw new Error(`"${name}" changes the design, but the user lets AI agents only read it (WerkFab: Preferences → AI agents). Ask the user to allow changes.`);
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
      // the value is "expr"; "value" is taken too (a common slip) – but never the text "undefined"
      const exprOf = q => q.expr ?? q.value;
      for (const q of a.params || []) if (exprOf(q) == null || String(exprOf(q)).trim() === '') throw new Error(`Parameter "${q.name}": "expr" (number or expression) is missing`);
      api.commit(p => { p.params ||= []; for (const q of a.params || []) { const ex = String(exprOf(q)), old = p.params.find(x => x.name === q.name); if (old) old.expr = ex; else p.params.push({ name: q.name, expr: ex }); } });
      return { params: api.project().params, ...(await errorsNow()) };
    }
    case 'set_project': {
      const q = a.project;
      if (!q || !Array.isArray(q.features)) throw new Error('project: needs at least a "features" list');
      api.commit(p => { for (const k of ['name', 'params', 'features', 'cam', 'post', 'bodyMeta', 'assembly']) if (q[k] !== undefined) p[k] = structuredClone(q[k]); });
      api.note('replaced');
      return errorsNow();
    }
    case 'new_design': {
      api.commit(p => { p.features = []; p.params = []; p.cam.ops = []; p.bodyMeta = {}; delete p.assembly; if (a.name) p.name = String(a.name).slice(0, 80); });
      api.note('emptied');
      return { ok: true };
    }
    case 'get_model': {
      const m = await api.settled();
      return { bodies: m.bodies.map(api.bodyInfo), errors: m.errors || {}, ...(m.notes && Object.keys(m.notes).length ? { notes: m.notes } : {}), kernel: m.kernel };
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
      // fields given next to type / setup / tool (instead of inside "fields") count as fields too
      const loose = Object.fromEntries(Object.entries(a).filter(([k]) => !['type', 'setup', 'tool', 'fields'].includes(k)));
      if (Object.keys(loose).length) a.fields = { ...loose, ...(a.fields || {}) };
      if (a.fields) a.fields = depthAsBottom(a.type, structuredClone(a.fields));
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
      const patch = depthAsBottom(api.project().cam.ops.find(o => o.id === a.id).type, structuredClone(a.patch));
      api.commit(p => { const o = p.cam.ops.find(q => q.id === a.id); for (const [k, v] of Object.entries(patch)) { if (v === null) delete o[k]; else if (k === 'heights') o.heights = { ...(o.heights || {}), ...v }; else o[k] = v; } });
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
    case 'delete_setups': { const r = api.deleteSetups(a.ids || []); await api.settled(); return { ...r, ...api.cam(false) }; }
    case 'simulate': return api.simulate(a.setup || null, a.at, a.view || 'iso');
    case 'check_nc_program': { await api.settled(); return api.check(a.setup || null, a.post || null, a.against_part); }
    case 'get_nc_program': { await api.settled(); return api.nc(a.setup || null, a.post || null); }
    case 'get_assembly': return api.assembly(a.collisions);
    case 'set_placement': {
      const m = await api.settled();
      if (!m.bodies.some(b => b.id === a.body)) throw new Error(`No body with the id "${a.body}" (ids: ${m.bodies.map(b => b.id).join(', ')})`);
      const keys = ['dx', 'dy', 'dz', 'rx', 'ry', 'rz'];
      for (const k of keys) if (a[k] !== undefined && !Number.isFinite(+a[k])) throw new Error(`${k}: a number is needed`);
      api.commit(p => {
        p.assembly ||= { placements: {}, joints: [] };
        p.assembly.placements ||= {};
        const pl = { ...(p.assembly.placements[a.body] || {}) };
        for (const k of keys) if (a[k] !== undefined) pl[k] = +a[k];
        if (keys.some(k => +pl[k])) p.assembly.placements[a.body] = pl; else delete p.assembly.placements[a.body];
      });
      return api.assembly(false);
    }
    case 'add_joint': {
      const m = await api.settled(), ids = m.bodies.map(b => b.id), asm = api.project().assembly || {};
      const j = jointFields(a, ids, asm.joints || [], null);
      j.id = api.uid('j');
      j.name = String(a.name || '').trim().slice(0, 60) || `Joint${(asm.joints || []).length + 1}`;
      api.commit(p => {
        p.assembly ||= { placements: {}, joints: [] };
        p.assembly.joints = (p.assembly.joints || []).filter(q => q.child !== j.child);
        p.assembly.joints.push(j);
      });
      return { id: j.id, ...(await api.assembly(a.collisions)) };
    }
    case 'update_joint': {
      const asm = api.project().assembly || {}, old = (asm.joints || []).find(q => q.id === a.id);
      if (!old) throw new Error(`No joint with the id "${a.id}"`);
      if (!a.patch || typeof a.patch !== 'object' || 'id' in a.patch) throw new Error('patch: an object with the fields to change is needed (not the id)');
      const m = await api.settled(), next = structuredClone(old);
      for (const [k, v] of Object.entries(structuredClone(a.patch))) { if (v === null) delete next[k]; else next[k] = v; }
      const j = { ...next, ...jointFields(next, m.bodies.map(b => b.id), asm.joints || [], a.id) };
      if (a.patch.link === null) delete j.link;
      api.commit(p => { const i = p.assembly.joints.findIndex(q => q.id === a.id); p.assembly.joints[i] = j; if ('child' in a.patch) p.assembly.joints = p.assembly.joints.filter(q => q.id === a.id || q.child !== j.child); });
      return api.assembly(a.collisions);
    }
    case 'delete_joints': {
      const ids = new Set(a.ids || []), n = (api.project().assembly?.joints || []).filter(q => ids.has(q.id)).length;
      if (!n) throw new Error('None of these ids is a joint');
      api.commit(p => { p.assembly.joints = p.assembly.joints.filter(q => !ids.has(q.id)); for (const q of p.assembly.joints) if (q.link && ids.has(q.link.from)) delete q.link; });
      return { deleted: n, ...(await api.assembly(false)) };
    }
    case 'motion_study': return api.motion(a.joint || null, a.steps);
    case 'export_robot': { await api.settled(); return api.robot(a.format || 'urdf', String(a.package || '').trim(), a.meshes === true, a.collision); }
    case 'undo': api.undo(); return errorsNow();
    case 'redo': api.redo(); return errorsNow();
    default: throw new Error(`Unknown tool "${name}"`);
  }
}
