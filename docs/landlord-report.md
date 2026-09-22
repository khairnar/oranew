# The ORA Tenant Screening Report

The landlord-facing report replicates `ora-tenant-report-v42.html` — its CSS,
layout, typography, badges, section order, responsive behaviour and print
rules are the reference report's own, scoped to `.ora-doc` so they cannot leak
into the surrounding application.

Every value is produced by the engine. The component contains no calculations.

---

## Architecture

```
RAW DATA                    lib/parser
   ↓
NORMALISATION               lib/normalizer          → NormalizedTenantData
   ↓
DERIVED FACTS               lib/signals/facts       → SignalFacts
   │
   ├──────────────────────────┬──────────────────────────┐
   ↓                          ↓                          ↓
SCORING ENGINE          RENT-FIT ENGINE            SIGNAL ENGINE
lib/scoring/engine      (inside facts + 4.1–4.4)   lib/signals/engine
   ↓                          ↓                          ↓
   └──────────────────────────┴──────────────────────────┘
                              ↓
              WEIGHTED SCORING PARAMETERS    lib/signals/parameters
                              ↓
                        ORA SCORE + CONFIDENCE
                              ↓
                  reportData                 lib/report/reportData
                              ↓
                  OraReport                  components/report/OraReport
```

There is **one** calculation engine. The ten weighted scoring parameters read
values the engine has already computed — a data-point result, a category score
or a banded signal — and apply a weighting layer. Nothing is calculated twice.

---

## Section order

| # | Section | Source |
| --- | --- | --- |
| — | Header, reference, date, CONFIDENTIAL badge | `reportData.meta` |
| — | Report metadata table | `reportData.meta` |
| 1 | Summary of findings | `reportData.summary` |
| 2 | Verification | `reportData.verification` |
| 3 | Tenant profile | `reportData.tenantProfile` |
| 4 | Detailed signals (28) | `reportData.detailedSignals` |
| 5 | Methodology | `reportData.methodology` |
| 6 | Disclaimer | `reportData.disclaimer` |

---

## The report data contract

```ts
interface ReportData {
  meta: { reference, date, tenant, preparedFor, purpose, validity,
          issuedTo, permittedUse, dataHandling,
          confidentialStrip, confidentialNotice };
  summary: { overallAssessment, overallStatus, proposedRent, proposedRentSub,
             confidence, confidenceStatus, confidenceReason, dimensions[] };
  verification: { item, status, statusColour, detail }[];
  verificationNote: string;
  tenantProfile: { label, value }[];
  detailedSignals: ReportSignalRow[];   // exactly 28
  methodology: string[];
  disclaimer: string;
  footer: { left, centre, right };
}
```

`ReportSignalRow` is `{ number, id, name, result, confidence, finding, status }`
and deliberately carries **no diagnostics**. The engine's `SignalOutput` adds a
`diagnostics` block — source field, raw value, matched threshold, score, rule
fired — and that stays in the admin path. Stripping it at the contract boundary
is what makes the report structurally incapable of printing a raw source value.

The report reference and date are generated from the report date and the
simulation id. Nothing from the reference report is hardcoded.

---

## The 28 detailed signals

All 28 are landlord-visible, always. The configuration governs how each is
derived — source, calculation, thresholds, result labels, scores, colours,
confidence, missing-data behaviour and finding wording — never whether the
landlord sees it. `landlordVisible` is typed as the literal `true`, and the
store migration forces a stored `false` back to `true`.

