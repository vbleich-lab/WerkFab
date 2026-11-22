// Hinweise an den Icons: wer mit der Maus auf einer Schaltfläche stehen bleibt, bekommt eine kleine Blase mit
// Name, Taste und einer kurzen Erklärung. Die Texte kommen aus dem title-Attribut (das schon übersetzt ist) und,
// wo das nur den Namen nennt, aus data-hint (deutsch, wird hier übersetzt).
import { t } from './i18n.js';

// Erklärungen für Schaltflächen, deren Tooltip sonst nur der Name wäre (Schlüssel = Beschriftung)
export const TIPS = {
  'Skizze': 'Ebene oder ebene Fläche wählen und darauf zeichnen',
  'Skizze fertig': 'Skizze schließen und zurück zum Modell',
  'Text': 'Text in die Skizze setzen – zum Extrudieren, Prägen oder Gravieren',
  'Messen': 'Abstand zwischen zwei angeklickten Punkten messen',
  'Schnitt': 'Modell an einer Ebene aufschneiden und hineinsehen',
  'Einpassen': 'Alles Sichtbare formatfüllend zeigen',
  'Drücken/Ziehen': 'Ebene Fläche verschieben oder Kante verrunden',
  'Darstellung': 'Farbe und Material der Körper wählen',
  'Parameter': 'Benannte Maße anlegen und ändern, auf die das Modell aufbaut',
  'Parameter ändern': 'Benannte Maße anlegen und ändern, auf die das Modell aufbaut',
  'Einstellungen': 'Einheiten, Darstellung, Maus und Tasten einstellen',
  'Beispiel': 'Beispielteil mit fertiger Fräsbearbeitung laden',
  'STEP': 'Modell als STEP-Datei speichern (für andere CAD-Programme)',
  'IGES': 'Modell als IGES-Datei speichern',
  'STL': 'Modell als STL-Netz speichern (für den 3D-Druck)',
  'Setup': 'Aufspannung bearbeiten: Rohteil, Nullpunkt und Ausrichtung',
  'Neues Setup': 'Weitere Aufspannung anlegen, z. B. für die Rückseite',
  'Simulieren': 'Abtrag am Rohteil ansehen und auf Kollisionen prüfen',
  'NC-Programm': 'Programm für die Maschine erzeugen, ansehen und speichern',
  'Einrichteblatt': 'Übersicht für die Maschine: Werkzeuge, Nullpunkt, Zeiten',
  'Maschinenbibliothek': 'Maschinen mit Achsen, Verfahrwegen und Drehzahlen verwalten',
  'Postprozessor-Bibliothek': 'Ausgabe des NC-Programms an die Steuerung anpassen',
  'Extrusion': 'Profil oder ebene Fläche in die Höhe ziehen – als neuer Körper, angefügt oder als Schnitt',
  'Rotation': 'Profil um eine Achse drehen – für Drehteile',
  'Bohrung': 'Bohrung, Senkung oder Gewindebohrung an Skizzenpunkten oder per Klick auf eine Fläche',
  'Sweep': 'Profil an einem Pfad entlangführen',
  'Erhebung': 'Körper zwischen zwei oder mehr Profilen auf verschiedenen Ebenen',
  'Quader': 'Quader mit Länge, Breite und Höhe einfügen',
  'Zylinder': 'Zylinder mit Radius und Höhe einfügen',
  'Verrundung': 'Kanten mit einem Radius abrunden',
  'Fase': 'Kanten schräg abschneiden',
  'Formschräge': 'Flächen um einen Winkel neigen, damit das Teil aus der Form kommt',
  'Verschieben/Kopieren': 'Körper verschieben, drehen oder als Kopie ablegen',
  'Spiegeln': 'Feature an einer Ebene spiegeln',
  'Rechteck-Muster': 'Feature in Reihen und Spalten vervielfältigen',
  'Versatzebene': 'Ebene im Abstand zu einer Ebene oder gewählten Fläche',
  'Ebene unter Winkel': 'Ebene, die gegen eine Bezugsebene geneigt ist',
  'Mittelebene': 'Ebene in der Mitte zwischen zwei Ebenen oder Flächen',
  'Flicken': 'Ebene Fläche aus einem geschlossenen Skizzenprofil',
  'Trimmen': 'Teile einer Fläche an einem Körper, einer Ebene oder Skizzenkurven abschneiden',
  'Verlängern': 'Fläche an ihren Rändern tangential weiterführen',
  'Zusammenfügen': 'Flächen an ihren Rändern verbinden – ein geschlossener Verbund wird ein Volumenkörper',
  'Aufdicken': 'Flächen eine Wandstärke geben',
  'Reparieren': 'Löcher schließen und Fehler im Netz beheben',
  'Reduzieren': 'Anzahl der Dreiecke verringern',
  'Glätten': 'Unebenheiten im Netz ausgleichen',
  'Ebenenschnitt': 'Netz an einer Ebene abschneiden oder teilen',
  'Auf Fläche legen': 'Netz mit einer angeklickten Fläche nach unten auf die Druckplatte legen',
  '5-Achs-Simultan Spirale': 'Schlichten in einer Spirale, der Kugelfräser neigt sich zur Fläche',
  '5-Achs-Simultan Radial': 'Schlichten in Strahlen von einem Mittelpunkt, der Kugelfräser neigt sich zur Fläche',
  '5-Achs-Simultan Kontur': 'Steile Wände in Höhenlinien, der Fräser neigt sich zur Fläche',
  '5-Achs-Simultan Hohlkehle': 'Innenecken mit einer Bahn nachfahren, der Fräser neigt sich zur Fläche',
  '5-Achs-Simultan Projizieren': 'Skizzenlinien auf der Fläche abfahren, der Fräser steht senkrecht zur Fläche',
  '5-Achs-Simultan Flächen-Morph': 'Bahnen zwischen zwei Rändern, der Fräser neigt sich zur Fläche',
  'Schale': 'Körper aushöhlen – die gewählten Flächen bleiben offen',
  'Kombinieren': 'Körper vereinigen, voneinander abziehen oder die Schnittmenge bilden',
  'Körper teilen': 'Körper an einer Ebene in zwei Körper trennen',
  'Skalieren': 'Körper um einen Faktor vergrößern oder verkleinern',
  'Teilen': 'Flächen an einer Ebene oder Skizze auftrennen',
  'Ebene durch drei Punkte': 'Ebene durch drei angeklickte Punkte',
  'Tangentialebene': 'Ebene, die an einer Zylinderfläche anliegt',
  'Achse durch Zylinder': 'Achse in der Mitte einer Zylinderfläche oder Bohrung',
  'Achse durch zwei Punkte': 'Achse durch zwei angeklickte Punkte',
  'Achse durch zwei Ebenen': 'Achse dort, wo sich zwei Ebenen schneiden',
  'Punkt': 'Konstruktionspunkt im Raum setzen',
  'Neu vernetzen': 'Netz mit gleichmäßigen Dreiecken neu aufbauen',
  'Aushöhlen': 'Netz innen hohl machen – spart Material beim Druck',
  'Kugel': 'Kugel mit Radius einfügen',
  'Torus': 'Ring mit rundem Querschnitt einfügen',
  'Kegel': 'Kegel oder Kegelstumpf einfügen',
  'Rohr': 'Rohr mit Durchmesser und Wandstärke an einem Pfad entlang',
  'Gewinde': 'Gewinde auf eine Zylinderfläche oder in eine Bohrung legen',
  'Feder': 'Schraubenfeder oder Wendel aus Durchmesser, Windungen und Höhe',
  'Rippe': 'Versteifungsrippe aus einer offenen Skizzenlinie',
  'Prägen': 'Skizze oder Text erhaben oder vertieft auf eine Fläche bringen',
  'Kreis-Muster': 'Feature rund um eine Achse vervielfältigen',
  'Muster entlang Pfad': 'Feature an einer Skizzenlinie entlang vervielfältigen',
  'Versatzfläche': 'Kopie von Flächen im festen Abstand',
  'Freiformfläche': 'Gewölbte Fläche aus einem Raster von Höhenpunkten',
  // Navigationsleiste (index.html)
  'Leiste verschieben': 'Mit gedrückter Maustaste ziehen. Doppelklick setzt die Leiste zurück an ihren Platz',
  // Skizzenwerkzeuge
  'Linie': 'Linienzug zeichnen – Enter beendet ihn',
  'Rechteck': 'Rechteck über zwei gegenüberliegende Ecken',
  'Kreis': 'Kreis aus Mittelpunkt und Radius',
  '3-Punkt-Bogen': 'Bogen durch Anfang, Ende und einen Punkt dazwischen',
  'Polygon': 'Regelmäßiges Vieleck, z. B. Sechskant',
  'Spline': 'Glatte Kurve durch angeklickte Punkte',
  'Stutzen': 'Stück einer Linie bis zum nächsten Schnittpunkt wegschneiden',
  'Auswahl': 'Elemente anklicken, ziehen oder mit einem Rahmen wählen',
  'Ellipse': 'Ellipse aus Mittelpunkt und zwei Halbachsen',
  'Langloch': 'Langloch aus zwei Mittelpunkten und der Breite',
  'Mittelpunkt-Rechteck': 'Rechteck aus Mittelpunkt und einer Ecke',
  '3-Punkt-Rechteck': 'Schräg liegendes Rechteck aus drei Punkten',
  '2-Punkt-Kreis': 'Kreis durch zwei gegenüberliegende Punkte',
  '3-Punkt-Kreis': 'Kreis durch drei Punkte',
  'Mittelpunkt-Bogen': 'Bogen aus Mittelpunkt, Anfang und Ende',
  'Tangentialbogen': 'Bogen, der glatt an das Ende einer Linie anschließt',
  // Abhängigkeiten in der Skizze
  'Koinzident': 'Zwei Punkte aufeinander oder einen Punkt auf eine Linie legen',
  'Horizontal': 'Linie oder zwei Punkte waagerecht ausrichten',
  'Vertikal': 'Linie oder zwei Punkte senkrecht ausrichten',
  'Parallel': 'Zwei Linien parallel stellen',
  'Senkrecht': 'Zwei Linien rechtwinklig zueinander stellen',
  'Kollinear': 'Zwei Linien auf eine gemeinsame Gerade legen',
  'Gleich': 'Gleiche Länge oder gleichen Radius erzwingen',
  'Tangential': 'Linie und Bogen oder zwei Bögen glatt ineinander übergehen lassen',
  'Konzentrisch': 'Kreise und Bögen auf denselben Mittelpunkt legen',
  'Mittelpunkt': 'Punkt auf die Mitte einer Linie legen',
  'Symmetrisch': 'Zwei Punkte spiegelbildlich zu einer Linie halten',
  'Fixiert': 'Punkt oder Linie an ihrem Platz festhalten',
};

