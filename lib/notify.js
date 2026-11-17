// Site notifications (the bell in the top bar).
// A notification goes to one Discord user ID, or to a group:
//   'all' · 'drivers' (optionally only drivers of one class) · 'riders' · 'admins'
// "Unread" is everything newer than the time the user last opened the bell.
import { readDoc, updateDoc } from './store.js';
import { newId } from './data.js';

export const MAX_NOTIFICATIONS = 3000;
const GROUPS = new Set(['all', 'drivers', 'riders', 'admins']);

/** Adds one or more notifications. Never throws: a failed notification never breaks a ride. */
export async function notify(items) {
  const list = (Array.isArray(items) ? items : [items]).filter((n) => n && n.to && n.title);
  if (!list.length) return;
  try {
    await updateDoc('notifications', [], (all) => {
      for (const n of list) {
        all.unshift({
          id: newId('nt_'), to: String(n.to), cls: n.cls || null, exclude: n.exclude || null,
          kind: n.kind || 'info', title: String(n.title).slice(0, 120), body: String(n.body || '').slice(0, 400),
          href: n.href || null, from: n.from || null, at: Date.now(),
        });
      }
      if (all.length > MAX_NOTIFICATIONS) all.length = MAX_NOTIFICATIONS;
      return all;
    });
  } catch (err) {
    console.error('notify failed', err?.message);
  }
}

export const isGroup = (to) => GROUPS.has(to);

/** Does notification `n` reach this user? */
export function reaches(n, { id, access, classes }) {
  if (n.exclude && n.exclude === id) return false;
  if (n.to === id || n.to === 'all' || n.to === 'riders') return true;
  if (n.to === 'admins') return Boolean(access?.admin);
  if (n.to === 'drivers') return Boolean(access?.worker || access?.admin) && (!n.cls || !classes || classes.includes(n.cls));
  return false;
}

export function publicNotification(n) {
  return { id: n.id, kind: n.kind, title: n.title, body: n.body, href: n.href, at: n.at, group: isGroup(n.to) ? n.to : null };
}

/** The user's notifications, newest first, plus the unread count. */
export async function inbox(user, access, { limit = 30 } = {}) {
  const [all, users, drivers] = await Promise.all([readDoc('notifications', []), readDoc('users', {}), readDoc('drivers', {})]);
  const classes = drivers[user.id]?.classes || null;
  const seen = users[user.id]?.notifSeen || 0;
  const mine = all.filter((n) => reaches(n, { id: user.id, access, classes }));
  return { unread: mine.filter((n) => n.at > seen).length, seenAt: seen, items: mine.slice(0, limit).map(publicNotification) };
}
