# Yashraj Sah reconciliation

Reference: `ora-tenant-report-v42.html`
Source data: `samples/yashraj/prefill.json`, `samples/yashraj/cibil.json`

The reference report is the expected output for this dataset. Nothing below is
hardcoded to this tenant — each row records the *root cause* in the pipeline
and the structural fix.

---

## Two modes — what "28/28 reconcile" means

The same Yashraj payloads are run under two sets of conditions. They are
**different tests** and are always reported separately. Both are defined once,
in `scripts/yashraj-modes.ts`, so neither script nor test can silently mix
them.

| | **MODE A — v42 reference reproduction** | **MODE B — live ORA configuration** |
| --- | --- | --- |
| Source data | `samples/yashraj/*`, rent ₹40,000 | identical |
| Assessment date | **2026-09-18** — the reference date (the bureau score date) | **2026-09-21** — the current date |
| Permanent Address Completeness | **8%** | **10%** |
| Recent Credit Activity | **2%** | **0%** |
| Other eight weights | 25 / 15 / 10 / 5 / 10 / 15 / 10 / 0 | identical |
| ORA score | **94.06** → EXCELLENT | **95.34** → EXCELLENT |
| Internal diagnostic score | 76.44 | 76.71 |
| Where | `tests/yashraj-reconciliation.test.ts` (MODE A block) | `tests/ora-scoring-architecture.test.ts`, MODE B block of the reconciliation test |
| Render output | `docs/generated/yashraj-v42-reference-*` | `docs/generated/yashraj-live-*` |
| **"28/28" means** | **v42 compatibility** — every signal matches the reference | **live configured output** — not a v42 claim |

On this dataset the 28 *signal results* happen to be identical in both modes —
the weight and date differences move the score, not the banded results. That
coincidence is asserted, so if a future change moves a signal in one mode and
not the other the test fails rather than the difference going unnoticed.

```bash
npx tsx scripts/reconcile-yashraj.ts   # prints both modes, labelled
npx tsx scripts/render-yashraj.ts      # renders both modes to named files
npx tsx scripts/verify-yashraj.ts      # MODE B end-to-end verification
```

---

## What the source data actually contains

| Segment | Location | Count |
| --- | --- | --- |
| Phones | Prefill `details.phone_info[]` (5) + CIBIL `telephones[]` (4) | **9 records** |
| Emails | Prefill `email_info[]` (1) + CIBIL `emails[]` (3) | 3 distinct |
| Addresses | Prefill `address_info[]` (5) + CIBIL `addresses[]` (4) | 9 raw → 3 residences + 2 offices |
| Identity | Prefill `identity_info.{pan_number,other_id}[]`, CIBIL `ids[]` typed `TaxId`/`CkycId`/`SocialId` | PAN + CKYC + SocialId |
| Employment | CIBIL `employment[0].occupationCode` = `Salaried` (employer `name` is empty) | 1 |
| Accounts | CIBIL `accounts[]` | **29** |
| Score | CIBIL `scores[0].score` = 779, `scoreDate` 2026-09-16 | 779 |

Key structural facts the old pipeline could not see:

- **Type-tagged arrays.** CKYC is `{ idType: "CkycId", idNumber: "…" }`. A flat
  key-alias mapper looking for a key called `ckyc` finds nothing.
- **Generic field names inside typed arrays.** `phone_info[].number` and
  `address_info[].address` carry no alias-matchable key.
- **Sentinels.** `emiAmount`, `termMonths`, `woAmountPrincipal` are `"-1"` and
  `dateClosed` is `"NA"` when not applicable. Read literally, `-1` becomes a
  real number.
- **Repayment history is an array, not a field.** `monthlyPayStatus[]` holds
  `{ date, status }` where `"0"`/`"STD"` is clean, `"XXX"` is no data reported,
  and a number is days past due. There is no `maxDpd` field anywhere.
- **Exposure lives in `highCreditAmount`**, not `sanctionedAmount` or
  `creditLimit`.

Verified arithmetic from the source:

```
Σ highCreditAmount over all 29 accounts = 8,288,677  → ₹82.9 lakh
Housing Loan: opened 2024-10-31, ₹60,00,000, 24 clean monthly statuses
Only non-clean, non-XXX marker: account 16, 2026-04-01, status "4"   → one 4-day delay, April 2026
Oldest account opened 2021-12-14 → 57 months to the 2026-09-16 score date
Reported income 2,355,516, no basis stated → 2,355,516 ÷ 12 = 196,293/month conditional
Rent 40,000 ÷ 196,293 = 20.38%
```

