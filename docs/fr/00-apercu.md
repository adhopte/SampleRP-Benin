# Sample RP Benin – Aperçu et démarrage rapide

**Langues :** [English](../en/00-overview.md) · Français
**Guides :** [PID (mdoc)](01-guide-pid-mdoc.md) · [Acte de naissance (mdoc)](02-guide-acte-de-naissance.md) · [QR code, dépannage, production](03-qr-depannage-production.md)

Ce projet est une petite **partie utilisatrice (vérificateur, « relying party »)** fonctionnelle. Elle demande un justificatif au portefeuille d'identité numérique d'un citoyen via **OpenID for Verifiable Presentations (OpenID4VP)**, en **présentation à distance** (appareil différent ou même appareil), et le reçoit sous forme de **mdoc ISO 18013-5**.

Il permet aux développeurs d'un site de partie utilisatrice de **lire, exécuter, copier et adapter** une implémentation réelle. Deux profils prêts à l'emploi sont fournis :

| Profil | `doctype` | Guide |
|---|---|---|
| Données d'identification de la personne (PID) | `eu.europa.ec.eudi.pid.1` | [Guide PID](01-guide-pid-mdoc.md) |
| Attestation d'acte de naissance | `bj.gouv.birth_certificate.1` (**valeur provisoire**, voir le guide) | [Guide acte de naissance](02-guide-acte-de-naissance.md) |

> **Statut.** Il s'agit d'un exemple pour développeurs, pas d'un vérificateur certifié. Il vérifie l'intégrité des données (empreintes), la signature de l'émetteur et la période de validité, et peut valider la chaîne de l'émetteur par rapport aux ancres de confiance que vous configurez. Il ne vérifie **pas** la liaison au titulaire (DeviceAuth). Voir la [liste de contrôle production](03-qr-depannage-production.md#4-liste-de-contrôle-production).

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
    W->>RP: POST response_uri (vp_token = DeviceResponse mdoc, state)
    Note over RP: vérifie le mdoc : empreintes, signature, validité, doctype, éléments demandés
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
npm run mock-wallet -- --profile birth_certificate --tamper    # montre un justificatif rejeté
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
| `QUERY_LANGUAGE` | `pex` | `pex` : `presentation_definition` Presentation Exchange (brouillons OpenID4VP ≤ 21). `dcql` : `dcql_query` (OpenID4VP 1.0). Choisissez ce que gère votre portefeuille. |
| `CLIENT_ID` | `sample-rp-benin` | `client_id` envoyé quand la requête n'est pas signée. |
| `CLIENT_ID_SCHEME` | *(vide)* | `client_id_scheme` des brouillons, ex. `redirect_uri` (alors `client_id` = `response_uri`). |
| `PID_DOCTYPE`, `PID_NAMESPACE` | `eu.europa.ec.eudi.pid.1` | Identifiants du PID. |
| `BIRTH_CERT_DOCTYPE`, `BIRTH_CERT_NAMESPACE` | `bj.gouv.birth_certificate.1` | **Valeur provisoire** – utilisez les vrais identifiants de l'émetteur. |
| `RP_SIGNING_KEY_FILE`, `RP_SIGNING_CERT_FILE` | *(vide)* | Signe l'objet de requête ; `client_id` devient `x509_san_dns:<hôte>`. `npm run gen-cert` crée une paire de **test**. |
| `TRUSTED_ISSUER_CERTS_DIR` | *(vide)* | Dossier de certificats racine PEM (IACA) de confiance pour les émetteurs. |
| `ALLOW_UNTRUSTED_ISSUER` | `true` | `false` rejette les justificatifs dont la chaîne émetteur n'est pas validée par les ancres de confiance. |

---

## 5. API HTTP de l'exemple

| Méthode et chemin | Appelé par | Rôle |
|---|---|---|
| `POST /api/session` `{ "profile": "pid" \| "birth_certificate" }` | votre page web | Crée une session. Retourne `sessionId`, `authorizationRequestUri` (`openid4vp://…`), `qrUrl`, métriques `qr`. |
| `GET /api/session/:id/qr.svg` | votre page web | Le QR code en SVG (avec zone de silence de 4 modules). |
| `GET` ou `POST /api/request/:id` | **portefeuille** | Retourne l'objet de requête (`application/oauth-authz-req+jwt`). |
| `POST /api/response` (form-encoded) | **portefeuille** | `response_uri`. Champs : `vp_token`, `state`, `presentation_submission` (PEX uniquement). |
| `GET /api/session/:id` | votre page web | `status` (`pending`/`verified`/`rejected`), données, libellés (EN/FR), contrôles, erreur. |
| `GET /health` | supervision | Disponibilité + configuration active. |

Les sessions durent 10 minutes, en mémoire.

---

## 6. Plan du projet

```
server.js                 Points d'accès HTTP (session, request_uri, response_uri, statut)
src/config.js             configuration par variables d'environnement
src/profiles.js           ★ les profils de justificatifs : doctype, namespace, éléments demandés, libellés EN/FR
src/query.js              construit presentation_definition (PEX) ou dcql_query
src/request.js            paramètres de requête, lien openid4vp://, objet de requête (signé ou non), QR SVG
src/mdoc.js               décodage et vérification de la DeviceResponse mdoc
public/                   interface de démo (bilingue) : index.html, app.js, i18n.js, style.css
samples/embed/            widget à intégrer dans n'importe quel site + page d'exemple
samples/curl-walkthrough.sh   le protocole avec curl
tools/mock-wallet.js      jouer le portefeuille sans téléphone
tools/mdoc-builder.js     construit des mdoc synthétiques signés (tests et portefeuille simulé)
tools/gen-rp-cert.js      certificat de test pour requêtes signées
test/                     tests automatiques (npm test)
docs/en, docs/fr          cette documentation
```

★ = le premier fichier que vous modifierez.

---

## 7. Ce qui n'est volontairement pas couvert

- **Réponses chiffrées** (`response_mode=direct_post.jwt`, JWE). Certains portefeuilles/profils les exigent ; cet exemple utilise `direct_post` en clair.
- **Liaison au titulaire** (`DeviceAuth` sur le `SessionTranscript`) – le transcript exact dépend de la version d'OpenID4VP de votre portefeuille.
- **Justificatifs SD-JWT VC** – la preuve de concept d'origine les décodait structurellement ; cet exemple se concentre sur le mdoc.
- **Révocation / listes de statut**.
- Stockage de sessions persistant, limitation de débit, politique de journalisation – voir la [liste de contrôle production](03-qr-depannage-production.md#4-liste-de-contrôle-production).
