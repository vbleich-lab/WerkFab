// Tool table for the control: the tools of the library with number, length and radius, in the format the
// control reads in.
//   heidenhain: CSV for WERKZEUG IMPORT in the tool management (TNC 640 / iTNC 530; line 1 = column names, comma,
//               decimal point; the file goes into TNC:\system\tooltab)
//   linuxcnc:   tool.tbl (T P D Z ;comment)
//   fanuc:      program with G10 offsets (memory C: L10 length geometry, L12 radius geometry; memory A/B: L11 P)
//   sinumerik:  program with $TC_DP tool offsets (D1 of each tool)
import { gaugeLen, fluteLen, shoulderLen } from './tooldraw.js';
import { ascii as postAscii } from './post.js';

export const TOOL_TABLE_FORMATS = {
  heidenhain: { label: 'Heidenhain TNC (CSV für WERKZEUG IMPORT)', ext: 'csv' },
  linuxcnc: { label: 'LinuxCNC (tool.tbl)', ext: 'tbl' },
  fanuc: { label: 'Fanuc (G10-Programm, Speicher C)', ext: 'nc' },
  fanucA: { label: 'Fanuc (G10-Programm, Speicher A)', ext: 'nc' },
  sinumerik: { label: 'Sinumerik 840D ($TC_DP-Programm)', ext: 'mpf' },
};

// tools that do not go into the machine's table: holders, additive heads, cutting heads of 2D machines
const SKIP = ['holder', 'arcwire', 'laserpowder', 'laserwire', 'waterjet', 'laser', 'plasma'];

const ascii = s => postAscii(String(s ?? ''));
const n3 = v => String(+(+v || 0).toFixed(3));
// corner radius as the control sees it (R2 in Heidenhain): ball = radius, bull nose = corner radius
const cornerOf = t => (t.type === 'ball' || t.type === 'lollipop' ? +t.dia / 2 : +t.cornerR || 0);

export function toolTableRows(tools) {
  return tools
    .filter(t => !SKIP.includes(t.type) && Number.isFinite(+t.number) && +t.number >= 0)
    .slice()
    .sort((a, b) => +a.number - +b.number)
    .map(t => {
      const r = (+t.dia || 0) / 2;
      return {
        t: Math.round(+t.number), name: ascii(t.name).toUpperCase().split('"').join('').slice(0, 32), comment: ascii(t.name),
        l: gaugeLen(t), r, r2: Math.min(r, cornerOf(t)), lcuts: fluteLen(t), lu: shoulderLen(t),
        rn: +t.neckDia > 0 ? +t.neckDia / 2 : 0, cut: Math.max(0, Math.round(+t.flutes || 0)), lenOffset: Math.round(+(t.lengthOffset ?? t.number)),
        type: t.type, probe: t.type === 'probe',
      };
    });
}

export function toolTable(tools, format) {
  const rows = toolTableRows(tools), warnings = [];
  const seen = new Map();
  for (const r of rows) { if (seen.has(r.t)) warnings.push(`T${r.t} ist doppelt vergeben (${seen.get(r.t)} / ${r.comment})`); seen.set(r.t, r.comment); }
  let text;
  if (format === 'heidenhain') {
    const cols = ['T', 'NAME', 'L', 'R', 'R2', 'DL', 'DR', 'LCUTS', 'LU', 'RN', 'CUT', 'DOC'];
    const csv = v => (/[",]/.test(v) ? '"' + v.split('"').join('""') + '"' : v);
    text = [cols.join(','), ...rows.map(r => [r.t, csv(r.name), n3(r.l), n3(r.r), n3(r.r2), 0, 0, n3(r.lcuts), n3(Math.max(r.lu, r.lcuts)), n3(r.rn), r.cut, csv(r.comment.slice(0, 32))].join(','))].join('\r\n') + '\r\n';
  } else if (format === 'linuxcnc') {
    text = rows.map(r => `T${r.t} P${r.t} D${(2 * r.r).toFixed(3)} Z+${r.l.toFixed(3)} ;${r.comment.replace(/;/g, ',')}`).join('\n') + '\n';
  } else if (format === 'fanuc' || format === 'fanucA') {
    const c = format === 'fanuc', paren = s => s.toUpperCase().replace(/[()]/g, '');
    const lines = ['%', 'O9000 (WERKZEUGKORREKTUREN)', '(LAENGE UND RADIUS AUS WERKFAB - NENNWERTE, AN DER MASCHINE MESSEN)', 'G90'];
    for (const r of rows) {
      lines.push(`(T${r.t} ${paren(r.comment).slice(0, 40)})`);
      if (c) lines.push(`G10 L10 P${r.lenOffset} R${n3(r.l)}`, `G10 L11 P${r.lenOffset} R0`, `G10 L12 P${r.t} R${n3(r.r)}`, `G10 L13 P${r.t} R0`);
      else lines.push(`G10 L11 P${r.lenOffset} R${n3(r.l)}`);
    }
    if (!c) warnings.push('Speicher A hat nur einen Korrekturwert je Nummer: Radien nicht ausgegeben');
    lines.push('M30', '%');
    text = lines.join('\n') + '\n';
  } else if (format === 'sinumerik') {
    const lines = ['; WERKZEUGKORREKTUREN AUS WERKFAB - NENNWERTE, AN DER MASCHINE MESSEN'];
    for (const r of rows) {
      if (r.t < 1) continue;
      lines.push(`; T${r.t} ${r.comment}`, `$TC_DP1[${r.t},1]=${r.probe ? 710 : r.type === 'drill' || r.type === 'center' || r.type === 'spot' ? 200 : r.type === 'tap' ? 240 : r.type === 'ball' ? 110 : 120}`, `$TC_DP3[${r.t},1]=${n3(r.l)}`, `$TC_DP6[${r.t},1]=${n3(r.r)}`, `$TC_DP7[${r.t},1]=${n3(r.r2)}`);
    }
    lines.push('M30');
    warnings.push('Sinumerik: $TC_DP legt die Korrekturen nur ohne Werkzeugverwaltung direkt an – mit Magazinverwaltung die Werkzeuge über die Bedienoberfläche anlegen');
    text = lines.join('\n') + '\n';
  } else throw new Error('Unbekanntes Format: ' + format);
  if (!rows.length) warnings.push('Keine Werkzeuge für die Maschinentabelle');
  return { text, rows, warnings, ext: TOOL_TABLE_FORMATS[format].ext };
}
