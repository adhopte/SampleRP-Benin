# Guide 2 – Request a birth certificate attestation (SD-JWT VC), step by step

**Languages:** English · [Français](../fr/02-guide-acte-de-naissance.md)
[Overview](00-overview.md) · [PID guide](01-pid-mdoc-guide.md) · **Birth certificate guide** · [QR, troubleshooting, production](03-qr-troubleshooting-production.md)

**Goal:** let a citizen present their **birth certificate attestation** – an **SD-JWT VC** issued into their wallet – to your website (civil-status procedure, school enrolment, benefit application…) and receive a **verified** answer on your server.

The flow is the same as for the PID ([Guide 1](01-pid-mdoc-guide.md)); what changes is the **credential format** (SD-JWT VC instead of mdoc), the **claims**, and the **verification** (disclosures + key-binding JWT instead of CBOR digests).

> **Source of truth: the Benin PID / Birth Certificate Rulebook v1.1 (standard-namespace edition).** The birth certificate is an **SD-JWT VC**; an mdoc form is *optional* and has the same trimmed shape (docType = namespace = `eu.europa.ec.eudi.birth_certificate.1`). All claim names below are the rulebook's. Anything the rulebook flags *To confirm* is marked ⚠️ here.

| | Value | Source |
|---|---|---|
| Format | `dc+sd-jwt` (`vc+sd-jwt` in PEX/draft requests) | rulebook: SD-JWT |
| `vct` | `https://credentials.benin.example/birth_certificate` ⚠️ | The rulebook defines the PID `vct` (`https://credentials.benin.example/pid`) but **no birth-certificate `vct`**. This value follows the same pattern – **confirm it with the issuer** and set `BIRTH_CERT_VCT`. |
| mdoc form (optional) | docType = namespace = `eu.europa.ec.eudi.birth_certificate.1` | rulebook, "POC Profile" tab. Enable with `BIRTH_CERT_FORMAT=mso_mdoc`. |
| Issuing authority (claim value) | `ANIP` | rulebook |
| Holder binding | wallet-bound (`cnf`) where supported | rulebook |

---

## Step 0 – Prerequisites

