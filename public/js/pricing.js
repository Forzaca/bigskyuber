(() => {
  const { $, esc, money } = BSU;
  const CLASSES = ['uber', 'premium', 'black'];
  const check = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  const dash = '<span style="color:var(--text-4)">—</span>';
  const FEATURES = {
    uber: ['Up to 4 riders', 'Any on-duty driver', 'Live tracking on the map', 'Ride history & ratings'],
    premium: ['Everything in Uber', 'Top-rated drivers only', 'Newer, nicer cars', 'Priority matching'],
    black: ['Everything in Premium', 'Black executive cars only', 'Our best drivers', 'Door-to-door service'],
  };
  const LABEL = { uber: 'Everyday', premium: 'Comfort', black: 'Executive' };

  $('#price-cards').innerHTML = BSU.skel.cards(3);
  $('#compare-body').innerHTML = BSU.skel.rows(7, 4);

  BSU.boot.then(({ settings: s }) => {
    $('#price-cards').innerHTML = CLASSES.map((c, i) => {
      const p = s.prices[c];
      return `<article class="card price-card ${c} reveal" style="--d:${i * 100}ms" data-spot>
        <div class="price-top"><span class="badge ${c === 'black' ? 'white' : ''}">${LABEL[c]}</span>${p.enabled ? '' : '<span class="badge red">Paused</span>'}</div>
        <div class="car-wrap">${BSU.car(c)}</div>
        <h3>${esc(p.name)}</h3>
        <p class="tagline">${esc(p.tagline || '')}</p>
        <div class="amount"><b>${money(p.min)}</b><span>to</span><b>${money(p.max)}</b></div>
        <p class="per">per trip · in-game cash</p>
        <a class="btn ${c === 'black' ? '' : 'ghost'} block" href="/ride?class=${c}" ${p.enabled ? '' : 'aria-disabled="true" style="pointer-events:none;opacity:.5"'}>Ride ${esc(p.name)}</a>
        <ul class="feat">${FEATURES[c].map((f) => `<li>${check}${f}</li>`).join('')}</ul>
        <p class="cars"><b>Typical cars:</b> ${BSU.CARS[c].slice(0, 4).map(esc).join(', ')}</p>
      </article>`;
    }).join('');
    BSU.reveal($('#price-cards'));

    const enabled = CLASSES.filter((c) => s.prices[c].enabled);
    $('#e-class').innerHTML = enabled.map((c, i) => `<input type="radio" name="ec" id="ec-${c}" value="${c}" ${i === 0 ? 'checked' : ''}><label for="ec-${c}">${{ uber: 'Uber', premium: 'Premium', black: 'Black' }[c]}</label>`).join('');
    $('#e-trip').innerHTML = Object.entries(s.trips).map(([k, t]) => `<input type="radio" name="et" id="et-${k}" value="${k}" ${k === 'town' ? 'checked' : ''}><label for="et-${k}">${esc(t.label)}<small>${esc(t.hint || '')}</small></label>`).join('');
    BSU.seg($('#e-class'));
    BSU.seg($('#e-trip'));

    let shown = 0;
    const update = () => {
      const c = $('#e-class input:checked')?.value || 'uber';
      const t = $('#e-trip input:checked')?.value || 'town';
      const p = s.prices[c];
      const f = s.trips[t]?.f ?? 0.5;
      const est = Math.round((p.min + (p.max - p.min) * f) / 10) * 10;
      const from = shown, start = performance.now();
      const tick = (now) => {
        const k = Math.min(1, (now - start) / 600);
        $('#e-out').textContent = money(from + (est - from) * (1 - Math.pow(1 - k, 4)));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      shown = est;
      const pos = p.max > p.min ? ((est - p.min) / (p.max - p.min)) * 100 : 50;
      $('#e-fill').style.width = pos + '%';
      $('#e-knob').style.left = pos + '%';
      $('#e-min').textContent = money(p.min);
      $('#e-max').textContent = money(p.max);
      $('#e-range').textContent = `${p.name} · ${money(p.min)} – ${money(p.max)}`;
      $('#e-go').href = `/ride?class=${c}`;
    };
    document.addEventListener('change', (e) => { if (e.target.closest('#e-class, #e-trip')) update(); });
    update();

    const row = (label, vals) => `<tr><td>${label}</td>${vals.map((v) => `<td>${v === true ? check : v === false ? dash : v}</td>`).join('')}</tr>`;
    $('#compare-body').innerHTML = [
      row('Price per trip', CLASSES.map((c) => `<b>${money(s.prices[c].min)}–${money(s.prices[c].max).slice(1)}</b>`)),
      row('Riders', CLASSES.map(() => 'Up to ' + s.maxPassengers)),
      row('Live tracking', [true, true, true]),
      row('Ride history & ratings', [true, true, true]),
      row('Top-rated drivers only', [false, true, true]),
      row('Priority matching', [false, true, true]),
      row('Example car', CLASSES.map((c) => `<span class="muted">${esc(BSU.CARS[c][0])}</span>`)),
      row('Black executive cars', [false, false, true]),
      row('Door-to-door service', [false, false, true]),
    ].join('');
  });
})();
