# ClinicalEHRTesting

Automated and manual test suite for the **ClinicalEHRApplication** deployment at
`https://2set.com` — a practice management, billing and EHR system (React + Go + PostgreSQL).

This is a separate project from the application itself, so the tests can be run and versioned
without touching the product.

---

## At a glance

| | |
|---|---|
| **Automated** | 67 Playwright tests across 6 files — smoke, auth, navigation, claims, other modules, and API authorization |
| **Manual** | 143 hand-written test cases across 13 areas, a test plan, a 37-check post-deploy regression list, and a defect template |
| **Test data workbook** | A 6-sheet Excel file generated from the manual test cases by a Python script (`openpyxl`) — live formulas for pass/fail totals, per-module and per-priority summaries, and a release recommendation |
| **Found real defects** | An accessibility issue (`A11Y-002`, unlabelled password field) and a missing security header (`SEC-001`), both still open |
| **Security focus** | Authorization is tested at the API level, not the UI — every permission-gated route is checked for a `401`/`403` server-side, because a hidden button in the browser proves nothing |

---

## ⚠️ The target is a live clinical system

`2set.com` holds **real patient records**. Everything in this repository is built around that:

- The automated suite is **read-only by default**.
- Any test that creates, edits or deletes is gated behind **two** switches —
  `IS_PRODUCTION=false` **and** `ALLOW_WRITES=true`. Forgetting either one skips the test rather
  than writing into a medical record.
- Traces, videos and screenshots of this application **are clinical data**. They land in
  `test-results/` and `playwright-report/`, both gitignored. Do not attach them to a public
  issue tracker.
- Manual `[WRITE]` test cases are for a local or staging instance, never production.

---

## Quick start

```bash
npm install
npx playwright install chromium

cp .env.example .env      # then fill in credentials - .env is gitignored
npm run test:smoke        # needs no credentials
```

### Everything, with credentials configured

```bash
npm test                  # the whole suite
npm run report            # open the HTML report
```

### Useful subsets

| Command | What it runs |
|---|---|
| `npm run test:smoke` | Is the deployment up, healthy, and serving a **current** bundle? No credentials needed. |
| `npm run test:auth` | Sign-in, refusals, MFA state, session boundary. |
| `npm run test:api` | **Server-side authorization.** The most valuable file here. |
| `npm run test:headed` | Watch it run in a real browser window. |
| `npm run test:ui` | Playwright's interactive UI mode. |
| `npm run codegen` | Record selectors against the live site. |

---

## Configuration

Copy `.env.example` to `.env`:

| Variable | Default | Meaning |
|---|---|---|
| `BASE_URL` | `https://2set.com` | Deployment under test |
| `IS_PRODUCTION` | `true` | When true, every write test is skipped |
| `ALLOW_WRITES` | `false` | Tester's explicit intent to create data |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | — | Broad-access account, read-only tests |
| `LIMITED_EMAIL` / `LIMITED_PASSWORD` | — | An account with **no** grants — required for the `403` tests |
| `DEMO_EMAIL` / `DEMO_PASSWORD` | — | The published demo account, if configured |

Tests skip with a clear reason when credentials are absent. **A skip is not a pass** — read the
run summary.

### To run write tests safely

Point at a local instance and turn both switches:

```bash
BASE_URL=http://localhost:5173 IS_PRODUCTION=false ALLOW_WRITES=true npm test
```

---

## Layout

```
├── playwright.config.js        Workers capped at 2 - a clinic's server is not a load target
├── fixtures/app.js             Sign-in helper, page object, API client, production write guard
├── tests/
│   ├── 01-smoke.spec.js        Up, healthy, and NOT serving a stale bundle. No credentials.
│   ├── 02-auth.spec.js         Sign-in, refusals, MFA state, challenge-token boundary
│   ├── 03-navigation.spec.js   Every tab renders without a client-side error
│   ├── 04-claims.spec.js       Claim workspace, CMS-1500 preview, validation, print modes
│   ├── 05-modules.spec.js      Ledger consistency, patients, reports, records, Rx
│   └── 06-api-authorization.spec.js   401 / 403 on every gated route
├── manual/
│   ├── Manual-Test-Execution.xlsx   The workbook a tester fills in (see below)
│   ├── TEST-PLAN.md            Scope, approach, severity, risks, deploy verification
│   ├── TEST-CASES.md           143 numbered cases across 13 areas — the source of truth
│   ├── REGRESSION-CHECKLIST.md Post-deploy pass, about 30 minutes
│   ├── BUG-REPORT-TEMPLATE.md  Defect template with severity guidance
│   └── TEST-DATA.md            Accounts, fixtures, and the files to test uploads with
└── scripts/
    └── build-test-workbook.py  Regenerates the .xlsx from TEST-CASES.md
```

