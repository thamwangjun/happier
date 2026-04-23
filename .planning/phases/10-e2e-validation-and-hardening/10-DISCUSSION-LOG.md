# Phase 10: E2E Validation and Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-23
**Phase:** 10-e2e-validation-and-hardening
**Areas discussed:** E2E test scope, Prometheus counters, Load test format, Doze QA checklist

---

## E2E test scope

| Option | Description | Selected |
|--------|-------------|----------|
| New file in core-e2e/ | reconnect.resilience.e2e.test.ts — focused test for the resilience protocol layer | ✓ |
| Extend midstreamStorm | Add resilience assertions to existing reconnect.midstreamStorm.test.ts | |

**User's choice:** New file in core-e2e/

---

| Option | Description | Selected |
|--------|-------------|----------|
| Protocol events + exactly-once | Assert reconnect-resume sent with lastAckedSeq, replay-complete received, no duplicate seqs | ✓ |
| Transcript convergence only | Verify final message set matches expected (same as midstreamStorm) | |
| You decide | Claude picks assertions | |

**User's choice:** Protocol events + exactly-once

---

## Prometheus counters

| Option | Description | Selected |
|--------|-------------|----------|
| Add to metrics2.ts | All counters in one place, existing prom-client pattern | ✓ |
| New resilience/resilienceMetrics.ts | Co-located with resilienceHandler.ts | |
| You decide | Claude picks based on call sites | |

**User's choice:** Add to metrics2.ts

---

## Load test format

| Option | Description | Selected |
|--------|-------------|----------|
| New file in stress/ | buffer.walContention.stress.test.ts — focused on SQLite WAL contention | ✓ |
| Extend reconnect.chaos.test.ts | Buffer-active variant in existing chaos test | |

**User's choice:** New file in stress/

---

| Option | Description | Selected |
|--------|-------------|----------|
| JSON artifact via FailureArtifacts | Same pattern as midstreamStorm/chaos; opt-in save on success | ✓ |
| Committed markdown file | Claude runs test, commits docs/load-test-results.md | |
| You decide | Claude picks based on testkit fit | |

**User's choice:** JSON artifact via FailureArtifacts pattern

---

## Doze QA checklist

| Option | Description | Selected |
|--------|-------------|----------|
| docs/android-doze-qa-checklist.md | Standalone file in docs/, linked from PROTOCOL_CHANGES.md | ✓ |
| Section in docs/PROTOCOL_CHANGES.md | One file for all v1.3 docs | |

**User's choice:** docs/android-doze-qa-checklist.md

---

| Option | Description | Selected |
|--------|-------------|----------|
| Foreground + background + Doze | 3 scenarios covering MOB-05 and MOB-06 | ✓ |
| All 4 Android lifecycle transitions | Adds app force-quit + MMKV persistence verification | |
| You decide | Claude scopes from acceptance criteria | |

**User's choice:** Foreground + background + Doze (3 scenarios)

---

## Claude's Discretion

- Whether to extract a `createResilienceSocketCollector` testkit helper or inline event capture in the test
- Exact load parameters for WAL contention stress test (message volume, concurrency)

## Deferred Ideas

None
