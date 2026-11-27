// Post-processors as editable templates.
//
// Every post (built-in or user-made) is a plain definition object: number
// format, comment style, line numbering and text templates for each event
// (program start, tool change, rapid, linear, arcs, drill cycle, ...).
// Template syntax:
//   {X} {Y} {Z} {F} {I} {J}  address words ("X12.5"); X/Y/Z/F only when changed (modal)
//   {X!} {Y!} {Z!}            address word, always written
//   {x} {cx} {safe} ...       bare formatted values (see VARIABLES)
//   lines starting with "#"   become comments in the post's comment format
//   lines starting with spaces are continuation lines (never numbered)
//   a line that is empty after substitution is dropped (literal empty lines are kept)
import { originOf, originLabel, orientationLabel, OP_TYPES, setupMatrix } from './cam.js';

export const VARIABLES = {
  'Programm': { project: 'Projektname', setup: 'Setup-Name', orientation: 'Ausrichtung des Setups', pgm: 'Programmname (Großbuchstaben, ohne Sonderzeichen)', prognum: 'Programmnummer', wcs: 'WKS-Versatz (G54 … G59)', wcsh: 'WKS-Nummer (Okuma G15 H…)', comment: 'Programmkommentar aus dem Setup', date: 'Datum/Uhrzeit', origin: 'Nullpunkt', machine: 'Maschine' },
  'Rohteil': { stockx: 'Länge X', stocky: 'Breite Y', stockz: 'Höhe Z', sminx: 'min X', sminy: 'min Y', sminz: 'min Z', smaxx: 'max X', smaxy: 'max Y', smaxz: 'max Z', safe: 'Sicherheitshöhe Z' },
  'Drehen': { safex: 'Rückzug X (Durchmesser)', safez: 'Rückzug Z', tt: 'Werkzeug+Korrektur (z. B. 0101)', tt6: 'Okuma: Korrektur+Werkzeug+Schneide (z. B. 010101)', maxrpm: 'Drehzahlbegrenzung G50 S (Maschine)', pitch: 'Gewindesteigung' },
  'Werkzeug': { t: 'Nummer', toolname: 'Bezeichnung', tooldia: 'Durchmesser', zmin: 'Werkzeugliste: tiefstes Z des Werkzeugs (Programmkoordinaten)', rpm: 'Drehzahl', coolanton: 'Kühlmittel-ein-Vorlage (wenn aktiv)', coolantoff: 'Kühlmittel-aus-Vorlage (wenn aktiv)' },
  'Operation': { opname: 'Name', optype: 'Strategie' },
  'Bewegung': { x: 'X-Wert', y: 'Y-Wert', z: 'Z-Wert', f: 'Vorschub', cx: 'Kreismittelpunkt X (absolut)', cy: 'Kreismittelpunkt Y (absolut)', i: 'I (relativ)', j: 'J (relativ)', ipa: 'Schraubenlinie: Winkel inkremental (°, + = gegen Uhrzeigersinn)', iz: 'Schraubenlinie: Z inkremental' },
  'Bohrzyklus': {
    ztop: 'Oberfläche Z', zbottom: 'Bohrgrund Z', rplane: 'Rückzugsebene R (Z)', depth: 'Tiefe (negativ)', peck: 'Zustelltiefe', zfirst: 'erste Bohrtiefe Z',
    dwell: 'Verweilzeit s', dwellms: 'Verweilzeit ms', pitch: 'Steigung', pitchsigned: 'Steigung (negativ = links)', f: 'Vorschub', dfeed: 'Vorschub',
    sdis: 'Sicherheitsabstand', q200: 'Sicherheitsabstand', q204: '2. Sicherheitsabstand', vari: '1 = Rückzug, 0 = Spanbruch',
  },
};

export const SECTIONS = [
  ['header', 'Programmanfang'], ['footer', 'Programmende'],
  ['toolListHead', 'Werkzeugliste: Überschrift'], ['toolListLine', 'Werkzeugliste: Zeile je Werkzeug ({zmin} = tiefstes Z)'],
  ['opStart', 'Operationsbeginn'], ['toolChangeFirst', 'Erster Werkzeugaufruf'], ['toolChange', 'Werkzeugwechsel'],
  ['spindleOn', 'Spindel ein / Drehzahl'], ['coolantOn', 'Kühlmittel ein'], ['coolantOff', 'Kühlmittel aus'],
  ['rapid', 'Eilgang'], ['linear', 'Linear'], ['arcCW', 'Kreisbogen im Uhrzeigersinn'], ['arcCCW', 'Kreisbogen gegen Uhrzeigersinn'],
  ['helixCW', 'Schraubenlinie im Uhrzeigersinn (leer = Kreisbogen mit Z)'], ['helixCCW', 'Schraubenlinie gegen Uhrzeigersinn (leer = Kreisbogen mit Z)'],
  ['cyclePocketRect', 'Zyklus Rechtecktasche'], ['cyclePocketCirc', 'Zyklus Kreistasche'], ['cyclePocketSlot', 'Zyklus Nut / Langloch (leer = Rechtecktasche)'],
  ['cycleStudRect', 'Zyklus Rechteckzapfen'], ['cycleStudCirc', 'Zyklus Kreiszapfen'],
  ['cycleBoreMill', 'Zyklus Bohrfräsen'], ['cycleThreadMill', 'Zyklus Gewindefräsen'], ['cycleFace', 'Zyklus Planfräsen'],
  ['cycleContourList', 'SL: Konturen ({labels} = Unterprogramme)'], ['cycleContourTrain', 'Zyklus Konturzug (Kontur im Unterprogramm)'], ['cycleSLData', 'SL: Konturdaten'], ['cycleSLClear', 'SL: Räumen (Tasche mit Inseln)'],
  ['approach', 'Anfahren an die Kontur (Radiuskorrektur an der Steuerung)'], ['depart', 'Abfahren von der Kontur'],
  ['dwell', 'Verweilzeit'],
  ['cycleDrill', 'Zyklus Bohren'], ['cycleDwell', 'Zyklus Bohren mit Verweilzeit'], ['cyclePeck', 'Zyklus Tieflochbohren'], ['cycleChip', 'Zyklus Spanbruch'],
  ['cycleTap', 'Zyklus Gewindebohren rechts'], ['cycleTapLeft', 'Zyklus Gewindebohren links'], ['cycleReam', 'Zyklus Reiben'], ['cycleBore', 'Zyklus Ausdrehen'],
  ['cyclePoint', 'Zyklus: weitere Bohrposition'], ['cyclePatternCircle', 'Bohrbild Lochkreis (statt einzelner Positionen)'], ['cyclePatternGrid', 'Bohrbild Raster / Lochreihe'], ['cycleEnd', 'Zyklus beenden'],
  ['threadMove', 'Drehen: Gewindeschnitt'],
  ['cycleTurnRough', 'Drehen: Schruppzyklus ({contour} = Konturzeilen)'], ['cycleTurnFinish', 'Drehen: Schlichtzyklus (Kontur des Schruppzyklus)'], ['contourFirst', 'Drehen: Vorsatz erste Konturzeile'], ['contourLast', 'Drehen: Vorsatz letzte Konturzeile'],
  ['cycleTurnThread', 'Drehen: Gewindezyklus'],
  ['liveOn', 'Drehen: C-Achse und angetriebenes Werkzeug ein'], ['liveOff', 'Drehen: angetriebenes Werkzeug und C-Achse aus'],
  ['polarOn', 'Drehen: Polar-Interpolation ein (X Durchmesser, C in mm; leer = X/C in Grad)'], ['polarOff', 'Drehen: Polar-Interpolation aus'],
  ['cylOn', 'Drehen: Zylinder-Interpolation ein ({cylr} = Radius; leer = Z/C ohne)'], ['cylOff', 'Drehen: Zylinder-Interpolation aus'],
  ['yOn', 'Drehen: Y-Achse ein (Ebene X/Y; hier auch die C-Klemmung der Maschine eintragen)'], ['yOff', 'Drehen: Y-Achse aus'],
  ['probeZ', 'Antasten: Z-Fläche'], ['probeBore', 'Antasten: Bohrung'], ['probeBoss', 'Antasten: Zapfen'], ['probeRectOut', 'Antasten: Rechteck außen'], ['probeRectIn', 'Antasten: Rechtecktasche innen'],
];
export const CYCLE_KEYS = { drill: 'cycleDrill', dwell: 'cycleDwell', peck: 'cyclePeck', chip: 'cycleChip', tap: 'cycleTap', tapLeft: 'cycleTapLeft', ream: 'cycleReam', bore: 'cycleBore' };

// tool list at the program start (post property "Werkzeugliste ausgeben"); {zmin} = deepest Z of the tool
const TOOL_LIST = { toolListHead: '# Werkzeuge:', toolListLine: '# T{t} D{tooldia} {toolname} Zmin {zmin}' };
const GCODE_MOTION = {
  rapid: 'G0{X}{Y}{Z}', linear: 'G1{X}{Y}{Z}{F}', arcCW: 'G2{X!}{Y!}{Z}{I}{J}{F}', arcCCW: 'G3{X!}{Y!}{Z}{I}{J}{F}',
};
const GCODE_BASE = {
  decimals: 3, trimZeros: true, signed: false, modalCodes: true, feedAfterRapid: false, separator: ' ',
  comment: '({text})', asciiComments: true, arcs: true, useDrillCycle: false,
  lineNumbers: { enabled: false, start: 10, step: 10, prefix: 'N', comments: false },
  opStart: '\n# {opname} - {optype}', spindleOn: 'S{rpm} M3', coolantOn: 'M8', coolantOff: 'M9', ...TOOL_LIST,
  dwell: 'G4 P{dwell}', cycleFirstInDef: true, cyclePoint: '{X}{Y}', cycleEnd: 'G80', ...GCODE_MOTION,
};
// ISO canned cycles (Fanuc style); the first hole is part of the cycle block
const G8X = {
  useDrillCycle: true,
  cycleDrill: 'G98 G81{X!}{Y!} Z{zbottom} R{rplane} F{f}',
  cycleDwell: 'G98 G82{X!}{Y!} Z{zbottom} R{rplane} P{dwellms} F{f}',
  cyclePeck: 'G98 G83{X!}{Y!} Z{zbottom} R{rplane} Q{peck} F{f}',
  cycleChip: 'G98 G73{X!}{Y!} Z{zbottom} R{rplane} Q{peck} F{f}',
  cycleTap: 'G98 G84{X!}{Y!} Z{zbottom} R{rplane} F{f}',
  cycleTapLeft: 'G98 G74{X!}{Y!} Z{zbottom} R{rplane} F{f}',
  cycleReam: 'G98 G85{X!}{Y!} Z{zbottom} R{rplane} F{f}',
  cycleBore: 'G98 G86{X!}{Y!} Z{zbottom} R{rplane} F{f}',
};
const HEADER_INFO = '# WerkFab - {project}\n# Erstellt {date}\n# Rohteil X{stockx} Y{stocky} Z{stockz}\n# {setup}: {orientation}, Nullpunkt {origin}{comment}';

const CYCL200 = 'CYCL DEF 200 BOHREN ~\n  Q200={q200} ;SICHERHEITS-ABST. ~\n  Q201={depth} ;TIEFE ~\n  Q206={dfeed} ;VORSCHUB TIEFENZ. ~\n  Q202={peck} ;ZUSTELL-TIEFE ~\n  Q210=+0 ;VERWEILZEIT OBEN ~\n  Q203={dtop} ;KOOR. OBERFLAECHE ~\n  Q204={q204} ;2. SICHERHEITS-ABST. ~\n  Q211={dwell} ;VERWEILZEIT UNTEN';
const CYCL207 = 'CYCL DEF 207 GEWINDEBOHREN GS ~\n  Q200={q200} ;SICHERHEITS-ABST. ~\n  Q201={depth} ;TIEFE GEWINDE ~\n  Q239={pitchsigned} ;GEWINDESTEIGUNG ~\n  Q203={dtop} ;KOOR. OBERFLAECHE ~\n  Q204={q204} ;2. SICHERHEITS-ABST.';

