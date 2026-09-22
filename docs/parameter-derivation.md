# How This Parameter Is Derived

Every scoring parameter in the simulator carries a complete, editable
derivation record. It is the first tab of **Scoring Configuration** and it
answers, for each of the 65 parameters, what the parameter measures, why ORA
uses it, how it is derived, what it needs, how it bands, what it is worth, who
can see it, what happens when the data is missing, and what it does on a real
tenant.

Nothing on the card requires a code change. The scoring engine reads all of it
from the configuration object at scoring time.

---

## What each card contains

| # | Field | Notes |
| ---: | --- | --- |
| 1 | Parameter name | |
| 2 | Enabled / disabled toggle | A disabled parameter drops out of its category entirely |
| 3 | Source field / path | Dot path into the normalised tenant record |
| 4 | What it measures | Plain language |
| 5 | Why ORA uses it | The reasoning, not the mechanics |
| 6 | Derivation logic | How the value is actually produced |
| 7 | Formula | Where one applies; blank for threshold-only parameters |
| 8 | Required input fields | What must be present for the parameter to be assessable |
| 9 | Threshold table | Editable bands with conditions and bounds |
| 10 | Label for each threshold | Any enabled rating label |
| 11 | Score for each threshold | 0–100 |
| 12 | Weight | Within-category weight, category weight, and the computed effective share of the overall score |
| 13 | Landlord visibility toggle | |
| 14 | Internal-only toggle | |
| 15 | Missing-data treatment | One of four behaviours, below |
| 16 | Example calculation | A written example, plus the live result against the loaded tenant |
| 17 | Reset-to-default button | Restores that one parameter; disabled when it already matches |

Two further controls sit on every card: **Preview landlord view** and
**Preview internal admin view**, which show exactly what each audience would
see for that parameter.

---

## Missing-data treatments

Selecting one is mandatory; validation blocks activation without it.

| Treatment | Behaviour |
| --- | --- |
| `use_missing_rating` | The parameter still contributes, using its configured missing-data rating. Use when absence is itself a signal. |
| `exclude_and_reduce_confidence` | The parameter drops out of its category's weighted average and ORA Data Confidence is reduced. **The tenant is not penalised for a gap in the records.** |
| `exclude_only` | Drops out of the weighted average with no confidence penalty. |
| `treat_as_zero` | Contributes a score of zero. Only when absence is genuinely adverse. |

Default distribution: 57 parameters use the missing rating, 5 exclude and
reduce confidence, 3 exclude only.

The confidence penalty is configurable — 6 points per excluded factor, capped
at 24 — and applies to the ORA Data Confidence category after its own score is
computed.

---

## The seven documented parameters

### A. Rent-to-Income Fit

- **Source**: `derived.rentToIncomeRatio`
- **Formula**: `rent-to-income % = (proposed monthly rent ÷ monthly income) × 100`
- **Default bands**: ≤25% Excellent · 25–35% Very Good · 35–45% Good ·
  45–50% Fair · >50% Requires Verification
- **Missing data**: `exclude_and_reduce_confidence`

Monthly income is derived only when the source states the income frequency. A
bare number is never assumed to be monthly.

When income is missing or its basis is unstated, the factor is **excluded from
the weighted average and ORA Data Confidence drops** — the tenant is not scored
down for a gap in a vendor payload. Thresholds, labels, scores and weight are
all editable.

### B. Permanent Address Completeness

- **Source**: `address.permanent.completeness`
- **Formula**: `(populated sub-fields ÷ 4) × 100`

Measures whether the permanent address is sufficiently populated — line, city,
state, pincode. It is the fallback route to reach a tenant who leaves the
property, so a half-recorded one is no route at all.

Kept separate from Address Stability. It says nothing about how long the tenant
has been associated with the address, and ownership is never inferred from it.

### C. Address Completeness

- **Source**: `address.completeness`
- **Formula**: `record completeness % = (populated sub-fields ÷ 4) × 100`,
  averaged across every distinct address held

Measures whether the address fields are complete. It is a data-quality measure,
not a behavioural one, and the card says so explicitly: a brand-new address
entered perfectly scores 100% here while contributing nothing to stability.

It is **not** labelled as address stability anywhere — not in the parameter
name, not in the landlord-facing label, not in the explanation.

### D. Address Stability

- **Source**: `derived.addressRepeatedRecordCount`
- **Formula**:
  `repeated records = | { normalised address keys in Prefill } ∩ { normalised address keys in CIBIL } |`
- **Default bands**: 2+ repeats Excellent · 1 repeat Very Good · 0 repeats Pending Verification

Calculated separately from completeness, out of repeated and consistent address
records across Prefill and CIBIL. Addresses are extracted from each payload,
normalised to a `line + city + pincode` key with punctuation and case stripped,
and intersected.

When only one source carries addresses there is nothing to corroborate against,
so the parameter reports "not assessable" and is excluded rather than scored as
zero repeats.

### E. Recent Credit Activity

- **Source**: `credit.enquiries12m`
- **Default effective weight**: ~1.2% of the overall score, ceiling 5%
- **Internal only**, landlord visibility off, and disableable

Counts formal lender checks in the last 12 months. A weak, noisy signal —
rate-shopping for a single loan generates several — so it is deliberately held
to a small share of the score. Raising it past the 5% ceiling produces a
validation warning naming the parameter and the new share.

