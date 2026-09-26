// Shared fixtures: sign-in, the production write guard, and a raw API client.
//
// Selectors here use accessible names (getByLabel, getByRole) rather than CSS classes. That is not
// a style preference: the application is built with Tailwind, so its class names are layout
// details that change whenever the design does, while "the input labelled Password" is what the
// feature actually is. A test that breaks because a margin changed is worse than no test.

import { test as base, expect } from "@playwright/test";

export const env = {
  baseURL: process.env.BASE_URL || "https://2set.com",
  isProduction: process.env.IS_PRODUCTION !== "false",
  allowWrites: process.env.ALLOW_WRITES === "true",
  admin: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD },
  limited: { email: process.env.LIMITED_EMAIL, password: process.env.LIMITED_PASSWORD },
  demo: { email: process.env.DEMO_EMAIL, password: process.env.DEMO_PASSWORD },
};

/**
 * Refuses to run a destructive test against production.
 *
 * Call at the top of any test that creates, edits or deletes. The two conditions are deliberately
 * separate: ALLOW_WRITES is the tester's intent, IS_PRODUCTION is a fact about the target, and a
 * write needs intent AND a target that is safe to dirty. Forgetting to flip one of them skips the
 * test rather than writing into somebody's medical record.
 */
export function requireWritableTarget(test) {
  test.skip(env.isProduction,
    "Skipped: the target is flagged as production and holds real patient records. " +
    "Point BASE_URL at a local or staging instance and set IS_PRODUCTION=false to run write tests.");
  test.skip(!env.allowWrites,
    "Skipped: set ALLOW_WRITES=true to run tests that create or modify data.");
}

/** Skips a test that needs credentials nobody supplied, rather than failing it as a bug. */
export function requireCredentials(test, account, name) {
  test.skip(!account?.email || !account?.password,
    `Skipped: no ${name} credentials in .env - see .env.example.`);
}

// ---------- page object ----------

export class AppPage {
  constructor(page) {
    this.page = page;
  }

  async goto() {
    await this.page.goto("/", { waitUntil: "domcontentloaded" });
  }

  get emailInput() { return this.page.getByLabel("Email"); }

  // NOT getByLabel("Password").
  //
  // The password field's <label> wraps a div containing both the input and the Show/Hide button,
  // so it has two labelable descendants and implicit label association does not apply - the input
  // ends up with no accessible name at all. That is a genuine accessibility defect in the
  // application (see manual/TEST-CASES.md, A11Y-002); this selector works around it rather than
  // pretending it is not there. When the app gives the input an id and the label a `for`, or an
  // aria-label, switch this back to getByLabel.
  get passwordInput() { return this.page.locator('form input[type="password"]'); }

  get signInButton() { return this.page.getByRole("button", { name: "Sign in" }); }

  /**
   * Signs in and reports what the application did: a session, an MFA challenge, an enrolment
   * demand, or an error. Returns the outcome rather than asserting one, so a single helper serves
   * both the happy path and the tests about MFA and bad passwords.
   */
  async signIn(email, password) {
    await this.goto();
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.signInButton.click();

    // Race the four possible outcomes. Whichever appears first is the answer.
    const signedIn = this.page.getByRole("navigation").or(this.page.getByText("Dashboard").first());
    const mfaCode = this.page.getByText(/verification code|authentication code|6.digit/i).first();
    const enrol = this.page.getByText(/scan|authenticator app|set up two/i).first();
    const error = this.page.getByText(/invalid email or password|incorrect/i).first();

    const outcome = await Promise.race([
      signedIn.waitFor({ timeout: 20_000 }).then(() => "session").catch(() => null),
      mfaCode.waitFor({ timeout: 20_000 }).then(() => "mfa-challenge").catch(() => null),
      enrol.waitFor({ timeout: 20_000 }).then(() => "mfa-enrol").catch(() => null),
      error.waitFor({ timeout: 20_000 }).then(() => "error").catch(() => null),
    ]);
    return outcome || "unknown";
  }

  /** Signs in as the admin account and asserts a real session was reached. */
  async signInAsAdmin() {
    const outcome = await this.signIn(env.admin.email, env.admin.password);
    expect(outcome, `sign-in did not reach a session (got "${outcome}")`).toBe("session");
  }

  /** The visible top-level navigation items, which reflect the role's tab grants. */
  async navLabels() {
    const nav = this.page.getByRole("navigation").first();
    await nav.waitFor();
    return (await nav.getByRole("button").allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  }

  async openTab(label) {
    await this.page.getByRole("button", { name: label, exact: true }).first().click();
  }
}

// ---------- raw API client ----------

/**
 * Talks to the API directly, with no browser.
 *
 * This is how authorization gets tested. A UI test can only show that a button is hidden, which is
 * not the same claim as "the server refuses" - and the server refusing is the part that matters.
 */
export class ApiClient {
  constructor(request, baseURL = env.baseURL) {
    this.request = request;
    this.baseURL = baseURL;
    this.token = null;
  }

  async login(email, password) {
    const res = await this.request.post(`${this.baseURL}/api/auth/login`, {
      data: { email, password },
      failOnStatusCode: false,
    });
    const body = await res.json().catch(() => ({}));
    // Only a real session token is kept. A challenge token proves the password was right and
    // nothing else, and storing it here would make later calls look authorized when they are not.
    if (body.token) this.token = body.token;
    return { status: res.status(), body };
  }

  headers() {
    return this.token ? { authorization: `Bearer ${this.token}` } : {};
  }

  async get(path) {
    const res = await this.request.get(`${this.baseURL}${path}`,
      { headers: this.headers(), failOnStatusCode: false });
    return { status: res.status(), body: await res.json().catch(() => ({})) };
  }

  async post(path, data = {}) {
    const res = await this.request.post(`${this.baseURL}${path}`,
      { headers: this.headers(), data, failOnStatusCode: false });
    return { status: res.status(), body: await res.json().catch(() => ({})) };
  }
}

// ---------- the test fixture ----------

export const test = base.extend({
  app: async ({ page }, use) => {
    await use(new AppPage(page));
  },
  api: async ({ request }, use) => {
    await use(new ApiClient(request));
  },
});

export { expect };
