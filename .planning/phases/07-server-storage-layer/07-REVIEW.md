---
phase: 07-server-storage-layer
reviewed: 2026-04-22T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - apps/server/sources/app/resilience/unackedBuffer.ts
  - apps/server/sources/app/resilience/unackedBuffer.spec.ts
  - apps/server/sources/app/resilience/unackedMessageRetentionRule.ts
  - apps/server/sources/app/resilience/unackedMessageRetentionRule.spec.ts
  - apps/server/sources/app/retention/runtime/retentionRuleRegistry.ts
  - apps/server/prisma/schema.prisma
findings:
  critical: 0
  warning: 3
  info: 3
  total: 6
status: issues_found
---

# Phase 07: Code Review Report

**Reviewed:** 2026-04-22
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Six files were reviewed covering the new unacked-message buffer storage layer: the buffer read/write/ack operations, the TTL retention rule, the retention rule registry integration, and the Prisma schema additions.

The implementation is generally well-structured and correct in its happy-path logic. The retention rule correctly uses the two-phase findMany → deleteMany pattern with the cutoff re-applied in the delete, which prevents a class of TOCTOU bugs. The CLI exclusion guard is in the right place and is tested.

Three warnings were found: a missing unique constraint on `(userId, connectionKey, seq)` in the schema that allows duplicate seq values for the same connection, pervasive `as any` casts on the Prisma client that bypass type safety entirely, and a duplicated test scenario that provides no additional coverage. Three informational items are noted for future improvement.

---

## Warnings

### WR-01: Missing unique constraint allows duplicate seq values in UnackedMessage

**File:** `apps/server/prisma/schema.prisma:383-394`

**Issue:** The `UnackedMessage` model has an index on `(userId, connectionKey, seq)` but no unique constraint. Because `writeToBuffer` inserts before counting/trimming and two concurrent writes can race, it is possible to store two rows with identical `(userId, connectionKey, seq)`. This has downstream consequences:
- `readBuffer` returns both rows, causing double-delivery on reconnect replay.
- `ackBuffer` deletes all rows with `seq <= ackedSeq`, which is correct but masks the duplicate; the duplicate is silently discarded rather than detected.

The `seq` value originates from `payload.seq` and is expected to be a stable, client-assigned monotonic counter. Duplicate rows for the same seq represent a corrupted buffer state.

**Fix:** Add a unique constraint so the database enforces the invariant that a given `(userId, connectionKey, seq)` appears at most once:

```prisma
model UnackedMessage {
    id            String   @id @default(cuid())
    userId        String
    connectionKey String
    seq           Int
    /// [UpdatePayload]
    payload       Json
    createdAt     DateTime @default(now())

    @@unique([userId, connectionKey, seq])   // <-- add this
    @@index([createdAt(sort: Asc)])
}
```

The existing `@@index([userId, connectionKey, seq])` can be dropped since a unique constraint implicitly creates an index on those columns. If the index needs to remain separate for query planner reasons, keep both.

---

### WR-02: All Prisma operations cast through `as any`, losing type safety

**File:** `apps/server/sources/app/resilience/unackedBuffer.ts:32-58, 75, 92`

**Issue:** Every Prisma operation in this file is accessed via `(tx as any).unackedMessage` or `(db as any).unackedMessage`. The server project uses TypeScript strict mode and the codebase convention is to avoid `as any`. The `Tx` type from `@/storage/inTx` does not include the `unackedMessage` model, which is why the casts are needed — but the correct fix is to extend `Tx`, not to suppress type errors with `any`.

This means:
- Typos in field names (e.g. `connectionkKey`) will silently compile and fail at runtime.
- Mismatched query shapes (wrong `where` clause fields, `select` fields that do not exist) pass compilation undetected.
- Future schema changes will not produce compile errors in this file.

Compare with `unackedMessageRetentionRule.ts` which calls `db.unackedMessage` directly without any cast — suggesting the generated Prisma client does expose the model, but `Tx` does not.

**Fix:** Update the `Tx` type in `@/storage/inTx` to include `unackedMessage`. The exact shape depends on how `inTx` is implemented, but if `Tx` is `Prisma.TransactionClient` (the standard Prisma transaction client type), it already includes all models and the casts are unnecessary. Check the actual type and remove the `as any` casts:

