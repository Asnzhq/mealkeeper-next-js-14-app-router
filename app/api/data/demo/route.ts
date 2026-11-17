import { currentUser } from "@/server/session";
import { prisma } from "@/server/db";
import { zhCN } from "@/lib/i18n/zh-CN";

export async function DELETE() {
  const user = await currentUser();
  if (!user) return Response.json({ code: 401, data: null, message: zhCN.accountLoginRequired }, { status: 401 });
  if (!user.family_id) return Response.json({ code: 422, data: null, message: zhCN.setupFamilyFirst }, { status: 422 });
  const result = await prisma.plan.deleteMany({ where: { family_id: user.family_id, recipe_id: { startsWith: "seed-recipe-" } } });
  return Response.json({ code: 0, data: { deleted: result.count }, message: zhCN.clearDemoSuccess });
}
