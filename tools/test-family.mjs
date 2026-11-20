// Tests for part families from a table (node tools/test-family.mjs)
import { parseCSV, csvToConfigs, configsToCSV, variantFile, normValue } from '../js/family.js';
const ok = (n, c, x = '') => { console.log((c ? 'OK   ' : 'FEHL ') + n + '  ' + x); if (!c) process.exitCode = 1; };
const P = [{ name: 'laenge' }, { name: 'breite' }, { name: 'd' }];

{
  const r = parseCSV('a;b;c\r\n1;"x;y";"sagt ""hallo"""\r\n');
  ok('CSV mit ; und Anführungszeichen', r.sep === ';' && r.rows[1][1] === 'x;y' && r.rows[1][2] === 'sagt "hallo"', JSON.stringify(r.rows));
  ok('CSV mit Komma als Trenner', parseCSV('a,b\n1,2\n').sep === ',');
  ok('CSV mit Tabulator', parseCSV('a\tb\n1\t2').rows[1][1] === '2');
  ok('Zeilenumbruch in Anführungszeichen', parseCSV('a;b\n"x\ny";2').rows[1][0] === 'x\ny');
}
ok('Dezimalkomma wird Punkt, Formeln bleiben', normValue('12,5') === '12.5' && normValue('laenge/2') === 'laenge/2' && normValue('=laenge/2') === 'laenge/2' && normValue('3 mm') === '3 mm');
{
  const r = csvToConfigs('﻿Name;Länge;Breite;d;Farbe\nkurz;20;10,5;4;rot\nlang;80;;=laenge/10;blau\n;5;5;5;\n', [{ name: 'Länge' }, { name: 'Breite' }, { name: 'd' }]);
  ok('Tabelle → Konfigurationen', r.configs.length === 3 && r.configs[0].name === 'kurz' && r.configs[0].values['Breite'] === '10.5', JSON.stringify(r.configs[0]));
  ok('Leere Zellen bleiben weg', !('Breite' in r.configs[1].values) && r.configs[1].values.d === 'laenge/10');
  ok('Name fehlt → „Variante n“', r.configs[2].name === 'Variante 3');
  ok('Unbekannte Spalten werden gemeldet', r.unknown.join() === 'Farbe');
}
{
  const r = csvToConfigs('Konfiguration;LAENGE;breite\nA;1;2\nA;3;4', P);
  ok('Spaltennamen ohne Groß/klein, doppelte Namen getrennt', r.configs[0].values.laenge === '1' && r.configs[1].name === 'A (2)' && r.missing.join() === 'd');
}
{
  let err = '';
  try { csvToConfigs('x;y\n1;2', P); } catch (e) { err = e.message; }
  ok('Keine passende Spalte → Fehler', /Keine Spalte/.test(err), err);
}
{
  const cfg = [{ name: 'M6; kurz', values: { laenge: '20', breite: '10', d: '6' } }, { name: 'lang', values: { laenge: '80' } }];
  const csv = configsToCSV(P, cfg), back = csvToConfigs(csv, P);
  ok('Schreiben und wieder lesen', JSON.stringify(back.configs) === JSON.stringify(cfg), csv.replace(/\r\n/g, ' | '));
}
ok('Dateiname je Variante', variantFile('Platte', 'M6 / lang') === 'Platte_M6_lang', variantFile('Platte', 'M6 / lang'));
