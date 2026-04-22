# Phase 7: Server Storage Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-22
**Phase:** 07-server-storage-layer
**Areas discussed:** Module placement, Retention sweep integration, connectionKey definition, Schema fields for UnackedMessage

---

## Module placement

| Option | Description | Selected |
|--------|-------------|----------|
| `sources/app/resilience/` | Application module alongside retention/. Owns cap enforcement, CLI exclusion, and overflow signal. Matches existing pattern for domain logic with TTL/sweep concerns. | ✓ |
| `sources/storage/unackedBuffer/` | Pure storage layer alongside seq.ts and simpleCache.ts. Simpler location, but mixes business rules into a layer that currently has none. | |

**User's choice:** `sources/app/resilience/`
**Notes:** Advisor research confirmed that all business rules (cap enforcement, CLI exclusion, overflow signal) belong in the application layer, not the storage layer.

---

## Retention sweep integration

| Option | Description | Selected |
|--------|-------------|----------|
| New rule in retentionRuleRegistry.ts reading env var | `createUnackedMessageRetentionRule()` calls `getRelayBufferTtlMsFromEnv()` directly. Minimal change, same source of truth as the buffer write path. | ✓ |
| Extend RetentionPolicy type with buffer TTL field | Add `bufferTTL` to the policy config, wire through existing policy system. Unified but adds abstraction overhead for what is already an env var. | |
| Standalone periodic sweep | Buffer owns its own cleanup schedule. Ruled out — requirement specifies "existing retention worker." | |

**User's choice:** New rule in retentionRuleRegistry.ts reading env var directly
**Notes:** STORE-06 requires "swept by the existing retention worker using the same TTL constant as the buffer." Option A satisfies this without changing RetentionPolicy type.

---

## connectionKey definition

| Option | Description | Selected |
|--------|-------------|----------|
| Socket.IO room name prefix (`user-scoped:${userId}`) | Aligns with emit routing; CLI exclusion is implicit since machine-scoped and session-scoped rooms are never written. Matches STATE.md documented intent. | ✓ |
| userId only | Simpler schema. CLI exclusion enforced by connectionType check at every write site. Buffer is purely per-user with no room discriminator. | |
| Explicit enum (`'mobile'` / `'web'` / `'cli-session'` / `'cli-machine'`) | Clearest schema intent but introduces bidirectional mapping maintenance. | |

**User's choice:** Socket.IO room name prefix (`user-scoped:${userId}`)
**Notes:** STATE.md already described the key as "user-scoped:{userId}". Advisor research confirmed this aligns with the existing emit path and satisfies STORE-07 success criterion #6 by construction.

---

## Schema fields for UnackedMessage

| Option | Description | Selected |
|--------|-------------|----------|
| `createdAt` only (retention rule computes cutoff) | Retention rule: `DELETE WHERE createdAt < now - RELAY_BUFFER_TTL_MS`. Zero schema coupling to TTL value. Matches all existing functional-data retention rules. | ✓ |
| `expiresAt` column (pre-computed at insert) | `expiresAt = createdAt + RELAY_BUFFER_TTL_MS`. Simpler query but requires schema migration if TTL changes. | |

**User's choice:** `createdAt` only
**Notes:** Every existing functional-data retention rule (sessions, accountChanges, userFeedItems) uses the compute-cutoff-at-sweep-time pattern. Adding `expiresAt` would be the first pre-computed TTL on functional data and would couple the schema to the runtime constant.

---

## Claude's Discretion

- Cap enforcement atomicity (trim-on-write vs count-check-then-delete)
- `ClientAckState` exact field names and indexes
- Whether to use `inTx` wrapper for buffer write + trim
- TDD plan structure and RED/GREEN cycle breakdown

## Deferred Ideas

None — discussion stayed within phase scope.
