# Guide 2 – Demander une attestation d'acte de naissance (SD-JWT VC), pas à pas

**Langues :** [English](../en/02-birth-certificate-guide.md) · Français
[Aperçu](00-apercu.md) · [Guide PID](01-guide-pid-mdoc.md) · **Guide acte de naissance** · [QR, dépannage, production](03-qr-depannage-production.md)

**Objectif :** permettre à un citoyen de présenter son **attestation d'acte de naissance** – un **SD-JWT VC** émis dans son portefeuille – à votre site (démarche d'état civil, inscription scolaire, demande de prestation…) et recevoir sur votre serveur une réponse **vérifiée**.

Le flux est le même que pour le PID ([Guide 1](01-guide-pid-mdoc.md)) ; ce qui change : le **format du justificatif** (SD-JWT VC au lieu de mdoc), les **données** et la **vérification** (divulgations + JWT de liaison de clé au lieu des empreintes CBOR).

> **Source de référence : le Rulebook PID / Acte de naissance du Bénin v1.1 (édition à espace de noms standard).** L'acte de naissance est un **SD-JWT VC** ; une forme mdoc est *optionnelle*, de même forme réduite (docType = namespace = `eu.europa.ec.eudi.birth_certificate.1`). Tous les noms de données ci-dessous sont ceux du rulebook. Ce que le rulebook marque *To confirm* est signalé ⚠️ ici.

| | Valeur | Source |
|---|---|---|
| Format | `dc+sd-jwt` (`vc+sd-jwt` dans les requêtes PEX/brouillons) | rulebook : SD-JWT |
| `vct` | `https://credentials.benin.example/birth_certificate` ⚠️ | Le rulebook définit le `vct` du PID (`https://credentials.benin.example/pid`) mais **aucun `vct` pour l'acte de naissance**. Cette valeur suit le même modèle – **à confirmer avec l'émetteur** puis à définir dans `BIRTH_CERT_VCT`. |
| Forme mdoc (optionnelle) | docType = namespace = `eu.europa.ec.eudi.birth_certificate.1` | rulebook, onglet « POC Profile ». Activée par `BIRTH_CERT_FORMAT=mso_mdoc`. |
| Autorité émettrice (valeur) | `ANIP` | rulebook |
| Liaison au titulaire | portefeuille lié (`cnf`) quand c'est pris en charge | rulebook |

---

## Étape 0 – Prérequis

- [ ] L'exemple lancé ([démarrage rapide](00-apercu.md#2-démarrage-rapide-5-minutes-sans-portefeuille)) et un `BASE_URL` HTTPS public.
- [ ] Un portefeuille contenant l'acte de naissance SD-JWT de votre émetteur (ou le portefeuille simulé pour commencer).
- [ ] Auprès de l'émetteur : le vrai **`vct`**, et comment sa clé de signature est publiée – une chaîne de certificats `x5c` dans l'en-tête du JWT (vérifiée par rapport aux ancres de confiance) **ou** les métadonnées `/.well-known/jwt-vc-issuer` (voir étape 6).

---

## Étape 1 – Choisir le cas d'usage et ne demander que le nécessaire

La **Verifier Matrix** du rulebook définit les cas d'usage. L'exemple fournit deux profils d'acte de naissance (`src/profiles.js`) :

| Id du profil | Cas d'usage de la Verifier Matrix | Données demandées |
|---|---|---|
| `birth_certificate` | Corroboration de la date de naissance (côté acte) | `family_name`, `given_name`, `birth_date`, `birth_record_reference` |
| `birth_certificate_filiation` | Preuve de filiation | les précédentes **+** `mother_family_name`, `mother_given_name`, `father_family_name`, `father_given_name` |

Données disponibles dans le justificatif (onglet « Birth Certificate » du rulebook) :

