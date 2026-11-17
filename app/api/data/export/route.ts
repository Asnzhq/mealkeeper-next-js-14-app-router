import { currentUser } from "@/server/session";
import { prisma } from "@/server/db";
import { stringifyCsv } from "@/lib/csv";
import { zhCN } from "@/lib/i18n/zh-CN";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ code: 401, data: null, message: zhCN.accountLoginRequired }, { status: 401 });
  if (!user.family_id) return Response.json({ code: 422, data: null, message: zhCN.setupFamilyFirst }, { status: 422 });
  const [ingredients, logs, plans] = await Promise.all([
    prisma.ingredient.findMany({ where: { family_id: user.family_id }, orderBy: { name: "asc" } }),
    prisma.inventoryLog.findMany({ where: { ingredient: { family_id: user.family_id } }, include: { ingredient: { select: { name: true, unit: true } } }, orderBy: { created_at: "asc" } }),
    prisma.plan.findMany({ where: { family_id: user.family_id }, orderBy: { date: "asc" } }),
  ]);
  const type = new URL(request.url).searchParams.get("type") ?? "json";
  if (type === "ingredients") return csv("ingredients.csv", ["name", "category", "unit", "stock_qty", "safety_stock", "storage", "expiry_date", "cost_per_unit", "tags"], ingredients.map((item) => [item.name, item.category, item.unit, item.stock_qty, item.safety_stock, item.storage, item.expiry_date?.toISOString() ?? "", item.cost_per_unit, JSON.stringify(item.tags)]));
  if (type === "logs") return csv("inventory-logs.csv", ["ingredient_name", "delta", "reason", "ref_plan_id", "created_at"], logs.map((item) => [item.ingredient.name, item.delta, item.reason, item.ref_plan_id, item.created_at.toISOString()]));
  if (type === "plans") return csv("plans.csv", ["date", "meal_type", "recipe_id", "servings", "status", "planned_at", "finished_at"], plans.map((item) => [item.date.toISOString(), item.meal_type, item.recipe_id, item.servings, item.status, item.planned_at.toISOString(), item.finished_at?.toISOString() ?? ""]));
  return Response.json({ code: 0, data: { version: 1, exported_at: new Date().toISOString(), ingredients, inventory_logs: logs.map(({ ingredient: _ingredient, ...item }) => item), plans }, message: "" }, { headers: { "Content-Disposition": "attachment; filename=mealkeeper-backup.json" } });
}
function csv(filename: string, headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  return new Response(`\uFEFF${stringifyCsv(headers, rows)}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename=${filename}` } });
}
