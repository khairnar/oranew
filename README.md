# ORA Tenant Assessment Simulator

A configuration-driven simulator for ORA/RentenPe tenant screening. An internal
team member pastes or uploads a tenant's **Prefill API report** and **CIBIL
report** (or just a score), enters the **proposed monthly rent**, and the app
produces a **landlord-facing assessment report that never discloses the
tenant's financial information**.

It is a screening and simulation tool. It is not a legal, financial or tenancy
guarantee.

---

## Quick start

```bash
npm install
npm run dev
```

Then open <http://localhost:3000> and click **Load sample data** on the
dashboard. No backend, no API keys, no database — everything runs in the
browser.

Other commands:

```bash
npm run build      # production build
npm run start      # serve the production build
npm run typecheck  # tsc --noEmit
npm test           # 618 unit tests (vitest)
npx tsx scripts/generate-sample-report.ts   # regenerate docs/sample-report.md
```

Requires Node 20.11 or newer.

---

## What it does

### 1. Core flow

The **New Simulation** screen is a six-step wizard:

| Step | Screen | What happens |
| --- | --- | --- |
| 1 | Tenant Data | Upload or paste the Prefill API JSON |
| 2 | CIBIL Data | Upload or paste the CIBIL JSON, **or** type the score |
| 3 | Proposed Rent | Enter the monthly rent (e.g. ₹40,000) |
| 4 | Data Review | See every mapped field, every gap, every conflict |
| 5 | Generate Assessment | Weighted scoring against the active configuration |
| 6 | Preview Report | The landlord-facing report, ready to print or export |

The assessment regenerates live whenever an input or the configuration changes.

### 2. The landlord report

The landlord-facing output is the **ORA Tenant Screening Report**, a faithful
replication of the `ora-tenant-report-v42.html` reference: its CSS, layout,
typography, badges, section order, responsive behaviour and print rules,
scoped to `.ora-doc`.

Sections, in order: header and metadata, 1. Summary of findings, 2.
Verification, 3. Tenant profile, 4. Detailed signals, 5. Methodology, 6.
Disclaimer.

Section 4 carries **all 28 detailed signals**, every one landlord-visible, each
with a Result, a Confidence and a Finding. The configuration governs how a
signal is derived, never whether the landlord sees it.

The report component consumes only `reportData` and contains no calculations,
so a configuration change flows straight through to what the landlord sees.
Full detail in **[docs/landlord-report.md](docs/landlord-report.md)**.

### 3. Privacy

The landlord report is produced by a **privacy filter that runs after scoring
and before report generation**. The report generator is handed only:

```ts
createLandlordReport({
  tenantProfile: safeTenantProfile,   // masked identifiers only
  assessment: safeAssessment,          // rating labels only
  displayConfiguration: activeConfiguration.landlordDisplayRules,
  ratingLabels: activeConfiguration.ratingLabels,
});
```

It has no access to the normalised data, the raw uploads or the internal
scores, so it is structurally incapable of printing them.

**Never shown to a landlord:** income or salary amount, income breakdown, CIBIL
score, loan or credit-card accounts, EMI, outstanding balances, credit limits,
credit utilisation, number of loans, closed-account detail, enquiry counts,
total credit sought, the detailed bureau report, the full PAN, the full CKYC,
the full social ID, the rent-to-income ratio, or the internal numeric score.

**Shown to a landlord:** name, email, masked phone, masked PAN, masked other
documents, office email, last reported data date, overall rating, 19 category
ratings, rent assessment, verification status, general guidance, and a privacy
disclaimer.

Masking is on by default:

| Field | Raw | Landlord report |
| --- | --- | --- |
| PAN | `NYDPS4511L` | `NY******11L` |
| CKYC | `60006601145303` | `XXXXXXXXXX5303` |
| Phone | `9326374851` | `******4851` |

A leak scanner (`findSensitiveLeaks`) walks the finished report looking for
restricted field names and for any occurrence of the tenant's actual figures.
It runs in the UI before an export, inside the PDF builder, and in the test
suite — where eleven tests fail the build if anything leaks.

### 4. Two views

A toggle in the header switches between **Landlord View** (default) and
**Internal Admin View**. The Internal Admin Report page refuses to render at
all while the session is in Landlord View, so it cannot be shown to a landlord
by accident.

The internal report carries what the landlord report withholds: raw extracted
fields, parsed source payloads, the ORA score and its derivation, the internal
diagnostic score, missing fields, data conflicts, risk flags, income frequency,
rent-to-income and debt-to-income ratios, the bureau score, account-level
detail, reason codes and an audit trail.

### 4a. Two scores, one authoritative

```
28 Detailed Signals → 10 Weighted Scoring Parameters → ORA Score → Overall ORA Rating
```

