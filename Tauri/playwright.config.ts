import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:1420",
    browserName: "chromium",
    channel: "msedge",
    headless: true,
    viewport: { width: 1280, height: 850 },
  },
  webServer: {
    command: "npm.cmd run dev",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: !process.env.CI,
  },
  reporter: "list",
  outputDir: "test-results",
});
