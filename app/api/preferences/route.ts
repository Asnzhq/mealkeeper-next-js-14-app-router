import { z } from "zod";
import { prisma } from "@/server/db";
import { currentUser } from "@/server/session";
import { zhCN } from "@/lib/i18n/zh-CN";

const preferencesSchema = z.object({
  avoid: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  allergies: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  taste: z.number().int().min(0).max(100).default(50),
  calorieTarget: z.number().int().min(800).max(5000).default(2000),
  vegetarian: z.boolean().default(false),
  maxCookingMinutes: z.number().int().min(5).max(360).default(60),
  availableCookware: z.array(z.enum(["wok", "steamer", "oven", "rice_cooker", "microwave", "air_fryer"])).max(12).default([]),
  budget: z.number().nonnegative().max(100000).default(100),
}).strict();

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ code: 401, data: null, message: zhCN.accountLoginRequired }, { status: 401 });
  const preference = await prisma.preference.findUnique({ where: { user_id_key: { user_id: user.id, key: "meal-planner" } } });
  return Response.json({ code: 0, data: preferencesSchema.parse(preference?.value ?? {}), message: "" });
}

export async function PUT(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ code: 401, data: null, message: zhCN.accountLoginRequired }, { status: 401 });
  const parsed = preferencesSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ code: 422, data: null, message: zhCN.preferenceInvalid }, { status: 422 });
  await prisma.preference.upsert({ where: { user_id_key: { user_id: user.id, key: "meal-planner" } }, create: { user_id: user.id, key: "meal-planner", value: parsed.data }, update: { value: parsed.data } });
  return Response.json({ code: 0, data: parsed.data, message: zhCN.preferencesUpdated });
}
