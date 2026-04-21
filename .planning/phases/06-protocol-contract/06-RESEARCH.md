# Phase 6: Protocol Contract - Research

**Researched:** 2026-04-21
**Domain:** Shared Zod schema authoring in `packages/protocol`; Socket.IO event contract design; protocol documentation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** New `packages/protocol/src/socketResilience.ts` flat file — mirrors `socketRpc.ts` naming convention. Contains `ReconnectResumeRequestSchema`, `AckUpdateRequestSchema`, resilience event name constants, and `ACK_DEBOUNCE_MS`. Wired into `packages/protocol/src/index.ts` exports.
- **D-02:** `UpdateContainerSchema` extended with optional `ackSeq: z.number().int().min(0).optional()` field inline in the existing `packages/protocol/src/updates.ts` — not a new file, not a versioned schema, just an additive optional field on the existing object.
- **D-03:** v1.3 resilience changes documented as a new section appended to `docs/protocol.md`. No separate `PROTOCOL_CHANGES.md` file — the existing `docs/protocol.md` already catalogs all Socket.IO events and is the correct home for new event definitions.
- **D-04:** `ACK_DEBOUNCE_MS = 500` exported from `packages/protocol/src/socketResilience.ts` — the only cross-cutting timing constant that both server and mobile must agree on. Follows the `BUG_REPORT_DEFAULT_CONTEXT_WINDOW_MS` precedent in `packages/protocol`.
- **D-05:** `RELAY_BUFFER_CAP` and `RELAY_BUFFER_TTL_MS` default values (`500` and `120000`) are server-only concerns — defined inline in the server's env config module (Phase 7). They are not exported from `packages/protocol` since mobile never reads them.

### Claude's Discretion

- Event name string values for the resilience events (e.g. `'reconnect-resume'`, `'ack-update'`, `'replay-complete'`, `'buffer-overflow'`) — names are specified in REQUIREMENTS.md; collector naming in the constants object is Claude's call.
- Whether to group the event names in a `SOCKET_RESILIENCE_EVENTS` const object (mirroring `SOCKET_RPC_EVENTS`) or export individually — Claude decides based on consistency with `socketRpc.ts`.
- Exact export wiring in `index.ts` (named re-exports vs. wildcard) — follow existing pattern.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PROTO-01 | Developer can review all new Socket.IO event types in a versioned `PROTOCOL_CHANGES.md` stub to track upstream merge compatibility | D-03 locks docs in `docs/protocol.md` v1.3 section; section must enumerate all new event names, payloads, and backward-compat notes |
| PROTO-02 | Server and mobile clients share a `ReconnectResumeRequestSchema` type (`{ sessionId, lastAckedSeq }`) for the reconnect handshake | D-01 pins schema to `socketResilience.ts`; verified Zod pattern from existing `updates.ts` |
| PROTO-03 | Server and mobile clients share an `AckUpdateRequestSchema` type (`{ sessionId, seq }`) for delivery confirmation | D-01 pins schema to `socketResilience.ts`; same Zod pattern as PROTO-02 |
| PROTO-04 | `UpdateContainerSchema` carries an optional `ackSeq` field so the server can piggyback ack hints on outbound payloads | D-02 pins change to `updates.ts` inline; `.passthrough()` already present ensures backward compat |
| PROTO-05 | Relay reads `RELAY_BUFFER_CAP` and `RELAY_BUFFER_TTL_MS` from env vars with safe fallbacks; `ackDebounceMs` documented as mobile client constant in protocol doc | D-05 pins buffer constants to server (Phase 7); D-04 pins `ACK_DEBOUNCE_MS` to `socketResilience.ts`; D-03 pins documentation to `docs/protocol.md` |
</phase_requirements>

---

## Summary

Phase 6 is a pure contract phase: create `packages/protocol/src/socketResilience.ts`, extend `UpdateContainerSchema`, and append a v1.3 section to `docs/protocol.md`. No runtime behavior is introduced.

