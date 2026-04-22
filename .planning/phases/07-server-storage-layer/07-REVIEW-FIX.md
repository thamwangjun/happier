---
phase: 07-server-storage-layer
fixed_at: 2026-04-22T00:00:00Z
review_path: .planning/phases/07-server-storage-layer/07-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 07: Code Review Fix Report

**Fixed at:** 2026-04-22
**Source review:** .planning/phases/07-server-storage-layer/07-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: Missing unique constraint allows duplicate seq values in UnackedMessage

**Files modified:** `apps/server/prisma/schema.prisma`
**Commit:** b145a472b
**Applied fix:** Replaced `@@index([userId, connectionKey, seq])` with `@@unique([userId, connectionKey, seq])` in the `UnackedMessage` model. The unique constraint enforces the database-level invariant that a given `(userId, connectionKey, seq)` triple appears at most once, preventing duplicate rows from concurrent writes. The unique constraint implicitly creates an index, so the separate `@@index` is dropped.

---

### WR-02: All Prisma operations cast through `as any`, losing type safety

**Files modified:** `apps/server/sources/app/resilience/unackedBuffer.ts`
**Commit:** f1a2b3c5c
**Applied fix:** Removed all `(tx as any)` and `(db as any)` casts. Since `Tx` is `Prisma.TransactionClient` (confirmed via `@/storage/inTx` and `@/storage/prisma`), it already exposes `unackedMessage` once the Prisma client is generated. Added `import type { Prisma } from '@prisma/client'` and used `payload as unknown as Prisma.InputJsonValue` at the Json field boundary (consistent with the review's IN-03 guidance). The `rows.map((r: any)` cast was also removed — Prisma infers the row type correctly.

---

### WR-03: Duplicate test provides no additional coverage

**Files modified:** `apps/server/sources/app/resilience/unackedBuffer.spec.ts`
**Commit:** dacb9bbbd
**Applied fix:** Removed the STORE-05 test block (lines 75-85 in the original file). The test was structurally identical to STORE-02: same mock setup, same call, same assertion (`overflow === true`). STORE-02 also asserts `deleteMany` was called, making it strictly more thorough. The STORE-07 tests that followed remain intact.

---

_Fixed: 2026-04-22_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
