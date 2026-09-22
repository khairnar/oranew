# The live provider integration

```
mobile
  → Prefill API
  → extract PAN / name / gender from the Prefill RESPONSE
  → CIBIL API
  → the existing normalisation layer
  → the existing ORA engine
  → the existing reportData
  → the existing report
```

**There is no path from a mobile number to CIBIL.** The CIBIL request cannot be
built without a `CibilIdentity`, and a `CibilIdentity` cannot be built without a
Prefill response. That is a type-level constraint in
[`extract.ts`](../src/lib/providers/extract.ts), not a convention.

Nothing in the ORA engine changed. Once the two raw payloads exist they go
through `runAssessment` exactly as an uploaded file does, and
`tests/api-integration.test.ts` asserts that all four regression tenants
produce a byte-identical `normalized` record and identical 28 signals whether
they arrived over the wire or from disk.

---

## Where it lives

| | |
| --- | --- |
| Canonical mobile number | `src/lib/providers/mobile.ts` |
| Error taxonomy and stages | `src/lib/providers/types.ts` |
| Credentials and endpoints | `src/lib/providers/config.ts` — `server-only` |
| HTTP, timeout, status classification | `src/lib/providers/http.ts` |
| **Prefill → CIBIL mapping** | `src/lib/providers/extract.ts` |
| Surepass adapters | `src/lib/providers/surepass.ts` |
| Orchestration | `src/lib/providers/integration.ts` |
| Mock provider | `src/lib/providers/mock.ts` |
| Server route | `src/app/api/integration/route.ts` |
| Admin screen | `src/app/api-test/page.tsx` → **API Integration Test** |
| Tests | `tests/api-integration.test.ts` |

---

## Authentication

Both products authenticate with a bearer token, read **server-side only**.

| | Prefill | CIBIL |
| --- | --- | --- |
| Method | `POST` | `POST` |
| URL | `https://kyc-api.surepass.app/api/v1/prefill/prefill-by-mobile` | `https://kyc-api.surepass.app/api/v1/credit-report-cibil/fetch-report` |
| Header | `Authorization: Bearer <PREFILL_API_KEY>` | `Authorization: Bearer <CIBIL_API_TOKEN>` |
| Body | `{ "mobile": "<10 digits>" }` | `{ mobile, pan, name, gender, consent }` |

**Both products are on the same host.** CIBIL was originally configured as
`app.surepass.app/production/api/v1/credit-report-cibil/fetch-report`, which
returned `401 Invalid token` for the token Prefill accepted with `200` in the
same run. The credential was never the problem — the host was. Surepass's
current CIBIL documentation puts it on `kyc-api.surepass.app` under the
ordinary `/api/v1` prefix, with no `/production` segment.

`tests/api-integration.test.ts` now asserts the final URL, the method and the
`Authorization` header **as they leave the adapter**, rather than inferring
them from configuration — including explicit assertions that the URL contains
neither `/production` nor a doubled `/api/v1/api/v1`.

### Prefill authentication — CONFIRMED

Confirmed from Surepass's current **Prefill by Mobile** documentation:

```
POST https://kyc-api.surepass.app/api/v1/prefill/prefill-by-mobile
Authorization: Bearer <token>
Content-Type: application/json

{ "mobile": "<10 digit mobile>" }
```

The shipped defaults already matched, so **no default changed**:
`PREFILL_AUTH_HEADER=Authorization`, `PREFILL_AUTH_SCHEME=Bearer`. Both remain
overridable, and `tests/api-integration.test.ts` fixes the exact header name
and value format each setting produces.

> Earlier revisions of this document recorded the Prefill scheme as
> unverified, because no Surepass documentation exists anywhere in this
> workspace. It was confirmed externally, against the provider's own docs.

### Credential resolution

Each product reads its own variable first and falls back to a shared one:

| product | order |
| --- | --- |
| Prefill | `PREFILL_API_KEY` → `SUREPASS_TOKEN` |
| CIBIL | `CIBIL_API_TOKEN` → `SUREPASS_TOKEN` |
| Prefill base URL | `PREFILL_API_BASE_URL` → `SUREPASS_BASE_URL` |
| CIBIL base URL | `CIBIL_API_BASE_URL` → `SUREPASS_BASE_URL` |

Since both products sit on one host, `SUREPASS_BASE_URL` plus `SUREPASS_TOKEN`
is a complete configuration for the whole pipeline.

**One Surepass token covers both products.** Confirmed by live testing: put
the same token in `PREFILL_API_KEY` and `CIBIL_API_TOKEN`, or set
`SUREPASS_TOKEN` once and let both fall back to it. Either route works.

The screen still names the variable that supplied each credential and warns
when both resolve to the same one — not because sharing is wrong, but because
a credential nobody can account for is the hardest kind of 401 to diagnose.