The work is tightly constrained by CONTEXT.md decisions. All implementation choices are already locked — the planner's job is to sequence three discrete tasks: (1) create `socketResilience.ts` with event constants, two Zod schemas, one derived type each, and `ACK_DEBOUNCE_MS`; (2) extend `UpdateContainerSchema` in `updates.ts` with optional `ackSeq`; (3) wire new exports into `index.ts` and append the protocol documentation section.

The existing codebase provides all necessary patterns. `socketRpc.ts` (13 lines) is the exact template for the new file. `updates.ts` shows the `.passthrough()` + `.optional()` pattern. `index.ts` shows named re-export style. `bugReportsCapabilities.ts` shows the co-located constant pattern. No new dependencies are required.

**Primary recommendation:** Mirror `socketRpc.ts` exactly for `socketResilience.ts`. Add `ackSeq` inline to the `UpdateContainerSchema` object definition (not `.extend()`). Follow the named re-export pattern in `index.ts`. Append to `docs/protocol.md` under a `## v1.3 Resilience Events` heading.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Shared event name constants | Protocol Layer (`packages/protocol`) | — | Both server and mobile import constants from protocol; no runtime tier owns them |
| ReconnectResumeRequestSchema | Protocol Layer (`packages/protocol`) | — | Zod schema is a shared contract; validation occurs at runtime in API/server and mobile tiers |
| AckUpdateRequestSchema | Protocol Layer (`packages/protocol`) | — | Same as above |
| UpdateContainerSchema extension (`ackSeq`) | Protocol Layer (`packages/protocol`) | API / Backend (server uses field) | Schema is protocol tier; server piggybacks `ackSeq` on outbound payloads in API tier (Phase 8) |
| ACK_DEBOUNCE_MS constant | Protocol Layer (`packages/protocol`) | Mobile/Web (consumes it) | Cross-cutting timing constant both sides must agree on; protocol tier is the single source of truth |
| RELAY_BUFFER_CAP / RELAY_BUFFER_TTL_MS | API / Backend (server env config, Phase 7) | — | Server-only defaults; mobile never reads them; not in protocol tier |
| Protocol documentation (`docs/protocol.md`) | Documentation (human-readable contract) | — | Serves developers and both sides; no runtime tier |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | Workspace-resolved (existing dep) | Schema declaration and runtime validation | Already used throughout `packages/protocol`; all schemas use Zod |
| TypeScript | Workspace-resolved (existing dep) | Static types via `z.infer<>` | Strict mode enforced; type inference from Zod is the project pattern |

[VERIFIED: codebase grep] — Zod is the exclusive schema library in `packages/protocol/src/`. No alternatives are in use.

### Supporting
None required for this phase — no new dependencies are added.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline `ackSeq` in `UpdateContainerSchema` object literal | `.extend({ ackSeq: ... })` | Either works with `.passthrough()`. Inline is simpler and avoids creating a new variable; CONTEXT.md allows either approach |

**Installation:** No new packages required.

---

## Architecture Patterns

### System Architecture Diagram

```
Developer opens docs/protocol.md
       |
       v
docs/protocol.md -- v1.3 section lists event names + payloads + ackDebounceMs

packages/protocol/src/socketResilience.ts
  │
  ├── SOCKET_RESILIENCE_EVENTS const object
  │     RECONNECT_RESUME: 'reconnect-resume'
  │     ACK_UPDATE:       'ack-update'
  │     REPLAY_COMPLETE:  'replay-complete'
  │     BUFFER_OVERFLOW:  'buffer-overflow'
  │
  ├── ReconnectResumeRequestSchema  →  export type ReconnectResumeRequest
  ├── AckUpdateRequestSchema        →  export type AckUpdateRequest
  └── ACK_DEBOUNCE_MS = 500

packages/protocol/src/updates.ts
  └── UpdateContainerSchema  +  ackSeq?: number (optional, int, min 0)

packages/protocol/src/index.ts
  ├── re-exports all of socketResilience.ts (named)
  └── UpdateContainerSchema already exported (no new wiring needed for updates.ts exports)

         ↓ import                    ↓ import
   apps/server (Phase 7-8)     apps/ui (Phase 9)
```

