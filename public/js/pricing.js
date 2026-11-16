(() => {
  const { $, esc, money } = BSU;
  const CLASSES = ['uber', 'premium', 'black'];
  const check = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  const dash = '<span style="color:var(--text-4)">—</span>';
  const FEATURES = {
    uber: ['Up to 4 riders', 'Any on-duty driver', 'Live tracking'],
    premium: ['Top-rated drivers only', 'Newer, nicer cars', 'Priority matching'],
    black: ['Black executive cars only', 'Our best drivers', 'Door-to-door service'],
  };

  BSU.boot.then(({ settings: s }) => {
    $('#price-cards').innerHTML = CLASSES.map((c, i) => {
      const p = s.prices[c];
      return `<div class="card class-card ${c} reveal" style="--d:${i * 90}ms" data-spot>
        <div class="top-line"><span class="badge">${c === 'black' ? 'Executive' : c === 'premium' ? 'Comfort' : 'Everyday'}</span>${p.enabled ? '' : '<span class="badge red">Paused</span>'}</div>
        <div class="car-wrap">${BSU.car(c)}</div>
        <h3>${esc(p.name)}</h3>
        <p class="tagline">${esc(p.tagline || '')}</p>
        <ul class="feat">${FEATURES[c].map((f) => `<li>${check}${f}</li>`).join('')}</ul>
        <div class="price"><b>${money(p.min)}–${money(p.max).slice(1)}</b><span>per trip</span></div>
        <a class="btn ${c === 'black' ? '' : 'ghost'} block" style="margin-top:20px;${c === 'black' ? 'background:#000;color:#fff;box-shadow:none' : ''}" href="/ride?class=${c}">Ride ${esc(p.name)}</a>
      </div>`;
    }).join('');
    BSU.reveal($('#price-cards'));

    $('#e-class').innerHTML = CLASSES.filter((c) => s.prices[c].enabled).map((c, i) => `<input type="radio" name="ec" id="ec-${c}" value="${c}" ${i === 0 ? 'checked' : ''}><label for="ec-${c}">${{ uber: 'Uber', premium: 'Premium', black: 'Black' }[c]}</label>`).join('');
    $('#e-trip').innerHTML = Object.entries(s.trips).map(([k, t]) => `<input type="radio" name="et" id="et-${k}" value="${k}" ${k === 'town' ? 'checked' : ''}><label for="et-${k}">${esc(t.label)}</label>`).join('');
    BSU.seg($('#e-class'));
    BSU.seg($('#e-trip'));

    let shown = 0;
    const update = () => {
      const c = $('#e-class input:checked')?.value || 'uber';
      const t = $('#e-trip input:checked')?.value || 'town';
      const p = s.prices[c];
      const est = Math.round((p.min + (p.max - p.min) * (s.trips[t]?.f ?? 0.5)) / 10) * 10;
      const from = shown, start = performance.now();
      const tick = (now) => {
        const k = Math.min(1, (now - start) / 600);
        const v = from + (est - from) * (1 - Math.pow(1 - k, 4));
        $('#e-out').textContent = money(v);
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      shown = est;
      $('#e-range').textContent = `${p.name} · ${money(p.min)} – ${money(p.max)} range`;
      $('#e-go').href = `/ride?class=${c}`;
    };
    document.addEventListener('change', (e) => { if (e.target.closest('#e-class, #e-trip')) update(); });
    update();

    const row = (label, vals) => `<tr><td>${label}</td>${vals.map((v) => `<td>${v === true ? check : v === false ? dash : v}</td>`).join('')}</tr>`;
    $('#compare-body').innerHTML = [
      row('Price per trip', CLASSES.map((c) => `<b>${money(s.prices[c].min)}–${money(s.prices[c].max).slice(1)}</b>`)),
      row('Riders', ['Up to ' + s.maxPassengers, 'Up to ' + s.maxPassengers, 'Up to ' + s.maxPassengers]),
      row('Live tracking', [true, true, true]),
      row('Ride history & ratings', [true, true, true]),
      row('Top-rated drivers only', [false, true, true]),
      row('Priority matching', [false, true, true]),
      row('Black executive cars', [false, false, true]),
      row('Door-to-door service', [false, false, true]),
    ].join('');
  });
})();
