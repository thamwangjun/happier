# Architecture

**Analysis Date:** 2026-04-18

## Pattern Overview

**Overall:** Distributed multi-process monorepo with end-to-end encryption

**Key Characteristics:**
- Three-tier client-server-daemon system: mobile app (`apps/ui`) ↔ relay server (`apps/server`) ↔ CLI daemon (`apps/cli`)
- All sensitive data is end-to-end encrypted (TweetNaCl / libsodium) before leaving the device
- Shared protocol types in `packages/protocol` ensure type-safe cross-boundary communication
- Agent/backend abstraction layer in `apps/cli` allows multiple AI providers (Claude, Codex, Gemini, OpenCode, etc.)
- Real-time communication via Socket.IO with Redis Streams adapter for horizontal scaling

## Layers

**Protocol Layer:**
- Purpose: Shared Zod schemas and TypeScript types for all cross-boundary messages
- Location: `packages/protocol/src/`
- Contains: Session types, RPC definitions, encryption envelopes, provider schemas, update payloads
- Depends on: Zod
- Used by: `apps/cli`, `apps/server`, `apps/ui`, `packages/agents`

**Agent Abstraction Layer (CLI):**
- Purpose: Uniform interface over multiple AI backend providers
- Location: `apps/cli/src/agent/core/`, `apps/cli/src/backends/`
- Contains: `AgentBackend.ts` interface, `AgentFactory.ts`, `catalog.ts` registry, per-vendor backend directories (`claude/`, `codex/`, `gemini/`, `opencode/`, etc.)
- Depends on: `packages/agents`, `packages/protocol`
- Used by: `apps/cli/src/agent/runtime/`, `apps/cli/src/daemon/`

**Daemon Layer (CLI):**
- Purpose: Persistent background process managing sessions, machine registration, auto-updates
- Location: `apps/cli/src/daemon/`
- Contains: `startDaemon.ts`, `controlServer.ts`, `controlClient.ts`, session management, lifecycle hooks
- Depends on: Agent layer, API layer
- Used by: CLI commands (`daemon start/stop/status`)

**API Communication Layer (CLI):**
- Purpose: Encrypted HTTP + WebSocket communication with the relay server
- Location: `apps/cli/src/api/`
- Contains: `api.ts` (REST client), `apiMachine.ts` (WebSocket machine client), `encryption.ts`, `auth.ts`, `sessionClient.ts`
- Depends on: Axios, Socket.IO client, TweetNaCl
- Used by: Daemon layer, session handlers

**Relay Server Layer:**
- Purpose: Stateless API gateway, real-time event bus, encrypted data store
- Location: `apps/server/sources/`
- Contains: Fastify routes (`sources/app/api/routes/`), Socket.IO server (`sources/app/api/socket/`), event router (`sources/app/events/`), Prisma storage (`sources/storage/`)
- Depends on: Fastify 5, Prisma, PostgreSQL/SQLite/PGlite, Redis, Socket.IO
- Used by: CLI daemon, mobile app

**Mobile Sync Layer (UI):**
- Purpose: Real-time state synchronization with encryption between app and server
- Location: `apps/ui/sources/sync/`
- Contains: `sync.ts` (singleton orchestrator), `engine/` (sync logic), `domains/` (state slices), `store/` (Zustand state), `api/` (HTTP + Socket.IO client)
- Depends on: React Native, Socket.IO client, libsodium, Zustand
- Used by: UI screens (`apps/ui/sources/app/`)

**UI Screen Layer:**
- Purpose: Expo Router file-based screens and reusable components
- Location: `apps/ui/sources/app/`, `apps/ui/sources/components/`
- Contains: Route screens, navigation layouts, reusable component library (Unistyles-based)
- Depends on: Expo Router v6, React Native, Unistyles
- Used by: End user

## Data Flow

**Remote Session Control (Mobile → CLI Agent):**

1. User taps "send message" on mobile app (`apps/ui/sources/app/sessions/`)
2. Mobile `Sync` singleton encrypts and POSTs to server via `sources/sync/api/`
3. Server stores message, emits Socket.IO `update` event to daemon's machine-scoped room
4. Daemon's `ApiMachineClient` (`apps/cli/src/api/apiMachine.ts`) receives RPC, forwards to session runner
5. Session runner passes prompt to active `AgentBackend` (e.g., `apps/cli/src/backends/claude/`)
6. Agent generates response; runner emits encrypted updates back via WebSocket
7. Server broadcasts update to mobile's user-scoped Socket.IO room
8. Mobile `Sync` decrypts, dispatches to Zustand store; React re-renders

**Authentication Flow:**

1. CLI generates keypair, stores in `~/.happier-dev/`
2. CLI calls `POST /v1/auth/request` to create auth request
3. Server returns challenge; CLI displays QR code with deep link
4. Mobile scans QR, hits `POST /v1/auth/response` to approve
5. CLI polls `GET /v1/auth/request/status`, then claims bearer token via `GET /v1/auth/request/claim`

**Daemon Startup:**

1. `apps/cli/src/index.ts` parses args, calls `dispatchCli()`
2. `daemon start` spawns detached child via `spawnHappyCLI(['daemon', 'start-sync'])`
3. Child calls `startDaemon()` in `apps/cli/src/daemon/startDaemon.ts`
4. Daemon: acquires lock file, authenticates, registers machine via `POST /v1/machines`
5. Daemon: opens persistent WebSocket to server, exposes local HTTP control server (127.0.0.1)
6. Daemon: enters event loop awaiting OS signals, HTTP `/stop`, or RPC `requestShutdown`

