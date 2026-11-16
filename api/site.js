import { wrap, ok, fail, query, readJson, sameOrigin, clean } from '../lib/http.js';
import { readSession, accessFor, requireUser, guildId, publicUser } from '../lib/session.js';
import { readDoc, updateDoc } from '../lib/store.js';
import {
  getSettings, publicSettings, quote, newRideId, newId, pushTimeline, CLASSES, TRIPS, ACTIVE, MAX_RIDES, MAX_REVIEWS,
  onlineDrivers, publicDriver, riderRide, publicReview, reviewSummary, saveStats,
} from '../lib/data.js';
import { erlcConfigured, serverStatus, isInServer } from '../lib/erlc.js';

const httpError = (status, message) => Object.assign(new Error(message), { status });
const ROBLOX = /^[A-Za-z0-9_]{3,20}$/;
const POSTAL = /^[0-9]{0,5}$/;

function postOnly(req) {
  if (req.method !== 'POST') throw httpError(405, 'Use POST.');
  if (!sameOrigin(req)) throw httpError(403, 'Bad origin.');
}

/* GET  ?op=bootstrap  settings, viewer, live counts. Called by every page. */
async function bootstrap(req, res) {
  const [settings, drivers, stats, server] = await Promise.all([getSettings(), readDoc('drivers', {}), readDoc('stats', {}), serverStatus()]);
  const viewer = readSession(req);
  ok(res, {
    ok: true,
    settings: publicSettings(settings),
    viewer: publicUser(viewer),
    inGuild: Boolean(viewer?.inGuild),
    guildConfigured: Boolean(guildId()),
    access: accessFor(viewer),
    erlc: erlcConfigured(),
    server,
    stats: {
      online: onlineDrivers(drivers).length,
      completed: stats.completed || 0,
      rating: stats.reviews?.avg || 0,
      reviews: stats.reviews?.count || 0,
    },
  });
}

/* GET  ?op=drivers  drivers online right now (public view). */
async function drivers(req, res) {
  const all = await readDoc('drivers', {});
  const list = onlineDrivers(all).sort((a, b) => (a.since || 0) - (b.since || 0)).map(publicDriver);
  ok(res, { ok: true, drivers: list });
}

/* GET  ?op=reviews  visible reviews + summary. */
async function reviews(req, res) {
  const all = await readDoc('reviews', []);
  const visible = all.filter((r) => !r.hidden);
  ok(res, { ok: true, summary: reviewSummary(all), reviews: visible.slice(0, 300).map(publicReview) });
}

/* POST ?op=review  { rating, text, class?, rideId? } */
async function review(req, res) {
  postOnly(req);
  const user = await requireUser(req);
  const b = await readJson(req, 16 * 1024);
  const rating = Number(b.rating);
  const text = clean(b.text, 600);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw httpError(400, 'Pick a rating from 1 to 5 stars.');
  if (text.length < 8) throw httpError(400, 'Write at least a few words.');
  let cls = CLASSES.includes(b.class) ? b.class : null;
  const rideId = clean(b.rideId, 20) || null;

  let driverId = null, driverName = null;
  if (rideId) {
    const rides = await readDoc('rides', []);
    const ride = rides.find((r) => r.id === rideId && r.rider.id === user.id);
    if (!ride || ride.status !== 'completed') throw httpError(400, 'You can only review your own completed rides.');
    driverId = ride.driver?.id || null;
    driverName = ride.driver?.name || null;
    cls = ride.class;
  }

  let created;
  const all = await updateDoc('reviews', [], (list) => {
    const mine = list.filter((r) => r.user.id === user.id);
    if (rideId && mine.some((r) => r.rideId === rideId)) throw httpError(409, 'You already reviewed this ride.');
    if (!rideId && mine.some((r) => !r.rideId && Date.now() - r.createdAt < 12 * 3600e3)) throw httpError(429, 'You can post one general review every 12 hours.');
    created = {
      id: newId('rv_'), rating, text, class: cls, rideId, driverId, driverName,
      user: { id: user.id, username: user.username, name: user.name, avatar: user.avatar },
      hidden: false, featured: false, createdAt: Date.now(),
    };
    list.unshift(created);
    if (list.length > MAX_REVIEWS) list.length = MAX_REVIEWS;
    return list;
  });

  if (rideId) {
    await updateDoc('rides', [], (rides) => {
      const r = rides.find((x) => x.id === rideId);
      if (r) r.reviewId = created.id;
      return rides;
    }).catch((e) => console.error('Could not link review to ride', e));
  }
  await saveStats({ reviews: reviewSummary(all) });
  ok(res, { ok: true, review: publicReview(created) });
}

