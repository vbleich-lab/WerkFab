// Stock for 4-axis work around the A axis (setup X through cy, cz): per cell (x, θ) the radius of the material
// seen from the axis. Tools stand radial to the axis (tip at radius rho, direction u(θ) = (0, sin θ, cos θ)).
import * as THREE from 'three';

// Where a ray from the axis at (x', θ') enters a radial tool at (x, θ, rho): ball end (sphere around rho + R) or
// flat end, plus the cylindrical body above. Returns the radius of entry (Infinity = misses the tool) and the
// tool's axial coordinate (above the tip) of the highest point that lies at or below radius `cur`.
function entry(dxx, c, s, rho, R, ball, cur) {
  const R2 = R * R - dxx * dxx;
  if (R2 <= 0 || c <= 0) return null;
  const Rp = Math.sqrt(R2), base = ball ? rho + R : rho;
  const s1 = s > 1e-9 ? Rp / s : Infinity;
  let e = Infinity;
  if (base / c < s1) e = base / c;
  if (ball) { const q = R2 - base * base * s * s; if (q >= 0) e = Math.min(e, Math.max(0, base * c - Math.sqrt(q))); }
  if (e === Infinity) return null;
  return { e, top: Math.min(s1, cur) * c - rho };
}

export class CylStock {
  constructor({ x0, x1, cy, cz, r }) {
    Object.assign(this, { x0, x1, cy, cz, r0: r });
    // (small parts get a finer grid: a wall that stands 0.15 mm off must show against the part)
    this.dx = Math.max(0.05, (x1 - x0) / 400);
    this.nx = Math.ceil((x1 - x0) / this.dx) + 1;
    this.nt = 360;
    this.dt = (2 * Math.PI) / this.nt;
    this.r = new Float32Array(this.nx * this.nt).fill(r);
  }
  reset() { this.r.fill(this.r0); }
  // sampling step along a move: fine enough for small tools and for the grid
  step(R) { return Math.max(0.02, this.dx / 2, Math.min(0.25, R / 4)); }
  // part radii on the same grid (cylPartMap; null = comparison off). Next to a wall (step between neighbours) a
  // cell may lie on either side of it on this grid: anything between the lower and the upper level is "at size".
  setPart(part) {
    this.part = part && part.length === this.r.length ? part : null;
    if (!this.part) { this.lo = this.hi = null; return; }
    const { nx, nt } = this, lo = (this.lo = new Float32Array(part.length)), hi = (this.hi = new Float32Array(part.length));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nt; j++) {
      let a = Infinity, b = -Infinity;
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const ii = i + di;
        if (ii < 0 || ii >= nx) continue;
        const v = part[ii * nt + ((j + dj + nt) % nt)];
        if (v < a) a = v;
        if (v > b) b = v;
      }
      lo[i * nt + j] = a; hi[i * nt + j] = b;
    }
  }
  // share of the surface: at size / material left / too deep, the deepest gouge (negative) and the most material left
  compareStats(tol = 0.1) {
    if (!this.part) return null;
    let ok = 0, left = 0, gouge = 0, worst = 0, most = 0;
    const n = this.r.length;
    for (let k = 0; k < n; k++) {
      const r = this.r[k];
      if (r < this.lo[k] - tol) { gouge++; worst = Math.min(worst, r - this.lo[k]); }
      else if (r > this.hi[k] + tol) { left++; most = Math.max(most, r - this.hi[k]); }
      else ok++;
    }
    return { ok: ok / n, left: left / n, gouge: gouge / n, worst, most };
  }
  // tool tip at (x, θ [rad], rho), tool { R, ball }; cb(index, newRadius) for every changed cell.
  // Returns removed (sum of radial depth) and top (highest tool point in contact, above the tip).
  cutAt(x, th, rho, tool, cb) {
    const { R, ball } = tool, rc = ball ? rho + R : rho;
    const dmax = rc > R ? Math.asin(Math.min(1, R / rc)) : Math.PI / 2;
    const jr = Math.ceil(dmax / this.dt) + 1, jc = Math.round(th / this.dt);
    const i0 = Math.max(0, Math.ceil((x - R - this.x0) / this.dx)), i1 = Math.min(this.nx - 1, Math.floor((x + R - this.x0) / this.dx));
    let removed = 0, top = -Infinity;
    // angle terms once per call (they do not depend on x)
    const nj = 2 * jr + 1, cs = this._cs && this._cs.length >= 2 * nj ? this._cs : (this._cs = new Float64Array(2 * nj + 64));
    for (let q = 0; q < nj; q++) { const D = (jc - jr + q) * this.dt - th; cs[2 * q] = Math.cos(D); cs[2 * q + 1] = Math.abs(Math.sin(D)); }
    for (let i = i0; i <= i1; i++) {
      const dxx = this.x0 + i * this.dx - x;
      if (dxx * dxx >= R * R) continue;
      for (let q = 0; q < nj; q++) {
        const jj = jc - jr + q, j = ((jj % this.nt) + this.nt) % this.nt, k = i * this.nt + j, cur = this.r[k];
        if (cs[2 * q] <= 0) continue;
        const en = entry(dxx, cs[2 * q], cs[2 * q + 1], rho, R, ball, cur);
        if (!en || cur <= en.e + 0.005) continue;
        removed += cur - en.e;
        if (en.top > top) top = en.top;
        this.r[k] = en.e;
        if (cb) cb(k, en.e);
      }
    }
    return { removed, top };
  }
  // 3-axis cut: tool along the setup Z axis, tip at (x, y, z), flat or ball end, the body reaching up; the part
  // turned by A = rot (rad, 0 = as set up). Along each ray from the axis the tool occupies one interval (the tool
  // is convex); the material [0, r] is cut back to where the ray enters the tool when its outer end lies inside.
  // dry: only measure what would be removed (nothing changes).
  cutVertical(x, y, z, tool, cb, rot = 0, dry = false) {
    const { R, ball } = tool, { cy, cz } = this;
    const i0 = Math.max(0, Math.ceil((x - R - this.x0) / this.dx)), i1 = Math.min(this.nx - 1, Math.floor((x + R - this.x0) / this.dx));
    if (i0 > i1) return { removed: 0 };
    // angles that can see the tool: corners of its cross-section [y ± R] × [z, top of the stock]
    const zt = cz + this.r0 + 1;
    if (z >= zt) return { removed: 0 };
    let j0 = 0, j1 = this.nt - 1;
    const yl = y - R - cy, yh = y + R - cy, zl = z - cz, zh = zt - cz;
    if (!(yl <= 0 && yh >= 0 && zl <= 0 && zh >= 0)) {
      const c = Math.atan2(y - cy, (zl + zh) / 2);
      let lo = Infinity, hi = -Infinity;
      for (const [py, pz] of [[yl, zl], [yl, zh], [yh, zl], [yh, zh]]) {
        let a = Math.atan2(py, pz) - c;
        a = ((a + 3 * Math.PI) % (2 * Math.PI)) - Math.PI;
        lo = Math.min(lo, a); hi = Math.max(hi, a);
      }
      j0 = Math.floor((c + lo + rot) / this.dt) - 1; j1 = Math.ceil((c + hi + rot) / this.dt) + 1;
    }
    const inside = (dxx2, s, c, rho) => {
      const py = cy + rho * s - y, d2 = dxx2 + py * py;
      if (d2 > R * R) return false;
      return cz + rho * c >= (ball ? z + R - Math.sqrt(R * R - d2) : z) - 1e-9;
    };
    let removed = 0;
    for (let i = i0; i <= i1; i++) {
      const dxx = this.x0 + i * this.dx - x, dxx2 = dxx * dxx;
      if (dxx2 >= R * R) continue;
      for (let jj = j0; jj <= j1; jj++) {
        const j = ((jj % this.nt) + this.nt) % this.nt, k = i * this.nt + j, cur = this.r[k];
        if (cur <= 0.001) continue;
        // machine direction of the cell: the part angle less the turn of the A axis
        const th = j * this.dt - rot, s = Math.sin(th), c = Math.cos(th);
        if (!inside(dxx2, s, c, cur)) continue;
        // entry of the ray into the tool: bisection between a point outside (or the axis) and the outer end
        let a = 0, b = cur;
        if (!inside(dxx2, s, c, 0)) for (let n = 0; n < 22; n++) { const m = (a + b) / 2; if (inside(dxx2, s, c, m)) b = m; else a = m; }
        else b = 0;
        if (cur - b < 0.005) continue;
        removed += cur - b;
        if (dry) continue;
        this.r[k] = b;
        if (cb) cb(k, b);
      }
    }
    return { removed };
  }
  // 3-axis move (setup frame), sampled finely enough for the grid
  cutMoveVertical(a, b, tool) {
    const n = Math.min(5000, Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / this.step(tool.R))));
    let removed = 0, at = null;
    for (let q = 1; q <= n; q++) {
      const f = q / n, x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f, z = a.z + (b.z - a.z) * f;
      const r = this.cutVertical(x, y, z, tool).removed;
      if (r > 0 && !at) at = { x, y, z };
      removed += r;
    }
    return { removed, at };
  }
  // cut along a move: x, rho and A (degrees) change linearly, as on the machine
  cutMove(a, b, tool, cb) {
    const ra = Math.max(a.rho, b.rho, 1);
    const n = Math.min(5000, Math.max(1, Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.rho - a.rho), (Math.abs(b.a - a.a) * Math.PI * ra) / 180) / this.step(tool.R))));
    let removed = 0, top = -Infinity, at = null;
    for (let q = 1; q <= n; q++) {
      const f = q / n, x = a.x + (b.x - a.x) * f, rho = a.rho + (b.rho - a.rho) * f, deg = a.a + (b.a - a.a) * f;
      const res = this.cutAt(x, (((deg % 360) + 360) % 360) * (Math.PI / 180), rho, tool, cb);
      removed += res.removed;
      if (res.top > top) { top = res.top; at = { x, rho, a: deg }; }
    }
    return { removed, top, at };
  }
}