- [ ] The sample running ([quick start](00-overview.md#2-quick-start-5-minutes-no-wallet-needed)) and a public HTTPS `BASE_URL`.
- [ ] A wallet holding the birth certificate SD-JWT from your issuer (or the mock wallet for now).
- [ ] From the issuer: the real **`vct`**, and how its signing key is published – an `x5c` certificate chain in the JWT header (verified against trust anchors) **or** `/.well-known/jwt-vc-issuer` metadata (see Step 6).

---

## Step 1 – Choose the use case and ask only for what it needs

The rulebook's **Verifier Matrix** defines the use cases. The sample provides two birth-certificate profiles (`src/profiles.js`):

| Profile id | Verifier Matrix use case | Claims requested |
|---|---|---|
| `birth_certificate` | Birth-date corroboration (certificate side) | `family_name`, `given_name`, `birth_date`, `birth_record_reference` |
| `birth_certificate_filiation` | Filiation proof | the above **+** `mother_family_name`, `mother_given_name`, `father_family_name`, `father_given_name` |

Claims available in the credential (rulebook "Birth Certificate" tab):

| Claim | Req. | SD | Notes |
|---|---|---|---|
| `family_name`, `given_name` | M | Yes | child's current names |
| `family_name_birth`, `given_name_birth` | O | Yes | at birth, if available |
| `birth_date` | M | Yes | |
| `birth_place`, `birth_country`, `birth_state`, `birth_city` | O | Yes | Benin geography resolved to display names |
| `gender` | O | Yes | ISO/IEC 5218 integer |
| `mother_family_name`, `mother_given_name`, `father_family_name`, `father_given_name` | O | Yes | plain descriptive claims, no identifier correlation |
| `birth_record_reference` | **M** | Yes | domestic record reference – stays on this credential |
| `registration_date`, `registration_place`, `declarant_name`, `declarant_relationship`, `marginal_mentions` | O | Yes | `marginal_mentions` is **sensitive** |
| `issuance_date`, `issuing_authority` | M | **No** | always visible (credential metadata) |
| `document_number` | O | Yes | |

> Request **only** what the use case needs: parents' names and marginal mentions are sensitive. The Verifier Matrix lists `portrait` and address as *not required by default*; the birth certificate does not carry them.

To change what a profile asks, edit its `requested` array – for example:

```js
birth_certificate: birthCertificate('birth_certificate',
  ['family_name', 'given_name', 'birth_date', 'birth_record_reference'], /* title, description */)
```

Every claim you request needs an EN and FR entry in `src/labels.js` (a test checks this).

---

## Step 2 – Create a session

`POST /api/session {"profile":"birth_certificate"}` – the same endpoint as for the PID. The response has the `openid4vp://` link, the QR (`qrUrl`) and its metrics. The QR stays small (version 8–9) because it only carries the `request_uri`.

---

## Step 3 – The request the wallet receives

The wallet fetches `request_uri` and gets a JWT whose payload contains (PEX / draft form, `QUERY_LANGUAGE=pex`):

```json
"presentation_definition": {
  "id": "birth_certificate-<session id>",
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

With `QUERY_LANGUAGE=dcql` (OpenID4VP 1.0):

```json
"dcql_query": { "credentials": [{
  "id": "birth_certificate",
  "format": "dc+sd-jwt",
  "meta": { "vct_values": ["https://credentials.benin.example/birth_certificate"] },
  "claims": [ { "path": ["family_name"] }, { "path": ["given_name"] }, { "path": ["birth_date"] }, { "path": ["birth_record_reference"] } ]
}]}
```

Also in the request: `nonce`, `state`, `response_uri`, `response_mode=direct_post`, `client_id`. The wallet must disclose **only** the requested claims (plus non-selectively-disclosable metadata).

---

## Step 4 – Show the QR code and the same-device link

Identical to [PID Step 4](01-pid-mdoc-guide.md#step-4--show-the-qr-code-and-a-same-device-link). With the widget:

```js
SampleRpBenin.mount(document.getElementById('wallet-verify'), {
  apiBase: 'https://your-rp-backend.example.org',
  profile: 'birth_certificate',        // or 'birth_certificate_filiation'
  lang: 'fr',
  onResult: (session) => { /* session.status === 'verified' | 'rejected' */ }
});
```

---

## Step 5 – Receive the response

`POST /api/response` with `vp_token` and `state` – exactly as for the PID. For an SD-JWT, `vp_token` is the **presentation string**:

```
<issuer-signed JWT>~<disclosure 1>~<disclosure 2>~…~<key-binding JWT>
```

(DCQL: a JSON object `{ "birth_certificate": ["<presentation>"] }` – the sample handles both.) A second response for the same session is refused.

Anatomy:

```
Issuer-signed JWT   header : { alg: ES256, typ: dc+sd-jwt, x5c: [...] }
                    payload: { iss, iat, exp, vct, cnf: {jwk}, _sd_alg: sha-256,
                               _sd: [digest, digest, …],          ← one per selectively-disclosable claim
                               issuance_date, issuing_authority } ← plain claims (SD = No)
Disclosure          base64url([ salt, "family_name", "KOSSI" ])    ← one per presented claim
KB-JWT              header : { alg: ES256, typ: kb+jwt }
                    payload: { iat, aud, nonce, sd_hash }
```

---

## Step 6 – Verify the SD-JWT (never skip this)

`src/sdjwt.js → verifySdJwtVc` reports each check separately:

| Check | What it proves | Fails when |
|---|---|---|
| `vct` | Right credential type | `vct` differs from the requested one |
| `digests` | Each disclosure's SHA-256 matches a digest in the **signed** `_sd`; none unreferenced or duplicated | a value was altered or injected (`--tamper`) |
| `issuer_signature` | The JWT signature verifies with the issuer's key | invalid signature / unsupported alg |
| `issuer_trust` | The key belongs to a trusted issuer | `x5c` does not chain to `TRUSTED_ISSUER_CERTS_DIR`; *skipped* without anchors |
| `validity` | `exp`, `nbf`, `iat` | expired / not yet valid |
| `requested_claims` | Every requested claim arrived | the wallet withheld one |
| `key_binding` | The **holder** presented it to **you**, now: KB-JWT signed with `cnf.jwk`, `aud` = your `client_id`, `nonce` = this session's, `sd_hash` covers the exact presentation | replay to another RP/session, forged or missing KB-JWT |
| `status` | *Not performed* – status/revocation is reported as skipped | – |

**Where does the issuer key come from?**
1. **`x5c` in the JWT header** (what the mock issuer does): the leaf certificate's key verifies the signature, and the chain is validated against your trust anchors.
2. **No `x5c`:** the sample fetches `<iss>/.well-known/jwt-vc-issuer` **only if `iss` is listed in `TRUSTED_ISSUER_URLS`** (comma-separated). It never fetches an arbitrary `iss` URL from a credential (SSRF protection). Otherwise the signature check is *skipped* and says why.

> **A credential is only as trustworthy as `issuer_trust`.** Configure the issuer (certificate or `TRUSTED_ISSUER_URLS`) and set `ALLOW_UNTRUSTED_ISSUER=false` before relying on results.

---

## Step 7 – Read the result and use it on the server

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

*(Fictitious values from the mock wallet, in the style of the rulebook's "Benin Display Simulation" tab.)*

Typical server-side uses (Verifier Matrix):

- **Birth-date corroboration (PID + birth certificate):** run a PID presentation, then a birth-certificate one in the same user flow and compare `birth_date` (and names). The rulebook says to *prefer identifier correlation* (`personal_administrative_number` on the PID, `birth_record_reference` on the certificate) *where available*, otherwise controlled matching. The sample runs the two presentations separately; a single combined request is not implemented.
- **Filiation proof:** use `birth_certificate_filiation`; compare parents' names to your own records; store only what you need.
- Take the decision **on the server** where `session.status = 'verified'` is set (`server.js`, `/api/response`), never from data posted by the browser.

---

## Step 8 – Test

1. `npm test` – includes SD-JWT flows, key-binding failures (wrong `aud`/`nonce`), expired/tampered/forged cases.
2. `npm run mock-wallet -- --profile birth_certificate` (and `birth_certificate_filiation`); add `--tamper` for a rejection (`digests: failed`).
3. `./samples/curl-walkthrough.sh birth_certificate` – every HTTP call.
4. A real wallet with the issuer's credential. If a check fails, open *Technical details (JSON)*:
   - `vct: failed – expected X, got Y` → set `BIRTH_CERT_VCT=Y` (⚠️ the confirmation point above).
   - `requested_claims: failed – missing: …` → the issuer's claim names differ; align `requested` with the rulebook/issuer.
   - `key_binding: failed – invalid: aud` → the wallet used a different `client_id` as audience than the one in the request; compare them (see [troubleshooting](03-qr-troubleshooting-production.md#2-troubleshooting)).
   - `issuer_signature: skipped` → add the issuer to `TRUSTED_ISSUER_URLS` or make the issuer include `x5c`.
   - If the wallet shows "no matching credential", the `vct` does not match what it holds.

### If you need the mdoc form
Set `BIRTH_CERT_FORMAT=mso_mdoc`: the profile then requests docType/namespace `eu.europa.ec.eudi.birth_certificate.1` and is verified like the PID ([Guide 1, Step 6](01-pid-mdoc-guide.md#step-6--verify-the-mdoc-never-skip-this)).

---

## Developer checklist

- [ ] The birth-certificate `vct` is confirmed with the issuer (`BIRTH_CERT_VCT`) – the rulebook does not define it.
- [ ] Claim names are the rulebook's; only what the use case needs is requested (parents / marginal mentions only when legally required).
- [ ] Issuer trust configured (`TRUSTED_ISSUER_CERTS_DIR` or `TRUSTED_ISSUER_URLS`); `ALLOW_UNTRUSTED_ISSUER=false` outside demos.
- [ ] `key_binding` passes (so a copied presentation cannot be replayed).
- [ ] A revocation/status strategy is agreed with the issuer (not implemented in the sample).
- [ ] Results are processed server-side; personal data is not logged; retention is defined.
- [ ] QR shown ≥ 280 px, black on white, with the same-device link.
