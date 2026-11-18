import { defineConfig } from "vitest/config";
import path from "node:path";
import { testDatabaseUrl } from "./scripts/test-database";
export default defineConfig({
 resolve: { alias: { "@": path.resolve(__dirname, ".") } },
 test: { testTimeout: 20000, hookTimeout: 20000, fileParallelism: false, exclude: ["e2e/**", "node_modules/**", ".next/**", "out/**"], env: { DATABASE_URL: testDatabaseUrl("mealkeeper_test") }, globalSetup: ["./vitest.global-setup.ts"] },
});