```typescript
// Before
await (tx as any).unackedMessage.create({ ... });

// After (if Tx is already Prisma.TransactionClient)
await tx.unackedMessage.create({ ... });
```

---

### WR-03: Duplicate test provides no additional coverage

**File:** `apps/server/sources/app/resilience/unackedBuffer.spec.ts:76-85`

**Issue:** The test labelled `// STORE-05` (lines 76–85) is structurally identical to the test labelled `// STORE-02` (lines 49–61). Both:
- Mock `create` to resolve `{}`, `count` to resolve `501`, `findMany` to resolve `[{ id: 'old' }]`, and `deleteMany` to resolve `{ count: 1 }`.
- Call `writeToBuffer(USER_ID, CONNECTION_KEY, ..., 500)`.
- Assert `result.overflow === true`.

The only difference is that STORE-02 also asserts `deleteMany` was called. The STORE-05 test adds no new scenario. Duplicated tests inflate perceived coverage and can cause confusion about what is actually being verified.

**Fix:** Remove the STORE-05 test (lines 76–85). If there is a distinct scenario intended by STORE-05 (e.g. the specific case where `payload.seq` equals the cap boundary), rewrite it to test that distinct scenario explicitly.

---

## Info

### IN-01: UnackedMessage has no FK to Account — orphaned rows not cascade-deleted

**File:** `apps/server/prisma/schema.prisma:383-394`

**Issue:** All other user-scoped models (e.g. `UserFeedItem`, `UserKVStore`, `UserRelationship`) link back to `Account` via a foreign key with `onDelete: Cascade`. `UnackedMessage` stores a `userId` string with no relation declared, so when an account is deleted, its unacked messages remain until the TTL sweep removes them.

For a short-TTL buffer (120 seconds by default) this is a minor concern. However if the TTL is ever raised or if account deletion is a privacy-sensitive operation, orphaned rows become a problem.

**Fix:** Add a relation to `Account` with cascade delete:

```prisma
model UnackedMessage {
    id            String   @id @default(cuid())
    userId        String
    user          Account  @relation(fields: [userId], references: [id], onDelete: Cascade)
    connectionKey String
    seq           Int
    /// [UpdatePayload]
    payload       Json
    createdAt     DateTime @default(now())

    @@unique([userId, connectionKey, seq])
    @@index([createdAt(sort: Asc)])
}
```

Also add `UnackedMessage UnackedMessage[]` to the `Account` model's relation list.

---

### IN-02: Indirect vi.fn() delegation in retention rule spec is fragile

**File:** `apps/server/sources/app/resilience/unackedMessageRetentionRule.spec.ts:4-12`

**Issue:** The spec declares two module-level `vi.fn()` variables (`findMany`, `deleteMany` on lines 4–5), then immediately delegates the `dbMocks` implementations to them on lines 11–12. All `mockResolvedValueOnce` calls target the top-level fns, not the `dbMocks` fns directly. This two-level indirection is unnecessary — `dbMocks.db.unackedMessage.findMany` is already a `vi.fn()` and can be used directly.

The pattern is also subtly brittle: `vi.clearAllMocks()` (called in `beforeEach`) resets `dbMocks.db.unackedMessage.findMany`, which means the delegation to the top-level `findMany` fn is reset too (the `.mockImplementation` call is cleared). If the test isolation strategy ever changes to `vi.resetAllMocks()`, the tests would break silently.

**Fix:** Remove the top-level `findMany`/`deleteMany` fns and use `dbMocks.db.unackedMessage.findMany` / `dbMocks.db.unackedMessage.deleteMany` directly in each test, consistent with the pattern used in `unackedBuffer.spec.ts`.

---

### IN-03: `payload as any` cast is unnecessary

**File:** `apps/server/sources/app/resilience/unackedBuffer.ts:37`

**Issue:** The line `payload: payload as any` suppresses a type error that exists only because the outer `(tx as any)` cast removes all type information. Once WR-02 is resolved and the `any` casts are removed, this inner cast will also be unnecessary. The `UpdatePayload` type should be assignable to Prisma's `InputJsonValue` (the type accepted for `Json` fields) either directly or with a single `as unknown as Prisma.InputJsonValue` cast, which at least preserves intent.

**Fix:** Address as part of fixing WR-02. After restoring proper types, cast only at the boundary if needed:

```typescript
payload: payload as unknown as Prisma.InputJsonValue,
```

---

_Reviewed: 2026-04-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
