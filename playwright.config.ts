import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 40000,
  retries: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "https://vishalashoppingmalls-counterflow.vercel.app",
    headless: false,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
