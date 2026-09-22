# Scoring logic

How the ORA Tenant Assessment Simulator turns two vendor payloads and a rent
figure into a rating — and why nothing in that path is hardcoded.

---

## The contract

```ts
calculateAssessment(
  normalizedTenantData: NormalizedTenantData,
  configuration: ScoringConfiguration,
  options: { proposedMonthlyRent, simulationId, inputHash, now },
): OverallAssessment
```

`src/lib/scoring/engine.ts` contains no CIBIL band, no weight, no rent
threshold, no rating label and no landlord sentence. Every one of those comes
from the `configuration` argument, which is a plain object the admin screen
edits. Swap the configuration and the same tenant data produces a different
report, with no code change.

---

## The pipeline

```
raw upload
   │  parseJsonInput            (lib/parser)
   ▼
PrefillReport / CibilReport
   │  normalizeTenantData       (lib/normalizer)
   ▼
NormalizedTenantData           ← applyOverrides (simulation panel) folded in here
   │  buildScoringFacts
   ▼
ScoringFacts                   ← adds derived values
   │  calculateAssessment       (lib/scoring/engine)
   ▼
OverallAssessment
   │  buildSafeTenantProfile + buildSafeAssessment   (lib/report/privacy)
   ▼
SafeTenantProfile + SafeAssessment    ← the privacy boundary
   │  createLandlordReport      (lib/report/landlord)
   ▼
LandlordReport → screen, print, PDF, JSON, clipboard
```

The internal report branches off before the privacy filter and keeps
everything.

---

## Step 1 — Normalisation

`normalizeTenantData` flattens every nested object and array into
`{ path, key, normalisedKey, value }` entries, then resolves each target field
through an alias list (exact key match first, then a substring pass that
catches vendor prefixes like `applicant_pan_number`).

It also:

- reconciles name, date of birth and mobile across the two sources, recording a
  `DataConflict` for each disagreement;
- collects every address-shaped node, de-duplicates them, and scores each one's
  completeness;
- collects every account-shaped node from the bureau payload;
- derives totals (outstanding, EMI, limits, utilisation, worst DPD, overdue
  count, credit file age) from account rows when the payload has no summary;
- computes `meta.completenessPct`, `meta.missingFields`,
  `meta.criticalMissingFields`, `meta.conflicts`, `meta.unmappedFields` and
  `meta.reportAgeDays`;
- builds two composite indices — `standardOfLivingIndex` (address quality,
  employment type, corporate email, vehicles) and `tenantReadinessIndex` (PAN,
  CKYC, document verification, contact channel coverage).

### Income frequency

```ts
function deriveMonthlyIncome(income, frequency) {
  switch (frequency) {
    case "monthly": return income;
    case "annual":  return income / 12;
    case "weekly":  return (income * 52) / 12;
    default:        return null;   // never assume
  }
}
```

The frequency is only "known" when the source states it, or when the field name
itself carries the basis (`monthly_income`, `annual_income`). Otherwise it is
`unknown` and no monthly figure exists.

### Verification

`documentVerified`, `income.verified`, `employment.verified`,
`address.verified` and `contact.contactVerified` all default to `false`. The
presence of a document is never read as verification of it.

---

## Step 2 — Facts

`buildScoringFacts` returns `NormalizedTenantData` plus a `derived` block:

| Fact | Meaning |
| --- | --- |
| `derived.proposedMonthlyRent` | The effective rent (override wins over the wizard) |
| `derived.rentToIncomeRatio` | `rent / monthlyIncome × 100`, or `null` |
| `derived.debtToIncomeRatio` | `totalEmi / monthlyIncome × 100`, or `null` |
| `derived.rentPlusObligationsRatio` | The two added, when obligations are considered |
| `derived.incomeFrequencyKnown` | `frequency !== "unknown"` |
| `derived.panAvailable` / `ckycAvailable` / `emailAvailable` / `officeEmailAvailable` / `mobileAvailable` | Presence checks |
| `derived.creditFileAgeMonths` | Months since the oldest reported account |
| `derived.creditAccountCount` | Total reported accounts |
| `derived.seriousDelinquency` | DPD ≥ 90, or a write-off, or a suit-filed status |

Every data-point rule's `sourceField` is a dot path into this object —
`credit.score`, `derived.rentToIncomeRatio`, `meta.conflicts.length`.

---

