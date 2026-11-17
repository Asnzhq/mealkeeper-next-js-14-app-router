import { z } from "zod";
import { currentUser } from "@/server/session";
import { prisma } from "@/server/db";
import { zhCN } from "@/lib/i18n/zh-CN";

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ code: 401, data: null, message: zhCN.accountLoginRequired }, { status: 401 });
  return Response.json({ code: 0, data: await prisma.inboxMessage.findMany({ where: { user_id: user.id }, orderBy: { created_at: "desc" }, take: 50 }), message: "" });
}
export async function PATCH(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ code: 401, data: null, message: zhCN.accountLoginRequired }, { status: 401 });
  const parsed = z.object({ id: z.string().cuid().optional() }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 422, data: null, message: zhCN.notificationFailed }, { status: 422 });
  await prisma.inboxMessage.updateMany({ where: { user_id: user.id, read_at: null, ...(parsed.data.id ? { id: parsed.data.id } : {}) }, data: { read_at: new Date() } });
  return Response.json({ code: 0, data: null, message: zhCN.notificationRead });
}
