// Standard parts ("Normteile"): screws, nuts, washers, pins, keys, retaining rings, bearings, O-rings.
// Guide dimensions (nominal sizes of the standards, no tolerances). A thread is a step of its own: the cylinder is
// marked as a thread (drawings show it) or, on request, cut as a real helix.
//
// A part is a list of steps around its axis (z along the axis, r away from it; z = 0 is the seat: the face
// the head, the nut or the washer lies on – a shank runs to −z, into the hole):
//   { k: 'rev', pts: [[r, z], …], op }             closed outline in the r–z half plane, turned once around
//   { k: 'ring', r, z, rad, op }                   a circle of radius rad at (r, z), turned once around (torus)
//   { k: 'prism', shape: 'hex' | 'circle' | 'rect', s | r | w, h, rr, hole, z, dist, op }
//   { k: 'thread', r, z, size }                    the cylinder face of radius r at height z carries the thread size
// op: 'new' for the first step, then 'join' or 'cut' (applied to the part itself).

const T30 = Math.tan(Math.PI / 6);

// metric sizes: d, then per standard
const M = {
  //        d   4762: dk k s t       hex: s k    nut m  thin  lock   10642: dk k s          7380: dk k s         4026 s  7089: d1 d2 h     7093: d2 h   127: d1 d2 s
  M3: { d: 3, cap: [5.5, 3, 2.5, 1.3], hex: [5.5, 2], m: 2.4, mt: 1.8, ml: 4, csk: [6.72, 1.86, 2], btn: [5.7, 1.65, 2], set: 1.5, w: [3.2, 7, 0.5], wl: [9, 0.8], sp: [3.1, 6.2, 0.8] },
  M4: { d: 4, cap: [7, 4, 3, 2], hex: [7, 2.8], m: 3.2, mt: 2.2, ml: 5, csk: [8.96, 2.48, 2.5], btn: [7.6, 2.2, 2.5], set: 2, w: [4.3, 9, 0.8], wl: [12, 1], sp: [4.1, 7.6, 0.9] },
  M5: { d: 5, cap: [8.5, 5, 4, 2.5], hex: [8, 3.5], m: 4.7, mt: 2.7, ml: 5, csk: [11.2, 3.1, 3], btn: [9.5, 2.75, 3], set: 2.5, w: [5.3, 10, 1], wl: [15, 1.2], sp: [5.1, 9.2, 1.2] },
  M6: { d: 6, cap: [10, 6, 5, 3], hex: [10, 4], m: 5.2, mt: 3.2, ml: 6, csk: [13.44, 3.72, 4], btn: [10.5, 3.3, 4], set: 3, w: [6.4, 12, 1.6], wl: [18, 1.6], sp: [6.1, 11.8, 1.6] },
  M8: { d: 8, cap: [13, 8, 6, 4], hex: [13, 5.3], m: 6.8, mt: 4, ml: 8, csk: [17.92, 4.96, 5], btn: [14, 4.4, 5], set: 4, w: [8.4, 16, 1.6], wl: [24, 2], sp: [8.1, 14.8, 2] },
  M10: { d: 10, cap: [16, 10, 8, 5], hex: [16, 6.4], m: 8.4, mt: 5, ml: 10, csk: [22.4, 6.2, 6], btn: [17.5, 5.5, 6], set: 5, w: [10.5, 20, 2], wl: [30, 2.5], sp: [10.2, 18.1, 2.2] },
  M12: { d: 12, cap: [18, 12, 10, 6], hex: [18, 7.5], m: 10.8, mt: 6, ml: 12, csk: [26.88, 7.44, 8], btn: [21, 6.6, 8], set: 6, w: [13, 24, 2.5], wl: [37, 3], sp: [12.2, 21.1, 2.5] },
  M16: { d: 16, cap: [24, 16, 14, 8], hex: [24, 10], m: 14.8, mt: 8, ml: 16, csk: [33.6, 8.8, 10], btn: [28, 8.8, 10], set: 8, w: [17, 30, 3], wl: [50, 3], sp: [16.2, 27.4, 3.5] },
  M20: { d: 20, cap: [30, 20, 17, 10], hex: [30, 12.5], m: 18, mt: 10, ml: 20, csk: [40.32, 10.16, 12], set: 10, w: [21, 37, 3], wl: [60, 4], sp: [20.2, 33.6, 4] },
  M24: { d: 24, cap: [36, 24, 19, 12], hex: [36, 15], m: 21.5, mt: 12, ml: 24, set: 12, w: [25, 44, 4], wl: [72, 5], sp: [24.5, 40, 5] },
};
// further series: low head cap screw DIN 7984 (dk, k, s), cap nut DIN 1587 (s, h), small washer ISO 7092 (d2, h)
const MORE = {
  M3: { low: [5.5, 2, 2], ws: [6, 0.5] }, M4: { low: [7, 2.8, 2.5], cn: [7, 8], ws: [8, 0.5] }, M5: { low: [8.5, 3.5, 3], cn: [8, 10], ws: [9, 1] }, M6: { low: [10, 4, 4], cn: [10, 12], ws: [11, 1.6] },
  M8: { low: [13, 5, 5], cn: [13, 15], ws: [15, 1.6] }, M10: { low: [16, 6, 7], cn: [17, 18], ws: [18, 1.6] }, M12: { low: [18, 7, 8], cn: [19, 22], ws: [20, 2] }, M16: { low: [24, 9, 12], cn: [24, 28], ws: [28, 2.5] }, M20: { cn: [30, 34], ws: [34, 3] },
};
for (const k of Object.keys(MORE)) Object.assign(M[k], MORE[k]);
// coarse pitch; the hole of a nut is the minor diameter of its thread
const PITCH = { M3: 0.5, M4: 0.7, M5: 0.8, M6: 1, M8: 1.25, M10: 1.5, M12: 1.75, M16: 2, M20: 2.5, M24: 3 };
const core = z => M[z].d - 1.0825 * PITCH[z];
const mSizes = key => Object.keys(M).filter(k => M[k][key] != null);
// spring pins ISO 8752: nominal Ø → wall
const SPRING = { 2: 0.4, 3: 0.6, 4: 0.8, 5: 1, 6: 1.25, 8: 1.5, 10: 2, 12: 2.5, 16: 3, 20: 4 };
// rotary shaft seals DIN 3760: d × D × b
const SEALS = { '10×22×7': [10, 22, 7], '12×24×7': [12, 24, 7], '15×30×7': [15, 30, 7], '20×35×7': [20, 35, 7], '25×40×7': [25, 40, 7], '30×47×7': [30, 47, 7], '35×52×7': [35, 52, 7], '40×62×8': [40, 62, 8], '50×72×8': [50, 72, 8] };