### Recommended Project Structure
```
packages/protocol/src/
├── socketResilience.ts    [NEW] — resilience event names, request schemas, ACK_DEBOUNCE_MS
├── socketRpc.ts           [EXISTING template] — mirrored pattern
├── updates.ts             [MODIFY] — add ackSeq to UpdateContainerSchema
└── index.ts               [MODIFY] — add re-exports for socketResilience.ts

docs/
└── protocol.md            [MODIFY] — append v1.3 section
```

### Pattern 1: Event Constants Object (mirror `socketRpc.ts`)

`socketRpc.ts` is 13 lines. The pattern is: one `export const SOCKET_XXX_EVENTS = { ... } as const` and one `export type SocketXxxEvent = (typeof SOCKET_XXX_EVENTS)[keyof typeof SOCKET_XXX_EVENTS]`.

[VERIFIED: codebase read of `packages/protocol/src/socketRpc.ts`]

```typescript
// Source: packages/protocol/src/socketRpc.ts (direct template)
export const SOCKET_RPC_EVENTS = {
    REGISTER: 'rpc-register',
    REGISTERED: 'rpc-registered',
    // ... etc
} as const;

export type SocketRpcEvent = (typeof SOCKET_RPC_EVENTS)[keyof typeof SOCKET_RPC_EVENTS];
```

Apply exactly the same pattern for resilience:

```typescript
// packages/protocol/src/socketResilience.ts
export const SOCKET_RESILIENCE_EVENTS = {
    RECONNECT_RESUME: 'reconnect-resume',
    ACK_UPDATE:       'ack-update',
    REPLAY_COMPLETE:  'replay-complete',
    BUFFER_OVERFLOW:  'buffer-overflow',
} as const;

export type SocketResilienceEvent = (typeof SOCKET_RESILIENCE_EVENTS)[keyof typeof SOCKET_RESILIENCE_EVENTS];
```

**Rationale for grouping in a const object:** `socketRpc.ts` uses the grouped object; consistency is the deciding criterion per Claude's Discretion.

### Pattern 2: Zod Schema + Inferred Type Export

[VERIFIED: codebase read of `packages/protocol/src/updates.ts`]

```typescript
// Standard protocol pattern
export const ReconnectResumeRequestSchema = z.object({
    sessionId: z.string(),
    lastAckedSeq: z.number().int().min(0),
}).passthrough();

export type ReconnectResumeRequest = z.infer<typeof ReconnectResumeRequestSchema>;

export const AckUpdateRequestSchema = z.object({
    sessionId: z.string(),
    seq: z.number().int().min(0),
}).passthrough();

export type AckUpdateRequest = z.infer<typeof AckUpdateRequestSchema>;
```

Note: `.passthrough()` is the convention on all protocol schemas in `updates.ts`. Apply consistently.

### Pattern 3: Co-located Constant

[VERIFIED: codebase read of `packages/protocol/src/features/payload/capabilities/bugReportsCapabilities.ts`]

```typescript
// Same file as the domain schemas — not a separate constants.ts
export const ACK_DEBOUNCE_MS = 500;
```

### Pattern 4: UpdateContainerSchema Extension

[VERIFIED: codebase read of `packages/protocol/src/updates.ts` line 238]

`UpdateContainerSchema` is defined at line 238 as a `z.object({...}).passthrough()`. The `ackSeq` field is added directly to the object literal:

```typescript
export const UpdateContainerSchema = z.object({
    id: z.string(),
    seq: z.number().int().min(0),
    createdAt: TimestampMsSchema,
    body: UpdateBodySchema,
    ackSeq: z.number().int().min(0).optional(),   // NEW — piggyback hint from server
}).passthrough();
```

