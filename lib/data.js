import { randomBytes } from 'node:crypto';
import { readDoc, updateDoc } from './store.js';

/* ---------------- Classes & pricing (the Big Sky Economy) ---------------- */

export const CLASSES = ['uber', 'premium', 'black', 'eats'];
export const RIDE_CLASSES = ['uber', 'premium', 'black'];

/**
 * Every class has a fixed fare per trip length, plus the range a driver may
 * charge in the end (min/max). All of it is editable in Admin → Settings.
 */
export const TRIP_KEYS = ['local', 'town', 'county'];

export const DEFAULT_PRICES = {
  uber: { name: 'Uber', fares: { local: 10, town: 25, county: 50 }, min: 10, max: 50, enabled: true, tagline: 'Everyday rides across Big Sky.' },
  premium: { name: 'Uber Premium', fares: { local: 15, town: 35, county: 75 }, min: 15, max: 75, enabled: true, tagline: 'Newer cars and top-rated drivers.' },
  black: { name: 'Uber Black', fares: { local: 25, town: 50, county: 100 }, min: 25, max: 100, enabled: true, tagline: 'Executive black cars. No compromises.' },
  eats: { name: 'Uber Eats', fares: { local: 5, town: 15, county: 30 }, min: 5, max: 30, enabled: true, tagline: 'Food from any Big Sky spot, brought to you.' },
};

export const TRIPS = {
  local: { label: 'Local', hint: 'Same area, a few blocks' },
  town: { label: 'Cross-town', hint: 'Across the city' },
  county: { label: 'County-wide', hint: 'Town to town' },
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
  trips: TRIPS,
};

export async function getSettings() {
  const s = await readDoc('settings', {});
  const prices = {};
  for (const c of CLASSES) {
    const base = DEFAULT_PRICES[c];
    const saved = s.prices?.[c] || {};
    // Saved before per-length fares existed: keep the switch and tagline, take the new fares.
    prices[c] = saved.fares
      ? { ...base, ...saved, fares: { ...base.fares, ...saved.fares } }
      : { ...base, enabled: saved.enabled ?? base.enabled, tagline: saved.tagline || base.tagline };
  }
  const trips = {};
  for (const k of TRIP_KEYS) trips[k] = { ...TRIPS[k], ...(s.trips?.[k] || {}) };
  return { ...DEFAULT_SETTINGS, ...s, prices, trips };
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
    trips: s.trips,
  };
}

/** The price for this class and trip length, and the range the driver may charge. */
export function quote(settings, cls, trip) {
  const p = settings.prices[cls];
  const estimate = p.fares?.[trip] ?? p.fares?.town ?? p.min;
  return { min: p.min, max: p.max, estimate };
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
    passengers: r.passengers, notes: r.notes, order: r.order || '', quote: r.quote, fare: r.fare ?? null,
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
    passengers: r.passengers, notes: r.notes || '', order: r.order || null, kind: r.class === 'eats' ? 'delivery' : 'ride', quote: r.quote, fare: r.fare ?? null,
    createdAt: iso(r.createdAt), acceptedAt: iso(r.acceptedAt), completedAt: iso(r.completedAt), cancelledAt: iso(r.cancelledAt),
    updatedAt: iso(r.updatedAt || r.createdAt),
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

/* ---------------- Shifts (driver clock on / clock off) ---------------- */

export const MAX_SHIFTS = 4000;

/** Starts a shift unless the driver already has one open. */
export async function openShift(driver) {
  try {
    await updateDoc('shifts', [], (list) => {
      if (list.some((s) => s.driverId === driver.id && !s.end)) return list;
      list.unshift({ id: newId('sh_'), driverId: driver.id, name: driver.name, username: driver.username, avatar: driver.avatar, start: Date.now(), end: null });
      if (list.length > MAX_SHIFTS) list.length = MAX_SHIFTS;
      return list;
    });
  } catch (err) { console.error('openShift failed', err); }
}

/** Ends any open shift for the driver (at `at`, defaulting to now). */
export async function closeShift(driverId, at = Date.now()) {
  try {
    await updateDoc('shifts', [], (list) => {
      for (const s of list) if (s.driverId === driverId && !s.end) s.end = Math.max(s.start, at);
      return list;
    });
  } catch (err) { console.error('closeShift failed', err); }
}

/** Shifts with open ones resolved: still on duty, or timed out at the driver's last activity. */
export function resolveShifts(shifts, drivers) {
  return shifts.map((s) => {
    if (s.end) return { ...s, active: false };
    const d = drivers[s.driverId];
    if (d && isOnline(d)) return { ...s, active: true };
    return { ...s, active: false, end: Math.max(s.start, d?.lastSeen || s.start), timedOut: true };
  });
}

export function apiShift(s) {
  return {
    id: s.id, driver: { discordId: s.driverId, name: s.name, username: s.username },
    start: iso(s.start), end: s.active ? null : iso(s.end), active: Boolean(s.active),
    minutes: Math.round(((s.active ? Date.now() : s.end) - s.start) / 60000), timedOut: Boolean(s.timedOut),
  };
}
