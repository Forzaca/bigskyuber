// Roblox accounts linked through Dock. When Dock is set up, the linked account is the only
// Roblox username a rider or driver can use: nobody types it in.
import { readDoc, updateDoc } from './store.js';
import { dockConfigured, robloxIdFor, robloxProfile } from './dock.js';
import { logActivity, actorOf } from './activity.js';

/** Linking is required whenever Dock is configured. */
export const robloxLinkRequired = () => dockConfigured();

/** Saves a linked Roblox account on the user (and fills the driver profile's Roblox name). */
export async function saveLink(user, robloxId) {
  const profile = (await robloxProfile(robloxId)) || { id: robloxId, name: null, displayName: null, avatar: null };
  const roblox = { ...profile, linkedAt: Date.now(), source: 'dock' };
  await updateDoc('users', {}, (users) => {
    const cur = users[user.id] || { id: user.id, username: user.username, name: user.name, avatar: user.avatar, firstSeen: Date.now(), logins: 0 };
    users[user.id] = { ...cur, roblox, dockSession: null };
    return users;
  });
  if (profile.name) {
    await updateDoc('drivers', {}, (d) => { if (d[user.id]) { d[user.id].roblox = profile.name; d[user.id].headshot = profile.avatar || d[user.id].headshot || null; } return d; }).catch(() => {});
  }
  await logActivity({ kind: 'link', title: 'Roblox account linked', body: profile.name ? `${profile.name} (${robloxId})` : String(robloxId), actor: actorOf(user), ref: String(robloxId) });
  return roblox;
}

// Background checks (page loads) don't ask Dock again for someone who isn't linked for a few
// seconds (Dock allows ~1 request/second). Actions the user takes always ask.
const misses = new Map();

/**
 * The user's linked Roblox account. Uses the stored link, otherwise looks the user up in Dock
 * (so verifying with the Dock bot in Discord is enough) and stores it. null when not linked.
 */
export async function linkedRoblox(user, { lookup = true, background = false } = {}) {
  const stored = (await readDoc('users', {}))[user.id]?.roblox;
  if (stored?.name) return stored;
  if (!lookup || !dockConfigured()) return null;
  const miss = misses.get(user.id);
  if (background && miss && Date.now() - miss < 10_000) return null;
  const robloxId = await robloxIdFor(user.id);
  if (!robloxId) {
    misses.set(user.id, Date.now());
    if (misses.size > 500) misses.delete(misses.keys().next().value);
    return null;
  }
  misses.delete(user.id);
  const saved = await saveLink(user, robloxId);
  return saved?.name ? saved : null;
}

export const publicLink = (r) => (r ? { id: r.id, name: r.name, displayName: r.displayName, avatar: r.avatar, linkedAt: r.linkedAt } : null);
