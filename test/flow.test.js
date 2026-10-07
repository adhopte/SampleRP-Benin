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

const post = (base, profile) => fetch(`${base}/api/session`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile })
}).then((r) => r.json());
const status = (base, id) => fetch(`${base}/api/session/${id}`).then((r) => r.json());
const checkMap = (res) => Object.fromEntries(res.checks.map((c) => [c.id, c.status]));

test('by-reference QR is short and scannable; PID mdoc flow verifies and discloses only what was asked', async () => {
  const server = await boot();
  const base = `http://127.0.0.1:${server.address().port}`;
  const { presentToRp } = require('../tools/mock-wallet');

  const created = await post(base, 'pid');
  assert.match(created.authorizationRequestUri, /^openid4vp:\/\/\?client_id=.*request_uri=/);
  assert.ok(created.qr.payloadLength < 260, `payload ${created.qr.payloadLength}`);
  assert.ok(created.qr.version <= 9, `QR version ${created.qr.version}`);
  assert.match(await (await fetch(base + created.qrUrl)).text(), /^<svg/);

  assert.strictEqual((await presentToRp(created.authorizationRequestUri)).status, 200);
  const done = await status(base, created.sessionId);
  assert.strictEqual(done.status, 'verified');
  assert.deepStrictEqual(done.results[0].claims['eu.europa.ec.eudi.pid.1'],
    { family_name: 'KOSSI', given_name: 'Jean', birth_date: '1990-05-12' });
  const c = checkMap(done.results[0]);
  assert.strictEqual(c.digests, 'passed');
  assert.strictEqual(c.issuer_signature, 'passed');
  assert.strictEqual(c.device_auth, 'skipped');
  assert.strictEqual(c.status, 'skipped');
});

test('PID age_over_18 shares only the boolean', async () => {
  const server = await boot();
  const base = `http://127.0.0.1:${server.address().port}`;
  const { presentToRp } = require('../tools/mock-wallet');
  const s = await post(base, 'pid_age_over_18');
  assert.strictEqual((await presentToRp(s.authorizationRequestUri)).status, 200);
  const done = await status(base, s.sessionId);
  assert.deepStrictEqual(done.results[0].claims['eu.europa.ec.eudi.pid.1'], { age_over_18: true });
});

test('birth certificate is an SD-JWT VC: verified incl. key binding; filiation adds parents', async () => {
  const server = await boot();
  const base = `http://127.0.0.1:${server.address().port}`;
  const { presentToRp } = require('../tools/mock-wallet');

  const bc = await post(base, 'birth_certificate');
  assert.strictEqual((await presentToRp(bc.authorizationRequestUri)).status, 200);
  const done = await status(base, bc.sessionId);
  assert.strictEqual(done.status, 'verified');
  assert.strictEqual(done.results[0].format, 'dc+sd-jwt');
  const claims = Object.values(done.results[0].claims)[0];
  // requested claims + the rulebook's non-selectively-disclosable metadata (SD = No)
  assert.deepStrictEqual(Object.keys(claims).sort(),
    ['birth_date', 'birth_record_reference', 'family_name', 'given_name', 'issuance_date', 'issuing_authority'].sort());
  assert.strictEqual(claims.issuing_authority, 'ANIP');
  const c = checkMap(done.results[0]);
  for (const id of ['vct', 'digests', 'issuer_signature', 'validity', 'requested_claims', 'key_binding']) {
    assert.strictEqual(c[id], 'passed', id);
  }

  const fil = await post(base, 'birth_certificate_filiation');
  assert.strictEqual((await presentToRp(fil.authorizationRequestUri)).status, 200);
  const f = Object.values((await status(base, fil.sessionId)).results[0].claims)[0];
  assert.strictEqual(f.mother_family_name, 'AGBOSSOU');
  assert.strictEqual(f.father_given_name, 'Koffi');
  assert.ok(!('document_number' in f) && !('birth_place' in f), 'undisclosed claims stay hidden');
});

test('tampered credentials are rejected (mdoc and SD-JWT); a response is accepted once', async () => {
  const server = await boot();
  const base = `http://127.0.0.1:${server.address().port}`;
  const { presentToRp } = require('../tools/mock-wallet');

  for (const profile of ['pid', 'birth_certificate']) {
    const s = await post(base, profile);
    assert.strictEqual((await presentToRp(s.authorizationRequestUri, { tamper: true })).status, 400, profile);
    const st = await status(base, s.sessionId);
    assert.strictEqual(st.status, 'rejected');
    assert.strictEqual(checkMap(st.results[0]).digests, 'failed');
  }
  const ok = await post(base, 'pid');
  assert.strictEqual((await presentToRp(ok.authorizationRequestUri)).status, 200);
  assert.strictEqual((await presentToRp(ok.authorizationRequestUri)).status, 400); // replay
});

test('unknown profile names are refused (incl. prototype keys)', async () => {
  const server = await boot();
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const p of ['nope', 'constructor', '__proto__']) {
    const r = await fetch(`${base}/api/session`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profile: p })
    });
    assert.strictEqual(r.status, 400, p);
    await r.text(); // always drain bodies so sockets can close
  }
});

test('health endpoints answer on /health and /healthz (Render default)', async () => {
  const server = await boot();
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const p of ['/health', '/healthz']) {
    const r = await fetch(base + p);
    assert.strictEqual(r.status, 200, p);
    assert.strictEqual((await r.json()).ok, true);
  }
});

test.after(() => {
  if (shared) { shared.close(); shared.closeAllConnections(); }
});
