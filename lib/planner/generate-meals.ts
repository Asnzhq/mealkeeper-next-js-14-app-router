import { UNIT_BASE } from "@/lib/units";
import { zhCN } from "@/lib/i18n/zh-CN";
import { scaleRecipe } from "@/lib/planner/scale-recipe";
import type { DishType, GenerateMealsInput, GenerateMealsResult, InventoryStock, MealType, Plan, PlannerRecipe, RecipeIngredient, RelaxedConstraint, ShoppingGap, UserPreferences } from "@/lib/planner/types";

const DEFAULT_COMPOSITION: Partial<Record<MealType, DishType[]>> = { lunch: ["meat", "vegetable", "staple"], dinner: ["meat", "vegetable", "staple"] };
const MEAT_WORDS = ["肉", "鸡", "鸭", "牛", "猪", "羊", "鱼", "虾", "蟹", "贝", "培根", "火腿", "腊肠", "三文鱼", "鳕", "金枪鱼"];
const MEAT_TAGS = ["荤菜", "肉菜", "荤"];
const VEGETABLE_TAGS = ["素菜", "蔬菜", "素"];
const STAPLE_TAGS = ["主食", "碳水"];
const RELAXATION_ORDER: RelaxedConstraint[] = ["calorie_range", "cooking_duration", "recent_recipe_dedup", "inventory_satisfaction", "meal_composition"];
const SOFT_FILTER_ORDER = RELAXATION_ORDER.filter((constraint) => constraint !== "meal_composition");
const normalized = (value: string) => value.trim().toLocaleLowerCase();
const mealLabel = (mealType: MealType) => mealType === "lunch" ? zhCN.mealLunch : mealType === "dinner" ? zhCN.mealDinner : zhCN.mealBreakfast;

type HardFailure = { kind: "avoid" | "allergy" | "ingredient" | "unit"; ingredient?: string; unit?: string; recipe: string };
type ConstraintKey = "meal_type" | "exclude_recipe_ids" | "exclude_fingerprints" | "avoid" | "allergy" | "ingredient_exists" | "unit_convertible" | RelaxedConstraint;
type MealOption = { recipes: PlannerRecipe[]; feasibility: number; score: number };

export function classifyRecipe(recipe: PlannerRecipe): DishType {
  const tags = recipe.tags.map(normalized);
  if (tags.some((tag) => MEAT_TAGS.includes(tag))) return "meat";
  if (tags.some((tag) => STAPLE_TAGS.includes(tag))) return "staple";
  if (tags.some((tag) => VEGETABLE_TAGS.includes(tag))) return "vegetable";
  const main = recipe.ingredients.find((item) => item.role === "main") ?? recipe.ingredients[0];
  if (main && MEAT_WORDS.some((word) => main.name.includes(word))) return "meat";
  return "other";
}

