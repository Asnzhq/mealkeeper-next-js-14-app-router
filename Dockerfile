FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@11.25.0

FROM base AS builder
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm exec prisma generate
RUN pnpm build \
    && mkdir -p .next/standalone/public .next/standalone/.next/static \
    && cp -R public/. .next/standalone/public/ \
    && cp -R .next/static/. .next/standalone/.next/static/

FROM base AS runner
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app ./
EXPOSE 3000
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && cd .next/standalone && exec node server.js"]
