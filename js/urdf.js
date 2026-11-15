// URDF: an assembly as a robot description – every body a link with its mesh (binary STL, metres) and its mass
// properties, every joint between two bodies a joint. Plain data in, text and bytes out (no scene, no kernel).

// Mass properties of a closed triangle mesh at density 1: volume, centre of mass and the inertia about the centre
// of mass [ixx, ixy, ixz, iyy, iyz, izz] – summed over the tetrahedra from the origin to every triangle.
export function meshMass(pos, idx) {
  const n = idx ? idx.length / 3 : pos.length / 9;
  let V = 0;
  const m1 = [0, 0, 0], C = [0, 0, 0, 0, 0, 0]; // first moments; second moments xx xy xz yy yz zz
  const pair = [[0, 0], [0, 1], [0, 2], [1, 1], [1, 2], [2, 2]];
  for (let t = 0; t < n; t++) {
    const v = [0, 1, 2].map(k => { const i = (idx ? idx[3 * t + k] : 3 * t + k) * 3; return [pos[i], pos[i + 1], pos[i + 2]]; });
    const [a, b, c] = v;
    const det = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
    V += det / 6;
    for (let k = 0; k < 3; k++) m1[k] += (det / 24) * (a[k] + b[k] + c[k]);
    pair.forEach(([i, j], q) => {
      let s = 0;
      for (let p = 0; p < 3; p++) for (let r = 0; r < 3; r++) s += v[p][i] * v[r][j] * (p === r ? 2 : 1);
      C[q] += (det / 120) * s;
    });
  }
  if (!(Math.abs(V) > 1e-12)) return { volume: 0, com: [0, 0, 0], inertia: [0, 0, 0, 0, 0, 0] };
  const com = m1.map(x => x / V);
  // about the centre of mass
  const cc = pair.map(([i, j], q) => C[q] - V * com[i] * com[j]);
  const s = Math.sign(V);
  return { volume: Math.abs(V), com, inertia: [cc[3] + cc[5], -cc[1], -cc[2], cc[0] + cc[5], -cc[4], cc[0] + cc[3]].map(x => x * s) };
}

// binary STL of a mesh, moved by −origin and scaled
export function stlBinary(pos, idx, origin = [0, 0, 0], scale = 1) {
  const n = idx ? idx.length / 3 : pos.length / 9, buf = new ArrayBuffer(84 + 50 * n), dv = new DataView(buf);
  dv.setUint32(80, n, true);
  let o = 84;
  for (let t = 0; t < n; t++) {
    const v = [0, 1, 2].map(k => { const i = (idx ? idx[3 * t + k] : 3 * t + k) * 3; return [(pos[i] - origin[0]) * scale, (pos[i + 1] - origin[1]) * scale, (pos[i + 2] - origin[2]) * scale]; });
    const u = v[1].map((x, k) => x - v[0][k]), w = v[2].map((x, k) => x - v[0][k]);
    const nn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], len = Math.hypot(...nn) || 1;
    for (let k = 0; k < 3; k++) dv.setFloat32(o + 4 * k, nn[k] / len, true);
    for (let p = 0; p < 3; p++) for (let k = 0; k < 3; k++) dv.setFloat32(o + 12 + 12 * p + 4 * k, v[p][k], true);
    o += 50;
  }
  return new Uint8Array(buf);
}

// names as URDF and ROS like them: letters, digits and underscores, each one once
export function urdfNames(names) {
  const used = new Set();
  return names.map(raw => {
    let s = String(raw || 'link').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'link';
    if (/^\d/.test(s)) s = 'l_' + s;
    let out = s;
    for (let k = 2; used.has(out); k++) out = `${s}_${k}`;
    used.add(out);
    return out;
  });
}

