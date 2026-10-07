// Same-origin here; use your RP backend's public URL when the page is hosted elsewhere
// (and allow your site's origin in the backend's CORS configuration).
var params = new URLSearchParams(location.search);
SampleRpBenin.mount(document.getElementById('wallet-verify'), {
  apiBase: '',
  profile: params.get('profile') || 'pid',          // ?profile=birth_certificate
  lang: params.get('lang') || 'fr',                 // ?lang=en
  onResult: function (session) {
    var out = document.getElementById('out');
    out.hidden = false;
    out.textContent = JSON.stringify(session, null, 2);
  }
});
