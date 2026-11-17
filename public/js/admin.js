(() => {
  const { $, $$, esc, money, icon: I } = BSU;
  const P = BSU.panel;
  const CLASSES = BSU.CLASSES;
  const TRIP_KEYS = ['local', 'town', 'county'];
  const DEFAULT_FARES = { uber: [10, 25, 50], premium: [15, 35, 75], black: [25, 50, 100], eats: [5, 15, 30] };
  const STATUSES = ['pending', 'accepted', 'enroute', 'arrived', 'inprogress', 'completed', 'cancelled'];
  const ACTIVE = new Set(STATUSES.slice(0, 5));
  let D = null;
  const built = {};
  const rideFilter = { q: '', status: '', cls: '', limit: 100 };
  let reviewFilter = 'all';

  P.tabs((name) => { if (name === 'payroll' && D) loadPayroll(); });
  // Skeletons until the first load finishes.
  $('[data-pane="overview"]').innerHTML = BSU.skel.tiles(6) + BSU.skel.table(6, 4);
  $('[data-pane="analytics"]').innerHTML = BSU.skel.tiles(6) + BSU.skel.table(5, 6);
  $('[data-pane="money"]').innerHTML = BSU.skel.tiles(6) + BSU.skel.table(5, 5);
  ['shifts', 'payroll', 'rides', 'drivers', 'reviews', 'users'].forEach((p) => ($(`[data-pane="${p}"]`).innerHTML = BSU.skel.table(8, 6)));
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
    $('[data-c="shifts"]').textContent = D.shifts.filter((x) => x.active).length;
    $('[data-c="payroll"]').textContent = (D.paystubs || []).filter((s) => s.status !== 'void').length;
    renderOverview();
    renderAnalytics();
    renderMoney();
    renderShifts();
    if (!$('[data-pane="payroll"]').hidden || !payroll) loadPayroll();
    renderNotify();
    renderRides();
    renderDrivers();
    renderReviews();
    renderUsers();
    if (!built.settings) renderSettings();
    renderApi();
  }

  const who = (u, sub) => u ? `<span class="who">${BSU.face(u.headshot, u.avatar)}<span>${esc(u.name)}${sub ? `<br><span class="muted" style="font-size:12px">${esc(sub)}</span>` : ''}</span></span>` : '<span class="muted">—</span>';

  /* ---------- Shared time + chart helpers ---------- */
  const DAY = 864e5;
  const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const dur = (ms) => {
    const m = Math.max(0, Math.round(ms / 60000));
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
  };
  const hours = (ms) => (ms / 36e5).toFixed(1) + 'h';
  const shiftEnd = (s) => (s.active ? Date.now() : s.end);
  const tsOf = (r, status) => (r.timeline || []).find((t) => t.status === status)?.at;
  const niceMax = (v) => {
    if (v <= 4) return 4;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v);
  };

  /** Single-series vertical bars. Hover/focus a column for its value. */
  function barChart({ title, data, fmt = (v) => v, every = 1, summary }) {
    const top = niceMax(Math.max(0, ...data.map((d) => d.value)));
    return `<figure class="chart-card card">
      <figcaption class="chart-head"><b>${esc(title)}</b>${summary ? `<span>${summary}</span>` : ''}</figcaption>
      <div class="chart" role="img" aria-label="${esc(title)}">
        <div class="chart-grid">${[1, 0.5, 0].map((f) => `<span style="bottom:${f * 100}%"><em>${fmt(Math.round(top * f))}</em></span>`).join('')}</div>
        <div class="chart-bars">${data.map((d) => `<div class="bar" tabindex="0" data-tip="${esc(d.label)} · ${esc(fmt(d.value))}" aria-label="${esc(d.label)}: ${esc(fmt(d.value))}"><i style="height:${d.value ? Math.max(1.5, (d.value / top) * 100) : 0}%"></i></div>`).join('')}</div>
      </div>
      <div class="chart-x">${data.map((d, i) => `<span>${i % every === 0 ? esc(d.short ?? d.label) : ''}</span>`).join('')}</div>
    </figure>`;
  }

  /** Horizontal bars for a few named categories, value labelled at the end. */
  function rowChart({ title, rows, fmt = (v) => v }) {
    const top = Math.max(1, ...rows.map((r) => r.value));
    return `<figure class="chart-card card">
      <figcaption class="chart-head"><b>${esc(title)}</b></figcaption>
      <div class="rows">${rows.map((r) => `<div class="row-bar" tabindex="0" data-tip="${esc(r.label)} · ${esc(fmt(r.value))}"><span>${esc(r.label)}</span><span class="track"><i style="width:${(r.value / top) * 100}%"></i></span><b>${esc(fmt(r.value))}</b></div>`).join('')}</div>
    </figure>`;
  }

  // One floating tooltip for every chart.
  const tip = document.body.appendChild(Object.assign(document.createElement('div'), { className: 'chart-tip', hidden: true }));
  const showTip = (el) => {
    const r = el.getBoundingClientRect();
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    const w = tip.offsetWidth;
    tip.style.left = Math.min(innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2)) + 'px';
    tip.style.top = r.top + scrollY - tip.offsetHeight - 8 + 'px';
  };
  document.addEventListener('pointerover', (e) => { const el = e.target.closest?.('[data-tip]'); if (el) showTip(el); });
  document.addEventListener('pointerout', (e) => { if (e.target.closest?.('[data-tip]')) tip.hidden = true; });
  document.addEventListener('focusin', (e) => { const el = e.target.closest?.('[data-tip]'); if (el) showTip(el); });
  document.addEventListener('focusout', () => (tip.hidden = true));

  /* ---------- Analytics ---------- */
  let range = 14;
  function renderAnalytics() {
    const pane = $('[data-pane="analytics"]');
    const now = Date.now();
    const from = startOfDay(now) - (range - 1) * DAY;
    const rides = D.rides.filter((r) => r.createdAt >= from);
    const done = rides.filter((r) => r.status === 'completed');
    const cancelled = rides.filter((r) => r.status === 'cancelled');
    const shifts = D.shifts.filter((s) => shiftEnd(s) >= from);
    const onShiftMs = shifts.reduce((m, s) => m + (shiftEnd(s) - Math.max(s.start, from)), 0);
    const waits = rides.map((r) => (r.acceptedAt || tsOf(r, 'accepted')) - r.createdAt).filter((v) => v > 0);
    const trips = done.map((r) => r.completedAt - tsOf(r, 'inprogress')).filter((v) => v > 0);
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

    const days = Array.from({ length: range }, (_, i) => {
      const t = from + i * DAY;
      const d = new Date(t);
      return { t, label: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }), short: d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }) };
    });
    const perDay = (list, fn) => days.map((d) => ({ ...d, value: list.filter((r) => r.createdAt >= d.t && r.createdAt < d.t + DAY).reduce((s, r) => s + fn(r), 0) }));
    const hoursData = Array.from({ length: 24 }, (_, h) => ({ label: `${h}:00–${h}:59`, short: h % 6 === 0 ? `${h}:00` : '', value: rides.filter((r) => new Date(r.createdAt).getHours() === h).length }));
    const every = range > 14 ? 5 : range > 7 ? 2 : 1;

    // Driver leaderboard for the range.
    const board = D.drivers.map((d) => {
      const mine = done.filter((r) => r.driver?.id === d.id);
      const ms = shifts.filter((s) => s.driverId === d.id).reduce((m, s) => m + (shiftEnd(s) - Math.max(s.start, from)), 0);
      const rv = D.reviews.filter((r) => r.driverId === d.id && !r.hidden);
      return { d, trips: mine.length, fares: mine.reduce((s, r) => s + (r.fare || 0), 0), ms, rating: rv.length ? rv.reduce((s, r) => s + r.rating, 0) / rv.length : null };
    }).filter((x) => x.trips || x.ms).sort((a, b) => b.trips - a.trips || b.ms - a.ms);

    pane.innerHTML = `
      <div class="toolbar"><div class="seg" id="an-range" style="width:auto">${[7, 14, 30].map((n) => `<input type="radio" name="an" id="an-${n}" value="${n}" ${n === range ? 'checked' : ''}><label for="an-${n}" style="padding:0 16px">${n} days</label>`).join('')}</div>
        <span class="muted spacer" style="font-size:13px">Based on the newest ${D.rides.length} rides in the log</span></div>
      <div class="tiles">
        <div class="tile white"><small>Trips completed</small><b>${done.length}</b><div class="sub">${rides.length} requested</div></div>
        <div class="tile"><small>Fares collected</small><b>${money(done.reduce((s, r) => s + (r.fare || 0), 0))}</b><div class="sub">avg ${money(avg(done.map((r) => r.fare || 0)))} a trip</div></div>
        <div class="tile"><small>Hours on shift</small><b>${hours(onShiftMs)}</b><div class="sub">${shifts.length} shift${shifts.length === 1 ? '' : 's'}</div></div>
        <div class="tile"><small>Avg wait for a driver</small><b>${waits.length ? dur(avg(waits)) : '–'}</b><div class="sub">request → accepted</div></div>
        <div class="tile"><small>Avg trip time</small><b>${trips.length ? dur(avg(trips)) : '–'}</b><div class="sub">pickup → drop-off</div></div>
        <div class="tile"><small>Cancelled</small><b>${rides.length ? Math.round((cancelled.length / rides.length) * 100) : 0}%</b><div class="sub">${cancelled.length} of ${rides.length}</div></div>
      </div>
      <div class="chart-grid-2">
        ${barChart({ title: 'Trips completed per day', data: perDay(rides, (r) => (r.status === 'completed' ? 1 : 0)), every })}
        ${barChart({ title: 'Fares collected per day', data: perDay(rides, (r) => (r.status === 'completed' ? r.fare || 0 : 0)), fmt: money, every })}
        ${barChart({ title: 'Requests by hour of day', data: hoursData, summary: 'Your local time' })}
        ${rowChart({ title: 'Trips by class', rows: CLASSES.map((c) => ({ label: BSU.CLASS_NAMES[c], value: done.filter((r) => r.class === c).length })) })}
      </div>
      <h3 class="pane-title">Driver leaderboard</h3>
      ${board.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Driver</th><th>Trips</th><th>Fares</th><th>Hours on shift</th><th>Trips / hour</th><th>Rating</th></tr></thead><tbody>
        ${board.map((x, i) => `<tr><td class="mono muted">${i + 1}</td><td>${who(x.d, x.d.roblox || '@' + x.d.username)}</td><td>${x.trips}</td><td>${money(x.fares)}</td><td>${hours(x.ms)}</td><td>${x.ms ? (x.trips / (x.ms / 36e5)).toFixed(1) : '–'}</td><td>${x.rating ? x.rating.toFixed(2) + ' ★' : '–'}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">No driver activity in this range yet.</div>'}`;
    BSU.seg($('#an-range'));
    $('#an-range').addEventListener('change', (e) => { range = Number(e.target.value); renderAnalytics(); });
  }

  /* ---------- Money ---------- */
  const WEEK = 7 * DAY;
  const weekStartUTC = (t = Date.now(), offset = 0) => { const d = new Date(t); const day = (d.getUTCDay() + 6) % 7; return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day) + offset * WEEK; };
  let moneyRange = 30;
  function renderMoney() {
    const pane = $('[data-pane="money"]');
    const pay = D.settings.pay || { rate: 70, hourly: 0 };
    const from = startOfDay(Date.now()) - (moneyRange - 1) * DAY;
    const done = D.rides.filter((r) => r.status === 'completed' && (r.completedAt || r.createdAt) >= from);
    const gross = done.reduce((s, r) => s + (r.fare || 0), 0);
    const shiftMs = D.shifts.filter((s) => shiftEnd(s) >= from).reduce((m, s) => m + (shiftEnd(s) - Math.max(s.start, from)), 0);
    const driverShare = Math.round((gross * pay.rate) / 100 + (shiftMs / 36e5) * pay.hourly);
    const stubs = (D.paystubs || []).filter((s) => s.status !== 'void');
    const paid = stubs.filter((s) => s.issuedAt >= from);
    const paidOut = paid.reduce((m, s) => m + s.net, 0);
    const eats = done.filter((r) => r.class === 'eats');
    const avg = done.length ? gross / done.length : 0;
    const days = Array.from({ length: moneyRange }, (_, i) => { const t = from + i * DAY; const d = new Date(t); return { t, label: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }), short: d.toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }) }; });
    const every = moneyRange > 30 ? 10 : moneyRange > 14 ? 5 : moneyRange > 7 ? 2 : 1;
    const perDay = days.map((d) => ({ ...d, value: done.filter((r) => (r.completedAt || r.createdAt) >= d.t && (r.completedAt || r.createdAt) < d.t + DAY).reduce((s, r) => s + (r.fare || 0), 0) }));
    const weeks = Array.from({ length: 8 }, (_, i) => { const s = weekStartUTC(Date.now(), i - 7); return { label: `Week of ${BSU.period(s, s + WEEK)}`, short: new Date(s).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', timeZone: 'UTC' }), value: stubs.filter((x) => x.periodStart === s).reduce((m, x) => m + x.net, 0) }; });
    const byClass = CLASSES.map((c) => { const l = done.filter((r) => r.class === c); return { c, label: BSU.CLASS_NAMES[c], gross: l.reduce((s, r) => s + (r.fare || 0), 0), n: l.length }; });
    const earners = D.drivers.map((d) => {
      const mine = done.filter((r) => r.driver?.id === d.id);
      const g = mine.reduce((s, r) => s + (r.fare || 0), 0);
      return { d, trips: mine.length, gross: g, share: Math.round((g * pay.rate) / 100), paid: paid.filter((s) => s.driverId === d.id).reduce((m, s) => m + s.net, 0) };
    }).filter((x) => x.trips || x.paid).sort((a, b) => b.gross - a.gross);
    pane.innerHTML = `
      <div class="toolbar"><div class="seg" id="mo-range" style="width:auto">${[7, 30, 90].map((n) => `<input type="radio" name="mo" id="mo-${n}" value="${n}" ${n === moneyRange ? 'checked' : ''}><label for="mo-${n}" style="padding:0 16px">${n} days</label>`).join('')}</div>
        <span class="muted spacer" style="font-size:13px">Driver share uses your pay settings: ${pay.rate}% of fares${pay.hourly ? ` + ${money(pay.hourly)}/h on shift` : ''}</span></div>
      <div class="tiles">
        <div class="tile white"><small>Fares collected</small><b>${money(gross)}</b><div class="sub">${done.length} trips &amp; deliveries</div></div>
        <div class="tile"><small>Driver share (est.)</small><b>${money(driverShare)}</b><div class="sub">what drivers earned</div></div>
        <div class="tile"><small>Company keeps (est.)</small><b>${money(Math.max(0, gross - driverShare))}</b><div class="sub">fares − driver share</div></div>
        <div class="tile"><small>Paid out</small><b>${money(paidOut)}</b><div class="sub">${paid.length} paystub${paid.length === 1 ? '' : 's'} issued</div></div>
        <div class="tile"><small>Average fare</small><b>${money(avg)}</b><div class="sub">per completed trip</div></div>
        <div class="tile"><small>Uber Eats fees</small><b>${money(eats.reduce((s, r) => s + (r.fare || 0), 0))}</b><div class="sub">${eats.length} deliveries</div></div>
      </div>
      <div class="chart-grid-2">
        ${barChart({ title: 'Fares collected per day', data: perDay, fmt: money, every })}
        ${barChart({ title: 'Paid out per week', data: weeks, fmt: money, summary: 'Issued paystubs, by pay period' })}
        ${rowChart({ title: 'Fares by class', rows: byClass.map((x) => ({ label: x.label, value: x.gross })), fmt: money })}
        ${rowChart({ title: 'Average fare by class', rows: byClass.map((x) => ({ label: x.label, value: x.n ? Math.round(x.gross / x.n) : 0 })), fmt: money })}
      </div>
      <h3 class="pane-title">Earnings by driver</h3>
      ${earners.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Driver</th><th>Trips</th><th>Fares</th><th>Share (${pay.rate}%)</th><th>Paid out</th></tr></thead><tbody>
        ${earners.map((x) => `<tr><td>${who(x.d, x.d.roblox || '@' + x.d.username)}</td><td>${x.trips}</td><td>${money(x.gross)}</td><td>${money(x.share)}</td><td>${x.paid ? money(x.paid) : '<span class="muted">—</span>'}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty">No completed trips in this range yet.</div>'}`;
    BSU.seg($('#mo-range'));
    $('#mo-range').addEventListener('change', (e) => { moneyRange = Number(e.target.value); renderMoney(); });
  }

  /* ---------- Payroll ---------- */
  const payPeriod = { preset: 'last', start: weekStartUTC(Date.now(), -1), end: weekStartUTC(Date.now(), 0) };
  let payroll = null;
  async function loadPayroll() {
    const pane = $('[data-pane="payroll"]');
    if (!payroll) pane.innerHTML = BSU.skel.table(6, 6);
    try { payroll = await BSU.api(`/api/admin?op=payroll&start=${payPeriod.start}&end=${payPeriod.end}`, { quiet: true }); }
    catch (e) { pane.innerHTML = `<div class="empty"><b>Couldn’t load payroll</b>${esc(e.message)}</div>`; return; }
    renderPayroll();
  }
  const isoDay = (t) => new Date(t).toISOString().slice(0, 10);
  function renderPayroll() {
    const pane = $('[data-pane="payroll"]');
    const p = payroll;
    const current = p.end > Date.now();
    const unissued = p.rows.filter((r) => !r.issued && r.total > 0);
    const stubs = D.paystubs || [];
    pane.innerHTML = `
      <div class="toolbar">
        <div class="seg" id="pp-preset" style="width:auto">${[['last', 'Last week'], ['this', 'This week'], ['custom', 'Custom']].map(([k, l]) => `<input type="radio" name="pp" id="pp-${k}" value="${k}" ${payPeriod.preset === k ? 'checked' : ''}><label for="pp-${k}" style="padding:0 16px">${l}</label>`).join('')}</div>
        ${payPeriod.preset === 'custom' ? `<input class="input" type="date" id="pp-start" value="${isoDay(payPeriod.start)}" style="min-width:0;width:auto"><span class="muted">to</span><input class="input" type="date" id="pp-end" value="${isoDay(payPeriod.end - DAY)}" style="min-width:0;width:auto"><button class="btn sm ghost" id="pp-apply">Apply</button>` : ''}
        <span class="spacer"></span>
        ${unissued.length ? `<button class="btn sm" id="pp-all">${I.wallet}Issue ${unissued.length} paystub${unissued.length === 1 ? '' : 's'}</button>` : ''}
      </div>
      <p class="muted" style="font-size:13.5px;margin:-4px 0 16px">${BSU.period(p.start, p.end)} (UTC) · drivers keep ${p.config.rate}% of fares${p.config.hourly ? ` + ${money(p.config.hourly)}/h on shift` : ''}${current ? ' · <b style="color:var(--text)">this period isn’t over yet, so the numbers are estimates</b>' : ''}. Change rates in Settings.</p>
      ${p.rows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Driver</th><th>Trips</th><th>Hours</th><th>Fares</th><th>Share</th><th>Hourly</th><th>Estimated pay</th><th>Paystub</th><th></th></tr></thead><tbody>
        ${p.rows.map((r) => `<tr><td>${who(r.driver, r.driver.roblox || '@' + r.driver.username)}</td><td>${r.trips}</td><td>${r.hours}h</td><td>${money(r.gross)}</td><td>${money(r.commission)}</td><td>${r.hourlyPay ? money(r.hourlyPay) : '<span class="muted">—</span>'}</td><td><b>${money(r.total)}</b></td>
          <td>${r.issued ? `<button class="badge green" data-viewstub="${esc(r.issued.id)}">#${r.issued.number} · ${money(r.issued.net)}</button>` : '<span class="badge amber">Not issued</span>'}</td>
          <td style="text-align:right">${r.issued ? '' : `<button class="btn xs" data-issue="${esc(r.driver.id)}">Issue</button>`}</td></tr>`).join('')}
      </tbody></table></div>` : '<div class="empty"><b>No driver activity in this period</b>Pick another week.</div>'}
      <h3 class="pane-title">Issued paystubs</h3>
      ${stubs.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>#</th><th>Driver</th><th>Period</th><th>Trips</th><th>Net</th><th>Issued</th><th>Status</th><th></th></tr></thead><tbody>
        ${stubs.slice(0, 200).map((s) => `<tr><td class="mono">#${s.number}</td><td>${who({ name: s.name, avatar: s.avatar }, s.roblox || '@' + s.username)}</td><td>${BSU.period(s.periodStart, s.periodEnd)}</td><td>${s.trips}</td><td><b>${money(s.net)}</b></td><td>${BSU.date(s.issuedAt)}<br><span class="muted" style="font-size:12px">by ${esc(s.issuedBy?.name || '—')}</span></td>
          <td>${s.status === 'void' ? '<span class="badge red">Void</span>' : '<span class="badge green">Issued</span>'}</td>
          <td style="text-align:right;white-space:nowrap"><button class="btn xs ghost" data-viewstub="${esc(s.id)}">View</button>${s.status === 'void' ? '' : ` <button class="btn xs ghost" data-voidstub="${esc(s.id)}">Void</button>`}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="toolbar" style="margin-top:12px"><button class="btn sm ghost" id="pp-csv">${I.download}Export CSV</button></div>` : '<div class="empty">No paystubs issued yet.</div>'}`;
    BSU.seg($('#pp-preset'));
    $('#pp-preset').addEventListener('change', (e) => {
      payPeriod.preset = e.target.value;
      if (payPeriod.preset === 'last') Object.assign(payPeriod, { start: weekStartUTC(Date.now(), -1), end: weekStartUTC(Date.now(), 0) });
      if (payPeriod.preset === 'this') Object.assign(payPeriod, { start: weekStartUTC(Date.now(), 0), end: weekStartUTC(Date.now(), 1) });
      if (payPeriod.preset === 'custom') return renderPayroll();
      loadPayroll();
    });
    $('#pp-apply')?.addEventListener('click', () => {
      const s = Date.parse($('#pp-start').value + 'T00:00:00Z'), e2 = Date.parse($('#pp-end').value + 'T00:00:00Z') + DAY;
      if (!(e2 > s)) return BSU.toast('Pick an end date after the start.', 'error');
      Object.assign(payPeriod, { start: s, end: e2 });
      loadPayroll();
    });
    $('#pp-csv')?.addEventListener('click', () => P.csv([['number', 'status', 'driver', 'discord_id', 'roblox', 'period_start', 'period_end', 'trips', 'fares', 'rate', 'share', 'hours', 'hourly_pay', 'bonus', 'deductions', 'net', 'issued_at', 'issued_by', 'note'],
      ...stubs.map((s) => [s.number, s.status, s.name, s.driverId, s.roblox, isoDay(s.periodStart), isoDay(s.periodEnd - DAY), s.trips, s.gross, s.rate, s.commission, s.hours, s.hourlyPay, s.bonus, s.deductions, s.net, new Date(s.issuedAt).toISOString(), s.issuedBy?.name, s.note])], 'bigsky-paystubs.csv'));
    $('#pp-all')?.addEventListener('click', async () => {
      if (!(await BSU.confirm(`Issue ${unissued.length} paystubs?`, `For ${BSU.period(p.start, p.end)}, with no bonuses or deductions. Each driver gets a notification.`, 'Issue all'))) return;
      let n = 0;
      for (const r of unissued) { try { await post('paystub', { driverId: r.driver.id, start: p.start, end: p.end }); n++; } catch {} }
      BSU.toast(`${n} paystub${n === 1 ? '' : 's'} issued`, 'ok');
      await load(); loadPayroll();
    });
  }
  function stubView(id) {
    const raw = (D.paystubs || []).find((s) => s.id === id) || payroll?.rows.find((r) => r.issued?.id === id)?.issued;
    if (!raw) return;
    const s = raw.driver ? raw : { ...raw, driver: { name: raw.name, roblox: raw.roblox, callsign: raw.callsign }, issuedBy: raw.issuedBy?.name || raw.issuedBy };
    const html = BSU.paystub(s);
    BSU.modal({ title: `Paystub #${s.number}`, wide: true, body: html, actions: [{ label: 'Close' }, { label: 'Print', onClick: () => { BSU.printStub(html); return false; } }] });
  }
  function issueModal(driverId) {
    const r = payroll.rows.find((x) => x.driver.id === driverId);
    const preview = () => {
      const bonus = Math.max(0, Number($('#is-bonus')?.value) || 0), ded = Math.max(0, Number($('#is-ded')?.value) || 0);
      return BSU.paystub({ ...r, driver: r.driver, number: '—', issuedAt: Date.now(), issuedBy: D.viewer?.name, bonus, deductions: ded, net: Math.max(0, r.total + bonus - ded), note: $('#is-note')?.value || '' });
    };
    const m = BSU.modal({
      title: `Issue paystub · ${r.driver.name}`, wide: true,
      body: `<div class="issue-grid"><div id="is-preview">${preview()}</div><div>
        <div class="field"><label for="is-bonus">Bonus $ <small>optional</small></label><input class="input" id="is-bonus" type="number" min="0" step="1" value="0"></div>
        <div class="field"><label for="is-ded">Deductions $ <small>optional</small></label><input class="input" id="is-ded" type="number" min="0" step="1" value="0"></div>
        <div class="field"><label for="is-note">Note to driver <small>optional</small></label><textarea class="textarea" id="is-note" maxlength="300" placeholder="e.g. Thanks for covering the weekend!"></textarea></div>
        <label class="check" style="margin-top:12px"><input type="checkbox" id="is-notify" checked><span>Send ${esc(r.driver.name)} a notification</span></label>
      </div></div>`,
      actions: [{ label: 'Cancel' }, { label: 'Issue paystub', kind: 'solid', onClick: async (el) => {
        await post('paystub', { driverId, start: payroll.start, end: payroll.end, bonus: Number($('#is-bonus', el).value) || 0, deductions: Number($('#is-ded', el).value) || 0, note: $('#is-note', el).value.trim(), notify: $('#is-notify', el).checked });
        BSU.toast(`Paystub issued to ${r.driver.name}`, 'ok');
        await load(); loadPayroll();
      } }],
    });
    m.el.addEventListener('input', () => ($('#is-preview', m.el).innerHTML = preview()));
  }

  /* ---------- Notify ---------- */
  function renderNotify() {
    const pane = $('[data-pane="notify"]');
    if (pane.dataset.built) { $('#nt-history').innerHTML = notifyHistory(); return; }
    pane.dataset.built = '1';
    pane.innerHTML = `<div class="set-grid">
      <form class="card pad-lg" id="nt-form" novalidate>
        <h3 style="font-size:18px;margin-bottom:6px">Send a notification</h3>
        <p class="muted" style="font-size:14px;margin-bottom:16px">Shows in the bell on every page and on dashboards. People with desktop alerts on get a pop-up too.</p>
        <div class="field"><label for="nt-to">Send to</label>
          <select class="select" id="nt-to"><option value="all">Everyone</option><option value="drivers">Drivers</option><option value="riders">Riders &amp; customers</option><option value="user">One person…</option></select></div>
        <div class="field" id="nt-user-f" hidden><label for="nt-user">Discord user ID</label><input class="input mono" id="nt-user" list="nt-users" inputmode="numeric" placeholder="e.g. 1272978844248178730"><datalist id="nt-users"></datalist></div>
        <div class="field"><label for="nt-title">Title</label><input class="input" id="nt-title" maxlength="120" placeholder="e.g. Double pay this weekend"></div>
        <div class="field"><label for="nt-body">Message <small>optional</small></label><textarea class="textarea" id="nt-body" maxlength="400" placeholder="Details people need to know."></textarea></div>
        <div class="field"><label for="nt-href">Link <small>optional · /path or https://</small></label><input class="input" id="nt-href" maxlength="200" placeholder="/workers"></div>
        <div class="nt-preview" id="nt-preview"></div>
        <button class="btn" type="submit" style="margin-top:16px">${I.bell}Send notification</button>
      </form>
      <div class="card pad-lg"><h3 style="font-size:18px;margin-bottom:12px">Sent by staff</h3><div id="nt-history">${notifyHistory()}</div>
        <p class="hint" style="margin-top:12px">Ride updates (accepted, on the way, arrived, completed, cancelled), new requests for drivers, reviews and paystubs are sent automatically.</p></div>
    </div>`;
    $('#nt-users').innerHTML = (D.users || []).map((u) => `<option value="${esc(u.id)}">${esc(u.name)} (@${esc(u.username)})</option>`).join('');
    const prev = () => ($('#nt-preview').innerHTML = $('#nt-title').value.trim() ? `<small class="muted">Preview</small>${BSU.notifRow({ kind: 'announce', title: $('#nt-title').value.trim(), body: $('#nt-body').value.trim(), href: $('#nt-href').value.trim() || null, at: Date.now() })}` : '');
    $('#nt-form').addEventListener('input', prev);
    $('#nt-to').addEventListener('change', () => ($('#nt-user-f').hidden = $('#nt-to').value !== 'user'));
    $('#nt-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const to = $('#nt-to').value === 'user' ? $('#nt-user').value.trim() : $('#nt-to').value;
      const btn = e.target.querySelector('[type=submit]');
      btn.classList.add('loading');
      try {
        await post('announce', { to, title: $('#nt-title').value.trim(), body: $('#nt-body').value.trim(), href: $('#nt-href').value.trim() });
        BSU.toast('Notification sent', 'ok');
        ['#nt-title', '#nt-body', '#nt-href'].forEach((s) => ($(s).value = ''));
        prev();
        await load();
      } catch {} finally { btn.classList.remove('loading'); }
    });
  }
  function notifyHistory() {
    const list = D.announcements || [];
    if (!list.length) return '<div class="notif-empty">Nothing sent yet.</div>';
    const label = (to) => ({ all: 'Everyone', drivers: 'Drivers', riders: 'Riders' }[to] || (D.users || []).find((u) => u.id === to)?.name || to);
    return `<div class="bell-list" style="max-height:520px">${list.map((n) => `<div class="notif"><span class="notif-ic">${I.bell}</span><span class="notif-tx"><b>${esc(n.title)}</b>${n.body ? `<span>${esc(n.body)}</span>` : ''}<small>${BSU.ago(n.at)} · to ${esc(label(n.to))}${n.from ? ` · by ${esc(n.from.name)}` : ''}</small></span></div>`).join('')}</div>`;
  }

  /* ---------- Shifts ---------- */
  const shiftFilter = { driver: '', active: false };
  function renderShifts() {
    const pane = $('[data-pane="shifts"]');
    if (!built.shifts) {
      built.shifts = true;
      pane.innerHTML = `<div class="toolbar">
          <select class="select" id="sf-driver"><option value="">All drivers</option></select>
          <label class="check" style="align-items:center"><input type="checkbox" id="sf-active"><span>On duty now</span></label>
          <button class="btn xs ghost spacer" id="sf-csv">${I.download}Export CSV</button>
        </div><div id="shift-week"></div><div id="shift-table"></div>`;
      $('#sf-driver').addEventListener('change', (e) => { shiftFilter.driver = e.target.value; drawShifts(); });
      $('#sf-active').addEventListener('change', (e) => { shiftFilter.active = e.target.checked; drawShifts(); });
      $('#sf-csv').addEventListener('click', () => P.csv([['driver', 'discord_id', 'clock_on', 'clock_off', 'minutes', 'trips', 'fares', 'timed_out'],
        ...filteredShifts().map((s) => { const st = shiftStats(s); return [s.name, s.driverId, new Date(s.start).toISOString(), s.active ? '' : new Date(s.end).toISOString(), Math.round((shiftEnd(s) - s.start) / 60000), st.trips, st.fares, s.timedOut ? 'yes' : '']; })],
        `bigsky-shifts-${new Date().toISOString().slice(0, 10)}.csv`));
    }
    const sel = $('#sf-driver');
    const ids = [...new Map(D.shifts.map((s) => [s.driverId, s.name])).entries()];
    sel.innerHTML = '<option value="">All drivers</option>' + ids.map(([id, n]) => `<option value="${esc(id)}" ${id === shiftFilter.driver ? 'selected' : ''}>${esc(n)}</option>`).join('');
    drawShifts();
  }
  const filteredShifts = () => D.shifts.filter((s) => (!shiftFilter.driver || s.driverId === shiftFilter.driver) && (!shiftFilter.active || s.active));
  const shiftStats = (s) => {
    const end = shiftEnd(s);
    const t = D.rides.filter((r) => r.status === 'completed' && r.driver?.id === s.driverId && r.completedAt >= s.start && r.completedAt <= end);
    return { trips: t.length, fares: t.reduce((a, r) => a + (r.fare || 0), 0) };
  };
  function drawShifts() {
    // Hours this week (Monday start) per driver.
    const now = new Date();
    const monday = startOfDay(now.getTime()) - ((now.getDay() + 6) % 7) * DAY;
    const week = new Map();
    for (const s of D.shifts) {
      const end = shiftEnd(s);
      if (end < monday) continue;
      const cur = week.get(s.driverId) || { name: s.name, avatar: s.avatar, ms: 0, active: false };
      cur.ms += end - Math.max(s.start, monday);
      cur.active ||= s.active;
      week.set(s.driverId, cur);
    }
    const wk = [...week.values()].sort((a, b) => b.ms - a.ms);
    $('#shift-week').innerHTML = wk.length ? `<div class="week-hours">${wk.map((w) => `<div class="week-chip"><img src="${esc(w.avatar)}" alt=""><span><b>${esc(w.name)}</b><span>${hours(w.ms)} this week</span></span>${w.active ? '<span class="badge green">On duty</span>' : ''}</div>`).join('')}</div>` : '';

    const list = filteredShifts();
    const box = $('#shift-table');
    if (!list.length) { box.innerHTML = '<div class="empty"><b>No shifts yet</b>Shifts are logged when drivers go online in the driver panel.</div>'; return; }
    box.innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>Driver</th><th>Clock on</th><th>Clock off</th><th>Length</th><th>Trips</th><th>Fares</th></tr></thead><tbody>
      ${list.slice(0, 300).map((s) => { const st = shiftStats(s); return `<tr><td>${who(s)}</td><td>${BSU.date(s.start)}</td><td>${s.active ? '<span class="badge green">On duty</span>' : `${BSU.date(s.end)}${s.timedOut ? ' <span class="badge" title="Driver never clocked off; ended at their last activity">timed out</span>' : ''}`}</td><td>${dur(shiftEnd(s) - s.start)}</td><td>${st.trips}</td><td>${money(st.fares)}</td></tr>`; }).join('')}
    </tbody></table><div class="table-foot">Showing ${Math.min(300, list.length)} of ${list.length} shifts</div></div>`;
  }

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
        ${D.server ? (D.server.online
          ? `<div class="tile"><small>ER:LC server</small><b>${D.server.players}/${D.server.maxPlayers}</b><div class="sub">players · code ${esc(D.server.joinKey || '—')}</div></div>`
          : `<div class="tile"><small>ER:LC server</small><b>${D.server.reason === 'badkey' ? 'Key?' : 'Offline'}</b><div class="sub">${D.server.reason === 'badkey' ? 'ER:LC rejected ERLC_API_KEY' : 'In-game check paused'}</div></div>`) : ''}
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
      ${shown.map((r) => `<tr class="click" data-ride="${esc(r.id)}"><td class="mono">${esc(r.id)}</td><td>${BSU.date(r.createdAt)}</td><td>${who({ ...r.rider, headshot: r.robloxAvatar }, r.roblox)}</td><td>${r.driver ? who(r.driver, r.driver.roblox) : '<span class="muted">—</span>'}</td><td class="wrap-cell">${esc(r.pickup)} → ${esc(r.dropoff)}</td><td>${BSU.CLASS_NAMES[r.class]}</td><td>${BSU.statusBadge(r.status)}</td><td style="text-align:right">${r.fare != null ? money(r.fare) : `<span class="muted">~${money(r.quote?.estimate)}</span>`}</td></tr>`).join('')}
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
          <div style="display:flex;gap:8px;flex-wrap:wrap">${BSU.statusBadge(r.status)}<span class="badge">${BSU.CLASS_NAMES[r.class]}</span><span class="badge">${BSU.paxLabel(r)}</span></div>
          <dl class="kv">
            <dt>Rider</dt><dd>${esc(r.rider.name)} <span class="muted">@${esc(r.rider.username)}</span><br><button class="copy-btn" data-copy="${esc(r.rider.id)}">${esc(r.rider.id)} ${I.copy}</button></dd>
            <dt>Roblox</dt><dd><button class="copy-btn" data-copy="${esc(r.roblox)}">${esc(r.roblox)} ${I.copy}</button></dd>
            <dt>Pickup</dt><dd>${esc(r.pickup)}${r.pickupPostal ? ` · ${esc(r.pickupPostal)}` : ''}</dd>
            <dt>Drop-off</dt><dd>${esc(r.dropoff)}${r.dropoffPostal ? ` · ${esc(r.dropoffPostal)}` : ''}</dd>
            <dt>Quote</dt><dd>${money(r.quote?.min)} – ${money(r.quote?.max)} (est. ${money(r.quote?.estimate)})</dd>
            ${r.order ? `<dt>Order</dt><dd>${esc(r.order)}</dd>` : ''}
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
    accepting: s.accepting, requireGuild: s.requireGuild, requireInGame: s.requireInGame, requireRobloxLink: s.requireRobloxLink, pay: s.pay, announcement: s.announcement, discordInvite: s.discordInvite, serverCode: s.serverCode, maxPassengers: s.maxPassengers,
    prices: s.prices,
    trips: s.trips,
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
        <div class="set-row"><div><b>Require a linked Roblox account</b><span>${D.system.dock ? 'Riders link through Dock on their dashboard and must request as that account.' : 'Needs DOCK_API_KEY. Ignored until it is set.'}</span></div><label class="switch"><input type="checkbox" id="s-rbx" ${s.requireRobloxLink ? 'checked' : ''}><span></span></label></div>
        <h3 style="font-size:16px;margin:22px 0 4px">Driver pay</h3>
        <p class="muted" style="font-size:13.5px">Used for estimated paystubs, payroll and money analytics.</p>
        <div class="field-row"><div class="field"><label for="s-rate">Driver share of fares %</label><input class="input" id="s-rate" type="number" min="0" max="100" step="1" value="${s.pay?.rate ?? 70}"></div>
          <div class="field"><label for="s-hourly">Hourly pay on shift $ <small>0 = off</small></label><input class="input" id="s-hourly" type="number" min="0" step="1" value="${s.pay?.hourly ?? 0}"></div></div>
        <div class="field" style="margin-top:16px"><label for="s-pax">Max passengers per ride</label><input class="input" id="s-pax" type="number" min="1" max="8" value="${s.maxPassengers}"></div>
        <div class="field"><label for="s-ann">Announcement banner <small>shown on every public page</small></label><input class="input" id="s-ann" maxlength="200" value="${esc(s.announcement || '')}" placeholder="e.g. Double drivers on duty this weekend!"></div>
        <div class="field"><label for="s-invite">Discord invite link</label><input class="input" id="s-invite" maxlength="120" value="${esc(s.discordInvite || '')}" placeholder="https://discord.gg/yourcode"></div>
        <div class="field"><label for="s-code">ER:LC server code <small>shown in the footer</small></label><input class="input mono" id="s-code" maxlength="20" value="${esc(s.serverCode || '')}" placeholder="BigSky"></div>
      </div>
      <div class="card pad-lg">
        <h3 style="font-size:18px;margin-bottom:6px">Big Sky Economy prices</h3>
        <p class="muted" style="font-size:14px">In-game dollars, any amount. Riders see the price for their class and trip length. Drivers set the final fare inside the range; leave the range blank to use the cheapest to the dearest trip.</p>
        ${CLASSES.map((c) => { const p = s.prices[c]; return `<div class="price-block">
          <div class="price-head"><label class="check"><input type="checkbox" data-p-en="${c}" ${p.enabled ? 'checked' : ''}><span>On</span></label>
            <input class="input" data-p-name="${c}" maxlength="30" value="${esc(p.name)}" placeholder="Class name" aria-label="Class name">
            <input class="input" data-p-tag="${c}" maxlength="80" value="${esc(p.tagline || '')}" placeholder="Tagline" aria-label="Tagline"></div>
          <div class="price-fares">
            ${TRIP_KEYS.map((k) => `<div class="field"><label>${esc(s.trips[k].label)} $</label><input class="input" type="number" min="0" step="1" data-p-fare="${c}:${k}" value="${p.fares[k]}"></div>`).join('')}
            <div class="field"><label>Range min $</label><input class="input" type="number" min="0" step="1" data-p-min="${c}" value="${p.min}"></div>
            <div class="field"><label>Range max $</label><input class="input" type="number" min="0" step="1" data-p-max="${c}" value="${p.max}"></div>
          </div></div>`; }).join('')}
        <h3 style="font-size:16px;margin:22px 0 4px">Trip lengths</h3>
        <p class="muted" style="font-size:14px">The names riders pick from.</p>
        ${TRIP_KEYS.map((k) => `<div class="price-fares two"><div class="field"><label>Label</label><input class="input" data-t-label="${k}" maxlength="24" value="${esc(s.trips[k].label)}"></div><div class="field"><label>Hint</label><input class="input" data-t-hint="${k}" maxlength="40" value="${esc(s.trips[k].hint || '')}"></div></div>`).join('')}
      </div>
    </div>
    <div style="display:flex;gap:10px;margin-top:18px"><button class="btn" type="submit">Save settings</button><button class="btn ghost" type="button" id="s-reset">Reset prices to default</button></div></form>`;
    $('#s-reset').addEventListener('click', () => {
      CLASSES.forEach((c) => {
        const d = DEFAULT_FARES[c];
        if (!d) return;
        TRIP_KEYS.forEach((k, i) => ($(`[data-p-fare="${c}:${k}"]`).value = d[i]));
        $(`[data-p-min="${c}"]`).value = d[0];
        $(`[data-p-max="${c}"]`).value = d[2];
      });
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
          requireRobloxLink: $('#s-rbx').checked,
          pay: { rate: Number($('#s-rate').value), hourly: Number($('#s-hourly').value) || 0 },
          maxPassengers: Number($('#s-pax').value),
          announcement: $('#s-ann').value.trim(),
          discordInvite: $('#s-invite').value.trim(),
          serverCode: $('#s-code').value.trim(),
          prices: Object.fromEntries(CLASSES.map((c) => [c, {
            enabled: $(`[data-p-en="${c}"]`).checked,
            name: $(`[data-p-name="${c}"]`).value.trim(),
            tagline: $(`[data-p-tag="${c}"]`).value.trim(),
            fares: Object.fromEntries(TRIP_KEYS.map((k) => [k, Number($(`[data-p-fare="${c}:${k}"]`).value)])),
            min: $(`[data-p-min="${c}"]`).value.trim(),
            max: $(`[data-p-max="${c}"]`).value.trim(),
          }])),
          trips: Object.fromEntries(TRIP_KEYS.map((k) => [k, { label: $(`[data-t-label="${k}"]`).value.trim(), hint: $(`[data-t-hint="${k}"]`).value.trim() }])),
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
      ['UBERBIGSKY', sys.apiKey, 'API key for your Discord bot'],
      ['DOCK_API_KEY', sys.dock, 'Optional · Roblox linking via Dock'],
      ['DOCK_PID', sys.dockVerify, 'Optional · lets unlinked users verify through Dock'],
      ['ERLC_API_KEY', sys.erlc && sys.erlcOk, !sys.erlc ? 'Optional · live ER:LC server data' : sys.erlcState === 'badkey' ? 'Set, but ER:LC rejected the key' : sys.erlcOk ? 'Connected · server online' : 'Set · server offline or not answering (in-game check paused)'],
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
          ['/api/v1/shifts', '?driver=&active=true&since= · shift log + minutes'],
          ['/api/v1/paystubs', '?driver=&limit= · issued paystubs (or /:id)'],
          ['/api/v1/links/:id', 'Linked Roblox account by Discord ID or Roblox name'],
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
    if ((b = t.closest('[data-issue]'))) return issueModal(b.dataset.issue);
    if ((b = t.closest('[data-viewstub]'))) return stubView(b.dataset.viewstub);
    if ((b = t.closest('[data-voidstub]'))) { if (await BSU.confirm('Void this paystub?', 'The driver is notified. You can issue a new one for the same period afterwards.', 'Void')) { await act(() => post('paystubVoid', { id: b.dataset.voidstub }), 'Paystub voided'); loadPayroll(); } return; }
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
