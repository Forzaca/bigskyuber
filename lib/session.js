import { createHmac, timingSafeEqual } from 'node:crypto';
import { parseCookies, cookie } from './http.js';
import { readDoc } from './store.js';

export const SESSION_COOKIE = 'bsu_session';
const MAX_AGE = 60 * 60 * 24 * 7;
const ROLE_REFRESH_MS = 10 * 60 * 1000;

const ids = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
export const guildId = () => (process.env.DISCORD_GUILD_ID || '').trim();

/** Works out panel access from the user's Discord roles and the role IDs in env. */
export function accessFor(user) {
  if (!user) return { worker: false, admin: false };
  const roles = Array.isArray(user.roles) ? user.roles : [];
  const has = (list) => roles.some((r) => list.includes(r));
  const admin = ids(process.env.ADMIN_DISCORD_IDS).includes(user.id) || has(ids(process.env.DISCORD_ADMIN_ROLE_ID));
  const worker = admin || ids(process.env.WORKER_DISCORD_IDS).includes(user.id) || has(ids(process.env.DISCORD_WORKER_ROLE_ID));
  return { worker, admin };
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    const err = new Error('SESSION_SECRET is missing or too short.');
    err.status = 503;
    throw err;
  }
  return s;
}

const b64 = (s) => Buffer.from(s).toString('base64url');
const sign = (data) => createHmac('sha256', secret()).update(data).digest('base64url');

export function createSessionCookie(user) {
  const { iat, exp, ...rest } = user;
  const now = Date.now();
  const payload = b64(JSON.stringify({ ...rest, iat: iat || now, exp: exp || now + MAX_AGE * 1000 }));
  const maxAge = Math.max(0, Math.round(((exp || now + MAX_AGE * 1000) - now) / 1000));
  return cookie(SESSION_COOKIE, `${payload}.${sign(payload)}`, { maxAge });
}

export const clearSessionCookie = () => cookie(SESSION_COOKIE, '', { maxAge: 0 });

export function readSession(req) {
  const raw = parseCookies(req)[SESSION_COOKIE];
  if (!raw || !raw.includes('.')) return null;
  const [payload, sig] = raw.split('.');
  let expected;
  try { expected = sign(payload); } catch { return null; }
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Looks up the member's roles in DISCORD_GUILD_ID.
 * With `userToken` it uses the user's own OAuth token (needs the guilds.members.read scope),
 * otherwise the bot token. Returns null when it could not tell.
 */
export async function fetchMember({ userToken, userId }) {
  const g = guildId();
  if (!g) return { inGuild: false, roles: [] };
  let r;
  if (userToken) {
    r = await fetch(`https://discord.com/api/v10/users/@me/guilds/${g}/member`, { headers: { Authorization: `Bearer ${userToken}` } });
  } else if (process.env.DISCORD_BOT_TOKEN && userId) {
    r = await fetch(`https://discord.com/api/v10/guilds/${g}/members/${userId}`, { headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` } });
  } else {
    return null;
  }
  if (r.status === 404) return { inGuild: false, roles: [] };
  if (!r.ok) return null;
  const m = await r.json();
  return { inGuild: true, roles: Array.isArray(m.roles) ? m.roles : [], nick: m.nick || null };
}

/** With a bot token set, re-checks roles every 10 minutes and re-issues the cookie. */
export async function refreshRoles(req, res, user) {
  if (!user || !process.env.DISCORD_BOT_TOKEN || !guildId()) return user;
  if (Date.now() - (user.rolesAt || 0) < ROLE_REFRESH_MS) return user;
  try {
    const m = await fetchMember({ userId: user.id });
    if (!m) return user;
    const next = { ...user, roles: m.roles, inGuild: m.inGuild, rolesAt: Date.now() };
    res.setHeader('Set-Cookie', createSessionCookie(next));
    return next;
  } catch {
    return user;
  }
}

export async function isBanned(userId) {
  if (!userId) return false;
  if (ids(process.env.ADMIN_DISCORD_IDS).includes(userId)) return false;
  const bans = await readDoc('bans', []);
  return bans.some((b) => b.userId === userId);
}

const httpError = (status, message) => Object.assign(new Error(message), { status });

export async function requireUser(req) {
  const user = readSession(req);
  if (!user) throw httpError(401, 'Sign in with Discord first.');
  if (await isBanned(user.id)) throw httpError(403, 'This account is banned from Big Sky Uber.');
  return user;
}

/** level: 'worker' | 'admin' */
export async function requireAccess(req, res, level) {
  let user = readSession(req);
  if (!user) throw httpError(401, 'Sign in with Discord first.');
  user = await refreshRoles(req, res, user);
  const access = accessFor(user);
  if (!access[level]) throw httpError(403, level === 'admin' ? 'You need the admin role for this.' : 'You need the driver role for this.');
  if (!access.admin && (await isBanned(user.id))) throw httpError(403, 'This account is banned from Big Sky Uber.');
  return { user, access };
}

export const publicUser = (u) => (u ? { id: u.id, username: u.username, name: u.name, avatar: u.avatar } : null);

export function avatarUrl(id, hash, size = 128) {
  if (!hash) {
    const index = Number((BigInt(id || 0) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  }
  const ext = hash.startsWith('a_') ? 'gif' : 'webp';
  return `https://cdn.discordapp.com/avatars/${id}/${hash}.${ext}?size=${size}`;
}