> **How this was established.** Neither `SUREPASS_TOKEN` nor
> `SUREPASS_BASE_URL` appears in any file in this workspace, and the only real
> `.env` present (`rhea-lead-engine/.env`) holds no Surepass variable under any
> name — so the project itself could never have answered this. It was
> confirmed empirically: a live run authenticated Prefill with the Surepass
> token (HTTP 200) while CIBIL, holding a different value, returned HTTP 401
> `Invalid token`.

A 401 now reports **which variable supplied the rejected token**, because when
one product authenticates and the other does not, that is always the first
question.

`SUREPASS_BASE_URL` is commonly written with `/api/v1` already on it. The
configured Prefill path also begins with `/api/v1`, so `joinUrl` matches and
drops the overlapping segment run rather than producing
`/api/v1/api/v1/prefill/…`. The resolved URL is shown on the screen.

### Environment variables

```
PREFILL_API_BASE_URL=https://kyc-api.surepass.app
PREFILL_API_KEY=

CIBIL_API_BASE_URL=https://kyc-api.surepass.app
CIBIL_API_TOKEN=
```

Optional: `PREFILL_API_PATH`, `CIBIL_API_PATH`, `PREFILL_AUTH_HEADER`,
`PREFILL_AUTH_SCHEME`, `CIBIL_AUTH_HEADER`, `CIBIL_AUTH_SCHEME`,
`PROVIDER_TIMEOUT_MS`, `CIBIL_CONSENT_VALUE`.

Placeholders are in [`.env.example`](../.env.example); real values go in
`.env.local`, which `.gitignore` already covers. **No variable is prefixed
`NEXT_PUBLIC_`**, so none can reach the browser bundle.

---

## The Prefill → CIBIL mapping

Read off the **real Surepass payloads committed under `samples/`** — tanish,
yashraj, thin-file and established-clean — not guessed. All four carry the
same structure, and each CIBIL response echoes `data.{mobile,pan,name,gender}`,
which is what confirms those four are the request fields.

| Prefill JSON path | internal | CIBIL request field |
| --- | --- | --- |
| `data.mobile` | `identity.mobile` | `"mobile"` |
| `data.details.identity_info.pan_number[].id_number` | `identity.pan` | `"pan"` |
| `data.details.personal_info.full_name` | `identity.name` | `"name"` |
| `data.details.personal_info.gender` | `identity.gender` | `"gender"` |
| *(none — a configured constant)* | `consentValue` | `"consent"` |

Accepted alternates, used only where the primary path is absent:
`personal_info.{first,middle,last}_name`, `data.name`, `data.gender`, and a
bare `pan_number` object rather than an array.

**Transformations, and why each exists:**

- **PAN** is uppercased and format-checked (`AAAAA0000A`). A truncated or
  placeholder value is reported as missing rather than sent on to fail at the
  bureau.
- **Name** has its whitespace collapsed. The real payloads carry trailing and
  doubled spaces — `"TANISH SADANAND SADANAND SHETTY "` — and a name sent with
  them is a name the bureau may not match.
- **Gender** is normalised to `M` / `F` / `T` for the application, and then
  rendered into Surepass's `GenderEnum` — `male` / `female` — **only when the
  request body is built**. An unrecognised value from Prefill is **not**
  passed through the extractor: a bureau rejection whose cause is three stages
  upstream is much harder to diagnose than a named mapping failure.
- **Mobile** — the number *asked for* always wins. Preferring Prefill's echo
  would mean a response for the wrong subscriber silently redirects the CIBIL
  call to a different person. A disagreement is surfaced as
  `mobileMismatch`, never taken.

### A worked request

Mobile `+91 93263 74851` → mock mode → the CIBIL body the pipeline built:

```json
{
  "mobile": "9326374851",
  "pan": "NYDPS4511L",
  "name": "TANISH SADANAND SADANAND SHETTY",
  "gender": "male",
  "consent": "Y"
}
```

Only `consent` is a literal, and it is a configured constant rather than
written inline.

### The gender boundary

`gender` is the one field written in the **provider's** vocabulary rather than
the application's, because Surepass names its own enum members:

```
internal M  →  "male"      internal F  →  "female"
```

`toSurepassGender` in [`surepass.ts`](../src/lib/providers/surepass.ts) is the
only place that conversion happens, and it happens when the body is built.
Nothing above the adapter changes: the normaliser, the report, the internal
trace and the test screen's "Gender found" row all still read `M`. The screen
shows both — `M` as extracted, `male` as sent — which is what makes the
boundary visible.

Sending `"M"` earned `400 Input payload validation failed` with
`{"gender": "Gender 'M' is not a valid GenderEnum"}`.

Accepted spellings, case-insensitively: `M`, `m`, `Male`, `male`, `MALE` →
`"male"`; `F`, `f`, `Female`, `female`, `FEMALE` → `"female"`.

**Anything else stops the pipeline at `prefill_extract`, and CIBIL is never
called.** No request body is built, no call is attempted, and nothing is
substituted:

```
Prefill returned an unsupported gender value for the CIBIL provider.
```

