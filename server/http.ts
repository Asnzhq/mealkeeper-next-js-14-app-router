export function ok<T>(data: T, message = "成功", status = 200) { return Response.json({ code: 0, data, message }, { status }); }
export function fail(message: string, status = 400) { return Response.json({ code: status, data: null, message }); }
export async function bodyOf<T>(request: Request, schema: { safeParse: (value: unknown) => { success: boolean; data?: T; error?: { issues: unknown[] } } }) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return { response: fail("参数校验失败", 422) };
  return { data: parsed.data as T };
}