// feather keys DIN 6885: b × h
const KEYS = { '4×4': [4, 4], '5×5': [5, 5], '6×6': [6, 6], '8×7': [8, 7], '10×8': [10, 8], '12×8': [12, 8], '14×9': [14, 9], '16×10': [16, 10], '18×11': [18, 11], '20×12': [20, 12] };
// retaining rings: nominal Ø → thickness s, Ø unloaded d3, radial width b
const RING_SHAFT = { 10: [1, 9.3, 1.8], 12: [1, 11, 1.8], 15: [1, 13.8, 2.2], 16: [1, 14.7, 2.2], 20: [1.2, 18.5, 2.6], 25: [1.2, 23.2, 3], 30: [1.5, 27.9, 3.5], 35: [1.5, 32.2, 3.9], 40: [1.75, 36.5, 4.4], 50: [2, 45.8, 5.1] };
const RING_BORE = { 10: [1, 10.8, 1.4], 12: [1, 13, 1.7], 16: [1, 17.3, 2], 20: [1, 21.5, 2.3], 25: [1.2, 26.9, 2.7], 30: [1.2, 32.1, 3], 35: [1.5, 37.8, 3.4], 40: [1.75, 43.5, 3.9], 50: [2, 54.2, 4.6] };
// deep groove ball bearings: d, D, B
const BEARINGS = { 623: [3, 10, 4], 624: [4, 13, 5], 625: [5, 16, 5], 626: [6, 19, 6], 608: [8, 22, 7], 6000: [10, 26, 8], 6001: [12, 28, 8], 6002: [15, 32, 9], 6003: [17, 35, 10], 6004: [20, 42, 12], 6005: [25, 47, 12], 6006: [30, 55, 13],
  6200: [10, 30, 9], 6201: [12, 32, 10], 6202: [15, 35, 11], 6203: [17, 40, 12], 6204: [20, 47, 14], 6205: [25, 52, 15], 6206: [30, 62, 16] };
// O-rings: inner Ø × cord Ø
const ORINGS = { '6×1,5': [6, 1.5], '8×2': [8, 2], '10×2': [10, 2], '12×2': [12, 2], '16×2': [16, 2], '20×2,5': [20, 2.5], '25×3': [25, 3], '30×3': [30, 3], '40×3,5': [40, 3.5], '50×4': [50, 4] };
const PINS = [2, 3, 4, 5, 6, 8, 10, 12, 16, 20];
// Tubes and sections (semi-finished products, cut to any length).
// Round steel tubes: outer diameters of series 1 and preferred wall thicknesses (ISO 4200 / EN 10220). Not every pair
// is rolled or stocked – the list offers the walls from about a fortieth to a fifth of the diameter.
const TUBE_OD = [10.2, 13.5, 17.2, 21.3, 26.9, 33.7, 42.4, 48.3, 60.3, 76.1, 88.9, 114.3, 139.7, 168.3, 219.1];
const TUBE_WALL = [1.6, 2, 2.3, 2.6, 2.9, 3.2, 3.6, 4, 4.5, 5, 5.6, 6.3, 7.1, 8, 8.8, 10];
const num = x => String(x).replace('.', ',');
const TUBES = Object.fromEntries(TUBE_OD.flatMap(d => TUBE_WALL.filter(t => t >= d / 45 && t <= d / 5).map(t => [`${num(d)}×${num(t)}`, [d, t]])));
// cold formed hollow sections EN 10219: side(s) → walls; outer corner radius 2 × wall up to 6 mm, 2.5 × wall above
const SHS = { 20: [2], 25: [2, 2.5], 30: [2, 2.5, 3], 40: [2, 2.5, 3, 4], 50: [2, 2.5, 3, 4, 5], 60: [2, 3, 4, 5], 70: [3, 4, 5], 80: [3, 4, 5, 6], 90: [3, 4, 5, 6], 100: [3, 4, 5, 6, 8], 120: [4, 5, 6, 8], 150: [5, 6, 8, 10] };
const RHS = { '40×20': [2, 2.5, 3], '50×25': [2, 2.5, 3], '50×30': [2, 2.5, 3, 4], '60×40': [2, 3, 4, 5], '80×40': [2, 3, 4, 5], '80×60': [3, 4, 5], '100×50': [3, 4, 5, 6], '100×60': [3, 4, 5, 6], '120×60': [3, 4, 5, 6], '120×80': [4, 5, 6, 8], '150×100': [4, 5, 6, 8], '200×100': [5, 6, 8, 10] };
const HOLLOW = Object.fromEntries([...Object.entries(SHS).flatMap(([a, ts]) => ts.map(t => [`${a}×${a}×${num(t)}`, [+a, +a, t]])), ...Object.entries(RHS).flatMap(([k, ts]) => ts.map(t => [`${k}×${num(t)}`, [...k.split('×').map(Number), t]]))]);
const hollow = (z, L) => { const [w, hh, t] = HOLLOW[z], ro = (t > 6 ? 2.5 : 2) * t; return [{ k: 'prism', shape: 'rect', w, h: hh, rr: ro, z: 0, dist: L, op: 'new' }, { k: 'prism', shape: 'rect', w: w - 2 * t, h: hh - 2 * t, rr: ro - t, z: -0.01, dist: L + 0.02, op: 'cut' }]; };
// Rolled sections. Dimensions as tabulated in the standards; the tests compare every cross-section with the
// area (or the mass per metre) the tables give, so a wrong radius or thickness shows.
// I-beams: h, b, web s, flange t, root radius r
const IPE = { 80: [80, 46, 3.8, 5.2, 5], 100: [100, 55, 4.1, 5.7, 7], 120: [120, 64, 4.4, 6.3, 7], 140: [140, 73, 4.7, 6.9, 7], 160: [160, 82, 5, 7.4, 9], 180: [180, 91, 5.3, 8, 9], 200: [200, 100, 5.6, 8.5, 12], 220: [220, 110, 5.9, 9.2, 12], 240: [240, 120, 6.2, 9.8, 15], 270: [270, 135, 6.6, 10.2, 15], 300: [300, 150, 7.1, 10.7, 15], 330: [330, 160, 7.5, 11.5, 18], 360: [360, 170, 8, 12.7, 18], 400: [400, 180, 8.6, 13.5, 21], 450: [450, 190, 9.4, 14.6, 21], 500: [500, 200, 10.2, 16, 21], 550: [550, 210, 11.1, 17.2, 24], 600: [600, 220, 12, 19, 24] };
const heR = n => (n <= 140 ? 12 : n <= 180 ? 15 : n <= 220 ? 18 : n <= 240 ? 21 : n <= 280 ? 24 : 27);
const HEA = Object.fromEntries([[100, 96, 100, 5, 8], [120, 114, 120, 5, 8], [140, 133, 140, 5.5, 8.5], [160, 152, 160, 6, 9], [180, 171, 180, 6, 9.5], [200, 190, 200, 6.5, 10], [220, 210, 220, 7, 11], [240, 230, 240, 7.5, 12], [260, 250, 260, 7.5, 12.5], [280, 270, 280, 8, 13], [300, 290, 300, 8.5, 14], [320, 310, 300, 9, 15.5], [340, 330, 300, 9.5, 16.5], [360, 350, 300, 10, 17.5], [400, 390, 300, 11, 19], [450, 440, 300, 11.5, 21], [500, 490, 300, 12, 23], [550, 540, 300, 12.5, 24], [600, 590, 300, 13, 25]].map(([n, ...q]) => [n, [...q, heR(n)]]));
const HEB = Object.fromEntries([[100, 100, 100, 6, 10], [120, 120, 120, 6.5, 11], [140, 140, 140, 7, 12], [160, 160, 160, 8, 13], [180, 180, 180, 8.5, 14], [200, 200, 200, 9, 15], [220, 220, 220, 9.5, 16], [240, 240, 240, 10, 17], [260, 260, 260, 10, 17.5], [280, 280, 280, 10.5, 18], [300, 300, 300, 11, 19], [320, 320, 300, 11.5, 20.5], [340, 340, 300, 12, 21.5], [360, 360, 300, 12.5, 22.5], [400, 400, 300, 13.5, 24], [450, 450, 300, 14, 26], [500, 500, 300, 14.5, 28], [550, 550, 300, 15, 29], [600, 600, 300, 15.5, 30]].map(([n, ...q]) => [n, [...q, heR(n)]]));
// channels with sloped flanges (DIN 1026-1, up to 300: slope 8 %, flange thickness t measured at b / 2, root radius t, toe radius t / 2): h, b, web s, flange t
const UPN = { 50: [50, 38, 5, 7], 65: [65, 42, 5.5, 7.5], 80: [80, 45, 6, 8], 100: [100, 50, 6, 8.5], 120: [120, 55, 7, 9], 140: [140, 60, 7, 10], 160: [160, 65, 7.5, 10.5], 180: [180, 70, 8, 11], 200: [200, 75, 8.5, 11.5], 220: [220, 80, 9, 12.5], 240: [240, 85, 9.5, 13], 260: [260, 90, 10, 14], 280: [280, 95, 10, 15], 300: [300, 100, 10, 16] };
// equal leg angles EN 10056-1: leg a → [root radius, thicknesses]; the toe radius is half the root radius
const ANGLES = { 20: [3.5, [3]], 25: [3.5, [3, 4]], 30: [5, [3, 4]], 35: [5, [4]], 40: [6, [4, 5]], 45: [7, [4.5]], 50: [7, [4, 5, 6]], 60: [8, [5, 6, 8]], 65: [9, [7]], 70: [9, [6, 7]], 75: [9, [6, 8]], 80: [10, [8, 10]], 90: [11, [7, 8, 9, 10]], 100: [12, [8, 10, 12]], 120: [13, [10, 12]], 130: [14, [12]], 150: [16, [10, 12, 15]], 160: [17, [15]], 180: [18, [16, 18]], 200: [18, [16, 18, 20, 24]] };
const ANGLE = Object.fromEntries(Object.entries(ANGLES).flatMap(([a, [r, ts]]) => ts.map(t => [`${a}×${a}×${num(t)}`, [+a, t, r]])));
// flat bars EN 10058 (preferred widths and thicknesses; not every pair is rolled) and square bars EN 10059
const FLAT_W = [10, 12, 15, 16, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 120, 150], FLAT_T = [5, 6, 8, 10, 12, 15, 20, 25, 30, 35, 40, 50, 60];
const FLAT = Object.fromEntries(FLAT_W.flatMap(w => FLAT_T.filter(t => t < w && t >= w / 30).map(t => [`${w}×${t}`, [w, t]])));
const SQUARES = [8, 10, 12, 13, 14, 15, 16, 18, 20, 22, 24, 25, 26, 28, 30, 32, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 100, 110, 120, 130, 140, 150];
// outlines (counter-clockwise, centred on the box of the section) with the corners that are rounded
const beam = ([h, b, s, t, r], L) => [{ k: 'prism', shape: 'poly', z: 0, dist: L, op: 'new', radii: { 3: r, 4: r, 9: r, 10: r },
  pts: [[-b / 2, -h / 2], [b / 2, -h / 2], [b / 2, -h / 2 + t], [s / 2, -h / 2 + t], [s / 2, h / 2 - t], [b / 2, h / 2 - t], [b / 2, h / 2], [-b / 2, h / 2], [-b / 2, h / 2 - t], [-s / 2, h / 2 - t], [-s / 2, -h / 2 + t], [-b / 2, -h / 2 + t]] }];