const f = x => { const v = +(+x).toPrecision(9); return Object.is(v, -0) || Math.abs(v) < 1e-9 ? '0' : String(v); };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// links: [{ name, mesh? (file), color? [r, g, b], mass? (kg), com? [m], inertia? [ixx, ixy, ixz, iyy, iyz, izz] (kg·m²) }]
// joints: [{ name, type (fixed, revolute, continuous, prismatic), parent, child, xyz [m], axis?, lower?, upper?,
//            mimic?: { joint, multiplier } }] – all link frames are parallel to the world at the pose of the export
export function buildUrdf(name, links, joints, opt = {}) {
  const pre = opt.meshPrefix || '';
  const out = ['<?xml version="1.0"?>', `<robot name="${esc(name)}">`];
  for (const l of links) {
    if (!l.mesh && !(l.mass > 0)) { out.push(`  <link name="${esc(l.name)}"/>`); continue; }
    out.push(`  <link name="${esc(l.name)}">`);
    if (l.mass > 0 && l.inertia) {
      const i = l.inertia;
      out.push('    <inertial>', `      <origin xyz="${l.com.map(f).join(' ')}" rpy="0 0 0"/>`, `      <mass value="${f(l.mass)}"/>`,
        `      <inertia ixx="${f(i[0])}" ixy="${f(i[1])}" ixz="${f(i[2])}" iyy="${f(i[3])}" iyz="${f(i[4])}" izz="${f(i[5])}"/>`, '    </inertial>');
    }
    if (l.mesh) {
      const geo = `      <geometry><mesh filename="${esc(pre + l.mesh)}"/></geometry>`;
      out.push('    <visual>', geo);
      if (l.color) out.push(`      <material name="${esc(l.name)}_colour"><color rgba="${l.color.map(f).join(' ')} 1"/></material>`);
      out.push('    </visual>', '    <collision>');
      if (l.box) out.push(`      <origin xyz="${l.box.center.map(f).join(' ')}" rpy="0 0 0"/>`, `      <geometry><box size="${l.box.size.map(f).join(' ')}"/></geometry>`);
      else out.push(l.collisionMesh ? `      <geometry><mesh filename="${esc(pre + l.collisionMesh)}"/></geometry>` : geo);
      out.push('    </collision>');
    }
    out.push('  </link>');
  }
  for (const j of joints) {
    out.push(`  <joint name="${esc(j.name)}" type="${j.type}">`, `    <parent link="${esc(j.parent)}"/>`, `    <child link="${esc(j.child)}"/>`,
      `    <origin xyz="${(j.xyz || [0, 0, 0]).map(f).join(' ')}" rpy="0 0 0"/>`);
    if (j.type !== 'fixed') {
      out.push(`    <axis xyz="${j.axis.map(f).join(' ')}"/>`);
      if (j.type !== 'continuous') out.push(`    <limit lower="${f(j.lower)}" upper="${f(j.upper)}" effort="${f(j.effort ?? 100)}" velocity="${f(j.velocity ?? 1)}"/>`);
      else out.push(`    <limit effort="${f(j.effort ?? 100)}" velocity="${f(j.velocity ?? 1)}"/>`);
      if (j.mimic) out.push(`    <mimic joint="${esc(j.mimic.joint)}" multiplier="${f(j.mimic.multiplier)}" offset="0"/>`);
    }
    out.push('  </joint>');
  }
  out.push('</robot>', '');
  return out.join('\n');
}

// The degrees of freedom of a joint as a chain from the parent to the child: [{ rot (true: turning), axis (key:
// 'n' the joint's axis, 'u' and 'w' the two directions across it), k (which value of the joint: 0, 1, 2) }]
export const URDF_CHAIN = {
  rigid: [],
  revolute: [{ rot: true, axis: 'n', k: 0 }],
  slider: [{ rot: false, axis: 'n', k: 0 }],
  cylindrical: [{ rot: false, axis: 'n', k: 1 }, { rot: true, axis: 'n', k: 0 }],
  planar: [{ rot: false, axis: 'u', k: 1 }, { rot: false, axis: 'w', k: 2 }, { rot: true, axis: 'n', k: 0 }],
  ball: [{ rot: true, axis: 'w', k: 2 }, { rot: true, axis: 'u', k: 1 }, { rot: true, axis: 'n', k: 0 }],
};

