import { z } from "zod";
import { currentUser } from "@/server/session";
import { prisma } from "@/server/db";
import { zhCN } from "@/lib/i18n/zh-CN";

const subscription = z.object({ endpoint: z.string().url().max(2048), keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(10).max(100) }).strict() }).strict();
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ code: 401, data: null, message: zhCN.accountLoginRequired }, { status: 401 });
  const local = (await prisma.user.findUnique({ where: { id: user.id }, select: { local_mode: true } }))?.local_mode;
  return Response.json({ code: 0, data: { publicKey: process.env.VAPID_PUBLIC_KEY ?? "", enabled: !local && Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) }, message: "" });
}
export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ code: 401, data: null, message: zhCN.accountLoginRequired }, { status: 401 });
  if ((await prisma.user.findUnique({ where: { id: user.id }, select: { local_mode: true } }))?.local_mode) return Response.json({ code: 403, data: null, message: zhCN.localModePushDisabled }, { status: 403 });
  const parsed = subscription.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 422, data: null, message: zhCN.notificationFailed }, { status: 422 });
  await prisma.pushSubscription.upsert({ where: { endpoint: parsed.data.endpoint }, create: { user_id: user.id, endpoint: parsed.data.endpoint, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth }, update: { user_id: user.id, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth } });
  return Response.json({ code: 0, data: { subscribed: true }, message: zhCN.notificationEnabled });
}
export async function DELETE(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ code: 401, data: null, message: zhCN.accountLoginRequired }, { status: 401 });
  const parsed = z.object({ endpoint: z.string().url() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 422, data: null, message: zhCN.notificationFailed }, { status: 422 });
  await prisma.pushSubscription.deleteMany({ where: { endpoint: parsed.data.endpoint, user_id: user.id } });
  return Response.json({ code: 0, data: null, message: zhCN.notificationEnabled });
}
