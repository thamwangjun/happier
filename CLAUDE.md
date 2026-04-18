# Repository Conventions (Happier monorepo)

This file provides cross-cutting guidance for Claude Code (claude.ai/code) when working in this monorepo.

Package-specific guidance lives in:
- `cli/CLAUDE.md` (Happier CLI)
- `expo-app/CLAUDE.md` (Expo app)
- `server/CLAUDE.md` (Server)

## Naming conventions (shared)

These are repo-wide defaults. **If a package-specific `CLAUDE.md` conflicts with this file, the package-specific file wins** (e.g. the server has its own directory naming conventions).

### Folders
- Buckets: lowercase (e.g. `components`, `hooks`, `utils`, `modules`, `types`)
- Feature folders: `camelCase` (e.g. `newSession`, `agentInput`)
- Avoid `_folders` except special/framework files and `__tests__`
- Prefer not to create a folder that contains only a single file (unless it groups platform variants like `Thing.ios.tsx`/`Thing.web.tsx`, or it’s clearly about to grow).

### Files
- React components: `PascalCase.tsx`
- Hooks: `useThing.ts`
- Plain TS modules: `camelCase.ts`

### Allowed `_*.ts` markers (organization only)

Allowed only inside “module-ish” directories (e.g. `modules/`, `ops/`, `phases/`, `helpers/`, `domains/`):
- `_types.ts`
- `_shared.ts`
- `_constants.ts`

No other `_*.ts` file names should be introduced.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Happier**

Happier is an open-source, end-to-end encrypted companion app for AI coding agents. It lets developers run AI sessions (Claude Code, Codex, Gemini, OpenCode, and more) locally on their computer and control them remotely from a mobile app, web UI, or desktop app — without losing context or sacrificing security. This repo is a fork of the upstream `happier-dev/happier`.

**Core Value:** A developer can start an AI coding session on their machine and seamlessly continue, monitor, and approve it from any device — phone, browser, or desktop — with all data end-to-end encrypted.

### Constraints

