'use strict';

require('dotenv').config();

const trim = (s) => (s || '').replace(/\/$/, '');

const config = {
  port: Number(process.env.PORT) || 3000,
  // Public HTTPS URL of this deployment (wallets call it), no trailing slash.
  baseUrl: trim(process.env.BASE_URL) || 'http://localhost:3000',
  // client_id shown to the wallet when no signing certificate is configured.
  clientId: process.env.CLIENT_ID || 'sample-rp-benin',
  // Optional OpenID4VP draft client_id_scheme (e.g. "redirect_uri"). Empty = send client_id only,
  // as the original PoC did. With "redirect_uri", client_id is set to the response_uri.
  clientIdScheme: process.env.CLIENT_ID_SCHEME || '',
  // "reference": QR contains a short request_uri (recommended, easy to scan).
  // "value": QR contains the whole request (long, dense QR; legacy wallets only).
  qrMode: process.env.QR_MODE === 'value' ? 'value' : 'reference',
  // "pex" (Presentation Exchange, drafts <= 21) or "dcql" (OpenID4VP 1.0).
  queryLanguage: process.env.QUERY_LANGUAGE === 'dcql' ? 'dcql' : 'pex',
  // Optional: sign the request object (x509_san_dns). See docs, "Signed requests".
  signingKeyFile: process.env.RP_SIGNING_KEY_FILE || '',
  signingCertFile: process.env.RP_SIGNING_CERT_FILE || '',
  // Optional: directory of PEM files for issuer (IACA) trust anchors.
  trustedIssuersDir: process.env.TRUSTED_ISSUER_CERTS_DIR || '',
  // Comma-separated issuer URLs (the SD-JWT `iss`) whose /.well-known/jwt-vc-issuer metadata may be
  // fetched when the credential carries no x5c header. Anything else is never fetched.
  trustedIssuerUrls: (process.env.TRUSTED_ISSUER_URLS || '').split(',').map((s) => s.trim()).filter(Boolean),
  // Do not fail the verification if the issuer signature/trust cannot be checked.
  // Keep "true" for demos, set "false" for anything resembling production.
  allowUntrustedIssuer: process.env.ALLOW_UNTRUSTED_ISSUER !== 'false',
  sessionTtlMs: 10 * 60 * 1000,
  maxSessions: 1000
};

module.exports = config;