const channel = ([h, b, s, t], L) => {
  const at = x => t + 0.08 * (b / 2 - x), x0 = -b / 2;
  return [{ k: 'prism', shape: 'poly', z: 0, dist: L, op: 'new', radii: { 2: t / 2, 3: t, 4: t, 5: t / 2 },
    pts: [[x0, -h / 2], [x0 + b, -h / 2], [x0 + b, -h / 2 + at(b)], [x0 + s, -h / 2 + at(s)], [x0 + s, h / 2 - at(s)], [x0 + b, h / 2 - at(b)], [x0 + b, h / 2], [x0, h / 2]] }];
};
const angle = ([a, t, r], L) => [{ k: 'prism', shape: 'poly', z: 0, dist: L, op: 'new', radii: { 2: r / 2, 3: r, 4: r / 2 }, pts: [[0, 0], [a, 0], [a, t], [t, t], [t, a], [0, a]].map(([x, y]) => [x - a / 2, y - a / 2]) }];
// I-beams with tapered flanges IPN (DIN 1025-1): h, b, web s, flange t (at b/4), root r1, toe r2; slope 14 %
const IPN = { 80: [80, 42, 3.9, 5.9, 3.9, 2.3], 100: [100, 50, 4.5, 6.8, 4.5, 2.7], 120: [120, 58, 5.1, 7.7, 5.1, 3.1], 140: [140, 66, 5.7, 8.6, 5.7, 3.4], 160: [160, 74, 6.3, 9.5, 6.3, 3.8], 180: [180, 82, 6.9, 10.4, 6.9, 4.1], 200: [200, 90, 7.5, 11.3, 7.5, 4.5], 220: [220, 98, 8.1, 12.2, 8.1, 4.9], 240: [240, 106, 8.7, 13.1, 8.7, 5.2], 260: [260, 113, 9.4, 14.1, 9.4, 5.6], 280: [280, 119, 10.1, 15.2, 10.1, 6.1], 300: [300, 125, 10.8, 16.2, 10.8, 6.5], 320: [320, 131, 11.5, 17.3, 11.5, 6.9], 340: [340, 137, 12.2, 18.3, 12.2, 7.3], 360: [360, 143, 13, 19.5, 13, 7.8], 380: [380, 149, 13.7, 20.5, 13.7, 8.2], 400: [400, 155, 14.4, 21.6, 14.4, 8.6] };
// channels with parallel flanges UPE (DIN 1026-2): h, b, web s, flange t, root r
const UPE = { 80: [80, 50, 4, 7, 10], 100: [100, 55, 4.5, 7.5, 10], 120: [120, 60, 5, 8, 12], 140: [140, 65, 5, 9, 12], 160: [160, 70, 5.5, 9.5, 12], 180: [180, 75, 5.5, 10.5, 12], 200: [200, 80, 6, 11, 13], 220: [220, 85, 6.5, 12, 13], 240: [240, 90, 7, 12.5, 15], 270: [270, 95, 7.5, 13.5, 15], 300: [300, 100, 9.5, 15, 15], 330: [330, 105, 11, 16, 18], 360: [360, 110, 12, 17, 18], 400: [400, 115, 13.5, 18, 18] };
// T sections with equal legs (EN 10055): b, h, thickness t, root r1, flange edge r2, web end r3; flange and web taper by 2 % (t holds at b/4 and at h/2)
const TEE = { 30: [30, 30, 4, 4, 2, 1], 35: [35, 35, 4.5, 4.5, 2.5, 1], 40: [40, 40, 5, 5, 2.5, 1], 50: [50, 50, 6, 6, 3, 1.5], 60: [60, 60, 7, 7, 3.5, 2], 70: [70, 70, 8, 8, 4, 2], 80: [80, 80, 9, 9, 4.5, 2], 100: [100, 100, 11, 11, 5.5, 3], 120: [120, 120, 13, 13, 6.5, 3], 140: [140, 140, 15, 15, 7.5, 4] };
// unequal angles (EN 10056-1): long leg a, short leg b, thickness t, root r1, toe r2
const LU = { '30×20×3': [30, 20, 3, 4, 2], '30×20×4': [30, 20, 4, 4, 2], '40×20×4': [40, 20, 4, 4, 2], '40×25×4': [40, 25, 4, 4, 2], '45×30×4': [45, 30, 4, 4.5, 2.25], '50×30×5': [50, 30, 5, 5, 2.5], '60×30×5': [60, 30, 5, 5, 2.5], '60×40×5': [60, 40, 5, 6, 3], '60×40×6': [60, 40, 6, 6, 3], '65×50×5': [65, 50, 5, 6, 3], '70×50×6': [70, 50, 6, 7, 3.5], '75×50×6': [75, 50, 6, 7, 3.5], '75×50×8': [75, 50, 8, 7, 3.5], '80×40×6': [80, 40, 6, 7, 3.5], '80×40×8': [80, 40, 8, 7, 3.5], '80×60×7': [80, 60, 7, 8, 4], '100×50×6': [100, 50, 6, 8, 4], '100×50×8': [100, 50, 8, 8, 4], '100×65×7': [100, 65, 7, 10, 5], '100×65×8': [100, 65, 8, 10, 5], '100×65×10': [100, 65, 10, 10, 5], '100×75×8': [100, 75, 8, 10, 5], '100×75×10': [100, 75, 10, 10, 5], '100×75×12': [100, 75, 12, 10, 5], '120×80×8': [120, 80, 8, 11, 5.5], '120×80×10': [120, 80, 10, 11, 5.5], '120×80×12': [120, 80, 12, 11, 5.5], '125×75×8': [125, 75, 8, 11, 5.5], '125×75×10': [125, 75, 10, 11, 5.5], '125×75×12': [125, 75, 12, 11, 5.5], '135×65×8': [135, 65, 8, 11, 5.5], '135×65×10': [135, 65, 10, 11, 5.5], '150×75×9': [150, 75, 9, 12, 6], '150×75×10': [150, 75, 10, 12, 6], '150×75×12': [150, 75, 12, 12, 6], '150×75×15': [150, 75, 15, 12, 6], '150×90×10': [150, 90, 10, 12, 6], '150×90×12': [150, 90, 12, 12, 6], '150×90×15': [150, 90, 15, 12, 6], '150×100×10': [150, 100, 10, 12, 6], '150×100×12': [150, 100, 12, 12, 6], '200×100×10': [200, 100, 10, 15, 7.5], '200×100×12': [200, 100, 12, 15, 7.5], '200×100×15': [200, 100, 15, 15, 7.5], '200×150×12': [200, 150, 12, 15, 7.5], '200×150×15': [200, 150, 15, 15, 7.5] };
const beamT = ([h, b, s, t, r1, r2], L) => {
  // (the flange is t thick a quarter of its width from the edge and grows 14 % towards the web)
  const te = t - 0.14 * (b / 4), tw = t + 0.14 * (b / 4 - s / 2), y = h / 2;
  return [{ k: 'prism', shape: 'poly', z: 0, dist: L, op: 'new', radii: { 2: r2, 3: r1, 4: r1, 5: r2, 8: r2, 9: r1, 10: r1, 11: r2 },
    pts: [[-b / 2, -y], [b / 2, -y], [b / 2, -y + te], [s / 2, -y + tw], [s / 2, y - tw], [b / 2, y - te], [b / 2, y], [-b / 2, y], [-b / 2, y - te], [-s / 2, y - tw], [-s / 2, -y + tw], [-b / 2, -y + te]] }];
};
const channelP = ([h, b, s, t, r], L) => { const x0 = -b / 2, y = h / 2; return [{ k: 'prism', shape: 'poly', z: 0, dist: L, op: 'new', radii: { 3: r, 4: r },
  pts: [[x0, -y], [x0 + b, -y], [x0 + b, -y + t], [x0 + s, -y + t], [x0 + s, y - t], [x0 + b, y - t], [x0 + b, y], [x0, y]] }]; };
