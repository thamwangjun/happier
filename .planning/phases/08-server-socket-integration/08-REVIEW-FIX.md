---
phase: 08-server-socket-integration
fixed_at: 2026-04-22T09:41:39Z
review_path: .planning/phases/08-server-socket-integration/08-REVIEW.md
iteration: 1
fix_scope: all
findings_in_scope: 7
fixed: 6
skipped: 1
status: partial
---

# Phase 08: Code Review Fix Report

**Fixed at:** 2026-04-22T09:41:39Z
**Source review:** .planning/phases/08-server-socket-integration/08-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7
- Fixed: 6
- Skipped: 1

## Fixed Issues

### WR-01: Buffer-overflow path still replays all buffered messages

**Files modified:** `apps/server/sources/app/api/socket/resilienceHandler.ts`
**Commit:** 6610808bf
**Applied fix:** Added explicit INTENTIONAL comment in the overflow branch explaining that replaying all buffered messages after emitting buffer-overflow is deliberate — the client must tolerate receiving update events after buffer-overflow and may discard them if resumeViaChanges is triggered. The existing tests in the spec already assert this behaviour (SRVR-10 test triggers a gap condition and still checks for update events), confirming the contract.

---

### WR-02: `socket.data` accessed via unchecked `as any` casts — `userId` may be undefined at `resilienceHandler` call site

**Files modified:** `apps/server/sources/app/api/socket.ts`
**Commit:** 440fc26aa
**Applied fix:** Added `userId!` non-null assertion at the `resilienceHandler(userId!, socket)` call site on line 324, with a comment noting that userId is already narrowed by the early-return guard on line 189.

---

### WR-03: `emitUpdate` always buffers regardless of `recipientFilter`

**Files modified:** `apps/server/sources/app/events/connectionEventRouter.ts`
**Commit:** 8a8e35659
**Applied fix:** Added `filterIncludesUserScoped` boolean guard before the `writeToBuffer` call. The guard evaluates true only when `recipientFilter` is absent (defaults to all-user-authenticated-connections) or has type `all-user-authenticated-connections`, `all-interested-in-session`, or `user-scoped-only`. Filters of type `machine-scoped-only` or `machine-only` now correctly skip the buffer write. The SRVR-01 test (which calls `emitUpdate` without a recipientFilter) continues to pass as `!params.recipientFilter` covers that case.

---

### IN-01: Replay loop emits `'update'` as a string literal instead of using the protocol constant

**Files modified:** `packages/protocol/src/socketResilience.ts`, `apps/server/sources/app/api/socket/resilienceHandler.ts`
**Commit:** 65301f8fd
**Applied fix:** Added `REPLAY_START: 'replay-start'` and `UPDATE: 'update'` to `SOCKET_RESILIENCE_EVENTS` in the protocol package source. Rebuilt the protocol dist (gitignored, not committed). Replaced both string literals in `resilienceHandler.ts` — `socket.emit('replay-start', ...)` and `socket.emit('update', ...)` — with `SOCKET_RESILIENCE_EVENTS.REPLAY_START` and `SOCKET_RESILIENCE_EVENTS.UPDATE` respectively.

---

### IN-02: `warnedNoIo` state persists across test runs — potential test pollution

**Files modified:** `apps/server/sources/app/events/connectionEventRouter.ts`
**Commit:** 1d873f9fb
**Applied fix:** Added a comment above the `warnedNoIo` field documenting that it is intentionally a persistent flag (one-time warning per process lifetime), that `vi.clearAllMocks()` does not reset it, and that this is acceptable because the fallback path in tests is not load-bearing for warning correctness. Production code is unchanged.

---

### IN-03: `it.todo` test carries a misleading comment — not actually skipped by design

**Files modified:** `apps/server/sources/app/api/socket/resilienceHandler.integration.spec.ts`
**Commit:** edc100563
**Applied fix:** Replaced the `it.todo(...)` call with a plain comment explaining that SRVR-07 is covered in `apps/cli startupCatchUpRetry.test.ts` and that there is no server-side assertion for this behaviour.

---

## Skipped Issues

### IN-04: `connectionEventRouter` alias creates indirection

**File:** `apps/server/sources/app/events/connectionEventRouter.ts:211-214`
**Reason:** Skipped — not clearly safe. The `connectionEventRouter` alias is imported by `resilienceHandler.integration.spec.ts` via `vi.mock("@/app/events/connectionEventRouter", ...)`. Removing the alias export or renaming the file would break the spec's mock boundary and require refactoring the test. The REVIEW.md guidance explicitly says "only apply if clearly safe, skip if risky." The indirection is minor and the alias is well-documented with a comment.
**Original issue:** `connectionEventRouter` is an alias for `eventRouter` (same object). The re-export chain adds unnecessary indirection.

---

_Fixed: 2026-04-22T09:41:39Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
