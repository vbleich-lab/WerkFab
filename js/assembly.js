// Assemblies: every body is a component with a placement; joints add motion
// relative to a parent component (rigid, revolute about an axis, slider along an axis).
import * as THREE from 'three';

export const JOINT_TYPES = { rigid: 'Starr', revolute: 'Drehgelenk', slider: 'Schiebegelenk', cylindrical: 'Zylindrisch (drehen + schieben)', planar: 'Planar (in der Ebene)', ball: 'Kugelgelenk' };
// the motions of each joint type: [label, unit] per value (value, value2, value3)
export const JOINT_DOF = {
  rigid: [],
  revolute: [['Winkel', '°']],
  slider: [['Weg', 'mm']],
  cylindrical: [['Winkel', '°'], ['Weg entlang der Achse', 'mm']],
  planar: [['Drehung', '°'], ['Weg 1', 'mm'], ['Weg 2', 'mm']],
  ball: [['Drehung um die Achse', '°'], ['Neigung 1', '°'], ['Neigung 2', '°']],
};
const AXES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
// the axis of a joint without picked origins: X, Y or Z – or a free direction [x, y, z]
const axisOf = j => (Array.isArray(j.axis) && j.axis.length === 3 && Math.hypot(...j.axis.map(Number)) > 1e-9 ? new THREE.Vector3(...j.axis.map(Number)).normalize() : new THREE.Vector3(...(AXES[j.axis] || AXES.z)));
const DEG = Math.PI / 180;

export function placementMatrix(pl) {
  if (!pl) return new THREE.Matrix4();
  const e = new THREE.Euler((+pl.rx || 0) * DEG, (+pl.ry || 0) * DEG, (+pl.rz || 0) * DEG, 'XYZ');
  return new THREE.Matrix4().makeRotationFromEuler(e).setPosition(+pl.dx || 0, +pl.dy || 0, +pl.dz || 0);
}

function motionMatrix(j, value, value2 = 0, value3 = 0) {
  // joints made by picking: the axis is the parent's joint origin (point + normal)
  const axis = j.pO ? new THREE.Vector3(...j.pO.n).normalize() : axisOf(j);
  const o = new THREE.Vector3(...(j.pO ? j.pO.p : j.origin || [0, 0, 0]).map(Number));
  // two directions across the axis (for planar and ball joints)
  const u = new THREE.Vector3().crossVectors(axis, Math.abs(axis.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0)).normalize();
  const w = new THREE.Vector3().crossVectors(axis, u);
  const about = (m, ax, deg) => new THREE.Matrix4().makeTranslation(o.x, o.y, o.z).multiply(new THREE.Matrix4().makeRotationAxis(ax, deg * DEG)).multiply(new THREE.Matrix4().makeTranslation(-o.x, -o.y, -o.z)).multiply(m);
  if (j.type === 'ball') return about(about(about(new THREE.Matrix4(), axis, value), u, value2), w, value3);
  if (j.type === 'planar') {
    const sh = u.clone().multiplyScalar(value2).addScaledVector(w, value3);
    return new THREE.Matrix4().makeTranslation(sh.x, sh.y, sh.z).multiply(about(new THREE.Matrix4(), axis, value));
  }
  if (j.type === 'cylindrical') {
    return new THREE.Matrix4().makeTranslation(o.x + axis.x * value2, o.y + axis.y * value2, o.z + axis.z * value2)
      .multiply(new THREE.Matrix4().makeRotationAxis(axis, value * DEG))
      .multiply(new THREE.Matrix4().makeTranslation(-o.x, -o.y, -o.z));
  }
  if (j.type === 'revolute') {
    return new THREE.Matrix4().makeTranslation(o.x, o.y, o.z)
      .multiply(new THREE.Matrix4().makeRotationAxis(axis, value * DEG))
      .multiply(new THREE.Matrix4().makeTranslation(-o.x, -o.y, -o.z));
  }
  if (j.type === 'slider') return new THREE.Matrix4().makeTranslation(axis.x * value, axis.y * value, axis.z * value);
  return new THREE.Matrix4();
}

// The frame of a joint in its parent's coordinates: origin o, axis n and the two directions u, w across it
export function jointFrame(j) {
  const n = j.pO ? new THREE.Vector3(...j.pO.n).normalize() : axisOf(j);
  const o = new THREE.Vector3(...(j.pO ? j.pO.p : j.origin || [0, 0, 0]).map(Number));
  const u = new THREE.Vector3().crossVectors(n, Math.abs(n.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0)).normalize();
  return { o, n, u, w: new THREE.Vector3().crossVectors(n, u) };
}
export const jointMotion = (asm, j, values = {}) => motionMatrix(j, ...jointValues(asm, j, values));

