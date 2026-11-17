import { describe, expect, it } from "vitest";
import { generateMeals } from "@/lib/planner/generate-meals";
import { scaleRecipe } from "@/lib/planner/scale-recipe";
import type { GenerateMealsInput, PlannerRecipe } from "@/lib/planner/types";

const recipes:PlannerRecipe[]=[
 {id:"b1",name:"鸡蛋吐司",meal_type:"breakfast",ingredients:[{name:"鸡蛋",ingredient_id:"egg",quantity:2,unit:"个",role:"main"}],duration_min:12,tags:["早餐"],nutrition:{calories:420}},
 {id:"m1",name:"红烧肉",meal_type:"lunch",ingredients:[{name:"猪肉",ingredient_id:"pork",quantity:250,unit:"g",role:"main"}],duration_min:30,tags:["荤菜"],nutrition:{calories:350}},
 {id:"v1",name:"清炒青菜",meal_type:"lunch",ingredients:[{name:"青菜",ingredient_id:"greens",quantity:200,unit:"g",role:"main"}],duration_min:10,tags:["素菜"],nutrition:{calories:100}},
 {id:"s1",name:"米饭",meal_type:"lunch",ingredients:[{name:"大米",ingredient_id:"rice",quantity:150,unit:"g",role:"main"}],duration_min:20,tags:["主食"],nutrition:{calories:260}},
 {id:"m2",name:"清蒸鱼",meal_type:"lunch",ingredients:[{name:"鲈鱼",ingredient_id:"fish",quantity:300,unit:"g",role:"main"}],duration_min:20,tags:["荤菜"],nutrition:{calories:300}},
 {id:"m3",name:"鸡胸肉",meal_type:"lunch",ingredients:[{name:"鸡肉",ingredient_id:"chicken",quantity:200,unit:"g",role:"main"}],duration_min:18,tags:["荤菜"],nutrition:{calories:280}},
 {id:"banned",name:"牛奶炖蛋",meal_type:"breakfast",ingredients:[{name:"牛奶",ingredient_id:"milk",quantity:100,unit:"ml"}],duration_min:5,tags:[],nutrition:{calories:120}},
];
const inventory=[{ingredient_id:"egg",name:"鸡蛋",quantity:8,unit:"个"},{ingredient_id:"pork",name:"猪肉",quantity:300,unit:"g",expiring:true},{ingredient_id:"greens",name:"青菜",quantity:200,unit:"g"},{ingredient_id:"rice",name:"大米",quantity:100,unit:"g"}];
const base:GenerateMealsInput={recipes,inventory,targetDate:"2026-11-15",mealTypes:["lunch"],servings:2,recentRecipeIds:[],preferences:{maxCookingMinutes:65,calorieTarget:700}};

describe("generateMeals",()=>{
 it("午餐选出一荤一素一主食，并满足时长、热量与主料去重",()=>{const plans=generateMeals(base);expect(plans).toHaveLength(3);expect(new Set(plans.map(p=>p.recipe.tags[0]))).toEqual(new Set(["主食","荤菜","素菜"]));expect(plans.reduce((n,p)=>n+p.recipe.duration_min,0)).toBeLessThanOrEqual(65);expect(plans.reduce((n,p)=>n+p.recipe.scaled_calories,0)/2).toBeGreaterThanOrEqual(700*.85);expect(new Set(plans.map(p=>p.recipe.ingredients[0]?.ingredient_id)).size).toBe(3)});
 it("忌口和过敏食材会在候选召回时剔除，最近七天菜谱不会重复",()=>{const plans=generateMeals({...base,mealTypes:["breakfast"],recentRecipeIds:["b1"],preferences:{allergies:["牛奶"]}});expect(plans).toHaveLength(0)});
 it("库存不足时仍返回计划和明确缺口",()=>{const plans=generateMeals({...base,inventory:[{ingredient_id:"pork",name:"猪肉",quantity:0,unit:"g"},{ingredient_id:"greens",name:"青菜",quantity:50,unit:"g"},{ingredient_id:"rice",name:"大米",quantity:0,unit:"g"}]});expect(plans).toHaveLength(3);expect(plans.flatMap(p=>p.shoppingGaps).length).toBeGreaterThan(0)});
 it("临期食材为匹配菜谱加权",()=>{const plans=generateMeals({...base,servings:1,preferences:{maxCookingMinutes:90}});expect(plans.find(p=>p.recipe_id==="m1")?.recommendationReasons).toContain("临期食材优先")});
});
describe("scaleRecipe",()=>{it("按人数缩放并按单位精度四舍五入",()=>{const scaled=scaleRecipe(recipes[0],3);expect(scaled.scaled_ingredients[0].quantity).toBe(6);expect(scaled.scaled_calories).toBe(1260)});it("按菜谱默认份数基准缩放",()=>{const recipe={...recipes[0],servings:2};expect(scaleRecipe(recipe,3).scaled_ingredients[0].quantity).toBe(3)})});

