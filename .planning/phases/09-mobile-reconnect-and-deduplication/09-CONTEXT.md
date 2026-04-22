# Phase 9: Mobile Reconnect and Deduplication - Context

**Gathered:** 2026-04-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the mobile/web client side of the reconnect-resume resilience loop: emit `reconnect-resume` with `lastAckedSeq` on reconnect, deduplicate replayed messages before they reach the Zustand store, persist the ack cursor to MMKV, flush pending acks on background, force-reconnect on foreground, gate outbound server commits during replay, and handle `buffer-overflow` and non-contiguous buffer detection proactively. Server-side socket handlers (Phase 8) and E2E validation (Phase 10) are out of scope.

</domain>

<decisions>
## Implementation Decisions

### File structure
- **D-01:** New `apps/ui/sources/sync/engine/resilience/` module — mirrors the server's `apps/server/sources/app/resilience/` pattern. Contains the dedup filter, ack cursor management, and replay gate helpers. Keeps `sync.ts` clean; `sync.ts` calls into this module. Registered/wired in `sync.ts` and `apiSocket.ts`.

### Replay gate mechanism
- **D-02:** Boolean flag on the `Sync` class — `isReplaying: boolean`. Set to `true` when `reconnect-resume` is emitted, cleared to `false` when `replay-complete` is received. `pendingQueueV2` checks this flag before flushing server commits. Optimistic store updates are NOT gated and continue to apply immediately — only the outbound server commit flush is held.

### Ack cursor persistence
- **D-03:** Extend `apps/ui/sources/sync/domains/state/persistence.ts` with `loadLastAckedSeq(accountId)` and `saveLastAckedSeq(accountId, seq)` — per-account key (not per-session), since the ack cursor is per-connection. Follows the exact same `getPersistenceStorage()` MMKV pattern as `loadSessionMaterializedMaxSeqById` / `saveSessionMaterializedMaxSeqById`.

### Test plan split
- **D-04:** Three-plan TDD split:
  - **Plan A (RED):** Write all failing tests for MOB-01 through MOB-10 in `engine/resilience/*.spec.ts` (unit tests for dedup filter, ack cursor, replay gate) and integration-level tests for the wired reconnect flow.
  - **Plan B (GREEN core):** Implement `engine/resilience/` module — dedup filter, ack emit + debounce, replay gate, `resumeViaChanges` deduplication guard — to pass MOB-01 through MOB-10 unit/module tests.
  - **Plan C (GREEN integration):** Wire into `apiSocket.ts` (socket event listeners, reconnect-resume emit), `sync.ts` (isReplaying flag, AppState background flush, foreground reconnect), and `persistence.ts` (lastAckedSeq load/save) to pass all integration tests.

### Claude's Discretion
- Exact MMKV key string for `lastAckedSeq` (e.g., `'resilience-last-acked-seq'`) — follow existing key naming in `persistence.ts`.
- Whether the dedup filter is a `Set<number>` or a `seq <= lastAckedSeq` comparison — Claude decides based on what satisfies both socket replay and HTTP catch-up paths (MOB-02).
- How `runWithInFlightDedupe` (already in codebase at `apps/ui/sources/sync/runtime/orchestration/runWithInFlightDedupe.ts`) is used to enforce the MOB-10 single-in-flight constraint.
- Whether `ack-update` debounce timer lives in `engine/resilience/` or is managed by `sync.ts` — follow the `scheduleChangesCursorFlush` pattern for consistency.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §Mobile/Web Reconnect and Deduplication — MOB-01 through MOB-10 (authoritative requirement IDs for this phase)

### Roadmap
- `.planning/ROADMAP.md` §Phase 9 — success criteria (9 criteria covering reconnect-resume emit, dedup, MMKV persistence, background ack flush, foreground reconnect, replay gate, buffer-overflow fallback, retentionStart proactive trigger, single-in-flight resumeViaChanges)

### Protocol (from Phase 6)
- `packages/protocol/src/socketResilience.ts` — `SOCKET_RESILIENCE_EVENTS` const (`reconnect-resume`, `ack-update`, `replay-complete`, `buffer-overflow`), `ReconnectResumeRequestSchema`, `AckUpdateRequestSchema`, `ACK_DEBOUNCE_MS=500`

### Phase 8 output (server side — read to understand what client receives)
- `apps/server/sources/app/api/socket/resilienceHandler.ts` — server handler for `reconnect-resume` and `ack-update`; emits `buffer-overflow`, `retentionStart`, replayed messages, `replay-complete`
- `apps/server/sources/app/resilience/unackedBuffer.ts` — buffer contract (seq, payload shape)

