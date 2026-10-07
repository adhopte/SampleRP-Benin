'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');

test('signed request object (x509_san_dns) verifies with the x5c certificate', () => {
  // Run in a child process: config is read once from the environment at load time.
  const out = execFileSync(process.execPath, ['-e', `
    const { execFileSync } = require('child_process');
    const fs = require('fs'), os = require('os'), path = require('path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rp-'));
    execFileSync('openssl', ['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:P-256','-nodes',
      '-keyout', dir+'/k.pem','-out', dir+'/c.pem','-subj','/CN=rp.example.org','-days','2',
      '-addext','subjectAltName=DNS:rp.example.org'], {stdio:'ignore'});
    process.env.RP_SIGNING_KEY_FILE = dir+'/k.pem';
    process.env.RP_SIGNING_CERT_FILE = dir+'/c.pem';
    process.env.BASE_URL = 'https://rp.example.org';
    const r = require('./src/request'); const { profiles } = require('./src/profiles');
    const s = { id: 'abc', state: 's', nonce: 'n' };
    const params = r.buildRequestParams(s, profiles.pid, 'p');
    console.log(JSON.stringify({ jwt: r.buildRequestObject(params), link: r.buildDeepLink(s, params) }));
  `], { cwd: root }).toString();
  const { jwt, link } = JSON.parse(out);
  const [h, p, sig] = jwt.split('.');
  const header = JSON.parse(Buffer.from(h, 'base64url'));
  const payload = JSON.parse(Buffer.from(p, 'base64url'));
  assert.strictEqual(header.alg, 'ES256');
  assert.strictEqual(payload.client_id, 'x509_san_dns:rp.example.org');
  assert.ok(!('client_id_scheme' in payload));
  const cert = new crypto.X509Certificate(Buffer.from(header.x5c[0], 'base64'));
  assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${p}`),
    { key: cert.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')));
  assert.match(link, /client_id=x509_san_dns%3Arp\.example\.org/);
});

test('DCQL query is generated for both profiles', () => {
  const { buildDcqlQuery } = require('../src/query');
  const { profiles } = require('../src/profiles');
  const pid = buildDcqlQuery(profiles.pid);
  assert.strictEqual(pid.credentials[0].format, 'mso_mdoc');
  assert.strictEqual(pid.credentials[0].meta.doctype_value, 'eu.europa.ec.eudi.pid.1');
  assert.deepStrictEqual(pid.credentials[0].claims[0].path, ['eu.europa.ec.eudi.pid.1', 'family_name']);
  const bc = buildDcqlQuery(profiles.birth_certificate);
  assert.strictEqual(bc.credentials[0].format, 'dc+sd-jwt');
  assert.deepStrictEqual(bc.credentials[0].meta.vct_values, [profiles.birth_certificate.vct]);
  assert.deepStrictEqual(bc.credentials[0].claims.map((c) => c.path[0]).includes('birth_record_reference'), true);
});

test('rulebook alignment: PID mdoc and birth certificate SD-JWT identifiers', () => {
  const { profiles } = require('../src/profiles');
  const { buildPresentationDefinition } = require('../src/query');
  assert.strictEqual(profiles.pid.format, 'mso_mdoc');
  assert.strictEqual(profiles.pid.doctype, 'eu.europa.ec.eudi.pid.1');
  assert.strictEqual(profiles.pid.namespace, 'eu.europa.ec.eudi.pid.1');
  assert.strictEqual(profiles.birth_certificate.format, 'sd-jwt');
  const pd = buildPresentationDefinition(profiles.birth_certificate, 'x', 'p');
  assert.ok('vc+sd-jwt' in pd.input_descriptors[0].format);
  assert.ok(pd.input_descriptors[0].constraints.fields.some((f) => f.path[0] === '$.birth_record_reference'));
  // every requested claim has an EN and FR label
  for (const p of Object.values(profiles)) {
    for (const c of p.requested) assert.ok(p.labels[c] && p.labels[c].en && p.labels[c].fr, `${p.id}.${c}`);
  }
});

test('issuer trust chain: trusted anchor passes, unknown anchor fails', () => {
  const { createTestIssuer, buildDeviceResponse, SAMPLE_DATA } = require('../tools/mdoc-builder');
  const { verifyDeviceResponse, loadTrustAnchors } = require('../src/mdoc');
  const { profiles } = require('../src/profiles');
  const p = profiles.pid;
  const issuer = createTestIssuer();
  const other = createTestIssuer('Someone else');
  const token = buildDeviceResponse({ docType: p.doctype, namespace: p.namespace, elements: SAMPLE_DATA.pid, disclose: p.requested, issuer });
  const status = (anchors) =>
    verifyDeviceResponse(token, { profile: p, trustAnchors: loadTrustAnchors(anchors) })[0].checks
      .find((c) => c.id === 'issuer_trust').status;
  assert.strictEqual(status([issuer.certPem]), 'passed');
  assert.strictEqual(status([other.certPem]), 'failed');
});

test('expired credential and wrong doctype are flagged', () => {
  const { createTestIssuer, buildDeviceResponse, SAMPLE_DATA } = require('../tools/mdoc-builder');
  const { verifyDeviceResponse } = require('../src/mdoc');
  const { profiles } = require('../src/profiles');
  const issuer = createTestIssuer();
  const expired = buildDeviceResponse({
    docType: profiles.pid.doctype, namespace: profiles.pid.namespace, elements: SAMPLE_DATA.pid,
    disclose: profiles.pid.requested, issuer,
    validFrom: Date.now() - 20 * 86400e3, validUntil: Date.now() - 86400e3
  });
  const c1 = verifyDeviceResponse(expired, { profile: profiles.pid })[0].checks;
  assert.strictEqual(c1.find((c) => c.id === 'validity').status, 'failed');
  const wrong = verifyDeviceResponse(expired, { profile: { ...profiles.pid, doctype: 'eu.europa.ec.eudi.birth_certificate.1' } })[0].checks;
  assert.strictEqual(wrong.find((c) => c.id === 'doctype').status, 'failed');
});
