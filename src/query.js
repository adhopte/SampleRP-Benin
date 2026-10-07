'use strict';

/**
 * Builds the "what do I want to see" part of the OpenID4VP request.
 * Two syntaxes are supported for the same profile:
 *   - Presentation Exchange (presentation_definition), OpenID4VP drafts <= 21
 *   - DCQL (dcql_query), OpenID4VP 1.0
 */

function buildPresentationDefinition(profile, sessionId, purpose) {
  return {
    id: `${profile.id}-${sessionId}`,
    input_descriptors: [
      {
        id: profile.doctype,
        name: profile.id,
        purpose,
        format: { mso_mdoc: { alg: ['ES256'] } },
        constraints: {
          limit_disclosure: 'required',
          fields: profile.requested.map((element) => ({
            path: [`$['${profile.namespace}']['${element}']`],
            intent_to_retain: false
          }))
        }
      }
    ]
  };
}

function buildDcqlQuery(profile) {
  return {
    credentials: [
      {
        id: profile.id,
        format: 'mso_mdoc',
        meta: { doctype_value: profile.doctype },
        claims: profile.requested.map((element) => ({
          path: [profile.namespace, element],
          intent_to_retain: false
        }))
      }
    ]
  };
}

module.exports = { buildPresentationDefinition, buildDcqlQuery };
