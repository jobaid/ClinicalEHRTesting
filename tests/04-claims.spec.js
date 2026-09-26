// The claim workspace, CMS-1500 preview, validation and the electronic claim boundary.
//
// Read-only. Validation is a POST, so it is treated as a write and guarded - it changes a claim's
// status and appends a history row, which on a live system is a real modification even though it
// modifies nothing financial.

import { test, expect, env, requireCredentials, requireWritableTarget } from "../fixtures/app.js";

test.beforeEach(async ({ app }) => {
  requireCredentials(test, env.admin, "admin");
  const outcome = await app.signIn(env.admin.email, env.admin.password);
  test.skip(outcome !== "session", `Skipped: sign-in returned "${outcome}".`);
  await app.openTab("Claims");
});

test.describe("Claim workspace", () => {
  async function openFirstClaim(page) {
    const open = page.getByRole("button", { name: /Open claim/i }).first();
    if (!(await open.count())) return false;
    await open.click();
    await page.getByRole("heading", { name: /^Claim / }).waitFor({ timeout: 15_000 });
    return true;
  }

  test("a claim opens into the sectioned workspace", async ({ page }) => {
    test.skip(!(await openFirstClaim(page)), "Skipped: this deployment has no claims to open.");

    // The sections the redesign specifies. Each is a heading, so this asserts the organisation of
    // the screen rather than any particular claim's data.
    for (const section of [
      "Patient Information", "Insurance Information", "Provider Information",
      "Claim Information", "Diagnosis", "Procedures / CPT", "Service Facility", "Claim Summary",
    ]) {
      await expect(page.getByRole("heading", { name: section }),
        `the "${section}" section should be present`).toBeVisible();
    }
  });

  test("the action bar offers the documented actions", async ({ page }) => {
    test.skip(!(await openFirstClaim(page)), "Skipped: no claims to open.");

    await expect(page.getByRole("button", { name: /Validate claim/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Print/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Electronic claim/i })).toBeVisible();
  });

  test("the Print menu separates the claim summary from the two CMS-1500 modes", async ({ page }) => {
    test.skip(!(await openFirstClaim(page)), "Skipped: no claims to open.");

    await page.getByRole("button", { name: /^Print/i }).click();
    await expect(page.getByRole("button", { name: /Claim summary/i })).toBeVisible();
    // Preprinted and with-form must be distinct options: printing data onto preprinted stock and
    // printing a facsimile of the form are different jobs and must not be conflated.
    await expect(page.getByRole("button", { name: /preprinted paper/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /with form/i })).toBeVisible();
  });

  test("Electronic claim is disabled, with a stated reason, when no clearinghouse is configured",
    async ({ page, request }) => {
      test.skip(!(await openFirstClaim(page)), "Skipped: no claims to open.");

      // Ask the server what it can do, then hold the UI to that answer.
      const cfgRes = await request.get(`${env.baseURL}/api/claims/config`, { failOnStatusCode: false });
      test.skip(cfgRes.status() !== 200, "Skipped: /api/claims/config is not reachable unauthenticated here.");
      const cfg = await cfgRes.json();

      const button = page.getByRole("button", { name: /Electronic claim/i });
      if (cfg.submissionAvailable === false) {
        await expect(button,
          "with no clearinghouse configured the control must not be clickable - offering an " +
          "action that cannot work is the failure this checks for").toBeDisabled();
        // And the reason must be visible or available, not silent.
        const explained = await page.getByText(/not configured/i).count();
        expect(explained, "the screen should say why submission is unavailable").toBeGreaterThan(0);
      } else {
        await expect(button).toBeEnabled();
      }
    });

  test("the CMS-1500 preview renders a full sheet at page size", async ({ page }) => {
    test.skip(!(await openFirstClaim(page)), "Skipped: no claims to open.");

    await page.getByRole("button", { name: /HCFA preview/i }).click();
    await expect(page.getByRole("heading", { name: /CMS-1500/i })).toBeVisible({ timeout: 15_000 });

    const sheet = page.locator(".cms1500-sheet");
    await expect(sheet).toBeVisible();

    // The sheet must be a fixed physical size, because it is printed onto preprinted stock. A
    // responsive width here would mean the data lands in the wrong boxes.
    const box = await sheet.boundingBox();
    expect(box, "the sheet should have a measurable box").toBeTruthy();
    const ratio = box.height / box.width;
    // US Letter is 8.5 x 11in, a ratio of about 1.294.
    expect(ratio, `the sheet ratio was ${ratio.toFixed(3)}, expected about 1.294 for US Letter`)
      .toBeGreaterThan(1.25);
    expect(ratio).toBeLessThan(1.34);
  });

  test("the alignment controls and test page are available", async ({ page }) => {
    test.skip(!(await openFirstClaim(page)), "Skipped: no claims to open.");
    await page.getByRole("button", { name: /HCFA preview/i }).click();
    await expect(page.getByRole("heading", { name: /CMS-1500/i })).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText(/Offset in/i)).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /Alignment test page/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Test print/i })).toBeVisible();
    // Calibration must not require a real claim.
    await expect(page.getByRole("checkbox", { name: /Box numbers/i })).toBeVisible();
  });

  test("the preview states that a black facsimile is not scannable stock", async ({ page }) => {
    test.skip(!(await openFirstClaim(page)), "Skipped: no claims to open.");
    await page.getByRole("button", { name: /HCFA preview/i }).click();
    await expect(page.getByRole("heading", { name: /CMS-1500/i })).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /With form/i }).click();
    // A practice must not be led to believe a printed facsimile is acceptable where a payer
    // requires official red drop-out stock.
    await expect(page.getByText(/not a substitute/i)).toBeVisible();
  });

  test("validating a claim reports problems by section", async ({ page }) => {
    requireWritableTarget(test);   // validation writes a status and a history row
    test.skip(!(await openFirstClaim(page)), "Skipped: no claims to open.");

    await page.getByRole("button", { name: /Validate claim/i }).click();
    const panel = page.getByRole("heading", { name: "Validation" });
    await expect(panel).toBeVisible();
    await expect(
      page.getByText(/No missing data found|problem(s)? to fix/i),
      "validation should report an outcome either way").toBeVisible({ timeout: 20_000 });

    // Whatever the outcome, the screen must not overstate it.
    await expect(page.getByText(/does not mean the claim will be accepted/i)).toBeVisible();
  });

  test("the claim total is the sum of its service lines", async ({ page }) => {
    test.skip(!(await openFirstClaim(page)), "Skipped: no claims to open.");

    const summary = page.locator("#claim-summary");
    await expect(summary).toBeVisible();
    const text = await summary.innerText();

    // Pull every currency figure out of the summary. The last is the total; the rest are lines.
    const amounts = [...text.matchAll(/\$([\d,]+\.\d{2})/g)].map((m) => Number(m[1].replace(/,/g, "")));
    test.skip(amounts.length < 2, "Skipped: the summary did not show line amounts and a total.");

    const total = amounts[amounts.length - 1];
    const lines = amounts.slice(0, -1);
    const sum = lines.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - total),
      `the displayed total ${total} does not equal the sum of its lines ${sum}`).toBeLessThan(0.01);
  });

  test("claim history is shown and describes what happened", async ({ page }) => {
    test.skip(!(await openFirstClaim(page)), "Skipped: no claims to open.");
    await expect(page.getByRole("heading", { name: /Claim history/i })).toBeVisible();
    await expect(page.getByText(/never overwritten/i)).toBeVisible();
  });
});
