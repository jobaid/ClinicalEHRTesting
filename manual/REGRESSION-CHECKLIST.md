# Post-Deploy Regression Checklist

Run this **after every deploy to 2set.com**. Target: about 30 minutes. It is deliberately short —
a checklist nobody finishes protects nothing.

Everything here is **read-only** and safe on production.

```
Build deployed:  ________________  (git log --oneline -1)
Date / time:     ________________
Run by:          ________________
```

---

## A. Deploy landed at all (5 min)

This project has had several deploys that appeared to succeed and did not. Check all four.

| # | Check | How | Expected | ✓ |
|---|---|---|---|---|
| A1 | Backup exists and is **not empty** | `ls -lh ~/medbill-*.dump \| tail -1` | Size in MB. **A 0-byte file is not a backup.** | |
| A2 | The commit moved | `git log --oneline -1` | The SHA you intended to deploy | |
| A3 | Containers are up | `docker ps` | `db`, `api`, `web` all running | |
| A4 | The bundle is new | `npm run test:smoke` | 7 passed, including "the served bundle is not a stale build" | |

> If A4 fails, the browser or the `web` container is serving the previous bundle. Rebuild `web`
> and hard-refresh with **Ctrl+Shift+R**.

## B. No data loss (5 min)

Compare against the snapshot taken **before** the deploy.

| # | Check | Expected | ✓ |
|---|---|---|---|
| B1 | Row counts unchanged | `diff ~/before-counts.txt ~/after-counts.txt` is empty | |
| B2 | Passwords unchanged | `diff ~/before-users.txt ~/after-users.txt` is empty | |
| B3 | MFA enrolments intact | `user_mfa` count unchanged | |
| B4 | Trusted devices intact | `trusted_devices` count unchanged | |
| B5 | New tables exist | The release's tables are present | |

Command for B1/B2 (note: user is `medbill`, **not** `postgres`):

```bash
docker exec -t medbill-db-1 psql -U medbill -d medbill -c \
"SELECT 'users',count(*) FROM users
 UNION ALL SELECT 'user_mfa',count(*) FROM user_mfa
 UNION ALL SELECT 'trusted_devices',count(*) FROM trusted_devices
 UNION ALL SELECT 'patients',count(*) FROM patients
 UNION ALL SELECT 'claims',count(*) FROM claims
 UNION ALL SELECT 'charges',count(*) FROM charges
 UNION ALL SELECT 'transactions',count(*) FROM transactions;"
```

## C. Authentication (5 min)

| # | Check | Expected | ✓ |
|---|---|---|---|
| C1 | Sign in with a valid account | Reaches the application | |
| C2 | Wrong password | Refused, generic message, no stack trace | |
| C3 | MFA behaves as configured | Matches the intended `MFA_ENFORCEMENT` | |
| C4 | Sign out | Returns to sign-in; Back does not re-enter | |
| C5 | `/api/auth/me` signed out | `401` | |

Automated: `npm run test:auth`

## D. Every tab still renders (5 min)

A change to `src/app.jsx` can affect any screen, because most screens live in that one file.
**Open every tab even if the release "only" touched one module.**

| # | Tab | Renders | No console error | ✓ |
|---|---|---|---|---|
| D1 | Dashboard | | | |
| D2 | Schedule | | | |
| D3 | Patients | | | |
| D4 | Clinical | | | |
| D5 | Billing | | | |
| D6 | Claims | | | |
| D7 | Reports | | | |
| D8 | Medical Record *(if granted)* | | | |

Automated: `npx playwright test tests/03-navigation.spec.js`

## E. Money is still right (5 min)

| # | Check | Expected | ✓ |
|---|---|---|---|
| E1 | Open a patient's ledger | DOS, CPT, Charge, Adjusted, Balance all present | |
| E2 | Balance arithmetic | charge − paid − write-off − credits | |
| E3 | Claim total = sum of its lines | Exactly equal | |
| E4 | A report reconciles with the ledger | Totals agree | |
| E5 | No negative or `NaN` amounts | None anywhere | |

Automated: `npx playwright test tests/05-modules.spec.js`

## F. Authorization still enforced (3 min)

| # | Check | Expected | ✓ |
|---|---|---|---|
| F1 | Protected routes without credentials | `401` | |
| F2 | Protected routes with a session lacking the grant | `403` | |
| F3 | Collections API signed out | `401` | |

Automated: `npm run test:api` — **this is the one not to skip.**

## G. Claims and CMS-1500 (5 min)

| # | Check | Expected | ✓ |
|---|---|---|---|
| G1 | Claims list renders with Submit and Open claim | Both present | |
| G2 | Edit Claim from the ledger still works | Opens and saves | |
| G3 | Workspace opens with all eight sections | All present | |
| G4 | HCFA preview renders a fixed-size sheet | 8.5 × 11 proportions | |
| G5 | Print menu separates summary / preprinted / with form | Three distinct options | |
| G6 | Electronic claim disabled with a reason | Disabled, reason shown | |
| G7 | Alignment controls and test page available | Present | |

Automated: `npx playwright test tests/04-claims.spec.js`

## H. Sign-off

```
Result:    PASS  /  PASS WITH NOTES  /  FAIL
Defects raised:  ______________________________
Notes:           ______________________________
Signed:          ______________  Date: ________
```

**If B, C, E or F fails, treat it as a release blocker and consider rolling back:**

```bash
cd /opt/medbill
git log --oneline -5              # find the previous SHA
git checkout <previous-sha>
docker compose --env-file .env.docker -f docker-compose.yml -f mfa-off.yml up -d --build
```

Restoring the database is a **last resort** and loses everything entered since the backup. Only
do it for actual data corruption, never for a cosmetic fault.
