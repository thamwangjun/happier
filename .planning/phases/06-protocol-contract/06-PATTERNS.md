# Phase 6: Protocol Contract - Pattern Map

**Mapped:** 2026-04-21
**Files analyzed:** 5 (3 new/modified source files + 1 new test file + 1 doc file)
**Analogs found:** 5 / 5

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/protocol/src/socketResilience.ts` | utility (schema/constants module) | transform | `packages/protocol/src/socketRpc.ts` | exact |
| `packages/protocol/src/updates.ts` | model (schema) | transform | self (existing file, additive field) | exact |
| `packages/protocol/src/index.ts` | config (barrel export) | transform | self (existing file, additive re-export block) | exact |
| `packages/protocol/src/socketResilience.test.ts` | test | request-response | `packages/protocol/src/changes.automation.test.ts` | role-match |
| `docs/protocol.md` | documentation | — | self (existing file, append-only) | exact |

---

## Pattern Assignments

### `packages/protocol/src/socketResilience.ts` (new file — utility, transform)

**Analog:** `packages/protocol/src/socketRpc.ts`

**Complete analog file** (lines 1-13 — this is the entire file):
```typescript
export const SOCKET_RPC_EVENTS = {
  REGISTER: 'rpc-register',
  REGISTERED: 'rpc-registered',
  UNREGISTER: 'rpc-unregister',
  UNREGISTERED: 'rpc-unregistered',
  ERROR: 'rpc-error',
  CALL: 'rpc-call',
  REQUEST: 'rpc-request',
  MACHINE_TRANSFER_ENVELOPE: 'machine-transfer-envelope',
} as const;

export type SocketRpcEvent = (typeof SOCKET_RPC_EVENTS)[keyof typeof SOCKET_RPC_EVENTS];
```

**Event constants pattern** — copy this structure exactly, replace values:
- `as const` object named `SOCKET_RESILIENCE_EVENTS`
- Derived union type `SocketResilienceEvent` using `[keyof typeof SOCKET_RESILIENCE_EVENTS]`
- No imports required for event constants or the derived type

**Zod schema + inferred type pattern** (from `packages/protocol/src/updates.ts` lines 238-245):
```typescript
export const UpdateContainerSchema = z.object({
  id: z.string(),
  seq: z.number().int().min(0),
  createdAt: TimestampMsSchema,
  body: UpdateBodySchema,
}).passthrough();

export type UpdateContainer = z.infer<typeof UpdateContainerSchema>;
```
Apply: `XxxSchema` (Zod object) + `.passthrough()` + `export type Xxx = z.infer<typeof XxxSchema>`. Both exports are required.

**Co-located constant pattern** (from `packages/protocol/src/features/payload/capabilities/bugReportsCapabilities.ts` line 27):
```typescript
export const BUG_REPORT_DEFAULT_CONTEXT_WINDOW_MS = 30 * 60 * 1000;
```
Apply: `export const ACK_DEBOUNCE_MS = 500;` — plain numeric constant in the same file as the domain schemas, no separate constants file.

**Import line required** — `socketRpc.ts` has no `z` import because it declares no Zod schemas. `socketResilience.ts` does declare Zod schemas, so it needs:
```typescript
import { z } from 'zod';
```

---

### `packages/protocol/src/updates.ts` (modify existing — model, transform)

**Analog:** self — additive field inline in existing `z.object({...})` literal

**Current `UpdateContainerSchema`** (lines 238-243):
```typescript
export const UpdateContainerSchema = z.object({
  id: z.string(),
  seq: z.number().int().min(0),
  createdAt: TimestampMsSchema,
  body: UpdateBodySchema,
}).passthrough();
```

**Target state after modification** — add `ackSeq` directly inside the object literal, before `.passthrough()`:
```typescript
export const UpdateContainerSchema = z.object({
  id: z.string(),
  seq: z.number().int().min(0),
  createdAt: TimestampMsSchema,
  body: UpdateBodySchema,
  ackSeq: z.number().int().min(0).optional(),
}).passthrough();
```

**Backward compat anchor:** `.passthrough()` is already present (line 243) — `.optional()` fields on a schema with `.passthrough()` produce no parse error when the field is absent. The `export type UpdateContainer` on line 245 gains `ackSeq?: number` automatically via `z.infer<>` — no change to that line.

**Optional field precedent in `updates.ts`** (line 68):
```typescript
lastViewedSessionSeq: z.number().int().min(0).optional(),
```
This is the exact constraint pattern to follow for `ackSeq`.

---

### `packages/protocol/src/index.ts` (modify existing — config/barrel, transform)

**Analog:** self — existing re-export block at line 432

**Existing `socketRpc.ts` re-export** (line 432 — single-line form used for small exports):
```typescript
export { SOCKET_RPC_EVENTS, type SocketRpcEvent } from './socketRpc.js';
```

**Existing multi-export block form** (lines 420-430 — used when there are many exports):
```typescript
export {
  INSTALLABLES_CATALOG,
  INSTALLABLE_KEYS,
  CODEX_ACP_DEP_ID,
  CODEX_ACP_DIST_TAG,
  type InstallableAutoUpdateMode,
  type InstallableCatalogEntry,
  type InstallableDefaultPolicy,
  type InstallableKey,
  type InstallableKind,
} from './installables.js';
```

**New block to insert after line 432** — use multi-line form since there are 7 exports; `type` keyword required for all TypeScript type exports:
```typescript
export {
  ACK_DEBOUNCE_MS,
  AckUpdateRequestSchema,
  ReconnectResumeRequestSchema,
  SOCKET_RESILIENCE_EVENTS,
  type AckUpdateRequest,
  type ReconnectResumeRequest,
  type SocketResilienceEvent,
} from './socketResilience.js';
```

**Critical pitfall:** Module specifier must end in `.js` (not `.ts`) — all existing import/export paths in `index.ts` use `.js` extensions. This is ESM NodeNext resolution behavior.

---

### `packages/protocol/src/socketResilience.test.ts` (new test file — test, request-response)

**Analog:** `packages/protocol/src/changes.automation.test.ts` (schema parse + rejection pattern)

**Test file structure** (lines 1-22 of analog):
```typescript
import { describe, expect, it } from 'vitest';