const tee = ([b, h, t, r1, r2, r3], L) => {
  const k = 0.02, wb = t / 2 + k * (h / 2 - t), wt = t / 2 - (k * h) / 2, te = t - (k * b) / 4, tw = t + k * (b / 4 - wb);
  return [{ k: 'prism', shape: 'poly', z: 0, dist: L, op: 'new', radii: { 2: r2, 3: r1, 4: r3, 5: r3, 6: r1, 7: r2 },
    pts: [[-b / 2, 0], [b / 2, 0], [b / 2, te], [wb, tw], [wt, h], [-wt, h], [-wb, tw], [-b / 2, te]].map(([x, yy]) => [x, yy - h / 2]) }];
};
const angleU = ([a, b, t, r1, r2], L) => [{ k: 'prism', shape: 'poly', z: 0, dist: L, op: 'new', radii: { 2: r2, 3: r1, 4: r2 }, pts: [[0, 0], [a, 0], [a, t], [t, t], [t, b], [0, b]].map(([x, y]) => [x - a / 2, y - b / 2]) }];
const beamDims = ([h, b, s, t, r]) => `h ${num(h)} · b ${num(b)} · Steg ${num(s)} · Flansch ${num(t)} · r ${num(r)}`;
// hot rolled round bars EN 10060
const BARS = [5, 6, 8, 10, 12, 14, 15, 16, 18, 20, 22, 25, 28, 30, 32, 35, 36, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 100];

const shank = (d, L) => { const c = Math.min(0.1 * d, 0.3 * L); return [[0, -L], [d / 2 - c, -L], [d / 2, -L + c], [d / 2, 0]]; };
// the corners of a hexagon cut off at 30°: what is left of a turned blank (top = +1: at z, material below)
const hexChamfer = (s, z, top) => { const r0 = 0.47 * s, r1 = s / Math.sqrt(3) + 0.3, dz = (r1 - r0) * T30 * (top ? -1 : 1); return { k: 'rev', pts: [[r0, z], [r1, z], [r1, z + dz]], op: 'cut' }; };
const thread = (z, r, at) => ({ k: 'thread', r, z: at, size: z });
// (z: the size; the hole is the minor diameter and carries the thread)
const nut = (z, s, m, collar = 0) => { const d = core(z); return [
  { k: 'prism', shape: 'hex', s, hole: d / 2, z: 0, dist: m, op: 'new' }, hexChamfer(s, 0, false), ...(collar ? [] : [hexChamfer(s, m, true)]),
  ...(collar ? [{ k: 'rev', pts: [[d / 2, m - 0.01], [0.45 * s, m - 0.01], [0.45 * s, m + collar - 0.15 * collar], [0.45 * s - 0.15 * collar, m + collar], [d / 2, m + collar]], op: 'join' }] : []), thread(z, d / 2, m / 2)]; };
// a dome over a hexagon: quarter circle of radius rd from height z0 up
const dome = (rd, z0, ri) => { const pts = [[ri, z0 - 0.01], [rd, z0 - 0.01]]; for (let i = 0; i <= 8; i++) { const a = (i * Math.PI) / 16; pts.push([rd * Math.cos(a), z0 + rd * Math.sin(a)]); } pts[pts.length - 1][0] = 0; pts.push([0, z0 + 0.75 * rd], [ri, z0 + 0.75 * rd - 0.577 * ri]); return pts; };
const washer = (ri, ro, h) => [{ k: 'rev', pts: [[ri, 0], [ro, 0], [ro, h], [ri, h]], op: 'new' }];
const splitRing = (ri, ro, h, gap) => [...washer(ri, ro, h), { k: 'prism', shape: 'rect', w: ro + 1, h: gap, cx: (ro + 1) / 2, z: -0.5, dist: h + 1, op: 'cut' }];

/**
 * The families. len: the part has a length (default, list of preferred lengths); seat: 'in' – the part reaches
 * into the hole (screws, pins), 'on' – it lies on the face around the hole (nuts, washers, rings), 'mid' – free
 * part, placed at the origin or centred in a bore.
 */