function unitSpec(unit: string): { dimension: string; factor: number } | null {
  const known = UNIT_BASE[unit];
  if (known) return known;
  const exact = unit.trim();
  return exact ? { dimension: `custom:${normalized(exact)}`, factor: 1 } : null;
}
function baseAmount(quantity: number, unit: string): { amount: number; dimension: string } | null {
  const spec = unitSpec(unit);
  return spec ? { amount: quantity * spec.factor, dimension: spec.dimension } : null;
}
function unitsConvertible(from: string, to: string): boolean {
  const left = unitSpec(from);
  const right = unitSpec(to);
  return Boolean(left && right && left.dimension === right.dimension);
}
function expiryWithinThreeDays(item: InventoryStock, targetDate: Date): boolean {
  if (item.expiring) return true;
  if (!item.expiry_date) return false;
  const expiry = new Date(item.expiry_date);
  if (Number.isNaN(expiry.getTime())) return false;
  const day = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const diff = Math.floor((day(expiry) - day(targetDate)) / 86_400_000);
  return diff >= 0 && diff <= 3;
}
function inventoryMatch(need: RecipeIngredient, inventory: InventoryStock): boolean {
  if (need.ingredient_id && inventory.ingredient_id) return need.ingredient_id === inventory.ingredient_id;
  return normalized(need.name) === normalized(inventory.name);
}
function matchingInventory(need: RecipeIngredient, inventory: InventoryStock[]): InventoryStock[] {
  return inventory.filter((item) => inventoryMatch(need, item));
}
function availableFor(need: RecipeIngredient, inventory: InventoryStock[]): number {
  const required = baseAmount(need.quantity, need.unit);
  if (!required) return 0;
  return matchingInventory(need, inventory).reduce((sum, item) => {
    if (!unitsConvertible(need.unit, item.unit)) return sum;
    const available = baseAmount(item.quantity, item.unit);
    return available?.dimension === required.dimension ? sum + available.amount : sum;
  }, 0);
}
function feasibilityFor(recipe: PlannerRecipe, inventory: InventoryStock[], servings: number): number {
  if (recipe.ingredients.length === 0) return 0;
  const scaled = scaleRecipe(recipe, servings).scaled_ingredients;
  let requiredTotal = 0;
  let suppliedTotal = 0;
  for (const need of scaled) {
    const required = baseAmount(need.quantity, need.unit);
    if (!required) continue;
    requiredTotal += required.amount;
    suppliedTotal += Math.min(required.amount, availableFor(need, inventory));
  }
  return requiredTotal === 0 ? 0 : Math.max(0, Math.min(1, suppliedTotal / requiredTotal));
}
function estimateRecipeCost(recipe: PlannerRecipe, inventory: InventoryStock[], servings: number): number {
  let total = 0;
  for (const need of scaleRecipe(recipe, servings).scaled_ingredients) {
    const item = inventory.find((stock) => inventoryMatch(need, stock) && typeof stock.cost_per_unit === "number" && unitsConvertible(need.unit, stock.unit));
    if (!item) continue;
    const from = unitSpec(need.unit);
    const to = unitSpec(item.unit);
    if (from && to) total += need.quantity * from.factor / to.factor * (item.cost_per_unit ?? 0);
  }
  return total;
}
export function findRecipeGaps(recipe: PlannerRecipe, inventory: InventoryStock[], servings: number): ShoppingGap[] {
  const gaps: ShoppingGap[] = [];
  for (const need of scaleRecipe(recipe, servings).scaled_ingredients) {
    const required = baseAmount(need.quantity, need.unit);
    if (!required) continue;
    const shortfall = Math.max(0, required.amount - availableFor(need, inventory));
    if (shortfall <= 1e-9) continue;
    const spec = unitSpec(need.unit);
    if (!spec) continue;
    const quantity = shortfall / spec.factor;
    const digits = ["count", "piece", "package"].includes(spec.dimension) || spec.dimension.startsWith("custom:") ? 0 : ["g", "ml"].includes(need.unit) ? 0 : 2;
    const factor = 10 ** digits;
    gaps.push({ ingredient_id: need.ingredient_id, name: need.name, quantity: Math.round(quantity * factor) / factor, unit: need.unit });
  }
  return gaps;
}

export function recipeSetFingerprint(names: readonly string[]): string {
  return JSON.stringify([...new Set(names.map((name) => name.trim().normalize("NFC")))].sort());
}

function diversityWeight(diversity: number | undefined): number {
  return diversity !== undefined && Number.isFinite(diversity) ? Math.min(1, Math.max(0, diversity)) : 0.3;
}

function recipeNoise(recipeId: string, randomSeed: number): number {
  let hash = 2166136261;
  for (const character of `${randomSeed}:${recipeId}`) {
    hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
  }
  // Mix adjacent seeds and similarly named recipe IDs before converting to [0, 1).
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0) / 2 ** 32;
}

function expiringIngredients(recipe: PlannerRecipe, inventory: InventoryStock[], date: Date): string[] {
  return recipe.ingredients.filter((need) => matchingInventory(need, inventory).some((stock) =>
    stock.quantity > 0 && unitsConvertible(need.unit, stock.unit) && expiryWithinThreeDays(stock, date)
  )).map((need) => need.name);
}

export function mealRecommendation(recipes: PlannerRecipe[], input: GenerateMealsInput): string {
  const date = new Date(input.targetDate);
  const expiring = [...new Set(recipes.flatMap((recipe) => expiringIngredients(recipe, input.inventory, date)))];
  if (expiring.length) return zhCN.plannerReasonExpiring.replace("{ingredients}", expiring.join("、"));
  const recent = new Set(input.recentRecipeIds ?? []);
  if (recipes.every((recipe) => !recent.has(recipe.id))) return zhCN.plannerReasonNew;
  const usage = new Map<string, { need: RecipeIngredient; amount: number }>();
  for (const recipe of recipes) {
    for (const need of scaleRecipe(recipe, input.servings ?? 1).scaled_ingredients) {
      const required = baseAmount(need.quantity, need.unit);
      if (!required) continue;
      const key = JSON.stringify([need.ingredient_id ?? normalized(need.name), required.dimension]);
      usage.set(key, { need, amount: (usage.get(key)?.amount ?? 0) + required.amount });
    }
  }
  if ([...usage.values()].every(({ need, amount }) => availableFor(need, input.inventory) + 1e-9 >= amount)) return zhCN.inventoryEnough;
  return zhCN.plannerReasonExploration.replace("{diversity}", `${Math.round(diversityWeight(input.diversity) * 100)}%`);
}

