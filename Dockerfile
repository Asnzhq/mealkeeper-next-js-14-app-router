FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates openssl && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@11.25.0

FROM base AS builder
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ENV DATABASE_URL=file:/app/seed.sqlite
RUN pnpm exec prisma generate
RUN pnpm exec prisma migrate deploy && pnpm seed
RUN pnpm build \
    && mkdir -p .next/standalone/public .next/standalone/.next/static \
    && cp -R public/. .next/standalone/public/ \
    && cp -R .next/static/. .next/standalone/.next/static/

FROM base AS runner
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 DATABASE_URL=file:/app/data/mealkeeper.sqlite
COPY --from=builder --chown=node:node /app ./
RUN mkdir -p /app/data /app/.next/standalone/public/uploads \
    && chown node:node /app/data /app/.next/standalone/public/uploads
USER node
EXPOSE 3000
CMD ["sh", "/app/scripts/start-sqlite.sh"]
