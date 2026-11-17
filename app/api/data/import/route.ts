import { z } from "zod";
import { Prisma } from "@prisma/client";
import { currentUser } from "@/server/session";
import { prisma } from "@/server/db";
import { parseCsv } from "@/lib/csv";
import { applyInventoryChangeInTransaction } from "@/server/inventory";
import { zhCN } from "@/lib/i18n/zh-CN";

export const runtime = "nodejs";
const ImportedIngredient = z.object({ id: z.string().optional(), name: z.string().min(1).max(120), category: z.string().default("其他"), unit: z.string().default("个"), stock_qty: z.number().finite().default(0), safety_stock: z.number().finite().default(0), storage: z.string().nullable().optional(), expiry_date: z.string().nullable().optional(), cost_per_unit: z.number().finite().default(0), tags: z.unknown().optional() });
const ImportedLog = z.object({ ingredient_id: z.string().optional(), ingredient_name: z.string().optional(), delta: z.number().finite(), reason: z.string().default("import"), ref_plan_id: z.string().nullable().optional(), created_at: z.string().optional() });
const ImportedPlan = z.object({ id: z.string().optional(), date: z.string(), meal_type: z.string(), recipe_id: z.string().nullable().optional(), servings: z.number().int().positive().default(1), status: z.string().default("planned"), planned_at: z.string().optional(), finished_at: z.string().nullable().optional() });
const Backup = z.object({ version: z.number(), ingredients: z.array(ImportedIngredient).default([]), inventory_logs: z.array(ImportedLog).default([]), plans: z.array(ImportedPlan).default([]) });

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ code: 401, data: null, message: zhCN.accountLoginRequired }, { status: 401 });
  if (!user.family_id) return Response.json({ code: 422, data: null, message: zhCN.setupFamilyFirst }, { status: 422 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size <= 0 || file.size > 10 * 1024 * 1024) return Response.json({ code: 422, data: null, message: zhCN.importFailure }, { status: 422 });
  try {
    const text = await file.text();
    if (file.name.toLowerCase().endsWith(".csv")) {
      const rows = parseCsv(text.replace(/^\uFEFF/, ""));
      const headers = rows.shift() ?? [];
      const records = rows.filter((row) => row.length).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
      const kind = form?.get("kind");
      await prisma.$transaction(async (tx) => {
        if (kind === "ingredients") for (const row of records) {
          const ingredient = ImportedIngredient.parse({ ...row, stock_qty: Number(row.stock_qty), safety_stock: Number(row.safety_stock), cost_per_unit: Number(row.cost_per_unit), tags: parseTags(row.tags) });
          const created = await tx.ingredient.create({ data: { ...ingredientData(ingredient), family_id: user.family_id, stock_qty: 0 } });
          if (ingredient.stock_qty > 0) await applyInventoryChangeInTransaction(tx, created.id, ingredient.stock_qty, "import", null, user.id);
        }
        else if (kind === "logs") for (const row of records) {
          const ingredient = await tx.ingredient.findFirst({ where: { family_id: user.family_id, name: String(row.ingredient_name) } });
          if (ingredient) await applyInventoryChangeInTransaction(tx, ingredient.id, Number(row.delta), String(row.reason || "import"), null, user.id);
        }
        else if (kind === "plans") for (const row of records) {
          const plan = ImportedPlan.parse(row);
          await tx.plan.create({ data: planData(plan, user.family_id!, await validRecipe(tx, plan.recipe_id, user.family_id!)) });
        }
        else throw new Error("CSV 类型无效");
      });
      return Response.json({ code: 0, data: { imported: records.length }, message: zhCN.importSuccess });
    }
    const backup = Backup.parse(JSON.parse(text));
    if (backup.version !== 1) throw new Error("备份版本暂不支持");
    const imported = await prisma.$transaction(async (tx) => {
      const idMap = new Map<string, string>();
      const nameMap = new Map<string, string>();
      const finalStock = new Map<string, number>();
      for (const value of backup.ingredients) {
        const parsed = ImportedIngredient.parse(value);
        const created = await tx.ingredient.create({ data: { ...ingredientData(parsed), family_id: user.family_id, stock_qty: 0 } });
        if (parsed.id) idMap.set(parsed.id, created.id);
        nameMap.set(parsed.name, created.id);
        finalStock.set(created.id, parsed.stock_qty);
      }
      const planIds = new Map<string, string>();
      for (const plan of backup.plans) {
        const created = await tx.plan.create({ data: planData(plan, user.family_id!, await validRecipe(tx, plan.recipe_id, user.family_id!)) });
        planIds.set(plan.id ?? created.id, created.id);
      }
      for (const log of [...backup.inventory_logs].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))) {
        const ingredientId = idMap.get(log.ingredient_id ?? "") ?? (log.ingredient_name ? nameMap.get(log.ingredient_name) : undefined);
        if (!ingredientId || log.delta === 0) continue;
        await applyInventoryChangeInTransaction(tx, ingredientId, log.delta, log.reason, log.ref_plan_id ? planIds.get(log.ref_plan_id) ?? null : null, user.id, undefined, 0, log.created_at ? new Date(log.created_at) : undefined);
      }
      for (const [ingredientId, target] of finalStock) {
        const current = await tx.ingredient.findUniqueOrThrow({ where: { id: ingredientId }, select: { stock_qty: true } });
        const difference = target - current.stock_qty;
        if (Math.abs(difference) > 1e-9) await applyInventoryChangeInTransaction(tx, ingredientId, difference, "import_balance", null, user.id);
      }
      return { ingredients: backup.ingredients.length, plans: backup.plans.length, logs: backup.inventory_logs.length };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return Response.json({ code: 0, data: imported, message: zhCN.importSuccess });
  } catch {
    return Response.json({ code: 422, data: null, message: zhCN.importFailure }, { status: 422 });
  }
}

function parseTags(value: unknown): unknown { if (typeof value !== "string") return value; try { return JSON.parse(value) as unknown; } catch { return value.split(/[，,]/).filter(Boolean); } }
function ingredientData(item: z.infer<typeof ImportedIngredient>) { return { name: item.name, category: item.category, unit: item.unit, safety_stock: item.safety_stock, storage: item.storage ?? null, expiry_date: item.expiry_date ? new Date(item.expiry_date) : null, cost_per_unit: item.cost_per_unit, tags: (item.tags ?? []) as Prisma.InputJsonValue }; }
async function validRecipe(tx: Prisma.TransactionClient, recipeId: string | null | undefined, familyId: string) { if (!recipeId) return null; const recipe = await tx.recipe.findFirst({ where: { id: recipeId, OR: [{ family_id: familyId }, { family_id: null }] }, select: { id: true } }); return recipe?.id ?? null; }
function planData(item: z.infer<typeof ImportedPlan>, familyId: string, recipeId: string | null) { return { family_id: familyId, date: new Date(item.date), meal_type: item.meal_type, recipe_id: recipeId, servings: item.servings, status: item.status, planned_at: item.planned_at ? new Date(item.planned_at) : new Date(), finished_at: item.finished_at ? new Date(item.finished_at) : null }; }
