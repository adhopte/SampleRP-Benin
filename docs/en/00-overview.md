# Sample RP Benin – Overview and quick start

**Languages:** English · [Français](../fr/00-apercu.md)
**Guides:** [PID (mdoc)](01-pid-mdoc-guide.md) · [Birth certificate (mdoc)](02-birth-certificate-guide.md) · [QR code, troubleshooting, production](03-qr-troubleshooting-production.md)

This project is a small, working **relying party (verifier)** that asks a citizen's digital identity wallet for a credential using **OpenID for Verifiable Presentations (OpenID4VP)** in the **remote (cross-device / same-device) presentation** flow, and receives it as an **ISO 18013-5 mdoc**.

It exists so that developers of a relying-party website can **read, run, copy and adapt** a real implementation. Two ready-made profiles are included:

| Profile | `doctype` | Guide |
|---|---|---|
| Person identification data (PID) | `eu.europa.ec.eudi.pid.1` | [PID guide](01-pid-mdoc-guide.md) |
| Birth certificate attestation | `bj.gouv.birth_certificate.1` (**placeholder**, see the guide) | [Birth certificate guide](02-birth-certificate-guide.md) |

> **Status.** This is a developer sample, not a certified verifier. It verifies data integrity (digests), the issuer signature and the validity period, and can validate the issuer chain against trust anchors you configure. It does **not** verify holder binding (DeviceAuth). See [production checklist](03-qr-troubleshooting-production.md#4-production-checklist).

---

## 1. How the remote presentation flow works

```mermaid
sequenceDiagram
    autonumber
    participant B as Citizen's browser<br/>(your website)
    participant RP as Your RP backend<br/>(this sample)
    participant W as Wallet app

    B->>RP: POST /api/session {profile}
    Note over RP: creates session + random state & nonce
    RP-->>B: openid4vp:// link + QR code (SVG)
    B->>W: scan QR (other device) or tap link (same device)
    W->>RP: GET request_uri
    RP-->>W: request object (JWT): what I want to see, response_uri, nonce, state
    W->>W: shows consent screen; citizen approves
    W->>RP: POST response_uri (vp_token = mdoc DeviceResponse, state)
    Note over RP: verify mdoc: digests, issuer signature, validity, doctype, requested elements
    RP-->>W: 200 {} (or 400 + error)
    B->>RP: GET /api/session/:id (polling every 1.5 s)
    RP-->>B: status verified | rejected + claims + checks
```

Key points a developer must understand:

1. **The wallet calls your server.** `response_uri` must be reachable on the public internet over HTTPS. `localhost` only works with a tunnel (see §3).
2. **The browser never sees the credential directly.** The wallet posts to your backend; the browser only polls for the outcome. Take business decisions on the **server**.
3. **`state` and `nonce` are single-use secrets** generated per session. `state` ties the wallet's response to the right browser session; `nonce` is meant to be bound into the holder's signature (see "Going further").
4. **The QR code only carries a short link** (`request_uri`) – the full request is fetched by the wallet. This is what makes the QR small and easy to scan. Details in [guide 3](03-qr-troubleshooting-production.md#1-why-the-qr-code-needed-zoom-and-what-changed).

---

## 2. Quick start (5 minutes, no wallet needed)

Requirements: Node.js 18+ (22 recommended). `openssl` is only needed for the mock wallet, the tests and `npm run gen-cert`.

```bash
npm install
cp .env.example .env
npm start                      # http://localhost:3000
```

Open <http://localhost:3000>, choose **Identity (PID)** or **Birth certificate**, then – in a second terminal – play the wallet:

```bash
# Copy the link from the "Raw authorization request" section of the page, then:
npm run mock-wallet -- "openid4vp://?client_id=..."

# or let the tool create a session itself and present to it:
npm run mock-wallet -- --profile pid
npm run mock-wallet -- --profile birth_certificate --tamper    # shows a rejected credential
```

The page switches to **Credential accepted** and lists the data and every check. Run the automated tests with `npm test`.

To see every HTTP call of the protocol: `./samples/curl-walkthrough.sh pid`.

---

## 3. Make it reachable by a real wallet

A wallet app must reach `https://<your-host>/api/request/...` and `https://<your-host>/api/response`.

| Option | When | How |
|---|---|---|
| Tunnel | Same-day demo on your laptop | `ngrok http 3000` (or `cloudflared tunnel --url http://localhost:3000`), put the printed `https://…` URL in `.env` as `BASE_URL`, restart `npm start`, open the page **through that URL**. |
| Render | Stable shared demo | Connect the repo, use `render.yaml` (or: build `npm ci --omit=dev`, start `npm start`), set `BASE_URL=https://<service>.onrender.com`, redeploy once. |
| Any Node host | Railway, Fly.io, a VM behind nginx… | `npm ci --omit=dev && npm start`, set `BASE_URL` and `PORT`. Terminate TLS in front. |

> If `BASE_URL` is wrong, the wallet will be sent to the wrong address and fail. The startup log prints the `response_uri` that will be used.

---

## 4. Configuration (`.env`)

| Variable | Default | Meaning |
|---|---|---|
| `BASE_URL` | `http://localhost:3000` | Public HTTPS base URL of this deployment. |
| `PORT` | `3000` | Listening port. |
| `QR_MODE` | `reference` | `reference`: QR contains a short `request_uri` (recommended). `value`: QR contains the full request (long; only for legacy wallets that cannot fetch `request_uri`). |
| `QUERY_LANGUAGE` | `pex` | `pex`: Presentation Exchange `presentation_definition` (OpenID4VP drafts ≤ 21). `dcql`: `dcql_query` (OpenID4VP 1.0). Use what your wallet supports. |
| `CLIENT_ID` | `sample-rp-benin` | `client_id` sent when the request is unsigned. |
| `CLIENT_ID_SCHEME` | *(empty)* | Optional draft `client_id_scheme`, e.g. `redirect_uri` (then `client_id` = `response_uri`). |
| `PID_DOCTYPE`, `PID_NAMESPACE` | `eu.europa.ec.eudi.pid.1` | PID identifiers. |
| `BIRTH_CERT_DOCTYPE`, `BIRTH_CERT_NAMESPACE` | `bj.gouv.birth_certificate.1` | **Placeholder** – use the issuer's real identifiers. |
| `RP_SIGNING_KEY_FILE`, `RP_SIGNING_CERT_FILE` | *(empty)* | Sign the request object; `client_id` becomes `x509_san_dns:<host>`. `npm run gen-cert` creates a **test** pair. |
| `TRUSTED_ISSUER_CERTS_DIR` | *(empty)* | Directory of PEM root certificates (IACA) trusted for credential issuers. |
| `ALLOW_UNTRUSTED_ISSUER` | `true` | `false` rejects credentials whose issuer chain is not validated against the trust anchors. |

---

## 5. HTTP API of the sample

| Method & path | Called by | Purpose |
|---|---|---|
| `POST /api/session` `{ "profile": "pid" \| "birth_certificate" }` | your web page | Creates a session. Returns `sessionId`, `authorizationRequestUri` (`openid4vp://…`), `qrUrl`, `qr` metrics. |
| `GET /api/session/:id/qr.svg` | your web page | The QR code as SVG (with 4-module quiet zone). |
| `GET` or `POST /api/request/:id` | **wallet** | Returns the request object (`application/oauth-authz-req+jwt`). |
| `POST /api/response` (form-encoded) | **wallet** | `response_uri`. Fields: `vp_token`, `state`, `presentation_submission` (PEX only). |
| `GET /api/session/:id` | your web page | `status` (`pending`/`verified`/`rejected`), claims, labels (EN/FR), checks, error. |
| `GET /health` | monitoring | Liveness + active configuration. |

Sessions live 10 minutes, in memory.

---

## 6. Project map

```
server.js                 HTTP endpoints (session, request_uri, response_uri, status)
src/config.js             environment configuration
src/profiles.js           ★ the credential profiles: doctype, namespace, requested elements, EN/FR labels
src/query.js              builds presentation_definition (PEX) or dcql_query
src/request.js            request parameters, openid4vp:// link, request object (signed or not), QR SVG
src/mdoc.js               mdoc DeviceResponse decoding and verification
public/                   demo UI (bilingual): index.html, app.js, i18n.js, style.css
samples/embed/            drop-in widget for any website + example page
samples/curl-walkthrough.sh   the protocol with curl
tools/mock-wallet.js      play the wallet without a phone
tools/mdoc-builder.js     builds synthetic signed mdocs (tests and mock wallet)
tools/gen-rp-cert.js      test certificate for signed requests
test/                     automated tests (npm test)
docs/en, docs/fr          this documentation
```

★ = the file you will edit first.

---

## 7. What is deliberately not covered

- **Encrypted responses** (`response_mode=direct_post.jwt`, JWE). Some wallets/profiles require them; this sample uses plain `direct_post`.
- **Holder binding** (`DeviceAuth` against the `SessionTranscript`) – the exact transcript depends on the OpenID4VP version your wallet implements.
- **SD-JWT VC** credentials – the original proof of concept decoded them structurally; this sample focuses on mdoc.
- **Revocation / status list** checks.
- Persistent session storage, rate limiting, logging policy – see the [production checklist](03-qr-troubleshooting-production.md#4-production-checklist).
