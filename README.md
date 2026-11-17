# Big Sky Uber

The ride service website for the Big Sky ER:LC roleplay server. Black-and-white theme with live map tracing and phone mockups. Riders sign in with Discord, and drivers and staff each get their own panel.

> Roleplay only. Not affiliated with Uber Technologies Inc., Roblox Corporation or Police Roleplay Community. All prices are in in-game currency.

## What's inside

| Page | Path | Who |
| --- | --- | --- |
| Home | `/` | Everyone |
| Request a ride | `/ride` | Signed-in Discord users |
| Pricing | `/pricing` | Everyone |
| Reviews | `/reviews` | Everyone (signed in to post) |
| About / Drive / FAQ | `/about` | Everyone |
| Rider guidelines, Terms, Privacy | `/guidelines`, `/terms`, `/privacy` | Everyone |
| 404 | any unknown path | Everyone |
| **Driver panel** | `/workers` | Discord role in `DISCORD_WORKER_ROLE_ID` (or admin) |
| **Admin panel** | `/admin` | Discord role in `DISCORD_ADMIN_ROLE_ID` |

The panel HTML is served by `api/panel.js`, so nobody without the role ever gets the page. They see a sign-in or "no access" screen instead. All panel data APIs check the role too.

**Stack:** static HTML/CSS/JS in `public/`, Vercel serverless functions in `api/`, JSON documents in Vercel Blob (`lib/store.js`). There's no build step and the only dependency is `@vercel/blob`.

```
api/
  auth.js     Discord OAuth (login, callback, logout, me)
  site.js     public + rider endpoints (bootstrap, request ride, my rides, reviews…)
  worker.js   driver panel endpoints (go online, accept, advance status…)
  admin.js    admin endpoints (rides, drivers, reviews, bans, settings)
  panel.js    serves /admin and /workers only to people with the role
  v1.js       read-only Discord bot API (UBERBIGSKY key)
lib/          http helpers, signed sessions + role checks, blob store, pricing/ride logic, ER:LC API
panels/       admin.html, workers.html (not publicly served)
public/       every public page, css/, js/, assets/
```

## Deploy on Vercel

1. **Push this folder to GitHub** and import it in Vercel. Framework preset: *Other*. Leave the build settings empty.
2. **Create a Blob store:** Vercel → Storage → Create → Blob → connect it to the project. This adds `BLOB_READ_WRITE_TOKEN` for you. A **private** store is recommended.
3. **Create a Discord application** at <https://discord.com/developers/applications>:
   - OAuth2 → copy the **Client ID** and **Client Secret**.
   - OAuth2 → Redirects → add `https://YOUR-DOMAIN/api/auth/callback` (add `http://localhost:3000/api/auth/callback` too for local dev).
4. **Get your IDs** (Discord → Settings → Advanced → Developer Mode, then right-click → Copy ID):
   - the server ID → `DISCORD_GUILD_ID`
   - the admin role ID → `DISCORD_ADMIN_ROLE_ID`
   - the driver role ID → `DISCORD_WORKER_ROLE_ID`
   - your own user ID → `ADMIN_DISCORD_IDS` (so you can never lock yourself out)
5. **Add the environment variables** from [`.env.example`](.env.example) in Vercel → Settings → Environment Variables, then **redeploy**.
6. Open `/admin` → **Settings** to set the Discord invite, ER:LC server code, prices and announcement.

### Local dev

```bash
npm i -g vercel
npm install
cp .env.example .env.local   # fill in real values
vercel dev
```

## ER:LC integration

