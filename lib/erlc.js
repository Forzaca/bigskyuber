// Optional: the official ER:LC private server API (PRC).
// Set ERLC_API_KEY to your server key (in-game: Server Settings → API / ER:LC API).
// Everything here fails soft. When the key is missing, the API is down or the
// server is offline (PRC usually stops answering then), the site keeps working
// and the "rider must be in the server" check is skipped instead of blocking rides.

// Same host and header the Big Sky bot uses (the old api.policeroleplay.community host answers 403).
const BASE = (process.env.ERLC_API_BASE || 'https://api.erlc.gg/v1').replace(/\/+$/, '');
const KEY = () => (process.env.ERLC_API_KEY || process.env.ERLC_API || '').trim();
const STALE_MS = 90_000; // never trust a cached answer older than this when PRC stops replying
const cache = new Map();

export const erlcConfigured = () => Boolean(KEY());

/** { ok: true, value } or { ok: false, reason: 'badkey' | 'offline' | 'unreachable' } */
async function prc(path, ttlMs) {
  if (!erlcConfigured()) return { ok: false, reason: 'off' };
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < ttlMs) return hit.result;
  const fallback = (result) => {
    // Rate-limited or a blip: keep serving a recent good answer, but not an old one.
    if (hit?.result.ok && Date.now() - hit.at < STALE_MS) return hit.result;
    cache.set(path, { result, at: Date.now() });
    return result;
  };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3000);
  try {
    const r = await fetch(BASE + path, { headers: { 'server-key': KEY(), Accept: '*/*' }, signal: ctrl.signal });
    if (!r.ok) {
      console.error('ER:LC API', path, r.status, (await r.text().catch(() => '')).slice(0, 200));
      if (r.status === 401 || r.status === 403) return fallback({ ok: false, reason: 'badkey' });
      if (r.status === 429) return fallback({ ok: false, reason: 'unreachable' });
      return fallback({ ok: false, reason: 'offline' });
    }
    const result = { ok: true, value: await r.json() };
    cache.set(path, { result, at: Date.now() });
    return result;
  } catch (err) {
    console.error('ER:LC API failed', path, err?.message);
    return fallback({ ok: false, reason: 'unreachable' });
  } finally {
    clearTimeout(t);
  }
}

/**
 * null when ERLC_API_KEY isn't set. Otherwise
 * { online: true, name, players, maxPlayers, joinKey, joinUrl }
 * or { online: false, reason: 'offline' | 'unreachable' | 'badkey' }.
 */
export async function serverStatus() {
  if (!erlcConfigured()) return null;
  const r = await prc('/server', 30_000);
  if (!r.ok) return { online: false, reason: r.reason };
  const s = r.value || {};
  return {
    online: true,
    name: s.Name || 'ER:LC server',
    players: Number(s.CurrentPlayers) || 0,
    maxPlayers: Number(s.MaxPlayers) || 0,
    joinKey: s.JoinKey || '',
    joinUrl: s.VanityURL || (s.JoinKey ? `https://policeroleplay.community/join/${s.JoinKey}` : ''),
  };
}

/** [{ name, robloxId, team, callsign, permission }] or null when unknown (no key, API down, server offline). */
export async function serverPlayers() {
  const r = await prc('/server/players', 20_000);
  if (!r.ok || !Array.isArray(r.value)) return null;
  return r.value.map((p) => {
    const [name, id] = String(p.Player || '').split(':');
    return { name, robloxId: id || null, team: p.Team || null, callsign: p.Callsign || null, permission: p.Permission || null };
  });
}

/** true / false, or null if we can't tell (no key, API down, server offline or empty). */
export async function isInServer(roblox) {
  const players = await serverPlayers();
  if (!players || players.length === 0) return null;
  const n = String(roblox || '').toLowerCase();
  return players.some((p) => p.name?.toLowerCase() === n);
}

/** Tests only: forget cached PRC answers. */
export const _resetErlcCache = () => cache.clear();
