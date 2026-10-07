'use strict';

/** Shared verification-check helpers used by the mdoc and SD-JWT verifiers. */

const crypto = require('crypto');

const pass = (id, detail) => ({ id, status: 'passed', detail });
const fail = (id, detail) => ({ id, status: 'failed', detail });
const skip = (id, detail) => ({ id, status: 'skipped', detail });

function loadTrustAnchors(pems) {
  return pems.map((p) => new crypto.X509Certificate(p));
}

/** x5c / x5chain: leaf first. Accepts DER buffers (mdoc) or base64 strings (JWT). */
function certList(x5c, encoding) {
  const arr = Array.isArray(x5c) ? x5c : [x5c];
  return arr
    .filter(Boolean)
    .map((b) => new crypto.X509Certificate(typeof b === 'string' ? Buffer.from(b, encoding || 'base64') : Buffer.from(b)));
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

module.exports = { pass, fail, skip, loadTrustAnchors, certList, checkChain };
