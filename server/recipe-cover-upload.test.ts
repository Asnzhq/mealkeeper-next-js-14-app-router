import { describe, expect, it } from "vitest";
import { RecipeCoverValidationError, validateRecipeCoverUpload } from "@/server/recipe-cover-upload";

const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const jpeg = Uint8Array.from([255, 216, 255, 0]);
const webp = Uint8Array.from([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]);

describe("validateRecipeCoverUpload", () => {
  it("accepts matching JPG, PNG and WebP files no larger than 5 MiB", () => {
    expect(validateRecipeCoverUpload("image/jpeg", jpeg.byteLength, jpeg)).toBe("jpg");
    expect(validateRecipeCoverUpload("image/png", png.byteLength, png)).toBe("png");
    expect(validateRecipeCoverUpload("image/webp", webp.byteLength, webp)).toBe("webp");
  });

  it("rejects unsupported image types and contents that do not match their MIME type", () => {
    expect(() => validateRecipeCoverUpload("image/gif", 8, png)).toThrow(RecipeCoverValidationError);
    expect(() => validateRecipeCoverUpload("image/png", jpeg.byteLength, jpeg)).toThrow(RecipeCoverValidationError);
  });

  it("rejects empty files and files larger than 5 MiB", () => {
    expect(() => validateRecipeCoverUpload("image/png", 0, png)).toThrow(RecipeCoverValidationError);
    expect(() => validateRecipeCoverUpload("image/png", 5 * 1024 * 1024 + 1, png)).toThrow(RecipeCoverValidationError);
  });
});