Because the schema already uses `.passthrough()`, omitting `ackSeq` on the wire produces no Zod parse error. Old clients sending payloads without `ackSeq` are fully backward compatible. [VERIFIED: Zod behavior — `.optional()` fields have no default and pass if absent]

### Pattern 5: index.ts Named Re-exports

[VERIFIED: codebase read of `packages/protocol/src/index.ts` line 432]

The existing `socketRpc.ts` export block (line 432) is the exact template:

```typescript
export { SOCKET_RPC_EVENTS, type SocketRpcEvent } from './socketRpc.js';
```

New block to add:

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

Note: `UpdateContainerSchema` and `UpdateContainer` are already exported from `updates.ts` at line 461. The `ackSeq` field addition is transparent — no changes to the `updates.ts` export block are needed.

### Pattern 6: docs/protocol.md Section

[VERIFIED: codebase read of `docs/protocol.md`]

`docs/protocol.md` ends at line 203 with implementation references. The new section is appended after the existing content. Format mirrors the existing "Client -> server WebSocket events" and "Server -> client events" sections.

```markdown
## v1.3 Resilience Events (Request Resilience)

These events were added in v1.3 to support guaranteed message delivery across disconnects.

### Client → server events

#### `reconnect-resume`
Emitted by the mobile/web client on every socket reconnect. The server uses `lastAckedSeq`
to determine which buffered messages to replay.

Payload: `ReconnectResumeRequestSchema` from `@happier-dev/protocol`
```
{ sessionId: string, lastAckedSeq: number }
```

#### `ack-update`
Emitted by the client to confirm delivery of all messages up to and including `seq`.
The server discards buffer entries at or below `seq` for this client.

Payload: `AckUpdateRequestSchema` from `@happier-dev/protocol`
```
{ sessionId: string, seq: number }
```

### Server → client events

#### `replay-complete`
Emitted by the server in all reconnect paths: after the last buffered message is sent,
after `buffer-overflow` is signalled, or immediately if the buffer is empty.
This is the universal gate-release signal for the mobile outbound queue.

No payload.

#### `buffer-overflow`
Emitted during reconnect when the buffer for this client was capped (overflow occurred
before the client reconnected). The client must fall back to the HTTP catch-up path
(`resumeViaChanges`). Server still emits `replay-complete` after this event.

No payload.

### Update envelope change

The existing `update` event envelope (`UpdateContainerSchema`) gains an optional field:
- `ackSeq?: number` — server-side ack hint piggybacked on outbound payloads. Clients
  that omit or ignore this field are fully backward compatible.

### Client constants

| Constant | Value | Location | Description |
|----------|-------|----------|-------------|
| `ACK_DEBOUNCE_MS` | 500ms | `@happier-dev/protocol` | Debounce window before the mobile client emits `ack-update`. Both sides must use this value. |

### Upstream compatibility notes
- All four new events (`reconnect-resume`, `ack-update`, `replay-complete`, `buffer-overflow`)
  are additive. Servers without v1.3 will not emit or handle these events; clients that emit
  `reconnect-resume` to a pre-v1.3 server receive no replay and no error.
- `ackSeq` on `UpdateContainerSchema` is optional. Pre-v1.3 clients that omit `ackSeq` on
  outbound messages receive no TypeScript or Zod error.
```

### Anti-Patterns to Avoid

- **Separate PROTOCOL_CHANGES.md file:** User decision D-03 locks documentation in `docs/protocol.md`. Do not create a separate file.
- **Exporting buffer constants from `packages/protocol`:** D-05 explicitly excludes `RELAY_BUFFER_CAP` and `RELAY_BUFFER_TTL_MS` from the protocol package. They are server-only.
- **Using `.extend()` to add `ackSeq`:** Either approach works, but D-02 says "inline in the existing schema" — place `ackSeq` directly in the `z.object({...})` call, not chained via `.extend()`.
- **Wildcard re-exports in index.ts:** The project uses named re-exports throughout `index.ts`. Do not use `export * from './socketResilience.js'` — enumerate each export explicitly.
- **Creating a separate `_constants.ts` barrel:** The constant `ACK_DEBOUNCE_MS` lives co-located in `socketResilience.ts`, not in a separate constants file. Only `_constants.ts`, `_types.ts`, `_shared.ts` are allowed barrel names, and only inside module-ish directories.