| Donnée | Oblig. | SD | Notes |
|---|---|---|---|
| `family_name`, `given_name` | M | Oui | noms actuels de l'enfant |
| `family_name_birth`, `given_name_birth` | O | Oui | à la naissance, si disponibles |
| `birth_date` | M | Oui | |
| `birth_place`, `birth_country`, `birth_state`, `birth_city` | O | Oui | géographie béninoise résolue en noms d'affichage |
| `gender` | O | Oui | entier ISO/IEC 5218 |
| `mother_family_name`, `mother_given_name`, `father_family_name`, `father_given_name` | O | Oui | données descriptives, sans corrélation d'identifiant |
| `birth_record_reference` | **M** | Oui | référence d'acte nationale – reste sur ce justificatif |
| `registration_date`, `registration_place`, `declarant_name`, `declarant_relationship`, `marginal_mentions` | O | Oui | `marginal_mentions` est **sensible** |
| `issuance_date`, `issuing_authority` | M | **Non** | toujours visibles (métadonnées du justificatif) |
| `document_number` | O | Oui | |

> Ne demandez **que** ce que le cas d'usage exige : les noms des parents et les mentions marginales sont sensibles. La Verifier Matrix indique `portrait` et adresse comme *non requis par défaut* ; l'acte de naissance ne les contient pas.

Pour changer ce que demande un profil, modifiez son tableau `requested`, par exemple :

```js
birth_certificate: birthCertificate('birth_certificate',
  ['family_name', 'given_name', 'birth_date', 'birth_record_reference'], /* titre, description */)
```

Chaque donnée demandée a besoin d'une entrée EN et FR dans `src/labels.js` (un test le vérifie).

---

## Étape 2 – Créer une session

`POST /api/session {"profile":"birth_certificate"}` – même point d'accès que pour le PID. La réponse contient le lien `openid4vp://`, le QR (`qrUrl`) et ses métriques. Le QR reste petit (version 8–9) car il ne porte que le `request_uri`.

---

## Étape 3 – La requête reçue par le portefeuille

Le portefeuille récupère `request_uri` et obtient un JWT dont le contenu comprend (forme PEX / brouillon, `QUERY_LANGUAGE=pex`) :

```json
"presentation_definition": {
  "id": "birth_certificate-<id de session>",
  "input_descriptors": [{
    "id": "birth_certificate",
    "format": { "vc+sd-jwt": { "sd-jwt_alg_values": ["ES256"], "kb-jwt_alg_values": ["ES256"] } },
    "constraints": {
      "limit_disclosure": "required",
      "fields": [
        { "path": ["$.vct"], "filter": { "type": "string", "const": "https://credentials.benin.example/birth_certificate" } },
        { "path": ["$.family_name"] },
        { "path": ["$.given_name"] },
        { "path": ["$.birth_date"] },
        { "path": ["$.birth_record_reference"] }
      ]
    }
  }]
}
```

Avec `QUERY_LANGUAGE=dcql` (OpenID4VP 1.0) :

```json
"dcql_query": { "credentials": [{
  "id": "birth_certificate",
  "format": "dc+sd-jwt",
  "meta": { "vct_values": ["https://credentials.benin.example/birth_certificate"] },
  "claims": [ { "path": ["family_name"] }, { "path": ["given_name"] }, { "path": ["birth_date"] }, { "path": ["birth_record_reference"] } ]
}]}
```

La requête contient aussi : `nonce`, `state`, `response_uri`, `response_mode=direct_post`, `client_id`. Le portefeuille ne doit divulguer **que** les données demandées (plus les métadonnées non divulguables sélectivement).

---

## Étape 4 – Afficher le QR code et le lien « même appareil »

Identique à l'[étape 4 du PID](01-guide-pid-mdoc.md#étape-4--afficher-le-qr-code-et-un-lien--même-appareil-). Avec le widget :

```js
SampleRpBenin.mount(document.getElementById('wallet-verify'), {
  apiBase: 'https://votre-backend-rp.example.org',
  profile: 'birth_certificate',        // ou 'birth_certificate_filiation'
  lang: 'fr',
  onResult: (session) => { /* session.status === 'verified' | 'rejected' */ }
});
```

---

## Étape 5 – Recevoir la réponse

