import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
 resolve: { alias: { "@": path.resolve(__dirname, ".") } },
 test: { testTimeout: 20000, hookTimeout: 20000, fileParallelism: false, exclude: ["e2e/**", "node_modules/**", ".next/**"], env: { DATABASE_URL: "file:./test.db" }, globalSetup: ["./vitest.global-setup.ts"] },
});
