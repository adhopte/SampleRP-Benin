'use strict';

/**
 * EN/FR display labels for the claims defined by the Benin PID / Birth
 * Certificate rulebook (v1.1, standard-namespace edition). Display only: they
 * never change what is requested from the wallet.
 */
const labels = {
  // shared PID / birth certificate
  family_name: { en: 'Family name', fr: 'Nom de famille' },
  family_name_birth: { en: 'Family name at birth', fr: 'Nom de famille à la naissance' },
  given_name: { en: 'Given name(s)', fr: 'Prénom(s)' },
  given_name_birth: { en: 'Given name(s) at birth', fr: 'Prénom(s) à la naissance' },
  birth_date: { en: 'Date of birth', fr: 'Date de naissance' },
  birth_place: { en: 'Place of birth', fr: 'Lieu de naissance' },
  birth_country: { en: 'Country of birth', fr: 'Pays de naissance' },
  birth_state: { en: 'Region of birth', fr: 'Département de naissance' },
  birth_city: { en: 'City / commune of birth', fr: 'Commune de naissance' },
  gender: { en: 'Sex', fr: 'Sexe' },
  issuance_date: { en: 'Issue date', fr: "Date d'émission" },
  issuing_authority: { en: 'Issuing authority', fr: 'Autorité émettrice' },
  document_number: { en: 'Document number', fr: 'Numéro du document' },
  // PID
  age_over_18: { en: 'Age 18 or over', fr: 'Âge de 18 ans ou plus' },
  age_in_years: { en: 'Age in years', fr: 'Âge en années' },
  age_birth_year: { en: 'Year of birth', fr: 'Année de naissance' },
  nationality: { en: 'Nationality', fr: 'Nationalité' },
  resident_address: { en: 'Residential address', fr: 'Adresse de résidence' },
  portrait: { en: 'Portrait', fr: 'Photo' },
  expiry_date: { en: 'Expiry date', fr: "Date d'expiration" },
  issuing_country: { en: 'Issuing country', fr: 'Pays émetteur' },
  personal_administrative_number: { en: 'Personal administrative number', fr: 'Numéro administratif personnel' },
  // Birth certificate
  mother_family_name: { en: "Mother's family name", fr: 'Nom de famille de la mère' },
  mother_given_name: { en: "Mother's given name(s)", fr: 'Prénom(s) de la mère' },
  father_family_name: { en: "Father's family name", fr: 'Nom de famille du père' },
  father_given_name: { en: "Father's given name(s)", fr: 'Prénom(s) du père' },
  birth_record_reference: { en: 'Birth record reference', fr: "Référence de l'acte de naissance" },
  registration_date: { en: 'Registration date', fr: "Date d'enregistrement" },
  registration_place: { en: 'Place of registration', fr: "Lieu d'enregistrement" },
  declarant_name: { en: 'Declarant', fr: 'Déclarant' },
  declarant_relationship: { en: 'Declarant relationship', fr: 'Lien du déclarant' },
  marginal_mentions: { en: 'Marginal mentions', fr: 'Mentions marginales' }
};

module.exports = { labels };
