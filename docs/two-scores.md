# ORA Score vs Internal Diagnostic Score

The ORA score is the authoritative score. The category engine survives as a
**diagnostic** and determines nothing.

```
28 Detailed Signals
   → 10 Weighted Scoring Parameters
      → ORA Score
         → Overall ORA Rating
```

| | ORA Score | Internal Diagnostic Score |
| --- | --- | --- |
| Field | `assessment.oraScore` | `assessment.diagnosticScore` |
| Weighted by | `configuration.scoringParameters[id].weight` (the ten) | `configuration.categoryWeights` (16 categories) |
| Edited in Admin under | **Detailed Signals → scoring parameters** | **Category Weights** |
| Computed in | `src/lib/signals/parameters.ts` → `scoreParameters` | `src/lib/scoring/engine.ts` → `computeWeightedScore` |
| Determines the overall rating | **yes** | **no** |
| Determines rent fit / the 28 signals | no (they are its inputs) | **no** |
| Shown to a landlord | only as `overallScore`, and only when `landlordDisplayRules.showNumericScore` is on | **never** |
| Shown internally as | "ORA SCORE" | "INTERNAL DIAGNOSTIC SCORE" |

Wherever the diagnostic score appears it carries the line
**"Diagnostic category score — does not determine the ORA Score."**

## 1. The formula

```
ORA Score = Σ(parameterScore × configuredTopLevelWeight)
            ────────────────────────────────────────────
              Σ(configuredTopLevelWeight that contributed)

Overall ORA Rating = mapScoreToRating(ORA Score, configuration.overallScoreBands)
```

A parameter whose source value is unavailable drops out of both sums, so a gap
in the data neither helps nor hurts the tenant. A parameter with a **0% weight
is still evaluated**: it keeps its score, its note and its trace row, and
contributes 0.

The diagnostic score uses the same shape over different inputs:

```
Internal Diagnostic Score = Σ(categoryScore × categoryWeight)
                            ─────────────────────────────────
                              Σ(categoryWeight that contributed)
```

## 2. The calculation chain

```
normalised data
  ├─ buildSignalFacts / evaluateSignals        28 signals
  └─ evaluateDataPoints / buildScoredCategory  data points -> categories
        │                                            │
        └──────────────┬─────────────────────────────┘
                       ▼
            scoreParameters(configuration.scoringParameters, …)
              weighted += score * parameter.weight
              oraScore  = weighted / effectiveWeight
                       ▼
            mapScoreToRating(oraScore, overallScoreBands)   ← the only mapping
                       ▼
            assessment.rating  (exception rules may still override)

            computeWeightedScore(categories, configuration)
              diagnosticScore = Σ(score × categoryWeight) / Σ(categoryWeight)
                       ▼
            assessment.diagnosticScore   ← read by nothing else
```

`calculateAssessment` is the single place both are produced, which is why there
is exactly one rating-to-score mapping. `src/lib/pipeline.ts` evaluates the
signals once and hands the same objects to the assessment and to the report, so
the report can never diverge from what was scored.

Three different weights can attach to one parameter, and only the first is
top-level:

| Weight | Lives in | Governs |
| --- | --- | --- |
| Top-level weight | `scoringParameters[id].weight` | the ORA score |
| Category weight | `categoryWeights[categoryId]` | the diagnostic score |
| Sub-factor weight | `dataPointRules[id].weightWithinCategory` | one category's internal average |

Permanent Address Completeness, for example, is **10%** as a parameter and
**1.5** as a sub-factor inside `permanent_address_footprint`. Payment
Discipline is **10%** as a parameter and **15%** as a category. The names
coincide; the numbers are unrelated.

## 2a. The missing-score denominator rule

A parameter whose source value is **unavailable** is excluded from *both* the
numerator and the denominator. The remaining weights are renormalised over what
is left:

```
oraScore = Σ(score × weight) ÷ Σ(weight of parameters that contributed)
```

