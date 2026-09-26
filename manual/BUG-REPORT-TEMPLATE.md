# Defect Report

```
ID:          BUG-____
Title:       <one line: what is wrong, not what you were doing>
Reported by:
Date:
Build / SHA:
Environment:  https://2set.com | local | staging
Module:       Auth | MFA | Permissions | Patients | Billing | Claims | HCFA | Medical records | Rx | Reports | Backup
Severity:     Critical | High | Medium | Low
Priority:     P1 | P2 | P3
Test case:    <e.g. CLM-006, or "exploratory">
Status:       Open | In progress | Fixed | Verified | Won't fix | Duplicate
```

## Steps to reproduce

1.
2.
3.

Reproducible: **always / sometimes (__ of __ attempts) / once**

## Expected result

## Actual result

## Impact

Who is affected, and what goes wrong for them. For anything touching money, state the amount.
For anything touching a patient record, state whether the wrong patient's data was shown.

## Evidence

- Screenshot / trace: `evidence/BUG-____/`
- Console output:
- Network request and response:

> **Evidence from this application is clinical data.** Keep it in `evidence/` (gitignored). Never
> attach a screenshot containing patient information to a public issue tracker. Redact names, dates
> of birth, member IDs and diagnoses before sharing outside the practice.

## Environment detail

```
Browser / version:
OS:
Screen size:
Account role:
Permissions held:
```

## Notes for the fix

Anything narrowing it down: which request failed, which field, whether it survives a reload,
whether it happens for one patient or all.

---

## Severity guidance

| Severity | Use when |
|---|---|
| **Critical** | Patient safety, data loss, or a breach. Wrong patient's record shown; a permission not enforced server-side; a deploy destroying data; a prescription or claim reported as sent when it was not. |
| **High** | Money or a core workflow is wrong. Miscalculated total; double-posted payment; claim cannot be printed; nobody can sign in. |
| **Medium** | Wrong behaviour with a workaround. Filter returns the wrong subset; validation misses a field; print offset consistently wrong. |
| **Low** | Cosmetic. Truncated label, inconsistent date format, spacing. |

**A defect in authentication, authorization, or financial calculation is never Low.**
