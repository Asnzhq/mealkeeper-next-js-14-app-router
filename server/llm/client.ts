import type { GenerateMealsInput } from "@/lib/planner/types";
import { buildSystemPrompt, serializePlannerData } from "@/server/llm/prompts";
import { MealsSchema, mealsTool, type MealsOutput } from "@/server/llm/schema";

export interface AiUsageMetrics { model: string; promptTokens: number; completionTokens: number; durationMs: number; status: "success" | "failure" }
export class LlmError extends Error {
  constructor(message: string, readonly usage: AiUsageMetrics) { super(message); this.name = "LlmError"; }
}
interface ProviderResponse {
  model?: string;
  choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}
export type Fetcher = typeof fetch;
function endpoint(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
}

async function requestOnce(input: GenerateMealsInput, fetcher: Fetcher, usage: AiUsageMetrics): Promise<unknown> {
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = process.env.AI_BASE_URL;
  const model = process.env.AI_MODEL;
  if (!apiKey || !baseUrl || !model) throw new Error("AI 配置不完整");
  let lastError: unknown;
  for (let retry = 0; retry <= 2; retry += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetcher(endpoint(baseUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
        body: JSON.stringify({ model, temperature: 0.2, messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: serializePlannerData(input) },
        ], tools: [mealsTool], tool_choice: { type: "function", function: { name: "submit_meal_plan" } } }),
      });
      if (!response.ok) throw new Error(`模型服务返回 ${response.status}`);
      const body = await response.json() as ProviderResponse;
      usage.promptTokens += Math.max(0, body.usage?.prompt_tokens ?? 0);
      usage.completionTokens += Math.max(0, body.usage?.completion_tokens ?? 0);
      usage.model = body.model || model;
      return body.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    } catch (error) {
      lastError = error;
      if (retry < 2) await new Promise((resolve) => setTimeout(resolve, 150 * (retry + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("模型调用失败");
}

function parse(raw: unknown): MealsOutput {
  return MealsSchema.parse(typeof raw === "string" ? JSON.parse(raw) as unknown : raw);
}

export async function requestMealsFromModel(input: GenerateMealsInput, fetcher: Fetcher = fetch, clock: () => number = Date.now): Promise<{ meals: MealsOutput; usage: AiUsageMetrics }> {
  const started = clock();
  const usage: AiUsageMetrics = { model: process.env.AI_MODEL ?? "unconfigured", promptTokens: 0, completionTokens: 0, durationMs: 0, status: "failure" };
  try {
    let meals: MealsOutput;
    const raw = await requestOnce(input, fetcher, usage);
    try {
      meals = parse(raw);
    } catch {
      // A valid HTTP response with invalid JSON/schema gets exactly one extra structured-output attempt.
      meals = parse(await requestOnce(input, fetcher, usage));
    }
    usage.status = "success";
    return { meals, usage: { ...usage, durationMs: Math.max(0, clock() - started) } };
  } catch (error) {
    throw new LlmError(error instanceof Error ? error.message : "模型调用失败", { ...usage, durationMs: Math.max(0, clock() - started) });
  }
}
