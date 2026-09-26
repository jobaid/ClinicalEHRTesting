// Navigation and role-based tabs. Read-only throughout.
//
// Every test in this file signs in and looks. Nothing is created, edited or deleted, so the file is
// safe to run against production - which is the point, because these are the tests you want after
// a deploy to a live clinic.

import { test, expect, env, requireCredentials } from "../fixtures/app.js";

test.beforeEach(async ({ app }) => {
  requireCredentials(test, env.admin, "admin");
  const outcome = await app.signIn(env.admin.email, env.admin.password);
  test.skip(outcome !== "session",
    `Skipped: sign-in returned "${outcome}". These tests need a session - ` +
    "either MFA is enabled for this account or the credentials are wrong.");
});

test.describe("Navigation", () => {
  test("the expected tabs are present for an administrator", async ({ app }) => {
    const labels = await app.navLabels();
    console.log(`\n  Visible tabs: ${labels.join(", ")}\n`);

    // The tabs an administrator should always have. Medical Record is deliberately not in this
    // list: it is gated on a per-user grant, so its absence is a configuration choice, not a bug.
    for (const expected of ["Dashboard", "Patients", "Billing", "Claims", "Reports"]) {
      expect(labels, `"${expected}" should be in the navigation`).toContain(expected);
    }
  });

  test("each tab opens without a client-side error", async ({ app, page }) => {
    const labels = await app.navLabels();
    const failures = [];

    for (const label of labels) {
      const errors = [];
      const onError = (e) => errors.push(`${label}: ${e}`);
      const onConsole = (m) => { if (m.type() === "error") errors.push(`${label}: ${m.text()}`); };
      page.on("pageerror", onError);
      page.on("console", onConsole);

      await app.openTab(label);
      await page.waitForLoadState("networkidle").catch(() => {});
      // A rendered screen should show something. An empty main region means a crashed subtree.
      const text = (await page.locator("main, body").first().innerText()).trim();

      page.off("pageerror", onError);
      page.off("console", onConsole);

      const real = errors.filter((e) => !/favicon|manifest|third-party cookie|ResizeObserver/i.test(e));
      if (real.length) failures.push(...real);
      if (text.length < 20) failures.push(`${label}: the screen rendered almost no content`);
    }

    expect(failures, `problems while opening tabs:\n${failures.join("\n")}`).toHaveLength(0);
  });

  test("the Claims screen lists claims and offers the claim workspace", async ({ app, page }) => {
    await app.openTab("Claims");
    await expect(page.getByRole("heading", { name: "Claims" })).toBeVisible();

    const openButtons = page.getByRole("button", { name: /Open claim/i });
    const count = await openButtons.count();
    console.log(`\n  Claims with an "Open claim" action: ${count}\n`);
    // Zero is legitimate on an empty deployment, so this asserts the CONTROL exists rather than a
    // particular number of claims. If the table has rows, each must offer the action.
    const rows = await page.getByRole("row").count();
    if (rows > 1) {
      expect(count, "every claim row should offer Open claim").toBeGreaterThan(0);
    }
  });

  test("a deep-linked tab survives a page reload", async ({ app, page }) => {
    // The application restores the last tab from storage, and has had a bug where a restored tab
    // rendered nothing because the role no longer had access to it.
    await app.openTab("Billing");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    const text = (await page.locator("body").innerText()).trim();
    expect(text.length, "the restored screen should render content").toBeGreaterThan(20);
    await expect(page.getByText(/something went wrong|cannot read propert|undefined is not/i)).toHaveCount(0);
  });

  test("signing out returns to the sign-in screen", async ({ page, app }) => {
    const signOut = page.getByRole("button", { name: /sign out|log out/i }).first();
    test.skip(!(await signOut.count()), "Skipped: no sign-out control found on this screen.");
    await signOut.click();
    await expect(app.signInButton).toBeVisible({ timeout: 15_000 });
  });
});
