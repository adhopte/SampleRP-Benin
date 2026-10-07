/**
 * Sample RP Benin - drop-in "Verify with wallet" widget.
 *
 * Works on any website: it only talks to YOUR relying-party backend through
 * 3 HTTP calls (create session, show QR, poll result). No framework needed.
 *
 *   <div id="wallet-verify"></div>
 *   <script src="sample-rp-widget.js"></script>
 *   <script>
 *     SampleRpBenin.mount(document.getElementById('wallet-verify'), {
 *       apiBase: 'https://your-rp.example.org',   // your RP backend
 *       profile: 'pid',                           // 'pid' | 'birth_certificate'
 *       lang: 'fr',                               // 'fr' | 'en'
 *       onResult: (session) => { ... }            // session.status: 'verified' | 'rejected'
 *     });
 *   </script>
 *
 * SECURITY: the result delivered to the browser is for DISPLAY. Make any
 * business decision (log the user in, create an order, ...) on YOUR server by
 * reading the session from the backend, never from data the browser sends back.
 */
(function (global) {
  var TEXT = {
    en: { button: 'Verify with my wallet', scan: 'Scan with your wallet app', open: 'Open in wallet app',
          waiting: 'Waiting for the wallet…', ok: 'Credential accepted', ko: 'Credential rejected',
          expired: 'Session expired, please retry.' },
    fr: { button: 'Vérifier avec mon portefeuille', scan: "Scannez avec votre application portefeuille",
          open: "Ouvrir dans l'application portefeuille", waiting: 'En attente du portefeuille…',
          ok: 'Justificatif accepté', ko: 'Justificatif rejeté', expired: 'Session expirée, veuillez réessayer.' }
  };

  function el(tag, props, children) {
    var n = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) { n[k] = props[k]; });
    (children || []).forEach(function (c) { n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }

  function mount(root, opts) {
    var api = (opts.apiBase || '').replace(/\/$/, '');
    var t = TEXT[opts.lang] || TEXT.en;
    var timer = null;

    var status = el('p', { textContent: '' });
    var button = el('button', { type: 'button', textContent: t.button });
    root.appendChild(button);
    root.appendChild(status);

    button.addEventListener('click', function () {
      button.disabled = true;
      fetch(api + '/api/session', {                                   // (1) create a session
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profile: opts.profile || 'pid' })
      }).then(function (r) { return r.json(); }).then(function (s) {
        // (2) show the QR code. The SVG already contains its quiet zone: do not add padding or scale below ~280px.
        var img = el('img', { src: api + s.qrUrl, alt: 'QR code' });
        img.style.cssText = 'width:min(88vw,360px);height:min(88vw,360px);background:#fff;image-rendering:pixelated;display:block;margin:8px auto';
        var link = el('a', { href: s.authorizationRequestUri, textContent: t.open }); // same-device flow
        var scan = el('p', { textContent: t.scan });
        root.insertBefore(scan, status);
        root.insertBefore(img, status);
        root.insertBefore(link, status);
        status.textContent = t.waiting;

        timer = setInterval(function () {                              // (3) poll for the outcome
          fetch(api + '/api/session/' + s.sessionId).then(function (r) {
            if (r.status === 404) { clearInterval(timer); status.textContent = t.expired; return null; }
            return r.json();
          }).then(function (session) {
            if (!session || session.status === 'pending') return;
            clearInterval(timer);
            status.textContent = session.status === 'verified' ? t.ok : t.ko;
            img.remove(); link.remove(); scan.remove();
            if (opts.onResult) opts.onResult(session);
          });
        }, 1500);
      });
    });
  }

  global.SampleRpBenin = { mount: mount };
})(window);