import { ChangeEntrySchema, ChangeKindSchema } from './changes.js';

describe('changes protocol automation kind', () => {
    it('accepts automation in ChangeKindSchema', () => {
        expect(ChangeKindSchema.parse('automation')).toBe('automation');
    });

    it('accepts automation entries in ChangeEntrySchema', () => {
        const parsed = ChangeEntrySchema.parse({
            cursor: 42,
            kind: 'automation',
            ...
        });
        expect(parsed.kind).toBe('automation');
    });
});
```

**Index exports test pattern for public API verification** (from `packages/protocol/src/index.exports.test.ts` lines 1-26):
```typescript
import { describe, expect, it } from 'vitest';
import * as protocol from './index.js';

describe('protocol package root exports', () => {
    it('exports automation change/update schemas through root exports', () => {
        expect(protocol.ChangeKindSchema.parse('automation')).toBe('automation');
        ...
    });
});
```

**Apply to `socketResilience.test.ts`:**
- Import directly from `./socketResilience.js` (not from `./index.js`)
- One `describe` block per schema: parse valid input, reject missing required fields
- Test `SOCKET_RESILIENCE_EVENTS` key-to-value mapping
- Test `ACK_DEBOUNCE_MS` value equals `500`
- Cover PROTO-04 backward compat in a separate describe block importing from `./updates.js`

---

### `docs/protocol.md` (modify existing — documentation, append-only)

**Analog:** self — append after line 203 (current end of file)

**Existing section heading pattern** — mirror the heading hierarchy already in the file. The new section should use `##` for the version heading and `###`/`####` for sub-sections, consistent with existing event documentation sections.

No code excerpt needed — this is a documentation-only append. The exact content to append is fully specified in `06-RESEARCH.md` under "Pattern 6: docs/protocol.md Section" (the complete markdown block starting with `## v1.3 Resilience Events (Request Resilience)`).

---

## Shared Patterns

### Zod Schema Convention
**Source:** `packages/protocol/src/updates.ts` (throughout)
**Apply to:** `socketResilience.ts` new schemas
```typescript
export const XxxSchema = z.object({ ... }).passthrough();
export type Xxx = z.infer<typeof XxxSchema>;
```
Both exports always appear together. `.passthrough()` is mandatory on all protocol-level object schemas.

### Co-located Constant (not a separate file)
**Source:** `packages/protocol/src/features/payload/capabilities/bugReportsCapabilities.ts` line 27
**Apply to:** `ACK_DEBOUNCE_MS` in `socketResilience.ts`
```typescript
export const BUG_REPORT_DEFAULT_CONTEXT_WINDOW_MS = 30 * 60 * 1000;
```
Pattern: bare `export const NAME = value;` in the domain file. No `_constants.ts` file created.

### Named Re-exports with `type` Keyword
**Source:** `packages/protocol/src/index.ts` lines 420-432
**Apply to:** new `socketResilience.ts` re-export block in `index.ts`
```typescript
export { SomeSchema, type SomeType } from './someFile.js';
```
TypeScript type exports use `type` keyword inline. Module specifier always ends in `.js`.

### Vitest Test Structure
**Source:** `packages/protocol/src/changes.automation.test.ts`
**Apply to:** `socketResilience.test.ts`
```typescript
import { describe, expect, it } from 'vitest';
import { SchemaName } from './moduleFile.js';

describe('domain description', () => {
    it('accepts valid input', () => { ... });
    it('rejects invalid input', () => { ... });
});
```

---

## No Analog Found

None — all files have close analogs in the existing codebase.

---

## Metadata

**Analog search scope:** `packages/protocol/src/` (all subdirectories)
**Files scanned:** `socketRpc.ts`, `updates.ts`, `index.ts`, `bugReportsCapabilities.ts`, `index.exports.test.ts`, `changes.automation.test.ts`
**Pattern extraction date:** 2026-04-21
