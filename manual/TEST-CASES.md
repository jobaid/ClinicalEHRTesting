# Manual Test Cases — ClinicalEHRApplication (2set.com)

**Tags:** `[READ-ONLY]` safe on production · `[WRITE]` local/staging only · `[PAPER]` needs a printer

**Result column:** Pass / Fail / Blocked / N/A. Record the build SHA and date at the top of each run.

> Run `[WRITE]` cases against a local instance or a staging copy. 2set.com holds real patient
> records; a test charge there becomes a real charge on a real person's account.

---

## 1. Authentication

| ID | Pri | Tag | Test case | Steps | Expected result | Result |
|---|---|---|---|---|---|---|
| AUTH-001 | P1 | READ-ONLY | Sign in with valid credentials | 1. Open the site 2. Enter a valid email and password 3. Sign in | Either the dashboard loads, or an MFA prompt appears if enforcement is on. No raw error text. | |
| AUTH-002 | P1 | READ-ONLY | Wrong password refused | Enter a valid email with a wrong password | "Invalid email or password". Stays on sign-in. No session. | |
| AUTH-003 | P1 | READ-ONLY | Unknown account refused identically | Enter an email with no account | **Exactly the same message** as AUTH-002. A different message lets an attacker enumerate accounts. | |
| AUTH-004 | P2 | READ-ONLY | Empty fields | Leave email and/or password blank, submit | Browser validation blocks submission; no request is sent. | |
| AUTH-005 | P2 | READ-ONLY | Password masked by default | Look at the password field | Characters are dots. A Show/Hide toggle is available. | |
| AUTH-006 | P2 | READ-ONLY | Show/Hide toggle | Type a password, click Show, then Hide | Text is revealed, then masked again. | |
| AUTH-007 | P1 | READ-ONLY | No backend detail leaks | Trigger a failed sign-in | No `pgx`, `postgres`, `sql`, `bcrypt`, `panic`, or stack trace anywhere on screen. | |
| AUTH-008 | P1 | READ-ONLY | Sign out ends the session | Sign in, sign out, press Back | Returns to sign-in. The application is not reachable by going back. | |
| AUTH-009 | P1 | READ-ONLY | Session required for the API | Sign out. In a new tab open `/api/auth/me` | `401`, not patient data. | |
| AUTH-010 | P2 | READ-ONLY | Remember me | Sign in with Remember me, close the tab, reopen | Behaviour matches the checkbox state; a fresh session is required if unchecked. | |
| AUTH-011 | P3 | READ-ONLY | Rapid repeated failures | Enter a wrong password 10 times | The application stays stable. Note whether any rate limiting exists. | |

## 2. Multi-factor authentication

| ID | Pri | Tag | Test case | Steps | Expected result | Result |
|---|---|---|---|---|---|---|
| MFA-001 | P1 | WRITE | Enrolment | Sign in on an account with MFA required and no enrolment | A QR code and a manual key are offered. | |
| MFA-002 | P1 | WRITE | Enrolment confirmed | Scan with an authenticator, enter the 6-digit code | Enrolment completes. Backup codes are shown **once**. | |
| MFA-003 | P1 | READ-ONLY | Correct code accepted | Sign in, enter the current code | Session granted. | |
| MFA-004 | P1 | READ-ONLY | Wrong code refused | Enter `000000` | Refused. No session. No detail about why. | |
| MFA-005 | P1 | READ-ONLY | Expired code refused | Wait for a code to roll over, then enter the old one | Refused. | |
| MFA-006 | P1 | READ-ONLY | Challenge token is not a session | After a challenge appears, use the challenge token against `/api/auth/me` | `401`. A challenge proves only that the password was right. | |
| MFA-007 | P2 | WRITE | Backup code works once | Use a backup code, then use the same one again | First succeeds; second is refused. | |
| MFA-008 | P2 | WRITE | Trusted device | Verify, tick trust, sign out, sign in from the same browser | No second factor for the trust window. | |
| MFA-009 | P2 | READ-ONLY | Trust is per browser | Sign in from a different browser | Second factor is required again. | |
| MFA-010 | P1 | READ-ONLY | `MFA_ENFORCEMENT=none` disables MFA for **enrolled** users | Set `none`, restart, sign in as an already-enrolled account | Signs in on password alone. *Regression: before `e257da0`, enrolled users were still challenged.* | |
| MFA-011 | P1 | WRITE | Enforcement is reversible | Set back to `all`, restart, sign in | Challenged again, **without re-scanning a QR code** — the enrolment survived. | |
| MFA-012 | P2 | READ-ONLY | Audit records a skipped factor | With `none`, sign in as an enrolled user, then check the login audit | The entry states that enforcement overrode the enrolment — not that the account had no MFA. | |

