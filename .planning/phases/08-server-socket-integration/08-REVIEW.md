---
phase: 08-server-socket-integration
reviewed: 2026-04-22T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - apps/server/sources/app/api/socket/resilienceHandler.integration.spec.ts
  - apps/server/sources/app/api/socket/resilienceHandler.ts
  - apps/server/sources/app/events/connectionEventRouter.ts
  - apps/server/sources/app/api/socket.ts
  - packages/protocol/package.json
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 08: Code Review Report

**Reviewed:** 2026-04-22T00:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Phase 08 adds the server-side resilience socket layer: a `resilienceHandler` that replays buffered messages on reconnect and acks them, `connectionEventRouter` as the write path that buffers updates fire-and-forget, and the wiring in `socket.ts`. The logic is sound overall — the replay ordering, gap detection, and ack idempotency are all correct. Three warnings are raised: one is a behavioural inconsistency in the replay path when a gap exists (overflow messages are still replayed, which may or may not be intentional), one is an unvalidated `any` cast for socket data that bypasses TypeScript's type safety in `socket.ts`, and one is a missing null guard for `userId` before `resilienceHandler` is called. Four info items cover event name string literals used directly instead of protocol constants, a `RecipientFilter` default missing the buffer write guard for non-user-scoped callers, the `warnedNoIo` suppression flag that persists across test boundaries, and the `.todo` test that does nothing.

---

## Warnings

### WR-01: Buffer-overflow path still replays all buffered messages

**File:** `apps/server/sources/app/api/socket/resilienceHandler.ts:49-57`
**Issue:** When a gap is detected (`retentionStart > lastAckedSeq + 1`), the handler emits `buffer-overflow` but then continues to replay every row from the buffer via the `for` loop. The protocol comment says the client will "trigger resumeViaChanges" on overflow — if the client is expected to discard replay data after receiving `buffer-overflow`, sending those messages is wasteful at best and confusing at worst. If the client is expected to consume them despite the overflow signal (partial replay), the ordering of `buffer-overflow` before the replayed payloads is correct but the spec should make that explicit.

**Fix:** Decide the contract explicitly and enforce it in code. If overflow means "abort replay", return after emitting `buffer-overflow`:
```typescript
if (hasGap) {
    socket.emit(SOCKET_RESILIENCE_EVENTS.BUFFER_OVERFLOW);
    socket.emit(SOCKET_RESILIENCE_EVENTS.REPLAY_COMPLETE, { retentionStart });
    return;
}
// Only reached on path 1 (contiguous replay)
for (const payload of rows) {
    socket.emit('update', payload);
}
socket.emit(SOCKET_RESILIENCE_EVENTS.REPLAY_COMPLETE, { retentionStart });
```
If the current "emit overflow + replay all anyway" behaviour is intentional, add a comment explicitly saying so and add a test that asserts update events ARE emitted after a gap.

---

### WR-02: `socket.data` accessed via unchecked `as any` casts — `userId` may be undefined at `resilienceHandler` call site

**File:** `apps/server/sources/app/api/socket.ts:181-187`, `323`
**Issue:** `userId` is extracted from `socket.data` with `as string | undefined` on line 181, then checked on line 189 (`if (!userId) { socket.disconnect(); return; }`). However, line 323 passes `userId` to `resilienceHandler(userId, socket)` without a narrowed type; TypeScript may infer `string | undefined` here because the `if (!userId)` guard is a runtime early return, not a type narrowing that TypeScript can propagate across the async gap. If the compiler accepts it now it is only because of the specific control flow — any restructuring could silently break this. The root cause is using `as any` on `socket.data` throughout.

**Fix:** Define a typed interface for `socket.data` and use it instead of `as any`:
```typescript
interface AuthenticatedSocketData {
    userId: string;
    clientType: 'session-scoped' | 'user-scoped' | 'machine-scoped' | undefined;
    clientPurpose: string | undefined;
    sessionId: string | undefined;
    machineId: string | undefined;
    sessionScopedBinding?: unknown;
}
// After the guard on line 189, narrow to string:
const userId = (socket.data as AuthenticatedSocketData).userId; // already guarded above
```
At minimum, assert `userId` is defined at the `resilienceHandler` call site:
```typescript
if (!metadata.clientType || metadata.clientType === 'user-scoped') {
    resilienceHandler(userId!, socket); // userId narrowed by guard on line 189
}
```

---

### WR-03: `emitUpdate` always buffers regardless of `recipientFilter`

