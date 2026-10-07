'use strict';

const { labels } = require('./labels');

/**
 * Credential profiles = (credential, format, claims requested).
 *
 * Source of truth: "Benin PID / Birth Certificate Rulebook v1.1 (Standard-Namespace
 * Edition)":
 *   - PID                : ISO 18013-5 mdoc, docType = namespace = eu.europa.ec.eudi.pid.1
 *                          (the PID SD-JWT is out of scope of the rulebook)
 *   - Birth certificate  : SD-JWT VC (mdoc optional, same trimmed shape, docType =
 *                          namespace = eu.europa.ec.eudi.birth_certificate.1)
 * Claim names are the rulebook's; no Benin-specific namespace exists.
 *
 * Profiles map to the rulebook's "Verifier Matrix" use cases. Request only the
 * claims a use case needs: edit `requested` below (data minimisation).
 */
const PID_DOCTYPE = process.env.PID_DOCTYPE || 'eu.europa.ec.eudi.pid.1';
const PID_NAMESPACE = process.env.PID_NAMESPACE || PID_DOCTYPE;

const BC_FORMAT = process.env.BIRTH_CERT_FORMAT === 'mso_mdoc' ? 'mso_mdoc' : 'sd-jwt';
const BC_DOCTYPE = process.env.BIRTH_CERT_DOCTYPE || 'eu.europa.ec.eudi.birth_certificate.1';
const BC_NAMESPACE = process.env.BIRTH_CERT_NAMESPACE || BC_DOCTYPE;
// The rulebook gives the PID vct (https://credentials.benin.example/pid) but no vct for the birth
// certificate: this value follows the same pattern and is TO CONFIRM with the issuer.
const BC_VCT = process.env.BIRTH_CERT_VCT || 'https://credentials.benin.example/birth_certificate';

const pick = (names) => Object.fromEntries(names.map((n) => [n, labels[n]]));

function pid(id, requested, title, description) {
  return {
    id, credential: 'pid', format: 'mso_mdoc', doctype: PID_DOCTYPE, namespace: PID_NAMESPACE,
    requested, title, description, labels: pick(Object.keys(labels))
  };
}

function birthCertificate(id, requested, title, description) {
  const mdoc = BC_FORMAT === 'mso_mdoc';
  return {
    id, credential: 'birth_certificate', format: BC_FORMAT, doctype: BC_DOCTYPE, namespace: BC_NAMESPACE,
    vct: mdoc ? undefined : BC_VCT, requested, title, description, labels: pick(Object.keys(labels))
  };
}

const profiles = {
  // Verifier Matrix: "Identity verification"
  pid: pid('pid', ['family_name', 'given_name', 'birth_date'], {
    en: 'Identity (PID)', fr: 'Identité (PID)'
  }, {
    en: 'Family name, given name(s) and date of birth from the national digital ID (mdoc).',
    fr: "Nom, prénom(s) et date de naissance issus de l'identité numérique nationale (mdoc)."
  }),
  // Verifier Matrix: "Age > 18" - prefer age_over_18 over birth_date
  pid_age_over_18: pid('pid_age_over_18', ['age_over_18'], {
    en: 'Age 18+ (PID)', fr: 'Majorité 18+ (PID)'
  }, {
    en: 'Only a yes/no "18 or over" answer – no date of birth is shared.',
    fr: 'Uniquement la réponse oui/non « 18 ans ou plus » – aucune date de naissance partagée.'
  }),
  // Verifier Matrix: "Birth-date corroboration" (PID + birth certificate), certificate side
  birth_certificate: birthCertificate(
    'birth_certificate',
    ['family_name', 'given_name', 'birth_date', 'birth_record_reference'],
    { en: 'Birth certificate', fr: 'Acte de naissance' },
    {
      en: 'Birth certificate attestation (SD-JWT): name, date of birth and record reference.',
      fr: "Attestation d'acte de naissance (SD-JWT) : nom, date de naissance et référence de l'acte."
    }
  ),
  // Verifier Matrix: "Filiation proof"
  birth_certificate_filiation: birthCertificate(
    'birth_certificate_filiation',
    ['family_name', 'given_name', 'birth_date', 'mother_family_name', 'mother_given_name',
      'father_family_name', 'father_given_name'],
    { en: 'Birth certificate – filiation', fr: 'Acte de naissance – filiation' },
    {
      en: 'Adds the parents\' names (sensitive: request only where filiation must be proven).',
      fr: 'Ajoute les noms des parents (sensible : à demander uniquement pour prouver la filiation).'
    }
  )
};

module.exports = { profiles };
