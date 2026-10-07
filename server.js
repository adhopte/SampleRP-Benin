'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { randomUUID } = require('crypto');

const config = require('./src/config');
const { profiles } = require('./src/profiles');
const { buildRequestParams, buildDeepLink, buildRequestObject, renderQr } = require('./src/request');
const { verifyDeviceResponse, loadTrustAnchors } = require('./src/mdoc');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Basic hardening headers. The demo UI only needs same-origin assets and data: images.
app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  });
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.use('/samples', express.static(path.join(__dirname, 'samples')));

// ---- Session store (in memory: demo only; use Redis/DB in production) ------

const sessions = new Map(); // id -> session
const byState = new Map(); // state -> id

function pruneSessions() {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.createdAt > config.sessionTtlMs) {
      sessions.delete(id);
      byState.delete(s.state);
    }
  }
}
setInterval(pruneSessions, 60 * 1000).unref();

function trustAnchors() {
  if (!config.trustedIssuersDir || !fs.existsSync(config.trustedIssuersDir)) return [];
  const pems = fs
    .readdirSync(config.trustedIssuersDir)
    .filter((f) => /\.(pem|crt|cer)$/i.test(f))
    .map((f) => fs.readFileSync(path.join(config.trustedIssuersDir, f)));
  return loadTrustAnchors(pems);
}
const anchors = trustAnchors();

// ---- Step 1: create a session, return the QR / deep link -------------------

app.post('/api/session', (req, res) => {
  const profile = profiles[(req.body && req.body.profile) || 'pid'];
  if (!profile) return res.status(400).json({ error: 'unknown_profile', profiles: Object.keys(profiles) });
  pruneSessions();
  if (sessions.size >= config.maxSessions) return res.status(503).json({ error: 'too_many_sessions' });

  const session = {
    id: randomUUID(),
    state: crypto.randomBytes(16).toString('hex'),
    nonce: crypto.randomBytes(16).toString('hex'),
    profile: profile.id,
    createdAt: Date.now(),
    status: 'pending'
  };
  const purpose = 'Sample RP Benin - demonstration of credential presentation';
  session.params = buildRequestParams(session, profile, purpose);
  session.link = buildDeepLink(session, session.params);
  const qr = renderQr(session.link);
  session.qr = qr;
  sessions.set(session.id, session);
  byState.set(session.state, session.id);

  res.json({
    sessionId: session.id,
    profile: profile.id,
    authorizationRequestUri: session.link,
    qrUrl: `/api/session/${session.id}/qr.svg`,
    qr: { mode: config.qrMode, payloadLength: session.link.length, version: qr.version, modules: qr.modules },
    expiresInSeconds: config.sessionTtlMs / 1000
  });
});

app.get('/api/session/:id/qr.svg', (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).end();
  res.type('image/svg+xml').send(s.qr.svg);
});

// ---- Step 2: wallet fetches the request object (request_uri) ---------------

function serveRequestObject(req, res) {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'invalid_request_uri' });
  res.type('application/oauth-authz-req+jwt').send(buildRequestObject(s.params));
}
app.get('/api/request/:id', serveRequestObject);
app.post('/api/request/:id', serveRequestObject); // request_uri_method=post

// ---- Step 3: wallet posts the presentation (response_uri) ------------------

/** vp_token may be a string, an array (PEX) or a JSON object keyed by query id (DCQL). */
function collectTokens(vpToken) {
  let v = vpToken;
  if (typeof v === 'string' && /^\s*[[{]/.test(v)) {
    try { v = JSON.parse(v); } catch { /* keep string */ }
  }
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flat();
  if (v && typeof v === 'object') return Object.values(v).flat();
  return [];
}

app.post('/api/response', (req, res) => {
  const { vp_token: vpToken, state } = req.body || {};
  const session = state && sessions.get(byState.get(state));
  if (!session) {
    return res.status(400).json({ error: 'invalid_request', error_description: 'unknown or expired state' });
  }
  if (session.status !== 'pending') {
    return res.status(400).json({ error: 'invalid_request', error_description: 'response already received' });
  }
  const tokens = collectTokens(vpToken);
  if (!tokens.length) {
    session.status = 'rejected';
    session.error = 'missing vp_token';
    return res.status(400).json({ error: 'invalid_request', error_description: 'missing vp_token' });
  }

  try {
    const profile = profiles[session.profile];
    const results = tokens.flatMap((t) => verifyDeviceResponse(t, { profile, trustAnchors: anchors }));
    const checks = results.flatMap((r) => r.checks);
    const failed = checks.filter((c) => c.status === 'failed');
    const trustMissing = !config.allowUntrustedIssuer && !checks.some((c) => c.id === 'issuer_trust' && c.status === 'passed');

    session.results = results;
    session.verifiedAt = Date.now();
    if (failed.length || trustMissing) {
      session.status = 'rejected';
      session.error = failed.length ? failed.map((c) => `${c.id}: ${c.detail}`).join('; ') : 'issuer_trust: issuer not trusted';
      return res.status(400).json({ error: 'invalid_request', error_description: session.error });
    }
    session.status = 'verified';
    return res.status(200).json({});
  } catch (err) {
    session.status = 'rejected';
    session.error = err.message;
    return res.status(400).json({ error: 'invalid_request', error_description: err.message });
  }
});

// ---- Step 4: the web page polls for the outcome -----------------------------

app.get('/api/session/:id', (req, res) => {
  const s = sessions.get(req.params.id);
  if (!s) return res.status(404).json({ error: 'not_found' });
  const profile = profiles[s.profile];
  res.json({
    status: s.status,
    profile: s.profile,
    error: s.error,
    labels: profile.labels,
    results: s.results
  });
});

app.get('/health', (req, res) =>
  res.json({ ok: true, baseUrl: config.baseUrl, qrMode: config.qrMode, queryLanguage: config.queryLanguage })
);

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Sample RP Benin listening on port ${config.port}`);
    console.log(`BASE_URL=${config.baseUrl} (must be the public HTTPS URL wallets can reach)`);
    console.log(`QR mode=${config.qrMode}, query language=${config.queryLanguage}, trust anchors=${anchors.length}`);
  });
}

module.exports = app;
