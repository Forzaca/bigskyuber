import { timingSafeEqual, createHash } from 'node:crypto';
import { wrap, send, query } from '../lib/http.js';
import { readDoc } from '../lib/store.js';
import { serverStatus, serverPlayers, erlcConfigured } from '../lib/erlc.js';
import { apiShift, resolveShifts } from '../lib/data.js';
import { apiRide, apiReview, apiDriver, isOnline, reviewSummary, rideStats, ACTIVE, CLASSES, STATUSES, getSettings } from '../lib/data.js';

/*
 * Read-only API for the Discord bot.
 * Auth:  Authorization: Bearer <UBERBIGSKY>   or   X-API-Key: <UBERBIGSKY>
 *
 *   GET /api/v1/ping
 *   GET /api/v1/stats
 *   GET /api/v1/rides?status=&class=&rider=&driver=&roblox=&since=&limit=
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

function sinceOf(q) {
  if (!q.since) return 0;
  const n = Number(q.since);
  const t = Number.isFinite(n) ? (n < 1e12 ? n * 1000 : n) : Date.parse(q.since);
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
  const roblox = q.roblox ? String(q.roblox).toLowerCase() : null;
  let list = all.filter((r) =>
    (!statuses || statuses.includes(r.status)) &&
    (!q.class || r.class === q.class) &&
    (!q.rider || r.rider.id === q.rider) &&
    (!q.driver || r.driver?.id === q.driver) &&
    (!roblox || r.roblox.toLowerCase() === roblox || r.driver?.roblox?.toLowerCase() === roblox) &&
    (!since || r.createdAt >= since),
  );
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
  const rating = q.rating ? Number(q.rating) : null;
  const minRating = q.minRating ? Number(q.minRating) : null;
  let list = all.filter((r) =>
    (includeHidden || !r.hidden) &&
    (!rating || r.rating === rating) &&
    (!minRating || r.rating >= minRating) &&
    (!q.driver || r.driverId === q.driver) &&
    (!q.class || r.class === q.class),
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
  json(res, 200, { ok: true, accepting: s.accepting, currency: 'in-game USD', classes: s.prices });
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

const resources = { server, shifts, rides, reviews, drivers, stats, pricing, ping: (q, res) => json(res, 200, { ok: true, pong: true, time: new Date().toISOString() }) };

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
