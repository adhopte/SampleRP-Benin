# Guide 2 – Request a birth certificate attestation (mdoc), step by step

**Languages:** English · [Français](../fr/02-guide-acte-de-naissance.md)
[Overview](00-overview.md) · [PID guide](01-pid-mdoc-guide.md) · **Birth certificate guide** · [QR, troubleshooting, production](03-qr-troubleshooting-production.md)

**Goal:** let a citizen present their **electronic birth certificate attestation** (an ISO 18013-5 **mdoc** issued into their wallet) to your website – for example to start a civil-status, school-enrolment or social-benefit procedure – and receive a **verified** answer on your server.

The protocol is **identical to the PID flow** ([Guide 1](01-pid-mdoc-guide.md)); only the *credential profile* changes. This guide lists each step with what is specific to the birth certificate.

> ### ⚠️ Align the identifiers with your issuer
> The `doctype`, namespace and element names for the birth certificate are **defined by the issuing authority**, not by this sample. The values below are **placeholders** that make the sample run end-to-end with the mock wallet:
>
> | | Placeholder in this sample | Where to change |
> |---|---|---|
> | `doctype` | `bj.gouv.birth_certificate.1` | `BIRTH_CERT_DOCTYPE` in `.env` or `src/profiles.js` |
> | namespace | same as doctype | `BIRTH_CERT_NAMESPACE` |
> | elements | `family_name`, `given_name`, `birth_date`, `birth_place`, `certificate_number`, `father_name`, `mother_name` | `requested` list in `src/profiles.js` |
>
> Ask the issuer for the credential's **doctype, namespace and data-element identifiers** (the credential schema / issuer metadata). Step 7 shows how to discover them from a real presentation.

---

## Step 0 – Prerequisites

