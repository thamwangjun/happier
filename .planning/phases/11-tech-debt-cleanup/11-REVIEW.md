---
phase: 11-tech-debt-cleanup
reviewed: 2026-04-23T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - apps/server/sources/app/api/socket/resilienceHandler.integration.spec.ts
  - docs/protocol.md
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-04-23  
**Depth:** standard  
**Files Reviewed:** 2  
**Status:** issues_found

## Summary

Two files reviewed: the integration spec for `resilienceHandler` and the protocol documentation for v1.3 resilience events. The spec file has a structural test isolation problem (the SRVR-05 async-describe anti-pattern that the file itself warns against) and a critical mock-wiring gap in the SRVR-09 path-2 test that would cause the `buffer-overflow` assertion to silently never be reached. The protocol document is missing the `replay-start` server event that is emitted by the handler and consumed by the mobile client.

---

## Warnings

### WR-01: SRVR-09 path-2 test — `db.unackedMessage.findFirst` mock not configured; `buffer-overflow` assertion will always fail

**File:** `apps/server/sources/app/api/socket/resilienceHandler.integration.spec.ts:119-138`

**Issue:** The "buffer-overflow emitted when gap detected" test asserts that `socket.emit` is called with `"buffer-overflow"`. However, the overflow signal in `resilienceHandler.ts` (line 72) depends on the result of `db.unackedMessage.findFirst`. The DB mock created by `createDbMocks` returns `undefined` from all mock fns until explicitly configured. Because the test never calls `db.unackedMessage.findFirst.mockResolvedValue(...)`, `absoluteMin` is `undefined`; `absoluteMin !== null` evaluates to `true` (since `undefined !== null`), but `absoluteMin.seq` is `undefined`, making `hasGap` compute as `undefined > 1` which is `false` — so `buffer-overflow` is never emitted. The test assertion at line 130 (`expect(socket.emit).toHaveBeenCalledWith("buffer-overflow")`) will fail at runtime.

**Note:** The `createDbMocks` shape at line 25-27 lists `findMany`, `deleteMany`, `create`, and `count` for `unackedMessage`, but does NOT include `findFirst`. The production handler calls `db.unackedMessage.findFirst` (resilienceHandler.ts line 67) — this is not mocked at all, so in vitest it either throws (method not a function) or returns undefined depending on the mock implementation.

**Fix:** Add `findFirst` to the `createDbMocks` shape and configure it in the SRVR-09 path-2 test:

```typescript
// In createDbMocks shape (line 25-27):
const { db, reset: resetDbMocks } = createDbMocks({
    unackedMessage: ["findMany", "deleteMany", "create", "count", "findFirst"],
} as const);

// In the SRVR-09 path-2 test, before triggerSocketHandler:
db.unackedMessage.findFirst.mockResolvedValue({ seq: 5 });
```

---

### WR-02: SRVR-05 async-describe top-level `await import` is the anti-pattern the file itself warns against

**File:** `apps/server/sources/app/api/socket/resilienceHandler.integration.spec.ts:224-225`

**Issue:** Lines 55-56 of the same file contain an explicit comment:

> "Calling it at the top level of an async describe is non-deterministic because Vitest does not await async describe callbacks during collection."

