import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentUser } from "@/server/session";
import { getObjectStorage } from "@/server/storage";
import { RecipeCoverValidationError, validateRecipeCoverUpload } from "@/server/recipe-cover-upload";
import { zhCN } from "@/lib/i18n/zh-CN";

export const runtime = "nodejs";
const fail = (message: string, code: number) => NextResponse.json({ code, data: null, message }, { status: code });

export async function POST(request: Request, context: { params: { id: string } }) {
  try {
    const actor = await currentUser();
    if (process.env.NODE_ENV === "production" && (!actor || !actor.family_id)) return fail(zhCN.loginRequired, 401);
    const familyScope = actor?.family_id ? { OR: [{ family_id: actor.family_id }, { family_id: null }] } : actor ? { family_id: null } : {};
    const recipe = await prisma.recipe.findFirst({ where: { id: context.params.id, ...familyScope } });
    if (!recipe) return fail(zhCN.recipeNotFound, 404);

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return fail(zhCN.coverImageFileMissing, 422);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let extension: "jpg" | "png" | "webp";
    try {
      extension = validateRecipeCoverUpload(file.type, file.size, bytes);
    } catch (error) {
      if (!(error instanceof RecipeCoverValidationError)) throw error;
      const message = error.code === "unsupported_type" ? zhCN.coverImageFileType : error.code === "invalid_size" ? zhCN.coverImageFileSize : zhCN.coverImageInvalid;
      return fail(message, 422);
    }

    const localCookie = request.headers.get("cookie")?.split(";").some((part) => part.trim() === "mealkeeper-local-mode=1");
    const localAccount = actor ? (await prisma.user.findUnique({ where: { id: actor.id }, select: { local_mode: true } }))?.local_mode : false;
    const stored = await getObjectStorage(Boolean(localCookie || localAccount)).put(`recipes/${recipe.id}/cover/${crypto.randomUUID()}.${extension}`, bytes, file.type);
    await prisma.recipe.update({ where: { id: recipe.id }, data: { image_url: stored.url } });
    return NextResponse.json({ code: 0, data: { image_url: stored.url }, message: zhCN.coverImageUploaded });
  } catch {
    return fail(zhCN.coverImageUploadError, 500);
  }
}
