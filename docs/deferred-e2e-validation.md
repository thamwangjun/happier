# Deferred E2E Validation — Post v1.3 Milestone

This document tracks E2E and physical-device tests that were scoped, designed, or partially executed during the v1.3 Request Resilience milestone but intentionally deferred for execution in a future milestone dedicated to full E2E validation and fixes.

**Why deferred:** These tests require physical Android hardware, a live Redis instance, or multi-device coordination that cannot be automated in CI. The automated counterparts (unit + integration tests) pass. These items are not blockers for shipping v1.3 but should be the first work in a future "E2E Validation & QA" milestone.

---

## Verification Debt

Items marked `human_needed` in phase VERIFICATION.md files. The automated verification scored **18/20 must-haves** across the milestone; the 2 remaining items are environment constraints, not implementation failures.

### Phase 08 — Server Socket Integration (score: 7/8)

| # | Requirement | Status | Blocker |
|---|-------------|--------|---------|
| SRVR-07 | `sessionClient.startupCatchUpRetry.test.ts` passes unchanged (CLI regression gate) | ? NEEDS HUMAN | `yarn` not on PATH in verification environment; CLI `globalSetup` calls `spawnSync yarn` to pre-build protocol packages. The test file itself has no imports from server resilience code — low implementation risk. |
| SRVR-05 | Postgres/Redis mode integration test runs and passes | ? NEEDS HUMAN | `describe.skipIf(!REDIS_URL)` block skipped — no Redis instance available. Test logic is structurally identical to the passing SQLite path. |

**How to clear SRVR-07:**
```bash
cd apps/cli && yarn test
# Expected: 2/2 tests pass in sessionClient.startupCatchUpRetry.test.ts
```

**How to clear SRVR-05:**
```bash
REDIS_URL=redis://localhost:6379 cd apps/server && \
  npx vitest --config vitest.integration.config.ts --reporter verbose \
  sources/app/api/socket/resilienceHandler.integration.spec.ts
# Expected: 10 passed, 0 skipped, 1 todo
```

---

### Phase 10 — E2E Validation and Hardening (score: 11/12)

| # | Requirement | Status | Blocker |
|---|-------------|--------|---------|
| VALID-04 | Android Doze QA checklist executed on physical device | ? NEEDS HUMAN | Requires USB-connected Android device with ADB. MOB-05/MOB-06/Doze socket resurrection cannot be exercised from CI. |

All other Phase 10 truths are verified: Prometheus counters wired (VALID-02), E2E reconnect test passing (VALID-01), WAL contention stress test 200/200 (VALID-03).

**How to clear VALID-04:** See [Android Doze QA Checklist](./android-doze-qa-checklist.md) — execute all three scenarios.

---

## Deferred Items

### 1. Android Doze QA — Physical Device Execution

**Requirement:** VALID-04  
**Phase:** 10 — E2E Validation and Hardening  
**Checklist:** `docs/android-doze-qa-checklist.md`

The checklist is complete and in version control. It was not executed on a physical device before milestone close.

**Scenarios to execute:**

| # | Scenario | Requirement | Pass Criteria |
|---|----------|-------------|---------------|
| 1 | Background / Ack Flush | MOB-05 | `ack-update` arrives at server within 5s of app going to background; buffer cleared to last applied seq |
| 2 | Foreground / Reconnect | MOB-06 | `onReconnected` fires regardless of `socket.connected` state; new `reconnect-resume` reaches server |
| 3 | Doze / Socket Resurrection | MOB-05+06 | After `force-idle` + 5min + exit, `reconnect-resume` carries MMKV-persisted `lastAckedSeq`; `replay-complete` received; no missing or duplicate messages |

**Setup needed:** Physical Android device with USB debugging, ADB, server running with resilience buffer enabled.

**ADB commands:** See `docs/android-doze-qa-checklist.md` → Scenario 3 for exact commands.

---

### 2. Prometheus Metrics — Live Reconnect Verification

**Requirement:** VALID-02  
**Phase:** 10 — E2E Validation and Hardening

Counter wiring is verified statically (grep + TypeScript build). A full live verification — `curl /metrics` on the relay during a simulated reconnect showing all four counters incrementing — was not run end-to-end.

**What to do:** With server running, trigger a reconnect-resume flow (disconnect device B, send messages from A, reconnect B), then `curl http://localhost:<port>/metrics` and confirm:
- `buffer_writes_total` incremented by the number of buffered messages
- `buffer_acks_total` incremented on reconnect ack
- `buffer_redeliveries_total` incremented per replayed message
- `dedup_drops_total` incremented for already-acked entries

---

### 3. Resilience Integration Spec — Postgres/Redis Mode

**Requirement:** SRVR-05 (from Phase 8)  
**Phase:** 08 — Server Socket Integration  
**Status:** Passed in Phase 8 UAT, but the `describe.skipIf(!REDIS_URL)` block is skipped in CI (no Redis).

**What to do:** In a future E2E environment with Redis available:
```bash
REDIS_URL=<redis-url> cd apps/server && npx vitest --config vitest.integration.config.ts \
  sources/app/api/socket/resilienceHandler.integration.spec.ts
```
Confirm the Postgres/Redis describe block runs and passes.

---

### 4. CLI Regression Gate — `yarn` Environment

**Requirement:** SRVR-07
**Phase:** 08 — Server Socket Integration

The CLI test suite (`apps/cli && yarn test`) could not be executed in the verification environment because `yarn` was not on PATH. The CLI `globalSetup` calls `spawnSync yarn` to pre-build protocol packages; vitest fails at startup with ENOENT before any test runs.

`sessionClient.startupCatchUpRetry.test.ts` only tests `ApiSessionClient.scheduleNextStartupMessageCatchUpRetry` and has no imports from any server resilience file — so implementation risk is very low, but the passing test has not been confirmed on this branch.

**What to do:**
```bash
cd apps/cli && yarn test
```
Expected: `sessionClient.startupCatchUpRetry.test.ts` reports 2/2 tests passing.

---

## Suggested Future Milestone: "E2E Validation & Device QA"

**Goal:** Execute all deferred physical-device and live-infrastructure tests from v1.3, fix any failures found, and establish an ongoing E2E validation protocol.

**Phases to consider:**
1. **Android device lab setup** — CI-connected device or emulator with Doze simulation support
2. **Execute Android Doze QA checklist** — run all 3 scenarios, fix any failures
3. **Live Prometheus metrics validation** — full reconnect-resume flow with counter verification
4. **Redis/Postgres integration test suite** — run full integration suite with live Redis
5. **Fix cycle** — address any failures found in the above

**Entry criteria:** v1.3 merged to main, test environment with physical Android device and Redis available.

---

*Created: 2026-04-23 — Phase 10 close*  
*Milestone: v1.3 Request Resilience*