**File:** `apps/server/sources/app/events/connectionEventRouter.ts:51-73`
**Issue:** `emitUpdate` unconditionally calls `writeToBuffer(params.userId, 'user-scoped:${params.userId}', params.payload)` even when a caller passes a `recipientFilter` of `user-scoped-only`, `machine-scoped-only`, or `all-interested-in-session`. For filters that exclude user-scoped connections (e.g., `machine-only`), buffering is semantically incorrect — a user-scoped reconnect would receive messages not intended for it. The existing comment mentions `writeToBuffer`'s own guard (`connectionKey.startsWith('user-scoped:')`) but that guard only prevents _machine-scoped_ connection keys from being stored; it does not prevent a `user-scoped:${userId}` key from accumulating messages that should never reach that connection type.

**Fix:** Only buffer when the filter includes user-scoped connections, or document explicitly that `emitUpdate` is only to be called with user-scoped-inclusive filters:
```typescript
// Only buffer for filter types that deliver to user-scoped connections.
const filterIncludesUserScoped =
    !params.recipientFilter ||
    params.recipientFilter.type === 'all-user-authenticated-connections' ||
    params.recipientFilter.type === 'all-interested-in-session' ||
    params.recipientFilter.type === 'user-scoped-only';

if (filterIncludesUserScoped) {
    Promise.resolve(
        writeToBuffer(params.userId, `user-scoped:${params.userId}`, params.payload)
    ).catch(...);
}
```

---

## Info

### IN-01: Replay loop emits `'update'` as a string literal instead of using the protocol constant

**File:** `apps/server/sources/app/api/socket/resilienceHandler.ts:57`
**Issue:** `socket.emit('update', payload)` uses a raw string. The same handler imports `SOCKET_RESILIENCE_EVENTS` from the protocol package. If the event name changes in the protocol, this line would silently diverge. The `'replay-start'` literal on line 43 has the same problem — it is not in `SOCKET_RESILIENCE_EVENTS` at all (at least not in the imports shown), which means it either is defined elsewhere or the constant is missing.

**Fix:** Export `SOCKET_RESILIENCE_EVENTS.UPDATE` (and `REPLAY_START` if not already present) from `@happier-dev/protocol/socketResilience` and use those constants here. At minimum, add a comment tying each string literal to its protocol definition.

---

### IN-02: `warnedNoIo` state persists across test runs — potential test pollution

**File:** `apps/server/sources/app/events/connectionEventRouter.ts:14`
**Issue:** `warnedNoIo` is an instance field on the singleton `eventRouter`. `vi.clearAllMocks()` in `beforeEach` clears mock call counts but does not reset this boolean. If any test in the suite triggers the `!this.io` fallback path, subsequent tests will skip the "io not initialized" warning. This is a minor test reliability issue rather than a production bug, but it could mask real failures in test contexts that rely on the warning being emitted.

**Fix:** Either expose a `reset()` method (test-only) on `EventRouter`, or move the flag into the `emit()` call so it is stateless:
```typescript
// Instead of a persistent flag, just log once per io-null epoch using a WeakRef or accept duplicate warnings in tests.
```
Alternatively, the singleton can be reconstructed between tests using `vi.resetModules()`.

---

### IN-03: `it.todo` test carries a misleading comment — not actually skipped by design

**File:** `apps/server/sources/app/api/socket/resilienceHandler.integration.spec.ts:179`
**Issue:** The `.todo` item states "verified by running 'yarn test' in apps/cli — no code change needed". A `.todo` in vitest registers the test as pending and appears in the output as a reminder, but it implies the behaviour described (SRVR-07) has no server-side assertion at all. If a future change breaks SRVR-07 at the server layer, this file provides no regression coverage.

**Fix:** Either remove the `.todo` (if truly no server-side assertion is possible) or replace it with a proper test. If the intent is to document that SRVR-07 is covered in a different package, use a comment instead of `it.todo`.

---

### IN-04: `connectionEventRouter` aliased from `eventRouter.ts` re-export chain adds indirection

**File:** `apps/server/sources/app/events/connectionEventRouter.ts:211-214`
**Issue:** `connectionEventRouter` is an alias for `eventRouter` (same object). `eventRouter.ts` re-exports `eventRouter` from `connectionEventRouter.ts`. This creates a circular re-export loop: `socket.ts` imports from `@/app/events/eventRouter` (which re-exports from `connectionEventRouter`), while `connectionEventRouter.ts` is the canonical source. The alias is documented, but the round-trip is an unnecessary indirection that could confuse future readers.

**Fix:** Consider consolidating: either rename the file to `eventRouter.ts` (replacing the current barrel) or remove the alias export from `connectionEventRouter.ts` and have all callers import from a single canonical path. This is low-priority but worth addressing before the module grows further.

---

_Reviewed: 2026-04-22T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
