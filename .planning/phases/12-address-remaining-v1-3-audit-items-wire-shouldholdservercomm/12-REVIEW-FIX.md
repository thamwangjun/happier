---
phase: 12-address-remaining-v1-3-audit-items-wire-shouldholdservercomm
fixed_at: 2026-04-23T00:00:00Z
review_path: .planning/phases/12-address-remaining-v1-3-audit-items-wire-shouldholdservercomm/12-REVIEW.md
iteration: 1
findings_in_scope: 1
fixed: 1
skipped: 0
status: all_fixed
---

# Phase 12: Code Review Fix Report

**Fixed at:** 2026-04-23
**Source review:** .planning/phases/12-address-remaining-v1-3-audit-items-wire-shouldholdservercomm/12-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 1 (WR-01; IN-01 excluded by fix_scope=critical_warning)
- Fixed: 1
- Skipped: 0

## Fixed Issues

### WR-01: `updatePendingMessageV2` does not hold the server commit during replay

**Files modified:** `apps/ui/sources/sync/engine/pending/pendingQueueV2.ts`, `apps/ui/sources/sync/sync.ts`
**Commit:** 374f3d6d8
**Applied fix:**
- Added optional `replayGate?: { isReplaying: boolean; waitForReplayComplete(): Promise<void> }` parameter to `updatePendingMessageV2`'s params object, with a JSDoc comment referencing MOB-07 to match the existing pattern in `enqueuePendingMessageV2`.
- Added the replay guard before the PATCH request: `if (replayGate && shouldHoldServerCommit(replayGate)) { await replayGate.waitForReplayComplete(); }` — using the already-imported `shouldHoldServerCommit` helper.
- Updated `Sync.updatePendingMessage` in `sync.ts` to pass `replayGate: this`, identical to the pattern used in `Sync.enqueuePendingMessage`.
- TypeScript strict-mode check passed with no errors after the change.

---

_Fixed: 2026-04-23_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
