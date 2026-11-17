import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const baseURL = "http://127.0.0.1:3000";
const environment = { ...process.env, DATABASE_URL: "file:./dev.db", NEXTAUTH_URL: baseURL, NEXTAUTH_SECRET: "mealkeeper-pwa-smoke-secret" };
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1"], { env: environment, stdio: "ignore" });
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { ready = (await fetch(baseURL)).ok; if (ready) break; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error("Production server did not start");
  console.log("Production server ready.");
  browser = await chromium.launch({ channel: "msedge", headless: true });
  console.log("Browser ready.");
  const context = await browser.newContext({ serviceWorkers: "allow" });
  const page = await context.newPage();
  const browserErrors = [];
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("response", (response) => { if (response.status() >= 400) browserErrors.push(`HTTP ${response.status()} ${response.url()}`); });

  await page.goto(`${baseURL}/ingredients`, { waitUntil: "domcontentloaded", timeout: 15_000 });
  console.log("Ingredients document loaded.");
  await page.getByRole("heading", { name: "家里的食材", exact: true }).waitFor();
  console.log("Ingredients heading rendered.");
  await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.locator("main#main-content").waitFor({ timeout: 15_000 });
  await page.goto(`${baseURL}/ingredients`, { waitUntil: "domcontentloaded", timeout: 15_000 });
  const registrationState = await page.evaluate(async () => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const result = registrations.map((registration) => ({ scope: registration.scope, active: registration.active?.state, installing: registration.installing?.state, waiting: registration.waiting?.state }));
      if (result.some((registration) => registration.active === "activated")) return result;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return (await navigator.serviceWorker.getRegistrations()).map((registration) => ({ scope: registration.scope, active: registration.active?.state, installing: registration.installing?.state, waiting: registration.waiting?.state }));
  });
  console.log(`Service worker registrations: ${JSON.stringify(registrationState)}`);
  if (!registrationState.some((registration) => registration.active === "activated")) throw new Error(`Service worker not active: ${browserErrors.slice(0, 8).join(" | ")}`);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; if (!navigator.serviceWorker.controller) throw new Error("Page is not controlled by the service worker"); });
  const pageIsCached = await page.evaluate(async () => (await (await caches.open("mealkeeper-pages-v1")).keys()).some((request) => new URL(request.url).pathname === "/ingredients"));
  if (!pageIsCached) throw new Error("Ingredients document was not cached");
  await page.evaluate(async () => {
    const cache = await caches.open("mealkeeper-read-api-v1");
    const fixture = [{ id: "offline-fixture", name: "离线测试食材", category: "蔬菜", unit: "个", stock_qty: 7, safety_stock: 2, storage: "冷藏", expiry_date: null, cost_per_unit: 0, tags: [], inventory_logs: [] }];
    const store = async (url, data) => cache.put(new Request(url, { credentials: "same-origin" }), new Response(JSON.stringify({ code: 0, data, message: "" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    await store("/api/ingredients", fixture);
    await store("/api/recipes", []);
    await store("/api/account", { local_mode: true });
    await store("/api/preferences", null);
    await store("/api/ai-usage", { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, averageDurationMs: 0, estimatedCost: 0, currency: "USD", windowDays: 30 });
    for (let offset = 0; offset < 7; offset += 1) {
      const date = new Date(); date.setDate(date.getDate() - offset);
      await store(`/api/plans?date=${date.toISOString().slice(0, 10)}`, []);
    }
  });

  // Warm the root document after the worker controls the page so the offline
  // navigation cache contains both the today's menu route and ingredients.
  await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 15_000 });
  await page.locator("main#main-content").waitFor({ timeout: 15_000 });

  await context.setOffline(true);
  const offlineProbe = await page.evaluate(async () => { const response = await fetch("/api/ingredients"); return { status: response.status, body: await response.text() }; });
  console.log(`Offline API probe: ${offlineProbe.status} ${offlineProbe.body.slice(0, 180)}`);
  await page.close();
  const offlinePage = await context.newPage();
  offlinePage.on("console", (message) => { if (message.type() === "error") browserErrors.push(message.text()); });
  offlinePage.on("pageerror", (error) => browserErrors.push(error.message));
  const offlineResponses = [];
  offlinePage.on("response", (response) => { if (new URL(response.url()).pathname.startsWith("/api/")) offlineResponses.push(`${response.status()} ${response.url()}`); });
  await offlinePage.goto(`${baseURL}/ingredients`, { waitUntil: "domcontentloaded", timeout: 15_000 });
  await offlinePage.getByRole("heading", { name: "家里的食材", exact: true }).waitFor();
  const offlineController = await offlinePage.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? "none");
  if (offlineController === "none") throw new Error("Offline ingredients page is not controlled by the service worker");
  const cachedData = await offlinePage.evaluate(async () => { const response = await fetch("/api/ingredients"); return { status: response.status, body: await response.text() }; });
  if (cachedData.status !== 200 || !cachedData.body.includes("离线测试食材")) throw new Error(`Offline API cache was not readable: ${cachedData.status} ${cachedData.body.slice(0, 160)}; ${offlineResponses.join(" | ")}`);
  await offlinePage.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 15_000 });
  await offlinePage.getByRole("heading", { name: "今天吃得好一点" }).waitFor({ timeout: 15_000 });
  const manifest = await offlinePage.evaluate(async () => await (await fetch("/manifest.json")).json());
  if (manifest.display !== "standalone" || !manifest.icons.some((icon) => icon.sizes === "192x192") || !manifest.icons.some((icon) => icon.sizes === "512x512")) throw new Error("PWA manifest is missing install metadata");
  console.log("PWA offline smoke passed: today and ingredients pages rendered offline, and cached ingredient API data remained readable.");
} finally {
  await browser?.close();
  server.kill();
}
