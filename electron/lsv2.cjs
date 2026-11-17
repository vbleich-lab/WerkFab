// LSV2: the protocol of Heidenhain controls (iTNC 530, TNC 640, TNC 620 …) for file transfer over Ethernet –
// the one TNCremo speaks, TCP port 19000. Only what is needed to put an NC program on the control:
// log in (INSPECT, FILE), read the control type, agree on the block size, send the file, log out.
// Telegram: 4 bytes payload length (big endian), 4 ASCII letters command or answer, payload.
// Protocol as described by the open pyLSV2 library (MIT licence, github.com/drunsinn/pyLSV2).
'use strict';
const net = require('net');

const ERRORS = {
  20: 'falsches Telegrammformat', 22: 'unbekanntes Telegramm', 23: 'keine Berechtigung (Anmeldung/Passwort)', 25: 'an der Steuerung abgebrochen',
  31: 'ungültiger Dateiname', 32: 'Datei nicht gefunden', 33: 'Datei lässt sich nicht öffnen', 34: 'Datei gibt es schon', 35: 'Dateityp nicht erlaubt oder gesperrt',
  36: 'Datei lässt sich nicht löschen (geöffnet oder schreibgeschützt?)', 37: 'Datei lässt sich nicht anlegen', 45: 'kein Zugriff auf die Datei', 47: 'Verzeichnis lässt sich nicht wechseln',
  49: 'Anmeldung abgelehnt', 53: 'kein Speicherplatz frei', 55: 'Verzeichnis nicht gefunden', 56: 'falsche Betriebsart', 58: 'Zeitüberschreitung beim Zugriff', 59: 'kein Schreibzugriff',
};
const str0 = s => Buffer.concat([Buffer.from(String(s), 'latin1'), Buffer.from([0])]);

class Lsv2 {
  constructor(host, port = 19000, timeout = 10000) {
    Object.assign(this, { host, port, timeout, buf: Buffer.alloc(0), waiting: null, block: 256, secure: false, control: '' });
  }

  open() {
    return new Promise((resolve, reject) => {
      const s = net.createConnection({ host: this.host, port: this.port });
      this.sock = s;
      const fail = e => {
        s.destroy();
        const where = `${this.host}:${this.port}`;
        if (e.code === 'ECONNREFUSED') e = new Error(`Steuerung ${where} nimmt keine Verbindung an – an der Steuerung die Datenübertragung über Ethernet (LSV2, wie für TNCremo) freigeben`);
        else if (e.code === 'EHOSTUNREACH' || e.code === 'ENETUNREACH' || e.code === 'ENOTFOUND') e = new Error(`Steuerung ${where} nicht erreichbar – IP-Adresse und Netzwerk prüfen`);
        reject(e);
      };
      s.setTimeout(this.timeout, () => fail(new Error(`Keine Antwort von ${this.host}:${this.port} – Steuerung an, Netzwerk und IP-Adresse prüfen`)));
      s.once('error', fail);
      s.once('connect', () => { s.removeListener('error', fail); s.on('error', e => this.fail(e)); resolve(); });
      s.on('data', d => { this.buf = Buffer.concat([this.buf, d]); this.pump(); });
      s.on('close', () => this.fail(new Error('Verbindung von der Steuerung getrennt')));
    });
  }

  fail(e) { const w = this.waiting; this.waiting = null; if (w) w.reject(e); }

  pump() {
    if (!this.waiting || this.buf.length < 8) return;
    const len = this.buf.readUInt32BE(0);
    if (this.buf.length < 8 + len) return;
    const cmd = this.buf.toString('latin1', 4, 8), data = this.buf.subarray(8, 8 + len);
    this.buf = this.buf.subarray(8 + len);
    const w = this.waiting;
    this.waiting = null;
    clearTimeout(w.timer);
    w.resolve({ cmd, data });
  }

