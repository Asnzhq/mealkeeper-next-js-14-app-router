import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

await mkdir("prisma/postgres/migrations/0001_init", { recursive: true });
let schema = await readFile("prisma/schema.prisma", "utf8");
schema = schema.replace('provider = "sqlite"', 'provider = "postgresql"');
await writeFile("prisma/postgres/schema.prisma", schema);
const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "diff", "--from-empty", "--to-schema-datamodel", "prisma/postgres/schema.prisma", "--script"], { encoding: "utf8" });
if (result.status !== 0) throw new Error(result.stderr || "Prisma schema diff failed");
await writeFile("prisma/postgres/migrations/0001_init/migration.sql", result.stdout);
console.log("PostgreSQL schema and initial migration generated.");
