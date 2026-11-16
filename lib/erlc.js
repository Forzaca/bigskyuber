// Optional: the official ER:LC private server API (PRC).
// Set ERLC_API_KEY to your server key (in-game: Server Settings → API / ER:LC API).
// Everything here fails soft: if the key is missing or PRC is down, the site keeps working.

const BASE = (process.env.ERLC_API_BASE || 'https://api.policeroleplay.community/v1').replace(/\/+$/, '');
const cache = new Map();

export const erlcConfigured = () => Boolean(process.env.ERLC_API_KEY);

async function prc(path, ttlMs) {
  if (!erlcConfigured()) return null;
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3000);
  try {
    const r = await fetch(BASE + path, { headers: { 'Server-Key': process.env.ERLC_API_KEY, Accept: 'application/json' }, signal: ctrl.signal });
    if (!r.ok) {
      console.error('ER:LC API', path, r.status);
      return hit?.value ?? null; // keep serving the last good value while rate-limited
    }
    const value = await r.json();
    cache.set(path, { value, at: Date.now() });
    return value;
  } catch (err) {
    console.error('ER:LC API failed', path, err?.message);
    return hit?.value ?? null;
  } finally {
    clearTimeout(t);
  }
}

/** { name, players, maxPlayers, joinKey, joinUrl } or null */
export async function serverStatus() {
  const s = await prc('/server', 30_000);
  if (!s) return null;
  return {
    name: s.Name || 'ER:LC server',
    players: Number(s.CurrentPlayers) || 0,
    maxPlayers: Number(s.MaxPlayers) || 0,
    joinKey: s.JoinKey || '',
    joinUrl: s.VanityURL || (s.JoinKey ? `https://policeroleplay.community/join/${s.JoinKey}` : ''),
  };
}

/** [{ name, robloxId, team, callsign, permission }] or null when unknown */
export async function serverPlayers() {
  const list = await prc('/server/players', 20_000);
  if (!Array.isArray(list)) return null;
  return list.map((p) => {
    const [name, id] = String(p.Player || '').split(':');
    return { name, robloxId: id || null, team: p.Team || null, callsign: p.Callsign || null, permission: p.Permission || null };
  });
}

/** true / false, or null if we can't tell (no key, API down). */
export async function isInServer(roblox) {
  const players = await serverPlayers();
  if (!players) return null;
  const n = String(roblox || '').toLowerCase();
  return players.some((p) => p.name?.toLowerCase() === n);
}