| No. | Signal | Source field | Default calculation |
| --- | --- | --- | --- |
| 4.1 | Rent Affordability | `rent.rtr` | rent ÷ monthly income × 100, banded |
| 4.2 | Rent Capacity Band | `rent.capacity` | assessable monthly income × `rentFit.capacityPercentage` (70%), rounded **down** to `rentFit.capacityRoundingTo` (₹100). A rupee amount, never a band label; obligations are not an input |
| 4.3 | Income Confidence | `income.reported` | verified / basis stated / basis unstated |
| 4.4 | Income Group | `income.assessableMonthly` | monthly income banded, suffixed when conditional |
| 4.5 | Financial Depth | `credit.effectiveExposure` | live sanctioned + closed × weight |
| 4.6 | Financial Maturity | `credit.fileAgeMonths` | months since oldest account |
| 4.7 | Financial Stress Signal | composite | overdue + DPD + utilisation + burden + adverse |
| 4.8 | Payment Discipline | `credit.maxDpd` | worst DPD, overridden by an adverse event |
| 4.9 | City Stability | address records | distinct metropolitan regions |
| 4.10 | Permanent Address Footprint | permanent address | presence + completeness + repetition |
| 4.11 | Professional Footprint | employment evidence | occupation + employer + domain + office |
| 4.12 | Corporate Email Footprint | `contact.corporateEmailDomains` | distinct corporate domains |
| 4.13 | Office Footprint | `employment.officeAddressCount` | office-typed address records |
| 4.14 | Employment Continuity | employer records | single employer + tenure + domain agreement |
| 4.15 | Identity Depth | `identity.documentCount` | distinct identity documents |
| 4.16 | Identity Consistency | shared identity fields | matched fields, negative on any mismatch |
| 4.17 | Digital Footprint | emails + mobile | breadth of recorded presence |
| 4.18 | Contact Stability | `contact.genuinePhoneCount` | distinct genuine numbers after placeholder removal |
| 4.19 | Traceability | contact routes | phone + email + permanent address + family reference |
| 4.20 | Profile Consistency | `meta.conflictCount` | cross-source conflicts |
| 4.21 | Data Confidence | composite | sources + completeness + recency − conflicts − gaps |
| 4.22 | Background Confidence | `meta.bgvRun` | Pending until a check is actually run |
| 4.23 | Vehicle Profile | `credit.autoLoanCount` | vehicle-classified accounts |
| 4.24 | Household Profile | explicit relation + family address | explicit fields only |
| 4.25 | Occupancy Strength | residence history | settled current + few residences + repetition |
| 4.26 | Reference Readiness | reference routes | family + alternate number + previous landlord |
| 4.27 | Exception Flags | `exceptions.length` | confirmable gaps, named factually |
| 4.28 | ORA Profile Confidence | composite | identity + data + residence + credit + income − exceptions |

When a signal's inputs are unavailable it returns the configured missing-data
result — `Not assessed` by default — with a finding naming exactly which fields
were missing. It is never dropped and never fabricated.

---

## Weighted scoring parameters

Separate from the 28 signals, and the only things that carry weight:

| Parameter | Weight | Reads |
| --- | ---: | --- |
| Rent-to-Income Fit | 25% | signal `rent_affordability` |
| Credit Behaviour | 15% | category `credit_appetite` |
| Payment Discipline | 10% | signal `payment_discipline` |
| Permanent Address Completeness | 8% | data point `permanent_address_completeness` |
| Address Completeness | 5% | data point `address_completeness` |
| Address Stability | 10% | data point `address_stability_cross_source` |
| Financial Depth | 15% | signal `financial_depth` |
| Recent Credit Activity | 2% | data point `recent_credit_activity` |
| Data Confidence | 10% | signal `data_confidence` |
| Overdue Amount | 0% | data point `overdue_amount` |
| **Total** | **100%** | |

The Detailed Signals tab shows the running total, blocks an unbalanced
configuration with a clear warning, and offers **Normalize weights** to rescale
the enabled weights proportionally back to exactly 100%.

A parameter whose source is unavailable drops out of the weighting rather than
scoring zero, so the remaining weights carry the score.

### Overdue Amount

Weighted 0% and never shown as a raw value. The engine still calculates it,
because it feeds Financial Stress Signal, Payment Discipline, the exception
list, confidence and the internal diagnostics. The landlord sees the derived
results, never the amount, the lender or the account.

---

## Rent-fit engine

**4.1 and 4.2 answer different questions and share no setting.**

```
4.1  RTR      = proposed monthly rent ÷ assessable monthly income × 100
               → banded against rentFit.rtrBands → a qualitative result
     TFO      = (proposed rent + monthly EMI) ÷ assessable monthly income × 100

4.2  capacity = floor((assessable monthly income × rentFit.capacityPercentage)
                      ÷ rentFit.capacityRoundingTo) × rentFit.capacityRoundingTo
               → a rupee amount
```

Default RTR bands, all editable:

| Ratio | Internal label | Landlord result |
| --- | --- | --- |
| ≤ 25% | Very Comfortable | Strongly Supported |
| 25–35% | Comfortable | Strongly Supported |
| 35–45% | Manageable | Supported |
| 45–50% | Elevated | Supported with Verification |
| > 50% | Additional Financial Evidence | Additional Financial Evidence Required |

### 4.2 Rent Capacity Band

A **quantitative** output: "how much monthly rent can this tenant support?",
answered in rupees. It is not an affordability verdict and never returns a band
label — 4.1 answers that question, from the tenant's actual rent.

**One input: the assessable monthly income.** EMI, loan obligations, overdue
amounts and every other debt figure are deliberately absent. Netting debt off
capacity answered a third question — what is left after existing commitments —
while looking like this one; the tenant's debt burden is reported by 4.7
Financial Stress and by the internal rent assessment, where it belongs.

