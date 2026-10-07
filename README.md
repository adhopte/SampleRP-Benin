# Sample RP Benin

**English** · [Français](#français)

A working, shareable **sample relying party (verifier)** for the Benin digital identity wallet ecosystem. It shows relying-party developers how to add **remote credential presentation** (OpenID4VP, `direct_post`) to a website and verify what the wallet returns. It follows the **Benin PID / Birth Certificate Rulebook v1.1** (standard-namespace edition):

- 🪪 **PID as mdoc** (docType = namespace `eu.europa.ec.eudi.pid.1`) – [step-by-step guide](docs/en/01-pid-mdoc-guide.md)
- 📜 **Birth certificate attestation as SD-JWT VC** (mdoc optional) – [step-by-step guide](docs/en/02-birth-certificate-guide.md)
- 🌍 **Bilingual English / French** UI and documentation
- 📱 **Scannable QR code** on mid-range phones without zooming – [what changed and why](docs/en/03-qr-troubleshooting-production.md#1-why-the-qr-code-needed-zoom-and-what-changed)

Derived from the `EUDIWtest` dummy relying-party proof of concept; this version adds credential verification (mdoc digests / SD-JWT disclosures, issuer signature, trust chain, validity, SD-JWT key binding), a short `request_uri` QR flow, signed requests, DCQL, a mock wallet, tests, embeddable code and documentation.

## Quick start

```bash
npm install
cp .env.example .env
npm start                                   # http://localhost:3000
npm run mock-wallet -- --profile pid        # in a 2nd terminal: play the wallet (try birth_certificate too)
npm test
```

Then read the [overview](docs/en/00-overview.md) and the guide for your credential. To test with a real wallet you need a public HTTPS `BASE_URL` (ngrok/Render – see overview §3).

## Documentation

| | English | Français |
|---|---|---|
| Overview, architecture, config, API | [00-overview](docs/en/00-overview.md) | [00-apercu](docs/fr/00-apercu.md) |
| PID (mdoc) guide | [01-pid-mdoc-guide](docs/en/01-pid-mdoc-guide.md) | [01-guide-pid-mdoc](docs/fr/01-guide-pid-mdoc.md) |
| Birth certificate guide | [02-birth-certificate-guide](docs/en/02-birth-certificate-guide.md) | [02-guide-acte-de-naissance](docs/fr/02-guide-acte-de-naissance.md) |
| QR code, troubleshooting, production | [03-qr-troubleshooting-production](docs/en/03-qr-troubleshooting-production.md) | [03-qr-depannage-production](docs/fr/03-qr-depannage-production.md) |

## Code samples

| Path | What it is |
|---|---|
| `server.js`, `src/` | The relying-party backend (Node.js / Express) |
| `samples/embed/` | Drop-in JavaScript widget + example page (served at `/samples/embed/`) |
| `samples/curl-walkthrough.sh` | The whole protocol exchange with `curl` – useful for non-Node teams |
| `tools/mock-wallet.js` | Simulated wallet to test without a phone (`--tamper` shows a rejection) |

## Important notes

- ⚠️ **Developer sample, not a certified verifier.** It does not verify mdoc holder binding (DeviceAuth), revocation status, or encrypted responses; configure trusted issuers (`TRUSTED_ISSUER_CERTS_DIR`) and follow the [production checklist](docs/en/03-qr-troubleshooting-production.md#4-production-checklist).
- The rulebook does not define the **birth certificate `vct`**; the sample uses `https://credentials.benin.example/birth_certificate` (same pattern as the PID `vct`) – **confirm it with the issuer** (`BIRTH_CERT_VCT`, [guide 2](docs/en/02-birth-certificate-guide.md)).
- Test data produced by the mock wallet is fictitious.
- Licence: see [LICENSE](LICENSE) (GNU GPL v3).

---

## Français

**[English](#sample-rp-benin)** · Français

Un **exemple de partie utilisatrice (vérificateur)** fonctionnel et partageable pour l'écosystème de portefeuilles d'identité numérique du Bénin. Il montre aux développeurs de parties utilisatrices comment ajouter à un site web la **présentation de justificatifs à distance** (OpenID4VP, `direct_post`) et vérifier ce que renvoie le portefeuille. Il suit le **Rulebook PID / Acte de naissance du Bénin v1.1** (édition à espace de noms standard) :

- 🪪 **PID en mdoc** (docType = namespace `eu.europa.ec.eudi.pid.1`) – [guide pas à pas](docs/fr/01-guide-pid-mdoc.md)
- 📜 **Attestation d'acte de naissance en SD-JWT VC** (mdoc optionnel) – [guide pas à pas](docs/fr/02-guide-acte-de-naissance.md)
- 🌍 Interface et documentation **bilingues français / anglais**
- 📱 **QR code lisible** sur les téléphones de milieu de gamme sans zoom – [ce qui a changé et pourquoi](docs/fr/03-qr-depannage-production.md#1-pourquoi-le-qr-code-nécessitait-un-zoom-et-ce-qui-a-changé)

Issu de la preuve de concept `EUDIWtest` (partie utilisatrice factice) ; cette version ajoute la vérification des justificatifs (empreintes mdoc / divulgations SD-JWT, signature de l'émetteur, chaîne de confiance, validité, liaison de clé SD-JWT), un QR court basé sur `request_uri`, les requêtes signées, DCQL, un portefeuille simulé, des tests, du code intégrable et la documentation.

### Démarrage rapide

```bash
npm install
cp .env.example .env
npm start                                   # http://localhost:3000
npm run mock-wallet -- --profile pid        # dans un 2e terminal : jouer le portefeuille (essayez aussi birth_certificate)
npm test
```

Lisez ensuite l'[aperçu](docs/fr/00-apercu.md) et le guide de votre justificatif. Pour tester avec un vrai portefeuille, il faut un `BASE_URL` HTTPS public (ngrok/Render – voir aperçu §3).

### Notes importantes

- ⚠️ **Exemple pour développeurs, pas un vérificateur certifié.** Il ne vérifie pas la liaison au titulaire du mdoc (DeviceAuth), le statut de révocation ni les réponses chiffrées ; configurez les émetteurs de confiance (`TRUSTED_ISSUER_CERTS_DIR`) et suivez la [liste de contrôle production](docs/fr/03-qr-depannage-production.md#4-liste-de-contrôle-production).
- Le rulebook ne définit pas le **`vct` de l'acte de naissance** ; l'exemple utilise `https://credentials.benin.example/birth_certificate` (même modèle que le `vct` du PID) – **à confirmer avec l'émetteur** (`BIRTH_CERT_VCT`, [guide 2](docs/fr/02-guide-acte-de-naissance.md)).
- Les données de test produites par le portefeuille simulé sont fictives.
- Licence : voir [LICENSE](LICENSE) (GNU GPL v3).