- **Tech stack**: TypeScript everywhere; React Native/Expo for mobile; Fastify/Prisma for server; Ink for CLI TUI. All E2E encryption via libsodium/tweetnacl only.
- **Security**: Server must never store plaintext session content. Auth must use the existing challenge-response or QR-flow patterns. No new global state or unauthenticated endpoints.
- **Compatibility**: Changes must remain compatible with the upstream mobile app and CLI formats to allow continued upstream merges.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.9.3 - Used across all packages (server, CLI, UI, protocol, agents)
- Rust (Edition 2021, rust-version 1.94.1) - Desktop app shell via Tauri (`apps/ui/src-tauri/`)
- JavaScript (ESM `.mjs`) - Build scripts, tooling, postinstall hooks
- Node.js TypeScript (experimental strip-types) - Test wiring scripts (`scripts/testing/`)
## Runtime
- Node.js 22 (Dockerfile ARG; relay-server `engines.node >= 22`)
- Node.js 20 declared in `apps/server/CLAUDE.md`
- Yarn 1.22.22 (Classic)
- Lockfile: `yarn.lock` present
- Workspace manager: Yarn workspaces (monorepo)
## Frameworks
- Fastify 5.x (`apps/server`) - HTTP API framework
- fastify-type-provider-zod 6.1.0 - Zod schema integration for Fastify routes
- Socket.io 4.8.x - WebSocket/real-time server
- React Native 0.81.5 (`apps/ui`)
- Expo SDK 54 - Managed build pipeline, OTA updates, native modules
- Expo Router 6.0.22 - File-based routing
- React 19.1.0
- Tauri 2.8.x (`apps/ui/src-tauri/`) - macOS/Windows desktop shell wrapping Expo web export
- Ink 6.5.x - React-based terminal UI (`apps/cli`)
- Fastify 5.x - Internal daemon HTTP server for RPC
- Vitest 3.x - Unit and integration tests across all packages
- jest-expo - Jest preset declared (legacy, not primary runner)
- tsx 4.x - TypeScript runner (dev + scripts)
- tsc - TypeScript type-checking (build step)
- pkgroll 2.x - CLI package bundler
- Dagger - CI/CD pipeline (see `dagger/`)
## Key Dependencies
- `@happier-dev/protocol` (0.0.0) - Shared message/type definitions used by all packages
- `@happier-dev/agents` (0.0.0) - Agent abstraction layer used by server and UI
- `@happier-dev/cli-common` (0.0.0) - Shared CLI utilities
- `@happier-dev/connection-supervisor` (0.0.0) - Connection lifecycle management
- `@happier-dev/transfers` (0.0.0) - File/data transfer protocol
- Zod 4.3.6 (pinned, nohoisted) - Schema validation; used by all packages for protocol types and API validation
- `@prisma/client` ^6.11.1 + `prisma` ^6.11.1 - ORM for PostgreSQL/SQLite/MySQL
- `ioredis` ^5.6.1 - Redis client for pub/sub and caching
- `socket.io` ^4.8.1 + `@socket.io/redis-streams-adapter` ^0.2.2 - Real-time with optional Redis adapter
- `minio` ^8.0.5 - S3-compatible object storage client
- `@electric-sql/pglite` ^0.3.15 + `@electric-sql/pglite-socket` - Embedded Postgres for "light" server mode
- `pino` ^9.x + `pino-pretty` - Structured logging
- `prom-client` ^15.1.3 - Prometheus metrics export
- `zustand` ^5.0.6 - State management
- `socket.io-client` ^4.8.1 - WebSocket client
- `libsodium-wrappers` 0.8.2 + `@more-tech/react-native-libsodium` - End-to-end encryption (NaCl)
- `@livekit/react-native` ^2.9.x - Voice communication
- `@revenuecat/purchases-js` ^1.11.1 + `react-native-purchases` ^9.4.2 - In-app purchases
- `@sentry/react-native` ^8.1.0 - Error tracking
- `posthog-react-native` ^4.16.2 - Product analytics
- `@elevenlabs/react` ^0.12.3 + `@elevenlabs/react-native` ^0.5.7 - Voice AI widget
- `@anthropic-ai/claude-agent-sdk` ^0.2.34 - Claude agent integration
- `@agentclientprotocol/sdk` ^0.14.1 - ACP protocol client
- `@modelcontextprotocol/sdk` ^1.25.3 - MCP server/client bridge
- `@huggingface/transformers` ^3.8.1 - Local model inference
- `tweetnacl` ^1.0.3 - Bundled NaCl cryptography
- `node-pty` ^1.1.0 + `@homebridge/node-pty-prebuilt-multiarch` - Terminal PTY
- `ai` ^5.0.107 - Vercel AI SDK
## Configuration
- Server: `apps/server/.env.dev` (dev), `.env.example` (reference)
- CLI: `apps/cli/.env.dev`, `.env.dev-local-server`, `.env.integration-test`
- UI: `apps/ui/.env.local.example`
- Stack: `apps/stack/.env.example`
- Runtime config via `process.env` with `dotenv` / `dotenv-cli`
- `tsconfig.json` per workspace
- `vitest.config.ts` per workspace; root `vitest.config.ts` for monorepo coordination
- `apps/ui/babel.config.js`, `apps/ui/metro.config.js` - React Native bundler
- `apps/ui/app.config.js` - Expo dynamic config (variant-aware)
- `apps/ui/src-tauri/Cargo.toml` - Rust/Tauri build
- `mise.toml` - Tool version management (yarn = "1")
- Root `package.json` orchestrates workspace builds and test suites
- `apps/stack/` - Local dev orchestration scripts
## Platform Requirements
- Node.js 22, Yarn 1.22.22
- Docker (PostgreSQL via `docker run postgres:17`, Redis, MinIO)
- FFmpeg, Python3 (server runtime)
- Xcode (iOS), Android Studio (Android)
- Rust + cargo (for Tauri desktop builds)
- Docker container (multi-stage Dockerfile, Node.js 22-alpine base)
- Exposes port 3000
- Requires FFmpeg, Python3 in runtime image
- PostgreSQL, Redis, S3-compatible storage (production "full" flavor)
- SQLite or PGLite ("light" embedded flavor, no external DB required)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- React components: `PascalCase.tsx` (e.g., `Header.tsx`, `SessionCard.tsx`)
- Hooks: `useThing.ts` (e.g., `useHappyAction.ts`, `useHappierVoiceSupport.ts`)
- Plain TypeScript modules: `camelCase.ts` (e.g., `dispatchActivityNotification.ts`, `syncOps.ts`)
- Test files (CLI/UI): `camelCase.test.ts` co-located with source; use dotted suffixes for test type: `.integration.test.ts`, `.slow.test.ts`, `.e2e.test.ts`
- Test files (server): `camelCase.spec.ts` co-located with source; integration specs use `.integration.spec.ts`
- Barrel files in module-ish directories: `_types.ts`, `_shared.ts`, `_constants.ts` only
- Bucket directories: lowercase (e.g., `components`, `hooks`, `utils`, `sync`, `modules`)
- Feature directories: `camelCase` (e.g., `newSession`, `agentInput`, `profileEdit`)
- Test directories: `__tests__` (special convention)
- Avoid `_folder` prefixes except `__tests__`
- `camelCase` for all functions, including exports: `dispatchActivityNotificationAsync`, `buildActivityNotificationContent`, `computeSessionContributesToActivityBadge`
- Async functions prefer `Async` suffix when the async nature is meaningful: `sendExpoPushActivityNotificationAsync`
- Factory functions: `createXxx`, `buildXxx`, `makeXxx`
- Boolean helpers: `isXxx`, `hasXxx`, `canXxx` (e.g., `isTopicEnabled`, `isDbMockLeaf`)
- Utility/computation: `resolveXxx`, `computeXxx`, `parseXxx`
- `camelCase` throughout
- Boolean variables use auxiliary verbs: `isLoading`, `hasError`, `isAuthenticated`
- Constants at module scope: `SCREAMING_SNAKE_CASE` (e.g., `DYNAMIC_CONFIG_OPTIONS_PROBE_SUCCESS_TTL_MS`, `PERSIST_KEY`)
- Interfaces and type aliases: `PascalCase`
- Prefer `interface` over `type` in server code; UI/CLI use both idiomatically
- Generic parameter names: single capital letter or descriptive PascalCase (`TShape`, `TModule`, `T`)
- Avoid enums — use `const` maps or union string types instead
## Code Style
- 4 spaces for indentation (enforced across all packages — CLI, server, UI)
- No Prettier config detected at root; formatting is enforced by convention per CLAUDE.md
- No ESLint config detected at monorepo root; individual packages may carry configs
- TypeScript `strict` mode enabled in all packages (`tsconfig.json`)
- Strict mode required everywhere — no untyped code
- Explicit parameter and return types on all exported functions
- Prefer `Readonly<{}>` and `ReadonlyArray<>` for immutable shapes
- Use `as const` for literal tuples used as types
- Avoid classes; prefer functional patterns and plain functions
- All imports at top of file — never import mid-code
## Import Organization
- `@/` → `src/` in CLI (`apps/cli`)
- `@/` → `sources/` in UI (`apps/ui`)
- `@/` → `sources/` in server (`apps/server`) using `vite-tsconfig-paths`
- Workspace packages imported by name: `@happier-dev/protocol`, `@happier-dev/agents`, `@happier-dev/connection-supervisor`
## Error Handling
- Use `try-catch` blocks with specific error logging (not silent swallowing)
- Use `AbortController` for cancellable async operations
- Graceful cleanup on errors — functions handle process lifecycle explicitly
- Return `null` or use discriminated unions to signal absence rather than throwing for expected cases
- Server: design all operations to be idempotent — clients may retry
- Wrap DB operations in `inTx` for transactional safety
- Do not run non-transactional things (like file uploads) inside transactions
- Use `afterTx` to emit events after transaction commit, not directly inside
## Logging
- CLI: all debug output goes to file logs only — never to stdout (avoids disrupting Claude terminal UI)
- Console output reserved for user-facing messages only
- Server: structured logging with `log()` / `logger` — includes `localTime` field
- Never log secret values — log counts/booleans like `hasValue` instead
- Do not add logging unless explicitly asked
## Comments
- Each file includes a header comment explaining its responsibilities (CLI convention from CLAUDE.md)
- Complex logic gets inline comments explaining "why"
- Action functions get a documentation comment explaining logic, kept in sync with implementation
- Used on exported utility functions per server convention
- Not required universally but preferred on public API surfaces
## Function Design
## Module Design
- Named exports preferred; default exports only for main component/function of a file
- CLI: avoid default exports except for entry points
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
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- Three-tier client-server-daemon system: mobile app (`apps/ui`) ↔ relay server (`apps/server`) ↔ CLI daemon (`apps/cli`)
- All sensitive data is end-to-end encrypted (TweetNaCl / libsodium) before leaving the device
- Shared protocol types in `packages/protocol` ensure type-safe cross-boundary communication
- Agent/backend abstraction layer in `apps/cli` allows multiple AI providers (Claude, Codex, Gemini, OpenCode, etc.)
- Real-time communication via Socket.IO with Redis Streams adapter for horizontal scaling
## Layers
- Purpose: Shared Zod schemas and TypeScript types for all cross-boundary messages
- Location: `packages/protocol/src/`
- Contains: Session types, RPC definitions, encryption envelopes, provider schemas, update payloads
- Depends on: Zod
- Used by: `apps/cli`, `apps/server`, `apps/ui`, `packages/agents`
- Purpose: Uniform interface over multiple AI backend providers
- Location: `apps/cli/src/agent/core/`, `apps/cli/src/backends/`
- Contains: `AgentBackend.ts` interface, `AgentFactory.ts`, `catalog.ts` registry, per-vendor backend directories (`claude/`, `codex/`, `gemini/`, `opencode/`, etc.)
- Depends on: `packages/agents`, `packages/protocol`
- Used by: `apps/cli/src/agent/runtime/`, `apps/cli/src/daemon/`
- Purpose: Persistent background process managing sessions, machine registration, auto-updates
- Location: `apps/cli/src/daemon/`
- Contains: `startDaemon.ts`, `controlServer.ts`, `controlClient.ts`, session management, lifecycle hooks
- Depends on: Agent layer, API layer
- Used by: CLI commands (`daemon start/stop/status`)
- Purpose: Encrypted HTTP + WebSocket communication with the relay server
- Location: `apps/cli/src/api/`
- Contains: `api.ts` (REST client), `apiMachine.ts` (WebSocket machine client), `encryption.ts`, `auth.ts`, `sessionClient.ts`
- Depends on: Axios, Socket.IO client, TweetNaCl
- Used by: Daemon layer, session handlers
- Purpose: Stateless API gateway, real-time event bus, encrypted data store
- Location: `apps/server/sources/`
- Contains: Fastify routes (`sources/app/api/routes/`), Socket.IO server (`sources/app/api/socket/`), event router (`sources/app/events/`), Prisma storage (`sources/storage/`)
- Depends on: Fastify 5, Prisma, PostgreSQL/SQLite/PGlite, Redis, Socket.IO
- Used by: CLI daemon, mobile app
- Purpose: Real-time state synchronization with encryption between app and server
- Location: `apps/ui/sources/sync/`
- Contains: `sync.ts` (singleton orchestrator), `engine/` (sync logic), `domains/` (state slices), `store/` (Zustand state), `api/` (HTTP + Socket.IO client)
- Depends on: React Native, Socket.IO client, libsodium, Zustand
- Used by: UI screens (`apps/ui/sources/app/`)
- Purpose: Expo Router file-based screens and reusable components
- Location: `apps/ui/sources/app/`, `apps/ui/sources/components/`
- Contains: Route screens, navigation layouts, reusable component library (Unistyles-based)
- Depends on: Expo Router v6, React Native, Unistyles
- Used by: End user
## Data Flow
- Zustand store in `apps/ui/sources/sync/store/` with domain slices under `domains/`
- `Sync` singleton (`apps/ui/sources/sync/sync.ts`) owns the WebSocket lifecycle and dispatches updates to store
- React hooks in `apps/ui/sources/sync/hooks.ts` consume store for UI rendering
## Key Abstractions
- Purpose: Per-provider configuration and hook registry for the CLI backend catalog
- Examples: `apps/cli/src/backends/catalog.ts`, `apps/cli/src/backends/types.ts`, `apps/cli/src/backends/claude/index.ts`
- Pattern: Register vendor-specific hooks (fork, attach, resume, direct-sessions) in `AgentCatalogEntry`; core orchestration calls catalog hooks instead of branching on provider IDs
- Purpose: Uniform interface all AI provider adapters must implement
- Examples: `apps/cli/src/agent/core/AgentBackend.ts`
- Pattern: `AgentMessage` discriminated union carries all output types (model-output, tool-call, permission-request, etc.)
- Purpose: Standardized protocol for controlling ACP-compatible agents over stdio/network
- Location: `apps/cli/src/agent/acp/`, `packages/protocol/src/acpCatalog/`
- Pattern: `AcpBackend` wraps any ACP-compliant agent process; bridge modules translate between ACP messages and Happier's internal event model
- Purpose: Zod-validated types shared across all packages
- Examples: `packages/protocol/src/session/`, `packages/protocol/src/sessionMessages/`, `packages/protocol/src/tools/`
- Pattern: Each domain in `packages/protocol/src/<domain>/` exports Zod schemas + inferred TypeScript types
- Purpose: Fan-out of server-side state changes to connected clients
- Location: `apps/server/sources/app/events/eventRouter.ts`
- Pattern: Write actions emit typed events via `eventRouter`; Socket.IO handlers in `sources/app/api/socket/` broadcast to relevant rooms (user-scoped, machine-scoped, session-scoped)
- Purpose: Managed WebSocket reconnection with backoff policy
- Location: `packages/connection-supervisor/src/`
- Pattern: `createManagedEndpointSupervisor()` wraps Socket.IO socket; consumers observe supervisor state for connectivity gating
## Entry Points
- Location: `apps/cli/src/index.ts`
- Triggers: End user running `happier [subcommand]`
- Responsibilities: Platform hardening, argv normalization, auto-update re-exec, command dispatch to `apps/cli/src/cli/dispatch.ts`
- Location: `apps/cli/src/daemon/startDaemon.ts`
- Triggers: Spawned detached by `happier daemon start`
- Responsibilities: Machine registration, WebSocket connection, session lifecycle management, local HTTP control server
- Location: `apps/server/sources/startServer.ts`
- Triggers: Node.js process start (Docker / systemd / local dev)
- Responsibilities: Database init, Fastify API startup, Socket.IO server, Redis adapter, background workers
- Location: `apps/ui/index.ts`, `apps/ui/sources/app/_layout.tsx`
- Triggers: Expo / Tauri app launch
- Responsibilities: Bootstrap auth, create `Sync` singleton, mount Expo Router navigation tree
## Error Handling
- Server: Fastify error handlers in `apps/server/sources/app/api/utils/enableErrorHandlers.ts`; Zod validation errors surfaced as 400 with schema details
- CLI: Axios errors wrapped by `serializeAxiosErrorForLog`; abort controllers for cancellable operations; structured `try-catch` with file logging (never `console.error` mid-session)
- Mobile: `Sync` singleton uses connectivity gating (`apps/ui/sources/sync/runtime/connectivity/`) to queue operations while offline; errors propagated via Zustand store state
## Cross-Cutting Concerns
- CLI: File-based logging only during active sessions (`apps/cli/src/ui/logger.ts`); `console.*` only for user-facing output. Log files in `$HAPPIER_HOME_DIR/logs/`.
- Server: Fastify's `pino` logger (`apps/server/sources/utils/logging/log.ts`); logs include `localTime` for correlation. Sentry integration via `apps/server/sources/app/monitoring/sentry.ts`.
- Mobile: Logs sent to server's `/logs-combined-from-cli-and-mobile-for-simple-ai-debugging` endpoint when `DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING=true`.
- Server routes: Zod via `fastify-type-provider-zod`; all inputs validated at route level
- CLI: Zod schemas from `packages/protocol` for all RPC messages and server responses
- Server: Bearer token auth enforced by `enableAuthentication()` middleware in `apps/server/sources/app/api/utils/enableAuthentication.ts`
- CLI ↔ Server: Challenge-response with TweetNaCl keypair; tokens stored in `~/.happier-dev/`
- Mobile ↔ Server: Bearer token obtained via QR-code OAuth flow; stored in `apps/ui/sources/auth/storage/tokenStorage.ts`
- All session data: End-to-end encrypted (server stores ciphertext only)
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, or `.github/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