| setting | default | read by |
| --- | ---: | --- |
| `rentFit.capacityPercentage` | 70% | 4.2 only |
| `rentFit.capacityRoundingTo` | ₹100 | 4.2 only |
| `rentFit.deductObligationsFromCapacity` | off | 4.2 only |
| `rentFit.maxRentToIncomePct` | 35% | 4.1 only |

Editable under **Scoring Configuration → 6. Rent Rules**, which previews what
the current settings would quote. Worked examples at 70%:

| assessable monthly income | calculated | quoted |
| ---: | ---: | ---: |
| ₹50,000 | ₹35,000 | ₹35,000 |
| ₹77,000 | ₹53,900 | ₹53,900 |
| ₹77,467 | ₹54,226.90 | ₹54,200 |
| ₹1,00,000 | ₹70,000 | ₹70,000 |
| ₹1,50,000 | ₹1,05,000 | ₹1,05,000 |
| ₹2,00,000 | ₹1,40,000 | ₹1,40,000 |

The figure always rounds **down**, so it is never shown above what the income
supports. The step is ₹100 — at ₹1,000 the quote discarded most of the
precision the calculation has (₹54,226.90 became ₹54,000); at ₹100 it is within
₹99 and still a round, negotiable number. ₹77,000 at 70% is exactly ₹53,900,
and the product is settled to the paisa before the floor so a binary
representation error cannot drop a whole step.

A proposed rent above the figure can still be Supported by 4.1 — when that
happens the finding says so explicitly rather than leaving two numbers that
appear to disagree.

`reportData.rentCapacity` carries the rate, the rounded amount, the step and
the sentence. The exact income and the unrounded result stay internal: dividing
the unrounded figure by the rate recovers the income the disclosure policy
exists to withhold, whereas the rounded amount only narrows it to a step. Both
are on `signalFacts.rent.capacityDetail` and in the internal trace.

### Income

Monthly income is derived only when the source states the basis. Where it does
not, the engine offers a conditional figure — "about ₹X a month if annual" —
clearly labelled, and suffixes the income group with `, conditional`. A
conditional figure is never presented as verified income.

---

## Configuration

**Scoring Configuration → 1. Detailed Signals (28)** carries, for each signal:
name, number, parameter type, enabled, landlord visibility (fixed true), source
field, source fields and priority, calculation type, the full "How this
parameter is derived" block, an editable threshold table (add / edit / delete
rows, with overlap detection), result labels, scores, colours, per-row
confidence, missing-data behaviour, finding template, last-updated, reset to
default, and two previews — **Preview landlord report row** and **Preview
internal configuration**.

The same screen carries the weighted scoring parameters with their weights,
sources, enable toggles, total indicator and Normalize weights.

Configurations persist in `localStorage` and are versioned. `schemaVersion` is
now **3**; a stored v2 copy is topped up with the signals, parameters, rent-fit,
income, depth, maturity and report rule blocks.

---

## Responsive and print

The reference report's own rules are preserved:

- ≤ 860px: the document loses its margin, border and radius and fills the width.
- ≤ 640px: the signals table collapses to stacked cards, with each cell labelled
  from its `data-l` attribute and the number column hidden.
- ≤ 560px: the header stacks, padding tightens, the watermark shrinks.
- Print: fixed confidentiality strip and page footer, `break-inside: avoid` on
  rows and the summary box, exact colour printing, 14mm × 12mm margins.

**Print** produces the design-faithful PDF. **Export PDF** produces a
structured text PDF from the same `reportData`, carrying all 28 signals and all
six sections, guarded by the same leak scanner.

---

## Known gaps

Fields the reference report shows that no supplied source returns, and which
therefore display **Not available** rather than a fabricated value:

- **Marital status** — no source field exists. Mapped from `marital_status` if
  a payload provides one.
- **Aadhaar and Passport** — the sample Prefill returns neither. The
  verification rows read *Not available*, never *failed*.
- **Alternate number** — derived from a second genuine phone record when one
  exists.
- **Background check** — no BGV provider is wired in, so 4.22 reports *Pending*
  at *Not assessed*. It never implies a clean check.
- **Reported dates on individual records** — the sample payloads carry account
  opening dates but not per-address or per-phone reporting dates, so findings
  such as "same number since February 2025" report record counts instead of
  date ranges. The parser reads `reported_on` / `last_reported` where a payload
  supplies them.

### One deliberate deviation

The reference prints the tenant's mobile in full. ORA's own privacy rules mask
it, so the report honours `landlordDisplayRules.maskPhone`, which defaults to
**on** — the number shows as `******4851`. Turn that toggle off in Landlord
Display Rules to match the reference exactly.
