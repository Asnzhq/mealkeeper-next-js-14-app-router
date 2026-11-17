export type RecipeCoverValidationCode = "unsupported_type" | "invalid_size" | "signature_mismatch";

export class RecipeCoverValidationError extends Error {
  constructor(readonly code: RecipeCoverValidationCode) {
    super(code);
    this.name = "RecipeCoverValidationError";
  }
}

const maxBytes = 5 * 1024 * 1024;
const signatures: Record<string, { extension: "jpg" | "png" | "webp"; matches: (bytes: Uint8Array) => boolean }> = {
  "image/jpeg": { extension: "jpg", matches: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  "image/png": { extension: "png", matches: (bytes) => [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte) },
  "image/webp": { extension: "webp", matches: (bytes) => String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP" },
};

export function validateRecipeCoverUpload(contentType: string, size: number, bytes: Uint8Array): "jpg" | "png" | "webp" {
  const signature = signatures[contentType];
  if (!signature) throw new RecipeCoverValidationError("unsupported_type");
  if (!Number.isSafeInteger(size) || size <= 0 || size > maxBytes || size !== bytes.byteLength) throw new RecipeCoverValidationError("invalid_size");
  if (!signature.matches(bytes)) throw new RecipeCoverValidationError("signature_mismatch");
  return signature.extension;
}
