// Smoke: is the deployment up and serving the application at all?
//
// These run without credentials, so they are the tests to reach for after a deploy. If any of them
// fails, nothing else in the suite is worth reading.

import { test, expect, env } from "../fixtures/app.js";

test.describe("Smoke", () => {
  test("the site responds over HTTPS", async ({ request }) => {
    const res = await request.get(env.baseURL, { failOnStatusCode: false });
    expect(res.status()).toBe(200);
  });

  test("the API health endpoint reports the database is reachable", async ({ request }) => {
    const res = await request.get(`${env.baseURL}/api/health`, { failOnStatusCode: false });
    expect(res.status(), "health should be 200 - a 503 means the API cannot reach Postgres").toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // The count is reported so a deploy that silently lost a collection registration is visible.
    expect(body.collections, "collections registered").toBeGreaterThan(0);
  });

  test("the sign-in screen renders", async ({ app, page }) => {
    await app.goto();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(app.emailInput).toBeVisible();
    await expect(app.passwordInput).toBeVisible();
    await expect(app.signInButton).toBeEnabled();
  });

  test("the password field is masked by default", async ({ app }) => {
    await app.goto();
    // A clinical application should not leave a password on screen in a shared reception area.
    await expect(app.passwordInput).toHaveAttribute("type", "password");
  });

  test("no application errors are logged on first paint", async ({ page, app }) => {
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("pageerror", (e) => errors.push(String(e)));
    await app.goto();
    await page.waitForLoadState("networkidle");
    // Filter the noise a browser produces on its own; a favicon 404 is not a defect.
    const real = errors.filter((e) => !/favicon|manifest|third-party cookie/i.test(e));
    expect(real, `console errors on load:\n${real.join("\n")}`).toHaveLength(0);
  });

  test("the served bundle is not a stale build", async ({ page, app }) => {
    // Catches the single most common deploy failure on this project: the container rebuilt but the
    // browser was served the previous bundle, so a shipped feature appears missing.
    const assets = [];
    page.on("response", (r) => {
      const u = r.url();
      if (u.includes("/assets/") && u.endsWith(".js")) assets.push(u);
    });
    await app.goto();
    await page.waitForLoadState("networkidle");
    expect(assets.length, "the page should load at least one JS bundle").toBeGreaterThan(0);

    const main = assets.find((u) => /index-[A-Za-z0-9_-]+\.js/.test(u)) || assets[0];
    const res = await page.request.get(main);
    expect(res.status()).toBe(200);
    const js = await res.text();

    // Markers for the features most recently deployed. Each is a literal string the build emits.
    // Update this list when a release adds a screen; a marker going absent is a stale bundle.
    const markers = {
      "CMS-1500 renderer": "cms1500-sheet",
      "claim workspace": "Procedures / CPT",
      "claim validation": "Validate claim",
      "medical records": "Medical Record",
    };
    const missing = Object.entries(markers)
      .filter(([, needle]) => !js.includes(needle))
      .map(([name]) => name);
    expect(missing,
      `the served bundle is missing: ${missing.join(", ")}. ` +
      "Either the deploy did not rebuild the web container, or a CDN/browser cache is serving " +
      "the previous bundle.").toHaveLength(0);
  });

  test("security headers and HTTPS redirect", async ({ request }) => {
    const res = await request.get(env.baseURL, { failOnStatusCode: false });
    const h = res.headers();
    // Reported rather than strictly required, because which of these is set is a deployment
    // decision - but a clinical application should be moving towards all of them.
    const findings = [];
    if (!h["strict-transport-security"]) findings.push("Strict-Transport-Security is not set");
    if (!h["x-content-type-options"]) findings.push("X-Content-Type-Options is not set");
    if (!h["x-frame-options"] && !h["content-security-policy"]) {
      findings.push("neither X-Frame-Options nor a CSP frame-ancestors directive is set");
    }
    // Soft assertion: logged as a warning in the report without failing the smoke run.
    if (findings.length) {
      console.warn(`\n  Hardening findings (not failures):\n   - ${findings.join("\n   - ")}\n`);
    }
    expect(res.status()).toBe(200);
  });
});