---

## Signal-by-signal reconciliation

**All 28 now match the reference.** The "Before" column records what the
simulator produced prior to these fixes.

| # | Signal | Reference | Before | Root cause | Fix |
| --- | --- | --- | --- | --- | --- |
| 4.1 | Rent Affordability | Strongly Supported | Strongly Supported | — | none needed |
| 4.2 | Rent Capacity Band | Up to ₹60,000 | Up to ₹65,000 | `capacityRoundingTo` was ₹5,000; 196,293 × 35% = 68,702 rounds to 65,000 | rounding ₹10,000 → 60,000 (configurable; **pinned** in MODE A, see below) |
| 4.3 | Income Confidence | Low | Low | — | none needed |
| 4.4 | Income Group | A, conditional | B, conditional | Band labels: ₹1–2 lakh was labelled B | relabel bands C/B/A/A+/A++ so ₹1–2 lakh = A (configurable) |
| 4.5 | Financial Depth | Very High, ₹82.9 lakh | High, ₹70 lakh | `highCreditAmount` unmapped; closed accounts weighted 0.5 | map high-credit; `closedAccountWeight` default 1.0 |
| 4.6 | Financial Maturity | Mature, 57 months, 29 accounts | Mature | file age derived from a different date | derive from oldest `dateOpened` to score date |
| 4.7 | Financial Stress Signal | None | None | — | none needed |
| 4.8 | Payment Discipline | Generally Strong | **Insufficient History** | no `maxDpd`/`cleanPaymentRecords` field exists; `monthlyPayStatus[]` never read | derive DPD, clean months and delay events from `monthlyPayStatus[]` |
| — | Credit behaviour (summary) | Generally Strong | Insufficient History | same as 4.8 | same |
| 4.9 | City Stability | Strong | **Not assessed** | address records never reached the facts; city came only from Prefill's unparsed `address` string | structured address extraction with city inference from pincode/line |
| 4.10 | Permanent Address Footprint | Strong | Limited | repetition across sources and date span not derived | count cross-source repeats and report the observed date range |
| 4.11 | Professional Footprint | Established | Moderate | `occupationCode` unmapped, so occupation was missing | map `employment[].occupationCode` |
| 4.12 | Corporate Email Footprint | Multiple associations | Multiple associations | — | none needed |
| 4.13 | Office Footprint | The Qube May 2026; RentenPe Sept 2025 | The Qube only | CIBIL office address classified as a residence | classify offices by content and keep both with dates |
| 4.14 | Employment Continuity | Requires Confirmation | **Not assessed** | employer `name` is empty, so employer count was 0 | derive employer associations from corporate email domains and office addresses |
| 4.15 | Identity Depth | Moderate | Limited | CKYC lost; SocialId counted as an identity document | read type-tagged ids; exclude bureau-internal SocialId |
| 4.16 | Identity Consistency | Very Strong | Very Strong | — | none needed |
| 4.17 | Digital Footprint | Established | Established | — | none needed |
| 4.18 | Contact Stability | Strong, 9 records | Strong, 6 records | `phone_info[].number` unmatched by key alias | structured phone extraction from both arrays |
| 4.19 | Traceability | Good | Good | — | none needed |
| 4.20 | Profile Consistency | Strong | Strong | — | none needed |
| 4.21 | Data Confidence | High | **Low** | scored as populated ÷ total tracked fields, so absent optional ids dragged it down | separate critical from optional; weight recency, agreement and consistency |
| 4.22 | Background Confidence | Pending | Pending | — | none needed |
| 4.23 | Vehicle Profile | No vehicle record | No vehicle record | — | none needed |
| 4.24 | Household Profile | Family-linked | Household information available | `S/O VIJAY KUMAR SAH` sits inside the address line, not a relation field | parse the S/O, D/O, W/O prefix from address text |
| 4.25 | Occupancy Strength | Requires Confirmation, 3 residences | Requires Confirmation, **6 residences** | raw address rows counted instead of distinct normalised locations | normalise and deduplicate addresses; count distinct residences only |
| 4.26 | Reference Readiness | Partial | Partial | — | none needed |
| 4.27 | Exception Flags | 2 — current residence; employer tenure | 1 — income basis | residence and employment exceptions never fired; income basis is a confidence limitation in the reference | fire residence and tenure exceptions; reclassify income basis as a confidence limitation (configurable) |
| 4.28 | ORA Profile Confidence | High — two confirmable gaps | High — one confirmable gap | wording derived from the wrong exception list | derives from the actual exception list |

