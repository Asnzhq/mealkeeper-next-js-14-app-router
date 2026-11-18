import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";
import { defaultDatabaseUrl } from "./lib/database-url";

if (existsSync(".env")) process.loadEnvFile(".env");
process.env.DATABASE_URL ??= defaultDatabaseUrl;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
});
