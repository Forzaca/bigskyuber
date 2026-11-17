import { timingSafeEqual, createHash } from 'node:crypto';
import { wrap, send, query } from '../lib/http.js';
import { readDoc } from '../lib/store.js';
import { serverStatus, serverPlayers, erlcConfigured } from '../lib/erlc.js';
import { apiShift, resolveShifts } from '../lib/data.js';
import { publicStub } from '../lib/pay.js';
import { readActivity, apiActivity } from '../lib/activity.js';
import { apiRide, apiReview, apiDriver, isOnline, reviewSummary, rideStats, ACTIVE, CLASSES, STATUSES, getSettings } from '../lib/data.js';

/*
 * Read-only API for the Discord bot.
 * Auth:  Authorization: Bearer <UBERBIGSKY>   or   X-API-Key: <UBERBIGSKY>
 *
 *   GET /api/v1/ping
 *   GET /api/v1/stats
 *   GET /api/v1/rides?status=&class=&rider=&driver=&roblox=&since=&updatedSince=&limit=
 *   GET /api/v1/rides/active
 *   GET /api/v1/rides/:id
 *   GET /api/v1/reviews?rating=&minRating=&driver=&class=&limit=&includeHidden=
 *   GET /api/v1/reviews/summary
 *   GET /api/v1/reviews/:id
 *   GET /api/v1/drivers            (all driver profiles)
 *   GET /api/v1/drivers/online     (online right now)
 *   GET /api/v1/drivers/:discordId
 *   GET /api/v1/pricing
 *   GET /api/v1/shifts?driver=&active=true&since=&limit=   (driver shift log)
 *   GET /api/v1/server             (ER:LC server status + players, needs ERLC_API_KEY)
 *   GET /api/v1/paystubs?driver=&limit=   GET /api/v1/paystubs/:id|number
 *   GET /api/v1/links              GET /api/v1/links/:discordId|robloxName   (Roblox links via Dock)
 *   GET /api/v1/activity?since=&kind=&limit=   website activity log (sign-ins, shifts, links, staff actions)
 *   GET /api/v1/feed?since=        everything that changed since a time, in one call (for the bot):
 *                                  rides, reviews, paystubs, shifts, activity + current active rides and online drivers
 */

const digest = (s) => createHash('sha256').update(String(s)).digest();

function authorized(req) {
  const key = process.env.UBERBIGSKY;
  if (!key) return null;
  const header = req.headers.authorization || '';
  const given = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : (req.headers['x-api-key'] || '').trim();
  if (!given) return false;
  return timingSafeEqual(digest(given), digest(key));
}

const json = (res, status, data) => send(res, status, data, { 'Access-Control-Allow-Origin': '*' });
const fail = (res, status, error) => json(res, status, { ok: false, error });

