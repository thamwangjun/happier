---
phase: 06-protocol-contract
reviewed: 2026-04-21T15:03:20Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - packages/protocol/src/socketResilience.ts
  - packages/protocol/src/socketResilience.test.ts
  - packages/protocol/src/updates.ackSeq.test.ts
  - packages/protocol/src/updates.ts
  - packages/protocol/src/index.ts
  - packages/protocol/src/index.exports.test.ts
  - docs/protocol.md
  - apps/server/sources/config/backends.ts
  - apps/server/sources/config/backends.spec.ts
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 06: Code Review Report

**Reviewed:** 2026-04-21T15:03:20Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

This phase introduces the v1.3 resilience protocol contract: four new Socket.IO events
(`reconnect-resume`, `ack-update`, `replay-complete`, `buffer-overflow`), an optional
`ackSeq` field on `UpdateContainerSchema`, the `ACK_DEBOUNCE_MS` constant, and two
server-side env-var helpers (`getRelayBufferCapFromEnv`, `getRelayBufferTtlMsFromEnv`).

The schema definitions and their tests are clean, the public exports are consistent with
the root `index.ts`, and the env-var parsing logic correctly falls back on bad input.

Two warnings are raised: one for missing lower-bound validation on the relay buffer
config helpers (negative or zero values are silently accepted) and one for an incomplete
`update-account` schema — the schema only requires `id` while the protocol doc lists
`settings?` and `github?` fields, which means the documented shape is unenforceable by
current consumers. Three informational items cover a passthrough risk on the new schemas,
a missing test for the zero-boundary of `AckUpdateRequestSchema.seq`, and a doc/code
drift on `VersionedNullableStringSchema` allowed by `update-session`.

---

## Warnings

### WR-01: Relay buffer config helpers accept zero and negative integers

**File:** `apps/server/sources/config/backends.ts:55-61`

**Issue:** `getRelayBufferCapFromEnv` and `getRelayBufferTtlMsFromEnv` both delegate to
`parseIntEnv` without passing `min` bounds. `parseIntEnv` accepts any finite integer,
so `RELAY_BUFFER_CAP=0` or `RELAY_BUFFER_CAP=-1` will parse successfully and produce a
buffer capacity of 0 or a negative TTL. A cap of 0 effectively disables the relay buffer
entirely without any error or log, which would silently break the resilience feature for
all clients.

**Fix:** Pass `{ min: 1 }` for cap and `{ min: 1 }` for TTL so that out-of-range values
fall back to the safe default:

```typescript
export function getRelayBufferCapFromEnv(
    env: NodeJS.ProcessEnv,
    fallback: number = RELAY_BUFFER_CAP_DEFAULT,
): number {
    return parseIntEnv(env.RELAY_BUFFER_CAP, fallback, { min: 1 });
}

export function getRelayBufferTtlMsFromEnv(
    env: NodeJS.ProcessEnv,
    fallback: number = RELAY_BUFFER_TTL_MS_DEFAULT,
): number {
    return parseIntEnv(env.RELAY_BUFFER_TTL_MS, fallback, { min: 1 });
}
```

The corresponding spec should add:

```typescript
it("returns default 500 when RELAY_BUFFER_CAP is zero", () => {
    expect(getRelayBufferCapFromEnv({ RELAY_BUFFER_CAP: "0" })).toBe(500);
});
it("returns default 500 when RELAY_BUFFER_CAP is negative", () => {
    expect(getRelayBufferCapFromEnv({ RELAY_BUFFER_CAP: "-1" })).toBe(500);
});
```

---

### WR-02: `update-account` schema does not enforce the documented `settings`/`github` shape

**File:** `packages/protocol/src/updates.ts:115-117`

**Issue:** The `update-account` discriminant only validates `id`:

```typescript
z.object({
    t: z.literal('update-account'),
    id: z.string(),
}).passthrough(),
```

The protocol doc (`docs/protocol.md`, line 97) states the body is
`{ t: "update-account", id, settings?, github? }`. If consumers rely on the Zod type
`UpdateBody` for the `update-account` variant to reason about `settings` or `github`,
they get `unknown` through passthrough rather than any type-checked fields. This is a
doc-to-schema drift: either the schema should be extended to match the doc, or the doc
should clarify the fields are server-only internals not exposed via this schema.

**Fix (option A — align schema to doc):** Add optional fields so TypeScript consumers
can use them safely:

```typescript
z.object({
    t: z.literal('update-account'),
    id: z.string(),
    settings: z.unknown().optional(),
    github:   z.unknown().optional(),
}).passthrough(),
```

**Fix (option B — align doc to schema):** Update `docs/protocol.md` line 97 to omit
`settings?` and `github?` if those fields are intentionally opaque.

---

## Info

### IN-01: `passthrough()` on resilience request schemas preserves unknown client fields server-side

**File:** `packages/protocol/src/socketResilience.ts:14-24`

**Issue:** Both `ReconnectResumeRequestSchema` and `AckUpdateRequestSchema` use
`.passthrough()`. This is intentional for forward compatibility, but it means any
additional fields sent by a malicious or buggy client pass through the parsed object
without validation. As long as the server handler only reads `sessionId`,
`lastAckedSeq`, and `seq` from the typed fields this is safe; the risk arises if
downstream code spreads the parsed object or logs it without sanitisation.

**Fix:** No code change required now, but server-side handlers that consume these
schemas should explicitly destructure only the declared fields rather than spreading
the full parsed object.

---

### IN-02: `AckUpdateRequestSchema` test suite is missing a `seq === 0` acceptance case

**File:** `packages/protocol/src/socketResilience.test.ts:71-89`

**Issue:** The `ReconnectResumeRequestSchema` suite explicitly tests `lastAckedSeq: 0`
(line 42) to confirm the zero boundary is accepted. The `AckUpdateRequestSchema` suite
starts its positive test at `seq: 42` (line 73) and only tests the negative rejection
at `seq: -1` (line 87). A `seq: 0` acceptance test is absent, leaving the zero boundary
untested for this schema.

**Fix:** Add a test case:

```typescript
it('accepts seq === 0 (initial ack)', () => {
    const result = AckUpdateRequestSchema.parse({ sessionId: 'abc', seq: 0 });
    expect(result.seq).toBe(0);
});
```

---

### IN-03: `VersionedNullableStringSchema` for `update-session` is not documented

**File:** `packages/protocol/src/updates.ts:8-11` and `docs/protocol.md:83-85`

**Issue:** The protocol doc describes `update-session.metadata` as
`{ value, version } or null`, but the `VersionedNullableStringSchema` at line 8 uses
`z.string().nullable()` for `value` — meaning `{ value: null, version: 0 }` is valid.
The doc says "or null" about the overall field, not about the `value` sub-field. This
ambiguity could mislead a client implementor reading only the doc. It is likely
intentional (a null value represents deletion/clearing of the metadata), but it is not
stated.

**Fix:** Add a one-line comment to the doc entry or to the schema:

```typescript
// value: null signals that the field was cleared server-side
const VersionedNullableStringSchema = z.object({
  value: z.string().nullable(),  // null = cleared
  version: z.number().int(),
}).passthrough();
```

---

_Reviewed: 2026-04-21T15:03:20Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
