import { wrap, ok, fail, query, readJson, sameOrigin, clean } from '../lib/http.js';
import { requireAccess, publicUser } from '../lib/session.js';
import { readDoc, updateDoc } from '../lib/store.js';
import { getSettings, publicSettings, pushTimeline, CLASSES, ACTIVE, DRIVER_NEXT, riderRide, isOnline, rideStats, saveStats, openShift, closeShift, resolveShifts } from '../lib/data.js';
import { serverPlayers } from '../lib/erlc.js';

const httpError = (status, message) => Object.assign(new Error(message), { status });
const ROBLOX = /^[A-Za-z0-9_]{3,20}$/;
const HEARTBEAT_MS = 5 * 60 * 1000;

function postOnly(req) {
  if (req.method !== 'POST') throw httpError(405, 'Use POST.');
  if (!sameOrigin(req)) throw httpError(403, 'Bad origin.');
}

function baseProfile(user) {
  return { id: user.id, username: user.username, name: user.name, avatar: user.avatar, roblox: '', vehicle: '', callsign: '', classes: ['uber'], online: false, busy: false, since: null, lastSeen: 0, totalRides: 0, earned: 0, joinedAt: Date.now() };
}

/** Driver view of a ride: everything the rider sees plus who requested it. */
function driverRide(r) {
  return { ...riderRide(r), rider: { name: r.rider.name, username: r.rider.username, avatar: r.rider.avatar }, driverId: r.driver?.id || null };
}

/* GET ?op=state  everything the panel needs, also acts as a heartbeat. */
async function state(req, res) {
  const { user, access } = await requireAccess(req, res, 'worker');
  const [settings, drivers, rides, reviews, players, shiftDoc] = await Promise.all([getSettings(), readDoc('drivers', {}), readDoc('rides', []), readDoc('reviews', []), serverPlayers(), readDoc('shifts', [])]);
  const inServer = players ? new Set(players.map((p) => p.name.toLowerCase())) : null;
  const withPresence = (r) => ({ ...driverRide(r), inServer: inServer ? inServer.has(r.roblox.toLowerCase()) : null });
  let me = { ...baseProfile(user), ...(drivers[user.id] || {}), name: user.name, avatar: user.avatar, username: user.username };

  if (me.online && Date.now() - (me.lastSeen || 0) > HEARTBEAT_MS) {
    const next = await updateDoc('drivers', {}, (d) => {
      d[user.id] = { ...me, ...(d[user.id] || {}), lastSeen: Date.now(), name: user.name, avatar: user.avatar };
      return d;
    });
    me = next[user.id];
  }

  const mine = rides.filter((r) => r.driver?.id === user.id);
  const done = mine.filter((r) => r.status === 'completed');
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const myReviews = reviews.filter((r) => r.driverId === user.id && !r.hidden);
  const onlineNow = Object.values(drivers).filter(isOnline);

  ok(res, {
    ok: true,
    viewer: publicUser(user),
    access,
    settings: publicSettings(settings),
    me: { ...me, online: isOnline(me) },
    queue: rides.filter((r) => r.status === 'pending').reverse().slice(0, 50).map(withPresence),
    active: mine.filter((r) => ACTIVE.has(r.status)).map(withPresence),
    serverPlayers: players ? players.length : null,
    shifts: resolveShifts(shiftDoc.filter((s) => s.driverId === user.id).slice(0, 60), drivers),
    history: mine.filter((r) => !ACTIVE.has(r.status)).slice(0, 100).map(driverRide),
    stats: {
      today: done.filter((r) => (r.completedAt || 0) >= dayStart.getTime()).length,
      total: done.length,
      earned: done.reduce((s, r) => s + (r.fare || 0), 0),
      rating: myReviews.length ? Math.round((myReviews.reduce((s, r) => s + r.rating, 0) / myReviews.length) * 100) / 100 : null,
      ratings: myReviews.length,
      onlineDrivers: onlineNow.length,
    },
    reviews: myReviews.slice(0, 20).map((r) => ({ id: r.id, rating: r.rating, text: r.text, name: r.user.name, avatar: r.user.avatar, createdAt: r.createdAt })),
  });
}