---

## Solved Problems

| Problem | Build Nothing — Use Instead | Why |
|---------|-----------------------------|-----|
| Schema validation at runtime | `zod` (already in `packages/protocol`) | Consistent with all existing schemas; consumers already use Zod parse/safeParse |
| TypeScript type generation | `z.infer<typeof Schema>` | Idiomatic Zod pattern used throughout the package |
| Backward-compatible optional field | `z.number().int().min(0).optional()` + `.passthrough()` | `.passthrough()` already on `UpdateContainerSchema`; no extra work needed |

---

## Common Pitfalls

### Pitfall 1: Missing `.js` extension in import paths

**What goes wrong:** TypeScript in this monorepo uses ESM with `"module": "NodeNext"` or similar. Import paths in source files must include `.js` extensions even though the files are `.ts`.

**Root cause:** The `index.ts` file uses `.js` extensions on every import line (e.g., `from './socketRpc.js'`).

**Prevention:** Always add `.js` to the module specifier when importing from new files in `packages/protocol/src/`.

**Warning signs:** TypeScript "cannot find module" error at build time.

### Pitfall 2: Omitting `.passthrough()` on new schemas

**What goes wrong:** Zod schemas without `.passthrough()` strip unknown fields on parse. If a server or mobile version ever sends extra fields (e.g., during a gradual rollout), those fields are silently dropped.

**Root cause:** Project convention is `.passthrough()` on all protocol schemas (verified in `updates.ts`).

**Prevention:** Add `.passthrough()` to both `ReconnectResumeRequestSchema` and `AckUpdateRequestSchema`.

### Pitfall 3: Forgetting to export the inferred TypeScript type

**What goes wrong:** Consumers can import the Zod schema for runtime validation but cannot import the TypeScript type for static analysis.

**Root cause:** The pattern requires two exports per schema: the Zod schema (`XxxSchema`) and the inferred type (`type Xxx = z.infer<typeof XxxSchema>`).

**Prevention:** Follow the exact pattern in `updates.ts` — every schema has a co-located `export type` line.

### Pitfall 4: index.ts re-export forgetting `type` keyword for types

**What goes wrong:** TypeScript in strict mode may complain about re-exporting types without the `type` keyword in `export { ... }` blocks.

**Root cause:** The project uses `export { type Foo }` for type-only exports (see line 432 and many others in `index.ts`).

**Prevention:** In the `index.ts` re-export block, prefix type names with `type`: `export { AckUpdateRequestSchema, type AckUpdateRequest, ... }`.

---

## Code Examples

Verified patterns from official sources (codebase-verified).

### Complete `socketResilience.ts` structure

```typescript
// Source: mirrors packages/protocol/src/socketRpc.ts (verified)
import { z } from 'zod';

export const SOCKET_RESILIENCE_EVENTS = {
    RECONNECT_RESUME: 'reconnect-resume',
    ACK_UPDATE:       'ack-update',
    REPLAY_COMPLETE:  'replay-complete',
    BUFFER_OVERFLOW:  'buffer-overflow',
} as const;

export type SocketResilienceEvent = (typeof SOCKET_RESILIENCE_EVENTS)[keyof typeof SOCKET_RESILIENCE_EVENTS];

export const ACK_DEBOUNCE_MS = 500;

export const ReconnectResumeRequestSchema = z.object({
    sessionId: z.string(),
    lastAckedSeq: z.number().int().min(0),
}).passthrough();

export type ReconnectResumeRequest = z.infer<typeof ReconnectResumeRequestSchema>;

export const AckUpdateRequestSchema = z.object({
    sessionId: z.string(),
    seq: z.number().int().min(0),
}).passthrough();

export type AckUpdateRequest = z.infer<typeof AckUpdateRequestSchema>;
```