### Existing mobile files to extend
- `apps/ui/sources/sync/sync.ts` — `onReconnected()` hook (line ~3305), `resumeViaChanges`, `AppState` background handler (line ~386), `isReplaying` flag to add
- `apps/ui/sources/sync/api/session/apiSocket.ts` — socket event wiring; add `reconnect-resume` emit and `replay-complete` / `buffer-overflow` listeners
- `apps/ui/sources/sync/domains/state/persistence.ts` — add `loadLastAckedSeq` / `saveLastAckedSeq` per-account helpers
- `apps/ui/sources/sync/engine/pending/pendingQueueV2.ts` — outbound queue; add isReplaying gate check

### Existing orchestration utilities to reuse
- `apps/ui/sources/sync/runtime/orchestration/runWithInFlightDedupe.ts` — single-in-flight guard for MOB-10
- `apps/ui/sources/sync/api/session/apiSocket.reconnectSemantics.test.ts` — test pattern for socket reconnect scenarios

### Mobile conventions
- `apps/ui/CLAUDE.md` — UI app conventions (if present)
- `.planning/codebase/CONVENTIONS.md` — monorepo naming and export conventions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apiSocket.onReconnected(listener)`: Hook already fires on every socket reconnect (line ~3305 of sync.ts calls `resumeSync`). Extend to also emit `reconnect-resume` with `lastAckedSeq`.
- `getPersistenceStorage()` in `persistence.ts`: Returns the scoped MMKV instance. Call directly in new `loadLastAckedSeq` / `saveLastAckedSeq` functions.
- `runWithInFlightDedupe` at `apps/ui/sources/sync/runtime/orchestration/runWithInFlightDedupe.ts`: Enforces exactly one async call in-flight — use for MOB-10 `resumeViaChanges` dedup.
- `AppState.addEventListener('change', ...)` already wired in sync.ts (~line 386): Background transition handler exists; add the synchronous ack flush here.
- `loadSessionMaterializedMaxSeqById` / `saveSessionMaterializedMaxSeqById` in `persistence.ts`: Direct template for the new `lastAckedSeq` persistence functions.
- `scheduleChangesCursorFlush` / `flushChangesCursorNow` pattern in sync.ts: Template for debounced ack flush with synchronous emergency flush.

### Established Patterns
- Engine modules in `sync/engine/*/`: Isolated logic files called by sync.ts. New `engine/resilience/` follows this exactly.
- MMKV keys: lowercase kebab-case strings (e.g., `'session-drafts'`, `'pending-settings'`, `'changes-cursor'`).
- Fire-and-forget in TS: `fireAndForget(promise, { tag: '...' })` — use for socket event emissions where we don't await.
- Debounce pattern: `setTimeout` + timer ref stored on class, cleared/reset on each call — same as `scheduleChangesCursorFlush`.

### Integration Points
- `apiSocket.onReconnected()` → emit `socket.emit(SOCKET_RESILIENCE_EVENTS.RECONNECT_RESUME, { sessionId, lastAckedSeq })` (MOB-01)
- Inbound message apply path in sync.ts → dedup filter from `engine/resilience/` before writing to Zustand store (MOB-02)
- `materializedMaxSeq` coalescer in sync.ts → debounced `socket.emit(SOCKET_RESILIENCE_EVENTS.ACK_UPDATE, { sessionId, seq })` after apply (MOB-03)
- `AppState` background handler → synchronous `saveLastAckedSeq` + flush pending ack-update (MOB-05)
- `AppState` foreground handler already calls `resumeSync('app-foreground')` → ensure socket.disconnect() + reconnect() regardless of `socket.connected` state (MOB-06)
- `pendingQueueV2` flush path → check `isReplaying` flag before sending server commits (MOB-07)
- `replay-complete` socket listener → clear `isReplaying`, drain pending queue (MOB-07)
- `buffer-overflow` socket listener → immediately call `resumeViaChanges`, skip socket replay path (MOB-08)
- `retentionStart` from server response → compare with `lastAckedSeq + 1`; if gap, call `resumeViaChanges` proactively (MOB-09)

</code_context>

<specifics>
## Specific Ideas

- `replay-complete` from the server is the universal gate-release signal in all three server paths (after replay, after buffer-overflow, when buffer empty) — the client must treat it uniformly, releasing `isReplaying` regardless of which path was taken (from Phase 8 specifics).
- `retentionStart` arrives before any replay messages — the proactive gap check (MOB-09) must happen before applying any replayed messages, not after.
- The `isReplaying` flag gates server commits only, not optimistic store updates — Zustand optimistic updates continue immediately so the UI does not freeze during replay.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 09-mobile-reconnect-and-deduplication*
*Context gathered: 2026-04-22*
