import { execSync } from "node:child_process";
import { testDatabaseUrl } from "./scripts/test-database";

export default async function globalSetup() {
  const env = { ...process.env, DATABASE_URL: testDatabaseUrl("unit") };
  execSync("pnpm exec prisma db push --skip-generate", { stdio: "inherit", env });
}
