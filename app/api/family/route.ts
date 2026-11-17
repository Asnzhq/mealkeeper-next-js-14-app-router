import { randomInt } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/server/db";
import { currentUser } from "@/server/session";
import { zhCN } from "@/lib/i18n/zh-CN";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ code: 401, data: null, message: zhCN.accountLoginRequired }, { status: 401 });
  const parsed = z.union([z.object({ action: z.literal("create"), name: z.string().trim().min(1).max(80) }), z.object({ action: z.literal("join"), invite_code: z.string().min(6).max(40) })]).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 422, data: null, message: zhCN.familyInputError }, { status: 422 });
  if (user.family_id) return Response.json({ code: 409, data: null, message: zhCN.familyAlreadyJoined }, { status: 409 });
  if (parsed.data.action === "create") {
    const family = await prisma.family.create({ data: { name: parsed.data.name, users: { connect: { id: user.id } } } });
    return Response.json({ code: 0, data: family, message: zhCN.familyCreated }, { status: 201 });
  }
  const family = await prisma.family.findUnique({ where: { invite_code: parsed.data.invite_code } });
  if (!family) return Response.json({ code: 404, data: null, message: zhCN.inviteNotFound }, { status: 404 });
  await prisma.user.update({ where: { id: user.id }, data: { family_id: family.id } });
  return Response.json({ code: 0, data: family, message: zhCN.familyJoined }, { status: 200 });
}

export async function PATCH() {
  const user = await currentUser();
  if (!user?.family_id) return Response.json({ code: 401, data: null, message: zhCN.familySetupTitle }, { status: 401 });
  const family = await prisma.family.update({ where: { id: user.family_id }, data: { invite_code: randomInt(10000000, 99999999).toString() } });
  return Response.json({ code: 0, data: { invite_code: family.invite_code }, message: zhCN.inviteRegenerated });
}
