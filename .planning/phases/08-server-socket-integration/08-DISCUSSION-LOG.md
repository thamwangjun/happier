# Phase 8: Server Socket Integration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-22
**Phase:** 08-server-socket-integration
**Areas discussed:** Handler file placement, Integration test Redis strategy, TDD plan split

---

## Handler file placement

| Option | Description | Selected |
|--------|-------------|----------|
| New resilienceHandler.ts | Follows existing pattern: sessionUpdateHandler.ts, rpcHandler.ts, machineUpdateHandler.ts are separate files. Keeps socket.ts clean, resilience logic isolated and testable. | ✓ |
| Inline in socket.ts | Fewer files, but socket.ts already imports 9 handlers — adds reconnect logic in a file that's harder to test in isolation. | |
| You decide | Claude picks based on codebase consistency. | |

**User's choice:** New resilienceHandler.ts (Recommended)
**Notes:** Consistent with all existing handler files. socket.ts registers it the same way as the others.

---

## Integration test Redis strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Conditional skip when Redis unavailable | Follow the existing socket.redisAdapter.integration.spec.ts pattern — skips cleanly in CI without Redis, runs when Redis is available. No new infra requirements. | ✓ |
| Always-run with test-managed Redis | Use a test fixture or Docker Compose to spin up Redis for every test run. More thorough but requires infra changes. | |
| You decide | Claude picks the approach matching existing test infrastructure. | |

**User's choice:** Conditional skip when Redis unavailable (Recommended)
**Notes:** Pragmatic for a dev fork. Follows the existing pattern exactly.

---

## TDD plan split

| Option | Description | Selected |
|--------|-------------|----------|
| RED/GREEN two-plan split | Plan A writes all failing integration tests (SRVR-01 through SRVR-10 coverage). Plan B implements resilienceHandler.ts and emitUpdate() wiring to make them green. Same discipline as Phases 6 and 7. | ✓ |
| Single-pass plan | Write tests and implementation together. Faster to describe but loses RED phase contract-first discipline. | |

**User's choice:** RED/GREEN two-plan split (Recommended)
**Notes:** Follows the established TDD discipline from Phase 6 (protocol) and Phase 7 (storage layer).

---

## Claude's Discretion

- `retentionStart` query implementation (MIN(seq) vs first result of readBuffer)
- Whether `resilienceHandler.ts` exports a single function or separate named exports per event
- SRVR-07 regression guard structure in the test file

## Deferred Ideas

None — discussion stayed within phase scope.
