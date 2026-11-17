import { execSync } from "node:child_process";
export default async function globalSetup() {
 const env = { ...process.env, DATABASE_URL: "file:./test.db" };
 execSync("pnpm exec prisma db push --accept-data-loss", { stdio: "inherit", env });
}