It does **not** stay in the denominator. Keeping it there would score the
missing parameter as zero by the back door, penalising a tenant for a gap in
the vendor's data rather than for anything they did. A gap costs confidence,
never score — the same rule the category engine and the missing-data treatments
already follow.

Both denominators are published so the difference is always visible:

| Field | Meaning |
| --- | --- |
| `parameters.effectiveWeight` | what the score was divided by |
| `parameters.configuredWeight` | what the administrator configured |

When every parameter has data they are equal. Worked example — Data Confidence
(10%) unavailable on the Yashraj data:

```
configuredWeight  100
effectiveWeight    90        ← the divisor
ORA score       94.82        8533.8 ÷ 90
if kept in place 85.34       8533.8 ÷ 100   ← not what ORA does
```

A **0% weight is not a missing value**. The parameter is evaluated, keeps its
score, its note and its trace row, and contributes 0 to both sums — which is
why `effectiveWeight` stays 100 when Recent Credit Activity sits at 0%.

Tested in `tests/ora-scoring-architecture.test.ts` → *"Missing-score
denominator rule"* (four cases) and asserted again by
`scripts/verify-yashraj.ts`.

## 3. Validation

Under `strict_100` both totals are validated **independently**, and both must
equal 100%:

- `scoringParameters` — `validateConfiguration` → field `scoringParameters`
- `categoryWeights` — `validateConfiguration` → field `categoryWeights`

Breaking one does not rescue the other. Under `normalized` each becomes a
warning and the corresponding score is divided by its own actual total.

## 3a. What the landlord is shown

The landlord document (`reportData`, rendered at `/report` and in the PDF) is
the v42 contract and is unchanged by any of this:

| Shown | Not shown |
| --- | --- |
| Overall assessment headline (the rent-fit line) and its confidence | the internal diagnostic score |
| 6 summary dimensions with rating and basis | category weights or any category calculation |
| 7 verification rows | the scoring trace, rule names or formulas |
| Tenant profile, identifiers masked | threshold tables or band ids |
| **All 28 detailed signals** — No. / Signal / Result / Confidence / Finding | raw source values, raw overdue amount |
| Methodology and disclaimer | the ten parameter weights |

`landlordReport.overallRating` is the **ORA rating** — the mapping of the ORA
score — so the rating the landlord sees moves when the administrator reweights
the parameters. `landlordReport.overallScore` is withheld unless
`landlordDisplayRules.showNumericScore` is switched on, and when it is on it is
the **ORA score**, never the diagnostic score.

## 3b. Rent Affordability — two questions, one set of facts

Two screens use the words "Rent Affordability" and can show different results
for the same tenant. This is intentional. They are **not** two scoring engines:
both read the same income facts, and neither produces the ORA score.

| | **Internal verification status** | **Landlord-facing rent-fit assessment** |
| --- | --- | --- |
| Wording | "Rent Affordability — Requires Verification" | "Rent Affordability — Strongly Supported" |
| Question it answers | *Can ORA stand behind the income arithmetic?* | *Does the evidence support this rent?* |
| Where | Dashboard, Scoring Engine (internal only) | Signal 4.1 in the landlord report |
| Source | `assessment.rent`, via `describeInternalRentStatus` | `reportData.detailedSignals["4.1"]` |
| Reason shown | "Income frequency/basis is not independently established." | "…**if the reported income figure is annual**" |
| Feeds the ORA score | no | yes — via the Rent-to-Income Fit parameter |

On the Yashraj data the reported income carries no stated basis. The internal
status therefore says the figure needs verifying; the landlord signal reports
the affordability band that follows *if* the figure is annual, and says so in
the finding. Both statements are true at once, and each names its assumption.

The internal reason wording is configuration-driven
(`rentRules.internalVerificationReasons`, keyed by cause) and never reaches the
landlord report — asserted in `tests/ora-scoring-architecture.test.ts` →
*"Rent Affordability terminology"*. The landlord clause is
`rentFit.conditionalFindingClause`, editable in Admin.

