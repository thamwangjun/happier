# Phase 7: Server Storage Layer - Pattern Map

**Mapped:** 2026-04-22
**Files analyzed:** 6 (2 new modules, 2 new spec files, 1 schema edit, 1 registry edit)
**Analogs found:** 6 / 6

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/server/prisma/schema.prisma` | model/config | — | `apps/server/prisma/schema.prisma` (GlobalLock, RepeatKey models) | exact |
| `apps/server/sources/app/resilience/unackedBuffer.ts` | service | CRUD + batch | `apps/server/sources/storage/sequence/seq.ts` + `apps/server/sources/storage/inTx.ts` | role-match |
| `apps/server/sources/app/resilience/unackedBuffer.spec.ts` | test | — | `apps/server/sources/app/retention/rules/accountChangeRetentionRule.spec.ts` | exact |
| `apps/server/sources/app/resilience/unackedMessageRetentionRule.ts` | service | batch | `apps/server/sources/app/retention/rules/accountChangeRetentionRule.ts` | role-match |
| `apps/server/sources/app/resilience/unackedMessageRetentionRule.spec.ts` | test | — | `apps/server/sources/app/retention/rules/createDeleteManyRetentionRule.spec.ts` | exact |
| `apps/server/sources/app/retention/runtime/retentionRuleRegistry.ts` | config | — | `apps/server/sources/app/retention/runtime/retentionRuleRegistry.ts` (modify) | exact |

---

## Pattern Assignments

### `apps/server/prisma/schema.prisma` (schema, modify)

**Analog:** Existing ephemeral/utility models in the same file — `GlobalLock` (lines 357-365), `RepeatKey` (lines 367-374)

**Key observations from analogs:**
- Ephemeral models (no business lifetime) have NO foreign key to `Account` — they are standalone tables.
- `GlobalLock` and `RepeatKey` use `@@index([expiresAt])` for TTL sweep queries — the new models follow the same single-field index pattern.
- `/// [TypeName]` JSDoc comment on a `Json` field enables `prisma-json-types-generator` typed access (see `Account.avatar Json?` with `/// [ImageRef]` at line 49 of schema).

**Existing ephemeral model pattern** (schema.prisma lines 357-374):
```prisma
model GlobalLock {
    key       String   @id @default(cuid())
    value     String
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    expiresAt DateTime

    @@index([expiresAt])
}

model RepeatKey {
    key       String   @id
    value     String
    createdAt DateTime @default(now())
    expiresAt DateTime

    @@index([expiresAt])
}
```

**New models to add** (copy field/index style from above; `UnackedMessage` has `Json` payload typed by JSDoc; `ClientAckState` is a cursor/upsert table):
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

model ClientAckState {
    id            String   @id @default(cuid())
    userId        String
    connectionKey String
    ackedSeq      Int      @default(0)
    updatedAt     DateTime @updatedAt

    @@unique([userId, connectionKey])
}
```

**Important:** `(sort: Asc)` on the `createdAt` index is stripped automatically by `scripts/schemaSync.ts` for the SQLite schema — only ever edit `apps/server/prisma/schema.prisma`, then run `yarn generate`.

---

### `apps/server/sources/app/resilience/unackedBuffer.ts` (service, CRUD + batch)

**Analogs:**
- `apps/server/sources/storage/sequence/seq.ts` — functional module with named exports, `@/storage/db` import, no classes
- `apps/server/sources/storage/inTx.ts` — `inTx(fn)` transaction wrapper for atomic multi-step DB ops
- `apps/server/sources/config/backends.ts` — `getRelayBufferCapFromEnv` / `getRelayBufferTtlMsFromEnv` usage

**Imports pattern** (copy from `seq.ts` lines 1-1, `inTx.ts` lines 1-5):
```typescript
import { db } from '@/storage/db';
import { inTx } from '@/storage/inTx';
import type { Tx } from '@/storage/inTx';
import { getRelayBufferCapFromEnv } from '@/config/backends';
import type { UpdatePayload } from '@/app/events/eventPayloadTypes';
```

**Core functional module pattern** (copy from `seq.ts` lines 1-11 — named export async function, no class):
```typescript
// seq.ts lines 1-11
import { db } from "@/storage/db";

