#!/usr/bin/env node
'use strict';

/**
 * Mock wallet: lets you test the whole RP flow without a real wallet.
 *
 *   node tools/mock-wallet.js "<openid4vp://... link>"  [--tamper]
 *   node tools/mock-wallet.js --base http://localhost:3000 --profile pid
 *
 * It resolves the request (by value or by request_uri), builds a synthetic
 * signed mdoc DeviceResponse or SD-JWT presentation for what was requested (only the
 * requested claims are disclosed) and POSTs it to the
 * response_uri exactly like a wallet would (direct_post, form-encoded).
 */

const { createTestIssuer, buildDeviceResponse, buildSdJwtPresentation, SAMPLE_DATA } = require('./mdoc-builder');
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

/**
 * What the request asks for, independent of PEX/DCQL:
 *   { format: 'mso_mdoc'|'sd-jwt', id: doctype|vct, claims: [names] }
 */
function parseRequest(params) {
  if (params.dcql_query) {
    const c = params.dcql_query.credentials[0];
    const mdoc = c.format === 'mso_mdoc';
    return {
      format: mdoc ? 'mso_mdoc' : 'sd-jwt',
      id: mdoc ? c.meta.doctype_value : c.meta.vct_values[0],
      claims: c.claims.map((x) => x.path[x.path.length - 1]),
      descriptorId: c.id, descriptorFormat: c.format
    };
  }
  const d = params.presentation_definition.input_descriptors[0];
  const mdoc = 'mso_mdoc' in d.format;
  const paths = d.constraints.fields.map((f) => f.path[0]);
  return {
    format: mdoc ? 'mso_mdoc' : 'sd-jwt',
    id: mdoc ? d.id : d.constraints.fields.find((f) => f.path[0] === '$.vct').filter.const,
    claims: paths.filter((p) => p !== '$.vct').map((p) => p.match(/\['([^']+)'\]$|^\$\.(.+)$/).slice(1).find(Boolean)),
    descriptorId: d.id, descriptorFormat: mdoc ? 'mso_mdoc' : 'vc+sd-jwt'
  };
}

/**
 * @param {string} link   openid4vp:// link from the QR code
 * @param {object} opts   { tamper: boolean, issuer }
 */
async function presentToRp(link, opts = {}) {
  const params = await resolveRequest(link);
  const req = parseRequest(params);
  const profile = Object.values(profiles).find((p) =>
    p.format === req.format && (req.format === 'mso_mdoc' ? p.doctype === req.id : p.vct === req.id));
  if (!profile) throw new Error(`mock wallet has no sample data for ${req.format} ${req.id}`);

  const issuer = opts.issuer || createTestIssuer();
  let token;
  if (req.format === 'mso_mdoc') {
    const elements = profile.credential === 'pid' ? SAMPLE_DATA.pid : SAMPLE_DATA.birth_certificate.claims;
    token = buildDeviceResponse({
      docType: req.id, namespace: profile.namespace, elements, disclose: req.claims, issuer, tamper: opts.tamper
    });
  } else {
    token = buildSdJwtPresentation({
      vct: req.id, ...SAMPLE_DATA.birth_certificate, disclose: req.claims, issuer,
      aud: params.client_id, nonce: params.nonce, tamper: opts.tamper
    });
  }

  // DCQL (OpenID4VP 1.0): vp_token is a JSON object keyed by the query credential id.
  const vpToken = params.dcql_query ? JSON.stringify({ [req.descriptorId]: [token] }) : token;
  const body = new URLSearchParams({ vp_token: vpToken, state: params.state });
  if (params.presentation_definition) {
    body.set('presentation_submission', JSON.stringify({
      id: 'sub-1',
      definition_id: params.presentation_definition.id,
      descriptor_map: [{ id: req.descriptorId, format: req.descriptorFormat, path: '$' }]
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
