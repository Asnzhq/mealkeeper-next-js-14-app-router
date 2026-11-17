import { UNIT_BASE } from "@/lib/units";
import { scaleRecipe } from "@/lib/planner/scale-recipe";
import type { DishType, GenerateMealsInput, InventoryStock, MealType, Plan, PlannerRecipe, RecipeIngredient, ShoppingGap } from "@/lib/planner/types";

const DEFAULT_COMPOSITION:Partial<Record<MealType,DishType[]>>={lunch:["meat","vegetable","staple"],dinner:["meat","vegetable","staple"]};
const MEAT_WORDS=["肉","鸡","鸭","牛","猪","羊","鱼","虾","蟹","贝","培根","火腿","腊肠","三文鱼","鳕","金枪鱼"];
const MEAT_TAGS=["荤菜","肉菜","荤"];
const VEGETABLE_TAGS=["素菜","蔬菜","素"];
const STAPLE_TAGS=["主食","碳水"];
const normalized=(value:string)=>value.trim().toLocaleLowerCase();

export function classifyRecipe(recipe:PlannerRecipe):DishType {
  const tags=recipe.tags.map(normalized);
  if(tags.some(tag=>MEAT_TAGS.includes(tag)))return "meat";
  if(tags.some(tag=>STAPLE_TAGS.includes(tag)))return "staple";
  if(tags.some(tag=>VEGETABLE_TAGS.includes(tag)))return "vegetable";
  const main=recipe.ingredients.find(item=>item.role==="main")??recipe.ingredients[0];
  if(main&&MEAT_WORDS.some(word=>main.name.includes(word)))return "meat";
  return "other";
}

function expiryWithinThreeDays(item:InventoryStock,targetDate:Date):boolean {
  if(item.expiring)return true;
  if(!item.expiry_date)return false;
  const expiry=new Date(item.expiry_date);
  if(Number.isNaN(expiry.getTime()))return false;
  const day=(date:Date)=>Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate());
  const diff=Math.floor((day(expiry)-day(targetDate))/86_400_000);
  return diff>=0&&diff<=3;
}
function inventoryMatch(need:RecipeIngredient,inventory:InventoryStock):boolean {
  if(need.ingredient_id&&inventory.ingredient_id)return need.ingredient_id===inventory.ingredient_id;
  return normalized(need.name)===normalized(inventory.name);
}
function baseAmount(quantity:number,unit:string):{amount:number;dimension:string}|null {
  const spec=UNIT_BASE[unit];if(!spec)return null;return {amount:quantity*spec.factor,dimension:spec.dimension};
}
function availableFor(need:RecipeIngredient,inventory:InventoryStock[]):number {
  const required=baseAmount(need.quantity,need.unit);if(!required)return 0;
  return inventory.filter(item=>inventoryMatch(need,item)).reduce((sum,item)=>{const available=baseAmount(item.quantity,item.unit);return available&&available.dimension===required.dimension?sum+available.amount:sum},0);
}
function feasibilityFor(recipe:PlannerRecipe,inventory:InventoryStock[],servings:number):number {
  if(recipe.ingredients.length===0)return 0;
  const scaled=scaleRecipe(recipe,servings).scaled_ingredients;
  let requiredTotal=0;let suppliedTotal=0;
  for(const need of scaled){const required=baseAmount(need.quantity,need.unit);if(!required)continue;requiredTotal+=required.amount;suppliedTotal+=Math.min(required.amount,availableFor(need,inventory))}
  return requiredTotal===0?0:Math.max(0,Math.min(1,suppliedTotal/requiredTotal));
}
function estimateRecipeCost(recipe:PlannerRecipe,inventory:InventoryStock[],servings:number):number {
 let total=0;
 for(const need of scaleRecipe(recipe,servings).scaled_ingredients){
  const item=inventory.find(stock=>inventoryMatch(need,stock)&&typeof stock.cost_per_unit==="number");
  if(!item)continue;
  const from=UNIT_BASE[need.unit],to=UNIT_BASE[item.unit];
  if(from&&to&&from.dimension===to.dimension)total+=need.quantity*from.factor/to.factor*(item.cost_per_unit??0);
 }
 return total;
}
export function findRecipeGaps(recipe:PlannerRecipe,inventory:InventoryStock[],servings:number):ShoppingGap[] {
  const gaps:ShoppingGap[]=[];
  for(const need of scaleRecipe(recipe,servings).scaled_ingredients){const required=baseAmount(need.quantity,need.unit);if(!required)continue;const available=availableFor(need,inventory);const shortfall=Math.max(0,required.amount-available);if(shortfall<=1e-9)continue;const spec=UNIT_BASE[need.unit];if(!spec)continue;const quantity=shortfall/spec.factor;const digits=["g","ml","个","只"].includes(need.unit)?0:2;const factor=10**digits;gaps.push({ingredient_id:need.ingredient_id,name:need.name,quantity:Math.round(quantity*factor)/factor,unit:need.unit})}
  return gaps;
}

