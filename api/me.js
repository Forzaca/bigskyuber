// The signed-in user's own things: dashboard, pay (drivers), notifications and Roblox linking.
import { wrap, ok, fail, query, sameOrigin } from '../lib/http.js';
import { requireUser, accessFor, publicUser } from '../lib/session.js';
import { readDoc, updateDoc } from '../lib/store.js';
import { getSettings, riderRide, ACTIVE, isOnline } from '../lib/data.js';
import { inbox } from '../lib/notify.js';
import { computePay, payInputs, payConfig, weekStart, WEEK, publicStub } from '../lib/pay.js';
import { dockConfigured, dockVerifyEnabled, robloxIdFor, startVerification, verificationStatus, robloxProfile } from '../lib/dock.js';
import { logActivity, actorOf } from '../lib/activity.js';
import { saveLink, linkedRoblox, publicLink } from '../lib/links.js';

const httpError = (status, message) => Object.assign(new Error(message), { status });
function postOnly(req) {
  if (req.method !== 'POST') throw httpError(405, 'Use POST.');
  if (!sameOrigin(req)) throw httpError(403, 'Bad origin.');
}

async function me(req) {
  const user = await requireUser(req);
  return { user, access: accessFor(user) };
}

/** Pay for one driver: this week's estimate and their issued paystubs. */
async function payFor(user, settings) {
  const { rides, shifts } = await payInputs();
  const start = weekStart();
  const estimate = computePay({ driverId: user.id, start, end: start + WEEK, rides, shifts, settings });
  const last = computePay({ driverId: user.id, start: start - WEEK, end: start, rides, shifts, settings });
  const stubs = (await readDoc('paystubs', [])).filter((s) => s.driverId === user.id && s.status !== 'void');
  return { config: payConfig(settings), estimate, lastWeek: last, paystubs: stubs.slice(0, 52).map(publicStub) };
}

/* GET ?op=dashboard */
async function dashboard(req, res) {
  const { user, access } = await me(req);
  const [settings, rides, users, drivers] = await Promise.all([getSettings(), readDoc('rides', []), readDoc('users', {}), readDoc('drivers', {})]);
  const mine = rides.filter((r) => r.rider.id === user.id);
  const done = mine.filter((r) => r.status === 'completed');
  const u = users[user.id] || {};
  const isDriver = access.worker || access.admin;
  const d = drivers[user.id];
  ok(res, {
    ok: true,
    viewer: publicUser(user),
    access,
    member: { firstSeen: u.firstSeen || null, logins: u.logins || 0 },
    roblox: u.roblox || null,
    linkPending: u.dockSession && u.dockSession.expires > Date.now() ? { verifyUrl: u.dockSession.verifyUrl } : null,
    dock: { configured: dockConfigured(), verify: dockVerifyEnabled() },
    requireRobloxLink: dockConfigured(),
    rider: {
      rides: done.filter((r) => r.class !== 'eats').length,
      orders: done.filter((r) => r.class === 'eats').length,
      spent: done.reduce((s, r) => s + (r.fare || 0), 0),
      cancelled: mine.filter((r) => r.status === 'cancelled').length,
      active: mine.find((r) => ACTIVE.has(r.status)) ? riderRide(mine.find((r) => ACTIVE.has(r.status))) : null,
      recent: mine.slice(0, 12).map(riderRide),
    },
    driver: isDriver && d ? { roblox: d.roblox || '', callsign: d.callsign || '', vehicle: d.vehicle || '', classes: d.classes || [], online: isOnline(d), totalRides: d.totalRides || 0, earned: d.earned || 0 } : null,
    pay: isDriver ? await payFor(user, settings) : null,
    notifications: await inbox(user, access, { limit: 20 }),
  });
}

/* GET ?op=pay  (driver panel Pay tab) */
async function pay(req, res) {
  const { user, access } = await me(req);
  if (!access.worker && !access.admin) throw httpError(403, 'Only drivers have pay.');
  ok(res, { ok: true, ...(await payFor(user, await getSettings())) });
}