`POST /api/response` avec `vp_token` et `state` – exactement comme pour le PID. Pour un SD-JWT, `vp_token` est la **chaîne de présentation** :

```
<JWT signé par l'émetteur>~<divulgation 1>~<divulgation 2>~…~<JWT de liaison de clé>
```

(DCQL : un objet JSON `{ "birth_certificate": ["<présentation>"] }` – l'exemple gère les deux.) Une seconde réponse pour la même session est refusée.

Anatomie :

```
JWT de l'émetteur   en-tête : { alg: ES256, typ: dc+sd-jwt, x5c: [...] }
                    contenu : { iss, iat, exp, vct, cnf: {jwk}, _sd_alg: sha-256,
                                _sd: [empreinte, empreinte, …],     ← une par donnée divulgable sélectivement
                                issuance_date, issuing_authority }   ← données en clair (SD = Non)
Divulgation         base64url([ sel, "family_name", "KOSSI" ])       ← une par donnée présentée
KB-JWT              en-tête : { alg: ES256, typ: kb+jwt }
                    contenu : { iat, aud, nonce, sd_hash }
```

---

## Étape 6 – Vérifier le SD-JWT (ne jamais l'omettre)

`src/sdjwt.js → verifySdJwtVc` rapporte chaque contrôle séparément :

| Contrôle | Ce qu'il prouve | Échoue quand |
|---|---|---|
| `vct` | Bon type de justificatif | le `vct` diffère de celui demandé |
| `digests` | Le SHA-256 de chaque divulgation correspond à une empreinte du `_sd` **signé** ; aucune non référencée ni dupliquée | une valeur a été modifiée ou injectée (`--tamper`) |
| `issuer_signature` | La signature du JWT est valide avec la clé de l'émetteur | signature invalide / algorithme non géré |
| `issuer_trust` | La clé appartient à un émetteur de confiance | `x5c` ne remonte pas à `TRUSTED_ISSUER_CERTS_DIR` ; *non effectué* sans ancres |
| `validity` | `exp`, `nbf`, `iat` | expiré / pas encore valide |
| `requested_claims` | Toutes les données demandées sont arrivées | le portefeuille en a retenu une |
| `key_binding` | Le **titulaire** l'a présenté à **vous**, maintenant : KB-JWT signé avec `cnf.jwk`, `aud` = votre `client_id`, `nonce` = celui de la session, `sd_hash` couvre exactement la présentation | rejeu vers une autre RP/session, KB-JWT falsifié ou absent |
| `status` | *Non effectué* – statut/révocation signalé comme ignoré | – |

**D'où vient la clé de l'émetteur ?**
1. **`x5c` dans l'en-tête du JWT** (ce que fait l'émetteur simulé) : la clé du certificat feuille vérifie la signature, et la chaîne est validée par rapport à vos ancres de confiance.
2. **Pas de `x5c` :** l'exemple récupère `<iss>/.well-known/jwt-vc-issuer` **uniquement si `iss` figure dans `TRUSTED_ISSUER_URLS`** (séparées par des virgules). Il ne récupère jamais une URL `iss` arbitraire provenant d'un justificatif (protection SSRF). Sinon le contrôle de signature est *non effectué* et indique pourquoi.

> **Un justificatif ne vaut que par `issuer_trust`.** Configurez l'émetteur (certificat ou `TRUSTED_ISSUER_URLS`) et définissez `ALLOW_UNTRUSTED_ISSUER=false` avant de vous fier aux résultats.

---

## Étape 7 – Lire le résultat et l'utiliser côté serveur

```json
{
  "status": "verified",
  "profile": "birth_certificate",
  "format": "dc+sd-jwt",
  "results": [{
    "format": "dc+sd-jwt",
    "vct": "https://credentials.benin.example/birth_certificate",
    "claims": { "https://credentials.benin.example/birth_certificate": {
      "family_name": "KOSSI", "given_name": "Jean", "birth_date": "1990-05-12",
      "birth_record_reference": "TEST-ACTE-1990-000123",
      "issuance_date": "2025-02-01", "issuing_authority": "ANIP" } },
    "checks": [ { "id": "vct", "status": "passed" }, { "id": "digests", "status": "passed" }, "…" ]
  }]
}
```