## Step 3 — Data points

A rule looks like this:

```json
{
  "id": "cibil_score",
  "name": "CIBIL score",
  "category": "credit_appetite",
  "sourceField": "credit.score",
  "dataType": "number",
  "weightWithinCategory": 3,
  "bands": [
    { "id": "cibil_780_900", "condition": "range", "min": 780, "max": 900, "rating": "EXCELLENT",  "score": 100 },
    { "id": "cibil_750_779", "condition": "range", "min": 750, "max": 779, "rating": "VERY_GOOD",  "score": 85  },
    { "id": "cibil_720_749", "condition": "range", "min": 720, "max": 749, "rating": "GOOD",       "score": 75  },
    { "id": "cibil_680_719", "condition": "range", "min": 680, "max": 719, "rating": "FAIR",       "score": 65  },
    { "id": "cibil_650_679", "condition": "range", "min": 650, "max": 679, "rating": "FAIR",       "score": 55  },
    { "id": "cibil_300_649", "condition": "range", "min": 300, "max": 649, "rating": "FAIR",       "score": 40  }
  ],
  "missingDataRating": "INSUFFICIENT_DATA",
  "landlordLabel": "Credit behaviour band",
  "landlordExplanation": "Overall credit behaviour band. The numeric score is not disclosed.",
  "visibleInLandlordMode": false,
  "createsExceptionFlag": false,
  "enabled": true,
  "priority": 100
}
```

Evaluation:

1. Resolve `sourceField` against the facts.
2. If the value is `null`, `undefined`, `""` or `NaN` → the rule is **missing**
   and takes `missingDataRating` (with that label's score, or an explicit
   `missingDataScore`).
3. Otherwise match the first band whose condition holds. Conditions are
   `range`, `equals`, `present`, `absent`, `isTrue`, `isFalse`, `contains` and
   `always`.
4. If no band matches → `noMatchRating`.
5. The result carries the rating, the 0-100 score, the weight, the raw value
   (admin only) and a reason code.

A matched band may name an `exceptionRuleId`, which raises that exception.

There are 63 data-point rules across 16 scored categories, covering every item
in section 16D of the specification: identity and KYC, payment discipline,
default history, credit behaviour, income capacity, employment, address,
contact, vehicle footprint, standard of living, tenant readiness, legal
footprint and ORA data confidence.

---

## Step 4 — Categories

```
categoryScore = Σ(dataPointScore × dataPointWeight) / Σ(dataPointWeight)
categoryRating = firstBand(categoryScoreBands, categoryScore)
```

Default category bands: ≥90 Excellent, ≥75 Very Good, ≥60 Good, below 60 Fair.

Two things can override that:

**All data points missing.** The category takes its `allMissingRating` — e.g.
Credit Appetite becomes *Insufficient Data* rather than *Fair*, and Legal
Footprint becomes *None Reported*. Absence of data is never reported as a poor
result.

**A category override.** These are configuration entries, not code:

```json
{
  "id": "income_capacity_unknown_frequency",
  "categoryId": "income_capacity",
  "sourceField": "derived.incomeFrequencyKnown",
  "operator": "isFalse",
  "rating": "REQUIRES_VERIFICATION",
  "reason": "Income frequency is not available in the source data…",
  "enabled": true
}
```

Three ship by default: unknown income frequency and absent income both force
Income Capacity to *Requires Verification*; an absent bureau score forces Credit
Appetite to *Insufficient Data*.

---

## Step 5 — The ORA score and the overall ORA rating

The authoritative score. Full detail in **[two-scores.md](two-scores.md)**.

```
oraScore = Σ(parameterScore × topLevelWeight) / Σ(contributing topLevelWeight)
rating   = mapScoreToRating(oraScore, configuration.overallScoreBands)
```

The ten parameters and their weights live in
`configuration.scoringParameters`. A parameter whose source value is
unavailable drops out of both sums; a parameter with a 0% weight is still
evaluated, keeps its score and its trace, and contributes 0.

The bands: ≥90 Excellent, ≥75 Very Good, ≥60 Good, below 60 Fair. This is the
**only** rating-to-score mapping for the overall rating; exception rules may
override the resulting rating, and nothing else touches it.

The score is **admin-only** unless `landlordDisplayRules.showNumericScore` is
switched on.

---

## Step 5b — The internal diagnostic score

