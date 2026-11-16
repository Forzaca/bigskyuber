import { DEFAULT_PRICES, STATUS_LABEL } from './data.js';

const COLORS = { requested: 0xffffff, accepted: 0x9a9aa0, completed: 0x32d74b, cancelled: 0xff5148 };
const TITLES = {
  requested: 'New ride request',
  accepted: 'Ride accepted',
  completed: 'Ride completed',
  cancelled: 'Ride cancelled',
};

/** Posts a ride update to DISCORD_WEBHOOK_URL. Never throws, never takes longer than ~2.5s. */
export async function notify(event, ride) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url || !/^https:\/\/(canary\.|ptb\.)?discord(app)?\.com\/api\/webhooks\//.test(url)) return;
  const fields = [
    { name: 'Class', value: DEFAULT_PRICES[ride.class]?.name || ride.class, inline: true },
    { name: 'Rider', value: `<@${ride.rider.id}> · \`${ride.roblox}\``, inline: true },
    { name: 'Status', value: STATUS_LABEL[ride.status] || ride.status, inline: true },
    { name: 'Pickup', value: `${ride.pickup}${ride.pickupPostal ? ` (Postal ${ride.pickupPostal})` : ''}`.slice(0, 1000) },
    { name: 'Drop-off', value: `${ride.dropoff}${ride.dropoffPostal ? ` (Postal ${ride.dropoffPostal})` : ''}`.slice(0, 1000) },
  ];
  if (ride.driver) fields.push({ name: 'Driver', value: `<@${ride.driver.id}> · \`${ride.driver.roblox || '?'}\`${ride.driver.vehicle ? ` · ${ride.driver.vehicle}` : ''}`, inline: false });
  if (event === 'completed' && ride.fare != null) fields.push({ name: 'Fare', value: `$${ride.fare.toLocaleString('en-US')}`, inline: true });
  else fields.push({ name: 'Estimate', value: `$${ride.quote.estimate.toLocaleString('en-US')} ($${ride.quote.min}–$${ride.quote.max})`, inline: true });
  if (event === 'cancelled' && ride.cancelReason) fields.push({ name: 'Reason', value: ride.cancelReason.slice(0, 500) });

  const body = {
    username: 'Big Sky Uber',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `${TITLES[event] || 'Ride update'} · ${ride.id}`,
      color: COLORS[event] ?? 0xffffff,
      fields,
      footer: { text: 'Big Sky Uber · ER:LC roleplay' },
      timestamp: new Date().toISOString(),
    }],
  };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2500);
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
  } catch (err) {
    console.error('Webhook failed', err?.message);
  } finally {
    clearTimeout(t);
  }
}
