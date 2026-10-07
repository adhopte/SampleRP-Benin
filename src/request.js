'use strict';

const crypto = require('crypto');
const fs = require('fs');
const QRCode = require('qrcode');
const config = require('./config');
const { buildPresentationDefinition, buildDcqlQuery } = require('./query');

const b64u = (buf) => Buffer.from(buf).toString('base64url');

// ---- Optional request signing (client_id_scheme x509_san_dns) -------------

let signer = null;
function loadSigner() {
  if (signer !== null) return signer;
  signer = false;
  if (config.signingKeyFile && config.signingCertFile) {
    const key = crypto.createPrivateKey(fs.readFileSync(config.signingKeyFile));
    const cert = new crypto.X509Certificate(fs.readFileSync(config.signingCertFile));
    const dns = (cert.subjectAltName || '')
      .split(',')
      .map((s) => s.trim())
      .find((s) => s.startsWith('DNS:'));
    if (!dns) throw new Error('RP signing certificate has no DNS subjectAltName');
    signer = {
      key,
      x5c: cert.raw.toString('base64'), // standard base64 (not url) per RFC 7515
      clientId: `x509_san_dns:${dns.slice(4)}`
    };
  }
  return signer;
}

function signJwt(payload, s) {
  const header = { alg: 'ES256', typ: 'oauth-authz-req+jwt', x5c: [s.x5c] };
  const input = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
  const sig = crypto.sign('sha256', Buffer.from(input), { key: s.key, dsaEncoding: 'ieee-p1363' });
  return `${input}.${b64u(sig)}`;
}

// ---- Request parameters ----------------------------------------------------

function clientId() {
  const s = loadSigner();
  if (s) return s.clientId;
  // OpenID4VP 1.0 expresses the scheme as a prefix of client_id.
  const responseUri = `${config.baseUrl}/api/response`;
  if (config.queryLanguage === 'dcql') return `redirect_uri:${responseUri}`;
  if (config.clientIdScheme === 'redirect_uri') return responseUri;
  return config.clientId;
}

/** All authorization request parameters for one session. */
function buildRequestParams(session, profile, purpose) {
  const params = {
    client_id: clientId(),
    response_type: 'vp_token',
    response_mode: 'direct_post',
    response_uri: `${config.baseUrl}/api/response`,
    nonce: session.nonce,
    state: session.state
  };
  if (!loadSigner() && config.queryLanguage !== 'dcql' && config.clientIdScheme) {
    params.client_id_scheme = config.clientIdScheme;
  }
  if (config.queryLanguage === 'dcql') {
    params.dcql_query = buildDcqlQuery(profile);
  } else {
    params.presentation_definition = buildPresentationDefinition(profile, session.id, purpose);
  }
  return params;
}

/**
 * The openid4vp:// link encoded in the QR code / used for same-device.
 * "reference" mode keeps it ~150 characters, which yields a QR code with few,
 * large modules that cheap phone cameras can read without zooming.
 */
function buildDeepLink(session, params) {
  if (config.qrMode === 'value') {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      q.set(k, typeof v === 'string' ? v : JSON.stringify(v));
    }
    return `openid4vp://?${q.toString()}`;
  }
  const q = new URLSearchParams({
    client_id: params.client_id,
    request_uri: `${config.baseUrl}/api/request/${session.id}`,
    request_uri_method: 'get'
  });
  return `openid4vp://?${q.toString()}`;
}

/**
 * Body served at request_uri. Signed JWT when a certificate is configured,
 * otherwise an unsecured JWT (alg "none") for development only.
 */
function buildRequestObject(params) {
  const s = loadSigner();
  const payload = { ...params, iss: params.client_id, aud: 'https://self-issued.me/v2' };
  if (s) return signJwt(payload, s);
  const header = { alg: 'none', typ: 'oauth-authz-req+jwt' };
  return `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}.`;
}

// ---- QR code ---------------------------------------------------------------

/**
 * Scan-friendly QR rendering:
 *  - quiet zone of 4 modules (QR specification minimum; the PoC used 1)
 *  - vector SVG so the browser never resamples/blurs the modules
 *  - error correction "M": balance between robustness and module count
 */
function renderQr(text) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const quiet = 4;
  const total = size + quiet * 2;
  let path = '';
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (qr.modules.get(y, x)) {
        let run = 1;
        while (x + run < size && qr.modules.get(y, x + run)) run++;
        path += `M${x + quiet} ${y + quiet}h${run}v1h-${run}z`;
        x += run;
      } else x++;
    }
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
  return { svg, modules: size, version: qr.version, totalModules: total };
}

module.exports = { buildRequestParams, buildDeepLink, buildRequestObject, renderQr, clientId };
