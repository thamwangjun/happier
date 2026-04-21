# External Integrations

**Analysis Date:** 2026-04-18

## APIs & External Services

**AI Agents / Coding Assistants:**
- Anthropic Claude (via `@anthropic-ai/claude-agent-sdk` ^0.2.34) - Claude Code agent backend
  - SDK/Client: `apps/cli/src/backends/claude/`
  - Auth: API key from env (CLI-side)
- OpenAI Codex - Codex agent backend (device auth flow)
  - Client: `apps/server/sources/app/api/routes/connect/connectedServicesV2/openaiCodex/`
  - Auth: OAuth device flow via server exchange
- Google Gemini - Agent backend
  - Client: `apps/cli/src/backends/gemini/`
- OpenCode - Agent backend
  - Client: `apps/cli/src/backends/opencode/`
- HuggingFace Transformers (`@huggingface/transformers` ^3.8.1) - Local model inference in CLI
- Vercel AI SDK (`ai` ^5.0.107) - Multi-provider AI integration in CLI

**Voice AI:**
- ElevenLabs - Voice agent minting and session completion
  - SDK/Client: `elevenlabs` ^1.54.0 (server), `@elevenlabs/react` ^0.12.3 and `@elevenlabs/react-native` ^0.5.7 (UI)
  - Auth: `ELEVENLABS_API_KEY`
  - Additional env: `ELEVENLABS_AGENT_ID`, `ELEVENLABS_AGENT_ID_PROD`, `ELEVENLABS_API_BASE_URL`
  - Server routes: `apps/server/sources/app/api/routes/voice/`

**Real-Time Voice Communication:**
- LiveKit - WebRTC voice sessions
  - SDK/Client: `@livekit/react-native` ^2.9.x, `livekit-client` ^2.15.4 (UI)
  - Auth: token-minted server-side
  - Not used server-side (client-only)

**Protocol / Agent Protocol:**
- ACP (Agent Client Protocol) - Session orchestration between CLI and server
  - SDK/Client: `@agentclientprotocol/sdk` ^0.14.1 (`apps/cli`)
  - Auth: server-issued bearer tokens
- MCP (Model Context Protocol) - Tool capability bridge for agents
  - SDK/Client: `@modelcontextprotocol/sdk` ^1.25.3 (`apps/cli`)
  - Integration: `apps/cli/src/agent/acp/`, `apps/cli/src/mcp/`

**Version Control / GitHub:**
- GitHub OAuth - Authentication provider
  - Client: `octokit` ^5.0.3 (server)
  - Auth env: `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_REDIRECT_URL` or `GITHUB_REDIRECT_URI`, `GITHUB_WEBHOOK_SECRET`
  - Server files: `apps/server/sources/app/auth/providers/github/`
  - Webhook receiver: `apps/server/sources/app/auth/providers/github/webhooks.ts`

**OIDC Providers (Generic):**
- Generic OIDC - Configurable enterprise/self-hosted identity providers
  - Client: `openid-client` ^6.0.0 (server)
  - Config: `AUTH_PROVIDERS_CONFIG_PATH` (JSON file path)
  - Server files: `apps/server/sources/app/auth/providers/oidc/`

**Push Notifications:**
- Expo Push Notification Service
  - SDK/Client: `expo-server-sdk` ^3.15.0 (server and CLI)
  - Client: `expo-notifications` ~0.32.11 (UI)
  - Server files: `apps/server/sources/app/activity/refreshAccountActivityBadgePushes.ts`

## Data Storage

**Databases:**
- PostgreSQL (production "full" server flavor)
  - Connection: `DATABASE_URL`
  - Client: Prisma ^6.11.1
  - Schema: `apps/server/prisma/schema.prisma`
  - Binary targets: native, debian-openssl-3.0.x, linux-arm64-openssl-3.0.x
- SQLite (embedded "light" server flavor)
  - Connection: `DATABASE_URL` (file URL) or auto-derived from `HAPPIER_SERVER_LIGHT_DATA_DIR`
  - Schema: `apps/server/prisma/sqlite/schema.prisma`
  - Client: Prisma with SQLite adapter
- MySQL (optional extended DB flavor)
  - Schema: `apps/server/prisma/mysql/schema.prisma`
  - Config: `apps/server/scripts/` run scripts
- PGLite (in-process Postgres, test/embedded use)
  - Client: `@electric-sql/pglite` ^0.3.15 + `@electric-sql/pglite-socket`

