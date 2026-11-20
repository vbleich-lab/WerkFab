// Standard workholding as simple blocks around the stock (pure): a machine vise, step clamps or a spoil board.
// Everything is given in the setup frame (Z up = tool axis, the stock from minX..maxX, minY..maxY, bottom..top);
// the caller turns the blocks into bodies of the design and marks them as fixtures of the setup, so the existing
// holder and fixture checks see them. Boxes: { name, min: [x, y, z], max: [x, y, z] }.

export const VISE_SIZES = [80, 100, 125, 160, 200]; // jaw widths in mm
export const FIXTURE_KINDS = { vise: 'Maschinenschraubstock', clamps: 'Spannpratzen (4 Stück)', plate: 'Unterlage / Opferplatte' };

const box = (name, x0, y0, z0, x1, y1, z1) => ({ name, min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)] });

// s: { minX, maxX, minY, maxY, bottom, top }
export function fixtureBoxes(kind, s, o = {}) {
  const L = s.maxX - s.minX, B = s.maxY - s.minY, H = s.top - s.bottom, cx = (s.minX + s.maxX) / 2;
  if (!(L > 0 && B > 0 && H > 0)) throw new Error('Das Rohteil hat keine Größe.');
  if (kind === 'vise') {
    // jaws grip across Y; the jaw width is the next size that covers most of the stock length (or the given one)
    const jaw = +o.jaw > 0 ? +o.jaw : VISE_SIZES.find(w => w >= Math.min(L, 200) * 0.8) || VISE_SIZES[VISE_SIZES.length - 1];
    const grip = Math.max(1, Math.min(+o.grip > 0 ? +o.grip : Math.min(8, H * 0.4), H - 0.5));
    const t = Math.max(15, jaw * 0.2), jawH = Math.max(25, jaw * 0.35), par = Math.max(0, +(o.parallel ?? 0));
    const zt = s.bottom + grip, zb = zt - jawH; // jaws: grip height above the stock bottom
    const x0 = cx - jaw / 2, x1 = cx + jaw / 2;
    const out = [
      box('Schraubstock – feste Backe', x0, s.minY - t, zb, x1, s.minY, zt),
      box('Schraubstock – bewegliche Backe', x0, s.maxY, zb, x1, s.maxY + t, zt),
      // body of the vise under the jaws and the stock
      box('Schraubstock – Grundkörper', x0 - 5, s.minY - t - 10, zb - jawH * 0.8, x1 + 5, s.maxY + t + 60, zb),
    ];
    if (par > 0) out.push(box('Parallelunterlage vorn', x0, s.minY, s.bottom - par, x1, s.minY + Math.min(8, B / 4), s.bottom), box('Parallelunterlage hinten', x0, s.maxY - Math.min(8, B / 4), s.bottom - par, x1, s.maxY, s.bottom));
    return { boxes: out, note: `Backenbreite ${jaw} mm, Spanntiefe ${round(grip)} mm${L > jaw ? ` – das Rohteil steht ${round((L - jaw) / 2)} mm über die Backen hinaus` : ''}` };
  }
  if (kind === 'clamps') {
    // four step clamps: on the middle of each side, lying on the stock top with an overlap
    const ov = Math.max(2, Math.min(+o.overlap > 0 ? +o.overlap : 10, Math.min(L, B) / 4)), w = +o.width > 0 ? +o.width : 20, len = 60, th = 12;
    const zt = s.top + th, cy = (s.minY + s.maxY) / 2;
    return { boxes: [
      box('Spannpratze links', s.minX - len + ov, cy - w / 2, s.top, s.minX + ov, cy + w / 2, zt),
      box('Spannpratze rechts', s.maxX - ov, cy - w / 2, s.top, s.maxX + len - ov, cy + w / 2, zt),
      box('Spannpratze vorn', cx - w / 2, s.minY - len + ov, s.top, cx + w / 2, s.minY + ov, zt),
      box('Spannpratze hinten', cx - w / 2, s.maxY - ov, s.top, cx + w / 2, s.maxY + len - ov, zt),
    ], note: `Pratzen ${ov} mm auf dem Rohteil, ${th} mm hoch – diese Bereiche bleiben unbearbeitet` };
  }
  if (kind === 'plate') {
    const m = +o.margin >= 0 ? +o.margin : 20, th = +o.thickness > 0 ? +o.thickness : 15;
    return { boxes: [box('Unterlage', s.minX - m, s.minY - m, s.bottom - th, s.maxX + m, s.maxY + m, s.bottom)], note: `${round(L + 2 * m)} × ${round(B + 2 * m)} × ${th} mm unter dem Rohteil` };
  }
  throw new Error(`Unbekanntes Spannmittel „${kind}“`);
}
const round = v => Math.round(v * 10) / 10;

// boxes that overlap the stock (should not happen for vise and plate; clamps lie on top)
export function overlapsStock(b, s, tol = 1e-6) {
  return b.min[0] < s.maxX - tol && b.max[0] > s.minX + tol && b.min[1] < s.maxY - tol && b.max[1] > s.minY + tol && b.min[2] < s.top - tol && b.max[2] > s.bottom + tol;
}
