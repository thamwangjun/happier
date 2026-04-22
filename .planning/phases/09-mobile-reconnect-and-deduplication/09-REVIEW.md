---
phase: 09-mobile-reconnect-and-deduplication
reviewed: 2026-04-22T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - apps/ui/sources/sync/domains/state/persistence.ts
  - apps/ui/sources/sync/engine/pending/pendingQueueV2.ts
  - apps/ui/sources/sync/engine/resilience/ackCursorManager.spec.ts
  - apps/ui/sources/sync/engine/resilience/ackCursorManager.ts
  - apps/ui/sources/sync/engine/resilience/dedupFilter.spec.ts
  - apps/ui/sources/sync/engine/resilience/dedupFilter.ts
  - apps/ui/sources/sync/engine/resilience/reconnectResume.spec.ts
  - apps/ui/sources/sync/engine/resilience/replayGate.spec.ts
  - apps/ui/sources/sync/engine/resilience/replayGate.ts
  - apps/ui/sources/sync/sync.ts
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 09: Code Review Report

**Reviewed:** 2026-04-22
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Phase 09 introduces a well-structured resilience layer for mobile reconnect and deduplication. The core components (`dedupFilter`, `ackCursorManager`, `replayGate`) are small, focused, and correctly implemented. The persistence helpers for `lastAckedSeq` use safe-default patterns and merge-write semantics. The replay gate integration in `sync.ts` and `pendingQueueV2.ts` is logically sound.

Three warnings were found: a race window in the `onReconnected` handler ordering, missing gate cleanup on `BUFFER_OVERFLOW`, and a missing `clearOptimisticThinking` in `enqueuePendingMessageV2` when replay wait is abandoned. Four informational items cover dead code, test fidelity gaps, and a magic number.

No critical security or data-loss issues were found.

## Warnings

### WR-01: lastAckedSeq loaded after reconnect-resume is already emitted — race window

**File:** `apps/ui/sources/sync/sync.ts:3331-3341`
**Issue:** In the `onReconnected` handler, `loadLastAckedSeq` is called and `this.lastAckedSeq` is updated **after** `RECONNECT_RESUME` is emitted. The sequence is:
1. `this.replayGate.isReplaying = true`
2. `fireAndForget(this.resumeSync('socket-reconnect'))`  — async, runs later
3. `this.lastAckedSeq = loadLastAckedSeq(accountId)` — updates in-memory cursor
4. `apiSocket.send(SOCKET_RESILIENCE_EVENTS.RECONNECT_RESUME, { lastAckedSeq: this.lastAckedSeq })` — sends persisted value

In practice the ordering is currently correct because `loadLastAckedSeq` and `apiSocket.send` are both synchronous, and the emit happens **after** the load. However, `resumeSync` is async and starts before the load, meaning any code inside `resumeSync` that reads `this.lastAckedSeq` early (before the assignment completes) could observe the previous cycle's value. More importantly, `accountId` is fetched from `storage.getState().profile?.id ?? ''` — if the profile is not yet loaded (first connect), `lastAckedSeq` will be loaded under the empty-string key (`loadLastAckedSeq('')`) which always returns 0. The persisted value for the real account is then never used in this reconnect cycle, so the server may replay more messages than necessary.

**Fix:** Load `lastAckedSeq` before emitting `RECONNECT_RESUME`, and ensure `accountId` is resolved from a stable source (not the Zustand store, which may lag behind on first reconnect). Consider persisting `accountId` separately or reading it from credentials:
```typescript
apiSocket.onReconnected(() => {
    this.replayGate.isReplaying = true;
    // Resolve accountId from credentials (always available post-auth)
    const accountId = storage.getState().profile?.id ?? this.serverID ?? '';
    this.lastAckedSeq = loadLastAckedSeq(accountId);
    apiSocket.send(SOCKET_RESILIENCE_EVENTS.RECONNECT_RESUME, {
        sessionId: '',
        lastAckedSeq: this.lastAckedSeq,
    });
    fireAndForget(this.resumeSync('socket-reconnect'), { tag: 'Sync.resumeSync.socket-reconnect' });
});
```