**State Management (UI):**
- Zustand store in `apps/ui/sources/sync/store/` with domain slices under `domains/`
- `Sync` singleton (`apps/ui/sources/sync/sync.ts`) owns the WebSocket lifecycle and dispatches updates to store
- React hooks in `apps/ui/sources/sync/hooks.ts` consume store for UI rendering

## Key Abstractions

**AgentCatalogEntry:**
- Purpose: Per-provider configuration and hook registry for the CLI backend catalog
- Examples: `apps/cli/src/backends/catalog.ts`, `apps/cli/src/backends/types.ts`, `apps/cli/src/backends/claude/index.ts`
- Pattern: Register vendor-specific hooks (fork, attach, resume, direct-sessions) in `AgentCatalogEntry`; core orchestration calls catalog hooks instead of branching on provider IDs

**AgentBackend interface:**
- Purpose: Uniform interface all AI provider adapters must implement
- Examples: `apps/cli/src/agent/core/AgentBackend.ts`
- Pattern: `AgentMessage` discriminated union carries all output types (model-output, tool-call, permission-request, etc.)

**ACP (Agent Control Protocol):**
- Purpose: Standardized protocol for controlling ACP-compatible agents over stdio/network
- Location: `apps/cli/src/agent/acp/`, `packages/protocol/src/acpCatalog/`
- Pattern: `AcpBackend` wraps any ACP-compliant agent process; bridge modules translate between ACP messages and Happier's internal event model

**Protocol Schemas:**
- Purpose: Zod-validated types shared across all packages
- Examples: `packages/protocol/src/session/`, `packages/protocol/src/sessionMessages/`, `packages/protocol/src/tools/`
- Pattern: Each domain in `packages/protocol/src/<domain>/` exports Zod schemas + inferred TypeScript types

**Update Event Bus (Server):**
- Purpose: Fan-out of server-side state changes to connected clients
- Location: `apps/server/sources/app/events/eventRouter.ts`
- Pattern: Write actions emit typed events via `eventRouter`; Socket.IO handlers in `sources/app/api/socket/` broadcast to relevant rooms (user-scoped, machine-scoped, session-scoped)

**Connection Supervisor:**
- Purpose: Managed WebSocket reconnection with backoff policy
- Location: `packages/connection-supervisor/src/`
- Pattern: `createManagedEndpointSupervisor()` wraps Socket.IO socket; consumers observe supervisor state for connectivity gating

## Entry Points

**CLI (`happier` command):**
- Location: `apps/cli/src/index.ts`
- Triggers: End user running `happier [subcommand]`
- Responsibilities: Platform hardening, argv normalization, auto-update re-exec, command dispatch to `apps/cli/src/cli/dispatch.ts`

**Daemon (`daemon start-sync`):**
- Location: `apps/cli/src/daemon/startDaemon.ts`
- Triggers: Spawned detached by `happier daemon start`
- Responsibilities: Machine registration, WebSocket connection, session lifecycle management, local HTTP control server

**Server (`startServer`):**
- Location: `apps/server/sources/startServer.ts`
- Triggers: Node.js process start (Docker / systemd / local dev)
- Responsibilities: Database init, Fastify API startup, Socket.IO server, Redis adapter, background workers

**Mobile App:**
- Location: `apps/ui/index.ts`, `apps/ui/sources/app/_layout.tsx`
- Triggers: Expo / Tauri app launch
- Responsibilities: Bootstrap auth, create `Sync` singleton, mount Expo Router navigation tree

## Error Handling

**Strategy:** Fail-fast with structured error types; graceful degradation for network faults

**Patterns:**
- Server: Fastify error handlers in `apps/server/sources/app/api/utils/enableErrorHandlers.ts`; Zod validation errors surfaced as 400 with schema details
- CLI: Axios errors wrapped by `serializeAxiosErrorForLog`; abort controllers for cancellable operations; structured `try-catch` with file logging (never `console.error` mid-session)
- Mobile: `Sync` singleton uses connectivity gating (`apps/ui/sources/sync/runtime/connectivity/`) to queue operations while offline; errors propagated via Zustand store state

## Cross-Cutting Concerns

**Logging:**
- CLI: File-based logging only during active sessions (`apps/cli/src/ui/logger.ts`); `console.*` only for user-facing output. Log files in `$HAPPIER_HOME_DIR/logs/`.
- Server: Fastify's `pino` logger (`apps/server/sources/utils/logging/log.ts`); logs include `localTime` for correlation. Sentry integration via `apps/server/sources/app/monitoring/sentry.ts`.
- Mobile: Logs sent to server's `/logs-combined-from-cli-and-mobile-for-simple-ai-debugging` endpoint when `DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING=true`.

**Validation:**
- Server routes: Zod via `fastify-type-provider-zod`; all inputs validated at route level
- CLI: Zod schemas from `packages/protocol` for all RPC messages and server responses

**Authentication:**
- Server: Bearer token auth enforced by `enableAuthentication()` middleware in `apps/server/sources/app/api/utils/enableAuthentication.ts`
- CLI ↔ Server: Challenge-response with TweetNaCl keypair; tokens stored in `~/.happier-dev/`
- Mobile ↔ Server: Bearer token obtained via QR-code OAuth flow; stored in `apps/ui/sources/auth/storage/tokenStorage.ts`
- All session data: End-to-end encrypted (server stores ciphertext only)

---

*Architecture analysis: 2026-04-18*
