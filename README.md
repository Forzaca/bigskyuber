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
lib/          http helpers, signed sessions + role checks, blob store, pricing/ride logic, webhook
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

- **Map and locations:** the map uses real ER:LC (Liberty County) streets, the Liberty County River, its bridges and landmark postal codes from the [ER:LC wiki](https://emergency-response-liberty-county.fandom.com/wiki/Roads). The data lives at the top of `public/js/map.js` (`LOCATIONS`, `STREETS`, `AREAS`). Edit it there if a game update moves something. The ride form suggests these landmarks and fills in the postal automatically.
- **Live server (optional):** set `ERLC_API_KEY` (in-game: your private server → Settings → ER:LC API). The site then shows players online and the join code, checks that a rider's Roblox username is actually in the server before accepting a request (toggle in Admin → Settings), shows In server / Not in server badges to drivers, and serves `GET /api/v1/server` to your bot. Results are cached for 20–30 seconds to stay inside PRC's rate limits, and if PRC is down the site keeps working without the check.

## How roles work

- Sign-in asks Discord for `identify` and `guilds.members.read`. That lets the site read **your own** roles in `DISCORD_GUILD_ID`. It can't see your email or messages.
- Roles are saved in the signed session cookie when you sign in. If you change a role in Discord, the user needs to sign out and back in…
- …**unless** you set `DISCORD_BOT_TOKEN` (a bot that is in your server). Then roles are re-checked every 10 minutes, so removing someone's role locks them out almost right away.
- Several roles are fine: `DISCORD_ADMIN_ROLE_ID=111,222`.
- Admins can also open `/workers`.

## Pricing (the Big Sky Economy)

| Class | Default range per trip |
| --- | --- |
| Uber | $100 – $250 |
| Uber Premium | $250 – $500 |
| Uber Black | $500 – $1,000 |

Riders pick a trip length (Local / Cross-town / County-wide), which places the estimate at the bottom, middle or top of the range. Drivers enter the final fare when they complete a trip, and it has to fall inside the range. Admins can change the ranges, pause a class, or close dispatch from `/admin`.

## Ride lifecycle

```
pending → accepted → enroute → arrived → inprogress → completed
   └───────────── cancelled (by rider, driver or admin) ─────────────┘
```

Every status change goes into the ride's `timeline`. If `DISCORD_WEBHOOK_URL` is set, new, accepted, completed and cancelled rides are posted to that channel.

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
| `GET /api/v1/rides` | Ride logs. Filters: `status` (comma list), `class`, `rider` (Discord ID), `driver` (Discord ID), `roblox`, `since` (ISO date or unix time), `limit` (max 200) |
| `GET /api/v1/rides/active` | Every ride that isn't finished |
| `GET /api/v1/rides/:id` | One ride, e.g. `BSU-7KQ2MX` |
| `GET /api/v1/reviews` | Reviews. Filters: `rating`, `minRating`, `driver`, `class`, `limit`, `includeHidden=true` |
| `GET /api/v1/reviews/summary` | Average plus a 1–5 star breakdown |
| `GET /api/v1/reviews/:id` | One review |
| `GET /api/v1/drivers/online` | Drivers on duty right now (`count`, `available`, `drivers[]`) |
| `GET /api/v1/drivers` | All driver profiles |
| `GET /api/v1/drivers/:id` | Look up by Discord ID or Roblox username |
| `GET /api/v1/pricing` | Current class prices |
| `GET /api/v1/server` | ER:LC server status and players (needs `ERLC_API_KEY`) |

Example (discord.js):

```js
const res = await fetch('https://YOUR-DOMAIN/api/v1/drivers/online', {
  headers: { Authorization: `Bearer ${process.env.UBERBIGSKY}` },
});
const { count, drivers } = await res.json();
await interaction.reply(`🚗 ${count} Big Sky drivers online: ${drivers.map((d) => d.roblox).join(', ')}`);
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
  "dropoff": "Liberty County Hospital", "dropoffPostal": "404",
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
