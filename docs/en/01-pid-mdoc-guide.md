# Guide 1 – Request a PID (mdoc) from a wallet, step by step

**Languages:** English · [Français](../fr/01-guide-pid-mdoc.md)
[Overview](00-overview.md) · **PID guide** · [Birth certificate guide](02-birth-certificate-guide.md) · [QR, troubleshooting, production](03-qr-troubleshooting-production.md)

> **Source of truth: the Benin PID / Birth Certificate Rulebook v1.1 (standard-namespace edition).** The PID is an **mdoc** whose docType and namespace are both the standard `eu.europa.ec.eudi.pid.1` – there is **no Benin-specific namespace or claim**; Benin content (`issuing_authority` = `ANIP`, `issuing_country` = `BJ`, Beninese names and places) is carried in the *values*. The PID SD-JWT is out of scope.

**Goal:** add a "Verify with my wallet" button to your website that asks the citizen for **family name, given name(s) and date of birth** from their national digital ID (PID, ISO 18013-5 **mdoc**), and receives a **verified** answer on your server.

Time: ~30 minutes with the mock wallet, then a real wallet test.

| You will use | Value for the PID |
|---|---|
| Format | `mso_mdoc` |
| `doctype` | `eu.europa.ec.eudi.pid.1` |
| Namespace | `eu.europa.ec.eudi.pid.1` |
| Elements requested (profile `pid`) | `family_name`, `given_name`, `birth_date` – the rulebook's *Identity verification* use case |
| Elements requested (profile `pid_age_over_18`) | `age_over_18` – the *Age > 18* use case |
| Flow | OpenID4VP, `response_mode=direct_post` |

---

## Step 0 – Prerequisites

