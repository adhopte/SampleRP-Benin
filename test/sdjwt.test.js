'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { createTestIssuer, buildSdJwtPresentation, SAMPLE_DATA } = require('../tools/mdoc-builder');
const { verifySdJwtVc } = require('../src/sdjwt');
const { loadTrustAnchors } = require('../src/checks');
const { profiles } = require('../src/profiles');

const profile = profiles.birth_certificate;
const issuer = createTestIssuer();
const AUD = 'sample-rp-benin';
const NONCE = 'nonce-123';
const make = (over = {}) => buildSdJwtPresentation({
  vct: profile.vct, ...SAMPLE_DATA.birth_certificate, disclose: profile.requested, issuer, aud: AUD, nonce: NONCE, ...over
});
const run = async (token, over = {}) => {
  const r = await verifySdJwtVc(token, { profile, expected: { aud: AUD, nonce: NONCE }, ...over });
  return Object.fromEntries(r.checks.map((c) => [c.id, c]));
};

test('valid presentation passes every performed check', async () => {
  const c = await run(make());
  for (const id of ['vct', 'digests', 'issuer_signature', 'validity', 'requested_claims', 'key_binding']) {
    assert.strictEqual(c[id].status, 'passed', id);
  }
  assert.strictEqual(c.issuer_trust.status, 'skipped');
  assert.strictEqual(c.status.status, 'skipped');
});

test('key binding fails on wrong audience or nonce (replay to another RP / session)', async () => {
  assert.strictEqual((await run(make({ aud: 'other-rp' }))).key_binding.status, 'failed');
  assert.strictEqual((await run(make({ nonce: 'other' }))).key_binding.status, 'failed');
});

test('wrong vct, expired credential, missing claim and altered disclosure are flagged', async () => {
  assert.strictEqual((await run(make({ vct: 'https://x.example/other' }))).vct.status, 'failed');
  assert.strictEqual((await run(make({ validUntil: Date.now() - 1000 }))).validity.status, 'failed');
  assert.strictEqual((await run(make({ disclose: ['family_name'] }))).requested_claims.status, 'failed');
  assert.strictEqual((await run(make({ tamper: true }))).digests.status, 'failed');
});

test('a presentation without KB-JWT is refused for a holder-bound credential', async () => {
  const token = make();
  const withoutKb = token.slice(0, token.lastIndexOf('~') + 1);
  assert.strictEqual((await run(withoutKb)).key_binding.status, 'failed');
});

test('a signature from another key fails; trust anchors decide issuer trust', async () => {
  const token = make();
  const other = createTestIssuer('Other');
  assert.strictEqual((await run(token, { trustAnchors: loadTrustAnchors([issuer.certPem]) })).issuer_trust.status, 'passed');
  assert.strictEqual((await run(token, { trustAnchors: loadTrustAnchors([other.certPem]) })).issuer_trust.status, 'failed');

  // swap the signature of the issuer JWT with one made by another key
  const forged = make({ issuer: other }).split('~');
  const real = token.split('~');
  const [h, p] = real[0].split('.');
  forged[0] = `${h}.${p}.${forged[0].split('.')[2]}`;
  assert.strictEqual((await run(forged.join('~'))).issuer_signature.status, 'failed');
});

test('issuer metadata is never fetched for issuers that are not allow-listed', async () => {
  const noX5c = make().split('~');
  const [h, p, s] = noX5c[0].split('.');
  const header = JSON.parse(Buffer.from(h, 'base64url'));
  delete header.x5c;
  noX5c[0] = `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${p}.${s}`;
  const c = await run(noX5c.join('~'));
  assert.strictEqual(c.issuer_signature.status, 'skipped');
  assert.match(c.issuer_signature.detail, /TRUSTED_ISSUER_URLS/);
});