// the root: a link without a mesh that is no joint's child (the ground the bodies stand on)
const rootOf = (links, joints) => links.find(l => !l.mesh && !joints.some(j => j.child === l.name))?.name;

// SDF 1.7 (Gazebo): the same links and joints as a model. Links carry their place in the model (pos, metres; all
// frames parallel to the model); what stands on the ground is fixed to "world". Links between the joints of a
// chain get a very small mass, since a simulator does not take a link without one.
export function buildSdf(name, links, joints) {
  const root = rootOf(links, joints), out = ['<?xml version="1.0"?>', '<sdf version="1.7">', `  <model name="${esc(name)}">`];
  for (const l of links) {
    if (l.name === root) continue;
    out.push(`    <link name="${esc(l.name)}">`, `      <pose>${(l.pos || [0, 0, 0]).map(f).join(' ')} 0 0 0</pose>`);
    const i = l.mass > 0 && l.inertia ? l.inertia : [1e-9, 0, 0, 1e-9, 0, 1e-9], tag = ['ixx', 'ixy', 'ixz', 'iyy', 'iyz', 'izz'];
    out.push('      <inertial>', `        <pose>${(l.mass > 0 && l.com ? l.com : [0, 0, 0]).map(f).join(' ')} 0 0 0</pose>`, `        <mass>${f(l.mass > 0 ? l.mass : 1e-6)}</mass>`,
      `        <inertia>${tag.map((t, k) => `<${t}>${f(i[k])}</${t}>`).join('')}</inertia>`, '      </inertial>');
    if (l.mesh) {
      const geo = `        <geometry><mesh><uri>${esc(l.mesh)}</uri></mesh></geometry>`, c = l.color ? `${l.color.map(f).join(' ')} 1` : null;
      out.push('      <visual name="visual">', geo);
      if (c) out.push(`        <material><ambient>${c}</ambient><diffuse>${c}</diffuse></material>`);
      out.push('      </visual>', '      <collision name="collision">');
      if (l.box) out.push(`        <pose>${l.box.center.map(f).join(' ')} 0 0 0</pose>`, `        <geometry><box><size>${l.box.size.map(f).join(' ')}</size></box></geometry>`);
      else out.push(l.collisionMesh ? `        <geometry><mesh><uri>${esc(l.collisionMesh)}</uri></mesh></geometry>` : geo);
      out.push('      </collision>');
    }
    out.push('    </link>');
  }
  for (const j of joints) {
    out.push(`    <joint name="${esc(j.name)}" type="${j.type === 'continuous' ? 'revolute' : j.type}">`, `      <parent>${j.parent === root ? 'world' : esc(j.parent)}</parent>`, `      <child>${esc(j.child)}</child>`);
    if (j.type !== 'fixed') {
      if (j.mimic) out.push(`      <!-- follows the joint "${esc(j.mimic.joint)}" with the factor ${f(j.mimic.multiplier)} -->`);
      out.push('      <axis>', `        <xyz>${j.axis.map(f).join(' ')}</xyz>`);
      if (j.type !== 'continuous') out.push(`        <limit><lower>${f(j.lower)}</lower><upper>${f(j.upper)}</upper></limit>`);
      out.push('      </axis>');
    }
    out.push('    </joint>');
  }
  out.push('  </model>', '</sdf>', '');
  return out.join('\n');
}
export const sdfConfig = name => `<?xml version="1.0"?>\n<model>\n  <name>${esc(name)}</name>\n  <version>1.0</version>\n  <sdf version="1.7">model.sdf</sdf>\n  <description>Exported from WerkFab</description>\n</model>\n`;