// World matrix of a body: parent chain × joint motion × own placement.
// values: optional { jointId: value } override (motion studies).
export function bodyMatrix(asm, bodyId, values = {}, seen = new Set()) {
  if (!asm || seen.has(bodyId)) return new THREE.Matrix4();
  seen.add(bodyId);
  const own = placementMatrix(asm.placements?.[bodyId]);
  const j = (asm.joints || []).find(q => q.child === bodyId && !q.suppressed);
  if (!j) return own;
  const parent = j.parent ? bodyMatrix(asm, j.parent, values, seen) : new THREE.Matrix4();
  const [v, v2, v3] = jointValues(asm, j, values);
  // picked joint: the child's joint origin is brought onto the parent's (instead of a free placement)
  return parent.multiply(motionMatrix(j, v, v2, v3)).multiply(j.cO && j.pO ? alignMatrix(j) : own);
}

// current values of a joint; a linked joint (Bewegungsverknüpfung) follows its driver: value = ratio × driver
// Motion links: how a joint follows another one (v = the value of the driving joint).
//   ratio (default) and gear: v · ratio (gears: ratio = −teeth₁ / teeth₂)
//   rack: a turn of the pinion moves the rack by its pitch circle: mm = v · π · d / 360
//   screw: a turn moves the nut by the lead: mm = v · lead / 360
//   cam: an eccentric of throw e lifts a follower: mm = e · (1 − cos v); with "dwell" the follower rests on
//   the base circle for that share of the turn
export const LINK_KINDS = { ratio: 'Übersetzung', gear: 'Zahnrad', rack: 'Zahnstange und Ritzel', screw: 'Schraube (Steigung)', cam: 'Nocken' };
export function linkValue(link, v) {
  const off = +link.offset || 0;
  switch (link.kind) {
    case 'rack': return (v * Math.PI * (+link.dia || 20)) / 360 * (link.reverse ? -1 : 1) + off;
    case 'screw': return (v * (+link.lead || 1)) / 360 * (link.reverse ? -1 : 1) + off;
    case 'cam': {
      const e = +link.throw || 5, dwell = Math.min(0.95, Math.max(0, +link.dwell || 0));
      let a = ((((v + (+link.phase || 0)) % 360) + 360) % 360) / 360;
      if (a < dwell) return off;
      a = (a - dwell) / (1 - dwell);
      return e * (1 - Math.cos(a * 2 * Math.PI)) + off; // lift from 0 to 2e (twice the eccentricity) and back
    }
    default: return (+link.ratio || 1) * v + off;
  }
}
// the slope of a linear link (value per value of the driver), null for a cam
export function linkRatio(link) {
  if (link.kind === 'cam') return null;
  return linkValue({ ...link, offset: 0 }, 1);
}
export function jointValues(asm, j, values = {}, depth = 0) {
  const own = k => values[j.id + (k ? ':' + (k + 1) : '')] ?? +[j.value, j.value2, j.value3][k] ?? 0;
  const out = [own(0) || 0, own(1) || 0, own(2) || 0];
  const drv = j.link?.from && depth < 8 && (asm.joints || []).find(q => q.id === j.link.from && q.id !== j.id);
  if (drv) out[0] = linkValue(j.link, jointValues(asm, drv, values, depth + 1)[0]);
  return out;
}

// common CAD/CAM-like snapping: the child's joint origin (point p, normal n) is moved onto the parent's; the normals
// face each other (surfaces meet), or point the same way with "Umkehren". Then shift along / turn about the axis.
export function alignMatrix(j) {
  const pc = new THREE.Vector3(...j.cO.p), nc = new THREE.Vector3(...j.cO.n).normalize();
  const pp = new THREE.Vector3(...j.pO.p), np = new THREE.Vector3(...j.pO.n).normalize();
  const target = j.flip ? np.clone() : np.clone().negate();
  const q = new THREE.Quaternion().setFromUnitVectors(nc, target);
  const turn = new THREE.Matrix4().makeRotationAxis(np, (+j.angle || 0) * DEG);
  return new THREE.Matrix4().makeTranslation(...pp.clone().addScaledVector(np, +j.offset || 0).toArray())
    .multiply(turn)
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(q))
    .multiply(new THREE.Matrix4().makeTranslation(-pc.x, -pc.y, -pc.z));
}

export const hasAssembly = asm => !!asm && ((asm.joints || []).length > 0 || Object.values(asm.placements || {}).some(p => p && (p.dx || p.dy || p.dz || p.rx || p.ry || p.rz)));

// Moves a replicad shape by a rigid matrix (rotation about the origin, then translation).
export function transformShape(shape, m) {
  const pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  m.decompose(pos, q, sc);
  let s = shape.clone();
  const angle = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
  if (angle > 1e-9) {
    const k = Math.sqrt(1 - q.w * q.w) || 1;
    const axis = [q.x / k, q.y / k, q.z / k].map(v => v * Math.sign(q.w || 1));
    s = s.rotate(angle / DEG, [0, 0, 0], axis);
  }
  if (pos.lengthSq() > 1e-12) s = s.translate(pos.x, pos.y, pos.z);
  return s;
}
