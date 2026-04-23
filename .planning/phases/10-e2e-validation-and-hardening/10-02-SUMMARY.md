---
phase: 10-e2e-validation-and-hardening
plan: "02"
subsystem: testing
tags: [android, doze, qa, checklist, socket, resilience, mob-05, mob-06]

# Dependency graph
requires: []
provides:
  - "docs/android-doze-qa-checklist.md — executable QA checklist for three Android Doze resilience scenarios"
  - "docs/PROTOCOL_CHANGES.md — v1.3 section now links to Doze QA checklist"
affects: [validation, qa, mobile]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - docs/android-doze-qa-checklist.md
  modified:
    - docs/PROTOCOL_CHANGES.md

key-decisions:
  - "Checklist structured with three H2 scenario sections matching D-09: Background/ack-flush, Foreground/reconnect, Doze/socket-resurrection"
  - "ADB not required for Scenarios 1 and 2 (device UI sufficient); ADB blocks are reference-only for automation"
  - "Scenario 2 explicitly warns against checking socket.connected === true — must verify onReconnected call and reconnect-resume in server log"

patterns-established:
  - "QA checklists use markdown checkbox steps + pass/fail tables per scenario"

requirements-completed:
  - VALID-04

# Metrics
duration: 2min
completed: 2026-04-23
---

# Phase 10 Plan 02: Android Doze QA Checklist Summary

**Android Doze QA checklist with three physical-device scenarios (MOB-05 ack flush, MOB-06 reconnect, Doze socket resurrection), linked from PROTOCOL_CHANGES.md v1.3 section**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-23T07:51:11Z
- **Completed:** 2026-04-23T07:52:22Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Created `docs/android-doze-qa-checklist.md` with exactly three scenario sections covering MOB-05 (background ack flush), MOB-06 (foreground reconnect), and Doze socket resurrection
- Each scenario has checkbox steps, a pass/fail table, and ADB reference commands — executable on a physical Android device without ADB for the first two scenarios
- Added test environment fields (device model, OS version, app version, test date, tester) and a results summary table
- Added `Manual QA:` link to the checklist from the v1.3 section of `docs/PROTOCOL_CHANGES.md`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create docs/android-doze-qa-checklist.md** - `cf52f218d` (docs)
2. **Task 2: Link checklist from docs/PROTOCOL_CHANGES.md** - `4a55f3d64` (docs)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `docs/android-doze-qa-checklist.md` - New QA checklist for Android Doze resilience scenarios (VALID-04)
- `docs/PROTOCOL_CHANGES.md` - Added Manual QA link to v1.3 section pointing to android-doze-qa-checklist.md

## Decisions Made
- Placed the PROTOCOL_CHANGES.md link at the end of the v1.3 content block (the file has only one section, no "References" subsection), appending without modifying existing content.
- Scenario 2 includes a "Critical" warning matching RESEARCH.md pitfall P5: testers must check `onReconnected` in mobile logs and `reconnect-resume` in server logs, not `socket.connected === true`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. Physical device and ADB access are prerequisites documented in the checklist itself.

## Next Phase Readiness
- VALID-04 is satisfied: the checklist is version-controlled, covers all three D-09 scenarios, and is executable on a physical Android device without ADB for Scenarios 1 and 2.
- QA engineers can execute the checklist against a physical Android device to validate v1.3 resilience behaviors.

## Self-Check

Checking created files and commits...

- `docs/android-doze-qa-checklist.md` exists: FOUND
- `docs/PROTOCOL_CHANGES.md` link added: FOUND (`android-doze-qa-checklist`)
- Task 1 commit `cf52f218d`: FOUND
- Task 2 commit `4a55f3d64`: FOUND

## Self-Check: PASSED

---
*Phase: 10-e2e-validation-and-hardening*
*Completed: 2026-04-23*