// MJCF (MuJoCo): bodies nested as the joints say, each with its place relative to its parent. The joints of a
// chain (cylindrical, planar, ball) all sit in the body they move, in their order from the parent; a body that
// stands on the ground has no joint. A linked joint becomes a joint equality.
export function buildMjcf(name, links, joints) {
  const root = rootOf(links, joints), by = new Map(links.map(l => [l.name, l]));
  const out = ['<mujoco model="' + esc(name) + '">', '  <compiler angle="radian" meshdir="meshes"/>', '  <asset>'];
  for (const l of links) if (l.mesh) out.push(`    <mesh name="${esc(l.name)}" file="${esc(l.mesh.replace(/^meshes\//, ''))}"/>`);
  for (const l of links) if (l.collisionMesh && !l.box) out.push(`    <mesh name="${esc(l.name)}_collision" file="${esc(l.collisionMesh.replace(/^meshes\//, ''))}"/>`);
  out.push('  </asset>', '  <worldbody>');
  const seen = new Set();
  const walk = (j, pos, chain, depth) => {
    const here = pos.map((v, k) => v + (j.xyz?.[k] || 0)), js = j.type === 'fixed' ? chain : [...chain, j], l = by.get(j.child);
    if (!l || seen.has(j.child)) return;
    seen.add(j.child);
    // a link that only joins two joints of a chain: its joints go on to the body behind it
    if (!l.mesh && !(l.mass > 0)) { for (const n of joints.filter(q => q.parent === l.name)) walk(n, here, js, depth); return; }
    const pad = '  '.repeat(depth);
    out.push(`${pad}<body name="${esc(l.name)}" pos="${here.map(f).join(' ')}">`);
    if (l.mass > 0 && l.inertia) { const i = l.inertia; out.push(`${pad}  <inertial pos="${l.com.map(f).join(' ')}" mass="${f(l.mass)}" fullinertia="${[i[0], i[3], i[5], i[1], i[2], i[4]].map(f).join(' ')}"/>`); }
    for (const q of js) out.push(`${pad}  <joint name="${esc(q.name)}" type="${q.type === 'prismatic' ? 'slide' : 'hinge'}" axis="${q.axis.map(f).join(' ')}"${q.type === 'continuous' ? '' : ` limited="true" range="${f(q.lower)} ${f(q.upper)}"`}/>`);
    // a shape of its own for collisions: the mesh is then only looked at (group 2), the shape only collides (group 3)
    const own = l.box || l.collisionMesh;
    if (l.mesh) out.push(`${pad}  <geom type="mesh" mesh="${esc(l.name)}"${own ? ' contype="0" conaffinity="0" group="2"' : ''}${l.color ? ` rgba="${l.color.map(f).join(' ')} 1"` : ''}/>`);
    if (l.box) out.push(`${pad}  <geom type="box" pos="${l.box.center.map(f).join(' ')}" size="${l.box.size.map(v => f(v / 2)).join(' ')}" group="3"/>`);
    else if (l.collisionMesh) out.push(`${pad}  <geom type="mesh" mesh="${esc(l.name)}_collision" group="3"/>`);
    for (const n of joints.filter(q => q.parent === l.name)) walk(n, [0, 0, 0], [], depth + 1);
    out.push(`${pad}</body>`);
  };
  for (const j of joints.filter(q => q.parent === root)) walk(j, [0, 0, 0], [], 2);
  out.push('  </worldbody>');
  const mim = joints.filter(j => j.mimic);
  if (mim.length) out.push('  <equality>', ...mim.map(j => `    <joint joint1="${esc(j.name)}" joint2="${esc(j.mimic.joint)}" polycoef="0 ${f(j.mimic.multiplier)} 0 0 0"/>`), '  </equality>');
  out.push('</mujoco>', '');
  return out.join('\n');
}

