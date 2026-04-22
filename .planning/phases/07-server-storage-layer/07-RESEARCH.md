# Phase 7: Server Storage Layer - Research

**Researched:** 2026-04-22
**Domain:** Prisma schema extension, application-layer buffer module, retention rule integration, Vitest unit testing with db mocks
**Confidence:** HIGH

## Summary

Phase 7 implements the server-side unacked message buffer as a pure application module with no socket handler wiring (that is Phase 8). The buffer must: persist `UpdatePayload` entries per `(userId, connectionKey)`, enforce a cap of 500 entries (oldest evicted on overflow), enforce a 2-minute TTL via the existing retention worker, discard entries on ack, signal overflow on reconnect, and exclude CLI connection types.

All six success criteria must be provable via Vitest unit tests that mock the DB client — no live database needed. The test pattern is already established in the codebase: `createDbMocks` + `installDbModuleMock` from `apps/server/sources/app/api/testkit/dbMocks.ts`.

**Two critical structural findings discovered by codebase inspection:**

1. **`createDeleteManyRetentionRule` cannot be reused directly.** Its `id` type is `Exclude<keyof RetentionDomainPolicies, 'sessions' | 'accountChanges'>`, which means `id` must be an existing key in `RetentionDomainPolicies`. The new `unackedMessages` rule is not in that type. The buffer retention rule must be written as a custom `RetentionRule` object, similar to how `accountChangeRetentionRule.ts` is a custom rule that calls `getRelayBufferTtlMsFromEnv()` directly for its cutoff.

2. **The SQLite schema is auto-generated** from the main `schema.prisma` via `yarn schema:sync`. The script at `apps/server/scripts/schemaSync.ts` strips `(sort: ...)` index directives for SQLite compatibility (line 98: `.replace(/(\w+)\(\s*sort\s*:\s*\w+\s*\)/g, '$1')`). Editing only `apps/server/prisma/schema.prisma` and running `yarn schema:sync` (via `yarn generate`) is the correct workflow — never edit the SQLite schema manually.

**Primary recommendation:** Implement `sources/app/resilience/unackedBuffer.ts` using `inTx` for atomic write+trim, a custom `RetentionRule` object (not `createDeleteManyRetentionRule`), and the established `createDbMocks` test pattern for all unit tests.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `UnackedMessageBuffer` module lives in `sources/app/resilience/` — application module alongside `retention/`. The buffer owns business rules (cap enforcement, CLI exclusion check, overflow signal) that do not belong in the pure-storage layer.
- **D-02:** Add a new `createUnackedMessageRetentionRule()` to `retentionRuleRegistry.ts`. The rule calls `getRelayBufferTtlMsFromEnv()` directly (same function used by the buffer write path) to compute `cutoff = now - RELAY_BUFFER_TTL_MS`. No changes to `RetentionPolicy` type.
- **D-03:** `connectionKey = 'user-scoped:${userId}'` — the Socket.IO room name prefix. CLI exclusion is implicit: machine-scoped and session-scoped rooms are never written.
- **D-04:** `UnackedMessage` uses `createdAt` only — no `expiresAt` column. Retention rule computes cutoff at sweep time. Composite index on `(userId, seq)` for replay queries; index on `createdAt` for TTL sweep.

### Claude's Discretion