// Erklärungen der Bearbeitungen (Schlüssel = Art der Operation)
export const OP_TIPS = {
  face: 'Oberseite des Rohteils eben fräsen',
  contour: 'Außen- oder Innenkontur an der Wand entlang fräsen',
  pocket: 'Tasche bis zum Boden ausräumen',
  adaptive: 'Schruppen mit gleichmäßiger Belastung des Fräsers – schont das Werkzeug',
  chamfer: 'Kanten mit dem Fasenfräser brechen',
  slot: 'Nut entlang ihrer Mittellinie fräsen',
  circular: 'Runde Tasche oder Bohrung in Kreisbahnen ausfräsen',
  trace: 'Fräser folgt der Linie mittig – für Gravuren und Schriften',
  vcarve: 'Schrift und Flächen mit dem V-Stichel ausstechen, die Tiefe folgt der Breite',
  adaptive3d: 'Rohteil in Ebenen bis ans Teil schruppen, mit gleichmäßiger Belastung',
  pocket3d: 'Rohteil in Ebenen schruppen, Bahnen im gleichen Abstand zur Kontur',
  steep3d: 'Schlichten: steile Wände in Höhenlinien, flache Bereiche in Bahnen',
  flat3d: 'Nur die waagerechten Flächen schlichten',
  parallel3d: 'Schlichten in parallelen Bahnen über die Fläche',
  scallop3d: 'Schlichten mit gleichem Bahnabstand auf der Fläche – gleichmäßige Rillen',
  contour3d: 'Steile Wände in Höhenlinien schlichten',
  ramp3d: 'Steile Wände in einer durchgehenden Rampe statt in Ebenen schlichten',
  pencil3d: 'Innenecken und Hohlkehlen mit einer Bahn nachfahren',
  horizontal3d: 'Ebene Böden und Absätze schlichten',
  spiral3d: 'Schlichten in einer Spirale von innen nach außen',
  radial3d: 'Schlichten in Strahlen von einem Mittelpunkt aus',
  morphspiral3d: 'Spirale, die sich der Randkontur anpasst',
  project3d: 'Skizzenlinien auf die Fläche legen und abfahren',
  blend3d: 'Bahnen zwischen zwei Leitkurven verteilen',
  guidemorph3d: 'Bahnen gehen von einer Leitkurve in die andere über',
  corner3d: 'Restmaterial in den Ecken mit kleinerem Werkzeug holen',
  flow3d: 'Bahnen folgen dem Verlauf der Fläche',
  morph3d: 'Bahnen gehen zwischen zwei Rändern einer Fläche ineinander über',
  deburr3d: 'Kanten des Teils mit Kugel- oder Fasenfräser entgraten',
  geodesic3d: 'Bahnen im gleichen Abstand, gemessen auf der Fläche',
  rotaryRough: 'Drehendes Teil schichtweise bis ans Fertigmaß schruppen',
  rotary: 'Drehendes Teil in einer Wendel oder in Längsbahnen schlichten',
  rotaryWrap: 'Skizze um den Zylinder wickeln und fräsen',
  drill: 'Bohrungen bohren – Bohrungen im Modell oder Punkte anklicken',
  bore: 'Bohrung mit dem Fräser in einer Wendel auf Maß fräsen',
  thread: 'Innen- oder Außengewinde mit dem Gewindefräser fräsen',
  probe: 'Werkstück mit dem Messtaster antasten und den Nullpunkt setzen',
  tface: 'Stirnseite des Drehteils eben drehen',
  trough: 'Außenkontur in Schnitten bis aufs Aufmaß vordrehen',
  tfinish: 'Kontur in einem Zug auf Maß drehen',
  tgroove: 'Nut oder Freistich einstechen',
  tthread: 'Gewinde in mehreren Schnitten drehen',
  tpart: 'Fertiges Teil von der Stange abstechen',
  tdrill: 'Auf der Drehachse bohren',
  tbore: 'Bohrung mit der Bohrstange ausdrehen',
  tlive: 'Mit angetriebenem Werkzeug außerhalb der Drehachse bohren',
  tslot: 'Nut mit angetriebenem Fräser fräsen',
  tflat: 'Schlüsselflächen an das Drehteil fräsen',
  tcontour: 'Kontur auf der Stirnfläche mit angetriebenem Fräser fräsen',
  twrap: 'Kontur auf dem Mantel fräsen, die C-Achse dreht mit',
  tpocket: 'Tasche in die Stirnfläche fräsen',
  twpocket: 'Tasche in den Mantel fräsen, die C-Achse dreht mit',
};