/* POST ?op=request  ride request (Discord sign-in required). */
async function request(req, res) {
  postOnly(req);
  const user = await requireUser(req);
  const settings = await getSettings();
  if (!settings.accepting) throw httpError(409, 'Dispatch is closed right now. Check back soon.');
  if (settings.requireGuild && guildId() && !user.inGuild) throw httpError(403, 'Join the Big Sky Discord server first, then sign in again.');

  const b = await readJson(req, 16 * 1024);
  const roblox = clean(b.roblox, 20);
  const pickup = clean(b.pickup, 120);
  const dropoff = clean(b.dropoff, 120);
  const pickupPostal = clean(String(b.pickupPostal ?? ''), 5);
  const dropoffPostal = clean(String(b.dropoffPostal ?? ''), 5);
  const cls = b.class;
  const trip = b.trip;
  const eats = cls === 'eats';
  const passengers = eats ? 1 : Number(b.passengers);
  const notes = clean(b.notes, 300);
  const order = eats ? clean(b.order, 400) : '';

  if (!ROBLOX.test(roblox)) throw httpError(400, 'Enter your exact Roblox username (3–20 letters, numbers or _).');
  if (pickup.length < 2) throw httpError(400, eats ? 'Which restaurant or store is it from?' : 'Where should we pick you up?');
  if (dropoff.length < 2) throw httpError(400, eats ? 'Where should we deliver it?' : 'Where are you headed?');
  if (eats && order.length < 2) throw httpError(400, 'What would you like? Add your order.');
  if (!POSTAL.test(pickupPostal) || !POSTAL.test(dropoffPostal)) throw httpError(400, 'Postal codes are numbers only.');
  if (!CLASSES.includes(cls) || !settings.prices[cls].enabled) throw httpError(400, eats ? 'Uber Eats is paused right now.' : 'Pick a ride class.');
  if (!TRIPS[trip]) throw httpError(400, 'Pick a trip length.');
  if (!Number.isInteger(passengers) || passengers < 1 || passengers > settings.maxPassengers) throw httpError(400, `Passengers must be 1–${settings.maxPassengers}.`);
  if (b.agree !== true) throw httpError(400, 'Please agree to the rider guidelines.');
  if (settings.requireInGame && erlcConfigured()) {
    const inGame = await isInServer(roblox);
    if (inGame === false) throw httpError(409, `We can't see ${roblox} in the Big Sky ER:LC server. Join the server, then request again.`);
  }

  let created;
  await updateDoc('rides', [], (rides) => {
    const mine = rides.filter((r) => r.rider.id === user.id);
    if (mine.some((r) => ACTIVE.has(r.status))) throw httpError(409, 'You already have an active ride or order. Cancel it or wait until it finishes.');
    if (mine[0] && Date.now() - mine[0].createdAt < 30_000) throw httpError(429, 'Slow down a little, try again in a few seconds.');
    created = {
      id: newRideId(), status: 'pending', class: cls, trip, roblox, pickup, pickupPostal, dropoff, dropoffPostal, passengers, notes, ...(eats ? { order } : {}),
      quote: quote(settings, cls, trip), fare: null, driver: null,
      rider: { id: user.id, username: user.username, name: user.name, avatar: user.avatar },
      createdAt: Date.now(), updatedAt: Date.now(), timeline: [],
    };
    pushTimeline(created, 'pending', 'rider');
    rides.unshift(created);
    if (rides.length > MAX_RIDES) rides.length = MAX_RIDES;
    return rides;
  });
  ok(res, { ok: true, ride: riderRide(created) });
}

/* GET  ?op=myrides */
async function myrides(req, res) {
  const user = await requireUser(req);
  const rides = await readDoc('rides', []);
  ok(res, { ok: true, rides: rides.filter((r) => r.rider.id === user.id).slice(0, 30).map(riderRide) });
}

/* POST ?op=cancel  { id, reason? } */
async function cancel(req, res) {
  postOnly(req);
  const user = await requireUser(req);
  const b = await readJson(req, 4096);
  let ride;
  const rides = await updateDoc('rides', [], (list) => {
    ride = list.find((r) => r.id === b.id && r.rider.id === user.id);
    if (!ride) throw httpError(404, 'Ride not found.');
    if (!['pending', 'accepted', 'enroute', 'arrived'].includes(ride.status)) throw httpError(409, 'This ride can no longer be cancelled.');
    ride.cancelledAt = Date.now();
    ride.cancelledBy = 'rider';
    ride.cancelReason = clean(b.reason, 200) || 'Cancelled by rider';
    pushTimeline(ride, 'cancelled', 'rider');
    return list;
  });
  if (ride.driver) {
    await updateDoc('drivers', {}, (d) => { if (d[ride.driver.id]) d[ride.driver.id].busy = false; return d; }).catch(() => {});
  }
  const { cancelled } = rides.reduce((a, r) => (r.status === 'cancelled' ? { cancelled: a.cancelled + 1 } : a), { cancelled: 0 });
  await saveStats({ cancelled });
  ok(res, { ok: true, ride: riderRide(ride) });
}

const ops = { bootstrap, drivers, reviews, review, request, myrides, cancel };

export default wrap(async (req, res) => {
  const fn = ops[query(req).op];
  if (!fn) return fail(res, 404, 'Unknown operation.');
  await fn(req, res);
});
