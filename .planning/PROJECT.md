# Happier

## What This Is

Happier is an open-source, end-to-end encrypted companion app for AI coding agents. It lets developers run AI sessions (Claude Code, Codex, Gemini, OpenCode, and more) locally on their computer and control them remotely from a mobile app, web UI, or desktop app — without losing context or sacrificing security. This repo is a fork of the upstream `happier-dev/happier`.

## Core Value

A developer can start an AI coding session on their machine and seamlessly continue, monitor, and approve it from any device — phone, browser, or desktop — with all data end-to-end encrypted.

## Requirements

### Validated

*The following features are already implemented and validated in the upstream codebase.*

**Authentication & Security**
- ✓ QR-code based CLI → mobile auth flow — existing
- ✓ NaCl Ed25519 keypair challenge-response auth — existing
- ✓ Auth pairing sessions (multi-device pairing) — existing
- ✓ GitHub OAuth provider (optional) — existing
- ✓ Generic OIDC provider (configurable via JSON) — existing
- ✓ mTLS machine-to-machine auth — existing
- ✓ End-to-end encryption of all session data (libsodium / tweetnacl X25519 box + Ed25519 sign) — existing

**AI Agent Backends (CLI)**
- ✓ Claude Code backend (Anthropic) — PTY + claude-agent-sdk — existing
- ✓ Codex (OpenAI) backend — existing
- ✓ Gemini (Google) backend — existing
- ✓ OpenCode backend — existing
- ✓ Auggie, Kimi, Kilo, Qwen, Pi, Copilot backends — existing
- ✓ ACP (Agent Client Protocol) generic backend for ACP-compliant agents — existing
- ✓ MCP (Model Context Protocol) server/bridge — existing

**CLI Daemon**
- ✓ Background daemon process with start/stop/status — existing
- ✓ Machine registration with relay server — existing
- ✓ Daemon auto-update — existing
- ✓ Local HTTP control server (RPC) at 127.0.0.1 — existing
- ✓ Session runner with per-provider routing — existing
- ✓ Workspace file replication — existing

**Session Management**
- ✓ Create/list/archive/unarchive/delete sessions — existing
- ✓ Real-time E2E-encrypted message streaming — existing
- ✓ Session history and log viewing — existing
- ✓ Mobile permission approval for tool calls — existing
- ✓ Pending message queue while agent is busy — existing
- ✓ Session modes: plan, review, delegate — existing
- ✓ Session actions: execute, describe, list — existing
- ✓ Session handoff between machines — existing
- ✓ Session fork and rollback — existing
- ✓ Session terminal view — existing
- ✓ Session file browser and inline editor — existing
- ✓ Session commit view (git operations) — existing
- ✓ Friend-to-friend session sharing (view/edit/admin levels) — existing
- ✓ Public session share links (optional expiry, use limits, consent gate) — existing

**Machine Management**
- ✓ Machine registration, listing, and presence tracking — existing
- ✓ Machine detail and installables view — existing
- ✓ Machine access revocation — existing

**Voice**
- ✓ ElevenLabs voice agent sessions — existing
- ✓ LiveKit WebRTC voice communication — existing
- ✓ Monthly voice session lease and quota management — existing

**Automations**
- ✓ Create/edit/list/delete automations — existing
- ✓ Cron and interval scheduling with timezone — existing
- ✓ Target: new session or existing session — existing
- ✓ Machine assignment with priority — existing
- ✓ Automation run tracking with event log — existing

**Artifacts & Storage**
- ✓ E2E-encrypted artifact storage (create/edit/view/list) — existing
- ✓ Per-user key-value store (encrypted) — existing
- ✓ File uploads with thumbhash and S3/local backends — existing

**Social Features**
- ✓ Friend relationships (request/accept/reject) — existing
- ✓ Friend search — existing
- ✓ User activity feed — existing
- ✓ Profile management (name, username, avatar) — existing
- ✓ Account identity linking (GitHub/OIDC) — existing

**Connected Services**
- ✓ OAuth token exchange for vendor integrations (v2/v3 APIs) — existing
- ✓ Encrypted service account token storage — existing
- ✓ Service account quota snapshots — existing

**Push Notifications & Activity**
- ✓ Expo push notifications — existing
- ✓ Activity badge tracking (permission and user action counts) — existing

