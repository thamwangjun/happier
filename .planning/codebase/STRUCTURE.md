# Codebase Structure

**Analysis Date:** 2026-04-18

## Directory Layout

```
happier/                            # Monorepo root
├── apps/
│   ├── bootstrap/                  # System bootstrap / provisioning tool
│   ├── cli/                        # @happier-dev/cli — Node.js CLI daemon
│   │   ├── src/                    # All TypeScript sources
│   │   ├── bin/                    # Executable entry points
│   │   ├── scripts/                # Build, postinstall, runtime scripts
│   │   └── package-dist/           # Distributed MCP bridges and launchers
│   ├── docs/                       # Documentation site
│   ├── server/                     # @happier-dev/server — Fastify API server
│   │   ├── sources/                # All TypeScript sources
│   │   ├── prisma/                 # Schema, migrations, generated client
│   │   └── deploy/                 # Deployment configs
│   ├── stack/                      # Local dev orchestrator (scripts only)
│   ├── ui/                         # @happier-dev/app — React Native / Tauri app
│   │   ├── sources/                # All TypeScript/TSX sources
│   │   ├── src-tauri/              # Tauri macOS desktop config
│   │   └── plugins/                # Expo config plugins
│   ├── agents/                     # Agent runner scripts/tools
│   └── website/                    # Marketing website
├── packages/
│   ├── protocol/                   # @happier-dev/protocol — shared Zod schemas
│   ├── agents/                     # @happier-dev/agents — provider metadata / capabilities
│   ├── cli-common/                 # @happier-dev/cli-common — shared CLI utilities
│   ├── connection-supervisor/      # WebSocket reconnection library
│   ├── relay-server/               # Lightweight relay server package
│   ├── release-runtime/            # Release/update runtime helpers
│   ├── sherpa-native/              # Expo native module (on-device ASR)
│   ├── audio-stream-native/        # Expo native audio streaming module
│   ├── transfers/                  # File transfer policy and routing
│   └── tests/                      # @happier-dev/tests — E2E test suites
├── scripts/
│   ├── pipeline/                   # CI/CD pipeline scripts (bash + mjs)
│   ├── ci/                         # GitHub Actions helpers
│   ├── release/                    # Release automation
│   └── testing/                    # Test infrastructure helpers
├── skills/                         # Project-specific Claude skills
│   ├── happier-github-ops/
│   ├── happier-session-control/
│   └── happier-testing/
├── dagger/                         # Dagger CI pipeline definitions
├── docker/                         # Dockerfile and compose files
├── vitest.config.ts                # Root vitest config
├── package.json                    # Workspace root (Yarn workspaces)
└── yarn.lock
```

## Directory Purposes

**`apps/cli/src/`:**
- Purpose: All CLI source code — daemon, agent backends, API client, UI, RPC handlers
- Key subdirectories:
  - `agent/` — Agent runtime framework (ACP, transports, adapters, factories)
    - `agent/core/` — `AgentBackend.ts` interface, `AgentFactory.ts`, `AgentMessage.ts`
    - `agent/acp/` — ACP protocol implementation and catalog
    - `agent/runtime/` — Session startup, permission loop, metadata
    - `agent/executionRuns/` — Execution run profiles and lifecycle
  - `api/` — Server communication (REST + WebSocket), encryption, auth, session client
  - `backends/` — Per-provider backend implementations
    - `backends/catalog.ts` — Master provider registry (`AGENTS` map)
    - `backends/types.ts` — `AgentCatalogEntry` hook interface
    - `backends/<provider>/` — e.g., `claude/`, `codex/`, `gemini/`, `opencode/`
  - `cli/` — Arg parsing (`parseArgs.ts`), command dispatch (`dispatch.ts`), subcommands (`commands/`)
  - `daemon/` — Daemon lifecycle, control server/client, session registry
  - `integrations/` — OS tool wrappers (tmux, caffeinate, ripgrep, difftastic)
  - `rpc/handlers/` — RPC method registration for remote session surface
  - `terminal/` — Terminal runtime, attach plans, headless helpers
  - `ui/` — User-facing output: logger, QR code, auth UI
  - `utils/` — Shared helpers by subdomain (proxy, platform, timing, etc.)

