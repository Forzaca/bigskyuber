// Roblox headshots by username (public Roblox APIs, no key needed).
// Looked up once when a ride is requested / accepted / a driver saves their profile,
// then stored on the record so pages never wait on Roblox. Always fails soft (null).

const cache = new Map(); // lowercased name -> { at, value }
const TTL = 6 * 3600e3;

async function getJson(url, init, ms = 2500) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** { id, name, displayName, headshot } for each username found. Map keyed by lowercased name. */
export async function robloxUsers(names) {
  const want = [...new Set(names.filter(Boolean).map((n) => String(n).trim()).filter((n) => /^[A-Za-z0-9_]{3,20}$/.test(n)))];
  const out = new Map();
  const missing = [];
  for (const n of want) {
    const hit = cache.get(n.toLowerCase());
    if (hit && Date.now() - hit.at < TTL) { if (hit.value) out.set(n.toLowerCase(), hit.value); }
    else missing.push(n);
  }
  if (!missing.length) return out;
  const users = await getJson('https://users.roblox.com/v1/usernames/users', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ usernames: missing.slice(0, 100), excludeBannedUsers: true }),
  });
  if (!users?.data) return out; // Roblox down: don't cache the miss
  const ids = users.data.map((u) => u.id);
  const thumbs = ids.length ? await getJson(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${ids.join(',')}&size=150x150&format=Png&isCircular=false`) : null;
  const byId = new Map((thumbs?.data || []).map((t) => [t.targetId, t.state === 'Completed' ? t.imageUrl : null]));
  for (const n of missing) {
    const u = users.data.find((x) => (x.requestedUsername || x.name).toLowerCase() === n.toLowerCase());
    const value = u ? { id: String(u.id), name: u.name, displayName: u.displayName, headshot: byId.get(u.id) || null } : null;
    cache.set(n.toLowerCase(), { at: Date.now(), value });
    if (value) out.set(n.toLowerCase(), value);
  }
  return out;
}

/** Headshot URL for one username, or null. */
export async function headshotFor(name) {
  if (!name) return null;
  return (await robloxUsers([name])).get(String(name).toLowerCase())?.headshot || null;
}