## 3. Roles and permissions

| ID | Pri | Tag | Test case | Steps | Expected result | Result |
|---|---|---|---|---|---|---|
| PERM-001 | P1 | READ-ONLY | Tabs match the role | Sign in as each role | Only permitted tabs are shown. | |
| PERM-002 | P1 | READ-ONLY | **Server enforces, not the UI** | As an account without a grant, call the gated route directly (e.g. `GET /api/claims/{id}/hcfa`) | `403`. **A `200` is a Critical defect.** | |
| PERM-003 | P1 | WRITE | Revocation takes effect immediately | Revoke a grant while the user is signed in; have them retry the action | Refused on the very next request — not after their token expires. | |
| PERM-004 | P1 | READ-ONLY | Grant cannot be self-issued | As a non-admin, attempt to write your own permission row | Refused. | |
| PERM-005 | P2 | READ-ONLY | Tab and grant agree | Compare the Medical Record tab's visibility with `DOCTOR_MEDICAL_RECORD_VIEW` | Visible if and only if the grant is held. | |
| PERM-006 | P2 | WRITE | High-risk grants warn | Grant `BACKUP_RESTORE` or `CLAIM_ELECTRONIC_SUBMIT` | A confirmation is required before saving. | |
| PERM-007 | P2 | WRITE | Grant changes are audited | Change a grant, check the audit | Who, whom, what, when — all recorded. | |
| PERM-008 | P1 | READ-ONLY | Super Admin cannot be locked out | Review backup permissions for SUPER_ADMIN | Always holds every grant; no table edit can remove it. | |

## 4. Patients

| ID | Pri | Tag | Test case | Steps | Expected result | Result |
|---|---|---|---|---|---|---|
| PAT-001 | P2 | READ-ONLY | List renders | Open Patients | Patients listed with name, DOB, identifiers. | |
| PAT-002 | P2 | READ-ONLY | Search | Search by name, then by MRN | Matching patients only. | |
| PAT-003 | P2 | READ-ONLY | Search with no match | Search nonsense | An empty state, not an error or a crash. | |
| PAT-004 | P1 | WRITE | Create | Add a patient with all fields | Saved. Appears in the list. **No duplicate created.** | |
| PAT-005 | P1 | WRITE | Duplicate prevention | Attempt to add the same patient twice | The second is prevented or flagged. | |
| PAT-006 | P2 | WRITE | Required fields | Save with the name blank | Refused with a clear message. | |
| PAT-007 | P1 | READ-ONLY | Insurance history is versioned | Open a patient with more than one policy | Old policies show as Terminated and are **still listed**, never deleted. | |
| PAT-008 | P1 | WRITE | Adding insurance preserves the old | Add a new primary policy | The previous one is retained with its dates. | |
| PAT-009 | P2 | READ-ONLY | Demographics completeness | Review patients used for billing | DOB, address, city, state, ZIP present — a claim is rejected without them. | |

## 5. Billing ledger and payment posting