---

### WR-02: BUFFER_OVERFLOW does not clear isReplaying — pending commits stay blocked indefinitely if REPLAY_COMPLETE never fires

**File:** `apps/ui/sources/sync/sync.ts:3352-3356`
**Issue:** When a `BUFFER_OVERFLOW` event arrives, `resumeViaChangesDeduped` is called to catch up via the changes API. The `replayGate.isReplaying` flag is **not** cleared here. Per the stated design, `isReplaying` is only cleared on `REPLAY_COMPLETE`. However, after a buffer overflow the server may not send `REPLAY_COMPLETE` (because there is no replay to complete — the buffer was already trimmed and the client is catching up via HTTP). If `REPLAY_COMPLETE` never fires after a buffer overflow, any `enqueuePendingMessageV2` calls that arrive during this window will be stuck waiting on `waitForReplayComplete()` indefinitely.

The spec comment says "isReplaying cleared only on REPLAY_COMPLETE (not BUFFER_OVERFLOW — prevents premature drain)", but this only holds if `REPLAY_COMPLETE` is guaranteed to follow every `BUFFER_OVERFLOW`. If the server protocol does not guarantee that, this is a permanent lock.

**Fix:** After `resumeViaChangesDeduped` resolves on buffer overflow, clear `isReplaying` and drain waiters:
```typescript
apiSocket.onMessage(SOCKET_RESILIENCE_EVENTS.BUFFER_OVERFLOW, () => {
    const accountId = storage.getState().profile?.id ?? '';
    const resume = this.resumeViaChangesDeduped({ accountId });
    fireAndForget(resume.then(() => {
        // If server does not send REPLAY_COMPLETE after overflow, clear the gate here.
        if (this.replayGate.isReplaying) {
            this.replayGate.isReplaying = false;
            this.drainReplayCompleteWaiters();
        }
    }), { tag: 'Sync.buffer-overflow.resumeViaChanges' });
});
```
Alternatively, document the server guarantee that `REPLAY_COMPLETE` always follows `BUFFER_OVERFLOW`.

---

### WR-03: Replay-wait abandonment in pendingQueueV2 does not clean up optimistic UI state on error

**File:** `apps/ui/sources/sync/engine/pending/pendingQueueV2.ts:344-372`
**Issue:** Inside `enqueuePendingMessageV2`, the message is inserted into Zustand via `upsertPendingMessage` before `runPendingEnqueueCommitInOrder`. If `waitForReplayComplete()` throws (or if `sessionEncryption!.encryptRawRecord` throws after the wait), the catch block at line 368 calls `removePendingMessage` and `clearSessionOptimisticThinking`. This path is correct.

However, if the `replayGate.isReplaying` wait resolves successfully but the `request(...)` call at line 358 is never reached because `runPendingEnqueueCommitInOrder` itself is swallowing a previous chain error (the `.catch(() => undefined)` at line 101 silences all prior chain errors), a newly queued op may proceed to the HTTP POST even when the prior queued op errored catastrophically. This is an existing design trade-off for the queue, but with the gate wait added at line 347, there is now a new failure mode: if `waitForReplayComplete()` itself rejects (e.g. the `replayCompleteWaiters` array is cleared unexpectedly without calling resolve), the outer `catch` at line 368 will remove the pending message — which is correct — but the error surface of `waitForReplayComplete()` is not guarded against rejection. Currently `waitForReplayComplete` only pushes a `resolve` callback and never a `reject`, so this is safe today, but it is a brittle assumption.

