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
export function buildUrdf(name, links, joints) {
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
      const geo = `      <geometry><mesh filename="${esc(l.mesh)}"/></geometry>`;
      out.push('    <visual>', geo);
      if (l.color) out.push(`      <material name="${esc(l.name)}_colour"><color rgba="${l.color.map(f).join(' ')} 1"/></material>`);
      out.push('    </visual>', '    <collision>', geo, '    </collision>');
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
