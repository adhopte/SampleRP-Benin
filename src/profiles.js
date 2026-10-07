'use strict';

/**
 * The two credential "profiles" this sample RP can request.
 *
 * Each profile is the ONLY place where a credential type is described:
 * doctype, namespace and the list of requested data elements. To request
 * different attributes, or to align with your issuer's schema, edit here.
 *
 * `labels` are used by the demo UI to show claims in English and French.
 */
const PID_DOCTYPE = process.env.PID_DOCTYPE || 'eu.europa.ec.eudi.pid.1';
const PID_NAMESPACE = process.env.PID_NAMESPACE || PID_DOCTYPE;

// PLACEHOLDER: replace with the doctype / namespace / element identifiers
// published by the issuer of the Benin birth certificate attestation.
const BC_DOCTYPE = process.env.BIRTH_CERT_DOCTYPE || 'bj.gouv.birth_certificate.1';
const BC_NAMESPACE = process.env.BIRTH_CERT_NAMESPACE || BC_DOCTYPE;

const profiles = {
  pid: {
    id: 'pid',
    doctype: PID_DOCTYPE,
    namespace: PID_NAMESPACE,
    format: 'mso_mdoc',
    // Data elements requested from the wallet (data minimisation: ask only what you need).
    requested: ['family_name', 'given_name', 'birth_date'],
    labels: {
      family_name: { en: 'Family name', fr: 'Nom de famille' },
      given_name: { en: 'Given name(s)', fr: 'Prénom(s)' },
      birth_date: { en: 'Date of birth', fr: 'Date de naissance' },
      nationality: { en: 'Nationality', fr: 'Nationalité' },
      age_over_18: { en: 'Age 18 or over', fr: 'Âge de 18 ans ou plus' }
    }
  },
  birth_certificate: {
    id: 'birth_certificate',
    doctype: BC_DOCTYPE,
    namespace: BC_NAMESPACE,
    format: 'mso_mdoc',
    requested: [
      'family_name',
      'given_name',
      'birth_date',
      'birth_place',
      'certificate_number',
      'father_name',
      'mother_name'
    ],
    labels: {
      family_name: { en: 'Family name', fr: 'Nom de famille' },
      given_name: { en: 'Given name(s)', fr: 'Prénom(s)' },
      birth_date: { en: 'Date of birth', fr: 'Date de naissance' },
      birth_place: { en: 'Place of birth', fr: 'Lieu de naissance' },
      certificate_number: { en: 'Certificate number', fr: "Numéro de l'acte" },
      father_name: { en: "Father's name", fr: 'Nom du père' },
      mother_name: { en: "Mother's name", fr: 'Nom de la mère' },
      issuing_authority: { en: 'Issuing authority', fr: 'Autorité émettrice' },
      issue_date: { en: 'Issue date', fr: "Date d'établissement" }
    }
  }
};

module.exports = { profiles };