/* GET ?op=notifications */
async function notifications(req, res) {
  const { user, access } = await me(req);
  ok(res, { ok: true, ...(await inbox(user, access, { limit: 30 })) });
}

/* POST ?op=seen  mark everything read */
async function seen(req, res) {
  postOnly(req);
  const { user } = await me(req);
  await updateDoc('users', {}, (users) => {
    users[user.id] = { ...(users[user.id] || { id: user.id, username: user.username, name: user.name, avatar: user.avatar, firstSeen: Date.now(), logins: 0 }), notifSeen: Date.now() };
    return users;
  });
  ok(res, { ok: true });
}

/* POST ?op=link  look the user up in Dock; if they aren't linked, start a Dock verification */
async function link(req, res) {
  postOnly(req);
  const { user } = await me(req);
  if (!dockConfigured()) throw httpError(503, 'Roblox linking isn’t set up yet (DOCK_API_KEY).');
  const robloxId = await robloxIdFor(user.id);
  if (robloxId) return ok(res, { ok: true, linked: true, roblox: await saveLink(user, robloxId) });
  if (!dockVerifyEnabled()) {
    return ok(res, { ok: true, linked: false, message: 'Your Discord isn’t linked to a Roblox account in Dock yet. Verify with the Dock bot in our Discord, then try again.' });
  }
  const session = await startVerification(user.id);
  await updateDoc('users', {}, (users) => {
    const cur = users[user.id] || { id: user.id, username: user.username, name: user.name, avatar: user.avatar, firstSeen: Date.now(), logins: 0 };
    users[user.id] = { ...cur, dockSession: { id: session.id, verifyUrl: session.verifyUrl, expires: Date.parse(session.expiresAt) || Date.now() + 15 * 60000 } };
    return users;
  });
  ok(res, { ok: true, linked: false, verifyUrl: session.verifyUrl });
}

/* POST ?op=linkCheck  after the user finished Dock's verification page */
async function linkCheck(req, res) {
  postOnly(req);
  const { user } = await me(req);
  const users = await readDoc('users', {});
  const s = users[user.id]?.dockSession;
  if (!s) return ok(res, { ok: true, linked: Boolean(users[user.id]?.roblox), roblox: users[user.id]?.roblox || null });
  const st = await verificationStatus(s.id);
  if (st.status === 'completed' && st.robloxId) return ok(res, { ok: true, linked: true, roblox: await saveLink(user, st.robloxId) });
  if (st.status === 'expired' || st.status === 'cancelled') {
    await updateDoc('users', {}, (u) => { if (u[user.id]) u[user.id].dockSession = null; return u; });
    return ok(res, { ok: true, linked: false, status: st.status });
  }
  ok(res, { ok: true, linked: false, status: 'pending', verifyUrl: s.verifyUrl });
}

/* POST ?op=unlink */
async function unlink(req, res) {
  postOnly(req);
  const { user } = await me(req);
  await updateDoc('users', {}, (u) => { if (u[user.id]) { u[user.id].roblox = null; u[user.id].dockSession = null; } return u; });
  await logActivity({ kind: 'unlink', title: 'Roblox account unlinked', actor: actorOf(user) });
  ok(res, { ok: true });
}

/* GET ?op=roblox  the linked Roblox account; looks the user up in Dock if it isn't stored yet */
async function roblox(req, res) {
  const { user } = await me(req);
  if (!dockConfigured()) return ok(res, { ok: true, dock: false, linked: false, roblox: null });
  const r = await linkedRoblox(user, { background: true });
  ok(res, { ok: true, dock: true, linked: Boolean(r), roblox: publicLink(r) });
}

const ops = { dashboard, pay, notifications, seen, link, linkCheck, unlink, roblox };

export default wrap(async (req, res) => {
  const fn = ops[query(req).op];
  if (!fn) return fail(res, 404, 'Unknown operation.');
  await fn(req, res);
});
