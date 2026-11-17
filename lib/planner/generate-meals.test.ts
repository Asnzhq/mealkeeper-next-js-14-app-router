import { describe, expect, it, vi } from "vitest";
import { generateMeals, mealRecommendation } from "@/lib/planner/generate-meals";
import { scaleRecipe } from "@/lib/planner/scale-recipe";
import type { GenerateMealsInput, Plan, PlannerRecipe } from "@/lib/planner/types";

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
	 it("午餐选出一荤一素一主食，并满足时长、热量与主料去重",()=>{const plans=generated(base).meals;expect(plans).toHaveLength(3);expect(new Set(plans.map(p=>p.recipe.tags[0]))).toEqual(new Set(["主食","荤菜","素菜"]));expect(plans.reduce((n,p)=>n+p.recipe.duration_min,0)).toBeLessThanOrEqual(65);expect(plans.reduce((n,p)=>n+p.recipe.scaled_calories,0)/2).toBeGreaterThanOrEqual(700*.85);expect(new Set(plans.map(p=>p.recipe.ingredients[0]?.ingredient_id)).size).toBe(3)});
	 it("过敏食材硬过滤，近期菜谱在其他条件无解时按顺序放宽",()=>{const result=generated({...base,mealTypes:["breakfast"],recentRecipeIds:["b1"],preferences:{allergies:["牛奶"]}});expect(result.meals.map((meal)=>meal.recipe_id)).toEqual(["b1"]);expect(result.meals.some((meal)=>meal.recipe_id==="banned")).toBe(false);expect(result.relaxed).toContain("recent_recipe_dedup")});
	 it("库存不足时仍返回计划和明确缺口",()=>{const result=generated({...base,inventory:[{ingredient_id:"pork",name:"猪肉",quantity:0,unit:"g"},{ingredient_id:"greens",name:"青菜",quantity:50,unit:"g"},{ingredient_id:"rice",name:"大米",quantity:0,unit:"g"}]});expect(result.meals).toHaveLength(3);expect(result.shortages.length).toBeGreaterThan(0)});
	 it("临期食材为匹配菜谱加权",()=>{const plans=generated({...base,servings:1,preferences:{maxCookingMinutes:90},diversity:0}).meals;expect(plans.find(p=>p.recipe_id==="m1")?.recommendationReasons).toEqual(["消耗临期食材：猪肉"])});
});
describe("scaleRecipe",()=>{it("按人数缩放并按单位精度四舍五入",()=>{const scaled=scaleRecipe(recipes[0],3);expect(scaled.scaled_ingredients[0].quantity).toBe(6);expect(scaled.scaled_calories).toBe(1260)});it("按菜谱默认份数基准缩放",()=>{const recipe={...recipes[0],servings:2};expect(scaleRecipe(recipe,3).scaled_ingredients[0].quantity).toBe(3)})});

type Generated = { meals: Plan[]; shortages: Array<{ name: string }>; relaxed: string[]; failureReason: string | null; seed: number };
const generated = (input: GenerateMealsInput): Generated => generateMeals(input) as unknown as Generated;
const sparseRecipes: PlannerRecipe[] = [
 { id:"lunch-egg-tomato", name:"番茄炒蛋", meal_type:"lunch", ingredients:[{name:"鸡蛋",ingredient_id:"egg",quantity:2,unit:"个",role:"main"},{name:"番茄",ingredient_id:"tomato",quantity:2,unit:"个",role:"side"}], duration_min:18, tags:["素菜"], nutrition:{calories:380} },
 { id:"dinner-egg-rice", name:"鸡蛋炒饭", meal_type:"dinner", ingredients:[{name:"鸡蛋",ingredient_id:"egg",quantity:2,unit:"个",role:"main"},{name:"大米",ingredient_id:"rice",quantity:150,unit:"g",role:"side"}], duration_min:22, tags:["主食"], nutrition:{calories:520} },
];
const sparseInput: GenerateMealsInput = { recipes:sparseRecipes, inventory:[{ingredient_id:"egg",name:"鸡蛋",quantity:8,unit:"个"},{ingredient_id:"tomato",name:"番茄",quantity:6,unit:"个"},{ingredient_id:"rice",name:"大米",quantity:600,unit:"g"}], targetDate:"2026-11-17", mealTypes:["lunch","dinner"], servings:2, seed:41 } as GenerateMealsInput;

