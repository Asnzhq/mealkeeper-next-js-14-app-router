import { zhCN } from "@/lib/i18n/zh-CN";
import type { GenerateMealsInput, GenerateMealsResult } from "@/lib/planner/types";
import { generateMeals } from "@/lib/planner/generate-meals";
import { requestMealsFromModel, type AiUsageMetrics, type Fetcher } from "@/server/llm/client";
import type { MealsOutput } from "@/server/llm/schema";

export interface PlanningResult {
  meals: MealsOutput | null;
  fallbackPlans: GenerateMealsResult | null;
  fallback: boolean;
  message: string;
  usage: AiUsageMetrics;
}

export async function generateWithFallback(input: GenerateMealsInput, fetcher: Fetcher = fetch): Promise<PlanningResult> {
  try {
    const result = await requestMealsFromModel(input, fetcher);
    return { meals: result.meals, fallbackPlans: null, fallback: false, message: "", usage: result.usage };
  } catch (error) {
    const usage: AiUsageMetrics = error instanceof Error && "usage" in error ? (error as Error & { usage: AiUsageMetrics }).usage : { model: process.env.AI_MODEL ?? "unconfigured", promptTokens: 0, completionTokens: 0, durationMs: 0, status: "failure" };
    return { meals: null, fallbackPlans: generateMeals(input), fallback: true, message: zhCN.usedLocalPlan, usage };
  }
}
