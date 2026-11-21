// Gear outlines (pure maths, no kernel): involute spur / helical / internal gears, racks, bevel gears (Tredgold),
// worms and chain sprockets. An outline is a closed list of segments in the plane, counter-clockwise:
//   { k: 'L', b }            straight line to b
//   { k: 'A', b, m }         circular arc to b through m
//   { k: 'B', b, c1, c2 }    cubic Bézier to b
// with `start` as the first point. Lengths in mm, angles of the parameters in degrees.

const RAD = Math.PI / 180;
const inv = a => Math.tan(a) - a;
const rot = ([x, y], a) => { const c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; };
const pol = (r, a) => [r * Math.cos(a), r * Math.sin(a)];

export const GEAR_KINDS = {
  spur: 'Stirnrad (gerade)', helical: 'Stirnrad (schräg)', herringbone: 'Pfeilrad', internal: 'Hohlrad', rack: 'Zahnstange',
  bevel: 'Kegelrad', worm: 'Schnecke', wormwheel: 'Schneckenrad', sprocket: 'Kettenrad',
};
// roller chains ISO 606: pitch, roller diameter, inner width
export const CHAINS = { '05B': [8, 5, 3], '06B': [9.525, 6.35, 5.72], '08B': [12.7, 8.51, 7.75], '10B': [15.875, 10.16, 9.65], '12B': [19.05, 12.07, 11.68], '16B': [25.4, 15.88, 17.02], '20B': [31.75, 19.05, 19.56] };
export const MODULES = [0.5, 0.6, 0.8, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];

/**
 * Sizes of an involute gear in its transverse plane. m = transverse module, z = teeth, alpha = transverse pressure
 * angle, x = profile shift, ha / hf = addendum / dedendum factors, backlash = thinning of the tooth on the pitch circle.
 */
export function gearSizes({ m, z, alpha = 20, x = 0, ha = 1, hf = 1.25, backlash = 0 }) {
  const a = alpha * RAD, r = (m * z) / 2, rb = r * Math.cos(a);
  let ra = r + m * (ha + x);
  const rf = Math.max(0.05 * m, r - m * (hf - x));
  const s = m * (Math.PI / 2 + 2 * x * Math.tan(a)) - backlash; // tooth thickness on the pitch circle
  const psiB = s / (2 * r) + inv(a); // half tooth angle on the base circle
  // a tooth must not come to a point: the tip is taken back to where 0.2 × module of land is left
  const land = rr => 2 * rr * (psiB - inv(Math.acos(Math.min(1, rb / rr))));
  let pointed = false;
  if (land(ra) < 0.2 * m) {
    pointed = true;
    let lo = Math.max(rb, r - m), hi = ra;
    for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (land(mid) < 0.2 * m) hi = mid; else lo = mid; }
    ra = lo;
  }
  // undercut by a rack cutter below this number of teeth (without profile shift)
  const zMin = (2 * (ha - x)) / Math.sin(a) ** 2;
  return { r, rb, ra, rf, s, psiB, d: 2 * r, db: 2 * rb, da: 2 * ra, df: 2 * rf, pitch: Math.PI * m, pointed, undercut: z < zMin - 1e-9, zMin: Math.ceil(zMin - 1e-9) };
}

// one flank of the tooth that stands on the +X axis, on the side y < 0, from the root side outwards: Bézier pieces
function flank(sz, n = 3) {
  const { rb, ra, rf, psiB } = sz;
  const rs = Math.max(rb, rf), t0 = Math.sqrt(Math.max(0, (rs / rb) ** 2 - 1)), t1 = Math.sqrt(Math.max(0, (ra / rb) ** 2 - 1));
  const P = t => rot([rb * (Math.cos(t) + t * Math.sin(t)), rb * (Math.sin(t) - t * Math.cos(t))], -psiB);
  const D = t => rot([rb * t * Math.cos(t), rb * t * Math.sin(t)], -psiB); // derivative
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = t0 + ((t1 - t0) * i) / n, b = t0 + ((t1 - t0) * (i + 1)) / n, h = (b - a) / 3;
    const pa = P(a), pb = P(b), da = D(a), db = D(b);
    out.push({ a: pa, b: pb, c1: [pa[0] + da[0] * h, pa[1] + da[1] * h], c2: [pb[0] - db[0] * h, pb[1] - db[1] * h] });
  }
  return { segs: out, rs };
}

