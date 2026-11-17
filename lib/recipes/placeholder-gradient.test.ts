import { describe, expect, it } from "vitest";
import { recipePlaceholderGradient } from "@/lib/recipes/placeholder-gradient";

describe("recipePlaceholderGradient", () => {
  it("uses the MD5-derived palette entry consistently for Unicode recipe names", () => {
    expect(recipePlaceholderGradient("番茄炒蛋")).toBe("from-avocado via-brand/50 to-warning");
    expect(recipePlaceholderGradient("番茄炒蛋")).toBe(recipePlaceholderGradient("番茄炒蛋"));
  });
});