export const BUILTIN_POSTS = [
  {
    ...GCODE_BASE, family: 'grbl', id: 'grbl', name: 'GRBL (Hobby-CNC)', ext: 'nc', builtin: true,
    header: `${HEADER_INFO}\nG90 G94 G17\nG21\nG0 Z{safe}`,
    toolChangeFirst: '# T{t} {toolname} D{tooldia}',
    toolChange: 'M5\n# T{t} {toolname} D{tooldia}\nG0 Z{safe}\n# WERKZEUG WECHSELN, dann fortsetzen\nM0',
    footer: '\nG0 Z{safe}\n{coolantoff}\nM5\nM30',
  },
  {
    ...GCODE_BASE, ...G8X, family: 'linuxcnc', id: 'linuxcnc', name: 'LinuxCNC', ext: 'ngc', builtin: true,
    // LinuxCNC has no G84/G74 (rigid tapping is G33.1) -> tapping is written out
    cycleTap: '', cycleTapLeft: '',
    // start: up in machine coordinates (no tool length offset is active yet, so no height above the part)
    header: `${HEADER_INFO}\nG90 G94 G17\nG21\nG54\nG53 G0 Z0`,
    toolChangeFirst: '# T{t} {toolname} D{tooldia}\nT{t} M6\nG43 H{t}',
    toolChange: 'M5\n# T{t} {toolname} D{tooldia}\nT{t} M6\nG43 H{t}',
    footer: '\nG0 Z{safe}\n{coolantoff}\nM5\nM30',
  },
  {
    ...GCODE_BASE, ...G8X, family: 'fanuc', id: 'fanuc', name: 'Fanuc / ISO generisch', ext: 'nc', builtin: true, dwell: 'G4 X{dwell}', decimalPoint: true,
    // Renishaw Inspection Plus macros (protected move P9810, then the measuring cycle)
    probeZ: 'G0 X{cx} Y{cy}\nG0 Z{zsafe}\nG65 P9810 Z{zabove} F{pfeed}\nG65 P9811 Z{z} S{wcsn}\nG65 P9810 Z{zsafe} F{pfeed}',
    probeBore: 'G0 X{cx} Y{cy}\nG0 Z{zsafe}\nG65 P9810 Z{zmeas} F{pfeed}\nG65 P9814 D{dia} S{wcsn}\nG65 P9810 Z{zsafe} F{pfeed}',
    probeBoss: 'G0 X{cx} Y{cy}\nG0 Z{zsafe}\nG65 P9810 Z{zabove} F{pfeed}\nG65 P9814 D{dia} Z{zmeas} S{wcsn}\nG65 P9810 Z{zsafe} F{pfeed}',
    probeRectOut: 'G0 X{cx} Y{cy}\nG0 Z{zsafe}\nG65 P9810 Z{zabove} F{pfeed}\nG65 P9812 X{w} Z{zmeas} S{wcsn}\nG65 P9812 Y{l} Z{zmeas} S{wcsn}\nG65 P9810 Z{zsafe} F{pfeed}',
    probeRectIn: 'G0 X{cx} Y{cy}\nG0 Z{zsafe}\nG65 P9810 Z{zmeas} F{pfeed}\nG65 P9812 X{w} S{wcsn}\nG65 P9812 Y{l} S{wcsn}\nG65 P9810 Z{zsafe} F{pfeed}',
    // start and tool change: Z to the reference point first (no tool length offset is active at the start)
    header: `%\nO1000\n${HEADER_INFO}\nG90 G94 G17\nG21\nG54\nG91 G28 Z0\nG90`,
    // tool length offset with the first move in Z (without it the control positions the spindle nose)
    toolChangeFirst: '# T{t} {toolname} D{tooldia}\nT{t} M6\nG0 G43 Z{safe} H{t}',
    toolChange: 'M5\nG91 G28 Z0\nG90\n# T{t} {toolname} D{tooldia}\nT{t} M6\nG0 G43 Z{safe} H{t}',
    footer: '\nG0 Z{safe}\n{coolantoff}\nM5\nM30\n%',
  },
  {
    // Okuma OSP-M (machining centres): work offset G15 H…, tool length G56 H…, fixed cycles G81–G86 with R point,
    // decimal point always, program end M02
    ...GCODE_BASE, ...G8X, family: 'fanuc', id: 'okuma-mill', name: 'Okuma OSP-M Fräsen', ext: 'min', builtin: true, decimalPoint: true,
    dwell: 'G4 F{dwell}',
    cycleDrill: 'G81{X!}{Y!} Z{zbottom} R{rplane} F{f}', cycleDwell: '',
    cyclePeck: 'G83{X!}{Y!} Z{zbottom} R{rplane} Q{peck} F{f}', cycleChip: 'G73{X!}{Y!} Z{zbottom} R{rplane} Q{peck} F{f}',
    cycleTap: 'G84{X!}{Y!} Z{zbottom} R{rplane} F{f}', cycleTapLeft: 'G74{X!}{Y!} Z{zbottom} R{rplane} F{f}',
    cycleReam: 'G85{X!}{Y!} Z{zbottom} R{rplane} F{f}', cycleBore: 'G86{X!}{Y!} Z{zbottom} R{rplane} F{f}',
    header: `O{prognum}\n${HEADER_INFO}\nG15 H{wcsh}\nG17 G40 G80 G90 G94`,
    toolChangeFirst: '# T{t} {toolname} D{tooldia}\nT{t} M6\nG56 H{t}',
    toolChange: 'M5\n# T{t} {toolname} D{tooldia}\nT{t} M6\nG56 H{t}',
    footer: '\nG0 Z{safe}\n{coolantoff}\nM5\nM2',
  },
  {
    ...GCODE_BASE, family: 'sinumerik', id: 'sinumerik', name: 'Siemens Sinumerik 840D', ext: 'mpf', builtin: true, comment: '; {text}',
    // modal cycle call: MCALL CYCLE8x(...), then one positioning block per hole, MCALL ends it
    useDrillCycle: true, cycleFirstInDef: false, cyclePoint: 'G0{X!}{Y!}', cycleEnd: 'MCALL', dwell: 'G4 F{dwell}',
    cycleDrill: 'F{f}\nMCALL CYCLE81({safe},{ztop},{sdis},{zbottom})',
    cycleDwell: 'F{f}\nMCALL CYCLE82({safe},{ztop},{sdis},{zbottom},,{dwell})',
    cyclePeck: 'F{f}\nMCALL CYCLE83({safe},{ztop},{sdis},{zbottom},,{zfirst},,{peck},0,0,1,1)',
    cycleChip: 'F{f}\nMCALL CYCLE83({safe},{ztop},{sdis},{zbottom},,{zfirst},,{peck},0,0,1,0)',
    cycleTap: 'MCALL CYCLE84({safe},{ztop},{sdis},{zbottom},,0,3,,{pitch},0,{rpm},{rpm})',
    cycleTapLeft: 'MCALL CYCLE84({safe},{ztop},{sdis},{zbottom},,0,4,,{pitchsigned},0,{rpm},{rpm})',
    cycleReam: 'MCALL CYCLE85({safe},{ztop},{sdis},{zbottom},,0,{f},{f})',
    cycleBore: '',
    // pockets as standard cycles (operation option "Steuerungszyklus"); the call carries the centre
    cyclePocketRect: 'POCKET3({safe},{ztop},{sdis},{zbottom},{plen1},{plen2},{pcrs},{px},{py},{pangs},{stepdown},{stl},0,{pfeed},{dfeed},{cdir},{vari},{mida},0,0,0,{rad1},{dp1})',
    cyclePatternCircle: 'HOLES2({pcx},{pcy},{prad},{pa0},{pastep},{pn})',
    cyclePatternGrid: 'CYCLE801({gx},{gy},{gang},{gd1},{gd2},{gnc},{gnr})',
    cycleStudRect: 'CYCLE76({safe},{ztop},{sdis},{zbottom},,{plen1},{plen2},{pcr},{px},{py},{pangs},{stepdown},{stl},0,{pfeed},{dfeed},{cdir},1,{blank1},{blank2})',
    cycleStudCirc: 'CYCLE77({safe},{ztop},{sdis},{zbottom},,{prad},{px},{py},{stepdown},{stl},0,{pfeed},{dfeed},{cdir},1,{pblank})',
    cyclePocketCirc: 'POCKET4({safe},{ztop},{sdis},{zbottom},{prad},{px},{py},{stepdown},{stl},0,{pfeed},{dfeed},{cdir},{vari},{mida},0,0,{rad1},{dp1})',
    header: `${HEADER_INFO}\nG17 G90 G94 G71\nG54\nG0 SUPA Z0 D0`,
    toolChangeFirst: '# T{t} {toolname} D{tooldia}\nT{t} D1\nM6',
    toolChange: 'M5\n# T{t} {toolname} D{tooldia}\nT{t} D1\nM6',
    footer: '\nG0 Z{safe}\n{coolantoff}\nM5\nM30',
  },
  {
    family: 'heidenhain', id: 'heidenhain', name: 'Heidenhain iTNC 530 (Klartext)', ext: 'h', builtin: true,
    probeZ: 'TCH PROBE 417 BZPKT TS.-ACHSE ~\n  Q263={cx} ;1. PUNKT 1. ACHSE ~\n  Q264={cy} ;1. PUNKT 2. ACHSE ~\n  Q294={z} ;1. PUNKT 3. ACHSE ~\n  Q320={sdist} ;SICHERHEITS-ABST. ~\n  Q260={zsafe} ;SICHERE HOEHE ~\n  Q305={preset} ;NR. IN TABELLE ~\n  Q333={z} ;BEZUGSPUNKT ~\n  Q303={transfer} ;MESSWERT-UEBERGABE',
    probeBore: 'TCH PROBE 412 BZPKT KREIS INNEN ~\n  Q321={cx} ;MITTE 1. ACHSE ~\n  Q322={cy} ;MITTE 2. ACHSE ~\n  Q262={dia} ;SOLL-DURCHMESSER ~\n  Q325=+0 ;STARTWINKEL ~\n  Q247=+90 ;WINKELSCHRITT ~\n  Q261={zmeas} ;MESSHOEHE ~\n  Q320={sdist} ;SICHERHEITS-ABST. ~\n  Q260={zsafe} ;SICHERE HOEHE ~\n  Q301=+1 ;FAHREN AUF S. HOEHE ~\n  Q305={preset} ;NR. IN TABELLE ~\n  Q331={cx} ;BEZUGSPUNKT ~\n  Q332={cy} ;BEZUGSPUNKT ~\n  Q303={transfer} ;MESSWERT-UEBERGABE ~\n  Q381=+0 ;ANTASTEN TS-ACHSE ~\n  Q382=+0 ;1. KO. FUER TS-ACHSE ~\n  Q383=+0 ;2. KO. FUER TS-ACHSE ~\n  Q384=+0 ;3. KO. FUER TS-ACHSE ~\n  Q333=+0 ;BEZUGSPUNKT ~\n  Q423=+4 ;ANZAHL MESSPUNKTE ~\n  Q365=+1 ;VERFAHRART',
    probeBoss: 'TCH PROBE 413 BZPKT KREIS AUSSEN ~\n  Q321={cx} ;MITTE 1. ACHSE ~\n  Q322={cy} ;MITTE 2. ACHSE ~\n  Q262={dia} ;SOLL-DURCHMESSER ~\n  Q325=+0 ;STARTWINKEL ~\n  Q247=+90 ;WINKELSCHRITT ~\n  Q261={zmeas} ;MESSHOEHE ~\n  Q320={sdist} ;SICHERHEITS-ABST. ~\n  Q260={zsafe} ;SICHERE HOEHE ~\n  Q301=+1 ;FAHREN AUF S. HOEHE ~\n  Q305={preset} ;NR. IN TABELLE ~\n  Q331={cx} ;BEZUGSPUNKT ~\n  Q332={cy} ;BEZUGSPUNKT ~\n  Q303={transfer} ;MESSWERT-UEBERGABE ~\n  Q381=+0 ;ANTASTEN TS-ACHSE ~\n  Q382=+0 ;1. KO. FUER TS-ACHSE ~\n  Q383=+0 ;2. KO. FUER TS-ACHSE ~\n  Q384=+0 ;3. KO. FUER TS-ACHSE ~\n  Q333=+0 ;BEZUGSPUNKT ~\n  Q423=+4 ;ANZAHL MESSPUNKTE ~\n  Q365=+1 ;VERFAHRART',
    probeRectOut: 'TCH PROBE 411 BZPKT RECHT. AUS. ~\n  Q321={cx} ;MITTE 1. ACHSE ~\n  Q322={cy} ;MITTE 2. ACHSE ~\n  Q323={w} ;1. SEITEN-LAENGE ~\n  Q324={l} ;2. SEITEN-LAENGE ~\n  Q261={zmeas} ;MESSHOEHE ~\n  Q320={sdist} ;SICHERHEITS-ABST. ~\n  Q260={zsafe} ;SICHERE HOEHE ~\n  Q301=+1 ;FAHREN AUF S. HOEHE ~\n  Q305={preset} ;NR. IN TABELLE ~\n  Q331={cx} ;BEZUGSPUNKT ~\n  Q332={cy} ;BEZUGSPUNKT ~\n  Q303={transfer} ;MESSWERT-UEBERGABE ~\n  Q381=+0 ;ANTASTEN TS-ACHSE ~\n  Q382=+0 ;1. KO. FUER TS-ACHSE ~\n  Q383=+0 ;2. KO. FUER TS-ACHSE ~\n  Q384=+0 ;3. KO. FUER TS-ACHSE ~\n  Q333=+0 ;BEZUGSPUNKT',
    probeRectIn: 'TCH PROBE 410 BZPKT RECHT. INNEN ~\n  Q321={cx} ;MITTE 1. ACHSE ~\n  Q322={cy} ;MITTE 2. ACHSE ~\n  Q323={w} ;1. SEITEN-LAENGE ~\n  Q324={l} ;2. SEITEN-LAENGE ~\n  Q261={zmeas} ;MESSHOEHE ~\n  Q320={sdist} ;SICHERHEITS-ABST. ~\n  Q260={zsafe} ;SICHERE HOEHE ~\n  Q301=+1 ;FAHREN AUF S. HOEHE ~\n  Q305={preset} ;NR. IN TABELLE ~\n  Q331={cx} ;BEZUGSPUNKT ~\n  Q332={cy} ;BEZUGSPUNKT ~\n  Q303={transfer} ;MESSWERT-UEBERGABE ~\n  Q381=+0 ;ANTASTEN TS-ACHSE ~\n  Q382=+0 ;1. KO. FUER TS-ACHSE ~\n  Q383=+0 ;2. KO. FUER TS-ACHSE ~\n  Q384=+0 ;3. KO. FUER TS-ACHSE ~\n  Q333=+0 ;BEZUGSPUNKT',
    decimals: 3, trimZeros: false, signed: true, modalCodes: false, feedAfterRapid: true, separator: ' ',
    comment: '; {text}', asciiComments: true, arcs: true, useDrillCycle: true, resetModalPerOp: true, coolantPerOp: false,
    lineNumbers: { enabled: true, start: 0, step: 1, prefix: '', comments: true },
    header: 'BEGIN PGM {pgm} MM\nBLK FORM 0.1 Z X{sminx} Y{sminy} Z{sminz}\nBLK FORM 0.2 X{smaxx} Y{smaxy} Z{smaxz}\n# WerkFab - {project}\n# {setup}: {orientation}, Nullpunkt {origin}{comment}',
    opStart: '# {opname} - {optype}', ...TOOL_LIST,
    toolChangeFirst: '# T{t} {toolname} D{tooldia}\nTOOL CALL {t} Z S{rpm}\nL Z{safe} R0 FMAX M3',
    toolChange: 'L Z{safe} R0 FMAX M5\n# T{t} {toolname} D{tooldia}\nTOOL CALL {t} Z S{rpm}\nL Z{safe} R0 FMAX M3',
    spindleOn: '', coolantOn: 'M8', coolantOff: 'M9',
    rapid: 'L{X}{Y}{Z} R0 FMAX', linear: 'L{X}{Y}{Z} R0{F}',
    dwell: 'CYCL DEF 9.0 VERWEILZEIT\nCYCL DEF 9.1 V.ZEIT {dwell}',
    cycleFirstInDef: false, cyclePoint: 'L{X!}{Y!} R0 FMAX M99', cycleEnd: '',
    arcCW: 'CC X{cx} Y{cy}\nC{X!}{Y!} DR- R0{F}', arcCCW: 'CC X{cx} Y{cy}\nC{X!}{Y!} DR+ R0{F}',
    // helix (Z changes along the arc): polar arc, incremental angle and Z
    helixCW: 'CC X{cx} Y{cy}\nCP IPA{ipa} IZ{iz} DR- R0{F}', helixCCW: 'CC X{cx} Y{cy}\nCP IPA{ipa} IZ{iz} DR+ R0{F}',
    // contour with compensation at the control: the control's own approach / departure (LN, LT, CT, LCT)
    approach: 'APPR {appr} {rc}{F}', depart: 'DEP {dep}{F}',
    // pockets as the control's cycles (operation option "Steuerungszyklus"), called at the centre with M99
    cyclePocketRect: 'CYCL DEF 251 RECHTECKTASCHE ~\n  Q215=1 ;BEARBEITUNGS-UMFANG ~\n  Q218={plen1} ;1. SEITEN-LAENGE ~\n  Q219={plen2} ;2. SEITEN-LAENGE ~\n  Q220={pcr} ;ECKENRADIUS ~\n  Q368={stl} ;AUFMASS SEITE ~\n  Q224={pang} ;DREHLAGE ~\n  Q367=+0 ;TASCHENLAGE ~\n  Q207={pfeed} ;VORSCHUB FRAESEN ~\n  Q351={climb} ;FRAESART ~\n  Q201={depth} ;TIEFE ~\n  Q202={stepdown} ;ZUSTELL-TIEFE ~\n  Q369=+0 ;AUFMASS TIEFE ~\n  Q206={dfeed} ;VORSCHUB TIEFENZ. ~\n  Q338=+0 ;ZUST. SCHLICHTEN ~\n  Q200={q200} ;SICHERHEITS-ABST. ~\n  Q203={dtop} ;KOOR. OBERFLAECHE ~\n  Q204={q204} ;2. SICHERHEITS-ABST. ~\n  Q370={overlap} ;BAHN-UEBERLAPPUNG ~\n  Q366={plungemode} ;EINTAUCHEN ~\n  Q385={pfeed} ;VORSCHUB SCHLICHTEN',
    cyclePatternCircle: 'CYCL DEF 220 MUSTER KREIS ~\n  Q216={pcx} ;MITTE 1. ACHSE ~\n  Q217={pcy} ;MITTE 2. ACHSE ~\n  Q244={pdia} ;TEILKREIS-DURCHM. ~\n  Q245={pa0} ;STARTWINKEL ~\n  Q246={pa1} ;ENDWINKEL ~\n  Q247=+0 ;WINKELSCHRITT ~\n  Q241={pn} ;ANZAHL BEARBEITUNGEN ~\n  Q200={q200} ;SICHERHEITS-ABST. ~\n  Q203={dtop} ;KOOR. OBERFLAECHE ~\n  Q204={q204} ;2. SICHERHEITS-ABST. ~\n  Q301=1 ;FAHREN AUF S. HOEHE ~\n  Q365=0 ;VERFAHRART',
    cyclePatternGrid: 'CYCL DEF 221 MUSTER LINIEN ~\n  Q225={gx} ;STARTPUNKT 1. ACHSE ~\n  Q226={gy} ;STARTPUNKT 2. ACHSE ~\n  Q237={gd1} ;ABSTAND 1. ACHSE ~\n  Q238={gd2} ;ABSTAND 2. ACHSE ~\n  Q242={gnc} ;ANZAHL SPALTEN ~\n  Q243={gnr} ;ANZAHL ZEILEN ~\n  Q224={gang} ;DREHLAGE ~\n  Q200={q200} ;SICHERHEITS-ABST. ~\n  Q203={dtop} ;KOOR. OBERFLAECHE ~\n  Q204={q204} ;2. SICHERHEITS-ABST. ~\n  Q301=1 ;FAHREN AUF S. HOEHE',
    cyclePocketSlot: 'CYCL DEF 253 NUTENFRAESEN ~\n  Q215=1 ;BEARBEITUNGS-UMFANG ~\n  Q218={plen1} ;NUTLAENGE ~\n  Q219={plen2} ;NUTBREITE ~\n  Q368={stl} ;AUFMASS SEITE ~\n  Q374={pang} ;DREHLAGE ~\n  Q367=+0 ;NUTLAGE ~\n  Q207={pfeed} ;VORSCHUB FRAESEN ~\n  Q351={climb} ;FRAESART ~\n  Q201={depth} ;TIEFE ~\n  Q202={stepdown} ;ZUSTELL-TIEFE ~\n  Q369=+0 ;AUFMASS TIEFE ~\n  Q206={dfeed} ;VORSCHUB TIEFENZ. ~\n  Q338=+0 ;ZUST. SCHLICHTEN ~\n  Q200={q200} ;SICHERHEITS-ABST. ~\n  Q203={dtop} ;KOOR. OBERFLAECHE ~\n  Q204={q204} ;2. SICHERHEITS-ABST. ~\n  Q366={slotplunge} ;EINTAUCHEN ~\n  Q385={pfeed} ;VORSCHUB SCHLICHTEN',
    cycleStudRect: 'CYCL DEF 256 RECHTECKZAPFEN ~\n  Q218={plen1} ;1. SEITEN-LAENGE ~\n  Q424={blank1} ;ROHTEILMASS 1 ~\n  Q219={plen2} ;2. SEITEN-LAENGE ~\n  Q425={blank2} ;ROHTEILMASS 2 ~\n  Q220={pcr} ;ECKENRADIUS ~\n  Q368={stl} ;AUFMASS SEITE ~\n  Q224={pang} ;DREHLAGE ~\n  Q367=+0 ;ZAPFENLAGE ~\n  Q207={pfeed} ;VORSCHUB FRAESEN ~\n  Q351={climb} ;FRAESART ~\n  Q201={depth} ;TIEFE ~\n  Q202={stepdown} ;ZUSTELL-TIEFE ~\n  Q206={dfeed} ;VORSCHUB TIEFENZ. ~\n  Q200={q200} ;SICHERHEITS-ABST. ~\n  Q203={dtop} ;KOOR. OBERFLAECHE ~\n  Q204={q204} ;2. SICHERHEITS-ABST. ~\n  Q370={overlap} ;BAHN-UEBERLAPPUNG',
    cycleStudCirc: 'CYCL DEF 257 KREISZAPFEN ~\n  Q223={pdia} ;FERTIGTEIL-DURCHM. ~\n  Q222={pblank} ;ROHTEIL-DURCHMESSER ~\n  Q368={stl} ;AUFMASS SEITE ~\n  Q207={pfeed} ;VORSCHUB FRAESEN ~\n  Q351={climb} ;FRAESART ~\n  Q201={depth} ;TIEFE ~\n  Q202={stepdown} ;ZUSTELL-TIEFE ~\n  Q206={dfeed} ;VORSCHUB TIEFENZ. ~\n  Q200={q200} ;SICHERHEITS-ABST. ~\n  Q203={dtop} ;KOOR. OBERFLAECHE ~\n  Q204={q204} ;2. SICHERHEITS-ABST. ~\n  Q370={overlap} ;BAHN-UEBERLAPPUNG',
    cycleContourList: 'CYCL DEF 14.0 KONTUR\nCYCL DEF 14.1 KONTURLABEL {labels}',
    cycleContourTrain: 'CYCL DEF 25 KONTUR-ZUG ~\n  Q1={depth} ;FRAESTIEFE ~\n  Q3={stl} ;AUFMASS SEITE ~\n  Q5={dtop} ;KOOR. OBERFLAECHE ~\n  Q7={zsafe} ;SICHERE HOEHE ~\n  Q10={plungedepth} ;ZUSTELL-TIEFE ~\n  Q11={dfeed} ;VORSCHUB TIEFENZ. ~\n  Q12={pfeed} ;VORSCHUB FRAESEN ~\n  Q15={climb} ;FRAESART\nCYCL CALL',
    cycleSLData: 'CYCL DEF 20 KONTUR-DATEN ~\n  Q1={depth} ;FRAESTIEFE ~\n  Q2={overlap} ;BAHN-UEBERLAPPUNG ~\n  Q3={stl} ;AUFMASS SEITE ~\n  Q4=+0 ;AUFMASS TIEFE ~\n  Q5={dtop} ;KOOR. OBERFLAECHE ~\n  Q6={q200} ;SICHERHEITS-ABST. ~\n  Q7={zsafe} ;SICHERE HOEHE ~\n  Q8=+0 ;RUNDUNGSRADIUS ~\n  Q9={climb} ;DREHSINN',
    cycleSLClear: 'CYCL DEF 22 RAEUMEN ~\n  Q10={plungedepth} ;ZUSTELL-TIEFE ~\n  Q11={dfeed} ;VORSCHUB TIEFENZ. ~\n  Q12={pfeed} ;VORSCHUB RAEUMEN ~\n  Q18=+0 ;VORRAEUM-WERKZEUG ~\n  Q19=+0 ;VORSCHUB PENDELN ~\n  Q208=99999 ;VORSCHUB RUECKZUG ~\n  Q401=100 ;VORSCHUBFAKTOR ~\n  Q404=+0 ;NACHRAEUMSTRATEGIE\nCYCL CALL',
    cycleBoreMill: 'CYCL DEF 208 BOHRFRAESEN ~\n  Q200={q200} ;SICHERHEITS-ABST. ~\n  Q201={depth} ;TIEFE ~\n  Q206={pfeed} ;VORSCHUB TIEFENZ. ~\n  Q334={pitch} ;ZUSTELLTIEFE ~\n  Q203={dtop} ;KOOR. OBERFLAECHE ~\n  Q204={q204} ;2. SICHERHEITS-ABST. ~\n  Q335={hdia} ;SOLL-DURCHMESSER ~\n  Q342=+0 ;VORGEB. DURCHMESSER ~\n  Q351={climb} ;FRAESART',
    cycleThreadMill: 'CYCL DEF 262 GEWINDEFRAESEN ~\n  Q335={hdia} ;SOLL-DURCHMESSER ~\n  Q239={pitchsigned} ;STEIGUNG ~\n  Q201={depth} ;GEWINDETIEFE ~\n  Q355=+1 ;NACHSETZEN ~\n  Q253=750 ;VORSCHUB VORPOS. ~\n  Q351={climb} ;FRAESART ~\n  Q200={q200} ;SICHERHEITS-ABST. ~\n  Q203={dtop} ;KOOR. OBERFLAECHE ~\n  Q204={q204} ;2. SICHERHEITS-ABST. ~\n  Q207={pfeed} ;VORSCHUB FRAESEN',
    cycleFace: 'CYCL DEF 232 PLANFRAESEN ~\n  Q389=+0 ;STRATEGIE ~\n  Q225={fx} ;STARTPUNKT 1. ACHSE ~\n  Q226={fy} ;STARTPUNKT 2. ACHSE ~\n  Q227={fstart} ;STARTPUNKT 3. ACHSE ~\n  Q386={fend} ;ENDPUNKT 3. ACHSE ~\n  Q218={flen} ;1. SEITEN-LAENGE ~\n  Q219={fwid} ;2. SEITEN-LAENGE ~\n  Q202={stepdown} ;MAX. ZUSTELL-TIEFE ~\n  Q369=+0 ;AUFMASS TIEFE ~\n  Q370={overlap} ;MAX. UEBERLAPPUNG ~\n  Q207={pfeed} ;VORSCHUB FRAESEN ~\n  Q385={pfeed} ;VORSCHUB SCHLICHTEN ~\n  Q253=750 ;VORSCHUB VORPOS. ~\n  Q200={q200} ;SICHERHEITS-ABST. ~\n  Q357=+2 ;SI.-ABSTAND SEITE ~\n  Q204={q204} ;2. SICHERHEITS-ABST.\nCYCL CALL',
    cyclePocketCirc: 'CYCL DEF 252 KREISTASCHE ~\n  Q215=1 ;BEARBEITUNGS-UMFANG ~\n  Q223={pdia} ;KREISDURCHMESSER ~\n  Q368={stl} ;AUFMASS SEITE ~\n  Q207={pfeed} ;VORSCHUB FRAESEN ~\n  Q351={climb} ;FRAESART ~\n  Q201={depth} ;TIEFE ~\n  Q202={stepdown} ;ZUSTELL-TIEFE ~\n  Q369=+0 ;AUFMASS TIEFE ~\n  Q206={dfeed} ;VORSCHUB TIEFENZ. ~\n  Q338=+0 ;ZUST. SCHLICHTEN ~\n  Q200={q200} ;SICHERHEITS-ABST. ~\n  Q203={dtop} ;KOOR. OBERFLAECHE ~\n  Q204={q204} ;2. SICHERHEITS-ABST. ~\n  Q370={overlap} ;BAHN-UEBERLAPPUNG ~\n  Q366={plungemode} ;EINTAUCHEN ~\n  Q385={pfeed} ;VORSCHUB SCHLICHTEN',
    cycleDrill: CYCL200, cycleDwell: CYCL200, cyclePeck: CYCL200,
    cycleChip: 'CYCL DEF 203 UNIVERSAL-BOHREN ~\n  Q200={q200} ;SICHERHEITS-ABST. ~\n  Q201={depth} ;TIEFE ~\n  Q206={dfeed} ;VORSCHUB TIEFENZ. ~\n  Q202={peck} ;ZUSTELL-TIEFE ~\n  Q210=+0 ;VERWEILZEIT OBEN ~\n  Q203={dtop} ;KOOR. OBERFLAECHE ~\n  Q204={q204} ;2. SICHERHEITS-ABST. ~\n  Q212=+0 ;ABNAHMEBETRAG ~\n  Q213=+0 ;ANZ. SPANBRUECHE ~\n  Q205=+0 ;MIN. ZUSTELL-TIEFE ~\n  Q211={dwell} ;VERWEILZEIT UNTEN ~\n  Q208=+99999 ;VORSCHUB RUECKZUG ~\n  Q256=+0.2 ;RZ BEI SPANBRUCH',
    cycleTap: CYCL207, cycleTapLeft: CYCL207,
    cycleReam: 'CYCL DEF 201 REIBEN ~\n  Q200={q200} ;SICHERHEITS-ABST. ~\n  Q201={depth} ;TIEFE ~\n  Q206={dfeed} ;VORSCHUB TIEFENZ. ~\n  Q211={dwell} ;VERWEILZEIT UNTEN ~\n  Q208={dfeed} ;VORSCHUB RUECKZUG ~\n  Q203={dtop} ;KOOR. OBERFLAECHE ~\n  Q204={q204} ;2. SICHERHEITS-ABST.',
    cycleBore: 'CYCL DEF 202 AUSDREHEN ~\n  Q200={q200} ;SICHERHEITS-ABST. ~\n  Q201={depth} ;TIEFE ~\n  Q206={dfeed} ;VORSCHUB TIEFENZ. ~\n  Q211={dwell} ;VERWEILZEIT UNTEN ~\n  Q208=+99999 ;VORSCHUB RUECKZUG ~\n  Q203={dtop} ;KOOR. OBERFLAECHE ~\n  Q204={q204} ;2. SICHERHEITS-ABST. ~\n  Q214=+0 ;FREIFAHR-RICHTUNG ~\n  Q336=+0 ;WINKEL SPINDEL',
    footer: 'L Z{safe} R0 FMAX M5\n{coolantoff}\nM30\nEND PGM {pgm} MM',
  },
];