/** Outline of an external involute gear, centre at the origin, a tooth on the +X axis. map(p) can bend the points (bevel gears). */
export function gearOutline(par, map = null) {
  const sz = gearSizes(par), z = Math.round(par.z), { segs } = flank(sz), { ra, rf } = sz;
  if (!(z >= 3)) throw new Error('Mindestens 3 Zähne');
  if (!(par.m > 0)) throw new Error('Modul fehlt');
  const M = map || (p => p), mir = ([x, y]) => [x, -y], out = [];
  const tooth = Math.PI * 2 / z;
  let start = null;
  for (let i = 0; i < z; i++) {
    const a = i * tooth, T = p => M(rot(p, a));
    if (!start) start = T(segs[0].a);
    // lower flank outwards, tip arc, upper flank inwards
    for (const s of segs) out.push({ k: 'B', b: T(s.b), c1: T(s.c1), c2: T(s.c2) });
    const tipB = mir(segs[segs.length - 1].b);
    out.push({ k: 'A', b: T(tipB), m: T([ra, 0]) });
    for (let k = segs.length - 1; k >= 0; k--) { const s = segs[k]; out.push({ k: 'B', b: T(mir(s.a)), c1: T(mir(s.c2)), c2: T(mir(s.c1)) }); }
    // root: a rounded bottom through the root circle to the next tooth
    const next = M(rot(segs[0].a, a + tooth));
    out.push({ k: 'A', b: next, m: M(pol(rf, a + tooth / 2)) });
  }
  return { start, segs: out, sizes: sz };
}

/** The opening of an internal gear (ring): the shape that is cut out of the ring. Sizes of the ring's teeth. */
export function internalOutline(par) {
  const { m, z, alpha = 20, x = 0, backlash = 0 } = par;
  if (z < 12) throw new Error('Hohlrad: mindestens 12 Zähne');
  // the space of the ring is a gear tooth with addendum and dedendum swapped; the gap grows by the backlash
  const cut = gearOutline({ m, z, alpha, x, ha: 1.25, hf: 1, backlash: -backlash });
  const r = (m * z) / 2;
  return { ...cut, sizes: { ...cut.sizes, d: 2 * r, da: 2 * (r - m * (1 - x)), df: 2 * cut.sizes.ra } };
}

/** Rack: teeth along +X from x = 0, pitch line at y = 0, body down to y = -(dedendum + base). Polygon points. */
export function rackOutline({ m, n, alpha = 20, base = null, ha = 1, hf = 1.25, backlash = 0 }) {
  n = Math.round(n);
  if (!(n >= 1) || !(m > 0)) throw new Error('Modul und Zähnezahl angeben');
  const p = Math.PI * m, t = Math.tan(alpha * RAD), s = p / 2 - backlash, B = base ?? 2 * m;
  const pts = [[0, -hf * m - B], [n * p, -hf * m - B], [n * p, -hf * m]];
  for (let i = n - 1; i >= 0; i--) {
    const c = (i + 0.5) * p; // tooth centre
    pts.push([c + s / 2 + hf * m * t, -hf * m], [c + s / 2 - ha * m * t, ha * m], [c - s / 2 + ha * m * t, ha * m], [c - s / 2 - hf * m * t, -hf * m]);
  }
  pts.push([0, -hf * m]);
  // drop doubled points (first and last gap)
  const out = pts.filter((q, i) => i === 0 || Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) > 1e-9);
  return { pts: out, pitch: p, length: n * p, height: (ha + hf) * m + B };
}

/**
 * Straight bevel gear after Tredgold: the tooth form of the virtual spur gear on the back cone (zv = z / cos δ),
 * laid into the plane of the large end. z2 = teeth of the mating gear, sigma = shaft angle.
 * Returns the outline of the large end, the cone angle and where the small end lies (height, scale about the apex).
 */
