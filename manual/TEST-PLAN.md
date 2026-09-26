# Test Plan — ClinicalEHRApplication (2set.com)

| | |
|---|---|
| **Application** | ClinicalEHRApplication — practice management, billing and EHR |
| **Environment under test** | `https://2set.com` (production) |
| **Stack** | React 19 + Vite (frontend), Go 1.27 (API), PostgreSQL 17 (Docker Compose) |
| **Test types** | Functional, regression, integration, security/authorization, negative, boundary, accessibility, print/output |
| **Automation** | Playwright (this repository, `tests/`) |
| **Plan owner** | Jobaid |

---

## 1. Why this plan is shaped the way it is

**The environment under test contains real patient records.** That single fact drives every
decision below:

- The automated suite is **read-only by default**. Any test that creates, edits or deletes is
  gated behind two independent switches (`IS_PRODUCTION=false` **and** `ALLOW_WRITES=true`).
- **Manual write testing must not be done on 2set.com.** Use a local instance or a staging copy.
  Test cases in `TEST-CASES.md` are tagged `[READ-ONLY]` or `[WRITE]` accordingly.
- **Test evidence is clinical data.** A screenshot of the billing ledger is a patient record.
  Store evidence in `evidence/` (gitignored) and never attach it to a public issue tracker.

This is also why there is no "create a test patient on production" step anywhere in this plan.
A test patient in a live clinical system gets billed, gets a claim submitted, and eventually
confuses somebody.

---

## 2. Scope

### In scope

| Module | Notes |
|---|---|
| Authentication & session | Sign-in, refusals, session boundary |
| Multi-factor authentication | Enrolment, challenge, backup codes, trusted devices, `MFA_ENFORCEMENT` |
| Role & permission enforcement | Tabs, per-user grants, **server-side** refusal |
| Patients | Demographics, search, insurance history |
| Scheduling | Appointments |
| Billing ledger | Charges, payments, write-offs, credits, adjustments |
| Payment posting | Manual, check, card, insurance, patient, batch, ERA/835 |
| Claims | Claim list, Edit Claim, **claim workspace**, validation |
| CMS-1500 / HCFA | Preview, preprinted print, with-form print, alignment, test page |
| Electronic claims | Availability reporting, validation gate, refusal behaviour |
| Medical records | Upload, viewer, print, PDF, download, email |
| Labs | Results, reference ranges, flags, trends |
| Prescriptions (Rx) | Drafting, signing, history, transmission refusal, controlled substances |
| HIM coding worklist | Assignment, coding, queries, completion |
| Antimicrobial review | Review entries, assignment, completion |
| Reports | Revenue, claim status, daily transactions, aging |
| Backup & restore | Create, download, upload, restore, settings |
| Access management | Per-user permission grants, audit of grant changes |
| Demo account | Availability, restrictions, no real PHI exposure |
| Audit logging | Coverage, and absence of unnecessary PHI |

### Out of scope

| Item | Why |
|---|---|
| Electronic claim **transmission** to a payer | No clearinghouse is contracted. The refusal path is in scope; delivery cannot be tested. |
| E-prescribing **transmission** to a pharmacy | Requires Surescripts certification. The refusal path is in scope. |
| Drug interaction / allergy checking | No licensed drug database. The application deliberately offers none. |
| Load and performance testing | Separate exercise. Do not load-test production. |
| Penetration testing | Requires written authorization; authorization checks here are functional, not adversarial. |
| Native mobile apps | None exist. |

---

## 3. Test approach

### 3.1 Functional testing
Each module is exercised against its documented behaviour using the cases in `TEST-CASES.md`.
Positive paths confirm the feature works; **negative and boundary cases carry more weight**,
because they are what breaks silently.

### 3.2 Regression testing
`REGRESSION-CHECKLIST.md` is run **after every deploy**. It is deliberately short enough to
complete in about 30 minutes, because a checklist nobody finishes protects nothing.

Regression risk on this application is concentrated in one place: `src/app.jsx` is a single file
of roughly 11,500 lines holding most screens. A change to a shared helper there can affect any
module, which is why the checklist touches every tab even when a release "only" changed claims.