  // one telegram; answer = false: nothing comes back
  send(cmd, payload = Buffer.alloc(0), answer = true) {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(payload.length, 0);
    const t = Buffer.concat([head, Buffer.from(cmd, 'latin1'), payload]);
    if (t.length > this.block) throw new Error(`Telegramm zu lang (${t.length} > ${this.block} Byte)`);
    if (!answer) { this.sock.write(t); return Promise.resolve(null); }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error(`Keine Antwort der Steuerung auf ${cmd}`)), this.timeout);
      this.waiting = { resolve, reject, timer };
      this.sock.write(t);
      this.pump();
    });
  }

  // a telegram that must be answered with `expect` (T_OK if not given); T_ER becomes an error with its text
  async must(cmd, payload, expect = 'T_OK', what = cmd) {
    const r = await this.send(cmd, payload);
    if (r.cmd === expect) return r.data;
    throw this.err(r, what);
  }

  err(r, what) {
    if (r.cmd === 'T_ER' || r.cmd === 'T_BD') {
      const code = r.data.length >= 2 ? r.data[1] : 0;
      const e = new Error(`${what}: ${ERRORS[code] || 'Fehler ' + code}`);
      e.code = code;
      return e;
    }
    return new Error(`${what}: unerwartete Antwort ${r.cmd}`);
  }

  async login(name, password) {
    await this.must('A_LG', Buffer.concat([str0(name), ...(password ? [str0(password)] : [])]), 'T_OK', `Anmeldung ${name}`);
  }

  // log in, control type, block size, secure transfer
  async start(password) {
    await this.open();
    await this.login('INSPECT');
    const v = await this.must('R_VR', undefined, 'S_VR', 'Version lesen');
    this.control = v.toString('latin1').split('\0')[0].trim();
    try {
      const p = await this.must('R_PR', undefined, 'S_PR', 'Parameter lesen');
      const max = p.length >= 100 ? p.readUInt16BE(98) : 256;
      const opts = [[4096, 7], [3072, 6], [2048, 5], [1024, 3], [512, 4]];
      const pick = opts.find(([n]) => max >= n);
      if (pick) {
        const b = Buffer.alloc(2);
        b.writeUInt16BE(pick[1], 0);
        const r = await this.send('C_CC', b);
        if (r.cmd === 'T_OK') this.block = pick[0];
      }
      const s = Buffer.alloc(2);
      s.writeUInt16BE(19, 0);
      this.secure = (await this.send('C_CC', s)).cmd === 'T_OK';
    } catch { /* old control: 256 byte blocks */ }
    await this.login('FILE', password);
  }

  // a text file to the control (path with backslashes, e.g. TNC:\nc_prog\1001.h)
  async putFile(path, data, overwrite = true, onProgress = null) {
    const name = String(path).replace(/\//g, '\\');
    const open = () => this.send('C_FL', Buffer.concat([str0(name), Buffer.from([0])]));
    let r = await open();
    if ((r.cmd === 'T_ER' || r.cmd === 'T_BD') && r.data[1] === 34 && overwrite) {
      const d = await this.send('C_FD', str0(name));
      if (d.cmd !== 'T_OK') throw this.err(d, 'Alte Datei löschen');
      r = await open();
    }
    if (r.cmd !== 'T_OK') throw this.err(r, `Datei ${name} anlegen`);
    const step = this.block - 10;
    for (let at = 0; at < data.length; at += step) {
      const rr = await this.send('S_FL', data.subarray(at, at + step));
      if (rr.cmd !== 'T_OK') throw this.err(rr, 'Daten senden');
      onProgress?.(Math.min(1, (at + step) / data.length));
    }
    if (this.secure) await this.must('T_FD', undefined, 'T_OK', 'Übertragung abschließen');
    else await this.send('T_FD', undefined, false);
  }

  async close() {
    try { if (this.sock && !this.sock.destroyed) await this.send('A_LO', Buffer.alloc(0), false); } catch { /* closing anyway */ }
    this.waiting = null;
    const s = this.sock;
    if (!s) return;
    s.removeAllListeners('close');
    s.removeAllListeners('timeout');
    s.on('error', () => {});
    // end() sends what is still queued (T_FD, A_LO) before it closes; destroy only if the control does not close
    await new Promise(res => { s.end(res); setTimeout(res, 1500).unref(); });
    s.destroy();
  }
}

// whole job: connect, send, log out. text: the NC program (line ends become CR LF, as on the control)
async function sendProgram({ host, port, password, dir, name, text, overwrite = true }, onProgress) {
  const c = new Lsv2(host, +port || 19000);
  try {
    await c.start(password);
    const folder = String(dir || 'TNC:\\nc_prog\\').replace(/\//g, '\\').replace(/\\?$/, '\\');
    const data = Buffer.from(String(text).replace(/\r?\n/g, '\r\n'), 'latin1');
    await c.putFile(folder + name, data, overwrite, onProgress);
    return { ok: true, control: c.control, path: folder + name, bytes: data.length, block: c.block };
  } finally {
    await c.close();
  }
}

// only connect and read the control type ("Verbindung testen")
async function testConnection({ host, port, password }) {
  const c = new Lsv2(host, +port || 19000);
  try {
    await c.start(password);
    return { ok: true, control: c.control, block: c.block };
  } finally {
    await c.close();
  }
}

module.exports = { Lsv2, sendProgram, testConnection, ERRORS };
