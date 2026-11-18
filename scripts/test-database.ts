export function testDatabaseUrl(kind: "unit" | "e2e"): string {
  return kind === "unit" ? "file:./test.db" : "file:./family-e2e.db";
}
