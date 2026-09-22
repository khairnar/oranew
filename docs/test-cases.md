# Test cases

```bash
npm test          # run once
npm run test:watch
npx vitest run tests/privacy.test.ts   # one file
```

**1,286 tests across 36 files.** All pass.

| File | Tests | Covers |
| --- | ---: | --- |
| `tests/masking.test.ts` | 16 | PAN, CKYC, phone, social ID, email masking; document lines; rupee and date formatting |
| `tests/normalizer.test.ts` | 22 | Parsing, type detection, score extraction, date and number coercion, field mapping, alternate payload shapes, missing and empty inputs |
| `tests/scoring.test.ts` | 15 | CIBIL bands before and after an admin edit, weights, overall score mapping, payment and default history, exception rules, the engine contract |
| `tests/rent-and-income.test.ts` | 17 | Income frequency, missing rent, rent-to-income calculations, obligations, verified-income gate, rent tiers |
| `tests/privacy.test.ts` | 13 | The landlord report privacy filter, the leak scanner, and the internal report's counterpart detail |
| `tests/configuration.test.ts` | 20 | Validation, versioning, activation, duplication, reset, diffing, comparison, rating labels |
| `tests/sample-report.test.ts` | 12 | The documented sample tenant and all ten simulation presets |
| `tests/pdf.test.ts` | 5 | PDF rendering, display rules, leak guard |
| `tests/yashraj-reconciliation.test.ts` | 77 | **MODE A — v42 reference reproduction** (reference date, reference weights) plus a **MODE B** block proving the live configuration is a different test: source adapters, derived facts, all 28 signals, configuration control and privacy |
| `tests/ora-scoring-architecture.test.ts` | 29 | The ORA scoring architecture: the ten top-level weights drive the ORA score and the overall ORA rating, the category engine is diagnostic only, the two never cross, the missing-score denominator rule, band crossing, Rent Affordability terminology, and the **MODE B** Yashraj 95.34 / 92.54 / restore regression |
| `tests/missing-income.test.ts` | 31 | Missing income end to end: no annualisation, zero substitution or EMI-derived income; 4.1-4.4 return their configured missing states; only income-dependent signals move; the Rent-to-Income Fit parameter is excluded and the remaining weights renormalise over 75%; zero-weight parameters stay scored and out of the denominator; the diagnostic score stays independent; landlord privacy in the object and in the decoded PDF; and the Tanish / Yashraj regression |
| `tests/config-management.test.ts` | 15 | The factory seed carries the approved ten weights totalling 100%, and restoring an archived version: archived stays ineligible for direct activation, the clone is byte-identical across scoringParameters / categoryWeights / signals / landlordRanges / landlordDisclosure, it activates through the normal path, the original and every historical snapshot are untouched, and the audit log names the restored version |
| `tests/weight-sensitivity.test.ts` | 18 | Weighted-score arithmetic and weight transfer, strict_100 validation, the missing-parameter denominator, zero-weight behaviour, three-way independence (ORA weights / category weights / display ranges), configuration-snapshot persistence and historical immutability, restore-through-duplicate, and the separate internal and landlord PDF exports |
| `tests/landlord-ranges.test.ts` | 31 | V10 landlord display ranges: income and credit-score band lookup with boundary values, no exact figure in the landlord output, the exact values kept in Internal Admin, range tables proven to move presentation only, per-toggle behaviour, range validation, and the Draft to Activate lifecycle |
| `tests/summary-rtr-privacy.test.ts` | 17 | The Summary consumes signal 4.1's landlord-safe finding instead of building its own ratio sentence; the rent-to-income ratio is its own disclosure setting, off by default; the internal view keeps the full ratio; and the single shared Income Group table places every tenant |
| `tests/landlord-income-disclosure.test.ts` | 24 | The landlord income-disclosure policy and the Income Group wording: no income, EMI or candidate reaches Tanish's report, the internal view keeps everything, 4.4 follows the resolved frequency in all four states, one switch discloses one fact, and the Yashraj regression |
| `tests/rent-band-boundaries.test.ts` | 28 | Rent Affordability boundary semantics: every band declares both bounds, the twelve required boundary values map to exactly one band, a dense 0-200%% sweep, validation rejects an ambiguous table, and the Yashraj / Tanish outcomes are unchanged |
| `tests/api-integration.test.ts` | 68 | **The live Prefill → CIBIL integration.** Canonical mobile normalisation across six spellings and five rejections; the Prefill request carrying the mobile number and nothing else; the Prefill → CIBIL mapping proven against all four real sample payloads with the path each value came from; the CIBIL request built entirely from the Prefill response; consent as a configured constant; a missing PAN / name / gender each named and stopping the pipeline with Prefill still reported as having succeeded; 400/401/403/404/429/5xx, malformed bodies, network errors and timeouts attributed to the correct provider in both directions; a missing credential reported as configuration rather than authentication; unreached stages reported as unreached; an API-sourced payload producing a byte-identical normalised record and identical 28 signals to the uploaded one for all four tenants; and no credential or raw provider field reaching the landlord report |
| `tests/rent-capacity.test.ts` | 51 | **Signal 4.2 as a quantitative output.** The capacity rate and the obligations switch as configuration; the four worked examples (₹50,000 → ₹35,000, ₹1,00,000 → ₹70,000, ₹1,50,000 → ₹1,05,000, ₹2,00,000 → ₹1,40,000); an unknown income reported as unknown rather than zero; EMI of null / 0 / −1 / 2,400 / 30,964 / 999,999 all changing nothing, proven again end to end on Tanish's payload with the income basis pinned so only the obligation figure varies; 4.2 never returning Good / Moderate / Low while 4.1 always returns a configured band; the capacity percentage moving 4.2 alone and the affordability ceiling moving 4.1 alone; MODE A pinning the v42 capacity rule; and the `reportData.rentCapacity` contract withholding the exact income and the unrounded result while the internal trace keeps all four figures |
| `tests/rent-affordability-finding.test.ts` | 17 | Signal 4.1: the finding follows the matched RTR band across all five bands and the missing-income path, Tanish at 51.63%, the Yashraj wording held unchanged, administrator-edited band wording, the fallback template, and threshold top-up for a stored configuration |
| `tests/tanish-emi-inference.test.ts` | 21 | The real Tanish dataset end to end: EMI derived from the live account records (closed loans excluded, `-1` sentinels rejected), the annual-monthly candidate, the inference firing at medium confidence, ₹77,467 as the assessable monthly income, the full priority order on real data, and no leakage of the mechanics |
| `tests/office-footprint.test.ts` | 10 | Signal 4.13 Office Footprint: named offices, a single office, a non-zero count with no location labels, blank labels, zero offices, the never-empty/never-`.` invariant across all 28 findings for both Yashraj modes and the sample tenant, and the untouched threshold table |
| `tests/income-frequency-inference.test.ts` | 35 | The EMI-based income-frequency inference: the four-level priority, the EMI check and its inconclusive cases, monthly normalization including daily, the conditional treatment of an inferred basis, the landlord privacy scan, and the cross-tenant / no-collateral-change checks |
| `tests/report-integrity.test.ts` | 45 | Configuration-snapshot consistency (report score, configuration id and version must equal the assessment's; the published ten weights must equal the ones used and total 100%) and the unresolved-placeholder scan across reportData, the landlord report, the rendered text and the drawn PDF text, plus the configurable City Stability region wording |
| `tests/report-v42.test.ts` | 44 | The v42 landlord report: the 28 detailed signals, the report data contract, the ten weighted scoring parameters, all 26 required scenarios, schema migration to v3 and the report PDF |
| `tests/derivation.test.ts` | 56 | The per-parameter derivation layer: card completeness, the seven documented parameters, editing, visibility, missing-data treatments, reset-to-default, validation, schema migration and rule-block top-up |
| `tests/source-recency.test.ts` | 49 | **Test 13 — the source-date policy.** Which row dates qualify and which are excluded and why; the 0/1/180/181/540/541-day boundaries; missing, malformed, impossible and pre-2000 dates discarded; a future date never producing a negative age; combination across sources with order-independence and a per-source breakdown; 4.21 consuming full, half and no recency points; the `stale_source` exception firing at the configured `staleAfterDays` rather than a hard-coded 365; landlord privacy over every mechanic; and the four-tenant plus MODE A / MODE B regression |
| `tests/red-flag.test.ts` | 92 | **Test 13 — the red-flag policy.** The configuration surface and its validation; the 0/1/11/12/13/24-month lookback with stated boundary semantics and a configurable window; each event type on its own and the configured precedence choosing one leading reason; account-level flags dated from their own evidence and never from `dateReported`; missing income, missing history, a missing bureau record and an old event all refusing to trigger; one override per parameter however many events; **the configured band always winning — applied where it lowers a score AND where it raises one, since Payment Discipline's adverse band scores below the Low band**; a band resolved from the signal's own table or the shared red-flag bands; a parameter whose source is unavailable staying excluded; the ORA arithmetic reconciling with no hidden penalty; the evidence surviving beneath both override layers with the normal result on the trace; the policy switching off restoring every evidence-only result; editing or retargeting the band moving the final result; exception and override as separate switches; and the landlord notice with its disclosure switches |

The derivation tests are documented in full in
**[parameter-derivation.md](parameter-derivation.md)**.

---

## The required cases from the specification

### Section 13 — core unit tests

| # | Requirement | Test |
| --- | --- | --- |
| 1 | PAN masking | `masking.test.ts` → "keeps the first two and last three characters", "uses a fixed-width mask", "never returns the raw PAN" |
| 2 | Phone masking | `masking.test.ts` → "keeps only the last four digits", "strips formatting before masking" |
| 3 | CKYC masking | `masking.test.ts` → "keeps only the last four digits", "handles short values without leaking" |
| 4 | Missing income frequency | `rent-and-income.test.ts` → "never assumes an unstated income figure is monthly", "returns the configured missing-data result when the frequency is unknown" |
| 5 | Missing rent | `rent-and-income.test.ts` → "returns Insufficient Data when no proposed rent is entered" |
| 6 | CIBIL score bands | `scoring.test.ts` → "maps every documented band correctly" (9 boundary values) |
| 7 | Clean payment history | `scoring.test.ts` → "rates clean reported history highly" |
| 8 | Default flags | `scoring.test.ts` → "flags adverse reported history", "creates an exception for a wilful default and forces a manual review" |
| 9 | Rent-to-income calculations | `rent-and-income.test.ts` → six parameterised cases from 12.5% to 66.7% |
| 10 | Overall score calculation | `scoring.test.ts` → "changing a weight changes the overall internal score", "maps internal scores to the configured overall bands" |
| 11 | Landlord report privacy filtering | `privacy.test.ts` → the 11 "Landlord report privacy filter" tests |

### Section 16O — configuration tests

| # | Requirement | Test |
| --- | --- | --- |
| 1 | CIBIL 680–719 returns Fair under the default configuration | `scoring.test.ts` → "returns Fair for 680-719 under the default configuration" |
| 2 | CIBIL 680–719 returns Good after an admin changes the rule | `scoring.test.ts` → "returns Good for 680-719 after an administrator edits the rule" |
| 3 | Weight changes affect the overall score | `scoring.test.ts` → "changing a weight changes the overall internal score", "a zero-weight category does not contribute" |
| 4 | Weight totals must equal 100% | `configuration.test.ts` → "rejects weights that do not total 100%" |
| 5 | Overlapping ranges are rejected | `configuration.test.ts` → "rejects overlapping numeric ranges" (plus "warns about gaps" and "rejects a minimum greater than a maximum") |
| 6 | Missing income frequency returns the configured result | `rent-and-income.test.ts` → "honours an administrator changing the unknown-frequency outcome" |
| 7 | Missing rent returns Insufficient Data or the configured result | `rent-and-income.test.ts` → "uses the configured result once an administrator changes it" |
| 8 | Wilful default creates an exception | `scoring.test.ts` → "creates an exception for a wilful default and forces a manual review" |
| 9 | Ordinary loan presence does not create an exception | `scoring.test.ts` → "does not create an exception for ordinary loans, cards, EMIs or enquiries" |
| 10 | Landlord report does not expose salary | `privacy.test.ts` → "does not expose the salary or income amount" |
| 11 | Landlord report does not expose the CIBIL score | `privacy.test.ts` → "does not expose the CIBIL score" |
| 12 | Landlord report does not expose EMI | `privacy.test.ts` → "does not expose EMI, balances, limits or utilisation" |
| 13 | Landlord report does not expose account details | `privacy.test.ts` → "does not expose account-level detail" |
| 14 | Configuration version is saved with every report | `privacy.test.ts` → "stores the configuration version used for the report" |
| 15 | Configuration comparison shows category changes | `configuration.test.ts` → "shows the category change caused by editing a CIBIL band" |
| 16 | Reset-to-default restores the original rules | `configuration.test.ts` → "restores the original rules with reset-to-default" |
| 17 | Archived configurations cannot be used for new reports | `configuration.test.ts` → "refuses to activate an archived configuration" |
| 18 | Only one configuration can be active | `configuration.test.ts` → "only ever has one active configuration", "requires exactly one active configuration" |
| 19 | Rating labels update everywhere after activation | `configuration.test.ts` → "propagates a renamed label everywhere after activation", "keeps internal identifiers separate from display wording" |
| 20 | PDF output follows the active landlord display rules | `pdf.test.ts` → "picks up an administrator's wording and branding changes", "prints the numeric score only when the configuration enables it" |

---

## Additional coverage beyond the specification

**Parsing resilience** — markdown fences, JSON embedded in prose, unreadable
content, report-type detection, a bureau score pulled from free text.

**Normalisation** — ISO / `DD/MM/YYYY` / `DD-MM-YYYY` / "16 September 2026"
dates, `₹1,05,000` formatting, dot paths with `.length`, a completely different
flat payload shape (`applicant_name`, `contact_number`, `corporate_email`,
`company_name`), nulls, empty strings and duplicate values, and the
no-input case where nothing may be invented.

**Privacy depth** — masking assertions on the profile, the plain-text copy
output, a tampered report failing the scan, the numeric score staying hidden
unless enabled, raw uploads never appearing, and the PDF builder refusing a
tampered report.

**Presets** — all ten presets produce a coherent 19-row assessment with a score
in range; the adverse preset forces a manual review; the missing-income preset
returns *Requires Verification* rather than a confident result; the
new-to-credit preset returns *Insufficient Data* rather than a low rating; the
high-rent preset flags affordability without claiming a default.

**Language** — the sample report is asserted never to contain "guaranteed
tenant", "guaranteed rent", "zero risk", "no criminal record", "financially
secure" or "defaulter-free", and every category rating is checked against the
list of approved rating labels.

**Report shape** — all 19 categories present, in the specified order, with the
documented headline values (Overall **VERY GOOD**, Rental Assessment **GOOD —
SUBJECT TO STANDARD VERIFICATION**, Exception Flags **None Reported**) and the
documented masked profile.

---

## Determinism

`tests/helpers.ts` pins "today" to `2026-09-17T10:00:00.000Z` so report-age
scoring and the derived credit file age never drift. The sample payloads are
fixed files in `samples/`.