export const STD_FAMILIES = [
  { id: 'iso4762', group: 'Schrauben', name: 'Zylinderschraube mit Innensechskant (ISO 4762)', norm: 'ISO 4762', sizes: () => mSizes('cap'), len: 20, seat: 'in',
    make: (z, L) => { const [dk, k, s, t] = M[z].cap, d = M[z].d, c = 0.08 * dk; return [{ k: 'rev', pts: [...shank(d, L), [dk / 2, 0], [dk / 2, k - c], [dk / 2 - c, k], [0, k]], op: 'new' }, { k: 'prism', shape: 'hex', s, z: k, dist: -t, op: 'cut' }, thread(z, d / 2, -L / 2)]; },
    dims: z => { const [dk, k, s] = M[z].cap; return `d ${M[z].d} · dk ${dk} · k ${k} · SW ${s}`; } },
  { id: 'din7984', group: 'Schrauben', name: 'Zylinderschraube mit niedrigem Kopf (DIN 7984)', norm: 'DIN 7984', sizes: () => mSizes('low'), len: 16, seat: 'in',
    make: (z, L) => { const [dk, k, s] = M[z].low, d = M[z].d, c = 0.08 * dk; return [{ k: 'rev', pts: [...shank(d, L), [dk / 2, 0], [dk / 2, k - c], [dk / 2 - c, k], [0, k]], op: 'new' }, { k: 'prism', shape: 'hex', s, z: k, dist: -0.6 * k, op: 'cut' }, thread(z, d / 2, -L / 2)]; },
    dims: z => { const [dk, k, s] = M[z].low; return `d ${M[z].d} · dk ${dk} · k ${k} · SW ${s}`; } },
  { id: 'iso4017', group: 'Schrauben', name: 'Sechskantschraube (ISO 4017 / ISO 4014)', norm: 'ISO 4017 / ISO 4014', sizes: () => mSizes('hex'), len: 30, seat: 'in',
    make: (z, L) => { const [s, k] = M[z].hex, d = M[z].d; return [{ k: 'prism', shape: 'hex', s, z: 0, dist: k, op: 'new' }, { k: 'rev', pts: [...shank(d, L), [0, 0]], op: 'join' }, hexChamfer(s, k, true), thread(z, d / 2, -L / 2)]; },
    dims: z => `d ${M[z].d} · SW ${M[z].hex[0]} · k ${M[z].hex[1]}` },
  { id: 'iso10642', group: 'Schrauben', name: 'Senkschraube mit Innensechskant (ISO 10642)', norm: 'ISO 10642', sizes: () => mSizes('csk'), len: 20, seat: 'in', lenTotal: true,
    make: (z, L) => { const [dk, k, s] = M[z].csk, d = M[z].d, LL = Math.max(L, k + 1), c = Math.min(0.1 * d, 0.3 * LL); return [{ k: 'rev', pts: [[0, -LL], [d / 2 - c, -LL], [d / 2, -LL + c], [d / 2, -k], [dk / 2, 0], [0, 0]], op: 'new' }, { k: 'prism', shape: 'hex', s, z: 0, dist: -0.6 * k, op: 'cut' }, thread(z, d / 2, -(LL + k) / 2)]; },
    dims: z => { const [dk, k, s] = M[z].csk; return `d ${M[z].d} · dk ${dk} · k ${k} · SW ${s} · 90°`; } },
  { id: 'iso7380', group: 'Schrauben', name: 'Linsenkopfschraube mit Innensechskant (ISO 7380)', norm: 'ISO 7380', sizes: () => mSizes('btn'), len: 16, seat: 'in',
    make: (z, L) => { const [dk, k, s] = M[z].btn, d = M[z].d; return [{ k: 'rev', pts: [...shank(d, L), [dk / 2, 0], [dk / 2, 0.25 * k], [0.42 * dk, 0.7 * k], [0.3 * dk, k], [0, k]], op: 'new' }, { k: 'prism', shape: 'hex', s, z: k, dist: -0.55 * k, op: 'cut' }, thread(z, d / 2, -L / 2)]; },
    dims: z => { const [dk, k, s] = M[z].btn; return `d ${M[z].d} · dk ${dk} · k ${k} · SW ${s}`; } },
  { id: 'iso4026', group: 'Schrauben', name: 'Gewindestift mit Innensechskant (ISO 4026)', norm: 'ISO 4026', sizes: () => mSizes('set'), len: 10, seat: 'in',
    make: (z, L) => { const d = M[z].d, c = Math.min(0.12 * d, 0.3 * L); return [{ k: 'rev', pts: [[0, -L], [d / 2 - c, -L], [d / 2, -L + c], [d / 2, -c], [d / 2 - c, 0], [0, 0]], op: 'new' }, { k: 'prism', shape: 'hex', s: M[z].set, z: 0, dist: -Math.min(0.6 * d, 0.6 * L), op: 'cut' }, thread(z, d / 2, -L / 2)]; },
    dims: z => `d ${M[z].d} · SW ${M[z].set}` },
  { id: 'din976', group: 'Schrauben', name: 'Gewindestange (DIN 976)', norm: 'DIN 976', sizes: () => Object.keys(M), len: 100, seat: 'in',
    make: (z, L) => { const d = M[z].d, c = Math.min(0.1 * d, 0.3 * L); return [{ k: 'rev', pts: [[0, -L], [d / 2 - c, -L], [d / 2, -L + c], [d / 2, -c], [d / 2 - c, 0], [0, 0]], op: 'new' }, thread(z, d / 2, -L / 2)]; },
    dims: z => `d ${M[z].d}` },
  { id: 'iso4032', group: 'Muttern', name: 'Sechskantmutter (ISO 4032)', norm: 'ISO 4032', sizes: () => mSizes('m'), seat: 'on',
    make: z => nut(z, M[z].hex[0], M[z].m), dims: z => `d ${M[z].d} · SW ${M[z].hex[0]} · m ${M[z].m}` },
  { id: 'iso4035', group: 'Muttern', name: 'Sechskantmutter, niedrig (ISO 4035)', norm: 'ISO 4035', sizes: () => mSizes('mt'), seat: 'on',
    make: z => nut(z, M[z].hex[0], M[z].mt), dims: z => `d ${M[z].d} · SW ${M[z].hex[0]} · m ${M[z].mt}` },
  { id: 'iso10511', group: 'Muttern', name: 'Sicherungsmutter mit Klemmteil (ISO 10511 / DIN 985)', norm: 'ISO 10511 / DIN 985', sizes: () => mSizes('ml'), seat: 'on',
    make: z => nut(z, M[z].hex[0], 0.7 * M[z].ml, 0.3 * M[z].ml), dims: z => `d ${M[z].d} · SW ${M[z].hex[0]} · h ${M[z].ml}` },
  { id: 'din1587', group: 'Muttern', name: 'Hutmutter, hohe Form (DIN 1587)', norm: 'DIN 1587', sizes: () => mSizes('cn'), seat: 'on',
    make: z => { const [s, hh] = M[z].cn, d = core(z), rd = 0.45 * s, m = hh - rd; return [{ k: 'prism', shape: 'hex', s, hole: d / 2, z: 0, dist: m, op: 'new' }, hexChamfer(s, 0, false), { k: 'rev', pts: dome(rd, m, d / 2), op: 'join' }, thread(z, d / 2, m / 2)]; },
    dims: z => `d ${M[z].d} · SW ${M[z].cn[0]} · h ${M[z].cn[1]}` },
  { id: 'iso7089', group: 'Scheiben', name: 'Scheibe (ISO 7089)', norm: 'ISO 7089', sizes: () => mSizes('w'), seat: 'on',
    make: z => washer(M[z].w[0] / 2, M[z].w[1] / 2, M[z].w[2]), dims: z => `${M[z].w[0]} × ${M[z].w[1]} × ${M[z].w[2]}` },
  { id: 'iso7092', group: 'Scheiben', name: 'Scheibe, kleine Reihe (ISO 7092)', norm: 'ISO 7092', sizes: () => mSizes('ws'), seat: 'on',
    make: z => washer(M[z].w[0] / 2, M[z].ws[0] / 2, M[z].ws[1]), dims: z => `${M[z].w[0]} × ${M[z].ws[0]} × ${M[z].ws[1]}` },
  { id: 'iso7093', group: 'Scheiben', name: 'Scheibe, große Reihe (ISO 7093)', norm: 'ISO 7093', sizes: () => mSizes('wl'), seat: 'on',
    make: z => washer(M[z].w[0] / 2, M[z].wl[0] / 2, M[z].wl[1]), dims: z => `${M[z].w[0]} × ${M[z].wl[0]} × ${M[z].wl[1]}` },
  { id: 'din127', group: 'Scheiben', name: 'Federring (DIN 127)', norm: 'DIN 127', sizes: () => mSizes('sp'), seat: 'on',
    make: z => splitRing(M[z].sp[0] / 2, M[z].sp[1] / 2, M[z].sp[2], 0.5 * M[z].sp[2]), dims: z => `${M[z].sp[0]} × ${M[z].sp[1]} × ${M[z].sp[2]}` },
  { id: 'iso2338', group: 'Stifte und Passfedern', name: 'Zylinderstift (ISO 2338 / ISO 8734)', norm: 'ISO 2338 / ISO 8734', sizes: () => PINS.map(String), len: 20, seat: 'in',
    make: (z, L) => { const d = +z, c = Math.min(0.15 * d, 0.3 * L); return [{ k: 'rev', pts: [[0, -L], [d / 2 - c, -L], [d / 2, -L + c], [d / 2, -c], [d / 2 - c, 0], [0, 0]], op: 'new' }]; },
    dims: z => `Ø ${z}` },
  { id: 'iso2339', group: 'Stifte und Passfedern', name: 'Kegelstift 1:50 (ISO 2339)', norm: 'ISO 2339', sizes: () => PINS.map(String), len: 30, seat: 'in',
    make: (z, L) => { const d = +z; return [{ k: 'rev', pts: [[0, -L], [d / 2, -L], [d / 2 + L / 100, 0], [0, 0]], op: 'new' }]; },
    dims: z => `Ø ${z} (kleines Ende) · 1:50` },
  { id: 'iso8752', group: 'Stifte und Passfedern', name: 'Spannstift, geschlitzt (ISO 8752)', norm: 'ISO 8752', sizes: () => Object.keys(SPRING), len: 20, seat: 'in',
    make: (z, L) => { const d = +z, s = SPRING[z], ro = d / 2, ri = ro - s, c = Math.min(0.5 * s, 0.2 * L); return [{ k: 'rev', pts: [[ri, -L], [ro - c, -L], [ro, -L + c], [ro, -c], [ro - c, 0], [ri, 0]], op: 'new' }, { k: 'prism', shape: 'rect', w: ro + 1, h: 0.25 * d, cx: (ro + 1) / 2, z: -L - 0.5, dist: L + 1, op: 'cut' }]; },
    dims: z => `Ø ${z} · s ${SPRING[z]}` },
  { id: 'din6885', group: 'Stifte und Passfedern', name: 'Passfeder, Form A (DIN 6885)', norm: 'DIN 6885', sizes: () => Object.keys(KEYS), len: 25, seat: 'mid',
    make: (z, L) => { const [b, hh] = KEYS[z], LL = Math.max(L, b + 0.5); return [{ k: 'prism', shape: 'rect', w: LL, h: b, rr: b / 2, z: 0, dist: hh, op: 'new' }]; },
    dims: z => `b ${KEYS[z][0]} · h ${KEYS[z][1]}` },
  { id: 'din6885b', group: 'Stifte und Passfedern', name: 'Passfeder, Form B (DIN 6885)', norm: 'DIN 6885', sizes: () => Object.keys(KEYS), len: 25, seat: 'mid',
    make: (z, L) => { const [b, hh] = KEYS[z]; return [{ k: 'prism', shape: 'rect', w: Math.max(L, 1), h: b, z: 0, dist: hh, op: 'new' }]; },
    dims: z => `b ${KEYS[z][0]} · h ${KEYS[z][1]}` },
  { id: 'din471', group: 'Sicherungsringe', name: 'Sicherungsring für Wellen (DIN 471)', norm: 'DIN 471', sizes: () => Object.keys(RING_SHAFT), seat: 'mid',
    make: z => { const [s, d3, b] = RING_SHAFT[z]; return splitRing(d3 / 2, d3 / 2 + b, s, 0.25 * d3); },
    dims: z => `Welle Ø ${z} · s ${RING_SHAFT[z][0]}` },
  { id: 'din472', group: 'Sicherungsringe', name: 'Sicherungsring für Bohrungen (DIN 472)', norm: 'DIN 472', sizes: () => Object.keys(RING_BORE), seat: 'mid',
    make: z => { const [s, d3, b] = RING_BORE[z]; return splitRing(d3 / 2 - b, d3 / 2, s, 0.25 * d3); },
    dims: z => `Bohrung Ø ${z} · s ${RING_BORE[z][0]}` },
  { id: 'din625', group: 'Lager und Dichtungen', name: 'Rillenkugellager (DIN 625)', norm: 'DIN 625', sizes: () => Object.keys(BEARINGS), seat: 'mid',
    make: z => {
      const [d, D, B] = BEARINGS[z], ri = d / 2, ro = D / 2, w = ro - ri, c = Math.min(0.06 * w + 0.15, 0.2 * B), g = Math.min(0.08 * B, 0.6), a = ri + 0.3 * w, b = ri + 0.7 * w;
      return [{ k: 'rev', pts: [[ri + c, 0], [ro - c, 0], [ro, c], [ro, B - c], [ro - c, B], [ri + c, B], [ri, B - c], [ri, c]], op: 'new' },
        { k: 'rev', pts: [[a, -0.01], [b, -0.01], [b, g], [a, g]], op: 'cut' }, { k: 'rev', pts: [[a, B - g], [b, B - g], [b, B + 0.01], [a, B + 0.01]], op: 'cut' }];
    },
    dims: z => `${BEARINGS[z][0]} × ${BEARINGS[z][1]} × ${BEARINGS[z][2]}` },
  { id: 'din3760', group: 'Lager und Dichtungen', name: 'Wellendichtring (DIN 3760)', norm: 'DIN 3760', sizes: () => Object.keys(SEALS), seat: 'mid',
    make: z => { const [d, D, b] = SEALS[z], ri = d / 2, ro = D / 2, w = 0.25 * (ro - ri); return [{ k: 'rev', pts: [[ri, 0], [ro, 0], [ro, b], [ro - w, b], [ro - w, 0.35 * b], [ri + w, 0.35 * b], [ri + w, b], [ri, b]], op: 'new' }]; },
    dims: z => `${SEALS[z][0]} × ${SEALS[z][1]} × ${SEALS[z][2]}` },
  { id: 'iso3601', group: 'Lager und Dichtungen', name: 'O-Ring (ISO 3601)', norm: 'ISO 3601', sizes: () => Object.keys(ORINGS), seat: 'mid',
    make: z => { const [di, cs] = ORINGS[z]; return [{ k: 'ring', r: di / 2 + cs / 2, z: cs / 2, rad: cs / 2, op: 'new' }]; },
    dims: z => `Ø innen ${ORINGS[z][0]} · Schnur ${ORINGS[z][1]}` },
  { id: 'en10220', group: 'Rohre und Profile', name: 'Rundrohr (EN 10220 / ISO 4200)', norm: 'EN 10220', sizes: () => Object.keys(TUBES), len: 200, seat: 'mid', stock: true,
    make: (z, L) => { const [d, t] = TUBES[z]; return [{ k: 'rev', pts: [[d / 2 - t, 0], [d / 2, 0], [d / 2, L], [d / 2 - t, L]], op: 'new' }]; },
    dims: z => { const [d, t] = TUBES[z]; return `Ø außen ${num(d)} · Wand ${num(t)} · Ø innen ${num(+(d - 2 * t).toFixed(2))}`; } },
  { id: 'en10219q', group: 'Rohre und Profile', name: 'Quadratrohr (EN 10219)', norm: 'EN 10219', sizes: () => Object.keys(HOLLOW).filter(z => HOLLOW[z][0] === HOLLOW[z][1]), len: 200, seat: 'mid', stock: true,
    make: hollow, dims: z => { const [w, , t] = HOLLOW[z]; return `${w} × ${w} · Wand ${num(t)} · Eckradius außen ${num((t > 6 ? 2.5 : 2) * t)}`; } },
  { id: 'en10219r', group: 'Rohre und Profile', name: 'Rechteckrohr (EN 10219)', norm: 'EN 10219', sizes: () => Object.keys(HOLLOW).filter(z => HOLLOW[z][0] !== HOLLOW[z][1]), len: 200, seat: 'mid', stock: true,
    make: hollow, dims: z => { const [w, hh, t] = HOLLOW[z]; return `${w} × ${hh} · Wand ${num(t)} · Eckradius außen ${num((t > 6 ? 2.5 : 2) * t)}`; } },
  { id: 'en10060', group: 'Rohre und Profile', name: 'Rundstahl (EN 10060)', norm: 'EN 10060', sizes: () => BARS.map(String), len: 200, seat: 'mid', stock: true,
    make: (z, L) => [{ k: 'rev', pts: [[0, 0], [+z / 2, 0], [+z / 2, L], [0, L]], op: 'new' }], dims: z => `Ø ${z}` },
  { id: 'en10059', group: 'Rohre und Profile', name: 'Vierkantstahl (EN 10059)', norm: 'EN 10059', sizes: () => SQUARES.map(String), len: 200, seat: 'mid', stock: true,
    make: (z, L) => [{ k: 'prism', shape: 'rect', w: +z, h: +z, z: 0, dist: L, op: 'new' }], dims: z => `${z} × ${z}` },
  { id: 'en10058', group: 'Rohre und Profile', name: 'Flachstahl (EN 10058)', norm: 'EN 10058', sizes: () => Object.keys(FLAT), len: 200, seat: 'mid', stock: true,
    make: (z, L) => [{ k: 'prism', shape: 'rect', w: FLAT[z][0], h: FLAT[z][1], z: 0, dist: L, op: 'new' }], dims: z => `Breite ${FLAT[z][0]} · Dicke ${FLAT[z][1]}` },
  { id: 'en10056', group: 'Rohre und Profile', name: 'Winkelstahl, gleichschenklig (EN 10056-1)', norm: 'EN 10056-1', sizes: () => Object.keys(ANGLE), len: 200, seat: 'mid', stock: true,
    make: (z, L) => angle(ANGLE[z], L), dims: z => { const [a, t, r] = ANGLE[z]; return `Schenkel ${a} · Dicke ${num(t)} · r ${num(r)}`; } },
  { id: 'en10056u', group: 'Rohre und Profile', name: 'Winkelstahl, ungleichschenklig (EN 10056-1)', norm: 'EN 10056-1', sizes: () => Object.keys(LU), len: 200, seat: 'mid', stock: true,
    make: (z, L) => angleU(LU[z], L), dims: z => { const [a, b, t, r] = LU[z]; return `Schenkel ${num(a)} × ${num(b)} · Dicke ${num(t)} · r ${num(r)}`; } },
  { id: 'en10055', group: 'Rohre und Profile', name: 'T-Stahl, gleichschenklig (EN 10055)', norm: 'EN 10055', sizes: () => Object.keys(TEE).map(n => `T ${n}`), len: 200, seat: 'mid', stock: true,
    make: (z, L) => tee(TEE[z.slice(2)], L), dims: z => { const [b, h, t, r] = TEE[z.slice(2)]; return `b ${num(b)} · h ${num(h)} · Dicke ${num(t)} · r ${num(r)}`; } },
  { id: 'upe', group: 'Rohre und Profile', name: 'U-Stahl UPE, parallele Flansche (DIN 1026-2)', norm: 'DIN 1026-2', sizes: () => Object.keys(UPE).map(n => `UPE ${n}`), len: 200, seat: 'mid', stock: true,
    make: (z, L) => channelP(UPE[z.slice(4)], L), dims: z => beamDims(UPE[z.slice(4)]) },
  { id: 'ipn', group: 'Rohre und Profile', name: 'I-Träger IPN (DIN 1025-1)', norm: 'DIN 1025-1', sizes: () => Object.keys(IPN).map(n => `IPN ${n}`), len: 200, seat: 'mid', stock: true,
    make: (z, L) => beamT(IPN[z.slice(4)], L), dims: z => { const [h, b, s, t] = IPN[z.slice(4)]; return `h ${num(h)} · b ${num(b)} · Steg ${num(s)} · Flansch ${num(t)} (14 % geneigt)`; } },
  { id: 'upn', group: 'Rohre und Profile', name: 'U-Stahl UPN (DIN 1026-1)', norm: 'DIN 1026-1', sizes: () => Object.keys(UPN).map(n => `UPN ${n}`), len: 200, seat: 'mid', stock: true,
    make: (z, L) => channel(UPN[z.slice(4)], L), dims: z => { const [h, b, s, t] = UPN[z.slice(4)]; return `h ${h} · b ${b} · Steg ${num(s)} · Flansch ${num(t)} (8 % geneigt)`; } },
  { id: 'ipe', group: 'Rohre und Profile', name: 'I-Träger IPE (DIN 1025-5)', norm: 'DIN 1025-5', sizes: () => Object.keys(IPE).map(n => `IPE ${n}`), len: 200, seat: 'mid', stock: true,
    make: (z, L) => beam(IPE[z.slice(4)], L), dims: z => beamDims(IPE[z.slice(4)]) },
  { id: 'hea', group: 'Rohre und Profile', name: 'Breitflanschträger HEA (DIN 1025-3)', norm: 'DIN 1025-3', sizes: () => Object.keys(HEA).map(n => `HEA ${n}`), len: 200, seat: 'mid', stock: true,
    make: (z, L) => beam(HEA[z.slice(4)], L), dims: z => beamDims(HEA[z.slice(4)]) },
  { id: 'heb', group: 'Rohre und Profile', name: 'Breitflanschträger HEB (DIN 1025-2)', norm: 'DIN 1025-2', sizes: () => Object.keys(HEB).map(n => `HEB ${n}`), len: 200, seat: 'mid', stock: true,
    make: (z, L) => beam(HEB[z.slice(4)], L), dims: z => beamDims(HEB[z.slice(4)]) },
];

