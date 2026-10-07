# Sample RP Benin – Aperçu et démarrage rapide

**Langues :** [English](../en/00-overview.md) · Français
**Guides :** [PID (mdoc)](01-guide-pid-mdoc.md) · [Acte de naissance (mdoc)](02-guide-acte-de-naissance.md) · [QR code, dépannage, production](03-qr-depannage-production.md)

Ce projet est une petite **partie utilisatrice (vérificateur, « relying party »)** fonctionnelle. Elle demande un justificatif au portefeuille d'identité numérique d'un citoyen via **OpenID for Verifiable Presentations (OpenID4VP)**, en **présentation à distance** (appareil différent ou même appareil). Il suit le **Rulebook PID / Acte de naissance du Bénin v1.1 (édition à espace de noms standard)** : le **PID** est demandé en **mdoc ISO 18013-5**, l'**attestation d'acte de naissance** en **SD-JWT VC**.

Il permet aux développeurs d'un site de partie utilisatrice de **lire, exécuter, copier et adapter** une implémentation réelle. Quatre profils prêts à l'emploi (les cas d'usage de la *Verifier Matrix* du rulebook) sont fournis :

| Id du profil | Justificatif / format | Données demandées | Guide |
|---|---|---|---|
| `pid` | PID – mdoc, docType = namespace `eu.europa.ec.eudi.pid.1` | `family_name`, `given_name`, `birth_date` | [Guide PID](01-guide-pid-mdoc.md) |
| `pid_age_over_18` | PID – mdoc | `age_over_18` uniquement | [Guide PID](01-guide-pid-mdoc.md) |
| `birth_certificate` | Acte de naissance – **SD-JWT VC** | `family_name`, `given_name`, `birth_date`, `birth_record_reference` | [Guide acte de naissance](02-guide-acte-de-naissance.md) |
| `birth_certificate_filiation` | Acte de naissance – SD-JWT VC | ci-dessus + noms de la mère et du père | [Guide acte de naissance](02-guide-acte-de-naissance.md) |

> **Statut.** Il s'agit d'un exemple pour développeurs, pas d'un vérificateur certifié. Il vérifie l'intégrité des données (empreintes), la signature de l'émetteur, la période de validité et – pour le SD-JWT – le JWT de liaison de clé du titulaire, et peut valider la chaîne de l'émetteur par rapport aux ancres de confiance que vous configurez. Il ne vérifie **pas** la liaison au titulaire du mdoc (DeviceAuth) ni le statut de révocation. Voir la [liste de contrôle production](03-qr-depannage-production.md#4-liste-de-contrôle-production).

---

## 1. Fonctionnement du flux de présentation à distance

```mermaid
sequenceDiagram
    autonumber
    participant B as Navigateur du citoyen<br/>(votre site)
    participant RP as Backend RP<br/>(cet exemple)
    participant W as Application portefeuille

    B->>RP: POST /api/session {profile}
    Note over RP: crée la session + state et nonce aléatoires
    RP-->>B: lien openid4vp:// + QR code (SVG)
    B->>W: scan du QR (autre appareil) ou clic sur le lien (même appareil)
    W->>RP: GET request_uri
    RP-->>W: objet de requête (JWT) : ce que je veux voir, response_uri, nonce, state
    W->>W: affiche l'écran de consentement ; le citoyen accepte
    W->>RP: POST response_uri (vp_token = DeviceResponse mdoc ou présentation SD-JWT, state)
    Note over RP: vérifie le justificatif : empreintes, signature, validité, type, données demandées (+ liaison de clé pour le SD-JWT)
    RP-->>W: 200 {} (ou 400 + erreur)
    B->>RP: GET /api/session/:id (interrogation toutes les 1,5 s)
    RP-->>B: statut verified | rejected + données + contrôles
```

Points clés à retenir :

1. **Le portefeuille appelle votre serveur.** `response_uri` doit être accessible depuis Internet en HTTPS. `localhost` ne fonctionne qu'avec un tunnel (voir §3).
2. **Le navigateur ne voit jamais directement le justificatif.** Le portefeuille poste vers votre backend ; le navigateur interroge seulement le résultat. Prenez les décisions métier **côté serveur**.
3. **`state` et `nonce` sont des secrets à usage unique**, générés par session. `state` relie la réponse du portefeuille à la bonne session de navigateur ; `nonce` doit être lié à la signature du titulaire (voir « Aller plus loin »).
4. **Le QR code ne contient qu'un lien court** (`request_uri`) – le portefeuille récupère la requête complète. C'est ce qui rend le QR petit et facile à scanner. Détails dans le [guide 3](03-qr-depannage-production.md#1-pourquoi-le-qr-code-nécessitait-un-zoom-et-ce-qui-a-changé).

---

## 2. Démarrage rapide (5 minutes, sans portefeuille)

Prérequis : Node.js 18+ (22 recommandé). `openssl` n'est nécessaire que pour le portefeuille simulé, les tests et `npm run gen-cert`.

```bash
npm install
cp .env.example .env
npm start                      # http://localhost:3000
```

Ouvrez <http://localhost:3000>, choisissez **Identité (PID)** ou **Acte de naissance**, puis – dans un second terminal – jouez le rôle du portefeuille :

```bash
# Copiez le lien de la section « Requête d'autorisation brute » de la page, puis :
npm run mock-wallet -- "openid4vp://?client_id=..."

# ou laissez l'outil créer lui-même une session et la présenter :
npm run mock-wallet -- --profile pid
npm run mock-wallet -- --profile birth_certificate            # SD-JWT VC
npm run mock-wallet -- --profile birth_certificate --tamper   # montre un justificatif rejeté
```

La page passe à **Justificatif accepté** et affiche les données et chaque contrôle. Lancez les tests automatiques avec `npm test`.

Pour voir chaque appel HTTP du protocole : `./samples/curl-walkthrough.sh pid`.

---

## 3. Le rendre accessible à un vrai portefeuille

L'application portefeuille doit atteindre `https://<votre-hôte>/api/request/...` et `https://<votre-hôte>/api/response`.

| Option | Quand | Comment |
|---|---|---|
| Tunnel | Démo rapide depuis votre ordinateur | `ngrok http 3000` (ou `cloudflared tunnel --url http://localhost:3000`), placez l'URL `https://…` affichée dans `.env` comme `BASE_URL`, relancez `npm start`, ouvrez la page **via cette URL**. |
| Render | Démo stable partagée | Connectez le dépôt, utilisez `render.yaml` (ou : build `npm ci --omit=dev`, start `npm start`), définissez `BASE_URL=https://<service>.onrender.com`, redéployez une fois. |
| Tout hébergeur Node | Railway, Fly.io, VM derrière nginx… | `npm ci --omit=dev && npm start`, définissez `BASE_URL` et `PORT`. Terminez TLS en amont. |

> Si `BASE_URL` est faux, le portefeuille sera envoyé à une mauvaise adresse et échouera. Le journal de démarrage affiche le `response_uri` utilisé.

---

## 4. Configuration (`.env`)

| Variable | Défaut | Signification |
|---|---|---|
| `BASE_URL` | `http://localhost:3000` | URL HTTPS publique de ce déploiement. |
| `PORT` | `3000` | Port d'écoute. |
| `QR_MODE` | `reference` | `reference` : le QR contient un `request_uri` court (recommandé). `value` : le QR contient la requête complète (long ; uniquement pour d'anciens portefeuilles ne sachant pas récupérer `request_uri`). |
| `QUERY_LANGUAGE` | `pex` | `pex` : `presentation_definition` Presentation Exchange (brouillons OpenID4VP ≤ 21 ; identifiant de format SD-JWT `vc+sd-jwt`). `dcql` : `dcql_query` (OpenID4VP 1.0 ; identifiant `dc+sd-jwt`). Choisissez ce que gère votre portefeuille. |
| `CLIENT_ID` | `sample-rp-benin` | `client_id` envoyé quand la requête n'est pas signée. |
| `CLIENT_ID_SCHEME` | *(vide)* | `client_id_scheme` des brouillons, ex. `redirect_uri` (alors `client_id` = `response_uri`). |
| `PID_DOCTYPE`, `PID_NAMESPACE` | `eu.europa.ec.eudi.pid.1` | Identifiants du PID. |
| `BIRTH_CERT_FORMAT` | `sd-jwt` | `sd-jwt` (rulebook) ou `mso_mdoc` (forme optionnelle). |
| `BIRTH_CERT_VCT` | `https://credentials.benin.example/birth_certificate` | ⚠️ Non défini par le rulebook (seul le `vct` du PID l'est) – **à confirmer avec l'émetteur**. |
| `BIRTH_CERT_DOCTYPE`, `BIRTH_CERT_NAMESPACE` | `eu.europa.ec.eudi.birth_certificate.1` | Utilisés uniquement avec `BIRTH_CERT_FORMAT=mso_mdoc`. |
| `RP_SIGNING_KEY_FILE`, `RP_SIGNING_CERT_FILE` | *(vide)* | Signe l'objet de requête ; `client_id` devient `x509_san_dns:<hôte>`. `npm run gen-cert` crée une paire de **test**. |
| `TRUSTED_ISSUER_CERTS_DIR` | *(vide)* | Dossier de certificats racine PEM de confiance pour les émetteurs (comparés à `x5c` / `x5chain`). |
| `TRUSTED_ISSUER_URLS` | *(vide)* | URL d'émetteurs SD-JWT (`iss`), séparées par des virgules, dont les métadonnées `/.well-known/jwt-vc-issuer` peuvent être récupérées quand le justificatif n'a pas de `x5c`. Jamais récupérées pour d'autres émetteurs. |
| `ALLOW_UNTRUSTED_ISSUER` | `true` | `false` rejette les justificatifs dont la chaîne émetteur n'est pas validée par les ancres de confiance. |

---

## 5. API HTTP de l'exemple

| Méthode et chemin | Appelé par | Rôle |
|---|---|---|
| `GET /api/profiles` | votre page web | Liste les profils (id, format, titre, description, données demandées). |
| `POST /api/session` `{ "profile": "<id du profil>" }` | votre page web | Crée une session. Retourne `sessionId`, `authorizationRequestUri` (`openid4vp://…`), `qrUrl`, métriques `qr`. |
| `GET /api/session/:id/qr.svg` | votre page web | Le QR code en SVG (avec zone de silence de 4 modules). |
| `GET` ou `POST /api/request/:id` | **portefeuille** | Retourne l'objet de requête (`application/oauth-authz-req+jwt`). |
| `POST /api/response` (form-encoded) | **portefeuille** | `response_uri`. Champs : `vp_token` (mdoc ou SD-JWT), `state`, `presentation_submission` (PEX uniquement). |
| `GET /api/session/:id` | votre page web | `status` (`pending`/`verified`/`rejected`), données, libellés (EN/FR), contrôles, erreur. |
| `GET /health` | supervision | Disponibilité + configuration active. |

Les sessions durent 10 minutes, en mémoire.

---

## 6. Plan du projet

```
server.js                 Points d'accès HTTP (session, request_uri, response_uri, statut)
src/config.js             configuration par variables d'environnement
src/profiles.js           ★ les profils de justificatifs (rulebook) : format, doctype/vct, données demandées
src/labels.js             libellés EN/FR de chaque donnée du rulebook
src/query.js              construit presentation_definition (PEX) ou dcql_query, pour mdoc et SD-JWT
src/request.js            paramètres de requête, lien openid4vp://, objet de requête (signé ou non), QR SVG
src/mdoc.js               décodage et vérification de la DeviceResponse mdoc
src/sdjwt.js              vérification SD-JWT VC (divulgations, signature, liaison de clé)
src/verify.js, src/checks.js   aiguillage par format ; utilitaires de contrôle communs
public/                   interface de démo (bilingue) : index.html, app.js, i18n.js, style.css
samples/embed/            widget à intégrer dans n'importe quel site + page d'exemple
samples/curl-walkthrough.sh   le protocole avec curl
tools/mock-wallet.js      jouer le portefeuille sans téléphone
tools/mdoc-builder.js     construit des mdoc et présentations SD-JWT synthétiques signés (tests, portefeuille simulé)
tools/gen-rp-cert.js      certificat de test pour requêtes signées
test/                     tests automatiques (npm test)
docs/en, docs/fr          cette documentation
```

★ = le premier fichier que vous modifierez.

---

## 7. Ce qui n'est volontairement pas couvert

- **Réponses chiffrées** (`response_mode=direct_post.jwt`, JWE). Certains portefeuilles/profils les exigent ; cet exemple utilise `direct_post` en clair.
- **Liaison au titulaire du mdoc** (`DeviceAuth` sur le `SessionTranscript`) – le transcript exact dépend de la version d'OpenID4VP de votre portefeuille. (La liaison de clé SD-JWT *est* vérifiée.)
- **PID en SD-JWT** – hors périmètre du rulebook (le PID est demandé uniquement en mdoc).
- **Une requête unique combinant PID + acte de naissance** (corroboration de la date de naissance) : exécutez les deux présentations l'une après l'autre.
- **Révocation / statut** (l'étape « statut » du rulebook) : signalé comme *non effectué*.
- Stockage de sessions persistant, limitation de débit, politique de journalisation – voir la [liste de contrôle production](03-qr-depannage-production.md#4-liste-de-contrôle-production).

---

## 8. Conformité avec le rulebook du Bénin (v1.1)

| Règle du rulebook | Dans cet exemple |
|---|---|
| PID mdoc : docType = namespace = `eu.europa.ec.eudi.pid.1`, aucun espace de noms propre au Bénin | ✔ `src/profiles.js` ; le réalisme béninois vient des **valeurs** des données (`issuing_authority` = `ANIP`, `issuing_country` = `BJ`, …) |
| Le PID SD-JWT est hors périmètre | ✔ non implémenté |
| Acte de naissance = SD-JWT (mdoc optionnel, même forme réduite) | ✔ SD-JWT par défaut ; `BIRTH_CERT_FORMAT=mso_mdoc` pour la forme optionnelle |
| Noms des données (éléments PID mdoc, BC-001…BC-023) | ✔ utilisés tels quels ; chaque donnée demandée a des libellés EN/FR |
| Cas d'usage de la Verifier Matrix : identité, âge > 18 (préférer `age_over_18`), corroboration de la date de naissance, filiation | ✔ profils identité, âge et filiation ; corroboration = deux présentations successives |
| « Valider émetteur, signature, statut, validité et données demandées » | ✔ émetteur (confiance), signature, validité, données demandées · ✖ **statut** (signalé *non effectué*) |
| Ne demander `personal_administrative_number` que si nécessaire ; pas de `portrait` / adresse par défaut | ✔ absents de tous les profils par défaut |
| Liaison au titulaire : portefeuille lié quand c'est pris en charge | ✔ liaison de clé SD-JWT vérifiée ; DeviceAuth mdoc non |

**Points « To confirm » du rulebook – non tranchés par cet exemple :** le `vct` de l'acte de naissance ; source/format de `document_number`, `issuance_date`, `expiry_date` ; source et format de `personal_administrative_number` ; mécanisme de statut exact.
