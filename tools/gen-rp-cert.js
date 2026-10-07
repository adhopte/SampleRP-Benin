#!/usr/bin/env node
'use strict';

/**
 * Generates a SELF-SIGNED P-256 key + certificate for signing request objects
 * (client_id = x509_san_dns:<host>). For testing only: a production RP needs a
 * certificate issued by a CA that the wallet ecosystem trusts (access certificate).
 *
 *   node tools/gen-rp-cert.js [hostname]      (default: host of BASE_URL)
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const host = process.argv[2] || new URL(process.env.BASE_URL || 'http://localhost:3000').hostname;
const dir = path.join(__dirname, '..', 'keys');
fs.mkdirSync(dir, { recursive: true });

execFileSync('openssl', [
  'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes',
  '-keyout', path.join(dir, 'rp-key.pem'), '-out', path.join(dir, 'rp-cert.pem'),
  '-subj', `/CN=${host}`, '-days', '365', '-addext', `subjectAltName=DNS:${host}`
], { stdio: 'inherit' });
fs.chmodSync(path.join(dir, 'rp-key.pem'), 0o600);

console.log(`\nCreated keys/rp-key.pem and keys/rp-cert.pem for DNS:${host}`);
console.log('Add to .env:\n  RP_SIGNING_KEY_FILE=keys/rp-key.pem\n  RP_SIGNING_CERT_FILE=keys/rp-cert.pem');
