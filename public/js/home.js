(() => {
  const { $, $$, esc, money, icon: I } = BSU;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Hero phone: looping trip ---------- */
  const heroSheet = `
    <div class="sheet-row"><div><div class="sheet-eta" data-eta>Finding driver<small></small></div><div class="sheet-sub" data-sub>Uber Black</div></div></div>
    <div class="sheet-driver" style="margin-top:12px"><span class="av"></span><span><b>Driver · Marcus_V</b><span>Black Sedan · ★ 4.98</span></span><span class="sheet-plate">BSU 204</span></div>
    <div class="sheet-bar"><i data-bar></i></div>`;
  $('#hero-phone').innerHTML = BSU.phone({
    sheet: heroSheet,
    top: '<div class="phone-search"><i></i><span data-to>Where to?</span></div>',
  });
  const hp = $('#hero-phone');
  const eta = $('[data-eta]', hp), sub = $('[data-sub]', hp), bar = $('[data-bar]', hp), fcEta = $('[data-fc-eta]'), toEl = $('[data-to]', hp);
  let trip = { from: null, to: null };
  BSUMap.mount($('[data-phone-map]', hp), {
    loop: true,
    duration: 10000,
    area: 'city',
    onRoute: (rt) => { trip = rt; toEl.textContent = 'To ' + BSUMap.pinText(rt.to); },
    onProgress: (p, { draw, drive }) => {
      bar.style.setProperty('--p', Math.round(p * 100) + '%');
      if (draw < 1) { eta.innerHTML = 'Matching<small>…</small>'; sub.textContent = 'Pickup at ' + (trip.from?.name || 'your location'); return; }
      const mins = Math.max(0, Math.ceil((1 - drive) * 6));
      if (mins === 0) { eta.innerHTML = 'Arrived<small>✓</small>'; sub.textContent = 'Outside ' + (trip.to?.name || 'your stop'); fcEta.textContent = 'Driver arrived'; }
      else { eta.innerHTML = `${mins}<small>min</small>`; sub.textContent = 'Heading to ' + (trip.to?.name || 'your stop'); fcEta.textContent = `${mins} min away`; }
    },
  });

  // Apple-style tilt that flattens as you scroll.
  const stage = $('.hero-stage .phone');
  if (stage && !reduce) {
    const onScroll = () => {
      const p = Math.min(1, scrollY / 500);
      stage.style.setProperty('--tilt', 14 - p * 14 + 'deg');
      stage.style.transform = `rotateX(${14 - p * 14}deg) rotateY(${-14 + p * 14}deg) rotateZ(${2 - p * 2}deg) translateY(${p * -20}px)`;
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Scroll-driven "how it works" ---------- */
  const SCREENS = [
    (s) => `<div class="sheet-sub" style="margin-bottom:8px">Choose a ride</div><div class="sheet-classes">
      ${['uber', 'premium', 'black'].map((c, i) => `<div class="sheet-class ${i === 2 ? 'on' : ''}">${BSU.car(c)}<span><b>${BSU.CLASS_NAMES[c]}</b><span>${i === 0 ? '4 seats' : i === 1 ? 'Top drivers' : 'Executive'}</span></span><em>${money(s.prices[c].min)}+</em></div>`).join('')}
      </div><div class="sheet-cta">Request Uber Black</div>`,
    () => `<div class="sheet-sub">Driver matched</div><div class="sheet-eta" style="margin:6px 0 12px">Marcus is coming</div>
      <div class="sheet-driver"><span class="av"></span><span><b>Marcus_V</b><span>Black Sedan · ★ 4.98</span></span><span class="sheet-plate">BSU 204</span></div>`,
    () => `<div class="sheet-row"><div><div class="sheet-eta" data-s-eta>4<small>min</small></div><div class="sheet-sub">Heading to City Park · 218</div></div></div>
      <div class="sheet-driver" style="margin-top:12px"><span class="av"></span><span><b>Marcus_V</b><span>On the way</span></span><span class="sheet-plate">BSU 204</span></div>
      <div class="sheet-bar"><i data-s-bar></i></div>`,
    () => `<div class="sheet-sub">You’ve arrived</div><div class="sheet-eta" style="margin:6px 0 10px">How was your ride?</div>
      <div style="display:flex;gap:6px;justify-content:center;margin:6px 0 4px">${`<span style="width:26px;height:26px;color:#fff">${I.star}</span>`.repeat(5)}</div>
      <div class="sheet-cta">Pay ${money(750)} in-game</div>`,
  ];

  const sp = $('#scrolly-phone');
  sp.innerHTML = BSU.phone({ sheet: '' });
  const spSheet = $('[data-phone-sheet]', sp);
  const spMap = BSUMap.mount($('[data-phone-map]', sp), { seed: 2027, duration: 1, area: 'city', from: 'City Park', to: 'Liberty County Hospital' });
  const steps = $$('#steps .step');
  const meter = $('#scroll-meter');
  const section = $('#how');
  const spPhone = $('.phone', sp);
  let curStep = -1;
  let settings = null;

  function showStep(i) {
    if (i === curStep || !settings) return;
    curStep = i;
    steps.forEach((s, k) => s.classList.toggle('on', k === i));
    spSheet.style.transition = 'opacity .25s, transform .4s var(--ease)';
    spSheet.style.opacity = 0; spSheet.style.transform = 'translateY(10px)';
    setTimeout(() => {
      spSheet.innerHTML = '<div class="grab"></div>' + SCREENS[i](settings);
      spSheet.style.opacity = 1; spSheet.style.transform = 'none';
    }, 180);
  }

  const desktop = matchMedia('(min-width: 981px)');
  function onScrolly() {
    if (!desktop.matches) { spMap.setProgress(0.55); showStep(curStep < 0 ? 2 : curStep); return; }
    const r = section.getBoundingClientRect();
    const total = section.offsetHeight - innerHeight;
    const p = Math.max(0, Math.min(1, -r.top / total));
    meter.style.setProperty('--p', p);
    spPhone.style.setProperty('--s', (0.9 + Math.min(1, p * 4) * 0.1).toFixed(3));
    const i = Math.min(3, Math.floor(p * 4));
    showStep(i);
    // Route draws during steps 2–3.
    const mp = Math.max(0, Math.min(1, (p - 0.3) / 0.6));
    spMap.setProgress(mp);
    const sEta = $('[data-s-eta]', spSheet), sBar = $('[data-s-bar]', spSheet);
    if (sEta) sEta.innerHTML = `${Math.max(1, Math.ceil((1 - mp) * 5))}<small>min</small>`;
    if (sBar) sBar.style.setProperty('--p', Math.round(mp * 100) + '%');
  }
  addEventListener('scroll', onScrolly, { passive: true });
  addEventListener('resize', onScrolly);

  /* ---------- Data-driven bits ---------- */
  const FEATURES = {
    uber: ['Up to 4 riders', 'Any on-duty driver', 'Clean, everyday cars'],
    premium: ['Top-rated drivers only', 'Newer, nicer cars', 'Priority matching'],
    black: ['Black executive cars', 'Our best drivers', 'Door-to-door, discreet'],
  };
  const check = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

  BSU.boot.then(({ settings: s, stats, server }) => {
    if (server) {
      const meta = $('.hero-meta');
      meta.insertAdjacentHTML('beforeend', `<span class="pill"><span class="dot green"></span><b>${server.players}/${server.maxPlayers}</b>&nbsp;in the ER:LC server</span>`);
    }
    settings = s;
    onScrolly();
    $('[data-fc-black]').textContent = `${money(s.prices.black.min)} – ${money(s.prices.black.max)}`;

    $('#class-cards').innerHTML = ['uber', 'premium', 'black'].map((c, i) => {
      const p = s.prices[c];
      return `<a class="card class-card ${c} reveal" style="--d:${i * 90}ms" href="/ride?class=${c}" data-spot>
        <div class="top-line"><span class="badge">${c === 'black' ? 'Executive' : c === 'premium' ? 'Comfort' : 'Everyday'}</span>${p.enabled ? '' : '<span class="badge red">Paused</span>'}</div>
        <div class="car-wrap">${BSU.car(c)}</div>
        <h3>${esc(p.name)}</h3>
        <p class="tagline">${esc(p.tagline || '')}</p>
        <ul class="feat">${FEATURES[c].map((f) => `<li>${check}${f}</li>`).join('')}</ul>
        <div class="price"><b>${money(p.min)}–${money(p.max).slice(1)}</b><span>per trip</span></div>
      </a>`;
    }).join('');
    BSU.reveal($('#class-cards'));

    $$('[data-rating]').forEach((el) => (el.textContent = stats.reviews ? stats.rating.toFixed(2) : 'New'));
    $$('[data-completed]').forEach((el) => (el.textContent = (stats.completed || 0).toLocaleString('en-US')));

    const counters = { completed: [stats.completed || 0, 0], online: [stats.online || 0, 0], rating: [stats.rating || 0, 2] };
    const obs = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      const [to, dec] = counters[e.target.dataset.count];
      BSU.countUp(e.target, to, { decimals: dec });
      obs.unobserve(e.target);
    }), { threshold: 0.5 });
    $$('[data-count]').forEach((el) => obs.observe(el));
  });

  async function loadDrivers() {
    const grid = $('#live-grid');
    try {
      const { drivers } = await BSU.api('/api/site?op=drivers', { quiet: true });
      $$('[data-online]').forEach((el) => (el.textContent = drivers.length));
      if (!drivers.length) {
        grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><b>No drivers on duty right now</b>Requests still queue up. A driver will grab yours as soon as they clock in.</div>`;
        return;
      }
      grid.innerHTML = drivers.map((d) => `<div class="driver-chip">
        <img src="${esc(d.avatar)}" alt="" width="42" height="42" loading="lazy">
        <span><b>${esc(d.name)}</b><span>${esc(d.vehicle || 'Big Sky driver')}${d.callsign ? ' · ' + esc(d.callsign) : ''}</span></span>
        <span class="badge ${d.busy ? 'amber' : 'green'}">${d.busy ? 'On a trip' : 'Available'}</span>
      </div>`).join('');
    } catch {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><b>Couldn’t load drivers</b>Try refreshing in a moment.</div>`;
    }
  }
  loadDrivers();
  setInterval(() => { if (!document.hidden) loadDrivers(); }, 30000);

  (async () => {
    const box = $('#review-marquee');
    let list = [];
    try { ({ reviews: list } = await BSU.api('/api/site?op=reviews', { quiet: true })); } catch {}
    list = list.filter((r) => r.rating >= 4).sort((a, b) => Number(b.featured) - Number(a.featured)).slice(0, 14);
    if (!list.length) {
      box.outerHTML = `<div class="wrap"><div class="empty"><b>No reviews yet</b>Take a ride and be the first to leave one. <a class="arrow-link" style="margin-top:10px" href="/reviews#write">Write a review ${I.arrow}</a></div></div>`;
      return;
    }
    const card = (r) => `<article class="card review" data-spot>
      ${BSU.stars(r.rating)}
      <p>${esc(r.text)}</p>
      <div class="review-foot"><img src="${esc(r.user.avatar)}" alt="" loading="lazy"><span><b>${esc(r.user.name)}</b>${r.class ? BSU.CLASS_NAMES[r.class] : 'Rider'}${r.driverName ? ' · with ' + esc(r.driverName) : ''}</span></div>
    </article>`;
    const items = list.length < 5 ? [...list, ...list, ...list] : list;
    box.innerHTML = `<div class="marquee-track" style="--dur:${items.length * 7}s">${items.map(card).join('')}${items.map(card).join('')}</div>`;
  })();

  BSUMap.mount($('#cta-map'), { width: 1200, height: 520, loop: true, duration: 8000, safeTop: 60, safeBottom: 60, labels: false });

  /* ---------- Coverage (real ER:LC areas) ---------- */
  const cov = $('#coverage');
  if (cov) {
    const AREA_DESC = {
      city: 'Downtown, the Shopping Outlet, City Park, the hospital and Chinatown.',
      industrial: 'RCPD, the Power Plant, Gas Depot, DOT and Freight Street.',
      springfield: 'Maple Street, Oak Valley Drive and Downtown Springfield.',
      fairview: 'The newest suburb, off Fairview Avenue.',
      county: 'Highway 55, the farms, High Rock Park, Spring Lake and the LCSO.',
    };
    cov.innerHTML = Object.entries(BSUMap.AREAS).map(([k, a], i) => {
      const places = BSUMap.LOCATIONS.filter((l) => l.area === k).slice(0, 4);
      return `<div class="card area-card reveal" style="--d:${i * 70}ms" data-spot>
        <div class="area-top"><h3>${esc(a.label)}</h3><span class="badge mono">${esc(a.postals)}</span></div>
        <p class="muted">${AREA_DESC[k]}</p>
        <ul>${places.map((l) => `<li>${l.postal ? `<span class="mono">${l.postal}</span>` : '<span class="mono">—</span>'}${esc(l.name)}</li>`).join('')}</ul>
      </div>`;
    }).join('');
    BSU.reveal(cov);
  }
})();
