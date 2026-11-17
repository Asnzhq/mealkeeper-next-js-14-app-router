FROM node:20-bookworm-slim AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm exec prisma generate --schema prisma/postgres/schema.prisma
RUN pnpm build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY --from=builder /app ./
EXPOSE 3000
CMD ["sh", "-c", "pnpm exec prisma migrate deploy --schema prisma/postgres/schema.prisma && pnpm start"]