export function scoreRecipeCandidate(recipe: PlannerRecipe, inventory: InventoryStock[], preferences: UserPreferences | undefined, targetDate: Date, servings = 1, randomSeed = 0, diversity?: number) {
  const feasibility = feasibilityFor(recipe, inventory, servings);
  let score = feasibility + recipeNoise(recipe.id, randomSeed) * diversityWeight(diversity);
  if (expiringIngredients(recipe, inventory, targetDate).length) score += 0.3;
  if (preferences?.tastes?.some((taste) => recipe.tags.some((tag) => tag.includes(taste)))) score += 0.05;
  if (preferences?.vegetarian && classifyRecipe(recipe) === "meat") score -= 0.25;
  if (preferences?.availableCookware?.length && recipe.cookware_required?.some((tool) => !preferences.availableCookware?.includes(tool))) score -= 0.2;
  if (preferences?.budget && preferences.budget > 0) {
    const estimated = estimateRecipeCost(recipe, inventory, servings);
    score -= Math.min(1, estimated / (preferences.budget / 3)) * 0.2;
  }
  return { score, feasibility };
}

function matchingTerm(ingredients: RecipeIngredient[], terms: string[]): string | undefined {
  return terms.find((term) => normalized(term) && ingredients.some((item) => normalized(item.name).includes(normalized(term))));
}
function hardFailure(recipe: PlannerRecipe, input: GenerateMealsInput): HardFailure | null {
  const avoid = matchingTerm(recipe.ingredients, input.preferences?.avoid ?? []);
  if (avoid) return { kind: "avoid", ingredient: avoid, recipe: recipe.name };
  const allergy = matchingTerm(recipe.ingredients, input.preferences?.allergies ?? []);
  if (allergy) return { kind: "allergy", ingredient: allergy, recipe: recipe.name };
  if (recipe.ingredients.length === 0 || recipe.ingredients.some((item) => !item.name.trim() || !Number.isFinite(item.quantity) || item.quantity <= 0 || !item.unit.trim())) {
    return { kind: "ingredient", recipe: recipe.name };
  }
  for (const need of recipe.ingredients) {
    const matches = matchingInventory(need, input.inventory);
    if (matches.length > 0 && !matches.some((item) => unitsConvertible(need.unit, item.unit))) return { kind: "unit", ingredient: need.name, unit: need.unit, recipe: recipe.name };
  }
  return null;
}
function hardFailureText(mealType: MealType, candidates: PlannerRecipe[], failures: HardFailure[]): string {
  if (candidates.length === 0) return zhCN.plannerNoMealCandidate.replace("{meal}", mealLabel(mealType));
  if (failures.every((failure) => failure.kind === "avoid")) {
    const ingredients = [...new Set(failures.map((failure) => failure.ingredient).filter((name): name is string => Boolean(name)))].join("、");
    const recipes = [...new Set(failures.map((failure) => failure.recipe))].join("、");
    return zhCN.plannerAllAvoided.replace("{meal}", mealLabel(mealType)).replace("{ingredient}", ingredients).replace("{recipes}", recipes);
  }
  if (failures.every((failure) => failure.kind === "allergy")) {
    const ingredients = [...new Set(failures.map((failure) => failure.ingredient).filter((name): name is string => Boolean(name)))].join("、");
    const recipes = [...new Set(failures.map((failure) => failure.recipe))].join("、");
    return zhCN.plannerAllergic.replace("{meal}", mealLabel(mealType)).replace("{ingredient}", ingredients).replace("{recipes}", recipes);
  }
  return failures.map((failure) => {
    if (failure.kind === "avoid") return zhCN.plannerAvoidFailure.replace("{recipe}", failure.recipe).replace("{ingredient}", failure.ingredient ?? "");
    if (failure.kind === "allergy") return zhCN.plannerAllergyFailure.replace("{recipe}", failure.recipe).replace("{ingredient}", failure.ingredient ?? "");
    if (failure.kind === "unit") return zhCN.plannerUnitFailure.replace("{recipe}", failure.recipe).replace("{ingredient}", failure.ingredient ?? "").replace("{unit}", failure.unit ?? "");
    return zhCN.plannerIngredientFailure.replace("{recipe}", failure.recipe);
  }).join("；");
}
export function plannerHardConstraintFailure(recipe: PlannerRecipe, input: GenerateMealsInput): string | null {
  const failure = hardFailure(recipe, input);
  if (!failure) return null;
  if (failure.kind === "avoid") return zhCN.plannerAvoidFailure.replace("{recipe}", failure.recipe).replace("{ingredient}", failure.ingredient ?? "");
  if (failure.kind === "allergy") return zhCN.plannerAllergyFailure.replace("{recipe}", failure.recipe).replace("{ingredient}", failure.ingredient ?? "");
  if (failure.kind === "unit") return zhCN.plannerUnitFailure.replace("{recipe}", failure.recipe).replace("{ingredient}", failure.ingredient ?? "").replace("{unit}", failure.unit ?? "");
  return zhCN.plannerIngredientFailure.replace("{recipe}", failure.recipe);
}
export function isPlannerRecipeHardConstraintSafe(recipe: PlannerRecipe, input: GenerateMealsInput): boolean {
  return hardFailure(recipe, input) === null;
}

