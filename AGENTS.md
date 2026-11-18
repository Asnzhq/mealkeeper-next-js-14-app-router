# MealKeeper 工程规范

- 使用函数式 React 组件与 TypeScript；禁止使用 `any`，优先定义明确的类型。
- 所有面向用户的 UI 文案集中在 `lib/i18n/zh-CN.ts`，组件中不得硬编码界面文案。
- 每个页面都必须提供 loading 骨架屏与空状态，即使当前页面数据为静态占位。
- 颜色只能通过 Tailwind 设计令牌引用，禁止在组件中使用任意颜色值。
- 使用 App Router；服务端数据访问放在 `server/`，通用工具放在 `lib/`。
- 表单使用 react-hook-form + zod；服务端缓存状态使用 TanStack Query。
- Prisma 以 SQLite 为开发与部署默认值，使用 `prisma/schema.prisma` 与 SQLite 迁移。
- 保持移动优先布局，并确保页面不产生横向滚动。

