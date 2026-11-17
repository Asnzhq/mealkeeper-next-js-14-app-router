import * as webpush from "web-push";
import { prisma } from "@/server/db";
import { zhCN } from "@/lib/i18n/zh-CN";

export const runtime = "nodejs";
const shanghaiDate = () => { const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()); const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "00"; return `${part("year")}-${part("month")}-${part("day")}`; };
const json = (data: unknown, code = 200) => Response.json(data, { status: code });

export async function POST(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return json({ code: 401, data: null, message: "Unauthorized" }, 401);
  const now = new Date();
  const day = shanghaiDate();
  const localHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", hour: "2-digit", hourCycle: "h23" }).format(now));
  const localMinute = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", minute: "2-digit" }).format(now));
  const sent: string[] = [];
  const deliver = async (key: string, familyId: string, title: string, body: string) => {
    try { await prisma.notificationDispatch.create({ data: { dedupe_key: key } }); } catch { return; }
    const users = await prisma.user.findMany({ where: { family_id: familyId }, include: { push_subscriptions: true } });
    if (users.length) await prisma.inboxMessage.createMany({ data: users.map((user) => ({ user_id: user.id, title, body, dedupe_key: `${key}:${user.id}` })) });
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:hello@mealkeeper.app", process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
      const payload = JSON.stringify({ title, body, url: "/" });
      const pushUsers = await prisma.user.findMany({ where: { family_id: familyId, local_mode: false }, include: { push_subscriptions: true } });
      await Promise.all(pushUsers.flatMap((user) => user.push_subscriptions.map(async (item) => webpush.sendNotification({ endpoint: item.endpoint, keys: { p256dh: item.p256dh, auth: item.auth } }, payload).catch(async (error: { statusCode?: number }) => { if (error.statusCode === 404 || error.statusCode === 410) await prisma.pushSubscription.delete({ where: { id: item.id } }).catch(() => undefined); }))));
    }
    sent.push(key);
  };
  if (localHour > 7 || (localHour === 7 && localMinute >= 30)) {
    const families = await prisma.family.findMany({ include: { users: { select: { id: true } }, plans: { where: { date: { gte: new Date(`${day}T00:00:00+08:00`), lt: new Date(new Date(`${day}T00:00:00+08:00`).getTime() + 86_400_000) }, status: "planned" }, include: { recipe: true }, orderBy: { meal_type: "asc" } } } });
    for (const family of families) {
      const names = family.plans.map((entry) => entry.recipe?.name).filter(Boolean);
      if (!names.length) continue;
      const breakfast = names.slice(0, 3).join("、");
      await deliver(`menu:${family.id}:${day}`, family.id, zhCN.todayMenuPushTitle, breakfast);
    }
  }
  const todayStart = new Date(`${day}T00:00:00+08:00`); const tomorrowStart = new Date(todayStart.getTime() + 86_400_000);
  const expiring = await prisma.ingredient.findMany({ where: { stock_qty: { gt: 0 }, expiry_date: { gte: todayStart, lt: tomorrowStart }, family_id: { not: null } } });
  for (const ingredient of expiring) await deliver(`expiry:${ingredient.family_id}:${ingredient.id}:${day}`, ingredient.family_id!, zhCN.expiryPushTitle, `${ingredient.name}${zhCN.expiryPushBody}`);
  return json({ code: 0, data: { sent: sent.length }, message: "通知派发完成" });
}
