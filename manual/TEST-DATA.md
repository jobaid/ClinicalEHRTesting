# Test Data Notes

## Accounts

Credentials live in `.env`, which is **gitignored**. `.env.example` lists the variables with blank
values. Never commit a real password, and never paste one into an issue, a chat, or a commit
message.

| Variable | Purpose |
|---|---|
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Broad access. Read-only navigation and rendering tests. |
| `LIMITED_EMAIL` / `LIMITED_PASSWORD` | **No extra grants.** The only way to prove the API returns `403` rather than assuming it. Without this account the authorization tests skip. |
| `DEMO_EMAIL` / `DEMO_PASSWORD` | The published demo account, if one is configured. |

If a password has ever been pasted into a chat, a ticket, or a terminal history that others can
read, rotate it. Treat it as disclosed.

## Creating the limited account

The authorization tests are the most valuable part of this suite, and they need an account holding
**no** per-user grants:

1. Sign in as a Super Admin.
2. Create a user with a role that grants tabs but no extra permissions (MANAGER works).
3. In Access Management, confirm it holds **no** grants at all.
4. Put its credentials in `.env` as `LIMITED_*`.

Do not give this account any grant later "just to check something" — the moment it holds one, the
403 tests stop testing anything.

## Data for manual testing

**Do not create test data on 2set.com.** A test patient in a live clinical system gets billed,
gets a claim generated, and eventually confuses somebody. Use a local instance.

For a local instance, the data worth having:

| Case | Why it matters |
|---|---|
| A patient with **complete** demographics | The claim validation happy path |
| A patient **missing** ZIP and address | Exercises the validation failures |
| A patient with **two policies**, one terminated | Insurance versioning, and Box 1a/11 mapping |
| A patient whose subscriber is **someone else** | Box 4, 6, 7 and the relationship mapping |
| **One** charge on a date | The single-service-line CMS-1500 |
| **Two or more** charges on the same date | Multiple service lines, and the server-side total |
| **Seven** charges on one date | The six-line cap and the second-sheet warning |
| A charge with a **modifier** | Box 24D |
| A charge with **12 diagnoses** | The full Box 21 A–L |
| A charge with **one** diagnosis and pointer `B` | The invalid-pointer validation |
| A provider with an **invalid NPI check digit** | The NPI validation |
| A claim in each status | Draft, Ready, Validation Error, Submitted, Paid, Denied, Rejected |
| A charge that is **fully paid** | Zero balance display |
| A charge that is **overpaid** | Credit handling |

## Files for upload testing

| File | Expected |
|---|---|
| A real PDF | Accepted |
| A real JPEG and PNG | Accepted |
| An `.exe` **renamed** to `.pdf` | **Refused** — contents decide the type, not the name |
| A PNG **renamed** to `.txt` | Accepted as a PNG |
| A file over 20 MB | Refused |
| A 0-byte file | Refused |

Build these with a shell rather than downloading anything:

```bash
printf '%%PDF-1.4\n%s\n%%%%EOF\n' "$(head -c 600 /dev/zero | tr '\0' ' ')" > ok.pdf
printf 'MZ' > fake.pdf && head -c 400 /dev/zero >> fake.pdf
head -c 21000000 /dev/urandom > toobig.pdf
: > empty.pdf
```

## Dates

The application stores a record date separately from an upload date, and a date of service
separately from a submission date. When testing, always use a **past** record date and date of
service so that a defaulted "today" is immediately visible as wrong.