export function bevelGear({ m, z, z2, sigma = 90, alpha = 20, width = null, backlash = 0 }) {
  if (!(z >= 6 && z2 >= 6)) throw new Error('Kegelrad: Zähnezahlen beider Räder angeben (mindestens 6)');
  const S = sigma * RAD, delta = Math.atan2(Math.sin(S), z2 / z + Math.cos(S));
  if (!(delta > 2 * RAD && delta < 88 * RAD)) throw new Error('Kegelrad: Teilkegelwinkel außerhalb 2°…88°');
  const r = (m * z) / 2, Re = r / Math.sin(delta), cd = Math.cos(delta), zv = z / cd, rv = r / cd;
  const b = Math.min(width ?? Re / 3, Re * 0.5);
  // virtual gear → transverse plane: the radial distance from the pitch circle shrinks by cos δ, angles grow by 1 / cos δ
  const map = ([x, y]) => { const rho = Math.hypot(x, y), a = Math.atan2(y, x); return pol(r + (rho - rv) * cd, a / cd); };
  const zi = Math.round(z);
  // the virtual gear has zv teeth (not a whole number): one tooth of it is turned to every place of the real gear
  const sz = gearSizes({ m, z: zv, alpha, backlash }), { segs } = flank(sz), mir = ([x, y]) => [x, -y], out = [];
  const tooth = (2 * Math.PI) / zi, T = (p, a) => rot(map(p), a);
  let start = null;
  for (let i = 0; i < zi; i++) {
    const a = i * tooth;
    if (!start) start = T(segs[0].a, a);
    for (const s of segs) out.push({ k: 'B', b: T(s.b, a), c1: T(s.c1, a), c2: T(s.c2, a) });
    out.push({ k: 'A', b: T(mir(segs[segs.length - 1].b), a), m: T([sz.ra, 0], a) });
    for (let k = segs.length - 1; k >= 0; k--) { const s = segs[k]; out.push({ k: 'B', b: T(mir(s.a), a), c1: T(mir(s.c2), a), c2: T(mir(s.c1), a) }); }
    out.push({ k: 'A', b: T(segs[0].a, a + tooth), m: pol(r + (sz.rf - rv) * cd, a + tooth / 2) });
  }
  return { start, segs: out, delta: delta / RAD, Re, width: b, height: b * cd, scale: 1 - b / Re, apex: r / Math.tan(delta),
    sizes: { d: 2 * r, da: 2 * (r + (sz.ra - rv) * cd), df: 2 * (r + (sz.rf - rv) * cd), zv } };
}

/** Worm: axial section of the thread (trapezoid, [radius, axial]) and the sizes. m = axial module, z1 = starts, q = d1 / m. */
export function wormSizes({ m, z1 = 1, q = 10, d1 = null, alpha = 20 }) {
  z1 = Math.max(1, Math.round(z1));
  const d = d1 > 0 ? d1 : m * q, px = Math.PI * m, lead = px * z1, r = d / 2, ra = r + m, rf = r - 1.2 * m;
  if (!(rf > 0.2 * m)) throw new Error('Schnecke: Teilkreis zu klein für diesen Modul');
  const t = Math.tan(alpha * RAD), gamma = Math.atan2(lead, Math.PI * d);
  const w = px / 2, r0 = rf - 0.05 * m; // (the thread starts a little inside the core so the two merge)
  const prof = [[r0, -(w / 2 + (r - r0) * t)], [ra, -(w / 2 - m * t)], [ra, w / 2 - m * t], [r0, w / 2 + (r - r0) * t]];
  if (prof[1][1] >= prof[2][1]) throw new Error('Schnecke: Zahn läuft spitz zu');
  return { d, da: 2 * ra, df: 2 * rf, px, lead, gamma: gamma / RAD, prof, z1 };
}