function limitOf(q, def = 50, max = 200) {
  const n = parseInt(q.limit, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : def;
}

function sinceOf(q, key = 'since') {
  if (!q[key]) return 0;
  const n = Number(q[key]);
  const t = Number.isFinite(n) ? (n < 1e12 ? n * 1000 : n) : Date.parse(q[key]);
  return Number.isFinite(t) ? t : 0;
}

async function rides(q, res) {
  const all = await readDoc('rides', []);
  if (q.id === 'active') {
    const list = all.filter((r) => ACTIVE.has(r.status));
    return json(res, 200, { ok: true, count: list.length, rides: list.map(apiRide) });
  }
  if (q.id) {
    const r = all.find((x) => x.id.toUpperCase() === String(q.id).toUpperCase());
    return r ? json(res, 200, { ok: true, ride: apiRide(r) }) : fail(res, 404, 'Ride not found.');
  }
  const statuses = q.status ? String(q.status).split(',').filter((s) => STATUSES.includes(s)) : null;
  const since = sinceOf(q);
  const updatedSince = sinceOf(q, 'updatedSince');
  const roblox = q.roblox ? String(q.roblox).toLowerCase() : null;
  let list = all.filter((r) =>
    (!statuses || statuses.includes(r.status)) &&
    (!q.class || r.class === q.class) &&
    (!q.rider || r.rider.id === q.rider) &&
    (!q.driver || r.driver?.id === q.driver) &&
    (!roblox || r.roblox.toLowerCase() === roblox || r.driver?.roblox?.toLowerCase() === roblox) &&
    (!since || r.createdAt >= since) &&
    (!updatedSince || (r.updatedAt || r.createdAt) > updatedSince),
  );
  if (updatedSince) list.sort((a, b) => (a.updatedAt || a.createdAt) - (b.updatedAt || b.createdAt));
  const total = list.length;
  list = list.slice(0, limitOf(q));
  json(res, 200, { ok: true, total, count: list.length, rides: list.map(apiRide) });
}

async function reviews(q, res) {
  const all = await readDoc('reviews', []);
  if (q.id === 'summary') return json(res, 200, { ok: true, summary: reviewSummary(all) });
  if (q.id) {
    const r = all.find((x) => x.id === q.id);
    return r ? json(res, 200, { ok: true, review: apiReview(r) }) : fail(res, 404, 'Review not found.');
  }
  const includeHidden = q.includeHidden === 'true';
  const since = sinceOf(q);
  const rating = q.rating ? Number(q.rating) : null;
  const minRating = q.minRating ? Number(q.minRating) : null;
  let list = all.filter((r) =>
    (includeHidden || !r.hidden) &&
    (!rating || r.rating === rating) &&
    (!minRating || r.rating >= minRating) &&
    (!q.driver || r.driverId === q.driver) &&
    (!q.class || r.class === q.class) &&
    (!since || r.createdAt > since),
  );
  const total = list.length;
  list = list.slice(0, limitOf(q));
  json(res, 200, { ok: true, total, count: list.length, summary: reviewSummary(all), reviews: list.map(apiReview) });
}

async function drivers(q, res) {
  const all = Object.values(await readDoc('drivers', {}));
  if (q.id === 'online') {
    const list = all.filter(isOnline).sort((a, b) => (a.since || 0) - (b.since || 0));
    return json(res, 200, { ok: true, count: list.length, available: list.filter((d) => !d.busy).length, drivers: list.map(apiDriver) });
  }
  if (q.id) {
    const d = all.find((x) => x.id === q.id || x.roblox?.toLowerCase() === String(q.id).toLowerCase());
    return d ? json(res, 200, { ok: true, driver: apiDriver(d) }) : fail(res, 404, 'Driver not found.');
  }
  json(res, 200, { ok: true, count: all.length, online: all.filter(isOnline).length, drivers: all.map(apiDriver) });
}

async function stats(q, res) {
  const [all, rv, dr] = await Promise.all([readDoc('rides', []), readDoc('reviews', []), readDoc('drivers', {})]);
  const online = Object.values(dr).filter(isOnline);
  const dayAgo = Date.now() - 864e5;
  const byClass = Object.fromEntries(CLASSES.map((c) => [c, all.filter((r) => r.class === c && r.status === 'completed').length]));
  json(res, 200, {
    ok: true,
    rides: { ...rideStats(all), active: all.filter((r) => ACTIVE.has(r.status)).length, pending: all.filter((r) => r.status === 'pending').length, last24h: all.filter((r) => r.createdAt > dayAgo).length, completedByClass: byClass },
    drivers: { total: Object.keys(dr).length, online: online.length, available: online.filter((d) => !d.busy).length },
    reviews: reviewSummary(rv),
    generatedAt: new Date().toISOString(),
  });
}

async function pricing(q, res) {
  const s = await getSettings();
  json(res, 200, { ok: true, accepting: s.accepting, currency: 'in-game USD', classes: s.prices, trips: s.trips });
}

async function server(q, res) {
  if (!erlcConfigured()) return fail(res, 503, 'ER:LC API is not set up. Add ERLC_API_KEY.');
  const [status, players] = await Promise.all([serverStatus(), serverPlayers()]);
  if (!status) return fail(res, 502, 'Could not reach the ER:LC API right now.');
  json(res, 200, { ok: true, server: status, players: players || [] });
}

async function shifts(q, res) {
  const [list, dr] = await Promise.all([readDoc('shifts', []), readDoc('drivers', {})]);
  const since = sinceOf(q);
  let all = resolveShifts(list, dr).filter((s) =>
    (!q.driver || s.driverId === q.driver) && (q.active !== 'true' || s.active) && (!since || s.start >= since));
  const total = all.length;
  all = all.slice(0, limitOf(q));
  const minutes = all.reduce((m, s) => m + Math.round(((s.active ? Date.now() : s.end) - s.start) / 60000), 0);
  json(res, 200, { ok: true, total, count: all.length, minutes, shifts: all.map(apiShift) });
}

/** GET /api/v1/paystubs?driver=&limit=   issued paystubs (newest first) */
async function paystubs(q, res) {
  let all = (await readDoc('paystubs', [])).filter((s) => q.includeVoid === 'true' || s.status !== 'void');
  if (q.id) {
    const s = all.find((x) => x.id === q.id || String(x.number) === String(q.id));
    return s ? json(res, 200, { ok: true, paystub: apiStub(s) }) : fail(res, 404, 'Paystub not found.');
  }
  if (q.driver) all = all.filter((s) => s.driverId === q.driver);
  const since = sinceOf(q);
  if (since) all = all.filter((s) => s.issuedAt > since || (s.voidedAt || 0) > since);
  const total = all.length;
  all = all.slice(0, limitOf(q));
  json(res, 200, { ok: true, total, count: all.length, paid: all.reduce((m, s) => m + (s.status === 'void' ? 0 : s.net), 0), paystubs: all.map(apiStub) });
}
const apiStub = (s) => {
  const p = publicStub(s);
  return { ...p, periodStart: new Date(p.periodStart).toISOString(), periodEnd: new Date(p.periodEnd).toISOString(), issuedAt: new Date(p.issuedAt).toISOString(), voidedAt: p.voidedAt ? new Date(p.voidedAt).toISOString() : null };
};

/** GET /api/v1/links/:discordId   Roblox account the user linked on the site (via Dock) */
async function links(q, res) {
  const users = await readDoc('users', {});
  if (!q.id) {
    const list = Object.values(users).filter((u) => u.roblox?.id).map((u) => ({ discordId: u.id, roblox: { id: u.roblox.id, name: u.roblox.name, displayName: u.roblox.displayName }, linkedAt: new Date(u.roblox.linkedAt).toISOString() }));
    return json(res, 200, { ok: true, count: list.length, links: list.slice(0, limitOf(q, 200, 2000)) });
  }
  const u = users[q.id] || Object.values(users).find((x) => x.roblox?.name?.toLowerCase() === String(q.id).toLowerCase() || x.roblox?.id === String(q.id));
  if (!u?.roblox?.id) return fail(res, 404, 'No linked Roblox account for that user.');
  json(res, 200, { ok: true, discordId: u.id, roblox: { id: u.roblox.id, name: u.roblox.name, displayName: u.roblox.displayName }, linkedAt: new Date(u.roblox.linkedAt).toISOString() });
}

/** GET /api/v1/activity?since=&kind=&limit=   newest first (oldest first when since is given) */
async function activity(q, res) {
  const since = sinceOf(q);
  const kinds = q.kind ? String(q.kind).split(',') : null;
  let all = (await readActivity()).filter((a) => (!since || a.at > since) && (!kinds || kinds.some((k) => a.kind === k || a.kind.startsWith(k + '.'))));
  if (since) all.reverse();
  const total = all.length;
  all = all.slice(0, limitOf(q, 50, 500));
  json(res, 200, { ok: true, total, count: all.length, activity: all.map(apiActivity) });
}

/**
 * GET /api/v1/feed?since=   one call for the bot's poll loop.
 * Lists are oldest first. Use the returned `now` (minus a little overlap) as the next `since`
 * and de-duplicate by id: storage is eventually consistent across serverless instances.
 */
async function feed(q, res) {
  const now = Date.now();
  const since = sinceOf(q) || now - 10 * 60000;
  const [all, rv, stubs, shiftDoc, dr, act] = await Promise.all([
    readDoc('rides', []), readDoc('reviews', []), readDoc('paystubs', []), readDoc('shifts', []), readDoc('drivers', {}), readActivity(),
  ]);
  const at = (r) => r.updatedAt || r.createdAt;
  const asc = (key) => (a, b) => key(a) - key(b);
  json(res, 200, {
    ok: true,
    now: new Date(now).toISOString(),
    since: new Date(since).toISOString(),
    rides: all.filter((r) => at(r) > since).sort(asc(at)).slice(0, 200).map(apiRide),
    reviews: rv.filter((r) => !r.hidden && r.createdAt > since).sort(asc((r) => r.createdAt)).map(apiReview),
    paystubs: stubs.filter((s) => s.issuedAt > since || (s.voidedAt || 0) > since).sort(asc((s) => s.issuedAt)).map(apiStub),
    shifts: resolveShifts(shiftDoc, dr).filter((s) => s.start > since || (s.end && s.end > since)).sort(asc((s) => s.start)).map(apiShift),
    activity: act.filter((a) => a.at > since).reverse().slice(0, 300).map(apiActivity),
    active: all.filter((r) => ACTIVE.has(r.status)).sort(asc((r) => r.createdAt)).map(apiRide),
    online: Object.values(dr).filter(isOnline).sort((a, b) => (a.since || 0) - (b.since || 0)).map(apiDriver),
  });
}

const resources = { feed, activity, paystubs, links, server, shifts, rides, reviews, drivers, stats, pricing, ping: (q, res) => json(res, 200, { ok: true, pong: true, time: new Date().toISOString() }) };

export default wrap(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, X-API-Key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'GET') return fail(res, 405, 'This API is read-only. Use GET.');
  const auth = authorized(req);
  if (auth === null) return fail(res, 503, 'API is disabled. Set UBERBIGSKY in your environment variables.');
  if (!auth) return fail(res, 401, 'Missing or wrong API key. Send Authorization: Bearer <UBERBIGSKY>.');
  const q = query(req);
  const fn = resources[q.resource];
  if (!fn) return fail(res, 404, `Unknown resource. Try: ${Object.keys(resources).join(', ')}.`);
  await fn(q, res);
});
