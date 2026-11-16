/* Big Sky Uber · stylised ER:LC map of Big Sky with animated route tracing.
   Streets, landmarks and postal codes come from the ER:LC wiki. The layout is stylised, not to scale.

   BSUMap.mount(el, { width, height, seed, loop, duration, safeTop, safeBottom, minimal, labels, area,
                      from, to, onProgress, onRoute, progress })
   returns { setProgress(p), play(), stop(), newRoute(seed?), setLabels(from, to), route } */
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- ER:LC data ---------- */
  const AREAS = {
    city: { label: 'River City', postals: '200–220, 400s' },
    industrial: { label: 'Industrial Zone', postals: '300s' },
    springfield: { label: 'Springfield', postals: '1100s' },
    fairview: { label: 'Fairview', postals: '800s' },
    county: { label: 'Big Sky County', postals: 'Rural' },
  };

  const LOCATIONS = [
    // River City
    { name: 'Civilian Spawn', area: 'city', postal: '202' },
    { name: 'River City DMV', area: 'city', postal: '201' },
    { name: 'Gas-N-Go (River City)', area: 'city', postal: '200', street: '215 Freedom Avenue' },
    { name: 'Car Dealership', area: 'city', postal: '203', street: '211 Main Street' },
    { name: 'Bank of River City', area: 'city', postal: '205', street: '213 Sandstone Road' },
    { name: 'Liberty Cafe', area: 'city', postal: '207', street: '214 Freedom Avenue' },
    { name: 'Channel 5 News Station', area: 'city', postal: '208', street: '220 Main Street' },
    { name: 'La Mesa', area: 'city', street: '208 Southern Avenue' },
    { name: 'RCFR Fire Station 1', area: 'city', postal: '210' },
    { name: 'Vehicle Modification Shop', area: 'city', postal: '211' },
    { name: 'Parking Garage', area: 'city', postal: '213' },
    { name: 'Downtown Park (Fountain)', area: 'city', postal: '216' },
    { name: 'Three Guys Burgers & Fries', area: 'city', postal: '217', street: '224 Main Street' },
    { name: 'River City Apartments', area: 'city', postal: '217' },
    { name: 'Valley Transit Office', area: 'city', postal: '217' },
    { name: 'City Park', area: 'city', postal: '218' },
    { name: 'Chinatown', area: 'city', postal: '220', street: 'Liberty Way' },
    { name: 'Liberty Guns & Ammo', area: 'city', postal: '401', street: '227 Fairfax Road' },
    { name: 'Shopping Outlet', area: 'city', postal: '403', street: '230 Independence Parkway' },
    { name: 'Family Jewels', area: 'city', postal: '403', street: '230 Independence Parkway' },
    { name: "Mike's Auto Works", area: 'city', street: '231 Independence Parkway' },
    { name: 'Big Sky Hospital', area: 'city', postal: '404', street: 'Medical Way' },
    { name: 'Tool Store', area: 'city', postal: '406' },
    // Industrial
    { name: 'RCPD Headquarters', area: 'industrial', postal: '305' },
    { name: 'Waste Center', area: 'industrial', postal: '303' },
    { name: 'Power Plant', area: 'industrial', postal: '306' },
    { name: 'Gas Depot', area: 'industrial', postal: '307' },
    { name: 'Department of Transportation', area: 'industrial', postal: '310' },
    { name: 'Gas-N-Go (Industrial)', area: 'industrial', street: '322 Freight Street' },
    { name: 'Big Sky Post Office', area: 'industrial', street: '308 Gibson Lane' },
    // Springfield
    { name: 'Downtown Springfield', area: 'springfield', street: 'Maple Street' },
    { name: 'Spring Bakery', area: 'springfield', street: '1105 Maple Street' },
    { name: "Rick and John's", area: 'springfield', street: '1105 Maple Street' },
    { name: 'Liberty Apparel (Springfield)', area: 'springfield', street: '1107 Maple Street' },
    { name: 'Springfield Barber Shop', area: 'springfield', street: '1104 Maple Street' },
    { name: 'Gas-N-Go (Springfield)', area: 'springfield', street: '1102 Oak Valley Drive' },
    { name: "Joe's Repair and Body Shop", area: 'springfield', street: '1108 Oak Valley Drive' },
    { name: 'RCFR Station 2', area: 'springfield' },
    { name: 'Springfield Parking Garage', area: 'springfield' },
    { name: 'Springfield Theater', area: 'springfield' },
    { name: 'Polyhouse Hotel', area: 'springfield', street: 'Maple Street' },
    // Fairview
    { name: 'Gas-N-Go (Fairview)', area: 'fairview', street: '802 Fairview Avenue' },
    { name: 'Pancake House', area: 'fairview', street: 'Fairview Avenue' },
    // County
    { name: "Sheriff's Office (LCSO)", area: 'county', street: 'Highway 55' },
    { name: 'Big Sky Jail', area: 'county' },
    { name: 'Big Sky Courthouse', area: 'county' },
    { name: 'High Rock Park', area: 'county', street: 'Highway 55' },
    { name: 'Spring Lake', area: 'county', street: 'Northern Way' },
    { name: 'Farms', area: 'county', street: 'Colonial Drive' },
    { name: 'Gas-N-Go (County)', area: 'county', street: 'Colonial Drive' },
    { name: 'Housing Suburb', area: 'county' },
    { name: 'Wooden Bridge', area: 'county', street: 'Riverside Drive' },
  ];

  const STREETS = {
    city: {
      h: ['Freedom Avenue', 'Main Street', 'Independence Parkway', 'Orchard Boulevard', 'Sandstone Road', 'Southern Avenue', 'Park Street', 'Cross Street', 'Grand Avenue'],
      v: ['Medical Way', 'Liberty Way', 'Hillview Road', 'Durham Road', 'Georgia Avenue', 'Cline Street', 'Industrial Road', 'Madison Court'],
      bridges: ['Freedom Bridge', 'Orchard Bridge', 'Independence Bridge'],
    },
    county: {
      h: ['Colonial Drive', 'Fairfax Road', 'Valley Drive', 'Spring Creek Road', 'Northern Way', 'Emerson Road', 'Joyner Road', 'Gibson Lane'],
      v: ['Highway 55', 'Maple Street', 'Oak Valley Drive', 'Grant Street', 'Cedar Street', 'Elm Street', 'Terrace Drive'],
      bridges: ['Wooden Bridge', 'Colonial Bridge', 'Spring Creek Bridge', 'Red Bridge'],
    },
  };

  const findLocation = (name) => {
    const n = String(name || '').trim().toLowerCase();
    return n ? LOCATIONS.find((l) => l.name.toLowerCase() === n) || null : null;
  };
  const pinText = (loc) => {
    if (!loc) return '';
    if (typeof loc === 'string') { const known = findLocation(loc); return known ? pinText(known) : loc; }
    return (loc.postal ? loc.postal + ' · ' : '') + loc.name;
  };

  /* ---------- helpers ---------- */
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  }
  function el(tag, attrs = {}, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function roundedPath(pts, rad) {
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      const l1 = Math.hypot(x1 - x0, y1 - y0), l2 = Math.hypot(x2 - x1, y2 - y1);
      const r = Math.min(rad, l1 / 2, l2 / 2);
      const ax = x1 - ((x1 - x0) / l1) * r, ay = y1 - ((y1 - y0) / l1) * r;
      const bx = x1 + ((x2 - x1) / l2) * r, by = y1 + ((y2 - y1) / l2) * r;
      d += ` L${ax.toFixed(1)} ${ay.toFixed(1)} Q${x1} ${y1} ${bx.toFixed(1)} ${by.toFixed(1)}`;
    }
    const last = pts[pts.length - 1];
    return d + ` L${last[0]} ${last[1]}`;
  }

  function mount(container, opts = {}) {
    const W = opts.width || 390;
    const H = opts.height || 844;
    const minimal = Boolean(opts.minimal);
    const showLabels = !minimal && opts.labels !== false;
    let r = rng(opts.seed ?? (Math.random() * 1e9) | 0);
    const zone = ['county', 'springfield', 'fairview'].includes(opts.area) ? STREETS.county
      : ['city', 'industrial'].includes(opts.area) ? STREETS.city
      : r() < 0.75 ? STREETS.city : STREETS.county;
    const areaName = opts.area ? AREAS[opts.area]?.label : zone === STREETS.city ? 'River City' : 'Big Sky County';

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'bsu-map', preserveAspectRatio: 'xMidYMid slice', 'aria-hidden': 'true' });
    const defs = el('defs', {}, svg);
    const fid = 'g' + Math.random().toString(36).slice(2, 8);
    const f = el('filter', { id: fid, x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
    el('feGaussianBlur', { stdDeviation: minimal ? 3 : 7 }, f);

    // The river runs north to south through the middle of the county.
    const riverW = minimal ? 16 : 30;
    const rx0 = W * (0.52 + (r() - 0.5) * 0.25);
    const amp = W * 0.06, phase = r() * Math.PI * 2;
    const riverX = (y) => rx0 + Math.sin((y / H) * Math.PI * 1.6 + phase) * amp;
    let riverD = `M${riverX(-40).toFixed(1)} -40`;
    for (let y = -20; y <= H + 40; y += 20) riverD += ` L${riverX(y).toFixed(1)} ${y}`;

    // Street grid (vertical streets avoid the river; Riverside Drive hugs its west bank).
    const xs = [], ys = [];
    for (let x = -10 - r() * 30; x < W + 60; x += (minimal ? 30 : 46) + r() * (minimal ? 30 : 54)) {
      const xr = Math.round(x);
      if (Math.abs(xr - rx0) > riverW + amp + 14) xs.push(xr);
    }
    for (let y = -10 - r() * 30; y < H + 60; y += (minimal ? 30 : 50) + r() * (minimal ? 34 : 60)) ys.push(Math.round(y));
    const mainY = new Set(ys.filter((_, i) => i % 3 === 1));

    // Blocks that would sit in the river (or on Riverside Drive) are skipped.
    const riverLo = rx0 - amp - riverW / 2 - 24, riverHi = rx0 + amp + riverW / 2 + 6;
    const inRiver = (x, w) => x + w > riverLo && x < riverHi;

    const gBlocks = el('g', {}, svg);
    for (let i = 0; i < xs.length - 1; i++) {
      for (let j = 0; j < ys.length - 1; j++) {
        const x = xs[i] + 4, y = ys[j] + 4, w = xs[i + 1] - xs[i] - 8, h = ys[j + 1] - ys[j] - 8;
        if (w < 6 || h < 6 || inRiver(x, w)) continue;
        const roll = r();
        if (roll < 0.07) { el('rect', { x, y, width: w, height: h, rx: 4, class: 'park' }, gBlocks); continue; }
        el('rect', { x, y, width: w, height: h, rx: 3, class: 'blk ' + (roll < 0.4 ? 'b2' : roll > 0.85 ? 'b3' : '') }, gBlocks);
        if (!minimal && w > 30 && h > 30 && r() < 0.6) {
          const n = 1 + Math.floor(r() * 3);
          for (let k = 0; k < n; k++) {
            const bw = w * (0.25 + r() * 0.3), bh = h * (0.25 + r() * 0.3);
            el('rect', { x: (x + 4 + r() * (w - bw - 8)).toFixed(1), y: (y + 4 + r() * (h - bh - 8)).toFixed(1), width: bw.toFixed(1), height: bh.toFixed(1), rx: 2, class: 'bld' }, gBlocks);
          }
        }
      }
    }

    el('path', { d: riverD, class: 'river-bank', 'stroke-width': riverW + 8 }, svg);
    el('path', { d: riverD, class: 'water', 'stroke-width': riverW }, svg);

    const gSt = el('g', {}, svg);
    // Riverside Drive: the main north–south road along the river.
    const rsOff = riverW / 2 + 12;
    let rsD = `M${(riverX(-40) - rsOff).toFixed(1)} -40`;
    for (let y = -20; y <= H + 40; y += 20) rsD += ` L${(riverX(y) - rsOff).toFixed(1)} ${y}`;
    el('path', { d: rsD, class: 'st main', fill: 'none', 'stroke-width': minimal ? 5 : 9 }, gSt);
    xs.forEach((x) => el('line', { x1: x, y1: -20, x2: x, y2: H + 20, class: 'st', 'stroke-width': minimal ? 3 : 5 }, gSt));
    ys.forEach((y) => el('line', { x1: -20, y1: y, x2: W + 20, y2: y, class: 'st' + (mainY.has(y) ? ' main' : ''), 'stroke-width': mainY.has(y) ? (minimal ? 5 : 9) : minimal ? 3 : 5 }, gSt));
    // Bridges where the main streets cross the river.
    const bridgeYs = ys.filter((y) => mainY.has(y) && y > 0 && y < H);
    bridgeYs.forEach((y) => {
      const bx = riverX(y);
      el('rect', { x: bx - riverW / 2 - 6, y: y - (minimal ? 4 : 7), width: riverW + 12, height: minimal ? 8 : 14, rx: 2, class: 'bridge' }, gSt);
    });

    if (showLabels) {
      const hNames = [...zone.h].sort(() => r() - 0.5);
      const vNames = [...zone.v].sort(() => r() - 0.5);
      const labelH = (y, text) => { const t = el('text', { x: 14 + r() * 40, y: y - 8, class: 'lbl' }, svg); t.textContent = text; };
      const labelV = (x, y, text) => { const t = el('text', { x: x + 9, y, class: 'lbl', transform: `rotate(90 ${x + 9} ${y})` }, svg); t.textContent = text; };
      [...mainY].filter((y) => y > 40 && y < H - 40).slice(0, 3).forEach((y, i) => labelH(y, hNames[i]));
      xs.filter((x) => x > 30 && x < W - 30).slice(0, 2).forEach((x, i) => labelV(x, H * (0.3 + i * 0.25), vNames[i]));
      labelV(riverX(H * 0.62) - rsOff - 4, H * 0.55, 'Riverside Drive');
      const rl = el('text', { x: riverX(H * 0.82) + riverW / 2 + 6, y: H * 0.82, class: 'lbl water-lbl', transform: `rotate(90 ${riverX(H * 0.82) + riverW / 2 + 6} ${H * 0.82})` }, svg);
      rl.textContent = 'Big Sky River';
      if (bridgeYs[0] !== undefined) { const t = el('text', { x: riverX(bridgeYs[0]) + riverW / 2 + 10, y: bridgeYs[0] + 18, class: 'lbl' }, svg); t.textContent = zone.bridges[Math.floor(r() * zone.bridges.length)]; }
      const area = el('text', { x: W / 2, y: H * 0.47, class: 'area-lbl', 'text-anchor': 'middle' }, svg);
      area.textContent = areaName;
    }

    // Route layer
    const gRoute = el('g', {}, svg);
    const sw = minimal ? 3.5 : 6;
    const base = el('path', { class: 'rt-base', 'stroke-width': sw + 2 }, gRoute);
    const glow = el('path', { class: 'rt-glow', 'stroke-width': sw + 8, filter: `url(#${fid})` }, gRoute);
    const line = el('path', { class: 'rt', 'stroke-width': sw }, gRoute);
    const done = el('path', { class: 'rt-done', 'stroke-width': sw }, gRoute);

    const pinA = el('g', {}, gRoute);
    el('circle', { r: minimal ? 9 : 14, class: 'pin-ring', 'stroke-width': 1.5 }, pinA);
    el('circle', { r: minimal ? 4 : 7, fill: '#fff' }, pinA);
    el('circle', { r: minimal ? 1.6 : 3, fill: '#000' }, pinA);
    const pinB = el('g', {}, gRoute);
    const bs = minimal ? 8 : 14;
    el('rect', { x: -bs / 2, y: -bs / 2, width: bs, height: bs, rx: 2, fill: '#fff' }, pinB);
    el('rect', { x: -bs / 5, y: -bs / 5, width: bs / 2.5, height: bs / 2.5, fill: '#000' }, pinB);

    const car = el('g', {}, gRoute);
    el('circle', { r: minimal ? 9 : 16, class: 'car-halo' }, car);
    el('circle', { r: minimal ? 5.5 : 10, fill: '#fff', stroke: '#000', 'stroke-width': 2 }, car);
    const arrow = el('path', { d: minimal ? 'M-2.4 2 L0 -3 L2.4 2 L0 1 Z' : 'M-4 3.5 L0 -5 L4 3.5 L0 1.8 Z', fill: '#000' }, car);

    // Pin labels (glass pills)
    const mkTag = () => {
      const g = el('g', { class: 'pin-tag' }, gRoute);
      const rect = el('rect', { rx: 9, height: 20 }, g);
      const text = el('text', { y: 14 }, g);
      return { g, rect, text };
    };
    const tagA = showLabels ? mkTag() : null;
    const tagB = showLabels ? mkTag() : null;
    const placeTag = (tag, label, px, py) => {
      if (!tag) return;
      tag.text.textContent = label || '';
      tag.g.style.display = label ? '' : 'none';
      if (!label) return;
      const w = Math.min(W - 16, label.length * 5.9 + 18);
      tag.rect.setAttribute('width', w);
      tag.text.setAttribute('x', 9);
      let x = px - w / 2;
      x = Math.max(8, Math.min(W - w - 8, x));
      let y = py - 40;
      if (y < (opts.safeTop ?? 150) - 20) y = py + 18;
      tag.g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    };

    container.innerHTML = '';
    container.appendChild(svg);

    const safeTop = opts.safeTop ?? (minimal ? 20 : 150);
    const safeBottom = opts.safeBottom ?? (minimal ? 20 : 300);
    let len = 1;
    const api = { route: null, areaName };
    let labels = { from: opts.from, to: opts.to };

    const pickPlaces = () => {
      const pool = LOCATIONS.filter((l) => l.postal && (zone === STREETS.city ? l.area === 'city' || l.area === 'industrial' : true));
      const a = pool[Math.floor(r() * pool.length)];
      let b; do { b = pool[Math.floor(r() * pool.length)]; } while (b === a);
      return { from: a, to: b };
    };

    api.setLabels = (from, to) => {
      labels = { from, to };
      if (!api.route) return;
      const { pts } = api.route;
      placeTag(tagA, pinText(from), pts[0][0], pts[0][1]);
      const end = pts[pts.length - 1];
      placeTag(tagB, pinText(to), end[0], end[1]);
    };

    api.newRoute = (seed) => {
      if (seed !== undefined) r = rng(seed);
      let inX = xs.map((x, i) => [x, i]).filter(([x]) => x > 26 && x < W - 26);
      let inY = ys.map((y, i) => [y, i]).filter(([y]) => y > safeTop && y < H - safeBottom);
      // Small maps may not have enough streets inside the safe area: fall back to any street.
      if (inX.length < 2) inX = xs.map((x, i) => [x, i]).filter(([x]) => x > 8 && x < W - 8);
      if (inY.length < 2) inY = ys.map((y, i) => [y, i]).filter(([y]) => y > 8 && y < H - 8);
      if (inX.length < 2 || inY.length < 2) {
        inX = [[Math.round(W * 0.25), 0], [Math.round(W * 0.75), 1]];
        inY = [[Math.round(H * 0.3), 0], [Math.round(H * 0.7), 1]];
      }
      const pick = (arr) => arr[Math.floor(r() * arr.length)];
      let a, b, tries = 0;
      do { a = [pick(inX), pick(inY)]; b = [pick(inX), pick(inY)]; tries++; }
      while ((Math.abs(a[0][1] - b[0][1]) < 2 || Math.abs(a[1][1] - b[1][1]) < 2) && tries < 30);
      // Cross town on a main street (over a bridge) when we can.
      const mains = inY.filter(([y]) => mainY.has(y));
      const midY = (mains.length ? pick(mains) : pick(inY))[0];
      const pts = [[a[0][0], a[1][0]], [a[0][0], midY], [b[0][0], midY], [b[0][0], b[1][0]]]
        .filter((p, i, arr) => i === 0 || p[0] !== arr[i - 1][0] || p[1] !== arr[i - 1][1]);
      const d = roundedPath(pts, minimal ? 8 : 16);
      [base, glow, line, done].forEach((p) => p.setAttribute('d', d));
      len = line.getTotalLength();
      line.style.strokeDasharray = glow.style.strokeDasharray = done.style.strokeDasharray = `${len} ${len}`;
      pinA.setAttribute('transform', `translate(${pts[0][0]} ${pts[0][1]})`);
      const end = pts[pts.length - 1];
      pinB.setAttribute('transform', `translate(${end[0]} ${end[1]})`);
      const places = labels.from || labels.to ? labels : pickPlaces();
      api.route = { pts, len, from: places.from, to: places.to };
      if (showLabels) api.setLabels(places.from, places.to);
      if (places !== labels) labels = {}; // random places: pick new ones next loop
      api.setProgress(0);
      opts.onRoute?.(api.route);
    };

    /** 0 → 0.3 draws the route, 0.3 → 1 drives the car along it. */
    api.setProgress = (p) => {
      if (!api.route || !line.getAttribute('d')) return;
      p = Math.max(0, Math.min(1, p));
      const draw = Math.min(1, p / 0.3);
      const drive = Math.max(0, (p - 0.3) / 0.7);
      const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
      const off = len * (1 - ease(draw));
      line.style.strokeDashoffset = glow.style.strokeDashoffset = off;
      const dl = len * ease(drive);
      done.style.strokeDashoffset = len - dl;
      done.style.opacity = drive > 0 ? 1 : 0;
      const at = Math.max(0.01, Math.min(len - 0.01, dl));
      const pt = line.getPointAtLength(at);
      const ahead = line.getPointAtLength(Math.min(len, at + 2));
      const behind = line.getPointAtLength(Math.max(0, at - 2));
      const ang = (Math.atan2(ahead.y - behind.y, ahead.x - behind.x) * 180) / Math.PI + 90;
      car.setAttribute('transform', `translate(${pt.x.toFixed(1)} ${pt.y.toFixed(1)})`);
      arrow.setAttribute('transform', `rotate(${ang.toFixed(1)})`);
      car.style.opacity = draw >= 1 ? 1 : 0;
      opts.onProgress?.(p, { draw, drive });
    };

    let raf = 0, t0 = 0, running = false;
    const duration = opts.duration || 9000;
    const hold = 1400;
    const frame = (now) => {
      if (!running) return;
      if (!t0) t0 = now;
      const elapsed = now - t0;
      if (elapsed > duration + hold) { t0 = now; api.newRoute(); }
      api.setProgress(Math.min(1, elapsed / duration));
      raf = requestAnimationFrame(frame);
    };
    api.play = () => {
      if (reduce) { api.setProgress(0.65); return; }
      if (running) return;
      running = true; t0 = 0; raf = requestAnimationFrame(frame);
    };
    api.stop = () => { running = false; cancelAnimationFrame(raf); };

    api.newRoute();
    if (opts.loop) {
      if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => (e.isIntersecting ? api.play() : api.stop())).observe(container);
      else api.play();
    } else if (opts.progress !== undefined) api.setProgress(opts.progress);
    return api;
  }

  window.BSUMap = { mount, LOCATIONS, AREAS, STREETS, findLocation, pinText };
})();