/** Chain sprocket for a roller chain (pitch p, roller diameter d1): outline with seat arcs, flanks and tips. */
export function sprocketOutline({ p, d1, z }) {
  z = Math.round(z);
  if (!(z >= 6)) throw new Error('Kettenrad: mindestens 6 Zähne');
  if (!(p > 0 && d1 > 0 && d1 < p)) throw new Error('Kettenrad: Teilung und Rollendurchmesser prüfen');
  const R = p / (2 * Math.sin(Math.PI / z)), tooth = (2 * Math.PI) / z;
  const ri = 0.505 * d1 + 0.069 * Math.cbrt(d1), re = 0.12 * d1 * (z + 2);
  const ra = Math.min(R + 0.625 * p - d1 / 2, (p * (0.6 + 1 / Math.tan(Math.PI / z))) / 2), rf = R - ri;
  const half = (60 - 45 / z) * RAD; // half seating angle, from the line roller centre → gear centre
  // roller on the +X axis: seat arc from the lower side over the root to the upper side
  const C = [R, 0], dirIn = Math.PI;
  const s0 = [C[0] + ri * Math.cos(dirIn + half), C[1] + ri * Math.sin(dirIn + half)]; // lower end (y < 0)
  const s1 = [s0[0], -s0[1]];
  // flank above the seat: an arc of radius re that continues the seat tangentially and curves the other way
  // (the tooth is rounded): its centre lies on the line roller centre → end of the seat, beyond that end
  const ux = Math.cos(dirIn - half), uy = Math.sin(dirIn - half); // from C to s1
  const F = [C[0] + ux * (ri + re), C[1] + uy * (ri + re)];
  const a0 = Math.atan2(s1[1] - F[1], s1[0] - F[0]);
  const at = a => [F[0] + re * Math.cos(a), F[1] + re * Math.sin(a)];
  const dir = Math.hypot(...at(a0 + 1e-3)) > Math.hypot(...at(a0 - 1e-3)) ? 1 : -1; // the way the radius grows
  // along the flank until the tip circle or the middle of the tooth is reached
  let end = null, mid = null, lastOk = s1;
  const N = 600, span = Math.PI / 3;
  for (let k = 1; k <= N; k++) {
    const q = at(a0 + dir * (k / N) * span), rr = Math.hypot(q[0], q[1]), ang = Math.atan2(q[1], q[0]);
    if (rr >= ra || ang >= tooth / 2 - 1e-4 || rr < Math.hypot(lastOk[0], lastOk[1])) { end = lastOk; mid = at(a0 + dir * ((k - 1) / (2 * N)) * span); break; }
    lastOk = q;
  }
  if (!end || Math.hypot(end[0] - s1[0], end[1] - s1[1]) < 1e-6) throw new Error('Kettenrad: Zahnform lässt sich mit diesen Werten nicht bilden');
  const mir = ([x, y]) => [x, -y], out = [];
  const rEnd = Math.hypot(end[0], end[1]), aEnd = Math.atan2(end[1], end[0]);
  let start = null;
  for (let i = 0; i < z; i++) {
    const a = i * tooth, T = q => rot(q, a);
    if (!start) start = T(s0);
    out.push({ k: 'A', b: T(s1), m: T([rf, 0]) });
    out.push({ k: 'A', b: T(end), m: T(mid) });
    // tip: over to the mirrored flank of the next roller
    const e2 = rot(mir(end), tooth);
    if (tooth - 2 * aEnd > 1e-4) out.push({ k: 'A', b: T(e2), m: T(pol(rEnd, tooth / 2)) });
    out.push({ k: 'A', b: T(rot(s0, tooth)), m: T(rot(mir(mid), tooth)) });
  }
  return { start, segs: out, sizes: { d: 2 * R, da: 2 * rEnd, df: 2 * rf, ri, re } };
}