The SRVR-05 describe block (line 224) does exactly this — it `await import("./resilienceHandler")` at the async describe top-level, violating the pattern the inner describe already established. The correct pattern used by the main describe is to call `await import(...)` outside the describe callback (line 56 is at the describe body level for the inner block, which works only because Vitest awaits the outer describe's async body in this specific case — a fragile distinction). The SRVR-05 pattern is clearly replicating the same fragile anti-pattern and will produce non-deterministic behavior if Vitest changes its collection semantics.

**Fix:** Move the import into a `beforeAll` inside the SRVR-05 describe, mirroring how SRVR-01 (line 190-193) handles `vi.importActual`:

```typescript
describe.skipIf(skipRedis)("SRVR-05: Postgres/Redis mode — same replay behavior", () => {
    let resilienceHandler: typeof import("./resilienceHandler")["resilienceHandler"];

    beforeAll(async () => {
        const mod = await import("./resilienceHandler");
        resilienceHandler = mod.resilienceHandler;
    });

    beforeEach(() => {
        vi.clearAllMocks();
        readBufferMock.mockResolvedValue([]);
    });

    // ... rest of tests unchanged
});
```

---

### WR-03: SRVR-01 top-level describe does not inherit the main `beforeEach` — mock state from prior tests can leak in

**File:** `apps/server/sources/app/api/socket/resilienceHandler.integration.spec.ts:183-222`

**Issue:** The SRVR-01 describe block (line 183) is a top-level `describe` call, separate from the `describe("resilienceHandler")` block (line 54). This means it does NOT inherit the `beforeEach` (lines 58-64) that calls `resetDbMocks()` and resets `ackBufferMock` and `readBufferMock`. The SRVR-01 `beforeEach` (lines 195-198) only resets `writeToBufferMock` and clears all mocks via `vi.clearAllMocks()`. While `vi.clearAllMocks()` clears call history, it does NOT reset mock implementations (return values set with `.mockResolvedValue`). If a prior test sets `readBufferMock.mockResolvedValue([p1, p2])`, that implementation persists into SRVR-01. If test execution order changes, SRVR-01 tests could behave differently.

**Fix:** Add explicit resets to the SRVR-01 `beforeEach`:

```typescript
beforeEach(() => {
    vi.clearAllMocks();
    resetDbMocks();
    writeToBufferMock.mockResolvedValue({ overflow: false });
    readBufferMock.mockResolvedValue([]);
    ackBufferMock.mockResolvedValue(undefined);
});
```

---

## Info

### IN-01: `replay-start` server event is absent from `docs/protocol.md` v1.3 section

**File:** `docs/protocol.md:206-266`

**Issue:** The v1.3 Resilience Events section documents `reconnect-resume`, `ack-update`, `replay-complete`, and `buffer-overflow`, but omits the `replay-start` server-to-client event. This event is:

- Emitted by `resilienceHandler.ts` (line 61) via `SOCKET_RESILIENCE_EVENTS.REPLAY_START`
- Declared in `packages/protocol/src/socketResilience.ts` as `REPLAY_START: 'replay-start'`
- Consumed by the mobile client (`apps/ui/sources/sync/sync.ts:3346`) for MOB-09 proactive gap detection
- Covered by a dedicated test suite (`reconnectResume.spec.ts:292`)

Any consumer reading `protocol.md` to implement a client will not know `replay-start` exists, and will miss the MOB-09 proactive gap detection signal.

**Fix:** Add a `replay-start` entry to the "Server to client events" subsection (after the `replay-complete` entry):

```markdown
#### `replay-start`
Emitted by the server immediately before the first buffered `update` message in a replay sequence,
whenever the buffer is non-empty. Clients that support proactive gap detection (MOB-09) use this
event to check whether `retentionStart > lastAckedSeq + 1` and trigger `resumeViaChanges` early.

Payload: `{ retentionStart: number }` — the oldest `seq` still in the buffer. Never null (the
empty-buffer path emits `replay-complete` directly and skips `replay-start`).
```

---

### IN-02: SRVR-09 path-2 test comment describes overflow condition incorrectly

**File:** `apps/server/sources/app/api/socket/resilienceHandler.integration.spec.ts:121`

**Issue:** The comment reads "retentionStart > lastAckedSeq + 1". The actual overflow condition in the handler queries `absoluteMin` (the minimum seq across ALL buffer entries, not just those after `lastAckedSeq`) and checks `absoluteMin.seq > lastAckedSeq + 1`. In cases where entries below `lastAckedSeq` still exist in the buffer, `retentionStart` (from `readBuffer`, which filters to `> lastAckedSeq`) and `absoluteMin.seq` would differ. The comment is misleading and could cause future test authors to set up the wrong preconditions.

**Fix:** Correct the comment to match the actual implementation logic:

```typescript
// lastAckedSeq=0, absoluteMin.seq=5 — gap of 4 — overflow signal.
// The handler queries absoluteMin across ALL buffer entries (not just those > lastAckedSeq)
// to avoid false-positive overflow signals when lastAckedSeq+1 was delivered live.
```

---

_Reviewed: 2026-04-23_  
_Reviewer: Claude (gsd-code-reviewer)_  
_Depth: standard_
