---
phase: 07-server-storage-layer
plan: "01"
subsystem: server-storage
tags:
  - tdd
  - prisma
  - schema
  - resilience
  - red-phase
dependency_graph:
  requires: []
  provides:
    - UnackedMessage Prisma model with userId/connectionKey/seq/payload indexes
    - ClientAckState Prisma model with userId/connectionKey unique constraint
    - Failing unit tests for unackedBuffer (STORE-01, STORE-02, STORE-04, STORE-05, STORE-07)
    - Failing unit tests for unackedMessageRetentionRule (STORE-03, STORE-06)
  affects:
    - apps/server/prisma/schema.prisma
    - apps/server/prisma/sqlite/schema.prisma
    - apps/server/prisma/mysql/schema.prisma
    - apps/server/sources/app/resilience/
tech_stack:
  added:
    - resilience module directory at apps/server/sources/app/resilience/
  patterns:
    - TDD RED phase — spec files with installDbModuleMock + dynamic import pattern
    - createDbMocks + createDbTransactionMock for DB mock wiring
    - inTx transaction mock via txMock.wrapDb(dbMocks.db)
key_files:
  created:
    - apps/server/sources/app/resilience/unackedBuffer.spec.ts
    - apps/server/sources/app/resilience/unackedMessageRetentionRule.spec.ts
  modified:
    - apps/server/prisma/schema.prisma
    - apps/server/prisma/sqlite/schema.prisma
    - apps/server/prisma/mysql/schema.prisma
decisions:
  - "Run schema:sync before prisma generate because the generate script alone does not sync SQLite/MySQL schemas"
  - "Created resilience/ directory (not retention/) to distinguish active buffering concerns from periodic cleanup rules"
metrics:
  duration: ~10 min
  completed: "2026-04-22"
  tasks_completed: 3
  files_changed: 5
requirements-completed:
  - STORE-01
  - STORE-02
  - STORE-04
  - STORE-05
  - STORE-07
---

# Phase 07 Plan 01: Server Storage Layer RED Phase Summary

## What Was Built

TDD RED phase for Phase 7 — server-side unacknowledged message buffer storage layer.

Two Prisma models were added to persist the relay buffer durably: `UnackedMessage` (stores pending messages per user+connectionKey with sequence numbers) and `ClientAckState` (tracks per-client ack watermark). After schema addition, `schema:sync` propagated changes to SQLite and MySQL schemas, and `prisma generate` regenerated the TypeScript client.

Two failing spec files were created to drive implementation in Plans 02 and 03:
- `unackedBuffer.spec.ts` — 6 tests covering STORE-01 (read order), STORE-02 (cap enforcement), STORE-04 (ack discard), STORE-05 (overflow signal), STORE-07 (CLI exclusion for non-user-scoped keys)
- `unackedMessageRetentionRule.spec.ts` — 3 tests covering STORE-03 + STORE-06 (TTL sweep, dryRun, empty candidates)

All 9 new tests fail RED with "Cannot find module" as expected.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add UnackedMessage + ClientAckState Prisma models | d28efab10 | schema.prisma, sqlite/schema.prisma, mysql/schema.prisma |
| 2 | Write RED failing tests — unackedBuffer.spec.ts | 198eb080f | sources/app/resilience/unackedBuffer.spec.ts |
| 3 | Write RED failing tests — unackedMessageRetentionRule.spec.ts | 02fbb40cc | sources/app/resilience/unackedMessageRetentionRule.spec.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] yarn generate command not in PATH**
- **Found during:** Task 1
- **Issue:** `yarn generate` failed with "command not found" since yarn was not in the default shell PATH. `prisma` was also not on PATH.
- **Fix:** Used `PATH=/home/thamw/development/happier/happier/node_modules/.bin:/home/thamw/.local/share/mise/installs/yarn/1.22.22/bin:$PATH` to locate both yarn and the prisma binary from the monorepo root `node_modules/.bin/`.
- **Additional:** The `generate` script in `apps/server/package.json` only runs `prisma generate` (not `schema:sync`). Ran `yarn schema:sync` first to propagate new models to the SQLite and MySQL variant schemas, then ran `prisma generate`. Both steps are required.
- **Files modified:** None — process only.

## TDD Gate Compliance

RED gate commits exist:
1. `test(07-01): add failing RED tests for unackedBuffer...` — commit `198eb080f`
2. `test(07-01): add failing RED tests for unackedMessageRetentionRule...` — commit `02fbb40cc`

GREEN gate commits: not yet — these will be created in Plan 02 and Plan 03.

## Known Stubs

None — this plan only adds schema models and failing tests; no implementation stubs.

## Threat Flags

None — no new network endpoints, auth paths, or unmitigated trust boundary changes introduced. T-07-01 (connectionKey guard) is represented in the STORE-07 test cases and will be enforced in Plan 02 implementation.

## Self-Check: PASSED

- [x] apps/server/prisma/schema.prisma — FOUND, contains model UnackedMessage and model ClientAckState
- [x] apps/server/prisma/sqlite/schema.prisma — FOUND, contains UnackedMessage
- [x] apps/server/sources/app/resilience/unackedBuffer.spec.ts — FOUND, 102 lines, 6 test cases
- [x] apps/server/sources/app/resilience/unackedMessageRetentionRule.spec.ts — FOUND, 89 lines, 3 test cases
- [x] Commit d28efab10 — FOUND
- [x] Commit 198eb080f — FOUND
- [x] Commit 02fbb40cc — FOUND
- [x] All 9 new tests fail RED (Cannot find module) — CONFIRMED
- [x] No pre-existing passing tests broken by schema addition — CONFIRMED (pre-existing failures are unrelated zod/startup issues present before this plan)
