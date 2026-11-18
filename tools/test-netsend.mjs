// Sending NC programs to controls without LSV2 (electron/netsend.cjs): FTP against a simulated FTP server of a
// control, copying into a network folder, drip feed (DNC) through a simulated serial device server that pauses
// the stream with XOFF and resumes it with XON.
// Run: npm run test:netsend
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const { ftpSend, ftpGet, shareSend, shareGet, dncSend, XON, XOFF } = createRequire(import.meta.url)('../electron/netsend.cjs');

const ok = (n, c, x = '') => { console.log((c ? 'OK   ' : 'FEHL ') + n + '  ' + x); if (!c) process.exitCode = 1; };
const prog = ['%', 'O1001 (TEST)', ...Array.from({ length: 3000 }, (_, i) => `N${i + 1} G1 X${i}.5 Y-${i} F800`), 'M30', '%'].join('\n');

// an FTP server as on a control: user / password, folders, passive mode
function fakeFtp({ user = 'ftpuser', password = 'geheim' } = {}) {
  const files = new Map([['/NC/ALT.MPF', Buffer.from('alt')]]), log = [];
  const server = net.createServer(c => {
    let cwd = '/', authed = false, pasv = null, who = '';
    c.setEncoding('latin1');
    const say = t => c.write(t + '\r\n');
    say('220 Steuerung FTP bereit');
    let buf = '';
    c.on('data', d => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        const [cmd, ...rest] = line.split(' '), arg = rest.join(' ');
        log.push(cmd);
        const full = p => (p.startsWith('/') ? p : cwd.replace(/\/?$/, '/') + p);
        if (cmd === 'USER') { who = arg; say('331 Passwort bitte'); }
        else if (cmd === 'PASS') { if (who === user && arg === password) { authed = true; say('230 angemeldet'); } else say('530 Anmeldung fehlgeschlagen'); }
        else if (!authed) say('530 nicht angemeldet');
        else if (cmd === 'TYPE') say('200 ok');
        else if (cmd === 'CWD') { if (arg === '/NC' || arg === 'NC') { cwd = '/NC'; say('250 ok'); } else say('550 Ordner gibt es nicht'); }
        else if (cmd === 'PASV') {
          pasv = net.createServer();
          pasv.conn = new Promise(res => pasv.once('connection', res));
          pasv.listen(0, '127.0.0.1', () => { const p = pasv.address().port; say(`227 Entering Passive Mode (10,0,0,1,${p >> 8},${p & 255})`); });
        } else if (cmd === 'STOR' || cmd === 'RETR') {
          const name = full(arg), srv = pasv;
          srv.conn.then(ds => {
            if (cmd === 'STOR') {
              const parts = [];
              ds.on('data', d => parts.push(d));
              ds.on('end', () => { files.set(name, Buffer.concat(parts)); say('226 gespeichert'); srv.close(); });
            } else ds.end(files.get(name), () => { say('226 fertig'); srv.close(); });
          });
          if (cmd === 'RETR' && !files.has(name)) { say('550 Datei gibt es nicht'); srv.close(); }
          else say('150 Daten kommen');
        } else if (cmd === 'QUIT') { say('221 tschüss'); c.end(); }
        else say('502 unbekannt');
      }
    });
    c.on('error', () => {});
  });
  return new Promise(res => server.listen(0, '127.0.0.1', () => res({ port: server.address().port, files, log, close: () => server.close() })));
}

