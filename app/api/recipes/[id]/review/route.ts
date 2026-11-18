import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { z } from "zod";
import { currentUser } from "@/server/session";
import { serializeRecipe } from "@/server/recipe-record";

export const runtime = "nodejs";
const bodySchema = z.object({ action: z.enum(["approve", "reject"]) }).strict();
export async function PATCH(request: Request, context: { params: { id: string } }) {
  const actor = await currentUser();
  if (process.env.NODE_ENV === "production" && (!actor || !actor.family_id)) return NextResponse.json({ code: 401, data: null, message: "请先登录并完成家庭设置" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ code: 422, data: null, message: "审核参数不正确" }, { status: 422 });
  const existing = await prisma.recipe.findFirst({ where: { id: context.params.id, ...(actor ? { family_id: actor.family_id } : {}) } });
  if (!existing || existing.source !== "ai") return NextResponse.json({ code: 404, data: null, message: "没有找到待审核的 AI 菜谱" }, { status: 404 });
  const review_status = parsed.data.action === "approve" ? "approved" : "rejected";
  const recipe = await prisma.recipe.update({ where: { id: context.params.id }, data: { review_status } });
  return NextResponse.json({ code: 0, data: serializeRecipe(recipe), message: "审核状态已更新" });
}
