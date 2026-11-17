/* Big Sky Uber · stylised ER:LC map of Big Sky with animated route tracing.
   Streets, landmarks and postal codes follow the current ER:LC map. The layout is stylised, not to scale.

   BSUMap.mount(el, { width, height, seed, loop, duration, safeTop, safeBottom, minimal, labels, area,
                      from, to, onProgress, onRoute, progress })
   returns { setProgress(p), play(), stop(), newRoute(seed?), setLabels(from, to), route } */
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- ER:LC data ----------
     Updated to the current ER:LC map (cross-checked with erlc.one, map v2.3.1, Oct 2026).
     Postals are the nearest postal sign to each building. */
  const AREAS = {
    city: { label: 'River City', postals: '200–231, 400s' },
    industrial: { label: 'Industrial Zone', postals: '300–323' },
    springfield: { label: 'Springfield', postals: '1100s' },
    fairview: { label: 'Fairview', postals: '800s' },
    county: { label: 'Big Sky County', postals: '500–1000s, 1200s' },
  };

  const LOCATIONS = [
    // River City
    { name: 'Bayside Beach', area: 'city', postal: '200', street: 'Vacation Court' },
    { name: 'Bayside Boardwalk', area: 'city', postal: '201', street: 'Liberty Way' },
    { name: 'Metro Tactical & Public Safety Supply', area: 'city', postal: '204', street: 'Liberty Way' },
    { name: 'Dragon Shop', area: 'city', postal: '204', street: 'Liberty Way' },
    { name: 'Chinatown', area: 'city', postal: '207', street: 'Liberty Way' },
    { name: 'La Mesa', area: 'city', postal: '208', street: 'Park Avenue' },
    { name: 'River City DMV', area: 'city', postal: '210', street: 'Durham Road' },
    { name: 'Car Dealership', area: 'city', postal: '211', street: 'Main Street' },
    { name: 'RC Bank', area: 'city', postal: '213', street: 'Freedom Avenue' },
    { name: 'Liberty Cafe', area: 'city', postal: '214', street: 'Durham Road' },
    { name: 'Gas-N-Go (River City)', area: 'city', postal: '215', street: 'Main Street' },
    { name: 'Downtown Park', area: 'city', postal: '217', street: 'Grand Avenue' },
    { name: 'Brookstone Apartments', area: 'city', postal: '218', street: 'Freedom Avenue' },
    { name: 'News Station', area: 'city', postal: '220', street: 'Orchard Boulevard' },
    { name: 'River City Fire Station', area: 'city', postal: '221', street: 'Fairfax Road' },
    { name: 'City Hall', area: 'city', postal: '222', street: 'Sandstone Road' },
    { name: 'Valley Transit', area: 'city', postal: '223', street: 'Main Street' },
    { name: 'Three Guys Burgers & Fries', area: 'city', postal: '224', street: 'Main Street' },
    { name: 'Royal Scoop', area: 'city', postal: '225', street: 'Park Avenue' },
    { name: 'Taco Bout', area: 'city', postal: '225', street: 'Orchard Boulevard' },
    { name: 'River City Gun Store', area: 'city', postal: '227', street: 'Fairfax Road' },
    { name: 'Big Sky Courthouse', area: 'city', postal: '229', street: 'Justice Circle' },
    { name: 'Liberty Apparel (River City)', area: 'city', postal: '230', street: 'Independence Parkway' },
    { name: 'Gadget Shack', area: 'city', postal: '230', street: 'Commerce Way' },
    { name: 'Jewelry Store', area: 'city', postal: '230', street: 'Commerce Way' },
    { name: 'Sub Station', area: 'city', postal: '230', street: 'Commerce Way' },
    { name: "Mike's Auto Body Shop", area: 'city', postal: '231', street: 'Commerce Way' },
    { name: 'River City Suburbs', area: 'city', postal: '406', street: 'Carolina Drive' },
    // Industrial
    { name: 'Liberty Bay', area: 'industrial', postal: '300', street: 'Freedom Avenue' },
    { name: 'Boat Pier', area: 'industrial', postal: '301', street: 'Madison Court' },
    { name: 'Waste Management Center', area: 'industrial', postal: '305', street: 'Madison Court' },
    { name: 'Tool Store', area: 'industrial', postal: '307', street: 'Cross Street' },
    { name: 'Rising Blakes', area: 'industrial', postal: '308', street: 'Freedom Avenue' },
    { name: 'Gas Depot', area: 'industrial', postal: '310', street: 'Sams Lane' },
    { name: 'River City Police Department', area: 'industrial', postal: '316', street: 'Industrial Road' },
    { name: 'River City Hospital', area: 'industrial', postal: '321', street: 'Independence Parkway' },
    { name: 'Gas-N-Go (Industrial)', area: 'industrial', postal: '322', street: 'Bulletin Avenue' },
    { name: 'Big Sky Post Office', area: 'industrial', postal: '323', street: 'Independence Parkway' },
    // Springfield
    { name: 'Springfield Fire Station', area: 'springfield', postal: '1102', street: 'Maple Street' },
    { name: 'Liberty Apparel (Springfield)', area: 'springfield', postal: '1102', street: 'Maple Street' },
    { name: 'Gas-N-Go (Springfield)', area: 'springfield', postal: '1102', street: 'Walnut Way' },
    { name: 'Movie Theater', area: 'springfield', postal: '1103', street: 'Maple Street' },
    { name: "Joe's Auto Body Shop", area: 'springfield', postal: '1103', street: 'Oak Valley Drive' },
    { name: 'Springfield Barber Shop', area: 'springfield', postal: '1105', street: 'Maple Street' },
    { name: 'Springfield Gun Store', area: 'springfield', postal: '1105', street: 'Cedar Circle' },
    { name: 'Spring Bakery', area: 'springfield', postal: '1106', street: 'Terrace Drive' },
    { name: "Rick and John's", area: 'springfield', postal: '1106', street: 'Maple Street' },
    { name: 'Downtown Springfield', area: 'springfield', postal: '1108', street: 'Oak Valley Drive' },
    // Fairview
    { name: 'Fairview Lake', area: 'fairview', postal: '801', street: 'Fairview Trail' },
    { name: 'Gas-N-Go (Fairview)', area: 'fairview', postal: '802', street: 'Second Street' },
    { name: 'Pancake House', area: 'fairview', postal: '804', street: 'Second Street' },
    { name: 'Common Cents Laundromat', area: 'fairview', postal: '806', street: 'Second Street' },
    { name: "Sammy's Pizzeria", area: 'fairview', postal: '806', street: 'Second Street' },
    { name: 'Fairview Heights', area: 'fairview', postal: '807', street: 'Third Street' },
    { name: 'Fairview Fire Station', area: 'fairview', postal: '808', street: 'Edgewood Boulevard' },
    // County
    { name: 'Spring River Campsites', area: 'county', postal: '500', street: 'Rockport Road' },
    { name: 'Big Sky Jail', area: 'county', postal: '502', street: 'Colonial Drive' },
    { name: 'Chop Shop', area: 'county', postal: '504', street: 'Oak Valley Drive' },
    { name: 'Whispering Pines', area: 'county', postal: '601', street: 'Estate Drive' },
    { name: 'Outdoor Store', area: 'county', postal: '605', street: 'Fairview Road' },
    { name: 'Muddy Acres', area: 'county', postal: '607', street: 'Valley Drive' },
    { name: 'Gas-N-Go (Farms)', area: 'county', postal: '704', street: 'Colonial Drive' },
    { name: 'Farmers Market', area: 'county', postal: '704', street: 'Vine Street' },
    { name: 'Farmlands', area: 'county', postal: '705', street: 'Harvest Drive' },
    { name: 'Department of Transportation', area: 'county', postal: '901', street: 'Riverside Drive' },
    { name: 'Big Sky Airfield', area: 'county', postal: '903', street: 'Aviator Lane' },
    { name: 'Spring Lake', area: 'county', postal: '909', street: 'Oak Valley Drive' },
    { name: "Big Sky Sheriff's Office", area: 'county', postal: '1002', street: 'Maple Street' },
    { name: 'Maplewood Homes', area: 'county', postal: '1007', street: 'Polk Street' },
    { name: 'Ranger Lake', area: 'county', postal: '1205', street: 'High Rock Road' },
    { name: 'Clearwater Lake', area: 'county', postal: '1206', street: 'High Rock Road' },
    { name: 'High Rock Park', area: 'county', postal: '1209', street: 'High Rock Road' },
  ];

  const STREETS = {
    city: {
      h: ['Freedom Avenue', 'Main Street', 'Independence Parkway', 'Orchard Boulevard', 'Sandstone Road', 'Southern Avenue', 'Park Avenue', 'Grand Avenue', 'Oceanside Drive', 'Commerce Way'],
      v: ['Liberty Way', 'Durham Road', 'Fairfax Road', 'Bookstone Way', 'Cline Street', 'Industrial Road', 'Cross Street', 'Madison Court', 'Virginia Avenue'],
      bridges: ['Freedom Bridge', 'Orchard Bridge', 'Independence Bridge'],
    },
    county: {
      h: ['Colonial Drive', 'Valley Drive', 'Spring Creek Road', 'Emerson Road', 'Gibson Lane', 'Fairview Road', 'Second Street', 'Edgewood Boulevard', 'Harvest Drive'],
      v: ['Highway 55', 'Maple Street', 'Oak Valley Drive', 'Elm Street', 'Terrace Drive', 'Walnut Way', 'Riverside Drive', 'High Rock Road'],
      bridges: ['Colonial Bridge', 'Spring Creek Bridge', 'Riverside Bridge'],
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
      const safeX = opts.safeX ?? 26;
      let inX = xs.map((x, i) => [x, i]).filter(([x]) => x > safeX && x < W - safeX);
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
