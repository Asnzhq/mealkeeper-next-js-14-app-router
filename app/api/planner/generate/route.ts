import { NextResponse } from "next/server";
import { zhCN } from "@/lib/i18n/zh-CN";
import { generateMeals } from "@/lib/planner";
import { PlannerInputSchema } from "@/server/llm/input";
import { currentUser } from "@/server/session";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production" && !(await currentUser())?.family_id) {
    return NextResponse.json({ code: 401, data: null, message: zhCN.loginRequired }, { status: 401 });
  }
  const parsed = PlannerInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ code: 422, data: null, message: zhCN.plannerInvalidInput }, { status: 422 });
  }
  return NextResponse.json({ code: 0, data: generateMeals(parsed.data), message: "" });
}
