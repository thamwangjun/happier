---
phase: 10-e2e-validation-and-hardening
reviewed: 2026-04-23T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - apps/server/sources/app/monitoring/metrics2.ts
  - apps/server/sources/app/resilience/unackedBuffer.ts
  - apps/server/sources/app/api/socket/resilienceHandler.ts
  - packages/tests/src/testkit/socketClient.ts
  - docs/android-doze-qa-checklist.md
  - docs/PROTOCOL_CHANGES.md
  - packages/tests/suites/core-e2e/reconnect.resilience.e2e.test.ts
  - apps/server/prisma/migrations/20260423000000_add_unacked_message_buffer/migration.sql
  - packages/tests/suites/stress/buffer.walContention.stress.test.ts
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-04-23T00:00:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed the Phase 10 resilience implementation: the `UnackedMessageBuffer` (server-side), `resilienceHandler` (Socket.IO reconnect-resume / ack-update events), Prometheus metrics module, the e2e reconnect test, the WAL contention stress test, the migration SQL, the test socket client helper, and the two docs files.

The core reconnect-resume / ack flow is structurally sound. Zod validation gates every inbound client event, all DB writes are wrapped in transactions, and the fire-and-forget buffer write in `connectionEventRouter` is properly catch-wrapped. The main concerns are:

- The `resilienceHandler` silently ignores `reconnect-resume` events that fail schema validation, which masks client bugs and makes the flow invisible in production logs.
- `retentionStart` is derived from the post-`readBuffer` result set rather than a direct DB min-seq query, which can silently return a misleading value when the buffer contains entries below `lastAckedSeq` that `readBuffer` excluded.
- The `ClientAckState` table is created in the migration but has zero usage in application code — dead schema that may confuse future maintainers.
- The WAL contention stress test describes an SQLite-specific scenario but the server uses PostgreSQL in production; the test comment mischaracterises the production risk being validated.

---

## Warnings

### WR-01: Silent swallow of schema-invalid `reconnect-resume` — no log, no client signal

**File:** `apps/server/sources/app/api/socket/resilienceHandler.ts:27`

**Issue:** When `ReconnectResumeRequestSchema.safeParse(data)` fails, the handler returns immediately without emitting any error to the client and without logging. The client will sit in its reconnecting gate indefinitely — `replay-complete` never arrives, and the app is silently stuck. The same silent-discard pattern exists in the `ack-update` handler at line 89. In production this makes validation failures completely invisible.

**Fix:**
```typescript
const parsed = ReconnectResumeRequestSchema.safeParse(data);
if (!parsed.success) {
    log({ module: 'resilience', level: 'warn' }, `reconnect-resume parse error for user ${userId}: ${parsed.error.message}`);
    // Unblock the client gate so it doesn't hang.
    socket.emit(SOCKET_RESILIENCE_EVENTS.REPLAY_COMPLETE, { retentionStart: null });
    return;
}
```
Apply the same pattern to the `ack-update` handler's `safeParse` failure path.

---

### WR-02: `retentionStart` derived from filtered rows — can misreport gap when stale acked entries are still in the buffer

**File:** `apps/server/sources/app/api/socket/resilienceHandler.ts:42-46`

**Issue:** `readBuffer` returns only rows where `seq > lastAckedSeq`. `retentionStart` is then set to `rows[0].seq` — the smallest seq *above* `lastAckedSeq`. If the buffer still holds entries at or below `lastAckedSeq` (i.e. the client acked them but a prior `ackBuffer` call was missed), `retentionStart` correctly excludes them. However, when gap detection runs at line 61:

```typescript
const hasGap = retentionStart !== null && retentionStart > lastAckedSeq + 1;
```

This test fires even when the buffer is merely missing `lastAckedSeq + 1` because that entry was legitimately delivered live and never buffered (not an overflow). The result is a false `buffer-overflow` signal that forces the client to do a full `resumeViaChanges` unnecessarily.

A true overflow gap should be detected using the minimum seq across *all* buffer entries for this `connectionKey`, not just those above `lastAckedSeq`:

```typescript
const absoluteMin = await db.unackedMessage.findFirst({
    where: { userId, connectionKey },
    orderBy: { seq: 'asc' },
    select: { seq: true },
});
const hasGap = absoluteMin !== null && absoluteMin.seq > lastAckedSeq + 1;
```

This is a correctness issue: the current logic can trigger unnecessary full-state fetches in normal operation.

---

### WR-03: `writeToBuffer` increments `bufferWritesTotal` inside the transaction before commit

**File:** `apps/server/sources/app/resilience/unackedBuffer.ts:63`

