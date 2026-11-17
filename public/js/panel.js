/* Helpers shared by the driver and admin panels. */
(() => {
  const { $, $$ } = BSU;
  const P = (BSU.panel = {});

  /* Tab bar that scrolls sideways when it doesn't fit: arrows + edge fades, wheel scrolls it. */
  function scrollable(tabs) {
    const wrap = document.createElement('div');
    wrap.className = 'tabs-wrap';
    tabs.parentNode.insertBefore(wrap, tabs);
    wrap.appendChild(tabs);
    const arrow = (dir) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `tabs-arrow ${dir}`;
      b.setAttribute('aria-label', dir === 'prev' ? 'Scroll tabs left' : 'Scroll tabs right');
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="' + (dir === 'prev' ? 'm15 6-6 6 6 6' : 'm9 6 6 6-6 6') + '"/></svg>';
      b.addEventListener('click', () => tabs.scrollBy({ left: (dir === 'prev' ? -1 : 1) * tabs.clientWidth * 0.6, behavior: 'smooth' }));
      wrap.appendChild(b);
    };
    arrow('prev');
    arrow('next');
    const update = () => {
      const max = tabs.scrollWidth - tabs.clientWidth;
      wrap.classList.toggle('can-prev', tabs.scrollLeft > 2);
      wrap.classList.toggle('can-next', tabs.scrollLeft < max - 2);
    };
    tabs.addEventListener('scroll', update, { passive: true });
    tabs.addEventListener('wheel', (e) => {
      if (tabs.scrollWidth <= tabs.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      tabs.scrollLeft += e.deltaY;
    }, { passive: false });
    new ResizeObserver(update).observe(tabs);
    update();
    return (el) => {
      if (!el) return;
      const l = el.offsetLeft - 40, r = el.offsetLeft + el.offsetWidth + 40;
      if (l < tabs.scrollLeft) tabs.scrollTo({ left: l, behavior: 'smooth' });
      else if (r > tabs.scrollLeft + tabs.clientWidth) tabs.scrollTo({ left: r - tabs.clientWidth, behavior: 'smooth' });
    };
  }

  P.tabs = (onChange) => {
    const tabs = $('#tabs');
    const reveal = scrollable(tabs);
    const show = (name, push = true) => {
      $$('.tab', tabs).forEach((t) => t.classList.toggle('on', t.dataset.tab === name));
      $$('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== name));
      reveal($(`.tab[data-tab="${name}"]`, tabs));
      if (push) history.replaceState(null, '', '#' + name);
      onChange?.(name);
    };
    tabs.addEventListener('click', (e) => { const t = e.target.closest('[data-tab]'); if (t) show(t.dataset.tab); });
    const initial = location.hash.slice(1);
    if (initial && $(`[data-tab="${initial}"]`, tabs)) show(initial, false);
    return show;
  };

  P.copy = async (text) => {
    try { await navigator.clipboard.writeText(text); BSU.toast('Copied', 'ok'); } catch { BSU.toast('Could not copy', 'error'); }
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy]');
    if (b) { e.preventDefault(); P.copy(b.dataset.copy); }
  });

  P.csv = (rows, name) => {
    const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const text = rows.map((r) => r.map(esc).join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([text], { type: 'text/csv' })), download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  // Simple poller that pauses while the tab is hidden.
  P.poll = (fn, ms) => {
    let t;
    const run = async () => { clearTimeout(t); try { await fn(); } finally { t = setTimeout(run, document.hidden ? ms * 3 : ms); } };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) run(); });
    run();
    return run;
  };
})();
