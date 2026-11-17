// Driver pay: a share of the fares they collected, plus an optional hourly rate
// for time on shift. Pay periods run Monday 00:00 → Monday 00:00 (UTC).
import { readDoc } from './store.js';
import { resolveShifts } from './data.js';

export const WEEK = 7 * 864e5;
export const MAX_PAYSTUBS = 3000;
export const DEFAULT_PAY = { rate: 70, hourly: 0 };

/** Start of the UTC week (Monday) that contains `t`, shifted by `offset` weeks. */
export function weekStart(t = Date.now(), offset = 0) {
  const d = new Date(t);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day) + offset * WEEK;
}

export function payConfig(settings) {
  const p = { ...DEFAULT_PAY, ...(settings.pay || {}) };
  return { rate: Math.min(100, Math.max(0, Number(p.rate) || 0)), hourly: Math.max(0, Number(p.hourly) || 0) };
}

/**
 * What a driver earned between `start` and `end`.
 * rides: the rides doc; shifts: already resolved (see resolveShifts).
 */
export function computePay({ driverId, start, end, rides, shifts, settings }) {
  const { rate, hourly } = payConfig(settings);
  const trips = rides.filter((r) => r.status === 'completed' && r.driver?.id === driverId && r.completedAt >= start && r.completedAt < end);
  const gross = trips.reduce((s, r) => s + (r.fare || 0), 0);
  const ms = shifts
    .filter((s) => s.driverId === driverId)
    .reduce((m, s) => {
      const a = Math.max(s.start, start);
      const b = Math.min(s.active ? Date.now() : s.end, end);
      return b > a ? m + (b - a) : m;
    }, 0);
  const hours = Math.round((ms / 36e5) * 100) / 100;
  const commission = Math.round((gross * rate) / 100);
  const hourlyPay = Math.round(hours * hourly);
  const byClass = {};
  for (const r of trips) {
    byClass[r.class] ||= { trips: 0, gross: 0 };
    byClass[r.class].trips++;
    byClass[r.class].gross += r.fare || 0;
  }
  return {
    periodStart: start, periodEnd: end,
    trips: trips.length, gross, rate, commission, hours, hourly, hourlyPay,
    byClass, rideIds: trips.slice(0, 200).map((r) => r.id),
    total: commission + hourlyPay,
  };
}

/** Loads what computePay needs. */
export async function payInputs() {
  const [rides, shiftDoc, drivers] = await Promise.all([readDoc('rides', []), readDoc('shifts', []), readDoc('drivers', {})]);
  return { rides, shifts: resolveShifts(shiftDoc, drivers), drivers };
}

/** Driver-safe view of a paystub. */
export function publicStub(s) {
  return {
    id: s.id, number: s.number, status: s.status,
    driver: { id: s.driverId, name: s.name, username: s.username, roblox: s.roblox || null, callsign: s.callsign || null },
    periodStart: s.periodStart, periodEnd: s.periodEnd,
    trips: s.trips, gross: s.gross, rate: s.rate, commission: s.commission,
    hours: s.hours, hourly: s.hourly, hourlyPay: s.hourlyPay,
    bonus: s.bonus || 0, deductions: s.deductions || 0, net: s.net, note: s.note || '',
    byClass: s.byClass || {}, issuedAt: s.issuedAt, issuedBy: s.issuedBy?.name || null, voidedAt: s.voidedAt || null,
  };
}