- **Map and locations:** the map uses real ER:LC streets, the river, its bridges and landmark postal codes from the [ER:LC wiki](https://emergency-response-liberty-county.fandom.com/wiki/Roads). The data lives at the top of `public/js/map.js` (`LOCATIONS`, `STREETS`, `AREAS`). Edit it there if a game update moves something. The ride form suggests these landmarks and fills in the postal automatically.
- **Live server (optional):** set `ERLC_API_KEY` (in-game: your private server → Settings → ER:LC API). The site then shows players online and the join code, checks that a rider's Roblox username is actually in the server before accepting a request (toggle in Admin → Settings), shows In server / Not in server badges to drivers, and serves `GET /api/v1/server` to your bot. Results are cached for 20–30 seconds to stay inside PRC's rate limits. If the server is offline, empty or PRC stops answering, the in-game check is skipped (riders are never blocked by it), the admin panel shows the server as **Offline**, and `/api/v1/server` returns `{ "online": false, "reason": "offline" }`.

## How roles work

- Sign-in asks Discord for `identify` and `guilds.members.read`. That lets the site read **your own** roles in `DISCORD_GUILD_ID`. It can't see your email or messages.
- Roles are saved in the signed session cookie when you sign in. If you change a role in Discord, the user needs to sign out and back in…
- …**unless** you set `DISCORD_BOT_TOKEN` (a bot that is in your server). Then roles are re-checked every 10 minutes, so removing someone's role locks them out almost right away.
- Several roles are fine: `DISCORD_ADMIN_ROLE_ID=111,222`.
- Admins can also open `/workers`.

## Pricing (the Big Sky Economy)

| Class | Local | Cross-town | County-wide |
| --- | --- | --- | --- |
| Uber | $10 | $25 | $50 |
| Uber Premium | $15 | $35 | $75 |
| Uber Black | $25 | $50 | $100 |
| Uber Eats (delivery fee) | $5 | $15 | $30 |

Riders see the exact price for their class and trip length before they request. Drivers enter the final fare when they finish, and it has to fall inside the class's driver range (by default the cheapest to the dearest trip; rides keep the range they were quoted). Everything is editable in **Admin → Settings**: class names, taglines, every price (any amount, $0 and up), the driver range, the trip length labels, and pausing a class or all of dispatch.

### Uber Eats

`/eats` lets signed-in players order food from any Big Sky spot (Three Guys Burgers & Fries, Liberty Cafe, Spring Bakery, any Gas-N-Go…). Orders go through the same dispatch as rides: they show in the driver queue with the order text, and drivers opt in by ticking **Uber Eats** in their profile. The rider pays for the food and the delivery fee in-game. In the bot API, orders are rides with `class: "eats"`, `kind: "delivery"` and an `order` field (`GET /api/v1/rides?class=eats`).

## Dashboard, notifications and pay

**Dashboard (`/dashboard`).** Every signed-in user gets one, showing:
- Their rides, Uber Eats orders and total spent.
- Their active ride.
- Their Roblox link and their notifications.
- For drivers, their pay.

**Notifications.** The bell in the top bar shows unread notifications and checks for new ones about every 25 seconds. Anyone can turn on desktop alerts from it. Notifications are deleted 24 hours after they're sent, both from the bell and from Blob storage. Paystubs are also DM'd to the driver by the Discord bot. The site sends these on its own:

| Who | When |
| --- | --- |
| Riders and customers | Ride or order accepted, driver on the way, arrived or picked up, trip complete (links to rating the driver), released back to the queue, cancelled |
| Drivers | New request in a class they drive, the rider cancelled, staff assigned them a ride, a new review, a paystub issued or voided |

Staff can send their own from **Admin → Notify**. Send to everyone, drivers, riders, or one Discord user, with an optional link.

**Pay.** Drivers earn a share of the fares they collect (default **70%**). You can also add an hourly rate for time on shift, which is off by default. Both are set in **Admin → Settings → Driver pay**. Pay periods run Monday to Sunday (UTC).

- **Estimated paystub:** drivers see this week's estimate on their dashboard and in the driver panel's **Pay** tab. It updates with every trip.
- **Admin → Payroll:** pick last week, this week or custom dates to see what every driver earned.
  - **Issue** opens a paystub with optional bonus, deductions and a note. The driver gets a notification, which you can turn off.
  - **Issue all** issues every remaining driver at once, with no bonus or deductions.
  - Paystubs can be voided and reissued, and exported to CSV.
  - Each driver gets at most one paystub per period.
- **Admin → Money:**
  - Tiles: fares collected, driver share, what the company keeps, paid out, average fare and Uber Eats fees.
  - Charts: fares per day, payouts per week, fares by class and average fare by class.
  - Table: earnings by driver.

**Roblox linking with [Dock](https://docksys.xyz).** Set `DOCK_API_KEY` and users can link their Roblox account from the dashboard.

- **How it links:**
  1. The site asks Dock which Roblox account belongs to the user's Discord ID (`GET /v2/discord`).
  2. It saves that account and fills in the Roblox name on ride forms and the driver profile.
  3. If the user isn't linked in Dock yet and `DOCK_PID` is set, they're sent to Dock's hosted verification page instead. The dashboard checks until it completes.
- **Requiring it:** turn on **Require a linked Roblox account** in Settings. Riders must then link first, and must request as that account.
- **Rate limits:** Dock allows about 1 request per second, so the site only calls it when someone presses **Link with Dock** or **Refresh**.

## Ride lifecycle

```
pending → accepted → enroute → arrived → inprogress → completed
   └───────────── cancelled (by rider, driver or admin) ─────────────┘
```

Every status change goes into the ride's `timeline`.

## Discord bot API

Read-only. Authenticate with the `UBERBIGSKY` value:

```
Authorization: Bearer <UBERBIGSKY>
# or
X-API-Key: <UBERBIGSKY>
```

| Endpoint | Description |
| --- | --- |
| `GET /api/v1/ping` | Checks the key works |
| `GET /api/v1/stats` | Ride, driver and review totals |
| `GET /api/v1/rides` | Ride logs. Filters: `status` (comma list), `class`, `rider` (Discord ID), `driver` (Discord ID), `roblox`, `since` (created after, ISO date or unix time), `updatedSince` (changed after: new, accepted, completed, cancelled…, oldest first), `limit` (max 200) |
| `GET /api/v1/rides/active` | Every ride that isn't finished |
| `GET /api/v1/rides/:id` | One ride, e.g. `BSU-7KQ2MX` |
| `GET /api/v1/reviews` | Reviews. Filters: `rating`, `minRating`, `driver`, `class`, `limit`, `includeHidden=true`, `since` (posted after) |
| `GET /api/v1/reviews/summary` | Average plus a 1–5 star breakdown |
| `GET /api/v1/reviews/:id` | One review |
| `GET /api/v1/drivers/online` | Drivers on duty right now (`count`, `available`, `drivers[]`) |
| `GET /api/v1/drivers` | All driver profiles |
| `GET /api/v1/drivers/:id` | Look up by Discord ID or Roblox username |
| `GET /api/v1/pricing` | Current class prices |
| `GET /api/v1/shifts` | Driver shift log: clock on/off times and minutes. Filters: `driver`, `active=true`, `since`, `limit` |
| `GET /api/v1/server` | ER:LC server status and players (needs `ERLC_API_KEY`) |
| `GET /api/v1/paystubs` | Issued paystubs, newest first. Filters: `driver` (Discord ID), `limit`, `includeVoid=true`, `since` (issued or voided after). `GET /api/v1/paystubs/:id` takes an ID or paystub number |
| `GET /api/v1/links` | Every Roblox account linked on the site. `GET /api/v1/links/:id` looks one up by Discord ID, Roblox ID or Roblox name |
| `GET /api/v1/activity` | Website activity log: sign-ins, clock on/off, Roblox links and staff actions (settings, ride edits, bans, paystubs, notifications). Filters: `since` (oldest first), `kind` (e.g. `paystub`, `shift.on`), `limit` |
| `GET /api/v1/feed` | Everything that changed since `since` in one call, oldest first: `rides`, `reviews`, `paystubs`, `shifts`, `activity`, plus the current `active` rides and `online` drivers. Used by the Discord bot's poll loop; send `since` a little before the last `now` and de-duplicate by ID |

Example (discord.js):

```js
const res = await fetch('https://YOUR-DOMAIN/api/v1/drivers/online', {
  headers: { Authorization: `Bearer ${process.env.UBERBIGSKY}` },
});
const { count, drivers } = await res.json();
await interaction.reply(`🚗 ${count} Big Sky drivers online: ${drivers.map((d) => d.roblox).join(', ')}`);
```

Ride alerts in Discord: poll `updatedSince` and post what changed.

```js
let last = Date.now();
setInterval(async () => {
  const res = await fetch(`https://YOUR-DOMAIN/api/v1/rides?updatedSince=${last}&limit=200`, {
    headers: { Authorization: `Bearer ${process.env.UBERBIGSKY}` },
  });
  const { rides } = await res.json();
  for (const ride of rides) {
    last = Math.max(last, Date.parse(ride.updatedAt));
    await channel.send(`**${ride.id}** · ${ride.className} · ${ride.statusLabel} · ${ride.pickup} → ${ride.dropoff}`);
  }
}, 15000);
```

Example ride object:

```json
{
  "id": "BSU-7KQ2MX",
  "status": "completed",
  "statusLabel": "Completed",
  "class": "black",
  "className": "Uber Black",
  "trip": "county",
  "rider": { "discordId": "123…", "username": "rider", "name": "Rider", "roblox": "BigSkyRider_22" },
  "driver": { "discordId": "456…", "username": "driver", "name": "Driver", "roblox": "Marcus_V", "vehicle": "Black Sedan", "callsign": "BSU-204" },
  "pickup": "Gas-N-Go (River City)", "pickupPostal": "200",
  "dropoff": "River City Hospital", "dropoffPostal": "321",
  "passengers": 2, "notes": "",
  "quote": { "min": 500, "max": 1000, "estimate": 1000 },
  "fare": 900,
  "createdAt": "2026-11-15T20:00:00.000Z",
  "completedAt": "2026-11-15T20:14:00.000Z",
  "timeline": [{ "status": "pending", "at": "…", "by": "rider" }]
}
```

## Notes and limits

- Data is stored as a handful of JSON documents (`rides`, `reviews`, `drivers`, `settings`, `bans`, `users`, `stats`). The log keeps the newest 3,000 rides and 1,500 reviews. That's plenty for an RP server, but it isn't a database. If two people save at the exact same moment, the later save wins.
- Drivers who forget to go offline are marked offline automatically after 3 hours without activity.
- Riders can have one active ride at a time. General reviews are limited to one every 12 hours, and ride reviews to one per completed ride.
