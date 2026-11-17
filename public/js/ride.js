(() => {
  const { $, $$, esc, money, icon: I } = BSU;
  const form = $('#ride-form');
  const EATS = document.body.dataset.mode === 'eats';
  const CLASSES = EATS ? ['eats'] : ['uber', 'premium', 'black'];
  const HERE = EATS ? '/eats' : '/ride';
  const ACTIVE = ['pending', 'accepted', 'enroute', 'arrived', 'inprogress'];
  let linkedRoblox = null;
  let dockOn = false;
  let settings, viewer, pax = 1, rides = [], pollTimer, mapApi, mapAnim;

  /* ---------- Phone ---------- */
  $('#ride-phone').innerHTML = BSU.phone({ sheet: '', top: '<div class="phone-search"><i></i><span data-ph-to>Where to?</span></div>' });
  const sheet = $('#ride-phone [data-phone-sheet]');
  mapApi = BSUMap.mount($('#ride-phone [data-phone-map]'), { seed: 77, progress: 0.3, area: 'city', from: 'Your pickup', to: 'Destination', safeBottom: 380 });

  // Animate the map between two progress points (used for live status changes).
  function animateMap(from, to, ms = 2200, loop = false) {
    cancelAnimationFrame(mapAnim);
    const start = performance.now();
    const step = (now) => {
      let p = (now - start) / ms;
      if (loop) p %= 1; else p = Math.min(1, p);
      mapApi.setProgress(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      if (loop || p < 1) mapAnim = requestAnimationFrame(step);
    };
    mapAnim = requestAnimationFrame(step);
  }

  function previewSheet() {
    if (!settings) return;
    const cls = form.elements.class?.value || 'uber';
    const q = estimate();
    const to = $('#dropoff').value.trim();
    $('[data-ph-to]').textContent = to ? `To ${to}` : 'Where to?';
    const pk = $('#pickup').value.trim();
    mapApi.setLabels(pk ? withPostal(pk, $('#pickupPostal').value) : 'Your pickup', to ? withPostal(to, $('#dropoffPostal').value) : 'Destination');
    sheet.innerHTML = `<div class="grab"></div>
      <div class="sheet-sub" style="margin-bottom:8px">${esc($('#pickup').value.trim() || (EATS ? 'Pick a restaurant' : 'Set your pickup'))}${$('#pickupPostal').value ? ' · Postal ' + esc($('#pickupPostal').value) : ''}</div>
      <div class="sheet-classes">${CLASSES.filter((c) => settings.prices[c].enabled).map((c) => `<div class="sheet-class ${c === cls ? 'on' : ''}">${BSU.car(c)}<span><b>${BSU.CLASS_NAMES[c]}</b><span>${EATS ? 'Delivery' : `${pax} rider${pax > 1 ? 's' : ''}`}</span></span><em>${c === cls ? money(q.estimate) : money(settings.prices[c].min) + '+'}</em></div>`).join('')}</div>
      <div class="sheet-cta">${EATS ? 'Place order' : `Request ${BSU.CLASS_NAMES[cls]}`}</div>`;
  }

  const withPostal = (name, postal) => (postal ? `${postal} · ${name}` : BSUMap.pinText(name));

  function trackSheet(r) {
    const st = BSU.STATUS[r.status];
    const d = r.driver;
    const head = r.class === 'eats' ? {
      pending: ['Finding a courier', 'Drivers are being notified'],
      accepted: [`${esc(d?.name || 'Courier')} accepted`, `Heading to ${esc(r.pickup)}`],
      enroute: ['Picking up your order', `At ${esc(r.pickup)}`],
      arrived: ['Order picked up', 'Your food is in the car'],
      inprogress: ['On the way to you', `To ${esc(r.dropoff)}`],
      completed: ['Delivered', r.fare != null ? `Fee ${money(r.fare)} · paid in-game` : 'Enjoy your food'],
      cancelled: ['Order cancelled', esc(r.cancelReason || '')],
    }[r.status] : {
      pending: ['Finding your driver', 'Hang tight, drivers are being notified'],
      accepted: [`${esc(d?.name || 'Driver')} accepted`, 'Getting ready to head your way'],
      enroute: ['On the way', `Heading to ${esc(r.pickup)}`],
      arrived: ['Driver is outside', `At ${esc(r.pickup)}${r.pickupPostal ? ' · ' + esc(r.pickupPostal) : ''}`],
      inprogress: ['On trip', `To ${esc(r.dropoff)}`],
      completed: ['You’ve arrived', r.fare != null ? `Fare ${money(r.fare)} · paid in-game` : 'Thanks for riding'],
      cancelled: ['Ride cancelled', esc(r.cancelReason || '')],
    }[r.status];
    $('[data-ph-to]').textContent = `To ${r.dropoff}`;
    mapApi.setLabels(withPostal(r.pickup, r.pickupPostal), withPostal(r.dropoff, r.dropoffPostal));
    sheet.innerHTML = `<div class="grab"></div>
      <div class="sheet-eta" style="font-size:calc(var(--w)*.07)">${head[0]}</div>
      <div class="sheet-sub" style="margin-top:4px">${head[1]}</div>
      ${d ? `<div class="sheet-driver" style="margin-top:12px"><span class="av">${BSU.face(d.headshot, d.avatar)}</span><span><b>${esc(d.roblox || d.name)}</b><span>${esc(d.vehicle || 'Big Sky driver')}</span></span>${d.callsign ? `<span class="sheet-plate">${esc(d.callsign)}</span>` : ''}</div>` : ''}
      <div class="track-steps">${[0, 1, 2, 3, 4].map((i) => `<i class="${st.step >= i ? 'on' : ''}"></i>`).join('')}</div>`;
    const map = { pending: [0, 0.3, 2600, true], accepted: [0.3, 0.35], enroute: [0.35, 0.7, 4000], arrived: [0.7, 0.72], inprogress: [0.72, 0.95, 6000], completed: [0.95, 1], cancelled: [0, 0] };
    const [a, b, ms, loop] = map[r.status];
    animateMap(a, b, ms, loop);
  }

  /* ---------- Form ---------- */
  function estimate() {
    const cls = form.elements.class?.value || 'uber';
    const trip = form.elements.trip?.value || 'town';
    const p = settings.prices[cls];
    return { min: p.min, max: p.max, estimate: p.fares?.[trip] ?? p.min };
  }
  function updateEstimate() {
    const q = estimate();
    $('#est').textContent = money(q.estimate);
    $('#est-range').textContent = `Range ${money(q.min)} – ${money(q.max)}`;
    previewSheet();
  }

  function buildForm() {
    const want = new URLSearchParams(location.search).get('class');
    const first = CLASSES.find((c) => c === want && settings.prices[c].enabled) || CLASSES.find((c) => settings.prices[c].enabled);
    $('#class-pick').innerHTML = CLASSES.map((c) => {
      const p = settings.prices[c];
      return `<div class="class-opt"><input type="radio" name="class" id="c-${c}" value="${c}" ${c === first ? 'checked' : ''} ${p.enabled ? '' : 'disabled'}>
        <label for="c-${c}">${BSU.car(c)}<span><b>${esc(p.name)}</b><span>${p.enabled ? esc(p.tagline || '') : 'Not available right now'}</span></span><em>${money(p.fares.local)}+<small>per trip</small></em></label></div>`;
    }).join('');
    const trips = settings.trips || {};
    $('#trip-seg').innerHTML = Object.entries(trips).map(([k, t]) => `<input type="radio" name="trip" id="t-${k}" value="${k}" ${k === 'town' ? 'checked' : ''}><label for="t-${k}">${esc(t.label)}<small>${esc(t.hint || '')}</small></label>`).join('');
    BSU.seg($('#trip-seg'));
    if (dockOn) {
      // Roblox account comes from the Dock link: no typing.
      $('#roblox-input').hidden = true;
      $('#roblox').required = false;
      $('#roblox-label').textContent = 'Roblox account';
      $('#rbx-acct').hidden = false;
      if (viewer) BSU.robloxAccount($('#rbx-acct'), { linked: linkedRoblox, onChange: (r) => { linkedRoblox = r; } });
      else $('#rbx-acct').innerHTML = '<div class="rbx-acct unlinked"><span class="ph">?</span><span><b>Sign in first</b><span>We use the Roblox account you linked with Dock.</span></span></div>';
    } else {
      try { $('#roblox').value = localStorage.getItem('bsu_roblox') || ''; } catch {}
      if (linkedRoblox?.name) $('#roblox').value = linkedRoblox.name;
    }
    form.addEventListener('input', updateEstimate);
    form.addEventListener('change', updateEstimate);
    $$('[data-step]', form).forEach((b) => b.addEventListener('click', () => {
      pax = Math.max(1, Math.min(settings.maxPassengers || 4, pax + Number(b.dataset.step)));
      $('#pax').textContent = pax;
      previewSheet();
    }));
    $$('#pickupPostal, #dropoffPostal').forEach((i) => i.addEventListener('input', () => (i.value = i.value.replace(/\D/g, '').slice(0, 5))));
    // ER:LC landmark suggestions; picking one fills in its postal.
    if ($('#food-places')) $('#food-places').innerHTML = BSU.FOOD_SPOTS.map((n) => { const l = BSUMap.findLocation(n); return `<option value="${esc(n)}">${esc(l?.postal ? 'Postal ' + l.postal : '')}</option>`; }).join('');
    $('#erlc-places').innerHTML = BSUMap.LOCATIONS.map((l) => `<option value="${esc(l.name)}">${esc([l.postal && 'Postal ' + l.postal, l.street, BSUMap.AREAS[l.area].label].filter(Boolean).join(' · '))}</option>`).join('');
    [['#pickup', '#pickupPostal'], ['#dropoff', '#dropoffPostal']].forEach(([f, p]) => $(f).addEventListener('change', () => {
      const loc = BSUMap.findLocation($(f).value);
      if (loc?.postal) { $(p).value = loc.postal; updateEstimate(); }
    }));
    updateEstimate();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!viewer) return (location.href = BSU.loginUrl(HERE));
    const body = {
      roblox: dockOn ? (linkedRoblox?.name || '') : $('#roblox').value.trim(),
      pickup: $('#pickup').value.trim(),
      pickupPostal: $('#pickupPostal').value.trim(),
      dropoff: $('#dropoff').value.trim(),
      dropoffPostal: $('#dropoffPostal').value.trim(),
      class: form.elements.class.value,
      trip: form.elements.trip.value,
      passengers: pax,
      notes: $('#notes').value.trim(),
      ...(EATS ? { order: $('#order').value.trim() } : {}),
      agree: $('#agree').checked,
    };
    if (dockOn && !linkedRoblox?.name) { BSU.toast('Link your Roblox account with Dock first.', 'error'); return $('#rbx-acct').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    if (!dockOn && !/^[A-Za-z0-9_]{3,20}$/.test(body.roblox)) { BSU.toast('Enter your exact Roblox username.', 'error'); return $('#roblox').focus(); }
    if (body.pickup.length < 2) { BSU.toast(EATS ? 'Which restaurant or store is it from?' : 'Where should we pick you up?', 'error'); return $('#pickup').focus(); }
    if (EATS && body.order.length < 2) { BSU.toast('What would you like? Add your order.', 'error'); return $('#order').focus(); }
    if (body.dropoff.length < 2) { BSU.toast(EATS ? 'Where should we deliver it?' : 'Where are you headed?', 'error'); return $('#dropoff').focus(); }
    if (!body.agree) return BSU.toast('Please agree to the rider guidelines.', 'error');
    const btn = $('#submit');
    btn.classList.add('loading');
    try {
      if (!dockOn) try { localStorage.setItem('bsu_roblox', body.roblox); } catch {}
      await BSU.api('/api/site?op=request', { method: 'POST', body });
      BSU.toast(EATS ? 'Order placed. Finding you a courier…' : 'Ride requested. Finding you a driver…', 'ok');
      if (EATS) $('#order').value = '';
      await loadRides();
      scrollTo({ top: 0, behavior: 'smooth' });
    } catch {} finally { btn.classList.remove('loading'); }
  });

  /* ---------- Active ride + history ---------- */
  function renderActive(r) {
    const box = $('#active-ride');
    $('#ride-locked').hidden = Boolean(r);
    box.hidden = !r;
    $('#phone-caption').textContent = r ? `Live · updates every few seconds · ${r.id}` : EATS ? 'Live preview of your delivery.' : 'Live preview of your trip.';
    if (!r) { previewSheet(); return; }
    const st = BSU.STATUS[r.status];
    const d = r.driver;
    box.innerHTML = `<div class="card pad-lg reveal in">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">
        <span class="eyebrow"><span class="dot ${r.status === 'pending' ? 'amber' : 'green'} pulse"></span>${st.label}</span>
        <span class="mono muted">${esc(r.id)}</span>
      </div>
      <h2 class="h3" style="margin-top:20px">${esc(r.pickup)} → ${esc(r.dropoff)}</h2>
      <p class="muted" style="margin-top:6px">${BSU.CLASS_NAMES[r.class]} · ${BSU.paxLabel(r)} · as <b style="color:var(--text)">${esc(r.roblox)}</b> · requested ${BSU.ago(r.createdAt)}</p>
      ${r.order ? `<div class="req-note" style="margin-top:16px"><b>Order:</b> ${esc(r.order)}</div>` : ''}
      <div class="track-steps" style="margin-top:22px">${[0, 1, 2, 3, 4].map((i) => `<i class="${st.step >= i ? 'on' : ''}"></i>`).join('')}</div>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-4);margin-top:8px">${r.class === 'eats' ? '<span>Ordered</span><span>Matched</span><span>At store</span><span>Picked up</span><span>On the way</span>' : '<span>Requested</span><span>Matched</span><span>On the way</span><span>Arrived</span><span>On trip</span>'}</div>
      ${d ? `<div class="driver-chip" style="margin-top:24px">${BSU.face(d.headshot, d.avatar)}<span><b>${esc(d.name)}</b><span>Roblox: <span class="mono">${esc(d.roblox || '—')}</span>${d.vehicle ? ' · ' + esc(d.vehicle) : ''}</span></span>${d.callsign ? `<span class="badge white mono">${esc(d.callsign)}</span>` : ''}</div>` : `<div class="notice" style="margin-top:24px">${I.info}<span>${r.class === 'eats' ? `Your order is in the queue. Be at <b>${esc(r.dropoff)}</b> in-game when it arrives.` : `Your request is in the queue. Stay near <b>${esc(r.pickup)}</b> in-game. Drivers see your Roblox username and notes.`}</span></div>`}
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:24px;flex-wrap:wrap">
        <div><div class="muted" style="font-size:13px">${r.class === 'eats' ? 'Delivery fee' : 'Estimated fare'}</div><div style="font:800 28px/1.1 var(--font-display);letter-spacing:-.04em">${money(r.quote.estimate)}</div></div>
        ${['pending', 'accepted', 'enroute', 'arrived'].includes(r.status) ? `<button class="btn sm danger" id="cancel-ride">${I.x}${r.class === 'eats' ? 'Cancel order' : 'Cancel ride'}</button>` : ''}
      </div>
    </div>`;
    trackSheet(r);
    $('#cancel-ride')?.addEventListener('click', async () => {
      if (!(await BSU.confirm(r.class === 'eats' ? 'Cancel this order?' : 'Cancel this ride?', 'Your driver will be told it is off.', r.class === 'eats' ? 'Cancel order' : 'Cancel ride'))) return;
      try { await BSU.api('/api/site?op=cancel', { method: 'POST', body: { id: r.id } }); BSU.toast('Ride cancelled.'); loadRides(); } catch {}
    });
  }

  function renderHistory() {
    const list = $('#ride-list');
    const past = rides.filter((r) => !ACTIVE.includes(r.status));
    if (!rides.length) { list.innerHTML = '<div class="empty"><b>No rides yet</b>Your trips will show up here.</div>'; return; }
    if (!past.length) { list.innerHTML = '<div class="empty">Your finished trips will show up here.</div>'; return; }
    list.innerHTML = past.map((r) => `<div class="ride-item">
      <span class="ic">${r.status === 'completed' ? I.check : I.x}</span>
      <div><b>${esc(r.pickup)} → ${esc(r.dropoff)}</b>
        <div class="meta"><span class="mono">${esc(r.id)}</span><span>${BSU.CLASS_NAMES[r.class]}</span><span>${BSU.date(r.createdAt)}</span>${r.driver ? `<span>with ${esc(r.driver.name)}</span>` : ''}</div></div>
      <div class="right">${BSU.statusBadge(r.status)}${r.fare != null ? `<b>${money(r.fare)}</b>` : ''}
        ${r.status === 'completed' ? (r.reviewed ? '<span class="badge">Rated</span>' : `<a class="btn xs" href="/reviews?ride=${encodeURIComponent(r.id)}#write">${I.starLine}Rate</a>`) : ''}</div>
    </div>`).join('');
  }

  async function loadRides() {
    try {
      ({ rides } = await BSU.api('/api/site?op=myrides', { quiet: true }));
    } catch { return; }
    const active = rides.find((r) => ACTIVE.includes(r.status));
    renderActive(active);
    renderHistory();
    clearTimeout(pollTimer);
    if (active) pollTimer = setTimeout(() => { if (!document.hidden) loadRides(); else pollTimer = setTimeout(loadRides, 3000); }, 7000);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && viewer) loadRides(); });

  /* ---------- Boot ---------- */
  BSU.boot.then((data) => {
    settings = data.settings;
    viewer = data.viewer;
    linkedRoblox = data.roblox;
    dockOn = Boolean(data.dock);
    buildForm();
    const notice = $('#ride-notice');
    const notes = [];
    if (!settings.accepting) notes.push(`<div class="notice amber" style="margin-bottom:16px">${I.alert}<span><b>Dispatch is closed right now.</b> You can fill in the form, but requests are paused until staff reopen.</span></div>`);
    if (viewer && settings.requireGuild && data.guildConfigured && !data.inGuild) notes.push(`<div class="notice red" style="margin-bottom:16px">${I.alert}<span>You need to be in the Big Sky Discord server to request rides. ${settings.discordInvite ? `<a href="${esc(settings.discordInvite)}" target="_blank" rel="noopener">Join the server</a>, then sign out and back in.` : 'Join, then sign out and back in.'}</span></div>`);
    if (data.erlc && settings.requireInGame && data.server && !data.server.online) notes.push(`<div class="notice" style="margin-bottom:16px">${I.info}<span>The Big Sky ER:LC server looks offline right now, so we can't check that you're in-game. You can still request.</span></div>`);
    else if (data.erlc && settings.requireInGame) notes.push(`<div class="notice" style="margin-bottom:16px">${I.info}<span>Join the ER:LC server first${data.server?.joinKey ? ` (code <b class="mono">${esc(data.server.joinKey)}</b>)` : ''}. We check that your Roblox username is in-game before sending the request.</span></div>`);
    if (EATS && !settings.prices.eats?.enabled) notes.push(`<div class="notice amber" style="margin-bottom:16px">${I.alert}<span><b>Uber Eats is paused right now.</b> Check back soon.</span></div>`);
    if (data.stats && data.stats.online === 0 && settings.accepting) notes.push(`<div class="notice" style="margin-bottom:16px">${I.info}<span>No drivers are on duty right now. You can still request, the first driver to clock in will see it.</span></div>`);
    notice.innerHTML = notes.join('');

    if (!viewer) {
      $('#signin-overlay').hidden = false;
      $('#signin-btn').href = BSU.loginUrl('/ride' + location.search);
      $$('input, textarea, button', form).forEach((el) => (el.disabled = true));
      return;
    }
    $('#ride-list').innerHTML = BSU.skel.list(3);
    loadRides();
  });
})();