/** Everything a gear step needs besides the kernel: outline(s), heights, twist, and the sizes for the info line. */
export function gearSpec(f) {
  const kind = f.kind || 'spur', m = +f.m, z = Math.round(+f.z), b = +f.width, alpha = +f.alpha || 20, x = +f.shift || 0, backlash = +f.backlash || 0;
  if (kind !== 'sprocket' && !(m > 0)) throw new Error('Modul fehlt');
  if (kind !== 'worm' && kind !== 'rack' && !(z >= 3)) throw new Error('Zähnezahl fehlt');
  if (kind !== 'worm' && kind !== 'sprocket' && !(b > 0)) throw new Error('Breite fehlt');
  switch (kind) {
    case 'spur': { const o = gearOutline({ m, z, alpha, x, backlash }); return { kind, outline: o, height: b, twist: 0, sizes: o.sizes }; }
    case 'helical': case 'herringbone': case 'wormwheel': {
      let beta = +f.beta || 0;
      let mn = m;
      if (kind === 'wormwheel') {
        // the wheel's transverse module is the worm's axial module; its helix angle is the worm's lead angle
        const w = wormSizes({ m, z1: +f.z1 || 1, q: +f.q || 10, alpha });
        beta = w.gamma; mn = m * Math.cos(beta * RAD);
      }
      if (!(Math.abs(beta) < 60)) throw new Error('Schrägungswinkel muss kleiner als 60° sein');
      const cb = Math.cos(beta * RAD), mt = mn / cb, at = Math.atan(Math.tan(alpha * RAD) / cb) / RAD;
      const o = gearOutline({ m: mt, z, alpha: at, x: x * cb, ha: cb, hf: 1.25 * cb, backlash });
      // turn of the outline over the width (degrees); right hand: the teeth rise to the right when the axis stands upright
      const twist = ((b * Math.tan(beta * RAD)) / o.sizes.r / RAD) * (f.hand === 'left' ? 1 : -1);
      return { kind, outline: o, height: b, twist: kind === 'herringbone' ? twist / 2 : twist, herringbone: kind === 'herringbone', sizes: { ...o.sizes, beta, mt, mn } };
    }
    case 'internal': { const o = internalOutline({ m, z, alpha, x, backlash }); const rim = +f.rim > 0 ? +f.rim : 2.5 * m; return { kind, outline: o, height: b, twist: 0, outer: o.sizes.df / 2 + rim, sizes: { ...o.sizes, outer: o.sizes.df + 2 * rim } }; }
    case 'rack': { const o = rackOutline({ m, n: z, alpha, base: +f.base > 0 ? +f.base : null, backlash }); return { kind, rack: o, height: b, beta: +f.rackBeta || 0, hand: f.hand, sizes: { pitch: o.pitch, length: o.length, height: o.height } }; }
    case 'bevel': { const g = bevelGear({ m, z, z2: +f.z2 || z, sigma: +f.sigma || 90, alpha, width: b, backlash }); return { kind, bevel: g, sizes: { ...g.sizes, delta: g.delta, Re: g.Re } }; }
    case 'worm': { const w = wormSizes({ m, z1: +f.z1 || 1, q: +f.q || 10, alpha }); const L = +f.length; if (!(L > 0)) throw new Error('Länge fehlt'); return { kind, worm: w, length: L, hand: f.hand, sizes: w }; }
    case 'sprocket': { const [p, d1, b1] = CHAINS[f.chain] || CHAINS['08B']; const o = sprocketOutline({ p, d1, z }); return { kind, outline: o, height: +f.width > 0 ? +f.width : +(0.93 * b1).toFixed(2), twist: 0, sizes: { ...o.sizes, p, d1 } }; }
  }
  throw new Error('Unbekannte Zahnradart: ' + kind);
}

/** One line of sizes for the properties (German, numbers with two decimals). */
export function gearInfo(f) {
  const s = gearSpec(f).sizes, n = v => (+v).toFixed(2).replace(/\.?0+$/, '').replace('.', ',');
  const kind = f.kind || 'spur';
  if (kind === 'rack') return `Teilung ${n(s.pitch)} mm · Länge ${n(s.length)} mm · Höhe ${n(s.height)} mm`;
  if (kind === 'worm') return `Teilkreis Ø ${n(s.d)} · Kopfkreis Ø ${n(s.da)} · Fußkreis Ø ${n(s.df)} · Steigung ${n(s.lead)} mm · Steigungswinkel ${n(s.gamma)}°`;
  let t = `Teilkreis Ø ${n(s.d)} · Kopfkreis Ø ${n(s.da)} · Fußkreis Ø ${n(s.df)}`;
  if (kind === 'bevel') t += ` · Teilkegelwinkel ${n(s.delta)}° · Teilkegellänge ${n(s.Re)} mm`;
  if (s.beta) t += ` · Schrägungswinkel ${n(s.beta)}°`;
  if (kind === 'internal') t += ` · außen Ø ${n(s.outer)}`;
  if (s.undercut && kind !== 'internal' && kind !== 'sprocket') t += ` · Unterschnitt: unter ${s.zMin} Zähnen Profilverschiebung nötig`;
  if (s.pointed) t += ' · Kopf gekürzt (Zahn liefe spitz zu)';
  return t;
}