**`apps/server/sources/`:**
- Purpose: Fastify API server source — routes, socket, events, storage, utilities
- Key subdirectories:
  - `app/api/` — Fastify server setup (`api.ts`), route registration, Socket.IO server
    - `app/api/routes/` — One subdirectory per domain (auth, session, machines, voice, etc.)
    - `app/api/socket/` — Socket.IO handlers (RPC forwarder, update handlers, ping)
  - `app/events/` — `eventRouter.ts` — typed event fan-out to Socket.IO rooms
  - `app/auth/` — Auth providers (GitHub OAuth, token verification)
  - `app/presence/` — Machine online/offline tracking, Redis presence queue
  - `app/monitoring/` — Sentry, Prometheus metrics, database metrics
  - `app/retention/` — Data retention workers
  - `app/integrations/` — Server-side integrations (Tailscale URL inference)
  - `storage/` — `db.ts` (Prisma multi-provider client), `blob/` (S3 / local file storage), `redis/`, `queue/`
  - `modules/` — `encrypt.ts` (server-side encryption module)
  - `utils/` — Low-level utilities (logging, process shutdown, etc.)
  - `flavors/light/` — Self-hosted "light" mode with SQLite defaults

**`apps/ui/sources/`:**
- Purpose: React Native + Expo Router source — screens, sync engine, components, auth
- Key subdirectories:
  - `app/` — Expo Router file-based screens (each file = a route)
    - `app/(app)/` — Authenticated app shell
    - `app/(app)/sessions/` — Session screens
    - `app/(app)/settings/` — Settings screens
  - `sync/` — Real-time sync engine (central to the app's data layer)
    - `sync/sync.ts` — `Sync` singleton; owns WebSocket lifecycle
    - `sync/engine/` — Core sync algorithms
    - `sync/domains/` — State domain modules (sessions, machines, settings, social, etc.)
    - `sync/store/` — Zustand store + domain hooks
    - `sync/api/` — HTTP and Socket.IO API clients
    - `sync/reducer/` — Activity and machine activity accumulators
    - `sync/ops.ts` — Sync operation dispatch functions
  - `auth/` — QR auth flow, token storage, encryption key derivation
  - `components/` — Reusable UI component library (Unistyles-based)
  - `hooks/` — Domain-specific React hooks
  - `modal/` — Modal system (`Modal`, `ModalProvider`, `useModal`)
  - `realtime/` — LiveKit voice session integration
  - `platform/` — Platform-specific code (iOS/Android/web forks)
  - `utils/` — Shared utility functions

**`packages/protocol/src/`:**
- Purpose: Single source of truth for all cross-package message schemas
- Key subdirectories: `session/`, `sessionMessages/`, `sessionControl/`, `tools/`, `providers/`, `auth/`, `rpc.ts`

**`packages/agents/src/`:**
- Purpose: Provider capability metadata, backend target definitions, session mode specs
- Key files: `index.ts`, `providers/`, `backendTargets.ts`, `sessionModes.ts`, `runtimeKinds.ts`

**`packages/tests/`:**
- Purpose: Integration and E2E test suites
- Key subdirectories: `suites/core-e2e/`, `suites/mobile-e2e/`, `suites/providers/`, `src/testkit/`

## Key File Locations

**Entry Points:**
- `apps/cli/src/index.ts`: CLI entry point — platform hardening, arg parse, command dispatch
- `apps/cli/src/cli/dispatch.ts`: Command router — maps subcommands to handlers
- `apps/server/sources/startServer.ts`: Server startup — DB init, API start, workers
- `apps/ui/index.ts`: Mobile app entry point
- `apps/ui/sources/app/_layout.tsx`: Expo Router root layout

**Configuration:**
- `apps/cli/src/configuration.ts`: All CLI runtime configuration (env vars, defaults)
- `apps/server/sources/config/backends.ts`: Server backend selection (DB, files, socket adapter)
- `apps/ui/sources/config.ts`: Mobile app API URL and feature flags
- `vitest.config.ts`: Root Vitest configuration
- `apps/cli/src/test-setup.ts` / `test-setup.unit.ts`: CLI test setup

**Core Logic:**
- `apps/cli/src/backends/catalog.ts`: Provider registry — add new backends here
- `apps/cli/src/backends/types.ts`: `AgentCatalogEntry` interface — extend for new provider hooks
- `apps/cli/src/agent/core/AgentBackend.ts`: `AgentBackend` interface + `AgentMessage` union
- `apps/cli/src/daemon/startDaemon.ts`: Daemon startup orchestration
- `apps/cli/src/api/apiMachine.ts`: Machine WebSocket client (daemon ↔ server)
- `apps/cli/src/api/sessionClient.ts`: Session WebSocket client
- `apps/server/sources/app/api/api.ts`: Fastify server assembly — all routes registered here
- `apps/server/sources/app/events/eventRouter.ts`: Server event fan-out
- `apps/ui/sources/sync/sync.ts`: Mobile sync singleton — owns all real-time state

**Persistence:**
- `apps/cli/src/persistence.ts`: CLI local storage (settings, credentials, daemon state)
- `apps/server/sources/storage/db.ts`: Prisma multi-provider database client
- `apps/server/prisma/schema.prisma`: Database schema (Prisma)
- `apps/ui/sources/sync/domains/state/persistence.ts`: Mobile local persistence

**Testing:**
- `packages/tests/suites/core-e2e/`: Core end-to-end test suites
- `packages/tests/suites/mobile-e2e/`: Mobile E2E test suites
- `packages/tests/src/testkit/`: Shared test helpers (daemon, providers, process, network)

## Naming Conventions

**Files:**
- React components: `PascalCase.tsx` (e.g., `SessionList.tsx`)
- React hooks: `useThing.ts` (e.g., `useSessionMessages.ts`)
- Plain TypeScript modules: `camelCase.ts` (e.g., `apiMachine.ts`, `sessionClient.ts`)
- Test files: `<module>.test.ts` (CLI/UI) or `<module>.spec.ts` (server) — co-located with source
- Integration tests: `<module>.integration.test.ts` or `<module>.integration.spec.ts`
- Allowed `_*.ts` markers inside module-ish dirs: `_types.ts`, `_shared.ts`, `_constants.ts`

**Directories:**
- Bucket (category) directories: lowercase (e.g., `components`, `hooks`, `utils`, `modules`)
- Feature directories: `camelCase` (e.g., `newSession`, `agentInput`, `sessionControl`)
- Avoid `_folders` except `__tests__` and special framework dirs
- Server directories: `lowercase-with-dashes` (server's own CLAUDE.md convention)

**Exports:**
- Named exports preferred throughout the codebase
- `index.ts` barrel files used at package boundaries (`packages/protocol/src/index.ts`, `packages/agents/src/index.ts`)
- Within app packages, prefer direct imports to avoid barrel re-export chains

## Where to Add New Code

**New AI provider backend:**
- Implementation: `apps/cli/src/backends/<providerName>/index.ts` — implement `AgentCatalogEntry`
- Register: Add to `AGENTS` map in `apps/cli/src/backends/catalog.ts`
- Protocol types: Add provider schemas under `packages/protocol/src/providers/<providerName>/`
- Capability metadata: Add to `packages/agents/src/providers/`

**New server API route:**
- Implementation: `apps/server/sources/app/api/routes/<domain>/<domain>Routes.ts`
- Register: Import and call in `apps/server/sources/app/api/api.ts`
- Validation: Define Zod schemas in same directory or `routes/<domain>/schemas/`
- Tests: `apps/server/sources/app/api/routes/<domain>/<route>.spec.ts`

**New mobile screen:**
- Implementation: `apps/ui/sources/app/(app)/<feature>/index.tsx` (Expo Router file = route)
- Layout config: Set screen options in `apps/ui/sources/app/(app)/_layout.tsx`
- State: Add domain slice to `apps/ui/sources/sync/domains/<feature>/`

**New protocol message type:**
- Add Zod schema and TypeScript type to `packages/protocol/src/<domain>/`
- Export from `packages/protocol/src/index.ts`
- Rebuild: `yarn workspace @happier-dev/protocol build`

**New shared CLI utility:**
- Small helper: `apps/cli/src/utils/<subdomain>/<name>.ts`
- Shared CLI package utility: `packages/cli-common/src/<name>.ts`

**New daemon capability (RPC handler):**
- Handler: `apps/cli/src/rpc/handlers/<handlerName>.ts`
- Register in `apps/cli/src/daemon/startDaemon.ts` where RPC handlers are bound

## Special Directories

**`.planning/codebase/`:**
- Purpose: Architecture analysis documents for AI-assisted development
- Generated: No (written by analysis agents)
- Committed: Yes

**`packages/tests/`:**
- Purpose: Standalone E2E test package with its own `package.json`
- Generated: No
- Committed: Yes

**`apps/server/prisma/`:**
- Purpose: Prisma schema, migrations, and per-database engine configs
- Generated: Partial (`generated/` client output is generated; `schema.prisma` and `migrations/` are committed)
- Committed: Yes (schema and migrations only; generated client excluded via `.gitignore`)

**`apps/cli/dist/`:**
- Purpose: Compiled CLI output from pkgroll
- Generated: Yes
- Committed: No

**`apps/ui/src-tauri/`:**
- Purpose: Rust/Tauri configuration for macOS desktop build
- Generated: Partial (config committed; build output excluded)
- Committed: Yes (config files only)

**`skills/`:**
- Purpose: Project-specific Claude skill definitions for AI-assisted development
- Contains: `happier-github-ops/`, `happier-session-control/`, `happier-testing/`
- Committed: Yes

---

*Structure analysis: 2026-04-18*