| ID | Pri | Tag | Test case | Steps | Expected result | Result |
|---|---|---|---|---|---|---|
| BILL-001 | P1 | READ-ONLY | Ledger renders | Open Billing for a patient | DOS, CPT, Charge, Adjusted, Balance all present. | |
| BILL-002 | P1 | READ-ONLY | Balance arithmetic | Check a charge with payments and write-offs | Balance = charge − paid − write-off − credits. | |
| BILL-003 | P1 | WRITE | Post a check payment | Post a partial check payment | Balance decreases by exactly that amount. A transaction is recorded. | |
| BILL-004 | P1 | WRITE | Post a card payment | Post a card payment | Posted. **No full card number or CVV is stored or displayed anywhere.** | |
| BILL-005 | P1 | WRITE | Overpayment | Pay more than the balance | Handled explicitly — credit or refusal, never a silent negative. | |
| BILL-006 | P1 | WRITE | Write-off | Write off the remaining balance | Balance is zero. Recorded as a write-off, not a payment. | |
| BILL-007 | P1 | WRITE | Insurance vs patient payment | Post one of each | Recorded distinctly and reported separately. | |
| BILL-008 | P1 | WRITE | Credit transfer | Transfer a credit between dates of service | Both sides change; the total is unchanged. | |
| BILL-009 | P1 | WRITE | Batch required for posting | Attempt to post with no open batch | Prevented with an explanation. | |
| BILL-010 | P1 | WRITE | ERA/835 posting | Upload a remittance file | Matched rows post; unmatched are listed, not guessed at. | |
| BILL-011 | P1 | READ-ONLY | History is immutable | Review a posted transaction | It cannot be edited or deleted — only offset by a new entry. | |
| BILL-012 | P2 | WRITE | Recode a CPT | Recode a charge | Code and amount both update. A memo or history records it. | |
| BILL-013 | P2 | WRITE | Zero-amount charge | Post a charge of 0.00 | Handled without a divide-by-zero or `NaN`. | |
| BILL-014 | P1 | READ-ONLY | No negative amounts anywhere | Review the ledger | No negative charge, paid or write-off values. | |

## 6. Claims and the claim workspace

| ID | Pri | Tag | Test case | Steps | Expected result | Result |
|---|---|---|---|---|---|---|
| CLM-001 | P1 | READ-ONLY | Claims list renders | Open Claims | Claim, patient, payer, CPT/Dx, amount, status, actions. | |
| CLM-002 | P1 | READ-ONLY | Existing actions still work | Check Submit on a Draft claim, and Edit Claim from the ledger | Both still present and working. *Regression after the workspace was added.* | |
| CLM-003 | P1 | READ-ONLY | Workspace opens | Click **Open claim** | All eight sections render: Patient, Insurance, Provider, Claim, Diagnosis, Procedures/CPT, Service Facility, Claim Summary. | |
| CLM-004 | P1 | READ-ONLY | Auto-population | Compare the workspace with the patient and policy records | Demographics, insurance and provider fields match the stored records. Nothing is re-typed. | |
| CLM-005 | P1 | READ-ONLY | Insurance is read-only here | Try to edit insurance in the workspace | Not editable. A note points to the patient's Insurance tab. | |
| CLM-006 | P1 | READ-ONLY | **Total equals the sum of lines** | Compare the Claim Summary total with its line amounts | Exactly equal. A mismatch is a High defect. | |
| CLM-007 | P1 | READ-ONLY | Multiple service lines | Open a claim whose patient has several charges on one date | Each charge is a separate numbered line. | |
| CLM-008 | P1 | READ-ONLY | Twelve diagnosis slots | Check the Diagnosis section | Twelve slots labelled A–L. | |
| CLM-009 | P1 | WRITE | Diagnosis codes persist | Enter codes, save, reopen | All codes retained. *Regression: a charge whose array was not exactly 10 long used to lose every code.* | |
| CLM-010 | P2 | WRITE | Modifiers and POS persist | Set a modifier and place of service, save, reopen | Both retained per line. | |
| CLM-011 | P1 | WRITE | Validate reports by section | Click Validate claim | Problems grouped by section; clicking one scrolls to it. | |
| CLM-012 | P1 | WRITE | Invalid diagnosis pointer caught | Set a pointer to a letter with no diagnosis entered | Reported as a blocking problem. | |
| CLM-013 | P1 | WRITE | Invalid NPI caught | Set an NPI with a wrong check digit | Reported as a blocking problem. | |
| CLM-014 | P1 | READ-ONLY | Validation does not overstate | Read the validation panel | States that passing does **not** mean the claim will be accepted. | |
| CLM-015 | P1 | WRITE | Payer verdict preserved | Validate a claim already marked Denied | Stays **Denied**. It does not become "Validation Error". | |
| CLM-016 | P1 | WRITE | Incomplete claim not submitted | Remove the diagnosis, click Electronic claim | Refused, problems listed, nothing transmitted. | |
| CLM-017 | P1 | READ-ONLY | **Electronic claim honest when unconfigured** | Look at the Electronic claim button | Disabled, with a stated reason. **It must never report Submitted or Accepted.** | |
| CLM-018 | P1 | READ-ONLY | History is append-only | Open Claim history | Events listed oldest-first with who and when; states they are never overwritten. | |
| CLM-019 | P2 | WRITE | Unsaved-changes guard | Edit a field, then click Print or Electronic claim | Prompted to Save & continue or Cancel. Nothing is silently discarded. | |
| CLM-020 | P2 | READ-ONLY | Rejection shows the real reason | Open a Rejected claim | Shows the returned code and text, or says none was returned. **No invented reason.** | |