- Cap enforcement atomicity — whether to trim-on-write (DELETE oldest within same transaction as INSERT) or count-check-then-delete (two queries). Decide based on SQLite and PostgreSQL compatibility.
- `ClientAckState` model fields and indexes — `userId`, `ackedSeq`, `updatedAt` implied by requirements; exact Prisma field naming is Claude's call.
- Whether to use `inTx` for the buffer write + trim operation — follow the existing transactional pattern.
- TDD plan structure — RED/GREEN cycles for STORE-01 through STORE-07, following Phase 6 precedent.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| STORE-01 | Relay retains unacked outbound messages per `userId` + `connectionKey` for replay after disconnection | Prisma `UnackedMessage` model; `writeToBuffer()` function; `readBuffer()` function |
| STORE-02 | Enforces configurable per-`connectionKey` cap (default 500, `RELAY_BUFFER_CAP`) — prevents OOM | `getRelayBufferCapFromEnv()` confirmed in `sources/config/backends.ts`; trim-on-write inside `inTx` |
| STORE-03 | Enforces configurable TTL (default 2 min, `RELAY_BUFFER_TTL_MS`) — reclaims stale buffers | `getRelayBufferTtlMsFromEnv()` confirmed; custom retention rule sweeps `UnackedMessage.createdAt` |
| STORE-04 | Discards buffer entries at or below acked `seq` when client confirms receipt | `deleteAcked(userId, connectionKey, ackedSeq)` — `deleteMany WHERE seq <= ackedSeq` |
| STORE-05 | Signals `buffer-overflow` on reconnect when buffer was capped | `isOverflowed(userId, connectionKey)` check; `SOCKET_RESILIENCE_EVENTS.BUFFER_OVERFLOW` confirmed in `socketResilience.ts` |
| STORE-06 | Retained messages swept by existing retention worker using same TTL constant | Custom `RetentionRule` added to `retentionRuleRegistry.ts`; calls `getRelayBufferTtlMsFromEnv()` |
| STORE-07 | Buffer applies only to mobile/web `connectionKey` — CLI sockets explicitly excluded | Connection type check at write site: only write when `connectionKey` starts with `'user-scoped:'` |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| UnackedMessage schema | Database / Storage | — | Prisma model; no business logic |
| ClientAckState schema | Database / Storage | — | Prisma model; tracks ack cursor |
| Buffer write + cap trim | API / Backend (App layer) | Database / Storage | Business rule: cap enforcement, CLI exclusion live in `sources/app/resilience/` |
| Buffer read (replay query) | API / Backend (App layer) | Database / Storage | Query: `WHERE userId = ? AND seq > ackedSeq ORDER BY seq ASC` |
| Ack discard | API / Backend (App layer) | Database / Storage | Business rule: `deleteMany WHERE seq <= ackedSeq` |
| Overflow detection | API / Backend (App layer) | — | Pure function: compare buffer length to cap |
| TTL retention sweep | API / Backend (App layer) | Database / Storage | New `RetentionRule` in existing retention worker |
| Overflow event signalling | API / Backend | — | `SOCKET_RESILIENCE_EVENTS.BUFFER_OVERFLOW` from Phase 6 protocol |

---

## Standard Stack

