# Income frequency inference

A **supporting check**, added without changing anything else. It only decides
what the income frequency is when nothing else established one.

```
Reported Income → Income Frequency → Assessable Monthly Income
                → Rent-to-Income Ratio → Rent Affordability
```

That flow is unchanged. The inference sits at one point inside it: the
resolution of *Income Frequency*.

## Priority

| | Level | Wins over |
| --- | --- | --- |
| 1 | Explicit source income frequency | everything below |
| 2 | Explicit simulation override | the source and the inference |
| 3 | **EMI-based inference** | nothing — it only runs while the basis is still unknown |
| 4 | Unknown | — |

An inference can never overrule a stated basis or an override. Where either of
those set a frequency, the check does not run at all (`checkStatus:
"not_needed"`).

## The check

When the frequency is unknown and a monthly EMI was reported:

```
annualMonthlyCandidate = reportedIncome ÷ 12

monthlyEmiTotal > annualMonthlyCandidate
  → frequency  = monthly
    method     = EMI_CONSISTENCY
    confidence = medium
    reason     = "Monthly income interpretation is supported by EMI consistency."
```

A tenant whose monthly EMI outgo exceeds what an annual reading would leave
them each month is very unlikely to be servicing that debt on that income — so
the figure is more likely already monthly. **That is an inference about
plausibility, not proof.**

Anything else — EMI at or below the candidate, no EMI reported, no income, the
check disabled, or an inference below the configured minimum confidence —
resolves to **Unknown**. It never falls through to "assume annual"; the
pre-existing conditional what-if handles that case exactly as before.

## Metadata the engine retains

`facts.income.frequency` (and `internalReport.incomeResolution`):

| Field | Values |
| --- | --- |
| `frequency` | monthly / annual / weekly / daily / unknown |
| `source` | `source` / `simulation_override` / `emi_inference` / `unknown` |
| `method` | `EMI_CONSISTENCY`, or null |
| `confidence` | high / medium / low / not_assessed |
| `inferred` | true only when the EMI check decided it |
| `annualMonthlyCandidate`, `monthlyEmiTotal` | the two compared figures |
| `checkStatus` | not_needed / disabled / no_emi_data / no_income / conclusive / inconclusive |
| `explanation` | internal wording |

## Monthly normalization — one authority

`monthlyFromFrequency` in `src/lib/income/frequency.ts` is the **only** place a
frequency becomes a monthly figure:

| Frequency | Monthly |
| --- | --- |
| Monthly | `reportedIncome` |
| Annual | `reportedIncome ÷ 12` |
| Weekly | `reportedIncome × 52 ÷ 12` |
| Daily | `reportedIncome × 365 ÷ 12` |
| Unknown | `null` |

`income.assessableMonthly` is the single authoritative fact. `deriveMonthlyIncome`
in the normalizer delegates to the same function.

## What an inferred basis does NOT do

- `basisKnown` stays **false** — an inference is not a statement by the source.
  Income Confidence, the income-basis exception and the summary wording all
  keep behaving as though the basis is unstated.
- The rent-to-income ratio is calculated, and marked **conditional**.
- Confidence cannot rise to High on the strength of the inference alone.
- The landlord wording never says "income is monthly", and never names EMI,
  the candidate figure, the method or the confidence.

Because the annual clause would be false for an inferred-monthly tenant, it is
not used there. With `discloseInferredBasis` off (the default) the finding
simply carries no clause; with it on, the configured clause appears:

> Rent-to-income assessment uses an inferred income frequency and should be
> confirmed with supporting income documentation.

## Configuration

**Settings → Scoring Configuration → How Parameters Are Derived → Income
frequency inference.** No new top-level parameter, no ORA weight, no change to
the existing ten.

`configuration.incomeFrequencyInference`: `enabled`, `method`,
`comparisonMethod`, `comparisonRatio`, `minimumEvidenceConfidence`,
`unknownFrequencyBehaviour`, `explanation`, `confidenceMapping`,
`landlordDisclosureClause`, `discloseInferredBasis`.

Default: enabled, `emi_exceeds_annual_monthly`, minimum confidence `medium`,
disclosure **off**.

## Cross-tenant behaviour

One engine, no tenant-specific rules.

| Tenant | Basis | Check | Outcome |
| --- | --- | --- | --- |
| Yashraj | not stated | `no_emi_data` (all EMI fields are `-1` sentinels) | unknown — results unchanged |
| Tanish | stated Monthly | `not_needed` | Monthly from the source — results unchanged |
| Tanish, basis forced unknown | unknown | `conclusive` (₹12,500 EMI > ₹8,750 candidate) | Monthly, inferred, medium |

## Tests

`tests/income-frequency-inference.test.ts` — 35 tests covering the eight
required priority cases, normalization including daily, the conditional
treatment, the privacy scan, and the cross-tenant and no-collateral-change
checks.

`scripts/snapshot-regression.ts` captures the ten parameter scores and weights,
the ORA score and rating, the diagnostic score, all 28 results, confidences and
findings for both Yashraj modes and Tanish. Run it before and after any change
and diff the two files.