```
diagnosticScore = Σ(categoryScore × categoryWeight) / Σ(categoryWeight)
```

Only scored categories with a non-zero weight contribute. Derived rows
(Exception Flags, Overall Rent Score, Rent Affordability) are excluded.

**Diagnostic category score — does not determine the ORA Score.** It explains
which categories sit behind the parameters, and determines no rating, no rent
fit and none of the 28 landlord-facing signals. It is never shown to a
landlord. It lives under Internal Admin → Category diagnostics.

### Worked example — the sample tenant's diagnostic score

| Category | Rating | Score | Weight | Contribution |
| --- | --- | ---: | ---: | ---: |
| Income Capacity | Good | 70.88 | 10% | 7.09 |
| Payment Discipline | Excellent | 94.71 | 15% | 14.21 |
| Default History | Very Good | 88.57 | 15% | 13.29 |
| Employment Stability | Very Good | 81.71 | 10% | 8.17 |
| KYC Status | Very Good | 85.93 | 7.5% | 6.44 |
| Identity Confidence | Very Good | 86.40 | 7.5% | 6.48 |
| Address Stability | Very Good | 87.07 | 4% | 3.48 |
| Credit Appetite | Very Good | 87.31 | 15% | 13.10 |
| City Stability | Excellent | 90.00 | 3% | 2.70 |
| Permanent Address Footprint | Excellent | 90.00 | 3% | 2.70 |
| Contact Traceability | Very Good | 88.69 | 5% | 4.43 |
| ORA Data Confidence | Excellent | 95.31 | 5% | 4.77 |
| **Total** | | | **100%** | **86.86** |

86.86 is the internal diagnostic score. The overall rating is **not** derived
from it — see Step 5 above.

---

## Step 6 — Exceptions

Exception rules are evaluated against the facts independently of the weighted
score:

| Rule | Trigger | Severity | Effect |
| --- | --- | --- | --- |
| Wilful default | `credit.wilfulDefault` is true | critical | Blocks approval, forces *Requires Review* |
| Criminal / legal indicator | `legal.criminalIndicator` is true | critical | Blocks approval, forces *Requires Review* |
| Fraud indicator | `legal.fraudIndicator` is true | critical | Blocks approval, forces *Requires Review* |
| Serious identity mismatch | `identity.identityMismatch` is true | high | Forces *Requires Review* |
| Missing critical identity | `profile.name` absent | high | Forces *Requires Review* |
| Serious repayment issue | `credit.maxDpd ≥ 90` | high | Forces *Requires Review* |
| Missing proposed rent | `derived.proposedMonthlyRent` absent | low | Internal note only |
| Missing income frequency | `derived.incomeFrequencyKnown` is false | low | Internal note only |

**The overall rating never overrides a red flag.** If any rule with
`changesOverallRating` matches, the weighted result is replaced by that rule's
`overrideOverallRating` (*Requires Review* by default) and the reason is
recorded.

The **Exception Flags** row reads *None Reported* unless a high- or
critical-severity rule matched, in which case it reads *Requires Review*.

Ordinary loans, credit cards, EMIs, closed accounts, outstanding balances and
normal credit enquiries **do not** raise an exception. They are scored
internally under Credit Appetite and Payment Discipline and nothing more. A
test asserts this against the sample tenant, who has four accounts, an active
EMI, an outstanding balance and three enquiries — and zero exception flags.

---

## Step 7 — Rent affordability

Evaluated in this order, stopping at the first that applies:

1. No proposed rent → `rentRules.missingRentResult` (default *Insufficient
   Data*).
2. No income reported → `rentRules.missingIncomeResult` (default *Requires
   Verification*).
3. Income frequency unknown → `rentRules.unknownIncomeFrequencyResult` (default
   *Requires Verification*). **No monthly figure is assumed.**
4. `requireVerifiedIncome` is on and income is unverified → same as above.
5. Monthly income below `minimumMonthlyIncome` → *Requires Verification*.
6. Ratio above `maximumRentToIncomeRatio` → *Requires Verification*.
7. Otherwise match `ratioBands`.

Default bands:

| Rent-to-income | Rating |
| --- | --- |
| 0 – 25% | Excellent |
| above 25 – 35% | Very Good |
| above 35 – 45% | Good |
| above 45 – 50% | Fair |
| above 50% | Requires Verification |

