import { wrap, ok, fail, query, readJson, sameOrigin, clean } from '../lib/http.js';
import { requireAccess, publicUser, guildId } from '../lib/session.js';
import { readDoc, updateDoc, blobConfigured } from '../lib/store.js';
import {
  getSettings, DEFAULT_PRICES, CLASSES, STATUSES, ACTIVE, pushTimeline, isOnline, rideStats, reviewSummary, saveStats, closeShift, resolveShifts,
} from '../lib/data.js';
import { erlcConfigured, serverStatus } from '../lib/erlc.js';

const httpError = (status, message) => Object.assign(new Error(message), { status });

function postOnly(req) {
  if (req.method !== 'POST') throw httpError(405, 'Use POST.');
  if (!sameOrigin(req)) throw httpError(403, 'Bad origin.');
}

/* GET ?op=overview  everything for the admin panel. */
async function overview(req, res) {
  const { user, access } = await requireAccess(req, res, 'admin');
  const [settings, rides, drivers, reviews, bans, users, stats, shiftDoc] = await Promise.all([
    getSettings(), readDoc('rides', []), readDoc('drivers', {}), readDoc('reviews', []), readDoc('bans', []), readDoc('users', {}), readDoc('stats', {}), readDoc('shifts', []),
  ]);
  const server = await serverStatus();
  const dayAgo = Date.now() - 864e5;
  ok(res, {
    ok: true,
    viewer: publicUser(user),
    access,
    settings,
    rides: rides.slice(0, 1500),
    drivers: Object.values(drivers).map((d) => ({ ...d, online: isOnline(d) })).sort((a, b) => Number(b.online) - Number(a.online) || (b.totalRides || 0) - (a.totalRides || 0)),
    reviews,
    bans,
    server,
    shifts: resolveShifts(shiftDoc.slice(0, 2500), drivers),
    users: Object.values(users).sort((a, b) => b.lastLogin - a.lastLogin).slice(0, 600),
    stats: {
      ...rideStats(rides),
      active: rides.filter((r) => ACTIVE.has(r.status)).length,
      pending: rides.filter((r) => r.status === 'pending').length,
      last24h: rides.filter((r) => r.createdAt > dayAgo).length,
      earned24h: rides.filter((r) => r.status === 'completed' && (r.completedAt || 0) > dayAgo).reduce((s, r) => s + (r.fare || 0), 0),
      online: Object.values(drivers).filter(isOnline).length,
      drivers: Object.keys(drivers).length,
      users: Object.keys(users).length,
      reviews: reviewSummary(reviews),
      savedAt: stats.updatedAt || null,
    },
    system: {
      blob: blobConfigured(),
      session: Boolean(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16),
      discordOAuth: Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET),
      guild: Boolean(guildId()),
      adminRole: Boolean(process.env.DISCORD_ADMIN_ROLE_ID),
      workerRole: Boolean(process.env.DISCORD_WORKER_ROLE_ID),
      botToken: Boolean(process.env.DISCORD_BOT_TOKEN),
      apiKey: Boolean(process.env.UBERBIGSKY && process.env.UBERBIGSKY.length >= 8),
      erlc: erlcConfigured(),
      erlcOk: Boolean(server?.online),
      erlcState: server ? (server.online ? 'online' : server.reason) : 'off',
    },
  });
}

/* POST ?op=settings */
async function settings(req, res) {
  postOnly(req);
  await requireAccess(req, res, 'admin');
  const b = await readJson(req, 16 * 1024);
  const invite = clean(b.discordInvite, 120);
  if (invite && !/^https:\/\/(discord\.gg|discord\.com\/invite)\/[A-Za-z0-9-]+$/.test(invite)) throw httpError(400, 'Discord invite must look like https://discord.gg/yourcode');
  const prices = {};
  for (const c of CLASSES) {
    const p = b.prices?.[c] || {};
    const min = Math.round(Number(p.min));
    const max = Math.round(Number(p.max));
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min || max > 10_000_000) throw httpError(400, `${DEFAULT_PRICES[c].name}: minimum must be 0 or more and not above the maximum.`);
    prices[c] = { min, max, enabled: p.enabled !== false, tagline: clean(p.tagline, 80) || DEFAULT_PRICES[c].tagline };
  }
  if (!Object.values(prices).some((p) => p.enabled)) throw httpError(400, 'Keep at least one class enabled.');
  const maxPassengers = Math.round(Number(b.maxPassengers));
  const next = await updateDoc('settings', {}, (s) => ({
    ...s,
    accepting: Boolean(b.accepting),
    announcement: clean(b.announcement, 200),
    requireGuild: Boolean(b.requireGuild),
    requireInGame: b.requireInGame !== false,
    discordInvite: invite,
    serverCode: clean(b.serverCode, 20),
    maxPassengers: maxPassengers >= 1 && maxPassengers <= 8 ? maxPassengers : 4,
    prices,
  }));
  ok(res, { ok: true, settings: next });
}

