import { describe, expect, it } from "vitest";
import { md5 } from "@/lib/recipes/md5";

describe("md5", () => {
  it("matches standard UTF-8 MD5 vectors", () => {
    expect(md5("")).toBe("d41d8cd98f00b204e9800998ecf8427e");
    expect(md5("abc")).toBe("900150983cd24fb0d6963f7d28e17f72");
    expect(md5("番茄炒蛋")).toBe("b7ad29182ed312556111a0cbfe0af878");
  });
});
