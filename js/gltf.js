// glTF 2.0 as one binary file (.glb): the bodies as triangle meshes with their names and colours.
// glTF counts in metres with Y up – the root node turns Z up to Y up and scales millimetres to metres.

// parts: [{ name, positions (Float32Array, xyz), normals? (Float32Array), index? (Uint16/Uint32Array),
//           color: [r, g, b] 0…1 (linear), metalness, roughness, opacity }] → ArrayBuffer
export function exportGLB(parts, name = 'WerkFab') {
  const chunks = [], views = [], accessors = [], meshes = [], nodes = [], materials = [], matKey = new Map();
  let offset = 0;
  const push = (arr, target) => {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength), pad = (4 - (bytes.length % 4)) % 4;
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target });
    chunks.push(bytes);
    if (pad) chunks.push(new Uint8Array(pad));
    offset += bytes.length + pad;
    return views.length - 1;
  };
  for (const p of parts) {
    const n = p.positions.length / 3;
    if (!n) continue;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.positions.length; i++) { const v = p.positions[i], a = i % 3; if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v; }
    const attributes = { POSITION: accessors.push({ bufferView: push(new Float32Array(p.positions), 34962), componentType: 5126, count: n, type: 'VEC3', min: lo, max: hi }) - 1 };
    if (p.normals?.length === p.positions.length) attributes.NORMAL = accessors.push({ bufferView: push(new Float32Array(p.normals), 34962), componentType: 5126, count: n, type: 'VEC3' }) - 1;
    const prim = { attributes, mode: 4 };
    if (p.index?.length) {
      const idx = n > 65535 ? new Uint32Array(p.index) : new Uint16Array(p.index);
      prim.indices = accessors.push({ bufferView: push(idx, 34963), componentType: n > 65535 ? 5125 : 5123, count: idx.length, type: 'SCALAR' }) - 1;
    }
    const m = { color: p.color || [0.76, 0.8, 0.84], metalness: p.metalness ?? 0.6, roughness: p.roughness ?? 0.4, opacity: p.opacity ?? 1 }, key = JSON.stringify(m);
    if (!matKey.has(key)) {
      matKey.set(key, materials.push({ pbrMetallicRoughness: { baseColorFactor: [...m.color.map(v => +v.toFixed(4)), m.opacity], metallicFactor: m.metalness, roughnessFactor: m.roughness }, ...(m.opacity < 1 ? { alphaMode: 'BLEND' } : {}), doubleSided: true }) - 1);
    }
    prim.material = matKey.get(key);
    nodes.push({ name: p.name || `Body${nodes.length + 1}`, mesh: meshes.push({ name: p.name || `Body${meshes.length + 1}`, primitives: [prim] }) - 1 });
  }
  if (!nodes.length) throw new Error('Kein Körper zum Exportieren.');
  const root = nodes.push({ name, children: nodes.map((_, i) => i), rotation: [-Math.SQRT1_2, 0, 0, Math.SQRT1_2], scale: [0.001, 0.001, 0.001] }) - 1;
  const json = { asset: { version: '2.0', generator: 'WerkFab' }, scene: 0, scenes: [{ nodes: [root] }], nodes, meshes, materials, accessors, bufferViews: views, buffers: [{ byteLength: offset }] };
  let text = new TextEncoder().encode(JSON.stringify(json));
  const jp = (4 - (text.length % 4)) % 4;
  if (jp) { const t2 = new Uint8Array(text.length + jp).fill(0x20); t2.set(text); text = t2; }
  const total = 12 + 8 + text.length + 8 + offset, out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, text.length, true); dv.setUint32(16, 0x4e4f534a, true); out.set(text, 20);
  let at = 20 + text.length;
  dv.setUint32(at, offset, true); dv.setUint32(at + 4, 0x004e4942, true); at += 8;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out.buffer;
}
