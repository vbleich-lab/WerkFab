// Tests for the URDF export (node tools/test-urdf.mjs)
import { meshMass, stlBinary, urdfNames, buildUrdf, buildSdf, sdfConfig, buildMjcf, convexHull, URDF_CHAIN } from '../js/urdf.js';
const ok = (n, c, x = '') => { console.log((c ? 'OK   ' : 'FEHL ') + n + '  ' + x); if (!c) process.exitCode = 1; };
const near = (a, b, t = 1e-6) => Math.abs(a - b) <= t * Math.max(1, Math.abs(b));

// a box a × b × c with one corner at p (12 triangles, outward)
function box(p, a, b, c) {
  const v = [];
  for (let k = 0; k < 8; k++) v.push(p[0] + (k & 1 ? a : 0), p[1] + (k & 2 ? b : 0), p[2] + (k & 4 ? c : 0));
  const idx = [0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5];
  return { pos: new Float32Array(v), idx: new Uint32Array(idx) };
}

{
  const { pos, idx } = box([10, 20, 30], 40, 20, 10), m = meshMass(pos, idx);
  ok('Quader: Volumen', near(m.volume, 8000, 1e-5), m.volume.toFixed(2));
  ok('Quader: Schwerpunkt', near(m.com[0], 30, 1e-5) && near(m.com[1], 30, 1e-5) && near(m.com[2], 35, 1e-5), m.com.map(x => x.toFixed(3)).join(' '));
  // I = V/12 · (b² + c²) about the centre of mass, no products of inertia
  const want = [8000 / 12 * (400 + 100), 0, 0, 8000 / 12 * (1600 + 100), 0, 8000 / 12 * (1600 + 400)];
  ok('Quader: Trägheit um den Schwerpunkt', m.inertia.every((x, k) => Math.abs(x - want[k]) < 1e-3 * want[5]), m.inertia.map(x => x.toFixed(0)).join(' '));
  // the same box turned inside out: same numbers
  const flip = new Uint32Array(idx.length);
  for (let t = 0; t < idx.length; t += 3) { flip[t] = idx[t]; flip[t + 1] = idx[t + 2]; flip[t + 2] = idx[t + 1]; }
  const mf = meshMass(pos, flip);
  ok('Quader mit nach innen gedrehten Dreiecken: gleiche Werte', near(mf.volume, 8000, 1e-5) && Math.abs(mf.inertia[5] - want[5]) < 1e-3 * want[5] && mf.inertia[0] > 0);
  // without an index (three corners per triangle)
  const flat = new Float32Array(idx.length * 3);
  idx.forEach((i, k) => flat.set(pos.subarray(3 * i, 3 * i + 3), 3 * k));
  ok('Ohne Index: gleiches Volumen', near(meshMass(flat, null).volume, 8000, 1e-5));
  ok('Leeres Netz: Volumen 0', meshMass(new Float32Array(0), null).volume === 0);
}
{
  // a product of inertia: two boxes side by side and offset, against the parallel axis theorem
  const a = box([0, 0, 0], 10, 10, 10), b = box([10, 10, 0], 10, 10, 10);
  const pos = new Float32Array([...a.pos, ...b.pos]), idx = new Uint32Array([...a.idx, ...[...b.idx].map(i => i + 8)]);
  const m = meshMass(pos, idx);
  // each cube: V = 1000, own I = 1000·100/6; centres at (±5, ±5, 0) from the common centre
  const own = 1000 * 100 / 6, ixx = 2 * (own + 1000 * 25), izz = 2 * (own + 1000 * 50), ixy = -2 * 1000 * 25;
  ok('Zwei versetzte Würfel: Ixx, Izz und Ixy nach dem Satz von Steiner', near(m.inertia[0], ixx, 1e-4) && near(m.inertia[5], izz, 1e-4) && near(m.inertia[1], ixy, 1e-4), `${m.inertia[0].toFixed(0)} ${m.inertia[5].toFixed(0)} ${m.inertia[1].toFixed(0)}`);
}
{
  const { pos, idx } = box([10, 20, 30], 40, 20, 10), stl = stlBinary(pos, idx, [10, 20, 30], 0.001), dv = new DataView(stl.buffer);
  let max = 0, min = Infinity, unit = true;
  for (let t = 0; t < 12; t++) {
    const o = 84 + 50 * t, n = [0, 1, 2].map(k => dv.getFloat32(o + 4 * k, true));
    if (Math.abs(Math.hypot(...n) - 1) > 1e-5) unit = false;
    for (let k = 0; k < 9; k++) { const x = dv.getFloat32(o + 12 + 4 * k, true); max = Math.max(max, x); min = Math.min(min, x); }
  }
  ok('STL: 12 Dreiecke, in Metern, auf den Ursprung des Glieds bezogen', stl.length === 84 + 600 && dv.getUint32(80, true) === 12 && near(max, 0.04, 1e-5) && Math.abs(min) < 1e-9 && unit, `${min} … ${max}`);
}
{
  const n = urdfNames(['base_link', 'Körper 1', 'Körper 1', '3 Träger/Ö', '', 'Maß']);
  ok('Namen: nur Buchstaben, Ziffern, Unterstrich – und jeder einmal', new Set(n).size === n.length && n.every(s => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) && n[1] === 'Korper_1' && n[2] === 'Korper_1_2' && n[5] === 'Mass', n.join(' '));
}
{
  const x = buildUrdf('arm', [{ name: 'base_link' }, { name: 'a', mesh: 'meshes/a.stl', color: [1, 0, 0], mass: 2, com: [0, 0, 0.1], inertia: [1, 0, 0, 2, 0, 3] }, { name: 'b', mesh: 'meshes/b.stl' }, { name: 'c', mesh: 'meshes/c.stl' }], [
    { name: 'a_fixed', type: 'fixed', parent: 'base_link', child: 'a', xyz: [0, 0, 0] },
    { name: 'hinge', type: 'revolute', parent: 'a', child: 'b', xyz: [0.1, 0, 0.05], axis: [0, 0, 1], lower: -1, upper: 2 },
    { name: 'slide', type: 'prismatic', parent: 'b', child: 'c', xyz: [0, 0, 0], axis: [1, 0, 0], lower: -0.05, upper: 0.05, mimic: { joint: 'hinge', multiplier: 0.01 } }]);
  const count = re => (x.match(re) || []).length;
  ok('URDF: ein Wurzelglied, Glieder und Gelenke vollständig', x.startsWith('<?xml') && count(/<link /g) === 4 && count(/<joint /g) === 3 && x.includes('<link name="base_link"/>') && x.includes('<robot name="arm">') && x.trim().endsWith('</robot>'));
  ok('URDF: Masse, Schwerpunkt und Trägheit des Glieds', x.includes('<mass value="2"/>') && x.includes('<origin xyz="0 0 0.1" rpy="0 0 0"/>') && x.includes('ixx="1" ixy="0" ixz="0" iyy="2" iyz="0" izz="3"'));
  ok('URDF: Drehgelenk mit Achse und Grenzen, Schiebegelenk folgt ihm', x.includes('<axis xyz="0 0 1"/>') && x.includes('<limit lower="-1" upper="2"') && x.includes('<mimic joint="hinge" multiplier="0.01" offset="0"/>') && !/type="fixed">[^]*?<axis[^]*?<\/joint>\s*<joint name="hinge"/.test(x));
  ok('URDF: Netz für Ansicht und Kollision, Farbe', count(/<mesh filename="meshes\/a\.stl"\/>/g) === 2 && x.includes('<color rgba="1 0 0 1"/>'));
  // every child once, every parent a link: a tree
  const kids = [...x.matchAll(/<child link="([^"]+)"/g)].map(m => m[1]), links = [...x.matchAll(/<link name="([^"]+)"/g)].map(m => m[1]);
  ok('URDF: Baum – jedes Glied außer der Wurzel ist genau einmal Kind', new Set(kids).size === kids.length && links.filter(l => !kids.includes(l)).join() === 'base_link');
}
{
  const dof = t => URDF_CHAIN[t].length, rot = t => URDF_CHAIN[t].filter(d => d.rot).length;
  ok('Gelenkarten: Freiheitsgrade als Kette', dof('rigid') === 0 && dof('revolute') === 1 && rot('slider') === 0 && dof('cylindrical') === 2 && rot('cylindrical') === 1 && dof('planar') === 3 && rot('planar') === 1 && rot('ball') === 3
    && Object.values(URDF_CHAIN).every(c => new Set(c.map(d => d.k)).size === c.length));
}
{
  // a cylindrical joint as a chain: base → (slide) → link between → (hinge) → b; c follows the hinge
  const links = [{ name: 'base_link' }, { name: 'a', mesh: 'meshes/a.stl', pos: [0, 0, 0], color: [1, 0, 0], mass: 2, com: [0, 0, 0.1], inertia: [1, 0, 0, 2, 0, 3] },
    { name: 'b_cyl_1', pos: [0.1, 0, 0.05] }, { name: 'b', mesh: 'meshes/b.stl', pos: [0.1, 0, 0.05], mass: 1, com: [0, 0, 0], inertia: [1, 0, 0, 1, 0, 1] }, { name: 'c', mesh: 'meshes/c.stl', pos: [0.1, 0.2, 0.05] }];
  const joints = [{ name: 'a_fixed', type: 'fixed', parent: 'base_link', child: 'a', xyz: [0, 0, 0] },
    { name: 'cyl_1', type: 'prismatic', parent: 'a', child: 'b_cyl_1', xyz: [0.1, 0, 0.05], axis: [0, 0, 1], lower: -1, upper: 1 },
    { name: 'cyl_2', type: 'continuous', parent: 'b_cyl_1', child: 'b', xyz: [0, 0, 0], axis: [0, 0, 1] },
    { name: 'follow', type: 'revolute', parent: 'b', child: 'c', xyz: [0, 0.2, 0], axis: [1, 0, 0], lower: -1, upper: 1, mimic: { joint: 'cyl_2', multiplier: 0.5 } }];
  const count = (x, re) => (x.match(re) || []).length;
  const u = buildUrdf('arm', links, joints, { meshPrefix: 'package://arm_description/' });
  ok('URDF mit Paketnamen: Netze als package://…', count(u, /filename="package:\/\/arm_description\/meshes\/[abc]\.stl"/g) === 6 && u.includes('type="continuous"') && !/type="continuous">[^]*?<limit lower/.test(u.split('<joint name="follow"')[0].split('<joint name="cyl_2"')[1]));
  const s = buildSdf('arm', links, joints);
  ok('SDF: Glieder mit Lage, Boden als world, kein Wurzelglied', s.includes('<sdf version="1.7">') && count(s, /<link name=/g) === 4 && !s.includes('base_link') && s.includes('<parent>world</parent>') && s.includes('<pose>0.1 0.2 0.05 0 0 0</pose>'));
  ok('SDF: Zwischenglied mit kleiner Masse, endloses Drehgelenk ohne Grenzen, Kopplung als Hinweis', s.includes('<mass>0.000001</mass>') && /<joint name="cyl_2" type="revolute">(?:(?!<limit>)[^])*?<\/joint>/.test(s) && s.includes('follows the joint "cyl_2" with the factor 0.5') && s.includes('<uri>meshes/b.stl</uri>'));
  ok('SDF: Modellbeschreibung dazu', sdfConfig('arm').includes('<sdf version="1.7">model.sdf</sdf>') && sdfConfig('a<b').includes('a&lt;b'));
  const m = buildMjcf('arm', links, joints);
  const bodyB = m.slice(m.indexOf('<body name="b"'), m.indexOf('<body name="c"'));
  ok('MJCF: Körper verschachtelt, Kette in einem Körper in ihrer Reihenfolge', count(m, /<body /g) === 3 && count(m, /<\/body>/g) === 3 && !m.includes('b_cyl_1') && bodyB.indexOf('cyl_1') < bodyB.indexOf('cyl_2') && bodyB.includes('pos="0.1 0 0.05"') && bodyB.includes('type="slide"') && /name="cyl_2" type="hinge" axis="0 0 1"\/>/.test(bodyB));
  ok('MJCF: Netze, Trägheit, Lage zum Elternkörper, Kopplung', count(m, /<mesh name=/g) === 3 && m.includes('file="a.stl"') && m.includes('meshdir="meshes"') && m.includes('fullinertia="1 2 3 0 0 0"') && m.includes('<body name="c" pos="0 0.2 0">') && m.includes('<joint joint1="follow" joint2="cyl_2" polycoef="0 0.5 0 0 0"/>') && !/<body name="a"[^>]*>\s*(<inertial[^>]*>\s*)?<joint/.test(m));
}
{
  // convex hull: a box with points inside and on its faces keeps the 8 corners
  const { pos } = box([0, 0, 0], 40, 20, 10), extra = [20, 10, 5, 5, 5, 5, 20, 10, 0, 40, 10, 5, 0, 0, 0];
  const h = convexHull(new Float32Array([...pos, ...extra])), mh = meshMass(h, null);
  ok('Hülle eines Quaders mit inneren Punkten: sein Volumen, nach außen gerichtet', h && near(mh.volume, 8000, 1e-5) && near(mh.com[0], 20, 1e-4) && h.length % 9 === 0, `${h.length / 9} Dreiecke`);
  // an L: the hull fills the notch (a prism over a pentagon)
  const a = box([0, 0, 0], 30, 10, 10), b = box([0, 0, 0], 10, 30, 10);
  const hl = convexHull(new Float32Array([...a.pos, ...b.pos])), ml = meshMass(hl, null);
  // pentagon (0,0) (30,0) (30,10) (10,30) (0,30): area 700
  ok('Hülle eines Winkels: füllt die Ecke', near(ml.volume, 7000, 1e-5), ml.volume.toFixed(1));
  // points on a sphere: every triangle looks outward and the volume approaches the ball
  const s = [];
  for (let i = 0; i < 400; i++) { const z = 1 - (2 * (i + 0.5)) / 400, r = Math.sqrt(1 - z * z), p = i * 2.399963; s.push(10 * r * Math.cos(p), 10 * r * Math.sin(p), 10 * z); }
  const hs = convexHull(new Float32Array(s)), ms = meshMass(hs, null);
  let outward = true, edges = new Map();
  for (let t = 0; t < hs.length; t += 9) {
    const A = [hs[t], hs[t + 1], hs[t + 2]], B = [hs[t + 3], hs[t + 4], hs[t + 5]], C = [hs[t + 6], hs[t + 7], hs[t + 8]];
    const n = [(B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]), (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]), (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0])];
    if (n[0] * A[0] + n[1] * A[1] + n[2] * A[2] <= 0) outward = false;
    const key = p => p.map(x => x.toFixed(4)).join(',');
    for (const [p, q] of [[A, B], [B, C], [C, A]]) edges.set(key(p) + '>' + key(q), 1);
  }
  const closed = [...edges.keys()].every(k => edges.has(k.split('>').reverse().join('>')));
  ok('Hülle von 400 Punkten auf einer Kugel: geschlossen, nach außen, 796 Dreiecke', outward && closed && hs.length / 9 === 796 && ms.volume > 0.97 * (4 / 3) * Math.PI * 1000 && ms.volume < (4 / 3) * Math.PI * 1000, `${hs.length / 9} Dreiecke, V ${ms.volume.toFixed(0)}`);
  ok('Punkte in einer Ebene oder auf einer Linie: keine Hülle', convexHull(new Float32Array([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0])) === null && convexHull(new Float32Array([0, 0, 0, 1, 1, 1, 2, 2, 2])) === null && convexHull(new Float32Array([1, 1, 1, 1, 1, 1])) === null);
}
{
  // a shape of its own for collisions
  const links = [{ name: 'base_link' }, { name: 'a', mesh: 'meshes/a.stl', collisionMesh: 'meshes/a_collision.stl', pos: [0, 0, 0] }, { name: 'b', mesh: 'meshes/b.stl', box: { size: [0.04, 0.02, 0.01], center: [0.02, 0.01, 0.005] }, pos: [0, 0, 0] }];
  const joints = [{ name: 'a_fixed', type: 'fixed', parent: 'base_link', child: 'a', xyz: [0, 0, 0] }, { name: 'h', type: 'continuous', parent: 'a', child: 'b', xyz: [0, 0, 0], axis: [0, 0, 1] }];
  const u = buildUrdf('r', links, joints), s = buildSdf('r', links, joints), m = buildMjcf('r', links, joints);
  const colOf = (x, name) => { const l = x.slice(x.indexOf(`<link name="${name}"`)); return l.slice(l.indexOf('<collision'), l.indexOf('</collision>')); };
  ok('URDF: Kollision als eigenes Netz oder Quader, Ansicht bleibt das volle Netz', colOf(u, 'a').includes('meshes/a_collision.stl') && colOf(u, 'b').includes('<box size="0.04 0.02 0.01"/>') && colOf(u, 'b').includes('<origin xyz="0.02 0.01 0.005"') && (u.match(/filename="meshes\/b\.stl"/g) || []).length === 1);
  ok('SDF: Kollision als eigenes Netz oder Quader', colOf(s, 'a').includes('<uri>meshes/a_collision.stl</uri>') && colOf(s, 'b').includes('<box><size>0.04 0.02 0.01</size></box>') && colOf(s, 'b').includes('<pose>0.02 0.01 0.005 0 0 0</pose>'));
  ok('MJCF: Ansicht ohne Kollision, Hülle und Quader (halbe Kanten) kollidieren', m.includes('<mesh name="a_collision" file="a_collision.stl"/>') && m.includes('<geom type="mesh" mesh="a" contype="0" conaffinity="0" group="2"/>') && m.includes('<geom type="mesh" mesh="a_collision" group="3"/>') && m.includes('<geom type="box" pos="0.02 0.01 0.005" size="0.02 0.01 0.005" group="3"/>'));
}
