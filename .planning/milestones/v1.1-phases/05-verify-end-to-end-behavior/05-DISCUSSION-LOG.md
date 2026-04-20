# Phase 5: Verify End-to-End Behavior - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-20
**Phase:** 05-verify-end-to-end-behavior
**Areas discussed:** SC-3 baseline regression test, TURN-06 test level, SC-1 verification artifact, Multi-subagent scenario

---

## SC-3 Baseline Regression Test

| Option | Description | Selected |
|--------|-------------|----------|
| subagentTurnCompletion.test.ts | Add alongside TEST-01/02/03 in existing file | |
| No new test needed | Existing postResultStreaming/streamEvents tests cover implicitly | |
| New file: claudeRemoteAgentSdk.baselineTurnCompletion.test.ts | Separate file for TURN-06 baseline | ✓ |

**User's choice:** New file: `claudeRemoteAgentSdk.baselineTurnCompletion.test.ts`
**Notes:** User requested investigation into where existing parent turn completion tests live before deciding. Found that `streamEvents.test.ts` and `postResultStreaming.test.ts` cover the parent path but without explicit TURN-06 labeling or isolated bare-result assertion.

---

## TURN-06 Test Level

| Option | Description | Selected |
|--------|-------------|----------|
| Unit test with mock onReady | Mock onReady, assert call count — relay is downstream | ✓ |
| Integration test against relay server | Spin up relay, drive real sequence, assert relay events | |
| Claude's discretion | Let planner decide | |

**User's choice:** Unit test with mock onReady
**Notes:** Relay server is downstream of onReady — unit-level assertion is the correct boundary.

---

## SC-1 Verification Artifact

| Option | Description | Selected |
|--------|-------------|----------|
| Reference Phase 4's verification only | Cite Phase 4 VERIFICATION.md, don't re-inspect | |
| Re-verify in Phase 5's own VERIFICATION.md | Phase 5 writes self-contained code inspection | ✓ |
| Claude's discretion | Let verifier decide | |

**User's choice:** Re-verify in Phase 5's own VERIFICATION.md

---

## Multi-Subagent Scenario

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, add to subagentTurnCompletion.test.ts | Subagent behavior — fits existing file | |
| Yes, add to baselineTurnCompletion.test.ts | Group all onReady count assertions in new file | ✓ |
| No, out of scope for Phase 5 | Not in success criteria | |

**User's choice:** Add to new `baselineTurnCompletion.test.ts`
**Notes:** User raised the multi-subagent case unprompted during the "Ready to create context?" check — recognized a gap in TEST-02 (which only covers 1 subagent + 1 parent). Added as D-03.

---

## Claude's Discretion

- Test helper design in `baselineTurnCompletion.test.ts` (shared factory vs inline fixtures)

## Deferred Ideas

None.