// Lathe posts: X is written as diameter, Z0 = finished face of the part.
const LATHE_BASE = {
  lathe: true, decimals: 3, trimZeros: true, signed: false, modalCodes: true, feedAfterRapid: false, separator: ' ',
  comment: '({text})', asciiComments: true, arcs: false, useDrillCycle: false,
  lineNumbers: { enabled: false, start: 10, step: 10, prefix: 'N', comments: false },
  toolListHead: '# Werkzeuge:', toolListLine: '# T{t} {toolname}',
  opStart: '\n# {opname} - {optype}', spindleOn: 'G97 S{rpm} M3', coolantOn: 'M8', coolantOff: 'M9', dwell: 'G4 X{dwell}',
  rapid: 'G0{X}{Z}', linear: 'G1{X}{Z}{F}', arcCW: '', arcCCW: '',
};
BUILTIN_POSTS.push(
  {
    ...LATHE_BASE, family: 'lathe', id: 'fanuc-lathe', name: 'Fanuc Drehen (Drehmaschine)', ext: 'nc', builtin: true, decimalPoint: true,
    // the turret indexes at the reference point (G28 U0 W0), never next to the part
    header: '%\nO2000\n# WerkFab - {project}\n# {setup}: Z0 = Planfläche, X = Durchmesser\nG18 G21 G40 G98',
    toolChangeFirst: 'G28 U0 W0\n# T{t} {toolname}\nT{tt}', toolChange: 'G0 X{safex} Z{safez}\nM5\nG28 U0 W0\n# T{t} {toolname}\nT{tt}',
    threadMove: 'G32{Z} F{pitch}',
    // G71 type I (contour N{ns}…N{nf}, rising steadily), G76 two-block threading (1 finishing pass, 60°)
    // G70 finishes along the contour N{ns}…N{nf} of the G71 before it (feed: F of the first contour block)
    cycleTurnRough: 'G0 X{sx} Z{sz}\nG71 U{ap} R0.5\nG71 P{ns} Q{nf} U{u} W0 F{f}\n{contour}', contourFirst: 'N{ns} ', contourLast: 'N{nf} ',
    cycleTurnFinish: 'G0 X{sx} Z{sz}\nG70 P{ns} Q{nf}',
    cycleTurnThread: 'G0 X{tsx} Z{tsz}\nG76 P010060 Q{tqmin} R0\nG76 X{tx} Z{tz} P{thu} Q{tdu} F{pitch}',
    // driven tools: main spindle stopped and coupled as C axis (M45), C reference, tool spindle M13
    liveOn: 'M5\nM45\nG28 H0\nG97 S{rpm} M13', liveOff: 'M5\nM46',
    // flats: polar interpolation G12.1 (X as diameter, C in mm, no G0 while it is active)
    polarOn: 'G0 C0\nG12.1', polarOff: 'G13.1',
    // machines with a Y axis: the same passes with the part standing still (C fixed) and the cutter moving in X and Y
    yOn: 'G17', yOff: 'G18',
    // contours wrapped on the diameter: cylindrical interpolation (feed along the developed surface)
    cylOn: 'G19 W0 H0\nG7.1 C{cylr}', cylOff: 'G7.1 C0\nG18',
    footer: '\nG0 X{safex} Z{safez}\n{coolantoff}\nM5\nG28 U0 W0\nM30\n%',
  },
  {
    ...LATHE_BASE, family: 'lathe', id: 'linuxcnc-lathe', name: 'LinuxCNC Drehen', ext: 'ngc', builtin: true, spindleOn: 'S{rpm} M3',
    // the turret indexes at the tool change position {tcx}/{tcz} (post properties), away from the part
    header: '# WerkFab - {project}\n# {setup}: Z0 = Planfläche, X = Durchmesser\nG7 G18 G21 G90 G94',
    toolChangeFirst: '# T{t} {toolname}\nT{t} M6 G43', toolChange: 'G0 X{safex} Z{safez}\nM5\nG0 X{tcx} Z{tcz}\n# T{t} {toolname}\nT{t} M6 G43',
    threadMove: 'G33{Z} K{pitch}',
    // driven tools: second spindle ($1), the main spindle is positioned as C axis
    liveOn: 'M5 $0\nS{rpm} M3 $1', liveOff: 'M5 $1',
    // Y axis (post property): passes across the axis in the X/Y plane with C standing still
    yOn: 'G17', yOff: 'G18',
    footer: '\nG0 X{safex} Z{safez}\n{coolantoff}\nM5\nM30',
  },
  {
    // Okuma OSP (LB/LU/Genos L): program name O…, speed limit G50 S, tool T + offset + nose (6 digits),
    // feed per minute G94, threading G33 with the lead F, end M02
    ...LATHE_BASE, family: 'lathe', id: 'okuma-lathe', name: 'Okuma OSP Drehen', ext: 'min', builtin: true, decimalPoint: true,
    comment: '({text})',
    header: 'O{prognum}\n# WerkFab - {project}\n# {setup}: Z0 = Planfläche, X = Durchmesser\nG50 S{maxrpm}\nG94',
    toolChangeFirst: '# T{t} {toolname}\nT{tt6}', toolChange: 'G0 X{safex} Z{safez}\nM5\nG0 X{tcx} Z{tcz}\n# T{t} {toolname}\nT{tt6}',
    spindleOn: 'G97 S{rpm} M3', dwell: 'G4 F{dwell}',
    threadMove: 'G33{Z} F{pitch}',
    // LAP: G85 bar turning with the contour N… G81 … G80, threading cycle G71 (straight infeed B0)
    // G87 finishes along the LAP contour N{lap} (feed: F of the first contour block)
    cycleTurnRough: 'G0 X{sx} Z{sz}\nG85 N{lap} D{ap} F{f} U{u} W0\nN{lap} G81\n{contour}\nG80', contourFirst: '', contourLast: '',
    cycleTurnFinish: 'G0 X{sx} Z{sz}\nG87 N{lap}',
    cycleTurnThread: 'G0 X{tsx} Z{tsz}\nG71 X{tx} Z{tz} B0 D{td} H{th} F{pitch}',
    // driven tools: C axis joined (M110) and unclamped (M146), M-tool spindle SB= with M13
    liveOn: 'M5\nM110\nM146\nG94\nSB={rpm} M13', liveOff: 'M12\nM109',
    // Y axis (post property): Y-axis mode on / off, passes in the X/Y plane with C standing still. The C clamp
    // (M147 / M146) is left to the user's template: C is positioned after this line.
    yOn: 'G138\nG17', yOff: 'G18\nG136',
    footer: '\nG0 X{safex} Z{safez}\n{coolantoff}\nM5\nM2',
  },
);

// Passes of a driven tool across the axis (polar moves) as short steps with the real machine values: radius and
// part angle C in degrees, C continuous (no jump at 360°). For controls without polar interpolation.
function polarSteps(moves, tol = 0.01) {
  const out = [];
  let prev = null, cPrev = null;
  const push = (m, x, y, z) => {
    const xr = Math.hypot(x, y);
    let c = xr > 1e-9 ? (Math.atan2(y, x) * 180) / Math.PI : cPrev ?? 0;
    if (cPrev != null) c += 360 * Math.round((cPrev - c) / 360);
    cPrev = c;
    out.push({ ...m, x, y, z, xr, c: +c.toFixed(4), polar: false });
  };
  for (const m of moves) {
    if (!m.polar) { out.push(m); prev = null; if (m.c != null) cPrev = m.c; continue; }
    if (prev) {
      // chord error of a straight X/C step over the angle it turns: r·(1 − cos(Δ/2)) ≤ tol
      const L = Math.hypot(m.x - prev.x, m.y - prev.y), rMax = Math.max(Math.hypot(m.x, m.y), Math.hypot(prev.x, prev.y), 1);
      const sweep = Math.abs(Math.atan2(prev.x * m.y - prev.y * m.x, prev.x * m.x + prev.y * m.y));
      const n = L < 1e-9 ? 1 : Math.max(1, Math.ceil(sweep / (2 * Math.acos(Math.max(0, 1 - tol / rMax)))));
      for (let k = 1; k < n; k++) push(m, prev.x + ((m.x - prev.x) * k) / n, prev.y + ((m.y - prev.y) * k) / n, prev.z + ((m.z - prev.z) * k) / n);
    }
    push(m, m.x, m.y, m.z);
    prev = m;
  }
  return out;
}

// own posts of the app's library (all projects): set by the app; a post of the project with the same id wins
let LIBRARY = () => [];
export function setPostLibrary(fn) { LIBRARY = fn; }
export function allPosts(project) {
  const own = project.posts || [], ids = new Set([...BUILTIN_POSTS, ...own].map(p => p.id));
  let lib = [];
  try { lib = LIBRARY() || []; } catch { /* no storage */ }
  return [...BUILTIN_POSTS, ...own, ...lib.filter(p => p && !ids.has(p.id) && typeof p.linear === 'string').map(p => ({ ...p, libOnly: true }))];
}
export function findPost(project, id) { return allPosts(project).find(p => p.id === id) || BUILTIN_POSTS[0]; }
// legacy names used by the UI
export const POSTS = Object.fromEntries(BUILTIN_POSTS.map(p => [p.id, p.name]));
export const POST_EXT = Object.fromEntries(BUILTIN_POSTS.map(p => [p.id, p.ext]));

// Editable copy of a post (for "Duplizieren" / new custom posts).
export function copyPost(def, id, name) {
  const c = JSON.parse(JSON.stringify(def));
  delete c.builtin;
  return { ...c, id, name };
}

// Controllers and senders often choke on non-ASCII, even inside comments.
export const ascii = s => s.replace(/Ø/g, 'D').replace(/×/g, 'x').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
  .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
  .replace(/[\u2212\u2013\u2014]/g, '-').replace(/\u2026/g, '...').replace(/[\u201e\u201c\u201d\u00ab\u00bb]/g, '"').replace(/[\u2018\u2019\u201a]/g, "'")
  .replace(/°/g, ' Grad').replace(/µ/g, 'u').replace(/±/g, '+/-').replace(/²/g, '2').replace(/³/g, '3')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '');

// ---------- arc fitting ----------
// Runs of feed moves in one Z level that lie on a circle become arc moves
// { t: 'a', x, y, z, cx, cy, cw, f } (at most 180° each, deviation < tol).
function circle3(a, b, c) {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y;
  const x = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const y = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  return { x, y, r: Math.hypot(a.x - x, a.y - y) };
}

export function fitArcs(moves, tol = 0.005, helix = true) {
  const out = [];
  let i = 0;
  while (i < moves.length) {
    const m = moves[i];
    const st = moves[i - 1];
    // planar arcs and helical arcs (Z changes evenly with the angle: helix boring, thread milling, ramps)
    if (!st || m.t !== 'f' || st.a != null || m.a != null) { out.push(m); i++; continue; }
    // the circle of the arc just written goes on (a turn is cut into arcs of at most 180°): the rest of it
    // becomes an arc around the same centre, however short, instead of a few leftover lines
    const pa = out[out.length - 1];
    if (pa && pa.t === 'a' && pa.r != null && pa.f === m.f && pa.comp === m.comp && pa.lead === m.lead && Math.abs(Math.hypot(st.x - pa.cx, st.y - pa.cy) - pa.r) <= 0.002) {
      const r0 = pa.r, dir0 = pa.cw ? -1 : 1;
      let end = -1, sweep = 0, endSweep = 0;
      const zs = [];
      for (let j = i; j < moves.length && j < i + 720; j++) {
        const q = moves[j], pv = moves[j - 1];
        if (q.t !== 'f' || q.f !== m.f || q.comp !== m.comp || q.lead !== m.lead || q.a != null) break;
        if (Math.abs(Math.hypot(q.x - pa.cx, q.y - pa.cy) - r0) > tol) break;
        const seg = Math.hypot(q.x - pv.x, q.y - pv.y);
        if (seg < 1e-9 || r0 - Math.sqrt(Math.max(0, r0 * r0 - seg * seg / 4)) > tol) break;
        const da = Math.atan2((pv.x - pa.cx) * (q.y - pa.cy) - (pv.y - pa.cy) * (q.x - pa.cx), (pv.x - pa.cx) * (q.x - pa.cx) + (pv.y - pa.cy) * (q.y - pa.cy));
        if (Math.sign(da) !== dir0 || sweep + Math.abs(da) > Math.PI) break;
        sweep += Math.abs(da);
        zs.push([sweep, q.z]);
        // Z constant, or linear in the angle up to here
        const zE = q.z, flat = zs.every(([, z]) => Math.abs(z - st.z) <= 1e-9);
        if (!flat && (!helix || zs.some(([sw, z]) => Math.abs(z - (st.z + ((zE - st.z) * sw) / sweep)) > tol))) { sweep -= Math.abs(da); zs.pop(); break; }
        // the arc may end only where the point lies on the circle itself (the control checks the end point)
        if (Math.abs(Math.hypot(q.x - pa.cx, q.y - pa.cy) - r0) <= 0.002) { end = j; endSweep = sweep; }
      }
      if (end >= i && r0 >= 0.05 && endSweep * r0 > 0.02) {
        const e = moves[end];
        out.push({ t: 'a', x: e.x, y: e.y, z: e.z, f: m.f, cx: pa.cx, cy: pa.cy, cw: pa.cw, sw: endSweep, r: r0, ...(m.comp ? { comp: m.comp } : {}), ...(m.lead ? { lead: m.lead } : {}) });
        i = end + 1;
        continue;
      }
    }
    let best = -1, bestArc = null;
    for (let j = i + 2; j < moves.length && j < i + 720; j++) {
      const mj = moves[j];
      if (mj.t !== 'f' || mj.f !== m.f || mj.comp !== m.comp || mj.lead !== m.lead || mj.a != null) break;
      const c = circle3(st, moves[Math.floor((i - 1 + j) / 2)], mj);
      if (!c || c.r < 0.05 || c.r > 5000) break;
      let ok = true, sweep = 0, dir = 0;
      for (let k = i - 1; k < j && ok; k++) {
        const p = moves[k], q = moves[k + 1];
        if (Math.abs(Math.hypot(q.x - c.x, q.y - c.y) - c.r) > tol) ok = false;
        // the straight segment between two points must also stay on the arc (long lines are not arcs)
        const seg = Math.hypot(q.x - p.x, q.y - p.y);
        if (c.r - Math.sqrt(Math.max(0, c.r * c.r - seg * seg / 4)) > tol) ok = false;
        const cr = (p.x - c.x) * (q.y - c.y) - (p.y - c.y) * (q.x - c.x);
        const dt = (p.x - c.x) * (q.x - c.x) + (p.y - c.y) * (q.y - c.y);
        const da = Math.atan2(cr, dt);
        const sg = Math.sign(da);
        if (!sg || (dir && sg !== dir)) ok = false;
        dir = sg;
        sweep += Math.abs(da);
      }
      if (!ok || sweep > Math.PI) break;
      // Z linear in the swept angle (planar: constant)
      if (Math.abs(mj.z - st.z) > 1e-9 || moves.slice(i, j).some(q => Math.abs(q.z - st.z) > 1e-9)) {
        if (!helix) break;
        let acc = 0;
        for (let k = i - 1; k < j && ok; k++) {
          const p = moves[k], q = moves[k + 1];
          acc += Math.abs(Math.atan2((p.x - c.x) * (q.y - c.y) - (p.y - c.y) * (q.x - c.x), (p.x - c.x) * (q.x - c.x) + (p.y - c.y) * (q.y - c.y)));
          if (Math.abs(q.z - (st.z + ((mj.z - st.z) * acc) / sweep)) > tol) ok = false;
        }
        if (!ok) break;
      }
      // nearly straight runs stay lines: huge-radius arcs are numerically fragile on controls
      const chord = Math.hypot(mj.x - st.x, mj.y - st.y);
      const sag = c.r - Math.sqrt(Math.max(0, c.r * c.r - (chord / 2) ** 2));
      if (c.r > 1000 || sag < 4 * tol) continue;
      best = j;
      bestArc = { cx: c.x, cy: c.y, cw: dir < 0, sw: sweep, r: c.r };
    }
    if (best >= i + 2) {
      const e = moves[best];
      out.push({ t: 'a', x: e.x, y: e.y, z: e.z, f: m.f, ...bestArc, ...(m.comp ? { comp: m.comp } : {}), ...(m.lead ? { lead: m.lead } : {}) });
      i = best + 1;
    } else { out.push(m); i++; }
  }
  return out;
}

// Arcs in the Z/X plane (G18) and the Y/Z plane (G19): passes of 3D finishing run over fillets and round
// surfaces as many short lines in a vertical plane. The moves are turned so that the plane lies in X/Y, fitted
// like XY arcs (no helices: the third axis must stand still) and turned back. Moves with radius compensation or
// a lead keep their lines (compensation acts in the XY plane). Plane arcs carry pl: 18 | 19, the centre in
// cx/cy/cz and cw in the sense of the plane (G18: looking from +Y with Z to the right and X up).
export function fitPlaneArcs(moves, tol = 0.005) {
  let res = moves;
  for (const pl of [18, 19]) {
    // u/v of the plane: G18 (z, x), G19 (y, z); w the axis that must stand still
    const [u, v, w] = pl === 18 ? ['z', 'x', 'y'] : ['y', 'z', 'x'];
    const sw = res.map(m => {
      if (!Number.isFinite(m.x) || !Number.isFinite(m.y) || !Number.isFinite(m.z)) return { t: 'x', a: 0, o: m }; // never a start point
      const keep = m.t !== 'f' || m.comp || m.lead || m.a != null || m.dwell;
      return { t: keep ? 'x' : 'f', x: m[u], y: m[v], z: m[w], f: m.f, o: m };
    });
    const fit = fitArcs(sw, tol, false);
    if (fit.length === sw.length) continue;
    res = fit.map(m => {
      if (m.t !== 'a') return m.o;
      const e = { [u]: m.x, [v]: m.y, [w]: m.z };
      const c = { [u]: m.cx, [v]: m.cy, [w]: m.z };
      return { t: 'a', pl, x: e.x, y: e.y, z: e.z, f: m.f, cx: c.x, cy: c.y, cz: c.z, cw: m.cw, sw: m.sw, r: m.r };
    });
  }
  return res;
}

function activeOps(project, results, ops = project.cam.ops) {
  return ops.filter(op => {
    const r = results.get(op.id);
    return op.enabled !== false && r && !r.error && (r.moves.length || !!r.manual);
  });
}

// Helical arcs around the same centre with the same pitch become one move: a polar arc (Heidenhain CP)
// may turn more than 360°, so a helix bore is one block per pass instead of two per turn.
function mergeHelix(moves) {
  const out = [];
  let z = null; // end height of the previous move
  for (const m of moves) {
    const last = out[out.length - 1];
    if (m.t === 'a' && last?.t === 'a' && last.z0 != null && z != null && m.sw > 0 && last.sw > 0 && m.cw === last.cw && m.f === last.f && m.comp === last.comp &&
      Math.abs(m.cx - last.cx) < 1e-6 && Math.abs(m.cy - last.cy) < 1e-6) {
      const dz = m.z - z, dzl = last.z - last.z0;
      if (Math.abs(dz) > 1e-6 && Math.abs(dzl) > 1e-6 && Math.abs(dz - (dzl / last.sw) * m.sw) < 0.002 && last.sw + m.sw < (3600 * Math.PI) / 180) {
        out[out.length - 1] = { ...last, x: m.x, y: m.y, z: m.z, sw: last.sw + m.sw };
        z = m.z;
        continue;
      }
    }
    out.push(m.t === 'a' ? { ...m, z0: z } : m);
    if (m.z != null) z = m.z;
  }
  return out;
}

// Hole patterns: all holes of an operation on one bolt circle (equal pitch, full circle or arc) or in a
// grid / row (any rotation). Returns null when the holes form no such pattern.
export function holePattern(pts, tol = 0.01) {
  const n = pts.length;
  if (n < 3) return null;
  // grid: axis directions from the vectors between the holes (modulo 90°)
  const q = Math.PI / 2, cands = [];
  for (let i = 1; i < n; i++) {
    const a = ((Math.atan2(pts[i][1] - pts[0][1], pts[i][0] - pts[0][0]) % q) + q) % q;
    if (!cands.some(c => Math.abs(c - a) < 1e-6 || Math.abs(Math.abs(c - a) - q) < 1e-6)) cands.push(a);
  }
  const cluster = vs => { const s = [...vs].sort((a, b) => a - b), out = []; for (const v of s) if (!out.length || v - out[out.length - 1] > tol) out.push(v); return out; };
  const even = U => U.length < 2 || U.every((u, i) => i === 0 || Math.abs(u - U[i - 1] - (U[1] - U[0])) < tol);
  for (const th of cands) {
    const c = Math.cos(th), s = Math.sin(th);
    const uv = pts.map(([x, y]) => [x * c + y * s, -x * s + y * c]);
    const U = cluster(uv.map(p => p[0])), V = cluster(uv.map(p => p[1]));
    if (U.length * V.length !== n || !even(U) || !even(V)) continue;
    const idx = new Set(uv.map(([u, v]) => U.findIndex(x => Math.abs(x - u) <= tol) + ',' + V.findIndex(x => Math.abs(x - v) <= tol)));
    if (idx.size !== n || idx.has('-1,0') || [...idx].some(k => k.includes('-1'))) continue;
    const d1 = U.length > 1 ? U[1] - U[0] : 0, d2 = V.length > 1 ? V[1] - V[0] : 0;
    return { kind: 'grid', x: U[0] * c - V[0] * s, y: U[0] * s + V[0] * c, d1: d1 || d2, d2: d2 || d1, nc: U.length, nr: V.length, ang: (th * 180) / Math.PI };
  }
  // bolt circle: all on one circle, equal angular pitch (one bigger gap = arc)
  const P = pts.map(([x, y]) => ({ x, y }));
  const cc = circle3(P[0], P[1], P[2]);
  if (!cc || cc.r < 0.5 || P.some(p => Math.abs(Math.hypot(p.x - cc.x, p.y - cc.y) - cc.r) > tol)) return null;
  const an = P.map(p => Math.atan2(p.y - cc.y, p.x - cc.x)).sort((a, b) => a - b);
  const gaps = an.map((a, i) => (i + 1 < n ? an[i + 1] - a : an[0] + 2 * Math.PI - a));
  const tolA = tol / cc.r;
  let big = gaps.indexOf(Math.max(...gaps));
  const st = gaps[(big + 1) % n];
  if (gaps.every((g, i) => i === big || Math.abs(g - st) < tolA) && (gaps[big] > st - tolA)) {
    if (Math.abs(gaps[big] - st) < tolA) big = n - 1; // full circle: start at the smallest angle
    const a0 = an[(big + 1) % n];
    const deg = v => (v * 180) / Math.PI;
    return { kind: 'circle', cx: cc.x, cy: cc.y, r: cc.r, a0: deg(a0), step: deg(st), n, a1: deg(a0 + (n - 1) * st) };
  }
  return null;
}

