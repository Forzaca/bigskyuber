(() => {
  const { $, $$, esc, money } = BSU;
  const L = BSUMap.LOCATIONS.filter((l) => l.postal);
  const place = (n) => L[n % L.length];

  // Skeletons until data arrives.
  $('#class-cards').innerHTML = BSU.skel.cards(3);
  $('#review-row').innerHTML = BSU.skel.reviews(3);

  /* ---------- Hero phone: a live trip on the River City map ---------- */
  $('#hero-phone').innerHTML = BSU.phone({
    top: '<div class="phone-search"><i></i><span data-to>Where to?</span></div>',
    sheet: `
      <div class="sheet-eta" data-eta>Matching…</div>
      <div class="sheet-sub" data-sub style="margin-top:4px">Finding the closest driver</div>
      <div class="sheet-driver" style="margin-top:12px"><span class="av"></span><span><b>Marcus_V</b><span>Navara Imperium · 4.98 ★</span></span><span class="sheet-plate">BSU 204</span></div>
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

  /* ---------- Dispatch screen ---------- */
  $$('[data-host]').forEach((el) => (el.textContent = location.host.includes('localhost') ? 'bigskyuber.app' : location.host));
  BSUMap.mount($('#dash-map'), { width: 560, height: 360, loop: true, duration: 9000, area: 'city', safeTop: 50, safeBottom: 50 });

  const DEMO_DRIVERS = [
    { callsign: 'BSU-204', name: 'Marcus_V', vehicle: '2020 Navara Imperium', classes: ['black'], busy: true },
    { callsign: 'BSU-118', name: 'JadeDrives', vehicle: 'Averon Q8 2022', classes: ['premium'], busy: false },
    { callsign: 'BSU-031', name: 'KaiOnDuty', vehicle: 'Falcon Traveller', classes: ['uber'], busy: false },
    { callsign: 'BSU-077', name: 'RiverRunner', vehicle: 'Chevlon Camion', classes: ['uber'], busy: true },
  ];
  const STATUS = [['pending', 'Finding driver'], ['accepted', 'Assigned'], ['enroute', 'On the way'], ['arrived', 'Arrived'], ['inprogress', 'On trip']];
  const CLS = ['uber', 'premium', 'black'];
  const rideRows = Array.from({ length: 5 }, (_, i) => {
    const a = place(i * 7 + 3), b = place(i * 11 + 9);
    return { id: 31360 + i * 3 + 1, cls: CLS[(i * 2) % 3], st: STATUS[(i * 3) % 5], from: a, to: b };
  }).reverse();
  $('#dash-rides').innerHTML = rideRows.map((r) => `<tr><td class="mono">#${r.id}</td><td><span class="cls cls-${r.cls}">${r.cls === 'uber' ? 'U' : r.cls === 'premium' ? 'P' : 'B'}</span></td><td><span class="st st-${r.st[0]}">${r.st[1]}</span></td><td class="ellipsis">${esc(r.from.postal)} → ${esc(r.to.postal)} · ${esc(r.to.name)}</td></tr>`).join('');
  $('#dash-ride-count').textContent = rideRows.length;

  const feedRows = Array.from({ length: 7 }, (_, i) => {
    const a = place(i * 5 + 1), b = place(i * 9 + 4), d = DEMO_DRIVERS[i % DEMO_DRIVERS.length];
    const cls = BSU.CLASS_NAMES[d.classes[0]];
    return `<div class="feed-row" style="--i:${i}"><svg viewBox="0 0 24 24"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>
      <div><p><b>${esc(d.name)}</b> <span class="tag mono">${esc(d.callsign)}</span> completed ${cls} in a ${esc(d.vehicle)} · <b>${money([180, 320, 760, 140, 450, 900, 210][i])}</b></p>
      <span>${esc(a.postal)} ${esc(a.name)} → ${esc(b.postal)} ${esc(b.name)} · ${[2, 6, 11, 15, 22, 31, 40][i]}m ago</span></div></div>`;
  });
  $('#dash-feed').innerHTML = feedRows.join('');

  const drawDrivers = (list) => {
    const rows = list.length ? list.map((d) => ({ callsign: d.callsign || '—', name: d.name, classes: d.classes || ['uber'], busy: d.busy })) : DEMO_DRIVERS;
    $('#dash-drivers').innerHTML = rows.slice(0, 6).map((d) => `<tr><td class="mono">${esc(d.callsign)}</td><td class="ellipsis">${esc(d.name)}</td><td><span class="mini-select">${esc(BSU.CLASS_NAMES[d.classes[d.classes.length - 1]].replace('Uber ', '') || 'Uber')}</span></td><td><span class="st ${d.busy ? 'st-enroute' : 'st-ok'}">${d.busy ? 'On trip' : 'Available'}</span></td></tr>`).join('');
    $('[data-driver-count]').textContent = rows.length;
  };
  drawDrivers([]);

  /* ---------- How it works phone: choosing a class ---------- */
  const howPhone = (s) => BSU.phone({
    top: '<div class="phone-search"><i></i><span>404 · Big Sky Hospital</span></div>',
    sheet: `<div class="sheet-sub" style="margin-bottom:8px">Choose a ride</div>
      <div class="sheet-classes">${CLS.map((c, i) => `<div class="sheet-class ${i === 0 ? 'on' : ''}">${BSU.car(c)}<span><b>${BSU.CLASS_NAMES[c]}</b><span>${['Everyday', 'Top drivers', 'Executive'][i]}</span></span><em>${money(s.prices[c].min)}+</em></div>`).join('')}</div>
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
    BSUMap.mount($('#how-phone [data-phone-map]'), { seed: 2027, area: 'city', progress: 0.3, from: 'Civilian Spawn', to: 'Big Sky Hospital', safeBottom: 360 });

    $$('[data-completed]').forEach((el) => (el.textContent = (stats.completed || 0).toLocaleString('en-US')));
    $$('[data-rating]').forEach((el) => (el.textContent = stats.reviews ? stats.rating.toFixed(2) + ' ★' : 'New'));

    $('#class-cards').innerHTML = CLS.map((c, i) => {
      const p = s.prices[c];
      return `<a class="card class-card ${c} reveal" style="--d:${i * 90}ms" href="/ride?class=${c}" data-spot>
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
    }), { threshold: 0.3 });
    $$('[data-count]').forEach((el) => obs.observe(el));
  });

  /* ---------- Coverage ---------- */
  const AREA_DESC = {
    city: 'Downtown, the Outlet, City Park and the hospital.',
    industrial: 'RCPD, the Power Plant, Gas Depot and DOT.',
    springfield: 'Maple Street and Oak Valley Drive.',
    fairview: 'The newest suburb, off Fairview Avenue.',
    county: 'Highway 55, the farms and Spring Lake.',
  };
  $('#coverage').innerHTML = Object.entries(BSUMap.AREAS).map(([k, a], i) => `<div class="card area-card reveal" style="--d:${i * 70}ms">
      <div class="area-top"><h3>${esc(a.label)}</h3><span class="badge mono">${esc(a.postals)}</span></div>
      <p>${AREA_DESC[k]}</p></div>`).join('');
  BSU.reveal($('#coverage'));

  /* ---------- Live drivers (fills the dispatch screen) ---------- */
  async function loadDrivers() {
    try {
      const { drivers } = await BSU.api('/api/site?op=drivers', { quiet: true });
      $$('[data-online]').forEach((el) => (el.textContent = drivers.length));
      drawDrivers(drivers);
    } catch {}
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
      box.outerHTML = `<div class="empty reveal"><b>No reviews yet</b>Take a ride and be the first. <a class="arrow-link" href="/reviews#write" style="margin-left:6px">Write a review</a></div>`;
      BSU.reveal();
      return;
    }
    box.innerHTML = list.map((r, i) => `<article class="card review reveal" style="--d:${i * 90}ms" data-spot>
      ${BSU.stars(r.rating)}
      <p>${esc(r.text)}</p>
      <div class="review-foot"><img src="${esc(r.user.avatar)}" alt="" loading="lazy"><span><b>${esc(r.user.name)}</b>${r.class ? BSU.CLASS_NAMES[r.class] : 'Rider'}</span></div>
    </article>`).join('');
    BSU.reveal(box);
  })();

  BSUMap.mount($('#cta-map'), { width: 1200, height: 520, loop: true, duration: 8000, safeTop: 60, safeBottom: 60, labels: false });
})();
