import { describe, expect, it } from "vitest";
import { bodyOf } from "@/server/http";
import { ingredientSchema } from "@/server/schemas";

describe("bodyOf", () => {
  it("returns Zod field errors in the shared API response envelope", async () => {
    const result = await bodyOf(new Request("http://localhost/api/ingredients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "鲈鱼", category: "海鲜", unit: "", stock_qty: 1 }),
    }), ingredientSchema);

    expect("response" in result).toBe(true);
    if (!("response" in result) || !result.response) throw new Error("Expected invalid payload response");
    const payload = await result.response.json();
    expect(payload).toMatchObject({ code: 422, message: expect.any(String), data: { fieldErrors: { unit: expect.any(Array) } } });
  });
});
