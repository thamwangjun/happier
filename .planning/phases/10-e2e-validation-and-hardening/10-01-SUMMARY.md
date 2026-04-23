---
phase: 10-e2e-validation-and-hardening
plan: "01"
subsystem: monitoring
tags: [prometheus, prom-client, socket.io, metrics, resilience, testkit]

# Dependency graph
requires:
  - phase: 09-resilience-wiring
    provides: unackedBuffer.ts writeToBuffer/ackBuffer/readBuffer functions and resilienceHandler.ts reconnect-resume/ack-update handlers

provides:
  - Four Prometheus counters: buffer_writes_total, buffer_acks_total, buffer_redeliveries_total, dedup_drops_total
  - Counter increments wired at correct call sites in unackedBuffer.ts and resilienceHandler.ts
  - SocketCollector on()/off() pass-through methods for custom event capture in E2E tests

affects:
  - 10-03 (VALID-01 E2E test uses SocketCollector.on() to listen for replay-complete/buffer-overflow)
  - 10-02 (VALID-02 metrics validation reads these counters via curl /metrics)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Counter declarations at module level in metrics2.ts using 4-space indentation and registers:[register]
    - Metric call sites inside transaction callbacks (bufferWritesTotal fires inside inTx)
    - Socket pass-through methods using 'as any' cast convention matching existing onRpcRequest/rpcRegister

key-files:
  created: []
  modified:
    - apps/server/sources/app/monitoring/metrics2.ts
    - apps/server/sources/app/resilience/unackedBuffer.ts
    - apps/server/sources/app/api/socket/resilienceHandler.ts
    - packages/tests/src/testkit/socketClient.ts

key-decisions:
  - "bufferWritesTotal.inc() fires inside inTx transaction callback so it only counts actual committed writes (STORE-07 guard already returns early for non-user-scoped keys)"
  - "dedupDropsTotal counts entries with seq <= lastAckedSeq via a COUNT query before readBuffer; this is a single indexed query per reconnect event (T-10-02 accepted risk)"
  - "SocketCollector on/off use 2-space indentation matching test package convention (differs from server 4-space convention)"

patterns-established:
  - "Counter import pattern: import { counterName } from '@/app/monitoring/metrics2' using @/ absolute path"
  - "SocketCollector pass-through pattern: delegate to private socket with 'event as any, listener as any' casts"

requirements-completed:
  - VALID-02

# Metrics
duration: 3min
completed: 2026-04-23
---

# Phase 10 Plan 01: Prometheus Resilience Counters and SocketCollector Extensions Summary

**Four Prometheus counters (buffer_writes_total, buffer_acks_total, buffer_redeliveries_total, dedup_drops_total) wired at correct call sites in the resilience layer, plus SocketCollector on()/off() pass-through for E2E test event capture**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-23T07:51:06Z
- **Completed:** 2026-04-23T07:54:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Added four exported Counter instances to metrics2.ts following the existing module-level pattern (4-space indent, registers:[register])
- Wired bufferWritesTotal.inc() inside the inTx callback in writeToBuffer and bufferAcksTotal.inc() after deleteMany in ackBuffer
- Added dedup counting (db.unackedMessage.count for seq <= lastAckedSeq) and dedupDropsTotal.inc(dupCount) before readBuffer call in resilienceHandler.ts; added bufferRedeliveriesTotal.inc() per replayed message in the replay loop
- Added public on()/off() pass-through methods to SocketCollector using the established 'as any' cast convention

## Task Commits

Each task was committed atomically:

1. **Task 1: Add four Prometheus counters to metrics2.ts** - `5bd3ec48d` (feat)
2. **Task 2: Wire counter calls into unackedBuffer.ts and resilienceHandler.ts** - `689d03355` (feat)
3. **Task 3: Add on()/off() pass-through methods to SocketCollector** - `8e69eed58` (feat)

## Files Created/Modified

- `apps/server/sources/app/monitoring/metrics2.ts` - Added bufferWritesTotal, bufferAcksTotal, bufferRedeliveriesTotal, dedupDropsTotal Counter exports
- `apps/server/sources/app/resilience/unackedBuffer.ts` - Imported and wired bufferWritesTotal/bufferAcksTotal at write and ack call sites
- `apps/server/sources/app/api/socket/resilienceHandler.ts` - Imported db and bufferRedeliveriesTotal/dedupDropsTotal; added dedup count query and counter increments
- `packages/tests/src/testkit/socketClient.ts` - Added public on(event, listener) and off(event, listener) methods to SocketCollector

## Decisions Made

- bufferWritesTotal.inc() fires inside inTx so it only counts committed writes — the STORE-07 guard returning early for non-user-scoped keys means this counter accurately reflects buffered user-scoped writes only
- dedupDropsTotal uses a COUNT query (single indexed query per reconnect event) rather than re-reading rows, consistent with T-10-02 accepted risk in the threat model
- SocketCollector on/off methods use 2-space indentation matching existing test package convention

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Pre-existing TypeScript build failures exist in the server (missing `zod` module in packages/protocol, missing `fastify-type-provider-zod`). These are unrelated to this plan's changes. The files modified in this plan (metrics2.ts, unackedBuffer.ts) have no TypeScript errors. resilienceHandler.ts had two pre-existing errors (REPLAY_START and UPDATE missing from SOCKET_RESILIENCE_EVENTS type — present before this plan's changes).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All four counters are declared and wired; curl /metrics on the relay will return buffer_writes_total, buffer_acks_total, buffer_redeliveries_total, dedup_drops_total
- SocketCollector.on()/off() are available for Plan 10-03 E2E tests to register listeners for SOCKET_RESILIENCE_EVENTS.REPLAY_COMPLETE and BUFFER_OVERFLOW
- Plan 10-02 (VALID-02 metrics validation) can now verify counter increments via the Prometheus /metrics endpoint

## Self-Check

Checking created files exist and commits are present.

## Threat Flags

None - no new network endpoints, auth paths, file access patterns, or schema changes introduced. The dedupDropsTotal db.count() query operates on an existing indexed table with already-validated userId scope (T-10-02 accepted in threat model).

---
*Phase: 10-e2e-validation-and-hardening*
*Completed: 2026-04-23*