Raw enquiry detail never reaches a landlord: the privacy filter strips it, and
a test asserts the landlord report contains no enquiry data at all.

### F. Standard of Living

- **Source**: `derived.standardOfLivingScore`
- **Optional**: switched on or off in the Standard of Living card
- **Default category weight**: 0%

Built from reported vehicle and housing finance. Accounts are classified by
account type against configurable keyword lists, matched as **whole words** —
so "Credit Card" is not read as a car loan. The strongest qualifying signal
wins:

| Rule | Default rating | Score |
| --- | --- | ---: |
| Two or more vehicle loans | Very Good | 85 |
| Vehicle loan under ₹10 lakh | Fair | 55 |
| Vehicle loan ₹10–20 lakh | Good | 70 |
| Vehicle loan ₹20–40 lakh | Very Good | 85 |
| Vehicle loan ₹40 lakh and above | Excellent | 95 |
| Housing loan reported | Excellent | 95 |

Every band's range, rating and score is editable, as are the keyword lists and
the "multiple vehicles" threshold.

**No loan is neutral, never negative.** A tenant with no qualifying loan is
excluded from the parameter and the category reports *Not Assessed* — they are
not marked down for buying a car outright or not owning one.

The disclaimer, shown on the card and editable: *an indicative financial-profile
signal … not proof of wealth, income or asset ownership — a loan is a liability.*

### G. Overdue Amount

- **Source**: `derived.qualifyingOverdueAmount`
- **Default weight**: 0%
- **Internal only**, and never shown to a landlord under any configuration

Overdue only counts when the account is mature enough for the default to say
something about the tenant:

```
account age (months) = openedOn → (closedOn or report date)
qualifies when account age ≥ 12 AND months from opening to default ≥ 12
qualifying overdue = Σ overdue on qualifying accounts
```

Where the source reports a default date it is used directly; otherwise the
account's observed lifetime is the proxy. Overdue on accounts that fail either
test is discounted and reported separately as
`derived.discountedOverdueAccounts`.

Both windows default to 12 months and are editable, and the whole qualification
step can be switched off. Where no account-level rows exist the window cannot
be evaluated and the report-level total is used unchanged.

---

## Scoring mode

| Mode | Behaviour |
| --- | --- |
| `strict_100` (default) | Validation blocks activation until the enabled category weights total exactly 100%. |
| `normalized` | The score is divided by whatever the enabled weights total, so a category can be disabled without rebalancing. A non-100 total becomes a warning. |

Both modes divide by the weight that actually contributed, so a category with
no usable data never silently drags the score toward zero. The difference is
only what validation demands.

---

## Validation

Added for this layer, on top of the existing configuration rules:

| Rule | Level |
| --- | --- |
| All enabled weights total 100% — unless normalized scoring is on | error / warning |
| Threshold ranges cannot overlap | error |
| Threshold ranges cannot have gaps unless `allowGaps` is on for that parameter | error / warning |
| Score must be between 0 and 100 | error |
| Missing-data treatment must be selected | error |
| Every parameter must have a source field | error |
| Every parameter must have a derivation explanation (`measures` and `logic`) | error |
| Every parameter should say why it is used, and carry a worked example | warning |
| A parameter above its recommended weight ceiling | warning |

---

## Configuration schema versioning

Configurations persist in `localStorage` across releases, so
`ScoringConfiguration.schemaVersion` records the shape a stored copy was
written against. `CURRENT_SCHEMA_VERSION` is **2**.

Schema 2 rewrote the factory parameter definitions themselves — several were
renamed, re-sourced and re-explained. Field-level merging a v1 copy would leave
an administrator looking at the old names attached to the new behaviour, so:

- **v1 → v2**: factory parameter definitions are adopted wholesale, and an
  audit entry records it. Parameters an administrator added themselves are kept.
- **v2 onward**: migration is additive — stored values win, and only genuinely
  new fields come from the factory.

---

## Tests

`tests/derivation.test.ts` — 53 tests:

- every parameter has all seventeen card fields, and a factory default to reset to
- every band score is inside 0–100
- the seven documented parameters exist under their documented ids
- **A**: formula documented; factor excluded rather than penalised when income
  is missing; confidence falls instead of the score; edited thresholds, labels,
  scores and weight all take effect
- **B/C/D**: each address parameter has its own source and category;
  completeness is never described as stability; stability derives from
  cross-source repetition; stability is not scored when only one source carries
  addresses; completeness and stability move independently
- **E**: default effective weight is between 0% and 5%; the ceiling warning
  fires; the parameter can be disabled; enquiry detail never reaches the
  landlord report
- **F**: whole-word keyword matching ("Credit Card" is not a car loan); each
  value band; the multiple-vehicle and housing bands; no loan is neutral; the
  signal can be switched off; the disclaimer says what it must
- **G**: weight 0 and internal only; the 12-month defaults; a young account is
  discounted; a mature account counts; a default inside the first year is
  discounted; mixed accounts; the window can be switched off or edited; overdue
  never reaches the landlord report
- editing thresholds, weights, formulas, visibility and missing-data treatments
- resetting one parameter to its factory default
- validation: source required, derivation required, treatment required, score
  range, overlaps, normalized mode
- schema migration from v1, including preserved administrator parameters

Run them with `npm test` — 173 tests across 9 files, all passing.
