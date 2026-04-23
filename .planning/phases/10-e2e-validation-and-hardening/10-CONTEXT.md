# Phase 10: E2E Validation and Hardening - Context

**Gathered:** 2026-04-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Prove the full v1.3 resilience loop under realistic conditions: an E2E test that validates the complete reconnect-resume protocol, Prometheus counters for observability, a SQLite WAL load test for contention under high-frequency streaming, and an Android Doze QA checklist for manual device validation. All implementation is in test/observability code — no changes to production resilience logic.

</domain>

<decisions>
## Implementation Decisions

### E2E test (VALID-01)
- **D-01:** New file `packages/tests/suites/core-e2e/reconnect.resilience.e2e.test.ts` — dedicated test file, separate from `reconnect.midstreamStorm.test.ts`. The midstreamStorm test owns transcript convergence; this one owns the resilience protocol layer.
- **D-02:** Test must explicitly assert all three of: (1) `reconnect-resume` was emitted with the correct `lastAckedSeq`, (2) `replay-complete` was received after the socket reconnect, (3) no duplicate `seq` values in the received message stream. These assertions prove the mechanism fired, not just that the outcome was correct.
- **D-03:** Use the existing socket testkit pattern: `createUserScopedSocketCollector`, `startServerLight`, `createTestAuth`, `FailureArtifacts`. Device A = sender; Device B = simulated mobile client that disconnects mid-stream and reconnects.

### Prometheus counters (VALID-02)
- **D-04:** Add all 4 counters to the existing `apps/server/sources/app/monitoring/metrics2.ts`. Same `new Counter({ name: '...', registers: [register] })` pattern as existing counters. No new files. Counter names exactly as specified in REQUIREMENTS.md: `buffer_writes_total`, `buffer_acks_total`, `buffer_redeliveries_total`, `dedup_drops_total`.
- **D-05:** Counters are called from `apps/server/sources/app/resilience/unackedBuffer.ts` (for buffer_writes, buffer_acks, buffer_redeliveries) and from `apps/server/sources/app/api/socket/resilienceHandler.ts` (for dedup_drops).

### Load test (VALID-03)
- **D-06:** New file `packages/tests/suites/stress/buffer.walContention.stress.test.ts` — separate from `reconnect.chaos.test.ts`. Focused specifically on SQLite WAL contention under high-frequency `UnackedMessageBuffer` writes. The chaos test stays general; this one targets the write-heavy buffer scenario.
- **D-07:** Report format follows the FailureArtifacts pattern (same as `reconnect.chaos.test.ts` and `reconnect.midstreamStorm.test.ts`). JSON artifacts saved via `FailureArtifacts`; opt-in on success via `HAPPIER_E2E_SAVE_ARTIFACTS` env flag. Not committed to git directly — the test file itself is the version-controlled artifact.

### Android Doze QA checklist (VALID-04)
- **D-08:** Standalone file `docs/android-doze-qa-checklist.md` in the docs/ directory. Link to it from `docs/PROTOCOL_CHANGES.md`.
- **D-09:** Checklist covers exactly 3 transition scenarios: (1) **Background/ack-flush** — app moves to background mid-session, verify synchronous ack flush fires (MOB-05); (2) **Foreground/reconnect** — app returns to foreground, verify socket disconnect+reconnect fires regardless of `socket.connected` state (MOB-06); (3) **Doze/socket-resurrection** — Doze mode engaged, socket killed by OS, verify reconnect-resume fires with correct `lastAckedSeq` on revival.
- **D-10:** Checklist format: markdown with checkbox steps per scenario, pass/fail column, and fields for device model/OS version/date. Executable on physical Android device; ADB not required.

### Claude's Discretion
- Whether to add a test helper to `packages/tests/src/testkit/` for capturing resilience socket events (e.g., `createResilienceSocketCollector`) or inline the event capture in the test file — follow the simplest pattern that satisfies the VALID-01 assertions.
- Exact load parameters for the WAL contention stress test (message volume, concurrency, duration) — size to trigger WAL pressure but complete in CI-reasonable time.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §E2E Validation and Hardening — VALID-01 through VALID-04 (authoritative requirement IDs for this phase)

