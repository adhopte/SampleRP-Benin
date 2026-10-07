# Guide 3 – QR code, dépannage et liste de contrôle production

**Langues :** [English](../en/03-qr-troubleshooting-production.md) · Français
[Aperçu](00-apercu.md) · [Guide PID](01-guide-pid-mdoc.md) · [Guide acte de naissance](02-guide-acte-de-naissance.md) · **QR, dépannage, production**

---

## 1. Pourquoi le QR code nécessitait un zoom, et ce qui a changé

**Symptôme (tests internes) :** sur Samsung Galaxy A17 et A25, le QR code n'était lisible qu'après avoir zoomé la page à 150 %.

**Causes dans la preuve de concept** (mesurées sur le code `dummy-rp` d'origine) :

| | PoC d'origine | Cet exemple |
|---|---|---|
| Ce que le QR encode | la requête d'autorisation **complète**, avec la `presentation_definition` (par valeur) | un **`request_uri`** court que le portefeuille récupère (par référence) |
| Caractères dans le QR | **1 141** | **≈ 170** |
| Version QR / modules par côté | **27 / 125** | **8–9 / 49–53** |
| Zone de silence (bordure blanche) | **1 module** (la norme impose **4**) | **4 modules** |
| Rendu de l'image | PNG de 320 px réduit à 260 px (ré-échantillonné → modules flous) | **SVG** (vectoriel, `image-rendering: pixelated`), sans ré-échantillonnage |
| Taille affichée | 260 px | jusqu'à **360 px** (`min(88vw, 360px)`) + « Agrandir » plein écran |
| Taille d'un module à l'écran (téléphone de 360 px de large, zoom 100 %) | **≈ 1,9 px** | **≈ 5,2–5,5 px** (environ 2,7× plus grand) |

La caméra d'un téléphone de milieu de gamme doit résoudre chaque module avec plusieurs pixels, à une distance de tenue confortable. À environ 2 px par module et avec une zone de silence d'un seul module, elle n'y parvient souvent pas – zoomer la page à 150 % ne fait qu'agrandir les modules. Rendre la **charge utile courte** (le vrai correctif), ajouter la **zone de silence réglementaire** et afficher des modules **nets et plus grands** supprime le besoin de zoomer.

Les chiffres de votre propre profil sont retournés par `POST /api/session` dans `qr` (`payloadLength`, `version`, `modules`), et un test (`npm test`) échoue si le QR devient plus dense que la version 9.

**Vérification effectuée :** la page a été rendue dans une fenêtre de téléphone de 360 × 800 px à 100 % de zoom, et la capture d'écran a été décodée avec succès par un décodeur QR indépendant (jsQR). **Merci de confirmer aussi sur de vrais Samsung A17/A25** – le comportement d'une caméra ne peut pas être prouvé par un test sur ordinateur.

### Règles pour les développeurs front-end

1. Gardez `QR_MODE=reference` (défaut). N'utilisez `value` que pour les portefeuilles qui ne savent pas récupérer `request_uri`.
2. Affichez le SVG à **≥ 280 px CSS** ; ne le réduisez pas dans les mises en page étroites.
3. Ne rognez pas le SVG, n'ajoutez pas de masque arrondi, ne superposez pas de logo, n'inversez pas les couleurs en mode sombre, n'utilisez pas de filtres/opacité CSS.
4. Proposez toujours : **Agrandir** (plein écran blanc) et **« Ouvrir dans l'application portefeuille »** pour l'usage sur le même appareil.
5. Si vous ajoutez des éléments demandés, surveillez `qr.version` : en mode référence, elle ne croît pas avec la requête.
6. Si vous devez signer les requêtes avec un certificat x509, `client_id` s'allonge (`x509_san_dns:<hôte>`) : gardez un nom d'hôte court.

---

## 2. Dépannage

| Symptôme | Cause probable | Que faire |
|---|---|---|
| Le portefeuille n'ouvre pas la requête / « requête invalide » juste après le scan | `BASE_URL` incorrect (encore `localhost`, ou `http://`) | Définissez l'URL HTTPS publique, redémarrez, ouvrez la page via cette URL. Vérifiez `/health`. |
| Le portefeuille dit ne pas pouvoir récupérer la requête | Serveur injoignable depuis le téléphone (pare-feu, hébergeur gratuit en veille, tunnel fermé) | Ouvrez `<BASE_URL>/health` dans le navigateur du téléphone. Réveillez l'hébergeur. |
| Le portefeuille rejette la requête (erreur de client/identité) | Il exige des requêtes **signées** / un `client_id` enregistré | Utilisez une requête signée (§4.1) avec un certificat de confiance pour le portefeuille ; essayez `CLIENT_ID_SCHEME=redirect_uri`. |
| Le portefeuille ne comprend pas la requête | Langage de requête différent | Basculez `QUERY_LANGUAGE` entre `pex` et `dcql`. |
| Le portefeuille ne gère pas `request_uri` | Ancien portefeuille | `QR_MODE=value` (QR plus dense ; il faudra un affichage plus grand). |
| « Aucun justificatif correspondant » dans le portefeuille | doctype/namespace différents | Alignez `src/profiles.js` avec l'émetteur (voir les guides). |
| Le portefeuille exige une réponse chiffrée | Il ne gère que `direct_post.jwt` | Non implémenté dans cet exemple (voir aperçu §7). |
| `400 unknown or expired state` dans le journal serveur | Session de plus de 10 min, serveur redémarré (stockage en mémoire), ou deux instances | Réessayez ; utilisez un stockage partagé en production. |
| `400 response already received` | Même `state` posté deux fois | Protection contre le rejeu, normal. Démarrez une nouvelle session. |
| `digests: failed` | Une valeur a été modifiée après l'émission (mdoc : ou le portefeuille a ré-encodé les éléments ; SD-JWT : une divulgation n'est pas couverte par le `_sd` signé) | Altération réelle, ou bug du portefeuille : signalez-le à l'éditeur avec le JSON de la vue de débogage. |
| `vct: failed` | Le portefeuille a présenté un justificatif dont le `vct` diffère du profil (le `vct` de l'acte de naissance n'est **pas défini par le rulebook**) | Définissez `BIRTH_CERT_VCT` avec la valeur de l'émetteur. |
| `key_binding: failed – invalid: aud` / `nonce` | Le portefeuille a signé une audience/un nonce différent du `client_id` / `nonce` de la requête (ou la présentation a été rejouée) | Comparez l'`aud` du KB-JWT avec le `client_id` de l'objet de requête ; avec des requêtes signées l'audience est `x509_san_dns:<hôte>`. |
| `issuer_signature: skipped` (SD-JWT) | Pas de `x5c` dans le JWT et l'émetteur n'est pas dans `TRUSTED_ISSUER_URLS` | Ajoutez l'URL de l'émetteur (son `.well-known/jwt-vc-issuer` sera utilisé) ou demandez-lui d'inclure `x5c`. |
| `issuer_signature: failed` / `x5chain … invalid certificate` | Algorithme non géré ou chaîne de certificats mal formée | Inspectez `issuerAuth` ; l'exemple gère ES256/384/512. |
| `issuer_trust: failed` | Émetteur absent de `TRUSTED_ISSUER_CERTS_DIR` | Ajoutez le bon certificat racine (IACA). |
| `validity: failed` | Justificatif expiré / pas encore valide, ou **horloge du serveur fausse** | Vérifiez `date` sur le serveur (NTP). |
| Fonctionne en local, pas sur le téléphone | `localhost`/adresse LAN utilisée comme `BASE_URL` | Utilisez un tunnel ou une URL déployée. |