// Several patterns in one operation: the largest pattern among the holes first (rows / grids from neighbour
// directions, bolt circles through neighbour triples), then again with the rest; what is left are single holes.
// Mixed operations: circles and grids need 4 holes, rows 3 (three holes always lie on some "arc").
export function holePatterns(pts, tol = 0.01) {
  const whole = holePattern(pts, tol);
  if (whole) return { groups: [{ ...whole, pts }], singles: [] };
  let rest = pts.map(([x, y], i) => ({ x, y, i }));
  const groups = [];
  for (let guard = 0; guard < 100 && rest.length >= 3; guard++) {
    const best = bestPatternGroup(rest, tol);
    if (!best) break;
    groups.push({ ...best.pat, pts: best.members.map(q => [q.x, q.y]) });
    const used = new Set(best.members.map(q => q.i));
    rest = rest.filter(q => !used.has(q.i));
  }
  return groups.length ? { groups, singles: rest.map(q => [q.x, q.y]) } : null;
}
function bestPatternGroup(P, tol) {
  // spatial hash (1 mm cells) for "is there a hole here"
  const H = new Map(), key = (x, y) => Math.floor(x) + ',' + Math.floor(y);
  for (const p of P) { const k = key(p.x, p.y); (H.get(k) || H.set(k, []).get(k)).push(p); }
  const at = (x, y) => {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
      for (const p of H.get(key(x + dx, y + dy)) || []) if (Math.abs(p.x - x) <= tol && Math.abs(p.y - y) <= tol) return p;
    return null;
  };
  const near = p => P.filter(q => q !== p).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y)).slice(0, 6);
  let best = null;
  const offer = (members, minN) => {
    if (members.length < minN || (best && members.length <= best.members.length)) return;
    const pat = holePattern(members.map(q => [q.x, q.y]), tol);
    if (pat && (pat.kind === 'grid' ? (pat.nr > 1 ? members.length >= 4 : true) : members.length >= 4)) best = { pat, members };
  };
  for (const p of P) {
    const nb = near(p);
    for (const q of nb) {
      const a = [q.x - p.x, q.y - p.y];
      // rows: p, p + a, p + 2a … (p must be the first hole of the row)
      if (at(p.x - a[0], p.y - a[1])) continue;
      const run = [];
      for (let m = 0; ; m++) { const h = at(p.x + m * a[0], p.y + m * a[1]); if (!h) break; run.push(h); }
      offer(run, 3);
      // grids: a second direction at right angles, every row complete
      for (const r of nb) {
        if (r === q) continue;
        const b = [r.x - p.x, r.y - p.y], la = Math.hypot(...a), lb = Math.hypot(...b);
        if (Math.abs(a[0] * b[0] + a[1] * b[1]) > 1e-3 * la * lb || at(p.x - b[0], p.y - b[1])) continue;
        const cells = [];
        for (let n = 0; ; n++) {
          const row = [];
          for (let m = 0; m < run.length; m++) { const h = at(p.x + m * a[0] + n * b[0], p.y + m * a[1] + n * b[1]); if (!h) break; row.push(h); }
          if (row.length < run.length) break;
          cells.push(...row);
        }
        offer(cells, 4);
      }
    }
    // bolt circles through p and two of its neighbours
    for (let j = 0; j < nb.length; j++) for (let k = j + 1; k < nb.length; k++) {
      const c = circle3(p, nb[j], nb[k]);
      if (!c || c.r < 0.5) continue;
      offer(P.filter(h => Math.abs(Math.hypot(h.x - c.x, h.y - c.y) - c.r) <= tol), 4);
    }
  }
  return best;
}

// ---------- template engine ----------
class Writer {
  constructor(def) {
    this.def = def;
    this.out = [];
    this.st = {};          // modal state: last written X/Y/Z/F
    this.lastCode = null;  // last motion code for modal G-codes
    this.rapidBefore = true;
    this.srcMap = new Map(); // template text -> section key (for the editor: which template wrote a line)
  }

  // remember which section a (possibly rewritten) template belongs to
  tag(tpl, key) { if (tpl && key && !this.srcMap.has(String(tpl))) this.srcMap.set(String(tpl), key); return tpl; }