**File Storage:**
- S3-compatible object storage (MinIO in dev, S3-compatible in production)
  - Client: `minio` ^8.0.5 (`apps/server`)
  - Auth env: `S3_ACCESS_KEY`, `S3_SECRET_KEY`
  - Config env: `S3_HOST`, `S3_PORT`, `S3_USE_SSL`, `S3_BUCKET`, `S3_PUBLIC_URL`, `S3_REGION`
  - Backend toggle: `HAPPIER_FILES_BACKEND=s3` (default for full flavor)
  - Implementation: `apps/server/sources/storage/blob/files.ts`
- Local disk ("light" server flavor)
  - Config: `HAPPIER_FILES_BACKEND=local` or auto for light flavor
  - Data dir: `HAPPIER_SERVER_LIGHT_DATA_DIR`

**Caching / Pub-Sub:**
- Redis
  - Client: `ioredis` ^5.6.1 (server)
  - Connection: `REDIS_URL`
  - Used for: Socket.io fanout adapter (`@socket.io/redis-streams-adapter`), event bus, distributed locks
  - Toggle: `HAPPIER_SOCKET_ADAPTER=redis-streams` or `HAPPIER_SOCKET_REDIS_ADAPTER=true`
  - Optional — falls back to in-memory if `REDIS_URL` not set
  - Implementation: `apps/server/sources/storage/redis/redis.ts`

## Authentication & Identity

**Auth Provider:**
- Custom QR-code based auth (primary)
  - Implementation: challenge-response over camera QR scan (`apps/ui/sources/auth/`)
  - Tokens: NaCl Ed25519 signed, server-issued opaque bearer tokens
  - Server: `apps/server/sources/app/auth/auth.ts`, `apps/server/sources/app/api/utils/enableAuthentication.ts`
  - Cryptography: `tweetnacl` (NaCl box + sign) on both server and CLI
- GitHub OAuth (optional, configurable)
  - Client: Octokit + `openid-client` for token exchange
  - Server: `apps/server/sources/app/auth/providers/github/`
- Generic OIDC (optional, configurable via JSON config file)
  - Server: `apps/server/sources/app/auth/providers/oidc/`
- mTLS (optional, for machine-to-machine auth)
  - Server: `apps/server/sources/app/api/routes/auth/authRoutes.mtls.*`

**Encryption:**
- NaCl (libsodium / tweetnacl) - End-to-end encryption of session data
  - UI: `@more-tech/react-native-libsodium` ^1.5.5, `libsodium-wrappers` 0.8.2
  - Server/CLI: `tweetnacl` ^1.0.3
  - Scheme: X25519 box for DEKs, Ed25519 sign for key binding

## Monitoring & Observability

**Error Tracking:**
- Sentry (server)
  - Client: `@sentry/node` 10.39.0, `@sentry/profiling-node` ^10.39.0
  - Init: `apps/server/sources/app/monitoring/sentry.ts`
- Sentry (UI)
  - Client: `@sentry/react-native` ^8.1.0
  - Config env: `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_SENTRY_ENABLE_LOGS`, `EXPO_PUBLIC_SENTRY_ENABLE_REPLAY`, `EXPO_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE`, `EXPO_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE`
- Sentry CLI
  - Client: `@sentry/cli` ^3.2.2 (devDependency, root)

**Product Analytics:**
- PostHog (UI)
  - Client: `posthog-react-native` ^4.16.2
  - Config env: `EXPO_PUBLIC_POSTHOG_KEY` or `EXPO_PUBLIC_POSTHOG_API_KEY`, `EXPO_PUBLIC_POSTHOG_HOST`
  - Config: `apps/ui/sources/sync/runtime/appConfig.ts`

**Metrics:**
- Prometheus (server)
  - Client: `prom-client` ^15.1.3
  - Implementation: `apps/server/sources/app/monitoring/metrics2.ts`
  - Metrics: Counters, Gauges, Histograms for sessions, DB, API

**Logging:**
- Server: `pino` ^9.9.0 (structured JSON) + `pino-pretty` for dev
- CLI: File-based logs to `.logs/` directory (timestamped: `MM-DD-HH-MM-SS.log`)
- Combined logs endpoint for mobile/CLI: `/logs-combined-from-cli-and-mobile-for-simple-ai-debugging` (dev only)