export const stdFamily = id => STD_FAMILIES.find(f => f.id === id);
// preferred lengths of screws and pins
export const STD_LENGTHS = [4, 5, 6, 8, 10, 12, 16, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 120, 140, 160, 200];

/** The metric thread that goes through a clearance hole of this diameter (the largest that passes without rattling), or null. */
export function boltSizeFor(dia, famId = 'iso4762') {
  const fam = stdFamily(famId), ok = (fam ? fam.sizes() : []).filter(z => M[z] && M[z].d <= dia + 1e-6 && dia <= 1.3 * M[z].d + 0.3);
  return ok.length ? ok[ok.length - 1] : null;
}

// clearance holes ISO 273 (medium series) and the counterbores for cap screws DIN 974-1 (series 1), by thread
const HOLES = { M3: [3.4, 6.5], M4: [4.5, 8], M5: [5.5, 10], M6: [6.6, 11], M8: [9, 15], M10: [11, 18], M12: [13.5, 20], M16: [17.5, 26], M20: [22, 33], M24: [26, 40] };

/**
 * The hole a screw goes through: { dia, kind: 'simple' | 'cbore' | 'csink', cbDia, cbDepth, csDia, csAngle, seat }.
 * A countersunk screw gets its 90° countersink (head flush); a cap screw – on request (sink) – a counterbore as
 * deep as its head. seat: how far below the surface the head rests.
 */
