import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/session", () => ({ currentUser: async () => null }));

import { POST } from "@/app/api/ai-meals/route";
import { prisma } from "@/server/db";

afterEach(() => vi.unstubAllEnvs());

describe("AI planner local fallback response", () => {
  it("keeps the unified planner result shape when the AI provider is unavailable", async () => {
    vi.stubEnv("AI_API_KEY", "");
    vi.stubEnv("AI_BASE_URL", "https://mock.invalid/v1");
    vi.stubEnv("AI_MODEL", "mock-model");
    const response = await POST(new Request("http://localhost/api/ai-meals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipes: [{ id: "egg-toast", name: "鸡蛋吐司", meal_type: "breakfast", ingredients: [{ name: "鸡蛋", quantity: 2, unit: "个" }], duration_min: 20, tags: ["早餐"] }],
        inventory: [], targetDate: "2026-11-17", mealTypes: ["breakfast"], servings: 1, seed: 7,
      }),
    }));
    const payload = await response.json();
    await prisma.aiUsage.deleteMany();

    expect(payload).toMatchObject({
      code: 0,
      message: "已使用本地方案",
      data: { meals: [expect.objectContaining({ recipe_id: "egg-toast" })], shortages: [expect.objectContaining({ name: "鸡蛋" })], relaxed: ["inventory_satisfaction"], failureReason: null, seed: 7, fallback: true },
    });
  });
});
