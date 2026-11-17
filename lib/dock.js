// Optional: Roblox account linking through Dock (https://docksys.xyz, docs: https://docs.docksys.xyz).
//   DOCK_API_KEY  your Dock API key (Bearer). Enables "Link Roblox" on the dashboard.
//   DOCK_PID      optional. Lets people who aren't linked yet verify through Dock's hosted page.
// Dock paces keys to about 1 request a second, so we never call it in a loop.

const BASE = (process.env.DOCK_API_BASE || 'https://api.docksys.xyz/v2').replace(/\/+$/, '');

export const dockConfigured = () => Boolean(process.env.DOCK_API_KEY);
export const dockVerifyEnabled = () => Boolean(process.env.DOCK_API_KEY && process.env.DOCK_PID);

const httpError = (status, message) => Object.assign(new Error(message), { status });

async function call(path, { method = 'GET', body, idempotencyKey } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  let r;
  try {
    r = await fetch(BASE + path, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.DOCK_API_KEY}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch (err) {
    console.error('Dock request failed', path, err?.message);
    throw httpError(502, 'Couldn’t reach Dock right now. Try again in a moment.');
  } finally {
    clearTimeout(t);
  }
  const json = await r.json().catch(() => ({}));
  return { status: r.status, json };
}

function explain(status, json) {
  const code = json?.error?.code;
  if (status === 401) return httpError(502, 'Dock rejected the API key. An admin needs to check DOCK_API_KEY.');
  if (status === 403) return httpError(502, `This Dock key isn’t authorized for the Discord server ${process.env.DISCORD_GUILD_ID || '(DISCORD_GUILD_ID not set)'}. Use the Dock key made for the Big Sky Uber server.`);
  if (status === 429 || code === 'RATE_LIMITED') return httpError(429, 'Dock is busy, try again in a few seconds.');
  return httpError(502, json?.error?.message || 'Dock couldn’t complete the request.');
}

/** Roblox ID linked to this Discord user, or null when they haven't linked one in Dock. */
export async function robloxIdFor(discordId) {
  const guildId = (process.env.DISCORD_GUILD_ID || '').trim();
  const qs = new URLSearchParams({ discordId, ...(guildId ? { guildId } : {}) });
  // Same lookup the Big Sky bot uses: { data: { linked, robloxId } }
  const { status, json } = await call(`/verifications/discord?${qs}`);
  if (status === 404) return null;
  if (status !== 200) throw explain(status, json);
  const d = json?.data || {};
  return d.robloxId && d.linked !== false ? String(d.robloxId) : null;
}

/** Starts a Dock verification session; the user finishes it at verifyUrl. */
export async function startVerification(discordId) {
  const guildId = (process.env.DISCORD_GUILD_ID || '').trim() || null;
  const { status, json } = await call('/sessions', {
    method: 'POST',
    body: { pid: process.env.DOCK_PID, clientId: discordId, guildId },
    idempotencyKey: `bsu-${discordId}-${Math.floor(Date.now() / 600000)}`, // one session per user per 10 minutes
  });
  if (status !== 200 && status !== 201) throw explain(status, json);
  const d = json.data || {};
  return { id: d.id, verifyUrl: d.verifyUrl, expiresAt: d.expiresAt, status: d.status };
}

/** { status, robloxId } for a verification session. */
export async function verificationStatus(sessionId) {
  const { status, json } = await call(`/sessions/${encodeURIComponent(sessionId)}`);
  if (status === 404) return { status: 'expired', robloxId: null };
  if (status !== 200) throw explain(status, json);
  const d = json.data || {};
  return { status: d.status, robloxId: d.result?.robloxId ? String(d.result.robloxId) : null, discordId: d.result?.discordId || null };
}

/** Public Roblox profile (no key needed). */
export async function robloxProfile(robloxId) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const [u, th] = await Promise.all([
      fetch(`https://users.roblox.com/v1/users/${encodeURIComponent(robloxId)}`, { signal: ctrl.signal }).then((r) => (r.ok ? r.json() : null)),
      fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${encodeURIComponent(robloxId)}&size=150x150&format=Png`, { signal: ctrl.signal }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    clearTimeout(t);
    if (!u?.name) return null;
    return { id: String(robloxId), name: u.name, displayName: u.displayName || u.name, avatar: th?.data?.[0]?.imageUrl || null };
  } catch {
    return null;
  }
}
