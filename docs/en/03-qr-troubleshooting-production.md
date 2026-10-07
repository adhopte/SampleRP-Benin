# Guide 3 – QR code, troubleshooting and production checklist

**Languages:** English · [Français](../fr/03-qr-depannage-production.md)
[Overview](00-overview.md) · [PID guide](01-pid-mdoc-guide.md) · [Birth certificate guide](02-birth-certificate-guide.md) · **QR, troubleshooting, production**

---

## 1. Why the QR code needed zoom, and what changed

**Symptom (internal tests):** on Samsung Galaxy A17 and A25 the QR code could only be scanned after zooming the page to 150 %.

**Root causes in the proof of concept** (measured on the original `dummy-rp` code):

| | Original PoC | This sample |
|---|---|---|
| What the QR encodes | the **whole** authorization request, including the `presentation_definition` (by value) | a short **`request_uri`** the wallet fetches (by reference) |
| Characters in the QR | **1,141** | **≈ 160** |
| QR version / modules per side | **27 / 125** | **8 / 49** |
| Quiet zone (white border) | **1 module** (spec requires **4**) | **4 modules** |
| Image rendering | 320 px PNG scaled to 260 px (re-sampled → blurred modules) | **SVG** (vector, `image-rendering: pixelated`), no resampling |
| Displayed size | 260 px | up to **360 px** (`min(88vw, 360px)`) + full-screen "Enlarge" |
| Size of one module on screen (360 px-wide phone, 100 % zoom) | **≈ 1.9 px** | **≈ 5.5 px** (about 3× larger) |

A mid-range phone camera must resolve each module with several pixels while the phone is held at a comfortable distance. At about 2 px per module and a 1-module quiet zone, it often cannot – zooming the page to 150 % simply makes modules bigger. Making the **payload short** (the real fix), adding the **proper quiet zone**, and rendering **crisp, larger** modules removes the need to zoom.

Numbers for your own profile are returned by `POST /api/session` in `qr` (`payloadLength`, `version`, `modules`), and a test (`npm test`) fails if the QR becomes denser than version 9.

**Verification performed:** the page was rendered at a 360 × 800 px phone viewport at 100 % zoom and the screenshot decoded successfully by an independent QR decoder (jsQR). **Please also confirm on the real Samsung A17/A25 devices** – camera behaviour cannot be proven from a desktop test.

### Rules for front-end developers

1. Keep `QR_MODE=reference` (default). Use `value` only for wallets that cannot fetch `request_uri`.
2. Show the SVG at **≥ 280 CSS px**; do not shrink it in narrow layouts.
3. Do not crop the SVG, add a rounded mask, overlay a logo, invert colours in dark mode, or use CSS filters/opacity.
4. Always offer: **Enlarge** (full-screen white), and **"Open in wallet app"** for same-device use.
5. If you add requested elements, keep an eye on `qr.version`: in reference mode it does not grow with the query.
6. If you must sign requests with an x509 certificate, `client_id` becomes longer (`x509_san_dns:<host>`): keep the host name short.

---