Reported as kind `unsupported_value`, which is deliberately **not**
`missing_required_field` — "gender was not returned" and "gender was returned
as something this provider's enum has no member for" send someone to look in
different places, and only the first might be fixed by a different subscriber.

The original value is preserved in **internal diagnostics only**
(`extraction.diagnostics.genderRaw`, plus `genderReturned` and
`providerAccepts` on the stage detail). The operator-facing message never
contains it — the pipeline stopping and why is what a status line is for, and
a tenant's gender does not need to be in one.

Substituting `"male"` for a tenant Prefill reported as `T` would put a
fabricated value in a credit-bureau request. The application's own vocabulary
stays wider than the provider's: `T` remains a valid internal value, and the
narrowing is recorded as a property of the CIBIL provider rather than applied
to the application.

---

## Missing required fields

A field Prefill did not return is **named**, never invented, never defaulted
and never prompted for:

| missing | message |
| --- | --- |
| PAN | `Prefill succeeded but PAN required for CIBIL was not returned.` |
| name | `Prefill succeeded but applicant name required for CIBIL was not returned.` |
| gender | `Prefill succeeded but gender required for CIBIL was not returned.` |

The failure is reported at the `prefill_extract` stage — **Prefill itself is
reported as having succeeded**, because it did — and CIBIL is never called.

A field that was returned but cannot be used takes the same exit, under
`unsupported_value` rather than `missing_required_field`. Both are asserted
the same way in the test suite: no CIBIL request is built, `raw.cibil` stays
null, and a `fetch` that throws on the CIBIL URL records zero calls.

---

## Error handling

Seven stages, each reported separately. A stage that was never reached says
so rather than appearing to pass.

```
input → prefill_request → prefill_extract → cibil_request
      → normalization → assessment → report
```

| kind | cause |
| --- | --- |
| `invalid_input` | the mobile number is not a valid Indian mobile |
| `not_configured` | the credential for that product is absent |
| `bad_request` | HTTP 400 / 422 |
| `unauthorized` | HTTP 401 / 403 |
| `not_found` | HTTP 404, **or** HTTP 200 with no subscriber |
| `rate_limited` | HTTP 429 |
| `provider_error` | HTTP 5xx |
| `timeout` | no response within `PROVIDER_TIMEOUT_MS` |
| `network_error` | the host could not be reached |
| `malformed_response` | HTTP 200 whose body is not the JSON it claims |
| `missing_required_field` | Prefill returned no PAN / name / gender |
| `unsupported_value` | Prefill returned a value the provider's enum cannot express |
| `internal_error` | the engine threw on the provider payloads |

**A Prefill failure is never reported as a CIBIL failure, and the reverse.**
The stage carries the attribution, and both directions are asserted.

---

## Mock mode

`mode: "mock"` answers from the committed sample payloads through a `fetch`
that never opens a socket. The adapters run exactly as in live mode — same
request building, same headers, same response handling — so the whole test
suite runs with no credential, no network and no real subscriber.

The mock CIBIL endpoint matches on the **PAN the handoff produced**, not on the
mobile number: a run that skipped the Prefill → CIBIL mapping could not get an
answer out of it at all.

Every failure kind is reachable from mock mode, so 401, 429, a timeout and a
malformed body are all exercised deterministically.

Mock numbers: `9326374851` (tanish) · `9119142106` (yashraj) ·
`9845100237` (thin-file) · `9820455106` (established-clean).

---

## Consent

The CIBIL body carries `consent: "Y"` as a configured constant
(`CIBIL_CONSENT_VALUE`), kept explicit in the adapter.

**That flag is a field the provider requires. It is not evidence that consent
was obtained, and this screen collects none.** The Admin page says so in a
standing notice. Before LIVE mode is pointed at a real subscriber, confirm the
consent mechanism Surepass requires and capture it through the application's
own consent flow.

---

## Privacy

| | landlord report | internal screen |
| --- | --- | --- |
| raw Prefill / CIBIL JSON | never | expandable, marked INTERNAL ONLY |
| the CIBIL request | never | shown |
| PAN, provider `client_id`, mobile | never | shown |
| credentials, `Authorization` header | **never, anywhere** | never — presence only |

The route's response contains no credential in any branch, and the credential
reader is `server-only` so importing it from a client component is a build
error rather than a token in a JavaScript file. The existing privacy guard —
`assertNoSensitiveData` with `collectSecrets` — is run against an API-sourced
report in the test suite, exactly as it is against an uploaded one.

---

## Running it

```bash
cp .env.example .env.local     # then fill in the two credentials
npm run dev
```

Open **API Integration Test** in the sidebar. Mock mode needs no credentials.

The screen shows the pipeline stage by stage, the exact request bodies, the
mapping with the Prefill path each value came from, the CIBIL response
summary, and the raw payloads behind expandable INTERNAL ONLY sections.
**Load into simulator** hands the two raw payloads to the existing simulator,
which scores them under the *active* configuration — the route itself uses the
factory configuration, because a server route cannot read the browser's store.
