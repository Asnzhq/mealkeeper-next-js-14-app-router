import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure", channel: "msedge", ...devices["Desktop Chrome"] },
  webServer: {
    command: "pnpm exec prisma db push --accept-data-loss && pnpm exec next dev --hostname 127.0.0.1",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    env: { ...process.env, DATABASE_URL: "file:./family-e2e.db", NEXTAUTH_URL: "http://127.0.0.1:3000", NEXTAUTH_SECRET: "mealkeeper-e2e-only-secret" },
    timeout: 120_000,
  },
});