`considerExistingObligations` is **off** by default, so the band uses the plain
`rent / monthly income` ratio from the specification. Turning it on adds the
reported debt-to-income ratio first. The debt-to-income ratio is always
calculated and always shown in the internal report.

Rent tiers (internal, hidden from the landlord by default):

| Tier | Range | Strength |
| --- | --- | --- |
| R1 | ₹0 – ₹25,000 | Limited |
| R2 | ₹25,001 – ₹50,000 | Moderate |
| R3 | ₹50,001 – ₹1,00,000 | Strong |
| R4 | above ₹1,00,000 | Very Strong / Requires Additional Verification |

The landlord sees wording, not a band id: the default wording for *Good* is
"GOOD — SUBJECT TO STANDARD VERIFICATION", and an admin can change it to
"GOOD — STANDARD VERIFICATION REQUIRED" without touching the internal value.

---

## Step 8 — The privacy filter

`buildSafeTenantProfile` produces seven masked strings. `buildSafeAssessment`
produces rating ids, landlord-visible exception messages and a verification
summary — and adds the numeric score only when the configuration allows it.

`createLandlordReport` receives those two objects plus the display rules. It
cannot reach the normalised data because it was never passed it.

`findSensitiveLeaks(report, secrets, allowKeys)` then walks the finished object:

- **keys** are matched against `RESTRICTED_KEY_PATTERNS` (income, salary, cibil,
  creditScore, emi, outstanding, creditLimit, utilisation, enquiries, dpd,
  account counts, internalScore, rawValue, normalized, parsedPrefill,
  parsedCibil, …), with camelCase companions so `monthlyIncome`, `totalEmi` and
  `maxDpd` are caught as well as their snake_case forms;
- **values** are matched against the tenant's actual figures, collected by
  `collectSecrets` — income, monthly income, bureau score, EMI, balances,
  limits, utilisation, enquiry count, raw PAN, raw CKYC, raw mobile and every
  account balance and EMI.

A separate, deliberately narrower `RESTRICTED_WORDING_PATTERNS` list is used by
the configuration validator against landlord-facing wording an admin types, so
a label may legitimately say "Income Capacity" but can never say "CIBIL 720+",
"salary", "EMI", "outstanding balance" or a rupee amount.

---

## Configuration validation

`validateConfiguration` implements section 16N and blocks activation on any
error:

- category weights total exactly 100%, and none is negative;
- every rating label has a display name, landlord wording and a 0-100 score;
- every band references a known rating label and has min ≤ max;
- numeric ranges do not overlap (error) and do not leave gaps (warning);
- every data point has a defined missing-data behaviour;
- every band's `exceptionRuleId` references a rule that exists;
- rent bands and rent tiers do not overlap, and open-ended bands come last;
- exception severities are one of low / medium / high / critical;
- landlord-facing labels and messages do not reveal a restricted field;
- the bureau score cannot be shown to a landlord;
- exactly one configuration is active.

---

## Versioning and reproducibility

Saving an edit creates a **new version**; the source version is untouched.
Activating a version archives the previously active one. An archived version
cannot be activated again.

Every generated report stores the configuration id, configuration version,
generation timestamp, simulation id, input hash and report mode, so an old
report can be reproduced against exactly the rules that produced it.

Every configuration action writes an audit entry with the actor, the action,
the detail and the timestamp. The audit log and the version history are both
visible in the Scoring Configuration screen.

---

## Worked configuration change

The scenario from the specification: *"Change CIBIL 680–719 from Fair to
Good."*

1. Scoring Configuration → **Rating Thresholds** → CIBIL score.
2. Change the `cibil_680_719` band's rating to *Good* and its score to 75.
3. **Preview Changes** shows `dataPointRules.cibil_score.bands` in the diff, the
   before/after overall rating for the current tenant, and every category whose
   rating moves.
4. Enter a change reason and **Save draft** — a new version appears with status
   `draft`.
5. **Activate Configuration** — the draft becomes active and the previous
   version is archived.
6. Every screen, both reports, the PDF, the JSON export and the audit log now
   reflect the new rule.
7. **Simulation Comparison** can score the same tenant under both versions side
   by side, showing *Credit Behaviour: Fair → Good* and the resulting movement
   in the overall rating.

Two tests cover exactly this: `CIBIL 680-719 returns Fair under the default
configuration` and `returns Good after an administrator edits the rule`.
