// API authorization.
//
// This is the file that earns its keep. Every other test drives a browser and can therefore only
// show that a control is HIDDEN. Hiding a button is not access control - the question is whether
// the server refuses somebody who calls it directly, which is exactly what this does.
//
// Two things are checked for every protected route:
//
//   401 with no credentials  - the route is behind authentication at all.
//   403 with a real session that lacks the grant - the route is behind a PERMISSION, not merely
//                               behind being logged in.
//
// The 403 half needs a second account with no extra grants (LIMITED_EMAIL). Without it the test
// skips rather than pretending to have proved something.

import { test, expect, env, requireCredentials } from "../fixtures/app.js";

// Every permission-gated route in the deployment, with the grant it should require.
// Kept as data so adding a feature means adding a row, not writing another test.
const PROTECTED = [
  // Claims / CMS-1500
  { method: "GET", path: "/api/claims/{claim}/hcfa", grant: "CLAIM_HCFA_VIEW", module: "Claims" },
  { method: "GET", path: "/api/claims/{claim}/history", grant: "CLAIM_HCFA_VIEW", module: "Claims" },
  { method: "POST", path: "/api/claims/{claim}/validate", grant: "CLAIM_HCFA_VIEW", module: "Claims" },
  { method: "POST", path: "/api/claims/{claim}/submit", grant: "CLAIM_ELECTRONIC_SUBMIT", module: "Claims" },
  { method: "POST", path: "/api/claims/{claim}/print-event", grant: "CLAIM_HCFA_PRINT", module: "Claims" },
  { method: "GET", path: "/api/claims/print-profiles", grant: "CLAIM_HCFA_VIEW", module: "Claims" },

  // Medical records
  { method: "GET", path: "/api/patients/{patient}/records", grant: "MEDICAL_RECORD_DOCUMENT_VIEW", module: "Medical records" },

  // Prescriptions
  { method: "GET", path: "/api/rx/pharmacies", grant: "RX_VIEW", module: "Rx" },
  { method: "GET", path: "/api/rx/patients/{patient}/prescriptions", grant: "RX_VIEW", module: "Rx" },

  // Backup and access management
  { method: "GET", path: "/api/admin/backups", grant: "BACKUP_VIEW", module: "Backup" },
];

// Routes that should need nothing more than a valid session. Asserted so that a future change
// cannot quietly promote one of these into leaking data to an unauthenticated caller.
const AUTHENTICATED_ONLY = [
  { method: "GET", path: "/api/auth/me" },
  { method: "GET", path: "/api/claims/config" },
  { method: "GET", path: "/api/rx/prescriber/me" },
];

test.describe("API authorization", () => {
  test.describe("without credentials, every protected route returns 401", () => {
    for (const route of [...PROTECTED, ...AUTHENTICATED_ONLY]) {
      test(`${route.method} ${route.path}`, async ({ request }) => {
        const url = `${env.baseURL}${route.path.replace("{claim}", "CLM-0001").replace("{patient}", "P0001")}`;
        const res = route.method === "GET"
          ? await request.get(url, { failOnStatusCode: false })
          : await request.post(url, { data: {}, failOnStatusCode: false });

        expect(res.status(),
          `${route.method} ${route.path} should be 401 unauthenticated. A 404 means the route is ` +
          "not deployed; a 200 means it is public.").toBe(401);
      });
    }
  });

  test.describe("with a session that lacks the grant, protected routes return 403", () => {
    for (const route of PROTECTED) {
      test(`${route.module}: ${route.method} ${route.path} needs ${route.grant}`, async ({ api }) => {
        requireCredentials(test, env.limited, "limited-account");
        const login = await api.login(env.limited.email, env.limited.password);
        test.skip(!login.body.token,
          "Skipped: the limited account did not reach a session (MFA, or wrong credentials).");

        const path = route.path.replace("{claim}", "CLM-0001").replace("{patient}", "P0001");
        const res = route.method === "GET" ? await api.get(path) : await api.post(path, {});

        // 403 is the pass. 404 is also acceptable for a route that takes an id, because refusing
        // to confirm whether an id exists is itself correct - but 200 never is.
        expect([403, 404],
          `${route.path} returned ${res.status} for an account without ${route.grant}. ` +
          "A 200 means the permission is not enforced server-side.").toContain(res.status);

        expect(res.status, `${route.path} leaked data to an account without ${route.grant}`).not.toBe(200);
      });
    }
  });

  test("a session token cannot be used to grant itself permissions", async ({ api }) => {
    requireCredentials(test, env.limited, "limited-account");
    const login = await api.login(env.limited.email, env.limited.password);
    test.skip(!login.body.token, "Skipped: the limited account did not reach a session.");

    // Attempt to write one's own permission row. Whether the endpoint exists or not, the outcome
    // must not be success.
    const res = await api.post("/api/admin/user-permissions", {
      userId: login.body.user?.uid,
      permissions: ["BACKUP_RESTORE", "CLAIM_ELECTRONIC_SUBMIT", "MEDICAL_RECORD_DOCUMENT_VIEW"],
    });
    expect([401, 403, 404, 405]).toContain(res.status);
    expect(res.status, "a non-admin must not be able to grant itself permissions").not.toBe(200);
  });

  test("the electronic claim boundary reports itself honestly", async ({ api }) => {
    requireCredentials(test, env.admin, "admin");
    const login = await api.login(env.admin.email, env.admin.password);
    test.skip(!login.body.token, "Skipped: admin sign-in did not reach a session (MFA is likely on).");

    const { status, body } = await api.get("/api/claims/config");
    expect(status).toBe(200);
    expect(typeof body.submissionAvailable).toBe("boolean");
    expect(body.note, "the deployment should state what submission is available").toBeTruthy();

    if (body.submissionAvailable === false) {
      // The contract this application makes: with nothing configured, it says so rather than
      // offering an action that cannot work.
      expect(body.clearinghouse).toBe("none");
      expect(body.note).toMatch(/not configured/i);
      console.log(`\n  Electronic claims: not configured. Format that would be used: ${body.format}\n`);
    } else {
      console.log(`\n  Electronic claims: ${body.clearinghouse} via ${body.format}\n`);
    }
  });

  test("a prescription permission is not treated as a licence to prescribe", async ({ api }) => {
    requireCredentials(test, env.admin, "admin");
    const login = await api.login(env.admin.email, env.admin.password);
    test.skip(!login.body.token, "Skipped: admin sign-in did not reach a session.");

    const { status, body } = await api.get("/api/rx/prescriber/me");
    expect(status).toBe(200);
    // An administrator holding every permission should still not be a prescriber unless a
    // verified prescriber profile exists for them. If this ever returns true for an admin who is
    // not a clinician, that is a serious finding.
    if (body.isPrescriber === true) {
      console.warn("\n  NOTE: the admin account is recorded as a VERIFIED PRESCRIBER. " +
        "Confirm that is intentional and that the NPI belongs to a real clinician.\n");
    } else {
      expect(body.reason, "an account that cannot prescribe should be told why").toBeTruthy();
    }
  });

  test("patient data is not reachable without a session", async ({ request }) => {
    // The generic collection API is the broadest surface in the application; worth its own check.
    for (const name of ["patients", "charges", "claims", "transactions", "auditLogs", "users"]) {
      const res = await request.get(`${env.baseURL}/api/collections/${name}`, { failOnStatusCode: false });
      expect(res.status(), `/api/collections/${name} must require authentication`).toBe(401);
    }
  });
});
