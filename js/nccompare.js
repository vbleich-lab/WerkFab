// Comparing two NC programs line by line (Myers' O(ND) diff). Pure functions, no DOM – used by the NC window
// and node tests.

// the text a line is compared by: block numbers ("N120 ", Heidenhain "15 ") and spaces can be ignored, so a
// block inserted at the machine does not mark every following (renumbered) line as changed
export function ncKey(line, { numbers = true, spaces = true, comments = false } = {}) {
  let s = String(line);
  if (numbers) s = s.replace(/^\s*N?\d+\s+(?=\S)/, '').replace(/^\s*N\d+$/, '');
  if (comments) s = s.replace(/\s*(\(.*\)|;.*)$/, '');
  if (spaces) s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// shortest edit script between two arrays of keys: [{ op: '=', a, b } | { op: '-', a } | { op: '+', b }] with a/b
// the line indices; null when the programs differ in more than maxD lines (too different to be worth showing)
export function diffLines(A, B, maxD = 3000) {
  const n = A.length, m = B.length, max = n + m, off = max + 1;
  // trim the common start and end: most edits touch a few blocks of a long program
  let s = 0;
  while (s < n && s < m && A[s] === B[s]) s++;
  let e = 0;
  while (e < n - s && e < m - s && A[n - 1 - e] === B[m - 1 - e]) e++;
  const a = A.slice(s, n - e), b = B.slice(s, m - e), N = a.length, M = b.length;
  const out = [];
  for (let k = 0; k < s; k++) out.push({ op: '=', a: k, b: k });
  if (N || M) {
    const lim = Math.min(maxD, N + M);
    const v = new Int32Array(2 * (N + M) + 3), trace = [];
    const o = N + M + 1;
    let found = -1;
    for (let d = 0; d <= lim && found < 0; d++) {
      trace.push(v.slice(o - d - 1, o + d + 2));
      for (let k = -d; k <= d; k += 2) {
        let x = k === -d || (k !== d && v[o + k - 1] < v[o + k + 1]) ? v[o + k + 1] : v[o + k - 1] + 1;
        let y = x - k;
        while (x < N && y < M && a[x] === b[y]) { x++; y++; }
        v[o + k] = x;
        if (x >= N && y >= M) { found = d; break; }
      }
    }
    if (found < 0) return null;
    // walk back through the saved rows
    const steps = [];
    let x = N, y = M;
    for (let d = found; d > 0; d--) {
      const row = trace[d], at = k => row[k + d + 1]; // row holds v[-d-1 .. d+1] of the step before
      const k = x - y;
      const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
      const pk = down ? k + 1 : k - 1, px = at(pk), py = px - pk;
      while (x > px && y > py) { steps.push({ op: '=', a: x - 1, b: y - 1 }); x--; y--; }
      if (down) { steps.push({ op: '+', b: y - 1 }); y--; } else { steps.push({ op: '-', a: x - 1 }); x--; }
    }
    while (x > 0 && y > 0) { steps.push({ op: '=', a: x - 1, b: y - 1 }); x--; y--; }
    for (const st of steps.reverse()) out.push({ op: st.op, ...(st.a != null ? { a: st.a + s } : {}), ...(st.b != null ? { b: st.b + s } : {}) });
  }
  for (let k = 0; k < e; k++) out.push({ op: '=', a: n - e + k, b: m - e + k });
  void off;
  return out;
}

// rows for a side-by-side view: removed and added lines next to each other become "changed" pairs; long runs
// of equal lines fold to `context` lines around each change
export function compareRows(textA, textB, opt = {}) {
  const la = String(textA).replace(/\r\n?/g, '\n').split('\n'), lb = String(textB).replace(/\r\n?/g, '\n').split('\n');
  const ops = diffLines(la.map(l => ncKey(l, opt)), lb.map(l => ncKey(l, opt)), opt.maxD);
  if (!ops) return null;
  const rows = [];
  for (let i = 0; i < ops.length;) {
    if (ops[i].op === '=') { rows.push({ kind: 'same', a: ops[i].a, b: ops[i].b }); i++; continue; }
    const del = [], add = [];
    while (i < ops.length && ops[i].op !== '=') { (ops[i].op === '-' ? del : add).push(ops[i]); i++; }
    for (let k = 0; k < Math.max(del.length, add.length); k++) {
      const d = del[k], p = add[k];
      rows.push(d && p ? { kind: 'changed', a: d.a, b: p.b } : d ? { kind: 'removed', a: d.a } : { kind: 'added', b: p.b });
    }
  }
  const stats = { changed: 0, removed: 0, added: 0 };
  for (const r of rows) if (r.kind !== 'same') stats[r.kind]++;
  // fold equal runs
  const ctx = opt.context ?? 3, shown = [];
  const near = rows.map(() => false);
  rows.forEach((r, k) => { if (r.kind !== 'same') for (let j = Math.max(0, k - ctx); j <= Math.min(rows.length - 1, k + ctx); j++) near[j] = true; });
  for (let k = 0; k < rows.length;) {
    if (near[k]) { shown.push(rows[k]); k++; continue; }
    let j = k;
    while (j < rows.length && !near[j]) j++;
    shown.push({ kind: 'fold', n: j - k, a: rows[k].a, b: rows[k].b });
    k = j;
  }
  return { rows: shown, stats, linesA: la, linesB: lb };
}
