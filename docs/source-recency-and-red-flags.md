# Source recency and the red-flag policy

Two features introduced in Test 13, documented together because the second
depends on the first's notion of "recent".

---

## 1. The source-date policy

### The problem it solves

`confidenceRules.dataConfidence` has always defined a complete recency
dimension — points for a fresh record, half for an ageing one, none for a stale
one, plus a `stale_source` exception. None of it ever fired.

`meta.reportAgeDays` came from `meta.lastReportedDate`, whose alias list looked
for a **document-level** timestamp: `reportDate`, `generatedAt`, `createdAt`.
Neither vendor sends one. CIBIL dates each row individually (`scoreDate`,
`dateReported`) and Prefill uses `reported_date`. So the age was null on every
real payload and a two-year-old bureau file scored exactly like one pulled this
morning.

### The policy

For each source, take the **latest** date among the qualifying row kinds; the
record age is the assessment date minus the latest of those.

```
for each SOURCE
  latest = max(date of every QUALIFYING row that source supplied)
latestRelevantSourceDate = max(latest over all sources)
reportAgeDays            = assessmentDate − latestRelevantSourceDate
```

A maximum has no order dependence, so shuffling the rows, the accounts or the
sources cannot change the answer.

### Which dates qualify

| id | field | qualifies | why |
| --- | --- | --- | --- |
| `documentDate` | `reportDate`, `generatedAt`, … | yes | The strongest evidence of a file's age where a vendor states one. Neither real vendor does. |
| `cibil.scoreDate` | `scores[].scoreDate` | yes | The bureau states when it scored the file. |
| `cibil.accountReportedOn` | `accounts[].dateReported` | yes | When the lender last reported that account. |
| `cibil.phoneReportedOn` | `telephones[].dateReported` | yes | |
| `cibil.emailReportedOn` | `emails[].dateReported` | yes | |
| `cibil.addressReportedOn` | `addresses[].dateReported` | yes | |
| `prefill.phoneReportedOn` | `phone_info[].reported_date` | yes | |
| `prefill.emailReportedOn` | `email_info[].reported_date` | yes | |
| `prefill.addressReportedOn` | `address_info[].reported_date` | yes | |
| — | `accounts[].dateOpened` / `dateClosed` | **no** | Dates the ACCOUNT, not the report. A loan opened in 2019 says nothing about when the bureau last looked at the file. |
| — | `monthlyPayStatus[].date` | **no** | A repayment calendar. The month a lender reports a status *for* is not the day it reported. |
| — | date of birth, enquiry dates, default dates | **no** | Facts about the tenant, not about the file's freshness. |

Every row in that table is a switch in `sourceRecency.qualifyingDates`, so the
policy is configuration rather than code.

### What it refuses to do

- **Invent a date.** A row with no date contributes nothing. A payload with no
  qualifying date at all leaves the age `null`, and 4.21 omits the recency term
  entirely rather than assuming one.
- **Accept a malformed one.** A non-ISO string, an impossible calendar date
  (`2026-02-31`) or anything before `earliestPlausibleDate` is discarded and
  recorded in the trace as discarded.
- **Return a negative age.** A date after the assessment date is a vendor
  error. With `clampFutureDates` on it reads as "reported today"; with it off
  the date is discarded. Either way the age is floored at zero.

### Boundaries

| age | term | exception |
| ---: | --- | --- |
| ≤ `recentWithinDays` (180) | full `recencyPoints` (15) | none |
| ≤ `staleAfterDays` (540) | half, rounded (8) | none |
| > `staleAfterDays` | none | `stale_source` |
| unknown | term omitted | none |

The `stale_source` exception previously used a hard-coded 365 days. It now uses
the configured `staleAfterDays`, so it can never contradict the number an
administrator sets beside it.

### MODE A

V42 had **no** recency behaviour: the dimension existed but never received an
input. Reproducing the reference therefore means reproducing that, so MODE A
pins `sourceRecency.enabled = false`. It keeps ORA 94.06, diagnostic 76.44 and
28-of-28 against `ora-tenant-report-v42.html`.

### Landlord privacy

The record age, the source dates, the qualifying-date ids, the recency points
and the stale boundary are all internal. The landlord sees the resulting Data
Confidence signal and nothing behind it. The legacy report's "Last Reported
Data Date" row is a source timestamp, so it is now governed by the
`sourceDataDate` disclosure and reads "Not Available" unless an administrator
switches it on.

---

## 2. The red-flag policy

### What it is

A **policy override**, not a derivation. The evidence is normalised, the
signals reach their ordinary conclusions and the parameters read their ordinary
sources — all of that happens first and all of it is kept. The red flag asks
one further question on top:

> Did a qualifying adverse event happen **inside** the configured lookback?

Where the answer is yes, the configured overrides are applied to the named
parameters, and every step is recorded:

```
source evidence -> normalised classification -> ordinary signal result
  -> red flag triggered -> configured override -> final result
```

### Configuration — `configuration.redFlags`

| field | default | meaning |
| --- | --- | --- |
| `enabled` | `true` | |
| `lookbackMonths` | `12` | How far back an adverse event still counts. |
| `boundaryInclusive` | `true` | Whether an event dated exactly the lookback triggers. |
| `triggerTypes` | 7 classifications | Which adverse classifications can raise a flag. |
| `requireDatedEvent` | `true` | An undated event never triggers. |
| `precedence` | severity order | Chooses the single leading reason. |
| `overrideBands` | `financial_low` → Low / 20 | The whole conclusion an override applies. |
| `financialParameterOverrides` | the six financial parameters | The only route to the ORA score. |
| `signalOverrides` | `payment_discipline` → `financial_low` | See below. |
| `raisesException` | `true` | Also raises `red_flag_recent_adverse`. |
| `landlordDisclosure` | visible, no date, no type | Wording only. |

