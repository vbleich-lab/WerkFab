// LSV2 (electron/lsv2.cjs) against a simulated Heidenhain control: log in, version, block size, sending a program
// (also over an existing file), errors of the control as German text.
// Run: npm run test:lsv2
import net from 'node:net';
import { createRequire } from 'node:module';
const { sendProgram, testConnection } = createRequire(import.meta.url)('../electron/lsv2.cjs');

const ok = (n, c, x = '') => { console.log((c ? 'OK   ' : 'FEHL ') + n + '  ' + x); if (!c) process.exitCode = 1; };

// a control: files in a Map, every telegram is logged
function fakeControl({ control = 'TNC640', maxBlock = 4096, secure = true, password = null, readonly = false } = {}) {
  const files = new Map([['TNC:\\nc_prog\\ALT.h', Buffer.from('alt')]]), log = [];
  let open = null, block = 256, reading = null;
  const server = net.createServer(sock => {
    let buf = Buffer.alloc(0);
    const reply = (cmd, data = Buffer.alloc(0)) => { const h = Buffer.alloc(4); h.writeUInt32BE(data.length, 0); sock.write(Buffer.concat([h, Buffer.from(cmd), data])); };
    const err = code => reply('T_ER', Buffer.from([1, code]));
    sock.on('data', d => {
      buf = Buffer.concat([buf, d]);
      while (buf.length >= 8 && buf.length >= 8 + buf.readUInt32BE(0)) {
        const len = buf.readUInt32BE(0), cmd = buf.toString('latin1', 4, 8), data = buf.subarray(8, 8 + len);
        buf = buf.subarray(8 + len);
        log.push({ cmd, len: 8 + len, block });
        if (8 + len > block) { err(20); continue; }
        const strs = data.toString('latin1').split('\0');
        if (cmd === 'A_LG') { if (strs[0] === 'FILE' && password && strs[1] !== password) err(49); else reply('T_OK'); }
        else if (cmd === 'R_VR') reply('S_VR', Buffer.from([control, '340595 08', 'PLC', 'options', ''].join('\u0000'), 'latin1'));
        else if (cmd === 'R_PR') { const p = Buffer.alloc(120); p.writeUInt16BE(maxBlock, 98); reply('S_PR', p); }
        else if (cmd === 'C_CC') {
          const c = data.readUInt16BE(0), size = { 3: 1024, 4: 512, 5: 2048, 6: 3072, 7: 4096 }[c];
          if (size && size <= maxBlock) { reply('T_OK'); block = size; } else if (c === 19 && secure) reply('T_OK'); else err(24);
        } else if (cmd === 'C_FL') {
          const name = strs[0];
          if (readonly) err(59); else if (files.has(name)) err(34); else { open = { name, parts: [] }; reply('T_OK'); }
        } else if (cmd === 'C_FD') { files.delete(strs[0]); reply('T_OK'); }
        else if (cmd === 'S_FL') { open.parts.push(Buffer.from(data)); reply('T_OK'); }
        else if (cmd === 'T_FD') { files.set(open.name, Buffer.concat(open.parts)); open = null; if (secure) reply('T_OK'); }
        else if (cmd === 'R_FL') {
          // text mode: lines separated by NUL, sent in blocks the client confirms with T_OK
          const f = files.get(strs[0]);
          if (!f) err(32);
          else {
            const raw = Buffer.from(f.toString('latin1').split('\r\n').join('\u0000'), 'latin1'), q = [];
            for (let at = 0; at < raw.length; at += block - 8) q.push(raw.subarray(at, at + block - 8));
            reading = q;
            reply('S_FL', reading.shift());
          }
        } else if (cmd === 'T_OK') { if (reading) { if (reading.length) reply('S_FL', reading.shift()); else { reading = null; reply('T_FD'); } } }
        else if (cmd === 'A_LO') sock.end();
        else err(22);
      }
    });
  });
  return new Promise(res => server.listen(0, '127.0.0.1', () => res({ port: server.address().port, files, log, close: () => server.close() })));
}

const settle = () => new Promise(r => setTimeout(r, 150)); // the simulated control reads the last telegrams
const prog = Array.from({ length: 400 }, (_, i) => `${i} L X+${i} Y+0 R0 FMAX`).join('\n');

