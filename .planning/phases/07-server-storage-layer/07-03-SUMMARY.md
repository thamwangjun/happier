---
phase: 07-server-storage-layer
plan: "03"
subsystem: server-storage
tags:
  - tdd
  - retention
  - resilience
  - green-phase
dependency_graph:
  requires:
    - 07-01 (RED phase spec files: unackedMessageRetentionRule.spec.ts)
  provides:
    - createUnackedMessageRetentionRule() factory — RetentionRule with id 'unackedMessages'
    - Registered in retentionRuleRegistry.ts — picked up automatically by retention worker
  affects:
    - apps/server/sources/app/resilience/unackedMessageRetentionRule.ts
    - apps/server/sources/app/retention/runtime/retentionRuleRegistry.ts
tech_stack:
  added: []
  patterns:
    - TDD GREEN phase — implementation to pass RED spec from Plan 01
    - Batch-safe findMany → deleteMany with cutoff re-check (T-07-10 mitigation)
    - Limit cap via Math.min(batchSize, maxDeletesPerRulePerRun) (T-07-11 mitigation)
    - Same env-var TTL for write path and sweep (STORE-06 contract)
key_files:
  created:
    - apps/server/sources/app/resilience/unackedMessageRetentionRule.ts
  modified:
    - apps/server/sources/app/retention/runtime/retentionRuleRegistry.ts
decisions:
  - "No (db as any) cast needed — Prisma client already has UnackedMessage type from Plan 01 prisma generate"
  - "Import placed before '@/app/retention/...' imports in retentionRuleRegistry.ts (alphabetical by path: 'resilience' < 'retention')"
metrics:
  duration: ~5 min
  completed: "2026-04-22"
  tasks_completed: 2
  files_changed: 2
requirements-completed:
  - STORE-03
  - STORE-06
---

# Phase 07 Plan 03: Retention Rule GREEN Phase Summary

## What Was Built

TDD GREEN phase for STORE-03 and STORE-06 — the `UnackedMessage` retention rule that sweeps expired relay buffer entries.

`createUnackedMessageRetentionRule()` implements a `RetentionRule` that:
- Computes cutoff as `now - getRelayBufferTtlMsFromEnv(process.env)` — same env var as the write path, satisfying STORE-06's requirement for a single configuration value controlling both TTL cap and sweep window
- Uses the batch-safe findMany → deleteMany pattern: finds candidate IDs first, then re-applies `createdAt: { lt: cutoff }` in the deleteMany WHERE clause to prevent deleting rows that were refreshed between the two queries (T-07-10 mitigation)
- Caps deletes per run via `Math.min(batchSize, maxDeletesPerRulePerRun)` (T-07-11 mitigation)
- Short-circuits on `dryRun: true` (returns count without deleting) and on empty candidates (no DB write)

The rule was registered in `retentionRuleRegistry.ts` with one import and one call appended to the `createRetentionRuleRegistry()` array, so the existing retention worker picks it up automatically on its configured interval — no new scheduling required.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Implement unackedMessageRetentionRule.ts — GREEN phase | e3339dd4e | sources/app/resilience/unackedMessageRetentionRule.ts |
| 2 | Register createUnackedMessageRetentionRule in retentionRuleRegistry | 72505c7b4 | sources/app/retention/runtime/retentionRuleRegistry.ts |

## Deviations from Plan

None — plan executed exactly as written.

The plan suggested using `(db as any).unackedMessage` casts to avoid potential TypeScript errors. Since Plan 01 ran `prisma generate` and the Prisma client already has `UnackedMessage` typed (418 matches in index.d.ts), the casts were unnecessary. The implementation uses `db.unackedMessage` directly for type safety — a minor improvement over the suggested code that does not affect behavior.

## TDD Gate Compliance

RED gate: commit `02fbb40cc` from Plan 01 — `test(07-01): add failing RED tests for unackedMessageRetentionRule...`

GREEN gate: commit `e3339dd4e` — `feat(07-03): implement createUnackedMessageRetentionRule — GREEN phase (STORE-03, STORE-06)`

Both gates present and in correct order.

## Known Stubs

None — implementation is complete and wired. All 3 retention rule tests pass GREEN.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or unmitigated trust boundary changes. T-07-10 (race between findMany/deleteMany) and T-07-11 (unbounded sweep) are both mitigated in the implementation per the plan's threat model.

## Self-Check: PASSED

- [x] apps/server/sources/app/resilience/unackedMessageRetentionRule.ts — FOUND, 51 lines, exports createUnackedMessageRetentionRule
- [x] apps/server/sources/app/retention/runtime/retentionRuleRegistry.ts — FOUND, contains import + call (2 occurrences)
- [x] getRelayBufferTtlMsFromEnv(process.env) called in run() — CONFIRMED, no hardcoded 120000 literal
- [x] Batch-safe pattern: findMany selects { id: true }, deleteMany re-checks createdAt < cutoff — CONFIRMED
- [x] Commit e3339dd4e — FOUND
- [x] Commit 72505c7b4 — FOUND
- [x] All 3 tests in unackedMessageRetentionRule.spec.ts pass GREEN — CONFIRMED (3 passed)
- [x] Registry check: 2 occurrences of createUnackedMessageRetentionRule in retentionRuleRegistry.ts — CONFIRMED
