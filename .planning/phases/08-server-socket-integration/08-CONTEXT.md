# Phase 8: Server Socket Integration - Context

**Gathered:** 2026-04-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the relay-side socket handlers for `reconnect-resume` and `ack-update` events into the live Socket.IO connection, and integrate the buffer write into `emitUpdate()` as a fire-and-forget side-effect. Prove correctness with integration tests in both SQLite and Postgres/Redis modes. The mobile client reconnect logic (Phase 9) and E2E validation (Phase 10) are out of scope.

</domain>

<decisions>
## Implementation Decisions

### Handler file placement
- **D-01:** New `sources/app/api/socket/resilienceHandler.ts` — mirrors the existing pattern of `sessionUpdateHandler.ts`, `rpcHandler.ts`, `machineUpdateHandler.ts`. Keeps `socket.ts` clean and resilience logic isolated for standalone testing. Registered in `socket.ts` alongside the other handler registrations.

### Integration test Redis strategy (SRVR-05)
- **D-02:** Conditional skip when Redis is unavailable — follow the existing `socket.redisAdapter.integration.spec.ts` pattern. The Redis integration test skips cleanly in CI environments without Redis and runs when Redis is available. No new infra requirements introduced.

### TDD plan split
- **D-03:** RED/GREEN two-plan split — Plan A writes all failing integration tests (SRVR-01 through SRVR-10 coverage) first. Plan B implements `resilienceHandler.ts` and the `emitUpdate()` buffer wiring to make them green. Follows the same TDD discipline as Phase 6 and Phase 7.

### emitUpdate() buffer wiring (from prior decisions)
- **D-04:** `writeToBuffer` is called inside `connectionEventRouter.ts`'s `emitUpdate()` as a fire-and-forget side-effect — `Promise.resolve(writeToBuffer(...)).catch(...)` pattern, never `await`ed on the critical emit path. Failures are logged as warnings only. (Locked from STATE.md SRVR-01 constraint.)

### connectionKey derivation
- **D-05:** `connectionKey = 'user-scoped:${userId}'` — derived from the Socket.IO room prefix already established in Phase 7. The `reconnect-resume` handler extracts `userId` from the authenticated socket and forms the key; `writeToBuffer`'s own guard (`connectionKey.startsWith('user-scoped:')`) enforces CLI exclusion at write time.

### Claude's Discretion
- Whether SRVR-10's `retentionStart` query uses `MIN(seq)` via a separate DB query or is derived from the first result of `readBuffer` — Claude decides based on query efficiency.
- Whether `resilienceHandler.ts` exports a single function or separate named exports for each event — follow the existing handler file pattern.
- How SRVR-07 regression guard is structured in the test file — whether it's a `describe` block importing the test directly or a snapshot assertion.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Server Socket Integration — SRVR-01 through SRVR-10 (authoritative requirement IDs for this phase)

### Roadmap
- `.planning/ROADMAP.md` §Phase 8 — success criteria (8 criteria covering fire-and-forget emit, replay order, ack idempotency, replay-complete in all 3 paths, retentionStart, and SRVR-07 regression gate)

### Phase 7 output (buffer functions to wire in)
- `apps/server/sources/app/resilience/unackedBuffer.ts` — `writeToBuffer`, `readBuffer`, `ackBuffer` — the three functions this phase wires into socket handlers
- `apps/server/sources/app/resilience/unackedBuffer.spec.ts` — unit tests for reference on buffer behavior contracts

### Protocol (from Phase 6)
- `packages/protocol/src/socketResilience.ts` — `SOCKET_RESILIENCE_EVENTS` const (`reconnect-resume`, `ack-update`, `replay-complete`, `buffer-overflow`), `ReconnectResumeRequestSchema`, `AckUpdateRequestSchema`, `ACK_DEBOUNCE_MS`

### Existing server files to modify
- `apps/server/sources/app/events/connectionEventRouter.ts` — `emitUpdate()` where SRVR-01 buffer write is wired as fire-and-forget
- `apps/server/sources/app/api/socket.ts` — where `resilienceHandler` is registered alongside other handlers in `io.on("connection")`

### Existing test infrastructure to follow
- `apps/server/sources/app/api/testkit/socketHarness.ts` — fake socket and handler test utilities
- `apps/server/sources/app/api/socket/rpcHandler.integration.spec.ts` — integration test pattern (vitest, module mocks, fake socket)
- `apps/server/sources/app/api/socket.redisAdapter.integration.spec.ts` — Redis conditional-skip integration test pattern

### CLI regression gate (SRVR-07)
- `apps/cli/src/api/session/sessionClient.startupCatchUpRetry.test.ts` — must pass unchanged; verifies startup catch-up cursor is not mutated by the resilience layer

### Server conventions
- `apps/server/CLAUDE.md` — server-specific conventions (4-space indent, functional style, `@/` imports, never create migrations)
- `.planning/codebase/CONVENTIONS.md` — monorepo naming conventions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/server/sources/app/resilience/unackedBuffer.ts`: `writeToBuffer(userId, connectionKey, payload)`, `readBuffer(userId, connectionKey, afterSeq)`, `ackBuffer(userId, connectionKey, ackedSeq)` — ready to import.
- `apps/server/sources/app/api/testkit/socketHarness.ts`: `createFakeSocket`, `getSocketHandler` — use for unit-level handler tests.
- `apps/server/sources/app/api/socket.redisAdapter.integration.spec.ts`: Redis conditional-skip pattern — copy the guard for SRVR-05 test.

### Established Patterns
- Handler files export a single function `xxxHandler(userId, socket, connection, ...)` registered in `socket.ts`'s `io.on("connection")` block.
- Fire-and-forget in TS: `Promise.resolve(asyncFn(...)).catch((err) => log({ level: 'warn' }, ...))` — never `void asyncFn()` (swallows errors silently).
- Integration tests: `*.integration.spec.ts` suffix, vitest, import real modules with db mocks where needed.
- `connectionEventRouter.ts`'s `emitUpdate()` is a class method on the singleton `eventRouter` — adding the buffer write call is a one-liner after the existing `this.emit(...)` call.

### Integration Points
- `emitUpdate()` in `connectionEventRouter.ts` → fire-and-forget `writeToBuffer('user-scoped:${userId}', payload)` (SRVR-01)
- `socket.on('reconnect-resume', ...)` in `resilienceHandler.ts` → parse `ReconnectResumeRequestSchema`, call `readBuffer`, emit buffered messages, emit `replay-complete` with `retentionStart` (SRVR-02, SRVR-09, SRVR-10)
- `socket.on('ack-update', ...)` in `resilienceHandler.ts` → parse `AckUpdateRequestSchema`, call `ackBuffer` (SRVR-03, SRVR-08)
- `socket.ts` → import and call `resilienceHandler(userId, socket, connection)` in the connection handler

</code_context>

<specifics>
## Specific Ideas

- `replay-complete` must be emitted in all three paths: after the last replayed message, after `buffer-overflow` is signalled, and immediately when the buffer is empty — it is the universal gate-release signal (SRVR-09). No special-casing per path on the client side.
- `retentionStart` (the oldest `seq` still in the buffer) must be sent before any replay messages so the client can detect a non-contiguous buffer and proactively trigger `resumeViaChanges` (SRVR-10).
- SRVR-08 idempotency is already satisfied by `ackBuffer`'s `deleteMany` with `lte` — re-acking an already-discarded seq is a no-op at the DB level.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 08-server-socket-integration*
*Context gathered: 2026-04-22*
