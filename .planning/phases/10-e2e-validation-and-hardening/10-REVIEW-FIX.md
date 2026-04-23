---
phase: 10-e2e-validation-and-hardening
fixed_at: 2026-04-23T00:00:00Z
review_path: .planning/phases/10-e2e-validation-and-hardening/10-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 10: Code Review Fix Report

**Fixed at:** 2026-04-23T00:00:00Z
**Source review:** .planning/phases/10-e2e-validation-and-hardening/10-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

## Fixed Issues

### WR-01: Silent swallow of schema-invalid `reconnect-resume` — no log, no client signal

**Files modified:** `apps/server/sources/app/api/socket/resilienceHandler.ts`
**Commit:** c4fcca0c5
**Applied fix:** Both `reconnect-resume` and `ack-update` `safeParse` failure paths now emit a `warn` log with the parse error message and user ID. The `reconnect-resume` failure path additionally emits `REPLAY_COMPLETE` with `retentionStart: null` to unblock the client gate so it does not hang indefinitely.

---

### WR-02: `retentionStart` derived from filtered rows — can misreport gap when stale acked entries are still in the buffer

**Files modified:** `apps/server/sources/app/api/socket/resilienceHandler.ts`
**Commit:** c4fcca0c5
**Applied fix:** Replaced the `retentionStart > lastAckedSeq + 1` gap check (which used the first filtered row above `lastAckedSeq`) with a dedicated `db.unackedMessage.findFirst` query over ALL buffer entries for the `(userId, connectionKey)` pair. `absoluteMin.seq > lastAckedSeq + 1` is now the condition, which correctly identifies a true buffer trim gap and avoids false overflow signals when `lastAckedSeq+1` was delivered live.
**Status:** fixed: requires human verification (logic correctness change)

---

### WR-03: `writeToBuffer` increments `bufferWritesTotal` inside the transaction before commit

**Files modified:** `apps/server/sources/app/resilience/unackedBuffer.ts`
**Commit:** 8be99e6d4
**Applied fix:** Changed `return await inTx(...)` to `const result = await inTx(...)`, moved `bufferWritesTotal.inc()` to after the `inTx` promise resolves in the outer function scope, and then `return result`. The metric is now only incremented on successful transaction commit, eliminating inflation from retried or rolled-back transactions.

---

### WR-04: Stress test comment incorrectly attributes SQLite WAL semantics to a PostgreSQL server

**Files modified:** `packages/tests/suites/stress/buffer.walContention.stress.test.ts`
**Commit:** 3ea08d269
**Applied fix:** Updated the `describe` block title, JSDoc comment, `it` test name, and two inline comments to replace all SQLite BUSY/WAL language with accurate PostgreSQL/Prisma terminology (connection pool saturation, serialization errors, concurrent write path). The JSDoc now explicitly states the server uses PostgreSQL and that this test exercises PostgreSQL-level concurrency.

---

_Fixed: 2026-04-23T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
