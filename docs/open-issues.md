# Open issues

Defects and business-rule ambiguities found during testing that are **not yet
fixed**, recorded here so they are not rediscovered from scratch. Each entry
names how to reproduce it and what a fix would touch.

Closed items are moved out of this file, not struck through.

**Closed in the Test 8 remediation:** write-off and settlement propagation, the
SUB/DBT/LSS classification, and the adverse override that changed the result
but not the score. Adverse credit is now normalised into
`credit.adverseClassifications` and resolves to the band named by
`creditRules.adverseClassification.paymentDisciplineBandId`, which supplies the
result, score, status and confidence together. See
`tests/adverse-classification.test.ts`.

**Closed in the Test 9 remediation:** portfolio totals resolving an
account-level alias. Credit limit, balance, overdue and utilisation are now
canonical metrics on `credit.portfolio`, each carrying its provenance; a
card's `cash_limit` is normalised separately and is never a credit limit. See
`tests/portfolio-aggregation.test.ts`.

**Closed in the Test 11 remediation:** the employer counted three times, the
office label taken from a landmark, and the email listed twice. Employers are
now normalised to one identity per employer with every evidence route kept;
see `tests/employer-normalization.test.ts`.

**Closed in the Test 13 remediation:** the recency dimension that never
received an input (item 5 below, now removed). `meta.reportAgeDays` is derived
by the configured source-date policy in `src/lib/normalizer/sourceDates.ts`:
the latest qualifying row date across every source, order-independent, never
negative and never guessed. The `stale_source` exception was also firing on a
hard-coded 365 days and now uses the configured `staleAfterDays`. See
`tests/source-recency.test.ts`.

**Measured effect of that change**, which is a re-baselining rather than a
defect:

| tenant | age | 4.21 raw | diagnostic | ORA |
| --- | ---: | --- | --- | ---: |
| tanish | 5 days | 81 → 96 | 79.34 → **79.62** | 77.29, unchanged |
| yashraj | 5 days | 81 → 96 | 76.71 → **76.99** | 95.34, unchanged |
| thin-file | 3 days | 82 → 97 | 80.15 → **80.61** | 82.30, unchanged |
| established-clean | 3 days | 82 → 97 | 85.09 → **85.56** | 93.44, unchanged |
| **MODE A (v42)** | unknown | 81, unchanged | 76.44, unchanged | 94.06, unchanged |

No ORA score moves: 4.21 was already in its top band, so the Data Confidence
parameter stays at 100. Every **diagnostic** score moves, because
`meta.lastReportedDate` stops being a missing field and `completenessPct` rises.
MODE A is pinned to `sourceRecency.enabled = false` — v42 had no recency
behaviour, so reproducing the reference means reproducing that — and keeps
94.06 / 76.44 / 28-of-28.

---

## 1. Payment Discipline confidence ignores evidence depth

**Found in** Test 7.

`signals.payment_discipline` carries a fixed `confidence: "High"` on every
threshold, so seven months of clean markers and seven years of them are reported
with identical confidence. The *result* is right in both cases, and the depth of
the evidence is measured — the `clean_payment_records` rule bands 11 markers as
`clean_6_11` → GOOD rather than EXCELLENT — but that measurement does not reach
the confidence the landlord sees.

**Decision needed:** should 4.8's confidence follow the depth band?

---

## 2. Two readings of the same absent adverse-event indicator

**Found in** Test 7. **Uniform across all three tenants.**

CIBIL returns `-1` sentinels for write-off, settlement, restructuring and
suit-filed amounts when nothing is reported. Two parts of the engine read that
differently:

- **4.7 Financial Stress Signal** treats it as *no adverse event* → result
  **None**.
- The `default_history` data-point rules treat it as MISSING →
  `PENDING_VERIFICATION` (62 each), pulling the category to 65.29.

Diagnostic-only, so no ORA score is affected. Worth reconciling: if the bureau
reporting no write-off is a positive fact for 4.7, it is a positive fact for the
category too.

---

## 3. Two credit-score ranges share one label

**Found in** the V10 landlord-ranges work.

`landlordRanges.creditScore` labels both 650–699 and 700–759 "Good", so the
landlord cannot tell the two apart from the label alone. Presentation-only and
fully configurable; needs a business decision on the wording.

---

## 4. ~~4.2 prints a policy constant that reads like a tenant figure~~ CLOSED

**Found in** the V10 landlord-ranges work. **Closed in the 4.2 rework.**

4.2's finding opened "Comfortable ceiling at 35% of assessable income", and
that 35 was `rentFit.maxRentToIncomePct` — a policy constant, not this tenant's
ratio, and easy to misread as a disclosure about them.

4.2 is now a quantitative output and leads with the amount: *"Can support rent
up to ₹54,200/month."* It reads its own `rentFit.capacityPercentage` rather
than 4.1's ceiling, and names no percentage at all. See
`tests/rent-capacity.test.ts`.

---

## 5. 4.28 ORA Profile Confidence is composed in code, not in configuration

**Found in** Test 12. **Carried forward through Test 13 deliberately.**

4.21 Data Confidence is fully configurable — every point, penalty and boundary
comes from `confidenceRules.dataConfidence`. 4.28 is not: its composition is
written into the resolver as

```
50 base / +15 identity / +10 completeness / +8 no conflict / +8 file age
         / +8 income basis / +6 cross-source  −5 per exception
```

Nothing there is editable, so an administrator who moves a 4.21 weight sees
4.28 ignore them. Test 13 touched 4.28 only through the exception count — the
red-flag exception costs the same −5 as any other — and did not restructure it.

**A fix would** move those terms into a configured block alongside
`dataConfidence` and re-derive the resolver from it. It re-baselines nothing by
itself if the seeded values match the current constants.

---

## 6. Only two source systems exist, so three-source corroboration is untestable

**Found in** Test 12. **Carried forward.**

The simulator has exactly two sources, Prefill and CIBIL. `pointsPerSource` is
10 with `maxSourcePoints` 20, so the third-source term can never be reached and
genuine three-way corroboration cannot be exercised. Repetition *inside* a
source is already correctly refused as independent corroboration
(`tests/evidence-confidence.test.ts`). No fix is possible without a third
source; inventing one would prove nothing.

---

## 7. The alias scan reads envelope fields before nested source rows

**Found in** Test 12. **Documented, not a defect.**

`findByAliases` walks the flattened payload in order, so an envelope-level
field is reached before a nested row carrying the same alias. It is
deterministic and order-independent for a given payload shape, and the
structure-aware adapters take precedence over it wherever they recognise the
payload. Recorded so it is not rediscovered as a bug.

---

## 8. A dimension rating is truncated mid-word in the PDF

**Found in** Test 7. **Also present in** the Test 4 PDFs.

The landlord PDF's summary table truncates the rating column without an
ellipsis: *"Salaried, employer to con"*, *"Household information ava"*. Column
width, not content.