## 7. CMS-1500 / HCFA

| ID | Pri | Tag | Test case | Steps | Expected result | Result |
|---|---|---|---|---|---|---|
| HCFA-001 | P1 | READ-ONLY | Preview opens | Claim → HCFA preview | A full CMS-1500 sheet renders. | |
| HCFA-002 | P1 | READ-ONLY | Sheet is a fixed physical size | Measure or inspect the sheet | 8.5 × 11 in proportions. **Not responsive** — it must not reflow with the window. | |
| HCFA-003 | P1 | READ-ONLY | Box 1a, 2, 3 | Compare with the patient record | Member ID, patient name, DOB as `MM DD YYYY`. | |
| HCFA-004 | P1 | READ-ONLY | Box 5 address block | Compare with the patient record | Address, city, state, ZIP, phone in their own boxes. | |
| HCFA-005 | P1 | READ-ONLY | Box 21 diagnoses | Compare with the Diagnosis section | Codes in slots A–L, **in order**, with unused slots empty. | |
| HCFA-006 | P1 | READ-ONLY | Box 24 service lines | Compare with the Procedures section | DOS, POS, CPT, modifier, pointer, charge, units, NPI per line. | |
| HCFA-007 | P1 | READ-ONLY | Box 25, 31, 32, 33 | Compare with the Provider section | Tax ID, rendering provider, facility, billing provider + NPI. | |
| HCFA-008 | P1 | READ-ONLY | Box 28 total | Compare with the Claim Summary | Identical to the claim total. | |
| HCFA-009 | P1 | READ-ONLY | Missing data stays blank | Open a claim with gaps | Blank boxes. **Nothing is guessed or auto-filled.** | |
| HCFA-010 | P1 | READ-ONLY | Six-line cap | Open a claim with 7+ lines | Six lines on the sheet, and a warning that more than one sheet is needed. | |
| HCFA-011 | P1 | PAPER | **Preprinted print** | Load blank preprinted CMS-1500 stock. Print → HCFA preprinted paper | Only data prints. **No form outline.** Data lands inside the printed boxes. | |
| HCFA-012 | P1 | PAPER | With-form print | Print → HCFA with form | Form representation **and** data print together. | |
| HCFA-013 | P1 | READ-ONLY | The two modes are distinct | Compare HCFA-011 and HCFA-012 output | Clearly different. They must never be conflated. | |
| HCFA-014 | P1 | READ-ONLY | Facsimile disclaimer | Switch to With form | States it is not a substitute for official scannable red-ink stock. | |
| HCFA-015 | P1 | PAPER | Alignment test page | Tick Alignment test page, Test print | Every field prints its own box number. **No real claim needed.** | |
| HCFA-016 | P1 | PAPER | Horizontal calibration | Nudge the horizontal offset, reprint | Data shifts left/right by the offset. | |
| HCFA-017 | P1 | PAPER | Vertical calibration | Nudge the vertical offset, reprint | Data shifts up/down by the offset. | |
| HCFA-018 | P2 | WRITE | Offsets persist | Save the offset, reload, reopen the preview | The saved offset is applied. | |
| HCFA-019 | P2 | READ-ONLY | Offsets are bounded | Try a very large offset | Refused — an offset beyond an inch pushes data off the sheet. | |
| HCFA-020 | P1 | PAPER | No browser chrome prints | Print and inspect the page | No URL, page number, header, footer, or navigation. Margins are zero. | |
| HCFA-021 | P2 | WRITE | Prints are audited | Print, then check claim history | An `HCFA Printed` event with the user and timestamp. | |