/* POST ?op=profile  { roblox, vehicle, callsign, classes[] } */
async function profile(req, res) {
  postOnly(req);
  const { user } = await requireAccess(req, res, 'worker');
  const b = await readJson(req, 8192);
  const roblox = clean(b.roblox, 20);
  if (roblox && !ROBLOX.test(roblox)) throw httpError(400, 'That is not a valid Roblox username.');
  const classes = Array.isArray(b.classes) ? b.classes.filter((c) => CLASSES.includes(c)) : ['uber'];
  if (!classes.length) throw httpError(400, 'Pick at least one class you drive.');
  const next = await updateDoc('drivers', {}, (d) => {
    d[user.id] = { ...baseProfile(user), ...(d[user.id] || {}), roblox, vehicle: clean(b.vehicle, 40), callsign: clean(b.callsign, 12), classes, name: user.name, avatar: user.avatar, username: user.username };
    return d;
  });
  ok(res, { ok: true, me: next[user.id] });
}

/* POST ?op=online  { online: boolean } */
async function online(req, res) {
  postOnly(req);
  const { user } = await requireAccess(req, res, 'worker');
  const b = await readJson(req, 1024);
  const want = Boolean(b.online);
  let prev;
  const next = await updateDoc('drivers', {}, (d) => {
    const me = { ...baseProfile(user), ...(d[user.id] || {}) };
    prev = me;
    if (want && !me.roblox) throw httpError(400, 'Add your Roblox username in your profile before going online.');
    d[user.id] = { ...me, online: want, since: want ? (isOnline(me) ? me.since : Date.now()) : null, lastSeen: Date.now(), name: user.name, avatar: user.avatar };
    return d;
  });
  // Shift log: a stale (timed-out) shift ends at the last activity; a new one starts now.
  if (prev.online && !isOnline(prev)) await closeShift(user.id, prev.lastSeen);
  if (want) await openShift(next[user.id]);
  else await closeShift(user.id);
  ok(res, { ok: true, me: { ...next[user.id], online: isOnline(next[user.id]) } });
}

/* POST ?op=accept  { id } */
async function accept(req, res) {
  postOnly(req);
  const { user } = await requireAccess(req, res, 'worker');
  const b = await readJson(req, 1024);
  const drivers = await readDoc('drivers', {});
  const me = { ...baseProfile(user), ...(drivers[user.id] || {}) };
  if (!me.roblox) throw httpError(400, 'Add your Roblox username in your profile first.');

  let ride;
  await updateDoc('rides', [], (rides) => {
    if (rides.some((r) => r.driver?.id === user.id && ACTIVE.has(r.status))) throw httpError(409, 'Finish your current ride before taking another.');
    ride = rides.find((r) => r.id === b.id);
    if (!ride) throw httpError(404, 'Ride not found.');
    if (ride.status !== 'pending') throw httpError(409, 'Someone already took this ride.');
    if (!(me.classes || ['uber']).includes(ride.class)) throw httpError(403, 'You are not set up to drive this class. Update your profile.');
    if (ride.rider.id === user.id) throw httpError(409, 'You cannot accept your own ride.');
    ride.driver = { id: user.id, username: user.username, name: user.name, avatar: user.avatar, roblox: me.roblox, vehicle: me.vehicle, callsign: me.callsign };
    ride.acceptedAt = Date.now();
    pushTimeline(ride, 'accepted', user.id);
    return rides;
  });
  await updateDoc('drivers', {}, (d) => {
    const cur = { ...me, ...(d[user.id] || {}) };
    d[user.id] = { ...cur, busy: true, online: true, since: isOnline(cur) ? cur.since : Date.now(), lastSeen: Date.now() };
    return d;
  });
  if (!isOnline(me)) await openShift(me);
  ok(res, { ok: true, ride: driverRide(ride) });
}