{
  const c = await fakeControl();
  const r = await sendProgram({ host: '127.0.0.1', port: c.port, dir: 'TNC:/nc_prog', name: '1001.h', text: prog });
  await settle();
  const got = c.files.get('TNC:\\nc_prog\\1001.h');
  ok('LSV2: Programm übertragen (TNC 640)', r.ok && r.control === 'TNC640' && got && got.toString('latin1') === prog.replace(/\n/g, '\r\n'), `${r.bytes} Byte, Block ${r.block}`);
  ok('LSV2: Anmeldung INSPECT, dann FILE', c.log.filter(l => l.cmd === 'A_LG').length === 2 && c.log.findIndex(l => l.cmd === 'R_VR') < c.log.findIndex(l => l.cmd === 'C_FL'));
  ok('LSV2: Puffer 4096 vereinbart, Blöcke passen', r.block === 4096 && c.log.filter(l => l.cmd === 'S_FL').length === Math.ceil(got.length / 4086) && c.log.every(l => l.len <= l.block));
  ok('LSV2: am Ende abgemeldet', c.log[c.log.length - 1].cmd === 'A_LO');
  const r2 = await sendProgram({ host: '127.0.0.1', port: c.port, dir: 'TNC:\\nc_prog\\', name: 'ALT.h', text: 'neu' });
  ok('LSV2: vorhandene Datei wird ersetzt', r2.ok && c.files.get('TNC:\\nc_prog\\ALT.h').toString() === 'neu' && c.log.some(l => l.cmd === 'C_FD'));
  let e = null;
  try { await sendProgram({ host: '127.0.0.1', port: c.port, dir: 'TNC:\\nc_prog\\', name: 'ALT.h', text: 'x', overwrite: false }); } catch (x) { e = x; }
  ok('LSV2: ohne Überschreiben → Meldung', /gibt es schon/.test(e?.message || ''), e?.message);
  c.close();
}
{
  // iTNC 530 with small blocks and without secure transfer
  const c = await fakeControl({ control: 'iTNC530', maxBlock: 512, secure: false });
  const r = await sendProgram({ host: '127.0.0.1', port: c.port, dir: 'TNC:\\', name: 'TEIL.H', text: prog });
  await settle();
  ok('LSV2: iTNC 530 mit 512-Byte-Blöcken', r.ok && r.block === 512 && c.files.get('TNC:\\TEIL.H')?.length === r.bytes && c.log.every(l => l.len <= l.block), `${c.log.filter(l => l.cmd === 'S_FL').length} Blöcke`);
  const t = await testConnection({ host: '127.0.0.1', port: c.port });
  ok('LSV2: Verbindung testen liefert Steuerungstyp', t.ok && t.control === 'iTNC530');
  c.close();
}
{
  const c = await fakeControl({ password: 'geheim' });
  let e = null;
  try { await sendProgram({ host: '127.0.0.1', port: c.port, name: 'A.h', text: 'x', password: 'falsch' }); } catch (x) { e = x; }
  ok('LSV2: falsches Passwort → Meldung', /Anmeldung FILE: Anmeldung abgelehnt/.test(e?.message || ''), e?.message);
  const r = await sendProgram({ host: '127.0.0.1', port: c.port, name: 'A.h', text: 'x', password: 'geheim' });
  ok('LSV2: richtiges Passwort', r.ok && c.files.has('TNC:\\nc_prog\\A.h'));
  c.close();
  const ro = await fakeControl({ readonly: true });
  e = null;
  try { await sendProgram({ host: '127.0.0.1', port: ro.port, name: 'A.h', text: 'x' }); } catch (x) { e = x; }
  ok('LSV2: Steuerung verweigert Schreiben → Meldung', /kein Schreibzugriff/.test(e?.message || ''), e?.message);
  ro.close();
}
{
  // reading: a program back from the control (for comparing) and the tool table
  const { receiveFile } = createRequire(import.meta.url)('../electron/lsv2.cjs');
  const c = await fakeControl({ maxBlock: 1024 });
  const tool = ['BEGIN TOOL .T MM', 'T    NAME             L           R', '0    NULLWERKZEUG     +0          +0', '5    FRAESER D10      +85.123     +5', '[END]'].join('\r\n');
  c.files.set('TNC:\\table\\tool.t', Buffer.from(tool, 'latin1'));
  c.files.set('TNC:\\nc_prog\\1001.h', Buffer.from(prog.replace(/\n/g, '\r\n'), 'latin1'));
  const r = await receiveFile({ host: '127.0.0.1', port: c.port, path: 'TNC:/nc_prog/1001.h' });
  ok('LSV2: Programm von der Steuerung holen (mehrere Blöcke)', r.ok && r.text.replace(/\r\n/g, '\n').replace(/\n$/, '') === prog && c.log.filter(l => l.cmd === 'T_OK').length > 3, r.bytes + ' Byte');
  const t = await receiveFile({ host: '127.0.0.1', port: c.port, path: 'TNC:\\table\\tool.t' });
  ok('LSV2: TOOL.T lesen', t.ok && /FRAESER D10\s+\+85\.123/.test(t.text) && t.text.split('\r\n').length >= 5);
  let e = null;
  try { await receiveFile({ host: '127.0.0.1', port: c.port, path: 'TNC:\\nc_prog\\FEHLT.h' }); } catch (x) { e = x; }
  ok('LSV2: fehlende Datei → Meldung', /nicht gefunden/.test(e?.message || ''), e?.message);
  c.close();
}
{
  // nobody listening
  const s = net.createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const port = s.address().port; s.close();
  let e = null;
  try { await sendProgram({ host: '127.0.0.1', port, name: 'A.h', text: 'x' }); } catch (x) { e = x; }
  ok('LSV2: keine Steuerung erreichbar → Fehler statt Hängen', !!e, e?.message);
}
