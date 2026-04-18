# Coding Conventions

**Analysis Date:** 2026-04-18

## Naming Patterns

**Files:**
- React components: `PascalCase.tsx` (e.g., `Header.tsx`, `SessionCard.tsx`)
- Hooks: `useThing.ts` (e.g., `useHappyAction.ts`, `useHappierVoiceSupport.ts`)
- Plain TypeScript modules: `camelCase.ts` (e.g., `dispatchActivityNotification.ts`, `syncOps.ts`)
- Test files (CLI/UI): `camelCase.test.ts` co-located with source; use dotted suffixes for test type: `.integration.test.ts`, `.slow.test.ts`, `.e2e.test.ts`
- Test files (server): `camelCase.spec.ts` co-located with source; integration specs use `.integration.spec.ts`
- Barrel files in module-ish directories: `_types.ts`, `_shared.ts`, `_constants.ts` only

**Directories:**
- Bucket directories: lowercase (e.g., `components`, `hooks`, `utils`, `sync`, `modules`)
- Feature directories: `camelCase` (e.g., `newSession`, `agentInput`, `profileEdit`)
- Test directories: `__tests__` (special convention)
- Avoid `_folder` prefixes except `__tests__`

**Functions:**
- `camelCase` for all functions, including exports: `dispatchActivityNotificationAsync`, `buildActivityNotificationContent`, `computeSessionContributesToActivityBadge`
- Async functions prefer `Async` suffix when the async nature is meaningful: `sendExpoPushActivityNotificationAsync`
- Factory functions: `createXxx`, `buildXxx`, `makeXxx`
- Boolean helpers: `isXxx`, `hasXxx`, `canXxx` (e.g., `isTopicEnabled`, `isDbMockLeaf`)
- Utility/computation: `resolveXxx`, `computeXxx`, `parseXxx`

**Variables:**
- `camelCase` throughout
- Boolean variables use auxiliary verbs: `isLoading`, `hasError`, `isAuthenticated`
- Constants at module scope: `SCREAMING_SNAKE_CASE` (e.g., `DYNAMIC_CONFIG_OPTIONS_PROBE_SUCCESS_TTL_MS`, `PERSIST_KEY`)

**Types:**
- Interfaces and type aliases: `PascalCase`
- Prefer `interface` over `type` in server code; UI/CLI use both idiomatically
- Generic parameter names: single capital letter or descriptive PascalCase (`TShape`, `TModule`, `T`)
- Avoid enums — use `const` maps or union string types instead

## Code Style

**Formatting:**
- 4 spaces for indentation (enforced across all packages — CLI, server, UI)
- No Prettier config detected at root; formatting is enforced by convention per CLAUDE.md

**Linting:**
- No ESLint config detected at monorepo root; individual packages may carry configs
- TypeScript `strict` mode enabled in all packages (`tsconfig.json`)

**TypeScript:**
- Strict mode required everywhere — no untyped code
- Explicit parameter and return types on all exported functions
- Prefer `Readonly<{}>` and `ReadonlyArray<>` for immutable shapes
- Use `as const` for literal tuples used as types
- Avoid classes; prefer functional patterns and plain functions
- All imports at top of file — never import mid-code

## Import Organization

**Order:**
1. Node built-ins (`node:fs`, `node:path`, `node:os`)
2. External packages (`vitest`, `react`, `zod`, `fastify`)
3. Workspace packages (`@happier-dev/protocol`, `@happier-dev/agents`)
4. Internal absolute imports via `@/` alias (e.g., `@/ui/logger`, `@/storage/db`)
5. Relative imports (`./activityNotificationEvent`, `../permissions/requestKind`)

**Path Aliases:**
- `@/` → `src/` in CLI (`apps/cli`)
- `@/` → `sources/` in UI (`apps/ui`)
- `@/` → `sources/` in server (`apps/server`) using `vite-tsconfig-paths`
- Workspace packages imported by name: `@happier-dev/protocol`, `@happier-dev/agents`, `@happier-dev/connection-supervisor`

**Example (CLI):**
```typescript
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { vi } from 'vitest';

import { resolveNotificationChannelsV1FromAccountSettings } from '@happier-dev/protocol';

import { logger } from '@/ui/logger';
import type { ActivityNotificationEvent } from './activityNotificationEvent';
```

## Error Handling

**Patterns:**
- Use `try-catch` blocks with specific error logging (not silent swallowing)
- Use `AbortController` for cancellable async operations
- Graceful cleanup on errors — functions handle process lifecycle explicitly
- Return `null` or use discriminated unions to signal absence rather than throwing for expected cases
- Server: design all operations to be idempotent — clients may retry

**Server specifics:**
- Wrap DB operations in `inTx` for transactional safety
- Do not run non-transactional things (like file uploads) inside transactions
- Use `afterTx` to emit events after transaction commit, not directly inside

## Logging

**Framework:** Custom file logger (`@/ui/logger` in CLI, `@/utils/logging/log` in server)

**Patterns:**
- CLI: all debug output goes to file logs only — never to stdout (avoids disrupting Claude terminal UI)
- Console output reserved for user-facing messages only
- Server: structured logging with `log()` / `logger` — includes `localTime` field
- Never log secret values — log counts/booleans like `hasValue` instead
- Do not add logging unless explicitly asked

## Comments

**When to Comment:**
- Each file includes a header comment explaining its responsibilities (CLI convention from CLAUDE.md)
- Complex logic gets inline comments explaining "why"
- Action functions get a documentation comment explaining logic, kept in sync with implementation

**JSDoc/TSDoc:**
- Used on exported utility functions per server convention
- Not required universally but preferred on public API surfaces

## Function Design

**Size:** Avoid "god files" — large files (e.g., `AcpBackend.ts` at 2753 lines, `rpcHandlers.sessionHandoff.ts` at 2882 lines) are considered technical debt and should be split into subfolders
**Parameters:** Use `Readonly<{ ... }>` parameter objects for functions with multiple inputs
**Return Values:** Return only essential data — do not return things "just in case"
**Design:** Avoid excessive `if` statements — prefer better data flow design over control-flow branching

## Module Design

**Exports:**
- Named exports preferred; default exports only for main component/function of a file
- CLI: avoid default exports except for entry points

**Barrel Files:**
- `index.ts` barrels used at testkit and package boundaries (e.g., `apps/ui/sources/dev/testkit/index.ts`)
- Inside module-ish directories, only `_types.ts`, `_shared.ts`, `_constants.ts` markers allowed

## UI-Specific (apps/ui)

- No hardcoded colors — use `theme.colors.*` tokens from `react-native-unistyles`
- Icons must use theme tokens for color
- All user-facing strings must use `t('...')` from `@/text` — never hardcode English in JSX
- Use `Text`/`TextInput` from `@/components/ui/text/Text` — never from `react-native` directly
- Use `Modal` from `@/modal` — never `Alert` or `react-native`'s `<Modal>`
- Styles always placed at the end of the component file
- Pages always wrapped in `memo`
- Use `useHappyAction` from `@/hooks/useHappyAction` for async operations — do not handle errors manually

---

*Convention analysis: 2026-04-18*
