'use strict';

/**
 * ISO/IEC 18013-5 mdoc DeviceResponse decoder + verifier (RP side).
 *
 * Checks performed (each reported individually, never silently):
 *   - doctype            : document docType == requested doctype == MSO docType
 *   - digests            : every disclosed element hashes to the MSO valueDigests
 *   - issuer_signature   : COSE_Sign1 of the MSO verified with the x5c leaf key
 *   - issuer_trust       : x5c chain validates to a configured trust anchor (IACA)
 *   - validity           : MSO validityInfo (validFrom <= now <= validUntil)
 *   - requested_elements : all requested data elements were returned
 *   - device_auth        : NOT performed by this sample (see docs, "Going further")
 */

const crypto = require('crypto');
const { Decoder, Encoder, Tag } = require('cbor-x');

const decoder = new Decoder({ mapsAsObjects: false, useRecords: false });
const encoder = new Encoder({ useRecords: false, mapsAsObjects: false });
const decode = (buf) => decoder.decode(buf);
const encode = (v) => encoder.encode(v);

const mget = (m, k) => (m instanceof Map ? m.get(k) : undefined);

function unwrapTag(v) {
  return v instanceof Tag ? unwrapTag(v.value) : v;
}

/** Turn decoded CBOR into JSON-friendly values for display. */
function toPlain(v, depth = 0) {
  if (depth > 8) return '…';
  if (v instanceof Tag) return toPlain(v.value, depth + 1);
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return `<bytes:${v.length}>`;
  if (v instanceof Date) return v.toISOString();
  if (v instanceof Map) {
    const o = {};
    for (const [k, val] of v) o[String(k)] = toPlain(val, depth + 1);
    return o;
  }
  if (Array.isArray(v)) return v.map((x) => toPlain(x, depth + 1));
  if (typeof v === 'bigint') return v.toString();
  return v;
}

const HASHES = { 'SHA-256': 'sha256', 'SHA-384': 'sha384', 'SHA-512': 'sha512' };
const COSE_ALGS = {
  [-7]: { hash: 'sha256', name: 'ES256' },
  [-35]: { hash: 'sha384', name: 'ES384' },
  [-36]: { hash: 'sha512', name: 'ES512' }
};

const pass = (id, detail) => ({ id, status: 'passed', detail });
const fail = (id, detail) => ({ id, status: 'failed', detail });
const skip = (id, detail) => ({ id, status: 'skipped', detail });

function loadTrustAnchors(pems) {
  return pems.map((p) => new crypto.X509Certificate(p));
}

function certList(x5c) {
  const arr = Array.isArray(x5c) ? x5c : [x5c];
  return arr.filter(Boolean).map((b) => new crypto.X509Certificate(Buffer.from(b)));
}

function checkChain(chain, anchors, now) {
  if (!anchors.length) return skip('issuer_trust', 'no trust anchors configured (TRUSTED_ISSUER_CERTS_DIR)');
  const within = (c) => new Date(c.validFrom) <= now && now <= new Date(c.validTo);
  for (let i = 0; i < chain.length; i++) {
    if (!within(chain[i])) return fail('issuer_trust', `certificate ${i} outside its validity period`);
    const next = chain[i + 1];
    if (next && !chain[i].verify(next.publicKey)) {
      return fail('issuer_trust', `certificate ${i} is not signed by certificate ${i + 1}`);
    }
  }
  const top = chain[chain.length - 1];
  const anchor = anchors.find((a) => top.raw.equals(a.raw) || top.verify(a.publicKey));
  return anchor
    ? pass('issuer_trust', `chain anchored at: ${anchor.subject.replace(/\n/g, ', ')}`)
    : fail('issuer_trust', 'issuer certificate does not chain to any trusted anchor');
}

function verifyIssuerAuth(issuerAuth, anchors, now) {
  const checks = [];
  const [protectedBytes, unprotected, payload, signature] = issuerAuth;
  const protectedMap = decode(protectedBytes);
  const alg = COSE_ALGS[mget(protectedMap, 1)];
  const x5c = mget(unprotected, 33) || mget(protectedMap, 33);

  if (!alg) {
    checks.push(fail('issuer_signature', `unsupported COSE alg ${mget(protectedMap, 1)}`));
    return checks;
  }
  if (!x5c) {
    checks.push(skip('issuer_signature', 'no x5chain (COSE label 33) in issuerAuth'));
    return checks;
  }
  let chain;
  try {
    chain = certList(x5c);
  } catch {
    checks.push(fail('issuer_signature', 'x5chain contains an invalid certificate'));
    return checks;
  }
  const sigStructure = encode(['Signature1', Buffer.from(protectedBytes), Buffer.alloc(0), Buffer.from(payload)]);
  const ok = crypto.verify(
    alg.hash,
    sigStructure,
    { key: chain[0].publicKey, dsaEncoding: 'ieee-p1363' },
    Buffer.from(signature)
  );
  checks.push(ok ? pass('issuer_signature', alg.name) : fail('issuer_signature', 'signature does not match'));
  checks.push(checkChain(chain, anchors, now));
  return checks;
}

