/* Helpers shared by the driver and admin panels. */
(() => {
  const { $, $$ } = BSU;
  const P = (BSU.panel = {});

  P.tabs = (onChange) => {
    const tabs = $('#tabs');
    const show = (name, push = true) => {
      $$('.tab', tabs).forEach((t) => t.classList.toggle('on', t.dataset.tab === name));
      $$('[data-pane]').forEach((p) => (p.hidden = p.dataset.pane !== name));
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
