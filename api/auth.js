import { randomBytes } from 'node:crypto';
import { wrap, ok, fail, redirect, query, cookie, parseCookies, sameOrigin } from '../lib/http.js';
import { createSessionCookie, clearSessionCookie, readSession, isBanned, accessFor, avatarUrl, fetchMember, guildId, publicUser } from '../lib/session.js';
import { updateDoc } from '../lib/store.js';
import { logActivity } from '../lib/activity.js';

const STATE_COOKIE = 'bsu_oauth';

function safeNext(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  return value.slice(0, 200);
}

function withParam(path, key, value) {
  const u = new URL(path, 'http://x');
  u.searchParams.set(key, value);
  return u.pathname + u.search + u.hash;
}

function redirectUri(req) {
  if (process.env.DISCORD_REDIRECT_URI) return process.env.DISCORD_REDIRECT_URI;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${req.headers.host}/api/auth/callback`;
}

async function login(req, res) {
  const { next } = query(req);
  if (!process.env.DISCORD_CLIENT_ID) return redirect(res, withParam(safeNext(next), 'auth', 'unconfigured'));
  const state = randomBytes(18).toString('base64url');
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri(req),
    scope: guildId() ? 'identify guilds.members.read' : 'identify',
    state,
    prompt: 'none',
  });
  const stateCookie = cookie(STATE_COOKIE, `${state}|${safeNext(next)}`, { maxAge: 600 });
  redirect(res, `https://discord.com/oauth2/authorize?${params}`, [stateCookie]);
}

async function callback(req, res) {
  const q = query(req);
  const [savedState, savedNext] = (parseCookies(req)[STATE_COOKIE] || '').split('|');
  const next = safeNext(savedNext);
  const clearState = cookie(STATE_COOKIE, '', { maxAge: 0 });

  if (q.error) return redirect(res, withParam(next, 'auth', 'cancelled'), [clearState]);
  if (!q.code || !q.state || q.state !== savedState) return redirect(res, withParam(next, 'auth', 'expired'), [clearState]);

  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET || '',
      grant_type: 'authorization_code',
      code: q.code,
      redirect_uri: redirectUri(req),
    }),
  });
  if (!tokenRes.ok) {
    console.error('Discord token exchange failed', tokenRes.status, await tokenRes.text().catch(() => ''));
    return redirect(res, withParam(next, 'auth', 'failed'), [clearState]);
  }
  const { access_token, token_type } = await tokenRes.json();

  const meRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `${token_type || 'Bearer'} ${access_token}` },
  });
  if (!meRes.ok) return redirect(res, withParam(next, 'auth', 'failed'), [clearState]);
  const me = await meRes.json();

  if (await isBanned(me.id)) return redirect(res, withParam(next, 'auth', 'banned'), [clearState, clearSessionCookie()]);

  let member = null;
  try { member = await fetchMember({ userToken: access_token }); } catch (err) { console.error('Member lookup failed', err?.message); }

  const user = {
    id: me.id,
    username: me.username,
    name: me.global_name || me.username,
    avatar: avatarUrl(me.id, me.avatar, 128),
    roles: member?.roles || [],
    inGuild: Boolean(member?.inGuild),
    rolesAt: Date.now(),
  };

  let firstLogin = false;
  try {
    await updateDoc('users', {}, (users) => {
      const prev = users[me.id] || { logins: 0, firstSeen: Date.now() };
      firstLogin = !users[me.id];
      users[me.id] = { ...prev, id: me.id, username: user.username, name: user.name, avatar: user.avatar, inGuild: user.inGuild, lastLogin: Date.now(), logins: prev.logins + 1 };
      const keys = Object.keys(users);
      if (keys.length > 2000) {
        keys.sort((a, b) => users[a].lastLogin - users[b].lastLogin).slice(0, keys.length - 2000).forEach((k) => delete users[k]);
      }
      return users;
    });
  } catch (err) {
    console.error('Could not record login', err);
  }

  await logActivity({ kind: firstLogin ? 'account.new' : 'account.login', title: firstLogin ? 'New account created' : 'Signed in', body: user.inGuild ? 'In the Discord server' : 'Not in the Discord server', actor: { id: user.id, name: user.name } });
  redirect(res, withParam(next, 'auth', 'ok'), [clearState, createSessionCookie(user)]);
}

async function logout(req, res) {
  if (req.method === 'POST') {
    if (!sameOrigin(req)) return fail(res, 403, 'Bad origin.');
    res.setHeader('Set-Cookie', clearSessionCookie());
    return ok(res);
  }
  redirect(res, '/', [clearSessionCookie()]);
}

async function me(req, res) {
  const user = readSession(req);
  if (!user) return ok(res, { ok: true, user: null, access: accessFor(null) });
  if (await isBanned(user.id)) {
    res.setHeader('Set-Cookie', clearSessionCookie());
    return ok(res, { ok: true, user: null, access: accessFor(null), banned: true });
  }
  ok(res, { ok: true, user: publicUser(user), inGuild: user.inGuild, access: accessFor(user) });
}

const actions = { login, callback, logout, me };

export default wrap(async (req, res) => {
  const fn = actions[query(req).action];
  if (!fn) return fail(res, 404, 'Unknown auth action.');
  await fn(req, res);
});
