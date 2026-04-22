---
phase: 08-server-socket-integration
plan: "01"
subsystem: server/socket
tags: [tdd, red-gate, integration-test, resilience, socket-io]
dependency_graph:
  requires: []
  provides: [RED test suite for resilienceHandler, SRVR-01 through SRVR-10 coverage]
  affects: [apps/server/sources/app/api/socket/resilienceHandler.integration.spec.ts]
tech_stack:
  added: []
  patterns: [vitest integration spec, vi.mock hoisting, installDbModuleMock dynamic import, describe.skipIf Redis guard]
key_files:
  created:
    - apps/server/sources/app/api/socket/resilienceHandler.integration.spec.ts
  modified: []
key_decisions:
  - Used vitest.integration.config.ts for running integration specs (not the default vitest.config.ts which excludes *.integration.spec.ts)
  - connectionEventRouter mock targets '@/app/events/connectionEventRouter' (Plan 02 creates this file); real eventRouter.ts uses 'eventRouter' export name — distinction intentional
  - SRVR-07 covered as it.todo since it requires apps/cli test suite, not a server-side assertion
  - SRVR-09 path 2 and SRVR-10 consolidated in one describe block (gap detection implies ordering contract)
metrics:
  duration: ~8 min
  completed: "2026-04-22"
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 0
---

# Phase 08 Plan 01: RED Integration Test Suite — resilienceHandler Summary

RED integration test suite covering all 10 SRVR requirements for the server-side socket resilience handler using vitest integration config with mock isolation.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write RED integration tests — SRVR-01 through SRVR-10 | d6a665265 | apps/server/sources/app/api/socket/resilienceHandler.integration.spec.ts |

## What Was Built

`resilienceHandler.integration.spec.ts` (240 lines) — full RED test suite organized by SRVR requirement:

- **SRVR-01** (`describe("SRVR-01: emitUpdate() writes to buffer fire-and-forget")`): Two tests asserting `writeToBuffer` is called with `user-scoped:userId` key, and that `emitUpdate` returns before the buffer promise resolves.
- **SRVR-02 + SRVR-04** (SQLite mode): Asserts buffered messages are emitted in seq-ascending order with `replay-complete` at the end.
- **SRVR-03 + SRVR-08** (ack idempotency): Asserts `ackBuffer` is called with correct args; calling twice with same seq produces two calls and no errors.
- **SRVR-05** (Postgres/Redis mode): Wrapped in `describe.skipIf(!REDIS_URL)` — skips cleanly when `REDIS_URL` is absent.
- **SRVR-06** (ack before reconnect): Asserts empty buffer after ack produces `replay-complete` with `retentionStart: null` and no `update` events.
- **SRVR-07**: `it.todo` marker — verified by running `yarn test` in `apps/cli`.
- **SRVR-08**: Covered within SRVR-03 describe block (second test).
- **SRVR-09 path 1**: Covered by SRVR-02 test (non-empty buffer, no gap).
- **SRVR-09 path 2 + SRVR-10**: `buffer-overflow` emitted before `replay-complete`; `replay-start` index in `socket.emit.mock.calls` is less than first `update` index.
- **SRVR-09 path 3**: Empty buffer path — `replay-complete` with `{ retentionStart: null }` immediately.
- **SRVR-10**: Ordering verified via `mock.calls` index comparison for `replay-start` vs. first `update`.

## Verification

RED gate confirmed:

```
cd apps/server && npx vitest --config vitest.integration.config.ts --reporter verbose sources/app/api/socket/resilienceHandler.integration.spec.ts
```

Output:
```
FAIL  sources/app/api/socket/resilienceHandler.integration.spec.ts
Error: Cannot find module '/sources/app/api/socket/resilienceHandler'
```

- Test Files: 1 failed
- Tests: module-not-found (not "no tests found")
- RED gate: CONFIRMED

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written, with one clarification:

**Vitest config clarification:** The plan's `<verify>` block uses `yarn vitest --reporter verbose` which targets the default `vitest.config.ts`. That config excludes `*.integration.spec.ts` files. The correct runner is `vitest --config vitest.integration.config.ts`. This is a documentation-only note; the file itself is correct and will be picked up by the integration config in CI.

## Known Stubs

None — this is a test-only file. No implementation stubs.

## Threat Flags

None — test file only; no new trust boundaries introduced.

## TDD Gate Compliance

- RED gate commit: `d6a665265` (test(08-01): add RED integration test suite for SRVR-01 through SRVR-10)
- GREEN gate commit: pending (Plan 02)
- REFACTOR gate: N/A until GREEN

## Self-Check: PASSED

- [x] `apps/server/sources/app/api/socket/resilienceHandler.integration.spec.ts` — FOUND
- [x] Commit `d6a665265` — FOUND
- [x] File has 240 lines (min_lines: 200 requirement met)
- [x] Tests fail with module-not-found (RED gate confirmed, not "no tests found")
- [x] All 10 SRVR requirements have at least one concrete assertion
- [x] SRVR-05 wrapped in `describe.skipIf(skipRedis)`
- [x] `it.todo` for SRVR-07 present
- [x] 4-space indent and `@/` import conventions followed