## 3c. One snapshot, end to end

`calculateAssessment` produces the ORA score, the rating and the diagnostic
score together, and stamps `configurationId`, `configurationVersion`,
`configurationName` and `generatedAt` on the result. Everything downstream —
the landlord report, the internal report, the scoring trace, the PDF — reads
that one object. **Nothing recalculates a score while rendering.**

The internal *ORA scoring* tab opens with a **Configuration snapshot** card
showing the id, version, scoring mode, generation time, the ORA score, and the
ten active weights with their total and a 100% check. A printed copy can
therefore always be tied back to the rules that produced it.

`tests/report-integrity.test.ts` fails if the trace's score, configuration id
or configuration version ever differ from the assessment's, or if the published
weights differ from the ones the arithmetic used, or if they do not total 100%.

**The trap this closes:** the Scoring Configuration screen edits a *draft*.
Until that draft is saved **and activated**, assessments still score against the
previously active configuration — so the weights on screen can differ from the
ones that produced the current report. The screen now says so explicitly,
naming the active configuration and listing every weight that differs.

## 3d. Template placeholders

Finding templates are configuration, so they can reference a variable that no
longer exists. An unresolved `{token}` is **removed**, never echoed into the
report, and the substitution set is deliberately wide: `{rtr}`, `{tfo}`,
`{rent}`, `{capacity}`, `{income}`, `{exposure}`, `{accounts}`, `{fileAge}`,
`{residences}`, `{offices}`, `{phones}`, `{emails}`, `{documents}`,
`{employers}`, `{exceptions}`, `{region}`, `{cities}` and `{conditional}`
resolve for every signal, whatever its own resolver returned.

So a template reading `"Rent is {rtr}% of assessable monthly income{conditional}."`
renders as *"Rent is 20.38% of assessable monthly income if the reported income
figure is annual."* — the real derived value, formatted. The factory template
does not print the ratio (ORA's privacy rules treat it as income arithmetic);
an administrator who wants it shown sets it in the template.

`tests/report-integrity.test.ts` scans `reportData`, the landlord report object,
the rendered report text and the drawn text of the PDF for `{token}`,
`{{token}}` and `{}` in both modes and for the sample tenant.

## 4. Reproducing the numbers

```bash
npx tsx scripts/verify-yashraj.ts       # 51 end-to-end checks and the final table
npx tsx scripts/trace-weights.ts        # the full A/B/C weight experiment
npx tsx scripts/render-yashraj.ts       # writes docs/generated/yashraj-scoring-trace.txt
npx vitest run tests/ora-scoring-architecture.test.ts
```

For the Yashraj dataset at the saved configuration:

| | Value |
| --- | ---: |
| ORA Score | **95.34** |
| Overall ORA Rating | **EXCELLENT** (band 90–100) |
| Internal Diagnostic Score | 76.71 |

Had the rating still come from the diagnostic score it would read VERY_GOOD
(band 75–89.9999). It does not.

## 5. Why an A/B test can come back identical

Moving weight between two parameters that score the **same** on a tenant cannot
change a weighted mean. On the Yashraj data both Permanent Address
Completeness and Data Confidence score 100:

```
A: 100×10 + 100×10 = 2000
B: 100×20 + 100×0  = 2000     → identical, necessarily
```

Move the weight onto a parameter with a *different* score to discriminate.
Recent Credit Activity scores 72:

```
A → C: (72 − 100) × 10 ÷ 100 = −2.80     predicted
       92.54 − 95.34         = −2.80     observed
```

| Test | Perm. Address | Data Confidence | Recent Credit | ORA Score | ORA Rating | Diagnostic |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| A (saved) | 10% | 10% | 0% | 95.34 | EXCELLENT | 76.71 |
| B | 20% | 0% | 0% | 95.34 | EXCELLENT | 76.71 |
| C | 10% | 0% | 10% | 92.54 | EXCELLENT | 76.71 |

The diagnostic score is constant across all three — correct, because top-level
weights do not touch the category engine.