export function scoreRecipeCandidate(recipe:PlannerRecipe,inventory:InventoryStock[],preferences:GenerateMealsInput["preferences"],targetDate:Date,servings=1){
  const feasibility=feasibilityFor(recipe,inventory,servings);const reasons:string[]=[];let score=feasibility;
  if(recipe.ingredients.some(need=>inventory.some(stock=>inventoryMatch(need,stock)&&expiryWithinThreeDays(stock,targetDate)))){score+=0.3;reasons.push("临期食材优先")}
  if(feasibility>=0.999&&recipe.ingredients.length>0)reasons.push("库存刚好够");
  if(preferences?.tastes?.some(taste=>recipe.tags.some(tag=>tag.includes(taste)))){score+=0.05;reasons.push("符合口味偏好")}
  if(preferences?.budget&&preferences.budget>0){const estimated=estimateRecipeCost(recipe,inventory,servings);score-=Math.min(1,estimated/(preferences.budget/3))*0.2}
  return {score,feasibility,reasons};
}
function recallCandidates(input:GenerateMealsInput,mealType:MealType,targetDate:Date):PlannerRecipe[]{
  const preferences=input.preferences??{};const recent=new Set(input.recentRecipeIds??[]);const exclusions=[...(preferences.avoid??[]),...(preferences.allergies??[])].map(normalized);
  return input.recipes.filter(recipe=>{
    if(recipe.meal_type!==mealType||recent.has(recipe.id))return false;
    const text=[recipe.name,...recipe.tags,...recipe.ingredients.map(item=>item.name)].map(normalized);
    if(exclusions.some(term=>term&&text.some(value=>value.includes(term))))return false;
    if(preferences.vegetarian&&classifyRecipe(recipe)==="meat")return false;
    if(preferences.maxCookingMinutes!==undefined&&recipe.duration_min>preferences.maxCookingMinutes)return false;
    if(preferences.availableCookware!==undefined&&recipe.cookware_required?.some(tool=>!preferences.availableCookware?.includes(tool)))return false;
    return true;
  }).map(recipe=>({...recipe,ingredients:recipe.ingredients.filter(item=>!exclusions.some(term=>term&&normalized(item.name).includes(term)))}));
}
function mainKeys(recipe:PlannerRecipe):string[]{const mains=recipe.ingredients.filter(item=>item.role==="main");const selected=mains.length?mains:[recipe.ingredients[0]].filter(Boolean) as RecipeIngredient[];return selected.map(item=>item.ingredient_id??normalized(item.name))}
function calorieTotal(recipes:PlannerRecipe[],servings:number):number{return recipes.reduce((sum,recipe)=>sum+scaleRecipe(recipe,servings).scaled_calories,0)}
function withinCalories(recipes:PlannerRecipe[],target:number|undefined,servings:number):boolean {if(target===undefined||target<=0)return true;const perPerson=calorieTotal(recipes,servings)/Math.max(1,servings);return perPerson>=target*.85&&perPerson<=target*1.15}
function combinations(input:GenerateMealsInput,mealType:MealType,targetDate:Date,composition: DishType[]):PlannerRecipe[]{
 const candidates=recallCandidates(input,mealType,targetDate);const servings=input.servings??1;const preferences=input.preferences??{};
 const byType=new Map<DishType,PlannerRecipe[]>();for(const type of composition)byType.set(type,candidates.filter(recipe=>classifyRecipe(recipe)===type));if(composition.some(type=>byType.get(type)?.length===0))return [];
 let best:PlannerRecipe[]=[];let bestScore=-Infinity;
 const walk=(index:number,chosen:PlannerRecipe[])=>{
  if(index===composition.length){const duration=chosen.reduce((sum,item)=>sum+item.duration_min,0);if(preferences.maxCookingMinutes!==undefined&&duration>preferences.maxCookingMinutes)return;if(!withinCalories(chosen,preferences.calorieTarget,servings))return;
   const mains=chosen.flatMap(mainKeys);if(new Set(mains).size!==mains.length)return;
   const score=chosen.reduce((sum,recipe)=>sum+scoreRecipeCandidate(recipe,input.inventory,preferences,targetDate,servings).score,0);if(score>bestScore){bestScore=score;best=[...chosen]}return;
  }
  for(const recipe of byType.get(composition[index])??[]){if(chosen.some(existing=>existing.id===recipe.id))continue;walk(index+1,[...chosen,recipe])}
 };
 walk(0,[]);return best;
}
export function createPlan(recipe:PlannerRecipe,input:GenerateMealsInput,mealType:MealType):Plan {
 const targetDate=new Date(input.targetDate);
 const servings=input.servings??1;const scaled=scaleRecipe(recipe,servings);const score=scoreRecipeCandidate(recipe,input.inventory,input.preferences,targetDate,servings);
 return {id:`${targetDate.toISOString().slice(0,10)}-${mealType}-${recipe.id}`,date:targetDate.toISOString(),meal_type:mealType,recipe_id:recipe.id,servings,status:"planned",planned_at:targetDate.toISOString(),recipe:scaled,shoppingGaps:findRecipeGaps(recipe,input.inventory,servings),feasibility:score.feasibility,recommendationReasons:score.reasons};
}

export function generateMeals(input:GenerateMealsInput):Plan[] {
 const targetDate=new Date(input.targetDate);if(Number.isNaN(targetDate.getTime()))return [];
 const mealTypes=input.mealTypes??["breakfast","lunch","dinner"];const composition={...DEFAULT_COMPOSITION,...input.requiredComposition};const plans:Plan[]=[];
 for(const mealType of mealTypes){const required=composition[mealType];let selected:PlannerRecipe[];
  if(required&&required.length>0)selected=combinations(input,mealType,targetDate,required);
  else {const candidates=recallCandidates(input,mealType,targetDate).filter(recipe=>withinCalories([recipe],input.preferences?.calorieTarget,input.servings??1));selected=candidates.sort((a,b)=>scoreRecipeCandidate(b,input.inventory,input.preferences,targetDate,input.servings??1).score-scoreRecipeCandidate(a,input.inventory,input.preferences,targetDate,input.servings??1).score).slice(0,1)}
  plans.push(...selected.map(recipe=>createPlan(recipe,input,mealType)));
 }
 return plans;
}

