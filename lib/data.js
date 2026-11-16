import { randomBytes } from 'node:crypto';
import { readDoc, updateDoc } from './store.js';

/* ---------------- Classes & pricing (the Big Sky Economy) ---------------- */

export const CLASSES = ['uber', 'premium', 'black'];

export const DEFAULT_PRICES = {
  uber: { name: 'Uber', min: 100, max: 250, enabled: true, tagline: 'Everyday rides across the county.' },
  premium: { name: 'Uber Premium', min: 250, max: 500, enabled: true, tagline: 'Newer cars and top-rated drivers.' },
  black: { name: 'Uber Black', min: 500, max: 1000, enabled: true, tagline: 'Executive black cars. No compromises.' },
};

/** Trip length picks where in the class range the estimate lands. */
export const TRIPS = {
  local: { label: 'Local', hint: 'Same area, a few blocks', f: 0 },
  town: { label: 'Cross-town', hint: 'Across the city', f: 0.5 },
  county: { label: 'County-wide', hint: 'Town to town', f: 1 },
};

export const DEFAULT_SETTINGS = {
  accepting: true,
  announcement: '',
  requireGuild: false,
  requireInGame: true,
  discordInvite: '',
  serverCode: '',
  maxPassengers: 4,
  prices: DEFAULT_PRICES,
};

export async function getSettings() {
  const s = await readDoc('settings', {});
  const prices = {};
  for (const c of CLASSES) prices[c] = { ...DEFAULT_PRICES[c], ...(s.prices?.[c] || {}), name: DEFAULT_PRICES[c].name };
  return { ...DEFAULT_SETTINGS, ...s, prices };
}

export function publicSettings(s) {
  return {
    accepting: s.accepting,
    announcement: s.announcement,
    requireGuild: s.requireGuild,
    requireInGame: s.requireInGame,
    discordInvite: s.discordInvite,
    serverCode: s.serverCode,
    maxPassengers: s.maxPassengers,
    prices: s.prices,
    trips: Object.fromEntries(Object.entries(TRIPS).map(([k, v]) => [k, { label: v.label, hint: v.hint, f: v.f }])),
  };
}

export function quote(settings, cls, trip) {
  const p = settings.prices[cls];
  const f = TRIPS[trip]?.f ?? 0.5;
  const est = Math.round((p.min + (p.max - p.min) * f) / 10) * 10;
  return { min: p.min, max: p.max, estimate: est };
}

/* ---------------- Rides ---------------- */