function mainKeys(recipe: PlannerRecipe): string[] {
  const mains = recipe.ingredients.filter((item) => item.role === "main");
  const selected = mains.length ? mains : recipe.ingredients.slice(0, 1);
  return selected.map((item) => item.ingredient_id ?? normalized(item.name));
}
function calorieTotal(recipes: PlannerRecipe[], servings: number): number {
  return recipes.reduce((sum, recipe) => sum + scaleRecipe(recipe, servings).scaled_calories, 0);
}
function withinCalories(recipes: PlannerRecipe[], target: number | undefined, servings: number): boolean {
  if (target === undefined || target <= 0) return true;
  const perPerson = calorieTotal(recipes, servings) / Math.max(1, servings);
  return perPerson === 0 || (perPerson >= target * 0.85 && perPerson <= target * 1.15);
}
function optionFeasibility(recipes: PlannerRecipe[], input: GenerateMealsInput): number {
  const servings = input.servings ?? 1;
  let requiredTotal = 0;
  let suppliedTotal = 0;
  for (const recipe of recipes) {
    for (const need of scaleRecipe(recipe, servings).scaled_ingredients) {
      const required = baseAmount(need.quantity, need.unit);
      if (!required) continue;
      requiredTotal += required.amount;
      suppliedTotal += Math.min(required.amount, availableFor(need, input.inventory));
    }
  }
  return requiredTotal > 0 ? suppliedTotal / requiredTotal : 0;
}
function buildCompositionOptions(candidates: PlannerRecipe[], composition: DishType[]): MealOption[] {
  if (composition.length === 0 || composition.some((type) => !candidates.some((recipe) => classifyRecipe(recipe) === type))) return [];
  const byType = new Map<DishType, PlannerRecipe[]>();
  for (const type of composition) byType.set(type, candidates.filter((recipe) => classifyRecipe(recipe) === type));
  const options: MealOption[] = [];
  const walk = (index: number, chosen: PlannerRecipe[]) => {
    if (index === composition.length) {
      const mains = chosen.flatMap(mainKeys);
      if (new Set(mains).size !== mains.length) return;
      options.push({ recipes: [...chosen], feasibility: 0, score: 0 });
      return;
    }
    for (const recipe of byType.get(composition[index]) ?? []) {
      if (chosen.some((existing) => existing.id === recipe.id)) continue;
      walk(index + 1, [...chosen, recipe]);
    }
  };
  walk(0, []);
  return options;
}
function makeOptions(candidates: PlannerRecipe[], composition: DishType[], input: GenerateMealsInput, scores: Map<string, number>): MealOption[] {
  const base = composition.length ? buildCompositionOptions(candidates, composition) : candidates.map((recipe) => ({ recipes: [recipe], feasibility: 0, score: 0 }));
  return base.map((option) => ({
    ...option,
    feasibility: optionFeasibility(option.recipes, input),
    score: option.recipes.reduce((sum, recipe) => sum + (scores.get(recipe.id) ?? 0), 0),
  }));
}
function applySoftConstraint(options: MealOption[], constraint: Exclude<RelaxedConstraint, "meal_composition">, input: GenerateMealsInput): MealOption[] {
  const preferences = input.preferences ?? {};
  if (constraint === "calorie_range") return options.filter((option) => withinCalories(option.recipes, preferences.calorieTarget, input.servings ?? 1));
  if (constraint === "cooking_duration") return options.filter((option) => option.recipes.reduce((sum, recipe) => sum + recipe.duration_min, 0) <= (preferences.maxCookingMinutes ?? Number.POSITIVE_INFINITY));
  if (constraint === "recent_recipe_dedup") {
    const recent = new Set(input.recentRecipeIds ?? []);
    return options.filter((option) => option.recipes.every((recipe) => !recent.has(recipe.id)));
  }
  const configured = input.inventorySatisfactionThreshold ?? 0.6;
  const threshold = Number.isFinite(configured) ? Math.max(0, Math.min(1, configured)) : 0.6;
  return options.filter((option) => option.feasibility >= threshold);
}
function selectClosest(options: MealOption[], input: GenerateMealsInput): { option?: MealOption; relaxed: Exclude<RelaxedConstraint, "meal_composition">[]; filtered: Partial<Record<ConstraintKey, number>> } {
  let remaining = options;
  const relaxed: Exclude<RelaxedConstraint, "meal_composition">[] = [];
  const filtered: Partial<Record<ConstraintKey, number>> = {};
  const prefs = input.preferences ?? {};
  for (const constraint of SOFT_FILTER_ORDER) {
    if (constraint === "calorie_range" && (prefs.calorieTarget === undefined || prefs.calorieTarget <= 0)) continue;
    if (constraint === "cooking_duration" && (prefs.maxCookingMinutes === undefined || prefs.maxCookingMinutes <= 0)) continue;
    if (constraint === "recent_recipe_dedup" && !(input.recentRecipeIds?.length)) continue;
    if (remaining.length === 0) continue;
    const after = applySoftConstraint(remaining, constraint, input);
    const removed = remaining.length - after.length;
    filtered[constraint] = (filtered[constraint] ?? 0) + removed;
    if (after.length > 0) remaining = after;
    else if (removed > 0) relaxed.push(constraint);
  }
  const option = [...remaining].sort((left, right) => right.score - left.score)[0];
  return { option, relaxed, filtered };
}