export async function allocateUserSeq(accountId: string) {
    const user = await db.account.update({
        where: { id: accountId },
        select: { seq: true },
        data: { seq: { increment: 1 } }
    });
    const seq = user.seq;
    return seq;
}
```

**Transaction pattern** (copy from `inTx.ts` lines 46-77 — `inTx(async (tx) => { ... })`, use `tx` not `db` inside):
```typescript
// inTx.ts lines 46-77
export async function inTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const provider = getDbProviderFromEnv(process.env, "postgres");
    const maxRetries = provider === "sqlite" ? 8 : 3;
    // ... retry loop
    const result = await db.$transaction(wrapped, txOpts);
    // ...
}
```

**CLI exclusion guard pattern** (D-03 from CONTEXT.md — guard at top of write function, before any DB call):
```typescript
// Place at the very top of writeToBuffer, before inTx:
if (!connectionKey.startsWith('user-scoped:')) {
    return { overflow: false }; // STORE-07: CLI exclusion
}
```

**Cap trim pattern — trim-on-write inside a single `inTx`** (count + findMany oldest + deleteMany, all via `tx` not `db`):
```typescript
return await inTx(async (tx: Tx) => {
    await (tx as any).unackedMessage.create({ data: { ... } });

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
```

**Read/ack pattern** (outside `inTx` — single DB op, no transaction needed):
```typescript
export async function readBuffer(userId: string, connectionKey: string, afterSeq: number): Promise<UpdatePayload[]> {
    const rows = await db.unackedMessage.findMany({
        where: { userId, connectionKey, seq: { gt: afterSeq } },
        orderBy: { seq: 'asc' },
    });
    return rows.map(r => r.payload as UpdatePayload);
}

export async function ackBuffer(userId: string, connectionKey: string, ackedSeq: number): Promise<void> {
    await db.unackedMessage.deleteMany({
        where: { userId, connectionKey, seq: { lte: ackedSeq } },
    });
}
```

---

### `apps/server/sources/app/resilience/unackedBuffer.spec.ts` (test)

**Analog:** `apps/server/sources/app/retention/rules/accountChangeRetentionRule.spec.ts`

**Imports pattern** (lines 1-18 of `accountChangeRetentionRule.spec.ts`):
```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbMocks, installDbModuleMock } from '../../api/testkit/dbMocks';
```

**Mock setup pattern** (lines 6-18 of `accountChangeRetentionRule.spec.ts`):
```typescript
const dbMocks = createDbMocks({
    accountChange: ["findMany", "deleteMany"],
    account: ["updateMany"],
} as const);

dbMocks.db.accountChange.findMany.mockImplementation((...args: any[]) => findMany(...args));
installDbModuleMock({ db: dbMocks.db });
```

For `unackedBuffer.spec.ts`, the shape covers the models used by `writeToBuffer`/`readBuffer`/`ackBuffer`. The `inTx` call also invokes `db.$transaction` — the mock must include it:
```typescript
const dbMocks = createDbMocks({
    unackedMessage: ['create', 'findMany', 'deleteMany', 'count'],
} as const);
```

**CRITICAL — dynamic import pattern** (copy from `createDeleteManyRetentionRule.spec.ts` line 52; `accountChangeRetentionRule.spec.ts` line 35):
```typescript
// WRONG — top-level import; mock never applies:
import { readBuffer } from './unackedBuffer';

// CORRECT — dynamic import inside each it() after installDbModuleMock runs at file top:
it('writes N messages and reads them back in insertion order', async () => {
    dbMocks.db.unackedMessage.findMany.mockResolvedValueOnce([...]);
    const { readBuffer } = await import('./unackedBuffer');
    const result = await readBuffer('user-1', 'user-scoped:user-1', 0);
    expect(result).toHaveLength(1);
});
```

**`beforeEach` reset pattern** (lines 20-22 of `accountChangeRetentionRule.spec.ts`):
```typescript
describe('unackedBuffer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });
    // ...
});
```

**STORE-07 CLI exclusion test — no DB call expected pattern:**
```typescript
it('returns { overflow: false } without calling DB for non-user-scoped connectionKey', async () => {
    const { writeToBuffer } = await import('./unackedBuffer');
    const result = await writeToBuffer('user-1', 'machine-scoped:user-1:machine-1', { id: 'x', seq: 1, body: { t: 'new-session' }, createdAt: 0 }, 500);
    expect(result).toEqual({ overflow: false });
    expect(dbMocks.db.unackedMessage.create).not.toHaveBeenCalled();
});
```

---

### `apps/server/sources/app/resilience/unackedMessageRetentionRule.ts` (service, batch)

**Analog:** `apps/server/sources/app/retention/rules/accountChangeRetentionRule.ts`

**Key observation from RESEARCH.md:** `createDeleteManyRetentionRule` CANNOT be used — its `id` type is `Exclude<keyof RetentionPolicy['domains'], 'sessions' | 'accountChanges'>` and `unackedMessages` is not in `RetentionDomainPolicies`. Write a custom `RetentionRule` object directly (same approach `accountChangeRetentionRule.ts` uses, where the rule is a plain helper function).

**Imports pattern** (copy from `accountChangeRetentionRule.ts` lines 1-1, adapted):
```typescript
import { db } from '@/storage/db';
import { getRelayBufferTtlMsFromEnv } from '@/config/backends';
import type { RetentionRule } from '@/app/retention/runtime/retentionRuleRegistry';
```

**RetentionRule type** (from `retentionRuleRegistry.ts` lines 23-26):
```typescript
export type RetentionRule = Readonly<{
    id: string;
    run: (params: { policy: RetentionPolicy; batchSize: number; dryRun: boolean; maxDeletesPerRulePerRun: number; now: Date }) => Promise<RetentionRuleResult>;
}>;
```

**Core rule pattern** (modeled on `createDeleteManyRetentionRule.ts` lines 16-58, but using `getRelayBufferTtlMsFromEnv` instead of domain policy days):
```typescript
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

