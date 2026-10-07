'use strict';

/**
 * SD-JWT VC verifier (RP side) for the Benin birth certificate attestation.
 *
 * Checks performed (each reported individually, never silently):
 *   - vct                : credential type equals the requested vct
 *   - digests            : every disclosure is referenced by an _sd digest (no extra, no duplicate)
 *   - issuer_signature   : JWT signature, key from the x5c header, or from the issuer's
 *                          /.well-known/jwt-vc-issuer metadata for allow-listed issuers only
 *   - issuer_trust       : x5c chain to a configured trust anchor / issuer allow-list match
 *   - validity           : exp / nbf / iat
 *   - requested_claims   : all requested claims present after disclosure
 *   - key_binding        : KB-JWT: typ, aud = our client_id, nonce = session nonce, iat fresh,
 *                          sd_hash over the presentation, signature with cnf.jwk
 *   - status             : NOT performed (reported as skipped)
 */

const crypto = require('crypto');
const { pass, fail, skip, certList, checkChain } = require('./checks');

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest();
const json = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

const JWT_ALGS = {
  ES256: { hash: 'sha256' },
  ES384: { hash: 'sha384' },
  ES512: { hash: 'sha512' }
};
const TECHNICAL = new Set(['_sd', '_sd_alg', 'iss', 'iat', 'nbf', 'exp', 'cnf', 'vct', 'status', 'sub', 'jti']);

function verifyJwtSignature(jwt, key) {
  const [h, p, s] = jwt.split('.');
  const alg = JWT_ALGS[json(h).alg];
  if (!alg) return { ok: false, error: `unsupported alg ${json(h).alg}` };
  const ok = crypto.verify(alg.hash, Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'));
  return { ok, detail: json(h).alg };
}

/** Walk payload + disclosed values, replacing digests by their disclosures. */
function reconstruct(node, byDigest, used) {
  if (Array.isArray(node)) {
    return node.flatMap((el) => {
      if (el && typeof el === 'object' && '...' in el && Object.keys(el).length === 1) {
        const d = byDigest.get(el['...']);
        if (!d || d.name !== undefined) return [];
        used.add(el['...']);
        return [reconstruct(d.value, byDigest, used)];
      }
      return [reconstruct(el, byDigest, used)];
    });
  }
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) if (k !== '_sd') out[k] = reconstruct(v, byDigest, used);
    for (const digest of node._sd || []) {
      const d = byDigest.get(digest);
      if (d && d.name !== undefined) {
        used.add(digest);
        out[d.name] = reconstruct(d.value, byDigest, used);
      }
    }
    return out;
  }
  return node;
}

/** Fetch issuer JWKS - only for issuers the operator allow-listed (never an arbitrary `iss`). */
async function fetchIssuerKey(iss, kid, allowlist) {
  if (!allowlist.includes(iss)) return { skipped: 'issuer not in TRUSTED_ISSUER_URLS (no x5c in header)' };
  const meta = await (await fetch(`${iss.replace(/\/$/, '')}/.well-known/jwt-vc-issuer`, { signal: AbortSignal.timeout(5000) })).json();
  if (meta.issuer !== iss) return { error: 'issuer metadata "issuer" does not match iss' };
  const jwks = meta.jwks || (meta.jwks_uri && (await (await fetch(meta.jwks_uri, { signal: AbortSignal.timeout(5000) })).json()));
  const jwk = (jwks && jwks.keys || []).find((k) => !kid || k.kid === kid);
  return jwk ? { key: crypto.createPublicKey({ key: jwk, format: 'jwk' }) } : { error: 'no matching key in issuer JWKS' };
}

/**
 * @param {string} token   SD-JWT+KB presentation  <jwt>~<disclosure>~...~<kb-jwt>
 * @param {object} opts    { profile, trustAnchors, expected: {aud, nonce}, issuerAllowlist, now }
 */
