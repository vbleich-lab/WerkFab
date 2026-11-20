// Part families: configurations (named sets of parameter values) to and from a table file (CSV). Pure, no DOM.
// The table has one row per variant: first column the name, then one column per parameter. Excel in German
// writes ";" and decimal commas – both are read; written is ";" with a BOM so Excel opens it directly.

// split CSV text into rows of cells (quotes, doubled quotes, line breaks inside quotes, ; , or tab)
export function parseCSV(text) {
  text = String(text).replace(/^﻿/, '');
  const first = text.split(/\r?\n/).find(l => l.trim()) || '';
  const count = c => (first.match(new RegExp(c === '\t' ? '\t' : `\\${c}`, 'g')) || []).length;
  const sep = [';', '\t', ','].sort((a, b) => count(b) - count(a))[0];
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return { sep, rows: rows.filter(r => r.some(c => c.trim() !== '')) };
}

// "12,5" → "12.5" (a number with a decimal comma), "=L/2" → "L/2" (Excel formula style); everything else stays
export const normValue = v => { const t = String(v).trim().replace(/^=\s*/, ''); return /^[-+]?\d+,\d+$/.test(t) ? t.replace(',', '.') : t; };

// table → configurations. params: [{ name }]. Returns { configs, unknown: [column names that are no parameter],
// missing: [parameters without a column] }. Header names are matched without regard to case and spaces.
export function csvToConfigs(text, params) {
  const { rows } = parseCSV(text);
  if (rows.length < 2) throw new Error('Die Tabelle braucht eine Kopfzeile und mindestens eine Variante.');
  const key = s => String(s).trim().toLowerCase().replace(/\s+/g, '');
  const head = rows[0].map(c => c.trim()), byKey = new Map(params.map(p => [key(p.name), p.name]));
  const cols = head.map((c, i) => (i === 0 ? null : byKey.get(key(c)) || null));
  const unknown = head.filter((c, i) => i > 0 && c && !cols[i]);
  const missing = params.map(p => p.name).filter(n => !cols.includes(n));
  if (!cols.some(Boolean)) throw new Error(`Keine Spalte passt zu einem Parameter (${params.map(p => p.name).join(', ') || 'keine Parameter'}).`);
  const configs = [], seen = new Set();
  rows.slice(1).forEach((r, k) => {
    let name = String(r[0] ?? '').trim() || `Variante ${k + 1}`;
    while (seen.has(name)) name += ' (2)';
    seen.add(name);
    const values = {};
    cols.forEach((p, i) => { if (p && r[i] != null && String(r[i]).trim() !== '') values[p] = normValue(r[i]); });
    configs.push({ name, values });
  });
  return { configs, unknown, missing };
}

// configurations → CSV (";" separated, BOM, decimal points kept so the file reads back the same everywhere)
export function configsToCSV(params, configs) {
  const q = v => { const s = String(v ?? ''); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [['Konfiguration', ...params.map(p => p.name)].map(q).join(';')];
  for (const c of configs) lines.push([c.name, ...params.map(p => c.values?.[p.name] ?? '')].map(q).join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

// file name for a variant: letters, digits, - _ . and spaces; others become _
export const variantFile = (base, name) => `${base}_${String(name).trim().replace(/[^\p{L}\p{N}\-_. ]+/gu, '_').replace(/\s+/g, '_').replace(/_+/g, '_') || 'Variante'}`;