**Relay Server**
- ✓ Fastify 5 API with Zod validation and Socket.IO real-time — existing
- ✓ Light mode (SQLite/PGLite, zero external deps) — existing
- ✓ Full mode (PostgreSQL + Redis + S3) with horizontal scaling — existing
- ✓ Data retention workers — existing
- ✓ Feature flag / policy system — existing
- ✓ Prometheus metrics and Sentry error tracking — existing
- ✓ Tailscale public URL inference — existing

**Mobile App**
- ✓ React Native + Expo SDK 54 with Expo Router file-based navigation — existing
- ✓ Real-time sync engine (Zustand + Socket.IO) with offline queue — existing
- ✓ PostHog product analytics — existing
- ✓ RevenueCat in-app purchases (iOS/Android/web) — existing
- ✓ Sentry mobile error tracking — existing

**Desktop**
- ✓ Tauri macOS/Windows desktop app (wrapping Expo web export) — existing
- ✓ Desktop auto-updater — existing

### Active

*All v1.0 milestone requirements validated. Milestone complete.*

### Recently Validated

**MCP Tool Configuration (v1.0)**
- Allow users to configure which tools the happier MCP bridge exposes via `~/.happier-dev/settings.json` — Validated in Phase 1
- Per-tool enable/disable switches for the MCP surface — Validated in Phase 1
- CLI reads and applies tool filter config at MCP server startup — Validated in Phase 2
- Startup validation feedback: unknown tool names produce warn-level log; valid configs stay noise-free — Validated in Phase 3 (TOOLS-02, VALID-01)

### Out of Scope

- Per-project `.mcp.json` overrides (deferred — user-global settings first)
- Remote/server-side tool configuration
- UI for editing settings (hand-edit only for v1.0)

## Context

- **Fork origin**: Upstream is `happier-dev/happier` (alpha preview stage). This fork tracks upstream and adds custom changes.
- **Monorepo structure**: Yarn workspaces with four main apps (`cli`, `server`, `ui`, `bootstrap`) and shared packages (`protocol`, `agents`, `cli-common`, `connection-supervisor`, `transfers`, `sherpa-native`, `audio-stream-native`).
- **E2E encryption**: Server stores only ciphertext — it cannot read session content. Keys live on-device and are never uploaded in plaintext.
- **Known tech debt**: `AcpBackend.ts` (2,753 lines, 20+ `as any` casts), `startDaemon.ts` (1,878 lines), `rpcHandlers.sessionHandoff.ts` (2,882 lines). `DeferredApiSessionClient` is explicitly incomplete (placeholder pending TDD). 53% of CLI source files have no unit test.
- **Known bugs**: Multiple caffeinate processes can accumulate across daemon + sessions; `daemon.state.json` deleted on shutdown (loses crash context); child PIDs lost on daemon restart.
- **Self-hostable**: Full and light deployment flavors. Light mode requires only Node.js (no Postgres, Redis, or S3).

## Constraints

- **Tech stack**: TypeScript everywhere; React Native/Expo for mobile; Fastify/Prisma for server; Ink for CLI TUI. All E2E encryption via libsodium/tweetnacl only.
- **Security**: Server must never store plaintext session content. Auth must use the existing challenge-response or QR-flow patterns. No new global state or unauthenticated endpoints.
- **Compatibility**: Changes must remain compatible with the upstream mobile app and CLI formats to allow continued upstream merges.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| End-to-end encryption for all session data | Server is a relay, not a data store; zero-knowledge design enables self-hosting with confidence | ✓ Good |
| Socket.IO + Redis Streams for real-time | Enables horizontal server scaling with optional Redis (falls back to in-memory) | ✓ Good |
| ACP as generic agent protocol | Decouples CLI from specific AI SDKs; new providers can be onboarded via ACP without core changes | — Pending |
| Expo SDK for mobile with Tauri desktop | Single React Native codebase targets iOS, Android, web, macOS, and Windows | ✓ Good |
| SQLite/PGLite "light" mode for self-hosting | Eliminates Postgres + Redis requirement for personal/small-team deploys | ✓ Good |
| Yarn workspaces monorepo | All packages share a single lockfile; protocol types stay in sync across cli/server/ui | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
## Current Milestone: v1.0 MCP Tool Configuration

**Goal:** Allow users to configure which tools the happier MCP bridge exposes via a persistent settings JSON file at `~/.happier-dev/settings.json`.

**Target features:**
- Per-tool enable/disable switches for the MCP bridge surface in `~/.happier-dev/settings.json`
- CLI reads and applies tool filter config at MCP server startup
- Settings file format that is easy to hand-edit

---
*Last updated: 2026-04-19 — Phase 3 complete, Milestone v1.0 all phases done*
