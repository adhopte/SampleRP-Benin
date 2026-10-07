# Guide 2 – Demander une attestation d'acte de naissance (mdoc), pas à pas

**Langues :** [English](../en/02-birth-certificate-guide.md) · Français
[Aperçu](00-apercu.md) · [Guide PID](01-guide-pid-mdoc.md) · **Guide acte de naissance** · [QR, dépannage, production](03-qr-depannage-production.md)

**Objectif :** permettre à un citoyen de présenter son **attestation électronique d'acte de naissance** (un **mdoc** ISO 18013-5 émis dans son portefeuille) à votre site – par exemple pour démarrer une démarche d'état civil, d'inscription scolaire ou de prestation sociale – et recevoir sur votre serveur une réponse **vérifiée**.

Le protocole est **identique à celui du PID** ([Guide 1](01-guide-pid-mdoc.md)) ; seul le *profil de justificatif* change. Ce guide liste chaque étape avec ce qui est propre à l'acte de naissance.

> ### ⚠️ Alignez les identifiants avec votre émetteur
> Le `doctype`, le namespace et les noms d'éléments de l'acte de naissance sont **définis par l'autorité émettrice**, pas par cet exemple. Les valeurs ci-dessous sont **provisoires** et permettent à l'exemple de fonctionner de bout en bout avec le portefeuille simulé :
>
> | | Valeur provisoire de cet exemple | Où la modifier |
> |---|---|---|
> | `doctype` | `bj.gouv.birth_certificate.1` | `BIRTH_CERT_DOCTYPE` dans `.env` ou `src/profiles.js` |
> | namespace | identique au doctype | `BIRTH_CERT_NAMESPACE` |
> | éléments | `family_name`, `given_name`, `birth_date`, `birth_place`, `certificate_number`, `father_name`, `mother_name` | liste `requested` dans `src/profiles.js` |
>
> Demandez à l'émetteur le **doctype, le namespace et les identifiants d'éléments** du justificatif (schéma du justificatif / métadonnées de l'émetteur). L'étape 7 montre comment les découvrir à partir d'une vraie présentation.

---

## Étape 0 – Prérequis

- [ ] L'exemple lancé ([démarrage rapide](00-apercu.md#2-démarrage-rapide-5-minutes-sans-portefeuille)) et un `BASE_URL` HTTPS public.
- [ ] Un portefeuille qui **contient une attestation d'acte de naissance** de votre émetteur (ou le portefeuille simulé pour commencer).
- [ ] Le schéma de l'émetteur (voir l'encadré) et, pour la production, son **certificat racine** (IACA).

---

## Étape 1 – Décider avec soin ce qu'on demande

Un acte de naissance contient des **données familiales sensibles** (noms des parents, lieu de naissance). Ne demandez que **ce que votre démarche exige légalement** :

| Élément (nom provisoire) | Usage typique | À demander seulement si… |
|---|---|---|
| `family_name`, `given_name`, `birth_date` | identifier la personne | toujours nécessaires pour le rapprochement |
| `birth_place` | démarches d'état civil | la démarche l'exige |
| `certificate_number` | retrouver l'acte dans votre registre | vous allez le recouper |
| `father_name`, `mother_name` | démarches de filiation | la démarche exige légalement la filiation |

Modifiez la liste dans `src/profiles.js` :

```js
birth_certificate: {
  id: 'birth_certificate',
  doctype: 'bj.gouv.birth_certificate.1',        // ← doctype de l'émetteur
  namespace: 'bj.gouv.birth_certificate.1',      // ← namespace de l'émetteur
  format: 'mso_mdoc',
  requested: ['family_name', 'given_name', 'birth_date', 'birth_place',
              'certificate_number'],             // ← retirez father_name / mother_name si inutiles
  labels: { /* libellés EN + FR de chaque élément susceptible d'être affiché */ }
}
```

Ajoutez une entrée `en`/`fr` dans `labels` pour chaque élément afin que l'écran de résultat affiche des noms lisibles (un élément sans libellé est affiché avec son identifiant). Vérifiez avec votre équipe juridique / protection des données la base légale et la durée de conservation des données demandées (cadre béninois de protection des données).

---

## Étape 2 – Créer une session

