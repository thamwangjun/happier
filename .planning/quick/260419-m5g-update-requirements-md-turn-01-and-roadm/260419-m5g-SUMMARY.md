---
phase: quick-260419-m5g
plan: "01"
subsystem: planning-artifacts
tags: [documentation, requirements, roadmap, two-function-split, phase-4]
dependency_graph:
  requires: [04-VERIFICATION.md]
  provides: [aligned REQUIREMENTS.md, aligned ROADMAP.md]
  affects: [Phase 5 planning]
tech_stack:
  added: []
  patterns: []
key_files:
  modified:
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
decisions:
  - "Accept Phase 4's two-function-split deviation: update planning docs to reflect finalizeCurrentTurn() + finalizeSubagentTurn() design rather than reverting to isSubagent? flag approach"
  - "TURN-04 is retired as originally written and replaced with the direct-call description; marked Phase 4 Done"
  - "Phase 5 Requirements narrowed to TURN-06 only; TURN-04 no longer pending"
metrics:
  duration: ~5 minutes
  completed: 2026-04-19T16:00:41Z
---

# Phase quick-260419-m5g Plan 01: Update REQUIREMENTS.md TURN-01/04 and ROADMAP Phase 4/5 Summary

Closed the documentation gap identified in `04-VERIFICATION.md`: planning artifacts described an `isSubagent?: boolean` flag approach that Phase 4 replaced with a two-function split (`finalizeCurrentTurn()` + `finalizeSubagentTurn()`). Both `REQUIREMENTS.md` and `ROADMAP.md` now match the codebase.

## What Was Changed and Why

### Task 1 — REQUIREMENTS.md

**Why:** Phase 4 implemented `finalizeSubagentTurn()` as a separate closure instead of adding `isSubagent?: boolean` to `finalizeCurrentTurn()`. TURN-01 and TURN-04 described the flag approach. The verification report flagged both as misaligned with the actual implementation.

**TURN-01 before:**
> `finalizeCurrentTurn()` in `claudeRemoteAgentSdk.ts` accepts `isSubagent?: boolean` in its params bag (backward-compatible with all existing call sites)

**TURN-01 after:**
> `claudeRemoteAgentSdk.ts` exposes two distinct closures for turn completion: `finalizeCurrentTurn()` for the parent path (all Phase A + Phase B logic, `params?: { completionEvent?: string }`) and `finalizeSubagentTurn()` for the subagent path (Phase A bookkeeping only). All existing call sites of `finalizeCurrentTurn()` remain unchanged.

**TURN-04 before:**
> `task_notification` call site passes `{ isSubagent: true }`; `result` and compact call sites pass `{}` (falsy default, treated as parent)

**TURN-04 after:**
> The `task_notification` handler calls `finalizeSubagentTurn()` directly. The `result` and compact call sites call `finalizeCurrentTurn()` (with optional `completionEvent`). No `isSubagent` flag is passed at any call site.

**Traceability table:** TURN-01, TURN-02, TURN-03, TURN-04, TURN-05, TEST-01, TEST-02, TEST-03 all marked Phase 4 Done (previously most were Pending, and TURN-04 was incorrectly assigned to Phase 5).

**Future Requirements:** Removed the "Dedicated subagent handler function (Codex-style)" note — that pattern is now implemented. Retained the `resetTurnDiagnostics()` scope advisory from the verification report.

### Task 2 — ROADMAP.md

**Why:** Phase 4 SC-1 still referenced `finalizeCurrentTurn({ isSubagent: true })` call syntax. Phase 5 goal, SC-1, and SC-3 were predicated on wiring `isSubagent` flags that no longer exist. These would have made Phase 5 unexecutable against the current codebase.

**Phase 4 summary line before:**
> Split into unconditional bookkeeping (Phase A) and parent-only notification (Phase B); add isSubagent param; write tests first

**Phase 4 summary line after:**
> Split into `finalizeCurrentTurn()` (parent, Phase A + B) and `finalizeSubagentTurn()` (subagent, Phase A only); write tests first

**Phase 4 SC-1 before:**
> A caller can invoke `finalizeCurrentTurn({ isSubagent: true })` or `finalizeCurrentTurn({})` without type errors; existing call sites with no argument also compile without change

**Phase 4 SC-1 after:**
> Two closures exist in `claudeRemoteAgentSdk.ts`: `finalizeCurrentTurn()` (parent path, `params?: { completionEvent?: string }`) and `finalizeSubagentTurn()` (subagent path, no params). The `task_notification` handler calls `finalizeSubagentTurn()`; result handlers call `finalizeCurrentTurn()`. All call sites compile without errors.

**Phase 5 goal before:**
> Every call site of `finalizeCurrentTurn()` passes the correct `isSubagent` value, and the live session behavior produces exactly one ready event per parent turn completion

**Phase 5 goal after:**
> End-to-end verification that the two-function-split produces correct relay behavior: exactly one ready event per parent completion, no spurious ready events on subagent completion

**Phase 5 SC-1 before:**
> The `task_notification` handler passes `{ isSubagent: true }` and the `result` handler passes `{}` — verifiable by reading the three updated call sites in `claudeRemoteAgentSdk.ts`

**Phase 5 SC-1 after:**
> The `task_notification` handler calls `finalizeSubagentTurn()` and does not call `finalizeCurrentTurn()` — verifiable by reading `claudeRemoteAgentSdk.ts` lines around the `task_notification` branch

**Phase 5 SC-3:** Updated to reference TURN-06 baseline case explicitly.

**Phase 5 Requirements:** Changed from `TURN-04, TURN-06` to `TURN-06` only (TURN-04 satisfied by Phase 4).

**Phase 5 name:** Changed from "Wire Call Sites and Verify" to "Verify End-to-End Behavior" to reflect the revised scope.

## Confirmation: Documentation Now Matches Codebase

Evidence from `04-VERIFICATION.md` confirms:
- `claudeRemoteAgentSdk.ts` line 1169: `finalizeCurrentTurn` params are `{ completionEvent?: string }` — no `isSubagent` field
- `claudeRemoteAgentSdk.ts` line 1194: `finalizeSubagentTurn` is a separate closure
- `claudeRemoteAgentSdk.ts` line 1564: `task_notification` handler calls `await finalizeSubagentTurn()` directly
- `claudeRemoteAgentSdk.ts` lines 1582, 1631, 1635: result handlers call `await finalizeCurrentTurn(...)`

Planning artifacts now accurately describe these code realities.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- [x] `.planning/REQUIREMENTS.md` modified — confirmed, 2 hits for `finalizeSubagentTurn`
- [x] `.planning/ROADMAP.md` modified — confirmed, 0 hits for `isSubagent: true`
- [x] `isSubagent?: boolean` absent from REQUIREMENTS.md — confirmed
- [x] `TURN-06` present in ROADMAP Phase 5 Requirements line — confirmed
- [x] Task 1 commit: `340bf5d2a`
- [x] Task 2 commit: `5aa31430d`