## In-App Purchases / Billing

**RevenueCat:**
- Native iOS/Android: `react-native-purchases` ^9.4.2, `react-native-purchases-ui` ^9.4.2 (UI)
- Web: `@revenuecat/purchases-js` ^1.11.1 (UI)
- Auth: Platform-specific API keys (`revenueCatAppleKey`, `revenueCatGoogleKey`, `revenueCatStripeKey` from server-provided config)
- Domain: `apps/ui/sources/sync/domains/purchases/`
- Engine: `apps/ui/sources/sync/engine/purchases/syncPurchases.ts`

## CI/CD & Deployment

**Hosting:**
- Self-hosted (Docker, multi-stage `Dockerfile`)
- Expo Application Services (EAS) for mobile builds and OTA updates
- Port 3000 (server)

**CI Pipeline:**
- Dagger (`dagger/`) - CI pipeline orchestration
- GitHub Actions (referenced in scripts)
- EAS workflows (`apps/ui/eas.json`)

**OTA Updates:**
- Expo Updates (`expo-updates` ~29.0.11)
- Config env: `EXPO_UPDATES_URL`, `EXPO_APP_OWNER`, `EXPO_APP_SLUG`, `EAS_PROJECT_ID`, `EXPO_PUBLIC_EAS_PROJECT_ID`

**Tauri Desktop Updates:**
- `tauri-plugin-updater` 2.9 (macOS/Windows builds)
- Configured in `apps/ui/src-tauri/Cargo.toml`

## Networking

**VPN / Mesh:**
- Tailscale (optional) - Used for private networking and public URL inference
  - Implementation: `apps/server/sources/app/integrations/tailscale/tailscaleServePublicUrlInference.ts`
  - CLI: `yarn tailscale:*` commands in root `package.json`

**HTTP Proxy:**
- `http-proxy` ^1.18.1 + `http-proxy-middleware` ^3.0.5 + `https-proxy-agent` ^7.0.6 (CLI)
- Used for routing agent traffic through daemon

## Webhooks & Callbacks

**Incoming:**
- GitHub webhook receiver: `apps/server/sources/app/auth/providers/github/webhooks.ts`
  - Secret: `GITHUB_WEBHOOK_SECRET`
- ElevenLabs voice session callbacks: `POST /v1/voice/session/complete` (`apps/server/sources/app/api/routes/voice/registerVoiceSessionCompleteRoute.ts`)
- OAuth callbacks: `apps/server/sources/app/api/routes/connect/oauthExternal/registerOAuthCallbackRoute.ts`

**Outgoing:**
- GitHub API via Octokit (`apps/server/sources/app/auth/providers/github/`)
- ElevenLabs REST API for conversation metadata (`https://api.elevenlabs.io/v1/convai/conversations/`)
- Expo push notification delivery (`expo-server-sdk`)

## Environment Configuration

**Server required env vars:**
- `DATABASE_URL` - Database connection string
- `REDIS_URL` - Redis connection (optional, enables pub/sub fanout)
- `S3_HOST`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`, `S3_PUBLIC_URL` - Object storage (full flavor)
- `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` - Voice AI
- `GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET` - GitHub auth (optional)
- `AUTH_PROVIDERS_CONFIG_PATH` - OIDC provider JSON config file path (optional)
- `HAPPIER_PUBLIC_SERVER_URL` - Canonical public server URL for QR/deep links
- `HAPPIER_FILES_BACKEND` - `s3` or `local`
- `HAPPIER_SOCKET_ADAPTER` - `redis-streams` or `memory`

**UI required env vars (EXPO_PUBLIC_ prefix for client-side):**
- `EXPO_PUBLIC_SENTRY_DSN` - Sentry error tracking
- `EXPO_PUBLIC_POSTHOG_KEY` - PostHog analytics
- `EXPO_PUBLIC_POSTHOG_HOST` - PostHog host
- `EXPO_PUBLIC_HAPPIER_FEATURE_POLICY_ENV` - Feature gating
- `EAS_PROJECT_ID` / `EXPO_PUBLIC_EAS_PROJECT_ID` - EAS project identifier
- `EXPO_UPDATES_URL` - OTA update endpoint

**Secrets location:**
- `.env.dev` files per workspace (not committed, gitignored)
- `.env.example` / `.envrc.example` for reference templates

---

*Integration audit: 2026-04-18*