**Note:** The `policy` parameter is received but not used — the TTL is controlled by env var, not per-account policy (D-02). This is acceptable; the `run` signature is fixed by the `RetentionRule` type.

---

### `apps/server/sources/app/resilience/unackedMessageRetentionRule.spec.ts` (test)

**Analog:** `apps/server/sources/app/retention/rules/createDeleteManyRetentionRule.spec.ts`

**Mock setup pattern** (lines 6-16):
```typescript
const findMany = vi.fn();
const deleteMany = vi.fn();

const dbMocks = createDbMocks({
    unackedMessage: ["findMany", "deleteMany"],
} as const);

dbMocks.db.unackedMessage.findMany.mockImplementation((...args: any[]) => findMany(...args));
dbMocks.db.unackedMessage.deleteMany.mockImplementation((...args: any[]) => deleteMany(...args));

installDbModuleMock({ db: dbMocks.db });
```

**Test structure** — no `RetentionPolicy` needed (rule doesn't use it); use a minimal stub:
```typescript
it('deletes entries older than RELAY_BUFFER_TTL_MS', async () => {
    findMany.mockResolvedValueOnce([{ id: 'msg-1' }]);
    deleteMany.mockResolvedValueOnce({ count: 1 });

    const { createUnackedMessageRetentionRule } = await import('./unackedMessageRetentionRule');
    const rule = createUnackedMessageRetentionRule();

    const now = new Date('2025-01-01T00:02:00.000Z');
    const result = await rule.run({
        policy: {} as any,
        batchSize: 10,
        dryRun: false,
        maxDeletesPerRulePerRun: 10,
        now,
    });

    // cutoff = now - 120000ms = 2025-01-01T00:00:00.000Z
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { createdAt: { lt: new Date('2025-01-01T00:00:00.000Z') } },
    }));
    expect(result.deleted).toBe(1);
});
```

---

### `apps/server/sources/app/retention/runtime/retentionRuleRegistry.ts` (config, modify)

**Analog:** Itself — add one import and one call to the array.

**Import block to add** (copy style from lines 4-16 of existing file — `@/` prefix, sorted alphabetically by path):
```typescript
import { createUnackedMessageRetentionRule } from '@/app/resilience/unackedMessageRetentionRule';
```

**Registration pattern** (copy from lines 58-68 — append to `createRetentionRuleRegistry()` return array):
```typescript
// retentionRuleRegistry.ts lines 58-69 (existing tail of array)
        createRepeatKeyRetentionRule(),
        createGlobalLockRetentionRule(),
        createAutomationRunRetentionRule(),
        createAutomationRunEventRetentionRule(),
        // ADD:
        createUnackedMessageRetentionRule(),
    ]);
}
```

---

## Shared Patterns

### Functional Module Style
**Source:** `apps/server/sources/storage/sequence/seq.ts` (entire file)
**Apply to:** `unackedBuffer.ts`, `unackedMessageRetentionRule.ts`
- Named async function exports, no classes, no default exports
- `@/` absolute import prefix throughout
- 4-space indentation (server CLAUDE.md)
- Return only what callers need — no "just in case" values

### `inTx` for Atomic Multi-Step DB Operations
**Source:** `apps/server/sources/storage/inTx.ts` lines 46-77
**Apply to:** `unackedBuffer.ts` — `writeToBuffer` (create + count + trim in one transaction)
- Always use `tx` (the callback parameter), never the top-level `db`, inside the `inTx` callback
- `afterTx(tx, cb)` schedules post-commit side effects (not needed in Phase 7 — no socket emits)

### `createDbMocks` + `installDbModuleMock` Test Pattern
**Source:** `apps/server/sources/app/api/testkit/dbMocks.ts` lines 30-66
**Apply to:** `unackedBuffer.spec.ts`, `unackedMessageRetentionRule.spec.ts`
- Call `installDbModuleMock` at file top (outside any `describe`/`it`)
- Use `await import('./module')` INSIDE each `it()` block — never top-level import the module under test
- `vi.clearAllMocks()` in `beforeEach`
- The `createDbMocks` shape array must list every Prisma method the module calls

### RetentionRule Return Shape
**Source:** `apps/server/sources/app/retention/runtime/retentionRuleRegistry.ts` lines 18-26
**Apply to:** `unackedMessageRetentionRule.ts`
```typescript
export type RetentionRuleResult = Readonly<{
    id: string;
    deleted: number;
}>;

export type RetentionRule = Readonly<{
    id: string;
    run: (params: { policy: RetentionPolicy; batchSize: number; dryRun: boolean; maxDeletesPerRulePerRun: number; now: Date }) => Promise<RetentionRuleResult>;
}>;
```

### `findMany → deleteMany` Batch-Safe Delete Pattern
**Source:** `apps/server/sources/app/retention/rules/createDeleteManyRetentionRule.ts` lines 33-56
**Apply to:** `unackedMessageRetentionRule.ts`
- Load candidate IDs first (`findMany` with `select: { id: true }`)
- Re-apply the `WHERE` condition in `deleteMany` to guard against rows refreshed between the two queries
- Return `{ id, deleted: result.count }`

---

## No Analog Found

All files have close matches in the codebase. No files require falling back to RESEARCH.md patterns exclusively.

---

## Metadata

**Analog search scope:** `apps/server/sources/`, `apps/server/prisma/`
**Files scanned:** 12 (read directly) + glob/grep over retention rules directory
**Pattern extraction date:** 2026-04-22

**Key anti-patterns documented in RESEARCH.md (do not copy):**
- Do NOT use `createDeleteManyRetentionRule` for the buffer TTL rule — type constraint blocks it
- Do NOT edit `apps/server/prisma/sqlite/schema.prisma` — it is auto-generated by `scripts/schemaSync.ts`
- Do NOT import module under test at file top in spec files — use `await import()` inside each `it()`
- Do NOT use top-level `db` inside an `inTx` callback — always use the `tx` parameter
