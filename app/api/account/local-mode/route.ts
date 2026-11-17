import { z } from "zod";
import { prisma } from "@/server/db";
import { currentUser } from "@/server/session";
import { zhCN } from "@/lib/i18n/zh-CN";

export async function PATCH(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ code: 401, data: null, message: zhCN.accountLoginRequired }, { status: 401 });
  const parsed = z.object({ enabled: z.boolean() }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 422, data: null, message: zhCN.localModeError }, { status: 422 });
  await prisma.user.update({ where: { id: user.id }, data: { local_mode: parsed.data.enabled } });
  const response = Response.json({ code: 0, data: { enabled: parsed.data.enabled }, message: parsed.data.enabled ? zhCN.localModeEnabled : zhCN.localModeDisabled });
  response.headers.append("Set-Cookie", `mealkeeper-local-mode=${parsed.data.enabled ? "1" : "0"}; Path=/; SameSite=Lax; Max-Age=${parsed.data.enabled ? "31536000" : "0"}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  return response;
}