---

## The manual test workbook

`manual/Manual-Test-Execution.xlsx` is what a tester actually works in. Six sheets:

| Sheet | Purpose |
|---|---|
| **Instructions** | How to use it, which cells to edit, tag meanings, severity guidance, one worked example row |
| **Run Info** | Build SHA, environment, tester, dates — plus calculated totals and a release recommendation |
| **Test Cases** | All 143 cases with a Result dropdown, Notes, Defect ID, Tested By, Date. Filterable and frozen. |
| **Summary** | Pass/fail/blocked/not-run per module and per priority, with exit criteria. Entirely calculated. |
| **Defect Log** | 100 rows with Severity, Priority and Status dropdowns |
| **Regression Checklist** | The 37-check post-deploy pass, with Result dropdowns and a verdict |

**Yellow cells are the ones to fill in.** Everything else is generated or calculated. Results are
colour-coded as you enter them, and `Run Info` turns a P1 failure into
"DO NOT RELEASE — n P1 case(s) failed".

### Regenerating it

`TEST-CASES.md` is the source of truth — the cases are **parsed** from it, never retyped, so the
two cannot drift apart. After editing the markdown:

```bash
pip install openpyxl        # once
python scripts/build-test-workbook.py
```

This **overwrites** the workbook, so export or copy any in-progress results first.

The file ships with formulas but no cached values (openpyxl cannot write them). Its
`fullCalcOnLoad` flag is set, so Excel, LibreOffice and Google Sheets all calculate on open. A
tool that only *reads* cells without calculating — `pandas`, a quick-look previewer — will show
blanks for the calculated cells until the file has been opened once in a spreadsheet application.

---

## Two things this suite is designed to catch

**1. A deploy that appears to work and does not.** This has happened repeatedly on this project:
the containers rebuild, the command exits zero, and the browser is served the previous bundle — so
a shipped feature looks missing. `01-smoke.spec.js` greps the served JavaScript for markers of the
most recent release and fails if they are absent.

When a release adds a screen, add its marker:

```js
const markers = {
  "CMS-1500 renderer": "cms1500-sheet",
  "claim workspace":   "Procedures / CPT",
  // ...
};
```

**2. A permission that is only enforced in the UI.** Every other test drives a browser and can
therefore only show that a button is *hidden*. `06-api-authorization.spec.js` calls each gated
route directly and requires `401` unauthenticated and `403` for a session without the grant. A
`200` there is a Critical defect, and no amount of UI testing would find it.

---

## Selector policy

Accessible names (`getByRole`, `getByLabel`) over CSS classes. The application is built with
Tailwind, so its class names are layout details that change with the design, while "the button
named Validate claim" is what the feature actually *is*. A test that fails because a margin changed
is worse than no test.

One documented exception, in `fixtures/app.js`: the password input has **no accessible name**,
because its `<label>` wraps both the input and the Show/Hide button — two labelable descendants, so
implicit label association does not apply. That is a real accessibility defect in the application,
recorded as `A11Y-002` in `manual/TEST-CASES.md`. The fixture uses a CSS selector and says why.
When the app adds an `id`/`for` pair or an `aria-label`, switch it back to `getByLabel`.

---

## Known findings

| ID | Finding | Status |
|---|---|---|
| `A11Y-002` | The password input has no accessible name (label wraps two labelable elements) | Open |
| `SEC-001` | `Strict-Transport-Security` is not set on `2set.com` | Open — reported as a warning by the smoke run, not a failure |

---

## CI

```yaml
- run: npm ci
- run: npx playwright install --with-deps chromium
- run: npm run test:smoke            # no credentials needed
- run: npm run test:api              # needs LIMITED_* secrets
  env:
    ADMIN_EMAIL: ${{ secrets.ADMIN_EMAIL }}
    ADMIN_PASSWORD: ${{ secrets.ADMIN_PASSWORD }}
    LIMITED_EMAIL: ${{ secrets.LIMITED_EMAIL }}
    LIMITED_PASSWORD: ${{ secrets.LIMITED_PASSWORD }}
```

Keep `IS_PRODUCTION=true` in CI unless the pipeline has its own disposable instance.

---

## Author

**Jobaid Azim**
