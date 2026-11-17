import { NextRequest, NextResponse } from "next/server";

const windows = new Map<string, { start: number; count: number }>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 120;
const AUTH_MAX_REQUESTS = 20;

function policy(nonce: string, localOnly: boolean, development: boolean) {
  const scripts = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(development ? ["'unsafe-eval'"] : [])].join(" ");
  const connections = localOnly ? "'self'" : "'self' https: wss:";
  const images = localOnly ? "'self' data: blob:" : "'self' data: blob: https:";
  return [
    "default-src 'self'", `script-src ${scripts}`, "style-src 'self' 'unsafe-inline'",
    `img-src ${images}`, `connect-src ${connections}`, "font-src 'self' data:",
    "worker-src 'self' blob:", "manifest-src 'self'", "object-src 'none'",
    "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
  ].join("; ");
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const localOnly = request.cookies.get("mealkeeper-local-mode")?.value === "1";
  if (localOnly && pathname === "/_next/image") {
    const source = request.nextUrl.searchParams.get("url") ?? "";
    if (/^https?:\/\//i.test(source)) return new NextResponse(null, { status: 403 });
  }
  if (pathname.startsWith("/api/")) {
    const forwarded = request.headers.get("x-real-ip")?.trim() ?? request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "unknown";
    const key = `${forwarded}:${pathname.startsWith("/api/auth/") ? "auth" : pathname}`;
    const now = Date.now();
    const current = windows.get(key);
    const limit = pathname.startsWith("/api/auth/") ? AUTH_MAX_REQUESTS : MAX_REQUESTS;
    const bucket = !current || now - current.start >= WINDOW_MS ? { start: now, count: 1 } : { ...current, count: current.count + 1 };
    windows.set(key, bucket);
    if (bucket.count > limit) {
      return NextResponse.json({ code: 429, data: null, message: "请求过于频繁，请稍后再试。" }, { status: 429, headers: { "Retry-After": "60" } });
    }
  }

  const nonce = crypto.randomUUID().replace(/-/g, "");
  const csp = policy(nonce, localOnly, process.env.NODE_ENV !== "production");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(self), geolocation=(), payment=()");
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