async function verifySdJwtVc(token, opts = {}) {
  const now = opts.now || new Date();
  const nowSec = Math.floor(now.getTime() / 1000);
  const { profile, trustAnchors = [], expected = {}, issuerAllowlist = [] } = opts;
  const checks = [];

  const parts = String(token).split('~');
  if (parts.length < 2) throw new Error('Not an SD-JWT presentation (expected "<jwt>~...")');
  const jwt = parts[0];
  const kbJwt = parts[parts.length - 1] || null; // '' when the presentation ends with '~'
  const disclosureStrings = parts.slice(1, -1).filter(Boolean);
  if (jwt.split('.').length !== 3) throw new Error('Malformed issuer-signed JWT');

  const header = json(jwt.split('.')[0]);
  const payload = json(jwt.split('.')[1]);

  // vct
  checks.push(
    profile && profile.vct && payload.vct !== profile.vct
      ? fail('vct', `expected ${profile.vct}, got ${payload.vct}`)
      : pass('vct', payload.vct)
  );

  // disclosures / digests
  const byDigest = new Map();
  let digestProblem = null;
  if ((payload._sd_alg || 'sha-256') !== 'sha-256') digestProblem = `unsupported _sd_alg ${payload._sd_alg}`;
  for (const s of disclosureStrings) {
    try {
      const arr = json(s);
      const digest = b64u(sha256(s));
      if (byDigest.has(digest)) digestProblem = 'duplicate disclosure';
      byDigest.set(digest, arr.length === 3 ? { name: arr[1], value: arr[2] } : { value: arr[1] });
    } catch {
      digestProblem = 'malformed disclosure';
    }
  }
  const used = new Set();
  const claims = reconstruct(payload, byDigest, used);
  const unreferenced = [...byDigest.keys()].filter((d) => !used.has(d));
  if (!digestProblem && unreferenced.length) digestProblem = `${unreferenced.length} disclosure(s) not referenced by the signed _sd digests`;
  checks.push(digestProblem ? fail('digests', digestProblem) : pass('digests', 'all disclosures match the signed digests'));

  // issuer signature + trust
  let issuerKey = null;
  let chain = null;
  if (header.x5c) {
    try {
      chain = certList(header.x5c, 'base64');
      issuerKey = chain[0].publicKey;
    } catch {
      checks.push(fail('issuer_signature', 'x5c contains an invalid certificate'));
    }
  } else {
    try {
      const r = await fetchIssuerKey(payload.iss, header.kid, issuerAllowlist);
      if (r.key) issuerKey = r.key;
      else checks.push(r.error ? fail('issuer_signature', r.error) : skip('issuer_signature', r.skipped));
    } catch (e) {
      checks.push(fail('issuer_signature', `issuer metadata unavailable: ${e.message}`));
    }
  }
  if (issuerKey) {
    const sig = verifyJwtSignature(jwt, issuerKey);
    checks.push(sig.ok ? pass('issuer_signature', sig.detail) : fail('issuer_signature', sig.error || 'signature does not match'));
    if (chain) checks.push(checkChain(chain, trustAnchors, now));
    else checks.push(pass('issuer_trust', `key from allow-listed issuer ${payload.iss}`));
  }

  // validity
  const problems = [];
  if (payload.exp !== undefined && nowSec >= payload.exp) problems.push('expired');
  if (payload.nbf !== undefined && nowSec < payload.nbf) problems.push('not yet valid');
  if (payload.iat !== undefined && payload.iat > nowSec + 300) problems.push('issued in the future');
  checks.push(problems.length ? fail('validity', problems.join(', ')) : pass('validity', payload.exp ? `until ${new Date(payload.exp * 1000).toISOString()}` : 'no exp claim'));

  // requested claims
  if (profile) {
    const missing = profile.requested.filter((c) => !(c in claims));
    checks.push(missing.length ? fail('requested_claims', `missing: ${missing.join(', ')}`) : pass('requested_claims', profile.requested.join(', ')));
  }

  // key binding
  if (!payload.cnf) {
    checks.push(skip('key_binding', 'credential has no cnf (not holder-bound)'));
  } else if (!kbJwt) {
    checks.push(fail('key_binding', 'credential is holder-bound but no KB-JWT was presented'));
  } else {
    try {
      const kbHeader = json(kbJwt.split('.')[0]);
      const kb = json(kbJwt.split('.')[1]);
      const holderKey = crypto.createPublicKey({ key: payload.cnf.jwk, format: 'jwk' });
      const sig = verifyJwtSignature(kbJwt, holderKey);
      const signed = `${parts.slice(0, -1).join('~')}~`;
      const errs = [];
      if (kbHeader.typ !== 'kb+jwt') errs.push('typ is not kb+jwt');
      if (!sig.ok) errs.push('signature');
      if (expected.aud !== undefined && kb.aud !== expected.aud) errs.push('aud');
      if (expected.nonce !== undefined && kb.nonce !== expected.nonce) errs.push('nonce');
      if (kb.sd_hash !== b64u(sha256(signed))) errs.push('sd_hash');
      if (typeof kb.iat !== 'number' || Math.abs(nowSec - kb.iat) > 600) errs.push('iat');
      checks.push(errs.length ? fail('key_binding', `invalid: ${errs.join(', ')}`) : pass('key_binding', 'aud, nonce, sd_hash and holder signature verified'));
    } catch (e) {
      checks.push(fail('key_binding', `malformed KB-JWT: ${e.message}`));
    }
  }

  checks.push(skip('status', payload.status ? 'status reference present but not checked by this sample' : 'no status reference in the credential'));

  const shown = Object.fromEntries(Object.entries(claims).filter(([k]) => !TECHNICAL.has(k)));
  return { format: 'dc+sd-jwt', vct: payload.vct, issuer: payload.iss, claims: { [profile ? profile.vct : 'claims']: shown }, checks };
}

module.exports = { verifySdJwtVc };