/* POST ?op=advance  { id, status, fare? }  accepted → enroute → arrived → inprogress → completed */
async function advance(req, res) {
  postOnly(req);
  const { user } = await requireAccess(req, res, 'worker');
  const b = await readJson(req, 2048);
  const settings = await getSettings();
  let ride;
  const rides = await updateDoc('rides', [], (list) => {
    ride = list.find((r) => r.id === b.id);
    if (!ride || ride.driver?.id !== user.id) throw httpError(404, 'This is not your ride.');
    const next = DRIVER_NEXT[ride.status];
    if (!next || b.status !== next) throw httpError(409, 'That step is out of order. Refresh and try again.');
    if (next === 'completed') {
      const fare = Math.round(Number(b.fare));
      const { min, max } = ride.quote?.max != null ? ride.quote : settings.prices[ride.class];
      if (!Number.isFinite(fare) || fare < min || fare > max) throw httpError(400, `Fare must be between $${min} and $${max} for this class.`);
      ride.fare = fare;
      ride.completedAt = Date.now();
    }
    pushTimeline(ride, next, user.id);
    return list;
  });
  if (ride.status === 'completed') {
    await updateDoc('drivers', {}, (d) => {
      if (d[user.id]) { d[user.id].busy = false; d[user.id].totalRides = (d[user.id].totalRides || 0) + 1; d[user.id].earned = (d[user.id].earned || 0) + ride.fare; d[user.id].lastSeen = Date.now(); }
      return d;
    });
    await saveStats(rideStats(rides));
  }
  ok(res, { ok: true, ride: driverRide(ride) });
}

/* POST ?op=release  { id }  hand an accepted ride back to the queue. */
async function release(req, res) {
  postOnly(req);
  const { user } = await requireAccess(req, res, 'worker');
  const b = await readJson(req, 1024);
  let ride;
  await updateDoc('rides', [], (list) => {
    ride = list.find((r) => r.id === b.id);
    if (!ride || ride.driver?.id !== user.id) throw httpError(404, 'This is not your ride.');
    if (!['accepted', 'enroute', 'arrived'].includes(ride.status)) throw httpError(409, 'You can only release a ride before the trip starts.');
    ride.driver = null;
    ride.acceptedAt = null;
    pushTimeline(ride, 'pending', user.id);
    return list;
  });
  await updateDoc('drivers', {}, (d) => { if (d[user.id]) d[user.id].busy = false; return d; });
  ok(res, { ok: true });
}

/* POST ?op=cancel  { id, reason }  e.g. rider no-show. */
async function cancel(req, res) {
  postOnly(req);
  const { user } = await requireAccess(req, res, 'worker');
  const b = await readJson(req, 2048);
  const reason = clean(b.reason, 200);
  if (reason.length < 3) throw httpError(400, 'Give a short reason (e.g. rider no-show).');
  let ride;
  const rides = await updateDoc('rides', [], (list) => {
    ride = list.find((r) => r.id === b.id);
    if (!ride || ride.driver?.id !== user.id) throw httpError(404, 'This is not your ride.');
    if (!ACTIVE.has(ride.status)) throw httpError(409, 'This ride is already finished.');
    ride.cancelledAt = Date.now();
    ride.cancelledBy = 'driver';
    ride.cancelReason = reason;
    pushTimeline(ride, 'cancelled', user.id);
    return list;
  });
  await updateDoc('drivers', {}, (d) => { if (d[user.id]) d[user.id].busy = false; return d; });
  await saveStats(rideStats(rides));
  ok(res, { ok: true });
}

const ops = { state, profile, online, accept, advance, release, cancel };

export default wrap(async (req, res) => {
  const fn = ops[query(req).op];
  if (!fn) return fail(res, 404, 'Unknown operation.');
  await fn(req, res);
});
