// Inspection plan from the drawing: every dimension and geometric tolerance gets a number (balloon on the sheet)
// and a row with nominal size, tolerance and limits, an empty field for the measured value.
// Tolerances come from the text behind the number: "±0,1", "+0,1/−0,05", "+0,2 0", an ISO fit (H7, g6);
// without one the general tolerance ISO 2768 (f, m, c, v) applies.
import { parseFit, fitLimits } from './fits.js';

// ISO 2768-1 linear dimensions: upper ends of the ranges and the ± deviations per class
const LIN_RANGES = [3, 6, 30, 120, 400, 1000, 2000, 4000];
const LIN = { f: [0.05, 0.05, 0.1, 0.15, 0.2, 0.3, 0.5, null], m: [0.1, 0.1, 0.2, 0.3, 0.5, 0.8, 1.2, 2], c: [0.2, 0.3, 0.5, 0.8, 1.2, 2, 3, 4], v: [null, 0.5, 1, 1.5, 2.5, 4, 6, 8] };
// radii and chamfer heights
const RAD_RANGES = [3, 6, Infinity];
const RAD = { f: [0.2, 0.5, 1], m: [0.2, 0.5, 1], c: [0.4, 1, 2], v: [0.4, 1, 2] };
// angles by the length of the shorter leg: ≤10, ≤50, ≤120, ≤400, >400 (in degrees)
const ANG = { f: [1, 0.5, 1 / 3, 1 / 6, 1 / 12], m: [1, 0.5, 1 / 3, 1 / 6, 1 / 12], c: [1.5, 1, 0.5, 0.25, 1 / 6], v: [3, 2, 1, 0.5, 1 / 3] };
export const GENERAL_CLASSES = { f: 'fein', m: 'mittel', c: 'grob', v: 'sehr grob' };

export function generalTol(kind, nominal, cls = 'm', leg = 30) {
  if (!(cls in LIN)) cls = 'm';
  if (kind === 'ang') {
    const i = leg <= 10 ? 0 : leg <= 50 ? 1 : leg <= 120 ? 2 : leg <= 400 ? 3 : 4;
    return ANG[cls][i];
  }
  if (kind === 'rad') return RAD[cls][RAD_RANGES.findIndex(b => nominal <= b)];
  if (!(nominal >= 0.5)) return null; // below 0.5 mm the deviations are given at the size itself
  const i = LIN_RANGES.findIndex(b => nominal <= b);
  return i < 0 ? null : LIN[cls][i];
}

const num = s => +String(s).replace(/[−–]/g, '-').replace(',', '.');
const NUM = String.raw`[+\-−–]?\s*\d+(?:[.,]\d+)?`;
// the tolerance in the text behind the number → [upper, lower] deviations in mm (null: none written)
export function parseTol(txt, nominal) {
  let s = String(txt ?? '').trim().replace(/^\d+\s*[×x]\s*/i, ''); // count "2×" in front
  if (!s) return null;
  const fit = s.split(/\s+/).find(w => parseFit(w));
  if (fit) { const l = fitLimits(fit, Math.round(nominal * 1000) / 1000); return l ? { up: l[0] / 1000, lo: l[1] / 1000, text: fit } : null; }
  let m = new RegExp(String.raw`^±\s*(\d+(?:[.,]\d+)?)`).exec(s);
  if (m) return { up: num(m[1]), lo: -num(m[1]), text: s };
  m = new RegExp(String.raw`^(${NUM})\s*(?:/|\s)\s*(${NUM})`).exec(s);
  if (m) { const a = num(m[1].replace(/\s/g, '')), b = num(m[2].replace(/\s/g, '')); return { up: Math.max(a, b), lo: Math.min(a, b), text: s }; }
  if (/^(max|min)\b/i.test(s)) return null;
  return null;
}

