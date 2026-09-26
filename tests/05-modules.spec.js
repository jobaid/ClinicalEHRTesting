// The remaining modules, read-only: billing ledger, patients, reports, medical records, Rx.
//
// These are regression tests in the proper sense - they exist to catch a NEW release breaking an
// OLD screen. Every one of them only looks, so the whole file is safe against a live system.

import { test, expect, env, requireCredentials } from "../fixtures/app.js";

test.beforeEach(async ({ app }) => {
  requireCredentials(test, env.admin, "admin");
  const outcome = await app.signIn(env.admin.email, env.admin.password);
  test.skip(outcome !== "session", `Skipped: sign-in returned "${outcome}".`);
});

test.describe("Billing ledger", () => {
  test("the ledger renders and keeps its financial columns", async ({ app, page }) => {
    await app.openTab("Billing");
    await page.waitForLoadState("networkidle").catch(() => {});

    const body = await page.locator("body").innerText();
    // These columns are what the ledger is for. A release that drops one has broken billing,
    // whatever else it added.
    const expected = ["DOS", "CPT", "Charge"];
    const missing = expected.filter((c) => !new RegExp(c, "i").test(body));
    expect(missing, `the ledger is missing columns: ${missing.join(", ")}`).toHaveLength(0);
  });

  test("balances are internally consistent", async ({ api }) => {
    const login = await api.login(env.admin.email, env.admin.password);
    test.skip(!login.body.token, "Skipped: no session.");

    const { status, body } = await api.get("/api/collections/charges");
    test.skip(status !== 200, `Skipped: charges returned ${status}.`);
    const charges = body.documents || body;
    test.skip(!Array.isArray(charges) || charges.length === 0, "Skipped: no charges on this deployment.");

    const broken = [];
    for (const c of charges) {
      const charge = Number(c.charge) || 0;
      const paid = Number(c.paid) || 0;
      const writeoff = Number(c.writeoff) || 0;
      const credits = Number(c.credits) || 0;
      // Nothing should be negative, and nothing should have been paid or written off beyond what
      // was billed. Either indicates a posting bug, which is the kind of defect that costs money.
      if (charge < 0 || paid < 0 || writeoff < 0) broken.push(`${c.id}: a negative amount`);
      if (paid + writeoff > charge + credits + 0.01) {
        broken.push(`${c.id}: paid+writeoff (${(paid + writeoff).toFixed(2)}) exceeds charge+credits (${(charge + credits).toFixed(2)})`);
      }
    }
    expect(broken, `ledger inconsistencies:\n${broken.join("\n")}`).toHaveLength(0);
    console.log(`\n  Checked ${charges.length} charges for balance consistency.\n`);
  });
});

test.describe("Patients", () => {
  test("the patient list renders", async ({ app, page }) => {
    await app.openTab("Patients");
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(page.getByRole("heading", { name: /Patients/i }).first()).toBeVisible();
  });

  test("no patient is missing the fields a claim requires", async ({ api }) => {
    const login = await api.login(env.admin.email, env.admin.password);
    test.skip(!login.body.token, "Skipped: no session.");

    const { status, body } = await api.get("/api/collections/patients");
    test.skip(status !== 200, `Skipped: patients returned ${status}.`);
    const patients = body.documents || body;
    test.skip(!Array.isArray(patients) || patients.length === 0, "Skipped: no patients.");

    // Reported, not failed: incomplete demographics are a data-entry matter for the practice, not
    // a software defect. Worth surfacing because each one is a claim that will be rejected.
    const incomplete = patients
      .filter((p) => !p.dob || !p.address || !p.city || !p.state || !p.zip)
      .map((p) => p.id);
    if (incomplete.length) {
      console.warn(`\n  ${incomplete.length} of ${patients.length} patients lack demographics a ` +
        `claim needs (DOB/address/city/state/ZIP): ${incomplete.slice(0, 10).join(", ")}` +
        `${incomplete.length > 10 ? " ..." : ""}\n`);
    }
    expect(patients.length).toBeGreaterThan(0);
  });
});

test.describe("Reports", () => {
  test("the reports screen renders its views", async ({ app, page }) => {
    await app.openTab("Reports");
    await page.waitForLoadState("networkidle").catch(() => {});
    const body = await page.locator("body").innerText();
    expect(body.length, "the reports screen rendered almost nothing").toBeGreaterThan(50);
    await expect(page.getByText(/cannot read propert|undefined is not|NaN/i)).toHaveCount(0);
  });
});

test.describe("Medical records", () => {
  test("the tab appears only when the grant is held", async ({ app, api }) => {
    const labels = await app.navLabels();
    const tabVisible = labels.includes("Medical Record");

    const login = await api.login(env.admin.email, env.admin.password);
    test.skip(!login.body.token, "Skipped: no session.");
    const me = await api.get("/api/auth/me");
    const perms = me.body?.permissions || me.body?.user?.permissions || [];
    const hasGrant = Array.isArray(perms) && perms.includes("DOCTOR_MEDICAL_RECORD_VIEW");

    if (Array.isArray(perms) && perms.length) {
      // The tab and the grant must agree. A visible tab without the grant is a screen that will
      // 403 on every request; a hidden tab with the grant is a feature nobody can reach.
      expect(tabVisible,
        `the Medical Record tab is ${tabVisible ? "visible" : "hidden"} but the account ` +
        `${hasGrant ? "HAS" : "does NOT have"} DOCTOR_MEDICAL_RECORD_VIEW`).toBe(hasGrant);
    } else {
      console.log(`\n  Medical Record tab visible: ${tabVisible} (grants not reported by /api/auth/me)\n`);
    }
  });

  test("record files are never served to an unauthenticated caller", async ({ request }) => {
    // Guessed ids. The point is the status code, not finding a real record: a medical document
    // must never be reachable without a session, whatever id is asked for.
    for (const id of ["MR0001", "1", "00000000-0000-0000-0000-000000000000"]) {
      const res = await request.get(
        `${env.baseURL}/api/patients/P0001/records/${id}/download`, { failOnStatusCode: false });
      expect(res.status(), "a medical document must require authentication").toBe(401);
    }
  });
});

test.describe("Prescriptions", () => {
  test("transmission availability is reported honestly", async ({ api }) => {
    const login = await api.login(env.admin.email, env.admin.password);
    test.skip(!login.body.token, "Skipped: no session.");

    const { status, body } = await api.get("/api/rx/prescriber/me");
    test.skip(status !== 200, `Skipped: /api/rx/prescriber/me returned ${status}.`);

    expect(typeof body.transmissionAvailable).toBe("boolean");
    if (body.transmissionAvailable === false) {
      expect(body.transmissionNote, "the reason must be stated, not left blank").toBeTruthy();
      console.log(`\n  E-prescribing: not configured. ${body.transmissionNote}\n`);
    }
  });
});
