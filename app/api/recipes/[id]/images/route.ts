import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { Prisma } from "@prisma/client";
import { getObjectStorage } from "@/server/storage";
import { currentUser } from "@/server/session";

export const runtime = "nodejs";
const imageTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
export async function POST(request: Request, context: { params: { id: string } }) {
  const actor = await currentUser();
  if (process.env.NODE_ENV === "production" && (!actor || !actor.family_id)) return NextResponse.json({ code: 401, data: null, message: "请先登录并完成家庭设置" }, { status: 401 });
  const form = await request.formData();
  const file = form.get("file");
  const stepIndex = Number(form.get("stepIndex"));
  if (!(file instanceof File) || !imageTypes.has(file.type) || file.size <= 0 || file.size > 8 * 1024 * 1024 || !Number.isInteger(stepIndex) || stepIndex < 0) return NextResponse.json({ code: 422, data: null, message: "图片或步骤编号不符合要求" }, { status: 422 });
  const recipe = await prisma.recipe.findFirst({ where: { id: context.params.id, ...(actor ? { family_id: actor.family_id } : {}) } });
  if (!recipe || recipe.source !== "ai") return NextResponse.json({ code: 404, data: null, message: "没有找到 AI 菜谱" }, { status: 404 });
  const steps = Array.isArray(recipe.steps) ? [...recipe.steps] as Array<Record<string, unknown>> : [];
  if (stepIndex >= steps.length) return NextResponse.json({ code: 422, data: null, message: "步骤编号超出范围" }, { status: 422 });
  const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const bytes = new Uint8Array(await file.arrayBuffer());
  const signature = file.type === "image/png" ? [137, 80, 78, 71, 13, 10, 26, 10] : file.type === "image/jpeg" ? [255, 216, 255] : file.type === "image/gif" ? [71, 73, 70, 56] : [82, 73, 70, 70];
  if (!signature.every((byte, index) => bytes[index] === byte) || (file.type === "image/webp" && String.fromCharCode(...bytes.slice(8, 12)) !== "WEBP")) return NextResponse.json({ code: 422, data: null, message: "图片文件内容与类型不匹配" }, { status: 422 });
  const localCookie = request.headers.get("cookie")?.split(";").some((part) => part.trim() === "mealkeeper-local-mode=1");
  const localAccount = actor ? (await prisma.user.findUnique({ where: { id: actor.id }, select: { local_mode: true } }))?.local_mode : false;
  const stored = await getObjectStorage(Boolean(localCookie || localAccount)).put(`recipes/${recipe.id}/steps/${stepIndex}-${crypto.randomUUID()}.${extension}`, bytes, file.type);
  steps[stepIndex] = { ...steps[stepIndex], image_url: stored.url };
  await prisma.recipe.update({ where: { id: recipe.id }, data: { steps: steps as Prisma.InputJsonValue } });
  return NextResponse.json({ code: 0, data: stored, message: "步骤图片已上传" });
}
