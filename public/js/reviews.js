(() => {
  const { $, $$, esc, icon: I } = BSU;
  let all = [];
  let filter = 'all';
  $('#review-grid').innerHTML = BSU.skel.reviews(4);

  const card = (r) => `<article class="card review reveal" data-spot>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">${BSU.stars(r.rating)}${r.featured ? '<span class="badge white">Featured</span>' : ''}</div>
    <p>${esc(r.text)}</p>
    <div class="review-foot"><img src="${esc(r.user.avatar)}" alt="" loading="lazy"><span><b>${esc(r.user.name)}</b>${r.class ? BSU.CLASS_NAMES[r.class] : 'Rider'}${r.driverName ? ' · with ' + esc(r.driverName) : ''} · ${BSU.ago(r.createdAt)}</span></div>
  </article>`;

  function render() {
    const list = all.filter((r) =>
      filter === 'all' ? true :
      filter === 'low' ? r.rating <= 3 :
      /^\d$/.test(filter) ? r.rating === Number(filter) :
      r.class === filter);
    const grid = $('#review-grid');
    grid.innerHTML = list.length ? list.map(card).join('') : `<div class="empty"><b>Nothing here yet</b>${all.length ? 'No reviews match this filter.' : 'Be the first to leave a review.'}</div>`;
    BSU.reveal(grid);
  }

  $('#filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    filter = b.dataset.f;
    $$('#filters .filter').forEach((x) => x.classList.toggle('on', x === b));
    render();
  });

  async function load() {
    try {
      const { reviews, summary } = await BSU.api('/api/site?op=reviews', { quiet: true });
      all = reviews;
      $('#score').textContent = summary.count ? summary.avg.toFixed(1) : '–';
      $('#score-stars').innerHTML = BSU.stars(Math.round(summary.avg));
      $('#score-count').textContent = summary.count ? `Based on ${summary.count} review${summary.count === 1 ? '' : 's'}` : 'No reviews yet';
      const max = Math.max(1, ...summary.dist);
      $('#dist').innerHTML = [5, 4, 3, 2, 1].map((n) => `<div class="dist-row"><span>${n}★</span><span class="track"><i data-w="${(summary.dist[n - 1] / max) * 100}"></i></span><span style="text-align:right">${summary.dist[n - 1]}</span></div>`).join('');
      requestAnimationFrame(() => $$('#dist i').forEach((i) => (i.style.width = i.dataset.w + '%')));
      render();
    } catch {
      $('#review-grid').innerHTML = '<div class="empty"><b>Couldn’t load reviews</b>Try again in a moment.</div>';
    }
  }

  async function writeForm(viewer) {
    const box = $('#write-body');
    if (!viewer) {
      box.innerHTML = `<p class="muted" style="font-size:14.5px">Sign in with Discord to leave a review.</p><a class="btn discord block" style="margin-top:16px" href="${BSU.loginUrl('/reviews#write')}">${I.discord}Sign in with Discord</a>`;
      return;
    }
    let rides = [], drivers = [], driverErr = false;
    await Promise.all([
      BSU.api('/api/site?op=myrides', { quiet: true }).then((r) => (rides = r.rides || [])).catch(() => {}),
      BSU.api('/api/site?op=driverList', { quiet: true }).then((r) => (drivers = r.drivers || [])).catch(() => (driverErr = true)),
    ]);
    drivers = drivers.filter((d) => d.id !== viewer.id);
    const rateable = rides.filter((r) => r.status === 'completed' && !r.reviewed && r.driver?.id);
    const pre = new URLSearchParams(location.search).get('ride');
    const preRide = rateable.find((r) => r.id === pre);
    let driverId = preRide?.driver.id || null;
    if (driverErr) {
      box.innerHTML = '<div class="empty" style="padding:24px 8px"><b>Couldn’t load drivers</b>Refresh the page to try again.</div>';
      return;
    }
    const pick = (d) => `<label class="drv-pick${d.online ? ' online' : ''}">
        <input type="radio" name="rv-driver" value="${esc(d.id)}" ${d.id === driverId ? 'checked' : ''}>
        ${BSU.face(d.headshot, d.avatar)}
        <span><b>${esc(d.roblox || d.name)}</b><span>${[d.callsign, d.rating ? `${d.rating}★ · ${d.reviews} review${d.reviews === 1 ? '' : 's'}` : 'No reviews yet'].filter(Boolean).map(esc).join(' · ')}</span></span>
        ${d.online ? '<i class="dot green" title="On shift"></i>' : ''}
      </label>`;
    box.innerHTML = `<form id="rv-form" novalidate>
      <div class="field"><span class="label">Driver</span>
        ${drivers.length > 6 ? '<input class="input" id="rv-find" placeholder="Search drivers" autocomplete="off" style="margin-bottom:8px">' : ''}
        <div class="drv-picks" id="rv-drivers">${drivers.length ? drivers.map(pick).join('') : '<p class="muted" style="font-size:14px">No drivers have set up the driver panel yet.</p>'}</div></div>
      <div class="field"><span class="label">Rating</span><div class="stars-input" id="rv-stars">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}" aria-label="${n} star${n > 1 ? 's' : ''}">${I.star}</button>`).join('')}</div></div>
      <div class="field" id="rv-ride-field" hidden><label for="rv-ride">Ride <small>optional</small></label>
        <select class="select" id="rv-ride"></select></div>
      <div class="field"><label for="rv-text">Your review <small id="rv-count">0/600</small></label><textarea class="textarea" id="rv-text" maxlength="600" placeholder="How was your driver, the car, the ride?"></textarea></div>
      <button class="btn block" style="margin-top:18px" type="submit">Post review</button>
    </form>`;
    let rating = 5;
    const paint = () => $$('#rv-stars button').forEach((b) => b.classList.toggle('on', Number(b.dataset.n) <= rating));
    paint();
    $('#rv-stars').addEventListener('click', (e) => { const b = e.target.closest('[data-n]'); if (b) { rating = Number(b.dataset.n); paint(); } });
    // Rides you can attach: only completed, unreviewed rides with the chosen driver.
    const syncRides = () => {
      const mine = rateable.filter((r) => r.driver.id === driverId);
      $('#rv-ride-field').hidden = !mine.length;
      $('#rv-ride').innerHTML = `<option value="">Not about a specific ride</option>${mine.map((r) => `<option value="${esc(r.id)}" ${r.id === pre ? 'selected' : ''}>${esc(r.id)} · ${esc(r.pickup)} → ${esc(r.dropoff)}</option>`).join('')}`;
    };
    $('#rv-drivers').addEventListener('change', (e) => { if (e.target.name === 'rv-driver') { driverId = e.target.value; syncRides(); } });
    $('#rv-find')?.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      $$('.drv-pick', $('#rv-drivers')).forEach((el, i) => { const d = drivers[i]; el.hidden = q && !`${d.roblox} ${d.name} ${d.callsign}`.toLowerCase().includes(q); });
    });
    syncRides();
    $('#rv-text').addEventListener('input', (e) => ($('#rv-count').textContent = `${e.target.value.length}/600`));
    $('#rv-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!driverId) { BSU.toast('Pick the driver you’re reviewing.', 'error'); return $('#rv-drivers').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      const btn = e.target.querySelector('[type=submit]');
      btn.classList.add('loading');
      try {
        await BSU.api('/api/site?op=review', { method: 'POST', body: { rating, text: $('#rv-text').value.trim(), driverId, rideId: $('#rv-ride').value || undefined } });
        BSU.toast('Thanks! Your review is live.', 'ok');
        await load();
        writeForm(viewer);
      } catch {} finally { btn.classList.remove('loading'); }
    });
    if (pre) setTimeout(() => $('#write').scrollIntoView({ behavior: 'smooth', block: 'center' }), 400);
  }

  load();
  BSU.boot.then(({ viewer }) => writeForm(viewer));
})();