### Dating an event

The lookback is meaningless without a date, so each classification carries one:

- A **status-code marker** (SUB, DBT, LSS) dates itself: the latest month the
  account carried that code.
- An **account-level flag** (write-off, settlement, suit filed, status text)
  takes, in order: the latest adverse monthly marker on that account, then
  `firstDefaultOn`, then `closedOn`.
- `dateReported` is deliberately **not** in that list. A lender keeps reporting
  a written-off account for years, so using it would make a decade-old
  write-off look like it happened this month.
- A **report-level flag** with no account row behind it is undated, and under
  `requireDatedEvent` it does not trigger.

### THE CONFIGURED BAND ALWAYS WINS

There is **no numeric guard**. An override is not compared against the score the
evidence reached, and there is no circumstance in which a resolvable, enabled
override is declined.

An earlier build did compare them and skipped an override that would *raise* a
score, on the reasoning that a red flag should never improve an assessment. The
effect was that "force this parameter to Low" actually meant "force it to Low
unless it already scores lower" — and because Payment Discipline's adverse band
scores **15**, below the Low band's **20**, a recent qualifying default left 4.8
at Adverse History / 15 while every other affected parameter sat at Low / 20.
That is not what the configuration says. An administrator naming a final band
has made the decision; the engine applies it.

The one thing an override never replaces is a **gap**: a signal whose inputs
were unavailable stays unassessed, and a parameter whose source produced no
score stays excluded under the missing-score denominator rule. A policy layer
may re-band a conclusion; it may not manufacture one from absent data.

### Signal overrides, and where a band comes from

`thresholdId` is resolved against the signal's **own threshold table first**,
then against `redFlags.overrideBands`. Either way the row it resolves to
supplies the result, score, status, confidence and finding together.

The seed forces **4.8 Payment Discipline** to the shared `financial_low` band,
so the signal a landlord reads and the parameters that carry weight land on the
same conclusion rather than one band apart. The adverse-credit classification
(Test 8) still *derives* 4.8 underneath — re-banding it in Admin still changes
what the trace records as the normal result — and that derivation is what the
override sits on top of.

A band applied to a signal needs wording of its own, which is why
`RedFlagOverrideBand` carries a `result` and a `finding`. The band being
replaced usually describes a different cause: `pay_adverse`'s finding is about
the repayment record, and printing it beside a result of "Low" would explain the
wrong thing. `financial_low` says what actually applies —
*"Recent adverse credit history requires review before proceeding."*

### What does not trigger it

- Missing income. Missing income is missing, not a default.
- A missing repayment history. An absent record is not adverse conduct.
- A missing overdue figure.
- An adverse event outside the lookback.
- An adverse event whose classification is not in `triggerTypes`.
- An undated event, while `requireDatedEvent` is on.

### Several qualifying events

All of them are kept in the internal trace. **One** leading reason is selected
by the configured precedence, then by recency, then by id; the override is
applied **once** per parameter. Three adverse events never cost a tenant three
times.

### Effect on the ORA score

Only through the parameters. There is no penalty subtracted from the total
anywhere — the score moves because the parameters it is weighted over scored
differently, through the unchanged formula:

```
ORA Score = Σ(parameter score × top-level weight) ÷ Σ(contributing weight)
```

A parameter whose own source is **unavailable** stays excluded rather than
being overridden to a low score: the missing-score denominator rule still
governs, and a gap must never become a penalty. A parameter with **0% weight**
is overridden internally and contributes nothing.

### Red flag versus exception

Deliberately separate mechanisms with separate switches:

| | flags the condition | applies the financial policy |
| --- | --- | --- |
| Exception (`raisesException`) | yes | no |
| Override (`financialParameterOverrides`) | no | yes |

Switching either off leaves the other working. The exception appears in 4.27
and reduces 4.28 by the same −5 as any other gap; it changes no ORA score of
its own.

### Landlord disclosure

By default the landlord sees one notice in section 1 —

> **RED FLAG** Recent adverse credit history requires review before proceeding.

— **4.8 Payment Discipline reading "Low"** with the same sentence as its
finding, and the landlord-safe exception label in 4.27, "Recent adverse credit
history on record". The event date, the bureau code, the classification, the
account, the amount, the lookback, the override band and the rule id are all
internal. `discloseEventType` and `discloseEventDate` are switches, both off.

### The internal trace of an override

```
NORMAL RESULT   Payment Discipline = Adverse History / 15   (band pay_adverse)
RED FLAG        Loss classification dated 2026-07-21, inside the configured
                12-month lookback.
OVERRIDE        financial_low, from the shared red-flag override bands
FINAL           Payment Discipline = Low / 20
```

Every one of those lines is on `diagnostics.override`, in the Internal report's
*Recency & red flag* tab, in the copyable policy trace and in the internal PDF.
The normal result is never overwritten.

---

## 3. Where to find it

| | |
| --- | --- |
| Source-date policy | `src/lib/normalizer/sourceDates.ts` |
| Red-flag evaluation | `src/lib/signals/redFlag.ts` |
| Signal override | `applyRedFlagOverride` in `src/lib/signals/engine.ts` |
| Parameter override | `scoreParameters` in `src/lib/signals/parameters.ts` |
| Internal trace | `buildRecencyTrace` / `buildRedFlagTrace` in `src/lib/signals/trace.ts` |
| Admin | Scoring Configuration → 11. Red Flags |
| Internal view | Internal report → Recency & red flag |
| Tests | `tests/source-recency.test.ts`, `tests/red-flag.test.ts` |
| Harnesses | `scripts/test13-recency-redflag.ts`, `scripts/test13-pdfs.ts` |