describe("planner variety", () => {
  const breakfast: GenerateMealsInput = {
    ...base, preferences: {}, mealTypes: ["breakfast"],
    recipes: Array.from({ length: 12 }, (_, index) => ({ ...recipes[0], id: `breakfast-${index}`, name: `早餐 ${index}` })),
  };

  it("reproduces the full result with the same seed and varies the menu for other seeds", () => {
    const first = generateMeals({ ...breakfast, seed: 1 });
    expect([generateMeals({ ...breakfast, seed: 1 }), generateMeals({ ...breakfast, seed: 1 })]).toEqual([first, first]);
    const other = [2, 3, 4, 5].map((seed) => generateMeals({ ...breakfast, seed }).meals[0]?.recipe_id);
    expect(other.some((id) => id !== first.meals[0]?.recipe_id)).toBe(true);
    expect(generateMeals({ ...breakfast, seed: 1, diversity: 0 }).meals.map(({ recipe_id }) => recipe_id))
      .toEqual(generateMeals({ ...breakfast, seed: 2, diversity: 0 }).meals.map(({ recipe_id }) => recipe_id));
  });

  it("serves five distinct breakfasts from the same stock when sent the session fingerprints", () => {
    const history: string[] = [];
    for (let run = 0; run < 5; run++) {
      const result = generateMeals({ ...breakfast, excludeFingerprints: history });
      expect(result.seed).toBeGreaterThan(0);
      expect(result.meals).toHaveLength(1);
      const fingerprint = JSON.stringify(result.meals.map((meal) => meal.recipe.name));
      expect(history).not.toContain(fingerprint);
      history.push(fingerprint);
    }
  });

  it("never restores explicitly excluded ids when all remaining candidates are exhausted", () => {
    const result = generateMeals({ ...breakfast, excludeRecipeIds: breakfast.recipes.map(({ id }) => id) });
    expect(result.meals).toEqual([]);
    expect(result.failureReason).toContain("已排除");
  });

  it("excludes the sorted set of names without globally banning its dishes", () => {
    const result = generateMeals({ ...base, recipes: recipes.slice(1, 4), excludeFingerprints: ['["清炒青菜","米饭","红烧肉"]'] });
    expect(result.meals).toHaveLength(1);
    expect(result.relaxed).toContain("meal_composition");
  });

  it("uses the requested recommendation priority", () => {
    const input = { ...base, servings: 1, recentRecipeIds: ["m1", "v1", "s1"] };
    expect(mealRecommendation([recipes[1], recipes[2]], input)).toBe("消耗临期食材：猪肉");
    expect(mealRecommendation([recipes[2]], { ...input, recentRecipeIds: [] })).toBe("本周未吃过");
    expect(mealRecommendation([recipes[2]], input)).toBe("库存刚好够");
    expect(mealRecommendation([recipes[2], { ...recipes[2], id: "v2" }], { ...input, recentRecipeIds: ["v1", "v2"] }))
      .toBe("随机探索（diversity）：30%");
    expect(mealRecommendation([recipes[3]], input)).toBe("随机探索（diversity）：30%");
  });
});

describe("planner resilience contract",()=>{
 it("三样库存时午餐和晚餐各返回一道，并说明放宽或缺口",()=>{
  const result=generated(sparseInput);
  expect(result.meals.filter(meal=>meal.meal_type==="lunch")).toHaveLength(1);
  expect(result.meals.filter(meal=>meal.meal_type==="dinner")).toHaveLength(1);
  expect(result.relaxed.length>0||result.shortages.length>0).toBe(true);
  expect(result.seed).toBe(41);
 });
 it("库存极少时仍返回最接近方案和具体缺口",()=>{
  const result=generated({...sparseInput,mealTypes:["lunch"],inventory:[{ingredient_id:"egg",name:"鸡蛋",quantity:0,unit:"个"}],seed:7});
  expect(result.meals).toHaveLength(1);
  expect(result.shortages.map(item=>item.name)).toContain("鸡蛋");
  expect(result.relaxed).toContain("inventory_satisfaction");
 });
 it("多项忌口下保留安全候选，不抛异常",()=>{
  const safe={id:"rice-only",name:"白米饭",meal_type:"lunch" as const,ingredients:[{name:"大米",ingredient_id:"rice",quantity:100,unit:"g"}],duration_min:30,tags:["主食"]};
  expect(()=>generated({...sparseInput,recipes:[...sparseRecipes,{...safe}],mealTypes:["lunch"],preferences:{avoid:["鸡蛋","番茄"],allergies:["花生","芝麻"]}})).not.toThrow();
  const result=generated({...sparseInput,recipes:[...sparseRecipes,{...safe}],mealTypes:["lunch"],preferences:{avoid:["鸡蛋","番茄"],allergies:["花生","芝麻"]}});
  expect(result.meals.map(meal=>meal.recipe_id)).toEqual(["rice-only"]);
 });
 it("15分钟上限作为软约束放宽而不是返回空菜单",()=>{
  const result=generated({...sparseInput,mealTypes:["lunch"],preferences:{maxCookingMinutes:15}});
  expect(result.meals).toHaveLength(1);
  expect(result.relaxed).toContain("cooking_duration");
 });
 it("忌口排除全部午餐候选时返回含食材和菜名的具体原因",()=>{
  const recipe:PlannerRecipe={id:"cilantro-rice",name:"香菜拌饭",meal_type:"lunch",ingredients:[{name:"香菜",ingredient_id:"cilantro",quantity:20,unit:"g"}],duration_min:8,tags:["素菜"]};
  const result=generated({...sparseInput,recipes:[recipe],mealTypes:["lunch"],preferences:{avoid:["香菜"]}});
  expect(result.meals).toEqual([]);
  expect(result.failureReason).toContain("香菜");
  expect(result.failureReason).toContain("香菜拌饭");
 });
 it("不同量纲且不可换算时不把食材当作可用库存",()=>{
  const recipe:PlannerRecipe={id:"salt-soup",name:"番茄盐汤",meal_type:"lunch",ingredients:[{name:"盐",ingredient_id:"salt",quantity:3,unit:"勺"}],duration_min:8,tags:["素菜"]};
  const result=generated({...sparseInput,recipes:[recipe],mealTypes:["lunch"],inventory:[{ingredient_id:"salt",name:"盐",quantity:100,unit:"g"}]});
  expect(result.meals).toEqual([]);
  expect(result.failureReason).toContain("盐");
  expect(result.failureReason).toContain("番茄盐汤");
 });
 it("记录候选过滤、选中数和耗时并保留固定seed",()=>{
  const log=vi.spyOn(console,"info").mockImplementation(()=>undefined);
  try {
   generated({...sparseInput,inventorySatisfactionThreshold:0.95});
   expect(log).toHaveBeenCalledWith("[planner]",expect.objectContaining({candidateTotal:sparseInput.recipes.length,filteredByConstraint:expect.any(Object),selected:expect.any(Number),elapsedMs:expect.any(Number)}));
  } finally { log.mockRestore(); }
 });
});

