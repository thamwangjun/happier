# Technology Stack

**Analysis Date:** 2026-04-18

## Languages

**Primary:**
- TypeScript 5.9.3 - Used across all packages (server, CLI, UI, protocol, agents)
- Rust (Edition 2021, rust-version 1.94.1) - Desktop app shell via Tauri (`apps/ui/src-tauri/`)

**Secondary:**
- JavaScript (ESM `.mjs`) - Build scripts, tooling, postinstall hooks
- Node.js TypeScript (experimental strip-types) - Test wiring scripts (`scripts/testing/`)

## Runtime

**Environment:**
- Node.js 22 (Dockerfile ARG; relay-server `engines.node >= 22`)
- Node.js 20 declared in `apps/server/CLAUDE.md`

**Package Manager:**
- Yarn 1.22.22 (Classic)
- Lockfile: `yarn.lock` present
- Workspace manager: Yarn workspaces (monorepo)

## Frameworks

**Server:**
- Fastify 5.x (`apps/server`) - HTTP API framework
- fastify-type-provider-zod 6.1.0 - Zod schema integration for Fastify routes
- Socket.io 4.8.x - WebSocket/real-time server

**Mobile/Web UI:**
- React Native 0.81.5 (`apps/ui`)
- Expo SDK 54 - Managed build pipeline, OTA updates, native modules
- Expo Router 6.0.22 - File-based routing
- React 19.1.0

**Desktop:**
- Tauri 2.8.x (`apps/ui/src-tauri/`) - macOS/Windows desktop shell wrapping Expo web export

**CLI:**
- Ink 6.5.x - React-based terminal UI (`apps/cli`)
- Fastify 5.x - Internal daemon HTTP server for RPC

**Testing:**
- Vitest 3.x - Unit and integration tests across all packages
- jest-expo - Jest preset declared (legacy, not primary runner)

**Build/Dev:**
- tsx 4.x - TypeScript runner (dev + scripts)
- tsc - TypeScript type-checking (build step)
- pkgroll 2.x - CLI package bundler
- Dagger - CI/CD pipeline (see `dagger/`)

## Key Dependencies

**Critical:**
- `@happier-dev/protocol` (0.0.0) - Shared message/type definitions used by all packages
- `@happier-dev/agents` (0.0.0) - Agent abstraction layer used by server and UI
- `@happier-dev/cli-common` (0.0.0) - Shared CLI utilities
- `@happier-dev/connection-supervisor` (0.0.0) - Connection lifecycle management
- `@happier-dev/transfers` (0.0.0) - File/data transfer protocol
- Zod 4.3.6 (pinned, nohoisted) - Schema validation; used by all packages for protocol types and API validation

**Infrastructure (Server):**
- `@prisma/client` ^6.11.1 + `prisma` ^6.11.1 - ORM for PostgreSQL/SQLite/MySQL
- `ioredis` ^5.6.1 - Redis client for pub/sub and caching
- `socket.io` ^4.8.1 + `@socket.io/redis-streams-adapter` ^0.2.2 - Real-time with optional Redis adapter
- `minio` ^8.0.5 - S3-compatible object storage client
- `@electric-sql/pglite` ^0.3.15 + `@electric-sql/pglite-socket` - Embedded Postgres for "light" server mode
- `pino` ^9.x + `pino-pretty` - Structured logging
- `prom-client` ^15.1.3 - Prometheus metrics export

**Infrastructure (UI):**
- `zustand` ^5.0.6 - State management
- `socket.io-client` ^4.8.1 - WebSocket client
- `libsodium-wrappers` 0.8.2 + `@more-tech/react-native-libsodium` - End-to-end encryption (NaCl)
- `@livekit/react-native` ^2.9.x - Voice communication
- `@revenuecat/purchases-js` ^1.11.1 + `react-native-purchases` ^9.4.2 - In-app purchases
- `@sentry/react-native` ^8.1.0 - Error tracking
- `posthog-react-native` ^4.16.2 - Product analytics
- `@elevenlabs/react` ^0.12.3 + `@elevenlabs/react-native` ^0.5.7 - Voice AI widget

**Infrastructure (CLI):**
- `@anthropic-ai/claude-agent-sdk` ^0.2.34 - Claude agent integration
- `@agentclientprotocol/sdk` ^0.14.1 - ACP protocol client
- `@modelcontextprotocol/sdk` ^1.25.3 - MCP server/client bridge
- `@huggingface/transformers` ^3.8.1 - Local model inference
- `tweetnacl` ^1.0.3 - Bundled NaCl cryptography
- `node-pty` ^1.1.0 + `@homebridge/node-pty-prebuilt-multiarch` - Terminal PTY
- `ai` ^5.0.107 - Vercel AI SDK

## Configuration

**Environment:**
- Server: `apps/server/.env.dev` (dev), `.env.example` (reference)
- CLI: `apps/cli/.env.dev`, `.env.dev-local-server`, `.env.integration-test`
- UI: `apps/ui/.env.local.example`
- Stack: `apps/stack/.env.example`
- Runtime config via `process.env` with `dotenv` / `dotenv-cli`

**Build:**
- `tsconfig.json` per workspace
- `vitest.config.ts` per workspace; root `vitest.config.ts` for monorepo coordination
- `apps/ui/babel.config.js`, `apps/ui/metro.config.js` - React Native bundler
- `apps/ui/app.config.js` - Expo dynamic config (variant-aware)
- `apps/ui/src-tauri/Cargo.toml` - Rust/Tauri build

**Monorepo tooling:**
- `mise.toml` - Tool version management (yarn = "1")
- Root `package.json` orchestrates workspace builds and test suites
- `apps/stack/` - Local dev orchestration scripts

## Platform Requirements

**Development:**
- Node.js 22, Yarn 1.22.22
- Docker (PostgreSQL via `docker run postgres:17`, Redis, MinIO)
- FFmpeg, Python3 (server runtime)
- Xcode (iOS), Android Studio (Android)
- Rust + cargo (for Tauri desktop builds)

**Production:**
- Docker container (multi-stage Dockerfile, Node.js 22-alpine base)
- Exposes port 3000
- Requires FFmpeg, Python3 in runtime image
- PostgreSQL, Redis, S3-compatible storage (production "full" flavor)
- SQLite or PGLite ("light" embedded flavor, no external DB required)

---

*Stack analysis: 2026-04-18*