export const MAX_RIDES = 3000;
export const MAX_REVIEWS = 1500;
export const STATUSES = ['pending', 'accepted', 'enroute', 'arrived', 'inprogress', 'completed', 'cancelled'];
export const ACTIVE = new Set(['pending', 'accepted', 'enroute', 'arrived', 'inprogress']);
export const DRIVER_NEXT = { accepted: 'enroute', enroute: 'arrived', arrived: 'inprogress', inprogress: 'completed' };
export const STATUS_LABEL = {
  pending: 'Finding a driver',
  accepted: 'Driver assigned',
  enroute: 'Driver on the way',
  arrived: 'Driver has arrived',
  inprogress: 'On trip',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export function newRideId() {
  const bytes = randomBytes(6);
  return 'BSU-' + Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export function newId(prefix) {
  return prefix + Date.now().toString(36) + randomBytes(3).toString('hex');
}

export function pushTimeline(ride, status, by) {
  ride.timeline = [...(ride.timeline || []), { status, at: Date.now(), by: by || null }].slice(-20);
  ride.status = status;
  ride.updatedAt = Date.now();
}

/** What a rider sees about their own ride. */
export function riderRide(r) {
  return {
    id: r.id, status: r.status, statusLabel: STATUS_LABEL[r.status], class: r.class, trip: r.trip,
    roblox: r.roblox, pickup: r.pickup, pickupPostal: r.pickupPostal, dropoff: r.dropoff, dropoffPostal: r.dropoffPostal,
    passengers: r.passengers, notes: r.notes, quote: r.quote, fare: r.fare ?? null,
    driver: r.driver ? { name: r.driver.name, avatar: r.driver.avatar, roblox: r.driver.roblox, vehicle: r.driver.vehicle, callsign: r.driver.callsign } : null,
    createdAt: r.createdAt, updatedAt: r.updatedAt, completedAt: r.completedAt || null, cancelledBy: r.cancelledBy || null,
    cancelReason: r.cancelReason || '', timeline: r.timeline || [], reviewed: Boolean(r.reviewId),
  };
}

/** Shape returned by the bot API. */
export function apiRide(r) {
  return {
    id: r.id, status: r.status, statusLabel: STATUS_LABEL[r.status], class: r.class, className: DEFAULT_PRICES[r.class]?.name,
    trip: r.trip, rider: { discordId: r.rider.id, username: r.rider.username, name: r.rider.name, roblox: r.roblox },
    driver: r.driver ? { discordId: r.driver.id, username: r.driver.username, name: r.driver.name, roblox: r.driver.roblox, vehicle: r.driver.vehicle, callsign: r.driver.callsign } : null,
    pickup: r.pickup, pickupPostal: r.pickupPostal || null, dropoff: r.dropoff, dropoffPostal: r.dropoffPostal || null,
    passengers: r.passengers, notes: r.notes || '', quote: r.quote, fare: r.fare ?? null,
    createdAt: iso(r.createdAt), acceptedAt: iso(r.acceptedAt), completedAt: iso(r.completedAt), cancelledAt: iso(r.cancelledAt),
    cancelledBy: r.cancelledBy || null, cancelReason: r.cancelReason || null,
    timeline: (r.timeline || []).map((t) => ({ status: t.status, at: iso(t.at), by: t.by })),
    reviewId: r.reviewId || null,
  };
}

const iso = (t) => (t ? new Date(t).toISOString() : null);

/* ---------------- Drivers ---------------- */

export const ONLINE_TTL = 3 * 60 * 60 * 1000;
export const isOnline = (d) => Boolean(d?.online && Date.now() - (d.lastSeen || 0) < ONLINE_TTL);
export const onlineDrivers = (drivers) => Object.values(drivers || {}).filter(isOnline);

export function publicDriver(d) {
  return { name: d.name, avatar: d.avatar, vehicle: d.vehicle || '', callsign: d.callsign || '', classes: d.classes || ['uber'], since: d.since || null, busy: Boolean(d.busy) };
}

export function apiDriver(d) {
  return {
    discordId: d.id, username: d.username, name: d.name, avatar: d.avatar, roblox: d.roblox || null,
    vehicle: d.vehicle || null, callsign: d.callsign || null, classes: d.classes || ['uber'],
    online: isOnline(d), busy: Boolean(d.busy), onlineSince: iso(d.online ? d.since : null), lastSeen: iso(d.lastSeen),
    totalRides: d.totalRides || 0, earned: d.earned || 0,
  };
}

/* ---------------- Reviews ---------------- */

export function publicReview(r) {
  return {
    id: r.id, rating: r.rating, text: r.text, class: r.class || null, featured: Boolean(r.featured),
    user: { name: r.user.name, avatar: r.user.avatar }, driverName: r.driverName || null, rideId: r.rideId || null, createdAt: r.createdAt,
  };
}

export function apiReview(r) {
  return {
    id: r.id, rating: r.rating, text: r.text, class: r.class || null, hidden: Boolean(r.hidden), featured: Boolean(r.featured),
    author: { discordId: r.user.id, username: r.user.username, name: r.user.name },
    driver: r.driverId ? { discordId: r.driverId, name: r.driverName } : null,
    rideId: r.rideId || null, createdAt: iso(r.createdAt),
  };
}

export function reviewSummary(reviews) {
  const list = reviews.filter((r) => !r.hidden);
  const dist = [0, 0, 0, 0, 0];
  let sum = 0;
  for (const r of list) { dist[r.rating - 1]++; sum += r.rating; }
  return { count: list.length, avg: list.length ? Math.round((sum / list.length) * 100) / 100 : 0, dist };
}

/* ---------------- Stats (small doc so page loads don't read every ride) ---------------- */

export function rideStats(rides) {
  let completed = 0, cancelled = 0, earned = 0;
  for (const r of rides) {
    if (r.status === 'completed') { completed++; earned += r.fare || 0; }
    else if (r.status === 'cancelled') cancelled++;
  }
  return { completed, cancelled, earned, total: rides.length };
}

export async function saveStats(partial) {
  try {
    await updateDoc('stats', {}, (s) => ({ ...s, ...partial, updatedAt: Date.now() }));
  } catch (err) {
    console.error('Could not save stats', err);
  }
}
