// A design as a link: the project (with its imported files inline, like an .ofab file) is compressed and put
// into the part of the address after "#", which never goes to the web server. Opening the link in the online
// version or the desktop app creates a copy of the design there. Pure (no DOM); works in browsers and node 18+.

export const DEMO_URL = 'https://vbleich-lab.github.io/WerkFab/';
export const SHARE_PREFIX = '#m=';
export const SHARE_LIMIT = 2_000_000; // longest link we write (characters); browsers take more, chat programs less

const b64url = bytes => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = t => {
  const s = atob(t.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((t.length + 3) % 4));
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
};
async function pipe(bytes, stream) {
  const r = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(r).arrayBuffer());
}

// design (with inline blobs) → text for the address; version letter first so the format can change later
export async function encodeShare(doc) {
  const raw = new TextEncoder().encode(JSON.stringify(doc));
  return '1' + b64url(await pipe(raw, new CompressionStream('deflate-raw')));
}
export async function decodeShare(text) {
  const t = String(text).replace(/^#?m=/, '').trim();
  if (t[0] !== '1') throw new Error('Unbekanntes Linkformat – der Link stammt von einer neueren Version.');
  let raw;
  try { raw = await pipe(unb64url(t.slice(1)), new DecompressionStream('deflate-raw')); } catch { throw new Error('Der Link ist unvollständig oder beschädigt (beim Kopieren abgeschnitten?).'); }
  const doc = JSON.parse(new TextDecoder().decode(raw));
  if (!doc || !Array.isArray(doc.features)) throw new Error('Der Link enthält kein Design.');
  return doc;
}

// address of the link: the page itself when it is served from the web, else the online version
export function shareBase(loc) {
  const web = loc && /^https?:$/.test(loc.protocol) && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname);
  return web ? loc.origin + loc.pathname : DEMO_URL;
}

// what goes into a link: the design without the things that only matter on this computer
export function shareDoc(project) {
  const p = JSON.parse(JSON.stringify(project));
  delete p.docId;
  return p;
}
