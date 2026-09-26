// Playwright configuration for the 2set.com deployment.
//
// The target is a live clinical system. Two choices in here follow from that.
//
// Workers are limited to 2 and retries to 1. A test suite is not a load test, and hammering a
// clinic's billing server with parallel browsers during working hours is its own kind of outage.
//
// Tracing and video are kept on first retry only. A trace of this application contains patient
// names and diagnoses, so the artefacts are gitignored and should be treated as clinical records -
// not attached to a public bug tracker.

import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config();

const BASE_URL = process.env.BASE_URL || "https://2set.com";

export default defineConfig({
  testDir: "./tests",

  // Fail the run if a test was left with test.only - otherwise a focused test silently
  // reduces a CI run to one case and still reports green.
  forbidOnly: !!process.env.CI,

  retries: process.env.CI ? 1 : 0,
  workers: 2,
  timeout: 45_000,
  expect: { timeout: 10_000 },

  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
    ["json", { outputFile: "test-results/results.json" }],
  ],

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    video: "on-first-retry",
    screenshot: "only-on-failure",

    // A real clinic browser. Left at defaults rather than a mobile viewport, because the
    // application is a desktop billing screen and testing it at 375px would report layout
    // failures that no user will ever see.
    viewport: { width: 1440, height: 900 },

    // Identify the suite in the server's access log, so a spike of requests during a test run is
    // recognisable rather than looking like an attack.
    extraHTTPHeaders: { "user-agent": "2set-testing/playwright" },

    ignoreHTTPSErrors: false,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