**ORA Score** (`assessment.oraScore`) is weighted by the ten top-level
`scoringParameters` weights and is the only score the overall ORA rating is
derived from.

**Internal Diagnostic Score** (`assessment.diagnosticScore`) is the category
engine, weighted by `categoryWeights`. It explains which categories sit behind
the parameters and determines nothing — not the ORA score, not the rating, not
rent fit, not any of the 28 signals. It is never shown to a landlord, and every
screen that prints it also prints *"Diagnostic category score — does not
determine the ORA Score."*

Full detail, including the formula, the three kinds of weight and the A/B/C
weight experiment, is in **[docs/two-scores.md](docs/two-scores.md)**.

### 5. Everything is configurable

**No threshold, weight, band, label, wording or rule is hardcoded in the
engine.** The scoring engine's signature is:

```ts
calculateAssessment(normalizedTenantData, activeConfiguration, options)
```

The **Scoring Configuration** screen has twelve tabs: Detailed Signals (28),
How Parameters Are Derived, Category Weights, Rating Thresholds, Data-Point Rules, Rent Rules,
Exception Rules, Rating Labels, Landlord Display Rules, Configuration Versions,
Preview Changes and Audit Log.

### How This Parameter Is Derived

The first tab gives every one of the 65 scoring parameters an editable card
carrying its name, enabled toggle, source path, what it measures, why ORA uses
it, its derivation logic, its formula, its required inputs, its threshold table
with a label and score per band, its weight (within-category, category, and the
computed effective share of the overall score), its landlord-visibility and
internal-only toggles, its missing-data treatment, a worked example — plus the
live result against the loaded tenant — and a reset-to-default button.

Two buttons on each card, **Preview landlord view** and **Preview internal
admin view**, show exactly what each audience would see for that parameter.

Full detail, including all seven documented derivations, is in
**[docs/parameter-derivation.md](docs/parameter-derivation.md)**.

Every save creates a new **version**; the previously active version is archived
rather than overwritten, so an old report can always be reproduced against the
exact rules that were active when it was generated. Every report stores the
configuration id, version, generation timestamp, simulation id, input hash and
report mode.

Changes are never applied silently: you save a draft, use **Preview Changes**
to see the before/after effect on the current tenant, and then click **Activate
Configuration**.

---

## Folder structure

```
ora-tenant-assessment-simulator/
├─ samples/
│  ├─ prefill.sample.json          # sample Prefill API payload
│  └─ cibil.sample.json            # sample CIBIL payload
├─ docs/
│  ├─ landlord-report.md           # the v42 report and the 28 signals
│  ├─ two-scores.md                # ORA score vs internal diagnostic score
│  ├─ yashraj-reconciliation.md    # reconciliation against the v42 reference
│  ├─ scoring-logic.md             # how the score is built, in detail
│  ├─ parameter-derivation.md      # the per-parameter derivation layer
│  ├─ test-cases.md                # the test matrix and how to run it
│  ├─ sample-report.md             # real generated output (not a mock-up)
│  └─ sample-report.json           # the same report as JSON
├─ scripts/
│  └─ generate-sample-report.ts    # regenerates the two files above
├─ src/
│  ├─ app/
│  │  ├─ page.tsx                  # Dashboard
│  │  ├─ new-simulation/page.tsx   # Six-step wizard
│  │  ├─ extracted/page.tsx        # Extracted data + data-quality panel
│  │  ├─ scoring/page.tsx          # Scoring engine + simulation panel
│  │  ├─ report/page.tsx           # Landlord report
│  │  ├─ internal/page.tsx         # Internal admin report
│  │  ├─ compare/page.tsx          # Simulation / configuration comparison
│  │  ├─ settings/page.tsx         # Scoring configuration (10 tabs)
│  │  ├─ layout.tsx
│  │  └─ globals.css
│  ├─ components/
│  │  ├─ AppShell.tsx              # Nav, view toggle, toasts
│  │  ├─ ui.tsx                    # Buttons, cards, badges, tables, toggles
│  │  ├─ FileInput.tsx             # Drag-and-drop upload
│  │  ├─ SimulationPanel.tsx       # Presets + live override controls
│  │  ├─ LandlordReportView.tsx    # On-screen landlord report
│  │  ├─ ReportActions.tsx         # Print / PDF / JSON / copy
│  │  └─ admin/
│  │     ├─ ConfigTabs.tsx         # Weights, thresholds, rules, versions, audit
│  │     ├─ DerivationTab.tsx      # "How This Parameter Is Derived"
│  │     └─ ParameterCard.tsx      # One editable parameter card
│  ├─ lib/
│  │  ├─ types.ts                  # Every interface in the system
│  │  ├─ pipeline.ts               # parse → normalise → score → filter → report
│  │  ├─ parser/index.ts           # JSON parsing, type detection, score extraction
│  │  ├─ normalizer/index.ts       # Field-mapping layer, overrides, facts
│  │  ├─ masking/index.ts          # PAN / CKYC / phone / document masking
│  │  ├─ scoring/engine.ts         # The engine — no thresholds live here
│  │  ├─ report/
│  │  │  ├─ privacy.ts             # Privacy filter + leak scanner
│  │  │  ├─ landlord.ts            # Landlord report generator
│  │  │  ├─ internal.ts            # Internal admin report generator
│  │  │  └─ pdf.ts                 # jsPDF export, guarded
│  │  ├─ config/
│  │  │  ├─ defaultConfig.ts       # THE factory defaults — all rules live here
│  │  │  ├─ validation.ts          # Section 16N validation rules
│  │  │  └─ store.ts               # Versioning, activation, diffing, audit log
│  │  ├─ simulation/
│  │  │  ├─ presets.ts             # The ten presets
│  │  │  └─ compare.ts             # A vs B comparison
│  │  └─ samples/index.ts          # Loads the JSON in samples/
│  └─ state/AppStore.tsx           # Session state (localStorage + sessionStorage)
└─ tests/                          # 120 unit tests
```

