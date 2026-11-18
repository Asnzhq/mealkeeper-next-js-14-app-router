import { spawnSync } from "node:child_process";

// Keep the legacy entry point usable without rewriting the committed migrations.
const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "generate"], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