// The convex hull of the points of a mesh (pos: xyz, xyz, …) as triangles that look outward: Float32Array with three
// corners per triangle, or null where the points lie in one plane. Built point by point: the faces a new point
// looks at go, and the rim they leave is joined to the point.
export function convexHull(pos) {
  // every point once (to a millionth of the size), so that no face has two equal corners
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { if (pos[i + k] < lo[k]) lo[k] = pos[i + k]; if (pos[i + k] > hi[k]) hi[k] = pos[i + k]; }
  const size = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  if (!(size > 0)) return null;
  const q = size * 1e-6, seen = new Set(), P = [];
  for (let i = 0; i < pos.length; i += 3) {
    const key = Math.round(pos[i] / q) + ',' + Math.round(pos[i + 1] / q) + ',' + Math.round(pos[i + 2] / q);
    if (!seen.has(key)) { seen.add(key); P.push([pos[i], pos[i + 1], pos[i + 2]]); }
  }
  const eps = size * 1e-7, sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  // a first tetrahedron: the two points farthest apart along X, the one farthest from their line, the one farthest from that plane
  let i0 = 0, i1 = 0;
  P.forEach((p, i) => { if (p[0] < P[i0][0]) i0 = i; if (p[0] > P[i1][0]) i1 = i; });
  if (i0 === i1) { P.forEach((p, i) => { if (p[1] < P[i0][1]) i0 = i; if (p[1] > P[i1][1]) i1 = i; }); }
  if (i0 === i1) { P.forEach((p, i) => { if (p[2] < P[i0][2]) i0 = i; if (p[2] > P[i1][2]) i1 = i; }); }
  if (i0 === i1) return null;
  const ax = sub(P[i1], P[i0]);
  let i2 = -1, best = eps * eps;
  P.forEach((p, i) => { const c = cross(ax, sub(p, P[i0])), d = dot(c, c) / dot(ax, ax); if (d > best) { best = d; i2 = i; } });
  if (i2 < 0) return null;
  const n0 = cross(ax, sub(P[i2], P[i0])), nl = Math.hypot(...n0);
  let i3 = -1;
  best = eps;
  P.forEach((p, i) => { const d = Math.abs(dot(n0, sub(p, P[i0]))) / nl; if (d > best) { best = d; i3 = i; } });
  if (i3 < 0) return null;
  const faces = new Set();
  const face = (a, b, c) => { const n = cross(sub(P[b], P[a]), sub(P[c], P[a])), l = Math.hypot(...n) || 1, u = [n[0] / l, n[1] / l, n[2] / l]; return { v: [a, b, c], n: u, d: dot(u, P[a]) }; };
  const inside = [0, 1, 2].map(k => (P[i0][k] + P[i1][k] + P[i2][k] + P[i3][k]) / 4);
  const add = (a, b, c) => { let fc = face(a, b, c); if (dot(fc.n, inside) - fc.d > 0) fc = face(a, c, b); faces.add(fc); };
  add(i0, i1, i2); add(i0, i1, i3); add(i0, i2, i3); add(i1, i2, i3);
  const used = new Set([i0, i1, i2, i3]);
  for (let i = 0; i < P.length; i++) {
    if (used.has(i)) continue;
    const p = P[i], vis = [];
    for (const fc of faces) if (dot(fc.n, p) - fc.d > eps) vis.push(fc);
    if (!vis.length) continue;
    const edges = new Map();
    for (const fc of vis) for (let k = 0; k < 3; k++) edges.set(fc.v[k] + '_' + fc.v[(k + 1) % 3], [fc.v[k], fc.v[(k + 1) % 3]]);
    for (const fc of vis) faces.delete(fc);
    for (const [a, b] of edges.values()) if (!edges.has(b + '_' + a)) faces.add(face(a, b, i));
  }
  const out = new Float32Array(faces.size * 9);
  let o = 0;
  for (const fc of faces) for (const k of fc.v) { out[o++] = P[k][0]; out[o++] = P[k][1]; out[o++] = P[k][2]; }
  return out;
}