- [ ] The sample running ([quick start](00-overview.md#2-quick-start-5-minutes-no-wallet-needed)) and a public HTTPS `BASE_URL`.
- [ ] A wallet that **holds a birth certificate attestation** from your issuer (or the mock wallet for now).
- [ ] The issuer's schema (see the box above) and, for production, its **root certificate** (IACA).

---

## Step 1 – Decide what to ask, carefully

A birth certificate contains **sensitive family data** (parents' names, place of birth). Request **only what your procedure legally requires**:

| Element (placeholder name) | Typical use | Ask only if… |
|---|---|---|
| `family_name`, `given_name`, `birth_date` | identify the person | always needed for matching |
| `birth_place` | civil-status procedures | the procedure needs it |
| `certificate_number` | look up the record in your registry | you will cross-check it |
| `father_name`, `mother_name` | filiation procedures | the procedure legally requires filiation |

Edit the list in `src/profiles.js`:

```js
birth_certificate: {
  id: 'birth_certificate',
  doctype: 'bj.gouv.birth_certificate.1',        // ← issuer's doctype
  namespace: 'bj.gouv.birth_certificate.1',      // ← issuer's namespace
  format: 'mso_mdoc',
  requested: ['family_name', 'given_name', 'birth_date', 'birth_place',
              'certificate_number'],             // ← drop father_name / mother_name if not needed
  labels: { /* EN + FR labels of every element you may display */ }
}
```

Add an `en`/`fr` entry in `labels` for each element so the result screen shows friendly names (elements without a label are displayed with their identifier). Check with your legal/data-protection team the legal basis and retention for the data you request (Beninese data-protection framework).

---

## Step 2 – Create a session

`POST /api/session {"profile":"birth_certificate"}` – same endpoint as the PID; only the profile differs. The response contains the `openid4vp://` link, the QR (`qrUrl`) and its metrics. The QR stays **small (version 8–9)** whatever the number of requested elements, because the QR only carries the `request_uri` (see [guide 3](03-qr-troubleshooting-production.md#1-why-the-qr-code-needed-zoom-and-what-changed)); with `QR_MODE=value` the birth-certificate request alone would need ≈ 1,700 characters.

---

## Step 3 – The request the wallet receives

Same structure as the PID; only the descriptor changes:

```json
"presentation_definition": {
  "id": "birth_certificate-<session id>",
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

With `QUERY_LANGUAGE=dcql`:

```json
"dcql_query": { "credentials": [{
  "id": "birth_certificate", "format": "mso_mdoc",
  "meta": { "doctype_value": "bj.gouv.birth_certificate.1" },
  "claims": [ { "path": ["bj.gouv.birth_certificate.1", "family_name"], "intent_to_retain": false }, … ]
}]}
```

If the issuer's wallet cannot find a matching credential, it will tell the citizen "no matching credential" – this is almost always a **doctype/namespace mismatch** (Step 7).

---

## Step 4 – Show the QR code and the same-device link

Identical to [PID Step 4](01-pid-mdoc-guide.md#step-4--show-the-qr-code-and-a-same-device-link). To start the birth-certificate flow from your page, either call the API with the other profile or use the widget:

```js
SampleRpBenin.mount(document.getElementById('wallet-verify'), {
  apiBase: 'https://your-rp-backend.example.org',
  profile: 'birth_certificate',
  lang: 'fr',
  onResult: (session) => { /* session.status === 'verified' | 'rejected' */ }
});
```

---

## Step 5 – Receive the response

Same `POST /api/response` as the PID (`vp_token` + `state`). The document inside is the attestation's **DeviceResponse**, `docType` = the birth-certificate doctype.

---

## Step 6 – Verify

Same checks as the PID ([table](01-pid-mdoc-guide.md#step-6--verify-the-mdoc-never-skip-this)) – `doctype`, `digests`, `issuer_signature`, `issuer_trust`, `validity`, `requested_elements`, `device_auth` (not performed).

Two points specific to attestations:

1. **Who is the issuer?** A birth-certificate attestation must come from the **civil-registration authority's** issuer, not just *any* issuer. Put **that** issuer's root certificate (and only it) in `TRUSTED_ISSUER_CERTS_DIR` for this profile's use, and set `ALLOW_UNTRUSTED_ISSUER=false`.
2. **Validity.** Attestations often have a short validity or can be revoked/superseded. The sample checks `validUntil`; **revocation/status-list checking is not implemented** – ask the issuer how a status is published and add it before relying on old attestations.

---

## Step 7 – Read the result, and discover the real identifiers

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

*(Fictitious test data generated by the mock wallet.)*

**Discovering the issuer's real identifiers with a real wallet.** If the wallet answers but a check fails:

- `doctype: failed – expected X, got Y` → set `BIRTH_CERT_DOCTYPE=Y`.
- `requested_elements: failed – missing: …` → the issuer names the elements differently; open *Technical details (JSON)* in the demo page to see the element identifiers returned in `claims`, then update `requested` and `labels`.
- If the wallet never reaches your server (no `/api/response` in the logs) the credential was probably not matched → compare the `docType` shown in the wallet's credential details with your profile.

**Using the result.** Typical server-side uses:

- **Cross-check with the PID**: run a PID presentation first, then a birth-certificate one in the same user flow, and compare `family_name`, `given_name`, `birth_date` (normalise case/diacritics) before accepting the application. (Asking for both in a single request is possible with a combined query, but is not implemented in this sample.)
- **Registry lookup** by `certificate_number` to confirm the record still exists and is unchanged.

---

## Step 8 – Test

1. `npm test` – includes a full birth-certificate flow and a tampered one.
2. `npm run mock-wallet -- --profile birth_certificate` (add `--tamper` for a rejection).
3. `./samples/curl-walkthrough.sh birth_certificate` – every HTTP call, step by step.
4. Real wallet with the issuer's credential (Step 7 tells you how to fix identifiers).

In the demo, pick **Birth certificate** (*Acte de naissance*) on the first screen, or open the embed example at `/samples/embed/index.html?profile=birth_certificate&lang=fr`.

---

## Developer checklist

- [ ] `doctype`, namespace and element names come **from the issuer**, not from this sample's placeholders.
- [ ] Only legally necessary elements (especially parents' names) are requested.
- [ ] The civil-registration issuer's root certificate is configured; `ALLOW_UNTRUSTED_ISSUER=false`.
- [ ] A revocation/status strategy is defined with the issuer.
- [ ] Results are processed server-side; personal data is not logged; retention is defined.
- [ ] QR is shown ≥ 280 px, black on white, with the same-device link.