## 8. Medical records

| ID | Pri | Tag | Test case | Steps | Expected result | Result |
|---|---|---|---|---|---|---|
| MR-001 | P1 | WRITE | Upload a PDF | Upload with a name and record date | Saved and listed. | |
| MR-002 | P1 | WRITE | Record date ≠ upload date | Upload with a past record date | Both dates stored separately. The record date is **never** defaulted to today. | |
| MR-003 | P1 | WRITE | Record date required | Upload with the date blank | Refused. | |
| MR-004 | P1 | WRITE | **Contents decide the type** | Rename an `.exe` to `.pdf` and upload | Refused — the file's bytes are checked, not its name. | |
| MR-005 | P1 | WRITE | Dangerous types refused | Try `.exe`, `.bat`, `.js` | Refused. | |
| MR-006 | P2 | WRITE | Size limit | Upload a file over 20 MB | Refused with a clear message. | |
| MR-007 | P1 | READ-ONLY | Uploader identity from the session | Inspect an uploaded record | The uploader is the signed-in user; a submitted name is ignored. | |
| MR-008 | P1 | READ-ONLY | Cross-patient access refused | Request a record under a different patient's id | `404`. Not the document. | |
| MR-009 | P1 | READ-ONLY | Not publicly accessible | Request the download URL while signed out | `401`. | |
| MR-010 | P2 | READ-ONLY | Viewer, print, PDF, download | Open a record and use each action | All work. Bytes download unmodified. | |
| MR-011 | P1 | READ-ONLY | Email refuses honestly | Email a record with no SMTP configured | Explicit failure. **Never a false "sent".** | |
| MR-012 | P1 | READ-ONLY | Header injection blocked | Put `\r\nBcc:` in the recipient | Refused. | |
| MR-013 | P2 | READ-ONLY | Search and filter | Filter by name and record type | Correct subset. | |

## 9. Prescriptions (Rx)

| ID | Pri | Tag | Test case | Steps | Expected result | Result |
|---|---|---|---|---|---|---|
| RX-001 | P1 | READ-ONLY | **Permission ≠ licence to prescribe** | Check prescriber status as an admin holding every permission | Not a prescriber unless a verified prescriber profile exists. A reason is given. | |
| RX-002 | P1 | WRITE | Draft a prescription | Enter medication, strength, dose, route, frequency, quantity, SIG | Saved as `DRAFT`. | |
| RX-003 | P1 | WRITE | Submitted prescriber ignored | Send a different prescriber NPI in the request | Ignored; the verified profile's NPI is used. | |
| RX-004 | P1 | WRITE | Signing needs verification | Sign without a verified profile | Refused, with the reason. | |
| RX-005 | P1 | WRITE | Signed prescription is immutable | Edit after signing | Refused. | |
| RX-006 | P1 | READ-ONLY | **Transmission refuses honestly** | Send with no provider configured | Fails explicitly, recorded as `FAILED`. **Never `ACCEPTED`.** | |
| RX-007 | P1 | WRITE | Controlled substances refused | Sign a controlled prescription | Refused, naming EPCS as the requirement. | |
| RX-008 | P1 | READ-ONLY | No invented clinical advice | Review the whole Rx flow | No dose suggestion, interaction warning, or allergy check — the app has no drug database. | |
| RX-009 | P2 | READ-ONLY | Pharmacy transmittability | Review a hand-typed pharmacy | Marked as not transmittable — it has no NCPDP id. | |
| RX-010 | P2 | WRITE | History preserved | Draft, sign, attempt send, cancel | Every status change retained. | |

## 10. Reports, backup, and audit

