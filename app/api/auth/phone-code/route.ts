import { randomInt } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/server/db";
import { hashVerificationCode } from "@/server/auth";
import { zhCN } from "@/lib/i18n/zh-CN";

export async function POST(request: Request) {
  if (request.headers.get("cookie")?.split(";").some((part) => part.trim() === "mealkeeper-local-mode=1")) return Response.json({ code: 403, data: null, message: zhCN.localModeExternalDisabled }, { status: 403 });
  const parsed = z.object({ phone: z.string().regex(/^\+?[0-9]{8,15}$/) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 422, data: null, message: zhCN.phoneInvalid }, { status: 422 });
  const phone = parsed.data.phone;
  if ((await prisma.user.findUnique({ where: { phone }, select: { local_mode: true } }))?.local_mode) return Response.json({ code: 403, data: null, message: zhCN.localModeExternalDisabled }, { status: 403 });
  const recent = await prisma.verificationCode.count({ where: { phone, created_at: { gt: new Date(Date.now() - 60_000) } } });
  if (recent > 0) return Response.json({ code: 429, data: null, message: zhCN.codeTooSoon }, { status: 429 });
  const code = randomInt(100000, 999999).toString();
  await prisma.verificationCode.create({ data: { phone, code_hash: hashVerificationCode(phone, code), expires_at: new Date(Date.now() + 5 * 60_000) } });
  const gateway = process.env.SMS_GATEWAY_URL;
  if (gateway) {
    const response = await fetch(gateway, { method: "POST", headers: { "Content-Type": "application/json", ...(process.env.SMS_GATEWAY_TOKEN ? { Authorization: `Bearer ${process.env.SMS_GATEWAY_TOKEN}` } : {}) }, body: JSON.stringify({ phone, code }) });
    if (!response.ok) return Response.json({ code: 502, data: null, message: zhCN.codeSendFailed }, { status: 502 });
    return Response.json({ code: 0, data: { expires_in: 300 }, message: zhCN.codeSent });
  }
  if (process.env.NODE_ENV === "production") return Response.json({ code: 503, data: null, message: zhCN.smsNotConfigured }, { status: 503 });
  return Response.json({ code: 0, data: { expires_in: 300, development_code: code }, message: zhCN.developmentCodeSent });
}
