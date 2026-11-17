import { wrap, ok, fail, query, readJson, sameOrigin, clean } from '../lib/http.js';
import { requireAccess, publicUser, guildId } from '../lib/session.js';
import { readDoc, updateDoc, blobConfigured } from '../lib/store.js';
import {
  getSettings, DEFAULT_PRICES, newId, TRIP_KEYS, TRIPS, CLASSES, STATUSES, ACTIVE, pushTimeline, isOnline, rideStats, reviewSummary, saveStats, closeShift, resolveShifts,
} from '../lib/data.js';
import { erlcConfigured, serverStatus } from '../lib/erlc.js';
import { notify, isGroup, publicNotification, readNotifications } from '../lib/notify.js';
import { computePay, payConfig, publicStub, weekStart, WEEK, MAX_PAYSTUBS } from '../lib/pay.js';
import { dockConfigured, dockVerifyEnabled } from '../lib/dock.js';
import { logActivity, actorOf } from '../lib/activity.js';

const httpError = (status, message) => Object.assign(new Error(message), { status });

function postOnly(req) {
  if (req.method !== 'POST') throw httpError(405, 'Use POST.');
  if (!sameOrigin(req)) throw httpError(403, 'Bad origin.');
}

/* GET ?op=overview  everything for the admin panel. */
async function overview(req, res) {
  const { user, access } = await requireAccess(req, res, 'admin');
  const [settings, rides, drivers, reviews, bans, users, stats, shiftDoc, paystubs, notes] = await Promise.all([
    getSettings(), readDoc('rides', []), readDoc('drivers', {}), readDoc('reviews', []), readDoc('bans', []), readDoc('users', {}), readDoc('stats', {}), readDoc('shifts', []), readDoc('paystubs', []), readNotifications(),
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
    paystubs: paystubs.slice(0, 1000),
    announcements: notes.filter((n) => n.kind === 'announce').slice(0, 100).map((n) => ({ ...publicNotification(n), to: n.to, from: n.from })),
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
      dock: dockConfigured(),
      dockVerify: dockVerifyEnabled(),
    },
  });
}

/* POST ?op=settings */
async function settings(req, res) {
  postOnly(req);
  const { user } = await requireAccess(req, res, 'admin');
  const b = await readJson(req, 16 * 1024);
  const invite = clean(b.discordInvite, 120);
  if (invite && !/^https:\/\/(discord\.gg|discord\.com\/invite)\/[A-Za-z0-9-]+$/.test(invite)) throw httpError(400, 'Discord invite must look like https://discord.gg/yourcode');
  const money = (v) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= 0 && n <= 10_000_000 ? n : null; };
  const prices = {};
  for (const c of CLASSES) {
    const p = b.prices?.[c] || {};
    const name = clean(p.name, 30) || DEFAULT_PRICES[c].name;
    const fares = {};
    for (const k of TRIP_KEYS) {
      fares[k] = money(p.fares?.[k]);
      if (fares[k] === null) throw httpError(400, `${name}: every trip length needs a price of $0 or more.`);
    }
    const lo = Math.min(...Object.values(fares));
    const hi = Math.max(...Object.values(fares));
    // Blank range = exactly the cheapest to the dearest trip.
    const min = p.min === '' || p.min == null ? lo : money(p.min);
    const max = p.max === '' || p.max == null ? hi : money(p.max);
    if (min === null || max === null || max < min) throw httpError(400, `${name}: the driver range needs a minimum that isn't above the maximum.`);
    if (lo < min || hi > max) throw httpError(400, `${name}: every trip price must sit inside the driver range ($${min} – $${max}).`);
    prices[c] = { name, fares, min, max, enabled: p.enabled !== false, tagline: clean(p.tagline, 80) || DEFAULT_PRICES[c].tagline };
  }
  const trips = {};
  for (const k of TRIP_KEYS) trips[k] = { label: clean(b.trips?.[k]?.label, 24) || TRIPS[k].label, hint: clean(b.trips?.[k]?.hint, 40) || TRIPS[k].hint };
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
    trips,
    requireRobloxLink: Boolean(b.requireRobloxLink),
    pay: { rate: Math.min(100, Math.max(0, Math.round(Number(b.pay?.rate ?? 70)))), hourly: Math.min(1_000_000, Math.max(0, Math.round(Number(b.pay?.hourly) || 0))) },
  }));
  const on = Object.entries(prices).filter(([, p]) => p.enabled).map(([, p]) => p.name).join(', ');
  await logActivity({ kind: 'settings', title: 'Site settings updated', body: `Requests ${next.accepting ? 'open' : 'closed'} · Classes: ${on} · Driver pay ${next.pay.rate}%${next.pay.hourly ? ` + $${next.pay.hourly}/h` : ''}`, actor: actorOf(user) });
  ok(res, { ok: true, settings: next });
}