const KEY = /\s*\(((?:(?:Strg|Ctrl|Umschalt|Shift|Alt|Cmd)\s*\+\s*)*(?:[A-Za-z0-9]|F\d{1,2}|Entf|Del|Esc|Enter|Tab|Leertaste|Space|[+\-.,#]))\)\s*$/;
const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// title text → { head, key, body }
export function tipParts(text, hint = '') {
  const lines = String(text || '').split('\n').map(s => s.trim()).filter(Boolean);
  let head = lines.shift() || '', rest = '';
  const cut = [head.indexOf(': '), head.indexOf(' – ')].filter(i => i > 0 && i <= 48).sort((a, b) => a - b)[0];
  if (cut != null) { rest = head.slice(cut + (head[cut] === ':' ? 2 : 3)).trim(); head = head.slice(0, cut); }
  let key = '';
  const m = head.match(KEY);
  if (m) { key = m[1]; head = head.slice(0, m.index).trim(); }
  const body = [rest || hint, ...lines].filter(Boolean);
  // a whole sentence without a name in front: plain text
  if (!body.length && !key && head.length > 44) return { head: '', key: '', body: [head] };
  return { head, key, body };
}

// what the bubble of an element shows; null when there is nothing beyond the label written on it
export function tipFor(el, title) {
  const p = tipParts(title, el.dataset.hint ? t(el.dataset.hint) : '');
  const label = (el.textContent || '').trim();
  // the explanation comes from data-hint: the name is the (translated) label written on the button
  if (el.dataset.hint && label && label.length <= 40) p.head = label;
  // the tooltip is a sentence of its own: the button's name goes on top, the sentence below
  if (!p.body.length && p.head && label && label.length <= 40 && p.head !== label) { p.body = [p.head]; p.head = label; }
  if (!p.body.length && !p.key && (!p.head || p.head === label)) return null;
  return p;
}

export function initTips(enabled = () => true) {
  const box = document.createElement('div');
  box.className = 'tipbox';
  box.hidden = true;
  document.body.append(box);
  const held = new WeakMap(); // element → its title while the bubble replaces the native tooltip
  let cur = null, timer = 0, lastHide = 0;
  const giveBack = el => { if (el && held.has(el)) { if (!el.hasAttribute('title') && el.isConnected) el.setAttribute('title', held.get(el)); held.delete(el); } };
  const hide = () => {
    clearTimeout(timer); timer = 0;
    if (!box.hidden) lastHide = performance.now();
    box.hidden = true;
    giveBack(cur); cur = null;
  };
  const show = el => {
    if (!el.isConnected) return hide();
    const text = held.get(el) || '';
    const p = tipFor(el, text);
    if (!p) return;
    box.innerHTML = (p.head ? `<div class="tip-head"><b>${esc(p.head)}</b>${p.key ? `<kbd>${esc(p.key)}</kbd>` : ''}</div>` : '')
      + p.body.map(s => `<div class="tip-body">${esc(s)}</div>`).join('');
    box.hidden = false;
    const r = el.getBoundingClientRect(), w = box.offsetWidth, hgt = box.offsetHeight, W = innerWidth, H = innerHeight;
    let x = Math.round(r.left + r.width / 2 - w / 2), y = Math.round(r.bottom + 8);
    if (y + hgt > H - 6) y = Math.round(r.top - hgt - 8);
    if (y < 6) { y = Math.max(6, Math.min(H - hgt - 6, Math.round(r.top))); x = Math.round(r.right + 8); if (x + w > W - 6) x = Math.round(r.left - w - 8); }
    box.style.left = Math.max(6, Math.min(W - w - 6, x)) + 'px';
    box.style.top = y + 'px';
  };
  document.addEventListener('mouseover', e => {
    if (!enabled()) return;
    const el = e.target.closest?.('[title], [data-hint]');
    if (el === cur) return;
    hide();
    if (!el || el.closest('.tipbox') || /^(INPUT|TEXTAREA|SELECT|OPTION)$/.test(el.tagName)) return;
    const title = el.getAttribute('title') || '';
    if (!title && !el.dataset.hint) return;
    cur = el;
    held.set(el, title);
    el.removeAttribute('title'); // the browser's own tooltip would come on top of ours
    // moving from icon to icon: the next bubble comes at once
    timer = setTimeout(() => show(el), performance.now() - lastHide < 400 ? 60 : 450);
  });
  document.addEventListener('mouseout', e => { if (cur && !cur.contains(e.relatedTarget)) hide(); });
  for (const ev of ['mousedown', 'keydown', 'wheel', 'blur']) window.addEventListener(ev, hide, true);
  return { hide };
}
