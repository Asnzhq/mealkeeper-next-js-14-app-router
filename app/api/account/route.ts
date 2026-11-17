import { z } from "zod";
import { prisma } from "@/server/db";
import { hashPassword } from "@/server/auth";
import { currentUser } from "@/server/session";
import { zhCN } from "@/lib/i18n/zh-CN";

const registration = z.object({ name: z.string().trim().min(1).max(80), email: z.string().email().transform((value) => value.toLowerCase()), password: z.string().min(10).max(200) }).strict();
export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ code: 401, data: null, message: zhCN.accountLoginRequired }, { status: 401 });
  const record = await prisma.user.findUnique({
    where: { id: user.id },
    include: { family: { include: { users: { select: { id: true, name: true, email: true, phone: true } } } } },
  });
  const response = Response.json({ code: 0, data: { id: record?.id, name: record?.name, email: record?.email, phone: record?.phone, local_mode: record?.local_mode ?? false, family: record?.family }, message: "" });
  response.headers.append("Set-Cookie", `mealkeeper-local-mode=${record?.local_mode ? "1" : "0"}; Path=/; SameSite=Lax; Max-Age=${record?.local_mode ? "31536000" : "0"}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  return response;
}

export async function POST(request: Request) {
  const parsed = registration.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 422, data: null, message: zhCN.passwordHint }, { status: 422 });
  try {
    const user = await prisma.user.create({ data: { name: parsed.data.name, email: parsed.data.email, password_hash: await hashPassword(parsed.data.password) }, select: { id: true, email: true } });
    return Response.json({ code: 0, data: user, message: zhCN.registrationSuccess }, { status: 201 });
  } catch {
    return Response.json({ code: 409, data: null, message: zhCN.registrationError }, { status: 409 });
  }
}
