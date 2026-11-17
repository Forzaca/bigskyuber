import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { wrap } from '../lib/http.js';
import { readSession, refreshRoles, accessFor, isBanned } from '../lib/session.js';

// Serves /admin and /workers. The panel HTML only leaves the server when the
// signed-in Discord user has the matching role from env. Everyone else gets a gate page.

const PANELS = {
  admin: { file: 'admin.html', level: 'admin', title: 'Admin', role: 'admin' },
  workers: { file: 'workers.html', level: 'worker', title: 'Driver panel', role: 'driver' },
};

const cache = new Map();
async function load(file) {
  if (!cache.has(file)) cache.set(file, await readFile(path.join(process.cwd(), 'panels', file), 'utf8'));
  return cache.get(file);
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function gate({ title, heading, body, action }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)} · Big Sky Uber</title>
  <meta name="robots" content="noindex, nofollow">
  <meta name="theme-color" content="#0c0c0e">
  <link rel="icon" href="/assets/icon-32.png" type="image/png" sizes="32x32">
  <link rel="apple-touch-icon" href="/assets/icon-180.png">
  <link rel="manifest" href="/site.webmanifest">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@500&display=swap">
  <link rel="stylesheet" href="/css/site.css?v=10">
</head>
<body data-page="gate">
  <div class="ambient" aria-hidden="true"></div>
  <header class="top" id="top"></header>
  <main id="main" class="gate">
    <div class="gate-card glass reveal">
      <div class="gate-lock" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg></div>
      <h1>${esc(heading)}</h1>
      <p>${body}</p>
      <div class="gate-actions">${action}</div>
    </div>
  </main>
  <footer class="foot" id="foot"></footer>
  <script src="/js/core.js?v=10"></script>
</body>
</html>`;
}

export default wrap(async (req, res) => {
  const name = new URL(req.url, 'http://x').searchParams.get('p');
  const panel = PANELS[name];
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (!panel) { res.statusCode = 404; return res.end('Not found'); }

  let user = readSession(req);
  const next = `/${name}`;
  if (!user) {
    res.statusCode = 401;
    return res.end(gate({
      title: panel.title,
      heading: 'Staff only',
      body: `Sign in with Discord to open the ${esc(panel.title.toLowerCase())}. You need the ${panel.role} role in the Big Sky Discord server.`,
      action: `<a class="btn discord" href="/api/auth/login?next=${encodeURIComponent(next)}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.3 4.4A19.7 19.7 0 0 0 15.4 3l-.6 1.3a18.3 18.3 0 0 0-5.6 0L8.6 3a19.6 19.6 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18.1A19.9 19.9 0 0 0 6.1 21l1.3-2a12.8 12.8 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4a12.7 12.7 0 0 1-2 1l1.3 2a19.8 19.8 0 0 0 6-3c.5-5.2-.9-9.7-3.6-13.6ZM8 15.3c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.4 8 10.4s2.2 1.1 2.2 2.5-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.5 2.2-2.5 2.2 1.1 2.2 2.5-1 2.4-2.2 2.4Z"/></svg><span>Sign in with Discord</span></a>`,
    }));
  }

  user = await refreshRoles(req, res, user);
  const access = accessFor(user);
  const banned = !access.admin && (await isBanned(user.id));
  if (!access[panel.level] || banned) {
    res.statusCode = 403;
    return res.end(gate({
      title: panel.title,
      heading: 'You don’t have access',
      body: `You’re signed in as <b>${esc(user.name)}</b>, but this account doesn’t have the ${panel.role} role. If you were just given it, sign out and back in.`,
      action: `<a class="btn ghost" href="/">Back home</a><a class="btn ghost" href="/api/auth/logout">Sign out</a>`,
    }));
  }

  res.statusCode = 200;
  res.end(await load(panel.file));
});
