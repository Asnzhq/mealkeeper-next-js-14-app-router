export function ok<T>(data: T, message = "成功", status = 200) { return Response.json({ code: 0, data, message }, { status }); }
export function fail(message: string, status = 400, data: unknown = null) { return Response.json({ code: status, data, message }); }
export async function bodyOf<T>(request: Request, schema: { safeParse: (value: unknown) => { success: boolean; data?: T; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } } }) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error?.issues ?? []) {
      const field = issue.path[0];
      if (typeof field !== "string") continue;
      fieldErrors[field] = [...(fieldErrors[field] ?? []), issue.message];
    }
    return { response: fail("参数校验失败", 422, { fieldErrors }) };
  }
  return { data: parsed.data as T };
}
