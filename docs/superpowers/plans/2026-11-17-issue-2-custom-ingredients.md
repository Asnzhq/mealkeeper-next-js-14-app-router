# Issue 2: Custom Ingredients Implementation Plan

> **For agentic workers:** Required sub-skill: execute this plan inline with TDD. Each task ends in its own verification cycle.

**Goal:** Let families save arbitrary ingredient names, categories, and units; parse mixed batch input with row-level errors; ask before merging a duplicate and preserve inventory-ledger writes.

**Architecture:** Keep the existing ingredient UI and REST API. Expand accepted unit tokens, make batch parsing return both valid rows and line errors, and return Zod field errors in the existing `{ code, data, message }` envelope. Detect duplicates in the UI; merge through the server using `applyInventoryChange` so stock remains ledger-backed.

**Tech Stack:** Next.js App Router, TypeScript, React Hook Form, Zod, TanStack Query, Prisma, SQLite, Vitest, Playwright.

**Spec:** User-pasted MealKeeper bug-fix request, Issue 2 and the confirmation in the conversation dated 2026-11-17.

## Global Constraints

- Inventory changes only through InventoryLog and `applyInventoryChange`; never write `stock_qty` directly.
- Keep API responses shaped as `{ code, data, message }` and validate inputs with Zod.
- Keep UI copy in `lib/i18n/zh-CN.ts`; use Tailwind design tokens.
- Do not change unrelated modules or database field semantics.
- Stop after Issue 2 and report its acceptance evidence.

## Review Focus

- Custom Chinese units must round-trip through manual and batch creation; parser and API schema tests cover this.
- Malformed batch rows must not hide valid rows or silently disappear; parser tests assert valid rows and line-specific errors together.
- Duplicate merges must add inventory through an auditable positive InventoryLog; route integration test checks both stock and log.
- Server validation errors must identify the relevant field in the existing response envelope; API test checks field error keys.
- New custom categories and units must remain visible and selectable after saving; UI test exercises the form path.

---

### Task 1: Units, categories, and line-aware batch parsing

**Files:**
- Modify: `lib/ingredients.ts`, `lib/units.ts`, `lib/ingredients.test.ts`
- Modify: `server/schemas.ts`, add schema tests
- Modify: `components/ingredients/ingredients-client.tsx`, `lib/i18n/zh-CN.ts`

**Interfaces:**
- `parseIngredientLines(input)` returns `{ items: ParsedIngredientLine[]; errors: { line: number; text: string; message: string }[] }`.
- Ingredient schema accepts trimmed names of 1–30 characters, nonempty category and unit strings, with known units offered as built-in choices.

- [x] Write failing parser/schema tests for `鲈鱼 1 条`, `老豆腐 1 盒`, custom units/categories, and mixed valid/invalid lines retaining original line numbers.
- [x] Run targeted Vitest tests and confirm failures are due to the current fixed unit/parser contracts.
- [x] Implement line-aware parsing, required built-in units, custom unit/category inputs, and an “其他” category option.
- [x] Run targeted tests and typecheck.

### Task 2: Duplicate prompt, auditable merge, and field-level API errors

**Files:**
- Modify: `components/ingredients/ingredients-client.tsx`
- Modify: `app/api/[...segments]/route.ts`, `server/schemas.ts`, `server/http.ts` only if needed
- Add: route integration and focused UI tests

**Interfaces:**
- Duplicate choice is explicit: `merge` or `new`; an omitted choice prompts in the UI.
- Merge converts compatible quantities to the existing ingredient unit and records a positive InventoryLog via `applyInventoryChange`; incompatible units return an actionable validation response.
- Ingredient Zod failures return field errors inside `data` while keeping the shared response envelope.

- [x] Write failing integration tests for duplicate merge/new, ledger-backed positive merge, and field error data.
- [x] Run targeted tests and confirm the expected failures.
- [x] Implement the API duplicate mode and field error response; bind errors to React Hook Form fields and prompt for merge/new before submission.
- [x] Run `pnpm test`, `pnpm typecheck`, and `pnpm build`; run focused Playwright coverage for custom ingredient entry where the test environment supports it.
- [x] Review the diff for scope and direct inventory writes; commit as `fix(issue-2): 支持自定义食材与安全合并`.

**Post-commit E2E verification (2026-11-17):** `pnpm exec playwright test e2e/ingredients-custom.spec.ts --grep "手机视口"` passed (1/1), including the “仍新建” choice and two same-name rows. The missing locked SWC package was installed from the npm mirror; no manifest or lockfile changes were required.