// nominal value of a drawing dimension (the same as the number on the sheet)
export function dimNominal(dm) {
  if (dm.kind === 'dia') return 2 * dm.r;
  if (dm.kind === 'rad') return +dm.r;
  if (dm.kind === 'ang') {
    let w = Math.atan2(dm.b[1] - dm.v[1], dm.b[0] - dm.v[0]) - Math.atan2(dm.a[1] - dm.v[1], dm.a[0] - dm.v[0]);
    while (w > Math.PI) w -= 2 * Math.PI;
    while (w < -Math.PI) w += 2 * Math.PI;
    return (Math.abs(w) * 180) / Math.PI;
  }
  if (dm.kind === 'h') return Math.abs(dm.a[0] - dm.b[0]);
  if (dm.kind === 'v') return Math.abs(dm.a[1] - dm.b[1]);
  if (dm.a && dm.b) return Math.hypot(dm.a[0] - dm.b[0], dm.a[1] - dm.b[1]);
  return null;
}

const GDT_NAMES = { pos: 'Position', flat: 'Ebenheit', straight: 'Geradheit', round: 'Rundheit', cyl: 'Zylinderform', par: 'Parallelität', perp: 'Rechtwinkligkeit', angle: 'Neigung', conc: 'Koaxialität', sym: 'Symmetrie', run: 'Rundlauf' };
const MEASURED = ['h', 'v', 'lin', 'dia', 'rad', 'ang', 'gdt'];

// rows of the inspection plan; opt.general = ISO 2768 class, opt.onlyTol = only dimensions with a written tolerance
export function inspectionItems(userDims, opt = {}) {
  const cls = opt.general || 'm', r4 = v => Math.round(v * 10000) / 10000;
  const out = [];
  (userDims || []).forEach((dm, idx) => {
    const kind = dm.kind || 'lin';
    if (!MEASURED.includes(kind)) return;
    if (kind === 'gdt') {
      const t = String(dm.text || '').trim(), m = /(\d+(?:[.,]\d+)?)/.exec(t);
      out.push({ idx, view: dm.view, kind, feature: GDT_NAMES[dm.sym || 'pos'] || 'Form/Lage', nominal: null, nominalText: '', tolText: t, up: m ? num(m[1]) : null, lo: m ? 0 : null, source: 'Form- und Lagetoleranz' });
      return;
    }
    const nominal = dimNominal(dm);
    if (!(nominal >= 0)) return;
    let tol = parseTol(dm.txt, nominal), source = tol ? (parseFit(tol.text) ? 'Passung ISO 286' : 'Toleranz') : '';
    if (!tol) {
      if (opt.onlyTol) return;
      const g = generalTol(kind, nominal, cls);
      if (g != null) { tol = { up: g, lo: -g, text: `ISO 2768-${cls}` }; source = 'Allgemeintoleranz'; }
    }
    const pre = kind === 'dia' ? 'Ø' : kind === 'rad' ? 'R' : '', unit = kind === 'ang' ? '°' : '';
    const nm = r4(nominal);
    const feature = { h: 'Länge (waagrecht)', v: 'Länge (senkrecht)', lin: 'Länge', dia: 'Durchmesser', rad: 'Radius', ang: 'Winkel' }[kind];
    out.push({
      idx, view: dm.view, kind, feature, nominal: nm, nominalText: `${pre}${String(+nm.toFixed(kind === 'ang' ? 2 : 3)).replace('.', ',')}${unit}`,
      tolText: tol ? tol.text : '', up: tol ? tol.up : null, lo: tol ? tol.lo : null, source,
      max: tol ? r4(nm + tol.up) : null, min: tol ? r4(nm + tol.lo) : null,
    });
  });
  out.forEach((r, i) => (r.no = i + 1));
  return out;
}

// CSV for a spreadsheet: semicolon and decimal comma (opens directly in a German Excel)
export function inspectionCsv(items, meta = {}) {
  const c = v => (v == null ? '' : typeof v === 'number' ? String(+v.toFixed(4)).replace('.', ',') : /[;"\n]/.test(String(v)) ? '"' + String(v).split('"').join('""') + '"' : String(v));
  const head = ['Nr.', 'Ansicht', 'Merkmal', 'Nennmaß', 'Toleranz', 'Oberes Abmaß', 'Unteres Abmaß', 'Höchstmaß', 'Mindestmaß', 'Herkunft', 'Istwert', 'i.O.'];
  const lines = [];
  if (meta.title) lines.push(c('Prüfplan ' + meta.title));
  lines.push(head.join(';'));
  for (const r of items) lines.push([r.no, r.view, r.feature, r.nominalText, r.tolText, r.up, r.lo, r.max, r.min, r.source, '', ''].map(c).join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}
