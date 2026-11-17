(() => {
  const { $, $$, esc, money, icon: I } = BSU;
  const box = $('#dash');
  box.innerHTML = BSU.skel.tiles(4) + `<div class="dash-grid"><div>${BSU.skel.table(5, 3)}</div><div>${BSU.skel.list(3)}</div></div>`;
  let D = null;
  let linkTimer = null;

  const tile = (label, value, sub, white) => `<div class="tile ${white ? 'white' : ''}"><small>${label}</small><b>${value}</b><div class="sub">${sub}</div></div>`;
  const since = (t) => (t ? new Date(t).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '—');

  /** Linked accounts: Discord (how you sign in) and Roblox (who drivers pick up). */
  function robloxCard() {
    const r = D.roblox, v = D.viewer;
    const discord = `<div class="acct">
        <img src="${esc(v.avatar)}" alt="">
        <span><small>${I.discord}Discord</small><b>${esc(v.name)}</b><span>@${esc(v.username)}</span></span>
        <button class="acct-id" data-copy="${esc(v.id)}" title="Copy Discord ID">${esc(v.id)}</button>
      </div>`;
    let roblox;
    if (r) {
      roblox = `<div class="acct">
          ${r.avatar ? `<img class="rbx-face" src="${esc(r.avatar)}" alt="">` : `<span class="rbx-ph">${esc((r.name || '?')[0])}</span>`}
          <span><small>${I.link}Roblox</small><b>${esc(r.displayName || r.name || 'Linked')}</b><span>@${esc(r.name || r.id)} · linked ${BSU.ago(r.linkedAt)}</span></span>
          <a class="acct-id" href="https://www.roblox.com/users/${encodeURIComponent(r.id)}/profile" target="_blank" rel="noopener" title="Open Roblox profile">${esc(r.id)}</a>
        </div>
        <div class="acct-foot"><span class="badge green">Verified with Dock</span>
          <span class="acct-actions"><button class="btn xs ghost" id="rbx-refresh">Refresh</button><button class="btn xs ghost" id="rbx-unlink">Unlink</button></span></div>
        <p class="hint" style="margin-top:10px">${D.requireRobloxLink ? 'Rides and orders must use this account.' : 'We fill this in for you when you request a ride or order food.'}</p>`;
    } else if (!D.dock.configured) {
      roblox = `<div class="acct empty-acct"><span class="rbx-ph">?</span><span><small>${I.link}Roblox</small><b>Not linked</b><span>Linking isn’t switched on yet. Type your Roblox username when you request.</span></span></div>`;
    } else {
      roblox = `<div class="acct empty-acct"><span class="rbx-ph">?</span><span><small>${I.link}Roblox</small><b>Not linked</b><span>${D.requireRobloxLink ? 'Required before you can request rides or food.' : 'Link it so drivers know exactly who to pick up.'}</span></span></div>
        <div id="rbx-state">${D.linkPending ? pendingHtml(D.linkPending.verifyUrl) : ''}</div>
        <button class="btn block" id="rbx-link" style="margin-top:14px">${I.link}Link Roblox with Dock</button>
        <p class="hint" style="margin-top:10px">Uses <a href="https://docksys.xyz" target="_blank" rel="noopener">Dock</a>. If you’ve already verified with Dock in our Discord, it links straight away.</p>`;
    }
    return `<section class="card pad-lg dash-card" id="accounts"><h3>${I.link}Linked accounts</h3>${discord}${roblox}</section>`;
  }
  const pendingHtml = (url) => `<div class="notice" style="margin-top:14px">${I.info}<span>Finish verifying on Dock, then come back. <a href="${esc(url)}" target="_blank" rel="noopener">Open Dock verification</a>. We’ll check automatically.</span></div>`;

  function rideRow(r) {
    return `<div class="ride-item">
      <span class="ic">${r.class === 'eats' ? I.bag : r.status === 'completed' ? I.check : r.status === 'cancelled' ? I.x : I.car}</span>
      <div><b>${esc(r.pickup)} → ${esc(r.dropoff)}</b>
        <div class="meta"><span class="mono">${esc(r.id)}</span><span>${BSU.CLASS_NAMES[r.class]}</span><span>${BSU.date(r.createdAt)}</span>${r.driver ? `<span class="with">${BSU.face(r.driver.headshot, r.driver.avatar)}with ${esc(r.driver.roblox || r.driver.name)}</span>` : ''}</div></div>
      <div class="right">${BSU.statusBadge(r.status)}${r.fare != null ? `<b>${money(r.fare)}</b>` : ''}
        ${r.status === 'completed' && !r.reviewed ? `<a class="btn xs" href="/reviews?ride=${encodeURIComponent(r.id)}#write">${I.starLine}Rate</a>` : ''}</div>
    </div>`;
  }

  function payHtml() {
    const p = D.pay;
    if (!p) return '';
    const est = p.estimate, last = p.lastWeek;
    return `<section id="pay" class="dash-pay">
      <div class="section-head" style="margin:46px 0 18px"><h2 class="h3">${I.wallet}Pay</h2>
        <p class="muted" style="margin-top:6px">You keep ${p.config.rate}% of the fares you collect${p.config.hourly ? `, plus ${money(p.config.hourly)} an hour on shift` : ''}. Staff issue paystubs after each week (Monday to Sunday, UTC).</p></div>
      <div class="pay-grid">
        <div>${BSU.paystub(est, { estimate: true, name: D.viewer.name })}</div>
        <div class="pay-side">
          <div class="tiles" style="grid-template-columns:1fr 1fr;margin:0">
            ${tile('This week so far', money(est.total), `${est.trips} trips · ${est.hours}h on shift`, true)}
            ${tile('Last week', money(last.total), `${last.trips} trips · before bonuses`)}
          </div>
          <h3 class="pane-title" style="margin-top:22px">Paystubs</h3>
          ${p.paystubs.length ? `<div class="stub-list">${p.paystubs.map((s) => `<button class="stub-row" data-stub="${esc(s.id)}"><span><b>#${s.number}</b><span>${BSU.period(s.periodStart, s.periodEnd)}</span></span><span>${s.trips} trips</span><b>${money(s.net)}</b></button>`).join('')}</div>`
            : '<div class="empty"><b>No paystubs yet</b>Your first one shows up here after staff issue it.</div>'}
        </div>
      </div>
    </section>`;
  }

  function render() {
    const v = D.viewer, rd = D.rider;
    $('#dash-hello').textContent = `Hey, ${v.name}.`;
    $('#dash-sub').textContent = [D.access.admin ? 'Admin' : D.access.worker ? 'Driver' : 'Rider', D.member.firstSeen ? `member since ${since(D.member.firstSeen)}` : null, D.roblox?.name ? `Roblox: ${D.roblox.name}` : null].filter(Boolean).join(' · ');
    box.innerHTML = `
      <div class="tiles">
        ${tile('Rides', rd.rides, 'completed trips', true)}
        ${tile('Uber Eats', rd.orders, 'orders delivered')}
        ${tile('Spent', money(rd.spent), 'in-game cash')}
        ${D.driver ? tile('Driven', D.driver.totalRides, `${money(D.driver.earned)} in fares`) : tile('Cancelled', rd.cancelled, 'rides and orders')}
      </div>
      <div class="dash-grid">
        <div>
          ${rd.active ? `<a class="card pad-lg dash-active" href="${rd.active.class === 'eats' ? '/eats' : '/ride'}">
            <span class="eyebrow"><span class="dot ${rd.active.status === 'pending' ? 'amber' : 'green'} pulse"></span>${esc(BSU.STATUS[rd.active.status].label)}</span>
            <b>${esc(rd.active.pickup)} → ${esc(rd.active.dropoff)}</b><span class="muted">${BSU.CLASS_NAMES[rd.active.class]} · ${esc(rd.active.id)} · track live ${I.arrow || '→'}</span></a>` : ''}
          <section class="card pad-lg dash-card"><h3>${I.clock}Recent rides & orders</h3>
            ${rd.recent.length ? `<div class="ride-list">${rd.recent.map(rideRow).join('')}</div>` : '<div class="empty"><b>Nothing yet</b><a href="/ride">Request your first ride</a> or <a href="/eats">order food</a>.</div>'}
          </section>
        </div>
        <div>
          ${robloxCard()}
          <section class="card pad-lg dash-card" id="notifications"><h3>${I.bell}Notifications${D.notifications.unread ? ` <span class="badge white">${D.notifications.unread} new</span>` : ''}</h3>
            ${D.notifications.items.length ? `<div class="bell-list dash-notifs">${D.notifications.items.map((n) => BSU.notifRow({ ...n, unread: n.at > D.notifications.seenAt })).join('')}</div>` : '<div class="notif-empty">No notifications yet. Ride updates, paystubs and news from staff show up here.</div>'}
            ${'Notification' in window && Notification.permission === 'default' ? `<button class="btn sm ghost block" id="dash-desktop" style="margin-top:12px">${I.bell}Turn on desktop alerts</button>` : ''}
          </section>
        </div>
      </div>
      ${payHtml()}`;
    BSU.reveal(box);
    if (D.notifications.unread) setTimeout(() => BSU.markNotificationsRead?.(), 1500);
    if (D.linkPending) watchLink();
    if (['#pay', '#notifications', '#accounts'].includes(location.hash)) setTimeout(() => $(location.hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  }

  async function load() {
    try { D = await BSU.api('/api/me?op=dashboard', { quiet: true }); }
    catch (e) {
      if (e.status === 401) {
        $('#dash-sub').textContent = 'Sign in to see your rides, orders and notifications.';
        box.innerHTML = `<div class="card pad-lg" style="max-width:520px;text-align:center;margin:0 auto"><h3 class="h3">Sign in to continue</h3><p class="muted" style="margin:10px 0 20px">Your dashboard shows your rides, Uber Eats orders, notifications and, for drivers, your pay.</p><a class="btn discord block" href="${BSU.loginUrl('/dashboard')}">${I.discord}Sign in with Discord</a></div>`;
      } else box.innerHTML = `<div class="empty"><b>Couldn’t load your dashboard</b>${esc(e.message || 'Try again in a moment.')}</div>`;
      return;
    }
    render();
  }

  /* Roblox linking (Dock) */
  function watchLink() {
    clearTimeout(linkTimer);
    let tries = 0;
    const tick = async () => {
      if (tries++ > 60) return;
      try {
        const r = await BSU.api('/api/me?op=linkCheck', { method: 'POST', body: {}, quiet: true });
        if (r.linked) { BSU.toast(`Linked to ${r.roblox.name}`, 'ok'); return load(); }
        if (r.status === 'expired' || r.status === 'cancelled') { BSU.toast('That Dock verification expired. Start again.', 'error'); return load(); }
      } catch {}
      linkTimer = setTimeout(tick, document.hidden ? 8000 : 4000);
    };
    linkTimer = setTimeout(tick, 3000);
  }

  document.addEventListener('click', async (e) => {
    const t = e.target;
    const cp = t.closest('[data-copy]');
    if (cp) { try { await navigator.clipboard.writeText(cp.dataset.copy); BSU.toast('Copied', 'ok'); } catch {} return; }
    if (t.closest('#rbx-link')) {
      const b = t.closest('#rbx-link');
      b.classList.add('loading');
      try {
        const r = await BSU.api('/api/me?op=link', { method: 'POST', body: {} });
        if (r.linked) { BSU.toast(`Linked to ${r.roblox.name}`, 'ok'); load(); }
        else if (r.verifyUrl) { $('#rbx-state').innerHTML = pendingHtml(r.verifyUrl); open(r.verifyUrl, '_blank', 'noopener'); watchLink(); }
        else if (r.message) $('#rbx-state').innerHTML = `<div class="notice" style="margin-top:14px">${I.info}<span>${esc(r.message)}</span></div>`;
      } catch {} finally { b.classList.remove('loading'); }
    }
    if (t.closest('#rbx-refresh')) { try { const r = await BSU.api('/api/me?op=link', { method: 'POST', body: {} }); if (r.linked) BSU.toast('Roblox account refreshed', 'ok'); load(); } catch {} }
    if (t.closest('#rbx-unlink')) { if (await BSU.confirm('Unlink Roblox?', 'You can link again any time.', 'Unlink')) { try { await BSU.api('/api/me?op=unlink', { method: 'POST', body: {} }); load(); } catch {} } }
    if (t.closest('#dash-desktop')) { try { await Notification.requestPermission(); } catch {} t.closest('#dash-desktop').remove(); }
    const sb = t.closest('[data-stub]');
    if (sb) {
      const s = D.pay.paystubs.find((x) => x.id === sb.dataset.stub);
      const html = BSU.paystub(s);
      BSU.modal({ title: `Paystub #${s.number}`, wide: true, body: html, actions: [{ label: 'Close' }, { label: 'Print', kind: 'ghost', onClick: () => { BSU.printStub(html); return false; } }] });
    }
  });

  document.addEventListener('bsu:notifications', () => load());
  BSU.boot.then(() => load());
})();
