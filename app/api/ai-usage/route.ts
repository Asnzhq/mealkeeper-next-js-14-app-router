import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentUser } from "@/server/session";
import { zhCN } from "@/lib/i18n/zh-CN";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const actor = await currentUser();
  if (process.env.NODE_ENV === "production" && (!actor || !actor.family_id)) return Response.json({ code: 401, data: null, message: zhCN.accountLoginRequired }, { status: 401 });
  const since = new Date(); since.setDate(since.getDate() - 30);
  const rows = await prisma.aiUsage.findMany({ where: { created_at: { gte: since } }, orderBy: { created_at: "desc" } });
  const promptTokens = rows.reduce((sum, row) => sum + row.prompt_tokens, 0);
  const completionTokens = rows.reduce((sum, row) => sum + row.completion_tokens, 0);
  const inputRate = Number(process.env.AI_INPUT_COST_PER_1K ?? 0);
  const outputRate = Number(process.env.AI_OUTPUT_COST_PER_1K ?? 0);
  const estimatedCost = (promptTokens * inputRate + completionTokens * outputRate) / 1000;
  return NextResponse.json({ code: 0, data: { calls: rows.length, promptTokens, completionTokens, totalTokens: promptTokens + completionTokens, averageDurationMs: rows.length ? Math.round(rows.reduce((sum, row) => sum + row.duration_ms, 0) / rows.length) : 0, estimatedCost, currency: "USD", windowDays: 30 }, message: "" });
}
