# Phase 9: Mobile Reconnect and Deduplication - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-22
**Phase:** 09-mobile-reconnect-and-deduplication
**Areas discussed:** File structure, Replay gate mechanism, Ack cursor persistence, Test plan split

---

## File structure

| Option | Description | Selected |
|--------|-------------|----------|
| New engine/resilience/ module | Mirror server pattern: apps/ui/sources/sync/engine/resilience/ with reconnect/ack/dedup helpers. Keeps sync.ts clean. | ✓ |
| Extend apiSocket.ts + sync.ts | Add reconnect-resume emit and ack-update emit to apiSocket.ts; dedup + gate logic inline in sync.ts. Follows existing coupling. | |
| Single new file syncResilience.ts | One flat file next to sync.ts. Middle ground — no new folder, still isolated. | |

**User's choice:** New engine/resilience/ module
**Notes:** sync.ts is already ~44k tokens. Mirrors the server's apps/server/sources/app/resilience/ pattern exactly.

---

## Replay gate mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Boolean flag on Sync class | isReplaying = true from reconnect-resume emit until replay-complete fires. pendingQueueV2 checks flag before flushing server commits. | ✓ |
| Reuse existing PauseController | PauseController already gates fetch/messages path. Extend to pause outbound queue flush during replay. | |
| Drainable replay queue | Buffer pending commits locally during replay; drain in order after replay-complete. | |

**User's choice:** Boolean flag on Sync class
**Notes:** Simple, explicit, easy to test. Optimistic store updates are NOT gated — only outbound server commit flush is held.

---

## Ack cursor persistence

| Option | Description | Selected |
|--------|-------------|----------|
| Extend persistence.ts alongside materializedMaxSeq | Add loadLastAckedSeq / saveLastAckedSeq to existing persistence.ts. Per-account key. | ✓ |
| Per-session key alongside materializedMaxSeq | Store per-session lastAckedSeq next to saveSessionMaterializedMaxSeqById. | |
| Separate persistence module in engine/resilience/ | New resilience-specific MMKV helpers inside the new module. | |

**User's choice:** Extend persistence.ts alongside materializedMaxSeq
**Notes:** Per-account key (not per-session) since ack cursor is per-connection. Follows established getPersistenceStorage() pattern exactly.

---

## Test plan split

| Option | Description | Selected |
|--------|-------------|----------|
| RED/GREEN two-plan split (like Phase 8) | Plan A: all failing tests. Plan B: implement + wire. | |
| Single plan (tests + implementation together) | One plan covering all requirements inline. | |
| Three plans: RED, GREEN core, GREEN integration | Plan A: RED. Plan B: engine/resilience/ module. Plan C: wire into apiSocket.ts + sync.ts + persistence.ts. | ✓ |

**User's choice:** Three plans: RED, GREEN core, GREEN integration
**Notes:** More granular than Phase 8's two-plan split. Isolates the module implementation from the wiring step.

---

## Claude's Discretion

- Exact MMKV key string for lastAckedSeq
- Whether dedup filter uses Set<number> or seq <= lastAckedSeq comparison
- How runWithInFlightDedupe is applied for MOB-10 single-in-flight constraint
- Whether ack-update debounce timer lives in engine/resilience/ or sync.ts

## Deferred Ideas

None — discussion stayed within phase scope.
