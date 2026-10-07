'use strict';

const test = require('node:test');

const assert = require('node:assert');

const net = require('node:net');
const { createTestIssuer } = require('../tools/mdoc-builder');

// BASE_URL must contain the real port before the config module is loaded,
// because the request advertises response_uri / request_uri built from it.
let shared;
async function boot() {
  if (shared) return shared;
  const port = await new Promise((r) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); });
  });
  process.env.BASE_URL = `http://127.0.0.1:${port}`;
  const app = require('../server');
  shared = await new Promise((r) => { const s = app.listen(port, '127.0.0.1', () => r(s)); });
  return shared;
}

test('by-reference QR is short and scannable; full PID flow verifies', async (t) => {
  const server = await boot();
  const base = `http://127.0.0.1:${server.address().port}`;
  const { presentToRp } = require('../tools/mock-wallet');

  const created = await (await fetch(`${base}/api/session`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile: 'pid' })
  })).json();

  assert.match(created.authorizationRequestUri, /^openid4vp:\/\/\?client_id=.*request_uri=/);
  assert.ok(created.qr.payloadLength < 260, `payload ${created.qr.payloadLength}`);
  assert.ok(created.qr.version <= 9, `QR version ${created.qr.version}`);

  const svg = await (await fetch(base + created.qrUrl)).text();
  assert.match(svg, /^<svg/);

  const issuer = createTestIssuer();
  const wallet = await presentToRp(created.authorizationRequestUri, { issuer });
  assert.strictEqual(wallet.status, 200);

  const done = await (await fetch(`${base}/api/session/${created.sessionId}`)).json();
  assert.strictEqual(done.status, 'verified');
  const claims = done.results[0].claims['eu.europa.ec.eudi.pid.1'];
  assert.strictEqual(claims.given_name, 'Test Adjovi');
  assert.strictEqual(claims.birth_date, '1990-05-12');
  const byId = Object.fromEntries(done.results[0].checks.map((c) => [c.id, c.status]));
  assert.strictEqual(byId.digests, 'passed');
  assert.strictEqual(byId.issuer_signature, 'passed');
  assert.strictEqual(byId.device_auth, 'skipped');
});

test('birth certificate flow + tampered response is rejected + replay refused', async (t) => {
  const server = await boot();
  const base = `http://127.0.0.1:${server.address().port}`;
  const { presentToRp } = require('../tools/mock-wallet');
  const create = async (profile) => (await fetch(`${base}/api/session`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile })
  })).json();

  const ok = await create('birth_certificate');
  assert.strictEqual((await presentToRp(ok.authorizationRequestUri)).status, 200);
  const done = await (await fetch(`${base}/api/session/${ok.sessionId}`)).json();
  assert.strictEqual(done.status, 'verified');
  assert.strictEqual(Object.values(done.results[0].claims)[0].certificate_number, 'TEST-0000-1990-0001');
  // second post for same state must be refused
  assert.strictEqual((await presentToRp(ok.authorizationRequestUri)).status, 400);

  const bad = await create('pid');
  const r = await presentToRp(bad.authorizationRequestUri, { tamper: true });
  assert.strictEqual(r.status, 400);
  const st = await (await fetch(`${base}/api/session/${bad.sessionId}`)).json();
  assert.strictEqual(st.status, 'rejected');
});

test.after(() => shared && shared.close());