/* POST ?op=ride  { id, status?, fare?, driverId?, adminNote? } */
async function ride(req, res) {
  postOnly(req);
  const { user } = await requireAccess(req, res, 'admin');
  const b = await readJson(req, 8192);
  const drivers = await readDoc('drivers', {});
  let ride, prevDriver, prevStatus;
  const rides = await updateDoc('rides', [], (list) => {
    ride = list.find((r) => r.id === b.id);
    if (!ride) throw httpError(404, 'Ride not found.');
    prevDriver = ride.driver?.id || null;
    prevStatus = ride.status;
    if (b.driverId !== undefined) {
      if (!b.driverId) ride.driver = null;
      else {
        const d = drivers[b.driverId];
        if (!d) throw httpError(400, 'That driver has no profile yet.');
        ride.driver = { id: d.id, username: d.username, name: d.name, avatar: d.avatar, headshot: d.headshot || null, roblox: d.roblox, vehicle: d.vehicle, callsign: d.callsign };
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
  const n = [];
  if (ride.driver && ride.driver.id !== prevDriver) n.push({ to: ride.driver.id, kind: 'assigned', href: '/workers', title: 'Staff assigned you a ride', body: `${ride.id} · ${ride.pickup} → ${ride.dropoff}` });
  if (ride.status === 'cancelled' && prevStatus !== 'cancelled') n.push({ to: ride.rider.id, kind: 'cancelled', href: ride.class === 'eats' ? '/eats' : '/ride', title: ride.class === 'eats' ? 'Your order was cancelled' : 'Your ride was cancelled', body: ride.cancelReason || 'Cancelled by staff' });
  await notify(n);
  const changes = [];
  if (ride.status !== prevStatus) changes.push(`Status: ${prevStatus} → ${ride.status}`);
  if ((ride.driver?.id || null) !== prevDriver) changes.push(ride.driver ? `Driver: ${ride.driver.name}` : 'Driver removed');
  if (b.fare !== undefined && b.fare !== null && b.fare !== '') changes.push(`Fare: $${ride.fare}`);
  if (b.adminNote) changes.push(`Note: ${ride.adminNote}`);
  await logActivity({ kind: 'ride.edit', title: `Staff edited ride ${ride.id}`, body: changes.join('\n') || 'No visible changes', actor: actorOf(user), target: { id: ride.rider.id, name: ride.roblox }, ref: ride.id });
  ok(res, { ok: true, ride });
}

/* POST ?op=rideDelete  { id } */
async function rideDelete(req, res) {
  postOnly(req);
  const { user } = await requireAccess(req, res, 'admin');
  const b = await readJson(req, 1024);
  const rides = await updateDoc('rides', [], (list) => list.filter((r) => r.id !== b.id));
  await logActivity({ kind: 'ride.delete', title: `Staff deleted ride ${b.id}`, actor: actorOf(user), ref: b.id });
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
  const { user } = await requireAccess(req, res, 'admin');
  const b = await readJson(req, 1024);
  const all = await updateDoc('reviews', [], (list) => {
    const r = list.find((x) => x.id === b.id);
    if (!r) throw httpError(404, 'Review not found.');
    if (b.hidden !== undefined) r.hidden = Boolean(b.hidden);
    if (b.featured !== undefined) r.featured = Boolean(b.featured);
    return list;
  });
  {
    const what = [b.hidden !== undefined ? (b.hidden ? 'hidden' : 'unhidden') : null, b.featured !== undefined ? (b.featured ? 'featured' : 'unfeatured') : null].filter(Boolean).join(' and ');
    await logActivity({ kind: 'review.moderate', title: `Review ${what || 'updated'}`, body: `Review ${b.id}`, actor: actorOf(user), ref: b.id });
  }
  await saveStats({ reviews: reviewSummary(all) });
  ok(res, { ok: true });
}

/* POST ?op=reviewDelete  { id } */
async function reviewDelete(req, res) {
  postOnly(req);
  const { user } = await requireAccess(req, res, 'admin');
  const b = await readJson(req, 1024);
  const all = await updateDoc('reviews', [], (list) => list.filter((r) => r.id !== b.id));
  await logActivity({ kind: 'review.delete', title: 'Review deleted', body: `Review ${b.id}`, actor: actorOf(user), ref: b.id });
  await saveStats({ reviews: reviewSummary(all) });
  ok(res, { ok: true });
}

/* POST ?op=driver  { id, offline?, remove? } */
async function driver(req, res) {
  postOnly(req);
  const { user } = await requireAccess(req, res, 'admin');
  const b = await readJson(req, 1024);
  await updateDoc('drivers', {}, (d) => {
    if (!d[b.id]) throw httpError(404, 'Driver not found.');
    if (b.remove) delete d[b.id];
    else if (b.offline) { d[b.id].online = false; d[b.id].since = null; }
    return d;
  });
  await logActivity({ kind: 'driver.' + (b.remove ? 'remove' : 'offline'), title: b.remove ? 'Driver profile removed' : 'Driver set offline by staff', actor: actorOf(user), target: { id: b.id } });
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
  await logActivity({ kind: 'ban', title: 'User banned from the site', body: clean(b.reason, 200) || 'No reason given', actor: actorOf(user), target: { id: userId, name: users[userId]?.name || null } });
  // Cancel anything they still have waiting.
  await updateDoc('rides', [], (list) => {
    for (const r of list) if (r.rider.id === userId && r.status === 'pending') { r.cancelledAt = Date.now(); r.cancelledBy = 'admin'; r.cancelReason = 'Account banned'; pushTimeline(r, 'cancelled', user.id); }
    return list;
  });
  ok(res, { ok: true });
}

async function unban(req, res) {
  postOnly(req);
  const { user } = await requireAccess(req, res, 'admin');
  const b = await readJson(req, 1024);
  await updateDoc('bans', [], (list) => list.filter((x) => x.userId !== b.userId));
  await logActivity({ kind: 'unban', title: 'User unbanned', actor: actorOf(user), target: { id: String(b.userId || '') } });
  ok(res, { ok: true });
}

/* GET ?op=payroll&start=&end=  what every driver earned in the period (defaults to last week) */
function periodOf(q) {
  const start = Number(q.start) || weekStart(Date.now(), -1);
  const end = Number(q.end) || start + WEEK;
  if (!(end > start) || end - start > 92 * 864e5) throw httpError(400, 'Pick a period of up to 92 days.');
  return { start, end };
}

async function payroll(req, res) {
  await requireAccess(req, res, 'admin');
  const { start, end } = periodOf(query(req));
  const [settings, rides, drivers, shiftDoc, stubs] = await Promise.all([getSettings(), readDoc('rides', []), readDoc('drivers', {}), readDoc('shifts', []), readDoc('paystubs', [])]);
  const shifts = resolveShifts(shiftDoc, drivers);
  const rows = Object.values(drivers).map((d) => {
    const p = computePay({ driverId: d.id, start, end, rides, shifts, settings });
    const issued = stubs.find((s) => s.driverId === d.id && s.periodStart === start && s.periodEnd === end && s.status !== 'void');
    return { driver: { id: d.id, name: d.name, username: d.username, avatar: d.avatar, headshot: d.headshot || null, roblox: d.roblox || '', callsign: d.callsign || '' }, ...p, issued: issued ? publicStub(issued) : null };
  }).filter((r) => r.trips || r.hours || r.issued).sort((a, b) => b.total - a.total);
  ok(res, { ok: true, start, end, config: payConfig(settings), rows });
}

/* POST ?op=paystub { driverId, start, end, bonus?, deductions?, note?, notify? }  issue a paystub */
async function paystub(req, res) {
  postOnly(req);
  const { user } = await requireAccess(req, res, 'admin');
  const b = await readJson(req, 4096);
  const { start, end } = periodOf(b);
  const [settings, rides, drivers, shiftDoc] = await Promise.all([getSettings(), readDoc('rides', []), readDoc('drivers', {}), readDoc('shifts', [])]);
  const d = drivers[b.driverId];
  if (!d) throw httpError(404, 'Driver not found.');
  const amt = (v) => { const n = Math.round(Number(v) || 0); if (n < 0 || n > 10_000_000) throw httpError(400, 'Bonus and deductions must be $0 or more.'); return n; };
  const bonus = amt(b.bonus), deductions = amt(b.deductions);
  const p = computePay({ driverId: d.id, start, end, rides, shifts: resolveShifts(shiftDoc, drivers), settings });
  let stub;
  await updateDoc('paystubs', [], (list) => {
    if (list.some((s) => s.driverId === d.id && s.periodStart === start && s.periodEnd === end && s.status !== 'void')) throw httpError(409, 'This driver already has a paystub for this period. Void it first to reissue.');
    const number = (list.reduce((m, s) => Math.max(m, s.number || 0), 1000)) + 1;
    stub = {
      id: newId('ps_'), number, status: 'issued', driverId: d.id, name: d.name, username: d.username, avatar: d.avatar, roblox: d.roblox || '', callsign: d.callsign || '',
      ...p, bonus, deductions, net: Math.max(0, p.total + bonus - deductions), note: clean(b.note, 300),
      issuedAt: Date.now(), issuedBy: { id: user.id, name: user.name },
    };
    list.unshift(stub);
    if (list.length > MAX_PAYSTUBS) list.length = MAX_PAYSTUBS;
    return list;
  });
  if (b.notify !== false) {
    const fmt = (t) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    await notify({ to: d.id, kind: 'paystub', href: '/dashboard#pay', title: `Paystub #${stub.number}: ${stub.net.toLocaleString('en-US')}`, body: `${fmt(start)} – ${fmt(end - 1)} · ${stub.trips} trip${stub.trips === 1 ? '' : 's'}. Collect your pay in-game.` });
  }
  await logActivity({ kind: 'paystub.issue', title: `Paystub #${stub.number} issued`, body: `$${stub.net.toLocaleString('en-US')} · ${stub.trips} trip${stub.trips === 1 ? '' : 's'}${bonus ? ` · bonus $${bonus}` : ''}${deductions ? ` · deductions $${deductions}` : ''}`, actor: actorOf(user), target: { id: d.id, name: d.name }, ref: stub.id });
  ok(res, { ok: true, paystub: publicStub(stub) });
}

/* POST ?op=paystubVoid { id } */
async function paystubVoid(req, res) {
  postOnly(req);
  const { user } = await requireAccess(req, res, 'admin');
  const b = await readJson(req, 1024);
  let stub;
  await updateDoc('paystubs', [], (list) => {
    stub = list.find((s) => s.id === b.id);
    if (!stub) throw httpError(404, 'Paystub not found.');
    stub.status = 'void';
    stub.voidedAt = Date.now();
    return list;
  });
  await logActivity({ kind: 'paystub.void', title: `Paystub #${stub.number} voided`, actor: actorOf(user), target: { id: stub.driverId, name: stub.name }, ref: stub.id });
  await notify({ to: stub.driverId, kind: 'paystub', href: '/dashboard#pay', title: `Paystub #${stub.number} was voided`, body: 'Staff will reissue it if needed.' });
  ok(res, { ok: true });
}

/* POST ?op=announce { to: 'all'|'drivers'|'riders'|<discord id>, title, body, href? } */
async function announce(req, res) {
  postOnly(req);
  const { user } = await requireAccess(req, res, 'admin');
  const b = await readJson(req, 4096);
  const to = String(b.to || '').trim();
  if (!isGroup(to) && !/^\d{15,22}$/.test(to)) throw httpError(400, 'Send to everyone, drivers, riders, or a Discord user ID.');
  const title = clean(b.title, 120);
  if (title.length < 2) throw httpError(400, 'Add a title.');
  const href = clean(b.href, 200);
  if (href && !/^(\/[^\s]*|https:\/\/[^\s]+)$/.test(href)) throw httpError(400, 'Links must start with / or https://');
  await logActivity({ kind: 'announce', title: `Notification sent: ${title}`, body: `To: ${isGroup(to) ? to : `<@${to}>`}${b.body ? `\n${clean(b.body, 400)}` : ''}`, actor: actorOf(user) });
  await notify({ to, kind: 'announce', title, body: clean(b.body, 400), href: href || null, from: { id: user.id, name: user.name } });
  ok(res, { ok: true });
}

const ops = { overview, settings, ride, rideDelete, review, reviewDelete, driver, ban, unban, payroll, paystub, paystubVoid, announce };

export default wrap(async (req, res) => {
  const fn = ops[query(req).op];
  if (!fn) return fail(res, 404, 'Unknown operation.');
  await fn(req, res);
});