export function createPlan(recipe: PlannerRecipe, input: GenerateMealsInput, mealType: MealType): Plan {
  const targetDate = new Date(input.targetDate);
  const servings = input.servings ?? 1;
  const scaled = scaleRecipe(recipe, servings);
  return { id: `${targetDate.toISOString().slice(0, 10)}-${mealType}-${recipe.id}`, date: targetDate.toISOString(), meal_type: mealType, recipe_id: recipe.id, servings, status: "planned", planned_at: targetDate.toISOString(), recipe: scaled, shoppingGaps: findRecipeGaps(recipe, input.inventory, servings), feasibility: feasibilityFor(recipe, input.inventory, servings), recommendationReasons: [mealRecommendation([recipe], input)] };
}

export function generateMeals(input: GenerateMealsInput): GenerateMealsResult {
  const startedAt = Date.now();
  const seed = input.seed ?? startedAt;
  const excludedIds = new Set(input.excludeRecipeIds);
  const excludedFingerprints = new Set(input.excludeFingerprints);
  const targetDate = new Date(input.targetDate);
  const mealTypes = input.mealTypes ?? ["breakfast", "lunch", "dinner"];
  const filteredByConstraint: Partial<Record<ConstraintKey, number>> = { meal_type: input.recipes.length - input.recipes.filter((recipe) => mealTypes.includes(recipe.meal_type)).length };
  if (Number.isNaN(targetDate.getTime())) {
    const result: GenerateMealsResult = { meals: [], shortages: [], relaxed: [], failureReason: zhCN.plannerInvalidDate, seed };
    console.info("[planner]", { candidateTotal: input.recipes.length, filteredByConstraint, selected: 0, elapsedMs: Date.now() - startedAt });
    return result;
  }

  const requestedComposition = { ...DEFAULT_COMPOSITION, ...input.requiredComposition };
  const meals: Plan[] = [];
  const failures: string[] = [];
  const relaxedSet = new Set<RelaxedConstraint>();
  for (const mealType of mealTypes) {
    const allCandidates = input.recipes.filter((recipe) => recipe.meal_type === mealType);
    const mealCandidates = allCandidates.filter((recipe) => !excludedIds.has(recipe.id));
    filteredByConstraint.exclude_recipe_ids = (filteredByConstraint.exclude_recipe_ids ?? 0) + allCandidates.length - mealCandidates.length;
    const exhausted = zhCN.plannerExclusionsExhausted.replace("{meal}", mealLabel(mealType));
    if (allCandidates.length && !mealCandidates.length) {
      failures.push(exhausted);
      continue;
    }
    const avoid = (input.preferences?.avoid ?? []).filter((term) => normalized(term));
    const allergies = (input.preferences?.allergies ?? []).filter((term) => normalized(term));
    const hardFailures = mealCandidates.map((recipe) => hardFailure(recipe, input));
    let candidates = mealCandidates;
    const hardStages: Array<["avoid" | "allergy" | "ingredient_exists" | "unit_convertible", (recipe: PlannerRecipe) => boolean]> = [
      ["avoid", (recipe) => !matchingTerm(recipe.ingredients, avoid)],
      ["allergy", (recipe) => !matchingTerm(recipe.ingredients, allergies)],
      ["ingredient_exists", (recipe) => recipe.ingredients.length > 0 && recipe.ingredients.every((item) => item.name.trim() && Number.isFinite(item.quantity) && item.quantity > 0 && item.unit.trim())],
      ["unit_convertible", (recipe) => hardFailure(recipe, input)?.kind !== "unit"],
    ];
    for (const [key, passes] of hardStages) {
      const before = candidates.length;
      candidates = candidates.filter(passes);
      filteredByConstraint[key] = (filteredByConstraint[key] ?? 0) + before - candidates.length;
    }
    if (candidates.length === 0) {
      failures.push(hardFailureText(mealType, mealCandidates, hardFailures.filter((failure): failure is HardFailure => Boolean(failure))));
      continue;
    }

    const composition = requestedComposition[mealType] ?? [];
    const scores = new Map(candidates.map((recipe) => [
      recipe.id, scoreRecipeCandidate(recipe, input.inventory, input.preferences, targetDate, input.servings, seed, input.diversity).score,
    ]));
    const newOptions = (options: MealOption[]) => {
      const remaining = options.filter(({ recipes }) => !excludedFingerprints.has(recipeSetFingerprint(recipes.map((recipe) => recipe.name))));
      filteredByConstraint.exclude_fingerprints = (filteredByConstraint.exclude_fingerprints ?? 0) + options.length - remaining.length;
      return remaining;
    };
    let options = makeOptions(candidates, composition, input, scores);
    const participating = new Set(options.flatMap((option) => option.recipes.map((recipe) => recipe.id)));
    if (composition.length) filteredByConstraint.meal_composition = (filteredByConstraint.meal_composition ?? 0) + candidates.filter((recipe) => !participating.has(recipe.id)).length;
    let selection = selectClosest(newOptions(options), input);
    for (const constraint of SOFT_FILTER_ORDER) filteredByConstraint[constraint] = (filteredByConstraint[constraint] ?? 0) + (selection.filtered[constraint] ?? 0);
    let chosen = selection.option;
    selection.relaxed.forEach((constraint) => relaxedSet.add(constraint));

    if (!chosen && composition.length > 0) {
      options = makeOptions(candidates, [], input, scores);
      selection = selectClosest(newOptions(options), input);
      for (const constraint of SOFT_FILTER_ORDER) filteredByConstraint[constraint] = (filteredByConstraint[constraint] ?? 0) + (selection.filtered[constraint] ?? 0);
      chosen = selection.option;
      selection.relaxed.forEach((constraint) => relaxedSet.add(constraint));
      if (chosen) relaxedSet.add("meal_composition");
    }
    if (!chosen) {
      failures.push(exhausted);
      continue;
    }
    chosen.recipes.forEach((recipe) => meals.push(createPlan(recipe, input, mealType)));
  }

  const relaxed = RELAXATION_ORDER.filter((constraint) => relaxedSet.has(constraint));
  const shortages = meals.flatMap((meal) => meal.shoppingGaps.map((gap) => ({ ...gap, meal_type: meal.meal_type, recipe_id: meal.recipe_id, recipe_name: meal.recipe.name })));
  const result: GenerateMealsResult = { meals, shortages, relaxed, failureReason: failures.length ? failures.join("；") : null, seed };
  console.info("[planner]", { candidateTotal: input.recipes.length, filteredByConstraint, selected: meals.length, selectedRecipeIds: meals.map((meal) => meal.recipe_id), elapsedMs: Date.now() - startedAt, seed: result.seed });
  return result;
}
