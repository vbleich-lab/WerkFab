// NC programs to controls that do not speak LSV2 (Sinumerik, Fanuc, Haas, Mazak, LinuxCNC …):
//   ftp:   FTP client (passive mode) – Sinumerik 840D sl / 828D, Fanuc with the FTP option, Haas, PCs at machines
//   share: copy into a network folder (\\machine\share or a mapped drive)
//   dnc:   drip feed over a serial device server (RS-232 ↔ Ethernet, raw TCP): the program streams to the control
//          while it runs, XON/XOFF from the control pauses and resumes the stream
'use strict';
const net = require('net');
const fs = require('fs');
const path = require('path');

const crlf = t => String(t).replace(/\r?\n/g, '\r\n');

// ----- FTP -----
class Ftp {
  constructor(host, port = 21, timeout = 15000) { Object.assign(this, { host, port, timeout, buf: '', waiting: [], lines: [], ready: [] }); }

  open() {
    return new Promise((resolve, reject) => {
      const s = net.createConnection({ host: this.host, port: this.port });
      this.sock = s;
      s.setEncoding('latin1');
      const fail = e => {
        s.destroy();
        const where = `${this.host}:${this.port}`;
        if (e.code === 'ECONNREFUSED') e = new Error(`${where} nimmt keine FTP-Verbindung an – FTP an der Steuerung einschalten (Sinumerik: Freigabe in den Netzwerkeinstellungen, Fanuc: FTP-Option)`);
        else if (['EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND'].includes(e.code)) e = new Error(`${where} nicht erreichbar – IP-Adresse und Netzwerk prüfen`);
        reject(e);
      };
      s.setTimeout(this.timeout, () => fail(new Error(`Keine Antwort von ${this.host}:${this.port}`)));
      s.once('error', fail);
      s.on('data', d => { this.buf += d; this.pump(); });
      s.once('connect', () => { s.removeListener('error', fail); s.on('error', e => this.failAll(e)); this.reply().then(r => (r.code === 220 ? resolve() : reject(new Error(`FTP: ${r.text}`))), reject); });
    });
  }

  failAll(e) { for (const w of this.waiting.splice(0)) w.reject(e); }

  // one reply (multi-line "123-…" up to "123 …")
  pump() {
    for (;;) {
      const i = this.buf.indexOf('\n');
      if (i < 0) return;
      const line = this.buf.slice(0, i).replace(/\r$/, '');
      this.buf = this.buf.slice(i + 1);
      this.lines.push(line);
      const m = /^(\d{3})([ -])/.exec(line), first = /^(\d{3})-/.exec(this.lines[0]);
      if (m && m[2] === ' ' && (!first || first[1] === m[1])) {
        const text = this.lines.join('\n');
        this.lines = [];
        const w = this.waiting.shift();
        if (w) { clearTimeout(w.timer); w.resolve({ code: +m[1], text }); } else this.ready.push({ code: +m[1], text });
      }
    }
  }

  reply() {
    if (this.ready.length) return Promise.resolve(this.ready.shift());
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.failAll(new Error('FTP: keine Antwort')), this.timeout);
      this.waiting.push({ resolve, reject, timer });
      this.pump();
    });
  }

  async cmd(c, ok, what = c.split(' ')[0]) {
    this.sock.write(c + '\r\n');
    const r = await this.reply();
    if (!ok.includes(Math.floor(r.code / 100)) && !ok.includes(r.code)) throw new Error(`FTP ${what}: ${r.text.split('\n').pop()}`);
    return r;
  }

  async login(user, password) {
    const r = await this.cmd(`USER ${user || 'anonymous'}`, [2, 3], 'USER');
    if (r.code === 331 || r.code === 332) await this.cmd(`PASS ${password || ''}`, [2], 'Anmeldung');
    await this.cmd('TYPE I', [2]);
  }

  // passive data connection; fn(socket) writes or reads
  async data(command, fn) {
    const p = await this.cmd('PASV', [2]);
    const m = /(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)/.exec(p.text);
    if (!m) throw new Error('FTP: Antwort auf PASV unverständlich');
    // the address from PASV is often an internal one: the host of the control connection is used
    const port = (+m[5] << 8) + +m[6];
    const ds = net.createConnection({ host: this.host, port });
    await new Promise((res, rej) => { ds.once('connect', res); ds.once('error', rej); });
    this.sock.write(command + '\r\n');
    const pre = await this.reply();
    if (pre.code >= 400) { ds.destroy(); throw new Error(`FTP ${command.split(' ')[0]}: ${pre.text.split('\n').pop()}`); }
    const out = await fn(ds);
    const done = await this.reply();
    if (done.code >= 400) throw new Error(`FTP ${command.split(' ')[0]}: ${done.text.split('\n').pop()}`);
    return out;
  }

  async close() {
    try { this.sock.write('QUIT\r\n'); } catch { /* closing anyway */ }
    await new Promise(r => { this.sock.end(r); setTimeout(r, 800).unref(); });
    this.sock.destroy();
  }
}

