// Authentication: sign-in, refusals, MFA state, and the session boundary.
//
// The valuable tests here are the negative ones. That a correct password works is obvious the
// moment anyone opens the site; that a WRONG one is refused without telling the attacker which
// half was wrong, and that a half-finished MFA challenge cannot be spent as a session, are the
// things that quietly break and that nobody notices by using the application normally.

import { test, expect, env, requireCredentials } from "../fixtures/app.js";

test.describe("Authentication", () => {
  test("a wrong password is refused", async ({ api }) => {
    requireCredentials(test, env.admin, "admin");
    const { status, body } = await api.login(env.admin.email, "definitely-not-the-password");
    expect(status).toBe(401);
    expect(body.token, "no session token on a failed sign-in").toBeFalsy();
  });

  test("an unknown account is refused with the same message as a wrong password", async ({ api }) => {
    const unknown = await api.login(`nobody-${Date.now()}@example.invalid`, "whatever");
    requireCredentials(test, env.admin, "admin");
    const wrongPw = await api.login(env.admin.email, "definitely-not-the-password");

    expect(unknown.status).toBe(401);
    // Identical wording matters: a different message for "no such user" hands an attacker a way to
    // enumerate which email addresses have accounts.
    expect(unknown.body.error,
      "the message must not reveal whether the account exists").toBe(wrongPw.body.error);
  });

  test("an empty password is refused", async ({ api }) => {
    requireCredentials(test, env.admin, "admin");
    const { status, body } = await api.login(env.admin.email, "");
    expect(status).not.toBe(200);
    expect(body.token).toBeFalsy();
  });

  test("a protected endpoint refuses an unauthenticated request", async ({ request }) => {
    const res = await request.get(`${env.baseURL}/api/auth/me`, { failOnStatusCode: false });
    expect(res.status()).toBe(401);
  });

  test("a protected endpoint refuses a forged token", async ({ request }) => {
    const res = await request.get(`${env.baseURL}/api/auth/me`, {
      headers: { authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJ1aWQiOiJhZG1pbiJ9.not-a-signature" },
      failOnStatusCode: false,
    });
    expect(res.status(), "an unsigned or wrongly-signed token must not be accepted").toBe(401);
  });

  test("the sign-in outcome is recorded, and MFA state is reported honestly", async ({ api }) => {
    requireCredentials(test, env.admin, "admin");
    const { status, body } = await api.login(env.admin.email, env.admin.password);
    expect(status).toBe(200);

    // Whichever of the three the server returns, exactly one should be present. This is the test
    // that catches an MFA_ENFORCEMENT change not taking effect: the outcome is printed, so a run
    // shows plainly whether the deployment is challenging, enrolling, or letting people straight in.
    const outcome = body.token ? "session"
      : body.mfaRequired ? "mfa-challenge"
        : body.mfaEnrollRequired ? "mfa-enrolment-demanded"
          : "unknown";
    console.log(`\n  Sign-in outcome for the admin account: ${outcome}\n`);
    expect(outcome, "the server returned none of the three documented outcomes").not.toBe("unknown");

    if (outcome === "mfa-challenge") {
      // A challenge token must NOT work as a session. This is the boundary the whole MFA feature
      // rests on, and it is worth an explicit test because the failure mode is invisible: the
      // application would simply let people in.
      expect(body.challenge, "a challenge outcome should carry a challenge token").toBeTruthy();
      const res = await api.request.get(`${env.baseURL}/api/auth/me`, {
        headers: { authorization: `Bearer ${body.challenge}` },
        failOnStatusCode: false,
      });
      expect(res.status(),
        "a challenge token must be refused by the application - it proves only that somebody " +
        "knew the password").toBe(401);
    }
  });

  test("a rejected MFA code does not produce a session", async ({ api }) => {
    requireCredentials(test, env.admin, "admin");
    const { body } = await api.login(env.admin.email, env.admin.password);
    test.skip(!body.mfaRequired, "Skipped: this deployment is not challenging for MFA.");

    const res = await api.request.post(`${env.baseURL}/api/auth/mfa/verify`, {
      headers: { authorization: `Bearer ${body.challenge}` },
      data: { code: "000000" },
      failOnStatusCode: false,
    });
    expect(res.status()).not.toBe(200);
    const verify = await res.json().catch(() => ({}));
    expect(verify.token, "a wrong code must not mint a session").toBeFalsy();
  });

  test("signing in through the UI reaches the application", async ({ app }) => {
    requireCredentials(test, env.admin, "admin");
    const outcome = await app.signIn(env.admin.email, env.admin.password);
    // Not asserted as "session", because a deployment with MFA on legitimately stops at the
    // challenge. Both are correct; "error" and "unknown" are not.
    expect(["session", "mfa-challenge", "mfa-enrol"]).toContain(outcome);
  });

  test("a wrong password shows an error in the UI and stays on the sign-in screen", async ({ app, page }) => {
    requireCredentials(test, env.admin, "admin");
    const outcome = await app.signIn(env.admin.email, "definitely-not-the-password");
    expect(outcome).toBe("error");
    await expect(app.signInButton, "the user should remain on the sign-in screen").toBeVisible();
    // The raw backend error must not be exposed.
    await expect(page.getByText(/pgx|postgres|sql|bcrypt|panic|goroutine/i)).toHaveCount(0);
  });

  test("the demo account, if published, signs in without MFA", async ({ api }) => {
    requireCredentials(test, env.demo, "demo");
    const { status, body } = await api.login(env.demo.email, env.demo.password);
    expect(status).toBe(200);
    expect(body.token, "a published demo account must be usable without an authenticator").toBeTruthy();
    expect(body.user?.isDemo, "the session should be labelled as a demo account").toBe(true);
  });
});