{
  const f = await fakeFtp();
  const r = await ftpSend({ host: '127.0.0.1', port: f.port, user: 'ftpuser', password: 'geheim', dir: '/NC', name: 'TEIL1.MPF', text: prog });
  await new Promise(r2 => setTimeout(r2, 150)); // QUIT reaches the server
  const got = f.files.get('/NC/TEIL1.MPF');
  ok('FTP: Programm übertragen (Sinumerik-Ordner, CR LF)', r.ok && got && got.toString('latin1') === prog.replace(/\n/g, '\r\n'), `${r.bytes} Byte`);
  ok('FTP: Anmeldung, binär, Ordner, passiv', ['USER', 'PASS', 'TYPE', 'CWD', 'PASV', 'STOR', 'QUIT'].every(c => f.log.includes(c)));
  const g = await ftpGet({ host: '127.0.0.1', port: f.port, user: 'ftpuser', password: 'geheim', path: '/NC/TEIL1.MPF' });
  ok('FTP: Programm zurückholen', g.ok && g.text === prog.replace(/\n/g, '\r\n'));
  let e = null;
  try { await ftpSend({ host: '127.0.0.1', port: f.port, user: 'ftpuser', password: 'falsch', name: 'A.MPF', text: 'x' }); } catch (x) { e = x; }
  ok('FTP: falsches Passwort → Meldung', /Anmeldung fehlgeschlagen/.test(e?.message || ''), e?.message);
  e = null;
  try { await ftpSend({ host: '127.0.0.1', port: f.port, user: 'ftpuser', password: 'geheim', dir: '/GIBTSNICHT', name: 'A.MPF', text: 'x' }); } catch (x) { e = x; }
  ok('FTP: fehlender Ordner → Meldung', /Ordner wechseln: 550/.test(e?.message || ''), e?.message);
  e = null;
  try { await ftpGet({ host: '127.0.0.1', port: f.port, user: 'ftpuser', password: 'geheim', path: '/NC/FEHLT.MPF' }); } catch (x) { e = x; }
  ok('FTP: fehlende Datei → Meldung', /RETR: 550/.test(e?.message || ''), e?.message);
  f.close();
}
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'werkfab-share-'));
  const r = await shareSend({ dir, name: 'O1001.NC', text: prog });
  ok('Netzwerkordner: Datei geschrieben', r.ok && fs.readFileSync(path.join(dir, 'O1001.NC'), 'latin1') === prog.replace(/\n/g, '\r\n'));
  let e = null;
  try { await shareSend({ dir, name: 'O1001.NC', text: 'x', overwrite: false }); } catch (x) { e = x; }
  ok('Netzwerkordner: ohne Überschreiben → Meldung', /gibt es schon/.test(e?.message || ''), e?.message);
  const g = await shareGet({ path: path.join(dir, 'O1001.NC') });
  ok('Netzwerkordner: zurücklesen', g.text === prog.replace(/\n/g, '\r\n'));
  e = null;
  try { await shareSend({ dir: path.join(dir, 'fehlt'), name: 'A.NC', text: 'x' }); } catch (x) { e = x; }
  ok('Netzwerkordner: fehlender Ordner → Meldung', /nicht erreichbar/.test(e?.message || ''), e?.message);
  fs.rmSync(dir, { recursive: true, force: true });
}
{
  // a serial device server in front of a control that reads slowly: XOFF after every 4 kB, XON 60 ms later
  let received = Buffer.alloc(0), duringPause = 0, pauses = 0, paused = false;
  const server = net.createServer(c => {
    let sinceXoff = 0;
    c.on('data', d => {
      received = Buffer.concat([received, d]);
      if (paused) duringPause += d.length;
      sinceXoff += d.length;
      if (!paused && sinceXoff > 4096) {
        paused = true; pauses++; sinceXoff = 0;
        c.write(Buffer.from([XOFF]));
        // what was already on the way when XOFF went out is allowed; after a short while nothing more may come
        setTimeout(() => { duringPause = 0; }, 15);
        setTimeout(() => { paused = false; c.write(Buffer.from([XON])); }, 60);
      }
    });
    c.on('error', () => {});
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const steps = [];
  const short = prog.split('\n').slice(0, 600).join('\n') + '\nM30\n%';
  const t0 = Date.now();
  const r = await dncSend({ host: '127.0.0.1', port: server.address().port, text: short, baud: 115200 }, f => steps.push(f));
  const ms = Date.now() - t0;
  await new Promise(r2 => setTimeout(r2, 100));
  const txt = received.toString('latin1').replace(/\0/g, '');
  ok('DNC: ganzes Programm mit % umrahmt angekommen', r.ok && txt === short.replace(/\n/g, '\r\n') + '\r\n', `${received.length} Byte, ${pauses} Pausen`);
  ok('DNC: Vorlauf aus Nullzeichen', received[0] === 0 && received.subarray(0, 20).every(b => b === 0));
  ok('DNC: Tempo der seriellen Leitung (115200 Baud)', ms > 0.8 * received.length / 11.52, ms + ' ms');
  ok('DNC: XOFF hält den Strom an', pauses >= 3 && duringPause <= 400, `nach XOFF noch ${duringPause} Byte`);
  ok('DNC: Fortschritt bis 100 %', steps.length > 10 && steps[steps.length - 1] === 1);
  server.close();
  let e = null;
  const s = net.createServer(); await new Promise(r2 => s.listen(0, '127.0.0.1', r2)); const port = s.address().port; s.close();
  try { await dncSend({ host: '127.0.0.1', port, text: 'x' }); } catch (x) { e = x; }
  ok('DNC: kein Wandler erreichbar → Meldung', /nimmt keine Verbindung an/.test(e?.message || ''), e?.message);
}