**Issue:** `bufferWritesTotal.inc()` is called at line 63 inside the `inTx` callback, before the transaction commits. If the transaction is retried or rolled back (e.g. due to a Prisma serialization error or connection reset), the counter is incremented for an operation that ultimately did not persist. Over time this inflates the `buffer_writes_total` metric, making it diverge from the true write count.

**Fix:** Move the `bufferWritesTotal.inc()` call to after the `inTx(...)` promise resolves, in the caller scope:

```typescript
export async function writeToBuffer(...): Promise<{ overflow: boolean }> {
    if (!connectionKey.startsWith('user-scoped:')) {
        return { overflow: false };
    }

    const result = await inTx(async (tx: Tx) => {
        // ... insert, count, trim ...
        return { overflow };
    });

    bufferWritesTotal.inc();   // Only counted on successful commit
    return result;
}
```

---

### WR-04: Stress test comment incorrectly attributes SQLite WAL semantics to a PostgreSQL server

**File:** `packages/tests/suites/stress/buffer.walContention.stress.test.ts:27`

**Issue:** The test description and inline comments refer to "SQLite BUSY errors", "SQLite WAL contention", and "WAL write path" throughout. However `startServerLight` boots an actual server process (backed by PostgreSQL in the production-like test environment, or at least Prisma over whichever DB is configured). PostgreSQL has no concept of BUSY/WAL lock errors; its concurrency model is entirely different.

If the server is running SQLite in the light test harness, the comment is accurate for that context but misleading because the production database is PostgreSQL. If it is PostgreSQL, the comment is factually wrong and the stress scenario being validated is different (connection pool exhaustion, serialization failures) from what the comment describes.

**Fix:** Clarify which database backend `startServerLight` uses in this context, and update the `describe` block and inline comments to name the actual concurrency risk being exercised (e.g. "Prisma connection pool saturation under concurrent writes"). Remove the SQLite-specific BUSY/WAL language unless this test genuinely runs against SQLite.

---

## Info

### IN-01: `ClientAckState` table created in migration but unused in application code

**File:** `apps/server/prisma/migrations/20260423000000_add_unacked_message_buffer/migration.sql:14-20`

**Issue:** The migration creates a `ClientAckState` table with a `userId/connectionKey` composite unique index and an `ackedSeq` column. A search of all application source files (`apps/server/sources/`) finds zero references to `clientAckState` or `ClientAckState`. The table exists in the Prisma schema but is never read or written by any production code path.

Dead schema adds noise to the database, bloats the Prisma client, and may mislead future developers into assuming it is populated. If it is scaffolded for a future phase, add a comment to that effect. If it is vestigial, remove it.

---

### IN-02: `resilienceHandler` constructs `connectionKey` independently — potential divergence with `writeToBuffer` call site

**File:** `apps/server/sources/app/api/socket/resilienceHandler.ts:30` and `apps/server/sources/app/events/connectionEventRouter.ts:80`

**Issue:** `resilienceHandler` hard-codes `connectionKey = \`user-scoped:${userId}\`` at lines 30 and 91. The buffer write call site in `connectionEventRouter.ts:80` does the same. There is no shared constant for this format string. If the key format ever needs to change (e.g. to include a device fingerprint for per-device buffering), it must be updated in at least two separate files. A minor naming drift between the two sites would silently break replay — the read path would query a key that no writes ever produced.

**Fix:** Extract the key construction to a small helper, e.g. in `unackedBuffer.ts`:

```typescript
export function userScopedConnectionKey(userId: string): string {
    return `user-scoped:${userId}`;
}
```

Then import and use it in both `resilienceHandler.ts` and `connectionEventRouter.ts`.

---

### IN-03: `ReconnectResumeRequestSchema` requires `sessionId` — field is parsed but never used by the server handler

**File:** `apps/server/sources/app/api/socket/resilienceHandler.ts:29` and `packages/protocol/src/socketResilience.ts:16-19`

**Issue:** The `ReconnectResumeRequestSchema` defines `sessionId` as a required field (no `.optional()`). The server handler destructures only `lastAckedSeq` from `parsed.data` and never reads `sessionId`. The current per-user buffer design keys on `userId + connectionKey`, not on session, so the session ID is structurally irrelevant on the server side. However because `sessionId` is required in the schema, any client that omits it will silently fail validation (WR-01 above makes this silent), and future server developers may be confused about whether it has hidden significance.

**Fix:** If `sessionId` has no server-side use, remove it from `ReconnectResumeRequestSchema`, or document explicitly why it is present (e.g. reserved for multi-session buffering in a later phase). If it is needed for future routing, add a `// reserved` comment to suppress confusion.

---

_Reviewed: 2026-04-23T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
