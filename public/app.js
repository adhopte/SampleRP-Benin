(function () {
  const $ = (id) => document.getElementById(id);
  const el = {
    start: $('start-panel'), qr: $('qr-panel'), result: $('result-panel'),
    badge: $('status-badge'), qrImg: $('qr-img'), qrBig: $('qr-big'), overlay: $('qr-overlay'),
    raw: $('raw-uri'), walletLink: $('wallet-link'),
    resBadge: $('result-badge'), resError: $('result-error'),
    claims: $('claims-out'), checks: $('checks-out'), debug: $('debug-out')
  };

  // ---- Language (EN / FR) -------------------------------------------------
  let lang = 'en';
  try { lang = localStorage.getItem('lang') || ''; } catch (e) { /* storage blocked */ }
  if (!window.I18N[lang]) lang = (navigator.language || 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en';
  const t = (key) => (window.I18N[lang] && window.I18N[lang][key]) || window.I18N.en[key] || key;

  function applyLang() {
    document.documentElement.lang = lang;
    document.title = t('title');
    document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
    document.querySelectorAll('button.lang').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    if (lastSession) renderResult(lastSession);
  }
  document.querySelectorAll('button.lang').forEach((b) =>
    b.addEventListener('click', () => {
      lang = b.dataset.lang;
      try { localStorage.setItem('lang', lang); } catch (e) { /* ignore */ }
      applyLang();
    })
  );

  // ---- Flow ---------------------------------------------------------------
  let pollTimer = null;
  let lastSession = null;

  async function startSession(profile) {
    el.start.hidden = true;
    el.result.hidden = true;
    el.qr.hidden = false;
    lastSession = null;

    const res = await fetch('/api/session', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profile })
    });
    const data = await res.json();
    el.qrImg.src = data.qrUrl;
    el.qrBig.src = data.qrUrl;
    el.raw.value = data.authorizationRequestUri;
    el.walletLink.href = data.authorizationRequestUri;

    pollTimer = setInterval(() => poll(data.sessionId), 1500);
  }

  async function poll(sessionId) {
    const res = await fetch(`/api/session/${sessionId}`);
    if (res.status === 404) {
      stop();
      el.badge.textContent = t('expired');
      el.badge.className = 'badge err';
      return;
    }
    if (!res.ok) return;
    const session = await res.json();
    if (session.status !== 'pending') {
      stop();
      lastSession = session;
      renderResult(session);
    }
  }

  function stop() { clearInterval(pollTimer); pollTimer = null; }

  function renderResult(s) {
    el.qr.hidden = true;
    el.overlay.hidden = true;
    el.result.hidden = false;
    const ok = s.status === 'verified';
    el.resBadge.textContent = ok ? `✓ ${t('verified')}` : `✗ ${t('rejected')}`;
    el.resBadge.className = 'badge ' + (ok ? 'ok' : 'err');
    el.resError.hidden = ok || !s.error;
    el.resError.textContent = s.error || '';

    el.claims.replaceChildren();
    el.checks.replaceChildren();
    for (const r of s.results || []) {
      for (const ns of Object.values(r.claims)) {
        for (const [k, v] of Object.entries(ns)) {
          const dt = document.createElement('dt');
          dt.textContent = (s.labels[k] && s.labels[k][lang]) || k;
          const dd = document.createElement('dd');
          dd.textContent = typeof v === 'object' ? JSON.stringify(v) : String(v);
          el.claims.append(dt, dd);
        }
      }
      for (const c of r.checks) {
        const li = document.createElement('li');
        const st = document.createElement('span');
        st.className = `st ${c.status}`;
        st.textContent = t(c.status);
        const name = document.createElement('span');
        name.textContent = t(`check.${c.id}`);
        const d = document.createElement('span');
        d.className = 'detail';
        d.textContent = c.status === 'failed' ? c.detail : ''; // other details are in the JSON view
        li.append(st, name);
        if (d.textContent) li.append(d);
        el.checks.append(li);
      }
    }
    el.debug.textContent = JSON.stringify(s, null, 2);
  }

  function reset() {
    stop();
    el.qr.hidden = true;
    el.result.hidden = true;
    el.start.hidden = false;
    lastSession = null;
  }

  document.querySelectorAll('button.card').forEach((b) => b.addEventListener('click', () => startSession(b.dataset.profile)));
  $('reset-btn').addEventListener('click', reset);
  $('cancel-btn').addEventListener('click', reset);
  $('enlarge-btn').addEventListener('click', () => { el.overlay.hidden = false; });
  $('overlay-close').addEventListener('click', () => { el.overlay.hidden = true; });

  applyLang();
})();