// part radius map on the same grid: rays from outside towards the axis (bodies in the setup frame)
export function cylPartMap(cs, bvhs) {
  const out = new Float32Array(cs.nx * cs.nt), rBig = cs.r0 + 20;
  const ray = new THREE.Ray(new THREE.Vector3(), new THREE.Vector3());
  for (let i = 0; i < cs.nx; i++) for (let j = 0; j < cs.nt; j++) {
    const th = j * cs.dt, uy = Math.sin(th), uz = Math.cos(th);
    ray.origin.set(cs.x0 + i * cs.dx, cs.cy + uy * rBig, cs.cz + uz * rBig);
    ray.direction.set(0, -uy, -uz);
    let best = 0;
    for (const b of bvhs) { const hit = b.raycastFirst(ray, THREE.DoubleSide); if (hit) best = Math.max(best, rBig - hit.distance); }
    out[i * cs.nt + j] = best;
  }
  return out;
}

// Simulation view of a CylStock: a closed tube surface (plus end caps) in the setup frame.
export class CylSim {
  constructor(parent) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.mat = new THREE.MeshStandardMaterial({ color: 0xc9a86a, roughness: 0.6, metalness: 0.2, side: THREE.DoubleSide });
    this.cmpMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.0, side: THREE.DoubleSide });
    this.cmpTol = 0.1;
  }
  build(params) {
    this.dispose();
    this.S = new CylStock(params);
    const { nx, nt } = this.S;
    const pos = new Float32Array((nx * nt + 2) * 3), idx = [];
    for (let i = 0; i < nx - 1; i++) for (let j = 0; j < nt; j++) {
      const a = i * nt + j, b = i * nt + ((j + 1) % nt), c = a + nt, d = b + nt;
      idx.push(a, c, b, b, c, d);
    }
    const c0 = nx * nt, c1 = c0 + 1;
    for (let j = 0; j < nt; j++) { idx.push(c0, j, (j + 1) % nt); idx.push(c1, (nx - 1) * nt + ((j + 1) % nt), (nx - 1) * nt + j); }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.length).fill(0.8), 3));
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.group.add(this.mesh);
    this.dirty = true;
    this.update();
  }
  reset() { if (this.S) { this.S.reset(); this.dirty = true; this.update(); } }
  // comparison with the part (radius map from cylPartMap, null = off): green at size, blue material left, red too deep
  setCompare(part) {
    if (!this.S) return;
    this.S.setPart(part);
    this.mesh.material = this.S.part ? this.cmpMat : this.mat;
    this.dirty = true;
    this.update();
  }
  get cmp() { return !!this.S?.part; }
  compareStats() { return this.S ? this.S.compareStats(this.cmpTol) : null; }
  // generator moves carry a (degrees) and mz (= cz + rho); both ends must be 4-axis moves
  cut(a, b, tool, t0, t1) {
    if (!this.S || a.a == null || b.a == null) return { removed: 0 };
    const L = (m, t) => ({ x: a.x + (b.x - a.x) * t, rho: a.mz - this.S.cz + (b.mz - a.mz) * t, a: a.a + (b.a - a.a) * t });
    const tl = { R: (+tool.dia || 1) / 2, ball: tool.type === 'ball' };
    const res = this.S.cutMove(L(a, t0), L(b, t1), tl);
    if (res.removed > 0) this.dirty = true;
    return res;
  }
  // 3-axis move of a 4-axis setup (A = 0°): the tool stands along the setup Z axis
  cut3(a, b, tool, t0, t1) {
    if (!this.S) return { removed: 0 };
    const L = t => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
    const tl = { R: (+tool.dia || 1) / 2, ball: tool.type === 'ball' };
    const res = this.S.cutMoveVertical(L(t0), L(t1), tl);
    if (res.removed > 0) this.dirty = true;
    return res;
  }
  update() {
    if (!this.dirty || !this.S) return;
    this.dirty = false;
    const { nx, nt, dx, dt, x0, cy, cz, r } = this.S, p = this.geo.attributes.position.array;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nt; j++) {
      const k = i * nt + j, rr = Math.max(0.001, r[k]), th = j * dt;
      p[3 * k] = x0 + i * dx; p[3 * k + 1] = cy + rr * Math.sin(th); p[3 * k + 2] = cz + rr * Math.cos(th);
    }
    const c0 = nx * nt;
    p.set([x0, cy, cz, x0 + (nx - 1) * dx, cy, cz], 3 * c0);
    if (this.S.part) {
      const col = this.geo.attributes.color.array, { lo, hi } = this.S, tol = this.cmpTol;
      for (let k = 0; k < nx * nt; k++) {
        const v = r[k];
        let cr, cg, cb;
        if (v < lo[k] - tol) { cr = 0.88; cg = 0.2; cb = 0.2; }
        else if (v <= hi[k] + tol) { cr = 0.25; cg = 0.72; cb = 0.32; }
        else { const t = Math.min(1, (v - hi[k]) / 3); cr = 0.55 - 0.45 * t; cg = 0.72 - 0.42 * t; cb = 0.95; }
        col[3 * k] = cr; col[3 * k + 1] = cg; col[3 * k + 2] = cb;
      }
      this.geo.attributes.color.needsUpdate = true;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }
  dispose() { if (this.geo) { this.group.remove(this.mesh); this.geo.dispose(); this.geo = null; } this.S = null; }
}