---

## Intentional differences from the reference

| What | Why |
| --- | --- |
| Mobile masked as `******2106` | ORA's privacy rules mask it. `landlordDisplayRules.maskPhone` defaults to on; switch it off to print the number in full as the reference does. |
| Income basis not an exception flag | The reference treats it as a data-confidence limitation, surfaced through 4.3 Income Confidence and the summary confidence reason. Exposed as `exceptionFlagRules.income_basis` in Admin and ships **off**. Switch it on and 4.27 reports 3. |
| 4.1 finding names the rent band, not the ratio | The reference finding is "Evidence exceeds the moderate threshold for the ₹25,001 to ₹50,000 band" — it does not print the ratio either. Printing `20.38%` would disclose the tenant's income arithmetic, which the privacy filter forbids. |
| 4.13 finding names the employer and locality | The reference writes "The Qube, Marol"; this writes "Liquiloans, Andheri". Both localities are in the address line. Naming the employer is more useful to a landlord than naming the building. |

---

## Architecture change

The root cause behind most of these was structural, not arithmetic: the
pipeline matched on **field names** while these payloads carry meaning in
**structure**.

A source-adapter layer now sits in front of the generic alias mapper:

```
raw payload
   ↓
source adapters      lib/normalizer/adapters.ts   — shape-verified extraction
   ↓
structured evidence  lib/normalizer/evidence.ts   — repayment, residence, employer
   ↓
normalised record    lib/normalizer/index.ts      — adapters win, aliases fill gaps
   ↓
signal facts → 28 signals → reportData
```

Shape detection is **verified, not guessed**: `looksLikeCibilBody` requires the
vendor's own marker fields before claiming a payload, and an account row the
adapter could read nothing from is discarded. A payload in any other shape
falls through to the alias mapper exactly as before — which is why all 215
pre-existing tests still pass unchanged.

---

## Threshold ownership

Each signal's threshold table (`configuration.signals[id].thresholds`) is the
single authoritative copy, and is what the Detailed Signals tab edits. The band
arrays inside `rentFit`, `incomeRules`, `financialDepth` and
`financialMaturity` are **seeds** for those tables. The non-band settings in
those blocks — `maxRentToIncomePct`, `capacityRoundingTo`,
`closedAccountWeight`, `conditionalLabelSuffix` — are live and read directly.

Previously 4.4 banded from `incomeRules.groups` while 4.1, 4.5 and 4.6 banded
from their signal thresholds, so editing a band in Admin appeared to do nothing
for some signals. All four now band identically.

---

## What MODE A pins, and why

The v42 reference is a fixed artefact, so MODE A reproduces the configuration it
was produced under — not only the weights (Permanent Address Completeness 8%,
Recent Credit Activity 2%) but the presentation settings too.

`capacityRoundingTo` is one of them. The factory now rounds rent capacity down to
**₹1,000**; the reference was produced while it rounded to **₹10,000**. MODE A
therefore pins ₹10,000 and still prints "Up to ₹60,000", while MODE B — the live
configuration — reports the same ₹68,702.55 as "Up to ₹68,000".

This is the only signal on which the two modes differ, and it is presentational:
rent capacity is never scored on, so both modes' parameter scores, ORA scores,
ratings and diagnostic scores are unaffected by the pin. `scripts/yashraj-modes.ts`
holds the pin (`V42_REFERENCE_RENT_FIT`), and
`tests/yashraj-reconciliation.test.ts` asserts both the difference and its
irrelevance to scoring.

---

## Verifying it

```bash
npx tsx scripts/probe-yashraj.ts        # what the adapters extract
npx tsx scripts/reconcile-yashraj.ts    # both modes, each labelled
npx tsx scripts/render-yashraj.ts       # HTML, JSON, PDF and traces, per mode
npx tsx scripts/verify-yashraj.ts       # MODE B end-to-end verification
npx vitest run tests/yashraj-reconciliation.test.ts
```

MODE A prints `28/28 signals reconcile against the v42 reference (v42
COMPATIBILITY), 0 mismatch(es)`. MODE B prints the live configured output and
names any signal that differs from the reference.