### Roadmap
- `.planning/ROADMAP.md` §Phase 10 — success criteria (4 criteria: E2E test, curl /metrics counters, load test, Doze checklist)

### Protocol (from Phase 6)
- `packages/protocol/src/socketResilience.ts` — `SOCKET_RESILIENCE_EVENTS` const (`reconnect-resume`, `ack-update`, `replay-complete`, `buffer-overflow`), `ReconnectResumeRequestSchema`, `AckUpdateRequestSchema`

### Phase 7–8 server output (what the E2E test exercises)
- `apps/server/sources/app/resilience/unackedBuffer.ts` — buffer operations called by resilienceHandler; where buffer_writes/acks/redeliveries counters are added
- `apps/server/sources/app/api/socket/resilienceHandler.ts` — socket event handlers; where dedup_drops counter is added; emits `buffer-overflow`, `retentionStart`, replayed messages, `replay-complete`

### Existing monitoring infrastructure
- `apps/server/sources/app/monitoring/metrics2.ts` — existing Counter/Gauge/Histogram pattern; 4 new counters added here
- `apps/server/sources/app/monitoring/metrics.ts` — metrics server wiring (GET /metrics endpoint)

### Existing test infrastructure to follow
- `packages/tests/suites/core-e2e/reconnect.midstreamStorm.test.ts` — reference pattern for the E2E test structure (socket collector, FailureArtifacts, waitFor)
- `packages/tests/suites/stress/reconnect.chaos.test.ts` — reference pattern for the stress test structure
- `packages/tests/src/testkit/socketClient.ts` — `createUserScopedSocketCollector` used by E2E tests
- `packages/tests/src/testkit/failureArtifacts.ts` — FailureArtifacts pattern for JSON report saving

### Phase 9 mobile output (what VALID-04 manually validates)
- `apps/ui/sources/sync/engine/resilience/` — resilience module; VALID-04 validates MOB-05 and MOB-06 behavior on physical device
- `apps/ui/sources/sync/sync.ts` — AppState foreground/background handlers and isReplaying flag

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createUserScopedSocketCollector` in `packages/tests/src/testkit/socketClient.ts`: captures all socket events including custom resilience events — use to assert `reconnect-resume` emission and `replay-complete` receipt in VALID-01
- `FailureArtifacts` in `packages/tests/src/testkit/failureArtifacts.ts`: JSON artifact pattern used by both midstreamStorm and chaos tests — use for VALID-01 and VALID-03
- `startServerLight` + `createTestAuth` + `createSession` in `packages/tests/src/testkit/`: full test harness already established; VALID-01 and VALID-03 follow the same setup
- `new Counter({ name: '...', registers: [register] })` pattern in `metrics2.ts`: copy-paste-ready for the 4 new buffer counters
- `waitFor` in `packages/tests/src/testkit/timing.ts`: async condition polling used in all reconnect tests — use to wait for `replay-complete` event

### Established Patterns
- All E2E/stress tests in `packages/tests/suites/` use `startServerLight` for SQLite mode (required for CI)
- `FailureArtifacts.json(filename, fn)` pattern: register artifact producers at test start, they auto-save on failure
- `envFlag(['HAPPIER_E2E_SAVE_ARTIFACTS', 'HAPPY_E2E_SAVE_ARTIFACTS'], false)`: save-on-success toggle; use in both new tests

### Integration Points
- `unackedBuffer.ts` write path → increment `bufferWritesTotal.inc()` on each `writeToBuffer` call
- `unackedBuffer.ts` ack path → increment `bufferAcksTotal.inc()` on each `ackBuffer` call
- `resilienceHandler.ts` replay path → increment `bufferRedeliveriesTotal.inc()` per replayed message
- `resilienceHandler.ts` dedup path → increment `dedupDropsTotal.inc()` when a duplicate seq is detected and dropped

</code_context>

<specifics>
## Specific Ideas

- VALID-01 test must verify that after Device B reconnects, `reconnect-resume` was sent with the `lastAckedSeq` that matches the last ack Device B sent before disconnecting — not just that _some_ `reconnect-resume` was sent.
- The Doze checklist should document the ADB commands used to simulate Doze mode (even though ADB isn't required for the checklist itself) — useful context for future QA automation.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 10-e2e-validation-and-hardening*
*Context gathered: 2026-04-23*