### `updates.ts` change (UpdateContainerSchema)

```typescript
// Source: packages/protocol/src/updates.ts line 238 (verified)
// BEFORE:
export const UpdateContainerSchema = z.object({
    id: z.string(),
    seq: z.number().int().min(0),
    createdAt: TimestampMsSchema,
    body: UpdateBodySchema,
}).passthrough();

// AFTER: add ackSeq field
export const UpdateContainerSchema = z.object({
    id: z.string(),
    seq: z.number().int().min(0),
    createdAt: TimestampMsSchema,
    body: UpdateBodySchema,
    ackSeq: z.number().int().min(0).optional(),
}).passthrough();
```

### `index.ts` re-export block

```typescript
// Source: mirrors line 432 pattern in packages/protocol/src/index.ts (verified)
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

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No delivery guarantee on socket events | Application-level buffer + sequence numbers | v1.3 (this milestone) | Requires new shared schemas — the purpose of this phase |

**No deprecated patterns apply** to this phase — it is pure schema authoring with no runtime changes.

---

## Open Questions (RESOLVED)

1. **Should `ReconnectResumeRequestSchema` and `AckUpdateRequestSchema` use `.passthrough()`?**
   - What we know: All existing protocol schemas in `updates.ts` use `.passthrough()`.
   - What is unclear: The CONTEXT.md does not explicitly call out `.passthrough()` for the new schemas.
   - Recommendation: Apply `.passthrough()` consistently with the existing pattern. Risk of omitting is low (these are request schemas, not stored objects), but consistency is the safer choice.
   - **RESOLVED:** Apply `.passthrough()` per project convention (verified in `updates.ts`). Plans implement this.

2. **Should `replay-complete` and `buffer-overflow` have payload schemas?**
   - What we know: REQUIREMENTS.md says `replay-complete` has no separate payload beyond the event name. `buffer-overflow` may carry `retentionStart` context (SRVR-10).
   - What is unclear: SRVR-10 says the `retentionStart` field is "sent before any replay messages" — it may be part of the `reconnect-resume` response, not a separate event payload.
   - Recommendation: Phase 6 documents that `replay-complete` and `buffer-overflow` currently carry no payload. Phase 8 can extend them if SRVR-10 requires a payload schema. Defer server-response schemas to Phase 8 where the server-side handler is implemented.
   - **RESOLVED:** No payload schemas for `replay-complete` or `buffer-overflow` in Phase 6. Deferred to Phase 8 if SRVR-10 requires it. Plans implement this.

---

## Environment Availability

Step 2.6: SKIPPED — this phase is purely code/schema changes with no external dependencies.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (workspace root config) |
| Config file | `vitest.config.ts` at monorepo root |
| Quick run command | `cd packages/protocol && node ../../node_modules/vitest/vitest.mjs run --config ../../vitest.config.ts` |
| Full suite command | `cd packages/protocol && node ../../node_modules/vitest/vitest.mjs run --config ../../vitest.config.ts` |

[VERIFIED: `packages/protocol/package.json` test script; `vitest.config.ts` at root]

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROTO-02 | `ReconnectResumeRequestSchema` parses `{ sessionId, lastAckedSeq }` and rejects missing fields | unit | `node ../../node_modules/vitest/vitest.mjs run --config ../../vitest.config.ts packages/protocol/src/socketResilience.test.ts` | No — Wave 0 |
| PROTO-03 | `AckUpdateRequestSchema` parses `{ sessionId, seq }` and rejects missing fields | unit | same file | No — Wave 0 |
| PROTO-04 | `UpdateContainerSchema` accepts payload with `ackSeq` present and with `ackSeq` absent | unit | `node ../../node_modules/vitest/vitest.mjs run --config ../../vitest.config.ts packages/protocol/src/updates.ackSeq.test.ts` (or extend existing) | No — Wave 0 |
| PROTO-01, PROTO-05 | Documentation section exists in `docs/protocol.md` with all events, `ackDebounceMs` constant | manual review | n/a — content review | No |

**Note on PROTO-01 / PROTO-05:** These are documentation requirements (content review) rather than automated test targets. The planner should add a verification step that confirms the documentation section is present and accurate.

### Sampling Rate

- **Per task commit:** `cd packages/protocol && node ../../node_modules/vitest/vitest.mjs run --config ../../vitest.config.ts`
- **Per wave merge:** same (single-wave phase)
- **Phase gate:** Full protocol test suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `packages/protocol/src/socketResilience.test.ts` — covers PROTO-02, PROTO-03 (schema parse + rejection)
- [ ] `packages/protocol/src/updates.ackSeq.test.ts` (or extend `index.exports.test.ts`) — covers PROTO-04 backward compat

*(Existing `index.exports.test.ts` could be extended; a dedicated test file per the PROTO-04 pattern is also acceptable.)*

---

## Security Domain

This phase introduces no authentication, session management, access control, cryptographic, or input-from-untrusted-sources concerns. The Zod schemas define the wire format for internal client-to-server events; validation and access control enforcement occur in Phases 7-8 at the server socket handler level.

ASVS V5 (Input Validation) is technically applicable — Zod schemas constitute the validation layer. The schemas use `.int().min(0)` constraints on numeric fields, which is the correct defensive floor. No additional security work is required in this phase.

---

## Sources

### Primary (HIGH confidence)
- [VERIFIED: codebase read] `packages/protocol/src/socketRpc.ts` — template for `SOCKET_RESILIENCE_EVENTS` const object and `SocketRpcEvent` type pattern
- [VERIFIED: codebase read] `packages/protocol/src/updates.ts` lines 238-245 — `UpdateContainerSchema` definition and `.passthrough()` convention
- [VERIFIED: codebase read] `packages/protocol/src/index.ts` line 432 — named re-export pattern for `socketRpc.ts`
- [VERIFIED: codebase read] `packages/protocol/src/features/payload/capabilities/bugReportsCapabilities.ts` line 27 — co-located constant pattern (`BUG_REPORT_DEFAULT_CONTEXT_WINDOW_MS`)
- [VERIFIED: codebase read] `docs/protocol.md` — existing protocol doc structure to extend
- [VERIFIED: codebase read] `.planning/codebase/CONVENTIONS.md` — naming and export conventions
- [VERIFIED: codebase read] `.planning/codebase/ARCHITECTURE.md` — protocol package role and consumers
- [VERIFIED: codebase read] `packages/protocol/package.json` — test command
- [VERIFIED: codebase read] `vitest.config.ts` — test framework and exclude patterns

### Secondary (MEDIUM confidence)
None — all findings are directly codebase-verified.

### Flagged for Validation (LOW confidence)
None.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `replay-complete` and `buffer-overflow` carry no payload in Phase 6 (payload schema deferred to Phase 8 if SRVR-10 requires it) | Open Questions | If Phase 8 requires `buffer-overflow` to carry `retentionStart`, the schema may need updating in Phase 8 — low risk since the field would be additive |

**All other claims in this research were verified via codebase inspection.**

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Zod already in use; no new dependencies; verified from codebase
- Architecture: HIGH — all patterns verified from live source files
- Pitfalls: HIGH — derived from direct codebase inspection (ESM `.js` convention, `.passthrough()` convention, `type` keyword in re-exports)

**Research date:** 2026-04-21
**Valid until:** This research is based on codebase state as of 2026-04-21. Valid indefinitely as long as `socketRpc.ts`, `updates.ts`, and `index.ts` patterns are not refactored.
