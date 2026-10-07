#!/usr/bin/env node
'use strict';

/**
 * Mock wallet: lets you test the whole RP flow without a real wallet.
 *
 *   node tools/mock-wallet.js "<openid4vp://... link>"  [--tamper]
 *   node tools/mock-wallet.js --base http://localhost:3000 --profile pid
 *
 * It resolves the request (by value or by request_uri), builds a synthetic
 * signed mdoc DeviceResponse for the requested doctype and POSTs it to the
 * response_uri exactly like a wallet would (direct_post, form-encoded).
 */

const { createTestIssuer, buildDeviceResponse, SAMPLE_DATA } = require('./mdoc-builder');
const { profiles } = require('../src/profiles');

function decodeJwtPayload(jwt) {
  return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
}

/** Resolve an openid4vp:// link into the request parameter object. */
async function resolveRequest(link) {
  const q = new URL(link.replace(/^openid4vp:\/\//, 'https://wallet.invalid/')).searchParams;
  if (q.get('request_uri')) {
    const r = await fetch(q.get('request_uri'));
    if (!r.ok) throw new Error(`request_uri returned HTTP ${r.status}`);
    return decodeJwtPayload(await r.text());
  }
  const params = {};
  for (const [k, v] of q) {
    try { params[k] = JSON.parse(v); } catch { params[k] = v; }
  }
  return params;
}

function requestedDoctype(params) {
  if (params.dcql_query) return params.dcql_query.credentials[0].meta.doctype_value;
  return params.presentation_definition.input_descriptors[0].id;
}

/**
 * @param {string} link   openid4vp:// link from the QR code
 * @param {object} opts   { tamper: boolean, issuer, elements }
 */
async function presentToRp(link, opts = {}) {
  const params = await resolveRequest(link);
  const doctype = requestedDoctype(params);
  const profile = Object.values(profiles).find((p) => p.doctype === doctype);
  if (!profile) throw new Error(`mock wallet has no sample data for doctype ${doctype}`);

  const elements = { ...(opts.elements || SAMPLE_DATA[profile.id]) };
  const issuer = opts.issuer || createTestIssuer();
  const token = buildDeviceResponse({
    docType: doctype, namespace: profile.namespace, elements, issuer, tamper: opts.tamper
  });

  const body = new URLSearchParams({ vp_token: token, state: params.state });
  if (params.presentation_definition) {
    body.set('presentation_submission', JSON.stringify({
      id: 'sub-1',
      definition_id: params.presentation_definition.id,
      descriptor_map: [{ id: doctype, format: 'mso_mdoc', path: '$' }]
    }));
  }
  const res = await fetch(params.response_uri, { method: 'POST', body });
  return { status: res.status, body: await res.text(), issuer };
}

async function main() {
  const args = process.argv.slice(2);
  const tamper = args.includes('--tamper');
  const flag = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
  let link = args.find((a) => a.startsWith('openid4vp://'));

  if (!link) {
    const base = flag('--base') || 'http://localhost:3000';
    const profile = flag('--profile') || 'pid';
    const r = await fetch(`${base}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profile })
    });
    const data = await r.json();
    link = data.authorizationRequestUri;
    console.log(`Created session ${data.sessionId} (${profile})`);
  }
  const result = await presentToRp(link, { tamper });
  console.log(`RP answered HTTP ${result.status}: ${result.body}`);
}

if (require.main === module) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { presentToRp, resolveRequest };
