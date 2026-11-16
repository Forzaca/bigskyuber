(() => {
  const { $, $$, esc, money } = BSU;

  /* ---------- Hero phone: a live trip on the River City map ---------- */
  $('#hero-phone').innerHTML = BSU.phone({
    top: '<div class="phone-search"><i></i><span data-to>Where to?</span></div>',
    sheet: `
      <div class="sheet-eta" data-eta>Matching…</div>
      <div class="sheet-sub" data-sub style="margin-top:4px">Finding the closest driver</div>
      <div class="sheet-driver" style="margin-top:12px"><span class="av"></span><span><b>Marcus_V</b><span>Black Sedan · 4.98 ★</span></span><span class="sheet-plate">BSU 204</span></div>
      <div class="sheet-bar"><i data-bar></i></div>`,
  });
  const hp = $('#hero-phone');
  const eta = $('[data-eta]', hp), sub = $('[data-sub]', hp), bar = $('[data-bar]', hp), toEl = $('[data-to]', hp);
  let trip = {};
  BSUMap.mount($('[data-phone-map]', hp), {
    loop: true, duration: 10000, area: 'city', safeBottom: 330,
    onRoute: (rt) => { trip = rt; toEl.textContent = BSUMap.pinText(rt.to); },
    onProgress: (p, { draw, drive }) => {
      bar.style.setProperty('--p', Math.round(p * 100) + '%');
      if (draw < 1) { eta.textContent = 'Matching…'; sub.textContent = `Pickup at ${trip.from?.name || 'your location'}`; return; }
      const mins = Math.max(0, Math.ceil((1 - drive) * 6));
      if (mins === 0) { eta.textContent = 'You’ve arrived'; sub.textContent = trip.to?.name || ''; }
      else { eta.innerHTML = `${mins}<small>min</small>`; sub.textContent = `Heading to ${trip.to?.name || 'your stop'}`; }
    },
  });

  /* ---------- How it works phone: choosing a class ---------- */
  const howPhone = (s) => BSU.phone({
    top: '<div class="phone-search"><i></i><span>404 · Liberty County Hospital</span></div>',
    sheet: `<div class="sheet-sub" style="margin-bottom:8px">Choose a ride</div>
      <div class="sheet-classes">${['uber', 'premium', 'black'].map((c, i) => `<div class="sheet-class ${i === 0 ? 'on' : ''}">${BSU.car(c)}<span><b>${BSU.CLASS_NAMES[c]}</b><span>${['Everyday', 'Top drivers', 'Executive'][i]}</span></span><em>${money(s.prices[c].min)}+</em></div>`).join('')}</div>
      <div class="sheet-cta">Request Uber</div>`,
  });

  /* ---------- Data-driven sections ---------- */
  const FEATURES = {
    uber: ['Up to 4 riders', 'Any on-duty driver', 'Live tracking'],
    premium: ['Top-rated drivers', 'Newer, nicer cars', 'Priority matching'],
    black: ['Black executive cars', 'Our best drivers', 'Door to door'],
  };
  const check = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

  BSU.boot.then(({ settings: s, stats }) => {
    $('#how-phone').innerHTML = howPhone(s);
    BSUMap.mount($('#how-phone [data-phone-map]'), { seed: 2027, area: 'city', progress: 0.3, from: 'Civilian Spawn', to: 'Liberty County Hospital', safeBottom: 360 });

    $('#class-cards').innerHTML = ['uber', 'premium', 'black'].map((c, i) => {
      const p = s.prices[c];
      return `<a class="card class-card ${c} reveal" style="--d:${i * 80}ms" href="/ride?class=${c}" data-spot>
        <div class="top-line"><span class="badge">${['Everyday', 'Comfort', 'Executive'][i]}</span>${p.enabled ? '' : '<span class="badge red">Paused</span>'}</div>
        <div class="car-wrap">${BSU.car(c)}</div>
        <h3>${esc(p.name)}</h3>
        <p class="tagline">${esc(p.tagline || '')}</p>
        <ul class="feat">${FEATURES[c].map((f) => `<li>${check}${f}</li>`).join('')}</ul>
        <div class="price"><b>${money(p.min)}–${money(p.max).slice(1)}</b><span>per trip</span></div>
      </a>`;
    }).join('');
    BSU.reveal($('#class-cards'));

    const counters = { completed: [stats.completed || 0, 0], online: [stats.online || 0, 0], rating: [stats.rating || 0, 2] };
    if (stats.reviews) $('[data-reviews-count]').textContent = `From ${stats.reviews} rider review${stats.reviews === 1 ? '' : 's'}.`;
    const obs = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      const [to, dec] = counters[e.target.dataset.count];
      if (e.target.dataset.count === 'rating' && !to) e.target.textContent = 'New';
      else BSU.countUp(e.target, to, { decimals: dec });
      obs.unobserve(e.target);
    }), { threshold: 0.4 });
    $$('[data-count]').forEach((el) => obs.observe(el));
  });

  /* ---------- Live map + coverage ---------- */
  BSUMap.mount($('#window-map'), { width: 1200, height: 520, loop: true, duration: 9000, area: 'city', safeTop: 70, safeBottom: 60 });
  const AREA_DESC = {
    city: 'Downtown, the Outlet, City Park and the hospital.',
    industrial: 'RCPD, the Power Plant, Gas Depot and DOT.',
    springfield: 'Maple Street and Oak Valley Drive.',
    fairview: 'The newest suburb, off Fairview Avenue.',
    county: 'Highway 55, the farms and Spring Lake.',
  };
  $('#coverage').innerHTML = Object.entries(BSUMap.AREAS).map(([k, a], i) => `<div class="card area-card reveal" style="--d:${i * 60}ms">
      <div class="area-top"><h3>${esc(a.label)}</h3><span class="badge mono">${esc(a.postals)}</span></div>
      <p>${AREA_DESC[k]}</p></div>`).join('');
  BSU.reveal($('#coverage'));

  /* ---------- Live drivers ---------- */
  async function loadDrivers() {
    const grid = $('#live-grid');
    try {
      const { drivers } = await BSU.api('/api/site?op=drivers', { quiet: true });
      $$('[data-online]').forEach((el) => (el.textContent = drivers.length));
      grid.innerHTML = drivers.slice(0, 8).map((d) => `<div class="driver-chip">
        <img src="${esc(d.avatar)}" alt="" width="38" height="38" loading="lazy">
        <span><b>${esc(d.name)}</b><span>${esc(d.vehicle || 'Big Sky driver')}${d.callsign ? ' · ' + esc(d.callsign) : ''}</span></span>
        <span class="badge ${d.busy ? 'amber' : 'green'}">${d.busy ? 'On a trip' : 'Available'}</span>
      </div>`).join('');
    } catch { grid.innerHTML = ''; }
  }
  loadDrivers();
  setInterval(() => { if (!document.hidden) loadDrivers(); }, 30000);

  /* ---------- Reviews ---------- */
  (async () => {
    const box = $('#review-row');
    let list = [];
    try { ({ reviews: list } = await BSU.api('/api/site?op=reviews', { quiet: true })); } catch {}
    list = list.filter((r) => r.rating >= 4).sort((a, b) => Number(b.featured) - Number(a.featured)).slice(0, 3);
    if (!list.length) {
      box.outerHTML = `<div class="empty"><b>No reviews yet</b>Take a ride and be the first. <a class="arrow-link" href="/reviews#write" style="margin-left:6px">Write a review</a></div>`;
      return;
    }
    box.innerHTML = list.map((r, i) => `<article class="card review reveal" style="--d:${i * 80}ms" data-spot>
      ${BSU.stars(r.rating)}
      <p>${esc(r.text)}</p>
      <div class="review-foot"><img src="${esc(r.user.avatar)}" alt="" loading="lazy"><span><b>${esc(r.user.name)}</b>${r.class ? BSU.CLASS_NAMES[r.class] : 'Rider'}</span></div>
    </article>`).join('');
    BSU.reveal(box);
  })();

  BSUMap.mount($('#cta-map'), { width: 1200, height: 520, loop: true, duration: 8000, safeTop: 60, safeBottom: 60, labels: false });
})();