`POST /api/session {"profile":"birth_certificate"}` – même point d'accès que le PID ; seul le profil change. La réponse contient le lien `openid4vp://`, le QR (`qrUrl`) et ses métriques. Le QR reste **petit (version 8–9)** quel que soit le nombre d'éléments demandés, car il ne porte que le `request_uri` (voir [guide 3](03-qr-depannage-production.md#1-pourquoi-le-qr-code-nécessitait-un-zoom-et-ce-qui-a-changé)) ; avec `QR_MODE=value`, la seule requête d'acte de naissance exigerait ≈ 1 700 caractères.

---

## Étape 3 – La requête reçue par le portefeuille

Même structure que le PID ; seul le descripteur change :

```json
"presentation_definition": {
  "id": "birth_certificate-<id de session>",
  "input_descriptors": [{
    "id": "bj.gouv.birth_certificate.1",                       // = doctype
    "format": { "mso_mdoc": { "alg": ["ES256"] } },
    "constraints": {
      "limit_disclosure": "required",
      "fields": [
        { "path": ["$['bj.gouv.birth_certificate.1']['family_name']"],        "intent_to_retain": false },
        { "path": ["$['bj.gouv.birth_certificate.1']['certificate_number']"], "intent_to_retain": false },
        …
      ]
    }
  }]
}
```

Avec `QUERY_LANGUAGE=dcql` :

```json
"dcql_query": { "credentials": [{
  "id": "birth_certificate", "format": "mso_mdoc",
  "meta": { "doctype_value": "bj.gouv.birth_certificate.1" },
  "claims": [ { "path": ["bj.gouv.birth_certificate.1", "family_name"], "intent_to_retain": false }, … ]
}]}
```

Si le portefeuille ne trouve aucun justificatif correspondant, il indiquera au citoyen « aucun justificatif correspondant » – c'est presque toujours une **différence de doctype/namespace** (étape 7).

---

## Étape 4 – Afficher le QR code et le lien « même appareil »

Identique à l'[étape 4 du PID](01-guide-pid-mdoc.md#étape-4--afficher-le-qr-code-et-un-lien--même-appareil-). Pour démarrer le flux acte de naissance depuis votre page, appelez l'API avec l'autre profil ou utilisez le widget :

```js
SampleRpBenin.mount(document.getElementById('wallet-verify'), {
  apiBase: 'https://votre-backend-rp.example.org',
  profile: 'birth_certificate',
  lang: 'fr',
  onResult: (session) => { /* session.status === 'verified' | 'rejected' */ }
});
```

---

## Étape 5 – Recevoir la réponse

Même `POST /api/response` que pour le PID (`vp_token` + `state`). Le document contenu est la **DeviceResponse** de l'attestation, avec `docType` = le doctype de l'acte de naissance.

---

## Étape 6 – Vérifier

Mêmes contrôles que pour le PID ([tableau](01-guide-pid-mdoc.md#étape-6--vérifier-le-mdoc-ne-jamais-lomettre)) – `doctype`, `digests`, `issuer_signature`, `issuer_trust`, `validity`, `requested_elements`, `device_auth` (non effectué).

Deux points propres aux attestations :

1. **Qui est l'émetteur ?** Une attestation d'acte de naissance doit provenir de l'émetteur de **l'autorité d'état civil**, pas de *n'importe quel* émetteur. Placez le certificat racine de **cet** émetteur (et lui seul) dans `TRUSTED_ISSUER_CERTS_DIR` pour l'usage de ce profil, et définissez `ALLOW_UNTRUSTED_ISSUER=false`.
2. **Validité.** Les attestations ont souvent une validité courte ou peuvent être révoquées/remplacées. L'exemple contrôle `validUntil` ; la **vérification de révocation/liste de statut n'est pas implémentée** – demandez à l'émetteur comment le statut est publié et ajoutez-la avant de vous fier à d'anciennes attestations.

---

## Étape 7 – Lire le résultat et découvrir les vrais identifiants

```json
{
  "status": "verified",
  "profile": "birth_certificate",
  "results": [{
    "docType": "bj.gouv.birth_certificate.1",
    "claims": { "bj.gouv.birth_certificate.1": {
      "family_name": "TEST-DOSSOU", "given_name": "Test Adjovi", "birth_date": "1990-05-12",
      "birth_place": "Cotonou", "certificate_number": "TEST-0000-1990-0001",
      "father_name": "TEST Koffi Dossou", "mother_name": "TEST Afi Dossou" } },
    "checks": [ … ]
  }]
}
```

*(Données de test fictives générées par le portefeuille simulé.)*

**Découvrir les vrais identifiants de l'émetteur avec un vrai portefeuille.** Si le portefeuille répond mais qu'un contrôle échoue :

- `doctype: failed – expected X, got Y` → définissez `BIRTH_CERT_DOCTYPE=Y`.
- `requested_elements: failed – missing: …` → l'émetteur nomme les éléments autrement ; ouvrez *Détails techniques (JSON)* sur la page de démo pour voir les identifiants d'éléments renvoyés dans `claims`, puis mettez à jour `requested` et `labels`.
- Si le portefeuille n'atteint jamais votre serveur (aucun `/api/response` dans les journaux), le justificatif n'a probablement pas été reconnu → comparez le `docType` affiché dans les détails du justificatif du portefeuille avec votre profil.

**Utiliser le résultat.** Usages typiques côté serveur :

- **Recoupement avec le PID** : faites d'abord une présentation de PID, puis une d'acte de naissance dans le même parcours, et comparez `family_name`, `given_name`, `birth_date` (normalisez casse/accents) avant d'accepter le dossier. (Demander les deux dans une seule requête est possible avec une requête combinée, mais n'est pas implémenté dans cet exemple.)
- **Consultation du registre** par `certificate_number` pour confirmer que l'acte existe toujours et n'a pas changé.

---

## Étape 8 – Tester

1. `npm test` – inclut un flux complet d'acte de naissance et un flux altéré.
2. `npm run mock-wallet -- --profile birth_certificate` (ajoutez `--tamper` pour un rejet).
3. `./samples/curl-walkthrough.sh birth_certificate` – chaque appel HTTP, pas à pas.
4. Vrai portefeuille avec le justificatif de l'émetteur (l'étape 7 explique comment corriger les identifiants).

Dans la démo, choisissez **Acte de naissance** sur le premier écran, ou ouvrez l'exemple d'intégration `/samples/embed/index.html?profile=birth_certificate&lang=fr`.

---

## Liste de contrôle du développeur

- [ ] `doctype`, namespace et noms d'éléments viennent **de l'émetteur**, pas des valeurs provisoires de cet exemple.
- [ ] Seuls les éléments légalement nécessaires (surtout les noms des parents) sont demandés.
- [ ] Le certificat racine de l'émetteur d'état civil est configuré ; `ALLOW_UNTRUSTED_ISSUER=false`.
- [ ] Une stratégie de révocation/statut est définie avec l'émetteur.
- [ ] Les résultats sont traités côté serveur ; les données personnelles ne sont pas journalisées ; la conservation est définie.
- [ ] Le QR est affiché ≥ 280 px, noir sur blanc, avec le lien « même appareil ».
