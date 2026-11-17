// Website activity log: what happened on the site, for staff and the Discord bot
// (GET /api/v1/activity and /api/v1/feed). Ride and review events come from their
// own docs; this covers everything else: sign-ins, shifts, Roblox links and staff actions.
import { readDoc, updateDoc } from './store.js';
import { newId } from './data.js';

export const MAX_ACTIVITY = 1500;

/**
 * Logs one or more events. Never throws: a failed log never breaks the action.
 * Each item: { kind, title, body?, actor?: {id, name}, target?: {id, name}, ref? }
 */
export async function logActivity(items) {
  const list = (Array.isArray(items) ? items : [items]).filter((a) => a && a.kind && a.title);
  if (!list.length) return;
  try {
    await updateDoc('activity', [], (all) => {
      for (const a of list) {
        all.unshift({
          id: newId('ac_'), kind: String(a.kind), title: String(a.title).slice(0, 160), body: String(a.body || '').slice(0, 600),
          actor: a.actor ? { id: a.actor.id, name: a.actor.name } : null,
          target: a.target ? { id: a.target.id || null, name: a.target.name || null } : null,
          ref: a.ref || null, at: Date.now(),
        });
      }
      if (all.length > MAX_ACTIVITY) all.length = MAX_ACTIVITY;
      return all;
    });
  } catch (err) {
    console.error('logActivity failed', err?.message);
  }
}

export const actorOf = (user) => (user ? { id: user.id, name: user.name } : null);

export function apiActivity(a) {
  return { id: a.id, kind: a.kind, title: a.title, body: a.body, actor: a.actor, target: a.target, ref: a.ref, at: new Date(a.at).toISOString() };
}

export const readActivity = () => readDoc('activity', []);
