---
phase: 11-tech-debt-cleanup
plan: "02"
subsystem: server/socket/resilience
tags: [test-refactor, vitest, async-describe, beforeAll, SRVR-01]
dependency_graph:
  requires: []
  provides: [SRVR-01-test-determinism]
  affects: [apps/server/sources/app/api/socket/resilienceHandler.integration.spec.ts]
tech_stack:
  added: []
  patterns: [vitest-beforeAll-importActual]
key_files:
  modified:
    - apps/server/sources/app/api/socket/resilienceHandler.integration.spec.ts
decisions:
  - "Use beforeAll(async) for vi.importActual instead of async describe top-level; Vitest does not await async describe callbacks during collection, making top-level await non-deterministic"
metrics:
  duration: "~1 min"
  completed_date: "2026-04-23"
requirements:
  - SRVR-01
---

# Phase 11 Plan 02: SRVR-01 Test Refactor (beforeAll for importActual) Summary

**One-liner:** Moved `vi.importActual` from async-describe top-level into `beforeAll` so the SRVR-01 describe block is synchronous and deterministic under Vitest's collection model.

## What Was Built

Refactored the SRVR-01 describe block in `resilienceHandler.integration.spec.ts`:

- Changed `describe("SRVR-01: ...", async () => { ... })` to `describe("SRVR-01: ...", () => { ... })` (synchronous callback)
- Added `let connectionEventRouter: typeof import(...)["connectionEventRouter"]` declaration in describe scope
- Added `beforeAll(async () => { const mod = await vi.importActual(...); connectionEventRouter = mod.connectionEventRouter; })` to load the real module once before tests run
- Added `beforeAll` to the vitest import at the top of the file
- The two `it(...)` test bodies (fire-and-forget, does-not-block) are unchanged — they pick up the `let`-assigned value by closure

## Verification

```
grep 'describe("SRVR-01'  → describe("SRVR-01: emitUpdate() writes to buffer fire-and-forget", () => {
grep 'beforeAll'           → beforeAll(async () => {
grep 'importActual'        → only inside beforeAll body, not at describe top-level
SRVR-01 tests              → both ✓ passing
```

Test results (after change):
- SRVR-01 test 1: ✓ calls writeToBuffer with user-scoped connectionKey as a fire-and-forget side-effect
- SRVR-01 test 2: ✓ does not block: emitUpdate returns void before writeToBuffer promise resolves

Pre-existing failures (3) in SRVR-02, SRVR-04, SRVR-09, SRVR-10 are identical before and after this change — out of scope for this plan.

## Deviations from Plan

**1. [Rule 2 - Missing critical import] Added `beforeAll` to vitest imports**
- **Found during:** Task 1
- **Issue:** The plan specified adding `beforeAll(async () => {...})` but the import line only had `beforeEach, describe, expect, it, vi` — `beforeAll` was missing
- **Fix:** Added `beforeAll` to the vitest import at line 1
- **Files modified:** apps/server/sources/app/api/socket/resilienceHandler.integration.spec.ts
- **Commit:** 9251c6d47 (included in the task commit)

## Known Stubs

None — no stub patterns introduced.

## Threat Flags

No new security-relevant surface introduced. This is a test-file-only change.

## Self-Check: PASSED

- File exists: apps/server/sources/app/api/socket/resilienceHandler.integration.spec.ts — FOUND
- Task commit 9251c6d47 — FOUND (git log confirmed)
- SRVR-01 tests both passing — VERIFIED