### Typed interfaces

`src/lib/types.ts` defines `PrefillReport`, `CibilReport`, `TenantProfile`,
`NormalizedTenantData`, `AssessmentInput`, `CategoryAssessment`,
`OverallAssessment`, `LandlordReport`, `InternalReport`, `SimulationScenario`,
`ScoringConfiguration`, `DataPointRule`, `RuleBand`, `RentRules`,
`ExceptionRule`, `MissingDataRule`, `CategoryOverrideRule`,
`LandlordDisplayRules`, `RatingLabelConfig`, `ValidationResult` and
`ComparisonResult`.

---

## Data normalisation

Vendor payloads differ in shape, nesting, casing and field naming. The
normaliser flattens whatever arrives, maps it through alias lists, and records
what it could not map.

| Target | Aliases accepted |
| --- | --- |
| Name | `full_name`, `name`, `applicant_name`, `customer_name`, `tenant_name`, … |
| Phone | `mobile`, `phone`, `mobile_number`, `contact_number`, `msisdn`, … |
| Email | `email`, `personal_email`, `email_id`, `email_address`, … |
| Office email | `office_email`, `corporate_email`, `work_email`, `company_email`, … |
| PAN | `pan`, `pan_number`, `pan_no`, `permanent_account_number` |
| DOB | `dob`, `date_of_birth`, `birth_date` |
| Occupation | `occupation`, `employment_type`, `profession`, `job_type` |
| Income | `income`, `reported_income`, `monthly_income`, `annual_income`, `salary` |
| Last reported date | `created_at`, `createdAt`, `report_date`, `updated_at`, … |

It handles nested objects, arrays, missing fields, nulls, empty strings,
duplicates, `₹1,05,000`-style formatting, and dates in ISO, `DD/MM/YYYY`,
`DD-MM-YYYY` and `16 September 2026` formats. A second pass matches vendor
prefixes such as `applicant_pan_number`.

Unmapped fields and conflicts are surfaced in the **Extracted Data** screen's
data-quality panel — the app never invents a value to fill a gap.

### The one rule it will not bend

If the source does not state whether an income figure is monthly, annual or
weekly, the app **does not assume it is monthly**. `deriveMonthlyIncome`
returns `null`, Income Capacity becomes *Requires Verification*, and Rent
Affordability becomes *Requires Verification*. The `Missing Income Data` preset
demonstrates this.

---

## Scoring

See **[docs/scoring-logic.md](docs/scoring-logic.md)** for the full
explanation. In short:

1. `normalizeTenantData` produces `NormalizedTenantData`.
2. `buildScoringFacts` adds derived values (rent-to-income ratio, PAN
   availability, credit file age, …).
3. Each enabled **data-point rule** resolves its `sourceField` against those
   facts and matches the first band that fits, yielding a rating and a 0-100
   score. A missing value uses the rule's configured missing-data rating.
4. Each **category** is the weighted average of its data points, mapped to a
   rating through the configured category score bands. Parameters whose source
   value was missing may be **excluded** rather than scored, depending on their
   missing-data treatment — in which case ORA Data Confidence is reduced
   instead of the tenant being penalised. A **category override** can force a
   rating (this is how "unknown income frequency → Requires Verification" is
   expressed without hardcoding it).
5. The **internal score** is the weighted average of the scored categories,
   mapped through the configured overall score bands. In `normalized` scoring
   mode the weights need not total 100%.
6. **Exception rules** are evaluated. A serious adverse indicator overrides the
   weighted rating with *Requires Review*.
