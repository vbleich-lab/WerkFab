# Prüfliste: WerkFab an der echten Maschine

Diese Liste prüft die Verbindung zwischen WerkFab und einer Steuerung: Senden, Zurückholen, Vergleichen und die Werkzeugtabelle. Die Funktionen sind bisher nur gegen den Programmcode getestet, nie an einer echten Steuerung.

**Bei diesem Test wird nichts zerspant.** Es werden nur Dateien übertragen.

## Vorbereitung

- [ ] WerkFab **Desktop-App** (die Maschinenfunktionen fehlen in der Browserversion), Version notieren: ______
- [ ] Steuerung und Software-Stand notieren: ______ (z. B. TNC 640, 34059x-10)
- [ ] An der Steuerung die Datenübertragung über Ethernet freigeben (Heidenhain: wie für TNCremo, LSV2, Port 19000). PC und Steuerung im selben Netz, die IP-Adresse der Steuerung notieren: ______
- [ ] **Sicherung der Werkzeugtabelle** (TOOL.T) und des Zielordners anlegen, z. B. mit TNCremo oder einem USB-Stick.
- [ ] An der Steuerung einen leeren **Testordner** anlegen, z. B. `TNC:\nc_prog\WERKFAB\`. Alle Tests schreiben nur dorthin.
- [ ] Ein harmloses Testprogramm in WerkFab: Fertigung → beliebige Operation → NC-Programm erzeugen. Das Programm wird nur übertragen, nicht gestartet.

## 1. Verbindung einrichten

Im Fenster des NC-Programms unten auf **⚙** klicken.

- [ ] Steuerung / Weg wählen (TNC 640 / TNC 620, iTNC 530, FTP, Netzwerkordner oder DNC)
- [ ] IP-Adresse eintragen, Port leer lassen (Standard)
- [ ] **Zielordner** = der Testordner von oben
- [ ] „Vorhandenes Programm überschreiben“ für den ersten Test **aus**
- [ ] „Verbindung jetzt testen“ an → Speichern

| Erwartet | Ergebnis |
|---|---|
| Statuszeile: „Verbindung in Ordnung: …“ mit Steuerungstyp (bei LSV2 auch Blockgröße) | |
| Bei falscher IP: verständliche Fehlermeldung nach wenigen Sekunden, kein Hängen | |

## 2. Programm senden

Im Fenster des NC-Programms auf **➜ An Maschine senden** klicken.

| Prüfung | Erwartet | Ergebnis |
|---|---|---|
| Rückfrage | nennt Steuerung, IP und Zielordner | |
| Übertragung | Statuszeile „✓ … übertragen (… Byte)“; die Bytezahl passt zur Dateigröße; das Programm steht im Testordner | |
| Dateiname | Heidenhain `.h` (Klartext) bzw. `.i` (ISO); keine Umlaute oder Sonderzeichen | |
| Inhalt | an der Steuerung öffnen: gleiche Satzanzahl wie in WerkFab, Umlaute in Kommentaren lesbar | |
| Steuerung prüft das Programm | keine Syntaxfehler beim Öffnen / in der Programmtest-Grafik | |
| zweites Senden, Überschreiben aus | „⚠ Senden fehlgeschlagen: …“ mit verständlichem Grund (Datei vorhanden); nichts wird überschrieben | |
| zweites Senden, Überschreiben an | Programm wird ersetzt | |
| großes Programm (> 1 MB, z. B. 3D-Schlichten) | Fortschritt in % in der Statuszeile, wird vollständig übertragen | |

## 3. Zurückholen und vergleichen

An der Steuerung im gesendeten Programm einen Vorschub ändern und speichern. Dann in WerkFab **⇣ Mit Maschine vergleichen**.

- [ ] Die geänderte Zeile wird als Unterschied angezeigt, sonst keine.
- [ ] Ein Programm, das es an der Steuerung nicht gibt: verständliche Meldung.

## 4. Werkzeugtabelle (nur Heidenhain)

Werkzeugbibliothek → **Werkzeugtabelle der Maschine lesen (TOOL.T) und mit der Bibliothek vergleichen**.

- [ ] TOOL.T wird gelesen (iTNC 530: `TNC:\TOOL.T`, TNC 640: `TNC:\table\tool.t`).
- [ ] Werkzeugnummern, Längen (L) und Radien (R) stimmen mit der Anzeige an der Steuerung überein.
- [ ] Werkzeuge, die das Programm braucht und die in der Maschine fehlen, werden genannt.
- [ ] **TOOL.T an der Steuerung ist danach unverändert** (WerkFab liest nur).

## 5. Weitere Wege (falls vorhanden)

| Weg | Prüfung | Ergebnis |
|---|---|---|
| FTP (Sinumerik, Fanuc, Haas …) | Benutzer/Passwort, Senden in den Testordner, Zurückholen | |
| Netzwerkordner | Senden in einen freigegebenen Ordner, Datei dort vorhanden | |
| DNC über Seriell-Ethernet-Wandler | an der Steuerung „Abarbeiten extern“ / Einlesen starten, dann senden; Baudrate und XON/XOFF wie an der Steuerung; das Programm kommt vollständig an (Satzanzahl) | |

## Ergebnis zurückmelden

Bitte auf GitHub ein Issue mit der Vorlage „Fehler melden“ anlegen (Bereich „NC-Programm, Postprozessor, Senden an die Maschine“). Dort Steuerung, Software-Stand und diese Liste mit Ergebnissen eintragen, auch wenn alles funktioniert hat. **Keine Programme von Kunden anhängen.**

> ⚠ Jedes NC-Programm vor dem ersten Lauf an der Maschine prüfen: im Probelauf (Einzelsatz, reduzierter Eilgang) oder in einem externen NC-Simulator.
