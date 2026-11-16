import { put, head, get, list } from '@vercel/blob';
import { createHash } from 'node:crypto';

// JSON documents kept in Vercel Blob. Works with public and private stores.
// Private stores are recommended: data is then only reachable with the token.

const recentWrites = new Map();
const WRITE_MEMORY_MS = 15_000;
let knownBase = null;

const token = () => process.env.BLOB_READ_WRITE_TOKEN || '';
export const blobConfigured = () => Boolean(token());

let mode = /^(public|private)$/.test(process.env.BLOB_ACCESS || '') ? process.env.BLOB_ACCESS : null;
let detecting = null;
const accessMismatch = (e) => /(public|private) access on a (private|public) store/i.test(e?.message || '');
const modeFromUrl = (url) => (/\.private\.blob\.vercel-storage\.com/i.test(url) ? 'private' : 'public');

async function detectMode() {
  if (mode || !blobConfigured()) return mode;
  detecting ||= list({ limit: 1 })
    .then((r) => { if (r.blobs[0]?.url) mode = modeFromUrl(r.blobs[0].url); return mode; })
    .catch(() => mode)
    .finally(() => { detecting = null; });
  return detecting;
}

async function putAuto(pathname, body, opts) {
  const first = mode || 'private';
  try {
    const r = await put(pathname, body, { ...opts, access: first });
    mode = first;
    return r;
  } catch (e) {
    if (!accessMismatch(e)) throw e;
    mode = first === 'public' ? 'private' : 'public';
    return put(pathname, body, { ...opts, access: mode });
  }
}

function dataKey() {
  const raw = process.env.DATA_KEY || createHash('sha256').update('bsu:' + token()).digest('hex').slice(0, 24);
  return raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'default';
}

const dataPath = (name) => `data/${dataKey()}/${name}.json`;

function derivedBase() {
  if (process.env.BLOB_PUBLIC_BASE) return process.env.BLOB_PUBLIC_BASE.replace(/\/+$/, '');
  const m = token().match(/^vercel_blob_rw_([a-z0-9]+)_/i);
  return m ? `https://${m[1].toLowerCase()}.public.blob.vercel-storage.com` : null;
}

const clone = (v) => (v === undefined ? v : structuredClone(v));

async function fetchJson(url) {
  const r = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
  if (r.status === 404 || r.status === 403) return { missing: true };
  if (!r.ok) throw new Error(`Blob read failed (${r.status})`);
  return { value: await r.json() };
}

async function readPrivate(pathname, fallback) {
  const r = await get(pathname, { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200) return clone(fallback);
  return JSON.parse(await new Response(r.stream).text());
}

export async function readDoc(name, fallback) {
  if (!blobConfigured()) return clone(fallback);
  const mem = recentWrites.get(name);
  if (mem && Date.now() - mem.at < WRITE_MEMORY_MS) return clone(mem.value);

  const pathname = dataPath(name);
  await detectMode();
  try {
    if (mode === 'private') return await readPrivate(pathname, fallback);
    const base = knownBase || derivedBase();
    if (!base) throw new Error('no base');
    const out = await fetchJson(`${base}/${pathname}`);
    return out.missing ? clone(fallback) : out.value;
  } catch (err) {
    try {
      const meta = await head(pathname);
      if (modeFromUrl(meta.url) === 'private') { mode = 'private'; return readPrivate(pathname, fallback); }
      knownBase = new URL(meta.url).origin;
      const out = await fetchJson(meta.url);
      return out.missing ? clone(fallback) : out.value;
    } catch (e) {
      if (e?.name === 'BlobNotFoundError' || /not.?found/i.test(e?.message || '')) return clone(fallback);
      throw e;
    }
  }
}

export async function writeDoc(name, value) {
  if (!blobConfigured()) {
    const err = new Error('Storage is not configured (BLOB_READ_WRITE_TOKEN missing).');
    err.status = 503;
    throw err;
  }
  const result = await putAuto(dataPath(name), JSON.stringify(value), {
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
    cacheControlMaxAge: 60,
  });
  if (mode === 'public') knownBase = new URL(result.url).origin;
  recentWrites.set(name, { value: clone(value), at: Date.now() });
  return value;
}

/** Read, change, write. Throwing inside `mutate` aborts without writing. */
export async function updateDoc(name, fallback, mutate) {
  const current = await readDoc(name, fallback);
  const next = (await mutate(current)) ?? current;
  await writeDoc(name, next);
  return next;
}
