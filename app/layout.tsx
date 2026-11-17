import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "MealKeeper · 家庭智能菜单",
  description: "让每一餐，都刚刚好。",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "MealKeeper" },
};

// CSP nonces are attached per request by middleware; static HTML cannot carry a request nonce.
export const dynamic = "force-dynamic";

export const viewport: Viewport = { themeColor: "#E85D4E", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body><Providers>{children}</Providers></body></html>;
}