/* POST ?op=ride  { id, status?, fare?, driverId?, adminNote? } */
async function ride(req, res) {
  postOnly(req);
  const { user } = await requireAccess(req, res, 'admin');
  const b = await readJson(req, 8192);
  const drivers = await readDoc('drivers', {});
  let ride;
  const rides = await updateDoc('rides', [], (list) => {
    ride = list.find((r) => r.id === b.id);
    if (!ride) throw httpError(404, 'Ride not found.');
    if (b.driverId !== undefined) {
      if (!b.driverId) ride.driver = null;
      else {
        const d = drivers[b.driverId];
        if (!d) throw httpError(400, 'That driver has no profile yet.');
        ride.driver = { id: d.id, username: d.username, name: d.name, avatar: d.avatar, roblox: d.roblox, vehicle: d.vehicle, callsign: d.callsign };
        ride.acceptedAt ||= Date.now();
      }
    }
    if (b.fare !== undefined && b.fare !== null && b.fare !== '') {
      const fare = Math.round(Number(b.fare));
      if (!Number.isFinite(fare) || fare < 0) throw httpError(400, 'Fare must be a number.');
      ride.fare = fare;
    }
    if (b.adminNote !== undefined) ride.adminNote = clean(b.adminNote, 300);
    if (b.status && b.status !== ride.status) {
      if (!STATUSES.includes(b.status)) throw httpError(400, 'Unknown status.');
      if (b.status !== 'pending' && b.status !== 'cancelled' && !ride.driver) throw httpError(400, 'Assign a driver first.');
      if (b.status === 'completed') { ride.completedAt = Date.now(); ride.fare ??= ride.quote?.estimate ?? 0; }
      if (b.status === 'cancelled') { ride.cancelledAt = Date.now(); ride.cancelledBy = 'admin'; ride.cancelReason = clean(b.reason, 200) || 'Cancelled by staff'; }
      if (b.status === 'pending') { ride.driver = null; }
      pushTimeline(ride, b.status, user.id);
    }
    ride.updatedAt = Date.now();
    return list;
  });
  await syncBusy(rides);
  await saveStats(rideStats(rides));
  ok(res, { ok: true, ride });
}

/* POST ?op=rideDelete  { id } */
async function rideDelete(req, res) {
  postOnly(req);
  await requireAccess(req, res, 'admin');
  const b = await readJson(req, 1024);
  const rides = await updateDoc('rides', [], (list) => list.filter((r) => r.id !== b.id));
  await syncBusy(rides);
  await saveStats(rideStats(rides));
  ok(res, { ok: true });
}

/** Keeps each driver's busy flag in line with the rides they actually have open. */
async function syncBusy(rides) {
  const busy = new Set(rides.filter((r) => ACTIVE.has(r.status) && r.driver).map((r) => r.driver.id));
  await updateDoc('drivers', {}, (d) => {
    for (const id of Object.keys(d)) d[id].busy = busy.has(id);
    return d;
  }).catch((e) => console.error('syncBusy failed', e));
}

/* POST ?op=review  { id, hidden?, featured? } */
async function review(req, res) {
  postOnly(req);
  await requireAccess(req, res, 'admin');
  const b = await readJson(req, 1024);
  const all = await updateDoc('reviews', [], (list) => {
    const r = list.find((x) => x.id === b.id);
    if (!r) throw httpError(404, 'Review not found.');
    if (b.hidden !== undefined) r.hidden = Boolean(b.hidden);
    if (b.featured !== undefined) r.featured = Boolean(b.featured);
    return list;
  });
  await saveStats({ reviews: reviewSummary(all) });
  ok(res, { ok: true });
}

/* POST ?op=reviewDelete  { id } */
async function reviewDelete(req, res) {
  postOnly(req);
  await requireAccess(req, res, 'admin');
  const b = await readJson(req, 1024);
  const all = await updateDoc('reviews', [], (list) => list.filter((r) => r.id !== b.id));
  await saveStats({ reviews: reviewSummary(all) });
  ok(res, { ok: true });
}

/* POST ?op=driver  { id, offline?, remove? } */
async function driver(req, res) {
  postOnly(req);
  await requireAccess(req, res, 'admin');
  const b = await readJson(req, 1024);
  await updateDoc('drivers', {}, (d) => {
    if (!d[b.id]) throw httpError(404, 'Driver not found.');
    if (b.remove) delete d[b.id];
    else if (b.offline) { d[b.id].online = false; d[b.id].since = null; }
    return d;
  });
  await closeShift(b.id);
  ok(res, { ok: true });
}

/* POST ?op=ban  { userId, reason }  /  ?op=unban  { userId } */
async function ban(req, res) {
  postOnly(req);
  const { user } = await requireAccess(req, res, 'admin');
  const b = await readJson(req, 2048);
  const userId = clean(b.userId, 25);
  if (!/^\d{15,22}$/.test(userId)) throw httpError(400, 'Enter a Discord user ID (numbers only).');
  if (userId === user.id) throw httpError(400, 'You cannot ban yourself.');
  const users = await readDoc('users', {});
  await updateDoc('bans', [], (list) => {
    if (list.some((x) => x.userId === userId)) throw httpError(409, 'Already banned.');
    list.unshift({ userId, name: users[userId]?.name || null, reason: clean(b.reason, 200) || 'No reason given', by: user.name, at: Date.now() });
    return list;
  });
  // Cancel anything they still have waiting.
  await updateDoc('rides', [], (list) => {
    for (const r of list) if (r.rider.id === userId && r.status === 'pending') { r.cancelledAt = Date.now(); r.cancelledBy = 'admin'; r.cancelReason = 'Account banned'; pushTimeline(r, 'cancelled', user.id); }
    return list;
  });
  ok(res, { ok: true });
}

async function unban(req, res) {
  postOnly(req);
  await requireAccess(req, res, 'admin');
  const b = await readJson(req, 1024);
  await updateDoc('bans', [], (list) => list.filter((x) => x.userId !== b.userId));
  ok(res, { ok: true });
}

const ops = { overview, settings, ride, rideDelete, review, reviewDelete, driver, ban, unban };

export default wrap(async (req, res) => {
  const fn = ops[query(req).op];
  if (!fn) return fail(res, 404, 'Unknown operation.');
  await fn(req, res);
});
