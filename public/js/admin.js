(() => {
  const { $, $$, esc, money, icon: I } = BSU;
  const P = BSU.panel;
  const CLASSES = ['uber', 'premium', 'black'];
  const STATUSES = ['pending', 'accepted', 'enroute', 'arrived', 'inprogress', 'completed', 'cancelled'];
  const ACTIVE = new Set(STATUSES.slice(0, 5));
  let D = null;
  const built = {};
  const rideFilter = { q: '', status: '', cls: '', limit: 100 };
  let reviewFilter = 'all';

  P.tabs();
  const post = (op, body) => BSU.api(`/api/admin?op=${op}`, { method: 'POST', body });

  async function load() {
    try { D = await BSU.api('/api/admin?op=overview', { quiet: true }); }
    catch (e) {
      if (e.status === 401 || e.status === 403) location.reload();
      else BSU.toast(e.message, 'error');
      return;
    }
    render();
  }
  $('#refresh').addEventListener('click', async (e) => { e.currentTarget.classList.add('loading'); await load(); e.currentTarget.classList.remove('loading'); BSU.toast('Refreshed', 'ok'); });

  function render() {
    const s = D.stats;
    $('#admin-sub').textContent = `${s.active} active ride${s.active === 1 ? '' : 's'} · ${s.online} driver${s.online === 1 ? '' : 's'} online · dispatch ${D.settings.accepting ? 'open' : 'closed'}`;
    $('[data-c="rides"]').textContent = D.rides.length;
    $('[data-c="drivers"]').textContent = D.drivers.length;
    $('[data-c="reviews"]').textContent = D.reviews.length;
    renderOverview();
    renderRides();
    renderDrivers();
    renderReviews();
    renderUsers();
    if (!built.settings) renderSettings();
    renderApi();
  }

  const who = (u, sub) => u ? `<span class="who"><img src="${esc(u.avatar)}" alt=""><span>${esc(u.name)}${sub ? `<br><span class="muted" style="font-size:12px">${esc(sub)}</span>` : ''}</span></span>` : '<span class="muted">—</span>';

  /* ---------- Overview ---------- */
  function renderOverview() {
    const s = D.stats;
    const stale = D.rides.filter((r) => r.status === 'pending' && Date.now() - r.createdAt > 5 * 60e3);
    $('[data-pane="overview"]').innerHTML = `
      <div class="tiles">
        <div class="tile white"><small>Active now</small><b>${s.active}</b><div class="sub">${s.pending} waiting for a driver</div></div>
        <div class="tile"><small>Drivers online</small><b>${s.online}</b><div class="sub">of ${s.drivers} driver profiles</div></div>
        <div class="tile"><small>Completed</small><b>${s.completed.toLocaleString()}</b><div class="sub">${s.cancelled} cancelled</div></div>
        <div class="tile"><small>Fares collected</small><b>${money(s.earned)}</b><div class="sub">${money(s.earned24h)} in the last 24h</div></div>
        <div class="tile"><small>Requests · 24h</small><b>${s.last24h}</b><div class="sub">${s.total} rides in the log</div></div>
        ${D.server ? `<div class="tile"><small>ER:LC server</small><b>${D.server.players}/${D.server.maxPlayers}</b><div class="sub">players · code ${esc(D.server.joinKey || '—')}</div></div>` : ''}
        <div class="tile"><small>Rating</small><b>${s.reviews.count ? s.reviews.avg.toFixed(2) : '–'}</b><div class="sub">${s.reviews.count} reviews · ${s.users} users</div></div>
      </div>
      <div class="set-grid">
        <div class="card pad-lg">
          <div class="set-row" style="padding-top:0"><div><b>Dispatch</b><span>${D.settings.accepting ? 'Riders can request rides.' : 'Requests are paused.'}</span></div><label class="switch"><input type="checkbox" id="quick-accept" ${D.settings.accepting ? 'checked' : ''}><span></span></label></div>
          <h3 style="font-size:16px;margin:18px 0 10px">Needs attention</h3>
          ${stale.length ? stale.slice(0, 6).map((r) => `<div class="sys-row" style="margin-bottom:6px;cursor:pointer" data-ride="${esc(r.id)}"><span class="dot amber"></span><span><b class="mono">${esc(r.id)}</b> · ${esc(r.roblox)} waiting ${BSU.ago(r.createdAt).replace(' ago', '')}</span><span class="badge amber">${BSU.CLASS_NAMES[r.class]}</span></div>`).join('') : '<p class="muted" style="font-size:14px">Nothing waiting longer than 5 minutes.</p>'}
          ${Object.values(D.system).includes(false) ? `<div class="notice amber" style="margin-top:16px">${I.alert}<span>Some environment variables are missing. See <a href="#api" data-goto="api">API &amp; system</a>.</span></div>` : ''}
        </div>
        <div class="card pad-lg">
          <h3 style="font-size:16px;margin-bottom:12px">Latest rides</h3>
          ${D.rides.slice(0, 8).map((r) => `<div class="sys-row" style="margin-bottom:6px;cursor:pointer" data-ride="${esc(r.id)}"><span class="mono" style="font-size:12.5px">${esc(r.id)}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.roblox)} · ${esc(r.pickup)} → ${esc(r.dropoff)}</span>${BSU.statusBadge(r.status)}</div>`).join('') || '<p class="muted" style="font-size:14px">No rides yet.</p>'}
        </div>
      </div>`;
    $('#quick-accept').addEventListener('change', async (e) => {
      try { await post('settings', { ...settingsPayload(D.settings), accepting: e.target.checked }); BSU.toast(e.target.checked ? 'Dispatch open' : 'Dispatch closed', 'ok'); built.settings = false; await load(); }
      catch { e.target.checked = !e.target.checked; }
    });
  }

  /* ---------- Rides ---------- */
  function renderRides() {
    const pane = $('[data-pane="rides"]');
    if (!built.rides) {
      built.rides = true;
      pane.innerHTML = `<div class="toolbar">
          <input class="input grow" id="rf-q" placeholder="Search ride ID, Roblox name, location, driver…">
          <select class="select" id="rf-status"><option value="">All statuses</option><option value="active">Active</option>${STATUSES.map((s) => `<option value="${s}">${BSU.STATUS[s].label}</option>`).join('')}</select>
          <select class="select" id="rf-class"><option value="">All classes</option>${CLASSES.map((c) => `<option value="${c}">${BSU.CLASS_NAMES[c]}</option>`).join('')}</select>
          <button class="btn xs ghost" id="rf-csv">${I.download}Export CSV</button>
        </div><div id="rides-table"></div>`;
      $('#rf-q').addEventListener('input', (e) => { rideFilter.q = e.target.value.toLowerCase().trim(); rideFilter.limit = 100; drawRides(); });
      $('#rf-status').addEventListener('change', (e) => { rideFilter.status = e.target.value; rideFilter.limit = 100; drawRides(); });
      $('#rf-class').addEventListener('change', (e) => { rideFilter.cls = e.target.value; rideFilter.limit = 100; drawRides(); });
      $('#rf-csv').addEventListener('click', () => {
        const rows = filteredRides();
        P.csv([['id', 'status', 'class', 'created', 'rider_discord', 'rider_roblox', 'driver_discord', 'driver_roblox', 'pickup', 'pickup_postal', 'dropoff', 'dropoff_postal', 'passengers', 'estimate', 'fare', 'cancel_reason'],
          ...rows.map((r) => [r.id, r.status, r.class, new Date(r.createdAt).toISOString(), r.rider.id, r.roblox, r.driver?.id, r.driver?.roblox, r.pickup, r.pickupPostal, r.dropoff, r.dropoffPostal, r.passengers, r.quote?.estimate, r.fare, r.cancelReason])], `bigsky-rides-${new Date().toISOString().slice(0, 10)}.csv`);
      });
    }
    drawRides();
  }

  function filteredRides() {
    const { q, status, cls } = rideFilter;
    return D.rides.filter((r) =>
      (!status || (status === 'active' ? ACTIVE.has(r.status) : r.status === status)) &&
      (!cls || r.class === cls) &&
      (!q || [r.id, r.roblox, r.pickup, r.dropoff, r.rider.name, r.rider.username, r.driver?.name, r.driver?.roblox].some((v) => String(v || '').toLowerCase().includes(q))));
  }

  function drawRides() {
    const list = filteredRides();
    const box = $('#rides-table');
    if (!list.length) { box.innerHTML = '<div class="empty"><b>No rides match</b>Try a different search or filter.</div>'; return; }
    const shown = list.slice(0, rideFilter.limit);
    box.innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>Ride</th><th>Requested</th><th>Rider</th><th>Driver</th><th>Route</th><th>Class</th><th>Status</th><th style="text-align:right">Fare</th></tr></thead><tbody>
      ${shown.map((r) => `<tr class="click" data-ride="${esc(r.id)}"><td class="mono">${esc(r.id)}</td><td>${BSU.date(r.createdAt)}</td><td>${who(r.rider, r.roblox)}</td><td>${r.driver ? who(r.driver, r.driver.roblox) : '<span class="muted">—</span>'}</td><td class="wrap-cell">${esc(r.pickup)} → ${esc(r.dropoff)}</td><td>${BSU.CLASS_NAMES[r.class]}</td><td>${BSU.statusBadge(r.status)}</td><td style="text-align:right">${r.fare != null ? money(r.fare) : `<span class="muted">~${money(r.quote?.estimate)}</span>`}</td></tr>`).join('')}
      </tbody></table><div class="table-foot">Showing ${shown.length} of ${list.length}${list.length > shown.length ? ' · <button class="arrow-link" id="rf-more" style="font-size:13px">Show more</button>' : ''}</div></div>`;
    $('#rf-more')?.addEventListener('click', () => { rideFilter.limit += 200; drawRides(); });
  }

  function rideModal(id) {
    const r = D.rides.find((x) => x.id === id);
    if (!r) return;
    const drivers = D.drivers;
    BSU.modal({
      title: `Ride ${r.id}`,
      wide: true,
      body: `<div class="set-grid">
        <div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">${BSU.statusBadge(r.status)}<span class="badge">${BSU.CLASS_NAMES[r.class]}</span><span class="badge">${r.passengers} rider${r.passengers > 1 ? 's' : ''}</span></div>
          <dl class="kv">
            <dt>Rider</dt><dd>${esc(r.rider.name)} <span class="muted">@${esc(r.rider.username)}</span><br><button class="copy-btn" data-copy="${esc(r.rider.id)}">${esc(r.rider.id)} ${I.copy}</button></dd>
            <dt>Roblox</dt><dd><button class="copy-btn" data-copy="${esc(r.roblox)}">${esc(r.roblox)} ${I.copy}</button></dd>
            <dt>Pickup</dt><dd>${esc(r.pickup)}${r.pickupPostal ? ` · ${esc(r.pickupPostal)}` : ''}</dd>
            <dt>Drop-off</dt><dd>${esc(r.dropoff)}${r.dropoffPostal ? ` · ${esc(r.dropoffPostal)}` : ''}</dd>
            <dt>Quote</dt><dd>${money(r.quote?.min)} – ${money(r.quote?.max)} (est. ${money(r.quote?.estimate)})</dd>
            ${r.notes ? `<dt>Notes</dt><dd>${esc(r.notes)}</dd>` : ''}
            ${r.cancelReason ? `<dt>Cancelled</dt><dd>${esc(r.cancelReason)} <span class="muted">(${esc(r.cancelledBy || '')})</span></dd>` : ''}
          </dl>
          <h4 style="font-size:14px;margin:22px 0 8px">Timeline</h4>
          <div class="timeline">${(r.timeline || []).map((t) => `<div class="tl">${BSU.STATUS[t.status]?.label || t.status}<span>${BSU.date(t.at)}</span></div>`).join('')}</div>
        </div>
        <div>
          <div class="field"><label for="m-status">Status</label><select class="select" id="m-status">${STATUSES.map((s) => `<option value="${s}" ${s === r.status ? 'selected' : ''}>${BSU.STATUS[s].label}</option>`).join('')}</select></div>
          <div class="field"><label for="m-driver">Driver</label><select class="select" id="m-driver"><option value="">— None —</option>${drivers.map((d) => `<option value="${esc(d.id)}" ${r.driver?.id === d.id ? 'selected' : ''}>${esc(d.name)}${d.roblox ? ` (${esc(d.roblox)})` : ''}${d.online ? ' · online' : ''}</option>`).join('')}</select></div>
          <div class="field"><label for="m-fare">Final fare</label><input class="input" id="m-fare" type="number" min="0" step="10" value="${r.fare ?? ''}" placeholder="${r.quote?.estimate ?? ''}"></div>
          <div class="field"><label for="m-note">Staff note <small>only admins see this</small></label><textarea class="textarea" id="m-note" maxlength="300" style="min-height:80px">${esc(r.adminNote || '')}</textarea></div>
        </div>
      </div>`,
      actions: [
        { label: 'Delete ride', kind: 'danger', onClick: async () => {
          if (!(await BSU.confirm('Delete this ride?', 'It will be removed from the ride log and the bot API. This cannot be undone.', 'Delete'))) return false;
          await post('rideDelete', { id: r.id }); BSU.toast('Ride deleted', 'ok'); await load();
        } },
        { label: 'Close' },
        { label: 'Save changes', kind: '', onClick: async (m) => {
          const driverId = $('#m-driver', m).value;
          await post('ride', { id: r.id, status: $('#m-status', m).value, driverId: driverId === (r.driver?.id || '') ? undefined : driverId || null, fare: $('#m-fare', m).value, adminNote: $('#m-note', m).value });
          BSU.toast('Ride updated', 'ok'); await load();
        } },
      ],
    });
  }

  /* ---------- Drivers ---------- */
  function renderDrivers() {
    const pane = $('[data-pane="drivers"]');
    if (!D.drivers.length) { pane.innerHTML = '<div class="empty"><b>No drivers yet</b>Anyone with the driver role gets a profile when they open /workers.</div>'; return; }
    pane.innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>Driver</th><th>Roblox</th><th>Vehicle</th><th>Classes</th><th>Status</th><th>Rides</th><th>Earned</th><th>Last seen</th><th></th></tr></thead><tbody>
      ${D.drivers.map((d) => `<tr><td>${who(d, '@' + d.username)}</td><td class="mono">${esc(d.roblox || '—')}</td><td>${esc(d.vehicle || '—')}${d.callsign ? ` <span class="badge mono">${esc(d.callsign)}</span>` : ''}</td>
        <td>${(d.classes || []).map((c) => `<span class="badge">${BSU.CLASS_NAMES[c].replace('Uber ', '')}</span>`).join(' ')}</td>
        <td>${d.online ? `<span class="badge ${d.busy ? 'amber' : 'green'}">${d.busy ? 'On a trip' : 'Online'}</span>` : '<span class="badge">Offline</span>'}</td>
        <td>${d.totalRides || 0}</td><td>${money(d.earned || 0)}</td><td>${d.lastSeen ? BSU.ago(d.lastSeen) : '—'}</td>
        <td><div class="actions">${d.online ? `<button class="btn xs ghost" data-doff="${esc(d.id)}">${I.power}Set offline</button>` : ''}<button class="btn xs danger" data-dremove="${esc(d.id)}" aria-label="Remove profile">${I.trash}</button></div></td></tr>`).join('')}
      </tbody></table></div>
      <p class="hint" style="margin-top:12px">Removing a profile doesn’t remove the Discord role. Remove the role in Discord to fully revoke panel access.</p>`;
  }

  /* ---------- Reviews ---------- */
  function renderReviews() {
    const pane = $('[data-pane="reviews"]');
    const list = D.reviews.filter((r) => reviewFilter === 'all' || (reviewFilter === 'hidden' ? r.hidden : reviewFilter === 'featured' ? r.featured : r.rating <= 2));
    pane.innerHTML = `<div class="filters" id="rv-filters">${[['all', 'All'], ['featured', 'Featured'], ['low', '1–2 ★'], ['hidden', 'Hidden']].map(([k, l]) => `<button class="filter ${reviewFilter === k ? 'on' : ''}" data-rf="${k}">${l}</button>`).join('')}</div>
      ${list.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Author</th><th>Rating</th><th>Review</th><th>Ride</th><th>Posted</th><th></th></tr></thead><tbody>
      ${list.map((r) => `<tr style="${r.hidden ? 'opacity:.5' : ''}"><td>${who(r.user, '@' + r.user.username)}</td><td>${BSU.stars(r.rating)}</td><td class="wrap-cell">${esc(r.text)}${r.driverName ? `<br><span class="muted" style="font-size:12.5px">Driver: ${esc(r.driverName)}</span>` : ''}</td>
        <td class="mono">${r.rideId ? esc(r.rideId) : '—'}</td><td>${BSU.ago(r.createdAt)}</td>
        <td><div class="actions">
          <button class="btn xs ${r.featured ? '' : 'ghost'}" data-rfeat="${esc(r.id)}" title="Feature on home page">${I.star}</button>
          <button class="btn xs ghost" data-rhide="${esc(r.id)}" title="${r.hidden ? 'Show' : 'Hide'}">${r.hidden ? I.eye : I.eyeOff}</button>
          <button class="btn xs danger" data-rdel="${esc(r.id)}" title="Delete">${I.trash}</button>
        </div></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty"><b>No reviews here</b></div>'}`;
  }

  /* ---------- Users & bans ---------- */
  function renderUsers() {
    const pane = $('[data-pane="users"]');
    if (pane.contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const banned = new Set(D.bans.map((b) => b.userId));
    pane.innerHTML = `<div class="set-grid">
      <form class="card pad-lg" id="ban-form">
        <h3 style="font-size:18px">Ban a user</h3>
        <p class="muted" style="font-size:14px;margin-top:4px">Banned users can’t sign in, request rides or post reviews. Pending rides are cancelled.</p>
        <div class="field" style="margin-top:16px"><label for="b-id">Discord user ID</label><input class="input mono" id="b-id" inputmode="numeric" placeholder="123456789012345678"></div>
        <div class="field"><label for="b-reason">Reason</label><input class="input" id="b-reason" maxlength="200" placeholder="e.g. Repeated no-shows"></div>
        <button class="btn danger" style="margin-top:16px" type="submit">${I.ban}Ban user</button>
      </form>
      <div class="card pad-lg">
        <h3 style="font-size:18px;margin-bottom:12px">Bans (${D.bans.length})</h3>
        ${D.bans.length ? D.bans.map((b) => `<div class="sys-row" style="margin-bottom:6px"><span><b>${esc(b.name || b.userId)}</b> <span class="mono muted" style="font-size:12px">${esc(b.userId)}</span><br><span class="muted" style="font-size:12.5px">${esc(b.reason)} · by ${esc(b.by)} · ${BSU.ago(b.at)}</span></span><button class="btn xs ghost" style="margin-left:auto" data-unban="${esc(b.userId)}">Unban</button></div>`).join('') : '<p class="muted" style="font-size:14px">No one is banned.</p>'}
      </div>
    </div>
    <h3 style="font-size:18px;margin:30px 0 12px">Recent sign-ins (${D.users.length})</h3>
    <div class="table-wrap"><table class="table"><thead><tr><th>User</th><th>Discord ID</th><th>In server</th><th>Logins</th><th>First seen</th><th>Last login</th><th></th></tr></thead><tbody>
      ${D.users.map((u) => `<tr><td>${who(u, '@' + u.username)}</td><td><button class="copy-btn" data-copy="${esc(u.id)}">${esc(u.id)} ${I.copy}</button></td><td>${u.inGuild ? '<span class="badge green">Yes</span>' : '<span class="badge">No</span>'}</td><td>${u.logins}</td><td>${BSU.date(u.firstSeen)}</td><td>${BSU.ago(u.lastLogin)}</td>
        <td><div class="actions">${banned.has(u.id) ? '<span class="badge red">Banned</span>' : `<button class="btn xs ghost" data-banuser="${esc(u.id)}">${I.ban}Ban</button>`}</div></td></tr>`).join('')}
    </tbody></table></div>`;
    $('#ban-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await post('ban', { userId: $('#b-id').value.trim(), reason: $('#b-reason').value.trim() }); BSU.toast('User banned', 'ok'); await load(); } catch {}
    });
  }

  /* ---------- Settings ---------- */
  const settingsPayload = (s) => ({
    accepting: s.accepting, requireGuild: s.requireGuild, requireInGame: s.requireInGame, announcement: s.announcement, discordInvite: s.discordInvite, serverCode: s.serverCode, maxPassengers: s.maxPassengers,
    prices: Object.fromEntries(CLASSES.map((c) => [c, { min: s.prices[c].min, max: s.prices[c].max, enabled: s.prices[c].enabled, tagline: s.prices[c].tagline }])),
  });

  function renderSettings() {
    built.settings = true;
    const s = D.settings;
    $('[data-pane="settings"]').innerHTML = `<form id="settings-form"><div class="set-grid">
      <div class="card pad-lg">
        <h3 style="font-size:18px;margin-bottom:6px">Dispatch</h3>
        <div class="set-row"><div><b>Accept ride requests</b><span>Turn off to pause new requests site-wide.</span></div><label class="switch"><input type="checkbox" id="s-accepting" ${s.accepting ? 'checked' : ''}><span></span></label></div>
        <div class="set-row"><div><b>Require Discord server membership</b><span>Riders must be in DISCORD_GUILD_ID to request.</span></div><label class="switch"><input type="checkbox" id="s-guild" ${s.requireGuild ? 'checked' : ''}><span></span></label></div>
        <div class="set-row"><div><b>Rider must be in the ER:LC server</b><span>${D.system.erlc ? 'Checks the Roblox username against your live player list.' : 'Needs ERLC_API_KEY. Ignored until it is set.'}</span></div><label class="switch"><input type="checkbox" id="s-ingame" ${s.requireInGame !== false ? 'checked' : ''}><span></span></label></div>
        <div class="field" style="margin-top:16px"><label for="s-pax">Max passengers per ride</label><input class="input" id="s-pax" type="number" min="1" max="8" value="${s.maxPassengers}"></div>
        <div class="field"><label for="s-ann">Announcement banner <small>shown on every public page</small></label><input class="input" id="s-ann" maxlength="200" value="${esc(s.announcement || '')}" placeholder="e.g. Double drivers on duty this weekend!"></div>
        <div class="field"><label for="s-invite">Discord invite link</label><input class="input" id="s-invite" maxlength="120" value="${esc(s.discordInvite || '')}" placeholder="https://discord.gg/yourcode"></div>
        <div class="field"><label for="s-code">ER:LC server code <small>shown in the footer</small></label><input class="input mono" id="s-code" maxlength="20" value="${esc(s.serverCode || '')}" placeholder="BigSky"></div>
      </div>
      <div class="card pad-lg">
        <h3 style="font-size:18px;margin-bottom:6px">Big Sky Economy prices</h3>
        <p class="muted" style="font-size:14px">Flat range per trip, in-game dollars. Drivers must set the final fare inside the range.</p>
        ${CLASSES.map((c) => `<div class="price-row">
          <div class="field"><label class="check" style="font-weight:700;color:var(--text)"><input type="checkbox" data-p-en="${c}" ${s.prices[c].enabled ? 'checked' : ''}><span>${BSU.CLASS_NAMES[c]}</span></label><input class="input" data-p-tag="${c}" maxlength="80" value="${esc(s.prices[c].tagline || '')}" placeholder="Tagline"></div>
          <div class="field"><label>Min $</label><input class="input" type="number" min="0" step="10" data-p-min="${c}" value="${s.prices[c].min}"></div>
          <div class="field"><label>Max $</label><input class="input" type="number" min="0" step="10" data-p-max="${c}" value="${s.prices[c].max}"></div>
        </div>`).join('')}
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-top:18px"><button class="btn" type="submit">Save settings</button><button class="btn ghost" type="button" id="s-reset">Reset prices to default</button></div></form>`;
    $('#s-reset').addEventListener('click', () => {
      const def = { uber: [100, 250], premium: [250, 500], black: [500, 1000] };
      CLASSES.forEach((c) => { $(`[data-p-min="${c}"]`).value = def[c][0]; $(`[data-p-max="${c}"]`).value = def[c][1]; });
      BSU.toast('Defaults filled in. Save to apply.');
    });
    $('#settings-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('[type=submit]');
      btn.classList.add('loading');
      try {
        await post('settings', {
          accepting: $('#s-accepting').checked,
          requireGuild: $('#s-guild').checked,
          requireInGame: $('#s-ingame').checked,
          maxPassengers: Number($('#s-pax').value),
          announcement: $('#s-ann').value.trim(),
          discordInvite: $('#s-invite').value.trim(),
          serverCode: $('#s-code').value.trim(),
          prices: Object.fromEntries(CLASSES.map((c) => [c, { enabled: $(`[data-p-en="${c}"]`).checked, tagline: $(`[data-p-tag="${c}"]`).value.trim(), min: Number($(`[data-p-min="${c}"]`).value), max: Number($(`[data-p-max="${c}"]`).value) }])),
        });
        BSU.toast('Settings saved', 'ok');
        built.settings = false;
        await load();
      } catch {} finally { btn.classList.remove('loading'); }
    });
  }

  /* ---------- API & system ---------- */
  function renderApi() {
    const sys = D.system;
    const rows = [
      ['SESSION_SECRET', sys.session, 'Signs sign-in cookies'],
      ['DISCORD_CLIENT_ID / SECRET', sys.discordOAuth, 'Discord sign-in'],
      ['BLOB_READ_WRITE_TOKEN', sys.blob, 'Vercel Blob storage'],
      ['DISCORD_GUILD_ID', sys.guild, 'Server used for role checks'],
      ['DISCORD_ADMIN_ROLE_ID', sys.adminRole, 'Unlocks /admin'],
      ['DISCORD_WORKER_ROLE_ID', sys.workerRole, 'Unlocks /workers'],
      ['DISCORD_BOT_TOKEN', sys.botToken, 'Optional · live role re-checks'],
      ['DISCORD_WEBHOOK_URL', sys.webhook, 'Optional · ride alerts in Discord'],
      ['UBERBIGSKY', sys.apiKey, 'API key for your Discord bot'],
      ['ERLC_API_KEY', sys.erlc && sys.erlcOk, sys.erlc && !sys.erlcOk ? 'Optional · set, but the ER:LC API did not answer' : 'Optional · live ER:LC server data'],
    ];
    const base = location.origin;
    $('[data-pane="api"]').innerHTML = `<div class="set-grid">
      <div class="card pad-lg">
        <h3 style="font-size:18px;margin-bottom:12px">Environment</h3>
        <div class="sys">${rows.map(([k, ok, d]) => `<div class="sys-row"><span class="dot ${ok ? 'green' : d.startsWith('Optional') ? '' : 'red'}"></span><span><code>${k}</code><br><span class="muted" style="font-size:12.5px">${d}</span></span><span class="badge ${ok ? 'green' : d.startsWith('Optional') ? '' : 'red'}">${ok ? 'Set' : 'Missing'}</span></div>`).join('')}</div>
        <p class="hint" style="margin-top:12px">Set these in Vercel → Project → Settings → Environment Variables, then redeploy.</p>
      </div>
      <div class="card pad-lg">
        <h3 style="font-size:18px;margin-bottom:6px">Discord bot API</h3>
        <p class="muted" style="font-size:14px;margin-bottom:14px">Read-only. Send your <code class="kbd">UBERBIGSKY</code> key in the <code class="kbd">Authorization</code> header.</p>
        <div class="endpoints">${[
          ['/api/v1/ping', 'Check the key works'],
          ['/api/v1/stats', 'Totals for rides, drivers, reviews'],
          ['/api/v1/rides', '?status=&class=&rider=&driver=&roblox=&since=&limit='],
          ['/api/v1/rides/active', 'Rides in progress'],
          ['/api/v1/rides/:id', 'One ride, e.g. BSU-ABC234'],
          ['/api/v1/reviews', '?minRating=&rating=&driver=&class=&limit='],
          ['/api/v1/reviews/summary', 'Average and star breakdown'],
          ['/api/v1/drivers/online', 'Drivers on duty now'],
          ['/api/v1/drivers', 'All driver profiles'],
          ['/api/v1/drivers/:id', 'By Discord ID or Roblox name'],
          ['/api/v1/pricing', 'Current class prices'],
          ['/api/v1/server', 'ER:LC server status + players'],
        ].map(([p, d]) => `<div class="endpoint"><span class="m">GET</span><code>${p}</code><span>${esc(d)}</span></div>`).join('')}</div>
        <h4 style="font-size:14px;margin:20px 0 8px">discord.js example</h4>
        <pre class="code">const res = await fetch('<b>${esc(base)}</b>/api/v1/drivers/online', {
  headers: { Authorization: \`Bearer \${process.env.UBERBIGSKY}\` },
});
const { count, drivers } = await res.json();
await interaction.reply(\`🚗 \${count} Big Sky drivers online\`);</pre>
        <h4 style="font-size:14px;margin:16px 0 8px">curl</h4>
        <pre class="code">curl -H "Authorization: Bearer $UBERBIGSKY" ${esc(base)}/api/v1/rides?limit=5</pre>
      </div>
    </div>`;
  }

  /* ---------- Delegated actions ---------- */
  document.addEventListener('click', async (e) => {
    const t = e.target;
    const go = t.closest('[data-goto]');
    if (go) { e.preventDefault(); $(`[data-tab="${go.dataset.goto}"]`).click(); return; }
    const ride = t.closest('[data-ride]');
    if (ride && !t.closest('[data-copy]')) return rideModal(ride.dataset.ride);
    const rf = t.closest('[data-rf]');
    if (rf) { reviewFilter = rf.dataset.rf; renderReviews(); return; }
    const act = async (fn, msg) => { try { await fn(); if (msg) BSU.toast(msg, 'ok'); await load(); } catch {} };
    let b;
    if ((b = t.closest('[data-doff]'))) return act(() => post('driver', { id: b.dataset.doff, offline: true }), 'Driver set offline');
    if ((b = t.closest('[data-dremove]'))) { if (await BSU.confirm('Remove driver profile?', 'Their stats and profile will be deleted. Past rides stay in the log.', 'Remove')) act(() => post('driver', { id: b.dataset.dremove, remove: true }), 'Profile removed'); return; }
    if ((b = t.closest('[data-rfeat]'))) { const r = D.reviews.find((x) => x.id === b.dataset.rfeat); return act(() => post('review', { id: r.id, featured: !r.featured }), r.featured ? 'Unfeatured' : 'Featured'); }
    if ((b = t.closest('[data-rhide]'))) { const r = D.reviews.find((x) => x.id === b.dataset.rhide); return act(() => post('review', { id: r.id, hidden: !r.hidden }), r.hidden ? 'Review visible' : 'Review hidden'); }
    if ((b = t.closest('[data-rdel]'))) { if (await BSU.confirm('Delete review?', 'This cannot be undone.', 'Delete')) act(() => post('reviewDelete', { id: b.dataset.rdel }), 'Review deleted'); return; }
    if ((b = t.closest('[data-unban]'))) return act(() => post('unban', { userId: b.dataset.unban }), 'User unbanned');
    if ((b = t.closest('[data-banuser]'))) {
      const id = b.dataset.banuser;
      BSU.modal({
        title: 'Ban user',
        body: `<p class="muted mono" style="margin-bottom:12px">${esc(id)}</p><div class="field"><label for="bu-reason">Reason</label><input class="input" id="bu-reason" maxlength="200" placeholder="e.g. Repeated no-shows"></div>`,
        actions: [{ label: 'Cancel' }, { label: 'Ban', kind: 'danger', onClick: async (m) => { await post('ban', { userId: id, reason: $('#bu-reason', m).value }); BSU.toast('User banned', 'ok'); await load(); } }],
      });
    }
  });

  // Background refresh, skipped while an editor modal is open.
  P.poll(() => (document.querySelector('.modal') ? null : load()), 20000);
})();