- [ ] Node.js 18+ and the sample running: follow the [quick start](00-overview.md#2-quick-start-5-minutes-no-wallet-needed).
- [ ] A public HTTPS URL for the backend ([§3 of the overview](00-overview.md#3-make-it-reachable-by-a-real-wallet)).
- [ ] The wallet you will test with. Identifiers are fixed by the rulebook; override `PID_DOCTYPE` / `PID_NAMESPACE` in `.env` only if the ecosystem changes them.

---

## Step 1 – Decide what to ask (data minimisation)

Open `src/profiles.js`. The PID profiles are the only place that describes what is asked:

```js
pid: pid('pid', ['family_name', 'given_name', 'birth_date'], /* title, description */),        // Identity verification
pid_age_over_18: pid('pid_age_over_18', ['age_over_18'], /* title, description */),            // Age > 18
```

Ask for the **minimum** your service needs – the rulebook's Verifier Matrix says to **prefer `age_over_18` rather than `birth_date`** for an age gate, and to request `nationality` only if needed and `personal_administrative_number` (high sensitivity) only if required; `portrait` and `resident_address` are *not requested by default*. Elements you can request (rulebook "PID mdoc" tab): `family_name`, `family_name_birth`, `given_name`, `birth_date`, `age_over_18`, `age_over_NN`, `age_in_years`, `age_birth_year`, `birth_place`, `birth_country`, `birth_state`, `birth_city`, `resident_address`, `nationality`, `gender`, `portrait`, `document_number`, `issuance_date`, `expiry_date`, `issuing_authority`, `issuing_country`, `personal_administrative_number`. Add a new claim to `requested` and make sure it has EN/FR labels in `src/labels.js`. Every element you add appears on the citizen's consent screen. Elements are sent with `intent_to_retain: false`; set it to `true` only if you really store the value, and tell the citizen why.

---

## Step 2 – Create a session when the user clicks the button

**Browser → your backend:** `POST /api/session {"profile":"pid"}` (`server.js`, route `/api/session`).

The backend:

1. generates a random **`state`** (identifies the session in the wallet's response) and **`nonce`** (freshness),
2. builds the request parameters (`src/request.js → buildRequestParams`),
3. builds the `openid4vp://` link and the QR code,
4. stores the session in memory for 10 minutes.

Real response (shortened):

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

> In your own application, call this from your **server-side** session (e.g. tie `sessionId` to the user's login attempt) so that you can later map the verified result to the right user.

---

## Step 3 – Understand the request the wallet receives

The link in the QR code contains only `client_id` and a `request_uri`. The wallet performs `GET request_uri` and receives a JWT (`application/oauth-authz-req+jwt`) whose payload is:

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

| Parameter | Meaning |
|---|---|
| `client_id` | Who is asking. With a signed request it is `x509_san_dns:<your host>`; see [signed requests](03-qr-troubleshooting-production.md#41-signed-requests-and-trusted-rp-identity). |
| `response_mode=direct_post` | The wallet POSTs the answer to `response_uri` (it does not redirect the browser with the data). |
| `response_uri` | Your endpoint `/api/response`. Must be HTTPS and public. |
| `nonce`, `state` | Per-session random values. |
| `presentation_definition` | *What* you want. For an mdoc, the descriptor `id` is the `doctype`, and each `path` is `$['<namespace>']['<element>']`. |
| `limit_disclosure: required` | The wallet must disclose **only** the listed elements. |

**If your wallet speaks OpenID4VP 1.0**, set `QUERY_LANGUAGE=dcql`. The same profile is then expressed as:

```json
"dcql_query": { "credentials": [{
  "id": "pid", "format": "mso_mdoc",
  "meta": { "doctype_value": "eu.europa.ec.eudi.pid.1" },
  "claims": [ { "path": ["eu.europa.ec.eudi.pid.1", "family_name"], "intent_to_retain": false }, … ]
}]}
```

---

## Step 4 – Show the QR code (and a same-device link)

Minimal front end (`public/app.js`), or use the ready-made widget in `samples/embed/`:

```html
<img id="qr" alt="QR code">
<a id="open">Open in wallet app</a>
<script>
  fetch('/api/session', { method: 'POST', headers: {'content-type':'application/json'},
                          body: JSON.stringify({ profile: 'pid' }) })
    .then(r => r.json()).then(s => {
      document.getElementById('qr').src = s.qrUrl;               // SVG from the backend
      document.getElementById('open').href = s.authorizationRequestUri; // phone users: no scan needed
      poll(s.sessionId);
    });
</script>
```

Rules that keep the QR scannable on mid-range phones (Samsung A-series, etc.) – **do not break them when you restyle**:

- Display the SVG **as is**, at least **280 CSS px** wide (the sample uses `min(88vw, 360px)`).
- **Keep the white quiet zone** (it is inside the SVG – do not crop, round or shrink it) and a pure black-on-white palette. No logo overlay, no dark-mode inversion.
- Do not blur/scale it with CSS filters. Offer an **Enlarge** button (the sample has one).
- Always provide the **same-device link** – a citizen on their phone should tap, not scan.

Details and measurements: [guide 3](03-qr-troubleshooting-production.md#1-why-the-qr-code-needed-zoom-and-what-changed).

---

## Step 5 – Receive the wallet's answer (`response_uri`)

The wallet sends `POST /api/response` (`application/x-www-form-urlencoded`):

| Field | Content |
|---|---|
| `vp_token` | The mdoc **DeviceResponse**, CBOR, base64url-encoded (DCQL: a JSON object `{ "<query id>": ["<DeviceResponse>"] }` – the sample handles both). |
| `state` | Your `state` – used to find the session. Unknown/expired → `400`. |
| `presentation_submission` | PEX only: maps the descriptor to the token. |

The sample answers `200 {}` on success and `400 {"error":"invalid_request", …}` otherwise. A second response for the same session is refused (replay protection).

---

## Step 6 – Verify the mdoc (never skip this)

`src/mdoc.js → verifyDeviceResponse` structurally decodes and **verifies**:

| Check | What it proves | Fails when |
|---|---|---|
| `doctype` | The document is a PID and matches the MSO | wrong credential type presented |
| `digests` | Each disclosed element hashes to the value signed by the issuer (`valueDigests` in the MSO) | any value was altered (tamper test: `--tamper`) |
| `issuer_signature` | The MSO (COSE_Sign1) is signed by the key in the `x5chain` certificate | signature invalid |
| `issuer_trust` | That certificate chains to **an issuer you trust** (IACA in `TRUSTED_ISSUER_CERTS_DIR`) | unknown issuer. *Skipped* when no anchors are configured |
| `validity` | `validFrom ≤ now ≤ validUntil` | expired / not yet valid |
| `requested_elements` | All requested elements were returned | the wallet withheld one |
| `status` | *Not performed* – revocation/status (rulebook: "validate … status") is reported as skipped | – |
| `device_auth` | *Not performed by the sample* – holder binding | – |

> **A credential is only as trustworthy as `issuer_trust`.** Without configured trust anchors the sample reports the signature as valid but **cannot know who signed**; anyone could present a self-made mdoc. Get the issuer's root certificate(s) and set `TRUSTED_ISSUER_CERTS_DIR` + `ALLOW_UNTRUSTED_ISSUER=false` before trusting results.

Anatomy of what is being verified (the "DeviceResponse"):

```
DeviceResponse
└─ documents[0]
   ├─ docType: "eu.europa.ec.eudi.pid.1"
   ├─ issuerSigned
   │   ├─ nameSpaces["eu.europa.ec.eudi.pid.1"] = [ #6.24(bstr IssuerSignedItem), … ]
   │   │      IssuerSignedItem = { digestID, random, elementIdentifier, elementValue }
   │   └─ issuerAuth = COSE_Sign1[ protected{alg}, {33: x5chain}, #6.24(bstr MSO), signature ]
   │          MSO = { digestAlgorithm, valueDigests, deviceKeyInfo, docType, validityInfo }
   └─ deviceSigned  (holder's proof of possession – not verified by the sample)
```

---

## Step 7 – Read the outcome and use it on the server

The page polls `GET /api/session/:id`. A verified result looks like:

```json
{
  "status": "verified",
  "profile": "pid",
  "results": [{
    "docType": "eu.europa.ec.eudi.pid.1",
    "claims": { "eu.europa.ec.eudi.pid.1": {
      "family_name": "KOSSI", "given_name": "Jean", "birth_date": "1990-05-12" } },
    "checks": [
      { "id": "doctype", "status": "passed" },
      { "id": "digests", "status": "passed" },
      { "id": "issuer_signature", "status": "passed", "detail": "ES256" },
      { "id": "issuer_trust", "status": "skipped", "detail": "no trust anchors configured" },
      { "id": "validity", "status": "passed" },
      { "id": "requested_elements", "status": "passed" },
      { "id": "status", "status": "skipped" },
      { "id": "device_auth", "status": "skipped" }
    ]
  }]
}
```

`status` is `rejected` when any check `failed` (or, with `ALLOW_UNTRUSTED_ISSUER=false`, when trust is not established); `error` then says why.

**Integrating with your application** – in `app.post('/api/response', …)`, right where `session.status = 'verified'` is set, call your own code: look up the pending login/application bound to `session.id`, store only what you are allowed to keep, and open the user's session **server-side**. The browser polling is for display only.

---

## Step 8 – Test

1. **Unit/flow tests:** `npm test`.
2. **Mock wallet** (no phone): `npm run mock-wallet -- --profile pid` (or `pid_age_over_18`; the mock discloses only what is requested, with fictitious Benin-style values); add `--tamper` to confirm a modified value is **rejected** (`digests: failed`).
3. **Real wallet:** deploy/tunnel with a public `BASE_URL`, open the page *via that URL*, scan the QR with the wallet. If the wallet shows an error before the consent screen, use the [troubleshooting table](03-qr-troubleshooting-production.md#2-troubleshooting).
4. **Check what your issuer really sends:** if `doctype` or `requested_elements` fail, open *Technical details (JSON)* – it shows the `docType` and element names the wallet returned. Align `src/profiles.js` (or the `PID_*` variables) with them.

---

## Step 9 – Embed in your own site

Copy `samples/embed/sample-rp-widget.js` into your site:

```html
<div id="wallet-verify"></div>
<script src="sample-rp-widget.js"></script>
<script>
  SampleRpBenin.mount(document.getElementById('wallet-verify'), {
    apiBase: 'https://your-rp-backend.example.org',
    profile: 'pid',
    lang: 'fr',
    onResult: (session) => console.log(session.status)
  });
</script>
```

If the page and the backend have different origins, enable CORS for your site's origin on `POST /api/session` and `GET /api/session/:id`, and add your site to the CSP. A runnable example is served at `/samples/embed/index.html?profile=pid&lang=en`.

---

## Developer checklist

- [ ] `BASE_URL` is the public HTTPS URL; `/health` answers.
- [ ] Only the elements I need are requested.
- [ ] QR is shown at ≥ 280 px, black on white, with the same-device link.
- [ ] `state` is validated, a response is accepted once, sessions expire.
- [ ] Trust anchors configured; `ALLOW_UNTRUSTED_ISSUER=false` outside demos.
- [ ] Decisions are taken on the server, not from browser data.
- [ ] Personal data is not logged; retention is defined.
