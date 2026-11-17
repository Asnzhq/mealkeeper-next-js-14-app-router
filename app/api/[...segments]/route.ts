import { prisma } from "@/server/db";
import { applyInventoryChange, undoInventoryChange } from "@/server/inventory";
import { completePlans, InventoryShortageError, skipPlans, undoPlanCompletion } from "@/server/plan-completion";
import { findExpiringIngredients, findExpiryGroups, recordExpiredWaste } from "@/server/expiry";
import { getStatistics, getWasteStatistics } from "@/server/statistics";
import { recomputeShoppingItems, receiveShoppingItem } from "@/server/shopping";
import { bodyOf, fail, ok } from "@/server/http";
import { changeSchema, ingredientSchema, planSchema, recipeSchema, shoppingSchema } from "@/server/schemas";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { zhCN } from "@/lib/i18n/zh-CN";
import { convertQuantity } from "@/lib/quantities";
import { currentUser } from "@/server/session";
const querySchema = z.object({ ingredient_id:z.string().min(1).optional(), reason:z.string().min(1).optional(), from:z.coerce.date().optional(), to:z.coerce.date().optional(), date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).strict();
const parts = (r: Request) => new URL(r.url).pathname.split("/").filter(Boolean).slice(1);
const bad = (e: unknown) => fail(e instanceof Error ? e.message : "服务器错误", 400);
const read = (r: Request) => r.json().catch(() => null);
const shortageResponse = (error: InventoryShortageError) => Response.json({ code: 409, data: { shortages: error.shortages }, message: error.message }, { status: 409 });
const completionSchema = z.object({ plans: z.array(z.object({ plan_id: z.string().min(1), actual_usage: z.array(z.object({ ingredient_id: z.string().min(1), quantity: z.number().finite().nonnegative(), unit: z.string().min(1) })).optional() })).min(1), allow_debt: z.boolean().default(false), add_shortages_to_shopping: z.boolean().default(false), operator_id: z.string().optional() }).strict();
const ingredientCreateSchema = ingredientSchema.extend({ duplicate_action: z.enum(["merge", "new"]).optional(), duplicate_ingredient_id: z.string().min(1).optional() }).superRefine((value, context) => {
 if (value.duplicate_action === "merge" && !value.duplicate_ingredient_id) context.addIssue({ code: z.ZodIssueCode.custom, path: ["duplicate_ingredient_id"], message: zhCN.ingredientMergeTargetRequired });
});

export async function GET(r: Request) {
 const [type,id,action]=parts(r), u=new URL(r.url);
 try {
  const actor=await currentUser();if(process.env.NODE_ENV==="production"&&(!actor||!actor.family_id))return fail("请先登录并完成家庭设置",401);const familyId=actor?actor.family_id:undefined, scope=familyId!==undefined?{family_id:familyId}:{};
  if(type==="ingredients") return ok(await prisma.ingredient.findMany({where:{...scope,...(id?{id}:{})},include:{inventory_logs:{take:1,orderBy:{created_at:"desc"},include:{operator:{select:{id:true,name:true}}}}}}));
  if(type==="inventory-logs") return ok(await prisma.inventoryLog.findMany({where:{...(familyId!==undefined?{ingredient:{family_id:familyId}}:{}),...(u.searchParams.get("ingredient_id")?{ingredient_id:u.searchParams.get("ingredient_id")!}:{}),...(u.searchParams.get("reason")?{reason:{contains:u.searchParams.get("reason")!}}:{}),...(u.searchParams.get("from")||u.searchParams.get("to")?{created_at:{...(u.searchParams.get("from")?{gte:new Date(u.searchParams.get("from")!)}:{}),...(u.searchParams.get("to")?{lte:new Date(u.searchParams.get("to")!)}:{})}}:{})},include:{operator:{select:{id:true,name:true}},ingredient:{select:{name:true,unit:true}}},orderBy:{created_at:"desc"}}));
  if(type==="recipes") return ok(await prisma.recipe.findMany({where:{OR:[{family_id:familyId??null},{family_id:null}],...(id?{id}:{review_status:u.searchParams.get("review_status")??"approved",...(u.searchParams.get("source")?{source:u.searchParams.get("source")!}:{})})}}));
  if(type==="plans") return ok(await prisma.plan.findMany({where:{...scope,...(id?{id}:u.searchParams.get("date")?{date:{gte:new Date(`${u.searchParams.get("date")}T00:00:00`),lt:new Date(`${u.searchParams.get("date")}T23:59:59.999`)}}:{})},include:{recipe:true},orderBy:{date:"asc"}}));
  if(type==="shopping-items") return ok(await prisma.shoppingItem.findMany({where:{...scope,...(id&&id!=="suggestions"?{id}:{})},include:{ingredient:true},orderBy:[{checked:"asc"},{created_at:"desc"}]}));
  if(type==="expiry") return ok(await findExpiryGroups(new Date(),familyId));
  if(type==="waste") {const parsed=z.coerce.number().int().min(1).max(12).default(6).safeParse(u.searchParams.get("months")??undefined);if(!parsed.success)return fail("统计月份参数无效",422);return ok(await getWasteStatistics(parsed.data,new Date(),familyId));}
  if(type==="stats") {
   const parsed=z.coerce.number().int().refine((value)=>value===7||value===30).default(7).safeParse(u.searchParams.get("days")??undefined);if(!parsed.success)return fail("统计区间只支持7天或30天",422);
   const [all,expiring,dashboard]=await Promise.all([prisma.ingredient.findMany({where:scope}),findExpiringIngredients(new Date(),familyId),getStatistics(parsed.data as 7|30,new Date(),familyId)]);
   return ok({...dashboard,low_stock:all.filter(x=>x.stock_qty<=x.safety_stock),expiring});
  }
  return fail("未找到接口",404);
 } catch(e){return bad(e)}
}
export async function POST(r: Request) {
 const [type,id,action]=parts(r);
 try {
  const actor=await currentUser();if(process.env.NODE_ENV==="production"&&(!actor||!actor.family_id))return fail("请先登录并完成家庭设置",401);const familyId=actor?actor.family_id:undefined, scoped=familyId!==undefined?{family_id:familyId}:{};
  if(type==="ingredients"&&id==="batch") {const p=z.array(ingredientSchema).safeParse(await read(r));if(!p.success)return fail("参数校验失败",422);const out=[];for(const x of p.data){const {stock_qty,...data}=x;const i=await prisma.ingredient.create({data:{...data,...scoped,stock_qty:0}});if(stock_qty)await applyInventoryChange(i.id,stock_qty,"initial",null,actor?.id);out.push(await prisma.ingredient.findUnique({where:{id:i.id}}))}return ok(out,"批量录入成功",201)}
  if(type==="ingredients"&&id&&action==="restock"){const p=await bodyOf(r,changeSchema);if(p.response)return p.response;const ingredient=await prisma.ingredient.findFirst({where:{id,...scoped}});if(!ingredient)return fail("找不到这份食材",404);return ok(await applyInventoryChange(id,Math.abs(p.data!.delta),"restock",p.data!.ref_plan_id,actor?.id??p.data!.operator_id),"补货成功",201)}
  if(type==="ingredients"&&id&&action==="loss"){const ingredient=await prisma.ingredient.findFirst({where:{id,...scoped}});if(!ingredient)return fail("找不到这份食材",404);return ok(await recordExpiredWaste(id,actor?.id),"已记为损耗",201)}
  if(type==="ingredients"){
   const p=await bodyOf(r,ingredientCreateSchema);if(p.response)return p.response;
   const {stock_qty,duplicate_action,duplicate_ingredient_id,...data}=p.data!;
   if(duplicate_action==="merge"){
    const existing=await prisma.ingredient.findFirst({where:{id:duplicate_ingredient_id!,...scoped}});
    if(!existing)return fail(zhCN.ingredientMergeTargetMissing,404);
    if(existing.name.trim().toLocaleLowerCase()!==data.name.trim().toLocaleLowerCase())return fail(zhCN.ingredientMergeTargetChanged,409);
    let amount=stock_qty;
    try{if(data.unit!==existing.unit)amount=convertQuantity(stock_qty,data.unit,existing.unit)}catch{return fail("单位无法换算，请仍新建或修改单位",422)}
    if(amount<=0)return ok(existing,zhCN.ingredientMergeNoQuantity);
    const merged=await applyInventoryChange(existing.id,amount,"duplicate:merge",null,actor?.id);
    return ok(merged.ingredient,zhCN.ingredientMerged);
   }
   const i=await prisma.ingredient.create({data:{...data,...scoped,stock_qty:0}});
   return ok(stock_qty? (await applyInventoryChange(i.id,stock_qty,"initial",null,actor?.id)).ingredient:i,"食材已创建",201)
  }
  if(type==="inventory-logs"&&id&&action==="undo"){const log=await prisma.inventoryLog.findFirst({where:{id,ingredient:scoped}});if(!log)return fail("找不到这条库存记录",404);return ok(await undoInventoryChange(id,actor?.id),"流水已撤销",201)}
  if(type==="inventory-logs"){const p=await bodyOf(r,changeSchema.extend({ingredient_id:z.string()}));if(p.response)return p.response;const ingredient=await prisma.ingredient.findFirst({where:{id:p.data!.ingredient_id,...scoped}});if(!ingredient)return fail("找不到这份食材",404);return ok(await applyInventoryChange(p.data!.ingredient_id,p.data!.delta,p.data!.reason,p.data!.ref_plan_id,actor?.id??p.data!.operator_id),"库存已更新",201)}
  if(type==="recipes"){const p=await bodyOf(r,recipeSchema);if(p.response)return p.response;return ok(await prisma.recipe.create({data:{...p.data!,...scoped} as Prisma.RecipeUncheckedCreateInput}),"菜谱已创建",201)}
  if(type==="plans"&&id==="complete") {const p=completionSchema.safeParse(await read(r));if(!p.success)return fail("参数校验失败",422);if(familyId!==undefined&&await prisma.plan.count({where:{id:{in:p.data.plans.map(x=>x.plan_id)},family_id:familyId}})!==p.data.plans.length)return fail("计划不属于当前家庭",403);try{return ok(await completePlans(p.data.plans,{...p.data,operator_id:actor?.id,family_id:familyId}),"已完成并更新库存")}catch(e){if(e instanceof InventoryShortageError)return shortageResponse(e);throw e}}
  if(type==="plans"&&id&&action==="finish") {const body=await read(r);const parsed=completionSchema.pick({plans:true,allow_debt:true,add_shortages_to_shopping:true,operator_id:true}).partial().safeParse(body??{});if(!parsed.success)return fail("参数校验失败",422);const selections=parsed.data.plans??[{plan_id:id}];if(selections.some((selection)=>selection.plan_id!==id))return fail("计划编号与请求路径不一致",422);if(familyId!==undefined&&!(await prisma.plan.findFirst({where:{id,family_id:familyId}})))return fail("计划不属于当前家庭",403);try{return ok(await completePlans(selections,{...parsed.data,operator_id:actor?.id,family_id:familyId}),"已完成并更新库存")}catch(e){if(e instanceof InventoryShortageError)return shortageResponse(e);throw e}}
  if(type==="plans"&&id==="skip") {const p=z.object({plan_ids:z.array(z.string().min(1)).min(1)}).safeParse(await read(r));if(!p.success)return fail("参数校验失败",422);if(familyId!==undefined&&await prisma.plan.count({where:{id:{in:p.data.plan_ids},family_id:familyId}})!==p.data.plan_ids.length)return fail("计划不属于当前家庭",403);return ok(await skipPlans(p.data.plan_ids,familyId),"已跳过，不扣减库存")}
  if(type==="plans"&&id&&action==="undo") {const p=z.object({confirm_old:z.boolean().default(false)}).safeParse(await read(r).then((v)=>v??{}));if(!p.success)return fail("参数校验失败",422);if(familyId!==undefined&&!(await prisma.plan.findFirst({where:{id,family_id:familyId}})))return fail("计划不属于当前家庭",403);const result=await undoPlanCompletion(id,p.data.confirm_old,actor?.id);return result.needs_confirmation?Response.json({code:409,data:{needs_confirmation:true,age_hours:result.age_hours},message:zhCN.confirmOldUndo},{status:409}):ok(result,"已撤销完成并恢复库存")}
  if(type==="plans"){const p=await bodyOf(r,planSchema);if(p.response)return p.response;if(p.data!.recipe_id&&familyId!==undefined&&!(await prisma.recipe.findFirst({where:{id:p.data!.recipe_id,OR:[{family_id:familyId},{family_id:null}]}})))return fail("菜谱不属于当前家庭",403);return ok(await prisma.plan.create({data:{...p.data!,...scoped}}),"计划已创建",201)}
  if(type==="shopping-items"&&id==="recompute")return ok(await recomputeShoppingItems(new Date(),familyId),"已按未来三天菜单更新清单");
  if(type==="shopping-items"&&id&&action==="stock-in")return ok(await receiveShoppingItem(id,actor?.id,familyId),"采购已入库",201);
  if(type==="shopping-items"){const p=await bodyOf(r,shoppingSchema);if(p.response)return p.response;return ok(await prisma.shoppingItem.create({data:{...p.data!,...scoped,user_id:actor?.id??null,note:p.data!.note??"manual"}}),"清单已创建",201)}
  return fail("未找到接口",404);
 }catch(e){return bad(e)}
}
export async function PATCH(r:Request){const [type,id,action]=parts(r);if(!id)return fail("缺少 ID");const v=await read(r);try{const actor=await currentUser();if(process.env.NODE_ENV==="production"&&(!actor||!actor.family_id))return fail("请先登录并完成家庭设置",401);const familyId=actor?actor.family_id:undefined,scope=familyId!==undefined?{family_id:familyId}:{};
 if(type==="ingredients"){if(v&&Object.hasOwn(v,"stock_qty"))return fail("库存必须通过 InventoryLog 流水变更",422);const p=ingredientSchema.partial().omit({stock_qty:true,family_id:true}).safeParse(v);if(!p.success)return fail("参数校验失败",422);const result=await prisma.ingredient.updateMany({where:{id,...scope},data:p.data});if(!result.count)return fail("找不到这份食材",404);return ok(await prisma.ingredient.findUnique({where:{id}}))}
 if(type==="recipes"){const p=recipeSchema.partial().omit({family_id:true}).safeParse(v);if(!p.success)return fail("参数校验失败",422);const result=await prisma.recipe.updateMany({where:{id,...scope},data:p.data as Prisma.RecipeUncheckedUpdateInput});if(!result.count)return fail("找不到这份菜谱",404);return ok(await prisma.recipe.findUnique({where:{id}}))}
 if(type==="plans"&&action==="status"){const p=z.object({status:z.enum(["planned","finished","skipped"])}).safeParse(v);if(!p.success)return fail("参数校验失败",422);if(familyId!==undefined&&!(await prisma.plan.findFirst({where:{id,...scope}})))return fail("计划不属于当前家庭",403);if(p.data.status==="finished"){try{return ok(await completePlans([{plan_id:id}],{operator_id:actor?.id,family_id:familyId}),"已完成并更新库存")}catch(e){if(e instanceof InventoryShortageError)return shortageResponse(e);throw e}}return ok(await prisma.plan.update({where:{id},data:{status:p.data.status,finished_at:null}}))}
 if(type==="plans"){const p=planSchema.partial().omit({family_id:true}).safeParse(v);if(!p.success)return fail("参数校验失败",422);const result=await prisma.plan.updateMany({where:{id,...scope},data:p.data});if(!result.count)return fail("找不到这条计划",404);return ok(await prisma.plan.findUnique({where:{id}}))}
 if(type==="shopping-items"){const p=shoppingSchema.partial().omit({family_id:true,user_id:true}).safeParse(v);if(!p.success)return fail("参数校验失败",422);if(p.data.ingredient_id){const ingredient=await prisma.ingredient.findFirst({where:{id:p.data.ingredient_id,...scope}});if(!ingredient)return fail("找不到这份食材",404)}const result=await prisma.shoppingItem.updateMany({where:{id,...scope},data:p.data});if(!result.count)return fail("找不到清单项目",404);return ok(await prisma.shoppingItem.findUnique({where:{id}}))}
 return fail("未找到接口",404)
 }catch(e){return bad(e)}}
export async function DELETE(r:Request){const [type,id]=parts(r);try{const actor=await currentUser();if(process.env.NODE_ENV==="production"&&(!actor||!actor.family_id))return fail("请先登录并完成家庭设置",401);const familyId=actor?actor.family_id:undefined,scope=familyId!==undefined?{family_id:familyId}:{};if(type==="plans"&&!id){const date=new URL(r.url).searchParams.get("date");if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date))return fail("日期参数无效",422);return ok(await prisma.plan.deleteMany({where:{...scope,date:{gte:new Date(`${date}T00:00:00`),lt:new Date(`${date}T23:59:59.999`)}}}))}if(!id)return fail("缺少 ID");if(type==="ingredients")return ok(await prisma.ingredient.deleteMany({where:{id,...scope}}));if(type==="recipes")return ok(await prisma.recipe.deleteMany({where:{id,...scope}}));if(type==="plans")return ok(await prisma.plan.deleteMany({where:{id,...scope}}));if(type==="shopping-items"&&id==="clear-checked")return ok(await prisma.shoppingItem.deleteMany({where:{checked:true,...scope}}),"已清空已购项目");if(type==="shopping-items")return ok(await prisma.shoppingItem.deleteMany({where:{id,...scope}}));return fail("未找到接口",404)}catch(e){return bad(e)}}