  num(v) {
    const d = this.def;
    const dec = Number.isFinite(+d.decimals) ? +d.decimals : 3;
    let s = (Math.round(v * 10 ** dec) / 10 ** dec).toFixed(dec);
    if (d.trimZeros !== false && dec > 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    if (d.decimalPoint && !s.includes('.')) s += '.';
    if (/^-0(\.0*)?$/.test(s)) s = s.slice(1);
    if (d.signed && !s.startsWith('-')) s = '+' + s;
    return s;
  }

  comment(text) {
    const d = this.def;
    let t = d.asciiComments !== false ? ascii(text) : text;
    if ((d.comment || '').startsWith('(')) t = t.replace(/[()]/g, '');
    return (d.comment || '({text})').replace('{text}', t);
  }

  // Expand one template with variables; motion words use the modal state.
  expand(tpl, vars = {}, motion = null) {
    if (!tpl) return;
    const d = this.def;
    const sep = d.separator ?? ' ';
    const src = this.srcMap.get(String(tpl)) || this.src || null;
    const n0 = this.out.length;
    const res = this.expandLines(tpl, vars, motion, d, sep);
    for (let i = n0; i < this.out.length; i++) {
      if (this.out[i].src === undefined) this.out[i].src = src;
      if (this.curOp && this.out[i].op === undefined) this.out[i].op = this.curOp;
    }
    return res;
  }

  expandLines(tpl, vars, motion, d, sep) {
    for (const raw of String(tpl).split('\n')) {
      if (raw === '') { this.out.push({ text: '', blank: true }); continue; }
      const isComment = raw.startsWith('#');
      let line = isComment ? raw.slice(1).trimStart() : raw;
      let wroteAxis = false;
      line = line.replace(/\{([A-Za-z][A-Za-z0-9]*)(!?)\}/g, (_, key, force) => {
        if (motion && /^[XYZAC]$/.test(key)) {
          if (motion[key.toLowerCase()] == null) return '';
          const v = this.num(motion[key.toLowerCase()]);
          // axis words are modal: written only when the value changes (unless forced with "!")
          if (!force && this.st[key] === v) return '';
          this.st[key] = v;
          wroteAxis = true;
          return `${sep}${key}${v}`;
        }
        if (motion && key === 'F') {
          if (motion.fInv != null) { this.st.F = null; return `${sep}F${motion.fInv}`; }
          if (motion.f == null) return '';
          const f = Math.round(motion.f);
          if (this.st.F === f && !(d.feedAfterRapid && this.rapidBefore)) return '';
          this.st.F = f;
          // parametric feed (Heidenhain): FQ1, FQ2 …
          if (this.qfeed?.has(f)) return `${sep}FQ${this.qfeed.get(f)}`;
          return `${sep}F${f}`;
        }
        if (motion && (key === 'I' || key === 'J' || key === 'K')) return `${sep}${key}${this.num(motion[key.toLowerCase()])}`;
        const v = vars[key] ?? vars[key.toLowerCase()];
        if (v == null) return '';
        return typeof v === 'number' ? this.num(v) : String(v);
      });
      if (motion && !wroteAxis && !motion.arc) return false; // nothing moved
      if (isComment) { this.out.push({ text: this.comment(line), comment: true }); continue; }
      if (motion && d.modalCodes !== false) {
        const code = line.match(/^(G0?[0-3])\b/)?.[1];
        if (code) {
          if (code === this.lastCode && !motion.arc) line = line.slice(code.length).trimStart();
          this.lastCode = code;
        }
      }
      if (!line.trim()) continue;
      if (!/^\s/.test(raw)) line = line.trimStart();
      this.out.push({ text: line, cont: /^\s/.test(raw) });
    }
    return true;
  }

  resetModal() { this.st = {}; this.lastCode = null; this.rapidBefore = true; }

  text() {
    const ln = this.def.lineNumbers || {};
    let n = +ln.start || 0;
    // blocks that carry their own number (contour labels of turning cycles) keep it, and the running numbers
    // never take one of those
    const own = new Set(this.out.map(l => +(String(l.text).match(/^N(\d+)\b/) || [])[1]).filter(Number.isFinite));
    return this.out.map(l => {
      if (l.blank) return '';
      // tape start/end (%) and the program number line are never numbered
      if (!ln.enabled || l.cont || (l.comment && !ln.comments) || l.text === '%' || /^O\d+$/.test(l.text) || /^N\d+\b/.test(l.text)) return l.text;
      while (own.has(n)) n += +ln.step || 1;
      const s = `${ln.prefix ?? 'N'}${n} ${l.text}`;
      n += +ln.step || 1;
      return s;
    }).join('\n');
  }
}

// ---------- post properties (like the "Postprozessor-Eigenschaften" in CAD programs) ----------
export const COOLANT_MODES = { off: 'Aus', flood: 'Flutkühlung', mist: 'Minimalmenge (Nebel)', air: 'Luft außen', airThrough: 'Luft durch Spindel', through: 'Innenkühlung (durch Werkzeug)', floodAir: 'Flut + Luft außen' };
export const POST_PROP_GROUPS = [
  ['prefs', 'Einstellungen'], ['coolant', 'Kühlmittel (M-Codes)'], ['retract', 'Sicherer Rückzug und Referenzposition'],
  ['multiaxis', 'Mehrachsen (3+2 Schwenken)'], ['formats', 'Formate'], ['probing', 'Antasten und Messen'], ['builtin', 'Integriert'], ['mcodes', 'M-Befehle (Haken = ausgeben)'],
];
const HH = ['heidenhain'], ISO_SMOOTH = ['heidenhain', 'fanuc', 'sinumerik'];
export const POST_PROPS = [
  { key: 'subroutines', group: 'prefs', label: 'Unterprogramme verwenden', type: [['none', 'Nein'], ['ops', 'Alle Operationen (LBL)']], def: 'none', only: HH, help: 'Jede Operation als Unterprogramm (LBL) am Programmende, Aufruf mit CALL LBL' },
  { key: 'optionalStop', group: 'prefs', label: 'Optionaler Halt', type: 'bool', def: false, help: 'M1 vor jedem Werkzeugwechsel' },
  { key: 'preloadTool', group: 'prefs', label: 'Werkzeug vorwählen', type: 'bool', def: false, help: 'Nächstes Werkzeug schon vorbereiten (TOOL DEF bzw. T-Wort)' },
  { key: 'drillPatterns', group: 'prefs', label: 'Bohrbilder als Zyklus', type: 'bool', def: false, only: ['heidenhain', 'sinumerik'], help: 'Bohrungen auf einem Lochkreis oder in einem Raster als Musterzyklus (Heidenhain 220/221, Sinumerik HOLES2/CYCLE801) statt einzelner Koordinaten. Aus: jede Bohrung mit ihren Koordinaten. Je Bohroperation umschaltbar.' },
  { key: 'm120', group: 'prefs', label: 'M120 beim Schlichten', type: 'bool', def: true, only: HH, help: 'Radiuskorrigierte Kontur vorausberechnen (M120 LA…) im Satz, in dem die Radiuskorrektur RL/RR beginnt – nur bei Schlicht-Operationen; R0 hebt M120 wieder auf' },
  { key: 'm120LA', group: 'prefs', label: 'M120 Sätze voraus (LA)', type: 'num', def: 5, only: HH, help: 'Anzahl der vorausberechneten Sätze (LA 1…99)' },
  { key: 'm13', group: 'prefs', label: 'Spindel und Kühlmittel zusammen (M13/M14)', type: 'bool', def: false, only: HH, help: 'M3 + M8 als M13, M4 + M8 als M14 in einem Satz' },
  { key: 'qParams', group: 'prefs', label: 'Tiefe und Aufmaß als Q-Parameter', type: 'bool', def: false, only: HH, help: 'Je Operation zwei Q-Parameter am Programmanfang: der erste verschiebt die Tiefe (DL, + = weniger tief), der zweite das seitliche Aufmaß (DR, + = mehr Aufmaß; wirkt nur bei Radiuskorrektur an der Steuerung RL/RR). An der Maschine eine Zahl ändern statt Sätze suchen.' },
  { key: 'qBase', group: 'prefs', label: 'Erster Q-Parameter', type: 'num', def: 50, only: HH, help: 'Nummer des ersten Q-Parameters (je Operation zwei: Tiefe, Aufmaß)' },
  { key: 'apprDep', group: 'prefs', label: 'An-/Abfahren mit APPR/DEP', type: 'bool', def: true, only: HH, help: 'Konturen mit Radiuskorrektur an der Steuerung (RL/RR) fahren mit APPR/DEP an und ab; die Steuerung berechnet Hilfspunkt und Korrektur selbst' },
  { key: 'toolAsName', group: 'prefs', label: 'Werkzeug als Name', type: 'bool', def: false, only: HH, help: 'TOOL CALL "NAME" statt Werkzeugnummer' },
  { key: 'parametricFeed', group: 'prefs', label: 'Parametrischer Vorschub', type: 'bool', def: false, only: HH, help: 'Vorschübe als Q-Parameter (FQ1 …) – an der Maschine zentral anpassbar' },
  { key: 'smoothing', group: 'prefs', label: 'Glättung verwenden', type: [['off', 'Aus'], ['auto', 'Automatisch (Schruppen/Schlichten)'], ['low', 'Niedrig (0,05 mm)'], ['medium', 'Mittel (0,02 mm)'], ['high', 'Hoch (0,005 mm)']], def: 'off', only: ISO_SMOOTH, help: 'Heidenhain Zyklus 32 TOLERANZ, Fanuc G5.1, Sinumerik CYCLE832' },
  { key: 'coolFlood', group: 'coolant', label: 'Flutkühlung', type: 'text', def: 'M8' },
  { key: 'coolMist', group: 'coolant', label: 'Minimalmenge (Nebel)', type: 'text', def: 'M7' },
  { key: 'coolAir', group: 'coolant', label: 'Luft außen', type: 'text', def: { heidenhain: 'M28', default: 'M7' } },
  { key: 'coolAirThrough', group: 'coolant', label: 'Luft durch Spindel', type: 'text', def: 'M26' },
  { key: 'coolThrough', group: 'coolant', label: 'Innenkühlung', type: 'text', def: { heidenhain: 'M7', default: 'M88' } },
  { key: 'coolOff', group: 'coolant', label: 'Kühlmittel aus', type: 'text', def: 'M9' },
  { key: 'coolAirOff', group: 'coolant', label: 'Luft aus', type: 'text', def: 'M9', help: 'Falls die Maschine für Luft einen eigenen Aus-Befehl hat (z. B. M29)' },
  { key: 'safeRetract', group: 'retract', label: 'Sicherer Rückzug', type: { heidenhain: [['clearance', 'Sicherheitshöhe'], ['m91', 'M91 (Maschinenkoordinaten)']], default: [['clearance', 'Sicherheitshöhe'], ['g28', 'G28 (Referenzpunkt)'], ['g53', 'G53 (Maschinenkoordinaten)']] }, def: 'clearance' },
  { key: 'm91Z', group: 'retract', label: 'Rückzugshöhe M91', type: 'num', def: 0, only: HH, help: 'Z-Wert in Maschinenkoordinaten für den M91-Rückzug' },
  { key: 'useM140', group: 'retract', label: 'M140 verwenden', type: 'bool', def: false, only: HH, help: 'M140 MB MAX: in Werkzeugachse maximal zurückziehen' },
  { key: 'tcX', group: 'retract', label: 'Werkzeugwechsel X (Ø)', type: 'num', def: 0, only: ['lathe'], help: 'Drehen: Durchmesser, auf dem der Revolver schaltet (Okuma, LinuxCNC). 0 = Rohteil-Ø + 200 mm' },
  { key: 'tcZ', group: 'retract', label: 'Werkzeugwechsel Z', type: 'num', def: 0, only: ['lathe'], help: 'Drehen: Z vor der Planfläche, auf dem der Revolver schaltet. 0 = Sicherheitsabstand + 100 mm' },
  { key: 'latheY', group: 'prefs', label: 'Y-Achse statt Polar-Interpolation', type: 'bool', def: false, only: ['lathe'], help: 'Drehmaschine mit Y-Achse: Schlüsselflächen, Konturen und Taschen auf der Planfläche fahren mit feststehendem Teil (C fest) in X und Y – genauer als die Polar-Interpolation. Was über den Y-Weg hinausgeht, bleibt bei der Polar-Interpolation.' },
  { key: 'latheYTravel', group: 'prefs', label: 'Y-Verfahrweg (±)', type: 'num', def: 40, only: ['lathe'], help: 'Größter Weg der Y-Achse aus der Mitte, in mm' },
  { key: 'homeXY', group: 'retract', label: 'XY-Referenz am Ende', type: 'bool', def: false, help: 'Am Programmende in X/Y auf Maschinen-Null fahren (M91 / G28)' },
  { key: 'preferTilt', group: 'multiaxis', label: 'Schwenkrichtung bevorzugen', type: [['neg', 'Negativ'], ['pos', 'Positiv'], ['either', 'Beliebig']], def: 'neg', only: ['heidenhain', 'sinumerik'] },
  { key: 'tcpm', group: 'multiaxis', label: 'FUNCTION TCPM verwenden', type: 'bool', def: false, only: HH, help: 'Werkzeugspitzen-Nachführung einschalten' },
  { key: 'tcpmCode', group: 'multiaxis', label: 'Werkzeugspitzen-Nachführung als', type: [['function', 'FUNCTION TCPM … / FUNCTION RESET TCPM'], ['m128', 'M128 … / M129']], def: 'function', only: HH, help: 'M128 für ältere Steuerungen (TNC 426/430, iTNC 530 ohne FUNCTION TCPM)' },
  { key: 'tiltedPlane', group: 'multiaxis', label: 'Geschwenkte Bearbeitungsebene', type: [['spatial', 'PLANE SPATIAL'], ['cycle19', 'Zyklus 19'], ['off', 'Aus']], def: 'spatial', only: HH, help: 'Für Setups, die nicht von oben bearbeitet werden' },
  { key: 'swivel', group: 'multiaxis', label: 'Geschwenkte Bearbeitungsebene', type: [['cycle800', 'CYCLE800'], ['off', 'Aus']], def: 'cycle800', only: ['sinumerik'], help: 'Für Setups, die nicht von oben bearbeitet werden' },
  { key: 'swivelRecord', group: 'multiaxis', label: 'Schwenkdatensatz (Name)', type: 'text', def: '', only: ['sinumerik'], help: 'Name des Schwenkdatensatzes der Maschine, z. B. TABLE. Leer: der einzige oder der aktive Datensatz' },
  { key: 'swivelRetract', group: 'multiaxis', label: 'Freifahren vor dem Schwenken', type: [['1', 'Z (Maschinenachse)'], ['2', 'Z, dann X/Y'], ['4', 'Werkzeugrichtung maximal'], ['0', 'Nicht freifahren']], def: '1', only: ['sinumerik'] },
  { key: 'clearMove', group: 'multiaxis', label: 'Freifahren bei 5-Achs-Bearbeitung', type: [['zxy', 'Z ganz nach oben, dann X/Y weg vom Teil'], ['z', 'Nur Z ganz nach oben'], ['off', 'Nicht freifahren']], def: 'zxy', only: ['heidenhain', 'sinumerik', 'fanuc'], help: 'Vor dem Einschwenken und nach dem Ausschwenken fährt das Werkzeug in Maschinenkoordinaten frei: erst Z, dann X/Y – die Drehachsen bewegen sich erst, wenn das Werkzeug weg vom Teil steht' },
  { key: 'clearXY', group: 'multiaxis', label: 'Freifahrposition X/Y', type: [['home', 'Maschinen-Null (X0 Y0)'], ['custom', 'Eigene Position']], def: 'home', only: ['heidenhain', 'sinumerik', 'fanuc'], help: 'Wohin X und Y beim Freifahren fahren, in Maschinenkoordinaten' },
  { key: 'clearX', group: 'multiaxis', label: 'Freifahrposition X', type: 'num', def: 0, only: ['heidenhain', 'sinumerik', 'fanuc'], help: 'Maschinenkoordinate X der eigenen Freifahrposition (z. B. die Ecke hinten rechts des Verfahrbereichs)' },
  { key: 'clearY', group: 'multiaxis', label: 'Freifahrposition Y', type: 'num', def: 0, only: ['heidenhain', 'sinumerik', 'fanuc'], help: 'Maschinenkoordinate Y der eigenen Freifahrposition' },
  { key: 'clearZ', group: 'multiaxis', label: 'Freifahrhöhe Z', type: 'num', def: 0, only: ['sinumerik', 'fanuc'], help: 'Maschinenkoordinate Z beim Freifahren (0 = ganz oben). Heidenhain nimmt die „Rückzugshöhe M91“' },
  { key: 'showNotes', group: 'formats', label: 'Notizen ausgeben', type: 'bool', def: false, help: 'Notizen der Operationen als Kommentar' },
  { key: 'structureComments', group: 'formats', label: 'Strukturkommentare', type: 'bool', def: true, help: 'Operationsname als Kommentar vor jeder Operation' },
  { key: 'writeMachine', group: 'formats', label: 'Maschine ausgeben', type: 'bool', def: true },
  { key: 'writeToolList', group: 'formats', label: 'Werkzeugliste ausgeben', type: 'bool', def: true },
  { key: 'writeVersion', group: 'formats', label: 'Version ausgeben', type: 'bool', def: false },
  { key: 'toolCheck', group: 'probing', label: 'Werkzeug nach dem Einwechseln prüfen', type: [['off', 'Aus'], ['length', 'Länge (TCH PROBE 481)'], ['both', 'Länge und Radius (TCH PROBE 483)']], def: 'off', only: HH, help: 'Mit dem Werkzeug-Taster (TT) direkt nach dem TOOL CALL: Q340=1 prüft gegen die Werkzeugtabelle, schreibt die Abweichung als DL/DR und sperrt das Werkzeug bei überschrittener Verschleiß- oder Bruchtoleranz' },
  { key: 'toolBreak', group: 'probing', label: 'Bruchkontrolle nach dem letzten Einsatz', type: 'bool', def: false, only: HH, help: 'TCH PROBE 481 mit Q340=1, bevor das Werkzeug ausgewechselt wird oder das Programm endet (Bruchtoleranz LBREAK aus der Werkzeugtabelle)' },
  { key: 'ttSafe', group: 'probing', label: 'Sichere Höhe am Taster (Q260)', type: 'num', def: 100, only: HH, help: 'Höhe in der Werkzeugachse, auf der beim Anfahren an den Taster nichts im Weg ist' },
  { key: 'ttTeeth', group: 'probing', label: 'Einzelschneiden vermessen (Q341)', type: 'bool', def: false, only: HH },
  { key: 'probeCycles', group: 'probing', label: 'Tastzyklen ausgeben', type: 'bool', def: true, help: 'Antast-Operationen als Steuerungszyklen (Heidenhain TCH PROBE 4xx, Renishaw G65 P98xx)' },
  { key: 'probeFeed', group: 'probing', label: 'Antastvorschub', type: 'num', def: 300, help: 'Vorschub für das geschützte Anfahren (Renishaw)' },
  { key: 'lineNumbers', group: 'builtin', label: 'Satznummern', type: 'bool', def: { heidenhain: true, default: false } },
  { key: 'arcs', group: 'builtin', label: 'Kreisbögen ausgeben', type: 'bool', def: true },
  { key: 'planeArcs', group: 'builtin', label: 'Kreisbögen in XZ und YZ (G18/G19)', type: 'bool', def: true, only: ['fanuc', 'sinumerik', 'linuxcnc', 'grbl', 'gcode'], help: 'Bahnen über Rundungen in senkrechten Ebenen als G2/G3 mit G18 bzw. G19 statt vieler kurzer Geraden – deutlich kürzere Programme beim 3D-Schlichten' },
  { key: 'cycles', group: 'builtin', label: 'Bohrzyklen ausgeben', type: 'bool', def: true },
  { key: 'rotaryFeed', group: 'builtin', label: 'Vorschub mit Drehachse', type: [['mm', 'wie programmiert (mm/min)'], ['comp', 'umgerechnet (Grad zählen wie mm)'], ['inverse', 'zeitreziprok (G93)']], def: 'mm', only: ['fanuc', 'linuxcnc', 'grbl', 'gcode'], help: '4-Achs-Sätze mit X/Y/Z und A zusammen: Viele Steuerungen rechnen dort Grad wie Millimeter, der Fräser läuft dann am Werkstück zu langsam oder zu schnell. „Umgerechnet“ schreibt den F-Wert so, dass eine solche Steuerung den gewünschten Vorschub an der Schneide fährt. „Zeitreziprok“ schaltet auf G93 und gibt in jedem Satz 1/Zeit an – eindeutig, wenn die Steuerung G93 kennt.' },
  // M functions the user switched off: removed from every block of the program (list of numbers)
  { key: 'mOff', group: 'mcodes', label: 'M-Befehle', type: 'mlist', def: [] },
];
// meaning of the M functions the posts write (shown next to the switches)
export const M_CODES = {
  0: 'Programmhalt', 1: 'Optionaler Halt', 2: 'Programmende', 3: 'Spindel ein, rechts', 4: 'Spindel ein, links', 5: 'Spindel aus',
  6: 'Werkzeugwechsel', 7: 'Kühlmittel Nebel / Luft', 8: 'Kühlmittel ein', 9: 'Kühlmittel aus', 12: 'Angetriebenes Werkzeug aus',
  13: 'Spindel rechts (angetriebenes Werkzeug)', 26: 'Luft durch Spindel', 28: 'Luft außen', 29: 'Luft aus', 30: 'Programmende mit Rücksprung',
  45: 'C-Achse ein', 46: 'C-Achse aus', 88: 'Innenkühlung', 91: 'Maschinenkoordinaten', 99: 'Zyklusaufruf', 109: 'C-Achse aus',
  110: 'C-Achse ein', 14: 'Spindel links + Kühlmittel ein', 120: 'Radiuskorrektur vorausberechnen (LA)', 128: 'Werkzeugspitzen-Nachführung ein (TCPM)', 129: 'Werkzeugspitzen-Nachführung aus', 140: 'Rückzug in Werkzeugachse', 146: 'C-Achse klemmen lösen',
};
// Heidenhain: M13/M14 combine spindle and coolant
const M_CODES_HH = { 13: 'Spindel rechts + Kühlmittel ein' };
const COOL_KEYS = ['coolFlood', 'coolMist', 'coolAir', 'coolAirThrough', 'coolThrough', 'coolOff', 'coolAirOff'];
// the coolant codes set in the post properties name their M function (e.g. M7 = Innenkühlung on one machine,
// Minimalmenge on another); otherwise the usual meaning
export const mCodeLabel = (n, def, values = {}) => {
  const P = postProps(def, values);
  const cool = [...new Set(COOL_KEYS.filter(k => +(String(P[k] || '').trim().match(/^M0*(\d+)$/) || [])[1] === n).map(k => POST_PROPS.find(p => p.key === k).label))];
  if (cool.length) return cool.join(' / ');
  return (postFamily(def) === 'heidenhain' && M_CODES_HH[n]) || M_CODES[n] || '';
};
// every M function a post can write: the ones in its templates, the coolant codes of its properties and the
// ones the post writes itself (stops, spindle for left-hand tapping, Heidenhain M91/M140/M99)
export function postMCodes(def, values = {}) {
  const fam = postFamily(def), P = postProps(def, values), out = new Set([0, 1, 3, 4, 5]);
  const scan = v => { if (typeof v === 'string') for (const m of v.matchAll(/(?<![A-Za-z0-9])M0*(\d{1,3})(?![0-9])/g)) out.add(+m[1]); else if (v && typeof v === 'object') Object.values(v).forEach(scan); };
  for (const [k, v] of Object.entries(def)) if (!['id', 'name', 'ext', 'comment'].includes(k)) scan(v);
  for (const k of ['coolFlood', 'coolMist', 'coolAir', 'coolAirThrough', 'coolThrough', 'coolOff', 'coolAirOff']) scan(P[k]);
  if (fam === 'heidenhain') [13, 14, 91, 99, 120, 128, 129, 140].forEach(n => out.add(n));
  return [...out].sort((a, b) => a - b);
}
// remove the switched-off M functions from the blocks (comments stay); a block left empty is dropped
function stripMCodes(out, off) {
  const re = /(^|\s)M0*(\d{1,3})(?![0-9])(\s+MB\s+MAX|\s+\$\d+|\s+LA\d+)?/g;
  return out.filter(l => {
    if (l.blank || l.comment || typeof l.text !== 'string') return true;
    const cut = l.text.search(/[(;]/), head = cut >= 0 ? l.text.slice(0, cut) : l.text, tail = cut >= 0 ? l.text.slice(cut) : '';
    const h2 = head.replace(re, (all, pre, n) => (off.has(+n) ? pre : all)).replace(/\s{2,}/g, ' ').replace(/\s+$/, tail ? ' ' : '');
    if (h2 === head) return true;
    if (!h2.trim() && !tail) return false;
    l.text = (h2.trim() ? h2 : '') + tail;
    return true;
  });
}
export const postFamily = def => def.family || (def.lathe ? 'lathe' : ['heidenhain', 'fanuc', 'sinumerik', 'linuxcnc', 'grbl'].find(f => String(def.id).startsWith(f)) || 'gcode');
export const propApplies = (prop, def) => !prop.only || prop.only.includes(postFamily(def));
const pick = (v, fam) => (v && typeof v === 'object' && !Array.isArray(v) ? (v[fam] ?? v.default) : v);
export const propType = (prop, def) => pick(prop.type, postFamily(def));
export function postProps(def, values = {}) {
  const fam = postFamily(def), out = {};
  for (const p of POST_PROPS) out[p.key] = values[p.key] ?? pick(p.def, fam);
  return out;
}

const SMOOTH_TOL = { low: 0.05, medium: 0.02, high: 0.005 };
const ROUGH_OPS = ['face', 'pocket', 'adaptive', 'rough3d', 'contour3d', 'plunge3d'];

// Euler angles for PLANE SPATIAL (rotations about the fixed machine axes X, then Y, then Z)
function tiltAngles(setup, prefer) {
  const R = setupMatrix(setup).clone().invert().elements; // setup axes in machine coordinates (column major)
  const r = (i, j) => R[j * 4 + i];
  const deg = x => Math.round((x * 180) / Math.PI * 1000) / 1000 + 0;
  let b = -Math.asin(Math.max(-1, Math.min(1, r(2, 0))));
  let a = Math.atan2(r(2, 1), r(2, 2)), c = Math.atan2(r(1, 0), r(0, 0));
  const identity = Math.abs(a) < 1e-9 && Math.abs(b) < 1e-9 && Math.abs(c) < 1e-9;
  // the same orientation as rotations about X, then the new Y, then the new Z (CYCLE800 axis by axis, mode 57)
  const sb = Math.asin(Math.max(-1, Math.min(1, r(0, 2)))), sa = Math.atan2(-r(1, 2), r(2, 2)), sc = Math.atan2(-r(0, 1), r(0, 0));
  return { a: deg(a), b: deg(b), c: deg(c), sa: deg(sa), sb: deg(sb), sc: deg(sc), identity, seq: prefer === 'pos' ? '+' : prefer === 'neg' ? '-' : '' };
}

/**
 * Runs a post definition over one CAM setup.
 * opts.props: post properties (see POST_PROPS); opts.machine adds limit checks;
 * opts.opIds limits the program to these operations.
 */
export function runPost(def, project, gen, opts = {}) {
  const { stock, results, setup } = gen;
  const lathe = gen.kind === 'turn';
  const fam = postFamily(def), hh = fam === 'heidenhain';
  // own Heidenhain copies from before helix / approach templates existed get the built-in ones
  if (hh) {
    const base = BUILTIN_POSTS.find(x => x.id === 'heidenhain');
    if (base && def.helixCW == null && def.helixCCW == null) def = { ...def, helixCW: base.helixCW, helixCCW: base.helixCCW };
    if (base && def.approach == null && def.depart == null) def = { ...def, approach: base.approach, depart: base.depart };
  }
  const P = postProps(def, { ...(opts.legacy || {}), ...(opts.props || {}) });
  const o = lathe ? { x: 0, y: 0, z: stock.modelTop } : originOf(setup, stock);
  const W = new Writer({ ...def, lineNumbers: { ...(def.lineNumbers || {}), enabled: !!P.lineNumbers } });
  for (const [key] of SECTIONS) W.tag(def[key], key);
  // G18 / G19 arc templates from the XY ones (G2 X Y Z I J F → G2 X Z I K F in G18, G2 Y Z J K F in G19)
  W.plane = 17;
  const planeTpl = (() => {
    if (hh || lathe || !propApplies(POST_PROPS.find(p => p.key === 'planeArcs'), def)) return null;
    const ok = t => typeof t === 'string' && !t.includes('\n') && /\{I\}\{J\}/.test(t) && /\{X!?\}/.test(t) && /\{Y!?\}/.test(t) && /\{Z!?\}/.test(t);
    if (!ok(def.arcCW) || !ok(def.arcCCW)) return null;
    const mk = (t, pl) => {
      const s = t.replace(/\{([XYZ])!\}/g, '{$1}');
      return W.tag(pl === 18 ? s.replace('{X}', '{X!}').replace('{Z}', '{Z!}').replace('{I}{J}', '{I}{K}') : s.replace('{Y}', '{Y!}').replace('{Z}', '{Z!}').replace('{I}{J}', '{J}{K}'), t === def.arcCW ? 'arcCW' : 'arcCCW');
    };
    return { 18: [mk(def.arcCW, 18), mk(def.arcCCW, 18)], 19: [mk(def.arcCW, 19), mk(def.arcCCW, 19)] };
  })();
  W.tag(def.drillCycle, 'cycleDrill'); W.tag(def.drillPoint, 'cyclePoint');
  const machine = opts.machine;
  const warnings = [];
  const clean = v => ascii(v).replace(/[^A-Za-z0-9_]/g, '_');
  const safe = stock.top + +setup.safeZ;
  const clear = stock.top + +setup.retract;
  const base = {
    project: project.name, setup: setup.name, orientation: orientationLabel(setup), origin: originLabel(setup), machine: machine?.name || '',
    pgm: (opts.programName ? clean(opts.programName) : setup.programName ? clean(setup.programName) : (clean(project.name).slice(0, 12) || 'WERKFAB') + '_' + clean(setup.name).slice(0, 8)).toUpperCase(),
    maxrpm: String(Math.round(+machine?.maxRpm || 3000)),
    prognum: String(Math.max(1, Math.round(+(opts.programNumber ?? setup.programNumber)) || 1000)),
    wcs: 'G' + (53 + Math.min(6, Math.max(1, Math.round(+setup.wcsOffset) || 1))),
    wcsh: String(Math.max(1, Math.round(+setup.wcsOffset) || 1)),
    comment: (opts.comment ?? setup.comment) ? ' - ' + ascii(String(opts.comment ?? setup.comment)).replace(/[()]/g, '') : '',
    date: new Date().toLocaleString('de-DE'),
    stockx: stock.maxX - stock.minX, stocky: stock.maxY - stock.minY, stockz: stock.top - stock.bottom,
    sminx: stock.minX - o.x, sminy: stock.minY - o.y, sminz: stock.bottom - o.z,
    smaxx: stock.maxX - o.x, smaxy: stock.maxY - o.y, smaxz: stock.top - o.z,
    safe: safe - o.z,
    safex: lathe ? 2 * (stock.r + 2) : 0, safez: lathe ? stock.top + (+setup.safeZ || 5) - o.z : 0,
    // lathe: where the turret indexes (work coordinates)
    tcx: lathe ? (+P.tcX > 0 ? +P.tcX : 2 * (stock.r + 2) + 200) : 0, tcz: lathe ? (+P.tcZ > 0 ? +P.tcZ : stock.top + (+setup.safeZ || 5) - o.z + 100) : 0,
  };
  if (lathe && !def.lathe) warnings.push('Dreh-Setup mit Fräs-Postprozessor – bitte einen Dreh-Postprozessor wählen.');
  if (!lathe && def.lathe) warnings.push('Fräs-Setup mit Dreh-Postprozessor – bitte einen Fräs-Postprozessor wählen.');

  // ---- coolant per operation ----
  const coolCodes = { flood: [P.coolFlood], mist: [P.coolMist], air: [P.coolAir], airThrough: [P.coolAirThrough], through: [P.coolThrough], floodAir: [P.coolFlood, P.coolAir] };
  const offCodes = mode => (mode === 'air' || mode === 'airThrough' ? [P.coolAirOff] : mode === 'floodAir' ? [...new Set([P.coolOff, P.coolAirOff])] : [P.coolOff]);
  const defaultCool = opts.coolant ? 'flood' : 'off';
  let cool = 'off', turnLabel = 9000, lastRough = null, liveMode = false, liveWarned = false;
  // cutting edge geometry: a finishing cycle may follow the roughing contour only with the same nose
  const edgeSig = t => JSON.stringify([t.kind, +t.noseRadius || 0, +t.insertAngle || 0, +t.leadAngle || 0, +t.angle || 0, +t.edgeLen || 0, +t.width || 0, !!t.internal]);
  const setCoolant = mode => {
    if (mode === cool) return;
    if (cool !== 'off') for (const c of offCodes(cool)) if (c) W.expand(c);
    if (mode !== 'off') for (const c of coolCodes[mode] || []) if (c) W.expand(c);
    cool = mode;
  };

  // ---- tilted working plane for setups not machined from the top ----
  // 4-axis simultaneous: the setup orientation is how the part is clamped along the A axis, not a swivelled plane
  const rotarySetup = gen.ops.some(op => results.get(op.id)?.rotary);
  const tilt = lathe || rotarySetup ? { identity: true } : tiltAngles(setup, P.preferTilt);
  // Heidenhain with a swivelled plane: every retract outside the plane goes up the tool axis in machine
  // coordinates (a height above the datum means nothing before the plane is active)
  const hhTilt = hh && !tilt.identity && P.tiltedPlane !== 'off';

  const okuma = /^okuma/.test(String(def.id)) || /^O\{prognum\}\n[\s\S]*G15 H/.test(String(def.header || ''));
  if (okuma && !lathe && (P.safeRetract === 'g28' || P.safeRetract === 'g53' || P.homeXY)) warnings.push('Okuma OSP: G28/G53 fahren dort nicht auf Maschinenkoordinaten (G53 hebt die Werkzeuglängenkorrektur auf) – Rückzug auf Sicherheitshöhe, keine XY-Referenzfahrt ausgegeben');
  if (okuma && !lathe && P.smoothing !== 'off') warnings.push('Okuma OSP: keine Glättungsfunktion ausgegeben (G5.1 ist Fanuc) – Hi-Cut/Super-NURBS an der Maschine einstellen');
  // ---- retract templates (M91 / M140 / G28 / G53) ----
  const retractTpl = tpl => {
    if (!tpl) return tpl;
    let t = String(tpl);
    if (hh) {
      if (P.safeRetract === 'm91') t = t.replace(/^L Z\{safe\} R0 FMAX/gm, `L Z${W.num(+P.m91Z || 0)} R0 FMAX M91`);
      if (P.useM140 || hhTilt) t = t.replace(/^L Z\{safe\} R0 FMAX( M5)?$/gm, (_, m5) => `M140 MB MAX${m5 || ''}`).replace(/^(L Z[^\n]*? M91)( M5)?$/gm, (_, l, m5) => `M140 MB MAX${m5 || ''}`);
      if (P.toolAsName) t = t.replace(/TOOL CALL \{t\}/g, 'TOOL CALL {tcall}');
    } else if (!lathe) {
      // Okuma OSP: G28 is no reference return and G53 cancels the tool length offset – the clearance height stays.
      // Sinumerik: machine coordinates with SUPA, tool offset off (the next tool call selects D1 again)
      if (okuma) { /* see the warning below */ }
      else if (fam === 'sinumerik') { if (P.safeRetract === 'g28' || P.safeRetract === 'g53') t = t.replace(/^G0 Z\{safe\}$/gm, 'G0 SUPA Z0 D0'); }
      else if (P.safeRetract === 'g28') t = t.replace(/^G0 Z\{safe\}$/gm, 'G91 G28 Z0\nG90');
      else if (P.safeRetract === 'g53') t = t.replace(/^G0 Z\{safe\}$/gm, 'G53 G0 Z0');
    }
    return t;
  };
  const tcFirst = W.tag(retractTpl(def.toolChangeFirst ?? def.toolChange), def.toolChangeFirst ? 'toolChangeFirst' : 'toolChange'), tcNext = W.tag(retractTpl(def.toolChange), 'toolChange');
  let footer = W.tag(retractTpl(def.footer), 'footer');

  // built-in and imported posts write G54 / O1000: use the setup's WCS offset and program number
  const header = W.tag(String(def.header || '').replace(/\bG54\b/g, '{wcs}').replace(/^O1000$/m, 'O{prognum}'), 'header');
  const ops = activeOps(project, results, gen.ops).filter(op => !opts.opIds || opts.opIds.includes(op.id));
  W.expand(header, { ...base, coolanton: '', coolantoff: '' });
  if (P.writeMachine && machine) W.expand(`# Maschine: ${machine.name}`);
  if (P.writeVersion) W.expand('# WerkFab CAD/CAM 1.0');
  if (P.writeToolList) {
    const used = [...new Map(ops.filter(op => results.get(op.id).tool).map(op => [results.get(op.id).tool.id, results.get(op.id).tool])).values()];
    if (used.length) W.expand(W.tag(def.toolListHead ?? TOOL_LIST.toolListHead, 'toolListHead'), base);
    // deepest Z of each tool in program coordinates (milling only, not on tilted planes or rotary ops)
    const zMin = new Map();
    if (!lathe && tilt.identity) for (const op of ops) {
      const r = results.get(op.id);
      if (!r.tool || r.rotary) continue;
      let z = zMin.get(r.tool.id) ?? Infinity;
      for (const m of r.moves || []) if (Number.isFinite(m.z) && m.z < z) z = m.z;
      if (op.type === 'drill' && Number.isFinite(r.cycle?.bottom)) z = Math.min(z, r.cycle.bottom);
      zMin.set(r.tool.id, z);
    }
    const line = def.toolListLine ?? (lathe ? '# T{t} {toolname}' : TOOL_LIST.toolListLine);
    for (const t of used) {
      const z = zMin.get(t.id), ok = Number.isFinite(z);
      // no depth known (lathe, tilted plane, rotary): drop "{zmin}" together with the word in front of it ("Zmin")
      const tpl = ok ? line : String(line).replace(/[ \t]*(\S+[ \t]+)?\{zmin\}/g, '');
      W.expand(W.tag(tpl, 'toolListLine'), { ...base, t: String(t.number), toolname: t.name, tooldia: String(+(+t.dia).toFixed(3)), zmin: ok ? W.num(z - o.z) : '' });
    }
  }
  // Heidenhain: depth (DL) and side allowance (DR) of every operation as Q parameters, set at the machine
  const qOf = new Map();
  if (hh && P.qParams && !lathe) {
    let q = Math.max(1, Math.round(+P.qBase) || 50);
    for (const op of ops) {
      const r = results.get(op.id);
      if (!r || r.manual || r.error || op.type === 'probe' || !r.tool) continue;
      qOf.set(op.id, [q, q + 1]);
      const nm = ascii(String(op.name || op.type)).replace(/[;~]/g, ' ').toUpperCase().slice(0, 40);
      W.expand(`FN 0: Q${q} = +0 ; TIEFE ${nm} (+ = WENIGER TIEF)`);
      W.expand(`FN 0: Q${q + 1} = +0 ; AUFMASS ${nm} (+ = MEHR)`);
      q += 2;
    }
  }
  // tool check with the tool touch probe (TT): after the change, and a breakage check after the last use
  const ttCycle = (no, check) => `TCH PROBE ${no} ${no === 483 ? 'WERKZEUG MESSEN' : 'WERKZEUG-LAENGE'} ~\n  Q340=+${check} ;PRUEFEN ~\n  Q260=${W.num(+P.ttSafe || 100)} ;SICHERE HOEHE ~\n  Q341=+${P.ttTeeth ? 1 : 0} ;SCHNEIDENVERMESSUNG`;
  const cutOps = ops.filter(op => { const r = results.get(op.id); return r && !r.manual && !r.error && r.tool && op.type !== 'probe'; });
  const lastOfTool = new Set(cutOps.filter((op, k) => results.get(cutOps[k + 1]?.id)?.tool?.id !== results.get(op.id).tool.id).map(op => op.id));
  if (hh && P.tcpm && !lathe) W.expand(P.tcpmCode === 'm128' ? 'M128' : 'FUNCTION TCPM F TCP AXIS POS PATHCTRL AXIS');

  let planeOn = false, kinWarned = false, rotWarned = false;
  const rotFeed = P.rotaryFeed || 'mm';
  // rotary axes of the machine (cycle 19 computes their angles into Q120…Q122 but does not move them)
  const rotAxes = { A: ['A'], AC: ['A', 'C'], BC: ['B', 'C'] }[machine?.kin?.type] || null;
  const QROT = { A: 120, B: 121, C: 122 };
  // Sinumerik: CYCLE800(retract, swivel data record, new plane, axis by axis X-Y-Z, datum shift, angles, shift after, direction, …)
  const sinuSwivel = fam === 'sinumerik' && !tilt.identity && P.swivel !== 'off';
  const c800n = v => String(+(+v).toFixed(3) + 0);
  const c800 = (a, b, c) => `CYCLE800(${+P.swivelRetract || 0},"${ascii(P.swivelRecord || '').replace(/[^\w.-]/g, '')}",200000,57,0,0,0,${c800n(a)},${c800n(b)},${c800n(c)},0,0,0,${P.preferTilt === 'pos' ? 1 : -1},100,1)`;
  // Clear of the part before the rotary axes move (and after they came back): Z to the top in machine
  // coordinates first, then X/Y to the place chosen in the post processor – never both at once.
  const clearOut = () => {
    if (lathe || okuma || !['heidenhain', 'sinumerik', 'fanuc'].includes(fam) || (P.clearMove || 'zxy') === 'off') return;
    const xy = P.clearMove !== 'z', cx = P.clearXY === 'custom' ? +P.clearX || 0 : 0, cy = P.clearXY === 'custom' ? +P.clearY || 0 : 0, cz = +P.clearZ || 0;
    if (hh) { W.expand(`L Z${W.num(+P.m91Z || 0)} R0 FMAX M91`); if (xy) W.expand(`L X${W.num(cx)} Y${W.num(cy)} R0 FMAX M91`); }
    else if (fam === 'sinumerik') { W.expand(`G0 SUPA Z${c800n(cz)} D0`); if (xy) W.expand(`G0 SUPA X${c800n(cx)} Y${c800n(cy)}`); W.expand('D1'); }
    else { W.expand(`G53 G0 Z${c800n(cz)}`); if (xy) W.expand(`G53 G0 X${c800n(cx)} Y${c800n(cy)}`); }
    W.resetModal();
  };
  const planeStart = () => {
    if (tilt.identity || planeOn) return;
    if (hh && P.tiltedPlane !== 'off') clearOut();
    if (hh && P.tiltedPlane === 'spatial') W.expand(`PLANE SPATIAL SPA${W.num(tilt.a)} SPB${W.num(tilt.b)} SPC${W.num(tilt.c)} TURN MB MAX FMAX${tilt.seq ? ' SEQ' + tilt.seq : ''} TABLE ROT`);
    else if (hh && P.tiltedPlane === 'cycle19') {
      W.expand(`CYCL DEF 19.0 BEARBEITUNGSEBENE\nCYCL DEF 19.1 A${W.num(tilt.a)} B${W.num(tilt.b)} C${W.num(tilt.c)}`);
      if (rotAxes) W.expand(`L ${rotAxes.map(a => `${a}+Q${QROT[a]}`).join(' ')} R0 FMAX`);
      else {
        W.expand('# Drehachsen positionieren, z. B. L A+Q120 C+Q122 R0 FMAX (Achsen der Maschine)');
        if (!kinWarned) warnings.push('Zyklus 19 schwenkt nur das Koordinatensystem: ohne Maschine mit Kinematik (A, A/C oder B/C) werden die Drehachsen nicht positioniert – Maschine wählen oder PLANE SPATIAL verwenden');
        kinWarned = true;
      }
    }
    else if (sinuSwivel) W.expand(c800(tilt.sa, tilt.sb, tilt.sc));
    else { warnings.push(`Setup „${setup.name}“ ist geschwenkt – dieser Postprozessor gibt keine Schwenkebene aus. Werkstück entsprechend aufspannen.`); planeOn = true; return; }
    planeOn = true;
  };
  // final = end of the program: the rotary axes go back to zero; before a tool change they stay
  const planeEnd = final => {
    if (planeOn && sinuSwivel) {
      // end of the program: swivel back to zero first; CYCLE800() then switches the swivel frames off
      if (final) W.expand(c800(0, 0, 0));
      W.expand('CYCLE800()');
      planeOn = false;
      W.resetModal();
      return;
    }
    if (!planeOn || tilt.identity || !hh) return;
    W.expand('M140 MB MAX');
    clearOut();
    if (P.tiltedPlane === 'spatial') W.expand(final ? 'PLANE RESET TURN MB MAX FMAX' : 'PLANE RESET STAY');
    else if (P.tiltedPlane === 'cycle19') {
      W.expand(`CYCL DEF 19.0 BEARBEITUNGSEBENE\nCYCL DEF 19.1 A${W.num(0)} B${W.num(0)} C${W.num(0)}\nCYCL DEF 19.0 BEARBEITUNGSEBENE\nCYCL DEF 19.1`);
      if (final && rotAxes) W.expand(`L ${rotAxes.map(a => `${a}${W.num(0)}`).join(' ')} R0 FMAX`);
    }
    planeOn = false;
    W.resetModal();
  };

  // ---- smoothing ----
  let smoothOn = false;
  const smoothFor = op => {
    if (P.smoothing === 'off' || ['drill', 'probe'].includes(op.type) || lathe) return null;
    if (P.smoothing === 'auto') return ROUGH_OPS.includes(op.type) ? { tol: 0.05, rough: true } : { tol: 0.01, rough: false };
    return { tol: SMOOTH_TOL[P.smoothing] || 0.02, rough: P.smoothing === 'low' };
  };
  const smoothStart = sm => {
    if (!sm) { smoothReset(); return; }
    if (hh) W.expand(`CYCL DEF 32.0 TOLERANZ\nCYCL DEF 32.1 T${W.num(sm.tol)}\nCYCL DEF 32.2 HSC-MODE:${sm.rough ? 1 : 0}`);
    else if (fam === 'fanuc' && !okuma) W.expand('G5.1 Q1');
    else if (fam !== 'sinumerik') return;
    else if (fam === 'sinumerik') W.expand(`CYCLE832(${sm.tol},${sm.rough ? '_ROUGH' : '_FINISH'},1)`);
    smoothOn = true;
  };
  const smoothReset = () => {
    if (!smoothOn) return;
    if (hh) W.expand('CYCL DEF 32.0 TOLERANZ\nCYCL DEF 32.1');
    else if (fam === 'fanuc' && !okuma) W.expand('G5.1 Q0');
    else if (fam === 'sinumerik') W.expand('CYCLE832(0,_OFF,1)');
    smoothOn = false;
  };

  const labels = [], labelOf = new Map();
  let tool = null, totalTime = 0, codeWarned = false;

  // ---- several parts in one clamping: datum shift (or own datum) per part ----
  const MP = setup.multi;
  let multi = !lathe && MP?.on && Array.isArray(MP.list) && MP.list.length > 1 ? MP : null;
  const sinuWcs = n => (n <= 4 ? `G${53 + n}` : `G${500 + n}`);
  const wcsWord = n => {
    n = Math.max(1, Math.round(+n) || 1);
    if (hh) return `CYCL DEF 247 BEZUGSPUNKT SETZEN ~\n  Q339=+${n} ;BEZUGSPUNKT-NUMMER`;
    if (okuma) return `G15 H${n}`;
    if (fam === 'sinumerik') return sinuWcs(n);
    if (n <= 6) return `G${53 + n}`;
    if (fam === 'fanuc') return `G54.1 P${n - 6}`;
    if (fam === 'linuxcnc' && n <= 9) return `G59.${n - 6}`;
    return null;
  };
  const shiftWord = p => {
    const x = W.num(+p.x || 0), y = W.num(+p.y || 0), z = W.num(+p.z || 0);
    if (hh) return `CYCL DEF 7.0 NULLPUNKT\nCYCL DEF 7.1 X${x}\nCYCL DEF 7.2 Y${y}\nCYCL DEF 7.3 Z${z}`;
    if (fam === 'sinumerik') return +p.x || +p.y || +p.z ? `TRANS X${x} Y${y} Z${z}` : 'TRANS';
    if (okuma || fam === 'grbl') return null;
    return `G52 X${x} Y${y} Z${z}`;
  };
  if (multi) {
    const bad = multi.list.map((p, k) => (multi.mode === 'wcs' ? wcsWord(p.wcs) : shiftWord(p)) ? null : k + 1).filter(Boolean);
    if (bad.length) { warnings.push(multi.mode === 'wcs' ? `Mehrfachaufspannung: Nullpunkt von Teil ${bad.join(', ')} gibt es an dieser Steuerung nicht – nur ein Teil ausgegeben` : 'Mehrfachaufspannung: Nullpunktverschiebung gibt es in diesem Postprozessor nicht – „Eigener Nullpunkt je Teil“ wählen; nur ein Teil ausgegeben'); multi = null; }
  }
  const partSelect = k => {
    const p = multi.list[k];
    W.expand('# ' + `Teil ${k + 1} von ${multi.list.length}`);
    W.expand(multi.mode === 'wcs' ? wcsWord(p.wcs) : shiftWord(p));
    W.resetModal();
  };
  const partReset = () => {
    W.expand(multi.mode === 'wcs' ? wcsWord(setup.wcsOffset || 1) : shiftWord({ x: 0, y: 0, z: 0 }));
    W.resetModal();
  };
  // up to the safe height before the datum changes (the tool must not cross the next part at the retract height)
  const retractSafe = () => {
    W.resetModal();
    W.expand(W.tag(String(def.rapid || 'G0{Z}').replace(/\{[XY]!?\}/g, '').replace('{Z}', '{Z!}'), 'rapid'), base, { x: null, y: null, z: safe - o.z });
  };
  const multiTool = multi && multi.order !== 'part';
  const tcallOf = t => (hh && P.toolAsName ? `"${ascii(t.name).split('"').join('').toUpperCase().slice(0, 32)}"` : String(t.number));
  // after a program stop the spindle and the coolant are switched on again by the next operation
  let respin = false;
  // part: index in the clamping (an operation with one toolpath per part – serial numbers – takes that part's path)
  const emitOp = (op, oi, part = null) => {
    W.curOp = op.name || op.id;
    const r0 = results.get(op.id), r = part != null && r0.parts ? r0.parts[part] || r0 : r0;
    const own = !!(multi && r0.parts), sub = own && multiTool && part != null && part > 0;
    // ---- manual NC: lines without a toolpath ----
    if (r.manual) {
      const mn = r.manual, plain = x => String(x).replace(/[{}]/g, '');
      totalTime += r.time || 0;
      const rawLine = text => W.out.push({ text, src: null });
      if (mn.kind === 'comment') for (const line of plain(mn.text).split('\n')) W.expand('# ' + line);
      else if (mn.kind === 'stop' || mn.kind === 'optstop') {
        if (mn.text) for (const line of plain(mn.text).split('\n')) W.expand('# ' + line);
        rawLine(mn.kind === 'stop' ? 'M0' : 'M1');
        if (mn.kind === 'stop') { respin = tool !== null; cool = 'off'; }
      } else if (mn.kind === 'dwell') {
        if (def.dwell) W.expand(def.dwell, { ...base, dwell: mn.sec, dwellms: String(Math.round(mn.sec * 1000)) });
        else warnings.push(`${op.name}: Dieser Postprozessor hat keine Vorlage für die Verweilzeit – übersprungen`);
      } else if (mn.kind === 'message') {
        const txt = ascii(plain(mn.text)).replace(/[()\x22\n]/g, ' ').trim();
        if (fam === 'sinumerik') rawLine('MSG(' + JSON.stringify(txt) + ')');
        else if ((fam === 'fanuc' && !okuma) || /linuxcnc/.test(String(def.id))) rawLine('(MSG, ' + txt + ')');
        else W.expand('# ' + txt);
      } else if (mn.kind === 'code') {
        for (const line of String(mn.text).split('\n')) if (line.trim()) rawLine(line.trim());
        W.resetModal();
        if (!codeWarned) warnings.push('Durchgereichter NC-Code wird unverändert ausgegeben und nicht geprüft – er muss zur Steuerung passen und darf das Werkzeug nicht in eine unbekannte Lage bringen');
        codeWarned = true;
      }
      return;
    }
    const t = r.tool;
    const probe = op.type === 'probe';
    totalTime += r.time;
    let rpm = Math.round(t.rpm);
    if (machine?.maxRpm && rpm > machine.maxRpm) { warnings.push(`${op.name}: Drehzahl ${rpm} > Maschinenmaximum ${machine.maxRpm} – begrenzt`); rpm = machine.maxRpm; }
    const tv = { ...base, coolanton: '', coolantoff: '', tt: String(t.number).padStart(2, '0').repeat(2), tt6: String(t.number).padStart(2, '0').repeat(3),t: String(t.number), tcall: tcallOf(t), toolname: t.name, tooldia: String(+(+t.dia).toFixed(3)), rpm: String(probe ? 0 : rpm), opname: op.name, optype: OP_TYPES[op.type] };
    const toolChanged = tool !== t.id;
    // driven tool on the lathe (spindle as C axis): switched off before a tool change and before turning again
    const live = lathe && !!r.live, wasLive = liveMode;
    if (liveMode && (!live || toolChanged)) { if (def.liveOff) W.expand(W.tag(def.liveOff, 'liveOff'), tv); liveMode = false; W.resetModal(); }
    if (toolChanged) {
      smoothReset();
      setCoolant('off');
      if (tool !== null) planeEnd(false); // tool change in the untilted system
      if (tool !== null && P.optionalStop) W.expand('M1');
    }
    if (P.structureComments !== false) W.expand(def.opStart, tv);
    if (P.showNotes && op.note) for (const line of String(op.note).split('\n')) W.expand('# ' + line);
    if (toolChanged) {
      let tpl = tool === null ? tcFirst : tcNext;
      // the tool name often carries the diameter already ("Schaftfräser Ø6"): no second D6 behind it
      if (ascii(String(t.name)).replace(',', '.').includes('D' + tv.tooldia)) tpl = W.tag(String(tpl || '').replace(' D{tooldia}', ''), tool === null && def.toolChangeFirst ? 'toolChangeFirst' : 'toolChange');
      if (probe) tpl = W.tag(String(tpl || '').replace(/ M3\b/g, '').replace(/ S\{rpm\}/g, ''), 'toolChange'); // no spindle for the touch probe
      // after the change the tool first goes over the start point of the operation in X/Y, then down to the
      // safe height: never straight down from the change position
      const start = !lathe && !probe && !r.rotary && tilt.identity ? r.moves.find(m => Number.isFinite(m.x) && Number.isFinite(m.y)) : null;
      if (start) {
        const tcKey = tool === null && def.toolChangeFirst ? 'toolChangeFirst' : 'toolChange';
        const ls = String(tpl || '').split('\n');
        let call = -1;
        ls.forEach((l, i) => { if (/TOOL CALL|\bM0?6\b|\bM0?0\b|^T\{t/.test(l)) call = i; });
        const zAt = ls.findIndex((l, i) => i > call && /Z\{safe\}/.test(l));
        const head = zAt < 0 ? ls : ls.slice(0, zAt), tail = zAt < 0 ? [] : ls.slice(zAt);
        // Heidenhain: the spindle starts with the move over the part (M3 off the Z line)
        let spin = '';
        if (hh && tail.length && /\s(M3|M13)\s*$/.test(tail[0])) { spin = tail[0].match(/\s(M3|M13)\s*$/)[1]; tail[0] = tail[0].replace(/\s(M3|M13)\s*$/, ''); }
        if (head.length) W.expand(W.tag(head.join('\n'), tcKey), tv);
        W.resetModal();
        const xyTpl = hh ? `L{X!}{Y!} R0 FMAX${spin ? ' ' + spin : ''}` : String(def.rapid || 'G0{X}{Y}{Z}').replace(/\{X\}/, '{X!}').replace(/\{Y\}/, '{Y!}');
        W.expand(W.tag(xyTpl, 'rapid'), tv, { x: start.x - o.x, y: start.y - o.y, z: null });
        const st = { ...W.st };
        if (tail.length) W.expand(W.tag(tail.join('\n'), tcKey), tv);
        W.resetModal();
        // X/Y are known now (and Z when the template went to the safe height): the path does not repeat them
        W.st.X = st.X; W.st.Y = st.Y;
        if (tail.length) W.st.Z = W.num(safe - o.z);
      } else {
        W.expand(tpl, tv);
        W.resetModal();
      }
      if (!probe && !live) W.expand(def.spindleOn, tv);
      tool = t.id;
      if (P.preloadTool) {
        const next = ops.slice(oi + 1).map(x => results.get(x.id).tool).find(x => x && x.id !== t.id);
        if (next) W.expand(hh ? `TOOL DEF ${tcallOf(next)}` : `T${next.number}`);
      }
    } else if (def.resetModalPerOp) W.resetModal();
    if (lathe && !live && wasLive && !toolChanged) W.expand(def.spindleOn, tv);
    else if (respin && !toolChanged && !probe && !live) { if (def.spindleOn) W.expand(def.spindleOn, tv); else if (hh) W.out.push({ text: 'M3', src: null }); }
    respin = false;
    if (live && !liveMode) {
      if (def.liveOn) W.expand(W.tag(def.liveOn, 'liveOn'), tv);
      else warnings.push(`${op.name}: Postprozessor ohne Vorlage „C-Achse und angetriebenes Werkzeug ein“ – C-Achse und Werkzeugspindel von Hand einschalten`);
      if (!liveWarned) warnings.push('Angetriebene Werkzeuge: Die M-Codes für C-Achse und Werkzeugspindel sind maschinenabhängig – Vorlagen „C-Achse … ein/aus“ im Postprozessor mit dem Maschinenhandbuch vergleichen');
      liveWarned = true;
      liveMode = true;
      W.resetModal();
    }
    planeStart();

    // ---- touch probe cycles ----
    if (probe) {
      const pr = r.probe;
      const tpl = def[{ z: 'probeZ', bore: 'probeBore', boss: 'probeBoss', rectOut: 'probeRectOut', rectIn: 'probeRectIn' }[pr.mode]];
      if (!P.probeCycles) return;
      if (!tpl) { warnings.push(`${op.name}: Dieser Postprozessor hat keinen Tastzyklus für „${pr.mode}“ – übersprungen`); return; }
      const pv = {
        ...tv, cx: pr.x - o.x, cy: pr.y - o.y, z: pr.z - o.z, zmeas: pr.zMeas - o.z, dia: pr.dia || 0, w: pr.w || 0, l: pr.l || 0,
        sdist: pr.clearance, zclear: clear - o.z, zsafe: safe - o.z, zabove: pr.z + pr.clearance - o.z,
        preset: '+' + Math.round(+(op.probePreset ?? setup.wcsOffset ?? 1) || 0), transfer: (+(op.probeTransfer ?? 1) < 0 ? '' : '+') + Math.round(+(op.probeTransfer ?? 1)), wcsn: String(Math.round(+setup.wcsOffset || 1)), pfeed: String(Math.round(+P.probeFeed || 300)),
      };
      W.expand(tpl, pv);
      W.resetModal();
      return;
    }

    if (!probe) smoothStart(smoothFor(op));
    setCoolant(op.coolant || t.coolant || defaultCool);
    const maxF = machine?.maxFeed || Infinity;
    const feedOf = f => { if (f > maxF) { warnings.push(`${op.name}: Vorschub ${Math.round(f)} > Maschinenmaximum ${maxF} – begrenzt`); return maxF; } return f; };

    // the operation body may go into a subprogram
    const subs = hh && P.subroutines === 'ops';
    if (hh && !lathe && (qOf.has(op.id) || (toolChanged && P.toolCheck && P.toolCheck !== 'off'))) {
      // the TOOL CALL of this change (searched back from the end – it was written just now)
      let at = -1;
      if (toolChanged) for (let k = W.out.length - 1; k >= 0 && k >= W.out.length - 12; k--) if (/^TOOL CALL (\d+|"[^"]*") Z\b/.test(W.out[k].text)) { at = k; break; }
      const qq = sub ? null : qOf.get(op.id);
      if (qq) {
        const d = ` DL+Q${qq[0]} DR+Q${qq[1]}`;
        if (at >= 0) W.out[at].text += d;
        else W.out.push({ text: `TOOL CALL Z S${tv.rpm}${d}`, src: null, op: W.curOp });
      }
      if (at >= 0 && P.toolCheck && P.toolCheck !== 'off') {
        const n0 = W.out.length;
        W.expand(ttCycle(P.toolCheck === 'both' ? 483 : 481, 1));
        W.out.splice(at + 1, 0, ...W.out.splice(n0));
      }
    }
    if (multiTool) partSelect(sub ? part : 0);
    if (r0.serial) W.expand('# ' + `Seriennummer ${r0.serial[part ?? 0] ?? r0.serial[0]}`);
    const mark = W.out.length;
    if (subs) W.resetModal();

    // parametric feeds: one Q parameter per feed of the operation
    W.qfeed = null;
    const willCycle = op.type === 'drill' && r.cycle && (P.cycles ?? def.useDrillCycle) && (def[CYCLE_KEYS[r.cycle.type === 'tap' && r.cycle.left ? 'tapLeft' : r.cycle.type || 'drill']] || def.drillCycle);
    if (hh && P.parametricFeed && !willCycle) {
      const feeds = [...new Set(r.moves.filter(m => m.t !== 'r' && !m.dwell && m.f).map(m => Math.round(feedOf(m.f))))].sort((a, b) => a - b);
      if (feeds.length) {
        W.qfeed = new Map(feeds.map((f, i) => [f, i + 1]));
        feeds.forEach((f, i) => W.expand(`FN 0: Q${i + 1} = +${f} ; VORSCHUB ${i === 0 && feeds.length > 1 ? 'EINTAUCHEN' : i === feeds.length - 1 ? 'SCHNEIDEN' : i + 1}`));
      }
    }

    const c = op.type === 'drill' ? r.cycle : null;
    const ctype = c ? (c.type === 'tap' && c.left ? 'tapLeft' : c.type || 'drill') : null;
    const cycleTpl = c && (def[CYCLE_KEYS[ctype]] || (['drill', 'dwell', 'peck'].includes(ctype) ? def.drillCycle : ''));
    const pointTpl = def.cyclePoint || def.drillPoint;
    let done = false;
    if (c && !(c.top - c.bottom > 1e-6)) warnings.push(`${op.name}: Bohrzyklus nicht möglich (Tiefe 0) – als Bahn ausgegeben`);
    if (c && c.top - c.bottom > 1e-6 && (P.cycles ?? def.useDrillCycle) && cycleTpl && pointTpl) {
      const depth = c.bottom - c.top;
      const cv = {
        ...tv, ztop: c.top - o.z, zbottom: c.bottom - o.z, rplane: (c.clear ?? clear) - o.z, depth, f: feedOf(c.feed), dfeed: feedOf(c.feed),
        peck: c.peck > 0 ? c.peck : Math.abs(depth), zfirst: c.top - o.z - (c.peck > 0 ? c.peck : Math.abs(depth)),
        dwell: c.dwell || 0, dwellms: String(Math.round((c.dwell || 0) * 1000)), pitch: c.pitch || 0, pitchsigned: (c.left ? -1 : 1) * (c.pitch || 0),
        sdis: Math.max(0.5, clear - c.top), q200: Math.max(0.5, clear - c.top), dtop: c.top - o.z, q204: safe - c.top, vari: c.type === 'chip' ? '0' : '1',
      };
      const pos = ([x, y]) => ({ x: x - o.x, y: y - o.y, z: c.top - o.z, f: null, arc: true });
      const leftTap = ctype === 'tapLeft' && /\bG74\b/.test(cycleTpl);
      if (leftTap) W.expand(`M5\nS${tv.rpm} M4`);
      // bolt circles / grids as the control's pattern cycles (they call the cycle defined just before at each
      // hole); single holes first with the point template, so M99 surely calls the drilling cycle
      // the switch of the operation wins; without one the post property (default: single coordinates)
      const pats = (op.drillPattern ?? P.drillPatterns === true) && !def.cycleFirstInDef ? holePatterns(c.pts) : null;
      const patKey = pat => (pat.kind === 'circle' ? 'cyclePatternCircle' : 'cyclePatternGrid');
      if (pats && pats.groups.every(pat => def[patKey(pat)])) {
        W.expand(cycleTpl, cv);
        for (const pt of pats.singles) W.expand(pointTpl, cv, pos(pt));
        for (const pat of pats.groups) {
          const pvv = pat.kind === 'circle'
            ? { pcx: pat.cx - o.x, pcy: pat.cy - o.y, pdia: 2 * pat.r, prad: pat.r, pa0: pat.a0, pa1: pat.a1, pastep: pat.step, pn: String(pat.n) }
            : { gx: pat.x - o.x, gy: pat.y - o.y, gd1: pat.d1, gd2: pat.d2, gnc: String(pat.nc), gnr: String(pat.nr), gang: pat.ang };
          W.expand(W.tag(def[patKey(pat)], patKey(pat)), { ...cv, ...pvv });
        }
      } else if (def.cycleFirstInDef) {
        W.expand(cycleTpl, cv, pos(c.pts[0]));
        for (const pt of c.pts.slice(1)) W.expand(pointTpl, cv, { ...pos(pt), arc: false });
      } else {
        W.expand(cycleTpl, cv);
        for (const pt of c.pts) W.expand(pointTpl, cv, pos(pt));
      }
      W.expand(def.cycleEnd, cv);
      if (leftTap) { W.expand('M5'); W.expand(def.spindleOn || 'S{rpm} M3', tv); }
      W.resetModal();
      done = true;
    }
    // pocket / stud as the control's cycle (rectangle, circle, slot): Heidenhain defines it once per shape and
    // calls it at the centre (M99); Sinumerik-style calls carry the centre themselves ({px}/{py})
    const studOp = op.type === 'contour';
    // any contour / pocket with islands as the control's SL cycles: the outlines as subprograms (LBL) after the
    // end of the program, in Heidenhain plain language with the compensation that tells pocket from island
    if (!done && hh && !lathe && op.ctrlCycle && ((studOp && !r.studCycle && r.contourCycle) || (op.type === 'pocket' && !r.pocketCycle && r.slCycle))) {
      const cc = studOp ? r.contourCycle : r.slCycle;
      const keys = studOp ? ['cycleContourList', 'cycleContourTrain'] : ['cycleContourList', 'cycleSLData', 'cycleSLClear'];
      if (keys.every(k => def[k]) && cc.top - cc.bottom > 1e-6) {
        const hn = v => { const t = W.num(v); return /^[+-]/.test(t) ? t : '+' + t; };
        // one closed outline: L … RL/RR at its start, then lines and arcs (CC + C DR±) back to the start
        const contourBody = (loop, comp) => {
          const pts = loop.map(([x, y]) => ({ t: 'f', x: x - o.x, y: y - o.y, z: 0, f: 1 }));
          pts.push({ ...pts[0] });
          const mv = fitArcs([{ t: 'r', ...pts[0] }, ...pts.slice(1)], 0.005, false);
          const rows = [{ text: `L X${hn(pts[0].x)} Y${hn(pts[0].y)} R${comp}` }];
          for (const m of mv.slice(1)) {
            if (m.t === 'a') rows.push({ text: `CC X${hn(m.cx)} Y${hn(m.cy)}` }, { text: `C X${hn(m.x)} Y${hn(m.y)} DR${m.cw ? '-' : '+'}` });
            else rows.push({ text: `L X${hn(m.x)} Y${hn(m.y)}` });
          }
          return rows;
        };
        const lbls = [];
        const addLabel = (name, body) => { const n = labels.length + 1; labels.push({ n, name, body }); lbls.push(n); };
        if (studOp) cc.loops.forEach((l, k) => addLabel(`${op.name} – Kontur ${k + 1}`, contourBody(l, cc.comp)));
        else cc.regions.forEach((rg, k) => {
          // pocket: described inside (counter-clockwise with RL); island: outside (counter-clockwise with RR)
          addLabel(`${op.name} – Tasche ${k + 1}`, contourBody(rg.outer, 'L'));
          rg.islands.forEach((isl, j) => addLabel(`${op.name} – Insel ${k + 1}.${j + 1}`, contourBody(isl, 'R')));
        });
        const v = {
          ...tv, labels: lbls.join(' /'), depth: cc.bottom - cc.top, stl: cc.stl || 0, dtop: cc.top - o.z, zsafe: safe - o.z, q200: Math.max(0.5, (cc.clear ?? clear) - cc.top),
          plungedepth: -Math.max(0.01, Math.min(cc.stepdown || (cc.top - cc.bottom), cc.top - cc.bottom)), dfeed: String(Math.round(feedOf(cc.plunge))), pfeed: String(Math.round(feedOf(cc.feed))),
          climb: cc.climb === false ? '-1' : '+1', overlap: +(cc.overlap ?? 1).toFixed(4),
        };
        for (const k of keys) W.expand(W.tag(def[k], k), v);
        W.resetModal();
        done = true;
      }
    }
    if (!done && (op.type === 'pocket' || op.type === 'slot' || studOp) && op.ctrlCycle) {
      const pc = studOp ? r.studCycle : r.pocketCycle, why = studOp ? r.studCycleWhy : r.pocketCycleWhy;
      const keyOf = s => (studOp ? (s.kind === 'circ' ? 'cycleStudCirc' : 'cycleStudRect')
        : s.kind === 'circ' ? 'cyclePocketCirc' : s.kind === 'slot' && def.cyclePocketSlot ? 'cyclePocketSlot' : 'cyclePocketRect');
      const what = studOp ? 'Zapfenzyklus' : op.type === 'slot' ? 'Nutzyklus' : 'Taschenzyklus';
      if (!pc) warnings.push(`${op.name}: Steuerungszyklus nicht möglich (${why || 'Form nicht erkannt'}) – als Bahn ausgegeben`);
      else if (!(pc.top - pc.bottom > 1e-6)) warnings.push(`${op.name}: Steuerungszyklus nicht möglich (Tiefe 0) – als Bahn ausgegeben`);
      else if (!pc.pockets.every(s => def[keyOf(s)] && (/\{px\}/.test(def[keyOf(s)]) || pointTpl))) warnings.push(`${op.name}: Postprozessor ohne ${what} für diese Form – als Bahn ausgegeben`);
      else {
        const sg = v => { const t = W.num(v).replace(/^\+/, ''); return (t.startsWith('-') ? '' : '+') + t; };
        const rT = pc.toolR || (+t.dia || 0) / 2;
        const pv = {
          ...tv, depth: pc.bottom - pc.top, stepdown: pc.stepdown, stl: pc.stl, pfeed: String(Math.round(feedOf(pc.feed))), dfeed: String(Math.round(feedOf(pc.plunge))),
          climb: pc.climb ? '+1' : '-1', cdir: pc.climb ? '0' : '1', overlap: +pc.overlap.toFixed(3), mida: +(pc.overlap * rT).toFixed(3),
          plungemode: pc.helix ? '1' : '0', slotplunge: pc.helix ? '1' : '0', vari: pc.helix ? '21' : '11',
          q200: Math.max(0.5, (pc.clear ?? clear) - pc.top), sdis: Math.max(0.5, (pc.clear ?? clear) - pc.top), dtop: pc.top - o.z, ztop: pc.top - o.z, zbottom: pc.bottom - o.z, q204: safe - pc.top,
        };
        let lastDef = null;
        for (const s of pc.pockets) {
          const key = keyOf(s), tpl = W.tag(def[key], key);
          const minHalf = s.kind === 'circ' ? s.d / 2 : Math.min(s.w, s.l) / 2;
          const rad1 = Math.max(0.5, Math.min(rT, minHalf - rT - 0.2));
          const v = {
            ...pv, plen1: s.w, plen2: s.l, pcr: s.rc || 0, pcrs: Math.max(s.rc || 0, rT), pang: sg(s.ang || 0), pangs: s.ang || 0, pdia: s.d, prad: (s.d || 0) / 2,
            blank1: (s.w || 0) + 2 * (s.blank || 0), blank2: (s.l || 0) + 2 * (s.blank || 0), pblank: (s.d || 0) + 2 * (s.blank || 0),
            px: s.cx - o.x, py: s.cy - o.y, rad1, dp1: Math.max(0.1, Math.min(pc.stepdown, 2 * Math.PI * rad1 * Math.tan(((pc.ramp || 3) * Math.PI) / 180))),
          };
          if (/\{px\}/.test(def[key])) { W.expand(tpl, v); continue; }
          const sig = key + JSON.stringify([s.w, s.l, s.rc, s.ang, s.d, s.blank]);
          if (sig !== lastDef) { W.expand(tpl, v); lastDef = sig; }
          W.expand(pointTpl, v, { x: s.cx - o.x, y: s.cy - o.y, z: pc.top - o.z, f: null, arc: true });
        }
        if (pc.pockets.some(s => !/\{px\}/.test(def[keyOf(s)]))) W.expand(def.cycleEnd, pv);
        W.resetModal();
        done = true;
      }
    }
    // bore milling, thread milling, face milling as the control's cycle: defined once per diameter, called at each
    // hole (face: once, the cycle knows its rectangle)
    if (!done && !lathe && op.ctrlCycle && ['face', 'bore', 'thread'].includes(op.type)) {
      const mc = r.millCycle, key = { face: 'cycleFace', bore: 'cycleBoreMill', thread: 'cycleThreadMill' }[op.type];
      const what = { face: 'Planfräszyklus', bore: 'Bohrfräszyklus', thread: 'Gewindefräszyklus' }[op.type];
      if (!mc) warnings.push(`${op.name}: Steuerungszyklus nicht möglich (${r.millCycleWhy || 'keine Zyklusdaten'}) – als Bahn ausgegeben`);
      else if (!def[key] || (mc.kind !== 'face' && !pointTpl)) warnings.push(`${op.name}: Postprozessor ohne ${what} – als Bahn ausgegeben`);
      else if (!(mc.top - mc.bottom > 1e-6)) warnings.push(`${op.name}: Steuerungszyklus nicht möglich (Tiefe 0) – als Bahn ausgegeben`);
      else {
        const tpl = W.tag(def[key], key);
        const base = {
          ...tv, q200: Math.max(0.5, (mc.clear ?? clear) - mc.top), sdis: Math.max(0.5, (mc.clear ?? clear) - mc.top), dtop: mc.top - o.z, ztop: mc.top - o.z, zbottom: mc.bottom - o.z,
          q204: safe - mc.top, depth: mc.bottom - mc.top, pfeed: String(Math.round(feedOf(mc.feed))), dfeed: String(Math.round(feedOf(mc.plunge))), climb: mc.climb === false ? '-1' : '+1',
        };
        if (mc.kind === 'face') {
          W.expand(tpl, { ...base, fx: mc.x - o.x, fy: mc.y - o.y, fstart: mc.top - o.z, fend: mc.bottom - o.z, flen: mc.len, fwid: mc.wid, stepdown: mc.stepdown, overlap: +mc.overlap.toFixed(4) });
        } else {
          let last = null;
          for (const hole of mc.holes) {
            const v = { ...base, hdia: hole.dia, pitch: mc.pitch, pitchsigned: (mc.right === false ? -1 : 1) * mc.pitch };
            const sig = JSON.stringify([hole.dia]);
            if (sig !== last) { W.expand(tpl, v); last = sig; }
            W.expand(pointTpl, v, { x: hole.x - o.x, y: hole.y - o.y, z: mc.top - o.z, f: null, arc: true });
          }
          W.expand(def.cycleEnd, base);
        }
        W.resetModal();
        done = true;
      }
    }
    // turning: roughing / threading as the control's cycle (the contour is part of the program)
    if (!done && lathe && op.ctrlCycle && ['trough', 'tthread'].includes(op.type)) {
      const tc = r.turnCycle, key = op.type === 'trough' ? 'cycleTurnRough' : 'cycleTurnThread';
      if (!tc) warnings.push(`${op.name}: Steuerungszyklus nicht möglich (${r.turnCycleWhy || 'keine Zyklusdaten'}) – als Bahn ausgegeben`);
      else if (!def[key]) warnings.push(`${op.name}: Postprozessor ohne Drehzyklus – als Bahn ausgegeben`);
      else {
        W.resetModal();
        const zz = z => z - o.z;
        if (tc.kind === 'rough') {
          if (tc.under) warnings.push(`${op.name}: Zyklus schruppt nur bis zur Hüllkontur – Hinterschnitt/Einstich bis ${String(+tc.under.toFixed(2)).replace('.', ',')} mm (Radius) bleibt stehen; vor dem Schlichten einstechen`);
          turnLabel += 10;
          const v = { ...tv, sx: 2 * tc.sx, sz: zz(tc.sz), ap: tc.ap, u: String(+(2 * (tc.u || 0)).toFixed(3)), f: String(Math.round(feedOf(tc.feed))), lap: String(turnLabel), ns: String(turnLabel), nf: String(turnLabel + 1) };
          // a finishing cycle later in the program takes its feed from the first contour block (the roughing
          // cycle ignores F there)
          let fin = null;
          for (const x of ops.slice(oi + 1)) {
            if (x.type === 'trough' && x.ctrlCycle) break;
            if (x.type === 'tfinish' && x.ctrlCycle) { fin = x; break; }
          }
          const [pre, post = ''] = String(def[key]).split(/\n?\{contour\}\n?/);
          W.expand(W.tag(pre, key), v);
          W.st.X = W.num(2 * tc.sx); W.st.Z = W.num(zz(tc.sz)); W.lastCode = null;
          const n0 = W.out.length, pts = tc.pts;
          // first block X only (Fanuc type I), then the contour from its start on the face to the chuck side
          W.expand(def.rapid, tv, { x: 2 * pts[0][0], z: zz(tc.sz), f: null });
          for (const [x, z] of pts) W.expand(def.linear, tv, { x: 2 * x, z: zz(z), f: null });
          const fill = tpl => String(tpl || '').replace(/\{(\w+)\}/g, (_, n) => v[n] ?? '');
          if (W.out.length > n0) {
            W.out[n0].text = fill(def.contourFirst) + W.out[n0].text;
            if (fin && def.cycleTurnFinish) W.out[n0].text += ` F${Math.round(feedOf(results.get(fin.id).tool.feed))}`;
            if (W.out.length - 1 > n0) W.out[W.out.length - 1].text = fill(def.contourLast) + W.out[W.out.length - 1].text;
          }
          if (post) W.expand(W.tag(post, key), v);
          lastRough = { ...v, sxr: tc.sx, szr: tc.sz, sig: edgeSig(t), zEnd: op.zEnd ?? '', under: tc.under, op: op.name };
        } else {
          const v = {
            ...tv, tsx: 2 * tc.sx, tsz: zz(tc.sz), tx: 2 * tc.xEnd, tz: zz(tc.ze), th: tc.h, td: tc.d1, pitch: tc.pitch,
            thu: String(Math.round(tc.h * 1000)), tdu: String(Math.round(tc.d1 * 1000)), tqmin: String(Math.max(10, Math.round(tc.d1 * 250))),
          };
          W.expand(W.tag(def[key], key), v);
        }
        W.resetModal();
        done = true;
      }
    }
    // turning: finishing as the control's cycle along the contour of the roughing cycle before it
    if (!done && lathe && op.ctrlCycle && op.type === 'tfinish') {
      const why = !def.cycleTurnFinish ? 'Postprozessor ohne Schlichtzyklus'
        : !lastRough ? 'kein Schruppzyklus davor (Längsschruppen „Als Steuerungszyklus“)'
        : lastRough.sig !== edgeSig(t) ? `Schneide anders als beim Schruppen (${lastRough.op}) – die Kontur ist für dessen Schneidenradius gerechnet`
        : String(op.zEnd ?? '') !== String(lastRough.zEnd) ? `Ende Z anders als beim Schruppen (${lastRough.op})` : null;
      if (why) warnings.push(`${op.name}: Schlichtzyklus nicht möglich (${why}) – als Bahn ausgegeben`);
      else {
        if (+op.stockToLeave) warnings.push(`${op.name}: Schlichtzyklus fährt die Fertigkontur – Aufmaß ${op.stockToLeave} mm wird nicht berücksichtigt`);
        if (lastRough.under) warnings.push(`${op.name}: Schlichtzyklus folgt der Hüllkontur – Hinterschnitt/Einstich bleibt stehen`);
        W.resetModal();
        W.expand(W.tag(def.cycleTurnFinish, 'cycleTurnFinish'), { ...tv, sx: 2 * lastRough.sxr, sz: lastRough.szr - o.z, ns: lastRough.ns, nf: lastRough.nf, lap: lastRough.lap });
        W.resetModal();
        done = true;
      }
    }
    if (!done) {
      if (c && c.type === 'tap') warnings.push(`${op.name}: Steuerung/Postprozessor ohne Gewindebohrzyklus – als Vorschubbewegung ausgegeben (nur mit Ausgleichsfutter!)`);
      // arc fitting follows the tolerance of the operation ("Toleranz")
      const tolA = Math.min(0.05, Math.max(0.001, (+op.tolerance || 0.01) / 2));
      // helices only where the post can write them (helix template, or an arc template with Z)
      const helixOk = !!(def.helixCW && def.helixCCW) || (/\{Z/.test(def.arcCW || '') && /\{Z/.test(def.arcCCW || ''));
      // 5-axis simultaneous on a control without tool vectors: the 3-axis path of the same tool is written instead
      const mx = r.multi && !lathe ? r.multi : null;
      const mxOut = !!mx && ['heidenhain', 'sinumerik', 'fanuc'].includes(fam) && tilt.identity && !okuma;
      const src = mx && !mxOut && mx.upright ? mx.upright : r.moves;
      let moves = P.arcs !== false && !lathe && !r.rotary && !mxOut ? fitArcs(src, tolA, helixOk) : src;
      if (planeTpl && P.arcs !== false && P.planeArcs !== false && !lathe && !r.rotary && !mxOut) moves = fitPlaneArcs(moves, tolA);
      // 5-axis simultaneous: the moves hold the tip of the upright tool (same pivot) and the tool axis m.ax; the program gets the
      // real tip and the axis as a vector (no machine kinematics needed): Heidenhain LN … TX TY TZ under TCPM,
      // Sinumerik A3= B3= C3= under TRAORI, Fanuc I J K under G43.5. Other controls get the same surface as a
      // 3-axis path with the tool upright.
      if (mx) {
        if (!mxOut) warnings.push(mx.ball !== false ? `${op.name}: 5-Achs-Simultan wird von diesem Postprozessor${tilt.identity ? '' : ' in einer geschwenkten Aufspannung'} nicht ausgegeben – als 3-Achs-Bahn mit senkrechtem Werkzeug geschrieben (gleiche Fläche, da Kugelfräser)`
          : `${op.name}: 5-Achs-Simultan wird von diesem Postprozessor${tilt.identity ? '' : ' in einer geschwenkten Aufspannung'} nicht ausgegeben – als 3-Achs-Bahn mit senkrechtem Werkzeug geschrieben`);
        else {
          const kin = machine?.kin, lim = kin?.type === 'AC' ? kin.a : kin?.type === 'BC' ? kin.b : null;
          if (!kin || kin.type === 'A') warnings.push(`${op.name}: 5-Achs-Simultan – Maschine mit zwei Drehachsen wählen (Schwenktisch A/C oder Schwenkkopf B/C)`);
          else if (Array.isArray(lim) && mx.maxTilt > Math.max(Math.abs(lim[0]), Math.abs(lim[1])) + 1e-6) warnings.push(`${op.name}: Neigung bis ${mx.maxTilt.toFixed(1)}° – die Schwenkachse der Maschine reicht nur bis ${Math.max(Math.abs(lim[0]), Math.abs(lim[1]))}°`);
          clearOut();
          if (hh) { if (!P.tcpm) W.expand(P.tcpmCode === 'm128' ? 'M128' : 'FUNCTION TCPM F TCP AXIS POS PATHCTRL AXIS'); }
          else if (fam === 'sinumerik') W.expand('TRAORI');
          else W.expand(`G43.5 H${t.number}`);
          W.resetModal();
        }
      }
      const vec = v => { const s = (Math.round(v * 1e6) / 1e6 + 0).toFixed(6).replace(/0+$/, '').replace(/\.$/, ''); return s === '-0' ? '0' : s; };
      const sgv = v => { const s = vec(v); return s.startsWith('-') ? s : '+' + s; };
      const withV = (tpl, a, rapid) => {
        const force = s => s.replace('{X}', '{X!}').replace('{Y}', '{Y!}').replace('{Z}', '{Z!}');
        if (hh) return W.tag(`LN{X!}{Y!}{Z!} TX${sgv(a[0])} TY${sgv(a[1])} TZ${sgv(a[2])}${rapid ? ' FMAX' : '{F}'}`, rapid ? 'rapid' : 'linear');
        const words = fam === 'sinumerik' ? ` A3=${vec(a[0])} B3=${vec(a[1])} C3=${vec(a[2])}` : ` I${vec(a[0])} J${vec(a[1])} K${vec(a[2])}`;
        return W.tag(force(String(tpl || '')).replace('{Z!}', '{Z!}' + words), rapid ? 'rapid' : 'linear');
      };
      // 4-axis moves: machine values (Y/Z of the tip with the part turned by A), rotary word added to the templates
      const rot = r.rotary;
      const withA = tpl => (!rot || /\{A!?\}/.test(tpl || '') ? tpl : W.tag(String(tpl || '').replace('{Z}', '{Z}{A}'), tpl === def.rapid ? 'rapid' : 'linear'));
      if (rot) {
        if (Math.abs(o.y - rot.y) > 0.01 || Math.abs(o.z - rot.z) > 0.01) warnings.push(`${op.name}: Nullpunkt Y/Z liegt nicht auf der Drehachse A (Achse bei Y${W.num(rot.y - o.y)} Z${W.num(rot.z - o.z)}) – für 4-Achs-Simultan den Nullpunkt auf die Achse legen (Rohteil-Punkt Mitte Y/Z)`);
        if (machine?.kin && machine.kin.type !== 'A' && (machine.kin.type !== 'AC' || Array.isArray(machine.kin.a))) warnings.push(`${op.name}: Die gewählte Maschine hat keine endlos drehende A-Achse`);
        if (!machine?.kin) warnings.push(`${op.name}: 4-Achs-Simultan – Maschine mit Drehachse A wählen`);
        if (fam === 'grbl' && !rotWarned) warnings.push('GRBL 1.1 steuert nur X, Y und Z: Für die Drehachse A braucht es eine 4-Achs-Variante (z. B. grblHAL) – sonst bleibt das Programm am ersten A-Wort stehen');
        if (rotFeed === 'mm' && ['fanuc', 'linuxcnc', 'grbl', 'gcode'].includes(fam) && !rotWarned) warnings.push('Sätze mit X/Y/Z und A zusammen: Der Vorschub steht in mm/min im Programm, viele Steuerungen rechnen dort aber Grad wie Millimeter – Einstellung „Vorschub mit Drehachse“ des Postprozessors auf „umgerechnet“ oder „zeitreziprok (G93)“ stellen');
        rotWarned = true;
      }
      let prevRot = null, invOn = false;
      let px = null, py = null, pz = null, comp = null, cpDrift = 0;
      W.lastCC = null; // circle centre CC: modal on the control, written again only when it changes (and per operation)
      // Y axis: every pass across the axis in the frame of its index angle (x towards the turret, y across)
      const yLoc = m => { const a = ((m.yc || 0) * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a); return [m.x * co + m.y * si, -m.x * si + m.y * co]; };
      const yWant = lathe && r.polar && P.latheY === true && def.yOn && def.yOff;
      const yFits = yWant && moves.every(m => !m.polar || Math.abs(yLoc(m)[1]) <= (+P.latheYTravel > 0 ? +P.latheYTravel : 40) + 1e-6);
      if (yWant && !yFits) warnings.push(`${op.name}: Die Bahn geht über den Y-Verfahrweg (± ${+P.latheYTravel > 0 ? +P.latheYTravel : 40} mm) hinaus – mit Polar-Interpolation ausgegeben`);
      const yMode = !!(yWant && yFits);
      let yOn = false, yC = null;
      const polarTpl = !yMode && lathe && r.polar && def.polarOn && def.polarOff;
      if (lathe && r.polar && !polarTpl && !yMode) warnings.push(`${op.name}: Postprozessor ohne Polar-Interpolation – Flächen als kurze X/C-Schritte (C in Grad) ausgegeben; der Vorschub gilt dann je nach Steuerung nicht entlang der Bahn. Besser die Vorlage „Polar-Interpolation ein/aus“ eintragen`);
      let polarOn = false, cylOn = false;
      const cylTpl = lathe && r.cyl > 0 && def.cylOn && def.cylOff;
      if (lathe && r.cyl > 0 && !cylTpl) warnings.push(`${op.name}: Postprozessor ohne Zylinder-Interpolation – Z und C fahren gemeinsam, der Vorschub gilt dann je nach Steuerung nicht entlang der Bahn. Besser die Vorlage „Zylinder-Interpolation ein/aus“ eintragen`);
      const list = lathe && r.polar && !polarTpl && !yMode ? polarSteps(moves) : def.helixCW && def.helixCCW ? mergeHelix(moves) : moves;
      const useAppr = hh && !lathe && !rot && !mx && P.apprDep !== false && def.approach && def.depart;
      const R0t = (+t.dia || 0) / 2;
      // a lead (run of moves with the same lead tag) as APPR/DEP words, or null when the control's functions do not fit
      const leadRun = mi => { let j = mi; while (list[j + 1]?.lead === list[mi].lead) j++; return j; };
      const leadWords = (L, end, i0, i1) => {
        for (let k = i0; k <= i1; k++) if (Math.abs(list[k].z - list[i1].z) > 1e-6) return null; // ramped leads stay as moves
        const n = v => W.num(v), xy = ` X${n(end.x - o.x)} Y${n(end.y - o.y)}`, inn = L.k === 'in';
        if (L.perp) { const len = L.R + L.linear - R0t; return len > 0.01 ? `LN${inn ? xy : ''} LEN${n(len)}` : null; }
        if (L.R > 0) return L.linear > 0 ? `LCT${xy} R${n(L.R)}` : `CT${inn ? xy : ''} CCA${n(Math.min(180, Math.max(1, L.sweep)))} R${n(L.R)}`;
        return L.linear > 0 ? `LT${inn ? xy : ''} LEN${n(L.linear)}` : null;
      };
      for (let mi = 0; mi < list.length; mi++) {
        const m = list[mi];
        if (m.dwell) { W.expand(def.dwell, { ...tv, dwell: m.dwell }); continue; }
        if (useAppr && m.lead && m.comp && list[mi - 1]?.lead !== m.lead) {
          const j = leadRun(mi), L = m.lead, end = list[j];
          const words = leadWords(L, end, L.k === 'in' ? Math.max(0, mi - 1) : mi, j);
          if (words && (L.k === 'out' || list[j + 1]?.comp === m.comp)) {
            if (L.k === 'in') W.expand(W.tag(def.approach, 'approach'), { ...tv, appr: words, rc: m.comp === 'L' ? 'RL' : 'RR' }, { f: feedOf(m.f), arc: true });
            else W.expand(W.tag(def.depart, 'depart'), { ...tv, dep: words }, { f: feedOf(m.f), arc: true });
            // the control ends the approach on the contour, the departure at the end point (compensation off)
            W.st.X = W.num(end.x - o.x); W.st.Y = W.num(end.y - o.y); W.st.Z = W.num(end.z - o.z);
            W.rapidBefore = false;
            comp = L.k === 'in' ? m.comp : null;
            px = end.x; py = end.y; pz = end.z;
            mi = j;
            continue;
          }
        }
        // cutter radius compensation at the control (G41/G42 … G40, Heidenhain RL/RR … R0)
        let mc = m.t === 'r' ? null : m.comp || null;
        {
          const nx = list[mi + 1];
          if (mc && comp === mc && m.t === 'f' && px != null && Math.hypot(m.x - px, m.y - py) > 1e-4 && (!nx || nx.t === 'r' || !nx.comp)) mc = null;
        }
        // working plane: G18 / G19 only around the arcs in those planes, G17 again before everything else that
        // depends on it (XY arcs, radius compensation) and at the end of the operation
        const wantPl = m.t === 'a' && m.pl ? m.pl : (m.t === 'a' || (m.comp || null) !== comp) ? 17 : W.plane;
        if (planeTpl && wantPl !== W.plane) { W.expand(`G${wantPl}`); W.plane = wantPl; }
        if (mc !== comp && !lathe) {
          if (fam === 'grbl') { if (mc) warnings.push(`${op.name}: GRBL kennt keine Radiuskorrektur (G41/G42) – Bahn ohne Korrektur ausgegeben`); }
          else if (!hh) W.expand(mc ? `${mc === 'L' ? 'G41' : 'G42'}${fam === 'sinumerik' ? '' : ' D' + t.number}` : 'G40');
          comp = mc;
        }
        // polar interpolation on for the passes across the axis, off again for everything else
        // cylindrical interpolation only around the feed moves on the diameter (no rapids while it is active)
        const cy = !!(cylTpl && m.cyl && m.t !== 'r');
        if (cy !== cylOn) { W.expand(W.tag(cy ? def.cylOn : def.cylOff, cy ? 'cylOn' : 'cylOff'), { ...tv, cylr: r.cyl }); W.resetModal(); cylOn = cy; }
        const ym = !!(yMode && m.polar);
        if (ym !== yOn) { W.expand(W.tag(ym ? def.yOn : def.yOff, ym ? 'yOn' : 'yOff'), tv); W.resetModal(); yOn = ym; yC = null; }
        const pol = !!(polarTpl && m.polar);
        if (pol !== polarOn) { W.expand(W.tag(pol ? def.polarOn : def.polarOff, pol ? 'polarOn' : 'polarOff'), tv); W.resetModal(); polarOn = pol; }
        const mark0 = W.out.length;
        // lathe: x is the radius in the toolpath, the program wants the diameter
        const mv = { x: lathe ? 2 * (m.xr ?? m.x) : m.x - o.x, y: m.y - o.y, z: m.z - o.z, f: m.t === 'r' ? null : feedOf(m.f) };
        if (mxOut && m.ax) {
          // the real tip of the leaning tool
          Object.assign(mv, { x: m.x - mx.R * m.ax[0] - o.x, y: m.y - mx.R * m.ax[1] - o.y, z: m.z + mx.R * (1 - m.ax[2]) - o.z });
          if (m.t === 'r') { W.expand(withV(def.rapid, m.ax, true), tv, mv); W.rapidBefore = true; }
          else if (W.expand(withV(def.linear, m.ax, false), tv, mv)) W.rapidBefore = false;
          px = m.x; py = m.y; pz = m.z;
          continue;
        }
        if (m.a != null) {
          Object.assign(mv, { y: m.my - o.y, z: m.mz - o.z, a: m.a });
          // feed with the rotary axis: the time of the block from the way of the tip on the part (m.x/y/z turn with
          // it); written as 1/min (G93) or as the feed a control needs that counts degrees like millimetres
          if (m.t === 'f' && prevRot && rotFeed !== 'mm' && mv.f > 0) {
            const lm = Math.hypot(m.x - prevRot.x, m.my - prevRot.my, m.mz - prevRot.mz, m.a - prevRot.a), lp = Math.hypot(m.x - prevRot.x, m.y - prevRot.y, m.z - prevRot.z);
            const tm = (lp > 1e-6 ? lp : lm) / mv.f;
            if (tm > 0 && lm > 1e-9) {
              if (rotFeed === 'inverse') { if (!invOn) { W.expand('G93'); invOn = true; } const iv = 1 / tm; mv.fInv = iv >= 1000 ? String(Math.round(iv)) : iv.toFixed(iv >= 10 ? 1 : 3).replace(/\.?0+$/, ''); }
              else mv.f = Math.max(1, lm / tm);
            }
          }
          prevRot = m;
        }
        // lathe with driven tool: the part angle as C word
        if (lathe && m.c != null) mv.c = m.c;
        // polar interpolation: Cartesian position on the part, X as diameter and C in mm; rapids as fast feed moves
        if (pol) { mv.x = 2 * m.x; mv.c = m.y; if (m.t === 'r') mv.f = Math.min(maxF, 5000); }
        // Y axis: X as diameter and Y in the frame of the index angle, C only when the angle changes
        if (ym) { const [xl, yl] = yLoc(m); mv.x = 2 * xl; mv.y = yl; mv.c = m.yc || 0; }
        const withC = tpl => {
          let s = String(tpl || '');
          if (ym && !/\{Y!?\}/.test(s)) s = s.replace('{X}', '{X}{Y}');
          if (mv.c != null && !/\{C!?\}/.test(s)) s = s.replace('{Z}', '{Z}{C}');
          return s === String(tpl || '') ? tpl : W.tag(s, tpl === def.rapid ? 'rapid' : 'linear');
        };
        if (m.t === 't') { W.expand(def.threadMove, { ...tv, pitch: m.pitch }, { ...mv, f: null }); W.rapidBefore = false; px = m.x; py = m.y; pz = m.z; continue; }
        if (m.t === 'a' && m.pl) {
          // plane arc: the start is the previous end point (px/py/pz), centre words relative to it
          Object.assign(mv, { arc: true, i: m.cx - px, j: m.cy - py, k: m.cz - pz });
          W.expand(m.cw ? planeTpl[m.pl][0] : planeTpl[m.pl][1], tv, mv);
          W.rapidBefore = false; cpDrift = 0;
        } else if (m.t === 'a') {
          Object.assign(mv, { arc: true, cx: m.cx - o.x, cy: m.cy - o.y, i: m.cx - px, j: m.cy - py });
          let helix = pz != null && Math.abs(m.z - pz) > 1e-6 && (m.cw ? def.helixCW : def.helixCCW);
          let arcT = m.cw ? def.arcCW : def.arcCCW;
          if (hh) {
            const ccKey = W.num(mv.cx) + ' ' + W.num(mv.cy);
            if (ccKey === W.lastCC) {
              const strip = (tpl, key) => W.tag(String(tpl).split('\n').filter(l => !/^CC\b/.test(l)).join('\n'), key);
              if (helix) helix = strip(helix, m.cw ? 'helixCW' : 'helixCCW'); else arcT = strip(arcT, m.cw ? 'arcCW' : 'arcCCW');
            }
            W.lastCC = ccKey;
          }
          if (helix && cpDrift > 0.002) {
            W.expand(W.tag(String(def.linear).replace('{X}', '{X!}').replace('{Y}', '{Y!}').replace('{Z}', '{Z!}'), 'linear'), tv, { x: px - o.x, y: py - o.y, z: pz - o.z, f: feedOf(m.f) });
            cpDrift = 0;
          }
          if (helix) {
            cpDrift += Math.abs(Math.hypot(m.x - m.cx, m.y - m.cy) - Math.hypot(px - m.cx, py - m.cy)) + 0.0005;
            // polar arc: the end point follows from the angle – the axis words are now known to the control
            const ipa = ((m.cw ? -1 : 1) * (m.sw ?? 0) * 180) / Math.PI;
            const sgn = v => { const t = W.num(v).replace(/^\+/, ''); return (t.startsWith('-') ? '' : '+') + t; };
            W.expand(helix, { ...tv, cx: mv.cx, cy: mv.cy, ipa: sgn(ipa), iz: sgn(m.z - pz) }, { ...mv, x: null, y: null, z: null });
            W.st.X = W.num(mv.x); W.st.Y = W.num(mv.y); W.st.Z = W.num(mv.z);
          } else { W.expand(arcT, { ...tv, cx: mv.cx, cy: mv.cy, i: mv.i, j: mv.j }, mv); cpDrift = 0; }
          W.rapidBefore = false;
        } else if (m.t === 'r' && !pol) {
          cpDrift = 0;
          W.expand(withC(withA(def.rapid)), tv, mv);
          W.rapidBefore = true;
        } else { if (Math.hypot(m.x - (px ?? m.x), m.y - (py ?? m.y)) > 1e-6) cpDrift = 0; if (W.expand(withC(withA(def.linear)), tv, mv)) W.rapidBefore = false; }
        if (hh && comp && fam !== 'grbl') for (let k = mark0; k < W.out.length; k++) W.out[k].text = W.out[k].text.replace(/ R0\b/, comp === 'L' ? ' RL' : ' RR');
        px = m.x; py = m.y; pz = m.z;
      }
      if (planeTpl && W.plane !== 17) { W.expand('G17'); W.plane = 17; }
      if (comp && !hh && fam !== 'grbl' && !lathe) W.expand('G40');
      if (invOn) { W.expand('G94'); W.st.F = null; }
      if (mxOut) {
        if (hh) { if (!P.tcpm) W.expand(P.tcpmCode === 'm128' ? 'M129' : 'FUNCTION RESET TCPM'); }
        else if (fam === 'sinumerik') W.expand('TRAFOOF');
        else W.expand(`G49\nG43 H${t.number}`);
        W.resetModal();
      }
      if (mxOut) clearOut();
      if (polarOn) { W.expand(W.tag(def.polarOff, 'polarOff'), tv); W.resetModal(); }
      if (yOn) { W.expand(W.tag(def.yOff, 'yOff'), tv); W.resetModal(); }
      if (cylOn) { W.expand(W.tag(def.cylOff, 'cylOff'), { ...tv, cylr: r.cyl }); W.resetModal(); }
    }
    // Heidenhain M120: look ahead over the radius-compensated contour of finishing operations – in every block
    // that switches RL/RR on (R0 cancels it, so each new compensated pass gets it again)
    if (hh && P.m120 && !lathe && !ROUGH_OPS.includes(op.type)) {
      const la = Math.max(1, Math.min(99, Math.round(+P.m120LA) || 5));
      let on = false;
      for (let k = mark; k < W.out.length; k++) {
        const l = W.out[k];
        if (l.blank || l.comment) continue;
        const rc = /\sR[LR](\s|$)/.test(l.text), r0 = /\sR0(\s|$)/.test(l.text) || /^DEP\b/.test(l.text);
        if (rc && !on && !/\bM120\b/.test(l.text)) l.text += ` M120 LA${la}`;
        if (rc) on = true; else if (r0) on = false;
      }
    }
    W.qfeed = null;
    let lbl = null;
    if (subs) {
      const body = W.out.splice(mark);
      const lk = own ? op.id + '#' + (part ?? 0) : op.id;
      lbl = labelOf.get(lk);
      if (!lbl) { lbl = labels.length + 1; labels.push({ n: lbl, name: op.name, body }); labelOf.set(lk, lbl); }
      W.expand(`CALL LBL ${lbl}`);
      W.resetModal();
    }
    // an inner call for one more part: the caller does the datum handling
    if (sub) return;
    // the same operation for the other parts of the clamping, each in its own datum
    if (multiTool && own) {
      // own toolpath per part (serial numbers): written again for each part
      for (let k = 1; k < multi.list.length; k++) { retractSafe(); emitOp(op, oi, k); W.resetModal(); }
      retractSafe();
      partReset();
    } else if (multiTool) {
      const body = subs ? null : W.out.slice(mark).map(l => ({ ...l }));
      for (let k = 1; k < multi.list.length; k++) {
        retractSafe();
        partSelect(k);
        if (subs) W.expand(`CALL LBL ${lbl}`);
        else W.out.push(...body.map(l => ({ ...l })));
        W.resetModal();
        totalTime += r.time || 0;
      }
      retractSafe();
      partReset();
    }
    // breakage check before the tool goes back into the magazine
    if (hh && !lathe && P.toolBreak && lastOfTool.has(op.id)) {
      retractSafe();
      setCoolant('off');
      W.expand('M5');
      W.expand(ttCycle(481, 1));
      respin = true;
    }
  };
  if (multi && !multiTool) {
    // part by part: all operations on one part, then the next (tool changes repeat)
    multi.list.forEach((_, k) => {
      if (k) retractSafe();
      partSelect(k);
      ops.forEach((op, oi) => emitOp(op, oi, k));
    });
    retractSafe();
    partReset();
  } else ops.forEach((op, oi) => emitOp(op, oi));
  smoothReset();
  planeEnd(true);
  if (liveMode && def.liveOff) W.expand(W.tag(def.liveOff, 'liveOff'), base);
  if (cool !== 'off') {
    const offs = offCodes(cool);
    cool = 'off';
    footer = W.tag(String(footer || '').replace('{coolantoff}', offs.filter(Boolean).join('\n')), 'footer');
  }
  W.expand(footer, { ...base, coolanton: '', coolantoff: '' });
  if (hh && P.tcpm && !lathe) {
    const end = W.out.findIndex(l => /^M30\b|^M2\b/.test(l.text));
    if (end >= 0) W.out.splice(end, 0, { text: P.tcpmCode === 'm128' ? 'M129' : 'FUNCTION RESET TCPM' });
  }
  if (P.homeXY && !lathe && !okuma) {
    const end = W.out.findIndex(l => /^M30\b|^M2\b/.test(l.text));
    const home = hh ? [{ text: 'L X+0 Y+0 R0 FMAX M91' }] : fam === 'sinumerik' ? [{ text: 'G0 SUPA X0 Y0' }] : [{ text: 'G91 G28 X0 Y0' }, { text: 'G90' }];
    if (end >= 0) W.out.splice(end, 0, ...home);
  }
  // subprograms after the end of the main program (before END PGM)
  if (labels.length) {
    let at = W.out.findIndex(l => /^END PGM/.test(l.text));
    if (at < 0) at = W.out.length;
    const rows = [];
    for (const lb of labels) rows.push({ text: W.comment(`Unterprogramm ${lb.n}: ${lb.name}`), comment: true }, { text: `LBL ${lb.n}` }, ...lb.body, { text: 'LBL 0' });
    W.out.splice(at, 0, ...rows);
  }

  // machine envelope: stock and toolpath extents must fit the travels
  if (machine?.travel) {
    const tr = machine.travel;
    const ext = { x: stock.maxX - stock.minX, y: stock.maxY - stock.minY, z: safe - stock.bottom };
    for (const k of ['x', 'y', 'z']) if (tr[k] && ext[k] > tr[k]) warnings.push(`${k.toUpperCase()}-Verfahrweg ${tr[k]} mm reicht nicht (benötigt ${ext[k].toFixed(1)} mm)`);
  }
  if (hh && P.m13 && !lathe) {
    const flood = String(P.coolFlood || 'M8').trim();
    for (let i = 0; i < W.out.length; i++) {
      const l = W.out[i];
      if (l.blank || l.comment || !/\sM[34]$|^M[34]$/.test(l.text)) continue;
      // the coolant block within the next/previous few blocks (before any move at feed)
      for (const d of [1, 2, 3, -1, -2, -3]) {
        const c = W.out[i + d];
        if (!c || c.blank || c.comment) continue;
        if (c.text.trim() === flood) { l.text = l.text.replace(/M([34])$/, (_, n) => (n === '3' ? 'M13' : 'M14')); W.out.splice(i + d, 1); if (d < 0) i--; break; }
        if (/\sF\d|\sFQ/.test(c.text) && !/FMAX/.test(c.text)) break;
      }
    }
  }
  const mOff = new Set((Array.isArray(P.mOff) ? P.mOff : []).map(Number));
  if (mOff.size) W.out = stripMCodes(W.out, mOff);
  if ([3, 4, 13].some(n => mOff.has(n))) warnings.push('M-Befehle für die Spindel sind ausgeschaltet – die Spindel muss an der Maschine eingeschaltet werden.');
  if ([2, 30].some(n => mOff.has(n))) warnings.push('M-Befehl für das Programmende ist ausgeschaltet.');
  const code = W.text();
  // src[i]: section key of the template that wrote line i (null: post properties / automatic lines)
  // opOf[i]: name of the operation that wrote line i (null: program start and end)
  return { code, lines: code.split('\n').length, time: totalTime, warnings: [...new Set(warnings)], src: W.out.map(l => l.src || null), opOf: W.out.map(l => l.op || null) };
}

// Entry point used by the app: post id from project.post.flavor (or the machine).
// The post of the design fits one kind of machine. A setup of the other kind (a turning setup in a design posted for a
// mill, or the other way round) takes the post of the same control for its kind – no milling program for a lathe.
const POST_PARTNER = { fanuc: 'fanuc-lathe', linuxcnc: 'linuxcnc-lathe', 'okuma-mill': 'okuma-lathe', 'fanuc-lathe': 'fanuc', 'linuxcnc-lathe': 'linuxcnc', 'okuma-lathe': 'okuma-mill' };
export function postForKind(project, id, lathe) {
  const def = findPost(project, id);
  if (!!def.lathe === !!lathe) return def.id;
  return POST_PARTNER[def.id] || (lathe ? 'fanuc-lathe' : 'fanuc');
}
export function postProcess(project, gen, machine = null, extra = {}) {
  const def = findPost(project, extra.postId || postForKind(project, project.post.flavor, gen?.kind === 'turn'));
  const pp = project.post || {};
  // older projects kept these switches directly in project.post
  const legacy = { arcs: pp.arcs !== false, cycles: pp.cycles !== false, ...(def.builtin && def.id !== 'heidenhain' && pp.lineNumbers != null ? { lineNumbers: !!pp.lineNumbers } : {}) };
  return runPost(def, project, gen, { coolant: !!pp.coolant, legacy, props: { ...(pp.props?.[def.id] || {}) }, machine, ...extra });
}
