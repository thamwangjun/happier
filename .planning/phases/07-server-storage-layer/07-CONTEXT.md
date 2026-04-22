# Phase 7: Server Storage Layer - Context

**Gathered:** 2026-04-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement the relay-side unacked message buffer: store, cap (500 entries), expire (2 min TTL), discard (on ack), and signal overflow for unacked outbound messages — all verifiable by unit tests before any socket handler touches them.

</domain>

<decisions>
## Implementation Decisions

### Module Placement
- **D-01:** `UnackedMessageBuffer` module lives in `sources/app/resilience/` — application module alongside `retention/`. The buffer owns business rules (cap enforcement, CLI exclusion check, overflow signal) that do not belong in the pure-storage layer (`sources/storage/` modules contain zero business logic). Mirrors the existing `retention/` placement precedent.

### Retention Sweep Integration (STORE-06)
- **D-02:** Add a new `createUnackedMessageRetentionRule()` to `retentionRuleRegistry.ts`. The rule calls `getRelayBufferTtlMsFromEnv()` directly (same function used by the buffer write path) to compute `cutoff = now - RELAY_BUFFER_TTL_MS`. No changes to `RetentionPolicy` type — the buffer TTL is a deployment-level env var, not a per-account policy field.

### connectionKey Definition (STORE-07)
- **D-03:** The `connectionKey` column in `UnackedMessage` holds the Socket.IO room name prefix: `user-scoped:${userId}`. This aligns directly with the emit routing in `connectionEventRouter.ts`. CLI exclusion is implicit — machine-scoped and session-scoped rooms are never written to the buffer, so only `user-scoped:*` entries appear (satisfying STORE-07 success criterion #6 from ROADMAP.md).

### UnackedMessage Schema Fields
- **D-04:** `UnackedMessage` uses `createdAt` only — no `expiresAt` column. The retention rule computes `cutoff = now - RELAY_BUFFER_TTL_MS` from `createdAt` at sweep time. This matches every existing functional-data retention rule in the codebase (sessions, accountChanges, userFeedItems all use the same pattern) and keeps the schema free of pre-computed TTLs. A composite index on `(userId, seq)` supports replay queries; an index on `createdAt` supports the TTL sweep.

### Claude's Discretion
- Cap enforcement atomicity — whether to trim-on-write (DELETE oldest within the same transaction as INSERT) or count-check-then-delete (two queries). Claude decides based on SQLite and PostgreSQL compatibility.
- `ClientAckState` model fields and indexes — userId, ackedSeq, updatedAt are implied by requirements; exact Prisma field naming is Claude's call.
- Whether to use `inTx` for the buffer write + trim operation — follow the existing transactional pattern from `inTx.ts`.
- TDD plan structure — RED/GREEN cycles for STORE-01 through STORE-07, following the Phase 6 precedent.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Server Storage Layer — STORE-01 through STORE-07 (authoritative requirement IDs for this phase)

### Roadmap
- `.planning/ROADMAP.md` §Phase 7 — success criteria (6 criteria covering unit tests for write, cap, TTL, ack discard, overflow signal, and CLI exclusion)

### Protocol (from Phase 6)
- `packages/protocol/src/socketResilience.ts` — `SOCKET_RESILIENCE_EVENTS` const, `ReconnectResumeRequestSchema`, `AckUpdateRequestSchema`, `ACK_DEBOUNCE_MS` — the types and constants this phase depends on
- `apps/server/sources/app/config/backends.ts` — `getRelayBufferCapFromEnv()` (default 500) and `getRelayBufferTtlMsFromEnv()` (default 120,000ms) — used by the buffer cap enforcement and the retention rule

### Existing Server Files to Follow as Patterns
- `apps/server/sources/app/retention/rules/createDeleteManyRetentionRule.ts` — factory pattern for new retention rules
- `apps/server/sources/app/retention/runtime/retentionRuleRegistry.ts` — where new rule is registered
- `apps/server/sources/app/events/connectionEventRouter.ts` — emit path where buffer write will be wired in Phase 8; `connectionType` discriminator and room name convention live here
- `apps/server/sources/app/events/eventPayloadTypes.ts` — `ClientConnection` union type, `UpdatePayload` type (payload stored in `UnackedMessage`)
- `apps/server/sources/storage/sequence/seq.ts` — pure storage function pattern (functional, no classes)
- `apps/server/sources/storage/inTx.ts` — transaction wrapper to use for atomic buffer write + trim

### Prisma Schema
- `apps/server/prisma/schema.prisma` — main schema (PostgreSQL/PGLite dialect) where `UnackedMessage` and `ClientAckState` models are added
- `apps/server/prisma/sqlite/schema.prisma` — SQLite dialect schema (must also receive the new models)

### Codebase Conventions
- `.planning/codebase/CONVENTIONS.md` — naming conventions
- `apps/server/CLAUDE.md` — server-specific conventions (4-space indent, functional style, `@/` imports, never create migrations)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/server/sources/app/retention/rules/createDeleteManyRetentionRule.ts`: Factory function that wraps a DELETE WHERE cutoffField < cutoff query — likely reusable for `createUnackedMessageRetentionRule`.
- `apps/server/sources/storage/inTx.ts`: Transaction wrapper for atomic multi-step DB operations (buffer write + trim to cap should run in one transaction).
- `apps/server/sources/app/events/eventPayloadTypes.ts`: `UpdatePayload` type (id, seq, body, createdAt) — this is the shape stored as payload JSON in `UnackedMessage`.
- `getRelayBufferCapFromEnv()` and `getRelayBufferTtlMsFromEnv()` from Phase 6 server config — already implemented, just import.

### Established Patterns
- Functional modules (no classes) with named exports — all of `sources/app/retention/rules/*.ts` follow this.
- Test files co-located with source: `unackedBuffer.spec.ts` alongside `unackedBuffer.ts`.
- `sources/app/` modules use `@/` absolute imports throughout.
- Retention rules: `createXxxRetentionRule()` returns `{ id: string; run: (...) => Promise<RetentionRuleResult> }`.
- Two-model design decided in STATE.md: `UnackedMessage` (buffer entries) + `ClientAckState` (ack cursor).

### Integration Points
- Phase 8 (`sources/app/api/socket/`) will import the buffer write function and call it on `emitUpdate()`.
- `retentionRuleRegistry.ts` receives the new rule at startup — the buffer's sweep is handled by the existing retention worker without additional scheduling.
- `connectionEventRouter.ts` room names (`user-scoped:${userId}`) become the `connectionKey` column values in `UnackedMessage`.

</code_context>

<specifics>
## Specific Ideas

- `connectionKey = 'user-scoped:${userId}'` is the exact value format — derived from the Socket.IO room name. This directly links the buffer to the emit path's routing logic.
- The retention rule must call `getRelayBufferTtlMsFromEnv()` (not hardcode 120000) — the requirement specifies the same env-var-backed constant controls both the buffer TTL and the sweep cutoff.
- `UnackedMessage` composite index on `(userId, seq)` enables the replay query (fetch entries where userId = ? AND seq > lastAckedSeq ORDER BY seq ASC). A separate index on `createdAt` enables the TTL sweep.
- STORE-07 success criterion from ROADMAP.md: "A developer inspecting the buffer confirms that entries keyed to CLI session sockets or CLI user sockets are never written — only mobile/web connectionKey types appear in the table." The room-name-prefix approach satisfies this by construction.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 07-server-storage-layer*
*Context gathered: 2026-04-22*