*(Valeurs fictives du portefeuille simulé, dans le style de l'onglet « Benin Display Simulation » du rulebook.)*

Usages typiques côté serveur (Verifier Matrix) :

- **Corroboration de la date de naissance (PID + acte de naissance) :** faites une présentation de PID, puis une d'acte de naissance dans le même parcours, et comparez `birth_date` (et les noms). Le rulebook dit de *préférer la corrélation par identifiant* (`personal_administrative_number` sur le PID, `birth_record_reference` sur l'acte) *quand c'est possible*, sinon un rapprochement contrôlé. L'exemple exécute les deux présentations séparément ; une requête combinée unique n'est pas implémentée.
- **Preuve de filiation :** utilisez `birth_certificate_filiation` ; comparez les noms des parents à vos propres dossiers ; ne conservez que le nécessaire.
- Prenez la décision **côté serveur**, là où `session.status = 'verified'` est positionné (`server.js`, `/api/response`), jamais à partir de données postées par le navigateur.

---

## Étape 8 – Tester

1. `npm test` – inclut des flux SD-JWT, des échecs de liaison de clé (mauvais `aud`/`nonce`), des cas expirés/altérés/falsifiés.
2. `npm run mock-wallet -- --profile birth_certificate` (et `birth_certificate_filiation`) ; ajoutez `--tamper` pour un rejet (`digests: failed`).
3. `./samples/curl-walkthrough.sh birth_certificate` – chaque appel HTTP.
4. Un vrai portefeuille avec le justificatif de l'émetteur. Si un contrôle échoue, ouvrez *Détails techniques (JSON)* :
   - `vct: failed – expected X, got Y` → définissez `BIRTH_CERT_VCT=Y` (⚠️ le point à confirmer ci-dessus).
   - `requested_claims: failed – missing: …` → l'émetteur nomme les données autrement ; alignez `requested` avec le rulebook/l'émetteur.
   - `key_binding: failed – invalid: aud` → le portefeuille a utilisé comme audience un `client_id` différent de celui de la requête ; comparez-les (voir [dépannage](03-qr-depannage-production.md#2-dépannage)).
   - `issuer_signature: skipped` → ajoutez l'émetteur à `TRUSTED_ISSUER_URLS` ou faites inclure `x5c` par l'émetteur.
   - Si le portefeuille affiche « aucun justificatif correspondant », le `vct` ne correspond pas à celui qu'il détient.

### Si vous avez besoin de la forme mdoc
Définissez `BIRTH_CERT_FORMAT=mso_mdoc` : le profil demande alors le docType/namespace `eu.europa.ec.eudi.birth_certificate.1` et est vérifié comme le PID ([Guide 1, étape 6](01-guide-pid-mdoc.md#étape-6--vérifier-le-mdoc-ne-jamais-lomettre)).

---

## Liste de contrôle du développeur

- [ ] Le `vct` de l'acte de naissance est confirmé avec l'émetteur (`BIRTH_CERT_VCT`) – le rulebook ne le définit pas.
- [ ] Les noms de données sont ceux du rulebook ; seul le nécessaire au cas d'usage est demandé (parents / mentions marginales uniquement si la loi l'exige).
- [ ] Confiance dans l'émetteur configurée (`TRUSTED_ISSUER_CERTS_DIR` ou `TRUSTED_ISSUER_URLS`) ; `ALLOW_UNTRUSTED_ISSUER=false` hors démonstration.
- [ ] `key_binding` réussit (une présentation copiée ne peut pas être rejouée).
- [ ] Une stratégie de révocation/statut est convenue avec l'émetteur (non implémentée dans l'exemple).
- [ ] Les résultats sont traités côté serveur ; les données personnelles ne sont pas journalisées ; la conservation est définie.
- [ ] QR affiché ≥ 280 px, noir sur blanc, avec le lien « même appareil ».
