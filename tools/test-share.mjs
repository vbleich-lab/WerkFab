// Tests for sharing a design as a link (node tools/test-share.mjs)
import { encodeShare, decodeShare, shareBase, shareDoc, DEMO_URL, SHARE_PREFIX } from '../js/share.js';
const ok = (n, c, x = '') => { console.log((c ? 'OK   ' : 'FEHL ') + n + '  ' + x); if (!c) process.exitCode = 1; };

const doc = { name: 'Halter – Größe ä/ß', docId: 'doc_x', params: [{ name: 'L', expr: '40' }], features: Array.from({ length: 40 }, (_, i) => ({ id: 'f' + i, type: 'extrude', name: 'Extrusion ' + i, distance: 10 + i })), blobs: { k1: 'solid x\n'.repeat(200) } };
const t = await encodeShare(shareDoc(doc));
ok('Nur Zeichen, die in einer Adresse erlaubt sind', /^[A-Za-z0-9_-]+$/.test(t), t.slice(0, 40));
ok('Gepackt deutlich kleiner als JSON', t.length < JSON.stringify(doc).length / 3, `${t.length} statt ${JSON.stringify(doc).length}`);
const back = await decodeShare(SHARE_PREFIX + t);
ok('Wieder gelesen: gleiche Features, Parameter, Dateien', JSON.stringify(back.features) === JSON.stringify(doc.features) && back.params[0].expr === '40' && back.blobs.k1 === doc.blobs.k1 && back.name === doc.name);
ok('Ohne die Kennung dieses Rechners', !('docId' in back));
let err = '';
try { await decodeShare(t.slice(0, t.length - 20)); } catch (e) { err = e.message; }
ok('Abgeschnittener Link → verständlicher Fehler', /unvollständig|beschädigt/.test(err), err);
err = '';
try { await decodeShare('9abc'); } catch (e) { err = e.message; }
ok('Fremdes Format → Fehler', /Linkformat/.test(err), err);
ok('Basisadresse: Webseite selbst', shareBase({ protocol: 'https:', hostname: 'example.org', origin: 'https://example.org', pathname: '/cad/' }) === 'https://example.org/cad/');
ok('Basisadresse: lokal oder Desktop → Online-Version', shareBase({ protocol: 'http:', hostname: 'localhost', origin: 'http://localhost:8770', pathname: '/' }) === DEMO_URL && shareBase({ protocol: 'file:', hostname: '' }) === DEMO_URL);