Diagnostics utiles : journal du serveur, *Détails techniques (JSON)* sur la page de résultat, `npm run mock-wallet` pour prouver que le côté serveur fonctionne indépendamment de tout portefeuille.

---

## 3. Langues (anglais / français)

- L'interface de démo suit la langue du navigateur (français si le navigateur est en français, sinon anglais), mémorise le choix, et propose un sélecteur **EN | FR**. Les textes sont dans `public/i18n.js` ; les libellés d'éléments dans `src/profiles.js`.
- Pour ajouter un texte, ajoutez la clé dans **les deux** objets `en` et `fr`. Pour ajouter une langue, ajoutez un objet (ex. `fon`) et un bouton dans `public/index.html`.
- La langue de l'écran de consentement du portefeuille est contrôlée par le portefeuille, pas par la RP.

---

## 4. Liste de contrôle production

L'exemple est volontairement simple. Avant de l'utiliser avec les données de vrais citoyens, traitez au minimum :

### 4.1 Requêtes signées et identité de confiance de la RP
- Les portefeuilles réels des écosystèmes régulés exigent normalement que la RP soit **enregistrée** et signe sa requête avec un **certificat d'accès** (`client_id` `x509_san_dns:<hôte>` ou `x509_hash:…`). Définissez `RP_SIGNING_KEY_FILE` / `RP_SIGNING_CERT_FILE` ; l'exemple sert alors un JWT ES256 avec l'en-tête `x5c`. `npm run gen-cert` crée seulement un certificat **auto-signé de test**.
- Protégez la clé privée (gestionnaire de secrets, pas git – `keys/` est ignoré par git).

### 4.2 Vérification
- Configurez des **ancres de confiance** (`TRUSTED_ISSUER_CERTS_DIR`, et `TRUSTED_ISSUER_URLS` pour les émetteurs SD-JWT publiant des métadonnées JWKS) et définissez `ALLOW_UNTRUSTED_ISSUER=false`.
- **Liaison au titulaire pour le mdoc :** vérifiez `DeviceAuth` sur le `SessionTranscript` défini par la version d'OpenID4VP de votre portefeuille (il intègre votre `client_id`, `response_uri`, `nonce`). Sans cela, une présentation de PID copiée pourrait être rejouée par quelqu'un d'autre. (SD-JWT : le KB-JWT *est* vérifié par l'exemple.)
- Implémentez la vérification de **révocation / statut** publiée par l'émetteur.
- Envisagez les **réponses chiffrées** (`direct_post.jwt`) – exigées par certains profils de portefeuille.
- Pour les flux sur le même appareil, utilisez le modèle `response_code` / redirection d'OpenID4VP afin qu'un lien de session volé ne puisse pas être complété par un autre navigateur.

### 4.3 Application
- Remplacez le stockage de sessions en mémoire (Redis/BD), autorisez plusieurs instances, gardez le TTL de 10 minutes.
- Ajoutez limitation de débit et protection anti-bot sur `POST /api/session` ; l'exemple plafonne les sessions actives à 1 000.
- HTTPS partout (HSTS), conservez les en-têtes de sécurité/CSP de `server.js`, n'ajoutez CORS que pour vos propres origines.
- **Ne journalisez pas de données personnelles** (données, `vp_token`) ; journalisez les identifiants de session et les résultats des contrôles.
- Définissez la conservation des données et la base légale de chaque élément demandé ; affichez une notice de confidentialité.
- Tenez les dépendances à jour (`npm audit`), utilisez une version Node LTS.

### 4.4 Licence
Le dépôt contient le fichier de licence GNU GPL v3. Si des clients intègrent du code des exemples dans un logiciel propriétaire, convenez des conditions de licence avec votre équipe juridique au préalable.