**Fix:** Add an explicit note in `waitForReplayComplete` that it must never reject, or convert the pending message queue gate to also handle a possible rejection gracefully:
```typescript
// In waitForReplayComplete(), explicitly guard:
public waitForReplayComplete(): Promise<void> {
    if (!this.replayGate.isReplaying) {
        return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
        // NOTE: This promise intentionally never rejects.
        // If the gate must be abandoned, call drainReplayCompleteWaiters().
        this.replayCompleteWaiters.push(resolve);
    });
}
```

## Info

### IN-01: Dead `accountId` variable in REPLAY_START handler

**File:** `apps/ui/sources/sync/sync.ts:3345-3350`
**Issue:** The `REPLAY_START` handler reads `accountId` from `storage.getState().profile?.id ?? ''` but never passes it to `resumeViaChangesDeduped`. The `opts.accountId` parameter is read inside `resumeViaChanges` (line 3421) where it is used as the `accountId` for the `runSocketReconnectCatchUpViaChanges` call. The variable is assigned and then used correctly — this is not a bug — but it is immediately computed and used only to call `resumeViaChangesDeduped`, which internally calls `resumeViaChanges(opts)`. If profile is not yet loaded the empty-string `accountId` is passed down, potentially causing the changes fetch to fail silently. Same concern applies in the `BUFFER_OVERFLOW` handler at line 3353.

This is a copy of the same profile-loading race as WR-01 but at a lower severity because the changes fetch is a best-effort catch-up, not a message-ordering gate.

**Fix:** Consider deriving `accountId` from credentials rather than the Zustand store in all three resilience event handlers (RECONNECT_RESUME, REPLAY_START, BUFFER_OVERFLOW) for consistent behavior when the profile has not loaded yet.

---

### IN-02: reconnectResume.spec.ts tests mock the persistence layer but do not exercise the actual sync handler ordering

**File:** `apps/ui/sources/sync/engine/resilience/reconnectResume.spec.ts:23-62`
**Issue:** The MOB-01 tests verify that the mocked `loadLastAckedSeq` and `socketEmit` are called with the right arguments, but they are entirely self-referential: they call `loadLastAckedSeq` themselves and then call a local `socketEmit` mock. They do not import or call the actual `onReconnected` handler in `sync.ts`, so they do not catch the ordering issue described in WR-01. The tests pass even if the real implementation emits `RECONNECT_RESUME` before loading `lastAckedSeq`.

**Fix:** The spec is acceptable as a unit test for the persistence layer, but add a brief comment clarifying the scope boundary. A more complete integration test would exercise `sync.ts`'s actual reconnect handler against a mock socket.

---

### IN-03: Magic number `6` for max retry attempts in pending message commit retry

**File:** `apps/ui/sources/sync/sync.ts:1428`
**Issue:** The retry limit `6` is a bare magic number. The calculation `Math.min(30_000, 1_000 * Math.pow(2, nextAttempt))` with `nextAttempt` up to 5 gives delays of 2s, 4s, 8s, 16s, 30s (capped) — approximately 60 seconds total. This is reasonable but the number `6` is not documented.

**Fix:** Extract to a named constant:
```typescript
const MAX_PENDING_COMMIT_RETRY_ATTEMPTS = 6;
// ...
if (nextAttempt >= MAX_PENDING_COMMIT_RETRY_ATTEMPTS) {
```

---

### IN-04: `fetchFriendRequests` is dead code but logged as if operational

**File:** `apps/ui/sources/sync/sync.ts:2443-2447`
**Issue:** `fetchFriendRequests` is wired up to `friendRequestsSync` (line 380) and invalidated in several resume pipelines, but its implementation does nothing except log that it is now handled elsewhere. Every invalidation cycle pays the overhead of a no-op async call and a log line.

**Fix:** Remove `friendRequestsSync` and its corresponding `InvalidateSync` registration, or convert `fetchFriendRequests` to return immediately without logging to reduce noise:
```typescript
private fetchFriendRequests = async () => {
    // Friend requests are included in fetchFriends response (status='pending').
    // This sync unit is retained for compatibility but performs no network I/O.
};
```

---

_Reviewed: 2026-04-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
