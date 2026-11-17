import nextPWA from "next-pwa";
import bundleAnalyzer from "@next/bundle-analyzer";

const withPWA = nextPWA({
  dest: "public",
  register: false,
  skipWaiting: true,
  customWorkerDir: "worker",
  disable: process.env.NODE_ENV === "development",
  buildExcludes: [/app-build-manifest\.json$/],
  fallbacks: { document: "/offline" },
  runtimeCaching: [
    {
      urlPattern: ({ request }) => request.mode === "navigate",
      handler: "NetworkFirst",
      options: { cacheName: "mealkeeper-pages-v1", networkTimeoutSeconds: 3, expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 7 } },
    },
    {
      urlPattern: ({ url, request }) => request.method === "GET" && url.origin === self.location.origin && /^\/api\/(ingredients|plans|recipes)(\/|$)/.test(url.pathname),
      handler: "NetworkFirst",
      options: {
        cacheName: "mealkeeper-read-api-v1",
        networkTimeoutSeconds: 3,
        expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 },
        plugins: [{
          cacheWillUpdate: async ({ response }) => {
            if (!response || response.status !== 200) return null;
            try { return (await response.clone().json()).code === 0 ? response : null; } catch { return null; }
          },
          handlerDidError: async () => new Response(JSON.stringify({ code: 503, data: null, message: "当前离线，显示最近一次保存的数据。" }), { status: 503, headers: { "Content-Type": "application/json" } }),
        }],
      },
    },
    {
      urlPattern: ({ request }) => request.destination === "image",
      handler: "CacheFirst",
      options: { cacheName: "mealkeeper-images-v1", expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true } },
    },
  ],
});

const withAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true", openAnalyzer: false, analyzerMode: "static", reportFilename: "../analyze/client.html" });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { formats: ["image/avif", "image/webp"] },
};

export default withPWA(withAnalyzer(nextConfig));