| ID | Pri | Tag | Test case | Steps | Expected result | Result |
|---|---|---|---|---|---|---|
| RPT-001 | P2 | READ-ONLY | Reports render | Open each report view | Renders without `NaN`, `undefined`, or a crash. | |
| RPT-002 | P1 | READ-ONLY | Figures reconcile | Compare a revenue report with the ledger | Totals agree. | |
| RPT-003 | P2 | READ-ONLY | Date ranges | Apply a range with no data | Empty state, not an error. | |
| BAK-001 | P1 | WRITE | Create a backup | Create one | Produced, with a **non-zero size**. | |
| BAK-002 | P1 | READ-ONLY | Size is shown | Review the backup list | Size displayed — a 0-byte backup must be obvious. | |
| BAK-003 | P1 | WRITE | Restore into a **test** instance | Restore a dump on a local instance | Data restored intact. **Never test restore on production.** | |
| BAK-004 | P1 | READ-ONLY | Restore is permission-gated | Attempt restore without the grant | Refused server-side. | |
| AUD-001 | P1 | READ-ONLY | Actions are audited | Perform a validate, a print, a grant change | All recorded with user, entity, timestamp. | |
| AUD-002 | P1 | READ-ONLY | **No unnecessary PHI in logs** | Review audit entries and server logs | No diagnosis codes, no prescription content, no passwords, no MFA codes. | |

## 11. Demo account

| ID | Pri | Tag | Test case | Steps | Expected result | Result |
|---|---|---|---|---|---|---|
| DEMO-001 | P2 | READ-ONLY | Credentials shown when enabled | Open the sign-in screen | Demo username and password displayed with a copy control. | |
| DEMO-002 | P2 | READ-ONLY | Signs in without MFA | Use the demo account | Signs in — a published account cannot be behind an authenticator nobody has. | |
| DEMO-003 | P1 | READ-ONLY | **No real PHI exposed** | Browse every screen as the demo user | No real patient records, labs, or documents are reachable. | |
| DEMO-004 | P1 | READ-ONLY | Demo cannot destroy data | Attempt backup restore and deletions | Refused. | |
| DEMO-005 | P2 | READ-ONLY | Session is labelled | Look at the header | The session is visibly marked as a demo. | |

## 12. Accessibility

| ID | Pri | Tag | Test case | Steps | Expected result | Result |
|---|---|---|---|---|---|---|
| A11Y-001 | P2 | READ-ONLY | Keyboard-only sign-in | Tab to each field and submit with Enter | Reachable in a logical order; focus is visible. | |
| **A11Y-002** | **P2** | READ-ONLY | **Password field has an accessible name** | Inspect the password input's accessible name | **KNOWN DEFECT.** Its `<label>` wraps both the input and the Show button, so implicit association does not apply and the input has no accessible name. Fix: add `id`/`for`, or `aria-label`. | **Fail** |
| A11Y-003 | P2 | READ-ONLY | Keyboard navigation of tabs | Tab through the navigation | All tabs reachable and activatable by keyboard. | |
| A11Y-004 | P3 | READ-ONLY | Status pill contrast | Check status pills against WCAG AA | 4.5:1 for normal text. | |
| A11Y-005 | P3 | READ-ONLY | Modal focus trapping | Open the HCFA modal and Tab | Focus stays within the modal; Escape closes it. | |
| A11Y-006 | P2 | READ-ONLY | Errors announced | Trigger a validation error with a screen reader | The message is announced, not only shown in colour. | |

## 13. Cross-browser and responsive

| ID | Pri | Tag | Test case | Expected result | Result |
|---|---|---|---|---|---|
| CB-001 | P2 | READ-ONLY | Chrome / Edge | Full functionality. | |
| CB-002 | P2 | READ-ONLY | Firefox | Full functionality; check the HCFA print dialog especially. | |
| CB-003 | P3 | READ-ONLY | Safari | Full functionality; `@page` handling differs — verify HCFA print. | |
| CB-004 | P3 | READ-ONLY | 1366 × 768 | Usable without horizontal scrolling. | |
| CB-005 | P3 | READ-ONLY | Tablet, 1024 wide | Claim workspace remains usable; side panels may stack. | |

---

## Recording a run

```
Build:        <commit SHA>
Environment:  <URL>
Date:         <date>
Tester:       <name>
Cases run:    __ / __     Pass: __   Fail: __   Blocked: __   N/A: __
Defects raised: <ids>
```

Raise every `Fail` using `BUG-REPORT-TEMPLATE.md`.
