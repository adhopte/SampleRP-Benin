'use strict';

const { verifyDeviceResponse } = require('./mdoc');
const { verifySdJwtVc } = require('./sdjwt');

/**
 * Verifies every vp_token entry against the profile the session asked for.
 * @returns {Promise<object[]>} one result per credential
 */
async function verifyPresentations(tokens, { profile, trustAnchors, expected, issuerAllowlist }) {
  const results = [];
  for (const t of tokens) {
    if (profile.format === 'mso_mdoc') {
      results.push(...verifyDeviceResponse(t, { profile, trustAnchors }));
    } else {
      results.push(await verifySdJwtVc(t, { profile, trustAnchors, expected, issuerAllowlist }));
    }
  }
  return results;
}

module.exports = { verifyPresentations };