/**
 * @param {string|Buffer} token  vp_token entry: base64url CBOR DeviceResponse
 * @param {object} opts          { profile, trustAnchors: X509Certificate[], now: Date }
 * @returns {object[]} one result per document in the response
 */
function verifyDeviceResponse(token, opts = {}) {
  const now = opts.now || new Date();
  const anchors = opts.trustAnchors || [];
  const profile = opts.profile;
  const buf = Buffer.isBuffer(token) ? token : Buffer.from(token, 'base64url');

  let response;
  try {
    response = decode(buf);
  } catch (e) {
    throw new Error(`vp_token is not valid CBOR: ${e.message}`);
  }
  const documents = mget(response, 'documents');
  if (!Array.isArray(documents) || documents.length === 0) {
    throw new Error('DeviceResponse contains no documents');
  }
  const status = mget(response, 'status');
  if (status !== undefined && status !== 0) throw new Error(`DeviceResponse status ${status}`);

  return documents.map((doc) => verifyDocument(doc, { profile, anchors, now }));
}

function verifyDocument(doc, { profile, anchors, now }) {
  const checks = [];
  const docType = mget(doc, 'docType');
  const issuerSigned = mget(doc, 'issuerSigned');
  const issuerAuth = mget(issuerSigned, 'issuerAuth');
  const nameSpaces = mget(issuerSigned, 'nameSpaces');
  if (!docType || !(nameSpaces instanceof Map) || !Array.isArray(issuerAuth)) {
    throw new Error('Malformed mdoc document (docType / issuerSigned / issuerAuth)');
  }

  // MSO (Mobile Security Object) lives in the COSE_Sign1 payload, wrapped in tag 24.
  const mso = decode(Buffer.from(unwrapTag(decode(Buffer.from(issuerAuth[2])))));
  const msoDocType = mget(mso, 'docType');

  if (profile && profile.doctype !== docType) {
    checks.push(fail('doctype', `expected ${profile.doctype}, got ${docType}`));
  } else if (msoDocType !== docType) {
    checks.push(fail('doctype', `docType ${docType} differs from MSO docType ${msoDocType}`));
  } else {
    checks.push(pass('doctype', docType));
  }

  // Disclosed elements + digest verification.
  const claims = {};
  const hashName = HASHES[mget(mso, 'digestAlgorithm')];
  const valueDigests = mget(mso, 'valueDigests');
  const badDigests = [];
  for (const [ns, items] of nameSpaces) {
    claims[ns] = {};
    for (const tagged of items) {
      const itemBytes = Buffer.from(unwrapTag(tagged));
      const item = decode(itemBytes);
      const id = mget(item, 'elementIdentifier');
      claims[ns][id] = toPlain(mget(item, 'elementValue'));
      if (!hashName) continue;
      const expected = mget(mget(valueDigests, ns), mget(item, 'digestID'));
      // Digest is computed over the tag-24-wrapped bytes (IssuerSignedItemBytes).
      const actual = crypto.createHash(hashName).update(encode(new Tag(itemBytes, 24))).digest();
      if (!expected || !actual.equals(Buffer.from(expected))) badDigests.push(`${ns}/${id}`);
    }
  }
  checks.push(
    !hashName
      ? fail('digests', `unsupported digestAlgorithm ${mget(mso, 'digestAlgorithm')}`)
      : badDigests.length
        ? fail('digests', `digest mismatch: ${badDigests.join(', ')}`)
        : pass('digests', 'all disclosed elements match the MSO')
  );

  checks.push(...verifyIssuerAuth(issuerAuth, anchors, now));

  const info = mget(mso, 'validityInfo');
  const from = new Date(toPlain(mget(info, 'validFrom')));
  const until = new Date(toPlain(mget(info, 'validUntil')));
  checks.push(
    from <= now && now <= until
      ? pass('validity', `${from.toISOString()} → ${until.toISOString()}`)
      : fail('validity', `credential not valid now (${from.toISOString()} → ${until.toISOString()})`)
  );

  if (profile) {
    const got = claims[profile.namespace] || {};
    const missing = profile.requested.filter((e) => !(e in got));
    checks.push(
      missing.length
        ? fail('requested_elements', `missing: ${missing.join(', ')}`)
        : pass('requested_elements', profile.requested.join(', '))
    );
  }

  checks.push(skip('device_auth', 'holder binding (DeviceAuth / SessionTranscript) is not verified by this sample'));

  return { format: 'mso_mdoc', docType, claims, checks, validity: toPlain(info) };
}

module.exports = { verifyDeviceResponse, loadTrustAnchors, encode, decode, Tag };
