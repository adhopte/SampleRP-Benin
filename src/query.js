'use strict';

/**
 * Builds the "what do I want to see" part of the OpenID4VP request.
 * Two syntaxes are supported for the same profile:
 *   - Presentation Exchange (presentation_definition), OpenID4VP drafts <= 21
 *   - DCQL (dcql_query), OpenID4VP 1.0
 * and two credential formats: ISO mdoc (mso_mdoc) and SD-JWT VC.
 * The SD-JWT format identifier is "vc+sd-jwt" in PEX/draft requests and "dc+sd-jwt" in DCQL/1.0.
 */

function buildPresentationDefinition(profile, sessionId, purpose) {
  const base = { id: profile.id, name: profile.id, purpose };
  if (profile.format === 'mso_mdoc') {
    return {
      id: `${profile.id}-${sessionId}`,
      input_descriptors: [{
        ...base,
        id: profile.doctype,
        format: { mso_mdoc: { alg: ['ES256'] } },
        constraints: {
          limit_disclosure: 'required',
          fields: profile.requested.map((element) => ({
            path: [`$['${profile.namespace}']['${element}']`],
            intent_to_retain: false
          }))
        }
      }]
    };
  }
  return {
    id: `${profile.id}-${sessionId}`,
    input_descriptors: [{
      ...base,
      format: { 'vc+sd-jwt': { 'sd-jwt_alg_values': ['ES256'], 'kb-jwt_alg_values': ['ES256'] } },
      constraints: {
        limit_disclosure: 'required',
        fields: [
          { path: ['$.vct'], filter: { type: 'string', const: profile.vct } },
          ...profile.requested.map((claim) => ({ path: [`$.${claim}`] }))
        ]
      }
    }]
  };
}

function buildDcqlQuery(profile) {
  if (profile.format === 'mso_mdoc') {
    return {
      credentials: [{
        id: profile.id,
        format: 'mso_mdoc',
        meta: { doctype_value: profile.doctype },
        claims: profile.requested.map((element) => ({ path: [profile.namespace, element], intent_to_retain: false }))
      }]
    };
  }
  return {
    credentials: [{
      id: profile.id,
      format: 'dc+sd-jwt',
      meta: { vct_values: [profile.vct] },
      claims: profile.requested.map((claim) => ({ path: [claim] }))
    }]
  };
}

module.exports = { buildPresentationDefinition, buildDcqlQuery };
