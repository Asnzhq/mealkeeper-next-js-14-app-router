import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const result = spawnSync(process.execPath, ["node_modules/next/dist/bin/next", "build"], { stdio: "inherit", env: { ...process.env, ANALYZE: "true" } });
if (result.status !== 0) process.exit(result.status ?? 1);

const root = path.resolve(".next/static/chunks");
function scripts(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return scripts(target);
    return target.endsWith(".js") ? [target] : [];
  });
}
const chunks = scripts(root).map((file) => ({ file: path.relative(root, file), gzip: gzipSync(readFileSync(file)).byteLength })).sort((a, b) => b.gzip - a.gzip);
const manifest = JSON.parse(readFileSync(".next/app-build-manifest.json", "utf8"));
const firstLoadRoutes = Object.fromEntries([["/", "/page"], ["/ingredients", "/ingredients/page"]].map(([route, key]) => {
  const files = manifest.pages[key].filter((file) => file.endsWith(".js"));
  const gzipBytes = files.reduce((sum, file) => sum + gzipSync(readFileSync(path.resolve(".next", file))).byteLength, 0);
  return [route, { gzipBytes, files }];
}));
const summary = { generatedAt: new Date().toISOString(), allClientChunksGzipBytes: chunks.reduce((sum, chunk) => sum + chunk.gzip, 0), firstLoadRoutes, largestChunks: chunks.slice(0, 20) };
const output = path.resolve(".next/analyze");
await import("node:fs/promises").then(({ mkdir, writeFile }) => mkdir(output, { recursive: true }).then(() => writeFile(path.join(output, "gzip-report.json"), JSON.stringify(summary, null, 2))));
console.log(`Home first-load JS: ${firstLoadRoutes["/"].gzipBytes} gzip bytes`);
console.log(`Ingredients first-load JS: ${firstLoadRoutes["/ingredients"].gzipBytes} gzip bytes`);
console.log(`All client chunks: ${summary.allClientChunksGzipBytes} gzip bytes across ${chunks.length} chunks`);
console.log(`Analyzer reports: ${path.resolve(".next/analyze")}`);
