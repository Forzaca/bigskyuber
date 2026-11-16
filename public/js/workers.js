(() => {
  const { $, $$, esc, money, icon: I } = BSU;
  const P = BSU.panel;
  const CLASSES = ['uber', 'premium', 'black'];
  const NEXT = {
    accepted: { to: 'enroute', label: 'I’m on my way', icon: I.car },
    enroute: { to: 'arrived', label: 'I’ve arrived', icon: I.pin },
    arrived: { to: 'inprogress', label: 'Start trip', icon: I.route },
    inprogress: { to: 'completed', label: 'Complete & set fare', icon: I.check },
  };
  const FLOW = ['accepted', 'enroute', 'arrived', 'inprogress', 'completed'];
  let S = null;
  let seenQueue = null;
  let currentKey = '';
  let profileDone = false;
  let mapApi = null;

  P.tabs();
  $('[data-pane="queue"]').innerHTML = `<div class="req-grid">${BSU.skel.reviews(3)}</div>`;
  ['log', 'reviews'].forEach((p) => ($(`[data-pane="${p}"]`).innerHTML = BSU.skel.table(5, 5)));
  const api = (op, body) => BSU.api(`/api/worker?op=${op}`, body ? { method: 'POST', body } : {});

  async function refresh() {
    try { S = await BSU.api('/api/worker?op=state', { quiet: true }); }
    catch (e) {
      if (e.status === 401 || e.status === 403) location.reload();
      return;
    }
    render();
  }

  function render() {
    const { me, stats, queue, active } = S;
    $('#hello').textContent = `Hey, ${me.name.split(' ')[0]}.`;
    $('#hello-sub').textContent = `${queue.length} rider${queue.length === 1 ? '' : 's'} waiting · ${stats.onlineDrivers} driver${stats.onlineDrivers === 1 ? '' : 's'} online`;

    const t = $('#duty-toggle');
    t.disabled = false;
    t.checked = me.online;
    $('#duty-dot').className = 'dot ' + (me.online ? (active.length ? 'amber' : 'green') + ' pulse' : '');
    $('#duty-title').textContent = me.online ? (active.length ? 'On a trip' : 'Online · available') : 'Offline';
    $('#duty-sub').textContent = me.online ? `Since ${BSU.date(me.since)}` : me.roblox ? 'Go online to start taking rides' : 'Set your Roblox username in Profile first';

    const set = (k, v) => $$(`[data-t="${k}"]`).forEach((el) => (el.textContent = v));
    set('today', stats.today);
    set('total', stats.total);
    set('earned', money(stats.earned));
    set('rating', stats.rating ? stats.rating.toFixed(2) : '–');
    set('ratings', stats.ratings ? `${stats.ratings} rating${stats.ratings === 1 ? '' : 's'}` : 'no ratings yet');
    const now = new Date();
    const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((now.getDay() + 6) % 7));
    const wkMs = (S.shifts || []).reduce((m, s) => { const end = s.active ? Date.now() : s.end; return end < monday.getTime() ? m : m + (end - Math.max(s.start, monday.getTime())); }, 0);
    set('week', (wkMs / 36e5).toFixed(1) + 'h');
    const cur = (S.shifts || []).find((s) => s.active);
    set('shift', cur ? 'on shift now · ' + Math.round((Date.now() - cur.start) / 60000) + 'm' : 'on shift');
    set('queue', queue.length);
    set('online', `${stats.onlineDrivers} drivers online`);
    $('[data-c="queue"]').textContent = queue.length;
    $('[data-c="current"]').textContent = active.length;

    renderQueue();
    renderCurrent();
    renderLog();
    renderReviews();
    if (!profileDone) renderProfile();

    document.title = `${queue.length ? `(${queue.length}) ` : ''}Driver panel · Big Sky Uber`;
  }

  /* ---------- Queue ---------- */
  function renderQueue() {
    const { queue, me, active } = S;
    const pane = $('[data-pane="queue"]');
    const ids = new Set(queue.map((r) => r.id));
    const fresh = seenQueue ? queue.filter((r) => !seenQueue.has(r.id)) : [];
    if (fresh.length && seenQueue) BSU.toast(`${fresh.length} new ride request${fresh.length > 1 ? 's' : ''}`, 'info');
    seenQueue = ids;

    const head = !me.online ? `<div class="notice amber" style="margin-bottom:16px">${I.power}<span>You’re offline. Go online with the switch above to accept rides.</span></div>`
      : active.length ? `<div class="notice" style="margin-bottom:16px">${I.info}<span>Finish your current ride before accepting another one.</span></div>` : '';
    if (!queue.length) { pane.innerHTML = head + '<div class="empty"><b>No one is waiting</b>New requests show up here automatically.</div>'; return; }
    pane.innerHTML = head + `<div class="req-grid">${queue.map((r) => {
      const ok = (me.classes || ['uber']).includes(r.class);
      return `<article class="req-card ${fresh.some((f) => f.id === r.id) ? 'new' : ''}">
        <div class="req-head"><img src="${esc(r.rider.avatar)}" alt=""><span><b>${esc(r.roblox)}</b><span>@${esc(r.rider.username)} · ${BSU.ago(r.createdAt)}</span></span><span class="badge ${r.class === 'black' ? 'white' : ''}">${BSU.CLASS_NAMES[r.class]}</span></div>
        <div class="legs"><div class="leg">${esc(r.pickup)}${r.pickupPostal ? `<small>${esc(r.pickupPostal)}</small>` : ''}</div><div class="leg to">${esc(r.dropoff)}${r.dropoffPostal ? `<small>${esc(r.dropoffPostal)}</small>` : ''}</div></div>
        <div class="req-meta">${r.inServer === true ? '<span class="badge green">In server</span>' : r.inServer === false ? '<span class="badge red">Not in server</span>' : ''}<span class="tag">${r.passengers} rider${r.passengers > 1 ? 's' : ''}</span><span class="tag">${esc(S.settings.trips?.[r.trip]?.label || r.trip)}</span><span class="tag mono">${esc(r.id)}</span></div>
        ${r.notes ? `<div class="req-note">“${esc(r.notes)}”</div>` : ''}
        <div class="req-foot"><div class="fare">${money(r.quote.estimate)}<small>${money(r.quote.min)} – ${money(r.quote.max)}</small></div>
          <button class="btn sm" data-accept="${esc(r.id)}" ${!me.online || active.length || !ok ? 'disabled' : ''}>${ok ? 'Accept' : 'Not approved'}</button></div>
      </article>`;
    }).join('')}</div>`;
  }

  /* ---------- Current ride ---------- */
  function renderCurrent() {
    const pane = $('[data-pane="current"]');
    const r = S.active[0];
    const key = r ? r.id + r.status : 'none';
    if (key === currentKey) return;
    currentKey = key;
    if (!r) { pane.innerHTML = '<div class="empty"><b>No active ride</b>Accept a request from the queue to get started.</div>'; mapApi = null; return; }
    const step = FLOW.indexOf(r.status);
    const next = NEXT[r.status];
    pane.innerHTML = `<div class="current">
      <div class="card pad-lg">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">${BSU.statusBadge(r.status)}<button class="copy-btn" data-copy="${esc(r.id)}">${esc(r.id)} ${I.copy}</button></div>
        <h2 class="h3" style="margin-top:16px">${esc(r.pickup)} → ${esc(r.dropoff)}</h2>
        <div class="flow">${['Accepted', 'On the way', 'Arrived', 'On trip', 'Done'].map((l, i) => `<div class="flow-step ${i <= step ? 'on' : ''}"><i></i>${l}</div>`).join('')}</div>
        <dl class="kv">
          <dt>Rider</dt><dd><button class="copy-btn" data-copy="${esc(r.roblox)}">${esc(r.roblox)} ${I.copy}</button> <span class="muted">@${esc(r.rider.username)}</span></dd>
          <dt>Pickup</dt><dd>${esc(r.pickup)}${r.pickupPostal ? ` <span class="badge mono">${esc(r.pickupPostal)}</span>` : ''}</dd>
          <dt>Drop-off</dt><dd>${esc(r.dropoff)}${r.dropoffPostal ? ` <span class="badge mono">${esc(r.dropoffPostal)}</span>` : ''}</dd>
          <dt>Class</dt><dd>${BSU.CLASS_NAMES[r.class]} · ${r.passengers} rider${r.passengers > 1 ? 's' : ''}</dd>
          <dt>Fare range</dt><dd>${money(r.quote.min)} – ${money(r.quote.max)} <span class="muted">(est. ${money(r.quote.estimate)})</span></dd>
          ${r.notes ? `<dt>Notes</dt><dd>${esc(r.notes)}</dd>` : ''}
        </dl>
        <div style="display:flex;gap:8px;margin-top:26px;flex-wrap:wrap">
          ${next ? `<button class="btn" data-advance="${next.to}">${next.icon}${next.label}</button>` : ''}
          ${['accepted', 'enroute', 'arrived'].includes(r.status) ? `<button class="btn ghost sm" data-release>${I.refresh}Hand back to queue</button>` : ''}
          <button class="btn danger sm" data-dcancel>${I.x}Cancel ride</button>
        </div>
      </div>
      <div id="cur-phone"></div>
    </div>`;
    $('#cur-phone').innerHTML = BSU.phone({ sheet: `<div class="sheet-sub">${BSU.STATUS[r.status].label}</div><div class="sheet-eta" style="font-size:calc(var(--w)*.065);margin-top:4px">${esc(r.roblox)}</div><div class="sheet-sub" style="margin-top:4px">${esc(r.status === 'inprogress' ? r.dropoff : r.pickup)}</div>` });
    mapApi = BSUMap.mount($('#cur-phone [data-phone-map]'), { seed: [...r.id].reduce((a, c) => a + c.charCodeAt(0), 0) });
    const to = { accepted: 0.32, enroute: 0.6, arrived: 0.7, inprogress: 0.92 }[r.status] ?? 0.3;
    const start = performance.now();
    const from = { accepted: 0, enroute: 0.32, arrived: 0.6, inprogress: 0.7 }[r.status] ?? 0;
    const anim = (now) => { const k = Math.min(1, (now - start) / 2000); mapApi?.setProgress(from + (to - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(anim); };
    requestAnimationFrame(anim);
  }

  /* ---------- Log & reviews ---------- */
  function renderLog() {
    const pane = $('[data-pane="log"]');
    const h = S.history;
    if (!h.length) { pane.innerHTML = '<div class="empty"><b>No rides yet</b>Your finished rides will be logged here.</div>'; return; }
    pane.innerHTML = `<div class="toolbar"><span class="muted" style="font-size:14px">${h.length} ride${h.length === 1 ? '' : 's'}</span><button class="btn xs ghost spacer" id="log-csv">${I.download}Export CSV</button></div>
      <div class="table-wrap"><table class="table"><thead><tr><th>Ride</th><th>When</th><th>Rider</th><th>Route</th><th>Class</th><th>Status</th><th style="text-align:right">Fare</th></tr></thead><tbody>
      ${h.map((r) => `<tr><td class="mono">${esc(r.id)}</td><td>${BSU.date(r.createdAt)}</td><td>${esc(r.roblox)}</td><td class="wrap-cell">${esc(r.pickup)} → ${esc(r.dropoff)}</td><td>${BSU.CLASS_NAMES[r.class]}</td><td>${BSU.statusBadge(r.status)}</td><td style="text-align:right">${r.fare != null ? money(r.fare) : '—'}</td></tr>`).join('')}
      </tbody></table></div>`;
    $('#log-csv').onclick = () => P.csv([['id', 'created', 'rider', 'pickup', 'dropoff', 'class', 'status', 'fare'], ...h.map((r) => [r.id, new Date(r.createdAt).toISOString(), r.roblox, r.pickup, r.dropoff, r.class, r.status, r.fare ?? ''])], 'my-rides.csv');
  }

  function renderReviews() {
    const pane = $('[data-pane="reviews"]');
    const list = S.reviews;
    pane.innerHTML = list.length ? `<div class="review-grid">${list.map((r) => `<article class="card review">${BSU.stars(r.rating)}<p>${esc(r.text)}</p><div class="review-foot"><img src="${esc(r.avatar)}" alt=""><span><b>${esc(r.name)}</b>${BSU.ago(r.createdAt)}</span></div></article>`).join('')}</div>`
      : '<div class="empty"><b>No reviews yet</b>Riders can rate you after a completed trip.</div>';
  }

  /* ---------- Profile ---------- */
  function renderProfile() {
    profileDone = true;
    const me = S.me;
    $('[data-pane="profile"]').innerHTML = `<form class="card pad-lg" id="profile-form" style="max-width:640px">
      <h2 class="h3" style="font-size:22px">Your driver profile</h2>
      <p class="muted" style="margin-top:6px;font-size:14.5px">Riders see your Roblox name, vehicle and callsign once you accept.</p>
      <div class="field" style="margin-top:22px"><label for="p-roblox">Roblox username</label><input class="input" id="p-roblox" maxlength="20" value="${esc(me.roblox || '')}" placeholder="Your exact Roblox username" required></div>
      <div class="field-row"><div class="field"><label for="p-vehicle">Vehicle <small>optional</small></label><input class="input" id="p-vehicle" maxlength="40" list="erlc-cars" autocomplete="off" value="${esc(me.vehicle || '')}" placeholder="e.g. Stuttgart Executive"><datalist id="erlc-cars">${Object.entries(BSU.CARS).map(([c, cars]) => cars.map((n) => `<option value="${esc(n)}">${BSU.CLASS_NAMES[c]}</option>`).join('')).join('')}</datalist></div>
      <div class="field"><label for="p-callsign">Callsign / plate <small>optional</small></label><input class="input" id="p-callsign" maxlength="12" value="${esc(me.callsign || '')}" placeholder="e.g. BSU-204"></div></div>
      <div class="field"><span class="label">Classes you drive</span>
        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:4px">${CLASSES.map((c) => `<label class="check"><input type="checkbox" name="cls" value="${c}" ${(me.classes || ['uber']).includes(c) ? 'checked' : ''}><span>${BSU.CLASS_NAMES[c]}</span></label>`).join('')}</div>
        <span class="hint">Only tick Premium or Black if staff approved you for them.</span></div>
      <button class="btn" type="submit" style="margin-top:22px">Save profile</button>
    </form>`;
    $('#profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('[type=submit]');
      btn.classList.add('loading');
      try {
        await api('profile', { roblox: $('#p-roblox').value.trim(), vehicle: $('#p-vehicle').value.trim(), callsign: $('#p-callsign').value.trim(), classes: $$('[name=cls]:checked').map((i) => i.value) });
        BSU.toast('Profile saved', 'ok');
        profileDone = false;
        await refresh();
      } catch {} finally { btn.classList.remove('loading'); }
    });
  }

  /* ---------- Actions ---------- */
  $('#duty-toggle').addEventListener('change', async (e) => {
    const want = e.target.checked;
    e.target.disabled = true;
    try { await api('online', { online: want }); BSU.toast(want ? 'You’re online' : 'You’re offline', 'ok'); }
    catch { e.target.checked = !want; }
    await refresh();
  });

  document.addEventListener('click', async (e) => {
    const acc = e.target.closest('[data-accept]');
    if (acc) {
      acc.classList.add('loading');
      try {
        await api('accept', { id: acc.dataset.accept });
        BSU.toast('Ride accepted. Head to the pickup!', 'ok');
        await refresh();
        $('[data-tab="current"]').click();
      } catch { await refresh(); }
      return;
    }
    const adv = e.target.closest('[data-advance]');
    if (adv) {
      const r = S.active[0];
      if (adv.dataset.advance === 'completed') return completeModal(r);
      adv.classList.add('loading');
      try { await api('advance', { id: r.id, status: adv.dataset.advance }); await refresh(); } catch { adv.classList.remove('loading'); }
      return;
    }
    if (e.target.closest('[data-release]')) {
      if (!(await BSU.confirm('Hand this ride back?', 'It goes back to the top of the queue for another driver.', 'Hand back', 'ghost'))) return;
      try { await api('release', { id: S.active[0].id }); BSU.toast('Ride handed back'); await refresh(); } catch {}
      return;
    }
    if (e.target.closest('[data-dcancel]')) {
      const r = S.active[0];
      BSU.modal({
        title: 'Cancel ride',
        body: `<div class="field"><label for="c-reason">Reason</label><select class="select" id="c-reason"><option>Rider no-show</option><option>Rider asked to cancel</option><option>Rider unreachable in-game</option><option>Vehicle problem</option><option>Other</option></select></div>`,
        actions: [{ label: 'Keep ride' }, { label: 'Cancel ride', kind: 'danger', onClick: async (m) => { await api('cancel', { id: r.id, reason: $('#c-reason', m).value }); BSU.toast('Ride cancelled'); await refresh(); } }],
      });
    }
  });

  function completeModal(r) {
    BSU.modal({
      title: 'Complete trip',
      body: `<p class="muted" style="margin-bottom:16px">Enter the fare you collected in-game. It must be between ${money(r.quote.min)} and ${money(r.quote.max)} for ${BSU.CLASS_NAMES[r.class]}.</p>
        <div class="field"><label for="fare">Fare (in-game $)</label><input class="input" id="fare" type="number" inputmode="numeric" min="${r.quote.min}" max="${r.quote.max}" step="10" value="${r.quote.estimate}"></div>`,
      actions: [{ label: 'Back' }, { label: 'Complete trip', kind: '', onClick: async (m) => {
        await api('advance', { id: r.id, status: 'completed', fare: Number($('#fare', m).value) });
        BSU.toast('Trip complete. Nice driving!', 'ok');
        await refresh();
      } }],
    });
  }

  P.poll(refresh, 8000);
})();