export function boltHole(famId, size, sink = false) {
  const fam = stdFamily(famId), z = String(size), hl = HOLES[z];
  if (!fam || !M[z]) throw new Error('Diese Größe gibt es in der Norm nicht');
  if (!hl) throw new Error(`Für ${z} ist keine Durchgangsbohrung hinterlegt`);
  const out = { dia: hl[0], kind: 'simple', cbDia: hl[1], cbDepth: 0, csDia: 2 * hl[0], csAngle: 90, seat: 0 };
  if (fam.lenTotal && M[z].csk) return { ...out, kind: 'csink', csDia: M[z].csk[0] };
  if (sink && (famId === 'iso4762' || famId === 'din7984')) { const s = stdPartSteps(famId, z, 0), k = +s.z1.toFixed(3); return { ...out, kind: 'cbore', cbDepth: k, seat: k }; }
  return out;
}

/**
 * A bolted joint through a hole: screw, washer under the head, washer and nut on the far side. clamp: thickness
 * of the clamped parts. o: { headWasher, nut, nutWasher } – family ids or ''. Returns the heights of the pieces
 * and the preferred length that lets the screw look two pitches out of the nut: { len, need, hw, nw, m }.
 * (A countersunk screw has its head in the part: no washer under it, its length counts from the top of the head.)
 */