async function ftpSend({ host, port, user, password, dir, name, text }, onProgress) {
  const f = new Ftp(host, +port || 21);
  await f.open();
  try {
    await f.login(user, password);
    if (dir) await f.cmd(`CWD ${dir}`, [2], 'Ordner wechseln');
    const data = Buffer.from(crlf(text), 'latin1');
    await f.data(`STOR ${name}`, ds => new Promise((res, rej) => {
      ds.once('error', rej);
      const step = 16384;
      let at = 0;
      const more = () => {
        while (at < data.length) {
          const ok = ds.write(data.subarray(at, at + step));
          at += step;
          onProgress?.(Math.min(1, at / data.length));
          if (!ok) return ds.once('drain', more);
        }
        ds.end(res);
      };
      more();
    }));
    return { ok: true, control: 'FTP', path: (dir ? dir.replace(/\/?$/, '/') : '') + name, bytes: data.length };
  } finally { await f.close(); }
}

async function ftpGet({ host, port, user, password, path: p }, onProgress) {
  const f = new Ftp(host, +port || 21);
  await f.open();
  try {
    await f.login(user, password);
    const parts = [];
    let got = 0;
    await f.data(`RETR ${p}`, ds => new Promise((res, rej) => {
      ds.on('data', d => { parts.push(d); got += d.length; onProgress?.(got); });
      ds.once('end', res);
      ds.once('error', rej);
    }));
    const data = Buffer.concat(parts);
    return { ok: true, control: 'FTP', path: p, bytes: data.length, text: data.toString('latin1') };
  } finally { await f.close(); }
}

// ----- network folder -----
async function shareSend({ dir, name, text, overwrite = true }) {
  if (!dir) throw new Error('Netzwerkordner angeben (z. B. \\\\MASCHINE\\NC oder Z:\\NC)');
  const file = path.join(dir, name);
  try { await fs.promises.access(dir); } catch { throw new Error(`Ordner ${dir} nicht erreichbar – Freigabe, Anmeldung und Netzwerk prüfen`); }
  if (!overwrite) { try { await fs.promises.access(file); throw new Error(`Datei ${file} gibt es schon`); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
  const data = Buffer.from(crlf(text), 'latin1');
  await fs.promises.writeFile(file, data);
  return { ok: true, control: 'Netzwerkordner', path: file, bytes: data.length };
}

async function shareGet({ path: p }) {
  const data = await fs.promises.readFile(p);
  return { ok: true, control: 'Netzwerkordner', path: p, bytes: data.length, text: data.toString('latin1') };
}

// ----- DNC over a serial device server -----
// Stream framed by % with a leader of NULs; XOFF (DC3, 0x13) from the control pauses, XON (DC1, 0x11) resumes.
// The control usually waits in "Abarbeiten extern" / TAPE / DNC mode and pulls as fast as it machines.
// TCP and the device server buffer a lot: the stream is paced to the baud rate of the serial line (10 bits per
// character), so it is never more than a fraction of a second ahead of the control and an XOFF takes effect at once.
// baud 0 = no pacing (the device server does the flow control on its serial side).
const XON = 0x11, XOFF = 0x13;
function dncSend({ host, port, text, xonxoff = true, baud = 9600, leader = 20, startTimeout = 300000, tick = 25 }, onProgress) {
  return new Promise((resolve, reject) => {
    const body = crlf(text).replace(/^\s*%\s*\r\n/, '').replace(/\r\n\s*%\s*(\r\n)?$/, '');
    const data = Buffer.concat([Buffer.alloc(leader), Buffer.from('%\r\n' + body + '\r\n%\r\n', 'latin1'), Buffer.alloc(leader)]);
    const s = net.createConnection({ host, port: +port || 4001 });
    const perTick = baud > 0 ? Math.max(1, Math.round(((+baud / 10) * tick) / 1000)) : 4096;
    let at = 0, paused = false, done = false, timer = null, waitSince = Date.now(), draining = false;
    const finish = e => {
      if (done) return;
      done = true;
      clearInterval(timer);
      if (e) { s.destroy(); reject(e); return; }
      s.end(() => { s.destroy(); resolve({ ok: true, control: 'DNC', path: `${host}:${+port || 4001}`, bytes: data.length }); });
    };
    const step = () => {
      if (done || draining) return;
      if (paused) {
        // the control has not started reading at all within the start time
        if (at <= leader + 3 && startTimeout > 0 && Date.now() - waitSince > startTimeout) finish(new Error('Steuerung liest nicht – an der Steuerung „Abarbeiten extern“ / DNC starten'));
        return;
      }
      const piece = data.subarray(at, at + perTick);
      at += piece.length;
      onProgress?.(at / data.length);
      if (!s.write(piece)) { draining = true; s.once('drain', () => { draining = false; }); }
      if (at >= data.length) finish();
    };
    s.once('error', e => {
      if (e.code === 'ECONNREFUSED') e = new Error(`${host}:${+port || 4001} nimmt keine Verbindung an – Port des Seriell-Ethernet-Wandlers prüfen (Betriebsart „TCP Server“, raw)`);
      else if (['EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND'].includes(e.code)) e = new Error(`${host} nicht erreichbar – IP-Adresse und Netzwerk prüfen`);
      finish(e);
    });
    s.on('data', d => {
      if (!xonxoff) return;
      for (const b of d) {
        if (b === XOFF) { paused = true; waitSince = Date.now(); } else if (b === XON) paused = false;
      }
    });
    s.on('close', () => { if (!done) finish(at >= data.length ? null : new Error('Verbindung getrennt, bevor das Programm ganz übertragen war')); });
    s.once('connect', () => {
      s.setNoDelay(true);
      timer = setInterval(step, tick);
      step();
    });
  });
}

module.exports = { Ftp, ftpSend, ftpGet, shareSend, shareGet, dncSend, XON, XOFF };
