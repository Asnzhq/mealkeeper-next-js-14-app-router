import { z } from "zod";
import { prisma } from "@/server/db";
import { hashVerificationCode } from "@/server/auth";
import { zhCN } from "@/lib/i18n/zh-CN";

export async function POST(request: Request) {
  const parsed = z.object({ name: z.string().trim().min(1).max(80), phone: z.string().regex(/^\+?[0-9]{8,15}$/), code: z.string().regex(/^\d{6}$/) }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 422, data: null, message: zhCN.phoneInvalid }, { status: 422 });
  const { phone, code, name } = parsed.data;
  const record = await prisma.verificationCode.findFirst({ where: { phone, used_at: null, expires_at: { gt: new Date() } }, orderBy: { created_at: "desc" } });
  if (!record || record.code_hash !== hashVerificationCode(phone, code)) return Response.json({ code: 401, data: null, message: zhCN.codeWrong }, { status: 401 });
  try {
    const result = await prisma.$transaction(async (tx) => {
      if (await tx.user.findUnique({ where: { phone } })) throw new Error("该手机号已注册");
      const user = await tx.user.create({ data: { phone, name }, select: { id: true } });
      await tx.verificationCode.update({ where: { id: record.id }, data: { used_at: new Date() } });
      return user;
    });
    return Response.json({ code: 0, data: result, message: zhCN.registrationSuccess }, { status: 201 });
  } catch (error) {
    return Response.json({ code: 409, data: null, message: error instanceof Error ? error.message : zhCN.registrationError }, { status: 409 });
  }
}