## 2. Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| Wallet cannot open the request / "invalid request" immediately after scan | `BASE_URL` wrong (still `localhost`, or `http://`) | Set the public HTTPS URL, restart, open the page via that URL. Check `/health`. |
| Wallet says it cannot fetch the request | Server not reachable from the phone (firewall, sleeping free-tier host, tunnel closed) | Open `<BASE_URL>/health` in the phone's browser. Wake the host. |
| Wallet rejects the request (client/identity error) | Wallet requires **signed** requests / a registered `client_id` | Use a signed request (§4.1) with a certificate the wallet trusts; try `CLIENT_ID_SCHEME=redirect_uri`. |
| Wallet does not understand the request | Query-language mismatch | Switch `QUERY_LANGUAGE` between `pex` and `dcql`. |
| Wallet does not support `request_uri` | Legacy wallet | `QR_MODE=value` (denser QR; the page will need a larger display). |
| "No matching credential" in the wallet | doctype/namespace mismatch | Align `src/profiles.js` with the issuer (see guides). |
| Wallet requires an encrypted response | It only supports `direct_post.jwt` | Not implemented in this sample (see overview §7). |
| `400 unknown or expired state` in the server log | Session older than 10 min, server restarted (in-memory store), or two server instances | Retry; use a shared store in production. |
| `400 response already received` | Same `state` posted twice | Expected replay protection. Start a new session. |
| `digests: failed` | A value was changed after issuance (or the wallet re-encoded items) | Real tampering, or a wallet bug: report to the wallet vendor with the JSON from the debug view. |
| `issuer_signature: failed` / `x5chain … invalid certificate` | Unsupported algorithm or malformed certificate chain | Inspect `issuerAuth`; the sample supports ES256/384/512. |
| `issuer_trust: failed` | Issuer not in `TRUSTED_ISSUER_CERTS_DIR` | Add the right root certificate (IACA). |
| `validity: failed` | Credential expired / not yet valid, or **server clock wrong** | Check `date` on the server (NTP). |
| Works locally, not on the phone | `localhost`/LAN address used as `BASE_URL` | Use a tunnel or a deployed URL. |

Handy diagnostics: server log, *Technical details (JSON)* on the result page, `npm run mock-wallet` to prove the server side works independently of any wallet.

---

## 3. Languages (English / French)

- The demo UI follows the browser language (French if the browser is French, otherwise English), remembers the choice, and has an **EN | FR** switch. Strings are in `public/i18n.js`; element labels in `src/profiles.js`.
- To add text, add the key to **both** `en` and `fr` objects. To add a language, add one more object (e.g. `fon`) and a button in `public/index.html`.
- The wallet's own consent screen language is controlled by the wallet, not by the RP.

---

## 4. Production checklist

The sample is deliberately simple. Before relying on it for real citizens' data, address at least:

### 4.1 Signed requests and trusted RP identity
- Real wallets in regulated ecosystems normally require the RP to be **registered** and to sign its request with an **access certificate** (`client_id` `x509_san_dns:<host>` or `x509_hash:…`). Set `RP_SIGNING_KEY_FILE` / `RP_SIGNING_CERT_FILE`; the sample then serves an ES256 JWT with the `x5c` header. `npm run gen-cert` creates a **self-signed test** certificate only.
- Protect the private key (secret manager, not git – `keys/` is git-ignored).

### 4.2 Verification
- Configure **trust anchors** (`TRUSTED_ISSUER_CERTS_DIR`) and set `ALLOW_UNTRUSTED_ISSUER=false`.
- Implement **holder binding**: verify `DeviceAuth` over the `SessionTranscript` that your wallet's OpenID4VP version defines (it incorporates your `client_id`, `response_uri`, `nonce`). Without it, a copied presentation could be replayed by someone else.
- Implement **revocation / status** checking as published by the issuer.
- Consider **encrypted responses** (`direct_post.jwt`) – required by some wallet profiles.
- For same-device flows, use the `response_code` / redirect pattern of OpenID4VP so a stolen session link cannot be completed by another browser.

### 4.3 Application
- Replace the in-memory session store (Redis/DB), allow several instances, keep the 10-minute TTL.
- Add rate limiting and bot protection on `POST /api/session`; the sample caps live sessions at 1,000.
- Use HTTPS everywhere (HSTS), keep the security headers/CSP in `server.js`, add CORS only for your own origins.
- **Do not log personal data** (claims, `vp_token`); log session ids and check results.
- Define data retention and the legal basis for each requested element; show a privacy notice.
- Keep dependencies updated (`npm audit`), pin Node LTS.

### 4.4 Licence
The repository carries the GNU GPL v3 licence file. If customers will embed code from the samples in proprietary software, agree the licence terms with your legal team first.
