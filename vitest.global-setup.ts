import { execSync } from "node:child_process";
import { testDatabaseUrl } from "./scripts/test-database";

export default async function globalSetup() {
  const env = { ...process.env, DATABASE_URL: testDatabaseUrl("mealkeeper_test") };
  execSync("pnpm exec prisma migrate deploy", { stdio: "inherit", env });
}