export function boltStack(famId, size, clamp, o = {}) {
  const fam = stdFamily(famId), z = String(size);
  if (!fam || !M[z]) throw new Error('Diese Größe gibt es in der Norm nicht');
  const hgt = id => { if (!id) return 0; const s = stdPartSteps(id, z, 0); return s.z1 - s.z0; };
  const hw = fam.lenTotal ? 0 : hgt(o.headWasher), nw = o.nut ? hgt(o.nutWasher) : 0, m = hgt(o.nut);
  const need = hw + clamp + nw + m + (o.nut ? 2 * PITCH[z] : 0);
  const len = STD_LENGTHS.find(q => q >= need - 1e-9) ?? Math.ceil(need);
  return { len, need, hw, nw, m };
}

/** Short name of a part, e.g. "ISO 4762 M6×20". */
export function stdPartName(fam, size, len) {
  const norm = fam.norm.split(' / ')[0] + (fam.id === 'din6885b' ? ' B' : '');
  return fam.len ? `${norm} ${size}×${len}` : `${norm} ${size}`;
}

/** The steps of a part and its extent along the axis: { steps, z0, z1, rmax }. */
export function stdPartSteps(famId, size, len) {
  const fam = stdFamily(famId);
  if (!fam) throw new Error('Normteil unbekannt');
  if (!fam.sizes().includes(String(size))) throw new Error('Diese Größe gibt es in der Norm nicht');
  const L = fam.len ? Math.max(1, +len || fam.len) : 0;
  const steps = fam.make(String(size), L);
  let z0 = Infinity, z1 = -Infinity, rmax = 0;
  for (const s of steps) {
    if (s.op === 'cut' || s.k === 'thread') continue;
    if (s.k === 'rev') for (const [r, z] of s.pts) { z0 = Math.min(z0, z); z1 = Math.max(z1, z); rmax = Math.max(rmax, r); }
    else if (s.k === 'ring') { z0 = Math.min(z0, s.z - s.rad); z1 = Math.max(z1, s.z + s.rad); rmax = Math.max(rmax, s.r + s.rad); }
    else { z0 = Math.min(z0, s.z, s.z + s.dist); z1 = Math.max(z1, s.z, s.z + s.dist); rmax = Math.max(rmax, s.shape === 'poly' ? Math.max(...s.pts.map(p => Math.hypot(p[0], p[1]))) : s.shape === 'hex' ? s.s / Math.sqrt(3) : s.shape === 'rect' ? Math.hypot(s.w, s.h) / 2 + Math.abs(s.cx || 0) : s.r); }
  }
  return { steps, z0, z1, rmax, fam, L };
}

/** Volume of a part in mm³ from its steps (prisms and turned outlines; cuts taken off; the chamfer of a hexagon counts as a whole ring, so nuts come out a little light) – for the tests. */
export function stdPartVolume(steps) {
  let v = 0;
  for (const s of steps) {
    if (s.k === 'thread') continue;
    let q = 0;
    if (s.k === 'rev') { // Pappus: area × path of the centroid
      let a = 0, cx = 0;
      for (let i = 0; i < s.pts.length; i++) { const p = s.pts[i], n = s.pts[(i + 1) % s.pts.length], w = p[0] * n[1] - n[0] * p[1]; a += w; cx += (p[0] + n[0]) * w; }
      q = Math.abs((cx / 6) * 2 * Math.PI);
    } else if (s.k === 'ring') q = Math.PI * s.rad * s.rad * 2 * Math.PI * s.r;
    else {
      // an outline with rounded corners: a round on an outer corner takes away what one on an inner corner adds
      const polyArea = () => {
        const P = s.pts, n = P.length;
        let a = 0;
        for (let i = 0; i < n; i++) a += P[i][0] * P[(i + 1) % n][1] - P[(i + 1) % n][0] * P[i][1];
        a /= 2;
        for (const [i, r] of Object.entries(s.radii || {})) {
          const p = P[+i], q = P[(+i - 1 + n) % n], w = P[(+i + 1) % n], u = [q[0] - p[0], q[1] - p[1]], v = [w[0] - p[0], w[1] - p[1]];
          const th = Math.acos((u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))), piece = r * r * (1 / Math.tan(th / 2) - (Math.PI - th) / 2);
          a += ((q[0] - p[0]) * (w[1] - p[1]) - (q[1] - p[1]) * (w[0] - p[0])) * Math.sign(a) < 0 ? -piece : piece;
        }
        return Math.abs(a);
      };
      const area = s.shape === 'poly' ? polyArea() : s.shape === 'hex' ? (Math.sqrt(3) / 2) * s.s * s.s : s.shape === 'rect' ? s.w * s.h - (4 - Math.PI) * (s.rr || 0) ** 2 : Math.PI * s.r * s.r;
      q = (area - (s.hole ? Math.PI * s.hole * s.hole : 0)) * Math.abs(s.dist);
    }
    v += s.op === 'cut' ? -q : q;
  }
  return v;
}