### Core (all verified in codebase)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma ORM | (project's existing version) | Schema models + typed DB client | Project standard; all DB access goes through Prisma |
| Vitest | (project's existing version) | Unit testing | Project standard; `vitest.config.ts` confirmed |
| Zod | (project's existing version) | Schema validation | Project standard for all payload types |

[VERIFIED: codebase grep] All libraries are already installed. No new dependencies required for Phase 7.

### Key Functions (all confirmed present in codebase)

| Function | File | Status |
|----------|------|--------|
| `getRelayBufferCapFromEnv(env)` | `sources/config/backends.ts` | [VERIFIED: file read] exists, returns 500 default |
| `getRelayBufferTtlMsFromEnv(env)` | `sources/config/backends.ts` | [VERIFIED: file read] exists, returns 120000 default |
| `inTx(fn)` | `sources/storage/inTx.ts` | [VERIFIED: file read] wraps transactions, retries on SQLite BUSY |
| `afterTx(tx, cb)` | `sources/storage/inTx.ts` | [VERIFIED: file read] schedules post-commit callbacks |
| `SOCKET_RESILIENCE_EVENTS.BUFFER_OVERFLOW` | `packages/protocol/src/socketResilience.ts` | [VERIFIED: file read] value is `'buffer-overflow'` |
| `SOCKET_RESILIENCE_EVENTS.REPLAY_COMPLETE` | `packages/protocol/src/socketResilience.ts` | [VERIFIED: file read] value is `'replay-complete'` |
| `createDbMocks` + `installDbModuleMock` | `sources/app/api/testkit/dbMocks.ts` | [VERIFIED: file read] standard test utility |

---

## Architecture Patterns

### System Architecture Diagram

```
Phase 7 scope (unit-testable, no socket handlers):

  writeToBuffer(userId, connectionKey, payload)
       │
       ├─ Guard: connectionKey.startsWith('user-scoped:') → else skip (STORE-07)
       │
       └─ inTx(tx):
              ├─ tx.unackedMessage.create({ userId, connectionKey, seq, payload, createdAt })
              └─ tx.unackedMessage.deleteMany (oldest WHERE COUNT > cap) (STORE-02)
                       │
                       ▼
              UnackedMessage table (Prisma)

  readBuffer(userId, connectionKey, afterSeq)
       │
       └─ db.unackedMessage.findMany({ WHERE userId AND seq > afterSeq, ORDER BY seq ASC })

  ackBuffer(userId, connectionKey, ackedSeq)
       │
       └─ db.unackedMessage.deleteMany({ WHERE userId AND connectionKey AND seq <= ackedSeq })

  isOverflowed(userId, connectionKey, cap)
       │
       └─ Overflow flag: written during writeToBuffer when trim was needed (cap-exceeded flag in ClientAckState, or count query at reconnect)

  Retention worker (existing, runs on interval):
       └─ createUnackedMessageRetentionRule()
              └─ db.unackedMessage.deleteMany({ WHERE createdAt < now - RELAY_BUFFER_TTL_MS })
```

### Recommended Module Structure

```
sources/app/resilience/
├── unackedBuffer.ts          # public API: writeToBuffer, readBuffer, ackBuffer, isOverflowed
├── unackedBuffer.spec.ts     # unit tests for STORE-01 through STORE-07
└── unackedMessageRetentionRule.ts  # createUnackedMessageRetentionRule()
```

Registration point (existing file):
```
sources/app/retention/runtime/retentionRuleRegistry.ts  # add createUnackedMessageRetentionRule()
```

Schema (existing files to edit):
```
apps/server/prisma/schema.prisma  # add UnackedMessage + ClientAckState models
# SQLite schema auto-generated via yarn schema:sync — DO NOT edit manually
```

### Pattern 1: DB Mock Pattern (for unit tests)

All unit tests in this phase mock the DB — no live DB required. Established pattern from `createDeleteManyRetentionRule.spec.ts`:

```typescript
// Source: apps/server/sources/app/api/testkit/dbMocks.ts (verified)
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbMocks, installDbModuleMock } from '@/app/api/testkit/dbMocks';

const dbMocks = createDbMocks({
    unackedMessage: ['create', 'findMany', 'deleteMany', 'count'],
    clientAckState: ['upsert', 'findUnique'],
} as const);

installDbModuleMock({ db: dbMocks.db });

describe('unackedBuffer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('writes N messages and reads them back in insertion order', async () => {
        dbMocks.db.unackedMessage.findMany.mockResolvedValue([
            { id: '1', seq: 1, payload: { id: 'x', seq: 1, body: {}, createdAt: 0 }, createdAt: new Date() },
        ]);
        const { readBuffer } = await import('./unackedBuffer');
        const result = await readBuffer('user-1', 'user-scoped:user-1', 0);
        expect(result).toHaveLength(1);
    });
});
```

**Important:** Use `await import('./unackedBuffer')` inside each test (dynamic import after mock installation). This is the established pattern in this codebase — see `createDeleteManyRetentionRule.spec.ts` line 52.

### Pattern 2: inTx for Atomic Write + Trim

```typescript
// Source: apps/server/sources/storage/inTx.ts (verified)
import { inTx } from '@/storage/inTx';
import type { Tx } from '@/storage/inTx';

export async function writeToBuffer(
    userId: string,
    connectionKey: string,
    payload: UpdatePayload,
    cap: number,
): Promise<{ overflow: boolean }> {
    if (!connectionKey.startsWith('user-scoped:')) {
        return { overflow: false }; // STORE-07: CLI exclusion
    }

    return await inTx(async (tx: Tx) => {
        await (tx as any).unackedMessage.create({
            data: {
                userId,
                connectionKey,
                seq: payload.seq,
                payload: payload as any, // Json field
                createdAt: new Date(),
            },
        });

        // Trim to cap: delete oldest entries exceeding cap
        const count = await (tx as any).unackedMessage.count({
            where: { userId, connectionKey },
        });
        const overflow = count > cap;
        if (overflow) {
            const excess = count - cap;
            const oldest = await (tx as any).unackedMessage.findMany({
                where: { userId, connectionKey },
                orderBy: { seq: 'asc' },
                take: excess,
                select: { id: true },
            });
            await (tx as any).unackedMessage.deleteMany({
                where: { id: { in: oldest.map((r: any) => r.id) } },
            });
        }
        return { overflow };
    });
}
```

**Note on atomicity:** Trim-on-write inside a single `inTx` transaction is the correct approach. On PostgreSQL, `inTx` uses Serializable isolation. On SQLite, `inTx` uses the default transaction (no isolation level override) and retries on BUSY/lock errors up to 8 times.

### Pattern 3: Custom RetentionRule (NOT createDeleteManyRetentionRule)

`createDeleteManyRetentionRule` requires its `id` to be a key of `RetentionDomainPolicies`. The `unackedMessages` domain does not exist in that type. Write a custom rule:

```typescript
// Source pattern: apps/server/sources/app/retention/rules/accountChangeRetentionRule.ts (verified)
import { db } from '@/storage/db';
import { getRelayBufferTtlMsFromEnv } from '@/config/backends';
import type { RetentionRule } from '@/app/retention/runtime/retentionRuleRegistry';

export function createUnackedMessageRetentionRule(): RetentionRule {
    return {
        id: 'unackedMessages',
        run: async ({ batchSize, dryRun, maxDeletesPerRulePerRun, now }) => {
            const ttlMs = getRelayBufferTtlMsFromEnv(process.env);
            const cutoff = new Date(now.getTime() - ttlMs);
            const limit = Math.max(1, Math.min(batchSize, maxDeletesPerRulePerRun));

            const candidates = await db.unackedMessage.findMany({
                where: { createdAt: { lt: cutoff } },
                orderBy: { createdAt: 'asc' },
                take: limit,
                select: { id: true },
            });

            if (dryRun) return { id: 'unackedMessages', deleted: candidates.length };
            if (candidates.length === 0) return { id: 'unackedMessages', deleted: 0 };

            const result = await db.unackedMessage.deleteMany({
                where: {
                    id: { in: candidates.map(r => r.id) },
                    createdAt: { lt: cutoff },
                },
            });
            return { id: 'unackedMessages', deleted: result.count };
        },
    };
}
```

Register in `retentionRuleRegistry.ts` by importing and adding to the array returned by `createRetentionRuleRegistry()`.

**Why not `createDeleteManyRetentionRule`:** Its `RuleDomainId` type is `Exclude<keyof RetentionPolicy['domains'], 'sessions' | 'accountChanges'>`. Adding a new key to `RetentionDomainPolicies` would change the `RetentionPolicy` type — decision D-02 explicitly says "No changes to `RetentionPolicy` type." The custom rule pattern avoids this entirely. [VERIFIED: file read of retentionPolicyTypes.ts and createDeleteManyRetentionRule.ts]

### Anti-Patterns to Avoid

- **Editing `prisma/sqlite/schema.prisma` directly:** It is AUTO-GENERATED by `scripts/schemaSync.ts` from the main schema. Running `yarn generate` (or `yarn schema:sync`) overwrites it. Only edit `prisma/schema.prisma`. [VERIFIED: schemaSync.ts header comment + script logic]
- **Using `createDeleteManyRetentionRule` for the buffer TTL rule:** Type constraint prevents it without touching `RetentionDomainPolicies`. See Pattern 3.
- **Creating database migrations:** The `apps/server/CLAUDE.md` is explicit — `NEVER DO MIGRATION YOURSELF. Only run yarn generate when new types needed.` This applies here; only add models to the schema and run `yarn generate`.
- **Using `(sort: ...)` in the SQLite schema:** The sync script strips sort directives for SQLite. Write them in Postgres schema only; the script handles the difference.
- **Blocking the emit path:** SRVR-01 (Phase 8 boundary) requires fire-and-forget. Phase 7 only defines the storage functions — it does not wire them to the emit path.
- **Importing `@/storage/db` inside `inTx` callback without the tx parameter:** Always use the `tx` parameter passed to the `inTx` callback, not the top-level `db`, for transactional consistency.

---

## Solved Problems

| Problem | Build Nothing — Use Instead | Why |
|---------|-----------------------------|-----|
| Env-var-backed cap and TTL defaults | `getRelayBufferCapFromEnv(process.env)` + `getRelayBufferTtlMsFromEnv(process.env)` from `@/config/backends` | Already implemented and tested in Phase 6 |
| SQLite-compatible retryable transactions | `inTx` from `@/storage/inTx` | Handles P2034/P1008/SQLITE_BUSY with exponential backoff |
| DB module mocking in Vitest | `createDbMocks` + `installDbModuleMock` from `@/app/api/testkit/dbMocks` | Established pattern; avoids live DB in unit tests |
| Overflow/reconnect event names | `SOCKET_RESILIENCE_EVENTS` from `@happier-dev/protocol` | Defined in Phase 6; `BUFFER_OVERFLOW = 'buffer-overflow'`, `REPLAY_COMPLETE = 'replay-complete'` |
| Payload type for JSON storage | `UpdatePayload` from `@/app/events/eventPayloadTypes` | Shape: `{ id: string; seq: number; body: { t: string; [key]: any }; createdAt: number }` |

---

## Prisma Schema: Exact Model Definitions

### UnackedMessage (PostgreSQL — main schema.prisma)

```prisma
model UnackedMessage {
    id            String   @id @default(cuid())
    userId        String
    connectionKey String
    seq           Int
    /// [UpdatePayload]
    payload       Json
    createdAt     DateTime @default(now())

    @@index([userId, connectionKey, seq])
    @@index([createdAt(sort: Asc)])
}
```

**Notes:**
- No foreign key to `Account` — buffer entries are ephemeral and must not cascade-delete on account operations. Consistent with `GlobalLock`, `RepeatKey`, `SimpleCache` which also have no FK constraints.
- `/// [UpdatePayload]` JSDoc comment enables `prisma-json-types-generator` to generate typed access.
- Composite index `(userId, connectionKey, seq)` supports the replay query (`WHERE userId = ? AND connectionKey = ? AND seq > ?`).
- `createdAt(sort: Asc)` index supports the TTL sweep (`WHERE createdAt < cutoff ORDER BY createdAt ASC`).
- SQLite schema will strip `(sort: Asc)` automatically — do not edit sqlite schema.

### ClientAckState (PostgreSQL — main schema.prisma)

```prisma
model ClientAckState {
    id            String   @id @default(cuid())
    userId        String
    connectionKey String
    ackedSeq      Int      @default(0)
    updatedAt     DateTime @updatedAt

    @@unique([userId, connectionKey])
}
```

**Notes:**
- Unique on `(userId, connectionKey)` enables upsert pattern.
- `ackedSeq` is the highest confirmed seq from the client.
- `updatedAt @updatedAt` auto-maintained by Prisma on every upsert.
- No `createdAt` needed — this is a cursor table, not a log table.

[VERIFIED: schema.prisma conventions read from existing models; field types verified against Prisma docs patterns in codebase]

---

## Common Pitfalls

### Pitfall 1: createDeleteManyRetentionRule type rejection

**What goes wrong:** Attempting to pass `id: 'unackedMessages'` to `createDeleteManyRetentionRule` causes a TypeScript compile error: `Argument of type '"unackedMessages"' is not assignable to parameter of type 'RuleDomainId'`.
**Root cause:** `RuleDomainId = Exclude<keyof RetentionPolicy['domains'], 'sessions' | 'accountChanges'>` — `unackedMessages` is not in `RetentionDomainPolicies`.
**Prevention:** Write a custom `RetentionRule` object directly. See Pattern 3.
**Warning signs:** `yarn build` fails with type error in the new rule file.

### Pitfall 2: Editing the auto-generated SQLite schema

**What goes wrong:** Manual edits to `prisma/sqlite/schema.prisma` are silently overwritten on the next `yarn generate` (which runs `schema:sync` first). The pretest hook also runs `schema:sync:check` and will fail CI if the sqlite schema diverges from what the sync script would produce.
**Root cause:** `schemaSync.ts` generates the SQLite schema from the Postgres master. The file starts with `// AUTO-GENERATED FILE - DO NOT EDIT.`
**Prevention:** Edit only `prisma/schema.prisma`. Run `yarn generate` to propagate changes to SQLite.
**Warning signs:** `pretest` hook fails with schema mismatch.

### Pitfall 3: Transaction scope for cap trim

**What goes wrong:** Counting rows and then deleting in separate non-transactional calls allows a race condition where concurrent writes make the trim ineffective.
**Root cause:** SQLite in WAL mode allows concurrent readers but serializes writers; PostgreSQL with Serializable isolation prevents phantom reads. Both need the count+delete in one `inTx` call.
**Prevention:** Use `inTx` for the full write+count+trim sequence. Both operations use the `tx` transaction client, not the top-level `db`.
**Warning signs:** Buffer grows beyond cap under concurrent test conditions.

### Pitfall 4: CLI connections written to buffer

**What goes wrong:** `machine-scoped` or `session-scoped` connections get their messages buffered, causing replay of expired echo-suppressed messages on CLI reconnect.
**Root cause:** `connectionKey` for CLI-type connections would be something like `machine:${machineId}:${userId}` or `session:${sessionId}:${userId}` — not `user-scoped:${userId}`.
**Prevention:** Guard at the top of `writeToBuffer`: `if (!connectionKey.startsWith('user-scoped:')) return { overflow: false };`.
**Warning signs:** `UnackedMessage` rows appear with `connectionKey` values not starting with `user-scoped:`.

### Pitfall 5: Dynamic import pattern in tests

**What goes wrong:** Importing the module under test at the top level means `installDbModuleMock` runs after the module is already imported, so the mock is never applied.
**Root cause:** `vi.doMock` (used by `installDbModuleMock`) must be called before the module is imported to take effect.
**Prevention:** Use `await import('./unackedBuffer')` inside each `it()` block, after `installDbModuleMock` has been called at the top of the file (outside any test). Pattern verified in `createDeleteManyRetentionRule.spec.ts` line 52.
**Warning signs:** Mock functions show zero call counts; tests pass even when DB operations are supposed to fail.

---

## Code Examples

### UpdatePayload type (what gets stored as JSON)

```typescript
// Source: apps/server/sources/app/events/eventPayloadTypes.ts (verified)
export interface UpdatePayload {
    id: string;
    seq: number;
    body: {
        t: UpdateEvent['type'];
        [key: string]: any;
    };
    createdAt: number;
}
```

### SOCKET_RESILIENCE_EVENTS (overflow signal name)

```typescript
// Source: packages/protocol/src/socketResilience.ts (verified)
export const SOCKET_RESILIENCE_EVENTS = {
    RECONNECT_RESUME: 'reconnect-resume',
    ACK_UPDATE:       'ack-update',
    REPLAY_COMPLETE:  'replay-complete',
    BUFFER_OVERFLOW:  'buffer-overflow',
} as const;
```

### backends.ts functions (Phase 6 output — confirmed present)

```typescript
// Source: apps/server/sources/config/backends.ts (verified)
export const RELAY_BUFFER_CAP_DEFAULT = 500;
export const RELAY_BUFFER_TTL_MS_DEFAULT = 120_000;

export function getRelayBufferCapFromEnv(env: NodeJS.ProcessEnv, fallback: number = RELAY_BUFFER_CAP_DEFAULT): number
export function getRelayBufferTtlMsFromEnv(env: NodeJS.ProcessEnv, fallback: number = RELAY_BUFFER_TTL_MS_DEFAULT): number
```

### retentionRuleRegistry.ts registration point

```typescript
// Source: apps/server/sources/app/retention/runtime/retentionRuleRegistry.ts (verified)
// Add to imports:
import { createUnackedMessageRetentionRule } from '@/app/resilience/unackedMessageRetentionRule';

// Add to array in createRetentionRuleRegistry():
createUnackedMessageRetentionRule(),
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual SQLite schema edits | Edit only `schema.prisma`; `yarn schema:sync` auto-generates SQLite variant | Existing (schemaSync.ts in codebase) | Do not touch sqlite schema |
| Direct `db.$transaction` calls | `inTx()` wrapper with retry logic | Existing (inTx.ts) | Always use `inTx` for multi-step DB ops |
| Top-level imports in test files | Dynamic `await import()` inside tests after mock installation | Existing pattern in spec files | Required for `vi.doMock` to work |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `UnackedMessage` should have no FK to `Account` (consistent with ephemeral tables like GlobalLock) | Prisma Schema | Low — FK is optional; if required, add `accountId String` + `account Account @relation(...)` + `onDelete: Cascade`. The cap logic doesn't change. |
| A2 | Cap trim using count+findMany+deleteMany inside a single `inTx` call is sufficient for both SQLite and PostgreSQL (no concurrent write race in tests) | Architecture Patterns | Low — unit tests mock the DB so the race doesn't exist in tests. Integration risk is Phase 8/10 scope. |

**All other claims in this research were verified by direct file reads.**

---

## Open Questions

1. **Overflow state tracking: where to persist the overflow flag?**
   - What we know: The success criterion says "a unit test that fills the buffer past cap and then triggers the reconnect path receives a buffer-overflow signal." The reconnect path is Phase 8.
   - What is unclear: Should Phase 7 expose `isOverflowed(userId, connectionKey): boolean` as a query (count > cap), or should `writeToBuffer` persist an overflow flag to `ClientAckState`?
   - Recommendation: Return `{ overflow: boolean }` from `writeToBuffer` (as shown in Pattern 2). Phase 8 reads this flag from the return value when wiring the emit path. For the unit test in Phase 7 success criterion 5, mock the write to return `{ overflow: true }` and test that the reconnect handler (stubbed) would emit `buffer-overflow`. This keeps Phase 7 scope clean.

2. **`ClientAckState` necessity in Phase 7**
   - What we know: `ClientAckState` is referenced in STATE.md as part of the two-model design. Phase 7 requirements don't explicitly require a persistent ack cursor (STORE-04 only needs `deleteMany WHERE seq <= N`).
   - What is unclear: Is `ClientAckState` used in Phase 7, or only in Phase 8 when the socket handler persists the ack cursor?
   - Recommendation: Add the `ClientAckState` schema model in Phase 7 (schema is defined here) but defer the upsert logic to Phase 8 (when the socket handler calls `ackBuffer`). Phase 7 only implements the `ackBuffer(userId, connectionKey, ackedSeq)` function that does the `deleteMany` — it does not need to write to `ClientAckState`.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 7 is code-only changes (new TypeScript modules + schema model additions). No external tools, services, or CLIs beyond the existing project toolchain are required. `yarn generate` is already available (existing project command).

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (project standard) |
| Config file | `apps/server/vitest.config.ts` |
| Quick run command | `cd apps/server && yarn test --reporter=verbose --run sources/app/resilience/` |
| Full suite command | `cd apps/server && yarn test` |

**Note:** Integration specs (`*.integration.spec.ts`) and DB contract specs are excluded from `yarn test` by `vitest.config.ts`. All Phase 7 tests must be plain `.spec.ts` with mocked DB to run in the standard suite.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STORE-01 | Write N messages; readBuffer returns them in seq order | unit | `yarn test sources/app/resilience/unackedBuffer.spec.ts -t "write N messages"` | no — Wave 0 |
| STORE-02 | Write 501 messages; buffer contains exactly 500 (oldest discarded) | unit | `yarn test sources/app/resilience/unackedBuffer.spec.ts -t "enforces cap"` | no — Wave 0 |
| STORE-03 | Advance clock past TTL; retention rule sweep deletes all entries | unit | `yarn test sources/app/resilience/unackedMessageRetentionRule.spec.ts` | no — Wave 0 |
| STORE-04 | Ack seq N; entries with seq <= N removed; subsequent read returns only seq > N | unit | `yarn test sources/app/resilience/unackedBuffer.spec.ts -t "ackBuffer"` | no — Wave 0 |
| STORE-05 | Fill buffer past cap; `writeToBuffer` returns `{ overflow: true }` | unit | `yarn test sources/app/resilience/unackedBuffer.spec.ts -t "overflow"` | no — Wave 0 |
| STORE-06 | Retention rule calls `getRelayBufferTtlMsFromEnv` and issues correct deleteMany | unit | `yarn test sources/app/resilience/unackedMessageRetentionRule.spec.ts -t "TTL sweep"` | no — Wave 0 |
| STORE-07 | `writeToBuffer` with non-`user-scoped:` connectionKey returns early without DB call | unit | `yarn test sources/app/resilience/unackedBuffer.spec.ts -t "CLI exclusion"` | no — Wave 0 |

### Sampling Rate

- **Per task commit:** `cd apps/server && yarn test --run sources/app/resilience/`
- **Per wave merge:** `cd apps/server && yarn test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `apps/server/sources/app/resilience/unackedBuffer.ts` — implementation file (create)
- [ ] `apps/server/sources/app/resilience/unackedBuffer.spec.ts` — unit tests for STORE-01, STORE-02, STORE-04, STORE-05, STORE-07
- [ ] `apps/server/sources/app/resilience/unackedMessageRetentionRule.ts` — retention rule (create)
- [ ] `apps/server/sources/app/resilience/unackedMessageRetentionRule.spec.ts` — unit tests for STORE-03, STORE-06
- [ ] `apps/server/prisma/schema.prisma` — add `UnackedMessage` + `ClientAckState` models (edit)
- [ ] Run `yarn generate` after schema edit to regenerate Prisma client and update SQLite schema

---

## Security Domain

Security enforcement is enabled (not explicitly false in config). Phase 7 is a server-side storage layer with no user-facing input, authentication, or cryptographic operations. ASVS categories that apply:

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No auth in this phase |
| V3 Session Management | No | Buffer is identified by userId from auth layer (Phase 8 wires this) |
| V4 Access Control | Low | Buffer writes keyed by userId; no cross-user access paths in Phase 7 |
| V5 Input Validation | Yes | `connectionKey` prefix check prevents CLI writes; `seq` is typed `Int` in Prisma |
| V6 Cryptography | No | No new crypto; `UpdatePayload.body` is already E2EE by the time it reaches the buffer |

**Key security property:** The buffer stores already-encrypted `UpdatePayload.body` fields. The buffer itself does not need to encrypt, as the payload was encrypted upstream. CLI exclusion (STORE-07) is enforced at write time — a caller passing a `machine-scoped` connectionKey is silently ignored.

---

## Sources

### Primary (HIGH confidence — verified by direct file read)

- `apps/server/sources/app/retention/rules/createDeleteManyRetentionRule.ts` — factory pattern and type constraint verified
- `apps/server/sources/app/retention/runtime/retentionRuleRegistry.ts` — `RetentionRule` type and registration pattern verified
- `apps/server/sources/app/retention/config/retentionPolicyTypes.ts` — `RetentionDomainPolicies` type verified (confirms `unackedMessages` is not in it)
- `apps/server/sources/storage/inTx.ts` — `inTx`, `afterTx`, `Tx` types verified; SQLite retry logic confirmed
- `apps/server/sources/config/backends.ts` — `getRelayBufferCapFromEnv`, `getRelayBufferTtlMsFromEnv` confirmed present
- `packages/protocol/src/socketResilience.ts` — `SOCKET_RESILIENCE_EVENTS` confirmed; `BUFFER_OVERFLOW = 'buffer-overflow'`
- `apps/server/sources/app/events/eventPayloadTypes.ts` — `UpdatePayload` type confirmed: `{ id, seq, body, createdAt }`
- `apps/server/sources/app/events/connectionEventRouter.ts` — room name format confirmed: `user-scoped:${userId}`
- `apps/server/scripts/schemaSync.ts` — SQLite auto-generation confirmed; `sort:` stripping regex verified (line 98)
- `apps/server/sources/app/api/testkit/dbMocks.ts` — `createDbMocks` + `installDbModuleMock` pattern verified
- `apps/server/vitest.config.ts` — test include/exclude patterns confirmed; `isolate: true`
- `apps/server/prisma/schema.prisma` — existing model conventions verified (field names, index syntax, Json type usage)

### Secondary (MEDIUM confidence)

- `apps/server/sources/app/retention/rules/createDeleteManyRetentionRule.spec.ts` — dynamic import test pattern confirmed (line 52)
- `apps/server/sources/app/retention/rules/accountChangeRetentionRule.ts` — custom RetentionRule pattern (no `createDeleteManyRetentionRule`) confirmed

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified in codebase; no new dependencies needed
- Architecture: HIGH — all integration points verified by direct file read
- Pitfalls: HIGH — type constraint pitfall verified by reading both `retentionPolicyTypes.ts` and `createDeleteManyRetentionRule.ts`; SQLite auto-gen pitfall verified by reading `schemaSync.ts`
- Test patterns: HIGH — `createDbMocks` pattern verified; dynamic import pattern verified

**Research date:** 2026-04-22
**Valid until:** 2026-05-22 (stable codebase; no fast-moving ecosystem dependencies added)
