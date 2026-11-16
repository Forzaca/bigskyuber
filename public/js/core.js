/* Big Sky Uber · shared front-end (header, footer, auth, helpers, animations) */
(() => {
  document.documentElement.classList.remove('no-js');
  const BSU = (window.BSU = window.BSU || {});
  const page = document.body.dataset.page || '';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  BSU.$ = $; BSU.$$ = $$;
  BSU.page = page;

  BSU.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  BSU.money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');
  BSU.ago = (t) => {
    if (!t) return '';
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 45) return 'just now';
    if (s < 3600) return Math.round(s / 60) + 'm ago';
    if (s < 86400) return Math.round(s / 3600) + 'h ago';
    if (s < 86400 * 7) return Math.round(s / 86400) + 'd ago';
    return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };
  BSU.date = (t) => (t ? new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

  /* ---------------- Icons ---------------- */
  const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
  BSU.icon = {
    logo: `<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 6.5v10.2c0 5 3.6 8.8 9 8.8s9-3.8 9-8.8V6.5h-4.3v10c0 2.8-1.9 4.9-4.7 4.9s-4.7-2.1-4.7-4.9v-10z" fill="currentColor"/><circle cx="16" cy="4.2" r="1.6" fill="currentColor"/></svg>`,
    discord: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.3 4.4A19.7 19.7 0 0 0 15.4 3l-.6 1.3a18.3 18.3 0 0 0-5.6 0L8.6 3a19.6 19.6 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18.1A19.9 19.9 0 0 0 6.1 21l1.3-2a12.8 12.8 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4a12.7 12.7 0 0 1-2 1l1.3 2a19.8 19.8 0 0 0 6-3c.5-5.2-.9-9.7-3.6-13.6ZM8 15.3c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.4 8 10.4s2.2 1.1 2.2 2.5-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.5 2.2-2.5 2.2 1.1 2.2 2.5-1 2.4-2.2 2.4Z"/></svg>`,
    chev: svg('<path d="m6 9 6 6 6-6"/>', 'class="chev"'),
    arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    car: svg('<path d="M5 17h14M6 17v2M18 17v2M3.5 13.5 5.5 8a2 2 0 0 1 1.9-1.4h9.2A2 2 0 0 1 18.5 8l2 5.5"/><rect x="3" y="11.5" width="18" height="6" rx="2"/><circle cx="7.5" cy="14.5" r="1"/><circle cx="16.5" cy="14.5" r="1"/>'),
    pin: svg('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>'),
    flag: svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
    tag: svg('<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z"/><circle cx="7.5" cy="7.5" r="1.5"/>'),
    layers: svg('<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    star: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9L12 2.8Z"/></svg>`,
    starLine: svg('<path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9L12 2.8Z"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
    users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"/>'),
    wheel: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3v6.5M4.5 16.5l5.4-3M19.5 16.5l-5.4-3"/>'),
    radar: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 18 6"/>'),
    help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01"/>'),
    book: svg('<path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Zm0 0A2 2 0 0 0 6 22h13"/>'),
    doc: svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>'),
    lock: svg('<rect x="4" y="10" width="16" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'),
    shield: svg('<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>'),
    grid: svg('<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>'),
    out: svg('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/>'),
    check: svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
    x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    alert: svg('<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>'),
    route: svg('<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5"/>'),
    receipt: svg('<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>'),
    sparkle: svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>'),
    refresh: svg('<path d="M20 11a8 8 0 0 0-14.7-4.3L4 8M4 4v4h4M4 13a8 8 0 0 0 14.7 4.3L20 16M20 20v-4h-4"/>'),
    trash: svg('<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>'),
    edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
    eye: svg('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: svg('<path d="M3 3l18 18M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7c1.8 0 3.4-.5 4.7-1.3"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
    ban: svg('<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>'),
    settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'),
    code: svg('<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 4l-4 16"/>'),
    copy: svg('<rect x="8" y="8" width="13" height="13" rx="2.5"/><path d="M16 8V5.5A2.5 2.5 0 0 0 13.5 3h-8A2.5 2.5 0 0 0 3 5.5v8A2.5 2.5 0 0 0 5.5 16H8"/>'),
    download: svg('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
    power: svg('<path d="M12 3v9"/><path d="M6.3 7.3a8 8 0 1 0 11.4 0"/>'),
    signal: `<svg viewBox="0 0 18 12" fill="#fff" aria-hidden="true"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>`,
    battery: `<svg viewBox="0 0 27 12" aria-hidden="true"><rect x=".5" y=".5" width="23" height="11" rx="3.5" fill="none" stroke="rgba(255,255,255,.5)"/><rect x="2" y="2" width="17" height="8" rx="2" fill="#fff"/><path d="M25 4v4a2 2 0 0 0 0-4Z" fill="rgba(255,255,255,.5)"/></svg>`,
  };
  const I = BSU.icon;

  /* Car silhouettes (original line drawings) */
  const CAR_PATHS = {
    uber: { body: 'M12 60c0-7 4-11 13-12.5L58 43c11-10 26-17 48-17h26c19 0 33 7 46 17l26 4c9 1.5 14 6 14 12v4c0 3-2 5-5 5H17c-3 0-5-2-5-5z', win: ['M68 43c9-8 21-12 36-12h8v12z', 'M120 31h12c14 0 25 4 35 12h-47z'], wheels: [62, 178] },
    premium: { body: 'M10 60c0-8 3-12 12-14l28-6c8-12 18-20 40-20h52c18 0 30 8 40 20l28 5c8 2 12 6 12 13v6c0 3-2 5-5 5H15c-3 0-5-2-5-5z', win: ['M58 40c7-9 15-14 32-14h22v14z', 'M120 26h22c14 0 22 5 30 14h-52z'], wheels: [60, 182] },
    black: { body: 'M8 61c0-6 4-9 12-10.5L60 45c14-10 30-15 52-15h22c22 0 38 6 52 15l32 5c8 1.5 12 5 12 10v4c0 3-2 5-5 5H13c-3 0-5-2-5-5z', win: ['M72 45c11-7 23-10 40-10h8v10z', 'M128 35h8c17 0 30 3 42 10h-50z'], wheels: [58, 186] },
  };
  BSU.car = (cls = 'uber') => {
    const c = CAR_PATHS[cls] || CAR_PATHS.uber;
    const id = 'cf' + Math.random().toString(36).slice(2, 7);
    return `<svg class="car-svg" viewBox="0 0 240 84" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2b30"/><stop offset="1" stop-color="#0b0b0d"/></linearGradient></defs>
      <ellipse class="shadow" cx="120" cy="76" rx="104" ry="5"/>
      <path class="body" d="${c.body}" style="fill:url(#${id})"/>
      ${c.win.map((w) => `<path class="win" d="${w}"/>`).join('')}
      <rect class="light" x="${cls === 'black' ? 214 : 212}" y="52" width="12" height="3" rx="1.5"/>
      ${c.wheels.map((x) => `<circle class="wheel" cx="${x}" cy="66" r="13"/><circle class="hub" cx="${x}" cy="66" r="4"/>`).join('')}
    </svg>`;
  };
  BSU.CLASS_NAMES = { uber: 'Uber', premium: 'Uber Premium', black: 'Uber Black' };
  BSU.STATUS = {
    pending: { label: 'Finding a driver', badge: 'amber', step: 0 },
    accepted: { label: 'Driver assigned', badge: 'blue', step: 1 },
    enroute: { label: 'Driver on the way', badge: 'blue', step: 2 },
    arrived: { label: 'Driver arrived', badge: 'white', step: 3 },
    inprogress: { label: 'On trip', badge: 'white', step: 4 },
    completed: { label: 'Completed', badge: 'green', step: 5 },
    cancelled: { label: 'Cancelled', badge: 'red', step: -1 },
  };
  BSU.statusBadge = (s) => `<span class="badge ${BSU.STATUS[s]?.badge || ''}">${BSU.STATUS[s]?.label || s}</span>`;
  BSU.stars = (n) => `<span class="stars" aria-label="${n} out of 5 stars">${[1, 2, 3, 4, 5].map((i) => `<span class="${i <= n ? 'star-on' : 'star-off'}">${I.star}</span>`).join('')}</span>`;

  /* Phone mockup. `sheet` is the bottom card's HTML, `top` an optional search bar. */
  BSU.phone = ({ sheet = '', top = '', time = '9:41', cls = '' } = {}) => `
    <div class="phone ${cls}">
      <div class="phone-screen">
        <div class="island"></div>
        <div class="status-bar"><span>${time}</span><span class="icons">${I.signal}${I.battery}</span></div>
        <div class="phone-map" data-phone-map></div>
        ${top ? `<div class="phone-top">${top}</div>` : ''}
        <div class="phone-sheet" data-phone-sheet><div class="grab"></div>${sheet}</div>
        <div class="home-bar"></div>
        <div class="phone-shine"></div>
      </div>
    </div>`;

  /* ---------------- API ---------------- */
  BSU.api = async (url, { method = 'GET', body, quiet } = {}) => {
    const opts = { method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    let res, data;
    try {
      res = await fetch(url, opts);
      data = await res.json().catch(() => ({}));
    } catch {
      const err = new Error('Network error. Check your connection.');
      if (!quiet) BSU.toast(err.message, 'error');
      throw err;
    }
    if (!res.ok || data.ok === false) {
      const err = Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status, data });
      if (!quiet) BSU.toast(err.message, 'error');
      throw err;
    }
    return data;
  };

  /* ---------------- Toasts & modal ---------------- */
  let toastBox;
  BSU.toast = (msg, type = 'info') => {
    toastBox ||= Object.assign(document.body.appendChild(document.createElement('div')), { className: 'toasts', role: 'status' });
    const t = document.createElement('div');
    t.className = 'toast glass';
    t.innerHTML = `${type === 'error' ? I.alert : type === 'ok' ? I.check : I.info}<span>${BSU.esc(msg)}</span>`;
    toastBox.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, type === 'error' ? 5200 : 3400);
  };

  BSU.modal = ({ title, body, wide, actions = [] }) => {
    const m = document.createElement('div');
    m.className = 'modal';
    m.innerHTML = `<div class="modal-box glass ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${BSU.esc(title)}">
      <div class="modal-head"><h3>${BSU.esc(title)}</h3><button class="icon-btn" data-close aria-label="Close">${I.x}</button></div>
      <div class="modal-body">${body}</div>
      ${actions.length ? `<div class="modal-foot">${actions.map((a, i) => `<button class="btn sm ${a.kind || 'ghost'}" data-act="${i}">${BSU.esc(a.label)}</button>`).join('')}</div>` : ''}
    </div>`;
    const close = () => { m.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    m.addEventListener('click', async (e) => {
      if (e.target === m || e.target.closest('[data-close]')) return close();
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const a = actions[Number(b.dataset.act)];
      if (!a.onClick) return close();
      b.classList.add('loading');
      try { if ((await a.onClick(m)) !== false) close(); } catch {} finally { b.classList.remove('loading'); }
    });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(m);
    m.querySelector('input,textarea,select')?.focus();
    return { el: m, close };
  };

  BSU.confirm = (title, text, label = 'Confirm', kind = 'danger') => new Promise((resolve) => {
    let done = false;
    const { el } = BSU.modal({
      title, body: `<p class="muted">${BSU.esc(text)}</p>`,
      actions: [{ label: 'Cancel' }, { label, kind, onClick: () => { done = true; resolve(true); } }],
    });
    new MutationObserver((_, o) => { if (!el.isConnected) { o.disconnect(); if (!done) resolve(false); } }).observe(document.body, { childList: true });
  });

  /* ---------------- Header ---------------- */
  const MENUS = {
    ride: {
      label: 'Ride',
      items: [
        { href: '/ride', icon: 'car', t: 'Request a ride', d: 'Get picked up anywhere in the county' },
        { href: '/pricing', icon: 'tag', t: 'Pricing', d: 'Simple Big Sky Economy fares' },
        { href: '/pricing#classes', icon: 'layers', t: 'Ride classes', d: 'Uber, Uber Premium and Uber Black' },
        { href: '/ride#history', icon: 'clock', t: 'My rides', d: 'Track a trip or rate your driver' },
      ],
      feature: { href: '/pricing#classes', small: 'Executive', title: 'Uber Black', text: 'From $500 a trip', map: true },
    },
    company: {
      label: 'Company',
      items: [
        { href: '/about', icon: 'info', t: 'About Big Sky', d: 'Who we are and how we roll' },
        { href: '/reviews', icon: 'starLine', t: 'Reviews', d: 'What riders say about us' },
        { href: '/about#drive', icon: 'wheel', t: 'Drive with us', d: 'Join the team and earn in-game cash' },
        { href: '/#live', icon: 'radar', t: 'Live drivers', d: 'See who is on the road right now' },
      ],
    },
    support: {
      label: 'Support',
      items: [
        { href: '/about#faq', icon: 'help', t: 'Help & FAQ', d: 'Answers to common questions' },
        { href: '/guidelines', icon: 'book', t: 'Rider guidelines', d: 'How to ride (and drive) right' },
        { href: '/terms', icon: 'doc', t: 'Terms of service', d: 'The rules of using the site' },
        { href: '/privacy', icon: 'lock', t: 'Privacy policy', d: 'What we store and why' },
      ],
      foot: true,
    },
  };
  const NAV = [
    { menu: 'ride' },
    { href: '/pricing', label: 'Pricing', key: 'pricing' },
    { href: '/reviews', label: 'Reviews', key: 'reviews' },
    { menu: 'company' },
    { menu: 'support' },
  ];
  const ACTIVE_MENU = { ride: 'ride', about: 'company', guidelines: 'support', terms: 'support', privacy: 'support' };

  function megaPanel(key) {
    const m = MENUS[key];
    const list = `<div class="mega-list">${m.items.map((it) => `<a class="mega-item" href="${it.href}"><span class="mega-icon">${I[it.icon]}</span><span><b>${it.t}</b><span>${it.d}</span></span></a>`).join('')}</div>`;
    const feature = m.feature ? `<a class="mega-feature" href="${m.feature.href}"><div class="mini-map" data-mini-map></div><small>${m.feature.small}</small><b>${m.feature.title}</b><span>${m.feature.text}</span></a>` : '';
    const foot = m.foot ? `<div class="mega-foot"><span>Need a human?</span><a href="#" data-discord-link>Open a ticket on Discord ${I.arrow}</a></div>` : '';
    return `<section class="mega-panel" data-panel="${key}">${feature ? `<div class="mega-cols">${list}${feature}</div>` : list}${foot}</section>`;
  }

  function renderHeader() {
    const top = $('#top');
    if (!top) return;
    top.innerHTML = `
      <div class="top-row">
        <a class="brand" href="/" aria-label="Big Sky Uber, home">
          <span class="brand-text"><b>Uber</b><i>Big Sky</i></span>
        </a>
        <button class="menu-btn icon-btn" id="menu-btn" type="button" aria-expanded="false" aria-controls="m-nav" aria-label="Menu"><span class="bars"><span></span><span></span></span></button>
        <nav class="top-nav" aria-label="Main">
          <ul class="nav-list">
            <span class="nav-hover" aria-hidden="true"></span>
            ${NAV.map((n) => n.menu
              ? `<li><button class="nav-link ${ACTIVE_MENU[page] === n.menu ? 'active' : ''}" type="button" data-menu="${n.menu}" aria-expanded="false">${MENUS[n.menu].label}${I.chev}</button></li>`
              : `<li><a class="nav-link ${page === n.key ? 'active' : ''}" href="${n.href}">${n.label}</a></li>`).join('')}
          </ul>
          <div class="mega" aria-hidden="true"><div class="mega-bg"></div><span class="mega-arrow"></span>${Object.keys(MENUS).map(megaPanel).join('')}</div>
          <div class="top-side">
            <a class="pill live-pill" href="/#live" title="Drivers online right now"><span class="dot green pulse"></span><span><b data-online>–</b> online</span></a>
            <div class="top-user" id="top-user"><span class="sk" style="display:block;width:96px;height:38px;border-radius:99px"></span></div>
          </div>
        </nav>
        <div class="m-nav" id="m-nav">
          ${Object.entries(MENUS).map(([k, m]) => `<div class="m-group"><h5>${m.label}</h5>${m.items.map((it) => `<a href="${it.href}">${I[it.icon]}${it.t}</a>`).join('')}</div>`).join('')}
          <div class="m-group m-user" id="m-user"></div>
        </div>
      </div>`;

    const btn = $('#menu-btn');
    btn.addEventListener('click', () => {
      const open = !top.classList.contains('menu-open');
      top.classList.toggle('menu-open', open);
      btn.setAttribute('aria-expanded', String(open));
      document.documentElement.style.overflow = open ? 'hidden' : '';
    });
    $$('#m-nav a').forEach((a) => a.addEventListener('click', () => { top.classList.remove('menu-open'); document.documentElement.style.overflow = ''; }));

    const onScroll = () => top.classList.toggle('scrolled', scrollY > 8);
    onScroll();
    addEventListener('scroll', onScroll, { passive: true });

    setupMega(top);
  }

  /* Hover glider + morphing dropdown */
  function setupMega(top) {
    const nav = $('.top-nav', top);
    const list = $('.nav-list', nav);
    const glider = $('.nav-hover', nav);
    const mega = $('.mega', nav);
    const panels = $$('.mega-panel', mega);
    const order = Object.keys(MENUS);
    let current = null;
    let closeTimer;
    let miniMapDone = false;

    const moveGlider = (el) => {
      const lr = list.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      glider.style.width = r.width + 'px';
      glider.style.transform = `translateX(${r.left - lr.left}px)`;
      list.classList.add('hovering');
    };

    const open = (key, trigger) => {
      clearTimeout(closeTimer);
      const panel = panels.find((p) => p.dataset.panel === key);
      if (!panel) return;
      if (!miniMapDone && window.BSUMap) { miniMapDone = true; $$('[data-mini-map]', mega).forEach((m) => BSUMap.mount(m, { width: 220, height: 200, loop: true, duration: 5200, minimal: true })); }
      const prevIdx = order.indexOf(current);
      const idx = order.indexOf(key);
      panels.forEach((p) => {
        p.classList.remove('from-left', 'from-right');
        if (p === panel) {
          if (current && current !== key) p.classList.add(idx > prevIdx ? 'from-right' : 'from-left');
          void p.offsetWidth;
          p.classList.add('active');
          requestAnimationFrame(() => p.classList.remove('from-left', 'from-right'));
        } else {
          p.classList.remove('active');
          if (current === p.dataset.panel) p.classList.add(idx > prevIdx ? 'from-left' : 'from-right');
        }
      });
      const w = panel.offsetWidth, h = panel.offsetHeight;
      const nr = nav.getBoundingClientRect();
      const tr = trigger.getBoundingClientRect();
      let x = tr.left + tr.width / 2 - w / 2 - nr.left;
      x = Math.max(-nr.left + 12, Math.min(x, innerWidth - nr.left - w - 12));
      if (!current) mega.classList.add('instant'); else mega.classList.remove('instant');
      mega.style.setProperty('--mw', w + 'px');
      mega.style.setProperty('--mh', h + 'px');
      mega.style.setProperty('--mx', x + 'px');
      mega.style.setProperty('--ax', tr.left + tr.width / 2 - nr.left - x + 'px');
      mega.classList.add('open');
      mega.setAttribute('aria-hidden', 'false');
      top.classList.add('mega-open');
      $$('[data-menu]', list).forEach((b) => b.setAttribute('aria-expanded', String(b === trigger)));
      current = key;
    };

    const close = () => {
      mega.classList.remove('open');
      mega.setAttribute('aria-hidden', 'true');
      top.classList.remove('mega-open');
      panels.forEach((p) => p.classList.remove('active'));
      $$('[data-menu]', list).forEach((b) => b.setAttribute('aria-expanded', 'false'));
      current = null;
    };
    const closeSoon = () => { clearTimeout(closeTimer); closeTimer = setTimeout(close, 160); };

    $$('.nav-link', list).forEach((el) => {
      el.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'touch') return;
        moveGlider(el);
        if (el.dataset.menu) open(el.dataset.menu, el); else closeSoon();
      });
      el.addEventListener('focus', () => moveGlider(el));
      if (el.dataset.menu) {
        el.addEventListener('click', () => (current === el.dataset.menu ? close() : open(el.dataset.menu, el)));
        el.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); open(el.dataset.menu, el); $('.mega-panel.active a', mega)?.focus(); } });
      }
    });
    // Keep the panel sized to its content (web fonts can load after it was measured).
    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(() => {
        const p = panels.find((x) => x.classList.contains('active'));
        if (!p) return;
        mega.style.setProperty('--mw', p.offsetWidth + 'px');
        mega.style.setProperty('--mh', p.offsetHeight + 'px');
      });
      panels.forEach((p) => ro.observe(p));
    }
    list.addEventListener('pointerleave', () => { list.classList.remove('hovering'); if (current) closeSoon(); });
    mega.addEventListener('pointerenter', () => clearTimeout(closeTimer));
    mega.addEventListener('pointerleave', closeSoon);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && current) { const b = $(`[data-menu="${current}"]`, list); close(); b?.focus(); } });
    document.addEventListener('click', (e) => { if (current && !nav.contains(e.target)) close(); });
    addEventListener('resize', close);
  }

  /* ---------------- Footer ---------------- */
  function renderFooter() {
    const foot = $('#foot');
    if (!foot) return;
    const links = [['/ride', 'Request a ride'], ['/pricing', 'Pricing'], ['/reviews', 'Reviews'], ['/about', 'About'], ['/guidelines', 'Guidelines'], ['/privacy', 'Privacy'], ['/terms', 'Terms']];
    foot.innerHTML = `
      <div class="wrap">
        <div class="foot-grid">
          <a class="brand" href="/" aria-label="Big Sky Uber, home"><span class="brand-text"><b>Uber</b><i>Big Sky</i></span></a>
          <nav class="foot-links" aria-label="Footer">${links.map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}<a href="#" data-discord-link>Discord</a></nav>
        </div>
        <div class="foot-base">
          <span>© ${new Date().getFullYear()} Big Sky Uber · a roleplay business in ER:LC<span data-server-code hidden></span></span>
          <span>Not affiliated with Uber Technologies Inc., Roblox Corporation or Police Roleplay Community.</span>
        </div>
      </div>`;
  }

  /* ---------------- Auth / user ---------------- */
  BSU.loginUrl = (next = location.pathname + location.search + location.hash) => `/api/auth/login?next=${encodeURIComponent(next)}`;
  BSU.logout = async () => {
    try { await BSU.api('/api/auth/logout', { method: 'POST', body: {}, quiet: true }); } catch {}
    location.href = '/';
  };

  function renderUser({ viewer, access }) {
    const box = $('#top-user');
    const mbox = $('#m-user');
    if (!box) return;
    if (!viewer) {
      const signIn = `<a class="btn sm discord" href="${BSU.loginUrl()}">${I.discord}<span>Sign in</span></a>`;
      box.innerHTML = signIn;
      if (mbox) mbox.innerHTML = `<a class="btn discord block" href="${BSU.loginUrl()}">${I.discord}<span>Sign in with Discord</span></a>`;
      return;
    }
    const roles = [access.admin && '<span class="badge white">Admin</span>', access.worker && '<span class="badge">Driver</span>'].filter(Boolean).join('');
    const links = `
      <a class="pop-item" href="/ride" role="menuitem">${I.car}Request a ride</a>
      <a class="pop-item" href="/ride#history" role="menuitem">${I.clock}My rides</a>
      <a class="pop-item" href="/reviews#write" role="menuitem">${I.starLine}Leave a review</a>
      ${access.worker || access.admin ? '<div class="pop-sep"></div>' : ''}
      ${access.worker ? `<a class="pop-item" href="/workers" role="menuitem">${I.wheel}Driver panel</a>` : ''}
      ${access.admin ? `<a class="pop-item" href="/admin" role="menuitem">${I.shield}Admin panel</a>` : ''}
      <div class="pop-sep"></div>
      <button class="pop-item" type="button" data-logout role="menuitem">${I.out}Sign out</button>`;
    box.innerHTML = `
      <div class="user-menu">
        <button class="user-btn" type="button" aria-haspopup="true" aria-expanded="false">
          <img src="${BSU.esc(viewer.avatar)}" alt="" width="30" height="30"><span>${BSU.esc(viewer.name)}</span>
        </button>
        <div class="user-pop glass" role="menu">
          <div class="who"><b>${BSU.esc(viewer.name)}</b><span>@${BSU.esc(viewer.username)}</span>${roles ? `<div class="roles">${roles}</div>` : ''}</div>
          ${links}
        </div>
      </div>`;
    if (mbox) {
      mbox.innerHTML = `<h5>Signed in as ${BSU.esc(viewer.name)}</h5>
        ${access.worker ? `<a href="/workers">${I.wheel}Driver panel</a>` : ''}
        ${access.admin ? `<a href="/admin">${I.shield}Admin panel</a>` : ''}
        <a href="#" data-logout>${I.out}Sign out</a>`;
    }
    const menu = box.firstElementChild;
    const btn = menu.querySelector('.user-btn');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !menu.classList.contains('open');
      menu.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', (e) => { if (!menu.contains(e.target)) { menu.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); } });
    $$('[data-logout]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); BSU.logout(); }));
  }

  function applySettings(s, stats) {
    $$('[data-online]').forEach((el) => (el.textContent = stats?.online ?? 0));
    $$('[data-discord-link]').forEach((a) => {
      if (s.discordInvite) { a.href = s.discordInvite; a.target = '_blank'; a.rel = 'noopener'; }
      else a.href = '/about#faq';
    });
    $$('[data-server-code]').forEach((el) => {
      if (!s.serverCode) return;
      el.hidden = false;
      el.innerHTML = ` · server code <b class="mono" style="color:var(--text-2)">${BSU.esc(s.serverCode)}</b>`;
    });
    if (s.announcement && !['admin', 'workers'].includes(page)) {
      const bar = document.createElement('div');
      bar.className = 'announce';
      bar.textContent = s.announcement;
      $('#top')?.after(bar);
    }
  }

  /* ---------------- Animations ---------------- */
  BSU.split = (el) => {
    if (el.dataset.splitDone) return;
    el.dataset.splitDone = '1';
    let i = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            const w = document.createElement('span');
            w.className = 'w';
            w.innerHTML = `<span style="--i:${i++}">${BSU.esc(part)}</span>`;
            frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && !n.classList.contains('w')) {
          if (n.matches('br')) return;
          walk(n);
        }
      });
    };
    walk(el);
    el.classList.add('split');
  };

  // Reveal-on-scroll. A plain scroll check (not only IntersectionObserver), so fast scrolls,
  // anchor jumps and restored scroll positions can never leave a section invisible.
  const waiting = new Set();
  const check = () => {
    const limit = innerHeight * 0.92;
    for (const el of waiting) {
      if (el.getBoundingClientRect().top < limit) { el.classList.add('in'); waiting.delete(el); }
    }
  };
  let ticking = false;
  const onScrollReveal = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; check(); });
  };
  addEventListener('scroll', onScrollReveal, { passive: true });
  addEventListener('resize', onScrollReveal);
  addEventListener('hashchange', () => setTimeout(check, 50));
  BSU.reveal = (root = document) => {
    $$('[data-split]', root).forEach(BSU.split);
    $$('.reveal, .split', root).forEach((el) => { if (!el.classList.contains('in')) waiting.add(el); });
    requestAnimationFrame(check);
  };

  // Cursor spotlight on cards
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest?.('[data-spot]');
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', e.clientX - r.left + 'px');
    el.style.setProperty('--my', e.clientY - r.top + 'px');
  }, { passive: true });

  // Count-up numbers
  BSU.countUp = (el, to, { prefix = '', suffix = '', decimals = 0, ms = 1400 } = {}) => {
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - p, 4);
      el.textContent = prefix + (to * e).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  /* Segmented control glider */
  BSU.seg = (root) => {
    const g = root.querySelector('.seg-glider') || root.insertBefore(Object.assign(document.createElement('span'), { className: 'seg-glider' }), root.firstChild);
    const place = () => {
      const on = root.querySelector('input:checked + label');
      if (!on) { g.style.opacity = 0; return; }
      g.style.opacity = 1;
      g.style.width = on.offsetWidth + 'px';
      g.style.transform = `translateX(${on.offsetLeft - 4}px)`;
    };
    root.addEventListener('change', place);
    addEventListener('resize', place);
    requestAnimationFrame(place);
    return place;
  };

  /* ---------------- Boot ---------------- */
  renderHeader();
  renderFooter();

  const AUTH_MSG = {
    ok: ['Signed in with Discord.', 'ok'],
    cancelled: ['Sign-in was cancelled.', 'info'],
    expired: ['Sign-in expired, please try again.', 'error'],
    failed: ['Discord sign-in failed. Try again.', 'error'],
    banned: ['This account is banned from Big Sky Uber.', 'error'],
    unconfigured: ['Discord sign-in is not set up yet (missing DISCORD_CLIENT_ID).', 'error'],
  };
  const params = new URLSearchParams(location.search);
  if (params.has('auth')) {
    const m = AUTH_MSG[params.get('auth')];
    if (m) setTimeout(() => BSU.toast(m[0], m[1]), 300);
    params.delete('auth');
    history.replaceState(null, '', location.pathname + (params.toString() ? '?' + params : '') + location.hash);
  }

  const FALLBACK = { settings: { accepting: true, prices: { uber: { name: 'Uber', min: 100, max: 250, enabled: true }, premium: { name: 'Uber Premium', min: 250, max: 500, enabled: true }, black: { name: 'Uber Black', min: 500, max: 1000, enabled: true } }, trips: { local: { label: 'Local', f: 0 }, town: { label: 'Cross-town', f: 0.5 }, county: { label: 'County-wide', f: 1 } }, maxPassengers: 4 }, viewer: null, access: { worker: false, admin: false }, stats: { online: 0, completed: 0, rating: 0, reviews: 0 }, offline: true };

  BSU.boot = BSU.api('/api/site?op=bootstrap', { quiet: true })
    .catch(() => FALLBACK)
    .then((data) => {
      BSU.settings = data.settings;
      BSU.viewer = data.viewer;
      BSU.access = data.access || { worker: false, admin: false };
      BSU.stats = data.stats;
      renderUser(data);
      if (!data.settings.serverCode && data.server?.joinKey) data.settings.serverCode = data.server.joinKey;
      BSU.server = data.server || null;
      applySettings(data.settings, data.stats);
      return data;
    });

  requestAnimationFrame(() => BSU.reveal());

  // Legal pages: highlight the section you're reading.
  const toc = $('.toc');
  if (toc && 'IntersectionObserver' in window) {
    const links = $$('a', toc);
    const spy = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) links.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id));
    }), { rootMargin: '-20% 0px -70% 0px' });
    links.forEach((a) => { const t = document.getElementById(a.getAttribute('href').slice(1)); if (t) spy.observe(t); });
  }
})();