### 3.3 Integration testing
The seams that have actually broken on this project:
- Frontend ↔ API: a deployed API route the frontend does not have, or the reverse (symptom: 404).
- API ↔ database: a migration that did not run (symptom: 500 on a new screen).
- Container ↔ container: a compose rebuild that updated `api` but served a cached `web` bundle
  (symptom: a shipped feature appears missing). **Automated: `01-smoke.spec.js`.**

### 3.4 Security / authorization testing
Tested at the **API level, not the UI level**. A hidden button is not access control. For every
permission-gated route: `401` without credentials, `403` with a session that lacks the grant.
**Automated: `06-api-authorization.spec.js`.**

### 3.5 Negative testing
Wrong passwords, wrong MFA codes, forged tokens, malformed input, missing required fields,
cross-patient access attempts, and submitted values the server must ignore (notably financial
totals, which must never be trusted from the browser).

### 3.6 Boundary testing
Zero, one, and many service lines; six versus seven CMS-1500 lines; 1 and 12 diagnosis codes;
zero-amount charges; a 20 MB file upload; a balance of exactly zero; a negative balance.

### 3.7 Print / output testing
Requires **physical paper and a real printer** — it cannot be automated meaningfully, because the
question is whether ink lands inside preprinted boxes. See `TEST-CASES.md` § HCFA printing.

### 3.8 Accessibility testing
Keyboard-only navigation, visible focus, accessible names on form controls, colour contrast on
status pills. One confirmed defect is already recorded (`A11Y-002`).

---

## 4. Entry criteria

- The deployment responds and `/api/health` returns `{"ok": true}`.
- The build under test is identified by commit SHA.
- `.env` is configured with test credentials (never committed).
- A database backup exists and its **file size has been checked** — a 0-byte dump is not a backup.

## 5. Exit criteria

- All `P1` cases pass.
- No open `Critical` or `High` defect in authentication, authorization, or financial calculation.
- The regression checklist passes in full.
- Every deviation is either fixed or recorded with an owner and a decision.

---

## 6. Severity definitions

| Severity | Meaning | Examples |
|---|---|---|
| **Critical** | Patient safety, data loss, or a breach | Wrong patient's record shown; permission not enforced server-side; deploy destroys data; a prescription reported as sent when it was not |
| **High** | Money or a core workflow is wrong | Total miscalculated; payment posts twice; claim cannot be printed; sign-in impossible |
| **Medium** | A feature is wrong but has a workaround | Filter returns wrong subset; validation misses a field; print alignment off by a fixed offset |
| **Low** | Cosmetic or minor | Label truncated; inconsistent date format; spacing |

## 7. Priority definitions

| Priority | Meaning |
|---|---|
| **P1** | Must pass before release. Auth, authorization, money, claim output, data preservation. |
| **P2** | Should pass. Main feature paths. |
| **P3** | Nice to have. Cosmetic, rare paths. |

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| Testing on production writes real data | Read-only default; two-switch guard; `[WRITE]` cases run only on a local or staging instance |
| Test evidence contains PHI | `evidence/` gitignored; traces treated as clinical records |
| One 11,500-line file means wide regression blast radius | Full-tab regression checklist after every deploy, regardless of what changed |
| Deploy appears to succeed but serves a stale bundle | Automated bundle-marker check in smoke |
| A migration silently does not run | Verify new tables exist after deploy; the `initdb` mount does **not** run on an existing database |
| Credentials leak into the repository | `.gitignore` covers `.env`; `.env.example` holds blanks only |

---

## 9. Deploy verification (run every time)

This project has had repeated deploys that appeared to succeed and did not land. Verify all four:

1. **Backup exists and is not empty** — `ls -lh ~/medbill-*.dump`, expect MB.
2. **The commit moved** — `git log --oneline -1` shows the expected SHA.
3. **Migrations applied** — the release's new tables exist.
4. **The bundle is new** — `npm run test:smoke` (the bundle-marker test).

Then confirm **no data loss** by diffing row counts and password hashes taken before the deploy.

---

## 10. Reference

- Automated suite: `tests/` — see `../README.md` to run.
- Test cases: `TEST-CASES.md`
- Per-release checklist: `REGRESSION-CHECKLIST.md`
- Defect template: `BUG-REPORT-TEMPLATE.md`
- Test data notes: `TEST-DATA.md`
