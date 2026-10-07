# Guide 1 – Demander un PID (mdoc) à un portefeuille, pas à pas

**Langues :** [English](../en/01-pid-mdoc-guide.md) · Français
[Aperçu](00-apercu.md) · **Guide PID** · [Guide acte de naissance](02-guide-acte-de-naissance.md) · [QR, dépannage, production](03-qr-depannage-production.md)

**Objectif :** ajouter à votre site un bouton « Vérifier avec mon portefeuille » qui demande au citoyen son **nom, prénom(s) et date de naissance** issus de son identité numérique nationale (PID, **mdoc** ISO 18013-5), et reçoit sur votre serveur une réponse **vérifiée**.

Durée : ~30 minutes avec le portefeuille simulé, puis un test avec un vrai portefeuille.

| Vous utiliserez | Valeur pour le PID |
|---|---|
| Format | `mso_mdoc` |
| `doctype` | `eu.europa.ec.eudi.pid.1` |
| Namespace | `eu.europa.ec.eudi.pid.1` |
| Éléments demandés | `family_name`, `given_name`, `birth_date` |
| Flux | OpenID4VP, `response_mode=direct_post` |

---

## Étape 0 – Prérequis

- [ ] Node.js 18+ et l'exemple lancé : suivez le [démarrage rapide](00-apercu.md#2-démarrage-rapide-5-minutes-sans-portefeuille).
- [ ] Une URL HTTPS publique pour le backend ([§3 de l'aperçu](00-apercu.md#3-le-rendre-accessible-à-un-vrai-portefeuille)).
- [ ] Le portefeuille de test, et le **doctype / namespace / noms d'éléments** utilisés par votre émetteur pour le PID. Les valeurs ci-dessus sont celles par défaut du PID européen ; si votre émetteur diffère, définissez `PID_DOCTYPE` / `PID_NAMESPACE` dans `.env`.

---

## Étape 1 – Décider ce qu'on demande (minimisation des données)

Ouvrez `src/profiles.js`. Le profil PID est le seul endroit qui décrit le justificatif :

```js
pid: {
  id: 'pid',
  doctype: 'eu.europa.ec.eudi.pid.1',
  namespace: 'eu.europa.ec.eudi.pid.1',
  format: 'mso_mdoc',
  requested: ['family_name', 'given_name', 'birth_date'],   // ← ne demandez QUE le nécessaire
  labels: { ... }  // noms EN/FR affichés sur l'écran de résultat
}
```

Demandez le **minimum** nécessaire à votre service. Pour un contrôle « majeur », préférez un élément oui/non comme `age_over_18` (si votre émetteur le fournit) plutôt que la date de naissance. Chaque élément ajouté apparaît sur l'écran de consentement du citoyen. Les éléments sont envoyés avec `intent_to_retain: false` ; mettez `true` uniquement si vous conservez réellement la valeur, et expliquez pourquoi au citoyen.

---

## Étape 2 – Créer une session au clic de l'utilisateur

**Navigateur → votre backend :** `POST /api/session {"profile":"pid"}` (`server.js`, route `/api/session`).

Le backend :

1. génère un **`state`** aléatoire (identifie la session dans la réponse du portefeuille) et un **`nonce`** (fraîcheur),
2. construit les paramètres de requête (`src/request.js → buildRequestParams`),
3. construit le lien `openid4vp://` et le QR code,
4. conserve la session en mémoire 10 minutes.

Réponse réelle (abrégée) :

```json
{
  "sessionId": "67ec479a-0af9-4121-b887-975fd3f3479e",
  "profile": "pid",
  "authorizationRequestUri": "openid4vp://?client_id=sample-rp-benin&request_uri=https%3A%2F%2Frp.example.org%2Fapi%2Frequest%2F67ec479a-…&request_uri_method=get",
  "qrUrl": "/api/session/67ec479a-…/qr.svg",
  "qr": { "mode": "reference", "payloadLength": 158, "version": 8, "modules": 49 },
  "expiresInSeconds": 600
}
```

> Dans votre application, appelez ceci depuis votre session **côté serveur** (par ex. liez `sessionId` à la tentative de connexion de l'utilisateur) afin de rattacher ensuite le résultat vérifié au bon utilisateur.

---

## Étape 3 – Comprendre la requête reçue par le portefeuille

Le lien du QR code ne contient que `client_id` et un `request_uri`. Le portefeuille fait `GET request_uri` et reçoit un JWT (`application/oauth-authz-req+jwt`) dont le contenu est :

```json
{
  "client_id": "sample-rp-benin",
  "response_type": "vp_token",
  "response_mode": "direct_post",
  "response_uri": "https://rp.example.org/api/response",
  "nonce": "ee623e202191b80e280d05f5fd685438",
  "state": "1948b59de6302ee76fa3832cc5a6864f",
  "presentation_definition": {
    "id": "pid-67ec479a-…",
    "input_descriptors": [{
      "id": "eu.europa.ec.eudi.pid.1",
      "format": { "mso_mdoc": { "alg": ["ES256"] } },
      "constraints": {
        "limit_disclosure": "required",
        "fields": [
          { "path": ["$['eu.europa.ec.eudi.pid.1']['family_name']"], "intent_to_retain": false },
          { "path": ["$['eu.europa.ec.eudi.pid.1']['given_name']"],  "intent_to_retain": false },
          { "path": ["$['eu.europa.ec.eudi.pid.1']['birth_date']"],  "intent_to_retain": false }
        ]
      }
    }]
  }
}
```

| Paramètre | Signification |
|---|---|
| `client_id` | Qui demande. Avec une requête signée : `x509_san_dns:<votre hôte>` ; voir [requêtes signées](03-qr-depannage-production.md#41-requêtes-signées-et-identité-de-confiance-de-la-rp). |
| `response_mode=direct_post` | Le portefeuille POSTe la réponse vers `response_uri` (il ne redirige pas le navigateur avec les données). |
| `response_uri` | Votre point d'accès `/api/response`. Doit être HTTPS et public. |
| `nonce`, `state` | Valeurs aléatoires par session. |
| `presentation_definition` | *Ce que* vous voulez. Pour un mdoc, l'`id` du descripteur est le `doctype`, et chaque `path` est `$['<namespace>']['<élément>']`. |
| `limit_disclosure: required` | Le portefeuille ne doit divulguer **que** les éléments listés. |

**Si votre portefeuille parle OpenID4VP 1.0**, définissez `QUERY_LANGUAGE=dcql`. Le même profil s'exprime alors ainsi :

```json
"dcql_query": { "credentials": [{
  "id": "pid", "format": "mso_mdoc",
  "meta": { "doctype_value": "eu.europa.ec.eudi.pid.1" },
  "claims": [ { "path": ["eu.europa.ec.eudi.pid.1", "family_name"], "intent_to_retain": false }, … ]
}]}
```

---

## Étape 4 – Afficher le QR code (et un lien « même appareil »)

Front-end minimal (`public/app.js`), ou utilisez le widget prêt à l'emploi dans `samples/embed/` :

```html
<img id="qr" alt="QR code">
<a id="open">Ouvrir dans l'application portefeuille</a>
<script>
  fetch('/api/session', { method: 'POST', headers: {'content-type':'application/json'},
                          body: JSON.stringify({ profile: 'pid' }) })
    .then(r => r.json()).then(s => {
      document.getElementById('qr').src = s.qrUrl;               // SVG fourni par le backend
      document.getElementById('open').href = s.authorizationRequestUri; // sur téléphone : pas besoin de scanner
      poll(s.sessionId);
    });
</script>
```

Règles qui gardent le QR lisible sur les téléphones d'entrée/milieu de gamme (Samsung série A, etc.) – **ne les cassez pas en restylant** :

- Affichez le SVG **tel quel**, d'au moins **280 px CSS** de large (l'exemple utilise `min(88vw, 360px)`).
- **Conservez la zone de silence blanche** (elle est dans le SVG – ne la rognez pas, ne l'arrondissez pas, ne la réduisez pas) et une palette noir pur sur blanc. Pas de logo superposé, pas d'inversion en mode sombre.
- Ne le floutez pas / ne le redimensionnez pas avec des filtres CSS. Proposez un bouton **Agrandir** (l'exemple en a un).
- Fournissez toujours le **lien « même appareil »** – un citoyen sur son téléphone doit toucher, pas scanner.

Détails et mesures : [guide 3](03-qr-depannage-production.md#1-pourquoi-le-qr-code-nécessitait-un-zoom-et-ce-qui-a-changé).

---

## Étape 5 – Recevoir la réponse du portefeuille (`response_uri`)

Le portefeuille envoie `POST /api/response` (`application/x-www-form-urlencoded`) :

| Champ | Contenu |
|---|---|
| `vp_token` | La **DeviceResponse** mdoc, CBOR encodé en base64url (DCQL : un objet JSON `{ "<id de requête>": ["<DeviceResponse>"] }` – l'exemple gère les deux). |
| `state` | Votre `state` – sert à retrouver la session. Inconnu/expiré → `400`. |
| `presentation_submission` | PEX uniquement : relie le descripteur au jeton. |

L'exemple répond `200 {}` en cas de succès et `400 {"error":"invalid_request", …}` sinon. Une seconde réponse pour la même session est refusée (protection contre le rejeu).

---

## Étape 6 – Vérifier le mdoc (ne jamais l'omettre)

`src/mdoc.js → verifyDeviceResponse` décode et **vérifie** :

| Contrôle | Ce qu'il prouve | Échoue quand |
|---|---|---|
| `doctype` | Le document est un PID et correspond au MSO | mauvais type de justificatif présenté |
| `digests` | Chaque élément divulgué a l'empreinte signée par l'émetteur (`valueDigests` du MSO) | une valeur a été modifiée (test d'altération : `--tamper`) |
| `issuer_signature` | Le MSO (COSE_Sign1) est signé par la clé du certificat `x5chain` | signature invalide |
| `issuer_trust` | Ce certificat remonte à **un émetteur de confiance** (IACA dans `TRUSTED_ISSUER_CERTS_DIR`) | émetteur inconnu. *Non effectué* si aucune ancre n'est configurée |
| `validity` | `validFrom ≤ maintenant ≤ validUntil` | expiré / pas encore valide |
| `requested_elements` | Tous les éléments demandés ont été renvoyés | le portefeuille en a retenu un |
| `device_auth` | *Non effectué par l'exemple* – liaison au titulaire | – |

> **Un justificatif ne vaut que par `issuer_trust`.** Sans ancres de confiance configurées, l'exemple indique que la signature est valide mais **ne peut pas savoir qui a signé** ; n'importe qui pourrait présenter un mdoc fabriqué. Obtenez le(s) certificat(s) racine de l'émetteur et définissez `TRUSTED_ISSUER_CERTS_DIR` + `ALLOW_UNTRUSTED_ISSUER=false` avant de faire confiance aux résultats.

Anatomie de ce qui est vérifié (la « DeviceResponse ») :

```
DeviceResponse
└─ documents[0]
   ├─ docType: "eu.europa.ec.eudi.pid.1"
   ├─ issuerSigned
   │   ├─ nameSpaces["eu.europa.ec.eudi.pid.1"] = [ #6.24(bstr IssuerSignedItem), … ]
   │   │      IssuerSignedItem = { digestID, random, elementIdentifier, elementValue }
   │   └─ issuerAuth = COSE_Sign1[ protected{alg}, {33: x5chain}, #6.24(bstr MSO), signature ]
   │          MSO = { digestAlgorithm, valueDigests, deviceKeyInfo, docType, validityInfo }
   └─ deviceSigned  (preuve de possession du titulaire – non vérifiée par l'exemple)
```

---

## Étape 7 – Lire le résultat et l'utiliser côté serveur

La page interroge `GET /api/session/:id`. Un résultat vérifié ressemble à :

```json
{
  "status": "verified",
  "profile": "pid",
  "results": [{
    "docType": "eu.europa.ec.eudi.pid.1",
    "claims": { "eu.europa.ec.eudi.pid.1": {
      "family_name": "TEST-DOSSOU", "given_name": "Test Adjovi", "birth_date": "1990-05-12" } },
    "checks": [
      { "id": "doctype", "status": "passed" },
      { "id": "digests", "status": "passed" },
      { "id": "issuer_signature", "status": "passed", "detail": "ES256" },
      { "id": "issuer_trust", "status": "skipped", "detail": "no trust anchors configured" },
      { "id": "validity", "status": "passed" },
      { "id": "requested_elements", "status": "passed" },
      { "id": "device_auth", "status": "skipped" }
    ]
  }]
}
```

`status` vaut `rejected` si un contrôle a `failed` (ou, avec `ALLOW_UNTRUSTED_ISSUER=false`, si la confiance n'est pas établie) ; `error` en donne alors la raison.

**Intégration à votre application** – dans `app.post('/api/response', …)`, juste là où `session.status = 'verified'` est positionné, appelez votre propre code : retrouvez la connexion/demande en attente liée à `session.id`, ne conservez que ce que vous avez le droit de conserver, et ouvrez la session de l'utilisateur **côté serveur**. L'interrogation par le navigateur sert uniquement à l'affichage.

---

## Étape 8 – Tester

1. **Tests unitaires/flux :** `npm test`.
2. **Portefeuille simulé** (sans téléphone) : `npm run mock-wallet -- --profile pid` ; ajoutez `--tamper` pour confirmer qu'une valeur modifiée est **rejetée** (`digests: failed`).
3. **Vrai portefeuille :** déployez/tunnel avec un `BASE_URL` public, ouvrez la page *via cette URL*, scannez le QR avec le portefeuille. Si le portefeuille affiche une erreur avant l'écran de consentement, consultez le [tableau de dépannage](03-qr-depannage-production.md#2-dépannage).
4. **Vérifier ce que votre émetteur envoie réellement :** si `doctype` ou `requested_elements` échouent, ouvrez *Détails techniques (JSON)* – il montre le `docType` et les noms d'éléments renvoyés par le portefeuille. Alignez `src/profiles.js` (ou les variables `PID_*`).

---

## Étape 9 – Intégrer dans votre propre site

Copiez `samples/embed/sample-rp-widget.js` dans votre site :

```html
<div id="wallet-verify"></div>
<script src="sample-rp-widget.js"></script>
<script>
  SampleRpBenin.mount(document.getElementById('wallet-verify'), {
    apiBase: 'https://votre-backend-rp.example.org',
    profile: 'pid',
    lang: 'fr',
    onResult: (session) => console.log(session.status)
  });
</script>
```

Si la page et le backend ont des origines différentes, activez CORS pour l'origine de votre site sur `POST /api/session` et `GET /api/session/:id`, et ajoutez votre site à la CSP. Un exemple exécutable est servi sur `/samples/embed/index.html?profile=pid&lang=fr`.

---

## Liste de contrôle du développeur

- [ ] `BASE_URL` est l'URL HTTPS publique ; `/health` répond.
- [ ] Seuls les éléments nécessaires sont demandés.
- [ ] Le QR est affiché à ≥ 280 px, noir sur blanc, avec le lien « même appareil ».
- [ ] `state` est validé, une réponse n'est acceptée qu'une fois, les sessions expirent.
- [ ] Ancres de confiance configurées ; `ALLOW_UNTRUSTED_ISSUER=false` hors démonstration.
- [ ] Les décisions sont prises côté serveur, pas à partir de données du navigateur.
- [ ] Les données personnelles ne sont pas journalisées ; la conservation est définie.