7. **Rent affordability** is computed from the configured ratio bands.
8. The **privacy filter** strips everything financial, and the report is
   generated.

Default category weights (editable, must total 100%):

| Group | Categories | Weight |
| --- | --- | ---: |
| Identity and KYC | KYC Status 7.5 + Identity Confidence 7.5 | 15% |
| Payment Discipline | Payment Discipline | 15% |
| Default History | Default History | 15% |
| Credit Behaviour | Credit Appetite | 15% |
| Employment Stability | Employment Stability | 10% |
| Income Capacity | Income Capacity | 10% |
| Address and City Stability | Address 4 + City 3 + Permanent Footprint 3 | 10% |
| Contact Traceability | Contact Traceability | 5% |
| ORA Data Confidence | ORA Data Confidence | 5% |
| Supplementary | Standard of Living, Legal, Vehicle, Tenant Readiness | 0% |

Supplementary categories are rated and shown to the landlord but carry no
weight by default. Exception Flags, Overall Rent Score and Rent Affordability
are derived rows and are excluded from the weight total.

---

## Simulation

The **simulation panel** (on the wizard's step 5 and the Scoring Engine screen)
overrides proposed rent, CIBIL score, income frequency, reported income,
employment status, employer availability, address completeness, payment
discipline, default history, KYC completeness, data confidence and document
verification.

Overrides are applied on top of the uploaded data — the original upload is
never modified, and **Clear overrides** restores the untouched report.

Ten presets are built in: Excellent Tenant, Very Good Tenant, Good Tenant, Fair
Tenant, Missing Income Data, Clean CIBIL but High Rent, Adverse Payment
History, Strong Identity but Incomplete KYC, New-to-Credit Tenant and High Data
Confidence.

The **Simulation Comparison** screen compares any two simulations under any two
configurations, showing the overall rating, rent affordability, every category
change, the changed input fields, the changed configuration fields and a plain
explanation of why the result moved. It presents the result as a simulation —
it never claims one configuration is objectively correct.

---

## Output

From the report screens you can preview, print, export PDF, export JSON, copy
the report text, reset the simulation, save the simulation to the session, and
load the sample data.

The PDF is A4, white, with RentenPe/ORA branding placeholders, rating badges,
clear sections, a privacy disclaimer, the generation date, the last reported
data date and a unique report id (`ORA-<simulation>-V<configuration version>`).
It is built from the already-filtered `LandlordReport` and refuses to render if
the leak scanner finds anything restricted.

---

## Storage

| Data | Where | Lifetime |
| --- | --- | --- |
| Scoring configurations + audit log | `localStorage` | Until cleared |
| Saved simulations | `sessionStorage` | Until the tab closes |
| Current working simulation | `sessionStorage` | Survives a page refresh |

Nothing leaves the browser. There is no backend and no network call.

---

## Testing

```bash
npm test
```

618 tests across 24 files. See **[docs/test-cases.md](docs/test-cases.md)** for
the full matrix, including the required cases: PAN/phone/CKYC masking, missing
income frequency, missing rent, CIBIL bands before and after an admin edit,
clean payment history, default flags, rent-to-income calculations, overall
score calculation, weight validation, overlapping ranges, wilful-default
exceptions, ordinary loans *not* creating exceptions, configuration versioning,
single-active-configuration enforcement, reset-to-default, archived
configurations, label propagation, PDF display rules, and eleven landlord
report privacy-filter tests.

---

## Known limitations

- Single-user, browser-only. There is no authentication, so the "authorised
  user" gate on full-PAN display is a configuration switch, not a real
  permission check.
- Verification statuses (documents, income, employment, address, contact) are
  reported as `false` unless a source explicitly says otherwise. The app has no
  way to verify anything itself, and deliberately never treats presence as
  verification.
- The illustrative sample in the original specification lists Payment
  Discipline as *Very Good* for a tenant with a perfectly clean bureau record.
  Under the specification's own rating definitions ("Excellent: no overdue, no
  DPD and consistently clean reported payment history") that record scores
  *Excellent*, and the engine reports it that way. The headline results —
  Overall **VERY GOOD**, Rental Assessment **GOOD — SUBJECT TO STANDARD
  VERIFICATION**, Exception Flags **None Reported** — match the specification
  exactly. See [docs/sample-report.md](docs/sample-report.md).
- Recharts is not used; the score visualisations are lightweight CSS bars, which
  keeps the bundle small and prints cleanly.

---

## Language rules

The app never uses "guaranteed tenant", "guaranteed rent payment", "zero risk",
"no criminal record", "financially secure" or "defaulter-free". It uses "no
adverse indicator reported in the available data", "subject to standard
verification", "based on available records", "not independently verified" and
"insufficient data to assess". A test asserts the prohibited phrases never
appear in landlord output.
