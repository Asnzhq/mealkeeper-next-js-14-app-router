import { existsSync } from "node:fs";

export function testDatabaseUrl(schema: "mealkeeper_test" | "mealkeeper_e2e"): string {
  if (!process.env.TEST_DATABASE_URL && existsSync(".env")) process.loadEnvFile(".env");
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error("请为测试配置独立的 PostgreSQL 连接 TEST_DATABASE_URL。");

  const url = new URL(raw);
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
    throw new Error("TEST_DATABASE_URL 必须是 PostgreSQL 连接地址。");
  }
  url.searchParams.set("schema", schema);
  return url.href;
}
